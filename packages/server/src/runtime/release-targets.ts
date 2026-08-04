import fs from "node:fs";
import { httpError } from "../http/errors.js";
import { safeFileName } from "../storage/json-files.js";
import type { PipelineRun } from "@evopilot/core";
import type {
  CodeUpgradeRun,
  ProofOpsCoreContract,
  ReleaseDecisionCriterion,
  ReleaseEvidenceBundle,
  ReleaseEvidenceListItem,
  ReleaseRisk,
  ReleaseScenarioResult,
  ReleaseScenarioStatus,
  ReleaseTargetProfile,
  SoakReport,
  StoredProject,
  StoredRun,
  TargetLoopDecisionStep,
  TargetLoopEvidenceRow,
  TargetLoopRun
} from "../model.js";

export function normalizeReleaseTarget(value: unknown): ReleaseTargetProfile {
  if (!isRecord(value)) throw httpError(400, "RELEASE_TARGET_INVALID", "发布目标必须是对象。");
  const now = new Date().toISOString();
  const existing = defaultReleaseTargets().find((target) => target.id === value.id);
  const id = safeFileName(String(value.id ?? existing?.id ?? ""));
  if (!id) throw httpError(400, "RELEASE_TARGET_ID_REQUIRED", "发布目标必须包含 id。");
  const requiredScenarioIds = Array.isArray(value.requiredScenarioIds)
    ? value.requiredScenarioIds.map(String).map(safeFileName).filter(Boolean)
    : existing?.requiredScenarioIds ?? defaultGAReleaseTarget().requiredScenarioIds;
  return {
    id,
    name: String(value.name ?? existing?.name ?? id),
    description: String(value.description ?? existing?.description ?? "自定义发布目标"),
    scope: normalizeReleaseTargetScope(value.scope, existing?.scope ?? (value.projectId ? "project" : "workspace")),
    projectId: optionalTrimmedString(value.projectId)?.replace(/[^a-zA-Z0-9_.:-]+/g, "-"),
    templateId: optionalTrimmedString(value.templateId) ?? existing?.templateId,
    minConnectedProjects: nonNegativeInteger(value.minConnectedProjects, existing?.minConnectedProjects ?? 1),
    minSucceededSoakSeconds: nonNegativeInteger(value.minSucceededSoakSeconds, existing?.minSucceededSoakSeconds ?? 0),
    requireActiveSoak: value.requireActiveSoak === undefined ? existing?.requireActiveSoak ?? false : Boolean(value.requireActiveSoak),
    minActiveSoakRunDelta: nonNegativeInteger(value.minActiveSoakRunDelta, existing?.minActiveSoakRunDelta ?? 1),
    minActiveSoakCodeUpgradeDelta: nonNegativeInteger(value.minActiveSoakCodeUpgradeDelta, existing?.minActiveSoakCodeUpgradeDelta ?? 1),
    minActiveSoakPipelineDelta: nonNegativeInteger(value.minActiveSoakPipelineDelta, existing?.minActiveSoakPipelineDelta ?? 1),
    minSuccessfulRuns: nonNegativeInteger(value.minSuccessfulRuns, existing?.minSuccessfulRuns ?? 1),
    minEvaluationDatasets: nonNegativeInteger(value.minEvaluationDatasets, existing?.minEvaluationDatasets ?? 1),
    minOpportunities: nonNegativeInteger(value.minOpportunities, existing?.minOpportunities ?? 1),
    minSuccessfulEvolutionBatches: nonNegativeInteger(value.minSuccessfulEvolutionBatches, existing?.minSuccessfulEvolutionBatches ?? 1),
    minSuccessfulCodeUpgrades: nonNegativeInteger(value.minSuccessfulCodeUpgrades, existing?.minSuccessfulCodeUpgrades ?? 1),
    minSuccessfulPipelines: nonNegativeInteger(value.minSuccessfulPipelines, existing?.minSuccessfulPipelines ?? 1),
    requiredScenarioIds,
    requireNoHighOpenRisks: value.requireNoHighOpenRisks === undefined ? existing?.requireNoHighOpenRisks ?? true : Boolean(value.requireNoHighOpenRisks),
    createdAt: value.createdAt ? String(value.createdAt) : existing?.createdAt ?? now,
    updatedAt: now
  };
}

function normalizeReleaseTargetScope(value: unknown, fallback: ReleaseTargetProfile["scope"]): ReleaseTargetProfile["scope"] {
  const normalized = String(value ?? fallback ?? "workspace").toLowerCase();
  if (normalized === "platform" || normalized === "tenant" || normalized === "workspace" || normalized === "project") return normalized;
  throw httpError(400, "RELEASE_TARGET_SCOPE_INVALID", `不支持的发布目标范围：${String(value)}`);
}

export function defaultReleaseTargets(): ReleaseTargetProfile[] {
  const now = "1970-01-01T00:00:00.000Z";
  return [
    {
      id: "experimental",
      name: "Experimental",
      description: "早期实验目标，用于验证项目接入、基础构建和最小证据链，不代表可对外试用。",
      scope: "workspace",
      templateId: "experimental",
      minConnectedProjects: 1,
      minSucceededSoakSeconds: 0,
      requireActiveSoak: false,
      minActiveSoakRunDelta: 0,
      minActiveSoakCodeUpgradeDelta: 0,
      minActiveSoakPipelineDelta: 0,
      minSuccessfulRuns: 0,
      minEvaluationDatasets: 0,
      minOpportunities: 0,
      minSuccessfulEvolutionBatches: 0,
      minSuccessfulCodeUpgrades: 0,
      minSuccessfulPipelines: 0,
      requiredScenarioIds: ["project-onboarding-smoke"],
      requireNoHighOpenRisks: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "alpha",
      name: "Alpha",
      description: "内部试用目标，要求项目接入、关键 smoke、至少一条运行证据和显式风险记录。",
      scope: "workspace",
      templateId: "alpha",
      minConnectedProjects: 1,
      minSucceededSoakSeconds: 0,
      requireActiveSoak: false,
      minActiveSoakRunDelta: 0,
      minActiveSoakCodeUpgradeDelta: 0,
      minActiveSoakPipelineDelta: 0,
      minSuccessfulRuns: 1,
      minEvaluationDatasets: 0,
      minOpportunities: 0,
      minSuccessfulEvolutionBatches: 0,
      minSuccessfulCodeUpgrades: 0,
      minSuccessfulPipelines: 1,
      requiredScenarioIds: ["alpha-smoke", "manual-approval"],
      requireNoHighOpenRisks: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "beta",
      name: "Beta",
      description: "有限用户试用目标，要求核心场景、CI/CD、一次 Source-to-Target 证据和无高危开放风险。",
      scope: "workspace",
      templateId: "beta",
      minConnectedProjects: 1,
      minSucceededSoakSeconds: 0,
      requireActiveSoak: false,
      minActiveSoakRunDelta: 0,
      minActiveSoakCodeUpgradeDelta: 0,
      minActiveSoakPipelineDelta: 0,
      minSuccessfulRuns: 1,
      minEvaluationDatasets: 1,
      minOpportunities: 0,
      minSuccessfulEvolutionBatches: 0,
      minSuccessfulCodeUpgrades: 1,
      minSuccessfulPipelines: 1,
      requiredScenarioIds: ["beta-core-flow", "ci-cd-pass", "manual-approval"],
      requireNoHighOpenRisks: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "rc",
      name: "Release Candidate",
      description: "候选发布目标，要求源码闭环、CI/CD、部署健康、回滚或修复证据和无高危开放风险。",
      scope: "workspace",
      templateId: "rc",
      minConnectedProjects: 1,
      minSucceededSoakSeconds: 0,
      requireActiveSoak: false,
      minActiveSoakRunDelta: 0,
      minActiveSoakCodeUpgradeDelta: 0,
      minActiveSoakPipelineDelta: 0,
      minSuccessfulRuns: 1,
      minEvaluationDatasets: 1,
      minOpportunities: 1,
      minSuccessfulEvolutionBatches: 1,
      minSuccessfulCodeUpgrades: 1,
      minSuccessfulPipelines: 2,
      requiredScenarioIds: ["source-to-production-closure", "deploy-health-ready", "rollback-or-repair", "manual-approval"],
      requireNoHighOpenRisks: true,
      createdAt: now,
      updatedAt: now
    },
    defaultGAReleaseTarget()
  ];
}

export function defaultGAReleaseTarget(): ReleaseTargetProfile {
  const now = "1970-01-01T00:00:00.000Z";
  return {
    id: "ga",
    name: "GA Release",
    description: "EvoPilot 生产 GA 发布目标，供 AI 或外部工具执行场景验证 loop 时作为统一判定标准。",
    scope: "workspace",
    templateId: "ga",
    minConnectedProjects: 5,
    minSucceededSoakSeconds: 90 * 60,
    requireActiveSoak: true,
    minActiveSoakRunDelta: 5,
    minActiveSoakCodeUpgradeDelta: 5,
    minActiveSoakPipelineDelta: 5,
    minSuccessfulRuns: 5,
    minEvaluationDatasets: 10,
    minOpportunities: 5,
    minSuccessfulEvolutionBatches: 5,
    minSuccessfulCodeUpgrades: 5,
    minSuccessfulPipelines: 5,
    requiredScenarioIds: [
      "normal-evolution-loop",
      "ci-cd-failure-recovery",
      "llm-failure-containment",
      "scm-failure-containment",
      "cost-slo-governance",
      "manual-approval",
      "multi-project-isolation",
      "restart-recovery",
      "rollback",
      "data-governance",
      "mainstream-loop-harness-alignment"
    ],
    requireNoHighOpenRisks: true,
    createdAt: now,
    updatedAt: now
  };
}

export function releaseTargetFromProofOpsCore(targetId: string, proofOpsCore?: ProofOpsCoreContract): ReleaseTargetProfile | undefined {
  const coreTarget = proofOpsCore?.targets?.find((item) => item.id === targetId);
  if (!coreTarget) return undefined;
  const now = new Date().toISOString();
  return {
    id: safeFileName(coreTarget.id),
    name: coreTarget.title ?? coreTarget.id.toUpperCase(),
    description: `ProofOps Core target ${coreTarget.id} imported into EvoPilot ProofOps Mode.`,
    minConnectedProjects: targetId === "ga" ? 5 : 1,
    minSucceededSoakSeconds: targetId === "ga" ? 5400 : 0,
    requireActiveSoak: targetId === "ga",
    minActiveSoakRunDelta: targetId === "ga" ? 5 : 0,
    minActiveSoakCodeUpgradeDelta: targetId === "ga" ? 5 : 0,
    minActiveSoakPipelineDelta: targetId === "ga" ? 5 : 0,
    minSuccessfulRuns: targetId === "ga" ? 5 : 1,
    minEvaluationDatasets: targetId === "ga" ? 10 : 0,
    minOpportunities: targetId === "ga" ? 5 : 0,
    minSuccessfulEvolutionBatches: targetId === "ga" ? 5 : 0,
    minSuccessfulCodeUpgrades: targetId === "ga" ? 5 : 0,
    minSuccessfulPipelines: targetId === "ga" ? 5 : 0,
    requiredScenarioIds: [],
    requireNoHighOpenRisks: targetId === "ga",
    createdAt: now,
    updatedAt: now
  };
}

export function buildProofOpsTargetPlan(args: {
  target: ReleaseTargetProfile;
  projectId: string;
  finalGoal?: string;
  proofOpsCore?: ProofOpsCoreContract;
}): TargetLoopRun["targetPlan"] {
  const { target, projectId } = args;
  const coreRequiredEvidence = args.proofOpsCore?.targets?.find((item) => item.id === target.id)?.requiredEvidence ?? [];
  return {
    finalGoal: args.finalGoal ?? `${projectId} reaches ${target.name} through a ProofOps target loop with real-boundary evidence.`,
    phaseGoals: [
      `target-readiness: confirm ${target.id} target plan and acceptance criteria`,
      "evidence-matrix: collect required release criteria and scenario evidence",
      "remediation-loop: route failed criteria to EvoPilot remediation and verification",
      "release-decision: produce GO, CONDITIONAL-GO, NO-GO, or BLOCKED with audit evidence"
    ],
    acceptanceCriteria: [
      `connectedProjects >= ${target.minConnectedProjects}`,
      `successfulRuns >= ${target.minSuccessfulRuns}`,
      `successfulEvolutionBatches >= ${target.minSuccessfulEvolutionBatches}`,
      `successfulCodeUpgrades >= ${target.minSuccessfulCodeUpgrades}`,
      `successfulPipelines >= ${target.minSuccessfulPipelines}`,
      `requiredScenarios pass: ${target.requiredScenarioIds.join(", ")}`,
      ...(coreRequiredEvidence.length > 0 ? coreRequiredEvidence : []),
      args.proofOpsCore?.productionReleaseEvidenceRule ?? "mock, fake, stub, simulator, fixture-only, demo-only, smoke-only, or chat-only evidence is not accepted as release evidence"
    ],
    finalDecision: ["GO", "CONDITIONAL-GO", "NO-GO", "BLOCKED"],
    source: "proofops-core-compatible",
    proofOpsCoreVersion: args.proofOpsCore?.version
  };
}

export function buildProofOpsFinalReport(args: {
  loop: TargetLoopRun;
  matrix: TargetLoopEvidenceRow[];
  decisionChain: TargetLoopDecisionStep[];
  releaseDecision?: TargetLoopRun["releaseDecision"];
}): NonNullable<TargetLoopRun["finalReport"]> {
  const required = args.matrix.filter((row) => row.required);
  const passed = required.filter((row) => row.status === "PASS");
  const failedOrBlocked = required.filter((row) => row.status !== "PASS");
  const finalDecision = args.releaseDecision?.status ?? "BLOCKED";
  const targetReached = args.releaseDecision?.targetReached === true;
  return {
    schema: "proofops-final-release-report/v1",
    projectId: args.loop.projectId,
    releaseTarget: args.loop.releaseTarget,
    lifecycleId: args.loop.id,
    terminalReason: targetReached ? "release-target-reached" : "target-loop-not-reached",
    generatedAt: new Date().toISOString(),
    targetPlan: args.loop.targetPlan,
    targetPlanConfirmation: args.loop.targetPlanConfirmation,
    releaseDecision: args.releaseDecision,
    finalTargetSummary: {
      finalGoal: args.loop.targetPlan.finalGoal,
      finalDecision,
      targetReached,
      latestCoverage: {
        required: required.length,
        passed: passed.length,
        failedOrBlocked: failedOrBlocked.length
      },
      blocker: failedOrBlocked[0]?.blocker ?? "",
      conclusion: targetReached
        ? `${args.loop.releaseTarget} target reached.`
        : `${args.loop.releaseTarget} target not reached; route blockers through EvoPilot remediation and resume the target loop.`
    },
    coverageMatrix: args.matrix,
    decisionChain: args.decisionChain,
    productionReleaseRule: args.loop.targetPlan.acceptanceCriteria.find((item) => item.startsWith("No mock")) ?? "No mock, fake, stub, simulator, fixture-only, demo-only, smoke-only, or chat-only evidence is counted as production release proof."
  };
}

export function loadProofOpsCoreContract(configuredPath?: string): ProofOpsCoreContract | undefined {
  const candidates = [
    configuredPath,
    process.env.EVOPILOT_PROOFOPS_CORE_CONTRACT,
    "/Users/wangyejing/github/ProofOps/dist/proofops-core-contract.json"
  ].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as ProofOpsCoreContract;
      if (parsed.schema === "proofops-core-contract/v1") return parsed;
    } catch {
      continue;
    }
  }
  return undefined;
}

export function parseConversationCommand(body: any): {
  kind: "create-target-loop";
  channel: string;
  conversationId: string;
  text: string;
  projectId: string;
  targetId: string;
  finalGoal?: string;
  candidate?: string;
} {
  const text = String(body.text ?? "").trim();
  if (!text) throw httpError(400, "CONVERSATION_TEXT_REQUIRED", "conversation command text is required");
  const targetId = safeFileName(String(body.targetId ?? inferTargetIdFromText(text) ?? "ga"));
  const projectId = safeFileName(String(body.projectId ?? inferProjectIdFromText(text) ?? "default-project"));
  return {
    kind: "create-target-loop",
    channel: String(body.channel ?? "codex"),
    conversationId: String(body.conversationId ?? `conversation-${Date.now()}`),
    text,
    projectId,
    targetId,
    finalGoal: body.finalGoal ? String(body.finalGoal) : `${projectId} reaches ${targetId.toUpperCase()} through EvoPilot ProofOps Mode.`,
    candidate: body.candidate ? String(body.candidate) : undefined
  };
}

export function extractImText(body: any): string {
  const candidates = [
    body.text,
    body.content,
    body.event?.message?.content,
    body.event?.message?.text,
    body.message?.content,
    body.message?.text
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      try {
        const parsed = JSON.parse(candidate);
        if (typeof parsed.text === "string") return parsed.text;
        if (typeof parsed.content === "string") return parsed.content;
      } catch {
        return candidate;
      }
    }
  }
  return "";
}

export function extractImConversationId(body: any, channel: string): string {
  return String(
    body.conversationId ??
    body.event?.message?.chat_id ??
    body.event?.message?.message_id ??
    body.chat_id ??
    body.msgid ??
    `${channel}-${Date.now()}`
  );
}

function inferTargetIdFromText(text: string): string | undefined {
  const normalized = text.toLowerCase();
  for (const target of ["demo-to-alpha", "alpha", "beta", "rc", "ga"]) {
    if (normalized.includes(target)) return target;
  }
  if (text.includes("发布") || text.includes("成熟度")) return "ga";
  return undefined;
}

function inferProjectIdFromText(text: string): string | undefined {
  const match = text.match(/(?:project|项目|产品)\s*[:：]?\s*([A-Za-z0-9_-]+)/);
  return match?.[1];
}

export function numericCriterion(id: string, name: string, actual: number, target: number, evidence: string[]): ReleaseDecisionCriterion {
  return { id, name, status: actual >= target ? "PASS" : "FAIL", actual, target, evidence, required: true };
}

export function booleanCriterion(id: string, name: string, actual: boolean, target: boolean, evidence: string[]): ReleaseDecisionCriterion {
  return { id, name, status: actual === target ? "PASS" : "FAIL", actual, target, evidence, required: true };
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

export function normalizeScenarioMatrix(value: unknown): ReleaseScenarioResult[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const now = new Date().toISOString();
  return value.map((item: any) => {
    const id = safeFileName(String(item.id ?? item.name ?? ""));
    if (!id) throw httpError(400, "RELEASE_SCENARIO_ID_REQUIRED", "发布场景必须包含 id 或 name。");
    return {
      id,
      name: String(item.name ?? id),
      status: normalizeReleaseScenarioStatus(item.status),
      evidence: Array.isArray(item.evidence) ? item.evidence.map(String) : item.evidence ? [String(item.evidence)] : [],
      required: item.required === undefined ? true : Boolean(item.required),
      updatedAt: item.updatedAt ? String(item.updatedAt) : now
    };
  });
}

function normalizeReleaseScenarioStatus(value: unknown): ReleaseScenarioStatus {
  const allowed: ReleaseScenarioStatus[] = ["PASS", "FAIL", "NOT-RUN", "NOT-APPLICABLE"];
  if (allowed.includes(value as ReleaseScenarioStatus)) return value as ReleaseScenarioStatus;
  throw httpError(400, "RELEASE_SCENARIO_STATUS_INVALID", `不支持的发布场景状态：${String(value)}`);
}

export function defaultReleaseScenarioMatrix(args: {
  pipelines: PipelineRun[];
  codeUpgrades: CodeUpgradeRun[];
  projects: StoredProject[];
  summary: Record<string, unknown>;
  now: string;
}): ReleaseScenarioResult[] {
  const { pipelines, codeUpgrades, projects, summary, now } = args;
  const succeededPipelineCount = pipelines.filter((pipeline) => pipeline.status === "SUCCEEDED").length;
  const failedPipelineCount = pipelines.filter((pipeline) => pipeline.status === "FAILED").length;
  const successfulUpgradeCount = codeUpgrades.filter((upgrade) => upgrade.status === "SUCCEEDED").length;
  const projectCount = projects.length;
  const frozenProjectCount = Number(summary.frozenProjectCount ?? 0);
  const activeBatchCount = Number(summary.activeEvolutionBatchCount ?? 0);
  const successfulBatchCount = Number(summary.successfulEvolutionBatchCount ?? 0);
  const governanceHealthy = Number(summary.failedPolicyCount ?? 0) === 0 &&
    Number(summary.sloHealth ?? 100) >= 99 &&
    Number(summary.errorBudgetRemaining ?? 100) >= 70 &&
    Number(summary.costHealth ?? 100) >= 90 &&
    Number(summary.releaseBlockedCount ?? 0) === 0 &&
    Number(summary.rolloutBlockedCount ?? 0) === 0;
  const normalLoopPassed = Number(summary.runCount ?? 0) > 0 &&
    Number(summary.evaluationDatasetCount ?? 0) > 0 &&
    Number(summary.opportunityCount ?? 0) > 0 &&
    successfulUpgradeCount > 0 &&
    succeededPipelineCount > 0 &&
    successfulBatchCount > 0;
  return [
    scenario("normal-evolution-loop", "正常进化闭环", normalLoopPassed ? "PASS" : "NOT-RUN", [
      `runs=${summary.runCount ?? 0}`,
      `datasets=${summary.evaluationDatasetCount ?? 0}`,
      `opportunities=${summary.opportunityCount ?? 0}`,
      `successfulCodeUpgrades=${successfulUpgradeCount}`,
      `successfulPipelines=${succeededPipelineCount}`,
      `successfulBatches=${successfulBatchCount}`
    ], true, now),
    scenario("ci-cd-failure-recovery", "CI/CD 失败恢复", failedPipelineCount > 0 ? "PASS" : "NOT-RUN", [
      `failedPipelines=${failedPipelineCount}`,
      `laterSuccessfulPipelines=${pipelines.filter((pipeline) => pipeline.status === "SUCCEEDED" && pipelines.some((failed) => failed.status === "FAILED" && failed.projectId === pipeline.projectId && failed.triggeredAt <= pipeline.triggeredAt)).length}`
    ], true, now),
    scenario("llm-failure-containment", "LLM 失败隔离", "NOT-RUN", ["未从当前持久化数据中发现 LLM 失败隔离证据。"], true, now),
    scenario("scm-failure-containment", "SCM 失败隔离", "NOT-RUN", ["未从当前持久化数据中发现 SCM 失败隔离证据。"], true, now),
    scenario("cost-slo-governance", "成本/SLO 治理", governanceHealthy || frozenProjectCount > 0 || Number(summary.releaseBlockedCount ?? 0) > 0 || Number(summary.rolloutBlockedCount ?? 0) > 0 ? "PASS" : "NOT-RUN", [
      `frozenProjects=${frozenProjectCount}`,
      `releaseBlocked=${summary.releaseBlockedCount ?? 0}`,
      `rolloutBlocked=${summary.rolloutBlockedCount ?? 0}`,
      `failedPolicies=${summary.failedPolicyCount ?? 0}`,
      `sloHealth=${summary.sloHealth ?? 100}`,
      `errorBudgetRemaining=${summary.errorBudgetRemaining ?? 100}`,
      `costHealth=${summary.costHealth ?? 100}`
    ], true, now),
    scenario("manual-approval", "人工审批门禁", Number(summary.confirmedReviewCount ?? 0) > 0 || Number(summary.pendingReviewCount ?? 0) > 0 ? "PASS" : "NOT-RUN", [
      `confirmedReviews=${summary.confirmedReviewCount ?? 0}`,
      `pendingReviews=${summary.pendingReviewCount ?? 0}`
    ], true, now),
    scenario("multi-project-isolation", "多项目隔离", projectCount >= 2 && Number(summary.runCount ?? 0) >= projectCount ? "PASS" : "NOT-RUN", [
      `projects=${projectCount}`,
      `runs=${summary.runCount ?? 0}`
    ], true, now),
    scenario("restart-recovery", "重启恢复", activeBatchCount === 0 && Number(summary.failedEvolutionBatchCount ?? 0) >= 0 ? "PASS" : "NOT-RUN", [
      `activeBatches=${activeBatchCount}`,
      `failedBatches=${summary.failedEvolutionBatchCount ?? 0}`
    ], true, now),
    scenario("rollback", "回滚路径", "NOT-RUN", ["未从当前持久化数据中发现真实 rollback 证据。"], true, now),
    scenario("data-governance", "数据治理", Number(summary.projectCount ?? 0) >= 0 && Array.isArray(summary.recentSoakReports) ? "PASS" : "NOT-RUN", [
      `soakReports=${Array.isArray(summary.recentSoakReports) ? summary.recentSoakReports.length : 0}`,
      "release evidence is generated without secrets"
    ], true, now),
    scenario("mainstream-loop-harness-alignment", "主流 Loop Harness 对齐", "NOT-RUN", [
      "未提供 LangGraph/CrewAI/AutoGen/OpenAI Agents SDK/E2B/Temporal/DBOS 等主流 Agent/Loop Harness 对齐证据。",
      "GA stable 需要证明 durable execution、checkpoint/persistence、human-in-loop、sandbox、multi-executor coordination、streaming trace、guardrails 和 source-to-production closure 已覆盖。"
    ], true, now)
  ];
}

function scenario(id: string, name: string, status: ReleaseScenarioStatus, evidence: string[], required: boolean, updatedAt: string): ReleaseScenarioResult {
  return { id, name, status, evidence, required, updatedAt };
}

export function mergeScenarioMatrix(defaults: ReleaseScenarioResult[], overrides: ReleaseScenarioResult[], now: string): ReleaseScenarioResult[] {
  const merged = new Map(defaults.map((item) => [item.id, item]));
  for (const override of overrides) {
    const existing = merged.get(override.id);
    merged.set(override.id, {
      ...existing,
      ...override,
      name: override.name ?? existing?.name ?? override.id,
      evidence: [...new Set([...(existing?.evidence ?? []), ...override.evidence])],
      required: override.required,
      updatedAt: override.updatedAt ?? now
    });
  }
  return [...merged.values()];
}

export function alignScenarioMatrixToReleaseTarget(matrix: ReleaseScenarioResult[], target: ReleaseTargetProfile, now: string): ReleaseScenarioResult[] {
  const requiredScenarioIds = new Set(target.requiredScenarioIds);
  if (target.id === "ga") return matrix.map((item) => ({ ...item, required: requiredScenarioIds.has(item.id) || item.required }));
  return matrix.map((item) => {
    if (requiredScenarioIds.has(item.id)) return { ...item, required: true };
    return {
      ...item,
      status: item.status === "PASS" ? "PASS" : "NOT-APPLICABLE",
      required: false,
      evidence: [
        ...item.evidence,
        `notApplicableForTarget=${target.id}`,
        "GA scenario evidence is retained for audit history but is not a release blocker for the current target"
      ],
      updatedAt: item.updatedAt ?? now
    };
  });
}

export function releaseEvidenceListItem(bundle: ReleaseEvidenceBundle): ReleaseEvidenceListItem {
  const summary = bundle.summary ?? {};
  return {
    id: bundle.id,
    tenantId: bundle.tenantId,
    workspaceId: bundle.workspaceId,
    projectId: bundle.projectId,
    candidate: bundle.candidate,
    status: bundle.status,
    releaseTargetId: bundle.releaseTargetId,
    releaseDecisionId: bundle.releaseDecisionId,
    generatedAt: bundle.generatedAt,
    summary: {
      projectCount: Number(summary.projectCount ?? 0),
      runCount: Number(summary.runCount ?? 0),
      releaseReadinessScore: Number(summary.releaseReadinessScore ?? 0),
      releaseBlockedCount: Number(summary.releaseBlockedCount ?? 0),
      rolloutBlockedCount: Number(summary.rolloutBlockedCount ?? 0),
      releaseDecisionCount: Number(summary.releaseDecisionCount ?? 0),
      latestReleaseDecisionId: isRecord(summary.latestReleaseDecision) ? String(summary.latestReleaseDecision.id ?? "") || undefined : undefined
    },
    scenarioSummary: {
      total: bundle.scenarioMatrix.length,
      passed: bundle.scenarioMatrix.filter((scenarioItem) => scenarioItem.status === "PASS").length,
      failed: bundle.scenarioMatrix.filter((scenarioItem) => scenarioItem.status === "FAIL").length,
      notRun: bundle.scenarioMatrix.filter((scenarioItem) => scenarioItem.status === "NOT-RUN").length,
      requiredFailed: bundle.scenarioMatrix.filter((scenarioItem) => scenarioItem.required && (scenarioItem.status === "FAIL" || scenarioItem.status === "NOT-RUN")).length
    },
    riskSummary: {
      total: bundle.riskRegister.length,
      open: bundle.riskRegister.filter((risk) => risk.status === "OPEN").length,
      highOpen: bundle.riskRegister.filter((risk) => risk.status === "OPEN" && (risk.severity === "HIGH" || risk.severity === "CRITICAL")).length
    },
    createdAt: bundle.createdAt,
    updatedAt: bundle.updatedAt
  };
}

export function compactReleaseEvidenceSummary(summary: Record<string, unknown>): Record<string, unknown> {
  const scalarKeys = [
    "projectCount",
    "runCount",
    "pipelineCount",
    "evaluationDatasetCount",
    "evolutionBatchCount",
    "activeEvolutionBatchCount",
    "costOptimizationEvolutionBatchCount",
    "successfulEvolutionBatchCount",
    "failedEvolutionBatchCount",
    "frozenProjectCount",
    "costOptimizationReadyCount",
    "selfLearningDatasetCount",
    "opportunityInsightCount",
    "opportunityInsightQuality",
    "learningRecordCount",
    "serviceScorecardCount",
    "averageServiceScore",
    "sloHealth",
    "errorBudgetRemaining",
    "failedPolicyCount",
    "supplyChainRiskCount",
    "costRiskCount",
    "costHealth",
    "releaseReadyCount",
    "releaseBlockedCount",
    "releaseReadinessScore",
    "canaryReadyCount",
    "rolloutBlockedCount",
    "codeUpgradeCount",
    "runningCodeUpgradeCount",
    "runningPipelineCount",
    "opportunityCount",
    "pendingReviewCount",
    "confirmedReviewCount",
    "releaseCount",
    "releaseHealth",
    "releaseTargetCount",
    "releaseDecisionCount"
  ];
  const compact: Record<string, unknown> = {};
  for (const key of scalarKeys) compact[key] = summary[key];
  for (const key of [
    "evolutionFreezes",
    "recentOpportunityInsights",
    "serviceScorecards",
    "sloReports",
    "policyEvaluations",
    "supplyChainReports",
    "costReports",
    "releaseReadiness",
    "rolloutStrategies",
    "recentEvolutionBatches",
    "recentSoakReports",
    "recentReleaseEvidence",
    "latestReleaseDecision"
  ]) {
    if (summary[key] !== undefined) compact[key] = summary[key];
  }
  return JSON.parse(JSON.stringify(compact, (_key, value) => {
    if (typeof value === "string") return redactSensitiveText(value);
    return value;
  })) as Record<string, unknown>;
}

export function runFinishedAt(runs: StoredRun[], evidenceBundleId: string): string {
  return runs.find((run) => run.evidenceBundle.id === evidenceBundleId)?.evidenceBundle.timeWindow.to ?? new Date(0).toISOString();
}

export function isActiveSoakReport(report: SoakReport, target: ReleaseTargetProfile): boolean {
  if (!target.requireActiveSoak) return true;
  const summary = report.summary ?? {};
  if (summary.requireActivity !== true) return false;
  const activity = isRecord(summary.activity) ? summary.activity : {};
  const runDelta = Number(activity.runDelta ?? 0);
  const codeUpgradeDelta = Number(activity.codeUpgradeDelta ?? 0);
  const pipelineDelta = Number(activity.pipelineDelta ?? 0);
  return runDelta >= (target.minActiveSoakRunDelta ?? 1) &&
    codeUpgradeDelta >= (target.minActiveSoakCodeUpgradeDelta ?? 1) &&
    pipelineDelta >= (target.minActiveSoakPipelineDelta ?? 1);
}

export function hasLaterSuccessfulPipeline(failed: PipelineRun, pipelines: PipelineRun[]): boolean {
  return pipelines.some((pipeline) =>
    pipeline.projectId === failed.projectId &&
    pipeline.status === "SUCCEEDED" &&
    Date.parse(pipeline.triggeredAt) >= Date.parse(failed.triggeredAt)
  );
}

export function hasLaterSuccessfulCodeUpgrade(failed: CodeUpgradeRun, upgrades: CodeUpgradeRun[]): boolean {
  return upgrades.some((upgrade) =>
    upgrade.projectId === failed.projectId &&
    upgrade.status === "SUCCEEDED" &&
    Date.parse(upgrade.updatedAt) >= Date.parse(failed.updatedAt)
  );
}

export function dedupeReleaseRisks(risks: ReleaseRisk[]): ReleaseRisk[] {
  const seen = new Map<string, ReleaseRisk>();
  for (const risk of risks) {
    const existing = seen.get(risk.id);
    if (!existing) {
      seen.set(risk.id, risk);
      continue;
    }
    existing.evidence = [...new Set([...existing.evidence, ...risk.evidence])];
    existing.severity = releaseRiskRank(risk.severity) > releaseRiskRank(existing.severity) ? risk.severity : existing.severity;
    existing.status = existing.status === "OPEN" || risk.status === "OPEN" ? "OPEN" : existing.status;
  }
  return [...seen.values()].sort((left, right) => releaseRiskRank(right.severity) - releaseRiskRank(left.severity) || left.id.localeCompare(right.id));
}

export function inferReleaseArtifactType(artifactPath: string): ReleaseEvidenceBundle["artifacts"][number]["type"] {
  if (/\.(png|jpg|jpeg|webp)$/i.test(artifactPath)) return "dashboard";
  if (/\.(log|jsonl|txt)$/i.test(artifactPath)) return "log";
  return "other";
}

function releaseRiskRank(severity: ReleaseRisk["severity"]): number {
  return ({ LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 })[severity];
}

function redactSensitiveText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]")
    .replace(/glpat-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/(token|password|secret|credential|api[_-]?key)([=:]\s*)([^\s"',}]+)/gi, "$1$2[REDACTED]");
}

function optionalTrimmedString(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
