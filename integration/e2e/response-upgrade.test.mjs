import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createComposition, loadInstalledProducts } from '../../dist/integration/composition.js';
import { readWorkspaceResponseEvidence } from '../../dist/integration/response/evidence.js';
import { maintainWorkspace, inspectWorkspaceBackup } from '../../dist/integration/workspace/maintenance.js';
import { nativeSha256, nativeBytesDigest, referenceForPackage } from '../../dist/integration/compatibility/v1/native.mjs';
import { syntheticHarnessPackage, replaceNativeFile } from '../../projects/evopilot-harness/examples/native/package.mjs';
import { syntheticOnlinePackage } from '../../projects/evopilot-harness/examples/native/online-package.mjs';
import { fixture, freeze } from './fixtures/native-project.mjs';
import { syntheticDecisionEvidence } from './fixtures/decision-evidence.mjs';

// Optional historical executable fixture. Never substitute current code with a
// changed version string: required acceptance runs set both environment paths.
const oldApp = process.env.EVOPILOT_V05_APP;
const owners = ['runtime', 'harness', 'ontology'];
function files(root) {
  const entries = [];
  function visit(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name), stat = fs.lstatSync(file);
      if (stat.isDirectory()) visit(file);
      else if (stat.isSymbolicLink()) entries.push([path.relative(root, file), 'link:' + fs.readlinkSync(file)]);
      else entries.push([path.relative(root, file), nativeBytesDigest(fs.readFileSync(file))]);
    }
  }
  visit(root); return entries;
}
function database(root, owner) {
  const db = new DatabaseSync(path.join(root, 'state', owner, owner + '.db'), { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return { version: db.prepare('PRAGMA user_version').get().user_version, tables: Object.fromEntries(tables.map(({ name }) => {
      assert.match(name, /^[a-z_]+$/); return [name, db.prepare('SELECT * FROM ' + name).all()];
    })) };
  } finally { db.close(); }
}
function preserved(before, after) {
  for (const [table, rows] of Object.entries(before.tables)) {
    assert.ok(after.tables[table], 'Historical table retained: ' + table);
    if (table === 'feedback_identity') {
      const [{ revision: oldRevision, ...oldIdentity }] = rows, [{ revision, ...identity }] = after.tables[table];
      assert.deepEqual(identity, oldIdentity); assert.ok(revision >= oldRevision); continue;
    }
    for (const row of rows) assert.ok(after.tables[table].some(candidate => JSON.stringify(candidate) === JSON.stringify(row)), 'Historical row retained byte-for-byte: ' + table);
  }
}

test('actual installed v0.5 -> current candidate preserves native assets/decisions/history, rejects old readers and restores schema5', { timeout: 150_000, skip: !oldApp && 'Set EVOPILOT_V05_APP to a real immutable v0.5 installation; historical acceptance is not inferred' }, async t => {
  assert.ok(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN, 'Actual pinned native toolchain required');
  const installation = fs.realpathSync(oldApp), installationBefore = files(installation);
  const oldImport = relative => import(pathToFileURL(path.join(installation, relative)).href);
  const oldComposition = await oldImport('dist/integration/composition.js');
  const oldCollector = await oldImport('dist/integration/collection/local.js');
  const oldOnline = await oldImport('node_modules/@evopilot-next/harness/dist/online.js');
  const oldApis = await oldComposition.loadInstalledProducts();
  for (const owner of owners) {
    assert.equal(JSON.parse(fs.readFileSync(path.join(installation, 'node_modules/@evopilot-next', owner, 'package.json'))).version, '0.5.0');
    assert.equal(oldApis[owner].VERSION, '0.5.0');
  }
  const f = fixture('reverse', 'private'), scope = f.scope, options = { workspaceRoot: f.stateRoot, workspaceId: 'synthetic' };
  f.packages.harness.manifest.dependencies = [referenceForPackage(f.packages.ontology)];
  const frozen = await freeze(f); await f.service.materialize({ scope, id: f.input.id, packages: f.packages });
  const binding = await f.service.prepareExecution({ scope, id: f.input.id, executionId: 'historical-collection', toolchainId: 'node' });
  const sourceScope = frozen.candidate.sourceScope;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname !== '/api/v1/query_range') { response.writeHead(404).end(); return; }
    const values = [], query = url.searchParams.get('query');
    for (let time = Number(url.searchParams.get('start')); time <= Number(url.searchParams.get('end')); time += Number(url.searchParams.get('step'))) values.push([time, String(query.startsWith('timestamp(') ? time : query === 'service_probe_window_total' ? 1 : 0)]);
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ status: 'success', data: { resultType: 'matrix', result: [{ metric: { service: 'upgrade-service', environment: 'test', deployment: sourceScope.revision }, values }] } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const trusted = { toolchain: JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN)), ...oldCollector.createLocalCollector({ resolveExecution: f.service.resolveExecution }), inspectSource: f.service.inspectSource, resolveRequirements: f.service.resolveRequirements, verifyProject: f.service.verifyProject,
    online: { collectOnline: oldOnline.createPrometheusCollector([{ id: 'metrics', origin: `http://127.0.0.1:${server.address().port}`, bearerTokenFile: null, freshnessSeconds: 30 }]) } };
  let c = oldComposition.createComposition(options, oldApis, {}, trusted), sequence = 0;
  t.after(async () => { c?.close(); await new Promise(resolve => server.close(resolve)); f.cleanup(); assert.deepEqual(files(installation), installationBefore, 'Historical installed files are read-only'); });
  const read = (owner, operation, input = {}) => c.native(owner, { operation, scope, input });
  const write = async (owner, operation, input, requestId = 'upgrade-' + (++sequence)) => {
    if (input.humanEvidenceRef === 'synthetic') input = { ...input, humanEvidenceRef: syntheticDecisionEvidence(f.root, { owner, operation, workspaceId: options.workspaceId, scope, reviewDigest: input.reviewDigest, decision: input.decision ?? 'APPROVE' }) };
    const additive = /^(feedback|online|response)\./.test(operation);
    const expectedRevision = additive ? (await read(owner, operation.split('.')[0] + '.inspect')).revision : owner === 'runtime' ? (await read(owner, 'workspace.inspect')).revision : c.inspect(owner, scope).revision;
    return c.native(owner, { operation, scope, input, requestId, expectedRevision });
  };
  const publish = async (owner, pkg) => {
    const id = { id: pkg.manifest.id, version: pkg.manifest.version };
    await write(owner, 'native.package.put', { package: pkg });
    const validation = (await write(owner, 'native.package.validate', id)).result;
    assert.equal(owner === 'ontology' ? validation.status : validation.qualityStatus, owner === 'ontology' ? 'CONFORMS' : 'PASS');
    const review = (await write(owner, 'native.package.review', id)).result;
    await write(owner, 'native.package.decide', { ...id, reviewDigest: review.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic' });
    return (await write(owner, 'native.package.publish', id)).result.reference;
  };
  for (const [operation, input] of [['project.create', { name: 'Synthetic historical upgrade' }], ['goal.create', { id: 'upgrade-goal', description: 'Retain old source-linked records through an actual code upgrade' }]]) c.request('runtime', { operation, scope, input, requestId: 'legacy-' + (++sequence), expectedRevision: c.inspect('runtime', scope).revision });
  const pins = { ontology: await publish('ontology', f.packages.ontology), harness: await publish('harness', f.packages.harness) };
  const standardPins = Object.fromEntries(owners.filter(owner => owner !== 'runtime').map(owner => [owner, { standardDigest: pins[owner].standardDigest, standardLockDigest: pins[owner].standardLockDigest }]));
  const project = (await write('runtime', 'project.prepare', { id: 'upgrade-project', goalId: 'upgrade-goal', sourceScope, standardPins, requirements: frozen.candidate.nativeRequirements })).result;
  const recipe = { schema: 'evopilot-collection-recipe/v1', sourceScope, executable: binding.toolFiles[0].path, executableDigest: 'sha256:' + binding.toolFiles[0].sha256, argv: ['-e', 'console.log(JSON.stringify({ready:true}))'], cwd: binding.cwd, environment: { PATH: '/usr/bin:/bin' }, toolchainLockDigest: binding.toolchainLockDigest, timeoutMs: 5000, maxOutputBytes: 65536, allowedOutputs: ['stdout.txt', 'stderr.txt'], network: { mode: 'none', hosts: [] }, selectors: [{ id: 'ready', output: 'stdout.txt', kind: 'json-pointer', pointer: '/ready' }] };
  for (const id of ['historical-preflight', 'approved-action']) {
    const prepared = (await write('runtime', 'collection.prepare', { id, projectId: project.id, recipe })).result;
    await write('runtime', 'collection.decide', { id, reviewDigest: prepared.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic' });
  }
  const collected = (await write('runtime', 'collection.execute', { id: 'historical-preflight' }, 'historical-execute')).result;
  assert.equal(collected.stage, 'SUCCEEDED');
  const prerequisite = { owner: 'runtime', id: 'collection:historical-preflight', digest: collected.receipt.digest };
  const runbook = { schema: 'evopilot-response-runbook/v1', id: 'upgrade-guidance', version: '1.0.0', serviceId: 'upgrade-service', environment: 'test', sourceRevision: sourceScope.revision, parameters: { mode: 'isolated-check' }, prerequisites: [prerequisite], steps: [{ id: 'check', description: 'Only a separately reviewed isolated action', operation: 'isolated-collection' }], stopConditions: ['SOURCE_DRIFT', 'PREREQUISITE_FAILED', 'GUIDANCE_WITHDRAWN', 'EXPIRED', 'TIMEOUT', 'UNKNOWN'], effectScope: 'isolated-local', maxEvidenceAgeSeconds: 300, expiresAt: Math.floor(Date.now() / 1000) + 600 };
  const guidance = syntheticHarnessPackage({ id: 'historical-guidance' }); replaceNativeFile(guidance, 'runbooks/upgrade.json', runbook);
  const pin = { reference: await publish('harness', guidance), path: 'runbooks/upgrade.json', digest: nativeSha256(runbook) };
  const policy = await publish('harness', syntheticOnlinePackage({ id: 'historical-online' }));
  const slo = JSON.parse(fs.readFileSync(new URL('../../projects/evopilot-harness/specifications/online/v1/example.json', import.meta.url))); slo.spec.service = runbook.serviceId; slo.spec.timeWindow[0].duration = '2s';
  const spec = { id: 'historical-monitor', serviceId: runbook.serviceId, environment: 'test', deploymentRevision: sourceScope.revision, providerId: 'metrics', alertSourceId: 'alerts', policy, slo, intervalSeconds: 1 };
  const monitor = (await write('harness', 'online.binding.put', { spec })).result;
  await write('harness', 'online.binding.decide', { id: spec.id, reviewDigest: monitor.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic' });
  await write('harness', 'online.binding.select', { id: spec.id, selected: true });
  const fault = (await write('harness', 'online.evaluate', { id: spec.id, windowEnd: Math.floor(Date.now() / 1000) })).observation;
  assert.equal(fault.outcome, 'FAIL'); assert.equal(fault.nativeReport.qualityStatus, 'FAIL');
  const findingId = (await read('harness', 'online.inspect')).findings.find(value => value.state === 'FIRING').id;
  const finding = await read('harness', 'online.finding.inspect', { id: findingId });
  assert.ok((await read('harness', 'online.finding.deliver', { id: finding.id })).delivery);
  const repair = await read('runtime', 'online.repair.inspect', { id: finding.incidentId });
  const campaign = { schema: 'evopilot-private-campaign/v1', projectId: scope.projectId, id: 'upgrade-target', goal: 'Review isolated response after upgrade', sourceDigest: sourceScope.treeDigest.slice(7), criteria: [{ id: 'check', status: 'PENDING', evidence: [] }], loops: [{ id: 'first-loop', observation: 'Retained real collector fault', action: 'Review only', result: 'Pending' }], status: 'IN_PROGRESS', authority: false };
  const relative = `private/projects/${scope.projectId}/targets/${campaign.id}/record.json`, bytes = JSON.stringify(campaign);
  fs.mkdirSync(path.dirname(path.join(f.projectRoot, relative)), { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(f.projectRoot, relative), bytes, { mode: 0o600 });
  const campaignDigest = nativeBytesDigest(bytes), target = { owner: 'workspace', id: relative, digest: campaignDigest }, loop = { owner: 'workspace', id: relative + '#loop=first-loop', digest: nativeSha256({ campaignDigest, loop: campaign.loops[0] }) };
  const retained = { project: await read('runtime', 'project.inspect', { id: project.id }), collection: await read('runtime', 'collection.inspect', { id: 'historical-preflight' }), receipt: await read('runtime', 'receipt.inspect', { requestId: 'historical-execute' }), fault, repair, assets: {} };
  for (const owner of ['ontology', 'harness']) retained.assets[owner] = await read(owner, 'native.package.inspect', { id: pins[owner].id, version: pins[owner].version });
  c.close(); c = null;
  const before = Object.fromEntries(owners.map(owner => [owner, database(f.stateRoot, owner)]));
  assert.equal(before.runtime.version, 4); assert.equal(before.harness.version, 4);
  const projectFiles = files(f.projectRoot), sourceFiles = files(f.source);
  const apis = await loadInstalledProducts(); for (const owner of owners) assert.equal(apis[owner].VERSION, '0.7.0');
  const currentTrusted = { ...trusted, readResponseWorkspaceEvidence: ({ scope, reference }) => readWorkspaceResponseEvidence({ projectRoot: f.projectRoot, workspaceId: options.workspaceId }, scope, reference) };
  c = createComposition(options, apis, {}, currentTrusted);
  const assertRetained = async () => {
    assert.deepEqual(await read('runtime', 'project.inspect', { id: project.id }), retained.project);
    assert.deepEqual(await read('runtime', 'collection.inspect', { id: 'historical-preflight' }), retained.collection);
    assert.deepEqual(await read('runtime', 'receipt.inspect', { requestId: 'historical-execute' }), retained.receipt);
    assert.deepEqual(await read('runtime', 'online.repair.inspect', { id: repair.id }), retained.repair);
    assert.deepEqual(await read('harness', 'online.observation.inspect', { id: fault.id }), retained.fault);
    for (const owner of ['ontology', 'harness']) assert.deepEqual(await read(owner, 'native.package.inspect', { id: pins[owner].id, version: pins[owner].version }), retained.assets[owner]);
  };
  await assertRetained();
  const admitted = await write('harness', 'response.runbook.admit', { pin }, 'new-runbook');
  const faultRef = { owner: 'harness', id: 'finding:' + finding.id, digest: finding.digest };
  const assessment = { id: 'upgrade-problem', previousDigest: null, incidentId: repair.id, findingIds: [finding.id], impact: 'Synthetic old fault remains actionable', causes: [{ kind: 'suspected', description: 'Retained symptom, not confirmed business causality', evidence: [faultRef] }], followups: [], evidence: [faultRef] };
  const review = await read('harness', 'response.problem.prepare', { assessment });
  const problem = (await write('harness', 'response.problem.put', { assessment, reviewDigest: review.reviewDigest, humanEvidenceRef: 'synthetic' })).result;
  const prepared = (await write('runtime', 'response.prepare', { id: 'upgrade-response', repairId: repair.id, repairDigest: repair.digest, problemId: problem.id, problemDigest: problem.digest, runbook: pin, projectId: project.id, goalId: project.goalId, target, loop, collectionId: 'approved-action', parameters: runbook.parameters, actor: 'synthetic-upgrade-reviewer' })).result;
  await write('runtime', 'response.decide', { id: prepared.plan.id, reviewDigest: prepared.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic' });
  const cancelDigest = nativeSha256({ responseReviewDigest: prepared.reviewDigest, admission: null, operation: 'response.cancel' });
  const cancelled = (await write('runtime', 'response.cancel', { id: prepared.plan.id, reviewDigest: cancelDigest, humanEvidenceRef: 'synthetic' }, 'new-cancel')).result;
  assert.equal(cancelled.stage, 'CANCELLED'); assert.equal(cancelled.admission, null);
  assert.equal((await read('runtime', 'collection.inspect', { id: 'approved-action' })).claim, null, 'Upgrade does not dispatch an approved collection');
  await assertRetained(); c.close(); c = null;
  const after = Object.fromEntries(owners.map(owner => [owner, database(f.stateRoot, owner)]));
  assert.equal(after.runtime.version, 5); assert.equal(after.harness.version, 5); assert.equal(after.ontology.version, before.ontology.version);
  for (const owner of owners) preserved(before[owner], after[owner]);
  for (const owner of ['runtime', 'harness']) {
    const factory = owner === 'runtime' ? 'createRuntimeService' : 'createHarnessService', oldReader = oldApis[owner][factory](options);
    assert.equal(oldReader.capabilities().version, '0.5.0');
    try { assert.throws(() => oldReader.initialize(), { code: 'CORRUPT_STATE' }, 'Real old reader rejects new schema: ' + owner); } finally { oldReader.close(); }
  }
  const installationRoot = path.join(f.root, 'isolated-installation'); fs.mkdirSync(installationRoot, { mode: 0o700 });
  const context = { projectRoot: f.projectRoot, stateRoot: f.stateRoot, workspaceId: options.workspaceId, installationRoot }, backupRoot = path.join(f.root, 'schema5-backup');
  const backup = maintainWorkspace(context, 'backup', { destinationRoot: backupRoot }, 'upgrade-backup'); assert.equal(backup.status, 'VERIFIED');
  assert.equal(inspectWorkspaceBackup(context, backupRoot).manifestDigest, backup.manifestDigest);
  fs.renameSync(f.projectRoot, f.projectRoot + '-preserved'); fs.renameSync(f.stateRoot, f.stateRoot + '-preserved');
  const restored = maintainWorkspace(context, 'restore', { backupRoot }, 'upgrade-restore'); assert.equal(restored.status, 'VERIFIED');
  for (const owner of owners) assert.deepEqual(database(f.stateRoot, owner), after[owner], 'Restored complete owner tables: ' + owner);
  c = createComposition(options, apis, {}, currentTrusted); await assertRetained();
  assert.deepEqual(await read('runtime', 'response.read', { id: prepared.plan.id }), cancelled);
  assert.deepEqual(await read('harness', 'response.problem.inspect', { id: problem.id }), problem);
  assert.deepEqual(await read('harness', 'response.receipt.inspect', { requestId: 'new-runbook' }), admitted);
  assert.equal((await read('harness', 'response.runbook.inspect', { pin })).withdrawn, false);
  assert.equal((await read('harness', 'response.evidence.inspect', { reference: faultRef })).status, 'FAIL');
  assert.deepEqual(files(f.projectRoot), projectFiles); assert.deepEqual(files(f.source), sourceFiles); assert.equal(f.git('status', '--porcelain'), '');
  t.diagnostic(JSON.stringify({ historicalVersion: '0.5.0', candidateVersion: '0.7.0', schema: { runtime: after.runtime.version, harness: after.harness.version }, evidence: 'Actual installed old APIs, HTTP collection, native validation and maintenance; synthetic domain and operator decisions' }));
});
