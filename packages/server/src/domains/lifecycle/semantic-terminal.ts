import type {LifecycleRun, LifecycleDecisionRecord} from "./types.js";
import type {LifecycleActionRegistry} from "./registry.js";
import {conditionMatches, interpolateLifecycleValue} from "./core.js";
import {digestObject} from "../harness-template/utils.js";

export type SemanticTerminalScope = {tenantId: string; workspaceId: string; projectId: string; goalId: string; targetId: string};
function check(value: unknown): asserts value {if (!value) throw new Error("LIFECYCLE_SEMANTIC_TERMINAL_INVALID");}
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;

/** Validate a complete historical execution, not current permission or business
 * truth. The caller must first verify persisted run/binding/proof integrity.
 * A SUCCEEDED flag, successful subset, forged skip or old stage receipt cannot
 * substitute for the entire declared graph. This function never mutates state. */
export function verifySemanticTerminalRun(run: LifecycleRun, scope: SemanticTerminalScope, registry: LifecycleActionRegistry) {
  check(run.status === "SUCCEEDED" && !run.currentStageId && !run.pendingExecution && !run.pendingDecisionAuthority);
  check(Object.entries(scope).every(([k, v]) => run[k as keyof LifecycleRun] === v));
  const binding = run.binding;
  check(binding && binding.harnessExecutionBindingDigest && Object.entries(scope).every(([k, v]) => binding[k as keyof typeof binding] === v));
  check(run.inputBinding.status === "READY_FOR_REVIEW" && run.inputBinding.unresolved.length === 0 && !run.inputBinding.nextQuestion);
  const approved = (value: LifecycleDecisionRecord | undefined, stageId: string, authority: string) => value &&
    value.decision === "APPROVED" && value.stageId === stageId && value.authority === authority && value.bindingDigest === binding.digest &&
    text(value.actor) && text(value.evidenceRef) && date(value.decidedAt);
  check(approved(run.planAuthorization, "$plan", "plan"));
  const stages = run.revision.definition.stages, proofs = run.semanticStageCompletions ?? [];
  check(stages.length > 0 && stages.length <= 4096 && new Set(stages.map(s => s.id)).size === stages.length && proofs.length > 0);
  check(run.stageAttempts.length <= 4096 && run.trajectory.length <= 4096);
  check(run.stageAttempts.every(a => stages.some(s => s.id === a.stageId)));
  check(proofs.every(p => stages.some(s => s.id === p.stageId)) && new Set(proofs.map(p => p.stageId)).size === proofs.length);
  const closed = new Map(run.stageAttempts.map((attempt, index) => [attempt.stageId, index])), externalStages = new Set<string>();
  const coverage = stages.map(stage => {
    const attempts = run.stageAttempts.map((value, index) => ({value, index})).filter(a => a.value.stageId === stage.id);
    check(attempts.length > 0 && attempts.length <= (stage.retry?.maxAttempts ?? 1));
    const action = registry.resolve(stage.action.uses); check(action);
    check(attempts.every(({value: a}, i) => a.attempt === i + 1 && date(a.startedAt) && date(a.finishedAt) &&
      Date.parse(a.finishedAt!) >= Date.parse(a.startedAt) && (a.action === stage.action.uses || a.action === action.id + "@" + action.version)));
    const last = attempts[attempts.length - 1], enabled = stage.decision.mode !== "DISABLED" && conditionMatches(stage.when, run.inputBinding.values);
    check((stage.needs ?? []).every(id => closed.has(id) && closed.get(id)! < attempts[0].index));
    const proof = proofs.find(p => p.stageId === stage.id);
    if (!enabled) {
      check(attempts.length === 1 && last.value.status === "SKIPPED" && !last.value.receiptDigest && !last.value.externalRequestId && !proof &&
        digestObject(last.value.evidence) === digestObject(["condition=false-or-disabled"]) && !run.trajectory.some(t => t.stageId === stage.id));
    } else {
      check(last.value.status === "SUCCEEDED" && attempts.slice(0, -1).every(a => a.value.status === "FAILED"));
      if (stage.decision.mode === "HUMAN") check(approved(run.decisions.filter(d => d.stageId === stage.id).at(-1), stage.id, stage.decision.authority ?? "stage"));
      if (action.execution === "INTERNAL") {
        const result = {stageId: stage.id, action: stage.action.uses, bindingDigest: binding.digest,
          inputs: interpolateLifecycleValue(stage.action.with ?? {}, run.inputBinding)};
        check(!proof && !last.value.externalRequestId && last.value.receiptDigest === digestObject(result) &&
          digestObject(last.value.evidence) === digestObject(["action=" + stage.action.uses, "binding=" + binding.digest, "result=" + digestObject(result)]) &&
          !run.trajectory.some(t => t.stageId === stage.id));
      } else {
        externalStages.add(stage.id); check(proof);
        const requestId = "execution-" + run.id + "-" + stage.id + "-" + last.value.attempt;
        const actionInputs = interpolateLifecycleValue(stage.action.with ?? {}, run.inputBinding) as Record<string, unknown>;
        const request = {schema: "evopilot-agent-execution-request/v1alpha1", id: requestId, idempotencyKey: requestId + ":" + binding.digest,
          runId: run.id, stageId: stage.id, action: action.id, actionVersion: action.version, bindingDigest: binding.digest, scope,
          lifecycle: {...run.revision.ref, digest: run.revision.digest},
          harness: {...binding.harnessBundle, harnessExecutionBindingDigest: binding.harnessExecutionBindingDigest},
          governance: {policyDigest: binding.policyDigest, providerDigest: binding.providerDigest, environmentDigest: binding.environmentDigest,
            authorityDigest: binding.authorityDigest, runtimeDigest: binding.runtimeDigest, evidenceDigest: binding.evidenceDigest},
          inputs: action.id === "evopilot.goal-loop" ? {...actionInputs, goalId: run.goalId, targetId: run.targetId, projectId: run.projectId} : actionInputs,
          capabilities: stage.capabilities ?? action.capabilities, executor: binding.executor};
        const trajectory = run.trajectory.filter(t => t.stageId === stage.id && t.status === "SUCCEEDED");
        check(proof.sourceRequestDigest === digestObject(request) && last.value.externalRequestId === requestId && trajectory.length === 1);
        const t = trajectory[0];
        check(t.runId === run.id && t.bindingDigest === binding.digest && t.requestDigest === proof.requestDigest &&
          t.receiptDigest === last.value.receiptDigest && t.host === binding.executor.host && t.provider === binding.executor.provider &&
          t.model === binding.executor.model && digestObject(t.capabilities) === digestObject(request.capabilities) &&
          t.effects.every(e => binding.executor.allowedEffects.includes(e)));
      }
    }
    return {stageId: stage.id, status: last.value.status, attempt: last.value.attempt, action: stage.action.uses,
      ...(proof ? {proofDigest: proof.proofDigest, sourceRequestDigest: proof.sourceRequestDigest, requestDigest: proof.requestDigest} : {})};
  });
  check(proofs.length === externalStages.size && run.trajectory.every(t => externalStages.has(t.stageId)));
  check(digestObject(run.trajectory.filter(t => t.status === "SUCCEEDED").map(t => t.stageId)) === digestObject(proofs.map(p => p.stageId)));
  // Persisted semantic proofs are append-only in actual successful-stage order.
  check(proofs.every((p, i) => i === 0 || closed.get(proofs[i - 1].stageId)! < closed.get(p.stageId)!));
  return {schema: "evopilot-semantic-terminal-run/v1" as const, scope, runId: run.id, runDigest: digestObject(run),
    lifecycleDigest: run.revision.digest, bindingDigest: binding.digest, harnessBindingDigest: binding.harnessExecutionBindingDigest,
    stages: coverage, stageProofDigests: proofs.map(p => p.proofDigest), status: "HISTORICAL_TERMINAL_VERIFIED" as const,
    authority: {mayCompleteGoal: false, mayCompleteTarget: false, mayDispatch: false, mayPublish: false}};
}
