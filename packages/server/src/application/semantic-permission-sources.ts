import {canonicalDigest, normalizeGovernedResource} from "@evopilot/core";
import {SemanticRuntimeSourceStore} from "../storage/semantic-runtime-source.js";
import {requireSemantic, SemanticCatalogError} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {semanticProjectAccess, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import type {SemanticGovernedSourceRefs} from "./semantic-governed-sources.js";

type Ref = SemanticGovernedSourceRefs["policy"];
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 256;
const hash = (value: unknown) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const effects = ["READ_ONLY", "REVERSIBLE", "EXTERNAL", "IRREVERSIBLE"];
function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  requireSemantic(isRecord(value) && Object.keys(value).sort().join() === [...keys].sort().join(), "INVALID");
}
function strings(value: unknown): asserts value is string[] {
  requireSemantic(Array.isArray(value) && value.length <= 128 && value.every(text) && new Set(value).size === value.length, "INVALID");
}

/** Finite Runtime permission policy, not a script/Pack interpreter. Policy and
 * principal grant must both be explicitly activated and current. This read does
 * not approve a Lifecycle stage, resolve credentials, or authorize publication.
 * Missing declarations and wildcard/default grants are never inferred.
 */
export function createSemanticPermissionSourceReader(dataRoot: string, now: () => number = Date.now) {
  const store = new SemanticRuntimeSourceStore(dataRoot);
  function readOne(kind: "PolicyPack" | "HumanAuthorityRole", ref: Ref, subject: ReturnType<typeof semanticProjectAccess>, instant: number) {
    exact(ref, ["id", "version", "digest"]); requireSemantic(text(ref.id) && text(ref.version) && hash(ref.digest), "INVALID");
    const active = store.readGovernedResource(subject.scope, kind, ref.id);
    requireSemantic(isRecord(active) && active.schema === "evopilot-governed-resource-activation/v1" && active.kind === kind &&
      active.resourceId === ref.id && active.version === ref.version && active.resourceDigest === ref.digest, "DRIFT");
    const {digest: activationDigest, ...body} = active;
    requireSemantic(hash(activationDigest) && canonicalDigest(body) === activationDigest, "DIGEST_MISMATCH");
    requireSemantic(["explicit-activation", "explicit-rollback"].includes(String(active.reason)) && text(active.actor) && text(active.evidenceRef) &&
      typeof active.activatedAt === "string" && Number.isFinite(Date.parse(active.activatedAt)) && Date.parse(active.activatedAt) <= instant, "PERMISSION_DENIED");
    const raw = store.readGovernedResource(subject.scope, kind, ref.id, ref.version);
    requireSemantic(isRecord(raw) && raw.digest === ref.digest, "DIGEST_MISMATCH");
    const resource = normalizeGovernedResource(raw);
    requireSemantic(resource.kind === kind && resource.metadata.id === ref.id && resource.metadata.version === ref.version &&
      resource.digest === ref.digest && same(resource, raw), "DRIFT");
    const grant = kind === "HumanAuthorityRole", value = resource.spec.semanticExecution;
    exact(value, ["schema", "scope", "status", "roles", "allowedEffects", "capabilities", "deniedEffects", "deniedCapabilities", "validFrom", "validUntil", ...(grant ? ["principalId"] : [])]);
    requireSemantic(value.schema === (grant ? "evopilot-semantic-permission-grant/v1" : "evopilot-semantic-permission-policy/v1") &&
      same(value.scope, subject.scope) && value.status === "ACTIVE", "PERMISSION_DENIED");
    requireSemantic(typeof value.validFrom === "string" && typeof value.validUntil === "string" &&
      Number.isFinite(Date.parse(value.validFrom)) && Number.isFinite(Date.parse(value.validUntil)) &&
      Date.parse(value.validFrom) <= instant && instant < Date.parse(value.validUntil), "PERMISSION_DENIED");
    for (const key of ["roles", "allowedEffects", "capabilities", "deniedEffects", "deniedCapabilities"] as const) strings(value[key]);
    const roles = value.roles as string[], allowedEffects = value.allowedEffects as string[], deniedEffects = value.deniedEffects as string[];
    requireSemantic(roles.length > 0 && roles.every(role => ["operator", "admin"].includes(role)) && roles.includes(subject.principal.role), "PERMISSION_DENIED");
    requireSemantic([...allowedEffects, ...deniedEffects].every(effect => effects.includes(effect)) &&
      [...value.capabilities as string[], ...value.deniedCapabilities as string[]].every(capability => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(capability)), "INVALID");
    if (grant) requireSemantic(value.principalId === subject.principal.id, "PERMISSION_DENIED");
    return {kind, ref: {...ref}, active, raw, declaration: value, pin: {...ref, kind, activationDigest, declarationDigest: digestObject(value)}};
  }
  return Object.freeze({read(input: {projectId: string; refs: Pick<SemanticGovernedSourceRefs, "policy" | "authority">;
    currentAccess: () => SemanticDiscoveryAccess}) {
    try {
      const refs = structuredClone(input.refs); exact(refs, ["policy", "authority"]);
      const subject = semanticProjectAccess(input.projectId, input.currentAccess()), instant = now();
      requireSemantic(Number.isFinite(instant) && ["operator", "admin"].includes(subject.principal.role), "PERMISSION_DENIED");
      const policy = readOne("PolicyPack", refs.policy, subject, instant), grant = readOne("HumanAuthorityRole", refs.authority, subject, instant);
      const intersect = (key: "allowedEffects" | "capabilities", denied: "deniedEffects" | "deniedCapabilities") => {
        const a = policy.declaration[key] as string[], b = grant.declaration[key] as string[];
        const excluded = new Set([...policy.declaration[denied] as string[], ...grant.declaration[denied] as string[]]);
        return a.filter(item => b.includes(item) && !excluded.has(item)).sort();
      };
      const allowedEffects = intersect("allowedEffects", "deniedEffects"), capabilities = intersect("capabilities", "deniedCapabilities");
      const finalTime = now(); requireSemantic(Number.isFinite(finalTime) && finalTime >= instant, "DRIFT");
      for (const item of [policy, grant]) {
        requireSemantic(same(store.readGovernedResource(subject.scope, item.kind, item.ref.id), item.active) &&
          same(store.readGovernedResource(subject.scope, item.kind, item.ref.id, item.ref.version), item.raw), "DRIFT");
        requireSemantic(finalTime < Date.parse(item.declaration.validUntil as string), "PERMISSION_DENIED");
      }
      requireSemantic(same(subject, semanticProjectAccess(input.projectId, input.currentAccess())), "DRIFT");
      const pins = {schema: "evopilot-semantic-permission-source-pins/v1", scope: subject.scope, principal: subject.principal,
        policy: policy.pin, authority: grant.pin, evaluator: "finite-intersection-deny-overrides/v1", allowedEffects, capabilities};
      return freeze({pins, permissions: {scope: subject.scope, principalId: subject.principal.id, allowedEffects, capabilities,
        revisionDigest: digestObject(pins)}});
    } catch (error) {
      if (error instanceof SemanticCatalogError) throw error;
      throw new SemanticCatalogError("MATERIAL_INVALID");
    }
  }});
}
