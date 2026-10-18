import { getScenario, scenarioCatalogue, scenarioIds } from './scenarios.js';

export interface GuideScenario { questions: string[]; owners: string[]; operations: string[]; steps: string[]; tools?: string[] }
const guides: Record<string, GuideScenario> = {
  'online-setup': {
    questions:['Which service, environment, deployment revision and reviewed SLO apply?','Which private read-only Prometheus and authenticated Alertmanager credential file references are configured?'],
    owners:['harness','runtime'],operations:['online.inspect','online.binding.put','online.binding.decide','online.binding.select'],
    tools:['evopilot_v01_online_configure','evopilot_v01_online_worker','evopilot_v01_native','evopilot_v01_activate'],
    steps:['Inspect exact installation and Workspace; read docs/online-harness.md against the verified installationRoot. Configuration, plugin selection and a valid SLO are not measurements or monitoring activation.','Use the strict OpenSLO v1 RatioTimeslices profile and an exact published native policy whose onlineTarget matches. Explain unsupported fields and actual units/window/freshness requirements.','Configure private server connections with credential file references; never put tokens into chat or assets. This stops the connection and deactivates the chat; explicitly reactivate to load configuration.','Prepare the immutable service binding and present the exact review for the actual human decision. Only then select it and explicitly start the independent worker. Do not infer a production SLO from a synthetic example.'],
  },
  'online-observe': {
    questions:['Which selected binding and measurement window should be inspected?'],owners:['harness'],operations:['online.inspect','online.binding.inspect','online.observation.inspect','online.incident.inspect'],tools:['evopilot_v01_online_worker','evopilot_v01_native'],
    steps:['Inspect worker registration, current PID/heartbeat and last tick separately from service health. A live worker is not PASS.','Read retained actual Prometheus windows, native command receipts and authenticated alert history for the exact service/environment/deployment.','Missing, stale, partial, unauthenticated, zero-denominator or timed-out data is INCOMPLETE. Diagnose the retained code; never substitute a guessed healthy value.','Backlog and resource limits remain visible. The selected worker continues independently of Codex; ordinary chats remain unaffected.'],
  },
  'online-repair': {
    questions:['Which confirmed finding and concrete change should be reviewed?'],owners:['harness','runtime'],operations:['online.finding.inspect','online.finding.deliver','online.repair.inspect'],tools:['evopilot_v01_native'],
    steps:['Read the immutable failure and current incident state. Reconcile pending Runtime delivery by retained owner readback before retrying.','Runtime holds a REVIEW_REQUIRED repair candidate, with no requested version, software release or ontology mutation. A warning cannot authorize a patch.','Review the evidence and proposed scope, then use the normal Runtime Target/Run workflow and actual human decisions. Link the finding as context; the candidate is not an approved Target or execution request.','Preserve failed and recovered observations. A recovery closes current incident state without erasing failure history or accepting business semantics.'],
  },
  'online-regression': {
    questions:['Which retained same-policy fault and later recovery observations support this regression?'],owners:['harness'],operations:['online.regression.verify','native.package.put','native.package.validate','native.package.review','native.package.decide','native.package.publish'],tools:['evopilot_v01_native'],
    steps:['Select actual native FAIL then PASS observations from the same immutable binding and policy. Verify the retained comparison, including exact report digests.','The comparison is REVIEW_REQUIRED and does not publish or weaken a rule. Build a new immutable package only if the reviewed change calls for one.','Keep precise source mappings and positive/negative/missing-input cases. A new threshold or policy requires a new binding/review; old evidence is unchanged.','Online observations cannot silently rewrite Ontology or project semantics.'],
  },
  'online-recovery': {
    questions:['Which owned worker, retained window or verified backup requires recovery?'],owners:['harness','runtime'],operations:['online.binding.select','online.binding.inspect','online.receipt.inspect','online.observation.inspect'],tools:['evopilot_v01_online_worker','evopilot_v01_workspace_backup','evopilot_v01_workspace_restore','evopilot_v01_native'],
    steps:['Deselect a binding to stop its schedule, or explicitly stop/uninstall the owned Workspace worker. Chat deactivation does not stop it. Preserve other processes and evidence.','Stop the independent worker before backup, restore, relocation, upgrade or toolchain maintenance. Existing selected schedules and watermarks are persisted; restored configuration does not start a worker automatically.','Online writes require database marker 4. Older readers must reject it; rollback uses a matching pre-upgrade backup/installation. Preserve external credential files separately.','After interruption, inspect the same pending window. Read-only measurement may resume for that window; completed results are immutable. Never replay a business Run to clear an online diagnostic.'],
  },
  onboarding: {
    questions: ['What outcome and project scope do you want?', 'Do you have an existing Workspace or want a personal one initialized?'],
    owners: ['runtime', 'ontology', 'harness'], operations: ['workspace.inspect', 'standard.inspect', 'project.list'],
    tools: ['evopilot_v01_workspace_inspect', 'evopilot_v01_workspace_initialize', 'evopilot_v01_toolchain_inspect', 'evopilot_v01_toolchain_prepare', 'evopilot_v01_activate'],
    steps: ['Discovery and guide-only requests stay passive. A request to start using the selected plugin authorizes initialization without a redundant enable question.', 'Initialize or explicitly attach separate editable project and protected state directories. Do not require GitHub login or overwrite an occupied directory.', 'Inspect the pinned local native toolchain; if absent, explain its bounded downloads and use explicit toolchain_prepare as part of the requested native task. It deactivates this session and returns a retained preparation status. Inspect with backoff; do not repeat a RUNNING/UNKNOWN request. Activate only after ready=true and read actual owner standard digests.', 'An active peer chat does not activate this chat. Inspect exact versions and scope; do not select latest assets implicitly.'],
  },
  'ontology-forward': {
    questions: ['Which requirements define the concepts, relationships and constraints?', 'Which business assumptions remain unresolved?'],
    owners: ['ontology', 'runtime'], operations: ['standard.inspect', 'native.package.put', 'native.package.validate', 'native.package.review', 'native.package.decide', 'native.package.publish'],
    tools: ['evopilot_v01_native_project', 'evopilot_v01_native'],
    steps: ['Prepare a complete dedicated requirements snapshot and independent scope before generating assets. Freeze only the exact scope actually reviewed by the user.', 'Author RDF/Turtle model and instances, SHACL shapes, positive and exact failing cases, source bindings and coverage using current specifications/v1.', 'Materialize in the isolated candidate directory and validate through the actual native owner. Preserve observed facts, inferred mappings and unresolved semantics separately.', 'Review concrete assets before recording a real human decision. Native conformance is not business confirmation. A forward design-stage result does not claim implemented or production behavior.'],
  },
  'ontology-reverse': {
    questions: ['Which exact source revision and modules are in scope?', 'Which observed facts support each inferred domain meaning?'],
    owners: ['ontology', 'harness', 'runtime'], operations: ['standard.inspect', 'native.package.put', 'native.package.validate', 'native.package.review', 'native.package.decide', 'native.package.publish'],
    tools: ['evopilot_v01_native_project', 'evopilot_v01_native'],
    steps: ['Inventory the complete fixed clean Git revision and all build modules, independently of existing assets. Use a separate checkout for an old revision; preserve business source and refs.', 'Freeze independent required IDs, cases, capabilities and explained exclusions before generating assets. Do not derive the denominator from generated coverage or successful reports.', 'Extract native Turtle/SHACL and Rego from actual sources. Bind each mapping to source path, revision, full file hash and precise line/JSON fragment; inferred mappings require a rationale and exact domain review.', 'Materialize each round in its isolated candidate directory. Check native owner results and exact project layout. Neither conversion of an old JSON model nor an old PASS proves corrected-v1 conformance.', 'On later changes, create a new reviewed candidate and revalidate or justify immutable asset reuse. No real-time background synchronization or automatic version release.'],
  },
  'harness-quality': {
    questions: ['Which actual delivery requirements and evidence are required?', 'What approved collection command and output selectors produce that evidence?'],
    owners: ['harness', 'runtime'], operations: ['native.package.put', 'native.package.validate', 'native.package.review', 'native.package.decide', 'native.package.publish', 'collection.prepare', 'collection.decide', 'collection.execute', 'collection.inspect'],
    tools: ['evopilot_v01_native', 'evopilot_v01_native_project'],
    steps: ['Author native Rego v1 rules, parameters, rule catalog, mandatory positive/negative/missing-input cases and precise source mappings. Use the bundled bounded capabilities and pinned OPA/Conftest toolchain.', 'Prepare an isolated execution binding and review the exact collection recipe. Invoke only supported configured executables, preserve exit code, stdout/stderr and raw reports, and derive observations through declared selectors.', 'The currently exposed installed collection binding supports Node. Unsupported executables or remote-network requirements need a verified implementation; do not substitute invented output.', 'Validate through the owner using real protected collection evidence when the requirement says execution-result. Synthetic/imported evidence cannot replace it. Missing required results and Warning prevent project completion; they do not authorize a patch release.'],
  },
  'runtime-handoff': {
    questions: ['Which frozen project candidate and exact published native asset versions apply?', 'Which collection and exact human decisions support this Run?'],
    owners: ['runtime', 'ontology', 'harness'], operations: ['project.prepare', 'collection.prepare', 'collection.decide', 'collection.execute', 'run.prepare', 'run.decide', 'run.dispatch', 'run.inspect', 'project.validate', 'project.complete'],
    tools: ['evopilot_v01_native', 'evopilot_v01_native_project'],
    steps: ['Use corrected-v1 native envelopes and exact owner standard/contract digests. Resolve published native references; a legacy six-field reference cannot attest corrected-v1.', 'Bind independent requirements, source inventory, exact owner packages, effective parameters and protected collection receipts to the Runtime candidate.', 'Review and decide the concrete Run, then dispatch once. Read both owner receipts. Runtime execution success, quality conformance and domain acceptance are separate.', 'Record domain review for exact assets, source bindings and inferred mappings; project.validate must account for every fixed criterion/variant. Only then can project.complete record a real completion decision.', 'Private Goal/Target/Loop notes explain progress; campaign.write and a caller-supplied PASS cannot replace the protected completion record. Routine onboarding does not edit product Roadmaps or source.'],
  },
  recovery: {
    questions: ['Which exact owner, scope, candidate, claim and request ID were retained?'],
    owners: ['runtime', 'harness', 'ontology'], operations: ['receipt.inspect', 'native.receipt.inspect', 'run.inspect', 'run.reconcile', 'collection.inspect', 'collection.reconcile'],
    tools: ['evopilot_v01_native'],
    steps: ['Inspect the original retained receipt after UNKNOWN, timeout or disconnect. Reconcile only actual protected evidence; never redispatch, refresh CAS or invent a replacement request ID.', 'Retain partial raw output and actual error status. Source, package, configuration or toolchain drift invalidates the old approval and requires a new reviewed candidate.', 'Use supported stopped-state backup and recovery. Preserve new native state before rollback; an old reader must reject new state rather than silently misinterpret it.', 'Historical documents and deliveries remain readable with their original standards and do not establish current conformance. Deactivation affects this chat only.'],
  },
  'runtime-feedback': {
    questions: ['Which registered project candidate and source revision should receive feedback?'],
    owners: ['runtime', 'harness', 'ontology'], operations: ['feedback.inspect', 'feedback.configure', 'feedback.list', 'feedback.read', 'feedback.deliver', 'feedback.refresh'],
    tools: ['evopilot_v01_native'],
    steps: ['Inspect the selected chat, Workspace and exact project candidate. Configure feedback explicitly through Runtime; ordinary or unregistered Host work is not captured.', 'Registered terminal Run receipts and pending delivery are committed together. Runtime attempts bounded delivery to both owners; use feedback.read to distinguish delivered, pending and reviewed.', 'If a response is lost, inspect the original Run and retained owner inbox before resuming feedback delivery. Delivery never redispatches the Run. A terminal pending delivery may use a new delivery request after diagnosis; it keeps the same event and candidate IDs.', 'The automatic steps capture evidence and reconcile receipts. They do not approve domain meaning, publish assets or release software.'],
  },
  'asset-feedback-review': {
    questions: ['Does the concrete evidence require a new asset delivery or justify reuse?', 'Which source-linked semantic or regression changes need a human decision?'],
    owners: ['ontology', 'harness', 'runtime'], operations: ['feedback.list', 'feedback.read', 'feedback.propose', 'feedback.decide', 'feedback.refresh', 'project.validate', 'project.complete'],
    tools: ['evopilot_v01_native', 'evopilot_v01_native_project'],
    steps: ['Locate the private owner inbox via feedback.list/read. Harness owns regression candidates; Ontology owns semantic-impact candidates. Read pinned source, observation, both owner results and cause ID.', 'REUSE requires the exact published reference and a rationale. DELIVER requires a new immutable native package that has passed its author/validate/review/decision/publish lifecycle, with source-linked changes. Record relation, cardinality and deprecation impacts explicitly. Only the current pinned Harness dependency is inspected, not a global dependency graph.', 'Present the exact proposal and review digest for the real human decision. Synthetic test decisions and blanket execution permission cannot approve project semantics.', 'Refresh both owner dispositions. Completion requires both approvals and a passing Run that evaluated those exact final asset references. If assets changed, prepare and review a new Run; preserve failed RC evidence.'],
  },
  'feedback-recovery': {
    questions: ['Which event, request and owner receipt were retained?', 'Which verified backup and installation match the state being recovered?'],
    owners: ['runtime', 'harness', 'ontology'], operations: ['feedback.inspect', 'feedback.list', 'feedback.read', 'feedback.deliver', 'feedback.refresh', 'run.inspect'],
    tools: ['evopilot_v01_native', 'evopilot_v01_workspace_backup', 'evopilot_v01_workspace_restore'],
    steps: ['Reopen the same Workspace and inspect retained event and owner receipts. No Codex-wide interception or always-on delivery worker exists in v0.4.', 'Do not change event identity or repeat Run execution to clear pending feedback. Diagnose timeout, source drift, wrong scope or stale review using the retained error code.', 'Stop older connections before upgrade. The first feedback write advances the database schema to 3. Older readers must reject it; rollback uses a matching pre-upgrade backup and installation.', 'Back up project files and all owner state consistently through supported maintenance. Asset Git history alone cannot recover Run claims or feedback receipts.'],
  },
  'retained-ontology': {
    questions: ['Which historical source, asset, receipt or delivery must be read?'],
    owners: ['ontology'], operations: ['source.list', 'source.inspect', 'asset.inspect', 'receipt.inspect'],
    tools: ['evopilot_v01_request'],
    steps: ['Use historical read operations only. Retained JSON assets, Packs, classification and Catalog records preserve their original semantics and evidence.', 'New work uses native packages and current v1 standards. Do not revive retired authoring or classification write flows; historical approval is not corrected-v1 approval.'],
  },
};
const nativeScenarios: Record<string, { guide: keyof typeof guides; title: string; tests: string[] }> = {
  'V05-U01':{guide:'online-setup',title:'Reviewed service binding and explicit online setup',tests:['projects/evopilot-harness/tests/e2e/online-profile.test.mjs','projects/evopilot-harness/tests/e2e/online-owner.test.mjs','integration/e2e/online-worker.test.mjs']},
  'V05-U02':{guide:'online-observe',title:'Measured native evaluation and authenticated alert inspection',tests:['projects/evopilot-harness/tests/e2e/online-prometheus.test.mjs','projects/evopilot-harness/tests/e2e/online-owner.test.mjs']},
  'V05-U03':{guide:'online-repair',title:'Trusted findings become reviewable Runtime repair candidates',tests:['integration/e2e/online-feedback.test.mjs']},
  'V05-U04':{guide:'online-regression',title:'Retained fault and correction regression comparison',tests:['projects/evopilot-harness/tests/e2e/online-owner.test.mjs']},
  'V05-U05':{guide:'online-recovery',title:'Supervised restart, stop and maintenance boundary',tests:['integration/e2e/online-worker.test.mjs']},
  'V04-U01': { guide: 'runtime-feedback', title: 'Registered Run feedback and retained delivery', tests: ['integration/e2e/feedback.test.mjs'] },
  'V04-U02': { guide: 'asset-feedback-review', title: 'Reviewed regression and semantic-impact delivery', tests: ['integration/e2e/feedback.test.mjs'] },
  'V04-U03': { guide: 'feedback-recovery', title: 'Feedback restart, history and backup recovery', tests: ['integration/e2e/feedback.test.mjs'] },
  'V03-U01': { guide: 'onboarding', title: 'Passive selection, Workspace and pinned toolchain', tests: ['integration/e2e/plugin.test.mjs', 'integration/e2e/native-toolchain.test.mjs', 'integration/e2e/native-connection.test.mjs'] },
  'V03-U02': { guide: 'ontology-forward', title: 'Forward requirements and native project contract', tests: ['integration/e2e/native-project.test.mjs'] },
  'V03-U03': { guide: 'ontology-reverse', title: 'Reverse extraction and all visibility/direction combinations', tests: ['integration/e2e/native-project.test.mjs'] },
  'V03-U04': { guide: 'harness-quality', title: 'Actual collection, missing evidence and exact native failures', tests: ['integration/e2e/native-collection.test.mjs', 'integration/e2e/native-composition.test.mjs'] },
  'V03-U05': { guide: 'runtime-handoff', title: 'Exact owner receipts and complete project acceptance', tests: ['integration/e2e/native-composition.test.mjs', 'integration/e2e/native-project.test.mjs'] },
  'V03-U06': { guide: 'recovery', title: 'Source changes, history, no redispatch and retained errors', tests: ['integration/e2e/native-collection.test.mjs', 'integration/e2e/native-project.test.mjs'] },
};
// Guides are pure; installed paths resolve against a verified installationRoot.
export const sourceReferences = Object.freeze(['docs/online-harness.md', 'docs/feedback.md', 'specifications/project/v1/README.md', 'docs/native-workflow.md', 'docs/native-decisions.md', 'docs/first-journey.md', 'docs/product-composition.md', 'projects/evopilot-ontology/docs/service.md', 'projects/evopilot-ontology/docs/classification-service.md', 'projects/evopilot-ontology/docs/legacy-api.md', 'projects/evopilot-ontology/docs/catalog-service.md', 'projects/evopilot-ontology/specifications/', 'projects/evopilot-ontology/schemas/', 'projects/evopilot-harness/specifications/', 'projects/evopilot-harness/docs/service.md', 'projects/evopilot-runtime/docs/service.md']);
export const installedReference = (reference: string) => reference.replace(/^projects\/evopilot-(runtime|harness|ontology)\//, 'node_modules/@evopilot-next/$1/');
export const scenarios = Object.freeze([...Object.keys(guides), ...Object.keys(nativeScenarios), ...scenarioIds]);
export function getGuide(scenario: string) {
  const detail = scenarioIds.some(id => id === scenario) ? getScenario(scenario) : null;
  const native = Object.hasOwn(nativeScenarios, scenario) ? nativeScenarios[scenario] : null;
  const guideName = native?.guide ?? detail?.guide ?? scenario;
  if (!Object.hasOwn(guides, guideName)) throw Object.assign(new Error('Unknown scenario'), { code: 'INVALID_REQUEST' });
  return structuredClone({
    scenario, guideName, ...guides[guideName], authority: false,
    ...(native ? { useCase: { id: scenario, ...native, acceptance: 'NOT_INFERRED' } } : detail ? { useCase: { ...detail, historicalReadOnly: true, operations: guides[guideName].operations, expectedOutputs: ['Historical scenario context only; use the current native guide for new work.'] } } : { useCases: Object.entries(nativeScenarios).filter(([,item]) => item.guide === guideName).map(([id,item]) => ({ id, title: item.title })) }),
    scenarioReferences: ['docs/expert-scenarios.md'],
    firstWhenActive: ['evopilot_v01_capabilities', 'evopilot_v01_native: owner workspace.inspect, standard.inspect and exact scoped records'],
    rules: [
      'Resolve installedReferences against inspect.connection.identity.installationRoot, not the plugin cache or current working directory. Read the referenced installed guide before operating.',
      'Ask only unresolved questions; explain user choices without asking users to author raw schema or digests.',
      'Native references additionally bind producer, contractDigest and owner standardDigest/standardLockDigest. A v1 label alone proves no conformance.',
      'Respect public/private and exact project scope. Public visibility is not permission to upload; private material cannot feed public consumers.',
      'Extensions are inert namespaced data; unknown required extensions block use. Child schemas/templates are authoritative.',
      'Every mutation uses an explicit requestId and expectedRevision; owner validates operational payloads. No automatic CAS refresh or replay.',
      'Honor real human APPROVE/REJECT decisions on the current review. Never invent humanEvidenceRef or other evidence references. For new native decisions, use docs/native-decisions.md: a digest-pinned local evidence record and authorization source, bound to the exact owner, operation, workspace, scope and review. File integrity does not authenticate a human; only record authorization actually received.',
      'Model output, calculation, tests and delivery are not approval, acceptance or release authority.',
      'Use synthetic acceptance fixtures only when validation with synthetic data was explicitly requested.',
    ],
    references: sourceReferences,
    sourceReferences,
    installedReferences: sourceReferences.map(installedReference),
    referenceBases: { references: 'source checkout root', installedReferences: 'verified installationRoot' },
  });
}
