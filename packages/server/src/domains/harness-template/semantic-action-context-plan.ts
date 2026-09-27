import {canonicalJson, digestObject, isRecord} from "./utils.js";
import {requireSemantic} from "./semantic-catalog-contract.js";
import {freeze} from "./semantic-catalog-io.js";
import type {SemanticContextSelection} from "./semantic-context-slice.js";

export interface SemanticActionContextPlan {
  schema: "evopilot-semantic-action-context-plan/v1";
  lifecycleDigest: string;
  actions: {stageId: string; action: string; actionVersion: string; selection: SemanticContextSelection}[];
}
/** Server-owned declaration. Never infer a selector from action or Skill prose.
 * This preparation plan carries no decision or execution authority.
 */
export function normalizeSemanticActionContextPlan(value: SemanticActionContextPlan) {
  requireSemantic(isRecord(value) && Object.keys(value).sort().join() === "actions,lifecycleDigest,schema" &&
    value.schema === "evopilot-semantic-action-context-plan/v1" && /^sha256:[a-f0-9]{64}$/.test(value.lifecycleDigest), "INVALID");
  requireSemantic(Array.isArray(value.actions) && value.actions.length > 0 && value.actions.length <= 64 &&
    Buffer.byteLength(canonicalJson(value)) <= 65536, "MATERIAL_LIMIT");
  const id = (item: unknown) => typeof item === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(item);
  const actions = value.actions.map(item => {
    requireSemantic(isRecord(item) && Object.keys(item).sort().join() === "action,actionVersion,selection,stageId" &&
      [item.stageId, item.action, item.actionVersion].every(id), "INVALID");
    const selection = item.selection;
    requireSemantic(isRecord(selection) && Object.keys(selection).sort().join() === "conceptIds,reasoning,relations,schema" &&
      selection.schema === "evopilot-semantic-context-selection/v1" && selection.reasoning === "EXPLICIT_ONLY", "UNSUPPORTED");
    requireSemantic(Array.isArray(selection.conceptIds) && selection.conceptIds.length <= 128 && selection.conceptIds.every(id) &&
      new Set(selection.conceptIds).size === selection.conceptIds.length, "MATERIAL_LIMIT");
    requireSemantic(Array.isArray(selection.relations) && selection.relations.length <= 256, "EDGE_LIMIT");
    for (const edge of selection.relations) requireSemantic(isRecord(edge) && Object.keys(edge).sort().join() === "objectConceptId,relationType,subjectConceptId" &&
      Object.values(edge).every(id), "INVALID");
    requireSemantic(new Set(selection.relations.map(canonicalJson)).size === selection.relations.length, "IDENTITY_CONFLICT");
    return {...item, selection: {...selection, conceptIds: [...selection.conceptIds].sort(), relations: [...selection.relations].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)))}};
  }).sort((a, b) => a.stageId.localeCompare(b.stageId));
  requireSemantic(new Set(actions.map(item => item.stageId)).size === actions.length, "IDENTITY_CONFLICT");
  const plan = {schema: value.schema, lifecycleDigest: value.lifecycleDigest, actions};
  return freeze({...plan, planDigest: digestObject(plan)});
}

export function selectPlannedSemanticContext(plan: ReturnType<typeof normalizeSemanticActionContextPlan>, pending: {
  lifecycle: {digest: string}; stageId: string; action: string; actionVersion: string;
}) {
  requireSemantic(plan.lifecycleDigest === pending.lifecycle.digest, "DRIFT");
  const selected = plan.actions.filter(item => item.stageId === pending.stageId && item.action === pending.action && item.actionVersion === pending.actionVersion);
  requireSemantic(selected.length === 1, "UNAVAILABLE");
  return selected[0].selection;
}
