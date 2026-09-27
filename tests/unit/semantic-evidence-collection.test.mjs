import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {semanticCurrentOwnerFixture} from "../helpers/semantic-current-owner-fixture.mjs";
import {createSemanticExecutionApplication, semanticExecutionImplementationDigest} from "../../packages/server/dist/application/semantic-execution-application.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

const descriptor = {id: "synthetic-domain", implementationDigest: d("synthetic-implementation"), qualificationDigest: d("synthetic-qualification"),
  origin: "SYNTHETIC", mode: "READ_ONLY", kinds: ["domain-checks"]};
async function fixture(t, options = {}) {
  const declared = {...descriptor, ...options.descriptor};
  const f = await semanticCurrentOwnerFixture(t, {publishedMaterials: true, runtimeDigest: semanticExecutionImplementationDigest,
    collectorDescriptor: options.noPolicy ? undefined : declared});
  let calls = 0, captured;
  const collector = {descriptor: structuredClone(options.configured ?? declared), collect: async (request, signal) => {
    calls++; captured = request;
    assert(Object.isFrozen(request)); assert(Object.isFrozen(request.selectors));
    const value = {schema: "evopilot-semantic-collector-observation/v1", collectionRequestDigest: request.collectionRequestDigest,
      observedAt: new Date(f.time.get()).toISOString(), observations: [{kind: "domain-checks", facts: {units: 5}, sourceDigests: [d("synthetic-snapshot")]}]};
    await options.onCollect?.({f, value, request, signal, collector});
    return value;
  }};
  const owners = {governed: f.governed, lifecycle: f.lifecycleService, adapter: f.owners.adapter, now: f.time.get,
    collector: options.noCollector ? undefined : collector};
  const app = createSemanticExecutionApplication(f.configuration, owners), access = {currentAccess: f.ownerInputs.currentAccess};
  const value = structuredClone({identity: f.identity, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest,
    goalTarget: f.state.goalTarget, contextPlan: f.state.contextPlan, outcomePlan: f.state.outcomePlan, selections: f.selected});
  await app.prepare(value, access); const bound = await app.bind(f.identity, access), input = {identity: f.identity, bindingDigest: bound.bindingDigest};
  const review = await app.review({...input, coverage: f.source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: ["units"]}))}, access);
  if (!options.skipApproval) await app.approveReview({...input, reviewDigest: review.reviewDigest, decision: "APPROVE"}, access);
  if (!options.skipDispatch && !options.skipApproval) await app.dispatch(input, access);
  return {...f, app, owners, input, access, collector, collectionCalls: () => calls, captured: () => captured,
    collect: (a = access) => app.collect(input, a), evaluate: () => app.evaluate(input, access)};
}
test("configured synthetic collection survives restart, redacts facts, evaluates separately and never completes", async t => {
  const f = await fixture(t), before = fs.readFileSync(path.join(f.configuration.dataRoot, "lifecycle-runs", f.run.id + ".json"), "utf8");
  const result = await f.collect(); assert.equal(result.status, "COLLECTED_NOT_COMPLETED"); assert.equal(result.origin, "SYNTHETIC");
  assert.deepEqual(result.kinds, ["domain-checks"]); assert.equal(result.authority.mayCompleteGoal, false);
  assert(!JSON.stringify(result).includes("units")); assert(!Object.hasOwn(result, "observations"));
  const restart = createSemanticExecutionApplication(f.configuration, f.owners);
  assert.deepEqual(await restart.collect(f.input, f.access), result); assert.equal(f.collectionCalls(), 1);
  const report = await f.evaluate(); assert.equal(report.business.status, "PASSED"); assert.equal(report.harness.status, "INDETERMINATE");
  assert.equal(report.evidenceTrust, "SYNTHETIC_COLLECTOR_OBSERVATIONS"); assert.equal(report.collection.receiptDigest, result.receiptDigest);
  assert.equal(report.eligibleForCompletion, false); assert.equal(report.authority.mayAdvanceLifecycle, false);
  assert.equal(fs.readFileSync(path.join(f.configuration.dataRoot, "lifecycle-runs", f.run.id + ".json"), "utf8"), before);
  assert.equal(f.runtimeStore.readGoal(f.identity.goalId).status, "APPROVED");
  assert.equal(f.captured().scope.goalId, f.identity.goalId); assert.equal(f.captured().scope.targetId, f.identity.targetId);
  assert.equal(f.captured().executionBindingDigest, f.input.bindingDigest);
});
test("collection is not substituted by a dispatch receipt", async t => {
  const f = await fixture(t); assert.equal((await f.evaluate()).business.status, "INDETERMINATE"); assert.equal(f.collectionCalls(), 0);
});
for (const [name, options] of [["absent collector", {noCollector: true}], ["absent policy", {noPolicy: true}],
  ["not dispatched", {skipDispatch: true}], ["unapproved review", {skipApproval: true}],
  ["descriptor drift", {configured: {...descriptor, implementationDigest: d("other")}}],
  ["kind outside policy", {descriptor: {kinds: ["unrequested-kind"]}}]]) {
  test(`collection fails before invocation: ${name}`, async t => {
    const f = await fixture(t, options); await assert.rejects(async () => f.collect()); assert.equal(f.collectionCalls(), 0);
  });
}
for (const [name, mutate] of [
  ["wrong request", ({value}) => {value.collectionRequestDigest = d("wrong");}],
  ["stale observation", ({value, f}) => {value.observedAt = new Date(f.time.get() - 1).toISOString();}],
  ["future observation", ({value, f}) => {value.observedAt = new Date(f.time.get() + 1).toISOString();}],
  ["reserved kind", ({value}) => {value.observations[0].kind = "agent-process";}],
  ["unknown kind", ({value}) => {value.observations[0].kind = "other";}],
  ["duplicate kind", ({value}) => {value.observations.push(structuredClone(value.observations[0]));}],
  ["undeclared field", ({value}) => {value.observations[0].facts.extra = "not requested";}],
  ["nested secret key", ({value}) => {value.observations[0].facts.units = {apiKey: "synthetic-placeholder"};}],
  ["unsafe prototype key", ({value}) => {value.observations[0].facts.units = JSON.parse('{"__proto__":1}');}],
  ["large string", ({value}) => {value.observations[0].facts.units = "x".repeat(1025);}],
  ["large array", ({value}) => {value.observations[0].facts.units = Array(257).fill(0);}],
  ["invalid source", ({value}) => {value.observations[0].sourceDigests = ["not-a-hash"];}],
  ["extra authority", ({value}) => {value.approved = true;}],
  ["expiry while collecting", ({f}) => {f.time.set(Date.parse(f.declarations.policy.validUntil));}],
  ["descriptor changes while collecting", ({collector}) => {collector.descriptor.qualificationDigest = d("changed");}],
  ["callback changes while collecting", ({collector}) => {collector.collect = async () => ({});}],
  ["goal changes while collecting", ({f}) => {f.changeGoal(goal => {goal.objective = "changed";});}],
  ["revoked evidence activation", ({f}) => {fs.unlinkSync(f.file("evidence", true));}]
]) test(`rejected observation is not saved or automatically retried: ${name}`, async t => {
  const f = await fixture(t, {onCollect: mutate}); await assert.rejects(f.collect()); assert.equal(f.collectionCalls(), 1);
  assert.equal(fs.existsSync(path.join(f.configuration.dataRoot, "project-semantic-bindings/collections")), false);
  await assert.rejects(f.collect()); assert.equal(f.collectionCalls(), 1);
});
test("collector exception retains claim and prohibits automatic replay", async t => {
  const f = await fixture(t, {onCollect: () => {throw new Error("SYNTHETIC_COLLECTOR_FAILURE");}});
  await assert.rejects(f.collect(), /SYNTHETIC_COLLECTOR_FAILURE/);
  await assert.rejects(f.collect(), {code: "IDENTITY_CONFLICT"}); assert.equal(f.collectionCalls(), 1);
});
test("concurrent callers share one claim and invoke only once", async t => {
  let entered, release; const ready = new Promise(r => {entered = r;}), held = new Promise(r => {release = r;});
  const f = await fixture(t, {onCollect: async () => {entered(); await held;}});
  const first = f.collect(); await ready;
  try {await assert.rejects(f.collect(), {code: "IDENTITY_CONFLICT"});} finally {release();}
  const result = await first; assert.deepEqual(await f.collect(), result); assert.equal(f.collectionCalls(), 1);
});
test("abort before invocation never calls the collector", async t => {
  const f = await fixture(t), controller = new AbortController(); controller.abort();
  await assert.rejects(f.collect({...f.access, signal: controller.signal}), {code: "CANCELLED"}); assert.equal(f.collectionCalls(), 0);
});
test("abort during invocation rejects late output without replay", async t => {
  let entered, release; const ready = new Promise(r => {entered = r;}), held = new Promise(r => {release = r;});
  const f = await fixture(t, {onCollect: async () => {entered(); await held;}}), controller = new AbortController();
  const pending = f.collect({...f.access, signal: controller.signal}); await ready; controller.abort();
  await assert.rejects(pending, {code: "CANCELLED"}); release(); await new Promise(r => setImmediate(r));
  assert.equal(fs.existsSync(path.join(f.configuration.dataRoot, "project-semantic-bindings/collections")), false);
  await assert.rejects(f.collect(), {code: "IDENTITY_CONFLICT"}); assert.equal(f.collectionCalls(), 1);
});
test("revocation after collection blocks evaluation and receipt reuse", async t => {
  const f = await fixture(t); await f.collect(); fs.unlinkSync(f.file("evidence", true));
  await assert.rejects(f.evaluate()); await assert.rejects(f.collect()); assert.equal(f.collectionCalls(), 1);
});
test("semantic-owned run rejects a correctly correlated legacy result without semantic fields", async t => {
  const f = await fixture(t), pending = f.run.pendingExecution;
  const before = fs.readFileSync(path.join(f.configuration.dataRoot, "lifecycle-runs", f.run.id + ".json"), "utf8");
  assert.throws(() => f.lifecycleService.recordExternalResult(f.run.id, {requestId: pending.id, requestDigest: pending.requestDigest,
    bindingDigest: pending.bindingDigest, idempotencyKey: pending.idempotencyKey, effects: [], status: "SUCCEEDED", receiptDigest: d("forged-success")}),
  /LIFECYCLE_SEMANTIC_COMPLETION_REQUIRED/);
  assert.equal(fs.readFileSync(path.join(f.configuration.dataRoot, "lifecycle-runs", f.run.id + ".json"), "utf8"), before);
});
