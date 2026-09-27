import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {semanticPhaseFixture} from "../helpers/semantic-phase-fixture.mjs";
import {createServer} from "../../packages/server/dist/index.js";
import {GoalRecordStore} from "../../packages/server/dist/storage/goal-record-store.js";
import {createSemanticGoalCompletionService, } from "../../packages/server/dist/application/semantic-goal-completion.js";
import {semanticExecutionImplementationDigest} from "../../packages/server/dist/application/semantic-execution-application.js";
const snapshot = f => Object.fromEntries(fs.readdirSync(f.configuration.dataRoot, {recursive: true}).filter(n => n.endsWith(".json"))
  .map(n => [n, fs.readFileSync(path.join(f.configuration.dataRoot, n), "utf8")]));
const commit = f => f.app.completePhase(f.phaseInput, f.access);
test("every required member needs a verified receipt; raw DONE is insufficient", async t => {
  const f = await semanticPhaseFixture(t, {beforeSource: g => {
    g.plan.targets.push({...g.plan.targets[0], id: "missing-member"}); g.plan.phaseTargets[0].goalTargetIds.push("missing-member");
  }});
  f.changeGoal(g => {g.plan.targets[1].status = "DONE";}); const before = snapshot(f);
  assert.throws(() => commit(f)); assert.deepEqual(snapshot(f), before);
});
test("optional unfinished members do not become completed or satisfy phase obligations", async t => {
  const f = await semanticPhaseFixture(t, {beforeSource: g => {
    g.plan.targets.push({...g.plan.targets[0], id: "optional", required: false}); g.plan.phaseTargets[0].goalTargetIds.push("optional");
  }});
  const r = commit(f); assert.equal(r.targetReceipts.length, 1); assert.equal(f.rawGoal().plan.targets[1].status, "READY");
});
test("phase package closes only its phase in one Goal CAS and has durable historical readback", async t => {
  const f = await semanticPhaseFixture(t), before = snapshot(f), r = commit(f), g = f.rawGoal(), after = snapshot(f);
  assert.equal(r.goalCompleted, false); assert.equal(r.releaseAuthorized, false);
  assert.equal(g.plan.phaseTargets[0].status, "PASSED"); assert.equal(g.plan.phaseTargets[0].decision.status, "GO"); assert.equal(g.status, "RUNNING");
  assert.equal(g.finalReport, undefined); assert.equal(g.releaseDecision, undefined);
  assert.deepEqual(Object.keys(after).filter(k => before[k] !== after[k]), ["goals/" + g.id + ".json"]);
  assert.equal(g.semanticPhaseCompletions.length, 1); assert.equal(g.timeline.length, 2);
  f.time.set(f.time.get() + 300000);
  assert.deepEqual(f.restart().phaseReceipt(f.phaseInput, f.access), r); assert.deepEqual(commit(f), r); assert.deepEqual(snapshot(f), after);
  const view = f.app.goalViews(g.id, {currentAccess: () => f.access.currentAccess()});
  assert.equal(view.snapshot.phases[0].decision.status, "GO"); assert.equal(view.snapshot.status, "BLOCKED"); assert.equal(view.finalReport, undefined); assert.equal(f.calls(), 1);
});
for (const [name, options] of [
  ["missing policy", {noPolicy: true}], ["revoked policy", {policy: {status: "REVOKED"}}], ["expired policy", {policy: {validUntil: "2000-01-01T00:00:00Z"}}],
  ["missing Target receipt", {pendingTarget: true}], ["foreign scope", {package: p => {p.scope = {...p.scope, workspaceId: "foreign"};}}],
  ["unreviewed phase mapping", {package: p => {p.criteria[0].targetCriterionDigest = "sha256:" + "f".repeat(64);}}],
  ["missing criteria", {package: p => {p.criteria = [];}}], ["missing evidence", {package: p => {p.evidence = [];}}],
  ["wrong source", {package: p => {p.evidence[0].sourceDigests = ["sha256:" + "f".repeat(64)];}}],
  ["missing output", {package: p => {p.outputs = [];}}], ["failed review", {package: p => {p.reviews[0].status = "FAILED";}}],
  ["authority injection", {package: p => {p.releaseAuthorized = true;}}]
]) test(`aggregate phase refuses ${name} without writes or execution`, async t => {
  const f = await semanticPhaseFixture(t, options), before = snapshot(f); assert.throws(() => commit(f)); assert.deepEqual(snapshot(f), before); assert.equal(f.calls(), 1);
});
test("phase current permission and activation, scope, cancellation and retained locks fail closed", async t => {
  const f = await semanticPhaseFixture(t), before = snapshot(f), abort = new AbortController(); abort.abort();
  assert.throws(() => f.app.completePhase(f.phaseInput, {...f.access, signal: abort.signal}));
  assert.throws(() => f.app.completePhase(f.phaseInput, {currentAccess: () => ({...f.access.currentAccess(), principal: {...f.access.currentAccess().principal, role: "viewer"}})}));
  fs.writeFileSync(f.goalFile + ".lock", "retained"); assert.throws(() => commit(f)); fs.unlinkSync(f.goalFile + ".lock");
  assert.deepEqual(snapshot(f), before);
  fs.unlinkSync(path.join(f.configuration.dataRoot, "governed-evolution-resources-active", f.scope.tenantId, f.scope.workspaceId, `GovernancePack--${f.refs.evidence.id}.json`));
  const changed = snapshot(f); assert.throws(() => commit(f)); assert.deepEqual(snapshot(f), changed);
});
test("only a verified phase receipt releases the dependent Target predecessor guard", async t => {
  const f = await semanticPhaseFixture(t, {beforeSource: g => {
    const next = {...g.plan.targets[0], id: "beta-target", phase: "beta"}; g.plan.targets.push(next);
    g.plan.phaseTargets.push({...g.plan.phaseTargets[0], id: "phase-beta", phase: "beta", dependencyPhase: "alpha", goalTargetIds: [next.id]});
  }});
  const service = createSemanticGoalCompletionService(f.configuration, {lifecycle: f.lifecycleService, governed: f.governed, now: f.time.get, implementationDigest: semanticExecutionImplementationDigest});
  const identity = {...f.identity, targetId: "beta-target"};
  f.changeGoal(g => {g.plan.phaseTargets[0].status = "PASSED"; g.plan.phaseTargets[0].decision.status = "GO";});
  assert.throws(() => service.assertPredecessor(identity, f.access));
  const r = commit(f); assert.equal(service.assertPredecessor(identity, f.access), r.receiptDigest);
  f.changeGoal(g => {g.semanticPhaseCompletions[0].packageDigest = "sha256:" + "f".repeat(64);});
  assert.throws(() => service.assertPredecessor(identity, f.access));
});
for (const moment of ["before-rename", "after-rename"]) test(`phase ${moment} failure preserves CAS/reconciliation rules`, async t => {
  const f = await semanticPhaseFixture(t), before = fs.readFileSync(f.goalFile, "utf8");
  const rename = fs.renameSync, sync = fs.fsyncSync; let renamed = false;
  fs.renameSync = (...args) => {if (args[1] === f.goalFile) {if (moment === "before-rename") throw new Error("injected"); renamed = true;} return rename(...args);};
  fs.fsyncSync = (...args) => {if (renamed && moment === "after-rename") throw new Error("injected"); return sync(...args);};
  try {assert.throws(() => commit(f), /injected/);} finally {fs.renameSync = rename; fs.fsyncSync = sync;}
  if (moment === "before-rename") assert.equal(fs.readFileSync(f.goalFile, "utf8"), before);
  else {assert(fs.existsSync(f.goalFile + ".lock")); assert.throws(() => commit(f), /RECONCILIATION_REQUIRED/); assert.throws(() => f.app.phaseReceipt(f.phaseInput, f.access), /RECONCILIATION_REQUIRED/);}
});
test("public HTTP phase commit and receipt preserve the GA/report boundary", async t => {
  const f = await semanticPhaseFixture(t), server = createServer({dataRoot: f.configuration.dataRoot, runtimeMode: "debug", llmClient: {}, allowSampleData: false,
    autoRegisterProfileProject: false, harnessRegistryConfig: f.configuration.registryConfigPath, semanticCatalogPolicyPath: f.configuration.policyPath,
    tokens: [{name: f.access.currentAccess().principal.id, token: "synthetic-operator", role: "operator", ...f.scope}]});
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
  const url = `http://127.0.0.1:${server.address().port}`, headers = {authorization: "Bearer synthetic-operator", "content-type": "application/json"};
  const call = op => fetch(url + `/api/v1/projects/${f.scope.projectId}/semantic-execution/${op}`, {method: "POST", headers, body: JSON.stringify(f.phaseInput)});
  const response = await call("completePhase"), body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual((await (await call("phaseReceipt")).json()).data, body.data);
  assert.equal((await fetch(url + `/api/v1/goals/${f.identity.goalId}/final-report`, {headers})).status, 409);
});
test("stale phase CAS cannot overwrite an intervening Goal owner write", async t => {
  const f = await semanticPhaseFixture(t), write = GoalRecordStore.prototype.write; let injected = false;
  GoalRecordStore.prototype.write = function(next, previous) {
    if (next.semanticPhaseCompletions && !injected) {injected = true; write.call(this, {...previous, updatedAt: "2026-09-24T12:00:00Z"}, previous);}
    return write.call(this, next, previous);
  };
  try {assert.throws(() => commit(f), /REVISION_CONFLICT/);} finally {GoalRecordStore.prototype.write = write;}
  assert.equal(f.rawGoal().semanticPhaseCompletions, undefined); assert.equal(f.rawGoal().plan.phaseTargets[0].status, "PENDING");
});
