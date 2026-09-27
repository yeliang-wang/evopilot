import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {execFile} from "node:child_process";
import {semanticTerminalFixture} from "../helpers/semantic-terminal-fixture.mjs";
import {semanticPhaseDefinition, semanticTargetDefinition} from "../../packages/server/dist/application/semantic-runtime-sources.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";
import {createServer} from "../../packages/server/dist/index.js";

// Synthetic collector/process labels only: no real qualification or acceptance.
const goalPath = f => path.join(f.configuration.dataRoot, "goals", f.identity.goalId + ".json");
const goal = f => JSON.parse(fs.readFileSync(goalPath(f)));
const snapshot = f => Object.fromEntries(fs.readdirSync(f.configuration.dataRoot, {recursive: true}).filter(n => n.endsWith(".json"))
  .map(n => [n, fs.readFileSync(path.join(f.configuration.dataRoot, n), "utf8")]));
async function fixture(t, options = {}) {
  return semanticTerminalFixture(t, {additionalStage: true, goalCompletionPolicy: {phaseTargetCompletion: "VERIFIED_TARGET_EVIDENCE_PACKAGE", ...options.policy},
    configureOutcomePlan: plan => {
      // Deliberately permissive synthetic Harness observation. Typed package
      // obligations must still be enforced by the dedicated completion owner.
      const rule = plan.harness.find(r => r.obligation.kind === "evidence" && r.obligation.value === "target-evidence-package");
      rule.path = ["package", "schema"];
      rule.predicate = {op: "EQUALS", value: "evopilot-semantic-target-evidence-package/v1"};
    },
    beforeSource: g => {
      const target = g.plan.targets[0]; target.phase = "alpha"; target.requiredEvidence = ["domain-checks"]; target.reviewCapabilities = ["testing"];
      g.plan.phaseTargets = [{schema: "evopilot-phase-target/v1", id: "phase-alpha", goalId: g.id, phase: "alpha", title: "Synthetic alpha",
        status: "PENDING", goalTargetIds: [target.id], acceptanceCriteria: ["Phase aggregate remains separate"], requiredEvidence: ["phase-package"],
        reviewCapabilities: [], packageOutputs: ["phase-package"], decision: {status: "PENDING", rationale: "Pending", evidence: []},
        createdAt: g.createdAt, updatedAt: g.updatedAt}];
      options.beforeSource?.(g);
    },
    transformObservation: (observation, request, f) => {
      const g = goal(f), target = g.plan.targets[0], phase = g.plan.phaseTargets[0];
      const facts = {schema: "evopilot-semantic-target-evidence-package/v1", scope: request.scope, phase: target.phase,
        targetDefinitionDigest: d(semanticTargetDefinition(target)), phaseDefinitionDigest: d(semanticPhaseDefinition(phase)),
        criteria: f.source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: ["units"]})).sort((a,b) => a.criterionDigest.localeCompare(b.criterionDigest)),
        evidence: [{kind: "domain-checks", sourceDigests: observation.observations.find(o => o.kind === "domain-checks").sourceDigests}],
        reviews: [{capability: "testing", status: "PASSED", evidenceKinds: ["domain-checks"]}]};
      options.facts?.(facts);
      observation.observations.find(o => o.kind === "target-evidence-package").facts = {
        package: options.placeholder ? {schema: facts.schema, present: true} : facts};
      return observation;
    }});
}
test("typed phase Target package completes atomically, survives restart and leaves phase/GA blocked", async t => {
  const f = await fixture(t), before = snapshot(f), receipt = await f.app.completeTarget(f.value, f.access), after = snapshot(f), g = goal(f);
  assert.equal(receipt.targetPackage.status, "VERIFIED_TARGET_PACKAGE_NOT_PHASE_CLOSURE");
  assert.equal(receipt.targetPackage.phaseClosureVerified, false); assert.equal(receipt.targetPackage.releaseAuthorized, false);
  assert.equal(g.plan.targets[0].status, "DONE"); assert.equal(g.status, "RUNNING");
  assert.equal(g.plan.phaseTargets[0].status, "PENDING"); assert.equal(g.plan.phaseTargets[0].decision.status, "PENDING");
  assert.equal(g.finalReport, undefined); assert.equal(g.releaseDecision, undefined);
  assert.deepEqual(Object.keys(after).filter(k => before[k] !== after[k]), ["goals/" + g.id + ".json"]);
  assert.deepEqual(f.restart().completionReceipt(f.value, f.access), receipt);
  f.time.set(f.time.get() + 300000);
  assert.deepEqual(await f.restart().completeTarget(f.value, f.access), receipt); assert.deepEqual(snapshot(f), after); assert.equal(f.calls(), 2);
  const view = f.app.goalViews(g.id, {currentAccess: () => f.access.currentAccess()});
  assert.equal(view.snapshot.progress.percent, 100); assert.equal(view.snapshot.status, "BLOCKED");
  assert.equal(view.snapshot.phases[0].decision.status, "NO-GO"); assert.equal(view.finalReport, undefined);
});
for (const [name, options] of [
  ["presence placeholder", {placeholder: true}],
  ["foreign scope", {facts: p => {p.scope = {...p.scope, workspaceId: "foreign"};}}],
  ["wrong phase", {facts: p => {p.phase = "ga";}}],
  ["wrong definition", {facts: p => {p.phaseDefinitionDigest = d("other");}}],
  ["missing criterion", {facts: p => {p.criteria = [];}}],
  ["unreviewed rule", {facts: p => {p.criteria[0].ruleIds = ["other"];}}],
  ["missing evidence", {facts: p => {p.evidence = [];}}],
  ["unrelated evidence digest", {facts: p => {p.evidence[0].sourceDigests = [d("other")];}}],
  ["missing review", {facts: p => {p.reviews = [];}}],
  ["failed review", {facts: p => {p.reviews[0].status = "FAILED";}}],
  ["review without source", {facts: p => {p.reviews[0].evidenceKinds = [];}}],
  ["extra authority claim", {facts: p => {p.releaseAuthorized = true;}}],
  ["policy does not permit phase Target", {policy: {phaseTargetCompletion: "DISABLED"}}],
  ["raw predecessor GO", {beforeSource: g => {g.plan.phaseTargets[0].dependencyPhase = "beta"; g.plan.phaseTargets[0].decision.status = "GO";}}],
  ["duplicate membership", {beforeSource: g => {g.plan.phaseTargets.push({...g.plan.phaseTargets[0], id: "other", phase: "beta"});}}],
  ["raw DONE dependency", {beforeSource: g => {g.plan.targets[0].dependencyIds = ["other"]; g.plan.targets.push({...g.plan.targets[0], id: "other", dependencyIds: [], status: "DONE"}); g.plan.phaseTargets[0].goalTargetIds.push("other");}}]
]) test(`phase Target refuses ${name} without writes or replay`, async t => {
  if (name === "raw predecessor GO") {await assert.rejects(fixture(t, options)); return;}
  const f = await fixture(t, options), before = snapshot(f);
  await assert.rejects(f.app.completeTarget(f.value, f.access)); assert.deepEqual(snapshot(f), before); assert.equal(f.calls(), 2);
});
test("post-execution phase obligations drift is refused, while phase progress cannot rewrite meaning", async t => {
  const f = await fixture(t), original = goal(f), changed = structuredClone(original);
  changed.plan.phaseTargets[0].requiredEvidence.push("new-requirement"); fs.writeFileSync(goalPath(f), JSON.stringify(changed));
  const before = snapshot(f); await assert.rejects(f.app.completeTarget(f.value, f.access), {code: "DRIFT"}); assert.deepEqual(snapshot(f), before);
  original.plan.phaseTargets[0].status = "PASSED"; original.plan.phaseTargets[0].decision.status = "GO";
  fs.writeFileSync(goalPath(f), JSON.stringify(original));
  const receipt = await f.app.completeTarget(f.value, f.access); assert.equal(receipt.resultingGoalStatus, "RUNNING");
  assert.equal(f.app.goalViews(original.id, {currentAccess: () => f.access.currentAccess()}).snapshot.phases[0].decision.status, "NO-GO");
});
test("receipt refuses typed collection tampering after Target completion", async t => {
  const f = await fixture(t); await f.app.completeTarget(f.value, f.access);
  const last = f.stages.at(-1), file = f.file("collections", {scope: f.scope, runId: f.value.runId, sourceRequestDigest: last.pending.requestDigest});
  const record = JSON.parse(fs.readFileSync(file)); record.value.observation.observations.find(o => o.kind === "target-evidence-package").facts.package.reviews = [];
  fs.writeFileSync(file, JSON.stringify(record)); const before = snapshot(f);
  assert.throws(() => f.restart().completionReceipt(f.value, f.access)); assert.deepEqual(snapshot(f), before);
});
test("HTTP and actual CLI expose a verified phase Target receipt without final phase/GA report", async t => {
  const f = await fixture(t);
  const server = createServer({dataRoot: f.configuration.dataRoot, runtimeMode: "debug", llmClient: {}, allowSampleData: false,
    autoRegisterProfileProject: false, harnessRegistryConfig: f.configuration.registryConfigPath, semanticCatalogPolicyPath: f.configuration.policyPath,
    tokens: [{name: f.access.currentAccess().principal.id, token: "synthetic-operator", role: "operator", ...f.scope},
      {name: "viewer", token: "synthetic-viewer", role: "viewer", ...f.scope}]});
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = (op, body = f.value, token = "synthetic-operator") => fetch(url + `/api/v1/projects/${f.scope.projectId}/semantic-execution/` + op,
    {method: op === "capabilities" ? "GET" : "POST", headers: {authorization: "Bearer " + token, "content-type": "application/json"},
      ...(op === "capabilities" ? {} : {body: JSON.stringify(body)})});
  const caps = (await (await call("capabilities")).json()).data;
  assert.equal(caps.phaseTargetCompletionAvailable, true); assert.equal(caps.phaseCompletionAvailable, true); assert.equal(caps.releaseAvailable, false);
  assert.equal((await call("completeTarget", f.value, "synthetic-viewer")).status, 403);
  assert.equal((await call("completeTarget", {...f.value, targetPackage: {status: "PASSED"}})).status, 400);
  const response = await call("completeTarget"), body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.data.targetPackage.phaseClosureVerified, false); assert.equal(body.data.resultingGoalStatus, "RUNNING");
  const report = (await (await call("completionStatus")).json()).data;
  assert.equal(report.progress.targetPercent, 100); assert.equal(report.progress.goalCompleted, false); assert.equal(report.release.authorized, false);
  const final = await fetch(url + `/api/v1/goals/${f.identity.goalId}/final-report`, {headers: {authorization: "Bearer synthetic-operator"}});
  assert.equal(final.status, 409);
  const inputFile = path.join(f.root, "phase-receipt-input.json"); fs.writeFileSync(inputFile, JSON.stringify(f.value));
  const cli = await new Promise(resolve => execFile(process.execPath, [path.resolve("packages/cli/dist/index.js"), "project", "execution", "completionReceipt",
    f.scope.projectId, "--file", inputFile, "--server", url, "--config", path.join(f.root, "unused-config.json"), "--json"],
  {timeout: 30000, env: {PATH: process.env.PATH, EVOPILOT_API_TOKEN: "synthetic-operator", EVOPILOT_LOG_LEVEL: "error"}},
  (error, stdout, stderr) => resolve({code: error?.code ?? 0, stdout, stderr})));
  assert.equal(cli.code, 0, cli.stderr);
  const {requestId, ...cliReceipt} = JSON.parse(cli.stdout);
  assert.equal(typeof requestId, "string"); assert(requestId.length > 0);
  assert.deepEqual(cliReceipt, body.data); assert.equal(f.calls(), 2);
});
