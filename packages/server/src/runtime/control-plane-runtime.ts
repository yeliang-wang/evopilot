import {
  applyReviewDecision,
  createReleaseReport,
  defaultTriggerRules,
  evidenceEventsFromAgentSignals,
  evidenceEventsFromEvaluationResults,
  evidenceEventsFromFeedback,
  evidenceEventsFromOtlpLogs,
  evidenceEventsFromOtlpTraces,
  evidenceEventsFromSkyWalking
} from "@evopilot/core";
import { createLlmClientFromEnv } from "@evopilot/llm";
import { domainforgeFabricProfile } from "@evopilot/profile-domainforge-fabric";
import { randomUUID } from "node:crypto";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_MATURITY_STANDARD_SET_ID,
  MATURITY_PHASES,
  advanceLoopOrchestrationTarget,
  applySourceClosureReviewDecision,
  buildPhasePackages,
  buildProjectOnboardingChecklist,
  buildSourceReleaseClosureRun,
  buildTargetEvidencePackages,
  canBindProjectDefaultLlmProfile,
  canMutateLlmProfile,
  canReadLlmProfile,
  canAccessScopedResource,
  canAccessWorkspace,
  checkLlmProfileReadiness,
  checkProjectDevopsReadiness,
  checkSourceCredentialReadiness,
  collectProjectCodeContext,
  compileRuleWithLlm,
  createAndStoreRunFromEvidence,
  currentReleaseDecision,
  defaultEvaluationDatasets,
  devopsProviderMatchesRepository,
  diagnoseProjectRuntime,
  discoverSourceReleaseRunRepairCandidates,
  encryptSecretValue,
  executeLoopSourceClosure,
  executorGraphFromLoopOrchestrationRequest,
  githubAppInstallationChecks,
  historyView,
  isRecord,
  llmProfileIdFromPayload,
  loopOrchestrationPresets,
  loopOrchestrationTargets,
  loopStoreReadiness,
  maskCodeUpgraderConnector,
  maskDeployConnector,
  maskGitHubAppInstallation,
  maskLlmProfile,
  maskProject,
  maskProjectCodeContext,
  maskSecret,
  maturityStandardTemplates,
  normalizeAuthRole,
  normalizeDecisionAction,
  normalizeDeliveryParameters,
  normalizeEvaluationDataset,
  normalizeEvolutionBatchStatus,
  normalizeExecutorGraph,
  normalizeGoalPlanApprovalConfirmation,
  normalizeLlmProfileBody,
  normalizeLoopArtifact,
  normalizeLoopDecision,
  normalizeLoopTriggerSource,
  normalizeMemoryInboxStatus,
  normalizeOptionalMaturityPhase,
  normalizeProjectDevops,
  normalizeProjectDevopsProvider,
  normalizeProjectLlmBinding,
  normalizeProjectRepository,
  normalizeProjectRuntime,
  normalizeSecretKind,
  normalizeSoakReportStatus,
  normalizeStringList,
  normalizeStringMap,
  normalizeTenantStatus,
  normalizeUserStatus,
  normalizeWorkspaceMemberRole,
  normalizeWorkspaceMemberStatus,
  normalizeWorkspaceQuotas,
  normalizeWorkspaceStatus,
  optionalTrimmedString,
  preflightLoopSourceClosure,
  projectLlmUsage,
  reconcilePendingSourceReleaseDeployFinalizers,
  refreshCodeUpgradeRun,
  refreshPipeline,
  renderOpportunityDraftMarkdown,
  repairSourceReleaseRun,
  repairSourceReleaseRunCandidates,
  repositoryDisplayName,
  repositoryNamespaceFromRegistration,
  resolveLoopLlmSelection,
  resolveWorkspace,
  runLoopOrchestrationAutopilot,
  startCodeUpgradeExecution,
  triggerNativeDevopsDelivery,
  updateProjectSourceCredentials,
  validateProjectRepository,
  workflowCanvasContextFromRequest,
  workspaceUsage
} from "../application/control-plane-services.js";
import { isHarnessTemplateDomainError } from "../domains/harness-template/index.js";
import { serverCompositionRootMetadata } from "../http/composition-root.js";
import {
  HttpError
} from "../http/errors.js";
import {
  diagnosisForHttpStatus,
  httpOutcome,
  latencyBucket,
  redactUrlSearch,
  requestClientMetadata,
  requestCorrelation,
  requestHeader,
  routeGroup
} from "../http/request-logging.js";
import {
  currentLlmResponseUsageMeta,
  envelope,
  llmResponseUsageDelta,
  readJson,
  renderMetrics,
  writeEventStream,
  writeJson,
  writeText
} from "../http/response.js";
import { handleFirstMatchingRoute } from "../http/router.js";
import { handleAdminRoutes } from "../http/routes/admin.js";
import { handleAuditHistoryRoutes } from "../http/routes/audit-history.js";
import {
  handleProtectedAuthRoute,
  handlePublicAuthRoute
} from "../http/routes/auth.js";
import { handleConnectorRoutes } from "../http/routes/connectors.js";
import { handleDeliveryRoutes } from "../http/routes/delivery.js";
import { handleEvaluationRoutes } from "../http/routes/evaluation.js";
import { handleGoalRoutes } from "../http/routes/goals.js";
import { handleHarnessRoutes } from "../http/routes/harness.js";
import { handleLoopRuntimeRoutes } from "../http/routes/loop-runtime.js";
import { handleLoopRoutes } from "../http/routes/loops.js";
import { handleMaturityRoutes } from "../http/routes/maturity.js";
import { handlePlatformRoute } from "../http/routes/platform.js";
import { handleProjectRoutes } from "../http/routes/projects.js";
import { handleReadModelRoute } from "../http/routes/read-models.js";
import { handleReleaseEvidenceRoutes } from "../http/routes/release-evidence.js";
import { handleReleaseTargetRoutes } from "../http/routes/release-targets.js";
import { handleRuleRoutes } from "../http/routes/rules.js";
import { handleSettingsRoute } from "../http/routes/settings.js";
import { handleTargetLoopRoutes } from "../http/routes/target-loops.js";
import {
  logError,
  logInfo,
  logWarn,
  setActiveLoggingSettings
} from "../http/server-logging.js";
import { serveDashboard } from "../http/static-assets.js";
import type {
  AuthContext,
  EvoPilotServerOptions
} from "../model.js";
import { FileStore } from "../storage/file-store/index.js";
import { safeFileName } from "../storage/json-files.js";
import {
  extractImConversationId,
  extractImText,
  loadProofOpsCoreContract,
  normalizeReleaseTarget,
  normalizeScenarioMatrix,
  parseConversationCommand
} from "./release-targets.js";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_WORKSPACE_ID,
  assertProductionRuntimeIsConfigured,
  audit,
  authUserFromRecord,
  authorize,
  getIdempotencyKey,
  hasRole,
  hashPassword,
  loadEnvFile,
  maskUser,
  mergeUserTokens,
  normalizeTokens,
  normalizeUsers,
  parseBoolean,
  parseEnvTokens,
  parseEnvUsers,
  publicUser,
  requireBodyString,
  resolveRuntimeConfig,
  userSessionToken,
  verifyPassword
} from "./runtime-auth.js";

export type {
  AdversarialEvaluation,
  AuditRecord,
  AuthContext,
  AuthRole,
  AuthToken,
  AuthUser,
  CodeUpgradeEvent,
  CodeUpgradeRun,
  CompiledProjectHarnessProfile,
  CompiledTenantHarnessPolicy,
  CostReport,
  DeliveryExecutor,
  DeliveryExecutorResult,
  DiscoverySkillCandidate,
  EvaluationDataset,
  EvoPilotRuntimeMode,
  EvoPilotServerOptions,
  EvolutionBatch,
  EvolutionBatchStatus,
  EvolutionFreezeDiagnostic,
  ExecutorAdapter,
  ExecutorAdapterExecutionInput,
  ExecutorAdapterExecutionOutput,
  ExecutorCoordinationPlan,
  ExecutorEdge,
  ExecutorGraph,
  ExecutorNode,
  ExecutorNodeType,
  ExecutorStepResult,
  FindingWorktreeHandoff,
  GitHubAppInstallationRecord,
  GlobalGoal,
  GlobalGoalStatus,
  GoalAdvanceResult,
  GoalCompletionReport,
  GoalEvidenceMatrixRow,
  GoalGraph,
  GoalNextAction,
  GoalPlan,
  GoalPlanApprovalConfirmation,
  GoalPlanPlannerTrace,
  GoalPlanSelectedHarnessBinding,
  GoalPlanStatus,
  GoalRunStatus,
  GoalSnapshot,
  GoalTarget,
  GoalTargetLayer,
  GoalTargetStatus,
  GoalTimelineEvent,
  GovernancePolicyEvaluation,
  HarnessTemplateSelection,
  HarnessTemplateSelectionMode,
  LlmProfileProvider,
  LlmProfileReadiness,
  LlmProfileRecord,
  LlmUsageStepSummary,
  LlmUsageSummary,
  LoopArtifact,
  LoopCheckpoint,
  LoopDecision,
  LoopEvidenceSet,
  LoopExecutorMode,
  LoopExternalBlocker,
  LoopGuardrailEvaluation,
  LoopIteration,
  LoopLlmSelection,
  LoopMemoryInboxItem,
  LoopOrchestrationAdvanceResult,
  LoopOrchestrationAutopilotResult,
  LoopOrchestrationTarget,
  LoopOrchestrationTargetStatus,
  LoopReplayDiff,
  LoopRetryPolicy,
  LoopRun,
  LoopRunStatus,
  LoopSandboxBoundaryProof,
  LoopSandboxEnforcement,
  LoopSandboxPolicy,
  LoopSandboxRuntimeType,
  LoopSourceClosure,
  LoopSourceClosureGate,
  LoopSourceClosureState,
  LoopStopPolicy,
  LoopStoreBackendType,
  LoopStoreRuntime,
  LoopStreamEvent,
  LoopTimelineEvent,
  LoopTraceSummary,
  LoopTraceTree,
  LoopTriggerSource,
  LoopWorkerLease,
  LoopWorkerQueueClaim,
  LoopWorkerQueueItem,
  MaturityPhase,
  MaturityStandardTemplate,
  OpportunityInsight,
  PhaseDecisionStatus,
  PhasePackage,
  PhaseTarget,
  PhaseTargetStatus,
  ProjectClaimBoundary,
  ProjectCodeContext,
  ProjectDevopsConfiguration,
  ProjectDevopsProvider,
  ProjectDevopsReadiness,
  ProjectEvolutionCursor,
  ProjectExecutionMode,
  ProjectHarnessProfileDiff,
  ProjectHarnessProfileSource,
  ProjectHarnessProfileSourceFormat,
  ProjectHarnessProfileStatus,
  ProjectHarnessProfileSummary,
  ProjectHarnessProfileValidationResult,
  ProjectHarnessProfileVersion,
  ProjectLlmBinding,
  ProjectOnboardingChecklist,
  ProjectRepositoryCredentials,
  ProjectRepositoryProvider,
  ProjectRepositoryRef,
  ProjectRepositoryRegistration,
  ProjectRepositoryTopology,
  ProjectRuntimeConfiguration,
  ProjectRuntimeDiagnostic,
  ProjectValidation,
  ProofOpsCoreContract,
  RecurringLoopSchedule,
  ReleaseDecision,
  ReleaseDecisionCriterion,
  ReleaseEvidenceBundle,
  ReleaseEvidenceListItem,
  ReleaseReadinessReport,
  ReleaseRisk,
  ReleaseScenarioResult,
  ReleaseScenarioStatus,
  ReleaseTargetProfile,
  ReviewCapability,
  RolloutStrategyReport,
  RuleMemory,
  RuntimeConfig,
  ScheduledEvolution,
  SecretKind,
  SecretRecord,
  ServiceScorecard,
  SloReport,
  SoakReport,
  SourceClosurePreflightResult,
  SourceCredentialReadiness,
  SourceReleaseClosureRun,
  SourceReleaseClosureStage,
  SourceReleaseDeployFinalizer,
  SourceReleasePolicyStatus,
  SourceReleasePostMergeDeployStatus,
  SourceReleaseReviewStatus,
  SourceReleaseRunRepairCandidate,
  SourceReleaseRunRepairQueueResult,
  StoredCodeUpgraderConnector,
  StoredDeployConnector,
  StoredProject,
  StoredRun,
  SupplyChainReport,
  TargetEvidencePackage,
  TargetEvidenceStatus,
  TargetLoopDecisionStep,
  TargetLoopEvidenceRow,
  TargetLoopRun,
  TargetLoopStatus,
  TenantHarnessPolicyRef,
  TenantHarnessPolicySource,
  TenantHarnessPolicySourceFormat,
  TenantHarnessPolicyStatus,
  TenantHarnessPolicySummary,
  TenantHarnessPolicyValidationResult,
  TenantHarnessPolicyVersion,
  TenantRecord,
  UserRecord,
  WorkspaceMemberRole,
  WorkspaceRecord
} from "../model.js";

export function createServer(options: EvoPilotServerOptions): http.Server {
  const profile = options.profile ?? domainforgeFabricProfile;
  const runtime = resolveRuntimeConfig(options);
  const llmClient = options.llmClient ?? createLlmClientFromEnv();
  const requireLlm = runtime.requireLlm;
  const tokens = normalizeTokens(options);
  const store = new FileStore(options.dataRoot, { llmClient, requireLlm, harnessCatalogDirs: options.harnessCatalogDirs });
  setActiveLoggingSettings(store.readLoggingSettings());
  store.ensureBootstrapAdmin();
  const users = normalizeUsers(options, tokens, runtime, store);
  const authTokens = mergeUserTokens(tokens, users);
  const explicitAuthConfigured = tokens.length > 0 || Boolean(options.users?.length) || Boolean(parseEnvUsers(process.env.EVOPILOT_USERS)?.length);
  assertProductionRuntimeIsConfigured(runtime, authTokens, llmClient);
  const proofOpsCore = loadProofOpsCoreContract(options.proofOpsCoreContractPath);
  store.ensureRuleMemories(profile.triggerRules ?? defaultTriggerRules);
  if (runtime.autoRegisterProfileProject) {
    store.ensureProject({
      id: profile.id,
      name: profile.name,
      profileId: profile.id,
      tenantId: DEFAULT_TENANT_ID,
      workspaceId: DEFAULT_WORKSPACE_ID,
      validation: {
        status: "VERIFIED",
        checkedAt: new Date().toISOString(),
        message: "调试模式内置项目画像已验证"
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  logInfo("server.configured", {
    metadata: {
      runtimeMode: runtime.mode,
      dataRoot: options.dataRoot,
      authRequired: authTokens.length > 0,
      loginEnabled: users.length > 0,
      profileId: profile.id,
      dashboardEnabled: Boolean(options.dashboardRoot),
      logging: store.readLoggingSettings(),
      architecture: serverCompositionRootMetadata()
    }
  });
  void reconcilePendingSourceReleaseDeployFinalizers(store).catch((error) => logError("source-release.deploy-finalizer.reconcile-failed", error));

  return http.createServer(async (request, response) => {
    const startedAt = Date.now();
    const requestId = requestHeader(request, "x-request-id") || randomUUID();
    const traceId = requestHeader(request, "traceparent")?.split("-")[1] || requestHeader(request, "x-trace-id");
    const parentRequestId = requestHeader(request, "x-parent-request-id");
    const llmUsageBeforeRequest = currentLlmResponseUsageMeta();
    let requestAuth: AuthContext | undefined;
    let requestErrorCode: string | undefined;
    response.setHeader("x-request-id", requestId);
    let url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const statusCode = response.statusCode;
      logInfo("http.request.completed", {
        requestId,
        tenantId: requestAuth?.tenantId,
        workspaceId: requestAuth?.workspaceId,
        actor: requestAuth?.actor,
        role: requestAuth?.role,
        method: request.method,
        path: url.pathname,
        statusCode,
        durationMs,
        latencyBucket: latencyBucket(durationMs),
        routeGroup: routeGroup(url.pathname),
        outcome: httpOutcome(statusCode),
        errorCode: requestErrorCode,
        correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
        diagnosis: diagnosisForHttpStatus(statusCode, requestErrorCode),
        metadata: {
          query: redactUrlSearch(url.searchParams),
          userAgent: requestHeader(request, "user-agent"),
          client: requestClientMetadata(request),
          llmUsage: llmResponseUsageDelta(llmUsageBeforeRequest, currentLlmResponseUsageMeta())
        }
      });
    });
    try {
      url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (serveDashboard(request, response, url, options.dashboardRoot)) return;
      if (await handleFirstMatchingRoute([
        () => handlePlatformRoute({
          request,
          response,
          url,
          profileId: profile.id,
          runtimeMode: runtime.mode,
          dataRoot: options.dataRoot,
          authRequired: tokens.length > 0,
          ready: store.isReady(),
          schemaVersion: store.metadata().schemaVersion,
          dashboardEnabled: Boolean(options.dashboardRoot)
        }),
        () => handlePublicAuthRoute({
          request,
          response,
          url,
          requestId,
          options,
          tokens,
          runtime,
          store,
          setRequestErrorCode: (code) => { requestErrorCode = code; },
          deps: {
            readJson,
            writeJson,
            envelope,
            optionalTrimmedString,
            normalizeUsers,
            verifyPassword,
            logInfo,
            logWarn,
            publicUser,
            userSessionToken
          }
        })
      ])) return;
      const auth = authorize(request, mergeUserTokens(tokens, normalizeUsers(options, tokens, runtime, store)), runtime, !explicitAuthConfigured);
      const routeWriteJson = (targetResponse: http.ServerResponse, statusCode: number, body: unknown) => {
        writeJson(targetResponse, statusCode, body);
        return true;
      };
      requestAuth = auth ?? undefined;
      if (!auth) {
        requestErrorCode = "UNAUTHORIZED";
        logWarn("http.request.rejected", {
          requestId,
          method: request.method,
          path: url.pathname,
          statusCode: 401,
          routeGroup: routeGroup(url.pathname),
          outcome: "rejected",
          errorCode: "UNAUTHORIZED",
          error: "UNAUTHORIZED",
          correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
          diagnosis: diagnosisForHttpStatus(401, "UNAUTHORIZED")
        });
        return writeJson(response, 401, { error: "UNAUTHORIZED" });
      }
      if (await handleFirstMatchingRoute([
        () => handleProtectedAuthRoute({
          request,
          response,
          url,
          auth,
          options,
          store,
          deps: {
            readJson,
            writeJson,
            envelope,
            verifyPassword,
            hashPassword,
            audit,
            authUserFromRecord,
            publicUser,
            userSessionToken
          }
        }),
        () => handleSettingsRoute({
          request,
          response,
          url,
          auth,
          options,
          store,
          deps: {
            audit,
            envelope,
            hasRole,
            readJson,
            setActiveLoggingSettings,
            writeJson
          }
        }),
        () => handleReadModelRoute({
          request,
          response,
          url,
          auth,
          store,
          profile,
          deps: {
            envelope,
            hasRole,
            renderMetrics,
            writeJson,
            writeText
          }
        })
      ])) return;
      if (await handleRuleRoutes({
        request,
        response,
        url,
        auth,
        store,
        options,
        profile,
        llmClient,
        requireLlm,
        deps: {
          audit,
          compileRuleWithLlm,
          envelope,
          hasRole,
          readJson,
          writeJson: routeWriteJson
        }
      })) return;
      if (await handleEvaluationRoutes({
        request,
        response,
        url,
        auth,
        store,
        options,
        runtime,
        profile,
        deps: {
          audit,
          defaultEvaluationDatasets,
          envelope,
          hasRole,
          normalizeEvaluationDataset,
          normalizeSoakReportStatus,
          readJson,
          writeJson: routeWriteJson
        }
      })) return;
      if (await handleReleaseTargetRoutes({
        request,
        response,
        url,
        auth,
        store,
        options,
        deps: {
          audit,
          envelope,
          hasRole,
          normalizeReleaseTarget,
          readJson,
          writeJson: routeWriteJson
        }
      })) return;
      if (await handleMaturityRoutes({
        request,
        response,
        url,
        auth,
        deps: {
          DEFAULT_MATURITY_STANDARD_SET_ID,
          MATURITY_PHASES,
          envelope,
          hasRole,
          maturityStandardTemplates,
          writeJson: routeWriteJson
        }
      })) return;
      if (await handleHarnessRoutes({
        request,
        response,
        url,
        auth,
        store,
        options,
        requestId,
        traceId,
        parentRequestId,
        setRequestErrorCode: (code) => { requestErrorCode = code; },
        deps: {
          envelope,
          hasRole,
          safeFileName,
          writeJson: routeWriteJson
        }
      })) return;
      if (await handleGoalRoutes({
        request,
        response,
        url,
        auth,
        store,
        options,
        profile,
        requireLlm,
        deps: {
          audit,
          buildPhasePackages,
          buildTargetEvidencePackages,
          canAccessScopedResource,
          canAccessWorkspace,
          canBindProjectDefaultLlmProfile,
          currentReleaseDecision,
          DEFAULT_MATURITY_STANDARD_SET_ID,
          envelope,
          hasRole,
          llmProfileIdFromPayload,
          normalizeGoalPlanApprovalConfirmation,
          normalizeLoopDecision,
          normalizeOptionalMaturityPhase,
          optionalTrimmedString,
          readJson,
          resolveLoopLlmSelection,
          safeFileName,
          writeJson: routeWriteJson
        }
      })) return;
      if (await handleAdminRoutes({
        request,
        response,
        url,
        auth,
        store,
        options,
        profile,
        runtime,
        deps: {
          audit,
          buildProjectOnboardingChecklist,
          canMutateLlmProfile,
          canReadLlmProfile,
          canAccessScopedResource,
          canAccessWorkspace,
          checkLlmProfileReadiness,
          encryptSecretValue,
          envelope,
          githubAppInstallationChecks,
          hasRole,
          hashPassword,
          isRecord,
          logInfo,
          maskGitHubAppInstallation,
          maskLlmProfile,
          maskSecret,
          maskUser,
          normalizeAuthRole,
          normalizeLlmProfileBody,
          normalizeSecretKind,
          normalizeTenantStatus,
          normalizeUserStatus,
          normalizeWorkspaceMemberRole,
          normalizeWorkspaceMemberStatus,
          normalizeWorkspaceQuotas,
          normalizeWorkspaceStatus,
          optionalTrimmedString,
          readJson,
          requireBodyString,
          resolveWorkspace,
          safeFileName,
          workspaceUsage,
          writeJson: routeWriteJson
        }
      })) return;
      if (await handleLoopRuntimeRoutes({
        request,
        response,
        url,
        auth,
        store,
        options,
        profile,
        requireLlm,
        deps: {
          advanceLoopOrchestrationTarget,
          audit,
          envelope,
          executorGraphFromLoopOrchestrationRequest,
          hasRole,
          llmProfileIdFromPayload,
          loopOrchestrationPresets,
          loopOrchestrationTargets,
          loopStoreReadiness,
          isRecord,
          normalizeExecutorGraph,
          normalizeMemoryInboxStatus,
          optionalTrimmedString,
          readJson,
          resolveLoopLlmSelection,
          runLoopOrchestrationAutopilot,
          safeFileName,
          workflowCanvasContextFromRequest,
          writeJson: routeWriteJson
        }
      })) return;
      if (await handleLoopRoutes({
        request,
        response,
        url,
        auth,
        store,
        options,
        requireLlm,
        deps: {
          applySourceClosureReviewDecision,
          audit,
          buildSourceReleaseClosureRun,
          canAccessScopedResource,
          canAccessWorkspace,
          discoverSourceReleaseRunRepairCandidates,
          envelope,
          executeLoopSourceClosure,
          getIdempotencyKey,
          hasRole,
          isRecord,
          llmProfileIdFromPayload,
          normalizeLoopArtifact,
          normalizeLoopDecision,
          normalizeLoopTriggerSource,
          optionalTrimmedString,
          preflightLoopSourceClosure,
          readJson,
          repairSourceReleaseRun,
          repairSourceReleaseRunCandidates,
          resolveLoopLlmSelection,
          safeFileName,
          workspaceUsage,
          writeEventStream,
          writeJson: routeWriteJson
        }
      })) return;
      if (await handleTargetLoopRoutes({
        request,
        response,
        url,
        auth,
        store,
        options,
        deps: {
          audit,
          envelope,
          extractImConversationId,
          extractImText,
          hasRole,
          normalizeScenarioMatrix,
          parseConversationCommand,
          proofOpsCore,
          readJson,
          writeJson: routeWriteJson
        }
      })) return;
      if (await handleReleaseEvidenceRoutes({
        request,
        response,
        url,
        auth,
        store,
        options,
        runtime,
        profile,
        llmClient,
        requireLlm,
        deps: {
          audit,
          canAccessScopedResource,
          collectProjectCodeContext,
          defaultEvaluationDatasets,
          envelope,
          hasRole,
          maskProjectCodeContext,
          normalizeEvolutionBatchStatus,
          normalizeScenarioMatrix,
          optionalTrimmedString,
          readJson,
          renderOpportunityDraftMarkdown,
          writeJson: routeWriteJson
        }
      })) return;
      if (await handleConnectorRoutes({
        request,
        response,
        url,
        auth,
        store,
        options,
        runtime,
        deps: {
          audit,
          envelope,
          hasRole,
          maskCodeUpgraderConnector,
          maskDeployConnector,
          normalizeStringList,
          normalizeStringMap,
          readJson,
          requireBodyString,
          writeJson: routeWriteJson
        }
      })) return;
      if (await handleProjectRoutes({
        request,
        response,
        url,
        auth,
        store,
        options,
        runtime,
        profile,
        requireLlm,
        deps: {
          audit,
          canAccessScopedResource,
          checkLlmProfileReadiness,
          canBindProjectDefaultLlmProfile,
          checkProjectDevopsReadiness,
          checkSourceCredentialReadiness,
          devopsProviderMatchesRepository,
          diagnoseProjectRuntime,
          envelope,
          hasRole,
          logInfo,
          maskLlmProfile,
          maskProject,
          normalizeProjectDevops,
          normalizeProjectLlmBinding,
          normalizeProjectRepository,
          normalizeProjectRuntime,
          optionalTrimmedString,
          projectLlmUsage,
          readJson,
          repositoryDisplayName,
          repositoryNamespaceFromRegistration,
          resolveLoopLlmSelection,
          safeFileName,
          updateProjectSourceCredentials,
          validateProjectRepository,
          workspaceUsage,
          writeJson: routeWriteJson
        }
      })) return;
      if (await handleDeliveryRoutes({
        request,
        response,
        url,
        auth,
        store,
        options,
        runtime,
        profile,
        deps: {
          applyReviewDecision,
          audit,
          checkProjectDevopsReadiness,
          createAndStoreRunFromEvidence,
          createReleaseReport,
          envelope,
          evidenceEventsFromAgentSignals,
          evidenceEventsFromEvaluationResults,
          evidenceEventsFromFeedback,
          evidenceEventsFromOtlpLogs,
          evidenceEventsFromOtlpTraces,
          evidenceEventsFromSkyWalking,
          getIdempotencyKey,
          hasRole,
          normalizeDecisionAction,
          normalizeDeliveryParameters,
          normalizeProjectDevopsProvider,
          readJson,
          refreshCodeUpgradeRun,
          refreshPipeline,
          startCodeUpgradeExecution,
          triggerNativeDevopsDelivery,
          writeJson: routeWriteJson,
          writeText
        }
      })) return;
      if (await handleAuditHistoryRoutes({
        request,
        response,
        url,
        auth,
        store,
        deps: {
          envelope,
          hasRole,
          historyView,
          writeJson: routeWriteJson
        }
      })) return;
      return writeJson(response, 404, { error: "NOT_FOUND" });
    } catch (error) {
      if (isHarnessTemplateDomainError(error)) {
        requestErrorCode = error.code;
        logWarn("http.request.rejected", {
          requestId,
          tenantId: requestAuth?.tenantId,
          workspaceId: requestAuth?.workspaceId,
          actor: requestAuth?.actor,
          role: requestAuth?.role,
          method: request.method,
          path: url.pathname,
          statusCode: error.statusCode,
          routeGroup: routeGroup(url.pathname),
          outcome: httpOutcome(error.statusCode),
          errorCode: error.code,
          error: error.detail ?? error.code,
          correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
          diagnosis: diagnosisForHttpStatus(error.statusCode, error.code)
        });
        return writeJson(response, error.statusCode, { error: error.code, detail: error.detail, requestId });
      }
      if (error instanceof HttpError) {
        requestErrorCode = error.code;
        logWarn("http.request.rejected", {
          requestId,
          tenantId: requestAuth?.tenantId,
          workspaceId: requestAuth?.workspaceId,
          actor: requestAuth?.actor,
          role: requestAuth?.role,
          method: request.method,
          path: url.pathname,
          statusCode: error.statusCode,
          routeGroup: routeGroup(url.pathname),
          outcome: httpOutcome(error.statusCode),
          errorCode: error.code,
          error: error.detail ?? error.code,
          correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
          diagnosis: diagnosisForHttpStatus(error.statusCode, error.code)
        });
        return writeJson(response, error.statusCode, { error: error.code, detail: error.detail, requestId });
      }
      requestErrorCode = "SERVER_ERROR";
      logError("http.request.failed", error, {
        requestId,
        tenantId: requestAuth?.tenantId,
        workspaceId: requestAuth?.workspaceId,
        actor: requestAuth?.actor,
        role: requestAuth?.role,
        method: request.method,
        path: url.pathname,
        statusCode: 500,
        routeGroup: routeGroup(url.pathname),
        outcome: "failed",
        correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
        diagnosis: diagnosisForHttpStatus(500)
      });
      return writeJson(response, 500, { error: error instanceof Error ? error.message : String(error), requestId });
    }
  });
}

export function startServerFromEnvironment(): http.Server {
  loadEnvFile(process.env.EVOPILOT_ENV_FILE ?? path.resolve("data/evopilot/evopilot.env"));
  const dataRoot = process.env.EVOPILOT_DATA_ROOT ?? path.resolve("data/evopilot");
  loadEnvFile(process.env.EVOPILOT_LLM_ENV_FILE ?? path.join(dataRoot, "llm.env"));
  const port = Number(process.env.EVOPILOT_PORT ?? "19876");
  const host = process.env.EVOPILOT_HOST ?? "127.0.0.1";
  const dashboardRoot = process.env.EVOPILOT_DASHBOARD_ROOT ? path.resolve(process.env.EVOPILOT_DASHBOARD_ROOT) : undefined;
  const harnessCatalogDirs = parseHarnessCatalogDirs(process.env.EVOPILOT_HARNESS_CATALOG_DIRS ?? process.env.EVOPILOT_HARNESS_CATALOG_DIR);
  const tokens = parseEnvTokens(process.env.EVOPILOT_TOKENS);
  const users = parseEnvUsers(process.env.EVOPILOT_USERS);
  const apiToken = process.env.EVOPILOT_API_TOKEN;
  const server = createServer({ dataRoot, dashboardRoot, apiToken, tokens, users, harnessCatalogDirs }).listen(port, host, () => {
    const runtimeMode = process.env.EVOPILOT_RUN_MODE ?? process.env.EVOPILOT_MODE ?? (parseBoolean(process.env.EVOPILOT_DEBUG, false) ? "debug" : "prod");
    logInfo("server.started", {
      metadata: {
        url: `http://${host}:${port}`,
        host,
        port,
        runtimeMode,
        dataRoot,
        dashboardRoot,
        harnessCatalogDirs,
        authConfigured: Boolean(apiToken || tokens?.length || users?.length),
        loginEnabled: Boolean(users?.length)
      }
    });
  });
  process.on("uncaughtException", (error) => {
    logError("process.uncaught-exception", error);
  });
  process.on("unhandledRejection", (reason) => {
    logError("process.unhandled-rejection", reason);
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      logWarn("server.stopping", { metadata: { signal } });
      server.close(() => process.exit(0));
    });
  }
  return server;
}

function parseHarnessCatalogDirs(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(new RegExp(`[${escapeRegExp(path.delimiter)},]`))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startServerFromEnvironment();
}
