import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const contractPath = process.env.EVOPILOT_ROADMAP_CONTRACT
  ? path.resolve(process.env.EVOPILOT_ROADMAP_CONTRACT)
  : path.join(root, "governance/roadmap.yaml");
const args = process.argv.slice(2);
const json = args.includes("--json");
const intent = option("--intent");
const releaseVersion = option("--release-version") ?? positionalAfter("--release-version");
const releaseProduct = option("--release-product") ?? "evopilot-runtime";

let roadmap;
try {
  roadmap = JSON.parse(fs.readFileSync(contractPath, "utf8"));
} catch (error) {
  fail(`Roadmap contract is not valid JSON-compatible YAML: ${error.message}`);
}

const errors = validateRoadmap(roadmap);
if (errors.length > 0) {
  const result = { schema: "evopilot-roadmap-gate-result/v1", project: roadmap?.project, classification: "INVALID", approvalRequired: true, errors, nextAction: "repair-roadmap-contract" };
  emit(result, 1);
}

if (releaseVersion) {
  const normalized = releaseVersion.replace(/^v/, "");
  const release = classifyRelease(normalized, releaseProduct, roadmap);
  emit(baseResult(release.classification, {
    intent: `release ${normalized}`,
    releaseProduct,
    matchedMilestones: release.matchedMilestones,
    reasons: release.reasons,
    approvalRequired: release.classification !== "ALIGNED",
    nextAction: release.classification === "ALIGNED" ? "continue-release-validation" : "revise-roadmap-before-release"
  }), release.classification === "ALIGNED" ? 0 : 2);
}

if (intent != null) {
  const result = classifyIntent(intent, roadmap);
  emit(baseResult(result.classification, result), result.classification === "ALIGNED" ? 0 : 2);
}

emit(baseResult("ALIGNED", {
  intent: "static-roadmap-contract-validation",
  matchedMilestones: [],
  matchedStandingWork: [],
  reasons: ["Roadmap schema, repository integration, and version declarations are valid."],
  approvalRequired: false,
  nextAction: "run-intent-gate-before-product-work"
}), 0);

function validateRoadmap(value) {
  const failures = [];
  required(value?.schema === "evopilot-series-roadmap/v1", "schema must be evopilot-series-roadmap/v1");
  required(value?.roadmapFamily === "evopilot-series-agentic-evolution", "roadmapFamily is invalid");
  required(typeof value?.contractVersion === "string", "contractVersion is required");
  required(value?.project === "evopilot", "project must be evopilot");
  required(Array.isArray(value?.ownership?.owns) && value.ownership.owns.length > 0, "ownership.owns is required");
  required(Array.isArray(value?.ownership?.mustNotOwn) && value.ownership.mustNotOwn.length > 0, "ownership.mustNotOwn is required");
  required(semver(value?.versionPolicy?.publishedBaseline), "publishedBaseline must be SemVer");
  required(semver(value?.versionPolicy?.currentWorkingVersion), "currentWorkingVersion must be SemVer");
  required(value?.versionPolicy?.runtimeProduct === "evopilot-runtime", "versionPolicy.runtimeProduct must be evopilot-runtime");
  required(value?.evolutionExpertPolicy?.product === "evopilot-evolution-expert", "evolutionExpertPolicy.product must be evopilot-evolution-expert");
  required(semver(value?.evolutionExpertPolicy?.publishedBaseline), "evolutionExpertPolicy.publishedBaseline must be SemVer");
  required(semver(value?.evolutionExpertPolicy?.currentWorkingVersion), "evolutionExpertPolicy.currentWorkingVersion must be SemVer");
  required(value?.evolutionExpertPolicy?.lockstepWithRuntime === false, "Evolution Expert must not be version-locked to the Runtime");
  required(value?.versionPolicy?.publishedBaseline === "6.0.0" && value?.versionPolicy?.currentWorkingVersion === "6.0.0", "Runtime Roadmap must bind public and working 6.0.0");
  required(value?.evolutionExpertPolicy?.publishedBaseline === "2.0.0" && value?.evolutionExpertPolicy?.currentWorkingVersion === "2.0.0", "Evolution Expert Roadmap must bind public and working 2.0.0");
  required(value?.evolutionExpertPolicy?.mandatoryForOrdinaryHumans === true, "Evolution Expert must be mandatory for ordinary-human operation");
  required(value?.evolutionExpertPolicy?.canonicalProtocol === "MCP", "Evolution Expert ordinary-human protocol must be MCP");
  required(value?.humanInteractionProtocol?.canonicalOrdinaryHumanProtocol === "MCP", "MCP must be the canonical ordinary-human protocol");
  required(value?.humanInteractionProtocol?.ordinaryHumanEntry?.includes("Evolution Expert"), "ordinary-human entry must be the Evolution Expert");
  required(value?.lifecycleHarnessPolicy?.scope === "tenant/workspace", "Lifecycle definitions must be tenant/workspace scoped");
  required(value?.lifecycleHarnessPolicy?.sourceOfTruth?.includes("Lifecycle Registry"), "production Lifecycle source of truth must be the governed Registry");
  required(value?.lifecycleHarnessPolicy?.fileCatalogRole?.includes("never the production source of truth"), "file Lifecycle catalogs must be bootstrap or reference inputs only");
  required(value?.lifecycleHarnessPolicy?.operations?.includes("rollback") && value?.lifecycleHarnessPolicy?.operations?.includes("archive"), "Lifecycle management must include governed rollback and archive operations");
  required(value?.agentRuntimePolicy?.mode === "QUALIFIED_EXTERNAL_AGENT_RUNTIME_EXECUTION", "project source work must use qualified external Agent Runtime execution");
  required(value?.agentRuntimePolicy?.externalExecutionRequiredForSourceWork === true, "external Agent Runtime must be required for project source work");
  required(typeof value?.agentRuntimePolicy?.noEmbeddedFallback === "string", "embedded or unqualified Agent Runtime fallback must be forbidden");
  required(value?.harnessGuidedExecutionPolicy?.requiredForGoalTargetLoop === true, "Harness-guided execution must be required for Goal Target Loops");
  required(value?.harnessGuidedExecutionPolicy?.publishedAssetsReadOnly === true, "published Harness assets must remain read-only");
  required(value?.harnessGuidedExecutionPolicy?.perIterationRevalidation === true, "Harness binding must be revalidated before every Loop iteration");
  required(value?.harnessGuidedExecutionPolicy?.lifecycleMayReplaceHarness === false, "Lifecycle must not replace the Harness binding");
  required(value?.harnessGuidedExecutionPolicy?.lifecycleMayWeakenHarness === false, "Lifecycle must not weaken Harness obligations");
  required(value?.acceptancePortfolio?.functional === 21, "v5 acceptancePortfolio.functional must be 21");
  required(value?.acceptancePortfolio?.capability === 16, "v5 acceptancePortfolio.capability must be 16");
  required(value?.acceptancePortfolio?.documentation === 13, "v5 acceptancePortfolio.documentation must be 13");
  required(value?.acceptancePortfolio?.endToEnd === 13, "v5 acceptancePortfolio.endToEnd must be 13");
  required(value?.acceptancePortfolio?.completion === 6, "v5 acceptancePortfolio.completion must be 6");
  required(value?.acceptancePortfolio?.completionIds === "TRACE01-TRACE06", "v5 acceptancePortfolio.completionIds must be TRACE01-TRACE06");
  const completionAssurance = value?.acceptancePortfolio?.completionAssurance;
  required(completionAssurance?.schema === "evopilot-approved-scheme-completeness/v1", "completion assurance schema is invalid");
  required(completionAssurance?.required === true, "completion assurance must be required");
  required(completionAssurance?.originalSchemeCoveragePercent === 100, "original v5 scheme coverage must be 100 percent");
  required(arrayEquals(completionAssurance?.requiredAcceptanceIds, ["TRACE01", "TRACE02", "TRACE03", "TRACE04", "TRACE05", "TRACE06"]), "completion assurance must require TRACE01-TRACE06");
  for (const binding of ["accepted v5 Roadmap revisions", "Runtime v5.0.0 Target revision 2", "Evolution Expert v1.0.0 Target revision 2", "explicit user corrections and requirements", "audited acceptance, Runtime, Expert, project, contract, documentation, public-truth, governance, and reference gaps"]) {
    required(completionAssurance?.binds?.includes(binding), `completion assurance is missing inventory binding: ${binding}`);
  }
  for (const link of ["requirement", "successor Target criterion", "implementation deliverable", "independent executable validator", "concrete evidence", "terminal E2E when user-observable"]) {
    required(completionAssurance?.requiresTraceability?.includes(link), `completion assurance is missing traceability link: ${link}`);
  }
  required(completionAssurance?.bulkPassProjectionAllowed === false, "bulk PASS projection must be forbidden");
  required(completionAssurance?.silentExclusionAllowed === false, "silent exclusions must be forbidden");
  required(completionAssurance?.warningCountsAsPass === false, "warnings must not count as PASS");
  required(completionAssurance?.humanDeclarationSubstitutesForMachineEvidence === false, "human declaration must not replace required machine evidence");
  required(completionAssurance?.completeWhen === "TOTAL_EQUALS_PASSED_AND_FAILED_PENDING_STALE_GENERIC_UNMAPPED_ARE_ZERO_AND_NO_REGRESSION_PASSED", "completion formula must fail closed on every incomplete evidence class");
  const convergenceAcceptance = value?.suiteConvergenceAcceptance;
  required(convergenceAcceptance?.required === true, "Suite convergence acceptance must be required");
  required(convergenceAcceptance?.capabilityInventoryCoveragePercent === 100, "Suite convergence capability inventory coverage must be 100 percent");
  required(convergenceAcceptance?.historicalSuiteCompatibilityRequired === false, "superseded Suite compatibility must not be required");
  required(Array.isArray(convergenceAcceptance?.requiredJourneys) && convergenceAcceptance.requiredJourneys.length >= 10, "Suite convergence must declare complete parity, project, Host, recovery, upgrade, Cutover, and absence journeys");
  required(convergenceAcceptance?.roleAfterV6Revision === "FROZEN_REFERENCE_AND_MIGRATION_EVIDENCE_ONLY", "legacy Suite convergence must become frozen reference and migration evidence for v6");
  required(convergenceAcceptance?.ongoingSynchronizationRequired === false, "v6 must not require ongoing legacy Suite synchronization");
  required(convergenceAcceptance?.runtimeDependency === false && convergenceAcceptance?.privilegedEngineBehavior === false, "legacy Suites must not become Runtime dependencies or privileged Engine behavior");
  const v6Acceptance = value?.agentNativeLifecycleControlPlaneAcceptance;
  required(v6Acceptance?.schema === "evopilot-v6-agent-native-lifecycle-control-plane-acceptance/v1", "v6 acceptance schema is invalid");
  required(v6Acceptance?.required === true, "v6 Agent-native control-plane acceptance must be required");
  required(v6Acceptance?.runtimeVersion === "6.0.0" && v6Acceptance?.evolutionExpertVersion === "2.0.0", "v6 acceptance must bind Runtime 6.0.0 and Evolution Expert 2.0.0");
  required(v6Acceptance?.ordinaryHumanEntry === "EVOLUTION_EXPERT_OVER_MCP_IN_QUALIFIED_AGENT_HOST", "v6 ordinary-human entry must be Expert over MCP in a qualified Agent Host");
  required(v6Acceptance?.lifecycleRegistry === "TENANT_WORKSPACE_GOVERNED_IMMUTABLE_REVISIONS", "v6 acceptance must require the governed tenant/workspace Lifecycle Registry");
  required(v6Acceptance?.agentExecution === "QUALIFIED_EXTERNAL_AGENT_RUNTIME_ONLY", "v6 acceptance must require qualified external Agent Runtime execution");
  required(Array.isArray(v6Acceptance?.functionalAreas) && v6Acceptance.functionalAreas.length >= 6, "v6 acceptance must declare all functional areas");
  required(Array.isArray(v6Acceptance?.capabilityAreas) && v6Acceptance.capabilityAreas.length >= 6, "v6 acceptance must declare all capability areas");
  required(Array.isArray(v6Acceptance?.requiredEndToEnd) && v6Acceptance.requiredEndToEnd.length === 20, "v6 acceptance must declare exactly 20 required E2E journeys");
  for (const prefix of ["E2E-INSTALL-CODEX", "E2E-INSTALL-CLAUDE-CODE", "E2E-INSTALL-WORKBUDDY", "E2E-LIFECYCLE-CREATE", "E2E-LIFECYCLE-READ", "E2E-LIFECYCLE-UPDATE", "E2E-LIFECYCLE-DEACTIVATE", "E2E-LIFECYCLE-ARCHIVE", "E2E-LIFECYCLE-ROLLBACK", "E2E-LIFECYCLE-IMPORT", "E2E-TENANCY", "E2E-RESTART", "E2E-SECURITY", "E2E-AGENT-RUNTIME", "E2E-CROSS-HOST", "E2E-REFERENCE-DATARIG", "E2E-REFERENCE-EVOPILOT", "E2E-REFERENCE-HARNESS", "E2E-NO-SUITE", "E2E-SOAK"]) {
    required(v6Acceptance?.requiredEndToEnd?.some((item) => item.startsWith(prefix)), `v6 acceptance is missing ${prefix}`);
  }
  required(v6Acceptance?.completionFormula === "FUNCTIONAL_100_PERCENT_AND_CAPABILITY_100_PERCENT_AND_INHERITED_APPLICABLE_100_PERCENT_AND_LIFECYCLE_CRUD_E2E_100_PERCENT_AND_HOST_MCP_E2E_100_PERCENT_AND_AGENT_RUNTIME_E2E_100_PERCENT_AND_IMPACT_CLOSURE_100_PERCENT_AND_NO_REGRESSION_PASSED_AND_EXACT_INSTALLED_RUNTIME_EXPERT_CANDIDATE_PAIR_VERIFIED", "v6 completion formula must fail closed across every required evidence class");
  const suiteTransition = value?.legacySuiteTransition;
  const migrationBaseline = suiteTransition?.migrationBaseline;
  required(migrationBaseline?.policy === "LATEST_ONLY_NO_HISTORICAL_COMPATIBILITY", "legacy Suite migration must use the exact latest-only baseline policy");
  required(migrationBaseline?.targetFreezeRecheckRequired === true, "latest Suite versions must be rechecked when the Target freezes");
  required(migrationBaseline?.supersededVersionCompatibilityRequired === false, "superseded Suite compatibility must be excluded");
  const baselineSuites = migrationBaseline?.suites ?? [];
  required(baselineSuites.length === 2, "exactly two latest Suite baselines are required");
  required(baselineSuites.some((suite) => suite.id === "evopilot-codex-suite" && suite.version === "3.2.1" && suite.integrityGate === "PASS"), "EvoPilot Codex Suite 3.2.1 exact baseline is required");
  required(baselineSuites.some((suite) => suite.id === "datarig-codex-suite" && suite.version === "2.1.5" && suite.integrityGate === "PASS"), "DataRig Codex Suite 2.1.5 exact baseline is required");
  required(baselineSuites.every((suite) => /^sha256:[a-f0-9]{64}$/.test(suite.snapshotDigest ?? "")), "every latest Suite baseline must bind an exact snapshot digest");
  const convergence = suiteTransition?.convergence;
  required(convergence?.installedSuiteDisposition === "ACTIVE_UNTIL_SEPARATELY_AUTHORIZED_CUTOVER", "legacy Suites must remain active until separately authorized Cutover");
  required(convergence?.shadowComparisonMode === "READ_ONLY", "Suite convergence comparison must be read-only");
  required(convergence?.snapshotPolicy === "TARGET_FROZEN_EXACT_LATEST", "Suite convergence snapshots must freeze the exact latest Target baseline");
  required(convergence?.candidateEnvironment === "LEGACY_SUITES_ABSENT", "Suite convergence Candidate independence must be proven with legacy Suites absent");
  required(convergence?.realInstalledSuiteMutationAllowed === false, "Suite convergence acceptance must not mutate real installed legacy Suites");
  required(suiteTransition?.postRelease?.timing === "AFTER_PUBLIC_RUNTIME_6_0_AND_EXPERT_2_0_VERIFIED_INSTALLATION", "legacy Suite Cutover must occur only after public Runtime 6.0 and Expert 2.0 installation verification");
  required(suiteTransition?.postRelease?.releaseBlockerForV60 === false, "post-release legacy Suite Cutover must not block the v6.0 release");
  required(suiteTransition?.postRelease?.requiresSeparateEvolutionTarget === true, "post-release legacy Suite Cutover requires a separate Evolution Target");
  required(suiteTransition?.postRelease?.requiresSeparateHumanAuthorization === true, "post-release legacy Suite Cutover requires separate human authorization");
  required(suiteTransition?.postCutover?.suiteDisposition === "IMMUTABLE_DIGEST_INVENTORIED_MIGRATION_EVIDENCE_ONLY", "retired Suites must become immutable migration evidence only");
  required(suiteTransition?.postCutover?.independentFeatureEvolution === false, "retired Suites must not continue independent feature evolution");
  required(suiteTransition?.postCutover?.normalCodexDiscovery === false, "retired Suites must be absent from normal Codex discovery");
  required(suiteTransition?.postCutover?.runtimeDependency === false, "retired Suites must not be Runtime dependencies");
  required(suiteTransition?.postCutover?.hiddenFallbackAllowed === false, "retired Suites must not be hidden fallbacks");
  required(Array.isArray(value?.milestones) && value.milestones.length > 0, "milestones are required");
  const milestones = value?.milestones ?? [];
  const ids = new Set();
  for (const milestone of milestones) {
    required(typeof milestone.id === "string" && !ids.has(milestone.id), `milestone id must be unique: ${milestone.id}`);
    ids.add(milestone.id);
    required(["IN_PROGRESS", "PLANNED", "DEFERRED", "SUPERSEDED", "COMPLETE"].includes(milestone.status), `invalid milestone status: ${milestone.id}`);
    required(semver(milestone.targetVersion), `targetVersion must be SemVer: ${milestone.id}`);
    required(/^\d+\.\d+\.x$/.test(milestone.releaseLine), `releaseLine must be major.minor.x: ${milestone.id}`);
    required(["evopilot-runtime", "evopilot-evolution-expert"].includes(milestone.product), `milestone product is invalid: ${milestone.id}`);
    required(Array.isArray(milestone.signals) && milestone.signals.length > 0, `signals are required: ${milestone.id}`);
    required(Array.isArray(milestone.acceptance) && milestone.acceptance.length > 0, `acceptance is required: ${milestone.id}`);
  }
  const currentStates = new Set(["IN_PROGRESS", "COMPLETE"]);
  const currentMilestones = milestones.filter((milestone) => milestone.product === value?.versionPolicy?.runtimeProduct && currentStates.has(milestone.status) && milestone.targetVersion === value?.versionPolicy?.currentWorkingVersion);
  required(currentMilestones.length === 1, "Runtime currentWorkingVersion must match exactly one IN_PROGRESS or COMPLETE Runtime milestone");
  const currentExpertMilestones = milestones.filter((milestone) => milestone.product === value?.evolutionExpertPolicy?.product && currentStates.has(milestone.status) && milestone.targetVersion === value?.evolutionExpertPolicy?.currentWorkingVersion);
  required(currentExpertMilestones.length === 1, "Evolution Expert currentWorkingVersion must match exactly one IN_PROGRESS or COMPLETE Expert milestone");
  const runtimeCompletion = milestones.find((milestone) => milestone.id === "evopilot-5.0-harness-guided-governed-evolution-runtime");
  const expertCompletion = milestones.find((milestone) => milestone.id === "evopilot-evolution-expert-1.0");
  validateCompletionSuccessor(runtimeCompletion, "5.0.0", "5.0.1", "Runtime");
  validateCompletionSuccessor(expertCompletion, "1.0.0", "1.0.1", "Evolution Expert");
  const runtimeConvergence = milestones.find((milestone) => milestone.id === "evopilot-5.1-suite-capability-convergence");
  required(runtimeConvergence?.status === "SUPERSEDED" && runtimeConvergence?.targetVersion === "5.1.0" && runtimeConvergence?.standaloneReleaseEligible === false, "Runtime 5.1 Suite convergence must be preserved as a non-releasable SUPERSEDED milestone");
  required(runtimeConvergence?.supersededBy === "evopilot-6.0-agent-native-lifecycle-control-plane", "Runtime 5.1 must be superseded by Runtime 6.0");
  const expertConvergence = milestones.find((milestone) => milestone.id === "evopilot-evolution-expert-1.1-unified-host-entry");
  required(expertConvergence?.status === "SUPERSEDED" && expertConvergence?.targetVersion === "1.1.0" && expertConvergence?.standaloneReleaseEligible === false, "Evolution Expert 1.1 must be preserved as a non-releasable SUPERSEDED milestone");
  required(expertConvergence?.supersededBy === "evopilot-evolution-expert-2.0-agent-host-entry", "Evolution Expert 1.1 must be superseded by Expert 2.0");
  const runtimeV6 = milestones.find((milestone) => milestone.id === "evopilot-6.0-agent-native-lifecycle-control-plane");
  required(runtimeV6?.status === "COMPLETE" && runtimeV6?.targetVersion === "6.0.0", "Runtime Agent-native Lifecycle control plane must be the COMPLETE 6.0.0 milestone");
  required(runtimeV6?.supersedesUnreleasedMilestone === runtimeConvergence?.id, "Runtime 6.0 must explicitly supersede unreleased Runtime 5.1");
  const expertV2 = milestones.find((milestone) => milestone.id === "evopilot-evolution-expert-2.0-agent-host-entry");
  required(expertV2?.status === "COMPLETE" && expertV2?.targetVersion === "2.0.0", "Evolution Expert Agent Host entry must be the COMPLETE 2.0.0 milestone");
  required(expertV2?.supersedesUnreleasedMilestone === expertConvergence?.id, "Evolution Expert 2.0 must explicitly supersede unreleased Expert 1.1");
  validateV6TerminalCompletion(runtimeV6, "Runtime", 176, "6.0.0", "v6.0.0");
  validateV6TerminalCompletion(expertV2, "Evolution Expert", 77, "2.0.0", "evolution-expert-v2.0.0");
  validateV6PublicEvidence("governance/targets/evopilot-v6.0.0-agent-native-lifecycle-control-plane.json", "Runtime", "6.0.0", "v6.0.0", 6);
  validateV6PublicEvidence("governance/targets/evopilot-evolution-expert-v2.0.0-agent-host-entry.json", "Evolution Expert", "2.0.0", "evolution-expert-v2.0.0", 1);
  const cutoverMilestone = milestones.find((milestone) => milestone.id === suiteTransition?.postRelease?.milestone);
  required(cutoverMilestone?.status === "PLANNED", "post-release legacy Suite Cutover milestone must be PLANNED");
  required(cutoverMilestone?.standaloneReleaseEligible === false, "post-release legacy Suite Cutover must not create another release line");
  required(cutoverMilestone?.releaseBlockerForV60 === false, "post-release legacy Suite Cutover milestone must not block v6.0 release");
  required(cutoverMilestone?.timing === "AFTER_PUBLIC_RUNTIME_6_0_AND_EXPERT_2_0_VERIFIED_INSTALLATION", "post-release legacy Suite Cutover milestone timing is invalid");
  required(cutoverMilestone?.targetVersion === value?.versionPolicy?.currentWorkingVersion, "post-release legacy Suite Cutover must bind the Runtime completion successor");
  const experimentMilestone = milestones.find((milestone) => milestone.id === "evopilot-6.1-controlled-experiment-loop");
  required(experimentMilestone?.targetVersion === "6.1.0" && experimentMilestone?.status === "PLANNED", "Controlled Experiment Loop must be rescheduled to v6.1.0");
  const learningMilestone = milestones.find((milestone) => milestone.id === "evopilot-6.2-learning-interop");
  required(learningMilestone?.targetVersion === "6.2.0" && learningMilestone?.status === "PLANNED", "Learning Interoperability must be rescheduled to v6.2.0");
  for (const milestone of milestones.filter((item) => item.status === "DEFERRED")) {
    const destination = milestones.find((item) => item.id === milestone.deferredInto);
    required(typeof milestone.deferredInto === "string" && destination != null, `DEFERRED milestone must name a declared deferredInto milestone: ${milestone.id}`);
    required(milestone.standaloneReleaseEligible === false, `DEFERRED milestone must disable standalone release eligibility: ${milestone.id}`);
    required(["IN_PROGRESS", "COMPLETE"].includes(destination?.status), `DEFERRED milestone destination must be IN_PROGRESS or COMPLETE: ${milestone.id}`);
    required(destination?.inheritsMilestone === milestone.id, `DEFERRED milestone destination must declare inheritsMilestone: ${milestone.id}`);
    required(Array.isArray(destination?.inheritedAcceptance) && destination.inheritedAcceptance.length > 0, `DEFERRED milestone destination must declare inheritedAcceptance: ${milestone.id}`);
    const transition = (value?.transitionPolicies ?? []).find((item) => item.sourceMilestone === milestone.id && item.destinationMilestone === milestone.deferredInto);
    required(transition?.sourceReleaseDisposition === "DEFERRED", `DEFERRED milestone must have a matching transition policy: ${milestone.id}`);
    required(transition?.preserveSourceCodeAndEvidence === true && transition?.deleteSourceGuarantees === false && transition?.destinationMustRetestSourceAcceptance === true, `DEFERRED milestone transition must preserve and retest source guarantees: ${milestone.id}`);
  }
  const packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const knownVersions = new Set([value?.versionPolicy?.publishedBaseline, value?.versionPolicy?.currentWorkingVersion, ...(value?.milestones ?? []).filter((item) => item.product === value?.versionPolicy?.runtimeProduct).map((item) => item.targetVersion)]);
  required(knownVersions.has(packageVersion), `package version ${packageVersion} is not declared by the Roadmap`);
  required(fs.existsSync(path.join(root, "docs/roadmap/ROADMAP.md")), "docs/roadmap/ROADMAP.md is missing");
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  required(agents.includes("Roadmap Gate"), "AGENTS.md must require the Roadmap Gate");
  const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
  required(packageJson.includes('"roadmap:check"'), "package.json must expose roadmap:check");
  required(packageJson.includes('"roadmap:gate"'), "package.json must expose roadmap:gate");
  required(packageJson.includes('"roadmap:release"'), "package.json must expose roadmap:release");
  return failures;

  function required(condition, message) {
    if (!condition) failures.push(message);
  }

  function validateCompletionSuccessor(milestone, predecessorVersion, successorVersion, label) {
    required(milestone?.targetVersion === successorVersion, `${label} completion successor must target ${successorVersion}`);
    required(milestone?.publishedPredecessor?.version === predecessorVersion, `${label} published predecessor must be ${predecessorVersion}`);
    required(milestone?.publishedPredecessor?.state === "PUBLISHED_DISTRIBUTION_REMEDIATION_REQUIRED", `${label} predecessor state must preserve the completion-remediation finding`);
    required(milestone?.publishedPredecessor?.immutable === true, `${label} published predecessor must remain immutable`);
    required(milestone?.publishedPredecessor?.acceptanceEvidenceDisposition === "HISTORICAL_PROCESS_EVIDENCE_NOT_COMPLETION_PROOF", `${label} predecessor evidence must not count as completion proof`);
    if (milestone?.status === "COMPLETE") {
      const report = milestone?.completionEvidence;
      required(report?.schema === "evopilot-approved-scheme-completion-report/v1", `${label} COMPLETE requires a completion report`);
      required(report?.total === report?.passed && report?.total > 0, `${label} COMPLETE requires total == passed > 0`);
      for (const key of ["failed", "pending", "stale", "generic", "unmapped"]) required(report?.[key] === 0, `${label} COMPLETE requires ${key}=0`);
      required(report?.noRegression === "PASSED", `${label} COMPLETE requires NO_REGRESSION PASSED`);
      required(report?.exactInstalledCandidatePair === "VERIFIED", `${label} COMPLETE requires the exact installed Candidate pair VERIFIED`);
    }
  }

  function validateV6TerminalCompletion(milestone, label, total, version, releaseTag) {
    const report = milestone?.completionEvidence;
    required(report?.schema === "evopilot-approved-scheme-completion-report/v1", `${label} v6 terminal completion report is required`);
    required(report?.total === total && report?.passed === total, `${label} v6 terminal completion must be ${total}/${total}`);
    for (const key of ["failed", "pending", "stale", "generic", "unmapped"]) required(report?.[key] === 0, `${label} v6 terminal completion requires ${key}=0`);
    required(report?.version === version, `${label} v6 terminal completion version must be ${version}`);
    required(report?.acceptanceCampaignTotal === 253 && report?.acceptanceCampaignPassed === 253, `${label} v6 terminal completion requires campaign 253/253`);
    required(report?.crossAcceptanceTotal === 10 && report?.crossAcceptancePassed === 10, `${label} v6 terminal completion requires cross-acceptance 10/10`);
    required(report?.exactInstalledCandidatePair === "VERIFIED", `${label} v6 terminal completion requires the exact installed Candidate pair VERIFIED`);
    required(report?.acceptedCandidateCommit === "d0d0f691d9fb4408da727464d37c05d3d0024435", `${label} v6 terminal completion must bind the accepted Candidate commit`);
    required(report?.acceptanceResultDigest === "sha256:43f2ed055215226927a217d87d5c6618aa9f3294e27b064ce5aa03c02c3fd00c", `${label} v6 terminal completion must bind the acceptance result digest`);
    required(report?.impactClosure === "PASS", `${label} v6 terminal completion requires impact closure PASS`);
    required(report?.noRegression === "PASSED", `${label} v6 terminal completion requires NO_REGRESSION PASSED`);
    required(report?.legacySuiteInvocationCount === 0, `${label} v6 terminal completion requires zero legacy Suite invocation`);
    required(report?.publicEvidenceRef === `https://github.com/yeliang-wang/evopilot/releases/tag/${releaseTag}`, `${label} v6 terminal completion requires exact public Release evidence`);
  }

  function validateV6PublicEvidence(relativeTargetPath, label, version, tag, packageCount) {
    let target;
    try {
      target = JSON.parse(fs.readFileSync(path.join(root, relativeTargetPath), "utf8"));
    } catch (error) {
      required(false, `${label} public evidence Target cannot be read: ${error.message}`);
      return;
    }
    const evidence = target?.publicEvidence;
    required(evidence?.schema === "evopilot-public-release-evidence/v1" && evidence?.status === "VERIFIED", `${label} public evidence must be VERIFIED`);
    required(evidence?.version === version && evidence?.tag === tag, `${label} public evidence must bind ${tag}`);
    required(evidence?.acceptedProductCommit === "d0d0f691d9fb4408da727464d37c05d3d0024435", `${label} public evidence must bind the accepted Candidate commit`);
    required(evidence?.githubRelease === `https://github.com/yeliang-wang/evopilot/releases/tag/${tag}`, `${label} public evidence must bind the exact GitHub Release`);
    const packages = Array.isArray(evidence?.npmPackages) ? evidence.npmPackages : evidence?.npmPackage ? [evidence.npmPackage] : [];
    required(packages.length === packageCount && packages.every((item) => item.endsWith(`@${version}`)), `${label} public evidence must bind all ${packageCount} npm package(s)`);
    required(evidence?.packageIntegrity?.startsWith("VERIFIED_AGAINST_ACCEPTED_TARBALL"), `${label} npm integrity evidence is required`);
    required(evidence?.registrySignatures === "CRYPTOGRAPHICALLY_VERIFIED", `${label} registry signatures must be verified`);
    required(evidence?.provenance === "SLSA_V1_REKOR_INTEGRITY_MATCH_AND_INCLUSION_PROOF_VERIFIED", `${label} provenance must be verified`);
    required(evidence?.publicInstallation === "VERIFIED_FROM_EMPTY_DIRECTORY", `${label} public installation must be verified`);
    required(evidence?.productBytesRebuilt === false, `${label} public evidence must prove no rebuild`);
    required(evidence?.acceptanceResultDigest === "sha256:43f2ed055215226927a217d87d5c6618aa9f3294e27b064ce5aa03c02c3fd00c", `${label} public evidence must bind the acceptance result`);
  }
}

function classifyIntent(rawIntent, value) {
  const normalized = normalize(rawIntent);
  if (!normalized) return decision("UNKNOWN", [], [], ["Intent is empty or not classifiable."], "NONE");

  const boundaryMatches = (value.boundaryRules ?? []).filter((rule) => matches(normalized, rule.signals));
  if (boundaryMatches.length > 0) {
    return decision("BOUNDARY_CHANGE", [], [], boundaryMatches.map((rule) => `${rule.id}: ${rule.reason}`), "REPLACEMENT_ADR_REQUIRED");
  }
  if (matches(normalized, value.deviationSignals ?? [])) {
    return decision("DEVIATION", [], [], ["Intent explicitly changes the accepted Roadmap, milestone order, or product boundary."], "ROADMAP_REVISION_REQUIRED");
  }

  const matchingMilestones = value.milestones.filter((milestone) => matches(normalized, milestone.signals));
  const deferredMatches = matchingMilestones.filter((milestone) => milestone.status === "DEFERRED");
  const supersededMatches = matchingMilestones.filter((milestone) => milestone.status === "SUPERSEDED");
  const matchedMilestones = matchingMilestones.filter((milestone) => !["DEFERRED", "SUPERSEDED"].includes(milestone.status)).map((milestone) => milestone.id);
  const matchedStandingItems = value.standingWork.filter((item) => matches(normalized, item.signals));
  const capabilityExpansion = matches(normalized, value.intentPolicy?.capabilityExpansionSignals ?? []);
  const alignedStandingItems = matchedStandingItems.filter((item) => !capabilityExpansion || item.allowsCapabilityExpansion === true);
  const matchedStandingWork = matchedStandingItems.map((item) => item.id);
  const uncoveredClauses = uncoveredCapabilityClauses(rawIntent, value);
  if (uncoveredClauses.length > 0) {
    return decision(
      "UNPLANNED",
      matchedMilestones,
      matchedStandingWork,
      ["Composite intent contains capability-expanding clauses that do not match declared Roadmap work.", ...uncoveredClauses.map((clause) => `uncovered-clause: ${clause}`)],
      "USER_REVIEW_REQUIRED"
    );
  }
  if (matchedMilestones.length > 0 || alignedStandingItems.length > 0) {
    return decision("ALIGNED", matchedMilestones, alignedStandingItems.map((item) => item.id), ["Intent matches declared Roadmap work."], "NONE");
  }
  if (deferredMatches.length > 0) {
    return decision("DEVIATION", deferredMatches.map((item) => item.id), [], ["Intent matches only a DEFERRED milestone; explicit Roadmap reactivation is required."], "ROADMAP_REVISION_REQUIRED");
  }
  if (supersededMatches.length > 0) {
    return decision("UNPLANNED", supersededMatches.map((item) => item.id), [], ["Intent matches only a SUPERSEDED unreleased milestone and must be planned against its declared successor."], "USER_REVIEW_REQUIRED");
  }
  if (matchedStandingWork.length > 0 && capabilityExpansion) {
    return decision("UNPLANNED", [], matchedStandingWork, ["Standing-work wording cannot authorize a product capability expansion."], "USER_REVIEW_REQUIRED");
  }
  return decision("UNPLANNED", [], [], ["Intent does not match a declared milestone or standing maintenance class."], "USER_REVIEW_REQUIRED");
}

function classifyRelease(version, product, value) {
  if (!semver(version)) return { classification: "UNKNOWN", matchedMilestones: [], reasons: [`Release version is not SemVer: ${version}`] };
  const knownProducts = new Set([value.versionPolicy.runtimeProduct, value.evolutionExpertPolicy.product]);
  if (!knownProducts.has(product)) return { classification: "UNKNOWN", matchedMilestones: [], reasons: [`Unknown release product: ${product}`] };
  const versionPolicy = product === value.versionPolicy.runtimeProduct ? value.versionPolicy : value.evolutionExpertPolicy;
  const exactBaseline = [versionPolicy.publishedBaseline, versionPolicy.currentWorkingVersion].includes(version);
  const matchingMilestones = value.milestones.filter((milestone) => milestone.product === product && (version === milestone.targetVersion || inReleaseLine(version, milestone.releaseLine)));
  const matchedMilestones = matchingMilestones.map((milestone) => milestone.id);
  const eligibleMilestones = matchingMilestones.filter((milestone) => !["DEFERRED", "SUPERSEDED"].includes(milestone.status) && milestone.standaloneReleaseEligible !== false);
  if (matchingMilestones.length > 0 && eligibleMilestones.length === 0) {
    return { classification: "UNPLANNED", matchedMilestones, reasons: [`Release ${version} matches only a DEFERRED or SUPERSEDED non-releasable milestone.`] };
  }
  if (exactBaseline || eligibleMilestones.length > 0) return { classification: "ALIGNED", matchedMilestones: eligibleMilestones.map((milestone) => milestone.id), reasons: [`Release ${product} ${version} is declared by the Roadmap.`] };
  return { classification: "UNPLANNED", matchedMilestones: [], reasons: [`Release ${product} ${version} is outside every declared baseline and release line.`] };
}

function baseResult(classification, details) {
  return {
    schema: "evopilot-roadmap-gate-result/v1",
    roadmapFamily: roadmap.roadmapFamily,
    contractVersion: roadmap.contractVersion,
    roadmapDigest: `sha256:${crypto.createHash("sha256").update(fs.readFileSync(contractPath)).digest("hex")}`,
    project: roadmap.project,
    classification,
    ...details
  };
}

function decision(classification, matchedMilestones, matchedStandingWork, reasons, boundaryImpact) {
  return {
    classification,
    intent,
    matchedMilestones,
    matchedStandingWork,
    reasons,
    boundaryImpact,
    approvalRequired: classification !== "ALIGNED",
    nextAction: classification === "ALIGNED" ? "continue-with-scoped-implementation" : classification === "BOUNDARY_CHANGE" ? "stop-and-propose-replacement-adr-and-roadmap-revision" : "stop-and-request-user-review"
  };
}

function matches(text, signals) {
  return signals.some((signal) => text.includes(normalize(signal)));
}

function uncoveredCapabilityClauses(rawIntent, value) {
  if (value?.intentPolicy?.compositeCoverage?.enabled !== true) return [];
  const clauses = splitIntentClauses(rawIntent, value.intentPolicy.compositeCoverage.clauseSeparators ?? []);
  return clauses.filter((clause) => {
    if (!matches(clause, value.intentPolicy?.capabilityExpansionSignals ?? [])) return false;
    const milestoneMatch = value.milestones.some((milestone) => milestone.status !== "DEFERRED" && matches(clause, milestone.signals));
    const standingMatch = value.standingWork.some((item) => item.allowsCapabilityExpansion === true && matches(clause, item.signals));
    return !milestoneMatch && !standingMatch;
  });
}

function splitIntentClauses(rawIntent, separators) {
  let clauses = [normalize(rawIntent)];
  for (const separator of separators) {
    const normalizedSeparator = String(separator ?? "").toLowerCase().replace(/\s+/g, " ");
    if (!normalizedSeparator.trim()) continue;
    clauses = clauses.flatMap((clause) => clause.split(normalizedSeparator));
  }
  return clauses.map((clause) => clause.trim()).filter(Boolean);
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function semver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(value ?? ""));
}

function arrayEquals(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function inReleaseLine(version, line) {
  const [major, minor] = version.split(".");
  return `${major}.${minor}.x` === line;
}

function option(name) {
  const equal = args.find((arg) => arg.startsWith(`${name}=`));
  if (equal) return equal.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args.length > index + 1 && !args[index + 1].startsWith("--") ? args[index + 1] : undefined;
}

function positionalAfter(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function emit(result, exitCode) {
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Roadmap Gate: ${result.classification}`);
    console.log(`Project: ${result.project}`);
    if (result.intent) console.log(`Intent: ${result.intent}`);
    for (const reason of result.reasons ?? result.errors ?? []) console.log(`- ${reason}`);
    console.log(`Next action: ${result.nextAction}`);
  }
  process.exit(exitCode);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
