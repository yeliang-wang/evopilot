import { canonicalDigest } from "./governed-evolution.js";

export const CONTROLLED_LIFECYCLE_OBSERVATION_SCHEMA = "evopilot-controlled-lifecycle-observation/v1" as const;
export const LIFECYCLE_GAP_CLASSIFICATION_SCHEMA = "evopilot-lifecycle-gap-classification/v1" as const;
export const LIFECYCLE_SUCCESSOR_PROPOSAL_SCHEMA = "evopilot-lifecycle-successor-proposal/v1" as const;
export const LIFECYCLE_EXPERIMENT_REPORT_SCHEMA = "evopilot-lifecycle-experiment-report/v1" as const;
export const LIFECYCLE_ACTIVATION_DECISION_SCHEMA = "evopilot-lifecycle-activation-decision/v1" as const;
export const LIFECYCLE_MONITORING_DECISION_SCHEMA = "evopilot-lifecycle-monitoring-decision/v1" as const;
export const GENERIC_PRIMITIVE_TARGET_PROPOSAL_SCHEMA = "evopilot-generic-primitive-target-proposal/v1" as const;

export interface ControlledLifecycleContext {
  tenantId: string;
  workspaceId: string;
  projectDefinitionDigest: string;
  lifecycleRevisionDigest: string;
  harnessExecutionBindingDigest: string;
  harnessBundleDigest: string;
  goalTargetDigest: string;
  runtimeDigest: string;
  hostDigest: string;
  providerDigest: string;
  environmentDigest: string;
  authorityDigest: string;
  evaluatorDigest: string;
  scorerDigest: string;
  evidenceDigest: string;
}

export interface ControlledLifecycleSignal {
  id: string;
  kind: "FAILURE" | "REGRESSION" | "USER_FEEDBACK" | "OPPORTUNITY" | "POLICY_DRIFT";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  summary: string;
  evidenceRefs: string[];
  attributes?: Record<string, unknown>;
}

export interface ControlledLifecycleObservation {
  schema: typeof CONTROLLED_LIFECYCLE_OBSERVATION_SCHEMA;
  id: string;
  context: ControlledLifecycleContext;
  signals: ControlledLifecycleSignal[];
  capturedAt: string;
  provenance: { source: "RUNTIME" | "EXPERT_INPUT" | "EVALUATION" | "MONITORING"; sourceRef: string };
  digest: string;
}

export type LifecycleGapClass =
  | "PROJECT_LIFECYCLE_GAP"
  | "PROJECT_RESOURCE_GAP"
  | "GENERIC_RUNTIME_PRIMITIVE_GAP"
  | "EXPERT_GUIDANCE_GAP"
  | "NO_ACTION";

export interface LifecycleGapClassification {
  schema: typeof LIFECYCLE_GAP_CLASSIFICATION_SCHEMA;
  observationDigest: string;
  gapClass: LifecycleGapClass;
  destination: "LIFECYCLE_SUCCESSOR" | "GOVERNED_RESOURCE_SUCCESSOR" | "RUNTIME_TARGET" | "EXPERT_TARGET" | "NONE";
  projectNeutralPrimitiveMissing: boolean;
  projectSpecificCoreBranchAllowed: false;
  activeMutationAllowed: false;
  rationale: string[];
  evidenceRefs: string[];
  digest: string;
}

export interface LifecycleSnapshot {
  id: string;
  version: string;
  digest: string;
  definition: Record<string, unknown>;
}

export interface LifecycleSuccessorSafety {
  backwardCompatible: boolean;
  reversible: boolean;
  destructive: boolean;
  publicEffect: boolean;
  newAuthority: boolean;
  productionAccessChange: boolean;
  databaseAccessChange: boolean;
  credentialChange: boolean;
  acceptanceChange: boolean;
  publicationChange: boolean;
  releaseChange: boolean;
}

export interface LifecycleSuccessorProposal {
  schema: typeof LIFECYCLE_SUCCESSOR_PROPOSAL_SCHEMA;
  id: string;
  observationDigest: string;
  classificationDigest: string;
  lifecycleId: string;
  champion: { version: string; digest: string };
  challenger: { version: string; digest: string; definition: Record<string, unknown> };
  diff: {
    semantic: Array<{ path: string; before: unknown; after: unknown }>;
    authority: { added: string[]; removed: string[] };
    dependencies: { added: string[]; removed: string[] };
    compatibility: "BACKWARD_COMPATIBLE" | "REVIEW_REQUIRED";
    impact: { futurePlanning: true; activeRuns: false; affectedResources: string[] };
    migration: { required: boolean; steps: string[] };
    experiment: { required: true; comparator: "CHAMPION_CHALLENGER"; minimumImprovement: number };
    monitoring: { signals: string[]; canaryRuns: number; rollbackThreshold: number };
    rollback: { lifecycleVersion: string; lifecycleDigest: string; verified: boolean };
  };
  safety: LifecycleSuccessorSafety;
  provenance: { sourceObservationDigest: string; sourceLifecycleDigest: string; evidenceRefs: string[] };
  status: "PROPOSED";
  activePointerMutated: false;
  digest: string;
}

export interface LifecycleExperimentContext extends ControlledLifecycleContext {
  governedTaskDigest: string;
}

export interface LifecycleExperimentArm {
  name: "CHAMPION" | "CHALLENGER";
  lifecycleDigest: string;
  context: LifecycleExperimentContext;
  score: number;
  passed: boolean;
  badCases: string[];
  evidenceRefs: string[];
}

export interface LifecycleExperimentReport {
  schema: typeof LIFECYCLE_EXPERIMENT_REPORT_SCHEMA;
  proposalDigest: string;
  status: "COMPARABLE" | "STRATIFIED_NON_COMPARABLE";
  contextMismatches: string[];
  pairwiseAggregationPerformed: boolean;
  champion: LifecycleExperimentArm;
  challenger: LifecycleExperimentArm;
  scoreDelta: number | null;
  badCaseClosure: "PASSED" | "FAILED" | "NOT_COMPARABLE";
  recommendation: "CHALLENGER" | "CHAMPION" | "NONE";
  digest: string;
}

export interface LifecycleSafeActivationPolicy {
  id: string;
  version: string;
  resourceDigest: string;
  digest: string;
  active: true;
  preauthorized: true;
  allowedGapClasses: LifecycleGapClass[];
  requireBackwardCompatible: true;
  requireReversible: true;
  forbidDestructive: true;
  forbidPublicEffect: true;
  forbidNewAuthority: true;
  forbidProductionAccessChange: true;
  forbidDatabaseAccessChange: true;
  forbidCredentialChange: true;
  forbidAcceptanceChange: true;
  forbidPublicationChange: true;
  forbidReleaseChange: true;
  requireVerifiedRollback: true;
  requireCanaryEvidence: true;
}

export interface LifecycleActivationDecision {
  schema: typeof LIFECYCLE_ACTIVATION_DECISION_SCHEMA;
  proposalDigest: string;
  experimentDigest: string;
  policyDigest: string;
  action: "AUTO_ACTIVATE_FUTURE_RUNS" | "HUMAN_DECISION" | "REJECT";
  humanRequired: boolean;
  decisionFrame?: {
    authorities: Array<"SEMANTIC" | "POLICY" | "CREDENTIAL" | "DATABASE" | "PRODUCTION" | "DESTRUCTIVE" | "ACCEPTANCE" | "PUBLICATION" | "DEPLOYMENT" | "RELEASE">;
    boundDigest: string;
    prompt: string;
  };
  predicates: Array<{ id: string; passed: boolean }>;
  reasons: string[];
  activeRunsRebound: false;
  digest: string;
}

export interface LifecycleHealthSample {
  signal: string;
  sequence: number;
  value: number;
  threshold: number;
  status: "HEALTHY" | "DEGRADED" | "UNKNOWN";
  evidenceRef: string;
  observedAt: string;
}

export interface LifecycleMonitoringDecision {
  schema: typeof LIFECYCLE_MONITORING_DECISION_SCHEMA;
  activationReceiptDigest: string;
  lifecycleId: string;
  activeVersion: string;
  activeRevisionDigest: string;
  rollbackVersion: string;
  rollbackRevisionDigest: string;
  action: "RETAIN" | "ROLLBACK" | "HUMAN_DECISION";
  reason: string;
  idempotencyKey: string;
  mutationOutcomeKnown: boolean;
  duplicateSuppressed: boolean;
  evidenceRefs: string[];
  digest: string;
}

export interface GenericPrimitiveTargetProposal {
  schema: typeof GENERIC_PRIMITIVE_TARGET_PROPOSAL_SCHEMA;
  id: string;
  owner: "RUNTIME" | "EXPERT";
  observationDigest: string;
  classificationDigest: string;
  objective: string;
  requiredPrimitive: string;
  projectSpecificBranchAllowed: false;
  sourceMutationPerformed: false;
  unsafeActivationBlocked: true;
  evidenceRefs: string[];
  status: "PROPOSED_FOR_REVIEW";
  digest: string;
}

export function createControlledLifecycleObservation(input: Omit<ControlledLifecycleObservation, "schema" | "digest">): ControlledLifecycleObservation {
  requireText(input.id, "observation.id");
  requireDate(input.capturedAt, "observation.capturedAt");
  validateContext(input.context);
  requireText(input.provenance.sourceRef, "observation.provenance.sourceRef");
  if (!input.signals.length) throw new Error("CONTROLLED_LIFECYCLE_OBSERVATION_SIGNALS_REQUIRED");
  const signals = [...input.signals].map((signal) => {
    requireText(signal.id, "signal.id");
    requireText(signal.summary, "signal.summary");
    if (!signal.evidenceRefs.length || signal.evidenceRefs.some((ref) => !ref.trim())) throw new Error(`CONTROLLED_LIFECYCLE_SIGNAL_EVIDENCE_REQUIRED:${signal.id}`);
    return { ...signal, evidenceRefs: unique(signal.evidenceRefs) };
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(signals.map((signal) => signal.id)).size !== signals.length) throw new Error("CONTROLLED_LIFECYCLE_SIGNAL_DUPLICATE");
  const material = { ...input, signals, schema: CONTROLLED_LIFECYCLE_OBSERVATION_SCHEMA };
  return { ...material, digest: canonicalDigest(material) };
}

export function classifyLifecycleGap(input: {
  observation: ControlledLifecycleObservation;
  gapClass: LifecycleGapClass;
  rationale: string[];
  evidenceRefs: string[];
}): LifecycleGapClassification {
  verifyObservation(input.observation);
  if (!input.rationale.length || !input.evidenceRefs.length) throw new Error("LIFECYCLE_GAP_CLASSIFICATION_EVIDENCE_REQUIRED");
  const destination: LifecycleGapClassification["destination"] = input.gapClass === "GENERIC_RUNTIME_PRIMITIVE_GAP" ? "RUNTIME_TARGET"
    : input.gapClass === "EXPERT_GUIDANCE_GAP" ? "EXPERT_TARGET"
      : input.gapClass === "PROJECT_LIFECYCLE_GAP" ? "LIFECYCLE_SUCCESSOR"
        : input.gapClass === "PROJECT_RESOURCE_GAP" ? "GOVERNED_RESOURCE_SUCCESSOR" : "NONE";
  const material = {
    schema: LIFECYCLE_GAP_CLASSIFICATION_SCHEMA,
    observationDigest: input.observation.digest,
    gapClass: input.gapClass,
    destination,
    projectNeutralPrimitiveMissing: destination === "RUNTIME_TARGET" || destination === "EXPERT_TARGET",
    projectSpecificCoreBranchAllowed: false as const,
    activeMutationAllowed: false as const,
    rationale: unique(input.rationale),
    evidenceRefs: unique(input.evidenceRefs)
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function createLifecycleSuccessorProposal(input: {
  id: string;
  observation: ControlledLifecycleObservation;
  classification: LifecycleGapClassification;
  champion: LifecycleSnapshot;
  challenger: LifecycleSnapshot;
  authority: { added?: string[]; removed?: string[] };
  dependencies: { added?: string[]; removed?: string[] };
  affectedResources?: string[];
  migrationSteps?: string[];
  minimumImprovement: number;
  monitoring: { signals: string[]; canaryRuns: number; rollbackThreshold: number };
  rollbackVerified: boolean;
  safety: LifecycleSuccessorSafety;
  evidenceRefs: string[];
}): LifecycleSuccessorProposal {
  verifyObservation(input.observation);
  verifyClassification(input.classification, input.observation.digest);
  if (input.classification.destination !== "LIFECYCLE_SUCCESSOR") throw new Error("LIFECYCLE_SUCCESSOR_CLASSIFICATION_REQUIRED");
  requireText(input.id, "successor.id");
  validateSnapshot(input.champion, "champion");
  validateSnapshot(input.challenger, "challenger");
  if (input.champion.id !== input.challenger.id) throw new Error("LIFECYCLE_SUCCESSOR_IDENTITY_MISMATCH");
  if (compareSemver(input.challenger.version, input.champion.version) <= 0) throw new Error("LIFECYCLE_SUCCESSOR_VERSION_REQUIRED");
  if (input.champion.digest === input.challenger.digest) throw new Error("LIFECYCLE_SUCCESSOR_BYTES_UNCHANGED");
  if (!Number.isFinite(input.minimumImprovement) || input.minimumImprovement < 0) throw new Error("LIFECYCLE_EXPERIMENT_MINIMUM_IMPROVEMENT_INVALID");
  if (!input.monitoring.signals.length || input.monitoring.canaryRuns < 1 || input.monitoring.rollbackThreshold < 1) throw new Error("LIFECYCLE_MONITORING_POLICY_INVALID");
  if (!input.evidenceRefs.length) throw new Error("LIFECYCLE_SUCCESSOR_EVIDENCE_REQUIRED");
  const semantic = semanticChanges(input.champion.definition, input.challenger.definition);
  if (!semantic.length) throw new Error("LIFECYCLE_SUCCESSOR_SEMANTIC_DIFF_REQUIRED");
  const reviewRequired = !input.safety.backwardCompatible || Object.values(input.safety).some((value, index) => index > 1 && value === true) || (input.authority.added?.length ?? 0) > 0;
  const material = {
    schema: LIFECYCLE_SUCCESSOR_PROPOSAL_SCHEMA,
    id: input.id,
    observationDigest: input.observation.digest,
    classificationDigest: input.classification.digest,
    lifecycleId: input.champion.id,
    champion: { version: input.champion.version, digest: input.champion.digest },
    challenger: { version: input.challenger.version, digest: input.challenger.digest, definition: input.challenger.definition },
    diff: {
      semantic,
      authority: { added: unique(input.authority.added ?? []), removed: unique(input.authority.removed ?? []) },
      dependencies: { added: unique(input.dependencies.added ?? []), removed: unique(input.dependencies.removed ?? []) },
      compatibility: reviewRequired ? "REVIEW_REQUIRED" as const : "BACKWARD_COMPATIBLE" as const,
      impact: { futurePlanning: true as const, activeRuns: false as const, affectedResources: unique(input.affectedResources ?? []) },
      migration: { required: Boolean(input.migrationSteps?.length), steps: unique(input.migrationSteps ?? []) },
      experiment: { required: true as const, comparator: "CHAMPION_CHALLENGER" as const, minimumImprovement: input.minimumImprovement },
      monitoring: { ...input.monitoring, signals: unique(input.monitoring.signals) },
      rollback: { lifecycleVersion: input.champion.version, lifecycleDigest: input.champion.digest, verified: input.rollbackVerified }
    },
    safety: { ...input.safety },
    provenance: { sourceObservationDigest: input.observation.digest, sourceLifecycleDigest: input.champion.digest, evidenceRefs: unique(input.evidenceRefs) },
    status: "PROPOSED" as const,
    activePointerMutated: false as const
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function evaluateLifecycleExperiment(input: {
  proposal: LifecycleSuccessorProposal;
  champion: LifecycleExperimentArm;
  challenger: LifecycleExperimentArm;
}): LifecycleExperimentReport {
  verifyProposal(input.proposal);
  validateExperimentArm(input.champion);
  validateExperimentArm(input.challenger);
  if (input.champion.name !== "CHAMPION" || input.challenger.name !== "CHALLENGER") throw new Error("LIFECYCLE_EXPERIMENT_ARM_ROLE_INVALID");
  if (input.champion.lifecycleDigest !== input.proposal.champion.digest || input.challenger.lifecycleDigest !== input.proposal.challenger.digest) throw new Error("LIFECYCLE_EXPERIMENT_PROPOSAL_BINDING_MISMATCH");
  const contextMismatches = contextKeys().filter((key) => input.champion.context[key] !== input.challenger.context[key]);
  const comparable = contextMismatches.length === 0;
  const scoreDelta = comparable ? input.challenger.score - input.champion.score : null;
  const badCaseClosure = !comparable ? "NOT_COMPARABLE" as const : input.challenger.badCases.length === 0 ? "PASSED" as const : "FAILED" as const;
  const recommendation = !comparable ? "NONE" as const
    : input.challenger.passed && badCaseClosure === "PASSED" && scoreDelta! >= input.proposal.diff.experiment.minimumImprovement ? "CHALLENGER" as const
      : "CHAMPION" as const;
  const material = {
    schema: LIFECYCLE_EXPERIMENT_REPORT_SCHEMA,
    proposalDigest: input.proposal.digest,
    status: comparable ? "COMPARABLE" as const : "STRATIFIED_NON_COMPARABLE" as const,
    contextMismatches,
    pairwiseAggregationPerformed: comparable,
    champion: input.champion,
    challenger: input.challenger,
    scoreDelta,
    badCaseClosure,
    recommendation
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function decideLifecycleSuccessorActivation(input: {
  proposal: LifecycleSuccessorProposal;
  classification: LifecycleGapClassification;
  experiment: LifecycleExperimentReport;
  policy: LifecycleSafeActivationPolicy;
  canaryEvidenceRefs: string[];
}): LifecycleActivationDecision {
  verifyProposal(input.proposal);
  verifyClassification(input.classification, input.proposal.observationDigest);
  verifyExperiment(input.experiment, input.proposal.digest);
  requireSemver(input.policy.version, "activation.policy.version");
  assertDigest(input.policy.resourceDigest, "activation.policy.resourceDigest");
  assertDigest(input.policy.digest, "activation.policy.digest");
  if (input.policy.digest !== canonicalDigest({ ...input.policy, digest: undefined })) throw new Error("LIFECYCLE_ACTIVATION_POLICY_DIGEST_DRIFT");
  const s = input.proposal.safety;
  const predicates = [
    ["policy-active", input.policy.active],
    ["policy-preauthorized", input.policy.preauthorized],
    ["gap-class-allowed", input.policy.allowedGapClasses.includes(input.classification.gapClass)],
    ["experiment-comparable", input.experiment.status === "COMPARABLE"],
    ["challenger-recommended", input.experiment.recommendation === "CHALLENGER"],
    ["backward-compatible", s.backwardCompatible],
    ["reversible", s.reversible],
    ["non-destructive", !s.destructive],
    ["non-public", !s.publicEffect],
    ["no-new-authority", !s.newAuthority],
    ["no-production-change", !s.productionAccessChange],
    ["no-database-change", !s.databaseAccessChange],
    ["no-credential-change", !s.credentialChange],
    ["no-acceptance-change", !s.acceptanceChange],
    ["no-publication-change", !s.publicationChange],
    ["no-release-change", !s.releaseChange],
    ["rollback-verified", input.proposal.diff.rollback.verified],
    ["canary-evidence", input.canaryEvidenceRefs.length > 0]
  ].map(([id, passed]) => ({ id: String(id), passed: Boolean(passed) }));
  const authorities = requiredHumanAuthorities(input.proposal);
  const safe = predicates.every((predicate) => predicate.passed) && authorities.length === 0;
  const reasons = predicates.filter((predicate) => !predicate.passed).map((predicate) => predicate.id);
  const action = safe ? "AUTO_ACTIVATE_FUTURE_RUNS" as const : authorities.length ? "HUMAN_DECISION" as const : "REJECT" as const;
  const decisionFrame = authorities.length ? {
    authorities,
    boundDigest: canonicalDigest({ proposalDigest: input.proposal.digest, experimentDigest: input.experiment.digest, policyDigest: input.policy.digest, authorities }),
    prompt: `Review ${authorities.join(", ")} change for exact Lifecycle successor ${input.proposal.id}.`
  } : undefined;
  const material = {
    schema: LIFECYCLE_ACTIVATION_DECISION_SCHEMA,
    proposalDigest: input.proposal.digest,
    experimentDigest: input.experiment.digest,
    policyDigest: input.policy.digest,
    action,
    humanRequired: action === "HUMAN_DECISION",
    ...(decisionFrame ? { decisionFrame } : {}),
    predicates,
    reasons: safe ? ["all-preauthorized-safe-predicates-passed"] : reasons.length ? reasons : authorities.map((item) => `authority:${item}`),
    activeRunsRebound: false as const
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function evaluateLifecycleMonitoring(input: {
  activationReceiptDigest: string;
  lifecycleId: string;
  activeVersion: string;
  activeRevisionDigest: string;
  rollbackVersion: string;
  rollbackRevisionDigest: string;
  samples: LifecycleHealthSample[];
  requiredConsecutiveDegraded: number;
  mutationOutcomeKnown: boolean;
  priorDecisionDigests?: string[];
}): LifecycleMonitoringDecision {
  [input.activationReceiptDigest, input.activeRevisionDigest, input.rollbackRevisionDigest].forEach((value, index) => assertDigest(value, `monitoring.digest.${index}`));
  requireText(input.lifecycleId, "monitoring.lifecycleId");
  requireSemver(input.activeVersion, "monitoring.activeVersion");
  requireSemver(input.rollbackVersion, "monitoring.rollbackVersion");
  if (input.requiredConsecutiveDegraded < 1 || !input.samples.length) throw new Error("LIFECYCLE_MONITORING_SAMPLES_REQUIRED");
  const samples = [...input.samples].sort((left, right) => left.sequence - right.sequence);
  for (const sample of samples) {
    requireText(sample.signal, "monitoring.signal");
    requireText(sample.evidenceRef, "monitoring.evidenceRef");
    requireDate(sample.observedAt, "monitoring.observedAt");
  }
  const unknown = samples.some((sample) => sample.status === "UNKNOWN");
  let consecutive = 0;
  for (const sample of samples) consecutive = sample.status === "DEGRADED" ? consecutive + 1 : 0;
  const shouldRollback = !unknown && consecutive >= input.requiredConsecutiveDegraded;
  const action = unknown || !input.mutationOutcomeKnown ? "HUMAN_DECISION" as const : shouldRollback ? "ROLLBACK" as const : "RETAIN" as const;
  const idempotencyKey = canonicalDigest({ activationReceiptDigest: input.activationReceiptDigest, lifecycleId: input.lifecycleId, activeVersion: input.activeVersion, activeRevisionDigest: input.activeRevisionDigest, rollbackVersion: input.rollbackVersion, rollbackRevisionDigest: input.rollbackRevisionDigest, action });
  const duplicateSuppressed = (input.priorDecisionDigests ?? []).includes(idempotencyKey);
  const material = {
    schema: LIFECYCLE_MONITORING_DECISION_SCHEMA,
    activationReceiptDigest: input.activationReceiptDigest,
    lifecycleId: input.lifecycleId,
    activeVersion: input.activeVersion,
    activeRevisionDigest: input.activeRevisionDigest,
    rollbackVersion: input.rollbackVersion,
    rollbackRevisionDigest: input.rollbackRevisionDigest,
    action,
    reason: unknown ? "health-signal-unknown" : !input.mutationOutcomeKnown ? "prior-mutation-outcome-uncertain" : shouldRollback ? "declared-degradation-threshold-reached" : "declared-health-threshold-retained",
    idempotencyKey,
    mutationOutcomeKnown: input.mutationOutcomeKnown,
    duplicateSuppressed,
    evidenceRefs: unique(samples.map((sample) => sample.evidenceRef))
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function createGenericPrimitiveTargetProposal(input: {
  id: string;
  observation: ControlledLifecycleObservation;
  classification: LifecycleGapClassification;
  objective: string;
  requiredPrimitive: string;
  evidenceRefs: string[];
}): GenericPrimitiveTargetProposal {
  verifyObservation(input.observation);
  verifyClassification(input.classification, input.observation.digest);
  const owner = input.classification.destination === "RUNTIME_TARGET" ? "RUNTIME" as const : input.classification.destination === "EXPERT_TARGET" ? "EXPERT" as const : undefined;
  if (!owner) throw new Error("GENERIC_PRIMITIVE_TARGET_CLASSIFICATION_REQUIRED");
  [input.id, input.objective, input.requiredPrimitive].forEach((value, index) => requireText(value, `target.${index}`));
  if (!input.evidenceRefs.length) throw new Error("GENERIC_PRIMITIVE_TARGET_EVIDENCE_REQUIRED");
  const material = {
    schema: GENERIC_PRIMITIVE_TARGET_PROPOSAL_SCHEMA,
    id: input.id,
    owner,
    observationDigest: input.observation.digest,
    classificationDigest: input.classification.digest,
    objective: input.objective,
    requiredPrimitive: input.requiredPrimitive,
    projectSpecificBranchAllowed: false as const,
    sourceMutationPerformed: false as const,
    unsafeActivationBlocked: true as const,
    evidenceRefs: unique(input.evidenceRefs),
    status: "PROPOSED_FOR_REVIEW" as const
  };
  return { ...material, digest: canonicalDigest(material) };
}

function semanticChanges(before: Record<string, unknown>, after: Record<string, unknown>): Array<{ path: string; before: unknown; after: unknown }> {
  const paths = new Set([...flatten(before), ...flatten(after)]);
  return [...paths].sort().flatMap((path) => {
    const left = readPath(before, path);
    const right = readPath(after, path);
    return stableJson(left) === stableJson(right) ? [] : [{ path, before: left, after: right }];
  });
}

function flatten(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => flatten(item, prefix ? `${prefix}.${key}` : key));
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
}

function requiredHumanAuthorities(proposal: LifecycleSuccessorProposal): LifecycleActivationDecision["decisionFrame"] extends { authorities: infer T } | undefined ? T : never {
  const result: Array<"SEMANTIC" | "POLICY" | "CREDENTIAL" | "DATABASE" | "PRODUCTION" | "DESTRUCTIVE" | "ACCEPTANCE" | "PUBLICATION" | "DEPLOYMENT" | "RELEASE"> = [];
  if (!proposal.safety.backwardCompatible || proposal.diff.compatibility === "REVIEW_REQUIRED") result.push("SEMANTIC");
  if (proposal.safety.newAuthority || proposal.diff.authority.added.length) result.push("POLICY");
  if (proposal.safety.credentialChange) result.push("CREDENTIAL");
  if (proposal.safety.databaseAccessChange) result.push("DATABASE");
  if (proposal.safety.productionAccessChange) result.push("PRODUCTION");
  if (proposal.safety.destructive) result.push("DESTRUCTIVE");
  if (proposal.safety.acceptanceChange) result.push("ACCEPTANCE");
  if (proposal.safety.publicationChange) result.push("PUBLICATION");
  if (proposal.safety.publicEffect) result.push("DEPLOYMENT");
  if (proposal.safety.releaseChange) result.push("RELEASE");
  return unique(result) as never;
}

function validateContext(context: ControlledLifecycleContext): void {
  requireText(context.tenantId, "context.tenantId");
  requireText(context.workspaceId, "context.workspaceId");
  const digestFields = Object.entries(context).filter(([key]) => key.endsWith("Digest"));
  for (const [key, value] of digestFields) assertDigest(String(value), `context.${key}`);
}

function contextKeys(): Array<keyof LifecycleExperimentContext> {
  return ["tenantId", "workspaceId", "projectDefinitionDigest", "lifecycleRevisionDigest", "harnessExecutionBindingDigest", "harnessBundleDigest", "goalTargetDigest", "runtimeDigest", "hostDigest", "providerDigest", "environmentDigest", "authorityDigest", "evaluatorDigest", "scorerDigest", "evidenceDigest", "governedTaskDigest"];
}

function validateExperimentArm(arm: LifecycleExperimentArm): void {
  assertDigest(arm.lifecycleDigest, "experiment.lifecycleDigest");
  validateContext(arm.context);
  assertDigest(arm.context.governedTaskDigest, "experiment.governedTaskDigest");
  if (!Number.isFinite(arm.score) || !arm.evidenceRefs.length) throw new Error("LIFECYCLE_EXPERIMENT_RESULT_INVALID");
}

function validateSnapshot(snapshot: LifecycleSnapshot, field: string): void {
  requireText(snapshot.id, `${field}.id`);
  requireSemver(snapshot.version, `${field}.version`);
  assertDigest(snapshot.digest, `${field}.digest`);
  if (!snapshot.definition || typeof snapshot.definition !== "object" || Array.isArray(snapshot.definition)) throw new Error(`LIFECYCLE_SNAPSHOT_DEFINITION_INVALID:${field}`);
}

function verifyObservation(value: ControlledLifecycleObservation): void {
  if (value.schema !== CONTROLLED_LIFECYCLE_OBSERVATION_SCHEMA || value.digest !== canonicalDigest({ ...value, digest: undefined })) throw new Error("CONTROLLED_LIFECYCLE_OBSERVATION_DIGEST_DRIFT");
}

function verifyClassification(value: LifecycleGapClassification, observationDigest: string): void {
  if (value.schema !== LIFECYCLE_GAP_CLASSIFICATION_SCHEMA || value.digest !== canonicalDigest({ ...value, digest: undefined })) throw new Error("LIFECYCLE_GAP_CLASSIFICATION_DIGEST_DRIFT");
  if (value.observationDigest !== observationDigest) throw new Error("LIFECYCLE_GAP_CLASSIFICATION_OBSERVATION_DRIFT");
}

function verifyProposal(value: LifecycleSuccessorProposal): void {
  if (value.schema !== LIFECYCLE_SUCCESSOR_PROPOSAL_SCHEMA || value.digest !== canonicalDigest({ ...value, digest: undefined })) throw new Error("LIFECYCLE_SUCCESSOR_PROPOSAL_DIGEST_DRIFT");
}

function verifyExperiment(value: LifecycleExperimentReport, proposalDigest: string): void {
  if (value.schema !== LIFECYCLE_EXPERIMENT_REPORT_SCHEMA || value.digest !== canonicalDigest({ ...value, digest: undefined })) throw new Error("LIFECYCLE_EXPERIMENT_REPORT_DIGEST_DRIFT");
  if (value.proposalDigest !== proposalDigest) throw new Error("LIFECYCLE_EXPERIMENT_PROPOSAL_DRIFT");
}

function assertDigest(value: string, field: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`CONTROLLED_LIFECYCLE_DIGEST_INVALID:${field}`);
}

function requireText(value: string, field: string): void {
  if (typeof value !== "string" || !value.trim()) throw new Error(`CONTROLLED_LIFECYCLE_TEXT_REQUIRED:${field}`);
}

function requireSemver(value: string, field: string): void {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) throw new Error(`CONTROLLED_LIFECYCLE_SEMVER_INVALID:${field}`);
}

function requireDate(value: string, field: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`CONTROLLED_LIFECYCLE_DATE_INVALID:${field}`);
}

function compareSemver(left: string, right: string): number {
  requireSemver(left, "semver.left");
  requireSemver(right, "semver.right");
  const a = left.split(/[.-]/).slice(0, 3).map(Number);
  const b = right.split(/[.-]/).slice(0, 3).map(Number);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return left.localeCompare(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) => String(left).localeCompare(String(right)));
}
