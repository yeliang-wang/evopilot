import fs from "node:fs";
import path from "node:path";
import {canonicalDigest as d} from "../../packages/core/dist/index.js";
import {semanticExecutionFixture} from "./semantic-execution-fixture.mjs";
import {seedSemanticRuntimeRecords} from "./semantic-runtime-records.mjs";
import {createOpenCodeRuntimeProfile, createOpenCodeExecutorAdapter} from "../../packages/adapter-opencode/dist/index.js";
import {createSemanticCurrentExecutionReader} from "../../packages/server/dist/application/semantic-current-execution.js";
import {createSemanticPermissionSourceReader} from "../../packages/server/dist/application/semantic-permission-sources.js";
import {createSemanticExecutionBindingService} from "../../packages/server/dist/application/semantic-execution-binding.js";
import {createSemanticExecutionContextService} from "../../packages/server/dist/application/semantic-execution-context.js";
import {createSemanticOutcomeReviewService} from "../../packages/server/dist/application/semantic-outcome-review.js";
import {createSemanticExecutionTransport} from "../../packages/server/dist/application/semantic-execution-transport.js";
import {createSemanticExecutionOutcomeService} from "../../packages/server/dist/application/semantic-execution-outcome.js";

// Local synthetic resources and injected process runner. No real Host, model,
// credential, native executable or business-completion claim.
export async function semanticCurrentOwnerFixture(t, options = {}) {
  const profile = createOpenCodeRuntimeProfile({runtimeVersion: "synthetic-1", host: "synthetic-host", provider: "synthetic", model: "test",
    capabilities: ["goal-loop.execute"], workspaceRoot: "/private/tmp/synthetic-current-owner-workspace"});
  const f = await semanticExecutionFixture(t, {pending: true, adapterProfile: profile,
    publishedMaterials: options.publishedMaterials, runtimeDigest: options.runtimeDigest, additionalStage: options.additionalStage, terminalControls: options.terminalControls,
    sharedProject: options.sharedProject, projectRecord: options.projectRecord, targetId: options.targetId});
  const {source, store: runtimeStore} = seedSemanticRuntimeRecords(f, undefined, options.beforeSource, options.reuseGoal);
  const suffix = options.targetId ? "-" + options.targetId : "";
  let now = Date.now() + 1000, calls = 0;
  const time = {get: () => now, set: value => {now = value;}};
  const kinds = {policy: "PolicyPack", authority: "HumanAuthorityRole", provider: "ActionProviderDefinition", environment: "EnvironmentBinding", evidence: "GovernancePack"};
  const refs = {}, resources = {}, declarations = {};
  const register = (kind, id, spec) => f.governed.registerResource({apiVersion: "evopilot.io/v1", kind,
    metadata: {id, name: "Synthetic source only", version: "1.0.0"},
    provenance: {sourceType: "NATIVE", sourceId: "synthetic", sourceVersion: "1.0.0", sourceDigest: d("synthetic")},
    compatibility: {runtime: ">=6.2.0 <7.0.0"}, capabilityRefs: [], spec}, f.scope);
  for (const [slot, kind] of Object.entries(kinds)) {
    let spec = {purpose: "synthetic metadata only"};
    if (["policy", "authority"].includes(slot)) {
      declarations[slot] = {schema: slot === "policy" ? "evopilot-semantic-permission-policy/v1" : "evopilot-semantic-permission-grant/v1",
        scope: {...f.scope}, status: "ACTIVE", roles: ["operator", "admin"], allowedEffects: ["READ_ONLY", "REVERSIBLE"], capabilities: ["goal-loop.execute"],
        deniedEffects: [], deniedCapabilities: [], validFrom: new Date(now - 60000).toISOString(), validUntil: new Date(now + 60000).toISOString(),
        ...(slot === "authority" ? {principalId: f.access.principal.id} : {})};
      options.mutateDeclaration?.(slot, declarations[slot]);
      spec = {semanticExecution: declarations[slot]};
    }
    if (slot === "provider") spec = {execution: "TYPED_ACTIONS_ONLY", arbitraryShell: false, actions: [{id: "synthetic.read",
      inputSchema: {type: "object"}, outputSchema: {type: "object"}, receipt: "IMMUTABLE_REQUIRED", idempotencyKeyRequired: true,
      rollback: "NOT_APPLICABLE", requiredAuthorities: [], credentialRefs: []}]};
    if (slot === "evidence" && options.collectorDescriptor) spec = {semanticCollectorPolicy: {
      schema: "evopilot-semantic-collector-policy/v1", scope: {...f.scope}, status: "ACTIVE",
      validFrom: new Date(now - 60000).toISOString(), validUntil: new Date(now + 60000).toISOString(),
      collector: structuredClone(options.collectorDescriptor)}};
    if (slot === "evidence" && options.stageCompletionPolicy) spec.semanticCompletionPolicy = {
      schema: "evopilot-semantic-stage-completion-policy/v1", action: "COMMIT_VALIDATED_STAGE", status: "ACTIVE",
      scope: {...f.scope, goalId: f.identity.goalId, targetId: f.identity.targetId},
      validFrom: new Date(now - 60000).toISOString(), validUntil: new Date(now + 60000).toISOString()};
    if (slot === "evidence" && options.goalCompletionPolicy) spec.semanticGoalCompletionPolicy = {
      schema: "evopilot-semantic-goal-completion-policy/v1", action: "COMMIT_VALIDATED_TARGET", status: "ACTIVE",
      goalCompletion: "ALL_REQUIRED_SEMANTIC_TARGETS_DONE",
      scope: {...f.scope, goalId: f.identity.goalId, targetId: f.identity.targetId},
      validFrom: new Date(now - 60000).toISOString(), validUntil: new Date(now + 60000).toISOString(),
      ...(typeof options.goalCompletionPolicy === "object" ? options.goalCompletionPolicy : {})};
    if (slot === "evidence" && options.phaseCompletionPolicy) spec.semanticPhaseCompletionPolicy = options.phaseCompletionPolicy({f, source, now});
    if (slot === "evidence" && options.finalGoalCompletionPolicy) spec.semanticFinalGoalCompletionPolicy = options.finalGoalCompletionPolicy({f, source, now});
    const r = resources[slot] = register(kind, "synthetic-current-" + slot + suffix, spec);
    refs[slot] = {id: r.metadata.id, version: r.metadata.version, digest: r.digest};
    if (options.skipActivation !== slot) f.governed.activateResourceVersion(kind, r.metadata.id, r.metadata.version, "synthetic-reviewer", "synthetic://decision", f.scope);
  }
  const old = f.plan.binding, revision = f.run.revision;
  f.plan = f.governed.plan({projectDefinitionId: f.scope.projectId, goalTarget: f.state.goalTarget, candidates: [f.plan.match.selected],
    lifecycle: {ref: revision.ref, digest: revision.digest, definition: revision.definition},
    policyDigest: refs.policy.digest, providerDigest: refs.provider.digest, environmentDigest: refs.environment.digest,
    authorityDigest: refs.authority.digest, evidenceDigest: refs.evidence.digest, runtimeDigest: old.runtimeDigest, hostDigest: old.hostDigest}, f.scope);
  const b = f.plan.binding;
  f.identity.harnessBindingDigest = b.digest;
  Object.assign(f.state.harness, Object.fromEntries(["policyDigest", "providerDigest", "environmentDigest", "authorityDigest", "evidenceDigest"].map(key => [key, b[key]])));
  f.lifecycleService.configureGovernanceHooks({verifyBoundary: input => {
    f.governed.assertLifecycleBoundary({...input, currentState: f.state.harness}, f.scope);
    return {bindingDigest: b.digest, evidence: ["synthetic://current-boundary"]};
  }, decideRecovery: () => {throw new Error("SYNTHETIC_RECOVERY_NOT_IMPLEMENTED");}});
  f.run = f.lifecycleService.start({id: "current-owner-run" + suffix, lifecycleId: revision.ref.id, lifecycleVersion: revision.ref.version,
    ...f.scope, goalId: f.identity.goalId, targetId: f.identity.targetId, executor: f.state.executor,
    ...Object.fromEntries(["policyDigest", "providerDigest", "environmentDigest", "authorityDigest", "runtimeDigest", "evidenceDigest"].map(key => [key, b[key]])),
    harnessExecutionBindingDigest: b.digest, harnessBundle: {id: b.bundleRef.id, version: b.bundleRef.version, digest: b.bundleRef.digest, catalogId: b.catalogId}});
  f.lifecycleService.authorizePlan(f.run.id, "APPROVED", "synthetic", "synthetic://plan", f.run.binding.digest);
  f.run = f.lifecycleService.advanceUntilBoundary(f.run.id);
  const pending = f.run.pendingExecution;
  const contextPlan = {schema: "evopilot-semantic-action-context-plan/v1", lifecycleDigest: revision.digest,
    actions: [{stageId: pending.stageId, action: pending.action, actionVersion: pending.actionVersion,
      selection: {schema: "evopilot-semantic-context-selection/v1", reasoning: "EXPLICIT_ONLY", conceptIds: ["fixture:entity"], relations: []}}]};
  const outcomePlan = {schema: "evopilot-semantic-outcome-plan/v1", goalTargetDigest: b.goalTargetDigest,
    artifactSetDigest: f.projectRecord.binding.pins.artifactSetDigest, bundleDigest: b.bundleRef.digest, lifecycleDigest: revision.digest,
    stageId: pending.stageId, action: pending.action, actionVersion: pending.actionVersion,
    business: [{id: "units", conceptId: "fixture:entity", evidenceKind: "domain-checks", path: ["units"], predicate: {op: "NUMBER_RANGE", minimum: 1, maximum: 10}}],
    harness: [{id: "exit", evidenceKind: "agent-process", path: ["exitCode"], predicate: {op: "EQUALS", value: 0}, obligation: {kind: "validator", value: "validation-exit-code"}}]};
  f.state.contextPlan = contextPlan; f.state.outcomePlan = {...outcomePlan, planDigest: d(outcomePlan)};
  const observation = {schema: "evopilot-semantic-executor-observation/v1", scope: f.scope, identity: f.identity, status: "READY", principalId: f.access.principal.id,
    observedAt: new Date(now - 60000).toISOString(), validUntil: new Date(now + 120000).toISOString(), observedBy: "synthetic-observer",
    evidenceRefs: ["synthetic://observation"], runtime: profile.runtime, profile: f.state.agentRuntime, adapterProfile: profile,
    qualification: f.state.qualification, executor: f.state.executor,
    environment: {status: "READY", digest: b.environmentDigest, workspaceRef: profile.constraints.workspaceRoot, evidenceRefs: ["synthetic://environment"]},
    governance: Object.fromEntries(["policyDigest", "providerDigest", "authorityDigest", "runtimeDigest", "evidenceDigest"].map(key => [key, b[key]])),
    permissionCeiling: {allowedEffects: ["READ_ONLY", "REVERSIBLE"], capabilities: ["goal-loop.execute"]}};
  options.mutateObservation?.(observation); observation.digest = d(observation);
  const observed = register("AgentRuntimeProfile", "synthetic-current-observer" + suffix, {semanticObservation: observation});
  f.governed.activateResourceVersion(observed.kind, observed.metadata.id, observed.metadata.version, "synthetic", "synthetic://observation-decision", f.scope);
  const selected = {governed: refs, executor: {id: observed.metadata.id, version: observed.metadata.version, digest: observed.digest}};
  const ownerInputs = {currentAccess: f.input.currentAccess, currentSelections: () => selected, now: time.get,
    currentPlan: () => ({goalTarget: f.state.goalTarget, harness: f.state.harness, contextPlan: f.state.contextPlan, outcomePlan: f.state.outcomePlan})};
  const currentExecution = createSemanticCurrentExecutionReader(f.configuration, ownerInputs);
  const adapter = createOpenCodeExecutorAdapter({profile, runner: async () => {
    calls++; await options.onRun?.(f);
    return {exitCode: 0, signal: null, termination: "EXITED", stdout: '{"type":"step_finish"}', stderr: ""};
  }});
  const owners = {governed: f.governed, lifecycle: f.lifecycleService, currentExecution, adapter};
  const execution = createSemanticExecutionBindingService(f.configuration, owners);
  const input = bound => ({identity: f.identity, bindingDigest: bound.bindingDigest, runId: f.run.id, requestDigest: pending.requestDigest, currentAccess: f.input.currentAccess});
  const permissionReader = createSemanticPermissionSourceReader(f.configuration.dataRoot, time.get);
  const file = (slot, active = false) => path.join(f.configuration.dataRoot, active ? "governed-evolution-resources-active" : "governed-evolution-resources",
    f.scope.tenantId, f.scope.workspaceId, `${kinds[slot]}--${refs[slot].id}${active ? "" : "--" + refs[slot].version}.json`);
  return {...f, refs, resources, declarations, observation, selected, ownerInputs, currentExecution, owners, execution, time, file, source, runtimeStore,
    permission: () => permissionReader.read({projectId: f.scope.projectId, refs: {policy: refs.policy, authority: refs.authority}, currentAccess: f.input.currentAccess}),
    bind: () => execution.bind(f.identity, f.input), input, calls: () => calls,
    resolve: bound => createSemanticExecutionContextService(f.configuration, owners).resolve(input(bound)),
    review: async bound => {
      const service = createSemanticOutcomeReviewService(f.configuration, owners), i = input(bound);
      const prepared = await service.prepare({...i, coverage: source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: ["units"]}))});
      return service.approve({...i, reviewDigest: prepared.reviewDigest});
    },
    dispatch: bound => createSemanticExecutionTransport(f.configuration, owners).execute(input(bound)),
    evaluate: bound => createSemanticExecutionOutcomeService(f.configuration, owners).evaluate(input(bound)),
    changeGoal: change => {const p = path.join(runtimeStore.goalsDir, f.identity.goalId + ".json"), value = JSON.parse(fs.readFileSync(p)); change(value); fs.writeFileSync(p, JSON.stringify(value));}};
}
