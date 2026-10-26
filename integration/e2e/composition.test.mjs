import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createComposition, aggregateEvaluation } from '../../dist/integration/composition.js';
import { frozenClone, sha256 } from '../compatibility/v1/reference.mjs';
import { validateProductMetadata } from '../../scripts/check.mjs';

const invoke = (claim, signal = new AbortController().signal) => Object.freeze({ ...frozenClone(claim), signal });
const options = { workspaceRoot: '/synthetic-unopened-workspace', workspaceId: 'composition' };
const scope = { visibility: 'private', projectId: 'example' };
const shared = { visibility: 'public', projectId: 'shared' };
const reference = product => ({ product, id: 'example', version: '0.1.0', specVersion: 'v1', visibility: product === 'ontology' ? 'public' : 'private', digest: 'sha256:' + 'a'.repeat(64) });
// Exact contract from Ontology docs/classification-service.md; interface only.
function validateProviderContract(providers) {
  const invalid = () => { throw Object.assign(new Error('Invalid provider contract'), { code: 'INVALID_REQUEST' }); };
  for (const [key, value] of Object.entries(providers)) {
    if (!['resolveClassificationSource', 'classificationAdvisor', 'classificationModel', 'resolveLegacyHarness', 'readFeedback', 'resolveFeedbackMaterial'].includes(key)) invalid();
    if (key !== 'classificationModel') { if (typeof value !== 'function') invalid(); continue; }
    if (!value || Object.keys(value).sort().join() !== ['modelId', 'providerId', 'revision', 'timeoutMs'].sort().join()) invalid();
    for (const field of ['providerId', 'modelId', 'revision']) if (typeof value[field] !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value[field])) invalid();
    if (!Number.isInteger(value.timeoutMs) || value.timeoutMs < 1 || value.timeoutMs > 180000) invalid();
  }
}

test('documented owner contract rejects aliases and malformed models before configured report', () => {
  for (const supplied of [{ source() {} }, { model() {} }, { advisor() {} }, { arbitrary: true },
    { classificationModel: () => {} }, { classificationModel: { providerId: 'p', modelId: 'm', revision: 'r', timeoutMs: 180001 } },
    { classificationAdvisor: null }, { resolveClassificationSource: 'path' }]) {
    const f = fixture(), c = createComposition(options, f.apis, supplied);
    try { assert.throws(() => c.capabilities(), { code: 'INVALID_REQUEST' }); assert.deepEqual(f.events, []); }
    finally { c.close(); }
  }
});
// Instrumented interface fixtures: no product storage, approvals or E10 evidence.
function fixture() {
  const events = [], providers = {}, records = {}, receipts = new Map();
  let retainedClaim;
  const apis = Object.fromEntries(['runtime', 'harness', 'ontology'].map(owner => {
    const ref = owner === 'runtime' ? null : reference(owner);
    if (ref) records[owner] = { model: { id: ref.id, version: ref.version, specVersion: 'v1' }, scope: owner === 'ontology' ? shared : scope, delivery: { digest: ref.digest }, ...(owner === 'harness' ? { resolution: { dependencies: [reference('ontology')] } } : {}) };
    return [owner, {
      PRODUCT: owner, VERSION: '0.8.1', verifyDelivery: delivery => ({ valid: delivery.digest === ref.digest }),
      validateInstances: () => ({ valid: true, status: 'PASS' }),
      ['create' + owner[0].toUpperCase() + owner.slice(1) + 'Service']: (received, supplied) => {
        if (owner === 'ontology') validateProviderContract(supplied);
        assert.deepEqual(received, options); providers[owner] = supplied;
        return {
          capabilities: () => ({ authority: false }),
          initialize: () => events.push([owner, 'initialize']),
          close: () => events.push([owner, 'close']),
          execute: envelope => {
            events.push([owner, envelope]);
            if (envelope.operation === 'fail') throw Object.assign(new Error('exact'), { code: 'REVISION_CONFLICT' });
            if (envelope.operation === 'asset.inspect') {
              if (JSON.stringify(envelope.scope) !== JSON.stringify(records[owner].scope)) throw Object.assign(new Error('missing'), { code: 'NOT_FOUND' });
              return structuredClone(records[owner]);
            }
            if (envelope.operation === 'run.inspect') return { claim: retainedClaim };
            if (envelope.operation === 'workspace.inspect') return { revision: 7 };
            if (envelope.operation === 'evaluation.inspect') {
              if (!receipts.has(envelope.input.requestId)) throw Object.assign(new Error('missing'), { code: 'NOT_FOUND' });
              return receipts.get(envelope.input.requestId);
            }
            if (envelope.operation === 'asset.evaluate') {
              const { operation, scope, input, requestId } = envelope;
              const receipt = { operation, scope, requestId, requestDigest: sha256({ operation, scope, input }), result: { report: { reference: reference('harness'), status: 'PASS' } } };
              receipts.set(requestId, receipt); return receipt;
            }
            return envelope;
          },
          dispatch: async args => { events.push([owner, 'dispatch', args]); return args; },
          reconcile: async args => { events.push([owner, 'reconcile', args]); return args; },
        };
      },
    }];
  }));
  return { apis, events, providers, records, receipts, setClaim: claim => { retainedClaim = claim; } };
}

test('interface only: pure import under read-only permissions and construction/discovery never initialize', () => {
  const result = spawnSync(process.execPath, ['--permission', '--allow-fs-read=' + new URL('../..', import.meta.url).pathname, '--input-type=module', '-e', "await import('./dist/integration/composition.js')"], { encoding: 'utf8', env: { ...process.env, OPENSSL_CONF: '/dev/null' } });
  assert.equal(result.status, 0, result.stderr);
  const f = fixture(), composition = createComposition(options, f.apis);
  assert.deepEqual(f.events, []);
  assert.equal(composition.capabilities().authority, false);
  assert.deepEqual(f.events, []);
  composition.close();
});

test('interface only: exact owner forwarding, lazy initialization, errors and async routing', async () => {
  const f = fixture(), c = createComposition(options, f.apis);
  const envelope = { operation: 'asset.decide', scope, input: { decision: 'REJECT' }, requestId: 'explicit', expectedRevision: 3 };
  assert.equal(c.request('ontology', envelope), envelope);
  assert.deepEqual(f.events, [['ontology', 'initialize'], ['ontology', envelope]]);
  assert.throws(() => c.request('ontology', { operation: 'fail' }), { code: 'REVISION_CONFLICT' });
  assert.throws(() => c.request('foreign', envelope), { code: 'UNKNOWN_PRODUCT' });
  const args = { scope, id: 'run', requestId: 'caller', expectedRevision: 8 };
  assert.equal(await c.dispatch(args), args);
  assert.equal(await c.reconcile(args), args);
  assert.equal(f.events.filter(([owner, operation]) => owner === 'runtime' && operation === 'initialize').length, 1);
  assert(!f.events.some(([owner]) => owner === 'harness'));
  c.close(); c.close();
  assert.throws(() => c.inspect('ontology', scope), { code: 'CLOSED' });
});

test('interface only: wrong product versions and identities fail before construction', () => {
  for (const owner of ['runtime', 'harness', 'ontology']) for (const field of ['VERSION', 'PRODUCT']) {
    const f = fixture(); f.apis[owner][field] = 'wrong';
    assert.throws(() => createComposition(options, f.apis), { code: 'PRODUCT_IDENTITY' });
    assert.deepEqual(f.events, []);
  }
});

test('interface only: trusted providers are copied and classification forwards exactly once to its owner', async () => {
  const f = fixture(), calls = [], factory = f.apis.ontology.createOntologyService;
  const resolveClassificationSource = () => 'source', classificationModel = { providerId: 'provider', modelId: 'model', revision: 'r1', timeoutMs: 1000 }, classificationAdvisor = () => 'advisor', resolveLegacyHarness = () => 'harness';
  const supplied = { resolveClassificationSource, classificationModel, classificationAdvisor, resolveLegacyHarness };
  const before = { env: { ...process.env }, cwd: process.cwd(), globals: Reflect.ownKeys(globalThis) };
  f.apis.ontology.createOntologyService = (options, providers) => ({ ...factory(options, providers),
    async classify(envelope) { calls.push(envelope); return envelope; },
  });
  const c = createComposition(options, f.apis, supplied);
  supplied.resolveClassificationSource = () => 'changed';
  try {
    const capabilities = c.capabilities();
    const {readFeedback,resolveFeedbackMaterial,...classificationProviders}=f.providers.ontology;
    assert.equal(typeof readFeedback,'function');assert.equal(typeof resolveFeedbackMaterial,'function');
    assert.deepEqual(classificationProviders, { resolveClassificationSource, classificationModel, classificationAdvisor, resolveLegacyHarness });
    assert.notEqual(f.providers.ontology, supplied);
    assert(Object.isFrozen(f.providers.ontology));
    assert.deepEqual(capabilities.ontologyProviders, Object.fromEntries(Object.keys(supplied).map(k => [k, 'CONFIGURED'])));
    assert.equal(capabilities.authority, false);
    assert.deepEqual(f.events, [], 'Provider discovery must not initialize owners');
    for (const operation of ['classification.start', 'classification.reanalyze']) {
      const envelope = { operation, scope, input: { id: 'session' }, requestId: operation.replace('.', '-'), expectedRevision: 7 };
      const result = c.request('ontology', envelope);
      assert(result instanceof Promise);
      assert.equal(await result, envelope);
      assert.equal(calls.at(-1), envelope);
      assert.equal(f.events.filter(([, e]) => e === envelope).length, 0);
    }
    assert.equal(calls.length, 2);
    const read = { operation: 'classification.inspect', scope, input: { id: 'session' } };
    assert.equal(c.request('ontology', read), read, 'Other operations remain synchronous');
    assert.equal(c.request('harness', { operation: 'classification.start' }).operation, 'classification.start');
    assert.equal(calls.length, 2);
    assert.deepEqual({ env: { ...process.env }, cwd: process.cwd(), globals: Reflect.ownKeys(globalThis) }, before);
  } finally { c.close(); }
});

test('interface only: unconfigured classification preserves owner failure without retries or defaults', async () => {
  const f = fixture(), factory = f.apis.ontology.createOntologyService;
  const unavailable = Object.assign(new Error('Owner provider unavailable'), { code: 'PROVIDER_UNAVAILABLE' });
  let count = 0;
  f.apis.ontology.createOntologyService = (options, providers) => {
    assert.deepEqual(Object.keys(providers).sort(), ['readFeedback','resolveFeedbackMaterial']);
    assert(Object.values(providers).every(value=>typeof value==='function'));
    return { ...factory(options, providers), async classify() { count++; throw unavailable; } };
  };
  const c = createComposition(options, f.apis);
  try {
    assert(Object.values(c.capabilities().ontologyProviders).every(v => v === 'UNCONFIGURED'));
    await assert.rejects(c.request('ontology', { operation: 'classification.start', scope, input: {}, requestId: 'exact', expectedRevision: 1 }), e => e === unavailable);
    assert.equal(count, 1);
    assert.deepEqual(f.events, [['ontology', 'initialize']]);
  } finally { c.close(); }
});

test('interface only: getters, proxies and user provider configuration fail without invoking code or owners', () => {
  let touched = 0;
  const getter = Object.defineProperty({}, 'source', { enumerable: true, get() { touched++; throw Error('getter'); } });
  const proxy = new Proxy({}, { getPrototypeOf() { touched++; throw Error('proxy'); }, ownKeys() { touched++; throw Error('proxy'); }, get() { touched++; throw Error('proxy'); } });
  const callback = new Proxy(() => {}, { apply() { touched++; } });
  for (const providers of [getter, proxy, { source: proxy }, { advisor: callback }, { source: getter }]) {
    const f = fixture();
    assert.throws(() => createComposition(options, f.apis, providers), { code: 'INVALID_INPUT' });
    assert.deepEqual(f.events, []);
  }
  const f = fixture();
  for (const config of [proxy, getter, { ...options, providers: {} }, { ...options, trustedOntologyProviders: {} }])
    assert.throws(() => createComposition(config, f.apis));
  const c = createComposition(options, f.apis);
  try {
    for (const envelope of [proxy, getter, { operation: 'classification.start', input: proxy },
      { operation: 'classification.start', providers: {} }, { operation: 'classification.start', trustedOntologyProviders: {} },
      { operation: 'classification.start', input: { callback() {} } }]) assert.throws(() => c.request('ontology', envelope));
    assert.equal(touched, 0);
    assert.deepEqual(f.events, []);
  } finally { c.close(); }
});

test('interface only: provider contract validation remains with the owning factory before initialization', () => {
  const f = fixture(), invalid = Object.assign(new Error('Invalid provider contract'), { code: 'INVALID_PROVIDER' });
  f.apis.ontology.createOntologyService = (options, providers) => { assert.equal(providers.resolveClassificationSource, 'module-path'); throw invalid; };
  const c = createComposition(options, f.apis, { resolveClassificationSource: 'module-path' });
  try { assert.throws(() => c.capabilities(), e => e === invalid); assert.deepEqual(f.events, []); }
  finally { c.close(); }
});

test('interface only: public shared resolution verifies own delivery, exact scope, all pins and full resolution digest', () => {
  const f = fixture(), c = createComposition(options, f.apis); c.capabilities();
  const workspace = { schema: 'evopilot-workspace/v1', id: options.workspaceId, canonicalRoot: options.workspaceRoot, ownerUid: 1 };
  const request = { reference: reference('ontology'), scope, workspace };
  const resolved = f.providers.runtime.resolveOntology(request);
  assert.deepEqual(resolved, { reference: request.reference, workspace, scope: shared, published: true, materialDigest: sha256({ delivery: f.records.ontology.delivery }), descriptor: { kind: 'ontology-composition/v1', digest: sha256({ delivery: f.records.ontology.delivery }) } });
  assert.deepEqual(f.providers.harness.resolveOntology({ reference: request.reference, workspaceId: options.workspaceId, scope }), { reference: request.reference, published: true, workspaceId: options.workspaceId, projectId: 'shared' });
  const h = f.providers.runtime.resolveHarness({ ...request, reference: reference('harness') });
  assert.equal(h.materialDigest, sha256({ delivery: f.records.harness.delivery, resolution: f.records.harness.resolution }));
  assert.throws(() => f.providers.runtime.resolveHarness({ ...request, scope: shared, reference: reference('harness') }));
  assert.throws(() => f.providers.harness.resolveOntology({ reference: request.reference, workspaceId: 'foreign', scope }), { code: 'MATERIAL_SCOPE' });
  for (const field of ['id', 'version', 'digest', 'specVersion', 'product', 'visibility']) {
    assert.throws(() => f.providers.runtime.resolveOntology({ ...request, reference: { ...request.reference, [field]: 'wrong' } }));
  }
  f.records.ontology.delivery = null;
  assert.throws(() => f.providers.runtime.resolveOntology(request), { code: 'MATERIAL_UNAVAILABLE' });
  c.close();
});

test('interface only: receipt readback reconstructs dual outcome without replay and rejects altered correlation', () => {
  const f = fixture(); f.apis.ontology.validateInstances = () => ({ valid: false, status: 'FAIL' });
  const c = createComposition(options, f.apis); c.capabilities();
  const input = { ontologyInstance: { entities: [], relations: [] }, harness: { evidence: {}, configuration: {} } };
  const claim = { id: 'run', claimId: 'sha256:' + 'c'.repeat(64), scope, pins: { ontology: reference('ontology'), harness: reference('harness') }, input, inputDigest: sha256(input) };
  f.setClaim(claim);
  const executed = f.providers.runtime.execute(invoke(claim));
  assert.equal(executed.status, 'SUCCEEDED'); assert.equal(executed.result.evaluation, 'FAIL');
  c.close();
  const reopened = createComposition(options, f.apis); reopened.capabilities();
  assert.deepEqual(f.providers.runtime.inspectReceipt(invoke(claim)), executed);
  assert.equal(f.events.filter(([, e]) => e?.operation === 'asset.evaluate').length, 1);
  assert.throws(() => f.providers.runtime.inspectReceipt(invoke({ ...claim, inputDigest: 'changed' })), { code: 'CLAIM_MISMATCH' });
  f.receipts.get(executed.providerReceiptId).requestDigest = 'changed';
  assert.throws(() => f.providers.runtime.inspectReceipt(invoke(claim)), { code: 'RECEIPT_MISMATCH' });
  reopened.close();
});

test('interface only: dual result priority retains failure, technical error, missing evidence and N/A', () => {
  const business = status => ({ status, valid: status === 'PASS' });
  assert.equal(aggregateEvaluation(business('FAIL'), { status: 'PASS' }), 'FAIL');
  assert.equal(aggregateEvaluation(business('FAIL'), { status: 'ERROR' }), 'ERROR');
  assert.equal(aggregateEvaluation(business('PASS'), undefined), 'INDETERMINATE');
  assert.equal(aggregateEvaluation(undefined, { status: 'PASS' }), 'INDETERMINATE');
  assert.equal(aggregateEvaluation(business('INDETERMINATE'), { status: 'PASS' }), 'INDETERMINATE');
  assert.equal(aggregateEvaluation(business('ERROR'), { status: 'PASS' }), 'ERROR');
  assert.equal(aggregateEvaluation(business('PASS'), { status: 'N/A' }), 'N/A');
  assert.equal(aggregateEvaluation(business('PASS'), { status: 'PASS' }), 'PASS');
});

test('interface only: native signals stay outside immutable claims and receipts on both callback paths', () => {
  const f = fixture(), c = createComposition(options, f.apis); c.capabilities();
  const input = { ontologyInstance: { entities: [], relations: [] }, harness: { evidence: {}, configuration: {} } };
  const claim = frozenClone({ id: 'run', claimId: 'sha256:' + 'c'.repeat(64), scope,
    pins: { ontology: reference('ontology'), harness: reference('harness') }, input, inputDigest: sha256(input) });
  f.setClaim(claim);
  try {
    const context = invoke(claim), before = JSON.stringify(claim);
    assert.throws(() => sha256(context), /Expected plain object/);
    const result = f.providers.runtime.execute(context);
    assert.deepEqual(f.providers.runtime.inspectReceipt(invoke(claim)), result);
    assert.equal(JSON.stringify(claim), before);
    assert.equal(context.signal instanceof AbortSignal, true);
    assert.equal(JSON.stringify(result).includes('signal'), false);
    for (const callback of ['execute', 'inspectReceipt']) {
      const fn = f.providers.runtime[callback];
      for (const changed of [
        { ...claim, extra: true }, { ...claim, id: 'other' }, { ...claim, claimId: 'changed' },
        { ...claim, scope: shared }, { ...claim, inputDigest: 'changed' },
        { ...claim, input: { ...input, extra: true } },
        { ...claim, pins: { ...claim.pins, harness: { ...claim.pins.harness, digest: 'sha256:' + 'b'.repeat(64) } } },
        Object.fromEntries(Object.entries(claim).filter(([key]) => key !== 'inputDigest')),
      ]) assert.throws(() => fn(invoke(changed)), { code: 'CLAIM_MISMATCH' });
      for (const signal of [undefined, {}, { aborted: false }])
        assert.throws(() => fn(Object.freeze({ ...claim, signal })), { code: 'CLAIM_CONTEXT' });
      assert.throws(() => fn(Object.freeze({ ...claim, signal: new AbortController().signal, [Symbol('extra')]: true })), { code: 'CLAIM_CONTEXT' });
      const accessor = Object.freeze(Object.defineProperty({ ...claim }, 'signal', { enumerable: true, get() { throw Error('must not invoke'); } }));
      assert.throws(() => fn(accessor), { code: 'CLAIM_CONTEXT' });
      const controller = new AbortController(); controller.abort();
      const events = f.events.length;
      assert.throws(() => fn(invoke(claim, controller.signal)), { code: 'ABORTED' });
      assert.equal(f.events.length, events, 'Pre-abort must not initialize or query/mutate owners');
    }
    assert.equal(f.events.filter(([, e]) => e?.operation === 'asset.evaluate').length, 1);
  } finally { c.close(); }
});

test('interface only: cancellation during revision query prevents Harness dispatch', () => {
  const f = fixture(), controller = new AbortController();
  const factory = f.apis.harness.createHarnessService;
  f.apis.harness.createHarnessService = (...args) => {
    const service = factory(...args);
    return { ...service, execute(envelope) {
      const result = service.execute(envelope);
      if (envelope.operation === 'workspace.inspect') controller.abort();
      return result;
    } };
  };
  const c = createComposition(options, f.apis); c.capabilities();
  const input = { ontologyInstance: {}, harness: { evidence: {}, configuration: {} } };
  const claim = { id: 'run', claimId: 'test', scope, pins: { ontology: reference('ontology'), harness: reference('harness') }, input, inputDigest: sha256(input) };
  f.setClaim(claim);
  try {
    assert.throws(() => f.providers.runtime.execute(invoke(claim, controller.signal)), { code: 'ABORTED' });
    assert.equal(f.events.filter(([, e]) => e?.operation === 'asset.evaluate').length, 0);
  } finally { c.close(); }
});

const metadataFixtures = {
  "runtime": {
    "name": "@evopilot-next/runtime",
    "version": "0.8.1",
    "private": true,
    "type": "module",
    "engines": {
      "node": ">=24.14.0"
    },
    "files": [
      "dist",
      "src",
      "vendor",
      "README.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "CHANGELOG.md",
      "docs",
      "LICENSE",
      "NOTICE",
      "provenance"
    ],
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      },
      "./service": {
        "types": "./dist/service.d.ts",
        "import": "./dist/service.js"
      }
    },
    "scripts": {
      "build": "node scripts/build.mjs",
      "check": "node scripts/check.mjs",
      "test": "node --test tests/e2e/*.test.mjs"
    },
    "license": "Apache-2.0",
    "bin": {
      "evopilot-next-runtime": "dist/cli.js"
    },
    "devDependencies": {
      "typescript": "5.9.3",
      "@types/node": "24.19.2"
    }
  },
  "harness": {
    "name": "@evopilot-next/harness",
    "version": "0.8.1",
    "private": true,
    "bin": {
      "evopilot-next-harness": "dist/cli.js"
    },
    "type": "module",
    "engines": {
      "node": ">=24.14.0"
    },
    "files": [
      "dist",
      "src",
      "vendor",
      "README.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "CHANGELOG.md",
      "specifications",
      "examples",
      "assets",
      "docs",
      "provenance",
      "LICENSE",
      "NOTICE"
    ],
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      },
      "./sources": {
        "types": "./dist/asset-sources.d.ts",
        "import": "./dist/asset-sources.js"
      },
      "./service": {
        "types": "./dist/service.d.ts",
        "import": "./dist/service.js"
      }
    },
    "scripts": {
      "build": "node scripts/build.mjs",
      "check": "node scripts/check.mjs",
      "test": "node --test tests/e2e/*.test.mjs"
    },
    "dependencies": {
      "yaml": "2.9.0"
    },
    "license": "Apache-2.0",
    "devDependencies": {
      "typescript": "5.9.3",
      "@types/node": "24.19.2",
      "ajv": "8.20.0"
    }
  },
  "ontology": {
    "name": "@evopilot-next/ontology",
    "version": "0.8.1",
    "private": true,
    "type": "module",
    "engines": {
      "node": ">=24.14.0"
    },
    "files": [
      "dist",
      "src",
      "vendor",
      "README.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "CHANGELOG.md",
      "specifications",
      "examples",
      "schemas",
      "docs",
      "provenance",
      "LICENSE",
      "NOTICE",
      "assets"
    ],
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      },
      "./compat": {
        "types": "./dist/compat/index.d.mts",
        "import": "./dist/compat/index.mjs"
      },
      "./migration": {
        "types": "./dist/migration.d.ts",
        "import": "./dist/migration.js"
      },
      "./sources": {
        "types": "./dist/asset-sources.d.ts",
        "import": "./dist/asset-sources.js"
      },
      "./service": {
        "types": "./dist/service.d.ts",
        "import": "./dist/service.js"
      }
    },
    "scripts": {
      "build": "node scripts/build.mjs",
      "check": "tsc --noEmit && node scripts/check.mjs",
      "test": "node --test tests/e2e/*.test.mjs"
    },
    "dependencies": {
      "ajv": "8.20.0",
      "yaml": "2.9.0"
    },
    "license": "Apache-2.0",
    "bin": {
      "evopilot-next-ontology": "dist/cli.js"
    },
    "devDependencies": {
      "typescript": "5.9.3",
      "@types/node": "24.19.2"
    }
  }
};

test('Current metadata: all compiled product bins are required', () => {
  for (const owner of ['runtime', 'harness', 'ontology']) {
    const pkg = structuredClone(metadataFixtures[owner]);
    if (owner === 'harness') pkg.exports['./native'] = {types:'./dist/native.d.ts',import:'./dist/native.js'};
    pkg.exports['./workspace-migration'] = {types:'./dist/workspace-migration.d.ts',import:'./dist/workspace-migration.js'};
    if(owner !== 'ontology') pkg.exports['./online'] = {types:'./dist/online.d.ts',import:'./dist/online.js'};
    pkg.bin = { ['evopilot-next-' + owner]: 'dist/cli.js' };
    assert.equal(validateProductMetadata(pkg, owner).cli, 'PRESENT');
    assert.equal(validateProductMetadata(pkg, owner, 'M4').cli, 'PRESENT');
    const absent = { ...pkg }; delete absent.bin;
    assert.throws(() => validateProductMetadata(absent, owner));
    assert.throws(() => validateProductMetadata(absent, owner, 'M4'));
    for (const bin of [{ foreign: 'dist/cli.js' }, { ['evopilot-next-' + owner]: 'src/service.mjs' }])
      assert.throws(() => validateProductMetadata({ ...pkg, bin }, owner));
  }
});
