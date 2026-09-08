import { createHash } from "node:crypto";

export const EVOLUTION_PROJECT_DEFINITION_SCHEMA = "evopilot-evolution-project-definition/v1" as const;
export const HARNESS_EXECUTION_BINDING_SCHEMA = "evopilot-harness-execution-binding/v1" as const;
export const HARNESS_MATCH_RESULT_SCHEMA = "evopilot-harness-match-result/v1" as const;
export const HARNESS_LIFECYCLE_COMPOSITION_SCHEMA = "evopilot-harness-lifecycle-composition/v1" as const;
export const RECOVERY_DECISION_SCHEMA = "evopilot-recovery-decision/v1" as const;
export const AUTOMATION_RULE_PROPOSAL_SCHEMA = "evopilot-automation-rule-proposal/v1" as const;
export const AUTOMATION_RULE_SCHEMA = "evopilot-automation-rule/v1" as const;
export const HUMAN_INTERACTION_PROTOCOL_SCHEMA = "evopilot-human-interaction-protocol/v1" as const;
export const AGENT_HOST_PROFILE_SCHEMA = "evopilot-agent-host-profile/v1" as const;
export const EXECUTION_RUNTIME_PROFILE_SCHEMA = "evopilot-execution-runtime-profile/v1" as const;
export const LEGACY_SUITE_SNAPSHOT_SCHEMA = "evopilot-legacy-suite-snapshot/v1" as const;
export const LEGACY_SUITE_SNAPSHOT_COMPARISON_SCHEMA = "evopilot-legacy-suite-snapshot-comparison/v1" as const;
export const LEGACY_SUITE_ISOLATION_PROOF_SCHEMA = "evopilot-legacy-suite-isolation-proof/v1" as const;

export type ProjectSourceProvider = "github" | "gitlab" | "local-git";
export type ProjectDeliveryModel = "open-source" | "enterprise-internal" | "private-service" | "library" | "documentation";

export interface EvolutionProjectDefinition {
  schema: typeof EVOLUTION_PROJECT_DEFINITION_SCHEMA;
  metadata: {
    id: string;
    name: string;
    version: string;
    labels: Record<string, string>;
  };
  spec: {
    source: {
      provider: ProjectSourceProvider;
      repository: string;
      defaultBranch: string;
      mode: "owned" | "read-only" | "fork";
      credentialRef?: string;
    };
    ecosystem: {
      languages: string[];
      packageManagers: string[];
      frameworks: string[];
    };
    delivery: {
      model: ProjectDeliveryModel;
      ciProvider: string;
      candidateBeforeAcceptance: boolean;
      noRebuildPromotion: boolean;
      channels: string[];
    };
    environment: {
      development: string;
      acceptance: string;
      production?: string;
    };
    policyRefs: string[];
    lifecycleRefs: string[];
    secretRefs: string[];
    hostPreferences: string[];
    runtimePreferences: string[];
    evidenceSources: string[];
  };
  digest: string;
}

export interface GoalTargetContext {
  projectId: string;
  goalId: string;
  targetId: string;
  objective: string;
  taskClass: string;
  domain?: string;
  requiredCapabilities: string[];
  labels?: Record<string, string>;
}

export interface PublishedHarnessCandidate {
  profile: {
    id: string;
    version: string;
    digest: string;
    catalogId: string;
    catalogDigest: string;
    domains: string[];
    taskClasses: string[];
    positiveConcepts: string[];
    negativeConcepts: string[];
    requiredProjectLabels?: Record<string, string>;
  };
  bundle: {
    id: string;
    version: string;
    digest: string;
    profileDigest: string;
    componentDigests: string[];
    requiredEvidence: string[];
    validators: string[];
    constraints: string[];
    capabilities: string[];
    permissions: string[];
  };
  published: boolean;
  eligible: boolean;
  priority?: number;
}

export interface HarnessMatchCandidateResult {
  profileId: string;
  profileVersion: string;
  bundleId: string;
  bundleVersion: string;
  score: number;
  eligible: boolean;
  reasons: string[];
  rejectionReasons: string[];
}

export interface HarnessMatchResult {
  schema: typeof HARNESS_MATCH_RESULT_SCHEMA;
  status: "MATCHED" | "AMBIGUOUS" | "ABSTAINED";
  projectDigest: string;
  goalTargetDigest: string;
  selected?: PublishedHarnessCandidate;
  candidates: HarnessMatchCandidateResult[];
  reason: string;
  digest: string;
}

export interface LifecycleObligations {
  lifecycleId: string;
  lifecycleVersion: string;
  lifecycleDigest: string;
  requiredEvidence: string[];
  validators: string[];
  constraints: string[];
  capabilities: string[];
  requestedPermissions: string[];
  disabledHarnessEvidence?: string[];
  disabledHarnessValidators?: string[];
  weakenedHarnessConstraints?: string[];
}

export interface HarnessLifecycleComposition {
  schema: typeof HARNESS_LIFECYCLE_COMPOSITION_SCHEMA;
  status: "COMPOSED" | "CONFLICT";
  harnessBundleDigest: string;
  lifecycleRef: { id: string; version: string; digest: string };
  lifecycleDigest: string;
  requiredEvidence: string[];
  validators: string[];
  constraints: string[];
  capabilities: string[];
  permissions: string[];
  conflicts: string[];
  digest: string;
}

export interface HarnessExecutionBindingInput {
  projectDefinition: EvolutionProjectDefinition;
  goalTarget: GoalTargetContext;
  match: HarnessMatchResult;
  composition: HarnessLifecycleComposition;
  policyDigest: string;
  providerDigest: string;
  environmentDigest: string;
  hostDigest: string;
  runtimeDigest: string;
  authorityDigest: string;
  evidenceDigest: string;
}

export interface HarnessExecutionBinding {
  schema: typeof HARNESS_EXECUTION_BINDING_SCHEMA;
  projectDefinitionRef: { id: string; version: string; digest: string };
  projectDefinitionDigest: string;
  goalTargetRef: { goalId: string; targetId: string; digest: string };
  goalTargetDigest: string;
  catalogId: string;
  catalogDigest: string;
  profileRef: { id: string; version: string; digest: string };
  bundleRef: { id: string; version: string; digest: string; componentDigests: string[] };
  lifecycleRef: { id: string; version: string; digest: string };
  compositionDigest: string;
  policyDigest: string;
  providerDigest: string;
  environmentDigest: string;
  hostDigest: string;
  runtimeDigest: string;
  authorityDigest: string;
  evidenceDigest: string;
  revalidateAt: Array<"start" | "resume" | "retry" | "loop-iteration">;
  digest: string;
}

export interface HarnessExecutionCurrentState {
  projectDefinitionDigest: string;
  goalTargetDigest: string;
  catalogDigests: Record<string, string>;
  profiles: Array<{ id: string; version: string; digest: string }>;
  bundles: Array<{ id: string; version: string; digest: string; componentDigests: string[] }>;
  lifecycleDigest: string;
  compositionDigest: string;
  policyDigest: string;
  providerDigest: string;
  environmentDigest: string;
  hostDigest: string;
  runtimeDigest: string;
  authorityDigest: string;
  evidenceDigest: string;
}

export type RecoveryFailureClass = "DETERMINISTIC_MECHANICS" | "TRANSIENT" | "EXTERNAL_SAFE_RETRY" | "UNKNOWN" | "UNCERTAIN_MUTATION" | "AUTHORITY_REQUIRED";

export interface RecoveryContext {
  failureClass: RecoveryFailureClass;
  failureSignature: string;
  bindingDigest: string;
  attempt: number;
  maxAttempts: number;
  mutationReceipt?: string;
  identicalInputs: boolean;
  reversible: boolean;
  externalEffect: boolean;
  projectId?: string;
  lifecycleId?: string;
  actionId?: string;
  hostId?: string;
}

export interface RecoveryDecision {
  schema: typeof RECOVERY_DECISION_SCHEMA;
  action: "AUTO_REPAIR" | "AUTO_RETRY" | "RESUME_FROM_RECEIPT" | "PROPOSE_AUTOMATION_RULE" | "HUMAN_DECISION" | "FAIL";
  humanRequired: boolean;
  reason: string;
  remainingBudget: number;
  bindingDigest: string;
  digest: string;
}

export interface AutomationRuleProposal {
  schema: typeof AUTOMATION_RULE_PROPOSAL_SCHEMA;
  id: string;
  failureSignature: string;
  failureClass: RecoveryFailureClass;
  scope: { projectId?: string; lifecycleId?: string; actionId?: string; hostId?: string };
  strategy: "REPAIR_THEN_RETRY" | "RETRY" | "RESUME_FROM_RECEIPT";
  maxAttempts: number;
  preconditions: string[];
  prohibitedEffects: string[];
  expiresAt?: string;
  digest: string;
}

export interface AutomationRule extends Omit<AutomationRuleProposal, "schema" | "digest"> {
  schema: typeof AUTOMATION_RULE_SCHEMA;
  proposalDigest: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  approvedBy: string;
  approvalEvidenceRef: string;
  approvedAt: string;
  revision: number;
  digest: string;
}

export interface HumanInteractionMessage {
  schema: typeof HUMAN_INTERACTION_PROTOCOL_SCHEMA;
  protocolVersion: "1.0";
  interactionId: string;
  sessionDigest: string;
  kind: "HELP" | "QUESTION" | "PLAN" | "PROGRESS" | "DECISION" | "RECOVERY" | "EVIDENCE" | "RESULT" | "COMPATIBILITY_ERROR";
  authority: "NONE" | "EXACT_HUMAN_DECISION";
  title: string;
  summary: string;
  details: string[];
  options?: Array<{ id: string; label: string; consequence: string }>;
  inputSchema?: Record<string, unknown>;
  nextAction?: string;
  objectRefs: Array<{ kind: string; id: string; digest?: string }>;
  digest: string;
}

export interface AgentHostProfile {
  schema: typeof AGENT_HOST_PROFILE_SCHEMA;
  id: string;
  version: string;
  protocolVersions: string[];
  capabilities: string[];
  interactionModes: Array<"skill" | "mcp" | "cli" | "api">;
  digest: string;
}

export interface ExecutionRuntimeProfile {
  schema: typeof EXECUTION_RUNTIME_PROFILE_SCHEMA;
  id: string;
  version: string;
  provider: string;
  model: string;
  capabilities: string[];
  permissionMode: "HOST_MANAGED_DENY_UNDECLARED";
  digest: string;
}

export interface LegacySuiteSnapshot {
  schema: typeof LEGACY_SUITE_SNAPSHOT_SCHEMA;
  suiteId: string;
  sourceIdentity: string;
  version: string;
  treeDigest: string;
  skillAndRuleInventory: Array<{ path: string; digest: string }>;
  capturedAt: string;
  comparisonCorpusDigest: string;
  readOnly: true;
  digest: string;
}

export interface LegacySuiteSnapshotComparison {
  schema: typeof LEGACY_SUITE_SNAPSHOT_COMPARISON_SCHEMA;
  suiteId: string;
  baselineDigest: string;
  currentDigest: string;
  status: "CURRENT" | "STALE";
  changedBindings: string[];
  selectiveRerunEvidenceRefs: string[];
  digest: string;
}

export interface LegacySuiteIsolationProof {
  schema: typeof LEGACY_SUITE_ISOLATION_PROOF_SCHEMA;
  environment: "ISOLATED_CANDIDATE";
  absentSuiteIds: string[];
  legacySuiteInvocationCount: 0;
  loadedPaths: string[];
  realInstalledSuiteMutations: [];
  status: "INDEPENDENT";
  digest: string;
}

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SECRET_KEY = /(?:password|token|secret|api[-_]?key|private[-_]?key|credential)/i;

export function normalizeEvolutionProjectDefinition(value: Omit<EvolutionProjectDefinition, "digest"> & { digest?: string }): EvolutionProjectDefinition {
  if (value.schema !== EVOLUTION_PROJECT_DEFINITION_SCHEMA) throw new Error("EVOLUTION_PROJECT_SCHEMA_UNSUPPORTED");
  requireText(value.metadata?.id, "metadata.id");
  requireText(value.metadata?.name, "metadata.name");
  requireText(value.metadata?.version, "metadata.version");
  if (!/^[A-Za-z0-9._-]+$/.test(value.metadata.id)) throw new Error("EVOLUTION_PROJECT_ID_INVALID");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.metadata.version)) throw new Error("EVOLUTION_PROJECT_VERSION_INVALID");
  requireText(value.spec?.source?.repository, "spec.source.repository");
  requireText(value.spec?.source?.defaultBranch, "spec.source.defaultBranch");
  if (!value.spec.delivery.candidateBeforeAcceptance) throw new Error("PROJECT_CANDIDATE_BEFORE_ACCEPTANCE_REQUIRED");
  if (!value.spec.delivery.noRebuildPromotion) throw new Error("PROJECT_NO_REBUILD_PROMOTION_REQUIRED");
  for (const secretRef of value.spec.secretRefs) {
    if (!/^(?:secret|env|vault):\/\/[A-Za-z0-9._/-]+$/.test(secretRef)) throw new Error("PROJECT_SECRET_REF_INVALID");
  }
  rejectRawSecrets(value);
  const material = {
    schema: value.schema,
    metadata: {
      ...value.metadata,
      labels: sortedRecord(value.metadata.labels ?? {})
    },
    spec: {
      ...value.spec,
      ecosystem: {
        languages: unique(value.spec.ecosystem.languages),
        packageManagers: unique(value.spec.ecosystem.packageManagers),
        frameworks: unique(value.spec.ecosystem.frameworks)
      },
      delivery: { ...value.spec.delivery, channels: unique(value.spec.delivery.channels) },
      policyRefs: unique(value.spec.policyRefs),
      lifecycleRefs: unique(value.spec.lifecycleRefs),
      secretRefs: unique(value.spec.secretRefs),
      hostPreferences: unique(value.spec.hostPreferences),
      runtimePreferences: unique(value.spec.runtimePreferences),
      evidenceSources: unique(value.spec.evidenceSources)
    }
  };
  const digest = canonicalDigest(material);
  if (value.digest && value.digest !== digest) throw new Error("EVOLUTION_PROJECT_DIGEST_MISMATCH");
  return { ...material, digest };
}

export function resolvePublishedHarness(input: {
  project: EvolutionProjectDefinition;
  goalTarget: GoalTargetContext;
  candidates: PublishedHarnessCandidate[];
}): HarnessMatchResult {
  assertDigest(input.project.digest, "project.digest");
  const context = canonicalText([
    input.project.metadata.id,
    input.project.metadata.name,
    ...Object.entries(input.project.metadata.labels).flat(),
    ...input.project.spec.ecosystem.languages,
    ...input.project.spec.ecosystem.packageManagers,
    ...input.project.spec.ecosystem.frameworks,
    input.project.spec.delivery.model,
    input.goalTarget.objective,
    input.goalTarget.taskClass,
    input.goalTarget.domain ?? "",
    ...input.goalTarget.requiredCapabilities,
    ...Object.entries(input.goalTarget.labels ?? {}).flat()
  ]);
  const candidates = input.candidates.map((candidate) => scoreCandidate(candidate, input.project, input.goalTarget, context))
    .sort((left, right) => right.result.score - left.result.score || right.priority - left.priority || left.result.profileId.localeCompare(right.result.profileId));
  const eligible = candidates.filter((candidate) => candidate.result.eligible && candidate.result.score > 0);
  const top = eligible[0];
  const second = eligible[1];
  const ambiguous = Boolean(top && second && top.result.score === second.result.score && top.priority === second.priority);
  const base = {
    schema: HARNESS_MATCH_RESULT_SCHEMA,
    projectDigest: input.project.digest,
    goalTargetDigest: canonicalDigest(input.goalTarget),
    candidates: candidates.map((candidate) => candidate.result)
  };
  if (!top) return withDigest({ ...base, status: "ABSTAINED" as const, reason: "No eligible published immutable HarnessBundle matched Project plus GoalTarget context." });
  if (ambiguous) return withDigest({ ...base, status: "AMBIGUOUS" as const, reason: `Top candidates are tied at score=${top.result.score}; explicit project declaration or Catalog policy is required.` });
  return withDigest({ ...base, status: "MATCHED" as const, selected: top.candidate, reason: `Selected ${top.candidate.bundle.id}@${top.candidate.bundle.version} from deterministic Project plus GoalTarget ranking.` });
}

export function composeHarnessAndLifecycle(bundle: PublishedHarnessCandidate["bundle"], lifecycle: LifecycleObligations): HarnessLifecycleComposition {
  assertDigest(bundle.digest, "bundle.digest");
  assertDigest(lifecycle.lifecycleDigest, "lifecycle.digest");
  const conflicts = unique([
    ...(lifecycle.disabledHarnessEvidence ?? []).filter((item) => bundle.requiredEvidence.includes(item)).map((item) => `required-evidence-disabled:${item}`),
    ...(lifecycle.disabledHarnessValidators ?? []).filter((item) => bundle.validators.includes(item)).map((item) => `required-validator-disabled:${item}`),
    ...(lifecycle.weakenedHarnessConstraints ?? []).filter((item) => bundle.constraints.includes(item)).map((item) => `required-constraint-weakened:${item}`),
    ...lifecycle.requestedPermissions.filter((permission) => !bundle.permissions.includes(permission)).map((permission) => `permission-outside-harness:${permission}`),
    ...lifecycle.capabilities.filter((capability) => !bundle.capabilities.includes(capability)).map((capability) => `capability-outside-harness:${capability}`)
  ]);
  const material = {
    schema: HARNESS_LIFECYCLE_COMPOSITION_SCHEMA,
    status: conflicts.length ? "CONFLICT" as const : "COMPOSED" as const,
    harnessBundleDigest: bundle.digest,
    lifecycleRef: { id: lifecycle.lifecycleId, version: lifecycle.lifecycleVersion, digest: lifecycle.lifecycleDigest },
    lifecycleDigest: lifecycle.lifecycleDigest,
    requiredEvidence: unique([...bundle.requiredEvidence, ...lifecycle.requiredEvidence]),
    validators: unique([...bundle.validators, ...lifecycle.validators]),
    constraints: unique([...bundle.constraints, ...lifecycle.constraints]),
    capabilities: lifecycle.capabilities.filter((capability) => bundle.capabilities.includes(capability)).sort(),
    permissions: lifecycle.requestedPermissions.filter((permission) => bundle.permissions.includes(permission)).sort(),
    conflicts
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function createHarnessExecutionBinding(input: HarnessExecutionBindingInput): HarnessExecutionBinding {
  if (input.projectDefinition.metadata.id !== input.goalTarget.projectId) throw new Error("HARNESS_EXECUTION_PROJECT_GOAL_TARGET_MISMATCH");
  if (input.match.status !== "MATCHED" || !input.match.selected) throw new Error(`HARNESS_MATCH_${input.match.status}`);
  if (input.composition.status !== "COMPOSED") throw new Error(`HARNESS_LIFECYCLE_CONFLICT: ${input.composition.conflicts.join(", ")}`);
  for (const [name, value] of Object.entries({
    policyDigest: input.policyDigest,
    providerDigest: input.providerDigest,
    environmentDigest: input.environmentDigest,
    hostDigest: input.hostDigest,
    runtimeDigest: input.runtimeDigest,
    authorityDigest: input.authorityDigest,
    evidenceDigest: input.evidenceDigest
  })) assertDigest(value, name);
  const { profile, bundle } = input.match.selected;
  if (bundle.profileDigest !== profile.digest) throw new Error("HARNESS_BUNDLE_PROFILE_DIGEST_MISMATCH");
  if (input.composition.harnessBundleDigest !== bundle.digest) throw new Error("HARNESS_COMPOSITION_BUNDLE_DRIFT");
  const material = {
    schema: HARNESS_EXECUTION_BINDING_SCHEMA,
    projectDefinitionRef: { id: input.projectDefinition.metadata.id, version: input.projectDefinition.metadata.version, digest: input.projectDefinition.digest },
    projectDefinitionDigest: input.projectDefinition.digest,
    goalTargetRef: { goalId: input.goalTarget.goalId, targetId: input.goalTarget.targetId, digest: canonicalDigest(input.goalTarget) },
    goalTargetDigest: canonicalDigest(input.goalTarget),
    catalogId: profile.catalogId,
    catalogDigest: profile.catalogDigest,
    profileRef: { id: profile.id, version: profile.version, digest: profile.digest },
    bundleRef: { id: bundle.id, version: bundle.version, digest: bundle.digest, componentDigests: unique(bundle.componentDigests) },
    lifecycleRef: input.composition.lifecycleRef,
    compositionDigest: input.composition.digest,
    policyDigest: input.policyDigest,
    providerDigest: input.providerDigest,
    environmentDigest: input.environmentDigest,
    hostDigest: input.hostDigest,
    runtimeDigest: input.runtimeDigest,
    authorityDigest: input.authorityDigest,
    evidenceDigest: input.evidenceDigest,
    revalidateAt: ["start", "resume", "retry", "loop-iteration"] as Array<"start" | "resume" | "retry" | "loop-iteration">
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function revalidateHarnessExecutionBinding(binding: HarnessExecutionBinding, current: HarnessExecutionCurrentState): { status: "VALID" | "DRIFTED"; drift: string[]; evidence: string[] } {
  const drift: string[] = [];
  compare("projectDefinitionDigest", binding.projectDefinitionDigest, current.projectDefinitionDigest, drift);
  compare("goalTargetDigest", binding.goalTargetDigest, current.goalTargetDigest, drift);
  compare("catalogDigest", binding.catalogDigest, current.catalogDigests[binding.catalogId], drift);
  const profile = current.profiles.find((item) => item.id === binding.profileRef.id && item.version === binding.profileRef.version);
  compare("profileDigest", binding.profileRef.digest, profile?.digest, drift);
  const bundle = current.bundles.find((item) => item.id === binding.bundleRef.id && item.version === binding.bundleRef.version);
  compare("bundleDigest", binding.bundleRef.digest, bundle?.digest, drift);
  compare("componentDigests", canonicalDigest(binding.bundleRef.componentDigests), bundle ? canonicalDigest(unique(bundle.componentDigests)) : undefined, drift);
  for (const field of ["lifecycleDigest", "compositionDigest", "policyDigest", "providerDigest", "environmentDigest", "hostDigest", "runtimeDigest", "authorityDigest", "evidenceDigest"] as const) {
    const expected = field === "lifecycleDigest" ? binding.lifecycleRef.digest : binding[field];
    compare(field, expected, current[field], drift);
  }
  return {
    status: drift.length ? "DRIFTED" : "VALID",
    drift,
    evidence: [binding.digest, ...drift.map((item) => `drift=${item}`)]
  };
}

export function decideRecovery(context: RecoveryContext): RecoveryDecision {
  assertDigest(context.bindingDigest, "bindingDigest");
  const remainingBudget = Math.max(0, context.maxAttempts - context.attempt);
  let action: RecoveryDecision["action"] = "FAIL";
  let humanRequired = false;
  let reason = "Recovery budget is exhausted.";
  if (context.failureClass === "AUTHORITY_REQUIRED" || context.failureClass === "UNCERTAIN_MUTATION") {
    action = "HUMAN_DECISION";
    humanRequired = true;
    reason = context.failureClass === "UNCERTAIN_MUTATION" ? "External mutation outcome is uncertain and cannot be replayed safely." : "The next action requires authority EvoPilot does not possess.";
  } else if (context.mutationReceipt && context.identicalInputs) {
    action = "RESUME_FROM_RECEIPT";
    reason = "A matching immutable receipt proves the prior mutation outcome.";
  } else if (remainingBudget > 0 && context.failureClass === "DETERMINISTIC_MECHANICS" && context.reversible && !context.externalEffect) {
    action = "AUTO_REPAIR";
    reason = "The deterministic reversible mechanics defect is inside the approved scope.";
  } else if (remainingBudget > 0 && ["TRANSIENT", "EXTERNAL_SAFE_RETRY"].includes(context.failureClass) && context.identicalInputs) {
    action = "AUTO_RETRY";
    reason = "The failure is retryable with identical inputs and remaining bounded budget.";
  } else if (context.failureClass === "UNKNOWN" && context.reversible && !context.externalEffect) {
    action = "PROPOSE_AUTOMATION_RULE";
    humanRequired = true;
    reason = "Unknown reversible behavior requires one reviewed rule proposal before future automation.";
  }
  return withDigest({ schema: RECOVERY_DECISION_SCHEMA, action, humanRequired, reason, remainingBudget, bindingDigest: context.bindingDigest });
}

export function proposeAutomationRule(input: Omit<AutomationRuleProposal, "schema" | "digest">): AutomationRuleProposal {
  if (input.failureClass === "AUTHORITY_REQUIRED" || input.failureClass === "UNCERTAIN_MUTATION") throw new Error("AUTOMATION_RULE_AUTHORITY_CLASS_FORBIDDEN");
  if (input.maxAttempts < 1 || input.maxAttempts > 5) throw new Error("AUTOMATION_RULE_BUDGET_INVALID");
  if (!input.prohibitedEffects.length) throw new Error("AUTOMATION_RULE_PROHIBITED_EFFECTS_REQUIRED");
  return withDigest({ ...input, schema: AUTOMATION_RULE_PROPOSAL_SCHEMA, preconditions: unique(input.preconditions), prohibitedEffects: unique(input.prohibitedEffects) });
}

export function activateAutomationRule(proposal: AutomationRuleProposal, approval: { proposalDigest: string; actor: string; evidenceRef: string; approvedAt: string }): AutomationRule {
  if (proposal.digest !== approval.proposalDigest) throw new Error("AUTOMATION_RULE_APPROVAL_DIGEST_MISMATCH");
  requireText(approval.actor, "approval.actor");
  requireText(approval.evidenceRef, "approval.evidenceRef");
  const { schema: _schema, digest: proposalDigest, ...definition } = proposal;
  const material = {
    ...definition,
    schema: AUTOMATION_RULE_SCHEMA,
    proposalDigest,
    status: "ACTIVE" as const,
    approvedBy: approval.actor,
    approvalEvidenceRef: approval.evidenceRef,
    approvedAt: approval.approvedAt,
    revision: 1
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function automationRuleApplies(rule: AutomationRule, input: {
  failureSignature: string;
  failureClass: RecoveryFailureClass;
  mutationReceipt?: string;
  identicalInputs: boolean;
  reversible: boolean;
  externalEffect: boolean;
  projectId?: string;
  lifecycleId?: string;
  actionId?: string;
  hostId?: string;
  now: string;
}): boolean {
  if (rule.status !== "ACTIVE" || rule.failureSignature !== input.failureSignature || rule.failureClass !== input.failureClass) return false;
  if (input.failureClass === "AUTHORITY_REQUIRED" || input.failureClass === "UNCERTAIN_MUTATION") return false;
  if (rule.expiresAt && rule.expiresAt <= input.now) return false;
  if (!Object.entries(rule.scope).every(([key, value]) => value === undefined || input[key as keyof typeof input] === value)) return false;
  if (rule.strategy === "REPAIR_THEN_RETRY") return input.reversible && !input.externalEffect;
  if (rule.strategy === "RESUME_FROM_RECEIPT") return Boolean(input.mutationReceipt) && input.identicalInputs;
  return input.identicalInputs && (input.failureClass === "TRANSIENT" || input.failureClass === "EXTERNAL_SAFE_RETRY");
}

export function createHumanInteractionMessage(input: Omit<HumanInteractionMessage, "schema" | "protocolVersion" | "digest">): HumanInteractionMessage {
  requireText(input.interactionId, "interactionId");
  assertDigest(input.sessionDigest, "sessionDigest");
  if (input.authority === "EXACT_HUMAN_DECISION" && input.kind !== "DECISION") throw new Error("INTERACTION_AUTHORITY_KIND_MISMATCH");
  if (input.authority === "EXACT_HUMAN_DECISION" && !input.options?.length) throw new Error("INTERACTION_DECISION_OPTIONS_REQUIRED");
  const material = {
    ...input,
    schema: HUMAN_INTERACTION_PROTOCOL_SCHEMA,
    protocolVersion: "1.0" as const,
    details: [...input.details],
    objectRefs: input.objectRefs.map((item) => ({ ...item }))
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function normalizeAgentHostProfile(value: Omit<AgentHostProfile, "digest"> & { digest?: string }): AgentHostProfile {
  if (value.schema !== AGENT_HOST_PROFILE_SCHEMA) throw new Error("AGENT_HOST_PROFILE_SCHEMA_UNSUPPORTED");
  requireText(value.id, "host.id");
  const material = { ...value, protocolVersions: unique(value.protocolVersions), capabilities: unique(value.capabilities), interactionModes: unique(value.interactionModes) };
  delete material.digest;
  const digest = canonicalDigest(material);
  if (value.digest && value.digest !== digest) throw new Error("AGENT_HOST_PROFILE_DIGEST_MISMATCH");
  return { ...material, digest };
}

export function normalizeExecutionRuntimeProfile(value: Omit<ExecutionRuntimeProfile, "digest"> & { digest?: string }): ExecutionRuntimeProfile {
  if (value.schema !== EXECUTION_RUNTIME_PROFILE_SCHEMA || value.permissionMode !== "HOST_MANAGED_DENY_UNDECLARED") throw new Error("EXECUTION_RUNTIME_PROFILE_INVALID");
  for (const field of [value.id, value.version, value.provider, value.model]) requireText(field, "runtime identity");
  const material = { ...value, capabilities: unique(value.capabilities) };
  delete material.digest;
  const digest = canonicalDigest(material);
  if (value.digest && value.digest !== digest) throw new Error("EXECUTION_RUNTIME_PROFILE_DIGEST_MISMATCH");
  return { ...material, digest };
}

export function normalizeLegacySuiteSnapshot(value: Omit<LegacySuiteSnapshot, "digest"> & { digest?: string }): LegacySuiteSnapshot {
  if (value.schema !== LEGACY_SUITE_SNAPSHOT_SCHEMA || value.readOnly !== true) throw new Error("LEGACY_SUITE_SNAPSHOT_INVALID");
  for (const [field, text] of Object.entries({ suiteId: value.suiteId, sourceIdentity: value.sourceIdentity, version: value.version, capturedAt: value.capturedAt })) requireText(text, field);
  if (!Number.isFinite(Date.parse(value.capturedAt))) throw new Error("LEGACY_SUITE_SNAPSHOT_CAPTURED_AT_INVALID");
  assertDigest(value.treeDigest, "treeDigest");
  assertDigest(value.comparisonCorpusDigest, "comparisonCorpusDigest");
  const skillAndRuleInventory = value.skillAndRuleInventory.map((item) => {
    requireText(item.path, "skillAndRuleInventory.path");
    assertDigest(item.digest, "skillAndRuleInventory.digest");
    return { path: item.path.trim(), digest: item.digest };
  }).sort((left, right) => left.path.localeCompare(right.path) || left.digest.localeCompare(right.digest));
  const duplicate = skillAndRuleInventory.find((item, index) => index > 0 && item.path === skillAndRuleInventory[index - 1].path);
  if (duplicate) throw new Error(`LEGACY_SUITE_SNAPSHOT_DUPLICATE_PATH: ${duplicate.path}`);
  const material = { ...value, skillAndRuleInventory };
  delete material.digest;
  rejectRawSecrets(material);
  const digest = canonicalDigest(material);
  if (value.digest && value.digest !== digest) throw new Error("LEGACY_SUITE_SNAPSHOT_DIGEST_MISMATCH");
  return { ...material, digest };
}

export function compareLegacySuiteSnapshots(input: {
  baseline: LegacySuiteSnapshot;
  current: LegacySuiteSnapshot;
  affectedEvidenceRefs: string[];
}): LegacySuiteSnapshotComparison {
  const baseline = normalizeLegacySuiteSnapshot(input.baseline);
  const current = normalizeLegacySuiteSnapshot(input.current);
  if (baseline.suiteId !== current.suiteId) throw new Error("LEGACY_SUITE_SNAPSHOT_SUITE_MISMATCH");
  const changedBindings: string[] = [];
  compare("sourceIdentity", baseline.sourceIdentity, current.sourceIdentity, changedBindings);
  compare("version", baseline.version, current.version, changedBindings);
  compare("treeDigest", baseline.treeDigest, current.treeDigest, changedBindings);
  compare("skillAndRuleInventory", canonicalDigest(baseline.skillAndRuleInventory), canonicalDigest(current.skillAndRuleInventory), changedBindings);
  compare("comparisonCorpusDigest", baseline.comparisonCorpusDigest, current.comparisonCorpusDigest, changedBindings);
  const material = {
    schema: LEGACY_SUITE_SNAPSHOT_COMPARISON_SCHEMA,
    suiteId: baseline.suiteId,
    baselineDigest: baseline.digest,
    currentDigest: current.digest,
    status: changedBindings.length ? "STALE" as const : "CURRENT" as const,
    changedBindings,
    selectiveRerunEvidenceRefs: changedBindings.length ? unique(input.affectedEvidenceRefs) : []
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function createLegacySuiteIsolationProof(input: {
  environment: "ISOLATED_CANDIDATE";
  expectedAbsentSuiteIds: string[];
  presentSuiteIds: string[];
  legacySuiteInvocationCount: number;
  loadedPaths: string[];
  fallback?: string;
  realInstalledSuiteMutations: string[];
}): LegacySuiteIsolationProof {
  if (input.presentSuiteIds.length > 0) throw new Error(`LEGACY_SUITE_PRESENT_IN_ISOLATED_CANDIDATE: ${unique(input.presentSuiteIds).join(",")}`);
  if (input.realInstalledSuiteMutations.length > 0) throw new Error("REAL_INSTALLED_LEGACY_SUITE_MUTATION_DETECTED");
  assertNoLegacySuiteFallback(input);
  const material = {
    schema: LEGACY_SUITE_ISOLATION_PROOF_SCHEMA,
    environment: input.environment,
    absentSuiteIds: unique(input.expectedAbsentSuiteIds),
    legacySuiteInvocationCount: 0 as const,
    loadedPaths: [...input.loadedPaths].sort(),
    realInstalledSuiteMutations: [] as [],
    status: "INDEPENDENT" as const
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function assertNoLegacySuiteFallback(trace: { legacySuiteInvocationCount: number; loadedPaths: string[]; fallback?: string }): void {
  if (trace.legacySuiteInvocationCount !== 0) throw new Error("LEGACY_SUITE_INVOCATION_DETECTED");
  if (trace.fallback || trace.loadedPaths.some((item) => /(?:datarig|evopilot)[-_ ]codex[-_ ]suite/i.test(item))) throw new Error("LEGACY_SUITE_HIDDEN_FALLBACK_DETECTED");
}

export function canonicalDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function scoreCandidate(candidate: PublishedHarnessCandidate, project: EvolutionProjectDefinition, goal: GoalTargetContext, context: string) {
  const reasons: string[] = [];
  const rejectionReasons: string[] = [];
  if (!candidate.published) rejectionReasons.push("bundle-not-published");
  if (!candidate.eligible) rejectionReasons.push("candidate-policy-ineligible");
  if (candidate.bundle.profileDigest !== candidate.profile.digest) rejectionReasons.push("bundle-profile-digest-mismatch");
  if (!DIGEST.test(candidate.bundle.digest) || !DIGEST.test(candidate.profile.digest) || !DIGEST.test(candidate.profile.catalogDigest)) rejectionReasons.push("invalid-digest-closure");
  for (const [key, expected] of Object.entries(candidate.profile.requiredProjectLabels ?? {})) {
    if (project.metadata.labels[key] !== expected) rejectionReasons.push(`project-label-mismatch:${key}`);
  }
  const negative = candidate.profile.negativeConcepts.filter((item) => context.includes(canonicalText([item])));
  if (negative.length) rejectionReasons.push(...negative.map((item) => `negative-concept:${item}`));
  let score = 0;
  if (goal.domain && candidate.profile.domains.includes(goal.domain)) { score += 120; reasons.push(`domain=${goal.domain}`); }
  if (candidate.profile.taskClasses.includes(goal.taskClass)) { score += 80; reasons.push(`taskClass=${goal.taskClass}`); }
  for (const item of candidate.profile.positiveConcepts) {
    if (context.includes(canonicalText([item]))) { score += 20; reasons.push(`positiveConcept=${item}`); }
  }
  for (const capability of goal.requiredCapabilities) {
    if (candidate.bundle.capabilities.includes(capability)) { score += 10; reasons.push(`capability=${capability}`); }
    else rejectionReasons.push(`missing-capability:${capability}`);
  }
  const result: HarnessMatchCandidateResult = {
    profileId: candidate.profile.id,
    profileVersion: candidate.profile.version,
    bundleId: candidate.bundle.id,
    bundleVersion: candidate.bundle.version,
    score: rejectionReasons.length ? 0 : score,
    eligible: rejectionReasons.length === 0,
    reasons: unique(reasons),
    rejectionReasons: unique(rejectionReasons)
  };
  return { candidate, result, priority: candidate.priority ?? 0 };
}

function rejectRawSecrets(value: unknown, path = "project"): void {
  if (Array.isArray(value)) return value.forEach((item, index) => rejectRawSecrets(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key) && key !== "credentialRef" && key !== "secretRefs") throw new Error(`PROJECT_RAW_SECRET_FIELD_FORBIDDEN: ${path}.${key}`);
    rejectRawSecrets(child, `${path}.${key}`);
  }
}

function compare(field: string, expected: string, actual: string | undefined, drift: string[]): void {
  if (expected !== actual) drift.push(`${field}:expected=${expected};actual=${actual ?? "missing"}`);
}

function canonicalText(values: unknown[]): string {
  return values.map(String).join(" ").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean) as T[])].sort();
}

function sortedRecord(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function withDigest<T extends Record<string, unknown>>(value: T): T & { digest: string } {
  return { ...value, digest: canonicalDigest(value) };
}

function assertDigest(value: string, field: string): void {
  if (!DIGEST.test(value)) throw new Error(`DIGEST_INVALID: ${field}`);
}

function requireText(value: unknown, field: string): void {
  if (typeof value !== "string" || !value.trim()) throw new Error(`FIELD_REQUIRED: ${field}`);
}
