import test from 'node:test';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, writeFile, chmod, symlink, link, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateRegistration, createConnection } from '../src/service.mjs';
import { createPluginServer, createWorkflowHandlers } from '../src/bridge.mjs';
import { parseArguments, listsPermitRegistration } from '../install.mjs';

// Injected observations below are units, not Desktop, launchd, or owner acceptance proof.
const hash = text => createHash('sha256').update(text).digest('hex');
function fixture() {
  const files = new Map();
  const reg = { schema: 'evopilot-codex-plugin-registration/v1', platform: 'darwin',
    arch: 'arm64', runtimeVersion: '6.3.3', serviceLabel: 'dev.evopilot',
    cliConfigPath: '/bound/config.json', tenantId: 'tenant', workspaceId: 'workspace' };
  for (const kind of ['plist', 'node', 'launcher', 'runtimePackage']) {
    reg[`${kind}Path`] = `/bound/${kind}`;
    const text = kind === 'runtimePackage' ? JSON.stringify({ name: '@evopilot/server', version: '6.3.3' }) : kind;
    files.set(reg[`${kind}Path`], text);
    reg[`${kind}Sha256`] = hash(text);
  }
  files.set('/bound/registration.json', JSON.stringify(reg));
  files.set(reg.cliConfigPath, JSON.stringify({ server: 'http://127.0.0.1:3000', token: 'unit-secret',
    tenant: 'tenant', workspace: 'workspace', actor: 'unit' }));
  const calls = [];
  const state = { running: true, missing: false, readiness: 'READY', pid: 123 };
  const io = { platform: 'darwin', arch: 'arm64',
    async readFile(filename) { const text = files.get(filename); assert.ok(text); return { text, hash: hash(text) }; },
    async command(program, args) {
      calls.push([program, ...args]);
      if (program === '/usr/bin/plutil') return { code: 0, text: JSON.stringify({ Label: reg.serviceLabel, ProgramArguments: [reg.nodePath, reg.launcherPath] }) };
      if (program === '/usr/sbin/lsof') return { code: 0, text: `p${state.pid}\nn127.0.0.1:3000\n` };
      assert.equal(program, '/bin/launchctl');
      if (args[0] === 'kickstart') { assert.equal(args.length, 2); state.running = true; return { code: 0, text: '' }; }
      assert.equal(args[0], 'print');
      return state.missing ? { code: 113, text: 'Could not find service' } : { code: 0, text: state.running ? '\tpid = 123\n' : '' };
    },
    async response(server, endpoint, headers) {
      assert.equal(server, 'http://127.0.0.1:3000/');
      assert.deepEqual(headers, { Authorization: 'Bearer unit-secret',
        'x-evopilot-tenant': 'tenant', 'x-evopilot-workspace': 'workspace', 'x-evopilot-actor': 'unit' });
      if (endpoint === '/api/v1/version') return { data: { productVersion: '6.3.3' } };
      assert.equal(endpoint, '/api/v1/runtime-readiness');
      return { data: { tenantId: 'tenant', workspaceId: 'workspace', state: state.readiness } };
    }
  };
  return { reg, files, state, calls, io, connection: createConnection('/bound/registration.json', io) };
}

test('unit: imports, construction and inactive status have no IO; activation is required', async () => {
  const connection = createConnection('/not/read', { readFile() { assert.fail('inactive read'); }, command() { assert.fail('inactive launch'); } });
  assert.equal((await connection.status()).code, 'INACTIVE');
  await assert.rejects(connection.withRuntime(() => assert.fail('callback')), /ACTIVATION_REQUIRED/);
  const server = createPluginServer('/not/read');
  await server.close();
});

test('unit: registration rejects unknown, missing, unnormalised paths, names, hashes and products', () => {
  const { reg } = fixture();
  assert.deepEqual(validateRegistration(reg), reg);
  for (const patch of [{ extra: true }, { schema: 'other' }, { runtimeVersion: '6.3.2' },
    { platform: 'linux' }, { arch: 'x64' }, { serviceLabel: '../bad' },
    { nodePath: 'relative' }, { nodePath: '/a/../b' }, { nodePath: '/a\0b' },
    { nodeSha256: 'A'.repeat(64) }, { nodeSha256: '0'.repeat(63) }]) {
    assert.throws(() => validateRegistration({ ...reg, ...patch }));
  }
  const missing = { ...reg }; delete missing.tenantId;
  assert.throws(() => validateRegistration(missing));
});

test('unit: real protected-file checks refuse insecure mode, symlinks and hard links', async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'evopilot-plugin-unit-')));
  const filename = path.join(directory, 'registration.json');
  try {
    await writeFile(filename, JSON.stringify(fixture().reg), { mode: 0o600 });
    await chmod(filename, 0o644);
    const create = name => createConnection(name, { platform: 'darwin', arch: 'arm64' });
    assert.equal((await create(filename).start()).code, 'INSECURE_FILE');
    await chmod(filename, 0o600);
    await symlink(filename, path.join(directory, 'symbolic'));
    assert.equal((await create(path.join(directory, 'symbolic')).start()).code, 'INSECURE_FILE');
    await link(filename, path.join(directory, 'hard'));
    assert.equal((await create(filename).start()).code, 'INSECURE_FILE');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('unit: simultaneous starts coalesce; status never kickstarts a stopped owner', async () => {
  const f = fixture(); f.state.running = false;
  const first = f.connection.start();
  assert.equal(f.connection.start(), first);
  assert.equal((await first).readinessState, 'READY');
  assert.equal(f.calls.filter(call => call[1] === 'kickstart').length, 1);
  f.state.running = false;
  assert.equal((await f.connection.status()).processState, 'STOPPED');
  assert.equal(f.calls.filter(call => call[1] === 'kickstart').length, 1);
});

test('unit: missing service, mismatched PID, changed pins/config and wrong package fail closed', async () => {
  const missing = fixture(); missing.state.missing = true;
  assert.equal((await missing.connection.start()).code, 'SETUP_REQUIRED');
  assert.ok(!missing.calls.some(call => call[1] === 'kickstart'));
  const pid = fixture(); pid.state.pid = 456;
  assert.equal((await pid.connection.start()).code, 'OWNER_IDENTITY_FAILED');
  const pins = fixture(); pins.files.set(pins.reg.launcherPath, 'changed');
  assert.equal((await pins.connection.start()).code, 'PIN_MISMATCH');
  const config = fixture(); await config.connection.start();
  config.files.set(config.reg.cliConfigPath, '{}');
  assert.equal((await config.connection.status()).code, 'IDENTITY_CHANGED');
  const pkg = fixture();
  const text = JSON.stringify({ name: '@wrong/server', version: '6.3.3' });
  pkg.files.set(pkg.reg.runtimePackagePath, text); pkg.reg.runtimePackageSha256 = hash(text);
  pkg.files.set('/bound/registration.json', JSON.stringify(pkg.reg));
  assert.equal((await pkg.connection.start()).code, 'INVALID_PRODUCT');
});

const setupNames = ['evopilot_runtime_readiness_inspect', 'evopilot_llm_setup_protocol',
  'evopilot_llm_provider_discover', 'evopilot_llm_profile_list', 'evopilot_llm_profile_inspect',
  'evopilot_llm_profile_upsert', 'evopilot_llm_profile_preflight',
  'evopilot_workspace_llm_default_bind', 'evopilot_runtime_readiness_repair'];
function routing() {
  const f = fixture();
  const dispatched = [];
  let opens = 0;
  let uncertain = false;
  const official = { content: [{ type: 'text', text: 'owner reply' }], structuredContent: { status: 'PENDING', requestId: 'retained-id' }, isError: false };
  const handlers = createWorkflowHandlers(f.connection, async () => {
    opens++;
    return { close: async () => {}, client: {
      listTools: async () => ({ tools: [...setupNames, 'business'].map(name => ({ name, inputSchema: { type: 'object' } })) }),
      callTool: async input => { dispatched.push(input); if (uncertain) throw new Error('unit-secret'); return official; }
    } };
  });
  return { ...f, handlers, dispatched, official, opens: () => opens, uncertain: () => { uncertain = true; } };
}
test('unit: refusal before activation and serverUrl rejection before child dispatch', async () => {
  const f = routing();
  assert.equal((await f.handlers.tools()).structuredContent.code, 'ACTIVATION_REQUIRED');
  assert.equal((await f.handlers.call({ name: 'business', arguments: {} })).structuredContent.code, 'ACTIVATION_REQUIRED');
  assert.equal(f.opens(), 0);
  await f.handlers.start();
  assert.equal((await f.handlers.call({ name: 'business', arguments: { serverUrl: 'http://other/' } })).structuredContent.code, 'SERVER_OVERRIDE_FORBIDDEN');
  assert.equal(f.dispatched.length, 0);
  assert.equal((await f.handlers.call({ name: 'invented', arguments: {} })).structuredContent.code, 'UNKNOWN_TOOL');
  await f.handlers.close();
});
test('unit: exact nine setup tools; readiness rechecked before business; official result preserved', async () => {
  const f = routing(); f.state.readiness = 'SETUP_REQUIRED';
  const first = f.handlers.start(); assert.equal(f.handlers.start(), first); await first;
  assert.equal(f.opens(), 1);
  assert.equal((await f.handlers.tools()).structuredContent.tools.length, 10);
  for (const name of setupNames) assert.deepEqual(await f.handlers.call({ name, arguments: {} }), f.official);
  assert.equal((await f.handlers.call({ name: 'business', arguments: {} })).structuredContent.code, 'SETUP_REQUIRED');
  assert.equal(f.dispatched.length, 9);
  f.state.readiness = 'READY';
  assert.deepEqual(await f.handlers.call({ name: 'business', arguments: {} }), f.official);
  f.official.content[0].text = 'unexpected unit-secret in reply';
  assert.ok(!JSON.stringify(await f.handlers.call({ name: 'business', arguments: {} })).includes('unit-secret'));
  await f.handlers.close();
});
test('unit: uncertain mutation is never retried, respawned or replayed on explicit next start', async () => {
  const f = routing(); await f.handlers.start(); f.uncertain();
  const input = { name: 'business', arguments: {} };
  assert.equal((await f.handlers.call(input)).structuredContent.code, 'UNKNOWN_OUTCOME_NO_REPLAY');
  assert.equal((await f.handlers.call(input)).structuredContent.code, 'EXPLICIT_START_REQUIRED');
  assert.equal(f.dispatched.length, 1); assert.equal(f.opens(), 1);
  await f.handlers.start();
  assert.equal(f.opens(), 2); assert.equal(f.dispatched.length, 1);
  await f.handlers.close();
});

test('unit: strict loopback configuration and official child environment', async () => {
  for (const server of ['http://127.0.0.1:3000', 'http://127.0.0.1:3000/']) {
    const f = fixture();
    const config = JSON.parse(f.files.get(f.reg.cliConfigPath));
    f.files.set(f.reg.cliConfigPath, JSON.stringify({ ...config, server }));
    assert.equal((await f.connection.start()).readinessState, 'READY');
    await f.connection.withRuntime(env => assert.deepEqual(env, {
      PATH: '/usr/bin:/bin', EVOPILOT_SERVER: 'http://127.0.0.1:3000/',
      EVOPILOT_API_TOKEN: 'unit-secret', EVOPILOT_TENANT: 'tenant',
      EVOPILOT_WORKSPACE: 'workspace', EVOPILOT_ACTOR: 'unit'
    }));
  }
  for (const server of ['http://127.0.0.1', 'http://127.0.0.1:3000/path',
    'http://user@127.0.0.1:3000', 'http://127.0.0.1:3000?x',
    'http://127.0.0.1:3000#x', 'http://127.0.0.1:3000//', 'https://127.0.0.1:3000']) {
    const f = fixture();
    const config = JSON.parse(f.files.get(f.reg.cliConfigPath));
    f.files.set(f.reg.cliConfigPath, JSON.stringify({ ...config, server }));
    assert.equal((await f.connection.start()).code, 'INVALID_SERVER');
  }
});

test('integration: real plugin child initializes and lists four tools while status stays inactive', { timeout: 20000 }, async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'evopilot-plugin-inactive-')));
  const registration = path.join(directory, 'nonexistent-registration.json');
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/bridge.mjs', import.meta.url)), registration], {
    env: { PATH: '/usr/bin:/bin' }, stdio: ['pipe', 'pipe', 'ignore']
  });
  const exited = new Promise(resolve => {
    child.once('error', error => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const lines = createInterface({ input: child.stdout });
  let sequence = 0;
  let pending;
  lines.on('line', line => {
    try {
      const message = JSON.parse(line);
      if (message.id === pending?.id) pending.resolve(message);
    } catch (error) { pending?.reject(error); }
  });
  lines.on('close', () => pending?.reject(new Error('Plugin stdout closed before reply')));
  child.stdin.on('error', error => pending?.reject(error));
  async function request(method, params) {
    const id = ++sequence;
    let timer;
    try {
      const reply = await new Promise((resolve, reject) => {
        pending = { id, resolve, reject };
        timer = setTimeout(() => reject(new Error(`Timed out: ${method}`)), 4000);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
      assert.equal(reply.jsonrpc, '2.0');
      assert.equal(reply.error, undefined);
      return reply.result;
    } finally { clearTimeout(timer); pending = undefined; }
  }
  try {
    await assert.rejects(readFile(registration), { code: 'ENOENT' });
    // Run the bridge entry point and its actual SDK server factory over stdio.
    const initialized = await request('initialize', {
      protocolVersion: '2025-03-26', capabilities: {},
      clientInfo: { name: 'evopilot-inactive-regression', version: '1.0.0' }
    });
    assert.ok(initialized.serverInfo.name);
    assert.ok(initialized.capabilities.tools);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const expected = ['evopilot_workflow_call', 'evopilot_workflow_start',
      'evopilot_workflow_status', 'evopilot_workflow_tools'];
    for (let i = 0; i < 2; i++) {
      const catalog = await request('tools/list', {});
      assert.deepEqual(catalog.tools.map(tool => tool.name).sort(), expected);
      const status = await request('tools/call', { name: 'evopilot_workflow_status', arguments: {} });
      assert.equal(status.structuredContent.code, 'INACTIVE');
    }
    await assert.rejects(readFile(registration), { code: 'ENOENT' });
  } finally {
    // EOF closes only this test's child normally; kill only on a shutdown failure.
    child.stdin.end();
    let timer;
    try {
      const result = await Promise.race([exited,
        new Promise(resolve => { timer = setTimeout(() => resolve(null), 3000); })]);
      if (result === null) { child.kill('SIGKILL'); await exited; assert.fail('Plugin did not exit on EOF'); }
      assert.deepEqual(result, { code: 0, signal: null });
    } finally {
      clearTimeout(timer);
      lines.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test('packaging: Skill Expert link resolves from its directory to the pinned public asset', async () => {
  const root = new URL('../', import.meta.url);
  const skill = new URL('skills/evopilot/SKILL.md', root);
  const markdown = await readFile(skill, 'utf8');
  const link = /\[Expert 2\.3\.1 guidance\]\(([^)]+)\)/.exec(markdown);
  assert.ok(link, 'Packaged Skill must link to the published Expert');
  const target = new URL(link[1], skill);
  const expected = new URL('node_modules/@evopilot/evolution-expert/generated/codex/SKILL.md', root);
  assert.equal(target.href, expected.href);
  assert.equal(await realpath(target), await realpath(expected));
  assert.ok((await readFile(target, 'utf8')).trim().length > 0);
  const plugin = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const expert = JSON.parse(await readFile(new URL('node_modules/@evopilot/evolution-expert/package.json', root), 'utf8'));
  assert.equal(plugin.dependencies['@evopilot/evolution-expert'], '2.3.1');
  assert.equal(expert.name, '@evopilot/evolution-expert');
  assert.equal(expert.version, '2.3.1');
});

test('unit: returned status 0 retains request evidence and scrubs the official token', async () => {
  const f = routing();
  Object.assign(f.official, { isError: true, content: [{ type: 'text', text: 'unit-secret failed' }],
    structuredContent: { status: 0, requestId: 'original-request', error: 'unit-secret failed' } });
  await f.handlers.start();
  const reply = await f.handlers.call({ name: 'business', arguments: {} });
  assert.equal(reply.structuredContent.code, 'UNKNOWN_OUTCOME_NO_REPLAY');
  assert.equal(reply.structuredContent.ownerResult.structuredContent.requestId, 'original-request');
  assert.equal(reply.structuredContent.ownerResult.structuredContent.error, '[REDACTED] failed');
  assert.ok(!JSON.stringify(reply).includes('unit-secret'));
  assert.equal((await f.handlers.call({ name: 'business', arguments: {} })).structuredContent.code, 'EXPLICIT_START_REQUIRED');
  assert.equal(f.dispatched.length, 1);
  await f.handlers.close();
});

test('unit: installer arguments and unknown public list schemas fail closed', () => {
  const args = ['--destination', '/new/plugin', '--cli-config', '/private/config', '--plist', '/service/owner.plist',
    '--runtime-package', '/runtime/package.json', '--codex', '/bin/codex'];
  assert.equal(parseArguments(args).destination, '/new/plugin');
  assert.deepEqual(parseArguments(['--doctor', '/new/plugin']), { doctor: '/new/plugin' });
  for (const bad of [[], args.slice(2), [...args, '--extra', '/x'],
    [...args.slice(0, 8), '--plist', '/x'], ['--doctor', 'relative'], ['--doctor', '/a/../b']]) {
    assert.throws(() => parseArguments(bad));
  }
  assert.equal(listsPermitRegistration([], []), true);
  for (const value of [null, {}, { plugins: [] }, [{ name: 'evopilot' }], [{ unknown: true }]]) {
    assert.equal(listsPermitRegistration(value, []), false);
    assert.equal(listsPermitRegistration([], value), false);
  }
});

test('integration: official child routes scoped HTTP, preserves 403, and does not replay status 0', { timeout: 30000 }, async () => {
  // Synthetic HTTP owner only: this does not establish Runtime or Desktop acceptance.
  const requests = [];
  let mode = 'ok';
  const denied = { error: { code: 'OWNER_DENIED' }, requestId: 'owner-request-403' };
  const http = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, headers: req.headers });
    req.resume();
    if (mode === 'lost') { req.socket.destroy(); return; }
    res.writeHead(mode === 'denied' ? 403 : 200, {
      'content-type': 'application/json', 'x-request-id': 'owner-request-403'
    });
    res.end(JSON.stringify(mode === 'denied' ? denied : { data: [] }));
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const env = { PATH: '/usr/bin:/bin', EVOPILOT_SERVER: `http://127.0.0.1:${http.address().port}`,
    EVOPILOT_API_TOKEN: 'synthetic-integration-token', EVOPILOT_TENANT: 'fixture-tenant',
    EVOPILOT_WORKSPACE: 'fixture-workspace', EVOPILOT_ACTOR: 'fixture-actor',
    NODE_OPTIONS: '--invalid-caller-option', EVOPILOT_BASE_URL: 'http://invalid.example' };
  const status = { processState: 'RUNNING', readinessState: 'READY' };
  // Default opener is bridge.officialAdapter using the real SDK Client/Stdio transport.
  const handlers = createWorkflowHandlers({ start: async () => status,
    status: async () => status, withRuntime: callback => callback(env, status) });
  try {
    assert.equal((await handlers.start()).structuredContent.readinessState, 'READY');
    const catalog = (await handlers.tools()).structuredContent.tools;
    assert.ok(catalog.some(tool => tool.name === 'evopilot_project_list'));
    assert.equal((await handlers.call({ name: 'evopilot_project_list', arguments: {} })).structuredContent.status, 200);
    assert.equal(requests[0].url, '/api/v1/projects');
    assert.equal(requests[0].method, 'GET');
    assert.equal(requests[0].headers.authorization, 'Bearer synthetic-integration-token');
    for (const key of ['tenant', 'workspace', 'actor']) {
      assert.equal(requests[0].headers[`x-evopilot-${key}`], `fixture-${key}`);
    }
    mode = 'denied';
    const reply = await handlers.call({ name: 'evopilot_project_list', arguments: {} });
    assert.equal(reply.isError, true);
    assert.equal(reply.structuredContent.status, 403);
    assert.equal(reply.structuredContent.requestId, 'owner-request-403');
    assert.deepEqual(reply.structuredContent.response, denied);
    assert.deepEqual(JSON.parse(reply.content[0].text), reply.structuredContent);
    mode = 'lost';
    const input = { name: 'evopilot_llm_profile_upsert', arguments: { payload: {} } };
    const uncertain = await handlers.call(input);
    assert.equal(uncertain.structuredContent.code, 'UNKNOWN_OUTCOME_NO_REPLAY');
    const evidence = uncertain.structuredContent.ownerResult;
    assert.equal(evidence.isError, true);
    assert.equal(evidence.structuredContent.status, 0);
    assert.equal(evidence.structuredContent.tool, input.name);
    assert.deepEqual(JSON.parse(evidence.content[0].text), evidence.structuredContent);
    assert.equal(requests[2].method, 'POST');
    assert.equal(requests[2].url, '/api/v1/llm-profiles');
    assert.equal((await handlers.call(input)).structuredContent.code, 'EXPLICIT_START_REQUIRED');
    mode = 'ok';
    await handlers.start();
    assert.equal(requests.length, 3);
    assert.ok(!JSON.stringify(uncertain).includes(env.EVOPILOT_API_TOKEN));
  } finally {
    await handlers.close();
    http.closeAllConnections();
    await new Promise(resolve => http.close(resolve));
  }
});
