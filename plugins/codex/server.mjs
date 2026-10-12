#!/usr/bin/env node
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { inspectConnection, activateConnection, callConnection } from '../../integration/connection/client.mjs';
import { getGuide, scenarios } from '../../expert/core/guide.mjs';

const INPUT = 1048576, OUTPUT = 8388608;
const prefix = 'evopilot_v01_';
const object = (properties = {}, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const slug = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,63}$' };
const scope = object({ visibility: { enum: ['public', 'private'] }, projectId: slug });
const revision = { type: 'integer', minimum: 0 };
const envelope = object({ operation: { type: 'string', minLength: 1, maxLength: 128 }, scope, input: { type: 'object' }, requestId: slug, expectedRevision: revision }, ['operation', 'scope', 'input']);
const args = object({ scope, id: slug, requestId: slug, expectedRevision: revision });
const definitions = {
  inspect: ['Inspect this session and passive authenticated connection identity.', object()],
  activate: ['Explicitly activate this session; start or reuse the verified shared connection.', object()],
  deactivate: ['Deactivate only this session; keep the shared connection running.', object()],
  guide: ['Read a scenario guide without activating or accessing product state.', object({ scenario: { enum: scenarios } })],
  request: ['Forward one exact owning product envelope; await classification start/reanalyze.', object({ owner: { enum: ['runtime', 'harness', 'ontology'] }, envelope })],
  dispatch: ['Dispatch one explicitly approved Runtime run without retry.', object({ args })],
  reconcile: ['Read retained provider evidence through Runtime reconciliation, without redispatch.', object({ args })],
  capabilities: ['Read actual composition capabilities after session activation.', object()],
};
const tools = Object.entries(definitions).map(([name, [description, inputSchema]]) => ({ name: prefix + name, description, inputSchema }));
function validate(value, schema, depth = 0) {
  if (depth > 64) throw Error('SCHEMA');
  if (schema.enum && !schema.enum.includes(value)) throw Error('SCHEMA');
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('SCHEMA');
    if (schema.properties) {
      if (schema.required.some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(k => !Object.hasOwn(schema.properties, k))) throw Error('SCHEMA');
      for (const k of Object.keys(value)) validate(value[k], schema.properties[k], depth + 1);
    }
  }
  if (schema.type === 'string' && (typeof value !== 'string' || value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity) || (schema.pattern && !new RegExp(schema.pattern).test(value)))) throw Error('SCHEMA');
  if (schema.type === 'integer' && (!Number.isSafeInteger(value) || value < schema.minimum)) throw Error('SCHEMA');
}
function finiteJSON(value, depth = 0) {
  if (depth > 64 || (typeof value === 'number' && !Number.isFinite(value))) throw Error('SCHEMA');
  if (value && typeof value === 'object') for (const v of Object.values(value)) finiteJSON(v, depth + 1);
}
const safeCodes = new Set(['UNKNOWN', 'INACTIVE', 'SESSION_INACTIVE', 'NOT_READY', 'STARTUP_TIMEOUT', 'STARTUP_FAILED', 'SPAWN_FAILED', 'CONTROL_INVALID', 'IDENTITY_MISMATCH', 'INSTALLATION_DIGEST', 'CONFIG_VERSION', 'PATH', 'SYMLINK', 'UNSAFE_FILE', 'INVALID_REQUEST', 'LIMIT', 'NOT_FOUND', 'REVISION_CONFLICT', 'REQUEST_CONFLICT', 'APPROVAL_REQUIRED', 'REVIEW_REQUIRED', 'REVIEW_MISMATCH', 'PENDING_MODEL', 'INVALID_MODEL', 'SCOPE_MISMATCH', 'IMMUTABLE_VERSION', 'UNSUPPORTED_DEPENDENCY', 'CLASSIFICATION_PROVIDER_UNAVAILABLE', 'CLASSIFICATION_SOURCE_UNAVAILABLE', 'CLASSIFICATION_UNRESOLVED', 'PROVIDER_UNAVAILABLE']);
const argv = process.argv.slice(2);
if (argv.length !== 2 || argv[0] !== '--config' || !path.isAbsolute(argv[1]) || path.normalize(argv[1]) !== argv[1] || !argv[1].endsWith('.json')) {
  process.stderr.write('Invalid adapter configuration argument\n'); process.exitCode = 2;
} else {
  await serve(argv[1]);
}
async function serve(configPath) {
  const sessionId = randomUUID();
  let initialized = false, sessionActive = false, connection = null;
  const identity = () => ({ namespace: 'evopilot_v01_preview', sessionId, pid: process.pid, sessionActive, connection, authority: false });
  const receipt = (result, error) => {
    const data = { ...identity(), ...(error ? { error } : { result }) };
    return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, ...(error ? { isError: true } : {}) };
  };
  const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  async function write(value) {
    let bytes;
    try { bytes = JSON.stringify(value); } catch { bytes = ''; }
    if (!bytes || Buffer.byteLength(bytes) > OUTPUT) {
      const data = receipt(undefined, { code: 'LIMIT', correlation: value.result?.structuredContent?.correlation ?? null });
      bytes = JSON.stringify({ jsonrpc: '2.0', id: value.id ?? null, result: data });
    }
    await new Promise((resolve, reject) => process.stdout.write(bytes + '\n', error => error ? reject(error) : resolve()));
  }
  async function handle(line) {
    let r;
    try { r = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)); }
    catch { await write(rpcError(null, -32700, 'Parse error')); return; }
    const validId = id => typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));
    const hasId = r && Object.hasOwn(r, 'id');
    const notification = r && !Array.isArray(r) && r.jsonrpc === '2.0' && typeof r.method === 'string' && !hasId;
    if (!r || Array.isArray(r) || typeof r !== 'object' || r.jsonrpc !== '2.0' || typeof r.method !== 'string' || (hasId && !validId(r.id)) || Object.keys(r).some(k => !['jsonrpc','id','method','params'].includes(k))) {
      if (!notification) await write(rpcError(null, -32600, 'Invalid Request'));
      return;
    }
    // Notifications never trigger tools or initialization, and never receive a response.
    if (notification) return;
    const error = (code, message) => write(rpcError(r.id, code, message));
    try { finiteJSON(r); } catch { await error(-32602, 'Invalid params'); return; }
    if (!initialized && !['initialize', 'ping'].includes(r.method)) { await error(-32002, 'Not initialized'); return; }
    // Metadata is bounded transport data, never business input or response data.
    const params = r.params;
    if (params !== undefined && (!params || typeof params !== 'object' || Array.isArray(params))) { await error(-32602, 'Invalid params'); return; }
    if (params && Object.hasOwn(params, '_meta')) {
      const meta = params._meta;
      if (!meta || typeof meta !== 'object' || Array.isArray(meta) ||
          (Object.hasOwn(meta, 'progressToken') && typeof meta.progressToken !== 'string' && typeof meta.progressToken !== 'number')) {
        await error(-32602, 'Invalid params'); return;
      }
    }
    let result;
    if (r.method === 'initialize') {
      const p = r.params;
      if (initialized || !p || Object.keys(p).some(k => !['protocolVersion', 'capabilities', 'clientInfo', '_meta'].includes(k)) || typeof p.protocolVersion !== 'string' || !p.capabilities || typeof p.capabilities !== 'object' || Array.isArray(p.capabilities) || !p.clientInfo || typeof p.clientInfo.name !== 'string' || typeof p.clientInfo.version !== 'string') { await error(-32602, 'Invalid params'); return; }
      initialized = true;
      result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'evopilot-v01-preview', version: '0.1.0' } };
    } else if (r.method === 'ping' || r.method === 'tools/list') {
      if (params && (Object.keys(params).some(k => !['_meta', ...(r.method === 'tools/list' ? ['cursor'] : [])].includes(k)) || (Object.hasOwn(params, 'cursor') && (typeof params.cursor !== 'string' || params.cursor !== '')))) { await error(-32602, 'Invalid params'); return; }
      result = r.method === 'ping' ? {} : { tools };
    } else if (r.method === 'tools/call') {
      const p = r.params, def = tools.find(t => t.name === p?.name);
      if (!def || !p || Object.keys(p).some(k => !['name', 'arguments', '_meta'].includes(k))) { await error(-32602, 'Invalid params'); return; }
      const input = p.arguments ?? {};
      try { validate(input, def.inputSchema); } catch { await error(-32602, 'Invalid params'); return; }
      const action = p.name.slice(prefix.length);
      const source = input.envelope ?? input.args;
      const correlation = source ? Object.fromEntries(['requestId', 'scope', 'expectedRevision', 'operation', 'id'].filter(k => Object.hasOwn(source, k)).map(k => [k, source[k]])) : null;
      try {
        let value;
        if (action === 'guide') value = getGuide(input.scenario);
        else if (action === 'deactivate') { sessionActive = false; value = { deactivated: true }; }
        else if (action === 'inspect') { connection = await inspectConnection(configPath); value = { inspected: true }; }
        else if (action === 'activate') {
          if (!sessionActive) {
            const ready = await activateConnection(configPath);
            if (ready?.active !== true || !ready.identity || !Number.isSafeInteger(ready.pid)) throw Object.assign(Error(), { code: 'NOT_READY' });
            connection = ready; sessionActive = true;
          }
          value = { activated: true };
        } else {
          if (!sessionActive) throw Object.assign(Error(), { code: 'SESSION_INACTIVE' });
          value = await callConnection(configPath, action, input);
        }
        result = receipt(value);
        result.structuredContent.correlation = correlation;
        result.content[0].text = JSON.stringify(result.structuredContent);
      } catch (e) {
        result = receipt(undefined, { code: safeCodes.has(e.code) ? e.code : 'CONNECTION_ERROR', correlation });
      }
    } else { await error(-32601, 'Method not found'); return; }
    await write({ jsonrpc: '2.0', id: r.id, result });
  }
  // One in-flight request, no application queue. Backpressure bounds both streams.
  let parts = [], size = 0, dropping = false;
  try {
    for await (const chunk of process.stdin) {
      let start = 0;
      while (start < chunk.length) {
        const newline = chunk.indexOf(10, start), end = newline < 0 ? chunk.length : newline;
        const part = chunk.subarray(start, end);
        if (!dropping) {
          size += part.length;
          if (size > INPUT) { dropping = true; parts = []; size = 0; }
          else parts.push(part);
        }
        if (newline < 0) break;
        if (dropping) await write(rpcError(null, -32600, 'Input limit exceeded'));
        else await handle(Buffer.concat(parts, size));
        parts = []; size = 0; dropping = false; start = newline + 1;
      }
    }
    if (dropping) await write(rpcError(null, -32600, 'Input limit exceeded'));
    else if (size) await handle(Buffer.concat(parts, size));
  } catch {
    process.stderr.write('Adapter transport closed\n'); process.exitCode = 1;
  }
  // EOF never closes or stops the shared daemon.
}
