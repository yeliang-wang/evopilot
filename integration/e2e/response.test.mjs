import {syntheticAuthoring} from './fixtures/authoring.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { createComposition, loadInstalledProducts } from '../../dist/integration/composition.js';
import { createLocalCollector } from '../../dist/integration/collection/local.js';
import { readWorkspaceResponseEvidence } from '../../dist/integration/response/evidence.js';
import { maintainWorkspace, inspectWorkspaceBackup } from '../../dist/integration/workspace/maintenance.js';
import { nativeSha256, nativeBytesDigest, nativePackageDigest, referenceForPackage, NATIVE_CONTRACT_DIGEST } from '../../dist/integration/compatibility/v1/native.mjs';
import { createPrometheusCollector, createAlertmanagerReceiver } from '@evopilot-next/harness/online';
import { inspectWorkspaceSnapshot } from '@evopilot-next/runtime/workspace-migration';
import { syntheticHarnessPackage, replaceNativeFile } from '../../projects/evopilot-harness/examples/native/package.mjs';
import { syntheticOnlinePackage } from '../../projects/evopilot-harness/examples/native/online-package.mjs';
import { fixture, freeze, syntheticModelingIntent } from './fixtures/native-project.mjs';
import { syntheticDecisionEvidence } from './fixtures/decision-evidence.mjs';

// Synthetic service histories and test operator attestations are never business
// approval. Every product receipt below is produced through actual owner APIs;
// HTTP telemetry, isolated actions, OPA/Conftest and pySHACL really execute.
for (const scenario of [
  { id: 'checkout', service: 'checkout-api', impact: 'Synthetic checkout availability degraded', operation: 'restore-checkout-probe' },
  { id: 'archive-export', service: 'archive-export-worker', impact: 'Synthetic export worker cannot complete a health probe', operation: 'restore-export-probe' },
]) test(`v0.6 composed response: ${scenario.id} real fault/action/independent validation/feedback/restore`, { timeout: 150_000 }, async t => {
  assert.ok(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN, 'Pinned actual native toolchain is required');
  const toolchain = JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN, 'utf8'));
  const f = fixture('reverse', 'private'), scope = f.scope;
  scope.projectId = scenario.id; f.input.requirements.projectId = scenario.id;
  for (const row of f.input.requirements.ownerRequirements) if (row.criterionId.startsWith('harness:')) row.origin = 'execution-result';
  f.packages.harness.manifest.dependencies = [referenceForPackage(f.packages.ontology)];
  f.input.modelingIntent = syntheticModelingIntent(f);
  const frozen = await freeze(f);
  await f.service.materialize({ scope, id: f.input.id, packages: f.packages });
  const binding = await f.service.prepareExecution({ scope, id: f.input.id, executionId: 'response-execution', toolchainId: 'node' });
  const sourceScope = frozen.candidate.sourceScope, requirements = frozen.candidate.nativeRequirements;
  const healthFile = path.join(binding.cwd, 'synthetic-health.json'), attemptFile = path.join(binding.cwd, 'synthetic-attempts.txt');
  fs.writeFileSync(healthFile, JSON.stringify({ healthySince: null }), { mode: 0o600 });
  const alertTokenFile = path.join(f.root, 'synthetic-alert-token');
  fs.writeFileSync(alertTokenFile, 'synthetic-test-token', { mode: 0o600 });
  const alertReceiver = createAlertmanagerReceiver([{ id: 'alerts', bearerTokenFile: alertTokenFile }]);
  let queries = 0;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/alertmanager' && request.method === 'POST') {
      const chunks = []; request.on('data', chunk => chunks.push(chunk));
      request.on('end', () => { alertReceiver.receive('alerts', request.headers.authorization, Buffer.concat(chunks), batch => write('harness', 'online.alert.ingest', { sourceId: 'alerts', digest: batch.digest }))
        .then(result => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(result)); })
        .catch(error => { response.writeHead(400, { 'content-type': 'application/json' }); response.end(JSON.stringify({ code: error.code ?? 'ALERT_ERROR' })); }); });
      return;
    }
    if (url.pathname !== '/api/v1/query_range') { response.writeHead(404).end(); return; }
    queries++;
    const query = url.searchParams.get('query'), values = [], health = JSON.parse(fs.readFileSync(healthFile, 'utf8'));
    for (let time = Number(url.searchParams.get('start')); time <= Number(url.searchParams.get('end')); time += Number(url.searchParams.get('step'))) {
      const value = query.startsWith('timestamp(') ? time : query === 'service_probe_window_total' ? 1 : health.healthySince !== null && time >= health.healthySince ? 1 : 0;
      values.push([time, String(value)]);
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ status: 'success', data: { resultType: 'matrix', result: [{ metric: { service: scenario.service, environment: 'test', deployment: sourceScope.revision }, values }] } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const apis = await loadInstalledProducts(), options = { workspaceRoot: f.stateRoot, workspaceId: 'synthetic' };
  // The separate synthetic monitoring policy uses an explicit test host admission;
  // project completion assets still resolve against their actual frozen candidate.
  const onlinePackage=syntheticOnlinePackage({id:scenario.id+'-online'}),syntheticPolicyDigests=new Set([nativePackageDigest(onlinePackage)]);
  const resolveNativeAuthoring=request=>request.owner==='harness'&&syntheticPolicyDigests.has(request.packageDigest)?syntheticAuthoring(request):f.service.resolveNativeAuthoring(request);
  const trusted = { toolchain, ...createLocalCollector({ resolveExecution: f.service.resolveExecution }), resolveNativeAuthoring,inspectSource: f.service.inspectSource, resolveRequirements: f.service.resolveRequirements, verifyProject: f.service.verifyProject,
    readResponseWorkspaceEvidence: ({ scope, reference }) => readWorkspaceResponseEvidence({ projectRoot: f.projectRoot, workspaceId: 'synthetic' }, scope, reference),
    online: { collectOnline: createPrometheusCollector([{ id: 'metrics', origin: `http://127.0.0.1:${server.address().port}`, bearerTokenFile: null, freshnessSeconds: 30 }]), inspectOnlineAlert: alertReceiver.inspect } };
  let c = createComposition(options, apis, {}, trusted), sequence = 0;
  t.after(async () => { c.close(); await new Promise(resolve => server.close(resolve)); f.cleanup(); });
  const read = (owner, operation, input = {}) => c.native(owner, { operation, scope, input });
  const write = async (owner, operation, input, requestId = 'response-test-' + (++sequence)) => {
    if (input.humanEvidenceRef === 'synthetic') input = { ...input, humanEvidenceRef: syntheticDecisionEvidence(f.root, { owner, operation, workspaceId: 'synthetic', scope, reviewDigest: input.reviewDigest, decision: input.decision ?? 'APPROVE' }) };
    const additive = /^(feedback|online|response)\./.test(operation);
    const expectedRevision = additive ? (await read(owner, operation.split('.')[0] + '.inspect')).revision : owner === 'runtime' ? (await read(owner, 'workspace.inspect')).revision : c.inspect(owner, scope).revision;
    return c.native(owner, { operation, scope, input, expectedRevision, requestId });
  };
  const sendAlert = async (state, startsAt, endsAt = null, extraLabels = {}) => {
    const labels = { service: scenario.service, environment: 'test', deployment: sourceScope.revision, ...extraLabels };
    const body = { version: '4', groupKey: 'synthetic-response', truncatedAlerts: 0, status: state, receiver: 'evopilot-test', groupLabels: {}, commonLabels: labels, commonAnnotations: {}, externalURL: '', alerts: [{ status: state, labels, annotations: {}, startsAt: new Date(startsAt * 1000).toISOString(), endsAt: new Date((endsAt ?? 0) * 1000).toISOString(), generatorURL: '', fingerprint: '1234567890abcdef' }] };
    const result = await fetch(`http://127.0.0.1:${server.address().port}/alertmanager`, { method: 'POST', headers: { authorization: 'Bearer synthetic-test-token', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await result.json(); assert.equal(result.status, 200, JSON.stringify(data)); return data.result.findings[0];
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
  const legacy = (operation, input) => c.request('runtime', { operation, scope, input, requestId: 'legacy-' + (++sequence), expectedRevision: c.inspect('runtime', scope).revision });
  legacy('project.create', { name: 'Synthetic ' + scenario.id });
  legacy('goal.create', { id: 'recover-goal', description: 'Recover only the isolated synthetic health probe and verify it independently' });
  const pins = { ontology: await publish('ontology', f.packages.ontology), harness: await publish('harness', f.packages.harness) };
  const standardPins = Object.fromEntries(['ontology', 'harness'].map(owner => [owner, { standardDigest: pins[owner].standardDigest, standardLockDigest: pins[owner].standardLockDigest }]));
  const project = (await write('runtime', 'project.prepare', { id: 'response-project', goalId: 'recover-goal', sourceScope, standardPins, requirements })).result;
  const prepareCollection = async (id, script, timeoutMs = 5000) => {
    const recipe = { schema: 'evopilot-collection-recipe/v1', sourceScope, executable: binding.toolFiles[0].path, executableDigest: 'sha256:' + binding.toolFiles[0].sha256, argv: ['-e', script], cwd: binding.cwd, environment: { PATH: '/usr/bin:/bin' }, toolchainLockDigest: binding.toolchainLockDigest, timeoutMs, maxOutputBytes: 65536, allowedOutputs: ['stdout.txt', 'stderr.txt'], network: { mode: 'none', hosts: [] }, selectors: ['tests', 'evidenceDigest', 'warnings'].map(id => ({ id, output: 'stdout.txt', kind: 'json-pointer', pointer: '/' + id })) };
    const plan = (await write('runtime', 'collection.prepare', { id, projectId: project.id, recipe })).result;
    await write('runtime', 'collection.decide', { id, reviewDigest: plan.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic' });
    return plan;
  };
  const output = 'console.log(JSON.stringify({tests:{exitCode:0},evidenceDigest:"actual-isolated-process",warnings:0}))';
  await prepareCollection('preflight', output);
  const preflight = (await write('runtime', 'collection.execute', { id: 'preflight' })).result.receipt;
  const prerequisite = { owner: 'runtime', id: 'collection:preflight', digest: preflight.digest };
  const onlinePin = await publish('harness', onlinePackage);
  const slo = JSON.parse(fs.readFileSync(new URL('../../projects/evopilot-harness/specifications/online/v1/example.json', import.meta.url)));
  slo.spec.service = scenario.service; slo.spec.timeWindow[0].duration = '2s';
  const spec = { id: 'monitor', serviceId: scenario.service, environment: 'test', deploymentRevision: sourceScope.revision, providerId: 'metrics', alertSourceId: 'alerts', policy: onlinePin, slo, intervalSeconds: 1 };
  const monitored = (await write('harness', 'online.binding.put', { spec })).result;
  await write('harness', 'online.binding.decide', { id: spec.id, reviewDigest: monitored.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic' });
  await write('harness', 'online.binding.select', { id: spec.id, selected: true });
  const fault = (await write('harness', 'online.evaluate', { id: spec.id, windowEnd: Math.floor(Date.now() / 1000) })).observation;
  assert.equal(fault.outcome, 'FAIL'); assert.equal(fault.nativeReport.qualityStatus, 'FAIL'); assert.equal(queries, 4);
  const findingSummary = (await read('harness', 'online.inspect')).findings.find(row => row.state === 'FIRING');
  const alertStart = fault.windowEnd - 1;
  const finding = scenario.id === 'checkout' ? await sendAlert('firing', alertStart) : await read('harness', 'online.finding.inspect', { id: findingSummary.id });
  if (scenario.id === 'checkout') assert.deepEqual(await sendAlert('firing', alertStart), finding, 'Authenticated duplicate webhook preserves the original event identity');
  assert.ok((await read('harness', 'online.finding.deliver', { id: finding.id })).delivery);
  const repair = await read('runtime', 'online.repair.inspect', { id: finding.incidentId });
  const faultRef = { owner: 'harness', id: 'finding:' + finding.id, digest: finding.digest };
  const assessment = { id: scenario.id + '-problem', previousDigest: null, incidentId: finding.incidentId, findingIds: [finding.id], impact: scenario.impact, causes: [{ kind: 'suspected', description: 'Synthetic health flag may explain the observed symptom; not a confirmed business cause', evidence: [faultRef] }], followups: [{ id: 'recurrence-check', description: 'Track a separate preventive regression check for ' + scenario.service, actor: 'synthetic-quality-owner', status: 'TRACKED', evidence: [faultRef] }], evidence: [faultRef, prerequisite] };
  const problemReview = await read('harness', 'response.problem.prepare', { assessment });
  const problem = (await write('harness', 'response.problem.put', { assessment, reviewDigest: problemReview.reviewDigest, humanEvidenceRef: 'synthetic' })).result;
  const runbook = { schema: 'evopilot-response-runbook/v1', id: scenario.operation, version: '1.0.0', serviceId: scenario.service, environment: 'test', sourceRevision: sourceScope.revision, parameters: { operation: scenario.operation }, prerequisites: [prerequisite], steps: [{ id: 'recover-probe', description: 'Restore this isolated synthetic probe; no original source or production mutation', operation: 'isolated-collection' }], stopConditions: ['SOURCE_DRIFT', 'PREREQUISITE_FAILED', 'GUIDANCE_WITHDRAWN', 'EXPIRED', 'TIMEOUT', 'UNKNOWN'], effectScope: 'isolated-local', maxEvidenceAgeSeconds: 300, expiresAt: Math.floor(Date.now() / 1000) + 600 };
  const guidance = syntheticHarnessPackage({ id: scenario.id + '-guidance' }); replaceNativeFile(guidance, 'runbooks/recover.json', runbook);
  syntheticPolicyDigests.add(nativePackageDigest(guidance));
  const runbookPin = { reference: await publish('harness', guidance), path: 'runbooks/recover.json', digest: nativeSha256(runbook) };
  await write('harness', 'response.runbook.admit', { pin: runbookPin });
  const campaign = { schema: 'evopilot-private-campaign/v1', projectId: scope.projectId, id: 'recover-target', goal: 'Synthetic isolated response', sourceDigest: sourceScope.treeDigest.slice(7), criteria: ['independent-native-run', 'reviewed-owner-feedback', 'retained-fault'].map(id => ({ id, status: 'PENDING', evidence: [] })), loops: [{ id: 'recover-loop', observation: 'Owned failure ' + faultRef.id + ' at ' + faultRef.digest, action: scenario.operation, result: 'pending' }], status: 'IN_PROGRESS', authority: false };
  const campaignPath = `private/projects/${scope.projectId}/targets/${campaign.id}/record.json`, campaignBytes = JSON.stringify(campaign);
  fs.mkdirSync(path.dirname(path.join(f.projectRoot, campaignPath)), { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(f.projectRoot, campaignPath), campaignBytes, { mode: 0o600 });
  const campaignDigest = nativeBytesDigest(campaignBytes), target = { owner: 'workspace', id: campaignPath, digest: campaignDigest }, loop = { owner: 'workspace', id: campaignPath + '#loop=recover-loop', digest: nativeSha256({ campaignDigest, loop: campaign.loops[0] }) };
  const action = `const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(attemptFile)},'action\\n');fs.writeFileSync(${JSON.stringify(healthFile)},JSON.stringify({healthySince:Math.ceil(Date.now()/1000)}));${output}`;
  await prepareCollection('repair-action', action);
  const responseInput = { id: 'response-one', repairId: repair.id, repairDigest: repair.digest, problemId: problem.id, problemDigest: problem.digest, runbook: runbookPin, projectId: project.id, goalId: project.goalId, target, loop, collectionId: 'repair-action', parameters: runbook.parameters, actor: 'synthetic-test-operator' };
  if (scenario.id === 'checkout') {
    const faultResponse = async (id, collectionId) => {
      const plan = (await write('runtime', 'response.prepare', { ...responseInput, id, collectionId })).result;
      await write('runtime', 'response.decide', { id, reviewDigest: plan.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic' });
      return plan;
    };
    const timedAttempts = path.join(binding.cwd, 'timeout-attempts.txt');
    await prepareCollection('timeout-action', `require('node:fs').appendFileSync(${JSON.stringify(timedAttempts)},'one\\n');console.log('partial-checkpoint');setInterval(()=>{},1000)`, 300);
    await faultResponse('timeout-response', 'timeout-action');
    const timed = (await write('runtime', 'response.execute', { id: 'timeout-response' })).result;
    assert(['FAILED', 'UNKNOWN'].includes(timed.stage)); assert.equal(timed.verification, null);
    const timedCollection = await read('runtime', 'collection.inspect', { id: 'timeout-action' });
    assert.equal(timedCollection.receipt.result.timedOut, true);
    assert.equal(fs.readFileSync(path.join(f.stateRoot, 'state/runtime-native', timedCollection.claim.claimId.slice(7), 'stdout.txt'), 'utf8'), 'partial-checkpoint\n');
    c.close(); c = createComposition(options, apis, {}, trusted);
    await write('runtime', 'response.reconcile', { id: 'timeout-response' }); await write('runtime', 'response.execute', { id: 'timeout-response' });
    assert.equal(fs.readFileSync(timedAttempts, 'utf8'), 'one\n');
    assert.equal((await read('runtime', 'response.execution.inspect', { id: 'timeout-response' })).status, 'UNVERIFIED');

    const cancelledAttempts = path.join(binding.cwd, 'cancel-attempts.txt');
    await prepareCollection('cancel-action', `require('node:fs').appendFileSync(${JSON.stringify(cancelledAttempts)},'one\\n');console.log('cancel-checkpoint');setInterval(()=>{},1000)`, 10000);
    await faultResponse('cancel-response', 'cancel-action');
    const running = write('runtime', 'response.execute', { id: 'cancel-response' });
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(cancelledAttempts)) { assert(Date.now() < deadline, 'Actual worker must start before cancellation'); await new Promise(resolve => setTimeout(resolve, 25)); }
    const active = await read('runtime', 'response.read', { id: 'cancel-response' });
    const cancelDigest = nativeSha256({ responseReviewDigest: active.reviewDigest, admission: active.admission, operation: 'response.cancel' });
    const pending = (await write('runtime', 'response.cancel', { id: 'cancel-response', reviewDigest: cancelDigest, humanEvidenceRef: 'synthetic' })).result;
    assert.equal(pending.stage, 'CANCEL_REQUESTED'); assert.equal(pending.cancellation.confirmedAt, null);
    await running;
    const cancelled = (await write('runtime', 'response.reconcile', { id: 'cancel-response' })).result;
    assert.equal(cancelled.stage, 'CANCELLED'); assert.ok(cancelled.cancellation.confirmedAt);
    const cancelledCollection = await read('runtime', 'collection.inspect', { id: 'cancel-action' });
    assert.equal(cancelledCollection.receipt.result.interrupted, true); assert.equal(cancelledCollection.receipt.result.timedOut, false);
    assert.equal(fs.readFileSync(path.join(f.stateRoot, 'state/runtime-native', cancelledCollection.claim.claimId.slice(7), 'stdout.txt'), 'utf8'), 'cancel-checkpoint\n');
    await write('runtime', 'response.execute', { id: 'cancel-response' });
    assert.equal(fs.readFileSync(cancelledAttempts, 'utf8'), 'one\n');
    assert.equal(JSON.parse(fs.readFileSync(healthFile, 'utf8')).healthySince, null, 'Cancellation performs no implicit repair or rollback');
  }
  const prepared = (await write('runtime', 'response.prepare', responseInput)).result;
  await assert.rejects(write('runtime', 'response.execute', { id: prepared.plan.id }), { code: 'RESPONSE_APPROVAL_REQUIRED' });
  assert.equal(fs.existsSync(attemptFile), false);
  await write('runtime', 'response.decide', { id: prepared.plan.id, reviewDigest: prepared.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic' });
  const executed = (await write('runtime', 'response.execute', { id: prepared.plan.id })).result;
  assert.equal(executed.stage, 'SUCCEEDED', JSON.stringify(executed)); assert.ok(executed.collection.claimId);
  await write('runtime', 'response.execute', { id: prepared.plan.id });
  c.close(); c = createComposition(options, apis, {}, trusted);
  await write('runtime', 'response.reconcile', { id: prepared.plan.id });
  assert.equal(fs.readFileSync(attemptFile, 'utf8'), 'action\n', 'Restart/replay must not repeat the actual repair process');
  assert.equal((await read('runtime', 'response.execution.inspect', { id: prepared.plan.id })).status, 'UNVERIFIED');
  const healthySince = JSON.parse(fs.readFileSync(healthFile, 'utf8')).healthySince;
  // A timer wakeup alone does not prove the clock crossed the sample boundary.
  // Both samples in the actual two-second window must follow the repair.
  const earliestRecoveryEnd = healthySince + 1;
  while (Math.floor(Date.now() / 1000) < earliestRecoveryEnd) {
    await new Promise(resolve => setTimeout(resolve, Math.max(1, earliestRecoveryEnd * 1000 - Date.now())));
  }
  const recoveryWindowEnd = Math.floor(Date.now() / 1000);
  assert.ok(recoveryWindowEnd - 1 >= healthySince, 'The entire recovery window must contain post-repair samples');
  const recovery = (await write('harness', 'online.evaluate', { id: spec.id, windowEnd: recoveryWindowEnd })).observation;
  assert.equal(recovery.outcome, 'PASS', JSON.stringify(recovery)); assert.equal(queries, 8);
  const regression = (await write('harness', 'online.regression.verify', { faultId: fault.id, recoveryId: recovery.id })).result;
  let recoveryRef = { owner: 'harness', id: regression.digest, digest: regression.digest };
  if (scenario.id === 'checkout') {
    const link = { regressionId: regression.digest, incidentId: finding.incidentId, firingId: finding.id, resolvedId: nativeSha256('missing-alert-resolution') };
    await assert.rejects(write('harness', 'response.recovery.link', link), { code: 'RESPONSE_RECOVERY_LINK' }, 'Quality PASS cannot substitute for Alertmanager resolution');
    const resolved = await sendAlert('resolved', alertStart, Math.max(healthySince, fault.windowEnd + 1));
    await assert.rejects(write('harness', 'response.recovery.link', { ...link, resolvedId: resolved.id, firingId: nativeSha256('other-alert-event') }), { code: 'RESPONSE_RECOVERY_LINK' });
    const linked = (await write('harness', 'response.recovery.link', { ...link, resolvedId: resolved.id })).result;
    assert.equal(linked.incidentId, finding.incidentId); assert.equal(linked.faultDigest, fault.digest); assert.equal(linked.recoveryDigest, recovery.digest);
    assert.equal(linked.faultAt, fault.windowEnd); assert.equal(linked.recoveryAt, recovery.windowEnd);
    recoveryRef = linked.reference;
    assert.notEqual(recoveryRef.id, regression.digest);
    assert.equal((await read('harness', 'response.recovery.inspect', { id: regression.digest })).incidentId, nativeSha256({ binding: monitored.reviewDigest, source: 'evaluation' }));
  }
  assert.equal((await read('harness', 'response.evidence.inspect', { reference: faultRef })).status, 'FAIL');
  await write('runtime', 'feedback.configure', { projectId: project.id });
  const executeRun = async (id, raw, selectedPins = pins, packages = f.packages) => {
    const observation = { schema: 'evopilot-observation/v1', origin: 'execution-result', source: { revision: sourceScope.revision, digest: sourceScope.treeDigest }, values: raw.observations, collectionReceiptRef: { id: raw.id, digest: raw.digest, claimId: raw.claimId }, sourceScopeDigest: nativeSha256(sourceScope) };
    const input = { schema: 'runtime-composition/v1', contractDigest: NATIVE_CONTRACT_DIGEST, projectCandidateDigest: project.candidateDigest, standardPins, sourceScope, requirements, effectiveConfig: { params: { maxWarnings: 0 } }, nativeInputs: { ontology: { packageDigest: nativePackageDigest(packages.ontology) }, harness: { observation } }, collectionReceipts: [{ id: raw.id, digest: raw.digest }] };
    const plan = (await write('runtime', 'run.prepare', { id, projectId: project.id, goalId: project.goalId, ontology: selectedPins.ontology, harness: selectedPins.harness, input })).result;
    await write('runtime', 'run.decide', { id, reviewDigest: plan.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic' });
    const run = (await write('runtime', 'run.dispatch', { id })).result;
    assert.equal(run.stage, 'SUCCEEDED'); for (const receipt of Object.values(run.receipt.ownerReceipts)) assert.equal(receipt.qualityStatus, 'PASS');
    return run;
  };
  // Even a real passing native Run cannot certify its own action receipt.
  const actionReceipt = (await read('runtime', 'collection.inspect', { id: 'repair-action' })).receipt;
  await executeRun('action-only-run', actionReceipt);
  await assert.rejects(write('runtime', 'response.verify', { id: prepared.plan.id, runId: 'action-only-run', recovery: recoveryRef }), { code: 'RESPONSE_INDEPENDENT_COLLECTION_REQUIRED' });
  await prepareCollection('independent-verification', `const fs=require('node:fs');if(JSON.parse(fs.readFileSync(${JSON.stringify(healthFile)},'utf8')).healthySince===null)process.exit(2);${output}`);
  const raw = (await write('runtime', 'collection.execute', { id: 'independent-verification' })).result.receipt;
  await executeRun('verify-run', raw);
  const bindings = f.service.checkLayout({ scope, id: f.input.id }).bindings;
  await f.service.reviewDomain({ scope, id: f.input.id, runtimeCandidateDigest: project.candidateDigest, assetDigests: { ontology: pins.ontology.digest, harness: pins.harness.digest }, bindingsDigest: bindings.digest, inferredMappings: bindings.inferred, decision: 'ACCEPT', humanEvidenceRef: 'synthetic-domain' });
  await assert.rejects(write('runtime', 'response.verify', { id: prepared.plan.id, runId: 'verify-run', recovery: recoveryRef }), { code: 'FEEDBACK_PENDING' });
  const event = (await read('runtime', 'feedback.list')).find(row => row.event.runId === 'verify-run');
  let delivered = null;
  if (scenario.id === 'archive-export') {
    const changed = structuredClone(f.packages.harness); changed.manifest.version = '1.1.0';
    const sourceBindings = JSON.parse(changed.files[changed.manifest.sourceBindingRef]);
    sourceBindings.mappings.find(row => row.targetId === 'H003').rationale = 'Synthetic recovery learning: a successful health probe does not waive the source requirement for a present zero warning count; preserve independent post-action verification.';
    replaceNativeFile(changed, changed.manifest.sourceBindingRef, sourceBindings);
    replaceNativeFile(changed, 'docs/recovery-learning.json', { synthetic: true, ruleId: 'H003', sourcePath: 'sources/requirements.txt', sourceDigest: nativeBytesDigest(changed.files['sources/requirements.txt']), explanation: 'Keep the warning rule unchanged after probe recovery. Process success, alert resolution and independent delivery quality are separate results.' });
    const correctionInput={...f.input,id:'round-two'},correctionPackages={ontology:f.packages.ontology,harness:changed};
    await freeze(f,correctionInput,correctionPackages);await f.service.materialize({scope,id:correctionInput.id,packages:correctionPackages});
    delivered = { packages: { ontology: f.packages.ontology, harness: changed }, pins: { ontology: pins.ontology, harness: await publish('harness', changed) } };
  }
  for (const owner of ['ontology', 'harness']) {
    const proposal = delivered && owner === 'harness'
      ? { mode: 'DELIVER', reference: delivered.pins.harness, rationale: 'Retain explicit source-linked recovery learning without weakening the independent warning requirement', changes: [{ kind: 'other', identifiers: ['H003'], sourcePaths: ['sources/requirements.txt'], explanation: 'Clarify source mapping and retain a preventive recovery interpretation addendum.' }] }
      : { mode: 'REUSE', reference: pins[owner], rationale: 'Synthetic health state changed; exact source interpretation and QA rules remain applicable', changes: [] };
    const review = (await write(owner, 'feedback.propose', { id: event.event.id, proposal })).result;
    await write(owner, 'feedback.decide', { id: event.event.id, reviewDigest: review.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic' });
  }
  await write('runtime', 'feedback.refresh', { id: event.event.id });
  let verificationRunId = 'verify-run';
  if (delivered) {
    await assert.rejects(write('runtime', 'response.verify', { id: prepared.plan.id, runId: 'verify-run', recovery: recoveryRef }), { code: 'FEEDBACK_NEW_RUN_REQUIRED' });
    assert.equal((await read('harness', 'native.package.readback', { id: pins.harness.id, version: pins.harness.version })).reference.digest, pins.harness.digest);
    const nextInput = { ...f.input, id: 'round-two' }, next = await freeze(f, nextInput);
    assert.deepEqual(next.candidate.sourceScope, sourceScope); assert.deepEqual(next.candidate.nativeRequirements, requirements);
    await f.service.materialize({ scope, id: nextInput.id, packages: delivered.packages });
    const nextBindings = f.service.checkLayout({ scope, id: nextInput.id }).bindings;
    await f.service.reviewDomain({ scope, id: nextInput.id, runtimeCandidateDigest: project.candidateDigest, assetDigests: { ontology: delivered.pins.ontology.digest, harness: delivered.pins.harness.digest }, bindingsDigest: nextBindings.digest, inferredMappings: nextBindings.inferred, decision: 'ACCEPT', humanEvidenceRef: 'synthetic-domain-delivery' });
    await prepareCollection('delivered-verification', `const fs=require('node:fs');if(JSON.parse(fs.readFileSync(${JSON.stringify(healthFile)},'utf8')).healthySince===null)process.exit(2);${output}`);
    const deliveredRaw = (await write('runtime', 'collection.execute', { id: 'delivered-verification' })).result.receipt;
    verificationRunId = 'delivered-run'; await executeRun(verificationRunId, deliveredRaw, delivered.pins, delivered.packages);
    const deliveredEvent = (await read('runtime', 'feedback.list')).find(row => row.event.runId === verificationRunId);
    assert.notEqual(deliveredEvent.event.id, event.event.id); assert.equal(deliveredEvent.event.pins.harness.digest, delivered.pins.harness.digest);
    for (const owner of ['ontology', 'harness']) {
      const review = (await write(owner, 'feedback.propose', { id: deliveredEvent.event.id, proposal: { mode: 'REUSE', reference: delivered.pins[owner], rationale: 'Actual independent reevaluation of the exact newly accepted assets succeeded', changes: [] } })).result;
      await write(owner, 'feedback.decide', { id: deliveredEvent.event.id, reviewDigest: review.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic' });
    }
    await write('runtime', 'feedback.refresh', { id: deliveredEvent.event.id });
  }
  const verified = (await write('runtime', 'response.verify', { id: prepared.plan.id, runId: verificationRunId, recovery: recoveryRef })).result;
  assert.equal(verified.stage, 'VERIFIED');
  const closed = (await write('runtime', 'response.close', { id: prepared.plan.id, reviewDigest: verified.verification.reviewDigest, humanEvidenceRef: 'synthetic' })).result;
  assert.equal(closed.stage, 'CLOSED');
  const execution = await read('runtime', 'response.execution.inspect', { id: prepared.plan.id });
  const closeInput = { id: problem.id, expectedDigest: problem.digest, kind: 'VERIFIED_CLOSED', actor: 'synthetic-test-operator', rationale: 'Actual isolated action, independent native Run, reviewed feedback and retained recovery', expiresAt: null, recovery: recoveryRef, execution: execution.reference };
  const closeReview = await read('harness', 'response.problem.review', closeInput);
  const closedProblem = (await write('harness', 'response.problem.decide', { ...closeInput, reviewDigest: closeReview.reviewDigest, humanEvidenceRef: 'synthetic' })).result;
  assert.deepEqual(closedProblem.followups, assessment.followups); assert.equal(closedProblem.causes[0].kind, 'suspected');
  assert.equal((await read('harness', 'response.problem.status', { id: problem.id })).decisionEffective, true);
  assert.deepEqual(await read('harness', 'response.problem.version', { id: problem.id, digest: problem.digest }), problem);
  assert.equal((await read('harness', 'online.observation.inspect', { id: fault.id })).outcome, 'FAIL');
  assert.equal((await read('harness', 'response.evidence.inspect', { reference: faultRef })).status, 'FAIL');
  assert.equal(f.git('status', '--porcelain'), '', 'Original fixed source stays unchanged');
  const snapshot = inspectWorkspaceSnapshot(options); assert.ok(snapshot.recordsDigest);
  const retainedFeedback = await read('runtime', 'feedback.list'); c.close();
  const installationRoot = path.join(f.root, 'installation'); fs.mkdirSync(installationRoot, { mode: 0o700 });
  const context = { projectRoot: f.projectRoot, stateRoot: f.stateRoot, workspaceId: 'synthetic', installationRoot }, backupRoot = path.join(f.root, 'verified-backup');
  const backup = maintainWorkspace(context, 'backup', { destinationRoot: backupRoot }, 'response-backup'); assert.equal(backup.status, 'VERIFIED');
  assert.equal(inspectWorkspaceBackup(context, backupRoot).manifestDigest, backup.manifestDigest);
  fs.renameSync(f.projectRoot, f.projectRoot + '-preserved'); fs.renameSync(f.stateRoot, f.stateRoot + '-preserved');
  const restore = maintainWorkspace(context, 'restore', { backupRoot }, 'response-restore'); assert.equal(restore.status, 'VERIFIED');
  c = createComposition(options, apis, {}, trusted);
  assert.deepEqual(await read('runtime', 'response.read', { id: prepared.plan.id }), closed);
  assert.deepEqual(await read('harness', 'response.problem.inspect', { id: problem.id }), closedProblem);
  assert.deepEqual(await read('runtime', 'feedback.list'), retainedFeedback);
  assert.equal((await read('runtime', 'response.execution.inspect', { id: prepared.plan.id })).status, 'VERIFIED');
  assert.equal((await read('harness', 'response.evidence.inspect', { reference: faultRef })).status, 'FAIL');
  assert.equal(inspectWorkspaceSnapshot(options).recordsDigest, snapshot.recordsDigest);
  if (scenario.id === 'checkout') {
    assert.deepEqual((await read('harness', 'response.recovery.inspect', { id: recoveryRef.id })).reference, recoveryRef, 'Restored correlation revalidates both independent owner evidence sets');
    await sendAlert('resolved', alertStart, recovery.windowEnd + 1, { evidence_revision: 'later-healthy' });
    assert.deepEqual((await read('harness', 'response.recovery.inspect', { id: recoveryRef.id })).reference, recoveryRef, 'Later healthy resolution does not invalidate the original pinned recovery');
    assert.equal((await read('harness', 'response.problem.status', { id: problem.id })).decisionEffective, true);
    await sendAlert('firing', alertStart, null, { evidence_revision: 'late-distinct-payload' });
    await assert.rejects(read('harness', 'response.recovery.inspect', { id: recoveryRef.id }), { code: 'RESPONSE_RECOVERY_LINK_CHANGED' }, 'A newly received unique FIRING invalidates the prior correlation even with an old startsAt');
    assert.equal((await read('harness', 'response.problem.status', { id: problem.id })).decisionEffective, false);
    assert.deepEqual(await read('harness', 'response.problem.inspect', { id: problem.id }), closedProblem, 'Late fault never rewrites historical closure');
  }
});
