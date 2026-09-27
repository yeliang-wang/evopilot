import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {stageCompletionFixture} from "../helpers/semantic-stage-fixture.mjs";
import {createSemanticExecutionApplication} from "../../packages/server/dist/application/semantic-execution-application.js";
import {semanticExecutionRequest, semanticExecutionCapabilities} from "../../packages/contracts/dist/index.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";
import {verifySemanticTerminalRun} from "../../packages/server/dist/domains/lifecycle/semantic-terminal.js";

import {semanticTerminalFixture as fixture} from "../helpers/semantic-terminal-fixture.mjs";
function snapshot(root) {
  return Object.fromEntries(fs.readdirSync(root, {recursive: true}).filter(name => name.endsWith(".json")).sort()
    .map(name => [name, fs.readFileSync(path.join(root, name), "utf8")]));
}
test("two-stage terminal history is assembled after restart without mutation, dispatch or completion authority", async t => {
  const f = await fixture(t, {additionalStage: true}), before = snapshot(f.configuration.dataRoot);
  const result = f.read();
  assert.equal(result.status, "TERMINAL_EVIDENCE_VERIFIED_NOT_COMPLETED"); assert.equal(result.stages.length, 2);
  assert.equal(result.eligibleForCompletion, false); assert.equal(result.currentCompletionAuthorityVerified, false);
  assert(Object.values(result.authority).every(value => value === false));
  assert.deepEqual(f.restart().terminalEvidence(f.value, f.access), result); assert(Object.isFrozen(result));
  assert.deepEqual(snapshot(f.configuration.dataRoot), before); assert.equal(f.calls(), 2);
  assert.equal(f.runtimeStore.readGoal(f.identity.goalId).status, "APPROVED");
  assert.equal(f.runtimeStore.readGoal(f.identity.goalId).plan.targets[0].status, "READY");
});
test("internal stages and correctly disabled/conditional skips remain distinguishable from semantic proof stages", async t => {
  const f = await fixture(t, {terminalControls: true});
  assert.equal(f.read().stages.length, 1);
  const checked = f.lifecycleService.readSemanticTerminal(f.run.id, f.scope5);
  assert.deepEqual(checked.proof.stages.map(s => [s.stageId, s.status]), [["loop", "SUCCEEDED"], ["aggregate", "SUCCEEDED"], ["disabled", "SKIPPED"], ["conditional", "SKIPPED"]]);
  // The structural checker is separate from the owner integrity check. Reorder
  // definitions only here to isolate valid forward references; persisted-owner
  // reads still reject any unbound definition edit.
  const reordered = structuredClone(checked.run); reordered.revision.definition.stages.reverse();
  assert.equal(verifySemanticTerminalRun(reordered, f.scope5, f.lifecycleService.registry).stages.length, 4);
  const invalid = structuredClone(checked.run); invalid.stageAttempts.reverse();
  assert.throws(() => verifySemanticTerminalRun(invalid, f.scope5, f.lifecycleService.registry), /TERMINAL_INVALID/);
  const forgedSkip = structuredClone(checked.run); forgedSkip.stageAttempts.find(a => a.stageId === "aggregate").status = "SKIPPED";
  assert.throws(() => verifySemanticTerminalRun(forgedSkip, f.scope5, f.lifecycleService.registry), /TERMINAL_INVALID/);
  const invalidInternal = structuredClone(checked.run); invalidInternal.stageAttempts.find(a => a.stageId === "aggregate").receiptDigest = d("other");
  assert.throws(() => verifySemanticTerminalRun(invalidInternal, f.scope5, f.lifecycleService.registry), /TERMINAL_INVALID/);
});
for (const [name, mutate] of [
  ["not terminal", r => {r.status = "RUNNING";}],
  ["leftover current stage", r => {r.currentStageId = "loop";}],
  ["leftover pending request", r => {r.pendingExecution = {};}],
  ["unresolved input", r => {r.inputBinding.status = "INCOMPLETE";}],
  ["revoked plan decision", r => {r.planAuthorization.decision = "REJECTED";}],
  ["missing plan actor", r => {r.planAuthorization.actor = "";}],
  ["missing attempts", r => {r.stageAttempts = [];}],
  ["duplicate success attempt", r => {r.stageAttempts.push({...r.stageAttempts[0], attempt: 2});}],
  ["forged skip", r => {r.stageAttempts[0].status = "SKIPPED";}],
  ["wrong request id", r => {r.stageAttempts[0].externalRequestId = "other";}],
  ["wrong trajectory provider", r => {r.trajectory[0].provider = "other";}],
  ["unknown extra attempt", r => {r.stageAttempts.push({...r.stageAttempts[0], stageId: "undeclared"});}],
  ["extra trajectory", r => {r.trajectory.push({...r.trajectory[0], stageId: "undeclared"});}]
]) test(`terminal verification refuses ${name} without writes`, async t => {
  const f = await fixture(t); f.mutateRun(mutate); const before = snapshot(f.configuration.dataRoot);
  assert.throws(() => f.read()); assert.deepEqual(snapshot(f.configuration.dataRoot), before); assert.equal(f.calls(), 1);
});
for (const kind of ["execution-plans", "executions", "outcome-reviews", "outcome-decisions", "collections", "collection-claims", "dispatch-claims", "dispatch-results", "outcomes"])
  test(`missing ${kind} cannot be replaced by a SUCCEEDED flag or an aggregate report`, async t => {
    const f = await fixture(t), stage = f.stages[0], proof = f.terminal.semanticStageCompletions[0];
    const key = {scope: f.scope, runId: f.run.id, sourceRequestDigest: stage.pending.requestDigest};
    const keys = {
      "execution-plans": {scope: f.scope, identity: f.identity},
      executions: {scope: f.scope, goalId: f.identity.goalId, targetId: f.identity.targetId, harnessBindingDigest: f.identity.harnessBindingDigest,
        executionStage: stage.binding.executionStage},
      "outcome-reviews": {...key, executionBindingDigest: stage.binding.bindingDigest, reviewDigest: stage.review.reviewDigest},
      "outcome-decisions": {...key, executionBindingDigest: stage.binding.bindingDigest},
      outcomes: {...key, requestDigest: proof.requestDigest, outcomeDigest: proof.outcomeDigest}
    };
    fs.unlinkSync(f.file(kind, keys[kind] ?? key)); const before = snapshot(f.configuration.dataRoot);
    assert.throws(() => f.read()); assert.deepEqual(snapshot(f.configuration.dataRoot), before); assert.equal(f.calls(), 1);
  });
for (const target of ["Goal", "Lifecycle"]) test(`unsettled ${target} blocks terminal evidence and preserves its claim`, async t => {
  const f = await fixture(t);
  const file = target === "Lifecycle" ? f.runFile : path.join(f.configuration.dataRoot, "goals", f.identity.goalId + ".json");
  fs.writeFileSync(file + ".lock", "synthetic interrupted write"); fs.utimesSync(file + ".lock", 0, 0);
  assert.throws(() => f.read(), /RECONCILIATION_REQUIRED/); assert(fs.existsSync(file + ".lock")); assert.equal(f.calls(), 1);
});
test("current Goal approval/criteria drift and cancellation cannot be masked by historical success", async t => {
  const f = await fixture(t); f.changeGoal(g => {g.plan.targets[0].acceptanceCriteria.push("new unreviewed criterion");});
  assert.throws(() => f.read(), {code: "DRIFT"});
  const controller = new AbortController(); controller.abort();
  assert.throws(() => f.app.terminalEvidence(f.value, {...f.access, signal: controller.signal}), {code: "CANCELLED"});
});
test("role, scope, exact input and ownership checks precede terminal aggregation", async t => {
  const f = await fixture(t);
  assert.throws(() => f.app.terminalEvidence({...f.value, approved: true}, f.access), {code: "INVALID"});
  assert.throws(() => f.app.terminalEvidence(f.value, {currentAccess: () => ({...f.access.currentAccess(),
    principal: {...f.access.currentAccess().principal, role: "viewer"}})}), {code: "PERMISSION_DENIED"});
  assert.throws(() => f.app.terminalEvidence({...f.value, identity: {...f.identity, targetId: "other"}}, f.access));
  f.changeGoal(g => {delete g.semanticExecutionOwners;}); assert.throws(() => f.read(), {code: "DRIFT"});
});
test("historical terminal evidence cannot be sent through public completion or terminal operations", () => {
  assert.equal(semanticExecutionCapabilities("synthetic", true, true).completionAvailable, false);
  for (const operation of ["terminalEvidence", "completeGoal", "completeTarget", "commitTerminal"])
    assert.throws(() => semanticExecutionRequest(operation, "synthetic", {}));
});
