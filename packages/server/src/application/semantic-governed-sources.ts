import {canonicalDigest, normalizeGovernedResource} from "@evopilot/core";
import {SemanticRuntimeSourceStore} from "../storage/semantic-runtime-source.js";
import {requireSemantic, SemanticCatalogError, type SemanticScope} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {semanticProjectAccess, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import type {SemanticExecutionIdentity, SemanticExecutionState} from "./semantic-execution-binding.js";

const kinds = {policy: "PolicyPack", provider: "ActionProviderDefinition", environment: "EnvironmentBinding",
  authority: "HumanAuthorityRole", evidence: "GovernancePack"} as const;
type Slot = keyof typeof kinds;
type ResourceRef = {id: string; version: string; digest: string};
export type SemanticGovernedSourceRefs = {[K in Slot]: ResourceRef};
export interface SemanticGovernedSourcePins {
  schema: "evopilot-semantic-governed-source-pins/v1";
  scope: SemanticScope;
  resources: {[K in Slot]: ResourceRef & {kind: typeof kinds[K]; activationDigest: string}};
}
const hash = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
function refs(value: SemanticGovernedSourceRefs) {
  requireSemantic(isRecord(value) && Object.keys(value).sort().join() === Object.keys(kinds).sort().join(), "INVALID");
  for (const ref of Object.values(value)) requireSemantic(isRecord(ref) && Object.keys(ref).sort().join() === "digest,id,version" &&
    text(ref.id) && text(ref.version) && hash(ref.digest), "INVALID");
}
export function validateSemanticGovernedSourcePins(value: SemanticGovernedSourcePins, scope: SemanticScope) {
  requireSemantic(isRecord(value) && Object.keys(value).sort().join() === "resources,schema,scope" &&
    value.schema === "evopilot-semantic-governed-source-pins/v1" && digestObject(value.scope) === digestObject(scope) &&
    isRecord(value.resources) && Object.keys(value.resources).sort().join() === Object.keys(kinds).sort().join(), "INVALID");
  for (const slot of Object.keys(kinds) as Slot[]) {
    const item = value.resources[slot];
    requireSemantic(isRecord(item) && Object.keys(item).sort().join() === "activationDigest,digest,id,kind,version" &&
      item.kind === kinds[slot] && text(item.id) && text(item.version) && hash(item.digest) && hash(item.activationDigest), "INVALID");
  }
}

/** Current metadata, not a policy evaluator or permission grant. Exact resource
 * and activation records are read from the Runtime-owned scoped store. No generic
 * latest-version fallback, provider invocation, credential resolution or writes.
 */
export function createSemanticGovernedSourceReader(dataRoot: string) {
  const store = new SemanticRuntimeSourceStore(dataRoot);
  return Object.freeze({read(input: SemanticGovernedSourceRefs, scope: SemanticScope): SemanticGovernedSourcePins {
    refs(input);
    requireSemantic([scope.tenantId, scope.workspaceId, scope.projectId].every(value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)), "SCOPE_INVALID");
    const selected = structuredClone(input), observations: {kind: string; id: string; version?: string; raw: unknown}[] = [];
    const resources = {} as SemanticGovernedSourcePins["resources"];
    try {
      for (const slot of Object.keys(kinds) as Slot[]) {
        const ref = selected[slot], kind = kinds[slot];
        const active = store.readGovernedResource(scope, kind, ref.id);
        requireSemantic(isRecord(active) && active.schema === "evopilot-governed-resource-activation/v1" &&
          active.kind === kind && active.resourceId === ref.id && active.version === ref.version && active.resourceDigest === ref.digest, "DRIFT");
        const {digest: activationDigest, ...activation} = active;
        requireSemantic(hash(activationDigest) && canonicalDigest(activation) === activationDigest &&
          text(active.actor) && text(active.evidenceRef) && text(active.reason) &&
          typeof active.activatedAt === "string" && Number.isFinite(Date.parse(active.activatedAt)), "DIGEST_MISMATCH");
        const raw = store.readGovernedResource(scope, kind, ref.id, ref.version);
        requireSemantic(isRecord(raw) && raw.digest === ref.digest, "DIGEST_MISMATCH");
        const resource = normalizeGovernedResource(raw);
        requireSemantic(resource.kind === kind && resource.metadata.id === ref.id && resource.metadata.version === ref.version &&
          resource.digest === ref.digest && canonicalDigest(resource) === canonicalDigest(raw), "DRIFT");
        observations.push({kind, id: ref.id, raw: active}, {kind, id: ref.id, version: ref.version, raw});
        // The mapped assignment retains the finite slot/kind pairing validated above.
        Object.assign(resources, {[slot]: {...ref, kind, activationDigest}});
      }
      for (const item of observations) requireSemantic(digestObject(store.readGovernedResource(scope, item.kind, item.id, item.version)) === digestObject(item.raw), "DRIFT");
      const pins: SemanticGovernedSourcePins = {schema: "evopilot-semantic-governed-source-pins/v1", scope: {...scope}, resources};
      validateSemanticGovernedSourcePins(pins, scope);
      return freeze(pins);
    } catch (error) {
      if (error instanceof SemanticCatalogError) throw error;
      // Do not expose private resource spec, source paths or core exception text.
      throw new SemanticCatalogError("MATERIAL_INVALID");
    }
  }});
}

/** Supply current governance metadata to the binding kernel. Other owners must
 * still supply current qualification, executor, runtime identity and effective
 * permissions. These resource digests never prove those capabilities or rights.
 */
export function withSemanticGovernedSources(dataRoot: string, owners: {
  currentAccess: () => SemanticDiscoveryAccess;
  currentRefs: (identity: SemanticExecutionIdentity) => SemanticGovernedSourceRefs;
  currentExecution: (identity: SemanticExecutionIdentity) => SemanticExecutionState;
}) {
  const reader = createSemanticGovernedSourceReader(dataRoot);
  const read = (identity: SemanticExecutionIdentity) => {
    const subject = semanticProjectAccess(identity.projectId, owners.currentAccess());
    requireSemantic(["operator", "admin"].includes(subject.principal.role), "PERMISSION_DENIED");
    return {subject, pins: reader.read(owners.currentRefs({...identity}), subject.scope)};
  };
  return (identity: SemanticExecutionIdentity): SemanticExecutionState => {
    const before = read(identity), state = structuredClone(owners.currentExecution({...identity})), after = read(identity);
    requireSemantic(digestObject(before) === digestObject(after), "DRIFT");
    requireSemantic(digestObject(state.permissions.scope) === digestObject(after.subject.scope) &&
      state.permissions.principalId === after.subject.principal.id, "PERMISSION_DENIED");
    const resources = after.pins.resources;
    return {...state, governedSourcePins: after.pins, harness: {...state.harness,
      policyDigest: resources.policy.digest, providerDigest: resources.provider.digest, environmentDigest: resources.environment.digest,
      authorityDigest: resources.authority.digest, evidenceDigest: resources.evidence.digest}};
  };
}
