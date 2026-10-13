import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { assembly } from './connection.test.mjs';
import { sha256 } from '../compatibility/v1/reference.mjs';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const scope = { visibility: 'private', projectId: 'synthetic-cutover' };
const source = { id: 'source', kind: 'synthetic', locator: 'synthetic://workspace-cutover/requirements', revision: 'r1', digest: sha256({ fixture: 'workspace-cutover' }), status: 'synthetic' };
const mappings = ids => ids.map(targetRef => ({ id: 'mapping-' + targetRef, targetRef, sourceRef: source.id, sourceLocator: source.locator, sourceRevision: source.revision, status: 'synthetic' }));
const base = { id: 'cutover-asset', version: '0.1.0', specVersion: 'v1', visibility: 'private', provenance: { direction: 'forward', sources: [source] }, extensions: [], dependencies: [] };
const model = { ...base, product: 'ontology', concepts: [{ id: 'item', label: 'Item', definition: 'A fictional inventory item.' }], properties: [{ id: 'quantity', conceptRef: 'item', type: 'integer', required: true }], relations: [], constraints: [{ id: 'range', conceptRef: 'item', propertyRef: 'quantity', kind: 'numeric-range', minimum: 0, maximum: 10, required: true }], sourceMappings: mappings(['item', 'quantity', 'range']), unresolvedIssues: [] };
const asset = { ...base, product: 'harness', kind: 'HarnessComponent', applicability: { enabled: true, domains: ['inventory'] }, objectives: [{ id: 'objective', description: 'Check synthetic evidence' }], preconditions: [{ id: 'ready-check', description: 'Evidence ready', evidenceKey: 'ready' }], inputs: [{ id: 'ready', type: 'boolean' }, { id: 'score', type: 'number' }], parameters: [{ id: 'minimum', type: 'number', default: 10 }], deliverables: [{ id: 'report', description: 'Synthetic report' }], rules: [{ id: 'quality', target: 'Synthetic quality', evidenceKey: 'score', operator: 'gte', parameterRef: 'minimum', severity: 'warning', blocking: false }], sourceMappings: mappings(['objective', 'ready-check', 'ready', 'score', 'minimum', 'report', 'quality']) };
const input = { schema: 'runtime-composition/v1', ontologyInstance: { entities: [{ id: 'one', conceptRef: 'item', properties: { quantity: [2] } }], relations: [] }, harness: { mode: 'component', evidence: { id: 'observation', version: '0.1.0', source: { locator: 'synthetic://workspace-cutover/observation', revision: 'r1', digest: sha256({ ready: true, score: 12 }) }, values: { ready: true, score: 12 } }, configuration: {} } };
const humanEvidenceRef = 'synthetic://ephemeral-e2e-decisions/no-user-project-authority';
async function installedFixture() {
  const f = await assembly(true);
  for (const relative of ['dist/integration/workspace', 'dist/plugins', 'dist/expert', 'workspace/templates']) fs.cpSync(path.join(sourceRoot, relative), path.join(f.install, relative), { recursive: true });
  const manifest = [];
  function visit(root, relative = '') {
    for (const name of fs.readdirSync(root)) {
      const filename = path.join(root, name), key = relative ? relative + '/' + name : name;
      if (fs.lstatSync(filename).isDirectory()) visit(filename, key);
      else manifest.push({ path: key, sha256: createHash('sha256').update(fs.readFileSync(filename)).digest('hex') });
    }
  }
  visit(f.install);
  const managed = path.join(f.base, 'managed'); fs.mkdirSync(managed, { mode: 0o700 });
  const configPath = path.join(managed, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ ...f.config, installationId: path.basename(f.base), workspaceRoot: null, workspaceId: null, manifest }), { mode: 0o600 });
  return { ...f, configPath, projectRoot: path.join(f.base, 'project'), stateRoot: path.join(f.base, 'state'), workspaceId: 'cutover-workspace', async cleanup() { await f.api.stopConnection(configPath); await f.cleanup(); } };
}
async function adapter(f) {
  const child = spawn(process.execPath, [path.join(f.install, 'dist/plugins/codex/server.js'), '--config', f.configPath], { stdio: ['pipe', 'pipe', 'pipe'], env: { LANG: 'C', TZ: 'UTC', OPENSSL_CONF: '/dev/null' } });
  let serial = 0, buffer = '', errors = ''; const pending = new Map();
  child.stderr.on('data', bytes => errors += bytes);
  child.stdout.on('data', bytes => {
    buffer += bytes;
    for (let newline; (newline = buffer.indexOf('\n')) >= 0;) {
      const value = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      const waiter = pending.get(value.id); if (waiter) { pending.delete(value.id); clearTimeout(waiter.timer); waiter.resolve(value); }
    }
  });
  child.on('exit', code => { for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(Error('Adapter exited ' + code + ': ' + errors)); } pending.clear(); });
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error('Adapter response timeout: ' + errors)); }, 15000);
    pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'actual-installed-cutover-e2e', version: '0.2.0' } });
  return {
    async tool(name, args = {}, expectedError) {
      const response = await send('tools/call', { name: 'evopilot_v01_' + name, arguments: args });
      assert(!response.error, JSON.stringify(response.error));
      const result = response.result.structuredContent;
      if (expectedError) assert.equal(result.error?.code, expectedError, JSON.stringify(result));
      else assert(!response.result.isError, JSON.stringify(result));
      return result;
    },
    async close() { if (child.exitCode !== null || child.signalCode !== null) return; const done = new Promise(resolve => child.once('exit', resolve)); child.stdin.end(); await done; },
  };
}
async function seed(mcp) {
  let serial = 0;
  const read = async (owner, operation, input = {}) => (await mcp.tool('request', { owner, envelope: { operation, scope, input } })).result;
  const write = async (owner, operation, input) => {
    const revision = (await read(owner, 'workspace.inspect')).revision;
    return (await mcp.tool('request', { owner, envelope: { operation, scope, input, requestId: 'cutover-write-' + (++serial), expectedRevision: revision } })).result;
  };
  const pins = {};
  for (const owner of ['ontology', 'harness']) {
    const value = owner === 'ontology' ? model : { ...asset, dependencies: [pins.ontology] }, identity = { id: value.id, version: value.version };
    await write(owner, 'asset.put', { [owner === 'ontology' ? 'model' : 'asset']: value });
    const review = (await write(owner, 'asset.review', identity)).result;
    await write(owner, 'asset.decide', { ...identity, reviewDigest: review.reviewDigest, decision: 'APPROVE', humanEvidenceRef });
    pins[owner] = (await write(owner, 'asset.publish', identity)).result.reference;
  }
  await write('runtime', 'project.create', { name: 'Synthetic cutover project' });
  await write('runtime', 'goal.create', { id: 'goal', description: 'Retain actual owning records through workspace cutover' });
  const prepared = (await write('runtime', 'run.prepare', { id: 'run', goalId: 'goal', ...pins, input })).result;
  await write('runtime', 'run.decide', { id: 'run', reviewDigest: prepared.reviewDigest, decision: 'APPROVE', humanEvidenceRef });
  const dispatched = (await mcp.tool('dispatch', { args: { scope, id: 'run', requestId: 'cutover-dispatch', expectedRevision: (await read('runtime', 'workspace.inspect')).revision } })).result;
  assert.equal(dispatched.result.stage, 'SUCCEEDED'); assert.equal(dispatched.result.outcome.receipt.result.evaluation, 'PASS');
  return readback(mcp);
}
async function readback(mcp) {
  const read = async (owner, operation, input = {}) => (await mcp.tool('request', { owner, envelope: { operation, scope, input } })).result;
  const run = await read('runtime', 'run.inspect', { id: 'run' });
  return { runtime: { run, receipt: await read('runtime', 'receipt.inspect', { requestId: 'cutover-dispatch' }) }, ontology: await read('ontology', 'asset.inspect', { id: model.id, version: model.version }), harness: { asset: await read('harness', 'asset.inspect', { id: asset.id, version: asset.version }), evaluation: await read('harness', 'evaluation.inspect', { requestId: run.outcome.receipt.providerReceiptId }) } };
}
async function initialize(f, mcp) {
  const result = await mcp.tool('workspace_initialize', { projectRoot: f.projectRoot, stateRoot: f.stateRoot, workspaceId: f.workspaceId, requestId: 'initialize-cutover' });
  assert.equal(result.sessionActive, false); await mcp.tool('activate');
}

test('V02-D03: actual installed MCP migration, fresh installation attachment and all-owner immutable readback', { timeout: 60000 }, async () => {
  const original = await installedFixture(), next = await installedFixture(); let first, second; const keys = [];
  try {
    first = await adapter(original); await initialize(original, first); const before = await seed(first);
    const projectBytes = fs.readFileSync(path.join(original.projectRoot, 'README.md'));
    const destinationProjectRoot = path.join(original.base, 'migrated-project'), destinationStateRoot = path.join(original.base, 'migrated-state');
    const migrated = await first.tool('workspace_migrate', { destinationProjectRoot, destinationStateRoot, requestId: 'migrate-cutover' });
    assert.equal(migrated.result.status, 'VERIFIED'); assert.equal(migrated.sessionActive, false); keys.push(...migrated.result.requiredKeyIds);
    const originalBinding = (await first.tool('workspace_inspect')).result;
    assert.equal(originalBinding.stateRoot, original.stateRoot, 'Migration does not hot-switch the installation');
    assert.deepEqual(fs.readFileSync(path.join(original.projectRoot, 'README.md')), projectBytes);
    await first.tool('workspace_attach', { projectRoot: destinationProjectRoot, stateRoot: destinationStateRoot, workspaceId: original.workspaceId, requestId: 'reject-hot-switch' }, 'WORKSPACE_ALREADY_BOUND');
    second = await adapter(next);
    const attached = await second.tool('workspace_attach', { projectRoot: destinationProjectRoot, stateRoot: destinationStateRoot, workspaceId: original.workspaceId, requestId: 'attach-migrated' });
    assert.equal(attached.sessionActive, false); assert.equal(attached.result.stateRoot, destinationStateRoot);
    const active = await second.tool('activate'); assert.equal(active.connection.identity.workspaceRoot, destinationStateRoot);
    assert.equal(active.connection.identity.installationId, path.basename(next.base));
    const after = await readback(second); assert.deepEqual(after, before, 'All historical assets, decisions, run, provider evaluation and request receipt retain exact values');
    assert.equal(after.runtime.run.attemptCount, 1); assert.equal(after.runtime.run.plan.workspace.canonicalRoot, original.stateRoot, 'Historical Run keeps original workspace identity');
    const marker = JSON.parse(fs.readFileSync(path.join(destinationStateRoot, 'workspace.json')));
    assert.equal(marker.canonicalRoot, destinationStateRoot); assert.equal(marker.id, original.workspaceId);
    assert.deepEqual(fs.readFileSync(path.join(destinationProjectRoot, 'README.md')), projectBytes);
    // The retained source can still be read without producing a new Run.
    await first.tool('activate'); assert.deepEqual(await readback(first), before);
  } finally {
    await first?.close(); await second?.close(); await next.cleanup(); await original.cleanup();
    for (const id of keys) fs.rmSync(path.join(homedir(), '.local/share/evopilot/relocation-keys', id + '.key'), { force: true });
  }
});

test('V02-D02: actual MCP backup, passive inspection, occupied restore refusal and missing-root restore/reactivation', { timeout: 45000 }, async () => {
  const f = await installedFixture(); let mcp;
  try {
    mcp = await adapter(f); await initialize(f, mcp); const before = await seed(mcp);
    const backupRoot = path.join(f.base, 'backup'), bytes = fs.readFileSync(path.join(f.projectRoot, 'README.md'));
    const backup = await mcp.tool('workspace_backup', { destinationRoot: backupRoot, requestId: 'backup-cutover' });
    assert.equal(backup.result.status, 'VERIFIED'); assert.equal(backup.sessionActive, false); assert.equal((await f.api.inspectConnection(f.configPath)).active, false);
    const inspected = await mcp.tool('workspace_backup_inspect', { backupRoot, requestId: 'inspect-backup-cutover' });
    assert.equal(inspected.result.manifestDigest, backup.result.manifestDigest); assert.equal(inspected.sessionActive, false);
    const denied = await mcp.tool('workspace_restore', { backupRoot, requestId: 'reject-occupied-restore' }, 'MAINTENANCE_DESTINATION_NOT_EMPTY');
    assert.equal(denied.sessionActive, false); assert.deepEqual(fs.readFileSync(path.join(f.projectRoot, 'README.md')), bytes);
    // Deliberate loss only inside this test's private synthetic workspace.
    fs.rmSync(f.projectRoot, { recursive: true }); fs.rmSync(f.stateRoot, { recursive: true });
    const restored = await mcp.tool('workspace_restore', { backupRoot, requestId: 'restore-missing-roots' });
    assert.equal(restored.result.status, 'VERIFIED'); assert.equal(restored.sessionActive, false);
    assert.deepEqual(fs.readFileSync(path.join(f.projectRoot, 'README.md')), bytes);
    await mcp.tool('activate'); assert.deepEqual(await readback(mcp), before); assert.equal(before.runtime.run.attemptCount, 1);
  } finally { await mcp?.close(); await f.cleanup(); }
});
