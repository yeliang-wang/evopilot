import {canonicalDigest, normalizeGovernedResource, normalizeExecutionRuntimeProfile, qualifyExecutionRuntimeProfile,
  type ExecutionRuntimeProfile, type ExecutionRuntimeQualification} from "@evopilot/core";
import type {LifecycleExecutorBinding} from "../domains/lifecycle/types.js";
import type {EvoPilotAgentRuntimeProfileV1} from "@evopilot/contracts";
import {assertSemanticAgentProfile} from "./semantic-agent-profile.js";
import {SemanticRuntimeSourceStore} from "../storage/semantic-runtime-source.js";
import {requireSemantic, SemanticCatalogError, type SemanticScope} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {semanticProjectAccess, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import type {SemanticExecutionIdentity, SemanticExecutionState} from "./semantic-execution-binding.js";

export interface SemanticExecutorSourceRef {id: string; version: string; digest: string}
interface Observation {
  schema: "evopilot-semantic-executor-observation/v1";
  scope: SemanticScope;
  identity: SemanticExecutionIdentity;
  status: "READY" | "REVOKED";
  principalId: string;
  observedAt: string;
  validUntil: string;
  observedBy: string;
  evidenceRefs: string[];
  runtime: {name: string; version: string};
  profile: ExecutionRuntimeProfile;
  adapterProfile?: EvoPilotAgentRuntimeProfileV1;
  qualification: ExecutionRuntimeQualification;
  executor: LifecycleExecutorBinding;
  environment: {status: "READY" | "BLOCKED" | "UNKNOWN"; digest: string; workspaceRef: string; evidenceRefs: string[]};
  governance: {policyDigest: string; providerDigest: string; authorityDigest: string; runtimeDigest: string; evidenceDigest: string};
  permissionCeiling: {allowedEffects: string[]; capabilities: string[]};
  digest: string;
}
export interface SemanticExecutorSourcePins {
  schema: "evopilot-semantic-executor-source-pins/v1";
  scope: SemanticScope;
  resource: SemanticExecutorSourceRef;
  activationDigest: string;
  observationDigest: string;
  observedAt: string;
  validUntil: string;
  runtime: {name: string; version: string};
}
const hash = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 2048;
const list = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 128 && value.every(text) && new Set(value).size === value.length;
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
function fields(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  requireSemantic(isRecord(value) && Object.keys(value).sort().join() === keys.sort().join(), "INVALID");
}
function validity(observedAt: unknown, validUntil: unknown, now: number) {
  requireSemantic(typeof observedAt === "string" && typeof validUntil === "string" &&
    Number.isFinite(now) && Number.isFinite(Date.parse(observedAt)) && Number.isFinite(Date.parse(validUntil)), "INVALID");
  requireSemantic(Date.parse(observedAt) <= now && now < Date.parse(validUntil), "UNAVAILABLE");
}
export function validateSemanticExecutorSourcePins(pins: SemanticExecutorSourcePins, scope: SemanticScope) {
  fields(pins, ["schema", "scope", "resource", "activationDigest", "observationDigest", "observedAt", "validUntil", "runtime"]);
  requireSemantic(pins.schema === "evopilot-semantic-executor-source-pins/v1" && same(pins.scope, scope) &&
    hash(pins.activationDigest) && hash(pins.observationDigest), "INVALID");
  fields(pins.resource, ["id", "version", "digest"]); fields(pins.runtime, ["name", "version"]);
  requireSemantic(text(pins.resource.id) && text(pins.resource.version) && hash(pins.resource.digest) &&
    text(pins.runtime.name) && text(pins.runtime.version), "INVALID");
  // Current validity is checked by the live owner read, not by a historical pin.
  requireSemantic(Number.isFinite(Date.parse(pins.observedAt)) && Date.parse(pins.observedAt) < Date.parse(pins.validUntil), "INVALID");
}

/** Read a Runtime-owned, explicitly activated observation. This does not create
 * qualification evidence, probe a Host, resolve credentials or authorize dispatch.
 * A public observation writer and a live observation collector are not provided.
 */
export function createSemanticExecutorSourceReader(dataRoot: string, now: () => number = Date.now) {
  const store = new SemanticRuntimeSourceStore(dataRoot);
  return Object.freeze({read(ref: SemanticExecutorSourceRef, identity: SemanticExecutionIdentity, scope: SemanticScope, principalId: string) {
    fields(ref, ["id", "version", "digest"]);
    requireSemantic(hash(ref.digest) && text(principalId) && scope.projectId === identity.projectId, "INVALID");
    try {
      const active = store.readGovernedResource(scope, "AgentRuntimeProfile", ref.id);
      requireSemantic(isRecord(active) && active.schema === "evopilot-governed-resource-activation/v1" && active.kind === "AgentRuntimeProfile" &&
        active.resourceId === ref.id && active.version === ref.version && active.resourceDigest === ref.digest, "DRIFT");
      const {digest: activationDigest, ...receipt} = active;
      requireSemantic(hash(activationDigest) && canonicalDigest(receipt) === activationDigest &&
        ["explicit-activation", "explicit-rollback"].includes(String(active.reason)) && text(active.actor) && text(active.evidenceRef) &&
        typeof active.activatedAt === "string" && Number.isFinite(Date.parse(active.activatedAt)) && Date.parse(active.activatedAt) <= now(), "PERMISSION_DENIED");
      const raw = store.readGovernedResource(scope, "AgentRuntimeProfile", ref.id, ref.version);
      requireSemantic(isRecord(raw) && raw.digest === ref.digest, "DIGEST_MISMATCH");
      const resource = normalizeGovernedResource(raw);
      requireSemantic(resource.kind === "AgentRuntimeProfile" && resource.metadata.id === ref.id && resource.metadata.version === ref.version &&
        resource.digest === ref.digest && same(resource, raw), "DRIFT");
      fields(resource.spec, ["semanticObservation"]);
      const item = resource.spec.semanticObservation;
      fields(item, ["schema", "scope", "identity", "status", "principalId", "observedAt", "validUntil", "observedBy", "evidenceRefs",
        "runtime", "profile", "qualification", "executor", "environment", "governance", "permissionCeiling", "digest",
        ...(isRecord(item) && Object.hasOwn(item, "adapterProfile") ? ["adapterProfile"] : [])]);
      const observation = item as unknown as Observation, {digest: observationDigest, ...body} = observation;
      requireSemantic(observation.schema === "evopilot-semantic-executor-observation/v1" && hash(observationDigest) &&
        canonicalDigest(body) === observationDigest, "DIGEST_MISMATCH");
      requireSemantic(same(observation.scope, scope) && same(observation.identity, identity) && observation.principalId === principalId &&
        observation.status === "READY" && text(observation.observedBy) && list(observation.evidenceRefs) && observation.evidenceRefs.length > 0, "PERMISSION_DENIED");
      validity(observation.observedAt, observation.validUntil, now());
      fields(observation.runtime, ["name", "version"]);
      requireSemantic(text(observation.runtime.name) && text(observation.runtime.version), "INVALID");
      const profile = normalizeExecutionRuntimeProfile(observation.profile), qualification = observation.qualification, executor = observation.executor;
      if (observation.adapterProfile !== undefined) assertSemanticAgentProfile(observation.adapterProfile, profile, executor, observation.runtime);
      requireSemantic(hash(observation.profile.digest) && profile.digest === observation.profile.digest && qualification.status === "QUALIFIED" &&
        same(qualifyExecutionRuntimeProfile(profile, qualification.requiredCapabilities, qualification.evidenceRefs), qualification), "PERMISSION_DENIED");
      const {digest: executorDigest, ...executorBody} = executor;
      requireSemantic(hash(executorDigest) && canonicalDigest(executorBody) === executorDigest && text(executor.host) &&
        executor.agentRuntime.profileId === profile.id && executor.agentRuntime.profileVersion === profile.version &&
        executor.agentRuntime.profileDigest === (observation.adapterProfile?.digest ?? profile.digest) &&
        executor.agentRuntime.qualificationDigest === (observation.adapterProfile?.qualification.conformanceDigest ?? qualification.digest) &&
        text(executor.agentRuntime.adapterId) && executor.provider === profile.provider && executor.model === profile.model &&
        executor.sandbox.permissionMode === "HOST_MANAGED_DENY_UNDECLARED" && text(executor.sandbox.workspaceRef), "DRIFT");
      requireSemantic(list(executor.capabilities) && list(executor.allowedEffects) && list(executor.credentialRefs) &&
        executor.credentialRefs.every(ref => /^secret:\/\/[A-Za-z0-9._/-]+$/.test(ref)) &&
        executor.capabilities.every(capability => qualification.requiredCapabilities.includes(capability)), "PERMISSION_DENIED");
      fields(observation.environment, ["status", "digest", "workspaceRef", "evidenceRefs"]);
      requireSemantic(observation.environment.status === "READY" && hash(observation.environment.digest) &&
        observation.environment.workspaceRef === executor.sandbox.workspaceRef && list(observation.environment.evidenceRefs) &&
        observation.environment.evidenceRefs.length > 0, "UNAVAILABLE");
      fields(observation.governance, ["policyDigest", "providerDigest", "authorityDigest", "runtimeDigest", "evidenceDigest"]);
      requireSemantic(Object.values(observation.governance).every(hash), "INVALID");
      fields(observation.permissionCeiling, ["allowedEffects", "capabilities"]);
      requireSemantic(list(observation.permissionCeiling.allowedEffects) && list(observation.permissionCeiling.capabilities), "INVALID");
      requireSemantic(same(store.readGovernedResource(scope, "AgentRuntimeProfile", ref.id), active) &&
        same(store.readGovernedResource(scope, "AgentRuntimeProfile", ref.id, ref.version), raw), "DRIFT");
      validity(observation.observedAt, observation.validUntil, now());
      const pins: SemanticExecutorSourcePins = {schema: "evopilot-semantic-executor-source-pins/v1", scope: {...scope}, resource: {...ref}, activationDigest,
        observationDigest, observedAt: observation.observedAt, validUntil: observation.validUntil, runtime: observation.runtime};
      validateSemanticExecutorSourcePins(pins, scope);
      return freeze({pins, observation});
    } catch (error) {
      if (error instanceof SemanticCatalogError) throw error;
      throw new SemanticCatalogError("MATERIAL_INVALID");
    }
  }});
}

export function withSemanticExecutorSources(dataRoot: string, owners: {
  currentAccess: () => SemanticDiscoveryAccess;
  currentRef: (identity: SemanticExecutionIdentity) => SemanticExecutorSourceRef;
  currentExecution: (identity: SemanticExecutionIdentity) => SemanticExecutionState;
  now?: () => number;
}) {
  const reader = createSemanticExecutorSourceReader(dataRoot, owners.now);
  const read = (identity: SemanticExecutionIdentity) => {
    const subject = semanticProjectAccess(identity.projectId, owners.currentAccess());
    requireSemantic(["operator", "admin"].includes(subject.principal.role), "PERMISSION_DENIED");
    return {subject, ...reader.read(owners.currentRef({...identity}), identity, subject.scope, subject.principal.id)};
  };
  return (identity: SemanticExecutionIdentity): SemanticExecutionState => {
    const before = read(identity), state = structuredClone(owners.currentExecution({...identity})), after = read(identity);
    requireSemantic(same(before, after), "DRIFT");
    const observation = after.observation;
    requireSemantic(same(state.permissions.scope, after.subject.scope) && state.permissions.principalId === after.subject.principal.id, "PERMISSION_DENIED");
    requireSemantic(hash(state.permissions.revisionDigest) && list(state.permissions.allowedEffects) && list(state.permissions.capabilities), "INVALID");
    requireSemantic(state.harness.environmentDigest === observation.environment.digest && state.harness.hostDigest === observation.executor.digest &&
      Object.entries(observation.governance).every(([key, value]) => state.harness[key as keyof typeof state.harness] === value), "DRIFT");
    // An observation is a ceiling, not a grant. Live access can only narrow it.
    const permissions = {...state.permissions,
      allowedEffects: state.permissions.allowedEffects.filter(item => observation.permissionCeiling.allowedEffects.includes(item)),
      capabilities: state.permissions.capabilities.filter(item => observation.permissionCeiling.capabilities.includes(item)),
      revisionDigest: digestObject({current: state.permissions.revisionDigest, observation: observation.digest})};
    requireSemantic(observation.executor.allowedEffects.every(item => permissions.allowedEffects.includes(item)) &&
      observation.executor.capabilities.every(item => permissions.capabilities.includes(item)), "PERMISSION_DENIED");
    return {...state, executorSourcePins: after.pins, executor: observation.executor, agentRuntime: observation.profile,
      agentAdapterProfile: observation.adapterProfile,
      qualification: observation.qualification, permissions};
  };
}
