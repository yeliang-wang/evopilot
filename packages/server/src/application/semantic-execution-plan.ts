import {canonicalDigest, type GoalTargetContext, type HarnessExecutionCurrentState} from "@evopilot/core";
import type {GovernedEvolutionService} from "../domains/governed-evolution/service.js";
import type {LifecycleService} from "../domains/lifecycle/service.js";
import {createSemanticCurrentExecutionReader} from "./semantic-current-execution.js";
import {createProjectSemanticBindingService} from "./project-semantic-binding.js";
import {semanticProjectAccess, semanticRequestId, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import type {SemanticExecutionIdentity} from "./semantic-execution-binding.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {normalizeSemanticActionContextPlan, selectPlannedSemanticContext, type SemanticActionContextPlan} from "../domains/harness-template/semantic-action-context-plan.js";
import {normalizeSemanticOutcomePlan, type SemanticOutcomePlan} from "../domains/harness-template/semantic-outcome-plan.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {createSemanticGoalOwnership} from "./semantic-goal-ownership.js";

type Selections = ReturnType<Parameters<typeof createSemanticCurrentExecutionReader>[1]["currentSelections"]>;
type Access = {currentAccess: () => SemanticDiscoveryAccess; signal?: AbortSignal};
type Declaration = {identity: SemanticExecutionIdentity; runId: string; requestDigest: string;
  goalTarget: GoalTargetContext; contextPlan: SemanticActionContextPlan; outcomePlan: SemanticOutcomePlan; selections: Selections};
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
const hash = (v: unknown) => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);

/** Runtime-owned immutable preparation, not an approval or an execution.
 * Only declarations and exact source selections are persisted. Current Harness,
 * permissions, qualification, LLM and pending Lifecycle are always re-read.
 * The public planning transport and domain mapping review are separate owners.
 */
export function createSemanticExecutionPlanService(
  configuration: Parameters<typeof createProjectSemanticBindingService>[0] & Parameters<typeof createSemanticCurrentExecutionReader>[0],
  owners: {governed: Pick<GovernedEvolutionService, "readBinding" | "assertLifecycleBoundary">;
    lifecycle: Pick<LifecycleService, "readPendingExecution" | "readVerified">;
    currentHarness: (identity: SemanticExecutionIdentity) => HarnessExecutionCurrentState; now?: () => number}
) {
  configuration = Object.freeze({...configuration, ...(configuration.limits ? {limits: Object.freeze({...configuration.limits})} : {}),
    ...(configuration.contextLimits ? {contextLimits: Object.freeze({...configuration.contextLimits})} : {})});
  const store = new SemanticBindingStore(configuration.dataRoot);
  const projects = createProjectSemanticBindingService(configuration);
  const goalOwnership = createSemanticGoalOwnership(configuration.dataRoot);
  const owner = (value: Declaration) => ({schema: "evopilot-semantic-goal-owner/v1" as const,
    targetId: value.identity.targetId, runId: value.runId, harnessBindingDigest: value.identity.harnessBindingDigest});
  function subject(identity: SemanticExecutionIdentity, access: Access) {
    requireSemantic(isRecord(identity) && Object.keys(identity).sort().join() === "goalId,harnessBindingDigest,projectId,targetId" &&
      [identity.projectId, identity.goalId, identity.targetId].every(semanticRequestId) && hash(identity.harnessBindingDigest), "INVALID");
    requireSemantic(!access.signal?.aborted, "CANCELLED");
    const current = semanticProjectAccess(identity.projectId, access.currentAccess());
    requireSemantic(["operator", "admin"].includes(current.principal.role), "PERMISSION_DENIED"); return current;
  }
  function key(identity: SemanticExecutionIdentity, access: Access) {return {scope: subject(identity, access).scope, identity};}
  function location(value: Declaration, access: Access): {kind: "execution-plans" | "execution-stage-plans";
    slot: ReturnType<typeof key> & {runId?: string; requestDigest?: string}; predecessorProofDigest?: string} {
    const slot = key(value.identity, access), root = store.read("execution-plans", slot);
    const run = owners.lifecycle.readVerified(value.runId); requireSemantic(run, "UNAVAILABLE");
    requireSemantic(Object.entries({...slot.scope, goalId: value.identity.goalId, targetId: value.identity.targetId}).every(([k, v]) => run[k as keyof typeof run] === v) &&
      run.binding?.harnessExecutionBindingDigest === value.identity.harnessBindingDigest, "PERMISSION_DENIED");
    const proofs = run.semanticStageCompletions ?? [];
    if (root === undefined) {
      requireSemantic(proofs.length === 0, "IDENTITY_CONFLICT");
      return {kind: "execution-plans" as const, slot};
    }
    const initial = saved(root);
    requireSemantic(same(initial.identity, value.identity) && same(initial.scope, slot.scope) && initial.declaration.runId === value.runId, "IDENTITY_CONFLICT");
    if (initial.declaration.requestDigest === value.requestDigest) return {kind: "execution-plans" as const, slot};
    requireSemantic(proofs.some(p => p.sourceRequestDigest === initial.declaration.requestDigest) && proofs.length > 0, "PERMISSION_DENIED");
    const predecessorProofDigest = proofs[proofs.length - 1].proofDigest;
    return {kind: "execution-stage-plans" as const, slot: {...slot, runId: value.runId, requestDigest: value.requestDigest}, predecessorProofDigest};
  }
  function selected(identity: SemanticExecutionIdentity, access: Access) {
    const slot = key(identity, access), initial = saved(store.read("execution-plans", slot));
    requireSemantic(same(initial.identity, identity) && same(initial.declaration.identity, identity) && same(initial.scope, slot.scope), "DRIFT");
    const run = owners.lifecycle.readVerified(initial.declaration.runId); requireSemantic(run?.pendingExecution, "UNAVAILABLE");
    const selection = location({...initial.declaration, requestDigest: run.pendingExecution.requestDigest}, access);
    const record = saved(store.read(selection.kind, selection.slot));
    requireSemantic(record.declaration.runId === run.id && record.declaration.requestDigest === run.pendingExecution.requestDigest &&
      same(record.identity, identity) && same(record.scope, slot.scope) && record.predecessorProofDigest === selection.predecessorProofDigest, "DRIFT");
    return {record, selection};
  }
  function declaration(value: Declaration): Declaration {
    requireSemantic(isRecord(value) && Object.keys(value).sort().join() === "contextPlan,goalTarget,identity,outcomePlan,requestDigest,runId,selections", "INVALID");
    requireSemantic(Buffer.byteLength(JSON.stringify(value)) <= 65536 && semanticRequestId(value.runId) && hash(value.requestDigest), "INVALID");
    const goal = value.goalTarget;
    requireSemantic(isRecord(goal) && Object.keys(goal).every(k => ["projectId", "goalId", "targetId", "objective", "taskClass", "domain", "requiredCapabilities", "labels"].includes(k)) &&
      [goal.projectId, goal.goalId, goal.targetId, goal.taskClass].every(semanticRequestId) && typeof goal.objective === "string" && goal.objective.trim().length > 0 &&
      Array.isArray(goal.requiredCapabilities) && goal.requiredCapabilities.length <= 128 && goal.requiredCapabilities.every(semanticRequestId) &&
      new Set(goal.requiredCapabilities).size === goal.requiredCapabilities.length, "INVALID");
    const {planDigest: _computed, ...contextPlan} = normalizeSemanticActionContextPlan(value.contextPlan);
    return structuredClone({...value, contextPlan, outcomePlan: normalizeSemanticOutcomePlan(value.outcomePlan)});
  }
  function current(value: Declaration, access: Access) {
    const original = subject(value.identity, access);
    const read = createSemanticCurrentExecutionReader(configuration, {currentAccess: access.currentAccess, now: owners.now,
      currentSelections: () => value.selections, currentPlan: identity => ({goalTarget: value.goalTarget,
        harness: owners.currentHarness(identity), contextPlan: value.contextPlan, outcomePlan: value.outcomePlan})});
    const state = read(value.identity), binding = owners.governed.readBinding(value.identity.harnessBindingDigest, original.scope);
    requireSemantic(binding && binding.digest === value.identity.harnessBindingDigest && canonicalDigest({...binding, digest: undefined}) === binding.digest, "DIGEST_MISMATCH");
    requireSemantic(canonicalDigest(value.goalTarget) === binding.goalTargetDigest, "DRIFT");
    const pending = owners.lifecycle.readPendingExecution(value.runId, value.requestDigest,
      {...original.scope, goalId: value.identity.goalId, targetId: value.identity.targetId});
    requireSemantic(pending.harness.harnessExecutionBindingDigest === binding.digest && pending.harness.digest === binding.bundleRef.digest &&
      pending.harness.catalogId === binding.catalogId && same(pending.lifecycle, binding.lifecycleRef) && pending.executor.digest === state.executor.digest, "DRIFT");
    requireSemantic(same(pending.governance, {policyDigest: state.harness.policyDigest, providerDigest: state.harness.providerDigest,
      environmentDigest: state.harness.environmentDigest, authorityDigest: state.harness.authorityDigest,
      runtimeDigest: state.harness.runtimeDigest, evidenceDigest: state.harness.evidenceDigest}), "DRIFT");
    const context = normalizeSemanticActionContextPlan(value.contextPlan); selectPlannedSemanticContext(context, pending);
    requireSemantic(value.outcomePlan.stageId === pending.stageId && value.outcomePlan.action === pending.action &&
      value.outcomePlan.actionVersion === pending.actionVersion && value.outcomePlan.bundleDigest === binding.bundleRef.digest, "DRIFT");
    const checked = owners.governed.assertLifecycleBoundary({bindingDigest: binding.digest, checkpoint: "resume", ...value.identity,
      lifecycleDigest: state.harness.lifecycleDigest, policyDigest: state.harness.policyDigest, providerDigest: state.harness.providerDigest,
      environmentDigest: state.harness.environmentDigest, authorityDigest: state.harness.authorityDigest, runtimeDigest: state.harness.runtimeDigest,
      evidenceDigest: state.harness.evidenceDigest, harnessBundle: {...binding.bundleRef, catalogId: binding.catalogId},
      hostDigest: state.executor.digest, currentState: state.harness}, original.scope);
    requireSemantic(checked.status === "VALID" && checked.closure === "LIVE_IMMUTABLE_CLOSURE", "DRIFT");
    requireSemantic(same(original, subject(value.identity, access)), "DRIFT");
    const root = store.read("execution-plans", key(value.identity, access));
    const selected = location(value, access);
    if (root !== undefined) {
      requireSemantic(same(saved(root).runtimeSourcePins, state.runtimeSourcePins), "DRIFT");
      goalOwnership.assert(value.identity.goalId, original.scope, owner(value));
    }
    const executionStage = {runId: value.runId, requestDigest: value.requestDigest,
      ...(selected.predecessorProofDigest ? {predecessorProofDigest: selected.predecessorProofDigest} : {})};
    return {state: {...state, executionStage}, pending, original};
  }
  function content(value: Declaration, access: Access, projectBindingDigest: string) {
    const snapshot = current(value, access);
    return {schema: "evopilot-semantic-execution-plan/v1", ...key(value.identity, access), declaration: value,
      ...(snapshot.state.executionStage.predecessorProofDigest ? {predecessorProofDigest: snapshot.state.executionStage.predecessorProofDigest} : {}),
      runtimeSourcePins: snapshot.state.runtimeSourcePins, principal: snapshot.original.principal, projectBindingDigest,
      status: "PREPARED_NOT_APPROVED", authority: {mayDispatch: false, mayCompleteGoal: false, mayApprove: false, mayPublish: false}};
  }
  type Plan = ReturnType<typeof content> & {planDigest: string};
  function saved(value: unknown): Plan {
    requireSemantic(value !== undefined, "UNAVAILABLE");
    requireSemantic(isRecord(value) && Object.keys(value).filter(k => k !== "predecessorProofDigest").sort().join() === "authority,declaration,identity,planDigest,principal,projectBindingDigest,runtimeSourcePins,schema,scope,status" && hash(value.projectBindingDigest) &&
      (value.predecessorProofDigest === undefined || hash(value.predecessorProofDigest)), "MATERIAL_INVALID");
    const {planDigest, ...body} = value; requireSemantic(hash(planDigest) && digestObject(body) === planDigest, "DIGEST_MISMATCH");
    requireSemantic(value.schema === "evopilot-semantic-execution-plan/v1" && value.status === "PREPARED_NOT_APPROVED" &&
      same(value.authority, {mayDispatch: false, mayCompleteGoal: false, mayApprove: false, mayPublish: false}), "MATERIAL_INVALID");
    declaration(value.declaration as Declaration); return value as Plan;
  }
  function inspect(identity: SemanticExecutionIdentity, access: Access) {
    const original = subject(identity, access), {record, selection} = selected(identity, access);
    requireSemantic(same(record.identity, identity) && same(record.declaration.identity, identity) && same(record.scope, original.scope), "DRIFT");
    const snapshot = current(record.declaration, access);
    requireSemantic(same(snapshot.state.runtimeSourcePins, record.runtimeSourcePins) && same(original, subject(identity, access)) &&
      same(record, store.read(selection.kind, selection.slot)) && record.predecessorProofDigest === snapshot.state.executionStage.predecessorProofDigest, "DRIFT");
    const root = saved(store.read("execution-plans", key(identity, access)));
    requireSemantic(record.projectBindingDigest === root.projectBindingDigest, "DRIFT");
    return {record: freeze(record), state: freeze({...snapshot.state, projectBindingDigest: record.projectBindingDigest})};
  }
  return Object.freeze({
    // Read-only authoring uses the existing run's original project pins. A
    // migrated project default must not silently change a successor stage.
    planningProject(identity: SemanticExecutionIdentity, access: Access) {
      const slot = key(identity, access), raw = store.read("execution-plans", slot);
      if (raw === undefined) return undefined;
      const root = saved(raw);
      requireSemantic(same(root.identity, identity) && same(root.scope, slot.scope), "DRIFT");
      return root.projectBindingDigest;
    },
    async preview(value: Declaration, access: Access) {
      const draft = declaration(value), before = current(draft, access);
      const root = store.read("execution-plans", key(draft.identity, access));
      const project = await projects.inspect({projectId: draft.identity.projectId, ...access,
        bindingDigest: root === undefined ? undefined : saved(root).projectBindingDigest});
      requireSemantic(project.binding.pins.artifactSetDigest === draft.outcomePlan.artifactSetDigest &&
        project.binding.pins.bundleRef.digest === draft.outcomePlan.bundleDigest && same(before, current(draft, access)), "DRIFT");
      requireSemantic(store.read("dispatch-claims", {scope: before.original.scope, runId: draft.runId,
        sourceRequestDigest: draft.requestDigest}) === undefined, "PERMISSION_DENIED");
      return freeze(draft);
    },
    // Declaration read is deliberately not a current-state validation. The fixed
    // asynchronous application uses it only to locate and revalidate owners.
    declaration(identity: SemanticExecutionIdentity, access: Access) {
      identity = structuredClone(identity);
      const {record} = selected(identity, access);
      return freeze(structuredClone(record.declaration));
    },
    async prepare(value: Declaration, access: Access) {
      const draft = declaration(value), original = subject(draft.identity, access), before = current(draft, access);
      const selection = location(draft, access), dispatchKey = {scope: original.scope, runId: draft.runId, sourceRequestDigest: draft.requestDigest};
      requireSemantic(store.read("dispatch-claims", dispatchKey) === undefined, "PERMISSION_DENIED");
      const root = store.read("execution-plans", key(draft.identity, access));
      const project = await projects.inspect({projectId: draft.identity.projectId, ...access,
        bindingDigest: root === undefined ? undefined : saved(root).projectBindingDigest});
      requireSemantic(project.binding.pins.artifactSetDigest === draft.outcomePlan.artifactSetDigest &&
        project.binding.pins.bundleRef.digest === draft.outcomePlan.bundleDigest, "DRIFT");
      requireSemantic(same(before, current(draft, access)) && same(original, subject(draft.identity, access)), "DRIFT");
      const body = content(draft, access, project.binding.bindingDigest), plan = {...body, planDigest: digestObject(body)};
      requireSemantic(store.read("dispatch-claims", dispatchKey) === undefined, "PERMISSION_DENIED");
      requireSemantic(same(selection, location(draft, access)), "DRIFT");
      goalOwnership.claim(draft.identity.goalId, original.scope, owner(draft));
      const result = saved(store.put(selection.kind, selection.slot, plan));
      requireSemantic(same(result, plan), "IDENTITY_CONFLICT");
      return inspect(draft.identity, access).record;
    },
    inspect: (identity: SemanticExecutionIdentity, access: Access) => inspect(structuredClone(identity), access).record,
    currentExecution: (identity: SemanticExecutionIdentity, access: Access) => inspect(structuredClone(identity), access).state
  });
}
