import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { assembly } from './connection.test.mjs';

import { createHistoricalOntology } from './fixtures/historical-products.mjs';
const source = fileURLToPath(new URL('../../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
async function fixture() {
  const f = await assembly(true);
  for (const relative of ['dist/integration/workspace', 'dist/plugins', 'dist/expert', 'workspace/templates']) {
    fs.cpSync(path.join(source, relative), path.join(f.install, relative), { recursive: true });
  }
  const files = [];
  function walk(dir, relative = '') {
    for (const name of fs.readdirSync(dir)) {
      const key = relative ? relative + '/' + name : name, item = path.join(dir, name);
      if (fs.lstatSync(item).isDirectory()) walk(item, key);
      else files.push({ path: key, sha256: sha(fs.readFileSync(item)) });
    }
  }
  walk(f.install);
  const installRoot = path.join(f.base, 'managed'); fs.mkdirSync(installRoot, { mode: 0o700 });
  const configPath = path.join(installRoot, 'config.json');
  const configuration = { ...f.config, workspaceRoot: null, workspaceId: null, manifest: files };
  fs.writeFileSync(configPath, JSON.stringify(configuration), { mode: 0o600 });
  const bootstrap = await import(pathToFileURL(path.join(f.install, 'dist/integration/workspace/bootstrap.js')).href);
  const input = { projectRoot: path.join(f.base, 'my-project'), stateRoot: path.join(f.base, 'service-state'), workspaceId: 'bootstrap-user', requestId: 'setup-one' };
  return { ...f, configPath, bootstrap, input, async cleanup() { await f.api.stopConnection(configPath); await f.cleanup(); } };
}
const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'workspace-e2e', version: '0.2.0' } } };
const call = (id, name, args = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'evopilot_v01_' + name, arguments: args } });
function conversation(f, messages) {
  const p = spawnSync(process.execPath, [path.join(f.install, 'dist/plugins/codex/server.js'), '--config', f.configPath], {
    input: [init, ...messages].map(v => JSON.stringify(v)).join('\n') + '\n', encoding: 'utf8', timeout: 20000, maxBuffer: 10485760,
    env: { LANG: 'C', TZ: 'UTC', OPENSSL_CONF: '/dev/null' },
  });
  assert.ifError(p.error); assert.equal(p.status, 0, p.stderr);
  return p.stdout.trim().split('\n').map(line => JSON.parse(line));
}
const data = item => item.result.structuredContent;

test('V02-A01/A02: real installed services bootstrap in inactive MCP session, then same session activates', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const configBytes = fs.readFileSync(f.configPath);
    const before = conversation(f, [call(2, 'workspace_inspect'), call(3, 'inspect'), call(4, 'guide', { scenario: 'onboarding' }), call(5, 'activate')]);
    assert.equal(data(before[1]).result.configured, false);
    assert.equal(data(before[2]).connection.configured, false);
    assert.equal(data(before[3]).sessionActive, false);
    assert.equal(data(before[4]).error.code, 'WORKSPACE_UNCONFIGURED');
    assert(!fs.existsSync(f.input.projectRoot)); assert(!fs.existsSync(f.input.stateRoot));
    const out = conversation(f, [call(2, 'workspace_initialize', f.input), call(3, 'capabilities'), call(4, 'activate'), call(5, 'capabilities')]);
    assert.equal(data(out[1]).result.configured, true);
    assert.equal(data(out[1]).sessionActive, false);
    assert.equal(data(out[2]).error.code, 'SESSION_INACTIVE');
    assert.equal(data(out[3]).sessionActive, true);
    assert.equal(data(out[4]).result.version, '0.8.0');
    assert.deepEqual(fs.readFileSync(f.configPath), configBytes, 'Setup preserves immutable installed configuration');
    const marker = JSON.parse(fs.readFileSync(path.join(f.input.stateRoot, 'workspace.json')));
    assert.equal(marker.id, f.input.workspaceId); assert.equal(marker.canonicalRoot, f.input.stateRoot);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.input.projectRoot, 'workspace-project.json'))).id, marker.id);
    assert(fs.existsSync(path.join(f.input.projectRoot, 'examples/forward/README.md')));
    assert(fs.existsSync(path.join(f.input.projectRoot, 'examples/reverse/source.json')));
    assert(!fs.existsSync(path.join(f.input.projectRoot, 'state')));
    for (const owner of ['runtime', 'harness', 'ontology']) assert(fs.existsSync(path.join(f.input.stateRoot, 'state', owner)));
    const other = conversation(f, [call(2, 'inspect')]);
    assert.equal(data(other[1]).sessionActive, false); assert.equal(data(other[1]).connection.pid, data(out[3]).connection.pid);
  } finally { await f.cleanup(); }
});

test('V02-C01/C03/D05: actual owners preserve quarantine and Pack conflict diagnostics through daemon and MCP without mutation', { timeout: 30000 }, async () => {
  const f = await fixture();
  // Synthetic inputs only; no provider stub or owner-error injection on this path.
  const selected = { visibility: 'private', projectId: 'diagnostic-fixture' };
  const request = (id, operation, input = {}, mutation = {}) => call(id, 'request', { owner: 'ontology', envelope: { operation, scope: selected, input, ...mutation } });
  const result = (out, id) => data(out.find(reply => reply.id === id));
  const pack = (id, conceptId, definition) => ({ kind: 'DomainOntologyPack', metadata: { id, version: '1.0.0', namespace: 'diagnostic', root: 'PRIVATE_ORGANIZATION', visibility: 'PRIVATE', owner: 'synthetic-fixture', provenance: { author: 'synthetic' } }, spec: { concepts: [{ conceptId, label: conceptId, metaType: 'ENTITY', definition }] } });
  try {
    await f.bootstrap.setupWorkspace(f.configPath, f.input);
    const raw = '{"schema":"unsupported-synthetic/v9","id":"unrecognized"}';
    // Test-only historical import; current MCP must retain quarantine and reject new derivation.
    const historical = createHistoricalOntology({ workspaceRoot: f.input.stateRoot, workspaceId: f.input.workspaceId });
    historical.initialize();
    let source;
    try { source = historical.execute({ operation: 'legacy.import', scope: selected, input: { raw, format: 'json', sourceLocator: 'synthetic://diagnostic/unknown.json', sourceRevision: 'r1', sourceVisibility: 'private' }, requestId: 'diagnostic-import', expectedRevision: 0 }).result; } finally { historical.close(); }
    const initial = conversation(f, [call(2, 'activate'), request(3, 'workspace.inspect'),
      request(5, 'pack.scaffold.inspect', pack('diagnostic-base', 'diagnostic:account', 'Synthetic original account.')),
      request(6, 'pack.scaffold.inspect', pack('diagnostic-extra', 'diagnostic:audit', 'Synthetic audit.')),
      request(7, 'pack.scaffold.inspect', pack('diagnostic-conflict', 'diagnostic:account', 'A conflicting account definition.')),
      request(8, 'workspace.inspect')]);
    assert.equal(result(initial, 3).result.revision, 1);
    assert.equal(source.status, 'QUARANTINED'); assert.equal(source.inspection.valid, false);
    const base = result(initial, 5).result.result, extra = result(initial, 6).result.result, conflict = result(initial, 7).result.result;
    const before = result(initial, 8).result; assert.equal(before.revision, 1);
    const root = 'PRIVATE_ORGANIZATION';
    const checks = conversation(f, [call(2, 'activate'),
      request(3, 'legacy.derive', { sourceId: source.sourceId, id: 'rejected-draft', version: '1.0.0', visibility: 'private' }, { requestId: 'diagnostic-derive', expectedRevision: before.revision }),
      request(4, 'workspace.inspect'), request(5, 'receipt.inspect', { requestId: 'diagnostic-derive' }), request(6, 'asset.inspect', { id: 'rejected-draft', version: '1.0.0' }),
      request(7, 'pack.resolve.inspect', { packs: [base, extra], targetRoot: root }),
      request(8, 'pack.resolve.inspect', { packs: [base, extra], targetRoot: root, precedence: ['diagnostic-base@1.0.0', 'diagnostic-extra@1.0.0'] }),
      request(9, 'pack.resolve.inspect', { packs: [base, conflict], targetRoot: root, precedence: ['diagnostic-base@1.0.0', 'diagnostic-conflict@1.0.0'] }),
      request(10, 'workspace.inspect'), request(11, 'source.inspect', { sourceId: source.sourceId })]);
    for (const [id, code] of [[3, 'HISTORICAL_READ_ONLY'], [7, 'PACK_NAMESPACE_COLLISION'], [9, 'PACK_OVERRIDE_INCOMPATIBLE']]) {
      const value = result(checks, id);
      assert.equal(value.error.code, code); assert.equal(value.sessionActive, true); assert.equal(value.connection.active, true);
      assert.deepEqual(value.error.correlation.scope, selected);
      assert.equal(value.error.correlation.operation, id === 3 ? 'legacy.derive' : 'pack.resolve.inspect');
      assert.deepEqual(Object.keys(value.error).sort(), ['code', 'correlation', 'diagnostic']);
      assert.equal(value.error.diagnostic.retrySafe,false);
    }
    assert.equal(result(checks, 3).error.correlation.requestId, 'diagnostic-derive');
    assert.equal(result(checks, 3).error.correlation.expectedRevision, before.revision);
    assert.deepEqual(result(checks, 4).result, before);
    assert.equal(result(checks, 5).error.code, 'NOT_FOUND'); assert.equal(result(checks, 6).error.code, 'NOT_FOUND');
    assert.deepEqual(result(checks, 8).result.result.concepts.map(item => item.conceptId).sort(), ['diagnostic:account', 'diagnostic:audit']);
    assert.deepEqual(result(checks, 10).result, before);
    assert.equal(result(checks, 11).result.raw, raw);
  } finally { await f.cleanup(); }
});

test('V02-A02/A03: concurrent exact initialization converges, repeated setup preserves user edits and rejects switching', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const expression = `import {setupWorkspace} from ${JSON.stringify(pathToFileURL(path.join(f.install, 'dist/integration/workspace/bootstrap.js')).href)};console.log(JSON.stringify(await setupWorkspace(${JSON.stringify(f.configPath)},${JSON.stringify(f.input)})));`;
    const run = () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', expression], { stdio: ['ignore', 'pipe', 'pipe'] }); let output = '', errors = '';
      child.stdout.on('data', b => output += b); child.stderr.on('data', b => errors += b); child.on('error', reject);
      child.on('exit', code => code ? reject(Error(errors)) : resolve(JSON.parse(output)));
    });
    const results = await Promise.all([run(), run(), run()]);
    assert.equal(results.filter(v => !v.reused).length, 1); assert(results.every(v => v.workspaceId === f.input.workspaceId));
    const readme = path.join(f.input.projectRoot, 'README.md'); fs.appendFileSync(readme, '\nMy custom content.\n');
    const before = fs.readFileSync(readme);
    assert.equal((await f.bootstrap.setupWorkspace(f.configPath, f.input)).reused, true);
    assert.deepEqual(fs.readFileSync(readme), before);
    await assert.rejects(f.bootstrap.setupWorkspace(f.configPath, { ...f.input, workspaceId: 'other-user' }), { code: 'WORKSPACE_ALREADY_BOUND' });
    assert.equal(f.bootstrap.inspectWorkspace(f.configPath).setupPending, false);
  } finally { await f.cleanup(); }
});

test('V02-A02: first-use defaults create private separate roots and stable identity with no actual-home writes', async t => {
  const f = await fixture();
  const home = t.mock.method(os, 'homedir', () => f.base);
  try {
    const requestId = 'initialize-with-defaults', workspaceId = 'ws-' + sha(f.config.installationId + ':' + requestId).slice(0, 24);
    const projectRoot = path.join(f.base, 'evopilot-workspace'), stateRoot = path.join(f.base, '.local/share/evopilot/workspaces', workspaceId);
    const result = await f.bootstrap.setupWorkspace(f.configPath, { requestId });
    assert.equal(result.configured, true); assert.equal(result.reused, false);
    assert.equal(result.projectRoot, projectRoot); assert.equal(result.stateRoot, stateRoot); assert.equal(result.workspaceId, workspaceId);
    assert.equal(fs.statSync(projectRoot).mode & 0o777, 0o700); assert.equal(fs.statSync(stateRoot).mode & 0o777, 0o700);
    assert.equal(JSON.parse(fs.readFileSync(path.join(stateRoot, 'workspace.json'))).canonicalRoot, stateRoot);
    for (const owner of ['runtime', 'harness', 'ontology']) assert(fs.existsSync(path.join(stateRoot, 'state', owner)));
    const readme = path.join(projectRoot, 'README.md'); fs.appendFileSync(readme, '\nDefault workspace customization.\n');
    const bytes = fs.readFileSync(readme);
    assert.equal((await f.bootstrap.setupWorkspace(f.configPath, { requestId })).reused, true);
    assert.deepEqual(fs.readFileSync(readme), bytes);
    assert.equal((await f.api.inspectConnection(f.configPath)).active, false);
  } finally { home.mock.restore(); await f.cleanup(); }
});

test('V02-D05: occupied, linked, unsafe and Git-state paths are rejected before products or user files are overwritten', async () => {
  for (const kind of ['occupied-project', 'occupied-state', 'symlink', 'unsafe', 'git-state']) {
    const f = await fixture();
    try {
      let expected;
      if (kind === 'occupied-project') { fs.mkdirSync(f.input.projectRoot, { mode: 0o700 }); fs.writeFileSync(path.join(f.input.projectRoot, 'mine'), 'keep'); expected = 'PROJECT_OCCUPIED'; }
      if (kind === 'occupied-state') { fs.mkdirSync(f.input.stateRoot, { mode: 0o700 }); fs.writeFileSync(path.join(f.input.stateRoot, 'mine'), 'keep'); expected = 'WORKSPACE_OCCUPIED'; }
      if (kind === 'symlink') { const elsewhere = path.join(f.base, 'elsewhere'); fs.mkdirSync(elsewhere); fs.symlinkSync(elsewhere, f.input.projectRoot); expected = 'SYMLINK'; }
      if (kind === 'unsafe') { fs.mkdirSync(f.input.projectRoot, { mode: 0o755 }); expected = 'UNSAFE_WORKSPACE'; }
      if (kind === 'git-state') { fs.mkdirSync(f.input.stateRoot, { mode: 0o700 }); fs.mkdirSync(path.join(f.input.stateRoot, '.git')); expected = 'WORKSPACE_IN_GIT'; }
      await assert.rejects(f.bootstrap.setupWorkspace(f.configPath, f.input), { code: expected });
      assert.equal(f.bootstrap.inspectWorkspace(f.configPath).configured, false);
      if (kind.startsWith('occupied')) assert.equal(fs.readFileSync(path.join(kind === 'occupied-state' ? f.input.stateRoot : f.input.projectRoot, 'mine'), 'utf8'), 'keep');
      assert(!fs.existsSync(path.join(f.input.stateRoot, 'workspace.json')));
    } finally { await f.cleanup(); }
  }
});

test('V02-A03: attach validates actual existing owner state and identity without copying markers', async () => {
  const f = await fixture();
  try {
    await f.bootstrap.setupWorkspace(f.configPath, f.input);
    const first = f.bootstrap.inspectWorkspace(f.configPath);
    const binding = fs.readFileSync(first.bindingPath);
    fs.unlinkSync(first.bindingPath);
    await assert.rejects(f.bootstrap.setupWorkspace(f.configPath, { ...f.input, workspaceId: 'foreign' }, 'attach'), { code: 'PROJECT_IDENTITY' });
    const result = await f.bootstrap.setupWorkspace(f.configPath, { ...f.input, requestId: 'attach-existing' }, 'attach');
    assert.equal(result.configured, true); assert.equal(result.workspaceId, first.workspaceId);
    assert.equal(JSON.parse(binding).stateRoot, result.stateRoot);
  } finally { await f.cleanup(); }
});

test('V02-A03: incompatible project schema, template and specification versions cannot attach or alter retained state', async () => {
  const f = await fixture();
  let markerPath, original;
  try {
    await f.bootstrap.setupWorkspace(f.configPath, f.input);
    const inspection = f.bootstrap.inspectWorkspace(f.configPath);
    markerPath = path.join(f.input.projectRoot, 'workspace-project.json'); original = fs.readFileSync(markerPath);
    const marker = JSON.parse(original), stateMarker = fs.readFileSync(path.join(f.input.stateRoot, 'workspace.json'));
    fs.unlinkSync(inspection.bindingPath);
    const incompatible = [
      { ...marker, schema: 'evopilot-workspace-project/v999' },
      { ...marker, templateVersion: '99.0.0' },
      { ...marker, specifications: { ...marker.specifications, ontology: 'v999' } },
      { ...marker, specifications: { ...marker.specifications, harness: 'v999' } },
    ];
    for (const [index, invalid] of incompatible.entries()) {
      const bytes = Buffer.from(JSON.stringify(invalid)); fs.writeFileSync(markerPath, bytes);
      await assert.rejects(f.bootstrap.setupWorkspace(f.configPath, { ...f.input, requestId: `incompatible-${index}` }, 'attach'), { code: 'PROJECT_IDENTITY' });
      assert.equal(fs.existsSync(inspection.bindingPath), false);
      assert.deepEqual(fs.readFileSync(markerPath), bytes, 'Invalid metadata is diagnosed, not silently rewritten');
      assert.deepEqual(fs.readFileSync(path.join(f.input.stateRoot, 'workspace.json')), stateMarker);
    }
    fs.writeFileSync(markerPath, original);
    assert.equal((await f.bootstrap.setupWorkspace(f.configPath, { ...f.input, requestId: 'compatible-attach' }, 'attach')).configured, true);
    assert.deepEqual(fs.readFileSync(markerPath), original);
  } finally { if (original) fs.writeFileSync(markerPath, original); await f.cleanup(); }
});

test('V02-A02/D01: retained exact setup intent recovers an interrupted binding write without replacing project content', async () => {
  const f = await fixture();
  try {
    await f.bootstrap.setupWorkspace(f.configPath, f.input);
    const location = f.bootstrap.inspectWorkspace(f.configPath).bindingPath;
    const binding = JSON.parse(fs.readFileSync(location));
    // Synthetic interrupted-write boundary: actual owner stores exist, binding commit was not retained.
    fs.unlinkSync(location);
    fs.writeFileSync(location + '.setup.json', JSON.stringify({ ...binding, mode: 'initialize' }), { mode: 0o600 });
    const custom = path.join(f.input.projectRoot, 'README.md'); fs.appendFileSync(custom, '\nKeep customization after interruption.\n');
    const content = fs.readFileSync(custom);
    await assert.rejects(f.bootstrap.setupWorkspace(f.configPath, { ...f.input, requestId: 'different-intent' }), { code: 'SETUP_CONFLICT' });
    assert.equal((await f.bootstrap.setupWorkspace(f.configPath, f.input)).configured, true);
    assert.deepEqual(fs.readFileSync(custom), content);
    assert(!fs.existsSync(location + '.setup.json'));
    // The final journal cleanup is also idempotent if binding committed before interruption.
    fs.writeFileSync(location + '.setup.json', JSON.stringify({ ...binding, mode: 'initialize' }), { mode: 0o600 });
    assert.equal((await f.bootstrap.setupWorkspace(f.configPath, f.input)).reused, true);
    assert(!fs.existsSync(location + '.setup.json'));
  } finally { await f.cleanup(); }
});

async function holdingMaintenance(f, duration, installation = false) {
  const module = pathToFileURL(path.join(f.install, 'dist/integration/connection/client.js')).href;
  const callback = `async()=>{console.log(JSON.stringify({held:true}));await new Promise(r=>setTimeout(r,${duration}));}`;
  const code = installation
    ? `import {withInstallationLease} from ${JSON.stringify(pathToFileURL(path.join(f.install, 'dist/integration/workspace/lock.js')).href)}; import {loadInstallationConfiguration} from ${JSON.stringify(pathToFileURL(path.join(f.install, 'dist/integration/connection/config.js')).href)}; await withInstallationLease(loadInstallationConfiguration(${JSON.stringify(f.configPath)}),'setup-lease-test',${callback});`
    : `import {withWorkspaceMaintenance} from ${JSON.stringify(module)}; await withWorkspaceMaintenance(${JSON.stringify(f.configPath)},'maintenance-lock-test',${callback});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '';
  const done = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal })));
  child.stderr.on('data', b => errors += b);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Error('Maintenance fixture startup timeout: ' + errors)); }, 10000);
    child.stdout.on('data', b => { output += b; if (output.includes('\n')) { clearTimeout(timer); assert.equal(JSON.parse(output.split('\n')[0]).held, true); resolve(); } });
    child.once('error', e => { clearTimeout(timer); reject(e); });
    child.once('exit', code => { clearTimeout(timer); if (!output.includes('\n')) reject(Error('Maintenance fixture exited: ' + code + ' ' + errors)); });
  });
  return { child, done };
}

test('V02-D02/D05: real maintenance lease stops services and serializes concurrent activation; killed owner releases OS lease', { timeout: 30000 }, async () => {
  const f = await fixture(); let holder;
  try {
    await f.bootstrap.setupWorkspace(f.configPath, f.input);
    const first = await f.api.activateConnection(f.configPath);
    const marker = fs.readFileSync(path.join(f.input.stateRoot, 'workspace.json'));
    holder = await holdingMaintenance(f, 700);
    assert.equal((await f.api.inspectConnection(f.configPath)).active, false, 'Maintenance has stopped actual daemon before callback');
    let activated = false;
    const waiting = f.api.activateConnection(f.configPath).then(value => { activated = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 120)); assert.equal(activated, false, 'Concurrent activation waits for maintenance');
    assert.equal((await holder.done).code, 0);
    const restarted = await waiting; assert.equal(restarted.active, true); assert.notEqual(restarted.pid, first.pid);
    holder = await holdingMaintenance(f, 60000);
    const lease = path.join(f.input.stateRoot + '.evopilot-coordination', 'lease.db');
    const inode = fs.statSync(lease).ino;
    holder.child.kill('SIGKILL'); assert.equal((await holder.done).signal, 'SIGKILL');
    assert.equal((await f.api.activateConnection(f.configPath)).active, true, 'Crash releases kernel transaction lease without deleting lock evidence');
    assert.equal(fs.statSync(lease).ino, inode);
    assert.deepEqual(fs.readFileSync(path.join(f.input.stateRoot, 'workspace.json')), marker);
  } finally { if (holder?.child.exitCode === null && holder.child.signalCode === null) holder.child.kill('SIGKILL'); await f.cleanup(); }
});

test('V02-D02: checked restore entry alone tolerates absent project root; normal activation stays strict', async () => {
  const f = await fixture();
  try {
    await f.bootstrap.setupWorkspace(f.configPath, f.input);
    const saved = path.join(f.base, 'saved-project'); fs.renameSync(f.input.projectRoot, saved);
    await assert.rejects(f.api.activateConnection(f.configPath), { code: 'ENOENT' });
    const result = await f.api.withWorkspaceMaintenance(f.configPath, 'restore-entry', async c => {
      assert.equal(c.workspaceRoot, f.input.stateRoot); assert(!fs.existsSync(f.input.projectRoot));
      fs.renameSync(saved, f.input.projectRoot); return { restored: true };
    }, { restoring: true });
    assert.equal(result.restored, true); assert.equal((await f.api.activateConnection(f.configPath)).active, true);
  } finally { await f.cleanup(); }
});

test('V02-D02: only matching protected restore journal admits interrupted first-marker staging', async t => {
  const f = await fixture(); let writer;
  try {
    await f.bootstrap.setupWorkspace(f.configPath, f.input);
    const { maintainWorkspace } = await import(pathToFileURL(path.join(f.install, 'dist/integration/workspace/maintenance.js')).href);
    const context = { projectRoot: f.input.projectRoot, stateRoot: f.input.stateRoot, workspaceId: f.input.workspaceId, installationRoot: f.install };
    const backupRoot = path.join(f.base, 'staging-backup'), requestId = 'resume-first-marker';
    const backup = await f.api.withWorkspaceMaintenance(f.configPath, 'backup-for-staging', () => maintainWorkspace(context, 'backup', { destinationRoot: backupRoot }, 'backup-for-staging'));
    assert.equal(backup.status, 'VERIFIED');
    const marker = fs.readFileSync(path.join(f.input.projectRoot, 'workspace-project.json'));
    fs.rmSync(f.input.projectRoot, { recursive: true }); fs.rmSync(f.input.stateRoot, { recursive: true });
    const write = fs.writeSync;
    writer = t.mock.method(fs, 'writeSync', (fd, bytes, offset, length, position) => {
      if (typeof fd === 'number' && Buffer.isBuffer(bytes) && bytes.subarray(offset,offset+length).equals(marker)) {
        write(fd, bytes, offset, Math.floor(length/2), position);
        throw Object.assign(Error('Synthetic interruption before atomic marker publication'), { code: 'TEST_COPY_INTERRUPTED' });
      }
      return write(fd, bytes, offset, length, position);
    });
    await assert.rejects(f.api.withWorkspaceMaintenance(f.configPath, requestId, () => maintainWorkspace(context, 'restore', { backupRoot }, requestId), { restoring: true }), { code: 'TEST_COPY_INTERRUPTED' });
    writer.mock.restore();
    assert.deepEqual(fs.readdirSync(f.input.projectRoot), ['.evopilot-copy-' + requestId]);
    await assert.rejects(f.api.activateConnection(f.configPath), { code: 'ENOENT' });
    await assert.rejects(f.api.withWorkspaceMaintenance(f.configPath, 'wrong-request', () => assert.fail('Unrelated request reached recovery'), { restoring: true }), { code: 'ENOENT' });
    const journalPath = path.join(f.input.stateRoot + '.evopilot-maintenance', 'requests', requestId + '.json');
    const saved = fs.readFileSync(journalPath), journal = JSON.parse(saved); journal.source.workspaceId = 'foreign';
    fs.writeFileSync(journalPath, JSON.stringify(journal));
    await assert.rejects(f.api.withWorkspaceMaintenance(f.configPath, requestId, () => assert.fail('Foreign journal reached recovery'), { restoring: true }), { code: 'RESTORE_JOURNAL' });
    fs.writeFileSync(journalPath, saved);
    const restored = await f.api.withWorkspaceMaintenance(f.configPath, requestId, () => maintainWorkspace(context, 'restore', { backupRoot }, requestId), { restoring: true });
    assert.equal(restored.status, 'VERIFIED'); assert.deepEqual(fs.readFileSync(path.join(f.input.projectRoot, 'workspace-project.json')), marker);
    assert(!fs.existsSync(path.join(f.input.projectRoot, '.evopilot-copy-' + requestId)));
    assert.equal((await f.api.activateConnection(f.configPath)).active, true);
  } finally { writer?.mock.restore(); await f.cleanup(); }
});


test('V02-A02/D01: initialization survives a killed installation lease holder without deleting control evidence', { timeout: 30000 }, async () => {
  const f = await fixture(); let holder;
  try {
    await assert.rejects(f.bootstrap.setupWorkspace(f.configPath, { ...f.input, workspaceId: 'Uppercase' }), { code: 'CONFIG_ID' });
    assert(!fs.existsSync(f.input.projectRoot)); assert(!fs.existsSync(f.input.stateRoot));
    holder = await holdingMaintenance(f, 60000, true);
    const lease = f.bootstrap.inspectWorkspace(f.configPath).bindingPath + '.coordination/lease.db', inode = fs.statSync(lease).ino;
    let completed = false;
    const waiting = f.bootstrap.setupWorkspace(f.configPath, f.input).then(result => { completed = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(completed, false); assert(!fs.existsSync(f.input.projectRoot));
    holder.child.kill('SIGKILL'); assert.equal((await holder.done).signal, 'SIGKILL');
    assert.equal((await waiting).configured, true); assert.equal(fs.statSync(lease).ino, inode);
    assert.equal(f.bootstrap.inspectWorkspace(f.configPath).setupPending, false);
  } finally { if (holder?.child.exitCode === null && holder.child.signalCode === null) holder.child.kill('SIGKILL'); await f.cleanup(); }
});
