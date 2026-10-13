import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOntologyService } from '@evopilot-next/ontology/service';
import { createHarnessService } from '@evopilot-next/harness/service';
import { createRuntimeService } from '@evopilot-next/runtime/service';
import { catalogClient, ownedCatalogMaterials } from '../../projects/evopilot-ontology/tests/fixtures/catalog-service-materials.mjs';
import { fixture, taxonomy } from '../../projects/evopilot-ontology/tests/fixtures/classification-service.mjs';

// Actual installed public service, no configured callbacks. The reused owner fixture
// builders only supply explicitly synthetic materials and synthetic decisions.
test('V02-C06: default provider absence prevents Catalog publication without changing prepared materials or state', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'evopilot-expert-catalog-')));
  const service = createOntologyService({ workspaceRoot: join(root, 'state'), workspaceId: 'catalog-test' });
  t.after(() => { service.close(); rmSync(root, { force: true, recursive: true }); });
  service.initialize();
  const client = catalogClient(service, { visibility: 'public', projectId: 'alpha' });
  const set = ownedCatalogMaterials(client);
  const before = client.read('workspace.inspect');
  const parameters = { action: 'PUBLISH', catalogId: 'main', expectedHead: 'EMPTY', sets: [set] };
  assert.throws(() => client.read('semantic.catalog.preview', parameters), { code: 'PROVIDER_REQUIRED' });
  assert.throws(() => client.prepare(parameters), { code: 'PROVIDER_REQUIRED' });
  assert.deepEqual(client.read('workspace.inspect'), before);
  assert.equal(client.read('semantic.catalog.inspect', { catalogId: 'main' }).head, 'EMPTY');
});

test('V02-C07/C08: default classification prerequisite cannot create results or a Harness handoff', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'evopilot-expert-classification-')));
  const service = createOntologyService({ workspaceRoot: join(root, 'state'), workspaceId: 'expert-default-classification' });
  t.after(() => { service.close(); rmSync(root, { force: true, recursive: true }); });
  service.initialize();
  const scope = { visibility: 'private', projectId: 'synthetic' };
  const before = service.execute({ operation: 'workspace.inspect', scope, input: {} });
  await assert.rejects(service.classify({ operation: 'classification.start', scope,
    input: { id: 'session', sourceId: 'synthetic-cache', taxonomy: taxonomy() },
    requestId: 'classify-missing-provider', expectedRevision: before.revision }), { code: 'CLASSIFICATION_PROVIDER_UNAVAILABLE' });
  assert.deepEqual(service.execute({ operation: 'workspace.inspect', scope, input: {} }), before);
  assert.deepEqual(service.execute({ operation: 'classification.list', scope, input: {} }), []);
  assert.throws(() => service.execute({ operation: 'classification.inspect', scope, input: { id: 'session' } }), { code: 'NOT_FOUND' });
  assert.throws(() => service.execute({ operation: 'receipt.inspect', scope, input: { requestId: 'classify-missing-provider' } }), { code: 'NOT_FOUND' });
});

test('V02-C08: configured synthetic classification requires exact human token and never creates Harness assets or Runtime work', async t => {
  const f = fixture();
  const ontology = createOntologyService(f.options, f.providers);
  const harness = createHarnessService(f.options), runtime = createRuntimeService(f.options);
  t.after(() => { ontology.close(); harness.close(); runtime.close(); f.cleanup(); });
  for (const service of [ontology, harness, runtime]) service.initialize();
  const scope = { visibility: 'private', projectId: 'synthetic' };
  const read = (service, operation, input = {}) => service.execute({ operation, scope, input });
  const revision = service => read(service, 'workspace.inspect').revision;
  const beforeHarness = read(harness, 'workspace.inspect'), beforeRuntime = read(runtime, 'workspace.inspect');
  await ontology.classify({ operation: 'classification.start', scope, input: { id: 'session', sourceId: 'synthetic-cache', taxonomy: taxonomy() }, requestId: 'synthetic-start', expectedRevision: revision(ontology) });
  const result = read(ontology, 'classification.inspect', { id: 'session' }).attempts[0].result;
  assert.equal(result.aggregate, 'TAXONOMY_MATCHED');
  const input = { id: 'session', decisionToken: `CONTINUE_TO_HARNESS:session:${result.analysisResultDigest}`, humanEvidence: { uid: process.getuid(), evidenceRef: 'synthetic:e2e-decision-no-business-authority', analysisResultDigest: result.analysisResultDigest } };
  const before = revision(ontology);
  const request = value => ({ operation: 'classification.continue_to_harness', scope, input: value, requestId: 'synthetic-handoff', expectedRevision: before });
  assert.throws(() => ontology.execute(request({ ...input, decisionToken: 'continue' })), { code: 'EXPLICIT_HANDOFF_DECISION_REQUIRED' });
  assert.throws(() => ontology.execute(request({ ...input, humanEvidence: { ...input.humanEvidence, analysisResultDigest: 'sha256:' + '0'.repeat(64) } })), { code: 'HUMAN_EVIDENCE_MISMATCH' });
  assert.equal(revision(ontology), before);
  assert.throws(() => read(ontology, 'receipt.inspect', { requestId: 'synthetic-handoff' }), { code: 'NOT_FOUND' });
  const receipt = ontology.execute(request(input));
  assert.equal(receipt.result.authority.approves, false); assert.equal(receipt.result.authority.publishes, false);
  assert.deepEqual(read(harness, 'workspace.inspect'), beforeHarness);
  assert.deepEqual(read(runtime, 'workspace.inspect'), beforeRuntime);
  assert.deepEqual(read(harness, 'asset.list'), []); assert.deepEqual(read(runtime, 'project.list'), []);
});
