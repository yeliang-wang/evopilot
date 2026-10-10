import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { z } from 'zod';
import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createConnection } from './service.mjs';

const SETUP_TOOLS = new Set([
  'evopilot_runtime_readiness_inspect', 'evopilot_llm_setup_protocol',
  'evopilot_llm_provider_discover', 'evopilot_llm_profile_list',
  'evopilot_llm_profile_inspect', 'evopilot_llm_profile_upsert',
  'evopilot_llm_profile_preflight', 'evopilot_workspace_llm_default_bind',
  'evopilot_runtime_readiness_repair'
]);
const TIMEOUT = 60000;
const failure = code => ({ isError: true, content: [{ type: 'text', text: code }], structuredContent: { code } });
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
function bounded(operation) {
  let timer;
  return Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('ADAPTER_TIMEOUT')), TIMEOUT);
  })]).finally(() => clearTimeout(timer));
}
function scrub(value, token) {
  // Redact JSON string values and keys without corrupting JSON syntax or escape sequences.
  if (typeof value === 'string') return token ? value.split(token).join('[REDACTED]') : value;
  if (Array.isArray(value)) return value.map(item => scrub(item, token));
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [scrub(key, token), scrub(item, token)]));
  return value;
}
export async function officialAdapter(env, onLost) {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve('@evopilot/adapter-mcp/package.json');
  const pkg = JSON.parse(await readFile(manifest, 'utf8'));
  if (pkg.name !== '@evopilot/adapter-mcp' || pkg.version !== '6.3.3') throw new Error('INVALID_ADAPTER');
  const root = await realpath(path.dirname(manifest));
  const entry = path.join(root, 'dist', 'stdio.js');
  if (await realpath(entry) !== entry) throw new Error('INVALID_ADAPTER');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry],
    env: Object.fromEntries(['PATH', 'EVOPILOT_SERVER', 'EVOPILOT_API_TOKEN',
      'EVOPILOT_TENANT', 'EVOPILOT_WORKSPACE', 'EVOPILOT_ACTOR'].map(key => [key, env[key]])), stderr: 'ignore' });
  const client = new Client({ name: '@evopilot/codex-plugin', version: '0.1.0' });
  client.onclose = onLost;
  client.onerror = onLost;
  try { await bounded(() => client.connect(transport)); }
  catch { await bounded(() => client.close()).catch(() => {});
    await bounded(() => transport.close()).catch(() => {}); throw new Error('ADAPTER_CONNECT_FAILED'); }
  return { client, close: () => client.close() };
}

// A module-only seam for controlled routing unit tests; never an MCP parameter.
export function createWorkflowHandlers(connection, openAdapter = officialAdapter) {
  let child;
  let catalog;
  let starting;
  let active = false;
  let lost = false;
  let closed = false;
  let epoch = 0;
  let token;
  async function closeChild() {
    epoch++;
    const owned = child;
    child = undefined;
    catalog = undefined;
    if (owned) await bounded(() => owned.close()).catch(() => {});
  }
  async function getCatalog() {
    const tools = [];
    const cursors = new Set();
    let cursor;
    do {
      const page = await bounded(() => child.client.listTools(cursor ? { cursor } : {},
        { timeout: TIMEOUT, maxTotalTimeout: TIMEOUT, resetTimeoutOnProgress: false }));
      if (!Array.isArray(page.tools)) throw new Error('INVALID_CATALOG');
      tools.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor && (typeof cursor !== 'string' || cursors.has(cursor))) throw new Error('INVALID_CATALOG');
      if (cursor) cursors.add(cursor);
      if (tools.length > 4096 || cursors.size > 64) throw new Error('INVALID_CATALOG');
    } while (cursor);
    const names = new Set();
    for (const tool of tools) {
      if (typeof tool.name !== 'string' || !tool.inputSchema || names.has(tool.name)) throw new Error('INVALID_CATALOG');
      names.add(tool.name);
    }
    catalog = tools;
    return tools;
  }
  async function guarded(callback) {
    if (!active) return failure('ACTIVATION_REQUIRED');
    if (closed || lost || !child) return failure('EXPLICIT_START_REQUIRED');
    try {
      return await connection.withRuntime(async (env, status) => {
        token = env.EVOPILOT_API_TOKEN;
        if (closed || lost || !child) return failure('EXPLICIT_START_REQUIRED');
        return scrub(await callback(status), token);
      });
    } catch { return failure('RUNTIME_UNAVAILABLE'); }
  }
  const handlers = {
    start() {
      if (starting) return starting;
      if (closed) return Promise.resolve(failure('BRIDGE_CLOSED'));
      active = true;
      starting = (async () => {
        const status = await connection.start();
        if (status.processState !== 'RUNNING' || !['READY', 'SETUP_REQUIRED'].includes(status.readinessState)) {
          await closeChild();
          return result(status);
        }
        try {
          return await connection.withRuntime(async (env, liveStatus) => {
            token = env.EVOPILOT_API_TOKEN;
            if (lost) await closeChild();
            if (closed) return failure('BRIDGE_CLOSED');
            if (!child) {
              lost = false;
              const generation = ++epoch;
              const opened = await openAdapter(env, () => { if (epoch === generation) lost = true; });
              if (closed || generation !== epoch || lost) {
                await opened.close().catch(() => {});
                return failure('ADAPTER_UNAVAILABLE');
              }
              child = opened;
            }
            try { await bounded(getCatalog); }
            catch { lost = true; await closeChild(); return failure('ADAPTER_UNAVAILABLE'); }
            return result(scrub(liveStatus, token));
          });
        } catch { lost = true; await closeChild(); return failure('ADAPTER_UNAVAILABLE'); }
      })().catch(() => failure('RUNTIME_UNAVAILABLE')).finally(() => { starting = undefined; });
      return starting;
    },
    async status() {
      try { return result(scrub(await connection.status(), token)); }
      catch { return failure('RUNTIME_UNAVAILABLE'); }
    },
    tools() {
      return guarded(async () => {
        try { return result({ tools: await bounded(getCatalog) }); }
        catch { lost = true; await closeChild(); return failure('ADAPTER_UNAVAILABLE'); }
      });
    },
    async call(input) {
      if (!input || typeof input !== 'object' || typeof input.name !== 'string' ||
        !input.arguments || typeof input.arguments !== 'object' || Array.isArray(input.arguments) ||
        Object.keys(input).some(key => key !== 'name' && key !== 'arguments')) return failure('INVALID_ARGUMENTS');
      if (Object.hasOwn(input.arguments, 'serverUrl')) return failure('SERVER_OVERRIDE_FORBIDDEN');
      return guarded(async status => {
        const tool = catalog?.find(item => item.name === input.name);
        if (!tool) return failure('UNKNOWN_TOOL');
        if (status.readinessState !== 'READY' &&
          !(status.readinessState === 'SETUP_REQUIRED' && SETUP_TOOLS.has(input.name))) return failure('SETUP_REQUIRED');
        try {
          // Once dispatched there is exactly one attempt, regardless of transport outcome.
          const reply = await bounded(() => child.client.callTool(input, undefined,
            { timeout: TIMEOUT, maxTotalTimeout: TIMEOUT, resetTimeoutOnProgress: false }));
          if (reply.isError === true && reply.structuredContent?.status === 0) {
            lost = true;
            await closeChild();
            const code = tool.annotations?.readOnlyHint === true ? 'ADAPTER_UNAVAILABLE' : 'UNKNOWN_OUTCOME_NO_REPLAY';
            return { ...failure(code), structuredContent: { code, ownerResult: reply } };
          }
          return reply;
        } catch {
          lost = true;
          await closeChild();
          return failure(tool.annotations?.readOnlyHint === true ? 'ADAPTER_UNAVAILABLE' : 'UNKNOWN_OUTCOME_NO_REPLAY');
        }
      });
    },
    async close() { closed = true; await closeChild(); }
  };
  return Object.freeze(handlers);
}

export function createPluginServer(registrationPath) {
  const server = new McpServer({ name: '@evopilot/codex-plugin', version: '0.1.0' });
  const handlers = createWorkflowHandlers(createConnection(registrationPath));
  server.registerTool('evopilot_workflow_start', { description: 'Explicitly activate the registered local Runtime connection.', inputSchema: z.object({}).strict() }, () => handlers.start());
  server.registerTool('evopilot_workflow_status', { description: 'Inspect connection state without activating or starting the Runtime.', inputSchema: z.object({}).strict() }, () => handlers.status());
  server.registerTool('evopilot_workflow_tools', { description: 'Discover the official supported tool catalog after activation.', inputSchema: z.object({}).strict() }, () => handlers.tools());
  server.registerTool('evopilot_workflow_call', {
    description: 'Forward one official tool request; owner authorization remains authoritative.',
    inputSchema: z.object({ name: z.string().min(1), arguments: z.record(z.string(), z.unknown()) }).strict()
  }, input => handlers.call(input));
  const close = server.close.bind(server);
  server.close = async () => { await handlers.close(); await close(); };
  server.server.onclose = () => { void handlers.close(); };
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) { process.stderr.write('REGISTRATION_ARGUMENT_REQUIRED\n'); process.exitCode = 1; }
  else {
    let handle;
    let closing;
    const close = () => (closing ??= Promise.resolve().then(() => handle?.close()).catch(() => {
      process.stderr.write('BRIDGE_FAILED\n'); process.exitCode = 1;
    }));
    process.stdin.once('end', close);
    process.stdin.once('error', close);
    try {
      // The SDK owns each connection-scoped instance and its transport.
      // Creating/listing a server does not activate the Runtime connection.
      handle = serveStdio(() => createPluginServer(process.argv[2]), {
        onerror: () => { process.stderr.write('BRIDGE_FAILED\n'); }
      });
    } catch { process.stderr.write('BRIDGE_FAILED\n'); await close(); process.exitCode = 1; }
  }
}
