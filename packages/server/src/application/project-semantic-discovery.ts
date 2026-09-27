import {readVerifiedSemanticCatalog} from "../domains/harness-template/semantic-catalog-consumer.js";
import {requireSemantic, type SemanticCatalogLimits} from "../domains/harness-template/semantic-catalog-contract.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {canonicalJson, digestObject} from "../domains/harness-template/utils.js";
import type {StoredProject, AuthRole} from "../model.js";
import {evaluateProjectSemanticCompatibility} from "../domains/harness-template/semantic-compatibility.js";
import {projectSemanticGap} from "./project-semantic-gap.js";

export interface SemanticPrincipal {id: string; role: AuthRole; tenantId: string; workspaceId: string}
export interface SemanticDiscoveryAccess {
  principal?: SemanticPrincipal;
  project?: Pick<StoredProject, "id" | "tenantId" | "workspaceId" | "profileId" | "updatedAt">;
}
export const semanticRequestId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);

export function semanticProjectAccess(projectId: string, access: SemanticDiscoveryAccess) {
  requireSemantic(semanticRequestId(projectId), "SCOPE_INVALID");
  const {principal, project} = access;
  requireSemantic(principal && project && typeof principal.id === "string" && principal.id.length > 0 && principal.id.length <= 256 &&
    ["viewer", "operator", "admin"].includes(principal.role), "PERMISSION_DENIED");
  requireSemantic(project.id === projectId && principal.tenantId === project.tenantId && principal.workspaceId === project.workspaceId, "PERMISSION_DENIED");
  requireSemantic(typeof project.profileId === "string" && typeof project.updatedAt === "string", "SCOPE_INVALID");
  const scope = {tenantId: project.tenantId, workspaceId: project.workspaceId, projectId};
  requireSemantic(Object.values(scope).every(semanticRequestId), "SCOPE_INVALID");
  return freeze({principal: {...principal}, scope, projectRevisionDigest: digestObject({scope, profileId: project.profileId, updatedAt: project.updatedAt})});
}

/** Trusted server composition owns configuration and current access resolution.
 * A request can select identities only, not paths, policy, limits or validators.
 * The digest is discovery evidence, NOT a ProjectSemanticBinding or approval.
 */
export function createProjectSemanticDiscoveryService(configuration: {
  registryConfigPath?: string; policyPath?: string; limits?: Partial<SemanticCatalogLimits>;
}) {
  const configured = Object.freeze({...configuration, ...(configuration.limits ? {limits: Object.freeze({...configuration.limits})} : {})});
  async function read(input: {
    projectId: string; catalogId: string; currentAccess: () => SemanticDiscoveryAccess | Promise<SemanticDiscoveryAccess>; signal?: AbortSignal;
  }) {
    requireSemantic(semanticRequestId(input.projectId) && semanticRequestId(input.catalogId), "SCOPE_INVALID");
    let original: string | undefined;
    let projectRevisionDigest: string | undefined;
    const currentSubject = async () => {
      const {principal, scope, projectRevisionDigest: revision} = semanticProjectAccess(input.projectId, await input.currentAccess());
      const identity = canonicalJson({principal, revision});
      if (original !== undefined) requireSemantic(original === identity, "DRIFT");
      original = identity; projectRevisionDigest = revision;
      return {scope, role: principal.role, active: true};
    };
    requireSemantic(configured.registryConfigPath && configured.policyPath, "TRUST_REQUIRED");
    const snapshot = await readVerifiedSemanticCatalog({registryConfigPath: configured.registryConfigPath, policyPath: configured.policyPath,
      catalogId: input.catalogId, limits: configured.limits, signal: input.signal, currentSubject});
    const groups = snapshot.generation.sets;
    requireSemantic(Array.isArray(groups), "MATERIAL_MISSING");
    return {snapshot, groups, projectRevisionDigest};
  }
  function compatibilityReport(snapshot: Awaited<ReturnType<typeof read>>["snapshot"], set: Awaited<ReturnType<typeof read>>["groups"][number], bundleDigest: string) {
    function material(digest: unknown, kind: string) {
      const entry = snapshot.generation.entries.find(item => item.objectDigest === digest && item.kind === kind && canonicalJson(item.scope) === canonicalJson(set.scope));
      requireSemantic(entry, "MATERIAL_MISSING"); return snapshot.materials.get(entry.path);
    }
    return evaluateProjectSemanticCompatibility({scope: set.scope, artifactSet: material(set.refs.artifactSet, "ProjectOntologyArtifactSet"),
      bundle: material(bundleDigest, "HarnessBundle"), reasoningProfile: material(set.refs.profile, "OntologyReasoningProfile")});
  }
  async function compatibility(input: Parameters<typeof read>[0] & {artifactSetDigest: string; bundleDigest: string}) {
    requireSemantic([input.artifactSetDigest, input.bundleDigest].every(value => /^sha256:[a-f0-9]{64}$/.test(value)), "INVALID");
    const {snapshot, groups, projectRevisionDigest} = await read(input);
    const selected = groups.filter(set => set.refs.artifactSet === input.artifactSetDigest &&
      (set.refs.harnessAssets as {ref: string}[]).some(asset => asset.ref === input.bundleDigest));
    requireSemantic(selected.length === 1, selected.length ? "IDENTITY_CONFLICT" : "UNAVAILABLE");
    const set = selected[0], report = compatibilityReport(snapshot, set, input.bundleDigest);
    const result = {schema: "evopilot-project-semantic-compatibility-inspect/v1", projectId: input.projectId, projectRevisionDigest,
      catalogId: snapshot.catalogId, registryDigest: snapshot.registryDigest, policyDigest: snapshot.policyDigest,
      generationDigest: snapshot.generation.generationDigest, pointerDigest: snapshot.pointer.pointerDigest,
      closureDigest: set.refs.closure, report, eligibleForExecution: false, bindingCreated: false};
    return freeze({...result, inspectionDigest: digestObject(result)});
  }
  return Object.freeze({compatibility, async gap(input: Parameters<typeof compatibility>[0]) {
    input = {...input};
    const original = semanticProjectAccess(input.projectId, await input.currentAccess());
    const inspection = await compatibility(input);
    requireSemantic(!input.signal?.aborted, "CANCELLED");
    requireSemantic(digestObject(original) === digestObject(semanticProjectAccess(input.projectId, await input.currentAccess())) &&
      original.projectRevisionDigest === inspection.projectRevisionDigest, "DRIFT");
    requireSemantic(!input.signal?.aborted, "CANCELLED");
    requireSemantic(canonicalJson(original.scope) === canonicalJson(inspection.report.scope), "PERMISSION_DENIED");
    return projectSemanticGap(inspection.report, {projectId: input.projectId, projectRevisionDigest: original.projectRevisionDigest,
      catalogId: input.catalogId, inspectionDigest: inspection.inspectionDigest});
  }, async inspect(input: Parameters<typeof read>[0]) {
    const {snapshot, groups, projectRevisionDigest} = await read(input);
    const bySet = new Map(groups.map(group => [canonicalJson([group.scope, group.refs.artifactSet, group.refs.closure]), group]));
    const bundles = new Map(snapshot.generation.entries.filter(entry => entry.kind === "HarnessBundle")
      .map(entry => [canonicalJson([entry.scope, entry.objectDigest]), entry]));
    // Explicit allowlist: no root paths, material bodies, Skill prose, publication
    // actors, permission grants or executable content leave this endpoint.
    const sets = snapshot.verification.sets.map(set => ({scope: set.scope, artifactSetDigest: set.artifactSetDigest,
      snapshotDigest: set.snapshotDigest, skillDigest: set.skillDigest, closureDigest: set.closureDigest,
      harnessBundles: (bySet.get(canonicalJson([set.scope, set.artifactSetDigest, set.closureDigest]))!.refs.harnessAssets as {ref: string}[])
        .flatMap(asset => {const entry = bundles.get(canonicalJson([set.scope, asset.ref]));
          return entry ? [{id: entry.id, version: entry.version, digest: entry.objectDigest}] : [];})}));
    const result = {schema: "evopilot-project-semantic-discovery/v1", status: "VERIFIED_DISCOVERY_ONLY",
      projectId: input.projectId, projectRevisionDigest, catalogId: snapshot.catalogId,
      registryDigest: snapshot.registryDigest, policyDigest: snapshot.policyDigest, pointerDigest: snapshot.pointer.pointerDigest,
      generationDigest: snapshot.generation.generationDigest, receiptDigest: snapshot.receipt.receiptDigest,
      legacyCatalogDigest: snapshot.verification.legacyCatalogDigest, sets, limits: snapshot.limits,
      eligibleForExecution: false, bindingCreated: false, limitations: snapshot.verification.limitations,
      nextAction: "review-project-semantic-compatibility", pending: ["project-and-execution-binding", "full-variant-and-acceptance-matrix"]};
    return freeze({...result, discoveryDigest: digestObject(result)});
  }, async onboardingCandidates(input: Parameters<typeof read>[0]) {
    const started = performance.now(), {snapshot, groups, projectRevisionDigest} = await read(input);
    const state = semanticProjectAccess(input.projectId, await input.currentAccess());
    requireSemantic(state.projectRevisionDigest === projectRevisionDigest, "DRIFT");
    const bundles = new Map(snapshot.generation.entries.filter(e => e.kind === "HarnessBundle").map(e => [canonicalJson([e.scope, e.objectDigest]), e]));
    const pairs: {set: typeof groups[number]; entry: typeof snapshot.generation.entries[number]}[] = [];
    // A bounded onboarding preview is not a cross-Catalog search or arbitrary
    // ranking engine. Never truncate and silently call the first match unique.
    for (const set of groups) {
      if (canonicalJson(set.scope) !== canonicalJson(state.scope)) continue;
      for (const asset of set.refs.harnessAssets as {ref: string}[]) {
        requireSemantic(!input.signal?.aborted, "CANCELLED");
        requireSemantic(performance.now() - started <= snapshot.limits.readTimeoutMilliseconds, "TIMEOUT");
        const entry = bundles.get(canonicalJson([set.scope, asset.ref]));
        if (entry) {requireSemantic(pairs.length < 64, "ENTRY_LIMIT"); pairs.push({set, entry});}
      }
    }
    const candidates = pairs.map(({set, entry}) => {
      requireSemantic(!input.signal?.aborted, "CANCELLED");
      requireSemantic(performance.now() - started <= snapshot.limits.readTimeoutMilliseconds, "TIMEOUT");
      const report = compatibilityReport(snapshot, set, entry.objectDigest);
      return {artifactSetDigest: report.artifactSetDigest as string, bundleDigest: entry.objectDigest,
        bundleId: report.bundleRef.id, bundleVersion: report.bundleRef.version, closureDigest: set.refs.closure as string,
        status: report.status, reasons: report.reasons, compatibilityDigest: report.compatibilityDigest};
    }).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
    requireSemantic(new Set(candidates.map(c => canonicalJson([c.artifactSetDigest, c.bundleDigest]))).size === candidates.length, "IDENTITY_CONFLICT");
    requireSemantic(!input.signal?.aborted, "CANCELLED");
    requireSemantic(performance.now() - started <= snapshot.limits.readTimeoutMilliseconds, "TIMEOUT");
    requireSemantic(digestObject(state) === digestObject(semanticProjectAccess(input.projectId, await input.currentAccess())), "DRIFT");
    const result = {schema: "evopilot-project-semantic-onboarding-candidates/v1", projectId: input.projectId, projectRevisionDigest,
      catalogId: snapshot.catalogId, generationDigest: snapshot.generation.generationDigest, policyDigest: snapshot.policyDigest,
      registryDigest: snapshot.registryDigest, candidates, maximumCandidates: 64};
    return freeze({...result, candidatesDigest: digestObject(result)});
  }});
}
