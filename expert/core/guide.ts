export interface GuideScenario { questions: string[]; owners: string[]; operations: string[]; steps: string[]; tools?: string[] }
const guides: Record<string, GuideScenario> = {
  onboarding: {
    questions: ['What outcome do you want?', 'Which project and public/private scope?', 'Create a proposed model, inspect authorized sources, evaluate quality, or execute a pinned goal?'],
    owners: ['ontology', 'harness', 'runtime'],
    operations: ['workspace.inspect', 'asset.list', 'project.list'],
    steps: ['Inspect this session identity. Selecting Preview and submitting an EvoPilot task authorizes activation of this chat without a redundant enable question. Discovery and guide-only informational requests remain passive.', 'When active, read capabilities and scoped state before choosing the owner.', 'Use the relevant scenario; ask only unresolved requirements.'],
  },
  'ontology-forward': {
    questions: ['Which concepts, relationships and constraints express the domain?', 'Which requirements are confirmed and which remain unresolved?'],
    owners: ['ontology'],
    operations: ['workspace.inspect', 'asset.list', 'asset.put', 'asset.review', 'asset.decide', 'asset.publish'],
    steps: ['Draft a native model with forward provenance and proposed source mappings.', 'Keep unresolved required semantics PENDING. Review the exact model before a real human decision and separate publication.'],
  },
  'ontology-reverse': {
    questions: ['Which exact source and revision may be inspected?', 'Which observations are direct evidence and which are inferred?'],
    owners: ['ontology'],
    operations: ['workspace.inspect', 'asset.list', 'asset.put', 'source.list', 'source.inspect', 'legacy.import', 'legacy.derive', 'asset.review', 'asset.decide', 'asset.publish'],
    steps: ['For native repository reverse modeling, the Host reads only explicitly authorized source and authors a native v1 model via asset.put, preserving real source locator, revision and digest.', 'Mark mappings source-observed or inferred, retain required semantic gaps as PENDING, and ask the user to resolve them. Never infer production business decisions.', 'legacy.import and legacy.derive are a separate structured legacy-asset bridge for supported JSON/YAML documents, never an arbitrary Java or repository source parser.'],
  },
  'harness-quality': {
    questions: ['What quality outcome and applicability are required?', 'Which rules, parameters and actual evidence support it?'],
    owners: ['harness'],
    operations: ['workspace.inspect', 'asset.list', 'asset.put', 'asset.review', 'asset.decide', 'asset.publish', 'asset.evaluate', 'evaluation.inspect'],
    steps: ['Choose the owning Component/Profile/Bundle/EvaluationPack schema and exact dependencies.', 'Missing rules or missing reports remain INDETERMINATE with a Warning; do not invent evidence or automatically version an asset.', 'Keep quality results separate from Ontology business validity and Runtime execution status.'],
  },
  'runtime-handoff': {
    questions: ['Which project and goal?', 'Which exact published Ontology and Harness pins?', 'What real human decision applies to this prepared review?'],
    owners: ['runtime', 'ontology', 'harness'],
    operations: ['workspace.inspect', 'project.inspect', 'project.create', 'goal.create', 'asset.inspect', 'run.prepare', 'run.inspect', 'run.decide'],
    tools: ['evopilot_v01_dispatch', 'evopilot_v01_reconcile'],
    steps: ['Create the scoped project and goal explicitly. Resolve published six-field pins without latest selection.', 'Prepare immutable input, inspect its review, retain the real human decision, then dispatch separately.', 'SUCCEEDED execution does not imply PASS for quality or business semantics.'],
  },
  recovery: {
    questions: ['Which exact owner, scope, requestId and run/session id were retained?'],
    owners: ['runtime', 'harness', 'ontology'],
    operations: ['workspace.inspect', 'receipt.inspect', 'run.inspect', 'evaluation.inspect', 'classification.inspect', 'classification.resume'],
    tools: ['evopilot_v01_reconcile'],
    steps: ['UNKNOWN remains unresolved. Read the owning receipt and current run/session before any new action.', 'Runtime reconcile reads retained provider evidence; never rerun, refresh CAS or retry automatically.', 'A connection fault needs explicit operator diagnosis/recovery; closing a chat does not stop the daemon.'],
  },
  'retained-ontology': {
    questions: ['Which retained source, Pack/Proposal/Snapshot, projection, reasoning or Catalog operation is required?', 'Are the exact trusted providers configured and their bindings verified?'],
    owners: ['ontology'],
    operations: ['workspace.inspect', 'source.list', 'source.inspect', 'producer.prepare', 'producer.inspect', 'producer.list', 'producer.decide', 'classification.start', 'classification.reanalyze', 'classification.inspect', 'classification.resume', 'classification.list', 'classification.continue_to_harness', 'classification.close', 'semantic.catalog.recover', 'semantic.catalog.recovery-readback', 'semantic.catalog.recovery-inspect'],
    steps: ['Read owning capabilities for the implemented Pack/Proposal/Snapshot, projection, reasoning and Catalog operation names and exact input contracts; use the current legacy-api and catalog-service docs, never guessed aliases.', 'Named retained producers require a decided producer plan and planId. Historical calculations and local lifecycle records grant no native publication or execution rights.', 'Classification start/reanalyze are awaited requests returning the original admission receipt; inspect/resume reads the current outcome.', 'Trusted keys are resolveClassificationSource, classificationAdvisor, classificationModel and resolveLegacyHarness. classificationModel is {providerId, modelId, revision, timeoutMs}. No automatic callback configuration, credentials or Host LLM identity.', 'Classification handoff requires the actual human evidence and exact decision token; it does not start Harness.'],
  },
};
// Guides are pure; installed paths resolve against a verified installationRoot.
export const sourceReferences = Object.freeze(['docs/first-journey.md', 'docs/product-composition.md', 'projects/evopilot-ontology/docs/service.md', 'projects/evopilot-ontology/docs/classification-service.md', 'projects/evopilot-ontology/docs/legacy-api.md', 'projects/evopilot-ontology/docs/catalog-service.md', 'projects/evopilot-ontology/specifications/', 'projects/evopilot-ontology/schemas/', 'projects/evopilot-harness/specifications/', 'projects/evopilot-harness/docs/service.md', 'projects/evopilot-runtime/docs/service.md']);
export const installedReference = (reference: string) => reference.replace(/^projects\/evopilot-(runtime|harness|ontology)\//, 'node_modules/@evopilot-next/$1/');
export const scenarios = Object.freeze(Object.keys(guides));
export function getGuide(scenario: string) {
  if (!Object.hasOwn(guides, scenario)) throw Object.assign(new Error('Unknown scenario'), { code: 'INVALID_REQUEST' });
  return structuredClone({
    scenario, ...guides[scenario], authority: false,
    firstWhenActive: ['evopilot_v01_capabilities', 'evopilot_v01_request: owner workspace.inspect and relevant scoped read operations'],
    rules: [
      'Ask only unresolved questions; explain user choices without asking users to author raw schema or digests.',
      'Common v1 references contain product, id, version, specVersion:v1, digest and visibility. Pins must match exactly.',
      'Respect public/private and exact project scope. Public visibility is not permission to upload; private material cannot feed public consumers.',
      'Extensions are inert namespaced data; unknown required extensions block use. Child schemas/templates are authoritative.',
      'Every mutation uses an explicit requestId and expectedRevision; owner validates operational payloads. No automatic CAS refresh or replay.',
      'Honor real human APPROVE/REJECT decisions on the current review. Never invent humanEvidenceRef or other evidence references.',
      'Model output, calculation, tests and delivery are not approval, acceptance or release authority.',
      'Use synthetic acceptance fixtures only when validation with synthetic data was explicitly requested.',
    ],
    references: sourceReferences,
    sourceReferences,
    installedReferences: sourceReferences.map(installedReference),
    referenceBases: { references: 'source checkout root', installedReferences: 'verified installationRoot' },
  });
}
