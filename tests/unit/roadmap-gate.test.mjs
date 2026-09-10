import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

test("Roadmap Gate validates the contract and declared package version", () => {
  const result = run([]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.equal(result.body.intent, "static-roadmap-contract-validation");
});

test("Roadmap Gate binds the complete original v5 scheme and TRACE01-TRACE06", () => {
  const roadmap = JSON.parse(fs.readFileSync(path.join(root, "governance/roadmap.yaml"), "utf8"));
  const assurance = roadmap.acceptancePortfolio.completionAssurance;
  assert.equal(roadmap.acceptancePortfolio.completion, 6);
  assert.equal(roadmap.acceptancePortfolio.completionIds, "TRACE01-TRACE06");
  assert.equal(assurance.originalSchemeCoveragePercent, 100);
  assert.deepEqual(assurance.requiredAcceptanceIds, ["TRACE01", "TRACE02", "TRACE03", "TRACE04", "TRACE05", "TRACE06"]);
  assert.equal(assurance.bulkPassProjectionAllowed, false);
  assert.equal(assurance.silentExclusionAllowed, false);
  assert.equal(assurance.warningCountsAsPass, false);
  assert.equal(assurance.humanDeclarationSubstitutesForMachineEvidence, false);
});

test("Roadmap Gate rejects incomplete, generic, or weakened completion assurance", () => {
  for (const [name, mutate, pattern] of [
    ["99 percent coverage", (roadmap) => { roadmap.acceptancePortfolio.completionAssurance.originalSchemeCoveragePercent = 99; }, /100 percent/],
    ["bulk PASS", (roadmap) => { roadmap.acceptancePortfolio.completionAssurance.bulkPassProjectionAllowed = true; }, /bulk PASS/],
    ["missing validator", (roadmap) => { roadmap.acceptancePortfolio.completionAssurance.requiresTraceability = roadmap.acceptancePortfolio.completionAssurance.requiresTraceability.filter((item) => item !== "independent executable validator"); }, /independent executable validator/],
    ["old cutover timing", (roadmap) => { roadmap.legacySuiteTransition.postRelease.timing = "AFTER_PUBLIC_V5_RELEASE_AND_VERIFIED_INSTALLATION"; }, /completion successors/]
  ]) {
    const result = runWithRoadmap(mutate);
    assert.equal(result.status, 1, `${name}: ${result.stderr}`);
    assert.equal(result.body.classification, "INVALID");
    assert.match(result.body.errors.join(" "), pattern);
  }
});

test("Roadmap Gate rejects a COMPLETE completion successor without exact closure evidence", () => {
  const result = runWithRoadmap((roadmap) => {
    const milestone = roadmap.milestones.find((item) => item.id === "evopilot-5.0-harness-guided-governed-evolution-runtime");
    milestone.status = "COMPLETE";
    delete milestone.completionEvidence;
  });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.body.classification, "INVALID");
  assert.match(result.body.errors.join(" "), /COMPLETE requires a completion report/);
});

test("Roadmap Gate accepts current Runtime and Expert milestones in their verified COMPLETE terminal state", () => {
  const result = run([]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  const roadmap = JSON.parse(fs.readFileSync(path.join(root, "governance/roadmap.yaml"), "utf8"));
  for (const id of ["evopilot-5.0-harness-guided-governed-evolution-runtime", "evopilot-evolution-expert-1.0"]) {
    const milestone = roadmap.milestones.find((item) => item.id === id);
    assert.equal(milestone.status, "COMPLETE");
    assert.equal(milestone.completionEvidence.total, milestone.completionEvidence.passed);
    assert.equal(milestone.completionEvidence.noRegression, "PASSED");
    assert.equal(milestone.completionEvidence.exactInstalledCandidatePair, "VERIFIED");
  }
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

  const runtimeV501 = run(["--release-version", "5.0.1"]);
  assert.equal(runtimeV501.status, 0, runtimeV501.stderr);
  assert.equal(runtimeV501.body.classification, "ALIGNED");

  const expert = run(["--release-product", "evopilot-evolution-expert", "--release-version", "1.0.0"]);
  assert.equal(expert.status, 0, expert.stderr);
  assert.equal(expert.body.classification, "ALIGNED");
  assert.ok(expert.body.matchedMilestones.includes("evopilot-evolution-expert-1.0"));

  const expert101 = run(["--release-product", "evopilot-evolution-expert", "--release-version", "1.0.1"]);
  assert.equal(expert101.status, 0, expert101.stderr);
  assert.equal(expert101.body.classification, "ALIGNED");

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

function runWithRoadmap(mutate) {
  const roadmap = JSON.parse(fs.readFileSync(path.join(root, "governance/roadmap.yaml"), "utf8"));
  mutate(roadmap);
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-roadmap-gate-"));
  const contractPath = path.join(tempDirectory, "roadmap.json");
  fs.writeFileSync(contractPath, `${JSON.stringify(roadmap, null, 2)}\n`);
  try {
    const result = spawnSync(process.execPath, ["scripts/roadmap-gate.mjs", "--json"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, EVOPILOT_ROADMAP_CONTRACT: contractPath }
    });
    return { ...result, body: JSON.parse(result.stdout) };
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}
