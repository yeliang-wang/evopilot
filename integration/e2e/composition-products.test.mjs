import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as runtime from '@evopilot-next/runtime';
import { createRuntimeService } from '@evopilot-next/runtime/service';
import * as harness from '@evopilot-next/harness';
import { createHarnessService } from '@evopilot-next/harness/service';
import * as ontology from '@evopilot-next/ontology';
import { createOntologyService } from '@evopilot-next/ontology/service';
import { createComposition } from '../../dist/integration/composition.js';
import { sha256 } from '../compatibility/v1/reference.mjs';

// Standalone fixture data, based on the supplied synthetic v1 contract examples.
// Decisions below authorize only these ephemeral fixtures, never business work.
const source = { id: 'source', kind: 'synthetic', locator: 'synthetic://composition/fixture',
  revision: 'synthetic-r1', digest: sha256({ fixture: 'composition-v1' }), status: 'synthetic' };
const mappings = ids => ids.map(targetRef => ({ id: 'mapping-' + targetRef, targetRef,
  sourceRef: source.id, sourceLocator: source.locator, sourceRevision: source.revision, status: 'synthetic' }));
const base = { id: 'composition-fixture', version: '0.1.0', specVersion: 'v1',
  provenance: { direction: 'forward', sources: [source] }, extensions: [], dependencies: [] };
const model = { ...base, product: 'ontology', visibility: 'public',
  concepts: [{ id: 'tree', label: 'tree', definition: 'Synthetic fixture tree.' }],
  properties: [{ id: 'quantity', conceptRef: 'tree', type: 'integer', required: true }],
  relations: [], constraints: [{ id: 'quantity-range', conceptRef: 'tree', propertyRef: 'quantity',
    kind: 'numeric-range', required: true, minimum: 0, maximum: 10 }],
  sourceMappings: mappings(['tree', 'quantity', 'quantity-range']), unresolvedIssues: [] };
const instance = { entities: [{ id: 'tree-one', conceptRef: 'tree', properties: { quantity: [2] } }], relations: [] };
const asset = { ...base, product: 'harness', visibility: 'private', kind: 'HarnessComponent',
  applicability: { enabled: true, domains: ['orchard'] },
  objectives: [{ id: 'objective', description: 'Check synthetic quality' }],
  preconditions: [{ id: 'ready-check', description: 'Fixture ready', evidenceKey: 'ready' }],
  inputs: [{ id: 'ready', type: 'boolean' }, { id: 'score', type: 'number' }],
  parameters: [{ id: 'minimum', type: 'number', default: 10 }],
  deliverables: [{ id: 'report', description: 'Synthetic quality report' }],
  rules: [{ id: 'quality', target: 'Synthetic quality', evidenceKey: 'score', operator: 'gte',
    parameterRef: 'minimum', severity: 'warning', blocking: false }],
  sourceMappings: mappings(['objective', 'ready-check', 'ready', 'score', 'minimum', 'report', 'quality']) };
const evidence = { id: 'fixture-observation', version: '0.1.0',
  source: { locator: 'synthetic://composition/observation', revision: 'synthetic-r1', digest: sha256({ ready: true, score: 12 }) },
  values: { ready: true, score: 12 } };
const scope = { visibility: 'private', projectId: 'synthetic-composition' };
const shared = { visibility: 'public', projectId: 'shared' };
const humanEvidenceRef = 'synthetic://test-only/no-real-business-approval';

test('actual public products: dual PASS, duplicate receipt, restart reconciliation and foreign scope refusal', async () => {
  assert.equal(ontology.validateOntology(model).valid, true);
  assert.equal(harness.validateHarness(asset).valid, true);
  assert.equal(ontology.validateInstances(model, instance).status, 'PASS');
  const workspaceRoot = realpathSync(mkdtempSync(join(tmpdir(), 'evopilot-composition-test-')));
  const options = { workspaceRoot, workspaceId: 'composition-test' };
  let c, serial = 0, evaluations = 0, dropResponse = false, foreignScope = false;
  const business = [];
  const apis = {
    runtime: { ...runtime, createRuntimeService(options, providers) {
      // Test-only fault injection around the actual Runtime factory.
      return createRuntimeService(options, { ...providers, resolveOntology(request) {
        const resolved = providers.resolveOntology(request);
        return foreignScope ? { ...resolved, scope: { visibility: 'public', projectId: 'unrelated' } } : resolved;
      } });
    } },
    ontology: { ...ontology, createOntologyService, validateInstances(...args) {
      const result = ontology.validateInstances(...args); business.push(result); return result;
    } },
    harness: { ...harness, createHarnessService(options, providers) {
      const service = createHarnessService(options, providers);
      return Object.freeze({ ...service, execute(request) {
        const result = service.execute(request);
        if (request.operation === 'asset.evaluate') {
          evaluations++;
          if (dropResponse) { dropResponse = false; throw Error('Test-only dropped response after actual Harness commit'); }
        }
        return result;
      } });
    } },
  };
  const read = (owner, selected, operation, input = {}) => c.request(owner, { operation, scope: selected, input });
  const write = (owner, selected, operation, input) => c.request(owner, { operation, scope: selected, input,
    requestId: 'fixture-' + (++serial), expectedRevision: c.inspect(owner, selected).revision });
  const publishFixture = (owner, selected, value, field) => {
    write(owner, selected, 'asset.put', { [field]: value });
    const identity = { id: value.id, version: value.version };
    const review = write(owner, selected, 'asset.review', identity).result;
    write(owner, selected, 'asset.decide', { ...identity, reviewDigest: review.reviewDigest, decision: 'APPROVE', humanEvidenceRef });
    return write(owner, selected, 'asset.publish', identity).result.reference;
  };
  const args = (id, prefix) => ({ scope, id, requestId: prefix + '-' + id, expectedRevision: c.inspect('runtime', scope).revision });
  try {
    c = createComposition(options, apis);
    const ontologyPin = publishFixture('ontology', shared, model, 'model');
    const harnessPin = publishFixture('harness', scope, { ...asset, dependencies: [ontologyPin] }, 'asset');
    write('runtime', scope, 'project.create', { name: 'Synthetic composition test' });
    write('runtime', scope, 'goal.create', { id: 'quality', description: 'Validate synthetic business and quality results' });
    const input = { schema: 'runtime-composition/v1', ontologyInstance: instance,
      harness: { mode: 'component', evidence, configuration: {} } };
    const parameters = id => ({ id, goalId: 'quality', ontology: ontologyPin, harness: harnessPin, input });
    const claims = new Map();
    for (const id of ['normal', 'response-lost']) {
      const prepared = write('runtime', scope, 'run.prepare', parameters(id)).result;
      write('runtime', scope, 'run.decide', { id, reviewDigest: prepared.reviewDigest, decision: 'APPROVE', humanEvidenceRef });
      dropResponse = id === 'response-lost';
      const request = args(id, 'dispatch'), result = await c.dispatch(request);
      assert.equal(dropResponse, false, 'Actual Harness evaluation must consume the response-loss injection');
      assert.equal(result.result.stage, id === 'normal' ? 'SUCCEEDED' : 'UNKNOWN');
      if (id === 'normal') assert.equal(result.result.outcome.receipt.result.evaluation, 'PASS');
      else assert.equal(result.result.outcome.reason, 'PROVIDER_UNAVAILABLE');
      claims.set(id, result.result.claim);
      const beforeDuplicate = c.inspect('harness', scope);
      const count = evaluations;
      const duplicate = await c.dispatch(request);
      const retained = read('runtime', scope, 'receipt.inspect', { requestId: request.requestId });
      assert.deepEqual(duplicate, retained);
      assert.equal(evaluations, count);
      assert.deepEqual(c.inspect('harness', scope), beforeDuplicate);
    }
    assert.equal(evaluations, 2);
    c.close(); c = createComposition(options, apis);
    const beforeReconcile = c.inspect('harness', scope);
    const reconcileRequest = args('response-lost', 'reconcile');
    const recovered = await c.reconcile(reconcileRequest);
    assert.equal(recovered.result.stage, 'SUCCEEDED');
    assert.deepEqual(recovered.result.claim, claims.get('response-lost'));
    assert.equal(recovered.result.attemptCount, 1);
    assert.equal(recovered.result.outcome.receipt.result.evaluation, 'PASS');
    assert.equal(evaluations, 2);
    assert.deepEqual(c.inspect('harness', scope), beforeReconcile);
    await c.reconcile(reconcileRequest);
    assert.equal(evaluations, 2);
    for (const id of ['normal', 'response-lost']) {
      const run = read('runtime', scope, 'run.inspect', { id });
      const providerReceipt = run.outcome.receipt;
      const receipt = read('harness', scope, 'evaluation.inspect', { requestId: providerReceipt.providerReceiptId });
      assert.equal(receipt.operation, 'asset.evaluate');
      assert.deepEqual(receipt.scope, scope);
      assert.deepEqual(receipt.result.report.reference, harnessPin);
      assert.equal(receipt.result.report.status, 'PASS');
      assert.equal(providerReceipt.claimId, claims.get(id).claimId);
      assert.equal(providerReceipt.inputDigest, sha256(input));
      assert.deepEqual(providerReceipt.pins, claims.get(id).pins);
      assert.equal(providerReceipt.result.evidenceDigest, sha256({ ontology: ontology.validateInstances(model, instance), harness: receipt.result.report }));
    }
    assert.equal(business.length, 2);
    assert(business.every(result => result.valid === true && result.status === 'PASS'));
    foreignScope = true;
    const beforeForeign = c.inspect('runtime', scope);
    assert.throws(() => write('runtime', scope, 'run.prepare', parameters('foreign-public')), { code: 'MATERIAL_SCOPE' });
    assert.deepEqual(c.inspect('runtime', scope), beforeForeign);
    assert.equal(evaluations, 2);
  } finally {
    try { c?.close(); } finally { rmSync(workspaceRoot, { recursive: true, force: true }); }
  }
});
