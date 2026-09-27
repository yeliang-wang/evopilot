import assert from "node:assert/strict";
import fs from "node:fs";
import {test} from "node:test";
import {inspectSemanticMaterialBindings} from "../../packages/server/dist/domains/harness-template/semantic-material-bindings.js";
import {digestObject} from "../../packages/server/dist/domains/harness-template/utils.js";

function fixture() {
  const data = JSON.parse(fs.readFileSync(new URL("../fixtures/semantic-catalog-materials.json", import.meta.url), "utf8"));
  assert.equal(data.fixtureKind, "SOURCE_SYNTHETIC_ONLY");
  return {generation: data.generation, materials: new Map(Object.entries(data.materials))};
}
function entry(s, kind) {return s.generation.entries.find(entry => entry.kind === kind);}
function document(s, kind) {return s.materials.get(entry(s, kind).path);}
function resign(s, kind, field) {
  const e = entry(s, kind), doc = document(s, kind), old = e.objectDigest;
  const core = {...doc}; delete core[field]; doc[field] = digestObject(core); e.objectDigest = doc[field];
  for (const set of s.generation.sets) for (const role of Object.keys(set.refs)) if (set.refs[role] === old) set.refs[role] = doc[field];
  // This intermediate verifier assumes byte/graph transport already passed;
  // recompute only object/ref identities to exercise inner binding assertions.
}
test("real-format synthetic 17-entry materials pass intermediate bindings but never eligibility", () => {
  const result = inspectSemanticMaterialBindings(fixture());
  assert.equal(result.status, "MATERIAL_BINDINGS_INSPECTED"); assert.equal(result.eligibleForExecution, false);
  assert.equal(result.sets.length, 1); assert.equal(result.pending.length, 3);
});
test("every nonembedded material object digest is verified independently of file bytes", () => {
  const base = fixture();
  for (const e of base.generation.entries.filter(e => !e.parent)) {
    const s = fixture(); s.materials.get(e.path).injected = "untrusted";
    assert.throws(() => inspectSemanticMaterialBindings(s), {code: "DIGEST_MISMATCH"});
  }
});
test("unknown schemas and entry/object identity mismatches are rejected", () => {
  const s = fixture(); entry(s, "OntologyFoundation").schema = "unknown/v1";
  assert.throws(() => inspectSemanticMaterialBindings(s), {code: "MATERIAL_INVALID"});
  const other = fixture(); entry(other, "HarnessProfile").id = "forged-profile";
  assert.throws(() => inspectSemanticMaterialBindings(other), {code: "MATERIAL_INVALID"});
});
test("rehashed closure cannot point to an unrelated snapshot or downgrade publication", () => {
  for (const mutate of [doc => doc.snapshot.digest = digestObject("wrong"), doc => doc.status = "CANDIDATE"]) {
    const s = fixture(); mutate(document(s, "TerminalSemanticClosure")); resign(s, "TerminalSemanticClosure", "closureDigest");
    assert.throws(() => inspectSemanticMaterialBindings(s), {code: "MATERIAL_INVALID"});
  }
});
test("rehashed index, projections and report remain bound to the exact set", () => {
  for (const [kind, field, mutate] of [
    ["SemanticIndex", "indexDigest", doc => doc.snapshotDigest = digestObject("wrong")],
    ["SemanticProjectionSet", "projectionSetDigest", doc => doc.profileDigest = digestObject("wrong")],
    ["SemanticRoundTripReport", "reportDigest", doc => doc.status = "FAILED"]
  ]) {
    const s = fixture(); mutate(document(s, kind)); resign(s, kind, field);
    assert.throws(() => inspectSemanticMaterialBindings(s), {code: "MATERIAL_INVALID"});
  }
});
test("embedded Skill body is digest verified instead of treated as an instruction", () => {
  const s = fixture(); document(s, "ProjectOntologyArtifactSet").spec.projectOntologySkill.spec.readOnly = false;
  assert.throws(() => inspectSemanticMaterialBindings(s), {code: "DIGEST_MISMATCH"});
});
test("missing complete-set roles and cross-project refs cannot be digest-only promises", () => {
  for (const role of ["artifactSet", "closure", "foundation", "proposal", "profile", "index", "projectionSet", "roundTripReport", "incremental", "full", "skill"]) {
    const s = fixture(); s.generation.sets[0].refs[role] = digestObject("absent");
    assert.throws(() => inspectSemanticMaterialBindings(s), {code: "MATERIAL_MISSING"});
  }
  const s = fixture(); s.generation.sets[0].scope.projectId = "other";
  assert.throws(() => inspectSemanticMaterialBindings(s), {code: "MATERIAL_MISSING"});
});
test("unsupported extra material kind cannot hide behind a valid object digest", () => {
  const s = fixture(); entry(s, "OntologyFoundation").kind = "ExecutablePlugin";
  assert.throws(() => inspectSemanticMaterialBindings(s), {code: "UNSUPPORTED"});
});
