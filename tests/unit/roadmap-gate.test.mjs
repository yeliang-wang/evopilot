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
    ["incomplete v6 E2E", (roadmap) => { roadmap.agentNativeLifecycleControlPlaneAcceptance.requiredEndToEnd.pop(); }, /exactly 20/],
    ["unsafe lifecycle auto activation", (roadmap) => { roadmap.controlledLifecycleEvolutionPolicy.safeAutomaticActivation.newAuthorityAllowed = true; }, /must not be destructive, externally visible, or expand authority/],
    ["mutable DataRig reference", (roadmap) => { roadmap.controlledLifecycleEvolutionPolicy.dataRigProductionReference.installedSuiteMutationAllowed = true; }, /must not become a Runtime dependency/],
    ["partial DataRig 2.1.11 inventory", (roadmap) => { roadmap.controlledLifecycleEvolutionPolicy.dataRigProductionReference.capabilityInventoryCoveragePercent = 99; }, /100 percent/],
    ["incomplete lifecycle evolution E2E", (roadmap) => { roadmap.controlledLifecycleEvolutionPolicy.requiredEndToEnd.pop(); }, /exactly 13/],
    ["missing readiness state", (roadmap) => { roadmap.firstRunLlmReadinessPolicy.states.pop(); }, /readiness states/],
    ["hidden Host LLM fallback", (roadmap) => { roadmap.firstRunLlmReadinessPolicy.forbiddenFallbacks = roadmap.firstRunLlmReadinessPolicy.forbiddenFallbacks.filter((item) => item !== "Host LLM"); }, /forbid fallback: Host LLM/],
    ["incomplete setup allowlist", (roadmap) => { roadmap.firstRunLlmReadinessPolicy.setupOnlyAllowed.pop(); }, /exactly eight/],
    ["weakened secret redaction", (roadmap) => { roadmap.firstRunLlmReadinessPolicy.secureSecretContract.rawSecretForbiddenIn.pop(); }, /twelve declared surfaces/],
    ["missing architecture edge", (roadmap) => { roadmap.firstRunLlmReadinessPolicy.readmeArchitecture.requiredEdges.pop(); }, /seven required edges/],
    ["incomplete readiness E2E", (roadmap) => { roadmap.firstRunLlmReadinessPolicy.requiredEndToEnd.pop(); }, /exact fifteen E2E/],
    ["weakened completion formula", (roadmap) => { roadmap.firstRunLlmReadinessPolicy.completionFormula = "CURRENT_ONLY"; }, /completion formula/],
    ["missing semantic binding", (roadmap) => { roadmap.milestones.find((item) => item.id === "evopilot-6.3-ontology-grounded-harness-powered-goal-loop").outcomes = []; }, /ProjectSemanticBinding/],
    ["authoritative Expert 2.3", (roadmap) => { roadmap.milestones.find((item) => item.id === "evopilot-evolution-expert-2.3-project-semantic-guide").acceptance = []; }, /stateless/],
    ["missing semantic supply contract", (roadmap) => { roadmap.crossProjectContracts = roadmap.crossProjectContracts.filter((item) => item.id !== "project-ontology-artifact-supply\/v1"); }, /project-ontology-artifact-supply/],
    ["incomplete convergence version set", (roadmap) => { roadmap.semanticDesignConvergencePolicy.versionSet["evopilot-harness"].requiredVersionSequence.pop(); }, /Harness 4\.6\.0 to 4\.8\.0 sequence/],
    ["missing per-version real E2E", (roadmap) => { roadmap.semanticDesignConvergencePolicy.everyVersionRequires = []; }, /per-version requirement/],
    ["terminal E2E grants release authority", (roadmap) => { roadmap.semanticDesignConvergencePolicy.terminalCrossProductE2E.grantsReleaseAuthority = true; }, /must not grant release authority/],
    ["Dashboard restored as required version", (roadmap) => { roadmap.semanticDesignConvergencePolicy.versionSet["evopilot-dashboard"] = { requiredVersionSequence: ["3.2.0"], terminalVersion: "3.2.0" }; }, /exactly Harness, Runtime, and Expert/],
    ["Dashboard blocks convergence", (roadmap) => { roadmap.semanticDesignConvergencePolicy.dashboardRequiredForSeriesConvergenceClaim = true; }, /optional and non-blocking/],
    ["Dashboard required for terminal E2E", (roadmap) => { roadmap.semanticDesignConvergencePolicy.optionalClients["evopilot-dashboard"].requiredForTerminalE2E = true; }, /must not block terminal E2E/],
    ["Dashboard failure blocks convergence", (roadmap) => { roadmap.semanticDesignConvergencePolicy.optionalClients["evopilot-dashboard"].failureBlocksSeriesConvergence = true; }, /must not block terminal E2E/],
    ["missing Dashboard-absent proof", (roadmap) => { roadmap.semanticDesignConvergencePolicy.terminalCrossProductE2E.dashboardAbsentRequired = false; }, /Dashboard absent/],
    ["missing real Host coverage", (roadmap) => { roadmap.semanticDesignConvergencePolicy.terminalCrossProductE2E.hostAcceptance.requiredHostCoverage.pop(); }, /Host coverage/],
    ["unqualified independent Host", (roadmap) => { roadmap.semanticDesignConvergencePolicy.terminalCrossProductE2E.hostAcceptance.independentHostRequiresValidatedAdapter = false; }, /qualified adapters/],
    ["substituted Host evidence", (roadmap) => { roadmap.semanticDesignConvergencePolicy.terminalCrossProductE2E.hostAcceptance.hostEvidenceSubstitutionAllowed = true; }, /non-substitutable evidence/],
    ["automated WorkBuddy observation", (roadmap) => { roadmap.semanticDesignConvergencePolicy.terminalCrossProductE2E.hostAcceptance.workbuddyObservationOrArtifactCollectionAllowed = true; }, /without observation/],
    ["waived Dashboard-owned E2E", (roadmap) => { roadmap.semanticDesignConvergencePolicy.optionalClients["evopilot-dashboard"].ownTargetBrowserE2EAndReleaseRequiredWhenEvolved = false; }, /own Target, browser E2E/]
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

test("Roadmap Gate binds public v6 history, completed v6.1, active v6.2 first-run readiness, and independent Cutover", () => {
  const roadmap = JSON.parse(fs.readFileSync(path.join(root, "governance/roadmap.yaml"), "utf8"));
  assert.equal(roadmap.versionPolicy.publishedBaseline, "6.1.0");
  assert.equal(roadmap.versionPolicy.currentWorkingVersion, "6.2.0");
  assert.equal(roadmap.evolutionExpertPolicy.publishedBaseline, "2.1.0");
  assert.equal(roadmap.evolutionExpertPolicy.currentWorkingVersion, "2.2.1");
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
  const runtimeV6 = roadmap.milestones.find((item) => item.id === "evopilot-6.0-agent-native-lifecycle-control-plane");
  const expertV2 = roadmap.milestones.find((item) => item.id === "evopilot-evolution-expert-2.0-agent-host-entry");
  assert.equal(runtimeV6?.status, "COMPLETE");
  assert.equal(expertV2?.status, "COMPLETE");
  assert.equal(runtimeV6?.completionEvidence.total, 176);
  assert.equal(runtimeV6?.completionEvidence.passed, 176);
  assert.equal(expertV2?.completionEvidence.total, 77);
  assert.equal(expertV2?.completionEvidence.passed, 77);
  assert.equal(runtimeV6?.completionEvidence.acceptanceCampaignPassed, 253);
  assert.equal(expertV2?.completionEvidence.crossAcceptancePassed, 10);
  assert.equal(runtimeV6?.completionEvidence.legacySuiteInvocationCount, 0);
  assert.equal(roadmap.milestones.find((item) => item.id === "evopilot-post-v6.0.0-legacy-suite-cutover")?.standaloneReleaseEligible, false);
  assert.equal(roadmap.milestones.find((item) => item.id === "evopilot-post-v6.0.0-legacy-suite-cutover")?.targetVersion, "6.0.0");
  assert.equal(roadmap.versionPolicy.publishedBaseline, "6.1.0");
  assert.equal(roadmap.evolutionExpertPolicy.publishedBaseline, "2.1.0");
  const runtimeV61 = roadmap.milestones.find((item) => item.id === "evopilot-6.1-controlled-lifecycle-evolution");
  const expertV21 = roadmap.milestones.find((item) => item.id === "evopilot-evolution-expert-2.1-controlled-lifecycle-evolution");
  assert.equal(runtimeV61?.status, "COMPLETE");
  assert.equal(expertV21?.status, "COMPLETE");
  assert.equal(runtimeV61?.completionEvidence.total, 305);
  assert.equal(runtimeV61?.completionEvidence.passed, 305);
  assert.equal(expertV21?.completionEvidence.total, 305);
  assert.equal(expertV21?.completionEvidence.passed, 305);
  assert.equal(runtimeV61?.completionEvidence.dataRigSuite211ReadOnlyCoverage, "VERIFIED");
  assert.equal(expertV21?.completionEvidence.legacySuiteInvocationCount, 0);
  const runtimeV62 = roadmap.milestones.find((item) => item.id === "evopilot-6.2-first-run-llm-readiness");
  const expertV22 = roadmap.milestones.find((item) => item.id === "evopilot-evolution-expert-2.2-first-run-llm-setup");
  assert.equal(runtimeV62?.status, "IN_PROGRESS");
  assert.equal(runtimeV62?.targetVersion, "6.2.0");
  assert.equal(expertV22?.status, "IN_PROGRESS");
  assert.equal(expertV22?.targetVersion, "2.2.0");
  const runtimeV63 = roadmap.milestones.find((item) => item.id === "evopilot-6.3-ontology-grounded-harness-powered-goal-loop");
  const expertV23 = roadmap.milestones.find((item) => item.id === "evopilot-evolution-expert-2.3-project-semantic-guide");
  assert.equal(runtimeV63?.status, "PLANNED");
  assert.equal(runtimeV63?.targetVersion, "6.3.0");
  assert.equal(expertV23?.status, "PLANNED");
  assert.equal(expertV23?.targetVersion, "2.3.0");
  assert.deepEqual(roadmap.semanticDesignConvergencePolicy.versionSet["evopilot-harness"].requiredVersionSequence, ["4.6.0", "4.7.0", "4.8.0"]);
  assert.equal(roadmap.semanticDesignConvergencePolicy.versionSet["evopilot-runtime"].terminalVersion, "6.3.0");
  assert.equal(roadmap.semanticDesignConvergencePolicy.versionSet["evopilot-evolution-expert"].terminalVersion, "2.3.0");
  assert.equal(roadmap.semanticDesignConvergencePolicy.versionSet["evopilot-dashboard"], undefined);
  assert.equal(roadmap.semanticDesignConvergencePolicy.dashboardRequiredForSeriesConvergenceClaim, false);
  assert.equal(roadmap.semanticDesignConvergencePolicy.optionalClients["evopilot-dashboard"].optionalMilestoneVersion, "3.2.0");
  assert.equal(roadmap.semanticDesignConvergencePolicy.terminalCrossProductE2E.dashboardAbsentRequired, true);
  assert.equal(roadmap.semanticDesignConvergencePolicy.terminalCrossProductE2E.grantsReleaseAuthority, false);
  const deferredLearning = roadmap.milestones.find((item) => item.id === "evopilot-6.2-learning-interop");
  const plannedLearning = roadmap.milestones.find((item) => item.id === "evopilot-6.4-learning-interop");
  assert.equal(deferredLearning?.status, "DEFERRED");
  assert.equal(deferredLearning?.deferredInto, "evopilot-6.4-learning-interop");
  assert.equal(plannedLearning?.status, "PLANNED");
  assert.equal(plannedLearning?.targetVersion, "6.4.0");
  assert.deepEqual(plannedLearning?.outcomes, deferredLearning?.outcomes);
  assert.deepEqual(plannedLearning?.inheritedAcceptance, deferredLearning?.acceptance);
  assert.deepEqual(roadmap.firstRunLlmReadinessPolicy.states, ["SETUP_REQUIRED", "PREFLIGHT_REQUIRED", "READY", "LLM_BLOCKED"]);
  assert.equal(roadmap.firstRunLlmReadinessPolicy.readmeArchitecture.required, true);
  assert.equal(roadmap.controlledLifecycleEvolutionPolicy.dataRigProductionReference.suiteVersion, "2.1.11");
  assert.equal(roadmap.controlledLifecycleEvolutionPolicy.dataRigProductionReference.initialResourceVersion, "1.0.0");
  assert.equal(roadmap.controlledLifecycleEvolutionPolicy.dataRigProductionReference.runtimeDependency, false);
  assert.equal(roadmap.controlledLifecycleEvolutionPolicy.requiredEndToEnd.length, 13);
});

test("Roadmap Gate fails closed on incomplete v6.1 terminal or public evidence", () => {
  for (const [name, mutate, pattern] of [
    ["runtime count", (roadmap) => { roadmap.milestones.find((item) => item.id === "evopilot-6.1-controlled-lifecycle-evolution").completionEvidence.passed = 304; }, /305\/305/],
    ["expert Candidate", (roadmap) => { roadmap.milestones.find((item) => item.id === "evopilot-evolution-expert-2.1-controlled-lifecycle-evolution").completionEvidence.acceptedCandidateCommit = "0".repeat(40); }, /accepted Candidate commit/],
    ["DataRig coverage", (roadmap) => { roadmap.milestones.find((item) => item.id === "evopilot-6.1-controlled-lifecycle-evolution").completionEvidence.dataRigDispositionCoveragePercent = 99; }, /DataRig Suite 2\.1\.11 coverage/],
    ["legacy invocation", (roadmap) => { roadmap.milestones.find((item) => item.id === "evopilot-evolution-expert-2.1-controlled-lifecycle-evolution").completionEvidence.legacySuiteInvocationCount = 1; }, /zero legacy Suite invocation/]
  ]) {
    const result = runWithRoadmap(mutate);
    assert.equal(result.status, 1, `${name}: ${result.stderr}`);
    assert.equal(result.body.classification, "INVALID");
    assert.match(result.body.errors.join(" "), pattern);
  }
});

test("Roadmap Gate fails closed on incomplete v6 terminal evidence or premature Suite Cutover", () => {
  for (const [name, mutate, pattern] of [
    ["runtime count", (roadmap) => { roadmap.milestones.find((item) => item.id === "evopilot-6.0-agent-native-lifecycle-control-plane").completionEvidence.passed = 175; }, /176\/176/],
    ["campaign count", (roadmap) => { roadmap.milestones.find((item) => item.id === "evopilot-evolution-expert-2.0-agent-host-entry").completionEvidence.acceptanceCampaignPassed = 252; }, /253\/253/],
    ["cross acceptance", (roadmap) => { roadmap.milestones.find((item) => item.id === "evopilot-6.0-agent-native-lifecycle-control-plane").completionEvidence.crossAcceptancePassed = 9; }, /10\/10/],
    ["missing Candidate", (roadmap) => { delete roadmap.milestones.find((item) => item.id === "evopilot-6.0-agent-native-lifecycle-control-plane").completionEvidence.acceptedCandidateCommit; }, /accepted Candidate commit/],
    ["impact closure", (roadmap) => { roadmap.milestones.find((item) => item.id === "evopilot-evolution-expert-2.0-agent-host-entry").completionEvidence.impactClosure = "FAIL"; }, /impact closure PASS/],
    ["legacy invocation", (roadmap) => { roadmap.milestones.find((item) => item.id === "evopilot-6.0-agent-native-lifecycle-control-plane").completionEvidence.legacySuiteInvocationCount = 1; }, /zero legacy Suite invocation/],
    ["premature Cutover", (roadmap) => { roadmap.milestones.find((item) => item.id === "evopilot-post-v6.0.0-legacy-suite-cutover").status = "COMPLETE"; }, /must be PLANNED/]
  ]) {
    const result = runWithRoadmap(mutate);
    assert.equal(result.status, 1, `${name}: ${result.stderr}`);
    assert.equal(result.body.classification, "INVALID");
    assert.match(result.body.errors.join(" "), pattern);
  }
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

test("accepted v6.1 Targets validate immutable completion semantics after terminal evidence projection", () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-v61-accepted-contract-"));
  const runtimeTarget = path.join(tempDirectory, "runtime-target.json");
  const expertTarget = path.join(tempDirectory, "expert-target.json");
  const contractPath = path.join(tempDirectory, "v61-completion-contract.json");
  const crossPath = path.join(tempDirectory, "v61-cross-acceptance-map.json");
  try {
    projectAcceptedV61Target(
      path.join(root, "governance/targets/evopilot-v6.1.0-controlled-lifecycle-evolution.json"),
      runtimeTarget,
      "evopilot"
    );
    projectAcceptedV61Target(
      path.join(root, "governance/targets/evopilot-evolution-expert-v2.1.0-controlled-lifecycle-evolution.json"),
      expertTarget,
      "evopilot-evolution-expert"
    );
    fs.copyFileSync(path.join(root, "governance/acceptance/v61-completion-contract.json"), contractPath);
    fs.copyFileSync(path.join(root, "governance/acceptance/runtime-6.1.0-expert-2.1.0-cross-acceptance-map.json"), crossPath);

    const accepted = runV61CompletionContractCheck({ runtimeTarget, expertTarget, contractPath, crossPath });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /immutable accepted v6\.1 completion contract verified/);

    const tamperedTarget = JSON.parse(fs.readFileSync(runtimeTarget, "utf8"));
    tamperedTarget.acceptance[0].criterion = `${tamperedTarget.acceptance[0].criterion} weakened`;
    fs.writeFileSync(runtimeTarget, `${JSON.stringify(tamperedTarget, null, 2)}\n`);
    const tampered = runV61CompletionContractCheck({ runtimeTarget, expertTarget, contractPath, crossPath });
    assert.equal(tampered.status, 1, tampered.stdout);
    assert.match(tampered.stderr, /criterion semantics changed/);
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

test("Roadmap Gate aligns Runtime 6.1 controlled Lifecycle evolution and the exact DataRig 2.1.11 production reference", () => {
  const result = run(["--intent", "Converge the exact active DataRig Suite 2.1.11 into datarig-production-delivery and add automatic lifecycle evolution through immutable successor proposal and champion challenger validation"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-6.1-controlled-lifecycle-evolution"));
});

test("Roadmap Gate aligns independently versioned Expert 2.1 controlled Lifecycle guidance", () => {
  const result = run(["--intent", "Implement Evolution Expert 2.1 pipeline evolution over MCP with lifecycle successor guidance"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-evolution-expert-2.1-controlled-lifecycle-evolution"));
});

test("Roadmap Gate aligns the complete Runtime 6.2 first-run LLM readiness and README architecture intent", () => {
  const result = run(["--intent", "Implement first run llm readiness with mandatory llm profile, workspace llm default, setup required, secure SecretRef setup, and README architecture diagram"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-6.2-first-run-llm-readiness"));
});

test("Roadmap Gate aligns Evolution Expert 2.2 secure first-run setup", () => {
  const result = run(["--intent", "Implement Evolution Expert 2.2 first run llm setup expert and secure provider setup over MCP"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.ok(result.body.matchedMilestones.includes("evopilot-evolution-expert-2.2-first-run-llm-setup"));
});

test("Roadmap Gate aligns Runtime 6.3 ontology-grounded and Harness-powered execution", () => {
  const result = run(["--intent", "Implement Runtime 6.3 ontology grounded goal loop with project semantic binding and semantic context slice"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.deepEqual(result.body.matchedMilestones, ["evopilot-6.3-ontology-grounded-harness-powered-goal-loop"]);
});

test("Roadmap Gate aligns Evolution Expert 2.3 project semantic guidance", () => {
  const result = run(["--intent", "Implement Evolution Expert 2.3 project semantic guide and dual binding guide"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.deepEqual(result.body.matchedMilestones, ["evopilot-evolution-expert-2.3-project-semantic-guide"]);
});

test("Roadmap Gate aligns the exact final semantic design convergence and terminal cross-product E2E", () => {
  const result = run(["--intent", "Implement final product design convergence with terminal cross-product convergence E2E"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.deepEqual(result.body.matchedStandingWork, ["evopilot-series-semantic-design-convergence"]);
});

test("Roadmap Gate aligns Learning Interoperability only through its Runtime 6.4 destination", () => {
  const result = run(["--intent", "Implement Runtime 6.4 learning interoperability with preference dataset and training adapter"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.classification, "ALIGNED");
  assert.deepEqual(result.body.matchedMilestones, ["evopilot-6.4-learning-interop"]);
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

test("Roadmap Gate declares independent Expert 2.2.1 public CLI recovery", () => {
  const result = run(["--intent", "Repair Evolution Expert 2.2.1 public CLI completion recovery"]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.body.matchedMilestones.includes("evopilot-evolution-expert-2.2.1-public-cli-completion-recovery"));
  const release = run(["--release-product", "evopilot-evolution-expert", "--release-version", "2.2.1"]);
  assert.equal(release.status, 0, release.stderr);
  assert.ok(release.body.matchedMilestones.includes("evopilot-evolution-expert-2.2.1-public-cli-completion-recovery"));
});

test("Roadmap Gate rejects unsafe or incomplete Expert public CLI recovery", () => {
  for (const [name, mutate, pattern] of [
    ["Runtime rebuild", r => { r.expert22CompletionRecoveryPolicy.runtimeRebuildAllowed = true; }, /preserve Runtime bytes/],
    ["overwrite predecessor", r => { r.expert22CompletionRecoveryPolicy.predecessorOverwriteUnpublishOrRetagAllowed = true; }, /immutable predecessor/],
    ["old Core schema", r => { r.expert22CompletionRecoveryPolicy.requiredCoreSchema = "evopilot-evolution-expert-core/v2"; }, /Core v3/],
    ["missing adapter", r => { r.expert22CompletionRecoveryPolicy.requiredHosts.pop(); }, /all five adapters/],
    ["blanket historical PASS", r => { r.expert22CompletionRecoveryPolicy.historicalAcceptance.blanketPassCarryForwardAllowed = true; }, /without blanket PASS/],
    ["missing release authority", r => { r.expert22CompletionRecoveryPolicy.separateSuccessorReleaseAuthorizationRequired = false; }, /separate Release/],
    ["fake Host qualification", r => { r.expert22CompletionRecoveryPolicy.cliSelfCheckProvesRealHostQualification = true; }, /must not claim real Host/],
    ["lost convergence r2", r => { r.expert22CompletionRecoveryPolicy.terminalConvergenceR2Unchanged = false; }, /semantic convergence r2/],
    ["premature completion", r => { r.expert22CompletionRecoveryPolicy.predecessorDisposition = "COMPLETE"; }, /premature public completion/],
    ["waived default-version test", r => { r.milestones.find(m => m.id === "evopilot-evolution-expert-2.2.1-public-cli-completion-recovery").acceptance.shift(); }, /omitted-version defaults/]
  ]) {
    const result = runWithRoadmap(mutate);
    assert.equal(result.status, 1, name);
    assert.match(result.body.errors.join(" "), pattern);
  }
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

function runV61CompletionContractCheck({ runtimeTarget, expertTarget, contractPath, crossPath }) {
  return spawnSync(process.execPath, ["scripts/build-v61-completion-contract.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      EVOPILOT_V61_RUNTIME_TARGET: runtimeTarget,
      EVOPILOT_V61_EXPERT_TARGET: expertTarget,
      EVOPILOT_V61_COMPLETION_CONTRACT: contractPath,
      EVOPILOT_V61_CROSS_ACCEPTANCE_MAP: crossPath
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

function projectAcceptedV61Target(source, destination, versionKey) {
  const target = JSON.parse(fs.readFileSync(source, "utf8"));
  target.status = "RELEASE_AUTHORIZED";
  target.noRegression = { status: "PASSED", evidenceRefs: ["acceptance:test/no-regression"] };
  target.approvals.release = {
    decision: "AUTHORIZED",
    by: "test",
    evidenceRef: "acceptance:test/release-authorization",
    authorizationDigest: `sha256:${"a".repeat(64)}`
  };
  assert.ok(target.release?.versions?.[versionKey]);
  for (const criterion of [target.acceptance, target.realCaseCoverage].flat()) {
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
