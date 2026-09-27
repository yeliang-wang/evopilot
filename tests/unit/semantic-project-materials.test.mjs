import assert from "node:assert/strict";
import fs from "node:fs";
import {test} from "node:test";
import {verifySemanticProjectMaterials} from "../../packages/server/dist/domains/harness-template/semantic-project-materials.js";
import {digestObject, digestText} from "../../packages/server/dist/domains/harness-template/utils.js";

function fixture() {
  const f = JSON.parse(fs.readFileSync(new URL("../fixtures/semantic-catalog-materials.json", import.meta.url), "utf8"));
  const refs = f.generation.sets[0].refs, get = hash => f.materials[f.generation.entries.find(entry => entry.objectDigest === hash).path];
  return {artifactSet: get(refs.artifactSet), foundation: get(refs.foundation), proposal: get(refs.proposal), packs: refs.packs.map(get)};
}
function resign(value, field) {delete value[field]; value[field] = digestObject(value);}
function resignPack(pack) {delete pack.metadata.digest; pack.metadata.digest = digestObject(pack);}
const rejected = action => assert.throws(action, error => error.name === "SemanticCatalogError");
test("producer-format project fixture reconstructs foundation, Pack set, snapshot, projections, Skill and ArtifactSet", () => {
  const value = fixture(), before = JSON.stringify(value); verifySemanticProjectMaterials(value); assert.equal(JSON.stringify(value), before);
});
test("rehashed Foundation cannot change the fixed meta-model or authority", () => {
  for (const mutate of [f => f.metaTypes[0] = "BUSINESS_VALUE", f => f.relationTypes.pop(), f => f.authority.mayApprove = true]) {
    const value = fixture(); mutate(value.foundation); resign(value.foundation, "foundationDigest"); rejected(() => verifySemanticProjectMaterials(value));
  }
});
test("Foundation exact maximum is accepted and one-over budget is rejected", () => {
  const value = fixture(); verifySemanticProjectMaterials(value);
  value.foundation.limits.maxConcepts = 4097; resign(value.foundation, "foundationDigest");
  assert.throws(() => verifySemanticProjectMaterials(value), {code: "MATERIAL_INVALID"});
});
test("rehashed Pack cannot contain nested executable fields", () => {
  const value = fixture(); value.packs[0].spec.shapes.push({nested: {command: "must-not-run"}}); resignPack(value.packs[0]);
  assert.throws(() => verifySemanticProjectMaterials(value), {code: "MATERIAL_INVALID"});
});
test("PRIVATE Pack cannot be resolved into a community root", () => {
  const value = fixture(); value.packs[0].metadata.root = "PRIVATE_ORGANIZATION"; value.packs[0].metadata.visibility = "PRIVATE"; resignPack(value.packs[0]);
  value.proposal.resolvedPackSet.targetRoot = "COMMUNITY"; resign(value.proposal.resolvedPackSet, "packSetDigest"); resign(value.proposal, "proposalDigest");
  assert.throws(() => verifySemanticProjectMaterials(value), {code: "SCOPE_INVALID"});
});
test("Pack duplicates and missing exact imports fail before resolution", () => {
  const duplicate = fixture(); duplicate.packs.push(structuredClone(duplicate.packs[0]));
  assert.throws(() => verifySemanticProjectMaterials(duplicate), {code: "IDENTITY_CONFLICT"});
  const value = fixture(); value.packs[0].spec.imports.push({id: "missing", version: "1.0.0", digest: digestText("missing"), optional: false}); resignPack(value.packs[0]);
  assert.throws(() => verifySemanticProjectMaterials(value), {code: "MATERIAL_MISSING"});
});
test("producer-compatible optional alternate-version self-cycle is rejected", () => {
  const value = fixture(), pack = value.packs[0];
  pack.spec.imports.push({id: pack.metadata.id, version: "999.0.0", digest: digestText("missing"), optional: true}); resignPack(pack);
  assert.throws(() => verifySemanticProjectMaterials(value), {code: "DEPENDENCY_CYCLE"});
});
test("rehashed Pack-set concept and provenance fabrication is rejected", () => {
  for (const mutate of [set => set.concepts[0].definition = "forged", set => set.packs[0].provenance.author = "forged"]) {
    const value = fixture(); mutate(value.proposal.resolvedPackSet); resign(value.proposal.resolvedPackSet, "packSetDigest"); resign(value.proposal, "proposalDigest");
    assert.throws(() => verifySemanticProjectMaterials(value), {code: "MATERIAL_INVALID"});
  }
});
test("unapproved proposal and absent predecessor cannot produce a snapshot", () => {
  const value = fixture(); value.proposal.stage = "IN_REVIEW"; resign(value.proposal, "proposalDigest"); rejected(() => verifySemanticProjectMaterials(value));
  const other = fixture(); other.artifactSet.spec.snapshot.predecessorSnapshotDigest = digestText("missing");
  resign(other.artifactSet.spec.snapshot, "snapshotDigest"); resign(other.artifactSet, "artifactSetDigest"); rejected(() => verifySemanticProjectMaterials(other));
});
test("absent base Pack set and overlay references cannot be digest-only promises", () => {
  for (const mutate of [p => p.baseDigest = digestText("absent"), p => p.overlay = {id: "absent", version: "1.0.0", digest: digestText("absent")}]) {
    const value = fixture(); mutate(value.proposal); resign(value.proposal, "proposalDigest"); rejected(() => verifySemanticProjectMaterials(value));
  }
});
test("rehashed project projection cannot invent content even with a matching content hash", () => {
  const value = fixture(), projections = value.artifactSet.spec.projectionSet;
  const projection = projections.projections.find(p => p.status === "APPLICABLE"); projection.content += "forged"; projection.contentDigest = digestText(projection.content);
  resign(projections, "projectionSetDigest"); resign(value.artifactSet, "artifactSetDigest");
  assert.throws(() => verifySemanticProjectMaterials(value), {code: "MATERIAL_INVALID"});
});
test("rehashed Skill cannot invent concept guidance or executable authority", () => {
  for (const mutate of [s => s.spec.conceptIndex[0].definition = "forged", s => s.authority.mayMutateOntology = true]) {
    const value = fixture(); mutate(value.artifactSet.spec.projectOntologySkill); resign(value.artifactSet.spec.projectOntologySkill, "skillDigest"); resign(value.artifactSet, "artifactSetDigest");
    assert.throws(() => verifySemanticProjectMaterials(value), {code: "MATERIAL_INVALID"});
  }
});
test("rehashed ArtifactSet manifest, provenance and dependency-lock drift is rejected", () => {
  for (const mutate of [s => s.manifest.projectionInventory.pop(), s => s.provenance[0].packDigest = digestText("forged"), s => s.dependencyLock.packs = []]) {
    const value = fixture(); mutate(value.artifactSet.spec); resign(value.artifactSet, "artifactSetDigest"); rejected(() => verifySemanticProjectMaterials(value));
  }
});
