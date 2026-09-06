import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  FileLifecycleCatalog,
  LifecycleActionRegistry,
  LifecycleService,
  parseLifecycleYaml,
  resolveLifecycleInputs,
  resolveLifecycleRevision
} from "../../packages/server/dist/domains/lifecycle/index.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const lifecycleRoot = path.join(repositoryRoot, "lifecycles");
const digest = (character) => `sha256:${character.repeat(64)}`;

test("resolves imported YAML into a stable immutable lifecycle graph", () => {
  const catalog = new FileLifecycleCatalog([lifecycleRoot]);
  const first = catalog.resolve("evopilot-harness-oss", "1.0.0");
  const second = catalog.resolve("evopilot-harness-oss", "1.0.0");
  assert.equal(first.digest, second.digest);
  assert.deepEqual(first.graph.order, [
    "project-validation",
    "readiness",
    "oss-build",
    "evidence",
    "oss-verification",
    "harness-project-loop",
    "package-readiness",
    "public-publication"
  ]);
  assert.ok(first.sourceDigests.length >= 2);
  const selected = catalog.select({ labels: { audience: "enterprise-internal" }, goalText: "deliver an internal candidate" });
  assert.equal(selected.lifecycle.id, "datarig-enterprise-internal");
  assert.equal(selected.mode, "label-match");
});

test("rejects unknown fields, embedded executable fields, missing imports, cycles, and unregistered actions", () => {
  const valid = `
schema: evopilot-lifecycle-definition/v1alpha1
metadata: { id: custom, name: Custom, version: 1.0.0 }
stages:
  - id: validate
    name: Validate
    action: { uses: project.validate@1 }
    decision: { mode: AUTO }
`;
  assert.throws(() => parseLifecycleYaml({ sourceRef: "unknown.yaml", text: valid.replace("stages:", "unknown: true\nstages:") }), /LIFECYCLE_UNKNOWN_FIELD/);
  assert.throws(() => parseLifecycleYaml({ sourceRef: "script.yaml", text: valid.replace("action: { uses: project.validate@1 }", "action: { uses: project.validate@1, script: bad }") }), /LIFECYCLE_EXECUTABLE_FIELD_FORBIDDEN/);
  assert.throws(() => parseLifecycleYaml({ sourceRef: "action.yaml", text: valid.replace("project.validate@1", "shell.execute@1") }), /LIFECYCLE_ACTION_NOT_REGISTERED/);
  const emptyCatalog = { find: () => undefined };
  assert.throws(() => resolveLifecycleRevision({ sourceRef: "missing.yaml", text: valid.replace("stages:", "imports: [{ id: absent, version: 1.0.0 }]\nstages:") }, emptyCatalog), /LIFECYCLE_IMPORT_NOT_FOUND/);
  const cyclicA = valid.replace("id: custom", "id: a").replace("stages:", "imports: [{ id: b, version: 1.0.0 }]\nstages:");
  const cyclicB = valid.replace("id: custom", "id: b").replace("stages:", "imports: [{ id: a, version: 1.0.0 }]\nstages:");
  const cyclicCatalog = { find: (id) => ({ sourceRef: `${id}.yaml`, text: id === "a" ? cyclicA : cyclicB }) };
  assert.throws(() => resolveLifecycleRevision({ sourceRef: "a.yaml", text: cyclicA }, cyclicCatalog), /LIFECYCLE_IMPORT_CYCLE/);
});

test("uses one input contract for precedence, conditional questions, review, and SecretRef safety", () => {
  const revision = new FileLifecycleCatalog([lifecycleRoot]).resolve("datarig-enterprise-internal", "1.0.0");
  const first = resolveLifecycleInputs(revision, {
    projectFacts: { projectRoot: "/project", artifactChannel: "project-channel" },
    organizationDefaults: { artifactChannel: "organization-channel" },
    answers: { verificationProfile: "release", buildProfile: "candidate", testSuite: "full", artifactChannel: "user-channel" }
  });
  assert.equal(first.status, "READY_FOR_REVIEW");
  assert.equal(first.nextQuestion, undefined);
  assert.equal(first.values.artifactChannel.value, "user-channel");
  assert.equal(first.values.artifactChannel.source, "user");
  assert.throws(() => resolveLifecycleInputs(revision, {
    answers: { projectRoot: "/project", verificationProfile: "release", buildProfile: "candidate", testSuite: "full", artifactChannel: "internal", productionCredential: "raw-password" }
  }), /must be a SecretRef/);
  const complete = resolveLifecycleInputs(revision, {
    answers: { projectRoot: "/project", verificationProfile: "release", buildProfile: "candidate", testSuite: "full", artifactChannel: "internal", productionCredential: "secret:\/\/workspace\/release" }
  });
  assert.equal(complete.status, "READY_FOR_REVIEW");
  assert.equal(complete.review.find((item) => item.id === "productionCredential").displayValue, "<secret-ref>");
});

test("requires one exact plan authorization and pauses only at external or genuine authority boundaries", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-lifecycle-unit-"));
  const service = new LifecycleService(dataRoot, [lifecycleRoot]);
  let run = service.start({
    id: "oss-run",
    lifecycleId: "evopilot-harness-oss",
    lifecycleVersion: "1.0.0",
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    projectId: "evopilot-harness",
    goalId: "goal-a",
    policyDigest: digest("1"),
    runtimeDigest: digest("2"),
    harnessBundle: { id: "harness-bundle", version: "4.5.0", digest: digest("3") },
    executor: { host: "test-host", provider: "test-provider", model: "test-model", capabilities: ["build.execute", "test.execute", "goal-loop.execute", "release.publish"] },
    answers: { projectRoot: "/project", verificationProfile: "release", candidateVersion: "4.5.0", testSuite: "release", publicationChannel: "both" }
  });
  assert.equal(run.status, "WAITING_AUTHORIZATION");
  assert.throws(() => service.authorizePlan(run.id, "APPROVED", "user", "conversation:approval", digest("9")), /DIGEST_MISMATCH/);
  run = service.authorizePlan(run.id, "APPROVED", "user", "conversation:approval", run.binding.digest);
  run = service.advanceUntilBoundary(run.id);
  assert.equal(run.status, "WAITING_EXTERNAL_SIGNAL");
  assert.equal(run.pendingExecution.action, "build.verify");
  assert.equal(run.pendingExecution.bindingDigest, run.binding.digest);
  const buildRequestId = run.pendingExecution.id;
  run = service.recordExternalResult(run.id, { requestId: buildRequestId, status: "SUCCEEDED", receiptDigest: digest("4"), evidence: ["token=must-not-leak", "build=passed"] });
  assert.equal(run.stageAttempts.at(-1).evidence[0], "token=<redacted>");
  run = service.advanceUntilBoundary(run.id);
  assert.equal(run.pendingExecution.action, "test.verify");
  const feedback = service.createFeedbackPackage(run.id, { bindingDigest: run.binding.digest, actor: "user", evidenceRef: "human:feedback-export" });
  assert.equal(feedback.visibility, "PRIVATE");
  assert.equal(feedback.redaction, "STRICT");
  assert.equal(JSON.stringify(feedback).includes("must-not-leak"), false);
  assert.equal(service.createFeedbackPackage(run.id, { bindingDigest: run.binding.digest, actor: "user", evidenceRef: "human:feedback-export" }).digest, feedback.digest);
  assert.throws(() => service.createFeedbackPackage(run.id, { bindingDigest: digest("9"), actor: "user", evidenceRef: "human:feedback-export" }), /FEEDBACK_DIGEST_MISMATCH/);
  assert.equal(service.recordExternalResult(run.id, { requestId: buildRequestId, status: "SUCCEEDED", receiptDigest: digest("4") }).pendingExecution.action, "test.verify");
  assert.throws(() => service.recordExternalResult(run.id, { requestId: buildRequestId, status: "SUCCEEDED", receiptDigest: digest("5") }), /RECEIPT_CONFLICT/);
  const testRequestId = run.pendingExecution.id;
  run = service.recordExternalResult(run.id, { requestId: testRequestId, status: "UNCERTAIN", receiptDigest: digest("6"), evidence: ["mutation outcome is unknown"] });
  assert.equal(run.status, "WAITING_DECISION");
  assert.equal(run.pendingDecisionAuthority, "recovery");
  run = service.decide(run.id, run.currentStageId, "APPROVED", "user", "human:retry-uncertain-stage", run.binding.digest);
  run = service.advanceUntilBoundary(run.id);
  assert.equal(run.status, "WAITING_EXTERNAL_SIGNAL");
  assert.equal(run.pendingExecution.stageId, "oss-verification");
  assert.notEqual(run.pendingExecution.id, testRequestId);
});

test("keeps v3 maturity ladder as an explicit compatibility lifecycle", () => {
  const catalog = new FileLifecycleCatalog([lifecycleRoot]);
  const revision = catalog.resolve("v3-alpha-beta-rc-ga", "1.0.0");
  assert.deepEqual(revision.definition.stages.filter((stage) => ["alpha", "beta", "rc", "ga"].includes(stage.id)).map((stage) => stage.id), ["alpha", "beta", "rc", "ga"]);
  assert.ok(new LifecycleActionRegistry().resolve("evopilot.goal-loop@1"));
  const custom = catalog.resolve("documentation-hotfix", "1.0.0");
  assert.equal(custom.definition.metadata.labels.class, "documentation");
  assert.equal(custom.definition.stages.find((stage) => stage.id === "edit-documentation").action.uses, "agent.execute@1");
});

test("requires an exact binding and evidence to cancel a non-terminal run", () => {
  const service = new LifecycleService(fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-cancel-")), [lifecycleRoot]);
  let run = service.start({
    id: "cancel-run",
    lifecycleId: "documentation-hotfix",
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    projectId: "project-a",
    policyDigest: digest("1"),
    runtimeDigest: digest("2"),
    harnessBundle: { id: "bundle-a", version: "1.0.0", digest: digest("3") },
    executor: { host: "test-host", provider: "test-provider", model: "test-model", capabilities: ["agent.execute"] },
    answers: { projectRoot: "/project", documentationScope: ["README"] }
  });
  assert.throws(() => service.cancel(run.id, "owner", "human:cancel", digest("9")), /CANCELLATION_DIGEST_MISMATCH/);
  run = service.cancel(run.id, "owner", "human:cancel", run.binding.digest);
  assert.equal(run.status, "CANCELLED");
  assert.equal(run.decisions.at(-1).authority, "lifecycle-cancellation");
  assert.throws(() => service.cancel(run.id, "owner", "human:cancel-again", run.binding.digest), /CANCELLATION_NOT_PENDING/);
});

test("bridges a published Harness-backed Lifecycle to the existing Goal Loop action and stops before publication", () => {
  const service = new LifecycleService(fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-goal-bridge-")), [lifecycleRoot]);
  let run = service.start({
    id: "goal-bridge",
    lifecycleId: "evopilot-harness-oss",
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    projectId: "project-a",
    goalId: "goal-a",
    targetId: "target-a",
    policyDigest: digest("1"),
    runtimeDigest: digest("2"),
    evidenceDigest: digest("7"),
    harnessBundle: { id: "bundle-a", version: "1.0.0", digest: digest("3") },
    executor: { host: "workbuddy", provider: "provider-a", model: "model-a", capabilities: ["build.execute", "test.execute", "goal-loop.execute", "release.publish"] },
    answers: { projectRoot: "/project", verificationProfile: "release", candidateVersion: "4.5.0", testSuite: "release", publicationChannel: "both" }
  });
  run = service.authorizePlan(run.id, "APPROVED", "owner", "human:bounded-plan", run.binding.digest);
  run = service.advanceUntilBoundary(run.id);
  run = service.recordExternalResult(run.id, { requestId: run.pendingExecution.id, status: "SUCCEEDED", receiptDigest: digest("4") });
  run = service.advanceUntilBoundary(run.id);
  run = service.recordExternalResult(run.id, { requestId: run.pendingExecution.id, status: "SUCCEEDED", receiptDigest: digest("5") });
  run = service.advanceUntilBoundary(run.id);
  assert.equal(run.pendingExecution.action, "evopilot.goal-loop");
  assert.deepEqual({ goalId: run.pendingExecution.inputs.goalId, targetId: run.pendingExecution.inputs.targetId, projectId: run.pendingExecution.inputs.projectId }, { goalId: "goal-a", targetId: "target-a", projectId: "project-a" });
  run = service.recordExternalResult(run.id, { requestId: run.pendingExecution.id, status: "SUCCEEDED", receiptDigest: digest("6") });
  run = service.advanceUntilBoundary(run.id);
  assert.equal(run.status, "WAITING_DECISION");
  assert.equal(run.currentStageId, "public-publication");
  assert.equal(run.stageAttempts.some((attempt) => attempt.action === "release.publish@1"), false);
});
