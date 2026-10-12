// Isolated executable specification PROBE. No product acceptance or release authority.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { validateReference, assertReferenceBinding } from './shared-contract/index.mjs';

const TYPES = ['string', 'number', 'integer', 'boolean'];
const SOURCE_STATUSES = ['design-proposed', 'design-confirmed', 'source-observed', 'inferred', 'runtime-observed', 'human-reviewed', 'synthetic'];
const RESERVED = new Set(['override', 'basePatch', 'specVersion', 'product', 'version', 'visibility',
  'provenance', 'extensions', 'concepts', 'properties', 'relations', 'constraints',
  'sourceMappings', 'unresolvedIssues', 'applicability', 'objectives', 'inputs',
  'deliverables', 'rules', 'dependencies', '__proto__', 'constructor', 'prototype']);
const plain = x => x !== null && typeof x === 'object' &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const own = (x, k) => Object.hasOwn(x, k);
const string = x => typeof x === 'string' && x.trim().length > 0;
const clone = x => JSON.parse(JSON.stringify(x));

// Object keys are unordered; every array retains its semantic order.
function stable(x) {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  if (plain(x)) return `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${stable(x[k])}`).join(',')}}`;
  return JSON.stringify(x);
}
const digest = x => `sha256:${createHash('sha256').update(stable(x)).digest('hex')}`;
function freeze(x) {
  if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); }
  return x;
}
function jsonData(x, seen = new Set()) {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return true;
  if (typeof x === 'number') return Number.isFinite(x);
  if ((!Array.isArray(x) && !plain(x)) || seen.has(x)) return false;
  seen.add(x);
  const keys = Reflect.ownKeys(x).filter(k => !(Array.isArray(x) && k === 'length'));
  const ok = (!Array.isArray(x) || Object.keys(x).length === x.length) && keys.every(k => {
    const d = Object.getOwnPropertyDescriptor(x, k);
    return typeof k === 'string' && d.enumerable && own(d, 'value') && jsonData(d.value, seen);
  });
  seen.delete(x);
  return ok;
}

export function validateAsset(asset, { product, supportedExtensions = [] } = {}) {
  const errors = [];
  const error = (path, message) => errors.push({ path, message });
  if (!plain(asset) || !jsonData(asset)) return { valid: false, errors: [{ path: '$', message: 'Expected plain, finite, acyclic JSON data' }] };
  if (!Array.isArray(supportedExtensions) || !supportedExtensions.every(string)) {
    return { valid: false, errors: [{ path: '$options', message: 'supportedExtensions must be namespace@version strings' }] };
  }
  const fields = (obj, keys, path) => {
    if (!plain(obj)) { error(path, 'Expected object'); return false; }
    for (const key of keys) if (!own(obj, key)) error(`${path}.${key}`, 'Required field');
    return true;
  };
  const text = (x, path) => { if (!string(x)) error(path, 'Expected nonempty string'); };
  const array = (x, path) => { if (!Array.isArray(x)) { error(path, 'Expected array'); return []; } return x; };
  const ids = new Set();
  const rows = (x, path, required) => array(x, path).filter((row, i) => {
    const p = `${path}[${i}]`;
    if (!fields(row, ['id', ...required], p)) return false;
    text(row.id, `${p}.id`);
    if (ids.has(row.id)) error(`${p}.id`, 'Duplicate ID');
    ids.add(row.id);
    return true;
  });
  fields(asset, ['specVersion', 'product', 'id', 'version', 'visibility', 'provenance', 'extensions'], '$');
  if (asset.specVersion !== 'v1') error('specVersion', 'Only v1 supported');
  if (!['ontology', 'harness'].includes(asset.product) || (product !== undefined && product !== asset.product)) error('product', 'Product mismatch or unsupported product');
  text(asset.id, 'id'); ids.add(asset.id);
  if (typeof asset.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(asset.version)) error('version', 'Expected x.y.z version');
  if (!['public', 'private'].includes(asset.visibility)) error('visibility', 'Expected public or private');
  const provenance = plain(asset.provenance) ? asset.provenance : {};
  fields(asset.provenance, ['direction', 'sources'], 'provenance');
  if (!['forward', 'reverse'].includes(provenance.direction)) error('provenance.direction', 'Expected forward or reverse');
  const sources = rows(provenance.sources, 'provenance.sources', ['kind', 'digest', 'status', 'locator', 'revision']);
  if (!sources.length) error('provenance.sources', 'At least one source required');
  for (const s of sources) {
    text(s.kind, 'source.kind');
    text(s.locator, 'source.locator'); text(s.revision, 'source.revision');
    if (!SOURCE_STATUSES.includes(s.status)) error('source.status', 'Undeclared source status; status grants no approval');
    if (typeof s.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(s.digest)) error('source.digest', 'Expected SHA256');
  }
  const namespaces = new Set();
  function reserved(x, path) {
    if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) {
      if (RESERVED.has(k)) error(`${path}.${k}`, 'Reserved base override');
      reserved(v, `${path}.${k}`);
    }
  }
  for (const [i, ext] of array(asset.extensions, 'extensions').entries()) {
    const p = `extensions[${i}]`;
    if (!fields(ext, ['namespace', 'version', 'required', 'data'], p)) continue;
    if (Object.keys(ext).some(k => !['namespace', 'version', 'required', 'data'].includes(k))) error(p, 'Unknown extension envelope field');
    if (typeof ext.namespace !== 'string' || !/^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)+$/.test(ext.namespace)) error(p, 'Expected namespaced extension');
    if (namespaces.has(ext.namespace)) error(p, 'Duplicate extension namespace');
    namespaces.add(ext.namespace);
    if (typeof ext.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(ext.version)) error(p, 'Invalid extension version');
    if (typeof ext.required !== 'boolean' || !plain(ext.data)) error(p, 'Malformed extension');
    if (ext.required === true && !supportedExtensions.includes(`${ext.namespace}@${ext.version}`)) error(p, 'Unknown required extension');
    reserved(ext.data, `${p}.data`);
  }
  const ref = (value, targets, path) => { if (!targets.has(value)) error(path, 'Dangling reference'); };
  if (asset.product === 'ontology') {
    fields(asset, ['concepts', 'properties', 'relations', 'constraints', 'sourceMappings', 'unresolvedIssues'], '$');
    const concepts = rows(asset.concepts, 'concepts', ['label', 'definition']);
    if (!concepts.length) error('concepts', 'At least one concept required');
    concepts.forEach(c => { text(c.label, 'concept.label'); text(c.definition, 'concept.definition'); });
    const conceptIds = new Set(concepts.map(c => c.id));
    const properties = rows(asset.properties, 'properties', ['conceptRef', 'type']);
    properties.forEach(p => { ref(p.conceptRef, conceptIds, 'property.conceptRef'); if (!TYPES.includes(p.type)) error('property.type', 'Unsupported property type'); });
    rows(asset.relations, 'relations', ['from', 'to', 'directed']).forEach(r => {
      ref(r.from, conceptIds, 'relation.from'); ref(r.to, conceptIds, 'relation.to');
      if (r.directed !== true) error('relation.directed', 'Directed relation required');
    });
    properties.forEach(p => { if (own(p, 'required') && typeof p.required !== 'boolean') error('property.required', 'Expected boolean'); });
    // Minimal PROBE constraints; descriptive-range remains unsupported advisory text.
    rows(asset.constraints, 'constraints', ['conceptRef', 'propertyRef', 'kind', 'description']).forEach(c => {
      ref(c.conceptRef, conceptIds, 'constraint.conceptRef'); text(c.description, 'constraint.description');
      const property = properties.find(p => p.id === c.propertyRef);
      if (['descriptive-range', 'numeric-range'].includes(c.kind) && !['number', 'integer'].includes(property?.type)) error('constraint.propertyRef', 'Numeric property required');
      if (c.kind === 'numeric-range') {
        if (!Number.isFinite(c.minimum) || !Number.isFinite(c.maximum) || c.minimum > c.maximum) error('constraint.bounds', 'Finite ordered bounds required');
      } else if (c.kind === 'enum') {
        if (!Array.isArray(c.values) || !c.values.length || c.values.some(v => !matchesType(v, property?.type)) || new Set(c.values).size !== c.values.length) error('constraint.values', 'Unique nonempty primitive values matching property type required');
      } else if (c.kind === 'cardinality') {
        if (!Number.isInteger(c.minCount) || !Number.isInteger(c.maxCount) || c.minCount < 0 || c.maxCount < c.minCount) error('constraint.count', 'Ordered nonnegative integer counts required');
      } else if (c.kind !== 'descriptive-range') error('constraint.kind', 'Unknown constraint kind');
      if (own(c, 'propertyRef')) {
        const p = properties.find(p => p.id === c.propertyRef);
        if (!p || p.conceptRef !== c.conceptRef) error('constraint.propertyRef', 'Dangling or inconsistent property reference');
      }
    });
    rows(asset.sourceMappings, 'sourceMappings', ['sourceRef', 'sourceLocator', 'sourceRevision', 'conceptRef']).forEach(m => {
      ref(m.sourceRef, new Set(sources.map(s => s.id)), 'mapping.sourceRef'); ref(m.conceptRef, conceptIds, 'mapping.conceptRef');
      const source = sources.find(s => s.id === m.sourceRef);
      if (!string(m.sourceLocator) || !string(m.sourceRevision) || m.sourceLocator !== source?.locator || m.sourceRevision !== source?.revision) error('mapping.source', 'Exact source locator and revision required');
    });
    rows(asset.unresolvedIssues, 'unresolvedIssues', ['description']).forEach(i => text(i.description, 'issue.description'));
  }
  if (asset.product === 'harness') {
    fields(asset, ['applicability', 'objectives', 'inputs', 'deliverables', 'rules', 'dependencies'], '$');
    const a = asset.applicability;
    if (!fields(a, ['enabled', 'domains'], 'applicability') || typeof a.enabled !== 'boolean' || !Array.isArray(a.domains) || !a.domains.length || !a.domains.every(string)) error('applicability', 'Expected enabled boolean and nonempty domains');
    for (const key of ['objectives', 'deliverables']) {
      const list = rows(asset[key], key, ['description']);
      if (!list.length) error(key, 'At least one entry required');
      list.forEach(x => text(x.description, `${key}.description`));
    }
    const inputs = rows(asset.inputs, 'inputs', ['type']);
    inputs.forEach(i => { if (![...TYPES, 'array'].includes(i.type)) error('input.type', 'Unsupported input type'); });
    const inputIds = new Set(inputs.map(i => i.id));
    rows(asset.rules, 'rules', ['evidenceKey', 'operator', 'expected', 'severity', 'blocking']).forEach(r => {
      ref(r.evidenceKey, inputIds, 'rule.evidenceKey');
      if (!['eq', 'lte', 'gte', 'contains'].includes(r.operator)) error('rule.operator', 'Unsupported operator');
      if (!['info', 'warning', 'error'].includes(r.severity) || typeof r.blocking !== 'boolean') error('rule', 'Invalid severity or blocking flag');
      const input = inputs.find(i => i.id === r.evidenceKey);
      if (['lte', 'gte'].includes(r.operator) && (typeof r.expected !== 'number' || !['number', 'integer'].includes(input?.type))) error('rule.expected', 'Numeric comparison requires numbers');
      if (r.operator === 'contains' && (!['string', 'array'].includes(input?.type) || (input?.type === 'string' && typeof r.expected !== 'string'))) error('rule.expected', 'Invalid contains operands');
      if (r.operator === 'eq' && input && !matchesType(r.expected, input.type)) error('rule.expected', 'Expected value must match input type');
    });
    rows(asset.dependencies, 'dependencies', ['inputRefs']).forEach(d => array(d.inputRefs, 'dependency.inputRefs').forEach(r => ref(r, inputIds, 'dependency.inputRefs')));
  }
  return { valid: errors.length === 0, errors };
}

function matchesType(value, type) {
  return type === 'array' ? Array.isArray(value) : type === 'integer' ? Number.isInteger(value) : type === 'number' ? Number.isFinite(value) : TYPES.includes(type) && typeof value === type;
}

// Instances: {entities:[{id,conceptRef,properties:{propertyId:[primitive,...]}}],
// relations:[{id,relationRef,from:entityId,to:entityId}]}. Arrays count occurrences:
// missing/[] means zero, [false] and [0] each count as one. required:true means >=1.
// Bounds apply per entity; not every declared concept/relation needs an instance.
export function validateInstances(asset, instances) {
  const validation = validateAsset(asset, { product: 'ontology' });
  const base = { marker: 'PROBE', released: false, businessConfirmed: false };
  if (!validation.valid) return { ...base, valid: false, status: 'ERROR', errors: validation.errors, coverage: [] };
  const coverage = asset.constraints.map(c => ({ id: c.id, coverage: c.kind === 'descriptive-range' ? 'UNSUPPORTED' : 'ENFORCED' }));
  if (!plain(instances) || !jsonData(instances) || !Array.isArray(instances.entities) || !Array.isArray(instances.relations)) return { ...base, valid: false, status: 'ERROR', errors: ['Expected JSON entities/relations arrays'], coverage: coverage.map(c => ({ ...c, coverage: c.coverage === 'ENFORCED' ? 'NOT_CHECKED' : c.coverage })) };
  const errors = [];
  const exact = (row, keys) => {
    const ok = plain(row) && keys.every(k => own(row, k)) && Object.keys(row).every(k => keys.includes(k));
    if (!ok) errors.push('Missing or unknown instance fields');
    return ok;
  };
  exact(instances, ['entities', 'relations']);
  const entities = new Map(), ids = new Set();
  const id = row => { if (!string(row.id) || ids.has(row.id)) errors.push('Nonempty unique instance ID required'); ids.add(row.id); };
  for (const e of instances.entities) {
    if (!exact(e, ['id', 'conceptRef', 'properties'])) continue;
    id(e); entities.set(e.id, e);
    if (!asset.concepts.some(c => c.id === e.conceptRef)) errors.push('Unknown concept reference');
    if (!plain(e.properties)) { errors.push('Expected properties object'); continue; }
    const properties = asset.properties.filter(p => p.conceptRef === e.conceptRef);
    for (const key of Object.keys(e.properties)) if (!properties.some(p => p.id === key)) errors.push('Unknown or wrong-concept property');
    for (const p of properties) {
      const values = own(e.properties, p.id) ? e.properties[p.id] : [];
      if (!Array.isArray(values)) { errors.push('Expected value array'); continue; }
      if (p.required && !values.length) errors.push(`Missing required property: ${p.id}`);
      if (values.some(v => !matchesType(v, p.type))) errors.push(`Property type mismatch: ${p.id}`);
      for (const c of asset.constraints.filter(c => c.propertyRef === p.id)) {
        if (c.kind === 'numeric-range' && values.some(v => !matchesType(v, p.type) || v < c.minimum || v > c.maximum)) errors.push(`Range violation: ${c.id}`);
        if (c.kind === 'enum' && values.some(v => !c.values.includes(v))) errors.push(`Enum violation: ${c.id}`);
        if (c.kind === 'cardinality' && (values.length < c.minCount || values.length > c.maxCount)) errors.push(`Cardinality violation: ${c.id}`);
      }
    }
  }
  for (const r of instances.relations) {
    if (!exact(r, ['id', 'relationRef', 'from', 'to'])) continue;
    id(r);
    const d = asset.relations.find(d => d.id === r.relationRef), from = entities.get(r.from), to = entities.get(r.to);
    if (!d || !from || !to || d.from !== from.conceptRef || d.to !== to.conceptRef) errors.push('Unknown or inconsistent relation/entity reference');
  }
  return { ...base, valid: !errors.length, status: errors.length ? 'FAIL' : 'PASS', errors, coverage };
}

export function buildPackage(asset) {
  const validation = validateAsset(asset);
  if (!validation.valid) throw new TypeError(`Invalid PROBE asset: ${JSON.stringify(validation.errors)}`);
  const a = clone(asset);
  const artifacts = a.product === 'ontology' ? {
    model: { concepts: a.concepts, properties: a.properties, relations: a.relations, constraints: a.constraints },
    sourceMapping: a.sourceMappings, unresolvedIssues: a.unresolvedIssues,
  } : {
    outputDefinitions: a.deliverables,
    configuration: { applicability: a.applicability, objectives: a.objectives, inputs: a.inputs, dependencies: a.dependencies },
    rules: a.rules, evidenceList: [...new Set(a.rules.map(r => r.evidenceKey))],
    evaluationReport: evaluateHarness(a, {}),
  };
  const payload = { marker: 'PROBE', asset: a, ...artifacts,
    buildReport: { status: 'BUILT', version: a.version, released: false,
      ...(a.product === 'ontology' ? { constraintChecks: a.constraints.map(c => ({ id: c.id, coverage: c.kind === 'descriptive-range' ? 'UNSUPPORTED' : 'NOT_CHECKED' })) } : {}) }, validationReport: validation };
  const references = [];
  if (a.product === 'ontology') {
    a.properties.forEach(p => references.push({ from: p.id, to: p.conceptRef }));
    a.relations.forEach(r => { references.push({ from: r.id, to: r.from }, { from: r.id, to: r.to }); });
    a.constraints.forEach(c => { references.push({ from: c.id, to: c.conceptRef }); if (c.propertyRef) references.push({ from: c.id, to: c.propertyRef }); });
    a.sourceMappings.forEach(m => references.push({ from: m.id, to: m.sourceRef }, { from: m.id, to: m.conceptRef }));
  } else {
    a.rules.forEach(r => references.push({ from: r.id, to: r.evidenceKey }));
    a.dependencies.forEach(d => d.inputRefs.forEach(r => references.push({ from: d.id, to: r })));
  }
  references.sort((x, y) => stable(x) < stable(y) ? -1 : stable(x) > stable(y) ? 1 : 0);
  const metadata = { marker: 'PROBE', specVersion: 'v1', product: a.product, id: a.id,
    version: a.version, visibility: a.visibility, algorithm: 'SHA256', canonicalization: 'sorted object keys; ordered arrays',
    referenceClosure: { closed: true, references }, payloadDigest: digest(payload) };
  return freeze({ ...payload, manifest: { ...metadata, digest: digest(metadata) } });
}

// Integrity checks detect changes, but do not authenticate authors or grant authority.
export function verifyPackage(pkg) {
  try {
    if (!plain(pkg) || !jsonData(pkg)) return false;
    const { manifest, ...payload } = pkg;
    const { digest: recorded, ...metadata } = manifest;
    return recorded === digest(metadata) && metadata.payloadDigest === digest(payload) && stable(pkg) === stable(buildPackage(pkg.asset));
  } catch { return false; }
}

export function evaluateHarness(asset, evidence) {
  const validation = validateAsset(asset, { product: 'harness' });
  const base = { marker: 'PROBE', version: validation.valid ? asset.version : null, released: false };
  if (!validation.valid || !plain(evidence) || !jsonData(evidence)) return { ...base, status: 'ERROR', results: [], errors: validation.valid ? ['Malformed evidence'] : validation.errors };
  const inputs = new Map(asset.inputs.map(i => [i.id, i]));
  if (Object.keys(evidence).some(k => !inputs.has(k) || !matchesType(evidence[k], inputs.get(k).type))) return { ...base, status: 'ERROR', results: [], errors: ['Unknown evidence key or incorrect type'] };
  if (!asset.applicability.enabled) return { ...base, status: 'N/A', results: [] };
  const rules = asset.rules;
  const results = rules.map(r => {
    if (!own(evidence, r.evidenceKey)) return { id: r.id, status: 'INDETERMINATE', severity: r.severity, blocking: r.blocking };
    const actual = evidence[r.evidenceKey];
    const pass = r.operator === 'eq' ? stable(actual) === stable(r.expected)
      : r.operator === 'lte' ? actual <= r.expected
      : r.operator === 'gte' ? actual >= r.expected
      : typeof actual === 'string' ? actual.includes(r.expected) : actual.some(x => stable(x) === stable(r.expected));
    return { id: r.id, status: pass ? 'PASS' : 'FAIL', severity: r.severity, blocking: r.blocking };
  });
  // Any missing required rule evidence makes the overall result indeterminate.
  const status = !results.length || results.some(r => r.status === 'INDETERMINATE') ? 'INDETERMINATE'
    : results.some(r => r.status === 'FAIL') ? 'FAIL' : 'PASS';
  return { ...base, status, results };
}

function runProbe() {
  const fixtures = JSON.parse(readFileSync(new URL('./specification-fixtures.json', import.meta.url), 'utf8'));
  let passed = 0; const counts = { ontology: 0, harness: 0, shared: 0 };
  const check = (product, fn) => { fn(); passed++; counts[product]++; };
  const change = (a, fn) => { const b = clone(a); fn(b); return b; };
  check('shared', () => assert.equal(fixtures.assets.length, 16));
  check('shared', () => {
    for (const product of ['ontology', 'harness']) for (const direction of ['forward', 'reverse']) for (const visibility of ['public', 'private']) {
      assert.equal(fixtures.assets.filter(a => a.product === product && a.provenance.direction === direction && a.visibility === visibility).length, 2);
    }
  });
  for (const a of fixtures.assets) {
    const p = a.product;
    const bad = fn => check(p, () => assert.equal(validateAsset(change(a, fn)).valid, false));
    check(p, () => assert.equal(validateAsset(a, { product: p }).valid, true));
    check(p, () => assert.equal(validateAsset(change(a, b => { b.provenance.direction = b.provenance.direction === 'forward' ? 'reverse' : 'forward'; })).valid, true));
    for (const key of ['specVersion', 'product', 'id', 'version', 'visibility', 'provenance', 'extensions', ...(p === 'ontology' ? ['concepts', 'properties', 'relations', 'constraints', 'sourceMappings', 'unresolvedIssues'] : ['applicability', 'objectives', 'inputs', 'deliverables', 'rules', 'dependencies'])]) bad(b => { delete b[key]; });
    bad(b => { b.specVersion = 'v2'; });
    bad(b => { b.provenance.sources.push(clone(b.provenance.sources[0])); });
    bad(b => { b.extensions = [{ namespace: 'notes', version: '1.0.0', required: false, data: {} }]; });
    bad(b => { b.extensions[0].data = { nested: { visibility: 'public' } }; });
    for (const key of ['override', 'basePatch', 'visibility', 'specVersion']) bad(b => { b.extensions[0].data = { [key]: {} }; });
    check(p, () => {
      const b = change(a, b => { b.extensions[0].data = { id: a.id, annotation: { id: a.id } }; });
      const pkg = buildPackage(b);
      assert.deepEqual(pkg.asset.extensions, b.extensions);
      assert.deepEqual({ ...pkg.asset, extensions: a.extensions }, a);
      assert.equal(pkg.manifest.id, a.id);
      if (p === 'ontology') assert.deepEqual(pkg.model, buildPackage(a).model);
      else assert.deepEqual(evaluateHarness(b, fixtures.evidence[a.id]), evaluateHarness(a, fixtures.evidence[a.id]));
    });
    bad(b => { b.provenance.sources[0].status = 'approved'; });
    for (const key of ['locator', 'revision']) {
      bad(b => { delete b.provenance.sources[0][key]; });
      bad(b => { b.provenance.sources[0][key] = ' '; });
    }
    check(p, () => {
      const pkg = buildPackage(a);
      const ref = Object.fromEntries(['product', 'id', 'version', 'specVersion', 'digest', 'visibility'].map(k => [k, pkg.manifest[k]]));
      assert.equal(validateReference(ref).valid, true);
      assert.deepEqual(assertReferenceBinding(ref, { ...ref }), ref);
      assert.ok(Object.isFrozen(assertReferenceBinding(ref, ref)));
      for (const [key, value] of Object.entries({ product: 'unknown', id: 'missing', version: '9.0.0', specVersion: 'v2', digest: `sha256:${'f'.repeat(64)}`, visibility: a.visibility === 'public' ? 'private' : 'public' })) assert.throws(() => assertReferenceBinding(ref, { ...ref, [key]: value }), TypeError);
      for (const key of Object.keys(ref)) { const missing = { ...ref }; delete missing[key]; assert.equal(validateReference(missing).valid, false); }
      assert.equal(validateReference({ ...ref, version: 'latest' }).valid, false);
      assert.equal(validateReference({ ...ref, workspace: 'unknown' }).valid, false);
      const accessor = Object.defineProperty({ ...ref }, 'id', { enumerable: true, get() { throw Error('must not execute'); } });
      assert.equal(validateReference(accessor).valid, false);
      assert.throws(() => assertReferenceBinding(accessor, ref), TypeError);
      assert.throws(() => assertReferenceBinding(ref, ref, { allowPrivate: 'true' }), TypeError);
      if (a.visibility === 'private') assert.throws(() => assertReferenceBinding(ref, ref, { allowPrivate: false }), TypeError);
      else assert.deepEqual(assertReferenceBinding(ref, ref, { allowPrivate: false }), ref);
    });
    for (const status of SOURCE_STATUSES) check(p, () => {
      const pkg = buildPackage(change(a, b => { b.provenance.sources[0].status = status; }));
      assert.equal(pkg.asset.provenance.sources[0].status, status);
      assert.equal(pkg.buildReport.released, false);
    });
    bad(b => { b.extensions[0].required = true; });
    bad(b => { b.extensions[0].data = 'arbitrary'; });
    bad(b => { delete b.extensions[0].required; });
    bad(b => { b.extensions[0].execute = 'forbidden envelope field'; });
    bad(b => { b.extensions.push(clone(b.extensions[0])); });
    check(p, () => { const b = change(a, b => { b.extensions[0].required = true; }); assert.equal(validateAsset(b, { supportedExtensions: ['probe.notes@1.0.0'] }).valid, true); });
    check(p, () => assert.deepEqual(buildPackage(a).asset.extensions, a.extensions));
    check(p, () => { const b = change(a, b => { b.visibility = 'private'; }); assert.equal(buildPackage(b).manifest.visibility, 'private'); assert.equal(buildPackage(b).asset.visibility, 'private'); });
    check(p, () => { const reordered = Object.fromEntries(Object.entries(a).reverse()); assert.equal(buildPackage(a).manifest.digest, buildPackage(reordered).manifest.digest); });
    check(p, () => { const b = change(a, b => { b.provenance.sources.reverse(); }); assert.notEqual(buildPackage(a).manifest.digest, buildPackage(b).manifest.digest); });
    check(p, () => { const pkg = buildPackage(a); assert.equal(verifyPackage(pkg), true); assert.equal(Object.isFrozen(pkg.manifest.referenceClosure.references), true); assert.throws(() => { pkg.manifest.version = '9.0.0'; }, TypeError); });
    check(p, () => { const pkg = clone(buildPackage(a)); pkg.asset.visibility = 'tampered'; assert.equal(verifyPackage(pkg), false); });
    check(p, () => { const pkg = clone(buildPackage(a)); pkg.manifest.referenceClosure.closed = false; assert.equal(verifyPackage(pkg), false); });
    check(p, () => { const pkg = clone(buildPackage(a)); pkg.buildReport.released = true; assert.equal(verifyPackage(pkg), false); });
    check(p, () => assert.throws(() => buildPackage(change(a, b => { b.specVersion = 'v9'; })), TypeError));
    check(p, () => { const frozen = freeze(clone(a)); const before = stable(frozen); validateAsset(frozen); buildPackage(frozen); if (p === 'harness') evaluateHarness(frozen, freeze(clone(fixtures.evidence[a.id]))); assert.equal(stable(frozen), before); });
    if (p === 'ontology') {
      bad(b => { delete b.concepts[0].definition; });
      bad(b => { b.concepts[0].definition = ' '; });
      for (const key of ['sourceLocator', 'sourceRevision', 'conceptRef']) bad(b => { b.sourceMappings[0][key] = 'missing'; });
      for (const [kind, key, value] of [
        ['numeric-range', 'minimum', Infinity], ['numeric-range', 'minimum', 11], ['numeric-range', 'maximum', '10'],
        ['enum', 'values', []], ['enum', 'values', [0, 0]], ['enum', 'values', ['0']], ['enum', 'values', [null]],
        ['cardinality', 'minCount', -1], ['cardinality', 'maxCount', 0], ['cardinality', 'minCount', 0.5],
      ]) bad(b => { b.constraints.find(c => c.kind === kind)[key] = value; });
      check(p, () => {
        const data = fixtures.instances[a.id];
        const report = validateInstances(a, data);
        assert.equal(report.status, 'PASS'); assert.equal(report.businessConfirmed, false);
        assert.equal(report.coverage[0].coverage, 'UNSUPPORTED');
        assert.ok(report.coverage.slice(1).every(c => c.coverage === 'ENFORCED'));
        assert.ok(buildPackage(a).buildReport.constraintChecks.every(c => c.coverage !== 'ENFORCED'));
        assert.deepEqual(buildPackage(a).sourceMapping, a.sourceMappings);
        const quantity = a.properties[0];
        const entity = d => d.entities.find(e => e.conceptRef === quantity.conceptRef);
        const fail = fn => assert.equal(validateInstances(a, change(data, fn)).valid, false);
        for (const values of [[], [0, 2], [-1], [11], [3], ['0'], [false], [0.5]]) fail(d => { entity(d).properties[quantity.id] = values; });
        fail(d => { delete entity(d).properties[quantity.id]; });
        fail(d => { delete entity(d).properties.active; });
        fail(d => { entity(d).properties.active = [0]; });
        fail(d => { entity(d).properties.unknown = [1]; });
        fail(d => { entity(d).properties[quantity.id] = 0; });
        fail(d => { d.entities[0].conceptRef = 'unknown'; });
        fail(d => { d.entities.push(clone(d.entities[0])); });
        fail(d => { d.relations[0].relationRef = 'unknown'; });
        fail(d => { d.relations[0].from = 'unknown'; });
        fail(d => { [d.relations[0].from, d.relations[0].to] = [d.relations[0].to, d.relations[0].from]; });
        assert.equal(validateInstances(a, {}).status, 'ERROR');
        assert.equal(validateInstances(a, Object.defineProperty({}, 'entities', { enumerable: true, get() { throw Error('must not execute'); } })).status, 'ERROR');
        // Check constraints independently so required/type checks cannot mask failures.
        const cardinalityOnly = change(a, b => { b.properties[0].required = false; b.constraints = b.constraints.filter(c => c.kind === 'cardinality'); });
        assert.equal(validateInstances(cardinalityOnly, change(data, d => { delete entity(d).properties[quantity.id]; })).valid, false);
        const rangeOnly = change(a, b => { b.constraints = b.constraints.filter(c => c.kind === 'numeric-range'); b.properties[0].type = 'number'; });
        assert.equal(validateInstances(rangeOnly, change(data, d => { entity(d).properties[quantity.id] = [0.5]; })).valid, true);
        assert.equal(validateInstances(rangeOnly, change(data, d => { entity(d).properties[quantity.id] = [11]; })).valid, false);
        for (const value of [0, 10]) assert.equal(validateInstances(a, change(data, d => { entity(d).properties[quantity.id] = [value]; })).valid, true);
        const enumOnly = change(a, b => { b.constraints = b.constraints.filter(c => c.kind === 'enum'); });
        assert.equal(validateInstances(enumOnly, change(data, d => { entity(d).properties[quantity.id] = [3]; })).valid, false);
        const stringEnum = change(a, b => { const property = b.properties.find(p => p.type === 'string'); b.constraints.push({ id: 'string-enum', conceptRef: property.conceptRef, propertyRef: property.id, kind: 'enum', description: 'Synthetic text choice.', values: ['synthetic'] }); });
        assert.equal(validateInstances(stringEnum, data).valid, true);
        assert.equal(validateInstances(stringEnum, change(data, d => { const property = a.properties.find(p => p.type === 'string'); d.entities.find(e => e.conceptRef === property.conceptRef).properties[property.id] = ['unknown']; })).valid, false);
        const advisoryOnly = change(a, b => { b.constraints = [b.constraints[0]]; });
        const advisory = validateInstances(advisoryOnly, change(data, d => { entity(d).properties[quantity.id] = [-99]; }));
        assert.equal(advisory.valid, true); assert.equal(advisory.coverage[0].coverage, 'UNSUPPORTED');
      });
      bad(b => { b.relations[0].to = 'missing'; });
      bad(b => { b.properties[0].conceptRef = 'missing'; });
      bad(b => { b.sourceMappings[0].sourceRef = 'missing'; });
      bad(b => { b.constraints[0].propertyRef = 'missing'; });
      bad(b => { b.constraints[0].kind = 'unknown'; });
      bad(b => { delete b.constraints[0].propertyRef; });
      bad(b => { b.constraints[0].description = ' '; });
      bad(b => { b.properties[0].type = 'string'; });
      bad(b => { b.properties[0].type = 'executable'; });
      check(p, () => { const pkg = buildPackage(a); for (const key of ['model', 'sourceMapping', 'unresolvedIssues', 'buildReport', 'validationReport', 'manifest']) assert.ok(own(pkg, key)); });
    } else {
      const evidence = fixtures.evidence[a.id];
      bad(b => { b.rules[0].evidenceKey = 'missing'; });
      bad(b => { b.dependencies[0].inputRefs = ['missing']; });
      bad(b => { b.rules[0].operator = 'eval'; });
      bad(b => { delete b.rules[0].expected; });
      bad(b => { b.rules[0].expected = 'wrong type'; });
      check(p, () => assert.equal(evaluateHarness(a, evidence).status, 'PASS'));
      check(p, () => assert.equal(evaluateHarness(a, {}).status, 'INDETERMINATE'));
      check(p, () => assert.equal(evaluateHarness(a, change(evidence, e => { delete e[a.rules[0].evidenceKey]; })).status, 'INDETERMINATE'));
      check(p, () => assert.equal(evaluateHarness(a, null).status, 'ERROR'));
      check(p, () => assert.equal(evaluateHarness(a, { ...evidence, [a.rules[0].evidenceKey]: 'malformed' }).status, 'ERROR'));
      check(p, () => assert.equal(evaluateHarness(a, { ...evidence, unexpected: 1 }).status, 'ERROR'));
      for (const [key, value] of [['minimum', 0], ['ready', false], ['tags', []], ['note', 'missing marker']]) {
        check(p, () => assert.equal(evaluateHarness(a, { ...evidence, [key]: value }).status, 'FAIL'));
      }
      check(p, () => assert.equal(evaluateHarness(a, { ...evidence, minimum: 1.5 }).status, 'ERROR'));
      check(p, () => assert.equal(evaluateHarness(a, { ...evidence, maximum: Infinity }).status, 'ERROR'));
      check(p, () => { const report = evaluateHarness(a, { ...evidence, [a.rules[0].evidenceKey]: 999 }); assert.equal(report.status, 'FAIL'); assert.equal(report.version, a.version); assert.equal(report.released, false); });
      check(p, () => { const b = change(a, b => { b.rules[0].severity = 'warning'; b.rules[0].blocking = false; }); const report = evaluateHarness(b, { ...evidence, [b.rules[0].evidenceKey]: 999 }); assert.equal(report.status, 'FAIL'); assert.equal(report.version, a.version); assert.equal(report.released, false); });
      check(p, () => assert.equal(evaluateHarness(change(a, b => { b.rules = []; }), evidence).status, 'INDETERMINATE'));
      check(p, () => assert.equal(evaluateHarness(change(a, b => { b.applicability.enabled = false; }), evidence).status, 'N/A'));
      check(p, () => assert.deepEqual(evaluateHarness(change(a, b => { b.applicability.enabled = false; b.rules = []; }), {}), { marker: 'PROBE', version: a.version, released: false, status: 'N/A', results: [] }));
      check(p, () => { const pkg = buildPackage(a); for (const key of ['outputDefinitions', 'configuration', 'rules', 'evidenceList', 'evaluationReport', 'manifest']) assert.ok(own(pkg, key)); assert.equal(pkg.evaluationReport.status, 'INDETERMINATE'); });
    }
  }
  check('shared', () => assert.equal(validateAsset({ x: () => true }).valid, false));
  // Independent, hand-authored regression asset: no expected status derived from implementation.
  check('shared', () => {
    const a = { specVersion: 'v1', product: 'harness', id: 'independent-regression', version: '0.1.0', visibility: 'private',
      provenance: { direction: 'reverse', sources: [{ id: 's', kind: 'observation', locator: 'synthetic://independent/observation#s', revision: 'synthetic-r1', digest: `sha256:${'0'.repeat(64)}`, status: 'source-observed' }] },
      extensions: [{ namespace: 'local.notes', version: '1.0.0', required: false, data: { annotation: { id: 'independent-regression' } } }],
      applicability: { enabled: false, domains: ['synthetic'] }, objectives: [{ id: 'o', description: 'Synthetic only' }],
      inputs: [], deliverables: [{ id: 'd', description: 'Synthetic only' }], rules: [], dependencies: [] };
    assert.equal(validateAsset(a).valid, true);
    assert.equal(evaluateHarness(a, {}).status, 'N/A');
    a.applicability.enabled = true;
    assert.equal(evaluateHarness(a, {}).status, 'INDETERMINATE');
    assert.equal(buildPackage(a).buildReport.released, false);
    a.extensions[0].data.basePatch = { visibility: 'public' };
    assert.equal(validateAsset(a).valid, false);
    delete a.extensions[0].data.basePatch; a.provenance.sources[0].status = 'approved';
    assert.equal(validateAsset(a).valid, false);
  });
  check('shared', () => { const x = {}; x.x = x; assert.equal(validateAsset(x).valid, false); });
  check('shared', () => assert.equal(validateAsset({ x: NaN }).valid, false));
  check('shared', () => assert.equal(validateAsset(Object.defineProperty({}, 'x', { enumerable: true, get() { throw Error('must not execute'); } })).valid, false));
  console.log(JSON.stringify({ marker: 'PROBE', status: 'PASS', fixtures: fixtures.assets.length, assertions: { passed, failed: 0, byProduct: counts }, limits: ['no OWL/SHACL full conformance', 'no real Host validation', 'no complete migration', 'integrity digests are not signatures or release authority'], released: false }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runProbe();
