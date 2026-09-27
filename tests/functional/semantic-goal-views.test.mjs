import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {execFile} from "node:child_process";
import {semanticTerminalFixture} from "../helpers/semantic-terminal-fixture.mjs";
import {createServer} from "../../packages/server/dist/index.js";
import {buildPhasePackages, buildTargetEvidencePackage, buildGoalCompletionReport} from "../../packages/server/dist/application/control-plane-services.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

// Synthetic local sources only, including native/independent provenance labels.
async function fixture(t, options = {}) {
  const f = await semanticTerminalFixture(t, {goalCompletionPolicy: true, ...options,
    beforeSource: g => {delete g.terminalMaturity; g.plan.phaseTargets = []; options.beforeSource?.(g);}});
  const goalFile = path.join(f.configuration.dataRoot, "goals", f.identity.goalId + ".json");
  const server = createServer({dataRoot: f.configuration.dataRoot, runtimeMode: "debug", llmClient: {}, allowSampleData: false,
    autoRegisterProfileProject: false, harnessRegistryConfig: f.configuration.registryConfigPath, semanticCatalogPolicyPath: f.configuration.policyPath,
    tokens: [{name: f.access.currentAccess().principal.id, token: "synthetic-operator", role: "operator", ...f.scope},
      {name: "viewer", token: "synthetic-viewer", role: "viewer", ...f.scope},
      {name: "foreign", token: "synthetic-foreign", role: "operator", tenantId: "foreign", workspaceId: "foreign"}]});
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
  const request = async (suffix = "", token = "synthetic-operator") => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/goals/${f.identity.goalId}${suffix}`,
      {headers: {authorization: "Bearer " + token}}); return {status: r.status, body: await r.json(), headers: r.headers};
  };
  return {...f, request, goalFile, serverUrl: `http://127.0.0.1:${server.address().port}`, raw: () => JSON.parse(fs.readFileSync(goalFile)),
    complete: () => f.app.completeTarget(f.value, f.access),
    views: () => f.app.goalViews(f.identity.goalId, {currentAccess: () => f.access.currentAccess()})};
}
test("existing Goal views return verified non-phase completion without persisting a report or implying release", async t => {
  const f = await fixture(t, {additionalStage: true,processUsage:{amount:0.25,currency:"USD",inputTokens:3,outputTokens:2}}); await f.complete();
  const before = fs.readFileSync(f.goalFile, "utf8"), snapshot = await f.request("/snapshot");
  assert.equal(snapshot.status, 200, JSON.stringify(snapshot.body)); assert.equal(snapshot.headers.get("cache-control"), "no-store");
  assert.equal(snapshot.body.data.status, "COMPLETED"); assert.equal(snapshot.body.data.progress.percent, 100);
  assert.equal(snapshot.body.data.releaseDecision, undefined); assert.deepEqual(snapshot.body.data.phases, []);
  assert.equal((await f.request()).body.data.status, "COMPLETED");
  assert.equal((await f.request("/evidence-matrix")).body.data[0].status, "DONE");
  assert.equal((await f.request("/graph")).body.data.nodes[0].status,"DONE");
  const runStatus=(await f.request("/run-status")).body.data;
  assert.equal(runStatus.schema,"evopilot-semantic-goal-run-status/v1");assert.equal(runStatus.status,"COMPLETED");
  assert.equal(runStatus.llmUsageStatus,"VERIFIED_COMPLETED_TARGETS");assert.equal(runStatus.release.authorized,false);
  assert.equal(runStatus.llmUsage.totals.totalTokens,10);assert.equal(runStatus.llmUsage.totals.reportedCost.amount,0.5);
  assert.equal(runStatus.llmUsage.coverage.measuredExecutions,2);assert.equal(runStatus.llmUsage.executions.length,2);
  assert.equal(runStatus.llmUsage.billingReconciled,false);
  assert.equal((await f.request("/targets")).body.data[0].status,"DONE");assert.deepEqual((await f.request("/phases")).body.data,[]);
  const list=await fetch(f.serverUrl+"/api/v1/goals",{headers:{authorization:"Bearer synthetic-operator"}});
  assert.equal(list.status,200);assert.equal((await list.json()).data.find(g=>g.id===f.identity.goalId).status,"COMPLETED");
  const report = await f.request("/final-report"); assert.equal(report.status, 200);
  assert.equal(report.body.data.status, "COMPLETED"); assert.equal(report.body.data.releaseDecision, undefined);
  assert.deepEqual(report.body.data.phasePackages, []); assert.match(report.body.data.conclusion, /No phase\/GA/);
  assert.equal(f.raw().finalReport, undefined); assert.equal(fs.readFileSync(f.goalFile, "utf8"), before); assert.equal(f.calls(), 2);
  const cli = await new Promise(resolve => execFile(process.execPath, [path.resolve("packages/cli/dist/index.js"), "goal", "final-report", f.identity.goalId,
    "--server", f.serverUrl, "--config", path.join(f.root, "unused-config.json"), "--json"],
  {timeout: 30000, env: {PATH: process.env.PATH, EVOPILOT_API_TOKEN: "synthetic-operator", EVOPILOT_LOG_LEVEL: "error"}},
  (error, stdout, stderr) => resolve({code: error?.code ?? 0, stdout, stderr})));
  assert.equal(cli.code, 0, cli.stderr); assert.equal(JSON.parse(cli.stdout).status, "COMPLETED");
  assert.deepEqual(f.restart().goalViews(f.identity.goalId, {currentAccess: () => f.access.currentAccess()}), f.views());
});
test("completed Target with absent telemetry reports unavailable, not measured zero",async t=>{
  const f=await fixture(t);await f.complete();const usage=(await f.request("/run-status")).body.data.llmUsage;
  assert.equal(usage.status,"UNAVAILABLE");assert.equal(usage.totals,null);assert.equal(usage.coverage.verifiedTargets,1);
  assert.equal(usage.executions[0].inputTokens,null);
});
test("tampered persisted usage invalidates completed Goal readback without replay",async t=>{
  const f=await fixture(t,{processUsage:{amount:0.25,currency:"USD",inputTokens:3,outputTokens:2}});await f.complete();
  const file=f.file("dispatch-results",{scope:f.scope,runId:f.value.runId,sourceRequestDigest:f.stages[0].pending.requestDigest});
  const value=JSON.parse(fs.readFileSync(file));
  value.value.result.cost.inputTokens=123;
  const {recordDigest,...body}=value;fs.writeFileSync(file,JSON.stringify({...body,recordDigest:d(body)}));
  assert.equal((await f.request("/run-status")).status,409);assert.equal(f.calls(),1);
});
for (const [name, mutate, percent] of [["another required Target", g => {g.plan.targets.push({...g.plan.targets[0], id: "remaining", status: "READY"});}, 50],
  ["GA closure", g => {g.terminalMaturity = "ga";}, 100]]) test(`old views keep ${name} blocked instead of generating a final report`, async t => {
    const f = await fixture(t, {beforeSource: mutate}); await f.complete(); const snapshot = (await f.request("/snapshot")).body.data;
    assert.equal(snapshot.status, "BLOCKED"); assert.equal(snapshot.progress.percent, percent); assert(snapshot.blockers.length);
    assert.equal((await f.request("/final-report")).status, 409); assert.equal(f.raw().finalReport, undefined);
  });
test("pending terminal evidence is not a completed Target and raw flags never substitute for receipts", async t => {
  const f = await fixture(t); const before = fs.readFileSync(f.goalFile, "utf8");
  const pending = await f.request("/snapshot"); assert.equal(pending.status, 200); assert.equal(pending.body.data.progress.percent, 0);
  const usage=(await f.request("/run-status")).body.data.llmUsage;
  assert.equal(usage.status,"UNAVAILABLE");assert.equal(usage.totals,null);assert.equal(usage.coverage.verifiedTargets,0);
  assert.equal((await f.request("/final-report")).status, 409); assert.equal(fs.readFileSync(f.goalFile, "utf8"), before);
  f.changeGoal(g => {g.status = "COMPLETED"; g.plan.targets[0].status = "DONE";});
  for (const suffix of ["", "/snapshot", "/final-report", "/evidence-matrix","/graph","/run-status","/targets","/phases","/timeline"]) assert.equal((await f.request(suffix)).status, 409);
  assert.equal((await fetch(f.serverUrl+"/api/v1/goals",{headers:{authorization:"Bearer synthetic-operator"}})).status,409);
});
for (const kind of ["Goal", "Lifecycle"]) test(`${kind} unresolved write prevents old views from reporting success`, async t => {
  const f = await fixture(t); await f.complete(); const file = kind === "Goal" ? f.goalFile : f.runFile;
  fs.writeFileSync(file + ".lock", "synthetic retained write");
  for (const suffix of ["", "/snapshot", "/evidence-matrix", "/final-report","/graph","/run-status"]) {
    const r = await f.request(suffix); assert.equal(r.status, 409); assert.equal(r.body.error, "SEMANTIC_EXECUTION_RECONCILIATION_REQUIRED");
  }
  assert(fs.existsSync(file + ".lock")); assert.equal(f.calls(), 1);
  assert.equal((await f.request("/snapshot", "synthetic-foreign")).status, 403);
});
test("old semantic views retain current account and tenant checks without inheriting caller authority", async t => {
  const f = await fixture(t); await f.complete();
  for (const token of ["synthetic-viewer", "synthetic-foreign"]) for (const suffix of ["", "/snapshot", "/evidence-matrix", "/final-report","/graph","/run-status","/targets","/phases","/timeline"])
    assert.equal((await f.request(suffix, token)).status, 403);
  assert.equal((await fetch(f.serverUrl+"/api/v1/goals",{headers:{authorization:"Bearer synthetic-viewer"}})).status,403);
  const foreign=await fetch(f.serverUrl+"/api/v1/goals",{headers:{authorization:"Bearer synthetic-foreign"}});
  assert.equal(foreign.status,200);assert.deepEqual((await foreign.json()).data,[]);
  f.runtimeStore.writeUser({id: f.access.currentAccess().principal.id, username: f.access.currentAccess().principal.id, passwordHash: "synthetic", role: "operator",
    ...f.scope, status: "SUSPENDED", platformAdmin: false, mustChangePassword: false});
  assert.equal((await f.request("/snapshot")).status, 403);
});
test("readback verifies current definitions and historical evidence instead of trusting a cached report", async t => {
  const f = await fixture(t); await f.complete(); const report = await f.request("/final-report"); assert.equal(report.status, 200);
  f.mutateRun(run => {run.status = "RUNNING";});
  for (const suffix of ["", "/snapshot", "/evidence-matrix", "/final-report"]) assert.equal((await f.request(suffix)).status, 409);
  assert.equal(f.calls(), 1);
});
test("forged phase GO and raw DONE cannot make legacy evidence packages pass", async t => {
  const f = await fixture(t); const goal = f.raw(), target = goal.plan.targets[0];
  target.phase = "ga"; target.status = "DONE";
  goal.plan.phaseTargets = [{schema: "evopilot-phase-target/v1", id: "synthetic-ga", goalId: goal.id, phase: "ga", title: "Synthetic GA",
    status: "PASSED", goalTargetIds: [target.id], acceptanceCriteria: [], requiredEvidence: [], reviewCapabilities: [], packageOutputs: [],
    decision: {status: "GO", rationale: "forged", evidence: []}, createdAt: goal.createdAt, updatedAt: goal.updatedAt}];
  assert.equal(buildTargetEvidencePackage(goal, target).status, "NO-GO");
  const phase = buildPhasePackages(goal)[0]; assert.equal(phase.status, "BLOCKED"); assert.equal(phase.decision.status, "NO-GO");
  assert.equal(phase.targetSummary.done, 0);
  assert.throws(() => buildGoalCompletionReport({goal}, "synthetic"), /GOAL_SEMANTIC_COMPLETION_REQUIRED/);
  assert(phase.blockers.includes("GOAL_SEMANTIC_PACKAGE_VERIFICATION_REQUIRED"));
  const legacy = structuredClone(goal); delete legacy.semanticExecutionOwners;
  assert.equal(buildTargetEvidencePackage(legacy, legacy.plan.targets[0]).status, "GO");
  assert.equal(buildPhasePackages(legacy)[0].status, "PASSED");
});
test("legacy evidence package cannot substitute an unrelated successful Loop for semantic completion", async t => {
  const f = await fixture(t), goal = f.raw(), target = goal.plan.targets[0];
  // Existing Loop owner creates a complete structural fixture; not a real run.
  const loop = f.runtimeStore.createLoop({projectId: goal.projectId, objective: "synthetic"});
  loop.status = "SUCCEEDED"; loop.sourceClosure.requiredGates = []; loop.sourceClosure.gateEvidence = {};
  const packet = buildTargetEvidencePackage(goal, target, loop);
  assert.notEqual(packet.status, "GO"); assert(packet.blockers.includes("GOAL_SEMANTIC_PACKAGE_VERIFICATION_REQUIRED"));
});
test("semantic read views reject query overrides, cancellation and changed scoped identity", async t => {
  const f = await fixture(t); await f.complete();
  assert.equal((await f.request("/snapshot?approved=true")).status, 400);
  assert.equal((await f.request("/graph?approved=true")).status,400);
  assert.equal((await fetch(f.serverUrl+"/api/v1/goals?approved=true",{headers:{authorization:"Bearer synthetic-operator"}})).status,400);
  const controller = new AbortController(); controller.abort();
  assert.throws(() => f.app.goalViews(f.identity.goalId, {currentAccess: () => f.access.currentAccess(), signal: controller.signal}), {code: "CANCELLED"});
  let reads = 0;
  assert.throws(() => f.app.goalViews(f.identity.goalId, {currentAccess: () => {
    const value = f.access.currentAccess(); return ++reads > 2 ? {...value, principal: {...value.principal, role: "viewer"}} : value;
  }}), {code: "PERMISSION_DENIED"}); assert.equal(f.calls(), 1);
});
