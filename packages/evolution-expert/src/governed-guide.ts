// Public MCP bodies are nested; Expert input facts never select a transport,
// principal, published candidate, or Runtime-owned authority digest.
const bodyFields: Record<string, string[]> = {
  'lifecycle-classify': ['gapClass', 'rationale', 'evidenceRefs'],
  'llm-repair': [],
  'production-reference': ['sources', 'dispositions'],
  capability: ['sources', 'dispositions'],
  migration: ['sources', 'dispositions'],
  'lifecycle-observe': ['id', 'context', 'signals', 'capturedAt', 'provenance'],
  'lifecycle-propose': ['observationId', 'id', 'champion', 'challenger', 'authority', 'dependencies', 'affectedResources', 'migrationSteps', 'minimumImprovement', 'monitoring', 'rollbackVerified', 'safety', 'evidenceRefs'],
  'lifecycle-experiment': ['proposalId', 'champion', 'challenger'],
  'lifecycle-evolution-decision': ['proposalId', 'experimentDigest', 'policy', 'canaryEvidenceRefs'],
  'lifecycle-monitor': ['activationReceiptDigest', 'lifecycleId', 'activeVersion', 'activeRevisionDigest', 'rollbackVersion', 'rollbackRevisionDigest', 'samples', 'requiredConsecutiveDegraded', 'mutationOutcomeKnown'],
  'primitive-gap': ['observationId', 'id', 'objective', 'requiredPrimitive', 'evidenceRefs'],
  'harness-explain': ['projectDefinitionId', 'projectDefinitionVersion', 'goalTarget', 'lifecycleId', 'lifecycleVersion', 'policyDigest', 'providerDigest', 'environmentDigest', 'hostDigest', 'executor', 'runtimeDigest', 'evidenceDigest'],
  'goal-run': ['id', 'bindingDigest', 'executor', 'answers', 'projectFacts', 'organizationDefaults', 'runtimeCapabilities', 'deterministicValues'],
  recovery: ['failureClass', 'failureSignature', 'bindingDigest', 'attempt', 'maxAttempts', 'mutationReceipt', 'identicalInputs', 'reversible', 'externalEffect', 'projectId', 'lifecycleId', 'actionId', 'hostId']
};
const queryFields: Record<string, string[]> = {
  'lifecycle-observation-inspect': ['observationId'], 'lifecycle-successor-inspect': ['proposalId'],
  'llm-setup': [], 'llm-status': [], 'llm-migration': [],
  status: ['runId'], evidence: ['runId'],
  'version-explain': ['kind', 'resourceId', 'version'], rollback: ['kind', 'resourceId', 'version']
};
const interactionFields: Record<string, string[]> = {
  help: ['sessionDigest'], tutorial: ['sessionDigest'],
  cutover: ['sessionDigest', 'cutoverReadiness'],
  acceptance: ['sessionDigest', 'acceptanceAggregate'],
  release: ['sessionDigest', 'releaseBinding', 'authorizationDigest']
};
export function assertReferenceOnlyInput(value: unknown, depth = 0): void {
  if (depth > 32) throw new Error('EVOLUTION_EXPERT_GOVERNED_INPUT_INVALID');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:password|token|secret|credential|api[-_]?key|private[-_]?key)$/i.test(key) && child !== undefined && child !== null && child !== '') throw new Error('EVOLUTION_EXPERT_GOVERNED_RAW_SECRET_REFUSED');
    if (typeof child === 'string' && /:\/\/[^/]*@/.test(child)) throw new Error('EVOLUTION_EXPERT_GOVERNED_RAW_SECRET_REFUSED');
    assertReferenceOnlyInput(child, depth + 1);
  }
}
export function governedMcpInput(intent: string, input: Record<string, unknown>, guidance: {purpose: string; nextOnSuccess: string}): Record<string, unknown> | undefined {
  const own = (table: Record<string, string[]>) => Object.hasOwn(table, intent) ? table[intent] : undefined;
  const body = own(bodyFields), query = own(queryFields), interaction = own(interactionFields);
  const fields = body ?? query ?? interaction;
  const routeFields = intent === 'lifecycle-classify' ? ['observationId'] : [];
  if (!fields) return undefined;
  if (Object.keys(input).some(key => key !== 'idempotencyKey' && !fields.includes(key) && !routeFields.includes(key))) throw new Error('EVOLUTION_EXPERT_GOVERNED_INPUT_INVALID');
  assertReferenceOnlyInput(input);
  const snapshot = structuredClone(input);
  const envelope = snapshot.idempotencyKey === undefined ? {} : {idempotencyKey: snapshot.idempotencyKey};
  const selected = Object.fromEntries(fields.filter(key => snapshot[key] !== undefined).map(key => [key, snapshot[key]]));
  if (query) return {...envelope, ...selected};
  if (body) return {...envelope, ...Object.fromEntries(routeFields.map(key => [key, snapshot[key]])), payload: selected};
  // Rendering is a non-authorizing explanation, including after an exact
  // release-guidance decision. Supplied readiness is labelled, never certified.
  const context = Object.fromEntries(Object.entries(selected).filter(([key]) => !['sessionDigest', 'authorizationDigest'].includes(key)));
  return {...envelope, payload: {
    interactionId: `expert-${intent}-${String(snapshot.sessionDigest)}`,
    sessionDigest: snapshot.sessionDigest,
    kind: 'HELP', authority: 'NONE', title: `EvoPilot ${intent}`,
    summary: guidance.purpose,
    details: [guidance.nextOnSuccess, ...(Object.keys(context).length ? ['Supplied context; this rendering does not validate readiness or grant authority.', JSON.stringify(context)] : [])],
    objectRefs: [], nextAction: guidance.nextOnSuccess
  }};
}
