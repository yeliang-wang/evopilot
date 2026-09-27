import {createSemanticGovernedSourceReader, type SemanticGovernedSourceRefs} from "./semantic-governed-sources.js";
import {createSemanticPermissionSourceReader} from "./semantic-permission-sources.js";
import {semanticProjectAccess, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import {semanticExecutionImplementationDigest} from "./semantic-execution-application.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";

/** Explicit source selection for a future semantic run, not a permission grant.
 * Resolve the same active owners consumed by semantic preparation. Legacy plans
 * retain their request-authority context when no semantic sources are selected.
 */
export function semanticPlanningGovernance(dataRoot: string, body: Record<string, any>, projectId: string,
  currentAccess: () => SemanticDiscoveryAccess) {
  requireSemantic(isRecord(body.semanticGovernedSources), "INVALID");
  const refs = structuredClone(body.semanticGovernedSources) as SemanticGovernedSourceRefs;
  const subject = semanticProjectAccess(projectId, currentAccess());
  const sources = createSemanticGovernedSourceReader(dataRoot);
  const pins = sources.read(refs, subject.scope);
  const permissions = createSemanticPermissionSourceReader(dataRoot).read({projectId, refs: {policy: refs.policy, authority: refs.authority}, currentAccess});
  const executor = body.executor;
  requireSemantic(isRecord(executor) && isRecord(executor.sandbox) && executor.sandbox.permissionMode === "HOST_MANAGED_DENY_UNDECLARED" &&
    Array.isArray(executor.allowedEffects) && Array.isArray(executor.capabilities) &&
    executor.allowedEffects.every((v: unknown) => typeof v === "string" && permissions.permissions.allowedEffects.includes(v)) &&
    executor.capabilities.every((v: unknown) => typeof v === "string" && permissions.permissions.capabilities.includes(v)), "PERMISSION_DENIED");
  for (const slot of ["policy", "authority"] as const)
    requireSemantic(pins.resources[slot].activationDigest === permissions.pins[slot].activationDigest, "DRIFT");
  const resources = pins.resources;
  const result = {policyDigest: resources.policy.digest, providerDigest: resources.provider.digest,
    environmentDigest: resources.environment.digest, authorityDigest: resources.authority.digest,
    evidenceDigest: resources.evidence.digest, runtimeDigest: semanticExecutionImplementationDigest};
  for (const [key, value] of Object.entries(result))
    requireSemantic(!Object.hasOwn(body, key) || body[key] === value, "DRIFT");
  requireSemantic(digestObject(pins) === digestObject(sources.read(refs, subject.scope)) &&
    digestObject(subject) === digestObject(semanticProjectAccess(projectId, currentAccess())), "DRIFT");
  return result;
}
