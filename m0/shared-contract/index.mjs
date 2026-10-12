// Independent, import-free PROBE contract. Pins identify content, not authority.
const fields = ['product', 'id', 'version', 'specVersion', 'digest', 'visibility'];
const text = x => typeof x === 'string' && x.trim().length > 0;
const digits = x => x.length > 0 && [...x].every(c => '0123456789'.includes(c));

export function validateReference(reference) {
  const errors = [];
  if (!reference || typeof reference !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(reference))) return { valid: false, errors: ['Expected plain reference'] };
  const descriptors = Object.getOwnPropertyDescriptors(reference);
  if (Reflect.ownKeys(descriptors).length !== fields.length || fields.some(k => !Object.hasOwn(descriptors, k) || !descriptors[k].enumerable || !Object.hasOwn(descriptors[k], 'value'))) return { valid: false, errors: ['Exact data-only identity fields required'] };
  const r = Object.fromEntries(fields.map(k => [k, descriptors[k].value]));
  if (!['ontology', 'harness'].includes(r.product)) errors.push('Unknown product');
  if (!text(r.id)) errors.push('Nonempty ID required');
  if (typeof r.version !== 'string' || r.version.split('.').length !== 3 || !r.version.split('.').every(digits)) errors.push('Exact x.y.z pin required');
  if (r.specVersion !== 'v1') errors.push('Unknown specification');
  if (typeof r.digest !== 'string' || !r.digest.startsWith('sha256:') || r.digest.length !== 71 || ![...r.digest.slice(7)].every(c => '0123456789abcdef'.includes(c))) errors.push('SHA256 digest required');
  if (!['public', 'private'].includes(r.visibility)) errors.push('Unknown visibility');
  return { valid: !errors.length, errors };
}

// Returns a frozen snapshot; never selects latest or mutates either input.
export function assertReferenceBinding(reference, observedReference, { allowPrivate = true } = {}) {
  if (typeof allowPrivate !== 'boolean') throw new TypeError('allowPrivate must be boolean');
  for (const r of [reference, observedReference]) {
    const result = validateReference(r);
    if (!result.valid) throw new TypeError(result.errors.join('; '));
    if (!allowPrivate && r.visibility === 'private') throw new TypeError('Private content at public boundary');
  }
  if (fields.some(k => reference[k] !== observedReference[k])) throw new TypeError('Immutable reference pin mismatch');
  return Object.freeze(Object.fromEntries(fields.map(k => [k, reference[k]])));
}
