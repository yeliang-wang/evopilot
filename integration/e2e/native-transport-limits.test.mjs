import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LIMITS, connectionBodyLimit, connectionResponseLimit, connectionCorrelation, mcpOutputLimit } from '../../dist/integration/connection/config.js';
import { transport } from '../../dist/integration/connection/client.js';
import { nativeSha256 } from '../../dist/integration/compatibility/v1/native.mjs';
import { assembly, rawRequest } from './connection.test.mjs';
import { fixture } from './fixtures/native-project.mjs';
import { syntheticDecisionEvidence } from './fixtures/decision-evidence.mjs';
import { rehash } from '../../projects/evopilot-ontology/tests/fixtures/native/package.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)), MiB = 1048576;
const sha = value => createHash('sha256').update(value).digest('hex');
const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'synthetic-native-transport', version: '1' } } };
const call = (id, action, args = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'evopilot_v01_' + action, arguments: args } });
const data = result => result.result.structuredContent;
const ownerPayload = (owner, operation = 'native.package.put', input = {}) => ({ owner, envelope: { operation, scope: { visibility: 'private', projectId: 'synthetic-project' }, input } });

test('route budgets remain closed: only package upload/materialization expands input; readback expands only response', () => {
  assert.equal(LIMITS.body, MiB); assert.equal(LIMITS.response, 8 * MiB);
  for (const owner of ['ontology', 'harness']) {
    assert.equal(connectionBodyLimit('native', ownerPayload(owner)), 8 * MiB);
    for (const operation of ['native.package.inspect', 'native.package.readback', 'native.package.publish', 'native.receipt.inspect']) {
      assert.equal(connectionBodyLimit('native', ownerPayload(owner, operation)), MiB);
      assert.equal(connectionResponseLimit('native', ownerPayload(owner, operation)), 16 * MiB);
      assert.equal(mcpOutputLimit('native', ownerPayload(owner, operation)), 32 * MiB);
    }
    for (const operation of ['native.package.validate', 'native.package.decide', 'native.package.put.extra']) {
      assert.equal(connectionBodyLimit('native', ownerPayload(owner, operation)), MiB);
      assert.equal(connectionResponseLimit('native', ownerPayload(owner, operation)), 8 * MiB);
    }
  }
  assert.equal(connectionBodyLimit('native_project', { operation: 'materialize', input: {} }), 8 * MiB);
  for (const invalid of [null, [], { toString: null }, { toString: [] }]) {
    assert.equal(connectionBodyLimit('native', { owner: invalid, envelope: { operation: 'native.package.put' } }), MiB);
    assert.equal(connectionResponseLimit('native', { owner: 'ontology', envelope: { operation: invalid } }), 8 * MiB);
  }
  for (const [action, payload] of [['request', ownerPayload('ontology')], ['native', ownerPayload('runtime')], ['native', ownerPayload('foreign')], ['native_project', { operation: 'prepare' }], ['native_project', { operation: 'inspect' }], ['dispatch', {}], [null, null]]) {
    assert.equal(connectionBodyLimit(action, payload), MiB); assert.equal(connectionResponseLimit(action, payload), 8 * MiB);
  }
  for (const owner of ['runtime', 'harness', 'ontology']) assert.equal(connectionCorrelation('native', ownerPayload(owner)).owner, owner);
  for (const owner of ['foreign', null, {}, ['ontology']]) assert.equal(connectionCorrelation('native', ownerPayload(owner)).owner, undefined);
  assert.equal(connectionCorrelation('request', ownerPayload('ontology')).owner, undefined);
});

test('actual HTTP client counts UTF-8 envelope bytes at exact normal/native boundaries before sending', async () => {
  let admitted = 0;
  const identity = { synthetic: true }, c = { protocol: 'synthetic/v1', identity }, record = { identity, nonce: 'synthetic', token: 'synthetic', pid: process.pid, port: 0 };
  const server = http.createServer(async (req, res) => {
    for await (const ignored of req) { void ignored; }
    admitted++; res.end(JSON.stringify({ identity, nonce: record.nonce, pid: record.pid, result: { admitted } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); record.port = server.address().port;
  try {
    for (const [action, operation, limit] of [['request', 'synthetic', MiB], ['native', 'native.package.put', 8 * MiB]]) {
      const payload = ownerPayload('ontology', operation, { value: '数据库' });
      const wire = () => JSON.stringify({ protocol: c.protocol, identity, nonce: record.nonce, action, payload });
      payload.envelope.input.value += 'x'.repeat(limit - Buffer.byteLength(wire()));
      assert.equal(Buffer.byteLength(wire()), limit);
      await transport(c, record, action, payload);
      const before = admitted; payload.envelope.input.value += 'x';
      assert.throws(() => transport(c, record, action, payload), { code: 'LIMIT' });
      assert.equal(admitted, before, 'Rejected client request never reaches the listener');
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('HTTP disconnect, malformed and oversized responses preserve materialize identity without redispatch', async () => {
  // Protocol-only failures after receiving a request, not an owner mutation.
  const identity = { synthetic: true }, c = { protocol: 'synthetic/v1', identity }, record = { identity, nonce: 'synthetic', token: 'synthetic', pid: process.pid, port: 0 };
  const payload = { operation: 'materialize', input: { scope: { visibility: 'private', projectId: 'synthetic-project' }, id: 'retained-candidate', packages: { synthetic: 'must-not-echo' } } };
  const expected = { scope: payload.input.scope, operation: 'materialize', id: payload.input.id };
  let mode = 'disconnect', attempts = 0;
  const server = http.createServer(async (req, res) => {
    for await (const ignored of req) { void ignored; }
    attempts++;
    if (mode === 'disconnect') req.socket.destroy();
    else if (mode === 'malformed') res.end('{');
    else res.end(JSON.stringify({ identity, nonce: record.nonce, pid: record.pid, result: { padding: 'x'.repeat(LIMITS.nativeResponse) } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); record.port = server.address().port;
  try {
    for (mode of ['disconnect', 'malformed', 'oversized']) {
      const before = attempts;
      await assert.rejects(transport(c, record, 'native_project', payload), error => {
        assert.equal(error.code, 'UNKNOWN'); assert.deepEqual(error.correlation, expected); return true;
      });
      assert.equal(attempts, before + 1, 'Transport must never retry an uncertain materialization');
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('MCP package publication/receipt responses retain large payloads and oversized dispatched outcomes stay UNKNOWN', () => {
  // Protocol-only fault injection, not owner publication or human approval.
  const clientURL = new URL('../../dist/integration/connection/client.js', import.meta.url).href;
  const dataURL = source => 'data:text/javascript,' + encodeURIComponent(source);
  const stub = `
    const ready={active:true,pid:123,identity:{synthetic:true}};
    export const inspectConnection=async()=>ready,activateConnection=async()=>ready;
    export const withWorkspaceMaintenance=async()=>{throw Error('Unexpected maintenance');};
    export const callConnection=async(_config,_action,payload)=>({synthetic:true,value:(payload.envelope?.input??payload.input).id==='oversize'?'"'.repeat(6*1048576):'x'.repeat(5*1048576)});
  `;
  const hook = dataURL(`import {registerHooks} from 'node:module'; registerHooks({resolve(specifier,context,next){if((specifier.startsWith('.')||specifier.startsWith('/')||specifier.startsWith('file:'))&&new URL(specifier,context.parentURL).href===${JSON.stringify(clientURL)})return{url:${JSON.stringify(dataURL(stub))},shortCircuit:true};return next(specifier,context);}});`);
  const publish = ownerPayload('harness', 'native.package.publish', { id: 'large', version: '1.0.0' });
  publish.envelope.requestId = 'synthetic-publication'; publish.envelope.expectedRevision = 3;
  const materialize = { operation: 'materialize', input: { scope: publish.envelope.scope, id: 'oversize', packages: { synthetic: 'must-not-echo' } } };
  const messages = [init, call(2, 'activate'), call(3, 'native', publish), call(4, 'native', ownerPayload('harness', 'native.receipt.inspect', { requestId: 'synthetic-publication' })), call(5, 'native', { ...publish, envelope: { ...publish.envelope, input: { id: 'oversize', version: '1.0.0' } } }), call(6, 'native_project', materialize), { jsonrpc: '2.0', id: 7, method: 'ping' }];
  const out = spawnSync(process.execPath, ['--import', hook, path.join(root, 'dist/plugins/codex/server.js'), '--config', path.join(root, 'synthetic-no-configuration.json')], { input: messages.map(message => JSON.stringify(message)).join('\n') + '\n', encoding: 'utf8', maxBuffer: 40 * MiB, timeout: 20000 });
  assert.ifError(out.error); assert.equal(out.status, 0, out.stderr);
  const replies = out.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(data(replies[2]).result.value.length, 5 * MiB);
  assert.equal(data(replies[3]).result.value.length, 5 * MiB);
  assert.equal(data(replies[4]).error.code, 'UNKNOWN');
  assert.equal(data(replies[4]).error.correlation.requestId, 'synthetic-publication');
  assert.equal(data(replies[4]).error.correlation.operation, 'native.package.publish');
  assert.equal(data(replies[5]).error.code, 'UNKNOWN');
  assert.deepEqual(data(replies[5]).error.correlation, { scope: materialize.input.scope, operation: 'materialize', id: materialize.input.id });
  assert.deepEqual(replies[6].result, {});
});

async function installedFixture() {
  const f = await assembly(true);
  for (const relative of ['dist/integration/workspace', 'dist/plugins', 'dist/expert', 'workspace/templates']) fs.cpSync(path.join(root, relative), path.join(f.install, relative), { recursive: true });
  const manifest = [];
  function walk(dir, prefix = '') {
    for (const name of fs.readdirSync(dir)) {
      const relative = prefix ? prefix + '/' + name : name, filename = path.join(dir, name);
      if (fs.lstatSync(filename).isDirectory()) walk(filename, relative);
      else manifest.push({ path: relative, sha256: sha(fs.readFileSync(filename)) });
    }
  }
  walk(f.install);
  const managed = path.join(f.base, 'managed'); fs.mkdirSync(managed, { mode: 0o700 });
  const configPath = path.join(managed, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ ...f.config, workspaceRoot: null, workspaceId: null, manifest }), { mode: 0o600 });
  const bootstrap = await import(pathToFileURL(path.join(f.install, 'dist/integration/workspace/bootstrap.js')));
  const input = { requestId: 'synthetic-transport-setup', projectRoot: path.join(f.base, 'project'), stateRoot: f.config.workspaceRoot, workspaceId: f.config.workspaceId };
  await bootstrap.setupWorkspace(configPath, input);
  return { ...f, configPath, input, async cleanup() {
    await f.api.stopConnection(configPath);
    const c = f.configuration.loadConfiguration(configPath), record = f.control.readRecord(c);
    if (record && !f.control.processDead(record.pid)) throw Error('Retain fixture: owned daemon still running');
    fs.rmSync(f.base, { recursive: true, force: true });
  } };
}
function conversation(f, messages) {
  const wire = [init, ...messages].map(message => typeof message === 'string' ? message : JSON.stringify(message)).join('\n') + '\n';
  const out = spawnSync(process.execPath, [path.join(f.install, 'dist/plugins/codex/server.js'), '--config', f.configPath], { input: wire, encoding: 'utf8', timeout: 30000, maxBuffer: 40 * MiB, env: { LANG: 'C', TZ: 'UTC', OPENSSL_CONF: '/dev/null' } });
  assert.ifError(out.error); assert.equal(out.status, 0, out.stderr);
  return { messages: out.stdout.trim().split('\n').map(line => JSON.parse(line)), outputBytes: Buffer.byteLength(out.stdout) };
}

// Each owner keeps its own 60s test budget. Running six durable write/readback
// journeys in one deadline couples unrelated owners under full-suite I/O load.
for (const owner of ['ontology', 'harness']) test(`actual installed ${owner} owner commit survives lost, malformed and over-budget HTTP replies without redispatch`, { timeout: 60000 }, async t => {
  const startedAt = performance.now();
  let phase = 'fixture', faultMode = null;
  const mark = value => { phase = value; t.signal.throwIfAborted(); };
  const f = await installedFixture(), source = fixture();
  let proxy, original, configuration, intercepted = 0, committedReply;
  const proxyErrors = [], upstreamRequests = new Set();
  // node:test cancellation does not cancel arbitrary promises. Close only this
  // fixture's sockets so a timed-out proxy cannot outlive its test and overlap
  // the next test's synchronous MCP child process.
  const abortProxy = () => {
    for (const upstream of upstreamRequests) upstream.destroy(Error('Synthetic proxy test aborted'));
    proxy?.closeAllConnections();
  };
  t.signal.addEventListener('abort', abortProxy, { once: true });
  try {
    mark('activate');
    await f.api.activateConnection(f.configPath);
    configuration = f.configuration.loadConfiguration(f.configPath); original = f.control.readRecord(configuration);
    proxy = http.createServer(async (req, res) => {
      try {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const bytes = Buffer.concat(chunks), message = JSON.parse(bytes.toString());
        assert.equal(req.headers.authorization, 'Bearer ' + original.token);
        assert.deepEqual(message.identity, original.identity); assert.equal(message.nonce, original.nonce);
        assert.equal(message.action, 'native'); assert.equal(message.payload.envelope.operation, 'native.package.put');
        intercepted++;
        const forwarded = await new Promise((resolve, reject) => {
          const upstream = http.request({ hostname: '127.0.0.1', port: original.port, path: '/', method: 'POST', agent: false,
            headers: { ...req.headers, host: '127.0.0.1:' + original.port } }, response => {
            const output = []; response.on('data', chunk => output.push(chunk)); response.on('error', reject);
            response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(output) }));
          });
          upstreamRequests.add(upstream); upstream.once('close', () => upstreamRequests.delete(upstream));
          upstream.setTimeout(10000, () => upstream.destroy(Error('Owned daemon forward timed out')));
          upstream.on('error', reject); upstream.end(bytes);
        });
        assert.equal(forwarded.status, 200);
        const reply = JSON.parse(forwarded.body.toString());
        assert.deepEqual(reply.identity, original.identity); assert.equal(reply.nonce, original.nonce); assert.equal(reply.pid, original.pid);
        assert.equal(reply.error, undefined); assert.equal(reply.result.operation, 'native.package.put');
        assert.ok(Number.isSafeInteger(reply.result.revision)); assert.match(reply.result.requestDigest, /^sha256:[a-f0-9]{64}$/);
        // Harness retains an async status; Ontology's synchronous put receipt
        // commits directly. Both must match owner readback after the fault.
        if (message.payload.owner === 'harness') assert.equal(reply.result.status, 'SUCCEEDED');
        assert.equal(reply.result.requestId, message.payload.envelope.requestId);
        committedReply = reply.result; // Fault starts only after the real owner confirms its durable commit.
        if (faultMode === 'disconnect') req.socket.destroy();
        else if (faultMode === 'malformed') res.end('{');
        else res.end(JSON.stringify({ ...reply, padding: 'x'.repeat(LIMITS.nativeResponse) }));
      } catch (error) { proxyErrors.push(error); res.destroy(); }
    });
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    for (faultMode of ['disconnect', 'malformed', 'oversized']) {
      const caseStartedAt = performance.now();
      mark('inspect-before');
      const before = await f.api.callConnection(f.configPath, 'inspect', { owner, scope: source.scope });
      const pkg = structuredClone(source.packages[owner]); pkg.manifest.id = `post-write-${owner}-${faultMode}`; rehash(pkg);
      const payload = ownerPayload(owner, 'native.package.put', { package: pkg });
      payload.envelope.requestId = `post-write-${owner}-${faultMode}`; payload.envelope.expectedRevision = before.revision;
      const attempts = intercepted; committedReply = undefined;
      // Test-only routing change: authentication, exact installation identity and
      // daemon nonce stay intact. The proxy never handles daily configuration.
      f.control.writeRecord(configuration, { ...original, port: proxy.address().port });
      try {
        mark('forward-and-lose-reply');
        await assert.rejects(f.api.callConnection(f.configPath, 'native', payload), error => {
          assert.equal(error.code, 'UNKNOWN');
          assert.deepEqual(error.correlation, { owner, requestId: payload.envelope.requestId, scope: source.scope, expectedRevision: before.revision, operation: 'native.package.put' });
          return true;
        });
      } finally { f.control.writeRecord(configuration, original); }
      mark('retained-receipt');
      assert.deepEqual(proxyErrors, []); assert.equal(intercepted, attempts + 1, 'Unknown write is never automatically sent twice');
      assert.ok(committedReply, 'A durable real owner receipt precedes the injected reply failure');
      const retained = await f.api.callConnection(f.configPath, 'native', ownerPayload(owner, 'native.receipt.inspect', { requestId: payload.envelope.requestId }));
      assert.deepEqual(retained, committedReply);
      mark('retained-package');
      const inspected = await f.api.callConnection(f.configPath, 'native', ownerPayload(owner, 'native.package.inspect', { id: pkg.manifest.id, version: pkg.manifest.version }));
      assert.deepEqual(inspected.package, pkg);
      mark('explicit-replay');
      const after = await f.api.callConnection(f.configPath, 'inspect', { owner, scope: source.scope }); assert.ok(after.revision > before.revision);
      assert.deepEqual(await f.api.callConnection(f.configPath, 'native', payload), retained, 'Explicit same-request replay returns the exact original owner receipt');
      assert.deepEqual(await f.api.callConnection(f.configPath, 'inspect', { owner, scope: source.scope }), after, 'Replay adds no owner mutation or revision');
      t.diagnostic(JSON.stringify({ synthetic: true, actualOwnerCommit: true, owner, faultMode, requestId: payload.envelope.requestId, receiptDigest: nativeSha256(retained), automaticAttempts: 1, caseElapsedMs: Math.round(performance.now() - caseStartedAt), totalElapsedMs: Math.round(performance.now() - startedAt) }));
    }
  } catch (error) {
    t.diagnostic(JSON.stringify({ synthetic: true, owner, faultMode, phase, elapsedMs: Math.round(performance.now() - startedAt), errorCode: error.code ?? null, message: error.message }));
    throw error;
  } finally {
    t.signal.removeEventListener('abort', abortProxy);
    if (original && configuration) f.control.writeRecord(configuration, original);
    abortProxy();
    if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
    try { await f.cleanup(); source.cleanup(); }
    catch (error) { t.diagnostic(JSON.stringify({ synthetic: true, owner, phase: 'cleanup', elapsedMs: Math.round(performance.now() - startedAt), errorCode: error.code ?? null })); throw error; }
  }
});

test('installed MCP/client/daemon materialize both large packages and refuse over-budget requests without owner/project writes', { timeout: 90000 }, async t => {
  const startedAt = performance.now(); let phase = 'fixture';
  const mark = value => { phase = value; t.signal.throwIfAborted(); };
  const f = await installedFixture(), source = fixture();
  try {
    mark('malformed-protocol');
    const malformed = conversation(f, [
      call(2, 'native', { owner: { toString: null }, envelope: { operation: 'native.package.put' } }),
      call(3, 'native', ownerPayload('ontology', { toString: null })),
      { jsonrpc: '2.0', id: 4, method: 'ping' },
    ]);
    assert.equal(malformed.messages[1].error.code, -32602);
    assert.equal(malformed.messages[2].error.code, -32602);
    assert.deepEqual(malformed.messages[3].result, {});
    // Synthetic bytes only: package semantics and frozen independent scope are preserved.
    for (const pkg of Object.values(source.packages)) { pkg.files['sources/transport-size.txt'] = 'x'.repeat(700000); rehash(pkg); }
    mark('activate');
    await f.api.activateConnection(f.configPath);
    mark('reject-missing-candidate');
    const activeConfig = f.configuration.loadConfiguration(f.configPath), activeRecord = f.control.readRecord(activeConfig);
    const rejectedMaterialize = await rawRequest(f, activeRecord, 'native_project', { operation: 'materialize', input: { scope: source.scope, id: 'missing-candidate', packages: source.packages } });
    assert.equal(rejectedMaterialize.status, 400);
    const rejectedMaterializeError = JSON.parse(rejectedMaterialize.body).error;
    assert.equal(rejectedMaterializeError.code, 'ENOENT');
    assert.deepEqual(rejectedMaterializeError.correlation, { scope: source.scope, operation: 'materialize', id: 'missing-candidate' });
    mark('prepare-and-freeze');
    const prepared = await f.api.callConnection(f.configPath, 'native_project', { operation: 'prepare', input: source.input });
    await f.api.callConnection(f.configPath, 'native_project', { operation: 'freeze', input: { scope: source.scope, id: source.input.id, reviewDigest: prepared.reviewDigest, humanEvidenceRef: syntheticDecisionEvidence(f.base, { owner: 'project', operation: 'freeze', workspaceId: f.input.workspaceId, scope: source.scope, reviewDigest: prepared.reviewDigest, decision: 'ACCEPT' }) } });
    const materialize = { operation: 'materialize', input: { scope: source.scope, id: source.input.id, packages: source.packages } };
    const inputBytes = Buffer.byteLength(JSON.stringify(call(3, 'native_project', materialize)));
    assert(inputBytes > MiB && inputBytes < LIMITS.nativeBody);
    mark('materialize');
    const materialized = conversation(f, [call(2, 'activate'), call(3, 'native_project', materialize), call(4, 'native_project', { operation: 'check-layout', input: { scope: source.scope, id: source.input.id } })]);
    assert.deepEqual(data(materialized.messages[2]).result.packages, source.packages);
    assert.equal(data(materialized.messages[3]).result.conforms, true);
    t.diagnostic(JSON.stringify({ synthetic: true, materializeInputBytes: inputBytes, materializeConversationOutputBytes: materialized.outputBytes }));

    const c = f.configuration.loadConfiguration(f.configPath), record = f.control.readRecord(c);
    const ownerState = () => f.api.callConnection(f.configPath, 'inspect', { owner: 'ontology', scope: source.scope });
    mark('reject-input-over-budget');
    const before = await ownerState();
    const oversized = ownerPayload('ontology', 'native.package.put', { package: { padding: 'x'.repeat(LIMITS.nativeBody) } });
    oversized.envelope.requestId = 'must-not-write'; oversized.envelope.expectedRevision = before.revision;
    await assert.rejects(f.api.callConnection(f.configPath, 'native', oversized), { code: 'LIMIT' });
    const normal = ownerPayload('ontology', 'native.package.put', { package: { padding: 'x'.repeat(MiB) } });
    const ordinary = await rawRequest(f, record, 'request', normal);
    assert.equal(ordinary.status, 400); assert.equal(JSON.parse(ordinary.body).error.code, 'LIMIT');
    // Direct authenticated bypass of client must still fail before the owner claims a request.
    try { const rejected = await rawRequest(f, record, 'native', oversized); assert.equal(JSON.parse(rejected.body).error.code, 'LIMIT'); }
    catch (error) { assert(['ECONNRESET', 'EPIPE'].includes(error.code), 'Only bounded stream rejection may close the socket'); }
    assert.deepEqual(await ownerState(), before);
    const candidatePath = await f.api.callConnection(f.configPath, 'native_project', { operation: 'candidate-location', input: { scope: source.scope, id: source.input.id } });
    const manifestBefore = fs.readFileSync(path.join(candidatePath, 'project-manifest.json'));
    const overMaterialize = { operation: 'materialize', input: { ...materialize.input, packages: { padding: 'x'.repeat(LIMITS.nativeBody) } } };
    const rejected = conversation(f, [call(2, 'activate'), call(3, 'native', oversized), call(4, 'native_project', overMaterialize), call(5, 'native_project', { operation: 'inspect', input: { padding: 'x'.repeat(MiB) } }), { jsonrpc: '2.0', id: 6, method: 'ping' }]);
    assert(rejected.messages.slice(2, 5).every(message => message.error.code === -32600));
    assert.deepEqual(rejected.messages[5].result, {});
    assert.deepEqual(fs.readFileSync(path.join(candidatePath, 'project-manifest.json')), manifestBefore);
    assert.deepEqual(await ownerState(), before);

    // Near the entire accepted body budget, quote/backslash-heavy package files
    // exercise text JSON escaping as well as structuredContent after the write.
    mark('near-limit-materialize');
    const nearInput = { ...source.input, id: 'near-native-limit' };
    const nearPrepared = await f.api.callConnection(f.configPath, 'native_project', { operation: 'prepare', input: nearInput });
    await f.api.callConnection(f.configPath, 'native_project', { operation: 'freeze', input: { scope: source.scope, id: nearInput.id, reviewDigest: nearPrepared.reviewDigest, humanEvidenceRef: syntheticDecisionEvidence(f.base, { owner: 'project', operation: 'freeze', workspaceId: f.input.workspaceId, scope: source.scope, reviewDigest: nearPrepared.reviewDigest, decision: 'ACCEPT' }) } });
    const near = { operation: 'materialize', input: { scope: source.scope, id: nearInput.id, packages: structuredClone(source.packages) } };
    for (const pkg of Object.values(near.input.packages)) { pkg.files['sources/transport-size.txt'] = '"\\'.repeat(900000); rehash(pkg); }
    const nearLimit = LIMITS.nativeBody - 16384;
    near.input.packages.harness.files['sources/transport-size.txt'] += 'x'.repeat(nearLimit - Buffer.byteLength(JSON.stringify(call(3, 'native_project', near))));
    rehash(near.input.packages.harness);
    assert.equal(Buffer.byteLength(JSON.stringify(call(3, 'native_project', near))), nearLimit);
    const nearOut = conversation(f, [call(2, 'activate'), call(3, 'native_project', near)]);
    assert.deepEqual(data(nearOut.messages[2]).result.packages, near.input.packages);
    assert(nearOut.outputBytes > LIMITS.response && nearOut.outputBytes < LIMITS.nativeOutput);
    t.diagnostic(JSON.stringify({ synthetic: true, nearNativeBodyInputBytes: nearLimit, escapedMaterializeConversationOutputBytes: nearOut.outputBytes }));

    // A valid package response larger than the old MCP output budget must survive
    // both structuredContent and text encoding, including quoting and Unicode.
    mark('large-package-readback');
    const large = structuredClone(source.packages.ontology);
    large.manifest.id = 'synthetic-large-readback'; large.files['sources/transport-size.txt'] = '"\\数据库\n'.repeat(350000); rehash(large);
    const put = ownerPayload('ontology', 'native.package.put', { package: large });
    put.envelope.requestId = 'large-readback-put'; put.envelope.expectedRevision = before.revision;
    const putBytes = Buffer.byteLength(JSON.stringify(call(3, 'native', put)));
    assert(putBytes > MiB && putBytes < LIMITS.nativeBody);
    const read = ownerPayload('ontology', 'native.package.inspect', { id: large.manifest.id, version: large.manifest.version });
    const roundtrip = conversation(f, [call(2, 'activate'), call(3, 'native', put), call(4, 'native', read)]);
    assert.equal(data(roundtrip.messages[2]).error, undefined, JSON.stringify(data(roundtrip.messages[2]).error));
    assert.deepEqual(data(roundtrip.messages[3]).result.package, large);
    assert(roundtrip.outputBytes > LIMITS.response && roundtrip.outputBytes < LIMITS.nativeOutput);
    t.diagnostic(JSON.stringify({ synthetic: true, nativePutInputBytes: putBytes, nativeReadConversationOutputBytes: roundtrip.outputBytes }));
  } catch (error) {
    t.diagnostic(JSON.stringify({ synthetic: true, phase, elapsedMs: Math.round(performance.now() - startedAt), errorCode: error.code ?? null, message: error.message }));
    throw error;
  } finally {
    try { await f.cleanup(); source.cleanup(); }
    catch (error) { t.diagnostic(JSON.stringify({ synthetic: true, phase: 'cleanup', elapsedMs: Math.round(performance.now() - startedAt), errorCode: error.code ?? null })); throw error; }
  }
});

test('optional private package inputs fit fixed transport budgets without retaining package content in test evidence', { skip: !process.env.EVOPILOT_NATIVE_TRANSPORT_PACKAGES }, async t => {
  const filenames = JSON.parse(process.env.EVOPILOT_NATIVE_TRANSPORT_PACKAGES);
  assert.equal(filenames.length, 2);
  const packages = Object.fromEntries(filenames.map(filename => { const pkg = JSON.parse(fs.readFileSync(filename, 'utf8')); return [pkg.manifest.owner, pkg]; }));
  assert.deepEqual(Object.keys(packages).sort(), ['harness', 'ontology']);
  const f = await installedFixture();
  try {
    const messages = [call(2, 'activate')]; let id = 3;
    for (const owner of ['ontology', 'harness']) {
      // Owner put is confined to a disposable test Workspace; no decisions or publication.
      const put = ownerPayload(owner, 'native.package.put', { package: packages[owner] });
      put.envelope.requestId = 'private-input-' + owner; put.envelope.expectedRevision = 0;
      const bytes = Buffer.byteLength(JSON.stringify(call(id, 'native', put)));
      assert(bytes < LIMITS.nativeBody); t.diagnostic(JSON.stringify({ owner, inputBytes: bytes, packageDigest: nativeSha256(packages[owner]) }));
      messages.push(call(id++, 'native', put));
      messages.push(call(id++, 'native', ownerPayload(owner, 'native.package.inspect', { id: packages[owner].manifest.id, version: packages[owner].manifest.version })));
    }
    const out = conversation(f, messages);
    for (const [index, owner] of [[3, 'ontology'], [5, 'harness']]) assert.equal(nativeSha256(data(out.messages[index]).result?.package ?? null), nativeSha256(packages[owner]), JSON.stringify(data(out.messages[index]).error));
    const materializeBytes = Buffer.byteLength(JSON.stringify(call(10, 'native_project', { operation: 'materialize', input: { scope: ownerPayload('ontology').envelope.scope, id: 'private-transport-measurement', packages } })));
    assert(materializeBytes > MiB && materializeBytes < LIMITS.nativeBody);
    t.diagnostic(JSON.stringify({ actualPrivateInput: true, materializeInputBytes: materializeBytes, ownerRoundtripOutputBytes: out.outputBytes }));
  } finally { await f.cleanup(); }
});

test('optional actual candidate bundle installs, backs up and restores isolated owner packages through installed APIs', { skip: !process.env.EVOPILOT_NATIVE_TRANSPORT_BUNDLE, timeout: 90000 }, async t => {
  const bundle = fs.realpathSync(process.env.EVOPILOT_NATIVE_TRANSPORT_BUNDLE);
  const base = fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()), 'evopilot-native-candidate-recovery-'));
  const program = path.join(base, 'program'), configPath = path.join(program, 'config.json');
  const manager = await import(pathToFileURL(path.join(bundle, 'app/scripts/manage-preview.mjs')));
  const source = fixture(); let api;
  try {
    await manager.installPreview({ bundle, root: program, installationId: 'synthetic-native-transport-recovery' });
    await manager.doctorPreview({ root: program });
    const installed = relative => import(pathToFileURL(path.join(program, 'app/dist/integration', relative)));
    api = await installed('connection/client.js');
    const bootstrap = await installed('workspace/bootstrap.js'), maintenance = await installed('workspace/maintenance.js');
    const roots = { projectRoot: path.join(base, 'project'), stateRoot: path.join(base, 'state'), workspaceId: 'synthetic-native-recovery' };
    await bootstrap.setupWorkspace(configPath, { ...roots, requestId: 'candidate-recovery-setup' });
    const active = await api.activateConnection(configPath);
    const expected = {};
    for (const owner of ['ontology', 'harness']) {
      const pkg = source.packages[owner]; pkg.files['sources/transport-size.txt'] = 'x'.repeat(700000); rehash(pkg);
      const put = ownerPayload(owner, 'native.package.put', { package: pkg }); put.envelope.requestId = 'recovery-put-' + owner; put.envelope.expectedRevision = 0;
      await api.callConnection(configPath, 'native', put);
      expected[owner] = await api.callConnection(configPath, 'native', ownerPayload(owner, 'native.package.inspect', { id: pkg.manifest.id, version: pkg.manifest.version }));
    }
    const context = { ...roots, installationRoot: path.join(program, 'app') }, backupRoot = path.join(base, 'backup');
    const backup = await api.withWorkspaceMaintenance(configPath, 'candidate-backup', () => {
      const result = maintenance.maintainWorkspace(context, 'backup', { destinationRoot: backupRoot }, 'candidate-backup');
      assert.equal(maintenance.inspectWorkspaceBackup(context, backupRoot).manifestDigest, result.manifestDigest);
      return result;
    });
    assert.equal(backup.status, 'VERIFIED');
    // Only this test's stopped synthetic roots are removed to simulate loss.
    fs.rmSync(roots.projectRoot, { recursive: true }); fs.rmSync(roots.stateRoot, { recursive: true });
    const restored = await api.withWorkspaceMaintenance(configPath, 'candidate-restore', () => maintenance.maintainWorkspace(context, 'restore', { backupRoot }, 'candidate-restore'), { restoring: true });
    assert.equal(restored.status, 'VERIFIED'); assert.deepEqual(restored.ownerSnapshots, backup.ownerSnapshots);
    await api.activateConnection(configPath);
    for (const owner of ['ontology', 'harness']) {
      const pkg = source.packages[owner];
      const actual = await api.callConnection(configPath, 'native', ownerPayload(owner, 'native.package.inspect', { id: pkg.manifest.id, version: pkg.manifest.version }));
      assert.equal(nativeSha256(actual), nativeSha256(expected[owner]));
    }
    await api.stopConnection(configPath);
    await manager.doctorPreview({ root: program });
    t.diagnostic(JSON.stringify({ synthetic: true, installationId: active.identity.installationId, installationDigest: active.identity.installationDigest, workspaceId: roots.workspaceId, backupManifestDigest: backup.manifestDigest, restoredOwnerSnapshotsEqual: true, restoredOwnerReadbackEqual: true, authority: false }));
  } finally {
    if (api) await api.stopConnection(configPath);
    source.cleanup(); fs.rmSync(base, { recursive: true, force: true });
  }
});
