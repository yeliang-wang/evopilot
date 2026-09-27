import path from "node:path";
import type {GlobalGoal} from "../model.js";
import {GoalRecordStore} from "../storage/goal-record-store.js";
import {digestObject} from "../domains/harness-template/utils.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";

type Owner = NonNullable<GlobalGoal["semanticExecutionOwners"]>[number];
type Scope = {tenantId: string; workspaceId: string; projectId: string};
/** A durable fail-closed handoff, never a completion grant. It is written before
 * the immutable plan. A failed plan write leaves ownership in place; exact retry
 * can finish preparation, but legacy Goal mutation must not reclaim the Goal.
 * Goal and plan files are deliberately not represented as one transaction.
 */
export function createSemanticGoalOwnership(dataRoot: string) {
  const store = new GoalRecordStore(path.join(dataRoot, "goals"));
  function read(goalId: string, scope: Scope) {
    store.assertSettled(goalId);
    const goal = store.read(goalId);
    store.assertSettled(goalId);
    requireSemantic(goal && Object.entries(scope).every(([key, value]) => goal[key as keyof GlobalGoal] === value), "PERMISSION_DENIED");
    return goal;
  }
  function assert(goalId: string, scope: Scope, owner: Owner) {
    const goal = read(goalId, scope);
    requireSemantic(Array.isArray(goal.semanticExecutionOwners) &&
      goal.semanticExecutionOwners.some(value => digestObject(value) === digestObject(owner)), "DRIFT");
  }
  return Object.freeze({assert, claim(goalId: string, scope: Scope, owner: Owner) {
    const goal = read(goalId, scope);
    requireSemantic(owner.schema === "evopilot-semantic-goal-owner/v1" &&
      [owner.targetId, owner.runId].every(v => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v)) &&
      /^sha256:[a-f0-9]{64}$/.test(owner.harnessBindingDigest), "INVALID");
    const owners = goal.semanticExecutionOwners ?? [];
    requireSemantic(Array.isArray(owners) && owners.length <= 4096, "MATERIAL_INVALID");
    const prior = owners.find(value => value.targetId === owner.targetId);
    if (prior) {requireSemantic(digestObject(prior) === digestObject(owner), "IDENTITY_CONFLICT"); return assert(goalId, scope, owner);}
    const target = goal.plan.targets.find(value => value.id === owner.targetId);
    requireSemantic(["APPROVED", "RUNNING"].includes(goal.status) && goal.plan.status === "APPROVED" &&
      target && ["READY", "RUNNING"].includes(target.status) && !target.loopId && !goal.finalReport && owners.length < 4096, "PERMISSION_DENIED");
    store.write({...goal, semanticExecutionOwners: [...owners, structuredClone(owner)]}, goal);
  }});
}
