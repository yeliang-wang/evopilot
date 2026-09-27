import assert from "node:assert/strict";
import test from "node:test";
import {compareTraceDefinitions, createTracePlan, auditTracePlan} from "../../scripts/audit-semantic-convergence-trace.mjs";

// Entirely synthetic expectations. Exact real Target projection is a separate
// read-only local check; private historical sources never enter this fixture.
const fixture = () => ({schema: "test-only", product: "runtime", target: {fileDigest: "pinned"},
  scope: [{pointer: "/scope/include/0", statement: "retain original requirements", digest: "scope-digest"}],
  roadmapBindings: [{roadmapDigest: "roadmap"}], sourceEvidence: [{digest: "original"}],
  requirements: [
    {id: "CURRENT", pointer: "/acceptance/0", definitionDigest: "current", definition: {requiredEvidence: "exact independent behavior evidence"},
      lineage: null, retentionCriterion: null, machineVariants: ["RC01-M1"], validator: null},
    {id: "OLD", pointer: "/inheritedAcceptance/0", definitionDigest: "old", definition: {requiredEvidence: "original evidence and all negative variants"},
      lineage: {origin: "frozen-source", criterionDigest: "old"}, retentionCriterion: "R-C01", machineVariants: [], validator: null}],
  journeys: [{id: "RC01", startingState: "exact installed bytes", terminalState: "independent assertions passed", hosts: ["qualified Host", "designated-human WorkBuddy"],
    prohibitedEffects: ["no publication"], machineVariants: [{id: "RC01-M1", coversAcceptanceIds: ["CURRENT"]}]}],
  historicalSchemeInventory: "NOT_RECONCILED", formalAcceptance: "NOT_RUN", targetCriteriaClosed: 0, grantsProductAuthority: false});
const validator = r => ({id: `validate-${r.id}`, criterionId: r.id, definitionDigest: r.definitionDigest,
  requiredEvidence: r.definition.requiredEvidence, entrypoint: `tests/oracles/${r.id}.mjs#validate`, assertions: ["independent expected result"]});

test("trace comparison preserves missing installed validators and inherited routing as explicit gaps", () => {
  const expected = fixture(); const input = structuredClone(expected); const before = structuredClone(input);
  const result = compareTraceDefinitions(expected, input);
  assert.deepEqual(result.counts, {requirements: 2, scopeClauses: 1, inheritedRequirements: 1, declaredValidators: 0, missingValidators: 2, unmappedInherited: 1});
  assert.deepEqual(result.gaps, [{id: "CURRENT", code: "INDEPENDENT_VALIDATOR_MISSING"},
    {id: "OLD", code: "INHERITED_EXECUTABLE_ROUTE_MISSING"}, {id: "OLD", code: "INDEPENDENT_VALIDATOR_MISSING"}]);
  assert.deepEqual(input, before);
});
test("validator declarations never prove implementation, independence or historical inventory coverage", () => {
  const expected = fixture(); const input = structuredClone(expected);
  input.requirements.forEach(r => r.validator = validator(r));
  const result = compareTraceDefinitions(expected, input);
  assert.equal(result.counts.declaredValidators, 2);
  assert.equal(result.gaps.filter(g => g.code === "VALIDATOR_IMPLEMENTATION_AND_INDEPENDENCE_UNVERIFIED").length, 2);
  assert.equal(result.counts.unmappedInherited, 1);
  assert.equal(Object.hasOwn(result, "status"), false);
});
const mutations = [
  ["removed requirement", x => x.requirements.pop(), "REQUIREMENT_SET_MISMATCH"],
  ["duplicate requirement", x => x.requirements[1] = structuredClone(x.requirements[0]), "DUPLICATE_REQUIREMENT"],
  ["reordered requirements", x => x.requirements.reverse(), "REQUIREMENT_DRIFT"],
  ["changed requirement with rehashed digest", x => {x.requirements[0].definition.requiredEvidence = "weaker"; x.requirements[0].definitionDigest = "rehash";}, "REQUIREMENT_DRIFT"],
  ["missing lineage", x => x.requirements[1].lineage = null, "REQUIREMENT_DRIFT"],
  ["changed scope", x => x.scope[0].statement = "exclude old requirements", "TRACE_BINDING_DRIFT:scope"],
  ["changed roadmap", x => x.roadmapBindings = [], "TRACE_BINDING_DRIFT:roadmapBindings"],
  ["removed source evidence", x => x.sourceEvidence = [], "TRACE_BINDING_DRIFT:sourceEvidence"],
  ["invented original inventory closure", x => x.historicalSchemeInventory = "COMPLETE", "TRACE_BINDING_DRIFT:historicalSchemeInventory"],
  ["uncovered current behavior", x => x.requirements[0].machineVariants = [], "CURRENT_ROUTE_DRIFT"],
  ["duplicate route", x => x.requirements[0].machineVariants.push("RC01-M1"), "DUPLICATE_MACHINE_VARIANT"],
  ["unknown route", x => x.requirements[0].machineVariants = ["RC99"], "UNKNOWN_MACHINE_VARIANT"],
  ["blanket inherited routing", x => x.requirements[1].machineVariants = ["RC01-M1"], "UNREVIEWED_INHERITED_ROUTE"],
  ["weakened terminal state", x => x.journeys[0].terminalState = "screenshot", "TRACE_BINDING_DRIFT:journeys"],
  ["missing Host", x => x.journeys[0].hosts.pop(), "TRACE_BINDING_DRIFT:journeys"],
  ["missing prohibition", x => x.journeys[0].prohibitedEffects = [], "TRACE_BINDING_DRIFT:journeys"],
  ["invented acceptance", x => x.formalAcceptance = "PASS", "TRACE_BINDING_DRIFT:formalAcceptance"],
  ["bulk closure", x => x.targetCriteriaClosed = 2, "TRACE_BINDING_DRIFT:targetCriteriaClosed"],
  ["extra command", x => x.command = "touch sentinel", "TRACE_FIELDS_INVALID"],
  ["wrong validator criterion", x => {x.requirements[0].validator = {...validator(x.requirements[0]), criterionId: "OLD"};}, "VALIDATOR_CONTRACT_MISMATCH"],
  ["generic validator evidence", x => {x.requirements[0].validator = {...validator(x.requirements[0]), requiredEvidence: "npm test passed"};}, "VALIDATOR_CONTRACT_MISMATCH"],
  ["empty assertions", x => {x.requirements[0].validator = {...validator(x.requirements[0]), assertions: []};}, "CONCRETE_ASSERTIONS_REQUIRED"],
  ["shell entrypoint", x => {x.requirements[0].validator = {...validator(x.requirements[0]), entrypoint: "node test.mjs; touch sentinel"};}, "VALIDATOR_ENTRYPOINT_INVALID"],
  ["relative escape", x => {x.requirements[0].validator = {...validator(x.requirements[0]), entrypoint: "../escape.mjs#validate"};}, "VALIDATOR_ENTRYPOINT_INVALID"],
  ["duplicate validator", x => {x.requirements.forEach(r => r.validator = validator(r)); x.requirements[1].validator.id = x.requirements[0].validator.id;}, "DUPLICATE_VALIDATOR_ID"],
  ["aggregate entrypoint", x => {x.requirements.forEach(r => r.validator = validator(r)); x.requirements[1].validator.entrypoint = x.requirements[0].validator.entrypoint;}, "GENERIC_AGGREGATE_VALIDATOR_FORBIDDEN"]
];
for (const [name, mutate, code] of mutations) test(`trace audit rejects ${name}`, () => {
  const expected = fixture(); const input = structuredClone(expected); mutate(input);
  assert.throws(() => compareTraceDefinitions(expected, input), error => error.code.startsWith(code));
});
test("production trace audit rejects unbound Target bytes before trusting a self-consistent trace", () => {
  const bytes = Buffer.from(JSON.stringify({schema: "evopilot-evolution-target/v1", status: "APPROVED"}));
  for (const product of ["runtime", "expert"]) {
    assert.throws(() => createTracePlan(product, bytes), /TARGET_DIGEST_MISMATCH/);
    assert.throws(() => auditTracePlan(product, bytes, fixture()), /TARGET_DIGEST_MISMATCH/);
  }
});
