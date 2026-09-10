import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalDigest } from "../../packages/core/dist/index.js";
import { GovernedEvolutionService } from "../../packages/server/dist/domains/governed-evolution/service.js";

const d = (value) => canonicalDigest(value);
const scope = { tenantId: "tenant", workspaceId: "workspace" };

function policy(version, mode) {
  return {
    apiVersion: "evopilot.io/v1",
    kind: "PolicyPack",
    metadata: { id: "project-policy", name: "Project policy", version },
    provenance: { sourceType: "PROJECT", sourceId: "sample", sourceVersion: "1.0.0", sourceDigest: d("sample") },
    compatibility: { runtime: ">=5.1.0 <6.0.0" },
    capabilityRefs: ["governance.target"],
    spec: { mode }
  };
}

test("service persists immutable resources, explicit activation, diff, and rollback", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-resources-"));
  const service = new GovernedEvolutionService(root);
  const first = service.registerResource(policy("1.0.0", "strict"), scope);
  const next = service.registerResource(policy("1.1.0", "strict-plus-docs"), scope);
  assert.equal(service.readResource("PolicyPack", "project-policy", undefined, scope).digest, first.digest);
  assert.equal(service.compareResourceVersions("PolicyPack", "project-policy", "1.0.0", "1.1.0", "5.1.0", scope).runtimeVersionChangeRequired, false);
  service.activateResourceVersion("PolicyPack", "project-policy", "1.1.0", "owner", "decision://activate", scope);
  assert.equal(service.readResource("PolicyPack", "project-policy", undefined, scope).digest, next.digest);
  service.activateResourceVersion("PolicyPack", "project-policy", "1.0.0", "owner", "decision://rollback", scope, "rollback");
  assert.equal(service.readResource("PolicyPack", "project-policy", undefined, scope).digest, first.digest);
  assert.throws(() => service.registerResource({ ...policy("1.0.0", "changed") }, scope), /IMMUTABLE_CONFLICT/);
});

test("service persists remediation decisions across process instances", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-remediation-"));
  const service = new GovernedEvolutionService(root);
  service.startRemediationCampaign({ id: "campaign", targetDigest: d("target"), bindingDigest: d("binding"), sourceDigest: d("source"), activeCandidateDigest: d("candidate"), budget: { maxAttempts: 2, maxSameFailure: 2, maxWallClockMinutes: 10, startedAt: "2026-09-10T00:00:00Z" } }, scope);
  const result = service.decideRemediationCampaign("campaign", { failureClass: "TRANSIENT_INFRA", failureSignature: "network", occurredAt: "2026-09-10T00:01:00Z", deterministicReproduction: false, withinApprovedTarget: true, reversible: true, externalEffect: false, mutationOutcomeKnown: true }, "evidence://network", scope);
  assert.equal(result.decision.action, "AUTO_RETRY");
  const restarted = new GovernedEvolutionService(root);
  assert.equal(restarted.readRemediationCampaign("campaign", scope).history.length, 1);
  assert.equal(restarted.readRemediationCampaign("campaign", scope).counters.attempts, 1);
});
