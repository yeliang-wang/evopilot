import {canonicalJson, digestObject, digestText, isRecord} from "./utils.js";
import {requireSemantic, resolveSemanticLimits, type SemanticCatalogLimits} from "./semantic-catalog-contract.js";
import {validateSemanticDocument} from "./semantic-schema-validation.js";

type Doc = Record<string, unknown>;
const obj = (value: unknown): Doc => {requireSemantic(isRecord(value), "MATERIAL_INVALID"); return value;};
const list = (value: unknown): unknown[] => {requireSemantic(Array.isArray(value), "MATERIAL_INVALID"); return value;};
const docs = (value: unknown) => list(value).map(obj);
const same = (a: unknown, b: unknown) => requireSemantic(a !== undefined && b !== undefined && canonicalJson(a) === canonicalJson(b), "MATERIAL_INVALID");
const signed = (value: Doc, field: string) => ({...value, [field]: digestObject(value)});
const text = (value: unknown) => {requireSemantic(typeof value === "string" && value.trim().length > 0, "MATERIAL_INVALID"); return value as string;};
const hash = (value: unknown) => {requireSemantic(typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value), "MATERIAL_INVALID"); return value as string;};
const key = (value: Doc) => `${value.id}@${value.version}`;
const packKey = (value: Doc) => key(obj(value.metadata));
const unique = (value: unknown) => [...new Set(list(value).map(item => String(item).trim()).filter(Boolean))].sort();
function immutable(value: unknown, field: string) {
  const document = obj(value), core = {...document}; delete core[field];
  requireSemantic(document[field] === digestObject(core), "DIGEST_MISMATCH");
  validateSemanticDocument(document); return document;
}
function namespace(value: unknown) {requireSemantic(/^[A-Za-z][A-Za-z0-9._:-]{1,255}$/.test(text(value)), "MATERIAL_INVALID");}
function validatePack(pack: Doc, targetRoot: unknown) {
  validateSemanticDocument(pack);
  const metadata = obj(pack.metadata), spec = obj(pack.spec), clean = {...metadata}; delete clean.digest;
  requireSemantic(metadata.digest === digestObject({...pack, metadata: clean}), "DIGEST_MISMATCH");
  namespace(metadata.namespace); text(obj(metadata.provenance).author);
  requireSemantic(metadata.root !== "PRIVATE_ORGANIZATION" || metadata.visibility === "PRIVATE", "SCOPE_INVALID");
  requireSemantic((metadata.root !== "PRIVATE_ORGANIZATION" && metadata.visibility !== "PRIVATE") || targetRoot === "PRIVATE_ORGANIZATION", "SCOPE_INVALID");
  const stack: unknown[] = [pack];
  while (stack.length) {
    const value = stack.pop(); if (value === null || typeof value !== "object") continue;
    for (const [name, child] of Object.entries(value)) {
      requireSemantic(!["script", "scripts", "command", "commands", "hook", "hooks", "runtimeCode", "installerCode"].includes(name) && (name !== "executable" || child === false), "MATERIAL_INVALID");
      if (child && typeof child === "object") stack.push(child);
    }
  }
  const concepts = docs(spec.concepts);
  requireSemantic(new Set(concepts.map(concept => concept.conceptId)).size === concepts.length, "IDENTITY_CONFLICT");
  for (const concept of concepts) {
    namespace(concept.conceptId); text(concept.label); text(concept.metaType); text(concept.definition);
    list(concept.aliases ?? []); list(concept.relationships ?? []); list(concept.evidenceRefs ?? []);
    if (concept.replaces) namespace(concept.replaces);
  }
  for (const item of docs(spec.imports)) {text(item.id); requireSemantic(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(text(item.version)), "MATERIAL_INVALID"); hash(item.digest);}
  for (const item of docs(spec.equivalences)) {namespace(item.left); namespace(item.right); list(item.evidenceRefs ?? []);}
  for (const item of docs(spec.replacements)) {namespace(item.from); namespace(item.to); text(item.migration);}
  for (const item of docs(spec.rules)) {namespace(item.ruleId); text(item.expression); list(item.evidenceRefs ?? []);}
  if (pack.kind === "DomainHarnessPack") for (const item of docs(spec.harnessGuidance)) {text(item.topic); text(item.guidance); list(item.evidenceRefs ?? []);}
}

/** Verify producer-defined immutable derivation, without producing or publishing
 * assets, applying decisions, importing Packs, or taking ownership of them. */
export function verifySemanticProjectMaterials(input: {
  artifactSet: unknown; foundation: unknown; proposal: unknown; packs: unknown[];
  priorSnapshot?: unknown; basePackSet?: unknown;
}, overrides?: Partial<SemanticCatalogLimits>): void {
  const limits = resolveSemanticLimits(overrides);
  const artifact = immutable(input.artifactSet, "artifactSetDigest"), spec = obj(artifact.spec),
    foundation = immutable(input.foundation, "foundationDigest"), proposal = immutable(input.proposal, "proposalDigest"),
    snapshot = immutable(spec.snapshot, "snapshotDigest"), packSet = immutable(proposal.resolvedPackSet, "packSetDigest");
  const foundationLimits = obj(foundation.limits);
  for (const [name, max] of [["maxCandidates", 512], ["maxConcepts", 4096], ["maxEvidenceRefsPerCandidate", 64]] as const)
    requireSemantic(Number.isSafeInteger(foundationLimits[name]) && Number(foundationLimits[name]) >= 1 && Number(foundationLimits[name]) <= max, "BUDGET_INVALID");
  same(foundation, signed({schema: "evopilot-harness-ontology-foundation/v1", version: 1,
    metaTypes: ["ENTITY", "ATTRIBUTE", "RELATIONSHIP", "RULE", "EVENT", "ACTION", "ACTOR", "ROLE", "PERMISSION", "STATE", "WORKFLOW", "CAPABILITY", "SYSTEM", "DATA_ASSET"].sort(),
    relationTypes: ["IS_A", "PART_OF", "REQUIRES", "PERFORMS", "CONSTRAINS", "TRIGGERS", "RECOVERS_WITH", "VALIDATED_BY", "ALTERNATIVE_TO", "MITIGATES", "PRODUCES"].sort(),
    limits: foundationLimits, authority: {engineOwnedMetaModel: true, containsBusinessValues: false, executable: false, mayDecideEligibility: false, mayApprove: false, mayPublish: false}}, "foundationDigest"));
  requireSemantic(["COMMUNITY", "DOMAIN_TEAM", "PRIVATE_ORGANIZATION"].includes(String(packSet.targetRoot)), "MATERIAL_INVALID");
  const packs = input.packs.map(obj);
  requireSemantic(packs.length > 0 && packs.length <= limits.entries, "ENTRY_LIMIT");
  packs.forEach(pack => validatePack(pack, packSet.targetRoot));
  const byKey = new Map(packs.map(pack => [packKey(pack), pack]));
  requireSemantic(byKey.size === packs.length, "IDENTITY_CONFLICT");
  const precedence = docs(snapshot.packs).map(key);
  requireSemantic(new Set(precedence).size === precedence.length && precedence.length === packs.length && precedence.every(id => byKey.has(id)), "MATERIAL_MISSING");
  // The pinned producer's precedence normalizer sorts unique exact keys.
  const ordered = [...precedence].sort().map(id => byKey.get(id)!);
  let edgeCount = 0;
  const adjacency = new Map<string, string[]>();
  for (const pack of ordered) {
    const next: string[] = [];
    for (const ref of docs(obj(pack.spec).imports)) {
      requireSemantic(++edgeCount <= limits.dependencyEdges, "EDGE_LIMIT");
      const exact = byKey.get(key(ref));
      requireSemantic(exact || ref.optional === true, "MATERIAL_MISSING");
      if (exact) {same(obj(exact.metadata).digest, ref.digest); next.push(packKey(exact));}
      else {
        // Match the producer's cycle check for optional wrong-version imports.
        const alternatives = ordered.filter(value => obj(value.metadata).id === ref.id);
        if (alternatives.length === 1) next.push(packKey(alternatives[0]));
      }
    }
    adjacency.set(packKey(pack), next);
  }
  const heights = new Map<string, number>(), active = new Set<string>();
  function depth(id: string): number {
    requireSemantic(!active.has(id), "DEPENDENCY_CYCLE");
    const known = heights.get(id); if (known !== undefined) return known;
    requireSemantic(active.size < limits.dependencyDepth, "DEPTH_LIMIT"); active.add(id);
    const result = 1 + Math.max(0, ...adjacency.get(id)!.map(depth)); active.delete(id);
    requireSemantic(result <= limits.dependencyDepth, "DEPTH_LIMIT"); heights.set(id, result); return result;
  }
  for (const id of adjacency.keys()) depth(id);
  const merged = new Map<string, Doc>(); let conceptCount = 0;
  for (const pack of ordered) for (const concept of docs(obj(pack.spec).concepts)) {
    requireSemantic(++conceptCount <= limits.entries, "ENTRY_LIMIT");
    const id = text(concept.conceptId), previous = merged.get(id), metadata = obj(pack.metadata);
    requireSemantic(!previous || concept.replaces === previous.conceptDigest, "MATERIAL_INVALID");
    merged.set(id, signed({...concept, packId: metadata.id, packVersion: metadata.version, packDigest: metadata.digest}, "conceptDigest"));
  }
  const concepts = [...merged.values()].sort((a, b) => text(a.conceptId).localeCompare(text(b.conceptId)));
  const base = input.basePackSet == null ? null : immutable(input.basePackSet, "packSetDigest");
  const baseDigest = base?.packSetDigest ?? digestObject({schema: "evopilot-harness-empty-pack-base/v1"});
  same(proposal.baseDigest, baseDigest);
  const boundPacks = ordered.map(pack => {const m = obj(pack.metadata); return {id: m.id, version: m.version, kind: pack.kind,
    namespace: m.namespace, root: m.root, visibility: m.visibility, digest: m.digest, provenance: m.provenance};});
  const graph = ordered.map(pack => ({pack: packKey(pack), imports: docs(obj(pack.spec).imports).map(key).sort()}));
  same(packSet, signed({schema: "evopilot-harness-resolved-professional-pack-set/v1", targetRoot: packSet.targetRoot, baseDigest,
    packs: boundPacks, concepts, dependencyGraph: graph, conflicts: [], authority: {engineResolved: true, declarativeOnly: true, executable: false,
      importedEvidenceActive: false, automaticallyTrusted: false, automaticallyApproved: false, automaticallyPublished: false, automaticallyActivated: false}}, "packSetDigest"));
  same(proposal.stage, "APPROVED");
  const project = obj(proposal.project); text(project.id); text(project.workspaceId); text(project.tenantId); hash(project.sourceSnapshotDigest);
  const prior = input.priorSnapshot == null ? null : immutable(input.priorSnapshot, "snapshotDigest");
  if (prior) for (const field of ["id", "tenantId", "workspaceId"]) same(obj(prior.project)[field], project[field]);
  if (proposal.overlay != null) {
    const overlay = obj(proposal.overlay);
    requireSemantic(boundPacks.some(pack => pack.kind === "ProjectOntologyOverlay" && pack.id === overlay.id && pack.version === overlay.version && pack.digest === overlay.digest), "MATERIAL_MISSING");
  }
  same(snapshot, signed({schema: "evopilot-harness-resolved-project-ontology-snapshot/v1", project, foundationDigest: foundation.foundationDigest,
    proposalDigest: proposal.proposalDigest, baseDigest, packSetDigest: packSet.packSetDigest, packs: boundPacks, dependencyGraph: graph, concepts,
    overlay: proposal.overlay, predecessorSnapshotDigest: prior?.snapshotDigest ?? null, resolvedAt: snapshot.resolvedAt,
    authority: {immutable: true, fullyResolved: true, engineOwnedResolution: true, editable: false, published: false, active: false, mayApprove: false, mayPublish: false, mayActivate: false}}, "snapshotDigest"));
  verifyArtifact(artifact, snapshot, concepts, boundPacks);
}

function verifyArtifact(artifact: Doc, snapshot: Doc, concepts: Doc[], packs: Doc[]) {
  const spec = obj(artifact.spec), project = obj(snapshot.project), projections = immutable(spec.projectionSet, "projectionSetDigest");
  const iri = (value: unknown) => `urn:evopilot:concept:${encodeURIComponent(String(value))}`, quote = (value: unknown) => JSON.stringify(String(value));
  const contents: [string, string, string][] = [
    ["YAML", "application/yaml", concepts.map(c => `- conceptId: ${quote(c.conceptId)}\n  label: ${quote(c.label)}\n  metaType: ${quote(c.metaType)}\n  definition: ${quote(c.definition)}`).join("\n")],
    ["OWL", "application/owl+xml", `Ontology(<urn:evopilot:project:${project.id}>\n${concepts.map(c => ` Declaration(Class(<${iri(c.conceptId)}>))`).join("\n")}\n)`],
    ["RDF_TURTLE", "text/turtle", concepts.map(c => `<${iri(c.conceptId)}> a <urn:evopilot:${c.metaType}> ; <http://www.w3.org/2000/01/rdf-schema#label> ${quote(c.label)} .`).join("\n")],
    ["JSON_LD", "application/ld+json", JSON.stringify({"@context": {id: "@id", type: "@type", label: "http://www.w3.org/2000/01/rdf-schema#label"}, "@graph": concepts.map(c => ({id: c.conceptId, type: c.metaType, label: c.label, definition: c.definition}))}, null, 2)],
    ["SHACL", "text/turtle", concepts.map(c => `<${iri(c.conceptId)}Shape> a <http://www.w3.org/ns/shacl#NodeShape> ; <http://www.w3.org/ns/shacl#targetClass> <${iri(c.conceptId)}> .`).join("\n")]
  ];
  const expected: Doc[] = contents.map(([format, mediaType, content]) => ({format, status: "APPLICABLE", snapshotDigest: snapshot.snapshotDigest, mediaType, content, contentDigest: digestText(content)}));
  const rules = concepts.flatMap(c => docs(c.relationships ?? [])).filter(rule => rule.rule === true || rule.relationType === "RULE");
  if (rules.length) {
    const content = rules.map((rule, index) => `# bounded-rule-${index + 1} ${JSON.stringify(rule)}`).join("\n");
    expected.push({format: "SWRL", status: "APPLICABLE", snapshotDigest: snapshot.snapshotDigest, mediaType: "text/plain", content, contentDigest: digestText(content)});
  } else expected.push({format: "SWRL", status: "NON_APPLICABLE", snapshotDigest: snapshot.snapshotDigest, mediaType: "text/plain",
    reason: "The resolved snapshot contains no bounded rule relationship; content was not fabricated.", content: null, contentDigest: null});
  expected.sort((a, b) => text(a.format).localeCompare(text(b.format)));
  same(projections, signed({schema: "evopilot-harness-project-ontology-projection-set/v1", snapshotDigest: snapshot.snapshotDigest, projections: expected}, "projectionSetDigest"));
  const publication = obj(spec.publication); same(publication.decision, "AUTHORIZED"); text(publication.actor); hash(publication.authorizationDigest); text(publication.at);
  requireSemantic(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(text(publication.version)), "MATERIAL_INVALID");
  same(publication, {decision: "AUTHORIZED", actor: publication.actor, authorizationDigest: publication.authorizationDigest, version: publication.version, at: publication.at});
  const lock = {packSetDigest: snapshot.packSetDigest, packs: packs.map(({id, version, digest}) => ({id, version, digest})), dependencyGraph: snapshot.dependencyGraph};
  const manifest = signed({schema: "evopilot-harness-project-ontology-artifact-manifest/v1", project, version: publication.version, snapshotDigest: snapshot.snapshotDigest,
    foundationDigest: snapshot.foundationDigest, packSetDigest: snapshot.packSetDigest, dependencyLockDigest: digestObject(lock), projectionSetDigest: projections.projectionSetDigest,
    projectionInventory: expected.map(({format, status, contentDigest}) => ({format, status, contentDigest})), publicationAuthorizationDigest: publication.authorizationDigest}, "manifestDigest");
  const skill = immutable(spec.projectOntologySkill, "skillDigest");
  same(skill, signed({schema: "evopilot-harness-project-ontology-skill/v1", kind: "ProjectOntologySkill", apiVersion: "semantics.evopilot.io/v1",
    metadata: {id: `${project.id}-project-ontology`, version: "1.0.0", projectId: project.id},
    spec: {snapshotDigest: snapshot.snapshotDigest, projectionSetDigest: projections.projectionSetDigest, artifactSetManifestDigest: manifest.manifestDigest,
      conceptIndex: concepts.map(({conceptId, label, metaType, definition}) => ({conceptId, label, metaType, definition})), instructions: unique(obj(skill.spec).instructions),
      readOnly: true, truthSource: "ResolvedProjectOntologySnapshot", executable: false},
    authority: {guidanceProjectionOnly: true, soleTruthStore: false, mayMutateOntology: false, mayApprove: false, mayPublish: false, mayActivate: false}}, "skillDigest"));
  same(artifact, signed({schema: "evopilot-harness-project-ontology-artifact-set/v1", kind: "ProjectOntologyArtifactSet", apiVersion: "semantics.evopilot.io/v1",
    metadata: {id: `${project.id}-project-ontology-artifacts`, version: publication.version, projectId: project.id},
    spec: {project, manifest, snapshot, snapshotDigest: snapshot.snapshotDigest, foundationDigest: snapshot.foundationDigest,
      provenance: packs.map(p => ({packId: p.id, packVersion: p.version, packDigest: p.digest, provenance: p.provenance})), dependencyLock: lock, projectionSet: projections,
      projectOntologySkill: skill, publication}, authority: {immutable: true, separatelyPublished: true, automaticallyInstalled: false, automaticallyActive: false, consumerReadOnly: true, mayGrantConsumerMutation: false}}, "artifactSetDigest"));
}
