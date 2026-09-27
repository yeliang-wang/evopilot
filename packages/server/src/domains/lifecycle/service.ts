import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { RecoveryContext, RecoveryDecision } from "@evopilot/core";
import { FileLifecycleCatalog } from "./catalog.js";
import { conditionMatches, interpolateLifecycleValue, resolveLifecycleInputs } from "./core.js";
import { GovernedLifecycleRegistry, type LifecycleRegistryScope } from "./governed-registry.js";
import { LifecycleActionRegistry, stableJson } from "./registry.js";
import {assertNoUnintegratedSemanticExecution} from "./semantic-execution-guard.js";
import {SemanticBindingStore} from "../../storage/semantic-binding-store.js";
import {LifecycleRunStore} from "../../storage/lifecycle-run-store.js";
import {consumeSemanticStageGrant} from "./semantic-stage-grant.js";
import {verifySemanticTerminalRun, type SemanticTerminalScope} from "./semantic-terminal.js";
import {digestObject, isRecord} from "../harness-template/utils.js";
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

export interface LifecycleGovernanceHooks {
  verifyBoundary(input: {
    bindingDigest: string;
    checkpoint: "start" | "resume" | "retry" | "loop-iteration";
    projectId: string;
    goalId?: string;
    targetId?: string;
    lifecycleDigest: string;
    policyDigest: string;
    providerDigest?: string;
    environmentDigest?: string;
    authorityDigest?: string;
    runtimeDigest: string;
    evidenceDigest: string;
    harnessBundle: { id: string; version: string; digest: string; catalogId?: string };
    hostDigest: string;
    tenantId: string;
    workspaceId: string;
  }): { bindingDigest: string; evidence: string[] };
  decideRecovery(input: RecoveryContext & { tenantId: string; workspaceId: string }): RecoveryDecision;
  suspendRule?(rule: { id: string; revision: number; digest: string }, evidenceRef: string, scope: { tenantId: string; workspaceId: string }): void;
}

export class LifecycleService {
  readonly catalog: FileLifecycleCatalog;
  readonly governedRegistry: GovernedLifecycleRegistry;
  readonly registry: LifecycleActionRegistry;
  private readonly runsDir: string;
  private readonly feedbackDir: string;
  private readonly semanticBindings: SemanticBindingStore;
  private readonly runStore: LifecycleRunStore;
  private governanceHooks?: LifecycleGovernanceHooks;

  constructor(dataRoot: string, catalogRoots: string[]) {
    this.semanticBindings = new SemanticBindingStore(dataRoot);
    this.registry = new LifecycleActionRegistry();
    this.catalog = new FileLifecycleCatalog(catalogRoots, this.registry);
    this.governedRegistry = new GovernedLifecycleRegistry(dataRoot, this.catalog, this.registry);
    this.runsDir = path.join(dataRoot, "lifecycle-runs");
    this.feedbackDir = path.join(dataRoot, "lifecycle-feedback");
    fs.mkdirSync(this.runsDir, { recursive: true });
    fs.mkdirSync(this.feedbackDir, { recursive: true });
    this.runStore = new LifecycleRunStore(this.runsDir);
  }

  configureGovernanceHooks(hooks: LifecycleGovernanceHooks): void {
    this.governanceHooks = hooks;
  }

  resolveInputs(lifecycleId: string, lifecycleVersion: string | undefined, sources: LifecycleInputSources, scope: LifecycleRegistryScope) {
    return resolveLifecycleInputs(this.governedRegistry.resolveActive(lifecycleId, lifecycleVersion, scope), sources);
  }

  start(input: LifecycleStartRequest): LifecycleRun {
    assertNoUnintegratedSemanticExecution(input);
    const scope = { tenantId: input.tenantId, workspaceId: input.workspaceId };
    const revision = input.lifecycleRevision
      ? this.governedRegistry.resolveExact(input.lifecycleRevision.ref.id, input.lifecycleRevision.ref.version, input.lifecycleRevision.digest, scope)
      : this.governedRegistry.resolveActive(input.lifecycleId, input.lifecycleVersion, scope);
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
    let run = inputBinding.status === "READY_FOR_REVIEW"
      ? { ...base, binding: buildBinding(base, input) }
      : base;
    if ((run.goalId || run.targetId) && this.governanceHooks && !run.binding?.harnessExecutionBindingDigest) throw new Error("HARNESS_EXECUTION_BINDING_REQUIRED");
    if (run.binding?.harnessExecutionBindingDigest) run = this.withBoundaryEvidence(run, "start");
    const written = this.write(run);
    if (written.binding) this.governedRegistry.recordUsage({
      id: `run-${written.id}`,
      lifecycleId: revision.ref.id,
      version: revision.ref.version,
      revisionDigest: revision.digest,
      usageType: "RUN",
      objectId: written.id,
      bindingDigest: written.binding.digest
    }, scope);
    return written;
  }

  answer(id: string, answers: Record<string, unknown>, sources: Omit<LifecycleInputSources, "answers"> = {}): LifecycleRun {
    const run = this.require(id);
    this.assertRunIntegrity(run);
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
            providerDigest: run.binding.providerDigest,
            environmentDigest: run.binding.environmentDigest,
            authorityDigest: run.binding.authorityDigest,
            runtimeDigest: run.binding.runtimeDigest,
            evidenceDigest: run.binding.evidenceDigest,
            harnessExecutionBindingDigest: run.binding.harnessExecutionBindingDigest,
            harnessBundle: run.binding.harnessBundle,
            executor: run.binding.executor
          })
        }
      : { ...updatedBase, binding: undefined };
    return this.write(updated, run);
  }

  finalizeBinding(id: string, input: Pick<LifecycleStartRequest, "policyDigest" | "providerDigest" | "environmentDigest" | "authorityDigest" | "runtimeDigest" | "evidenceDigest" | "harnessBundle" | "executor" | "harnessExecutionBindingDigest">): LifecycleRun {
    assertNoUnintegratedSemanticExecution(input);
    const run = this.require(id);
    this.assertRunIntegrity(run);
    if (run.inputBinding.status !== "READY_FOR_REVIEW") throw new Error("LIFECYCLE_INPUTS_INCOMPLETE");
    let updated: LifecycleRun = { ...run, binding: buildBinding(run, input), status: "WAITING_AUTHORIZATION", updatedAt: new Date().toISOString() };
    if ((updated.goalId || updated.targetId) && this.governanceHooks && !updated.binding?.harnessExecutionBindingDigest) throw new Error("HARNESS_EXECUTION_BINDING_REQUIRED");
    if (updated.binding?.harnessExecutionBindingDigest) updated = this.withBoundaryEvidence(updated, "start");
    return this.write(updated, run);
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
    return this.write({ ...run, planAuthorization: record, status: decision === "APPROVED" ? "RUNNING" : "CANCELLED", updatedAt: record.decidedAt }, run);
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
    return this.write({ ...run, decisions: [...run.decisions, record], stageAttempts: attempts, pendingDecisionAuthority: undefined, status: decision === "APPROVED" ? "RUNNING" : "FAILED", updatedAt: record.decidedAt }, run);
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
    }, run);
  }

  advance(id: string): LifecycleRun {
    let run = this.require(id);
    this.assertRunIntegrity(run);
    if (run.status === "WAITING_INPUT" || run.status === "WAITING_BINDING_REVIEW" || run.status === "WAITING_AUTHORIZATION" || run.status === "WAITING_DECISION" || run.status === "WAITING_EXTERNAL_SIGNAL") return run;
    if (run.status !== "RUNNING") return run;
    if (run.planAuthorization?.decision !== "APPROVED" || run.planAuthorization.bindingDigest !== run.binding?.digest) throw new Error("LIFECYCLE_PLAN_AUTHORIZATION_REQUIRED");
    const completed = new Set(run.stageAttempts.filter((attempt) => ["SUCCEEDED", "SKIPPED"].includes(attempt.status)).map((attempt) => attempt.stageId));
    const stage = run.revision.definition.stages.find((candidate) => !completed.has(candidate.id) && (candidate.needs ?? []).every((dependency) => completed.has(dependency)));
    if (!stage) {
      const unfinished = run.revision.definition.stages.some((candidate) => !completed.has(candidate.id));
      return this.write({ ...run, status: unfinished ? "FAILED" : "SUCCEEDED", currentStageId: undefined, updatedAt: new Date().toISOString() }, run);
    }
    if (!conditionMatches(stage.when, run.inputBinding.values) || stage.decision.mode === "DISABLED") {
      return this.write({ ...run, status: "RUNNING", currentStageId: stage.id, stageAttempts: [...run.stageAttempts, skippedAttempt(stage.id, stage.action.uses)], updatedAt: new Date().toISOString() }, run);
    }
    const binding = run.binding;
    if (!binding) throw new Error("LIFECYCLE_BINDING_REQUIRED");
    const priorAttempts = run.stageAttempts.filter((attempt) => attempt.stageId === stage.id);
    const checkpoints: Array<"retry" | "loop-iteration"> = [];
    if (priorAttempts.some((attempt) => attempt.status === "FAILED")) checkpoints.push("retry");
    if (stage.action.uses.replace(/@[^@]+$/, "") === "evopilot.goal-loop") checkpoints.push("loop-iteration");
    let guardedRun = run;
    if (binding.harnessExecutionBindingDigest) {
      for (const checkpoint of checkpoints) guardedRun = this.withBoundaryEvidence(guardedRun, checkpoint);
    }
    if (guardedRun !== run) {
      run = this.write(guardedRun, run);
    }
    const existingDecision = run.decisions.find((decision) => decision.stageId === stage.id && decision.decision === "APPROVED" && decision.bindingDigest === binding.digest);
    if (stage.decision.mode === "HUMAN" && !existingDecision) {
      return this.write({ ...run, status: "WAITING_DECISION", currentStageId: stage.id, updatedAt: new Date().toISOString() }, run);
    }
    const action = this.registry.resolve(stage.action.uses)!;
    if (action.execution === "EXTERNAL_ADAPTER") {
      if (!binding.executor.allowedEffects.includes(action.effect)) throw new Error(`LIFECYCLE_EXECUTOR_EFFECT_NOT_ALLOWED: ${action.effect}`);
      const missingCapabilities = (stage.capabilities ?? action.capabilities).filter((capability) => !binding.executor.capabilities.includes(capability));
      if (missingCapabilities.length > 0) throw new Error(`LIFECYCLE_EXECUTOR_CAPABILITY_MISMATCH: ${missingCapabilities.join(", ")}`);
      if (priorAttempts.length >= (stage.retry?.maxAttempts ?? 1)) {
        return this.write({ ...run, status: "FAILED", currentStageId: stage.id, updatedAt: new Date().toISOString() }, run);
      }
      const actionInputs = interpolateLifecycleValue(stage.action.with ?? {}, run.inputBinding) as Record<string, unknown>;
      const requestId = `execution-${run.id}-${stage.id}-${priorAttempts.length + 1}`;
      const pendingMaterial = {
        schema: "evopilot-agent-execution-request/v1alpha1" as const,
        id: requestId,
        idempotencyKey: `${requestId}:${binding.digest}`,
        runId: run.id,
        stageId: stage.id,
        action: action.id,
        actionVersion: action.version,
        bindingDigest: binding.digest,
        scope: { tenantId: run.tenantId, workspaceId: run.workspaceId, projectId: run.projectId, ...(run.goalId ? { goalId: run.goalId } : {}), ...(run.targetId ? { targetId: run.targetId } : {}) },
        lifecycle: { ...run.revision.ref, digest: run.revision.digest },
        harness: { ...binding.harnessBundle, ...(binding.harnessExecutionBindingDigest ? { harnessExecutionBindingDigest: binding.harnessExecutionBindingDigest } : {}) },
        governance: { policyDigest: binding.policyDigest, providerDigest: binding.providerDigest, environmentDigest: binding.environmentDigest, authorityDigest: binding.authorityDigest, runtimeDigest: binding.runtimeDigest, evidenceDigest: binding.evidenceDigest },
        inputs: action.id === "evopilot.goal-loop"
          ? { ...actionInputs, goalId: run.goalId ?? actionInputs.goalId, targetId: run.targetId ?? actionInputs.targetId, projectId: run.projectId }
          : actionInputs,
        capabilities: stage.capabilities ?? action.capabilities,
        executor: binding.executor
      };
      const pendingExecution: LifecycleAgentExecutionRequest = { ...pendingMaterial, requestDigest: digest(pendingMaterial) };
      return this.write({ ...run, status: "WAITING_EXTERNAL_SIGNAL", currentStageId: stage.id, pendingExecution, updatedAt: new Date().toISOString() }, run);
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
    return this.write({ ...run, status: "RUNNING", currentStageId: stage.id, stageAttempts: [...run.stageAttempts, attempt], updatedAt: now }, run);
  }

  advanceUntilBoundary(id: string): LifecycleRun {
    let run = this.require(id);
    this.assertRunIntegrity(run);
    if (run.binding?.harnessExecutionBindingDigest) {
      run = this.write(this.withBoundaryEvidence(run, "resume"), run);
    }
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
    // A request owned by the semantic path cannot be completed by omitting its
    // semantic fields from a legacy result. A dedicated completion owner must
    // validate business + Harness evidence before it can advance this run.
    if (run.goalId && run.targetId && run.binding?.harnessExecutionBindingDigest) {
      const scope = {tenantId: run.tenantId, workspaceId: run.workspaceId, projectId: run.projectId};
      const identity = {projectId: run.projectId, goalId: run.goalId, targetId: run.targetId,
        harnessBindingDigest: run.binding.harnessExecutionBindingDigest};
      const executionKey = {scope, goalId: run.goalId, targetId: run.targetId, harnessBindingDigest: run.binding.harnessExecutionBindingDigest};
      const semanticProofs = run.semanticStageCompletions ?? [];
      const executionStage = run.pendingExecution ? {runId: run.id, requestDigest: run.pendingExecution.requestDigest,
        ...(semanticProofs.length ? {predecessorProofDigest: semanticProofs[semanticProofs.length - 1].proofDigest} : {})} : undefined;
      if (semanticProofs.length || this.semanticBindings.read("execution-plans", {scope, identity}) !== undefined ||
        (executionStage && this.semanticBindings.read("executions", {...executionKey, executionStage}) !== undefined) ||
        this.semanticBindings.read("executions", {scope, goalId: run.goalId, targetId: run.targetId,
          harnessBindingDigest: run.binding.harnessExecutionBindingDigest}) !== undefined)
        throw new Error("LIFECYCLE_SEMANTIC_COMPLETION_REQUIRED");
    }
    const { requestId, status, receiptDigest } = result;
    validateDigest("receiptDigest", receiptDigest);
    for (const artifact of result.artifacts ?? []) validateDigest("artifact.digest", artifact.digest);
    const replay = run.stageAttempts.find((attempt) => attempt.externalRequestId === requestId);
    if (replay) {
      const prior = run.trajectory.find((entry) => entry.requestId === requestId);
      if (replay.receiptDigest === receiptDigest
        && prior?.requestDigest === result.requestDigest
        && prior.bindingDigest === result.bindingDigest
        && prior.idempotencyKey === result.idempotencyKey
        && stableJson(prior.effects) === stableJson([...result.effects])) return run;
      throw new Error("LIFECYCLE_EXTERNAL_RECEIPT_CONFLICT");
    }
    if (run.status !== "WAITING_EXTERNAL_SIGNAL" || run.pendingExecution?.id !== requestId) throw new Error("LIFECYCLE_EXTERNAL_SIGNAL_NOT_PENDING");
    if (result.requestDigest !== run.pendingExecution.requestDigest || result.bindingDigest !== run.pendingExecution.bindingDigest || result.idempotencyKey !== run.pendingExecution.idempotencyKey) throw new Error("LIFECYCLE_EXTERNAL_RESULT_BINDING_MISMATCH");
    if (!Array.isArray(result.effects) || result.effects.some((effect) => !run.pendingExecution?.executor.allowedEffects.includes(effect))) throw new Error("LIFECYCLE_EXTERNAL_RESULT_EFFECT_MISMATCH");
    const now = new Date().toISOString();
    const evidence = (result.evidence ?? []).map(redactEvidence);
    let attempt: LifecycleStageAttempt = {
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
      requestDigest: result.requestDigest,
      idempotencyKey: result.idempotencyKey,
      runId: run.id,
      stageId: run.pendingExecution.stageId,
      bindingDigest: run.pendingExecution.bindingDigest,
      host: run.pendingExecution.executor.host,
      provider: run.pendingExecution.executor.provider,
      model: run.pendingExecution.executor.model,
      capabilities: [...run.pendingExecution.capabilities],
      status,
      receiptDigest,
      effects: [...result.effects],
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
    let nextStatus: LifecycleRun["status"] = status === "SUCCEEDED" ? "RUNNING" : status === "UNCERTAIN" ? "WAITING_DECISION" : "FAILED";
    let pendingDecisionAuthority: LifecycleRun["pendingDecisionAuthority"] = status === "UNCERTAIN" ? "recovery" : undefined;
    let recoveryHistory = run.recoveryHistory ?? [];
    if (status !== "SUCCEEDED") {
      const previousRecovery = recoveryHistory.at(-1);
      const previousRule = previousRecovery?.stageId === attempt.stageId && ["AUTO_REPAIR", "AUTO_RETRY"].includes(previousRecovery.action)
        ? previousRecovery.ruleRef
        : undefined;
      if (previousRule && this.governanceHooks?.suspendRule) this.governanceHooks.suspendRule(previousRule, `lifecycle://${run.id}/${requestId}/failed`, { tenantId: run.tenantId, workspaceId: run.workspaceId });
      const failure = result.failure ?? { class: status === "UNCERTAIN" ? "UNCERTAIN_MUTATION" as const : "UNKNOWN" as const, signature: `${run.pendingExecution.action}:${status.toLowerCase()}`, identicalInputs: true, reversible: false, externalEffect: true };
      const decision = this.governanceHooks?.decideRecovery({
        failureClass: failure.class,
        failureSignature: failure.signature,
        bindingDigest: run.binding?.harnessExecutionBindingDigest ?? run.pendingExecution.bindingDigest,
        attempt: attempt.attempt,
        maxAttempts: run.revision.definition.stages.find((item) => item.id === attempt.stageId)?.retry?.maxAttempts ?? 1,
        mutationReceipt: failure.mutationReceipt,
        identicalInputs: failure.identicalInputs,
        reversible: failure.reversible,
        externalEffect: failure.externalEffect,
        projectId: run.projectId,
        lifecycleId: run.revision.ref.id,
        actionId: run.pendingExecution.action,
        hostId: run.pendingExecution.executor.host,
        tenantId: run.tenantId,
        workspaceId: run.workspaceId
      });
      if (decision) {
        recoveryHistory = [...recoveryHistory, { requestId, stageId: attempt.stageId, failureClass: failure.class, failureSignature: failure.signature, action: decision.action, humanRequired: decision.humanRequired, decisionDigest: decision.digest, ruleRef: decision.ruleRef, proposalRef: decision.proposalRef, recordedAt: now }];
        if (["AUTO_REPAIR", "AUTO_RETRY", "RESUME_FROM_RECEIPT"].includes(decision.action)) nextStatus = "RUNNING";
        if (decision.action === "RESUME_FROM_RECEIPT" && failure.mutationReceipt) {
          attempt = {
            ...attempt,
            status: "SUCCEEDED",
            receiptDigest: failure.mutationReceipt,
            evidence: [...attempt.evidence, `reconciledMutationReceipt=${failure.mutationReceipt}`, `recoveryDecision=${decision.digest}`]
          };
        }
        if (["PROPOSE_AUTOMATION_RULE", "HUMAN_DECISION"].includes(decision.action)) { nextStatus = "WAITING_DECISION"; pendingDecisionAuthority = "recovery"; }
      }
    }
    return this.write({
      ...run,
      status: nextStatus,
      stageAttempts: [...run.stageAttempts, attempt],
      trajectory: [...run.trajectory, trajectory],
      recoveryHistory,
      pendingExecution: undefined,
      pendingDecisionAuthority,
      updatedAt: now
    }, run);
  }

  /** Runtime-internal stage commit. JSON, booleans and historical reports cannot
   * act as grants. The validated proof, attempt and trajectory share one CAS write.
   * Does not advance another stage, complete Goal/Target or grant release rights.
   */
  commitSemanticStage(token: unknown): LifecycleRun {
    const {pending, proof, result, expectedRunDigest} = consumeSemanticStageGrant(token);
    const run = this.require(proof.runId); this.assertRunIntegrity(run);
    if (digestObject(run) !== expectedRunDigest || digest(this.readPendingExecution(run.id, pending.requestDigest, proof.scope)) !== digest(pending) ||
      Object.entries(proof.scope).some(([key, value]) => run[key as keyof LifecycleRun] !== value)) throw new Error("LIFECYCLE_RUN_REVISION_CONFLICT");
    if (result.bindingDigest !== pending.bindingDigest || result.effects.some(effect => !pending.executor.allowedEffects.includes(effect)) ||
      run.semanticStageCompletions?.some(item => item.sourceRequestDigest === pending.requestDigest)) throw new Error("LIFECYCLE_SEMANTIC_GRANT_INVALID");
    const now = new Date().toISOString();
    const attempt: LifecycleStageAttempt = {stageId: pending.stageId, attempt: run.stageAttempts.filter(item => item.stageId === pending.stageId).length + 1,
      status: "SUCCEEDED", action: `${pending.action}@${pending.actionVersion}`, receiptDigest: result.receiptDigest,
      externalRequestId: pending.id, evidence: [`semantic-completion://${proof.proofDigest.slice(7)}`], startedAt: now, finishedAt: now};
    const trajectory: LifecycleRun["trajectory"][number] = {schema: "evopilot-agent-trajectory-entry/v1alpha1", requestId: result.requestId,
      requestDigest: result.requestDigest, idempotencyKey: result.idempotencyKey, runId: run.id, stageId: pending.stageId,
      bindingDigest: pending.bindingDigest, host: pending.executor.host, provider: pending.executor.provider, model: pending.executor.model,
      capabilities: [...pending.capabilities], status: "SUCCEEDED", receiptDigest: result.receiptDigest, effects: [...result.effects],
      cost: {amount: result.cost?.amount ?? 0, currency: result.cost?.currency ?? "USD", inputTokens: result.cost?.inputTokens, outputTokens: result.cost?.outputTokens},
      artifacts: (result.artifacts ?? []).map(item => ({ref: redactEvidence(item.ref), digest: item.digest})), evidence: attempt.evidence, recordedAt: now};
    const next: LifecycleRun = {...run, status: "RUNNING", pendingExecution: undefined, pendingDecisionAuthority: undefined,
      stageAttempts: [...run.stageAttempts, attempt], trajectory: [...run.trajectory, trajectory],
      semanticStageCompletions: [...run.semanticStageCompletions ?? [], proof], updatedAt: now};
    this.assertRunIntegrity(next);
    return this.write(next, run);
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
    return this.runStore.read(safeId(id));
  }

  /** Historical semantic receipt readback validates stored proof sources without
   * requiring a still-pending stage or granting any current execution authority. */
  readVerified(id: string): LifecycleRun | undefined {
    const run = this.read(id);
    if (run) this.assertRunIntegrity(run);
    return run;
  }

  /** Public receipt reads must not hide an uncertain persisted mutation. */
  readSettledVerified(id: string): LifecycleRun | undefined {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) throw new Error("LIFECYCLE_RUN_ID_INVALID");
    this.runStore.assertSettled(id);
    const run = this.readVerified(id);
    this.runStore.assertSettled(id);
    if (digestObject(this.read(id) ?? null) !== digestObject(run ?? null)) throw new Error("LIFECYCLE_RUN_REVISION_CONFLICT");
    return run;
  }

  /** Internal, read-only terminal proof. Never substitutes for fresh Goal
   * completion policy, current material validation or a mutation grant. */
  readSemanticTerminal(id: string, scope: SemanticTerminalScope) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) throw new Error("LIFECYCLE_RUN_ID_INVALID");
    this.runStore.assertSettled(id);
    const run = this.require(id); this.assertRunIntegrity(run);
    const proof = verifySemanticTerminalRun(run, scope, this.registry);
    this.runStore.assertSettled(id);
    if (digestObject(this.readVerified(id)) !== proof.runDigest) throw new Error("LIFECYCLE_RUN_REVISION_CONFLICT");
    return structuredClone({run, proof: {...proof, terminalDigest: digestObject(proof)}});
  }

  private require(id: string): LifecycleRun {
    const run = this.read(id);
    if (!run) throw new Error(`LIFECYCLE_RUN_NOT_FOUND: ${id}`);
    return run;
  }

  /** Read-only owner adapter for context preparation. No dispatch or state advance.
   * Reconstruct the pending request from the persisted, integrity-checked run;
   * a self-consistent request hash alone cannot substitute for its current stage.
   */
  readPendingExecution(id: string, requestDigest: string, scope: {tenantId: string; workspaceId: string; projectId: string; goalId: string; targetId: string}): LifecycleAgentExecutionRequest {
    const run = this.require(id);
    if (Object.entries(scope).some(([key, value]) => run[key as keyof LifecycleRun] !== value)) throw new Error("LIFECYCLE_PENDING_SCOPE_MISMATCH");
    this.assertRunIntegrity(run);
    const binding = run.binding, pending = run.pendingExecution;
    if (run.status !== "WAITING_EXTERNAL_SIGNAL" || !binding || !pending) throw new Error("LIFECYCLE_EXTERNAL_SIGNAL_NOT_PENDING");
    if (Object.entries(scope).some(([key, value]) => binding[key as keyof LifecycleBinding] !== value)) throw new Error("LIFECYCLE_PENDING_SCOPE_MISMATCH");
    if (run.planAuthorization?.decision !== "APPROVED" || run.planAuthorization.bindingDigest !== binding.digest) throw new Error("LIFECYCLE_AUTHORIZATION_REQUIRED");
    if (run.planAuthorization.stageId !== "$plan" || run.planAuthorization.authority !== "plan" ||
      !run.planAuthorization.actor?.trim() || !run.planAuthorization.evidenceRef?.trim() || !Number.isFinite(Date.parse(run.planAuthorization.decidedAt))) throw new Error("LIFECYCLE_AUTHORIZATION_REQUIRED");
    const completed = new Set(run.stageAttempts.filter(item => ["SUCCEEDED", "SKIPPED"].includes(item.status)).map(item => item.stageId));
    const stage = run.revision.definition.stages.find(item => !completed.has(item.id) && (item.needs ?? []).every(dependency => completed.has(dependency)));
    const action = stage && this.registry.resolve(stage.action.uses);
    if (!stage || stage.id !== run.currentStageId || !action || action.execution !== "EXTERNAL_ADAPTER" || stage.decision.mode === "DISABLED" || !conditionMatches(stage.when, run.inputBinding.values)) throw new Error("LIFECYCLE_PENDING_STAGE_MISMATCH");
    if (stage.decision.mode === "HUMAN" && !run.decisions.some(item => item.stageId === stage.id && item.decision === "APPROVED" && item.bindingDigest === binding.digest)) throw new Error("LIFECYCLE_AUTHORIZATION_REQUIRED");
    const attempts = run.stageAttempts.filter(item => item.stageId === stage.id);
    if (attempts.some(item => item.status === "SUCCEEDED") || attempts.length >= (stage.retry?.maxAttempts ?? 1)) throw new Error("LIFECYCLE_PENDING_STAGE_MISMATCH");
    const capabilities = stage.capabilities ?? action.capabilities;
    if (!binding.executor.allowedEffects.includes(action.effect) || capabilities.some(capability => !binding.executor.capabilities.includes(capability))) throw new Error("LIFECYCLE_EXECUTOR_CAPABILITY_MISMATCH");
    const actionInputs = interpolateLifecycleValue(stage.action.with ?? {}, run.inputBinding) as Record<string, unknown>;
    const requestId = `execution-${run.id}-${stage.id}-${attempts.length + 1}`;
    const expected = {
      schema: "evopilot-agent-execution-request/v1alpha1" as const, id: requestId, idempotencyKey: `${requestId}:${binding.digest}`,
      runId: run.id, stageId: stage.id, action: action.id, actionVersion: action.version, bindingDigest: binding.digest,
      scope, lifecycle: {...run.revision.ref, digest: run.revision.digest},
      harness: {...binding.harnessBundle, ...(binding.harnessExecutionBindingDigest ? {harnessExecutionBindingDigest: binding.harnessExecutionBindingDigest} : {})},
      governance: {policyDigest: binding.policyDigest, providerDigest: binding.providerDigest, environmentDigest: binding.environmentDigest,
        authorityDigest: binding.authorityDigest, runtimeDigest: binding.runtimeDigest, evidenceDigest: binding.evidenceDigest},
      inputs: action.id === "evopilot.goal-loop" ? {...actionInputs, goalId: run.goalId ?? actionInputs.goalId, targetId: run.targetId ?? actionInputs.targetId, projectId: run.projectId} : actionInputs,
      capabilities, executor: binding.executor
    };
    const expectedDigest = digest(expected);
    if (requestDigest !== expectedDigest || digest(pending) !== digest({...expected, requestDigest: expectedDigest})) throw new Error("LIFECYCLE_PENDING_DIGEST_MISMATCH");
    return structuredClone(pending);
  }

  readPendingObligations(id: string, requestDigest: string, scope: Parameters<LifecycleService["readPendingExecution"]>[2]) {
    const before = this.readPendingExecution(id, requestDigest, scope), run = this.require(id);
    if (Object.entries(scope).some(([key, value]) => run[key as keyof LifecycleRun] !== value)) throw new Error("LIFECYCLE_PENDING_SCOPE_MISMATCH");
    this.assertRunIntegrity(run);
    const obligations = structuredClone(run.revision.definition.obligations ?? {});
    if (run.revision.digest !== before.lifecycle.digest || digest(before) !== digest(this.readPendingExecution(id, requestDigest, scope))) throw new Error("LIFECYCLE_PENDING_DIGEST_MISMATCH");
    return obligations;
  }

  /** Exact persisted revision for the current pending request, without Registry
   * bootstrap, active-version selection, registration or any lifecycle write. */
  readPendingRevision(id: string, requestDigest: string, scope: Parameters<LifecycleService["readPendingExecution"]>[2]) {
    const before = this.readPendingExecution(id, requestDigest, scope), run = this.require(id);
    this.assertRunIntegrity(run);
    const revision = structuredClone(run.revision);
    if (revision.digest !== before.lifecycle.digest || digest(before) !== digest(this.readPendingExecution(id, requestDigest, scope))) throw new Error("LIFECYCLE_PENDING_DIGEST_MISMATCH");
    return revision;
  }

  private assertRunIntegrity(run: LifecycleRun): void {
    assertNoUnintegratedSemanticExecution(run);
    assertNoUnintegratedSemanticExecution(run.binding);
    assertNoUnintegratedSemanticExecution(run.pendingExecution);
    assertNoUnintegratedSemanticExecution(run.pendingExecution?.governance);
    const proofs = run.semanticStageCompletions ?? [];
    if (!Array.isArray(proofs) || proofs.length > 4096 || new Set(proofs.map(p => p.sourceRequestDigest)).size !== proofs.length)
      throw new Error("LIFECYCLE_SEMANTIC_PROOF_INVALID");
    const scope = {tenantId: run.tenantId, workspaceId: run.workspaceId, projectId: run.projectId};
    for (const proof of proofs) {
      const {proofDigest, ...body} = proof;
      const key = {scope, runId: run.id, sourceRequestDigest: proof.sourceRequestDigest};
      const dispatch = this.semanticBindings.read("dispatch-results", key);
      const outcome = this.semanticBindings.read("outcomes", {...key, requestDigest: proof.requestDigest, outcomeDigest: proof.outcomeDigest});
      if (proof.schema !== "evopilot-semantic-stage-proof/v1" || digestObject(body) !== proofDigest || proof.runId !== run.id ||
        digestObject(proof.scope) !== digestObject({...scope, goalId: run.goalId, targetId: run.targetId}) ||
        !/^sha256:[a-f0-9]{64}$/.test(proof.completionPolicyDigest) || !isRecord(dispatch) || !isRecord(outcome) ||
        digestObject(dispatch.result) !== proof.resultDigest || dispatch.executionBindingDigest !== proof.executionBindingDigest ||
        outcome.outcomeDigest !== proof.outcomeDigest || outcome.resultDigest !== proof.resultDigest ||
        outcome.outcomeReviewDigest !== proof.outcomeReviewDigest || outcome.outcomeDecisionDigest !== proof.outcomeDecisionDigest ||
        outcome.requestDigest !== proof.requestDigest || dispatch.requestDigest !== proof.requestDigest ||
        outcome.status !== "DUAL_VALIDATED_NOT_COMPLETED" || !isRecord(outcome.collection) || outcome.collection.origin !== "INDEPENDENT" ||
        outcome.collection.receiptDigest !== proof.collectionReceiptDigest || !isRecord(outcome.processEvidence) || outcome.processEvidence.origin !== "NATIVE_PROCESS_RUNNER" ||
        !run.stageAttempts.some(a => a.stageId === proof.stageId && a.status === "SUCCEEDED" && a.evidence.includes(`semantic-completion://${proofDigest.slice(7)}`)) ||
        !run.trajectory.some(t => t.stageId === proof.stageId && t.requestDigest === proof.requestDigest && t.status === "SUCCEEDED"))
        throw new Error("LIFECYCLE_SEMANTIC_PROOF_INVALID");
    }
    if (run.stageAttempts.some(a => a.evidence.some(e => e.startsWith("semantic-completion://") && !proofs.some(p => e === `semantic-completion://${p.proofDigest.slice(7)}`))))
      throw new Error("LIFECYCLE_SEMANTIC_PROOF_INVALID");
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
        providerDigest: run.binding.providerDigest,
        environmentDigest: run.binding.environmentDigest,
        authorityDigest: run.binding.authorityDigest,
        harnessBundle: run.binding.harnessBundle,
        executor: run.binding.executor,
        runtimeDigest: run.binding.runtimeDigest,
        evidenceDigest: run.binding.evidenceDigest,
        harnessExecutionBindingDigest: run.binding.harnessExecutionBindingDigest,
        tenantId: run.binding.tenantId,
        workspaceId: run.binding.workspaceId,
        projectId: run.binding.projectId,
        goalId: run.binding.goalId,
        targetId: run.binding.targetId
      };
      if (digest(material) !== run.binding.digest) throw new Error("LIFECYCLE_BINDING_DIGEST_DRIFT");
    }
  }

  private write(run: LifecycleRun, previous?: LifecycleRun): LifecycleRun {return this.runStore.write(run, previous);}

  private withBoundaryEvidence(run: LifecycleRun, checkpoint: "start" | "resume" | "retry" | "loop-iteration"): LifecycleRun {
    if (!run.binding?.harnessExecutionBindingDigest) return run;
    if (!this.governanceHooks) throw new Error("HARNESS_EXECUTION_BINDING_GUARD_UNAVAILABLE");
    const result = this.governanceHooks.verifyBoundary({
      bindingDigest: run.binding.harnessExecutionBindingDigest,
      checkpoint,
      projectId: run.projectId,
      goalId: run.goalId,
      targetId: run.targetId,
      lifecycleDigest: run.binding.lifecycleRef.digest,
      policyDigest: run.binding.policyDigest,
      providerDigest: run.binding.providerDigest,
      environmentDigest: run.binding.environmentDigest,
      authorityDigest: run.binding.authorityDigest,
      runtimeDigest: run.binding.runtimeDigest,
      evidenceDigest: run.binding.evidenceDigest,
      harnessBundle: run.binding.harnessBundle,
      hostDigest: run.binding.executor.digest,
      tenantId: run.tenantId,
      workspaceId: run.workspaceId
    });
    return { ...run, boundaryEvidence: [...(run.boundaryEvidence ?? []), { checkpoint, bindingDigest: result.bindingDigest, evidence: result.evidence, checkedAt: new Date().toISOString() }] };
  }
}

function buildBinding(run: LifecycleRun, input: Pick<LifecycleStartRequest, "policyDigest" | "providerDigest" | "environmentDigest" | "authorityDigest" | "runtimeDigest" | "evidenceDigest" | "harnessBundle" | "executor" | "harnessExecutionBindingDigest">): LifecycleBinding {
  validateDigest("policyDigest", input.policyDigest);
  validateDigest("runtimeDigest", input.runtimeDigest);
  validateDigest("harnessBundle.digest", input.harnessBundle.digest);
  if (input.evidenceDigest) validateDigest("evidenceDigest", input.evidenceDigest);
  if (input.harnessExecutionBindingDigest) validateDigest("harnessExecutionBindingDigest", input.harnessExecutionBindingDigest);
  for (const [name, value] of Object.entries({ providerDigest: input.providerDigest, environmentDigest: input.environmentDigest, authorityDigest: input.authorityDigest })) if (value) validateDigest(name, value);
  const createdAt = new Date().toISOString();
  const executor = normalizeExecutor(input.executor);
  const requiredCredentialRefs = Object.values(run.inputBinding.values).filter((item) => item.sensitive).map((item) => String(item.value));
  const missingCredentialRefs = requiredCredentialRefs.filter((item) => !executor.credentialRefs.includes(item));
  if (missingCredentialRefs.length) throw new Error("LIFECYCLE_AGENT_RUNTIME_CREDENTIAL_BINDING_REQUIRED");
  const material = {
    lifecycleRef: { ...run.revision.ref, digest: run.revision.digest },
    inputBindingDigest: run.inputBinding.digest,
    actionRegistryDigest: new LifecycleActionRegistry().digest,
    policyDigest: input.policyDigest,
    providerDigest: input.providerDigest,
    environmentDigest: input.environmentDigest,
    authorityDigest: input.authorityDigest,
    harnessBundle: input.harnessBundle,
    executor,
    runtimeDigest: input.runtimeDigest,
    evidenceDigest: input.evidenceDigest ?? digest([]),
    harnessExecutionBindingDigest: input.harnessExecutionBindingDigest,
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
  if (!value.agentRuntime?.profileId?.trim() || !value.agentRuntime.profileVersion?.trim() || !value.agentRuntime.adapterId?.trim()) throw new Error("LIFECYCLE_AGENT_RUNTIME_PROFILE_REQUIRED");
  validateDigest("agentRuntime.profileDigest", value.agentRuntime.profileDigest);
  validateDigest("agentRuntime.qualificationDigest", value.agentRuntime.qualificationDigest);
  if (value.sandbox?.permissionMode !== "HOST_MANAGED_DENY_UNDECLARED" || !value.sandbox.workspaceRef?.trim()) throw new Error("LIFECYCLE_AGENT_RUNTIME_SANDBOX_REQUIRED");
  const credentialRefs = [...new Set((value.credentialRefs ?? []).map(String))].sort();
  if (credentialRefs.some((item) => !/^secret:\/\/[A-Za-z0-9._/-]+$/.test(item))) throw new Error("LIFECYCLE_AGENT_RUNTIME_SECRET_REF_REQUIRED");
  const material = {
    host: String(value.host),
    provider: String(value.provider),
    model: String(value.model),
    capabilities: [...new Set(value.capabilities.map(String))].sort(),
    agentRuntime: { ...value.agentRuntime },
    sandbox: { ...value.sandbox },
    allowedEffects: [...new Set((value.allowedEffects ?? []).map(String))].sort(),
    credentialRefs
  };
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
