import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalDigest } from "../../packages/core/dist/index.js";
import { GovernedEvolutionService } from "../../packages/server/dist/domains/governed-evolution/index.js";
import { LifecycleService } from "../../packages/server/dist/domains/lifecycle/index.js";

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
    const candidate = { profile: { id: "software-release", version: "1", digest: profileDigest, catalogId: "public", catalogDigest: d("catalog"), registryDigest: d("registry"), domains: ["software"], taskClasses: ["release"], positiveConcepts: ["npm"], negativeConcepts: [] }, bundle: { id: "software-release", version: "1", digest: d("bundle"), profileDigest, componentDigests: [d("component")], requiredEvidence: ["tests"], validators: ["integrity"], constraints: ["no-rebuild"], capabilities: ["build.execute"], permissions: ["build.verify"] }, published: true, eligible: true };
    const lifecycle = { ref: { id: "oss", version: "1" }, digest: d("lifecycle"), definition: { capabilities: ["build.execute"], obligations: { requiredEvidence: ["sbom"], validators: ["signature"], constraints: ["candidate-first"], requestedPermissions: ["build.verify"] } } };
    const fixed = d("fixed");
    const plan = service.plan({ projectDefinitionId: "new-project", goalTarget: { projectId: "new-project", goalId: "goal-1", targetId: "target-1", objective: "publish npm", taskClass: "release", domain: "software", requiredCapabilities: ["build.execute"] }, candidates: [candidate], lifecycle, policyDigest: fixed, providerDigest: fixed, environmentDigest: fixed, hostDigest: fixed, runtimeDigest: fixed, authorityDigest: fixed, evidenceDigest: fixed });
    assert.equal(plan.status, "READY");
    assert.equal(service.readBinding(plan.binding.digest).bundleRef.digest, candidate.bundle.digest);

    const revised = service.registerProjectDefinition({ ...definition, metadata: { ...definition.metadata, version: "1.1.0", labels: { ...definition.metadata.labels, release: "adjusted" } }, digest: undefined });
    assert.equal(service.readProjectDefinition("new-project")?.digest, definition.digest);
    const rollbackPlan = service.plan({ projectDefinitionId: "new-project", projectDefinitionVersion: "1.0.0", goalTarget: { projectId: "new-project", goalId: "goal-rollback", targetId: "target-rollback", objective: "publish npm", taskClass: "release", domain: "software", requiredCapabilities: ["build.execute"] }, candidates: [candidate], lifecycle, policyDigest: fixed, providerDigest: fixed, environmentDigest: fixed, hostDigest: fixed, runtimeDigest: fixed, authorityDigest: fixed, evidenceDigest: fixed });
    assert.equal(rollbackPlan.binding.projectDefinitionRef.version, "1.0.0");
    assert.equal(service.readProjectDefinition("new-project", "1.1.0")?.digest, revised.digest);
    assert.equal(service.readProjectDefinition("new-project", "1.0.0")?.digest, definition.digest);
    const impact = service.compareProjectDefinitionVersions("new-project", "1.0.0", "1.1.0");
    assert.equal(impact.compatibility, "REQUIRES_REVALIDATION");
    const activated = service.activateProjectDefinitionVersion("new-project", "1.1.0", "owner", "decision://activate");
    assert.equal(activated.version, "1.1.0");
    assert.equal(service.readProjectDefinition("new-project")?.digest, revised.digest);
    const rolledBack = service.activateProjectDefinitionVersion("new-project", "1.0.0", "owner", "decision://rollback");
    assert.equal(rolledBack.version, "1.0.0");
    assert.equal(service.readProjectDefinition("new-project")?.digest, definition.digest);

    const proposal = service.createAutomationProposal({ id: "learned-ci-format", failureSignature: "ci-format", failureClass: "UNKNOWN", scope: { projectId: "new-project" }, strategy: "REPAIR_THEN_RETRY", maxAttempts: 2, preconditions: ["same-binding"], prohibitedEffects: ["publication"] });
    const rule = service.activateAutomationProposal(proposal.id, { proposalDigest: proposal.digest, actor: "project-owner", evidenceRef: "decision://learned-ci-format" });
    assert.equal(rule.status, "ACTIVE");
    assert.equal(service.decideRecovery({ failureClass: "UNKNOWN", failureSignature: "ci-format", bindingDigest: plan.binding.digest, attempt: 0, maxAttempts: 2, identicalInputs: true, reversible: true, externalEffect: false, projectId: "new-project" }).action, "AUTO_REPAIR");
    const unknown = service.decideRecovery({ failureClass: "UNKNOWN", failureSignature: "new-safe-mechanics", bindingDigest: plan.binding.digest, attempt: 0, maxAttempts: 2, identicalInputs: true, reversible: true, externalEffect: false, projectId: "new-project", lifecycleId: "oss", actionId: "build.verify", hostId: "codex" });
    assert.equal(unknown.action, "PROPOSE_AUTOMATION_RULE");
    assert.match(unknown.proposalRef.digest, /^sha256:/);
    assert.equal(service.listAutomationProposals().some((item) => item.id === unknown.proposalRef.id), true);
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

test("actual Lifecycle run guards the HarnessExecutionBinding and auto-recovers a safe retry", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-v5-guarded-"));
  try {
    const lifecycleRoot = path.join(root, "lifecycles");
    fs.mkdirSync(lifecycleRoot);
    fs.writeFileSync(path.join(lifecycleRoot, "guarded.yaml"), `schema: evopilot-lifecycle-definition/v1alpha1
metadata: { id: guarded, name: Guarded, version: 1.0.0 }
capabilities: [build.execute, goal-loop.execute]
obligations:
  requiredEvidence: [tests]
  validators: [integrity]
  constraints: [no-rebuild]
  requestedPermissions: [build.verify]
stages:
  - id: goal-loop
    name: Goal loop
    action: { uses: evopilot.goal-loop@1 }
    decision: { mode: EXTERNAL_SIGNAL }
    retry: { maxAttempts: 2 }
`);
    const evolution = new GovernedEvolutionService(root);
    const lifecycle = new LifecycleService(root, [lifecycleRoot]);
    const scope = { tenantId: "tenant", workspaceId: "workspace" };
    lifecycle.configureGovernanceHooks({
      verifyBoundary: ({ tenantId, workspaceId, ...input }) => evolution.assertLifecycleBoundary({ ...input, currentState: {
        projectDefinitionDigest: definition.digest,
        goalTargetDigest: plan.binding.goalTargetDigest,
        registryDigest: candidate.profile.registryDigest,
        catalogDigests: { [candidate.profile.catalogId]: candidate.profile.catalogDigest },
        profiles: [{ id: candidate.profile.id, version: candidate.profile.version, digest: candidate.profile.digest }],
        bundles: [{ id: candidate.bundle.id, version: candidate.bundle.version, digest: candidate.bundle.digest, componentDigests: candidate.bundle.componentDigests }],
        lifecycleDigest: plan.binding.lifecycleRef.digest,
        compositionDigest: plan.binding.compositionDigest,
        policyDigest: fixed,
        providerDigest: fixed,
        environmentDigest: fixed,
        hostDigest: executor.digest,
        runtimeDigest: fixed,
        authorityDigest: fixed,
        evidenceDigest: fixed
      } }, { tenantId, workspaceId }),
      decideRecovery: ({ tenantId, workspaceId, ...input }) => evolution.decideRecovery(input, { tenantId, workspaceId }),
      suspendRule: (rule, evidenceRef, currentScope) => { evolution.suspendAutomationRule(rule.id, rule.revision, evidenceRef, currentScope); }
    });
    const definition = evolution.registerProjectDefinition({ schema: "evopilot-evolution-project-definition/v1", metadata: { id: "guarded-project", name: "Guarded", version: "1.0.0", labels: {} }, spec: { source: { provider: "github", repository: "org/guarded", defaultBranch: "main", mode: "owned" }, ecosystem: { languages: ["typescript"], packageManagers: ["npm"], frameworks: [] }, delivery: { model: "open-source", ciProvider: "github-actions", candidateBeforeAcceptance: true, noRebuildPromotion: true, channels: ["npm"] }, environment: { development: "local", acceptance: "isolated" }, policyRefs: [], lifecycleRefs: ["guarded@1.0.0"], secretRefs: [], hostPreferences: ["codex"], runtimePreferences: ["local"], evidenceSources: ["ci"] } }, scope);
    const profileDigest = d("guarded-profile");
    const candidate = { profile: { id: "guarded", version: "1.0.0", digest: profileDigest, catalogId: "public", catalogDigest: d("catalog"), registryDigest: d("registry"), domains: ["software"], taskClasses: ["change"], positiveConcepts: ["change"], negativeConcepts: [] }, bundle: { id: "guarded-bundle", version: "1.0.0", digest: d("bundle"), profileDigest, componentDigests: [d("component")], requiredEvidence: ["tests"], validators: ["integrity"], constraints: ["no-rebuild"], capabilities: ["build.execute", "goal-loop.execute"], permissions: ["build.verify"] }, published: true, eligible: true };
    const executorMaterial = { host: "codex", provider: "openai", model: "configured", capabilities: ["goal-loop.execute"] };
    const executor = { ...executorMaterial, digest: d(executorMaterial) };
    const fixed = d("fixed");
    const goalTarget = { projectId: definition.metadata.id, goalId: "goal", targetId: "target", objective: "change code", taskClass: "change", domain: "software", requiredCapabilities: ["build.execute"] };
    const plan = evolution.plan({ projectDefinitionId: definition.metadata.id, goalTarget, candidates: [candidate], lifecycle: lifecycle.catalog.resolve("guarded", "1.0.0"), policyDigest: fixed, providerDigest: fixed, environmentDigest: fixed, hostDigest: executor.digest, runtimeDigest: fixed, authorityDigest: fixed, evidenceDigest: fixed }, scope);
    let run = lifecycle.start({ lifecycleId: "guarded", lifecycleVersion: "1.0.0", tenantId: scope.tenantId, workspaceId: scope.workspaceId, projectId: definition.metadata.id, goalId: goalTarget.goalId, targetId: goalTarget.targetId, policyDigest: fixed, providerDigest: fixed, environmentDigest: fixed, authorityDigest: fixed, runtimeDigest: fixed, evidenceDigest: fixed, harnessExecutionBindingDigest: plan.binding.digest, harnessBundle: { id: candidate.bundle.id, version: candidate.bundle.version, digest: candidate.bundle.digest, catalogId: candidate.profile.catalogId }, executor });
    assert.deepEqual(run.boundaryEvidence.map((item) => item.checkpoint), ["start"]);
    run = lifecycle.authorizePlan(run.id, "APPROVED", "owner", "decision://plan", run.binding.digest);
    run = lifecycle.advanceUntilBoundary(run.id);
    assert.equal(run.status, "WAITING_EXTERNAL_SIGNAL");
    assert.deepEqual(run.boundaryEvidence.map((item) => item.checkpoint), ["start", "resume", "loop-iteration"]);
    run = lifecycle.recordExternalResult(run.id, { requestId: run.pendingExecution.id, status: "FAILED", receiptDigest: d("failed"), evidence: ["transient"], failure: { class: "TRANSIENT", signature: "network-reset", identicalInputs: true, reversible: true, externalEffect: false } });
    assert.equal(run.status, "RUNNING");
    assert.equal(run.recoveryHistory.at(-1).action, "AUTO_RETRY");
    run = lifecycle.advanceUntilBoundary(run.id);
    assert.equal(run.status, "WAITING_EXTERNAL_SIGNAL");
    assert.ok(run.boundaryEvidence.some((item) => item.checkpoint === "retry"));
    const reconciledReceipt = d("confirmed-external-mutation");
    run = lifecycle.recordExternalResult(run.id, { requestId: run.pendingExecution.id, status: "FAILED", receiptDigest: d("reconciliation-report"), evidence: ["external response lost"], failure: { class: "EXTERNAL_SAFE_RETRY", signature: "response-lost", mutationReceipt: reconciledReceipt, identicalInputs: true, reversible: true, externalEffect: true } });
    assert.equal(run.recoveryHistory.at(-1).action, "RESUME_FROM_RECEIPT");
    assert.equal(run.stageAttempts.at(-1).status, "SUCCEEDED");
    assert.equal(run.stageAttempts.at(-1).receiptDigest, reconciledReceipt);
    run = lifecycle.advanceUntilBoundary(run.id);
    assert.equal(run.status, "SUCCEEDED");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
