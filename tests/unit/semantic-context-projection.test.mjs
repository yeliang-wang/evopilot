import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {projectSemanticContext, resolveSemanticContextLimits} from "../../packages/server/dist/domains/harness-template/semantic-context-slice.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";
const source = JSON.parse(fs.readFileSync(new URL("../fixtures/semantic-compatible-catalog-materials.json", import.meta.url)));
const sign = (obj, field) => {delete obj[field]; obj[field] = d(obj); return obj;};
// Pure algorithm fixture, not producer publication/full-closure acceptance.
function material(count = 3, edges = []) {
  const all = Object.values(structuredClone(source.materials));
  const artifactSet = all.find(item => item.kind === "ProjectOntologyArtifactSet"), bundle = all.find(item => item.kind === "HarnessBundle"), reasoningProfile = all.find(item => item.kind === "OntologyReasoningProfile");
  const snapshot = artifactSet.spec.snapshot, template = snapshot.concepts[0];
  snapshot.concepts = Array.from({length: count}, (_, n) => ({...structuredClone(template), conceptId: `fixture:n${n}`, label: `Label ${n}`, definition: `Definition ${n}`,
    relationships: edges.filter(edge => edge.subjectConceptId === `fixture:n${n}`).map(edge => ({relationType: edge.relationType, targetConceptId: edge.objectConceptId})), conceptDigest: d(`concept-${n}`)}));
  sign(snapshot, "snapshotDigest"); artifactSet.spec.snapshotDigest = snapshot.snapshotDigest; sign(artifactSet, "artifactSetDigest");
  const requirements = bundle.spec.semanticRequirements;
  requirements.requiredConcepts = snapshot.concepts.map(({conceptId}) => ({conceptId, metaType: "ENTITY", rationale: "", evidenceRefs: []}));
  requirements.relationRequirements = edges; sign(requirements, "requirementsDigest");
  return {artifactSet, bundle, reasoningProfile, scope: source.generation.sets[0].scope};
}
const selection = (conceptIds, relations = []) => ({schema: "evopilot-semantic-context-selection/v1", reasoning: "EXPLICIT_ONLY", conceptIds, relations});
const edge = (a, b) => ({subjectConceptId: `fixture:n${a}`, relationType: "REQUIRES", objectConceptId: `fixture:n${b}`});
const project = (docs, chosen, overrides) => projectSemanticContext({...docs, selection: chosen, limits: resolveSemanticContextLimits(overrides), check: () => {}});
test("only selected edge and its endpoints are projected, not neighbors or unrelated concepts", () => {
  const docs = material(4, [edge(0, 1), edge(1, 2)]), result = project(docs, selection([], [edge(0, 1)]));
  assert.deepEqual(result.content.concepts.map(item => item.conceptId), ["fixture:n0", "fixture:n1"]);
  assert.deepEqual(result.content.relations, [edge(0, 1)]);
  assert(!JSON.stringify(result).includes("Definition 2")); assert(!JSON.stringify(result).includes("Definition 3"));
});
test("selection order is canonical and changing exact subset changes selection digest", () => {
  const docs = material(4, [edge(0, 1), edge(1, 2)]);
  assert.deepEqual(project(docs, selection(["fixture:n1", "fixture:n0"], [edge(1, 2), edge(0, 1)])),
    project(docs, selection(["fixture:n0", "fixture:n1"], [edge(0, 1), edge(1, 2)])));
  assert.notEqual(project(docs, selection(["fixture:n0"])).selectionDigest, project(docs, selection(["fixture:n1"])).selectionDigest);
});
test("exact concept ceiling accepts and one over rejects without truncation", () => {
  const docs = material(129), ids = docs.artifactSet.spec.snapshot.concepts.map(item => item.conceptId);
  assert.equal(project(docs, selection(ids.slice(0, 128))).content.concepts.length, 128);
  assert.throws(() => project(docs, selection(ids)), {code: "MATERIAL_LIMIT"});
});
test("edge endpoint expansion counts against reduced concept ceiling", () => {
  const docs = material(3, [edge(0, 1)]);
  assert.throws(() => project(docs, selection([], [edge(0, 1)]), {maxConcepts: 1}), {code: "MATERIAL_LIMIT"});
  assert.equal(project(docs, selection([], [edge(0, 1)]), {maxConcepts: 2}).content.concepts.length, 2);
});
test("exact relation ceiling accepts and one over rejects without partial output", () => {
  const edges = Array.from({length: 257}, (_, i) => edge(Math.floor(i / 20), i % 20)), docs = material(20, edges);
  assert.equal(project(docs, selection([], edges.slice(0, 256))).content.relations.length, 256);
  assert.throws(() => project(docs, selection([], edges)), {code: "EDGE_LIMIT"});
});
test("duplicate, reversed, inferred-only and extra-field edges do not match declarations", () => {
  const docs = material(3, [edge(0, 1)]);
  for (const edges of [[edge(0, 1), edge(0, 1)], [edge(1, 0)], [edge(0, 2)], [{...edge(0, 1), instructions: "execute"}]])
    assert.throws(() => project(docs, selection([], edges)));
});
test("lower reasoning-profile node limit and unsupported reasoner fail closed", () => {
  const docs = material(3); docs.reasoningProfile.spec.limits.maxNodes = 2; sign(docs.reasoningProfile, "profileDigest");
  assert.throws(() => project(docs, selection(["fixture:n0"])), {code: "MATERIAL_LIMIT"});
  docs.reasoningProfile.spec.limits.maxNodes = 10000; docs.reasoningProfile.spec.mode = "UNSUPPORTED"; sign(docs.reasoningProfile, "profileDigest");
  assert.throws(() => project(docs, selection([])));
});
test("projection cooperatively checks cancellation during selection", () => {
  let checks = 0;
  assert.throws(() => projectSemanticContext({...material(3), selection: selection(["fixture:n0", "fixture:n1"]),
    limits: resolveSemanticContextLimits(), check: () => {if (++checks === 3) throw new Error("synthetic-cancel");}}), /synthetic-cancel/);
});
