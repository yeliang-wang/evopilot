import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {FileStore} from "../../packages/server/dist/storage/file-store/index.js";
import {deriveGlobalGoalStatus, deriveGoalTarget} from "../../packages/server/dist/application/control-plane-services.js";
import {createSemanticExecutionPlanService} from "../../packages/server/dist/application/semantic-execution-plan.js";
import {createSemanticGoalOwnership} from "../../packages/server/dist/application/semantic-goal-ownership.js";
import {semanticCurrentOwnerFixture} from "../helpers/semantic-current-owner-fixture.mjs";

async function fixture(t) {
  const f = await semanticCurrentOwnerFixture(t);
  const plans = createSemanticExecutionPlanService(f.configuration, {governed: f.governed, lifecycle: f.lifecycleService,
    currentHarness: () => f.state.harness, now: f.time.get});
  const access = {currentAccess: f.ownerInputs.currentAccess};
  const declaration = {identity: f.identity, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest,
    goalTarget: f.state.goalTarget, contextPlan: f.state.contextPlan, outcomePlan: f.state.outcomePlan, selections: f.selected};
  const store = new FileStore(f.configuration.dataRoot, {requireLlm: false, allowLegacyGlobalLlm: false});
  const owner = {schema: "evopilot-semantic-goal-owner/v1", targetId: f.identity.targetId,
    runId: f.run.id, harnessBindingDigest: f.identity.harnessBindingDigest};
  return {...f, store, owner, plans, declaration, access,
    goalFile: path.join(f.configuration.dataRoot, "goals", f.identity.goalId + ".json"),
    ownership: createSemanticGoalOwnership(f.configuration.dataRoot)};
}
test("legacy Goal update requires the exact pre-operation revision; caller JSON is not a revision", async t => {
  const f = await fixture(t), a = f.store.readGoal(f.identity.goalId), b = f.store.readGoal(f.identity.goalId);
  const fresh = f.store.writeGoal({...a, objective: "new meaning"}, a);
  assert.equal(f.store.readGoal(a.id).objective, "new meaning");
  assert.throws(() => f.store.writeGoal({...b, objective: "stale"}, b), /REVISION_CONFLICT/);
  assert.throws(() => f.store.writeGoal({...fresh, objective: "no revision"}), /REVISION_CONFLICT/);
  assert.throws(() => f.store.writeGoal({...fresh, objective: "forged"}, structuredClone(fresh)), /REVISION_REQUIRED/);
});
test("all legacy mutation entry points honor a retained Goal write claim", async t => {
  const f = await fixture(t), before = fs.readFileSync(f.goalFile);
  fs.writeFileSync(f.goalFile + ".lock", "synthetic interrupted write");
  for (const action of [
    () => f.store.approveGoalPlan(f.identity.goalId, "synthetic", {}),
    () => f.store.bindGoalTargetLoop(f.identity.goalId, f.identity.targetId, "synthetic-loop", "synthetic"),
    () => f.store.touchGoalTarget(f.identity.goalId, f.identity.targetId, "synthetic")
  ]) assert.throws(action, /RECONCILIATION_REQUIRED/);
  assert.deepEqual(fs.readFileSync(f.goalFile), before);
});
test("preparation durably fences the Goal without changing approval, Target state or source pins", async t => {
  const f = await fixture(t), before = f.store.readGoal(f.identity.goalId);
  const plan = await f.plans.prepare(f.declaration, f.access);
  const after = f.store.readGoal(f.identity.goalId);
  assert.deepEqual(after.semanticExecutionOwners, [f.owner]);
  assert.equal(after.status, before.status); assert.deepEqual(after.plan, before.plan);
  assert.deepEqual(plan.runtimeSourcePins, f.source.pins);
  assert.deepEqual(await f.plans.prepare(f.declaration, f.access), plan);
  assert.equal(f.calls(), 0);
});
for (const operation of ["advance", "generate", "report", "bind", "touch", "approve", "strip-owner-write"])
  test(`semantic ownership blocks legacy ${operation} before any mutation or dispatch`, async t => {
    const f = await fixture(t); await f.plans.prepare(f.declaration, f.access);
    const before = fs.readFileSync(f.goalFile), id = f.identity.goalId;
    const actions = {
      advance: () => f.store.advanceGoal(id, "synthetic", {autoStart: true}),
      generate: () => f.store.generateGoalPlan(id, "synthetic", {force: true}),
      report: () => f.store.ensureGoalCompletionReport(id, "synthetic"),
      bind: () => f.store.bindGoalTargetLoop(id, f.identity.targetId, "synthetic-loop", "synthetic"),
      touch: () => f.store.touchGoalTarget(id, f.identity.targetId, "synthetic"),
      approve: () => f.store.approveGoalPlan(id, "synthetic", {}),
      "strip-owner-write": () => {
        const previous = f.store.readGoal(id), next = structuredClone(previous);
        delete next.semanticExecutionOwners; next.status = "COMPLETED"; f.store.writeGoal(next, previous);
      }
    };
    await assert.rejects(async () => actions[operation](), /SEMANTIC_COMPLETION_REQUIRED/);
    assert.deepEqual(fs.readFileSync(f.goalFile), before); assert.equal(f.calls(), 0);
  });
test("stale legacy writer cannot overwrite a concurrently claimed Goal", async t => {
  const f = await fixture(t), stale = f.store.readGoal(f.identity.goalId);
  await f.plans.prepare(f.declaration, f.access);
  assert.throws(() => f.store.writeGoal({...stale, status: "COMPLETED"}, stale), /SEMANTIC_COMPLETION_REQUIRED/);
});
test("legacy snapshots, list and evidence matrix cannot expose injected DONE or finalReport as completion", async t => {
  const f = await fixture(t); await f.plans.prepare(f.declaration, f.access);
  f.changeGoal(g => {g.status = "COMPLETED"; g.plan.targets[0].status = "DONE"; g.finalReport = {status: "COMPLETED"};});
  const snapshot = f.store.goalSnapshot(f.identity.goalId);
  assert.equal(snapshot.status, "BLOCKED"); assert.equal(snapshot.progress.percent, 0);
  assert.equal(snapshot.goal.finalReport, undefined); assert.equal(snapshot.goal.plan.targets[0].status, "BLOCKED");
  assert.equal(f.store.listGoals()[0].status, "BLOCKED");
  assert.equal(f.store.listGoals()[0].finalReport, undefined);
  assert.equal(f.store.goalEvidenceMatrix(f.identity.goalId)[0].status, "BLOCKED");
  const raw = f.store.readGoal(f.identity.goalId);
  assert.equal(deriveGlobalGoalStatus(raw, raw.plan.targets), "BLOCKED");
  assert.equal(deriveGoalTarget(f.store, raw, raw.plan.targets[0], true).status, "BLOCKED");
});
test("missing ownership cannot fall back to persisted semantic plans", async t => {
  const f = await fixture(t); await f.plans.prepare(f.declaration, f.access);
  f.changeGoal(g => {delete g.semanticExecutionOwners;});
  assert.throws(() => f.plans.inspect(f.identity, f.access), {code: "DRIFT"}); assert.equal(f.calls(), 0);
});
test("ownership survives a failed plan write and exact preparation can resume without reopening legacy writes", async t => {
  const f = await fixture(t), link = fs.linkSync;
  const fail = t.mock.method(fs, "linkSync", (...args) => {
    if (String(args[1]).includes("/execution-plans/")) throw new Error("SYNTHETIC_PLAN_WRITE_FAILURE");
    return link(...args);
  });
  await assert.rejects(f.plans.prepare(f.declaration, f.access), /SYNTHETIC_PLAN_WRITE_FAILURE/);
  fail.mock.restore();
  assert.deepEqual(f.store.readGoal(f.identity.goalId).semanticExecutionOwners, [f.owner]);
  assert.throws(() => f.store.ensureGoalCompletionReport(f.identity.goalId, "synthetic"), /SEMANTIC_COMPLETION_REQUIRED/);
  await f.plans.prepare(f.declaration, f.access);
});
test("ambiguous ownership durability cannot resume preparation merely because the new Goal bytes are readable", async t => {
  const f = await fixture(t), fsync = fs.fsyncSync;
  const fail = t.mock.method(fs, "fsyncSync", fd => {
    if (fs.fstatSync(fd).isDirectory()) throw new Error("SYNTHETIC_OWNERSHIP_DURABILITY_FAILURE");
    return fsync(fd);
  });
  await assert.rejects(f.plans.prepare(f.declaration, f.access), /SYNTHETIC_OWNERSHIP_DURABILITY_FAILURE/);
  fail.mock.restore();
  const before = fs.readFileSync(f.goalFile);
  assert.deepEqual(f.store.readGoal(f.identity.goalId).semanticExecutionOwners, [f.owner]);
  assert(fs.existsSync(f.goalFile + ".lock"));
  await assert.rejects(f.plans.prepare(f.declaration, f.access), /RECONCILIATION_REQUIRED/);
  assert.deepEqual(fs.readFileSync(f.goalFile), before); assert.equal(f.calls(), 0);
});
test("already-prepared semantic execution refuses an unsettled Goal rather than using its historical plan", async t => {
  const f = await fixture(t); await f.plans.prepare(f.declaration, f.access);
  fs.writeFileSync(f.goalFile + ".lock", "synthetic interrupted write"); fs.utimesSync(f.goalFile + ".lock", 0, 0);
  assert.throws(() => f.plans.inspect(f.identity, f.access), /RECONCILIATION_REQUIRED/);
  await assert.rejects(f.plans.prepare(f.declaration, f.access), /RECONCILIATION_REQUIRED/);
  assert.equal(f.calls(), 0);
});
test("one Target cannot acquire another run or binding, and foreign scope cannot claim it", async t => {
  const f = await fixture(t); await f.plans.prepare(f.declaration, f.access);
  const before = fs.readFileSync(f.goalFile);
  for (const update of [{runId: "other"}, {harnessBindingDigest: "sha256:" + "0".repeat(64)}])
    assert.throws(() => f.ownership.claim(f.identity.goalId, f.scope, {...f.owner, ...update}), {code: "IDENTITY_CONFLICT"});
  assert.throws(() => f.ownership.claim(f.identity.goalId, {...f.scope, tenantId: "foreign"}, f.owner), {code: "PERMISSION_DENIED"});
  assert.deepEqual(fs.readFileSync(f.goalFile), before);
});
test("legacy loop-bound Target cannot be silently taken over by semantic preparation", async t => {
  const f = await fixture(t); f.changeGoal(g => {g.plan.targets[0].loopId = "legacy-loop";});
  await assert.rejects(f.plans.prepare(f.declaration, f.access), {code: "PERMISSION_DENIED"});
  assert.equal(f.store.readGoal(f.identity.goalId).semanticExecutionOwners, undefined);
});
