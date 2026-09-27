import type {LlmProfileRecord} from "../model.js";
import {SemanticRuntimeSourceStore} from "../storage/semantic-runtime-source.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {semanticProjectAccess, type SemanticPrincipal} from "./project-semantic-discovery.js";
import type {SemanticExecutionIdentity, SemanticExecutionState} from "./semantic-execution-binding.js";

export interface SemanticRuntimeSourcePins {
  schema: "evopilot-semantic-runtime-source-pins/v1";
  projectRevisionDigest: string; goalDigest: string; targetDigest: string; planDigest: string; approvalDigest: string; llmSelectionDigest: string;
}
type Doc = Record<string, any>;
const doc = (value: unknown): Doc => {requireSemantic(isRecord(value), "MATERIAL_INVALID"); return value;};
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
// Bootstrap emits bounded server-owned IDs. URI references remain compatible
// metadata; neither form resolves a credential or proves credential readiness.
export const semanticLlmSecretReference = (value: unknown): value is string => typeof value === "string" &&
  /^(?:[A-Za-z0-9][A-Za-z0-9._-]{0,127}|secret:\/\/[A-Za-z0-9._/-]+)$/.test(value);
export function semanticTargetDefinition(target: Doc) {
  requireSemantic(target.schema === "evopilot-goal-target/v1" && text(target.id) && text(target.goalId) && text(target.projectId) &&
    text(target.releaseTargetId) && text(target.title) && typeof target.description === "string" && text(target.layer) &&
    typeof target.required === "boolean" && strings(target.dependencyIds) && strings(target.acceptanceCriteria), "MATERIAL_INVALID");
  // Mutable progress, timestamps and accumulated evidence are NOT definition.
  const {status, nextAction, loopId, evidence, blocker, createdAt, updatedAt, ...definition} = target;
  return definition;
}

export function semanticPhaseDefinition(phase: Doc) {
  // Decisions, progress and timestamps can evolve; package obligations cannot.
  const {status, decision, createdAt, updatedAt, ...definition} = phase;
  return definition;
}

/** Current project/Goal/Target/LLM metadata, not provider readiness or execution
 * approval. Reads exact stored selections; never resolves credentials, follows
 * new defaults, instantiates a client or accepts a Host-supplied replacement.
 */
export function createSemanticRuntimeSourceReader(dataRoot: string) {
  const store = new SemanticRuntimeSourceStore(dataRoot);
  function read(identity: SemanticExecutionIdentity, principal: SemanticPrincipal, historical = false) {
    const project = doc(store.read("projects", identity.projectId));
    const subject = semanticProjectAccess(identity.projectId, {principal, project: project as any});
    requireSemantic(["operator", "admin"].includes(subject.principal.role), "PERMISSION_DENIED");
    const goal = doc(store.read("goals", identity.goalId));
    requireSemantic(goal.schema === "evopilot-global-goal/v1" && goal.id === identity.goalId && goal.projectId === identity.projectId &&
      goal.tenantId === subject.scope.tenantId && goal.workspaceId === subject.scope.workspaceId, "PERMISSION_DENIED");
    requireSemantic(["APPROVED", "RUNNING", ...(historical ? ["COMPLETED"] : [])].includes(goal.status) && text(goal.objective) && text(goal.releaseTargetId), "PERMISSION_DENIED");
    const plan = doc(goal.plan), confirmation = doc(plan.confirmation);
    requireSemantic(plan.schema === "evopilot-goal-plan/v1" && plan.status === "APPROVED" && plan.editablePlan?.status === "APPROVED" &&
      text(plan.approvedBy) && date(plan.approvedAt) && confirmation.schema === "evopilot-goal-plan-approval-confirmation/v1" &&
      confirmation.actor === plan.approvedBy && text(confirmation.confirmedBy) && text(confirmation.confirmation) && date(confirmation.confirmedAt), "PERMISSION_DENIED");
    requireSemantic(Array.isArray(plan.targets) && plan.targets.length > 0 && plan.targets.length <= 4096, "MATERIAL_LIMIT");
    const definitions = plan.targets.map((item: unknown) => semanticTargetDefinition(doc(item)));
    requireSemantic(new Set(definitions.map((item: Doc) => item.id)).size === definitions.length && definitions.every((item: Doc) =>
      item.goalId === identity.goalId && item.projectId === identity.projectId && item.releaseTargetId === goal.releaseTargetId), "SCOPE_INVALID");
    const targets = plan.targets.filter((item: Doc) => item.id === identity.targetId);
    requireSemantic(targets.length === 1, "UNAVAILABLE");
    const target = targets[0]; requireSemantic(["READY", "RUNNING", ...(historical ? ["DONE"] : [])].includes(target.status), "PERMISSION_DENIED");
    requireSemantic(target.dependencyIds.every((id: string) => plan.targets.some((other: Doc) => other.id === id && other.status === "DONE")), "PERMISSION_DENIED");
    const selection = doc(goal.llm);
    requireSemantic(selection.schema === "evopilot-loop-llm-selection/v1" && selection.configured === true &&
      ["loop-override", "project-default", "workspace-default"].includes(selection.source) && text(selection.profileId), "UNAVAILABLE");
    const profile = doc(store.read("llm-profiles", selection.profileId));
    requireSemantic(profile.schema === "evopilot-llm-profile/v1" && profile.id === selection.profileId && profile.status === "ACTIVE" &&
      profile.tenantId === subject.scope.tenantId && profile.workspaceId === subject.scope.workspaceId &&
      (profile.scope === "workspace" || (profile.scope === "user" && selection.source === "loop-override" && profile.ownerActor === principal.id)), "PERMISSION_DENIED");
    requireSemantic(text(profile.providerName) && text(profile.modelName) && text(profile.baseUrl) &&
      semanticLlmSecretReference(profile.apiKeyRef), "MATERIAL_INVALID");
    requireSemantic(selection.provider === profile.providerName && selection.model === profile.modelName &&
      selection.baseUrl === profile.baseUrl && selection.apiKeyRef === profile.apiKeyRef, "DRIFT");
    for (const [kind, id, original] of [["projects", identity.projectId, project], ["goals", identity.goalId, goal], ["llm-profiles", selection.profileId, profile]] as const)
      requireSemantic(digestObject(store.read(kind, id)) === digestObject(original), "DRIFT");
    const {targets: ignoredTargets, phaseTargets, editablePlan, planner, generatedAt, ...planMeaning} = plan;
    requireSemantic(Array.isArray(phaseTargets) && phaseTargets.length <= 64, "MATERIAL_LIMIT");
    const phaseDefinitions = phaseTargets.map((phase: unknown) => semanticPhaseDefinition(doc(phase)));
    const pins: SemanticRuntimeSourcePins = {schema: "evopilot-semantic-runtime-source-pins/v1",
      projectRevisionDigest: subject.projectRevisionDigest,
      goalDigest: digestObject({scope: subject.scope, goalId: identity.goalId, objective: goal.objective, releaseTargetId: goal.releaseTargetId,
        terminalMaturity: goal.terminalMaturity, maturityStandardSetId: goal.maturityStandardSetId}),
      targetDigest: digestObject(semanticTargetDefinition(target)), planDigest: digestObject({...planMeaning, targets: definitions, phaseTargets: phaseDefinitions}),
      approvalDigest: digestObject({approvedBy: plan.approvedBy, approvedAt: plan.approvedAt, confirmation}), llmSelectionDigest: digestObject(selection)};
    return freeze({subject, objective: goal.objective as string, pins,
      acceptanceCriteria: (target.acceptanceCriteria as string[]).map((text, index) =>
        ({text, criterionDigest: digestObject({targetDigest: pins.targetDigest, index, text})})),
      llmProfile: profile as LlmProfileRecord,
      credentialReadinessVerified: false as const});
  }
  return Object.freeze({read: (identity: SemanticExecutionIdentity, principal: SemanticPrincipal) => read(identity, principal),
    // Read-only definition pins for receipt verification; never an execution source.
    readHistorical: (identity: SemanticExecutionIdentity, principal: SemanticPrincipal) => read(identity, principal, true)});
}

/** Composes only the implemented source owners. Host qualification, permissions,
 * Harness and environment owners remain explicit required dependencies; this
 * adapter never fills them with historical binding digests or permissive defaults.
 */
export function withSemanticRuntimeSources(dataRoot: string, currentExecution: (identity: SemanticExecutionIdentity) => SemanticExecutionState,
  currentPrincipal: () => SemanticPrincipal) {
  const reader = createSemanticRuntimeSourceReader(dataRoot);
  return (identity: SemanticExecutionIdentity): SemanticExecutionState => {
    const source = reader.read(identity, currentPrincipal()), state = structuredClone(currentExecution(identity));
    requireSemantic(digestObject(source) === digestObject(reader.read(identity, currentPrincipal())), "DRIFT");
    requireSemantic(state.goalTarget.objective === source.objective && state.goalTarget.projectId === source.subject.scope.projectId &&
      state.goalTarget.goalId === identity.goalId && state.goalTarget.targetId === identity.targetId &&
      digestObject(state.permissions.scope) === digestObject(source.subject.scope) && state.permissions.principalId === source.subject.principal.id, "DRIFT");
    return {...state, llmProfile: source.llmProfile, runtimeSourcePins: source.pins};
  };
}
