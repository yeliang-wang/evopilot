import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalDigest } from "../../packages/core/dist/index.js";
import { createServer } from "../../packages/server/dist/index.js";

const d = (value) => canonicalDigest(value);
const lifecycle = (version, stages) => `
schema: evopilot-lifecycle-definition/v1alpha1
metadata: { id: controlled-api, name: Controlled API, version: ${version} }
capabilities: [project.read]
stages:
${stages.map((id) => `  - id: ${id}\n    name: ${id}\n    action: { uses: project.validate@1, with: { strict: true } }\n    decision: { mode: AUTO }`).join("\n")}
`;

test("HTTP and MCP semantics close observation through safe activation and idempotent rollback", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-controlled-api-"));
  const server = createServer({ dataRoot, runtimeMode: "debug", tokens: [{ name: "admin", token: "admin-token", role: "admin" }] });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const v1 = (await request(base, "/api/v1/lifecycles", "POST", { yaml: lifecycle("1.0.0", ["verify"]), evidenceRef: "decision://register-v1" })).body.data;
    assert.equal((await request(base, "/api/v1/lifecycles/controlled-api/activate", "POST", { version: "1.0.0", evidenceRef: "decision://activate-v1" })).status, 200);
    const v2 = (await request(base, "/api/v1/lifecycles", "POST", { yaml: lifecycle("1.0.1", ["verify", "docs-contract"]), evidenceRef: "decision://register-v2" })).body.data;

    const declaration = { active: true, preauthorized: true, allowedGapClasses: ["PROJECT_LIFECYCLE_GAP"], requireBackwardCompatible: true, requireReversible: true, forbidDestructive: true, forbidPublicEffect: true, forbidNewAuthority: true, forbidProductionAccessChange: true, forbidDatabaseAccessChange: true, forbidCredentialChange: true, forbidAcceptanceChange: true, forbidPublicationChange: true, forbidReleaseChange: true, requireVerifiedRollback: true, requireCanaryEvidence: true };
    const policyResource = (await request(base, "/api/v1/evolution-resources", "POST", { apiVersion: "evopilot.io/v1", kind: "PolicyPack", metadata: { id: "controlled-safe", name: "Controlled safe activation", version: "1.0.0" }, provenance: { sourceType: "PROJECT", sourceId: "controlled-api", sourceVersion: "1.0.0", sourceDigest: d("project") }, compatibility: { runtime: ">=6.1.0 <7.0.0" }, capabilityRefs: ["lifecycle.safe-activation"], spec: { safeLifecycleActivation: declaration } })).body.data;

    const exactContext = { tenantId: "tenant-production", workspaceId: "workspace-agent-products", projectDefinitionDigest: d("project"), lifecycleRevisionDigest: v1.revisionDigest, harnessExecutionBindingDigest: d("harness-binding"), harnessBundleDigest: d("harness-bundle"), goalTargetDigest: d("goal-target"), runtimeDigest: d("runtime"), hostDigest: d("host"), providerDigest: d("provider"), environmentDigest: d("environment"), authorityDigest: d("authority"), evaluatorDigest: d("evaluator"), scorerDigest: d("scorer"), evidenceDigest: d("evidence") };
    assert.equal((await request(base, "/api/v1/controlled-lifecycle/observations", "POST", { id: "obs-api", context: exactContext, signals: [{ id: "late-docs", kind: "FAILURE", severity: "MEDIUM", summary: "Late documentation drift", evidenceRefs: ["evidence://run"] }], capturedAt: "2026-09-15T03:00:00Z", provenance: { source: "EXPERT_INPUT", sourceRef: "conversation://1" } })).status, 201);
    assert.equal((await request(base, "/api/v1/controlled-lifecycle/observations/obs-api/classify", "POST", { gapClass: "PROJECT_LIFECYCLE_GAP", rationale: ["Existing generic stage"], evidenceRefs: ["evidence://classification"] })).status, 201);
    const proposalResponse = await request(base, "/api/v1/controlled-lifecycle/successors", "POST", { observationId: "obs-api", id: "controlled-api-1.0.1", champion: { id: "controlled-api", version: "1.0.0", digest: v1.revisionDigest, definition: { stages: ["verify"] } }, challenger: { id: "controlled-api", version: "1.0.1", digest: v2.revisionDigest, definition: { stages: ["verify", "docs-contract"] } }, authority: {}, dependencies: {}, minimumImprovement: 0.05, monitoring: { signals: ["docs-drift"], canaryRuns: 2, rollbackThreshold: 2 }, rollbackVerified: true, safety: { backwardCompatible: true, reversible: true, destructive: false, publicEffect: false, newAuthority: false, productionAccessChange: false, databaseAccessChange: false, credentialChange: false, acceptanceChange: false, publicationChange: false, releaseChange: false }, evidenceRefs: ["evidence://proposal"] });
    assert.equal(proposalResponse.status, 201);
    const proposal = proposalResponse.body.data;
    const experimentContext = { ...exactContext, governedTaskDigest: d("task") };
    const experiment = (await request(base, "/api/v1/controlled-lifecycle/experiments", "POST", { proposalId: proposal.id, champion: { name: "CHAMPION", lifecycleDigest: v1.revisionDigest, context: experimentContext, score: 0.7, passed: true, badCases: [], evidenceRefs: ["evidence://champion"] }, challenger: { name: "CHALLENGER", lifecycleDigest: v2.revisionDigest, context: experimentContext, score: 0.9, passed: true, badCases: [], evidenceRefs: ["evidence://challenger"] } })).body.data;
    const policyBase = { id: policyResource.metadata.id, version: policyResource.metadata.version, resourceDigest: policyResource.digest, ...declaration };
    const policy = { ...policyBase, digest: canonicalDigest(policyBase) };
    const activationResponse = await request(base, "/api/v1/controlled-lifecycle/activation-decisions", "POST", { proposalId: proposal.id, experimentDigest: experiment.digest, policy, canaryEvidenceRefs: ["evidence://canary"] });
    assert.equal(activationResponse.status, 200);
    assert.equal(activationResponse.body.data.decision.action, "AUTO_ACTIVATE_FUTURE_RUNS");
    const active = (await request(base, "/api/v1/lifecycles/controlled-api?version=1.0.1", "GET")).body.data;
    assert.equal(active.active, true);

    const monitoring = { activationReceiptDigest: activationResponse.body.data.activation.digest, lifecycleId: "controlled-api", activeVersion: "1.0.1", activeRevisionDigest: v2.revisionDigest, rollbackVersion: "1.0.0", rollbackRevisionDigest: v1.revisionDigest, samples: [1, 2].map((sequence) => ({ signal: "docs-drift", sequence, value: 2, threshold: 1, status: "DEGRADED", evidenceRef: `evidence://health/${sequence}`, observedAt: `2026-09-15T03:0${sequence}:00Z` })), requiredConsecutiveDegraded: 2, mutationOutcomeKnown: true };
    const rollback = await request(base, "/api/v1/controlled-lifecycle/monitoring/evaluate", "POST", monitoring);
    assert.equal(rollback.body.data.decision.action, "ROLLBACK");
    assert.equal(Boolean(rollback.body.data.rollback), true);
    const repeated = await request(base, "/api/v1/controlled-lifecycle/monitoring/evaluate", "POST", monitoring);
    assert.equal(repeated.body.data.decision.duplicateSuppressed, true);
    assert.equal("rollback" in repeated.body.data, false);
    assert.equal((await request(base, "/api/v1/lifecycles/controlled-api?version=1.0.0", "GET")).body.data.active, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

async function request(base, route, method, body) {
  const response = await fetch(`${base}${route}`, { method, headers: { authorization: "Bearer admin-token", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}
