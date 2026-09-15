import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalDigest,
  classifyLifecycleGap,
  createControlledLifecycleObservation,
  createGenericPrimitiveTargetProposal,
  createLifecycleSuccessorProposal,
  decideLifecycleSuccessorActivation,
  evaluateLifecycleExperiment,
  evaluateLifecycleMonitoring
} from "../../packages/core/dist/index.js";

const d = (value) => canonicalDigest(value);

function context(overrides = {}) {
  return {
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    projectDefinitionDigest: d("project"),
    lifecycleRevisionDigest: d("lifecycle-1"),
    harnessExecutionBindingDigest: d("harness-binding"),
    harnessBundleDigest: d("harness-bundle"),
    goalTargetDigest: d("goal-target"),
    runtimeDigest: d("runtime-6.1.0"),
    hostDigest: d("codex"),
    providerDigest: d("provider"),
    environmentDigest: d("environment"),
    authorityDigest: d("authority"),
    evaluatorDigest: d("evaluator"),
    scorerDigest: d("scorer"),
    evidenceDigest: d("evidence"),
    ...overrides
  };
}

function observation() {
  return createControlledLifecycleObservation({
    id: "obs-docs-late",
    context: context(),
    signals: [{ id: "docs-drift", kind: "FAILURE", severity: "MEDIUM", summary: "Documentation drift is detected after RC construction.", evidenceRefs: ["evidence://run/1", "evidence://feedback/1"] }],
    capturedAt: "2026-09-15T01:00:00Z",
    provenance: { source: "EXPERT_INPUT", sourceRef: "conversation://feedback/1" }
  });
}

function proposal() {
  const observed = observation();
  const classification = classifyLifecycleGap({ observation: observed, gapClass: "PROJECT_LIFECYCLE_GAP", rationale: ["Existing generic stages can express an earlier documentation check."], evidenceRefs: ["evidence://classification/1"] });
  const championDefinition = { stages: [{ id: "verify" }, { id: "rc" }] };
  const challengerDefinition = { stages: [{ id: "verify" }, { id: "docs-contract" }, { id: "rc" }] };
  return {
    observed,
    classification,
    proposal: createLifecycleSuccessorProposal({
      id: "delivery-1.0.1",
      observation: observed,
      classification,
      champion: { id: "delivery", version: "1.0.0", digest: d(championDefinition), definition: championDefinition },
      challenger: { id: "delivery", version: "1.0.1", digest: d(challengerDefinition), definition: challengerDefinition },
      authority: {},
      dependencies: {},
      minimumImprovement: 0.05,
      monitoring: { signals: ["invalid-rc-rate"], canaryRuns: 3, rollbackThreshold: 2 },
      rollbackVerified: true,
      safety: { backwardCompatible: true, reversible: true, destructive: false, publicEffect: false, newAuthority: false, productionAccessChange: false, databaseAccessChange: false, credentialChange: false, acceptanceChange: false, publicationChange: false, releaseChange: false },
      evidenceRefs: ["evidence://proposal/1"]
    })
  };
}

test("observations and classifications retain every exact controlled-evolution binding", () => {
  const observed = observation();
  assert.equal(observed.context.harnessBundleDigest, d("harness-bundle"));
  assert.equal(observed.signals.length, 1);
  const classified = classifyLifecycleGap({ observation: observed, gapClass: "PROJECT_LIFECYCLE_GAP", rationale: ["declarative successor"], evidenceRefs: ["evidence://classification"] });
  assert.equal(classified.destination, "LIFECYCLE_SUCCESSOR");
  assert.equal(classified.projectSpecificCoreBranchAllowed, false);
  assert.equal(classified.activeMutationAllowed, false);
  assert.throws(() => createControlledLifecycleObservation({ ...observed, schema: undefined, digest: undefined, context: { ...observed.context, tenantId: "" } }), /TEXT_REQUIRED/);
});

test("successor proposal exposes the complete diff and never mutates the active pointer", () => {
  const value = proposal().proposal;
  assert.equal(value.diff.semantic.some((item) => item.path.includes("stages")), true);
  assert.deepEqual(Object.keys(value.diff).sort(), ["authority", "compatibility", "dependencies", "experiment", "impact", "migration", "monitoring", "rollback", "semantic"]);
  assert.equal(value.diff.impact.activeRuns, false);
  assert.equal(value.activePointerMutated, false);
  assert.equal(value.diff.compatibility, "BACKWARD_COMPATIBLE");
});

test("Champion and Challenger evidence is pairwise only under one identical governed context", () => {
  const value = proposal().proposal;
  const experimentContext = { ...context(), governedTaskDigest: d("task") };
  const champion = { name: "CHAMPION", lifecycleDigest: value.champion.digest, context: experimentContext, score: 0.7, passed: true, badCases: [], evidenceRefs: ["evidence://champion"] };
  const challenger = { name: "CHALLENGER", lifecycleDigest: value.challenger.digest, context: experimentContext, score: 0.9, passed: true, badCases: [], evidenceRefs: ["evidence://challenger"] };
  const comparable = evaluateLifecycleExperiment({ proposal: value, champion, challenger });
  assert.equal(comparable.status, "COMPARABLE");
  assert.equal(comparable.recommendation, "CHALLENGER");
  const stratified = evaluateLifecycleExperiment({ proposal: value, champion, challenger: { ...challenger, context: { ...experimentContext, hostDigest: d("other-host") } } });
  assert.equal(stratified.status, "STRATIFIED_NON_COMPARABLE");
  assert.equal(stratified.pairwiseAggregationPerformed, false);
  assert.deepEqual(stratified.contextMismatches, ["hostDigest"]);
});

test("automatic activation requires every exact preauthorized safe predicate", () => {
  const { proposal: value, classification } = proposal();
  const experimentContext = { ...context(), governedTaskDigest: d("task") };
  const experiment = evaluateLifecycleExperiment({
    proposal: value,
    champion: { name: "CHAMPION", lifecycleDigest: value.champion.digest, context: experimentContext, score: 0.7, passed: true, badCases: [], evidenceRefs: ["evidence://champion"] },
    challenger: { name: "CHALLENGER", lifecycleDigest: value.challenger.digest, context: experimentContext, score: 0.9, passed: true, badCases: [], evidenceRefs: ["evidence://challenger"] }
  });
  const declaration = { active: true, preauthorized: true, allowedGapClasses: ["PROJECT_LIFECYCLE_GAP"], requireBackwardCompatible: true, requireReversible: true, forbidDestructive: true, forbidPublicEffect: true, forbidNewAuthority: true, forbidProductionAccessChange: true, forbidDatabaseAccessChange: true, forbidCredentialChange: true, forbidAcceptanceChange: true, forbidPublicationChange: true, forbidReleaseChange: true, requireVerifiedRollback: true, requireCanaryEvidence: true };
  const policyBase = { id: "safe-lifecycle", version: "1.0.0", resourceDigest: d("resource"), ...declaration };
  const policy = { ...policyBase, digest: canonicalDigest(policyBase) };
  const decision = decideLifecycleSuccessorActivation({ proposal: value, classification, experiment, policy, canaryEvidenceRefs: ["evidence://canary"] });
  assert.equal(decision.action, "AUTO_ACTIVATE_FUTURE_RUNS");
  assert.equal(decision.activeRunsRebound, false);
  const changedProposal = { ...value, safety: { ...value.safety, databaseAccessChange: true } };
  changedProposal.digest = canonicalDigest({ ...changedProposal, digest: undefined });
  const changedExperiment = { ...experiment, proposalDigest: changedProposal.digest };
  changedExperiment.digest = canonicalDigest({ ...changedExperiment, digest: undefined });
  const gated = decideLifecycleSuccessorActivation({ proposal: changedProposal, classification, experiment: changedExperiment, policy, canaryEvidenceRefs: ["evidence://canary"] });
  assert.equal(gated.action, "HUMAN_DECISION");
  assert.equal(gated.decisionFrame.authorities.includes("DATABASE"), true);
});

test("monitoring performs deterministic rollback and suppresses duplicate mutation", () => {
  const input = {
    activationReceiptDigest: d("activation"),
    lifecycleId: "delivery",
    activeVersion: "1.0.1",
    activeRevisionDigest: d("lifecycle-1.0.1"),
    rollbackVersion: "1.0.0",
    rollbackRevisionDigest: d("lifecycle-1.0.0"),
    samples: [1, 2].map((sequence) => ({ signal: "invalid-rc-rate", sequence, value: 2, threshold: 1, status: "DEGRADED", evidenceRef: `evidence://health/${sequence}`, observedAt: `2026-09-15T01:0${sequence}:00Z` })),
    requiredConsecutiveDegraded: 2,
    mutationOutcomeKnown: true
  };
  const first = evaluateLifecycleMonitoring(input);
  assert.equal(first.action, "ROLLBACK");
  const repeated = evaluateLifecycleMonitoring({ ...input, priorDecisionDigests: [first.idempotencyKey] });
  assert.equal(repeated.duplicateSuppressed, true);
  const uncertain = evaluateLifecycleMonitoring({ ...input, mutationOutcomeKnown: false });
  assert.equal(uncertain.action, "HUMAN_DECISION");
});

test("missing project-neutral primitives become review-only Targets instead of project branches", () => {
  const observed = observation();
  const classification = classifyLifecycleGap({ observation: observed, gapClass: "GENERIC_RUNTIME_PRIMITIVE_GAP", rationale: ["No public primitive can express the requirement."], evidenceRefs: ["evidence://gap"] });
  const target = createGenericPrimitiveTargetProposal({ id: "runtime-gap-1", observation: observed, classification, objective: "Add a generic project-neutral primitive.", requiredPrimitive: "controlled-comparison", evidenceRefs: ["evidence://gap"] });
  assert.equal(target.owner, "RUNTIME");
  assert.equal(target.projectSpecificBranchAllowed, false);
  assert.equal(target.sourceMutationPerformed, false);
  assert.equal(target.unsafeActivationBlocked, true);
});
