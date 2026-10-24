import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { isBuiltin } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CONTRACT_REVISION, inspectReference } from '../compatibility/v1/reference.mjs';
import { validateReference as validateM0Reference } from '../../m0/shared-contract/index.mjs';
import { checkPackages } from '../../scripts/check.mjs';
import { ROOT, CHILDREN, syncContract } from '../../scripts/sync-contract.mjs';

// Only line-anchored static declarations: a model field named "from" is data.
const staticSpecifiers = source => [...source.matchAll(/^[\t ]*(?:import\s+(?:type\s+)?(?:(?:[\w$]+(?:\s*,\s*)?)?(?:\{[^}]*\}|\*\s+as\s+[\w$]+)?\s*from\s*)?|export\s+(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?)\s+from\s*)['"]([^'"]+)['"]/gm)].map(match => match[1]);

test('static import scanner distinguishes declarations from data', () => {
  assert.deepEqual(staticSpecifiers("const rows = ['from', ', '];\nimport './side.mjs';\nimport { x } from './own.mjs';\nexport { x } from './export.mjs';\nimport fs from 'node:fs';"), ['./side.mjs', './own.mjs', './export.mjs', 'node:fs']);
});

test('public inventory partitions 105 original sources between independent owners', async () => {
  const inventories = await Promise.all(['harness', 'ontology'].map(async owner => {
    const { listPublicSources } = await import(pathToFileURL(resolve(ROOT, 'projects/evopilot-' + owner, 'dist/asset-sources.js')).href);
    return listPublicSources();
  }));
  assert.deepEqual(inventories.map(list => list.count), [101, 4]);
  const paths = inventories.flatMap(list => list.sources.map(source => source.sourcePath));
  assert.equal(paths.length, 105);
  assert.equal(new Set(paths).size, 105);
  assert(inventories[1].sources.every(source => source.classification === 'ontology-pack'));
  assert(inventories[0].sources.every(source => source.classification !== 'ontology-pack'));
});

test('parent and independent package identities and pinned canonical bytes', checkPackages);

test('generated vendor bytes match both canonical pins', async () => {
  await syncContract({ check: true });
});

test('child source graph contains only own source and vendor modules', async () => {
  for (const child of CHILDREN) {
    const srcRoot = resolve(ROOT, child, 'src');
    for (const name of await readdir(srcRoot, { recursive: true })) {
      if (!/\.(?:ts|mts|mjs)$/.test(name)) continue;
      const file = resolve(srcRoot, name);
      const source = await readFile(file, 'utf8');
      const imports = staticSpecifiers(source);
      for (const specifier of imports) {
        if (isBuiltin(specifier)) continue;
        const sites = {
          'projects/evopilot-harness': { 'asset-sources.ts': ['yaml'], 'import-operations.ts': ['yaml'] },
          'projects/evopilot-ontology': {
            'asset-sources.ts': ['yaml'], 'import-operations.ts': ['yaml'],
            'compat/v4/classification/taxonomy.mjs': ['yaml', 'ajv/dist/2020.js'],
            'compat/v4/semantics/catalog-supply.mjs': ['yaml'],
            'compat/v3/schema.mjs': ['ajv/dist/2020.js'], 'compat/v3/utils.mjs': ['yaml'],
          },
        };
        if (sites[child]?.[name.split(sep).join('/')]?.includes(specifier)) {
          const pkg = JSON.parse(await readFile(resolve(ROOT, child, 'package.json'), 'utf8'));
          assert(Object.hasOwn(pkg.dependencies ?? {}, specifier.split('/')[0]), 'Own declared dependency required');
          continue;
        }
        assert(specifier.startsWith('.'), `External product import: ${specifier}`);
        const target = resolve(dirname(file), specifier);
        assert(target.startsWith(srcRoot + sep) || ['contract.mjs','authoring.mjs','assessment.mjs','execution.mjs','oracle.mjs'].some(name=>target===resolve(ROOT,child,'vendor/usability/v1',name)) || ['readability.mjs','presentation.mjs'].some(name=>target===resolve(ROOT,child,'vendor/readability/v1',name)) || ['reference.mjs','native.mjs','decision-evidence.mjs'].some(name => target === resolve(ROOT, child, 'vendor/compatibility/v1', name)) || target===resolve(ROOT,child,'vendor/compatibility/online/v1/online.mjs') || target===resolve(ROOT,child,'vendor/compatibility/response/v1/response.mjs') || ['feedback.mjs','owner.mjs'].some(name=>target===resolve(ROOT,child,'vendor/compatibility/feedback/v1',name)), `Cross-package import: ${specifier}`);
      }
      assert.doesNotMatch(source, /EVOPILOT_HARNESS_HOME|defaultHarnessHome|\.evopilot-harness|\bprocess\s*(?:\.\s*(?:env|cwd|chdir)|\[)|\bglobalThis\s*(?:\.|\[)|\/Users\/|\/home\//);
      const localName = name.split(sep).join('/');
      let checked = source;
      if (['state.ts','location-lineage.ts','native.ts','online-prometheus.ts'].includes(localName)) checked = checked.replace(/\bprocess\.getuid(?![\w$])/g, '');
      if (['native-evaluation.ts','native/validator.ts'].includes(localName)) checked = checked.replace(/\bprocess\.(?:platform|arch)(?![\w$])/g, '');
      if (localName === 'cli.ts') checked = checked.replace(/\bprocess\.(?:stdin|stdout|argv|exitCode)(?![\w$])/g, '');
      if (child === 'projects/evopilot-ontology' && localName === 'compat/v4/semantics/catalog-store.mjs')
        checked = checked.replace(/\bprocess\.pid(?![\w$])/g, '').replace(/\bprocess\.kill\(owner\.pid, 0\)/g, '');
      assert.doesNotMatch(checked, /\bprocess\s*(?:\.|\[|\()/);
      assert.doesNotMatch(source, /\bimport\s*\(|\brequire\s*\(|\bm0\b|\bPROBE\b|\beval\s*\(/);
    }
    const vendor = await readFile(resolve(ROOT, child, 'vendor/compatibility/v1/reference.mjs'), 'utf8');
    const imports = staticSpecifiers(vendor);
    for (const specifier of imports) assert(isBuiltin(specifier));
    assert.doesNotMatch(vendor, /\bimport\s*\(|\brequire\s*\(|\bPROBE\b|\bm0\//);
  }
});

test('actual child imports work with parent reads denied by Node permissions', () => {
  for (const child of CHILDREN) {
    const childRoot = resolve(ROOT, child);
    const source = `
      import assert from 'node:assert/strict';
      const api = await import(${JSON.stringify(pathToFileURL(resolve(childRoot, 'dist/index.js')).href)});
      assert.equal(api.capabilities().businessOperationsReady, true);
      assert.equal(api.capabilities().authority, false);
      const serviceAPI = await import('@evopilot-next/' + api.PRODUCT + '/service');
      const factory = serviceAPI['create' + api.PRODUCT[0].toUpperCase() + api.PRODUCT.slice(1) + 'Service'];
      const service = factory({ workspaceRoot: '/uninitialized-package-discovery', workspaceId: 'discovery' });
      assert.equal(service.capabilities().authority, false);
      service.close();
      if (['harness', 'ontology'].includes(api.PRODUCT)) {
        const sources = await import('@evopilot-next/' + api.PRODUCT + '/sources');
        assert.deepEqual(Object.keys(sources).sort(), ['listPublicSources', 'readPublicSource']);
        const list = sources.listPublicSources();
        assert.equal(list.count, api.PRODUCT === 'harness' ? 101 : 4);
        const report = sources.readPublicSource(list.sources[0].sourcePath);
        assert.equal(report.status, 'PRESERVED_SOURCE');
        assert.equal(report.authority, false);
        assert(Object.isFrozen(report.document));
        assert.throws(() => sources.readPublicSource('../foreign.yaml'));
      }
      await assert.rejects((await import('node:fs/promises')).readFile(${JSON.stringify(resolve(ROOT, "integration/compatibility/v1/reference.mjs"))}), { code: 'ERR_ACCESS_DENIED' });
      if (api.PRODUCT === 'ontology') {
        const compat = await import('./dist/compat/index.mjs');
        const migration = await import('@evopilot-next/ontology/migration');
        assert.deepEqual(Object.keys(migration).sort(), ['deriveLegacyModel', 'inspectLegacySource']);
        const inspected = migration.inspectLegacySource(compat.grounding.resolveOntologyFoundation(), {sourceLocator: 'synthetic://isolated', sourceRevision: 'r1', sourceVisibility: 'public'});
        assert.equal(inspected.valid, true);
        assert.equal(inspected.authority, false);
        assert.deepEqual(Object.keys(compat).sort(), ["catalogBudget","catalogContract","catalogGeneration","catalogMaterials","catalogStore","catalogSupply","classification","classificationAdvisor","classificationEvaluation","classifier","grounding","interoperability","packs","projectOntology","sourceConcept","sourceDescriptor","taxonomy","validation"]);
        assert.equal(compat.validation.validateDocument(compat.grounding.resolveOntologyFoundation()).valid, true);
        assert.equal(compat.interoperability.createOntologyReasoningProfile({id: 'isolated', version: '1.0.0'}).kind, 'OntologyReasoningProfile');
      }
      const ref = product => ({ product, id: 'boundary', version: '0.1.0', specVersion: 'v1', digest: 'sha256:' + 'a'.repeat(64), visibility: 'private' });
      const result = api.PRODUCT === 'runtime'
        ? api.inspectPinnedInputs({ ontology: ref('ontology'), observedOntology: ref('ontology'), harness: ref('harness'), observedHarness: ref('harness') })
        : (api.inspectOntologyReference ?? api.inspectArtifactReference)(ref('ontology'), ref('ontology'));
      assert(Object.isFrozen(result));
      assert.equal(result.authority, false);
      for (const name of ['PRODUCT', 'VERSION', 'capabilities']) assert(Object.hasOwn(api, name));
      if (api.PRODUCT !== 'runtime') {
        const envelope = { product: api.PRODUCT, id: 'boundary', version: '0.1.0', specVersion: 'v1', visibility: 'private', dependencies: [], extensions: [],
          provenance: { direction: 'forward', sources: [{ id: 'source', kind: 'synthetic', locator: 'synthetic:boundary', revision: 'r1', digest: 'sha256:' + 'a'.repeat(64), status: 'synthetic' }] } };
        const mapping = { id: 'map', targetRef: 'concept', sourceRef: 'source', sourceLocator: 'synthetic:boundary', sourceRevision: 'r1', status: 'synthetic' };
        const asset = api.PRODUCT === 'harness'
          ? { ...envelope, kind: 'HarnessComponent', applicability: { enabled: true, domains: ['synthetic'] },
              objectives: [{ id: 'objective', description: 'Evaluate synthetic boundary evidence' }], preconditions: [], inputs: [], parameters: [],
              deliverables: [{ id: 'report', description: 'Synthetic boundary evaluation report' }], rules: [],
              sourceMappings: [{ ...mapping, id: 'mapping-objective', targetRef: 'objective' }, { ...mapping, id: 'mapping-report', targetRef: 'report' }] }
          : { ...envelope, concepts: [{ id: 'concept', label: 'Concept', definition: 'Synthetic definition' }], properties: [], relations: [], constraints: [], sourceMappings: [mapping], unresolvedIssues: [] };
        const validator = api.validateHarness ?? api.validateOntology;
        assert.equal(validator(asset).valid, true);
        const delivery = api.buildDelivery(asset);
        assert.equal(api.verifyDelivery(delivery).valid, true);
        assert.equal(delivery.manifest.product, api.PRODUCT);
        assert(Object.isFrozen(delivery));
        if (api.PRODUCT === 'harness') {
          assert.equal(api.evaluateHarness(asset, { id: 'evidence', version: '0.1.0', source: { locator: 'synthetic:evidence', revision: 'r1', digest: 'sha256:' + 'b'.repeat(64) }, values: {} }).status, 'INDETERMINATE');
          assert.equal(api.evaluateHarness(asset, {}).status, 'ERROR');
        } else assert.equal(api.validateInstances(asset, { entities: [], relations: [] }).valid, true);
        assert.deepEqual(Object.keys(api).sort(), ['PRODUCT', 'VERSION', 'capabilities', 'buildDelivery', 'verifyDelivery', ...(api.PRODUCT === 'harness' ? ['inspectOntologyReference', 'validateHarness', 'evaluateHarness', 'createHarnessSemanticRequirements', 'evaluateSemanticCompatibility', 'inspectHarnessPackage', 'inspectHarnessStandard', 'validateNativeHarness', 'ASSESSMENT_STATES', 'BEHAVIOR_FACETS', 'USABILITY_LEVELS', 'USABILITY_LIMITS', 'USABILITY_STANDARD_DIGEST', 'preflightUsability', 'behaviorOracleDigest', 'validateBehaviorOracle', 'compareBehavior', 'validateReconstructionObservation', 'semanticCriteria', 'semanticReportDigest', 'validateSemanticReport', 'usabilityBytesDigest', 'usabilityDigest', 'validateUsabilityInventory', 'validateUsabilitySpecification'] : ['inspectArtifactReference', 'validateOntology', 'validateInstances', 'inspectOntologyStandard', 'validateOntologyPackage', 'validateNativeOntology', 'verifyOntologyToolchain'])].sort());
      }
    `;
    const result = spawnSync(process.execPath, ['--permission', `--allow-fs-read=${childRoot}`, '--input-type=module', '-e', source], {
      cwd: childRoot, encoding: 'utf8', timeout: 10000, env: { ...process.env, OPENSSL_CONF: '/dev/null' },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  }
});

test('immutable references cross independent copies without authority', async () => {
  const [runtime, harness, ontology] = await Promise.all(CHILDREN.map(child => import(pathToFileURL(resolve(ROOT, child, 'dist/index.js')).href)));
  const original = Object.freeze({ product: 'ontology', id: 'cross-child', version: '0.1.0', specVersion: 'v1', digest: 'sha256:' + 'a'.repeat(64), visibility: 'private' });
  const inspected = ontology.inspectArtifactReference(original, original);
  const consumed = harness.inspectOntologyReference(inspected.reference, original);
  const harnessRef = Object.freeze({ ...original, product: 'harness' });
  const result = runtime.inspectPinnedInputs({ ontology: consumed.reference, observedOntology: original, harness: harnessRef, observedHarness: harnessRef });
  assert.deepEqual(result.ontology.reference, original);
  assert(Object.isFrozen(result.ontology.reference));
  assert.equal(result.authority, false);
  assert.throws(() => harness.inspectOntologyReference(original, { ...original, digest: 'sha256:' + 'b'.repeat(64) }));
});

test('canonical v1 wire derives from M0 independently of implementation revision', () => {

  assert.equal(CONTRACT_REVISION, '1.0.0');
  for (const product of ['ontology', 'harness']) {
    for (const visibility of ['public', 'private']) {
      const input = { product, id: 'm0-asset', version: '0.1.0', specVersion: 'v1', digest: 'sha256:' + 'a'.repeat(64), visibility };
      assert.equal(validateM0Reference(input).valid, true);
      const result = inspectReference(input, { ...input });
      assert.deepEqual(result.reference, input);
      assert.notEqual(result.reference, input);
      assert(Object.isFrozen(result.reference));
      assert(Object.isFrozen(result));
      assert.equal(result.exactMatch, true);
      assert.equal(result.authority, false);
      if (visibility === 'public') {
        assert.equal(inspectReference(input, { ...input }, { visibility: 'public' }).exactMatch, true);
      } else {
        assert.throws(() => inspectReference(input, { ...input }, { visibility: 'public' }), TypeError);
      }
      for (const patch of [{ specVersion: '1.0.0' }, { specVersion: 'v2' }, { product: 'runtime' }]) {
        const unsupported = { ...input, ...patch };
        assert.throws(() => inspectReference(unsupported, { ...unsupported }), TypeError);
      }
      for (const patch of [
        { product: product === 'ontology' ? 'harness' : 'ontology' },
        { version: '0.2.0' }, { digest: 'sha256:' + 'b'.repeat(64) },
      ]) assert.throws(() => inspectReference(input, { ...input, ...patch }), TypeError);
    }
  }
});
