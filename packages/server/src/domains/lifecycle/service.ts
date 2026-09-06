import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { FileLifecycleCatalog } from "./catalog.js";
import { conditionMatches, interpolateLifecycleValue, resolveLifecycleInputs } from "./core.js";
import { LifecycleActionRegistry, stableJson } from "./registry.js";
import {
  LIFECYCLE_BINDING_SCHEMA,
  LIFECYCLE_RUN_SCHEMA,
  type LifecycleAgentExecutionRequest,
  type LifecycleBinding,
  type LifecycleDecisionRecord,
  type LifecycleExternalResult,
  type HarnessExecutionFeedbackPackage,
  type LifecycleInputSources,
  type LifecycleRun,
  type LifecycleStageAttempt,
  type LifecycleStartRequest
} from "./types.js";

export class LifecycleService {
  readonly catalog: FileLifecycleCatalog;
  readonly registry: LifecycleActionRegistry;
  private readonly runsDir: string;
  private readonly feedbackDir: string;

  constructor(dataRoot: string, catalogRoots: string[]) {
    this.registry = new LifecycleActionRegistry();
    this.catalog = new FileLifecycleCatalog(catalogRoots, this.registry);
    this.runsDir = path.join(dataRoot, "lifecycle-runs");
    this.feedbackDir = path.join(dataRoot, "lifecycle-feedback");
    fs.mkdirSync(this.runsDir, { recursive: true });
    fs.mkdirSync(this.feedbackDir, { recursive: true });
  }

  resolveInputs(lifecycleId: string, lifecycleVersion: string | undefined, sources: LifecycleInputSources) {
    return resolveLifecycleInputs(this.catalog.resolve(lifecycleId, lifecycleVersion), sources);
  }

  start(input: LifecycleStartRequest): LifecycleRun {
    const revision = this.catalog.resolve(input.lifecycleId, input.lifecycleVersion);
    const inputBinding = resolveLifecycleInputs(revision, input);
    validateDigest("policyDigest", input.policyDigest);
    validateDigest("runtimeDigest", input.runtimeDigest);
    validateDigest("harnessBundle.digest", input.harnessBundle.digest);
    normalizeExecutor(input.executor);
    const now = new Date().toISOString();
    const id = safeId(input.id ?? `lifecycle-${input.projectId}-${randomUUID()}`);
    const base: LifecycleRun = {
      schema: LIFECYCLE_RUN_SCHEMA,
      id,
      status: inputBinding.status === "INCOMPLETE" ? "WAITING_INPUT" : "WAITING_AUTHORIZATION",
      revision,
      inputBinding,
      stageAttempts: [],
      decisions: [],
      trajectory: [],
      tenantId: safeId(input.tenantId),
      workspaceId: safeId(input.workspaceId),
      projectId: safeId(input.projectId),
      goalId: input.goalId ? safeId(input.goalId) : undefined,
      targetId: input.targetId ? safeId(input.targetId) : undefined,
      createdAt: now,
      updatedAt: now
    };
    const run = inputBinding.status === "READY_FOR_REVIEW"
      ? { ...base, binding: buildBinding(base, input) }
      : base;
    return this.write(run);
  }

  answer(id: string, answers: Record<string, unknown>, sources: Omit<LifecycleInputSources, "answers"> = {}): LifecycleRun {
    const run = this.require(id);
    if (run.planAuthorization || run.stageAttempts.length > 0) throw new Error("LIFECYCLE_INPUTS_LOCKED: execution already authorized or started");
    const previous = (source: string) => Object.fromEntries(Object.entries(run.inputBinding.values).filter(([, value]) => value.source === source).map(([key, value]) => [key, value.value]));
    const inputBinding = resolveLifecycleInputs(run.revision, {
      answers: { ...previous("user"), ...answers },
      projectFacts: { ...previous("project"), ...(sources.projectFacts ?? {}) },
      organizationDefaults: { ...previous("organization"), ...(sources.organizationDefaults ?? {}) },
      runtimeCapabilities: { ...previous("runtime"), ...(sources.runtimeCapabilities ?? {}) },
      deterministicValues: { ...previous("deterministic"), ...(sources.deterministicValues ?? {}) }
    });
    const updatedBase: LifecycleRun = {
      ...run,
      inputBinding,
      status: inputBinding.status === "INCOMPLETE" ? "WAITING_INPUT" : run.binding ? "WAITING_AUTHORIZATION" : "WAITING_BINDING_REVIEW",
      updatedAt: new Date().toISOString()
    };
    const updated: LifecycleRun = inputBinding.status === "READY_FOR_REVIEW" && run.binding
      ? {
          ...updatedBase,
          binding: buildBinding(updatedBase, {
            policyDigest: run.binding.policyDigest,
            runtimeDigest: run.binding.runtimeDigest,
            evidenceDigest: run.binding.evidenceDigest,
            harnessBundle: run.binding.harnessBundle,
            executor: run.binding.executor
          })
        }
      : { ...updatedBase, binding: undefined };
    return this.write(updated);
  }

  finalizeBinding(id: string, input: Pick<LifecycleStartRequest, "policyDigest" | "runtimeDigest" | "evidenceDigest" | "harnessBundle" | "executor">): LifecycleRun {
    const run = this.require(id);
    if (run.inputBinding.status !== "READY_FOR_REVIEW") throw new Error("LIFECYCLE_INPUTS_INCOMPLETE");
    return this.write({ ...run, binding: buildBinding(run, input), status: "WAITING_AUTHORIZATION", updatedAt: new Date().toISOString() });
  }

  authorizePlan(id: string, decision: "APPROVED" | "REJECTED", actor: string, evidenceRef: string, bindingDigest: string): LifecycleRun {
    const run = this.require(id);
    this.assertRunIntegrity(run);
    if (!run.binding) throw new Error("LIFECYCLE_BINDING_REQUIRED");
    if (bindingDigest !== run.binding.digest) throw new Error("LIFECYCLE_AUTHORIZATION_DIGEST_MISMATCH");
    if (!actor.trim() || !evidenceRef.trim()) throw new Error("LIFECYCLE_AUTHORIZATION_EVIDENCE_REQUIRED");
    const record: LifecycleDecisionRecord = {
      stageId: "$plan",
      authority: "plan",
      decision,
      bindingDigest,
      actor,
      evidenceRef,
      decidedAt: new Date().toISOString()
    };
    return this.write({ ...run, planAuthorization: record, status: decision === "APPROVED" ? "RUNNING" : "CANCELLED", updatedAt: record.decidedAt });
  }

  decide(id: string, stageId: string, decision: "APPROVED" | "REJECTED", actor: string, evidenceRef: string, bindingDigest: string): LifecycleRun {
    const run = this.require(id);
    this.assertRunIntegrity(run);
    if (!run.binding || bindingDigest !== run.binding.digest) throw new Error("LIFECYCLE_DECISION_DIGEST_MISMATCH");
    if (run.currentStageId !== stageId || run.status !== "WAITING_DECISION") throw new Error("LIFECYCLE_DECISION_NOT_PENDING");
    if (!actor.trim() || !evidenceRef.trim()) throw new Error("LIFECYCLE_DECISION_EVIDENCE_REQUIRED");
    const stage = run.revision.definition.stages.find((candidate) => candidate.id === stageId)!;
    const record: LifecycleDecisionRecord = {
      stageId,
      authority: run.pendingDecisionAuthority ?? stage.decision.authority ?? "stage",
      decision,
      bindingDigest,
      actor,
      evidenceRef,
      decidedAt: new Date().toISOString()
    };
    const attempts = decision === "APPROVED" ? run.stageAttempts : [...run.stageAttempts, failedAttempt(stageId, stage.action.uses, "Human decision rejected", record.decidedAt)];
    return this.write({ ...run, decisions: [...run.decisions, record], stageAttempts: attempts, pendingDecisionAuthority: undefined, status: decision === "APPROVED" ? "RUNNING" : "FAILED", updatedAt: record.decidedAt });
  }

  cancel(id: string, actor: string, evidenceRef: string, bindingDigest: string): LifecycleRun {
    const run = this.require(id);
    this.assertRunIntegrity(run);
    if (!run.binding || run.binding.digest !== bindingDigest) throw new Error("LIFECYCLE_CANCELLATION_DIGEST_MISMATCH");
    if (!actor.trim() || !evidenceRef.trim()) throw new Error("LIFECYCLE_CANCELLATION_EVIDENCE_REQUIRED");
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(run.status)) throw new Error("LIFECYCLE_CANCELLATION_NOT_PENDING");
    const decidedAt = new Date().toISOString();
    const record: LifecycleDecisionRecord = {
      stageId: "$cancel",
      authority: "lifecycle-cancellation",
      decision: "REJECTED",
      bindingDigest,
      actor,
      evidenceRef,
      decidedAt
    };
    return this.write({
      ...run,
      status: "CANCELLED",
      decisions: [...run.decisions, record],
      pendingExecution: undefined,
      pendingDecisionAuthority: undefined,
      updatedAt: decidedAt
    });
  }

  advance(id: string): LifecycleRun {
    const run = this.require(id);
    this.assertRunIntegrity(run);
    if (run.status === "WAITING_INPUT" || run.status === "WAITING_BINDING_REVIEW" || run.status === "WAITING_AUTHORIZATION" || run.status === "WAITING_DECISION" || run.status === "WAITING_EXTERNAL_SIGNAL") return run;
    if (run.status !== "RUNNING") return run;
    if (run.planAuthorization?.decision !== "APPROVED" || run.planAuthorization.bindingDigest !== run.binding?.digest) throw new Error("LIFECYCLE_PLAN_AUTHORIZATION_REQUIRED");
    const completed = new Set(run.stageAttempts.filter((attempt) => ["SUCCEEDED", "SKIPPED"].includes(attempt.status)).map((attempt) => attempt.stageId));
    const stage = run.revision.definition.stages.find((candidate) => !completed.has(candidate.id) && (candidate.needs ?? []).every((dependency) => completed.has(dependency)));
    if (!stage) {
      const unfinished = run.revision.definition.stages.some((candidate) => !completed.has(candidate.id));
      return this.write({ ...run, status: unfinished ? "FAILED" : "SUCCEEDED", currentStageId: undefined, updatedAt: new Date().toISOString() });
    }
    if (!conditionMatches(stage.when, run.inputBinding.values) || stage.decision.mode === "DISABLED") {
      return this.write({ ...run, status: "RUNNING", currentStageId: stage.id, stageAttempts: [...run.stageAttempts, skippedAttempt(stage.id, stage.action.uses)], updatedAt: new Date().toISOString() });
    }
    const binding = run.binding;
    if (!binding) throw new Error("LIFECYCLE_BINDING_REQUIRED");
    const existingDecision = run.decisions.find((decision) => decision.stageId === stage.id && decision.decision === "APPROVED" && decision.bindingDigest === binding.digest);
    if (stage.decision.mode === "HUMAN" && !existingDecision) {
      return this.write({ ...run, status: "WAITING_DECISION", currentStageId: stage.id, updatedAt: new Date().toISOString() });
    }
    const action = this.registry.resolve(stage.action.uses)!;
    if (action.execution === "EXTERNAL_ADAPTER") {
      const missingCapabilities = (stage.capabilities ?? action.capabilities).filter((capability) => !binding.executor.capabilities.includes(capability));
      if (missingCapabilities.length > 0) throw new Error(`LIFECYCLE_EXECUTOR_CAPABILITY_MISMATCH: ${missingCapabilities.join(", ")}`);
      const priorAttempts = run.stageAttempts.filter((attempt) => attempt.stageId === stage.id);
      if (priorAttempts.length >= (stage.retry?.maxAttempts ?? 1)) {
        return this.write({ ...run, status: "FAILED", currentStageId: stage.id, updatedAt: new Date().toISOString() });
      }
      const actionInputs = interpolateLifecycleValue(stage.action.with ?? {}, run.inputBinding) as Record<string, unknown>;
      const pendingExecution: LifecycleAgentExecutionRequest = {
        schema: "evopilot-agent-execution-request/v1alpha1",
        id: `execution-${run.id}-${stage.id}-${priorAttempts.length + 1}`,
        runId: run.id,
        stageId: stage.id,
        action: action.id,
        actionVersion: action.version,
        bindingDigest: binding.digest,
        inputs: action.id === "evopilot.goal-loop"
          ? { ...actionInputs, goalId: run.goalId ?? actionInputs.goalId, targetId: run.targetId ?? actionInputs.targetId, projectId: run.projectId }
          : actionInputs,
        capabilities: stage.capabilities ?? action.capabilities,
        executor: binding.executor
      };
      return this.write({ ...run, status: "WAITING_EXTERNAL_SIGNAL", currentStageId: stage.id, pendingExecution, updatedAt: new Date().toISOString() });
    }
    const now = new Date().toISOString();
    const result = { stageId: stage.id, action: stage.action.uses, bindingDigest: binding.digest, inputs: interpolateLifecycleValue(stage.action.with ?? {}, run.inputBinding) };
    const attempt: LifecycleStageAttempt = {
      stageId: stage.id,
      attempt: run.stageAttempts.filter((candidate) => candidate.stageId === stage.id).length + 1,
      status: "SUCCEEDED",
      action: stage.action.uses,
      receiptDigest: digest(result),
      evidence: [`action=${stage.action.uses}`, `binding=${binding.digest}`, `result=${digest(result)}`],
      startedAt: now,
      finishedAt: now
    };
    return this.write({ ...run, status: "RUNNING", currentStageId: stage.id, stageAttempts: [...run.stageAttempts, attempt], updatedAt: now });
  }

  advanceUntilBoundary(id: string): LifecycleRun {
    let run = this.require(id);
    const limit = run.revision.definition.stages.length + 1;
    for (let index = 0; index < limit && run.status === "RUNNING"; index += 1) {
      const attempts = run.stageAttempts.length;
      run = this.advance(id);
      if (run.status === "RUNNING" && run.stageAttempts.length === attempts) break;
    }
    return run;
  }

  recordExternalResult(id: string, result: LifecycleExternalResult): LifecycleRun {
    const run = this.require(id);
    this.assertRunIntegrity(run);
    const { requestId, status, receiptDigest } = result;
    validateDigest("receiptDigest", receiptDigest);
    for (const artifact of result.artifacts ?? []) validateDigest("artifact.digest", artifact.digest);
    const replay = run.stageAttempts.find((attempt) => attempt.externalRequestId === requestId);
    if (replay) {
      if (replay.receiptDigest === receiptDigest) return run;
      throw new Error("LIFECYCLE_EXTERNAL_RECEIPT_CONFLICT");
    }
    if (run.status !== "WAITING_EXTERNAL_SIGNAL" || run.pendingExecution?.id !== requestId) throw new Error("LIFECYCLE_EXTERNAL_SIGNAL_NOT_PENDING");
    const now = new Date().toISOString();
    const evidence = (result.evidence ?? []).map(redactEvidence);
    const attempt: LifecycleStageAttempt = {
      stageId: run.pendingExecution.stageId,
      attempt: run.stageAttempts.filter((candidate) => candidate.stageId === run.pendingExecution?.stageId).length + 1,
      status: status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED",
      action: `${run.pendingExecution.action}@${run.pendingExecution.actionVersion}`,
      receiptDigest,
      externalRequestId: requestId,
      evidence,
      startedAt: now,
      finishedAt: now
    };
    const trajectory = {
      schema: "evopilot-agent-trajectory-entry/v1alpha1" as const,
      requestId,
      runId: run.id,
      stageId: run.pendingExecution.stageId,
      bindingDigest: run.pendingExecution.bindingDigest,
      host: run.pendingExecution.executor.host,
      provider: run.pendingExecution.executor.provider,
      model: run.pendingExecution.executor.model,
      capabilities: [...run.pendingExecution.capabilities],
      status,
      receiptDigest,
      cost: {
        amount: Math.max(0, Number(result.cost?.amount ?? 0)),
        currency: String(result.cost?.currency ?? "USD"),
        inputTokens: result.cost?.inputTokens,
        outputTokens: result.cost?.outputTokens
      },
      artifacts: (result.artifacts ?? []).map((artifact) => ({ ref: redactEvidence(artifact.ref), digest: artifact.digest })),
      evidence,
      recordedAt: now
    };
    return this.write({
      ...run,
      status: status === "SUCCEEDED" ? "RUNNING" : status === "UNCERTAIN" ? "WAITING_DECISION" : "FAILED",
      stageAttempts: [...run.stageAttempts, attempt],
      trajectory: [...run.trajectory, trajectory],
      pendingExecution: undefined,
      pendingDecisionAuthority: status === "UNCERTAIN" ? "recovery" : undefined,
      updatedAt: now
    });
  }

  createFeedbackPackage(id: string, input: { bindingDigest: string; actor: string; evidenceRef: string }): HarnessExecutionFeedbackPackage {
    const run = this.require(id);
    if (!run.binding || run.binding.digest !== input.bindingDigest) throw new Error("LIFECYCLE_FEEDBACK_DIGEST_MISMATCH");
    if (!input.actor.trim() || !input.evidenceRef.trim()) throw new Error("LIFECYCLE_FEEDBACK_APPROVAL_REQUIRED");
    if (!run.trajectory.length) throw new Error("LIFECYCLE_FEEDBACK_TRAJECTORY_REQUIRED");
    const feedbackId = `feedback-${run.id}-${run.trajectory.length}`;
    const target = path.join(this.feedbackDir, `${safeId(feedbackId)}.json`);
    if (fs.existsSync(target)) {
      const existing = JSON.parse(fs.readFileSync(target, "utf8")) as HarnessExecutionFeedbackPackage;
      if (existing.bindingDigest === input.bindingDigest && existing.approval.actor === input.actor && existing.approval.evidenceRef === input.evidenceRef) return existing;
      throw new Error("LIFECYCLE_FEEDBACK_IMMUTABLE_CONFLICT");
    }
    const approval: LifecycleDecisionRecord = {
      stageId: "$feedback-export",
      authority: "feedback-export",
      decision: "APPROVED",
      bindingDigest: run.binding.digest,
      actor: input.actor,
      evidenceRef: input.evidenceRef,
      decidedAt: new Date().toISOString()
    };
    const successful = run.stageAttempts.filter((attempt) => attempt.status === "SUCCEEDED").length;
    const total = Math.max(1, run.stageAttempts.filter((attempt) => attempt.status !== "SKIPPED").length);
    const totalCost = run.trajectory.reduce((sum, entry) => sum + entry.cost.amount, 0);
    const reward = {
      schema: "evopilot-lifecycle-reward-contract/v1alpha1" as const,
      outcome: run.status === "SUCCEEDED" ? 1 : run.status === "FAILED" ? 0 : 0.5,
      process: successful / total,
      safety: run.decisions.some((decision) => decision.decision === "REJECTED") || run.trajectory.some((entry) => entry.status === "UNCERTAIN") ? 0.5 : 1,
      cost: 1 / (1 + totalCost),
      aggregate: 0,
      evidence: [`runStatus=${run.status}`, `successfulStages=${successful}/${total}`, `trajectoryEntries=${run.trajectory.length}`, `totalCost=${totalCost}`]
    };
    reward.aggregate = Number(((reward.outcome + reward.process + reward.safety + reward.cost) / 4).toFixed(6));
    const material = {
      schema: "evopilot-harness-execution-feedback-package/v1alpha1" as const,
      id: feedbackId,
      lifecycleRunId: run.id,
      bindingDigest: run.binding.digest,
      harnessBundle: run.binding.harnessBundle,
      visibility: "PRIVATE" as const,
      redaction: "STRICT" as const,
      trajectory: run.trajectory.map((entry) => ({ ...entry, evidence: entry.evidence.map(redactEvidence), artifacts: entry.artifacts.map((artifact) => ({ ...artifact, ref: redactEvidence(artifact.ref) })) })),
      reward,
      approval,
      createdAt: new Date().toISOString()
    };
    const feedback: HarnessExecutionFeedbackPackage = { ...material, digest: digest(material) };
    fs.writeFileSync(target, `${JSON.stringify(feedback, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    return feedback;
  }

  list(scope?: { tenantId?: string; workspaceId?: string }): LifecycleRun[] {
    return fs.readdirSync(this.runsDir).filter((file) => file.endsWith(".json")).sort().map((file) => JSON.parse(fs.readFileSync(path.join(this.runsDir, file), "utf8")) as LifecycleRun)
      .filter((run) => !scope?.tenantId || run.tenantId === scope.tenantId)
      .filter((run) => !scope?.workspaceId || run.workspaceId === scope.workspaceId);
  }

  read(id: string): LifecycleRun | undefined {
    const file = path.join(this.runsDir, `${safeId(id)}.json`);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) as LifecycleRun : undefined;
  }

  private require(id: string): LifecycleRun {
    const run = this.read(id);
    if (!run) throw new Error(`LIFECYCLE_RUN_NOT_FOUND: ${id}`);
    return run;
  }

  private assertRunIntegrity(run: LifecycleRun): void {
    if (run.revision.digest !== digest(run.revision.definition)) throw new Error("LIFECYCLE_REVISION_DRIFT");
    if (run.inputBinding.lifecycleDigest !== run.revision.digest) throw new Error("LIFECYCLE_INPUT_BINDING_LIFECYCLE_DRIFT");
    const inputDigest = digest({ lifecycleDigest: run.inputBinding.lifecycleDigest, values: run.inputBinding.values, unresolved: run.inputBinding.unresolved });
    if (inputDigest !== run.inputBinding.digest) throw new Error("LIFECYCLE_INPUT_BINDING_DRIFT");
    if (run.binding) {
      if (run.binding.actionRegistryDigest !== this.registry.digest) throw new Error("LIFECYCLE_ACTION_REGISTRY_DRIFT");
      if (run.binding.lifecycleRef.digest !== run.revision.digest || run.binding.inputBindingDigest !== run.inputBinding.digest) throw new Error("LIFECYCLE_BINDING_DRIFT");
      const material = {
        lifecycleRef: run.binding.lifecycleRef,
        inputBindingDigest: run.binding.inputBindingDigest,
        actionRegistryDigest: run.binding.actionRegistryDigest,
        policyDigest: run.binding.policyDigest,
        harnessBundle: run.binding.harnessBundle,
        executor: run.binding.executor,
        runtimeDigest: run.binding.runtimeDigest,
        evidenceDigest: run.binding.evidenceDigest,
        tenantId: run.binding.tenantId,
        workspaceId: run.binding.workspaceId,
        projectId: run.binding.projectId,
        goalId: run.binding.goalId,
        targetId: run.binding.targetId
      };
      if (digest(material) !== run.binding.digest) throw new Error("LIFECYCLE_BINDING_DIGEST_DRIFT");
    }
  }

  private write(run: LifecycleRun): LifecycleRun {
    const target = path.join(this.runsDir, `${safeId(run.id)}.json`);
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(run, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, target);
    return run;
  }
}

function buildBinding(run: LifecycleRun, input: Pick<LifecycleStartRequest, "policyDigest" | "runtimeDigest" | "evidenceDigest" | "harnessBundle" | "executor">): LifecycleBinding {
  validateDigest("policyDigest", input.policyDigest);
  validateDigest("runtimeDigest", input.runtimeDigest);
  validateDigest("harnessBundle.digest", input.harnessBundle.digest);
  if (input.evidenceDigest) validateDigest("evidenceDigest", input.evidenceDigest);
  const createdAt = new Date().toISOString();
  const material = {
    lifecycleRef: { ...run.revision.ref, digest: run.revision.digest },
    inputBindingDigest: run.inputBinding.digest,
    actionRegistryDigest: new LifecycleActionRegistry().digest,
    policyDigest: input.policyDigest,
    harnessBundle: input.harnessBundle,
    executor: normalizeExecutor(input.executor),
    runtimeDigest: input.runtimeDigest,
    evidenceDigest: input.evidenceDigest ?? digest([]),
    tenantId: run.tenantId,
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    goalId: run.goalId,
    targetId: run.targetId
  };
  return { schema: LIFECYCLE_BINDING_SCHEMA, ...material, digest: digest(material), createdAt };
}

function normalizeExecutor(value: LifecycleStartRequest["executor"]): LifecycleBinding["executor"] {
  if (!value || !String(value.host ?? "").trim() || !String(value.provider ?? "").trim() || !String(value.model ?? "").trim() || !Array.isArray(value.capabilities)) throw new Error("LIFECYCLE_EXECUTOR_BINDING_REQUIRED");
  const material = { host: String(value.host), provider: String(value.provider), model: String(value.model), capabilities: [...new Set(value.capabilities.map(String))].sort() };
  const computed = digest(material);
  if (value.digest && value.digest !== computed) throw new Error("LIFECYCLE_EXECUTOR_DIGEST_MISMATCH");
  return { ...material, digest: computed };
}

function skippedAttempt(stageId: string, action: string): LifecycleStageAttempt {
  const now = new Date().toISOString();
  return { stageId, attempt: 1, status: "SKIPPED", action, evidence: ["condition=false-or-disabled"], startedAt: now, finishedAt: now };
}

function failedAttempt(stageId: string, action: string, reason: string, now: string): LifecycleStageAttempt {
  return { stageId, attempt: 1, status: "FAILED", action, evidence: [reason], startedAt: now, finishedAt: now };
}

function safeId(value: string): string {
  const normalized = String(value).trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) throw new Error("LIFECYCLE_ID_INVALID");
  return normalized;
}

function validateDigest(name: string, value: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`LIFECYCLE_DIGEST_INVALID: ${name}`);
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function redactEvidence(value: string): string {
  return String(value).replace(/(token|password|secret|api[-_]?key)=\S+/gi, "$1=<redacted>");
}
