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
  required(value?.versionPolicy?.publishedBaseline === "6.1.0" && value?.versionPolicy?.currentWorkingVersion === "6.2.0", "Runtime Roadmap must preserve public 6.1.0 and bind current 6.2.0");
  required(value?.evolutionExpertPolicy?.publishedBaseline === "2.1.0" && value?.evolutionExpertPolicy?.currentWorkingVersion === "2.2.0", "Evolution Expert Roadmap must preserve public 2.1.0 and bind current 2.2.0");
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
  const lifecycleEvolution = value?.controlledLifecycleEvolutionPolicy;
  required(lifecycleEvolution?.schema === "evopilot-controlled-lifecycle-evolution-policy/v1", "controlled Lifecycle evolution policy schema is invalid");
  required(lifecycleEvolution?.required === true, "controlled Lifecycle evolution must be required");
  required(lifecycleEvolution?.runtimeVersion === "6.1.0" && lifecycleEvolution?.evolutionExpertVersion === "2.1.0", "controlled Lifecycle evolution must bind Runtime 6.1.0 and Expert 2.1.0");
  required(lifecycleEvolution?.mode === "OBSERVE_PROPOSE_EXPERIMENT_ACTIVATE_MONITOR_ROLLBACK", "controlled Lifecycle evolution mode is invalid");
  required(Array.isArray(lifecycleEvolution?.stages) && lifecycleEvolution.stages.length === 11, "controlled Lifecycle evolution must declare exactly 11 stages");
  for (const stage of ["OBSERVE", "CLASSIFY", "PROPOSE_IMMUTABLE_SUCCESSOR", "SEMANTIC_DIFF_AND_COMPATIBILITY", "PLAN_COMPARABLE_EXPERIMENT", "VALIDATE_CHALLENGER", "DECIDE_BY_POLICY_OR_HUMAN_AUTHORITY", "ACTIVATE_FOR_FUTURE_RUNS", "MONITOR", "ROLLBACK_OR_RETAIN", "LEARN_WITH_PROVENANCE"]) {
    required(lifecycleEvolution?.stages?.includes(stage), `controlled Lifecycle evolution is missing ${stage}`);
  }
  const safeActivation = lifecycleEvolution?.safeAutomaticActivation;
  required(safeActivation?.preauthorizedPolicyRequired === true, "automatic Lifecycle activation requires an exact preauthorized policy");
  required(safeActivation?.compatibilityRequired === "BACKWARD_COMPATIBLE", "automatic Lifecycle activation must be backward compatible");
  required(safeActivation?.reversibleRequired === true && safeActivation?.verifiedRollbackRequired === true, "automatic Lifecycle activation requires reversible verified rollback");
  required(safeActivation?.destructiveAllowed === false && safeActivation?.externallyVisibleAllowed === false && safeActivation?.newAuthorityAllowed === false, "automatic Lifecycle activation must not be destructive, externally visible, or expand authority");
  required(safeActivation?.canaryEvidenceRequired === true, "automatic Lifecycle activation requires canary evidence");
  for (const decision of ["project or product meaning", "material acceptance or policy semantics", "production or database authority", "credential use or authority expansion", "destructive, irreversible, or externally visible effect", "Candidate acceptance, publication, deployment, or Release", "ambiguous Harness match or same-rank authority conflict", "unresolved mutation state or exhausted bounded recovery"]) {
    required(lifecycleEvolution?.humanDecisionRequiredFor?.includes(decision), `controlled Lifecycle evolution is missing human gate: ${decision}`);
  }
  required(lifecycleEvolution?.immutableRunBinding?.includes("active run retains its exact LifecycleRevision and HarnessExecutionBinding"), "active runs must retain exact Lifecycle and Harness bindings");
  required(lifecycleEvolution?.productGapRule?.includes("Evolution Target proposal") && lifecycleEvolution?.productGapRule?.includes("never a project-specific branch"), "generic product gaps must route to an Evolution Target without project-specific branches");
  const dataRigReference = lifecycleEvolution?.dataRigProductionReference;
  required(dataRigReference?.role === "READ_ONLY_PRODUCTION_CONVERGENCE_EVIDENCE", "DataRig 2.1.11 must be read-only production convergence evidence");
  required(dataRigReference?.suiteVersion === "2.1.11" && dataRigReference?.sourceSuiteVersion === "2.1.11", "DataRig production reference must bind Suite 2.1.11");
  required(dataRigReference?.manifestDigest === "sha256:416e76bd1c8244eb227a835d9c2db1e7728e9d59ff56b6df516306b3c058bd80", "DataRig 2.1.11 manifest digest is invalid");
  required(dataRigReference?.criticalContentDigest === "sha256:ef4efe668eb978e1dab2669cb20156bf1ad0dfbc28b927e50ae1aa3c27d8515f", "DataRig 2.1.11 critical content digest is invalid");
  required(dataRigReference?.resourceIdentity === "datarig-production-delivery" && dataRigReference?.initialResourceVersion === "1.0.0", "DataRig production reference must create independently versioned datarig-production-delivery@1.0.0");
  required(dataRigReference?.runtimeDependency === false && dataRigReference?.installedSuiteMutationAllowed === false && dataRigReference?.rewritesV6HistoricalBaseline === false, "DataRig 2.1.11 must not become a Runtime dependency, mutate the installed Suite, or rewrite v6 history");
  required(dataRigReference?.capabilityInventoryCoveragePercent === 100, "DataRig 2.1.11 capability inventory coverage must be 100 percent");
  for (const disposition of ["PROJECT_DEFINITION", "LIFECYCLE_RESOURCE", "POLICY_RESOURCE", "GOVERNANCE_PACK", "ACTION_PROVIDER", "RUNTIME_GENERIC_PRIMITIVE", "EXPERT_GENERIC_JOURNEY", "DATARIG_OWNED_BEHAVIOR", "NON_APPLICABLE_WITH_REASON"]) {
    required(dataRigReference?.dispositions?.includes(disposition), `DataRig capability inventory is missing disposition ${disposition}`);
  }
  required(Array.isArray(lifecycleEvolution?.requiredEndToEnd) && lifecycleEvolution.requiredEndToEnd.length === 13, "controlled Lifecycle evolution must declare exactly 13 E2E journeys");
  for (const e2e of ["E2E-DATARIG-211-SNAPSHOT", "E2E-DATARIG-211-CAPABILITY-MAP", "E2E-DATARIG-211-RESOURCE-ONLY", "E2E-DATARIG-211-GAP-TO-TARGET", "E2E-OBSERVE-PROPOSE", "E2E-CHAMPION-CHALLENGER", "E2E-AUTO-ACTIVATE-SAFE", "E2E-HUMAN-GATE-SEMANTIC", "E2E-MONITOR-ROLLBACK", "E2E-EXPERT-CROSS-HOST", "E2E-REAL-HARNESS-BUNDLE", "E2E-NO-SUITE", "E2E-NO-REGRESSION"]) {
    required(lifecycleEvolution?.requiredEndToEnd?.includes(e2e), `controlled Lifecycle evolution is missing ${e2e}`);
  }
  required(lifecycleEvolution?.completionFormula === "FUNCTIONAL_100_PERCENT_AND_CAPABILITY_DISPOSITION_100_PERCENT_AND_CURRENT_E2E_100_PERCENT_AND_INHERITED_APPLICABLE_100_PERCENT_AND_IMPACT_CLOSURE_100_PERCENT_AND_NO_REGRESSION_PASSED_AND_FAILED_PENDING_STALE_GENERIC_SILENT_EXCLUSION_UNMAPPED_ALL_ZERO", "controlled Lifecycle evolution completion must fail closed");
  const firstRunReadiness = value?.firstRunLlmReadinessPolicy;
  required(firstRunReadiness?.schema === "evopilot-first-run-llm-readiness-policy/v1", "first-run LLM readiness policy schema is invalid");
  required(firstRunReadiness?.required === true, "first-run LLM readiness must be required");
  required(firstRunReadiness?.runtimeVersion === "6.2.0" && firstRunReadiness?.evolutionExpertVersion === "2.2.0", "first-run LLM readiness must bind Runtime 6.2.0 and Expert 2.2.0");
  required(arrayEquals(firstRunReadiness?.states, ["SETUP_REQUIRED", "PREFLIGHT_REQUIRED", "READY", "LLM_BLOCKED"]), "first-run LLM readiness states are incomplete or reordered");
  for (const prerequisite of ["one active tenant/workspace-visible workspace LLM profile", "server-side SecretRef resolved inside the same tenant/workspace", "live provider preflight READY within the declared freshness policy", "explicit WorkspaceLlmDefaultBinding", "compatible Evolution Expert and MCP setup protocol"]) {
    required(firstRunReadiness?.normalOperationRequires?.includes(prerequisite), `first-run LLM readiness is missing normal-operation prerequisite: ${prerequisite}`);
  }
  required(Array.isArray(firstRunReadiness?.setupOnlyAllowed) && firstRunReadiness.setupOnlyAllowed.length === 8, "setup-only allowlist must contain exactly eight governed capability groups");
  required(Array.isArray(firstRunReadiness?.blockedUntilReady) && firstRunReadiness.blockedUntilReady.length === 5, "pre-READY blocked-operation list must contain exactly five groups");
  required(arrayEquals(firstRunReadiness?.resolutionOrder, ["run override", "project default", "explicit workspace default", "LLM_PROFILE_REQUIRED"]), "LLM resolution precedence must be run, project, workspace, then hard failure");
  for (const fallback of ["implicit shell environment", "Host LLM", "Agent Model", "Codex configuration", "Claude Code configuration", "WorkBuddy configuration", "CodeBuddy models.json", "MyGlm5", "hard-coded provider preset"]) {
    required(firstRunReadiness?.forbiddenFallbacks?.includes(fallback), `first-run LLM readiness must forbid fallback: ${fallback}`);
  }
  required(firstRunReadiness?.readinessFailure?.includes("LLM_BLOCKED") && firstRunReadiness?.readinessFailure?.includes("never select another profile silently"), "readiness failure must fail closed without silent profile failover");
  required(firstRunReadiness?.migrationFrom61?.includes("without guessing"), "6.1 migration must stop on ambiguity without guessing");
  required(firstRunReadiness?.headlessBootstrap?.includes("never remain runtime truth"), "headless bootstrap must not retain environment values as runtime truth");
  const secretContract = firstRunReadiness?.secureSecretContract;
  required(Array.isArray(secretContract?.rawSecretForbiddenIn) && secretContract.rawSecretForbiddenIn.length === 12, "raw secrets must be forbidden across all twelve declared surfaces");
  required(Array.isArray(secretContract?.allowedInputs) && secretContract.allowedInputs.length === 5, "secure secret input must declare exactly five approved source classes");
  required(secretContract?.persistedForm === "SecretRef only", "only SecretRef may be persisted");
  required(secretContract?.preflight?.includes("Resolve server-side") && secretContract?.preflight?.includes("never return the raw value"), "provider preflight must resolve server-side and remain redacted");
  const architecture = firstRunReadiness?.readmeArchitecture;
  required(architecture?.required === true, "README architecture contract must be required");
  required(architecture?.authoritativeAsset === "docs/assets/architecture/evopilot-agent-native-architecture.svg", "README architecture must bind the authoritative SVG asset");
  required(architecture?.fallbackAsset === "docs/assets/architecture/evopilot-agent-native-architecture.png", "README architecture must bind the PNG fallback asset");
  required(architecture?.readmeSection === "Architecture", "README architecture section name is invalid");
  required(Array.isArray(architecture?.requiredNodes) && architecture.requiredNodes.length === 15, "README architecture must declare exactly fifteen required nodes");
  required(Array.isArray(architecture?.requiredEdges) && architecture.requiredEdges.length === 7, "README architecture must declare exactly seven required edges");
  required(Array.isArray(architecture?.forbiddenImplications) && architecture.forbiddenImplications.length === 5, "README architecture must declare all forbidden implications");
  required(Array.isArray(architecture?.quality) && architecture.quality.length === 6, "README architecture must declare all rendering and accessibility qualities");
  required(Array.isArray(firstRunReadiness?.functionalAcceptance) && firstRunReadiness.functionalAcceptance.length === 8, "first-run LLM readiness must declare exactly eight functional acceptance areas");
  required(Array.isArray(firstRunReadiness?.capabilityAcceptance) && firstRunReadiness.capabilityAcceptance.length === 7, "first-run LLM readiness must declare exactly seven capability acceptance areas");
  const requiredReadinessE2e = ["E2E-SETUP-FRESH-INSTALL", "E2E-NO-LOCAL-IMPORT", "E2E-HOST-LLM-NOT-RUNTIME", "E2E-EXPERT-SECURE-SETUP", "E2E-PREFLIGHT-FAIL", "E2E-READY-HARNESS-LOOP", "E2E-RESTART-PERSISTENCE", "E2E-DEGRADE-REPAIR", "E2E-RESOLUTION-PRECEDENCE", "E2E-TENANT-ISOLATION", "E2E-V61-MIGRATION", "E2E-HEADLESS-BOOTSTRAP", "E2E-CROSS-HOST", "E2E-README-ARCHITECTURE", "E2E-NO-REGRESSION"];
  required(arrayEquals(firstRunReadiness?.requiredEndToEnd, requiredReadinessE2e), "first-run LLM readiness must declare the exact fifteen E2E journeys");
  required(firstRunReadiness?.completionFormula === "FUNCTIONAL_100_PERCENT_AND_CAPABILITY_100_PERCENT_AND_DOCUMENTATION_100_PERCENT_AND_CURRENT_E2E_100_PERCENT_AND_INHERITED_APPLICABLE_100_PERCENT_AND_CROSS_HOST_100_PERCENT_AND_MIGRATION_100_PERCENT_AND_REAL_HARNESS_BUNDLE_100_PERCENT_AND_SECURITY_100_PERCENT_AND_IMPACT_CLOSURE_100_PERCENT_AND_NO_REGRESSION_PASSED_AND_FAILED_PENDING_STALE_GENERIC_UNMAPPED_LEAKED_SECRET_HIDDEN_FALLBACK_LEGACY_SUITE_INVOCATION_ALL_ZERO", "first-run LLM readiness completion formula must fail closed across every evidence and leak class");
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
  required(cutoverMilestone?.targetVersion === "6.0.0", "post-release legacy Suite Cutover must remain bound to the public Runtime 6.0.0 prerequisite");
  const experimentMilestone = milestones.find((milestone) => milestone.id === "evopilot-6.1-controlled-lifecycle-evolution");
  required(experimentMilestone?.targetVersion === "6.1.0" && experimentMilestone?.status === "COMPLETE", "Controlled Lifecycle Evolution must be the COMPLETE Runtime 6.1.0 milestone");
  const expertEvolutionMilestone = milestones.find((milestone) => milestone.id === "evopilot-evolution-expert-2.1-controlled-lifecycle-evolution");
  required(expertEvolutionMilestone?.targetVersion === "2.1.0" && expertEvolutionMilestone?.status === "COMPLETE", "Controlled Lifecycle Evolution Expert must be the COMPLETE Expert 2.1.0 milestone");
  validateV61TerminalCompletion(experimentMilestone, "Runtime", "6.1.0", "314ec9b01024706b932b19afdc71f4c2c8f8f6ea", "v6.1.0");
  validateV61TerminalCompletion(expertEvolutionMilestone, "Evolution Expert", "2.1.0", "56e4506664a962d6f09fd0a3077a82e13bf532ff", "evolution-expert-v2.1.0");
  validateV61PublicEvidence("governance/targets/evopilot-v6.1.0-controlled-lifecycle-evolution.json", "Runtime", "6.1.0", "v6.1.0", 6, "314ec9b01024706b932b19afdc71f4c2c8f8f6ea", true);
  validateV61PublicEvidence("governance/targets/evopilot-evolution-expert-v2.1.0-controlled-lifecycle-evolution.json", "Evolution Expert", "2.1.0", "evolution-expert-v2.1.0", 1, "56e4506664a962d6f09fd0a3077a82e13bf532ff", false);
  const readinessMilestone = milestones.find((milestone) => milestone.id === "evopilot-6.2-first-run-llm-readiness");
  required(readinessMilestone?.targetVersion === "6.2.0" && ["IN_PROGRESS", "COMPLETE"].includes(readinessMilestone?.status), "First-Run Governed LLM Readiness must be the IN_PROGRESS or COMPLETE Runtime 6.2.0 milestone");
  const expertReadinessMilestone = milestones.find((milestone) => milestone.id === "evopilot-evolution-expert-2.2-first-run-llm-setup");
  required(expertReadinessMilestone?.targetVersion === "2.2.0" && ["IN_PROGRESS", "COMPLETE"].includes(expertReadinessMilestone?.status), "First-Run Governed LLM Setup Guide must be the IN_PROGRESS or COMPLETE Expert 2.2.0 milestone");
  required((readinessMilestone?.status === "COMPLETE") === (expertReadinessMilestone?.status === "COMPLETE"), "Runtime 6.2 and Evolution Expert 2.2 must enter COMPLETE together");
  if (readinessMilestone?.status === "COMPLETE" && expertReadinessMilestone?.status === "COMPLETE") {
    validateV62TerminalCompletion(readinessMilestone, "Runtime", "6.2.0", "v6.2.0");
    validateV62TerminalCompletion(expertReadinessMilestone, "Evolution Expert", "2.2.0", "evolution-expert-v2.2.0");
    validateV62PublicEvidence("governance/targets/evopilot-v6.2.0-first-run-llm-readiness.json", "Runtime", "6.2.0", "v6.2.0", 6, true);
    validateV62PublicEvidence("governance/targets/evopilot-evolution-expert-v2.2.0-first-run-llm-setup.json", "Evolution Expert", "2.2.0", "evolution-expert-v2.2.0", 1, false);
  }
  const learningMilestone = milestones.find((milestone) => milestone.id === "evopilot-6.2-learning-interop");
  required(learningMilestone?.targetVersion === "6.2.0" && learningMilestone?.status === "DEFERRED" && learningMilestone?.deferredInto === "evopilot-6.3-learning-interop", "Learning Interoperability must be deferred intact from v6.2.0 to v6.3.0");
  const learningDestination = milestones.find((milestone) => milestone.id === "evopilot-6.3-learning-interop");
  required(learningDestination?.targetVersion === "6.3.0" && learningDestination?.status === "PLANNED", "Learning Interoperability destination must be the PLANNED Runtime 6.3.0 milestone");
  required(learningDestination?.objective === learningMilestone?.objective, "Learning Interoperability objective must be preserved intact during deferral");
  required(arrayEquals(learningDestination?.outcomes, learningMilestone?.outcomes), "Learning Interoperability outcomes must be preserved intact during deferral");
  required(arrayEquals(learningDestination?.acceptance, learningMilestone?.acceptance), "Learning Interoperability acceptance must be preserved intact during deferral");
  required(arrayEquals(learningDestination?.inheritedAcceptance, learningMilestone?.acceptance), "Learning Interoperability destination must explicitly inherit every source acceptance guarantee");
  for (const milestone of milestones.filter((item) => item.status === "DEFERRED")) {
    const destination = milestones.find((item) => item.id === milestone.deferredInto);
    required(typeof milestone.deferredInto === "string" && destination != null, `DEFERRED milestone must name a declared deferredInto milestone: ${milestone.id}`);
    required(milestone.standaloneReleaseEligible === false, `DEFERRED milestone must disable standalone release eligibility: ${milestone.id}`);
    required(["PLANNED", "IN_PROGRESS", "COMPLETE"].includes(destination?.status), `DEFERRED milestone destination must be PLANNED, IN_PROGRESS, or COMPLETE: ${milestone.id}`);
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
  const roadmapDocument = fs.readFileSync(path.join(root, "docs/roadmap/ROADMAP.md"), "utf8");
  for (const requiredText of ["### v6.2.0: First-Run Governed LLM Readiness", "### Evolution Expert v2.2.0: First-Run Governed LLM Setup Guide", "### v6.3.0: Learning Interoperability", "docs/assets/architecture/evopilot-agent-native-architecture.svg", "E2E-README-ARCHITECTURE"]) {
    required(roadmapDocument.includes(requiredText), `human Roadmap is missing required v6.2/v2.2 projection: ${requiredText}`);
  }
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

  function validateV61TerminalCompletion(milestone, label, version, acceptedCommit, releaseTag) {
    const report = milestone?.completionEvidence;
    required(report?.schema === "evopilot-approved-scheme-completion-report/v1", `${label} v6.1 terminal completion report is required`);
    required(report?.total === 305 && report?.passed === 305, `${label} v6.1 terminal completion must be 305/305`);
    for (const key of ["failed", "pending", "stale", "generic", "unmapped"]) required(report?.[key] === 0, `${label} v6.1 terminal completion requires ${key}=0`);
    required(report?.version === version, `${label} v6.1 terminal completion version must be ${version}`);
    required(report?.acceptanceCampaignTotal === 305 && report?.acceptanceCampaignPassed === 305, `${label} v6.1 terminal completion requires campaign 305/305`);
    required(report?.crossAcceptanceTotal === 10 && report?.crossAcceptancePassed === 10, `${label} v6.1 terminal completion requires cross-acceptance 10/10`);
    required(report?.exactInstalledCandidatePair === "VERIFIED", `${label} v6.1 terminal completion requires the exact installed Candidate pair VERIFIED`);
    required(report?.acceptedCandidateCommit === acceptedCommit, `${label} v6.1 terminal completion must bind the accepted Candidate commit`);
    required(report?.acceptanceResultDigest === "sha256:5ba1b4f61046ead07a463027cd5becd615c50d3ef26cbb22b2f2a54a9e057605", `${label} v6.1 terminal completion must bind the acceptance result digest`);
    required(report?.impactClosure === "PASS", `${label} v6.1 terminal completion requires impact closure PASS`);
    required(report?.noRegression === "PASSED", `${label} v6.1 terminal completion requires NO_REGRESSION PASSED`);
    required(report?.legacySuiteInvocationCount === 0, `${label} v6.1 terminal completion requires zero legacy Suite invocation`);
    required(report?.dataRigSuite211ReadOnlyCoverage === "VERIFIED" && report?.dataRigDispositionCoveragePercent === 100, `${label} v6.1 terminal completion requires exact read-only DataRig Suite 2.1.11 coverage`);
    required(report?.publicEvidenceRef === `https://github.com/yeliang-wang/evopilot/releases/tag/${releaseTag}`, `${label} v6.1 terminal completion requires exact public Release evidence`);
  }

  function validateV61PublicEvidence(relativeTargetPath, label, version, tag, packageCount, acceptedCommit, runtime) {
    let target;
    try {
      target = JSON.parse(fs.readFileSync(path.join(root, relativeTargetPath), "utf8"));
    } catch (error) {
      required(false, `${label} v6.1 public evidence Target cannot be read: ${error.message}`);
      return;
    }
    const evidence = target?.publicEvidence;
    required(evidence?.schema === "evopilot-public-release-evidence/v1" && evidence?.status === "VERIFIED", `${label} v6.1 public evidence must be VERIFIED`);
    required(evidence?.version === version && evidence?.tag === tag, `${label} v6.1 public evidence must bind ${tag}`);
    required(evidence?.acceptedProductCommit === acceptedCommit, `${label} v6.1 public evidence must bind the accepted Candidate commit`);
    required(evidence?.githubRelease === `https://github.com/yeliang-wang/evopilot/releases/tag/${tag}`, `${label} v6.1 public evidence must bind the exact GitHub Release`);
    const packages = Array.isArray(evidence?.npmPackages) ? evidence.npmPackages : evidence?.npmPackage ? [evidence.npmPackage] : [];
    required(packages.length === packageCount && packages.every((item) => item.endsWith(`@${version}`)), `${label} v6.1 public evidence must bind all ${packageCount} npm package(s)`);
    required(evidence?.packageIntegrity?.startsWith("VERIFIED_AGAINST_ACCEPTED_TARBALL"), `${label} v6.1 npm integrity evidence is required`);
    required(evidence?.registrySignatures === "CRYPTOGRAPHICALLY_VERIFIED", `${label} v6.1 registry signatures must be verified`);
    required(evidence?.provenance === "SLSA_V1_REKOR_INTEGRITY_MATCH_AND_INCLUSION_PROOF_VERIFIED", `${label} v6.1 provenance must be verified`);
    required(evidence?.publicInstallation === "VERIFIED_FROM_EMPTY_DIRECTORY", `${label} v6.1 public installation must be verified`);
    required(evidence?.productBytesRebuilt === false, `${label} v6.1 public evidence must prove no rebuild`);
    required(evidence?.acceptanceResultDigest === "sha256:5ba1b4f61046ead07a463027cd5becd615c50d3ef26cbb22b2f2a54a9e057605", `${label} v6.1 public evidence must bind the acceptance result`);
    if (runtime) {
      required(evidence?.ghcrManifestDigest === "sha256:faf883b4fcc7bded42500aa96c8e0b9e978eff069d6146a0d3cfef80c7380e65", "Runtime v6.1 public evidence must bind the exact GHCR digest");
      required(evidence?.cliEntrypoints === "VERIFIED" && evidence?.installer === "VERIFIED_DRY_RUN_FROM_PUBLIC_ACCEPTED_MANIFEST", "Runtime v6.1 CLI and installer evidence are required");
      required(evidence?.mcpAdapter === "VERIFIED", "Runtime v6.1 MCP adapter evidence is required");
    } else {
      required(evidence?.coreSchema === "evopilot-evolution-expert-core/v2" && /^sha256:[0-9a-f]{64}$/.test(evidence?.coreDigest ?? ""), "Evolution Expert v2.1 Core evidence is invalid");
      required(evidence?.skill === "PRESENT" && evidence?.mcpCompatibility === "VERIFIED", "Evolution Expert v2.1 Skill and MCP evidence are required");
      required(evidence?.runtimeCompatibility === "6.1.0_CONFORMANT", "Evolution Expert v2.1 Runtime compatibility must be conformant");
    }
  }

  function validateV62TerminalCompletion(milestone, label, version, releaseTag) {
    const report = milestone?.completionEvidence;
    required(report?.schema === "evopilot-approved-scheme-completion-report/v1", `${label} v6.2 terminal completion report is required`);
    required(report?.total === 355 && report?.passed === 355, `${label} v6.2 terminal completion must be 355/355`);
    for (const key of ["failed", "pending", "stale", "warning", "generic", "unmapped"]) required(report?.[key] === 0, `${label} v6.2 terminal completion requires ${key}=0`);
    required(report?.version === version, `${label} v6.2 terminal completion version must be ${version}`);
    required(report?.acceptanceCampaignTotal === 355 && report?.acceptanceCampaignPassed === 355, `${label} v6.2 terminal completion requires campaign 355/355`);
    required(report?.crossAcceptanceTotal === 10 && report?.crossAcceptancePassed === 10, `${label} v6.2 terminal completion requires cross-acceptance 10/10`);
    required(report?.exactInstalledCandidatePair === "VERIFIED", `${label} v6.2 terminal completion requires the exact installed Candidate pair VERIFIED`);
    required(report?.acceptedCandidateCommit === "8ec8f6c4def3ec3d760c7f4ec64d06bf0bba8a5e", `${label} v6.2 terminal completion must bind the accepted Candidate commit`);
    required(report?.acceptanceResultDigest === "sha256:02d2b8a7d340e00bf9640309dec0cfbda1fcdb7954ca321e36434c41675db24e", `${label} v6.2 terminal completion must bind the acceptance result digest`);
    required(report?.impactClosure === "PASS", `${label} v6.2 terminal completion requires impact closure PASS`);
    required(report?.noRegression === "PASSED", `${label} v6.2 terminal completion requires NO_REGRESSION PASSED`);
    required(report?.firstRunLlmReadiness === "VERIFIED", `${label} v6.2 terminal completion requires first-run LLM readiness VERIFIED`);
    required(report?.readmeArchitecture === "VERIFIED", `${label} v6.2 terminal completion requires README architecture VERIFIED`);
    const prohibitedCounts = report?.prohibitedCounts;
    required(prohibitedCounts && Object.values(prohibitedCounts).every((count) => count === 0), `${label} v6.2 terminal completion requires every prohibited count to be zero`);
    required(report?.publicEvidenceRef === `https://github.com/yeliang-wang/evopilot/releases/tag/${releaseTag}`, `${label} v6.2 terminal completion requires exact public Release evidence`);
  }

  function validateV62PublicEvidence(relativeTargetPath, label, version, tag, packageCount, runtime) {
    let target;
    try {
      target = JSON.parse(fs.readFileSync(path.join(root, relativeTargetPath), "utf8"));
    } catch (error) {
      required(false, `${label} v6.2 public evidence Target cannot be read: ${error.message}`);
      return;
    }
    const evidence = target?.publicEvidence;
    required(evidence?.schema === "evopilot-public-release-evidence/v1" && evidence?.status === "VERIFIED", `${label} v6.2 public evidence must be VERIFIED`);
    required(evidence?.version === version && evidence?.tag === tag, `${label} v6.2 public evidence must bind ${tag}`);
    required(evidence?.acceptedProductCommit === "8ec8f6c4def3ec3d760c7f4ec64d06bf0bba8a5e", `${label} v6.2 public evidence must bind the accepted Candidate commit`);
    required(evidence?.githubRelease === `https://github.com/yeliang-wang/evopilot/releases/tag/${tag}`, `${label} v6.2 public evidence must bind the exact GitHub Release`);
    const packages = Array.isArray(evidence?.npmPackages) ? evidence.npmPackages : evidence?.npmPackage ? [evidence.npmPackage] : [];
    required(packages.length === packageCount && packages.every((item) => item.endsWith(`@${version}`)), `${label} v6.2 public evidence must bind all ${packageCount} npm package(s)`);
    required(evidence?.packageIntegrity?.startsWith("VERIFIED_AGAINST_ACCEPTED_TARBALL"), `${label} v6.2 npm integrity evidence is required`);
    required(evidence?.registrySignatures === "CRYPTOGRAPHICALLY_VERIFIED", `${label} v6.2 registry signatures must be verified`);
    required(evidence?.provenance === "SLSA_V1_REKOR_INTEGRITY_MATCH_AND_INCLUSION_PROOF_VERIFIED", `${label} v6.2 provenance must be verified`);
    required(evidence?.publicInstallation === "VERIFIED_FROM_EMPTY_DIRECTORY", `${label} v6.2 public installation must be verified`);
    required(evidence?.productBytesRebuilt === false, `${label} v6.2 public evidence must prove no rebuild`);
    required(evidence?.acceptanceResultDigest === "sha256:02d2b8a7d340e00bf9640309dec0cfbda1fcdb7954ca321e36434c41675db24e", `${label} v6.2 public evidence must bind the acceptance result`);
    if (runtime) {
      required(/^sha256:[0-9a-f]{64}$/.test(evidence?.ghcrManifestDigest ?? ""), "Runtime v6.2 public evidence must bind the exact GHCR digest");
      required(evidence?.cliEntrypoints === "VERIFIED" && evidence?.installer === "VERIFIED_DRY_RUN_FROM_PUBLIC_ACCEPTED_MANIFEST", "Runtime v6.2 CLI and installer evidence are required");
      required(evidence?.mcpAdapter === "VERIFIED", "Runtime v6.2 MCP adapter evidence is required");
      required(evidence?.llmReadiness === "VERIFIED_SETUP_ONLY_TO_READY_AND_FAIL_CLOSED", "Runtime v6.2 LLM readiness evidence is required");
      required(evidence?.readmeArchitecture === "VERIFIED_SVG_PNG_LINKS_TERMINOLOGY_AND_RENDERING", "Runtime v6.2 README architecture evidence is required");
    } else {
      required(evidence?.coreSchema === "evopilot-evolution-expert-core/v2" && evidence?.coreDigest === "sha256:a3f71d60254d53ff9de645712eb07437a421593e26ee3c0ec342c658edcdf213", "Evolution Expert v2.2 Core evidence is invalid");
      required(evidence?.skill === "PRESENT" && evidence?.mcpCompatibility === "VERIFIED", "Evolution Expert v2.2 Skill and MCP evidence are required");
      required(evidence?.runtimeCompatibility === "6.2.0_CONFORMANT", "Evolution Expert v2.2 Runtime compatibility must be conformant");
      required(evidence?.firstRunSetup === "VERIFIED_SECRETREF_ONLY_NO_HIDDEN_FALLBACK", "Evolution Expert v2.2 first-run setup evidence is required");
    }
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
