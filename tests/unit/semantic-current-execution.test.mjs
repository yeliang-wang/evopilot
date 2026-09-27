import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {semanticCurrentOwnerFixture} from "../helpers/semantic-current-owner-fixture.mjs";
import {createSemanticCurrentExecutionReader} from "../../packages/server/dist/application/semantic-current-execution.js";

test("fixed current owners compose real stored sources into binding, review, context, dispatch and incomplete outcome", async t => {
  const f = await semanticCurrentOwnerFixture(t);
  const before = ["policy", "authority", "provider", "environment", "evidence"].flatMap(slot => [false, true].map(active => fs.readFileSync(f.file(slot, active), "utf8")));
  // These stale callback fields are not input to the fixed owner composition.
  f.state.permissions.allowedEffects = ["IRREVERSIBLE"]; f.state.llmProfile = {...f.state.llmProfile, modelName: "stale"};
  const current = f.currentExecution(f.identity), bound = await f.bind();
  assert.deepEqual(current.permissions.allowedEffects, ["READ_ONLY", "REVERSIBLE"]); assert.notEqual(current.llmProfile.modelName, "stale");
  assert(bound.runtimeSourcePins && bound.governedSourcePins && bound.executorSourcePins); assert.equal(bound.eligibleForExecution, false);
  assert(Object.isFrozen(current.permissions)); assert(Object.isFrozen(current.contextPlan));
  assert.deepEqual(createSemanticCurrentExecutionReader(f.configuration, f.ownerInputs)(f.identity), current);
  const slice = await f.resolve(bound); assert.equal(slice.status, "PREPARED_NOT_DISPATCHED");
  await assert.rejects(f.dispatch(bound), {code: "UNAVAILABLE"}); assert.equal(f.calls(), 0);
  await f.review(bound); const receipt = await f.dispatch(bound); assert.equal(receipt.eligibleForCompletion, false);
  assert.equal((await f.evaluate(bound)).status, "INDETERMINATE", "exit zero and valid permissions cannot prove missing domain evidence");
  assert.deepEqual(await f.dispatch(bound), receipt); assert.equal(f.calls(), 1);
  assert.deepEqual(["policy", "authority", "provider", "environment", "evidence"].flatMap(slot => [false, true].map(active => fs.readFileSync(f.file(slot, active), "utf8"))), before);
});

for (const slot of ["policy", "authority"]) {
  test(`${slot} registration alone is not an explicit permission activation`, async t => {
    const f = await semanticCurrentOwnerFixture(t, {skipActivation: slot}); assert.throws(f.permission, {code: "PERMISSION_DENIED"});
    await assert.rejects(f.bind(), {code: "PERMISSION_DENIED"}); assert.equal(f.calls(), 0);
  });
  test(`${slot} deny wins over both allow lists and executor observation`, async t => {
    const f = await semanticCurrentOwnerFixture(t, {mutateDeclaration: (kind, value) => {if (kind === slot) value.deniedEffects = ["REVERSIBLE"];}});
    assert.deepEqual(f.permission().permissions.allowedEffects, ["READ_ONLY"]);
    await assert.rejects(f.bind(), {code: "PERMISSION_DENIED"});
  });
  test(`${slot} exact expiry blocks an already reviewed binding before dispatch`, async t => {
    const f = await semanticCurrentOwnerFixture(t), bound = await f.bind(); await f.review(bound);
    f.time.set(Date.parse(f.declarations[slot].validUntil));
    await assert.rejects(f.resolve(bound), {code: "PERMISSION_DENIED"}); await assert.rejects(f.dispatch(bound), {code: "PERMISSION_DENIED"}); assert.equal(f.calls(), 0);
  });
  test(`${slot} missing active pointer never falls back to its saved or latest grant`, async t => {
    const f = await semanticCurrentOwnerFixture(t), bound = await f.bind(); fs.unlinkSync(f.file(slot, true));
    await assert.rejects(f.resolve(bound), {code: "UNAVAILABLE"}); assert.equal(fs.existsSync(f.file(slot, true)), false);
  });
}
for (const [name, change] of [
  ["revoked", v => {v.status = "REVOKED";}], ["foreign project", v => {v.scope.projectId = "other";}],
  ["future grant", v => {v.validFrom = "2099-01-01T00:00:00Z";}], ["invalid expiry", v => {v.validUntil = "bad";}],
  ["viewer", v => {v.roles = ["viewer"];}], ["wildcard roles", v => {v.roles = ["*"];}],
  ["wildcard capabilities", v => {v.capabilities = ["*"];}], ["unknown effect", v => {v.allowedEffects = ["PUBLICATION"];}],
  ["duplicate capability", v => {v.capabilities.push(v.capabilities[0]);}], ["extra authority", v => {v.mayRelease = true;}],
  ["missing typed policy", v => {delete v.schema;}]
]) test(`activated policy still refuses ${name}`, async t => {
  const f = await semanticCurrentOwnerFixture(t, {mutateDeclaration: (slot, v) => {if (slot === "policy") change(v);}});
  assert.throws(f.permission); await assert.rejects(f.bind()); assert.equal(f.calls(), 0);
});
test("grant cannot apply to a different principal; operator grant cannot apply to admin by implication", async t => {
  const f = await semanticCurrentOwnerFixture(t, {mutateDeclaration: (slot, value) => {if (slot === "authority") value.principalId = "other";}});
  assert.throws(f.permission, {code: "PERMISSION_DENIED"});
  const g = await semanticCurrentOwnerFixture(t, {mutateDeclaration: (_slot, value) => {value.roles = ["operator"];}});
  g.access.principal.role = "admin"; assert.throws(g.permission, {code: "PERMISSION_DENIED"});
});
test("policy, grant and observed ceiling cannot widen one another", async t => {
  const f = await semanticCurrentOwnerFixture(t, {mutateDeclaration: (slot, value) => {
    if (slot === "policy") {value.allowedEffects.push("IRREVERSIBLE"); value.capabilities.push("release.publish");}
  }, mutateObservation: value => {value.permissionCeiling.allowedEffects.push("IRREVERSIBLE"); value.permissionCeiling.capabilities.push("release.publish");}});
  const current = f.currentExecution(f.identity);
  assert.deepEqual(current.permissions.allowedEffects, ["READ_ONLY", "REVERSIBLE"]); assert.deepEqual(current.permissions.capabilities, ["goal-loop.execute"]);
});
test("denied capability is removed even when allowed by both policy and grant", async t => {
  const f = await semanticCurrentOwnerFixture(t, {mutateDeclaration: (slot, value) => {if (slot === "authority") value.deniedCapabilities = ["goal-loop.execute"];}});
  assert.deepEqual(f.permission().permissions.capabilities, []); await assert.rejects(f.bind(), {code: "PERMISSION_DENIED"});
});
test("mutable plan callback cannot inject effective permissions, qualifications or LLM route", async t => {
  const f = await semanticCurrentOwnerFixture(t);
  for (const key of ["permissions", "qualification", "llmProfile"]) {
    const read = createSemanticCurrentExecutionReader(f.configuration, {...f.ownerInputs, currentPlan: id => ({...f.ownerInputs.currentPlan(id), [key]: f.state[key]})});
    assert.throws(() => read(f.identity), {code: "INVALID"});
  }
});
test("persisted Goal revocation and LLM change invalidate composed execution", async t => {
  const f = await semanticCurrentOwnerFixture(t), bound = await f.bind();
  f.changeGoal(goal => {goal.plan.status = "PENDING_APPROVAL";}); await assert.rejects(f.resolve(bound), {code: "PERMISSION_DENIED"});
  const g = await semanticCurrentOwnerFixture(t), other = await g.bind();
  g.runtimeStore.writeLlmProfile({...g.state.llmProfile, modelName: "changed"}); await assert.rejects(g.resolve(other), {code: "DRIFT"});
});
test("permission expiry or principal change inside another owner read is detected", async t => {
  const f = await semanticCurrentOwnerFixture(t), original = f.ownerInputs.currentPlan;
  f.ownerInputs.currentPlan = id => {f.time.set(Date.parse(f.declarations.policy.validUntil)); return original(id);};
  assert.throws(() => createSemanticCurrentExecutionReader(f.configuration, f.ownerInputs)(f.identity), {code: "PERMISSION_DENIED"});
  const g = await semanticCurrentOwnerFixture(t), get = g.ownerInputs.currentPlan;
  g.ownerInputs.currentPlan = id => {g.access.principal.role = "viewer"; return get(id);};
  assert.throws(() => createSemanticCurrentExecutionReader(g.configuration, g.ownerInputs)(g.identity));
});
test("missing plan, changed Lifecycle or changed objective cannot reuse old seed metadata", async t => {
  for (const change of [f => {delete f.state.contextPlan;}, f => {f.state.harness.lifecycleDigest = "sha256:" + "0".repeat(64);},
    f => {f.state.goalTarget.objective = "unapproved replacement";}]) {
    const f = await semanticCurrentOwnerFixture(t); change(f); await assert.rejects(f.bind());
  }
});
for (const mutation of ["expiry", "revocation"]) test(`final plan read cannot conceal permission ${mutation}`, async t => {
  const f = await semanticCurrentOwnerFixture(t), original = f.ownerInputs.currentPlan;
  let reads = 0;
  f.ownerInputs.currentPlan = id => {
    if (++reads === 2) {
      if (mutation === "expiry") f.time.set(Date.parse(f.declarations.policy.validUntil));
      else fs.unlinkSync(f.file("authority", true));
    }
    return original(id);
  };
  assert.throws(() => createSemanticCurrentExecutionReader(f.configuration, f.ownerInputs)(f.identity),
    {code: mutation === "expiry" ? "PERMISSION_DENIED" : "UNAVAILABLE"});
  assert.equal(f.calls(), 0);
});
test("revocation during the adapter await retains one receipt but never returns usable execution or replays", async t => {
  const f = await semanticCurrentOwnerFixture(t, {onRun: value => {value.access.principal.role = "viewer";}}), bound = await f.bind();
  await f.review(bound); await assert.rejects(f.dispatch(bound), {code: "PERMISSION_DENIED"});
  assert.equal(fs.readdirSync(path.join(f.configuration.dataRoot, "project-semantic-bindings/dispatch-results")).length, 1);
  await assert.rejects(f.dispatch(bound), {code: "PERMISSION_DENIED"}); assert.equal(f.calls(), 1);
});
