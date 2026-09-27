import {canonicalDigest, composeHarnessAndLifecycle, normalizeEvolutionProjectDefinition,
  type EvolutionProjectDefinition, type GoalTargetContext, type HarnessExecutionBinding, type HarnessExecutionCurrentState} from "@evopilot/core";
import type {LifecycleService} from "../domains/lifecycle/service.js";
import {readVerifiedSemanticCatalog} from "../domains/harness-template/semantic-catalog-consumer.js";
import {publishedHarnessCandidatesV5} from "../domains/harness-template/bundle.js";
import type {HarnessBundleAssetV3, HarnessProfileAssetV3, HarnessComponentAssetV3} from "../domains/harness-template/types.js";
import {requireSemantic, SemanticCatalogError} from "../domains/harness-template/semantic-catalog-contract.js";
import {freeze, redactSemanticError} from "../domains/harness-template/semantic-catalog-io.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {SemanticRuntimeSourceStore} from "../storage/semantic-runtime-source.js";
import {createSemanticRuntimeSourceReader} from "./semantic-runtime-sources.js";
import {semanticProjectAccess, semanticRequestId, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import type {SemanticExecutionIdentity} from "./semantic-execution-binding.js";

type Material = Pick<HarnessExecutionCurrentState, "projectDefinitionDigest" | "goalTargetDigest" | "registryDigest" |
  "catalogDigests" | "profiles" | "bundles" | "lifecycleDigest" | "compositionDigest">;
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
const hash = (value: unknown) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);

/** Fixed current material owner. Uses full verified semantic/v3 Catalog bytes,
 * exact scoped project definition and the persisted pending Lifecycle revision.
 * No FileStore scan fallback, Registry bootstrap, producer mutation or copied
 * governance/permission/Host/runtime digest. Those remain separate live owners.
 */
export function createSemanticHarnessSourceReader(
  configuration: {dataRoot: string; registryConfigPath?: string; policyPath?: string;
    limits?: Parameters<typeof readVerifiedSemanticCatalog>[0]["limits"]},
  owners: {lifecycle: Pick<LifecycleService, "readPendingExecution" | "readPendingRevision"> & Partial<Pick<LifecycleService, "readSemanticTerminal">>}
) {
  configuration = Object.freeze({...configuration, ...(configuration.limits ? {limits: Object.freeze({...configuration.limits})} : {})});
  const store = new SemanticRuntimeSourceStore(configuration.dataRoot), runtime = createSemanticRuntimeSourceReader(configuration.dataRoot);
  return Object.freeze({async read(input: {identity: SemanticExecutionIdentity; runId: string; requestDigest: string;
    goalTarget: GoalTargetContext; currentAccess: () => SemanticDiscoveryAccess; signal?: AbortSignal; terminal?: true}) {
    const {identity, runId, requestDigest, goalTarget} = structuredClone({identity: input.identity, runId: input.runId,
      requestDigest: input.requestDigest, goalTarget: input.goalTarget});
    requireSemantic(isRecord(identity) && Object.keys(identity).sort().join() === "goalId,harnessBindingDigest,projectId,targetId" &&
      [identity.projectId, identity.goalId, identity.targetId, runId].every(semanticRequestId) && hash(identity.harnessBindingDigest) && hash(requestDigest) &&
      isRecord(goalTarget) && Buffer.byteLength(JSON.stringify(goalTarget)) <= 65536, "INVALID");
    const subject = () => {
      requireSemantic(!input.signal?.aborted, "CANCELLED");
      const value = semanticProjectAccess(identity.projectId, input.currentAccess());
      requireSemantic(["operator", "admin"].includes(value.principal.role), "PERMISSION_DENIED"); return value;
    };
    function local() {
      const access = subject(), source = runtime.read(identity, access.principal);
      requireSemantic(same(access, source.subject), "DRIFT");
      const raw = store.readHarnessBinding(access.scope, identity.harnessBindingDigest);
      requireSemantic(isRecord(raw), "MATERIAL_INVALID"); const {digest, ...body} = raw;
      requireSemantic(digest === identity.harnessBindingDigest && canonicalDigest(body) === digest, "DIGEST_MISMATCH");
      const binding = raw as unknown as HarnessExecutionBinding;
      requireSemantic(binding.schema === "evopilot-harness-execution-binding/v1" && binding.projectDefinitionRef.id === identity.projectId &&
        binding.goalTargetRef.goalId === identity.goalId && binding.goalTargetRef.targetId === identity.targetId &&
        goalTarget.projectId === identity.projectId && goalTarget.goalId === identity.goalId && goalTarget.targetId === identity.targetId &&
        goalTarget.objective === source.objective && canonicalDigest(goalTarget) === binding.goalTargetDigest &&
        binding.goalTargetRef.digest === binding.goalTargetDigest, "DRIFT");
      const definition = store.readProjectDefinition(access.scope, binding.projectDefinitionRef.id, binding.projectDefinitionRef.version);
      requireSemantic(isRecord(definition), "MATERIAL_INVALID");
      const normalized = normalizeEvolutionProjectDefinition(definition as unknown as EvolutionProjectDefinition);
      requireSemantic(same(definition, normalized) && normalized.metadata.id === binding.projectDefinitionRef.id &&
        normalized.metadata.version === binding.projectDefinitionRef.version && normalized.digest === binding.projectDefinitionRef.digest &&
        normalized.digest === binding.projectDefinitionDigest, "DIGEST_MISMATCH");
      const scope = {...access.scope, goalId: identity.goalId, targetId: identity.targetId};
      // Terminal validation uses the actual settled historical run, never a
      // synthetic pending request or a temporary rollback of Lifecycle status.
      const terminal = input.terminal ? owners.lifecycle.readSemanticTerminal?.(runId, scope) : undefined;
      if (input.terminal) requireSemantic(terminal && terminal.run.semanticStageCompletions?.some(p => p.sourceRequestDigest === requestDigest), "UNAVAILABLE");
      const pending = terminal ? {lifecycle: {...terminal.run.revision.ref, digest: terminal.run.revision.digest},
        harness: {...terminal.run.binding!.harnessBundle, harnessExecutionBindingDigest: terminal.run.binding!.harnessExecutionBindingDigest}}
        : owners.lifecycle.readPendingExecution(runId, requestDigest, scope);
      const revision = terminal?.run.revision ?? owners.lifecycle.readPendingRevision(runId, requestDigest, scope);
      requireSemantic(same(pending.lifecycle, {...revision.ref, digest: revision.digest}) && same(binding.lifecycleRef, pending.lifecycle) &&
        pending.harness.harnessExecutionBindingDigest === binding.digest && pending.harness.id === binding.bundleRef.id &&
        pending.harness.version === binding.bundleRef.version && pending.harness.digest === binding.bundleRef.digest &&
        pending.harness.catalogId === binding.catalogId, "DRIFT");
      return {access, source, binding, definition: normalized, pending, revision};
    }
    try {
      const before = local();
      requireSemantic(configuration.registryConfigPath && configuration.policyPath, "TRUST_REQUIRED");
      const snapshot = await readVerifiedSemanticCatalog({registryConfigPath: configuration.registryConfigPath, policyPath: configuration.policyPath,
        catalogId: before.binding.catalogId, limits: configuration.limits, signal: input.signal, currentSubject: () => {
          const access = subject(); requireSemantic(same(access, before.access), "DRIFT");
          return {scope: access.scope, role: access.principal.role, active: true};
        }});
      const {binding, definition, revision} = before;
      function material(digest: string, kind: string) {
        const entries = snapshot.generation.entries.filter(entry => entry.objectDigest === digest && entry.kind === kind && same(entry.scope, before.access.scope));
        requireSemantic(entries.length === 1, "MATERIAL_MISSING"); const entry = entries[0], value = snapshot.materials.get(entry.path);
        requireSemantic(isRecord(value), "MATERIAL_INVALID");
        return {...value, catalogRef: {catalogId: snapshot.catalogId, catalogSource: "verified-semantic-catalog",
          catalogDigest: snapshot.verification.legacyCatalogDigest as string, entryPath: entry.path, entryDigest: entry.objectDigest,
          registryDigest: snapshot.registryDigest}};
      }
      const bundle = material(binding.bundleRef.digest, "HarnessBundle") as unknown as HarnessBundleAssetV3;
      const profile = material(bundle.spec.profile.digest, "HarnessProfile") as unknown as HarnessProfileAssetV3;
      const components = bundle.spec.resolvedComponents.map(ref => material(ref.digest, "HarnessComponent") as unknown as HarnessComponentAssetV3);
      const [candidate] = publishedHarnessCandidatesV5({profiles: [profile], bundles: [bundle], components});
      requireSemantic(candidate?.published && candidate.eligible, "MATERIAL_INVALID");
      const obligations = revision.definition.obligations ?? {};
      const composition = composeHarnessAndLifecycle(candidate.bundle, {lifecycleId: revision.ref.id, lifecycleVersion: revision.ref.version,
        lifecycleDigest: revision.digest, requiredEvidence: obligations.requiredEvidence ?? [], validators: obligations.validators ?? [],
        constraints: obligations.constraints ?? [], capabilities: revision.definition.capabilities ?? [], requestedPermissions: obligations.requestedPermissions ?? [],
        disabledHarnessEvidence: obligations.disabledHarnessEvidence, disabledHarnessValidators: obligations.disabledHarnessValidators,
        weakenedHarnessConstraints: obligations.weakenedHarnessConstraints});
      requireSemantic(composition.status === "COMPOSED", "DRIFT");
      const actual: Material = {projectDefinitionDigest: definition.digest, goalTargetDigest: canonicalDigest(goalTarget),
        registryDigest: snapshot.registryDigest, catalogDigests: {[snapshot.catalogId]: snapshot.verification.legacyCatalogDigest as string},
        profiles: [{id: profile.metadata.id, version: profile.metadata.version, digest: profile.catalogRef!.entryDigest}],
        bundles: [{id: bundle.metadata.id, version: bundle.metadata.version, digest: bundle.catalogRef!.entryDigest,
          componentDigests: [...new Set(bundle.spec.resolvedComponents.map(ref => ref.digest))].sort()}],
        lifecycleDigest: revision.digest, compositionDigest: composition.digest};
      const expected: Material = {projectDefinitionDigest: binding.projectDefinitionDigest, goalTargetDigest: binding.goalTargetDigest,
        registryDigest: binding.registryDigest, catalogDigests: {[binding.catalogId]: binding.catalogDigest}, profiles: [binding.profileRef],
        bundles: [{...binding.bundleRef, componentDigests: [...binding.bundleRef.componentDigests].sort()}],
        lifecycleDigest: binding.lifecycleRef.digest, compositionDigest: binding.compositionDigest};
      requireSemantic(same(actual, expected) && same(before, local()), "DRIFT");
      const content = {schema: "evopilot-semantic-harness-material-source/v1", scope: before.access.scope, identity,
        runId, requestDigest, runtimeSourcePins: before.source.pins, material: actual,
        catalog: {generationDigest: snapshot.generation.generationDigest, pointerDigest: snapshot.pointer.pointerDigest,
          receiptDigest: snapshot.receipt.receiptDigest, legacyMarkdownDigest: snapshot.verification.legacyMarkdownDigest},
        status: "MATERIAL_REVALIDATED_NOT_EXECUTION_AUTHORIZED", eligibleForExecution: false,
        authority: {mayActivate: false, mayApprove: false, mayDispatch: false, mayCompleteGoal: false, mayPublish: false}};
      return freeze({...content, sourceDigest: digestObject(content)});
    } catch (error) {
      if (error instanceof SemanticCatalogError) throw error;
      throw redactSemanticError(error);
    }
  }});
}
