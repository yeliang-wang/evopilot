import {canonicalJson, digestObject, digestText, isRecord} from "./utils.js";
import {requireSemantic, resolveSemanticLimits, type SemanticCatalogLimits} from "./semantic-catalog-contract.js";
import type {SemanticSnapshot} from "./semantic-catalog-reader.js";
import {inspectSemanticMaterialBindings} from "./semantic-material-bindings.js";
import {validateSemanticDocument} from "./semantic-schema-validation.js";
import {verifySemanticProjectMaterials} from "./semantic-project-materials.js";

type Doc = Record<string, unknown>;
const obj = (value: unknown): Doc => {requireSemantic(isRecord(value), "MATERIAL_INVALID"); return value;};
const list = (value: unknown): unknown[] => {requireSemantic(Array.isArray(value), "MATERIAL_INVALID"); return value;};
const docs = (value: unknown) => list(value).map(obj);
const same = (a: unknown, b: unknown) => requireSemantic(a !== undefined && b !== undefined && canonicalJson(a) === canonicalJson(b), "MATERIAL_INVALID");
const order = (a: unknown, b: unknown) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
const unique = (value: unknown) => [...new Set(list(value).map(item => String(item).trim()).filter(Boolean))].sort(order);
const text = (value: unknown) => {requireSemantic(typeof value === "string" && value.length > 0 && value === value.trim(), "MATERIAL_INVALID"); return value;};
const hash = (value: unknown) => {requireSemantic(typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value), "MATERIAL_INVALID"); return value;};
const integer = (value: unknown, minimum = 0) => {requireSemantic(Number.isSafeInteger(value) && Number(value) >= minimum, "MATERIAL_INVALID"); return value as number;};
const signed = (core: Doc, field: string) => ({...core, [field]: digestObject(core)});
function binding(value: unknown, asset = false) {
  const item = obj(value), id = text(item.id), version = text(item.version);
  requireSemantic(/^[a-z0-9][a-z0-9._-]*$/.test(id) && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version), "MATERIAL_INVALID");
  return {...(asset ? {kind: text(item.kind)} : {}), id, version, digest: hash(item.digest)};
}
const bindingKey = (value: Doc) => `${value.kind ?? ""}:${value.id}@${value.version}:${value.digest}`;

/** Pure read-only checks of supplied derived results. This verifies the v1
 * canonical semantic-state calculation, not arbitrary OWL reasoning or external
 * reasoner execution. Pack/foundation/project derivation is a separate layer.
 */
export function verifySemanticDerivations(input: {
  snapshot: unknown; profile: unknown; index: unknown; projections: unknown;
  incremental: unknown; full: unknown; report: unknown;
}, overrides?: Partial<SemanticCatalogLimits>): void {
  const limits = resolveSemanticLimits(overrides);
  for (const value of Object.values(input)) validateSemanticDocument(value);
  const snapshot = obj(input.snapshot), profile = obj(input.profile), spec = obj(profile.spec),
    index = obj(input.index), projection = obj(input.projections), incremental = obj(input.incremental), full = obj(input.full), report = obj(input.report);
  const concepts = docs(snapshot.concepts), budgets = obj(spec.limits);
  for (const name of ["maxNodes", "maxEdges", "maxIterations", "maxWallTimeMs", "maxConcurrentTasks", "maxCacheEntries"]) integer(budgets[name], 1);
  requireSemantic(concepts.length <= limits.entries && concepts.length <= Number(budgets.maxNodes), "ENTRY_LIMIT");
  const nodes = concepts.map(concept => ({conceptId: text(concept.conceptId), label: text(concept.label), metaType: text(concept.metaType),
    definitionDigest: digestText(String(concept.definition ?? "")), evidenceRefs: unique(concept.evidenceRefs ?? [])})).sort((a, b) => order(a.conceptId, b.conceptId));
  const ids = new Set(nodes.map(node => node.conceptId));
  requireSemantic(ids.size === nodes.length, "IDENTITY_CONFLICT");
  const edges: Doc[] = [];
  for (const concept of concepts) for (const rel of docs(concept.relationships ?? [])) {
    requireSemantic(edges.length < limits.dependencyEdges && edges.length < Number(budgets.maxEdges), "EDGE_LIMIT");
    const to = text(rel.targetConceptId ?? rel.target ?? rel.object ?? rel.to);
    requireSemantic(ids.has(to), "MATERIAL_INVALID");
    edges.push({from: concept.conceptId, to, relationType: text(rel.relationType ?? rel.type ?? rel.predicate ?? "RELATED_TO"),
      rule: rel.rule === true, evidenceRefs: unique(rel.evidenceRefs ?? [])});
  }
  edges.sort((a, b) => order(`${a.from}:${a.relationType}:${a.to}`, `${b.from}:${b.relationType}:${b.to}`));
  const assets = list(index.assets).map(value => binding(value, true)).sort((a, b) => order(bindingKey(a), bindingKey(b)));
  requireSemantic(assets.length <= limits.entries, "ENTRY_LIMIT");
  let cache: Doc | null = null;
  if (index.cache !== null) {
    const value = obj(index.cache);
    cache = {id: text(value.id), digest: hash(value.digest), policyDigest: hash(value.policyDigest), entryCount: integer(value.entryCount)};
    requireSemantic(Number(cache.entryCount) <= Number(budgets.maxCacheEntries), "ENTRY_LIMIT");
  }
  same(index, signed({schema: "evopilot-harness-semantic-index/v1", apiVersion: "semantics.evopilot.io/v1", kind: "SemanticIndex",
    snapshotDigest: snapshot.snapshotDigest, algorithm: binding(index.algorithm), policy: binding(index.policy), toolchain: binding(index.toolchain), cache,
    nodes, edges, assets, statistics: {nodeCount: nodes.length, edgeCount: edges.length, assetCount: assets.length},
    authority: {contentAddressed: true, readOnly: true, staleResultsAllowed: false, mixedContextAllowed: false, mayMutateSource: false}}, "indexDigest"));
  const semanticState = {snapshotDigest: snapshot.snapshotDigest,
    nodes: nodes.map(({conceptId, metaType, definitionDigest}) => ({conceptId, metaType, definitionDigest})),
    edges: edges.map(({from, to, relationType}) => ({from, to, relationType})), assets, reasoningMode: spec.mode, supportedRules: spec.supportedRules};
  same(spec.supportedRules, unique(spec.supportedRules));
  if (spec.mode !== "EXTERNAL_REASONER") same(spec.externalReasoner, null);
  for (const [computation, mode] of [[incremental, "INCREMENTAL"], [full, "FULL"]] as const) {
    const telemetry = obj(computation.telemetry), evaluated = list(telemetry.evaluatedConceptIds);
    same(evaluated, unique(evaluated));
    requireSemantic(evaluated.every(id => typeof id === "string" && ids.has(id)), "MATERIAL_INVALID");
    if (mode === "FULL") {same(evaluated, nodes.map(node => node.conceptId)); same(computation.affectedSubgraphDigest, null);}
    else hash(computation.affectedSubgraphDigest);
    const concurrency = integer(telemetry.concurrency, 1), elapsedMs = integer(telemetry.elapsedMs);
    requireSemantic(concurrency <= Number(budgets.maxConcurrentTasks) && elapsedMs <= Number(budgets.maxWallTimeMs), "BUDGET_INVALID");
    const external = computation.externalReasonerEvidence;
    if (spec.mode === "EXTERNAL_REASONER") {
      const evidence = obj(external), reasoner = obj(evidence.reasoner), configured = obj(spec.externalReasoner);
      same(reasoner, configured); same(evidence.inputDigest, index.indexDigest);
      hash(evidence.outputDigest); hash(evidence.proofDigest);
      requireSemantic(["COMPLETED", "ABSTAINED"].includes(String(evidence.status)), "MATERIAL_INVALID");
      same(evidence, {reasoner, inputDigest: index.indexDigest, outputDigest: evidence.outputDigest, proofDigest: evidence.proofDigest, status: evidence.status});
    } else same(external, null);
    same(computation, signed({schema: "evopilot-harness-semantic-computation/v1", computationMode: mode,
      indexDigest: index.indexDigest, profileDigest: profile.profileDigest, affectedSubgraphDigest: computation.affectedSubgraphDigest,
      externalReasonerEvidence: external, outcomeDigest: digestObject(semanticState), proofDigest: digestObject({semanticState, externalReasonerEvidence: external}),
      telemetry: {nodeCount: nodes.length, edgeCount: edges.length, evaluatedConceptCount: evaluated.length, evaluatedConceptIds: evaluated,
        concurrency, elapsedMs, cacheEntryCount: cache?.entryCount ?? 0, cacheDigest: cache?.digest ?? null, budgets, secretsRedacted: true}, status: "COMPLETED",
      authority: {engineValidated: true, fullRecomputeRequiredForAcceptance: mode === "INCREMENTAL", mayApprove: false, mayPublish: false, mayMutate: false}}, "computationDigest"));
  }
  verifyProjections(snapshot, profile, index, projection, concepts, ids);
  const equivalence = signed({schema: "evopilot-harness-semantic-computation-equivalence/v1", status: "PASSED",
    incrementalComputationDigest: incremental.computationDigest, fullComputationDigest: full.computationDigest,
    sameBindings: true, equivalentAuthoritativeOutcome: true, authority: {requiredForIncrementalAcceptance: true, failureMayAdvanceLifecycle: false}}, "equivalenceDigest");
  same(report, signed({schema: "evopilot-harness-semantic-round-trip-report/v1", status: "PASSED", snapshotDigest: snapshot.snapshotDigest,
    indexDigest: index.indexDigest, projectionSetDigest: projection.projectionSetDigest,
    incrementalComputationDigest: incremental.computationDigest, fullComputationDigest: full.computationDigest,
    bindingChecks: {projectionSnapshot: true, indexSnapshot: true, projectionIndex: true, profileConsistent: true},
    allApplicableDigestsPresent: true, allFormatsApplicable: true, canonicalSemanticsPreserved: true, unsupportedFormats: [], computationEquivalence: equivalence,
    authority: {requiredForTerminalClosure: true, failureMayAdvanceLifecycle: false}}, "reportDigest"));
}

function verifyProjections(snapshot: Doc, profile: Doc, index: Doc, projection: Doc, concepts: Doc[], ids: Set<string>) {
  const mappings = docs(projection.externalMappings).map(value => {
    requireSemantic(ids.has(text(value.canonicalConceptId)) && ["EXACT_MATCH", "CLOSE_MATCH", "NARROW_MATCH", "BROAD_MATCH"].includes(String(value.relation)), "MATERIAL_INVALID");
    return {externalId: text(value.externalId), canonicalConceptId: text(value.canonicalConceptId), relation: value.relation,
      provenance: value.provenance ?? {}, evidenceDigest: hash(value.evidenceDigest), active: false};
  }).sort((a, b) => order(a.externalId, b.externalId));
  const terms = docs(projection.multilingualTerms).map(value => {
    requireSemantic(ids.has(text(value.conceptId)), "MATERIAL_INVALID");
    const language = text(value.language).toLowerCase();
    return {conceptId: text(value.conceptId), language, term: text(value.term), provenance: value.provenance ?? {}};
  }).sort((a, b) => order(`${a.conceptId}:${a.language}:${a.term}`, `${b.conceptId}:${b.language}:${b.term}`));
  const canonicalSemanticDigest = digestObject({snapshotDigest: snapshot.snapshotDigest, concepts: concepts.map(concept => ({conceptId: concept.conceptId,
    metaType: concept.metaType, definition: concept.definition, relationships: concept.relationships ?? [], evidenceRefs: unique(concept.evidenceRefs ?? [])})),
    externalMappings: mappings, multilingualTerms: terms});
  const iri = (value: unknown) => `urn:evopilot:semantic:${encodeURIComponent(String(value))}`;
  const quote = (value: unknown) => JSON.stringify(String(value));
  const contents: [string, string, string][] = [
    ["JSON_LD", "application/ld+json", JSON.stringify({"@context": {id: "@id", type: "@type", label: {"@id": "http://www.w3.org/2000/01/rdf-schema#label"}, provenance: {"@id": "http://www.w3.org/ns/prov#wasDerivedFrom"}},
      "@graph": concepts.map(concept => ({id: concept.conceptId, type: concept.metaType, label: [{"@value": concept.label, "@language": "und"},
        ...terms.filter(term => term.conceptId === concept.conceptId).map(term => ({"@value": term.term, "@language": term.language}))],
        externalMappings: mappings.filter(mapping => mapping.canonicalConceptId === concept.conceptId)}))}, null, 2)],
    ["PROV_O", "application/json", JSON.stringify({schema: "prov-o-compatible/v1", entity: concepts.map(concept => ({id: concept.conceptId, wasDerivedFrom: unique(concept.evidenceRefs ?? [])})), mappings}, null, 2)],
    ["RDF_TURTLE", "text/turtle", [...concepts.map(concept => `<${iri(concept.conceptId)}> a <urn:evopilot:${concept.metaType}> ; <http://www.w3.org/2000/01/rdf-schema#label> ${quote(concept.label)} .`),
      ...terms.map(term => `<${iri(term.conceptId)}> <http://www.w3.org/2000/01/rdf-schema#label> ${quote(term.term)}@${term.language} .`),
      ...mappings.map(mapping => `<${iri(mapping.canonicalConceptId)}> <urn:evopilot:mapping:${mapping.relation}> <${iri(mapping.externalId)}> .`)].join("\n")],
    ["OWL", "application/owl+xml", `Ontology(<urn:evopilot:project:${obj(snapshot.project).id}>\n${concepts.map(concept => ` Declaration(Class(<${iri(concept.conceptId)}>))`).join("\n")}\n${mappings.map(mapping => ` AnnotationAssertion(<urn:evopilot:mapping:${mapping.relation}> <${iri(mapping.canonicalConceptId)}> <${iri(mapping.externalId)}>)`).join("\n")}\n)`],
    ["SHACL", "text/turtle", concepts.map(concept => `<${iri(concept.conceptId)}Shape> a <http://www.w3.org/ns/shacl#NodeShape> ; <http://www.w3.org/ns/shacl#targetClass> <${iri(concept.conceptId)}> .`).join("\n")]
  ];
  same(projection, signed({schema: "evopilot-harness-semantic-interoperability-projection-set/v1", snapshotDigest: snapshot.snapshotDigest,
    profileDigest: profile.profileDigest, indexDigest: index.indexDigest, canonicalSemanticDigest, externalMappings: mappings, multilingualTerms: terms,
    projections: contents.map(([format, mediaType, content]) => ({format, status: "APPLICABLE", mediaType, snapshotDigest: snapshot.snapshotDigest,
      canonicalSemanticDigest, reason: null, content, contentDigest: digestText(content)})),
    authority: {externalVocabularyInactive: true, mappingsCannotOverrideUserPacks: true, deterministic: true, unsupportedSemanticsFailClosed: true}}, "projectionSetDigest"));
}

/** Development-stage inspection only, deliberately not an eligibility callback. */
export function inspectSemanticDerivedMaterials(snapshot: SemanticSnapshot) {
  const bindings = inspectSemanticMaterialBindings(snapshot), documents = new Map<string, Doc>();
  for (const entry of snapshot.generation.entries) {
    let value = obj(snapshot.materials.get(entry.path));
    if (entry.parent) value = obj(obj(value.spec).projectOntologySkill);
    validateSemanticDocument(value);
    documents.set(canonicalJson([entry.scope, entry.objectDigest]), value);
  }
  const sets = snapshot.generation.sets;
  requireSemantic(Array.isArray(sets) && sets.length > 0, "MATERIAL_MISSING");
  for (const set of sets) {
    const resolve = (role: string) => {const value = documents.get(canonicalJson([set.scope, set.refs[role]])); requireSemantic(value, "MATERIAL_MISSING"); return value;};
    const artifact = obj(resolve("artifactSet").spec), proposal = resolve("proposal");
    for (const nested of [artifact.snapshot, artifact.projectOntologySkill, artifact.projectionSet, proposal.resolvedPackSet]) validateSemanticDocument(nested);
    verifySemanticProjectMaterials({artifactSet: resolve("artifactSet"), foundation: resolve("foundation"), proposal,
      packs: list(set.refs.packs).map(ref => {const value = documents.get(canonicalJson([set.scope, ref])); requireSemantic(value, "MATERIAL_MISSING"); return value;}),
      ...(set.refs.priorSnapshot ? {priorSnapshot: resolve("priorSnapshot")} : {}),
      ...(set.refs.basePackSet ? {basePackSet: resolve("basePackSet")} : {})}, snapshot.limits);
    verifySemanticDerivations({snapshot: artifact.snapshot, profile: resolve("profile"), index: resolve("index"), projections: resolve("projectionSet"),
      incremental: resolve("incremental"), full: resolve("full"), report: resolve("roundTripReport")}, snapshot.limits);
  }
  return Object.freeze({status: "DERIVED_MATERIALS_INSPECTED" as const, eligibleForExecution: false as const, sets: bindings.sets,
    pending: ["generation-metadata-reconstruction", "complete-support-and-closure-bindings", "original-v3-catalog-lock-membership"],
    limitations: ["incremental-change-seed-proof-not-supplied", "external-reasoner-output-not-executed"]});
}
