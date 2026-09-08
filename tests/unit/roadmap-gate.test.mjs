import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

test("Roadmap Gate validates the contract and declared package version", () => {
  const result = run([]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.equal(result.body.intent, "static-roadmap-contract-validation");
});

test("Roadmap Gate preserves AgentTrajectory work inside the completed v4 foundation", () => {
  const result = run(["--intent", "Add AgentTrajectory, RewardContract, and an approved execution feedback package"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-4.0-open-lifecycle-harness"));
});

test("Roadmap Gate aligns the v5 Harness-guided Goal Target Loop", () => {
  const result = run(["--intent", "Implement the v5 harness-guided goal target loop with an immutable HarnessBundle and open lifecycle"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-5.0-harness-guided-governed-evolution-runtime"));
});

test("Roadmap Gate aligns the independently versioned Evolution Expert", () => {
  const result = run(["--intent", "Implement the independently versioned EvoPilot Evolution Expert Codex and WorkBuddy adapters"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-evolution-expert-1.0"));
});

test("Roadmap Gate aligns pre-release legacy Suite independence proof", () => {
  const result = run(["--intent", "Keep independently evolving EvoPilot and DataRig Codex Suites active before v5 release, prove isolated Candidate independence using late-bound exact snapshots, and perform any real retirement only after public v5 installation verification through a separate Cutover Target and human authorization"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-5.0-harness-guided-governed-evolution-runtime"));
});

test("Roadmap Gate aligns separately governed post-release legacy Suite Cutover", () => {
  const result = run(["--intent", "Execute post-release legacy suite cutover through a legacy suite cutover target"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-post-v5.0.0-legacy-suite-cutover"));
});

test("Roadmap Gate allows repository evolution governance without changing product behavior", () => {
  const result = run(["--intent", "Add conversational orchestrator and Roadmap binding for evolution governance"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.ok(result.body.matchedStandingWork.includes("evopilot-evolution-governance"));
});

test("Roadmap Gate stops unplanned product capability work", () => {
  const result = run(["--intent", "Add customer invoicing and a public plugin marketplace"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "UNPLANNED");
  assert.equal(result.body.approvalRequired, true);
});

test("Roadmap Gate does not let maintenance wording authorize a product capability", () => {
  const result = run(["--intent", "Add customer billing lifecycle and dependency maintenance automation"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "UNPLANNED");
  assert.ok(result.body.matchedStandingWork.includes("evopilot-maintenance"));
});

test("Roadmap Gate blocks Harness production inside EvoPilot", () => {
  const result = run(["--intent", "Make EvoPilot publish Harness automatically"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "BOUNDARY_CHANGE");
  assert.equal(result.body.boundaryImpact, "REPLACEMENT_ADR_REQUIRED");
});

test("Roadmap Gate blocks Lifecycle-only execution that makes Harness optional", () => {
  const result = run(["--intent", "Make Harness optional and execute a lifecycle-only goal loop"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "BOUNDARY_CHANGE");
});

test("Roadmap Gate blocks Lifecycle weakening of Harness evidence", () => {
  const result = run(["--intent", "Let Lifecycle disable required Harness validators and evidence"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "BOUNDARY_CHANGE");
});

test("Roadmap Gate blocks Expert-owned Harness selection", () => {
  const result = run(["--intent", "Let Evolution Expert choose and fabricate a Harness from conversation"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "BOUNDARY_CHANGE");
});

test("Roadmap Gate blocks real legacy Suite retirement before v5 release", () => {
  const result = run(["--intent", "Retire legacy Suites before v5 release"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "BOUNDARY_CHANGE");
  assert.match(result.body.reasons.join(" "), /legacy-suite-retirement-must-be-post-release/);
});

test("Roadmap Gate stops explicit milestone-order deviations", () => {
  const result = run(["--intent", "Skip milestone and replace Roadmap direction"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "DEVIATION");
  assert.equal(result.body.boundaryImpact, "ROADMAP_REVISION_REQUIRED");
});

test("Roadmap Gate stops an empty intent as unknown", () => {
  const result = run(["--intent", ""]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "UNKNOWN");
  assert.equal(result.body.approvalRequired, true);
});

test("Roadmap Gate permits declared releases and rejects undeclared release lines", () => {
  const runtimeV4 = run(["--release-version", "4.0.4"]);
  assert.equal(runtimeV4.status, 0, runtimeV4.stderr);
  assert.equal(runtimeV4.body.classification, "ALIGNED");

  const runtimeV5 = run(["--release-version", "5.0.0"]);
  assert.equal(runtimeV5.status, 0, runtimeV5.stderr);
  assert.equal(runtimeV5.body.classification, "ALIGNED");
  assert.ok(runtimeV5.body.matchedMilestones.includes("evopilot-5.0-harness-guided-governed-evolution-runtime"));

  const expert = run(["--release-product", "evopilot-evolution-expert", "--release-version", "1.0.0"]);
  assert.equal(expert.status, 0, expert.stderr);
  assert.equal(expert.body.classification, "ALIGNED");
  assert.ok(expert.body.matchedMilestones.includes("evopilot-evolution-expert-1.0"));

  const expertAsRuntime = run(["--release-version", "1.0.0"]);
  assert.equal(expertAsRuntime.status, 2);
  assert.equal(expertAsRuntime.body.classification, "UNPLANNED");

  const deferred = run(["--release-version", "3.2.0"]);
  assert.equal(deferred.status, 2);
  assert.equal(deferred.body.classification, "UNPLANNED");
  assert.ok(deferred.body.matchedMilestones.includes("evopilot-3.2-bundle-consumer-closure"));
  assert.match(deferred.body.reasons[0], /DEFERRED/);

  const undeclared = run(["--release-version", "3.3.0"]);
  assert.equal(undeclared.status, 2);
  assert.equal(undeclared.body.classification, "UNPLANNED");
});

test("Roadmap Gate requires explicit reactivation for a standalone deferred v3.2 line", () => {
  const result = run(["--intent", "Reactivate standalone v3.2 Bundle Consumer Closure"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "DEVIATION");
  assert.ok(result.body.matchedMilestones.includes("evopilot-3.2-bundle-consumer-closure"));
  assert.equal(result.body.boundaryImpact, "ROADMAP_REVISION_REQUIRED");
});

function run(args) {
  const result = spawnSync(process.execPath, ["scripts/roadmap-gate.mjs", ...args, "--json"], { cwd: root, encoding: "utf8" });
  return { ...result, body: JSON.parse(result.stdout) };
}
