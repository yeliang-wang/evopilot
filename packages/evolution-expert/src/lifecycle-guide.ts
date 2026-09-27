import {assertReferenceOnlyInput} from './governed-guide.js';
// Expert inputs stay separate from the public MCP envelope. This is a finite
// projection, not a transport, permission source, or Runtime state cache.
const specifications: Record<string, {query: string[]; body?: string[]; decision?: boolean}> = {
  'lifecycle-create': {query: [], body: ['yaml', 'evidenceRef', 'sourceRef', 'sourceType']},
  'lifecycle-update': {query: [], body: ['yaml', 'evidenceRef', 'sourceRef', 'sourceType']},
  'lifecycle-list': {query: []},
  'lifecycle-inspect': {query: ['lifecycleId', 'version']},
  'lifecycle-diff': {query: ['lifecycleId', 'fromVersion', 'toVersion']},
  'lifecycle-resolve': {query: [], body: ['lifecycleId', 'lifecycleVersion', 'labels', 'goalText']},
  'lifecycle-resolve-inputs': {query: [], body: ['lifecycleId', 'lifecycleVersion', 'answers', 'projectFacts', 'organizationDefaults', 'runtimeCapabilities', 'deterministicValues']},
  'lifecycle-activate': {query: ['lifecycleId'], body: ['version', 'expectedActiveDigest', 'evidenceRef'], decision: true},
  'lifecycle-deactivate': {query: ['lifecycleId'], body: ['expectedActiveDigest', 'evidenceRef'], decision: true},
  'lifecycle-archive': {query: ['lifecycleId'], body: ['version', 'revisionDigest', 'evidenceRef'], decision: true},
  'lifecycle-restore': {query: ['lifecycleId'], body: ['version', 'revisionDigest', 'evidenceRef'], decision: true},
  'lifecycle-rollback': {query: ['lifecycleId'], body: ['version', 'expectedActiveDigest', 'evidenceRef'], decision: true},
  'lifecycle-dependencies': {query: ['lifecycleId', 'version']},
  'lifecycle-usage': {query: ['lifecycleId', 'version']},
  'lifecycle-audit': {query: ['lifecycleId']}
};

export function projectLifecycleMcpInput(intent: string, input: Record<string, unknown>): Record<string, unknown> | undefined {
  const spec = Object.hasOwn(specifications, intent) ? specifications[intent] : undefined;
  if (!spec) return undefined;
  assertReferenceOnlyInput(input);
  const allowed = new Set([...spec.query, ...(spec.body ?? []), 'idempotencyKey', ...(spec.decision ? ['authorizationDigest'] : [])]);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('EVOLUTION_EXPERT_LIFECYCLE_INPUT_INVALID');
  const snapshot = structuredClone(input);
  const pick = (keys: string[]) => Object.fromEntries(keys.filter(key => snapshot[key] !== undefined).map(key => [key, snapshot[key]]));
  return {...pick([...spec.query, 'idempotencyKey']), ...(spec.body ? {payload: pick(spec.body)} : {})};
}
