import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {stageCompletionFixture} from "../helpers/semantic-stage-fixture.mjs";
import {createSemanticExecutionApplication} from "../../packages/server/dist/application/semantic-execution-application.js";
import {semanticExecutionCapabilities, semanticExecutionRequest} from "../../packages/contracts/dist/index.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";
import {createProjectSemanticBindingService} from "../../packages/server/dist/application/project-semantic-binding.js";

// Entirely local source fixtures, including declared native/independent labels.
// This exercises fixed Runtime composition, not real Host or domain qualification.
async function fixture(t) {
  const f = await stageCompletionFixture(t, {application: true, additionalStage: true});
  const owners = {governed: f.governed, lifecycle: f.lifecycleService, adapter: f.adapter, collector: f.collector, now: f.time.get};
  const restart = () => createSemanticExecutionApplication(f.configuration, owners), app = restart();
  const access = {currentAccess: f.ownerInputs.currentAccess};
  const declaration = pending => {
    const contextPlan = structuredClone(f.state.contextPlan); contextPlan.actions[0].stageId = pending.stageId;
    const {planDigest, ...body} = f.state.outcomePlan; body.stageId = pending.stageId;
    return structuredClone({identity: f.identity, runId: f.run.id, requestDigest: pending.requestDigest,
      goalTarget: f.state.goalTarget, contextPlan, outcomePlan: {...body, planDigest: d(body)}, selections: f.selected});
  };
  const coverage = f.source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: ["units"]}));
  async function prepare(application, value) {
    const plan = await application.prepare(value, access), binding = await application.bind(f.identity, access);
    return {plan, binding, input: {identity: f.identity, bindingDigest: binding.bindingDigest}};
  }
  async function execute(application, prepared) {
    const review = await application.review({...prepared.input, coverage}, access);
    const decision = await application.approveReview({...prepared.input, reviewDigest: review.reviewDigest, decision: "APPROVE"}, access);
    const dispatch = await application.dispatch(prepared.input, access), collected = await application.collect(prepared.input, access);
    assert.equal((await application.evaluate(prepared.input, access)).status, "DUAL_VALIDATED_NOT_COMPLETED");
    const committed = await application.commitStage(prepared.input, access);
    return {review, decision, dispatch, collected, committed};
  }
  const firstValue = declaration(f.run.pendingExecution), first = await prepare(app, firstValue), result = await execute(app, first);
  const next = f.lifecycleService.advanceUntilBoundary(f.run.id), nextValue = declaration(next.pendingExecution);
  return {...f, app, restart, access, prepare, execute, coverage, first, firstValue, result, next, nextValue,
    stageFile: path.join(f.configuration.dataRoot, "project-semantic-bindings/execution-stage-plans",
      d({scope: f.scope, identity: f.identity, runId: f.run.id, requestDigest: next.pendingExecution.requestDigest}).slice(7) + ".json")};
}
function immutableSnapshot(root) {
  return Object.fromEntries(fs.readdirSync(root, {recursive: true}).filter(p => p.endsWith(".json"))
    .map(p => [p, fs.readFileSync(path.join(root, p), "utf8")]));
}
test("two stages survive restart with distinct plans, bindings, reviews, collection and committed proofs", async t => {
  const f = await fixture(t), root = path.join(f.configuration.dataRoot, "project-semantic-bindings"), before = immutableSnapshot(root);
  const app = f.restart(); assert.throws(() => app.inspect(f.identity, f.access), {code: "UNAVAILABLE"});
  const second = await f.prepare(app, f.nextValue);
  assert.equal(second.plan.predecessorProofDigest, f.result.committed.proofDigest);
  assert.equal(second.binding.executionStage.requestDigest, f.next.pendingExecution.requestDigest);
  assert.notEqual(second.binding.bindingDigest, f.first.binding.bindingDigest);
  assert.notEqual(second.plan.planDigest, f.first.plan.planDigest);
  const restart = f.restart(); assert.deepEqual(await restart.inspect(f.identity, f.access), second.plan);
  await assert.rejects(restart.dispatch(f.first.input, f.access));
  await assert.rejects(restart.commitStage(f.first.input, f.access));
  await assert.rejects(restart.dispatch(second.input, f.access));
  await assert.rejects(restart.approveReview({...second.input, decision: "APPROVE", reviewDigest: f.result.review.reviewDigest}, f.access));
  assert.equal(f.calls(), 1);
  const result = await f.execute(restart, second);
  assert.notEqual(result.review.reviewDigest, f.result.review.reviewDigest);
  assert.notEqual(result.collected.receiptDigest, f.result.collected.receiptDigest);
  const final = f.lifecycleService.advanceUntilBoundary(f.run.id);
  assert.equal(final.status, "SUCCEEDED"); assert.equal(final.semanticStageCompletions.length, 2);
  assert.equal(new Set(final.trajectory.map(x => x.requestDigest)).size, 2); assert.equal(f.calls(), 2);
  for (const [file, bytes] of Object.entries(before)) assert.equal(fs.readFileSync(path.join(root, file), "utf8"), bytes, file);
  for (const [prepared, value, receipt] of [[f.first, f.firstValue, f.result.committed], [second, f.nextValue, result.committed]])
    assert.deepEqual(f.restart().stageReceipt({...prepared.input, runId: value.runId, requestDigest: value.requestDigest}, f.access), receipt);
  assert.equal(f.runtimeStore.readGoal(f.identity.goalId).status, "APPROVED");
  assert.equal(f.runtimeStore.readGoal(f.identity.goalId).plan.targets[0].status, "READY");
});
test("project migration between stages cannot repin an existing run or rewrite its evidence", async t => {
  const f = await fixture(t), service = createProjectSemanticBindingService(f.configuration);
  const access = {projectId: f.identity.projectId, currentAccess: f.ownerInputs.currentAccess};
  const initial = await service.inspect(access), root = path.join(f.configuration.dataRoot, "project-semantic-bindings"), before = immutableSnapshot(root);
  async function transition(action, destinationDigest) {
    const expectedHeadDigest = (await service.activation(access)).headDigest;
    const review = await service.prepareTransition({...access, action, destinationDigest, expectedHeadDigest});
    return service.approveTransition({...access, transitionReviewDigest: review.transitionReviewDigest});
  }
  await transition("ACTIVATE", initial.binding.bindingDigest);
  f.policy.catalogs[0].trustContext = "new-reviewed-project-default"; await f.write("policy.json", f.policy);
  const review = await service.prepare({...access, ...f.selection});
  const migrated = await transition("MIGRATE", review.reviewDigest);
  assert.notEqual(migrated.destination.binding.bindingDigest, initial.binding.bindingDigest);
  const {identity, runId, requestDigest, goalTarget} = f.nextValue, app = f.restart();
  const input = {identity, runId, requestDigest, goalTarget}, basis = await app.planning(input, f.access);
  assert.equal(basis.projectBindingDigest, initial.binding.bindingDigest);
  const draft = await app.draft({...input, basisDigest: basis.basisDigest, selection: f.nextValue.contextPlan.actions[0].selection,
    business: f.nextValue.outcomePlan.business, harness: f.nextValue.outcomePlan.harness, selections: f.nextValue.selections}, f.access);
  const second = await f.prepare(f.restart(), draft.declaration);
  assert.equal(second.plan.projectBindingDigest, initial.binding.bindingDigest);
  assert.equal(second.binding.projectBindingDigest, initial.binding.bindingDigest);
  await f.execute(f.restart(), second);
  assert.equal(f.lifecycleService.advanceUntilBoundary(f.run.id).status, "SUCCEEDED");
  assert.deepEqual(await service.inspect(access), migrated.destination);
  for (const [file, bytes] of Object.entries(before)) assert.equal(fs.readFileSync(path.join(root, file), "utf8"), bytes, file);
  assert.equal(f.calls(), 2);
});
test("the first plan prepared after migration pins the new default but gains no implicit dispatch approval", async t => {
  const f = await stageCompletionFixture(t, {application: true});
  const service = createProjectSemanticBindingService(f.configuration);
  const access = {projectId: f.identity.projectId, currentAccess: f.ownerInputs.currentAccess};
  const initial = await service.inspect(access);
  async function transition(action, destinationDigest) {
    const review = await service.prepareTransition({...access, action, destinationDigest, expectedHeadDigest: (await service.activation(access)).headDigest});
    return service.approveTransition({...access, transitionReviewDigest: review.transitionReviewDigest});
  }
  await transition("ACTIVATE", initial.binding.bindingDigest);
  f.policy.catalogs[0].trustContext = "new-default-for-new-plan"; await f.write("policy.json", f.policy);
  const review = await service.prepare({...access, ...f.selection});
  const migrated = await transition("MIGRATE", review.reviewDigest);
  const app = createSemanticExecutionApplication(f.configuration, {governed: f.governed, lifecycle: f.lifecycleService, adapter: f.adapter, collector: f.collector, now: f.time.get});
  const plan = await app.prepare({identity: f.identity, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest,
    goalTarget: f.state.goalTarget, contextPlan: f.state.contextPlan, outcomePlan: f.state.outcomePlan, selections: f.selected}, access);
  const bound = await app.bind(f.identity, access);
  assert.equal(plan.projectBindingDigest, migrated.destination.binding.bindingDigest);
  assert.equal(bound.projectBindingDigest, migrated.destination.binding.bindingDigest);
  await assert.rejects(app.dispatch({identity: f.identity, bindingDigest: bound.bindingDigest}, access)); assert.equal(f.calls(), 0);
});
test("successor preparation is immutable and concurrent identical declarations converge", async t => {
  const f = await fixture(t), plans = await Promise.all([f.app.prepare(f.nextValue, f.access), f.restart().prepare(f.nextValue, f.access)]);
  assert.deepEqual(plans[0], plans[1]); const bytes = fs.readFileSync(f.stageFile, "utf8");
  const changed = structuredClone(f.nextValue), {planDigest, ...body} = changed.outcomePlan;
  body.business[0].predicate.maximum = 20; changed.outcomePlan = {...body, planDigest: d(body)};
  await assert.rejects(f.app.prepare(changed, f.access), {code: "IDENTITY_CONFLICT"});
  assert.equal(fs.readFileSync(f.stageFile, "utf8"), bytes); assert.equal(f.calls(), 1);
});
for (const [name, mutate] of [
  ["old pending digest", f => {f.nextValue.requestDigest = f.firstValue.requestDigest;}],
  ["old outcome mapping", f => {f.nextValue.outcomePlan = f.firstValue.outcomePlan;}],
  ["old context selection", f => {f.nextValue.contextPlan = f.firstValue.contextPlan;}],
  ["caller-supplied predecessor", f => {f.nextValue.predecessorProofDigest = f.result.committed.proofDigest;}],
  ["expired authority", f => {f.time.set(Date.parse(f.declarations.authority.validUntil));}],
  ["cancelled run", f => {f.lifecycleService.cancel(f.run.id, "synthetic", "synthetic://cancel", f.run.binding.digest);}],
  ["target criteria changed", f => {f.changeGoal(g => {g.plan.targets[0].acceptanceCriteria.push("new criterion");});}],
  ["goal changed", f => {f.changeGoal(g => {g.objective = "changed";});}]
]) test(`successor preparation refuses ${name} without dispatch or saving a successor`, async t => {
  const f = await fixture(t); mutate(f); await assert.rejects(f.app.prepare(f.nextValue, f.access));
  assert.equal(fs.existsSync(f.stageFile), false); assert.equal(f.calls(), 1);
});
test("missing current stage plan never falls back to the previous stage or recreates on inspect", async t => {
  const f = await fixture(t), second = await f.prepare(f.app, f.nextValue); fs.unlinkSync(f.stageFile);
  await assert.rejects(f.restart().dispatch(second.input, f.access), {code: "UNAVAILABLE"});
  assert.throws(() => f.restart().inspect(f.identity, f.access), {code: "UNAVAILABLE"});
  assert.equal(fs.existsSync(f.stageFile), false); assert.equal(f.calls(), 1);
});
test("corrupt predecessor proof prevents successor preparation and historical readback", async t => {
  const f = await fixture(t), run = JSON.parse(fs.readFileSync(f.runFile));
  run.semanticStageCompletions[0].outcomeDigest = d("wrong"); fs.writeFileSync(f.runFile, JSON.stringify(run));
  await assert.rejects(f.app.prepare(f.nextValue, f.access), {code: "IO_OR_VALIDATION_FAILED"});
  assert.throws(() => f.lifecycleService.readVerified(f.run.id), /SEMANTIC_PROOF_INVALID/);
  assert.throws(() => f.app.stageReceipt({...f.first.input, runId: f.run.id, requestDigest: f.firstValue.requestDigest}, f.access));
  assert.equal(fs.existsSync(f.stageFile), false); assert.equal(f.calls(), 1);
});
test("internal stage operations are not exposed as HTTP/CLI/MCP completion capabilities", () => {
  const capabilities = semanticExecutionCapabilities("synthetic", true, true); assert.equal(capabilities.completionAvailable, false);
  for (const operation of ["commitStage", "stageReceipt", "complete", "advance"])
    assert.throws(() => semanticExecutionRequest(operation, "synthetic", {}), /REQUEST_INVALID/);
});
test("a different run cannot replace the immutable Goal/Target run anchor", async t => {
  const f = await fixture(t), b = f.run.binding;
  let other = f.lifecycleService.start({id: "other-run", lifecycleId: f.run.revision.ref.id, lifecycleVersion: f.run.revision.ref.version,
    ...f.scope, goalId: f.identity.goalId, targetId: f.identity.targetId, executor: b.executor,
    ...Object.fromEntries(["policyDigest", "providerDigest", "environmentDigest", "authorityDigest", "runtimeDigest", "evidenceDigest"].map(k => [k, b[k]])),
    harnessExecutionBindingDigest: f.identity.harnessBindingDigest, harnessBundle: b.harnessBundle});
  f.lifecycleService.authorizePlan(other.id, "APPROVED", "synthetic", "synthetic://plan", other.binding.digest);
  other = f.lifecycleService.advanceUntilBoundary(other.id);
  await assert.rejects(f.app.prepare({...f.firstValue, runId: other.id, requestDigest: other.pendingExecution.requestDigest}, f.access), {code: "IDENTITY_CONFLICT"});
  assert.equal(f.calls(), 1); assert.equal(fs.existsSync(f.stageFile), false);
});
test("rehashing a wrong predecessor link cannot select a successor", async t => {
  const f = await fixture(t); await f.prepare(f.app, f.nextValue);
  const record = JSON.parse(fs.readFileSync(f.stageFile)); record.value.predecessorProofDigest = d("wrong-predecessor");
  const {planDigest, ...plan} = record.value; record.value.planDigest = d(plan);
  const {recordDigest, ...body} = record; record.recordDigest = d(body); fs.writeFileSync(f.stageFile, JSON.stringify(record));
  assert.throws(() => f.restart().inspect(f.identity, f.access), {code: "DRIFT"}); assert.equal(f.calls(), 1);
});
test("a surviving stage binding blocks legacy completion even when the root plan is missing", async t => {
  const f = await stageCompletionFixture(t, {application: true});
  const app = createSemanticExecutionApplication(f.configuration, {governed: f.governed, lifecycle: f.lifecycleService, now: f.time.get});
  const access = {currentAccess: f.ownerInputs.currentAccess};
  await app.prepare({identity: f.identity, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest,
    goalTarget: f.state.goalTarget, contextPlan: f.state.contextPlan, outcomePlan: f.state.outcomePlan, selections: f.selected}, access);
  await app.bind(f.identity, access);
  fs.unlinkSync(path.join(f.configuration.dataRoot, "project-semantic-bindings/execution-plans", d({scope: f.scope, identity: f.identity}).slice(7) + ".json"));
  const before = fs.readFileSync(f.runFile, "utf8");
  assert.throws(() => f.lifecycleService.recordExternalResult(f.run.id, {status: "SUCCEEDED"}), /SEMANTIC_COMPLETION_REQUIRED/);
  assert.equal(fs.readFileSync(f.runFile, "utf8"), before); assert.equal(f.calls(), 0);
});
test("committed semantic provenance blocks legacy completion of a later stage without a root plan", async t => {
  const f = await fixture(t);
  fs.unlinkSync(path.join(f.configuration.dataRoot, "project-semantic-bindings/execution-plans", d({scope: f.scope, identity: f.identity}).slice(7) + ".json"));
  const before = fs.readFileSync(f.runFile, "utf8");
  assert.throws(() => f.lifecycleService.recordExternalResult(f.run.id, {status: "SUCCEEDED"}), /SEMANTIC_COMPLETION_REQUIRED/);
  assert.equal(fs.readFileSync(f.runFile, "utf8"), before); assert.equal(f.calls(), 1);
});
