import {canonicalDigest, normalizeExecutionRuntimeProfile, qualifyExecutionRuntimeProfile,
  type ExecutionRuntimeProfile, type ExecutionRuntimeQualification, type GoalTargetContext,
  type HarnessExecutionCurrentState} from "@evopilot/core";
import type {GovernedEvolutionService} from "../domains/governed-evolution/service.js";
import type {LifecycleExecutorBinding} from "../domains/lifecycle/types.js";
import type {LlmProfileRecord} from "../model.js";
import type {EvoPilotAgentRuntimeProfileV1} from "@evopilot/contracts";
import {assertSemanticAgentProfile} from "./semantic-agent-profile.js";
import {createProjectSemanticBindingService} from "./project-semantic-binding.js";
import {semanticProjectAccess, semanticRequestId, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {createSemanticRuntimeSourceReader, semanticLlmSecretReference, type SemanticRuntimeSourcePins} from "./semantic-runtime-sources.js";
import {validateSemanticGovernedSourcePins, type SemanticGovernedSourcePins} from "./semantic-governed-sources.js";
import {validateSemanticExecutorSourcePins, type SemanticExecutorSourcePins} from "./semantic-executor-sources.js";
import {normalizeSemanticActionContextPlan, type SemanticActionContextPlan} from "../domains/harness-template/semantic-action-context-plan.js";
import {normalizeSemanticOutcomePlan, semanticOutcomeEvaluatorDigest, type SemanticOutcomePlan} from "../domains/harness-template/semantic-outcome-plan.js";

export type SemanticExecutionCheckpoint = "start" | "resume" | "retry" | "loop-iteration";
export interface SemanticExecutionIdentity {projectId: string; goalId: string; targetId: string; harnessBindingDigest: string}
/** Server-owned current records, never an HTTP/MCP payload or a caller's
 * "qualified/approved" booleans. Wiring to actual owner repositories is required
 * before this internal service can be exposed as an execution capability.
 */
export interface SemanticExecutionState {
  projectBindingDigest?: string;
  executionStage?: {runId: string; requestDigest: string; predecessorProofDigest?: string};
  runtimeSourcePins?: SemanticRuntimeSourcePins;
  governedSourcePins?: SemanticGovernedSourcePins;
  executorSourcePins?: SemanticExecutorSourcePins;
  contextPlan?: SemanticActionContextPlan;
  outcomePlan?: SemanticOutcomePlan;
  goalTarget: GoalTargetContext;
  harness: HarnessExecutionCurrentState;
  llmProfile: LlmProfileRecord;
  agentRuntime: ExecutionRuntimeProfile;
  agentAdapterProfile?: EvoPilotAgentRuntimeProfileV1;
  qualification: ExecutionRuntimeQualification;
  executor: LifecycleExecutorBinding;
  resolver: {schema: "evopilot-semantic-context-resolver/v1"; id: string; implementationDigest: string; limitsDigest: string};
  permissions: {scope: {tenantId: string; workspaceId: string; projectId: string}; principalId: string;
    allowedEffects: string[]; capabilities: string[]; revisionDigest: string};
}
type Access = {currentAccess: () => SemanticDiscoveryAccess; signal?: AbortSignal};
const hash = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
const sorted = (a: string[]) => [...new Set(a)].sort();

/** Material binding/preflight only. Does not approve an execution or validate
 * business outcomes. The fixed semantic consumer is retained; callers cannot
 * replace it with an inspection report. Existing Harness checks remain separate.
 */
export function createSemanticExecutionBindingService(configuration: Parameters<typeof createProjectSemanticBindingService>[0], owners: {
  governed: Pick<GovernedEvolutionService, "readBinding" | "assertLifecycleBoundary">;
  currentExecution: (identity: SemanticExecutionIdentity) => SemanticExecutionState;
}) {
  const projects = createProjectSemanticBindingService(configuration), store = new SemanticBindingStore(configuration.dataRoot);
  const currentExecution = owners.currentExecution, governed = owners.governed;
  function access(identity: SemanticExecutionIdentity, input: Access) {
    requireSemantic([identity.projectId, identity.goalId, identity.targetId].every(semanticRequestId) && hash(identity.harnessBindingDigest), "INVALID");
    requireSemantic(!input.signal?.aborted, "CANCELLED");
    const state = semanticProjectAccess(identity.projectId, input.currentAccess());
    requireSemantic(["operator", "admin"].includes(state.principal.role), "PERMISSION_DENIED");
    return state;
  }
  function current(identity: SemanticExecutionIdentity, input: Access, checkpoint: SemanticExecutionCheckpoint) {
    const subject = access(identity, input);
    // Clone before asynchronous Catalog verification so mutable owner records
    // cannot change the first observation in place and mask a race.
    const state = structuredClone(currentExecution({...identity}));
    if (state.executionStage) requireSemantic(isRecord(state.executionStage) &&
      Object.keys(state.executionStage).every(k => ["runId", "requestDigest", "predecessorProofDigest"].includes(k)) &&
      semanticRequestId(state.executionStage.runId) && hash(state.executionStage.requestDigest) &&
      (state.executionStage.predecessorProofDigest === undefined || hash(state.executionStage.predecessorProofDigest)), "INVALID");
    requireSemantic(Buffer.byteLength(JSON.stringify(state)) <= 65536, "MATERIAL_LIMIT");
    if (state.runtimeSourcePins !== undefined) requireSemantic(state.runtimeSourcePins.schema === "evopilot-semantic-runtime-source-pins/v1" &&
      Object.entries(state.runtimeSourcePins).every(([key, value]) => key === "schema" || hash(value)) &&
      [state.runtimeSourcePins.projectRevisionDigest, state.runtimeSourcePins.goalDigest, state.runtimeSourcePins.targetDigest, state.runtimeSourcePins.planDigest,
        state.runtimeSourcePins.approvalDigest, state.runtimeSourcePins.llmSelectionDigest].every(hash), "INVALID");
    if (state.runtimeSourcePins) requireSemantic(state.runtimeSourcePins.projectRevisionDigest === subject.projectRevisionDigest, "DRIFT");
    if (state.executorSourcePins !== undefined) validateSemanticExecutorSourcePins(state.executorSourcePins, subject.scope);
    if (state.governedSourcePins !== undefined) {
      validateSemanticGovernedSourcePins(state.governedSourcePins, subject.scope);
      const resources = state.governedSourcePins.resources;
      for (const [key, slot] of [["policyDigest", "policy"], ["providerDigest", "provider"], ["environmentDigest", "environment"],
        ["authorityDigest", "authority"], ["evidenceDigest", "evidence"]] as const)
        requireSemantic(state.harness[key] === resources[slot].digest, "DRIFT");
    }
    if (state.contextPlan !== undefined) requireSemantic(normalizeSemanticActionContextPlan(state.contextPlan).lifecycleDigest === state.harness.lifecycleDigest, "DRIFT");
    const binding = governed.readBinding(identity.harnessBindingDigest, subject.scope);
    requireSemantic(binding && binding.digest === identity.harnessBindingDigest &&
      canonicalDigest({...binding, digest: undefined}) === binding.digest, "DIGEST_MISMATCH");
    requireSemantic(state.goalTarget.projectId === identity.projectId && state.goalTarget.goalId === identity.goalId &&
      state.goalTarget.targetId === identity.targetId && canonicalDigest(state.goalTarget) === binding.goalTargetDigest &&
      state.harness.goalTargetDigest === binding.goalTargetDigest, "DRIFT");
    const llm = state.llmProfile;
    requireSemantic(llm.schema === "evopilot-llm-profile/v1" && llm.status === "ACTIVE" && llm.tenantId === subject.scope.tenantId &&
      llm.workspaceId === subject.scope.workspaceId && ["workspace", "user"].includes(llm.scope) &&
      (llm.scope === "workspace" || llm.ownerActor === subject.principal.id), "PERMISSION_DENIED");
    requireSemantic(semanticRequestId(llm.id) && typeof llm.providerName === "string" && llm.providerName.length > 0 &&
      typeof llm.modelName === "string" && llm.modelName.length > 0 && semanticLlmSecretReference(llm.apiKeyRef), "INVALID");
    if (!llm.apiKeyRef.startsWith("secret://")) {
      // Bare IDs must come from the exact persisted Goal/Profile owners, never
      // an adapter callback substituting a literal key. No secret is read here.
      const source = createSemanticRuntimeSourceReader(configuration.dataRoot).read(identity, subject.principal);
      requireSemantic(state.runtimeSourcePins && digestObject(source.pins) === digestObject(state.runtimeSourcePins) &&
        digestObject(source.llmProfile) === digestObject(llm), "DRIFT");
    }
    const profile = normalizeExecutionRuntimeProfile(state.agentRuntime);
    const executor = state.executor, qualification = state.qualification;
    if (state.agentAdapterProfile) assertSemanticAgentProfile(state.agentAdapterProfile, profile, executor, state.executorSourcePins?.runtime);
    const {digest: executorDigest, ...executorContent} = executor;
    requireSemantic(canonicalDigest(executorContent) === executorDigest && executorDigest === binding.hostDigest, "DIGEST_MISMATCH");
    requireSemantic(profile.id === executor.agentRuntime.profileId && profile.version === executor.agentRuntime.profileVersion &&
      (state.agentAdapterProfile?.digest ?? profile.digest) === executor.agentRuntime.profileDigest && profile.provider === executor.provider && profile.model === executor.model &&
      profile.permissionMode === executor.sandbox.permissionMode && Boolean(executor.sandbox.workspaceRef) &&
      Boolean(executor.agentRuntime.adapterId), "DRIFT");
    requireSemantic(qualification.status === "QUALIFIED" &&
      (state.agentAdapterProfile?.qualification.conformanceDigest ?? qualification.digest) === executor.agentRuntime.qualificationDigest &&
      same(qualifyExecutionRuntimeProfile(profile, qualification.requiredCapabilities, qualification.evidenceRefs), qualification) &&
      executor.capabilities.every(capability => qualification.requiredCapabilities.includes(capability)) &&
      state.goalTarget.requiredCapabilities.every(capability => executor.capabilities.includes(capability)), "PERMISSION_DENIED");
    requireSemantic(same(state.permissions.scope, subject.scope) && state.permissions.principalId === subject.principal.id &&
      executor.allowedEffects.every(effect => state.permissions.allowedEffects.includes(effect)) &&
      executor.capabilities.every(capability => state.permissions.capabilities.includes(capability)) &&
      hash(state.permissions.revisionDigest), "PERMISSION_DENIED");
    requireSemantic(state.resolver.schema === "evopilot-semantic-context-resolver/v1" && semanticRequestId(state.resolver.id) &&
      hash(state.resolver.implementationDigest) && hash(state.resolver.limitsDigest), "INVALID");
    requireSemantic([binding.policyDigest, binding.providerDigest, binding.environmentDigest, binding.runtimeDigest,
      binding.authorityDigest, binding.evidenceDigest].every(hash), "INVALID");
    const harnessCheck = governed.assertLifecycleBoundary({bindingDigest: binding.digest, checkpoint,
      projectId: identity.projectId, goalId: identity.goalId, targetId: identity.targetId,
      lifecycleDigest: state.harness.lifecycleDigest, policyDigest: state.harness.policyDigest, providerDigest: state.harness.providerDigest,
      environmentDigest: state.harness.environmentDigest, authorityDigest: state.harness.authorityDigest, runtimeDigest: state.harness.runtimeDigest,
      evidenceDigest: state.harness.evidenceDigest, harnessBundle: {...binding.bundleRef, catalogId: binding.catalogId},
      hostDigest: executorDigest, currentState: state.harness}, subject.scope);
    requireSemantic(harnessCheck.status === "VALID" && harnessCheck.closure === "LIVE_IMMUTABLE_CLOSURE", "DRIFT");
    return {subject, state, binding};
  }
  async function material(identity: SemanticExecutionIdentity, input: Access, checkpoint: SemanticExecutionCheckpoint, projectBindingDigest?: string) {
    requireSemantic(["start", "resume", "retry", "loop-iteration"].includes(checkpoint), "INVALID");
    const before = current(identity, input, checkpoint);
    const pinned = projectBindingDigest ?? before.state.projectBindingDigest;
    if (before.state.projectBindingDigest !== undefined) requireSemantic(hash(before.state.projectBindingDigest) &&
      (projectBindingDigest === undefined || projectBindingDigest === before.state.projectBindingDigest), "DRIFT");
    const project = await projects.inspect({projectId: identity.projectId, ...input, bindingDigest: pinned});
    const after = current(identity, input, checkpoint);
    requireSemantic(same(before, after), "DRIFT");
    requireSemantic(project.binding.projectRevisionDigest === after.subject.projectRevisionDigest &&
      same(project.binding.pins.bundleRef, {id: after.binding.bundleRef.id, version: after.binding.bundleRef.version, digest: after.binding.bundleRef.digest}) &&
      same(project.binding.pins.harnessClosure.profile, after.binding.profileRef) &&
      same(sorted(project.binding.pins.harnessClosure.components.map(component => component.digest)), sorted(after.binding.bundleRef.componentDigests)) &&
      project.binding.catalogId === after.binding.catalogId, "DRIFT");
    const {binding: harness, state, subject} = after;
    if (state.outcomePlan) {
      const plan = normalizeSemanticOutcomePlan(state.outcomePlan);
      requireSemantic(plan.goalTargetDigest === harness.goalTargetDigest && plan.bundleDigest === harness.bundleRef.digest &&
        plan.lifecycleDigest === harness.lifecycleRef.digest && plan.artifactSetDigest === project.binding.pins.artifactSetDigest, "DRIFT");
    }
    const value = {schema: "evopilot-semantic-execution-binding/v1" as const, scope: subject.scope,
      ...(state.executionStage ? {executionStage: state.executionStage} : {}),
      ...(state.runtimeSourcePins ? {runtimeSourcePins: state.runtimeSourcePins} : {}),
      ...(state.governedSourcePins ? {governedSourcePins: state.governedSourcePins} : {}),
      ...(state.executorSourcePins ? {executorSourcePins: state.executorSourcePins} : {}),
      ...(state.contextPlan ? {contextPlan: normalizeSemanticActionContextPlan(state.contextPlan)} : {}),
      ...(state.outcomePlan ? {outcomePlan: normalizeSemanticOutcomePlan(state.outcomePlan), outcomeEvaluatorDigest: semanticOutcomeEvaluatorDigest} : {}),
      projectBindingDigest: project.binding.bindingDigest, projectReviewDigest: project.review.reviewDigest, projectDecisionDigest: project.decision.decisionDigest,
      projectRevisionDigest: subject.projectRevisionDigest, semantic: project.binding.pins,
      projectDefinition: harness.projectDefinitionRef, goalTarget: harness.goalTargetRef,
      harness: {bindingDigest: harness.digest, catalogId: harness.catalogId, registryDigest: harness.registryDigest,
        catalogDigest: harness.catalogDigest, profile: harness.profileRef, bundle: harness.bundleRef, compositionDigest: harness.compositionDigest},
      lifecycle: harness.lifecycleRef, resolver: state.resolver,
      llm: {profileId: state.llmProfile.id, profileDigest: digestObject(state.llmProfile), provider: state.llmProfile.providerName, model: state.llmProfile.modelName},
      host: {id: state.executor.host, executorDigest: state.executor.digest},
      agentRuntime: {...state.executor.agentRuntime, provider: state.agentRuntime.provider, model: state.agentRuntime.model,
        ...(state.agentAdapterProfile ? {coreProfileDigest: state.agentRuntime.digest, coreQualificationDigest: state.qualification.digest,
          adapterProfileDigest: state.agentAdapterProfile.digest} : {})},
      environmentDigest: harness.environmentDigest, policyDigest: harness.policyDigest, providerDigest: harness.providerDigest,
      authorityDigest: harness.authorityDigest, runtimeDigest: harness.runtimeDigest, evidenceContractDigest: harness.evidenceDigest,
      permissionDigest: digestObject({principal: subject.principal, ...state.permissions, allowedEffects: sorted(state.permissions.allowedEffects), capabilities: sorted(state.permissions.capabilities)}),
      revalidateAt: ["start", "resume", "retry", "loop-iteration"],
      status: "BOUND_PENDING_EXECUTION_INTEGRATION" as const, eligibleForExecution: false as const};
    return {record: freeze({...value, bindingDigest: digestObject(value)}), ownerFingerprint: digestObject(after)};
  }
  type Binding = Awaited<ReturnType<typeof material>>["record"];
  function key(identity: SemanticExecutionIdentity, input: Access) {
    const stage = currentExecution(identity).executionStage;
    return {scope: access(identity, input).scope, goalId: identity.goalId, targetId: identity.targetId, harnessBindingDigest: identity.harnessBindingDigest,
      ...(stage ? {executionStage: stage} : {})};
  }
  function saved(value: unknown): Binding {
    requireSemantic(isRecord(value) && value.schema === "evopilot-semantic-execution-binding/v1" &&
      value.status === "BOUND_PENDING_EXECUTION_INTEGRATION" && value.eligibleForExecution === false, "MATERIAL_INVALID");
    const {bindingDigest, ...content} = value;
    requireSemantic(hash(bindingDigest) && bindingDigest === digestObject(content), "DIGEST_MISMATCH");
    return value as Binding;
  }
  return Object.freeze({
    async inspect(identity: SemanticExecutionIdentity, input: Access & {bindingDigest: string; checkpoint: SemanticExecutionCheckpoint}) {
      requireSemantic(hash(input.bindingDigest), "INVALID");
      const value = store.read("executions", key(identity, input)); requireSemantic(value !== undefined, "UNAVAILABLE");
      const bound = saved(value); requireSemantic(bound.bindingDigest === input.bindingDigest, "DIGEST_MISMATCH");
      const now = await material(identity, input, input.checkpoint, bound.projectBindingDigest);
      requireSemantic(now.record.bindingDigest === bound.bindingDigest &&
        digestObject(current(identity, input, input.checkpoint)) === now.ownerFingerprint, "DRIFT");
      return freeze(bound);
    },
    async bind(identity: SemanticExecutionIdentity, input: Access) {
      const originalOwner = digestObject(current(identity, input, "start"));
      const prior = store.read("executions", key(identity, input));
      const {record, ownerFingerprint} = await material(identity, input, "start", prior === undefined ? undefined : saved(prior).projectBindingDigest);
      requireSemantic(originalOwner === ownerFingerprint && digestObject(current(identity, input, "start")) === ownerFingerprint, "DRIFT");
      const slot = {scope: record.scope, goalId: identity.goalId, targetId: identity.targetId, harnessBindingDigest: identity.harnessBindingDigest,
        ...(record.executionStage ? {executionStage: record.executionStage} : {})};
      const stored = saved(store.put("executions", slot, record));
      requireSemantic(stored.bindingDigest === record.bindingDigest, "IDENTITY_CONFLICT");
      return freeze(stored);
    },
    async verifyBoundary(identity: SemanticExecutionIdentity, input: Access & {bindingDigest: string; checkpoint: SemanticExecutionCheckpoint}) {
      requireSemantic(hash(input.bindingDigest), "INVALID");
      const value = store.read("executions", key(identity, input)); requireSemantic(value !== undefined, "UNAVAILABLE");
      const bound = saved(value); requireSemantic(bound.bindingDigest === input.bindingDigest, "DIGEST_MISMATCH");
      const now = await material(identity, input, input.checkpoint, bound.projectBindingDigest);
      requireSemantic(now.record.bindingDigest === bound.bindingDigest &&
        digestObject(current(identity, input, input.checkpoint)) === now.ownerFingerprint, "DRIFT");
      const result = {schema: "evopilot-semantic-execution-boundary-check/v1", status: "VALIDATED", checkpoint: input.checkpoint,
        bindingDigest: bound.bindingDigest, harnessBindingDigest: identity.harnessBindingDigest,
        projectBindingDigest: bound.projectBindingDigest, eligibleForExecution: false,
        pending: ["semantic-context-slice", "business-and-harness-result-validation", "live-execution-transport"]};
      return freeze({...result, checkDigest: digestObject(result)});
    }
  });
}
