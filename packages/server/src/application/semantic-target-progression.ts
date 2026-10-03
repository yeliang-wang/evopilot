import type {GlobalGoal} from "../model.js";
import type {SemanticTargetCompletion} from "./semantic-goal-completion.js";
import type {SemanticPhaseCompletion} from "./semantic-phase-completion.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject} from "../domains/harness-template/utils.js";

/** Derive readiness inside the completion owner's existing Goal CAS. The owner
 * verifies retained receipts, including the receipt staged by this transaction.
 * This neither starts execution nor supplies completion or release authority. */
export function advanceSemanticTargets(goal: GlobalGoal, owners: {
  targetReceipt: (receipt: SemanticTargetCompletion) => SemanticTargetCompletion | undefined;
  phaseReceipt: (receipt: SemanticPhaseCompletion) => SemanticPhaseCompletion | undefined;
}, completedAt: string): GlobalGoal {
  if (goal.status !== "RUNNING" || goal.plan.status !== "APPROVED" || goal.finalReport ||
    !goal.semanticExecutionOwners?.length) return goal;
  const targets = goal.plan.targets, phases = goal.plan.phaseTargets;
  requireSemantic(new Set(targets.map(t => t.id)).size === targets.length, "MATERIAL_INVALID");
  const verifiedTargets = new Set<string>(), verifiedPhases = new Set<string>();
  let changed = false;
  const nextTargets = targets.map(target => {
    if (target.status !== "PENDING" || target.loopId || target.blocker ||
      !["advance-target", "start-target"].includes(target.nextAction) ||
      goal.semanticExecutionOwners!.some(owner => owner.targetId === target.id)) return target;
    requireSemantic(target.goalId === goal.id && target.projectId === goal.projectId &&
      target.releaseTargetId === goal.releaseTargetId, "SCOPE_INVALID");
    const dependencies = target.dependencyIds.map(id => targets.find(t => t.id === id));
    if (dependencies.some(t => !t || t.status !== "DONE")) return target;
    const records = dependencies.map(t => goal.semanticTargetCompletions?.find(r => r.identity.targetId === t!.id));
    if (records.some(r => !r)) return target;
    let predecessor: SemanticPhaseCompletion | undefined;
    if (target.phase !== undefined) {
      const candidates = phases.filter(p => p.phase === target.phase && p.goalTargetIds.includes(target.id));
      requireSemantic(candidates.length === 1 && candidates[0].goalId === goal.id, "MATERIAL_INVALID");
      const phase = candidates[0];
      if (!["PENDING", "RUNNING"].includes(phase.status) || phase.decision.status !== "PENDING") return target;
      if (phase.dependencyPhase !== undefined) {
        const prior = phases.filter(p => p.phase === phase.dependencyPhase);
        requireSemantic(prior.length === 1, "MATERIAL_INVALID");
        if (prior[0].status !== "PASSED" || prior[0].decision.status !== "GO") return target;
        predecessor = goal.semanticPhaseCompletions?.find(r => r.phaseTargetId === prior[0].id);
        if (!predecessor) return target;
      }
    }
    for (const receipt of records) if (!verifiedTargets.has(receipt!.identity.targetId)) {
      const checked = owners.targetReceipt(receipt!);
      requireSemantic(checked && digestObject(checked) === digestObject(receipt), "TRUST_REQUIRED");
      verifiedTargets.add(receipt!.identity.targetId);
    }
    if (predecessor && !verifiedPhases.has(predecessor.phaseTargetId)) {
      const checked = owners.phaseReceipt(predecessor);
      requireSemantic(checked && digestObject(checked) === digestObject(predecessor), "TRUST_REQUIRED");
      verifiedPhases.add(predecessor.phaseTargetId);
    }
    changed = true;
    return {...target, status: "READY" as const, nextAction: "start-target" as const, updatedAt: completedAt};
  });
  return changed ? {...goal, plan: {...goal.plan, targets: nextTargets}} : goal;
}
