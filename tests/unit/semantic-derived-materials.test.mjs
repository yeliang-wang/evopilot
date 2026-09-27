import assert from "node:assert/strict";
import fs from "node:fs";
import {test} from "node:test";
import {Ajv2020} from "ajv/dist/2020.js";
import {semanticConsumptionSchemas, semanticSchemaSources} from "../../packages/server/dist/domains/harness-template/semantic-schemas.js";
import {validateSemanticDocument} from "../../packages/server/dist/domains/harness-template/semantic-schema-validation.js";
import {inspectSemanticDerivedMaterials, verifySemanticDerivations} from "../../packages/server/dist/domains/harness-template/semantic-derived-materials.js";
import {digestObject, digestText} from "../../packages/server/dist/domains/harness-template/utils.js";

function fixture() {
  const value = JSON.parse(fs.readFileSync(new URL("../fixtures/semantic-catalog-materials.json", import.meta.url), "utf8"));
  assert.equal(value.fixtureKind, "SOURCE_SYNTHETIC_ONLY");
  return {generation: value.generation, materials: new Map(Object.entries(value.materials))};
}
function inputs() {
  const f = fixture(), refs = f.generation.sets[0].refs;
  const get = role => f.materials.get(f.generation.entries.find(entry => entry.objectDigest === refs[role]).path);
  return {snapshot: get("artifactSet").spec.snapshot, profile: get("profile"), index: get("index"), projections: get("projectionSet"),
    incremental: get("incremental"), full: get("full"), report: get("roundTripReport")};
}
function resign(value, field) {delete value[field]; value[field] = digestObject(value);}

test("all 17 pinned schema contracts compile without remote loading", () => {
  const ajv = new Ajv2020({strict: true, ownProperties: true});
  assert.equal(Object.keys(semanticConsumptionSchemas).length, 17);
  for (const [name, schema] of Object.entries(semanticConsumptionSchemas)) {
    assert.equal(typeof ajv.compile(schema), "function");
    assert.match(semanticSchemaSources[name].sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(semanticSchemaSources[name].source, `schemas/${name}.schema.json`);
  }
});
test("full-format synthetic materials and nested schemas pass without granting eligibility", () => {
  const f = fixture(), before = JSON.stringify([...f.materials]);
  const result = inspectSemanticDerivedMaterials(f);
  assert.equal(result.status, "DERIVED_MATERIALS_INSPECTED"); assert.equal(result.eligibleForExecution, false);
  assert.equal(result.sets.length, 1); assert.equal(result.pending.length, 3);
  assert(result.limitations.includes("incremental-change-seed-proof-not-supplied"));
  assert.equal(JSON.stringify([...f.materials]), before);
});
test("schema validation rejects missing fields, added fields and coercible wrong types without mutation", () => {
  for (const mutate of [value => delete value.statistics, value => value.additional = true, value => value.statistics.nodeCount = "1"]) {
    const value = inputs().index; mutate(value); const before = JSON.stringify(value);
    assert.throws(() => validateSemanticDocument(value), {code: "MATERIAL_INVALID"});
    assert.equal(JSON.stringify(value), before);
  }
  assert.throws(() => validateSemanticDocument({schema: "untrusted/v1", $schema: "https://attacker.invalid/"}), {code: "UNSUPPORTED"});
});
test("derived computation and five projection formats match the pinned producer fixture", () => {
  const value = inputs(), before = JSON.stringify(value); verifySemanticDerivations(value);
  assert.equal(JSON.stringify(value), before);
});

for (const [name, role, field, mutate] of [
  ["index definition", "index", "indexDigest", value => value.nodes[0].definitionDigest = digestObject("forged")],
  ["index statistics", "index", "indexDigest", value => value.statistics.assetCount++],
  ["index node metadata", "index", "indexDigest", value => value.nodes[0].label = "forged"],
  ["full outcome", "full", "computationDigest", value => value.outcomeDigest = digestObject("forged")],
  ["full proof", "full", "computationDigest", value => value.proofDigest = digestObject("forged")],
  ["incremental outcome", "incremental", "computationDigest", value => value.outcomeDigest = digestObject("forged")],
  ["full evaluated set", "full", "computationDigest", value => {value.telemetry.evaluatedConceptIds = []; value.telemetry.evaluatedConceptCount = 0;}],
  ["incremental unknown concept", "incremental", "computationDigest", value => value.telemetry.evaluatedConceptIds = ["unknown"]],
  ["false telemetry", "full", "computationDigest", value => value.telemetry.nodeCount++],
  ["authority escalation", "full", "computationDigest", value => value.authority.mayPublish = true],
  ["projection content", "projections", "projectionSetDigest", value => {value.projections[0].content += " "; value.projections[0].contentDigest = digestText(value.projections[0].content);}],
  ["missing projection", "projections", "projectionSetDigest", value => value.projections.pop()],
  ["invented canonical semantics", "projections", "projectionSetDigest", value => {value.canonicalSemanticDigest = digestObject("forged"); for (const item of value.projections) item.canonicalSemanticDigest = value.canonicalSemanticDigest;}],
  ["false round-trip evidence", "report", "reportDigest", value => value.bindingChecks.profileConsistent = false],
  ["false equivalence", "report", "reportDigest", value => {value.computationEquivalence.equivalentAuthoritativeOutcome = false; resign(value.computationEquivalence, "equivalenceDigest");}]
]) test(`rehashed ${name} is rejected independently of material object digest`, () => {
  const value = inputs(); mutate(value[role]); resign(value[role], field);
  assert.throws(() => verifySemanticDerivations(value), {code: "MATERIAL_INVALID"});
});
test("matching forged incremental and full outcomes do not establish equivalence", () => {
  const value = inputs();
  for (const mode of ["incremental", "full"]) {value[mode].outcomeDigest = digestObject("same-forged-outcome"); resign(value[mode], "computationDigest");}
  assert.throws(() => verifySemanticDerivations(value), {code: "MATERIAL_INVALID"});
});
test("node/asset entry budget exact boundary passes and one below fails", () => {
  const value = inputs(), count = Math.max(value.snapshot.concepts.length, value.index.assets.length);
  verifySemanticDerivations(value, {entries: count});
  assert(count > 1); assert.throws(() => verifySemanticDerivations(value, {entries: count - 1}), {code: "ENTRY_LIMIT"});
});
test("computation elapsed and concurrency limits cannot be increased through telemetry", () => {
  for (const [field, bound] of [["elapsedMs", "maxWallTimeMs"], ["concurrency", "maxConcurrentTasks"]]) {
    const value = inputs(); value.full.telemetry[field] = value.profile.spec.limits[bound] + 1; resign(value.full, "computationDigest");
    assert.throws(() => verifySemanticDerivations(value), {code: "BUDGET_INVALID"});
  }
});
test("non-external reasoning mode rejects injected external evidence", () => {
  const value = inputs(); value.full.externalReasonerEvidence = {}; resign(value.full, "computationDigest");
  assert.throws(() => verifySemanticDerivations(value), {code: "MATERIAL_INVALID"});
});
