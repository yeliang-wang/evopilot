import { canonicalJson, digestObject, isRecord } from "./utils.js";
import { requireSemantic, type SemanticEntry } from "./semantic-catalog-contract.js";
import type { SemanticSnapshot } from "./semantic-catalog-reader.js";

type Document = Record<string, unknown>;
const fields: Record<string, [string, string]> = {
  "evopilot-harness-project-ontology-artifact-set/v1": ["artifactSetDigest", "ProjectOntologyArtifactSet"],
  "evopilot-harness-project-ontology-skill/v1": ["skillDigest", "ProjectOntologySkill"],
  "evopilot-harness-terminal-semantic-closure/v1": ["closureDigest", "TerminalSemanticClosure"],
  "evopilot-harness-ontology-foundation/v1": ["foundationDigest", "OntologyFoundation"],
  "evopilot-harness-project-ontology-proposal/v1": ["proposalDigest", "ProjectOntologyProposal"],
  "evopilot-harness-ontology-reasoning-profile/v1": ["profileDigest", "OntologyReasoningProfile"],
  "evopilot-harness-semantic-index/v1": ["indexDigest", "SemanticIndex"],
  "evopilot-harness-semantic-interoperability-projection-set/v1": ["projectionSetDigest", "SemanticProjectionSet"],
  "evopilot-harness-semantic-round-trip-report/v1": ["reportDigest", "SemanticRoundTripReport"],
  "evopilot-harness-semantic-computation/v1": ["computationDigest", "SemanticComputation"],
  "evopilot-harness-resolved-professional-pack-set/v1": ["packSetDigest", "ResolvedProfessionalPackSet"],
  "evopilot-harness-resolved-project-ontology-snapshot/v1": ["snapshotDigest", "ResolvedProjectOntologySnapshot"],
  "evopilot-harness-project-ontology-artifact-lifecycle/v1": ["recordDigest", "SemanticSupportingMaterial"],
  "evopilot-harness-pack-lifecycle-record/v1": ["recordDigest", "SemanticSupportingMaterial"]
};
function record(value: unknown): Document { requireSemantic(isRecord(value), "MATERIAL_INVALID"); return value; }
function array(value: unknown): unknown[] { requireSemantic(Array.isArray(value), "MATERIAL_INVALID"); return value; }
function exact(a: unknown, b: unknown) { requireSemantic(a !== undefined && b !== undefined && canonicalJson(a) === canonicalJson(b), "MATERIAL_INVALID"); }
function immutable(value: unknown, field: string): Document {
  const doc = record(value), content = {...doc}; delete content[field];
  requireSemantic(typeof doc[field] === "string" && doc[field] === digestObject(content), "DIGEST_MISMATCH");
  return doc;
}
function documentFor(entry: SemanticEntry, snapshot: SemanticSnapshot): Document {
  let doc = record(snapshot.materials.get(entry.path));
  if (entry.parent) doc = record(record(doc.spec).projectOntologySkill);
  exact(doc.schema ?? doc.apiVersion, entry.schema);
  let objectDigest: unknown;
  if (entry.schema === "harness.evopilot.io/v3") {
    requireSemantic(["HarnessBundle", "HarnessProfile", "HarnessComponent"].includes(entry.kind), "UNSUPPORTED");
    exact(doc.kind, entry.kind); exact(record(doc.metadata).lifecycle, "published"); objectDigest = digestObject(doc);
  } else if (entry.schema === "semantics.evopilot.io/v1") {
    requireSemantic(["DomainOntologyPack", "ProductOntologyPack", "OrganizationOntologyPack", "ProjectOntologyOverlay", "DomainHarnessPack"].includes(entry.kind), "UNSUPPORTED");
    exact(doc.kind, entry.kind);
    const metadata = record(doc.metadata), clean = {...metadata}; delete clean.digest;
    objectDigest = metadata.digest; requireSemantic(objectDigest === digestObject({...doc, metadata: clean}), "DIGEST_MISMATCH");
  } else {
    const binding = Object.hasOwn(fields, entry.schema) ? fields[entry.schema] : undefined;
    requireSemantic(binding && (entry.kind === binding[1] || (entry.kind === "SemanticSupportingMaterial" &&
      ["packSetDigest", "snapshotDigest", "reportDigest", "computationDigest", "recordDigest"].includes(binding[0]))), "UNSUPPORTED");
    immutable(doc, binding[0]); objectDigest = doc[binding[0]];
  }
  requireSemantic(objectDigest === entry.objectDigest, "DIGEST_MISMATCH");
  if (doc.metadata !== undefined) {
    const metadata = record(doc.metadata); exact(metadata.id, entry.id);
    if (entry.category === "ASSET") exact(metadata.version, entry.version);
  }
  if (entry.kind === "TerminalSemanticClosure") exact(doc.version, entry.version);
  if (entry.kind === "ProjectOntologyArtifactSet") exact(record(doc.spec).publication, entry.publication);
  if (entry.kind === "TerminalSemanticClosure") exact(doc.publication, entry.publication);
  return doc;
}

/** Intermediate verifier only. Does NOT replace complete schema validation,
 * semantic recomputation or original v3 Catalog/lock membership checks. It must
 * never be used as the reader's sole validateMaterials/eligibility policy.
 */
export function inspectSemanticMaterialBindings(snapshot: SemanticSnapshot) {
  const documents = new Map<string, Document>();
  for (const entry of snapshot.generation.entries) documents.set(canonicalJson([entry.scope, entry.objectDigest]), documentFor(entry, snapshot));
  const sets = snapshot.generation.sets;
  requireSemantic(Array.isArray(sets) && sets.length > 0, "MATERIAL_MISSING");
  const inspected = [];
  for (const set of sets) {
    const refs = set.refs;
    function resolve(role: string) {
      const document = documents.get(canonicalJson([set.scope, refs[role]]));
      requireSemantic(document, "MATERIAL_MISSING"); return document;
    }
    const artifact = resolve("artifactSet"), closure = resolve("closure"), foundation = resolve("foundation"), proposal = resolve("proposal"),
      profile = resolve("profile"), index = resolve("index"), projections = resolve("projectionSet"), report = resolve("roundTripReport"),
      incremental = resolve("incremental"), full = resolve("full"), skill = resolve("skill");
    const spec = record(artifact.spec), ontology = immutable(spec.snapshot, "snapshotDigest"), manifest = immutable(spec.manifest, "manifestDigest"),
      localProjections = immutable(spec.projectionSet, "projectionSetDigest"), skillSpec = record(skill.spec), project = record(ontology.project);
    exact({tenantId: project.tenantId, workspaceId: project.workspaceId, projectId: project.id}, set.scope);
    exact(spec.project, project); exact(manifest.project, project); exact(record(closure.snapshot).project, project);
    for (const value of [spec.snapshotDigest, manifest.snapshotDigest, localProjections.snapshotDigest, skillSpec.snapshotDigest,
      index.snapshotDigest, projections.snapshotDigest, report.snapshotDigest, record(closure.snapshot).digest]) exact(value, ontology.snapshotDigest);
    for (const value of [spec.foundationDigest, manifest.foundationDigest, ontology.foundationDigest]) exact(value, foundation.foundationDigest);
    const packSet = immutable(proposal.resolvedPackSet, "packSetDigest");
    exact(ontology.packSetDigest, packSet.packSetDigest); exact(manifest.packSetDigest, packSet.packSetDigest);
    exact(record(spec.dependencyLock).packSetDigest, packSet.packSetDigest);
    exact(manifest.dependencyLockDigest, digestObject(spec.dependencyLock));
    exact(manifest.projectionSetDigest, localProjections.projectionSetDigest);
    exact(skillSpec.projectionSetDigest, localProjections.projectionSetDigest); exact(skillSpec.artifactSetManifestDigest, manifest.manifestDigest);
    exact(spec.projectOntologySkill, skill); exact(skillSpec.readOnly, true); exact(skillSpec.executable, false);
    exact(skillSpec.truthSource, "ResolvedProjectOntologySnapshot");
    exact(skill.authority, {guidanceProjectionOnly: true, soleTruthStore: false, mayMutateOntology: false, mayApprove: false, mayPublish: false, mayActivate: false});
    for (const value of [projections.profileDigest, incremental.profileDigest, full.profileDigest, record(closure.reasoningProfile).digest]) exact(value, profile.profileDigest);
    for (const value of [projections.indexDigest, report.indexDigest, incremental.indexDigest, full.indexDigest,
      record(closure.semanticIndex).digest, record(closure.graphIndex).digest]) exact(value, index.indexDigest);
    exact(record(closure.projectionSet).digest, projections.projectionSetDigest); exact(report.projectionSetDigest, projections.projectionSetDigest);
    exact(report.incrementalComputationDigest, incremental.computationDigest); exact(report.fullComputationDigest, full.computationDigest);
    exact(record(closure.roundTripReport).digest, report.reportDigest); exact(report.status, "PASSED"); exact(record(closure.roundTripReport).status, "PASSED");
    exact(incremental.status, "COMPLETED"); exact(full.status, "COMPLETED"); exact(incremental.outcomeDigest, full.outcomeDigest);
    exact(closure.status, "PUBLISHED"); exact(record(closure.publication).decision, "AUTHORIZED"); exact(record(spec.publication).decision, "AUTHORIZED");
    exact(manifest.publicationAuthorizationDigest, record(spec.publication).authorizationDigest);
    // Resolve every supporting reference; no digest-only or cross-scope promises.
    for (const role of ["packs", "support", "harnessAssets"]) for (const ref of array(refs[role])) {
      const key = role === "packs" ? ref : record(ref).ref;
      requireSemantic(documents.has(canonicalJson([set.scope, key])), "MATERIAL_MISSING");
    }
    inspected.push({scope: set.scope, artifactSetDigest: artifact.artifactSetDigest, snapshotDigest: ontology.snapshotDigest,
      skillDigest: skill.skillDigest, closureDigest: closure.closureDigest});
  }
  return Object.freeze({status: "MATERIAL_BINDINGS_INSPECTED" as const, eligibleForExecution: false as const, sets: inspected,
    pending: ["full-material-schema-validation", "semantic-recomputation", "original-v3-catalog-lock-membership"]});
}
