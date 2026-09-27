import {canonicalDigest} from "@evopilot/core";
import {createSemanticRuntimeSourceReader} from "./semantic-runtime-sources.js";
import {createSemanticGovernedSourceReader, type SemanticGovernedSourceRefs} from "./semantic-governed-sources.js";
import {createSemanticExecutorSourceReader, type SemanticExecutorSourceRef} from "./semantic-executor-sources.js";
import {createSemanticPermissionSourceReader} from "./semantic-permission-sources.js";
import {semanticProjectAccess, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import type {SemanticExecutionIdentity, SemanticExecutionState} from "./semantic-execution-binding.js";
import {normalizeSemanticActionContextPlan} from "../domains/harness-template/semantic-action-context-plan.js";
import {normalizeSemanticOutcomePlan} from "../domains/harness-template/semantic-outcome-plan.js";
import {semanticContextResolverDescriptor, resolveSemanticContextLimits, type SemanticContextLimits} from "../domains/harness-template/semantic-context-slice.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";

type Seed = Pick<SemanticExecutionState, "goalTarget" | "harness"> & Required<Pick<SemanticExecutionState, "contextPlan" | "outcomePlan">>;
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);

/** Fixed assembly of current persisted owners. The server must still supply its
 * current project/Harness/Lifecycle plan and exact selections; no public route
 * accepts this seed. No old permissions, LLM route or executor can be supplied.
 * Qualification collection, public plan authoring and completion are separate.
 */
export function createSemanticCurrentExecutionReader(configuration: {dataRoot: string; contextLimits?: Partial<SemanticContextLimits>}, owners: {
  currentAccess: () => SemanticDiscoveryAccess;
  currentSelections: (identity: SemanticExecutionIdentity) => {governed: SemanticGovernedSourceRefs; executor: SemanticExecutorSourceRef};
  currentPlan: (identity: SemanticExecutionIdentity) => Seed;
  now?: () => number;
}) {
  const runtime = createSemanticRuntimeSourceReader(configuration.dataRoot), governed = createSemanticGovernedSourceReader(configuration.dataRoot);
  const permissions = createSemanticPermissionSourceReader(configuration.dataRoot, owners.now);
  const executor = createSemanticExecutorSourceReader(configuration.dataRoot, owners.now);
  const resolver = semanticContextResolverDescriptor(resolveSemanticContextLimits(configuration.contextLimits));
  function collect(identity: SemanticExecutionIdentity) {
    const subject = semanticProjectAccess(identity.projectId, owners.currentAccess());
    const selection = structuredClone(owners.currentSelections({...identity}));
    requireSemantic(Object.keys(selection).sort().join() === "executor,governed", "INVALID");
    // Run plan callbacks before reading persisted owners, including on the final
    // collection, so a callback cannot leave an already-read grant stale.
    const seed = structuredClone(owners.currentPlan({...identity}));
    requireSemantic(Object.keys(seed).sort().join() === "contextPlan,goalTarget,harness,outcomePlan", "INVALID");
    const source = runtime.read(identity, subject.principal);
    requireSemantic(same(source.subject, subject), "DRIFT");
    const governedPins = governed.read(selection.governed, subject.scope);
    const effective = permissions.read({projectId: identity.projectId, refs: {policy: selection.governed.policy, authority: selection.governed.authority}, currentAccess: owners.currentAccess});
    const observation = executor.read(selection.executor, identity, subject.scope, subject.principal.id);
    requireSemantic(seed.goalTarget.projectId === identity.projectId && seed.goalTarget.goalId === identity.goalId && seed.goalTarget.targetId === identity.targetId &&
      seed.goalTarget.objective === source.objective && seed.harness.goalTargetDigest === canonicalDigest(seed.goalTarget), "DRIFT");
    const {planDigest: _contextDigest, ...contextPlan} = normalizeSemanticActionContextPlan(seed.contextPlan);
    const outcomePlan = normalizeSemanticOutcomePlan(seed.outcomePlan);
    requireSemantic(contextPlan.lifecycleDigest === seed.harness.lifecycleDigest && outcomePlan.lifecycleDigest === seed.harness.lifecycleDigest &&
      outcomePlan.goalTargetDigest === seed.harness.goalTargetDigest, "DRIFT");
    const resources = governedPins.resources, observed = observation.observation;
    requireSemantic(effective.pins.policy.activationDigest === resources.policy.activationDigest &&
      effective.pins.authority.activationDigest === resources.authority.activationDigest, "DRIFT");
    const harness = {...seed.harness, policyDigest: resources.policy.digest, providerDigest: resources.provider.digest,
      environmentDigest: resources.environment.digest, authorityDigest: resources.authority.digest, evidenceDigest: resources.evidence.digest,
      hostDigest: observed.executor.digest};
    requireSemantic(observed.environment.digest === harness.environmentDigest && Object.entries(observed.governance).every(([key, value]) =>
      harness[key as keyof typeof harness] === value), "DRIFT");
    requireSemantic(observed.adapterProfile, "UNAVAILABLE");
    const allowedEffects = effective.permissions.allowedEffects.filter(effect => observed.permissionCeiling.allowedEffects.includes(effect));
    const capabilities = effective.permissions.capabilities.filter(capability => observed.permissionCeiling.capabilities.includes(capability));
    requireSemantic(observed.executor.allowedEffects.every(effect => allowedEffects.includes(effect)) &&
      observed.executor.capabilities.every(capability => capabilities.includes(capability)) &&
      seed.goalTarget.requiredCapabilities.every(capability => capabilities.includes(capability)), "PERMISSION_DENIED");
    const state: SemanticExecutionState = {goalTarget: seed.goalTarget, harness, resolver, contextPlan, outcomePlan,
      runtimeSourcePins: source.pins, governedSourcePins: governedPins, executorSourcePins: observation.pins,
      llmProfile: source.llmProfile, executor: observed.executor, agentRuntime: observed.profile, agentAdapterProfile: observed.adapterProfile,
      qualification: observed.qualification, permissions: {...effective.permissions, allowedEffects, capabilities,
        revisionDigest: digestObject({current: effective.permissions.revisionDigest, observation: observed.digest, allowedEffects, capabilities})}};
    requireSemantic(same(subject, semanticProjectAccess(identity.projectId, owners.currentAccess())) &&
      same(selection, owners.currentSelections({...identity})), "DRIFT");
    return {state, subject, selection, permissionPins: effective.pins};
  }
  return (input: SemanticExecutionIdentity): SemanticExecutionState => {
    const identity = structuredClone(input), first = collect(identity), final = collect(identity);
    requireSemantic(same(first, final), "DRIFT");
    return freeze(final.state);
  };
}
