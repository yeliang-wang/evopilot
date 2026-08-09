import {
  type DeliveryPlan,
  type EvolutionTriggerRule,
  type PipelineRun
} from "@evopilot/core";
import { type LlmTaskClient } from "@evopilot/llm";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_MATURITY_STANDARD_SET_ID,
  DEFAULT_MATURITY_STANDARD_VERSION,
  MATURITY_PHASES,
  batchDatasetRank,
  buildGoalCompletionReport,
  buildGoalEvidenceMatrix,
  buildGoalLlmUsageSummary,
  buildGoalRunStatusChain,
  buildGoalSnapshot,
  buildLoopCheckpoints,
  buildLoopReplayDiff,
  buildLoopSandboxBoundaryProof,
  buildLoopStreamEvents,
  buildLoopTraceSummary,
  buildLoopTraceTree,
  buildPhasePackages,
  buildTargetEvidencePackages,
  checkProjectDevopsReadiness,
  checkSourceCredentialReadiness,
  clampPositiveInteger,
  costHealthScore,
  countRecentLoopFailure,
  createEvolutionBatchFromDatasets,
  createLlmClientFromProfile,
  currentReleaseDecision,
  decideLoopIteration,
  defaultEvolutionCursor,
  defaultExecutorGraph,
  definedOnly,
  detectTenantHarnessPolicyBindingFailures,
  devopsReadinessGoalNextAction,
  discoveryAffectedFilesForTarget,
  editablePlanPolicy,
  emptyGoalPlan,
  emptyLoopTraceSummary,
  evaluateLoopSandboxEnforcement,
  evaluationDatasetsFromRun,
  eventCost,
  eventTokens,
  extractMarkdownField,
  finalizeGoalAdvance,
  gateScore,
  generateGoalPlanTargets,
  goalTimelineEvent,
  groupDatasetsForBatches,
  hydrateGoalPlan,
  hydrateGoalTimelineEvent,
  hydrateLoopIteration,
  hydrateLoopLlmSelection,
  hydrateProjectHarnessProfileVersion,
  hydrateProjectLlmBinding,
  hydrateTenantHarnessPolicyVersion,
  inferRuleProjectId,
  isActionableEvaluationDataset,
  isCostOptimizationDataset,
  isDatasetAfterCursor,
  isExecutableRuleValid,
  isOpenBlockedLoop,
  isRecord,
  isRuleInScope,
  isStaleEvolutionBatch,
  latestSaasGoReleaseDecision,
  llmReadinessGoalNextAction,
  loopArtifact,
  loopDecisionRationale,
  loopOrchestrationTargetDefinitions,
  loopStatusFromDecision,
  loopStoreReadinessSnapshot,
  loopTimelineEvent,
  loopWorkerQueueItem,
  maskCodeUpgraderConnector,
  maskProject,
  memoryInboxItemFromDiscoveryCandidate,
  nextRunAtForCadence,
  normalizeAppliedGoalPlan,
  normalizeExecutorCoordinationPlan,
  normalizeExecutorGraph,
  normalizeGlobalGoalStatus,
  llmProviderPresetDefaults,
  normalizeLlmProfileProvider,
  normalizeLlmProviderPreset,
  normalizeLoopRetryPolicy,
  normalizeLoopRunStatus,
  normalizeLoopSandboxPolicy,
  normalizeLoopSourceClosure,
  normalizeLoopStopPolicy,
  normalizeLoopStoreRuntime,
  normalizeLoopTriggerSource,
  normalizeRecurringCadence,
  normalizeSecretKind,
  normalizeStringList,
  normalizeTemperature,
  normalizeWorkspaceMemberRole,
  normalizeWorkspaceMemberStatus,
  normalizeWorkspaceQuotas,
  normalizeWorkspaceStatus,
  opportunityInsightScore,
  optionalTrimmedString,
  phaseTargetsFromGoalTargets,
  policySeverityRank,
  productionEvaluationBaselineDatasets,
  readJsonDir,
  readRuntimeLock,
  renderRuleMemoryMarkdown,
  resolveLlmProfileApiKey,
  resolveLoopLlmSelection,
  sanitizePipelineRun,
  sanitizeRunForSummary,
  selfEvolutionExecutorGraph,
  serviceScoreLevel,
  serviceScoreRecommendedAction,
  sourceReadinessGoalNextAction,
  sourceUrlFromRepository,
  syntheticEvoPilotProject,
  tenantHarnessPolicyAppliesToProject,
  versionNumberFromFile,
  vulnerabilityReportPassed,
  workspaceUsage
} from "../../application/control-plane-services.js";
import {
  hydrateHarnessCatalogMount,
  harnessRegistryCatalogMounts,
  readHarnessRegistryConfig,
  readPublishedHarnessCatalog,
  type HarnessCatalogMount,
  type HarnessCatalogScanResult,
  type HarnessRegistryConfig,
  type HarnessTemplateProfile,
  type HarnessTemplateProjectProfileBinding
} from "../../domains/harness-template/index.js";
import {
  httpError
} from "../../http/errors.js";
import {
  defaultLoggingSettings,
  logInfo,
  normalizeLoggingSettings,
  type LoggingSettings
} from "../../http/server-logging.js";
import type {
  AdversarialEvaluation,
  AuditRecord,
  AuthRole,
  CodeUpgradeEvent,
  CodeUpgradeRun,
  CostReport,
  DiscoverySkillCandidate,
  EvaluationDataset,
  EvolutionBatch,
  EvolutionFreezeDiagnostic,
  ExecutorGraph,
  FindingWorktreeHandoff,
  GitHubAppInstallationRecord,
  GlobalGoal,
  GoalAdvanceResult,
  GoalCompletionReport,
  GoalEvidenceMatrixRow,
  GoalGraph,
  GoalPlanApprovalConfirmation,
  GoalRunStatus,
  GoalSnapshot,
  GoalTarget,
  GovernancePolicyEvaluation,
  LlmProfileReadiness,
  LlmProfileRecord,
  LoopArtifact,
  LoopCheckpoint,
  LoopDecision,
  LoopEvidenceSet,
  LoopGuardrailEvaluation,
  LoopIteration,
  LoopLlmSelection,
  LoopMemoryInboxItem,
  LoopReplayDiff,
  LoopRetryPolicy,
  LoopRun,
  LoopRunStatus,
  LoopSandboxBoundaryProof,
  LoopSandboxPolicy,
  LoopSourceClosure,
  LoopStopPolicy,
  LoopStoreRuntime,
  LoopStreamEvent,
  LoopTraceSummary,
  LoopTraceTree,
  LoopTriggerSource,
  LoopWorkerLease,
  LoopWorkerQueueClaim,
  LoopWorkerQueueItem,
  OpportunityInsight,
  ProjectEvolutionCursor,
  ProjectHarnessProfileStatus,
  ProjectHarnessProfileSummary,
  ProjectHarnessProfileVersion,
  ProofOpsCoreContract,
  RecurringLoopSchedule,
  ReleaseDecision,
  ReleaseDecisionCriterion,
  ReleaseEvidenceBundle,
  ReleaseEvidenceListItem,
  ReleaseReadinessReport,
  ReleaseRisk,
  ReleaseScenarioResult,
  ReleaseTargetProfile,
  RolloutStrategyReport,
  RuleMemory,
  ScheduledEvolution,
  SecretRecord,
  ServiceScorecard,
  SloReport,
  SoakReport,
  SourceReleaseClosureRun,
  SourceReleaseDeployFinalizer,
  StoredCodeUpgraderConnector,
  StoredDeployConnector,
  StoredProject,
  StoredRun,
  SupplyChainReport,
  TargetLoopRun,
  TenantHarnessPolicyStatus,
  TenantHarnessPolicySummary,
  TenantHarnessPolicyVersion,
  TenantRecord,
  UserRecord,
  WorkspaceRecord
} from "../../model.js";
import { executeLoopNode } from "../../runtime/executor-adapters.js";
import {
  alignScenarioMatrixToReleaseTarget,
  booleanCriterion,
  buildProofOpsFinalReport,
  buildProofOpsTargetPlan,
  compactReleaseEvidenceSummary,
  dedupeReleaseRisks,
  defaultGAReleaseTarget,
  defaultReleaseScenarioMatrix,
  defaultReleaseTargets,
  hasLaterSuccessfulCodeUpgrade,
  hasLaterSuccessfulPipeline,
  inferReleaseArtifactType,
  isActiveSoakReport,
  mergeScenarioMatrix,
  numericCriterion,
  releaseEvidenceListItem,
  releaseTargetFromProofOpsCore,
  runFinishedAt
} from "../../runtime/release-targets.js";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_WORKSPACE_ID,
  hashPassword
} from "../../runtime/runtime-auth.js";
import { atomicWriteJson, atomicWriteText, safeFileName } from "../json-files.js";

export class FileStore {
  constructor(
    private readonly dataRoot: string,
    private readonly executionRuntime: { llmClient?: LlmTaskClient; requireLlm?: boolean; harnessCatalogDirs?: string[]; harnessRegistryConfig?: string } = {}
  ) {
    fs.mkdirSync(this.dataRoot, { recursive: true });
    fs.mkdirSync(this.tenantsDir, { recursive: true });
    fs.mkdirSync(this.workspacesDir, { recursive: true });
    fs.mkdirSync(this.usersDir, { recursive: true });
    fs.mkdirSync(this.secretsDir, { recursive: true });
    fs.mkdirSync(this.llmProfilesDir, { recursive: true });
    fs.mkdirSync(this.githubAppInstallationsDir, { recursive: true });
    fs.mkdirSync(this.settingsDir, { recursive: true });
    fs.mkdirSync(this.runsDir, { recursive: true });
    fs.mkdirSync(this.projectsDir, { recursive: true });
    fs.mkdirSync(this.tenantHarnessPoliciesDir, { recursive: true });
    fs.mkdirSync(this.projectHarnessProfilesDir, { recursive: true });
    fs.mkdirSync(path.dirname(this.auditFile), { recursive: true });
    fs.mkdirSync(this.idempotencyDir, { recursive: true });
    fs.mkdirSync(this.rulesDir, { recursive: true });
    fs.mkdirSync(this.codeUpgraderConnectorsDir, { recursive: true });
    fs.mkdirSync(this.deployConnectorsDir, { recursive: true });
    fs.mkdirSync(this.pipelinesDir, { recursive: true });
    fs.mkdirSync(this.evaluationDatasetsDir, { recursive: true });
    fs.mkdirSync(this.codeUpgradeRunsDir, { recursive: true });
    fs.mkdirSync(this.codeUpgradeEventsDir, { recursive: true });
    fs.mkdirSync(this.codeUpgradeArtifactsDir, { recursive: true });
    fs.mkdirSync(this.schedulesDir, { recursive: true });
    fs.mkdirSync(this.evolutionBatchesDir, { recursive: true });
    fs.mkdirSync(this.evolutionCursorsDir, { recursive: true });
    fs.mkdirSync(this.soakReportsDir, { recursive: true });
    fs.mkdirSync(this.releaseEvidenceDir, { recursive: true });
    fs.mkdirSync(this.releaseTargetsDir, { recursive: true });
    fs.mkdirSync(this.releaseDecisionsDir, { recursive: true });
    fs.mkdirSync(this.goalsDir, { recursive: true });
    fs.mkdirSync(this.sourceReleaseRunsDir, { recursive: true });
    fs.mkdirSync(this.sourceReleaseDeployFinalizersDir, { recursive: true });
    fs.mkdirSync(this.targetLoopsDir, { recursive: true });
    fs.mkdirSync(this.loopsDir, { recursive: true });
    fs.mkdirSync(this.loopWorkspacesDir, { recursive: true });
    fs.mkdirSync(this.executorGraphsDir, { recursive: true });
    fs.mkdirSync(this.discoveryCandidatesDir, { recursive: true });
    fs.mkdirSync(this.findingHandoffsDir, { recursive: true });
    fs.mkdirSync(this.adversarialEvaluationsDir, { recursive: true });
    fs.mkdirSync(this.recurringLoopSchedulesDir, { recursive: true });
    fs.mkdirSync(this.loopMemoryInboxDir, { recursive: true });
    fs.mkdirSync(this.guardrailEvaluationsDir, { recursive: true });
    this.ensureMetadata();
    this.ensureDefaultTenantWorkspace();
  }

  get tenantsDir(): string {
    return path.join(this.dataRoot, "tenants");
  }

  get workspacesDir(): string {
    return path.join(this.dataRoot, "workspaces");
  }

  get usersDir(): string {
    return path.join(this.dataRoot, "users");
  }

  get secretsDir(): string {
    return path.join(this.dataRoot, "secrets");
  }

  get llmProfilesDir(): string {
    return path.join(this.dataRoot, "llm-profiles");
  }

  get githubAppInstallationsDir(): string {
    return path.join(this.dataRoot, "github-app-installations");
  }

  get settingsDir(): string {
    return path.join(this.dataRoot, "settings");
  }

  get loggingSettingsFile(): string {
    return path.join(this.settingsDir, "logging.json");
  }

  get runsDir(): string {
    return path.join(this.dataRoot, "runs");
  }

  get projectsDir(): string {
    return path.join(this.dataRoot, "projects");
  }

  get tenantHarnessPoliciesDir(): string {
    return path.join(this.dataRoot, "tenant-harness-policies");
  }

  get projectHarnessProfilesDir(): string {
    return path.join(this.dataRoot, "project-harness-profiles");
  }

  get auditFile(): string {
    return path.join(this.dataRoot, "audit", "audit.jsonl");
  }

  get idempotencyDir(): string {
    return path.join(this.dataRoot, "idempotency");
  }

  get rulesDir(): string {
    return path.join(this.dataRoot, "rules");
  }

  get codeUpgraderConnectorsDir(): string {
    return path.join(this.dataRoot, "connectors", "code-upgrader");
  }

  get deployConnectorsDir(): string {
    return path.join(this.dataRoot, "connectors", "deploy");
  }

  get pipelinesDir(): string {
    return path.join(this.dataRoot, "pipelines");
  }

  get evaluationDatasetsDir(): string {
    return path.join(this.dataRoot, "evaluation-datasets");
  }

  get codeUpgradeRunsDir(): string {
    return path.join(this.dataRoot, "code-upgrades", "runs");
  }

  get codeUpgradeEventsDir(): string {
    return path.join(this.dataRoot, "code-upgrades", "events");
  }

  get codeUpgradeArtifactsDir(): string {
    return path.join(this.dataRoot, "code-upgrades", "artifacts");
  }

  get schedulesDir(): string {
    return path.join(this.dataRoot, "schedules");
  }

  get evolutionBatchesDir(): string {
    return path.join(this.dataRoot, "evolution-batches");
  }

  get evolutionCursorsDir(): string {
    return path.join(this.dataRoot, "evolution-cursors");
  }

  get soakReportsDir(): string {
    return path.join(this.dataRoot, "soak-reports");
  }

  get releaseEvidenceDir(): string {
    return path.join(this.dataRoot, "release-evidence");
  }

  get releaseTargetsDir(): string {
    return path.join(this.dataRoot, "release-targets");
  }

  get releaseDecisionsDir(): string {
    return path.join(this.dataRoot, "release-decisions");
  }

  get goalsDir(): string {
    return path.join(this.dataRoot, "goals");
  }

  get sourceReleaseRunsDir(): string {
    return path.join(this.dataRoot, "source-release-runs");
  }

  get sourceReleaseDeployFinalizersDir(): string {
    return path.join(this.dataRoot, "source-release-deploy-finalizers");
  }

  get targetLoopsDir(): string {
    return path.join(this.dataRoot, "target-loops");
  }

  get loopsDir(): string {
    return path.join(this.dataRoot, "loops");
  }

  get loopWorkspacesDir(): string {
    return path.join(this.dataRoot, "loop-workspaces");
  }

  get executorGraphsDir(): string {
    return path.join(this.dataRoot, "executor-graphs");
  }

  get discoveryCandidatesDir(): string {
    return path.join(this.dataRoot, "loop-target-runtime", "discovery-candidates");
  }

  get findingHandoffsDir(): string {
    return path.join(this.dataRoot, "loop-target-runtime", "finding-handoffs");
  }

  get adversarialEvaluationsDir(): string {
    return path.join(this.dataRoot, "loop-target-runtime", "adversarial-evaluations");
  }

  get recurringLoopSchedulesDir(): string {
    return path.join(this.dataRoot, "loop-target-runtime", "recurring-schedules");
  }

  get loopMemoryInboxDir(): string {
    return path.join(this.dataRoot, "loop-target-runtime", "memory-inbox");
  }

  get guardrailEvaluationsDir(): string {
    return path.join(this.dataRoot, "loop-target-runtime", "guardrail-evaluations");
  }

  get metadataFile(): string {
    return path.join(this.dataRoot, "metadata.json");
  }

  ensureMetadata(): void {
    if (!fs.existsSync(this.metadataFile)) {
      atomicWriteJson(this.metadataFile, {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        product: "evopilot"
      });
    }
  }

  metadata(): { schemaVersion: number; createdAt: string; product: string } {
    return JSON.parse(fs.readFileSync(this.metadataFile, "utf8"));
  }

  readLoggingSettings(): LoggingSettings {
    if (!fs.existsSync(this.loggingSettingsFile)) return defaultLoggingSettings();
    return normalizeLoggingSettings(JSON.parse(fs.readFileSync(this.loggingSettingsFile, "utf8")), "control-plane");
  }

  writeLoggingSettings(input: unknown, actor: string): LoggingSettings {
    const current = this.readLoggingSettings();
    const next = normalizeLoggingSettings({ ...current, ...(isRecord(input) ? input : {}), updatedBy: actor, updatedAt: new Date().toISOString() }, "control-plane");
    atomicWriteJson(this.loggingSettingsFile, next);
    return next;
  }

  loopStoreRuntime(): LoopStoreRuntime {
    return normalizeLoopStoreRuntime();
  }

  isReady(): boolean {
    return fs.existsSync(this.metadataFile) && fs.existsSync(this.runsDir) && fs.existsSync(this.projectsDir);
  }

  summary(): object {
    const runs = this.listRuns();
    const reviews = runs.flatMap((run) => run.reviews);
    const releases = runs.flatMap((run) => run.releaseReports);
    const pipelines = this.listPipelines();
    const codeUpgrades = this.listCodeUpgradeRuns();
    const datasets = this.listEvaluationDatasets();
    const batches = this.listEvolutionBatches();
    const freezes = this.computeEvolutionFreezes();
    const insights = this.discoverOpportunityInsights();
    const learnedReleases = runs.flatMap((run) => run.learningRecords);
    const scorecards = this.computeServiceScorecards();
    const sloReports = this.computeSloReports();
    const policyEvaluations = this.evaluateGovernancePolicies();
    const supplyChainReports = this.computeSupplyChainReports();
    const costReports = this.computeCostReports();
    const releaseReadiness = this.computeReleaseReadinessReports();
    const rolloutStrategies = this.computeRolloutStrategyReports();
    const releaseDecisions = this.listReleaseDecisions();
    const latestDecision = releaseDecisions.slice(-1)[0];
    const currentDecision = currentReleaseDecision(releaseDecisions);
    return {
      projectCount: this.listProjects().length,
      runCount: runs.length,
      pipelineCount: pipelines.length,
      evaluationDatasetCount: datasets.length,
      evolutionBatchCount: batches.length,
      activeEvolutionBatchCount: batches.filter((batch) => ["CANDIDATE", "DRAFT_READY", "CONFIRMED", "CODE_UPGRADING", "CICD_RUNNING"].includes(batch.status)).length,
      costOptimizationEvolutionBatchCount: batches.filter((batch) => batch.intent === "cost-optimization").length,
      successfulEvolutionBatchCount: batches.filter((batch) => batch.status === "SUCCEEDED").length,
      failedEvolutionBatchCount: batches.filter((batch) => batch.status === "FAILED").length,
      frozenProjectCount: freezes.length,
      evolutionFreezes: freezes,
      costOptimizationReadyCount: batches.filter((batch) => batch.intent === "cost-optimization" && ["CANDIDATE", "DRAFT_READY", "CONFIRMED"].includes(batch.status)).length,
      selfLearningDatasetCount: datasets.filter((dataset) => dataset.generatedBy === "self-learning").length,
      opportunityInsightCount: insights.length,
      opportunityInsightQuality: insights.length === 0 ? 0 : Math.round(insights.reduce((sum, insight) => sum + insight.score, 0) / insights.length),
      learningRecordCount: learnedReleases.length,
      serviceScorecardCount: scorecards.length,
      averageServiceScore: scorecards.length === 0 ? 0 : Math.round(scorecards.reduce((sum, scorecard) => sum + scorecard.score, 0) / scorecards.length),
      sloHealth: sloReports.length === 0 ? 100 : Math.round(sloReports.reduce((sum, report) => sum + report.observedHealth, 0) / sloReports.length),
      errorBudgetRemaining: sloReports.length === 0 ? 100 : Math.round(sloReports.reduce((sum, report) => sum + report.errorBudgetRemaining, 0) / sloReports.length),
      failedPolicyCount: policyEvaluations.filter((policy) => policy.status === "FAILED").length,
      supplyChainRiskCount: supplyChainReports.filter((report) => report.status !== "READY").length,
      costRiskCount: costReports.filter((report) => report.status !== "HEALTHY").length,
      costHealth: costReports.length === 0 ? 100 : Math.round(costReports.reduce((sum, report) => sum + costHealthScore(report.status), 0) / costReports.length),
      releaseReadyCount: releaseReadiness.filter((report) => report.status === "READY").length,
      releaseBlockedCount: releaseReadiness.filter((report) => report.status === "BLOCKED").length,
      releaseReadinessScore: releaseReadiness.length === 0 ? 100 : Math.round(releaseReadiness.reduce((sum, report) => sum + report.score, 0) / releaseReadiness.length),
      canaryReadyCount: rolloutStrategies.filter((report) => report.strategy === "CANARY" && report.status === "READY").length,
      rolloutBlockedCount: rolloutStrategies.filter((report) => report.status === "BLOCKED").length,
      codeUpgradeCount: codeUpgrades.length,
      runningCodeUpgradeCount: codeUpgrades.filter((item) => item.status === "QUEUED" || item.status === "RUNNING").length,
      runningPipelineCount: pipelines.filter((pipeline) => pipeline.status === "QUEUED" || pipeline.status === "RUNNING").length,
      opportunityCount: runs.reduce((sum, run) => sum + run.opportunities.length, 0),
      pendingReviewCount: reviews.filter((review) => review.status === "USER_CONFIRM_REQUIRED").length,
      confirmedReviewCount: reviews.filter((review) => review.status === "USER_CONFIRMED").length,
      releaseCount: releases.length,
      releaseHealth: releases.length === 0 ? 100 : Math.round((releases.filter((release) => release.status === "SUCCEEDED").length / releases.length) * 100),
      recentRuns: runs.slice(-5).reverse().map(sanitizeRunForSummary),
      recentOpportunityInsights: insights.slice(0, 5),
      serviceScorecards: scorecards,
      sloReports,
      policyEvaluations,
      supplyChainReports,
      costReports,
      releaseReadiness,
      rolloutStrategies,
      recentCodeUpgrades: codeUpgrades.slice(-5).reverse(),
      recentPipelines: pipelines.slice(-5).reverse().map(sanitizePipelineRun),
      recentEvolutionBatches: batches.slice(-5).reverse(),
      recentSoakReports: this.listSoakReports().slice(-5).reverse(),
      recentReleaseEvidence: this.listReleaseEvidenceSummaries().slice(-5).reverse(),
      releaseTargetCount: this.listReleaseTargets().length,
      releaseDecisionCount: releaseDecisions.length,
      latestReleaseDecision: latestDecision,
      currentReleaseDecision: currentDecision,
      currentReleaseTargetId: currentDecision?.targetId ?? "saas-ga",
      targetLoopCount: this.listTargetLoops().length,
      latestTargetLoop: this.listTargetLoops().slice(-1)[0],
      discoveryCandidateCount: this.listDiscoverySkillCandidates().length,
      memoryInboxCount: this.listLoopMemoryInboxItems().filter((item) => item.status === "NEW" || item.status === "ACCEPTED").length,
      recurringLoopScheduleCount: this.listRecurringLoopSchedules().length,
      latestGuardrailEvaluation: this.listGuardrailEvaluations().slice(-1)[0]
    };
  }

  saasObservability(): object {
    const tenants = this.listTenants();
    const workspaces = this.listWorkspaces();
    const projects = this.listProjects();
    const loops = this.listLoops();
    const secrets = this.listSecrets();
    const githubApps = this.listGitHubAppInstallations();
    const releaseDecisions = this.listReleaseDecisions();
    const releaseEvidence = this.listReleaseEvidenceSummaries();
    const loopTraces = this.listLoopTraces();
    const queue = this.listLoopWorkerQueue();
    const storeReadiness = loopStoreReadinessSnapshot(this.loopStoreRuntime());
    const sourceReleaseRuns = this.listSourceReleaseClosureRuns();
    const latestSaasGoDecision = latestSaasGoReleaseDecision(releaseDecisions);
    const latestSaasGoAt = latestSaasGoDecision ? Date.parse(latestSaasGoDecision.generatedAt) : undefined;
    const quotaBlocked = workspaces
      .map((workspace) => workspaceUsage(this, workspace))
      .filter((usage) => usage.projects.remaining === 0 || usage.loops.remaining === 0 || usage.evidenceGb.remaining === 0);
    const credentialBlocked = githubApps.filter((installation) => installation.status !== "READY");
    const runningLoops = loops.filter((loop) => loop.status === "RUNNING").length;
    const blockedLoops = loops.filter((loop) => isOpenBlockedLoop(loop, sourceReleaseRuns, latestSaasGoAt)).length;
    const queueClaimable = queue.filter((item) => item.claimable).length;
    const blockers = [
      ...storeReadiness.blockers,
      ...credentialBlocked.map((installation) => `GITHUB_APP_BLOCKED:${installation.id}`),
      ...quotaBlocked.map((usage) => `WORKSPACE_QUOTA_EXHAUSTED:${usage.workspaceId}`)
    ];
    return {
      schema: "evopilot-saas-observability/v1",
      status: blockers.length === 0 ? "READY" : "BLOCKED",
      tenantCount: tenants.length,
      workspaceCount: workspaces.length,
      projectCount: projects.length,
      loopCount: loops.length,
      runningLoopCount: runningLoops,
      blockedLoopCount: blockedLoops,
      secretRefCount: secrets.length,
      githubAppInstallationCount: githubApps.length,
      githubAppReadyCount: githubApps.filter((installation) => installation.status === "READY").length,
      releaseEvidenceCount: releaseEvidence.length,
      releaseDecisionCount: releaseDecisions.length,
      loopTraceCount: loopTraces.length,
      queueClaimableCount: queueClaimable,
      queueLeasedCount: queue.length - queueClaimable,
      postgresStoreReady: storeReadiness.status === "READY",
      quotaBlockedWorkspaceCount: quotaBlocked.length,
      credentialBlockedCount: credentialBlocked.length,
      blockers,
      evidence: [
        `tenants=${tenants.length}`,
        `workspaces=${workspaces.length}`,
        `projects=${projects.length}`,
        `loops=${loops.length}`,
        `runningLoops=${runningLoops}`,
        `blockedLoops=${blockedLoops}`,
        `secretRefs=${secrets.length}`,
        `githubAppsReady=${githubApps.filter((installation) => installation.status === "READY").length}/${githubApps.length}`,
        `queueClaimable=${queueClaimable}`,
        `postgresStoreReady=${storeReadiness.status === "READY"}`
      ],
      evaluatedAt: new Date().toISOString()
    };
  }

  loopTargetRuntimeSummary(): object {
    return {
      discoveryCandidates: this.listDiscoverySkillCandidates().slice(-20).reverse(),
      findingHandoffs: this.listFindingWorktreeHandoffs().slice(-20).reverse(),
      adversarialEvaluations: this.listAdversarialEvaluations().slice(-20).reverse(),
      recurringSchedules: this.listRecurringLoopSchedules().slice(-20).reverse(),
      memoryInbox: this.listLoopMemoryInboxItems().slice(-50).reverse(),
      guardrailEvaluations: this.listGuardrailEvaluations().slice(-20).reverse()
    };
  }

  listDiscoverySkillCandidates(): DiscoverySkillCandidate[] {
    return readJsonDir<DiscoverySkillCandidate>(this.discoveryCandidatesDir);
  }

  writeDiscoverySkillCandidate(candidate: DiscoverySkillCandidate): DiscoverySkillCandidate {
    atomicWriteJson(path.join(this.discoveryCandidatesDir, `${safeFileName(candidate.id)}.json`), candidate);
    return candidate;
  }

  runDiscoverySkillRuntime(projectId?: string): DiscoverySkillCandidate[] {
    const now = new Date().toISOString();
    const projects = projectId ? this.listProjects().filter((project) => project.id === safeFileName(projectId)) : this.listProjects();
    const selectedProjects = projects.length > 0 ? projects : [this.readProject("evopilot") ?? syntheticEvoPilotProject()];
    const definitions = loopOrchestrationTargetDefinitions().filter((target) => [
      "discovery-skill-runtime",
      "per-finding-worktree-handoff",
      "adversarial-evaluator-agent",
      "recurring-loop-scheduler",
      "loop-memory-inbox",
      "budget-and-judgment-guardrails",
      "tenant-workspace-model",
      "github-app-onboarding",
      "secret-vault-and-credential-boundary",
      "workspace-rbac-and-invitation",
      "project-workspace-ownership",
      "quota-rate-limit-billing-foundation",
      "worker-queue-and-postgres-store",
      "tenant-aware-release-evidence",
      "multi-tenant-security-regression-suite",
      "saas-production-observability",
      "saas-onboarding-dashboard",
      "saas-field-e2e-source-to-ga",
      "saas-release-matrix",
      "saas-ga-soak-active",
      "saas-ga-release-decision",
      "announce-saas-multi-tenant-ga-stable"
    ].includes(target.id));
    const insights = this.discoverOpportunityInsights();
    const traces = this.listLoopTraces();
    const datasets = this.listEvaluationDatasets();
    const candidates: DiscoverySkillCandidate[] = [];
    for (const project of selectedProjects) {
      for (const target of definitions) {
        const projectInsights = insights.filter((insight) => insight.projectId === project.id);
        const candidate: DiscoverySkillCandidate = {
          schema: "evopilot-discovery-skill-candidate/v1",
          id: `candidate-${safeFileName(project.id)}-${safeFileName(target.id)}`,
          projectId: project.id,
          targetId: target.id,
          title: target.title,
          source: project.repository ? "repository" : projectInsights.length > 0 ? "production" : "manual",
          confidence: Math.min(0.95, 0.55 + projectInsights.length * 0.08 + traces.filter((trace) => trace.loopId.includes(project.id)).length * 0.03),
          affectedFiles: discoveryAffectedFilesForTarget(target.id, project),
          acceptanceCriteria: target.acceptanceCriteria,
          evidence: [
            `project=${project.id}`,
            `provider=${project.repository?.provider ?? "unknown"}`,
            `repository=${project.repository?.gitUrl ?? project.repository?.root ?? sourceUrlFromRepository(project.repository) ?? "unconfigured"}`,
            `insightCount=${projectInsights.length}`,
            `evaluationDatasetCount=${datasets.filter((dataset) => dataset.projectId === project.id).length}`,
            `traceCount=${traces.filter((trace) => trace.loopId.includes(project.id)).length}`
          ],
          status: "CANDIDATE",
          createdAt: this.listDiscoverySkillCandidates().find((item) => item.id === `candidate-${safeFileName(project.id)}-${safeFileName(target.id)}`)?.createdAt ?? now,
          updatedAt: now
        };
        candidates.push(this.writeDiscoverySkillCandidate(candidate));
        this.writeLoopMemoryInboxItem(memoryInboxItemFromDiscoveryCandidate(candidate));
      }
    }
    return candidates;
  }

  listFindingWorktreeHandoffs(): FindingWorktreeHandoff[] {
    return readJsonDir<FindingWorktreeHandoff>(this.findingHandoffsDir);
  }

  writeFindingWorktreeHandoff(handoff: FindingWorktreeHandoff): FindingWorktreeHandoff {
    atomicWriteJson(path.join(this.findingHandoffsDir, `${safeFileName(handoff.id)}.json`), handoff);
    return handoff;
  }

  allocateFindingWorktreeHandoff(input: {
    findingId?: string;
    projectId?: string;
    targetId?: string;
    allowedPaths?: string[];
    validationCommands?: string[];
  }): FindingWorktreeHandoff {
    const now = new Date().toISOString();
    const projectId = safeFileName(String(input.projectId ?? "evopilot"));
    const project = this.readProject(projectId);
    const findingId = safeFileName(String(input.findingId ?? input.targetId ?? `finding-${Date.now()}`));
    const sourceBranch = project?.repository?.defaultBranch ?? "main";
    const targetBranch = `evopilot/${findingId}`;
    const workspaceRoot = path.join(this.loopWorkspacesDir, "findings", findingId);
    fs.mkdirSync(workspaceRoot, { recursive: true });
    return this.writeFindingWorktreeHandoff({
      schema: "evopilot-finding-worktree-handoff/v1",
      id: `handoff-${findingId}`,
      findingId,
      projectId,
      provider: project?.repository?.provider ?? "unknown",
      workspaceRoot,
      sourceBranch,
      targetBranch,
      allowedPaths: normalizeStringList(input.allowedPaths, ["packages", "apps", "docs", "tests"]),
      validationCommands: normalizeStringList(input.validationCommands, ["npm run check"]),
      rollbackRef: sourceBranch,
      status: "ALLOCATED",
      evidence: [
        `workspaceRoot=${workspaceRoot}`,
        `sourceBranch=${sourceBranch}`,
        `targetBranch=${targetBranch}`,
        `provider=${project?.repository?.provider ?? "unknown"}`
      ],
      createdAt: now,
      updatedAt: now
    });
  }

  listAdversarialEvaluations(): AdversarialEvaluation[] {
    return readJsonDir<AdversarialEvaluation>(this.adversarialEvaluationsDir);
  }

  writeAdversarialEvaluation(evaluation: AdversarialEvaluation): AdversarialEvaluation {
    atomicWriteJson(path.join(this.adversarialEvaluationsDir, `${safeFileName(evaluation.id)}.json`), evaluation);
    return evaluation;
  }

  runAdversarialEvaluation(input: { loopId?: string; projectId?: string; targetId?: string }): AdversarialEvaluation {
    const now = new Date().toISOString();
    const loop = input.loopId ? this.readLoop(input.loopId) : undefined;
    const projectId = safeFileName(String(input.projectId ?? loop?.projectId ?? "evopilot"));
    const latestDecision = this.listReleaseDecisions().slice(-1)[0];
    const missingEvidence = [
      ...(loop && loop.iterations.length > 0 ? [] : ["loop-iteration-evidence"]),
      ...(loop?.sourceClosure.closureState === "PROMOTED" ? [] : ["source-closure-promotion"]),
      ...(latestDecision ? [] : ["release-decision"])
    ];
    const failureSignatures = loop?.trace.failureSignatures.map((item) => item.signature) ?? [];
    const status: AdversarialEvaluation["status"] = missingEvidence.includes("source-closure-promotion") ? "BLOCK" : missingEvidence.length > 0 || failureSignatures.length > 0 ? "WARN" : "PASS";
    return this.writeAdversarialEvaluation({
      schema: "evopilot-adversarial-evaluation/v1",
      id: `adv-${safeFileName(input.loopId ?? projectId)}-${Date.now()}`,
      loopId: loop?.id,
      projectId,
      targetId: input.targetId,
      status,
      checkedInputs: ["proposed-diff", "tests", "runtime-evidence", "budget-impact", "release-gates"],
      missingEvidence,
      failureSignatures,
      suggestedActions: status === "PASS" ? ["continue-source-closure"] : ["route-policy-review", "collect-missing-evidence", "replay-or-repair-loop"],
      evidence: [
        `project=${projectId}`,
        `loop=${loop?.id ?? "not-bound"}`,
        `iterations=${loop?.iterations.length ?? 0}`,
        `releaseDecision=${latestDecision?.id ?? "missing"}`,
        `sourceClosure=${loop?.sourceClosure.closureState ?? "unknown"}`
      ],
      createdAt: now
    });
  }

  listRecurringLoopSchedules(): RecurringLoopSchedule[] {
    return readJsonDir<RecurringLoopSchedule>(this.recurringLoopSchedulesDir);
  }

  writeRecurringLoopSchedule(schedule: RecurringLoopSchedule): RecurringLoopSchedule {
    atomicWriteJson(path.join(this.recurringLoopSchedulesDir, `${safeFileName(schedule.id)}.json`), schedule);
    return schedule;
  }

  upsertRecurringLoopSchedule(input: { id?: string; projectId?: string; targetId?: string; cadence?: string; maxBudgetUsd?: number; triggerRules?: string[] }): RecurringLoopSchedule {
    const now = new Date().toISOString();
    const projectId = safeFileName(String(input.projectId ?? "evopilot"));
    const targetId = safeFileName(String(input.targetId ?? "discovery-skill-runtime"));
    const id = safeFileName(String(input.id ?? `schedule-${projectId}-${targetId}`));
    const existing = this.listRecurringLoopSchedules().find((item) => item.id === id);
    const cadence = normalizeRecurringCadence(input.cadence);
    return this.writeRecurringLoopSchedule({
      schema: "evopilot-recurring-loop-schedule/v1",
      id,
      projectId,
      targetId,
      cadence,
      maxBudgetUsd: Math.max(0, Number(input.maxBudgetUsd ?? existing?.maxBudgetUsd ?? 5)),
      triggerRules: normalizeStringList(input.triggerRules, existing?.triggerRules ?? ["new-evidence", "release-window-open", "budget-pass"]),
      status: "ACTIVE",
      lastRunAt: existing?.lastRunAt,
      nextRunAt: nextRunAtForCadence(cadence, now),
      idempotencyKey: `recurring:${projectId}:${targetId}:${cadence}`,
      evidence: [`cadence=${cadence}`, `project=${projectId}`, `target=${targetId}`],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
  }

  listLoopMemoryInboxItems(): LoopMemoryInboxItem[] {
    return readJsonDir<LoopMemoryInboxItem>(this.loopMemoryInboxDir);
  }

  writeLoopMemoryInboxItem(item: LoopMemoryInboxItem): LoopMemoryInboxItem {
    const existing = this.listLoopMemoryInboxItems().find((entry) => entry.id === item.id);
    atomicWriteJson(path.join(this.loopMemoryInboxDir, `${safeFileName(item.id)}.json`), {
      ...item,
      createdAt: existing?.createdAt ?? item.createdAt,
      updatedAt: item.updatedAt
    });
    return item;
  }

  triageLoopMemoryInboxItem(id: string, status: LoopMemoryInboxItem["status"], targetId?: string): LoopMemoryInboxItem | undefined {
    const existing = this.listLoopMemoryInboxItems().find((item) => item.id === safeFileName(id));
    if (!existing) return undefined;
    return this.writeLoopMemoryInboxItem({
      ...existing,
      status,
      targetId: targetId ?? existing.targetId,
      updatedAt: new Date().toISOString()
    });
  }

  listGuardrailEvaluations(): LoopGuardrailEvaluation[] {
    return readJsonDir<LoopGuardrailEvaluation>(this.guardrailEvaluationsDir);
  }

  writeGuardrailEvaluation(evaluation: LoopGuardrailEvaluation): LoopGuardrailEvaluation {
    atomicWriteJson(path.join(this.guardrailEvaluationsDir, `${safeFileName(evaluation.id)}.json`), evaluation);
    return evaluation;
  }

  evaluateBudgetAndJudgmentGuardrails(loopId: string, input: Record<string, unknown> = {}): LoopGuardrailEvaluation | undefined {
    const loop = this.readLoop(loopId);
    if (!loop) return undefined;
    const now = new Date().toISOString();
    const budgets = {
      maxCostUsd: Math.max(0, Number(input.maxCostUsd ?? loop.context?.maxCostUsd ?? 5)),
      maxTokens: Math.max(0, Number(input.maxTokens ?? loop.context?.maxTokens ?? 100000)),
      maxDurationSeconds: Math.max(1, Number(input.maxDurationSeconds ?? loop.stopPolicy.maxDurationSeconds)),
      maxChangedFiles: Math.max(1, Number(input.maxChangedFiles ?? 20)),
      minConfidence: Math.max(0, Math.min(1, Number(input.minConfidence ?? 0.7)))
    };
    const durationSeconds = Math.max(0, Math.round((Date.now() - Date.parse(loop.createdAt)) / 1000));
    const changedFiles = new Set(loop.artifacts.map((artifact) => artifact.path).filter(Boolean)).size;
    const confidence = loop.evidenceSets.some((set) => set.status === "FAIL") ? 0.35 : loop.status === "SUCCEEDED" ? 0.9 : 0.65;
    const actual = {
      costUsd: loop.trace.cost.estimatedUsd,
      tokens: loop.trace.cost.totalTokens,
      durationSeconds,
      changedFiles,
      confidence
    };
    const blockers = [
      actual.costUsd > budgets.maxCostUsd ? `costUsd>${budgets.maxCostUsd}` : "",
      actual.tokens > budgets.maxTokens ? `tokens>${budgets.maxTokens}` : "",
      actual.durationSeconds > budgets.maxDurationSeconds ? `durationSeconds>${budgets.maxDurationSeconds}` : "",
      actual.changedFiles > budgets.maxChangedFiles ? `changedFiles>${budgets.maxChangedFiles}` : "",
      actual.confidence < budgets.minConfidence ? `confidence<${budgets.minConfidence}` : ""
    ].filter(Boolean);
    const status: LoopGuardrailEvaluation["status"] = blockers.length > 0 ? "BLOCK" : actual.confidence < 0.85 ? "WARN" : "PASS";
    return this.writeGuardrailEvaluation({
      schema: "evopilot-budget-judgment-guardrail/v1",
      id: `guardrail-${safeFileName(loop.id)}-${Date.now()}`,
      loopId: loop.id,
      projectId: loop.projectId,
      status,
      budgets,
      actual,
      releaseJudgment: status === "PASS" ? "ALLOW" : status === "WARN" ? "HUMAN_REVIEW" : "BLOCK",
      blockers,
      evidence: [
        `loop=${loop.id}`,
        `status=${loop.status}`,
        `costUsd=${actual.costUsd}`,
        `tokens=${actual.tokens}`,
        `durationSeconds=${actual.durationSeconds}`,
        `confidence=${actual.confidence}`
      ],
      createdAt: now
    });
  }

  listRuns(): StoredRun[] {
    return fs.readdirSync(this.runsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.runsDir, file), "utf8")) as StoredRun);
  }

  readRun(id: string): StoredRun | undefined {
    const file = path.join(this.runsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8")) as StoredRun;
  }

  writeRun(run: StoredRun): void {
    atomicWriteJson(path.join(this.runsDir, `${run.id}.json`), run);
  }

  ensureDefaultTenantWorkspace(): void {
    const now = new Date().toISOString();
    if (!fs.existsSync(path.join(this.tenantsDir, `${DEFAULT_TENANT_ID}.json`))) {
      this.writeTenant({
        schema: "evopilot-tenant/v1",
        id: DEFAULT_TENANT_ID,
        name: "EvoPilot Production Tenant",
        status: "ACTIVE",
        plan: "Self-hosted SaaS",
        createdAt: now,
        updatedAt: now
      });
    }
    if (!fs.existsSync(path.join(this.workspacesDir, `${DEFAULT_WORKSPACE_ID}.json`))) {
      this.writeWorkspace({
        schema: "evopilot-workspace/v1",
        id: DEFAULT_WORKSPACE_ID,
        tenantId: DEFAULT_TENANT_ID,
        name: "Agent Products Workspace",
        status: "BOUNDARY_DRAFT",
        members: [
          { id: "owner", name: "Owner", role: "owner", status: "ACTIVE" },
          { id: "operator", name: "Operator", role: "admin", status: "ACTIVE" },
          { id: "viewer", name: "Viewer", role: "viewer", status: "ACTIVE" }
        ],
        quotas: {
          loops: 120,
          projects: 20,
          evidenceGb: 100
        },
        createdAt: now,
        updatedAt: now
      });
    }
  }

  listTenants(): TenantRecord[] {
    return fs.readdirSync(this.tenantsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.tenantsDir, file), "utf8")) as TenantRecord);
  }

  readTenant(id: string): TenantRecord | undefined {
    const file = path.join(this.tenantsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8")) as TenantRecord;
  }

  writeTenant(tenant: TenantRecord): TenantRecord {
    atomicWriteJson(path.join(this.tenantsDir, `${safeFileName(tenant.id)}.json`), tenant);
    return tenant;
  }

  ensureBootstrapAdmin(): UserRecord {
    const existing = this.listUsers(undefined, true);
    const platformAdmin = existing.find((user) => user.platformAdmin && user.status === "ACTIVE");
    if (platformAdmin) return platformAdmin;
    const now = new Date().toISOString();
    return this.writeUser({
      schema: "evopilot-user/v1",
      id: "admin",
      username: "admin",
      displayName: "Platform Admin",
      role: "admin",
      tenantId: DEFAULT_TENANT_ID,
      workspaceId: DEFAULT_WORKSPACE_ID,
      status: "ACTIVE",
      platformAdmin: true,
      mustChangePassword: true,
      passwordHash: hashPassword("admin"),
      createdAt: now,
      updatedAt: now
    });
  }

  listUsers(tenantId?: string, includeSuspended = true): UserRecord[] {
    return fs.readdirSync(this.usersDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => this.hydrateUser(JSON.parse(fs.readFileSync(path.join(this.usersDir, file), "utf8"))))
      .filter((user) => (!tenantId || user.tenantId === tenantId || user.platformAdmin) && (includeSuspended || user.status === "ACTIVE"));
  }

  readUser(idOrUsername: string): UserRecord | undefined {
    const id = safeFileName(idOrUsername);
    const file = path.join(this.usersDir, `${id}.json`);
    if (fs.existsSync(file)) return this.hydrateUser(JSON.parse(fs.readFileSync(file, "utf8")));
    return this.listUsers(undefined, true).find((user) => user.username === idOrUsername);
  }

  writeUser(user: UserRecord): UserRecord {
    const hydrated = this.hydrateUser(user);
    atomicWriteJson(path.join(this.usersDir, `${safeFileName(hydrated.id)}.json`), hydrated);
    return hydrated;
  }

  private hydrateUser(user: any): UserRecord {
    const now = new Date().toISOString();
    const username = String(user.username ?? user.id ?? `user-${Date.now()}`).trim();
    const id = safeFileName(String(user.id ?? username));
    const role: AuthRole = user.role === "admin" || user.role === "operator" || user.role === "viewer" ? user.role : "viewer";
    const passwordHash = String(user.passwordHash ?? hashPassword(String(user.password ?? "")));
    return {
      schema: "evopilot-user/v1",
      id,
      username,
      displayName: String(user.displayName ?? user.name ?? username),
      role,
      tenantId: safeFileName(String(user.tenantId ?? DEFAULT_TENANT_ID)),
      workspaceId: safeFileName(String(user.workspaceId ?? DEFAULT_WORKSPACE_ID)),
      status: user.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
      platformAdmin: Boolean(user.platformAdmin),
      mustChangePassword: Boolean(user.mustChangePassword),
      passwordHash,
      createdAt: String(user.createdAt ?? now),
      updatedAt: String(user.updatedAt ?? user.createdAt ?? now),
      lastLoginAt: user.lastLoginAt ? String(user.lastLoginAt) : undefined
    };
  }

  ensureTenant(id: string, name = id): TenantRecord {
    const existing = this.readTenant(id);
    if (existing) return existing;
    const now = new Date().toISOString();
    return this.writeTenant({
      schema: "evopilot-tenant/v1",
      id: safeFileName(id),
      name,
      status: "ACTIVE",
      plan: "SaaS",
      createdAt: now,
      updatedAt: now
    });
  }

  listWorkspaces(tenantId?: string): WorkspaceRecord[] {
    return fs.readdirSync(this.workspacesDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => this.hydrateWorkspace(JSON.parse(fs.readFileSync(path.join(this.workspacesDir, file), "utf8"))))
      .filter((workspace) => !tenantId || workspace.tenantId === tenantId);
  }

  readWorkspace(id: string): WorkspaceRecord | undefined {
    const file = path.join(this.workspacesDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return this.hydrateWorkspace(JSON.parse(fs.readFileSync(file, "utf8")));
  }

  writeWorkspace(workspace: WorkspaceRecord): WorkspaceRecord {
    const hydrated = this.hydrateWorkspace(workspace);
    atomicWriteJson(path.join(this.workspacesDir, `${safeFileName(hydrated.id)}.json`), hydrated);
    return hydrated;
  }

  private hydrateWorkspace(workspace: any): WorkspaceRecord {
    const now = new Date().toISOString();
    return {
      schema: "evopilot-workspace/v1",
      id: safeFileName(String(workspace.id ?? DEFAULT_WORKSPACE_ID)),
      tenantId: safeFileName(String(workspace.tenantId ?? DEFAULT_TENANT_ID)),
      name: String(workspace.name ?? workspace.id ?? DEFAULT_WORKSPACE_ID),
      status: normalizeWorkspaceStatus(workspace.status),
      members: Array.isArray(workspace.members) ? workspace.members.map((member: any) => ({
        id: safeFileName(String(member.id ?? member.name ?? `member-${Date.now()}`)),
        name: String(member.name ?? member.id ?? "Member"),
        role: normalizeWorkspaceMemberRole(member.role, "viewer"),
        status: normalizeWorkspaceMemberStatus(member.status, "ACTIVE")
      })) : [],
      quotas: normalizeWorkspaceQuotas(workspace.quotas),
      createdAt: String(workspace.createdAt ?? now),
      updatedAt: String(workspace.updatedAt ?? workspace.createdAt ?? now)
    };
  }

  listSecrets(tenantId?: string, workspaceId?: string): SecretRecord[] {
    return fs.readdirSync(this.secretsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => this.hydrateSecret(JSON.parse(fs.readFileSync(path.join(this.secretsDir, file), "utf8"))))
      .filter((secret) => (!tenantId || secret.tenantId === tenantId) && (!workspaceId || secret.workspaceId === workspaceId));
  }

  readSecret(id: string): SecretRecord | undefined {
    const file = path.join(this.secretsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return this.hydrateSecret(JSON.parse(fs.readFileSync(file, "utf8")));
  }

  writeSecret(secret: SecretRecord): SecretRecord {
    const hydrated = this.hydrateSecret(secret);
    atomicWriteJson(path.join(this.secretsDir, `${safeFileName(hydrated.id)}.json`), hydrated);
    return hydrated;
  }

  private hydrateSecret(secret: any): SecretRecord {
    const now = new Date().toISOString();
    return {
      schema: "evopilot-secret/v1",
      id: safeFileName(String(secret.id ?? `secret-${Date.now()}`)),
      tenantId: safeFileName(String(secret.tenantId ?? DEFAULT_TENANT_ID)),
      workspaceId: safeFileName(String(secret.workspaceId ?? DEFAULT_WORKSPACE_ID)),
      scope: String(secret.scope ?? "").trim().toLowerCase() === "user" ? "user" : "workspace",
      ownerActor: optionalTrimmedString(secret.ownerActor),
      name: String(secret.name ?? secret.id ?? "Secret"),
      kind: normalizeSecretKind(secret.kind),
      status: String(secret.status ?? "ACTIVE").toUpperCase() === "REVOKED" ? "REVOKED" : "ACTIVE",
      version: clampPositiveInteger(secret.version, 1),
      encryption: secret.encryption,
      createdAt: String(secret.createdAt ?? now),
      updatedAt: String(secret.updatedAt ?? secret.createdAt ?? now),
      rotatedAt: optionalTrimmedString(secret.rotatedAt),
      revokedAt: optionalTrimmedString(secret.revokedAt)
    };
  }

  listLlmProfiles(tenantId?: string, workspaceId?: string): LlmProfileRecord[] {
    return fs.readdirSync(this.llmProfilesDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => this.hydrateLlmProfile(JSON.parse(fs.readFileSync(path.join(this.llmProfilesDir, file), "utf8"))))
      .filter((profile) => (!tenantId || profile.tenantId === tenantId) && (!workspaceId || profile.workspaceId === workspaceId));
  }

  readLlmProfile(id: string): LlmProfileRecord | undefined {
    const file = path.join(this.llmProfilesDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return this.hydrateLlmProfile(JSON.parse(fs.readFileSync(file, "utf8")));
  }

  writeLlmProfile(profile: LlmProfileRecord): LlmProfileRecord {
    const hydrated = this.hydrateLlmProfile(profile);
    atomicWriteJson(path.join(this.llmProfilesDir, `${safeFileName(hydrated.id)}.json`), hydrated);
    return hydrated;
  }

  defaultLlmConfigured(): boolean {
    return Boolean(this.executionRuntime.llmClient);
  }

  requireLlm(): boolean {
    return this.executionRuntime.requireLlm === true;
  }

  resolveLoopLlmClient(loop: LoopRun): LlmTaskClient | undefined {
    if (loop.llm?.profileId) {
      const profile = this.readLlmProfile(loop.llm.profileId);
      if (!profile || profile.status !== "ACTIVE") return undefined;
      const apiKey = resolveLlmProfileApiKey(this, profile);
      return apiKey ? createLlmClientFromProfile(profile, apiKey) : undefined;
    }
    return this.executionRuntime.llmClient;
  }

  resolveGoalPlanLlmClient(selection?: LoopLlmSelection): LlmTaskClient | undefined {
    if (selection?.profileId) {
      const profile = this.readLlmProfile(selection.profileId);
      if (!profile || profile.status !== "ACTIVE") return undefined;
      const apiKey = resolveLlmProfileApiKey(this, profile);
      return apiKey ? createLlmClientFromProfile(profile, apiKey) : undefined;
    }
    return this.executionRuntime.llmClient;
  }

  private hydrateLlmProfile(profile: any): LlmProfileRecord {
    const now = new Date().toISOString();
    const providerPreset = normalizeLlmProviderPreset(profile.providerPreset ?? profile.preset, profile.providerName ?? profile.provider);
    const presetDefaults = llmProviderPresetDefaults(providerPreset);
    return {
      schema: "evopilot-llm-profile/v1",
      id: safeFileName(String(profile.id ?? profile.name ?? `llm-profile-${Date.now()}`)),
      tenantId: safeFileName(String(profile.tenantId ?? DEFAULT_TENANT_ID)),
      workspaceId: safeFileName(String(profile.workspaceId ?? DEFAULT_WORKSPACE_ID)),
      scope: String(profile.scope ?? "").trim().toLowerCase() === "user" ? "user" : "workspace",
      ownerActor: optionalTrimmedString(profile.ownerActor),
      name: String(profile.name ?? profile.id ?? "LLM Profile"),
      providerPreset,
      provider: normalizeLlmProfileProvider(profile.provider),
      providerName: optionalTrimmedString(profile.providerName) ?? optionalTrimmedString(profile.provider) ?? presetDefaults.providerName,
      baseUrl: optionalTrimmedString(profile.baseUrl) ?? presetDefaults.baseUrl ?? "",
      modelName: optionalTrimmedString(profile.modelName) ?? optionalTrimmedString(profile.model) ?? presetDefaults.modelName ?? "",
      apiKeyRef: optionalTrimmedString(profile.apiKeyRef) ?? optionalTrimmedString(profile.tokenRef) ?? "",
      status: String(profile.status ?? "ACTIVE").toUpperCase() === "DISABLED" ? "DISABLED" : "ACTIVE",
      timeoutSeconds: clampPositiveInteger(profile.timeoutSeconds, 300),
      maxRetries: clampPositiveInteger(profile.maxRetries, 1),
      defaultMaxOutputTokens: clampPositiveInteger(profile.defaultMaxOutputTokens, 8192),
      maxOutputTokens: clampPositiveInteger(profile.maxOutputTokens, 12288),
      temperature: normalizeTemperature(profile.temperature, 0.2),
      thinkingType: optionalTrimmedString(profile.thinkingType) ?? optionalTrimmedString(profile.thinking) ?? "disabled",
      createdAt: String(profile.createdAt ?? now),
      updatedAt: String(profile.updatedAt ?? profile.createdAt ?? now),
      lastPreflight: isRecord(profile.lastPreflight) ? profile.lastPreflight as LlmProfileReadiness : undefined
    };
  }

  listGitHubAppInstallations(tenantId?: string, workspaceId?: string): GitHubAppInstallationRecord[] {
    return fs.readdirSync(this.githubAppInstallationsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => this.hydrateGitHubAppInstallation(JSON.parse(fs.readFileSync(path.join(this.githubAppInstallationsDir, file), "utf8"))))
      .filter((installation) => (!tenantId || installation.tenantId === tenantId) && (!workspaceId || installation.workspaceId === workspaceId));
  }

  readGitHubAppInstallation(id: string): GitHubAppInstallationRecord | undefined {
    const file = path.join(this.githubAppInstallationsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return this.hydrateGitHubAppInstallation(JSON.parse(fs.readFileSync(file, "utf8")));
  }

  writeGitHubAppInstallation(installation: GitHubAppInstallationRecord): GitHubAppInstallationRecord {
    const hydrated = this.hydrateGitHubAppInstallation(installation);
    atomicWriteJson(path.join(this.githubAppInstallationsDir, `${safeFileName(hydrated.id)}.json`), hydrated);
    return hydrated;
  }

  private hydrateGitHubAppInstallation(installation: any): GitHubAppInstallationRecord {
    const now = new Date().toISOString();
    const checks = Array.isArray(installation.checks) ? installation.checks : [];
    return {
      schema: "evopilot-github-app-installation/v1",
      id: safeFileName(String(installation.id ?? installation.installationId ?? `github-app-${Date.now()}`)),
      tenantId: safeFileName(String(installation.tenantId ?? DEFAULT_TENANT_ID)),
      workspaceId: safeFileName(String(installation.workspaceId ?? DEFAULT_WORKSPACE_ID)),
      installationId: String(installation.installationId ?? ""),
      account: String(installation.account ?? ""),
      repositories: Array.isArray(installation.repositories) ? installation.repositories.map(String) : [],
      permissions: isRecord(installation.permissions) ? Object.fromEntries(Object.entries(installation.permissions).map(([key, value]) => [key, String(value)])) : {},
      privateKeySecretRef: optionalTrimmedString(installation.privateKeySecretRef),
      webhookSecretRef: optionalTrimmedString(installation.webhookSecretRef),
      status: installation.status === "READY" || installation.status === "REVOKED" ? installation.status : "BLOCKED",
      checks: checks.map((check: any) => ({
        id: String(check.id ?? "unknown"),
        status: check.status === "PASS" ? "PASS" : "FAIL",
        evidence: Array.isArray(check.evidence) ? check.evidence.map(String) : []
      })),
      createdAt: String(installation.createdAt ?? now),
      updatedAt: String(installation.updatedAt ?? installation.createdAt ?? now)
    };
  }

  listProjects(): StoredProject[] {
    return fs.readdirSync(this.projectsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => this.hydrateProject(JSON.parse(fs.readFileSync(path.join(this.projectsDir, file), "utf8"))));
  }

  readProject(id: string): StoredProject | undefined {
    const file = path.join(this.projectsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return this.hydrateProject(JSON.parse(fs.readFileSync(file, "utf8")));
  }

  writeProject(project: StoredProject): void {
    atomicWriteJson(path.join(this.projectsDir, `${safeFileName(project.id)}.json`), project);
  }

  ensureProject(project: StoredProject): void {
    const file = path.join(this.projectsDir, `${safeFileName(project.id)}.json`);
    if (!fs.existsSync(file)) this.writeProject(project);
  }

  private hydrateProject(project: any): StoredProject {
    return {
      ...project,
      tenantId: safeFileName(String(project.tenantId ?? DEFAULT_TENANT_ID)),
      workspaceId: safeFileName(String(project.workspaceId ?? DEFAULT_WORKSPACE_ID)),
      llm: hydrateProjectLlmBinding(project.llm),
      validation: project.validation ?? {
        status: "FAILED",
        checkedAt: project.createdAt ?? new Date().toISOString(),
        message: "project validation is missing; re-register the project or repair repository credentials before Goal/Loop execution"
      },
      updatedAt: project.updatedAt ?? project.createdAt ?? new Date().toISOString()
    } as StoredProject;
  }

  listHarnessTemplates(): HarnessTemplateProfile[] {
    return mergeHarnessTemplateSources(this.listConfiguredHarnessCatalogTemplates());
  }

  readHarnessTemplate(templateId: string, version?: string): HarnessTemplateProfile | undefined {
    const id = safeFileName(templateId);
    const requestedVersion = optionalTrimmedString(version);
    const candidates = this.listHarnessTemplates()
      .filter((template) => template.id === id && (!requestedVersion || template.version === requestedVersion))
      .sort((left, right) => compareStoreHarnessTemplateVersions(left.version, right.version));
    return candidates[candidates.length - 1];
  }

  listHarnessCatalogMounts(): HarnessCatalogMount[] {
    return this.configuredHarnessCatalogMounts();
  }

  readConfiguredHarnessRegistry(): HarnessRegistryConfig | undefined {
    const registryConfig = optionalTrimmedString(this.executionRuntime.harnessRegistryConfig);
    if (!registryConfig) return undefined;
    return readHarnessRegistryConfig(registryConfig);
  }

  readHarnessCatalogMount(catalogId: string): HarnessCatalogMount | undefined {
    const id = safeFileName(catalogId);
    for (const mount of this.configuredHarnessCatalogMounts()) {
      if (mount.catalogId === id) return mount;
      const scan = readPublishedHarnessCatalog(mount.source, mount);
      if (scan.mount.catalogId === id) return scan.mount;
    }
    return undefined;
  }

  scanHarnessCatalogMount(catalogId: string): HarnessCatalogScanResult | undefined {
    const mount = this.readHarnessCatalogMount(catalogId);
    if (!mount) return undefined;
    return readPublishedHarnessCatalog(mount.source, mount);
  }

  listHarnessCatalogScans(): HarnessCatalogScanResult[] {
    return this.configuredHarnessCatalogMounts().map((mount) => readPublishedHarnessCatalog(mount.source, mount));
  }

  private listConfiguredHarnessCatalogTemplates(): HarnessTemplateProfile[] {
    return this.configuredHarnessCatalogMounts()
      .flatMap((mount) => readPublishedHarnessCatalog(mount.source, mount).templates);
  }

  private configuredHarnessCatalogMounts(): HarnessCatalogMount[] {
    const registryConfig = optionalTrimmedString(this.executionRuntime.harnessRegistryConfig);
    if (registryConfig) {
      return harnessRegistryCatalogMounts(registryConfig);
    }
    return (this.executionRuntime.harnessCatalogDirs ?? [])
      .map((source) => hydrateHarnessCatalogMount({
        catalogId: path.basename(source) || "published-harness-catalog",
        name: path.basename(source) || "Published Harness Catalog",
        source: path.resolve(source),
        status: "ACTIVE",
        mountedBy: "evopilot-runtime-config",
        mountedAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }))
      .sort((left, right) => {
        if ((right.priority ?? 0) !== (left.priority ?? 0)) return (right.priority ?? 0) - (left.priority ?? 0);
        return left.catalogId.localeCompare(right.catalogId);
      });
  }

  listProjectHarnessTemplateBindings(tenantId: string, workspaceId: string): HarnessTemplateProjectProfileBinding[] {
    return this.listProjects()
      .filter((project) => project.tenantId === tenantId && project.workspaceId === workspaceId)
      .flatMap((project) => this.listProjectHarnessProfileSummaries(project.id).map((summary) => {
        const active = this.readActiveProjectHarnessProfile(project.id, summary.profileId);
        return {
          tenantId: project.tenantId,
          workspaceId: project.workspaceId,
          projectId: project.id,
          profileId: summary.profileId,
          templateRef: summary.templateRef,
          activeTemplateRef: active?.templateRef,
          activeVersion: active?.version
        };
      }));
  }

  listTenantHarnessPolicySummaries(tenantId: string, workspaceId: string): TenantHarnessPolicySummary[] {
    const root = this.tenantHarnessPolicyWorkspaceDir(tenantId, workspaceId);
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root)
      .filter((file) => fs.statSync(path.join(root, file)).isDirectory())
      .sort()
      .map((policyId) => this.tenantHarnessPolicySummary(tenantId, workspaceId, policyId))
      .filter((summary): summary is TenantHarnessPolicySummary => Boolean(summary));
  }

  listTenantHarnessPolicyVersions(tenantId: string, workspaceId: string, policyId = "default"): TenantHarnessPolicyVersion[] {
    const versionsDir = this.tenantHarnessPolicyVersionsDir(tenantId, workspaceId, policyId);
    if (!fs.existsSync(versionsDir)) return [];
    return fs.readdirSync(versionsDir)
      .filter((file) => file.endsWith(".json"))
      .sort((left, right) => versionNumberFromFile(left) - versionNumberFromFile(right))
      .map((file) => hydrateTenantHarnessPolicyVersion(JSON.parse(fs.readFileSync(path.join(versionsDir, file), "utf8"))));
  }

  readTenantHarnessPolicyVersion(tenantId: string, workspaceId: string, policyId: string, version: number): TenantHarnessPolicyVersion | undefined {
    const file = path.join(this.tenantHarnessPolicyVersionsDir(tenantId, workspaceId, policyId), `v${version}.json`);
    if (!fs.existsSync(file)) return undefined;
    return hydrateTenantHarnessPolicyVersion(JSON.parse(fs.readFileSync(file, "utf8")));
  }

  readActiveTenantHarnessPolicy(tenantId: string, workspaceId: string, policyId = "default"): TenantHarnessPolicyVersion | undefined {
    return this.listTenantHarnessPolicyVersions(tenantId, workspaceId, policyId).find((version) => version.status === "ACTIVE");
  }

  listActiveTenantHarnessPoliciesForProject(project: StoredProject, template?: HarnessTemplateProfile): TenantHarnessPolicyVersion[] {
    return this.listTenantHarnessPolicySummaries(project.tenantId, project.workspaceId)
      .map((summary) => this.readActiveTenantHarnessPolicy(project.tenantId, project.workspaceId, summary.policyId))
      .filter((policy): policy is TenantHarnessPolicyVersion => Boolean(policy))
      .filter((policy) => tenantHarnessPolicyAppliesToProject(policy, project, template));
  }

  writeTenantHarnessPolicyVersion(version: TenantHarnessPolicyVersion): TenantHarnessPolicyVersion {
    const hydrated = hydrateTenantHarnessPolicyVersion(version);
    const versionsDir = this.tenantHarnessPolicyVersionsDir(hydrated.tenantId, hydrated.workspaceId, hydrated.policyId);
    fs.mkdirSync(versionsDir, { recursive: true });
    atomicWriteJson(path.join(versionsDir, `v${hydrated.version}.json`), hydrated);
    return hydrated;
  }

  activateTenantHarnessPolicyVersion(tenantId: string, workspaceId: string, policyId: string, version: number, actor: string): TenantHarnessPolicyVersion | undefined {
    const versions = this.listTenantHarnessPolicyVersions(tenantId, workspaceId, policyId);
    const selected = versions.find((item) => item.version === version);
    if (!selected) return undefined;
    if (selected.validation.status !== "VALIDATED") {
      throw httpError(409, "TENANT_HARNESS_POLICY_NOT_VALIDATED", "Only validated TenantHarnessPolicy versions can be activated.");
    }
    const now = new Date().toISOString();
    for (const item of versions) {
      const next = item.version === selected.version
        ? {
          ...item,
          status: "ACTIVE" as TenantHarnessPolicyStatus,
          approvedAt: item.approvedAt ?? now,
          approvedBy: item.approvedBy ?? actor,
          activatedAt: now,
          activatedBy: actor,
          updatedAt: now
        }
        : item.status === "ACTIVE"
          ? { ...item, status: "SUPERSEDED" as TenantHarnessPolicyStatus, updatedAt: now }
          : item;
      this.writeTenantHarnessPolicyVersion(next);
    }
    return this.readTenantHarnessPolicyVersion(tenantId, workspaceId, policyId, selected.version);
  }

  tenantHarnessPolicySummary(tenantId: string, workspaceId: string, policyId = "default"): TenantHarnessPolicySummary | undefined {
    const safeTenantId = safeFileName(tenantId);
    const safeWorkspaceId = safeFileName(workspaceId);
    const safePolicyId = safeFileName(policyId);
    const versions = this.listTenantHarnessPolicyVersions(safeTenantId, safeWorkspaceId, safePolicyId);
    const active = versions.find((version) => version.status === "ACTIVE");
    const latest = versions[versions.length - 1];
    return {
      schema: "evopilot-tenant-harness-policy-summary/v1",
      tenantId: safeTenantId,
      workspaceId: safeWorkspaceId,
      policyId: safePolicyId,
      status: active?.status ?? latest?.status ?? "MISSING",
      activeVersion: active?.version,
      latestVersion: latest?.version,
      sourceDigest: active?.sourceDigest ?? latest?.sourceDigest,
      compiledDigest: active?.compiledDigest ?? latest?.compiledDigest,
      storage: {
        authority: "evopilot-control-plane",
        format: "json",
        path: this.tenantHarnessPolicyRoot(safeTenantId, safeWorkspaceId, safePolicyId)
      },
      versions: versions.map((item) => ({
        version: item.version,
        status: item.status,
        sourceDigest: item.sourceDigest,
        compiledDigest: item.compiledDigest,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      })),
      updatedAt: latest?.updatedAt
    };
  }

  listProjectHarnessProfileSummaries(projectId: string): ProjectHarnessProfileSummary[] {
    const project = this.readProject(projectId);
    if (!project) return [];
    const root = this.projectHarnessProjectDir(project);
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root)
      .filter((file) => fs.statSync(path.join(root, file)).isDirectory())
      .sort()
      .map((profileId) => this.projectHarnessProfileSummary(project.id, profileId))
      .filter((summary): summary is ProjectHarnessProfileSummary => Boolean(summary));
  }

  listProjectHarnessProfileVersions(projectId: string, profileId = "default"): ProjectHarnessProfileVersion[] {
    const project = this.readProject(projectId);
    if (!project) return [];
    const versionsDir = this.projectHarnessProfileVersionsDir(project, profileId);
    if (!fs.existsSync(versionsDir)) return [];
    return fs.readdirSync(versionsDir)
      .filter((file) => file.endsWith(".json"))
      .sort((left, right) => versionNumberFromFile(left) - versionNumberFromFile(right))
      .map((file) => hydrateProjectHarnessProfileVersion(JSON.parse(fs.readFileSync(path.join(versionsDir, file), "utf8"))));
  }

  readProjectHarnessProfileVersion(projectId: string, profileId: string, version: number): ProjectHarnessProfileVersion | undefined {
    const project = this.readProject(projectId);
    if (!project) return undefined;
    const file = path.join(this.projectHarnessProfileVersionsDir(project, profileId), `v${version}.json`);
    if (!fs.existsSync(file)) return undefined;
    return hydrateProjectHarnessProfileVersion(JSON.parse(fs.readFileSync(file, "utf8")));
  }

  readActiveProjectHarnessProfile(projectId: string, profileId = "default"): ProjectHarnessProfileVersion | undefined {
    return this.listProjectHarnessProfileVersions(projectId, profileId).find((version) => version.status === "ACTIVE");
  }

  writeProjectHarnessProfileVersion(version: ProjectHarnessProfileVersion): ProjectHarnessProfileVersion {
    const project = this.readProject(version.projectId);
    if (!project) throw httpError(404, "PROJECT_NOT_FOUND", `Project ${version.projectId} is not registered.`);
    const hydrated = hydrateProjectHarnessProfileVersion(version);
    const versionsDir = this.projectHarnessProfileVersionsDir(project, hydrated.profileId);
    fs.mkdirSync(versionsDir, { recursive: true });
    atomicWriteJson(path.join(versionsDir, `v${hydrated.version}.json`), hydrated);
    return hydrated;
  }

  activateProjectHarnessProfileVersion(projectId: string, profileId: string, version: number, actor: string): ProjectHarnessProfileVersion | undefined {
    const project = this.readProject(projectId);
    if (!project) return undefined;
    const versions = this.listProjectHarnessProfileVersions(project.id, profileId);
    const selected = versions.find((item) => item.version === version);
    if (!selected) return undefined;
    if (selected.validation.status !== "VALIDATED") {
      throw httpError(409, "PROJECT_HARNESS_PROFILE_NOT_VALIDATED", "Only validated ProjectHarnessProfile versions can be activated.");
    }
    const template = this.readHarnessTemplate(selected.templateRef.templateId, selected.templateRef.version);
    const activePolicies = this.listActiveTenantHarnessPoliciesForProject(project, template);
    const policyFailures = detectTenantHarnessPolicyBindingFailures(activePolicies, selected.compiledContent);
    if (policyFailures.length > 0) {
      throw httpError(409, "PROJECT_HARNESS_PROFILE_POLICY_STALE", `ProjectHarnessProfile must be regenerated or reapplied against the active TenantHarnessPolicy before activation: ${policyFailures.join("; ")}`);
    }
    const now = new Date().toISOString();
    for (const item of versions) {
      const next = item.version === selected.version
        ? {
          ...item,
          status: "ACTIVE" as ProjectHarnessProfileStatus,
          approvedAt: item.approvedAt ?? now,
          approvedBy: item.approvedBy ?? actor,
          activatedAt: now,
          activatedBy: actor,
          updatedAt: now
        }
        : item.status === "ACTIVE"
          ? { ...item, status: "SUPERSEDED" as ProjectHarnessProfileStatus, updatedAt: now }
          : item;
      this.writeProjectHarnessProfileVersion(next);
    }
    return this.readProjectHarnessProfileVersion(project.id, profileId, selected.version);
  }

  projectHarnessProfileSummary(projectId: string, profileId = "default"): ProjectHarnessProfileSummary | undefined {
    const project = this.readProject(projectId);
    if (!project) return undefined;
    const safeProfileId = safeFileName(profileId);
    const versions = this.listProjectHarnessProfileVersions(project.id, safeProfileId);
    const active = versions.find((version) => version.status === "ACTIVE");
    const latest = versions[versions.length - 1];
    return {
      schema: "evopilot-project-harness-profile-summary/v1",
      tenantId: project.tenantId,
      workspaceId: project.workspaceId,
      projectId: project.id,
      profileId: safeProfileId,
      status: active?.status ?? latest?.status ?? "MISSING",
      activeVersion: active?.version,
      latestVersion: latest?.version,
      sourceDigest: active?.sourceDigest ?? latest?.sourceDigest,
      compiledDigest: active?.compiledDigest ?? latest?.compiledDigest,
      templateRef: active?.templateRef ?? latest?.templateRef,
      policyRefs: active?.policyRefs ?? latest?.policyRefs,
      storage: {
        authority: "evopilot-control-plane",
        format: "json",
        path: this.projectHarnessProfileRoot(project, safeProfileId)
      },
      versions: versions.map((item) => ({
        version: item.version,
        status: item.status,
        sourceDigest: item.sourceDigest,
        compiledDigest: item.compiledDigest,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      })),
      updatedAt: latest?.updatedAt
    };
  }

  private projectHarnessProjectDir(project: StoredProject): string {
    return path.join(this.projectHarnessProfilesDir, safeFileName(project.tenantId), safeFileName(project.workspaceId), safeFileName(project.id));
  }

  private tenantHarnessPolicyWorkspaceDir(tenantId: string, workspaceId: string): string {
    return path.join(this.tenantHarnessPoliciesDir, safeFileName(tenantId), safeFileName(workspaceId));
  }

  private tenantHarnessPolicyRoot(tenantId: string, workspaceId: string, policyId: string): string {
    return path.join(this.tenantHarnessPolicyWorkspaceDir(tenantId, workspaceId), safeFileName(policyId));
  }

  private tenantHarnessPolicyVersionsDir(tenantId: string, workspaceId: string, policyId: string): string {
    return path.join(this.tenantHarnessPolicyRoot(tenantId, workspaceId, policyId), "versions");
  }

  private projectHarnessProfileRoot(project: StoredProject, profileId: string): string {
    return path.join(this.projectHarnessProjectDir(project), safeFileName(profileId));
  }

  private projectHarnessProfileVersionsDir(project: StoredProject, profileId: string): string {
    return path.join(this.projectHarnessProfileRoot(project, profileId), "versions");
  }

  findRunByReviewId(reviewId: string): StoredRun | undefined {
    return this.listRuns().find((run) => run.reviews.some((review) => review.id === reviewId));
  }

  findRunByDeliveryId(deliveryId: string): StoredRun | undefined {
    return this.listRuns().find((run) => run.deliveryPlans.some((delivery) => delivery.id === deliveryId));
  }

  appendAudit(record: AuditRecord): void {
    fs.appendFileSync(this.auditFile, `${JSON.stringify(record)}\n`);
    logInfo("audit.recorded", {
      actor: record.actor,
      action: record.action,
      target: record.target,
      metadata: record.metadata
    });
  }

  listAudit(options: { limit?: number; order?: "asc" | "desc" } = {}): AuditRecord[] {
    if (!fs.existsSync(this.auditFile)) return [];
    const records = options.limit
      ? this.readAuditTail(options.limit)
      : fs.readFileSync(this.auditFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => this.hydrateAuditRecord(JSON.parse(line)));
    return options.order === "desc" ? [...records].reverse() : records;
  }

  private readAuditTail(limit: number): AuditRecord[] {
    const fd = fs.openSync(this.auditFile, "r");
    try {
      const stat = fs.fstatSync(fd);
      const chunkSize = 64 * 1024;
      let position = stat.size;
      const chunks: Buffer[] = [];
      let lines: string[] = [];
      while (position > 0 && lines.length <= limit) {
        const readSize = Math.min(chunkSize, position);
        position -= readSize;
        const buffer = Buffer.allocUnsafe(readSize);
        fs.readSync(fd, buffer, 0, readSize, position);
        chunks.unshift(buffer);
        lines = Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean);
      }
      return lines.slice(-limit).map((line) => this.hydrateAuditRecord(JSON.parse(line)));
    } finally {
      fs.closeSync(fd);
    }
  }

  private hydrateAuditRecord(record: any): AuditRecord {
    return {
      ...record,
      tenantId: safeFileName(String(record.tenantId ?? DEFAULT_TENANT_ID)),
      workspaceId: safeFileName(String(record.workspaceId ?? DEFAULT_WORKSPACE_ID))
    } as AuditRecord;
  }

  readIdempotency(key: string): unknown | undefined {
    const file = path.join(this.idempotencyDir, `${safeFileName(key)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  writeIdempotency(key: string, response: unknown): void {
    atomicWriteJson(path.join(this.idempotencyDir, `${safeFileName(key)}.json`), response);
  }

  listCodeUpgraderConnectors(): StoredCodeUpgraderConnector[] {
    return fs.readdirSync(this.codeUpgraderConnectorsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.codeUpgraderConnectorsDir, file), "utf8")) as StoredCodeUpgraderConnector);
  }

  readCodeUpgraderConnector(id: string): StoredCodeUpgraderConnector | undefined {
    const file = path.join(this.codeUpgraderConnectorsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8")) as StoredCodeUpgraderConnector;
  }

  writeCodeUpgraderConnector(connector: StoredCodeUpgraderConnector): void {
    const existing = this.readCodeUpgraderConnector(connector.id);
    atomicWriteJson(path.join(this.codeUpgraderConnectorsDir, `${safeFileName(connector.id)}.json`), {
      ...connector,
      createdAt: existing?.createdAt ?? connector.createdAt,
      updatedAt: connector.updatedAt
    });
  }

  listDeployConnectors(): StoredDeployConnector[] {
    return fs.readdirSync(this.deployConnectorsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => this.hydrateDeployConnector(JSON.parse(fs.readFileSync(path.join(this.deployConnectorsDir, file), "utf8"))));
  }

  readDeployConnector(id: string): StoredDeployConnector | undefined {
    const file = path.join(this.deployConnectorsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return this.hydrateDeployConnector(JSON.parse(fs.readFileSync(file, "utf8")));
  }

  writeDeployConnector(connector: StoredDeployConnector): void {
    const existing = this.readDeployConnector(connector.id);
    atomicWriteJson(path.join(this.deployConnectorsDir, `${safeFileName(connector.id)}.json`), {
      ...connector,
      createdAt: existing?.createdAt ?? connector.createdAt,
      updatedAt: connector.updatedAt
    });
  }

  private hydrateDeployConnector(value: any): StoredDeployConnector {
    const connector = value as StoredDeployConnector;
    if (connector.type !== "ecs-docker-compose") return connector;
    return {
      ...connector,
      composeFile: connector.composeFile ?? "docker-compose.yml",
      gitRemote: connector.gitRemote ?? "origin",
      gitBranch: connector.gitBranch ?? "main",
      gitPull: connector.gitPull ?? true,
      preserveLocalPaths: normalizeStringList(connector.preserveLocalPaths, []),
      build: connector.build ?? true,
      skipComposeWhenUnchanged: connector.skipComposeWhenUnchanged ?? false,
      deployLock: connector.deployLock ?? true,
      idempotency: connector.idempotency ?? true,
      rollbackOnFailure: connector.rollbackOnFailure ?? true,
      rollbackOnHealthFailure: connector.rollbackOnHealthFailure ?? true,
      gitCommand: connector.gitCommand ?? "git",
      dockerCommand: connector.dockerCommand ?? "docker"
    };
  }

  listPipelines(): PipelineRun[] {
    return fs.readdirSync(this.pipelinesDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.pipelinesDir, file), "utf8")) as PipelineRun);
  }

  readPipeline(id: string): PipelineRun | undefined {
    const file = path.join(this.pipelinesDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8")) as PipelineRun;
  }

  writePipeline(pipeline: PipelineRun): void {
    atomicWriteJson(path.join(this.pipelinesDir, `${safeFileName(pipeline.id)}.json`), pipeline);
    const run = this.findRunByDeliveryId(pipeline.deliveryPlanId);
    if (run) {
      const remaining = (run.pipelineRuns ?? []).filter((item) => item.id !== pipeline.id);
      run.pipelineRuns = [...remaining, pipeline];
      this.writeRun(run);
    }
  }

  listEvaluationDatasets(): EvaluationDataset[] {
    return fs.readdirSync(this.evaluationDatasetsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.evaluationDatasetsDir, file), "utf8")) as EvaluationDataset);
  }

  writeEvaluationDatasets(datasets: EvaluationDataset[]): void {
    for (const dataset of datasets) {
      atomicWriteJson(path.join(this.evaluationDatasetsDir, `${safeFileName(dataset.id)}.json`), dataset);
    }
  }

  autogenerateEvaluationDatasets(): EvaluationDataset[] {
    const datasets = this.listRuns().flatMap((run) => evaluationDatasetsFromRun(run));
    this.writeEvaluationDatasets(datasets);
    return datasets;
  }

  ensureEvaluationDatasetBaseline(defaultProjectId: string): EvaluationDataset[] {
    const existing = this.listEvaluationDatasets();
    if (existing.length > 0) return existing;
    const datasets = productionEvaluationBaselineDatasets(defaultProjectId);
    this.writeEvaluationDatasets(datasets);
    return datasets;
  }

  discoverOpportunityInsights(): OpportunityInsight[] {
    const datasets = this.listEvaluationDatasets();
    const runs = this.listRuns();
    const insights = new Map<string, OpportunityInsight>();
    for (const run of runs) {
      for (const opportunity of run.opportunities) {
        const relatedDatasets = datasets.filter((dataset) =>
          dataset.projectId === opportunity.projectId &&
          ((dataset.opportunityIds ?? []).includes(opportunity.id) || dataset.scope.includes(opportunity.affectedArea) || dataset.learningSignal === opportunity.failureAttribution)
        );
        const score = opportunityInsightScore(opportunity, relatedDatasets, run);
        const key = `${opportunity.projectId}:${opportunity.type}:${opportunity.affectedArea}`;
        const existing = insights.get(key);
        const insight: OpportunityInsight = {
          id: `insight-${safeFileName(key)}`,
          projectId: opportunity.projectId,
          title: opportunity.title,
          category: opportunity.failureAttribution ?? opportunity.type,
          score,
          confidence: opportunity.confidence,
          source: "self-learning",
          evidenceCount: opportunity.evidenceEventIds.length,
          datasetIds: relatedDatasets.map((dataset) => dataset.id),
          opportunityIds: [opportunity.id],
          rationale: [
            opportunity.evidenceSummary ?? "由运行证据自动发现。",
            `机会置信度 ${Math.round(opportunity.confidence * 100)}%。`,
            relatedDatasets.length > 0 ? `已沉淀 ${relatedDatasets.length} 个评测集。` : "尚未沉淀评测集，建议自动生成。",
            run.learningRecords.length > 0 ? `已有 ${run.learningRecords.length} 条发布后学习记录。` : "尚无发布后学习记录。"
          ],
          recommendedAction: relatedDatasets.length > 0 ? "基于关联评测集生成进化方案，并进入人工确认。" : "先自动沉淀 Eval Dataset，再形成机会点方案。",
          generatedAt: new Date().toISOString()
        };
        if (existing) {
          existing.score = Math.max(existing.score, insight.score);
          existing.confidence = Math.max(existing.confidence, insight.confidence);
          existing.evidenceCount += insight.evidenceCount;
          existing.datasetIds = [...new Set([...existing.datasetIds, ...insight.datasetIds])];
          existing.opportunityIds = [...new Set([...existing.opportunityIds, ...insight.opportunityIds])];
          existing.rationale = [...new Set([...existing.rationale, ...insight.rationale])].slice(0, 6);
        } else {
          insights.set(key, insight);
        }
      }
    }
    return [...insights.values()].sort((left, right) => right.score - left.score);
  }

  computeServiceScorecards(): ServiceScorecard[] {
    const projects = this.listProjects();
    const runs = this.listRuns();
    const datasets = this.listEvaluationDatasets();
    const pipelines = this.listPipelines();
    const codeUpgrades = this.listCodeUpgradeRuns();
    const now = new Date().toISOString();
    return projects.map((project) => {
      const projectRuns = runs.filter((run) => run.evidenceBundle.projectId === project.id);
      const projectDatasets = datasets.filter((dataset) => dataset.projectId === project.id);
      const projectPipelines = pipelines.filter((pipeline) => pipeline.projectId === project.id);
      const projectUpgrades = codeUpgrades.filter((upgrade) => upgrade.projectId === project.id);
      const learningRecords = projectRuns.flatMap((run) => run.learningRecords);
      const evidenceCoverage = projectRuns.length > 0 ? 100 : 0;
      const governanceCoverage = projectRuns.some((run) => run.reviews.length > 0 && run.deliveryPlans.length > 0) ? 100 : projectRuns.length > 0 ? 55 : 0;
      const deliveryCoverage = projectPipelines.length > 0 || projectUpgrades.length > 0 ? 100 : projectRuns.length > 0 ? 45 : 0;
      const learningCoverage = learningRecords.length > 0 ? 100 : projectDatasets.some((dataset) => dataset.generatedBy === "self-learning") ? 60 : 0;
      const validationScore = project.validation.status === "VERIFIED" ? 100 : 0;
      const score = Math.round(validationScore * 0.2 + evidenceCoverage * 0.25 + governanceCoverage * 0.2 + deliveryCoverage * 0.2 + learningCoverage * 0.15);
      const checks: ServiceScorecard["checks"] = [
        { name: "项目注册验证", status: project.validation.status === "VERIFIED" ? "PASSED" : "FAILED", detail: project.validation.message },
        { name: "证据覆盖", status: evidenceCoverage >= 100 ? "PASSED" : "WARN", detail: projectRuns.length > 0 ? `已有 ${projectRuns.length} 次证据运行` : "尚未接入运行证据" },
        { name: "治理闭环", status: governanceCoverage >= 100 ? "PASSED" : governanceCoverage > 0 ? "WARN" : "FAILED", detail: governanceCoverage >= 100 ? "已生成评审和交付计划" : "缺少评审或交付计划" },
        { name: "交付闭环", status: deliveryCoverage >= 100 ? "PASSED" : deliveryCoverage > 0 ? "WARN" : "FAILED", detail: deliveryCoverage >= 100 ? "已有代码升级或流水线记录" : "尚无交付执行记录" },
        { name: "自学习闭环", status: learningCoverage >= 100 ? "PASSED" : learningCoverage > 0 ? "WARN" : "FAILED", detail: learningRecords.length > 0 ? `已有 ${learningRecords.length} 条发布后学习` : projectDatasets.length > 0 ? "已有自学习评测集，尚无发布后学习" : "尚未形成学习资产" }
      ];
      return {
        projectId: project.id,
        projectName: project.name,
        score,
        level: serviceScoreLevel(score),
        evidenceCoverage,
        governanceCoverage,
        deliveryCoverage,
        learningCoverage,
        checks,
        recommendedAction: serviceScoreRecommendedAction(score, checks),
        updatedAt: now
      };
    }).sort((left, right) => right.score - left.score);
  }

  computeSloReports(): SloReport[] {
    const projects = this.listProjects();
    const runs = this.listRuns();
    const now = new Date().toISOString();
    return projects.map((project) => {
      const projectRuns = runs.filter((run) => run.evidenceBundle.projectId === project.id);
      const releases = projectRuns.flatMap((run) => run.releaseReports);
      const latestSuccessfulReleaseAt = releases
        .filter((release) => release.status === "SUCCEEDED" && release.releasedAt)
        .map((release) => Date.parse(release.releasedAt as string))
        .filter((timestamp) => Number.isFinite(timestamp))
        .sort((left, right) => right - left)[0];
      const isAfterLatestSuccessfulRelease = (timestamp: string): boolean => {
        if (!Number.isFinite(latestSuccessfulReleaseAt)) return true;
        const parsed = Date.parse(timestamp);
        return !Number.isFinite(parsed) || parsed > latestSuccessfulReleaseAt;
      };
      const failedReleaseCount = releases.filter((release) =>
        (release.status === "FAILED" || release.status === "ROLLED_BACK") &&
        isAfterLatestSuccessfulRelease(release.releasedAt ?? runFinishedAt(projectRuns, release.evidenceBundleId))
      ).length;
      const successfulReleaseCount = releases.filter((release) => release.status === "SUCCEEDED").length;
      const latencyViolationCount = projectRuns.flatMap((run) => run.evidenceBundle.events).filter((event) =>
        isAfterLatestSuccessfulRelease(event.timestamp) &&
        Number(event.attributes?.durationMs ?? event.attributes?.latencyMs ?? event.attributes?.p95LatencyMs ?? 0) > 3000
      ).length;
      const totalSignals = Math.max(1, projectRuns.reduce((sum, run) => sum + run.evidenceBundle.events.length, 0) + successfulReleaseCount * 5 + failedReleaseCount * 2);
      const violationRate = (latencyViolationCount + failedReleaseCount * 2) / totalSignals;
      const observedHealth = Math.max(0, Math.round((1 - Math.min(1, violationRate)) * 100));
      const targetAvailability = 99;
      const errorBudgetRemaining = Math.max(0, Math.round(100 - violationRate * 100));
      const status: SloReport["status"] = errorBudgetRemaining <= 0 ? "EXHAUSTED" : errorBudgetRemaining < 50 ? "BURNING" : "HEALTHY";
      return {
        projectId: project.id,
        targetAvailability,
        observedHealth,
        errorBudgetRemaining,
        latencyViolationCount,
        failedReleaseCount,
        status,
        recommendedAction: status === "HEALTHY" ? "保持当前发布节奏。" : status === "BURNING" ? "暂停自动进化，优先处理高分机会点。" : "冻结发布并触发人工评审。",
        updatedAt: now
      };
    });
  }

  evaluateGovernancePolicies(): GovernancePolicyEvaluation[] {
    const now = new Date().toISOString();
    const scorecards = this.computeServiceScorecards();
    const sloReports = this.computeSloReports();
    const thirdPartyReports = this.computeSupplyChainReports();
    const costReports = this.computeCostReports();
    const evaluations: GovernancePolicyEvaluation[] = [];
    for (const scorecard of scorecards) {
      evaluations.push({
        id: `policy-scorecard-${safeFileName(scorecard.projectId)}`,
        name: "项目成熟度门禁",
        status: scorecard.score >= 75 ? "PASSED" : scorecard.score >= 55 ? "WARN" : "FAILED",
        severity: scorecard.score >= 75 ? "LOW" : scorecard.score >= 55 ? "MEDIUM" : "HIGH",
        scope: scorecard.projectId,
        rationale: `当前成熟度 ${scorecard.score}，等级 ${scorecard.level}。`,
        recommendedAction: scorecard.recommendedAction,
        evaluatedAt: now
      });
    }
    for (const report of sloReports) {
      evaluations.push({
        id: `policy-slo-${safeFileName(report.projectId)}`,
        name: "SLO 错误预算门禁",
        status: report.status === "HEALTHY" ? "PASSED" : report.status === "BURNING" ? "WARN" : "FAILED",
        severity: report.status === "HEALTHY" ? "LOW" : report.status === "BURNING" ? "MEDIUM" : "HIGH",
        scope: report.projectId,
        rationale: `错误预算剩余 ${report.errorBudgetRemaining}%，延迟违规 ${report.latencyViolationCount} 次，失败发布 ${report.failedReleaseCount} 次。`,
        recommendedAction: report.recommendedAction,
        evaluatedAt: now
      });
    }
    for (const report of costReports) {
      evaluations.push({
        id: `policy-cost-${safeFileName(report.projectId)}`,
        name: "成本预算门禁",
        status: report.status === "HEALTHY" ? "PASSED" : report.status === "WATCH" ? "WARN" : "FAILED",
        severity: report.status === "HEALTHY" ? "LOW" : report.status === "WATCH" ? "MEDIUM" : "HIGH",
        scope: report.projectId,
        rationale: `累计成本 ${report.totalCost.toFixed(4)}，Token ${report.totalTokens}，高成本事件 ${report.highCostEventCount} 次。`,
        recommendedAction: report.recommendedAction,
        evaluatedAt: now
      });
    }
    const missingThirdParty = thirdPartyReports.filter((report) => report.required && report.status !== "READY").length;
    evaluations.push({
      id: "policy-runtime-supply-chain",
      name: "运行时供应链门禁",
      status: missingThirdParty === 0 ? "PASSED" : "FAILED",
      severity: missingThirdParty === 0 ? "LOW" : "HIGH",
      scope: "platform",
      rationale: missingThirdParty === 0 ? "必需运行时版本、镜像、Digest、SBOM、许可证和漏洞报告已锁定。" : `有 ${missingThirdParty} 个必需运行时未满足生产供应链锁定。`,
      recommendedAction: missingThirdParty === 0 ? "保持运行时锁定并纳入发布门禁。" : "补齐 runtime-lock 中的 Digest、SBOM、许可证报告和漏洞扫描报告后再执行生产发布。",
      evaluatedAt: now
    });
    return evaluations.sort((left, right) => policySeverityRank(right.severity) - policySeverityRank(left.severity));
  }

  computeSupplyChainReports(): SupplyChainReport[] {
    return readRuntimeLock().map((item) => {
      const packageArtifacts = [item.sbom, item.licenseReport, item.vulnerabilityReport].filter(Boolean).map(String);
      const missingArtifacts = packageArtifacts.filter((artifact: string) => !fs.existsSync(path.resolve(artifact)));
      const digestReady = /^sha256:[a-f0-9]{64}$/i.test(String(item.digest ?? ""));
      const runtimeDigestReady = item.runtimeImage ? /^sha256:[a-f0-9]{64}$/i.test(String(item.runtimeDigest ?? "")) : true;
      const vulnerabilityReady = item.vulnerabilityReport ? vulnerabilityReportPassed(String(item.vulnerabilityReport)) : false;
      const healthEndpointReady = /^https?:\/\/.+/i.test(String(item.healthEndpoint ?? ""));
      const finalStatus: SupplyChainReport["status"] = digestReady && runtimeDigestReady && missingArtifacts.length === 0 && vulnerabilityReady && healthEndpointReady ? "READY" : "INCOMPLETE";
      return {
        id: String(item.id ?? safeFileName(String(item.name ?? "third-party"))),
        name: String(item.name ?? item.id ?? "第三方组件"),
        implementation: item.implementation ? String(item.implementation) : undefined,
        role: item.role ? String(item.role) : undefined,
        version: item.version ? String(item.version) : undefined,
        image: item.image ? String(item.image) : undefined,
        digest: item.digest ? String(item.digest) : undefined,
        runtimeImage: item.runtimeImage ? String(item.runtimeImage) : undefined,
        runtimeDigest: item.runtimeDigest ? String(item.runtimeDigest) : undefined,
        required: Boolean(item.required),
        sourceUrl: String(item.sourceUrl ?? item.image ?? ""),
        path: String(item.healthEndpoint ?? ""),
        buildCommand: undefined,
        packageArtifacts,
        missingArtifacts,
        status: finalStatus,
        riskLevel: finalStatus === "READY" ? "LOW" : "HIGH",
        rationale: finalStatus === "READY" ? "运行时版本、镜像、Digest、SBOM、许可证、漏洞报告和健康端点已满足生产锁定。" : String(item.blocker ?? "运行时供应链锁定不完整。"),
        recommendedAction: finalStatus === "READY" ? "纳入常规发布门禁。" : `补齐 ${item.name ?? item.id} 的 Digest、SBOM、许可证、漏洞扫描或健康配置。`,
        evaluatedAt: new Date().toISOString()
      };
    });
  }

  computeCostReports(): CostReport[] {
    const runs = this.listRuns();
    const projects = this.listProjects();
    const now = new Date().toISOString();
    return projects.map((project) => {
      const events = runs
        .filter((run) => run.evidenceBundle.projectId === project.id)
        .flatMap((run) => run.evidenceBundle.events);
      const totalCost = events.reduce((sum, event) => sum + eventCost(event), 0);
      const totalTokens = events.reduce((sum, event) => sum + eventTokens(event), 0);
      const highCostEventCount = events.filter((event) => eventCost(event) >= 0.5 || eventTokens(event) >= 8000 || /cost|成本/i.test(`${event.type} ${event.message}`)).length;
      const status: CostReport["status"] = totalCost >= 10 || highCostEventCount >= 5 ? "OVER_BUDGET" : totalCost >= 2 || highCostEventCount > 0 ? "WATCH" : "HEALTHY";
      return {
        projectId: project.id,
        totalCost: Number(totalCost.toFixed(6)),
        totalTokens,
        highCostEventCount,
        status,
        recommendedAction: status === "HEALTHY" ? "保持当前模型路由和预算策略。" : status === "WATCH" ? "把高成本样本纳入评测集，并检查模型路由。" : "冻结自动进化，优先生成成本优化机会点。",
        updatedAt: now
      };
    });
  }

  projectEvolutionFreezeDiagnostic(projectId: string): EvolutionFreezeDiagnostic | undefined {
    const costReport = this.computeCostReports().find((report) => report.projectId === projectId);
    if (costReport?.status !== "OVER_BUDGET") return undefined;
    return {
      projectId,
      costReport,
      reason: `项目 ${projectId} 成本预算已超限：累计成本 ${costReport.totalCost}，Token ${costReport.totalTokens}，高成本事件 ${costReport.highCostEventCount} 次。已冻结普通自动进化，只允许成本优化型进化继续进入代码升级和 CI/CD。`
    };
  }

  computeEvolutionFreezes(): EvolutionFreezeDiagnostic[] {
    return this.listProjects()
      .map((project) => this.projectEvolutionFreezeDiagnostic(project.id))
      .filter((item): item is EvolutionFreezeDiagnostic => item !== undefined);
  }

  computeReleaseReadinessReports(): ReleaseReadinessReport[] {
    const projects = this.listProjects();
    const runs = this.listRuns();
    const codeUpgrades = this.listCodeUpgradeRuns();
    const pipelines = this.listPipelines();
    const sloByProject = new Map(this.computeSloReports().map((report) => [report.projectId, report]));
    const costByProject = new Map(this.computeCostReports().map((report) => [report.projectId, report]));
    const supplyChainBlocked = this.computeSupplyChainReports().some((report) => report.required && report.status !== "READY");
    const now = new Date().toISOString();
    return projects.map((project) => {
      const projectRuns = runs.filter((run) => run.evidenceBundle.projectId === project.id);
      const confirmedReviewCount = projectRuns.flatMap((run) => run.reviews).filter((review) => review.status === "USER_CONFIRMED").length;
      const successfulUpgradeCount = codeUpgrades.filter((upgrade) => upgrade.projectId === project.id && upgrade.status === "SUCCEEDED").length;
      const successfulPipelineCount = pipelines.filter((pipeline) => pipeline.projectId === project.id && pipeline.status === "SUCCEEDED").length;
      const slo = sloByProject.get(project.id);
      const cost = costByProject.get(project.id);
      const gates: ReleaseReadinessReport["gates"] = [
        {
          name: "用户确认",
          status: confirmedReviewCount > 0 ? "PASSED" : projectRuns.length > 0 ? "WARN" : "FAILED",
          detail: confirmedReviewCount > 0 ? `已有 ${confirmedReviewCount} 个确认方案` : "尚无用户确认方案"
        },
        {
          name: "代码升级",
          status: successfulUpgradeCount > 0 ? "PASSED" : codeUpgrades.some((upgrade) => upgrade.projectId === project.id) ? "WARN" : "FAILED",
          detail: successfulUpgradeCount > 0 ? "代码升级已成功" : "尚无成功代码升级"
        },
        {
          name: "CI/CD",
          status: successfulPipelineCount > 0 ? "PASSED" : pipelines.some((pipeline) => pipeline.projectId === project.id) ? "WARN" : "FAILED",
          detail: successfulPipelineCount > 0 ? "流水线已成功" : "尚无成功流水线"
        },
        {
          name: "SLO 错误预算",
          status: slo?.status === "HEALTHY" ? "PASSED" : slo?.status === "BURNING" ? "WARN" : "FAILED",
          detail: `错误预算剩余 ${slo?.errorBudgetRemaining ?? 100}%`
        },
        {
          name: "成本预算",
          status: cost?.status === "HEALTHY" ? "PASSED" : cost?.status === "WATCH" ? "WARN" : "FAILED",
          detail: `成本 ${cost?.totalCost ?? 0}，Token ${cost?.totalTokens ?? 0}`
        },
        {
          name: "运行时供应链",
          status: supplyChainBlocked ? "FAILED" : "PASSED",
          detail: supplyChainBlocked ? "仍有必需运行时未满足供应链锁定" : "必需运行时供应链锁定已通过"
        }
      ];
      const score = Math.round(gates.reduce((sum, gate) => sum + gateScore(gate.status), 0) / gates.length);
      const failedCount = gates.filter((gate) => gate.status === "FAILED").length;
      const warnCount = gates.filter((gate) => gate.status === "WARN").length;
      const status: ReleaseReadinessReport["status"] = failedCount > 0 ? "BLOCKED" : warnCount > 0 ? "NEEDS_APPROVAL" : "READY";
      return {
        projectId: project.id,
        status,
        score,
        recommendedAction: status === "READY" ? "允许进入灰度、A/B 或正式发布。" : status === "NEEDS_APPROVAL" ? "需要负责人确认灰度范围和回滚策略。" : `先修复：${gates.find((gate) => gate.status === "FAILED")?.name ?? "发布门禁"}。`,
        gates,
        evaluatedAt: now
      };
    });
  }

  computeRolloutStrategyReports(): RolloutStrategyReport[] {
    const readiness = this.computeReleaseReadinessReports();
    const sloByProject = new Map(this.computeSloReports().map((report) => [report.projectId, report]));
    const costByProject = new Map(this.computeCostReports().map((report) => [report.projectId, report]));
    const now = new Date().toISOString();
    return readiness.map((report) => {
      const slo = sloByProject.get(report.projectId);
      const cost = costByProject.get(report.projectId);
      const rollbackGate = report.gates.find((gate) => gate.name === "CI/CD")?.status === "PASSED" &&
        report.gates.find((gate) => gate.name === "代码升级")?.status === "PASSED";
      const gates: RolloutStrategyReport["gates"] = [
        {
          name: "发布就绪度",
          status: report.status === "READY" ? "PASSED" : report.status === "NEEDS_APPROVAL" ? "WARN" : "FAILED",
          detail: `发布就绪度 ${report.score}，状态 ${report.status}`
        },
        {
          name: "SLO 灰度窗口",
          status: (slo?.errorBudgetRemaining ?? 100) >= 70 ? "PASSED" : (slo?.errorBudgetRemaining ?? 100) >= 40 ? "WARN" : "FAILED",
          detail: `错误预算剩余 ${slo?.errorBudgetRemaining ?? 100}%`
        },
        {
          name: "成本灰度窗口",
          status: cost?.status === "HEALTHY" ? "PASSED" : cost?.status === "WATCH" ? "WARN" : "FAILED",
          detail: `成本状态 ${cost?.status ?? "HEALTHY"}`
        },
        {
          name: "回滚准备",
          status: rollbackGate ? "PASSED" : "FAILED",
          detail: rollbackGate ? "代码升级和 CI/CD 记录可追溯，可执行回滚。" : "缺少成功代码升级或 CI/CD 记录，不能自动灰度。"
        }
      ];
      const failedCount = gates.filter((gate) => gate.status === "FAILED").length;
      const warnCount = gates.filter((gate) => gate.status === "WARN").length;
      const status: RolloutStrategyReport["status"] = failedCount > 0 ? "BLOCKED" : warnCount > 0 ? "NEEDS_APPROVAL" : "READY";
      const strategy: RolloutStrategyReport["strategy"] = status === "READY" ? "CANARY" : status === "NEEDS_APPROVAL" ? "MANUAL_APPROVAL" : "BLOCKED";
      const canaryPercent = strategy === "CANARY" ? 10 : strategy === "MANUAL_APPROVAL" ? 1 : 0;
      return {
        projectId: report.projectId,
        strategy,
        status,
        canaryPercent,
        rollbackReady: rollbackGate,
        recommendedAction: strategy === "CANARY" ? "从 10% Canary 开始，观察 SLO、成本和用户反馈。" : strategy === "MANUAL_APPROVAL" ? "仅允许 1% 灰度，并要求负责人确认回滚窗口。" : `先修复：${gates.find((gate) => gate.status === "FAILED")?.name ?? "灰度门禁"}。`,
        gates,
        evaluatedAt: now
      };
    });
  }

  listCodeUpgradeRuns(): CodeUpgradeRun[] {
    return fs.readdirSync(this.codeUpgradeRunsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.codeUpgradeRunsDir, file), "utf8")) as CodeUpgradeRun);
  }

  readCodeUpgradeRun(id: string): CodeUpgradeRun | undefined {
    const file = path.join(this.codeUpgradeRunsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8")) as CodeUpgradeRun;
  }

  writeCodeUpgradeRun(run: CodeUpgradeRun): void {
    atomicWriteJson(path.join(this.codeUpgradeRunsDir, `${safeFileName(run.id)}.json`), run);
  }

  findSuccessfulCodeUpgrade(deliveryPlanId: string): CodeUpgradeRun | undefined {
    return this.listCodeUpgradeRuns().find((run) => run.deliveryPlanId === deliveryPlanId && run.status === "SUCCEEDED");
  }

  appendCodeUpgradeEvent(event: CodeUpgradeEvent): void {
    fs.appendFileSync(path.join(this.codeUpgradeEventsDir, `${safeFileName(event.codeUpgradeRunId)}.jsonl`), `${JSON.stringify(event)}\n`);
  }

  writeCodeUpgradeEvents(codeUpgradeRunId: string, events: CodeUpgradeEvent[]): void {
    atomicWriteText(path.join(this.codeUpgradeEventsDir, `${safeFileName(codeUpgradeRunId)}.jsonl`), events.map((event) => JSON.stringify(event)).join("\n") + (events.length > 0 ? "\n" : ""));
  }

  listCodeUpgradeEvents(codeUpgradeRunId: string): CodeUpgradeEvent[] {
    const file = path.join(this.codeUpgradeEventsDir, `${safeFileName(codeUpgradeRunId)}.jsonl`);
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CodeUpgradeEvent);
  }

  writeCodeUpgradeDiff(codeUpgradeRunId: string, diff: string): string {
    const file = path.join(this.codeUpgradeArtifactsDir, `${safeFileName(codeUpgradeRunId)}.diff`);
    atomicWriteText(file, diff);
    return file;
  }

  listSchedules(): ScheduledEvolution[] {
    return fs.readdirSync(this.schedulesDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.schedulesDir, file), "utf8")) as ScheduledEvolution);
  }

  writeSchedule(schedule: ScheduledEvolution): void {
    atomicWriteJson(path.join(this.schedulesDir, `${safeFileName(schedule.id)}.json`), schedule);
  }

  listEvolutionBatches(): EvolutionBatch[] {
    return fs.readdirSync(this.evolutionBatchesDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.evolutionBatchesDir, file), "utf8")) as EvolutionBatch);
  }

  readEvolutionBatch(id: string): EvolutionBatch | undefined {
    const file = path.join(this.evolutionBatchesDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8")) as EvolutionBatch;
  }

  isCostOptimizationDeliveryAllowed(delivery: DeliveryPlan, body: any): boolean {
    const batchId = typeof body?.batchId === "string" ? body.batchId : undefined;
    if (!batchId) return false;
    const batch = this.readEvolutionBatch(batchId);
    return batch?.projectId === delivery.projectId && batch.intent === "cost-optimization";
  }

  writeEvolutionBatch(batch: EvolutionBatch): void {
    atomicWriteJson(path.join(this.evolutionBatchesDir, `${safeFileName(batch.id)}.json`), batch);
  }

  updateEvolutionBatch(id: string, patch: Partial<EvolutionBatch>): EvolutionBatch | undefined {
    const existing = this.readEvolutionBatch(id);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    const updated: EvolutionBatch = {
      ...existing,
      ...definedOnly(patch),
      updatedAt: now
    };
    this.writeEvolutionBatch(updated);
    const cursor = this.readEvolutionCursor(updated.projectId);
    if (updated.status === "SUCCEEDED") {
      this.writeEvolutionCursor({
        ...(cursor ?? defaultEvolutionCursor(updated.projectId)),
        activeBatchId: undefined,
        cooldownUntil: undefined,
        lastSuccessfulEvolutionAt: now,
        updatedAt: now
      });
    } else if (updated.status === "FAILED" || updated.status === "SKIPPED") {
      this.writeEvolutionCursor({
        ...(cursor ?? defaultEvolutionCursor(updated.projectId)),
        activeBatchId: undefined,
        lastFailedEvolutionAt: now,
        updatedAt: now
      });
    } else if (["CONFIRMED", "CODE_UPGRADING", "CICD_RUNNING"].includes(updated.status)) {
      this.writeEvolutionCursor({
        ...(cursor ?? defaultEvolutionCursor(updated.projectId)),
        activeBatchId: updated.id,
        updatedAt: now
      });
    }
    return updated;
  }

  readEvolutionCursor(projectId: string): ProjectEvolutionCursor | undefined {
    const file = path.join(this.evolutionCursorsDir, `${safeFileName(projectId)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8")) as ProjectEvolutionCursor;
  }

  writeEvolutionCursor(cursor: ProjectEvolutionCursor): void {
    atomicWriteJson(path.join(this.evolutionCursorsDir, `${safeFileName(cursor.projectId)}.json`), cursor);
  }

  scanEvolutionBatches(options: {
    projectId?: string;
    maxBatchesPerProject: number;
    maxDatasetsPerBatch: number;
    minDatasetCount: number;
    cooldownMinutes: number;
    activeBatchTimeoutMinutes: number;
    dryRun: boolean;
  }): { created: EvolutionBatch[]; skipped: Array<{ projectId: string; reason: string }>; dryRun: boolean } {
    const now = new Date().toISOString();
    const projects = this.listProjects().filter((project) => !options.projectId || project.id === options.projectId);
    const datasets = this.listEvaluationDatasets();
    const runs = this.listRuns();
    const created: EvolutionBatch[] = [];
    const skipped: Array<{ projectId: string; reason: string }> = [];
    for (const project of projects) {
      const freeze = this.projectEvolutionFreezeDiagnostic(project.id);
      const cursor = this.readEvolutionCursor(project.id) ?? defaultEvolutionCursor(project.id);
      if (cursor.activeBatchId) {
        const active = this.readEvolutionBatch(cursor.activeBatchId);
        if (active && ["CANDIDATE", "DRAFT_READY", "CONFIRMED", "CODE_UPGRADING", "CICD_RUNNING"].includes(active.status)) {
          if (isStaleEvolutionBatch(active, now, options.activeBatchTimeoutMinutes)) {
            const failureReason = `活跃进化批次超过 ${options.activeBatchTimeoutMinutes} 分钟未推进，已自动失败以释放项目进化队列。`;
            if (!options.dryRun) this.updateEvolutionBatch(active.id, { status: "FAILED", failureReason });
            skipped.push({ projectId: project.id, reason: failureReason });
          } else {
            skipped.push({ projectId: project.id, reason: `仍有活跃进化批次 ${active.id}` });
            continue;
          }
        } else if (active) {
          this.writeEvolutionCursor({
            ...cursor,
            activeBatchId: undefined,
            updatedAt: now
          });
        } else {
          this.writeEvolutionCursor({
            ...cursor,
            activeBatchId: undefined,
            updatedAt: now
          });
        }
      }
      if (cursor.cooldownUntil && cursor.cooldownUntil > now) {
        skipped.push({ projectId: project.id, reason: `处于冷却窗口，直到 ${cursor.cooldownUntil}` });
        continue;
      }
      const projectDatasets = datasets
        .filter((dataset) => dataset.projectId === project.id)
        .filter((dataset) => isDatasetAfterCursor(dataset, cursor))
        .filter((dataset) => isActionableEvaluationDataset(dataset, runs))
        .sort((left, right) => batchDatasetRank(right) - batchDatasetRank(left) || left.triggeredAt.localeCompare(right.triggeredAt));
      const candidateDatasets = freeze ? projectDatasets.filter((dataset) => isCostOptimizationDataset(dataset, runs)) : projectDatasets;
      if (freeze && candidateDatasets.length === 0) {
        skipped.push({ projectId: project.id, reason: `${freeze.reason} 当前没有新的成本优化评测集可执行。` });
        continue;
      }
      if (candidateDatasets.length < Math.max(1, options.minDatasetCount)) {
        skipped.push({ projectId: project.id, reason: `新增${freeze ? "成本优化" : ""}评测集数量不足：${candidateDatasets.length}` });
        continue;
      }
      const existingDatasetIds = new Set(this.listEvolutionBatches().filter((batch) => batch.projectId === project.id).flatMap((batch) => batch.datasetIds));
      const freshDatasets = candidateDatasets.filter((dataset) => !existingDatasetIds.has(dataset.id));
      if (freshDatasets.length < Math.max(1, options.minDatasetCount)) {
        skipped.push({ projectId: project.id, reason: `新增${freeze ? "成本优化" : ""}评测集已被进化批次消费` });
        continue;
      }
      for (const group of groupDatasetsForBatches(freshDatasets, options.maxDatasetsPerBatch).slice(0, Math.max(1, options.maxBatchesPerProject))) {
        const batch = createEvolutionBatchFromDatasets(project.id, group, runs, now);
        created.push(batch);
        if (!options.dryRun) {
          this.writeEvolutionBatch(batch);
          this.writeEvolutionCursor({
            projectId: project.id,
            lastProcessedDatasetTriggeredAt: batch.watermarks.datasetTriggeredAt,
            lastProcessedDatasetIds: batch.datasetIds,
            cooldownUntil: new Date(Date.now() + Math.max(0, options.cooldownMinutes) * 60 * 1000).toISOString(),
            activeBatchId: batch.id,
            lastSuccessfulEvolutionAt: cursor.lastSuccessfulEvolutionAt,
            lastFailedEvolutionAt: cursor.lastFailedEvolutionAt,
            updatedAt: now
          });
        }
      }
    }
    return { created, skipped, dryRun: options.dryRun };
  }

  ensureRuleMemories(rules: EvolutionTriggerRule[]): void {
    for (const rule of rules) {
      const file = this.ruleFile(rule.id);
      if (!fs.existsSync(file)) atomicWriteText(file, renderRuleMemoryMarkdown(rule));
    }
  }

  writeRuleMemory(memory: RuleMemory): void {
    atomicWriteText(this.ruleFile(memory.id), renderRuleMemoryMarkdown(memory.compiledRule, memory.llmTrace));
  }

  listSoakReports(): SoakReport[] {
    return fs.readdirSync(this.soakReportsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.soakReportsDir, file), "utf8")) as SoakReport);
  }

  writeSoakReport(input: Partial<SoakReport> & { name?: string; durationSeconds?: number; status?: SoakReport["status"] }): SoakReport {
    const now = new Date().toISOString();
    const id = safeFileName(String(input.id ?? `soak-${Date.now()}`));
    const previous = this.readSoakReport(id);
    const report: SoakReport = {
      id,
      name: String(input.name ?? previous?.name ?? "生产级持续验证"),
      durationSeconds: Number(input.durationSeconds ?? previous?.durationSeconds ?? 0),
      status: input.status ?? previous?.status ?? "RUNNING",
      startedAt: String(input.startedAt ?? previous?.startedAt ?? now),
      finishedAt: input.finishedAt ?? previous?.finishedAt,
      summary: input.summary ?? previous?.summary,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };
    atomicWriteJson(path.join(this.soakReportsDir, `${id}.json`), report);
    return report;
  }

  readSoakReport(id: string): SoakReport | undefined {
    const file = path.join(this.soakReportsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8")) as SoakReport;
  }

  listReleaseEvidenceBundles(): ReleaseEvidenceBundle[] {
    return fs.readdirSync(this.releaseEvidenceDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => this.hydrateReleaseEvidenceBundle(JSON.parse(fs.readFileSync(path.join(this.releaseEvidenceDir, file), "utf8"))));
  }

  listReleaseEvidenceSummaries(): ReleaseEvidenceListItem[] {
    return this.listReleaseEvidenceBundles().map((bundle) => releaseEvidenceListItem(bundle));
  }

  readReleaseEvidenceBundle(id: string): ReleaseEvidenceBundle | undefined {
    const file = path.join(this.releaseEvidenceDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return this.hydrateReleaseEvidenceBundle(JSON.parse(fs.readFileSync(file, "utf8")));
  }

  writeReleaseEvidenceBundle(bundle: ReleaseEvidenceBundle): ReleaseEvidenceBundle {
    const hydrated = this.hydrateReleaseEvidenceBundle(bundle);
    atomicWriteJson(path.join(this.releaseEvidenceDir, `${safeFileName(hydrated.id)}.json`), hydrated);
    return hydrated;
  }

  private hydrateReleaseEvidenceBundle(bundle: any): ReleaseEvidenceBundle {
    return {
      ...bundle,
      tenantId: safeFileName(String(bundle.tenantId ?? DEFAULT_TENANT_ID)),
      workspaceId: safeFileName(String(bundle.workspaceId ?? DEFAULT_WORKSPACE_ID)),
      projectId: bundle.projectId ? safeFileName(String(bundle.projectId)) : undefined
    } as ReleaseEvidenceBundle;
  }

  listReleaseTargets(): ReleaseTargetProfile[] {
    const persisted = fs.readdirSync(this.releaseTargetsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.releaseTargetsDir, file), "utf8")) as ReleaseTargetProfile);
    const builtIns = defaultReleaseTargets();
    const persistedIds = new Set(persisted.map((target) => target.id));
    return [...builtIns.filter((target) => !persistedIds.has(target.id)), ...persisted];
  }

  readReleaseTarget(id: string): ReleaseTargetProfile | undefined {
    const safeId = safeFileName(id);
    const file = path.join(this.releaseTargetsDir, `${safeId}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as ReleaseTargetProfile;
    return defaultReleaseTargets().find((target) => target.id === safeId);
  }

  writeReleaseTarget(target: ReleaseTargetProfile): ReleaseTargetProfile {
    atomicWriteJson(path.join(this.releaseTargetsDir, `${safeFileName(target.id)}.json`), target);
    return target;
  }

  listReleaseDecisions(): ReleaseDecision[] {
    return fs.readdirSync(this.releaseDecisionsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => this.hydrateReleaseDecision(JSON.parse(fs.readFileSync(path.join(this.releaseDecisionsDir, file), "utf8"))))
      .sort((left, right) => Date.parse(left.generatedAt) - Date.parse(right.generatedAt));
  }

  readReleaseDecision(id: string): ReleaseDecision | undefined {
    const file = path.join(this.releaseDecisionsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return this.hydrateReleaseDecision(JSON.parse(fs.readFileSync(file, "utf8")));
  }

  writeReleaseDecision(decision: ReleaseDecision): ReleaseDecision {
    const hydrated = this.hydrateReleaseDecision(decision);
    atomicWriteJson(path.join(this.releaseDecisionsDir, `${safeFileName(hydrated.id)}.json`), hydrated);
    return hydrated;
  }

  private hydrateReleaseDecision(decision: any): ReleaseDecision {
    return {
      ...decision,
      tenantId: safeFileName(String(decision.tenantId ?? DEFAULT_TENANT_ID)),
      workspaceId: safeFileName(String(decision.workspaceId ?? DEFAULT_WORKSPACE_ID)),
      projectId: decision.projectId ? safeFileName(String(decision.projectId)) : undefined
    } as ReleaseDecision;
  }

  listGoals(): GlobalGoal[] {
    return fs.readdirSync(this.goalsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => this.hydrateGoal(JSON.parse(fs.readFileSync(path.join(this.goalsDir, file), "utf8"))))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  }

  readGoal(id: string): GlobalGoal | undefined {
    const file = path.join(this.goalsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return this.hydrateGoal(JSON.parse(fs.readFileSync(file, "utf8")), { project: false });
  }

  writeGoal(goal: GlobalGoal): GlobalGoal {
    const normalized = this.hydrateGoal(goal, { project: false });
    atomicWriteJson(path.join(this.goalsDir, `${safeFileName(normalized.id)}.json`), normalized);
    return this.hydrateGoal(normalized);
  }

  createGoal(input: {
    id?: string;
    projectId?: string;
    releaseTargetId?: string;
    objective: string;
    tenantId?: string;
    workspaceId?: string;
    llm?: LoopLlmSelection;
  }): GlobalGoal {
    const now = new Date().toISOString();
    const projectId = safeFileName(String(input.projectId ?? "evopilot"));
    const project = this.readProject(projectId);
    const releaseTargetId = safeFileName(String(input.releaseTargetId ?? "ga"));
    const id = safeFileName(input.id ?? `goal-${projectId}-${releaseTargetId}-${Date.now()}`);
    const tenantId = safeFileName(String(input.tenantId ?? project?.tenantId ?? DEFAULT_TENANT_ID));
    const workspaceId = safeFileName(String(input.workspaceId ?? project?.workspaceId ?? DEFAULT_WORKSPACE_ID));
    return this.writeGoal({
      schema: "evopilot-global-goal/v1",
      id,
      tenantId,
      workspaceId,
      projectId,
      releaseTargetId,
      objective: input.objective,
      terminalMaturity: "ga",
      maturityStandardSetId: DEFAULT_MATURITY_STANDARD_SET_ID,
      llm: input.llm,
      status: "DRAFT",
      plan: emptyGoalPlan(),
      timeline: [goalTimelineEvent("CREATED", `Global goal ${id} created.`, { projectId, releaseTargetId, objective: input.objective, llmProfileId: input.llm?.profileId, llmProvider: input.llm?.provider, llmModel: input.llm?.model })],
      createdAt: now,
      updatedAt: now
    });
  }

  async generateGoalPlan(goalId: string, actor: string, options: { force?: boolean } = {}): Promise<GlobalGoal | undefined> {
    const goal = this.readGoal(goalId);
    if (!goal) return undefined;
    if (goal.plan.status === "APPROVED" && !options.force) {
      throw httpError(409, "GOAL_PLAN_ALREADY_APPROVED", "Approved goal plans cannot be regenerated without force.");
    }
    const now = new Date().toISOString();
    const releaseTarget = this.readReleaseTarget(goal.releaseTargetId) ?? defaultGAReleaseTarget();
    const planned = await generateGoalPlanTargets(this, goal, releaseTarget, actor, now);
    const targets = planned.targets;
    const phaseTargets = phaseTargetsFromGoalTargets(goal.id, targets, now);
    return this.writeGoal({
      ...goal,
      status: "PLANNED",
      plan: {
        schema: "evopilot-goal-plan/v1",
        status: "PENDING_APPROVAL",
        decompositionStrategy: "ga-maturity-ladder",
        terminalMaturity: "ga",
        maturityStandardSetId: DEFAULT_MATURITY_STANDARD_SET_ID,
        standardVersion: DEFAULT_MATURITY_STANDARD_VERSION,
        planner: planned.planner,
        selectedHarness: planned.selectedHarness,
        summary: `${goal.objective} decomposed into Alpha -> Beta -> RC -> GA maturity phases with ${targets.length} white-box GoalTargets for ${releaseTarget.name}.`,
        targetCount: targets.length,
        requiredTargetCount: targets.filter((target) => target.required).length,
        phaseTargets,
        targets,
        editablePlan: editablePlanPolicy(),
        generatedAt: now
      },
      timeline: [
        ...goal.timeline,
        goalTimelineEvent("PLAN_GENERATED", `Goal plan generated by ${actor}.`, {
          targetCount: targets.length,
          phases: MATURITY_PHASES,
          terminalMaturity: "ga",
          releaseTargetId: goal.releaseTargetId,
          strategy: "ga-maturity-ladder",
          plannerMode: planned.planner.mode,
          selectedHarnessId: planned.selectedHarness?.harnessId,
          selectedHarnessVersion: planned.selectedHarness?.version,
          selectedHarnessDigest: planned.selectedHarness?.entryDigest,
          llmProvider: planned.planner.provider,
          llmModel: planned.planner.model,
          llmTokens: planned.planner.totalTokens
        })
      ],
      updatedAt: now
    });
  }

  approveGoalPlan(goalId: string, actor: string, confirmation: GoalPlanApprovalConfirmation): GlobalGoal | undefined {
    const goal = this.readGoal(goalId);
    if (!goal) return undefined;
    if (goal.plan.status === "MISSING" || goal.plan.targets.length === 0) {
      throw httpError(409, "GOAL_PLAN_REQUIRED", "Generate a goal plan before approval.");
    }
    const now = new Date().toISOString();
    return this.writeGoal({
      ...goal,
      status: "APPROVED",
      plan: {
        ...goal.plan,
        status: "APPROVED",
        editablePlan: {
          ...(goal.plan.editablePlan ?? editablePlanPolicy()),
          status: "APPROVED",
          nextAction: "start-target"
        },
        approvedAt: now,
        approvedBy: actor,
        confirmation
      },
      timeline: [
        ...goal.timeline,
        goalTimelineEvent("PLAN_APPROVED", `Goal plan approved by ${actor}.`, {
          targetCount: goal.plan.targets.length,
          requiredTargetCount: goal.plan.targets.filter((target) => target.required).length,
          confirmedBy: confirmation.confirmedBy
        })
      ],
      updatedAt: now
    });
  }

  applyGoalPlan(goalId: string, actor: string, input: unknown): GlobalGoal | undefined {
    const goal = this.readGoal(goalId);
    if (!goal) return undefined;
    if (goal.status === "RUNNING" || goal.status === "WAITING_HUMAN" || goal.status === "COMPLETED") {
      throw httpError(409, "GOAL_PLAN_LOCKED", "A running or completed goal plan cannot be replaced.");
    }
    const now = new Date().toISOString();
    const plan = normalizeAppliedGoalPlan(input, goal, now);
    return this.writeGoal({
      ...goal,
      status: "PLANNED",
      plan,
      timeline: [
        ...goal.timeline,
        goalTimelineEvent("PLAN_UPDATED", `Goal plan updated by ${actor}; user confirmation is required before execution.`, {
          targetCount: plan.targets.length,
          phases: plan.phaseTargets.map((phase) => phase.phase),
          baselineEnforced: true
        })
      ],
      updatedAt: now
    });
  }

  async advanceGoal(goalId: string, actor: string, input: { autoStart?: boolean; approveHumanGate?: boolean; forceDecision?: LoopDecision } = {}): Promise<GoalAdvanceResult | undefined> {
    let goal = this.readGoal(goalId);
    if (!goal) return undefined;
    const stages: GoalAdvanceResult["stages"] = [];
    const evidence: string[] = [`goal=${goal.id}`, `project=${goal.projectId}`, `releaseTarget=${goal.releaseTargetId}`];
    const pushStage = (stage: GoalAdvanceResult["stages"][number]) => {
      stages.push(stage);
      evidence.push(`stage.${stage.id}=${stage.status}`, ...stage.evidence);
    };

    if (goal.plan.status !== "APPROVED") {
      pushStage({
        id: "plan-check",
        status: "BLOCKED",
        detail: "Goal plan is not approved.",
        evidence: [`planStatus=${goal.plan.status}`, "nextAction=approve-plan"]
      });
      const snapshot = buildGoalSnapshot(this, goal);
      return finalizeGoalAdvance({ status: snapshot.status, goal: snapshot.goal, snapshot, stages, evidence, nextAction: snapshot.nextAction });
    }
    pushStage({
      id: "plan-check",
      status: "SUCCEEDED",
      detail: "Goal plan is approved.",
      evidence: [`targets=${goal.plan.targets.length}`]
    });

    const project = this.readProject(goal.projectId);
    const sourceReadiness = project ? await checkSourceCredentialReadiness(project, this) : undefined;
    pushStage({
      id: "enterprise-source-preflight",
      status: sourceReadiness?.status === "READY" ? "SUCCEEDED" : "BLOCKED",
      detail: "Enterprise real loop source writeback preflight.",
      evidence: sourceReadiness ? [`status=${sourceReadiness.status}`, ...sourceReadiness.blockers] : [`project=${goal.projectId}`, "project=missing"]
    });
    if (!project || sourceReadiness?.status !== "READY") {
      const snapshot = buildGoalSnapshot(this, goal);
      return finalizeGoalAdvance({
        status: "BLOCKED",
        goal: snapshot.goal,
        snapshot,
        stages,
        evidence,
        nextAction: sourceReadinessGoalNextAction(project ? sourceReadiness?.nextAction : "repair-project")
      });
    }

    if (project.repository?.provider === "github" || project.repository?.provider === "gitlab") {
      const devopsReadiness = await checkProjectDevopsReadiness(project, this);
      pushStage({
        id: "enterprise-devops-preflight",
        status: devopsReadiness.status === "READY" ? "SUCCEEDED" : "BLOCKED",
        detail: "Enterprise real loop repository-native DevOps preflight.",
        evidence: [`status=${devopsReadiness.status}`, `executionMode=${devopsReadiness.executionMode}`, `devopsOwner=${devopsReadiness.devopsOwner ?? "missing"}`, `claimBoundary=${devopsReadiness.claimBoundary}`, ...devopsReadiness.blockers]
      });
      if (devopsReadiness.status !== "READY") {
        const snapshot = buildGoalSnapshot(this, goal);
        return finalizeGoalAdvance({
          status: "BLOCKED",
          goal: snapshot.goal,
          snapshot,
          stages,
          evidence,
          nextAction: devopsReadinessGoalNextAction(devopsReadiness.nextAction)
        });
      }
    } else {
      pushStage({
        id: "enterprise-devops-preflight",
        status: "SKIPPED",
        detail: "Local Git project does not use repository-native GitHub/GitLab DevOps.",
        evidence: [`provider=${project.repository?.provider ?? "missing"}`]
      });
    }

    const llmResolution = resolveLoopLlmSelection(this, {
      project,
      tenantId: goal.tenantId,
      workspaceId: goal.workspaceId,
      requestedProfileId: goal.llm?.profileId,
      requireLlm: true
    });
    const llmReadiness = llmResolution.readiness;
    const explicitLlmProfileRequired = project.repository?.provider === "github" || project.repository?.provider === "gitlab";
    const explicitLlmProfileMissing = explicitLlmProfileRequired && !llmResolution.selection.profileId;
    pushStage({
      id: "enterprise-llm-preflight",
      status: llmReadiness.status === "READY" && !explicitLlmProfileMissing ? "SUCCEEDED" : "BLOCKED",
      detail: "Enterprise real loop LLM profile preflight.",
      evidence: [
        `status=${llmReadiness.status}`,
        `source=${llmResolution.selection.source}`,
        `profileId=${llmResolution.selection.profileId ?? "missing"}`,
        `provider=${llmReadiness.provider ?? "missing"}`,
        `model=${llmReadiness.model ?? "missing"}`,
        ...(explicitLlmProfileMissing ? ["llm-profile=missing", "remote-enterprise-loop-requires-explicit-project-or-run-llm-profile"] : []),
        ...llmReadiness.blockers
      ]
    });
    if (llmReadiness.status !== "READY" || explicitLlmProfileMissing) {
      const snapshot = buildGoalSnapshot(this, goal);
      return finalizeGoalAdvance({
        status: "BLOCKED",
        goal: snapshot.goal,
        snapshot,
        stages,
        evidence,
        nextAction: explicitLlmProfileMissing ? "configure-llm-profile" : llmReadinessGoalNextAction(llmReadiness.nextAction)
      });
    }

    let snapshot = buildGoalSnapshot(this, goal);
    if (snapshot.status === "COMPLETED") {
      const finalReport = this.ensureGoalCompletionReport(goal.id, actor);
      goal = this.readGoal(goal.id) ?? goal;
      snapshot = buildGoalSnapshot(this, goal);
      pushStage({
        id: "final-report",
        status: "SUCCEEDED",
        detail: "Goal completion report is available.",
        evidence: [`finalReport=${finalReport?.schema ?? "missing"}`]
      });
      return finalizeGoalAdvance({ status: snapshot.status, goal: snapshot.goal, snapshot, finalReport, stages, evidence, nextAction: "view-final-report" });
    }

    const target = snapshot.activeTarget;
    if (!target) {
      pushStage({
        id: "target-select",
        status: "SKIPPED",
        detail: "No active target is available.",
        evidence: ["activeTarget=none"]
      });
      return finalizeGoalAdvance({ status: snapshot.status, goal: snapshot.goal, snapshot, stages, evidence, nextAction: snapshot.nextAction });
    }
    pushStage({
      id: "target-select",
      status: "SUCCEEDED",
      detail: `Selected target ${target.id}.`,
      evidence: [`target=${target.id}`, `targetStatus=${target.status}`, `targetNextAction=${target.nextAction}`]
    });

    let loop = target.loopId ? this.readLoop(target.loopId) : undefined;
    if (!loop && (target.status === "READY" || target.status === "PENDING")) {
      loop = this.createGoalTargetLoop(goal, target, actor);
      goal = this.bindGoalTargetLoop(goal.id, target.id, loop.id, actor) ?? goal;
      pushStage({
        id: "loop-bind",
        status: "SUCCEEDED",
        detail: `Created LoopRun ${loop.id} for GoalTarget ${target.id}.`,
        evidence: [`loop=${loop.id}`, `target=${target.id}`]
      });
    } else {
      pushStage({
        id: "loop-bind",
        status: loop ? "SKIPPED" : "BLOCKED",
        detail: loop ? `Target already bound to LoopRun ${loop.id}.` : "Target is not ready to bind.",
        evidence: [loop ? `loop=${loop.id}` : `targetStatus=${target.status}`]
      });
    }

    if (!loop) {
      snapshot = this.goalSnapshot(goal.id) ?? snapshot;
      return finalizeGoalAdvance({ status: snapshot.status, goal: snapshot.goal, snapshot, target, stages, evidence, nextAction: snapshot.nextAction });
    }

    if (input.autoStart === false) {
      snapshot = this.goalSnapshot(goal.id) ?? snapshot;
      pushStage({
        id: "loop-iterate",
        status: "SKIPPED",
        detail: "Loop iteration skipped by request.",
        evidence: ["autoStart=false"]
      });
      return finalizeGoalAdvance({ status: snapshot.status, goal: snapshot.goal, snapshot, target: snapshot.activeTarget ?? target, loop, stages, evidence, nextAction: snapshot.nextAction });
    }

    if (loop.status === "WAITING_APPROVAL" && input.approveHumanGate !== true) {
      pushStage({
        id: "human-gate",
        status: "BLOCKED",
        detail: "Loop is waiting for human approval.",
        evidence: [`loop=${loop.id}`, "approveHumanGate=false"]
      });
      snapshot = this.goalSnapshot(goal.id) ?? snapshot;
      return finalizeGoalAdvance({ status: snapshot.status, goal: snapshot.goal, snapshot, target: snapshot.activeTarget ?? target, loop, stages, evidence, nextAction: "human-approval" });
    }

    if (loop.status === "WAITING_APPROVAL" && input.approveHumanGate === true) {
      loop = this.approveLoop(loop.id, actor) ?? loop;
      pushStage({
        id: "human-gate",
        status: "SUCCEEDED",
        detail: "Human gate approved for goal advance.",
        evidence: [`loop=${loop.id}`, `approvedBy=${actor}`]
      });
    }

    if (loop.status === "PENDING") {
      loop = await this.startLoop(loop.id, actor, { forceDecision: input.forceDecision, evidence: [`globalGoal=${goal.id}`, `goalTarget=${target.id}`] }) ?? loop;
    } else if (loop.status === "RUNNING" || loop.status === "BLOCKED") {
      loop = await this.resumeLoop(loop.id, actor, { forceDecision: input.forceDecision, evidence: [`globalGoal=${goal.id}`, `goalTarget=${target.id}`] }) ?? loop;
    }
    pushStage({
      id: "loop-iterate",
      status: "SUCCEEDED",
      detail: `Loop ${loop.id} advanced to ${loop.status}.`,
      evidence: [`loop=${loop.id}`, `loopStatus=${loop.status}`, `iteration=${loop.currentIteration}`]
    });

    goal = this.touchGoalTarget(goal.id, target.id, actor) ?? goal;
    snapshot = this.goalSnapshot(goal.id) ?? buildGoalSnapshot(this, goal);
    return finalizeGoalAdvance({ status: snapshot.status, goal: snapshot.goal, snapshot, target: snapshot.activeTarget ?? target, loop, stages, evidence, nextAction: snapshot.nextAction });
  }

  createGoalTargetLoop(goal: GlobalGoal, target: GoalTarget, actor: string): LoopRun {
    const project = this.readProject(goal.projectId);
    const graph = this.writeExecutorGraph(selfEvolutionExecutorGraph());
    const llmResolution = goal.llm
      ? { selection: goal.llm }
      : resolveLoopLlmSelection(this, { project, tenantId: goal.tenantId, workspaceId: goal.workspaceId, requireLlm: this.requireLlm() });
    return this.createLoop({
      id: `goal-${goal.id}-${target.id}-${Date.now()}`,
      source: "api",
      projectId: goal.projectId,
      tenantId: goal.tenantId,
      workspaceId: goal.workspaceId,
      objective: target.title,
      executorGraphId: graph.id,
      sourceClosure: {
        sourceProjectId: goal.projectId,
        repositoryProvider: project?.repository?.provider ?? "unknown",
        sourceBranch: project?.repository?.defaultBranch ?? "main",
        targetVersion: target.targetVersion ?? `${goal.releaseTargetId}-${target.id}`,
        deploymentEnvironment: "production",
        requiredGates: ["code-change", "push", "deploy", "health-ready"]
      },
      sandbox: {
        runtime: "docker",
        network: "restricted",
        credentialScope: "loop",
        allowedPaths: ["packages", "apps", "docs", "tests", "scripts"],
        deniedPaths: [".env", ".env.*", ".git", "node_modules"]
      },
      stopPolicy: {
        maxIterations: 4,
        maxDurationSeconds: 24 * 60 * 60,
        requireApprovalForRelease: true,
        stopOnRepeatedFailure: 2
      },
      retryPolicy: {
        maxAttemptsPerNode: 2,
        backoffSeconds: 5,
        circuitBreakerFailures: 2
      },
      context: {
        globalGoalId: goal.id,
        goalTargetId: target.id,
        maturityPhase: target.phase,
        maturityStandardId: target.standardId,
        goalObjective: goal.objective,
        releaseTargetId: goal.releaseTargetId,
        acceptanceCriteria: target.acceptanceCriteria,
        requiredEvidence: target.requiredEvidence,
        reviewCapabilities: target.reviewCapabilities,
        dashboardGoalCockpit: true,
        createdBy: actor
      },
      llm: llmResolution.selection
    });
  }

  bindGoalTargetLoop(goalId: string, targetId: string, loopId: string, actor: string): GlobalGoal | undefined {
    const goal = this.readGoal(goalId);
    if (!goal) return undefined;
    const now = new Date().toISOString();
    return this.writeGoal({
      ...goal,
      status: "RUNNING",
      plan: {
        ...goal.plan,
        targets: goal.plan.targets.map((target) => target.id === targetId ? {
          ...target,
          loopId,
          status: "RUNNING",
          nextAction: "resume-loop",
          evidence: [...target.evidence, `loop=${loopId}`, `boundBy=${actor}`],
          updatedAt: now
        } : target)
      },
      timeline: [
        ...goal.timeline,
        goalTimelineEvent("LOOP_BOUND", `GoalTarget ${targetId} bound to LoopRun ${loopId}.`, { actor }, targetId, loopId)
      ],
      updatedAt: now
    });
  }

  touchGoalTarget(goalId: string, targetId: string, actor: string): GlobalGoal | undefined {
    const goal = this.readGoal(goalId);
    if (!goal) return undefined;
    const now = new Date().toISOString();
    return this.writeGoal({
      ...goal,
      plan: {
        ...goal.plan,
        targets: goal.plan.targets.map((target) => target.id === targetId ? {
          ...target,
          evidence: [...target.evidence, `advancedBy=${actor}`],
          updatedAt: now
        } : target)
      },
      timeline: [
        ...goal.timeline,
        goalTimelineEvent("TARGET_ADVANCED", `GoalTarget ${targetId} advanced by ${actor}.`, { actor }, targetId, goal.plan.targets.find((target) => target.id === targetId)?.loopId)
      ],
      updatedAt: now
    });
  }

  ensureGoalCompletionReport(goalId: string, actor: string): GoalCompletionReport | undefined {
    const goal = this.readGoal(goalId);
    if (!goal) return undefined;
    if (goal.finalReport) return goal.finalReport;
    const snapshot = buildGoalSnapshot(this, goal);
    if (snapshot.status !== "COMPLETED") return undefined;
    const report = buildGoalCompletionReport(snapshot, actor);
    const now = new Date().toISOString();
    this.writeGoal({
      ...snapshot.goal,
      status: "COMPLETED",
      finalReport: report,
      timeline: [
        ...snapshot.goal.timeline,
        goalTimelineEvent("REPORT_GENERATED", `Goal completion report generated by ${actor}.`, { status: report.status, targetSummary: report.targetSummary })
      ],
      updatedAt: now
    });
    return report;
  }

  goalSnapshot(goalId: string): GoalSnapshot | undefined {
    const goal = this.readGoal(goalId);
    if (!goal) return undefined;
    return buildGoalSnapshot(this, goal);
  }

  goalGraph(goalId: string): GoalGraph | undefined {
    const snapshot = this.goalSnapshot(goalId);
    if (!snapshot) return undefined;
    const nodes = snapshot.goal.plan.targets.map((target) => ({ ...target, active: snapshot.activeTarget?.id === target.id }));
    const edges = snapshot.goal.plan.targets.flatMap((target) =>
      target.dependencyIds.map((dependency) => ({ from: dependency, to: target.id, type: "depends-on" as const }))
    );
    return {
      schema: "evopilot-goal-graph/v1",
      goalId,
      nodes,
      edges,
      nextAction: snapshot.nextAction
    };
  }

  goalRunStatus(goalId: string): GoalRunStatus | undefined {
    const snapshot = this.goalSnapshot(goalId);
    if (!snapshot) return undefined;
    const graph = this.goalGraph(goalId);
    const evidenceMatrix = this.goalEvidenceMatrix(goalId);
    if (!graph || !evidenceMatrix) return undefined;
    const latestLoop = snapshot.activeTarget?.loopId ? this.readLoop(snapshot.activeTarget.loopId) : undefined;
    const goalLoops = snapshot.goal.plan.targets
      .map((target) => target.loopId ? this.readLoop(target.loopId) : undefined)
      .filter((loop): loop is LoopRun => Boolean(loop));
    return {
      schema: "evopilot-goal-run-status/v1",
      scope: {
        tenantId: snapshot.goal.tenantId,
        workspaceId: snapshot.goal.workspaceId
      },
      goal: snapshot.goal,
      status: snapshot.status,
      nextAction: snapshot.nextAction,
      snapshot,
      graph,
      timeline: snapshot.goal.timeline,
      evidenceMatrix,
      activeTarget: snapshot.activeTarget,
      latestLoop,
      releaseDecision: snapshot.releaseDecision,
      finalReport: snapshot.goal.finalReport,
      phasePackages: buildPhasePackages(snapshot.goal, (id) => this.readLoop(id)),
      targetPackages: buildTargetEvidencePackages(snapshot.goal, (id) => this.readLoop(id)),
      llmUsage: buildGoalLlmUsageSummary(snapshot.goal, goalLoops),
      chain: buildGoalRunStatusChain(this, snapshot, latestLoop),
      blockers: snapshot.blockers,
      updatedAt: new Date().toISOString()
    };
  }

  goalEvidenceMatrix(goalId: string): GoalEvidenceMatrixRow[] | undefined {
    const snapshot = this.goalSnapshot(goalId);
    if (!snapshot) return undefined;
    return buildGoalEvidenceMatrix(snapshot.goal);
  }

  private hydrateGoal(goal: any, options: { project?: boolean } = {}): GlobalGoal {
    const projectId = safeFileName(String(goal.projectId ?? "evopilot"));
    const project = this.readProject(projectId);
    const releaseTargetId = safeFileName(String(goal.releaseTargetId ?? "ga"));
    const tenantId = safeFileName(String(goal.tenantId ?? project?.tenantId ?? DEFAULT_TENANT_ID));
    const workspaceId = safeFileName(String(goal.workspaceId ?? project?.workspaceId ?? DEFAULT_WORKSPACE_ID));
    const plan = hydrateGoalPlan(goal.plan, safeFileName(String(goal.id ?? `goal-${projectId}-${releaseTargetId}`)), projectId, releaseTargetId);
    const hydrated: GlobalGoal = {
      ...goal,
      schema: "evopilot-global-goal/v1",
      id: safeFileName(String(goal.id ?? `goal-${projectId}-${releaseTargetId}-${Date.now()}`)),
      tenantId,
      workspaceId,
      projectId,
      releaseTargetId,
      objective: String(goal.objective ?? `${projectId} reaches ${releaseTargetId.toUpperCase()}.`),
      terminalMaturity: "ga",
      maturityStandardSetId: optionalTrimmedString(goal.maturityStandardSetId) ?? DEFAULT_MATURITY_STANDARD_SET_ID,
      llm: hydrateLoopLlmSelection(goal.llm),
      status: normalizeGlobalGoalStatus(goal.status),
      plan,
      finalReport: isRecord(goal.finalReport) ? goal.finalReport as GoalCompletionReport : undefined,
      timeline: Array.isArray(goal.timeline) ? goal.timeline.map((event: any) => hydrateGoalTimelineEvent(event)) : [],
      createdAt: String(goal.createdAt ?? new Date().toISOString()),
      updatedAt: String(goal.updatedAt ?? goal.createdAt ?? new Date().toISOString())
    };
    if (options.project === false) return hydrated;
    const snapshot = buildGoalSnapshot(this, hydrated);
    return {
      ...hydrated,
      status: snapshot.status,
      plan: snapshot.goal.plan
    };
  }

  listSourceReleaseClosureRuns(loopId?: string): SourceReleaseClosureRun[] {
    const runs = fs.readdirSync(this.sourceReleaseRunsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => this.hydrateSourceReleaseClosureRun(JSON.parse(fs.readFileSync(path.join(this.sourceReleaseRunsDir, file), "utf8"))))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    return loopId ? runs.filter((run) => run.loopId === loopId) : runs;
  }

  readSourceReleaseClosureRun(id: string): SourceReleaseClosureRun | undefined {
    const file = path.join(this.sourceReleaseRunsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return this.hydrateSourceReleaseClosureRun(JSON.parse(fs.readFileSync(file, "utf8")));
  }

  writeSourceReleaseClosureRun(run: SourceReleaseClosureRun): SourceReleaseClosureRun {
    const hydrated = this.hydrateSourceReleaseClosureRun(run);
    atomicWriteJson(path.join(this.sourceReleaseRunsDir, `${safeFileName(hydrated.id)}.json`), hydrated);
    return hydrated;
  }

  private hydrateSourceReleaseClosureRun(run: any): SourceReleaseClosureRun {
    const loop = run.loopId ? this.readLoop(String(run.loopId)) : undefined;
    const project = run.projectId ? this.readProject(String(run.projectId)) : undefined;
    return {
      ...run,
      tenantId: safeFileName(String(run.tenantId ?? loop?.tenantId ?? project?.tenantId ?? DEFAULT_TENANT_ID)),
      workspaceId: safeFileName(String(run.workspaceId ?? loop?.workspaceId ?? project?.workspaceId ?? DEFAULT_WORKSPACE_ID))
    } as SourceReleaseClosureRun;
  }

  listSourceReleaseDeployFinalizers(status?: SourceReleaseDeployFinalizer["status"]): SourceReleaseDeployFinalizer[] {
    const finalizers = fs.readdirSync(this.sourceReleaseDeployFinalizersDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.sourceReleaseDeployFinalizersDir, file), "utf8")) as SourceReleaseDeployFinalizer)
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    return status ? finalizers.filter((finalizer) => finalizer.status === status) : finalizers;
  }

  readSourceReleaseDeployFinalizer(id: string): SourceReleaseDeployFinalizer | undefined {
    const file = path.join(this.sourceReleaseDeployFinalizersDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8")) as SourceReleaseDeployFinalizer;
  }

  writeSourceReleaseDeployFinalizer(finalizer: SourceReleaseDeployFinalizer): SourceReleaseDeployFinalizer {
    atomicWriteJson(path.join(this.sourceReleaseDeployFinalizersDir, `${safeFileName(finalizer.id)}.json`), finalizer);
    return finalizer;
  }

  listTargetLoops(): TargetLoopRun[] {
    return fs.readdirSync(this.targetLoopsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.targetLoopsDir, file), "utf8")) as TargetLoopRun)
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  }

  readTargetLoop(id: string): TargetLoopRun | undefined {
    const file = path.join(this.targetLoopsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8")) as TargetLoopRun;
  }

  writeTargetLoop(loop: TargetLoopRun): TargetLoopRun {
    atomicWriteJson(path.join(this.targetLoopsDir, `${safeFileName(loop.id)}.json`), loop);
    return loop;
  }

  listExecutorGraphs(): ExecutorGraph[] {
    const persisted = fs.readdirSync(this.executorGraphsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => normalizeExecutorGraph(JSON.parse(fs.readFileSync(path.join(this.executorGraphsDir, file), "utf8"))));
    if (persisted.some((graph) => graph.id === "default-loop-engineering")) return persisted;
    return [defaultExecutorGraph(), ...persisted];
  }

  readExecutorGraph(id: string): ExecutorGraph | undefined {
    const safeId = safeFileName(id);
    const file = path.join(this.executorGraphsDir, `${safeId}.json`);
    if (fs.existsSync(file)) return normalizeExecutorGraph(JSON.parse(fs.readFileSync(file, "utf8")));
    if (safeId === "default-loop-engineering") return defaultExecutorGraph();
    return undefined;
  }

  writeExecutorGraph(graph: ExecutorGraph): ExecutorGraph {
    atomicWriteJson(path.join(this.executorGraphsDir, `${safeFileName(graph.id)}.json`), graph);
    return graph;
  }

  listLoops(): LoopRun[] {
    return fs.readdirSync(this.loopsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => this.hydrateLoop(JSON.parse(fs.readFileSync(path.join(this.loopsDir, file), "utf8"))))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  }

  readLoop(id: string): LoopRun | undefined {
    const file = path.join(this.loopsDir, `${safeFileName(id)}.json`);
    if (!fs.existsSync(file)) return undefined;
    return this.hydrateLoop(JSON.parse(fs.readFileSync(file, "utf8")));
  }

  writeLoop(loop: LoopRun): LoopRun {
    const hydrated = this.hydrateLoop(loop);
    atomicWriteJson(path.join(this.loopsDir, `${safeFileName(hydrated.id)}.json`), hydrated);
    return hydrated;
  }

  listLoopTraces(): LoopTraceSummary[] {
    return this.listLoops().map((loop) => loop.trace);
  }

  readLoopSandboxProof(loopId: string): LoopSandboxBoundaryProof | undefined {
    const loop = this.readLoop(loopId);
    if (!loop) return undefined;
    return buildLoopSandboxBoundaryProof(loop);
  }

  verifyLoopSandboxProof(loopId: string, actor: string): { loop: LoopRun; proof: LoopSandboxBoundaryProof } | undefined {
    const loop = this.readLoop(loopId);
    if (!loop) return undefined;
    const proof = buildLoopSandboxBoundaryProof(loop);
    const now = new Date().toISOString();
    const updated = this.writeLoop({
      ...loop,
      context: {
        ...loop.context,
        sandboxBoundaryProof: {
          status: proof.status,
          verifiedAt: now,
          verifiedBy: actor,
          checkCount: proof.checks.length
        }
      },
      timeline: [
        ...loop.timeline,
        loopTimelineEvent("EVIDENCE", `Sandbox boundary proof ${proof.status} for ${proof.runtime}.`, {
          runtime: proof.runtime,
          status: proof.status,
          checks: proof.checks.map((check) => `${check.id}:${check.status}`)
        })
      ],
      updatedAt: now
    });
    return { loop: updated, proof };
  }

  readLoopTraceTree(loopId: string): LoopTraceTree | undefined {
    const loop = this.readLoop(loopId);
    if (!loop) return undefined;
    return buildLoopTraceTree(loop, this.readExecutorGraph(loop.executorGraphId));
  }

  listLoopStreamEvents(loopId: string): LoopStreamEvent[] | undefined {
    const loop = this.readLoop(loopId);
    if (!loop) return undefined;
    return buildLoopStreamEvents(loop, this.readExecutorGraph(loop.executorGraphId));
  }

  listLoopCheckpoints(loopId: string): LoopCheckpoint[] | undefined {
    const loop = this.readLoop(loopId);
    if (!loop) return undefined;
    return buildLoopCheckpoints(loop);
  }

  async replayLoopWithDiff(id: string, actor: string, input: {
    fromIteration: number;
    contextPatch?: Record<string, unknown>;
    evidence?: string[];
    artifacts?: LoopArtifact[];
    forceDecision?: LoopDecision;
  }): Promise<{ loop: LoopRun; checkpoint?: LoopCheckpoint; replayDiff: LoopReplayDiff } | undefined> {
    const before = this.readLoop(id);
    if (!before) return undefined;
    const fromIteration = Math.max(1, Math.floor(Number(input.fromIteration) || 1));
    const checkpoint = buildLoopCheckpoints(before).find((item) => item.iterationIndex === fromIteration);
    const replayed = await this.replayLoop(id, actor, input);
    if (!replayed) return undefined;
    return {
      loop: replayed,
      checkpoint,
      replayDiff: buildLoopReplayDiff(before, replayed, fromIteration, input.contextPatch ?? {})
    };
  }

  listLoopWorkerQueue(now = new Date()): LoopWorkerQueueItem[] {
    return this.listLoops()
      .filter((loop) => ["PENDING", "RUNNING", "WAITING_APPROVAL", "BLOCKED", "SUCCEEDED"].includes(loop.status))
      .map((loop) => loopWorkerQueueItem(loop, now))
      .sort((left, right) => Number(right.claimable) - Number(left.claimable) || left.loopId.localeCompare(right.loopId));
  }

  claimNextLoop(workerId: string, leaseSeconds = 120, now = new Date(), preferredLoopId?: string): LoopWorkerQueueClaim {
    const safeWorkerId = safeFileName(workerId || "evopilot-worker");
    const queue = this.listLoopWorkerQueue(now);
    const preferredId = preferredLoopId ? safeFileName(preferredLoopId) : "";
    const candidate = (preferredId ? queue.find((item) => item.loopId === preferredId && item.claimable) : undefined)
      ?? queue.find((item) => item.claimable);
    let claimed: LoopWorkerQueueItem | undefined;
    if (candidate) {
      this.heartbeatLoop(candidate.loopId, safeWorkerId, leaseSeconds);
      const loop = this.readLoop(candidate.loopId);
      if (loop) claimed = loopWorkerQueueItem(loop, new Date());
    }
    const refreshedQueue = this.listLoopWorkerQueue(new Date());
    return {
      schema: "evopilot-loop-worker-claim/v1",
      workerId: safeWorkerId,
      claimed,
      queue: refreshedQueue,
      evidence: [
        `worker=${safeWorkerId}`,
        `claimable=${queue.filter((item) => item.claimable).length}`,
        claimed ? `claimed=${claimed.loopId}` : "claimed=none",
        "duplicateSideEffectGuard=sourceClosureState"
      ],
      createdAt: new Date().toISOString()
    };
  }

  private hydrateLoop(loop: any): LoopRun {
    const graph = this.readExecutorGraph(String(loop.executorGraphId ?? "default-loop-engineering")) ?? defaultExecutorGraph();
    const project = this.readProject(String(loop.projectId ?? "evopilot"));
    const tenantId = safeFileName(String(loop.tenantId ?? project?.tenantId ?? DEFAULT_TENANT_ID));
    const workspaceId = safeFileName(String(loop.workspaceId ?? project?.workspaceId ?? DEFAULT_WORKSPACE_ID));
    const hydrated: LoopRun = {
      ...loop,
      schema: "evopilot-loop-run/v1",
      source: normalizeLoopTriggerSource(loop.source),
      tenantId,
      workspaceId,
      llm: hydrateLoopLlmSelection(loop.llm),
      status: normalizeLoopRunStatus(loop.status),
      currentIteration: Number.isFinite(Number(loop.currentIteration)) ? Number(loop.currentIteration) : 0,
      executorGraphId: String(loop.executorGraphId ?? graph.id),
      stopPolicy: normalizeLoopStopPolicy(loop.stopPolicy),
      retryPolicy: normalizeLoopRetryPolicy(loop.retryPolicy),
      context: isRecord(loop.context) ? loop.context : {},
      sourceClosure: normalizeLoopSourceClosure(loop.sourceClosure ?? loop.context?.sourceClosure, project, loop.controlPlaneUrl),
      store: normalizeLoopStoreRuntime(loop.store),
      sandbox: normalizeLoopSandboxPolicy(loop.sandbox ?? loop.context?.sandbox),
      sandboxEnforcement: evaluateLoopSandboxEnforcement(normalizeLoopSandboxPolicy(loop.sandbox ?? loop.context?.sandbox)),
      coordination: normalizeExecutorCoordinationPlan(graph),
      iterations: Array.isArray(loop.iterations) ? loop.iterations.map((iteration: any) => hydrateLoopIteration(iteration)) : [],
      evidenceSets: Array.isArray(loop.evidenceSets) ? loop.evidenceSets : [],
      artifacts: Array.isArray(loop.artifacts) ? loop.artifacts : [],
      approvals: Array.isArray(loop.approvals) ? loop.approvals : [],
      timeline: Array.isArray(loop.timeline) ? loop.timeline : [],
      createdAt: String(loop.createdAt ?? new Date().toISOString()),
      updatedAt: String(loop.updatedAt ?? loop.createdAt ?? new Date().toISOString())
    };
    return {
      ...hydrated,
      trace: buildLoopTraceSummary(hydrated)
    };
  }

  createLoop(input: {
    id?: string;
    source?: LoopTriggerSource;
    projectId?: string;
    objective: string;
    executorGraphId?: string;
    controlPlaneUrl?: string;
    tenantId?: string;
    workspaceId?: string;
    sourceClosure?: Partial<LoopSourceClosure>;
    stopPolicy?: Partial<LoopStopPolicy>;
    retryPolicy?: Partial<LoopRetryPolicy>;
    sandbox?: Partial<LoopSandboxPolicy>;
    context?: Record<string, unknown>;
    llm?: LoopLlmSelection;
  }): LoopRun {
    const now = new Date().toISOString();
    const projectId = safeFileName(String(input.projectId ?? "evopilot"));
    const project = this.readProject(projectId);
    const tenantId = safeFileName(String(input.tenantId ?? project?.tenantId ?? DEFAULT_TENANT_ID));
    const workspaceId = safeFileName(String(input.workspaceId ?? project?.workspaceId ?? DEFAULT_WORKSPACE_ID));
    const id = safeFileName(input.id ?? `loop-${projectId}-${Date.now()}`);
    const graph = this.readExecutorGraph(input.executorGraphId ?? "default-loop-engineering") ?? defaultExecutorGraph();
    if (graph.id !== "default-loop-engineering") this.writeExecutorGraph(graph);
    const loop: LoopRun = {
      schema: "evopilot-loop-run/v1",
      id,
      source: input.source ?? "api",
      projectId,
      tenantId,
      workspaceId,
      objective: input.objective,
      llm: input.llm,
      status: "PENDING",
      currentIteration: 0,
      executorGraphId: graph.id,
      controlPlaneUrl: input.controlPlaneUrl,
      sourceClosure: normalizeLoopSourceClosure(input.sourceClosure ?? input.context?.sourceClosure, project, input.controlPlaneUrl),
      stopPolicy: normalizeLoopStopPolicy(input.stopPolicy),
      retryPolicy: normalizeLoopRetryPolicy(input.retryPolicy),
      context: input.context ?? {},
      store: normalizeLoopStoreRuntime(),
      sandbox: normalizeLoopSandboxPolicy(input.sandbox ?? input.context?.sandbox),
      sandboxEnforcement: evaluateLoopSandboxEnforcement(normalizeLoopSandboxPolicy(input.sandbox ?? input.context?.sandbox)),
      coordination: normalizeExecutorCoordinationPlan(graph),
      trace: emptyLoopTraceSummary(id, now),
      iterations: [],
      evidenceSets: [],
      artifacts: [],
      approvals: [],
      timeline: [loopTimelineEvent("CREATED", `Loop ${id} created from ${input.source ?? "api"}.`, { objective: input.objective, projectId, tenantId, workspaceId, llmProfileId: input.llm?.profileId, llmProvider: input.llm?.provider, llmModel: input.llm?.model, sourceClosure: normalizeLoopSourceClosure(input.sourceClosure ?? input.context?.sourceClosure, project, input.controlPlaneUrl) })],
      createdAt: now,
      updatedAt: now
    };
    return this.writeLoop(loop);
  }

  async startLoop(id: string, actor: string, input: { forceDecision?: LoopDecision; evidence?: string[]; artifacts?: LoopArtifact[] } = {}): Promise<LoopRun | undefined> {
    const loop = this.readLoop(id);
    if (!loop) return undefined;
    if (loop.status === "CANCELLED" || loop.status === "SUCCEEDED" || loop.status === "FAILED") return loop;
    return await this.runLoopIteration({
      loop: {
        ...loop,
        status: "RUNNING",
        timeline: [...loop.timeline, loopTimelineEvent("STARTED", `Loop started by ${actor}.`)]
      },
      actor,
      ...input
    });
  }

  async resumeLoop(id: string, actor: string, input: { forceDecision?: LoopDecision; evidence?: string[]; artifacts?: LoopArtifact[] } = {}): Promise<LoopRun | undefined> {
    const loop = this.readLoop(id);
    if (!loop) return undefined;
    if (loop.status === "WAITING_APPROVAL" && loop.approvals.some((approval) => approval.status === "PENDING")) {
      throw httpError(409, "LOOP_APPROVAL_REQUIRED", "Loop requires approval before it can resume.");
    }
    if (["CANCELLED", "SUCCEEDED", "FAILED"].includes(loop.status)) return loop;
    return await this.runLoopIteration({ loop: { ...loop, status: "RUNNING" }, actor, ...input });
  }

  async replayLoop(id: string, actor: string, input: {
    fromIteration: number;
    contextPatch?: Record<string, unknown>;
    evidence?: string[];
    artifacts?: LoopArtifact[];
    forceDecision?: LoopDecision;
  }): Promise<LoopRun | undefined> {
    const loop = this.readLoop(id);
    if (!loop) return undefined;
    const fromIteration = Math.max(1, Math.floor(Number(input.fromIteration) || 1));
    const keptIterations = loop.iterations.filter((iteration) => iteration.index < fromIteration);
    const keptEvidenceSetIds = new Set(keptIterations.map((iteration) => iteration.evidenceSetId).filter(Boolean));
    const keptEvidenceSets = loop.evidenceSets.filter((set) => keptEvidenceSetIds.has(set.id));
    const replayContextPatch = input.contextPatch ?? {};
    const replayBase: LoopRun = {
      ...loop,
      status: "RUNNING",
      currentIteration: keptIterations.length,
      iterations: keptIterations,
      evidenceSets: keptEvidenceSets,
      context: {
        ...loop.context,
        ...replayContextPatch,
        replay: {
          fromIteration,
          requestedBy: actor,
          requestedAt: new Date().toISOString(),
          contextPatchKeys: Object.keys(replayContextPatch)
        }
      },
      timeline: [
        ...loop.timeline,
        loopTimelineEvent("REPLAY", `Loop replayed from iteration ${fromIteration} by ${actor}.`, { fromIteration, contextPatchKeys: Object.keys(replayContextPatch) })
      ],
      updatedAt: new Date().toISOString()
    };
    return await this.runLoopIteration({
      loop: replayBase,
      actor,
      forceDecision: input.forceDecision,
      evidence: [
        `replayFromIteration=${fromIteration}`,
        ...Object.keys(replayContextPatch).map((key) => `contextEdited=${key}`),
        ...(input.evidence ?? [])
      ],
      artifacts: input.artifacts,
      replayOfIterationId: loop.iterations.find((iteration) => iteration.index === fromIteration)?.id,
      contextPatch: replayContextPatch
    });
  }

  approveLoop(id: string, actor: string, approvalId?: string): LoopRun | undefined {
    const loop = this.readLoop(id);
    if (!loop) return undefined;
    const pending = loop.approvals.find((approval) => approval.status === "PENDING" && (!approvalId || approval.id === approvalId));
    if (!pending) throw httpError(409, "LOOP_APPROVAL_NOT_PENDING", "No pending loop approval is available.");
    const now = new Date().toISOString();
    return this.writeLoop({
      ...loop,
      status: "RUNNING",
      approvals: loop.approvals.map((approval) => approval.id === pending.id ? { ...approval, status: "APPROVED", decidedAt: now, decidedBy: actor } : approval),
      timeline: [...loop.timeline, loopTimelineEvent("APPROVAL", `Approval ${pending.id} granted by ${actor}.`, { approvalId: pending.id })],
      updatedAt: now
    });
  }

  cancelLoop(id: string, actor: string, reason?: string): LoopRun | undefined {
    const loop = this.readLoop(id);
    if (!loop) return undefined;
    const now = new Date().toISOString();
    return this.writeLoop({
      ...loop,
      status: "CANCELLED",
      timeline: [...loop.timeline, loopTimelineEvent("CANCELLED", reason || `Loop cancelled by ${actor}.`)],
      updatedAt: now
    });
  }

  heartbeatLoop(loopId: string, workerId: string, leaseSeconds = 120): LoopRun | undefined {
    const loop = this.readLoop(loopId);
    if (!loop) return undefined;
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const lease: LoopWorkerLease = {
      workerId: safeFileName(workerId),
      acquiredAt: loop.workerLease?.workerId === safeFileName(workerId) ? loop.workerLease.acquiredAt : now,
      heartbeatAt: now,
      expiresAt: new Date(nowMs + Math.max(15, leaseSeconds) * 1000).toISOString()
    };
    return this.writeLoop({
      ...loop,
      workerLease: lease,
      timeline: [...loop.timeline, loopTimelineEvent("HEARTBEAT", `Worker ${lease.workerId} heartbeat accepted.`, { expiresAt: lease.expiresAt })],
      updatedAt: now
    });
  }

  listLoopLeases(): Array<{ loopId: string; status: LoopRunStatus; workerLease?: LoopWorkerLease }> {
    return this.listLoops().map((loop) => ({ loopId: loop.id, status: loop.status, workerLease: loop.workerLease }));
  }

  runLoopWatchdog(now = new Date()): { recovered: LoopRun[]; blocked: LoopRun[] } {
    const recovered: LoopRun[] = [];
    const blocked: LoopRun[] = [];
    for (const loop of this.listLoops()) {
      if (loop.status !== "RUNNING" && loop.status !== "PENDING") continue;
      const leaseExpired = loop.workerLease?.expiresAt ? Date.parse(loop.workerLease.expiresAt) < now.getTime() : false;
      const ageSeconds = (now.getTime() - Date.parse(loop.createdAt)) / 1000;
      if (loop.status === "RUNNING" && leaseExpired) {
        const updated = this.writeLoop({
          ...loop,
          status: "PENDING",
          workerLease: undefined,
          timeline: [...loop.timeline, loopTimelineEvent("WATCHDOG", "Expired worker lease released; loop can be resumed by another worker.")],
          updatedAt: now.toISOString()
        });
        recovered.push(updated);
      } else if (ageSeconds > loop.stopPolicy.maxDurationSeconds) {
        const updated = this.writeLoop({
          ...loop,
          status: "BLOCKED",
          timeline: [...loop.timeline, loopTimelineEvent("WATCHDOG", "Loop blocked by maxDurationSeconds stop policy.", { maxDurationSeconds: loop.stopPolicy.maxDurationSeconds })],
          updatedAt: now.toISOString()
        });
        blocked.push(updated);
      }
    }
    return { recovered, blocked };
  }

  private async runLoopIteration(args: {
    loop: LoopRun;
    actor: string;
    forceDecision?: LoopDecision;
    evidence?: string[];
    artifacts?: LoopArtifact[];
    replayOfIterationId?: string;
    contextPatch?: Record<string, unknown>;
  }): Promise<LoopRun> {
    const graph = this.readExecutorGraph(args.loop.executorGraphId) ?? defaultExecutorGraph();
    const now = new Date().toISOString();
    const nextIndex = args.loop.currentIteration + 1;
    const startedAt = now;
    const iterationWorkspace = path.join(this.loopWorkspacesDir, safeFileName(args.loop.id), `iteration-${nextIndex}`);
    fs.mkdirSync(iterationWorkspace, { recursive: true });
    const llmClient = this.resolveLoopLlmClient(args.loop);
    const steps = await Promise.all(graph.nodes.map((node, index) => executeLoopNode({
      node,
      loop: args.loop,
      iterationIndex: nextIndex,
      attempt: 1,
      previousFailureCount: countRecentLoopFailure(args.loop),
      forceDecision: args.forceDecision,
      workspaceRoot: iterationWorkspace,
      coordination: normalizeExecutorCoordinationPlan(graph),
      sandbox: args.loop.sandbox,
      sandboxEnforcement: evaluateLoopSandboxEnforcement(args.loop.sandbox),
      now: new Date(Date.now() + index).toISOString(),
      llmClient,
      requireLlm: this.executionRuntime.requireLlm === true
    })));
    const failedSteps = steps.filter((step) => step.status === "FAILED");
    const waitingApproval = steps.some((step) => step.status === "WAITING_APPROVAL");
    const evidenceStatus: LoopEvidenceSet["status"] = failedSteps.length > 0 ? "FAIL" : waitingApproval ? "BLOCKED" : "PASS";
    const iterationId = `${args.loop.id}-iter-${nextIndex}`;
    const artifacts = [
      ...(args.artifacts ?? []),
      loopArtifact("generic", `Iteration ${nextIndex} sandbox workspace`, iterationWorkspace),
      loopArtifact("report", `Iteration ${nextIndex} report`, path.join(this.loopsDir, `${safeFileName(args.loop.id)}.json`))
    ];
    const evidenceSet: LoopEvidenceSet = {
      id: `${iterationId}-evidence`,
      loopRunId: args.loop.id,
      iterationId,
      validator: "evopilot-loop-runtime",
      status: evidenceStatus,
      evidence: [
        `executorGraph=${graph.id}`,
        `executorGraph.validation=${graph.validation.status}`,
        `executorGraph.nodes=${graph.nodes.length}`,
        `executorGraph.edges=${graph.edges.length}`,
        `executorGraph.capabilities=${Object.entries(graph.capabilities).filter(([, enabled]) => enabled).map(([key]) => key).join(",")}`,
        `iteration=${nextIndex}`,
        `sourceClosure.project=${args.loop.sourceClosure.sourceProjectId}`,
        `sourceClosure.provider=${args.loop.sourceClosure.repositoryProvider}`,
        `sourceClosure.ref=${args.loop.sourceClosure.sourceUrl ?? args.loop.sourceClosure.sourceRoot ?? "unknown"}`,
        `sourceClosure.branch=${args.loop.sourceClosure.sourceBranch}`,
        `sourceClosure.releaseStrategy=${args.loop.sourceClosure.releaseStrategy}`,
        `sourceClosure.requiredGates=${args.loop.sourceClosure.requiredGates.join(",")}`,
        `sourceClosure.targetVersion=${args.loop.sourceClosure.targetVersion ?? "unspecified"}`,
        `sourceClosure.deploymentEnvironment=${args.loop.sourceClosure.deploymentEnvironment ?? "production"}`,
        ...evaluateLoopSandboxEnforcement(args.loop.sandbox).evidence,
        ...steps.flatMap((step) => step.evidence),
        ...(args.evidence ?? [])
      ],
      artifacts,
      createdAt: new Date().toISOString()
    };
    const decision = decideLoopIteration(args.loop, nextIndex, steps, evidenceSet, args.forceDecision);
    const approval = decision === "WAIT_APPROVAL"
      ? {
        id: `approval-${args.loop.id}-${nextIndex}`,
        status: "PENDING" as const,
        reason: "Loop reached a release or high-risk approval gate.",
        requestedAt: new Date().toISOString()
      }
      : undefined;
    const iteration: LoopIteration = {
      id: iterationId,
      loopRunId: args.loop.id,
      index: nextIndex,
      startedAt,
      completedAt: new Date().toISOString(),
      executorSteps: steps,
      evidenceSetId: evidenceSet.id,
      decision,
      rationale: loopDecisionRationale(decision, failedSteps),
      replayOfIterationId: args.replayOfIterationId,
      contextPatch: args.contextPatch,
      traceId: `trace-${safeFileName(args.loop.id)}-${nextIndex}`
    };
    const status = loopStatusFromDecision(decision);
    const updated: LoopRun = {
      ...args.loop,
      status,
      currentIteration: nextIndex,
      iterations: [...args.loop.iterations, iteration],
      evidenceSets: [...args.loop.evidenceSets, evidenceSet],
      artifacts: [...args.loop.artifacts, ...artifacts],
      approvals: approval ? [...args.loop.approvals, approval] : args.loop.approvals,
      timeline: [
        ...args.loop.timeline,
        loopTimelineEvent("ITERATION", `Iteration ${nextIndex} completed with ${decision}.`, { iterationId }),
        loopTimelineEvent("EVIDENCE", `Evidence set ${evidenceSet.id} collected with ${evidenceSet.status}.`, { evidenceSetId: evidenceSet.id }),
        loopTimelineEvent("DECISION", `Decision ${decision}: ${loopDecisionRationale(decision, failedSteps)}.`)
      ],
      updatedAt: new Date().toISOString()
    };
    return this.writeLoop(updated);
  }

  createTargetLoop(input: { projectId?: string; targetId?: string; finalGoal?: string; candidate?: string; proofOpsCore?: ProofOpsCoreContract }): TargetLoopRun {
    const now = new Date().toISOString();
    const targetId = safeFileName(String(input.targetId ?? "ga"));
    const target = this.readReleaseTarget(targetId) ?? releaseTargetFromProofOpsCore(targetId, input.proofOpsCore) ?? defaultGAReleaseTarget();
    const projectId = safeFileName(String(input.projectId ?? "evopilot"));
    const id = safeFileName(String(input.candidate ?? `target-loop-${projectId}-${target.id}-${Date.now()}`));
    const targetPlan = buildProofOpsTargetPlan({ target, projectId, finalGoal: input.finalGoal, proofOpsCore: input.proofOpsCore });
    return this.writeTargetLoop({
      schema: "evopilot-proofops-target-loop/v1",
      id,
      projectId,
      targetId: target.id,
      releaseTarget: target.name,
      mode: "proofops-target-loop",
      status: "PENDING_PLAN_APPROVAL",
      targetPlan,
      targetPlanConfirmation: {
        status: "pending",
        instruction: "Review and confirm this ProofOps target plan before EvoPilot starts the target loop."
      },
      evidenceMatrix: target.requiredScenarioIds.map((scenario) => ({
        capability: "release-target",
        scenario,
        requiredEvidence: `Scenario ${scenario} must pass for ${target.id}.`,
        status: "NOT_RUN",
        required: true,
        blocker: "",
        nextRepairAction: "Run the target loop and collect real release evidence.",
        evidence: []
      })),
      decisionChain: [],
      releaseActions: [],
      remediationRequests: [],
      artifacts: {},
      createdAt: now,
      updatedAt: now
    });
  }

  approveTargetLoopPlan(id: string, actor: string): TargetLoopRun | undefined {
    const loop = this.readTargetLoop(id);
    if (!loop) return undefined;
    return this.writeTargetLoop({
      ...loop,
      targetPlanConfirmation: {
        status: "confirmed",
        confirmedAt: new Date().toISOString(),
        confirmedBy: actor,
        instruction: "ProofOps target plan confirmed through EvoPilot target-loop approval gate."
      },
      updatedAt: new Date().toISOString()
    });
  }

  runTargetLoop(id: string, input: { scenarioMatrix?: ReleaseScenarioResult[]; artifactPaths?: string[] } = {}): TargetLoopRun | undefined {
    const loop = this.readTargetLoop(id);
    if (!loop) return undefined;
    if (loop.targetPlanConfirmation.status !== "confirmed") {
      throw httpError(409, "TARGET_LOOP_PLAN_NOT_CONFIRMED", "ProofOps target loop requires target plan confirmation before execution.");
    }
    const bundle = this.generateReleaseEvidenceBundle({
      id: `target-loop-evidence-${loop.id}`,
      candidate: loop.id,
      releaseTargetId: loop.targetId,
      scenarioMatrix: input.scenarioMatrix,
      artifactPaths: input.artifactPaths
    });
    const decision = this.readReleaseDecision(bundle.releaseDecisionId ?? "");
    const criteria = decision?.criteria ?? [];
    const matrix = criteria.map((criterion) => ({
      capability: "release-criterion",
      scenario: criterion.id,
      requiredEvidence: criterion.name,
      status: criterion.status === "PASS" ? "PASS" as const : "FAIL" as const,
      required: criterion.required,
      blocker: criterion.status === "PASS" ? "" : `${criterion.actual} does not meet ${criterion.target}`,
      nextRepairAction: criterion.status === "PASS" ? "continue" : "Route blocker to EvoPilot remediation, then resume this target loop.",
      evidence: criterion.evidence
    }));
    const failedRequired = matrix.filter((row) => row.required && row.status !== "PASS");
    const releaseDecision = decision ? {
      id: decision.id,
      status: decision.status,
      evidenceBundleId: decision.evidenceBundleId,
      targetReached: decision.status === "GO",
      failedCriteria: Number(decision.summary.failedCriteria ?? failedRequired.length),
      highOpenRisks: Number(decision.summary.highOpenRisks ?? 0)
    } : undefined;
    const decisionChain = matrix.map((row) => ({
      phase: row.scenario,
      rule: row.requiredEvidence,
      decision: row.status === "PASS" ? "continue" as const : "repair blocker" as const,
      rationale: row.status === "PASS" ? "Required release target evidence passed." : row.blocker,
      nextAction: row.nextRepairAction,
      evidence: row.evidence
    }));
    const finalReport = buildProofOpsFinalReport({
      loop,
      matrix,
      decisionChain,
      releaseDecision
    });
    const updated: TargetLoopRun = {
      ...loop,
      status: releaseDecision?.status === "GO" ? "GO" : failedRequired.length > 0 ? "NO-GO" : "BLOCKED",
      evidenceMatrix: matrix,
      decisionChain,
      releaseDecision,
      finalReport,
      artifacts: {
        finalReportJson: path.join(this.targetLoopsDir, `${safeFileName(loop.id)}.json`),
        sourceReleaseEvidenceBundleId: bundle.id
      },
      updatedAt: new Date().toISOString()
    };
    return this.writeTargetLoop(updated);
  }

  approveTargetLoopReleaseAction(id: string, action: string, actor: string): TargetLoopRun | undefined {
    const loop = this.readTargetLoop(id);
    if (!loop) return undefined;
    if (loop.status !== "GO") throw httpError(409, "TARGET_LOOP_NOT_GO", "Release actions require a GO target loop decision.");
    const normalizedAction = safeFileName(action);
    const existing = loop.releaseActions.filter((item) => item.action !== normalizedAction);
    return this.writeTargetLoop({
      ...loop,
      releaseActions: [
        ...existing,
        {
          action: normalizedAction,
          status: "APPROVED",
          approvedAt: new Date().toISOString(),
          approvedBy: actor
        }
      ],
      updatedAt: new Date().toISOString()
    });
  }

  executeTargetLoopReleaseAction(id: string, action: string, actor: string): TargetLoopRun | undefined {
    const loop = this.readTargetLoop(id);
    if (!loop) return undefined;
    const normalizedAction = safeFileName(action);
    const actionRecord = loop.releaseActions.find((item) => item.action === normalizedAction);
    if (!actionRecord || actionRecord.status !== "APPROVED") {
      throw httpError(409, "TARGET_LOOP_RELEASE_ACTION_NOT_APPROVED", "Release action execution requires prior approval.");
    }
    return this.writeTargetLoop({
      ...loop,
      releaseActions: loop.releaseActions.map((item) => item.action === normalizedAction
        ? { ...item, status: "EXECUTED" as const, executedAt: new Date().toISOString(), executedBy: actor }
        : item),
      updatedAt: new Date().toISOString()
    });
  }

  routeTargetLoopRemediation(id: string, blocker?: string): TargetLoopRun | undefined {
    const loop = this.readTargetLoop(id);
    if (!loop) return undefined;
    const firstBlocker = blocker || loop.evidenceMatrix.find((row) => row.status !== "PASS" && row.required)?.blocker || "Target loop blocker requires EvoPilot remediation.";
    const now = new Date().toISOString();
    return this.writeTargetLoop({
      ...loop,
      remediationRequests: [
        ...loop.remediationRequests,
        {
          id: `remediation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          status: "ROUTED",
          blocker: firstBlocker,
          routedTo: "evopilot",
          createdAt: now
        }
      ],
      updatedAt: now
    });
  }

  generateReleaseEvidenceBundle(input: {
    id?: string;
    tenantId?: string;
    workspaceId?: string;
    projectId?: string;
    candidate?: string;
    releaseTargetId?: string;
    scenarioMatrix?: ReleaseScenarioResult[];
    artifactPaths?: string[];
  }): ReleaseEvidenceBundle {
    const now = new Date().toISOString();
    const id = safeFileName(input.id ?? `release-evidence-${Date.now()}`);
    const tenantId = safeFileName(String(input.tenantId ?? DEFAULT_TENANT_ID));
    const workspaceId = safeFileName(String(input.workspaceId ?? DEFAULT_WORKSPACE_ID));
    const projectId = input.projectId ? safeFileName(input.projectId) : undefined;
    const releaseTargetId = input.releaseTargetId ?? "ga";
    const target = this.readReleaseTarget(releaseTargetId) ?? defaultGAReleaseTarget();
    if (target.scope === "project" && target.projectId && target.projectId !== projectId) {
      throw httpError(400, "RELEASE_TARGET_PROJECT_MISMATCH", `发布目标 ${target.id} 绑定项目 ${target.projectId}，不能用于项目 ${projectId ?? "未指定"}。`);
    }
    const summary = compactReleaseEvidenceSummary(this.summary() as Record<string, unknown>);
    const projects = this.listProjects()
      .filter((project) => project.tenantId === tenantId && project.workspaceId === workspaceId)
      .filter((project) => !projectId || project.id === projectId);
    const scopedProjectIds = new Set(projects.map((project) => project.id));
    const soakReports = this.listSoakReports();
    const pipelines = this.listPipelines().filter((pipeline) => scopedProjectIds.has(pipeline.projectId));
    const codeUpgrades = this.listCodeUpgradeRuns().filter((upgrade) => scopedProjectIds.has(upgrade.projectId));
    const sourceReleaseRuns = this.listSourceReleaseClosureRuns()
      .filter((run) => scopedProjectIds.has(run.projectId) && run.tenantId === tenantId && run.workspaceId === workspaceId);
    const scenarioMatrix = alignScenarioMatrixToReleaseTarget(
      mergeScenarioMatrix(defaultReleaseScenarioMatrix({ pipelines, codeUpgrades, projects, summary, now }), input.scenarioMatrix ?? [], now),
      target,
      now
    );
    const promotedSourceReleaseProjectIds = new Set(sourceReleaseRuns
      .filter((run) => run.status === "PROMOTED")
      .map((run) => run.projectId));
    const saasSourceToGaPassed = releaseTargetId === "saas-ga" &&
      scenarioMatrix.some((scenario) => scenario.id === "saas-field-e2e-source-to-ga" && scenario.status === "PASS") &&
      promotedSourceReleaseProjectIds.size > 0;
    const riskProjectIds = saasSourceToGaPassed ? promotedSourceReleaseProjectIds : scopedProjectIds;
    const readiness = this.computeReleaseReadinessReports().filter((report) => riskProjectIds.has(report.projectId));
    const rollout = this.computeRolloutStrategyReports().filter((report) => riskProjectIds.has(report.projectId));
    const policyEvaluations = this.evaluateGovernancePolicies().filter((evaluation) => riskProjectIds.has(evaluation.scope));
    const riskRegister = this.buildReleaseRiskRegister({ policyEvaluations, readiness, rollout, pipelines, codeUpgrades, sourceReleaseRuns, scenarioMatrix, releaseTargetId, requiredScenarioIds: target.requiredScenarioIds });
    const targetRequiredScenarios = new Set(target.requiredScenarioIds);
    const failedRequiredScenarioCount = scenarioMatrix.filter((scenario) => targetRequiredScenarios.has(scenario.id) && scenario.required && (scenario.status === "FAIL" || scenario.status === "NOT-RUN")).length;
    const openHighRiskCount = riskRegister.filter((risk) => risk.status === "OPEN" && (risk.severity === "HIGH" || risk.severity === "CRITICAL")).length;
    const status: ReleaseEvidenceBundle["status"] = failedRequiredScenarioCount > 0 || openHighRiskCount > 0
      ? "NO-GO"
      : riskRegister.some((risk) => risk.status === "OPEN") || scenarioMatrix.some((scenario) => scenario.status === "NOT-APPLICABLE")
        ? "CONDITIONAL-GO"
        : "GO";
    const bundle: ReleaseEvidenceBundle = {
      id,
      tenantId,
      workspaceId,
      projectId,
      candidate: input.candidate ?? `candidate-${now}`,
      status,
      releaseTargetId,
      generatedAt: now,
      summary,
      sourceSoakReportIds: soakReports.map((report) => report.id),
      serviceInventory: this.buildServiceInventory(projects),
      connectedProjects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        repository: maskProject(project, this).repository,
        devops: project.devops,
        validation: project.validation,
        releaseReadiness: readiness.find((report) => report.projectId === project.id),
        rolloutStrategy: rollout.find((report) => report.projectId === project.id)
      })),
      scenarioMatrix,
      riskRegister,
      artifacts: [
        ...soakReports.map((report) => ({
          type: "soak-report" as const,
          label: report.name,
          path: path.join(this.soakReportsDir, `${safeFileName(report.id)}.json`),
          status: report.status
        })),
        ...pipelines.slice(-20).map((pipeline) => ({
          type: "pipeline" as const,
          label: `${pipeline.projectId} ${pipeline.jobName}`,
          url: pipeline.buildUrl,
          status: pipeline.status
        })),
        ...codeUpgrades.slice(-20).map((upgrade) => ({
          type: "code-upgrade" as const,
          label: `${upgrade.projectId} ${upgrade.id}`,
          path: upgrade.artifacts.diffPath,
          url: upgrade.artifacts.pullRequestUrl,
          status: upgrade.status
        })),
        ...(input.artifactPaths ?? []).map((artifactPath) => ({
          type: inferReleaseArtifactType(artifactPath),
          label: path.basename(artifactPath),
          path: artifactPath
        }))
      ],
      createdAt: now,
      updatedAt: now
    };
    const decision = this.generateReleaseDecision({ target, evidenceBundle: bundle, scenarioMatrix, riskRegister, summary, now, projectIds: scopedProjectIds });
    const releaseBundle = {
      ...bundle,
      status: decision.status,
      releaseDecisionId: decision.id
    };
    this.writeReleaseDecision(decision);
    return this.writeReleaseEvidenceBundle(releaseBundle);
  }

  private generateReleaseDecision(args: {
    target: ReleaseTargetProfile;
    evidenceBundle: ReleaseEvidenceBundle;
    scenarioMatrix: ReleaseScenarioResult[];
    riskRegister: ReleaseRisk[];
    summary: Record<string, unknown>;
    now: string;
    projectIds?: Set<string>;
  }): ReleaseDecision {
    const { target, evidenceBundle, scenarioMatrix, riskRegister, summary, now } = args;
    const projectIds = args.projectIds ?? new Set(this.listProjects().map((project) => project.id));
    const soakReports = this.listSoakReports();
    const succeededSoakSeconds = soakReports
      .filter((report) => report.status === "SUCCEEDED")
      .reduce((sum, report) => sum + report.durationSeconds, 0);
    const activeSucceededSoakSeconds = soakReports
      .filter((report) => report.status === "SUCCEEDED" && isActiveSoakReport(report, target))
      .reduce((sum, report) => sum + report.durationSeconds, 0);
    const requiredSoakSeconds = target.requireActiveSoak ? activeSucceededSoakSeconds : succeededSoakSeconds;
    const successfulCodeUpgrades = this.listCodeUpgradeRuns().filter((upgrade) => projectIds.has(upgrade.projectId) && upgrade.status === "SUCCEEDED").length;
    const successfulPipelines = this.listPipelines().filter((pipeline) => projectIds.has(pipeline.projectId) && pipeline.status === "SUCCEEDED").length;
    const connectedProjectCount = evidenceBundle.connectedProjects.length;
    const highOpenRiskCount = riskRegister.filter((risk) => risk.status === "OPEN" && (risk.severity === "HIGH" || risk.severity === "CRITICAL")).length;
    const criteria: ReleaseDecisionCriterion[] = [
      numericCriterion("min-connected-projects", "最少接入项目数", connectedProjectCount, target.minConnectedProjects, [`connectedProjects=${connectedProjectCount}`, evidenceBundle.projectId ? `projectId=${evidenceBundle.projectId}` : `workspaceId=${evidenceBundle.workspaceId}`]),
      numericCriterion("min-succeeded-soak-seconds", target.requireActiveSoak ? "有负载成功持续验证时长" : "成功持续验证时长", requiredSoakSeconds, target.minSucceededSoakSeconds, [
        `succeededSoakSeconds=${succeededSoakSeconds}`,
        `activeSucceededSoakSeconds=${activeSucceededSoakSeconds}`,
        `requireActiveSoak=${Boolean(target.requireActiveSoak)}`
      ]),
      numericCriterion("min-successful-runs", "成功证据运行数", Number(summary.runCount ?? 0), target.minSuccessfulRuns, [`runs=${summary.runCount ?? 0}`]),
      numericCriterion("min-evaluation-datasets", "评测集数量", Number(summary.evaluationDatasetCount ?? 0), target.minEvaluationDatasets, [`datasets=${summary.evaluationDatasetCount ?? 0}`]),
      numericCriterion("min-opportunities", "机会点数量", Number(summary.opportunityCount ?? 0), target.minOpportunities, [`opportunities=${summary.opportunityCount ?? 0}`]),
      numericCriterion("min-successful-evolution-batches", "成功进化批次数", Number(summary.successfulEvolutionBatchCount ?? 0), target.minSuccessfulEvolutionBatches, [`successfulBatches=${summary.successfulEvolutionBatchCount ?? 0}`]),
      numericCriterion("min-successful-code-upgrades", "成功代码升级数", successfulCodeUpgrades, target.minSuccessfulCodeUpgrades, [`successfulCodeUpgrades=${successfulCodeUpgrades}`]),
      numericCriterion("min-successful-pipelines", "成功 CI/CD 数", successfulPipelines, target.minSuccessfulPipelines, [`successfulPipelines=${successfulPipelines}`]),
      booleanCriterion("required-scenarios", "必跑场景全部通过", target.requiredScenarioIds.every((id) => scenarioMatrix.some((scenario) => scenario.id === id && scenario.status === "PASS")), true, target.requiredScenarioIds.map((id) => {
        const scenario = scenarioMatrix.find((item) => item.id === id);
        return `${id}=${scenario?.status ?? "MISSING"}`;
      })),
      booleanCriterion("mainstream-loop-harness-alignment", "主流 Loop Harness 对齐证据", !target.requiredScenarioIds.includes("mainstream-loop-harness-alignment") || scenarioMatrix.some((scenario) => scenario.id === "mainstream-loop-harness-alignment" && scenario.status === "PASS"), true, [
        target.requiredScenarioIds.includes("mainstream-loop-harness-alignment")
          ? scenarioMatrix.find((scenario) => scenario.id === "mainstream-loop-harness-alignment")?.evidence.join("; ") ?? "missing mainstream-loop-harness-alignment scenario"
          : "not required by release target"
      ]),
      booleanCriterion("no-high-open-risks", "无高危未关闭风险", target.requireNoHighOpenRisks ? highOpenRiskCount === 0 : true, true, [`highOpenRisks=${highOpenRiskCount}`])
    ];
    const failedRequired = criteria.filter((criterion) => criterion.required && criterion.status === "FAIL");
    const openMediumRiskCount = riskRegister.filter((risk) => risk.status === "OPEN" && risk.severity === "MEDIUM").length;
    const status: ReleaseDecision["status"] = failedRequired.length > 0
      ? "NO-GO"
      : openMediumRiskCount > 0
        ? "CONDITIONAL-GO"
        : "GO";
    return {
      id: `decision-${safeFileName(evidenceBundle.id)}`,
      tenantId: evidenceBundle.tenantId,
      workspaceId: evidenceBundle.workspaceId,
      projectId: evidenceBundle.projectId,
      candidate: evidenceBundle.candidate,
      targetId: target.id,
      evidenceBundleId: evidenceBundle.id,
      status,
      generatedAt: now,
      criteria,
      summary: {
        passedCriteria: criteria.filter((criterion) => criterion.status === "PASS").length,
        failedCriteria: failedRequired.length,
        openRisks: riskRegister.filter((risk) => risk.status === "OPEN").length,
        highOpenRisks: highOpenRiskCount
      },
      scenarioMatrix,
      riskRegister,
      createdAt: now,
      updatedAt: now
    };
  }

  private buildServiceInventory(projects: StoredProject[]): ReleaseEvidenceBundle["serviceInventory"] {
    const codeUpgrader = this.listCodeUpgraderConnectors().map(maskCodeUpgraderConnector);
    return [
      {
        id: "evopilot-api",
        type: "evopilot",
        name: "EvoPilot API",
        status: this.isReady() ? "READY" : "BLOCKED",
        evidence: this.isReady() ? "metadata、runs、projects 存储目录已就绪。" : "存储目录或 metadata 不完整。"
      },
      ...codeUpgrader.map((connector) => ({
        id: connector.id,
        type: "code-upgrader" as const,
        name: connector.name,
        status: connector.baseUrl ? "READY" as const : "BLOCKED" as const,
        endpoint: connector.baseUrl,
        evidence: connector.baseUrl ? `代码升级连接器已配置，apiKeyConfigured=${connector.apiKeyConfigured}。` : "代码升级连接器缺少 baseUrl。"
      })),
      ...projects.filter((project) => project.devops).map((project) => ({
        id: `${project.id}-devops`,
        type: "ci" as const,
        name: `${project.name} DevOps`,
        status: project.devops ? "READY" as const : "BLOCKED" as const,
        endpoint: project.repository?.baseUrl ?? project.repository?.gitUrl,
        evidence: project.devops
          ? `原生 DevOps 已配置：provider=${project.devops.provider}，ciWorkflow=${project.devops.ci.workflow ?? "platform-default"}，tokenRef=${project.devops.tokenRef ?? project.repository?.credentials?.tokenRef ?? "source-credentials"}。`
          : "项目未配置原生 DevOps。"
      })),
      ...projects.map((project) => ({
        id: project.id,
        type: "connected-project" as const,
        name: project.name,
        status: project.validation.status === "VERIFIED" ? "READY" as const : "BLOCKED" as const,
        endpoint: project.repository?.gitUrl ?? project.repository?.root ?? project.repository?.baseUrl,
        evidence: project.validation.message
      }))
    ];
  }

  private buildReleaseRiskRegister(args: {
    policyEvaluations: GovernancePolicyEvaluation[];
    readiness: ReleaseReadinessReport[];
    rollout: RolloutStrategyReport[];
    pipelines: PipelineRun[];
    codeUpgrades: CodeUpgradeRun[];
    sourceReleaseRuns: SourceReleaseClosureRun[];
    scenarioMatrix: ReleaseScenarioResult[];
    releaseTargetId: string;
    requiredScenarioIds: string[];
  }): ReleaseRisk[] {
    const risks: ReleaseRisk[] = [];
    const projectsWithPromotedSourceRelease = new Set(args.sourceReleaseRuns
      .filter((run) => run.status === "PROMOTED")
      .map((run) => run.projectId));
    const sourceToGaEvidenceSatisfiesProjectClosure = args.releaseTargetId === "saas-ga" &&
      args.scenarioMatrix.some((scenario) => scenario.id === "saas-field-e2e-source-to-ga" && scenario.status === "PASS");
    for (const policy of args.policyEvaluations.filter((item) => item.status !== "PASSED")) {
      if (sourceToGaEvidenceSatisfiesProjectClosure && projectsWithPromotedSourceRelease.has(policy.scope)) continue;
      risks.push({
        id: `risk-policy-${safeFileName(policy.id)}`,
        severity: policy.severity,
        source: "governance-policy",
        status: "OPEN",
        summary: `${policy.name} 未通过：${policy.rationale}`,
        evidence: [policy.scope],
        recommendedAction: policy.recommendedAction
      });
    }
    for (const report of args.readiness.filter((item) => item.status === "BLOCKED")) {
      if (sourceToGaEvidenceSatisfiesProjectClosure && projectsWithPromotedSourceRelease.has(report.projectId)) continue;
      const failedGate = report.gates.find((gate) => gate.status === "FAILED");
      risks.push({
        id: `risk-readiness-${safeFileName(report.projectId)}`,
        severity: "HIGH",
        source: "release-readiness",
        status: "OPEN",
        summary: `${report.projectId} 发布就绪阻断：${failedGate?.name ?? "未知门禁"}`,
        evidence: report.gates.map((gate) => `${gate.name}:${gate.status}:${gate.detail}`),
        recommendedAction: report.recommendedAction
      });
    }
    for (const report of args.rollout.filter((item) => item.status === "BLOCKED")) {
      if (sourceToGaEvidenceSatisfiesProjectClosure && projectsWithPromotedSourceRelease.has(report.projectId)) continue;
      risks.push({
        id: `risk-rollout-${safeFileName(report.projectId)}`,
        severity: "HIGH",
        source: "rollout-strategy",
        status: "OPEN",
        summary: `${report.projectId} 灰度策略阻断：${report.strategy}`,
        evidence: report.gates.map((gate) => `${gate.name}:${gate.status}:${gate.detail}`),
        recommendedAction: report.recommendedAction
      });
    }
    for (const pipeline of args.pipelines.filter((item) => item.status === "FAILED" || item.status === "CANCELED")) {
      risks.push({
        id: `risk-pipeline-${safeFileName(pipeline.id)}`,
        severity: "MEDIUM",
        source: "ci-cd",
        status: hasLaterSuccessfulPipeline(pipeline, args.pipelines) ? "MITIGATED" : "OPEN",
        summary: `${pipeline.projectId} 流水线 ${pipeline.jobName} ${pipeline.status}`,
        evidence: [pipeline.buildUrl ?? pipeline.id],
        recommendedAction: "确认失败流水线已被批次状态记录，且后续成功流水线释放队列。"
      });
    }
    for (const upgrade of args.codeUpgrades.filter((item) => item.status === "FAILED" || item.status === "CANCELED")) {
      risks.push({
        id: `risk-code-upgrade-${safeFileName(upgrade.id)}`,
        severity: "MEDIUM",
        source: "code-upgrade",
        status: hasLaterSuccessfulCodeUpgrade(upgrade, args.codeUpgrades) ? "MITIGATED" : "OPEN",
        summary: `${upgrade.projectId} 代码升级失败：${upgrade.failureReason ?? upgrade.error ?? upgrade.status}`,
        evidence: [upgrade.artifacts.pullRequestUrl ?? upgrade.artifacts.diffPath ?? upgrade.id],
        recommendedAction: "确认代码升级失败不会触发 CI/CD，并释放或失败对应进化批次。"
      });
    }
    const targetRequiredScenarios = new Set(args.requiredScenarioIds);
    for (const scenario of args.scenarioMatrix.filter((item) => targetRequiredScenarios.has(item.id) && item.required && (item.status === "FAIL" || item.status === "NOT-RUN"))) {
      risks.push({
        id: `risk-scenario-${safeFileName(scenario.id)}`,
        severity: "HIGH",
        source: "scenario-matrix",
        status: "OPEN",
        summary: `${scenario.name} 场景未通过：${scenario.status}`,
        evidence: scenario.evidence,
        recommendedAction: "补跑真实场景或修复产品能力后重新生成发布证据。"
      });
    }
    return dedupeReleaseRisks(risks);
  }

  listRuleMemories(): RuleMemory[] {
    return fs.readdirSync(this.rulesDir)
      .filter((file) => file.endsWith(".md"))
      .sort()
      .map((file) => this.readRuleMemory(path.join(this.rulesDir, file)))
      .filter((rule): rule is RuleMemory => rule !== undefined);
  }

  readTriggerRules(fallbackRules: EvolutionTriggerRule[], projectId?: string): EvolutionTriggerRule[] {
    const persistedRules = this.listRuleMemories()
      .map((memory) => memory.compiledRule)
      .filter((rule) => rule.enabled && isRuleInScope(rule, projectId) && isExecutableRuleValid(rule));
    const merged = new Map<string, EvolutionTriggerRule>();
    for (const rule of fallbackRules.filter((rule) => rule.enabled && isRuleInScope(rule, projectId) && isExecutableRuleValid(rule))) merged.set(rule.id, rule);
    for (const rule of persistedRules) merged.set(rule.id, rule);
    return [...merged.values()];
  }

  private readRuleMemory(file: string): RuleMemory | undefined {
    const markdown = fs.readFileSync(file, "utf8");
    const jsonBlock = markdown.match(/```json\s*([\s\S]*?)\s*```/);
    const traceBlock = markdown.match(/<!-- evopilot-llm-trace\s*([\s\S]*?)\s*-->/);
    if (!jsonBlock) return undefined;
    const compiledRule = JSON.parse(jsonBlock[1]) as EvolutionTriggerRule;
    const llmTrace = traceBlock ? JSON.parse(traceBlock[1]) as Record<string, unknown> : undefined;
    const userPrompt = extractMarkdownField(markdown, "用户规则") ?? compiledRule.userPrompt ?? compiledRule.name;
    const scopedRule = {
      ...compiledRule,
      projectId: compiledRule.projectId ?? inferRuleProjectId(compiledRule.id),
      userPrompt
    };
    return {
      id: scopedRule.id,
      userPrompt,
      enabled: scopedRule.enabled,
      description: scopedRule.description,
      compiledRule: scopedRule,
      storagePath: file,
      llmTrace
    };
  }

  private ruleFile(id: string): string {
    return path.join(this.rulesDir, `${safeFileName(id)}.md`);
  }
}

function mergeHarnessTemplateSources(templates: HarnessTemplateProfile[]): HarnessTemplateProfile[] {
  const merged = new Map<string, HarnessTemplateProfile>();
  for (const template of templates) {
    merged.set(`${template.id}@${template.version}`, template);
  }
  return [...merged.values()].sort((left, right) => {
    if (left.id === right.id) return compareStoreHarnessTemplateVersions(left.version, right.version);
    return left.id.localeCompare(right.id);
  });
}

function compareStoreHarnessTemplateVersions(left: string, right: string): number {
  const leftParts = left.split(/[.-]/).map((part) => Number(part)).map((part) => Number.isFinite(part) ? part : 0);
  const rightParts = right.split(/[.-]/).map((part) => Number(part)).map((part) => Number.isFinite(part) ? part : 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return left.localeCompare(right);
}
