// Finite projection from Expert guidance inputs to the public MCP envelope.
// Runtime alone validates and persists definitions and discovery facts.
const specs: Record<string, {query: string[]; body?: string; context?: string}> = {
  'project-connect-plan': {query: [], body: 'projectRegistration'},
  'project-connect': {query: [], body: 'projectRegistration'},
  'project-readiness': {query: ['projectId']},
  'project-connected-list': {query: []},
  'project-connected-inspect': {query: ['projectId']},
  'project-discover': {query: [], body: 'projectFacts'},
  'project-onboard': {query: [], body: 'projectDefinition', context: 'projectDiscovery'},
  'project-adjust': {query: [], body: 'projectDefinition', context: 'projectImpact'},
  'project-list': {query: []},
  'project-inspect': {query: ['projectDefinitionId', 'version']},
  'project-diff': {query: ['projectDefinitionId', 'fromVersion', 'toVersion']}
};
function assertReferenceOnly(value: unknown, depth = 0): void {
  if (depth > 32) throw new Error('EVOLUTION_EXPERT_PROJECT_INPUT_INVALID');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:password|token|secret|credential|api[-_]?key|private[-_]?key)$/i.test(key) && child !== undefined && child !== null && child !== '') throw new Error('EVOLUTION_EXPERT_PROJECT_RAW_SECRET_REFUSED');
    if (typeof child === 'string' && /:\/\/[^/]*@/.test(child)) throw new Error('EVOLUTION_EXPERT_PROJECT_RAW_SECRET_REFUSED');
    assertReferenceOnly(child, depth + 1);
  }
}
export function projectDefinitionMcpInput(intent: string, input: Record<string, unknown>): Record<string, unknown> | undefined {
  const spec = Object.hasOwn(specs, intent) ? specs[intent] : undefined;
  if (spec || intent === 'project-activate' || intent === 'project-rollback') assertReferenceOnly(input);
  if (intent === 'project-activate' || intent === 'project-rollback') {
    const keys = ['projectDefinitionId', 'version', 'definitionDigest', 'expectedActiveDigest', 'authorizationDigest', 'evidenceRef', 'idempotencyKey'];
    if (Object.keys(input).some(key => !keys.includes(key)) || !['definitionDigest', 'expectedActiveDigest'].every(key => typeof input[key] === 'string' && /^sha256:[a-f0-9]{64}$/.test(input[key] as string))) throw new Error('EVOLUTION_EXPERT_PROJECT_INPUT_INVALID');
    const snapshot = structuredClone(input);
    return {projectDefinitionId: snapshot.projectDefinitionId, ...(snapshot.idempotencyKey ? {idempotencyKey: snapshot.idempotencyKey} : {}), payload: Object.fromEntries(['version', 'definitionDigest', 'expectedActiveDigest', 'evidenceRef'].map(key => [key, snapshot[key]]))};
  }
  if (!spec) return undefined;
  const allowed = new Set([...spec.query, 'idempotencyKey', ...(spec.body ? [spec.body] : []), ...(spec.context ? [spec.context] : [])]);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('EVOLUTION_EXPERT_PROJECT_INPUT_INVALID');
  const snapshot = structuredClone(input), body = spec.body ? snapshot[spec.body] : undefined;
  if (spec.body && (!body || typeof body !== 'object' || Array.isArray(body))) throw new Error('EVOLUTION_EXPERT_PROJECT_INPUT_INVALID');
  if (spec.body === 'projectRegistration') {
    const allowedRegistration = ['id', 'name', 'profileId', 'repository', 'llmProfileId', 'devops', 'runtime', 'objective', 'requireLlmReady', 'githubAppInstallationId'];
    if (Object.keys(body as object).some(key => !allowedRegistration.includes(key))) throw new Error('EVOLUTION_EXPERT_PROJECT_INPUT_INVALID');
    const registration = body as Record<string, unknown>;
    if (!registration.repository || typeof registration.repository !== 'object' || Array.isArray(registration.repository)) throw new Error('EVOLUTION_EXPERT_PROJECT_INPUT_INVALID');
    const allowedRepository = ['provider', 'root', 'gitUrl', 'baseUrl', 'projectId', 'owner', 'repo', 'defaultBranch', 'executionMode', 'upstreamRepo', 'workingRepo', 'claimBoundary', 'tokenRef'];
    if (Object.keys(registration.repository).some(key => !allowedRepository.includes(key))) throw new Error('EVOLUTION_EXPERT_PROJECT_INPUT_INVALID');
  }
  return {...Object.fromEntries([...spec.query, 'idempotencyKey'].filter(key => snapshot[key] !== undefined).map(key => [key, snapshot[key]])), ...(spec.body ? {payload: body} : {})};
}
