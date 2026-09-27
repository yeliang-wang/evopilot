import type {GlobalGoal, GoalTarget, GoalSnapshot, GoalPlan} from "../model.js";

/** Fail-closed legacy projections while terminal semantic proof verification is
 * unavailable. Ownership is not a successful result, even when raw fields or an
 * unrelated Loop say DONE. No persisted state is changed by this projection. */
export function blockSemanticGoalTarget(target: GoalTarget): GoalTarget {
  return {...target, status: "BLOCKED", nextAction: "repair", blocker: "GOAL_SEMANTIC_COMPLETION_REQUIRED"};
}

export function semanticGoalSnapshot(goal: GlobalGoal, phases: (targets: GoalTarget[]) => GoalPlan["phaseTargets"]): GoalSnapshot {
  const targets = goal.plan.targets.map(blockSemanticGoalTarget);
  const guarded: GlobalGoal = {...goal, status: "BLOCKED", finalReport: undefined,
    plan: {...goal.plan, targets, phaseTargets: phases(targets)}};
  return {schema: "evopilot-goal-snapshot/v1", goal: guarded, status: "BLOCKED",
    progress: {totalTargets: targets.length, requiredTargets: targets.filter(t => t.required).length,
      completedTargets: 0, blockedTargets: targets.length, failedTargets: 0, percent: 0},
    phases: guarded.plan.phaseTargets, nextAction: "repair", blockers: ["GOAL_SEMANTIC_COMPLETION_REQUIRED"],
    evidence: ["semanticOwnership=guarded-not-completed"], updatedAt: new Date().toISOString()};
}
