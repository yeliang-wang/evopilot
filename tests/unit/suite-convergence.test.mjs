import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateConvergenceCompletion,
  builtInActionProviderDefinitions,
  canonicalDigest,
  compareGovernedResourceRevisions,
  createCapabilityInventory,
  createRemediationCampaign,
  createReplacementCandidateLineage,
  decideRemediationCampaign,
  evaluateGovernancePack,
  normalizeGovernedResource,
  qualifyActionProvider,
  recordRemediationDecision,
  transitionRemediationCampaign
} from "../../packages/core/dist/index.js";

const d = (value) => canonicalDigest(value);

function resource(version = "1.0.0", spec = { mode: "strict" }) {
  return normalizeGovernedResource({
    apiVersion: "evopilot.io/v1",
    kind: "PolicyPack",
    metadata: { id: "oss-governance", name: "OSS governance", version },
    provenance: {
      sourceType: "LEGACY_SUITE",
      sourceId: "evopilot-codex-suite",
      sourceVersion: "3.2.1",
      sourceDigest: d("evopilot-suite-3.2.1")
    },
    compatibility: { runtime: ">=5.1.0 <6.0.0" },
    capabilityRefs: ["governance.roadmap", "governance.target"],
    spec
  });
}

test("governed resources preserve source Suite identity and version independently", () => {
  const first = resource();
  const next = resource("1.1.0", { mode: "strict", documentationGate: true });
  assert.equal(first.metadata.version, "1.0.0");
  assert.equal(first.provenance.sourceVersion, "3.2.1");
  assert.notEqual(first.metadata.version, first.provenance.sourceVersion);
  const impact = compareGovernedResourceRevisions(first, next, "5.1.0");
  assert.equal(impact.compatibility, "COMPATIBLE_RESOURCE_REVISION");
  assert.equal(impact.runtimeVersionChangeRequired, false);
  assert.equal(impact.expertVersionChangeRequired, false);
  assert.equal(impact.rollbackVersion, "1.0.0");
  assert.throws(() => resource("1.1.0", { apiToken: "raw" }), /RAW_SECRET_FORBIDDEN/);
});

test("typed Action Providers reject arbitrary execution, missing authority, and unavailable SecretRefs", () => {
  const provider = normalizeGovernedResource({
    apiVersion: "evopilot.io/v1",
    kind: "ActionProviderDefinition",
    metadata: { id: "github", name: "GitHub", version: "1.0.0" },
    provenance: { sourceType: "NATIVE", sourceId: "evopilot-runtime", sourceVersion: "5.1.0", sourceDigest: d("runtime") },
    compatibility: { runtime: ">=5.1.0 <6.0.0" },
    capabilityRefs: ["source.read", "candidate.build"],
    spec: {
      execution: "TYPED_ACTIONS_ONLY",
      arbitraryShell: false,
      actions: [{ id: "candidate.build", inputSchema: { type: "object" }, outputSchema: { type: "object" }, receipt: "IMMUTABLE_REQUIRED", idempotencyKeyRequired: true, rollback: "NOT_APPLICABLE", requiredAuthorities: ["candidate.build"], credentialRefs: ["secret://github/actions"] }]
    }
  });
  assert.equal(qualifyActionProvider(provider, ["candidate.build"], ["secret://github/actions"]).status, "QUALIFIED");
  assert.equal(qualifyActionProvider(provider, [], []).status, "REJECTED");
  assert.throws(() => normalizeGovernedResource({ ...provider, metadata: { ...provider.metadata, version: "1.0.1" }, spec: { ...provider.spec, arbitraryShell: true }, digest: undefined }), /EXECUTION_BOUNDARY_INVALID/);
  assert.deepEqual(builtInActionProviderDefinitions().map((item) => item.metadata.id), ["local-git", "github", "gitlab", "npm", "maven", "candidate", "artifact-verifier"]);
});

test("capability inventory requires complete explicit disposition and no hidden fallback", () => {
  const sources = [{ suiteId: "datarig-codex-suite", sourceVersion: "2.1.5", snapshotDigest: d("datarig-suite"), capabilities: [{ id: "release-readiness", description: "Aggregate release readiness", digest: d("release-readiness") }] }];
  const dispositions = [{ sourceSuiteId: "datarig-codex-suite", capabilityId: "release-readiness", destination: { owner: "RESOURCE", ref: "GovernancePack/datarig-release" }, validatorIds: ["inventory-unit"] }];
  const inventory = createCapabilityInventory({ sources, dispositions });
  assert.equal(inventory.coverage.percent, 100);
  assert.equal(inventory.hiddenFallbackAllowed, false);
  assert.throws(() => createCapabilityInventory({ sources, dispositions: [] }), /UNMAPPED/);
  assert.throws(() => createCapabilityInventory({ sources, dispositions: [{ ...dispositions[0], destination: { owner: "RESOURCE", ref: ".codex/skills/datarig" } }] }), /HIDDEN_FALLBACK/);
});

test("GovernancePack gates accept only exact binding evidence and never infer authority", () => {
  const pack = normalizeGovernedResource({
    apiVersion: "evopilot.io/v1",
    kind: "GovernancePack",
    metadata: { id: "oss", name: "OSS gates", version: "1.0.0" },
    provenance: { sourceType: "NATIVE", sourceId: "evopilot-runtime", sourceVersion: "5.1.0", sourceDigest: d("runtime") },
    compatibility: { runtime: ">=5.1.0 <6.0.0" },
    capabilityRefs: ["governance.roadmap"],
    spec: { gates: ["roadmap", "target"] }
  });
  const bindingDigest = d("binding");
  const evidence = ["roadmap", "target"].map((gateId) => ({ gateId, status: "PASS", digest: d(gateId), bindingDigest }));
  const passed = evaluateGovernancePack({ pack, bindingDigest, evidence });
  assert.equal(passed.status, "PASS");
  assert.equal(passed.authorityInferred, false);
  assert.equal(evaluateGovernancePack({ pack, bindingDigest, evidence: evidence.map((item) => ({ ...item, bindingDigest: d("other") })) }).status, "BLOCKED");
});

test("remediation campaign continues safe defects and stops exact authority or budget boundaries", () => {
  const campaign = createRemediationCampaign({
    id: "repair-1",
    targetDigest: d("target"),
    bindingDigest: d("binding"),
    sourceDigest: d("source-1"),
    activeCandidateDigest: d("candidate-1"),
    budget: { maxAttempts: 2, maxSameFailure: 1, maxWallClockMinutes: 60, startedAt: "2026-09-10T00:00:00Z" }
  });
  const incident = { failureClass: "PRODUCT_DEFECT_REPAIRABLE", failureSignature: "test:format", occurredAt: "2026-09-10T00:01:00Z", deterministicReproduction: true, withinApprovedTarget: true, reversible: true, externalEffect: false, mutationOutcomeKnown: true };
  const decision = decideRemediationCampaign(campaign, incident);
  assert.equal(decision.action, "AUTO_REPAIR_SOURCE");
  assert.equal(decision.humanRequired, false);
  const lineage = createReplacementCandidateLineage({ parentCandidateDigest: d("candidate-1"), replacementCandidateDigest: d("candidate-2"), parentSourceDigest: d("source-1"), replacementSourceDigest: d("source-2"), repairDigest: d("repair") });
  const updated = recordRemediationDecision(campaign, incident, decision, "evidence://failed-first", lineage);
  assert.equal(updated.activeCandidateDigest, d("candidate-2"));
  assert.equal(updated.replacementLineage[0].fullMatrixRequired, true);
  assert.equal(decideRemediationCampaign(updated, incident).action, "HALT");
  assert.equal(decideRemediationCampaign(campaign, { ...incident, failureClass: "AUTHORITY_EXPANSION_REQUIRED", requiresAuthority: ["RELEASE"] }).action, "HUMAN_DECISION");
  const waitingDecision = decideRemediationCampaign(campaign, { ...incident, failureClass: "AUTHORITY_EXPANSION_REQUIRED", requiresAuthority: ["RELEASE"] });
  const waiting = recordRemediationDecision(campaign, { ...incident, failureClass: "AUTHORITY_EXPANSION_REQUIRED", requiresAuthority: ["RELEASE"] }, waitingDecision, "evidence://authority");
  const resumed = transitionRemediationCampaign(waiting, { action: "RESUME", campaignDigest: waiting.digest, actor: "owner", evidenceRef: "decision://resume" });
  assert.equal(resumed.state, "ACTIVE");
  assert.throws(() => transitionRemediationCampaign(resumed, { action: "RESUME", campaignDigest: resumed.digest, actor: "owner", evidenceRef: "decision://again" }), /NOT_WAITING/);
});

test("completion is blocked unless every exact criterion and convergence condition passes", () => {
  const inventory = createCapabilityInventory({
    sources: [{ suiteId: "evopilot-codex-suite", sourceVersion: "3.2.1", snapshotDigest: d("suite"), capabilities: [{ id: "roadmap", description: "Roadmap gate", digest: d("roadmap") }] }],
    dispositions: [{ sourceSuiteId: "evopilot-codex-suite", capabilityId: "roadmap", destination: { owner: "RESOURCE", ref: "GovernancePack/oss" }, validatorIds: ["roadmap-check"] }]
  });
  const base = { inventory, current: [{ id: "RT51-FUNC01", status: "PASSED", evidenceRefs: ["evidence://1"] }], inherited: [], e2e: [], impactClosurePercent: 100, exactInstalledCandidatePairVerified: true, noRegression: "PASSED", legacySuiteInvocationCount: 0 };
  assert.equal(aggregateConvergenceCompletion(base).status, "PASSED");
  assert.equal(aggregateConvergenceCompletion({ ...base, legacySuiteInvocationCount: 1 }).status, "BLOCKED");
  assert.equal(aggregateConvergenceCompletion({ ...base, current: [{ id: "RT51-FUNC01", status: "PASSED", evidenceRefs: [] }] }).status, "BLOCKED");
});
