import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {semanticCurrentOwnerFixture} from "../helpers/semantic-current-owner-fixture.mjs";
import {createSemanticExecutionApplication, semanticExecutionImplementationDigest} from "../../packages/server/dist/application/semantic-execution-application.js";

async function fixture(t, options = {}) {
  const f = await semanticCurrentOwnerFixture(t, {publishedMaterials: true, runtimeDigest: semanticExecutionImplementationDigest, ...options});
  const owners = {governed: f.governed, lifecycle: f.lifecycleService, adapter: f.owners.adapter, now: f.time.get};
  const app = createSemanticExecutionApplication(f.configuration, owners), access = {currentAccess: f.ownerInputs.currentAccess};
  const value = structuredClone({identity: f.identity, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest,
    goalTarget: f.state.goalTarget, contextPlan: f.state.contextPlan, outcomePlan: f.state.outcomePlan, selections: f.selected});
  const coverage = f.source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: ["units"]}));
  const prepared = async () => {await app.prepare(value, access); const binding = await app.bind(f.identity, access);
    const input = {identity: f.identity, bindingDigest: binding.bindingDigest}; return {binding, input};};
  const reviewed = async () => {const p = await prepared(), review = await app.review({...p.input, coverage}, access);
    await app.approveReview({...p.input, reviewDigest: review.reviewDigest, decision: "APPROVE"}, access); return p;};
  return {...f, app, appOwners: owners, access, value, coverage, prepared, reviewed};
}
test("fixed application uses current published material through preparation, restart, review, dispatch and dual outcome", async t => {
  const f = await fixture(t); const plan = await f.app.prepare(f.value, f.access);
  assert.equal(plan.status, "PREPARED_NOT_APPROVED"); assert.equal(plan.authority.mayDispatch, false);
  const restart = createSemanticExecutionApplication(f.configuration, f.appOwners);
  assert.deepEqual(await restart.inspect(f.identity, f.access), plan);
  // The composed application has no currentHarness/currentExecution callback.
  f.state.harness.registryDigest = "sha256:" + "0".repeat(64); f.state.contextPlan = undefined; f.state.outcomePlan = undefined;
  const binding = await restart.bind(f.identity, f.access), input = {identity: f.identity, bindingDigest: binding.bindingDigest};
  assert.equal(binding.runtimeDigest, semanticExecutionImplementationDigest);
  assert.equal(binding.eligibleForExecution, false);
  assert.equal((await restart.resolve(input, f.access)).status, "PREPARED_NOT_DISPATCHED");
  await assert.rejects(restart.dispatch(input, f.access), {code: "UNAVAILABLE"}); assert.equal(f.calls(), 0);
  const review = await restart.review({...input, coverage: f.coverage}, f.access);
  assert.throws(() => restart.approveReview({...input, reviewDigest: review.reviewDigest, decision: "REJECT"}, f.access), {code: "INVALID"});
  const approved = await restart.approveReview({...input, reviewDigest: review.reviewDigest, decision: "APPROVE"}, f.access);
  assert.equal(approved.decision, "APPROVE");
  const receipt = await restart.dispatch(input, f.access); assert.equal(receipt.eligibleForCompletion, false);
  assert.deepEqual(await restart.dispatch(input, f.access), receipt); assert.equal(f.calls(), 1);
  const outcome = await restart.evaluate(input, f.access); assert.equal(outcome.status, "INDETERMINATE"); assert.equal(outcome.eligibleForCompletion, false);
  assert(outcome.harness.missingObligationDigests.length > 0); assert.equal(outcome.business.status, "INDETERMINATE");
});
test("old runtime identity cannot be copied from binding into fixed current state", async t => {
  const f = await fixture(t, {runtimeDigest: "sha256:" + "0".repeat(64)});
  await assert.rejects(f.app.prepare(f.value, f.access), {code: "DRIFT"}); assert.equal(f.calls(), 0);
});
test("historical synthetic Catalog metadata cannot enable the fixed application", async t => {
  const f = await fixture(t, {publishedMaterials: false}); await assert.rejects(f.app.prepare(f.value, f.access), {code: "DRIFT"});
});
test("mutable preparation input is captured before the asynchronous material read", async t => {
  const f = await fixture(t), original = structuredClone(f.value), pending = f.app.prepare(f.value, f.access);
  f.value.goalTarget.objective = "changed"; f.value.contextPlan.actions = [];
  assert.deepEqual((await pending).declaration, original);
});
for (const field of ["runId", "requestDigest", "selection", "permissions", "runtimeDigest", "actor", "command", "eligibleForCompletion"]) {
  test(`operation input cannot override ${field}`, async t => {
    const f = await fixture(t), {input} = await f.prepared();
    assert.throws(() => f.app.dispatch({...input, [field]: "injected"}, f.access), {code: "INVALID"});
    assert.equal(f.calls(), 0);
  });
}
test("missing configured adapter blocks dispatch without selecting another Host", async t => {
  const f = await fixture(t), {input} = await f.reviewed();
  const app = createSemanticExecutionApplication(f.configuration, {...f.appOwners, adapter: undefined});
  assert.throws(() => app.dispatch(input, f.access), {code: "UNAVAILABLE"}); assert.equal(f.calls(), 0);
});
test("permission revocation before dispatch is not masked by a prepared plan", async t => {
  const f = await fixture(t), {input} = await f.reviewed();
  f.time.set(Date.parse(f.declarations.policy.validUntil));
  await assert.rejects(f.app.dispatch(input, f.access), {code: "PERMISSION_DENIED"}); assert.equal(f.calls(), 0);
});
test("Catalog permission revocation during adapter invocation retains receipt but refuses usable result", async t => {
  const f = await fixture(t, {onRun: v => {v.policy.catalogs[0].permission = "DENIED";
    fs.writeFileSync(v.configuration.policyPath, JSON.stringify(v.policy));}}), {input} = await f.reviewed();
  await assert.rejects(f.app.dispatch(input, f.access)); assert.equal(f.calls(), 1);
  assert.equal(fs.readdirSync(path.join(f.configuration.dataRoot, "project-semantic-bindings/dispatch-results")).length, 1);
  await assert.rejects(f.app.dispatch(input, f.access)); assert.equal(f.calls(), 1);
});
test("known runner failure returns the existing FAILED receipt without invoking again", async t => {
  const f = await fixture(t, {onRun: () => {throw new Error("SYNTHETIC_UNCERTAIN_INVOCATION");}}), {input} = await f.reviewed();
  const receipt = await f.app.dispatch(input, f.access); assert.equal(receipt.result.status, "FAILED"); assert.equal(f.calls(), 1);
  assert.deepEqual(await f.app.dispatch(input, f.access), receipt); assert.equal(f.calls(), 1);
  assert.equal((await f.app.evaluate(input, f.access)).status, "FAILED");
});
test("ambiguous adapter failure is not replayed by the fixed application", async t => {
  const f = await fixture(t), {input} = await f.reviewed(); let calls = 0;
  const adapter = {...f.appOwners.adapter, execute: async () => {calls++; throw new Error("SYNTHETIC_UNCERTAIN_ADAPTER");}};
  const app = createSemanticExecutionApplication(f.configuration, {...f.appOwners, adapter});
  await assert.rejects(app.dispatch(input, f.access), /SYNTHETIC_UNCERTAIN_ADAPTER/); assert.equal(calls, 1);
  await assert.rejects(app.dispatch(input, f.access), /SEMANTIC_DISPATCH_RECONCILIATION_REQUIRED/); assert.equal(calls, 1);
  assert.equal(fs.existsSync(path.join(f.configuration.dataRoot, "project-semantic-bindings/dispatch-results")), false);
});
