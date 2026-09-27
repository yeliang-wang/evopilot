import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {evaluateProjectSemanticCompatibility as evaluate} from "../../packages/server/dist/domains/harness-template/semantic-compatibility.js";
import {projectSemanticGap} from "../../packages/server/dist/application/project-semantic-gap.js";
import {digestObject} from "../../packages/server/dist/domains/harness-template/utils.js";

const source = JSON.parse(fs.readFileSync(new URL("../fixtures/semantic-catalog-materials.json", import.meta.url)));
const sign = (doc, key) => {delete doc[key]; doc[key] = digestObject(doc); return doc;};
function fixture() {
  const docs = structuredClone(Object.values(source.materials));
  const artifactSet = docs.find(doc => doc.kind === "ProjectOntologyArtifactSet"), bundle = docs.find(doc => doc.kind === "HarnessBundle"),
    reasoningProfile = docs.find(doc => doc.kind === "OntologyReasoningProfile");
  const requirements = {schema: "evopilot-harness-semantic-requirements/v1", foundationDigest: artifactSet.spec.foundationDigest,
    requiredConcepts: [{conceptId: "fixture:entity", metaType: "ENTITY", rationale: "synthetic", evidenceRefs: []}], prohibitedConcepts: [],
    relationRequirements: [], evidenceRequirements: [], authority: {descriptiveConstraintOnly: true, executable: false, provesEligibility: false, mayApprove: false, mayPublish: false}};
  bundle.spec.semanticRequirements = sign(requirements, "requirementsDigest");
  function resign() {
    sign(artifactSet.spec.snapshot, "snapshotDigest"); artifactSet.spec.snapshotDigest = artifactSet.spec.snapshot.snapshotDigest;
    sign(artifactSet, "artifactSetDigest"); sign(reasoningProfile, "profileDigest"); if (bundle.spec.semanticRequirements) sign(requirements, "requirementsDigest");
  }
  const input = {artifactSet, bundle, reasoningProfile, scope: structuredClone(source.generation.sets[0].scope)};
  return {input, requirements, artifactSet, bundle, reasoningProfile, resign, run: () => {resign(); return evaluate(input);}};
}
for (const [name, change, destination] of [
  ["compatible", () => {}, undefined],
  ["undeclared Harness", f => {delete f.bundle.spec.semanticRequirements;}, "HARNESS_DECLARATION_REVIEW"],
  ["concept mismatch", f => {f.requirements.requiredConcepts[0].conceptId = "missing";}, "ONTOLOGY_MATERIAL_REVIEW"],
  ["meta type mismatch", f => {f.requirements.requiredConcepts[0].metaType = "RULE";}, "ONTOLOGY_MATERIAL_REVIEW"],
  ["prohibited concept", f => {f.requirements.prohibitedConcepts = [{...f.requirements.requiredConcepts[0]}]; f.requirements.requiredConcepts = [];}, "ONTOLOGY_MATERIAL_REVIEW"],
  ["relation mismatch", f => {f.requirements.relationRequirements = [{subjectConceptId: "fixture:entity", relationType: "REQUIRES", objectConceptId: "missing"}];}, "ONTOLOGY_MATERIAL_REVIEW"],
  ["foundation mismatch", f => {f.requirements.foundationDigest = digestObject("different");}, "CROSS_CONTRACT_REVIEW"],
  ["unverified evidence", f => {f.requirements.evidenceRequirements = ["synthetic-evidence"];}, "EVIDENCE_QUALIFICATION"],
  ["unverified reasoning", f => {f.reasoningProfile.spec.mode = "EXTERNAL_REASONER"; f.reasoningProfile.spec.externalReasoner = {id: "synthetic-only"};
    f.reasoningProfile.authority.externalReasonerEvidenceOnly = true;}, "REASONING_QUALIFICATION"]
]) test(`gap handoff ${name} identifies review destination, not defect ownership or authority`, () => {
  const f = fixture(); change(f); const report = f.run(), before = JSON.stringify(report);
  const gap = projectSemanticGap(report, {projectId: f.input.scope.projectId, projectRevisionDigest: digestObject("project"), catalogId: "synthetic", inspectionDigest: digestObject("inspect")});
  assert.equal(gap.compatibilityStatus, report.status); assert.equal(gap.compatibilityDigest, report.compatibilityDigest);
  assert.equal(gap.status, destination ? "REVIEW_REQUIRED" : "NO_DECLARED_COMPATIBILITY_GAP");
  assert.deepEqual(gap.findings.map(f => f.destination), destination ? [destination] : []);
  assert.equal(gap.selectedSuccessor, null); assert.equal(gap.businessField, null); assert.equal(gap.eligibleForExecution, false);
  assert(Object.values(gap.authority).every(v => v === false)); assert(Object.isFrozen(gap.successorHandoff));
  assert.equal(gap.successorHandoff.destinationKind, "PREPARED_REVIEW_DIGEST"); assert.equal(gap.successorHandoff.preservesExistingRunPins, true);
  const {gapDigest, ...body} = gap; assert.equal(gapDigest, digestObject(body)); assert.equal(JSON.stringify(report), before);
});
test("explicit requirements can match a minimal one-concept map without execution authority", () => {
  const f = fixture(), before = JSON.stringify(f.input), r = evaluate(f.input);
  assert.equal(r.status, "COMPATIBLE"); assert.equal(r.bindingCreated, false); assert.equal(r.eligibleForExecution, false);
  assert.deepEqual(r.matchedRequiredConceptIds, ["fixture:entity"]); assert.equal(JSON.stringify(f.input), before);
  const {compatibilityDigest, ...core} = r; assert.equal(compatibilityDigest, digestObject(core)); assert(Object.isFrozen(r.authority));
});
test("legacy Bundle without semantic requirements is indeterminate, never silently dual-bound", () => {
  const f = fixture(); delete f.bundle.spec.semanticRequirements; const r = f.run();
  assert.equal(r.status, "INDETERMINATE"); assert.deepEqual(r.reasons, ["REQUIREMENTS_NOT_DECLARED"]);
});
for (const [name, change, reason] of [
  ["missing exact concept", f => {f.requirements.requiredConcepts[0].conceptId = "missing";}, "REQUIRED_CONCEPT_MISSING"],
  ["wrong meta type", f => {f.requirements.requiredConcepts[0].metaType = "RULE";}, "REQUIRED_META_TYPE_MISMATCH"],
  ["deprecated concept", f => {f.artifactSet.spec.snapshot.concepts[0].deprecated = true;}, "REQUIRED_CONCEPT_MISSING"],
  ["foundation skew", f => {f.requirements.foundationDigest = digestObject("different");}, "FOUNDATION_MISMATCH"],
  ["prohibited concept even with another requested type", f => {f.requirements.requiredConcepts = []; f.requirements.prohibitedConcepts = [{conceptId: "fixture:entity", metaType: "RULE", rationale: "", evidenceRefs: []}];}, "PROHIBITED_CONCEPT_PRESENT"],
  ["unproved relation", f => {f.requirements.relationRequirements = [{subjectConceptId: "fixture:entity", relationType: "REQUIRES", objectConceptId: "missing"}];}, "EXPLICIT_RELATION_MISSING"]
]) test(`incompatible: ${name}`, () => {const f = fixture(); change(f); const r = f.run(); assert.equal(r.status, "INCOMPATIBLE"); assert(r.reasons.includes(reason));});
test("matching an explicit relation is directional and needs both nondeprecated concepts", () => {
  const f = fixture(), original = f.artifactSet.spec.snapshot.concepts[0];
  f.artifactSet.spec.snapshot.concepts.push({...structuredClone(original), conceptId: "fixture:second"});
  original.relationships.push({relationType: "REQUIRES", targetConceptId: "fixture:second"});
  f.requirements.relationRequirements = [{subjectConceptId: "fixture:entity", relationType: "REQUIRES", objectConceptId: "fixture:second"}];
  assert.equal(f.run().status, "COMPATIBLE");
  f.requirements.relationRequirements[0] = {subjectConceptId: "fixture:second", relationType: "REQUIRES", objectConceptId: "fixture:entity"};
  assert.equal(f.run().status, "INCOMPATIBLE");
});
test("matching prose evidence names do not prove descriptive evidence requirements", () => {
  const f = fixture(); f.requirements.evidenceRequirements = ["source://synthetic"];
  const r = f.run(); assert.equal(r.status, "INDETERMINATE"); assert(r.reasons.includes("EVIDENCE_REQUIREMENTS_UNVERIFIED"));
});
test("required/prohibited overlap cannot be disguised by a fresh digest", () => {
  const f = fixture(); f.requirements.prohibitedConcepts = structuredClone(f.requirements.requiredConcepts);
  assert.throws(f.run, {code: "MATERIAL_INVALID"});
});
test("conflicting duplicate identity cannot be disguised by different rationale", () => {
  const f = fixture(); f.requirements.requiredConcepts.push({...f.requirements.requiredConcepts[0], rationale: "different"});
  assert.throws(f.run, {code: "IDENTITY_CONFLICT"});
});
test("mutated requirements digest is rejected", () => {
  const f = fixture(); f.requirements.requiredConcepts[0].conceptId = "different";
  assert.throws(() => evaluate(f.input), {code: "DIGEST_MISMATCH"});
});
test("unpublished Bundle and cross-project snapshot cannot enter comparison", () => {
  const f = fixture(); f.bundle.metadata.lifecycle = "draft"; assert.throws(f.run, {code: "MATERIAL_INVALID"});
  f.bundle.metadata.lifecycle = "published"; f.input.scope.projectId = "another"; assert.throws(f.run, {code: "SCOPE_INVALID"});
});
test("requirements cannot claim approval or execution authority", () => {
  const f = fixture(); f.requirements.authority.mayApprove = true; assert.throws(f.run, {code: "MATERIAL_INVALID"});
});
test("requirements comparison uses the pinned profile node ceiling", () => {
  const f = fixture(); f.reasoningProfile.spec.limits.maxNodes = 1;
  f.requirements.requiredConcepts.push({...f.requirements.requiredConcepts[0], conceptId: "extra"}); assert.throws(f.run, {code: "MATERIAL_LIMIT"});
});
test("external-reasoner evidence never becomes locally proved compatibility", () => {
  const f = fixture(); f.reasoningProfile.spec.mode = "EXTERNAL_REASONER";
  f.reasoningProfile.spec.externalReasoner = {id: "synthetic-only"}; f.reasoningProfile.authority.externalReasonerEvidenceOnly = true;
  const r = f.run(); assert.equal(r.status, "INDETERMINATE"); assert(r.reasons.includes("EXTERNAL_REASONER_UNVERIFIED"));
});
