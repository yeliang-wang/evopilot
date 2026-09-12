import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
    ["old cutover timing", (roadmap) => { roadmap.legacySuiteTransition.postRelease.timing = "AFTER_PUBLIC_COMPLETION_SUCCESSORS_AND_VERIFIED_INSTALLATION"; }, /Runtime 6.0 and Expert 2.0/],
    ["historical Suite compatibility", (roadmap) => { roadmap.legacySuiteTransition.migrationBaseline.supersededVersionCompatibilityRequired = true; }, /superseded Suite compatibility/],
    ["continued independent Suite evolution", (roadmap) => { roadmap.legacySuiteTransition.postCutover.independentFeatureEvolution = true; }, /must not continue independent feature evolution/],
    ["partial capability inventory", (roadmap) => { roadmap.suiteConvergenceAcceptance.capabilityInventoryCoveragePercent = 99; }, /100 percent/],
    ["Suite runtime dependency", (roadmap) => { roadmap.suiteConvergenceAcceptance.runtimeDependency = true; }, /Runtime dependencies/],
    ["optional Expert", (roadmap) => { roadmap.evolutionExpertPolicy.mandatoryForOrdinaryHumans = false; }, /ordinary-human/],
    ["file Lifecycle truth", (roadmap) => { roadmap.lifecycleHarnessPolicy.sourceOfTruth = "project file directory"; }, /governed Registry/],
    ["embedded Agent Runtime fallback", (roadmap) => { delete roadmap.agentRuntimePolicy.noEmbeddedFallback; }, /fallback/],
    ["incomplete v6 E2E", (roadmap) => { roadmap.agentNativeLifecycleControlPlaneAcceptance.requiredEndToEnd.pop(); }, /exactly 20/]
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

test("Roadmap Gate binds the v6 Runtime, Expert 2.0, superseded unreleased lines, Cutover, and rescheduled milestones", () => {
  const roadmap = JSON.parse(fs.readFileSync(path.join(root, "governance/roadmap.yaml"), "utf8"));
  assert.equal(roadmap.versionPolicy.publishedBaseline, "5.0.1");
  assert.equal(roadmap.versionPolicy.currentWorkingVersion, "6.0.0");
  assert.equal(roadmap.evolutionExpertPolicy.publishedBaseline, "1.0.1");
  assert.equal(roadmap.evolutionExpertPolicy.currentWorkingVersion, "2.0.0");
  assert.equal(roadmap.evolutionExpertPolicy.mandatoryForOrdinaryHumans, true);
  assert.equal(roadmap.humanInteractionProtocol.canonicalOrdinaryHumanProtocol, "MCP");
  assert.match(roadmap.lifecycleHarnessPolicy.sourceOfTruth, /Lifecycle Registry/);
  assert.equal(roadmap.agentRuntimePolicy.externalExecutionRequiredForSourceWork, true);
  assert.equal(roadmap.legacySuiteTransition.migrationBaseline.policy, "LATEST_ONLY_NO_HISTORICAL_COMPATIBILITY");
  assert.equal(roadmap.legacySuiteTransition.migrationBaseline.supersededVersionCompatibilityRequired, false);
  assert.equal(roadmap.legacySuiteTransition.postCutover.independentFeatureEvolution, false);
  assert.equal(roadmap.suiteConvergenceAcceptance.roleAfterV6Revision, "FROZEN_REFERENCE_AND_MIGRATION_EVIDENCE_ONLY");
  assert.equal(roadmap.suiteConvergenceAcceptance.ongoingSynchronizationRequired, false);
  assert.equal(roadmap.milestones.find((item) => item.id === "evopilot-5.1-suite-capability-convergence")?.status, "SUPERSEDED");
  assert.equal(roadmap.milestones.find((item) => item.id === "evopilot-evolution-expert-1.1-unified-host-entry")?.status, "SUPERSEDED");
  assert.equal(roadmap.milestones.find((item) => item.id === "evopilot-6.0-agent-native-lifecycle-control-plane")?.status, "IN_PROGRESS");
  assert.equal(roadmap.milestones.find((item) => item.id === "evopilot-evolution-expert-2.0-agent-host-entry")?.status, "IN_PROGRESS");
  assert.equal(roadmap.milestones.find((item) => item.id === "evopilot-post-v6.0.0-legacy-suite-cutover")?.standaloneReleaseEligible, false);
  assert.equal(roadmap.milestones.find((item) => item.id === "evopilot-6.1-controlled-experiment-loop")?.targetVersion, "6.1.0");
  assert.equal(roadmap.milestones.find((item) => item.id === "evopilot-6.2-learning-interop")?.targetVersion, "6.2.0");
});

test("completed v5 contract is verified as immutable history after the v6 Roadmap becomes current", () => {
  const current = runCompletionContractCheck();
  assert.equal(current.status, 0, current.stderr);
  assert.match(current.stdout, /historical v5 completion contract verified/);

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-v5-history-"));
  const contractPath = path.join(tempDirectory, "v5-completion-contract.json");
  const contract = JSON.parse(fs.readFileSync(path.join(root, "governance/acceptance/v5-completion-contract.json"), "utf8"));
  contract.targetBindings[0].fileDigest = `sha256:${"0".repeat(64)}`;
  const { digest: _oldDigest, ...material } = contract;
  contract.digest = stableDigest(material);
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  try {
    const tampered = runCompletionContractCheck(contractPath);
    assert.equal(tampered.status, 1, tampered.stdout);
    assert.match(tampered.stderr, /Target bindings do not match/);

    const regeneration = spawnSync(process.execPath, ["scripts/build-v5-completion-contract.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, EVOPILOT_V5_COMPLETION_CONTRACT: contractPath }
    });
    assert.equal(regeneration.status, 1, regeneration.stdout);
    assert.match(regeneration.stderr, /immutable/);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("accepted v6 Targets validate against the immutable completion contract without regeneration", () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-v6-accepted-contract-"));
  const runtimeTarget = path.join(tempDirectory, "runtime-target.json");
  const expertTarget = path.join(tempDirectory, "expert-target.json");
  const contractPath = path.join(tempDirectory, "v6-completion-contract.json");
  const crossPath = path.join(tempDirectory, "v6-cross-acceptance-map.json");
  try {
    projectAcceptedTarget(
      path.join(root, "governance/targets/evopilot-v6.0.0-agent-native-lifecycle-control-plane.json"),
      runtimeTarget
    );
    projectAcceptedTarget(
      path.join(root, "governance/targets/evopilot-evolution-expert-v2.0.0-agent-host-entry.json"),
      expertTarget
    );
    fs.copyFileSync(path.join(root, "governance/acceptance/v6-completion-contract.json"), contractPath);
    fs.copyFileSync(path.join(root, "governance/acceptance/runtime-6.0.0-expert-2.0.0-cross-acceptance-map.json"), crossPath);

    const accepted = runV6CompletionContractCheck({ runtimeTarget, expertTarget, contractPath, crossPath });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /immutable accepted v6 completion contract verified/);

    const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    contract.requiredCriteria.pop();
    const { digest: _oldDigest, ...material } = contract;
    contract.digest = stableDigest(material);
    fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
    const weakened = runV6CompletionContractCheck({ runtimeTarget, expertTarget, contractPath, crossPath });
    assert.equal(weakened.status, 1, weakened.stdout);
    assert.match(weakened.stderr, /exactly 253 criteria and validators/);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
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

test("Roadmap Gate rejects the superseded v5.1 Suite capability convergence line", () => {
  const result = run(["--intent", "Productize the exact latest EvoPilot Suite 3.2.1 and DataRig Suite 2.1.5 through suite capability convergence"]);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.body.classification, "UNPLANNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-5.1-suite-capability-convergence"));
});

test("Roadmap Gate aligns separately governed post-release legacy Suite Cutover", () => {
  const result = run(["--intent", "Execute post-release legacy suite cutover through a legacy suite cutover target"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-post-v6.0.0-legacy-suite-cutover"));
});

test("Roadmap Gate aligns the complete approved v6 Agent-native control-plane intent", () => {
  const result = run(["--intent", "Implement the v6 agent-native lifecycle control plane with Evolution Expert over MCP, tenant workspace Lifecycle Registry CRUD, qualified external Agent Runtime, Host Integration Bundle, and a Harness-guided Goal Target Loop"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-6.0-agent-native-lifecycle-control-plane"));
  assert.ok(result.body.matchedMilestones.includes("evopilot-evolution-expert-2.0-agent-host-entry"));
});

test("Roadmap Gate rejects a composite capability intent when only one clause is planned", () => {
  const result = run(["--intent", "Implement the independently versioned EvoPilot Evolution Expert; add customer invoicing"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "UNPLANNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-evolution-expert-1.0"));
  assert.match(result.body.reasons.join(" "), /uncovered-clause: add customer invoicing/);
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

test("Roadmap Gate blocks real legacy Suite retirement before v6 release", () => {
  const result = run(["--intent", "Retire legacy Suites before v6 release"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "BOUNDARY_CHANGE");
  assert.match(result.body.reasons.join(" "), /legacy-suite-retirement-must-be-post-release/);
});

test("Roadmap Gate blocks bypassing Expert and MCP for ordinary-human operation", () => {
  const result = run(["--intent", "Allow ordinary user direct CLI and bypass Evolution Expert"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "BOUNDARY_CHANGE");
  assert.match(result.body.reasons.join(" "), /ordinary-human-entry-must-use-expert-mcp/);
});

test("Roadmap Gate blocks file catalogs as production Lifecycle truth", () => {
  const result = run(["--intent", "Use a production file Lifecycle Catalog as the source of truth"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "BOUNDARY_CHANGE");
  assert.match(result.body.reasons.join(" "), /production-lifecycle-must-not-use-file-catalog-as-truth/);
});

test("Roadmap Gate blocks unqualified or embedded project execution", () => {
  const result = run(["--intent", "Let Runtime edit project source directly with an embedded coding Agent fallback"]);
  assert.equal(result.status, 2);
  assert.equal(result.body.classification, "BOUNDARY_CHANGE");
  assert.match(result.body.reasons.join(" "), /project-source-work-must-use-qualified-agent-runtime/);
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

  const runtimeV51 = run(["--release-version", "5.1.0"]);
  assert.equal(runtimeV51.status, 2, runtimeV51.stderr);
  assert.equal(runtimeV51.body.classification, "UNPLANNED");
  assert.ok(runtimeV51.body.matchedMilestones.includes("evopilot-5.1-suite-capability-convergence"));

  const runtimeV6 = run(["--release-version", "6.0.0"]);
  assert.equal(runtimeV6.status, 0, runtimeV6.stderr);
  assert.equal(runtimeV6.body.classification, "ALIGNED");
  assert.ok(runtimeV6.body.matchedMilestones.includes("evopilot-6.0-agent-native-lifecycle-control-plane"));

  const expert = run(["--release-product", "evopilot-evolution-expert", "--release-version", "1.0.0"]);
  assert.equal(expert.status, 0, expert.stderr);
  assert.equal(expert.body.classification, "ALIGNED");
  assert.ok(expert.body.matchedMilestones.includes("evopilot-evolution-expert-1.0"));

  const expert101 = run(["--release-product", "evopilot-evolution-expert", "--release-version", "1.0.1"]);
  assert.equal(expert101.status, 0, expert101.stderr);
  assert.equal(expert101.body.classification, "ALIGNED");

  const expert11 = run(["--release-product", "evopilot-evolution-expert", "--release-version", "1.1.0"]);
  assert.equal(expert11.status, 2, expert11.stderr);
  assert.equal(expert11.body.classification, "UNPLANNED");
  assert.ok(expert11.body.matchedMilestones.includes("evopilot-evolution-expert-1.1-unified-host-entry"));

  const expert2 = run(["--release-product", "evopilot-evolution-expert", "--release-version", "2.0.0"]);
  assert.equal(expert2.status, 0, expert2.stderr);
  assert.equal(expert2.body.classification, "ALIGNED");
  assert.ok(expert2.body.matchedMilestones.includes("evopilot-evolution-expert-2.0-agent-host-entry"));

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

function runCompletionContractCheck(contractPath) {
  return spawnSync(process.execPath, ["scripts/build-v5-completion-contract.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
    env: contractPath ? { ...process.env, EVOPILOT_V5_COMPLETION_CONTRACT: contractPath } : process.env
  });
}

function runV6CompletionContractCheck({ runtimeTarget, expertTarget, contractPath, crossPath }) {
  return spawnSync(process.execPath, ["scripts/build-v6-completion-contract.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      EVOPILOT_V6_RUNTIME_TARGET: runtimeTarget,
      EVOPILOT_V6_EXPERT_TARGET: expertTarget,
      EVOPILOT_V6_COMPLETION_CONTRACT: contractPath,
      EVOPILOT_V6_CROSS_ACCEPTANCE_MAP: crossPath
    }
  });
}

function projectAcceptedTarget(source, destination) {
  const target = JSON.parse(fs.readFileSync(source, "utf8"));
  target.status = "RELEASE_AUTHORIZED";
  target.noRegression = { status: "PASSED", evidenceRefs: ["acceptance:test/no-regression"] };
  target.approvals.release = {
    decision: "AUTHORIZED",
    by: "test",
    evidenceRef: "acceptance:test/release-authorization",
    authorizationDigest: `sha256:${"a".repeat(64)}`
  };
  for (const criterion of [target.acceptance, target.inheritedAcceptance, target.realCaseCoverage].flat()) {
    criterion.status = "PASSED";
    criterion.evidenceRefs = [`acceptance:test/${criterion.id}`];
  }
  fs.writeFileSync(destination, `${JSON.stringify(target, null, 2)}\n`);
}

function stableDigest(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, child]) => child !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
