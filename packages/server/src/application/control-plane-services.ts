import { CodeUpgraderClient, type CodeUpgraderRunStatus } from "@evopilot/adapter-code-upgrader";
import { GitHubHttpAdapter, type GitHubPullRequestDraft } from "@evopilot/adapter-github";
import { GitLabHttpAdapter } from "@evopilot/adapter-gitlab";
import { listRepositoryFiles } from "@evopilot/adapter-local-git";
import {
  createPipelineRun,
  createReleaseReport,
  defaultTriggerRules,
  pipelineStatusToReleaseStatus,
  runEvolutionCycle,
  type DeliveryPlan,
  type EvolutionOpportunity,
  type EvolutionPlan,
  type EvolutionTriggerCondition,
  type EvolutionTriggerRule,
  type PipelineRun,
  type PipelineStage,
  type PipelineStatus,
  type ProjectProfile,
  type ReviewRecord,
  type RuntimeEvidenceEvent
} from "@evopilot/core";
import { LlmProxy, createLlmConfigFromEnv, type LlmGenerateResponse, type LlmTaskClient } from "@evopilot/llm";
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  harnessTemplateRef,
  hydrateHarnessCapabilities,
  hydrateHarnessPhaseMapping,
  hydrateHarnessTemplate,
  hydrateHarnessTemplateChangelog,
  hydrateHarnessTemplateRef,
  type HarnessCapabilityDefinition,
  type HarnessTemplateProfile,
  type HarnessTemplateRef
} from "../domains/harness-template/index.js";
import {
  httpError
} from "../http/errors.js";
import {
  logInfo,
  logWarn
} from "../http/server-logging.js";
import {
  domainHarnessEvidenceAdapters,
  domainHarnessReleaseBlockers,
  domainHarnessRequiredActionIds,
  domainHarnessRequiredActions,
  projectDomainHarnessRepoProbe,
  projectRepositoryFileHints
} from "./project-harness-domain-execution.js";
import type {
  AuthContext,
  AuthRole,
  CodeUpgradeEvent,
  CodeUpgradeRun,
  CompiledProjectHarnessProfile,
  CompiledTenantHarnessPolicy,
  CostReport,
  DiscoverySkillCandidate,
  EvaluationDataset,
  EvolutionBatch,
  EvolutionBatchStatus,
  ExecutorCoordinationPlan,
  ExecutorEdge,
  ExecutorGraph,
  ExecutorNode,
  ExecutorNodeType,
  ExecutorStepResult,
  GitHubAppInstallationRecord,
  GlobalGoal,
  GlobalGoalStatus,
  GoalAdvanceResult,
  GoalCompletionReport,
  GoalEvidenceMatrixRow,
  GoalNextAction,
  GoalPlan,
  GoalPlanApprovalConfirmation,
  GoalPlanPlannerTrace,
  GoalPlanProjectHarnessBinding,
  GoalPlanStatus,
  GoalRunStatus,
  GoalSnapshot,
  GoalTarget,
  GoalTargetLayer,
  GoalTargetStatus,
  GoalTimelineEvent,
  GovernancePolicyEvaluation,
  HarnessTemplateSelection,
  LlmProfileProvider,
  LlmProfileScope,
  LlmProviderPreset,
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
  LoopWorkerQueueItem,
  MaturityPhase,
  MaturityStandardTemplate,
  PhaseDecisionStatus,
  PhasePackage,
  PhaseTarget,
  PhaseTargetStatus,
  ProjectClaimBoundary,
  ProjectCodeContext,
  ProjectDevopsConfiguration,
  ProjectDevopsProvider,
  ProjectDevopsReadiness,
  ProjectDevopsSourceMode,
  ProjectEvolutionCursor,
  ProjectExecutionMode,
  ProjectHarnessProfileDiff,
  ProjectHarnessProfileSource,
  ProjectHarnessProfileSourceFormat,
  ProjectHarnessProfileStatus,
  ProjectHarnessProfileValidationResult,
  ProjectHarnessProfileVersion,
  ProjectLlmUsageProjection,
  ProjectLlmBinding,
  ProjectOnboardingChecklist,
  ProjectProviderModelUsageProjection,
  ProjectRepositoryCredentials,
  ProjectRepositoryProvider,
  ProjectRepositoryRef,
  ProjectRepositoryRegistration,
  ProjectRepositoryTopology,
  ProjectRuntimeConfiguration,
  ProjectRuntimeDiagnostic,
  ProjectValidation,
  RecurringLoopSchedule,
  ReleaseDecision,
  ReleaseTargetProfile,
  ReviewCapability,
  RuleMemory,
  RuntimeConfig,
  SecretKind,
  SecretRecord,
  ServiceScorecard,
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
  TargetEvidencePackage,
  TenantHarnessPolicyRef,
  TenantHarnessPolicySource,
  TenantHarnessPolicySourceFormat,
  TenantHarnessPolicyStatus,
  TenantHarnessPolicyValidationResult,
  TenantHarnessPolicyVersion,
  TenantRecord,
  UserRecord,
  WorkspaceMemberRole,
  WorkspaceRecord,
  WorkspaceUsageProjection
} from "../model.js";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_WORKSPACE_ID,
  audit,
  requireBodyString
} from "../runtime/runtime-auth.js";
import type { FileStore } from "../storage/file-store/index.js";
import { atomicWriteJson, safeFileName } from "../storage/json-files.js";

export const REPAIRABLE_SOURCE_RELEASE_RUN_STATUSES: LoopSourceClosureState[] = ["FAILED", "HEALTH_FAILED", "ROLLED_BACK"];

export function defaultEvolutionCursor(projectId: string): ProjectEvolutionCursor {
  return {
    projectId,
    lastProcessedDatasetIds: [],
    updatedAt: new Date().toISOString()
  };
}

export function defaultExecutorGraph(): ExecutorGraph {
  const now = new Date().toISOString();
  return {
    schema: "evopilot-executor-graph/v1",
    id: "default-loop-engineering",
    name: "Default Loop Engineering Graph",
    nodes: [
      { id: "context", type: "llm", name: "Context Builder", config: { output: "loop context and next action hypothesis" } },
      { id: "remediate", type: "code-upgrader", name: "Remediation Executor", config: { optional: true } },
      { id: "ci", type: "ci", name: "CI/CD Validator", config: { optional: true } },
      { id: "validate", type: "validator", name: "Independent Evidence Validator", config: { independent: true } },
      { id: "approval", type: "approval", name: "Human Approval Gate", config: { requiredForRelease: true } }
    ],
    edges: [
      { from: "context", to: "remediate", type: "sequence", outputSchemaRef: "loop-context/v1" },
      { from: "remediate", to: "ci", type: "conditional", condition: "codeChanged == true", inputSchemaRef: "code-diff/v1", outputSchemaRef: "ci-request/v1" },
      { from: "ci", to: "validate", type: "fan-in", inputSchemaRef: "ci-result/v1", outputSchemaRef: "validation-evidence/v1" },
      { from: "validate", to: "approval", type: "sequence", condition: "releaseRisk != low", inputSchemaRef: "validation-evidence/v1" }
    ],
    mode: "serial",
    validation: {
      status: "PASSED",
      evidence: ["nodeIds=unique", "edges=typed", "schemas=declared", "nestedSubgraphs=allowed"]
    },
    capabilities: {
      typedEdges: true,
      conditionalRouting: true,
      fanOutFanIn: true,
      nestedSubgraphs: true,
      schemaValidation: true
    },
    createdAt: now,
    updatedAt: now
  };
}

export function executorGraphFromLoopOrchestrationRequest(body: any, presetId: string): ExecutorGraph {
  const context = workflowCanvasContextFromRequest(body);
  if (!context) return selfEvolutionExecutorGraph();
  const routingMode = context.routingMode;
  const releaseGate = context.releaseGate;
  const humanGate = context.humanGate;
  const graphId = `dashboard-workflow-${safeFileName(String(body.projectId ?? "evopilot"))}-${Date.now()}`;
  return normalizeExecutorGraph({
    id: graphId,
    name: `Dashboard Workflow Canvas (${routingMode})`,
    mode: routingMode === "fanout-evaluator" ? "parallel" : "serial",
    nodes: [
      {
        id: "target",
        type: "llm",
        name: "Target Contract",
        config: {
          adapterId: "evopilot.target-contract-adapter",
          presetId,
          inputSchema: { objective: "string", projectId: "string" },
          outputSchema: { targetContract: "object", acceptanceCriteria: "array" },
          visualRole: "target"
        }
      },
      {
        id: "discovery",
        type: "validator",
        name: "Discovery Evidence",
        config: {
          adapterId: "evopilot.discovery-runtime-adapter",
          inputSchema: { targetContract: "object" },
          outputSchema: { findings: "array", datasets: "array" },
          visualRole: "discovery"
        }
      },
      {
        id: "executor",
        type: "code-upgrader",
        name: "Executor Runtime",
        config: {
          adapterId: "evopilot.code-upgrader-adapter",
          inputSchema: { findings: "array" },
          outputSchema: { files: "array", artifacts: "array" },
          visualRole: "executor"
        }
      },
      {
        id: "evaluator",
        type: "validator",
        name: "Adversarial Evaluator",
        config: {
          adapterId: "evopilot.adversarial-evaluator-adapter",
          inputSchema: { files: "array", artifacts: "array" },
          outputSchema: { guardrails: "array", decision: "string" },
          visualRole: "evaluator"
        }
      },
      {
        id: "human-gate",
        type: "approval",
        name: "Human Gate",
        config: {
          requiredForRelease: true,
          policy: humanGate ? "human-first" : "conditional",
          inputSchema: { decision: "string", guardrails: "array" },
          outputSchema: { approval: "object" },
          visualRole: "human-gate"
        }
      },
      {
        id: "release",
        type: "release-action",
        name: "Release Closure",
        config: {
          adapterId: "evopilot.source-release-adapter",
          subgraphId: "source-closure/v1",
          releaseGate,
          inputSchema: { approval: "object", artifacts: "array" },
          outputSchema: { sourceClosure: "object", deployment: "object" },
          visualRole: "release"
        }
      }
    ],
    edges: [
      { from: "target", to: "discovery", type: "sequence", outputSchemaRef: "target-contract/v1" },
      { from: "discovery", to: "executor", type: routingMode === "fanout-evaluator" ? "fan-out" : "sequence", condition: routingMode === "fanout-evaluator" ? "findings.length > 0" : undefined, inputSchemaRef: "discovery-findings/v1", outputSchemaRef: "code-change-request/v1" },
      { from: "executor", to: "evaluator", type: routingMode === "fanout-evaluator" ? "fan-out" : "sequence", condition: routingMode === "fanout-evaluator" ? "files.length > 0" : undefined, inputSchemaRef: "code-change-result/v1", outputSchemaRef: "evaluation-request/v1" },
      { from: "evaluator", to: "human-gate", type: "conditional", condition: humanGate ? "always" : "releaseRisk != low || releaseGate != review-only", inputSchemaRef: "evaluation-result/v1", outputSchemaRef: "approval-request/v1" },
      { from: "executor", to: "release", type: "conditional", condition: releaseGate === "review-only" ? "approval.status == APPROVED" : "sourceClosure.requiredGates includes deploy", inputSchemaRef: "code-change-result/v1", outputSchemaRef: "source-closure-request/v1" },
      { from: "human-gate", to: "release", type: "fan-in", inputSchemaRef: "approval-result/v1", outputSchemaRef: "source-release-request/v1" }
    ]
  });
}

export function workflowCanvasContextFromRequest(body: any): {
  routingMode: "policy-gated" | "fanout-evaluator" | "human-first";
  releaseGate: "source-closure" | "review-only" | "deploy-and-rollback";
  humanGate: boolean;
  visualEditorVersion: string;
} | undefined {
  if (!isRecord(body?.context) || !isRecord(body.context.workflowCanvasEditor)) return undefined;
  const value = body.context.workflowCanvasEditor;
  const routingMode = normalizeWorkflowRoutingMode(value.routingMode);
  const releaseGate = normalizeWorkflowReleaseGate(value.releaseGate);
  return {
    routingMode,
    releaseGate,
    humanGate: value.humanGate === true || routingMode === "human-first",
    visualEditorVersion: String(value.visualEditorVersion ?? "dashboard-workflow-canvas/v1")
  };
}

export function normalizeWorkflowRoutingMode(value: unknown): "policy-gated" | "fanout-evaluator" | "human-first" {
  const mode = String(value ?? "policy-gated").trim();
  if (mode === "fanout-evaluator" || mode === "human-first") return mode;
  return "policy-gated";
}

export function normalizeWorkflowReleaseGate(value: unknown): "source-closure" | "review-only" | "deploy-and-rollback" {
  const gate = String(value ?? "source-closure").trim();
  if (gate === "review-only" || gate === "deploy-and-rollback") return gate;
  return "source-closure";
}

export function selfEvolutionExecutorGraph(): ExecutorGraph {
  return normalizeExecutorGraph({
    id: "dashboard-source-release-closure",
    name: "Dashboard Source Release Closure",
    mode: "parallel",
    nodes: [
      { id: "plan", type: "llm", name: "Plan Target Loop", config: { adapterId: "evopilot.llm-context-adapter", outputSchema: { plan: "object" } } },
      { id: "upgrade", type: "code-upgrader", name: "Apply Source Change", config: { adapterId: "evopilot.code-upgrader-adapter", inputSchema: { plan: "object" }, outputSchema: { files: "array" } } },
      { id: "validate", type: "validator", name: "Validate Evidence", config: { independent: true, inputSchema: { files: "array", ci: "object" } } },
      { id: "release", type: "release-action", name: "Prepare Source Closure", config: { requiresApproval: true, subgraphId: "source-closure/v1" } },
      { id: "approval", type: "approval", name: "Human Release Approval", config: { requiredForRelease: true } }
    ],
    edges: [
      { from: "plan", to: "upgrade", type: "sequence", outputSchemaRef: "target-loop-plan/v1" },
      { from: "upgrade", to: "validate", type: "fan-out", condition: "files.length > 0", inputSchemaRef: "code-change/v1", outputSchemaRef: "validation-request/v1" },
      { from: "upgrade", to: "release", type: "conditional", condition: "sourceClosure.requiredGates includes deploy", inputSchemaRef: "code-change/v1", outputSchemaRef: "source-closure-request/v1" },
      { from: "validate", to: "approval", type: "fan-in", inputSchemaRef: "validation-evidence/v1" },
      { from: "release", to: "approval", type: "fan-in", inputSchemaRef: "source-closure-request/v1" }
    ]
  });
}

export function loopOrchestrationPresets(store: FileStore): Array<{
  id: string;
  name: string;
  defaultObjective: string;
  defaultTargetVersion: string;
  controlPlaneUrl?: string;
  capabilities: string[];
  ready: boolean;
  evidence: string[];
}> {
  const deployConnectors = store.listDeployConnectors();
  return [{
    id: "source-release-closure",
    name: "Source to Production Closure",
    defaultObjective: "Evolve the selected project through source change, validation, deployment, health-ready probe, and rollback-aware release closure.",
    defaultTargetVersion: `loop-${new Date().toISOString().slice(0, 10)}`,
    controlPlaneUrl: process.env.EVOPILOT_CONTROL_PLANE_URL,
    capabilities: [
      "github-or-gitlab-source",
      "typed-executor-graph",
      "docker-sandbox-enforcement",
      "worker-lease-watchdog",
      "deploy-connector",
      "health-ready-rollback"
    ],
    ready: deployConnectors.length > 0,
    evidence: [
      `deployConnectorCount=${deployConnectors.length}`,
      `executorGraph=${selfEvolutionExecutorGraph().id}`,
      `graphValidation=${selfEvolutionExecutorGraph().validation.status}`,
      "dashboardWorkbench=true"
    ]
  }, {
    id: "codex-target-loop",
    name: "Codex Target Loop Autopilot",
    defaultObjective: "Drive the next EvoPilot product target through Codex executor planning, source change, independent validation, source closure, and production health evidence.",
    defaultTargetVersion: `codex-loop-${new Date().toISOString().slice(0, 10)}`,
    controlPlaneUrl: process.env.EVOPILOT_CONTROL_PLANE_URL,
    capabilities: [
      "target-backlog",
      "codex-executor",
      "auto-advance",
      "independent-validation",
      "human-stop-condition",
      "source-to-production-closure"
    ],
    ready: deployConnectors.length > 0,
    evidence: [
      `deployConnectorCount=${deployConnectors.length}`,
      "targetBacklog=productized",
      "advanceApi=/api/v1/loop-orchestration/advance",
      "codexLoopTarget=true"
    ]
  }];
}

export function loopOrchestrationTargetDefinitions(): Array<Omit<LoopOrchestrationTarget, "status" | "loopId" | "nextAction" | "evidence">> {
  return [
    {
      id: "codex-loop-target-autopilot",
      title: "Codex Loop Target Autopilot",
      layer: "loop",
      presetId: "codex-target-loop",
      objective: "Let EvoPilot keep a prioritized target backlog, create the next Codex-backed target loop, and advance it through start, resume, human stop, and source closure states.",
      acceptanceCriteria: [
        "Dashboard and API expose target backlog with status and next action.",
        "Advance API creates or advances the next target loop idempotently.",
        "Loop evidence records Codex executor intent, independent validation, source closure, and stop condition."
      ]
    },
    {
      id: "context-time-travel-workbench",
      title: "Context Time Travel Workbench",
      layer: "context",
      presetId: "codex-target-loop",
      objective: "Make replay, editable context, checkpoint inspection, and replay diff available as a reusable workbench for every connected project.",
      acceptanceCriteria: [
        "Users can inspect checkpoints and replay from a selected iteration.",
        "Context edits are persisted as auditable artifacts.",
        "Replay diff compares old and new executor outputs."
      ]
    },
    {
      id: "harness-worker-failover",
      title: "Harness Worker Failover",
      layer: "harness",
      presetId: "codex-target-loop",
      objective: "Turn worker lease, queue claim, watchdog recovery, and duplicate side-effect prevention into production-grade harness controls.",
      acceptanceCriteria: [
        "Workers claim and renew durable leases.",
        "Expired leases are recovered by watchdog without duplicate source closure.",
        "Dashboard shows queue pressure and failover evidence."
      ]
    },
    {
      id: "sandbox-hard-boundary-proof",
      title: "Sandbox Hard Boundary Proof",
      layer: "sandbox",
      presetId: "codex-target-loop",
      objective: "Prove Docker/K8s sandbox enforcement with network, credential, path, and resource restrictions as first-class loop evidence.",
      acceptanceCriteria: [
        "Sandbox policy maps to an executable Docker/K8s boundary.",
        "Credential and path restrictions are tested and recorded.",
        "Failed sandbox enforcement blocks non-human executor nodes."
      ]
    },
    {
      id: "discovery-skill-runtime",
      title: "Discovery Skill Runtime",
      layer: "context",
      presetId: "codex-target-loop",
      objective: "Turn repository, trace, evaluation, and production signal discovery into a reusable skill runtime that proposes target loops with evidence instead of relying on manual backlog curation.",
      acceptanceCriteria: [
        "Connected GitHub, GitLab, and local directory projects expose a discovery skill contract with inputs, outputs, confidence, and evidence sources.",
        "Discovery output can create or update target-loop candidates with acceptance criteria, affected files, and runtime evidence links.",
        "Dashboard shows discovery provenance so users can distinguish product signals, code signals, and manually entered targets."
      ]
    },
    {
      id: "per-finding-worktree-handoff",
      title: "Per Finding Worktree Handoff",
      layer: "harness",
      presetId: "codex-target-loop",
      objective: "Give every selected finding an isolated worktree or branch handoff with bounded files, validation commands, source-closure metadata, and resumable executor context.",
      acceptanceCriteria: [
        "Each finding can allocate an isolated worktree, release branch, or executor workspace without contaminating other loop targets.",
        "Handoff payload includes allowed paths, validation commands, source branch, target branch, and rollback metadata.",
        "Failed or interrupted handoffs can be resumed, reassigned, or archived with artifacts and audit evidence."
      ]
    },
    {
      id: "adversarial-evaluator-agent",
      title: "Adversarial Evaluator Agent",
      layer: "harness",
      presetId: "codex-target-loop",
      objective: "Add an independent adversarial evaluator that challenges proposed code changes, release evidence, and target completion claims before merge or deployment.",
      acceptanceCriteria: [
        "Evaluator receives the proposed diff, tests, runtime evidence, budget impact, and release gates as structured input.",
        "Evaluator can return PASS, WARN, or BLOCK with failure signatures, missing evidence, and suggested replay or repair actions.",
        "Autopilot treats evaluator BLOCK as a policy-review or human-approval stop condition rather than self-approving the release."
      ]
    },
    {
      id: "recurring-loop-scheduler",
      title: "Recurring Loop Scheduler",
      layer: "loop",
      presetId: "codex-target-loop",
      objective: "Support recurring target-loop schedules driven by time windows, evidence thresholds, release cadence, and budget guardrails.",
      acceptanceCriteria: [
        "Users can define recurring loop schedules with project scope, target preset, cadence, trigger rules, and max budget.",
        "Scheduler records due, skipped, blocked, and executed runs with idempotency keys and next-run timestamps.",
        "Schedules respect human gates, source-credential blockers, release freezes, and active incident windows."
      ]
    },
    {
      id: "loop-memory-inbox",
      title: "Loop Memory Inbox",
      layer: "context",
      presetId: "codex-target-loop",
      objective: "Provide a product memory inbox where prior findings, user feedback, failed evaluations, release learnings, and operator notes can be triaged into future target loops.",
      acceptanceCriteria: [
        "Memory inbox stores typed items from evaluations, traces, release decisions, user feedback, and manual notes.",
        "Users can accept, merge, snooze, reject, or convert inbox items into target-loop backlog entries.",
        "Converted targets retain memory provenance and can be used by discovery, planning, replay, and evaluator agents."
      ]
    },
    {
      id: "budget-and-judgment-guardrails",
      title: "Budget and Judgment Guardrails",
      layer: "loop",
      presetId: "codex-target-loop",
      objective: "Make cost, token, time, blast-radius, confidence, and release-judgment guardrails explicit stop conditions for every autonomous loop.",
      acceptanceCriteria: [
        "Loop plans declare max cost, token, time, file-change, and deployment-risk budgets before execution.",
        "Runtime records per-node cost, confidence, blast-radius, and policy judgment evidence for each iteration.",
        "Autopilot blocks or routes to human review when budget, confidence, or release-judgment thresholds are exceeded."
      ]
    },
    {
      id: "tenant-workspace-model",
      title: "Tenant Workspace Model",
      layer: "context",
      presetId: "codex-target-loop",
      objective: "Define the tenant, workspace, membership, role, project ownership, and evidence scoping model required before EvoPilot can be opened as a cloud service.",
      acceptanceCriteria: [
        "Tenant, organization or workspace, user membership, role, and project ownership contracts are explicit and versioned.",
        "Projects, credentials, loop runs, source release runs, audit records, and release evidence can be queried and scoped by tenant or workspace.",
        "Migration preserves single-tenant self-hosted mode while making tenantId and workspaceId mandatory at the cloud boundary."
      ]
    },
    {
      id: "github-app-onboarding",
      title: "GitHub App Onboarding",
      layer: "harness",
      presetId: "codex-target-loop",
      objective: "Replace ad hoc repository tokens with a GitHub App onboarding flow that supports installation, repository selection, least-privilege permissions, webhook verification, and installation-token lifecycle.",
      acceptanceCriteria: [
        "Users can connect a GitHub App installation and select repositories without pasting long-lived personal tokens into the dashboard.",
        "Webhook signature verification, installation-token refresh, and repository permission checks are captured as auditable evidence.",
        "Loop source closure can resolve writeback credentials from the installation while preserving least privilege and revocation."
      ]
    },
    {
      id: "workspace-rbac-and-invitation",
      title: "Workspace RBAC and Invitation",
      layer: "harness",
      presetId: "codex-target-loop",
      objective: "Make workspace membership, invitation, role assignment, scoped API access, and audit attribution production-ready for a multi-tenant SaaS control plane.",
      acceptanceCriteria: [
        "Owner, admin, developer, and viewer permissions are enforced for workspace reads, writes, approvals, and release actions.",
        "Workspace invitations, membership state, role changes, and access revocation are recorded as auditable events.",
        "Cross-workspace and cross-tenant access attempts are denied with explicit blocker evidence instead of falling through to global data."
      ]
    },
    {
      id: "secret-vault-and-credential-boundary",
      title: "Secret Vault and Credential Boundary",
      layer: "harness",
      presetId: "codex-target-loop",
      objective: "Make secret storage, token references, rotation, revocation, and no-plaintext logging a first-class production boundary for multi-tenant EvoPilot.",
      acceptanceCriteria: [
        "Credentials are stored and referenced through encrypted secret refs instead of plaintext project payloads.",
        "API responses, dashboard views, loop evidence, and logs never echo secret values.",
        "Rotation, revocation, audit trail, and credential preflight status are visible to operators and enforced before source closure."
      ]
    },
    {
      id: "project-workspace-ownership",
      title: "Project Workspace Ownership",
      layer: "context",
      presetId: "codex-target-loop",
      objective: "Make every GitHub, GitLab, and local Git project belong to an explicit workspace with scoped credentials, loops, source closures, release evidence, and audit history.",
      acceptanceCriteria: [
        "Project registration requires a workspace boundary for every self-hosted and SaaS project.",
        "Project lists, credentials, loop runs, release runs, and audit history are filtered by workspace scope.",
        "Moving, archiving, or deleting a project preserves release evidence and produces auditable ownership evidence."
      ]
    },
    {
      id: "quota-rate-limit-billing-foundation",
      title: "Quota Rate Limit Billing Foundation",
      layer: "loop",
      presetId: "codex-target-loop",
      objective: "Introduce the usage accounting, plan, quota, rate limit, and budget stop-condition foundation needed for EvoPilot to behave like a cloud service.",
      acceptanceCriteria: [
        "Loop runtime records usage for projects, tenants, workspaces, source operations, tokens, time, and release attempts.",
        "Plans and quotas can cap loop concurrency, execution duration, source closure, and deployment actions.",
        "Budget and rate-limit stops are surfaced as product-visible next actions instead of generic execution failures."
      ]
    },
    {
      id: "worker-queue-and-postgres-store",
      title: "Worker Queue and Postgres Store",
      layer: "loop",
      presetId: "codex-target-loop",
      objective: "Move cloud execution toward durable Postgres-backed state, queued workers, retry control, backup, restore, and migration contracts.",
      acceptanceCriteria: [
        "Projects, loops, releases, credentials, audits, target backlog, schedules, and memory records have durable relational ownership boundaries.",
        "Worker queue execution supports retry, lease recovery, idempotency, and horizontal scaling without duplicate side effects.",
        "Backup, restore, and migration procedures are documented and validated against representative production data."
      ]
    },
    {
      id: "tenant-aware-release-evidence",
      title: "Tenant Aware Release Evidence",
      layer: "context",
      presetId: "codex-target-loop",
      objective: "Scope release decisions, source release runs, artifacts, deployment proof, and audit replay by tenant and workspace so SaaS users can trust evidence boundaries.",
      acceptanceCriteria: [
        "Release decisions, source release runs, pull requests, merge commits, deployments, artifacts, and audit records carry tenant and workspace scope.",
        "Dashboard and API can replay release evidence for one workspace without exposing unrelated tenant data.",
        "Missing or mismatched tenant/workspace evidence blocks GA release promotion for SaaS targets."
      ]
    },
    {
      id: "multi-tenant-security-regression-suite",
      title: "Multi Tenant Security Regression Suite",
      layer: "harness",
      presetId: "codex-target-loop",
      objective: "Build the regression suite that proves tenant isolation, credential redaction, RBAC, scoped API tokens, and release-evidence boundaries before SaaS GA.",
      acceptanceCriteria: [
        "Tests cover cross-tenant read and write denial for projects, loops, credentials, release evidence, and audit records.",
        "Credential leakage tests prove secrets are not returned through API responses, dashboard state, traces, logs, or release artifacts.",
        "Regression evidence is required by the SaaS GA release target and fails the target when any isolation scenario is missing."
      ]
    },
    {
      id: "saas-production-observability",
      title: "SaaS Production Observability",
      layer: "harness",
      presetId: "codex-target-loop",
      objective: "Harden public production operation with domain, HTTPS, ingress controls, logs, metrics, alerts, status, and incident evidence suitable for external SaaS users.",
      acceptanceCriteria: [
        "Production exposes EvoPilot through a managed domain and HTTPS ingress with documented security boundaries.",
        "Health, readiness, loop execution, release closure, queue pressure, quota, and credential blockers emit metrics and structured logs.",
        "Alerts, status evidence, and incident runbooks exist for externally visible service degradation."
      ]
    },
    {
      id: "saas-onboarding-dashboard",
      title: "SaaS Onboarding Dashboard",
      layer: "context",
      presetId: "codex-target-loop",
      objective: "Compress first-run cloud onboarding into a guided path that connects GitHub, selects a repository, chooses a target, starts the first loop, and reaches a release conclusion.",
      acceptanceCriteria: [
        "A new workspace can complete GitHub connection, repository selection, target choice, and first loop start from one guided dashboard path.",
        "The dashboard shows the active loop stage, blocker, evidence, and release conclusion without forcing users through separate feature pages.",
        "Team invitation and role visibility are available before the workspace is treated as SaaS-ready."
      ]
    },
    {
      id: "saas-field-e2e-source-to-ga",
      title: "SaaS Field E2E Source to GA",
      layer: "loop",
      presetId: "codex-target-loop",
      objective: "Run a real workspace-scoped Source-to-GA journey from GitHub App onboarding through loop execution, PR, CI/CD, deploy, release decision, and audit replay.",
      acceptanceCriteria: [
        "A workspace completes GitHub App repository onboarding and starts a Source-to-GA loop without plaintext source credentials.",
        "The loop produces PR, CI/CD, deployment, health, release decision, and audit evidence under the same workspace boundary.",
        "The field E2E transcript and screenshots are archived as reusable SaaS GA release evidence."
      ]
    },
    {
      id: "saas-release-matrix",
      title: "SaaS Release Matrix",
      layer: "loop",
      presetId: "codex-target-loop",
      objective: "Define and execute the SaaS GA scenario matrix covering new tenants, workspaces, migrations, missing credentials, RBAC denial, worker recovery, release repair, audit replay, and quota blockers.",
      acceptanceCriteria: [
        "The release matrix includes new tenant, new workspace, single-tenant migration, GitHub App onboarding, credential blocker, RBAC denial, worker crash, release repair, audit replay, and quota blocker scenarios.",
        "Each required scenario has executable evidence, owner, status, blocker, and repair action.",
        "SaaS GA release decisions fail when any required matrix scenario is missing or blocked."
      ]
    },
    {
      id: "saas-ga-soak-active",
      title: "SaaS GA Active Soak",
      layer: "loop",
      presetId: "codex-target-loop",
      objective: "Run an active multi-tenant soak with representative projects, workspaces, source closures, workers, release evidence, and no high open risks.",
      acceptanceCriteria: [
        "At least two tenants, three workspaces, five projects, and five successful Source-to-GA loops are exercised under active workload.",
        "Active soak covers worker queue, credential resolution, release repair, audit replay, quota handling, and production observability.",
        "The soak report records duration, deltas, failures, residual risks, and release-decision evidence for the SaaS GA target."
      ]
    },
    {
      id: "saas-ga-release-decision",
      title: "SaaS GA Release Decision",
      layer: "loop",
      presetId: "codex-target-loop",
      objective: "Create an independent saas-ga release target and require a product-native GO decision before the SaaS multi-tenant version can be called GA stable.",
      acceptanceCriteria: [
        "A saas-ga or multi-tenant-ga release target exists with criteria for tenant model, workspace RBAC, GitHub App, vault, quota, Postgres store, observability, field E2E, release matrix, and active soak.",
        "GET /api/v1/release/decisions for the SaaS target returns GO only when all required SaaS criteria and scenarios pass.",
        "The release decision is separate from the existing ga target so core control-plane GA cannot be mistaken for SaaS multi-tenant GA."
      ]
    },
    {
      id: "announce-saas-multi-tenant-ga-stable",
      title: "Announce SaaS Multi Tenant GA Stable",
      layer: "loop",
      presetId: "codex-target-loop",
      objective: "Promote the SaaS multi-tenant version only after the saas-ga release decision is GO and the public product surfaces reference that evidence.",
      acceptanceCriteria: [
        "README, Dashboard, release evidence, release notes, and version tag point to the SaaS GA decision rather than the generic ga target.",
        "The announcement includes the target ID, decision ID, release matrix summary, active soak evidence, and residual risk status.",
        "The release is not announced when the SaaS GA decision is CONDITIONAL-GO, NO-GO, missing, or only backed by dashboard/UI evidence."
      ]
    }
  ];
}

export function loopOrchestrationTargets(store: FileStore): LoopOrchestrationTarget[] {
  const loops = store.listLoops();
  return loopOrchestrationTargetDefinitions().map((target) => {
    const loop = loops
      .filter((item) => item.context?.orchestrationTargetId === target.id)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
    const externalBlocker = loop ? inferLoopExternalBlocker(target, loop) : undefined;
    const status = externalBlocker ? "BLOCKED" : loop ? targetStatusFromLoop(loop) : "PENDING";
    return {
      ...target,
      status,
      loopId: loop?.id,
      nextAction: externalBlocker?.nextAction ?? nextTargetAction(loop),
      evidence: externalBlocker ? [...targetEvidence(target, loop), ...externalBlockerEvidence(externalBlocker)] : targetEvidence(target, loop),
      externalBlocker
    };
  });
}

export async function advanceLoopOrchestrationTarget(store: FileStore, actor: string, input: {
  targetId?: string;
  projectId?: string;
  targetVersion?: string;
  objective?: string;
  controlPlaneUrl?: string;
  deployConnectorId?: string;
  autoStart?: boolean;
}): Promise<LoopOrchestrationAdvanceResult> {
  const targets = loopOrchestrationTargets(store);
  const target = input.targetId
    ? targets.find((item) => item.id === input.targetId)
    : targets.find((item) => item.status === "PENDING" || item.status === "RUNNING" || item.status === "BLOCKED") ?? targets[0];
  if (!target) throw httpError(404, "LOOP_ORCHESTRATION_TARGET_NOT_FOUND", "No loop orchestration target is available.");
  let loop = target.loopId ? store.readLoop(target.loopId) : undefined;
  let action = target.nextAction;
  let advanced = false;
  const evidence = [`target=${target.id}`, `layer=${target.layer}`, `preset=${target.presetId}`];
  if (!loop) {
    loop = createOrchestrationTargetLoop(store, target, input);
    action = input.autoStart === false ? "create-loop" : "start-loop";
    advanced = true;
    evidence.push(`loopCreated=${loop.id}`);
  }
  if (input.autoStart !== false && loop.status === "PENDING") {
    loop = await store.startLoop(loop.id, actor, {
      evidence: [
        `orchestrationTarget=${target.id}`,
        "codexLoopTarget=true",
        "advanceMode=auto-start"
      ]
    }) ?? loop;
    action = "start-loop";
    advanced = true;
  } else if (input.autoStart !== false && (loop.status === "RUNNING" || loop.status === "BLOCKED")) {
    loop = await store.resumeLoop(loop.id, actor, {
      evidence: [
        `orchestrationTarget=${target.id}`,
        "codexLoopTarget=true",
        "advanceMode=auto-resume"
      ]
    }) ?? loop;
    action = "resume-loop";
    advanced = true;
  } else if (loop.status === "WAITING_APPROVAL") {
    action = "human-approval";
    evidence.push("stopCondition=human-approval");
  } else if (loop.status === "SUCCEEDED" && loop.sourceClosure.closureState !== "PROMOTED") {
    action = "source-closure";
    evidence.push("nextGate=source-closure");
  } else if (loop.status === "SUCCEEDED") {
    action = "done";
    evidence.push("targetStatus=done");
  }
  const externalBlocker = inferLoopExternalBlocker(target, loop);
  const refreshedTarget = {
    ...target,
    status: externalBlocker ? "BLOCKED" : targetStatusFromLoop(loop),
    loopId: loop.id,
    nextAction: externalBlocker?.nextAction ?? nextTargetAction(loop),
    evidence: externalBlocker
      ? [...targetEvidence(target, loop), ...externalBlockerEvidence(externalBlocker)]
      : targetEvidence(target, loop),
    externalBlocker
  };
  return {
    schema: "evopilot-loop-orchestration-advance/v1",
    target: refreshedTarget,
    loop,
    action,
    advanced,
    evidence,
    createdAt: new Date().toISOString()
  };
}

export async function runLoopOrchestrationAutopilot(store: FileStore, actor: string, body: unknown): Promise<LoopOrchestrationAutopilotResult> {
  const request = isRecord(body) ? body : {};
  const stages: LoopOrchestrationAutopilotResult["stages"] = [];
  const evidence: string[] = ["autopilot=production-self-evolution"];
  const maxSteps = Math.min(12, Math.max(1, Math.floor(Number(request.maxSteps ?? 8))));
  let loop: LoopRun | undefined;
  let releaseRun: SourceReleaseClosureRun | undefined;
  let target: LoopOrchestrationTarget | undefined;

  const pushStage = (stage: LoopOrchestrationAutopilotResult["stages"][number]) => {
    stages.push(stage);
    evidence.push(`stage.${stage.id}=${stage.status}`, ...stage.evidence);
  };

  try {
    const advanced = await advanceLoopOrchestrationTarget(store, actor, {
      targetId: optionalTrimmedString(request.targetId),
      projectId: optionalTrimmedString(request.projectId),
      targetVersion: optionalTrimmedString(request.targetVersion),
      objective: optionalTrimmedString(request.objective),
      controlPlaneUrl: optionalTrimmedString(request.controlPlaneUrl),
      deployConnectorId: optionalTrimmedString(request.deployConnectorId),
      autoStart: request.autoStart !== false
    });
    target = advanced.target;
    loop = advanced.loop;
    pushStage({
      id: "advance",
      status: "SUCCEEDED",
      detail: `Target advanced with action ${advanced.action}.`,
      evidence: advanced.evidence
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = loopOrchestrationTargets(store)[0];
    if (!fallback) throw error;
    target = fallback;
    pushStage({ id: "advance", status: "FAILED", detail: message, evidence: [`error=${message}`] });
    return finalizeLoopOrchestrationAutopilot({ status: "FAILED", target, loop, releaseRun, stages, evidence, nextAction: "repair" });
  }

  if (!loop) return finalizeLoopOrchestrationAutopilot({ status: "FAILED", target, loop, releaseRun, stages, evidence, nextAction: "repair" });

  let iterated = false;
  for (let step = 0; step < maxSteps; step += 1) {
    loop = store.readLoop(loop.id) ?? loop;
    if (loop.status === "SUCCEEDED" || loop.status === "FAILED" || loop.status === "CANCELLED") break;
    if (loop.status === "WAITING_APPROVAL") {
      if (request.approveHumanGate === true) {
        const approved = store.approveLoop(loop.id, actor);
        loop = approved ?? loop;
        pushStage({
          id: "human-gate",
          status: "SUCCEEDED",
          detail: "Pending loop approval was explicitly approved by autopilot request.",
          evidence: [`approvedBy=${actor}`, "approveHumanGate=true"]
        });
        loop = await store.resumeLoop(loop.id, actor, {
          forceDecision: "SUCCEED",
          evidence: ["autopilotHumanGateApproved=true", `autopilotActor=${actor}`]
        }) ?? loop;
        iterated = true;
        continue;
      }
      pushStage({
        id: "human-gate",
        status: "BLOCKED",
        detail: "Loop reached a human approval gate; autopilot stopped before source release.",
        evidence: ["approveHumanGate=false", `pendingApprovals=${loop.approvals.filter((approval) => approval.status === "PENDING").length}`]
      });
      return finalizeLoopOrchestrationAutopilot({ status: "BLOCKED", target, loop, releaseRun, stages, evidence, nextAction: "human-approval" });
    }
    if (loop.status === "PENDING") {
      loop = await store.startLoop(loop.id, actor, { evidence: ["autopilot.iterate=start"] }) ?? loop;
      iterated = true;
      continue;
    }
    if (loop.status === "RUNNING" || loop.status === "BLOCKED") {
      loop = await store.resumeLoop(loop.id, actor, { evidence: ["autopilot.iterate=resume"] }) ?? loop;
      iterated = true;
      continue;
    }
    break;
  }
  pushStage({
    id: "iterate",
    status: loop.status === "SUCCEEDED" ? "SUCCEEDED" : iterated ? "BLOCKED" : "SKIPPED",
    detail: `Loop status is ${loop.status} after bounded autopilot iteration.`,
    evidence: [`loopStatus=${loop.status}`, `iteration=${loop.currentIteration}`, `maxSteps=${maxSteps}`]
  });

  if (loop.status !== "SUCCEEDED") {
    return finalizeLoopOrchestrationAutopilot({ status: "BLOCKED", target, loop, releaseRun, stages, evidence, nextAction: loop.status === "WAITING_APPROVAL" ? "human-approval" : "repair" });
  }

  const shouldExecuteClosure = request.executeSourceClosure !== false && loop.sourceClosure.closureState !== "PROMOTED";
  if (shouldExecuteClosure) {
    const preflight = await preflightLoopSourceClosure(store, loop.id, { actor, persist: true });
    if (!preflight || preflight.status !== "PASS") {
      loop = store.readLoop(loop.id) ?? loop;
      const externalBlocker = buildExternalBlockerFromPreflight(preflight, target, loop);
      const detail = preflight
        ? `Source closure preflight failed: ${preflight.blockers.join(", ") || "unknown blocker"}.`
        : "Source closure preflight failed because the loop was not found.";
      pushStage({
        id: "source-preflight",
        status: externalBlocker ? "BLOCKED" : "FAILED",
        detail,
        evidence: [
          `preflight=${preflight?.status ?? "MISSING"}`,
          `nextAction=${preflight?.nextAction ?? "repair-project"}`,
          ...(preflight?.blockers ?? []).map((blocker) => `blocker=${blocker}`)
        ]
      });
      if (externalBlocker) {
        pushStage({
          id: "external-blocker",
          status: "BLOCKED",
          detail: `External blocker requires ${externalBlocker.nextAction}.`,
          evidence: [
            `externalBlocker=${externalBlocker.id}`,
            `type=${externalBlocker.type}`,
            `route=${externalBlocker.recovery.route}`,
            ...externalBlocker.blockers.map((blocker) => `blocker=${blocker}`)
          ]
        });
        return finalizeLoopOrchestrationAutopilot({
          status: "BLOCKED",
          target,
          loop,
          releaseRun,
          stages,
          evidence,
          nextAction: externalBlocker.nextAction,
          externalBlocker
        });
      }
      return finalizeLoopOrchestrationAutopilot({ status: "FAILED", target, loop, releaseRun, stages, evidence, nextAction: "source-closure" });
    }
    pushStage({
      id: "source-preflight",
      status: "SUCCEEDED",
      detail: "Source closure preflight passed.",
      evidence: [
        `preflight=${preflight.status}`,
        `nextAction=${preflight.nextAction}`,
        ...preflight.checks.map((check) => `${check.id}=${check.status}`)
      ]
    });
    try {
      const sourceClosure = await executeLoopSourceClosure(store, loop.id, actor, {
        files: normalizeSourceClosureFiles(request.files).length > 0 ? normalizeSourceClosureFiles(request.files) : defaultAutopilotSourceClosureFiles(loop, target),
        tagName: optionalTrimmedString(request.tagName),
        deployConnectorId: optionalTrimmedString(request.deployConnectorId),
        deploymentUrl: optionalTrimmedString(request.deploymentUrl),
        healthUrl: optionalTrimmedString(request.healthUrl),
        readyUrl: optionalTrimmedString(request.readyUrl),
        createReviewRequest: request.createReviewRequest !== false,
        commitMessage: optionalTrimmedString(request.commitMessage) ?? `EvoPilot autopilot source closure for ${loop.id}`
      });
      loop = sourceClosure?.loop ?? loop;
      releaseRun = sourceClosure?.releaseRun;
      const sourceClosureEvidence = [
        `closureState=${loop.sourceClosure.closureState}`,
        `releaseRun=${releaseRun?.id ?? "none"}`,
        ...sourceClosureFailedEvidence(loop.sourceClosure)
      ];
      pushStage({
        id: "source-closure",
        status: loop.sourceClosure.closureState === "PROMOTED" ? "SUCCEEDED" : loop.sourceClosure.closureState === "FAILED" ? "FAILED" : "BLOCKED",
        detail: `Source closure reached ${loop.sourceClosure.closureState}.`,
        evidence: sourceClosureEvidence
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      loop = store.readLoop(loop.id) ?? loop;
      releaseRun = store.listSourceReleaseClosureRuns(loop.id).at(-1) ?? releaseRun;
      pushStage({ id: "source-closure", status: "FAILED", detail: message, evidence: [`error=${message}`] });
      return finalizeLoopOrchestrationAutopilot({ status: "FAILED", target, loop, releaseRun, stages, evidence, nextAction: "source-closure" });
    }
  } else {
    releaseRun = store.listSourceReleaseClosureRuns(loop.id).at(-1);
    pushStage({ id: "source-closure", status: "SKIPPED", detail: `Source closure is ${loop.sourceClosure.closureState}.`, evidence: [`closureState=${loop.sourceClosure.closureState}`] });
  }

  if (request.autoMerge === false) {
    return finalizeLoopOrchestrationAutopilot({ status: "BLOCKED", target, loop, releaseRun, stages, evidence, nextAction: "policy-review" });
  }

  if (loop.sourceClosure.closureState !== "PROMOTED") {
    return finalizeLoopOrchestrationAutopilot({
      status: loop.sourceClosure.closureState === "FAILED" ? "FAILED" : "BLOCKED",
      target,
      loop,
      releaseRun,
      stages,
      evidence,
      nextAction: "source-closure"
    });
  }

  try {
    const decision = await applySourceClosureReviewDecision(store, loop.id, actor, {
      action: "auto-merge",
      autoMerge: true,
      postMergeDeploy: request.postMergeDeploy !== false,
      commitMessage: optionalTrimmedString(request.mergeCommitMessage) ?? `EvoPilot safe auto-merge ${loop.id}`
    });
    loop = decision?.loop ?? loop;
    releaseRun = decision?.releaseRun ?? releaseRun;
    pushStage({
      id: "safe-auto-merge",
      status: releaseRun?.review?.status === "MERGED" ? "SUCCEEDED" : "BLOCKED",
      detail: `Release review is ${releaseRun?.review?.status ?? "UNKNOWN"} and policy is ${releaseRun?.policy?.status ?? "UNKNOWN"}.`,
      evidence: [
        `review=${releaseRun?.review?.status ?? "UNKNOWN"}`,
        `policy=${releaseRun?.policy?.status ?? "UNKNOWN"}`,
        `postMergeDeploy=${releaseRun?.postMergeDeployment?.status ?? "UNKNOWN"}`
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    loop = store.readLoop(loop.id) ?? loop;
    releaseRun = store.listSourceReleaseClosureRuns(loop.id).at(-1) ?? releaseRun;
    pushStage({
      id: "safe-auto-merge",
      status: "BLOCKED",
      detail: message,
      evidence: [`error=${message}`, `policy=${releaseRun?.policy?.status ?? "UNKNOWN"}`]
    });
    return finalizeLoopOrchestrationAutopilot({ status: "BLOCKED", target, loop, releaseRun, stages, evidence, nextAction: "policy-review" });
  }

  return finalizeLoopOrchestrationAutopilot({
    status: releaseRun?.review?.status === "MERGED" ? "SUCCEEDED" : "BLOCKED",
    target,
    loop,
    releaseRun,
    stages,
    evidence,
    nextAction: releaseRun?.review?.status === "MERGED" ? "done" : "policy-review"
  });
}

export function finalizeLoopOrchestrationAutopilot(input: {
  status: LoopOrchestrationAutopilotResult["status"];
  target: LoopOrchestrationTarget;
  loop?: LoopRun;
  releaseRun?: SourceReleaseClosureRun;
  stages: LoopOrchestrationAutopilotResult["stages"];
  evidence: string[];
  nextAction: LoopOrchestrationAutopilotResult["nextAction"];
  externalBlocker?: LoopExternalBlocker;
}): LoopOrchestrationAutopilotResult {
  return {
    schema: "evopilot-loop-orchestration-autopilot/v1",
    status: input.status,
    target: input.externalBlocker ? {
      ...input.target,
      status: "BLOCKED",
      nextAction: input.externalBlocker.nextAction,
      externalBlocker: input.externalBlocker,
      evidence: [...input.target.evidence, ...externalBlockerEvidence(input.externalBlocker)]
    } : input.target,
    loop: input.loop,
    releaseRun: input.releaseRun,
    stages: input.stages,
    nextAction: input.nextAction,
    externalBlocker: input.externalBlocker,
    evidence: input.evidence,
    createdAt: new Date().toISOString()
  };
}

export function buildExternalBlockerFromPreflight(preflight: SourceClosurePreflightResult | undefined, target: LoopOrchestrationTarget, loop: LoopRun): LoopExternalBlocker | undefined {
  if (!preflight || preflight.status === "PASS") return undefined;
  const now = new Date().toISOString();
  if (preflight.nextAction === "repair-credentials") {
    return {
      schema: "evopilot-external-blocker/v1",
      id: `${loop.id}-source-credential-blocker`,
      type: "source-credential",
      status: "WAITING_HUMAN",
      targetId: target.id,
      loopId: loop.id,
      projectId: preflight.sourceProjectId,
      provider: preflight.provider,
      nextAction: "configure-source-credentials",
      blockers: preflight.blockers,
      evidence: [
        `preflight=${preflight.status}`,
        `preflightNextAction=${preflight.nextAction}`,
        ...preflight.checks.flatMap((check) => [`${check.id}=${check.status}`, ...check.evidence])
      ],
      recovery: {
        route: "project-source-credentials",
        api: `/api/v1/projects/${encodeURIComponent(preflight.sourceProjectId)}/source-credentials/preflight`,
        dashboardAction: "接入项目 -> 验证写回凭据"
      },
      createdAt: now
    };
  }
  if (preflight.nextAction === "repair-deploy-target") {
    return {
      schema: "evopilot-external-blocker/v1",
      id: `${loop.id}-deploy-target-blocker`,
      type: "deploy-target",
      status: "WAITING_HUMAN",
      targetId: target.id,
      loopId: loop.id,
      projectId: preflight.sourceProjectId,
      provider: preflight.provider,
      nextAction: "repair-deploy-target",
      blockers: preflight.blockers,
      evidence: [`preflight=${preflight.status}`, `preflightNextAction=${preflight.nextAction}`],
      recovery: { route: "deploy-connectors", dashboardAction: "部署连接器 -> 配置健康检查" },
      createdAt: now
    };
  }
  if (preflight.nextAction === "repair-project") {
    return {
      schema: "evopilot-external-blocker/v1",
      id: `${loop.id}-project-binding-blocker`,
      type: "project-binding",
      status: "WAITING_HUMAN",
      targetId: target.id,
      loopId: loop.id,
      projectId: preflight.sourceProjectId,
      provider: preflight.provider,
      nextAction: "repair-project",
      blockers: preflight.blockers,
      evidence: [`preflight=${preflight.status}`, `preflightNextAction=${preflight.nextAction}`],
      recovery: { route: "project-settings", dashboardAction: "接入项目 -> 修复仓库配置" },
      createdAt: now
    };
  }
  return undefined;
}

export function externalBlockerEvidence(blocker: LoopExternalBlocker): string[] {
  return [
    `externalBlocker=${blocker.id}`,
    `externalBlocker.type=${blocker.type}`,
    `externalBlocker.status=${blocker.status}`,
    `externalBlocker.nextAction=${blocker.nextAction}`,
    `externalBlocker.route=${blocker.recovery.route}`,
    ...blocker.blockers.map((item) => `externalBlocker.blocker=${item}`)
  ];
}

export function inferLoopExternalBlocker(target: Pick<LoopOrchestrationTarget, "id">, loop: LoopRun): LoopExternalBlocker | undefined {
  if (loop.sourceClosure.closureState === "PROMOTED") return undefined;
  const preflightEvidence = [...loop.evidenceSets].reverse().find((set) =>
    set.validator === "evopilot-source-closure-preflight" &&
    set.status === "FAIL" &&
    set.evidence.some((item) => item === "sourceClosure.preflight=FAIL")
  );
  if (!preflightEvidence) return undefined;
  const blockers = preflightEvidence.evidence
    .filter((item) => item.startsWith("sourceClosure.preflight.blocker="))
    .map((item) => item.replace("sourceClosure.preflight.blocker=", ""));
  const nextAction = preflightEvidence.evidence
    .find((item) => item.startsWith("sourceClosure.preflight.nextAction="))
    ?.replace("sourceClosure.preflight.nextAction=", "");
  if (nextAction === "repair-credentials" || blockers.some((blocker) => blocker.includes("credentials") || blocker.includes("token"))) {
    return {
      schema: "evopilot-external-blocker/v1",
      id: `${loop.id}-source-credential-blocker`,
      type: "source-credential",
      status: "WAITING_HUMAN",
      targetId: target.id,
      loopId: loop.id,
      projectId: loop.sourceClosure.sourceProjectId,
      provider: loop.sourceClosure.repositoryProvider,
      nextAction: "configure-source-credentials",
      blockers,
      evidence: preflightEvidence.evidence,
      recovery: {
        route: "project-source-credentials",
        api: `/api/v1/projects/${encodeURIComponent(loop.sourceClosure.sourceProjectId)}/source-credentials/preflight`,
        dashboardAction: "接入项目 -> 验证写回凭据"
      },
      createdAt: preflightEvidence.createdAt
    };
  }
  if (nextAction === "repair-deploy-target") {
    return {
      schema: "evopilot-external-blocker/v1",
      id: `${loop.id}-deploy-target-blocker`,
      type: "deploy-target",
      status: "WAITING_HUMAN",
      targetId: target.id,
      loopId: loop.id,
      projectId: loop.sourceClosure.sourceProjectId,
      provider: loop.sourceClosure.repositoryProvider,
      nextAction: "repair-deploy-target",
      blockers,
      evidence: preflightEvidence.evidence,
      recovery: { route: "deploy-connectors", dashboardAction: "部署连接器 -> 配置健康检查" },
      createdAt: preflightEvidence.createdAt
    };
  }
  if (nextAction === "repair-project") {
    return {
      schema: "evopilot-external-blocker/v1",
      id: `${loop.id}-project-binding-blocker`,
      type: "project-binding",
      status: "WAITING_HUMAN",
      targetId: target.id,
      loopId: loop.id,
      projectId: loop.sourceClosure.sourceProjectId,
      provider: loop.sourceClosure.repositoryProvider,
      nextAction: "repair-project",
      blockers,
      evidence: preflightEvidence.evidence,
      recovery: { route: "project-settings", dashboardAction: "接入项目 -> 修复仓库配置" },
      createdAt: preflightEvidence.createdAt
    };
  }
  return undefined;
}

export function sourceClosureFailedEvidence(closure: LoopSourceClosure): string[] {
  return Object.entries(closure.gateEvidence)
    .filter(([, row]) => row?.status === "FAILED")
    .flatMap(([gate, row]) => [`failedGate=${gate}`, ...(row?.evidence ?? []).map((item) => `failedEvidence=${item}`)]);
}

export function defaultAutopilotSourceClosureFiles(loop: LoopRun, target: LoopOrchestrationTarget): Array<{ path: string; content: string }> {
  return [{
    path: `.evopilot/source-closures/${safeFileName(loop.id)}.md`,
    content: [
      `# EvoPilot Autopilot Source Closure`,
      ``,
      `Loop: ${loop.id}`,
      `Target: ${target.id}`,
      `Target title: ${target.title}`,
      `Objective: ${loop.objective}`,
      `Provider: ${loop.sourceClosure.repositoryProvider}`,
      `Source branch: ${loop.sourceClosure.sourceBranch}`,
      `Target version: ${loop.sourceClosure.targetVersion ?? "unspecified"}`,
      ``,
      `## Acceptance Criteria`,
      ...target.acceptanceCriteria.map((item) => `- ${item}`),
      ``,
      `## Autopilot Evidence`,
      `- production-self-evolution-autopilot=true`,
      `- sourceClosure.requiredGates=${loop.sourceClosure.requiredGates.join(",")}`,
      `- sandbox=${loop.sandbox.runtime}/${loop.sandbox.network}/${loop.sandbox.credentialScope}`,
      `- coordination=${loop.coordination.mode}/${loop.coordination.nodes.length} executors`,
      ``
    ].join("\n")
  }];
}

export function createOrchestrationTargetLoop(store: FileStore, target: LoopOrchestrationTarget, input: {
  projectId?: string;
  targetVersion?: string;
  objective?: string;
  controlPlaneUrl?: string;
  deployConnectorId?: string;
}): LoopRun {
  const projectId = safeFileName(String(input.projectId ?? "evopilot-github"));
  const project = store.readProject(projectId);
  const deployConnectorId = input.deployConnectorId
    ?? (store.listDeployConnectors().length === 1 ? store.listDeployConnectors()[0].id : undefined);
  const graph = store.writeExecutorGraph(selfEvolutionExecutorGraph());
  return store.createLoop({
    id: `target-${target.id}-${Date.now()}`,
    source: "api",
    projectId,
    objective: input.objective ?? target.objective,
    executorGraphId: graph.id,
    controlPlaneUrl: input.controlPlaneUrl,
    sourceClosure: {
      sourceProjectId: projectId,
      repositoryProvider: project?.repository?.provider ?? "unknown",
      sourceBranch: project?.repository?.defaultBranch ?? "main",
      targetVersion: input.targetVersion ?? `target-${target.id}-${new Date().toISOString().slice(0, 10)}`,
      deploymentConnectorId: deployConnectorId,
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
      maxIterations: 6,
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
      orchestrationPresetId: target.presetId,
      orchestrationTargetId: target.id,
      targetLayer: target.layer,
      codexLoopTarget: true,
      acceptanceCriteria: target.acceptanceCriteria,
      dashboardWorkbench: true,
      unattendedProof: {
        watchdog: true,
        workerLease: true,
        independentValidation: true,
        sourceClosure: true,
        deployRollback: true
      }
    }
  });
}

export function targetStatusFromLoop(loop?: LoopRun): LoopOrchestrationTargetStatus {
  if (!loop) return "PENDING";
  const externalBlocker = inferLoopExternalBlocker({ id: loop.context?.orchestrationTargetId ? String(loop.context.orchestrationTargetId) : "unknown" }, loop);
  if (externalBlocker) return "BLOCKED";
  if (loop.status === "SUCCEEDED" && loop.sourceClosure.closureState === "PROMOTED") return "DONE";
  if (loop.status === "WAITING_APPROVAL") return "WAITING_HUMAN";
  if (loop.status === "FAILED" || loop.status === "CANCELLED" || loop.status === "BLOCKED") return "BLOCKED";
  return "RUNNING";
}

export function nextTargetAction(loop?: LoopRun): LoopOrchestrationTarget["nextAction"] {
  if (!loop) return "create-loop";
  const externalBlocker = inferLoopExternalBlocker({ id: loop.context?.orchestrationTargetId ? String(loop.context.orchestrationTargetId) : "unknown" }, loop);
  if (externalBlocker) return externalBlocker.nextAction;
  if (loop.status === "PENDING") return "start-loop";
  if (loop.status === "WAITING_APPROVAL") return "human-approval";
  if (loop.status === "RUNNING" || loop.status === "BLOCKED") return "resume-loop";
  if (loop.status === "SUCCEEDED" && loop.sourceClosure.closureState !== "PROMOTED") return "source-closure";
  if (loop.status === "SUCCEEDED") return "done";
  return "repair";
}

export function targetEvidence(target: Pick<LoopOrchestrationTarget, "id" | "layer" | "acceptanceCriteria">, loop?: LoopRun): string[] {
  const externalBlocker = loop ? inferLoopExternalBlocker(target, loop) : undefined;
  return [
    `target=${target.id}`,
    `layer=${target.layer}`,
    `acceptanceCriteria=${target.acceptanceCriteria.length}`,
    loop ? `loop=${loop.id}` : "loop=not-created",
    loop ? `tenant=${loop.tenantId}` : `tenant=${DEFAULT_TENANT_ID}`,
    loop ? `workspace=${loop.workspaceId}` : `workspace=${DEFAULT_WORKSPACE_ID}`,
    target.id === "tenant-workspace-model" ? "membershipModel=owner,admin,developer,viewer" : "membershipModel=not-targeted",
    loop ? `loopStatus=${loop.status}` : "loopStatus=PENDING",
    loop ? `iteration=${loop.currentIteration}/${loop.stopPolicy.maxIterations}` : "iteration=0",
    loop ? `sourceClosure=${loop.sourceClosure.closureState}` : "sourceClosure=not-started",
    loop ? `sandboxEnforcement=${loop.sandboxEnforcement.status}` : "sandboxEnforcement=pending",
    loop?.trace ? `executorSteps=${loop.trace.executorStepCount}` : "executorSteps=0",
    externalBlocker ? `externalBlocker=${externalBlocker.id}` : "externalBlocker=none"
  ];
}

export function parseHarnessTemplateApplyPayload(input: unknown, actor: string): HarnessTemplateProfile {
  const body = isRecord(input) ? input : {};
  const source = isRecord(body.templateContent)
    ? body.templateContent
    : isRecord(body.template)
      ? body.template
      : isRecord(body.sourceContent)
        ? body.sourceContent
        : body;
  const record = isRecord(source) ? source : {};
  const id = optionalTrimmedString(record.id);
  const version = optionalTrimmedString(record.version);
  if (!id || !version) {
    throw httpError(400, "HARNESS_TEMPLATE_ID_AND_VERSION_REQUIRED", "HarnessTemplate apply requires id and version.");
  }

  const now = new Date().toISOString();
  const suppliedChangelog = hydrateHarnessTemplateChangelog(record.changelog, version, String(record.updatedAt ?? now));
  const cliChanges = normalizeStringList(body.changelog ?? body.changes ?? body.change, []);
  const changelog = cliChanges.length > 0
    ? [
      ...suppliedChangelog,
      {
        version,
        changedAt: now,
        changedBy: actor,
        summary: cliChanges[0],
        changes: cliChanges
      }
    ]
    : suppliedChangelog;

  const hasCurrentVersionChangelog = changelog.some((entry) =>
    entry.version === version &&
    (entry.summary.trim().length > 0 || entry.changes.length > 0)
  );
  if (!hasCurrentVersionChangelog) {
    throw httpError(400, "HARNESS_TEMPLATE_CHANGELOG_REQUIRED", "HarnessTemplate apply requires a changelog entry for the template version.");
  }

  return hydrateHarnessTemplate({
    ...record,
    id,
    version,
    changelog,
    createdAt: record.createdAt ?? now,
    updatedAt: now
  });
}

export function recordObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function parseProjectHarnessProfilePayload(input: unknown): { source: ProjectHarnessProfileSource; sourceFormat: ProjectHarnessProfileSourceFormat } {
  const body = isRecord(input) ? input : {};
  const format = normalizeProjectHarnessProfileSourceFormat(body.sourceFormat ?? body.format);
  const sourceText = optionalTrimmedString(body.sourceText);
  if (sourceText) {
    const parsed = format === "json" ? JSON.parse(sourceText) : parseYaml(sourceText);
    return { source: normalizeRawProjectHarnessProfileSource(parsed), sourceFormat: format === "object" ? "yaml" : format };
  }
  const sourceContent = isRecord(body.sourceContent)
    ? body.sourceContent
    : isRecord(body.profile)
      ? body.profile
      : body;
  return { source: normalizeRawProjectHarnessProfileSource(sourceContent), sourceFormat: format };
}

export function normalizeProjectHarnessProfileSourceFormat(value: unknown): ProjectHarnessProfileSourceFormat {
  const format = String(value ?? "object").trim().toLowerCase();
  if (format === "json" || format === "yaml" || format === "llm-generated") return format as ProjectHarnessProfileSourceFormat;
  return "object";
}

export function normalizeRawProjectHarnessProfileSource(input: unknown): ProjectHarnessProfileSource {
  const record = isRecord(input) ? input : {};
  const profileId = safeFileName(String(record.profileId ?? record.id ?? "default"));
  return {
    schema: "evopilot-project-harness-profile/v1",
    profileId,
    projectId: safeFileName(String(record.projectId ?? "")),
    tenantId: optionalTrimmedString(record.tenantId),
    workspaceId: optionalTrimmedString(record.workspaceId),
    name: String(record.name ?? profileId),
    description: optionalTrimmedString(record.description),
    template: isRecord(record.template) ? record.template as ProjectHarnessProfileSource["template"] : undefined,
    capabilities: Array.isArray(record.capabilities) ? hydrateHarnessCapabilities(record.capabilities) : undefined,
    runtime: isRecord(record.runtime) ? record.runtime : undefined,
    validation: isRecord(record.validation) ? record.validation : undefined,
    evidence: isRecord(record.evidence) ? record.evidence : undefined,
    rules: isRecord(record.rules) ? record.rules : undefined,
    failureHandling: isRecord(record.failureHandling) ? record.failureHandling : undefined,
    diagnostics: isRecord(record.diagnostics) ? record.diagnostics : undefined,
    observability: isRecord(record.observability) ? record.observability : undefined,
    governance: isRecord(record.governance) ? record.governance : undefined,
    phaseMapping: isRecord(record.phaseMapping) ? record.phaseMapping as ProjectHarnessProfileSource["phaseMapping"] : undefined,
    llmDraftPolicy: isRecord(record.llmDraftPolicy) ? record.llmDraftPolicy : undefined,
    metadata: isRecord(record.metadata) ? record.metadata : undefined
  };
}

export function parseTenantHarnessPolicyPayload(input: unknown, tenantId: string, workspaceId: string): { source: TenantHarnessPolicySource; sourceFormat: TenantHarnessPolicySourceFormat; changelog: string[] } {
  const body = isRecord(input) ? input : {};
  const format = normalizeTenantHarnessPolicySourceFormat(body.sourceFormat ?? body.format);
  const sourceText = optionalTrimmedString(body.sourceText);
  const changelog = normalizeStringList(body.changelog ?? body.changes ?? body.change, []);
  if (sourceText) {
    const parsed = format === "json" ? JSON.parse(sourceText) : parseYaml(sourceText);
    return { source: normalizeRawTenantHarnessPolicySource(parsed, tenantId, workspaceId), sourceFormat: format === "object" ? "yaml" : format, changelog };
  }
  const sourceContent = isRecord(body.sourceContent)
    ? body.sourceContent
    : isRecord(body.policy)
      ? body.policy
      : body;
  const source = normalizeRawTenantHarnessPolicySource(sourceContent, tenantId, workspaceId);
  return {
    source,
    sourceFormat: format,
    changelog
  };
}

export function normalizeTenantHarnessPolicySourceFormat(value: unknown): TenantHarnessPolicySourceFormat {
  const format = String(value ?? "object").trim().toLowerCase();
  if (format === "json" || format === "yaml") return format as TenantHarnessPolicySourceFormat;
  return "object";
}

export function normalizeRawTenantHarnessPolicySource(input: unknown, tenantId = DEFAULT_TENANT_ID, workspaceId = DEFAULT_WORKSPACE_ID): TenantHarnessPolicySource {
  const record = isRecord(input) ? input : {};
  const appliesTo = isRecord(record.appliesTo) ? record.appliesTo : {};
  const sourceMetadata = isRecord(record.metadata) ? record.metadata : {};
  const sourceChangelog = record.changelog ?? sourceMetadata.changelog;
  return {
    schema: "evopilot-tenant-harness-policy/v1",
    policyId: safeFileName(String(record.policyId ?? record.id ?? "default")),
    tenantId: safeFileName(String(record.tenantId ?? tenantId)),
    workspaceId: safeFileName(String(record.workspaceId ?? workspaceId)),
    name: String(record.name ?? record.policyId ?? record.id ?? "Tenant Harness Policy"),
    description: optionalTrimmedString(record.description),
    appliesTo: {
      projectIds: normalizeStringList(appliesTo.projectIds, []),
      excludeProjectIds: normalizeStringList(appliesTo.excludeProjectIds, []),
      languageFamilies: normalizeStringList(appliesTo.languageFamilies, []).map((item) => item.toLowerCase()),
      templateIds: normalizeStringList(appliesTo.templateIds, [])
    },
    requiredCapabilities: Array.isArray(record.requiredCapabilities)
      ? hydrateHarnessCapabilities(record.requiredCapabilities)
      : Array.isArray(record.capabilities)
        ? hydrateHarnessCapabilities(record.capabilities)
        : undefined,
    runtime: isRecord(record.runtime) ? record.runtime : undefined,
    validation: isRecord(record.validation) ? record.validation : undefined,
    evidence: isRecord(record.evidence) ? record.evidence : undefined,
    rules: isRecord(record.rules) ? record.rules : undefined,
    failureHandling: isRecord(record.failureHandling) ? record.failureHandling : undefined,
    diagnostics: isRecord(record.diagnostics) ? record.diagnostics : undefined,
    observability: isRecord(record.observability) ? record.observability : undefined,
    governance: isRecord(record.governance) ? record.governance : undefined,
    phaseMapping: isRecord(record.phaseMapping) ? record.phaseMapping as TenantHarnessPolicySource["phaseMapping"] : undefined,
    llmDraftPolicy: isRecord(record.llmDraftPolicy) ? record.llmDraftPolicy : undefined,
    enforcement: isRecord(record.enforcement) ? record.enforcement : undefined,
    metadata: Object.keys(sourceMetadata).length > 0 || sourceChangelog !== undefined
      ? { ...sourceMetadata, ...(sourceChangelog !== undefined ? { changelog: sourceChangelog } : {}) }
      : undefined
  };
}

export function createTenantHarnessPolicyVersion(store: FileStore, tenantId: string, workspaceId: string, input: {
  source: TenantHarnessPolicySource;
  sourceFormat: TenantHarnessPolicySourceFormat;
  actor: string;
  changelog?: string[];
  status?: TenantHarnessPolicyStatus;
}): TenantHarnessPolicyVersion {
  const now = new Date().toISOString();
  const source = normalizeRawTenantHarnessPolicySource(input.source, tenantId, workspaceId);
  const compiled = compileTenantHarnessPolicy(source, tenantId, workspaceId, now);
  const sourceDigest = digestObject(source);
  const compiledDigest = digestObject(compiled);
  const validation = validateTenantHarnessPolicy(source, compiled, sourceDigest, compiledDigest, now);
  const versions = store.listTenantHarnessPolicyVersions(source.tenantId ?? tenantId, source.workspaceId ?? workspaceId, source.policyId);
  const version = versions.reduce((max, item) => Math.max(max, item.version), 0) + 1;
  const suppliedChangelog = hydrateHarnessTemplateChangelog(source.metadata?.changelog, String(version), now);
  const cliChanges = normalizeStringList(input.changelog, []);
  const changelog = cliChanges.length > 0
    ? [
      ...suppliedChangelog,
      {
        version: String(version),
        changedAt: now,
        changedBy: input.actor,
        summary: cliChanges[0],
        changes: cliChanges
      }
    ]
    : suppliedChangelog;
  return {
    schema: "evopilot-tenant-harness-policy-version/v1",
    tenantId: source.tenantId ?? tenantId,
    workspaceId: source.workspaceId ?? workspaceId,
    policyId: source.policyId,
    version,
    status: input.status ?? (validation.status === "VALIDATED" ? "VALIDATED" : "DRAFT"),
    sourceFormat: input.sourceFormat,
    sourceContent: source,
    sourceDigest,
    compiledContent: compiled,
    compiledDigest,
    validation,
    changelog,
    generatedBy: {
      mode: "user",
      actor: input.actor,
      evidence: [`actor=${input.actor}`, `sourceFormat=${input.sourceFormat}`]
    },
    createdAt: now,
    updatedAt: now
  };
}

export function compileTenantHarnessPolicy(source: TenantHarnessPolicySource, tenantId: string, workspaceId: string, now: string): CompiledTenantHarnessPolicy {
  const appliesTo = source.appliesTo ?? {};
  return {
    schema: "evopilot-tenant-harness-policy-compiled/v1",
    tenantId: safeFileName(source.tenantId ?? tenantId),
    workspaceId: safeFileName(source.workspaceId ?? workspaceId),
    policyId: source.policyId,
    name: source.name,
    description: source.description,
    appliesTo: {
      projectIds: normalizeStringList(appliesTo.projectIds, []),
      excludeProjectIds: normalizeStringList(appliesTo.excludeProjectIds, []),
      languageFamilies: normalizeStringList(appliesTo.languageFamilies, []),
      templateIds: normalizeStringList(appliesTo.templateIds, [])
    },
    requiredCapabilities: source.requiredCapabilities ?? [],
    runtime: source.runtime ?? {},
    validation: source.validation ?? {},
    evidence: source.evidence ?? {},
    rules: source.rules ?? {},
    failureHandling: source.failureHandling ?? {},
    diagnostics: source.diagnostics ?? {},
    observability: source.observability ?? {},
    governance: source.governance ?? {},
    phaseMapping: source.phaseMapping ?? {},
    llmDraftPolicy: source.llmDraftPolicy ?? {},
    enforcement: source.enforcement ?? {},
    metadata: source.metadata,
    compiledAt: now
  };
}

export function validateTenantHarnessPolicy(source: TenantHarnessPolicySource, compiled: CompiledTenantHarnessPolicy, sourceDigest: string, compiledDigest: string, now: string): TenantHarnessPolicyValidationResult {
  const checks: TenantHarnessPolicyValidationResult["checks"] = [];
  const add = (id: string, status: "PASS" | "FAIL" | "WARN", required: boolean, evidence: string[]) => checks.push({ id, status, required, evidence });
  add("tenant-workspace-scope", source.tenantId === compiled.tenantId && source.workspaceId === compiled.workspaceId ? "PASS" : "FAIL", true, [
    `sourceTenant=${source.tenantId}`,
    `compiledTenant=${compiled.tenantId}`,
    `sourceWorkspace=${source.workspaceId}`,
    `compiledWorkspace=${compiled.workspaceId}`
  ]);
  add("policy-id", compiled.policyId.length > 0 ? "PASS" : "FAIL", true, [`policyId=${compiled.policyId || "missing"}`]);
  const controlSections = [
    compiled.requiredCapabilities.length > 0 ? "requiredCapabilities" : "",
    Object.keys(compiled.validation).length > 0 ? "validation" : "",
    Object.keys(compiled.evidence).length > 0 ? "evidence" : "",
    Object.keys(compiled.failureHandling).length > 0 ? "failureHandling" : "",
    Object.keys(compiled.diagnostics).length > 0 ? "diagnostics" : "",
    Object.keys(compiled.observability).length > 0 ? "observability" : "",
    Object.keys(compiled.governance).length > 0 ? "governance" : "",
    Object.keys(compiled.enforcement).length > 0 ? "enforcement" : ""
  ].filter(Boolean);
  add("policy-controls", controlSections.length > 0 ? "PASS" : "FAIL", true, [`sections=${controlSections.join(",") || "none"}`]);
  const blockers = checks
    .filter((check) => check.required && check.status === "FAIL")
    .map((check) => `${check.id}:${check.evidence.join(";")}`);
  return {
    schema: "evopilot-tenant-harness-policy-validation/v1",
    tenantId: compiled.tenantId,
    workspaceId: compiled.workspaceId,
    policyId: compiled.policyId,
    status: blockers.length === 0 ? "VALIDATED" : "FAILED",
    checks,
    blockers,
    warnings: checks.filter((check) => check.status === "WARN").map((check) => `${check.id}:${check.evidence.join(";")}`),
    sourceDigest,
    compiledDigest,
    evaluatedAt: now
  };
}

export function hydrateTenantHarnessPolicyVersion(input: unknown): TenantHarnessPolicyVersion {
  const record = isRecord(input) ? input : {};
  const source = normalizeRawTenantHarnessPolicySource(record.sourceContent);
  const compiled = hydrateCompiledTenantHarnessPolicy(record.compiledContent, source);
  const now = new Date().toISOString();
  const validation = hydrateTenantHarnessPolicyValidation(record.validation, source, record.sourceDigest, record.compiledDigest);
  const generatedBy = isRecord(record.generatedBy) ? record.generatedBy : {};
  return {
    schema: "evopilot-tenant-harness-policy-version/v1",
    tenantId: safeFileName(String(record.tenantId ?? source.tenantId ?? DEFAULT_TENANT_ID)),
    workspaceId: safeFileName(String(record.workspaceId ?? source.workspaceId ?? DEFAULT_WORKSPACE_ID)),
    policyId: safeFileName(String(record.policyId ?? source.policyId ?? "default")),
    version: clampPositiveInteger(record.version, 1),
    status: normalizeTenantHarnessPolicyStatus(record.status),
    sourceFormat: normalizeTenantHarnessPolicySourceFormat(record.sourceFormat),
    sourceContent: source,
    sourceDigest: String(record.sourceDigest ?? digestObject(source)),
    compiledContent: compiled,
    compiledDigest: String(record.compiledDigest ?? digestObject(compiled)),
    validation,
    changelog: hydrateHarnessTemplateChangelog(record.changelog ?? source.metadata?.changelog, String(record.version ?? 1), String(record.updatedAt ?? now)),
    generatedBy: {
      mode: "user",
      actor: optionalTrimmedString(generatedBy.actor),
      evidence: normalizeStringList(generatedBy.evidence, [])
    },
    approvedAt: optionalTrimmedString(record.approvedAt),
    approvedBy: optionalTrimmedString(record.approvedBy),
    activatedAt: optionalTrimmedString(record.activatedAt),
    activatedBy: optionalTrimmedString(record.activatedBy),
    createdAt: String(record.createdAt ?? now),
    updatedAt: String(record.updatedAt ?? record.createdAt ?? now)
  };
}

export function hydrateCompiledTenantHarnessPolicy(value: unknown, source: TenantHarnessPolicySource): CompiledTenantHarnessPolicy {
  const record = isRecord(value) ? value : {};
  const appliesTo = isRecord(record.appliesTo) ? record.appliesTo : {};
  return {
    schema: "evopilot-tenant-harness-policy-compiled/v1",
    tenantId: safeFileName(String(record.tenantId ?? source.tenantId ?? DEFAULT_TENANT_ID)),
    workspaceId: safeFileName(String(record.workspaceId ?? source.workspaceId ?? DEFAULT_WORKSPACE_ID)),
    policyId: safeFileName(String(record.policyId ?? source.policyId ?? "default")),
    name: String(record.name ?? source.name ?? "Tenant Harness Policy"),
    description: optionalTrimmedString(record.description ?? source.description),
    appliesTo: {
      projectIds: normalizeStringList(appliesTo.projectIds, source.appliesTo?.projectIds ?? []),
      excludeProjectIds: normalizeStringList(appliesTo.excludeProjectIds, source.appliesTo?.excludeProjectIds ?? []),
      languageFamilies: normalizeStringList(appliesTo.languageFamilies, source.appliesTo?.languageFamilies ?? []),
      templateIds: normalizeStringList(appliesTo.templateIds, source.appliesTo?.templateIds ?? [])
    },
    requiredCapabilities: hydrateHarnessCapabilities(record.requiredCapabilities ?? source.requiredCapabilities ?? []),
    runtime: recordObject(record.runtime),
    validation: recordObject(record.validation),
    evidence: recordObject(record.evidence),
    rules: recordObject(record.rules),
    failureHandling: recordObject(record.failureHandling),
    diagnostics: recordObject(record.diagnostics),
    observability: recordObject(record.observability),
    governance: recordObject(record.governance),
    phaseMapping: isRecord(record.phaseMapping) ? record.phaseMapping as Partial<Record<MaturityPhase, string[]>> : source.phaseMapping ?? {},
    llmDraftPolicy: recordObject(record.llmDraftPolicy),
    enforcement: recordObject(record.enforcement),
    metadata: isRecord(record.metadata) ? record.metadata : source.metadata,
    compiledAt: String(record.compiledAt ?? new Date().toISOString())
  };
}

export function hydrateTenantHarnessPolicyValidation(value: unknown, source: TenantHarnessPolicySource, sourceDigest: unknown, compiledDigest: unknown): TenantHarnessPolicyValidationResult {
  const record = isRecord(value) ? value : {};
  const checks: TenantHarnessPolicyValidationResult["checks"] = Array.isArray(record.checks) ? record.checks.map((check) => {
    const item = isRecord(check) ? check : {};
    const status = String(item.status ?? "FAIL");
    const normalizedStatus: "PASS" | "FAIL" | "WARN" = status === "PASS" || status === "WARN" ? status : "FAIL";
    return {
      id: String(item.id ?? "unknown"),
      status: normalizedStatus,
      required: item.required !== false,
      evidence: normalizeStringList(item.evidence, [])
    };
  }) : [];
  const blockers = normalizeStringList(record.blockers, []);
  return {
    schema: "evopilot-tenant-harness-policy-validation/v1",
    tenantId: safeFileName(String(record.tenantId ?? source.tenantId ?? DEFAULT_TENANT_ID)),
    workspaceId: safeFileName(String(record.workspaceId ?? source.workspaceId ?? DEFAULT_WORKSPACE_ID)),
    policyId: safeFileName(String(record.policyId ?? source.policyId ?? "default")),
    status: record.status === "VALIDATED" && blockers.length === 0 ? "VALIDATED" : "FAILED",
    checks,
    blockers,
    warnings: normalizeStringList(record.warnings, []),
    sourceDigest: optionalTrimmedString(record.sourceDigest) ?? optionalTrimmedString(sourceDigest) ?? "",
    compiledDigest: optionalTrimmedString(record.compiledDigest) ?? optionalTrimmedString(compiledDigest) ?? "",
    evaluatedAt: String(record.evaluatedAt ?? new Date().toISOString())
  };
}

export function tenantHarnessPolicyRef(policy: TenantHarnessPolicyVersion): TenantHarnessPolicyRef {
  return {
    policyId: policy.policyId,
    version: policy.version,
    digest: policy.compiledDigest,
    scope: "tenant-workspace"
  };
}

export function tenantHarnessPolicyAppliesToProject(policy: TenantHarnessPolicyVersion, project: StoredProject, template?: HarnessTemplateProfile): boolean {
  const appliesTo = policy.compiledContent.appliesTo;
  if (appliesTo.projectIds.length > 0 && !appliesTo.projectIds.includes(project.id)) return false;
  if (appliesTo.excludeProjectIds.includes(project.id)) return false;
  if (appliesTo.languageFamilies.length > 0) {
    const language = String(project.runtime?.language ?? template?.languageFamily ?? "generic").toLowerCase();
    if (!appliesTo.languageFamilies.includes(language)) return false;
  }
  if (appliesTo.templateIds.length > 0 && (!template || !appliesTo.templateIds.includes(template.id))) return false;
  return true;
}

export function createProjectHarnessProfileVersion(store: FileStore, project: StoredProject, input: {
  source: ProjectHarnessProfileSource;
  sourceFormat: ProjectHarnessProfileSourceFormat;
  actor: string;
  status?: ProjectHarnessProfileStatus;
  generatedBy?: ProjectHarnessProfileVersion["generatedBy"];
}): ProjectHarnessProfileVersion {
  const now = new Date().toISOString();
  const source = normalizeProjectHarnessProfileSourceForProject(input.source, project);
  const template = resolveHarnessTemplateForSource(store, project, source);
  const tenantPolicies = store.listActiveTenantHarnessPoliciesForProject(project, template);
  const compiled = compileProjectHarnessProfile(project, template, tenantPolicies, source, now);
  const sourceDigest = digestObject(source);
  const compiledDigest = digestObject(compiled);
  const validation = validateCompiledProjectHarnessProfile(project, template, tenantPolicies, source, compiled, sourceDigest, compiledDigest, now);
  const previousActive = store.readActiveProjectHarnessProfile(project.id, source.profileId);
  const versions = store.listProjectHarnessProfileVersions(project.id, source.profileId);
  const version = versions.reduce((max, item) => Math.max(max, item.version), 0) + 1;
  const templateRef = harnessTemplateRef(template);
  return {
    schema: "evopilot-project-harness-profile-version/v1",
    tenantId: project.tenantId,
    workspaceId: project.workspaceId,
    projectId: project.id,
    profileId: source.profileId,
    version,
    status: input.status ?? (validation.status === "VALIDATED" ? "VALIDATED" : "DRAFT"),
    sourceFormat: input.sourceFormat,
    sourceContent: source,
    sourceDigest,
    compiledContent: compiled,
    compiledDigest,
    templateRef,
    policyRefs: tenantPolicies.map(tenantHarnessPolicyRef),
    validation,
    diffFromActive: previousActive ? diffProjectHarnessProfiles(project, source.profileId, previousActive, compiled, undefined, now) : undefined,
    generatedBy: input.generatedBy ?? {
      mode: "user",
      actor: input.actor,
      evidence: [`actor=${input.actor}`, `sourceFormat=${input.sourceFormat}`]
    },
    createdAt: now,
    updatedAt: now
  };
}

export async function generateProjectHarnessProfileDraft(store: FileStore, project: StoredProject, body: Record<string, unknown>, actor: string): Promise<ProjectHarnessProfileVersion> {
  const previousActive = store.readActiveProjectHarnessProfile(project.id, safeFileName(String(body.profileId ?? "default")));
  const templateSelection = selectHarnessTemplateForGeneration(store, project, body, previousActive);
  const template = templateSelection.template;
  const tenantPolicies = store.listActiveTenantHarnessPoliciesForProject(project, template);
  const requestedProfileId = optionalTrimmedString(body.llmProfileId ?? body.llmProfile);
  const llmResolution = resolveLoopLlmSelection(store, {
    project,
    tenantId: project.tenantId,
    workspaceId: project.workspaceId,
    requestedProfileId,
    requireLlm: store.requireLlm() || body.requireLlm === true
  });
  const client = store.resolveGoalPlanLlmClient(llmResolution.selection);
  if (!client) {
    if (store.requireLlm() || body.requireLlm === true) {
      throw httpError(409, "PROJECT_HARNESS_PROFILE_LLM_REQUIRED", "ProjectHarnessProfile generation requires a READY LLM profile or production LLM provider.");
    }
    return createProjectHarnessProfileVersion(store, project, {
      source: deterministicProjectHarnessProfileSource(project, template, tenantPolicies, body, previousActive, templateSelection),
      sourceFormat: "llm-generated",
      actor,
      status: "DRAFT",
      generatedBy: {
        mode: "deterministic-template",
        actor,
        evidence: [
          "llmGenerator=false",
          "reason=LLM provider is not configured in debug mode",
          previousActive ? `previousActiveVersion=${previousActive.version}` : "previousActiveVersion=none",
          `templateSelection=${templateSelection.mode}`,
          ...templateSelection.reasons.map((reason) => `templateSelectionReason=${reason}`),
          `template=${template.id}@${template.version}`,
          `templateDigest=${template.digest}`,
          ...tenantPolicies.map((policy) => `tenantPolicy=${policy.policyId}@v${policy.version}`),
          ...tenantPolicies.map((policy) => `tenantPolicyDigest=${policy.compiledDigest}`)
        ]
      }
    });
  }
  const startedAt = new Date().toISOString();
  const response = await client.generate({
    caller: "evopilot-project-harness-profile-generator",
    intent: "structured.extraction",
    outputContract: "json_object",
    jsonObject: true,
    latencyClass: "batch",
    complexity: "high",
    outputSize: "large",
    metadata: {
      productFlow: "project-harness-profile-generation",
      projectId: project.id,
      tenantId: project.tenantId,
      workspaceId: project.workspaceId,
      templateId: template.id,
      templateVersion: template.version,
      templateSelectionMode: templateSelection.mode,
      actor,
      llmProfileId: llmResolution.selection.profileId ?? "global-default"
    },
    prompt: projectHarnessProfileGeneratorPrompt(project, template, tenantPolicies, body, previousActive)
  });
  if (!response.success || !response.text.trim()) {
    throw httpError(409, "PROJECT_HARNESS_PROFILE_LLM_FAILED", response.errorMessage ?? response.errorCode ?? "LLM harness profile generation failed.");
  }
  let source: ProjectHarnessProfileSource;
  try {
    const parsed = JSON.parse(extractJsonObject(response.text));
    source = normalizeRawProjectHarnessProfileSource(isRecord(parsed) && isRecord(parsed.profile) ? parsed.profile : parsed);
  } catch (error) {
    throw httpError(422, "PROJECT_HARNESS_PROFILE_LLM_OUTPUT_INVALID", error instanceof Error ? error.message : String(error));
  }
  return createProjectHarnessProfileVersion(store, project, {
    source: {
      ...source,
      schema: "evopilot-project-harness-profile/v1",
      profileId: safeFileName(String(source.profileId ?? body.profileId ?? "default")),
      projectId: project.id,
      tenantId: project.tenantId,
      workspaceId: project.workspaceId,
      template: harnessTemplateRef(template),
      metadata: {
        ...(source.metadata ?? {}),
        generatedFromGoalLoopTarget: optionalTrimmedString(body.goalLoopTarget ?? body.objective),
        previousActiveProfileVersion: previousActive?.version,
        templateSelectionMode: templateSelection.mode,
        templateSelectionReasons: templateSelection.reasons,
        tenantPolicyRefs: tenantPolicies.map(tenantHarnessPolicyRef)
      }
    },
    sourceFormat: "llm-generated",
    actor,
    status: "DRAFT",
    generatedBy: {
      mode: "llm",
      actor,
      llmProfileId: llmResolution.selection.profileId,
      provider: response.provider ?? llmResolution.selection.provider,
      model: response.model ?? llmResolution.selection.model,
      requestId: response.requestId,
      evidence: [
        `requestId=${response.requestId}`,
        `provider=${response.provider ?? llmResolution.selection.provider ?? "unknown"}`,
        `model=${response.model ?? llmResolution.selection.model ?? "unknown"}`,
        `startedAt=${startedAt}`,
        `durationMs=${response.durationMs}`,
        previousActive ? `previousActiveVersion=${previousActive.version}` : "previousActiveVersion=none",
        `templateSelection=${templateSelection.mode}`,
        ...templateSelection.reasons.map((reason) => `templateSelectionReason=${reason}`),
        `template=${template.id}@${template.version}`,
        `templateDigest=${template.digest}`,
        ...tenantPolicies.map((policy) => `tenantPolicy=${policy.policyId}@v${policy.version}`),
        ...tenantPolicies.map((policy) => `tenantPolicyDigest=${policy.compiledDigest}`)
      ]
    }
  });
}

export function deterministicProjectHarnessProfileSource(project: StoredProject, template: HarnessTemplateProfile, tenantPolicies: TenantHarnessPolicyVersion[], body: Record<string, unknown>, previousActive?: ProjectHarnessProfileVersion, templateSelection?: HarnessTemplateSelection): ProjectHarnessProfileSource {
  const profileId = safeFileName(String(body.profileId ?? "default"));
  const goalLoopTarget = optionalTrimmedString(body.goalLoopTarget ?? body.objective ?? body.target ?? body.prompt);
  const projectRuntime = project.runtime;
  const defaultCommands = harnessTemplateDefaultCommands(template);
  const templateRuntimePatterns = recordObject(template.runtimePatterns);
  const templateService = recordObject(template.runtimePatterns.service);
  const templateLayers = harnessTemplateLayerMetadata(template);
  const templateDomainExecution = recordObject(templateRuntimePatterns.domainExecution);
  const domainRequiredActions = domainHarnessRequiredActions(templateDomainExecution);
  const domainEvidenceAdapters = domainHarnessEvidenceAdapters(templateDomainExecution);
  const domainReleaseBlockers = domainHarnessReleaseBlockers(templateDomainExecution);
  const domainRepoProbe = projectDomainHarnessRepoProbe(project, template);
  const language = projectRuntime?.language ?? template.languageFamily;
  const requiredCommandGroups = normalizeStringList(template.validationBaseline.requiredCommandGroups, ["install", "unit", "smoke"]);
  const templateExceptionTracking = recordObject(template.failureTaxonomy.exceptionTracking);
  const templateRunbookRequirements = recordObject(template.diagnosticsBaseline.runbookRequirements);
  const templateStructuredLogs = recordObject(template.observabilityBaseline.structuredLogs);
  const templateMetrics = recordObject(template.observabilityBaseline.metrics);
  const templateTraces = recordObject(template.observabilityBaseline.traces);
  const templateDashboards = recordObject(template.observabilityBaseline.dashboards);
  const templateAlerts = recordObject(template.observabilityBaseline.alerts);
  const templateSlo = recordObject(template.observabilityBaseline.slo);
  return {
    schema: "evopilot-project-harness-profile/v1",
    profileId,
    projectId: project.id,
    tenantId: project.tenantId,
    workspaceId: project.workspaceId,
    name: String(body.name ?? `${project.name} ${template.name} Profile`),
    description: goalLoopTarget
      ? `Project-level harness profile generated for goal loop target: ${goalLoopTarget}`
      : `Project-level harness profile generated from ${template.id}@${template.version}.`,
    template: harnessTemplateRef(template),
    capabilities: template.capabilities,
    runtime: {
      ...templateLayers,
      language,
      installCommands: projectRuntime?.installCommands ?? defaultCommands.install,
      lintCommands: defaultCommands.lint,
      typecheckCommands: defaultCommands.typecheck,
      unitCommands: projectRuntime?.unitCommands ?? defaultCommands.unit,
      smokeCommands: projectRuntime?.smokeCommands ?? defaultCommands.smoke,
      functionalCommands: projectRuntime?.functionalCommands ?? defaultCommands.functional,
      service: projectRuntime?.service ?? templateService,
      repositoryProvider: project.repository?.provider ?? "unknown",
      devopsProvider: project.devops?.provider ?? "unknown"
    },
    validation: {
      requiredCommandGroups,
      commands: ["installCommands", "lintCommands", "typecheckCommands", "unitCommands", "smokeCommands"],
      requiredActions: domainHarnessRequiredActionIds(templateDomainExecution),
      missingModuleBoundaries: domainRepoProbe.missingModuleBoundaries,
      requireExitCode: true,
      requireCommandOutput: true,
      requireTargetEvidencePackage: true,
      requireObservabilitySnapshot: true,
      requireFailureReportForBrokenTargets: true
    },
    evidence: {
      format: "json",
      requiredArtifacts: ["target-evidence-package", "phase-package", "goal-completion-report"],
      requiredEvidence: ["command-output", "exit-code", "runtime-log", "ci-status-or-local-proof", "release-decision", "trace-or-correlation-link", "alert-or-slo-proof"],
      evidenceAdapters: domainEvidenceAdapters,
      correlationFields: normalizeStringList(template.evidenceContract.correlationFields, ["requestId", "traceId", "spanId", "tenantId", "workspaceId", "projectId", "release"])
    },
    rules: {
      capabilityBoundaryRequired: true,
      domainHarnessRequiredActions: domainRequiredActions,
      domainHarnessReleaseBlockers: domainReleaseBlockers,
      profileRevisionSuggestionWhenGapFound: true,
      noSilentActiveProfileMutation: true
    },
    failureHandling: {
      categories: normalizeStringList(template.failureTaxonomy.categories, ["dependency", "environment", "test", "contract", "deploy", "observability", "governance", "unknown"]),
      requiredFields: ["failingCommand", "exitCode", "symptom", "rootCauseHypothesis", "owner", "nextAction", "verificationCommand", "requestId", "traceId", "errorCode"],
      exceptionTracking: templateExceptionTracking
    },
    diagnostics: {
      requiredSignals: normalizeStringList(template.diagnosticsBaseline.requiredSignals, ["failing-command", "exit-code", "stack-trace-or-log", "changed-files", "runtime-env"]),
      commands: harnessTemplateDiagnosticCommands(template),
      rootCauseFields: normalizeStringList(template.diagnosticsBaseline.rootCauseFields, ["symptom", "hypothesis", "evidence", "fix", "verification"]),
      runbookRequirements: templateRunbookRequirements
    },
    observability: {
      requiredSignals: normalizeStringList(template.observabilityBaseline.requiredSignals, ["health", "readiness", "logs", "metrics", "traces", "alerts"]),
      healthCheck: projectRuntime?.service?.healthPath ?? optionalTrimmedString(templateService.healthPath) ?? "/health",
      structuredLogs: templateStructuredLogs,
      metrics: templateMetrics,
      traces: templateTraces,
      dashboards: templateDashboards,
      alerts: templateAlerts,
      slo: templateSlo,
      gaRequiresLiveHealthEvidence: true
    },
    governance: {
      tenantWorkspaceScopeRequired: true,
      targetPlanRequiresApproval: true,
      profileActivationRequiresApproval: true,
      promotionRequiresReleaseDecision: true,
      sourceClosureRequired: true,
      noSilentProfileMutation: true
    },
    phaseMapping: template.phaseMapping,
    llmDraftPolicy: {
      enabled: true,
      generatedStatus: "DRAFT",
      requireUserReview: true,
      activationRequiresAdmin: true,
      reonboardingUsesPreviousActiveProfile: true,
      allowedToSuggestProfileRevision: true,
      allowedToSilentlyModifyActiveProfile: false
    },
    metadata: {
      goalLoopTarget,
      previousActiveProfileVersion: previousActive?.version,
      previousActiveCompiledDigest: previousActive?.compiledDigest,
      generatedBy: "deterministic-template",
      templateSelectionMode: templateSelection?.mode,
      templateSelectionReasons: templateSelection?.reasons,
      templateHarnessLayer: templateLayers.harnessLayer,
      templateDomain: templateLayers.domain,
      compatibilityProfiles: templateLayers.compatibilityProfiles,
      architectureProfiles: templateLayers.architectureProfiles,
      runtimeProfiles: templateLayers.runtimeProfiles,
      referenceBoundary: templateLayers.referenceBoundary,
      domainExecution: Object.keys(templateDomainExecution).length > 0 ? templateDomainExecution : undefined,
      repoProbe: domainRepoProbe,
      referenceProductsAreOraclesOnly: templateRuntimePatterns.referenceBoundary ? true : undefined,
      tenantPolicyRefs: tenantPolicies.map(tenantHarnessPolicyRef)
    }
  };
}

export function harnessTemplateLayerMetadata(template: HarnessTemplateProfile): Record<string, unknown> {
  const runtimePatterns = recordObject(template.runtimePatterns);
  const metadata: Record<string, unknown> = {};
  const harnessLayer = optionalTrimmedString(runtimePatterns.harnessLayer);
  const domain = optionalTrimmedString(runtimePatterns.domain);
  const domainLabel = optionalTrimmedString(runtimePatterns.domainLabel);
  if (harnessLayer) metadata.harnessLayer = harnessLayer;
  if (domain) metadata.domain = domain;
  if (domainLabel) metadata.domainLabel = domainLabel;
  if (Array.isArray(runtimePatterns.compatibilityProfiles)) metadata.compatibilityProfiles = runtimePatterns.compatibilityProfiles;
  if (Array.isArray(runtimePatterns.architectureProfiles)) metadata.architectureProfiles = runtimePatterns.architectureProfiles;
  if (Array.isArray(runtimePatterns.runtimeProfiles)) metadata.runtimeProfiles = runtimePatterns.runtimeProfiles;
  if (isRecord(runtimePatterns.referenceBoundary)) metadata.referenceBoundary = runtimePatterns.referenceBoundary;
  return metadata;
}

export function harnessTemplateDefaultCommands(template: HarnessTemplateProfile): Record<"install" | "lint" | "typecheck" | "unit" | "smoke" | "functional", string[]> {
  const defaults = recordObject(template.runtimePatterns.defaultCommands);
  return {
    install: normalizeStringList(defaults.install, []),
    lint: normalizeStringList(defaults.lint, []),
    typecheck: normalizeStringList(defaults.typecheck, []),
    unit: normalizeStringList(defaults.unit, []),
    smoke: normalizeStringList(defaults.smoke, []),
    functional: normalizeStringList(defaults.functional, [])
  };
}

export function harnessTemplateDiagnosticCommands(template: HarnessTemplateProfile): string[] {
  const defaults: Record<HarnessTemplateProfile["languageFamily"], string[]> = {
    python: ["python --version", "pip --version", "pytest --version"],
    node: ["node --version", "npm --version"],
    java: ["java -version", "./mvnw --version", "./gradlew --version"],
    go: ["go version", "go env"],
    generic: ["uname -a", "env | sort"]
  };
  const runtimeDiagnostics = normalizeStringList(recordObject(template.runtimePatterns).diagnosticCommands, []);
  return runtimeDiagnostics.length > 0 ? runtimeDiagnostics : defaults[template.languageFamily];
}

export function projectHarnessProfileGeneratorPrompt(project: StoredProject, template: HarnessTemplateProfile, tenantPolicies: TenantHarnessPolicyVersion[], body: Record<string, unknown>, previousActive?: ProjectHarnessProfileVersion): string {
  return [
    "You are EvoPilot's ProjectHarnessProfile generator for enterprise software projects.",
    "Return only one JSON object. Do not include Markdown.",
    "The generated profile is a DRAFT control-plane definition. It must be reviewable by a user and must not silently activate itself.",
    "Generate a project-level ProjectHarnessProfile from the goal loop target, the platform HarnessTemplate, active tenant/workspace HarnessPolicy records, project onboarding/runtime/devops/observability context, and any previous active profile.",
    "The project profile may bind concrete commands and strengthen criteria. It must inherit every active tenant/workspace policy and must not weaken mandatory governance gates from the template or policy.",
    "",
    "Output JSON schema:",
    "{",
    "  \"schema\": \"evopilot-project-harness-profile/v1\",",
    "  \"profileId\": \"default\",",
    "  \"projectId\": \"project id\",",
    "  \"tenantId\": \"tenant id\",",
    "  \"workspaceId\": \"workspace id\",",
    "  \"name\": \"profile name\",",
    "  \"description\": \"what this profile controls\",",
    "  \"template\": { \"templateId\": \"id\", \"version\": \"version\", \"digest\": \"sha256:...\" },",
    "  \"capabilities\": [{ \"id\": \"kebab-case\", \"name\": \"name\", \"boundary\": \"boundary\", \"requiredEvidence\": [\"evidence\"] }],",
    "  \"runtime\": { \"harnessLayer\": \"domain|runtime\", \"domain\": \"optional vertical domain\", \"compatibilityProfiles\": [], \"architectureProfiles\": [], \"runtimeProfiles\": [], \"language\": \"python|node|java|go|generic\", \"installCommands\": [], \"lintCommands\": [], \"typecheckCommands\": [], \"unitCommands\": [], \"smokeCommands\": [], \"functionalCommands\": [] },",
    "  \"validation\": { \"requiredCommandGroups\": [], \"commands\": [], \"requiredActions\": [], \"missingModuleBoundaries\": [], \"requireExitCode\": true, \"requireCommandOutput\": true },",
    "  \"evidence\": { \"format\": \"json\", \"requiredArtifacts\": [], \"requiredEvidence\": [], \"evidenceAdapters\": [] },",
    "  \"rules\": { \"domainHarnessRequiredActions\": [], \"domainHarnessReleaseBlockers\": [], \"noSilentActiveProfileMutation\": true },",
    "  \"failureHandling\": { \"categories\": [], \"requiredFields\": [], \"exceptionTracking\": { \"requiredAttributes\": [], \"groupingKeys\": [], \"mustLinkToTrace\": true } },",
    "  \"diagnostics\": { \"requiredSignals\": [], \"commands\": [], \"rootCauseFields\": [], \"runbookRequirements\": { \"criticalAlertsRequireRunbook\": true } },",
    "  \"observability\": { \"requiredSignals\": [], \"healthCheck\": \"/health\", \"structuredLogs\": { \"requiredFields\": [] }, \"metrics\": {}, \"traces\": {}, \"dashboards\": {}, \"alerts\": {}, \"slo\": {} },",
    "  \"governance\": { \"tenantWorkspaceScopeRequired\": true, \"targetPlanRequiresApproval\": true, \"profileActivationRequiresApproval\": true, \"promotionRequiresReleaseDecision\": true, \"sourceClosureRequired\": true, \"noSilentProfileMutation\": true },",
    "  \"phaseMapping\": { \"alpha\": [], \"beta\": [], \"rc\": [], \"ga\": [] },",
    "  \"llmDraftPolicy\": { \"requireUserReview\": true, \"allowedToSilentlyModifyActiveProfile\": false }",
    "}",
    "",
    "Project:",
    JSON.stringify(maskProject(project), null, 2),
    "",
    "HarnessTemplate:",
    JSON.stringify(template, null, 2),
    "",
    "Active tenant/workspace HarnessPolicy records:",
    tenantPolicies.length > 0 ? JSON.stringify(tenantPolicies.map((policy) => ({
      policyId: policy.policyId,
      version: policy.version,
      compiledDigest: policy.compiledDigest,
      sourceContent: policy.sourceContent,
      compiledContent: policy.compiledContent
    })), null, 2) : "none",
    "",
    "Goal loop target and control-plane requirements:",
    JSON.stringify({
      goalLoopTarget: body.goalLoopTarget ?? body.objective ?? body.target ?? "",
      controlPlaneRequirements: body.controlPlaneRequirements,
      runtimeNotes: body.runtimeNotes,
      observabilityNotes: body.observabilityNotes,
      failureHandlingNotes: body.failureHandlingNotes,
      governanceNotes: body.governanceNotes
    }, null, 2),
    "",
    "Previous active ProjectHarnessProfile:",
    previousActive ? JSON.stringify({
      version: previousActive.version,
      sourceDigest: previousActive.sourceDigest,
      compiledDigest: previousActive.compiledDigest,
      templateRef: previousActive.templateRef,
      sourceContent: previousActive.sourceContent,
      compiledContent: previousActive.compiledContent
    }, null, 2) : "none"
  ].join("\n");
}

export function projectHarnessProfileDiffWithoutBase(project: StoredProject, profileId: string, candidateVersion?: number): ProjectHarnessProfileDiff {
  return {
    schema: "evopilot-project-harness-profile-diff/v1",
    tenantId: project.tenantId,
    workspaceId: project.workspaceId,
    projectId: project.id,
    profileId,
    candidateVersion,
    status: "CHANGED",
    changedSections: ["profile"],
    breakingChanges: [],
    warnings: ["No active ProjectHarnessProfile exists; candidate will become the first active control-plane definition after activation."],
    generatedAt: new Date().toISOString()
  };
}

export function explainProjectHarnessProfile(project: StoredProject, version: ProjectHarnessProfileVersion): Record<string, unknown> {
  const compiled = version.compiledContent;
  return {
    schema: "evopilot-project-harness-profile-explain/v1",
    tenantId: project.tenantId,
    workspaceId: project.workspaceId,
    projectId: project.id,
    profileId: version.profileId,
    version: version.version,
    status: version.status,
    sourceDigest: version.sourceDigest,
    compiledDigest: version.compiledDigest,
    templateRef: version.templateRef,
    policyRefs: version.policyRefs,
    storage: {
      authority: "evopilot-control-plane",
      format: "json",
      scope: "tenant/workspace/project/profile/version"
    },
    moduleMapping: [
      {
        module: "Project onboarding",
        profileSections: ["tenantId", "workspaceId", "projectId", "templateRef", "policyRefs"],
        controls: ["tenant/workspace isolation", "project identity", "template version/digest lock", "tenant/workspace policy version/digest lock"]
      },
      {
        module: "Goal target planner",
        profileSections: ["capabilities", "validation", "phaseMapping", "governance"],
        controls: ["GoalTarget capability boundaries", "Alpha/Beta/RC/GA target requirements", "plan approval rules"]
      },
      {
        module: "Executor and runtime",
        profileSections: ["runtime", "rules"],
        controls: ["install/lint/type/unit/smoke command groups", "service readiness", "allowed evidence boundary"]
      },
      {
        module: "Evidence contract",
        profileSections: ["evidence", "validation"],
        controls: ["TargetEvidencePackage", "PhasePackage", "GoalCompletionReport", "command output and exit-code evidence"]
      },
      {
        module: "Failure handling and diagnostics",
        profileSections: ["failureHandling", "diagnostics"],
        controls: ["failure taxonomy", "root-cause fields", "repair verification contract"]
      },
      {
        module: "Observability",
        profileSections: ["observability"],
        controls: ["health/readiness/log/metric/trace/alert evidence", "GA live-health proof"]
      },
      {
        module: "Release governance",
        profileSections: ["governance", "phaseMapping", "llmDraftPolicy"],
        controls: ["source closure", "release decision", "no silent profile mutation", "admin activation"]
      }
    ],
    effectiveControls: {
      capabilities: compiled.capabilities.map((capability) => ({
        id: capability.id,
        boundary: capability.boundary,
        requiredEvidence: capability.requiredEvidence
      })),
      runtime: compiled.runtime,
      validation: compiled.validation,
      evidence: compiled.evidence,
      failureHandling: compiled.failureHandling,
      diagnostics: compiled.diagnostics,
      observability: compiled.observability,
      governance: compiled.governance,
      phaseMapping: compiled.phaseMapping,
      llmDraftPolicy: compiled.llmDraftPolicy
    },
    inheritance: {
      inheritedSections: compiled.inheritedSections,
      overrideSections: compiled.overrideSections,
      policyRefs: compiled.policyRefs
    },
    generatedAt: new Date().toISOString()
  };
}

export function normalizeProjectHarnessProfileSourceForProject(source: ProjectHarnessProfileSource, project: StoredProject): ProjectHarnessProfileSource {
  const profileId = safeFileName(String(source.profileId ?? "default"));
  return {
    ...source,
    schema: "evopilot-project-harness-profile/v1",
    profileId,
    projectId: source.projectId ? safeFileName(source.projectId) : project.id,
    tenantId: source.tenantId ? safeFileName(source.tenantId) : project.tenantId,
    workspaceId: source.workspaceId ? safeFileName(source.workspaceId) : project.workspaceId,
    name: source.name || `${project.name} Harness Profile`
  };
}

export function selectHarnessTemplateForGeneration(store: FileStore, project: StoredProject, body: Record<string, unknown>, previousActive?: ProjectHarnessProfileVersion): HarnessTemplateSelection {
  const requestedTemplateId = optionalTrimmedString(body.templateId) ?? optionalTrimmedString(body.fromTemplate);
  const requestedTemplateVersion = optionalTrimmedString(body.templateVersion);
  if (requestedTemplateId) {
    const templateId = safeFileName(requestedTemplateId);
    const template = store.readHarnessTemplate(templateId, requestedTemplateVersion);
    if (!template) throw httpError(404, "HARNESS_TEMPLATE_NOT_FOUND", `Harness template ${templateId}${requestedTemplateVersion ? `@${requestedTemplateVersion}` : ""} was not found.`);
    return {
      template,
      mode: "request-override",
      reasons: [
        `requestOverrideTemplate=${template.id}`,
        `requestOverrideVersion=${requestedTemplateVersion ?? "latest"}`
      ]
    };
  }
  if (requestedTemplateVersion) {
    throw httpError(400, "HARNESS_TEMPLATE_ID_REQUIRED_FOR_VERSION", "templateVersion requires templateId or fromTemplate.");
  }
  if (previousActive) {
    const template = store.readHarnessTemplate(previousActive.templateRef.templateId, previousActive.templateRef.version)
      ?? store.readHarnessTemplate(previousActive.templateRef.templateId);
    if (template) {
      return {
        template,
        mode: "previous-active-profile",
        reasons: [
          `previousActiveVersion=${previousActive.version}`,
          `previousActiveTemplate=${previousActive.templateRef.templateId}@${previousActive.templateRef.version}`
        ]
      };
    }
  }
  return selectHarnessTemplateForProjectContext(store, project, body);
}

export function selectHarnessTemplateForProjectContext(store: FileStore, project: StoredProject, body: Record<string, unknown>): HarnessTemplateSelection {
  const contextText = harnessTemplateSelectionContextText(project, body);
  const candidates = store.listHarnessTemplates().map((template) => {
    const scored = scoreHarnessTemplateForProjectContext(template, project, contextText);
    return {
      template,
      score: scored.score,
      reasons: scored.reasons
    };
  }).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.template.id === right.template.id) return compareHarnessTemplateVersions(right.template.version, left.template.version);
    if (left.template.id === "generic-management-software-harness") return -1;
    if (right.template.id === "generic-management-software-harness") return 1;
    return left.template.id.localeCompare(right.template.id);
  });
  const selected = candidates[0];
  if (!selected) throw httpError(404, "HARNESS_TEMPLATE_NOT_FOUND", "No HarnessTemplate is available for automatic ProjectHarnessProfile generation.");
  return {
    template: selected.template,
    mode: "auto-match",
    reasons: selected.reasons.length > 0 ? selected.reasons : ["fallback=generic-management-software"],
    candidateScores: candidates.slice(0, 9).map((candidate) => ({
      templateId: candidate.template.id,
      version: candidate.template.version,
      score: candidate.score,
      reasons: candidate.reasons
    }))
  };
}

export function resolveHarnessTemplateForSource(store: FileStore, project: StoredProject, source: ProjectHarnessProfileSource): HarnessTemplateProfile {
  const templateRecord = isRecord(source.template) ? source.template : {};
  const requestedTemplateId = optionalTrimmedString(templateRecord.templateId) ?? optionalTrimmedString(templateRecord.id);
  const version = optionalTrimmedString(templateRecord.version);
  if (!requestedTemplateId && version) throw httpError(400, "HARNESS_TEMPLATE_ID_REQUIRED_FOR_VERSION", "template.version requires template.templateId or template.id.");
  if (!requestedTemplateId) return selectHarnessTemplateForProjectContext(store, project, { profileSource: source }).template;
  const templateId = safeFileName(requestedTemplateId);
  const template = store.readHarnessTemplate(templateId, version);
  if (!template) throw httpError(404, "HARNESS_TEMPLATE_NOT_FOUND", `Harness template ${templateId}${version ? `@${version}` : ""} was not found.`);
  return template;
}

export function scoreHarnessTemplateForProjectContext(template: HarnessTemplateProfile, project: StoredProject, contextText: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const runtimeLanguage = project.runtime?.language;
  const domainScore = scoreHarnessTemplateDomainForProjectContext(template, contextText);
  if (domainScore.score > 0) {
    score += domainScore.score;
    reasons.push(...domainScore.reasons);
  }
  if (runtimeLanguage && template.languageFamily === runtimeLanguage) {
    score += 120;
    reasons.push(`runtimeLanguage=${runtimeLanguage}`);
  } else if (runtimeLanguage === "generic" && template.languageFamily === "generic") {
    score += 70;
    reasons.push("runtimeLanguage=generic");
  } else if (!runtimeLanguage) {
    const detectedLanguage = detectHarnessTemplateLanguageFromContext(contextText);
    if (detectedLanguage && detectedLanguage === template.languageFamily) {
      score += 95;
      reasons.push(`detectedLanguage=${detectedLanguage}`);
    }
  }

  const builtInSignals = harnessTemplateBuiltInSignals(template.id);
  for (const signal of builtInSignals) {
    if (harnessSelectionTextIncludes(contextText, signal)) {
      score += signal.includes(".") || signal.includes("-") ? 18 : 12;
      reasons.push(`signal=${signal}`);
    }
  }

  const intrinsicSignals = harnessTemplateIntrinsicSignals(template).slice(0, 40);
  for (const signal of intrinsicSignals) {
    if (harnessSelectionTextIncludes(contextText, signal)) {
      score += 4;
      reasons.push(`templateSignal=${signal}`);
    }
  }

  if (template.languageFamily === "generic") score += 4;
  if (template.id === "generic-management-software-harness") {
    score += 8;
    reasons.push("fallback=generic-management-software");
  }
  return { score, reasons: uniqueStrings(reasons).slice(0, 12) };
}

export function scoreHarnessTemplateDomainForProjectContext(template: HarnessTemplateProfile, contextText: string): { score: number; reasons: string[] } {
  const runtimePatterns = recordObject(template.runtimePatterns);
  const domain = optionalTrimmedString(runtimePatterns.domain);
  if (!domain) return { score: 0, reasons: [] };
  const strongSignals = harnessTemplateDomainStrongSignals(template.id, domain);
  const matchedStrongSignals = strongSignals.filter((signal) => harnessSelectionTextIncludes(contextText, signal));
  if (matchedStrongSignals.length > 0) {
    return {
      score: 180 + Math.min(matchedStrongSignals.length, 5) * 12,
      reasons: [`domain=${domain}`, ...matchedStrongSignals.slice(0, 5).map((signal) => `domainSignal=${signal}`)]
    };
  }

  if (domain === "database-product") {
    const negativeApplicationSignals = [
      "database connection",
      "database migration",
      "database datasource",
      "jdbc datasource",
      "orm",
      "crud repository",
      "connect to mysql",
      "connect to postgres",
      "连接mysql",
      "连接 postgresql",
      "数据库连接",
      "数据源"
    ];
    if (negativeApplicationSignals.some((signal) => harnessSelectionTextIncludes(contextText, signal))) return { score: 0, reasons: [] };
    const databaseMentioned = contextHasAnyHarnessSignal(contextText, ["database", "dbms", "sql", "数据库"]);
    const productCoreMentioned = contextHasAnyHarnessSignal(contextText, [
      "engine",
      "kernel",
      "product",
      "compatible",
      "compatibility",
      "optimizer",
      "transaction",
      "storage",
      "replication",
      "recovery",
      "distributed",
      "htap",
      "mpp",
      "内核",
      "产品",
      "兼容",
      "优化器",
      "事务",
      "存储",
      "复制",
      "恢复",
      "分布式"
    ]);
    if (databaseMentioned && productCoreMentioned) {
      return { score: 150, reasons: [`domain=${domain}`, "domainComposite=database-product"] };
    }
  }

  return { score: 0, reasons: [] };
}

export function harnessTemplateSelectionContextText(project: StoredProject, body: Record<string, unknown>): string {
  const runtime = project.runtime;
  const repository = project.repository;
  const profileSource = isRecord(body.profileSource) ? body.profileSource : {};
  const fields = [
    project.id,
    project.name,
    project.profileId,
    runtime?.language,
    ...(runtime?.installCommands ?? []),
    ...(runtime?.unitCommands ?? []),
    ...(runtime?.smokeCommands ?? []),
    ...(runtime?.functionalCommands ?? []),
    runtime?.service?.startCommand,
    runtime?.service?.healthPath,
    repository?.provider,
    repository?.root,
    repository?.gitUrl,
    repository?.owner,
    repository?.repo,
    repository?.projectId,
    repository?.topology?.claimBoundary,
    project.devops?.provider,
    project.devops?.ci.workflow,
    project.devops?.cd?.workflow,
    body.goalLoopTarget,
    body.objective,
    body.target,
    body.prompt,
    body.runtimeNotes,
    body.observabilityNotes,
    body.failureHandlingNotes,
    body.governanceNotes,
    ...(Array.isArray(body.controlPlaneRequirements) ? body.controlPlaneRequirements.map(String) : []),
    profileSource.name,
    profileSource.description,
    JSON.stringify(profileSource.runtime ?? {}),
    JSON.stringify(profileSource.capabilities ?? []),
    ...projectRepositoryFileHints(project)
  ].filter((value) => value !== undefined && value !== null).map(String);
  return fields.join("\n").toLowerCase();
}

export function detectHarnessTemplateLanguageFromContext(contextText: string): HarnessTemplateProfile["languageFamily"] | undefined {
  if (harnessSelectionTextIncludes(contextText, "pyproject.toml") || harnessSelectionTextIncludes(contextText, "pytest") || harnessSelectionTextIncludes(contextText, "python")) return "python";
  if (harnessSelectionTextIncludes(contextText, "pom.xml") || harnessSelectionTextIncludes(contextText, "build.gradle") || harnessSelectionTextIncludes(contextText, "spring") || harnessSelectionTextIncludes(contextText, "java")) return "java";
  if (harnessSelectionTextIncludes(contextText, "package.json") || harnessSelectionTextIncludes(contextText, "typescript") || harnessSelectionTextIncludes(contextText, "node")) return "node";
  if (harnessSelectionTextIncludes(contextText, "go.mod") || harnessSelectionTextIncludes(contextText, "golang")) return "go";
  return undefined;
}

export function harnessTemplateBuiltInSignals(templateId: string): string[] {
  const signals: Record<string, string[]> = {
    "python-enterprise-harness": ["python", "pyproject.toml", "requirements.txt", "pytest", "fastapi", "django", "flask", "uv", "poetry", "ruff", "mypy"],
    "java-ddd-service-harness": ["java", "spring", "spring boot", "maven", "gradle", "pom.xml", "build.gradle", "ddd", "domain-driven", "aggregate", "repository"],
    "node-saas-control-plane-harness": ["node", "typescript", "javascript", "npm", "pnpm", "package.json", "nestjs", "express", "saas", "tenant", "workspace", "rbac", "control plane", "queue", "worker"],
    "go-middleware-harness": ["go", "golang", "go.mod", "kubernetes", "controller", "middleware", "prometheus", "grpc", "concurrency", "race", "infrastructure", "operator"],
    "observability-apm-harness": ["observability", "apm", "otel", "opentelemetry", "telemetry", "trace", "metric", "log", "prometheus", "skywalking", "collector", "alert"],
    "database-product-harness": ["database product", "dbms", "sql engine", "storage engine", "query optimizer", "transaction engine", "distributed database", "htap", "mpp", "postgres-compatible", "mysql-compatible", "self-developed database", "自研数据库", "数据库产品", "数据库内核", "sql 兼容", "查询优化器", "存储引擎", "事务引擎"],
    "api-gateway-harness": ["api gateway", "gateway product", "ingress", "traffic proxy", "route matching", "upstream", "rate limit", "auth policy", "plugin", "filter chain", "envoy", "kong", "apisix", "gateway api", "网关", "流量网关"],
    "generic-management-software-harness": ["management", "admin", "workflow", "approval", "rbac", "report", "import", "export", "integration", "enterprise", "console", "backoffice"]
  };
  return signals[templateId] ?? [];
}

export function harnessTemplateDomainStrongSignals(templateId: string, domain: string): string[] {
  const signals: Record<string, string[]> = {
    "database-product": [
      "database product",
      "database engine",
      "self-developed database",
      "self developed database",
      "own database",
      "dbms",
      "sql engine",
      "storage engine",
      "query optimizer",
      "transaction engine",
      "distributed database",
      "database kernel",
      "database compatibility",
      "postgres-compatible",
      "postgres compatible",
      "postgresql-compatible",
      "postgresql compatible",
      "mysql-compatible",
      "mysql compatible",
      "htap",
      "mpp",
      "oltp engine",
      "crash recovery",
      "自研数据库",
      "数据库产品",
      "数据库内核",
      "数据库兼容",
      "sql兼容",
      "sql 兼容",
      "查询优化器",
      "存储引擎",
      "事务引擎",
      "分布式数据库"
    ],
    "api-gateway": [
      "api gateway",
      "gateway product",
      "gateway api",
      "ingress controller",
      "traffic proxy",
      "route matching",
      "upstream selection",
      "rate limit",
      "auth policy",
      "plugin lifecycle",
      "filter chain",
      "service mesh gateway",
      "envoy",
      "kong",
      "apisix",
      "网关",
      "api 网关",
      "流量网关",
      "路由匹配",
      "限流",
      "插件生命周期"
    ]
  };
  return uniqueStrings([...(signals[domain] ?? []), ...harnessTemplateBuiltInSignals(templateId)]);
}

export function harnessTemplateIntrinsicSignals(template: HarnessTemplateProfile): string[] {
  const runtimePatterns = recordObject(template.runtimePatterns);
  const values = [
    template.id,
    template.name,
    template.description,
    template.languageFamily,
    optionalTrimmedString(runtimePatterns.harnessLayer) ?? "",
    optionalTrimmedString(runtimePatterns.domain) ?? "",
    optionalTrimmedString(runtimePatterns.domainLabel) ?? "",
    ...normalizeStringList(runtimePatterns.architectureStyles, []),
    ...normalizeStringList(runtimePatterns.packageManagers, []),
    ...normalizeStringList(runtimePatterns.buildTools, []),
    ...harnessTemplateProfileSignals(runtimePatterns.compatibilityProfiles),
    ...harnessTemplateProfileSignals(runtimePatterns.architectureProfiles),
    ...normalizeStringList(runtimePatterns.runtimeProfiles, []),
    ...template.capabilities.flatMap((capability) => [capability.id, capability.name])
  ];
  return uniqueStrings(values.map((value) => String(value).toLowerCase()).flatMap((value) => value.split(/[,/|]+/)).map((value) => value.trim()).filter((value) => value.length >= 3));
}

export function harnessTemplateProfileSignals(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!isRecord(item)) return [];
    return [
      optionalTrimmedString(item.id),
      optionalTrimmedString(item.name),
      optionalTrimmedString(item.role),
      optionalTrimmedString(item.referenceProduct),
      ...normalizeStringList(item.scope, []),
      ...normalizeStringList(item.concerns, [])
    ].filter((entry): entry is string => Boolean(entry));
  });
}

export function contextHasAnyHarnessSignal(contextText: string, signals: string[]): boolean {
  return signals.some((signal) => harnessSelectionTextIncludes(contextText, signal));
}

export function harnessSelectionTextIncludes(contextText: string, signal: string): boolean {
  const normalized = signal.trim().toLowerCase();
  if (!normalized) return false;
  if (/^[a-z0-9+#.]+$/.test(normalized) && normalized.length <= 4) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalized)}([^a-z0-9]|$)`).test(contextText);
  }
  return contextText.includes(normalized);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compareHarnessTemplateVersions(left: string, right: string): number {
  const parse = (value: string) => value.split(/[.-]/).map((part) => Number(part)).map((part) => Number.isFinite(part) ? part : 0);
  const leftParts = parse(left);
  const rightParts = parse(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return left.localeCompare(right);
}

export function compileProjectHarnessProfile(project: StoredProject, template: HarnessTemplateProfile, tenantPolicies: TenantHarnessPolicyVersion[], source: ProjectHarnessProfileSource, now: string): CompiledProjectHarnessProfile {
  const sourceCapabilityIds = new Set((source.capabilities ?? []).map((capability) => capability.id));
  const policyCapabilities = tenantPolicies.flatMap((policy) => policy.compiledContent.requiredCapabilities);
  const capabilities = mergeHarnessCapabilities(template.capabilities, policyCapabilities, source.capabilities ?? []);
  const policyRefs = tenantPolicies.map(tenantHarnessPolicyRef);
  const policyRuntime = mergeHarnessPolicyRecords(tenantPolicies.map((policy) => policy.compiledContent.runtime));
  const policyValidation = mergeHarnessPolicyRecords(tenantPolicies.map((policy) => policy.compiledContent.validation));
  const policyEvidence = mergeHarnessPolicyRecords(tenantPolicies.map((policy) => policy.compiledContent.evidence));
  const policyRules = mergeHarnessPolicyRecords(tenantPolicies.map((policy) => policy.compiledContent.rules));
  const policyFailureHandling = mergeHarnessPolicyRecords(tenantPolicies.map((policy) => policy.compiledContent.failureHandling));
  const policyDiagnostics = mergeHarnessPolicyRecords(tenantPolicies.map((policy) => policy.compiledContent.diagnostics));
  const policyObservability = mergeHarnessPolicyRecords(tenantPolicies.map((policy) => policy.compiledContent.observability));
  const policyGovernance = mergeHarnessPolicyRecords(tenantPolicies.map((policy) => policy.compiledContent.governance));
  const policyLlmDraftPolicy = mergeHarnessPolicyRecords(tenantPolicies.map((policy) => policy.compiledContent.llmDraftPolicy));
  const policyPhaseMapping = mergeTenantHarnessPolicyPhaseMapping(tenantPolicies);
  const inheritedSections = ["capabilities", "runtime", "validation", "evidence", "failureHandling", "diagnostics", "observability", "governance", "phaseMapping", "llmDraftPolicy"];
  const policySections = [
    tenantPolicies.some((policy) => policy.compiledContent.requiredCapabilities.length > 0) ? "capabilities" : "",
    Object.keys(policyRuntime).length > 0 ? "runtime" : "",
    Object.keys(policyValidation).length > 0 ? "validation" : "",
    Object.keys(policyEvidence).length > 0 ? "evidence" : "",
    Object.keys(policyRules).length > 0 ? "rules" : "",
    Object.keys(policyFailureHandling).length > 0 ? "failureHandling" : "",
    Object.keys(policyDiagnostics).length > 0 ? "diagnostics" : "",
    Object.keys(policyObservability).length > 0 ? "observability" : "",
    Object.keys(policyGovernance).length > 0 ? "governance" : "",
    MATURITY_PHASES.some((phase) => (policyPhaseMapping[phase] ?? []).length > 0) ? "phaseMapping" : "",
    Object.keys(policyLlmDraftPolicy).length > 0 ? "llmDraftPolicy" : ""
  ].filter(Boolean);
  const overrideSections = [
    source.capabilities ? "capabilities" : "",
    source.runtime ? "runtime" : "",
    source.validation ? "validation" : "",
    source.evidence ? "evidence" : "",
    source.rules ? "rules" : "",
    source.failureHandling ? "failureHandling" : "",
    source.diagnostics ? "diagnostics" : "",
    source.observability ? "observability" : "",
    source.governance ? "governance" : "",
    source.phaseMapping ? "phaseMapping" : "",
    source.llmDraftPolicy ? "llmDraftPolicy" : ""
  ].filter(Boolean);
  return {
    schema: "evopilot-project-harness-compiled-profile/v1",
    tenantId: project.tenantId,
    workspaceId: project.workspaceId,
    projectId: project.id,
    profileId: source.profileId,
    name: source.name,
    templateRef: harnessTemplateRef(template),
    policyRefs,
    capabilities,
    runtime: mergeHarnessPolicyRecord(mergeHarnessPolicyRecord(template.runtimePatterns, policyRuntime), {
      projectRuntime: project.runtime,
      repositoryProvider: project.repository?.provider,
      devopsProvider: project.devops?.provider,
      ...(source.runtime ?? {})
    }),
    validation: mergeHarnessPolicyRecord(mergeHarnessPolicyRecord(template.validationBaseline, policyValidation), source.validation ?? {}),
    evidence: mergeHarnessPolicyRecord(mergeHarnessPolicyRecord(template.evidenceContract, policyEvidence), source.evidence ?? {}),
    rules: mergeHarnessPolicyRecord(mergeHarnessPolicyRecord({ capabilityBoundaries: capabilities.map((capability) => capability.id) }, policyRules), source.rules ?? {}),
    failureHandling: mergeHarnessPolicyRecord(mergeHarnessPolicyRecord(template.failureTaxonomy, policyFailureHandling), source.failureHandling ?? {}),
    diagnostics: mergeHarnessPolicyRecord(mergeHarnessPolicyRecord(template.diagnosticsBaseline, policyDiagnostics), source.diagnostics ?? {}),
    observability: mergeHarnessPolicyRecord(mergeHarnessPolicyRecord(template.observabilityBaseline, policyObservability), source.observability ?? {}),
    governance: mergeHarnessPolicyRecord(mergeHarnessPolicyRecord(template.governanceRules, policyGovernance), source.governance ?? {}),
    phaseMapping: mergeHarnessPhaseMapping(mergeHarnessPhaseMapping(template.phaseMapping, policyPhaseMapping), source.phaseMapping),
    llmDraftPolicy: mergeHarnessPolicyRecord(mergeHarnessPolicyRecord(template.llmDraftPolicy, policyLlmDraftPolicy), source.llmDraftPolicy ?? {}),
    inheritedSections: uniqueStrings([
      ...inheritedSections.filter((section) => !overrideSections.includes(section) || section === "capabilities" && sourceCapabilityIds.size < capabilities.length),
      ...policySections.map((section) => `tenant-policy:${section}`)
    ]),
    overrideSections,
    compiledAt: now
  };
}

export function mergeHarnessCapabilities(...capabilityGroups: HarnessCapabilityDefinition[][]): HarnessCapabilityDefinition[] {
  const byId = new Map<string, HarnessCapabilityDefinition>();
  for (const capabilities of capabilityGroups) {
    for (const capability of capabilities) {
      byId.set(capability.id, {
        ...byId.get(capability.id),
        ...capability,
        requiredEvidence: uniqueStrings([...(byId.get(capability.id)?.requiredEvidence ?? []), ...capability.requiredEvidence])
      });
    }
  }
  return [...byId.values()];
}

export function mergeRecord(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] = isRecord(current) && isRecord(value) ? mergeRecord(current, value) : value;
  }
  return result;
}

export function mergeHarnessPolicyRecords(records: Record<string, unknown>[]): Record<string, unknown> {
  return records.reduce((merged, record) => mergeHarnessPolicyRecord(merged, record), {});
}

export function mergeHarnessPolicyRecord(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    if (Array.isArray(current) && Array.isArray(value)) {
      result[key] = uniqueStrings([...current.map(String), ...value.map(String)]);
    } else if (isRecord(current) && isRecord(value)) {
      result[key] = mergeHarnessPolicyRecord(current, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function mergeHarnessPhaseMapping(base: Record<MaturityPhase, string[]>, override?: Partial<Record<MaturityPhase, string[]>>): Record<MaturityPhase, string[]> {
  return {
    alpha: uniqueStrings([...(base.alpha ?? []), ...(override?.alpha ?? [])]),
    beta: uniqueStrings([...(base.beta ?? []), ...(override?.beta ?? [])]),
    rc: uniqueStrings([...(base.rc ?? []), ...(override?.rc ?? [])]),
    ga: uniqueStrings([...(base.ga ?? []), ...(override?.ga ?? [])])
  };
}

export function mergeTenantHarnessPolicyPhaseMapping(tenantPolicies: TenantHarnessPolicyVersion[]): Partial<Record<MaturityPhase, string[]>> {
  return tenantPolicies.reduce((mapping, policy) => ({
    alpha: uniqueStrings([...(mapping.alpha ?? []), ...(policy.compiledContent.phaseMapping.alpha ?? [])]),
    beta: uniqueStrings([...(mapping.beta ?? []), ...(policy.compiledContent.phaseMapping.beta ?? [])]),
    rc: uniqueStrings([...(mapping.rc ?? []), ...(policy.compiledContent.phaseMapping.rc ?? [])]),
    ga: uniqueStrings([...(mapping.ga ?? []), ...(policy.compiledContent.phaseMapping.ga ?? [])])
  }), {} as Partial<Record<MaturityPhase, string[]>>);
}

export function validateCompiledProjectHarnessProfile(project: StoredProject, template: HarnessTemplateProfile, tenantPolicies: TenantHarnessPolicyVersion[], source: ProjectHarnessProfileSource, compiled: CompiledProjectHarnessProfile, sourceDigest: string, compiledDigest: string, now: string): ProjectHarnessProfileValidationResult {
  const checks: ProjectHarnessProfileValidationResult["checks"] = [];
  const add = (id: string, status: "PASS" | "FAIL" | "WARN", required: boolean, evidence: string[]) => checks.push({ id, status, required, evidence });
  add("project-scope", source.projectId === project.id && source.tenantId === project.tenantId && source.workspaceId === project.workspaceId ? "PASS" : "FAIL", true, [
    `sourceProject=${source.projectId}`,
    `project=${project.id}`,
    `sourceTenant=${source.tenantId}`,
    `tenant=${project.tenantId}`,
    `sourceWorkspace=${source.workspaceId}`,
    `workspace=${project.workspaceId}`
  ]);
  add("template-binding", compiled.templateRef.digest === template.digest ? "PASS" : "FAIL", true, [
    `template=${template.id}`,
    `templateVersion=${template.version}`,
    `templateDigest=${template.digest}`
  ]);
  const policyBindingFailures = detectTenantHarnessPolicyBindingFailures(tenantPolicies, compiled);
  add("tenant-harness-policy-binding", policyBindingFailures.length === 0 ? "PASS" : "FAIL", tenantPolicies.length > 0, policyBindingFailures.length === 0 ? [
    tenantPolicies.length > 0
      ? `policies=${tenantPolicies.map((policy) => `${policy.policyId}@v${policy.version}`).join(",")}`
      : "policies=none"
  ] : policyBindingFailures);
  add("capability-boundaries", compiled.capabilities.length > 0 && compiled.capabilities.every((capability) => capability.boundary && capability.requiredEvidence.length > 0) ? "PASS" : "FAIL", true, [
    `capabilities=${compiled.capabilities.map((capability) => capability.id).join(",") || "none"}`
  ]);
  add("runtime-validation", hasHarnessCommandEvidence(compiled.runtime, compiled.validation) ? "PASS" : "FAIL", true, [
    `runtimeKeys=${Object.keys(compiled.runtime).join(",") || "none"}`,
    `validationKeys=${Object.keys(compiled.validation).join(",") || "none"}`
  ]);
  add("evidence-contract", Array.isArray(compiled.evidence.requiredArtifacts) && compiled.evidence.requiredArtifacts.length > 0 ? "PASS" : "FAIL", true, [
    `format=${String(compiled.evidence.format ?? "unspecified")}`,
    `requiredArtifacts=${Array.isArray(compiled.evidence.requiredArtifacts) ? compiled.evidence.requiredArtifacts.join(",") : "none"}`
  ]);
  const compiledRuntime = recordObject(compiled.runtime);
  if (compiledRuntime.harnessLayer === "domain") {
    const requiredActions = Array.isArray(compiled.rules.domainHarnessRequiredActions) ? compiled.rules.domainHarnessRequiredActions : [];
    const evidenceAdapters = Array.isArray(compiled.evidence.evidenceAdapters) ? compiled.evidence.evidenceAdapters : [];
    const releaseBlockers = normalizeStringList(compiled.rules.domainHarnessReleaseBlockers, []);
    add("domain-harness-execution", requiredActions.length > 0 && evidenceAdapters.length > 0 && releaseBlockers.length > 0 ? "PASS" : "FAIL", true, [
      `domain=${String(compiledRuntime.domain ?? "missing")}`,
      `requiredActions=${requiredActions.length}`,
      `evidenceAdapters=${evidenceAdapters.length}`,
      `releaseBlockers=${releaseBlockers.length}`
    ]);
  }
  const governanceWeakening = detectHarnessGovernanceWeakening(template, compiled);
  add("mandatory-governance", governanceWeakening.length === 0 ? "PASS" : "FAIL", true, governanceWeakening.length === 0 ? [
    "targetPlanRequiresApproval=true",
    "profileActivationRequiresApproval=true",
    "promotionRequiresReleaseDecision=true",
    "sourceClosureRequired=true",
    "noSilentProfileMutation=true"
  ] : governanceWeakening);
  add("failure-diagnostics", Object.keys(compiled.failureHandling).length > 0 && Object.keys(compiled.diagnostics).length > 0 ? "PASS" : "FAIL", true, [
    `failureKeys=${Object.keys(compiled.failureHandling).join(",") || "none"}`,
    `diagnosticKeys=${Object.keys(compiled.diagnostics).join(",") || "none"}`
  ]);
  add("observability", Object.keys(compiled.observability).length > 0 ? "PASS" : "FAIL", true, [
    `observabilityKeys=${Object.keys(compiled.observability).join(",") || "none"}`
  ]);
  add("phase-mapping", MATURITY_PHASES.every((phase) => compiled.phaseMapping[phase].length > 0) ? "PASS" : "FAIL", true, [
    ...MATURITY_PHASES.map((phase) => `${phase}=${compiled.phaseMapping[phase].join(",")}`)
  ]);
  add("llm-draft-policy", compiled.llmDraftPolicy.allowedToSilentlyModifyActiveProfile !== true && compiled.llmDraftPolicy.requireUserReview !== false ? "PASS" : "FAIL", true, [
    `requireUserReview=${String(compiled.llmDraftPolicy.requireUserReview)}`,
    `allowedToSilentlyModifyActiveProfile=${String(compiled.llmDraftPolicy.allowedToSilentlyModifyActiveProfile)}`
  ]);
  const policyComplianceFailures = detectTenantHarnessPolicyComplianceFailures(tenantPolicies, compiled);
  add("tenant-harness-policy-compliance", policyComplianceFailures.length === 0 ? "PASS" : "FAIL", tenantPolicies.length > 0, policyComplianceFailures.length === 0 ? [
    tenantPolicies.length > 0 ? "active tenant/workspace policies inherited" : "active tenant/workspace policies=none"
  ] : policyComplianceFailures);
  const blockers = checks
    .filter((check) => check.required && check.status === "FAIL")
    .map((check) => `${check.id}:${check.evidence.join(";")}`);
  const warnings = checks
    .filter((check) => check.status === "WARN")
    .map((check) => `${check.id}:${check.evidence.join(";")}`);
  return {
    schema: "evopilot-project-harness-profile-validation/v1",
    tenantId: project.tenantId,
    workspaceId: project.workspaceId,
    projectId: project.id,
    profileId: source.profileId,
    templateRef: compiled.templateRef,
    policyRefs: compiled.policyRefs,
    status: blockers.length === 0 ? "VALIDATED" : "FAILED",
    checks,
    blockers,
    warnings,
    sourceDigest,
    compiledDigest,
    evaluatedAt: now
  };
}

export function detectTenantHarnessPolicyBindingFailures(tenantPolicies: TenantHarnessPolicyVersion[], compiled: CompiledProjectHarnessProfile): string[] {
  return tenantPolicies.flatMap((policy) => {
    const ref = compiled.policyRefs.find((item) => item.policyId === policy.policyId);
    if (!ref) return [`policy=${policy.policyId}@v${policy.version} missing from compiled policyRefs`];
    const failures: string[] = [];
    if (ref.version !== policy.version) failures.push(`policy=${policy.policyId} version=${ref.version} expected=${policy.version}`);
    if (ref.digest !== policy.compiledDigest) failures.push(`policy=${policy.policyId} digest=${ref.digest} expected=${policy.compiledDigest}`);
    return failures;
  });
}

export function detectTenantHarnessPolicyComplianceFailures(tenantPolicies: TenantHarnessPolicyVersion[], compiled: CompiledProjectHarnessProfile): string[] {
  const failures: string[] = [];
  const capabilityIds = compiled.capabilities.map((capability) => capability.id);
  for (const policy of tenantPolicies) {
    const policyName = `${policy.policyId}@v${policy.version}`;
    const policyContent = policy.compiledContent;
    for (const capability of policyContent.requiredCapabilities) {
      if (!capabilityIds.includes(capability.id)) failures.push(`${policyName}: capability ${capability.id} missing`);
    }
    failures.push(...missingRequiredStrings(policyName, "evidence.requiredArtifacts", compiled.evidence.requiredArtifacts, [
      ...normalizeStringList(policyContent.evidence.requiredArtifacts, []),
      ...normalizeStringList(policyContent.enforcement.requiredArtifacts, [])
    ]));
    failures.push(...missingRequiredStrings(policyName, "evidence.requiredEvidence", compiled.evidence.requiredEvidence, [
      ...normalizeStringList(policyContent.evidence.requiredEvidence, []),
      ...normalizeStringList(policyContent.enforcement.requiredEvidence, [])
    ]));
    failures.push(...missingRequiredStrings(policyName, "evidence.correlationFields", compiled.evidence.correlationFields, [
      ...normalizeStringList(policyContent.evidence.correlationFields, []),
      ...normalizeStringList(policyContent.enforcement.requiredCorrelationFields, [])
    ]));
    failures.push(...missingRequiredStrings(policyName, "failureHandling.requiredFields", compiled.failureHandling.requiredFields, [
      ...normalizeStringList(policyContent.failureHandling.requiredFields, []),
      ...normalizeStringList(policyContent.enforcement.requiredFailureFields, [])
    ]));
    const compiledExceptionTracking = recordObject(compiled.failureHandling.exceptionTracking);
    const policyExceptionTracking = recordObject(policyContent.failureHandling.exceptionTracking);
    failures.push(...missingRequiredStrings(policyName, "failureHandling.exceptionTracking.requiredAttributes", compiledExceptionTracking.requiredAttributes, [
      ...normalizeStringList(policyExceptionTracking.requiredAttributes, []),
      ...normalizeStringList(policyContent.enforcement.requiredExceptionAttributes, [])
    ]));
    failures.push(...missingRequiredStrings(policyName, "diagnostics.requiredSignals", compiled.diagnostics.requiredSignals, [
      ...normalizeStringList(policyContent.diagnostics.requiredSignals, []),
      ...normalizeStringList(policyContent.enforcement.requiredDiagnosticSignals, [])
    ]));
    failures.push(...missingRequiredStrings(policyName, "observability.requiredSignals", compiled.observability.requiredSignals, [
      ...normalizeStringList(policyContent.observability.requiredSignals, []),
      ...normalizeStringList(policyContent.enforcement.requiredObservabilitySignals, [])
    ]));
    const compiledStructuredLogs = recordObject(compiled.observability.structuredLogs);
    const policyStructuredLogs = recordObject(policyContent.observability.structuredLogs);
    failures.push(...missingRequiredStrings(policyName, "observability.structuredLogs.requiredFields", compiledStructuredLogs.requiredFields, [
      ...normalizeStringList(policyStructuredLogs.requiredFields, []),
      ...normalizeStringList(policyContent.enforcement.requiredStructuredLogFields, [])
    ]));
    for (const key of tenantHarnessPolicyRequiredGovernanceTrueKeys(policyContent)) {
      if (compiled.governance[key] !== true) failures.push(`${policyName}: governance.${key}=true required`);
    }
    for (const phase of MATURITY_PHASES) {
      failures.push(...missingRequiredStrings(policyName, `phaseMapping.${phase}`, compiled.phaseMapping[phase], normalizeStringList(policyContent.phaseMapping[phase], [])));
    }
  }
  return uniqueStrings(failures);
}

export function tenantHarnessPolicyRequiredGovernanceTrueKeys(policy: CompiledTenantHarnessPolicy): string[] {
  const explicit = normalizeStringList(policy.enforcement.requiredGovernanceTrue, []);
  const cannotWeaken = normalizeStringList(policy.governance.cannotWeaken, []);
  const trueKeys = Object.entries(policy.governance)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  return uniqueStrings([...explicit, ...cannotWeaken.filter((key) => policy.governance[key] === true), ...trueKeys]);
}

export function missingRequiredStrings(policyName: string, pathName: string, actualValue: unknown, requiredValues: string[]): string[] {
  const actual = normalizeStringList(actualValue, []);
  return uniqueStrings(requiredValues).filter((value) => !actual.includes(value)).map((value) => `${policyName}: ${pathName} missing ${value}`);
}

export function hasHarnessCommandEvidence(runtime: Record<string, unknown>, validation: Record<string, unknown>): boolean {
  const commandKeys = ["installCommands", "unitCommands", "smokeCommands", "functionalCommands", "commands", "defaultCommands", "requiredCommandGroups"];
  return commandKeys.some((key) => {
    const runtimeValue = runtime[key];
    const validationValue = validation[key];
    return Array.isArray(runtimeValue) && runtimeValue.length > 0
      || Array.isArray(validationValue) && validationValue.length > 0
      || isRecord(runtimeValue) && Object.keys(runtimeValue).length > 0
      || isRecord(validationValue) && Object.keys(validationValue).length > 0;
  });
}

export function detectHarnessGovernanceWeakening(template: HarnessTemplateProfile, compiled: CompiledProjectHarnessProfile): string[] {
  const cannotWeaken = Array.isArray(template.governanceRules.cannotWeaken) ? template.governanceRules.cannotWeaken.map(String) : [];
  return cannotWeaken
    .filter((key) => template.governanceRules[key] === true && compiled.governance[key] === false)
    .map((key) => `${key}=false weakens template governance`);
}

export function diffProjectHarnessProfiles(project: StoredProject, profileId: string, base: ProjectHarnessProfileVersion, candidate: CompiledProjectHarnessProfile, candidateVersion: number | undefined, now: string): ProjectHarnessProfileDiff {
  const sections = ["capabilities", "runtime", "validation", "evidence", "rules", "failureHandling", "diagnostics", "observability", "governance", "phaseMapping", "llmDraftPolicy"];
  const changedSections = sections.filter((section) => canonicalJson((base.compiledContent as any)[section]) !== canonicalJson((candidate as any)[section]));
  const breakingSections = new Set(["runtime", "validation", "evidence", "failureHandling", "diagnostics", "observability", "governance"]);
  return {
    schema: "evopilot-project-harness-profile-diff/v1",
    tenantId: project.tenantId,
    workspaceId: project.workspaceId,
    projectId: project.id,
    profileId,
    baseVersion: base.version,
    candidateVersion,
    status: changedSections.length > 0 ? "CHANGED" : "UNCHANGED",
    changedSections,
    breakingChanges: changedSections.filter((section) => breakingSections.has(section)).map((section) => `${section} changed; review affected executor/evidence contracts before activation.`),
    warnings: changedSections.includes("governance") ? ["Governance changed; mandatory template gates cannot be weakened."] : [],
    generatedAt: now
  };
}

export function projectHarnessPlanBinding(version: ProjectHarnessProfileVersion | undefined, now: string): GoalPlanProjectHarnessBinding | undefined {
  if (!version || version.status !== "ACTIVE") return undefined;
  return {
    schema: "evopilot-goal-plan-project-harness-binding/v1",
    profileId: version.profileId,
    version: version.version,
    status: "ACTIVE",
    templateRef: version.templateRef,
    policyRefs: version.policyRefs,
    sourceDigest: version.sourceDigest,
    compiledDigest: version.compiledDigest,
    capabilities: version.compiledContent.capabilities.map((capability) => capability.id),
    inheritedSections: version.compiledContent.inheritedSections,
    overrideSections: version.compiledContent.overrideSections,
    evidence: [
      `profile=${version.profileId}`,
      `version=${version.version}`,
      `compiledDigest=${version.compiledDigest}`,
      `template=${version.templateRef.templateId}@${version.templateRef.version}`,
      `templateDigest=${version.templateRef.digest}`,
      ...version.policyRefs.map((policy) => `tenantPolicy=${policy.policyId}@v${policy.version}`),
      ...version.policyRefs.map((policy) => `tenantPolicyDigest=${policy.digest}`)
    ],
    boundAt: now
  };
}

export function hydrateGoalPlanProjectHarnessBinding(value: unknown): GoalPlanProjectHarnessBinding | undefined {
  if (!isRecord(value)) return undefined;
  const templateRef = isRecord(value.templateRef) ? value.templateRef : {};
  return {
    schema: "evopilot-goal-plan-project-harness-binding/v1",
    profileId: safeFileName(String(value.profileId ?? "default")),
    version: clampPositiveInteger(value.version, 1),
    status: "ACTIVE",
    templateRef: {
      templateId: safeFileName(String(templateRef.templateId ?? templateRef.id ?? "python-enterprise-harness")),
      version: String(templateRef.version ?? "1.0.0"),
      digest: String(templateRef.digest ?? "")
    },
    policyRefs: hydrateTenantHarnessPolicyRefs(value.policyRefs),
    sourceDigest: String(value.sourceDigest ?? ""),
    compiledDigest: String(value.compiledDigest ?? ""),
    capabilities: normalizeStringList(value.capabilities, []),
    inheritedSections: normalizeStringList(value.inheritedSections, []),
    overrideSections: normalizeStringList(value.overrideSections, []),
    evidence: normalizeStringList(value.evidence, []),
    boundAt: String(value.boundAt ?? new Date().toISOString())
  };
}

export function hydrateProjectHarnessProfileVersion(input: unknown): ProjectHarnessProfileVersion {
  const record = isRecord(input) ? input : {};
  const source = normalizeRawProjectHarnessProfileSource(record.sourceContent);
  const compiled = hydrateCompiledProjectHarnessProfile(record.compiledContent, source);
  const templateRef = hydrateHarnessTemplateRef(record.templateRef ?? compiled.templateRef);
  const now = new Date().toISOString();
  const validation = hydrateProjectHarnessProfileValidation(record.validation, source, templateRef, record.sourceDigest, record.compiledDigest);
  const generatedBy = isRecord(record.generatedBy) ? record.generatedBy : {};
  return {
    schema: "evopilot-project-harness-profile-version/v1",
    tenantId: safeFileName(String(record.tenantId ?? source.tenantId ?? DEFAULT_TENANT_ID)),
    workspaceId: safeFileName(String(record.workspaceId ?? source.workspaceId ?? DEFAULT_WORKSPACE_ID)),
    projectId: safeFileName(String(record.projectId ?? source.projectId)),
    profileId: safeFileName(String(record.profileId ?? source.profileId ?? "default")),
    version: clampPositiveInteger(record.version, 1),
    status: normalizeProjectHarnessProfileStatus(record.status),
    sourceFormat: normalizeProjectHarnessProfileSourceFormat(record.sourceFormat),
    sourceContent: source,
    sourceDigest: String(record.sourceDigest ?? digestObject(source)),
    compiledContent: compiled,
    compiledDigest: String(record.compiledDigest ?? digestObject(compiled)),
    templateRef,
    policyRefs: hydrateTenantHarnessPolicyRefs(record.policyRefs ?? compiled.policyRefs),
    validation,
    diffFromActive: isRecord(record.diffFromActive) ? record.diffFromActive as unknown as ProjectHarnessProfileDiff : undefined,
    generatedBy: {
      mode: generatedBy.mode === "llm" || generatedBy.mode === "deterministic-template" ? generatedBy.mode : "user",
      actor: optionalTrimmedString(generatedBy.actor),
      llmProfileId: optionalTrimmedString(generatedBy.llmProfileId),
      provider: optionalTrimmedString(generatedBy.provider),
      model: optionalTrimmedString(generatedBy.model),
      requestId: optionalTrimmedString(generatedBy.requestId),
      evidence: normalizeStringList(generatedBy.evidence, [])
    },
    approvedAt: optionalTrimmedString(record.approvedAt),
    approvedBy: optionalTrimmedString(record.approvedBy),
    activatedAt: optionalTrimmedString(record.activatedAt),
    activatedBy: optionalTrimmedString(record.activatedBy),
    createdAt: String(record.createdAt ?? now),
    updatedAt: String(record.updatedAt ?? record.createdAt ?? now)
  };
}

export function hydrateCompiledProjectHarnessProfile(value: unknown, source: ProjectHarnessProfileSource): CompiledProjectHarnessProfile {
  const record = isRecord(value) ? value : {};
  return {
    schema: "evopilot-project-harness-compiled-profile/v1",
    tenantId: safeFileName(String(record.tenantId ?? source.tenantId ?? DEFAULT_TENANT_ID)),
    workspaceId: safeFileName(String(record.workspaceId ?? source.workspaceId ?? DEFAULT_WORKSPACE_ID)),
    projectId: safeFileName(String(record.projectId ?? source.projectId)),
    profileId: safeFileName(String(record.profileId ?? source.profileId ?? "default")),
    name: String(record.name ?? source.name ?? "Project Harness Profile"),
    templateRef: hydrateHarnessTemplateRef(record.templateRef),
    policyRefs: hydrateTenantHarnessPolicyRefs(record.policyRefs),
    capabilities: hydrateHarnessCapabilities(record.capabilities),
    runtime: recordObject(record.runtime),
    validation: recordObject(record.validation),
    evidence: recordObject(record.evidence),
    rules: recordObject(record.rules),
    failureHandling: recordObject(record.failureHandling),
    diagnostics: recordObject(record.diagnostics),
    observability: recordObject(record.observability),
    governance: recordObject(record.governance),
    phaseMapping: hydrateHarnessPhaseMapping(record.phaseMapping),
    llmDraftPolicy: recordObject(record.llmDraftPolicy),
    inheritedSections: normalizeStringList(record.inheritedSections, []),
    overrideSections: normalizeStringList(record.overrideSections, []),
    compiledAt: String(record.compiledAt ?? new Date().toISOString())
  };
}

export function hydrateProjectHarnessProfileValidation(value: unknown, source: ProjectHarnessProfileSource, templateRef: HarnessTemplateRef, sourceDigest: unknown, compiledDigest: unknown): ProjectHarnessProfileValidationResult {
  const record = isRecord(value) ? value : {};
  const checks: ProjectHarnessProfileValidationResult["checks"] = Array.isArray(record.checks) ? record.checks.map((check) => {
    const item = isRecord(check) ? check : {};
    const status = String(item.status ?? "FAIL");
    const normalizedStatus: "PASS" | "FAIL" | "WARN" = status === "PASS" || status === "WARN" ? status : "FAIL";
    return {
      id: String(item.id ?? "unknown"),
      status: normalizedStatus,
      required: item.required !== false,
      evidence: normalizeStringList(item.evidence, [])
    };
  }) : [];
  const blockers = normalizeStringList(record.blockers, []);
  return {
    schema: "evopilot-project-harness-profile-validation/v1",
    tenantId: safeFileName(String(record.tenantId ?? source.tenantId ?? DEFAULT_TENANT_ID)),
    workspaceId: safeFileName(String(record.workspaceId ?? source.workspaceId ?? DEFAULT_WORKSPACE_ID)),
    projectId: safeFileName(String(record.projectId ?? source.projectId)),
    profileId: safeFileName(String(record.profileId ?? source.profileId ?? "default")),
    templateRef,
    policyRefs: hydrateTenantHarnessPolicyRefs(record.policyRefs),
    status: record.status === "VALIDATED" && blockers.length === 0 ? "VALIDATED" : "FAILED",
    checks,
    blockers,
    warnings: normalizeStringList(record.warnings, []),
    sourceDigest: optionalTrimmedString(record.sourceDigest) ?? optionalTrimmedString(sourceDigest),
    compiledDigest: optionalTrimmedString(record.compiledDigest) ?? optionalTrimmedString(compiledDigest),
    evaluatedAt: String(record.evaluatedAt ?? new Date().toISOString())
  };
}

export function hydrateTenantHarnessPolicyRefs(value: unknown): TenantHarnessPolicyRef[] {
  const raw = Array.isArray(value) ? value : [];
  return raw.map((item) => {
    const record = isRecord(item) ? item : {};
    return {
      policyId: safeFileName(String(record.policyId ?? record.id ?? "default")),
      version: clampPositiveInteger(record.version, 1),
      digest: String(record.digest ?? ""),
      scope: "tenant-workspace" as const
    };
  });
}

export function projectHarnessTemplateSelectionMode(profile: ProjectHarnessProfileVersion): string | undefined {
  const metadata = recordObject(profile.sourceContent.metadata);
  const metadataValue = optionalTrimmedString(metadata.templateSelectionMode);
  if (metadataValue) return metadataValue;
  const evidenceValue = profile.generatedBy.evidence.find((item) => item.startsWith("templateSelection="));
  return evidenceValue?.split("=").slice(1).join("=");
}

export function projectHarnessTemplateSelectionReasons(profile: ProjectHarnessProfileVersion): string[] {
  const metadata = recordObject(profile.sourceContent.metadata);
  const metadataReasons = normalizeStringList(metadata.templateSelectionReasons, []);
  if (metadataReasons.length > 0) return metadataReasons;
  return profile.generatedBy.evidence
    .filter((item) => item.startsWith("templateSelectionReason="))
    .map((item) => item.split("=").slice(1).join("="));
}

export function projectHarnessLogMetadata(project: StoredProject, profile: ProjectHarnessProfileVersion, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projectId: project.id,
    tenantId: project.tenantId,
    workspaceId: project.workspaceId,
    profileId: profile.profileId,
    profileVersion: profile.version,
    profileStatus: profile.status,
    sourceDigest: profile.sourceDigest,
    compiledDigest: profile.compiledDigest,
    templateId: profile.templateRef.templateId,
    templateVersion: profile.templateRef.version,
    templateDigest: profile.templateRef.digest,
    policyRefs: profile.policyRefs.map((policy) => `${policy.policyId}@v${policy.version}`),
    policyDigests: profile.policyRefs.map((policy) => policy.digest),
    validationStatus: profile.validation.status,
    validationBlockers: profile.validation.blockers,
    validationWarnings: profile.validation.warnings,
    changedSections: profile.diffFromActive?.changedSections ?? [],
    previousActiveVersion: profile.diffFromActive?.baseVersion ?? "none",
    templateSelectionMode: projectHarnessTemplateSelectionMode(profile),
    templateSelectionReasons: projectHarnessTemplateSelectionReasons(profile),
    nextAction: profile.status === "ACTIVE" ? "target-plan" : "review-validate-activate",
    ...extra
  };
}

export function tenantHarnessPolicyLogMetadata(policy: TenantHarnessPolicyVersion, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    policyId: policy.policyId,
    policyVersion: policy.version,
    policyStatus: policy.status,
    sourceDigest: policy.sourceDigest,
    compiledDigest: policy.compiledDigest,
    validationStatus: policy.validation.status,
    validationBlockers: policy.validation.blockers,
    validationWarnings: policy.validation.warnings,
    appliesTo: policy.compiledContent.appliesTo,
    nextAction: policy.status === "ACTIVE" ? "generate-or-upgrade-project-harness-profile" : "review-activate-policy",
    ...extra
  };
}

export function normalizeProjectHarnessProfileStatus(value: unknown): ProjectHarnessProfileStatus {
  const status = String(value ?? "DRAFT");
  if (status === "VALIDATED" || status === "ACTIVE" || status === "SUPERSEDED" || status === "REJECTED") return status;
  return "DRAFT";
}

export function normalizeTenantHarnessPolicyStatus(value: unknown): TenantHarnessPolicyStatus {
  const status = String(value ?? "DRAFT");
  if (status === "VALIDATED" || status === "ACTIVE" || status === "SUPERSEDED" || status === "REJECTED") return status;
  return "DRAFT";
}

export function versionNumberFromFile(file: string): number {
  const match = file.match(/^v(\d+)\.json$/);
  return match ? Number(match[1]) : 0;
}

export function digestObject(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function emptyGoalPlan(): GoalPlan {
  return {
    schema: "evopilot-goal-plan/v1",
    status: "MISSING",
    decompositionStrategy: "none",
    summary: "Goal plan has not been generated.",
    targetCount: 0,
    requiredTargetCount: 0,
    phaseTargets: [],
    targets: []
  };
}

export function hydrateGoalPlan(value: unknown, goalId: string, projectId: string, releaseTargetId: string): GoalPlan {
  if (!isRecord(value)) return emptyGoalPlan();
  const targets = Array.isArray(value.targets)
    ? value.targets.map((target) => hydrateGoalTarget(target, goalId, projectId, releaseTargetId))
    : [];
  const phaseTargets = Array.isArray(value.phaseTargets)
    ? value.phaseTargets.map((phase) => hydratePhaseTarget(phase, goalId, targets))
    : phaseTargetsFromGoalTargets(goalId, targets, new Date().toISOString());
  return {
    schema: "evopilot-goal-plan/v1",
    status: normalizeGoalPlanStatus(value.status),
    decompositionStrategy: normalizeGoalPlanStrategy(value.decompositionStrategy),
    terminalMaturity: value.terminalMaturity === "ga" || targets.some((target) => target.phase) ? "ga" : undefined,
    maturityStandardSetId: optionalTrimmedString(value.maturityStandardSetId),
    standardVersion: optionalTrimmedString(value.standardVersion),
    planner: hydrateGoalPlanPlannerTrace(value.planner),
    projectHarness: hydrateGoalPlanProjectHarnessBinding(value.projectHarness),
    summary: String(value.summary ?? (targets.length > 0 ? `Goal plan has ${targets.length} targets.` : "Goal plan has not been generated.")),
    targetCount: targets.length,
    requiredTargetCount: targets.filter((target) => target.required).length,
    phaseTargets,
    targets,
    editablePlan: hydrateEditableGoalPlan(value.editablePlan),
    generatedAt: optionalTrimmedString(value.generatedAt),
    approvedAt: optionalTrimmedString(value.approvedAt),
    approvedBy: optionalTrimmedString(value.approvedBy),
    confirmation: hydrateGoalPlanApprovalConfirmation(value.confirmation)
  };
}

export function hydrateGoalTarget(value: unknown, goalId: string, projectId: string, releaseTargetId: string): GoalTarget {
  const record = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const id = safeFileName(String(record.id ?? `${goalId}-target-${Date.now()}`));
  return {
    schema: "evopilot-goal-target/v1",
    id,
    goalId,
    projectId: safeFileName(String(record.projectId ?? projectId)),
    releaseTargetId: safeFileName(String(record.releaseTargetId ?? releaseTargetId)),
    phase: normalizeOptionalMaturityPhase(record.phase),
    standardId: optionalTrimmedString(record.standardId),
    title: String(record.title ?? id),
    description: String(record.description ?? ""),
    layer: normalizeGoalTargetLayer(record.layer),
    required: record.required !== false,
    dependencyIds: Array.isArray(record.dependencyIds) ? record.dependencyIds.map((item) => safeFileName(String(item))) : [],
    acceptanceCriteria: Array.isArray(record.acceptanceCriteria) ? record.acceptanceCriteria.map(String) : [],
    requiredEvidence: Array.isArray(record.requiredEvidence) ? record.requiredEvidence.map(String) : undefined,
    reviewCapabilities: Array.isArray(record.reviewCapabilities) ? record.reviewCapabilities.map(normalizeReviewCapability).filter((item): item is ReviewCapability => Boolean(item)) : undefined,
    status: normalizeGoalTargetStatus(record.status),
    nextAction: normalizeGoalNextAction(record.nextAction),
    loopId: optionalTrimmedString(record.loopId),
    targetVersion: optionalTrimmedString(record.targetVersion),
    evidence: normalizeStoredGoalTargetEvidence(record.evidence),
    blocker: optionalTrimmedString(record.blocker),
    createdAt: String(record.createdAt ?? now),
    updatedAt: String(record.updatedAt ?? record.createdAt ?? now)
  };
}

export function hydratePhaseTarget(value: unknown, goalId: string, targets: GoalTarget[]): PhaseTarget {
  const record = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const phase = normalizeMaturityPhase(record.phase, "alpha");
  const standard = maturityStandardTemplate(phase);
  const goalTargetIds = Array.isArray(record.goalTargetIds)
    ? record.goalTargetIds.map((item) => safeFileName(String(item))).filter(Boolean)
    : targets.filter((target) => target.phase === phase).map((target) => target.id);
  const decision = isRecord(record.decision) ? record.decision : {};
  return {
    schema: "evopilot-phase-target/v1",
    id: safeFileName(String(record.id ?? `${goalId}-${phase}`)),
    goalId,
    phase,
    title: String(record.title ?? standard.name),
    status: normalizePhaseTargetStatus(record.status),
    dependencyPhase: normalizeOptionalMaturityPhase(record.dependencyPhase),
    goalTargetIds,
    acceptanceCriteria: uniqueStrings(Array.isArray(record.acceptanceCriteria) ? record.acceptanceCriteria.map(String) : standard.acceptanceCriteria),
    requiredEvidence: uniqueStrings(Array.isArray(record.requiredEvidence) ? record.requiredEvidence.map(String) : standard.requiredEvidence),
    reviewCapabilities: normalizeReviewCapabilities(Array.isArray(record.reviewCapabilities) ? record.reviewCapabilities : standard.reviewCapabilities),
    packageOutputs: uniqueStrings(Array.isArray(record.packageOutputs) ? record.packageOutputs.map(String) : standard.packageOutputs),
    decision: {
      status: normalizePhaseDecisionStatus(decision.status),
      rationale: String(decision.rationale ?? "Phase decision is pending until all required GoalTargets pass."),
      evidence: Array.isArray(decision.evidence) ? uniqueStrings(decision.evidence.map(String)) : []
    },
    createdAt: String(record.createdAt ?? now),
    updatedAt: String(record.updatedAt ?? record.createdAt ?? now)
  };
}

export function hydrateEditableGoalPlan(value: unknown): GoalPlan["editablePlan"] {
  if (!isRecord(value)) return undefined;
  return {
    status: value.status === "APPROVED" ? "APPROVED" : "PENDING_USER_CONFIRMATION",
    allowed: Array.isArray(value.allowed) ? value.allowed.map(String) : editablePlanPolicy().allowed,
    denied: Array.isArray(value.denied) ? value.denied.map(String) : editablePlanPolicy().denied,
    nextAction: normalizeGoalNextAction(value.nextAction)
  };
}

export function hydrateGoalPlanPlannerTrace(value: unknown): GoalPlanPlannerTrace | undefined {
  if (!isRecord(value)) return undefined;
  const mode = String(value.mode ?? "debug-deterministic-no-provider");
  const generatedBy = String(value.generatedBy ?? "deterministic-debug");
  return {
    schema: "evopilot-goal-plan-planner-trace/v1",
    mode: mode === "llm-constrained" ? "llm-constrained" : "debug-deterministic-no-provider",
    generatedBy: generatedBy === "llm" ? "llm" : "deterministic-debug",
    provider: optionalTrimmedString(value.provider),
    model: optionalTrimmedString(value.model),
    llmProfileId: optionalTrimmedString(value.llmProfileId),
    requestId: optionalTrimmedString(value.requestId),
    inputTokens: usageNumber(value.inputTokens),
    outputTokens: usageNumber(value.outputTokens),
    totalTokens: usageNumber(value.totalTokens),
    creditsConsumed: usageNumber(value.creditsConsumed),
    creditUnit: "token",
    guardrails: Array.isArray(value.guardrails) ? uniqueStrings(value.guardrails.map(String)) : goalPlanGuardrails(),
    evidence: Array.isArray(value.evidence) ? uniqueStrings(value.evidence.map(String)) : [],
    generatedAt: String(value.generatedAt ?? new Date().toISOString())
  };
}

export function normalizeStoredGoalTargetEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const derivedPrefixes = [
    "goal=",
    "target=",
    "dependencies=",
    "criteria=",
    "loopStatus=",
    "iteration=",
    "sourceClosure=",
    "sandboxEnforcement=",
    "executorSteps=",
    "externalBlocker="
  ];
  return value
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0)
    .filter((item) => !derivedPrefixes.some((prefix) => item.startsWith(prefix)))
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

export const MATURITY_PHASES: MaturityPhase[] = ["alpha", "beta", "rc", "ga"];
export const DEFAULT_MATURITY_STANDARD_SET_ID = "evopilot-default/v1";
export const DEFAULT_MATURITY_STANDARD_VERSION = "1.0.0";
export let maturityStandardTemplatesCache: MaturityStandardTemplate[] | undefined;

export function maturityStandardTemplates(): MaturityStandardTemplate[] {
  if (!maturityStandardTemplatesCache) {
    maturityStandardTemplatesCache = loadMaturityStandardTemplatesFromDisk() ?? builtInMaturityStandardTemplates();
  }
  return maturityStandardTemplatesCache;
}

export function loadMaturityStandardTemplatesFromDisk(): MaturityStandardTemplate[] | undefined {
  const standardsDir = path.join(process.cwd(), "standards", "maturity", ...DEFAULT_MATURITY_STANDARD_SET_ID.split("/"));
  if (!fs.existsSync(standardsDir)) return undefined;
  return MATURITY_PHASES.map((phase) => {
    const file = path.join(standardsDir, `${phase}.json`);
    if (!fs.existsSync(file)) throw new Error(`Maturity standard file missing: ${file}`);
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return normalizeMaturityStandardTemplate(parsed, phase);
  });
}

export function normalizeMaturityStandardTemplate(input: unknown, expectedPhase: MaturityPhase): MaturityStandardTemplate {
  if (!isRecord(input)) throw new Error(`Maturity standard ${expectedPhase} must be a JSON object.`);
  const fallback = builtInMaturityStandardTemplates().find((template) => template.phase === expectedPhase)!;
  const phase = normalizeMaturityPhase(input.phase, expectedPhase);
  if (phase !== expectedPhase) throw new Error(`Maturity standard ${expectedPhase} has mismatched phase=${phase}.`);
  const overridePolicy = isRecord(input.overridePolicy) ? input.overridePolicy : {};
  const targetSchema = isRecord(input.targetSchema) ? input.targetSchema : {};
  const packageContract = isRecord(input.packageContract) ? input.packageContract : {};
  const weakerPlanVerdict = String(overridePolicy.weakerPlanVerdict ?? fallback.overridePolicy.weakerPlanVerdict);
  return {
    schema: "evopilot-maturity-standard-template/v1",
    id: String(input.id ?? fallback.id),
    standardSetId: String(input.standardSetId ?? fallback.standardSetId),
    version: String(input.version ?? fallback.version),
    phase,
    name: String(input.name ?? fallback.name),
    purpose: String(input.purpose ?? fallback.purpose),
    baselineRules: stringArrayOrDefault(input.baselineRules, fallback.baselineRules),
    acceptanceCriteria: stringArrayOrDefault(input.acceptanceCriteria, fallback.acceptanceCriteria),
    requiredEvidence: stringArrayOrDefault(input.requiredEvidence, fallback.requiredEvidence),
    reviewCapabilities: normalizeReviewCapabilities(stringArrayOrDefault(input.reviewCapabilities, fallback.reviewCapabilities)),
    packageOutputs: stringArrayOrDefault(input.packageOutputs, fallback.packageOutputs),
    goNoGoRules: stringArrayOrDefault(input.goNoGoRules, fallback.goNoGoRules),
    plannerInstructions: stringArrayOrDefault(input.plannerInstructions, fallback.plannerInstructions),
    targetSchema: {
      requiredFields: stringArrayOrDefault(targetSchema.requiredFields, fallback.targetSchema.requiredFields),
      minRequiredTargets: clampPositiveInteger(targetSchema.minRequiredTargets, fallback.targetSchema.minRequiredTargets),
      mustProduceTargetEvidencePackage: targetSchema.mustProduceTargetEvidencePackage === undefined ? fallback.targetSchema.mustProduceTargetEvidencePackage : targetSchema.mustProduceTargetEvidencePackage !== false
    },
    packageContract: {
      targetEvidencePackageRequired: packageContract.targetEvidencePackageRequired === undefined ? fallback.packageContract.targetEvidencePackageRequired : packageContract.targetEvidencePackageRequired !== false,
      phasePackageRequired: packageContract.phasePackageRequired === undefined ? fallback.packageContract.phasePackageRequired : packageContract.phasePackageRequired !== false,
      nextTargetRequiresPreviousPackageGo: packageContract.nextTargetRequiresPreviousPackageGo === undefined ? fallback.packageContract.nextTargetRequiresPreviousPackageGo : packageContract.nextTargetRequiresPreviousPackageGo !== false
    },
    overridePolicy: {
      canAddGoalTargets: overridePolicy.canAddGoalTargets !== false,
      canStrengthenCriteria: overridePolicy.canStrengthenCriteria !== false,
      canRemoveBaselineCriteria: overridePolicy.canRemoveBaselineCriteria === true,
      weakerPlanVerdict: weakerPlanVerdict === "NO-GO" ? "NO-GO" : "CONDITIONAL-GO"
    }
  };
}

export function stringArrayOrDefault(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.length > 0 ? value.map(String) : fallback;
}

export function builtInMaturityStandardTemplates(): MaturityStandardTemplate[] {
  return [
    {
      schema: "evopilot-maturity-standard-template/v1",
      id: `${DEFAULT_MATURITY_STANDARD_SET_ID}/alpha`,
      standardSetId: DEFAULT_MATURITY_STANDARD_SET_ID,
      version: DEFAULT_MATURITY_STANDARD_VERSION,
      phase: "alpha",
      name: "Alpha Readiness",
      purpose: "Prove the project can be understood, onboarded, built or explicitly blocked, and minimally smoke-tested without making a release claim.",
      baselineRules: [
        "Alpha is not a release claim.",
        "The repository, branch, dependency path, and ownership boundary must be explicit.",
        "Unknown build or smoke blockers must be recorded instead of hidden."
      ],
      acceptanceCriteria: [
        "Project source is registered, readable, and scoped to the tenant/workspace.",
        "Build, install, or runtime bootstrap path is known, reproducible, or explicitly blocked with owner and next action.",
        "A minimal smoke path passes or the blocker is recorded with concrete repair guidance.",
        "Architecture map and risk register exist for the requested business objective."
      ],
      requiredEvidence: [
        "project-registration",
        "source-readiness-preflight",
        "build-or-bootstrap-evidence",
        "smoke-or-blocker-evidence",
        "architecture-map",
        "risk-register"
      ],
      reviewCapabilities: ["architecture"],
      packageOutputs: [
        "alpha-readiness-report",
        "architecture-map",
        "risk-register",
        "known-blockers"
      ],
      goNoGoRules: [
        "GO only if every required Alpha GoalTarget is DONE.",
        "NO-GO if source access, bootstrap, or smoke evidence is unavailable and no explicit blocker package exists."
      ],
      plannerInstructions: [
        "Generate project-specific Alpha GoalTargets for source ownership, bootstrap, minimal smoke, architecture map, risk register, and Alpha package.",
        "Do not claim release readiness in Alpha.",
        "Every Alpha GoalTarget must produce a TargetEvidencePackage before it can be marked DONE."
      ],
      targetSchema: maturityTargetSchema(3),
      packageContract: maturityPackageContract(),
      overridePolicy: maturityOverridePolicy()
    },
    {
      schema: "evopilot-maturity-standard-template/v1",
      id: `${DEFAULT_MATURITY_STANDARD_SET_ID}/beta`,
      standardSetId: DEFAULT_MATURITY_STANDARD_SET_ID,
      version: DEFAULT_MATURITY_STANDARD_VERSION,
      phase: "beta",
      name: "Beta E2E Readiness",
      purpose: "Prove the requested business capability works through core end-to-end paths and repository-native CI with enough evidence for limited user trial.",
      baselineRules: [
        "Beta depends on a passed Alpha package.",
        "Core E2E evidence must be real-boundary evidence.",
        "Repository-native GitHub Actions or GitLab CI must be observable when writeback is claimed."
      ],
      acceptanceCriteria: [
        "Alpha phase package is PASS and locked as dependency evidence.",
        "Core end-to-end scenarios for the business objective pass.",
        "GitHub Actions or GitLab CI is configured, observable, and tied to the working repository or fork claim boundary.",
        "Critical tests and basic user/operator documentation exist.",
        "No high open risk blocks limited user trial."
      ],
      requiredEvidence: [
        "alpha-phase-package",
        "core-e2e-run",
        "native-ci-status",
        "critical-test-evidence",
        "basic-docs",
        "risk-closure"
      ],
      reviewCapabilities: ["testing", "documentation"],
      packageOutputs: [
        "beta-e2e-report",
        "ci-evidence",
        "test-summary",
        "docs-readiness",
        "risk-closure-matrix"
      ],
      goNoGoRules: [
        "GO only if Alpha is PASSED and every required Beta GoalTarget is DONE.",
        "NO-GO if core E2E, native CI, or high-risk closure is missing."
      ],
      plannerInstructions: [
        "Generate project-specific Beta GoalTargets for core E2E, repository-native CI, critical tests, basic docs, risk closure, and Beta package.",
        "Beta targets must depend on passed Alpha package evidence.",
        "Every Beta GoalTarget must produce a TargetEvidencePackage before it can be marked DONE."
      ],
      targetSchema: maturityTargetSchema(3),
      packageContract: maturityPackageContract(),
      overridePolicy: maturityOverridePolicy()
    },
    {
      schema: "evopilot-maturity-standard-template/v1",
      id: `${DEFAULT_MATURITY_STANDARD_SET_ID}/rc`,
      standardSetId: DEFAULT_MATURITY_STANDARD_SET_ID,
      version: DEFAULT_MATURITY_STANDARD_VERSION,
      phase: "rc",
      name: "Release Candidate Readiness",
      purpose: "Freeze scope and prove source closure, review, deployment health, rollback or repair, security, compatibility, and architecture readiness before GA.",
      baselineRules: [
        "RC depends on a passed Beta package.",
        "Scope must be frozen before release-candidate validation.",
        "Architecture review is mandatory."
      ],
      acceptanceCriteria: [
        "Beta phase package is PASS and locked as dependency evidence.",
        "Scope is frozen and source closure has branch, commit, PR/MR or review artifact.",
        "Native CI/CD passes repeatedly within the declared claim boundary.",
        "Deployment health and rollback or repair evidence exist.",
        "Security, dependency, compatibility, and architecture reviews pass.",
        "No P0/P1 blocker remains open."
      ],
      requiredEvidence: [
        "beta-phase-package",
        "scope-freeze-record",
        "source-closure-record",
        "pr-or-mr-review",
        "repeat-ci-cd-pass",
        "deploy-health",
        "rollback-or-repair",
        "security-dependency-compatibility-review",
        "architecture-review"
      ],
      reviewCapabilities: ["architecture", "security", "testing", "operations"],
      packageOutputs: [
        "rc-release-candidate-report",
        "source-closure-package",
        "deployment-health-package",
        "rollback-or-repair-package",
        "architecture-review",
        "security-review"
      ],
      goNoGoRules: [
        "GO only if Beta is PASSED and every required RC GoalTarget is DONE.",
        "NO-GO if scope is still changing, review evidence is missing, or any P0/P1 blocker remains open."
      ],
      plannerInstructions: [
        "Generate project-specific RC GoalTargets for scope freeze, source closure, repeated native CI/CD, deployment health, rollback or repair, security, compatibility, architecture review, and RC package.",
        "RC targets must depend on passed Beta package evidence.",
        "Every RC GoalTarget must produce a TargetEvidencePackage before it can be marked DONE."
      ],
      targetSchema: maturityTargetSchema(3),
      packageContract: maturityPackageContract(),
      overridePolicy: maturityOverridePolicy()
    },
    {
      schema: "evopilot-maturity-standard-template/v1",
      id: `${DEFAULT_MATURITY_STANDARD_SET_ID}/ga`,
      standardSetId: DEFAULT_MATURITY_STANDARD_SET_ID,
      version: DEFAULT_MATURITY_STANDARD_VERSION,
      phase: "ga",
      name: "GA Stable Release",
      purpose: "Prove the business objective is enterprise-ready with stability, observability, runbook, release notes, user docs, security governance, final signoff, and GO release decision.",
      baselineRules: [
        "GA depends on a passed RC package.",
        "GA must not claim beyond the GitHub/GitLab source and DevOps claim boundary.",
        "Architecture signoff is mandatory."
      ],
      acceptanceCriteria: [
        "RC phase package is PASS and locked as dependency evidence.",
        "Stability or soak evidence satisfies the product SLO and release target expectations.",
        "Monitoring, logging, alerting, troubleshooting, and runbook evidence are complete.",
        "Release notes, user documentation, API/CLI/Dashboard contracts, and migration notes are complete.",
        "Security governance and dependency review pass.",
        "Architecture signoff passes.",
        "Final ReleaseDecision is GO."
      ],
      requiredEvidence: [
        "rc-phase-package",
        "stability-or-soak-evidence",
        "observability-evidence",
        "runbook",
        "release-notes",
        "user-docs",
        "api-cli-dashboard-contract",
        "security-governance",
        "architecture-signoff",
        "final-release-decision"
      ],
      reviewCapabilities: ["architecture", "security", "documentation", "operations", "release"],
      packageOutputs: [
        "ga-release-package",
        "soak-summary",
        "observability-runbook",
        "release-notes",
        "security-governance-report",
        "architecture-signoff",
        "final-release-decision"
      ],
      goNoGoRules: [
        "GO only if RC is PASSED, every required GA GoalTarget is DONE, and final ReleaseDecision is GO.",
        "NO-GO if stability, observability, security governance, architecture signoff, or final release decision is missing."
      ],
      plannerInstructions: [
        "Generate project-specific GA GoalTargets for stability or soak, observability, runbook, release notes, user docs, security governance, architecture signoff, final GA package, and ReleaseDecision=GO.",
        "GA targets must depend on passed RC package evidence.",
        "Every GA GoalTarget must produce a TargetEvidencePackage before it can be marked DONE."
      ],
      targetSchema: maturityTargetSchema(3),
      packageContract: maturityPackageContract(),
      overridePolicy: maturityOverridePolicy()
    }
  ];
}

export function maturityTargetSchema(minRequiredTargets = 1): MaturityStandardTemplate["targetSchema"] {
  return {
    requiredFields: [
      "id",
      "phase",
      "title",
      "description",
      "layer",
      "required",
      "dependencyIds",
      "acceptanceCriteria",
      "requiredEvidence",
      "reviewCapabilities",
      "packageOutputs"
    ],
    minRequiredTargets,
    mustProduceTargetEvidencePackage: true
  };
}

export function maturityPackageContract(): MaturityStandardTemplate["packageContract"] {
  return {
    targetEvidencePackageRequired: true,
    phasePackageRequired: true,
    nextTargetRequiresPreviousPackageGo: true
  };
}

export function maturityOverridePolicy(): MaturityStandardTemplate["overridePolicy"] {
  return {
    canAddGoalTargets: true,
    canStrengthenCriteria: true,
    canRemoveBaselineCriteria: false,
    weakerPlanVerdict: "CONDITIONAL-GO"
  };
}

export function maturityStandardTemplate(phase: MaturityPhase): MaturityStandardTemplate {
  return maturityStandardTemplates().find((template) => template.phase === phase) ?? maturityStandardTemplates()[0];
}

export function editablePlanPolicy(): NonNullable<GoalPlan["editablePlan"]> {
  return {
    status: "PENDING_USER_CONFIRMATION",
    allowed: [
      "Add project-specific GoalTargets inside Alpha/Beta/RC/GA.",
      "Strengthen acceptance criteria and required evidence.",
      "Reorder GoalTargets within a phase when dependencies remain valid.",
      "Add architecture, security, documentation, operations, or release review requirements."
    ],
    denied: [
      "Delete Alpha, Beta, RC, or GA phases.",
      "Skip a phase or run GA before Alpha/Beta/RC pass.",
      "Remove built-in baseline criteria or required evidence and still claim standard GA.",
      "Bypass source, DevOps, approval, policy, or release-decision gates."
    ],
    nextAction: "approve-plan"
  };
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

export function phaseTargetsFromGoalTargets(goalId: string, targets: GoalTarget[], now: string): PhaseTarget[] {
  return MATURITY_PHASES.map((phase, index) => {
    const standard = maturityStandardTemplate(phase);
    const phaseTargets = targets.filter((target) => target.phase === phase);
    return {
      schema: "evopilot-phase-target/v1",
      id: `${goalId}-${phase}`,
      goalId,
      phase,
      title: standard.name,
      status: "PENDING",
      dependencyPhase: MATURITY_PHASES[index - 1],
      goalTargetIds: phaseTargets.map((target) => target.id),
      acceptanceCriteria: standard.acceptanceCriteria,
      requiredEvidence: standard.requiredEvidence,
      reviewCapabilities: standard.reviewCapabilities,
      packageOutputs: standard.packageOutputs,
      decision: {
        status: "PENDING",
        rationale: "Phase decision is pending until all required GoalTargets pass.",
        evidence: []
      },
      createdAt: now,
      updatedAt: now
    };
  });
}

export function derivePhaseTargets(goal: GlobalGoal, targets: GoalTarget[]): PhaseTarget[] {
  const now = new Date().toISOString();
  const base = goal.plan.phaseTargets.length > 0
    ? goal.plan.phaseTargets
    : phaseTargetsFromGoalTargets(goal.id, targets, now);
  return MATURITY_PHASES.map((phase, index) => {
    const existing = base.find((item) => item.phase === phase);
    const standard = maturityStandardTemplate(phase);
    const phaseTargets = targets.filter((target) => target.phase === phase);
    const required = phaseTargets.filter((target) => target.required);
    const hasFailed = phaseTargets.some((target) => target.status === "FAILED");
    const hasBlocked = phaseTargets.some((target) => target.status === "BLOCKED" || target.status === "WAITING_HUMAN");
    const hasRunning = phaseTargets.some((target) => target.status === "RUNNING" || target.status === "READY");
    const passed = required.length > 0 && required.every((target) => target.status === "DONE");
    const status: PhaseTargetStatus = hasFailed ? "FAILED"
      : hasBlocked ? "BLOCKED"
        : passed ? "PASSED"
          : hasRunning ? "RUNNING"
            : "PENDING";
    const decision: PhaseTarget["decision"] = {
      status: status === "PASSED" ? "GO" : status === "FAILED" || status === "BLOCKED" ? "NO-GO" : "PENDING",
      rationale: status === "PASSED"
        ? `${phase.toUpperCase()} passed because every required GoalTarget is DONE.`
        : status === "FAILED" || status === "BLOCKED"
          ? `${phase.toUpperCase()} cannot pass until blockers are repaired.`
          : `${phase.toUpperCase()} is pending execution.`,
      evidence: [
        `phase=${phase}`,
        `goalTargets=${phaseTargets.length}`,
        `requiredDone=${required.filter((target) => target.status === "DONE").length}/${required.length}`,
        ...phaseTargets.flatMap((target) => target.loopId ? [`loop=${target.loopId}`] : [])
      ]
    };
    return {
      schema: "evopilot-phase-target/v1",
      id: existing?.id ?? `${goal.id}-${phase}`,
      goalId: goal.id,
      phase,
      title: existing?.title ?? standard.name,
      status,
      dependencyPhase: existing?.dependencyPhase ?? MATURITY_PHASES[index - 1],
      goalTargetIds: phaseTargets.map((target) => target.id),
      acceptanceCriteria: uniqueStrings([...(existing?.acceptanceCriteria ?? []), ...standard.acceptanceCriteria]),
      requiredEvidence: uniqueStrings([...(existing?.requiredEvidence ?? []), ...standard.requiredEvidence]),
      reviewCapabilities: normalizeReviewCapabilities([...(existing?.reviewCapabilities ?? []), ...standard.reviewCapabilities]),
      packageOutputs: uniqueStrings([...(existing?.packageOutputs ?? []), ...standard.packageOutputs]),
      decision,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
  });
}

export function buildPhasePackages(goal: GlobalGoal, loopReader?: (id: string) => LoopRun | undefined): PhasePackage[] {
  const matrix = buildGoalEvidenceMatrix(goal);
  return goal.plan.phaseTargets.map((phaseTarget) => {
    const rows = matrix.filter((row) => row.phase === phaseTarget.phase);
    const required = rows.filter((row) => row.required);
    const targetPackages = goal.plan.targets
      .filter((target) => target.phase === phaseTarget.phase)
      .map((target) => buildTargetEvidencePackage(goal, target, target.loopId && loopReader ? loopReader(target.loopId) : undefined))
      .filter((item): item is TargetEvidencePackage => Boolean(item));
    return {
      schema: "evopilot-phase-package/v1",
      goalId: goal.id,
      projectId: goal.projectId,
      releaseTargetId: goal.releaseTargetId,
      phase: phaseTarget.phase,
      status: phaseTarget.status,
      generatedAt: new Date().toISOString(),
      targetSummary: {
        total: rows.length,
        required: required.length,
        done: required.filter((row) => row.status === "DONE").length,
        blocked: rows.filter((row) => row.status === "BLOCKED" || row.status === "WAITING_HUMAN").length,
        failed: rows.filter((row) => row.status === "FAILED").length
      },
      acceptanceCriteria: phaseTarget.acceptanceCriteria,
      requiredEvidence: phaseTarget.requiredEvidence,
      reviewCapabilities: phaseTarget.reviewCapabilities,
      evidenceMatrix: rows,
      targetPackages,
      blockers: uniqueStrings([
        ...rows.flatMap((row) => row.blocker ? [`${row.targetId}: ${row.blocker}`] : []),
        ...targetPackages.flatMap((item) => item.blockers.map((blocker) => `${item.targetId}: ${blocker}`)),
        ...(phaseTarget.packageOutputs.length > 0 && targetPackages.length === 0 ? [`${phaseTarget.phase}:TARGET_EVIDENCE_PACKAGE_REQUIRED`] : [])
      ]),
      decision: phaseTarget.decision,
      packageOutputs: phaseTarget.packageOutputs
    };
  });
}

export function buildTargetEvidencePackages(goal: GlobalGoal, loopReader?: (id: string) => LoopRun | undefined): TargetEvidencePackage[] {
  return goal.plan.targets
    .map((target) => buildTargetEvidencePackage(goal, target, target.loopId && loopReader ? loopReader(target.loopId) : undefined))
    .filter((item): item is TargetEvidencePackage => Boolean(item));
}

export function buildTargetEvidencePackage(goal: GlobalGoal, target: GoalTarget, loop?: LoopRun): TargetEvidencePackage | undefined {
  const generatedAt = new Date().toISOString();
  const standard = target.phase ? maturityStandardTemplate(target.phase) : undefined;
  const requiredEvidence = uniqueStrings([...(target.requiredEvidence ?? []), ...(standard?.requiredEvidence ?? [])]);
  const reviewCapabilities = normalizeReviewCapabilities([...(target.reviewCapabilities ?? []), ...(standard?.reviewCapabilities ?? [])]);
  const packageOutputs = uniqueStrings([
    ...(standard?.packageOutputs ?? []),
    `${target.phase ?? "target"}-target-evidence-package`
  ]);
  const loopUsage = loop ? buildLoopLlmUsageSummary(loop) : emptyLlmUsageSummary(`target:${target.id}`, generatedAt);
  const blockers: string[] = [];
  if (!loop) {
    if (target.status === "BLOCKED" || target.status === "FAILED") blockers.push("LOOP_RUN_REQUIRED");
  } else {
    if (loop.status !== "SUCCEEDED") blockers.push(`loopStatus=${loop.status}`);
    if (!requiredSourceClosureGatesPassed(loop.sourceClosure.requiredGates, loop.sourceClosure.gateEvidence)) {
      blockers.push(`sourceClosure=${loop.sourceClosure.closureState}`);
      blockers.push(...loop.sourceClosure.requiredGates
        .filter((gate) => loop.sourceClosure.gateEvidence[gate]?.status !== "PASSED" && loop.sourceClosure.gateEvidence[gate]?.status !== "SKIPPED")
        .map((gate) => `sourceClosure.gate.${gate}=${loop.sourceClosure.gateEvidence[gate]?.status ?? "PENDING"}`));
    }
    const externalBlocker = inferLoopExternalBlocker({ id: target.id }, loop);
    if (externalBlocker) blockers.push(...externalBlocker.blockers);
  }
  const go = blockers.length === 0 && (loop ? loop.status === "SUCCEEDED" : target.status === "DONE");
  const status: PhaseDecisionStatus = go
    ? "GO"
    : !loop && target.status !== "DONE" && target.status !== "BLOCKED" && target.status !== "FAILED"
      ? "PENDING"
      : blockers.length > 0 ? "NO-GO" : "PENDING";
  const evidence = uniqueStrings([
    `goal=${goal.id}`,
    `target=${target.id}`,
    `phase=${target.phase ?? "none"}`,
    `standard=${target.standardId ?? standard?.id ?? "none"}`,
    `criteria=${target.acceptanceCriteria.length}`,
    `requiredEvidence=${requiredEvidence.length}`,
    `reviewCapabilities=${reviewCapabilities.join(",") || "none"}`,
    loop ? `loop=${loop.id}` : "loop=missing",
    loop ? `loopStatus=${loop.status}` : `targetStatus=${target.status}`,
    loop ? `sourceClosure=${loop.sourceClosure.closureState}` : "sourceClosure=missing",
    loop ? `llmTokens=${loopUsage.totalTokens}` : "llmTokens=0",
    ...target.evidence
  ]);
  return {
    schema: "evopilot-target-evidence-package/v1",
    goalId: goal.id,
    projectId: goal.projectId,
    releaseTargetId: goal.releaseTargetId,
    targetId: target.id,
    phase: target.phase,
    status,
    generatedAt,
    target: {
      title: target.title,
      status: target.status,
      required: target.required,
      layer: target.layer
    },
    acceptanceCriteria: target.acceptanceCriteria,
    requiredEvidence,
    reviewCapabilities,
    packageOutputs,
    loop: loop ? {
      id: loop.id,
      status: loop.status,
      iteration: loop.currentIteration,
      sourceClosureState: loop.sourceClosure.closureState
    } : undefined,
    evidence,
    blockers,
    llmUsage: loopUsage,
    decision: {
      status,
      rationale: status === "GO"
        ? "TargetEvidencePackage is GO because the LoopRun succeeded and required source/DevOps gates passed."
        : status === "NO-GO"
          ? `TargetEvidencePackage is NO-GO until blockers are repaired: ${blockers.join("; ")}.`
          : "TargetEvidencePackage is pending execution evidence.",
      evidence
    }
  };
}

export function normalizeAppliedGoalPlan(input: unknown, goal: GlobalGoal, now: string): GoalPlan {
  const root = isRecord(input) && isRecord(input.plan) ? input.plan : input;
  if (!isRecord(root)) throw httpError(400, "GOAL_PLAN_INVALID", "Goal plan payload must be an object or { plan }.");
  const rawTargets = Array.isArray(root.targets) ? root.targets : [];
  if (rawTargets.length === 0) throw httpError(400, "GOAL_PLAN_TARGETS_REQUIRED", "Goal plan apply requires at least one GoalTarget.");
  const targets = rawTargets.map((target) => {
    const hydrated = hydrateGoalTarget(target, goal.id, goal.projectId, goal.releaseTargetId);
    if (!hydrated.phase) throw httpError(400, "GOAL_PLAN_TARGET_PHASE_REQUIRED", `GoalTarget ${hydrated.id} requires phase=alpha|beta|rc|ga.`);
    return {
      ...hydrated,
      status: "PENDING" as GoalTargetStatus,
      nextAction: "advance-target" as GoalNextAction,
      loopId: undefined,
      evidence: uniqueStrings([
        ...hydrated.evidence,
        "planApplied=true",
        `baseline=${DEFAULT_MATURITY_STANDARD_SET_ID}`
      ]),
      updatedAt: now
    };
  });
  const targetIds = new Set(targets.map((target) => target.id));
  for (const phase of MATURITY_PHASES) {
    if (!targets.some((target) => target.phase === phase)) {
      throw httpError(400, "GOAL_PLAN_PHASE_TARGETS_REQUIRED", `Goal plan must keep at least one GoalTarget in ${phase.toUpperCase()}.`);
    }
  }
  for (const target of targets) {
    const missing = target.dependencyIds.filter((dependencyId) => !targetIds.has(dependencyId));
    if (missing.length > 0) throw httpError(400, "GOAL_PLAN_DEPENDENCY_MISSING", `GoalTarget ${target.id} has missing dependencies: ${missing.join(", ")}`);
  }
  const rawPhaseTargets = Array.isArray(root.phaseTargets)
    ? root.phaseTargets
    : Array.isArray(root.phases)
      ? root.phases
      : [];
  const suppliedPhaseTargets = rawPhaseTargets.length > 0
    ? rawPhaseTargets.map((phase) => hydratePhaseTarget(phase, goal.id, targets))
    : [];
  const generatedPhaseTargets = phaseTargetsFromGoalTargets(goal.id, targets, now);
  const phaseTargets = MATURITY_PHASES.map((phase) => {
    const standard = maturityStandardTemplate(phase);
    const supplied = suppliedPhaseTargets.find((item) => item.phase === phase);
    const generated = generatedPhaseTargets.find((item) => item.phase === phase)!;
    return {
      ...generated,
      ...(supplied ? { title: supplied.title } : {}),
      acceptanceCriteria: uniqueStrings([...(supplied?.acceptanceCriteria ?? []), ...standard.acceptanceCriteria]),
      requiredEvidence: uniqueStrings([...(supplied?.requiredEvidence ?? []), ...standard.requiredEvidence]),
      reviewCapabilities: normalizeReviewCapabilities([...(supplied?.reviewCapabilities ?? []), ...standard.reviewCapabilities]),
      packageOutputs: uniqueStrings([...(supplied?.packageOutputs ?? []), ...standard.packageOutputs]),
      updatedAt: now
    };
  });
  return {
    schema: "evopilot-goal-plan/v1",
    status: "PENDING_APPROVAL",
    decompositionStrategy: "ga-maturity-ladder",
    terminalMaturity: "ga",
    maturityStandardSetId: DEFAULT_MATURITY_STANDARD_SET_ID,
    standardVersion: DEFAULT_MATURITY_STANDARD_VERSION,
    projectHarness: hydrateGoalPlanProjectHarnessBinding(root.projectHarness),
    summary: String(root.summary ?? `${goal.objective} adjusted by user and normalized against the Alpha -> Beta -> RC -> GA baseline.`),
    targetCount: targets.length,
    requiredTargetCount: targets.filter((target) => target.required).length,
    phaseTargets,
    targets,
    editablePlan: editablePlanPolicy(),
    generatedAt: optionalTrimmedString(root.generatedAt) ?? now
  };
}

export function normalizeGoalPlanApprovalConfirmation(input: unknown, actor: string): GoalPlanApprovalConfirmation {
  const body = isRecord(input) ? input : {};
  const confirmedBy = optionalTrimmedString(body.confirmedBy);
  const confirmation = optionalTrimmedString(body.confirmation);
  if (!confirmedBy || !confirmation) {
    throw httpError(400, "GOAL_PLAN_CONFIRMATION_REQUIRED", "approve-plan requires confirmedBy and confirmation after the Alpha/Beta/RC/GA phase plan has been shown to the user or project owner.");
  }
  const confirmedAtInput = optionalTrimmedString(body.confirmedAt);
  const confirmedAt = confirmedAtInput ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(confirmedAt))) {
    throw httpError(400, "GOAL_PLAN_CONFIRMED_AT_INVALID", "confirmedAt must be an ISO timestamp when provided.");
  }
  return {
    schema: "evopilot-goal-plan-approval-confirmation/v1",
    confirmedBy,
    confirmation,
    confirmedAt: new Date(confirmedAt).toISOString(),
    actor
  };
}

export function hydrateGoalPlanApprovalConfirmation(input: unknown): GoalPlanApprovalConfirmation | undefined {
  if (!isRecord(input)) return undefined;
  const confirmedBy = optionalTrimmedString(input.confirmedBy);
  const confirmation = optionalTrimmedString(input.confirmation);
  const confirmedAt = optionalTrimmedString(input.confirmedAt);
  const actor = optionalTrimmedString(input.actor);
  if (!confirmedBy || !confirmation || !confirmedAt || !actor) return undefined;
  return {
    schema: "evopilot-goal-plan-approval-confirmation/v1",
    confirmedBy,
    confirmation,
    confirmedAt,
    actor
  };
}

export function hydrateGoalTimelineEvent(value: unknown): GoalTimelineEvent {
  const record = isRecord(value) ? value : {};
  return {
    type: normalizeGoalTimelineEventType(record.type),
    message: String(record.message ?? ""),
    timestamp: String(record.timestamp ?? new Date().toISOString()),
    targetId: optionalTrimmedString(record.targetId),
    loopId: optionalTrimmedString(record.loopId),
    metadata: isRecord(record.metadata) ? record.metadata : undefined
  };
}

export function goalTimelineEvent(type: GoalTimelineEvent["type"], message: string, metadata?: Record<string, unknown>, targetId?: string, loopId?: string): GoalTimelineEvent {
  return {
    type,
    message,
    timestamp: new Date().toISOString(),
    targetId,
    loopId,
    metadata
  };
}

export function buildGoalSnapshot(store: FileStore, goal: GlobalGoal): GoalSnapshot {
  const releaseDecision = currentReleaseDecision(store.listReleaseDecisions()
    .filter((decision) => decision.projectId === goal.projectId)
    .filter((decision) => decision.targetId === goal.releaseTargetId));
  const done = new Set<string>();
  const derivedTargets: GoalTarget[] = [];
  for (const target of goal.plan.targets) {
    const dependenciesDone = target.dependencyIds.every((dependencyId) => done.has(dependencyId));
    const derived = deriveGoalTarget(store, goal, target, dependenciesDone);
    derivedTargets.push(derived);
    if (derived.status === "DONE") done.add(derived.id);
  }
  const derivedPlan: GoalPlan = {
    ...goal.plan,
    targetCount: derivedTargets.length,
    requiredTargetCount: derivedTargets.filter((target) => target.required).length,
    phaseTargets: derivePhaseTargets(goal, derivedTargets),
    targets: derivedTargets
  };
  const derivedGoal: GlobalGoal = {
    ...goal,
    plan: derivedPlan
  };
  const requiredTargets = derivedTargets.filter((target) => target.required);
  const completedTargets = requiredTargets.filter((target) => target.status === "DONE").length;
  const blockedTargets = derivedTargets.filter((target) => target.status === "BLOCKED").length;
  const failedTargets = derivedTargets.filter((target) => target.status === "FAILED").length;
  const status = deriveGlobalGoalStatus(derivedGoal, derivedTargets);
  const activeTarget = chooseActiveGoalTarget(derivedTargets);
  const nextAction = goalNextAction(status, activeTarget);
  const evidence = [
    `goal=${goal.id}`,
    `project=${goal.projectId}`,
    `releaseTarget=${goal.releaseTargetId}`,
    `plan=${goal.plan.status}`,
    `targets=${derivedTargets.length}`,
    `phases=${derivedPlan.phaseTargets.map((phase) => `${phase.phase}:${phase.status}`).join(",")}`,
    `completedTargets=${completedTargets}/${requiredTargets.length}`,
    goal.plan.projectHarness ? `projectHarnessProfile=${goal.plan.projectHarness.profileId}` : "projectHarnessProfile=missing",
    goal.plan.projectHarness ? `projectHarnessVersion=${goal.plan.projectHarness.version}` : "projectHarnessVersion=missing",
    goal.plan.projectHarness ? `projectHarnessDigest=${goal.plan.projectHarness.compiledDigest}` : "projectHarnessDigest=missing",
    releaseDecision ? `releaseDecision=${releaseDecision.status}` : "releaseDecision=not-generated"
  ];
  return {
    schema: "evopilot-goal-snapshot/v1",
    goal: {
      ...derivedGoal,
      status
    },
    status,
    progress: {
      totalTargets: derivedTargets.length,
      requiredTargets: requiredTargets.length,
      completedTargets,
      blockedTargets,
      failedTargets,
      percent: requiredTargets.length === 0 ? 0 : Math.round((completedTargets / requiredTargets.length) * 100)
    },
    phases: derivedPlan.phaseTargets,
    activeTarget,
    nextAction,
    blockers: derivedTargets.flatMap((target) => target.blocker ? [`${target.id}: ${target.blocker}`] : []),
    evidence,
    releaseDecision,
    updatedAt: new Date().toISOString()
  };
}

export function deriveGoalTarget(store: FileStore, goal: GlobalGoal, target: GoalTarget, dependenciesDone: boolean): GoalTarget {
  const now = new Date().toISOString();
  const loop = target.loopId ? store.readLoop(target.loopId) : undefined;
  if (!loop) {
    const status: GoalTargetStatus = target.status === "DONE" || target.status === "BLOCKED" || target.status === "FAILED"
      ? target.status
      : goal.plan.status === "APPROVED" && dependenciesDone ? "READY" : "PENDING";
    return {
      ...target,
      status,
      nextAction: status === "READY" ? "start-target" : target.nextAction === "done" ? "done" : "advance-target",
      evidence: [
        `goal=${goal.id}`,
        `target=${target.id}`,
        `dependencies=${target.dependencyIds.join(",") || "none"}`,
        dependenciesDone ? "dependencies=done" : "dependencies=pending",
        `criteria=${target.acceptanceCriteria.length}`,
        ...target.evidence
      ],
      updatedAt: now
    };
  }
  const externalBlocker = inferLoopExternalBlocker({ id: target.id }, loop);
  const targetPackage = buildTargetEvidencePackage(goal, target, loop);
  const status = goalTargetStatusFromLoop(loop, externalBlocker, targetPackage);
  return {
    ...target,
    status,
    loopId: loop.id,
    targetVersion: target.targetVersion ?? loop.sourceClosure.targetVersion,
    nextAction: goalNextActionFromLoop(loop, externalBlocker),
    blocker: externalBlocker?.blockers.join("; ") ?? target.blocker,
    evidence: [
      `goal=${goal.id}`,
      `target=${target.id}`,
      `loop=${loop.id}`,
      `loopStatus=${loop.status}`,
      `iteration=${loop.currentIteration}/${loop.stopPolicy.maxIterations}`,
      `sourceClosure=${loop.sourceClosure.closureState}`,
      `targetEvidencePackage=${targetPackage?.status ?? "PENDING"}`,
      `sandboxEnforcement=${loop.sandboxEnforcement.status}`,
      `executorSteps=${loop.trace.executorStepCount}`,
      externalBlocker ? `externalBlocker=${externalBlocker.type}` : "externalBlocker=none",
      ...(targetPackage?.blockers.map((blocker) => `targetPackage.blocker=${blocker}`) ?? []),
      ...target.evidence
    ],
    updatedAt: now
  };
}

export function goalTargetStatusFromLoop(loop: LoopRun, externalBlocker?: LoopExternalBlocker, targetPackage?: TargetEvidencePackage): GoalTargetStatus {
  if (externalBlocker) return "BLOCKED";
  if (loop.status === "WAITING_APPROVAL") return "WAITING_HUMAN";
  if (loop.status === "FAILED" || loop.status === "CANCELLED") return "FAILED";
  if (loop.status === "BLOCKED") return "BLOCKED";
  if (loop.status === "SUCCEEDED" && targetPackage?.status === "GO") return "DONE";
  if (loop.status === "SUCCEEDED") return "BLOCKED";
  return "RUNNING";
}

export function goalNextActionFromLoop(loop: LoopRun, externalBlocker?: LoopExternalBlocker): GoalNextAction {
  if (externalBlocker) return externalBlocker.nextAction;
  if (loop.status === "PENDING") return "start-target";
  if (loop.status === "WAITING_APPROVAL") return "human-approval";
  if (loop.status === "RUNNING" || loop.status === "BLOCKED") return "resume-loop";
  if (loop.status === "SUCCEEDED" && loop.sourceClosure.closureState !== "PROMOTED") return "release-decision";
  if (loop.status === "SUCCEEDED") return "done";
  return "repair";
}

export function deriveGlobalGoalStatus(goal: GlobalGoal, targets: GoalTarget[]): GlobalGoalStatus {
  if (goal.plan.status === "MISSING") return "DRAFT";
  if (goal.plan.status === "PENDING_APPROVAL") return "PLANNED";
  if (targets.length === 0) return "APPROVED";
  if (targets.some((target) => target.status === "WAITING_HUMAN")) return "WAITING_HUMAN";
  if (targets.some((target) => target.status === "BLOCKED")) return "BLOCKED";
  if (targets.some((target) => target.status === "FAILED")) return "FAILED";
  const required = targets.filter((target) => target.required);
  if (required.length > 0 && required.every((target) => target.status === "DONE")) return "COMPLETED";
  if (targets.some((target) => target.status === "RUNNING")) return "RUNNING";
  return "APPROVED";
}

export function chooseActiveGoalTarget(targets: GoalTarget[]): GoalTarget | undefined {
  return targets.find((target) => target.status === "WAITING_HUMAN")
    ?? targets.find((target) => target.status === "BLOCKED")
    ?? targets.find((target) => target.status === "RUNNING")
    ?? targets.find((target) => target.status === "READY")
    ?? targets.find((target) => target.status === "PENDING")
    ?? targets.find((target) => target.status !== "DONE");
}

export function goalNextAction(status: GlobalGoalStatus, activeTarget?: GoalTarget): GoalNextAction {
  if (status === "DRAFT") return "plan-goal";
  if (status === "PLANNED") return "approve-plan";
  if (status === "COMPLETED") return "view-final-report";
  if (activeTarget) return activeTarget.nextAction;
  return status === "FAILED" || status === "BLOCKED" ? "repair" : "done";
}

export function buildGoalEvidenceMatrix(goal: GlobalGoal): GoalEvidenceMatrixRow[] {
  return goal.plan.targets.map((target) => ({
    targetId: target.id,
    phase: target.phase,
    title: target.title,
    required: target.required,
    status: target.status,
    acceptanceCriteria: target.acceptanceCriteria,
    requiredEvidence: target.requiredEvidence,
    reviewCapabilities: target.reviewCapabilities,
    evidence: target.evidence,
    blocker: target.blocker,
    loopId: target.loopId
  }));
}

export function buildGoalRunStatusChain(store: FileStore, snapshot: GoalSnapshot, latestLoop?: LoopRun): GoalRunStatus["chain"] {
  const project = store.readProject(snapshot.goal.projectId);
  const releaseTarget = store.readReleaseTarget(snapshot.goal.releaseTargetId);
  const activeTarget = snapshot.activeTarget;
  const latestReleaseRun = latestLoop ? store.listSourceReleaseClosureRuns(latestLoop.id).at(-1) : undefined;
  const deployFinalizers = latestLoop ? store.listSourceReleaseDeployFinalizers().filter((item) => item.loopId === latestLoop.id) : [];
  const latestDeploy = deployFinalizers.at(-1);
  const phaseNodes = snapshot.phases.map((phase) => ({
    id: `phase-${phase.phase}`,
    label: `${phase.phase.toUpperCase()} Phase`,
    status: phase.status,
    detail: `${phase.title} / targets=${phase.goalTargetIds.length} / decision=${phase.decision.status}`
  }));
  return [
    {
      id: "project",
      label: "Project",
      status: project ? "OK" : "BLOCKED",
      detail: project ? snapshot.goal.projectId : "Project is not registered."
    },
    {
      id: "target",
      label: "Release Target",
      status: releaseTarget ? "OK" : "BLOCKED",
      detail: releaseTarget ? `${releaseTarget.id} / ${releaseTarget.name}` : `${snapshot.goal.releaseTargetId} is missing.`
    },
    {
      id: "global-goal",
      label: "GlobalGoal",
      status: snapshot.status,
      detail: `${snapshot.goal.id} / ${snapshot.progress.completedTargets}/${snapshot.progress.requiredTargets} required targets`
    },
    ...phaseNodes,
    {
      id: "goal-target",
      label: "GoalTarget",
      status: activeTarget?.status ?? "DONE",
      detail: activeTarget ? `${activeTarget.id} / next=${activeTarget.nextAction}` : "No active target."
    },
    {
      id: "loop-run",
      label: "LoopRun",
      status: latestLoop?.status ?? (activeTarget?.loopId ? "MISSING" : "PENDING"),
      detail: latestLoop ? `${latestLoop.id} / iteration=${latestLoop.currentIteration}` : "No loop is bound to the active target."
    },
    {
      id: "source-closure",
      label: "Source Closure",
      status: latestLoop?.sourceClosure.closureState ?? "PENDING",
      detail: latestReleaseRun ? `${latestReleaseRun.id} / next=${latestReleaseRun.nextAction}` : "No source release run yet."
    },
    {
      id: "deploy",
      label: "CI/CD + Deploy",
      status: latestDeploy?.status ?? "PENDING",
      detail: latestDeploy ? `${latestDeploy.id} / ${latestDeploy.deploymentEnvironment ?? "deployment"}` : "No deploy finalizer yet."
    },
    {
      id: "release-decision",
      label: "Release Decision",
      status: snapshot.releaseDecision?.status ?? "PENDING",
      detail: snapshot.releaseDecision ? `${snapshot.releaseDecision.id} / status=${snapshot.releaseDecision.status}` : "No product-native release decision yet."
    },
    {
      id: "final-report",
      label: "Final Report",
      status: snapshot.goal.finalReport?.status ?? (snapshot.status === "COMPLETED" ? "PENDING" : "NOT_READY"),
      detail: snapshot.goal.finalReport ? snapshot.goal.finalReport.conclusion : "Generated after GlobalGoal reaches terminal completion."
    }
  ];
}

export async function generateGoalPlanTargets(store: FileStore, goal: GlobalGoal, releaseTarget: ReleaseTargetProfile, actor: string, now: string): Promise<{ targets: GoalTarget[]; planner: GoalPlanPlannerTrace; projectHarness?: GoalPlanProjectHarnessBinding }> {
  const project = store.readProject(goal.projectId);
  const projectHarnessProfile = store.readActiveProjectHarnessProfile(goal.projectId);
  if (project && projectHarnessProfile) {
    const template = store.readHarnessTemplate(projectHarnessProfile.templateRef.templateId, projectHarnessProfile.templateRef.version);
    const activePolicies = store.listActiveTenantHarnessPoliciesForProject(project, template);
    const policyFailures = detectTenantHarnessPolicyBindingFailures(activePolicies, projectHarnessProfile.compiledContent);
    if (policyFailures.length > 0) {
      logWarn("goal-plan.project-harness-policy-stale", {
        tenantId: goal.tenantId,
        workspaceId: goal.workspaceId,
        actor,
        outcome: "blocked",
        errorCode: "PROJECT_HARNESS_PROFILE_POLICY_STALE",
        correlation: {
          goalId: goal.id,
          projectId: goal.projectId,
          releaseTargetId: goal.releaseTargetId
        },
        diagnosis: {
          summary: "Active ProjectHarnessProfile does not bind the current TenantHarnessPolicy.",
          likelyCause: "A tenant/workspace harness policy was activated after this project profile version was compiled.",
          recommendedAction: "Run harness profile generate or apply a revised ProjectHarnessProfile, review it, and activate the new version before goal planning.",
          retriable: false,
          humanActionRequired: true
        },
        metadata: projectHarnessLogMetadata(project, projectHarnessProfile, {
          goalId: goal.id,
          releaseTargetId: goal.releaseTargetId,
          policyFailures,
          nextAction: "regenerate-project-harness-profile"
        })
      });
      throw httpError(409, "PROJECT_HARNESS_PROFILE_POLICY_STALE", `Active ProjectHarnessProfile must be regenerated against active TenantHarnessPolicy before goal planning: ${policyFailures.join("; ")}`);
    }
  }
  const projectHarness = projectHarnessPlanBinding(projectHarnessProfile, now);
  if (projectHarnessProfile && projectHarness) {
    logInfo("goal-plan.project-harness-bound", {
      tenantId: goal.tenantId,
      workspaceId: goal.workspaceId,
      actor,
      outcome: "success",
      correlation: {
        goalId: goal.id,
        projectId: goal.projectId,
        releaseTargetId: goal.releaseTargetId
      },
      metadata: project
        ? projectHarnessLogMetadata(project, projectHarnessProfile, { goalId: goal.id, releaseTargetId: goal.releaseTargetId, nextAction: "review-phase-plan" })
        : {
          projectId: goal.projectId,
          profileId: projectHarness.profileId,
          profileVersion: projectHarness.version,
          compiledDigest: projectHarness.compiledDigest,
          templateId: projectHarness.templateRef.templateId,
          templateVersion: projectHarness.templateRef.version,
          templateDigest: projectHarness.templateRef.digest,
          nextAction: "review-phase-plan"
        }
    });
  } else {
    logWarn("goal-plan.project-harness-missing", {
      tenantId: goal.tenantId,
      workspaceId: goal.workspaceId,
      actor,
      outcome: "blocked",
      errorCode: "PROJECT_HARNESS_PROFILE_ACTIVE_MISSING",
      correlation: {
        goalId: goal.id,
        projectId: goal.projectId,
        releaseTargetId: goal.releaseTargetId
      },
      diagnosis: {
        summary: "Goal planning has no active ProjectHarnessProfile binding.",
        likelyCause: "The project has not activated a reviewed harness profile.",
        recommendedAction: "Run harness profile generate/review/activate before approving the phase plan.",
        retriable: false,
        humanActionRequired: true
      },
      metadata: {
        projectId: goal.projectId,
        goalId: goal.id,
        releaseTargetId: goal.releaseTargetId,
        nextAction: "activate-project-harness-profile"
      }
    });
  }
  const llmResolution = resolveLoopLlmSelection(store, {
    project,
    tenantId: goal.tenantId,
    workspaceId: goal.workspaceId,
    requestedProfileId: goal.llm?.profileId,
    requireLlm: store.requireLlm()
  });
  const client = store.resolveGoalPlanLlmClient(llmResolution.selection);
  if (!client) {
    if (store.requireLlm()) {
      throw httpError(409, "GOAL_PLAN_LLM_REQUIRED", "GlobalGoal phase planning requires a READY LLM profile or production LLM provider.");
    }
    return {
      targets: goalTargetsFromReleaseTarget(goal, releaseTarget, now, {
        plannerMode: "debug-deterministic-no-provider",
        plannerEvidence: [
          "planner=debug-deterministic-no-provider",
          "llmPlanner=false",
          "reason=LLM provider is not configured in debug mode",
          projectHarness ? `projectHarnessProfile=${projectHarness.profileId}` : "projectHarnessProfile=missing",
          projectHarness ? `projectHarnessVersion=${projectHarness.version}` : "projectHarnessVersion=missing",
          projectHarness ? `projectHarnessDigest=${projectHarness.compiledDigest}` : "projectHarnessDigest=missing"
        ]
      }),
      planner: debugDeterministicGoalPlanTrace(goal, llmResolution.selection, now, projectHarness),
      projectHarness
    };
  }
  const startedAt = new Date().toISOString();
  const response = await client.generate({
    caller: "evopilot-global-goal-planner",
    intent: "plan.generation",
    outputContract: "json_object",
    jsonObject: true,
    latencyClass: "batch",
    complexity: "high",
    outputSize: "large",
    metadata: {
      productFlow: "global-goal-maturity-planning",
      goalId: goal.id,
      projectId: goal.projectId,
      releaseTargetId: goal.releaseTargetId,
      terminalMaturity: "ga",
      actor,
      llmProfileId: llmResolution.selection.profileId ?? "global-default"
    },
    prompt: goalPlanPlannerPrompt(goal, releaseTarget, project, maturityStandardTemplates(), projectHarnessProfile)
  });
  if (!response.success) {
    throw httpError(409, "GOAL_PLAN_LLM_FAILED", response.errorMessage ?? response.errorCode ?? "LLM planner failed.");
  }
  let targets: GoalTarget[];
  try {
    targets = normalizeLlmGoalPlanTargets(JSON.parse(extractJsonObject(response.text)), goal, releaseTarget, now);
  } catch (error) {
    throw httpError(422, "GOAL_PLAN_LLM_OUTPUT_INVALID", error instanceof Error ? error.message : String(error));
  }
  return {
    targets,
    planner: llmGoalPlanTrace(response, llmResolution.selection, startedAt, projectHarness),
    projectHarness
  };
}

export function debugDeterministicGoalPlanTrace(goal: GlobalGoal, selection: LoopLlmSelection, now: string, projectHarness?: GoalPlanProjectHarnessBinding): GoalPlanPlannerTrace {
  return {
    schema: "evopilot-goal-plan-planner-trace/v1",
    mode: "debug-deterministic-no-provider",
    generatedBy: "deterministic-debug",
    provider: selection.provider,
    model: selection.model,
    llmProfileId: selection.profileId,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    creditsConsumed: 0,
    creditUnit: "token",
    guardrails: goalPlanGuardrails(),
    evidence: [
      `goal=${goal.id}`,
      "planner=debug-deterministic-no-provider",
      "llmPlanner=false",
      "debugOnly=true",
      projectHarness ? `projectHarnessProfile=${projectHarness.profileId}` : "projectHarnessProfile=missing",
      projectHarness ? `projectHarnessVersion=${projectHarness.version}` : "projectHarnessVersion=missing",
      projectHarness ? `projectHarnessDigest=${projectHarness.compiledDigest}` : "projectHarnessDigest=missing"
    ],
    generatedAt: now
  };
}

export function llmGoalPlanTrace(response: LlmGenerateResponse, selection: LoopLlmSelection, startedAt: string, projectHarness?: GoalPlanProjectHarnessBinding): GoalPlanPlannerTrace {
  const totalTokens = response.usage?.totalTokens ?? 0;
  return {
    schema: "evopilot-goal-plan-planner-trace/v1",
    mode: "llm-constrained",
    generatedBy: "llm",
    provider: response.provider ?? selection.provider,
    model: response.model ?? selection.model,
    llmProfileId: selection.profileId,
    requestId: response.requestId,
    inputTokens: response.usage?.inputTokens ?? 0,
    outputTokens: response.usage?.outputTokens ?? 0,
    totalTokens,
    creditsConsumed: response.usage?.creditsConsumed ?? totalTokens,
    creditUnit: response.usage?.creditUnit ?? "token",
    guardrails: goalPlanGuardrails(),
    evidence: [
      `requestId=${response.requestId}`,
      `provider=${response.provider ?? selection.provider ?? "unknown"}`,
      `model=${response.model ?? selection.model ?? "unknown"}`,
      `startedAt=${startedAt}`,
      `durationMs=${response.durationMs}`,
      `totalTokens=${totalTokens}`,
      "planner=llm-constrained",
      "guardrail=server-normalized",
      projectHarness ? `projectHarnessProfile=${projectHarness.profileId}` : "projectHarnessProfile=missing",
      projectHarness ? `projectHarnessVersion=${projectHarness.version}` : "projectHarnessVersion=missing",
      projectHarness ? `projectHarnessDigest=${projectHarness.compiledDigest}` : "projectHarnessDigest=missing"
    ],
    generatedAt: new Date().toISOString()
  };
}

export function goalPlanGuardrails(): string[] {
  return [
    "Alpha/Beta/RC/GA phases are fixed and cannot be deleted or skipped.",
    "GA is the fixed terminal maturity.",
    "Each phase must keep at least one required GoalTarget.",
    "Every GoalTarget must produce a TargetEvidencePackage before DONE.",
    "Every phase must produce a PhasePackage before the next phase can pass.",
    "Built-in baseline criteria and required evidence cannot be removed.",
    "Architecture/security/testing/docs/ops/release review capabilities are enforced by phase standards.",
    "An active ProjectHarnessProfile may strengthen target capabilities and evidence contracts, but it cannot weaken mandatory governance gates.",
    "Goal planning must bind the active ProjectHarnessProfile version and digest when one exists."
  ];
}

export function goalPlanPlannerPrompt(goal: GlobalGoal, releaseTarget: ReleaseTargetProfile, project: StoredProject | undefined, standards: MaturityStandardTemplate[], projectHarnessProfile?: ProjectHarnessProfileVersion): string {
  const compiledHarness = projectHarnessProfile?.compiledContent;
  return [
    "You are EvoPilot's constrained GlobalGoal planner and software architect.",
    "Return only one JSON object. Do not include Markdown.",
    "The user objective is a business outcome, not a maturity label.",
    "Generate concrete project-specific GoalTargets under the fixed Alpha -> Beta -> RC -> GA ladder.",
    "Do not remove, rename, reorder, or skip the phases. GA is always the terminal maturity.",
    "Each phase must include at least one required target and one package/GO-NO-GO target.",
    "Every target must be independently verifiable through a TargetEvidencePackage.",
    "Use the built-in standards as mandatory baselines; you may add or strengthen, never weaken.",
    "If an active ProjectHarnessProfile is present, bind targets to its capability boundaries, validation commands, failure handling, diagnostics, observability, and governance rules.",
    "If the goal exposes missing harness rules, add a target that requests a profile revision suggestion; do not silently mutate the active ProjectHarnessProfile.",
    "",
    "Output JSON schema:",
    "{",
    "  \"summary\": \"string\",",
    "  \"targets\": [",
    "    {",
    "      \"id\": \"kebab-case unique id without goal prefix\",",
    "      \"phase\": \"alpha|beta|rc|ga\",",
    "      \"title\": \"short operator-visible title\",",
    "      \"description\": \"what this target proves\",",
    "      \"layer\": \"planning|sandbox|context|harness|loop|release\",",
    "      \"required\": true,",
    "      \"dependencyIds\": [\"optional prior target ids from this same output\"],",
    "      \"acceptanceCriteria\": [\"criteria\"],",
    "      \"requiredEvidence\": [\"evidence ids\"],",
    "      \"reviewCapabilities\": [\"architecture|security|testing|documentation|operations|release\"],",
    "      \"packageOutputs\": [\"target package outputs\"]",
    "    }",
    "  ]",
    "}",
    "",
    `Goal id: ${goal.id}`,
    `Project id: ${goal.projectId}`,
    `Project name: ${project?.name ?? "unknown"}`,
    `Repository provider: ${project?.repository?.provider ?? "unknown"}`,
    `Repository claim boundary: ${project?.repository?.owner ?? project?.repository?.root ?? project?.repository?.projectId ?? "unknown"}`,
    `Business objective: ${goal.objective}`,
    `Release target id: ${releaseTarget.id}`,
    `Release target name: ${releaseTarget.name}`,
    `Required scenarios: ${releaseTarget.requiredScenarioIds.join(", ") || "source-to-release,runtime-validation,release-decision"}`,
    `Minimum successful runs: ${releaseTarget.minSuccessfulRuns}`,
    `Minimum successful pipelines: ${releaseTarget.minSuccessfulPipelines}`,
    `Active soak required: ${releaseTarget.requireActiveSoak === true}`,
    "",
    "Active ProjectHarnessProfile:",
    projectHarnessProfile ? JSON.stringify({
      profileId: projectHarnessProfile.profileId,
      version: projectHarnessProfile.version,
      sourceDigest: projectHarnessProfile.sourceDigest,
      compiledDigest: projectHarnessProfile.compiledDigest,
      templateRef: projectHarnessProfile.templateRef,
      capabilities: compiledHarness?.capabilities.map((capability) => ({
        id: capability.id,
        boundary: capability.boundary,
        requiredEvidence: capability.requiredEvidence
      })),
      runtime: compiledHarness?.runtime,
      validation: compiledHarness?.validation,
      evidence: compiledHarness?.evidence,
      failureHandling: compiledHarness?.failureHandling,
      diagnostics: compiledHarness?.diagnostics,
      observability: compiledHarness?.observability,
      governance: compiledHarness?.governance,
      phaseMapping: compiledHarness?.phaseMapping
    }, null, 2) : "none",
    "",
    "Mandatory maturity standards:",
    JSON.stringify(standards.map((standard) => ({
      phase: standard.phase,
      name: standard.name,
      purpose: standard.purpose,
      baselineRules: standard.baselineRules,
      acceptanceCriteria: standard.acceptanceCriteria,
      requiredEvidence: standard.requiredEvidence,
      reviewCapabilities: standard.reviewCapabilities,
      packageOutputs: standard.packageOutputs,
      goNoGoRules: standard.goNoGoRules,
      plannerInstructions: standard.plannerInstructions,
      targetSchema: standard.targetSchema,
      packageContract: standard.packageContract
    })), null, 2)
  ].join("\n");
}

export function normalizeLlmGoalPlanTargets(input: unknown, goal: GlobalGoal, releaseTarget: ReleaseTargetProfile, now: string): GoalTarget[] {
  const root = isRecord(input) && isRecord(input.plan) ? input.plan : input;
  if (!isRecord(root)) throw new Error("Planner output must be a JSON object.");
  const rawTargets = Array.isArray(root.targets) ? root.targets : [];
  if (rawTargets.length === 0) throw new Error("Planner output must include targets[].");
  const targets = rawTargets.map((target, index) => hydratePlannerGoalTarget(target, index, goal, now));
  const normalized = normalizeGoalTargetDependencyChain(ensureMandatoryPhasePackageTargets(targets, goal, releaseTarget, now));
  for (const phase of MATURITY_PHASES) {
    const phaseTargets = normalized.filter((target) => target.phase === phase);
    const standard = maturityStandardTemplate(phase);
    if (phaseTargets.length < standard.targetSchema.minRequiredTargets) {
      throw new Error(`Planner output for ${phase.toUpperCase()} must include at least ${standard.targetSchema.minRequiredTargets} targets.`);
    }
    if (!phaseTargets.some((target) => target.required)) {
      throw new Error(`Planner output for ${phase.toUpperCase()} must include at least one required target.`);
    }
  }
  return normalized;
}

export function hydratePlannerGoalTarget(value: unknown, index: number, goal: GlobalGoal, now: string): GoalTarget {
  const record = isRecord(value) ? value : {};
  const phase = normalizeOptionalMaturityPhase(record.phase);
  if (!phase) throw new Error(`Planner target at index ${index} requires phase=alpha|beta|rc|ga.`);
  const standard = maturityStandardTemplate(phase);
  const idPart = safeFileName(String(record.id ?? `${phase}-target-${index + 1}`));
  const id = idPart.startsWith(`${goal.id}-`) ? idPart : `${goal.id}-${idPart}`;
  const packageOutputs = uniqueStrings([
    ...(Array.isArray(record.packageOutputs) ? record.packageOutputs.map(String) : []),
    ...standard.packageOutputs,
    `${phase}-target-evidence-package`
  ]);
  return {
    schema: "evopilot-goal-target/v1",
    id,
    goalId: goal.id,
    projectId: goal.projectId,
    releaseTargetId: goal.releaseTargetId,
    phase,
    standardId: standard.id,
    title: String(record.title ?? `${phase.toUpperCase()} target ${index + 1}`),
    description: String(record.description ?? ""),
    layer: normalizeGoalTargetLayer(record.layer),
    required: record.required !== false,
    dependencyIds: Array.isArray(record.dependencyIds) ? record.dependencyIds.map((item) => {
      const dependencyId = safeFileName(String(item));
      return dependencyId.startsWith(`${goal.id}-`) ? dependencyId : `${goal.id}-${dependencyId}`;
    }) : [],
    acceptanceCriteria: uniqueStrings([
      ...(Array.isArray(record.acceptanceCriteria) ? record.acceptanceCriteria.map(String) : []),
      ...standard.acceptanceCriteria
    ]),
    requiredEvidence: uniqueStrings([
      ...(Array.isArray(record.requiredEvidence) ? record.requiredEvidence.map(String) : []),
      ...standard.requiredEvidence,
      "target-evidence-package"
    ]),
    reviewCapabilities: normalizeReviewCapabilities([
      ...(Array.isArray(record.reviewCapabilities) ? record.reviewCapabilities : []),
      ...standard.reviewCapabilities
    ]),
    status: "PENDING",
    nextAction: "start-target",
    targetVersion: `${goal.releaseTargetId}-${phase}-${idPart}`,
    evidence: [
      "planner=llm-constrained",
      "terminalMaturity=ga",
      `phase=${phase}`,
      `standard=${standard.id}`,
      `maturityStandardSet=${DEFAULT_MATURITY_STANDARD_SET_ID}`,
      `businessObjective=${goal.objective}`,
      "targetEvidencePackageRequired=true",
      `packageOutputs=${packageOutputs.join(",")}`
    ],
    createdAt: now,
    updatedAt: now
  };
}

export function ensureMandatoryPhasePackageTargets(targets: GoalTarget[], goal: GlobalGoal, releaseTarget: ReleaseTargetProfile, now: string): GoalTarget[] {
  const result = [...targets];
  for (const phase of MATURITY_PHASES) {
    const phaseTargets = result.filter((target) => target.phase === phase);
    if (phaseTargets.some((target) => target.id.includes(`${phase}-phase-package`) || target.title.toLowerCase().includes("package"))) continue;
    const standard = maturityStandardTemplate(phase);
    const id = `${goal.id}-${phase}-${phase === "ga" ? "phase-package-final-decision" : "phase-package"}`;
    result.push({
      schema: "evopilot-goal-target/v1",
      id,
      goalId: goal.id,
      projectId: goal.projectId,
      releaseTargetId: goal.releaseTargetId,
      phase,
      standardId: standard.id,
      title: phase === "ga" ? "GA package and final release decision" : `${phase.toUpperCase()} package and GO/NO-GO decision`,
      description: phase === "ga"
        ? "Produce the final GA release package, GoalCompletionReport, and product-native ReleaseDecision=GO."
        : `Produce the ${phase.toUpperCase()} phase package and lock the decision before the next phase starts.`,
      layer: "release",
      required: true,
      dependencyIds: phaseTargets.at(-1)?.id ? [phaseTargets.at(-1)!.id] : [],
      acceptanceCriteria: uniqueStrings([
        `${phase.toUpperCase()} package links every ${phase.toUpperCase()} GoalTarget to TargetEvidencePackage evidence or blockers.`,
        `${phase.toUpperCase()} decision is GO only when every required ${phase.toUpperCase()} GoalTarget is DONE.`,
        ...(phase === "ga" ? ["Final ReleaseDecision is GO."] : []),
        ...standard.acceptanceCriteria
      ]),
      requiredEvidence: uniqueStrings([
        `${phase}-phase-package`,
        `${phase}-phase-decision`,
        "target-evidence-package-index",
        ...(phase === "ga" ? ["ga-release-package", "final-release-decision", "goal-completion-report"] : []),
        ...standard.requiredEvidence
      ]),
      reviewCapabilities: normalizeReviewCapabilities(["architecture", "release", ...standard.reviewCapabilities]),
      status: "PENDING",
      nextAction: "start-target",
      targetVersion: `${releaseTarget.id}-${phase}-phase-package`,
      evidence: [
        "planner=server-mandatory-phase-package-target",
        "terminalMaturity=ga",
        `phase=${phase}`,
        `standard=${standard.id}`,
        "targetEvidencePackageRequired=true"
      ],
      createdAt: now,
      updatedAt: now
    });
  }
  return result;
}

export function normalizeGoalTargetDependencyChain(targets: GoalTarget[]): GoalTarget[] {
  const ordered = [...targets].sort((left, right) => MATURITY_PHASES.indexOf(left.phase ?? "alpha") - MATURITY_PHASES.indexOf(right.phase ?? "alpha"));
  const seen = new Set<string>();
  let previousId: string | undefined;
  return ordered.map((target, index) => {
    let id = target.id;
    if (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    const dependencyIds = uniqueStrings([
      ...target.dependencyIds.filter((dependencyId) => seen.has(dependencyId)),
      ...(previousId ? [previousId] : [])
    ]);
    const normalized = {
      ...target,
      id,
      dependencyIds
    };
    previousId = id;
    return normalized;
  });
}

export function goalTargetsFromReleaseTarget(goal: GlobalGoal, releaseTarget: ReleaseTargetProfile, now: string, options: { plannerMode?: GoalPlanPlannerTrace["mode"]; plannerEvidence?: string[] } = {}): GoalTarget[] {
  const requiredScenarios = releaseTarget.requiredScenarioIds.length > 0
    ? releaseTarget.requiredScenarioIds
    : ["source-to-release", "runtime-validation", "release-decision"];
  const specs: Array<{
    phase: MaturityPhase;
    slug: string;
    title: string;
    description: string;
    layer: GoalTargetLayer;
    acceptanceCriteria: string[];
    requiredEvidence: string[];
    reviewCapabilities?: ReviewCapability[];
  }> = [
      {
        phase: "alpha",
        slug: "source-readiness",
        title: "Alpha source and ownership readiness",
        description: "Confirm the project, source repository, branch, workspace scope, and credential/read-only boundary before execution.",
        layer: "planning",
        acceptanceCriteria: [
          `Business objective is captured without redefining maturity: ${goal.objective}.`,
          "Project is registered in the current tenant and workspace.",
          "Source repository and default branch are readable.",
          "Writeback credential, tokenRef, read-only boundary, or account blocker has a clear READY/BLOCKED result."
        ],
        requiredEvidence: ["project-registration", "source-readiness-preflight", "credential-or-read-only-boundary"],
        reviewCapabilities: ["architecture"]
      },
      {
        phase: "alpha",
        slug: "bootstrap-smoke-architecture",
        title: "Alpha bootstrap, smoke, and architecture map",
        description: "Establish the build/bootstrap path, minimal smoke result, architecture map, and risk register for the business objective.",
        layer: "harness",
        acceptanceCriteria: [
          "Build, install, or runtime bootstrap path is reproducible or explicitly blocked.",
          "Minimal smoke path passes or blocker is recorded with owner and next action.",
          "Architecture map and risk register exist."
        ],
        requiredEvidence: ["build-or-bootstrap-evidence", "smoke-or-blocker-evidence", "architecture-map", "risk-register"],
        reviewCapabilities: ["architecture"]
      },
      {
        phase: "alpha",
        slug: "phase-package",
        title: "Alpha package and GO/NO-GO decision",
        description: "Produce the Alpha phase package and lock the decision before Beta may start.",
        layer: "release",
        acceptanceCriteria: [
          "Alpha readiness report links every Alpha GoalTarget to evidence or blockers.",
          "Alpha decision is GO only when every required Alpha GoalTarget is DONE.",
          "Alpha package does not claim external release readiness."
        ],
        requiredEvidence: ["alpha-readiness-report", "alpha-phase-decision"],
        reviewCapabilities: ["architecture"]
      },
      {
        phase: "beta",
        slug: "core-e2e-native-ci",
        title: "Beta core E2E and native CI",
        description: "Run core end-to-end scenarios and prove repository-native GitHub Actions or GitLab CI observability within the declared claim boundary.",
        layer: "harness",
        acceptanceCriteria: [
          "Alpha phase package is PASS.",
          `Required scenarios are represented: ${requiredScenarios.join(", ")}.`,
          `Successful runs satisfy release target threshold: ${releaseTarget.minSuccessfulRuns}.`,
          "GitHub Actions or GitLab CI is configured and observable when writeback or CI/CD readiness is claimed.",
          "Evidence is production-boundary evidence, not mock, fixture-only, or chat-only proof."
        ],
        requiredEvidence: ["alpha-phase-package", "core-e2e-run", "native-ci-status", "real-boundary-evidence"],
        reviewCapabilities: ["testing"]
      },
      {
        phase: "beta",
        slug: "docs-tests-risk",
        title: "Beta documentation, tests, and risk closure",
        description: "Confirm critical tests, basic docs, and risk closure for limited user trial.",
        layer: "context",
        acceptanceCriteria: [
          "Critical tests exist for the requested business capability.",
          "Basic user or operator documentation is usable.",
          "No high open risk blocks limited user trial."
        ],
        requiredEvidence: ["critical-test-evidence", "basic-docs", "risk-closure"],
        reviewCapabilities: ["testing", "documentation"]
      },
      {
        phase: "beta",
        slug: "phase-package",
        title: "Beta package and GO/NO-GO decision",
        description: "Produce the Beta phase package and lock the decision before RC may start.",
        layer: "release",
        acceptanceCriteria: [
          "Beta E2E report links every Beta GoalTarget to evidence or blockers.",
          "Beta decision is GO only when Alpha is PASSED and every required Beta GoalTarget is DONE.",
          "Beta package states the GitHub/GitLab DevOps claim boundary."
        ],
        requiredEvidence: ["beta-e2e-report", "beta-phase-decision", "devops-claim-boundary"],
        reviewCapabilities: ["testing", "documentation"]
      },
      {
        phase: "rc",
        slug: "scope-source-closure",
        title: "RC scope freeze and source closure",
        description: "Freeze scope and close source writeback with branch, commit, PR/MR or local review evidence.",
        layer: "loop",
        acceptanceCriteria: [
          "Beta phase package is PASS.",
          "Scope is frozen for the release candidate.",
          "Source closure preflight passes before writeback.",
          "Source closure records branch, commit, PR/MR or local review artifact."
        ],
        requiredEvidence: ["beta-phase-package", "scope-freeze-record", "source-closure-preflight", "source-closure-record", "pr-or-mr-review"],
        reviewCapabilities: ["architecture", "release"]
      },
      {
        phase: "rc",
        slug: "deploy-rollback-security-architecture",
        title: "RC deploy, rollback, security, and architecture review",
        description: "Prove repeated native CI/CD, deployment health, rollback or repair, security, dependency, compatibility, and architecture readiness.",
        layer: "release",
        acceptanceCriteria: [
          `Successful pipelines satisfy release target threshold: ${releaseTarget.minSuccessfulPipelines}.`,
          "Deploy and health-ready gates produce auditable evidence.",
          "Rollback or repair evidence exists.",
          "Security, dependency, compatibility, and architecture reviews pass.",
          "No P0/P1 blocker remains open."
        ],
        requiredEvidence: ["repeat-ci-cd-pass", "deploy-health", "rollback-or-repair", "security-dependency-compatibility-review", "architecture-review"],
        reviewCapabilities: ["architecture", "security", "testing", "operations"]
      },
      {
        phase: "rc",
        slug: "phase-package",
        title: "RC package and GO/NO-GO decision",
        description: "Produce the release-candidate package and lock the decision before GA may start.",
        layer: "release",
        acceptanceCriteria: [
          "RC package links scope freeze, source closure, deploy health, rollback/repair, security, compatibility, and architecture evidence.",
          "RC decision is GO only when Beta is PASSED and every required RC GoalTarget is DONE.",
          "RC package records there are no open P0/P1 blockers."
        ],
        requiredEvidence: ["rc-release-candidate-report", "rc-phase-decision", "no-p0-p1-blockers"],
        reviewCapabilities: ["architecture", "security", "operations", "release"]
      },
      {
        phase: "ga",
        slug: "stability-observability-docs",
        title: "GA stability, observability, and documentation",
        description: "Prove soak/stability, monitoring, logging, alerting, runbook, release notes, and user documentation readiness.",
        layer: "release",
        acceptanceCriteria: [
          "RC phase package is PASS.",
          `Active soak requirement is ${releaseTarget.requireActiveSoak ? "required" : "tracked"}.`,
          `Succeeded soak seconds target is ${releaseTarget.minSucceededSoakSeconds}.`,
          "Monitoring, logging, alerting, troubleshooting, and runbook evidence are complete.",
          "Release notes and user documentation are complete."
        ],
        requiredEvidence: ["rc-phase-package", "stability-or-soak-evidence", "observability-evidence", "runbook", "release-notes", "user-docs"],
        reviewCapabilities: ["documentation", "operations", "release"]
      },
      {
        phase: "ga",
        slug: "security-architecture-signoff",
        title: "GA security governance and architecture signoff",
        description: "Complete final security governance, dependency review, compatibility check, and architecture signoff.",
        layer: "release",
        acceptanceCriteria: [
          `No high open risks is ${releaseTarget.requireNoHighOpenRisks ? "required" : "tracked"}.`,
          "Security governance and dependency review pass.",
          "Architecture signoff passes.",
          "Final claim does not exceed source/DevOps claim boundary."
        ],
        requiredEvidence: ["security-governance", "dependency-review", "compatibility-check", "architecture-signoff", "claim-boundary-review"],
        reviewCapabilities: ["architecture", "security", "release"]
      },
      {
        phase: "ga",
        slug: "phase-package-final-decision",
        title: "GA package and final release decision",
        description: "Produce the final GA release package, GoalCompletionReport, and product-native ReleaseDecision=GO.",
        layer: "release",
        acceptanceCriteria: [
          "GA release package links every Alpha/Beta/RC/GA phase package.",
          `Release decision target is ${releaseTarget.id}.`,
          "Final ReleaseDecision is GO.",
          "GoalCompletionReport links every required target to evidence and blockers."
        ],
        requiredEvidence: ["ga-release-package", "phase-package-index", "final-release-decision", "goal-completion-report"],
        reviewCapabilities: ["architecture", "release"]
      }
    ];
  let previousId: string | undefined;
  return specs.map((spec) => {
    const standard = maturityStandardTemplate(spec.phase);
    const id = `${goal.id}-${spec.phase}-${spec.slug}`;
    const target: GoalTarget = {
      schema: "evopilot-goal-target/v1",
      id,
      goalId: goal.id,
      projectId: goal.projectId,
      releaseTargetId: goal.releaseTargetId,
      phase: spec.phase,
      standardId: standard.id,
      title: spec.title,
      description: spec.description,
      layer: spec.layer,
      required: true,
      dependencyIds: previousId ? [previousId] : [],
      acceptanceCriteria: uniqueStrings([
        ...spec.acceptanceCriteria,
        ...standard.acceptanceCriteria
      ]),
      requiredEvidence: uniqueStrings([
        ...spec.requiredEvidence,
        ...standard.requiredEvidence
      ]),
      reviewCapabilities: normalizeReviewCapabilities([
        ...(spec.reviewCapabilities ?? []),
        ...standard.reviewCapabilities
      ]),
      status: "PENDING",
      nextAction: "start-target",
      targetVersion: `${goal.releaseTargetId}-${spec.phase}-${spec.slug}`,
      evidence: [
        `planner=${options.plannerMode ?? "ga-maturity-ladder"}`,
        "terminalMaturity=ga",
        `phase=${spec.phase}`,
        `standard=${standard.id}`,
        `maturityStandardSet=${DEFAULT_MATURITY_STANDARD_SET_ID}`,
        `businessObjective=${goal.objective}`,
        "targetEvidencePackageRequired=true",
        ...(options.plannerEvidence ?? [])
      ],
      createdAt: now,
      updatedAt: now
    };
    previousId = id;
    return target;
  });
}

type ReleaseTargetLevel = "experimental" | "alpha" | "beta" | "rc" | "ga" | "custom";

export function releaseTargetLevelForGoal(goal: GlobalGoal, releaseTarget: ReleaseTargetProfile): ReleaseTargetLevel {
  const candidates = [
    releaseTarget.templateId,
    releaseTarget.id,
    goal.releaseTargetId
  ];
  for (const candidate of candidates) {
    const normalized = normalizeReleaseTargetLevel(candidate);
    if (normalized !== "custom") return normalized;
  }
  return "custom";
}

export function normalizeReleaseTargetLevel(value: unknown): ReleaseTargetLevel {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["experimental", "alpha", "beta", "rc", "ga"].includes(normalized)) return normalized as ReleaseTargetLevel;
  return "custom";
}

export function buildGoalCompletionReport(snapshot: GoalSnapshot, actor: string): GoalCompletionReport {
  const matrix = buildGoalEvidenceMatrix(snapshot.goal);
  const required = matrix.filter((row) => row.required);
  const done = required.filter((row) => row.status === "DONE");
  const blocked = matrix.filter((row) => row.status === "BLOCKED");
  const failed = matrix.filter((row) => row.status === "FAILED");
  const status: GoalCompletionReport["status"] = failed.length > 0 ? "FAILED" : blocked.length > 0 ? "BLOCKED" : "COMPLETED";
  return {
    schema: "evopilot-goal-completion-report/v1",
    goalId: snapshot.goal.id,
    projectId: snapshot.goal.projectId,
    releaseTargetId: snapshot.goal.releaseTargetId,
    objective: snapshot.goal.objective,
    status,
    generatedAt: new Date().toISOString(),
    targetSummary: {
      total: matrix.length,
      required: required.length,
      done: done.length,
      blocked: blocked.length,
      failed: failed.length
    },
    phasePackages: buildPhasePackages(snapshot.goal),
    evidenceMatrix: matrix,
    releaseDecision: snapshot.releaseDecision,
    conclusion: status === "COMPLETED"
      ? `GlobalGoal ${snapshot.goal.id} completed by ${actor}; all required GoalTargets are done.`
      : `GlobalGoal ${snapshot.goal.id} is ${status}; inspect blockers before release promotion.`
  };
}

export function sourceReadinessGoalNextAction(value: SourceCredentialReadiness["nextAction"] | "repair-project" | undefined): GoalNextAction {
  if (value === "connect-github-account" || value === "connect-gitlab-account" || value === "configure-token-ref" || value === "repair-project") return value;
  if (value === "use-local-git") return "repair-project";
  return "configure-source-credentials";
}

export function devopsReadinessGoalNextAction(value: ProjectDevopsReadiness["nextAction"] | undefined): GoalNextAction {
  if (value === "connect-github-account" || value === "connect-gitlab-account" || value === "configure-source-credentials" || value === "repair-project") return value;
  if (value === "inspect-ci" || value === "configure-devops") return "configure-devops";
  return "configure-devops";
}

export function llmReadinessGoalNextAction(value: LlmProfileReadiness["nextAction"] | undefined): GoalNextAction {
  if (value === "store-llm-secret" || value === "configure-llm-profile" || value === "repair-llm-provider") return value;
  return "configure-llm";
}

export function finalizeGoalAdvance(input: {
  status: GlobalGoalStatus;
  goal: GlobalGoal;
  snapshot: GoalSnapshot;
  target?: GoalTarget;
  loop?: LoopRun;
  finalReport?: GoalCompletionReport;
  stages: GoalAdvanceResult["stages"];
  nextAction: GoalNextAction;
  evidence: string[];
}): GoalAdvanceResult {
  return {
    schema: "evopilot-goal-advance/v1",
    status: input.status,
    goal: input.goal,
    snapshot: input.snapshot,
    target: input.target,
    loop: input.loop,
    finalReport: input.finalReport,
    stages: input.stages,
    nextAction: input.nextAction,
    evidence: input.evidence,
    createdAt: new Date().toISOString()
  };
}

export function normalizeGlobalGoalStatus(value: unknown): GlobalGoalStatus {
  const status = String(value ?? "DRAFT");
  if (["DRAFT", "PLANNED", "APPROVED", "RUNNING", "WAITING_HUMAN", "BLOCKED", "COMPLETED", "FAILED"].includes(status)) return status as GlobalGoalStatus;
  return "DRAFT";
}

export function normalizeGoalPlanStatus(value: unknown): GoalPlanStatus {
  const status = String(value ?? "MISSING");
  if (["MISSING", "PENDING_APPROVAL", "APPROVED"].includes(status)) return status as GoalPlanStatus;
  return "MISSING";
}

export function normalizeGoalPlanStrategy(value: unknown): GoalPlan["decompositionStrategy"] {
  const strategy = String(value ?? "none");
  if (strategy === "ga-maturity-ladder" || strategy === "manual" || strategy === "none") return strategy;
  return "none";
}

export function normalizeMaturityPhase(value: unknown, fallback: MaturityPhase): MaturityPhase {
  const phase = String(value ?? fallback).trim().toLowerCase();
  if (MATURITY_PHASES.includes(phase as MaturityPhase)) return phase as MaturityPhase;
  return fallback;
}

export function normalizeOptionalMaturityPhase(value: unknown): MaturityPhase | undefined {
  const phase = String(value ?? "").trim().toLowerCase();
  return MATURITY_PHASES.includes(phase as MaturityPhase) ? phase as MaturityPhase : undefined;
}

export function normalizePhaseTargetStatus(value: unknown): PhaseTargetStatus {
  const status = String(value ?? "PENDING");
  if (["PENDING", "RUNNING", "PASSED", "BLOCKED", "FAILED"].includes(status)) return status as PhaseTargetStatus;
  return "PENDING";
}

export function normalizePhaseDecisionStatus(value: unknown): PhaseDecisionStatus {
  const status = String(value ?? "PENDING");
  if (["PENDING", "GO", "NO-GO"].includes(status)) return status as PhaseDecisionStatus;
  return "PENDING";
}

export function normalizeReviewCapability(value: unknown): ReviewCapability | undefined {
  const capability = String(value ?? "").trim().toLowerCase();
  if (["architecture", "security", "testing", "documentation", "operations", "release"].includes(capability)) return capability as ReviewCapability;
  return undefined;
}

export function normalizeReviewCapabilities(value: unknown[]): ReviewCapability[] {
  const result: ReviewCapability[] = [];
  for (const item of value) {
    const capability = normalizeReviewCapability(item);
    if (capability && !result.includes(capability)) result.push(capability);
  }
  return result;
}

export function normalizeGoalTargetStatus(value: unknown): GoalTargetStatus {
  const status = String(value ?? "PENDING");
  if (["PENDING", "READY", "RUNNING", "WAITING_HUMAN", "BLOCKED", "DONE", "FAILED"].includes(status)) return status as GoalTargetStatus;
  return "PENDING";
}

export function normalizeGoalTargetLayer(value: unknown): GoalTargetLayer {
  const layer = String(value ?? "planning");
  if (["planning", "sandbox", "context", "harness", "loop", "release"].includes(layer)) return layer as GoalTargetLayer;
  return "planning";
}

export function normalizeGoalNextAction(value: unknown): GoalNextAction {
  const action = String(value ?? "advance-target");
  if ([
    "plan-goal",
    "approve-plan",
    "start-target",
    "advance-target",
    "resume-loop",
    "human-approval",
    "configure-source-credentials",
    "connect-github-account",
    "connect-gitlab-account",
    "configure-token-ref",
    "repair-project",
    "repair-deploy-target",
    "configure-devops",
    "configure-llm",
    "store-llm-secret",
    "configure-llm-profile",
    "repair-llm-provider",
    "policy-review",
    "release-decision",
    "view-final-report",
    "review-phase-package",
    "done",
    "repair"
  ].includes(action)) return action as GoalNextAction;
  return "advance-target";
}

export function normalizeGoalTimelineEventType(value: unknown): GoalTimelineEvent["type"] {
  const type = String(value ?? "CREATED");
  if (["CREATED", "PLAN_GENERATED", "PLAN_UPDATED", "PLAN_APPROVED", "TARGET_CREATED", "TARGET_ADVANCED", "LOOP_BOUND", "PHASE_PACKAGE_GENERATED", "BLOCKED", "COMPLETED", "REPORT_GENERATED"].includes(type)) return type as GoalTimelineEvent["type"];
  return "CREATED";
}

export function normalizeLoopStopPolicy(input?: Partial<LoopStopPolicy>): LoopStopPolicy {
  return {
    maxIterations: clampPositiveInteger(input?.maxIterations, 3),
    maxDurationSeconds: clampPositiveInteger(input?.maxDurationSeconds, 24 * 60 * 60),
    requireApprovalForRelease: input?.requireApprovalForRelease ?? true,
    stopOnRepeatedFailure: clampPositiveInteger(input?.stopOnRepeatedFailure, 2)
  };
}

export function normalizeLoopRetryPolicy(input?: Partial<LoopRetryPolicy>): LoopRetryPolicy {
  return {
    maxAttemptsPerNode: clampPositiveInteger(input?.maxAttemptsPerNode, 2),
    backoffSeconds: clampPositiveInteger(input?.backoffSeconds, 30),
    circuitBreakerFailures: clampPositiveInteger(input?.circuitBreakerFailures, 2)
  };
}

export function normalizeLoopRunStatus(value: unknown): LoopRunStatus {
  const status = String(value ?? "PENDING");
  if (["PENDING", "RUNNING", "WAITING_APPROVAL", "BLOCKED", "SUCCEEDED", "FAILED", "CANCELLED"].includes(status)) return status as LoopRunStatus;
  return "PENDING";
}

export function normalizeLoopStoreRuntime(input?: Partial<LoopStoreRuntime>): LoopStoreRuntime {
  const envBackend = String(process.env.EVOPILOT_LOOP_STORE_BACKEND ?? "").toLowerCase();
  const backend = normalizeLoopStoreBackend(input?.backend ?? envBackend);
  const dsn = input?.dsn ?? process.env.EVOPILOT_LOOP_STORE_DSN;
  return {
    backend,
    dsn: dsn ? maskDsn(String(dsn)) : undefined,
    durable: true,
    lockProvider: backend === "postgres" ? "postgres-advisory-lock" : backend === "sqlite" ? "sqlite-transaction" : "file-lease",
    recovery: "idempotent-replay"
  };
}

export async function loopStoreReadiness(runtime: LoopStoreRuntime, options: { verifyConnection?: boolean } = {}): Promise<{
  schema: "evopilot-loop-store-readiness/v1";
  status: "READY" | "BLOCKED";
  backend: LoopStoreBackendType;
  postgresRequired: boolean;
  postgresConfigured: boolean;
  postgresReachable?: boolean;
  lockProvider: LoopStoreRuntime["lockProvider"];
  recovery: LoopStoreRuntime["recovery"];
  blockers: string[];
  evidence: string[];
  evaluatedAt: string;
}> {
  const postgresConfigured = runtime.backend === "postgres" && Boolean(runtime.dsn);
  const postgresRequired = true;
  const reachable = postgresConfigured && options.verifyConnection ? await probePostgresDsn(runtime.dsn) : undefined;
  const blockers = !postgresConfigured
    ? ["POSTGRES_LOOP_STORE_NOT_CONFIGURED"]
    : reachable === false
      ? ["POSTGRES_LOOP_STORE_UNREACHABLE"]
      : [];
  return {
    schema: "evopilot-loop-store-readiness/v1",
    status: blockers.length === 0 ? "READY" : "BLOCKED",
    backend: runtime.backend,
    postgresRequired,
    postgresConfigured,
    postgresReachable: reachable,
    lockProvider: runtime.lockProvider,
    recovery: runtime.recovery,
    blockers,
    evidence: [
      `backend=${runtime.backend}`,
      `dsnConfigured=${Boolean(runtime.dsn)}`,
      `lockProvider=${runtime.lockProvider}`,
      `recovery=${runtime.recovery}`,
      reachable === undefined ? `postgresReadiness=${postgresConfigured ? "READY" : "BLOCKED"}` : `postgresReachable=${reachable}`
    ],
    evaluatedAt: new Date().toISOString()
  };
}

export function loopStoreReadinessSnapshot(runtime: LoopStoreRuntime): {
  schema: "evopilot-loop-store-readiness/v1";
  status: "READY" | "BLOCKED";
  backend: LoopStoreBackendType;
  postgresRequired: boolean;
  postgresConfigured: boolean;
  lockProvider: LoopStoreRuntime["lockProvider"];
  recovery: LoopStoreRuntime["recovery"];
  blockers: string[];
  evidence: string[];
  evaluatedAt: string;
} {
  const postgresConfigured = runtime.backend === "postgres" && Boolean(runtime.dsn);
  const blockers = postgresConfigured ? [] : ["POSTGRES_LOOP_STORE_NOT_CONFIGURED"];
  return {
    schema: "evopilot-loop-store-readiness/v1",
    status: blockers.length === 0 ? "READY" : "BLOCKED",
    backend: runtime.backend,
    postgresRequired: true,
    postgresConfigured,
    lockProvider: runtime.lockProvider,
    recovery: runtime.recovery,
    blockers,
    evidence: [
      `backend=${runtime.backend}`,
      `dsnConfigured=${Boolean(runtime.dsn)}`,
      `lockProvider=${runtime.lockProvider}`,
      `recovery=${runtime.recovery}`,
      postgresConfigured ? "postgresReadiness=READY" : "postgresReadiness=BLOCKED"
    ],
    evaluatedAt: new Date().toISOString()
  };
}

export async function probePostgresDsn(maskedDsn: string | undefined): Promise<boolean> {
  const endpoint = parsePostgresEndpoint(maskedDsn);
  if (!endpoint) return false;
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: endpoint.host, port: endpoint.port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 2000);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export function parsePostgresEndpoint(maskedDsn: string | undefined): { host: string; port: number } | undefined {
  if (!maskedDsn) return undefined;
  try {
    const url = new URL(maskedDsn);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return undefined;
    return { host: url.hostname, port: Number(url.port || 5432) };
  } catch {
    return undefined;
  }
}

export function normalizeLoopStoreBackend(value: unknown): LoopStoreBackendType {
  const backend = String(value ?? "file").toLowerCase();
  if (backend === "sqlite" || backend === "postgres") return backend;
  return "file";
}

export function latestSaasGoReleaseDecision(decisions: ReleaseDecision[]): ReleaseDecision | undefined {
  return decisions
    .filter((decision) => decision.status === "GO" && /saas|multi-tenant/i.test(`${decision.id} ${decision.targetId}`))
    .sort((left, right) => Date.parse(left.generatedAt) - Date.parse(right.generatedAt))
    .at(-1);
}

export function currentReleaseDecision(decisions: ReleaseDecision[]): ReleaseDecision | undefined {
  const ordered = [...decisions].sort((left, right) => Date.parse(left.generatedAt) - Date.parse(right.generatedAt));
  return ordered
    .filter((decision) => decision.targetId === "saas-ga")
    .at(-1) ?? ordered.at(-1);
}

export function isOpenBlockedLoop(loop: LoopRun, sourceReleaseRuns: SourceReleaseClosureRun[], latestSaasGoAt?: number): boolean {
  if (loop.status !== "BLOCKED" && loop.status !== "FAILED") return false;
  if (["PROMOTED", "SUCCEEDED"].includes(String(loop.sourceClosure?.closureState))) return false;
  const loopTime = Date.parse(loop.updatedAt ?? loop.createdAt ?? "");
  if (latestSaasGoAt !== undefined && Number.isFinite(latestSaasGoAt) && Number.isFinite(loopTime) && loopTime <= latestSaasGoAt) return false;
  return !sourceReleaseRuns.some((run) => {
    if (!["PROMOTED", "SUCCEEDED"].includes(run.status)) return false;
    const sameLoop = run.loopId === loop.id;
    const sameProject = run.projectId === loop.projectId;
    if (!sameLoop && !sameProject) return false;
    const runTime = Date.parse(run.updatedAt ?? run.createdAt ?? "");
    return Number.isFinite(runTime) && (!Number.isFinite(loopTime) || runTime >= loopTime);
  });
}

export function maskDsn(value: string): string {
  return value.replace(/:\/\/([^:@/]+):([^@/]+)@/, "://$1:[REDACTED]@");
}

export function normalizeLoopSandboxPolicy(input?: Partial<LoopSandboxPolicy> | unknown): LoopSandboxPolicy {
  const value = isRecord(input) ? input : {};
  const runtime = normalizeLoopSandboxRuntime(value.runtime);
  const network = normalizeSandboxNetwork(value.network);
  const credentialScope = normalizeCredentialScope(value.credentialScope);
  const resourceLimits = normalizeSandboxResourceLimits(value.resourceLimits);
  return {
    runtime,
    image: value.image ? String(value.image) : runtime === "docker" ? "evopilot/code-upgrader-sandbox:1.0.0" : undefined,
    namespace: value.namespace ? safeFileName(String(value.namespace)) : runtime === "k8s" ? "evopilot-sandbox" : undefined,
    credentialScope,
    network,
    allowedPaths: Array.isArray(value.allowedPaths) ? value.allowedPaths.map(String) : [".evopilot/runtime-upgrades", "docs/evopilot-upgrades", "src", "test"],
    deniedPaths: Array.isArray(value.deniedPaths) ? value.deniedPaths.map(String) : [".env", ".env.*", "node_modules", ".git"],
    resourceLimits
  };
}

export function evaluateLoopSandboxEnforcement(policy: LoopSandboxPolicy): LoopSandboxEnforcement {
  const evidence = [
    `sandbox.enforcement.runtime=${policy.runtime}`,
    `sandbox.enforcement.network=${policy.network}`,
    `sandbox.enforcement.credentialScope=${policy.credentialScope}`,
    `sandbox.enforcement.allowedPaths=${policy.allowedPaths.join(",")}`,
    `sandbox.enforcement.deniedPaths=${policy.deniedPaths.join(",")}`,
    `sandbox.enforcement.resources=cpu:${policy.resourceLimits.cpu},memory:${policy.resourceLimits.memoryMb}Mi,pids:${policy.resourceLimits.pids}`
  ];
  if (policy.runtime === "host") {
    return {
      status: "POLICY_ONLY",
      runtime: policy.runtime,
      evidence: [...evidence, "sandbox.enforcement.status=POLICY_ONLY", "sandbox.enforcement.reason=host runtime cannot provide hard isolation"],
      restrictions: {
        network: policy.network,
        credentialScope: policy.credentialScope,
        allowedPaths: policy.allowedPaths,
        deniedPaths: policy.deniedPaths
      }
    };
  }
  const missingBoundary = policy.runtime === "docker" && !policy.image
    ? "docker image missing"
    : policy.runtime === "k8s" && !policy.namespace
      ? "k8s namespace missing"
      : "";
  if (missingBoundary) {
    return {
      status: "FAILED",
      runtime: policy.runtime,
      evidence: [...evidence, "sandbox.enforcement.status=FAILED", `sandbox.enforcement.failure=${missingBoundary}`],
      restrictions: {
        network: policy.network,
        credentialScope: policy.credentialScope,
        allowedPaths: policy.allowedPaths,
        deniedPaths: policy.deniedPaths
      }
    };
  }
  return {
    status: "ENFORCED",
    runtime: policy.runtime,
    evidence: [...evidence, "sandbox.enforcement.status=ENFORCED", `sandbox.enforcement.boundary=${policy.runtime === "docker" ? policy.image : policy.namespace}`],
    restrictions: {
      network: policy.network,
      credentialScope: policy.credentialScope,
      allowedPaths: policy.allowedPaths,
      deniedPaths: policy.deniedPaths
    }
  };
}

export function normalizeLoopSandboxRuntime(value: unknown): LoopSandboxRuntimeType {
  const runtime = String(value ?? "host").toLowerCase();
  if (runtime === "docker" || runtime === "k8s") return runtime;
  return "host";
}

export function normalizeLoopSourceClosure(input: unknown, project?: StoredProject, controlPlaneUrl?: string): LoopSourceClosure {
  const value = isRecord(input) ? input : {};
  const repository = project?.repository;
  const provider = normalizeSourceClosureRepositoryProvider(value.repositoryProvider ?? repository?.provider);
  const sourceProjectId = safeFileName(String(value.sourceProjectId ?? project?.id ?? "evopilot"));
  const sourceBranch = String(value.sourceBranch ?? repository?.defaultBranch ?? "main").trim() || "main";
  const sourceUrl = value.sourceUrl
    ? String(value.sourceUrl).trim()
    : repository?.gitUrl ?? sourceUrlFromRepository(repository);
  const sourceRoot = value.sourceRoot
    ? String(value.sourceRoot).trim()
    : repository?.root;
  return {
    sourceProjectId,
    repositoryProvider: provider,
    sourceUrl: sourceUrl || undefined,
    sourceRoot: sourceRoot || undefined,
    sourceBranch,
    controlPlaneUrl: value.controlPlaneUrl ? String(value.controlPlaneUrl).trim() : controlPlaneUrl,
    targetVersion: value.targetVersion ? String(value.targetVersion).trim() : undefined,
    releaseStrategy: normalizeSourceClosureReleaseStrategy(value.releaseStrategy, provider),
    requiredGates: normalizeSourceClosureGates(value.requiredGates),
    deploymentEnvironment: value.deploymentEnvironment ? String(value.deploymentEnvironment).trim() : "production",
    deploymentConnectorId: optionalTrimmedString(value.deploymentConnectorId),
    closureState: normalizeSourceClosureState(value.closureState),
    gateEvidence: normalizeSourceClosureGateEvidence(value.gateEvidence),
    artifacts: normalizeSourceClosureArtifacts(value.artifacts)
  };
}

export function normalizeSourceClosureState(value: unknown): LoopSourceClosureState {
  const state = String(value ?? "PLANNED").trim().toUpperCase();
  if (["PLANNED", "CODE_CHANGED", "PUSHED", "TAGGED", "DEPLOYED", "HEALTH_READY", "HEALTH_FAILED", "ROLLED_BACK", "PROMOTED", "FAILED"].includes(state)) {
    return state as LoopSourceClosureState;
  }
  return "PLANNED";
}

export function normalizeSourceClosureRepositoryProvider(value: unknown): LoopSourceClosure["repositoryProvider"] {
  const provider = String(value ?? "unknown").trim();
  if (provider === "local-git" || provider === "gitlab" || provider === "github") return provider;
  return "unknown";
}

export function normalizeSourceClosureReleaseStrategy(value: unknown, provider: LoopSourceClosure["repositoryProvider"]): LoopSourceClosure["releaseStrategy"] {
  const strategy = String(value ?? "").trim();
  if (strategy === "github-push" || strategy === "gitlab-merge-request" || strategy === "local-git-commit" || strategy === "none") return strategy;
  if (provider === "github") return "github-push";
  if (provider === "gitlab") return "gitlab-merge-request";
  if (provider === "local-git") return "local-git-commit";
  return "none";
}

export function normalizeSourceClosureGates(value: unknown): LoopSourceClosure["requiredGates"] {
  const allowed = new Set<LoopSourceClosureGate>(["code-change", "push", "tag", "deploy", "health-ready"]);
  const gates = Array.isArray(value) ? value.map(String).filter((item): item is LoopSourceClosureGate => allowed.has(item as LoopSourceClosureGate)) : [];
  return gates.length > 0 ? [...new Set(gates)] : ["code-change", "push", "deploy", "health-ready"];
}

export function normalizeSourceClosureGateEvidence(value: unknown): LoopSourceClosure["gateEvidence"] {
  if (!isRecord(value)) return {};
  const evidence: LoopSourceClosure["gateEvidence"] = {};
  for (const gate of ["code-change", "push", "tag", "deploy", "health-ready"] as const) {
    const row = value[gate];
    if (!isRecord(row)) continue;
    const status = String(row.status ?? "PENDING").toUpperCase();
    evidence[gate] = {
      status: status === "PASSED" || status === "FAILED" || status === "SKIPPED" ? status : "PENDING",
      evidence: Array.isArray(row.evidence) ? row.evidence.map(String) : [],
      checkedAt: String(row.checkedAt ?? new Date().toISOString())
    };
  }
  return evidence;
}

export function normalizeSourceClosureArtifacts(value: unknown): LoopSourceClosure["artifacts"] {
  if (!isRecord(value)) return {};
  return {
    branch: optionalTrimmedString(value.branch),
    commitSha: optionalTrimmedString(value.commitSha),
    mergeCommitSha: optionalTrimmedString(value.mergeCommitSha),
    pullRequestUrl: optionalTrimmedString(value.pullRequestUrl),
    pullRequestNumber: optionalNumber(value.pullRequestNumber),
    mergeRequestUrl: optionalTrimmedString(value.mergeRequestUrl),
    mergeRequestIid: optionalNumber(value.mergeRequestIid),
    reviewStatus: normalizeSourceReleaseReviewStatus(value.reviewStatus),
    approvedAt: optionalTrimmedString(value.approvedAt),
    approvedBy: optionalTrimmedString(value.approvedBy),
    rejectedAt: optionalTrimmedString(value.rejectedAt),
    rejectedBy: optionalTrimmedString(value.rejectedBy),
    mergedAt: optionalTrimmedString(value.mergedAt),
    mergedBy: optionalTrimmedString(value.mergedBy),
    policyStatus: normalizeSourceReleasePolicyStatus(value.policyStatus),
    policyBlockers: Array.isArray(value.policyBlockers) ? value.policyBlockers.map(String) : undefined,
    policyEvaluatedAt: optionalTrimmedString(value.policyEvaluatedAt),
    autoMerge: value.autoMerge === true,
    postMergeDeployStatus: normalizeSourceReleasePostMergeDeployStatus(value.postMergeDeployStatus),
    postMergeDeployAt: optionalTrimmedString(value.postMergeDeployAt),
    postMergeDeployBy: optionalTrimmedString(value.postMergeDeployBy),
    tag: optionalTrimmedString(value.tag),
    deploymentConnectorId: optionalTrimmedString(value.deploymentConnectorId),
    deploymentId: optionalTrimmedString(value.deploymentId),
    deploymentUrl: optionalTrimmedString(value.deploymentUrl),
    deployStatusUrl: optionalTrimmedString(value.deployStatusUrl),
    healthUrl: optionalTrimmedString(value.healthUrl),
    readyUrl: optionalTrimmedString(value.readyUrl),
    executedAt: optionalTrimmedString(value.executedAt),
    executedBy: optionalTrimmedString(value.executedBy)
  };
}

export function optionalNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export function normalizeSourceReleaseReviewStatus(value: unknown): SourceReleaseReviewStatus | undefined {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "NOT_REQUIRED" || status === "PENDING" || status === "APPROVED" || status === "REJECTED" || status === "MERGED") return status;
  return undefined;
}

export function normalizeSourceReleasePolicyStatus(value: unknown): SourceReleasePolicyStatus | undefined {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "PASS" || status === "BLOCKED") return status;
  return undefined;
}

export function normalizeSourceReleasePostMergeDeployStatus(value: unknown): SourceReleasePostMergeDeployStatus | undefined {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "NOT_REQUIRED" || status === "SUCCEEDED" || status === "FAILED" || status === "ROLLED_BACK") return status;
  return undefined;
}

export function optionalTrimmedString(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

export function normalizeWorkspaceStatus(value: unknown): WorkspaceRecord["status"] {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "ACTIVE" || status === "BOUNDARY_DRAFT" || status === "SUSPENDED") return status;
  return "ACTIVE";
}

export function normalizeTenantStatus(value: unknown): TenantRecord["status"] {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "ACTIVE" || status === "SUSPENDED") return status;
  return "ACTIVE";
}

export function normalizeWorkspaceMemberRole(value: unknown, fallback: WorkspaceMemberRole): WorkspaceMemberRole {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "owner" || role === "admin" || role === "developer" || role === "viewer") return role;
  return fallback;
}

export function normalizeWorkspaceMemberStatus(value: unknown, fallback: WorkspaceRecord["members"][number]["status"]): WorkspaceRecord["members"][number]["status"] {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "ACTIVE" || status === "INVITED" || status === "SUSPENDED") return status;
  return fallback;
}

export function normalizeWorkspaceQuotas(value: unknown): WorkspaceRecord["quotas"] {
  const source = isRecord(value) ? value : {};
  return {
    loops: clampPositiveInteger(source.loops, 120),
    projects: clampPositiveInteger(source.projects, 20),
    evidenceGb: clampPositiveInteger(source.evidenceGb, 100)
  };
}

export function normalizeSecretKind(value: unknown): SecretKind {
  const kind = String(value ?? "").trim();
  if (kind === "github-app-private-key" || kind === "github-webhook-secret" || kind === "source-token" || kind === "deploy-token" || kind === "llm-key" || kind === "llm-api-key" || kind === "generic") return kind;
  return "generic";
}

export function normalizeLlmProfileProvider(value: unknown): LlmProfileProvider {
  const provider = String(value ?? "").trim();
  return provider === "openai-compatible" ? "openai-compatible" : "openai-compatible";
}

export function normalizeLlmProfileScope(value: unknown, fallback: LlmProfileScope = "workspace"): LlmProfileScope {
  return String(value ?? fallback).trim().toLowerCase() === "user" ? "user" : "workspace";
}

export function normalizeLlmProviderPreset(value: unknown, providerName?: string): LlmProviderPreset {
  const preset = String(value ?? providerName ?? "").trim().toLowerCase();
  if (preset === "glm" || preset === "zhipu" || preset.startsWith("glm-")) return "glm";
  if (preset === "kimi" || preset === "moonshot" || preset.startsWith("kimi")) return "kimi";
  if (preset === "gemma" || preset.includes("gemma")) return "gemma";
  return "custom";
}

export function llmProviderPresetDefaults(preset: LlmProviderPreset): { providerName: string; baseUrl?: string; modelName?: string } {
  if (preset === "glm") return { providerName: "zhipu", baseUrl: "https://open.bigmodel.cn/api/paas/v4", modelName: "glm-5.2" };
  if (preset === "kimi") return { providerName: "moonshot", baseUrl: "https://api.moonshot.cn/v1", modelName: "kimi-k2" };
  if (preset === "gemma") return { providerName: "openai-compatible", modelName: "gemma" };
  return { providerName: "openai-compatible" };
}

export function normalizeTemperature(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(2, parsed));
}

export function normalizeAuthRole(value: unknown, fallback: AuthRole): AuthRole {
  const role = String(value ?? "").trim();
  if (role === "viewer" || role === "operator" || role === "admin") return role;
  return fallback;
}

export function normalizeUserStatus(value: unknown): UserRecord["status"] {
  return String(value ?? "").trim() === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
}

export function canAccessWorkspace(auth: AuthContext, workspace: WorkspaceRecord, required: WorkspaceMemberRole): boolean {
  if (auth.platformAdmin) return true;
  if (workspace.tenantId !== auth.tenantId) return false;
  const member = workspace.members.find((item) => item.id === auth.actor && item.status === "ACTIVE");
  if (!member) return false;
  const rank: Record<WorkspaceMemberRole, number> = { viewer: 1, developer: 2, admin: 3, owner: 4 };
  return rank[member.role] >= rank[required];
}

export function canAccessScopedResource(auth: AuthContext, tenantId: string, workspaceId: string): boolean {
  if (auth.platformAdmin) return true;
  return auth.tenantId === tenantId && auth.workspaceId === workspaceId;
}

export function secretEncryptionKey(): Buffer {
  const material = process.env.EVOPILOT_SECRET_MASTER_KEY || "evopilot-debug-local-secret-master-key";
  return createHash("sha256").update(material).digest();
}

export function encryptSecretValue(value: string): SecretRecord["encryption"] {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

export function decryptSecretValue(secret: SecretRecord): string {
  const decipher = createDecipheriv("aes-256-gcm", secretEncryptionKey(), Buffer.from(secret.encryption.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.encryption.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.encryption.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function maskSecret(secret: SecretRecord): Omit<SecretRecord, "encryption"> & { secretRef: string; valueConfigured: boolean } {
  const { encryption, ...safe } = secret;
  return {
    ...safe,
    secretRef: secret.id,
    valueConfigured: Boolean(encryption?.ciphertext)
  };
}

export function maskLlmProfile(profile: LlmProfileRecord): LlmProfileRecord & { apiKeyConfigured: boolean } {
  return {
    ...profile,
    apiKeyConfigured: Boolean(profile.apiKeyRef)
  };
}

export function normalizeLlmProfileBody(body: any, auth: AuthContext, existing?: LlmProfileRecord): LlmProfileRecord {
  const now = new Date().toISOString();
  const id = safeFileName(optionalTrimmedString(body.id) ?? optionalTrimmedString(body.profileId) ?? optionalTrimmedString(body.name) ?? existing?.id ?? `llm-profile-${Date.now()}`);
  const scope = normalizeLlmProfileScope(body.scope, existing?.scope ?? "workspace");
  const providerPreset = normalizeLlmProviderPreset(body.providerPreset ?? body.preset, body.providerName ?? body.provider ?? existing?.providerName);
  const presetDefaults = llmProviderPresetDefaults(providerPreset);
  const rawBaseUrl = optionalTrimmedString(body.baseUrl) ?? existing?.baseUrl ?? presetDefaults.baseUrl ?? "";
  return {
    schema: "evopilot-llm-profile/v1",
    id,
    tenantId: safeFileName(optionalTrimmedString(body.tenantId) ?? existing?.tenantId ?? auth.tenantId),
    workspaceId: safeFileName(optionalTrimmedString(body.workspaceId) ?? existing?.workspaceId ?? auth.workspaceId),
    scope,
    ownerActor: scope === "user" ? optionalTrimmedString(body.ownerActor) ?? existing?.ownerActor ?? auth.actor : optionalTrimmedString(body.ownerActor) ?? existing?.ownerActor,
    name: optionalTrimmedString(body.name) ?? existing?.name ?? id,
    providerPreset,
    provider: normalizeLlmProfileProvider(body.provider ?? existing?.provider),
    providerName: optionalTrimmedString(body.providerName) ?? (providerPreset === "custom" ? optionalTrimmedString(body.provider) : undefined) ?? existing?.providerName ?? presetDefaults.providerName,
    baseUrl: rawBaseUrl,
    modelName: optionalTrimmedString(body.modelName) ?? optionalTrimmedString(body.model) ?? existing?.modelName ?? presetDefaults.modelName ?? "",
    apiKeyRef: optionalTrimmedString(body.apiKeyRef) ?? optionalTrimmedString(body.tokenRef) ?? existing?.apiKeyRef ?? "",
    status: String(body.status ?? existing?.status ?? "ACTIVE").toUpperCase() === "DISABLED" ? "DISABLED" : "ACTIVE",
    timeoutSeconds: clampPositiveInteger(body.timeoutSeconds, existing?.timeoutSeconds ?? 300),
    maxRetries: clampPositiveInteger(body.maxRetries, existing?.maxRetries ?? 1),
    defaultMaxOutputTokens: clampPositiveInteger(body.defaultMaxOutputTokens, existing?.defaultMaxOutputTokens ?? 8192),
    maxOutputTokens: clampPositiveInteger(body.maxOutputTokens, existing?.maxOutputTokens ?? 12288),
    temperature: normalizeTemperature(body.temperature, existing?.temperature ?? 0.2),
    thinkingType: optionalTrimmedString(body.thinkingType) ?? optionalTrimmedString(body.thinking) ?? existing?.thinkingType ?? "disabled",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastPreflight: existing?.lastPreflight
  };
}

export function resolveLlmProfileApiKey(store: FileStore | undefined, profile: LlmProfileRecord): string | undefined {
  if (!profile.apiKeyRef) return undefined;
  return resolveTokenRef(store, profile.apiKeyRef, profile);
}

export function canReadLlmProfile(auth: AuthContext, profile: LlmProfileRecord): boolean {
  if (!canAccessScopedResource(auth, profile.tenantId, profile.workspaceId)) return false;
  return profile.scope !== "user" || auth.platformAdmin === true || auth.role === "admin" || profile.ownerActor === auth.actor;
}

export function canMutateLlmProfile(auth: AuthContext, profile: LlmProfileRecord): boolean {
  if (!canAccessScopedResource(auth, profile.tenantId, profile.workspaceId)) return false;
  if (profile.scope === "user") return profile.ownerActor === auth.actor || auth.platformAdmin === true || auth.role === "admin";
  return auth.platformAdmin === true || auth.role === "admin";
}

export function canUseLlmProfileForRun(auth: AuthContext, profile: LlmProfileRecord): boolean {
  return canReadLlmProfile(auth, profile);
}

export function canBindProjectDefaultLlmProfile(auth: AuthContext, profile: LlmProfileRecord): boolean {
  return profile.scope === "workspace" && canMutateLlmProfile(auth, profile);
}

export function createLlmClientFromProfile(profile: LlmProfileRecord, apiKey: string): LlmTaskClient | undefined {
  const config = createLlmConfigFromEnv({
    ...process.env,
    EVOPILOT_LLM_PROVIDER_NAME: profile.providerName,
    EVOPILOT_LLM_BASE_URL: profile.baseUrl,
    EVOPILOT_LLM_API_KEY: apiKey,
    EVOPILOT_LLM_MODEL_NAME: profile.modelName,
    EVOPILOT_LLM_TIMEOUT_SECONDS: String(profile.timeoutSeconds),
    EVOPILOT_LLM_MAX_RETRIES: String(profile.maxRetries),
    EVOPILOT_LLM_DEFAULT_MAX_OUTPUT_TOKENS: String(profile.defaultMaxOutputTokens),
    EVOPILOT_LLM_MAX_OUTPUT_TOKENS: String(profile.maxOutputTokens),
    EVOPILOT_LLM_TEMPERATURE: String(profile.temperature),
    EVOPILOT_LLM_THINKING: profile.thinkingType
  });
  return config ? new LlmProxy(config) : undefined;
}

export async function checkLlmProfileReadiness(store: FileStore, profile: LlmProfileRecord | undefined, scope: { tenantId: string; workspaceId: string }, options: { probeProvider?: boolean } = {}): Promise<LlmProfileReadiness> {
  const checkedAt = new Date().toISOString();
  const checks: LlmProfileReadiness["checks"] = [];
  const addCheck = (check: LlmProfileReadiness["checks"][number]) => checks.push(check);
  if (!profile) {
    addCheck({ id: "profile", status: "FAIL", required: true, evidence: ["llmProfile=missing"] });
    return llmProfileReadinessResult({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      source: "missing",
      checks,
      checkedAt,
      provider: undefined,
      model: undefined
    });
  }
  addCheck({
    id: "profile",
    status: profile.status === "ACTIVE" && profile.tenantId === scope.tenantId && profile.workspaceId === scope.workspaceId ? "PASS" : "FAIL",
    required: true,
    evidence: [`profile=${profile.id}`, `status=${profile.status}`, `tenantId=${profile.tenantId}`, `workspaceId=${profile.workspaceId}`]
  });
  addCheck({ id: "provider", status: profile.provider === "openai-compatible" ? "PASS" : "FAIL", required: true, evidence: [`provider=${profile.provider}`, `providerName=${profile.providerName}`] });
  addCheck({ id: "base-url", status: profile.baseUrl ? "PASS" : "FAIL", required: true, evidence: [`baseUrl=${profile.baseUrl || "missing"}`] });
  addCheck({ id: "model", status: profile.modelName ? "PASS" : "FAIL", required: true, evidence: [`model=${profile.modelName || "missing"}`] });
  const apiKey = resolveLlmProfileApiKey(store, profile);
  addCheck({ id: "secret", status: apiKey ? "PASS" : "FAIL", required: true, evidence: [profile.apiKeyRef ? `apiKeyRef=${profile.apiKeyRef}` : "apiKeyRef=missing", apiKey ? "apiKeyResolved=true" : "LLM_API_KEY_REF_NOT_RESOLVED"] });
  if (apiKey && options.probeProvider !== false) {
    const client = createLlmClientFromProfile(profile, apiKey);
    if (client) {
      const result = await client.generate({
        caller: "evopilot-llm-profile-preflight",
        intent: "structured.extraction",
        outputContract: "plain_text",
        maxOutputTokens: 16,
        prompt: "Reply with OK to confirm this EvoPilot LLM profile is reachable.",
        metadata: {
          profileId: profile.id,
          tenantId: profile.tenantId,
          workspaceId: profile.workspaceId
        }
      });
      addCheck({
        id: "provider-call",
        status: result.success ? "PASS" : "FAIL",
        required: true,
        evidence: [
          `requestId=${result.requestId}`,
          `provider=${result.provider ?? profile.providerName}`,
          `model=${result.model ?? profile.modelName}`,
          result.usage ? `totalTokens=${result.usage.totalTokens}` : "totalTokens=0",
          result.success ? "providerCall=ok" : `error=${result.errorCode ?? "LLM_PROVIDER_FAILED"}`
        ]
      });
    } else {
      addCheck({ id: "provider-call", status: "FAIL", required: true, evidence: ["LLM_CLIENT_NOT_CREATED"] });
    }
  } else {
    addCheck({ id: "provider-call", status: "SKIP", required: false, evidence: [apiKey ? "probeProvider=false" : "secret-not-ready"] });
  }
  return llmProfileReadinessResult({
    profile,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    source: "profile",
    checks,
    checkedAt,
    provider: profile.providerName,
    model: profile.modelName
  });
}

export function llmProfileReadinessResult(input: {
  profile?: LlmProfileRecord;
  tenantId: string;
  workspaceId: string;
  source: LlmProfileReadiness["source"];
  checks: LlmProfileReadiness["checks"];
  checkedAt: string;
  provider?: string;
  model?: string;
}): LlmProfileReadiness {
  const blockers = input.checks
    .filter((check) => check.required && check.status === "FAIL")
    .flatMap((check) => check.evidence.map((item) => `${check.id}:${item}`));
  return {
    schema: "evopilot-llm-profile-readiness/v1",
    profileId: input.profile?.id,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    source: input.source,
    status: blockers.length > 0 ? "BLOCKED" : "READY",
    provider: input.provider,
    model: input.model,
    baseUrl: input.profile?.baseUrl,
    apiKeyRef: input.profile?.apiKeyRef,
    checks: input.checks,
    blockers,
    nextAction: blockers.length === 0 ? "run-loop"
      : blockers.some((item) => item.startsWith("secret:")) ? "store-llm-secret"
        : blockers.some((item) => item.startsWith("provider-call:")) ? "repair-llm-provider"
          : "configure-llm-profile",
    checkedAt: input.checkedAt
  };
}

export function defaultLlmReadiness(store: FileStore, scope: { tenantId: string; workspaceId: string }): LlmProfileReadiness {
  const checkedAt = new Date().toISOString();
  const provider = optionalTrimmedString(process.env.EVOPILOT_LLM_PROVIDER_NAME);
  const model = optionalTrimmedString(process.env.EVOPILOT_LLM_MODEL_NAME);
  const configured = store.defaultLlmConfigured();
  const checks: LlmProfileReadiness["checks"] = [
    { id: "profile", status: configured ? "PASS" : "SKIP", required: false, evidence: ["profile=global-default"] },
    { id: "provider", status: provider || configured ? "PASS" : "FAIL", required: store.requireLlm(), evidence: [`provider=${provider ?? "runtime-default"}`] },
    { id: "base-url", status: process.env.EVOPILOT_LLM_BASE_URL || configured ? "PASS" : "FAIL", required: store.requireLlm(), evidence: [process.env.EVOPILOT_LLM_BASE_URL ? "baseUrl=env-configured" : "baseUrl=not-visible"] },
    { id: "model", status: model || configured ? "PASS" : "FAIL", required: store.requireLlm(), evidence: [`model=${model ?? "runtime-default"}`] },
    { id: "secret", status: process.env.EVOPILOT_LLM_API_KEY || configured ? "PASS" : "FAIL", required: store.requireLlm(), evidence: [process.env.EVOPILOT_LLM_API_KEY ? "apiKey=env-configured" : "apiKey=not-visible"] },
    { id: "provider-call", status: "SKIP", required: false, evidence: ["use llm profile preflight for provider-call proof"] }
  ];
  return llmProfileReadinessResult({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    source: configured ? "global-default" : "missing",
    checks,
    checkedAt,
    provider: provider ?? (configured ? "runtime-default" : undefined),
    model: model ?? (configured ? "runtime-default" : undefined)
  });
}

export function resolveLoopLlmSelection(store: FileStore, input: {
  project?: StoredProject;
  tenantId: string;
  workspaceId: string;
  requestedProfileId?: string;
  requireLlm?: boolean;
  actor?: AuthContext;
}): { selection: LoopLlmSelection; readiness: LlmProfileReadiness; profile?: LlmProfileRecord } {
  const now = new Date().toISOString();
  const projectProfileId = input.project?.llm?.profileId;
  const profileId = optionalTrimmedString(input.requestedProfileId) ?? projectProfileId;
  if (profileId) {
    const profile = store.readLlmProfile(profileId);
    const source: LoopLlmSelection["source"] = input.requestedProfileId ? "loop-override" : "project-default";
    if (!profile || profile.tenantId !== input.tenantId || profile.workspaceId !== input.workspaceId || profile.status !== "ACTIVE" || (input.actor && source === "loop-override" && !canUseLlmProfileForRun(input.actor, profile))) {
      const readiness = llmProfileReadinessResult({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        source: "missing",
        checks: [{ id: "profile", status: "FAIL", required: true, evidence: [`profile=${profileId}`, "profile=missing-or-inaccessible-or-forbidden"] }],
        checkedAt: now
      });
      return {
        readiness,
        selection: {
          schema: "evopilot-loop-llm-selection/v1",
          source,
          configured: false,
          required: input.requireLlm === true,
          profileId,
          resolvedAt: now
        }
      };
    }
    const apiKey = resolveLlmProfileApiKey(store, profile);
    const readiness = llmProfileReadinessResult({
      profile,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      source: "profile",
      checks: [
        { id: "profile", status: "PASS", required: true, evidence: [`profile=${profile.id}`, `status=${profile.status}`] },
        { id: "provider", status: "PASS", required: true, evidence: [`provider=${profile.provider}`, `providerName=${profile.providerName}`] },
        { id: "base-url", status: profile.baseUrl ? "PASS" : "FAIL", required: true, evidence: [`baseUrl=${profile.baseUrl || "missing"}`] },
        { id: "model", status: profile.modelName ? "PASS" : "FAIL", required: true, evidence: [`model=${profile.modelName || "missing"}`] },
        { id: "secret", status: apiKey ? "PASS" : "FAIL", required: true, evidence: [profile.apiKeyRef ? `apiKeyRef=${profile.apiKeyRef}` : "apiKeyRef=missing", apiKey ? "apiKeyResolved=true" : "LLM_API_KEY_REF_NOT_RESOLVED"] },
        { id: "provider-call", status: "SKIP", required: false, evidence: ["provider probe skipped during loop creation; run llm profile preflight for live proof"] }
      ],
      checkedAt: now,
      provider: profile.providerName,
      model: profile.modelName
    });
    return {
      readiness,
      profile,
      selection: {
        schema: "evopilot-loop-llm-selection/v1",
        source,
        configured: readiness.status === "READY",
        required: input.requireLlm === true,
        profileId: profile.id,
        provider: profile.providerName,
        model: profile.modelName,
        baseUrl: profile.baseUrl,
        apiKeyRef: profile.apiKeyRef,
        resolvedAt: now
      }
    };
  }
  const readiness = defaultLlmReadiness(store, input);
  return {
    readiness,
    selection: {
      schema: "evopilot-loop-llm-selection/v1",
      source: readiness.status === "READY" ? "global-default" : "none",
      configured: readiness.status === "READY",
      required: input.requireLlm === true,
      provider: readiness.provider,
      model: readiness.model,
      resolvedAt: now
    }
  };
}

export function githubAppInstallationChecks(store: FileStore, tenantId: string, workspaceId: string, installation: Pick<GitHubAppInstallationRecord, "privateKeySecretRef" | "webhookSecretRef" | "repositories" | "permissions">): GitHubAppInstallationRecord["checks"] {
  const privateKey = installation.privateKeySecretRef ? store.readSecret(installation.privateKeySecretRef) : undefined;
  const webhookSecret = installation.webhookSecretRef ? store.readSecret(installation.webhookSecretRef) : undefined;
  const privateKeyReady = privateKey && privateKey.status === "ACTIVE" && privateKey.kind === "github-app-private-key" && privateKey.tenantId === tenantId && privateKey.workspaceId === workspaceId;
  const webhookSecretReady = webhookSecret && webhookSecret.status === "ACTIVE" && webhookSecret.kind === "github-webhook-secret" && webhookSecret.tenantId === tenantId && webhookSecret.workspaceId === workspaceId;
  return [
    {
      id: "private-key-secret-ref",
      status: privateKeyReady ? "PASS" : "FAIL",
      evidence: [installation.privateKeySecretRef ? `secretRef=${installation.privateKeySecretRef}` : "secretRef=missing"]
    },
    {
      id: "webhook-secret-ref",
      status: webhookSecretReady ? "PASS" : "FAIL",
      evidence: [installation.webhookSecretRef ? `secretRef=${installation.webhookSecretRef}` : "secretRef=missing"]
    },
    {
      id: "repository-selection",
      status: installation.repositories.length > 0 ? "PASS" : "FAIL",
      evidence: [`repositories=${installation.repositories.length}`]
    },
    {
      id: "least-privilege-permissions",
      status: Object.keys(installation.permissions).length > 0 ? "PASS" : "FAIL",
      evidence: Object.entries(installation.permissions).map(([key, value]) => `${key}=${value}`)
    }
  ];
}

export function maskGitHubAppInstallation(installation: GitHubAppInstallationRecord): GitHubAppInstallationRecord {
  return installation;
}

export async function buildProjectOnboardingChecklist(args: {
  store: FileStore;
  auth: AuthContext;
  body: Record<string, unknown>;
  profileId: string;
  mode: "plan" | "inspect";
  project?: StoredProject;
}): Promise<ProjectOnboardingChecklist> {
  const generatedAt = new Date().toISOString();
  const tenantId = safeFileName(optionalTrimmedString(args.body.tenantId) ?? args.project?.tenantId ?? args.auth.tenantId);
  const workspaceId = safeFileName(optionalTrimmedString(args.body.workspaceId) ?? args.project?.workspaceId ?? args.auth.workspaceId);
  const workspace = args.store.readWorkspace(workspaceId);
  const repository = args.project?.repository ?? normalizeProjectRepository(args.body);
  const provider = repository?.provider ?? "unknown";
  const projectId = args.project?.id ?? optionalTrimmedString(args.body.id) ?? optionalTrimmedString(args.body.project) ?? onboardingDerivedProjectId(repository, args.body);
  const projectName = args.project?.name ?? optionalTrimmedString(args.body.name) ?? projectId ?? "Project";
  const objective = optionalTrimmedString(args.body.objective);
  const requestedLlmProfileId = llmProfileIdFromPayload(args.body);
  const steps: ProjectOnboardingChecklist["steps"] = [];
  const addStep = (step: ProjectOnboardingChecklist["steps"][number]) => steps.push(step);

  addStep({
    id: "workspace",
    label: "Tenant workspace scope",
    status: workspace && workspace.tenantId === tenantId ? "PASS" : "FAIL",
    required: true,
    evidence: workspace ? [`tenantId=${tenantId}`, `workspaceId=${workspaceId}`, `workspaceStatus=${workspace.status}`] : [`workspaceId=${workspaceId}`, "workspace=missing"],
    nextAction: workspace ? "continue" : "create-workspace"
  });

  let validation: ProjectValidation = args.project?.validation ?? { status: "FAILED", checkedAt: generatedAt, message: "repository=missing" };
  if (!args.project && repository) {
    validation = await validateProjectRepository(repository, args.store, { tenantId, workspaceId });
  }
  addStep({
    id: "repository",
    label: "Repository coordinates",
    status: repository && validation.status === "VERIFIED" ? "PASS" : "FAIL",
    required: true,
    evidence: [
      `provider=${provider}`,
      repository ? onboardingRepositoryEvidence(repository) : "repository=missing",
      `validation=${validation.status}`,
      validation.message
    ],
    nextAction: repository && validation.status === "VERIFIED" ? "continue" : "repair-repository"
  });

  const tokenRef = repository?.credentials?.tokenRef;
  const tokenResolved = tokenRef ? Boolean(resolveTokenRef(args.store, tokenRef, { tenantId, workspaceId })) : false;
  const hasInlineSecret = Boolean(repository?.credentials?.token || repository?.credentials?.password);
  const remoteRepository = provider === "github" || provider === "gitlab";
  const executionMode = repository?.topology?.executionMode ?? "owned-repository";
  const readOnlyPublicMode = executionMode === "read-only-public";
  const principalNextAction = scmPrincipalNextAction(provider);
  const writablePrincipalConfigured = Boolean(tokenRef || hasInlineSecret);
  const writablePrincipalReady = Boolean(tokenResolved || hasInlineSecret);
  addStep({
    id: "secret",
    label: "GitHub/GitLab execution principal",
    status: !remoteRepository ? "SKIP" : readOnlyPublicMode ? writablePrincipalReady ? "PASS" : "WARN" : tokenRef ? tokenResolved ? "PASS" : "FAIL" : hasInlineSecret ? "WARN" : "FAIL",
    required: remoteRepository && !readOnlyPublicMode,
    evidence: !remoteRepository ? ["local-git does not require a server-side source token"]
      : readOnlyPublicMode && !writablePrincipalConfigured ? [`executionMode=${executionMode}`, `${provider}-principal=missing`, "read-only-public cannot claim PR, CI/CD, or release readiness"]
        : tokenRef ? [`tokenRef=${tokenRef}`, `tokenRefResolved=${tokenResolved}`]
          : hasInlineSecret ? ["inlineCredentialConfigured=true", "prefer tokenRef backed by server env or EvoPilot secret vault"] : ["tokenRef=missing", `${provider}-account-or-org-principal=required-for-writeback`],
    nextAction: !remoteRepository || readOnlyPublicMode || writablePrincipalReady ? "continue" : principalNextAction
  });

  const matchingGitHubApp = provider === "github" && repository ? findMatchingGitHubAppInstallation(args.store, tenantId, workspaceId, repository, args.body) : undefined;
  addStep({
    id: "github-app",
    label: "GitHub App installation",
    status: provider !== "github" ? "SKIP" : matchingGitHubApp?.status === "READY" ? "PASS" : "WARN",
    required: false,
    evidence: provider !== "github" ? ["provider is not GitHub"]
      : matchingGitHubApp ? [`installation=${matchingGitHubApp.id}`, `status=${matchingGitHubApp.status}`, `repositories=${matchingGitHubApp.repositories.length}`]
        : ["installation=missing", "GitHub App is optional when a scoped source tokenRef is ready"],
    nextAction: provider === "github" && !matchingGitHubApp && !readOnlyPublicMode ? "install-github-app" : "continue"
  });

  const draftProject: StoredProject | undefined = args.project ?? (projectId && repository ? {
    id: projectId,
    name: projectName,
    profileId: optionalTrimmedString(args.body.profileId) ?? args.profileId,
    tenantId,
    workspaceId,
    repository,
    llm: normalizeProjectLlmBinding(args.body, args.auth.actor),
    validation,
    createdAt: generatedAt,
    updatedAt: generatedAt
  } : undefined);
  addStep({
    id: "project",
    label: args.project ? "Registered project" : "Project registration",
    status: args.project ? "PASS" : draftProject && validation.status === "VERIFIED" ? "PASS" : "FAIL",
    required: true,
    evidence: args.project ? [`projectId=${args.project.id}`, "project=registered"] : draftProject ? [`projectId=${draftProject.id}`, "project=ready-to-register"] : ["projectId=missing"],
    nextAction: args.project ? "continue" : draftProject && validation.status === "VERIFIED" ? "register-project" : "repair-project"
  });

  const sourceCredentials = draftProject ? await checkSourceCredentialReadiness(draftProject, args.store) : undefined;
  addStep({
    id: "source-credentials",
    label: "Source writeback preflight",
    status: sourceCredentials?.status === "READY" ? "PASS" : sourceCredentials?.status === "READ_ONLY" && readOnlyPublicMode ? "WARN" : sourceCredentials?.status === "READ_ONLY" ? "FAIL" : sourceCredentials ? "FAIL" : "SKIP",
    required: Boolean(draftProject) && !readOnlyPublicMode,
    evidence: sourceCredentials ? [`status=${sourceCredentials.status}`, ...sourceCredentials.blockers] : ["project draft unavailable"],
    nextAction: remoteRepository && !readOnlyPublicMode && !writablePrincipalReady ? principalNextAction : sourceCredentials?.nextAction ?? "configure-source-credentials"
  });

  const draftDevops = args.project?.devops ?? (draftProject ? normalizeProjectDevops(args.body, draftProject) : undefined);
  const projectWithDevops: StoredProject | undefined = draftProject ? { ...draftProject, devops: draftDevops } : undefined;
  const devops = projectWithDevops && remoteRepository && !readOnlyPublicMode ? await checkProjectDevopsReadiness(projectWithDevops, args.store) : undefined;
  addStep({
    id: "devops",
    label: "Project DevOps",
    status: !remoteRepository || readOnlyPublicMode ? "SKIP" : devops?.status === "READY" ? "PASS" : devops?.status === "OBSERVABLE" ? "WARN" : "FAIL",
    required: remoteRepository && !readOnlyPublicMode,
    evidence: !remoteRepository ? ["local-git project does not use GitHub Actions or GitLab CI"]
      : readOnlyPublicMode ? ["executionMode=read-only-public", "DevOps release readiness requires fork-validated-pr or upstream-authorized"]
        : devops ? [`status=${devops.status}`, ...devops.blockers] : ["devops=missing"],
    nextAction: !remoteRepository || readOnlyPublicMode ? "continue" : !writablePrincipalReady ? principalNextAction : devops?.nextAction ?? "configure-devops"
  });

  const llmResolution = draftProject ? resolveLoopLlmSelection(args.store, {
    project: draftProject,
    tenantId,
    workspaceId,
    requestedProfileId: requestedLlmProfileId,
    requireLlm: true
  }) : undefined;
  const explicitLlmProfileRequired = remoteRepository && !readOnlyPublicMode;
  const explicitLlmProfileMissing = explicitLlmProfileRequired && !llmResolution?.selection.profileId;
  const llmRequired = Boolean(explicitLlmProfileRequired || args.body.requireLlmReady || requestedLlmProfileId || draftProject?.llm?.required);
  addStep({
    id: "llm",
    label: "Loop LLM profile",
    status: llmResolution?.readiness.status === "READY" && !explicitLlmProfileMissing ? "PASS" : llmRequired ? "FAIL" : "WARN",
    required: llmRequired,
    evidence: llmResolution ? [
      `source=${llmResolution.selection.source}`,
      `profile=${llmResolution.selection.profileId ?? "missing"}`,
      `explicitProfileRequired=${explicitLlmProfileRequired}`,
      `provider=${llmResolution.selection.provider ?? llmResolution.readiness.provider ?? "missing"}`,
      `model=${llmResolution.selection.model ?? llmResolution.readiness.model ?? "missing"}`,
      `readiness=${llmResolution.readiness.status}`,
      ...(explicitLlmProfileMissing ? ["remote-enterprise-loop-requires-explicit-project-or-run-llm-profile"] : []),
      ...llmResolution.readiness.blockers.slice(0, 4)
    ] : ["project draft unavailable"],
    nextAction: llmResolution?.readiness.status === "READY" && !explicitLlmProfileMissing ? "run-loop" : explicitLlmProfileMissing ? "configure-llm-profile" : llmRequired ? llmResolution?.readiness.nextAction ?? "configure-llm-profile" : "configure-llm"
  });

  addStep({
    id: "target",
    label: "Goal/Loop plan handoff",
    status: args.project ? "PASS" : "SKIP",
    required: false,
    evidence: [
      "terminalMaturity=ga",
      "phaseLadder=Alpha -> Beta -> RC -> GA",
      objective ? `objective=${objective}` : "objective=provided-by-target-plan-or-run"
    ],
    nextAction: args.project ? "plan-target" : "register-project"
  });

  const missingInputs = onboardingMissingInputs({ projectId, repository, provider, tokenRef, remoteRepository, draftDevops, llmRequired, llmReadiness: llmResolution?.readiness, llmProfileId: requestedLlmProfileId ?? draftProject?.llm?.profileId });
  const blockers = steps
    .filter((step) => step.required && step.status === "FAIL")
    .flatMap((step) => step.evidence.map((item) => `${step.id}:${item}`));
  const requiredWarnings = steps.filter((step) => step.required && step.status === "WARN");
  const status: ProjectOnboardingChecklist["status"] = blockers.length > 0 ? "BLOCKED"
    : requiredWarnings.length > 0 || missingInputs.length > 0 ? "WAITING_INPUT"
      : args.project ? "READY_TO_RUN" : "READY_TO_ONBOARD";
  const commands = buildProjectOnboardingCommands({
    project: args.project,
    projectId,
    provider,
    repository,
    tokenRef,
    tokenResolved,
    sourceCredentials,
    devops,
    llm: llmResolution?.readiness,
    draftDevops,
    llmProfileId: requestedLlmProfileId ?? draftProject?.llm?.profileId,
    llmRequired,
    objective
  });
  const nextAction = onboardingNextAction(status, steps);

  return {
    schema: "evopilot-project-onboarding-checklist/v1",
    mode: args.mode,
    tenantId,
    workspaceId,
    projectId,
    provider,
    repository: repository ? maskOnboardingRepository(repository, args.store, { tenantId, workspaceId }) : undefined,
    status,
    steps,
    sourceCredentials,
    devops,
    llm: llmResolution?.readiness,
    missingInputs,
    blockers,
    commands,
    nextAction,
    generatedAt
  };
}

export function onboardingDerivedProjectId(repository: ProjectRepositoryRegistration | undefined, body: Record<string, unknown>): string | undefined {
  if (repository?.provider === "github") {
    const id = [repository.owner, repository.repo].filter(Boolean).join("-");
    return id ? safeFileName(id.toLowerCase()) : undefined;
  }
  if (repository?.provider === "gitlab") return safeFileName(String(repository.projectId ?? body.projectId ?? "").toLowerCase());
  if (repository?.provider === "local-git" && repository.root) return safeFileName(path.basename(repository.root).toLowerCase());
  return undefined;
}

export function onboardingRepositoryEvidence(repository: ProjectRepositoryRegistration): string {
  if (repository.provider === "github") return `repo=${[repository.owner, repository.repo].filter(Boolean).join("/") || "missing"}`;
  if (repository.provider === "gitlab") return `projectId=${repository.projectId ?? "missing"}`;
  if (repository.provider === "local-git") return `root=${repository.root ?? "missing"}`;
  return "repository=unknown";
}

export function scmPrincipalNextAction(provider: ProjectRepositoryProvider | "unknown"): "connect-github-account" | "connect-gitlab-account" | "store-secret" {
  if (provider === "github") return "connect-github-account";
  if (provider === "gitlab") return "connect-gitlab-account";
  return "store-secret";
}

export function scmConnectPrincipalNextAction(provider: "github" | "gitlab"): "connect-github-account" | "connect-gitlab-account" {
  return provider === "github" ? "connect-github-account" : "connect-gitlab-account";
}

export function scmPrincipalName(provider: ProjectRepositoryProvider | "unknown"): string {
  if (provider === "github") return "GitHub account, organization, service account, or GitHub App principal";
  if (provider === "gitlab") return "GitLab account, group, deploy token, or service account";
  return "SCM principal";
}

export function scmPrincipalMissingInput(provider: ProjectRepositoryProvider | "unknown"): string {
  if (provider === "github") return "github-account-or-org-principal";
  if (provider === "gitlab") return "gitlab-account-or-group-principal";
  return "scm-principal";
}

export function maskOnboardingRepository(repository: ProjectRepositoryRegistration, store: FileStore, scope: { tenantId: string; workspaceId: string }): ProjectOnboardingChecklist["repository"] {
  const { credentials, ...safe } = repository;
  const credentialMode = credentials?.tokenRef ? "tokenRef"
    : credentials?.token ? "inline-token"
      : credentials?.password ? "password" : "none";
  return {
    ...safe,
    credentialMode,
    tokenRef: credentials?.tokenRef,
    tokenRefResolved: credentials?.tokenRef ? Boolean(resolveTokenRef(store, credentials.tokenRef, scope)) : undefined
  };
}

export function findMatchingGitHubAppInstallation(store: FileStore, tenantId: string, workspaceId: string, repository: ProjectRepositoryRegistration, body: Record<string, unknown>): GitHubAppInstallationRecord | undefined {
  const requestedId = optionalTrimmedString(body.githubAppInstallationId) ?? optionalTrimmedString(body.githubAppId) ?? optionalTrimmedString(body.installationId);
  if (requestedId) {
    const direct = store.readGitHubAppInstallation(requestedId);
    if (direct && direct.tenantId === tenantId && direct.workspaceId === workspaceId) return direct;
  }
  const repoFullName = repository.owner && repository.repo ? `${repository.owner}/${repository.repo}` : undefined;
  return store.listGitHubAppInstallations(tenantId, workspaceId)
    .filter((installation) => installation.status !== "REVOKED")
    .find((installation) => {
      if (repoFullName && installation.repositories.includes(repoFullName)) return true;
      if (repoFullName && installation.repositories.includes("*")) return true;
      return Boolean(repository.owner && installation.account === repository.owner && installation.repositories.length === 0);
    });
}

export function onboardingMissingInputs(args: {
  projectId?: string;
  repository?: ProjectRepositoryRegistration;
  provider: ProjectRepositoryProvider | "unknown";
  tokenRef?: string;
  remoteRepository: boolean;
  draftDevops?: ProjectDevopsConfiguration;
  llmRequired?: boolean;
  llmReadiness?: LlmProfileReadiness;
  llmProfileId?: string;
}): string[] {
  const missing: string[] = [];
  const readOnlyPublicMode = args.repository?.topology?.executionMode === "read-only-public";
  if (!args.projectId) missing.push("project-id");
  if (!args.repository) missing.push("repository");
  if (args.remoteRepository && !readOnlyPublicMode && !args.tokenRef && !args.repository?.credentials?.token && !args.repository?.credentials?.password) {
    missing.push(scmPrincipalMissingInput(args.provider));
    missing.push("server-side-token-ref");
  }
  if ((args.provider === "github" || args.provider === "gitlab") && !readOnlyPublicMode && !args.draftDevops) missing.push("repository-native-devops-contract");
  if (args.llmRequired && !args.llmProfileId) missing.push("llm-profile");
  if (args.llmRequired && args.llmReadiness?.nextAction === "store-llm-secret") missing.push("server-side-llm-api-key-ref");
  return missing;
}

export function buildProjectOnboardingCommands(args: {
  project?: StoredProject;
  projectId?: string;
  provider: ProjectRepositoryProvider | "unknown";
  repository?: ProjectRepositoryRegistration;
  tokenRef?: string;
  tokenResolved: boolean;
  sourceCredentials?: SourceCredentialReadiness;
  devops?: ProjectDevopsReadiness;
  llm?: LlmProfileReadiness;
  draftDevops?: ProjectDevopsConfiguration;
  llmProfileId?: string;
  llmRequired?: boolean;
  objective?: string;
}): ProjectOnboardingChecklist["commands"] {
  const commands: ProjectOnboardingChecklist["commands"] = [];
  const remoteRepository = args.provider === "github" || args.provider === "gitlab";
  const readOnlyPublicMode = args.repository?.topology?.executionMode === "read-only-public";
  const defaultTokenRef = args.tokenRef ?? defaultOnboardingTokenRef(args.provider, args.projectId);
  if (remoteRepository && defaultTokenRef && !args.tokenResolved && !readOnlyPublicMode) {
    commands.push({
      id: scmPrincipalNextAction(args.provider),
      title: `Connect ${args.provider === "github" ? "GitHub" : "GitLab"} execution principal and store writable source token`,
      command: `evopilot secret set --id ${cliArg(defaultTokenRef)} --kind source-token --from-env ${cliArg(defaultTokenRef)} --json`,
      when: `Create or connect a ${scmPrincipalName(args.provider)}, fork third-party upstreams into that principal when needed, export the token, then run this once from a trusted shell.`,
      requiresHuman: true
    });
  }
  if (args.provider === "github" && !readOnlyPublicMode) {
    commands.push({
      id: "optional-github-app",
      title: "Register GitHub App installation metadata",
      command: "evopilot github-app installation set --id <installation-record-id> --installation-id <github-installation-id> --account <org-or-user> --repository <owner/repo> --private-key-secret-ref <secret-ref> --webhook-secret-ref <secret-ref> --permission contents=write --permission pull_requests=write --json",
      when: "Use when the enterprise onboarding path uses GitHub App governance metadata.",
      requiresHuman: true
    });
  }
  if (args.llmRequired && (!args.llmProfileId || args.llm?.status !== "READY")) {
    const profileId = args.llmProfileId ?? "<LLM_PROFILE_ID>";
    const secretRef = args.llm?.apiKeyRef ?? defaultOnboardingLlmSecretRef(profileId);
    if (args.llm?.nextAction === "store-llm-secret") {
      commands.push({
        id: "store-llm-secret",
        title: "Store the LLM API key server-side",
        command: `evopilot secret set --id ${cliArg(secretRef)} --kind llm-key --from-env ${cliArg(secretRef)} --json`,
        when: "Run once from a trusted shell before using this LLM profile.",
        requiresHuman: true
      });
    }
    commands.push({
      id: "configure-llm-profile",
      title: "Create or repair the LLM profile",
      command: `evopilot llm profile set ${cliArg(profileId)} --provider openai-compatible --base-url <openai-compatible-base-url> --model <model-name> --api-key-ref ${cliArg(secretRef)} --json`,
      when: "Run when onboarding requires an explicit public or private LLM profile.",
      requiresHuman: true
    });
  }
  if (!args.project && args.provider !== "unknown" && args.projectId) {
    commands.push({
      id: "project-onboard",
      title: "Register and preflight the project",
      command: buildProjectOnboardCliCommand({
        ...args,
        llmProfileId: args.llmRequired ? args.llmProfileId ?? "<LLM_PROFILE_ID>" : args.llmProfileId
      }),
      when: "Run after repository coordinates and tokenRef are ready."
    });
  }
  if (args.project && args.sourceCredentials && args.sourceCredentials.status !== "READY") {
    commands.push({
      id: "repair-source-credentials",
      title: "Repair source credentials",
      command: `evopilot project credentials set ${cliArg(args.project.id)} --token-ref ${cliArg(defaultTokenRef ?? "<SOURCE_TOKEN_REF>")} --json`,
      when: "Run when source credential preflight is READ_ONLY or BLOCKED."
    });
  }
  if (args.project && remoteRepository && args.devops?.status !== "READY") {
    commands.push({
      id: "repair-devops",
      title: "Configure project DevOps",
      command: buildProjectDevopsCliCommand(args.project.id, args.draftDevops, args.provider),
      when: "Run when GitHub Actions or GitLab CI contract is missing or blocked."
    });
  }
  if (args.project && args.llmRequired && (!args.llmProfileId || args.llm?.status !== "READY")) {
    commands.push({
      id: "repair-project-llm",
      title: "Bind the project to the LLM profile",
      command: `evopilot project llm set ${cliArg(args.project.id)} --profile ${cliArg(args.llmProfileId ?? "<LLM_PROFILE_ID>")} --require-llm-ready --json`,
      when: "Run when project LLM preflight is blocked."
    });
  }
  const targetReady = Boolean(
    args.project
    && args.projectId
    && args.sourceCredentials?.status === "READY"
    && (!remoteRepository || (!readOnlyPublicMode && args.devops?.status === "READY"))
    && (!args.llmRequired || (args.llm?.status === "READY" && args.llmProfileId))
  );
  if (targetReady && args.projectId) {
    const objective = args.objective ?? "<business-goal>";
    commands.push({
      id: "target-plan",
      title: "Generate the Alpha/Beta/RC/GA Goal/Loop plan",
      command: `evopilot target plan --project ${cliArg(args.projectId)} --objective ${cliArg(objective)}${args.llmProfileId ? ` --llm-profile ${cliArg(args.llmProfileId)}` : ""} --json`,
      when: "Run after checklist status is READY_TO_RUN. Review, export, diff, apply, and approve the generated plan before execution."
    });
  }
  return commands;
}

export function defaultOnboardingTokenRef(provider: ProjectRepositoryProvider | "unknown", projectId?: string): string | undefined {
  if (!projectId) return undefined;
  const normalized = projectId.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (provider === "github") return `GITHUB_TOKEN_${normalized}`;
  if (provider === "gitlab") return `GITLAB_TOKEN_${normalized}`;
  return undefined;
}

export function defaultOnboardingLlmSecretRef(profileId: string): string {
  const normalized = profileId.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `LLM_API_KEY_${normalized || "PROFILE"}`;
}

export function llmProfileIdFromPayload(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const nested = isRecord(value.llm) ? value.llm : undefined;
  return optionalTrimmedString(value.llmProfileId)
    ?? optionalTrimmedString(value.llmProfile)
    ?? optionalTrimmedString(nested?.profileId)
    ?? optionalTrimmedString(nested?.llmProfileId);
}

export function buildProjectOnboardCliCommand(args: {
  projectId?: string;
  provider: ProjectRepositoryProvider | "unknown";
  repository?: ProjectRepositoryRegistration;
  tokenRef?: string;
  draftDevops?: ProjectDevopsConfiguration;
  llmProfileId?: string;
}): string {
  const parts = ["evopilot", "project", "onboard", args.provider];
  const readOnlyPublicMode = args.repository?.topology?.executionMode === "read-only-public";
  pushCliOption(parts, "id", args.projectId);
  pushRepositoryCliOptions(parts, args.repository);
  if (!readOnlyPublicMode) pushCliOption(parts, "token-ref", args.tokenRef ?? defaultOnboardingTokenRef(args.provider, args.projectId));
  pushDevopsCliOptions(parts, args.draftDevops);
  pushCliOption(parts, "llm-profile", args.llmProfileId);
  parts.push("--json");
  return parts.join(" ");
}

export function buildProjectDevopsCliCommand(projectId: string, devops: ProjectDevopsConfiguration | undefined, provider: ProjectRepositoryProvider | "unknown"): string {
  const parts = ["evopilot", "project", "devops", "set", cliArg(projectId), "--provider", cliArg(devops?.provider ?? (provider === "gitlab" ? "gitlab-ci" : "github-actions"))];
  pushDevopsCliOptions(parts, devops);
  parts.push("--json");
  return parts.join(" ");
}

export function pushRepositoryCliOptions(parts: string[], repository: ProjectRepositoryRegistration | undefined): void {
  if (!repository) return;
  pushCliOption(parts, "execution-mode", repository.topology?.executionMode);
  if (repository.provider === "github") {
    if (repository.owner && repository.repo) pushCliOption(parts, "repo", `${repository.owner}/${repository.repo}`);
    pushCliOption(parts, "base-url", repository.baseUrl);
  } else if (repository.provider === "gitlab") {
    pushCliOption(parts, "base-url", repository.baseUrl);
    pushCliOption(parts, "project-id", repository.projectId);
  } else if (repository.provider === "local-git") {
    pushCliOption(parts, "root", repository.root);
  }
  pushCliOption(parts, "upstream-repo", repositoryDisplayName(repository.topology?.upstream));
  const workingDisplay = repositoryDisplayName(repository.topology?.working);
  if (workingDisplay && workingDisplay !== repositoryDisplayName(repositoryRefFromRegistration(repository))) pushCliOption(parts, "working-repo", workingDisplay);
  pushCliOption(parts, "git-url", repository.gitUrl);
  pushCliOption(parts, "branch", repository.defaultBranch);
}

export function pushDevopsCliOptions(parts: string[], devops: ProjectDevopsConfiguration | undefined): void {
  if (!devops) return;
  pushCliOption(parts, "source-mode", devops.sourceMode);
  if (devops.bridge?.workflowRepository) {
    pushCliOption(parts, "workflow-provider", devops.bridge.workflowRepository.provider);
    pushCliOption(parts, "workflow-base-url", devops.bridge.workflowRepository.baseUrl);
    pushCliOption(parts, "workflow-repo", repositoryDisplayName(devops.bridge.workflowRepository));
    pushCliOption(parts, "workflow-project-id", devops.bridge.workflowRepository.projectId);
    pushCliOption(parts, "workflow-branch", devops.bridge.workflowRepository.defaultBranch);
    pushCliOption(parts, "gitlab-ref", devops.bridge.gitlabRef);
  }
  pushCliOption(parts, "execution-mode", devops.boundary?.executionMode);
  pushCliOption(parts, "devops-owner", devops.boundary?.owner);
  if (!devops.bridge?.workflowRepository) pushCliOption(parts, "workflow-repo", repositoryDisplayName(devops.boundary?.workflowRepository));
  pushCliOption(parts, "devops-token-ref", devops.tokenRef);
  pushCliOption(parts, "credential-principal", devops.boundary?.expectedPrincipal);
  pushCliOption(parts, "ci-workflow", devops.ci.workflow);
  pushCliOption(parts, "ci-ref", devops.ci.ref);
  for (const check of devops.ci.requiredChecks ?? []) pushCliOption(parts, "ci-required-check", check);
  for (const stage of devops.ci.requiredStages ?? []) pushCliOption(parts, "ci-required-stage", stage);
  for (const job of devops.ci.requiredJobs ?? []) pushCliOption(parts, "ci-required-job", job);
  pushCliOption(parts, "cd-workflow", devops.cd?.workflow);
  pushCliOption(parts, "deploy-environment", devops.cd?.environment);
  for (const stage of devops.cd?.requiredStages ?? []) pushCliOption(parts, "cd-required-stage", stage);
  for (const job of devops.cd?.requiredJobs ?? []) pushCliOption(parts, "cd-required-job", job);
  pushCliOption(parts, "health-url", devops.cd?.healthUrl);
  pushCliOption(parts, "ready-url", devops.cd?.readyUrl);
}

export function pushCliOption(parts: string[], name: string, value?: string): void {
  if (!value) return;
  parts.push(`--${name}`, cliArg(value));
}

export function cliArg(value: string): string {
  if (/^[A-Za-z0-9._~:/@=,+-]+$/.test(value)) return value;
  return `'${shellSingleQuote(value)}'`;
}

export function onboardingNextAction(status: ProjectOnboardingChecklist["status"], steps: ProjectOnboardingChecklist["steps"]): ProjectOnboardingChecklist["nextAction"] {
  if (status === "READY_TO_RUN") return "plan-target";
  const failed = steps.find((step) => step.required && step.status === "FAIL");
  if (failed?.id === "secret" || failed?.id === "source-credentials") {
    if (failed.nextAction === "connect-github-account" || failed.nextAction === "connect-gitlab-account") return failed.nextAction;
    return "store-secret";
  }
  if (failed?.id === "github-app") return "install-github-app";
  if (failed?.id === "project" || failed?.id === "repository" || failed?.id === "workspace") return "repair";
  if (failed?.id === "devops") return "configure-devops";
  if (failed?.id === "llm") {
    if (failed.nextAction === "store-llm-secret") return "store-llm-secret";
    if (failed.nextAction === "repair-llm-provider") return "repair-llm-provider";
    if (failed.nextAction === "configure-llm-profile") return "configure-llm-profile";
    return "configure-llm-profile";
  }
  const projectStep = steps.find((step) => step.id === "project");
  if (projectStep?.nextAction === "register-project") return "register-project";
  return status === "READY_TO_ONBOARD" ? "register-project" : "repair";
}

export function workspaceUsage(store: FileStore, workspace: WorkspaceRecord): WorkspaceUsageProjection {
  const workspaceProjects = store.listProjects().filter((project) => project.tenantId === workspace.tenantId && project.workspaceId === workspace.id);
  const projectsUsed = workspaceProjects.length;
  const workspaceLoops = store.listLoops().filter((loop) => loop.tenantId === workspace.tenantId && loop.workspaceId === workspace.id);
  const loopsUsed = workspaceLoops.length;
  const evidenceBytes = Buffer.byteLength(JSON.stringify(workspaceLoops.flatMap((loop) => loop.evidenceSets)), "utf8");
  const evidenceGbUsed = Number((evidenceBytes / (1024 * 1024 * 1024)).toFixed(6));
  const projectUsage = workspaceProjects
    .map((project) => projectLlmUsageFromLoops(store, project, workspaceLoops.filter((loop) => loop.projectId === project.id)))
    .sort((left, right) => right.llmUsage.totalTokens - left.llmUsage.totalTokens || left.projectId.localeCompare(right.projectId));
  const updatedAt = latestIsoTimestamp([
    workspace.updatedAt,
    ...workspaceLoops.map((loop) => loop.updatedAt),
    ...projectUsage.map((usage) => usage.llmUsage.updatedAt)
  ]);
  const llmUsage = buildLlmUsageSummary(
    `workspace:${workspace.id}`,
    projectUsage.flatMap((usage) => usage.llmUsage.steps),
    updatedAt
  );
  const projectUsageWithShare = projectUsage.map((usage) => ({
    ...usage,
    providerModelUsage: usage.providerModelUsage.map((row) => ({
      ...row,
      shareOfWorkspace: llmUsage.totalTokens > 0 ? Number((row.totalTokens / llmUsage.totalTokens).toFixed(4)) : undefined
    }))
  }));
  const projectsWithLlmUsage = projectUsageWithShare.filter((usage) => usage.llmUsage.calls > 0 || usage.llmUsage.totalTokens > 0).length;
  const loopsWithLlmUsage = workspaceLoops.filter((loop) => buildLoopLlmUsageSummary(loop).calls > 0).length;
  const topProject = projectUsageWithShare.find((usage) => usage.llmUsage.totalTokens > 0);
  return {
    schema: "evopilot-workspace-usage/v1",
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    projects: {
      used: projectsUsed,
      limit: workspace.quotas.projects,
      remaining: Math.max(0, workspace.quotas.projects - projectsUsed)
    },
    loops: {
      used: loopsUsed,
      limit: workspace.quotas.loops,
      remaining: Math.max(0, workspace.quotas.loops - loopsUsed)
    },
    evidenceGb: {
      used: evidenceGbUsed,
      limit: workspace.quotas.evidenceGb,
      remaining: Math.max(0, Number((workspace.quotas.evidenceGb - evidenceGbUsed).toFixed(6)))
    },
    range: {
      label: "all recorded loops"
    },
    projectsWithLlmUsage,
    projectUsageCount: projectUsageWithShare.length,
    loopsWithLlmUsage,
    llmUsage,
    topProject: topProject ? {
      projectId: topProject.projectId,
      projectName: topProject.projectName,
      totalTokens: topProject.llmUsage.totalTokens,
      latestLoopId: topProject.loops.latestLoopId
    } : undefined,
    projectUsage: projectUsageWithShare,
    evidence: [
      `tenant=${workspace.tenantId}`,
      `workspace=${workspace.id}`,
      `projects=${projectsUsed}/${workspace.quotas.projects}`,
      `loops=${loopsUsed}/${workspace.quotas.loops}`,
      `evidenceGb=${evidenceGbUsed}/${workspace.quotas.evidenceGb}`,
      `projectsWithLlmUsage=${projectsWithLlmUsage}`,
      `loopsWithLlmUsage=${loopsWithLlmUsage}`,
      `llm.calls=${llmUsage.calls}`,
      `llm.totalTokens=${llmUsage.totalTokens}`,
      ...(llmUsage.provider ? [`llm.provider=${llmUsage.provider}`] : []),
      ...(llmUsage.model ? [`llm.model=${llmUsage.model}`] : [])
    ],
    evaluatedAt: new Date().toISOString()
  };
}

export function projectLlmUsage(store: FileStore, project: StoredProject): ProjectLlmUsageProjection {
  const loops = store.listLoops()
    .filter((loop) => loop.tenantId === project.tenantId && loop.workspaceId === project.workspaceId && loop.projectId === project.id);
  return projectLlmUsageFromLoops(store, project, loops);
}

function projectLlmUsageFromLoops(store: FileStore, project: StoredProject, loops: LoopRun[]): ProjectLlmUsageProjection {
  const profile = project.llm?.profileId ? store.readLlmProfile(project.llm.profileId) : undefined;
  const updatedAt = latestIsoTimestamp([project.updatedAt, ...loops.map((loop) => loop.updatedAt)]);
  const llmUsage = buildLlmUsageSummary(
    `project:${project.id}`,
    loops.flatMap((loop) => buildLoopLlmUsageSummary(loop).steps),
    updatedAt
  );
  const providerModelUsage = buildProjectProviderModelUsage(llmUsage.steps, loops);
  const latestLoop = loops
    .slice()
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  const latestLoopUsage = latestLoop ? buildLoopLlmUsageSummary(latestLoop) : undefined;
  return {
    schema: "evopilot-project-llm-usage/v1",
    tenantId: project.tenantId,
    workspaceId: project.workspaceId,
    projectId: project.id,
    projectName: project.name,
    configuredLlm: project.llm ? {
      profileId: project.llm.profileId,
      required: project.llm.required,
      provider: profile?.providerName,
      model: profile?.modelName,
      status: profile?.status,
      boundAt: project.llm.boundAt
    } : undefined,
    loops: {
      used: loops.length,
      usedWithLlm: loops.filter((loop) => buildLoopLlmUsageSummary(loop).calls > 0).length,
      latestLoopId: latestLoop?.id,
      latestLoopStatus: latestLoop?.status,
      latestLoopTotalTokens: latestLoopUsage?.totalTokens,
      latestLoopProvider: latestLoopUsage?.provider,
      latestLoopModel: latestLoopUsage?.model
    },
    llmUsage,
    providerModelUsage,
    evidence: [
      `tenant=${project.tenantId}`,
      `workspace=${project.workspaceId}`,
      `project=${project.id}`,
      `loops=${loops.length}`,
      `loopsWithLlm=${loops.filter((loop) => buildLoopLlmUsageSummary(loop).calls > 0).length}`,
      `llm.calls=${llmUsage.calls}`,
      `llm.totalTokens=${llmUsage.totalTokens}`,
      ...(project.llm?.profileId ? [`configured.profile=${project.llm.profileId}`] : []),
      ...(profile?.providerName ? [`configured.provider=${profile.providerName}`] : []),
      ...(profile?.modelName ? [`configured.model=${profile.modelName}`] : []),
      ...(llmUsage.provider ? [`actual.provider=${llmUsage.provider}`] : []),
      ...(llmUsage.model ? [`actual.model=${llmUsage.model}`] : [])
    ],
    evaluatedAt: new Date().toISOString()
  };
}

function buildProjectProviderModelUsage(steps: LlmUsageStepSummary[], loops: LoopRun[]): ProjectProviderModelUsageProjection[] {
  const loopById = new Map(loops.map((loop) => [loop.id, loop]));
  const groups = new Map<string, LlmUsageStepSummary[]>();
  for (const step of steps) {
    const key = JSON.stringify([step.provider ?? "", step.model ?? "", step.llmProfileId ?? ""]);
    groups.set(key, [...(groups.get(key) ?? []), step]);
  }
  return [...groups.values()]
    .map((group) => summarizeProviderModelGroup(group, loopById))
    .sort((left, right) =>
      right.totalTokens - left.totalTokens
      || (left.provider ?? "").localeCompare(right.provider ?? "")
      || (left.model ?? "").localeCompare(right.model ?? "")
      || (left.profileId ?? "").localeCompare(right.profileId ?? "")
    );
}

function summarizeProviderModelGroup(
  group: LlmUsageStepSummary[],
  loopById: Map<string, LoopRun>
): ProjectProviderModelUsageProjection {
  const latestStep = group
    .slice()
    .sort((left, right) => Date.parse(stepTimestamp(right, loopById)) - Date.parse(stepTimestamp(left, loopById)))[0];
  const latestLoop = latestStep ? loopById.get(latestStep.loopId) : undefined;
  const latestLoopTotalTokens = latestStep
    ? group.filter((step) => step.loopId === latestStep.loopId).reduce((sum, step) => sum + step.totalTokens, 0)
    : undefined;
  const total = group.reduce((acc, step) => {
    acc.inputTokens += step.inputTokens;
    acc.outputTokens += step.outputTokens;
    acc.totalTokens += step.totalTokens;
    acc.creditsConsumed += step.creditsConsumed;
    acc.costUsd += step.costUsd;
    return acc;
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, creditsConsumed: 0, costUsd: 0 });
  return {
    provider: latestStep?.provider,
    model: latestStep?.model,
    profileId: latestStep?.llmProfileId,
    calls: group.length,
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    totalTokens: total.totalTokens,
    creditsConsumed: total.creditsConsumed,
    creditUnit: "token",
    costUsd: Number(total.costUsd.toFixed(6)),
    latestLoopId: latestLoop?.id ?? latestStep?.loopId,
    latestLoopStatus: latestLoop?.status,
    latestLoopTotalTokens,
    latestLoopProvider: latestStep?.provider,
    latestLoopModel: latestStep?.model,
    requestId: latestStep?.llmRequestId,
    updatedAt: stepTimestamp(latestStep, loopById)
  };
}

function stepTimestamp(step: LlmUsageStepSummary | undefined, loopById: Map<string, LoopRun>): string {
  if (!step) return new Date(0).toISOString();
  return step.completedAt ?? loopById.get(step.loopId)?.updatedAt ?? new Date(0).toISOString();
}

export function resolveWorkspace(store: FileStore, idOrName: string, auth: AuthContext): WorkspaceRecord | undefined {
  const requested = safeFileName(idOrName);
  const direct = store.readWorkspace(requested);
  if (direct) return direct;
  const visible = store.listWorkspaces(auth.platformAdmin ? undefined : auth.tenantId);
  return visible.find((workspace) => {
    const candidates = [
      workspace.id,
      workspace.name,
      safeFileName(workspace.name),
      workspace.id.replace(/^Test-WS-/, ""),
      safeFileName(workspace.name).replace(/^Test-WS-/, "")
    ];
    return candidates.some((candidate) => candidate === requested || candidate === idOrName);
  });
}

export function historyView(store: FileStore, auth: AuthContext, url: URL) {
  const projectId = optionalTrimmedString(url.searchParams.get("projectId"));
  const targetId = optionalTrimmedString(url.searchParams.get("targetId"));
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? 50)));
  const scoped = (tenantId?: string, workspaceId?: string) => canAccessScopedResource(auth, tenantId ?? auth.tenantId, workspaceId ?? auth.workspaceId);
  const scopedProject = (value?: string) => {
    if (!value) return auth.platformAdmin;
    const project = store.readProject(value);
    if (!project) return auth.platformAdmin;
    return scoped(project.tenantId, project.workspaceId);
  };
  const entries = [
    ...store.listRuns()
      .filter((run) => !projectId || run.evidenceBundle.projectId === projectId)
      .filter((run) => (run as any).tenantId && (run as any).workspaceId
        ? scoped((run as any).tenantId, (run as any).workspaceId)
        : scopedProject(run.evidenceBundle.projectId))
      .flatMap((run) => run.releaseReports.map((release) => ({
        schema: "evopilot-history-entry/v1",
        id: `run-release:${run.id}:${release.id}`,
        type: "run-release",
        projectId: release.projectId,
        title: run.opportunities[0]?.title ?? "Evidence run release",
        status: release.status,
        occurredAt: release.releasedAt ?? run.evidenceBundle.timeWindow.to,
        evidence: release.validationSummary,
        artifact: release.version,
        source: { runId: run.id, releaseReportId: release.id, evidenceBundleId: run.evidenceBundle.id }
      }))),
    ...store.listSourceReleaseClosureRuns()
      .filter((run) => scoped(run.tenantId, run.workspaceId))
      .filter((run) => !projectId || run.projectId === projectId || run.sourceProjectId === projectId)
      .map((run) => ({
        schema: "evopilot-history-entry/v1",
        id: `source-release:${run.id}`,
        type: "source-release",
        tenantId: run.tenantId,
        workspaceId: run.workspaceId,
        projectId: run.projectId,
        title: `Source release ${run.status}`,
        status: run.status,
        occurredAt: run.updatedAt,
        evidence: run.policy.blockers[0] ?? run.nextAction,
        artifact: run.artifacts.tag ?? run.artifacts.pullRequestUrl ?? run.artifacts.mergeRequestUrl ?? run.artifacts.commitSha ?? run.sourceRef.releaseBranch ?? run.id,
        source: { loopId: run.loopId, releaseRunId: run.id, nextAction: run.nextAction }
      })),
    ...store.listReleaseDecisions()
      .filter((decision) => scoped(decision.tenantId, decision.workspaceId))
      .filter((decision) => !projectId || decision.projectId === projectId)
      .filter((decision) => !targetId || decision.targetId === targetId)
      .map((decision) => ({
        schema: "evopilot-history-entry/v1",
        id: `release-decision:${decision.id}`,
        type: "release-decision",
        tenantId: decision.tenantId,
        workspaceId: decision.workspaceId,
        projectId: decision.projectId,
        title: `Release decision ${decision.status}`,
        status: decision.status,
        occurredAt: decision.generatedAt,
        evidence: `${decision.criteria.filter((item) => item.status === "PASS").length}/${decision.criteria.length} criteria passed`,
        artifact: decision.evidenceBundleId,
        source: { releaseDecisionId: decision.id, targetId: decision.targetId }
      })),
    ...store.listCodeUpgradeRuns()
      .filter((run) => !projectId || run.projectId === projectId)
      .filter((run) => scopedProject(run.projectId))
      .map((run) => ({
        schema: "evopilot-history-entry/v1",
        id: `code-upgrade:${run.id}`,
        type: "code-upgrade",
        projectId: run.projectId,
        title: "Code upgrade run",
        status: run.status,
        occurredAt: run.updatedAt,
        evidence: run.failureReason ?? run.error ?? `${run.artifacts.changedFiles?.length ?? 0} changed files`,
        artifact: run.artifacts.pullRequestUrl ?? run.artifacts.commitSha ?? run.artifacts.branchName ?? run.id,
        source: { codeUpgradeRunId: run.id, deliveryPlanId: run.deliveryPlanId }
      })),
    ...store.listAudit()
      .filter((record) => scoped(record.tenantId, record.workspaceId))
      .filter((record) => !projectId || record.target === projectId || String(record.metadata?.projectId ?? "") === projectId)
      .map((record) => ({
        schema: "evopilot-history-entry/v1",
        id: `audit:${record.id}`,
        type: "audit",
        tenantId: record.tenantId,
        workspaceId: record.workspaceId,
        title: record.action,
        status: "RECORDED",
        occurredAt: record.timestamp,
        evidence: record.target,
        artifact: record.actor,
        source: { auditId: record.id, action: record.action }
      }))
  ].sort((left, right) => Date.parse(String(right.occurredAt)) - Date.parse(String(left.occurredAt))).slice(0, limit);
  return {
    schema: "evopilot-history/v1",
    tenantId: auth.tenantId,
    workspaceId: auth.workspaceId,
    filters: { projectId, targetId, limit },
    entries,
    summary: {
      total: entries.length,
      byType: entries.reduce((acc: Record<string, number>, entry) => {
        acc[String(entry.type)] = (acc[String(entry.type)] ?? 0) + 1;
        return acc;
      }, {})
    }
  };
}


export function readJsonDir<T>(dir: string): T[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as T);
}

export function normalizeStringList(value: unknown, fallback: string[]): string[] {
  const list = Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
  return list.length > 0 ? [...new Set(list)] : fallback;
}

export function discoveryAffectedFilesForTarget(targetId: string, project: StoredProject): string[] {
  const repositoryHint = project.repository?.provider === "local-git" ? project.repository.root : project.repository?.gitUrl ?? sourceUrlFromRepository(project.repository);
  const base = repositoryHint ? [`repository:${repositoryHint}`] : [];
  const dashboardRepository = "external-repository:yeliang-wang/evopilot-dashboard";
  const dashboardDocs = "external-docs:yeliang-wang/evopilot-dashboard/docs";
  if (targetId === "tenant-workspace-model") return [...base, "packages/server/src/index.ts", "packages/core/src/index.ts", "docs/architecture/loop-runtime.md", "docs/api/README.md"];
  if (targetId === "workspace-rbac-and-invitation") return [...base, "packages/server/src/index.ts", "docs/api/README.md", dashboardDocs];
  if (targetId === "github-app-onboarding" || targetId === "secret-vault-and-credential-boundary") return [...base, "packages/server/src/index.ts", dashboardRepository, "docs/api/README.md"];
  if (targetId === "project-workspace-ownership" || targetId === "tenant-aware-release-evidence") return [...base, "packages/server/src/index.ts", dashboardRepository, "docs/architecture/loop-runtime.md"];
  if (targetId === "quota-rate-limit-billing-foundation" || targetId === "worker-queue-and-postgres-store") return [...base, "packages/core/src/index.ts", "packages/server/src/index.ts", "docs/architecture/loop-runtime.md"];
  if (targetId === "multi-tenant-security-regression-suite") return [...base, "tests/functional/loop-runtime.test.mjs", "tests/smoke/server-and-dashboard.test.mjs", "docs/api/README.md"];
  if (targetId === "saas-production-observability") return [...base, "packages/server/src/index.ts", "docs/operations/deployment.md", "docs/architecture/loop-runtime.md"];
  if (targetId === "saas-onboarding-dashboard") return [...base, dashboardRepository, dashboardDocs, "docs/guides/dashboard-integration.md"];
  if (targetId === "saas-field-e2e-source-to-ga") return [...base, "tests/e2e/dashboard-product-flow.test.mjs", "evidence/production-soak", dashboardDocs, "docs/guides/user-guide.md"];
  if (targetId === "saas-release-matrix" || targetId === "saas-ga-soak-active") return [...base, "scripts/release-matrix-project-loop.mjs", "scripts/loop-soak.mjs", "evidence/production-soak"];
  if (targetId === "saas-ga-release-decision" || targetId === "announce-saas-multi-tenant-ga-stable") return [...base, "packages/server/src/index.ts", "README.md", "templates/release-readiness-review.md"];
  if (targetId === "discovery-skill-runtime" || targetId === "loop-memory-inbox") return [...base, "packages/server/src/index.ts", dashboardRepository];
  if (targetId === "per-finding-worktree-handoff" || targetId === "adversarial-evaluator-agent") return [...base, "packages/server/src/index.ts", "tests/functional/loop-runtime.test.mjs"];
  return [...base, "docs/architecture/loop-runtime.md", "docs/guides/user-guide.md", dashboardDocs];
}

export function memoryInboxItemFromDiscoveryCandidate(candidate: DiscoverySkillCandidate): LoopMemoryInboxItem {
  const now = new Date().toISOString();
  return {
    schema: "evopilot-loop-memory-inbox-item/v1",
    id: `memory-${safeFileName(candidate.id)}`,
    projectId: candidate.projectId,
    type: "finding",
    title: candidate.title,
    body: candidate.acceptanceCriteria.join("\n"),
    status: "NEW",
    targetId: candidate.targetId,
    provenance: [`discoveryCandidate=${candidate.id}`, `source=${candidate.source}`],
    evidence: candidate.evidence,
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeRecurringCadence(value: unknown): RecurringLoopSchedule["cadence"] {
  const cadence = String(value ?? "manual").toLowerCase();
  if (cadence === "hourly" || cadence === "daily" || cadence === "weekly") return cadence;
  return "manual";
}

export function nextRunAtForCadence(cadence: RecurringLoopSchedule["cadence"], nowIso: string): string {
  const now = Date.parse(nowIso);
  const deltaMs = cadence === "hourly" ? 60 * 60 * 1000 : cadence === "daily" ? 24 * 60 * 60 * 1000 : cadence === "weekly" ? 7 * 24 * 60 * 60 * 1000 : 0;
  return new Date(now + deltaMs).toISOString();
}

export function normalizeMemoryInboxStatus(value: unknown): LoopMemoryInboxItem["status"] {
  const status = String(value ?? "ACCEPTED").trim().toUpperCase();
  if (status === "NEW" || status === "ACCEPTED" || status === "MERGED" || status === "SNOOZED" || status === "REJECTED" || status === "CONVERTED") return status;
  return "ACCEPTED";
}

export function sourceUrlFromRepository(repository?: ProjectRepositoryRegistration): string | undefined {
  if (!repository) return undefined;
  if (repository.gitUrl) return repository.gitUrl;
  if (repository.provider === "github" && repository.owner && repository.repo) return `https://github.com/${repository.owner}/${repository.repo}.git`;
  if (repository.provider === "gitlab" && repository.baseUrl && repository.projectId) return `${repository.baseUrl.replace(/\/+$/, "")}/${repository.projectId}.git`;
  return undefined;
}

export function syntheticEvoPilotProject(): StoredProject {
  const now = new Date().toISOString();
  return {
    id: "evopilot",
    name: "EvoPilot",
    profileId: "evopilot",
    tenantId: DEFAULT_TENANT_ID,
    workspaceId: DEFAULT_WORKSPACE_ID,
    repository: {
      provider: "github",
      owner: "yeliang-wang",
      repo: "evopilot",
      gitUrl: "https://github.com/yeliang-wang/evopilot.git",
      defaultBranch: "main"
    },
    validation: {
      status: "VERIFIED",
      checkedAt: now,
      message: "Synthetic EvoPilot self-project used when no project has been registered yet."
    },
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeSandboxNetwork(value: unknown): LoopSandboxPolicy["network"] {
  const network = String(value ?? "restricted").toLowerCase();
  if (network === "disabled" || network === "enabled") return network;
  return "restricted";
}

export function normalizeCredentialScope(value: unknown): LoopSandboxPolicy["credentialScope"] {
  const scope = String(value ?? "loop").toLowerCase();
  if (scope === "none" || scope === "project") return scope;
  return "loop";
}

export function normalizeSandboxResourceLimits(value: unknown): LoopSandboxPolicy["resourceLimits"] {
  const record = isRecord(value) ? value : {};
  return {
    cpu: String(record.cpu ?? "1"),
    memoryMb: clampPositiveInteger(record.memoryMb ?? record.memoryMB, 2048),
    pids: clampPositiveInteger(record.pids, 256)
  };
}

export function normalizeExecutorCoordinationPlan(graph: ExecutorGraph): ExecutorCoordinationPlan {
  const mode = normalizeLoopExecutorMode(graph.mode);
  return {
    mode,
    sharedContextKeys: ["loopId", "projectId", "objective", "evidence", "artifacts", "sourceClosure", "sandboxEnforcement"],
    nodes: graph.nodes.map((node) => ({
      nodeId: node.id,
      type: node.type,
      adapterId: typeof node.config.adapterId === "string" ? String(node.config.adapterId) : undefined,
      inputSchema: {
        loopId: "string",
        iteration: "number",
        context: "object",
        dependencies: "array"
      },
      outputSchema: {
        status: "SUCCEEDED|FAILED|WAITING_APPROVAL|SKIPPED",
        output: "object",
        evidence: "array",
        failureSignature: "string?"
      },
      dependsOn: graph.edges.filter((edge) => edge.to === node.id).map((edge) => `${edge.from}:${edge.type}${edge.condition ? `?${edge.condition}` : ""}`)
    }))
  };
}

export function normalizeLoopExecutorMode(value: unknown): LoopExecutorMode {
  return String(value ?? "serial").toLowerCase() === "parallel" ? "parallel" : "serial";
}

export function emptyLoopTraceSummary(loopId: string, now: string): LoopTraceSummary {
  return {
    id: `trace-${safeFileName(loopId)}`,
    loopId,
    status: "PENDING",
    currentIteration: 0,
    executorStepCount: 0,
    failedStepCount: 0,
    watchdog: {
      expiredLease: false,
      ageSeconds: 0
    },
    cost: {
      estimatedUsd: 0,
      totalTokens: 0
    },
    llmUsage: emptyLlmUsageSummary(`loop:${loopId}`, now),
    failureSignatures: [],
    updatedAt: now
  };
}

export function buildLoopTraceSummary(loop: LoopRun): LoopTraceSummary {
  const steps = loop.iterations.flatMap((iteration) => iteration.executorSteps ?? []);
  const failureCounts = new Map<string, number>();
  for (const step of steps) {
    if (step.failureSignature) failureCounts.set(step.failureSignature, (failureCounts.get(step.failureSignature) ?? 0) + 1);
  }
  const totalTokens = steps.reduce((sum, step) => sum + Number(step.output.totalTokens ?? step.output.tokens ?? 0), 0);
  const costFromSteps = steps.reduce((sum, step) => sum + Number(step.output.costUsd ?? 0), 0);
  const ageSeconds = Math.max(0, Math.round((Date.now() - Date.parse(loop.createdAt)) / 1000));
  const leaseExpiry = loop.workerLease?.expiresAt ? Date.parse(loop.workerLease.expiresAt) : Number.NaN;
  return {
    id: `trace-${safeFileName(loop.id)}`,
    loopId: loop.id,
    status: loop.status,
    currentIteration: loop.currentIteration,
    executorStepCount: steps.length,
    failedStepCount: steps.filter((step) => step.status === "FAILED").length,
    workerLease: loop.workerLease,
    watchdog: {
      expiredLease: Number.isFinite(leaseExpiry) ? leaseExpiry < Date.now() : false,
      ageSeconds
    },
    cost: {
      estimatedUsd: Number(costFromSteps.toFixed(6)),
      totalTokens
    },
    llmUsage: buildLoopLlmUsageSummary(loop),
    failureSignatures: [...failureCounts.entries()].map(([signature, count]) => ({ signature, count })).sort((left, right) => right.count - left.count),
    updatedAt: loop.updatedAt
  };
}

export function emptyLlmUsageSummary(scope: string, updatedAt = new Date().toISOString()): LlmUsageSummary {
  return {
    schema: "evopilot-llm-usage-summary/v1",
    scope,
    providers: [],
    models: [],
    providerCount: 0,
    modelCount: 0,
    providerModelCount: 0,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    creditsConsumed: 0,
    creditUnit: "token",
    costUsd: 0,
    steps: [],
    updatedAt
  };
}

export function buildLoopLlmUsageSummary(loop: LoopRun): LlmUsageSummary {
  return buildLlmUsageSummary(
    `loop:${loop.id}`,
    loop.iterations.flatMap((iteration) =>
      iteration.executorSteps
        .map((step) => summarizeExecutorStepLlmUsage(loop.id, iteration.index, step))
        .filter((step): step is LlmUsageStepSummary => Boolean(step))
    ),
    loop.updatedAt
  );
}

export function buildGoalLlmUsageSummary(goal: GlobalGoal, loops: LoopRun[]): LlmUsageSummary {
  return buildLlmUsageSummary(
    `goal:${goal.id}`,
    loops.flatMap((loop) => buildLoopLlmUsageSummary(loop).steps),
    goal.updatedAt
  );
}

export function buildLlmUsageSummary(scope: string, steps: LlmUsageStepSummary[], updatedAt = new Date().toISOString()): LlmUsageSummary {
  const providers = uniqueSorted(steps.map((step) => step.provider).filter((value): value is string => Boolean(value)));
  const models = uniqueSorted(steps.map((step) => step.model).filter((value): value is string => Boolean(value)));
  const providerModelCount = new Set(steps.map((step) => JSON.stringify([step.provider ?? "", step.model ?? "", step.llmProfileId ?? ""]))).size;
  const total = steps.reduce((acc, step) => {
    acc.inputTokens += step.inputTokens;
    acc.outputTokens += step.outputTokens;
    acc.totalTokens += step.totalTokens;
    acc.creditsConsumed += step.creditsConsumed;
    acc.costUsd += step.costUsd;
    return acc;
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, creditsConsumed: 0, costUsd: 0 });
  return {
    schema: "evopilot-llm-usage-summary/v1",
    scope,
    provider: providers.length === 1 ? providers[0] : providers.length > 1 ? "mixed" : undefined,
    model: models.length === 1 ? models[0] : models.length > 1 ? "mixed" : undefined,
    providers,
    models,
    providerCount: providers.length,
    modelCount: models.length,
    providerModelCount,
    calls: steps.length,
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    totalTokens: total.totalTokens,
    creditsConsumed: total.creditsConsumed,
    creditUnit: "token",
    costUsd: Number(total.costUsd.toFixed(6)),
    steps,
    updatedAt
  };
}

export function summarizeExecutorStepLlmUsage(loopId: string, iteration: number, step: ExecutorStepResult): LlmUsageStepSummary | undefined {
  const usage = field(step.output, "usage");
  const provider = optionalTrimmedString(field(step.output, "provider")) ?? optionalTrimmedString(field(usage, "provider"));
  const model = optionalTrimmedString(field(step.output, "model")) ?? optionalTrimmedString(field(usage, "model"));
  const inputTokens = usageNumber(field(step.output, "inputTokens") ?? field(usage, "inputTokens"));
  const outputTokens = usageNumber(field(step.output, "outputTokens") ?? field(usage, "outputTokens"));
  const totalTokens = usageNumber(field(step.output, "totalTokens") ?? field(step.output, "tokens") ?? field(usage, "totalTokens"));
  const creditsConsumed = usageNumber(field(step.output, "creditsConsumed") ?? field(usage, "creditsConsumed") ?? totalTokens);
  const costUsd = usageNumber(field(step.output, "costUsd"));
  const hasLlmSignal = step.type === "llm" || Boolean(provider || model || totalTokens > 0 || creditsConsumed > 0);
  if (!hasLlmSignal) return undefined;
  return {
    loopId,
    iteration,
    nodeId: step.nodeId,
    type: step.type,
    status: step.status,
    provider,
    model,
    llmProfileId: optionalTrimmedString(field(step.output, "llmProfileId")),
    llmSource: optionalTrimmedString(field(step.output, "llmSource")),
    inputTokens,
    outputTokens,
    totalTokens,
    creditsConsumed,
    creditUnit: "token",
    costUsd,
    llmRequestId: optionalTrimmedString(field(step.output, "llmRequestId")),
    completedAt: step.completedAt
  };
}

export function usageNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function latestIsoTimestamp(values: Array<string | undefined>, fallback = new Date().toISOString()): string {
  const latest = values
    .map((value) => value ? Date.parse(value) : Number.NaN)
    .filter((value) => Number.isFinite(value))
    .reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY);
  return Number.isFinite(latest) ? new Date(latest).toISOString() : fallback;
}

export function buildLoopSandboxBoundaryProof(loop: LoopRun): LoopSandboxBoundaryProof {
  const policy = loop.sandbox;
  const enforcement = evaluateLoopSandboxEnforcement(policy);
  const workspaceMount = `/workspace/${safeFileName(loop.id)}`;
  const dockerArgs = policy.runtime === "docker" ? [
    "docker",
    "run",
    "--rm",
    "--read-only",
    "--network",
    policy.network === "enabled" ? "bridge" : "none",
    "--cpus",
    policy.resourceLimits.cpu,
    "--memory",
    `${policy.resourceLimits.memoryMb}m`,
    "--pids-limit",
    String(policy.resourceLimits.pids),
    "--env",
    `EVOPILOT_CREDENTIAL_SCOPE=${policy.credentialScope}`,
    "--volume",
    `${workspaceMount}:/workspace:rw`,
    policy.image ?? "missing-image",
    "sh",
    "-lc",
    sandboxBoundaryProbeScript(policy)
  ] : undefined;
  const k8sManifest = policy.runtime === "k8s" ? sandboxK8sManifest(loop, policy) : undefined;
  const checks = sandboxBoundaryChecks(policy, enforcement);
  return {
    schema: "evopilot-loop-sandbox-boundary-proof/v1",
    loopId: loop.id,
    runtime: policy.runtime,
    status: enforcement.status,
    executableBoundary: {
      dockerArgs,
      k8sManifest,
      workspaceMount,
      networkMode: policy.network === "enabled" ? "egress-enabled" : "egress-blocked",
      credentialMode: policy.credentialScope,
      readOnlyRootFilesystem: policy.runtime !== "host",
      resourceLimits: policy.resourceLimits
    },
    checks,
    blocksNonHumanExecutors: enforcement.status === "FAILED",
    createdAt: new Date().toISOString()
  };
}

export function sandboxBoundaryChecks(policy: LoopSandboxPolicy, enforcement: LoopSandboxEnforcement): LoopSandboxBoundaryProof["checks"] {
  return [{
    id: "runtime-boundary",
    status: enforcement.status === "ENFORCED" ? "PASS" : enforcement.status === "FAILED" ? "FAIL" : "WARN",
    evidence: enforcement.evidence
  }, {
    id: "network-boundary",
    status: policy.network === "enabled" ? "WARN" : "PASS",
    evidence: [`network=${policy.network}`, policy.network === "enabled" ? "egress allowed by policy" : "egress blocked or restricted by policy"]
  }, {
    id: "credential-boundary",
    status: policy.credentialScope === "project" ? "WARN" : "PASS",
    evidence: [`credentialScope=${policy.credentialScope}`, policy.credentialScope === "none" ? "no credentials mounted" : `credentials scoped to ${policy.credentialScope}`]
  }, {
    id: "path-boundary",
    status: policy.deniedPaths.length > 0 && policy.allowedPaths.length > 0 ? "PASS" : "FAIL",
    evidence: [`allowedPaths=${policy.allowedPaths.join(",")}`, `deniedPaths=${policy.deniedPaths.join(",")}`]
  }, {
    id: "resource-boundary",
    status: policy.resourceLimits.memoryMb > 0 && policy.resourceLimits.pids > 0 ? "PASS" : "FAIL",
    evidence: [`cpu=${policy.resourceLimits.cpu}`, `memoryMb=${policy.resourceLimits.memoryMb}`, `pids=${policy.resourceLimits.pids}`]
  }];
}

export function sandboxBoundaryProbeScript(policy: LoopSandboxPolicy): string {
  return [
    "set -e",
    "test -d /workspace",
    policy.deniedPaths.map((item) => `test ! -e /workspace/${shellSafePath(item)}`).join(" && ") || "true",
    "echo evopilot-sandbox-boundary-ok"
  ].join("; ");
}

export function sandboxK8sManifest(loop: LoopRun, policy: LoopSandboxPolicy): Record<string, unknown> {
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name: safeFileName(`evopilot-${loop.id}`),
      namespace: policy.namespace
    },
    spec: {
      template: {
        spec: {
          restartPolicy: "Never",
          containers: [{
            name: "executor",
            image: policy.image ?? "evopilot/code-upgrader-sandbox:1.0.0",
            command: ["sh", "-lc", sandboxBoundaryProbeScript(policy)],
            env: [{ name: "EVOPILOT_CREDENTIAL_SCOPE", value: policy.credentialScope }],
            securityContext: {
              readOnlyRootFilesystem: true,
              allowPrivilegeEscalation: false
            },
            resources: {
              limits: {
                cpu: policy.resourceLimits.cpu,
                memory: `${policy.resourceLimits.memoryMb}Mi`
              }
            }
          }]
        }
      }
    }
  };
}

export function buildLoopCheckpoints(loop: LoopRun): LoopCheckpoint[] {
  return loop.iterations.map((iteration) => ({
    schema: "evopilot-loop-checkpoint/v1",
    id: `${safeFileName(loop.id)}-checkpoint-${iteration.index}`,
    loopId: loop.id,
    iterationIndex: iteration.index,
    iterationId: iteration.id,
    status: loop.status,
    decision: iteration.decision,
    contextSnapshot: {
      ...loop.context,
      ...(iteration.contextPatch ?? {}),
      checkpoint: {
        iteration: iteration.index,
        traceId: iteration.traceId,
        evidenceSetId: iteration.evidenceSetId
      }
    },
    contextPatch: iteration.contextPatch,
    evidenceSetId: iteration.evidenceSetId,
    executorOutputs: iteration.executorSteps.map((step) => ({
      nodeId: step.nodeId,
      status: step.status,
      output: step.output,
      failureSignature: step.failureSignature
    })),
    replayable: !["CANCELLED"].includes(loop.status),
    createdAt: iteration.completedAt ?? iteration.startedAt
  }));
}

export function buildLoopReplayDiff(before: LoopRun, after: LoopRun, fromIteration: number, contextPatch: Record<string, unknown>): LoopReplayDiff {
  const previous = before.iterations.find((iteration) => iteration.index === fromIteration);
  const replayed = after.iterations.find((iteration) => iteration.index === fromIteration);
  const nodeIds = new Set([
    ...(previous?.executorSteps ?? []).map((step) => step.nodeId),
    ...(replayed?.executorSteps ?? []).map((step) => step.nodeId)
  ]);
  const executorOutputChanges = [...nodeIds].map((nodeId) => {
    const beforeStep = previous?.executorSteps.find((step) => step.nodeId === nodeId);
    const afterStep = replayed?.executorSteps.find((step) => step.nodeId === nodeId);
    const beforeOutput = beforeStep?.output;
    const afterOutput = afterStep?.output;
    const changed = beforeStep?.status !== afterStep?.status || stableJson(beforeOutput) !== stableJson(afterOutput);
    return {
      nodeId,
      beforeStatus: beforeStep?.status,
      afterStatus: afterStep?.status,
      beforeOutput,
      afterOutput,
      changed
    };
  });
  return {
    schema: "evopilot-loop-replay-diff/v1",
    loopId: before.id,
    fromIteration,
    previousIterationId: previous?.id,
    replayIterationId: replayed?.id,
    contextChangedKeys: Object.keys(contextPatch),
    executorOutputChanges,
    evidence: [
      `fromIteration=${fromIteration}`,
      `contextChangedKeys=${Object.keys(contextPatch).join(",") || "none"}`,
      `changedExecutorOutputs=${executorOutputChanges.filter((item) => item.changed).length}`
    ],
    createdAt: new Date().toISOString()
  };
}

export function buildLoopTraceTree(loop: LoopRun, executorGraph?: ExecutorGraph): LoopTraceTree {
  const graph = executorGraph ?? defaultExecutorGraph();
  const nodes: LoopTraceTree["nodes"] = [{
    id: loop.id,
    type: "loop",
    label: loop.objective,
    status: loop.status,
    evidence: [`project=${loop.projectId}`, `source=${loop.source}`, `sourceClosure=${loop.sourceClosure.closureState}`]
  }];
  const edges: LoopTraceTree["edges"] = [];
  nodes.push({
    id: `${loop.id}:executor-graph`,
    parentId: loop.id,
    type: "executor-graph",
    label: graph.name,
    status: graph.validation.status,
    evidence: executorGraphEvidence(graph)
  });
  edges.push({ from: loop.id, to: `${loop.id}:executor-graph`, type: "guards" });
  for (const iteration of loop.iterations) {
    const iterationNodeId = iteration.id;
    nodes.push({
      id: iterationNodeId,
      parentId: loop.id,
      type: "iteration",
      label: `Iteration ${iteration.index}`,
      status: iteration.decision,
      evidence: [`traceId=${iteration.traceId}`, `evidenceSet=${iteration.evidenceSetId ?? "none"}`]
    });
    edges.push({ from: loop.id, to: iterationNodeId, type: "contains" });
    for (const step of iteration.executorSteps) {
      const stepNodeId = `${iteration.id}:${step.nodeId}`;
      nodes.push({
        id: stepNodeId,
        parentId: iterationNodeId,
        type: "executor-step",
        label: `${step.type}:${step.nodeId}`,
        status: step.status,
        costUsd: Number(step.output.costUsd ?? 0),
        tokens: Number(step.output.totalTokens ?? step.output.tokens ?? 0),
        evidence: step.evidence.slice(0, 12)
      });
      edges.push({ from: iterationNodeId, to: stepNodeId, type: "emits" });
      if (step.failureSignature) edges.push({ from: stepNodeId, to: `failure:${step.failureSignature}`, type: "fails-with" });
    }
    if (iteration.replayOfIterationId) edges.push({ from: iteration.replayOfIterationId, to: iterationNodeId, type: "replays" });
  }
  for (const checkpoint of buildLoopCheckpoints(loop)) {
    nodes.push({
      id: checkpoint.id,
      parentId: checkpoint.iterationId,
      type: "checkpoint",
      label: `Checkpoint ${checkpoint.iterationIndex}`,
      status: checkpoint.decision,
      evidence: [`replayable=${checkpoint.replayable}`, `executorOutputs=${checkpoint.executorOutputs.length}`]
    });
    edges.push({ from: checkpoint.iterationId, to: checkpoint.id, type: "contains" });
  }
  for (const failure of loop.trace.failureSignatures) {
    nodes.push({
      id: `failure:${failure.signature}`,
      parentId: loop.id,
      type: "failure-group",
      label: failure.signature,
      status: String(failure.count),
      evidence: [`count=${failure.count}`]
    });
  }
  if (loop.workerLease) {
    nodes.push({
      id: `${loop.id}:worker-lease`,
      parentId: loop.id,
      type: "worker-lease",
      label: loop.workerLease.workerId,
      status: loop.trace.watchdog.expiredLease ? "EXPIRED" : "ACTIVE",
      evidence: [`heartbeatAt=${loop.workerLease.heartbeatAt}`, `expiresAt=${loop.workerLease.expiresAt}`]
    });
    edges.push({ from: loop.id, to: `${loop.id}:worker-lease`, type: "guards" });
  }
  nodes.push({
    id: `${loop.id}:sandbox-proof`,
    parentId: loop.id,
    type: "sandbox-proof",
    label: `${loop.sandbox.runtime} sandbox`,
    status: loop.sandboxEnforcement.status,
    evidence: loop.sandboxEnforcement.evidence
  });
  edges.push({ from: loop.id, to: `${loop.id}:sandbox-proof`, type: "guards" });
  const replayDiffCount = loop.iterations.filter((iteration) => iteration.replayOfIterationId || iteration.contextPatch).length;
  return {
    schema: "evopilot-loop-trace-tree/v1",
    loopId: loop.id,
    root: {
      id: loop.id,
      label: loop.objective,
      status: loop.status
    },
    nodes,
    edges,
    summary: {
      checkpointCount: loop.iterations.length,
      eventCount: buildLoopStreamEvents(loop, graph).length,
      failureGroupCount: loop.trace.failureSignatures.length,
      replayDiffCount,
      sandboxProofStatus: loop.sandboxEnforcement.status
    },
    createdAt: new Date().toISOString()
  };
}

export function buildLoopStreamEvents(loop: LoopRun, executorGraph?: ExecutorGraph): LoopStreamEvent[] {
  const events: LoopStreamEvent[] = [];
  const graph = executorGraph ?? defaultExecutorGraph();
  events.push({
    schema: "evopilot-loop-stream-event/v1",
    id: `${loop.id}:executor-graph`,
    loopId: loop.id,
    type: "executor-graph",
    timestamp: loop.createdAt,
    label: `Executor graph ${graph.id}`,
    payload: {
      graphId: graph.id,
      name: graph.name,
      mode: graph.mode,
      nodes: graph.nodes.map((node) => ({ id: node.id, type: node.type, name: node.name, visualRole: node.config.visualRole })),
      edges: graph.edges,
      validation: graph.validation,
      capabilities: graph.capabilities,
      evidence: executorGraphEvidence(graph)
    }
  });
  for (const event of loop.timeline) {
    events.push({
      schema: "evopilot-loop-stream-event/v1",
      id: event.id,
      loopId: loop.id,
      type: event.type === "WATCHDOG" ? "watchdog" : "timeline",
      timestamp: event.timestamp,
      label: event.message,
      payload: event.metadata ?? {}
    });
  }
  for (const iteration of loop.iterations) {
    for (const step of iteration.executorSteps) {
      events.push({
        schema: "evopilot-loop-stream-event/v1",
        id: `${iteration.id}:${step.nodeId}`,
        loopId: loop.id,
        type: "executor-step",
        timestamp: step.completedAt ?? step.startedAt,
        label: `${step.type}:${step.nodeId}:${step.status}`,
        payload: {
          iteration: iteration.index,
          status: step.status,
          failureSignature: step.failureSignature,
          costUsd: step.output.costUsd ?? 0,
          tokens: step.output.totalTokens ?? step.output.tokens ?? 0
        }
      });
    }
    if (iteration.replayOfIterationId || iteration.contextPatch) {
      events.push({
        schema: "evopilot-loop-stream-event/v1",
        id: `${iteration.id}:replay-diff`,
        loopId: loop.id,
        type: "replay-diff",
        timestamp: iteration.completedAt ?? iteration.startedAt,
        label: `Replay diff for iteration ${iteration.index}`,
        payload: {
          replayOfIterationId: iteration.replayOfIterationId,
          contextChangedKeys: Object.keys(iteration.contextPatch ?? {})
        }
      });
    }
  }
  for (const checkpoint of buildLoopCheckpoints(loop)) {
    events.push({
      schema: "evopilot-loop-stream-event/v1",
      id: checkpoint.id,
      loopId: loop.id,
      type: "checkpoint",
      timestamp: checkpoint.createdAt,
      label: `Checkpoint ${checkpoint.iterationIndex}`,
      payload: { checkpoint }
    });
  }
  if (loop.workerLease) {
    events.push({
      schema: "evopilot-loop-stream-event/v1",
      id: `${loop.id}:worker-lease`,
      loopId: loop.id,
      type: "worker-lease",
      timestamp: loop.workerLease.heartbeatAt,
      label: `Worker lease ${loop.workerLease.workerId}`,
      payload: { workerLease: loop.workerLease }
    });
  }
  events.push({
    schema: "evopilot-loop-stream-event/v1",
    id: `${loop.id}:cost`,
    loopId: loop.id,
    type: "cost",
    timestamp: loop.trace.updatedAt,
    label: "Loop cost summary",
    payload: loop.trace.cost
  });
  for (const failure of loop.trace.failureSignatures) {
    events.push({
      schema: "evopilot-loop-stream-event/v1",
      id: `${loop.id}:failure:${safeFileName(failure.signature)}`,
      loopId: loop.id,
      type: "failure-group",
      timestamp: loop.trace.updatedAt,
      label: failure.signature,
      payload: failure
    });
  }
  events.push({
    schema: "evopilot-loop-stream-event/v1",
    id: `${loop.id}:sandbox-proof`,
    loopId: loop.id,
    type: "sandbox-proof",
    timestamp: loop.updatedAt,
    label: `Sandbox proof ${loop.sandboxEnforcement.status}`,
    payload: { proof: buildLoopSandboxBoundaryProof(loop) }
  });
  return events.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

export function loopWorkerQueueItem(loop: LoopRun, now: Date): LoopWorkerQueueItem {
  const leaseExpiry = loop.workerLease?.expiresAt ? Date.parse(loop.workerLease.expiresAt) : Number.NaN;
  const leaseExpired = Number.isFinite(leaseExpiry) ? leaseExpiry < now.getTime() : false;
  const duplicateSourceClosureBlocked = loop.sourceClosure.closureState !== "PLANNED" && loop.sourceClosure.closureState !== "FAILED";
  const waitingApproval = loop.status === "WAITING_APPROVAL";
  const terminal = ["FAILED", "CANCELLED"].includes(loop.status) || (loop.status === "SUCCEEDED" && loop.sourceClosure.closureState === "PROMOTED");
  const claimable = !terminal && !waitingApproval && (loop.status === "PENDING" || loop.status === "BLOCKED" || !loop.workerLease || leaseExpired);
  return {
    loopId: loop.id,
    status: loop.status,
    objective: loop.objective,
    currentIteration: loop.currentIteration,
    maxIterations: loop.stopPolicy.maxIterations,
    claimable,
    leaseExpired,
    workerLease: loop.workerLease,
    sideEffectGuard: {
      sourceClosureState: loop.sourceClosure.closureState,
      duplicateSourceClosureBlocked
    },
    nextAction: waitingApproval
      ? "wait-approval"
      : loop.status === "SUCCEEDED" && loop.sourceClosure.closureState !== "PROMOTED"
        ? "source-closure"
        : claimable
          ? "claim"
          : loop.workerLease
            ? "renew"
            : "blocked"
  };
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(isRecord(value) ? value : {}).sort());
}

export function shellSafePath(value: string): string {
  return String(value).replace(/[^a-zA-Z0-9._/-]/g, "");
}

export function hydrateLoopIteration(iteration: any): LoopIteration {
  return {
    ...iteration,
    executorSteps: Array.isArray(iteration.executorSteps) ? iteration.executorSteps : [],
    decision: normalizeLoopDecision(iteration.decision) ?? "CONTINUE",
    rationale: String(iteration.rationale ?? "Legacy iteration hydrated by EvoPilot."),
    traceId: String(iteration.traceId ?? `trace-${safeFileName(String(iteration.loopRunId ?? "loop"))}-${iteration.index ?? 0}`)
  } as LoopIteration;
}

export function clampPositiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

export function normalizeExecutorGraph(value: any): ExecutorGraph {
  if (!isRecord(value)) throw httpError(400, "EXECUTOR_GRAPH_INVALID", "Executor graph must be an object.");
  const now = new Date().toISOString();
  const id = safeFileName(String(value.id ?? `executor-graph-${Date.now()}`));
  const nodes = Array.isArray(value.nodes) ? value.nodes.map(normalizeExecutorNode) : [];
  if (nodes.length === 0) throw httpError(400, "EXECUTOR_GRAPH_NODES_REQUIRED", "Executor graph requires at least one node.");
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(value.edges) ? value.edges : [])
    .map((edge: any) => normalizeExecutorEdge(edge))
    .filter((edge: ExecutorEdge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  const validation = validateExecutorGraph({ nodes, edges, mode: normalizeLoopExecutorMode(value.mode) });
  return {
    schema: "evopilot-executor-graph/v1",
    id,
    name: String(value.name ?? id),
    nodes,
    edges,
    mode: normalizeLoopExecutorMode(value.mode),
    validation,
    capabilities: executorGraphCapabilities(nodes, edges),
    createdAt: String(value.createdAt ?? now),
    updatedAt: now
  };
}

export function normalizeExecutorEdge(value: any): ExecutorEdge {
  const edge = isRecord(value) ? value : {};
  const type = normalizeExecutorEdgeType(edge.type);
  return {
    from: safeFileName(String(edge.from ?? "")),
    to: safeFileName(String(edge.to ?? "")),
    type,
    condition: optionalTrimmedString(edge.condition),
    inputSchemaRef: optionalTrimmedString(edge.inputSchemaRef),
    outputSchemaRef: optionalTrimmedString(edge.outputSchemaRef)
  };
}

export function normalizeExecutorEdgeType(value: unknown): ExecutorEdge["type"] {
  const type = String(value ?? "sequence").trim();
  if (type === "conditional" || type === "fan-out" || type === "fan-in") return type;
  return "sequence";
}

export function validateExecutorGraph(graph: { nodes: ExecutorNode[]; edges: ExecutorEdge[]; mode: LoopExecutorMode }): ExecutorGraph["validation"] {
  const evidence: string[] = [];
  const nodeIds = graph.nodes.map((node) => node.id);
  const duplicateIds = nodeIds.filter((id, index) => nodeIds.indexOf(id) !== index);
  if (duplicateIds.length > 0) evidence.push(`duplicateNodeIds=${[...new Set(duplicateIds)].join(",")}`);
  else evidence.push("nodeIds=unique");
  const danglingEdges = graph.edges.filter((edge) => !nodeIds.includes(edge.from) || !nodeIds.includes(edge.to));
  if (danglingEdges.length > 0) evidence.push(`danglingEdges=${danglingEdges.map((edge) => `${edge.from}->${edge.to}`).join(",")}`);
  else evidence.push("edges=valid");
  const untypedEdges = graph.edges.filter((edge) => !edge.type);
  if (untypedEdges.length > 0) evidence.push(`untypedEdges=${untypedEdges.length}`);
  else evidence.push("edges=typed");
  const schemaEdges = graph.edges.filter((edge) => edge.inputSchemaRef || edge.outputSchemaRef);
  evidence.push(`schemaEdges=${schemaEdges.length}/${graph.edges.length}`);
  const conditionalEdges = graph.edges.filter((edge) => edge.type === "conditional");
  const conditionalWithoutExpression = conditionalEdges.filter((edge) => !edge.condition);
  if (conditionalWithoutExpression.length > 0) evidence.push(`conditionalEdgesMissingCondition=${conditionalWithoutExpression.length}`);
  else evidence.push("conditionalRouting=validated");
  const fanOut = graph.edges.some((edge) => edge.type === "fan-out");
  const fanIn = graph.edges.some((edge) => edge.type === "fan-in");
  evidence.push(`fanOut=${fanOut}`, `fanIn=${fanIn}`, `mode=${graph.mode}`);
  const failed = duplicateIds.length > 0 || danglingEdges.length > 0 || conditionalWithoutExpression.length > 0;
  return {
    status: failed ? "FAILED" : "PASSED",
    evidence
  };
}

export function executorGraphCapabilities(nodes: ExecutorNode[], edges: ExecutorEdge[]): ExecutorGraph["capabilities"] {
  return {
    typedEdges: edges.every((edge) => Boolean(edge.type)),
    conditionalRouting: edges.some((edge) => edge.type === "conditional"),
    fanOutFanIn: edges.some((edge) => edge.type === "fan-out") || edges.some((edge) => edge.type === "fan-in"),
    nestedSubgraphs: nodes.some((node) => Boolean((node.config as Record<string, unknown>).subgraphId)),
    schemaValidation: edges.some((edge) => Boolean(edge.inputSchemaRef || edge.outputSchemaRef)) || nodes.some((node) => Boolean(node.config.inputSchema || node.config.outputSchema))
  };
}

export function executorGraphEvidence(graph: ExecutorGraph): string[] {
  return [
    `executorGraph=${graph.id}`,
    `graphMode=${graph.mode}`,
    `graphNodes=${graph.nodes.length}`,
    `graphEdges=${graph.edges.length}`,
    `graphValidation=${graph.validation.status}`,
    `typedEdges=${graph.capabilities.typedEdges}`,
    `conditionalRouting=${graph.capabilities.conditionalRouting}`,
    `fanOutFanIn=${graph.capabilities.fanOutFanIn}`,
    `nestedSubgraphs=${graph.capabilities.nestedSubgraphs}`,
    `schemaValidation=${graph.capabilities.schemaValidation}`,
    ...graph.validation.evidence.map((item) => `graph.${item}`)
  ];
}

export function normalizeLoopArtifact(value: unknown): LoopArtifact {
  const item = isRecord(value) ? value : {};
  return loopArtifact(
    normalizeLoopArtifactType(item.type),
    String(item.label ?? "Loop artifact"),
    item.path ? String(item.path) : undefined,
    item.url ? String(item.url) : undefined
  );
}

export function normalizeLoopArtifactType(value: unknown): LoopArtifact["type"] {
  const type = String(value ?? "generic");
  if (["plan", "diff", "ci-log", "report", "approval", "generic"].includes(type)) return type as LoopArtifact["type"];
  return "generic";
}

export function normalizeExecutorNode(value: any): ExecutorNode {
  if (!isRecord(value)) throw httpError(400, "EXECUTOR_NODE_INVALID", "Executor graph node must be an object.");
  const type = normalizeExecutorNodeType(value.type);
  const id = safeFileName(String(value.id ?? `${type}-${Date.now()}`));
  return {
    id,
    type,
    name: String(value.name ?? id),
    config: isRecord(value.config) ? value.config : {}
  };
}

export function normalizeExecutorNodeType(value: unknown): ExecutorNodeType {
  const type = String(value ?? "");
  if (["llm", "code-upgrader", "ci", "validator", "approval", "release-action"].includes(type)) return type as ExecutorNodeType;
  throw httpError(400, "EXECUTOR_NODE_TYPE_INVALID", `Unsupported executor node type: ${type}`);
}

export function normalizeLoopTriggerSource(value: unknown): LoopTriggerSource {
  const source = String(value ?? "api");
  if (["api", "im", "schedule", "runtime-signal", "release-target", "evolution-batch"].includes(source)) return source as LoopTriggerSource;
  return "api";
}

export function normalizeLoopDecision(value: unknown): LoopDecision | undefined {
  const decision = String(value ?? "").toUpperCase();
  if (["CONTINUE", "REPAIR", "BLOCK", "WAIT_APPROVAL", "SUCCEED", "FAIL"].includes(decision)) return decision as LoopDecision;
  return undefined;
}

export async function executeLoopSourceClosure(store: FileStore, loopId: string, actor: string, body: unknown): Promise<{ loop: LoopRun; releaseRun: SourceReleaseClosureRun } | undefined> {
  const loop = store.readLoop(loopId);
  if (!loop) return undefined;
  const project = store.readProject(loop.sourceClosure.sourceProjectId) ?? store.readProject(loop.projectId);
  const request = isRecord(body) ? body : {};
  const now = new Date().toISOString();
  const files = normalizeSourceClosureFiles(request.files);
  const branch = optionalTrimmedString(request.branchName) ?? optionalTrimmedString(request.branch) ?? defaultClosureBranch(loop);
  const commitMessage = optionalTrimmedString(request.commitMessage) ?? `EvoPilot source closure for ${loop.id}`;
  const tagName = optionalTrimmedString(request.tagName) ?? (loop.sourceClosure.targetVersion ? `v${loop.sourceClosure.targetVersion.replace(/^v/, "")}` : undefined);
  const deployConnectorId = optionalTrimmedString(request.deployConnectorId) ?? optionalTrimmedString(request.deploymentConnectorId) ?? loop.sourceClosure.deploymentConnectorId;
  let deploymentUrl = optionalTrimmedString(request.deploymentUrl) ?? loop.sourceClosure.controlPlaneUrl;
  let healthUrl = optionalTrimmedString(request.healthUrl) ?? (deploymentUrl ? `${deploymentUrl.replace(/\/+$/, "")}/health` : undefined);
  let readyUrl = optionalTrimmedString(request.readyUrl) ?? (deploymentUrl ? `${deploymentUrl.replace(/\/+$/, "")}/ready` : undefined);
  const gateEvidence: LoopSourceClosure["gateEvidence"] = { ...loop.sourceClosure.gateEvidence };
  const artifacts: LoopSourceClosure["artifacts"] = {
    ...loop.sourceClosure.artifacts,
    branch,
    deploymentConnectorId: deployConnectorId,
    deploymentUrl,
    healthUrl,
    readyUrl,
    executedAt: now,
    executedBy: actor
  };
  let closureState: LoopSourceClosureState = "PLANNED";
  const evidence: string[] = [
    `sourceClosure.provider=${loop.sourceClosure.repositoryProvider}`,
    `sourceClosure.branch=${loop.sourceClosure.sourceBranch}`,
    `sourceClosure.releaseBranch=${branch}`,
    ...(optionalTrimmedString(request.repairOfReleaseRunId) ? [`sourceClosure.repairOfReleaseRunId=${optionalTrimmedString(request.repairOfReleaseRunId)}`] : [])
  ];
  let releaseRun = store.writeSourceReleaseClosureRun(buildSourceReleaseClosureRun({
    ...loop,
    sourceClosure: normalizeLoopSourceClosure({
      ...loop.sourceClosure,
      deploymentConnectorId: deployConnectorId,
      gateEvidence,
      artifacts
    }, project, loop.controlPlaneUrl)
  }, actor));

  try {
    if (loop.sourceClosure.repositoryProvider === "github") {
      if (!project?.repository || project.repository.provider !== "github") throw httpError(409, "SOURCE_CLOSURE_PROJECT_NOT_GITHUB", "Loop source project is not a GitHub repository.");
      const token = repositoryToken(store, project.repository, project);
      if (!token) throw httpError(409, "SOURCE_CLOSURE_TOKEN_REQUIRED", "GitHub source closure requires a project token or tokenRef.");
      if (!project.repository.owner || !project.repository.repo) throw httpError(409, "SOURCE_CLOSURE_GITHUB_COORDINATES_REQUIRED", "GitHub source closure requires owner and repo.");
      const adapter = new GitHubHttpAdapter({
        apiBaseUrl: project.repository.baseUrl,
        owner: project.repository.owner,
        repo: project.repository.repo,
        token
      });
      const baseRef = await adapter.getRef(`heads/${loop.sourceClosure.sourceBranch}`);
      await ignoreAlreadyExists(() => adapter.createBranch(branch, baseRef.sha));
      artifacts.commitSha = baseRef.sha;
      markGate(gateEvidence, "push", "PASSED", [`branch=${branch}`, `baseSha=${baseRef.sha}`], now);
      evidence.push(`github.branch=${branch}`, `github.baseSha=${baseRef.sha}`);
      for (const file of files) {
        const written = await adapter.upsertFile({ ...file, branch, message: commitMessage });
        artifacts.commitSha = written.commitSha || artifacts.commitSha;
        if (written.htmlUrl) evidence.push(`github.fileUrl=${written.htmlUrl}`);
      }
      if (files.length > 0) {
        closureState = "CODE_CHANGED";
        markGate(gateEvidence, "code-change", "PASSED", files.map((file) => `file=${file.path}`), now);
      }
      if (request.createReviewRequest !== false) {
        const prDraft = {
          title: optionalTrimmedString(request.pullRequestTitle) ?? `EvoPilot source closure: ${loop.objective}`,
          body: optionalTrimmedString(request.pullRequestBody) ?? `Loop ${loop.id} source-to-production closure evidence.`,
          head: branch,
          base: loop.sourceClosure.sourceBranch
        };
        const pr = await createOrReuseGitHubPullRequest(adapter, prDraft);
        artifacts.pullRequestUrl = pr.htmlUrl;
        artifacts.pullRequestNumber = pr.number;
        artifacts.reviewStatus = "PENDING";
        evidence.push(
          `github.pullRequest=${pr.htmlUrl ?? pr.number}`,
          ...(pr.reused ? ["github.pullRequestReused=true", ...(pr.evidence ?? [])] : [])
        );
      } else {
        artifacts.reviewStatus = "NOT_REQUIRED";
      }
      if (tagName && loop.sourceClosure.requiredGates.includes("tag")) {
        await ignoreAlreadyExists(() => adapter.createTag(tagName, artifacts.commitSha ?? baseRef.sha));
        artifacts.tag = tagName;
        closureState = "TAGGED";
        markGate(gateEvidence, "tag", "PASSED", [`tag=${tagName}`, `target=${artifacts.commitSha ?? baseRef.sha}`], now);
      }
    } else if (loop.sourceClosure.repositoryProvider === "gitlab") {
      if (!project?.repository || project.repository.provider !== "gitlab") throw httpError(409, "SOURCE_CLOSURE_PROJECT_NOT_GITLAB", "Loop source project is not a GitLab repository.");
      const token = repositoryToken(store, project.repository, project);
      if (!token) throw httpError(409, "SOURCE_CLOSURE_TOKEN_REQUIRED", "GitLab source closure requires a project token or tokenRef.");
      if (!project.repository.baseUrl || !project.repository.projectId) throw httpError(409, "SOURCE_CLOSURE_GITLAB_COORDINATES_REQUIRED", "GitLab source closure requires baseUrl and projectId.");
      const adapter = new GitLabHttpAdapter({
        baseUrl: project.repository.baseUrl,
        projectId: project.repository.projectId,
        token
      });
      await ignoreAlreadyExists(() => adapter.createBranch(branch, loop.sourceClosure.sourceBranch));
      markGate(gateEvidence, "push", "PASSED", [`branch=${branch}`, `base=${loop.sourceClosure.sourceBranch}`], now);
      evidence.push(`gitlab.branch=${branch}`);
      if (files.length > 0) {
        const commit = await adapter.commitFiles({
          branch,
          message: commitMessage,
          actions: files.map((file) => ({ action: "create", filePath: file.path, content: file.content }))
        });
        artifacts.commitSha = commit.id;
        closureState = "CODE_CHANGED";
        markGate(gateEvidence, "code-change", "PASSED", files.map((file) => `file=${file.path}`), now);
        evidence.push(`gitlab.commit=${commit.webUrl ?? commit.id}`);
      }
      if (request.createReviewRequest !== false) {
        const mr = await adapter.createMergeRequest({
          title: optionalTrimmedString(request.mergeRequestTitle) ?? `EvoPilot source closure: ${loop.objective}`,
          description: optionalTrimmedString(request.mergeRequestDescription) ?? `Loop ${loop.id} source-to-production closure evidence.`,
          sourceBranch: branch,
          targetBranch: loop.sourceClosure.sourceBranch
        });
        artifacts.mergeRequestUrl = mr.webUrl;
        artifacts.mergeRequestIid = mr.iid;
        artifacts.reviewStatus = "PENDING";
        evidence.push(`gitlab.mergeRequest=${mr.webUrl ?? mr.iid}`);
      } else {
        artifacts.reviewStatus = "NOT_REQUIRED";
      }
      if (tagName && loop.sourceClosure.requiredGates.includes("tag")) {
        const tag = await ignoreAlreadyExists(() => adapter.createTag(tagName, branch, `EvoPilot closure tag for ${loop.id}`));
        artifacts.tag = tagName;
        closureState = "TAGGED";
        markGate(gateEvidence, "tag", "PASSED", [`tag=${tagName}`, `target=${tag?.target ?? branch}`], now);
      }
    } else if (loop.sourceClosure.repositoryProvider === "local-git") {
      if (!project?.repository || project.repository.provider !== "local-git") throw httpError(409, "SOURCE_CLOSURE_PROJECT_NOT_LOCAL_GIT", "Loop source project is not a local Git repository.");
      const localResult = await executeLocalGitSourceClosure(project.repository, {
        loop,
        files,
        branch,
        commitMessage,
        tagName,
        allowDirtyWorktree: request.allowDirtyWorktree === true
      });
      artifacts.branch = branch;
      artifacts.commitSha = localResult.commitSha;
      artifacts.pullRequestUrl = localResult.reviewUrl;
      artifacts.reviewStatus = request.createReviewRequest === false ? "NOT_REQUIRED" : "PENDING";
      markGate(gateEvidence, "push", "PASSED", localResult.branchEvidence, now);
      evidence.push(...localResult.evidence);
      if (files.length > 0) {
        closureState = "CODE_CHANGED";
        markGate(gateEvidence, "code-change", "PASSED", files.map((file) => `file=${file.path}`), now);
      }
      if (tagName && loop.sourceClosure.requiredGates.includes("tag")) {
        artifacts.tag = tagName;
        closureState = "TAGGED";
        markGate(gateEvidence, "tag", "PASSED", [`tag=${tagName}`, `target=${localResult.commitSha}`], now);
      }
    } else {
      throw httpError(409, "SOURCE_CLOSURE_PROVIDER_UNSUPPORTED", "Automatic source closure supports GitHub, GitLab, and local-git repositories.");
    }

    if (loop.sourceClosure.requiredGates.includes("deploy")) {
      if (deployConnectorId) {
        const deployResult = await executeDeployConnector(store, deployConnectorId, {
          loop,
          actor,
          artifacts,
          parameters: isRecord(request.deployParameters) ? request.deployParameters : {}
        });
        artifacts.deploymentConnectorId = deployConnectorId;
        artifacts.deploymentId = deployResult.deploymentId;
        artifacts.deploymentUrl = deployResult.deploymentUrl ?? artifacts.deploymentUrl;
        artifacts.deployStatusUrl = deployResult.statusUrl;
        artifacts.healthUrl = deployResult.healthUrl ?? artifacts.healthUrl;
        artifacts.readyUrl = deployResult.readyUrl ?? artifacts.readyUrl;
        deploymentUrl = artifacts.deploymentUrl;
        healthUrl = artifacts.healthUrl;
        readyUrl = artifacts.readyUrl;
        markGate(gateEvidence, "deploy", deployResult.status === "SUCCEEDED" ? "PASSED" : "FAILED", deployResult.evidence, new Date().toISOString());
        closureState = deployResult.status === "SUCCEEDED" ? "DEPLOYED" : "FAILED";
      } else if (deploymentUrl) {
        markGate(gateEvidence, "deploy", "PASSED", [`deploymentUrl=${deploymentUrl}`, "deployConnector=not-configured"], now);
        closureState = closureState === "TAGGED" ? "DEPLOYED" : closureState;
      } else {
        markGate(gateEvidence, "deploy", "PENDING", ["deploymentUrl missing"], now);
      }
    }
    if (loop.sourceClosure.requiredGates.includes("health-ready")) {
      if (gateEvidence.deploy?.status === "FAILED") {
        markGate(gateEvidence, "health-ready", "SKIPPED", ["deploy gate failed"], new Date().toISOString());
        closureState = "FAILED";
      } else {
        const checks = await probeHealthReady(healthUrl, readyUrl);
        if (checks.passed) {
          markGate(gateEvidence, "health-ready", "PASSED", checks.evidence, new Date().toISOString());
          closureState = "HEALTH_READY";
        } else {
          let rollbackEvidence: string[] = [];
          let rollbackSucceeded = false;
          if (deployConnectorId) {
            const rollbackResult = await rollbackDeployConnector(store, deployConnectorId, {
              loop,
              actor,
              artifacts,
              parameters: isRecord(request.deployParameters) ? request.deployParameters : {},
              reason: "health-ready failed",
              healthEvidence: checks.evidence
            });
            rollbackEvidence = rollbackResult.evidence;
            rollbackSucceeded = rollbackResult.status === "SUCCEEDED";
          }
          markGate(gateEvidence, "health-ready", "FAILED", [...checks.evidence, ...rollbackEvidence], new Date().toISOString());
          closureState = rollbackSucceeded ? "ROLLED_BACK" : "HEALTH_FAILED";
        }
      }
    }
    if (requiredSourceClosureGatesPassed(loop.sourceClosure.requiredGates, gateEvidence)) {
      closureState = "PROMOTED";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markGate(gateEvidence, nextPendingGate(loop.sourceClosure.requiredGates, gateEvidence), "FAILED", [message], new Date().toISOString());
    closureState = "FAILED";
    evidence.push(`sourceClosure.error=${message}`);
  }

  const updatedClosure = normalizeLoopSourceClosure({
    ...loop.sourceClosure,
    deploymentConnectorId: deployConnectorId,
    closureState,
    gateEvidence,
    artifacts
  }, project, loop.controlPlaneUrl);
  const updatedLoop = store.writeLoop({
    ...loop,
    sourceClosure: updatedClosure,
    evidenceSets: [
      ...loop.evidenceSets,
      {
        id: `${loop.id}-source-closure-${Date.now()}`,
        loopRunId: loop.id,
        iterationId: loop.iterations.at(-1)?.id ?? `${loop.id}-source-closure`,
        validator: "evopilot-source-closure",
        status: sourceClosureEvidenceStatus(closureState),
        evidence: [
          ...evidence,
          ...Object.entries(updatedClosure.gateEvidence).flatMap(([gate, row]) => [
            `sourceClosure.gate.${gate}=${row?.status ?? "PENDING"}`,
            ...(row?.evidence ?? [])
          ])
        ],
        artifacts: [],
        createdAt: new Date().toISOString()
      }
    ],
    timeline: [
      ...loop.timeline,
      loopTimelineEvent("EVIDENCE", `Source closure executed with state ${closureState}.`, {
        provider: updatedClosure.repositoryProvider,
        branch: updatedClosure.artifacts.branch,
        commitSha: updatedClosure.artifacts.commitSha,
        tag: updatedClosure.artifacts.tag
      })
    ],
    updatedAt: new Date().toISOString()
  });
  releaseRun = store.writeSourceReleaseClosureRun(buildSourceReleaseClosureRun(updatedLoop, actor, releaseRun.id, releaseRun.createdAt));
  return { loop: updatedLoop, releaseRun };
}

export async function applySourceClosureReviewDecision(store: FileStore, loopId: string, actor: string, body: unknown): Promise<{ loop: LoopRun; releaseRun: SourceReleaseClosureRun; action: string } | undefined> {
  const loop = store.readLoop(loopId);
  if (!loop) return undefined;
  const project = store.readProject(loop.sourceClosure.sourceProjectId) ?? store.readProject(loop.projectId);
  const request = isRecord(body) ? body : {};
  const action = String(request.action ?? "approve").trim().toLowerCase();
  if (action !== "approve" && action !== "reject" && action !== "merge" && action !== "auto-merge") throw httpError(400, "SOURCE_CLOSURE_REVIEW_ACTION_INVALID", "action must be approve, reject, merge, or auto-merge.");
  const now = new Date().toISOString();
  const artifacts: LoopSourceClosure["artifacts"] = { ...loop.sourceClosure.artifacts };
  const evidence: string[] = [
    `sourceClosure.reviewAction=${action}`,
    `sourceClosure.provider=${loop.sourceClosure.repositoryProvider}`
  ];

  if (action === "approve" || action === "auto-merge") {
    artifacts.reviewStatus = "APPROVED";
    artifacts.approvedAt = now;
    artifacts.approvedBy = actor;
    evidence.push(`approvedBy=${actor}`);
  }
  if (action === "reject") {
    artifacts.reviewStatus = "REJECTED";
    artifacts.rejectedAt = now;
    artifacts.rejectedBy = actor;
    evidence.push(`rejectedBy=${actor}`);
  }
  if (action === "merge" || action === "auto-merge") {
    if (artifacts.reviewStatus !== "APPROVED" && request.force !== true) {
      throw httpError(409, "SOURCE_CLOSURE_REVIEW_NOT_APPROVED", "Release review must be approved before merge unless force=true.");
    }
    artifacts.autoMerge = action === "auto-merge" || request.autoMerge === true;
    const policy = evaluateSourceReleasePolicy(loop, artifacts, {
      autoMerge: artifacts.autoMerge === true,
      forcePolicy: request.forcePolicy === true
    });
    artifacts.policyStatus = policy.status;
    artifacts.policyBlockers = policy.blockers;
    artifacts.policyEvaluatedAt = policy.evaluatedAt;
    evidence.push(...policy.checks.flatMap((check) => [`policy.${check.id}=${check.status}`, ...check.evidence]));
    if (policy.status === "BLOCKED" && request.forcePolicy !== true) {
      const blockedClosure = normalizeLoopSourceClosure({
        ...loop.sourceClosure,
        artifacts
      }, project, loop.controlPlaneUrl);
      const blockedLoop = store.writeLoop({
        ...loop,
        sourceClosure: blockedClosure,
        evidenceSets: [
          ...loop.evidenceSets,
          {
            id: `${loop.id}-source-policy-${Date.now()}`,
            loopRunId: loop.id,
            iterationId: loop.iterations.at(-1)?.id ?? `${loop.id}-source-policy`,
            validator: "evopilot-source-release-policy",
            status: "FAIL",
            evidence: [`policyStatus=BLOCKED`, ...policy.blockers.map((blocker) => `policyBlocker=${blocker}`), ...evidence],
            artifacts: [],
            createdAt: now
          }
        ],
        timeline: [
          ...loop.timeline,
          loopTimelineEvent("DECISION", "Source release policy blocked merge.", {
            provider: blockedClosure.repositoryProvider,
            policyStatus: "BLOCKED",
            blockers: policy.blockers
          })
        ],
        updatedAt: now
      });
      const latestRun = store.listSourceReleaseClosureRuns(loop.id).at(-1);
      store.writeSourceReleaseClosureRun(buildSourceReleaseClosureRun(blockedLoop, actor, latestRun?.id, latestRun?.createdAt));
      throw httpError(409, "SOURCE_CLOSURE_RELEASE_POLICY_BLOCKED", `Release policy blocked merge: ${policy.blockers.join("; ")}`);
    }
    const merge = await mergeSourceClosureReview(store, project, loop, artifacts, actor, optionalTrimmedString(request.commitMessage));
    artifacts.reviewStatus = "MERGED";
    artifacts.mergedAt = now;
    artifacts.mergedBy = actor;
    artifacts.mergeCommitSha = merge.mergeCommitSha;
    evidence.push(...merge.evidence);
    if (request.postMergeDeploy !== false) {
      const latestRun = store.listSourceReleaseClosureRuns(loop.id).at(-1);
      const postMergeDeploy = await executePostMergeDeployment(store, loop, project, artifacts, actor, request, latestRun?.id);
      artifacts.postMergeDeployStatus = postMergeDeploy.status;
      artifacts.postMergeDeployAt = postMergeDeploy.deployedAt;
      artifacts.postMergeDeployBy = actor;
      evidence.push(...postMergeDeploy.evidence);
    }
  }

  const updatedClosure = normalizeLoopSourceClosure({
    ...loop.sourceClosure,
    artifacts
  }, project, loop.controlPlaneUrl);
  const updatedLoop = store.writeLoop({
    ...loop,
    sourceClosure: updatedClosure,
    evidenceSets: [
      ...loop.evidenceSets,
      {
        id: `${loop.id}-source-review-${Date.now()}`,
        loopRunId: loop.id,
        iterationId: loop.iterations.at(-1)?.id ?? `${loop.id}-source-review`,
        validator: "evopilot-source-release-review",
        status: action === "reject" ? "FAIL" : "PASS",
        evidence,
        artifacts: [],
        createdAt: now
      }
    ],
    timeline: [
      ...loop.timeline,
      loopTimelineEvent(action === "reject" ? "DECISION" : "EVIDENCE", `Source release review ${action} recorded.`, {
        provider: updatedClosure.repositoryProvider,
        reviewStatus: updatedClosure.artifacts.reviewStatus,
        mergeCommitSha: updatedClosure.artifacts.mergeCommitSha
      })
    ],
    updatedAt: now
  });
  const latestRun = store.listSourceReleaseClosureRuns(loop.id).at(-1);
  const releaseRun = store.writeSourceReleaseClosureRun(buildSourceReleaseClosureRun(updatedLoop, actor, latestRun?.id, latestRun?.createdAt));
  return { loop: updatedLoop, releaseRun, action };
}

export async function repairSourceReleaseRun(store: FileStore, loopId: string, releaseRunId: string, actor: string, body: unknown): Promise<{ loop: LoopRun; releaseRun: SourceReleaseClosureRun; originalReleaseRun: SourceReleaseClosureRun; action: "repair-and-execute" | "repair-intent" } | undefined> {
  const loop = store.readLoop(loopId);
  const originalReleaseRun = store.readSourceReleaseClosureRun(releaseRunId);
  if (!loop || !originalReleaseRun || originalReleaseRun.loopId !== loopId) return undefined;
  const request = isRecord(body) ? body : {};
  const now = new Date().toISOString();
  const project = store.readProject(loop.sourceClosure.sourceProjectId) ?? store.readProject(loop.projectId);
  const gateEvidence: LoopSourceClosure["gateEvidence"] = { ...loop.sourceClosure.gateEvidence };
  for (const gate of loop.sourceClosure.requiredGates) {
    if (gateEvidence[gate]?.status === "FAILED") {
      markGate(gateEvidence, gate, "PENDING", [
        `sourceReleaseRepair=queued`,
        `originalReleaseRunId=${releaseRunId}`,
        ...(gateEvidence[gate]?.evidence ?? []).slice(-2)
      ], now);
    }
  }
  const artifacts: LoopSourceClosure["artifacts"] = {
    ...loop.sourceClosure.artifacts,
    policyStatus: undefined,
    policyBlockers: undefined,
    policyEvaluatedAt: undefined,
    postMergeDeployStatus: undefined
  };
  const repairedClosure = normalizeLoopSourceClosure({
    ...loop.sourceClosure,
    closureState: "PLANNED",
    gateEvidence,
    artifacts
  }, project, loop.controlPlaneUrl);
  const repairedLoop = store.writeLoop({
    ...loop,
    sourceClosure: repairedClosure,
    evidenceSets: [
      ...loop.evidenceSets,
      {
        id: `${loop.id}-source-release-repair-${Date.now()}`,
        loopRunId: loop.id,
        iterationId: loop.iterations.at(-1)?.id ?? `${loop.id}-source-release-repair`,
        validator: "evopilot-source-release-repair",
        status: "PASS",
        evidence: [
          "sourceReleaseRepair=QUEUED",
          `originalReleaseRunId=${releaseRunId}`,
          `originalStatus=${originalReleaseRun.status}`,
          `executeSourceClosure=${request.executeSourceClosure !== false}`
        ],
        artifacts: [],
        createdAt: now
      }
    ],
    timeline: [
      ...loop.timeline,
      loopTimelineEvent("DECISION", "Source release run repair queued.", {
        originalReleaseRunId: releaseRunId,
        originalStatus: originalReleaseRun.status
      })
    ],
    updatedAt: now
  });
  if (request.executeSourceClosure === false) {
    const releaseRun = store.writeSourceReleaseClosureRun(buildSourceReleaseClosureRun(repairedLoop, actor));
    return { loop: repairedLoop, releaseRun, originalReleaseRun, action: "repair-intent" };
  }
  const execution = await executeLoopSourceClosure(store, loopId, actor, {
    ...request,
    repairOfReleaseRunId: releaseRunId,
    files: Array.isArray(request.files) ? request.files : []
  });
  if (!execution) return undefined;
  return { loop: execution.loop, releaseRun: execution.releaseRun, originalReleaseRun, action: "repair-and-execute" };
}

export function discoverSourceReleaseRunRepairCandidates(store: FileStore, options: { includeRepaired?: boolean } = {}): SourceReleaseRunRepairCandidate[] {
  const runs = store.listSourceReleaseClosureRuns();
  const latestRunByLoop = new Map<string, SourceReleaseClosureRun>();
  for (const run of runs) latestRunByLoop.set(run.loopId, run);
  const repairedRunIds = discoverRepairedSourceReleaseRunIds(store);
  const nowMs = Date.now();
  return runs
    .filter((run) => REPAIRABLE_SOURCE_RELEASE_RUN_STATUSES.includes(run.status))
    .map((run) => {
      const latestRun = latestRunByLoop.get(run.loopId);
      const repaired = repairedRunIds.has(run.id);
      const failedStages = run.stages
        .filter((stage) => stage.status === "FAILED")
        .map((stage) => `${stage.gate}:${stage.evidence.at(-1) ?? "failed"}`);
      const blockers = [
        ...(run.policy?.blockers ?? []).map((blocker) => `policy:${blocker}`),
        ...(run.postMergeDeployment?.status === "FAILED" || run.postMergeDeployment?.status === "ROLLED_BACK"
          ? [`post-merge-deploy:${run.postMergeDeployment.evidence.at(-1) ?? run.postMergeDeployment.status}`]
          : [])
      ];
      return {
        schema: "evopilot-source-release-repair-candidate/v1",
        id: `source-release-repair-candidate-${safeFileName(run.id)}`,
        loopId: run.loopId,
        runId: run.id,
        projectId: run.projectId,
        sourceProjectId: run.sourceProjectId,
        provider: run.provider,
        status: run.status,
        reason: failedStages[0] ?? blockers[0] ?? `source release run status ${run.status}`,
        suggestedAction: repaired ? "inspect-existing-repair" : "repair-source-closure",
        latestForLoop: latestRun?.id === run.id,
        repaired,
        supersededByRunId: latestRun && latestRun.id !== run.id ? latestRun.id : undefined,
        ageSeconds: Math.max(0, Math.floor((nowMs - Date.parse(run.createdAt)) / 1000)),
        evidence: [...failedStages, ...blockers].slice(0, 6),
        createdAt: run.createdAt
      } satisfies SourceReleaseRunRepairCandidate;
    })
    .filter((candidate) => options.includeRepaired || !candidate.repaired)
    .sort((left, right) => Number(right.latestForLoop) - Number(left.latestForLoop) || Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

export function discoverRepairedSourceReleaseRunIds(store: FileStore): Set<string> {
  const repaired = new Set<string>();
  for (const loop of store.listLoops()) {
    for (const set of loop.evidenceSets ?? []) {
      for (const item of set.evidence ?? []) {
        const text = String(item);
        for (const prefix of ["originalReleaseRunId=", "sourceClosure.repairOfReleaseRunId="]) {
          if (text.startsWith(prefix)) repaired.add(text.slice(prefix.length));
        }
      }
    }
  }
  return repaired;
}

export async function repairSourceReleaseRunCandidates(store: FileStore, actor: string, body: unknown): Promise<SourceReleaseRunRepairQueueResult> {
  const request = isRecord(body) ? body : {};
  const requestedRunIds = Array.isArray(request.runIds) ? request.runIds.map((id) => String(id).trim()).filter(Boolean) : [];
  const includeRepaired = request.includeRepaired === true;
  const candidates = discoverSourceReleaseRunRepairCandidates(store, { includeRepaired });
  const selected = requestedRunIds.length > 0
    ? requestedRunIds.map((runId) => candidates.find((candidate) => candidate.runId === runId) ?? buildSkippedRepairCandidate(store, runId))
    : candidates;
  const limit = Math.max(1, Math.min(25, Number(request.limit ?? selected.length) || selected.length));
  const result: SourceReleaseRunRepairQueueResult = {
    schema: "evopilot-source-release-repair-queue/v1",
    repaired: [],
    failed: [],
    skipped: []
  };
  for (const candidate of selected.slice(0, limit)) {
    if (!candidate) continue;
    if (candidate.repaired && !includeRepaired) {
      result.skipped.push({ runId: candidate.runId, loopId: candidate.loopId, reason: "already repaired" });
      continue;
    }
    if (candidate.suggestedAction !== "repair-source-closure") {
      result.skipped.push({ runId: candidate.runId, loopId: candidate.loopId, reason: candidate.suggestedAction });
      continue;
    }
    try {
      const loop = store.readLoop(candidate.loopId);
      const version = loop?.sourceClosure.targetVersion;
      const repair = await repairSourceReleaseRun(store, candidate.loopId, candidate.runId, actor, {
        ...request,
        files: Array.isArray(request.files) ? request.files : [{
          path: `.evopilot/source-closures/${candidate.loopId}-auto-repair.md`,
          content: [
            `# EvoPilot Source Release Auto Repair: ${candidate.loopId}`,
            "",
            `Original release run: ${candidate.runId}`,
            `Original status: ${candidate.status}`,
            `Reason: ${candidate.reason}`,
            `Target version: ${version ?? "unspecified"}`,
            `Generated at: ${new Date().toISOString()}`,
            "",
            "This file records Dashboard or API queued source release run repair evidence."
          ].join("\n")
        }]
      });
      if (!repair) {
        result.failed.push({ runId: candidate.runId, loopId: candidate.loopId, error: "SOURCE_RELEASE_RUN_NOT_FOUND" });
        continue;
      }
      result.repaired.push({
        runId: candidate.runId,
        loopId: candidate.loopId,
        status: repair.releaseRun.status,
        action: repair.action,
        repairedRunId: repair.releaseRun.id
      });
    } catch (error) {
      result.failed.push({ runId: candidate.runId, loopId: candidate.loopId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

export function buildSkippedRepairCandidate(store: FileStore, runId: string): SourceReleaseRunRepairCandidate | undefined {
  const run = store.readSourceReleaseClosureRun(runId);
  if (!run) return undefined;
  return {
    schema: "evopilot-source-release-repair-candidate/v1",
    id: `source-release-repair-candidate-${safeFileName(run.id)}`,
    loopId: run.loopId,
    runId: run.id,
    projectId: run.projectId,
    sourceProjectId: run.sourceProjectId,
    provider: run.provider,
    status: run.status,
    reason: REPAIRABLE_SOURCE_RELEASE_RUN_STATUSES.includes(run.status) ? "not in active repair queue" : `status ${run.status} is not repairable`,
    suggestedAction: REPAIRABLE_SOURCE_RELEASE_RUN_STATUSES.includes(run.status) ? "repair-source-closure" : "inspect-existing-repair",
    latestForLoop: false,
    repaired: true,
    ageSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(run.createdAt)) / 1000)),
    evidence: [],
    createdAt: run.createdAt
  };
}

export async function mergeSourceClosureReview(store: FileStore, project: StoredProject | undefined, loop: LoopRun, artifacts: LoopSourceClosure["artifacts"], actor: string, commitMessage?: string): Promise<{ mergeCommitSha?: string; evidence: string[] }> {
  if (loop.sourceClosure.repositoryProvider === "github") {
    if (!project?.repository || project.repository.provider !== "github") throw httpError(409, "SOURCE_CLOSURE_PROJECT_NOT_GITHUB", "Loop source project is not a GitHub repository.");
    const token = repositoryToken(store, project.repository, project);
    if (!token) throw httpError(409, "SOURCE_CLOSURE_TOKEN_REQUIRED", "GitHub merge requires a project token or tokenRef.");
    if (!project.repository.owner || !project.repository.repo) throw httpError(409, "SOURCE_CLOSURE_GITHUB_COORDINATES_REQUIRED", "GitHub merge requires owner and repo.");
    if (!artifacts.pullRequestNumber) throw httpError(409, "SOURCE_CLOSURE_PULL_REQUEST_NUMBER_REQUIRED", "GitHub merge requires pullRequestNumber.");
    const adapter = new GitHubHttpAdapter({
      apiBaseUrl: project.repository.baseUrl,
      owner: project.repository.owner,
      repo: project.repository.repo,
      token
    });
    const result = await adapter.mergePullRequest(artifacts.pullRequestNumber, {
      commitTitle: commitMessage ?? `EvoPilot merge ${loop.id}`
    });
    return {
      mergeCommitSha: result.sha || artifacts.commitSha,
      evidence: [
        `github.pullRequestNumber=${artifacts.pullRequestNumber}`,
        `github.mergeCommitSha=${result.sha || (artifacts.commitSha ?? "")}`,
        `github.merged=${result.merged}`,
        `mergedBy=${actor}`
      ]
    };
  }
  if (loop.sourceClosure.repositoryProvider === "gitlab") {
    if (!project?.repository || project.repository.provider !== "gitlab") throw httpError(409, "SOURCE_CLOSURE_PROJECT_NOT_GITLAB", "Loop source project is not a GitLab repository.");
    const token = repositoryToken(store, project.repository, project);
    if (!token) throw httpError(409, "SOURCE_CLOSURE_TOKEN_REQUIRED", "GitLab merge requires a project token or tokenRef.");
    if (!project.repository.baseUrl || !project.repository.projectId) throw httpError(409, "SOURCE_CLOSURE_GITLAB_COORDINATES_REQUIRED", "GitLab merge requires baseUrl and projectId.");
    if (!artifacts.mergeRequestIid) throw httpError(409, "SOURCE_CLOSURE_MERGE_REQUEST_IID_REQUIRED", "GitLab merge requires mergeRequestIid.");
    const adapter = new GitLabHttpAdapter({
      baseUrl: project.repository.baseUrl,
      projectId: project.repository.projectId,
      token
    });
    const result = await adapter.mergeMergeRequest(artifacts.mergeRequestIid, {
      commitMessage: commitMessage ?? `EvoPilot merge ${loop.id}`
    });
    return {
      mergeCommitSha: result.mergeCommitSha || artifacts.commitSha,
      evidence: [
        `gitlab.mergeRequestIid=${artifacts.mergeRequestIid}`,
        `gitlab.mergeCommitSha=${result.mergeCommitSha || (artifacts.commitSha ?? "")}`,
        ...(result.webUrl ? [`gitlab.mergeRequest=${result.webUrl}`] : []),
        `mergedBy=${actor}`
      ]
    };
  }
  if (loop.sourceClosure.repositoryProvider === "local-git") {
    if (!project?.repository || project.repository.provider !== "local-git") throw httpError(409, "SOURCE_CLOSURE_PROJECT_NOT_LOCAL_GIT", "Loop source project is not a local Git repository.");
    return mergeLocalGitSourceClosure(project.repository, loop, artifacts, commitMessage ?? `EvoPilot merge ${loop.id}`, actor);
  }
  throw httpError(409, "SOURCE_CLOSURE_PROVIDER_UNSUPPORTED", "Review merge supports GitHub, GitLab, and local-git repositories.");
}

export async function createOrReuseGitHubPullRequest(adapter: GitHubHttpAdapter, draft: GitHubPullRequestDraft): Promise<{ number: number; htmlUrl?: string; reused?: boolean; evidence?: string[] }> {
  try {
    return await adapter.createPullRequest(draft);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const existing = (await adapter.listPullRequests({ state: "open", head: draft.head, base: draft.base }))[0];
    if (!existing) throw error;
    return {
      number: existing.number,
      htmlUrl: existing.htmlUrl,
      reused: true,
      evidence: [
        `github.pullRequestCreateError=${message}`,
        `github.pullRequestHead=${draft.head}`,
        `github.pullRequestBase=${draft.base}`
      ]
    };
  }
}

export function evaluateSourceReleasePolicy(loop: LoopRun, artifacts: LoopSourceClosure["artifacts"], options: {
  autoMerge: boolean;
  forcePolicy: boolean;
}): SourceReleaseClosureRun["policy"] & { evaluatedAt: string } {
  const closure = loop.sourceClosure;
  const evaluatedAt = new Date().toISOString();
  const checks: SourceReleaseClosureRun["policy"]["checks"] = [];
  const addCheck = (id: string, passed: boolean, evidence: string[], required = true) => {
    checks.push({ id, status: passed ? "PASS" : "FAIL", evidence, required });
  };
  const failedGates = closure.requiredGates.filter((gate) => closure.gateEvidence[gate]?.status === "FAILED");
  const unpassedGates = closure.requiredGates.filter((gate) => closure.gateEvidence[gate]?.status !== "PASSED");
  addCheck("required-gates", unpassedGates.length === 0, [
    `requiredGates=${closure.requiredGates.join(",") || "none"}`,
    `unpassedGates=${unpassedGates.join(",") || "none"}`
  ]);
  addCheck("no-failed-gates", failedGates.length === 0, [`failedGates=${failedGates.join(",") || "none"}`]);
  addCheck("closure-promoted", closure.closureState === "PROMOTED", [`closureState=${closure.closureState}`]);
  addCheck("review-approved", artifacts.reviewStatus === "APPROVED" || artifacts.reviewStatus === "MERGED" || artifacts.reviewStatus === "NOT_REQUIRED", [`reviewStatus=${artifacts.reviewStatus ?? "UNKNOWN"}`]);
  addCheck("source-commit", Boolean(artifacts.commitSha), [`commitSha=${artifacts.commitSha ?? "missing"}`]);
  if (closure.repositoryProvider === "github") {
    addCheck("github-review-artifact", Boolean(artifacts.pullRequestNumber || artifacts.pullRequestUrl), [
      `pullRequestNumber=${artifacts.pullRequestNumber ?? "missing"}`,
      `pullRequestUrl=${artifacts.pullRequestUrl ?? "missing"}`
    ]);
  }
  if (closure.repositoryProvider === "gitlab") {
    addCheck("gitlab-review-artifact", Boolean(artifacts.mergeRequestIid || artifacts.mergeRequestUrl), [
      `mergeRequestIid=${artifacts.mergeRequestIid ?? "missing"}`,
      `mergeRequestUrl=${artifacts.mergeRequestUrl ?? "missing"}`
    ]);
  }
  if (closure.requiredGates.includes("deploy")) {
    addCheck("deploy-ready", closure.gateEvidence.deploy?.status === "PASSED", [`deployStatus=${closure.gateEvidence.deploy?.status ?? "PENDING"}`]);
  }
  if (closure.requiredGates.includes("health-ready")) {
    addCheck("health-ready", closure.gateEvidence["health-ready"]?.status === "PASSED", [`healthReadyStatus=${closure.gateEvidence["health-ready"]?.status ?? "PENDING"}`]);
  }
  addCheck("force-policy", !options.forcePolicy, [`forcePolicy=${options.forcePolicy}`], false);
  const blockers = checks
    .filter((check) => check.required && check.status === "FAIL")
    .map((check) => `${check.id}:${check.evidence.join("|")}`);
  return {
    status: blockers.length === 0 ? "PASS" : "BLOCKED",
    evaluatedAt,
    autoMerge: options.autoMerge,
    blockers,
    checks
  };
}

export async function executePostMergeDeployment(store: FileStore, loop: LoopRun, project: StoredProject | undefined, artifacts: LoopSourceClosure["artifacts"], actor: string, request: Record<string, unknown>, releaseRunId?: string): Promise<{
  status: SourceReleasePostMergeDeployStatus;
  deployedAt: string;
  evidence: string[];
}> {
  const deployedAt = new Date().toISOString();
  if (!loop.sourceClosure.requiredGates.includes("deploy")) {
    return { status: "NOT_REQUIRED", deployedAt, evidence: ["postMergeDeploy=NOT_REQUIRED", "deployGate=not-required"] };
  }
  const deployConnectorId = optionalTrimmedString(request.deployConnectorId) ?? optionalTrimmedString(request.deploymentConnectorId) ?? artifacts.deploymentConnectorId ?? loop.sourceClosure.deploymentConnectorId;
  if (!deployConnectorId) {
    return { status: "NOT_REQUIRED", deployedAt, evidence: ["postMergeDeploy=NOT_REQUIRED", "deploymentConnectorId=missing"] };
  }
  const deploymentArtifacts: LoopSourceClosure["artifacts"] = {
    ...artifacts,
    commitSha: artifacts.mergeCommitSha ?? artifacts.commitSha,
    deploymentConnectorId: deployConnectorId
  };
  const finalizer = store.writeSourceReleaseDeployFinalizer({
    schema: "evopilot-source-release-deploy-finalizer/v1",
    id: `${loop.id}-${releaseRunId ?? "latest"}-${Date.now()}`,
    loopId: loop.id,
    releaseRunId,
    deployConnectorId,
    actor,
    status: "PENDING",
    createdAt: deployedAt,
    updatedAt: deployedAt,
    artifacts: deploymentArtifacts,
    deploymentEnvironment: loop.sourceClosure.deploymentEnvironment ?? "production",
    healthUrl: deploymentArtifacts.healthUrl,
    readyUrl: deploymentArtifacts.readyUrl,
    attempts: 0,
    maxAttempts: 3,
    evidence: [
      "postMergeDeployFinalizer=PENDING",
      `postMergeDeployConnector=${deployConnectorId}`,
      `releaseRunId=${releaseRunId ?? "latest"}`
    ]
  });
  const deployResult = await executeDeployConnector(store, deployConnectorId, {
    loop: {
      ...loop,
      sourceClosure: normalizeLoopSourceClosure({
        ...loop.sourceClosure,
        artifacts: deploymentArtifacts
      }, project, loop.controlPlaneUrl)
    },
    actor,
    artifacts: deploymentArtifacts,
    parameters: {
      ...(isRecord(request.deployParameters) ? request.deployParameters : {}),
      releaseKey: `${loop.id}:${deploymentArtifacts.commitSha ?? "no-merge-commit"}:post-merge:${loop.sourceClosure.targetVersion ?? "no-target-version"}`
    }
  });
  artifacts.deploymentConnectorId = deployConnectorId;
  artifacts.deploymentId = deployResult.deploymentId;
  artifacts.deploymentUrl = deployResult.deploymentUrl ?? artifacts.deploymentUrl;
  artifacts.deployStatusUrl = deployResult.statusUrl ?? artifacts.deployStatusUrl;
  artifacts.healthUrl = deployResult.healthUrl ?? artifacts.healthUrl;
  artifacts.readyUrl = deployResult.readyUrl ?? artifacts.readyUrl;
  const health = await probeHealthReady(artifacts.healthUrl, artifacts.readyUrl);
  const deployOk = deployResult.status === "SUCCEEDED";
  const healthOk = health.passed;
  const rollbackEvidence: string[] = [];
  let status: SourceReleasePostMergeDeployStatus = deployOk && healthOk ? "SUCCEEDED" : "FAILED";
  if (deployOk && !healthOk) {
    const rollbackResult = await rollbackDeployConnector(store, deployConnectorId, {
      loop,
      actor,
      artifacts,
      parameters: isRecord(request.deployParameters) ? request.deployParameters : {},
      reason: "post-merge health-ready failed",
      healthEvidence: health.evidence
    });
    rollbackEvidence.push(...rollbackResult.evidence);
    status = rollbackResult.status === "SUCCEEDED" ? "ROLLED_BACK" : "FAILED";
  }
  const evidence = [
    `postMergeDeploy=${status}`,
    `postMergeDeployConnector=${deployConnectorId}`,
    ...deployResult.evidence,
    ...health.evidence,
    ...rollbackEvidence
  ];
  store.writeSourceReleaseDeployFinalizer({
    ...finalizer,
    status: status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED",
    updatedAt: new Date().toISOString(),
    artifacts: { ...deploymentArtifacts, ...artifacts },
    healthUrl: artifacts.healthUrl,
    readyUrl: artifacts.readyUrl,
    attempts: 1,
    evidence: [
      ...finalizer.evidence,
      ...evidence,
      status === "SUCCEEDED" ? "postMergeDeployFinalizer=SUCCEEDED" : "postMergeDeployFinalizer=FAILED"
    ]
  });
  return {
    status,
    deployedAt,
    evidence
  };
}

export async function reconcilePendingSourceReleaseDeployFinalizers(store: FileStore): Promise<SourceReleaseDeployFinalizer[]> {
  const reconciled: SourceReleaseDeployFinalizer[] = [];
  for (const pending of store.listSourceReleaseDeployFinalizers("PENDING")) {
    const loop = store.readLoop(pending.loopId);
    const now = new Date().toISOString();
    if (!loop) {
      reconciled.push(store.writeSourceReleaseDeployFinalizer({
        ...pending,
        status: "FAILED",
        attempts: pending.attempts + 1,
        updatedAt: now,
        lastError: "LOOP_NOT_FOUND",
        evidence: [...pending.evidence, "postMergeDeployFinalizer=FAILED", "loop=missing"]
      }));
      continue;
    }
    const artifacts: LoopSourceClosure["artifacts"] = {
      ...loop.sourceClosure.artifacts,
      ...pending.artifacts,
      deploymentConnectorId: pending.deployConnectorId,
      postMergeDeployBy: pending.actor
    };
    const healthUrl = pending.healthUrl ?? artifacts.healthUrl;
    const readyUrl = pending.readyUrl ?? artifacts.readyUrl;
    const checks = await probeHealthReady(healthUrl, readyUrl);
    const attempts = pending.attempts + 1;
    if (!checks.passed && attempts < pending.maxAttempts) {
      reconciled.push(store.writeSourceReleaseDeployFinalizer({
        ...pending,
        attempts,
        updatedAt: now,
        healthUrl,
        readyUrl,
        evidence: [...pending.evidence, ...checks.evidence, `postMergeDeployFinalizerAttempt=${attempts}`],
        lastError: "health-ready probe failed"
      }));
      continue;
    }
    const gateEvidence: LoopSourceClosure["gateEvidence"] = { ...loop.sourceClosure.gateEvidence };
    const deployEvidence = [
      `postMergeDeployFinalizer=${checks.passed ? "SUCCEEDED" : "FAILED"}`,
      `postMergeDeployConnector=${pending.deployConnectorId}`,
      ...checks.evidence
    ];
    markGate(gateEvidence, "deploy", checks.passed ? "PASSED" : "FAILED", [
      ...(gateEvidence.deploy?.evidence ?? []),
      ...deployEvidence
    ], now);
    if (loop.sourceClosure.requiredGates.includes("health-ready")) {
      markGate(gateEvidence, "health-ready", checks.passed ? "PASSED" : "FAILED", [
        ...(gateEvidence["health-ready"]?.evidence ?? []),
        ...checks.evidence
      ], now);
    }
    artifacts.postMergeDeployStatus = checks.passed ? "SUCCEEDED" : "FAILED";
    artifacts.postMergeDeployAt = now;
    artifacts.postMergeDeployBy = pending.actor;
    artifacts.healthUrl = healthUrl;
    artifacts.readyUrl = readyUrl;
    const closureState: LoopSourceClosureState = checks.passed && requiredSourceClosureGatesPassed(loop.sourceClosure.requiredGates, gateEvidence) ? "PROMOTED" : "FAILED";
    const project = store.readProject(loop.sourceClosure.sourceProjectId) ?? store.readProject(loop.projectId);
    const updatedClosure = normalizeLoopSourceClosure({
      ...loop.sourceClosure,
      closureState,
      gateEvidence,
      artifacts
    }, project, loop.controlPlaneUrl);
    const updatedLoop = store.writeLoop({
      ...loop,
      sourceClosure: updatedClosure,
      evidenceSets: [
        ...loop.evidenceSets,
        {
          id: `${loop.id}-post-merge-deploy-finalizer-${Date.now()}`,
          loopRunId: loop.id,
          iterationId: loop.iterations.at(-1)?.id ?? `${loop.id}-post-merge-deploy-finalizer`,
          validator: "evopilot-source-release-deploy-finalizer",
          status: checks.passed ? "PASS" : "FAIL",
          evidence: deployEvidence,
          artifacts: [],
          createdAt: now
        }
      ],
      timeline: [
        ...loop.timeline,
        loopTimelineEvent(checks.passed ? "EVIDENCE" : "DECISION", `Post-merge deploy finalizer reconciled as ${artifacts.postMergeDeployStatus}.`, {
          deployConnectorId: pending.deployConnectorId,
          releaseRunId: pending.releaseRunId,
          closureState
        })
      ],
      updatedAt: now
    });
    const latestRun = store.listSourceReleaseClosureRuns(loop.id).at(-1);
    store.writeSourceReleaseClosureRun(buildSourceReleaseClosureRun(updatedLoop, pending.actor, pending.releaseRunId ?? latestRun?.id, latestRun?.createdAt));
    reconciled.push(store.writeSourceReleaseDeployFinalizer({
      ...pending,
      status: checks.passed ? "SUCCEEDED" : "FAILED",
      attempts,
      updatedAt: now,
      artifacts,
      healthUrl,
      readyUrl,
      evidence: [...pending.evidence, ...deployEvidence],
      lastError: checks.passed ? undefined : "health-ready probe failed"
    }));
  }
  return reconciled;
}

export function normalizeSourceClosureFiles(value: unknown): Array<{ path: string; content: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((file) => ({
      path: String(file.path ?? "").trim(),
      content: String(file.content ?? "")
    }))
    .filter((file) => file.path && !file.path.startsWith("/") && !file.path.includes(".."));
}

export async function preflightLoopSourceClosure(store: FileStore, loopId: string, options: { actor: string; persist?: boolean }): Promise<SourceClosurePreflightResult | undefined> {
  const loop = store.readLoop(loopId);
  if (!loop) return undefined;
  const project = store.readProject(loop.sourceClosure.sourceProjectId) ?? store.readProject(loop.projectId);
  const closure = loop.sourceClosure;
  const checks: SourceClosurePreflightResult["checks"] = [];
  const now = new Date().toISOString();

  const addCheck = (check: SourceClosurePreflightResult["checks"][number]) => {
    checks.push(check);
  };

  addCheck({
    id: "project-binding",
    status: project?.repository ? "PASS" : "FAIL",
    required: true,
    evidence: project?.repository
      ? [`project=${project.id}`, `repositoryProvider=${project.repository.provider}`]
      : [`sourceProject=${closure.sourceProjectId}`, "repository=missing"]
  });

  const providerSupported = closure.repositoryProvider === "github" || closure.repositoryProvider === "gitlab" || closure.repositoryProvider === "local-git";
  addCheck({
    id: "provider",
    status: providerSupported ? "PASS" : "FAIL",
    required: true,
    evidence: [`provider=${closure.repositoryProvider}`, `releaseStrategy=${closure.releaseStrategy}`]
  });

  if (project?.repository?.provider === "github") {
    const token = repositoryToken(store, project.repository, project);
    addCheck({
      id: "credentials",
      status: token ? "PASS" : "FAIL",
      required: true,
      evidence: [
        token ? "tokenResolved=true" : "SOURCE_CLOSURE_TOKEN_REQUIRED",
        project.repository.credentials?.tokenRef ? `tokenRef=${project.repository.credentials.tokenRef}` : "tokenRef=missing",
        project.repository.credentials?.tokenRef ? `tokenRefResolved=${Boolean(process.env[project.repository.credentials.tokenRef])}` : "tokenRefResolved=false"
      ]
    });
    if (token && project.repository.owner && project.repository.repo) {
      try {
        const files = await new GitHubHttpAdapter({
          apiBaseUrl: project.repository.baseUrl,
          owner: project.repository.owner,
          repo: project.repository.repo,
          token
        }).listFiles(closure.sourceBranch);
        addCheck({ id: "source-branch", status: "PASS", required: true, evidence: [`branch=${closure.sourceBranch}`, `fileCount=${files.length}`] });
      } catch (error) {
        addCheck({ id: "source-branch", status: "FAIL", required: true, evidence: [`branch=${closure.sourceBranch}`, error instanceof Error ? error.message : String(error)] });
      }
    } else {
      addCheck({ id: "source-branch", status: "SKIP", required: true, evidence: [`branch=${closure.sourceBranch}`, "credentials-or-coordinates-missing"] });
    }
  } else if (project?.repository?.provider === "gitlab") {
    const token = repositoryToken(store, project.repository, project);
    addCheck({
      id: "credentials",
      status: token ? "PASS" : "FAIL",
      required: true,
      evidence: [
        token ? "tokenResolved=true" : "SOURCE_CLOSURE_TOKEN_REQUIRED",
        project.repository.credentials?.tokenRef ? `tokenRef=${project.repository.credentials.tokenRef}` : "tokenRef=missing",
        project.repository.credentials?.tokenRef ? `tokenRefResolved=${Boolean(process.env[project.repository.credentials.tokenRef])}` : "tokenRefResolved=false"
      ]
    });
    if (token && project.repository.baseUrl && project.repository.projectId) {
      try {
        const files = await new GitLabHttpAdapter({
          baseUrl: project.repository.baseUrl,
          projectId: project.repository.projectId,
          token
        }).listFiles(closure.sourceBranch);
        addCheck({ id: "source-branch", status: "PASS", required: true, evidence: [`branch=${closure.sourceBranch}`, `fileCount=${files.length}`] });
      } catch (error) {
        addCheck({ id: "source-branch", status: "FAIL", required: true, evidence: [`branch=${closure.sourceBranch}`, error instanceof Error ? error.message : String(error)] });
      }
    } else {
      addCheck({ id: "source-branch", status: "SKIP", required: true, evidence: [`branch=${closure.sourceBranch}`, "credentials-or-coordinates-missing"] });
    }
  } else if (project?.repository?.provider === "local-git") {
    const root = project.repository.root ? path.resolve(project.repository.root) : "";
    const rootOk = Boolean(root && fs.existsSync(root) && fs.statSync(root).isDirectory());
    addCheck({ id: "credentials", status: "PASS", required: false, evidence: ["local-git-credentials=not-required"] });
    addCheck({ id: "source-branch", status: rootOk ? "PASS" : "FAIL", required: true, evidence: [`root=${root || "missing"}`, rootOk ? "rootExists=true" : "rootExists=false"] });
  } else {
    addCheck({ id: "credentials", status: "FAIL", required: true, evidence: ["repository=missing-or-provider-mismatch"] });
    addCheck({ id: "source-branch", status: "SKIP", required: true, evidence: [`branch=${closure.sourceBranch}`, "repository=missing-or-provider-mismatch"] });
  }

  const deployRequired = closure.requiredGates.includes("deploy");
  const deployConnector = closure.deploymentConnectorId ? store.readDeployConnector(closure.deploymentConnectorId) : undefined;
  const deploymentUrl = closure.artifacts.deploymentUrl ?? closure.controlPlaneUrl ?? loop.controlPlaneUrl;
  addCheck({
    id: "deploy-target",
    status: !deployRequired || deployConnector || deploymentUrl ? "PASS" : "FAIL",
    required: deployRequired,
    evidence: [
      `deployRequired=${deployRequired}`,
      closure.deploymentConnectorId ? `deployConnector=${closure.deploymentConnectorId}` : "deployConnector=missing",
      deployConnector ? `deployConnectorType=${deployConnector.type}` : "deployConnectorResolved=false",
      deploymentUrl ? `deploymentUrl=${deploymentUrl}` : "deploymentUrl=missing"
    ]
  });

  const healthRequired = closure.requiredGates.includes("health-ready");
  addCheck({
    id: "health-ready",
    status: !healthRequired || closure.artifacts.healthUrl || closure.artifacts.readyUrl || deploymentUrl ? "PASS" : "FAIL",
    required: healthRequired,
    evidence: [
      `healthReadyRequired=${healthRequired}`,
      closure.artifacts.healthUrl ? `healthUrl=${closure.artifacts.healthUrl}` : "healthUrl=derived-or-missing",
      closure.artifacts.readyUrl ? `readyUrl=${closure.artifacts.readyUrl}` : "readyUrl=derived-or-missing"
    ]
  });

  const blockers = checks
    .filter((check) => check.required && check.status !== "PASS")
    .flatMap((check) => check.evidence.some((item) => item === "SOURCE_CLOSURE_TOKEN_REQUIRED")
      ? [`${check.id}:SOURCE_CLOSURE_TOKEN_REQUIRED`]
      : [`${check.id}:${check.status}`]);
  const result: SourceClosurePreflightResult = {
    schema: "evopilot-source-closure-preflight/v1",
    loopId: loop.id,
    projectId: loop.projectId,
    sourceProjectId: closure.sourceProjectId,
    provider: closure.repositoryProvider,
    status: blockers.length === 0 ? "PASS" : "FAIL",
    blockers,
    checks,
    capabilities: [
      "non-mutating-source-closure-preflight",
      `${closure.repositoryProvider}-credential-check`,
      "branch-readiness-check",
      "deploy-target-check",
      "autopilot-preflight-gate"
    ],
    nextAction: blockers.some((blocker) => blocker.includes("credentials")) ? "repair-credentials"
      : blockers.some((blocker) => blocker.includes("project") || blocker.includes("provider") || blocker.includes("source-branch")) ? "repair-project"
        : blockers.some((blocker) => blocker.includes("deploy") || blocker.includes("health")) ? "repair-deploy-target"
          : "write-source",
    createdAt: now
  };

  if (options.persist) {
    store.writeLoop({
      ...loop,
      evidenceSets: [
        ...loop.evidenceSets,
        {
          id: `${loop.id}-source-closure-preflight-${Date.now()}`,
          loopRunId: loop.id,
          iterationId: loop.iterations.at(-1)?.id ?? `${loop.id}-source-closure-preflight`,
          validator: "evopilot-source-closure-preflight",
          status: result.status === "PASS" ? "PASS" : "FAIL",
          evidence: [
            `sourceClosure.preflight=${result.status}`,
            `sourceClosure.preflight.nextAction=${result.nextAction}`,
            ...result.blockers.map((blocker) => `sourceClosure.preflight.blocker=${blocker}`),
            ...result.checks.flatMap((check) => [`sourceClosure.preflight.${check.id}=${check.status}`, ...check.evidence])
          ],
          artifacts: [],
          createdAt: now
        }
      ],
      timeline: [
        ...loop.timeline,
        loopTimelineEvent("EVIDENCE", `Source closure preflight ${result.status}.`, {
          provider: closure.repositoryProvider,
          blockers: result.blockers,
          nextAction: result.nextAction
        })
      ],
      updatedAt: now
    });
  }

  return result;
}

export function buildSourceReleaseClosureRun(loop: LoopRun, actor?: string, id?: string, createdAt?: string): SourceReleaseClosureRun {
  const now = new Date().toISOString();
  const closure = loop.sourceClosure;
  const runId = id ?? `${loop.id}-source-release-${Date.now()}`;
  return {
    schema: "evopilot-source-release-closure-run/v1",
    id: runId,
    loopId: loop.id,
    projectId: loop.projectId,
    sourceProjectId: closure.sourceProjectId,
    tenantId: loop.tenantId,
    workspaceId: loop.workspaceId,
    provider: closure.repositoryProvider,
    releaseStrategy: closure.releaseStrategy,
    sourceRef: {
      sourceUrl: closure.sourceUrl,
      sourceRoot: closure.sourceRoot,
      sourceBranch: closure.sourceBranch,
      releaseBranch: closure.artifacts.branch
    },
    targetVersion: closure.targetVersion,
    deploymentEnvironment: closure.deploymentEnvironment ?? "production",
    status: closure.closureState,
    stages: buildSourceReleaseClosureStages(closure),
    artifacts: closure.artifacts,
    review: sourceReleaseReviewState(closure),
    policy: sourceReleasePolicyState(closure),
    postMergeDeployment: sourceReleasePostMergeDeploymentState(closure),
    capabilities: sourceReleaseClosureCapabilities(closure),
    nextAction: sourceReleaseClosureNextAction(closure),
    createdAt: createdAt ?? now,
    updatedAt: now,
    actor
  };
}

export function buildSourceReleaseClosureStages(closure: LoopSourceClosure): SourceReleaseClosureRun["stages"] {
  const gateStages = closure.requiredGates.map((gate) => {
    const row = closure.gateEvidence[gate];
    return {
      gate,
      label: sourceClosureGateLabel(gate),
      status: row?.status ?? "PENDING",
      evidence: row?.evidence ?? [],
      checkedAt: row?.checkedAt
    };
  });
  const review = sourceReleaseReviewState(closure);
  const policy = sourceReleasePolicyState(closure);
  return [
    ...gateStages,
    {
      gate: "review",
      label: "Approve release review",
      status: review.status === "REJECTED" ? "FAILED" : review.status === "APPROVED" || review.status === "MERGED" || review.status === "NOT_REQUIRED" ? "PASSED" : "PENDING",
      evidence: [
        `reviewStatus=${review.status}`,
        ...(review.reviewUrl ? [`reviewUrl=${review.reviewUrl}`] : []),
        ...(review.approvedBy ? [`approvedBy=${review.approvedBy}`] : []),
        ...(review.rejectedBy ? [`rejectedBy=${review.rejectedBy}`] : [])
      ],
      checkedAt: review.approvedAt ?? review.rejectedAt
    },
    {
      gate: "policy",
      label: "Evaluate release policy",
      status: policy.evaluatedAt ? policy.status === "PASS" ? "PASSED" : "FAILED" : "PENDING",
      evidence: [
        `policyStatus=${policy.status}`,
        `autoMerge=${policy.autoMerge}`,
        ...policy.blockers.map((blocker) => `policyBlocker=${blocker}`)
      ],
      checkedAt: policy.evaluatedAt
    },
    {
      gate: "merge",
      label: "Merge release review",
      status: review.status === "MERGED" || review.status === "NOT_REQUIRED" ? "PASSED" : review.status === "REJECTED" ? "SKIPPED" : "PENDING",
      evidence: [
        `reviewStatus=${review.status}`,
        ...(review.mergeCommitSha ? [`mergeCommitSha=${review.mergeCommitSha}`] : []),
        ...(review.mergedBy ? [`mergedBy=${review.mergedBy}`] : [])
      ],
      checkedAt: review.mergedAt
    }
  ];
}

export function sourceReleaseReviewState(closure: LoopSourceClosure): SourceReleaseClosureRun["review"] {
  const artifacts = closure.artifacts;
  const reviewUrl = artifacts.pullRequestUrl ?? artifacts.mergeRequestUrl;
  const status = artifacts.reviewStatus ?? (reviewUrl ? "PENDING" : "NOT_REQUIRED");
  return {
    status,
    reviewUrl,
    approvedBy: artifacts.approvedBy,
    approvedAt: artifacts.approvedAt,
    rejectedBy: artifacts.rejectedBy,
    rejectedAt: artifacts.rejectedAt,
    mergedBy: artifacts.mergedBy,
    mergedAt: artifacts.mergedAt,
    mergeCommitSha: artifacts.mergeCommitSha
  };
}

export function sourceReleasePolicyState(closure: LoopSourceClosure): SourceReleaseClosureRun["policy"] {
  const artifacts = closure.artifacts;
  const status = artifacts.policyStatus ?? "PASS";
  return {
    status,
    evaluatedAt: artifacts.policyEvaluatedAt,
    autoMerge: artifacts.autoMerge === true,
    blockers: artifacts.policyBlockers ?? [],
    checks: [
      {
        id: "policy-state",
        status: status === "PASS" ? "PASS" : "FAIL",
        evidence: [
          `policyStatus=${status}`,
          ...(artifacts.policyBlockers ?? []).map((blocker) => `policyBlocker=${blocker}`)
        ],
        required: true
      }
    ]
  };
}

export function sourceReleasePostMergeDeploymentState(closure: LoopSourceClosure): SourceReleaseClosureRun["postMergeDeployment"] {
  const artifacts = closure.artifacts;
  if (!artifacts.postMergeDeployStatus) return undefined;
  return {
    status: artifacts.postMergeDeployStatus,
    deployedAt: artifacts.postMergeDeployAt,
    deployedBy: artifacts.postMergeDeployBy,
    deploymentId: artifacts.deploymentId,
    deploymentUrl: artifacts.deploymentUrl,
    healthUrl: artifacts.healthUrl,
    readyUrl: artifacts.readyUrl,
    evidence: [
      `postMergeDeploy=${artifacts.postMergeDeployStatus}`,
      ...(artifacts.deploymentId ? [`deploymentId=${artifacts.deploymentId}`] : []),
      ...(artifacts.deploymentUrl ? [`deploymentUrl=${artifacts.deploymentUrl}`] : [])
    ]
  };
}

export function sourceClosureGateLabel(gate: SourceReleaseClosureStage): string {
  return {
    "code-change": "Write source change",
    push: "Create release branch",
    tag: "Create release tag",
    deploy: "Deploy to environment",
    "health-ready": "Probe health and ready",
    review: "Approve release review",
    policy: "Evaluate release policy",
    merge: "Merge release review"
  }[gate];
}

export function sourceReleaseClosureCapabilities(closure: LoopSourceClosure): string[] {
  return [
    `${closure.repositoryProvider}-source`,
    closure.releaseStrategy,
    "branch-commit-review",
    "review-approval",
    "release-policy-gate",
    "safe-auto-merge",
    "merge-tracking",
    "post-merge-deploy-closure",
    "durable-post-merge-deploy-finalizer",
    ...(closure.requiredGates.includes("tag") ? ["version-tag"] : []),
    ...(closure.requiredGates.includes("deploy") ? ["deploy-connector"] : []),
    ...(closure.requiredGates.includes("health-ready") ? ["health-ready-probe"] : []),
    "auditable-release-run"
  ];
}

export function sourceReleaseClosureNextAction(closure: LoopSourceClosure): SourceReleaseClosureRun["nextAction"] {
  const review = sourceReleaseReviewState(closure);
  if (review.status === "REJECTED") return "failed";
  if (closure.artifacts.policyStatus === "BLOCKED") return "policy-review";
  if (review.status === "PENDING") return "approve-review";
  if (review.status === "APPROVED") return "merge-review";
  if (closure.closureState === "PROMOTED") return "promoted";
  if (closure.closureState === "FAILED" || closure.closureState === "HEALTH_FAILED") return "failed";
  if (closure.closureState === "ROLLED_BACK") return "rollback";
  const gate = nextPendingGate(closure.requiredGates, closure.gateEvidence);
  if (gate === "code-change") return "write-source";
  if (gate === "push") return "open-review";
  if (gate === "tag") return "tag";
  if (gate === "deploy") return "deploy";
  return "probe-health";
}

export async function executeLocalGitSourceClosure(repository: ProjectRepositoryRegistration, input: {
  loop: LoopRun;
  files: Array<{ path: string; content: string }>;
  branch: string;
  commitMessage: string;
  tagName?: string;
  allowDirtyWorktree: boolean;
}): Promise<{ commitSha: string; reviewUrl: string; branchEvidence: string[]; evidence: string[] }> {
  if (!repository.root) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_ROOT_REQUIRED", "local-git source closure requires repository.root.");
  const root = path.resolve(repository.root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_ROOT_NOT_FOUND", `local-git root not found: ${root}`);
  const commandResults: Array<{ name: string; exitCode: number; output: string }> = [];
  const status = await runBoundedCommand({ command: "git", args: ["status", "--porcelain"], cwd: root, timeoutSeconds: 30 });
  commandResults.push({ name: "git status", exitCode: status.exitCode, output: status.output });
  if (status.exitCode !== 0) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_STATUS_FAILED", status.output);
  if (!input.allowDirtyWorktree && status.output.trim()) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_DIRTY", "local-git source closure requires a clean worktree unless allowDirtyWorktree=true.");
  const branchExists = await runBoundedCommand({ command: "git", args: ["rev-parse", "--verify", input.branch], cwd: root, timeoutSeconds: 30 });
  commandResults.push({ name: "git rev-parse branch", exitCode: branchExists.exitCode, output: branchExists.output });
  const switchArgs = branchExists.exitCode === 0 ? ["switch", input.branch] : ["switch", "-c", input.branch];
  const switched = await runBoundedCommand({ command: "git", args: switchArgs, cwd: root, timeoutSeconds: 30 });
  commandResults.push({ name: "git switch", exitCode: switched.exitCode, output: switched.output });
  if (switched.exitCode !== 0) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_SWITCH_FAILED", switched.output);
  for (const file of input.files) {
    const target = path.resolve(root, file.path);
    if (!isUnderPath(target, root)) throw httpError(400, "SOURCE_CLOSURE_FILE_OUTSIDE_ROOT", `Refusing to write outside repository root: ${file.path}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
  if (input.files.length > 0) {
    const add = await runBoundedCommand({ command: "git", args: ["add", "--", ...input.files.map((file) => file.path)], cwd: root, timeoutSeconds: 30 });
    commandResults.push({ name: "git add", exitCode: add.exitCode, output: add.output });
    if (add.exitCode !== 0) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_ADD_FAILED", add.output);
    const commit = await runBoundedCommand({
      command: "git",
      args: ["-c", "user.name=EvoPilot", "-c", "user.email=evopilot@local", "commit", "-m", input.commitMessage],
      cwd: root,
      timeoutSeconds: 60
    });
    commandResults.push({ name: "git commit", exitCode: commit.exitCode, output: commit.output });
    if (commit.exitCode !== 0 && !commit.output.includes("nothing to commit")) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_COMMIT_FAILED", commit.output);
  }
  const head = await runBoundedCommand({ command: "git", args: ["rev-parse", "--short", "HEAD"], cwd: root, timeoutSeconds: 30 });
  commandResults.push({ name: "git rev-parse head", exitCode: head.exitCode, output: head.output });
  if (head.exitCode !== 0) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_HEAD_FAILED", head.output);
  const commitSha = head.output.trim().split(/\s+/)[0];
  if (input.tagName) {
    const tag = await runBoundedCommand({ command: "git", args: ["tag", input.tagName, commitSha], cwd: root, timeoutSeconds: 30 });
    commandResults.push({ name: "git tag", exitCode: tag.exitCode, output: tag.output });
    if (tag.exitCode !== 0 && !tag.output.includes("already exists")) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_TAG_FAILED", tag.output);
  }
  return {
    commitSha,
    reviewUrl: `${pathToFileURL(root).href}#${encodeURIComponent(input.branch)}`,
    branchEvidence: [`branch=${input.branch}`, `localRoot=${root}`, `commitSha=${commitSha}`],
    evidence: [
      `localGit.root=${root}`,
      `localGit.branch=${input.branch}`,
      `localGit.commit=${commitSha}`,
      ...commandEvidence(commandResults)
    ]
  };
}

export async function mergeLocalGitSourceClosure(repository: ProjectRepositoryRegistration, loop: LoopRun, artifacts: LoopSourceClosure["artifacts"], commitMessage: string, actor: string): Promise<{ mergeCommitSha?: string; evidence: string[] }> {
  if (!repository.root) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_ROOT_REQUIRED", "local-git merge requires repository.root.");
  const root = path.resolve(repository.root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_ROOT_NOT_FOUND", `local-git root not found: ${root}`);
  const branch = artifacts.branch;
  if (!branch) throw httpError(409, "SOURCE_CLOSURE_RELEASE_BRANCH_REQUIRED", "local-git merge requires a release branch.");
  const commandResults: Array<{ name: string; exitCode: number; output: string }> = [];
  const status = await runBoundedCommand({ command: "git", args: ["status", "--porcelain"], cwd: root, timeoutSeconds: 30 });
  commandResults.push({ name: "git status", exitCode: status.exitCode, output: status.output });
  if (status.exitCode !== 0) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_STATUS_FAILED", status.output);
  if (status.output.trim()) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_DIRTY", "local-git merge requires a clean worktree.");
  const sourceBranch = loop.sourceClosure.sourceBranch;
  const checkout = await runBoundedCommand({ command: "git", args: ["switch", sourceBranch], cwd: root, timeoutSeconds: 30 });
  commandResults.push({ name: "git switch source", exitCode: checkout.exitCode, output: checkout.output });
  if (checkout.exitCode !== 0) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_SWITCH_FAILED", checkout.output);
  const merge = await runBoundedCommand({
    command: "git",
    args: ["-c", "user.name=EvoPilot", "-c", "user.email=evopilot@local", "merge", "--no-ff", branch, "-m", commitMessage],
    cwd: root,
    timeoutSeconds: 60
  });
  commandResults.push({ name: "git merge", exitCode: merge.exitCode, output: merge.output });
  if (merge.exitCode !== 0 && !merge.output.includes("Already up to date")) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_MERGE_FAILED", merge.output);
  const head = await runBoundedCommand({ command: "git", args: ["rev-parse", "--short", "HEAD"], cwd: root, timeoutSeconds: 30 });
  commandResults.push({ name: "git rev-parse merged head", exitCode: head.exitCode, output: head.output });
  if (head.exitCode !== 0) throw httpError(409, "SOURCE_CLOSURE_LOCAL_GIT_HEAD_FAILED", head.output);
  const mergeCommitSha = head.output.trim().split(/\s+/)[0];
  return {
    mergeCommitSha,
    evidence: [
      `localGit.root=${root}`,
      `localGit.sourceBranch=${sourceBranch}`,
      `localGit.releaseBranch=${branch}`,
      `localGit.mergeCommit=${mergeCommitSha}`,
      `mergedBy=${actor}`,
      ...commandEvidence(commandResults)
    ]
  };
}

export function defaultClosureBranch(loop: LoopRun): string {
  const version = loop.sourceClosure.targetVersion ? `-${safeFileName(loop.sourceClosure.targetVersion)}` : "";
  return `evopilot/${safeFileName(loop.id)}${version}`;
}

export function repositoryToken(store: FileStore, repository: ProjectRepositoryRegistration, scope?: { tenantId?: string; workspaceId?: string }): string | undefined {
  if (repository.credentials?.token) return repository.credentials.token;
  if (repository.credentials?.password) return repository.credentials.password;
  if (repository.credentials?.tokenRef) return resolveTokenRef(store, repository.credentials.tokenRef, scope);
  return undefined;
}

export async function executeDeployConnector(store: FileStore, connectorId: string, input: {
  loop: LoopRun;
  actor: string;
  artifacts: LoopSourceClosure["artifacts"];
  parameters: Record<string, unknown>;
}): Promise<{
  status: "SUCCEEDED" | "FAILED";
  deploymentId?: string;
  deploymentUrl?: string;
  statusUrl?: string;
  healthUrl?: string;
  readyUrl?: string;
  evidence: string[];
}> {
  const connector = store.readDeployConnector(connectorId);
  if (!connector) throw httpError(409, "DEPLOY_CONNECTOR_NOT_FOUND", `Deploy connector ${connectorId} is not configured.`);
  if (connector.type === "ecs-docker-compose") {
    return executeEcsDockerComposeDeploy(connector, input);
  }
  const token = connector.token ?? (connector.tokenRef ? process.env[connector.tokenRef] : undefined);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, connector.timeoutSeconds) * 1000);
  const payload = {
    schema: "evopilot-deploy-request/v1",
    loopId: input.loop.id,
    projectId: input.loop.projectId,
    actor: input.actor,
    objective: input.loop.objective,
    targetVersion: input.loop.sourceClosure.targetVersion,
    deploymentEnvironment: input.loop.sourceClosure.deploymentEnvironment ?? "production",
    sourceClosure: {
      sourceProjectId: input.loop.sourceClosure.sourceProjectId,
      repositoryProvider: input.loop.sourceClosure.repositoryProvider,
      sourceUrl: input.loop.sourceClosure.sourceUrl,
      sourceRoot: input.loop.sourceClosure.sourceRoot,
      sourceBranch: input.loop.sourceClosure.sourceBranch,
      releaseStrategy: input.loop.sourceClosure.releaseStrategy
    },
    artifacts: {
      branch: input.artifacts.branch,
      commitSha: input.artifacts.commitSha,
      tag: input.artifacts.tag,
      pullRequestUrl: input.artifacts.pullRequestUrl,
      mergeRequestUrl: input.artifacts.mergeRequestUrl
    },
    parameters: input.parameters
  };
  const webhookUrl = connector.url;
  if (!webhookUrl) throw httpError(409, "DEPLOY_CONNECTOR_URL_REQUIRED", `Deploy connector ${connectorId} does not have a webhook URL.`);
  try {
    const response = await fetch(webhookUrl, {
      method: connector.method ?? "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(connector.headers ?? {})
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    const body = parseOptionalJson(text);
    const deploymentUrl = optionalTrimmedString(body?.deploymentUrl) ?? optionalTrimmedString(body?.url);
    const healthUrl = optionalTrimmedString(body?.healthUrl) ?? joinUrlPath(deploymentUrl, connector.healthPath);
    const readyUrl = optionalTrimmedString(body?.readyUrl) ?? joinUrlPath(deploymentUrl, connector.readyPath);
    const deploymentId = optionalTrimmedString(body?.deploymentId) ?? optionalTrimmedString(body?.id);
    const statusUrl = optionalTrimmedString(body?.statusUrl);
    return {
      status: response.ok ? "SUCCEEDED" : "FAILED",
      deploymentId,
      deploymentUrl,
      statusUrl,
      healthUrl,
      readyUrl,
      evidence: [
        `deployConnector=${connector.id}`,
        `deployConnectorType=${connector.type}`,
        `deployStatus=${response.status}`,
        ...(deploymentId ? [`deploymentId=${deploymentId}`] : []),
        ...(deploymentUrl ? [`deploymentUrl=${deploymentUrl}`] : []),
        ...(statusUrl ? [`deployStatusUrl=${statusUrl}`] : []),
        ...(healthUrl ? [`healthUrl=${healthUrl}`] : []),
        ...(readyUrl ? [`readyUrl=${readyUrl}`] : [])
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "FAILED",
      evidence: [`deployConnector=${connector.id}`, `deployError=${message}`]
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function rollbackDeployConnector(store: FileStore, connectorId: string, input: {
  loop: LoopRun;
  actor: string;
  artifacts: LoopSourceClosure["artifacts"];
  parameters: Record<string, unknown>;
  reason: string;
  healthEvidence: string[];
}): Promise<{ status: "SUCCEEDED" | "FAILED" | "SKIPPED"; evidence: string[] }> {
  const connector = store.readDeployConnector(connectorId);
  if (!connector) {
    return {
      status: "FAILED",
      evidence: [`rollbackConnector=${connectorId}`, "rollbackFailure=deploy connector not configured"]
    };
  }
  const evidence = [
    `rollbackConnector=${connector.id}`,
    `rollbackConnectorType=${connector.type}`,
    `rollbackReason=${input.reason}`
  ];
  if (connector.rollbackOnHealthFailure === false) {
    return {
      status: "SKIPPED",
      evidence: [...evidence, "rollbackStatus=SKIPPED", "rollbackOnHealthFailure=false"]
    };
  }
  if (connector.type === "ecs-docker-compose") {
    return rollbackEcsDockerComposeConnector(connector, input, evidence);
  }
  return rollbackWebhookDeployConnector(connector, input, evidence);
}

export async function rollbackEcsDockerComposeConnector(connector: StoredDeployConnector, input: {
  loop: LoopRun;
  actor: string;
  artifacts: LoopSourceClosure["artifacts"];
  parameters: Record<string, unknown>;
  reason: string;
  healthEvidence: string[];
}, evidence: string[]): Promise<{ status: "SUCCEEDED" | "FAILED"; evidence: string[] }> {
  if (!connector.workingDir) {
    return { status: "FAILED", evidence: [...evidence, "rollbackStatus=FAILED", "rollbackFailure=workingDir missing"] };
  }
  const workingDir = path.resolve(connector.workingDir);
  if (!fs.existsSync(workingDir) || !fs.statSync(workingDir).isDirectory()) {
    return { status: "FAILED", evidence: [...evidence, "rollbackStatus=FAILED", `rollbackFailure=workingDir not found: ${workingDir}`] };
  }
  const stamp = readEcsDeployStamp(workingDir, connector);
  if (!stamp?.beforeCommit) {
    return { status: "FAILED", evidence: [...evidence, "rollbackStatus=FAILED", "rollbackFailure=deploy stamp missing beforeCommit"] };
  }
  const timeoutSeconds = Math.max(1, connector.timeoutSeconds || 120);
  const gitCommand = connector.gitCommand || "git";
  const dockerCommand = connector.dockerCommand || "docker";
  const composeArgs = ["compose", "-f", connector.composeFile || "docker-compose.yml", "up", "-d"];
  if (connector.build !== false) composeArgs.push("--build");
  if (connector.serviceName) composeArgs.push(connector.serviceName);
  const commandResults: Array<{ name: string; exitCode: number; output: string }> = [];
  const status = await rollbackEcsDockerComposeDeploy({
    connector,
    gitCommand,
    dockerCommand,
    composeArgs,
    workingDir,
    timeoutSeconds,
    beforeCommit: stamp.beforeCommit,
    commandResults
  });
  return {
    status,
    evidence: [
      ...evidence,
      `rollbackTargetCommit=${stamp.beforeCommit}`,
      `rollbackReleaseKey=${stamp.releaseKey}`,
      `rollbackStatus=${status}`,
      ...commandEvidence(commandResults)
    ]
  };
}

export async function rollbackWebhookDeployConnector(connector: StoredDeployConnector, input: {
  loop: LoopRun;
  actor: string;
  artifacts: LoopSourceClosure["artifacts"];
  parameters: Record<string, unknown>;
  reason: string;
  healthEvidence: string[];
}, evidence: string[]): Promise<{ status: "SUCCEEDED" | "FAILED" | "SKIPPED"; evidence: string[] }> {
  if (!connector.rollbackUrl) {
    return { status: "SKIPPED", evidence: [...evidence, "rollbackStatus=SKIPPED", "rollbackUrl=not-configured"] };
  }
  const token = connector.token ?? (connector.tokenRef ? process.env[connector.tokenRef] : undefined);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, connector.timeoutSeconds) * 1000);
  try {
    const response = await fetch(connector.rollbackUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(connector.headers ?? {})
      },
      body: JSON.stringify({
        schema: "evopilot-deploy-rollback/v1",
        loopId: input.loop.id,
        projectId: input.loop.projectId,
        actor: input.actor,
        reason: input.reason,
        targetVersion: input.loop.sourceClosure.targetVersion,
        deploymentEnvironment: input.loop.sourceClosure.deploymentEnvironment ?? "production",
        artifacts: input.artifacts,
        healthEvidence: input.healthEvidence,
        parameters: input.parameters
      })
    });
    const text = await response.text();
    const body = parseOptionalJson(text);
    const rollbackId = optionalTrimmedString(body?.rollbackId) ?? optionalTrimmedString(body?.id);
    return {
      status: response.ok ? "SUCCEEDED" : "FAILED",
      evidence: [
        ...evidence,
        `rollbackStatus=${response.ok ? "SUCCEEDED" : "FAILED"}`,
        `rollbackHttpStatus=${response.status}`,
        ...(rollbackId ? [`rollbackId=${rollbackId}`] : [])
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "FAILED", evidence: [...evidence, "rollbackStatus=FAILED", `rollbackError=${message}`] };
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeEcsDockerComposeDeploy(connector: StoredDeployConnector, input: {
  loop: LoopRun;
  actor: string;
  artifacts: LoopSourceClosure["artifacts"];
  parameters: Record<string, unknown>;
}): Promise<{
  status: "SUCCEEDED" | "FAILED";
  deploymentId?: string;
  deploymentUrl?: string;
  statusUrl?: string;
  healthUrl?: string;
  readyUrl?: string;
  evidence: string[];
}> {
  if (!connector.workingDir) throw httpError(409, "ECS_DEPLOY_WORKING_DIR_REQUIRED", "ECS Docker Compose deploy connector requires workingDir.");
  const workingDir = path.resolve(connector.workingDir);
  if (!fs.existsSync(workingDir) || !fs.statSync(workingDir).isDirectory()) {
    throw httpError(409, "ECS_DEPLOY_WORKING_DIR_NOT_FOUND", `Deploy workingDir does not exist: ${workingDir}`);
  }
  const timeoutSeconds = Math.max(1, connector.timeoutSeconds || 120);
  const gitCommand = connector.gitCommand || "git";
  const dockerCommand = connector.dockerCommand || "docker";
  const composeFile = connector.composeFile || "docker-compose.yml";
  const serviceName = connector.serviceName;
  const gitRemote = connector.gitRemote || "origin";
  const gitBranch = connector.gitBranch || "main";
  const commandResults: Array<{ name: string; exitCode: number; output: string }> = [];
  const evidence = [
    `deployConnector=${connector.id}`,
    `deployConnectorType=${connector.type}`,
    `workingDir=${workingDir}`,
    `composeFile=${composeFile}`,
    ...(serviceName ? [`serviceName=${serviceName}`] : []),
    ...(input.artifacts.commitSha ? [`sourceCommit=${input.artifacts.commitSha}`] : []),
    ...(input.artifacts.tag ? [`sourceTag=${input.artifacts.tag}`] : [])
  ];
  const releaseKey = ecsDeployReleaseKey(input);
  evidence.push(`releaseKey=${releaseKey}`);
  const lock = connector.deployLock === false ? undefined : acquireEcsDeployLock(workingDir, connector, input, releaseKey);
  if (connector.deployLock !== false && !lock) {
    return ecsDeployResult(connector, "FAILED", evidence, commandResults, undefined, "deploy lock is already held");
  }
  if (lock) evidence.push(`deployLock=${lock.file}`);
  try {
    const before = await runBoundedCommand({
      command: gitCommand,
      args: ["rev-parse", "--short", "HEAD"],
      cwd: workingDir,
      timeoutSeconds
    });
    commandResults.push({ name: "git rev-parse", exitCode: before.exitCode, output: before.output });
    if (before.exitCode !== 0) {
      return ecsDeployResult(connector, "FAILED", evidence, commandResults, undefined, "git rev-parse failed");
    }
    const beforeCommit = before.output.trim().split(/\s+/)[0];
    evidence.push(`beforeCommit=${beforeCommit}`);
    const previousStamp = connector.idempotency === false ? undefined : readEcsDeployStamp(workingDir, connector);
    if (previousStamp?.releaseKey === releaseKey) {
      evidence.push("idempotentReplay=true", `idempotentDeploymentId=${previousStamp.deploymentId}`);
      return ecsDeployResult(connector, "SUCCEEDED", evidence, commandResults, previousStamp.deploymentId);
    }
    if (connector.gitPull !== false) {
      const preserved = await preserveEcsLocalPaths({
        connector,
        gitCommand,
        workingDir,
        timeoutSeconds,
        commandResults
      });
      if (preserved.status === "FAILED") {
        return ecsDeployResult(connector, "FAILED", evidence, commandResults, beforeCommit, preserved.failure);
      }
      evidence.push(...preserved.evidence);
      const pull = await runBoundedCommand({
        command: gitCommand,
        args: ["pull", "--ff-only", gitRemote, gitBranch],
        cwd: workingDir,
        timeoutSeconds
      });
      commandResults.push({ name: "git pull", exitCode: pull.exitCode, output: pull.output });
      if (pull.exitCode !== 0) {
        return ecsDeployResult(connector, "FAILED", evidence, commandResults, beforeCommit, "git pull failed");
      }
      const restored = await restoreEcsLocalPaths({
        gitCommand,
        workingDir,
        timeoutSeconds,
        commandResults,
        stashCreated: preserved.stashCreated
      });
      if (restored.status === "FAILED") {
        return ecsDeployResult(connector, "FAILED", evidence, commandResults, beforeCommit, restored.failure);
      }
      evidence.push(...restored.evidence);
    }
    const after = await runBoundedCommand({
      command: gitCommand,
      args: ["rev-parse", "--short", "HEAD"],
      cwd: workingDir,
      timeoutSeconds
    });
    commandResults.push({ name: "git rev-parse after", exitCode: after.exitCode, output: after.output });
    if (after.exitCode !== 0) {
      return ecsDeployResult(connector, "FAILED", evidence, commandResults, beforeCommit, "git rev-parse after failed");
    }
    const afterCommit = after.output.trim().split(/\s+/)[0];
    evidence.push(`afterCommit=${afterCommit}`);
    if (connector.skipComposeWhenUnchanged === true && afterCommit === beforeCommit) {
      evidence.push("composeSkipped=unchanged");
      if (connector.idempotency !== false) {
        writeEcsDeployStamp(workingDir, connector, {
          releaseKey,
          deploymentId: afterCommit,
          beforeCommit,
          afterCommit,
          loopId: input.loop.id,
          updatedAt: new Date().toISOString()
        });
        evidence.push("idempotencyStamp=written");
      }
      return ecsDeployResult(connector, "SUCCEEDED", evidence, commandResults, afterCommit);
    }
    const composeArgs = ["compose", "-f", composeFile, "up", "-d"];
    if (connector.build !== false) composeArgs.push("--build");
    if (serviceName) composeArgs.push(serviceName);
    const compose = await runBoundedCommand({
      command: dockerCommand,
      args: composeArgs,
      cwd: workingDir,
      timeoutSeconds
    });
    commandResults.push({ name: "docker compose up", exitCode: compose.exitCode, output: compose.output });
    if (compose.exitCode !== 0) {
      if (connector.rollbackOnFailure !== false) {
        const rollbackStatus = await rollbackEcsDockerComposeDeploy({
          connector,
          gitCommand,
          dockerCommand,
          composeArgs,
          workingDir,
          timeoutSeconds,
          beforeCommit,
          commandResults
        });
        evidence.push(`rollbackStatus=${rollbackStatus}`);
      }
      return ecsDeployResult(connector, "FAILED", evidence, commandResults, afterCommit, "docker compose up failed");
    }
    if (connector.idempotency !== false) {
      writeEcsDeployStamp(workingDir, connector, {
        releaseKey,
        deploymentId: afterCommit,
        beforeCommit,
        afterCommit,
        loopId: input.loop.id,
        updatedAt: new Date().toISOString()
      });
      evidence.push("idempotencyStamp=written");
    }
    return ecsDeployResult(connector, "SUCCEEDED", evidence, commandResults, afterCommit);
  } finally {
    if (lock) releaseEcsDeployLock(lock);
  }
}

export async function rollbackEcsDockerComposeDeploy(args: {
  connector: StoredDeployConnector;
  gitCommand: string;
  dockerCommand: string;
  composeArgs: string[];
  workingDir: string;
  timeoutSeconds: number;
  beforeCommit: string;
  commandResults: Array<{ name: string; exitCode: number; output: string }>;
}): Promise<"SUCCEEDED" | "FAILED"> {
  const reset = await runBoundedCommand({
    command: args.gitCommand,
    args: ["reset", "--hard", args.beforeCommit],
    cwd: args.workingDir,
    timeoutSeconds: args.timeoutSeconds
  });
  args.commandResults.push({ name: "rollback git reset", exitCode: reset.exitCode, output: reset.output });
  if (reset.exitCode !== 0) return "FAILED";
  const compose = await runBoundedCommand({
    command: args.dockerCommand,
    args: args.composeArgs,
    cwd: args.workingDir,
    timeoutSeconds: args.timeoutSeconds
  });
  args.commandResults.push({ name: "rollback docker compose up", exitCode: compose.exitCode, output: compose.output });
  return compose.exitCode === 0 ? "SUCCEEDED" : "FAILED";
}

export async function preserveEcsLocalPaths(args: {
  connector: StoredDeployConnector;
  gitCommand: string;
  workingDir: string;
  timeoutSeconds: number;
  commandResults: Array<{ name: string; exitCode: number; output: string }>;
}): Promise<{ status: "SUCCEEDED" | "FAILED"; stashCreated: boolean; evidence: string[]; failure?: string }> {
  const paths = normalizeStringList(args.connector.preserveLocalPaths, []);
  if (paths.length === 0) return { status: "SUCCEEDED", stashCreated: false, evidence: [] };
  const stash = await runBoundedCommand({
    command: args.gitCommand,
    args: ["stash", "push", "--include-untracked", "-m", `evopilot-preserve-${args.connector.id}`, "--", ...paths],
    cwd: args.workingDir,
    timeoutSeconds: args.timeoutSeconds
  });
  args.commandResults.push({ name: "git stash preserve-local-paths", exitCode: stash.exitCode, output: stash.output });
  if (stash.exitCode !== 0) {
    return { status: "FAILED", stashCreated: false, evidence: [`preserveLocalPaths=${paths.join(",")}`], failure: "git stash preserve-local-paths failed" };
  }
  const stashCreated = !/No local changes to save/i.test(stash.output);
  return {
    status: "SUCCEEDED",
    stashCreated,
    evidence: [
      `preserveLocalPaths=${paths.join(",")}`,
      `preserveLocalPathsStashed=${stashCreated}`
    ]
  };
}

export async function restoreEcsLocalPaths(args: {
  gitCommand: string;
  workingDir: string;
  timeoutSeconds: number;
  commandResults: Array<{ name: string; exitCode: number; output: string }>;
  stashCreated: boolean;
}): Promise<{ status: "SUCCEEDED" | "FAILED"; evidence: string[]; failure?: string }> {
  if (!args.stashCreated) return { status: "SUCCEEDED", evidence: ["preserveLocalPathsRestored=false"] };
  const pop = await runBoundedCommand({
    command: args.gitCommand,
    args: ["stash", "pop"],
    cwd: args.workingDir,
    timeoutSeconds: args.timeoutSeconds
  });
  args.commandResults.push({ name: "git stash pop preserve-local-paths", exitCode: pop.exitCode, output: pop.output });
  if (pop.exitCode !== 0) {
    return { status: "FAILED", evidence: ["preserveLocalPathsRestored=false"], failure: "git stash pop preserve-local-paths failed" };
  }
  return { status: "SUCCEEDED", evidence: ["preserveLocalPathsRestored=true"] };
}

export function ecsDeployReleaseKey(input: {
  loop: LoopRun;
  artifacts: LoopSourceClosure["artifacts"];
  parameters: Record<string, unknown>;
}): string {
  const explicit = optionalTrimmedString(input.parameters.releaseKey) ?? optionalTrimmedString(input.parameters.idempotencyKey);
  if (explicit) return explicit;
  return [
    input.loop.id,
    input.artifacts.commitSha ?? "no-source-commit",
    input.artifacts.tag ?? "no-tag",
    input.loop.sourceClosure.targetVersion ?? "no-target-version"
  ].join(":");
}

export function ecsDeployRuntimeDir(workingDir: string, child: string): string {
  return path.join(workingDir, ".evopilot", child);
}

export function acquireEcsDeployLock(
  workingDir: string,
  connector: StoredDeployConnector,
  input: { loop: LoopRun; actor: string },
  releaseKey: string
): { file: string } | undefined {
  const lockDir = ecsDeployRuntimeDir(workingDir, "deploy-locks");
  fs.mkdirSync(lockDir, { recursive: true });
  const file = path.join(lockDir, `${safeFileName(connector.id)}.lock`);
  try {
    const fd = fs.openSync(file, "wx");
    fs.writeFileSync(fd, JSON.stringify({
      connectorId: connector.id,
      loopId: input.loop.id,
      actor: input.actor,
      releaseKey,
      pid: process.pid,
      createdAt: new Date().toISOString()
    }, null, 2));
    fs.closeSync(fd);
    return { file };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return undefined;
    throw error;
  }
}

export function releaseEcsDeployLock(lock: { file: string }): void {
  try {
    fs.unlinkSync(lock.file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

interface EcsDeployStamp {
  releaseKey: string;
  deploymentId: string;
  beforeCommit: string;
  afterCommit: string;
  loopId: string;
  updatedAt: string;
}

export function ecsDeployStampFile(workingDir: string, connector: StoredDeployConnector): string {
  const stampDir = ecsDeployRuntimeDir(workingDir, "deploy-stamps");
  fs.mkdirSync(stampDir, { recursive: true });
  return path.join(stampDir, `${safeFileName(connector.id)}.json`);
}

export function readEcsDeployStamp(workingDir: string, connector: StoredDeployConnector): EcsDeployStamp | undefined {
  const file = ecsDeployStampFile(workingDir, connector);
  if (!fs.existsSync(file)) return undefined;
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return isRecord(value)
      && typeof value.releaseKey === "string"
      && typeof value.deploymentId === "string"
      && typeof value.beforeCommit === "string"
      && typeof value.afterCommit === "string"
      && typeof value.loopId === "string"
      && typeof value.updatedAt === "string"
      ? {
        releaseKey: value.releaseKey,
        deploymentId: value.deploymentId,
        beforeCommit: value.beforeCommit,
        afterCommit: value.afterCommit,
        loopId: value.loopId,
        updatedAt: value.updatedAt
      }
      : undefined;
  } catch {
    return undefined;
  }
}

export function writeEcsDeployStamp(workingDir: string, connector: StoredDeployConnector, stamp: EcsDeployStamp): void {
  atomicWriteJson(ecsDeployStampFile(workingDir, connector), stamp);
}

export function ecsDeployResult(
  connector: StoredDeployConnector,
  status: "SUCCEEDED" | "FAILED",
  evidence: string[],
  commandResults: Array<{ name: string; exitCode: number; output: string }>,
  deploymentId?: string,
  failure?: string
): {
  status: "SUCCEEDED" | "FAILED";
  deploymentId?: string;
  deploymentUrl?: string;
  statusUrl?: string;
  healthUrl?: string;
  readyUrl?: string;
  evidence: string[];
} {
  const deploymentUrl = connector.url;
  const healthUrl = joinUrlPath(deploymentUrl, connector.healthPath);
  const readyUrl = joinUrlPath(deploymentUrl, connector.readyPath);
  return {
    status,
    deploymentId,
    deploymentUrl,
    healthUrl,
    readyUrl,
    evidence: [
      ...evidence,
      `deployStatus=${status}`,
      ...(deploymentId ? [`deploymentId=${deploymentId}`] : []),
      ...(deploymentUrl ? [`deploymentUrl=${deploymentUrl}`] : []),
      ...(healthUrl ? [`healthUrl=${healthUrl}`] : []),
      ...(readyUrl ? [`readyUrl=${readyUrl}`] : []),
      ...(failure ? [`deployFailure=${failure}`] : []),
      ...commandEvidence(commandResults)
    ]
  };
}

export function commandEvidence(commandResults: Array<{ name: string; exitCode: number; output: string }>): string[] {
  return commandResults.flatMap((result) => [
    `command.${safeFileName(result.name)}.exitCode=${result.exitCode}`,
    `command.${safeFileName(result.name)}.output=${truncateText(result.output, 500)}`
  ]);
}

export function sourceClosureEvidenceStatus(state: LoopSourceClosureState): "PASS" | "FAIL" {
  return ["PROMOTED", "HEALTH_READY", "DEPLOYED", "TAGGED", "PUSHED", "CODE_CHANGED"].includes(state) ? "PASS" : "FAIL";
}

export async function runBoundedCommand(args: { command: string; args: string[]; cwd: string; timeoutSeconds: number }): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    const child = spawn(args.command, args.args, {
      cwd: args.cwd,
      shell: false,
      env: process.env
    });
    let output = "";
    const timer = setTimeout(() => {
      timedOut = true;
      output += "\n[evopilot] command timed out";
      child.kill("SIGTERM");
    }, Math.max(1, args.timeoutSeconds) * 1000);
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: 127, output: error.message });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: timedOut ? 124 : Number(code ?? 0), output: truncateText(output, 4000) });
    });
  });
}

export function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...[truncated]`;
}

export function parseOptionalJson(text: string): any | undefined {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function joinUrlPath(baseUrl: string | undefined, suffix: string | undefined): string | undefined {
  if (!baseUrl || !suffix) return undefined;
  return `${baseUrl.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`;
}

export async function ignoreAlreadyExists<T>(operation: () => Promise<T>): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/409|422|already exists|already_exist|already/i.test(message)) return undefined;
    throw error;
  }
}

export function markGate(gateEvidence: LoopSourceClosure["gateEvidence"], gate: LoopSourceClosureGate, status: NonNullable<LoopSourceClosure["gateEvidence"][LoopSourceClosureGate]>["status"], evidence: string[], checkedAt: string): void {
  gateEvidence[gate] = { status, evidence, checkedAt };
}

export function nextPendingGate(requiredGates: LoopSourceClosureGate[], gateEvidence: LoopSourceClosure["gateEvidence"]): LoopSourceClosureGate {
  return requiredGates.find((gate) => gateEvidence[gate]?.status !== "PASSED") ?? requiredGates[0] ?? "code-change";
}

export function requiredSourceClosureGatesPassed(requiredGates: LoopSourceClosureGate[], gateEvidence: LoopSourceClosure["gateEvidence"]): boolean {
  return requiredGates.every((gate) => gateEvidence[gate]?.status === "PASSED" || gateEvidence[gate]?.status === "SKIPPED");
}

export async function probeHealthReady(healthUrl?: string, readyUrl?: string): Promise<{ passed: boolean; evidence: string[] }> {
  const targets = [healthUrl, readyUrl].filter((item): item is string => Boolean(item));
  if (targets.length === 0) return { passed: false, evidence: ["healthUrl and readyUrl missing"] };
  const evidence: string[] = [];
  let passed = true;
  for (const target of targets) {
    try {
      const response = await fetch(target, { method: "GET" });
      evidence.push(`${target}=${response.status}`);
      if (!response.ok) passed = false;
    } catch (error) {
      passed = false;
      evidence.push(`${target}=${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { passed, evidence };
}

export function decideLoopIteration(loop: LoopRun, nextIndex: number, steps: ExecutorStepResult[], evidenceSet: LoopEvidenceSet, forceDecision?: LoopDecision): LoopDecision {
  if (forceDecision === "REPAIR" || forceDecision === "FAIL") {
    const recentFailureCount = countRecentLoopFailure(loop) + 1;
    return recentFailureCount >= loop.stopPolicy.stopOnRepeatedFailure ? "BLOCK" : forceDecision;
  }
  if (forceDecision) return forceDecision;
  if (steps.some((step) => step.status === "WAITING_APPROVAL")) return "WAIT_APPROVAL";
  const failureCount = steps.filter((step) => step.status === "FAILED").length;
  if (failureCount > 0) {
    const recentFailureCount = countRecentLoopFailure(loop) + 1;
    return recentFailureCount >= loop.stopPolicy.stopOnRepeatedFailure ? "BLOCK" : "REPAIR";
  }
  if (evidenceSet.status === "PASS" && nextIndex >= loop.stopPolicy.maxIterations) return "SUCCEED";
  return "CONTINUE";
}

export function countRecentLoopFailure(loop: LoopRun): number {
  let count = 0;
  for (const iteration of [...loop.iterations].reverse()) {
    if (iteration.decision === "REPAIR" || iteration.decision === "BLOCK" || iteration.decision === "FAIL") count += 1;
    else break;
  }
  return count;
}

export function loopStatusFromDecision(decision: LoopDecision): LoopRunStatus {
  if (decision === "SUCCEED") return "SUCCEEDED";
  if (decision === "FAIL") return "FAILED";
  if (decision === "BLOCK") return "BLOCKED";
  if (decision === "WAIT_APPROVAL") return "WAITING_APPROVAL";
  return "RUNNING";
}

export function loopDecisionRationale(decision: LoopDecision, failedSteps: ExecutorStepResult[]): string {
  if (decision === "CONTINUE") return "Loop evidence passed and stop policy has not been reached";
  if (decision === "SUCCEED") return "Loop reached objective stop policy with passing evidence";
  if (decision === "WAIT_APPROVAL") return "Human approval is required before release or high-risk continuation";
  if (decision === "REPAIR") return failedSteps[0]?.failureSignature ?? "Executor failure requires remediation";
  if (decision === "BLOCK") return "Repeated failure or stop policy blocked further automatic execution";
  return "Loop failed by explicit decision";
}

export function loopTimelineEvent(type: LoopTimelineEvent["type"], message: string, metadata?: Record<string, unknown>): LoopTimelineEvent {
  return {
    id: `loop-event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    message,
    timestamp: new Date().toISOString(),
    metadata
  };
}

export function loopArtifact(type: LoopArtifact["type"], label: string, artifactPath?: string, url?: string): LoopArtifact {
  return {
    id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    label,
    path: artifactPath,
    url,
    createdAt: new Date().toISOString()
  };
}

export function definedOnly<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

export function normalizeEvolutionBatchStatus(value: unknown): EvolutionBatchStatus {
  const allowed: EvolutionBatchStatus[] = ["CANDIDATE", "DRAFT_READY", "CONFIRMED", "CODE_UPGRADING", "CICD_RUNNING", "SUCCEEDED", "FAILED", "SKIPPED"];
  if (allowed.includes(value as EvolutionBatchStatus)) return value as EvolutionBatchStatus;
  throw httpError(400, "EVOLUTION_BATCH_STATUS_INVALID", `不支持的进化批次状态：${String(value)}`);
}

export function normalizeSoakReportStatus(value: unknown): SoakReport["status"] {
  const allowed: SoakReport["status"][] = ["RUNNING", "SUCCEEDED", "FAILED", "STOPPED"];
  if (allowed.includes(value as SoakReport["status"])) return value as SoakReport["status"];
  if (value === undefined || value === null || value === "") return "RUNNING";
  throw httpError(400, "SOAK_REPORT_STATUS_INVALID", `不支持的持续验证状态：${String(value)}`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeRunForSummary(run: StoredRun): StoredRun {
  return {
    ...run,
    pipelineRuns: run.pipelineRuns?.map(sanitizePipelineRun)
  };
}

export function sanitizePipelineRun(pipeline: PipelineRun): PipelineRun {
  return {
    ...pipeline,
    parameters: redactSensitiveRecord(pipeline.parameters),
    logRef: pipeline.logRef
      ? {
        ...pipeline.logRef,
        preview: pipeline.logRef.preview ? redactSensitiveText(pipeline.logRef.preview) : undefined
      }
      : undefined
  };
}

export function redactSensitiveRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [
    key,
    isSensitiveKey(key) ? "[REDACTED]" : redactSensitiveText(value)
  ]));
}

export function isSensitiveKey(key: string): boolean {
  return /token|password|secret|credential|apikey|api_key/i.test(key);
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]")
    .replace(/glpat-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/(token|password|secret|credential|api[_-]?key)([=:]\s*)([^\s"',}]+)/gi, "$1$2[REDACTED]");
}

export function isDatasetAfterCursor(dataset: EvaluationDataset, cursor: ProjectEvolutionCursor): boolean {
  if (!cursor.lastProcessedDatasetTriggeredAt) return true;
  if (dataset.triggeredAt > cursor.lastProcessedDatasetTriggeredAt) return true;
  return dataset.triggeredAt === cursor.lastProcessedDatasetTriggeredAt && !cursor.lastProcessedDatasetIds.includes(dataset.id);
}

export function isStaleEvolutionBatch(batch: EvolutionBatch, now: string, timeoutMinutes: number): boolean {
  const timeoutMs = Math.max(1, timeoutMinutes) * 60 * 1000;
  const lastProgressMs = Date.parse(batch.updatedAt || batch.createdAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(lastProgressMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - lastProgressMs >= timeoutMs;
}

export function batchDatasetRank(dataset: EvaluationDataset): number {
  const severity = ({ HIGH: 40, MEDIUM: 24, LOW: 10 })[dataset.severity];
  const status = ({ REGRESSION_READY: 28, EVALUATED: 18, NEEDS_LABELING: 8, INSUFFICIENT_EVIDENCE: 0 })[dataset.status];
  const samples = Math.min(20, dataset.sampleCount);
  const confidence = Math.round((dataset.confidence ?? 0.5) * 12);
  return severity + status + samples + confidence;
}

export function groupDatasetsForBatches(datasets: EvaluationDataset[], maxDatasetsPerBatch: number): EvaluationDataset[][] {
  const limit = Math.max(1, maxDatasetsPerBatch);
  const grouped = new Map<string, EvaluationDataset[]>();
  for (const dataset of datasets) {
    const key = `${dataset.learningSignal ?? dataset.metric}:${dataset.scope.split("/")[0].trim()}`;
    grouped.set(key, [...(grouped.get(key) ?? []), dataset]);
  }
  return [...grouped.values()]
    .map((items) => items.sort((left, right) => batchDatasetRank(right) - batchDatasetRank(left)).slice(0, limit))
    .sort((left, right) => right.reduce((sum, item) => sum + batchDatasetRank(item), 0) - left.reduce((sum, item) => sum + batchDatasetRank(item), 0));
}

export function createEvolutionBatchFromDatasets(projectId: string, datasets: EvaluationDataset[], runs: StoredRun[], now: string): EvolutionBatch {
  const opportunityIds = [...new Set(datasets.flatMap((dataset) => dataset.opportunityIds ?? []))];
  const opportunities = runs
    .filter((run) => run.evidenceBundle.projectId === projectId)
    .flatMap((run) => run.opportunities.map((opportunity) => ({ run, opportunity })))
    .filter((item) => opportunityIds.includes(item.opportunity.id));
  const ruleIds = [...new Set(opportunities.flatMap((item) => item.opportunity.triggeredRuleIds ?? []))];
  const riskLevel = highestRisk(opportunities.map((item) => item.opportunity.riskLevel), datasets.map((dataset) => dataset.severity));
  const confidence = Math.max(...datasets.map((dataset) => dataset.confidence ?? 0.5), ...opportunities.map((item) => item.opportunity.confidence), 0.5);
  const priorityScore = Math.min(100, Math.round(
    datasets.reduce((sum, dataset) => sum + batchDatasetRank(dataset), 0) / Math.max(1, datasets.length)
  ));
  const first = datasets.reduce((min, dataset) => dataset.triggeredAt < min ? dataset.triggeredAt : min, datasets[0].triggeredAt);
  const last = datasets.reduce((max, dataset) => dataset.triggeredAt > max ? dataset.triggeredAt : max, datasets[0].triggeredAt);
  const primaryOpportunity = opportunities.sort((left, right) => right.opportunity.confidence - left.opportunity.confidence)[0];
  return {
    id: `batch-${safeFileName(projectId)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    status: "CANDIDATE",
    intent: datasets.every((dataset) => isCostOptimizationDataset(dataset, runs)) ? "cost-optimization" : "standard-evolution",
    triggerReason: buildEvolutionBatchTriggerReason(datasets, primaryOpportunity?.opportunity),
    datasetIds: datasets.map((dataset) => dataset.id),
    opportunityIds,
    ruleIds,
    confidence: Number(confidence.toFixed(3)),
    riskLevel,
    priorityScore,
    evidenceWindow: { from: first, to: last },
    watermarks: {
      datasetTriggeredAt: last,
      opportunityRunId: primaryOpportunity?.run.id
    },
    createdAt: now,
    updatedAt: now
  };
}

export function isCostOptimizationDataset(dataset: EvaluationDataset, runs: StoredRun[]): boolean {
  if (dataset.learningSignal === "cost-regression") return true;
  if (/cost|成本|token/i.test(`${dataset.name} ${dataset.metric} ${dataset.scope}`)) return true;
  const opportunityIds = new Set(dataset.opportunityIds ?? []);
  return runs
    .filter((run) => run.evidenceBundle.projectId === dataset.projectId)
    .flatMap((run) => run.opportunities)
    .filter((opportunity) => opportunityIds.has(opportunity.id))
    .some((opportunity) => opportunity.type === "cost-risk" || opportunity.failureAttribution === "cost-regression");
}

export function buildEvolutionBatchTriggerReason(datasets: EvaluationDataset[], opportunity?: EvolutionOpportunity): string {
  const severeCount = datasets.filter((dataset) => dataset.severity === "HIGH").length;
  const regressionCount = datasets.filter((dataset) => dataset.status === "REGRESSION_READY").length;
  const scopes = [...new Set(datasets.map((dataset) => dataset.scope.split("/")[0].trim()).filter(Boolean))].slice(0, 3);
  const base = opportunity?.title ?? (scopes.join("、") || "运行证据触发进化");
  return `${base}；新增 ${datasets.length} 个评测集，其中高严重级别 ${severeCount} 个、可回归 ${regressionCount} 个。`;
}

export function highestRisk(opportunityRisks: Array<EvolutionOpportunity["riskLevel"]>, datasetSeverities: Array<EvaluationDataset["severity"]>): EvolutionBatch["riskLevel"] {
  if (opportunityRisks.includes("HIGH") || datasetSeverities.includes("HIGH")) return "HIGH";
  if (opportunityRisks.includes("MEDIUM") || datasetSeverities.includes("MEDIUM")) return "MEDIUM";
  return "LOW";
}

export function normalizeDecisionAction(value: unknown): ReviewRecord["decisions"][number]["action"] {
  if (value === "accept" || value === "reject" || value === "request-changes" || value === "observe-only") return value;
  throw new Error("Unsupported review decision action");
}

export async function startCodeUpgradeExecution(args: {
  store: FileStore;
  auth: AuthContext;
  run: StoredRun;
  delivery: DeliveryPlan;
  plan: EvolutionPlan;
  review?: ReviewRecord;
  body: any;
  profile: ProjectProfile;
  runtime: RuntimeConfig;
}): Promise<CodeUpgradeRun> {
  const { store, auth, run, delivery, plan, review, body, profile, runtime } = args;
  const connectorId = requireBodyString(body.connectorId, "CODE_UPGRADE_CONNECTOR_ID_REQUIRED", runtime, "default");
  const connector = store.readCodeUpgraderConnector(connectorId);
  if (!connector) throw new Error("CODE_UPGRADER_CONNECTOR_NOT_CONFIGURED");
  const project = store.readProject(delivery.projectId);
  if (!project?.repository && runtime.mode === "prod") throw new Error("PROJECT_REPOSITORY_NOT_CONFIGURED");
  const proposalMarkdown = String(body.proposalMarkdown ?? body.PROPOSAL_MARKDOWN ?? renderPlanMarkdown(plan));
  const validationPlan = resolveProjectValidationPlan(project, body);
  const validationCommands = validationPlanToCommands(validationPlan, normalizeValidationCommands(body.validationCommands ?? plan.validationContract.commands));
  const diagnostic = await diagnoseProjectRuntime({ store, project, runtime });
  const blockingDiagnostic = codeUpgradeBlockingDiagnostic(diagnostic);
  if (blockingDiagnostic) throw new Error(`PROJECT_RUNTIME_DIAGNOSTIC_FAILED: ${blockingDiagnostic.remediation ?? blockingDiagnostic.detail}`);
  const codeContext = await collectProjectCodeContext({ store, project, runtime, profile, focusFiles: codeUpgradeFocusFiles(run) });
  if (runtime.mode === "prod" && codeContext.status !== "AVAILABLE") {
    throw new Error(`PROJECT_CODE_CONTEXT_UNAVAILABLE: ${codeContext.unavailableReason ?? codeContext.summary}`);
  }
  const allowedPaths = inferCodeUpgradeAllowedPaths(codeContext, codeUpgradeFocusFiles(run));
  const branchStrategy = createBranchStrategy({ projectId: delivery.projectId, sourceBranch: project?.repository?.defaultBranch, delivery, plan, body });
  logInfo("code-upgrade.starting", {
    actor: auth.actor,
    target: delivery.id,
    metadata: {
      projectId: delivery.projectId,
      connectorId,
      planId: plan.id,
      reviewId: review?.id,
      sourceBranch: branchStrategy.sourceBranch,
      upgradeBranch: branchStrategy.upgradeBranch,
      validationCommandCount: validationCommands.length,
      allowedPaths
    }
  });
  const session = await new CodeUpgraderClient(connector).startCodeUpgrade({
    projectId: delivery.projectId,
    repository: project?.repository ? {
      provider: project.repository.provider,
      gitUrl: project.repository.gitUrl,
      root: project.repository.root,
      branch: branchStrategy.sourceBranch,
      sourceBranch: branchStrategy.sourceBranch,
      upgradeBranch: branchStrategy.upgradeBranch,
      username: project.repository.credentials?.username,
      password: project.repository.credentials?.password,
      token: project.repository.credentials?.token,
      tokenRef: project.repository.credentials?.tokenRef
    } : undefined,
    branchStrategy,
    proposalMarkdown,
    codeContext: codeContext.status === "AVAILABLE" ? codeContext.selectedFiles : undefined,
    validationCommands,
    validationPlan,
    allowedPaths,
    protectedPaths: profile.policy.protectedPaths
  });
  const now = new Date().toISOString();
  const codeUpgrade: CodeUpgradeRun = {
    id: `code-upgrade-${delivery.id}-${Date.now()}`,
    projectId: delivery.projectId,
    deliveryPlanId: delivery.id,
    planId: plan.id,
    reviewId: review?.id,
    executor: "code-upgrader",
    status: session.status,
    proposalMarkdown,
    validationCommands,
    branchStrategy,
    codeUpgrader: {
      connectorId,
      workspaceId: session.workspaceId,
      conversationId: session.conversationId
    },
    artifacts: {},
    createdAt: now,
    updatedAt: now
  };
  store.writeCodeUpgradeRun(codeUpgrade);
  store.appendCodeUpgradeEvent({
    id: `event-${codeUpgrade.id}-created`,
    codeUpgradeRunId: codeUpgrade.id,
    timestamp: now,
    source: "evopilot",
    phase: "创建代码升级任务",
    level: "info",
    message: `用户确认进化方案后，EvoPilot 已创建代码升级任务，升级分支：${branchStrategy.upgradeBranch}。`
  });
  store.appendAudit(audit(auth, "code-upgrade.started", codeUpgrade.id, { deliveryId: delivery.id, connectorId, conversationId: session.conversationId, branchStrategy }));
  logInfo("code-upgrade.started", {
    actor: auth.actor,
    target: codeUpgrade.id,
    metadata: {
      projectId: codeUpgrade.projectId,
      deliveryPlanId: delivery.id,
      connectorId,
      conversationId: session.conversationId,
      status: codeUpgrade.status
    }
  });
  return refreshCodeUpgradeRun(store, codeUpgrade.id).then((updated) => updated ?? codeUpgrade);
}

export function codeUpgradeBlockingDiagnostic(diagnostic: ProjectRuntimeDiagnostic): ProjectRuntimeDiagnostic["checks"][number] | undefined {
  return diagnostic.checks.find((check) => check.status === "FAILED" && [
    "项目注册验证",
    "服务验证编排",
    "代码升级运行时"
  ].includes(check.name));
}

export function inferCodeUpgradeAllowedPaths(codeContext: ProjectCodeContext, focusFiles: string[] = []): string[] {
  const base = new Set([".evopilot/runtime-upgrades", "docs/evopilot-upgrades"]);
  for (const file of focusFiles) {
    const pathName = normalizeRelativePathForPolicy(file);
    if (!pathName || pathName.startsWith("docs/") || pathName.startsWith(".evopilot/")) continue;
    const first = pathName.split("/")[0];
    if (["node_modules", "dist", "build", "target", ".git", ".venv", "__pycache__"].includes(first)) continue;
    if (pathName.includes("/")) base.add(first);
    else base.add(pathName);
  }
  if (codeContext.status !== "AVAILABLE") return [...base];
  for (const root of codeContext.writableRoots ?? []) base.add(root);
  for (const file of codeContext.selectedFiles) {
    const pathName = normalizeRelativePathForPolicy(file.path);
    if (!pathName || pathName.startsWith("docs/") || pathName.startsWith(".evopilot/")) continue;
    const first = pathName.split("/")[0];
    if (["node_modules", "dist", "build", "target", ".git", ".venv", "__pycache__"].includes(first)) continue;
    if (pathName.includes("/")) base.add(first);
    else base.add(pathName);
  }
  for (const fallback of ["src", "app", "server", "lib", "tests", "test", "scripts", "config", "package.json", "pyproject.toml", "requirements.txt", "pom.xml", "go.mod", "Dockerfile"]) {
    base.add(fallback);
  }
  return [...base];
}

export function codeUpgradeFocusFiles(run: StoredRun): string[] {
  return uniqueNormalizedPaths(run.impactMaps.flatMap((impactMap) => [
    ...impactMap.likelyFiles,
    ...impactMap.relatedTests
  ]));
}

export function uniqueNormalizedPaths(paths: string[]): string[] {
  return [...new Set(paths.map(normalizeRelativePathForPolicy).filter(Boolean))];
}

export function normalizeRelativePathForPolicy(value: string): string {
  const normalized = String(value ?? "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!normalized || normalized === "." || normalized.includes("\0")) return "";
  const parts = normalized.split("/").filter((part) => part && part !== ".");
  if (parts.includes("..")) return "";
  return parts.join("/");
}

export function createAndStoreRunFromEvidence(args: {
  store: FileStore;
  auth: AuthContext;
  projectId: string;
  events: RuntimeEvidenceEvent[];
  files: string[];
  now: string;
  profile: ProjectProfile;
  idempotencyKey?: string;
  ingestSource: string;
}): StoredRun {
  const { store, auth, projectId, events, files, now, profile, idempotencyKey, ingestSource } = args;
  const project = store.readProject(projectId);
  if (!project) throw httpError(404, "PROJECT_NOT_FOUND");
  if (project.validation.status !== "VERIFIED") throw httpError(409, "PROJECT_NOT_VERIFIED", project.validation.message);
  if (events.length === 0) throw httpError(400, "EVIDENCE_EVENTS_REQUIRED", "至少需要 1 条进化证据事件");
  const runtimeProfile: ProjectProfile = { ...profile, triggerRules: store.readTriggerRules(profile.triggerRules ?? defaultTriggerRules, projectId) };
  const result = runEvolutionCycle({ projectId, profile: runtimeProfile, events, files, now });
  const run: StoredRun = {
    id: result.evidenceBundle.id,
    ...result,
    releaseReports: [],
    learningRecords: []
  };
  store.writeRun(run);
  store.writeEvaluationDatasets(evaluationDatasetsFromRun(run));
  store.appendAudit(audit(auth, "evidence.ingested", run.id, { projectId, ingestSource, eventCount: events.length }));
  store.appendAudit(audit(auth, "run.created", run.id, { projectId, opportunityCount: run.opportunities.length, idempotencyKey, ingestSource }));
  store.appendAudit(audit(auth, "evaluation-datasets.autogenerated", run.id, { projectId, count: run.opportunities.length }));
  return run;
}

export async function refreshCodeUpgradeRun(store: FileStore, codeUpgradeRunId: string): Promise<CodeUpgradeRun | undefined> {
  const run = store.readCodeUpgradeRun(codeUpgradeRunId);
  if (!run) return undefined;
  if (run.status === "SUCCEEDED" || run.status === "FAILED" || run.status === "CANCELED") return run;
  const connector = store.readCodeUpgraderConnector(run.codeUpgrader.connectorId);
  if (!connector) return run;
  const snapshot = await new CodeUpgraderClient(connector).readCodeUpgradeSnapshot(run.codeUpgrader.conversationId);
  const events = [
    ...store.listCodeUpgradeEvents(run.id).filter((event) => event.source === "evopilot"),
    ...snapshot.events.map((event, index): CodeUpgradeEvent => ({
      id: event.id || `code-upgrader-${run.id}-${index}`,
      codeUpgradeRunId: run.id,
      timestamp: event.timestamp ?? new Date().toISOString(),
      source: event.source ?? "code-upgrader",
      phase: event.phase ?? inferCodeUpgradePhase(event.message),
      level: event.level ?? "info",
      message: event.message,
      raw: event.raw
    }))
  ];
  const updated: CodeUpgradeRun = {
    ...run,
    status: snapshot.status,
    codeUpgrader: {
      ...run.codeUpgrader,
      workspaceId: snapshot.workspaceId ?? run.codeUpgrader.workspaceId
    },
    artifacts: {
      ...run.artifacts,
      diffPath: snapshot.diff ? store.writeCodeUpgradeDiff(run.id, snapshot.diff) : run.artifacts.diffPath,
      branchName: snapshot.branchName ?? run.artifacts.branchName,
      commitSha: snapshot.commitSha ?? run.artifacts.commitSha,
      pullRequestUrl: snapshot.pullRequestUrl ?? run.artifacts.pullRequestUrl,
      changedFiles: snapshot.changedFiles ?? run.artifacts.changedFiles
    },
    failureReason: terminalCodeUpgradeFailureReason(snapshot.status, events) ?? run.failureReason,
    error: terminalCodeUpgradeError(snapshot.status, events) ?? run.error,
    updatedAt: new Date().toISOString()
  };
  store.writeCodeUpgradeRun(updated);
  store.writeCodeUpgradeEvents(run.id, dedupeEvents(events));
  if (updated.status !== run.status) {
    logInfo("code-upgrade.status-changed", {
      target: updated.id,
      metadata: {
        projectId: updated.projectId,
        deliveryPlanId: updated.deliveryPlanId,
        previousStatus: run.status,
        status: updated.status,
        conversationId: updated.codeUpgrader.conversationId,
        changedFileCount: updated.artifacts.changedFiles?.length ?? 0,
        commitSha: updated.artifacts.commitSha,
        pullRequestUrl: updated.artifacts.pullRequestUrl,
        failureReason: updated.failureReason,
        error: updated.error
      }
    });
  }
  return updated;
}

export function terminalCodeUpgradeFailureReason(status: CodeUpgraderRunStatus, events: CodeUpgradeEvent[]): string | undefined {
  if (status !== "FAILED" && status !== "CANCELED") return undefined;
  const terminal = [...events].reverse().find((event) => event.level === "error" || /失败|failed|error/i.test(event.message));
  const message = terminal?.message?.trim();
  if (!message) return `代码升级${status === "CANCELED" ? "已取消" : "失败"}`;
  return message.length > 500 ? `${message.slice(0, 500)}...` : message;
}

export function terminalCodeUpgradeError(status: CodeUpgraderRunStatus, events: CodeUpgradeEvent[]): string | undefined {
  if (status !== "FAILED" && status !== "CANCELED") return undefined;
  const terminal = [...events].reverse().find((event) => event.level === "error" || /失败|failed|error/i.test(event.message));
  const raw = terminal?.raw;
  if (raw && typeof raw === "object" && "message" in raw && typeof (raw as { message?: unknown }).message === "string") {
    return (raw as { message: string }).message.slice(0, 4000);
  }
  return terminal?.message?.slice(0, 4000);
}

export function renderPlanMarkdown(plan: EvolutionPlan): string {
  return [
    `# ${plan.problemStatement}`,
    "",
    "## 为什么需要进化",
    plan.whyEvolutionNeeded,
    "",
    "## 方案",
    plan.proposedApproach,
    "",
    "## 预期效果",
    plan.expectedEffect,
    "",
    "## 风险",
    plan.riskAnalysis,
    "",
    "## 回滚计划",
    plan.rollbackPlan
  ].join("\n");
}

export function normalizeValidationCommands(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object" && "command" in item) return String((item as { command: unknown }).command);
    return "";
  }).filter(Boolean);
}

export function inferCodeUpgradePhase(message: string): string {
  if (/方案|plan/i.test(message)) return "读取方案";
  if (/分析|scan|inspect/i.test(message)) return "分析仓库";
  if (/文件|file/i.test(message)) return "定位文件";
  if (/补丁|diff|patch/i.test(message)) return "生成补丁";
  if (/测试|验证|test|check/i.test(message)) return "运行验证";
  return "代码升级";
}

export function dedupeEvents(events: CodeUpgradeEvent[]): CodeUpgradeEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}

export function createBranchStrategy(args: { projectId: string; sourceBranch?: string; delivery: DeliveryPlan; plan: EvolutionPlan; body: any }): CodeUpgradeRun["branchStrategy"] {
  const sourceBranch = String(args.body.sourceBranch ?? args.body.targetBranch ?? args.sourceBranch ?? "main").trim();
  const upgradeBranch = String(args.body.upgradeBranch ?? defaultUpgradeBranch(args.projectId, args.plan.id)).trim();
  const title = args.plan.problemStatement || args.plan.proposedApproach || "进化方案";
  return {
    sourceBranch,
    upgradeBranch,
    commitMessage: String(args.body.commitMessage ?? `EvoPilot: ${title}`).trim(),
    mergeRequestTitle: String(args.body.mergeRequestTitle ?? `EvoPilot 进化方案：${title}`).trim(),
    mergeRequestDescription: String(args.body.mergeRequestDescription ?? renderMergeRequestDescription(args.plan, args.delivery)).trim()
  };
}

export function defaultUpgradeBranch(projectId: string, planId: string): string {
  return `evopilot/upgrade/${safeGitBranchSegment(projectId)}/${safeGitBranchSegment(planId)}-${Date.now()}`;
}

export function safeGitBranchSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^[-/.]+|[-/.]+$/g, "")
    .slice(0, 80) || "change";
}

export function renderMergeRequestDescription(plan: EvolutionPlan, delivery: DeliveryPlan): string {
  return [
    "## EvoPilot 进化方案",
    "",
    `- Plan ID: ${plan.id}`,
    `- Delivery ID: ${delivery.id}`,
    `- 项目: ${delivery.projectId}`,
    "",
    "### 方案摘要",
    "",
    plan.proposedApproach,
    "",
    "### 验证契约",
    "",
    ...plan.validationContract.commands.map((item) => `- ${item.command}`)
  ].join("\n");
}

export async function refreshPipeline(store: FileStore, pipelineId: string): Promise<PipelineRun | undefined> {
  const pipeline = store.readPipeline(pipelineId);
  if (!pipeline) return undefined;
  if (pipeline.provider === "github-actions") return await refreshGitHubActionsPipeline(store, pipeline);
  if (pipeline.provider === "gitlab-ci") return await refreshGitLabCiPipeline(store, pipeline);
  return pipeline;
}

export async function refreshGitHubActionsPipeline(store: FileStore, pipeline: PipelineRun): Promise<PipelineRun> {
  if (pipeline.status === "SUCCEEDED" || pipeline.status === "FAILED" || pipeline.status === "CANCELED") return pipeline;
  const project = store.readProject(pipeline.projectId);
  if (!project?.devops || project.devops.provider !== "github-actions" || !project.repository || project.repository.provider !== "github") return pipeline;
  const token = resolveProjectDevopsToken(project, store);
  if (!token || !project.repository.owner || !project.repository.repo) return pipeline;
  const adapter = new GitHubHttpAdapter({ apiBaseUrl: project.repository.baseUrl, owner: project.repository.owner, repo: project.repository.repo, token });
  const ref = pipeline.parameters.DEVOPS_REF ?? project.devops.ci.ref ?? project.repository.defaultBranch ?? "main";
  const checks = await readGitHubChecksForPipeline(adapter, ref);
  const workflowRuns = project.devops.ci.workflow ? await readGitHubWorkflowRunsForPipeline(adapter, project.devops.ci.workflow, ref) : [];
  const latestRun = workflowRuns[0];
  const status = latestRun ? githubWorkflowRunToPipelineStatus(latestRun.status, latestRun.conclusion)
    : checks.length > 0 ? aggregatePipelineStatuses(checks.map((check) => githubCheckToPipelineStatus(check.status, check.conclusion)))
      : pipeline.status;
  const updated: PipelineRun = {
    ...pipeline,
    status,
    queueId: latestRun ? String(latestRun.id) : pipeline.queueId,
    buildUrl: latestRun?.htmlUrl ?? pipeline.buildUrl,
    stages: checks.length > 0 ? checks.map((check) => ({
      id: safeFileName(check.name || "check"),
      name: check.name || "GitHub check",
      status: pipelineStageStatusFromPipelineStatus(githubCheckToPipelineStatus(check.status, check.conclusion)),
      logUrl: latestRun?.htmlUrl ?? pipeline.buildUrl
    })) : pipeline.stages,
    logRef: {
      url: latestRun?.htmlUrl ?? pipeline.logRef?.url,
      preview: renderNativePipelineLogPreview("github-actions", status, [`ref=${ref}`, `workflow=${project.devops.ci.workflow ?? "checks"}`, `checks=${checks.length}`])
    },
    updatedAt: new Date().toISOString()
  };
  store.writePipeline(updated);
  finalizePipelineIfNeeded(store, updated);
  return updated;
}

export async function refreshGitLabCiPipeline(store: FileStore, pipeline: PipelineRun): Promise<PipelineRun> {
  if (pipeline.status === "SUCCEEDED" || pipeline.status === "FAILED" || pipeline.status === "CANCELED") return pipeline;
  const project = store.readProject(pipeline.projectId);
  if (!project?.devops || project.devops.provider !== "gitlab-ci" || !project.repository || project.repository.provider !== "gitlab") return pipeline;
  const token = resolveProjectDevopsToken(project, store);
  if (!token || !project.repository.baseUrl || !project.repository.projectId) return pipeline;
  const adapter = new GitLabHttpAdapter({ baseUrl: project.repository.baseUrl, projectId: project.repository.projectId, token });
  const ref = pipeline.parameters.DEVOPS_REF ?? project.devops.ci.ref ?? project.repository.defaultBranch ?? "main";
  const pipelines = pipeline.queueId ? [] : await adapter.listPipelines(ref);
  const pipelineId = pipeline.queueId ? Number(pipeline.queueId) : pipelines[0]?.id;
  if (!Number.isFinite(pipelineId)) return pipeline;
  const jobs = await readGitLabJobsForPipeline(adapter, pipelineId);
  const status = jobs.length > 0
    ? aggregatePipelineStatuses(jobs.map((job) => gitLabPipelineStatus(job.status)))
    : pipelines[0] ? gitLabPipelineStatus(pipelines[0].status) : pipeline.status;
  const updated: PipelineRun = {
    ...pipeline,
    status,
    queueId: String(pipelineId),
    buildUrl: pipelines[0]?.webUrl ?? pipeline.buildUrl,
    stages: jobs.length > 0 ? jobs.map((job) => ({
      id: safeFileName(String(job.id)),
      name: `${job.stage}/${job.name}`,
      status: pipelineStageStatusFromPipelineStatus(gitLabPipelineStatus(job.status)),
      logUrl: job.webUrl
    })) : pipeline.stages,
    logRef: {
      url: pipelines[0]?.webUrl ?? pipeline.logRef?.url,
      preview: renderNativePipelineLogPreview("gitlab-ci", status, [`ref=${ref}`, `pipeline=${pipelineId}`, `jobs=${jobs.length}`])
    },
    updatedAt: new Date().toISOString()
  };
  store.writePipeline(updated);
  finalizePipelineIfNeeded(store, updated);
  return updated;
}

export function finalizePipelineIfNeeded(store: FileStore, pipeline: PipelineRun): void {
  if (pipeline.status !== "SUCCEEDED" && pipeline.status !== "FAILED" && pipeline.status !== "CANCELED") return;
  const run = store.findRunByDeliveryId(pipeline.deliveryPlanId);
  if (!run || run.releaseReports.some((report) => report.deliveryPlanId === pipeline.deliveryPlanId)) return;
  const delivery = run.deliveryPlans.find((item) => item.id === pipeline.deliveryPlanId);
  if (!delivery) return;
  const plan = run.plans.find((item) => item.id === delivery.planId);
  if (!plan) return;
  const releaseStatus = pipelineStatusToReleaseStatus(pipeline.status);
  const providerLabel = pipelineProviderLabel(pipeline.provider);
  const report = createReleaseReport({
    id: `release-${delivery.id}`,
    projectId: delivery.projectId,
    deliveryPlanId: delivery.id,
    evidenceBundleId: run.evidenceBundle.id,
    version: pipeline.parameters.VERSION ?? pipeline.parameters.DEVOPS_REF ?? pipeline.provider,
    status: releaseStatus,
    validationSummary: releaseStatus === "SUCCEEDED" ? `${providerLabel} 流水线与发布后验证已通过。` : `${providerLabel} 流水线失败，发布已阻断。`,
    releasedAt: releaseStatus === "SUCCEEDED" ? new Date().toISOString() : undefined
  });
  run.releaseReports.push(report);
  run.learningRecords.push({
    id: `learning-${delivery.id}`,
    projectId: delivery.projectId,
    planId: plan.id,
    prediction: plan.expectedEffect,
    outcome: releaseStatus === "SUCCEEDED" ? "validated" : "rejected",
    ruleChangesSuggested: releaseStatus === "SUCCEEDED" ? [] : [`检查 ${providerLabel} 失败阶段，并收紧发布前验证契约。`],
    createdAt: new Date().toISOString()
  });
  store.writeRun(run);
}

export function pipelineProviderLabel(provider: PipelineRun["provider"]): string {
  if (provider === "github-actions") return "GitHub Actions";
  if (provider === "gitlab-ci") return "GitLab CI";
  return provider;
}

export function maskCodeUpgraderConnector(connector: StoredCodeUpgraderConnector): Omit<StoredCodeUpgraderConnector, "apiKey" | "llmApiKey"> & { apiKeyConfigured: boolean; llmApiKeyConfigured: boolean } {
  const { apiKey, llmApiKey, ...safe } = connector;
  return { ...safe, apiKeyConfigured: Boolean(apiKey), llmApiKeyConfigured: Boolean(llmApiKey) };
}

export function maskDeployConnector(connector: StoredDeployConnector): Omit<StoredDeployConnector, "token"> & { tokenConfigured: boolean } {
  const { token, ...safe } = connector;
  return { ...safe, tokenConfigured: Boolean(token || connector.tokenRef) };
}

export function normalizeEvaluationDataset(value: any, defaultProjectId: string): EvaluationDataset {
  const now = new Date().toISOString();
  const id = String(value.id ?? `eval-${Date.now()}-${Math.random().toString(36).slice(2)}`).trim();
  if (!id) throw new Error("EVALUATION_DATASET_ID_REQUIRED");
  return {
    id,
    projectId: String(value.projectId ?? defaultProjectId).trim(),
    name: String(value.name ?? id).trim(),
    source: String(value.source ?? "运行证据").trim(),
    status: normalizeEvaluationDatasetStatus(value.status),
    severity: normalizeEvaluationDatasetSeverity(value.severity),
    sampleCount: Math.max(1, Number(value.sampleCount ?? 1)),
    metric: String(value.metric ?? "待评估").trim(),
    scope: String(value.scope ?? "运行证据").trim(),
    triggeredAt: value.triggeredAt ? new Date(String(value.triggeredAt)).toISOString() : now,
    generatedBy: value.generatedBy === "self-learning" ? "self-learning" : "manual",
    evidenceEventIds: Array.isArray(value.evidenceEventIds) ? value.evidenceEventIds.map(String) : undefined,
    opportunityIds: Array.isArray(value.opportunityIds) ? value.opportunityIds.map(String) : undefined,
    confidence: value.confidence === undefined ? undefined : Math.max(0, Math.min(1, Number(value.confidence))),
    learningSignal: value.learningSignal ? String(value.learningSignal) : undefined
  };
}

export function evaluationDatasetsFromRun(run: StoredRun): EvaluationDataset[] {
  return run.opportunities.filter((opportunity) => isActionableOpportunity(opportunity, run)).map((opportunity) => {
    const firstEvent = run.evidenceBundle.events.find((event) => opportunity.evidenceEventIds.includes(event.id));
    const status: EvaluationDataset["status"] = opportunity.confidence >= 0.85 ? "REGRESSION_READY" : opportunity.confidence >= 0.72 ? "EVALUATED" : "NEEDS_LABELING";
    const severity: EvaluationDataset["severity"] = opportunity.riskLevel === "HIGH" || opportunity.impact === "high" ? "HIGH" : opportunity.riskLevel === "MEDIUM" ? "MEDIUM" : "LOW";
    const metric = metricFromOpportunity(opportunity);
    return {
      id: `eval-${safeFileName(`${run.id}-${opportunity.type}-${opportunity.affectedArea}`)}`,
      projectId: opportunity.projectId,
      name: datasetNameForOpportunity(opportunity),
      source: sourceForOpportunityDataset(opportunity, firstEvent),
      status,
      severity,
      sampleCount: Math.max(1, opportunity.evidenceEventIds.length),
      metric,
      scope: `${opportunity.affectedArea} / ${opportunity.failureAttribution ?? opportunity.type}`,
      triggeredAt: firstEvent?.timestamp ?? run.evidenceBundle.timeWindow.to,
      generatedBy: "self-learning",
      evidenceEventIds: opportunity.evidenceEventIds,
      opportunityIds: [opportunity.id],
      confidence: opportunity.confidence,
      learningSignal: opportunity.failureAttribution ?? opportunity.type
    };
  });
}

export function datasetNameForOpportunity(opportunity: EvolutionOpportunity): string {
  if (opportunity.failureAttribution === "latency-regression") return `${opportunity.affectedArea} 性能回归样本`;
  if (opportunity.failureAttribution === "tool-recovery") return `${opportunity.affectedArea} 工具恢复样本`;
  if (opportunity.failureAttribution === "rag-quality") return `${opportunity.affectedArea} RAG 质量样本`;
  if (opportunity.failureAttribution === "cost-regression") return `${opportunity.affectedArea} 成本回归样本`;
  if (opportunity.failureAttribution === "security-risk") return `${opportunity.affectedArea} 安全回归样本`;
  return `${opportunity.affectedArea} 进化回归样本`;
}

export function sourceForOpportunityDataset(opportunity: EvolutionOpportunity, event?: RuntimeEvidenceEvent): string {
  if (event?.source === "observability") return "Trace / Log 智能聚类";
  if (event?.source === "tool") return "Tool Call 智能聚类";
  if (event?.source === "user") return "用户反馈智能聚类";
  if (event?.source === "ci") return "Eval / CI 智能聚类";
  if (opportunity.failureAttribution === "rag-quality") return "RAG Context 智能聚类";
  if (opportunity.failureAttribution === "cost-regression") return "Cost / Latency 智能聚类";
  return "运行证据智能聚类";
}

export function metricFromOpportunity(opportunity: EvolutionOpportunity): string {
  if (opportunity.baseline) {
    return `${opportunity.baseline.metric} ${opportunity.baseline.current}${opportunity.baseline.unit} / 目标 ${opportunity.baseline.target}${opportunity.baseline.unit}`;
  }
  return `置信度 ${Math.round(opportunity.confidence * 100)}%`;
}

export function isActionableOpportunity(opportunity: EvolutionOpportunity, run: StoredRun): boolean {
  const relatedEvents = run.evidenceBundle.events.filter((event) => opportunity.evidenceEventIds.includes(event.id));
  if (relatedEvents.some((event) => event.severity !== "LOW")) return true;
  if (opportunity.baseline && opportunity.baseline.status !== "normal") return true;
  return false;
}

export function isActionableEvaluationDataset(dataset: EvaluationDataset, runs: StoredRun[]): boolean {
  const opportunityIds = new Set(dataset.opportunityIds ?? []);
  const relatedRuns = runs.filter((run) => run.evidenceBundle.projectId === dataset.projectId && run.opportunities.some((opportunity) => opportunityIds.has(opportunity.id)));
  if (relatedRuns.length === 0) return dataset.severity !== "LOW" && dataset.status !== "INSUFFICIENT_EVIDENCE";
  return relatedRuns.some((run) => run.opportunities
    .filter((opportunity) => opportunityIds.has(opportunity.id))
    .some((opportunity) => isActionableOpportunity(opportunity, run)));
}

export function opportunityInsightScore(opportunity: EvolutionOpportunity, datasets: EvaluationDataset[], run: StoredRun): number {
  const impact = opportunity.impact === "high" ? 28 : opportunity.impact === "medium" ? 18 : 10;
  const confidence = Math.round(opportunity.confidence * 25);
  const datasetScore = Math.min(18, datasets.length * 6);
  const evidenceScore = Math.min(14, opportunity.evidenceEventIds.length * 3);
  const learningScore = Math.min(15, run.learningRecords.length * 5);
  const riskPenalty = opportunity.riskLevel === "HIGH" ? 5 : 0;
  return Math.max(0, Math.min(100, impact + confidence + datasetScore + evidenceScore + learningScore - riskPenalty));
}

export function serviceScoreLevel(score: number): ServiceScorecard["level"] {
  if (score >= 90) return "优秀";
  if (score >= 75) return "良好";
  if (score >= 55) return "待改进";
  return "高风险";
}

export function serviceScoreRecommendedAction(score: number, checks: ServiceScorecard["checks"]): string {
  const failed = checks.find((check) => check.status === "FAILED");
  const warn = checks.find((check) => check.status === "WARN");
  if (failed) return `优先补齐：${failed.name}。`;
  if (warn) return `建议增强：${warn.name}。`;
  if (score >= 90) return "保持当前闭环，并扩大自动化等级。";
  return "继续积累发布后学习记录。";
}

export function readRuntimeLock(): any[] {
  const lockPath = path.resolve("runtimes/runtime-lock.json");
  if (!fs.existsSync(lockPath)) return [];
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  return Array.isArray(lock.runtimes) ? lock.runtimes : [];
}

export function vulnerabilityReportPassed(file: string): boolean {
  if (!fs.existsSync(path.resolve(file))) return false;
  const report = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  return report.status === "PASSED";
}

export function policySeverityRank(severity: GovernancePolicyEvaluation["severity"]): number {
  return ({ LOW: 1, MEDIUM: 2, HIGH: 3 })[severity];
}

export function eventCost(event: RuntimeEvidenceEvent): number {
  const attrs = event.attributes ?? {};
  return Math.max(0, Number(
    attrs.costUsd ??
    attrs.cost ??
    attrs.llmCost ??
    attrs.estimatedCostUsd ??
    attrs.costDelta ??
    0
  ));
}

export function eventTokens(event: RuntimeEvidenceEvent): number {
  const attrs = event.attributes ?? {};
  return Math.max(0, Math.round(Number(
    attrs.totalTokens ??
    attrs.tokenCount ??
    attrs.tokens ??
    attrs.inputTokens ??
    0
  ) + Number(attrs.outputTokens ?? 0)));
}

export function costHealthScore(status: CostReport["status"]): number {
  if (status === "HEALTHY") return 100;
  if (status === "WATCH") return 70;
  return 30;
}

export function gateScore(status: "PASSED" | "WARN" | "FAILED"): number {
  if (status === "PASSED") return 100;
  if (status === "WARN") return 65;
  return 0;
}

export function normalizeEvaluationDatasetStatus(value: unknown): EvaluationDataset["status"] {
  const text = String(value ?? "REGRESSION_READY").toUpperCase();
  if (text === "REGRESSION_READY" || text === "EVALUATED" || text === "NEEDS_LABELING" || text === "INSUFFICIENT_EVIDENCE") return text;
  return "REGRESSION_READY";
}

export function normalizeEvaluationDatasetSeverity(value: unknown): EvaluationDataset["severity"] {
  const text = String(value ?? "MEDIUM").toUpperCase();
  if (text === "LOW" || text === "MEDIUM" || text === "HIGH") return text;
  return "MEDIUM";
}

export function defaultEvaluationDatasets(): EvaluationDataset[] {
  return [
    {
      id: "eval-latency",
      projectId: "domainforge-fabric",
      name: "高延迟链路问答",
      source: "Trace 聚类",
      status: "REGRESSION_READY",
      severity: "HIGH",
      sampleCount: 428,
      metric: "p95 3.6s",
      scope: "MCP Trace / 订单问答链路",
      triggeredAt: "2026-06-03T09:28:00.000Z"
    },
    {
      id: "eval-tool-recovery",
      projectId: "simple-agent-project",
      name: "工具失败恢复",
      source: "Tool Call",
      status: "NEEDS_LABELING",
      severity: "MEDIUM",
      sampleCount: 96,
      metric: "失败率 8.4%",
      scope: "Tool Call / 恢复路径",
      triggeredAt: "2026-06-03T09:34:00.000Z"
    },
    {
      id: "eval-rag-drift",
      projectId: "domainforge-fabric",
      name: "RAG 引用漂移",
      source: "RAG Context",
      status: "REGRESSION_READY",
      severity: "MEDIUM",
      sampleCount: 171,
      metric: "命中率下降 6.2%",
      scope: "RAG Context / 知识引用",
      triggeredAt: "2026-06-03T09:39:00.000Z"
    },
    {
      id: "eval-cost-latency",
      projectId: "domainforge-fabric",
      name: "成本与延迟异常",
      source: "Cost / Latency",
      status: "EVALUATED",
      severity: "MEDIUM",
      sampleCount: 142,
      metric: "成本 +12%",
      scope: "LLM 调用 / 路由策略",
      triggeredAt: "2026-06-03T09:45:00.000Z"
    },
    {
      id: "eval-feedback",
      projectId: "simple-agent-project",
      name: "用户负反馈聚类",
      source: "用户反馈",
      status: "INSUFFICIENT_EVIDENCE",
      severity: "LOW",
      sampleCount: 18,
      metric: "负反馈 18 条",
      scope: "用户反馈 / 多轮对话",
      triggeredAt: "2026-06-03T09:52:00.000Z"
    }
  ];
}

export function productionEvaluationBaselineDatasets(defaultProjectId: string): EvaluationDataset[] {
  const projectId = safeFileName(defaultProjectId || "evopilot-production-baseline");
  const triggeredAt = new Date().toISOString();
  return [
    {
      id: "prod-baseline-source-to-ga",
      projectId,
      name: "Source-to-GA 生产基线",
      source: "Production baseline",
      status: "REGRESSION_READY",
      severity: "HIGH",
      sampleCount: 12,
      metric: "source-to-ga core journey 12 checks",
      scope: "project onboarding / loop runtime / release decision",
      triggeredAt
    },
    {
      id: "prod-baseline-tenant-rbac",
      projectId,
      name: "多租户与 RBAC 生产基线",
      source: "Production baseline",
      status: "REGRESSION_READY",
      severity: "HIGH",
      sampleCount: 10,
      metric: "tenant workspace role boundary 10 checks",
      scope: "tenant / workspace / user / audit",
      triggeredAt
    },
    {
      id: "prod-baseline-worker-human-gate",
      projectId,
      name: "Worker 与 Human Gate 生产基线",
      source: "Production baseline",
      status: "REGRESSION_READY",
      severity: "MEDIUM",
      sampleCount: 8,
      metric: "worker claim to WAITING_APPROVAL",
      scope: "worker queue / trace / human approval",
      triggeredAt
    }
  ];
}

export async function renderOpportunityDraftMarkdown(args: {
  title: string;
  target: string;
  datasets: EvaluationDataset[];
  project?: StoredProject;
  codeContext?: ProjectCodeContext;
  llmClient?: LlmTaskClient;
  requireLlm?: boolean;
}): Promise<{ markdown: string; trace?: Record<string, unknown> }> {
  if (args.llmClient) {
    const startedAt = new Date().toISOString();
    const response = await args.llmClient.generate({
      caller: "evopilot-server",
      intent: "plan.generation",
      outputContract: "markdown_document",
      latencyClass: "batch",
      complexity: "high",
      outputSize: "large",
      metadata: {
        productFlow: "evaluation-datasets-to-opportunity-draft",
        datasetCount: String(args.datasets.length),
        codeContextStatus: args.codeContext?.status ?? "UNAVAILABLE",
        codeContextFileCount: String(args.codeContext?.fileCount ?? 0)
      },
      prompt: [
        "你是 EvoPilot 的软件架构师。",
        "请基于用户选择的评测集、当前项目代码基线和项目运行配置，生成一份生产可审查的 Markdown 进化方案。",
        "必须先判断机会点目标与当前代码事实是否匹配；如果目标明显不可达，必须给出阶段化目标或不可达原因，不允许假装可以达成。",
        "只输出 Markdown，不要输出解释性前后缀。",
        "",
        `机会点标题：${args.title}`,
        `进化目标：${args.target}`,
        `项目：${args.project?.id ?? args.datasets[0]?.projectId ?? "unknown"}`,
        `仓库分支：${args.codeContext?.branch ?? args.project?.repository?.defaultBranch ?? "unknown"}`,
        "",
        "当前代码上下文：",
        renderCodeContextForPrompt(args.codeContext),
        "",
        "关联评测集：",
        ...args.datasets.map((dataset) => [
          `- 名称：${dataset.name}`,
          `  项目：${dataset.projectId}`,
          `  来源：${dataset.source}`,
          `  状态：${dataset.status}`,
          `  严重级别：${dataset.severity}`,
          `  样本数：${dataset.sampleCount}`,
          `  指标：${dataset.metric}`,
          `  范围：${dataset.scope}`,
          `  触发时间：${dataset.triggeredAt}`
        ].join("\n")),
        "",
        "必须包含章节：背景、当前代码事实、可行性判断、进化目标、架构改造建议、修改范围、验证计划、风险与回滚。"
      ].join("\n")
    });
    if (response.success && response.text.trim()) {
      return {
        markdown: response.text.trim(),
        trace: {
          mode: "llm",
          provider: response.provider,
          model: response.model,
          durationMs: response.durationMs,
          usage: response.usage,
          resolvedIntent: response.resolvedIntent,
          resolvedProfile: response.resolvedProfile,
          preflightUsed: response.preflightUsed,
          truncated: response.truncated,
          truncationRetryAttempt: response.truncationRetryAttempt,
          finalMaxOutputTokens: response.finalMaxOutputTokens,
          promptCompressed: response.promptCompressed,
          compression: response.compression,
          startedAt
        }
      };
    }
    if (args.requireLlm) {
      throw new Error(`LLM_OPPORTUNITY_DRAFT_FAILED: ${response.errorCode ?? "UNKNOWN"}`);
    }
    return {
      markdown: fallbackOpportunityDraftMarkdown(args),
      trace: {
        mode: "template-fallback",
        errorCode: response.errorCode,
        errorMessage: response.errorMessage,
        startedAt
      }
    };
  }
  if (args.requireLlm) throw new Error("LLM_REQUIRED_FOR_OPPORTUNITY_DRAFT");
  return {
    markdown: fallbackOpportunityDraftMarkdown(args),
    trace: { mode: "template", reason: "LLM 未配置" }
  };
}

export function allowedTriggerField(value: string): EvolutionTriggerCondition["field"] {
  const allowed: EvolutionTriggerCondition["field"][] = [
    "type",
    "source",
    "severity",
    "module",
    "attributes.durationMs",
    "attributes.latencyMs",
    "attributes.p95LatencyMs",
    "attributes.costUsd",
    "attributes.totalTokens",
    "attributes.ragHit",
    "attributes.score",
    "attributes.errorRate",
    "attributes.rollbackCount",
    "attributes.contextTruncated"
  ];
  return allowed.includes(value as EvolutionTriggerCondition["field"]) ? value as EvolutionTriggerCondition["field"] : "attributes.durationMs";
}

export function allowedTriggerOperator(value: string): EvolutionTriggerCondition["operator"] {
  const allowed: EvolutionTriggerCondition["operator"][] = ["==", "!=", ">", ">=", "<", "<=", "includes"];
  return allowed.includes(value as EvolutionTriggerCondition["operator"]) ? value as EvolutionTriggerCondition["operator"] : ">";
}

export function allowedOpportunityType(value: string): EvolutionTriggerRule["opportunityType"] {
  const allowed: EvolutionTriggerRule["opportunityType"][] = ["product-gap", "performance-hotspot", "reliability-risk", "tool-failure", "test-gap", "documentation-drift", "cost-risk", "security-risk", "module-boundary-smell", "release-process-risk"];
  return allowed.includes(value as EvolutionTriggerRule["opportunityType"]) ? value as EvolutionTriggerRule["opportunityType"] : "performance-hotspot";
}

export function allowedRiskLevel(value: string): EvolutionOpportunity["riskLevel"] {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH" ? value : "MEDIUM";
}

export function fallbackOpportunityDraftMarkdown(args: { title: string; target: string; datasets: EvaluationDataset[] }): string {
  return [
    `# ${args.title}`,
    "",
    "## 背景",
    "",
    `该机会点由 ${args.datasets.length} 个评测集共同形成：${args.datasets.map((dataset) => dataset.name).join("、")}。`,
    "",
    "## 进化目标",
    "",
    `- ${args.target}`,
    "",
    "## 架构改造建议",
    "",
    "1. 为关键链路增加预算和适应度函数。",
    "2. 调整 RAG、工具调用和路由策略，避免牺牲回答质量换取速度。",
    "3. 将关联评测集写入 Regression Suite，并作为后续 CI 门禁。",
    "",
    "## 验证计划",
    "",
    "- 单元测试覆盖关键策略。",
    "- 冒烟测试覆盖一次完整 Agent 调用。",
    "- 功能闭环测试覆盖评测集回归。",
    "- CI/CD 通过后进入灰度验证。"
  ].join("\n");
}

export async function collectProjectCodeContext(args: {
  store: FileStore;
  project?: StoredProject;
  runtime: RuntimeConfig;
  profile: ProjectProfile;
  focusFiles?: string[];
}): Promise<ProjectCodeContext> {
  const project = args.project;
  if (!project) return unavailableProjectCodeContext("unknown", "项目未注册，无法读取当前代码基线。");
  if (!project.repository) return unavailableProjectCodeContext(project.id, "项目未配置 Git 仓库，无法读取当前代码基线。");
  if (project.validation.status !== "VERIFIED") return unavailableProjectCodeContext(project.id, `项目注册未验证通过：${project.validation.message}`);

  if (project.repository.provider === "local-git") {
    if (!project.repository.root) return unavailableProjectCodeContext(project.id, "local-git 项目缺少 repository.root。");
    return collectCodeContextFromWorktree({ project, repoRoot: project.repository.root, source: "local-git", profile: args.profile, focusFiles: args.focusFiles });
  }

  if (!project.repository.gitUrl) return unavailableProjectCodeContext(project.id, "远程 Git 项目缺少 gitUrl，无法克隆当前代码基线。");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `evopilot-code-context-${safeFileName(project.id)}-`));
  const repoRoot = path.join(tempRoot, "repo");
  const askpass = writeGitAskPass(args.store, project.repository, project);
  try {
    const branch = project.repository.defaultBranch ?? "main";
    const result = await runGitCommand(["clone", "--depth", "1", "--branch", branch, project.repository.gitUrl, repoRoot], {
      env: { ...process.env, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: "0" }
    });
    if (result.code !== 0) return unavailableProjectCodeContext(project.id, `克隆当前代码基线失败：${result.stderr || result.stdout}`);
    return await collectCodeContextFromWorktree({ project, repoRoot, source: "git-clone", profile: args.profile, focusFiles: args.focusFiles });
  } finally {
    fs.rmSync(askpass, { force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function unavailableProjectCodeContext(projectId: string, reason: string): ProjectCodeContext {
  return {
    status: "UNAVAILABLE",
    source: "none",
    projectId,
    fileCount: 0,
    selectedFiles: [],
    summary: reason,
    unavailableReason: reason
  };
}

export async function collectCodeContextFromWorktree(args: {
  project: StoredProject;
  repoRoot: string;
  source: ProjectCodeContext["source"];
  profile: ProjectProfile;
  focusFiles?: string[];
}): Promise<ProjectCodeContext> {
  if (!fs.existsSync(args.repoRoot)) return unavailableProjectCodeContext(args.project.id, `代码目录不存在：${args.repoRoot}`);
  const branch = await gitOutput(["-C", args.repoRoot, "rev-parse", "--abbrev-ref", "HEAD"]).catch(() => args.project.repository?.defaultBranch ?? "unknown");
  const commitSha = await gitOutput(["-C", args.repoRoot, "rev-parse", "HEAD"]).catch(() => undefined);
  const trackedFiles = await listTrackedFiles(args.repoRoot);
  const selectedPaths = selectCodeContextFiles(trackedFiles, args.profile.policy.protectedPaths, args.focusFiles);
  const selectedFiles = selectedPaths.map((relativePath) => readContextFile(args.repoRoot, relativePath)).filter(Boolean) as ProjectCodeContext["selectedFiles"];
  if (selectedFiles.length === 0) return unavailableProjectCodeContext(args.project.id, "当前代码基线没有可用于架构分析的文本文件。");
  const writableRoots = inferWritableCodeRoots(trackedFiles, args.profile.policy.protectedPaths);
  return {
    status: "AVAILABLE",
    source: args.source,
    projectId: args.project.id,
    branch: branch?.trim() || args.project.repository?.defaultBranch,
    commitSha: commitSha?.trim(),
    fileCount: trackedFiles.length,
    writableRoots,
    selectedFiles,
    summary: `已读取 ${selectedFiles.length} 个关键文件，仓库共 ${trackedFiles.length} 个受 Git 跟踪文件。`
  };
}

export async function listTrackedFiles(repoRoot: string): Promise<string[]> {
  const gitFiles = await gitOutput(["-C", repoRoot, "ls-files"]).catch(() => "");
  const files = gitFiles.split("\n").map((item) => item.trim()).filter(Boolean);
  if (files.length > 0) return files;
  return listFilesRecursive(repoRoot)
    .map((file) => path.relative(repoRoot, file).replace(/\\/g, "/"))
    .filter((file) => !file.startsWith(".git/"));
}

export function listFilesRecursive(root: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".venv" || entry.name === "dist" || entry.name === "build") continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

export function selectCodeContextFiles(files: string[], protectedPaths: string[], focusFiles: string[] = []): string[] {
  const textFiles = files
    .filter((file) => isContextTextFile(file))
    .filter((file) => !protectedPaths.some((protectedPath) => isUnder(file, protectedPath)))
    .filter((file) => !/(^|\/)(node_modules|dist|build|target|\.git|\.venv|__pycache__)\//.test(file));
  const available = new Set(textFiles);
  const focused = uniqueNormalizedPaths(focusFiles)
    .filter((file) => available.has(file))
    .slice(0, 6);
  const priority = (file: string): number => {
    const name = path.basename(file).toLowerCase();
    if (["readme.md", "package.json", "pyproject.toml", "requirements.txt", "pom.xml", "go.mod", "dockerfile"].includes(name)) return 0;
    if (/^(app|main|server|index)\.(py|js|ts|mjs|java|go)$/.test(name)) return 1;
    if (file.startsWith("src/") || file.startsWith("app/") || file.startsWith("server/")) return 2;
    if (file.startsWith("tests/") || file.startsWith("test/") || file.startsWith("scripts/")) return 3;
    if (file.startsWith("docs/")) return 4;
    return 5;
  };
  const general = textFiles
    .filter((file) => !focused.includes(file))
    .sort((a, b) => priority(a) - priority(b) || a.localeCompare(b))
    .slice(0, 10 - focused.length);
  return [...focused, ...general];
}

export function inferWritableCodeRoots(files: string[], protectedPaths: string[]): string[] {
  const denied = new Set([".git", ".github", ".idea", ".vscode", ".venv", "__pycache__", "build", "dist", "docs", "node_modules", "target"]);
  const roots = new Map<string, { sourceLike: boolean; buildLike: boolean }>();
  for (const file of files.map(normalizeRelativePathForPolicy).filter(Boolean)) {
    if (protectedPaths.some((protectedPath) => isUnder(file, protectedPath))) continue;
    const [root, ...rest] = file.split("/");
    if (!root || denied.has(root) || rest.length === 0) continue;
    const name = rest.at(-1)?.toLowerCase() ?? "";
    const state = roots.get(root) ?? { sourceLike: false, buildLike: false };
    state.sourceLike ||= rest.includes("src") || rest.includes("app") || rest.includes("server") || rest.includes("lib") || rest.includes("tests") || rest.includes("test");
    state.buildLike ||= ["package.json", "pom.xml", "pyproject.toml", "requirements.txt", "go.mod", "build.gradle", "settings.gradle", "dockerfile"].includes(name);
    roots.set(root, state);
  }
  return [...roots.entries()]
    .filter(([, state]) => state.sourceLike || state.buildLike)
    .map(([root]) => root)
    .sort();
}

export function isContextTextFile(file: string): boolean {
  const lower = file.toLowerCase();
  return /\.(md|txt|json|ya?ml|toml|ini|properties|py|js|ts|mjs|cjs|java|go|xml|gradle|sh|sql)$/.test(lower) ||
    ["dockerfile", "makefile"].includes(path.basename(lower));
}

export function readContextFile(repoRoot: string, relativePath: string): ProjectCodeContext["selectedFiles"][number] | undefined {
  const fullPath = path.resolve(repoRoot, relativePath);
  if (!isUnderPath(fullPath, repoRoot) || !fs.existsSync(fullPath)) return undefined;
  const stat = fs.statSync(fullPath);
  if (!stat.isFile() || stat.size > 512 * 1024) return undefined;
  const raw = fs.readFileSync(fullPath, "utf8");
  const limit = 2500;
  return {
    path: relativePath,
    content: raw.length > limit ? raw.slice(0, limit) : raw,
    truncated: raw.length > limit
  };
}

export function renderCodeContextForPrompt(context?: ProjectCodeContext): string {
  if (!context || context.status !== "AVAILABLE") return `- 状态：不可用\n- 原因：${context?.unavailableReason ?? "未采集代码上下文"}`;
  return [
    "- 状态：可用",
    `- 来源：${context.source}`,
    `- 分支：${context.branch ?? "unknown"}`,
    `- 提交：${context.commitSha ?? "unknown"}`,
    `- 摘要：${context.summary}`,
    "",
    ...context.selectedFiles.flatMap((file) => [
      `### 文件：${file.path}${file.truncated ? "（已截断）" : ""}`,
      "```",
      file.content,
      "```",
      ""
    ])
  ].join("\n");
}

export function maskProjectCodeContext(context: ProjectCodeContext): Omit<ProjectCodeContext, "selectedFiles"> & { selectedFiles: Array<{ path: string; truncated: boolean; characters: number }> } {
  return {
    ...context,
    selectedFiles: context.selectedFiles.map((file) => ({
      path: file.path,
      truncated: file.truncated,
      characters: file.content.length
    }))
  };
}

export function writeGitAskPass(store: FileStore, repository: ProjectRepositoryRegistration, scope?: { tenantId?: string; workspaceId?: string }): string {
  const password = repository.credentials?.password ?? resolveCredentialToken(repository, store, scope) ?? "";
  const username = repository.credentials?.username ?? (password ? "oauth2" : "git");
  const askpass = path.join(os.tmpdir(), `evopilot-git-askpass-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`);
  fs.writeFileSync(askpass, [
    "#!/bin/sh",
    "case \"$1\" in",
    `*Username*) printf '%s\\n' '${shellSingleQuote(username)}' ;;`,
    `*) printf '%s\\n' '${shellSingleQuote(password)}' ;;`,
    "esac",
    ""
  ].join("\n"), { mode: 0o700 });
  return askpass;
}

export async function gitOutput(args: string[]): Promise<string> {
  const result = await runGitCommand(args);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

export async function runGitCommand(args: string[], options: { env?: NodeJS.ProcessEnv } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = spawn("git", args, {
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise<number>((resolve) => child.on("close", resolve));
  return { code, stdout, stderr: stderr.trim() };
}

export function isUnderPath(childPath: string, parentPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function isUnder(file: string, prefix: string): boolean {
  const normalizedFile = file.replace(/\\/g, "/").replace(/^\/+/, "");
  const normalizedPrefix = prefix.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  return normalizedFile === normalizedPrefix || normalizedFile.startsWith(`${normalizedPrefix}/`);
}

export async function checkSourceCredentialReadiness(project: StoredProject, store?: FileStore): Promise<SourceCredentialReadiness> {
  const checkedAt = new Date().toISOString();
  const repository = project.repository;
  const checks: SourceCredentialReadiness["checks"] = [];
  const addCheck = (check: SourceCredentialReadiness["checks"][number]) => checks.push(check);

  addCheck({
    id: "project",
    status: repository ? "PASS" : "FAIL",
    required: true,
    evidence: repository ? [`project=${project.id}`] : [`project=${project.id}`, "repository=missing"]
  });

  const provider = repository?.provider ?? "unknown";
  const remoteProvider = provider === "github" || provider === "gitlab";
  const supported = remoteProvider || provider === "local-git";
  addCheck({
    id: "provider",
    status: supported ? "PASS" : "FAIL",
    required: true,
    evidence: [`provider=${provider}`]
  });

  if (!repository) {
    return sourceCredentialReadinessResult(project.id, provider, checks, checkedAt);
  }

  if (repository.provider === "local-git") {
    const root = repository.root ? path.resolve(repository.root) : "";
    const rootOk = Boolean(root && fs.existsSync(root) && fs.statSync(root).isDirectory());
    addCheck({ id: "credential-ref", status: "SKIP", required: false, evidence: ["local-git-token=not-required"] });
    addCheck({ id: "token-resolution", status: "SKIP", required: false, evidence: ["local-git-token=not-required"] });
    addCheck({ id: "source-branch", status: rootOk ? "PASS" : "FAIL", required: true, evidence: [`root=${root || "missing"}`, rootOk ? "rootExists=true" : "rootExists=false"] });
    addCheck({ id: "writeback-policy", status: rootOk ? "PASS" : "FAIL", required: true, evidence: ["writeback=local-git"] });
    return sourceCredentialReadinessResult(project.id, repository.provider, checks, checkedAt);
  }

  const token = resolveCredentialToken(repository, store, project);
  const credentialMode = repository.credentials?.tokenRef ? "tokenRef" : repository.credentials?.token ? "inline-token" : repository.credentials?.password ? "password" : "none";
  addCheck({
    id: "credential-ref",
    status: credentialMode === "none" ? "FAIL" : "PASS",
    required: true,
    evidence: [
      `credentialMode=${credentialMode}`,
      repository.credentials?.tokenRef ? `tokenRef=${repository.credentials.tokenRef}` : "tokenRef=missing"
    ]
  });
  addCheck({
    id: "token-resolution",
    status: token ? "PASS" : "FAIL",
    required: true,
    evidence: [
      token ? "tokenResolved=true" : "SOURCE_CREDENTIAL_TOKEN_REQUIRED",
      repository.credentials?.tokenRef ? `tokenRefResolved=${Boolean(resolveTokenRef(store, repository.credentials.tokenRef, project))}` : "tokenRefResolved=false"
    ]
  });

  if (repository.provider === "github") {
    if (token && repository.owner && repository.repo) {
      try {
        const files = await new GitHubHttpAdapter({ apiBaseUrl: repository.baseUrl, owner: repository.owner, repo: repository.repo, token }).listFiles(repository.defaultBranch ?? "main");
        addCheck({ id: "source-branch", status: "PASS", required: true, evidence: [`branch=${repository.defaultBranch ?? "main"}`, `fileCount=${files.length}`] });
      } catch (error) {
        addCheck({ id: "source-branch", status: "FAIL", required: true, evidence: [`branch=${repository.defaultBranch ?? "main"}`, error instanceof Error ? error.message : String(error)] });
      }
    } else {
      addCheck({ id: "source-branch", status: "SKIP", required: true, evidence: [`branch=${repository.defaultBranch ?? "main"}`, "credentials-or-coordinates-missing"] });
    }
  } else if (repository.provider === "gitlab") {
    if (token && repository.baseUrl && repository.projectId) {
      try {
        const files = await new GitLabHttpAdapter({ baseUrl: repository.baseUrl, projectId: repository.projectId, token }).listFiles(repository.defaultBranch ?? "main");
        addCheck({ id: "source-branch", status: "PASS", required: true, evidence: [`branch=${repository.defaultBranch ?? "main"}`, `fileCount=${files.length}`] });
      } catch (error) {
        addCheck({ id: "source-branch", status: "FAIL", required: true, evidence: [`branch=${repository.defaultBranch ?? "main"}`, error instanceof Error ? error.message : String(error)] });
      }
    } else {
      addCheck({ id: "source-branch", status: "SKIP", required: true, evidence: [`branch=${repository.defaultBranch ?? "main"}`, "credentials-or-coordinates-missing"] });
    }
  } else {
    addCheck({ id: "source-branch", status: "SKIP", required: true, evidence: ["repository=unsupported-provider"] });
  }

  addCheck({
    id: "writeback-policy",
    status: token && remoteProvider ? "PASS" : "FAIL",
    required: true,
    evidence: [
      `provider=${repository.provider}`,
      token ? "sourceWriteback=enabled" : "sourceWriteback=read-only",
      "requiredScopes=repo-or-project-write"
    ]
  });

  return sourceCredentialReadinessResult(project.id, repository.provider, checks, checkedAt);
}

export function sourceCredentialReadinessResult(projectId: string, provider: ProjectRepositoryProvider | "unknown", checks: SourceCredentialReadiness["checks"], checkedAt: string): SourceCredentialReadiness {
  const blockers = checks
    .filter((check) => check.required && check.status !== "PASS")
    .flatMap((check) => check.evidence.some((item) => item === "SOURCE_CREDENTIAL_TOKEN_REQUIRED")
      ? [`${check.id}:SOURCE_CREDENTIAL_TOKEN_REQUIRED`]
      : [`${check.id}:${check.status}`]);
  const status: SourceCredentialReadiness["status"] = blockers.length === 0 ? "READY"
    : blockers.every((blocker) => blocker.includes("credential") || blocker.includes("token") || blocker.includes("source-branch:SKIP") || blocker.includes("writeback-policy")) ? "READ_ONLY"
      : "BLOCKED";
  const missingScmPrincipal = (provider === "github" || provider === "gitlab")
    && blockers.some((blocker) => blocker.includes("SOURCE_CREDENTIAL_TOKEN_REQUIRED") || blocker.includes("credential-ref:FAIL") || blocker.includes("token-resolution:SOURCE_CREDENTIAL_TOKEN_REQUIRED"));
  return {
    schema: "evopilot-source-credential-readiness/v1",
    projectId,
    provider,
    status,
    checks,
    blockers,
    capabilities: [
      "github-gitlab-tokenref-readiness",
      "public-repository-readonly-detection",
      "source-writeback-preflight",
      "dashboard-credential-control-plane",
      "secret-value-masking"
    ],
    nextAction: status === "READY" ? "write-source"
      : provider === "local-git" ? "use-local-git"
        : blockers.some((blocker) => blocker.includes("project") || blocker.includes("provider") || blocker.includes("source-branch:FAIL")) ? "repair-project"
          : missingScmPrincipal ? scmConnectPrincipalNextAction(provider as "github" | "gitlab") : "configure-token-ref",
    checkedAt
  };
}

export function normalizeProjectDevops(body: any, project: StoredProject): ProjectDevopsConfiguration | undefined {
  const source = body.devops && typeof body.devops === "object" ? body.devops : body;
  const provider = normalizeProjectDevopsProvider(source.provider ?? source.ciProvider ?? source.cdProvider);
  if (!provider) return undefined;
  const now = new Date().toISOString();
  const ciSource = source.ci && typeof source.ci === "object" ? source.ci : source;
  const cdSource = source.cd && typeof source.cd === "object" ? source.cd : source;
  const existing = project.devops;
  const sourceMode = normalizeProjectDevopsSourceMode(source.sourceMode ?? source.devopsSourceMode) ?? existing?.sourceMode ?? "repository-native";
  const bridge = sourceMode === "external-source" ? normalizeProjectDevopsBridge(source, project, existing) : undefined;
  const ci: ProjectDevopsConfiguration["ci"] = {
    workflow: optionalTrimmedString(ciSource.workflow) ?? optionalTrimmedString(ciSource.ciWorkflow) ?? existing?.ci.workflow,
    ref: optionalTrimmedString(ciSource.ref) ?? optionalTrimmedString(ciSource.ciRef) ?? optionalTrimmedString(ciSource.branch) ?? bridge?.gitlabRef ?? existing?.ci.ref,
    requiredChecks: normalizeOptionalStringList(ciSource.requiredChecks ?? ciSource.requiredCheck ?? ciSource.ciRequiredChecks ?? ciSource.ciRequiredCheck) ?? existing?.ci.requiredChecks ?? [],
    requiredStages: normalizeOptionalStringList(ciSource.requiredStages ?? ciSource.requiredStage ?? ciSource.ciRequiredStages ?? ciSource.ciRequiredStage) ?? existing?.ci.requiredStages ?? [],
    requiredJobs: normalizeOptionalStringList(ciSource.requiredJobs ?? ciSource.requiredJob ?? ciSource.ciRequiredJobs ?? ciSource.ciRequiredJob) ?? existing?.ci.requiredJobs ?? [],
    timeoutSeconds: positiveSeconds(ciSource.timeoutSeconds ?? ciSource.ciTimeoutSeconds ?? existing?.ci.timeoutSeconds, 1800)
  };
  const cdConfigured = Boolean(
    optionalTrimmedString(cdSource.cdWorkflow ?? cdSource.deployWorkflow) ||
    optionalTrimmedString(cdSource.deployEnvironment ?? cdSource.environment) ||
    optionalTrimmedString(cdSource.healthUrl) ||
    optionalTrimmedString(cdSource.readyUrl) ||
    cdSource.deployInputs ||
    cdSource.cdRequiredStage ||
    cdSource.cdRequiredJob ||
    existing?.cd
  );
  const cd: ProjectDevopsConfiguration["cd"] | undefined = cdConfigured ? {
    workflow: optionalTrimmedString(cdSource.cdWorkflow ?? cdSource.deployWorkflow) ?? existing?.cd?.workflow,
    environment: optionalTrimmedString(cdSource.deployEnvironment ?? cdSource.environment) ?? existing?.cd?.environment,
    requiredStages: normalizeOptionalStringList(cdSource.cdRequiredStages ?? cdSource.cdRequiredStage) ?? existing?.cd?.requiredStages ?? [],
    requiredJobs: normalizeOptionalStringList(cdSource.cdRequiredJobs ?? cdSource.cdRequiredJob) ?? existing?.cd?.requiredJobs ?? [],
    deployInputs: cdSource.deployInputs && typeof cdSource.deployInputs === "object" ? normalizeStringMap(cdSource.deployInputs) : existing?.cd?.deployInputs,
    healthUrl: optionalTrimmedString(cdSource.healthUrl) ?? existing?.cd?.healthUrl,
    readyUrl: optionalTrimmedString(cdSource.readyUrl) ?? existing?.cd?.readyUrl,
    timeoutSeconds: positiveSeconds(cdSource.cdTimeoutSeconds ?? cdSource.deployTimeoutSeconds ?? existing?.cd?.timeoutSeconds, 1800)
  } : undefined;
  return {
    provider,
    mode: "scm-native",
    sourceMode,
    bridge,
    tokenRef: optionalTrimmedString(source.tokenRef ?? source.devopsTokenRef) ?? existing?.tokenRef,
    boundary: normalizeProjectDevopsBoundary(source, project, existing, sourceMode, bridge),
    ci,
    cd,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}

export function normalizeProjectDevopsProvider(value: unknown): ProjectDevopsProvider | undefined {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "github-actions" || text === "github" || text === "actions") return "github-actions";
  if (text === "gitlab-ci" || text === "gitlab" || text === "gitlab-pipeline") return "gitlab-ci";
  return undefined;
}

export function normalizeProjectDevopsSourceMode(value: unknown): ProjectDevopsSourceMode | undefined {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return undefined;
  if (text === "repository-native" || text === "native" || text === "scm-native") return "repository-native";
  if (text === "external-source" || text === "bridge" || text === "github-source-gitlab-ci") return "external-source";
  return undefined;
}

export function normalizeProjectDevopsBridge(source: any, project: StoredProject, existing?: ProjectDevopsConfiguration): ProjectDevopsConfiguration["bridge"] | undefined {
  const bridgeSource = source.bridge && typeof source.bridge === "object" ? source.bridge : {};
  const workflowProvider = optionalTrimmedString(source.workflowProvider ?? source.workflowRepositoryProvider ?? bridgeSource.workflowProvider ?? bridgeSource.provider) ?? "gitlab";
  if (workflowProvider !== "gitlab") return undefined;
  const workflowRepositoryRaw = bridgeSource.workflowRepository ?? source.workflowRepository ?? source.workflowRepo ?? bridgeSource.repository;
  const workflowRepository = normalizeRepositoryRefInput("gitlab", workflowRepositoryRaw, existing?.bridge?.workflowRepository);
  const workflowBaseUrl = optionalTrimmedString(source.workflowBaseUrl ?? bridgeSource.baseUrl);
  const workflowProjectId = optionalTrimmedString(source.workflowProjectId ?? bridgeSource.projectId ?? bridgeSource.repository);
  const workflowBranch = optionalTrimmedString(source.workflowBranch ?? source.workflowDefaultBranch ?? source.gitlabRef ?? source.ciRef ?? bridgeSource.defaultBranch);
  const normalizedWorkflowRepository: ProjectRepositoryRef | undefined = workflowRepository || workflowBaseUrl || workflowProjectId || workflowBranch ? {
    ...(workflowRepository ?? {}),
    provider: "gitlab",
    baseUrl: workflowBaseUrl ?? workflowRepository?.baseUrl,
    projectId: workflowProjectId ?? workflowRepository?.projectId,
    defaultBranch: workflowBranch ?? workflowRepository?.defaultBranch
  } : undefined;
  if (!normalizedWorkflowRepository) return undefined;
  return {
    sourceProvider: "github",
    workflowRepository: normalizedWorkflowRepository,
    gitlabRef: optionalTrimmedString(source.gitlabRef ?? source.workflowRef ?? source.workflowBranch ?? bridgeSource.gitlabRef ?? bridgeSource.ref) ?? existing?.bridge?.gitlabRef,
    requiredVariables: normalizeOptionalStringList(source.requiredVariables ?? bridgeSource.requiredVariables) ?? existing?.bridge?.requiredVariables
  };
}

export function devopsProviderMatchesRepository(project: StoredProject, devops: ProjectDevopsConfiguration): { ok: boolean; detail?: string } {
  const repositoryProvider = project.repository?.provider;
  const sourceMode = projectDevopsSourceMode(devops);
  if (sourceMode === "external-source") {
    if (repositoryProvider !== "github" || devops.provider !== "gitlab-ci") {
      return { ok: false, detail: `external-source bridge currently supports GitHub source with GitLab CI only, current provider=${repositoryProvider ?? "missing"}, devops=${devops.provider}.` };
    }
    if (devops.bridge?.workflowRepository.provider !== "gitlab" || !devops.bridge.workflowRepository.baseUrl || !devops.bridge.workflowRepository.projectId) {
      return { ok: false, detail: "external-source bridge requires a GitLab workflowRepository with baseUrl and projectId." };
    }
    return { ok: true };
  }
  if (devops.provider === "github-actions" && repositoryProvider !== "github") {
    return { ok: false, detail: `github-actions requires a GitHub project, current provider=${repositoryProvider ?? "missing"}.` };
  }
  if (devops.provider === "gitlab-ci" && repositoryProvider !== "gitlab") {
    return { ok: false, detail: `gitlab-ci requires a GitLab project, current provider=${repositoryProvider ?? "missing"}.` };
  }
  return { ok: true };
}

export function normalizeProjectExecutionMode(value: unknown, fallback: ProjectExecutionMode = "owned-repository"): ProjectExecutionMode {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "owned-repository" || text === "owned") return "owned-repository";
  if (text === "read-only-public" || text === "readonly-public" || text === "read-only" || text === "public-read-only") return "read-only-public";
  if (text === "fork-validated-pr" || text === "fork-pr" || text === "fork") return "fork-validated-pr";
  if (text === "upstream-authorized" || text === "upstream" || text === "maintainer") return "upstream-authorized";
  return fallback;
}

export function claimBoundaryForExecutionMode(mode: ProjectExecutionMode): ProjectClaimBoundary {
  if (mode === "read-only-public") return "read-only-analysis";
  if (mode === "fork-validated-pr") return "fork-ci-pr";
  if (mode === "upstream-authorized") return "upstream-release";
  return "working-repo-ci";
}

export function normalizeProjectClaimBoundary(value: unknown, mode: ProjectExecutionMode): ProjectClaimBoundary {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "read-only-analysis") return "read-only-analysis";
  if (text === "working-repo-ci") return "working-repo-ci";
  if (text === "fork-ci-pr") return "fork-ci-pr";
  if (text === "upstream-release") return "upstream-release";
  return claimBoundaryForExecutionMode(mode);
}

export function normalizeProjectDevopsBoundary(source: any, project: StoredProject, existing?: ProjectDevopsConfiguration, sourceMode: ProjectDevopsSourceMode = "repository-native", bridge?: ProjectDevopsConfiguration["bridge"]): ProjectDevopsConfiguration["boundary"] {
  const boundarySource = source.boundary && typeof source.boundary === "object" ? source.boundary : {};
  const executionMode = normalizeProjectExecutionMode(
    source.executionMode ?? source.devopsExecutionMode ?? boundarySource.executionMode ?? project.repository?.topology?.executionMode,
    existing?.boundary?.executionMode ?? "owned-repository"
  );
  const workflowRepository = sourceMode === "external-source" && bridge?.workflowRepository ? bridge.workflowRepository : normalizeRepositoryRefInput(
    project.repository?.provider,
    source.workflowRepository ?? source.workflowRepo ?? source.workingRepository ?? source.workingRepo ?? boundarySource.workflowRepository,
    project.repository?.topology?.working ?? repositoryRefFromRegistration(project.repository) ?? existing?.boundary?.workflowRepository
  );
  const claimBoundary = normalizeProjectClaimBoundary(source.claimBoundary ?? boundarySource.claimBoundary, executionMode);
  const tokenRef = optionalTrimmedString(source.tokenRef ?? source.devopsTokenRef ?? boundarySource.credentialRef) ?? existing?.tokenRef;
  const inferredOwner = repositoryNamespace(workflowRepository) ?? repositoryNamespace(project.repository?.topology?.working) ?? repositoryNamespaceFromRegistration(project.repository);
  const owner = optionalTrimmedString(source.devopsOwner ?? source.devopsNamespace ?? boundarySource.owner ?? boundarySource.namespace)
    ?? existing?.boundary?.owner
    ?? inferredOwner;
  const namespace = optionalTrimmedString(source.devopsNamespace ?? boundarySource.namespace)
    ?? existing?.boundary?.namespace
    ?? inferredOwner;
  return {
    executionMode,
    owner,
    namespace,
    repository: optionalTrimmedString(source.devopsRepository ?? source.workflowRepo ?? boundarySource.repository)
      ?? repositoryDisplayName(workflowRepository)
      ?? existing?.boundary?.repository,
    workflowRepository,
    credentialRef: tokenRef,
    expectedPrincipal: optionalTrimmedString(source.credentialPrincipal ?? source.devopsPrincipal ?? source.expectedPrincipal ?? boundarySource.expectedPrincipal)
      ?? existing?.boundary?.expectedPrincipal,
    claimBoundary
  };
}

export function repositoryRefFromRegistration(repository?: ProjectRepositoryRegistration): ProjectRepositoryRef | undefined {
  if (!repository || repository.provider === "local-git") return undefined;
  return {
    provider: repository.provider,
    gitUrl: repository.gitUrl,
    baseUrl: repository.baseUrl,
    projectId: repository.projectId,
    owner: repository.owner,
    repo: repository.repo,
    defaultBranch: repository.defaultBranch
  };
}

export function projectDevopsSourceMode(devops?: ProjectDevopsConfiguration): ProjectDevopsSourceMode {
  return devops?.sourceMode ?? "repository-native";
}

export function normalizeRepositoryRefInput(provider: ProjectRepositoryProvider | undefined, value: unknown, fallback?: ProjectRepositoryRef): ProjectRepositoryRef | undefined {
  if (!provider || provider === "local-git") return fallback;
  const remoteProvider = provider as Exclude<ProjectRepositoryProvider, "local-git">;
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string") {
    const text = value.trim();
    const parsed = text.includes("://") || text.startsWith("git@") ? parseGitUrl(text) : parseRepositoryName(remoteProvider, text);
    return {
      provider: remoteProvider,
      gitUrl: text.includes("://") || text.startsWith("git@") ? text : parsed.gitUrl,
      baseUrl: parsed.baseUrl ?? fallback?.baseUrl,
      projectId: parsed.projectId ?? fallback?.projectId,
      owner: parsed.owner ?? fallback?.owner,
      repo: parsed.repo ?? fallback?.repo,
      defaultBranch: parsed.defaultBranch ?? fallback?.defaultBranch
    };
  }
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const gitUrl = optionalTrimmedString(source.gitUrl ?? source.url);
    const parsed = gitUrl ? parseGitUrl(gitUrl) : {};
    const explicitProvider = String(source.provider ?? parsed.provider ?? remoteProvider).trim() as ProjectRepositoryProvider;
    if (explicitProvider !== "github" && explicitProvider !== "gitlab") return fallback;
    return {
      provider: explicitProvider,
      gitUrl,
      baseUrl: optionalTrimmedString(source.baseUrl) ?? parsed.baseUrl ?? fallback?.baseUrl,
      projectId: optionalTrimmedString(source.projectId) ?? parsed.projectId ?? fallback?.projectId,
      owner: optionalTrimmedString(source.owner) ?? parsed.owner ?? fallback?.owner,
      repo: optionalTrimmedString(source.repo ?? source.repoName) ?? parsed.repo ?? fallback?.repo,
      defaultBranch: optionalTrimmedString(source.defaultBranch ?? source.branch) ?? fallback?.defaultBranch
    };
  }
  return fallback;
}

export function parseRepositoryName(provider: Exclude<ProjectRepositoryProvider, "local-git">, value: string): Partial<ProjectRepositoryRef> {
  const text = value.trim().replace(/\.git$/i, "");
  if (!text) return {};
  if (provider === "github") {
    const parts = text.split("/").filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts.slice(1).join("/") };
    return { repo: text };
  }
  return { projectId: text };
}

export function repositoryNamespace(ref?: ProjectRepositoryRef): string | undefined {
  if (!ref) return undefined;
  if (ref.provider === "github") return ref.owner;
  if (ref.projectId) {
    const parts = ref.projectId.split("/").filter(Boolean);
    if (parts.length > 1) return parts.slice(0, -1).join("/");
  }
  return ref.owner;
}

export function repositoryNamespaceFromRegistration(repository?: ProjectRepositoryRegistration): string | undefined {
  return repositoryNamespace(repositoryRefFromRegistration(repository));
}

export function repositoryDisplayName(ref?: ProjectRepositoryRef): string | undefined {
  if (!ref) return undefined;
  if (ref.provider === "github" && ref.owner && ref.repo) return `${ref.owner}/${ref.repo}`;
  if (ref.provider === "gitlab" && ref.projectId) return ref.projectId;
  return undefined;
}

export function devopsReadinessContext(project: StoredProject, devops?: ProjectDevopsConfiguration): Pick<ProjectDevopsReadiness, "executionMode" | "repositoryOwner" | "devopsOwner" | "workflowRepository" | "credentialRef" | "credentialPrincipal" | "claimBoundary"> {
  const topology = project.repository?.topology;
  const executionMode = devops?.boundary?.executionMode ?? topology?.executionMode ?? "owned-repository";
  const workflowRef = devops?.bridge?.workflowRepository ?? devops?.boundary?.workflowRepository ?? topology?.working ?? repositoryRefFromRegistration(project.repository);
  return {
    executionMode,
    repositoryOwner: repositoryNamespaceFromRegistration(project.repository),
    devopsOwner: devops?.boundary?.owner ?? repositoryNamespace(workflowRef),
    workflowRepository: repositoryDisplayName(workflowRef),
    credentialRef: devops?.boundary?.credentialRef ?? devops?.tokenRef ?? project.repository?.credentials?.tokenRef,
    credentialPrincipal: devops?.boundary?.expectedPrincipal,
    claimBoundary: devops?.boundary?.claimBoundary ?? topology?.claimBoundary ?? claimBoundaryForExecutionMode(executionMode)
  };
}

export async function checkProjectDevopsReadiness(project: StoredProject, store?: FileStore): Promise<ProjectDevopsReadiness> {
  const checkedAt = new Date().toISOString();
  const checks: ProjectDevopsReadiness["checks"] = [];
  const addCheck = (check: ProjectDevopsReadiness["checks"][number]) => checks.push(check);
  const repository = project.repository;
  const devops = project.devops;
  addCheck({
    id: "project",
    status: project.validation.status === "VERIFIED" && Boolean(repository) ? "PASS" : "FAIL",
    required: true,
    evidence: [`project=${project.id}`, `validation=${project.validation.status}`, repository ? `repository=${repository.provider}` : "repository=missing"]
  });
  addCheck({
    id: "source-provider",
    status: repository?.provider === "github" || repository?.provider === "gitlab" ? "PASS" : "FAIL",
    required: true,
    evidence: [`repositoryProvider=${repository?.provider ?? "missing"}`]
  });
  if (!devops) {
    addCheck({ id: "devops-provider", status: "FAIL", required: true, evidence: ["devops=missing"] });
    return projectDevopsReadinessResult(project, "unknown", checks, checkedAt);
  }
  const context = devopsReadinessContext(project, devops);
  const sourceMode = projectDevopsSourceMode(devops);
  const workflowRef = projectDevopsWorkflowRepository(project, devops);
  const workflowOwner = repositoryNamespace(workflowRef);
  const hasForkUpstream = Boolean(repository?.topology?.upstream);
  if (sourceMode === "external-source") {
    const sourceToken = repository ? resolveCredentialToken(repository, store, project) : undefined;
    addCheck({
      id: "bridge-source",
      status: repository?.provider === "github" && sourceToken ? "PASS" : "FAIL",
      required: true,
      evidence: [
        `sourceProvider=${repository?.provider ?? "missing"}`,
        sourceToken ? "sourceTokenResolved=true" : "sourceTokenResolved=false",
        repository?.credentials?.tokenRef ? `sourceTokenRef=${repository.credentials.tokenRef}` : "sourceTokenRef=missing",
        `workflowRepository=${repositoryDisplayName(workflowRef) ?? "missing"}`
      ]
    });
  }
  addCheck({
    id: "execution-mode",
    status: context.executionMode === "read-only-public" ? "FAIL"
      : context.executionMode === "fork-validated-pr" && !hasForkUpstream ? "FAIL"
        : "PASS",
    required: true,
    evidence: [
      `executionMode=${context.executionMode}`,
      `claimBoundary=${context.claimBoundary}`,
      context.executionMode === "read-only-public" ? "read-only-public cannot run project DevOps"
        : context.executionMode === "fork-validated-pr" ? `upstream=${repositoryDisplayName(repository?.topology?.upstream) ?? "missing"}`
          : "executionModeAccepted=true"
    ]
  });
  const providerCheck = devopsProviderMatchesRepository(project, devops);
  addCheck({
    id: "devops-provider",
    status: providerCheck.ok ? "PASS" : "FAIL",
    required: true,
    evidence: [`devopsProvider=${devops.provider}`, providerCheck.detail ?? "providerMatchesRepository=true"]
  });
  const token = resolveProjectDevopsToken(project, store);
  addCheck({
    id: "token-resolution",
    status: token ? "PASS" : "FAIL",
    required: true,
    evidence: [
      token ? "tokenResolved=true" : "DEVOPS_TOKEN_REQUIRED",
      devops.tokenRef ? `devopsTokenRef=${devops.tokenRef}` : "devopsTokenRef=source-credentials",
      repository?.credentials?.tokenRef ? `sourceTokenRef=${repository.credentials.tokenRef}` : "sourceTokenRef=missing"
    ]
  });
  addCheck({
    id: "devops-owner",
    status: context.executionMode === "read-only-public" ? "FAIL"
      : !context.devopsOwner ? "FAIL"
        : workflowOwner && context.devopsOwner !== workflowOwner ? "FAIL"
          : "PASS",
    required: true,
    evidence: [
      `devopsOwner=${context.devopsOwner ?? "missing"}`,
      `workflowOwner=${workflowOwner ?? "missing"}`,
      `workflowRepository=${context.workflowRepository ?? "missing"}`,
      context.credentialPrincipal ? `credentialPrincipal=${context.credentialPrincipal}` : "credentialPrincipal=not-declared"
    ]
  });
  const ciConfigured = devops.provider === "github-actions"
    ? Boolean(devops.ci.workflow || devops.ci.requiredChecks?.length)
    : Boolean(devops.ci.requiredStages?.length || devops.ci.requiredJobs?.length);
  addCheck({
    id: "ci-config",
    status: ciConfigured ? "PASS" : "FAIL",
    required: true,
    evidence: [
      `workflow=${devops.ci.workflow ?? "missing"}`,
      `requiredChecks=${(devops.ci.requiredChecks ?? []).join(",") || "none"}`,
      `requiredStages=${(devops.ci.requiredStages ?? []).join(",") || "none"}`,
      `requiredJobs=${(devops.ci.requiredJobs ?? []).join(",") || "none"}`
    ]
  });
  if (repository?.provider === "github" && devops.provider === "github-actions" && token && repository.owner && repository.repo) {
    await appendGitHubDevopsReadinessChecks({ project, devops, token, checks });
  } else if (devops.provider === "gitlab-ci" && token && projectDevopsGitLabWorkflowRepository(project, devops)?.baseUrl && projectDevopsGitLabWorkflowRepository(project, devops)?.projectId) {
    await appendGitLabDevopsReadinessChecks({ project, devops, token, checks });
  } else {
    addCheck({ id: "ci-state", status: "SKIP", required: true, evidence: ["credentials-or-coordinates-missing"] });
  }
  await appendProjectDevopsHealthCheck(devops, checks, context.executionMode);
  return projectDevopsReadinessResult(project, devops.provider, checks, checkedAt, devops);
}

export async function appendGitHubDevopsReadinessChecks(args: {
  project: StoredProject;
  devops: ProjectDevopsConfiguration;
  token: string;
  checks: ProjectDevopsReadiness["checks"];
}): Promise<void> {
  const repository = args.project.repository!;
  const ref = args.devops.ci.ref ?? repository.defaultBranch ?? "main";
  const adapter = new GitHubHttpAdapter({ apiBaseUrl: repository.baseUrl, owner: repository.owner!, repo: repository.repo!, token: args.token });
  try {
    const checks = await adapter.listChecks(ref);
    const workflowRuns = args.devops.ci.workflow ? await readGitHubWorkflowRunsForPipeline(adapter, args.devops.ci.workflow, ref) : [];
    const latestRun = workflowRuns[0];
    const workflowStatus = latestRun ? githubWorkflowRunToPipelineStatus(latestRun.status, latestRun.conclusion) : undefined;
    const requiredChecks = args.devops.ci.requiredChecks ?? [];
    const missing = requiredChecks.filter((name) => !checks.some((check) => check.name === name));
    const failed = checks.filter((check) => requiredChecks.includes(check.name) && githubCheckToPipelineStatus(check.status, check.conclusion) === "FAILED");
    const pending = checks.filter((check) => requiredChecks.includes(check.name) && githubCheckToPipelineStatus(check.status, check.conclusion) === "RUNNING");
    const workflowEvidenceRequired = requiredChecks.length === 0 && Boolean(args.devops.ci.workflow);
    const workflowReady = !workflowEvidenceRequired || workflowStatus === "SUCCEEDED";
    args.checks.push({
      id: "ci-state",
      status: missing.length === 0 && failed.length === 0 && pending.length === 0 && workflowReady ? "PASS" : "FAIL",
      required: true,
      evidence: [
        `ref=${ref}`,
        `workflowRun=${latestRun?.id ?? "missing"}`,
        `workflowStatus=${workflowStatus ?? "missing"}`,
        `checkCount=${checks.length}`,
        `requiredChecks=${requiredChecks.join(",") || "none"}`,
        `missing=${missing.join(",") || "none"}`,
        `failed=${failed.map((check) => check.name).join(",") || "none"}`,
        `pending=${pending.map((check) => check.name).join(",") || "none"}`
      ]
    });
  } catch (error) {
    args.checks.push({
      id: "ci-state",
      status: "FAIL",
      required: true,
      evidence: [`ref=${ref}`, error instanceof Error ? error.message : String(error)]
    });
  }
}

export async function appendGitLabDevopsReadinessChecks(args: {
  project: StoredProject;
  devops: ProjectDevopsConfiguration;
  token: string;
  checks: ProjectDevopsReadiness["checks"];
}): Promise<void> {
  const repository = projectDevopsGitLabWorkflowRepository(args.project, args.devops)!;
  const ref = projectDevopsGitLabRef(args.devops, repository);
  const adapter = new GitLabHttpAdapter({ baseUrl: repository.baseUrl!, projectId: repository.projectId!, token: args.token });
  try {
    const pipelines = await adapter.listPipelines(ref);
    const latest = pipelines[0];
    const jobs = latest ? await adapter.listPipelineJobs(latest.id) : [];
    const requiredStages = [...(args.devops.ci.requiredStages ?? []), ...(args.devops.cd?.requiredStages ?? [])];
    const requiredJobs = [...(args.devops.ci.requiredJobs ?? []), ...(args.devops.cd?.requiredJobs ?? [])];
    const missingStages = requiredStages.filter((stage) => !jobs.some((job) => job.stage === stage));
    const missingJobs = requiredJobs.filter((jobName) => !jobs.some((job) => job.name === jobName));
    const failedJobs = jobs.filter((job) => (requiredStages.includes(job.stage) || requiredJobs.includes(job.name)) && gitLabPipelineStatus(job.status) === "FAILED");
    const pendingJobs = jobs.filter((job) => (requiredStages.includes(job.stage) || requiredJobs.includes(job.name)) && gitLabPipelineStatus(job.status) === "RUNNING");
    const pipelineStatus = latest ? gitLabPipelineStatus(latest.status) : undefined;
    const pipelineEvidenceRequired = requiredStages.length === 0 && requiredJobs.length === 0;
    const pipelineReady = !pipelineEvidenceRequired || pipelineStatus === "SUCCEEDED";
    args.checks.push({
      id: "ci-state",
      status: latest && pipelineReady && missingStages.length === 0 && missingJobs.length === 0 && failedJobs.length === 0 && pendingJobs.length === 0 ? "PASS" : "FAIL",
      required: true,
      evidence: [
        `ref=${ref}`,
        `pipeline=${latest?.id ?? "missing"}`,
        `pipelineStatus=${pipelineStatus ?? "missing"}`,
        `jobCount=${jobs.length}`,
        `missingStages=${missingStages.join(",") || "none"}`,
        `missingJobs=${missingJobs.join(",") || "none"}`,
        `failedJobs=${failedJobs.map((job) => job.name).join(",") || "none"}`,
        `pendingJobs=${pendingJobs.map((job) => job.name).join(",") || "none"}`
      ]
    });
  } catch (error) {
    args.checks.push({
      id: "ci-state",
      status: "FAIL",
      required: true,
      evidence: [`ref=${ref}`, error instanceof Error ? error.message : String(error)]
    });
  }
}

export async function appendProjectDevopsHealthCheck(devops: ProjectDevopsConfiguration, checks: ProjectDevopsReadiness["checks"], executionMode: ProjectExecutionMode): Promise<void> {
  const cdRequired = executionMode === "owned-repository" || executionMode === "upstream-authorized";
  const cdConfigured = Boolean(
    devops.cd?.workflow ||
    devops.cd?.environment ||
    devops.cd?.healthUrl ||
    devops.cd?.readyUrl ||
    devops.cd?.requiredStages?.length ||
    devops.cd?.requiredJobs?.length ||
    (devops.cd?.deployInputs && Object.keys(devops.cd.deployInputs).length > 0)
  );
  const healthUrl = devops.cd?.readyUrl ?? devops.cd?.healthUrl;
  if (!cdConfigured) {
    checks.push({
      id: "cd-config",
      status: cdRequired ? "FAIL" : "SKIP",
      required: cdRequired,
      evidence: [
        "cd=missing",
        `executionMode=${executionMode}`,
        cdRequired ? "enterprise-real-loop-cd-boundary=required" : "fork/read-only mode does not claim production CD"
      ]
    });
    checks.push({ id: "health-ready", status: "SKIP", required: false, evidence: ["healthUrl=missing"] });
    return;
  }
  if (!healthUrl) {
    checks.push({ id: "health-ready", status: "SKIP", required: false, evidence: ["healthUrl=missing"] });
    checks.push({
      id: "cd-config",
      status: "PASS",
      required: cdRequired,
      evidence: [
        `environment=${devops.cd?.environment ?? "missing"}`,
        `workflow=${devops.cd?.workflow ?? "missing"}`,
        `executionMode=${executionMode}`
      ]
    });
    return;
  }
  checks.push({ id: "cd-config", status: "PASS", required: cdRequired, evidence: [`environment=${devops.cd?.environment ?? "missing"}`, `healthUrl=${healthUrl}`, `executionMode=${executionMode}`] });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(10_000, Math.max(1_000, (devops.cd?.timeoutSeconds ?? 10) * 1000)));
    const response = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timeout);
    checks.push({
      id: "health-ready",
      status: response.ok ? "PASS" : "FAIL",
      required: false,
      evidence: [`url=${healthUrl}`, `status=${response.status}`]
    });
  } catch (error) {
    checks.push({
      id: "health-ready",
      status: "FAIL",
      required: false,
      evidence: [`url=${healthUrl}`, error instanceof Error ? error.message : String(error)]
    });
  }
}

export function projectDevopsReadinessResult(project: StoredProject, provider: ProjectDevopsProvider | "unknown", checks: ProjectDevopsReadiness["checks"], checkedAt: string, devops?: ProjectDevopsConfiguration): ProjectDevopsReadiness {
  const blockers = checks
    .filter((check) => check.required && check.status !== "PASS")
    .map((check) => check.evidence.some((item) => item === "DEVOPS_TOKEN_REQUIRED") ? `${check.id}:DEVOPS_TOKEN_REQUIRED` : `${check.id}:${check.status}`);
  const status: ProjectDevopsReadiness["status"] = blockers.length === 0 ? "READY"
    : blockers.every((blocker) => blocker.includes("ci-state")) ? "OBSERVABLE"
      : "BLOCKED";
  const context = devopsReadinessContext(project, devops);
  const scmProvider = project.repository?.provider ?? "unknown";
  const sourceMode = projectDevopsSourceMode(devops);
  const missingBridgeDevopsPrincipal = sourceMode === "external-source" && blockers.some((blocker) => blocker.includes("DEVOPS_TOKEN_REQUIRED") || blocker.includes("token-resolution"));
  const missingBridgeSourcePrincipal = sourceMode === "external-source" && blockers.some((blocker) => blocker.includes("bridge-source"));
  const missingScmPrincipal = (scmProvider === "github" || scmProvider === "gitlab")
    && blockers.some((blocker) => blocker.includes("DEVOPS_TOKEN_REQUIRED") || blocker.includes("token-resolution"));
  return {
    schema: "evopilot-project-devops-readiness/v1",
    projectId: project.id,
    provider,
    sourceMode,
    sourceProvider: scmProvider,
    workflowProvider: projectDevopsWorkflowRepository(project, devops)?.provider ?? "unknown",
    ...context,
    status,
    checks,
    blockers,
    capabilities: [
      "github-actions-workflow-dispatch",
      "github-check-run-readiness",
      "gitlab-ci-pipeline-trigger",
      "gitlab-pipeline-job-readiness",
      "github-source-gitlab-ci-bridge",
      "devops-owner-boundary-preflight",
      "execution-mode-claim-boundary",
      "health-ready-probe",
      "dashboard-cli-readable-chain"
    ],
    nextAction: status === "READY" ? "run-devops"
      : missingBridgeSourcePrincipal ? "connect-github-account"
        : missingBridgeDevopsPrincipal ? "connect-gitlab-account"
          : missingScmPrincipal ? scmConnectPrincipalNextAction(scmProvider as "github" | "gitlab")
        : blockers.some((blocker) => blocker.includes("token")) ? "configure-source-credentials"
          : blockers.some((blocker) => blocker.includes("devops-provider") || blocker.includes("devops-owner") || blocker.includes("execution-mode") || blocker.includes("ci-config")) ? "configure-devops"
            : blockers.some((blocker) => blocker.includes("project") || blocker.includes("source-provider")) ? "repair-project"
              : "inspect-ci",
    checkedAt
  };
}

export function resolveProjectDevopsToken(project: StoredProject, store?: FileStore): string | undefined {
  if (projectDevopsSourceMode(project.devops) === "external-source") {
    return project.devops?.tokenRef ? resolveTokenRef(store, project.devops.tokenRef, project) : undefined;
  }
  if (project.devops?.tokenRef) return resolveTokenRef(store, project.devops.tokenRef, project);
  return project.repository ? resolveCredentialToken(project.repository, store, project) : undefined;
}

export function projectDevopsWorkflowRepository(project: StoredProject, devops?: ProjectDevopsConfiguration): ProjectRepositoryRef | undefined {
  return devops?.bridge?.workflowRepository ?? devops?.boundary?.workflowRepository ?? project.repository?.topology?.working ?? repositoryRefFromRegistration(project.repository);
}

export function projectDevopsGitLabWorkflowRepository(project: StoredProject, devops: ProjectDevopsConfiguration): ProjectRepositoryRef | undefined {
  const workflowRepository = projectDevopsWorkflowRepository(project, devops);
  if (workflowRepository?.provider === "gitlab") return workflowRepository;
  if (projectDevopsSourceMode(devops) === "repository-native" && project.repository?.provider === "gitlab") return repositoryRefFromRegistration(project.repository);
  return undefined;
}

export function projectDevopsGitLabRef(devops: ProjectDevopsConfiguration, workflowRepository: ProjectRepositoryRef): string {
  return devops.bridge?.gitlabRef ?? devops.ci.ref ?? workflowRepository.defaultBranch ?? "main";
}

export function normalizeOptionalStringList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  return normalizeStringList(value, []);
}

export function positiveSeconds(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function githubCheckToPipelineStatus(status: string, conclusion?: string): PipelineStatus {
  const normalizedStatus = status.toLowerCase();
  const normalizedConclusion = String(conclusion ?? "").toLowerCase();
  if (normalizedStatus !== "completed") return normalizedStatus === "queued" ? "QUEUED" : "RUNNING";
  if (normalizedConclusion === "success" || normalizedConclusion === "neutral" || normalizedConclusion === "skipped") return "SUCCEEDED";
  if (normalizedConclusion === "cancelled" || normalizedConclusion === "canceled") return "CANCELED";
  if (normalizedConclusion === "failure" || normalizedConclusion === "timed_out" || normalizedConclusion === "action_required") return "FAILED";
  return "UNKNOWN";
}

export function gitLabPipelineStatus(status: string): PipelineStatus {
  const normalized = status.toLowerCase();
  if (normalized === "success" || normalized === "skipped") return "SUCCEEDED";
  if (normalized === "failed") return "FAILED";
  if (normalized === "canceled" || normalized === "cancelled") return "CANCELED";
  if (normalized === "created" || normalized === "pending") return "QUEUED";
  if (normalized === "running" || normalized === "waiting_for_resource" || normalized === "preparing" || normalized === "manual" || normalized === "scheduled") return "RUNNING";
  return "UNKNOWN";
}

export function updateProjectSourceCredentials(project: StoredProject, body: any): StoredProject {
  const repository = project.repository;
  if (!repository) return project;
  const source = body.repository && typeof body.repository === "object" ? body.repository : body;
  const credentials = source.credentials && typeof source.credentials === "object" ? source.credentials : source;
  const nextCredentials: ProjectRepositoryCredentials = {
    ...repository.credentials,
    username: optionalTrimmedString(credentials.username) ?? repository.credentials?.username,
    password: optionalTrimmedString(credentials.password) ?? repository.credentials?.password,
    token: optionalTrimmedString(credentials.token) ?? repository.credentials?.token,
    tokenRef: optionalTrimmedString(credentials.tokenRef) ?? repository.credentials?.tokenRef
  };
  if (credentials.clearInlineToken === true) delete nextCredentials.token;
  if (credentials.clearPassword === true) delete nextCredentials.password;
  if (credentials.clearTokenRef === true) delete nextCredentials.tokenRef;
  return {
    ...project,
    repository: {
      ...repository,
      defaultBranch: optionalTrimmedString(source.defaultBranch) ?? repository.defaultBranch,
      credentials: Object.values(nextCredentials).some(Boolean) ? nextCredentials : undefined
    }
  };
}

export function maskProject(project: StoredProject, store?: FileStore): Omit<StoredProject, "repository"> & { repository?: Omit<ProjectRepositoryRegistration, "credentials"> & { credentialsConfigured: boolean; credentialMode: string; tokenRef?: string; tokenRefResolved?: boolean } } {
  const { repository, ...safe } = project;
  const credentialMode = repository?.credentials?.tokenRef ? "tokenRef"
    : repository?.credentials?.token ? "inline-token"
      : repository?.credentials?.password ? "password"
        : "none";
  return {
    ...safe,
    repository: repository ? {
      provider: repository.provider,
      gitUrl: repository.gitUrl,
      root: repository.root,
      baseUrl: repository.baseUrl,
      projectId: repository.projectId,
      owner: repository.owner,
      repo: repository.repo,
      defaultBranch: repository.defaultBranch,
      topology: repository.topology,
      credentialsConfigured: Boolean(repository.credentials?.token || repository.credentials?.password || repository.credentials?.tokenRef),
      credentialMode,
      tokenRef: repository.credentials?.tokenRef,
      tokenRefResolved: repository.credentials?.tokenRef ? Boolean(resolveTokenRef(store, repository.credentials.tokenRef, project)) : undefined
    } : undefined
  };
}

export function normalizeProjectLlmBinding(body: any, actor?: string): ProjectLlmBinding | undefined {
  const nested = body.llm && typeof body.llm === "object" ? body.llm : undefined;
  const profileId = optionalTrimmedString(body.llmProfileId) ?? optionalTrimmedString(body.llmProfile) ?? optionalTrimmedString(nested?.llmProfileId) ?? optionalTrimmedString(nested?.profileId) ?? optionalTrimmedString(nested?.profile);
  if (!profileId) return undefined;
  return {
    schema: "evopilot-project-llm-binding/v1",
    profileId: safeFileName(profileId),
    required: nested?.required === undefined && body.requireLlmReady === undefined && body.llmRequired === undefined ? true : nested?.required !== false && body.requireLlmReady !== false && body.llmRequired !== false,
    boundAt: new Date().toISOString(),
    boundBy: actor
  };
}

export function hydrateProjectLlmBinding(value: unknown): ProjectLlmBinding | undefined {
  if (!isRecord(value)) return undefined;
  const profileId = optionalTrimmedString(value.profileId) ?? optionalTrimmedString(value.llmProfileId) ?? optionalTrimmedString(value.profile);
  if (!profileId) return undefined;
  return {
    schema: "evopilot-project-llm-binding/v1",
    profileId: safeFileName(profileId),
    required: value.required === undefined ? true : value.required !== false,
    boundAt: String(value.boundAt ?? value.createdAt ?? new Date().toISOString()),
    boundBy: optionalTrimmedString(value.boundBy)
  };
}

export function hydrateLoopLlmSelection(value: unknown): LoopLlmSelection | undefined {
  if (!isRecord(value)) return undefined;
  const source = String(value.source ?? "none");
  return {
    schema: "evopilot-loop-llm-selection/v1",
    source: source === "global-default" || source === "project-default" || source === "loop-override" || source === "none" ? source : "none",
    configured: value.configured === true,
    required: value.required === true,
    profileId: optionalTrimmedString(value.profileId),
    provider: optionalTrimmedString(value.provider),
    model: optionalTrimmedString(value.model),
    baseUrl: optionalTrimmedString(value.baseUrl),
    apiKeyRef: optionalTrimmedString(value.apiKeyRef),
    resolvedAt: String(value.resolvedAt ?? new Date().toISOString())
  };
}

export function normalizeProjectRuntime(body: any): ProjectRuntimeConfiguration | undefined {
  const source = body.runtime && typeof body.runtime === "object" ? body.runtime : undefined;
  if (!source) return undefined;
  const language = normalizeRuntimeLanguage(source.language);
  const serviceSource = source.service && typeof source.service === "object" ? source.service : undefined;
  const service = serviceSource?.enabled === false || !serviceSource?.startCommand ? undefined : {
    enabled: true,
    startCommand: String(serviceSource.startCommand).trim(),
    host: serviceSource.host ? String(serviceSource.host).trim() : "127.0.0.1",
    port: serviceSource.port ? Number(serviceSource.port) : undefined,
    healthPath: serviceSource.healthPath ? String(serviceSource.healthPath).trim() : "/health",
    readyTimeoutSeconds: serviceSource.readyTimeoutSeconds ? Number(serviceSource.readyTimeoutSeconds) : 15
  };
  return {
    language,
    installCommands: normalizeCommandList(source.installCommands),
    unitCommands: normalizeCommandList(source.unitCommands),
    service,
    smokeCommands: normalizeCommandList(source.smokeCommands),
    functionalCommands: normalizeCommandList(source.functionalCommands)
  };
}

export function normalizeRuntimeLanguage(value: unknown): ProjectRuntimeConfiguration["language"] {
  const text = String(value ?? "generic").trim().toLowerCase();
  if (text === "python" || text === "node" || text === "java" || text === "go") return text;
  return "generic";
}

export function normalizeCommandList(value: unknown): string[] | undefined {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : [];
  const commands = items.map((item) => String(item).trim()).filter(Boolean);
  return commands.length > 0 ? commands : undefined;
}

export function resolveProjectValidationPlan(project: StoredProject | undefined, body: any): ProjectRuntimeConfiguration | undefined {
  const explicit = normalizeProjectRuntime(body);
  return explicit ?? project?.runtime;
}

export function validationPlanToCommands(plan: ProjectRuntimeConfiguration | undefined, fallback: string[]): string[] {
  if (!plan) return fallback;
  return [
    ...(plan.installCommands ?? []),
    ...(plan.unitCommands ?? []),
    ...(plan.smokeCommands ?? []),
    ...(plan.functionalCommands ?? [])
  ].filter(Boolean);
}

export async function diagnoseProjectRuntime(args: { store: FileStore; project: StoredProject | undefined; runtime: RuntimeConfig }): Promise<ProjectRuntimeDiagnostic> {
  const checkedAt = new Date().toISOString();
  const project = args.project;
  const checks: ProjectRuntimeDiagnostic["checks"] = [];
  if (!project) {
    return { projectId: "unknown", status: "FAILED", checks: [{ name: "项目注册", status: "FAILED", detail: "项目不存在" }], recommendedAction: "先完成项目注册。", checkedAt };
  }
  checks.push({
    name: "项目注册验证",
    status: project.validation.status === "VERIFIED" ? "PASSED" : "FAILED",
    detail: project.validation.message,
    remediation: project.validation.status === "VERIFIED" ? undefined : "重新注册项目并验证 Git 凭证、URL 和默认分支。"
  });
  checks.push({
    name: "项目运行配置",
    status: project.runtime ? "PASSED" : "WARN",
    detail: project.runtime ? `语言：${project.runtime.language}` : "未配置项目启动、健康检查和验证命令，生产执行会退回方案自带验证命令。",
    remediation: project.runtime ? undefined : "在项目注册中配置 runtime：语言、单元测试、服务启动、health、smoke、functional。"
  });
  if (project.runtime?.service?.enabled) {
    checks.push({
      name: "服务验证编排",
      status: project.runtime.service.startCommand && project.runtime.service.healthPath ? "PASSED" : "FAILED",
      detail: `启动命令：${project.runtime.service.startCommand || "未配置"}；健康检查：${project.runtime.service.healthPath || "未配置"}`,
      remediation: "配置可在升级工作区内启动的服务命令，例如 python3 app.py --host 127.0.0.1 --port 49318。"
    });
  }
  const codeUpgradeConnector = args.store.readCodeUpgraderConnector("default");
  checks.push({
    name: "代码升级运行时",
    status: codeUpgradeConnector?.baseUrl ? "PASSED" : "FAILED",
    detail: codeUpgradeConnector?.baseUrl ? `已配置：${codeUpgradeConnector.baseUrl}` : "未配置代码升级运行时连接器。",
    remediation: "配置 EvoPilot 托管代码升级运行时连接器。"
  });
  const devopsReadiness = await checkProjectDevopsReadiness(project, args.store);
  checks.push({
    name: "CI/CD 连接",
    status: devopsReadiness.status === "READY" ? "PASSED" : devopsReadiness.status === "OBSERVABLE" ? "WARN" : "FAILED",
    detail: project.devops
      ? `DevOps：${project.devops.provider}；readiness=${devopsReadiness.status}；blockers=${devopsReadiness.blockers.join(",") || "none"}`
      : "项目未配置 GitHub Actions/GitLab CI DevOps。",
    remediation: project.devops ? "运行 project devops preflight 并修复 tokenRef、workflow、required checks/jobs 或健康检查。"
      : "通过 project devops set 配置 GitHub Actions 或 GitLab CI。"
  });
  const status = checks.some((check) => check.status === "FAILED") ? "FAILED" : checks.some((check) => check.status === "WARN") ? "WARN" : "PASSED";
  return {
    projectId: project.id,
    status,
    checks,
    recommendedAction: status === "PASSED" ? "运行时体检通过，可以进入代码升级和 CI/CD。" : checks.find((check) => check.status !== "PASSED")?.remediation ?? "补齐项目运行配置。",
    checkedAt
  };
}

export async function compileRuleWithLlm(args: {
  projectId: string;
  userPrompt: string;
  llmClient?: LlmTaskClient;
  requireLlm: boolean;
}): Promise<{ memory: RuleMemory }> {
  if (!args.llmClient) {
    if (args.requireLlm) throw new Error("LLM_REQUIRED_FOR_RULE_COMPILE");
    const rule = fallbackCompiledRule(args.projectId, args.userPrompt, "LLM 未配置，使用模板规则");
    return { memory: ruleMemoryFromCompiledRule(rule, { mode: "template", reason: "LLM 未配置" }) };
  }
  const startedAt = new Date().toISOString();
  const response = await args.llmClient.generate({
    caller: "evopilot-server",
    intent: "structured.extraction",
    outputContract: "json_object",
    jsonObject: true,
    latencyClass: "interactive",
    complexity: "medium",
    outputSize: "medium",
    metadata: {
      productFlow: "prompt-to-executable-rule",
      projectId: args.projectId
    },
    prompt: [
      "你是 EvoPilot 的证据策略编译器。",
      "请把用户的自然语言策略编译成 EvoPilot 可执行 JSON 规则。",
      "只返回 JSON 对象，不要 Markdown。",
      "",
      "字段要求：",
      "- id: kebab-case 字符串",
      "- name: 中文规则名",
      "- description: 中文说明",
      "- userPrompt: 原始用户规则",
      "- compiledBy: 固定为 llm",
      "- enabled: true",
      "- opportunityType: performance-hotspot | reliability-risk | tool-failure | cost-risk | security-risk | test-gap",
      "- title: 触发后形成的机会点标题",
      "- affectedArea: 影响区域",
      "- suggestedDirection: 优化方向",
      "- riskLevel: LOW | MEDIUM | HIGH",
      "- anyOf 或 allOf: 条件数组，field 只能使用 type/source/severity/module/attributes.durationMs/attributes.latencyMs/attributes.p95LatencyMs/attributes.costUsd/attributes.totalTokens/attributes.ragHit/attributes.score/attributes.errorRate/attributes.rollbackCount/attributes.contextTruncated，operator 只能使用 ==/!=/>/>=/</<=/includes",
      "- 注意：用户说“小于 3 秒”表示超过 3000ms 时触发风险，不能编译成 attributes.durationMs <= 3000。",
      "- 注意：RAG 命中率、工具失败、上下文截断必须使用 type/source/module 或对应 attributes 字段，不能塞进 attributes.durationMs。",
      "- minMatchingEvents: 正整数",
      "",
      `项目：${args.projectId}`,
      `用户规则：${args.userPrompt}`
    ].join("\n")
  });
  if (!response.success || !response.text.trim()) {
    if (args.requireLlm) throw new Error(`LLM_RULE_COMPILE_FAILED: ${response.errorCode ?? "UNKNOWN"}`);
    const rule = fallbackCompiledRule(args.projectId, args.userPrompt, response.errorMessage ?? "LLM 调用失败，使用模板规则");
    return { memory: ruleMemoryFromCompiledRule(rule, llmTraceFromResponse("template-fallback", response, startedAt)) };
  }
  const attempts: Array<{ attempt: number; provider?: string; model?: string; error?: string; repaired: boolean }> = [];
  let lastResponse = response;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const compiled = normalizeCompiledRule(JSON.parse(extractJsonObject(lastResponse.text)), args.projectId, args.userPrompt);
      validateExecutableRule(compiled);
      return {
        memory: ruleMemoryFromCompiledRule(compiled, {
          ...llmTraceFromResponse(attempt === 1 ? "llm" : "llm-repaired", lastResponse, startedAt),
          repairAttempts: attempts
        })
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({ attempt, provider: lastResponse.provider, model: lastResponse.model, error: message, repaired: false });
      if (attempt >= 3) break;
      const repairResponse = await args.llmClient.generate({
        caller: "evopilot-server",
        intent: "structured.extraction",
        outputContract: "json_object",
        jsonObject: true,
        latencyClass: "interactive",
        complexity: "medium",
        outputSize: "medium",
        metadata: {
          productFlow: "prompt-to-executable-rule-repair",
          projectId: args.projectId,
          repairAttempt: String(attempt)
        },
        prompt: buildRuleCompileRepairPrompt({
          projectId: args.projectId,
          userPrompt: args.userPrompt,
          previousJson: lastResponse.text,
          validationError: message
        })
      });
      if (!repairResponse.success || !repairResponse.text.trim()) {
        attempts.push({
          attempt: attempt + 1,
          provider: repairResponse.provider,
          model: repairResponse.model,
          error: repairResponse.errorMessage ?? repairResponse.errorCode ?? "LLM 修正规则失败",
          repaired: false
        });
        lastResponse = repairResponse;
        break;
      }
      attempts[attempts.length - 1] = { ...attempts[attempts.length - 1], repaired: true };
      lastResponse = repairResponse;
    }
  }
  if (args.requireLlm) {
    const message = lastError instanceof Error ? lastError.message : String(lastError ?? "unknown");
    throw new Error(`LLM_RULE_COMPILE_RESPONSE_INVALID: ${message}`);
  }
  const rule = fallbackCompiledRule(args.projectId, args.userPrompt, "LLM 返回格式无效，使用模板规则");
  return { memory: ruleMemoryFromCompiledRule(rule, llmTraceFromResponse("template-fallback", lastResponse, startedAt)) };
}

export function buildRuleCompileRepairPrompt(args: { projectId: string; userPrompt: string; previousJson: string; validationError: string }): string {
  return [
    "你是 EvoPilot 的证据策略编译器。上一次输出的 JSON 未通过生产执行校验。",
    "请基于校验错误修正 JSON，只返回 JSON 对象，不要 Markdown。",
    "",
    "硬性规则：",
    "- attributes.durationMs/attributes.latencyMs/attributes.p95LatencyMs 必须使用数值阈值。",
    "- 用户说“小于 3 秒”表示目标状态，触发条件必须表达超过 3000ms 的风险，例如 attributes.durationMs > 3000。",
    "- attributes.ragHit 和 attributes.contextTruncated 是布尔字段，只能使用 == 或 !=，值只能是 true 或 false。",
    "- 工具失败优先用 type == tool.failure 或 source == tool，不要把工具失败塞进耗时字段。",
    "- 保持 projectId、userPrompt 与用户意图一致。",
    "",
    `项目：${args.projectId}`,
    `用户规则：${args.userPrompt}`,
    `校验错误：${args.validationError}`,
    "上一次 JSON：",
    args.previousJson
  ].join("\n");
}

export function normalizeCompiledRule(value: any, projectId: string, userPrompt: string): EvolutionTriggerRule {
  const id = safeFileName(String(value.id ?? `rule-${Date.now()}`).toLowerCase()).replace(/_/g, "-");
  const anyOf = Array.isArray(value.anyOf) ? value.anyOf.map(normalizeTriggerCondition).filter(Boolean) as EvolutionTriggerCondition[] : undefined;
  const allOf = Array.isArray(value.allOf) ? value.allOf.map(normalizeTriggerCondition).filter(Boolean) as EvolutionTriggerCondition[] : undefined;
  const conditions = (anyOf ?? allOf ?? []);
  if (conditions.length === 0) {
    conditions.push({ field: "attributes.durationMs", operator: ">", value: 3000 });
  }
  const useAllOf = Array.isArray(value.allOf) && !Array.isArray(value.anyOf);
  const rule: EvolutionTriggerRule = {
    id,
    projectId,
    name: String(value.name ?? userPrompt).trim(),
    description: String(value.description ?? `项目 ${projectId} 的 LLM 编译证据策略。`).trim(),
    userPrompt,
    compiledBy: "llm",
    compiledAt: new Date().toISOString(),
    enabled: value.enabled !== false,
    opportunityType: allowedOpportunityType(String(value.opportunityType)),
    title: String(value.title ?? "运行证据触发演进机会点").trim(),
    affectedArea: String(value.affectedArea ?? "runtime").trim(),
    suggestedDirection: String(value.suggestedDirection ?? "基于运行证据进行演进优化").trim(),
    riskLevel: allowedRiskLevel(String(value.riskLevel)),
    anyOf: useAllOf ? undefined : conditions,
    allOf: useAllOf ? conditions : undefined,
    minMatchingEvents: Math.max(1, Number(value.minMatchingEvents ?? 1))
  };
  return applyExecutableRuleGuardrails(rule);
}

export function normalizeTriggerCondition(item: any): EvolutionTriggerCondition | undefined {
  if (!item || typeof item !== "object") return undefined;
  const field = allowedTriggerField(String(item.field));
  const operator = allowedTriggerOperator(String(item.operator));
  const rawValue = item.value;
  const value = (field === "attributes.ragHit" || field === "attributes.contextTruncated")
    ? normalizeBooleanConditionValue(rawValue)
    : typeof rawValue === "number" ? rawValue : typeof rawValue === "boolean" ? String(rawValue) : String(rawValue ?? "");
  return { field, operator, value };
}

export function normalizeBooleanConditionValue(value: unknown): string {
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return value === 0 ? "false" : "true";
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "yes", "y", "1", "是", "命中", "已命中", "hit", "matched", "enabled", "on"].includes(text)) return "true";
  if (["false", "no", "n", "0", "否", "未命中", "未匹配", "miss", "missed", "disabled", "off", "未截断"].includes(text)) return "false";
  if (/未命中|没有命中|未匹配|miss|false|否/.test(text)) return "false";
  if (/命中|matched|hit|true|是/.test(text)) return "true";
  if (/未截断|没有截断|not truncated/.test(text)) return "false";
  if (/截断|truncated/.test(text)) return "true";
  return text;
}

export function applyExecutableRuleGuardrails(rule: EvolutionTriggerRule): EvolutionTriggerRule {
  const latencyTargetMs = inferLatencyTargetMs(rule.userPrompt ?? rule.name);
  const normalize = (condition: EvolutionTriggerCondition): EvolutionTriggerCondition => {
    const isLatencyField = ["attributes.durationMs", "attributes.latencyMs", "attributes.p95LatencyMs"].includes(condition.field);
    if (isLatencyField && latencyTargetMs) {
      if (!isNumericLike(condition.value) || ((condition.operator === "<" || condition.operator === "<=") && Number(condition.value) >= latencyTargetMs)) {
        return { ...condition, operator: ">", value: latencyTargetMs };
      }
    }
    if ((condition.field === "attributes.ragHit" || condition.field === "attributes.contextTruncated") && !["==", "!="].includes(condition.operator) && ["true", "false"].includes(String(condition.value))) {
      return { ...condition, operator: "==" };
    }
    return condition;
  };
  return {
    ...rule,
    anyOf: rule.anyOf?.map(normalize),
    allOf: rule.allOf?.map(normalize)
  };
}

export function inferLatencyTargetMs(prompt: string): number | undefined {
  const text = prompt.replace(/\s+/g, "");
  const seconds = text.match(/(?:小于|低于|不超过|少于|控制在|超过|大于|高于)(\d+(?:\.\d+)?)秒/);
  if (seconds) return Math.round(Number(seconds[1]) * 1000);
  const milliseconds = text.match(/(?:小于|低于|不超过|少于|控制在|超过|大于|高于)(\d+(?:\.\d+)?)(?:ms|毫秒)/i);
  if (milliseconds) return Math.round(Number(milliseconds[1]));
  return undefined;
}

export function validateExecutableRule(rule: EvolutionTriggerRule): void {
  const conditions = [...(rule.anyOf ?? []), ...(rule.allOf ?? [])];
  if (conditions.length === 0) throw new Error("规则必须包含至少一个执行条件");
  const errors: string[] = [];
  for (const condition of conditions) {
    if (condition.field.startsWith("attributes.durationMs") || condition.field.startsWith("attributes.latencyMs") || condition.field.startsWith("attributes.p95LatencyMs")) {
      if (!["<", "<=", ">", ">=", "==", "!="].includes(condition.operator)) errors.push(`耗时字段不能使用 ${condition.operator}`);
      if (!isNumericLike(condition.value)) errors.push(`耗时字段必须使用数值阈值，当前为 ${JSON.stringify(condition.value)}`);
    }
    if ((condition.field === "attributes.costUsd" || condition.field === "attributes.totalTokens" || condition.field === "attributes.score" || condition.field === "attributes.errorRate" || condition.field === "attributes.rollbackCount") && !isNumericLike(condition.value)) {
      errors.push(`${condition.field} 必须使用数值阈值`);
    }
    if (condition.field === "attributes.ragHit" || condition.field === "attributes.contextTruncated") {
      if (!["==", "!="].includes(condition.operator)) errors.push(`${condition.field} 只能使用 == 或 !=，不能使用 ${condition.operator}`);
      if (!["true", "false"].includes(String(condition.value))) errors.push(`${condition.field} 必须使用 true/false`);
    }
  }
  const prompt = String(rule.userPrompt ?? rule.name);
  if (/小于\s*3\s*秒|低于\s*3\s*秒|不超过\s*3\s*秒/.test(prompt)) {
    for (const condition of conditions) {
      if (["attributes.durationMs", "attributes.latencyMs", "attributes.p95LatencyMs"].includes(condition.field) && (condition.operator === "<" || condition.operator === "<=") && Number(condition.value) >= 3000) {
        errors.push("用户目标是小于 3 秒，触发条件应表达超过 3000ms 的风险，不能用 <= 3000 作为触发条件");
      }
    }
  }
  if (rule.allOf && hasContradictoryAllOf(rule.allOf)) errors.push("allOf 条件存在明显互相矛盾");
  if (errors.length > 0) throw new Error(errors.join("；"));
}

export function isNumericLike(value: string | number): boolean {
  if (typeof value === "string" && value.trim() === "") return false;
  return Number.isFinite(Number(value));
}

export function hasContradictoryAllOf(conditions: EvolutionTriggerCondition[]): boolean {
  const byField = new Map<string, EvolutionTriggerCondition[]>();
  for (const condition of conditions) {
    const list = byField.get(condition.field) ?? [];
    list.push(condition);
    byField.set(condition.field, list);
  }
  for (const list of byField.values()) {
    const equals = list.filter((item) => item.operator === "==").map((item) => String(item.value));
    if (new Set(equals).size > 1) return true;
    for (const eq of equals) {
      if (list.some((item) => item.operator === "!=" && String(item.value) === eq)) return true;
    }
    const numeric = list.filter((item) => isNumericLike(item.value));
    for (const gt of numeric.filter((item) => item.operator === ">" || item.operator === ">=")) {
      for (const lt of numeric.filter((item) => item.operator === "<" || item.operator === "<=")) {
        const left = Number(gt.value);
        const right = Number(lt.value);
        if (left > right || (left === right && (gt.operator === ">" || lt.operator === "<"))) return true;
      }
    }
  }
  return false;
}

export function isExecutableRuleValid(rule: EvolutionTriggerRule): boolean {
  try {
    validateExecutableRule(rule);
    return true;
  } catch {
    return false;
  }
}

export function isRuleInScope(rule: EvolutionTriggerRule, projectId?: string): boolean {
  return !rule.projectId || !projectId || rule.projectId === projectId;
}

export function inferRuleProjectId(ruleId: string): string | undefined {
  for (const knownProjectId of ["order-assistant-agent", "knowledge-cs-agent", "domainforge-fabric"]) {
    if (ruleId === knownProjectId || ruleId.startsWith(`${knownProjectId}-`)) return knownProjectId;
  }
  return undefined;
}

export function fallbackCompiledRule(projectId: string, userPrompt: string, reason: string): EvolutionTriggerRule {
  return {
    id: safeFileName(userPrompt.toLowerCase()).replace(/_/g, "-") || `rule-${Date.now()}`,
    projectId,
    name: userPrompt,
    description: `${reason}。项目 ${projectId} 默认按链路耗时超过 3000ms 触发性能优化机会点。`,
    userPrompt,
    compiledBy: "system",
    compiledAt: new Date().toISOString(),
    enabled: true,
    opportunityType: "performance-hotspot",
    title: "链路性能超过阈值，需要生成性能优化机会点",
    affectedArea: "runtime-performance",
    suggestedDirection: "补齐链路超时预算、性能适应度函数和回归验证。",
    riskLevel: "MEDIUM",
    anyOf: [{ field: "attributes.durationMs", operator: ">", value: 3000 }],
    minMatchingEvents: 1
  };
}

export function ruleMemoryFromCompiledRule(rule: EvolutionTriggerRule, llmTrace?: Record<string, unknown>): RuleMemory {
  return {
    id: rule.id,
    userPrompt: rule.userPrompt ?? rule.name,
    enabled: rule.enabled,
    description: rule.description,
    compiledRule: rule,
    storagePath: `rules/${safeFileName(rule.id)}.md`,
    llmTrace
  };
}

export function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON object not found");
  return text.slice(start, end + 1);
}

export function llmTraceFromResponse(mode: string, response: LlmGenerateResponse, startedAt: string): Record<string, unknown> {
  const totalTokens = response.usage?.totalTokens ?? 0;
  const creditsConsumed = response.usage?.creditsConsumed ?? totalTokens;
  return {
    mode,
    provider: response.provider,
    model: response.model,
    version: response.model,
    durationMs: response.durationMs,
    usage: response.usage,
    credits: {
      consumed: creditsConsumed,
      unit: response.usage?.creditUnit ?? "token",
      basis: "llm.usage.totalTokens"
    },
    creditsConsumed,
    resolvedIntent: response.resolvedIntent,
    resolvedProfile: response.resolvedProfile,
    preflightUsed: response.preflightUsed,
    truncated: response.truncated,
    truncationRetryAttempt: response.truncationRetryAttempt,
    finalMaxOutputTokens: response.finalMaxOutputTokens,
    promptCompressed: response.promptCompressed,
    compression: response.compression,
    errorCode: response.errorCode,
    startedAt
  };
}

export function normalizeProjectRepository(body: any): ProjectRepositoryRegistration | undefined {
  const source = body.repository && typeof body.repository === "object" ? body.repository : body;
  const gitUrl = source.gitUrl ?? source.url;
  const parsed = gitUrl ? parseGitUrl(String(gitUrl)) : {};
  const provider = String(source.provider ?? parsed.provider ?? "").trim() as ProjectRepositoryProvider;
  const nestedCredentials = source.credentials && typeof source.credentials === "object" ? source.credentials : {};
  if (provider !== "local-git" && provider !== "gitlab" && provider !== "github") return undefined;
  const workingRef = normalizeRepositoryRefInput(
    provider,
    source.workingRepository ?? source.workingRepo ?? body.workingRepository ?? body.workingRepo,
    undefined
  );
  const repository: ProjectRepositoryRegistration = {
    provider,
    gitUrl: workingRef?.gitUrl ?? (gitUrl ? String(gitUrl).trim() : undefined),
    root: source.root ? String(source.root).trim() : undefined,
    baseUrl: source.baseUrl ? String(source.baseUrl).trim() : workingRef?.baseUrl ?? parsed.baseUrl,
    projectId: workingRef?.projectId ?? (source.projectId ? String(source.projectId).trim() : parsed.projectId),
    owner: workingRef?.owner ?? (source.owner ? String(source.owner).trim() : parsed.owner),
    repo: workingRef?.repo ?? (source.repo ? String(source.repo).trim() : parsed.repo),
    defaultBranch: String(source.defaultBranch ?? "main").trim(),
    credentials: {
      username: source.username ? String(source.username) : nestedCredentials.username ? String(nestedCredentials.username) : undefined,
      password: source.password ? String(source.password) : nestedCredentials.password ? String(nestedCredentials.password) : undefined,
      token: source.token ? String(source.token) : nestedCredentials.token ? String(nestedCredentials.token) : undefined,
      tokenRef: source.tokenRef ? String(source.tokenRef) : nestedCredentials.tokenRef ? String(nestedCredentials.tokenRef) : undefined
    }
  };
  if (!repository.credentials?.username && body.username) repository.credentials!.username = String(body.username);
  if (!repository.credentials?.password && body.password) repository.credentials!.password = String(body.password);
  if (!repository.credentials?.token && body.token) repository.credentials!.token = String(body.token);
  if (!repository.credentials?.tokenRef && body.tokenRef) repository.credentials!.tokenRef = String(body.tokenRef);
  repository.topology = normalizeProjectRepositoryTopology(repository, source, body);
  return repository;
}

export function normalizeProjectRepositoryTopology(repository: ProjectRepositoryRegistration, source: any, body: any): ProjectRepositoryTopology | undefined {
  if (repository.provider === "local-git") return undefined;
  const existing = repository.topology;
  const executionMode = normalizeProjectExecutionMode(
    source.executionMode ?? source.devopsExecutionMode ?? body.executionMode ?? body.devopsExecutionMode,
    existing?.executionMode ?? "owned-repository"
  );
  const working = normalizeRepositoryRefInput(
    repository.provider,
    source.workingRepository ?? source.workingRepo ?? body.workingRepository ?? body.workingRepo,
    repositoryRefFromRegistration(repository)
  );
  if (!working) return undefined;
  const upstreamFallback = executionMode === "read-only-public" || executionMode === "upstream-authorized"
    ? repositoryRefFromRegistration(repository)
    : undefined;
  const upstream = normalizeRepositoryRefInput(
    repository.provider,
    source.upstreamRepository ?? source.upstreamRepo ?? body.upstreamRepository ?? body.upstreamRepo,
    upstreamFallback
  );
  return {
    executionMode,
    upstream,
    working,
    claimBoundary: normalizeProjectClaimBoundary(source.claimBoundary ?? body.claimBoundary, executionMode)
  };
}

export async function validateProjectRepository(repository: ProjectRepositoryRegistration | undefined, store?: FileStore, scope?: { tenantId?: string; workspaceId?: string }): Promise<ProjectValidation> {
  const checkedAt = new Date().toISOString();
  if (!repository) return { status: "FAILED", checkedAt, message: "必须提供 repository.provider，并且只能是 local-git、gitlab 或 github" };
  try {
    if (repository.provider === "local-git") {
      if (!repository.root) return { status: "FAILED", checkedAt, message: "local-git 接入必须提供 repository.root" };
      const files = listRepositoryFiles({ repoRoot: repository.root });
      return { status: "VERIFIED", checkedAt, message: "本地 Git 项目验证通过", fileCount: files.length };
    }
    if (repository.provider === "gitlab") {
      if (!repository.baseUrl || !repository.projectId) return { status: "FAILED", checkedAt, message: "GitLab 接入必须提供 gitUrl 或 baseUrl + projectId" };
      const token = resolveCredentialToken(repository, store, scope);
      if (!token) return { status: "FAILED", checkedAt, message: "GitLab 接入必须提供 token、password 或 tokenRef 对应的环境变量" };
      try {
        const files = await new GitLabHttpAdapter({ baseUrl: repository.baseUrl, projectId: repository.projectId, token }).listFiles(repository.defaultBranch ?? "main");
        return { status: "VERIFIED", checkedAt, message: "GitLab API 项目验证通过", fileCount: files.length };
      } catch (error) {
        const gitValidation = await validateGitRemoteAccess(repository, store, scope);
        if (gitValidation.status === "VERIFIED") return gitValidation;
        const apiMessage = error instanceof Error ? error.message : String(error);
        return { status: "FAILED", checkedAt, message: `GitLab API 验证失败：${apiMessage}；Git HTTPS 验证失败：${gitValidation.message}` };
      }
    }
    if (repository.provider === "github") {
      if (!repository.owner || !repository.repo) return { status: "FAILED", checkedAt, message: "GitHub 接入必须提供 gitUrl 或 owner + repo" };
      const token = resolveCredentialToken(repository, store, scope);
      try {
        const files = await new GitHubHttpAdapter({ apiBaseUrl: repository.baseUrl, owner: repository.owner, repo: repository.repo, token }).listFiles(repository.defaultBranch ?? "main");
        return { status: "VERIFIED", checkedAt, message: token ? "GitHub 项目验证通过" : "GitHub 公开项目验证通过", fileCount: files.length };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!token && /GitHub request failed: (401|403|404)/.test(message)) {
          return { status: "FAILED", checkedAt, message: `GitHub 公开项目验证失败：${message}；私有仓库必须提供 token、password 或 tokenRef 对应的环境变量` };
        }
        return { status: "FAILED", checkedAt, message: `GitHub 项目验证失败：${message}` };
      }
    }
  } catch (error) {
    return { status: "FAILED", checkedAt, message: error instanceof Error ? error.message : String(error) };
  }
  return { status: "FAILED", checkedAt, message: "不支持的项目接入方式" };
}

export function resolveCredentialToken(repository: ProjectRepositoryRegistration, store?: FileStore, scope?: { tenantId?: string; workspaceId?: string }): string | undefined {
  if (repository.credentials?.token) return repository.credentials.token;
  if (repository.credentials?.tokenRef) return resolveTokenRef(store, repository.credentials.tokenRef, scope);
  if (repository.credentials?.password) return repository.credentials.password;
  return undefined;
}

export function resolveTokenRef(store: FileStore | undefined, tokenRef: string, scope?: { tenantId?: string; workspaceId?: string }): string | undefined {
  const fromEnv = process.env[tokenRef];
  if (fromEnv) return fromEnv;
  if (!store) return undefined;
  const secret = store.readSecret(tokenRef);
  if (!secret || secret.status !== "ACTIVE") return undefined;
  if (scope?.tenantId && secret.tenantId !== scope.tenantId) return undefined;
  if (scope?.workspaceId && secret.workspaceId !== scope.workspaceId) return undefined;
  try {
    return decryptSecretValue(secret);
  } catch {
    return undefined;
  }
}

export async function validateGitRemoteAccess(repository: ProjectRepositoryRegistration, store?: FileStore, scope?: { tenantId?: string; workspaceId?: string }): Promise<ProjectValidation> {
  const checkedAt = new Date().toISOString();
  if (!repository.gitUrl) return { status: "FAILED", checkedAt, message: "缺少 gitUrl，无法执行 Git HTTPS 验证" };
  const password = repository.credentials?.password ?? resolveCredentialToken(repository, store, scope);
  const username = repository.credentials?.username ?? (password ? "oauth2" : undefined);
  if (!username || !password) return { status: "FAILED", checkedAt, message: "缺少用户名和密码/token，无法执行 Git HTTPS 验证" };
  const askpass = path.join(os.tmpdir(), `evopilot-git-askpass-${process.pid}-${Date.now()}.sh`);
  fs.writeFileSync(askpass, [
    "#!/bin/sh",
    "case \"$1\" in",
    `*Username*) printf '%s\\n' '${shellSingleQuote(username)}' ;;`,
    `*) printf '%s\\n' '${shellSingleQuote(password)}' ;;`,
    "esac",
    ""
  ].join("\n"), { mode: 0o700 });
  try {
    const branch = repository.defaultBranch ?? "main";
    const result = await runGitLsRemote(repository.gitUrl, branch, askpass);
    if (result.code !== 0) return { status: "FAILED", checkedAt, message: result.stderr };
    const refs = result.stdout.split("\n").filter(Boolean);
    if (refs.length === 0) return { status: "FAILED", checkedAt, message: `Git 仓库可访问，但未找到分支 ${branch}` };
    return { status: "VERIFIED", checkedAt, message: "GitLab Git HTTPS 项目验证通过" };
  } finally {
    fs.rmSync(askpass, { force: true });
  }
}

export async function runGitLsRemote(gitUrl: string, branch: string, askpass: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = spawn("git", ["ls-remote", "--heads", gitUrl, branch], {
    env: { ...process.env, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise<number>((resolve) => child.on("close", resolve));
  return { code, stdout, stderr: stderr.trim() || `git ls-remote 退出码 ${code}` };
}

export function shellSingleQuote(value: string): string {
  return value.replace(/'/g, "'\\''");
}

export function parseGitUrl(gitUrl: string): Partial<ProjectRepositoryRegistration> {
  const normalized = gitUrl.replace(/\.git$/, "");
  const sshMatch = normalized.match(/^git@([^:]+):(.+)\/([^/]+)$/);
  if (sshMatch) return parsedRepositoryFromHost(sshMatch[1], sshMatch[2], sshMatch[3]);
  try {
    const url = new URL(normalized);
    const parts = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    if (parts.length >= 2) return parsedRepositoryFromHost(url.hostname, parts.slice(0, -1).join("/"), parts.at(-1) ?? "");
  } catch {
    return {};
  }
  return {};
}

export function parsedRepositoryFromHost(host: string, namespace: string, repo: string): Partial<ProjectRepositoryRegistration> {
  const owner = namespace.split("/")[0] ?? namespace;
  if (host === "github.com" || host.endsWith(".github.com")) {
    return { provider: "github", owner, repo, baseUrl: host === "github.com" ? undefined : `https://${host}` };
  }
  return {
    provider: "gitlab",
    projectId: `${namespace}/${repo}`,
    baseUrl: `https://${host}`
  };
}

export async function triggerNativeDevopsDelivery(args: {
  store: FileStore;
  auth: AuthContext;
  run: StoredRun;
  delivery: DeliveryPlan;
  plan: EvolutionPlan;
  body: any;
  runtime: RuntimeConfig;
}): Promise<PipelineRun> {
  const { store, auth, run, delivery, plan, body } = args;
  const project = store.readProject(plan.projectId);
  if (!project?.devops) throw httpError(409, "DEVOPS_NOT_CONFIGURED", `项目 ${plan.projectId} 未配置 GitHub Actions 或 GitLab CI DevOps。`);
  const repository = project.repository;
  if (!repository) throw httpError(409, "PROJECT_REPOSITORY_NOT_CONFIGURED", `项目 ${plan.projectId} 未配置源码仓库。`);
  const devops = project.devops;
  const token = resolveProjectDevopsToken(project, store);
  if (!token) throw httpError(409, "DEVOPS_TOKEN_REQUIRED", "GitHub/GitLab 原生 DevOps 需要项目 source token 或 devops tokenRef。");
  const codeUpgrade = store.findSuccessfulCodeUpgrade(delivery.id);
  const parameters = normalizeDeliveryParameters(delivery, plan, {
    ...(devops.cd?.deployInputs ?? {}),
    ...(body.parameters && typeof body.parameters === "object" ? body.parameters : {})
  }, codeUpgrade);
  const nativeSourceRef = String(body.ref ?? body.branch ?? devops.ci.ref ?? codeUpgrade?.artifacts.branchName ?? codeUpgrade?.branchStrategy.upgradeBranch ?? repository.defaultBranch ?? "main").trim();
  const now = new Date().toISOString();
  logInfo("devops.pipeline.triggering", {
    actor: auth.actor,
    target: delivery.id,
    metadata: {
      projectId: delivery.projectId,
      provider: devops.provider,
      sourceMode: projectDevopsSourceMode(devops),
      ref: nativeSourceRef,
      workflow: devops.ci.workflow,
      deliveryPlanId: delivery.id,
      codeUpgradeRunId: codeUpgrade?.id
    }
  });
  let pipeline: PipelineRun;
  let pipelineRef = nativeSourceRef;
  if (devops.provider === "github-actions") {
    if (repository.provider !== "github") throw httpError(409, "DEVOPS_PROVIDER_PROJECT_MISMATCH", "github-actions requires a GitHub project.");
    if (!repository.owner || !repository.repo) throw httpError(409, "SOURCE_CLOSURE_GITHUB_COORDINATES_REQUIRED", "GitHub Actions requires owner and repo.");
    const ref = nativeSourceRef;
    pipelineRef = ref;
    const adapter = new GitHubHttpAdapter({ apiBaseUrl: repository.baseUrl, owner: repository.owner, repo: repository.repo, token });
    if (devops.ci.workflow) {
      await adapter.triggerWorkflowDispatch(devops.ci.workflow, ref, parameters);
    }
    const checks = await readGitHubChecksForPipeline(adapter, ref);
    const workflowRuns = devops.ci.workflow ? await readGitHubWorkflowRunsForPipeline(adapter, devops.ci.workflow, ref) : [];
    const latestRun = workflowRuns[0];
    const status = latestRun ? githubWorkflowRunToPipelineStatus(latestRun.status, latestRun.conclusion)
      : checks.length > 0 ? aggregatePipelineStatuses(checks.map((check) => githubCheckToPipelineStatus(check.status, check.conclusion)))
        : devops.ci.workflow ? "QUEUED" : "UNKNOWN";
    pipeline = createPipelineRun({
      id: `pipeline-${delivery.id}-${Date.now()}`,
      projectId: delivery.projectId,
      deliveryPlanId: delivery.id,
      provider: "github-actions",
      connectorId: `project:${project.id}`,
      jobName: devops.ci.workflow ?? ((devops.ci.requiredChecks ?? []).join(",") || "github-actions"),
      status,
      queueId: latestRun ? String(latestRun.id) : undefined,
      buildUrl: latestRun?.htmlUrl,
      stages: checks.map((check) => ({
        id: safeFileName(check.name || "check"),
        name: check.name || "GitHub check",
        status: pipelineStageStatusFromPipelineStatus(githubCheckToPipelineStatus(check.status, check.conclusion)),
        logUrl: latestRun?.htmlUrl
      })),
      logRef: { url: latestRun?.htmlUrl, preview: renderNativePipelineLogPreview("github-actions", status, [`ref=${ref}`, `workflow=${devops.ci.workflow ?? "checks"}`, `checks=${checks.length}`]) },
      parameters: { ...parameters, DEVOPS_REF: ref, DEVOPS_PROVIDER: devops.provider },
      now
    });
  } else if (devops.provider === "gitlab-ci") {
    const sourceMode = projectDevopsSourceMode(devops);
    const workflowRepository = projectDevopsGitLabWorkflowRepository(project, devops);
    if (sourceMode === "repository-native" && repository.provider !== "gitlab") throw httpError(409, "DEVOPS_PROVIDER_PROJECT_MISMATCH", "gitlab-ci requires a GitLab project.");
    if (sourceMode === "external-source" && repository.provider !== "github") throw httpError(409, "DEVOPS_PROVIDER_PROJECT_MISMATCH", "external-source gitlab-ci requires a GitHub source project.");
    if (!workflowRepository?.baseUrl || !workflowRepository.projectId) throw httpError(409, "SOURCE_CLOSURE_GITLAB_COORDINATES_REQUIRED", "GitLab CI requires a workflowRepository with baseUrl and projectId.");
    const ref = String(body.gitlabRef ?? body.workflowRef ?? (sourceMode === "external-source" ? projectDevopsGitLabRef(devops, workflowRepository) : nativeSourceRef)).trim();
    pipelineRef = ref;
    const gitlabParameters = sourceMode === "external-source"
      ? {
          ...parameters,
          ...projectDevopsBridgeParameters(project, devops, codeUpgrade),
          DEVOPS_REF: ref,
          DEVOPS_PROVIDER: devops.provider,
          DEVOPS_SOURCE_MODE: sourceMode
        }
      : parameters;
    const adapter = new GitLabHttpAdapter({ baseUrl: workflowRepository.baseUrl, projectId: workflowRepository.projectId, token });
    const triggered = await adapter.triggerPipeline(ref, gitlabParameters);
    const jobs = await readGitLabJobsForPipeline(adapter, triggered.id);
    const status = jobs.length > 0 ? aggregatePipelineStatuses(jobs.map((job) => gitLabPipelineStatus(job.status))) : gitLabPipelineStatus(triggered.status);
    pipeline = createPipelineRun({
      id: `pipeline-${delivery.id}-${Date.now()}`,
      projectId: delivery.projectId,
      deliveryPlanId: delivery.id,
      provider: "gitlab-ci",
      connectorId: `project:${project.id}`,
      jobName: devops.ci.workflow ?? ".gitlab-ci.yml",
      status,
      queueId: String(triggered.id),
      buildUrl: triggered.webUrl,
      stages: jobs.map((job) => ({
        id: safeFileName(String(job.id)),
        name: `${job.stage}/${job.name}`,
        status: pipelineStageStatusFromPipelineStatus(gitLabPipelineStatus(job.status)),
        logUrl: job.webUrl
      })),
      logRef: { url: triggered.webUrl, preview: renderNativePipelineLogPreview("gitlab-ci", status, [`ref=${ref}`, `pipeline=${triggered.id}`, `jobs=${jobs.length}`, `sourceMode=${sourceMode}`]) },
      parameters: { ...gitlabParameters, DEVOPS_REF: ref, DEVOPS_PROVIDER: devops.provider },
      now
    });
  } else {
    throw httpError(400, "DEVOPS_PROVIDER_UNSUPPORTED", `不支持的 DevOps provider：${String(devops.provider)}`);
  }
  store.writePipeline(pipeline);
  run.pipelineRuns = [...(run.pipelineRuns ?? []).filter((item) => item.id !== pipeline.id), pipeline];
  store.writeRun(run);
  store.appendAudit(audit(auth, "devops.pipeline.triggered", pipeline.id, { deliveryId: delivery.id, provider: pipeline.provider, ref: pipelineRef }));
  logInfo("devops.pipeline.triggered", {
    actor: auth.actor,
    target: pipeline.id,
    metadata: {
      projectId: pipeline.projectId,
      deliveryPlanId: delivery.id,
      provider: pipeline.provider,
      ref: pipelineRef,
      queueId: pipeline.queueId,
      buildUrl: pipeline.buildUrl,
      status: pipeline.status
    }
  });
  finalizePipelineIfNeeded(store, pipeline);
  return pipeline;
}

export async function readGitHubChecksForPipeline(adapter: GitHubHttpAdapter, ref: string): Promise<Array<{ name: string; status: string; conclusion?: string }>> {
  try {
    return await adapter.listChecks(ref);
  } catch {
    return [];
  }
}

export async function readGitHubWorkflowRunsForPipeline(adapter: GitHubHttpAdapter, workflow: string, ref: string): Promise<Array<{ id: number; name: string; status: string; conclusion?: string; htmlUrl?: string }>> {
  try {
    return await adapter.listWorkflowRuns(workflow, ref);
  } catch {
    return [];
  }
}

export async function readGitLabJobsForPipeline(adapter: GitLabHttpAdapter, pipelineId: number): Promise<Array<{ id: number; name: string; stage: string; status: string; webUrl?: string }>> {
  try {
    return await adapter.listPipelineJobs(pipelineId);
  } catch {
    return [];
  }
}

export function githubWorkflowRunToPipelineStatus(status: string, conclusion?: string): PipelineStatus {
  return githubCheckToPipelineStatus(status, conclusion);
}

export function aggregatePipelineStatuses(statuses: PipelineStatus[]): PipelineStatus {
  if (statuses.length === 0) return "UNKNOWN";
  if (statuses.some((status) => status === "FAILED")) return "FAILED";
  if (statuses.some((status) => status === "CANCELED")) return "CANCELED";
  if (statuses.some((status) => status === "RUNNING")) return "RUNNING";
  if (statuses.some((status) => status === "QUEUED")) return "QUEUED";
  if (statuses.every((status) => status === "SUCCEEDED")) return "SUCCEEDED";
  return "UNKNOWN";
}

export function pipelineStageStatusFromPipelineStatus(status: PipelineStatus): PipelineStage["status"] {
  if (status === "QUEUED") return "PENDING";
  if (status === "RUNNING") return "RUNNING";
  if (status === "SUCCEEDED") return "SUCCEEDED";
  if (status === "FAILED") return "FAILED";
  if (status === "CANCELED") return "SKIPPED";
  return "UNKNOWN";
}

export function renderNativePipelineLogPreview(provider: ProjectDevopsProvider, status: PipelineStatus, evidence: string[]): string {
  return [
    `provider=${provider}`,
    `status=${status}`,
    ...evidence
  ].join("\n");
}

export function normalizeDeliveryParameters(delivery: DeliveryPlan, plan: EvolutionPlan, parameters: unknown, codeUpgrade?: CodeUpgradeRun): Record<string, string> {
  return normalizeStringMap({
    PLAN_ID: plan.id,
    DELIVERY_ID: delivery.id,
    PROJECT_ID: delivery.projectId,
    TARGET_ENV: delivery.targetEnvironment,
    SOURCE_BRANCH: codeUpgrade?.branchStrategy.sourceBranch,
    UPGRADE_BRANCH: codeUpgrade?.artifacts.branchName ?? codeUpgrade?.branchStrategy.upgradeBranch,
    COMMIT_SHA: codeUpgrade?.artifacts.commitSha,
    MERGE_REQUEST_URL: codeUpgrade?.artifacts.pullRequestUrl,
    ...(parameters && typeof parameters === "object" ? parameters as Record<string, unknown> : {})
  });
}

export function projectDevopsBridgeParameters(project: StoredProject, devops: ProjectDevopsConfiguration, codeUpgrade?: CodeUpgradeRun): Record<string, string> {
  const repository = project.repository;
  const sourceRepository = repository?.provider === "github" && repository.owner && repository.repo ? `${repository.owner}/${repository.repo}` : undefined;
  const workflowRepository = repositoryDisplayName(devops.bridge?.workflowRepository);
  return normalizeStringMap({
    SOURCE_PROVIDER: repository?.provider,
    SOURCE_REPOSITORY: sourceRepository,
    SOURCE_GIT_URL: repository?.gitUrl,
    SOURCE_BRANCH: codeUpgrade?.branchStrategy.sourceBranch ?? repository?.defaultBranch,
    SOURCE_DEFAULT_BRANCH: repository?.defaultBranch,
    UPGRADE_BRANCH: codeUpgrade?.artifacts.branchName ?? codeUpgrade?.branchStrategy.upgradeBranch,
    COMMIT_SHA: codeUpgrade?.artifacts.commitSha,
    PULL_REQUEST_URL: codeUpgrade?.artifacts.pullRequestUrl,
    MERGE_REQUEST_URL: codeUpgrade?.artifacts.pullRequestUrl,
    WORKFLOW_PROVIDER: devops.bridge?.workflowRepository.provider,
    WORKFLOW_REPOSITORY: workflowRepository,
    DEVOPS_SOURCE_MODE: projectDevopsSourceMode(devops)
  });
}

export function normalizeStringMap(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== "").map(([key, item]) => [key, String(item)]));
}

export function renderRuleMemoryMarkdown(rule: EvolutionTriggerRule, llmTrace?: Record<string, unknown>): string {
  const compiledRule = {
    ...rule,
    compiledBy: rule.compiledBy ?? "system",
    compiledAt: rule.compiledAt ?? new Date().toISOString()
  };
  return [
    `# ${rule.name}`,
    "",
    `- 规则 ID：${rule.id}`,
    `- 用户规则：${rule.userPrompt ?? rule.name}`,
    `- 状态：${rule.enabled ? "已启用" : "已停用"}`,
    `- 编译方式：${compiledRule.compiledBy === "llm" ? "LLM 编译" : "系统内置"}`,
    "",
    "## 管理员说明",
    "",
    rule.description,
    "",
    "## 执行规则",
    "",
    "下面的 JSON 由系统读取执行。管理员可以打开本文件审查规则，但应通过 EvoPilot 规则编译流程修改，避免手工编辑导致语义和结构不一致。",
    "",
    "```json",
    JSON.stringify(compiledRule, null, 2),
    "```",
    ...(llmTrace ? [
      "",
      "<!-- evopilot-llm-trace",
      JSON.stringify(llmTrace, null, 2),
      "-->"
    ] : []),
    ""
  ].join("\n");
}

export function extractMarkdownField(markdown: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^- ${escaped}：(.+)$`, "m"));
  return match?.[1]?.trim();
}
