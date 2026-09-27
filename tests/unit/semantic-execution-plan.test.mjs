import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {canonicalDigest as d} from "../../packages/core/dist/index.js";
import {semanticCurrentOwnerFixture} from "../helpers/semantic-current-owner-fixture.mjs";
import {createSemanticExecutionPlanService} from "../../packages/server/dist/application/semantic-execution-plan.js";
import {createSemanticExecutionBindingService} from "../../packages/server/dist/application/semantic-execution-binding.js";
import {createSemanticOutcomeReviewService} from "../../packages/server/dist/application/semantic-outcome-review.js";
import {createSemanticExecutionTransport} from "../../packages/server/dist/application/semantic-execution-transport.js";
import {createSemanticExecutionOutcomeService} from "../../packages/server/dist/application/semantic-execution-outcome.js";

async function fixture(t) {
  const f = await semanticCurrentOwnerFixture(t);
  const access = {currentAccess: f.ownerInputs.currentAccess};
  const owners = {governed: f.governed, lifecycle: f.lifecycleService, currentHarness: () => f.state.harness, now: f.time.get};
  const plans = createSemanticExecutionPlanService(f.configuration, owners);
  const value = structuredClone({identity: f.identity, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest,
    goalTarget: f.state.goalTarget, contextPlan: f.state.contextPlan, outcomePlan: f.state.outcomePlan, selections: f.selected});
  const file = path.join(f.configuration.dataRoot, "project-semantic-bindings/execution-plans", d({scope: f.scope, identity: f.identity}).slice(7) + ".json");
  return {...f, access, planOwners: owners, plans, value, planFile: file,
    executionOwners: {...f.owners, currentExecution: id => plans.currentExecution(id, access)}};
}
function rehash(plan) {const {planDigest, ...body} = plan; return {...body, planDigest: d(body)};}

test("persisted preparation survives restart and replaces mutable plan callbacks through dispatch and outcome", async t => {
  const f = await fixture(t), plan = await f.plans.prepare(f.value, f.access);
  assert.equal(plan.status, "PREPARED_NOT_APPROVED"); assert.equal(plan.authority.mayDispatch, false);
  assert.deepEqual(await f.plans.prepare(f.value, f.access), plan);
  assert.deepEqual(createSemanticExecutionPlanService(f.configuration, f.planOwners).inspect(f.identity, f.access), plan);
  assert.equal(fs.statSync(f.planFile).mode & 0o777, 0o600);
  f.state.contextPlan = undefined; f.state.outcomePlan = undefined; f.value.contextPlan.actions = [];
  const execution = createSemanticExecutionBindingService(f.configuration, f.executionOwners);
  const bound = await execution.bind(f.identity, f.access), input = f.input(bound);
  const transport = createSemanticExecutionTransport(f.configuration, f.executionOwners);
  await assert.rejects(transport.execute(input), {code: "UNAVAILABLE"}); assert.equal(f.calls(), 0);
  const reviews = createSemanticOutcomeReviewService(f.configuration, f.executionOwners);
  const review = await reviews.prepare({...input, coverage: f.source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: ["units"]}))});
  await reviews.approve({...input, reviewDigest: review.reviewDigest});
  const receipt = await transport.execute(input); assert.equal(receipt.eligibleForCompletion, false);
  assert.equal((await createSemanticExecutionOutcomeService(f.configuration, f.executionOwners).evaluate(input)).status, "INDETERMINATE");
  assert.equal(f.calls(), 1); assert.deepEqual(await transport.execute(input), receipt); assert.equal(f.calls(), 1);
  assert.deepEqual(f.plans.inspect(f.identity, f.access), plan);
  await assert.rejects(f.plans.prepare(plan.declaration, f.access), {code: "PERMISSION_DENIED"});
});

test("missing plan read never creates storage or falls back to callback plans", async t => {
  const f = await fixture(t); assert.throws(() => f.plans.currentExecution(f.identity, f.access), {code: "UNAVAILABLE"}); assert.equal(fs.existsSync(f.planFile), false);
});
test("one immutable identity slot rejects replacement and preserves original bytes", async t => {
  const f = await fixture(t); await f.plans.prepare(f.value, f.access); const before = fs.readFileSync(f.planFile, "utf8");
  f.value.outcomePlan.business[0].predicate.maximum = 20; f.value.outcomePlan = rehash(f.value.outcomePlan);
  await assert.rejects(f.plans.prepare(f.value, f.access), {code: "IDENTITY_CONFLICT"});
  assert.equal(fs.readFileSync(f.planFile, "utf8"), before);
});
test("concurrent identical preparations converge to the same immutable record", async t => {
  const f = await fixture(t); const result = await Promise.all([f.plans.prepare(f.value, f.access), f.plans.prepare(f.value, f.access)]);
  assert.deepEqual(result[0], result[1]); assert.equal(fs.readdirSync(path.dirname(f.planFile)).length, 1);
});
for (const [name, mutate] of [
  ["permissions", v => {v.permissions = {allowedEffects: ["IRREVERSIBLE"]};}],
  ["current Harness", v => {v.harness = {};}], ["approval", v => {v.approved = true;}],
  ["command", v => {v.command = "echo forged";}], ["extra identity", v => {v.identity.role = "admin";}],
  ["missing context plan", v => {delete v.contextPlan;}], ["normalized context input", v => {v.contextPlan.planDigest = d(v.contextPlan);}],
  ["oversize objective", v => {v.goalTarget.objective = "x".repeat(70000);}],
  ["goal objective drift", v => {v.goalTarget.objective = "unapproved";}],
  ["selection successor", v => {v.selections.governed.policy.version = "2.0.0";}],
  ["wrong pending digest", v => {v.requestDigest = "sha256:" + "0".repeat(64);}],
  ["wrong run", v => {v.runId = "absent";}],
  ["wrong outcome action", v => {v.outcomePlan.action = "other"; v.outcomePlan = rehash(v.outcomePlan);}],
  ["missing pending selector", v => {v.contextPlan.actions[0].stageId = "other";}],
  ["wrong artifact set", v => {v.outcomePlan.artifactSetDigest = "sha256:" + "0".repeat(64); v.outcomePlan = rehash(v.outcomePlan);}]
]) test(`preparation refuses ${name} without saving a plan or dispatching`, async t => {
  const f = await fixture(t); mutate(f.value); await assert.rejects(f.plans.prepare(f.value, f.access));
  assert.equal(fs.existsSync(f.planFile), false); assert.equal(f.calls(), 0);
});
for (const [name, mutate] of [
  ["viewer", f => {f.access.currentAccess().principal.role = "viewer";}],
  ["expired grant", f => {f.time.set(Date.parse(f.declarations.authority.validUntil));}],
  ["missing active permission", f => {fs.unlinkSync(f.file("policy", true));}],
  ["Goal approval revoked", f => {f.changeGoal(g => {g.plan.status = "PENDING_APPROVAL";});}],
  ["Goal target definition changed", f => {f.changeGoal(g => {g.plan.targets[0].acceptanceCriteria.push("new criterion");});}],
  ["current Harness drift", f => {f.state.harness.compositionDigest = "sha256:" + "0".repeat(64);}]
]) test(`persisted plan cannot mask ${name}`, async t => {
  const f = await fixture(t); await f.plans.prepare(f.value, f.access); mutate(f);
  assert.throws(() => f.plans.currentExecution(f.identity, f.access)); assert.equal(f.calls(), 0);
});
test("cancellation before preparation or read never grants execution", async t => {
  const f = await fixture(t), controller = new AbortController(); controller.abort();
  await assert.rejects(f.plans.prepare(f.value, {...f.access, signal: controller.signal}), {code: "CANCELLED"});
  assert.equal(fs.existsSync(f.planFile), false);
  await f.plans.prepare(f.value, f.access);
  assert.throws(() => f.plans.inspect(f.identity, {...f.access, signal: controller.signal}), {code: "CANCELLED"});
});
test("wrong tenant and project cannot read another plan", async t => {
  const f = await fixture(t); await f.plans.prepare(f.value, f.access);
  assert.throws(() => f.plans.inspect({...f.identity, projectId: "foreign"}, f.access));
  f.access.currentAccess().principal.tenantId = "foreign"; assert.throws(() => f.plans.inspect(f.identity, f.access));
});
test("corrupted and authority-injected records are refused even after outer rehash", async t => {
  const f = await fixture(t); await f.plans.prepare(f.value, f.access);
  const raw = JSON.parse(fs.readFileSync(f.planFile)); raw.value.authority.mayDispatch = true;
  raw.value = rehash(raw.value); const {recordDigest, ...body} = raw; raw.recordDigest = d(body);
  fs.writeFileSync(f.planFile, JSON.stringify(raw)); assert.throws(() => f.plans.inspect(f.identity, f.access), {code: "MATERIAL_INVALID"});
});
test("mutation of caller declarations during asynchronous inspection cannot change the saved plan", async t => {
  const f = await fixture(t), original = structuredClone(f.value), pending = f.plans.prepare(f.value, f.access);
  f.value.goalTarget.objective = "replaced"; f.value.contextPlan.actions = [];
  const result = await pending; assert.deepEqual(result.declaration, original);
});
test("revoked access during asynchronous preparation leaves no plan", async t => {
  const f = await fixture(t), pending = f.plans.prepare(f.value, f.access);
  f.access.currentAccess().principal.role = "viewer";
  await assert.rejects(pending); assert.equal(fs.existsSync(f.planFile), false); assert.equal(f.calls(), 0);
});
test("deleted saved plan is not reconstructed from surviving plans or bindings", async t => {
  const f = await fixture(t); await f.plans.prepare(f.value, f.access);
  const execution = createSemanticExecutionBindingService(f.configuration, f.executionOwners);
  const bound = await execution.bind(f.identity, f.access); fs.unlinkSync(f.planFile);
  await assert.rejects(execution.inspect(f.identity, {...f.access, bindingDigest: bound.bindingDigest, checkpoint: "resume"}), {code: "UNAVAILABLE"});
  assert.equal(fs.existsSync(f.planFile), false);
});
