import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {semanticTerminalFixture} from "../helpers/semantic-terminal-fixture.mjs";
import {GoalRecordStore} from "../../packages/server/dist/storage/goal-record-store.js";
import {createSemanticRuntimeSourceReader} from "../../packages/server/dist/application/semantic-runtime-sources.js";
import {semanticExecutionRequest, semanticExecutionCapabilities} from "../../packages/contracts/dist/index.js";

// All local synthetic source data, including native/independent labels.
// No real Host/collector qualification, formal acceptance or release evidence.
const fixture = (t, options = {}) => semanticTerminalFixture(t, {goalCompletionPolicy: true, ...options,
  beforeSource: g => {delete g.terminalMaturity; g.plan.phaseTargets = []; options.beforeSource?.(g);}});
const goalFile = f => path.join(f.configuration.dataRoot, "goals", f.identity.goalId + ".json");
const rawGoal = f => JSON.parse(fs.readFileSync(goalFile(f)));
const complete = f => f.app.completeTarget(f.value, f.access);
function snapshot(root) {
  return Object.fromEntries(fs.readdirSync(root, {recursive: true}).filter(name => name.endsWith(".json")).sort()
    .map(name => [name, fs.readFileSync(path.join(root, name), "utf8")]));
}
test("fixed application atomically completes a two-stage Target and Goal, then reads its receipt after restart without replay", async t => {
  const f = await fixture(t, {additionalStage: true}), before = snapshot(f.configuration.dataRoot), evidence = f.read();
  const receipt = await complete(f), after = snapshot(f.configuration.dataRoot), goal = rawGoal(f);
  assert.equal(receipt.schema, "evopilot-semantic-target-completion/v1"); assert.equal(receipt.resultingGoalStatus, "COMPLETED");
  assert.deepEqual(receipt.evidence, evidence); assert(Object.isFrozen(receipt));
  assert.equal(goal.status, "COMPLETED"); assert.equal(goal.plan.targets[0].status, "DONE");
  assert.equal(goal.semanticTargetCompletions.length, 1); assert.equal(goal.timeline.length, 1);
  assert.equal(goal.finalReport, undefined); assert.equal(goal.releaseDecision, undefined);
  assert.equal(f.calls(), 2); assert.deepEqual(Object.keys(after).filter(k => before[k] !== after[k]), ["goals/" + f.identity.goalId + ".json"]);
  const restarted = f.restart(); assert.deepEqual(restarted.completionReceipt(f.value, f.access), receipt);
  assert.deepEqual(await restarted.completeTarget(f.value, f.access), receipt);
  // Expired current grants do not replay a previously durable completion.
  f.time.set(f.time.get() + 300000);
  assert.deepEqual(await restarted.completeTarget(f.value, f.access), receipt);
  assert.deepEqual(snapshot(f.configuration.dataRoot), after); assert.equal(f.calls(), 2);
  assert.throws(() => createSemanticRuntimeSourceReader(f.configuration.dataRoot).read(f.identity, f.access.currentAccess().principal), {code: "PERMISSION_DENIED"});
});
test("Target completion leaves Goal RUNNING while another required Target is unfinished", async t => {
  const f = await fixture(t, {beforeSource: g => {g.plan.targets.push({...g.plan.targets[0], id: "other-target", status: "READY"});}});
  const result = await complete(f), goal = rawGoal(f);
  assert.equal(result.resultingGoalStatus, "RUNNING"); assert.equal(goal.status, "RUNNING");
  assert.equal(goal.plan.targets[0].status, "DONE"); assert.equal(goal.plan.targets[1].status, "READY");
  assert.deepEqual(f.app.completionReceipt(f.value, f.access), result);
});
for (const [name, policy] of [["missing", false], ["revoked", {status: "REVOKED"}], ["wrong action", {action: "PUBLISH"}],
  ["wrong scope", {scope: {projectId: "other"}}], ["expired", {validUntil: "2000-01-01T00:00:00Z"}],
  ["future", {validFrom: "2999-01-01T00:00:00Z"}], ["unsupported closure", {goalCompletion: "ANY_DONE"}]])
  test(`completion refuses ${name} explicit completion policy without writes`, async t => {
    const f = await fixture(t, {goalCompletionPolicy: policy}), before = snapshot(f.configuration.dataRoot);
    await assert.rejects(() => complete(f)); assert.deepEqual(snapshot(f.configuration.dataRoot), before); assert.equal(f.calls(), 1);
  });
for (const [name, mutate] of [
  ["another raw DONE Target", g => {g.plan.targets.push({...g.plan.targets[0], id: "other-target", status: "DONE"});}],
  ["phase Target packages", g => {g.plan.targets[0].phase = "ga";}]
]) test(`semantic completion cannot replace ${name}`, async t => {
  if (name === "phase Target packages") {await assert.rejects(fixture(t, {beforeSource: mutate})); return;}
  const f = await fixture(t, {beforeSource: mutate}), before = snapshot(f.configuration.dataRoot);
  await assert.rejects(() => complete(f)); assert.deepEqual(snapshot(f.configuration.dataRoot), before);
});
for (const [name, mutate] of [["GA", g => {g.terminalMaturity = "ga";}], ["phase", g => {g.plan.phaseTargets = [{id: "ga"}];}]])
  test(`a non-phase Target can finish without closing a ${name} Goal or generating a release decision`, async t => {
    const f = await fixture(t, {beforeSource: mutate}); const receipt = await complete(f), g = rawGoal(f);
    assert.equal(g.plan.targets[0].status, "DONE"); assert.equal(g.status, "RUNNING"); assert.equal(receipt.resultingGoalStatus, "RUNNING");
    assert.equal(g.finalReport, undefined); assert.equal(g.releaseDecision, undefined);
  });
for (const slot of ["policy", "authority", "evidence", "environment", "provider"]) test(`current ${slot} activation removal refuses completion`, async t => {
  const f = await fixture(t);
  // The helper's file method is the immutable evidence locator; derive the
  // independent owning activation path from its exact scoped selection.
  const kind = {policy: "PolicyPack", authority: "HumanAuthorityRole", evidence: "GovernancePack", environment: "EnvironmentBinding", provider: "ActionProviderDefinition"}[slot];
  fs.unlinkSync(path.join(f.configuration.dataRoot, "governed-evolution-resources-active", f.scope.tenantId, f.scope.workspaceId, `${kind}--${f.refs[slot].id}.json`));
  const before = snapshot(f.configuration.dataRoot); await assert.rejects(() => complete(f)); assert.deepEqual(snapshot(f.configuration.dataRoot), before);
});
test("expired Host observation and current grants cannot be replaced by old success", async t => {
  const f = await fixture(t); f.time.set(f.time.get() + 180000);
  const before = snapshot(f.configuration.dataRoot); await assert.rejects(() => complete(f)); assert.deepEqual(snapshot(f.configuration.dataRoot), before);
});
test("current Catalog trust removal refuses completion", async t => {
  const f = await fixture(t); fs.unlinkSync(f.configuration.policyPath);
  const before = snapshot(f.configuration.dataRoot); await assert.rejects(() => complete(f)); assert.deepEqual(snapshot(f.configuration.dataRoot), before);
});
test("current access, exact input and cancellation are checked before a write", async t => {
  const f = await fixture(t), before = snapshot(f.configuration.dataRoot), controller = new AbortController(); controller.abort();
  await assert.rejects(() => f.app.completeTarget({...f.value, approved: true}, f.access), {code: "INVALID"});
  await assert.rejects(() => f.app.completeTarget(f.value, {...f.access, signal: controller.signal}), {code: "CANCELLED"});
  await assert.rejects(() => f.app.completeTarget(f.value, {currentAccess: () => ({...f.access.currentAccess(), principal: {...f.access.currentAccess().principal, role: "viewer"}})}), {code: "PERMISSION_DENIED"});
  assert.deepEqual(snapshot(f.configuration.dataRoot), before);
});
test("concurrent requests produce exactly one Goal receipt and one timeline event", async t => {
  const f = await fixture(t), results = await Promise.allSettled([complete(f), complete(f)]);
  assert(results.some(r => r.status === "fulfilled"));
  const goal = rawGoal(f); assert.equal(goal.semanticTargetCompletions.length, 1); assert.equal(goal.timeline.length, 1);
  assert.equal(f.calls(), 1); assert.deepEqual(await complete(f), goal.semanticTargetCompletions[0]);
});
for (const when of ["before", "after"]) test(`${when}-rename failure never causes automatic completion replay`, async t => {
  const f = await fixture(t), before = fs.readFileSync(goalFile(f), "utf8"), rename = fs.renameSync, fsync = fs.fsyncSync;
  let renamed = false;
  fs.renameSync = (...args) => {
    if (args[1] === goalFile(f)) {if (when === "before") throw new Error("SYNTHETIC_PRE_RENAME"); renamed = true;}
    return rename(...args);
  };
  fs.fsyncSync = (...args) => {if (renamed && when === "after") throw new Error("SYNTHETIC_POST_RENAME"); return fsync(...args);};
  try {await assert.rejects(() => complete(f), new RegExp(`SYNTHETIC_${when === "before" ? "PRE" : "POST"}_RENAME`));}
  finally {fs.renameSync = rename; fs.fsyncSync = fsync;}
  if (when === "before") {
    assert.equal(fs.readFileSync(goalFile(f), "utf8"), before); assert(!fs.existsSync(goalFile(f) + ".lock"));
    assert.equal((await complete(f)).resultingGoalStatus, "COMPLETED");
  } else {
    assert.equal(rawGoal(f).status, "COMPLETED"); assert(fs.existsSync(goalFile(f) + ".lock"));
    await assert.rejects(() => complete(f), /RECONCILIATION_REQUIRED/);
    assert.throws(() => f.app.completionReceipt(f.value, f.access), /RECONCILIATION_REQUIRED/);
  }
  assert.equal(f.calls(), 1);
});
test("a stale Goal revision cannot overwrite an intervening owner write", async t => {
  const f = await fixture(t), write = GoalRecordStore.prototype.write; let injected = false;
  GoalRecordStore.prototype.write = function(next, previous) {
    if (next.semanticTargetCompletions && !injected) {
      injected = true; write.call(this, {...previous, updatedAt: "2026-09-24T12:00:00Z"}, previous);
    }
    return write.call(this, next, previous);
  };
  try {await assert.rejects(() => complete(f), /REVISION_CONFLICT/);} finally {GoalRecordStore.prototype.write = write;}
  assert.equal(rawGoal(f).semanticTargetCompletions, undefined); assert.equal(rawGoal(f).status, "APPROVED");
});
test("missing or changed historical evidence prevents receipt readback without rewriting completion", async t => {
  const f = await fixture(t); await complete(f);
  const goal = fs.readFileSync(goalFile(f), "utf8"); f.mutateRun(r => {r.status = "RUNNING";});
  assert.throws(() => f.app.completionReceipt(f.value, f.access)); await assert.rejects(() => complete(f));
  assert.equal(fs.readFileSync(goalFile(f), "utf8"), goal); assert.equal(f.calls(), 1);
});
test("a durable non-phase Target receipt cannot validate a forged COMPLETED GA Goal", async t => {
  const f = await fixture(t, {beforeSource: g => {g.terminalMaturity = "ga";}}); await complete(f);
  f.changeGoal(g => {g.status = "COMPLETED";});
  const before = snapshot(f.configuration.dataRoot);
  assert.throws(() => f.app.completionReceipt(f.value, f.access), {code: "DRIFT"});
  await assert.rejects(() => complete(f), {code: "DRIFT"}); assert.deepEqual(snapshot(f.configuration.dataRoot), before);
});
test("legacy capability negotiation and malformed requests cannot authorize completion or publication", () => {
  assert.equal(semanticExecutionCapabilities("synthetic", true, true).completionAvailable, false);
  for (const operation of ["completeTarget", "completionReceipt", "completeGoal"])
    assert.throws(() => semanticExecutionRequest(operation, "synthetic", {}));
});
