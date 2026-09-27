import {canonicalJson, digestObject, isRecord} from "./utils.js";
import {requireSemantic, type SemanticScope} from "./semantic-catalog-contract.js";
import {validateSemanticDocument} from "./semantic-schema-validation.js";
import {freeze} from "./semantic-catalog-io.js";

type Document = Record<string, any>;
const record = (value: unknown): Document => {requireSemantic(isRecord(value), "MATERIAL_INVALID"); return value;};
function immutable(value: Document, key: string) {
  const copy = {...value}; delete copy[key]; requireSemantic(value[key] === digestObject(copy), "DIGEST_MISMATCH");
}

/** Runtime-owned comparison of explicit snapshot facts, not the producer's
 * Source-grounding diagnostic. Call only after current Catalog permissions and
 * complete-set verification. This pure report never proves Harness eligibility,
 * creates a binding, interprets Skill prose, or supplies execution authority.
 */
export function evaluateProjectSemanticCompatibility(input: {
  artifactSet: unknown; bundle: unknown; reasoningProfile: unknown; scope: SemanticScope;
}) {
  const artifact = record(input.artifactSet), bundle = record(input.bundle), profile = record(input.reasoningProfile);
  for (const doc of [artifact, bundle, profile]) validateSemanticDocument(doc);
  requireSemantic(artifact.kind === "ProjectOntologyArtifactSet" && bundle.kind === "HarnessBundle" &&
    profile.kind === "OntologyReasoningProfile", "MATERIAL_INVALID");
  immutable(artifact, "artifactSetDigest"); immutable(profile, "profileDigest");
  const snapshot = record(artifact.spec.snapshot); validateSemanticDocument(snapshot); immutable(snapshot, "snapshotDigest");
  requireSemantic(bundle.metadata.lifecycle === "published" && artifact.spec.publication.decision === "AUTHORIZED", "MATERIAL_INVALID");
  requireSemantic(canonicalJson({tenantId: snapshot.project.tenantId, workspaceId: snapshot.project.workspaceId, projectId: snapshot.project.id}) ===
    canonicalJson(input.scope), "SCOPE_INVALID");
  requireSemantic(artifact.spec.snapshotDigest === snapshot.snapshotDigest && artifact.spec.foundationDigest === snapshot.foundationDigest, "MATERIAL_INVALID");
  const concepts = snapshot.concepts as Document[];
  requireSemantic(concepts.length <= profile.spec.limits.maxNodes, "MATERIAL_LIMIT");
  const byId = new Map(concepts.map(concept => [concept.conceptId, concept]));
  requireSemantic(byId.size === concepts.length, "IDENTITY_CONFLICT");
  const requirements = bundle.spec.semanticRequirements as Document | undefined;
  const reasons: string[] = [], matched: string[] = [], missing: string[] = [], wrongType: string[] = [], prohibited: string[] = [];
  const missingRelations: {subjectConceptId: string; relationType: string; objectConceptId: string}[] = [];
  let incompatible = false;
  if (!requirements) reasons.push("REQUIREMENTS_NOT_DECLARED");
  else {
    immutable(requirements, "requirementsDigest");
    for (const list of [requirements.requiredConcepts, requirements.prohibitedConcepts]) {
      requireSemantic(list.length <= profile.spec.limits.maxNodes, "MATERIAL_LIMIT");
      requireSemantic(new Set(list.map((item: Document) => item.conceptId)).size === list.length, "IDENTITY_CONFLICT");
    }
    requireSemantic(requirements.relationRequirements.length <= profile.spec.limits.maxEdges, "EDGE_LIMIT");
    const prohibitedIds = new Set(requirements.prohibitedConcepts.map((item: Document) => item.conceptId));
    requireSemantic(!requirements.requiredConcepts.some((item: Document) => prohibitedIds.has(item.conceptId)), "MATERIAL_INVALID");
    if (requirements.foundationDigest !== snapshot.foundationDigest) {incompatible = true; reasons.push("FOUNDATION_MISMATCH");}
    for (const required of requirements.requiredConcepts) {
      const concept = byId.get(required.conceptId);
      if (!concept || concept.deprecated) missing.push(required.conceptId);
      else if (concept.metaType !== required.metaType) wrongType.push(required.conceptId);
      else matched.push(required.conceptId);
    }
    for (const denied of requirements.prohibitedConcepts) if (byId.has(denied.conceptId)) prohibited.push(denied.conceptId);
    for (const relation of requirements.relationRequirements) {
      const subject = byId.get(relation.subjectConceptId), object = byId.get(relation.objectConceptId);
      if (!subject || !object || subject.deprecated || object.deprecated || !subject.relationships.some((edge: Document) =>
        edge.relationType === relation.relationType && edge.targetConceptId === relation.objectConceptId)) missingRelations.push({...relation});
    }
    if (missing.length) reasons.push("REQUIRED_CONCEPT_MISSING");
    if (wrongType.length) reasons.push("REQUIRED_META_TYPE_MISMATCH");
    if (prohibited.length) reasons.push("PROHIBITED_CONCEPT_PRESENT");
    if (missingRelations.length) reasons.push("EXPLICIT_RELATION_MISSING");
    incompatible ||= missing.length + wrongType.length + prohibited.length + missingRelations.length > 0;
    // These are descriptive strings, not typed executable evidence assertions.
    // Presence of prose or an identically named source ref is not proof.
    if (requirements.evidenceRequirements.length) reasons.push("EVIDENCE_REQUIREMENTS_UNVERIFIED");
  }
  if (profile.spec.mode === "EXTERNAL_REASONER") reasons.push("EXTERNAL_REASONER_UNVERIFIED");
  const status = incompatible ? "INCOMPATIBLE" : reasons.length ? "INDETERMINATE" : "COMPATIBLE";
  const report = {schema: "evopilot-project-semantic-compatibility/v1", status, scope: input.scope,
    artifactSetDigest: artifact.artifactSetDigest, snapshotDigest: snapshot.snapshotDigest,
    skillDigest: artifact.spec.projectOntologySkill.skillDigest, provenanceDigest: digestObject(artifact.spec.provenance),
    bundleRef: {id: bundle.metadata.id, version: bundle.metadata.version, digest: digestObject(bundle)},
    harnessClosure: {profile: {...bundle.spec.profile}, components: bundle.spec.resolvedComponents.map((component: Document) =>
      ({id: component.id, version: component.version, digest: component.digest}))},
    requirementsDigest: requirements?.requirementsDigest ?? null, reasoningProfileDigest: profile.profileDigest,
    evaluationMode: "EXPLICIT_SNAPSHOT_FACTS_ONLY", reasons: reasons.sort(), matchedRequiredConceptIds: matched.sort(),
    missingRequiredConceptIds: missing.sort(), mismatchedMetaTypeConceptIds: wrongType.sort(), presentProhibitedConceptIds: prohibited.sort(),
    missingRelations: missingRelations.sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
    eligibleForExecution: false, bindingCreated: false,
    authority: {semanticCompatibilityOnly: true, harnessEligibilityIndependent: true, mayApprove: false, mayPublish: false, mayBind: false},
    nextAction: status === "COMPATIBLE" ? "review-project-semantic-binding" : status === "INCOMPATIBLE" ? "review-semantic-gap" : "review-semantic-compatibility-evidence"};
  return freeze({...report, compatibilityDigest: digestObject(report)});
}
