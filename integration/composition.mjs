import { exactFields, frozenClone, inspectReference, sha256, stableSerialize, validateReference } from './compatibility/v1/reference.mjs';
import { types } from 'node:util';

const owners = ['runtime', 'harness', 'ontology'];
const factories = { runtime: 'createRuntimeService', harness: 'createHarnessService', ontology: 'createOntologyService' };
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const equal = (a, b) => stableSerialize(a) === stableSerialize(b);
const signalAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;

// Inspect descriptors before touching values; never execute a getter or proxy trap.
function safeCopy(value, callbacks = false, ancestors = new Set()) {
  if (types.isProxy(value)) fail('INVALID_INPUT', 'Proxy input');
  if (typeof value === 'function') {
    if (callbacks) return value;
    fail('INVALID_INPUT', 'Callbacks require trusted SDK configuration');
  }
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value) || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(value)))
    fail('INVALID_INPUT', 'Expected acyclic plain data');
  ancestors.add(value);
  const result = Array.isArray(value) ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !d.enumerable || !Object.hasOwn(d, 'value')) fail('INVALID_INPUT', 'Expected data descriptors');
    Object.defineProperty(result, key, { value: safeCopy(d.value, callbacks, ancestors), enumerable: true });
  }
  ancestors.delete(value);
  return Object.freeze(result);
}

// Runtime adds exactly one non-JSON transport field to its frozen retained claim.
function invocation(context) {
  if (!context || types.isProxy(context) || ![Object.prototype, null].includes(Object.getPrototypeOf(context)) || !Object.isFrozen(context))
    fail('CLAIM_CONTEXT', 'Expected frozen Runtime invocation');
  const claimData = Object.create(null);
  let signal;
  for (const key of Reflect.ownKeys(context)) {
    const descriptor = Object.getOwnPropertyDescriptor(context, key);
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('CLAIM_CONTEXT', 'Expected data fields');
    if (key === 'signal') signal = descriptor.value;
    else claimData[key] = descriptor.value;
  }
  const check = () => {
    let aborted;
    try { aborted = signalAborted.call(signal); }
    catch { fail('CLAIM_CONTEXT', 'Expected native AbortSignal'); }
    if (aborted) fail('ABORTED', 'Runtime invocation interrupted');
  };
  check();
  return { claim: frozenClone(claimData), check };
}

// Loading public modules does not construct or initialize any owning service.
export async function loadInstalledProducts() {
  const runtime = await import('@evopilot-next/runtime');
  const runtimeService = await import('@evopilot-next/runtime/service');
  const harness = await import('@evopilot-next/harness');
  const harnessService = await import('@evopilot-next/harness/service');
  const ontology = await import('@evopilot-next/ontology');
  const ontologyService = await import('@evopilot-next/ontology/service');
  return { runtime: { ...runtime, ...runtimeService }, harness: { ...harness, ...harnessService }, ontology: { ...ontology, ...ontologyService } };
}

// Execution completion and business/quality outcomes are separate dimensions.
export function aggregateEvaluation(ontology, harness) {
  const missing = ['INDETERMINATE', 'NOT_CHECKED', 'NOT_EVALUATED'];
  const business = ontology?.status === 'ERROR' ? 'ERROR'
    : missing.includes(ontology?.status) ? 'INDETERMINATE'
      : ontology?.status === 'N/A' ? 'N/A' : ontology?.valid === false ? 'FAIL' : ontology?.status;
  const quality = harness?.status;
  const results = [business, quality];
  if (results.includes('ERROR')) return 'ERROR';
  if (results.includes('FAIL')) return 'FAIL';
  if (results.some(s => !['PASS', 'N/A'].includes(s))) return 'INDETERMINATE';
  return results.includes('N/A') ? 'N/A' : 'PASS';
}

export function createComposition(options, apis, trustedOntologyProviders = {}) {
  options = frozenClone(safeCopy(options));
  exactFields(options, ['workspaceRoot', 'workspaceId']);
  const ontologyProviders = safeCopy(trustedOntologyProviders, true);
  if (!ontologyProviders || Array.isArray(ontologyProviders) || typeof ontologyProviders !== 'object')
    fail('INVALID_INPUT', 'Expected trusted provider object');
  // These are trusted code-injected APIs, never request-supplied providers.
  for (const owner of owners) {
    if (apis?.[owner]?.PRODUCT !== owner || apis[owner].VERSION !== '0.1.0') fail('PRODUCT_IDENTITY', 'Expected exact 0.1.0 product: ' + owner);
    if (typeof apis[owner][factories[owner]] !== 'function') fail('PRODUCT_API', 'Missing public service factory: ' + owner);
  }
  for (const name of ['ontology', 'harness']) if (typeof apis[name].verifyDelivery !== 'function') fail('PRODUCT_API', 'Missing delivery validator');
  if (typeof apis.ontology.validateInstances !== 'function') fail('PRODUCT_API', 'Missing instance validator');
  const products = Object.fromEntries(owners.map(owner => [owner, { ...apis[owner] }]));
  const services = new Map(), initialized = new Set();
  let closed = false;
  function service(owner, initialize = true) {
    if (closed) fail('CLOSED', 'Composition is closed');
    if (!owners.includes(owner)) fail('UNKNOWN_PRODUCT', 'Unknown product');
    if (!services.has(owner)) {
      const providers = owner === 'runtime' ? {
        resolveOntology: request => resolveMaterial('ontology', request),
        resolveHarness: request => resolveMaterial('harness', request),
        execute: executeClaim,
        inspectReceipt: inspectClaimReceipt,
      } : owner === 'harness' ? { resolveOntology: resolveHarnessOntology } : ontologyProviders;
      services.set(owner, products[owner][factories[owner]](options, providers));
    }
    const result = services.get(owner);
    if (initialize && !initialized.has(owner)) {
      result.initialize();
      initialized.add(owner);
    }
    return result;
  }
  const read = (owner, scope, operation, input = {}) => service(owner).execute({ operation, scope, input });
  function scopeCandidates(reference, scope) {
    validateReference(reference, { visibility: scope.visibility });
    exactFields(scope, ['visibility', 'projectId']);
    if (reference.visibility === 'private') return [{ visibility: 'private', projectId: scope.projectId }];
    return [...new Set([scope.projectId, 'shared'])].map(projectId => ({ visibility: 'public', projectId }));
  }
  function published(owner, reference, scope, check = () => {}) {
    validateReference(reference, { product: owner, visibility: scope.visibility });
    const matches = [];
    for (const candidate of scopeCandidates(reference, scope)) {
      check();
      let record;
      try { record = read(owner, candidate, 'asset.inspect', { id: reference.id, version: reference.version }); }
      catch (error) { if (error.code === 'NOT_FOUND') continue; throw error; }
      check();
      if (!equal(record.scope, candidate)) fail('MATERIAL_SCOPE', 'Owner returned a foreign scope');
      if (!record.delivery) continue;
      if (products[owner].verifyDelivery(record.delivery).valid !== true) fail('MATERIAL_INTEGRITY', 'Invalid owning delivery');
      const actual = { product: owner, id: record.model.id, version: record.model.version, specVersion: record.model.specVersion, digest: record.delivery.digest, visibility: record.scope.visibility };
      // A conflicting identity in a candidate scope cannot silently select another pin.
      inspectReference(reference, actual, { visibility: scope.visibility });
      matches.push(record);
    }
    if (matches.length !== 1) fail(matches.length ? 'MATERIAL_AMBIGUOUS' : 'MATERIAL_UNAVAILABLE', 'Expected one exact published material');
    return matches[0];
  }
  function resolveHarnessOntology({ reference, workspaceId, scope }) {
    if (workspaceId !== options.workspaceId) fail('MATERIAL_SCOPE', 'Foreign workspace');
    const record = published('ontology', reference, scope);
    return { reference: frozenClone(reference), published: true, workspaceId, projectId: record.scope.projectId };
  }
  function resolveMaterial(owner, { reference, workspace, scope }) {
    if (workspace?.id !== options.workspaceId || workspace?.canonicalRoot !== options.workspaceRoot || workspace?.schema !== 'evopilot-workspace/v1') fail('MATERIAL_SCOPE', 'Foreign workspace');
    const record = published(owner, reference, scope);
    const materialDigest = sha256({ delivery: record.delivery, ...(record.resolution ? { resolution: record.resolution } : {}) });
    return { reference: frozenClone(reference), workspace, scope: record.scope, published: true, materialDigest, descriptor: { kind: owner + '-composition/v1', digest: materialDigest } };
  }
  function claimMaterials(claim, check) {
    // Read Runtime's retained claim, not transient adapter state, on both paths.
    check();
    const run = read('runtime', claim.scope, 'run.inspect', { id: claim.id });
    check();
    if (!equal(run.claim, claim) || claim.inputDigest !== sha256(claim.input)) fail('CLAIM_MISMATCH', 'Uncorrelated retained claim');
    const ontology = published('ontology', claim.pins.ontology, claim.scope, check);
    const harness = published('harness', claim.pins.harness, claim.scope, check);
    return { ontology, harness };
  }
  // Slug length <=64; the full claim is additionally checked against retained Runtime state.
  const evaluationId = claim => 'composition-' + sha256({ claimId: claim.claimId }).slice(7, 59);
  const evaluationInput = claim => ({ id: claim.pins.harness.id, version: claim.pins.harness.version, evidence: claim.input.harness.evidence, configuration: claim.input.harness.configuration });
  function receipt(claim, materials, retained) {
    const input = evaluationInput(claim), scope = materials.harness.scope;
    if (retained.requestId !== evaluationId(claim) || retained.operation !== 'asset.evaluate' || !equal(retained.scope, scope)
      || retained.requestDigest !== sha256({ operation: 'asset.evaluate', scope, input })) fail('RECEIPT_MISMATCH', 'Harness receipt does not bind exact input and scope');
    const quality = retained.result.report;
    inspectReference(claim.pins.harness, quality.reference);
    const business = products.ontology.validateInstances(materials.ontology.model, claim.input.ontologyInstance);
    return { claimId: claim.claimId, inputDigest: claim.inputDigest, pins: claim.pins, providerReceiptId: retained.requestId, status: 'SUCCEEDED',
      result: { evaluation: aggregateEvaluation(business, quality), evidenceDigest: sha256({ ontology: business, harness: quality }) } };
  }
  function executeClaim(context) {
    const { claim, check } = invocation(context);
    const materials = claimMaterials(claim, check), scope = materials.harness.scope;
    check();
    const expectedRevision = read('harness', scope, 'workspace.inspect').revision;
    check();
    // One attempt only. A CAS failure or uncertain response is never redispatched here.
    const retained = service('harness').execute({ operation: 'asset.evaluate', scope, input: evaluationInput(claim), requestId: evaluationId(claim), expectedRevision });
    check();
    return receipt(claim, materials, retained);
  }
  function inspectClaimReceipt(context) {
    // Missing/unverifiable evidence throws: Runtime preserves UNKNOWN without execution.
    const { claim, check } = invocation(context);
    const materials = claimMaterials(claim, check);
    check();
    const retained = read('harness', materials.harness.scope, 'evaluation.inspect', { requestId: evaluationId(claim) });
    check();
    return receipt(claim, materials, retained);
  }
  function capabilities() {
    return frozenClone({ version: '0.1.0', authority: false,
      products: Object.fromEntries(owners.map(owner => [owner, service(owner, false).capabilities()])),
      ontologyProviders: Object.fromEntries(['resolveClassificationSource', 'classificationModel', 'classificationAdvisor', 'resolveLegacyHarness'].map(name =>
        [name, Object.hasOwn(ontologyProviders, name) && ontologyProviders[name] != null ? 'CONFIGURED' : 'UNCONFIGURED'])),
      pending: ['M3 MCP/Expert/Host final acceptance', 'E03/E10', 'release'] });
  }
  function request(owner, envelope) {
    // Keep the exact envelope for owner validation and receipt correlation.
    frozenClone(safeCopy(envelope));
    if (['providers', 'trustedOntologyProviders', 'resolveClassificationSource', 'classificationModel', 'classificationAdvisor', 'resolveLegacyHarness'].some(key => Object.hasOwn(envelope, key)))
      fail('INVALID_INPUT', 'Providers require trusted SDK configuration');
    const operation = Object.getOwnPropertyDescriptor(envelope, 'operation')?.value;
    const instance = service(owner);
    return owner === 'ontology' && ['classification.start', 'classification.reanalyze'].includes(operation)
      ? instance.classify(envelope) : instance.execute(envelope);
  }
  function close() {
    if (closed) return;
    closed = true;
    const errors = [];
    for (const instance of services.values()) { try { instance.close(); } catch (error) { errors.push(error); } }
    if (errors.length) throw new AggregateError(errors, 'Product close failed');
  }
  return Object.freeze({
    request,
    dispatch: async args => service('runtime').dispatch(args),
    reconcile: async args => service('runtime').reconcile(args),
    inspect: (owner, scope) => read(owner, scope, 'workspace.inspect'),
    capabilities, close,
  });
}
