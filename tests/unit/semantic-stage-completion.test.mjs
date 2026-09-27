import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {stageCompletionFixture as fixture} from "../helpers/semantic-stage-fixture.mjs";
import {createSemanticStageCompletionService} from "../../packages/server/dist/application/semantic-stage-completion.js";
import {withSemanticStageGrant, consumeSemanticStageGrant} from "../../packages/server/dist/domains/lifecycle/semantic-stage-grant.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";
test("internal fixture-qualified stage commit persists proof, attempt and trajectory together, never Goal/Target completion", async t => {
  const f = await fixture(t), result = await f.commit(), run = f.lifecycleService.read(f.run.id);
  assert.equal(result.status, "STAGE_COMMITTED"); assert.equal(result.authority.mayCompleteGoal, false); assert.equal(result.authority.mayCompleteTarget, false);
  assert.equal(run.status, "RUNNING"); assert.equal(run.pendingExecution, undefined); assert.equal(run.stageAttempts.length, 1); assert.equal(run.trajectory.length, 1);
  assert.equal(run.semanticStageCompletions.length, 1); assert.equal(run.semanticStageCompletions[0].proofDigest, result.proofDigest);
  assert.equal(run.trajectory[0].requestDigest, run.semanticStageCompletions[0].requestDigest);
  assert.equal(f.runtimeStore.readGoal(f.identity.goalId).status, "APPROVED"); assert.equal(f.runtimeStore.readGoal(f.identity.goalId).plan.targets[0].status, "READY");
  const bytes = fs.readFileSync(f.runFile, "utf8"); assert.deepEqual(await f.commit(), result);
  assert.deepEqual(await createSemanticStageCompletionService(f.configuration, f.owners).commit(f.input), result);
  assert.equal(fs.readFileSync(f.runFile, "utf8"), bytes); assert.equal(f.calls(), 1);
  assert.equal(f.lifecycleService.advanceUntilBoundary(f.run.id).status, "SUCCEEDED");
  assert.equal(f.runtimeStore.readGoal(f.identity.goalId).status, "APPROVED");
});
for (const [name, options] of [["no explicit completion policy", {noPolicy: true}], ["no dispatch", {noDispatch: true}],
  ["no collection", {noCollection: true}], ["synthetic collector", {syntheticCollector: true}], ["synthetic process", {syntheticProcess: true}],
  ["business failed", {businessFail: true}], ["Harness failed", {harnessFail: true}]]) test(`stage commit refuses ${name} without mutation`, async t => {
  const f = await fixture(t, options), bytes = fs.readFileSync(f.runFile, "utf8");
  await assert.rejects(f.commit()); assert.equal(fs.readFileSync(f.runFile, "utf8"), bytes);
});
for (const [name, change] of [["revoked evidence", f => fs.unlinkSync(f.file("evidence", true))],
  ["expired authority", f => f.time.set(Date.parse(f.declarations.policy.validUntil))],
  ["goal drift", f => f.changeGoal(goal => {goal.objective = "changed";})],
  ["cancellation", f => f.lifecycleService.cancel(f.run.id, "synthetic", "synthetic://cancel", f.run.binding.digest)]]) {
  test(`stage commit rechecks ${name}`, async t => {
    const f = await fixture(t); change(f); const bytes = fs.readFileSync(f.runFile, "utf8"); await assert.rejects(f.commit()); assert.equal(fs.readFileSync(f.runFile, "utf8"), bytes);
  });
}
test("client-shaped objects, cloned or expired internal grants cannot mutate Lifecycle", async t => {
  const f = await fixture(t); for (const token of [undefined, {}, {approved: true}, {status: "PASSED", outcomeDigest: d("fake")}]) {
    assert.throws(() => f.lifecycleService.commitSemanticStage(token), /GRANT_REQUIRED/);
  }
  let token; withSemanticStageGrant({}, value => {token = value; assert.throws(() => consumeSemanticStageGrant(structuredClone(value)), /GRANT_REQUIRED/);});
  assert.throws(() => consumeSemanticStageGrant(token), /GRANT_REQUIRED/);
});
test("concurrent internal completions yield one durable stage transition", async t => {
  const f = await fixture(t), results = await Promise.allSettled([f.commit(), f.commit()]);
  assert(results.some(x => x.status === "fulfilled")); const run = f.lifecycleService.read(f.run.id);
  assert.equal(run.semanticStageCompletions.length, 1); assert.equal(run.stageAttempts.length, 1); assert.equal(run.trajectory.length, 1);
  assert.equal(f.calls(), 1);
});
test("tampered persisted proof is not accepted as historical completion", async t => {
  const f = await fixture(t); await f.commit(); const run = JSON.parse(fs.readFileSync(f.runFile)); run.semanticStageCompletions[0].outcomeDigest = d("wrong");
  fs.writeFileSync(f.runFile, JSON.stringify(run)); const before = fs.readFileSync(f.runFile, "utf8");
  await assert.rejects(f.commit(), {message: "LIFECYCLE_SEMANTIC_PROOF_INVALID"});
  assert.equal(fs.readFileSync(f.runFile, "utf8"), before);
  assert.throws(() => f.lifecycleService.advanceUntilBoundary(f.run.id), /SEMANTIC_PROOF_INVALID/);
});
test("next Lifecycle stage stops at a new request and cannot reuse the consumed stage binding", async t => {
  const f = await fixture(t, {additionalStage: true}), committed = await f.commit();
  const next = f.lifecycleService.advanceUntilBoundary(f.run.id);
  assert.equal(next.status, "WAITING_EXTERNAL_SIGNAL"); assert.equal(next.pendingExecution.stageId, "followup");
  assert.notEqual(next.pendingExecution.requestDigest, f.input.requestDigest); assert.equal(f.calls(), 1);
  await assert.rejects(f.completion.commit({...f.input, requestDigest: next.pendingExecution.requestDigest}));
  assert.equal(f.lifecycleService.read(f.run.id).semanticStageCompletions.length, 1);
  assert.deepEqual(await f.commit(), committed); assert.equal(f.calls(), 1);
});
test("rehashing a false proof cannot make historical readback accept missing source evidence", async t => {
  const f = await fixture(t); await f.commit(); const run = JSON.parse(fs.readFileSync(f.runFile));
  const original = run.semanticStageCompletions[0], {proofDigest, ...body} = original;
  body.outcomeDigest = d("absent-outcome"); const changed = {...body, proofDigest: d(body)};
  run.semanticStageCompletions[0] = changed;
  run.stageAttempts[0].evidence = [`semantic-completion://${changed.proofDigest.slice(7)}`];
  fs.writeFileSync(f.runFile, JSON.stringify(run));
  await assert.rejects(f.commit(), /SEMANTIC_PROOF_INVALID/);
  assert.throws(() => f.lifecycleService.advanceUntilBoundary(f.run.id), /SEMANTIC_PROOF_INVALID/);
});
