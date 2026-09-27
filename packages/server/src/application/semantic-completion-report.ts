import path from "node:path";
import type {SemanticExecutionIdentity} from "./semantic-execution-binding.js";
import type {createSemanticGoalCompletionService} from "./semantic-goal-completion.js";
import {GoalRecordStore} from "../storage/goal-record-store.js";
import {semanticProjectAccess, semanticRequestId, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";

const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
/** Read-only completion projection, separate from legacy phase/GA final reports.
 * Status and progress derive from verified persisted receipts, never raw DONE
 * flags. Returns identifiers/digests only, not Goal prose, facts or raw history.
 */
export function createSemanticCompletionReport(dataRoot: string, completion: Pick<ReturnType<typeof createSemanticGoalCompletionService>, "receipt" | "goalReceipt">) {
  const goals = new GoalRecordStore(path.join(dataRoot, "goals"));
  return Object.freeze({read(input: {identity: SemanticExecutionIdentity; runId: string},
    access: {currentAccess: () => SemanticDiscoveryAccess; signal?: AbortSignal}) {
    requireSemantic(isRecord(input) && Object.keys(input).sort().join() === "identity,runId" && isRecord(input.identity) &&
      Object.keys(input.identity).sort().join() === "goalId,harnessBindingDigest,projectId,targetId" &&
      [input.runId, input.identity.projectId, input.identity.goalId, input.identity.targetId].every(semanticRequestId) &&
      /^sha256:[a-f0-9]{64}$/.test(input.identity.harnessBindingDigest), "INVALID");
    input = structuredClone(input);
    function subject() {
      requireSemantic(!access.signal?.aborted, "CANCELLED");
      const s = semanticProjectAccess(input.identity.projectId, access.currentAccess());
      requireSemantic(["operator", "admin"].includes(s.principal.role), "PERMISSION_DENIED"); return s;
    }
    const original = subject(); goals.assertSettled(input.identity.goalId);
    const goal = goals.read(input.identity.goalId);
    requireSemantic(goal && Object.entries(original.scope).every(([k, v]) => goal[k as keyof typeof goal] === v), "PERMISSION_DENIED");
    const owners = goal.semanticExecutionOwners;
    requireSemantic(Array.isArray(owners) && owners.length > 0 && owners.length <= 64 &&
      Array.isArray(goal.plan.targets) && goal.plan.targets.length > 0 && goal.plan.targets.length <= 64 &&
      new Set(owners.map(o => o.targetId)).size === owners.length &&
      new Set(goal.plan.targets.map(t => t.id)).size === goal.plan.targets.length &&
      owners.every(o => goal.plan.targets.some(t => t.id === o.targetId)), "MATERIAL_LIMIT");
    requireSemantic(owners.some(o => o.targetId === input.identity.targetId && o.runId === input.runId &&
      o.harnessBindingDigest === input.identity.harnessBindingDigest), "PERMISSION_DENIED");
    const records = goal.semanticTargetCompletions ?? [];
    requireSemantic(Array.isArray(records) && records.length <= 64 && records.every(r => owners.some(o => o.targetId === r.identity.targetId)), "MATERIAL_INVALID");
    const verified = new Map<string, string>();
    for (const owner of owners) {
      requireSemantic(owner.schema === "evopilot-semantic-goal-owner/v1", "MATERIAL_INVALID");
      const r = completion.receipt({identity: {...input.identity, targetId: owner.targetId, harnessBindingDigest: owner.harnessBindingDigest}, runId: owner.runId}, access);
      if (r) verified.set(owner.targetId, r.receiptDigest);
    }
    const targets = goal.plan.targets.map(t => ({targetId: t.id, required: t.required,
      status: verified.has(t.id) ? "VERIFIED_DONE" : "NOT_VERIFIED", ...(verified.has(t.id) ? {receiptDigest: verified.get(t.id)!} : {})}));
    const required = targets.filter(t => t.required), done = required.filter(t => t.status === "VERIFIED_DONE").length;
    requireSemantic(required.length > 0, "MATERIAL_INVALID");
    const final = goal.semanticFinalGoalCompletion;
    const finalReceipt = final ? completion.goalReceipt({identity:final.identity,runId:final.runId},access) : undefined;
    requireSemantic(!final || finalReceipt, "DRIFT");
    const phaseClosurePending = !finalReceipt && (goal.terminalMaturity !== undefined || goal.plan.phaseTargets.length > 0 || goal.plan.targets.some(t => t.phase || t.loopId));
    const completed = goal.status === "COMPLETED" && done === required.length && !phaseClosurePending;
    // A completed flag without corresponding receipts is a conflict, not proof.
    requireSemantic(goal.status !== "COMPLETED" || completed, "DRIFT");
    const blockers = [...(done !== required.length ? ["REQUIRED_TARGET_COMPLETION_PENDING"] : []),
      ...(phaseClosurePending ? ["PHASE_OR_GA_CLOSURE_PENDING"] : []),
      ...(done === required.length && !phaseClosurePending && !completed ? ["GOAL_COMPLETION_RECORD_REQUIRED"] : [])];
    const body = {schema: "evopilot-semantic-goal-completion-report/v1", scope: original.scope, goalId: goal.id,
      status: completed ? "COMPLETED" : done ? "PARTIAL" : "PENDING", targets,
      progress: {requiredTargets: required.length, verifiedRequiredTargets: done,
        targetPercent: Math.floor(done * 100 / required.length), goalCompleted: completed}, blockers,
      release: {status: "NOT_EVALUATED", authorized: false, published: false},
      goalRevisionDigest: digestObject(goal), authority: {mayCompleteGoal: false, mayCompleteTarget: false, mayDispatch: false, mayPublish: false}};
    requireSemantic(same(subject(), original), "DRIFT"); goals.assertSettled(goal.id);
    requireSemantic(same(goals.read(goal.id), goal), "DRIFT");
    return freeze({...body, reportDigest: digestObject(body)});
  }});
}
