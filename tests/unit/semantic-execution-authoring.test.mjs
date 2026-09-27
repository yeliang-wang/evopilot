import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {semanticCurrentOwnerFixture} from "../helpers/semantic-current-owner-fixture.mjs";
import {createSemanticExecutionApplication, semanticExecutionImplementationDigest} from "../../packages/server/dist/application/semantic-execution-application.js";

async function fixture(t, options = {}) {
  const f = await semanticCurrentOwnerFixture(t, {publishedMaterials: true, runtimeDigest: semanticExecutionImplementationDigest, ...options});
  const app = createSemanticExecutionApplication(f.configuration, {governed: f.governed, lifecycle: f.lifecycleService,
    adapter: f.owners.adapter, now: f.time.get});
  const access = {currentAccess: f.ownerInputs.currentAccess};
  const input = structuredClone({identity: f.identity, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest, goalTarget: f.state.goalTarget});
  const rules = async () => {
    const basis = await app.planning(input, access);
    return {...input, basisDigest: basis.basisDigest, selection: f.state.contextPlan.actions[0].selection,
      business: f.state.outcomePlan.business,
      // Synthetic predicates only: they are explicitly declared, not generated
      // by the product from the text or ordinal position of an obligation.
      harness: basis.obligations.map((obligation, index) => ({id: "fixture-rule-" + index, obligation,
        evidenceKind: "synthetic-checks", path: ["ok"], predicate: {op: "EQUALS", value: true}})), selections: f.selected};
  };
  const inventory = () => {
    const dir = path.join(f.configuration.dataRoot, "project-semantic-bindings");
    return fs.readdirSync(dir, {recursive: true}).sort().filter(p => fs.statSync(path.join(dir, p)).isFile())
      .map(p => [p, fs.readFileSync(path.join(dir, p), "utf8")]);
  };
  return {...f, app, access, input, rules, inventory};
}
test("authoring reads verified choices and compiles explicit rules into an unpersisted usable declaration", async t => {
  const f = await fixture(t), before = f.inventory(), basis = await f.app.planning(f.input, f.access);
  assert.equal(basis.status, "EXPLICIT_RULES_REQUIRED"); assert.equal(basis.selection, null);
  assert.deepEqual(basis.businessRules, []); assert.deepEqual(basis.harnessRules, []);
  assert.deepEqual(basis.criteria, f.source.acceptanceCriteria);
  assert(basis.concepts.some(c => c.conceptId === "fixture:entity")); assert(basis.obligations.length > 1);
  assert.equal(basis.businessField, null); assert.equal(basis.productType, null);
  assert(Object.values(basis.authority).every(v => v === false));
  const draft = await f.app.draft(await f.rules(), f.access);
  assert.equal(draft.status, "DRAFT_NOT_PREPARED"); assert.equal(draft.persisted, false);
  assert(draft.coverageInputs.every(c => c.ruleIds.length === 0));
  assert.deepEqual(f.inventory(), before); assert.equal(f.calls(), 0);
  assert.throws(() => f.app.inspect(f.identity, f.access), {code: "UNAVAILABLE"});
  const prepared = await f.app.prepare(draft.declaration, f.access);
  assert.deepEqual(prepared.declaration, draft.declaration);
  const bound = await f.app.bind(f.identity, f.access), input = {identity: f.identity, bindingDigest: bound.bindingDigest};
  assert.equal((await f.app.resolve(input, f.access)).status, "PREPARED_NOT_DISPATCHED");
  await assert.rejects(f.app.dispatch(input, f.access), {code: "UNAVAILABLE"}); assert.equal(f.calls(), 0);
});
for (const [name, mutate, code] of [
  ["stale basis", v => {v.basisDigest = "sha256:" + "0".repeat(64);}, "DRIFT"],
  ["unknown concept", v => {v.selection.conceptIds = ["outside:concept"];}, "PERMISSION_DENIED"],
  ["unselected business concept", v => {v.selection.conceptIds = [];}, "DRIFT"],
  ["missing Harness obligation", v => {v.harness.pop();}, "INVALID"],
  ["extra Harness obligation", v => {v.harness[0].obligation.value = "forged";}, "INVALID"],
  ["duplicate rule identity", v => {v.harness[0].id = v.business[0].id;}, "INVALID"],
  ["executable predicate", v => {v.business[0].predicate = {op: "SHELL", command: "exit 0"};}, "UNSUPPORTED"],
  ["prototype selector", v => {v.business[0].path = ["__proto__"];}, "INVALID"],
  ["invented relations", v => {v.selection.relations = [{subjectConceptId: "fixture:entity", relationType: "forged", objectConceptId: "fixture:entity"}];}, "PERMISSION_DENIED"]
]) test(`authoring refuses ${name} without persistence or dispatch`, async t => {
  const f = await fixture(t), input = structuredClone(await f.rules()), before = f.inventory(); mutate(input);
  await assert.rejects(f.app.draft(input, f.access), {code});
  assert.deepEqual(f.inventory(), before); assert.equal(f.calls(), 0);
});
for (const field of ["outcomePlan", "contextPlan", "runtimeDigest", "authority", "coverage", "command"])
  test(`authoring refuses caller-owned ${field}`, async t => {
    const f = await fixture(t), value = {...await f.rules(), [field]: "injected"};
    assert.throws(() => f.app.draft(value, f.access), {code: "INVALID"}); assert.equal(f.calls(), 0);
  });
test("authoring captures input before await and never retains mutable caller selections", async t => {
  const f = await fixture(t), value = structuredClone(await f.rules()), expected = structuredClone(value.business);
  const pending = f.app.draft(value, f.access); value.business[0].predicate = {op: "EQUALS", value: "forged"};
  value.selection.conceptIds = []; value.selections.governed.policy.digest = "sha256:" + "0".repeat(64);
  const result = await pending; assert.deepEqual(result.declaration.outcomePlan.business, expected);
});
test("authoring rechecks live policy after reading a basis", async t => {
  const f = await fixture(t), value = await f.rules(), before = f.inventory();
  f.time.set(Date.parse(f.declarations.policy.validUntil));
  await assert.rejects(f.app.draft(value, f.access), {code: "PERMISSION_DENIED"}); assert.deepEqual(f.inventory(), before);
});
test("authoring refuses changed Runtime criteria even with the same Goal identity", async t => {
  const f = await fixture(t), value = await f.rules();
  f.changeGoal(g => {g.plan.targets[0].acceptanceCriteria.push("A changed criterion");});
  await assert.rejects(f.app.draft(value, f.access)); assert.equal(f.calls(), 0);
});
for (const [name, contextLimits, code] of [["output", {maxOutputBytes: 1}, "MATERIAL_LIMIT"], ["deadline", {timeoutMs: 1}, "TIMEOUT"]])
  test(`authoring shares a bounded ${name} ceiling across preparation reads`, async t => {
    const f = await fixture(t);
    const app = createSemanticExecutionApplication({...f.configuration, contextLimits}, {governed: f.governed,
      lifecycle: f.lifecycleService, adapter: f.owners.adapter, now: f.time.get});
    await assert.rejects(app.planning(f.input, f.access), {code}); assert.equal(f.calls(), 0);
  });
test("authoring refuses revoked Catalog access and cancellation", async t => {
  const f = await fixture(t), abort = new AbortController(); abort.abort();
  await assert.rejects(f.app.planning(f.input, {...f.access, signal: abort.signal}), {code: "CANCELLED"});
  f.policy.catalogs[0].permission = "DENIED"; fs.writeFileSync(f.configuration.policyPath, JSON.stringify(f.policy));
  await assert.rejects(f.app.planning(f.input, f.access), {code: "PERMISSION_DENIED"}); assert.equal(f.calls(), 0);
});
