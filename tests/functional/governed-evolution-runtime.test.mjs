import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalDigest } from "../../packages/core/dist/index.js";
import { GovernedEvolutionService } from "../../packages/server/dist/domains/governed-evolution/index.js";

const d = (value) => canonicalDigest(value);

test("GovernedEvolutionService persists immutable definitions, bindings, and approved reusable recovery", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-v5-"));
  try {
    const service = new GovernedEvolutionService(root);
    const definition = service.registerProjectDefinition({
      schema: "evopilot-evolution-project-definition/v1",
      metadata: { id: "new-project", name: "New Project", version: "1.0.0", labels: { delivery: "oss" } },
      spec: { source: { provider: "github", repository: "org/new-project", defaultBranch: "main", mode: "owned" }, ecosystem: { languages: ["typescript"], packageManagers: ["npm"], frameworks: [] }, delivery: { model: "open-source", ciProvider: "github-actions", candidateBeforeAcceptance: true, noRebuildPromotion: true, channels: ["npm"] }, environment: { development: "local", acceptance: "isolated" }, policyRefs: [], lifecycleRefs: ["lifecycle://oss/1"], secretRefs: [], hostPreferences: ["codex"], runtimePreferences: ["local"], evidenceSources: ["ci"] }
    });
    assert.equal(service.registerProjectDefinition({ ...definition }).digest, definition.digest);
    assert.throws(() => service.registerProjectDefinition({ ...definition, metadata: { ...definition.metadata, name: "Changed" }, digest: undefined }), /IMMUTABLE_CONFLICT/);

    const profileDigest = d("profile");
    const candidate = { profile: { id: "software-release", version: "1", digest: profileDigest, catalogId: "public", catalogDigest: d("catalog"), domains: ["software"], taskClasses: ["release"], positiveConcepts: ["npm"], negativeConcepts: [] }, bundle: { id: "software-release", version: "1", digest: d("bundle"), profileDigest, componentDigests: [d("component")], requiredEvidence: ["tests"], validators: ["integrity"], constraints: ["no-rebuild"], capabilities: ["build.execute"], permissions: ["build.verify"] }, published: true, eligible: true };
    const lifecycle = { ref: { id: "oss", version: "1" }, digest: d("lifecycle"), definition: { capabilities: ["build.execute"], obligations: { requiredEvidence: ["sbom"], validators: ["signature"], constraints: ["candidate-first"], requestedPermissions: ["build.verify"] } } };
    const fixed = d("fixed");
    const plan = service.plan({ projectDefinitionId: "new-project", goalTarget: { projectId: "new-project", goalId: "goal-1", targetId: "target-1", objective: "publish npm", taskClass: "release", domain: "software", requiredCapabilities: ["build.execute"] }, candidates: [candidate], lifecycle, policyDigest: fixed, providerDigest: fixed, environmentDigest: fixed, hostDigest: fixed, runtimeDigest: fixed, authorityDigest: fixed, evidenceDigest: fixed });
    assert.equal(plan.status, "READY");
    assert.equal(service.readBinding(plan.binding.digest).bundleRef.digest, candidate.bundle.digest);

    const revised = service.registerProjectDefinition({ ...definition, metadata: { ...definition.metadata, version: "1.1.0", labels: { ...definition.metadata.labels, release: "adjusted" } }, digest: undefined });
    assert.equal(service.readProjectDefinition("new-project")?.digest, revised.digest);
    const rollbackPlan = service.plan({ projectDefinitionId: "new-project", projectDefinitionVersion: "1.0.0", goalTarget: { projectId: "new-project", goalId: "goal-rollback", targetId: "target-rollback", objective: "publish npm", taskClass: "release", domain: "software", requiredCapabilities: ["build.execute"] }, candidates: [candidate], lifecycle, policyDigest: fixed, providerDigest: fixed, environmentDigest: fixed, hostDigest: fixed, runtimeDigest: fixed, authorityDigest: fixed, evidenceDigest: fixed });
    assert.equal(rollbackPlan.binding.projectDefinitionRef.version, "1.0.0");
    assert.equal(service.readProjectDefinition("new-project", "1.1.0")?.digest, revised.digest);
    assert.equal(service.readProjectDefinition("new-project", "1.0.0")?.digest, definition.digest);

    const proposal = service.createAutomationProposal({ id: "learned-ci-format", failureSignature: "ci-format", failureClass: "UNKNOWN", scope: { projectId: "new-project" }, strategy: "REPAIR_THEN_RETRY", maxAttempts: 2, preconditions: ["same-binding"], prohibitedEffects: ["publication"] });
    const rule = service.activateAutomationProposal(proposal.id, { proposalDigest: proposal.digest, actor: "project-owner", evidenceRef: "decision://learned-ci-format" });
    assert.equal(rule.status, "ACTIVE");
    assert.equal(service.decideRecovery({ failureClass: "UNKNOWN", failureSignature: "ci-format", bindingDigest: plan.binding.digest, attempt: 0, maxAttempts: 2, identicalInputs: true, reversible: true, externalEffect: false, projectId: "new-project" }).action, "AUTO_REPAIR");
    assert.equal(service.decideRecovery({ failureClass: "AUTHORITY_REQUIRED", failureSignature: "ci-format", bindingDigest: plan.binding.digest, attempt: 0, maxAttempts: 2, identicalInputs: true, reversible: true, externalEffect: false, projectId: "new-project" }).action, "HUMAN_DECISION");
    assert.equal(service.decideRecovery({ failureClass: "UNKNOWN", failureSignature: "ci-format", bindingDigest: plan.binding.digest, attempt: 0, maxAttempts: 2, identicalInputs: true, reversible: true, externalEffect: true, projectId: "new-project" }).action, "FAIL");

    const otherScope = { tenantId: "tenant-other", workspaceId: "workspace-other" };
    assert.equal(service.readProjectDefinition("new-project", undefined, otherScope), undefined);
    assert.equal(service.readBinding(plan.binding.digest, otherScope), undefined);
    assert.deepEqual(service.listAutomationRules(otherScope), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
