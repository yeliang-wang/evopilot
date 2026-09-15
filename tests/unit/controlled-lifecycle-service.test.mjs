import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalDigest } from "../../packages/core/dist/index.js";
import { GovernedEvolutionService } from "../../packages/server/dist/domains/governed-evolution/service.js";

const d = (value) => canonicalDigest(value);
const scope = { tenantId: "tenant-a", workspaceId: "workspace-a" };

function observationInput(id = "obs-1") {
  return {
    id,
    context: {
      ...scope,
      projectDefinitionDigest: d("project"), lifecycleRevisionDigest: d("lifecycle"), harnessExecutionBindingDigest: d("harness-binding"), harnessBundleDigest: d("harness-bundle"), goalTargetDigest: d("goal"), runtimeDigest: d("runtime"), hostDigest: d("host"), providerDigest: d("provider"), environmentDigest: d("environment"), authorityDigest: d("authority"), evaluatorDigest: d("evaluator"), scorerDigest: d("scorer"), evidenceDigest: d("evidence")
    },
    signals: [{ id: "failure", kind: "FAILURE", severity: "MEDIUM", summary: "Late deterministic validation", evidenceRefs: ["evidence://failure"] }],
    capturedAt: "2026-09-15T02:00:00Z",
    provenance: { source: "RUNTIME", sourceRef: "run://1" }
  };
}

test("controlled Lifecycle state is immutable, tenant scoped, and restart safe", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-controlled-lifecycle-"));
  const service = new GovernedEvolutionService(root);
  const observed = service.recordLifecycleObservation(observationInput(), scope);
  assert.equal(service.readLifecycleObservation(observed.id, { tenantId: "tenant-b", workspaceId: "workspace-a" }), undefined);
  assert.throws(() => service.recordLifecycleObservation(observationInput("wrong-scope"), { tenantId: "tenant-b", workspaceId: "workspace-a" }), /SCOPE_MISMATCH/);
  const classification = service.classifyLifecycleObservation(observed.id, { gapClass: "PROJECT_LIFECYCLE_GAP", rationale: ["Existing primitives are sufficient."], evidenceRefs: ["evidence://classification"] }, scope);
  const restarted = new GovernedEvolutionService(root);
  assert.equal(restarted.readLifecycleObservation(observed.id, scope).digest, observed.digest);
  assert.equal(restarted.readLifecycleClassification(observed.id, scope).digest, classification.digest);
  assert.throws(() => restarted.classifyLifecycleObservation(observed.id, { gapClass: "GENERIC_RUNTIME_PRIMITIVE_GAP", rationale: ["changed"], evidenceRefs: ["evidence://changed"] }, scope), /IMMUTABLE_CONFLICT/);
});

test("service persists successor, comparable experiment, active policy decision, monitoring, and generic Target proposal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-controlled-lifecycle-flow-"));
  const service = new GovernedEvolutionService(root);
  service.recordLifecycleObservation(observationInput(), scope);
  service.classifyLifecycleObservation("obs-1", { gapClass: "PROJECT_LIFECYCLE_GAP", rationale: ["Declarative stage addition"], evidenceRefs: ["evidence://classification"] }, scope);
  const championDefinition = { stages: [{ id: "verify" }, { id: "rc" }] };
  const challengerDefinition = { stages: [{ id: "verify" }, { id: "docs-contract" }, { id: "rc" }] };
  const proposal = service.proposeLifecycleSuccessor({
    observationId: "obs-1", id: "delivery-1.0.1",
    champion: { id: "delivery", version: "1.0.0", digest: d(championDefinition), definition: championDefinition },
    challenger: { id: "delivery", version: "1.0.1", digest: d(challengerDefinition), definition: challengerDefinition },
    authority: {}, dependencies: {}, minimumImprovement: 0.05,
    monitoring: { signals: ["invalid-rc-rate"], canaryRuns: 2, rollbackThreshold: 2 }, rollbackVerified: true,
    safety: { backwardCompatible: true, reversible: true, destructive: false, publicEffect: false, newAuthority: false, productionAccessChange: false, databaseAccessChange: false, credentialChange: false, acceptanceChange: false, publicationChange: false, releaseChange: false },
    evidenceRefs: ["evidence://proposal"]
  }, scope);
  const experimentContext = { ...observationInput().context, governedTaskDigest: d("task") };
  const experiment = service.evaluateLifecycleSuccessorExperiment({
    proposalId: proposal.id,
    champion: { name: "CHAMPION", lifecycleDigest: proposal.champion.digest, context: experimentContext, score: 0.7, passed: true, badCases: [], evidenceRefs: ["evidence://champion"] },
    challenger: { name: "CHALLENGER", lifecycleDigest: proposal.challenger.digest, context: experimentContext, score: 0.9, passed: true, badCases: [], evidenceRefs: ["evidence://challenger"] }
  }, scope);
  const declaration = { active: true, preauthorized: true, allowedGapClasses: ["PROJECT_LIFECYCLE_GAP"], requireBackwardCompatible: true, requireReversible: true, forbidDestructive: true, forbidPublicEffect: true, forbidNewAuthority: true, forbidProductionAccessChange: true, forbidDatabaseAccessChange: true, forbidCredentialChange: true, forbidAcceptanceChange: true, forbidPublicationChange: true, forbidReleaseChange: true, requireVerifiedRollback: true, requireCanaryEvidence: true };
  const policyResource = service.registerResource({
    apiVersion: "evopilot.io/v1", kind: "PolicyPack", metadata: { id: "safe-lifecycle", name: "Safe Lifecycle", version: "1.0.0" },
    provenance: { sourceType: "NATIVE", sourceId: "evopilot-runtime", sourceVersion: "6.1.0", sourceDigest: d("runtime-6.1.0") },
    compatibility: { runtime: ">=6.1.0 <7.0.0" }, capabilityRefs: ["lifecycle.safe-activation"], spec: { safeLifecycleActivation: declaration }
  }, scope);
  const policyBase = { id: policyResource.metadata.id, version: policyResource.metadata.version, resourceDigest: policyResource.digest, ...declaration };
  const policy = { ...policyBase, digest: canonicalDigest(policyBase) };
  const decision = service.decideLifecycleSuccessor({ proposalId: proposal.id, experimentDigest: experiment.digest, policy, canaryEvidenceRefs: ["evidence://canary"] }, scope);
  assert.equal(decision.action, "AUTO_ACTIVATE_FUTURE_RUNS");
  const monitoringInput = { activationReceiptDigest: d("activation"), lifecycleId: "delivery", activeVersion: "1.0.1", activeRevisionDigest: proposal.challenger.digest, rollbackVersion: "1.0.0", rollbackRevisionDigest: proposal.champion.digest, samples: [1, 2].map((sequence) => ({ signal: "invalid-rc-rate", sequence, value: 2, threshold: 1, status: "DEGRADED", evidenceRef: `evidence://health/${sequence}`, observedAt: `2026-09-15T02:0${sequence}:00Z` })), requiredConsecutiveDegraded: 2, mutationOutcomeKnown: true };
  const rollback = service.evaluateLifecycleHealth(monitoringInput, scope);
  assert.equal(rollback.action, "ROLLBACK");
  const duplicate = service.evaluateLifecycleHealth(monitoringInput, scope);
  assert.equal(duplicate.idempotencyKey, rollback.idempotencyKey);
  assert.equal(duplicate.duplicateSuppressed, true);

  service.recordLifecycleObservation(observationInput("obs-runtime-gap"), scope);
  service.classifyLifecycleObservation("obs-runtime-gap", { gapClass: "GENERIC_RUNTIME_PRIMITIVE_GAP", rationale: ["No generic primitive"], evidenceRefs: ["evidence://gap"] }, scope);
  const target = service.proposeGenericPrimitiveTarget({ observationId: "obs-runtime-gap", id: "runtime-gap", objective: "Add generic support", requiredPrimitive: "generic-safe-stage", evidenceRefs: ["evidence://gap"] }, scope);
  assert.equal(target.owner, "RUNTIME");
  assert.equal(target.sourceMutationPerformed, false);
});
