import {canonicalJson, digestObject, digestText, isRecord} from "./utils.js";
import {requireSemantic, semanticContentPath, type SemanticEntry, type SemanticScope} from "./semantic-catalog-contract.js";
import type {SemanticSnapshot} from "./semantic-catalog-reader.js";
import {inspectSemanticDerivedMaterials} from "./semantic-derived-materials.js";

type Doc = Record<string, unknown>;
const obj = (value: unknown): Doc => {requireSemantic(isRecord(value), "MATERIAL_INVALID"); return value;};
const list = (value: unknown): unknown[] => {requireSemantic(Array.isArray(value), "MATERIAL_INVALID"); return value;};
const docs = (value: unknown) => list(value).map(obj);
const same = (a: unknown, b: unknown) => requireSemantic(a !== undefined && b !== undefined && canonicalJson(a) === canonicalJson(b), "MATERIAL_INVALID");
const signed = (core: Doc, field: string) => ({...core, [field]: digestObject(core)});
const text = (value: unknown) => {requireSemantic(typeof value === "string" && value.trim().length > 0 && value === value.trim(), "MATERIAL_INVALID"); return value as string;};
const hash = (value: unknown) => {requireSemantic(typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value), "MATERIAL_INVALID"); return value as string;};
const unique = (value: unknown) => [...new Set(list(value).map(item => String(item).trim()).filter(Boolean))].sort();
const version = (value: unknown) => {const result = text(value); requireSemantic(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(result), "MATERIAL_INVALID"); return result;};
const key = (binding: Doc) => `${binding.id}@${binding.version}`;
const assetKey = (binding: Doc) => `${binding.kind}:${key(binding)}`;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function binding(value: unknown, asset = false) {
  const item = obj(value), id = text(item.id); requireSemantic(/^[a-z0-9][a-z0-9._-]*$/.test(id), "MATERIAL_INVALID");
  if (asset) requireSemantic(["Ontology", "Source", "SemanticAsset", "HarnessProfile", "HarnessComponent", "HarnessBundle", "Evaluation"].includes(text(item.kind)), "UNSUPPORTED");
  return {...(asset ? {kind: text(item.kind)} : {}), id, version: version(item.version), digest: hash(item.digest)};
}
function bindings(value: unknown, asset = false) {
  return list(value).map(item => binding(item, asset)).sort((a, b) => compare(`${a.kind ?? ""}:${key(a)}:${a.digest}`, `${b.kind ?? ""}:${key(b)}:${b.digest}`));
}
const roles: Readonly<Record<string, readonly [string, string]>> = {
  artifactSet: ["ProjectOntologyArtifactSet", "artifactSetDigest"], closure: ["TerminalSemanticClosure", "closureDigest"],
  foundation: ["OntologyFoundation", "foundationDigest"], proposal: ["ProjectOntologyProposal", "proposalDigest"],
  profile: ["OntologyReasoningProfile", "profileDigest"], index: ["SemanticIndex", "indexDigest"],
  projectionSet: ["SemanticProjectionSet", "projectionSetDigest"], roundTripReport: ["SemanticRoundTripReport", "reportDigest"],
  incremental: ["SemanticComputation", "computationDigest"], full: ["SemanticComputation", "computationDigest"],
  priorSnapshot: ["ResolvedProjectOntologySnapshot", "snapshotDigest"], basePackSet: ["ResolvedProfessionalPackSet", "packSetDigest"]
};
const supportFields: Readonly<Record<string, string>> = {
  "evopilot-harness-resolved-professional-pack-set/v1": "packSetDigest",
  "evopilot-harness-semantic-round-trip-report/v1": "reportDigest",
  "evopilot-harness-semantic-computation/v1": "computationDigest",
  "evopilot-harness-project-ontology-artifact-lifecycle/v1": "recordDigest",
  "evopilot-harness-pack-lifecycle-record/v1": "recordDigest",
  "evopilot-harness-resolved-project-ontology-snapshot/v1": "snapshotDigest"
};

function resolvedSets(snapshot: SemanticSnapshot): Doc[] {
  const entries = new Map(snapshot.generation.entries.map(entry => [canonicalJson([entry.scope, entry.objectDigest]), entry]));
  requireSemantic(entries.size === snapshot.generation.entries.length, "IDENTITY_CONFLICT");
  const sets = snapshot.generation.sets; requireSemantic(Array.isArray(sets), "MATERIAL_MISSING");
  return sets.map(({scope, refs}) => {
    function resolve(ref: unknown) {
      const entry = entries.get(canonicalJson([scope, ref])); requireSemantic(entry && !entry.parent, "MATERIAL_MISSING");
      const document = obj(snapshot.materials.get(entry.path)), bytes = `${canonicalJson(document)}\n`;
      requireSemantic(digestText(bytes) === entry.fileDigest && Buffer.byteLength(bytes) === entry.bytes, "DIGEST_MISMATCH");
      return document;
    }
    const set: Doc = {};
    for (const role of Object.keys(roles)) if (refs[role] != null) set[role] = resolve(refs[role]);
    set.packs = list(refs.packs).map(resolve);
    set.support = docs(refs.support).map(item => ({binding: item.binding, document: resolve(item.ref)}));
    set.harnessAssets = docs(refs.harnessAssets).map(item => ({entry: item.entry, document: resolve(item.ref)}));
    const artifact = obj(obj(set.artifactSet).spec), project = obj(obj(artifact.snapshot).project);
    same(scope, {tenantId: project.tenantId, workspaceId: project.workspaceId, projectId: project.id});
    same(obj(artifact.projectOntologySkill).skillDigest, refs.skill);
    return set;
  });
}

/** Internal reference stage after schema/object/derived checks, not a standalone
 * material validator. Does not create or publish a closure, replay
 * authoring decisions or grant execution/release authority. Caller separately
 * establishes configured-root membership and current publication permission. */
export function verifySemanticClosureReferences(set: Doc): void {
  const artifact = obj(set.artifactSet), ontology = obj(obj(artifact.spec).snapshot), closure = obj(set.closure),
    profile = obj(set.profile), index = obj(set.index), projections = obj(set.projectionSet), report = obj(set.roundTripReport);
  const support = new Map<string, Doc>();
  for (const item of docs(set.support)) {
    const ref = binding(item.binding), document = obj(item.document), schema = String(document.schema);
    const field = Object.hasOwn(supportFields, schema) ? supportFields[schema] : undefined;
    requireSemantic(field, "UNSUPPORTED");
    const core = {...document}; delete core[field];
    requireSemantic(document[field] === digestObject(core) && ref.digest === document[field], "DIGEST_MISMATCH");
    requireSemantic(!support.has(key(ref)), "IDENTITY_CONFLICT"); support.set(key(ref), {binding: ref, document});
  }
  const locks = bindings(closure.dependencyLocks), evaluations = bindings(closure.evaluations, true), rollbacks = bindings(closure.rollbackLinks);
  requireSemantic(locks.length > 0 && evaluations.length > 0 && rollbacks.length > 0, "MATERIAL_MISSING");
  function evidence(ref: Doc) {
    const item = support.get(key(ref)); requireSemantic(item && obj(item.binding).digest === ref.digest, "MATERIAL_MISSING"); return obj(item.document);
  }
  for (const ref of locks) same(evidence(ref), obj(set.proposal).resolvedPackSet);
  for (const ref of evaluations) {
    const document = evidence(ref);
    requireSemantic([report.reportDigest, obj(set.incremental).computationDigest, obj(set.full).computationDigest].includes(ref.digest) &&
      (document.reportDigest === report.reportDigest || document.computationDigest === obj(set.incremental).computationDigest || document.computationDigest === obj(set.full).computationDigest), "MATERIAL_INVALID");
  }
  for (const ref of rollbacks) {
    const document = evidence(ref);
    requireSemantic((document.schema === "evopilot-harness-project-ontology-artifact-lifecycle/v1" && document.artifactSetDigest === artifact.artifactSetDigest) ||
      (set.priorSnapshot != null && document.snapshotDigest === obj(set.priorSnapshot).snapshotDigest), "MATERIAL_INVALID");
  }
  const assets = new Map<string, Doc>();
  for (const item of docs(set.harnessAssets)) {
    const entry = obj(item.entry), document = obj(item.document), metadata = obj(document.metadata);
    requireSemantic(["HarnessProfile", "HarnessComponent", "HarnessBundle"].includes(String(document.kind)), "UNSUPPORTED");
    same(document.apiVersion, "harness.evopilot.io/v3"); same(document.kind, entry.kind); same(metadata.id, entry.id);
    same(metadata.version, entry.version); same(metadata.lifecycle, "published"); same(entry.lifecycle, "published");
    requireSemantic(entry.assetDigest === digestObject(document), "DIGEST_MISMATCH");
    requireSemantic(!assets.has(assetKey(entry)), "IDENTITY_CONFLICT"); assets.set(assetKey(entry), item);
  }
  const harnessAssets = bindings(closure.harnessAssets, true);
  for (const kind of ["HarnessProfile", "HarnessComponent", "HarnessBundle"]) requireSemantic(harnessAssets.some(item => item.kind === kind), "MATERIAL_MISSING");
  for (const ref of [...harnessAssets, ...docs(index.assets).filter(item => String(item.kind).startsWith("Harness"))]) {
    const item = assets.get(assetKey(ref)); requireSemantic(item && obj(item.entry).assetDigest === ref.digest, "MATERIAL_MISSING");
  }
  for (const item of assets.values()) {
    const document = obj(item.document), spec = obj(document.spec);
    if (document.kind === "HarnessProfile") for (const ref of docs(spec.components)) requireSemantic(assets.has(assetKey({...ref, kind: "HarnessComponent"})), "MATERIAL_MISSING");
    if (document.kind === "HarnessBundle") for (const ref of [{...obj(spec.profile), kind: "HarnessProfile"}, ...docs(spec.resolvedComponents).map(ref => ({...ref, kind: "HarnessComponent"}))]) {
      const bound = assets.get(assetKey(ref)); requireSemantic(bound && obj(bound.entry).assetDigest === obj(ref).digest, "MATERIAL_MISSING");
    }
  }
  const profileMetadata = obj(profile.metadata), provenance = obj(closure.provenance), publication = obj(closure.publication);
  same(closure, signed({schema: "evopilot-harness-terminal-semantic-closure/v1", apiVersion: "semantics.evopilot.io/v1", kind: "TerminalSemanticClosure",
    version: "4.8.0", status: "PUBLISHED", snapshot: {digest: ontology.snapshotDigest, project: ontology.project},
    reasoningProfile: {id: profileMetadata.id, version: profileMetadata.version, digest: profile.profileDigest, mode: obj(profile.spec).mode},
    semanticIndex: {digest: index.indexDigest, statistics: index.statistics}, graphIndex: {digest: index.indexDigest, statistics: index.statistics},
    projectionSet: {digest: projections.projectionSetDigest, formats: docs(projections.projections).map(({format, status, contentDigest}) => ({format, status, contentDigest}))},
    roundTripReport: {digest: report.reportDigest, status: report.status}, harnessAssets, dependencyLocks: locks, evaluations, rollbackLinks: rollbacks,
    provenance: {producer: text(provenance.producer), sourceRefs: unique(provenance.sourceRefs), generatedByDigest: hash(provenance.generatedByDigest)},
    publication: {decision: "AUTHORIZED", actor: text(publication.actor), authorizationDigest: hash(publication.authorizationDigest), version: "4.8.0", at: text(publication.at)},
    authority: {immutable: true, consumerReadOnly: true, liveMutableHarnessDependency: false, grantsConsumerMutation: false, grantsConsumerApproval: false,
      grantsConsumerPublication: false, grantsReleaseAuthority: false}}, "closureDigest"));
}

// Reconstruct only the expected wire projection in ephemeral memory. This is
// not a Catalog writer or producer API; it returns no new generation to callers.
function verifyGeneration(snapshot: SemanticSnapshot, sets: Doc[]) {
  const entries = new Map<string, SemanticEntry>(), paths = new Set<string>(), descriptions: Doc[] = [], identities = new Set<string>();
  const rank = {PUBLIC: 0, DOMAIN: 1, PRIVATE: 2};
  const materialKey = (scope: SemanticScope, ref: unknown) => digestObject([scope, ref]);
  for (const set of [...sets].sort((a, b) => compare(digestObject(a), digestObject(b)))) {
    const artifact = obj(set.artifactSet), closure = obj(set.closure), project = obj(obj(obj(artifact.spec).snapshot).project);
    const scope: SemanticScope = {tenantId: text(project.tenantId), workspaceId: text(project.workspaceId), projectId: text(project.id)};
    const identity = materialKey(scope, closure.closureDigest); requireSemantic(!identities.has(identity), "IDENTITY_CONFLICT"); identities.add(identity);
    const packs = docs(set.packs), visibility = packs.some(pack => obj(pack.metadata).visibility === "PRIVATE") ? "PRIVATE" :
      packs.some(pack => obj(pack.metadata).visibility === "DOMAIN") ? "DOMAIN" : "PUBLIC";
    function expected(document: Doc, kind: string, objectDigest: string, category: "ASSET" | "DEPENDENCY" = "DEPENDENCY", publication: unknown = null) {
      const bytes = `${canonicalJson(document)}\n`, fileDigest = digestText(bytes), path = semanticContentPath("materials", fileDigest), metadata = document.metadata == null ? {} : obj(document.metadata);
      const entry: SemanticEntry = {kind, id: String(metadata.id ?? `${kind}-${objectDigest.slice(7, 31)}`),
        version: category === "DEPENDENCY" ? null : text(metadata.version ?? document.version), schema: text(document.schema ?? document.apiVersion), category,
        objectDigest, fileDigest, bytes: Buffer.byteLength(bytes), path, scope, visibility,
        provenance: {source: "HarnessSemanticSupply", documentDigest: objectDigest}, publication: publication as SemanticEntry["publication"], parent: null, dependencies: []};
      const id = materialKey(scope, objectDigest), existing = entries.get(id);
      if (existing) {requireSemantic(existing.fileDigest === fileDigest, "IDENTITY_CONFLICT"); if (rank[visibility] > rank[existing.visibility]) existing.visibility = visibility;}
      else entries.set(id, entry);
      paths.add(path); return objectDigest;
    }
    const refs: Doc = {};
    for (const [role, [kind, field]] of Object.entries(roles)) if (set[role] != null) {
      const document = obj(set[role]); refs[role] = expected(document, kind, hash(document[field]), ["artifactSet", "closure"].includes(role) ? "ASSET" : "DEPENDENCY",
        role === "artifactSet" ? obj(artifact.spec).publication : role === "closure" ? closure.publication : null);
    }
    const packRefs = packs.map(pack => expected(pack, text(pack.kind), hash(obj(pack.metadata).digest))); refs.packs = packRefs;
    const supportRefs = docs(set.support).map(item => ({binding: item.binding, ref: expected(obj(item.document), "SemanticSupportingMaterial", hash(obj(item.binding).digest))})); refs.support = supportRefs;
    const assetRefs = docs(set.harnessAssets).map(item => ({entry: item.entry, ref: expected(obj(item.document), text(obj(item.document).kind), hash(obj(item.entry).assetDigest))})); refs.harnessAssets = assetRefs;
    const parent = entries.get(materialKey(scope, refs.artifactSet))!;
    const skill = obj(obj(artifact.spec).projectOntologySkill), metadata = obj(skill.metadata);
    entries.set(materialKey(scope, skill.skillDigest), {...parent, kind: "ProjectOntologySkill", id: text(metadata.id), version: text(metadata.version),
      schema: text(skill.schema), objectDigest: hash(skill.skillDigest), publication: null,
      parent: {artifactSetDigest: hash(refs.artifactSet), jsonPointer: "/spec/projectOntologySkill"}, dependencies: [hash(refs.artifactSet)]});
    refs.skill = skill.skillDigest;
    const dependencies = Object.keys(roles).filter(role => refs[role] && role !== "closure").map(role => hash(refs[role]));
    dependencies.push(...packRefs, ...supportRefs.map(ref => ref.ref), ...assetRefs.map(ref => ref.ref));
    entries.get(materialKey(scope, refs.closure))!.dependencies = [...new Set(dependencies)].sort();
    parent.dependencies = [...new Set([hash(refs.foundation), hash(refs.proposal), ...packRefs])].sort();
    descriptions.push({scope, refs});
  }
  for (const entry of entries.values()) if (entry.parent) entry.visibility = entries.get(materialKey(entry.scope, entry.parent.artifactSetDigest))!.visibility;
  same(snapshot.generation, signed({schema: "evopilot-harness-semantic-catalog/v1", catalogId: snapshot.generation.catalogId,
    sets: descriptions.sort((a, b) => digestObject(a).localeCompare(digestObject(b))),
    entries: [...entries.values()].sort((a, b) => digestObject([a.scope, a.kind, a.id, a.version, a.objectDigest]).localeCompare(digestObject([b.scope, b.kind, b.id, b.version, b.objectDigest]))),
    revokedDigests: [...new Set(snapshot.generation.revokedDigests)].sort()}, "generationDigest"));
  requireSemantic(paths.size === snapshot.materials.size && [...snapshot.materials.keys()].every(path => paths.has(path)), "MATERIAL_INVALID");
}

export function inspectSemanticClosureMaterials(snapshot: SemanticSnapshot) {
  const derived = inspectSemanticDerivedMaterials(snapshot), sets = resolvedSets(snapshot);
  for (const set of sets) verifySemanticClosureReferences(set);
  verifyGeneration(snapshot, sets);
  return Object.freeze({status: "MATERIAL_CLOSURE_INSPECTED" as const, eligibleForExecution: false as const, sets: derived.sets,
    pending: ["original-v3-catalog-lock-membership", "production-validator-composition", "full-variant-and-acceptance-matrix"], limitations: derived.limitations});
}
