import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import {execFile} from "node:child_process";
import {Client} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";
import {stageCompletionFixture} from "../helpers/semantic-stage-fixture.mjs";
import {executionProbeFrame} from "../helpers/semantic-execution-probe-frame.mjs";
import {createServer} from "../../packages/server/dist/index.js";
import {planExpertTurn, executeExpertTurn, explainExpertSemanticExecutionResult} from "../../packages/evolution-expert/dist/index.js";
import {assertRuntimeExecutionEvidence, runReviewedExecutionJourney} from "../e2e/versions/runtime/6.3.0/execution-journey.mjs";
import {probeDigest} from "../e2e/versions/probe-session.mjs";
import {assertExpertExecutionPresentation} from "../e2e/versions/expert/2.3.0/execution-assertions.mjs";
import {executionCliResult} from "../e2e/versions/run-installed-execution.mjs";
import {assertRecoveryReadback,runCompletionRecovery} from "../e2e/versions/runtime/6.3.0/recovery-journey.mjs";
import {assertExpertRecoveryPresentation} from "../e2e/versions/expert/2.3.0/recovery-assertions.mjs";

// Source-level local tests only. All process, collector and Host provenance is
// synthetic fixture data, even when policy branches use independent labels.
const repo = path.resolve(import.meta.dirname, "../..");
async function listen(t, server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(t, options = {}) {
  const f = await stageCompletionFixture(t, {application: true, goalCompletionPolicy: true, ...options,
    beforeSource: g => {delete g.terminalMaturity; g.plan.phaseTargets = []; options.beforeSource?.(g);}});
  const serverOptions = {dataRoot: f.configuration.dataRoot, runtimeMode: "debug", llmClient: {}, allowSampleData: false,
    autoRegisterProfileProject: false, harnessRegistryConfig: f.configuration.registryConfigPath,
    semanticCatalogPolicyPath: f.configuration.policyPath, semanticExecutorAdapter: f.adapter,
    semanticEvidenceCollector: {...f.collector, collect: async request => ({...await f.collector.collect(request), observedAt: new Date().toISOString()})},
    tokens: [{name: f.access.principal.id, token: "synthetic-operator", role: "operator", ...f.scope},
      {name: "viewer", token: "synthetic-viewer", role: "viewer", ...f.scope},
      {name: "foreign", token: "synthetic-foreign", role: "operator", tenantId: "other", workspaceId: "other"}]};
  const serverUrl = await listen(t, createServer(serverOptions)), basePath = `/api/v1/projects/${f.scope.projectId}/semantic-execution/`;
  const request = async (operation, value, token = "synthetic-operator", url = serverUrl) => {
    const r = await fetch(url + basePath + operation, {method: operation === "capabilities" ? "GET" : "POST",
      headers: {authorization: "Bearer " + token, "content-type": "application/json"}, ...(value ? {body: JSON.stringify(value)} : {})});
    return {status: r.status, body: await r.json()};
  };
  const ok = async (operation, value) => {const r = await request(operation, value); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.data;};
  const value = {identity: f.identity, runId: f.run.id};
  const prepare = async () => {
    await ok("prepare", {...value, requestDigest: f.run.pendingExecution.requestDigest, goalTarget: f.state.goalTarget,
      contextPlan: f.state.contextPlan, outcomePlan: f.state.outcomePlan, selections: f.selected});
    const binding = await ok("bind", {identity: f.identity}), input = {identity: f.identity, bindingDigest: binding.bindingDigest};
    const review = await ok("review", {...input, coverage: f.source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: ["units"]}))});
    await ok("approveReview", {...input, decision: "APPROVE", reviewDigest: review.reviewDigest});
    await ok("dispatch", input); await ok("collect", input);
    return input;
  };
  const advance = async () => {
    const r = await fetch(serverUrl + `/api/v1/lifecycle-runs/${f.run.id}/advance`, {method: "POST",
      headers: {authorization: "Bearer synthetic-operator", "content-type": "application/json"}, body: "{}"});
    const body = await r.json(); assert.equal(r.status, 200, JSON.stringify(body));
    assert.equal(f.lifecycleService.read(f.run.id).status, "SUCCEEDED");
  };
  const terminal = async () => {const input = await prepare(); await ok("commitStage", input); await advance(); return input;};
  const goalFile = path.join(f.configuration.dataRoot, "goals", f.identity.goalId + ".json");
  return {...f, serverUrl, basePath, serverOptions, request, ok, value, prepare, advance, terminal, goalFile,
    rawGoal: () => JSON.parse(fs.readFileSync(goalFile, "utf8"))};
}
function cli(f, operation, payload) {
  const file = path.join(f.root, `completion-cli-${operation}.json`); fs.writeFileSync(file, JSON.stringify(payload));
  return new Promise(resolve => execFile(process.execPath, [path.join(repo, "packages/cli/dist/index.js"), "project", "execution", operation,
    f.scope.projectId, "--file", file, "--server", f.serverUrl, "--config", path.join(f.root, "unused-config.json"), "--json"],
  {cwd: repo, timeout: 30000, env: {PATH: process.env.PATH, EVOPILOT_API_TOKEN: "synthetic-operator", EVOPILOT_LOG_LEVEL: "error"}},
  (error, stdout, stderr) => resolve({code: error?.code ?? 0, stderr, data: stdout.trim() ? JSON.parse(stdout) : undefined})));
}
async function mcp(t, f) {
  const transport = new StdioClientTransport({command: process.execPath, args: [path.join(repo, "packages/adapter-mcp/dist/stdio.js")], cwd: repo,
    stderr: "pipe", env: {PATH: process.env.PATH, EVOPILOT_SERVER: f.serverUrl, EVOPILOT_API_TOKEN: "synthetic-operator"}});
  const client = new Client({name: "completion-source-test", version: "1.0.0"}); await client.connect(transport); t.after(() => client.close());
  return (operation, payload) => client.callTool({name: "evopilot_semantic_execution_" + operation, arguments: {projectId: f.scope.projectId, payload}});
}
test("public HTTP stage and Target completion expose verified status, never phase/GA or release readiness", async t => {
  const f = await fixture(t), input = await f.prepare();
  const caps = await f.ok("capabilities"); assert.equal(caps.completionAvailable, true); assert.equal(caps.releaseAvailable, false);
  assert.equal((await f.ok("completionStatus", f.value)).status, "PENDING");
  assert.equal((await f.request("completeTarget", f.value)).status, 409);
  const stage = await f.ok("commitStage", input); await f.advance();
  assert.deepEqual(await f.ok("stageReceipt", {...input, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest}), stage);
  const receipt = await f.ok("completeTarget", f.value); assert.equal(receipt.resultingGoalStatus, "COMPLETED");
  const report = await f.ok("completionStatus", f.value);
  assert.equal(report.status, "COMPLETED"); assert.equal(report.progress.targetPercent, 100); assert.equal(report.progress.goalCompleted, true);
  assert.deepEqual(report.release, {status: "NOT_EVALUATED", authorized: false, published: false});
  assert.equal(report.authority.mayPublish, false); assert(!JSON.stringify(report).includes("units"));
  assert.equal(f.rawGoal().finalReport, undefined); assert.equal(f.rawGoal().releaseDecision, undefined);
  const restarted = await listen(t, createServer(f.serverOptions));
  assert.deepEqual((await f.request("completionReceipt", f.value, "synthetic-operator", restarted)).body.data, receipt);
  assert.equal(f.calls(), 1); assert.equal(f.rawGoal().timeline.length, 1);
  const legacy = await fetch(f.serverUrl + `/api/v1/goals/${f.identity.goalId}/final-report`, {headers: {authorization: "Bearer synthetic-operator"}});
  assert.equal(legacy.status, 200); const legacyReport = (await legacy.json()).data;
  assert.equal(legacyReport.status, "COMPLETED"); assert.equal(legacyReport.releaseDecision, undefined);
  assert.deepEqual(legacyReport.phasePackages, []);
});
test("CLI and MCP negotiate and use exact public completion operations", async t => {
  const f = await fixture(t), input = await f.prepare(), call = await mcp(t, f);
  const stage = await cli(f, "commitStage", input); assert.equal(stage.code, 0, stage.stderr);
  await f.advance();
  assert.equal((await call("stageReceipt", {...input, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest})).isError, false);
  const completion = await call("completeTarget", f.value); assert.equal(completion.isError, false, JSON.stringify(completion));
  const report = await cli(f, "completionStatus", f.value); assert.equal(report.code, 0, report.stderr); assert.equal(report.data.status, "COMPLETED");
  assert.equal((await call("completionReceipt", f.value)).isError, false); assert.equal(f.calls(), 1); assert.equal(f.rawGoal().timeline.length, 1);
});
for (const [name, mutate, expectedPercent] of [["GA", g => {g.terminalMaturity = "ga";}, 100],
  ["another required Target", g => {g.plan.targets.push({...g.plan.targets[0], id: "other-target", status: "READY"});}, 50]])
  test(`verified report retains ${name} blocker despite one completed Target`, async t => {
    const f = await fixture(t, {beforeSource: mutate}); await f.terminal(); await f.ok("completeTarget", f.value);
    const report = await f.ok("completionStatus", f.value); assert.equal(report.status, "PARTIAL"); assert.equal(report.progress.goalCompleted, false);
    assert.equal(report.progress.targetPercent, expectedPercent); assert(report.blockers.length); assert.equal(report.release.published, false);
  });
test("public completion denies foreign/viewer identity, injected facts and missing policy", async t => {
  const f = await fixture(t, {goalCompletionPolicy: false}), input = await f.terminal();
  const values = {commitStage: input, stageReceipt: {...input, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest},
    completeTarget: f.value, completionReceipt: f.value, completionStatus: f.value};
  for (const [op, value] of Object.entries(values)) {
    for (const token of ["synthetic-viewer", "synthetic-foreign"]) assert.equal((await f.request(op, value, token)).status, 403);
    for (const extra of [{approved: true}, {facts: {passed: true}}, {release: true}]) assert.equal((await f.request(op, {...value, ...extra})).status, 400);
  }
  const missing = await f.request("completeTarget", f.value);
  assert.equal(missing.status, 404); assert.equal(missing.body.error, "SEMANTIC_EXECUTION_UNAVAILABLE");
  assert.equal(f.rawGoal().semanticTargetCompletions, undefined); assert.equal(f.calls(), 1);
});
for (const kind of ["Goal", "Lifecycle"]) test(`${kind} retained write claim prevents successful receipt delivery and replay`, async t => {
  const f = await fixture(t), input = await f.terminal(); await f.ok("completeTarget", f.value);
  const lock = (kind === "Goal" ? f.goalFile : f.runFile) + ".lock"; fs.writeFileSync(lock, "synthetic-retained-claim");
  const operations = kind === "Goal" ? [["completionReceipt", f.value], ["completionStatus", f.value], ["completeTarget", f.value]] :
    [["stageReceipt", {...input, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest}]];
  for (const [op, value] of operations) {
    const result = await f.request(op, value); assert.equal(result.status, 409);
    assert.equal(result.body.error, "SEMANTIC_EXECUTION_RECONCILIATION_REQUIRED"); assert.equal(result.body.nextAction, "inspect-retained-write-claim-do-not-replay");
  }
  assert(fs.existsSync(lock)); assert.equal(f.calls(), 1); assert.equal(f.rawGoal().timeline.length, 1);
});
for (const phase of ["started", "succeeded"]) test(`completion audit ${phase} failure does not replay effects`, async t => {
  const f = await fixture(t); await f.terminal();
  const prototype = Object.getPrototypeOf(f.runtimeStore), append = prototype.appendAudit; let enabled = true;
  t.mock.method(prototype, "appendAudit", function(row) {
    if (enabled && row.action === `semantic-execution.completeTarget.${phase}`) throw new Error("PRIVATE_AUDIT_DETAIL");
    return append.call(this, row);
  });
  const result = await f.request("completeTarget", f.value); assert.equal(result.status, 409); assert(!JSON.stringify(result.body).includes("PRIVATE_AUDIT_DETAIL"));
  assert.equal(f.rawGoal().semanticTargetCompletions?.length ?? 0, phase === "started" ? 0 : 1);
  enabled = false;
  if (phase === "started") await f.ok("completeTarget", f.value); else await f.ok("completionReceipt", f.value);
  assert.equal(f.rawGoal().timeline.length, 1); assert.equal(f.calls(), 1);
});
test("lost completion response is recovered with an explicit read after restart, not effect replay", async t => {
  const f = await fixture(t); await f.terminal(); let posts = 0;
  const proxy = await listen(t, http.createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const r = await fetch(f.serverUrl + req.url, {method: req.method, headers: {authorization: "Bearer synthetic-operator", "content-type": "application/json"}, body});
    assert.equal(r.status, 200); await r.text(); posts++; res.destroy();
  }));
  await assert.rejects(fetch(proxy + f.basePath + "completeTarget", {method: "POST", body: JSON.stringify(f.value)}));
  assert.equal(posts, 1); const before = fs.readFileSync(f.goalFile, "utf8"), restarted = await listen(t, createServer(f.serverOptions));
  assert.equal((await f.request("completionReceipt", f.value, "synthetic-operator", restarted)).status, 200);
  assert.equal(fs.readFileSync(f.goalFile, "utf8"), before); assert.equal(f.calls(), 1);
});
for(const mode of ['complete','remaining-target','phase-blocker'])test(`RC05 read-only recovery through restarted HTTP, CLI and independent Expert: ${mode}`,async t=>{
  const f=await fixture(t,{beforeSource:g=>{
    if(mode==='remaining-target')g.plan.targets.push({...g.plan.targets[0],id:'remaining-target',status:'READY'});
    if(mode==='phase-blocker')g.terminalMaturity='ga';
  }});
  const frame={scope:f.scope,identity:f.identity,runId:f.run.id,completedBy:f.access.principal.id,
    targets:f.rawGoal().plan.targets.map(({id,required})=>({targetId:id,required}))};
  await f.terminal();let completionPosts=0;
  const proxy=await listen(t,http.createServer(async(req,res)=>{
    assert.equal(req.url,f.basePath+'completeTarget');assert.equal(req.method,'POST');
    let body='';for await(const chunk of req)body+=chunk;
    const r=await fetch(f.serverUrl+req.url,{method:'POST',headers:{authorization:'Bearer synthetic-operator','content-type':'application/json'},body});
    assert.equal(r.status,200);await r.text();completionPosts++;res.destroy();
  }));
  await assert.rejects(fetch(proxy+f.basePath+'completeTarget',{method:'POST',body:JSON.stringify(f.value)}));
  const beforeGoal=fs.readFileSync(f.goalFile,'utf8'),beforeRun=fs.readFileSync(f.runFile,'utf8');
  const restarted=await listen(t,createServer(f.serverOptions)),call=await mcp(t,{...f,serverUrl:restarted}),seen=[],observed={};
  const invoke=async(operation,payload)=>{
    assert.ok(['completionReceipt','completionStatus'].includes(operation));
    const transport={invoke:async(tool,args)=>{
      const op=tool.slice('evopilot_semantic_execution_'.length);assert.ok(['capabilities',operation].includes(op));seen.push(op);
      const result=await call(op,args.payload);observed[op]=structuredClone(result);return result;
    }};
    const result=await executeExpertTurn(planExpertTurn('semantic execution '+operation,{projectId:f.scope.projectId,payload}),transport);
    assert.deepEqual(result,observed[operation]);
    const explanation=explainExpertSemanticExecutionResult(operation,result);
    assert.equal(assertExpertRecoveryPresentation({operation,response:observed[operation],explanation}).status,'RECOVERY_PRESENTATION_ASSERTIONS_PASSED');
    return {requestId:result.structuredContent.requestId,data:result.structuredContent.response.data};
  };
  const result=await runCompletionRecovery({frame,invoke,authorize:async input=>{input.payload.identity.projectId='forged';return true;}});
  assert.equal(result.status,'READ_ONLY_RECOVERY_ASSERTIONS_PASSED');assert.equal(result.observedGoalStatus,mode==='complete'?'COMPLETED':'PARTIAL');
  assert.equal(result.mutationsIssued,0);assert.equal(result.targetCriteriaClosed,0);assert.equal(result.releaseAuthorized,false);
  assert.deepEqual(seen,['capabilities','completionReceipt','capabilities','completionStatus']);
  const cliReads=[];await runCompletionRecovery({frame,authorize:async()=>true,invoke:async(operation,payload)=>{
    cliReads.push(operation);const r=await cli({...f,serverUrl:restarted},operation,payload);assert.equal(r.code,0,r.stderr);
    const {requestId,...data}=r.data;return {requestId,data};
  }});assert.deepEqual(cliReads,['completionReceipt','completionStatus']);
  assert.equal(completionPosts,1);assert.equal(f.calls(),1);assert.equal(fs.readFileSync(f.goalFile,'utf8'),beforeGoal);assert.equal(fs.readFileSync(f.runFile,'utf8'),beforeRun);
  assert.equal(f.rawGoal().finalReport,undefined);assert.equal(f.rawGoal().releaseDecision,undefined);
  if(mode!=='complete')return;
  const receipt=observed.completionReceipt.structuredContent.response.data,report=observed.completionStatus.structuredContent.response.data;
  for(const [name,forge]of Object.entries({
    scope:(r,p)=>{r.scope.tenantId='foreign';},identity:(r,p)=>{r.identity.targetId='foreign';},run:(r,p)=>{r.runId='foreign';},
    principal:(r,p)=>{r.completedBy='foreign';},evidence:(r,p)=>{r.evidence.runId='foreign';r.evidence.evidenceDigest=probeDigest(Object.fromEntries(Object.entries(r.evidence).filter(([k])=>k!=='evidenceDigest')));},
    receiptLink:(r,p)=>{p.targets[0].receiptDigest=probeDigest('forged');},progress:(r,p)=>{p.progress.targetPercent=50;},
    authority:(r,p)=>{p.authority.mayDispatch=true;},release:(r,p)=>{p.release.authorized=true;},targets:(r,p)=>{p.targets.push({...p.targets[0],targetId:'unknown'});}
  }))await t.test('RC05 rejects rehashed '+name,()=>{
    const r=structuredClone(receipt),p=structuredClone(report);forge(r,p);
    r.receiptDigest=probeDigest(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='receiptDigest')));
    p.reportDigest=probeDigest(Object.fromEntries(Object.entries(p).filter(([k])=>k!=='reportDigest')));
    assert.throws(()=>assertRecoveryReadback(frame,r,p));
  });
  for(const operation of ['completionReceipt','completionStatus'])await t.test('Expert rejects substituted '+operation,()=>{
    const response=observed[operation],s=explainExpertSemanticExecutionResult(operation,response);
    for(const field of ['canExecute','canComplete','releaseAuthorized','published'])assert.throws(()=>assertExpertRecoveryPresentation({operation,response,explanation:{...s,[field]:true}}));
    assert.throws(()=>assertExpertRecoveryPresentation({operation,response,explanation:{...s,requestId:'foreign'}}));
    assert.throws(()=>assertExpertRecoveryPresentation({operation,response,explanation:{...s,goalCompleted:!s.goalCompleted}}));
  });
  for(const mode of ['denied','cancelled','auth-timeout','read-timeout'])await t.test('RC05 stops '+mode,async()=>{
    let calls=0;const controller=new AbortController();if(mode==='cancelled')controller.abort();
    await assert.rejects(runCompletionRecovery({frame,signal:controller.signal,timeoutMs:40,
      authorize:async()=>mode==='auth-timeout'?new Promise(()=>{}):mode!=='denied',
      invoke:async()=>{calls++;return new Promise(()=>{});}}));assert.equal(calls,mode==='read-timeout'?1:0);
  });
  for(const token of ['synthetic-viewer','synthetic-foreign'])await t.test('current read permission denied without retry: '+token,async()=>{
    const calls=[];await assert.rejects(runCompletionRecovery({frame,authorize:async()=>true,invoke:async(operation,payload)=>{
      calls.push(operation);const r=await f.request(operation,payload,token,restarted);assert.equal(r.status,403);throw Error('READ_DENIED');
    }}),/READ_DENIED/);assert.deepEqual(calls,['completionReceipt']);
  });
  await t.test('historical evidence drift stops recovery without replay',async()=>{
    const run=JSON.parse(beforeRun);run.status='RUNNING';fs.writeFileSync(f.runFile,JSON.stringify(run));
    const calls=[];await assert.rejects(runCompletionRecovery({frame,authorize:async()=>true,invoke:async(operation,payload)=>{
      calls.push(operation);const r=await f.request(operation,payload,'synthetic-operator',restarted);assert.equal(r.status,409);throw Error('HISTORICAL_DRIFT');
    }}),/HISTORICAL_DRIFT/);assert.deepEqual(calls,['completionReceipt']);assert.equal(f.calls(),1);assert.equal(completionPosts,1);
  });
});
test("raw completed flags and historical evidence drift cannot become trusted public reports", async t => {
  const f = await fixture(t); await f.terminal();
  f.changeGoal(g => {g.status = "COMPLETED"; g.plan.targets[0].status = "DONE";});
  assert.equal((await f.request("completionStatus", f.value)).status, 409);
  const g = await fixture(t); await g.terminal(); await g.ok("completeTarget", g.value);
  const run = JSON.parse(fs.readFileSync(g.runFile)); run.status = "RUNNING"; fs.writeFileSync(g.runFile, JSON.stringify(run));
  assert.equal((await g.request("completionStatus", g.value)).status, 409); assert.equal(g.calls(), 1);
});

for (const failure of [undefined, "businessFail", "harnessFail"]) test(`Expert over actual MCP preserves dual validation and guarded completion: ${failure ?? "success"}`, async t => {
  const f = await fixture(t, failure ? {[failure]: true} : {}), call = await mcp(t, f), invoked = [], observedReplies = new Map();
  const transport = {invoke: async (tool, args) => {
    assert(tool.startsWith("evopilot_semantic_execution_")); invoked.push(tool);
    const operation = tool.slice("evopilot_semantic_execution_".length), response = await call(operation, args.payload);
    observedReplies.set(operation, structuredClone(response)); return response;
  }};
  const run = async (operation, payload, decision) => {
    const result = await executeExpertTurn(planExpertTurn("semantic execution " + operation,
      {projectId: f.scope.projectId, ...(payload ? {payload} : {})}), transport, decision);
    const summary = explainExpertSemanticExecutionResult(operation, result);
    assert.notEqual(summary.status, "BLOCKED", JSON.stringify(result));
    assert.equal(summary.releaseAuthorized, false); assert.equal(summary.published, false);
    if (["resolve", "review", "approveReview", "dispatch", "collect", "evaluate"].includes(operation))
      assert.equal(assertExpertExecutionPresentation({operation, response: observedReplies.get(operation), explanation: summary}).status, "PRESENTATION_ASSERTIONS_PASSED");
    assert.deepEqual(result, observedReplies.get(operation), "Expert cannot substitute the observed MCP reply");
    return {data: result.structuredContent.response.data, summary, requestId: result.structuredContent.requestId, response: observedReplies.get(operation)};
  };
  await run("capabilities");
  await run("prepare", {...f.value, requestDigest: f.run.pendingExecution.requestDigest, goalTarget: f.state.goalTarget,
    contextPlan: f.state.contextPlan, outcomePlan: f.state.outcomePlan, selections: f.selected});
  await run("inspect", {identity: f.identity});
  const {data: binding} = await run("bind", {identity: f.identity});
  const input = {identity: f.identity, bindingDigest: binding.bindingDigest};
  const {data: slice} = await run("resolve", input);
  const {data: mapping, summary: guidance} = await run("mapping", input);
  assert.equal(guidance.status, "COVERAGE_INPUT_REQUIRED"); assert.equal(f.calls(), 0);
  assert.deepEqual(mapping.criteria, f.source.acceptanceCriteria); assert(mapping.coverageInputs.every(c => c.ruleIds.length === 0));
  const cliMapping = await cli(f, "mapping", input);
  assert.equal(cliMapping.code, 0, cliMapping.stderr); assert.equal(cliMapping.data.mappingDigest, mapping.mappingDigest);
  const {data: review, summary: preview} = await run("review", {...input,
    coverage: f.source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: ["units"]}))});
  assert.equal(preview.status, "WAITING_EXACT_HUMAN_DECISION"); assert.equal(f.calls(), 0);
  // Expectations come from the synthetic scenario and actual fixture closure,
  // not from the returned evaluator statuses. This is not real Host evidence.
  const frame = executionProbeFrame(f, binding, slice, review, failure);
  const replies = {}, authorized = [];
  const journey = await runReviewedExecutionJourney({frame, decision: {decision: "APPROVE", reviewDigest: review.reviewDigest, principalId: f.access.principal.id},
    authorize: async request => {authorized.push(request.operation); return true;}, // Local synthetic-test authority only.
    invoke: async (operation, payload) => {
      if (operation === "dispatch") assert.equal(f.calls(), 0);
      const reply = await run(operation, payload, operation === "approveReview" ?
        {authorizationDigest: review.reviewDigest, evidenceRef: "decision://synthetic-outcome-human"} : undefined);
      replies[operation] = reply; return {data: reply.data, requestId: reply.requestId};
    }});
  const packet = {frame, decision: replies.approveReview?.data, dispatch: replies.dispatch?.data, collection: replies.collect?.data, outcome: replies.evaluate?.data};
  assertRuntimeExecutionEvidence(packet);
  assert.equal(journey.status, "EXECUTION_SUBJOURNEY_ASSERTIONS_PASSED"); assert.equal(journey.targetCriteriaClosed, 0);
  assert.equal(journey.realHost, "NOT_QUALIFIED"); assert.equal(journey.releaseAuthorized, false);
  assert.deepEqual(authorized, ["resolve", "review", "approveReview", "dispatch", "collect", "evaluate"]);
  assert.equal(f.calls(), 1);
  const evaluated = replies.evaluate.summary;
  assert.equal(evaluated.status, failure ? "FAILED" : "DUAL_VALIDATED_NOT_COMPLETED"); assert.equal(evaluated.goalCompleted, false);
  assert.equal(evaluated.business.status, failure === "businessFail" ? "FAILED" : "PASSED");
  assert.equal(evaluated.harness.status, failure === "harnessFail" ? "FAILED" : "PASSED");
  if (!failure) {
    // Rehashed forgeries must still fail cross-record correlations. These are
    // local oracle/transport controls, not additional product/Host executions.
    const other = probeDigest("unrelated-record");
    const forgeries = {
      scope: p => {p.outcome.scope.goalId = "other-goal";},
      executionBinding: p => {p.outcome.executionBindingDigest = other;},
      sourceRequest: p => {p.outcome.sourceRequestDigest = other;},
      agentRequest: p => {p.outcome.requestDigest = other;},
      slice: p => {p.outcome.sliceDigest = other;},
      review: p => {p.outcome.outcomeReviewDigest = other;},
      decision: p => {p.outcome.outcomeDecisionDigest = other;},
      plan: p => {p.outcome.outcomePlanDigest = other;},
      evaluator: p => {p.outcome.evaluatorDigest = other;},
      obligations: p => {p.outcome.obligationDigest = other;},
      result: p => {p.outcome.resultDigest = other;},
      collection: p => {p.outcome.collection.receiptDigest = other;},
      collectorTrust: p => {p.outcome.collectorTrust = "REAL_HOST_VERIFIED";},
      processObservation: p => {p.outcome.processEvidence.observationDigest = other;},
      businessShortcut: p => {p.outcome.business.checks = [];},
      harnessShortcut: p => {p.outcome.harness.checks = [];},
      completionEscalation: p => {p.outcome.eligibleForCompletion = true;},
      releaseEscalation: p => {p.outcome.authority.mayPublish = true;},
      agentBindingConfusion: p => {p.dispatch.result.bindingDigest = p.frame.identity.harnessBindingDigest;},
      replayKey: p => {p.dispatch.result.idempotencyKey = "other";}
    };
    for (const [name, forge] of Object.entries(forgeries)) await t.test("RC04 rejects " + name, () => {
      const copy = structuredClone(packet); forge(copy);
      const {outcomeDigest, ...body} = copy.outcome; copy.outcome.outcomeDigest = probeDigest(body);
      assert.throws(() => assertRuntimeExecutionEvidence(copy));
    });
    const exactDecision = {decision: "APPROVE", reviewDigest: review.reviewDigest, principalId: f.access.principal.id};
    const toy = async overrides => {
      const calls = [], params = {frame, decision: exactDecision, authorize: async () => true,
        invoke: async operation => {calls.push(operation); const r = replies[operation]; return structuredClone({data: r.data, requestId: r.requestId});}, ...overrides};
      return {report: await runReviewedExecutionJourney(params), calls};
    };
    await t.test("RC04 exact decision required before any transport", async () => {
      let calls = 0;
      await assert.rejects(toy({decision: {...exactDecision, reviewDigest: other}, invoke: async () => {calls++;}}), /RC04_EXACT_DECISION_REQUIRED/);
      assert.equal(calls, 0);
    });
    await t.test("RC04 missing campaign authorization cannot invoke resolve", async () => {
      let calls = 0;
      await assert.rejects(toy({authorize: async () => false, invoke: async () => {calls++;}}), /RC04_CAMPAIGN_AUTHORITY_REQUIRED/);
      assert.equal(calls, 0);
    });
    await t.test("RC04 cancellation before start has no invocation", async () => {
      const c = new AbortController(); c.abort(); let calls = 0;
      await assert.rejects(toy({signal: c.signal, invoke: async () => {calls++;}}), /RC04_CANCELLED/); assert.equal(calls, 0);
    });
    await t.test("RC04 authorization hang is bounded and cannot dispatch", async () => {
      let calls = 0;
      await assert.rejects(toy({timeoutMs: 20, authorize: () => new Promise(() => {}), invoke: async () => {calls++;}}), /RC04_TIMEOUT/);
      assert.equal(calls, 0);
    });
    for (const mode of ["lost-response", "hang", "invalid-receipt"]) await t.test("RC04 no dispatch replay after " + mode, async () => {
      const calls = [];
      const {report} = await toy({timeoutMs: 100, invoke: async operation => {
        calls.push(operation);
        if (operation === "dispatch") {
          if (mode === "lost-response") throw new Error("connection lost");
          if (mode === "hang") return new Promise(() => {});
          return {requestId: "synthetic", data: {status: "SUCCEEDED"}};
        }
        const r = replies[operation]; return structuredClone({data: r.data, requestId: r.requestId});
      }});
      assert.equal(report.status, "UNVERIFIED_OUTCOME"); assert.equal(report.lastAttemptedOperation, "dispatch");
      assert.equal(report.nextAction, "external-read-only-reconciliation-no-mutation-replay");
      assert.deepEqual(calls, ["resolve", "review", "approveReview", "dispatch"]); assert.equal(report.targetCriteriaClosed, 0);
    });
    await t.test("RC04 rehashed forged outcome never grants passing journey", async () => {
      const {report} = await toy({invoke: async operation => {
        const r = structuredClone(replies[operation]);
        if (operation === "evaluate") {r.data.authority.mayPublish = true; const {outcomeDigest, ...body} = r.data; r.data.outcomeDigest = probeDigest(body);}
        return {data: r.data, requestId: r.requestId};
      }});
      assert.equal(report.status, "UNVERIFIED_OUTCOME"); assert.equal(report.releaseAuthorized, false);
    });
    for (const field of ["canExecute", "canComplete", "goalCompleted", "releaseAuthorized", "published"]) await t.test("Expert cannot invent " + field, () => {
      assert.throws(() => assertExpertExecutionPresentation({operation: "evaluate", response: replies.evaluate.response,
        explanation: {...replies.evaluate.summary, [field]: true}}));
    });
    await t.test("Expert cannot substitute business-only success or swap request identity", () => {
      for (const patch of [{harness: {status: "PASSED", checks: []}}, {requestId: "unrelated"}, {status: "COMPLETED"}, {collectorTrust: "REAL_HOST_VERIFIED"}])
        assert.throws(() => assertExpertExecutionPresentation({operation: "evaluate", response: replies.evaluate.response,
          explanation: {...replies.evaluate.summary, ...patch}}));
    });
    assert.equal(f.calls(), 1);
  }
  if (failure) {
    const rejected = await executeExpertTurn(planExpertTurn("semantic execution commitStage", {projectId: f.scope.projectId, payload: input}), transport);
    assert.equal(explainExpertSemanticExecutionResult("commitStage", rejected).status, "BLOCKED");
    assert.equal(f.rawGoal().semanticTargetCompletions, undefined); assert.equal(f.calls(), 1); return;
  }
  await run("commitStage", input);
  const stage = {...input, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest};
  await run("stageReceipt", stage);
  // Separate Lifecycle owner advances the now-consumed pending stage. This is
  // fixture orchestration, not an Expert-created successor or Host acceptance.
  await f.advance();
  const {data: completed} = await run("completeTarget", f.value);
  assert.deepEqual((await run("completionReceipt", f.value)).data, completed);
  const {summary: report} = await run("completionStatus", f.value);
  assert.equal(report.goalCompleted, true); assert.equal(report.progress.targetPercent, 100);
  assert.equal(report.release.status, "NOT_EVALUATED"); assert.equal(f.rawGoal().releaseDecision, undefined);
  assert.equal(f.calls(), 1); assert.equal(invoked.filter(tool => tool.endsWith("_dispatch")).length, 1);
});

for (const failure of [undefined, "businessFail", "harnessFail", "lost-response"]) test(`fixed execution tail through actual source CLI: ${failure ?? "success"}`, async t => {
  const f = await fixture(t, failure ? {[failure]: true} : {});
  await f.ok("prepare", {...f.value, requestDigest: f.run.pendingExecution.requestDigest, goalTarget: f.state.goalTarget,
    contextPlan: f.state.contextPlan, outcomePlan: f.state.outcomePlan, selections: f.selected});
  const binding = await f.ok("bind", {identity: f.identity}), input = {identity: f.identity, bindingDigest: binding.bindingDigest};
  const slice = await f.ok("resolve", input), review = await f.ok("review", {...input,
    coverage: f.source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: ["units"]}))});
  const operations = [], replies = {};
  const journey = await runReviewedExecutionJourney({frame: executionProbeFrame(f, binding, slice, review, failure),
    decision: {decision: "APPROVE", reviewDigest: review.reviewDigest, principalId: f.access.principal.id},
    authorize: async () => true, // Disposable synthetic source execution only.
    invoke: async (operation, payload) => {
      operations.push(operation); const r = await cli(f, operation, payload);
      const decoded = executionCliResult(operation, r.code, JSON.stringify(r.data), r.stderr); replies[operation] = decoded;
      if (operation === "dispatch" && failure === "lost-response") throw new Error("synthetic transport lost reply after the real source CLI call");
      return decoded;
    }});
  assert.equal(f.calls(), 1);
  if (failure === "lost-response") {
    assert.equal(journey.status, "UNVERIFIED_OUTCOME"); assert.equal(journey.lastAttemptedOperation, "dispatch");
    assert.deepEqual(operations, ["resolve", "review", "approveReview", "dispatch"]);
    // Read persisted planning state, never repeat dispatch to discover its result.
    assert.equal((await f.ok("inspect", {identity: f.identity})).status, "PREPARED_NOT_APPROVED");
  } else {
    assert.equal(journey.status, "EXECUTION_SUBJOURNEY_ASSERTIONS_PASSED");
    assert.equal(journey.result.status, failure ? "FAILED" : "DUAL_VALIDATED_NOT_COMPLETED");
    assert.equal(replies.dispatch.requestId, replies.dispatch.data.requestId);
    assert.equal(journey.events[3].requestId, replies.dispatch.data.result.requestId);
    assert.deepEqual(operations, ["resolve", "review", "approveReview", "dispatch", "collect", "evaluate"]);
  }
  assert.equal(f.rawGoal().semanticTargetCompletions, undefined); assert.equal(f.rawGoal().releaseDecision, undefined);
  assert.equal(journey.targetCriteriaClosed, 0); assert.equal(f.calls(), 1);
});
