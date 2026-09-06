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

test("Roadmap Gate allows AgentTrajectory work inside the v4 Lifecycle foundation", () => {
  const result = run(["--intent", "Add AgentTrajectory, RewardContract, and an approved execution feedback package"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-4.0-open-lifecycle-harness"));
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
  const declared = run(["--release-version", "4.0.4"]);
  assert.equal(declared.status, 0, declared.stderr);
  assert.equal(declared.body.classification, "ALIGNED");

  const deferred = run(["--release-version", "3.2.0"]);
  assert.equal(deferred.status, 2);
  assert.equal(deferred.body.classification, "UNPLANNED");
  assert.ok(deferred.body.matchedMilestones.includes("evopilot-3.2-bundle-consumer-closure"));
  assert.match(deferred.body.reasons[0], /DEFERRED/);

  const undeclared = run(["--release-version", "3.3.0"]);
  assert.equal(undeclared.status, 2);
  assert.equal(undeclared.body.classification, "UNPLANNED");
});

test("Roadmap Gate requires explicit reactivation for deferred milestone work", () => {
  const result = run(["--intent", "Add immutable bundle binding and digest revalidation"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "DEVIATION");
  assert.ok(result.body.matchedMilestones.includes("evopilot-3.2-bundle-consumer-closure"));
  assert.equal(result.body.boundaryImpact, "ROADMAP_REVISION_REQUIRED");
});

function run(args) {
  const result = spawnSync(process.execPath, ["scripts/roadmap-gate.mjs", ...args, "--json"], { cwd: root, encoding: "utf8" });
  return { ...result, body: JSON.parse(result.stdout) };
}
