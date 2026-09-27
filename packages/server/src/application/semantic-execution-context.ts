import {performance} from "node:perf_hooks";
import {createSemanticExecutionBindingService, type SemanticExecutionIdentity} from "./semantic-execution-binding.js";
import {semanticProjectAccess, semanticRequestId, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import type {LifecycleService} from "../domains/lifecycle/service.js";
import {readVerifiedSemanticCatalog} from "../domains/harness-template/semantic-catalog-consumer.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {projectSemanticContext, resolveSemanticContextLimits, semanticContextResolverDescriptor,
  type SemanticContextLimits, type SemanticContextSelection} from "../domains/harness-template/semantic-context-slice.js";
import {canonicalJson, digestObject} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {selectPlannedSemanticContext, normalizeSemanticActionContextPlan} from "../domains/harness-template/semantic-action-context-plan.js";

/** Internal read-only preparation; not an execution or HTTP capability.
 * All materials come from the fixed consumer. The Lifecycle owner reconstructs
 * the exact currently pending request; a caller cannot supply a request body.
 * Selection is an explicit server-planning input limited to Harness requirements.
 */
export function createSemanticExecutionContextService(
  configuration: Parameters<typeof createSemanticExecutionBindingService>[0] & {contextLimits?: Partial<SemanticContextLimits>},
  owners: Parameters<typeof createSemanticExecutionBindingService>[1] & {lifecycle: Pick<LifecycleService, "readPendingExecution">}
) {
  configuration = Object.freeze({...configuration, ...(configuration.limits ? {limits: Object.freeze({...configuration.limits})} : {})});
  const limits = resolveSemanticContextLimits(configuration.contextLimits), descriptor = semanticContextResolverDescriptor(limits);
  const bindings = createSemanticExecutionBindingService(configuration, owners);
  const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
  return Object.freeze({descriptor, async resolve(input: {
    identity: SemanticExecutionIdentity; bindingDigest: string; runId: string; requestDigest: string;
    selection?: SemanticContextSelection; currentAccess: () => SemanticDiscoveryAccess; signal?: AbortSignal;
  }) {
    requireSemantic(semanticRequestId(input.runId) && /^sha256:[a-f0-9]{64}$/.test(input.requestDigest), "INVALID");
    // Capture mutable inputs before the first await. Access and owner callbacks
    // intentionally remain live and must revalidate current state.
    const {identity, selection, bindingDigest, runId, requestDigest} = structuredClone({identity: input.identity,
      selection: input.selection, bindingDigest: input.bindingDigest, runId: input.runId, requestDigest: input.requestDigest});
    const started = performance.now(), timeout = new AbortController();
    let wallTimeLimitMs = limits.timeoutMs;
    const signal = input.signal ? AbortSignal.any([input.signal, timeout.signal]) : timeout.signal;
    const timer = setTimeout(() => timeout.abort(), limits.timeoutMs); timer.unref();
    const check = () => {
      requireSemantic(!input.signal?.aborted, "CANCELLED");
      requireSemantic(!timeout.signal.aborted && performance.now() - started < wallTimeLimitMs, "TIMEOUT");
    };
    try {
      check();
      const access = {currentAccess: input.currentAccess, signal, bindingDigest, checkpoint: "resume" as const};
      const bound = await bindings.inspect(identity, access); check();
      requireSemantic(same(bound.resolver, descriptor), "DRIFT");
      const scope = {...bound.scope, goalId: identity.goalId, targetId: identity.targetId};
      const pending = owners.lifecycle.readPendingExecution(runId, requestDigest, scope);
      if (bound.executionStage) requireSemantic(bound.executionStage.runId === runId && bound.executionStage.requestDigest === requestDigest, "DRIFT");
      const planned = bound.contextPlan ? selectPlannedSemanticContext(bound.contextPlan, pending) : undefined;
      if (planned && selection) {
        const normalized = normalizeSemanticActionContextPlan({schema: "evopilot-semantic-action-context-plan/v1", lifecycleDigest: bound.lifecycle.digest,
          actions: [{stageId: pending.stageId, action: pending.action, actionVersion: pending.actionVersion, selection}]}).actions[0].selection;
        requireSemantic(same(planned, normalized), "DRIFT");
      }
      const chosen = planned ?? selection; requireSemantic(chosen, "UNAVAILABLE");
      requireSemantic(pending.harness.harnessExecutionBindingDigest === identity.harnessBindingDigest &&
        same(pending.lifecycle, bound.lifecycle) && pending.harness.id === bound.harness.bundle.id &&
        pending.harness.version === bound.harness.bundle.version && pending.harness.digest === bound.harness.bundle.digest &&
        pending.harness.catalogId === bound.harness.catalogId && pending.executor.digest === bound.host.executorDigest, "DRIFT");
      requireSemantic(same(pending.governance, {policyDigest: bound.policyDigest, providerDigest: bound.providerDigest,
        environmentDigest: bound.environmentDigest, authorityDigest: bound.authorityDigest, runtimeDigest: bound.runtimeDigest,
        evidenceDigest: bound.evidenceContractDigest}), "DRIFT");
      requireSemantic(configuration.registryConfigPath && configuration.policyPath, "TRUST_REQUIRED");
      const snapshot = await readVerifiedSemanticCatalog({registryConfigPath: configuration.registryConfigPath,
        policyPath: configuration.policyPath, catalogId: bound.harness.catalogId, limits: configuration.limits, signal,
        currentSubject: () => {
          check(); const current = semanticProjectAccess(identity.projectId, input.currentAccess());
          requireSemantic(same(current.scope, bound.scope) && current.projectRevisionDigest === bound.projectRevisionDigest &&
            ["operator", "admin"].includes(current.principal.role), "PERMISSION_DENIED");
          return {scope: current.scope, role: current.principal.role, active: true};
        }});
      check();
      const sets = snapshot.generation.sets?.filter(set => same(set.scope, bound.scope) &&
        set.refs.artifactSet === bound.semantic.artifactSetDigest && set.refs.closure === bound.semantic.closureDigest);
      requireSemantic(sets?.length === 1, "DRIFT");
      const material = (objectDigest: string, kind: string) => {
        const entries = snapshot.generation.entries.filter(entry => same(entry.scope, bound.scope) && entry.kind === kind && entry.objectDigest === objectDigest);
        requireSemantic(entries.length === 1, "MATERIAL_MISSING"); return snapshot.materials.get(entries[0].path);
      };
      const projected = projectSemanticContext({scope: bound.scope, artifactSet: material(bound.semantic.artifactSetDigest, "ProjectOntologyArtifactSet"),
        bundle: material(bound.harness.bundle.digest, "HarnessBundle"), reasoningProfile: material(bound.semantic.reasoningProfileDigest, "OntologyReasoningProfile"),
        selection: chosen, limits, check});
      wallTimeLimitMs = projected.wallTimeLimitMs; check();
      requireSemantic(projected.compatibilityDigest === bound.semantic.compatibilityDigest, "DRIFT");
      // The entire preparation shares one deadline. Final live owner/permission
      // checks detect cancellation, completed/replaced requests or binding drift.
      const final = await bindings.inspect(identity, access); check();
      requireSemantic(final.bindingDigest === bound.bindingDigest && same(owners.lifecycle.readPendingExecution(runId, requestDigest, scope), pending), "DRIFT");
      const content = {schema: "evopilot-semantic-context-slice/v1", scope: bound.scope,
        ...(bound.contextPlan ? {contextPlanDigest: bound.contextPlan.planDigest} : {}),
        executionBindingDigest: bindingDigest, pendingExecution: {runId, requestId: pending.id, requestDigest, lifecycleBindingDigest: pending.bindingDigest,
          stageId: pending.stageId, action: pending.action, actionVersion: pending.actionVersion},
        pins: {artifactSetDigest: bound.semantic.artifactSetDigest, snapshotDigest: bound.semantic.snapshotDigest,
          skillDigest: bound.semantic.skillDigest, closureDigest: bound.semantic.closureDigest, reasoningProfileDigest: bound.semantic.reasoningProfileDigest,
          harnessBindingDigest: identity.harnessBindingDigest, bundleDigest: bound.harness.bundle.digest},
        resolver: descriptor, selectionDigest: projected.selectionDigest, ...projected.content,
        status: "PREPARED_NOT_DISPATCHED", eligibleForExecution: false,
        authority: {semanticDataOnly: true, textIsUntrustedData: true, mayApprove: false, mayExecute: false, mayPublish: false}};
      const result = freeze({...content, sliceDigest: digestObject(content)});
      requireSemantic(Buffer.byteLength(canonicalJson(result)) <= limits.maxOutputBytes, "MATERIAL_LIMIT"); check();
      return result;
    } catch (error) {check(); throw error;} finally {clearTimeout(timer);}
  }});
}
