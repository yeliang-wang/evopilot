import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createComposition } from '../../dist/integration/composition.js';

import { historicalProducts } from './fixtures/historical-products.mjs';

// Historical v0.2 regression with TEST-ONLY writers. Current native E2E is separate.
// All sources, decisions and evidence in this file are
// explicitly synthetic. These assertions verify deterministic contracts, not Host reasoning.
const models = JSON.parse(readFileSync(new URL('../../projects/evopilot-ontology/examples/synthetic-models.json', import.meta.url)));
const harnessSamples = JSON.parse(readFileSync(new URL('../../projects/evopilot-harness/examples/synthetic-harnesses.json', import.meta.url)));
const scope = { visibility: 'private', projectId: 'expert-synthetic' };
const other = { visibility: 'private', projectId: 'different-project' };
const humanEvidenceRef = 'synthetic://e2e-only/no-business-approval';
const bytesHash = bytes => createHash('sha256').update(bytes).digest('hex');

async function setup(t, selectedScope = scope) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'evopilot-expert-products-')));
  const options = { workspaceRoot: join(parent, 'state'), workspaceId: 'expert-products' };
  const apis = await historicalProducts();
  let c = createComposition(options, apis), serial = 0;
  t.after(() => { c.close(); rmSync(parent, { recursive: true, force: true }); });
  const read = (owner, operation, input = {}, selected = selectedScope) => c.request(owner, { operation, scope: selected, input });
  const write = (owner, operation, input, selected = selectedScope) => c.request(owner, { operation, scope: selected, input,
    requestId: `expert-${++serial}`, expectedRevision: c.inspect(owner, selected).revision });
  const identify = asset => ({ id: asset.id, version: asset.version });
  const decide = (owner, asset, decision = 'APPROVE') => {
    const identity = identify(asset);
    const review = write(owner, 'asset.review', identity).result;
    write(owner, 'asset.decide', { ...identity, reviewDigest: review.reviewDigest, decision, humanEvidenceRef });
  };
  const publish = (owner, asset) => {
    write(owner, 'asset.put', { [owner === 'ontology' ? 'model' : 'asset']: asset });
    decide(owner, asset);
    return write(owner, 'asset.publish', identify(asset)).result;
  };
  return { parent, read, write, identify, decide, publish, get composition() { return c; }, restart() { c.close(); c = createComposition(options, apis); } };
}

test('historical v0.2: V02-B01/B02/B03: forward and reverse assets retain provenance, reject pending/rejected/stale approvals and preserve source', async t => {
  const f = await setup(t);
  const sourceRoot = join(f.parent, 'authorized-synthetic-source'); mkdirSync(sourceRoot);
  const sourceFile = join(sourceRoot, 'requirements.txt'); writeFileSync(sourceFile, 'Synthetic orchard: trees have a quantity.\n');
  const before = bytesHash(readFileSync(sourceFile));
  for (const direction of ['forward', 'reverse']) {
    const fixture = models.assets.find(item => item.provenance.direction === direction);
    assert(fixture, `Missing independent ${direction} v1 fixture`);
    const model = { ...structuredClone(fixture), id: `expert-${direction}`, visibility: 'private' };
    const identity = f.identify(model);
    const pending = structuredClone(model);
    pending.unresolvedIssues.push({ id: 'business-gap', description: 'Synthetic unresolved business meaning', targetRef: model.concepts[0].id, required: true });
    f.write('ontology', 'asset.put', { model: pending }); f.decide('ontology', pending);
    assert.throws(() => f.write('ontology', 'asset.publish', identity), { code: 'PENDING_MODEL' });
    f.write('ontology', 'asset.put', { model }); f.decide('ontology', model, 'REJECT');
    assert.throws(() => f.write('ontology', 'asset.publish', identity), { code: 'APPROVAL_REQUIRED' });
    const stale = f.write('ontology', 'asset.review', identity).result;
    model.concepts[0].definition += ' Reviewed synthetic clarification.';
    f.write('ontology', 'asset.put', { model });
    assert.throws(() => f.write('ontology', 'asset.decide', { ...identity, reviewDigest: stale.reviewDigest, decision: 'APPROVE', humanEvidenceRef }), { code: 'REVIEW_REQUIRED' });
    f.decide('ontology', model);
    const publication = f.write('ontology', 'asset.publish', identity).result;
    assert.deepEqual(publication.delivery.model.provenance, model.provenance);
    assert.deepEqual(publication.delivery.model.sourceMappings, model.sourceMappings);
    assert.equal(publication.reference.visibility, 'private');
    assert.throws(() => f.write('ontology', 'asset.put', { model }), { code: 'IMMUTABLE_VERSION' });
    assert.throws(() => f.read('ontology', 'asset.inspect', identity, other), { code: 'NOT_FOUND' });
  }
  assert.equal(bytesHash(readFileSync(sourceFile)), before, 'Host-authoring fixture may not edit authorized input');
});

test('historical v0.2: V02-B02: observed source and inferred meaning remain distinct in a pending reverse draft', async t => {
  const f = await setup(t);
  const sourceFile = join(f.parent, 'synthetic-inventory.json');
  const sourceBytes = Buffer.from('{"entity":"item","quantity":3}\n');
  writeFileSync(sourceFile, sourceBytes);
  const sourceDigest = bytesHash(readFileSync(sourceFile));
  const fixture = models.assets.find(item => item.provenance.direction === 'reverse');
  const model = { ...structuredClone(fixture), id: 'observed-versus-inferred', visibility: 'private' };
  for (const source of model.provenance.sources) {
    source.locator = `synthetic://fixture/inventory.json#${source.id}`;
    source.revision = 'synthetic-source-r1'; source.digest = `sha256:${sourceDigest}`; source.status = 'source-observed';
  }
  for (const mapping of model.sourceMappings) {
    const source = model.provenance.sources.find(item => item.id === mapping.sourceRef);
    mapping.sourceLocator = source.locator; mapping.sourceRevision = source.revision; mapping.status = source.status;
  }
  const inferred = { id: 'inferred-meaning', kind: 'synthetic-analyst-hypothesis', locator: 'synthetic://fixture/hypothesis', revision: 'hypothesis-r1', digest: `sha256:${bytesHash(Buffer.from('Unconfirmed domain meaning'))}`, status: 'inferred' };
  model.provenance.sources.push(inferred);
  model.sourceMappings.push({ id: 'mapping-inferred-meaning', targetRef: model.concepts[0].id, sourceRef: inferred.id, sourceLocator: inferred.locator, sourceRevision: inferred.revision, status: inferred.status });
  model.unresolvedIssues.push({ id: 'unconfirmed-meaning', description: 'Synthetic inference needs an actual domain decision', targetRef: model.concepts[0].id, required: true });
  f.write('ontology', 'asset.put', { model });
  const record = f.read('ontology', 'asset.inspect', f.identify(model));
  assert.deepEqual(record.model.provenance, model.provenance);
  assert.deepEqual(record.model.sourceMappings, model.sourceMappings);
  assert(record.model.sourceMappings.some(item => item.status === 'source-observed'));
  assert(record.model.sourceMappings.some(item => item.status === 'inferred'));
  assert.equal(record.validation.status, 'PENDING');
  f.decide('ontology', model);
  assert.throws(() => f.write('ontology', 'asset.publish', f.identify(model)), { code: 'PENDING_MODEL' });
  f.restart();
  assert.deepEqual(f.read('ontology', 'asset.inspect', f.identify(model)).model, model);
  assert.equal(bytesHash(readFileSync(sourceFile)), sourceDigest);
  assert.deepEqual(readFileSync(sourceFile), sourceBytes);
});

test('historical v0.2: V02-A05: shipped reading-list and inventory example inputs reach actual deliveries and pinned Runtime evaluation in isolated scopes', async t => {
  for (const direction of ['forward', 'reverse']) {
    const projectId = direction === 'forward' ? 'example-reading-list' : 'example-inventory';
    const selected = { visibility: 'private', projectId };
    const f = await setup(t, selected);
    const template = new URL(`../../workspace/templates/project/examples/${direction}/${direction === 'forward' ? 'README.md' : 'source.json'}`, import.meta.url);
    const originalBytes = readFileSync(template), sourceDigest = bytesHash(originalBytes);
    const source = { id: 'input-source', kind: 'synthetic-example', locator: `synthetic://shipped-example/${direction}`, revision: 'example-r1', digest: `sha256:${sourceDigest}`, status: 'synthetic' };
    const provenance = { direction, sources: [source] };
    const map = ids => ids.map(targetRef => ({ id: `mapping-${targetRef}`, targetRef, sourceRef: source.id, sourceLocator: source.locator, sourceRevision: source.revision, status: source.status }));
    const base = { id: projectId, version: '1.0.0', specVersion: 'v1', visibility: 'private', provenance, extensions: [], dependencies: [] };
    // Host-authored synthetic expected derivation; this is not a repository parser or LLM claim.
    const concept = direction === 'forward' ? 'book' : 'item';
    const properties = direction === 'forward'
      ? [{ id: 'title', conceptRef: concept, type: 'string', required: true }, { id: 'status', conceptRef: concept, type: 'string', required: true }, { id: 'completion-date', conceptRef: concept, type: 'string', required: false }]
      : [{ id: 'sku', conceptRef: concept, type: 'string', required: true }, { id: 'quantity', conceptRef: concept, type: 'integer', required: true }];
    const constraint = direction === 'forward'
      ? { id: 'status-domain', conceptRef: concept, propertyRef: 'status', kind: 'enum', required: true, values: ['planned', 'reading', 'finished'] }
      : { id: 'nonnegative-stock', conceptRef: concept, propertyRef: 'quantity', kind: 'numeric-range', required: true, minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
    const model = { ...base, product: 'ontology', concepts: [{ id: concept, label: concept, definition: `Synthetic ${concept} from the shipped ${direction} example. Cross-field completion evidence is checked by Harness.` }],
      properties, relations: [], constraints: [constraint], sourceMappings: map([concept, ...properties.map(item => item.id), constraint.id]), unresolvedIssues: [] };
    const inputs = [{ id: 'observed', type: 'boolean' }, { id: 'contract-satisfied', type: 'boolean' }];
    const asset = { ...base, product: 'harness', kind: 'HarnessComponent', applicability: { enabled: true, domains: [projectId] },
      objectives: [{ id: 'objective', description: 'Check the supplied example domain report' }],
      preconditions: [{ id: 'source-checked', description: 'The synthetic input was observed', evidenceKey: 'observed' }], inputs, parameters: [],
      deliverables: [{ id: 'report', description: 'Pinned synthetic example domain evaluation' }],
      rules: [{ id: 'contract-rule', target: direction === 'forward' ? 'Finished book requires an observed completion date' : 'Observed inventory quantity is nonnegative', evidenceKey: 'contract-satisfied', operator: 'eq', expected: true, severity: 'error', blocking: true }],
      sourceMappings: map(['objective', 'source-checked', ...inputs.map(item => item.id), 'report', 'contract-rule']) };
    const ontologyPin = f.publish('ontology', model).reference;
    const harnessPin = f.publish('harness', asset).reference;
    f.write('runtime', 'project.create', { name: `Synthetic ${projectId}` });
    f.write('runtime', 'goal.create', { id: 'example-goal', description: 'Validate shipped example inputs and supplied report' });
    const sourceValue = direction === 'reverse' ? JSON.parse(originalBytes) : null;
    const inputProperties = direction === 'forward'
      ? { title: ['Synthetic book'], status: ['finished'], 'completion-date': ['2026-01-01'] }
      : { sku: [sourceValue.sample.sku], quantity: [sourceValue.sample.quantity] };
    for (const outcome of ['pass', 'missing', 'invalid']) {
      const supplied = structuredClone(inputProperties);
      if (outcome === 'invalid') { if (direction === 'forward') delete supplied['completion-date']; else supplied.quantity = [-1]; }
      const contractSatisfied = direction === 'forward' ? supplied.status[0] !== 'finished' || Boolean(supplied['completion-date']?.[0]) : supplied.quantity[0] >= 0;
      const values = outcome === 'missing' ? {} : { observed: true, 'contract-satisfied': contractSatisfied };
      const evidence = { id: `example-${outcome}`, version: '1.0.0', source: { locator: `synthetic://shipped-example/${direction}/report`, revision: 'example-r1', digest: `sha256:${bytesHash(Buffer.from(JSON.stringify(values)))}` }, values };
      const input = { schema: 'runtime-composition/v1', ontologyInstance: { entities: [{ id: 'sample', conceptRef: concept, properties: supplied }], relations: [] }, harness: { mode: 'component', evidence, configuration: {} } };
      const prepared = f.write('runtime', 'run.prepare', { id: outcome, goalId: 'example-goal', ontology: ontologyPin, harness: harnessPin, input }).result;
      f.write('runtime', 'run.decide', { id: outcome, reviewDigest: prepared.reviewDigest, decision: 'APPROVE', humanEvidenceRef });
      const requestId = `dispatch-example-${outcome}`;
      const result = await f.composition.dispatch({ scope: selected, id: outcome, requestId, expectedRevision: f.composition.inspect('runtime', selected).revision });
      assert.equal(result.result.stage, 'SUCCEEDED');
      assert.equal(result.result.outcome.receipt.result.evaluation, outcome === 'pass' ? 'PASS' : outcome === 'missing' ? 'INDETERMINATE' : 'FAIL');
      assert.equal(f.read('runtime', 'run.inspect', { id: outcome }).attemptCount, 1);
      const admission = f.read('runtime', 'receipt.inspect', { requestId });
      assert.equal(admission.result.stage, 'RUNNING');
      assert.deepEqual(admission.result.claim, result.result.claim);
      assert.deepEqual(f.read('runtime', 'receipt.inspect', { requestId: result.requestId }), result);
    }
    assert.deepEqual(f.read('ontology', 'asset.list', {}, other), []);
    assert.equal(bytesHash(readFileSync(template)), sourceDigest);
  }
});

test('historical v0.2: V02-A06/B04: scoped Harness evaluation preserves Warning, missing evidence and explicit version', async t => {
  const f = await setup(t);
  const sample = structuredClone(harnessSamples[0]);
  const asset = { ...sample.asset, id: 'expert-quality', visibility: 'private' };
  const published = f.publish('harness', asset);
  const identity = f.identify(asset);
  for (const [values, expected] of [[{}, 'INDETERMINATE'], [{ ready: true, score: 1 }, 'FAIL'], [sample.evidence.values, 'PASS']]) {
    const receipt = f.write('harness', 'asset.evaluate', { ...identity, evidence: { ...sample.evidence, values }, configuration: {} });
    assert.equal(receipt.result.report.status, expected);
    assert.deepEqual(receipt.result.report.actions, []);
    assert.deepEqual(f.read('harness', 'evaluation.inspect', { requestId: receipt.requestId }), receipt);
    assert.throws(() => f.read('harness', 'evaluation.inspect', { requestId: receipt.requestId }, other), { code: 'NOT_FOUND' });
    assert.deepEqual(f.read('harness', 'asset.inspect', identity).delivery, published.delivery);
  }
  assert.deepEqual(f.read('harness', 'asset.list', {}, other), []);
});

test('historical v0.2: V02-B06/A07: a second extraction preserves the old completed Run, receipts, pins and delivery', async t => {
  const f = await setup(t);
  const fixture = models.assets.find(item => item.provenance.direction === 'reverse');
  const first = { ...structuredClone(fixture), id: 'expert-evolution', version: '1.0.0', visibility: 'private' };
  const firstDelivery = f.publish('ontology', first);
  const firstRecord = f.read('ontology', 'asset.inspect', f.identify(first));
  const sample = structuredClone(harnessSamples[0]);
  const harness = f.publish('harness', { ...sample.asset, id: 'evolution-quality', visibility: 'private' }).reference;
  f.write('runtime', 'project.create', { name: 'Synthetic source evolution' });
  f.write('runtime', 'goal.create', { id: 'evolution-goal', description: 'Retain the first extraction and exact Run evidence' });
  const prepared = f.write('runtime', 'run.prepare', { id: 'first-extraction-run', goalId: 'evolution-goal', ontology: firstDelivery.reference, harness,
    input: { schema: 'runtime-composition/v1', ontologyInstance: models.instances[fixture.id], harness: { mode: 'component', evidence: sample.evidence, configuration: {} } } }).result;
  f.write('runtime', 'run.decide', { id: 'first-extraction-run', reviewDigest: prepared.reviewDigest, decision: 'APPROVE', humanEvidenceRef });
  const completed = await f.composition.dispatch({ scope, id: 'first-extraction-run', requestId: 'first-extraction-dispatch', expectedRevision: f.composition.inspect('runtime', scope).revision });
  assert.equal(completed.result.stage, 'SUCCEEDED');
  const originalRun = f.read('runtime', 'run.inspect', { id: 'first-extraction-run' });
  const originalAdmission = f.read('runtime', 'receipt.inspect', { requestId: 'first-extraction-dispatch' });
  assert.equal(originalRun.attemptCount, 1);
  const next = { ...structuredClone(first), version: '1.1.0' };
  next.concepts[0].definition += ' Explicit second-revision extraction.';
  for (const source of next.provenance.sources) {
    source.revision = 'synthetic-second-revision';
    source.digest = `sha256:${bytesHash(Buffer.from(source.revision))}`;
  }
  for (const mapping of next.sourceMappings) mapping.sourceRevision = 'synthetic-second-revision';
  const secondDelivery = f.publish('ontology', next);
  assert.notEqual(secondDelivery.reference.digest, firstDelivery.reference.digest);
  assert.equal(secondDelivery.reference.version, '1.1.0');
  f.restart();
  assert.deepEqual(f.read('ontology', 'asset.inspect', f.identify(first)), firstRecord);
  assert.deepEqual(f.read('runtime', 'run.inspect', { id: 'first-extraction-run' }), originalRun);
  assert.deepEqual(f.read('runtime', 'receipt.inspect', { requestId: 'first-extraction-dispatch' }), originalAdmission);
  assert.deepEqual(f.read('runtime', 'receipt.inspect', { requestId: completed.requestId }), completed);
  assert.deepEqual(originalRun.plan.pins.ontology, firstDelivery.reference);
  assert.notDeepEqual(originalRun.plan.pins.ontology, secondDelivery.reference);
  assert.deepEqual(f.read('ontology', 'asset.inspect', f.identify(next)).delivery, secondDelivery.delivery);
  assert.deepEqual(firstRecord.delivery.model.provenance, first.provenance);
  assert.notDeepEqual(firstRecord.delivery.model.provenance, next.provenance);
});
