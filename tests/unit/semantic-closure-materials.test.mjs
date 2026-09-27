import assert from "node:assert/strict";
import fs from "node:fs";
import {test} from "node:test";
import {inspectSemanticClosureMaterials, verifySemanticClosureReferences} from "../../packages/server/dist/domains/harness-template/semantic-closure-materials.js";
import {digestObject, digestText} from "../../packages/server/dist/domains/harness-template/utils.js";

function fixture() {
  const data = JSON.parse(fs.readFileSync(new URL("../fixtures/semantic-catalog-materials.json", import.meta.url), "utf8"));
  assert.equal(data.fixtureKind, "SOURCE_SYNTHETIC_ONLY");
  return {generation: data.generation, materials: new Map(Object.entries(data.materials))};
}
function input() {
  const f = fixture(), refs = f.generation.sets[0].refs;
  const resolve = hash => f.materials.get(f.generation.entries.find(entry => entry.objectDigest === hash).path);
  const set = {};
  for (const name of ["artifactSet", "closure", "foundation", "proposal", "profile", "index", "projectionSet", "roundTripReport", "incremental", "full"])
    set[name] = resolve(refs[name]);
  set.packs = refs.packs.map(resolve);
  set.support = refs.support.map(item => ({binding: item.binding, document: resolve(item.ref)}));
  set.harnessAssets = refs.harnessAssets.map(item => ({entry: item.entry, document: resolve(item.ref)}));
  return set;
}
function resign(value, field) {delete value[field]; value[field] = digestObject(value);}
const rejected = action => assert.throws(action, error => error.name === "SemanticCatalogError");
test("full-format closure and canonical generation metadata pass without execution authority", () => {
  const f = fixture(), before = JSON.stringify({generation: f.generation, materials: [...f.materials]});
  const result = inspectSemanticClosureMaterials(f);
  assert.equal(result.status, "MATERIAL_CLOSURE_INSPECTED"); assert.equal(result.eligibleForExecution, false);
  assert.equal(result.sets.length, 1); assert(result.pending.includes("production-validator-composition"));
  assert.equal(JSON.stringify({generation: f.generation, materials: [...f.materials]}), before);
});
test("independent support/reference checks accept the positive fixture", () => verifySemanticClosureReferences(input()));
for (const [label, mutate] of [
  ["missing support material", set => set.support.pop()],
  ["duplicate support identity", set => set.support.push(structuredClone(set.support[0]))],
  ["support binding digest", set => set.support[0].binding.digest = digestText("forged")],
  ["lock points to evaluation", set => set.closure.dependencyLocks = [set.support[1].binding]],
  ["evaluation points to lock", set => set.closure.evaluations = [{...set.support[0].binding, kind: "Evaluation"}]],
  ["rollback points to unrelated evidence", set => set.closure.rollbackLinks = [set.support[1].binding]],
  ["missing Harness component", set => set.harnessAssets = set.harnessAssets.filter(item => item.entry.kind !== "HarnessComponent")],
  ["duplicate Harness identity", set => set.harnessAssets.push(structuredClone(set.harnessAssets[0]))],
  ["closure asset digest", set => set.closure.harnessAssets[0].digest = digestText("forged")],
  ["semantic index asset digest", set => set.index.assets[0].digest = digestText("forged")],
  ["unpublished Harness entry", set => set.harnessAssets[0].entry.lifecycle = "draft"],
  ["profile identity", set => set.closure.reasoningProfile.id = "forged"],
  ["graph statistics", set => set.closure.graphIndex.statistics.nodeCount++],
  ["projection inventory", set => set.closure.projectionSet.formats.pop()],
  ["publication version", set => set.closure.publication.version = "4.8.1"],
  ["release authority", set => set.closure.authority.grantsReleaseAuthority = true],
  ["extra authority field", set => set.closure.authority.hiddenPermission = true]
]) test(`rehashed ${label} is not a valid closure`, () => {
  const set = input(); mutate(set); resign(set.closure, "closureDigest"); rejected(() => verifySemanticClosureReferences(set));
});
test("Bundle profile/component references require the exact supplied asset digests", () => {
  for (const mutate of [bundle => bundle.spec.profile.digest = digestText("forged"), bundle => bundle.spec.resolvedComponents[0].digest = digestText("forged")]) {
    const set = input(), bundle = set.harnessAssets.find(item => item.entry.kind === "HarnessBundle"); mutate(bundle.document);
    bundle.entry.assetDigest = digestObject(bundle.document);
    for (const bindings of [set.closure.harnessAssets, set.index.assets]) bindings.find(item => item.kind === "HarnessBundle").digest = bundle.entry.assetDigest;
    resign(set.closure, "closureDigest"); rejected(() => verifySemanticClosureReferences(set));
  }
});
for (const [label, mutate] of [
  ["visibility downgrade", f => {for (const entry of f.generation.entries) entry.visibility = "PUBLIC";}],
  ["forged provenance", f => f.generation.entries[0].provenance.source = "ForgedProducer"],
  ["altered dependency graph", f => f.generation.entries.find(entry => entry.kind === "TerminalSemanticClosure").dependencies.pop()],
  ["unknown set reference", f => f.generation.sets[0].refs.unrecognized = f.generation.sets[0].refs.foundation],
  ["duplicate set", f => f.generation.sets.push(structuredClone(f.generation.sets[0]))],
  ["extra material", f => f.materials.set("semantic-catalog/materials/unused.json", {content: "unreferenced"})],
  ["extra supported entry", f => {const source = f.generation.entries.find(entry => entry.kind === "OntologyFoundation"); f.generation.entries.push({...source, id: "alternate"});}],
  ["noncanonical ordering", f => f.generation.entries.reverse()]
]) test(`rehashed generation rejects ${label}`, () => {
  const f = fixture(); mutate(f); resign(f.generation, "generationDigest"); rejected(() => inspectSemanticClosureMaterials(f));
});
test("canonical material serialization cannot be replaced by a digest-consistent alternate byte format", () => {
  const f = fixture(), entry = f.generation.entries.find(entry => entry.kind === "OntologyFoundation"), document = f.materials.get(entry.path);
  const bytes = JSON.stringify(document, null, 2), oldPath = entry.path;
  entry.fileDigest = digestText(bytes); entry.bytes = Buffer.byteLength(bytes); entry.path = `semantic-catalog/materials/${entry.fileDigest.slice(7)}.json`;
  f.materials.delete(oldPath); f.materials.set(entry.path, document); resign(f.generation, "generationDigest");
  assert.throws(() => inspectSemanticClosureMaterials(f), {code: "DIGEST_MISMATCH"});
});
