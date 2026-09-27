import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import {execFile} from "node:child_process";
import {Client} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";
import {semanticCurrentOwnerFixture} from "../helpers/semantic-current-owner-fixture.mjs";
import {semanticExecutionImplementationDigest} from "../../packages/server/dist/application/semantic-execution-application.js";
import {createServer} from "../../packages/server/dist/index.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

const repo = path.resolve(import.meta.dirname, "../..");
async function listen(t, server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(t, options = {}) {
  const f = await semanticCurrentOwnerFixture(t, {publishedMaterials: true, runtimeDigest: semanticExecutionImplementationDigest, ...options});
  const serverOptions = {dataRoot: f.configuration.dataRoot, runtimeMode: "debug", llmClient: {}, allowSampleData: false, autoRegisterProfileProject: false,
    harnessRegistryConfig: f.configuration.registryConfigPath, semanticCatalogPolicyPath: f.configuration.policyPath,
    semanticExecutorAdapter: options.noAdapter ? undefined : {...f.owners.adapter, ...options.adapter},
    tokens: [
      {name: f.access.principal.id, token: "synthetic-operator", role: "operator", tenantId: f.scope.tenantId, workspaceId: f.scope.workspaceId},
      {name: "viewer", token: "synthetic-viewer", role: "viewer", tenantId: f.scope.tenantId, workspaceId: f.scope.workspaceId},
      {name: "foreign-operator", token: "synthetic-foreign-operator", role: "operator", tenantId: "other", workspaceId: "other"},
      {name: "foreign", token: "synthetic-foreign", role: "admin", tenantId: "other", workspaceId: "other"}
    ], ...options.server};
  const server = createServer(serverOptions), serverUrl = await listen(t, server);
  const basePath = `/api/v1/projects/${f.scope.projectId}/semantic-execution/`;
  const declaration = structuredClone({identity: f.identity, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest,
    goalTarget: f.state.goalTarget, contextPlan: f.state.contextPlan, outcomePlan: f.state.outcomePlan, selections: f.selected});
  const request = async (operation, value, headers = {}, method = operation === "capabilities" ? "GET" : "POST") => {
    const response = await fetch(serverUrl + basePath + operation, {method, headers: {authorization: "Bearer synthetic-operator", "content-type": "application/json", ...headers},
      ...(value === undefined ? {} : {body: typeof value === "string" ? value : JSON.stringify(value)})});
    return {status: response.status, body: await response.json(), headers: response.headers};
  };
  const ok = async (operation, value) => {const r = await request(operation, value); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.data;};
  const prepared = async () => {await ok("prepare", declaration); const b = await ok("bind", {identity: f.identity}); return {identity: f.identity, bindingDigest: b.bindingDigest};};
  const reviewed = async () => {const input = await prepared(), review = await ok("review", {...input,
    coverage: f.source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: ["units"]}))});
    await ok("approveReview", {...input, reviewDigest: review.reviewDigest, decision: "APPROVE"}); return input;};
  return {...f, server, serverOptions, serverUrl, basePath, declaration, request, ok, prepared, reviewed};
}
function cli(f, operation, payload, options = []) {
  const file = path.join(f.root, `cli-${operation}.json`);
  if (payload !== undefined) fs.writeFileSync(file, JSON.stringify(payload));
  return new Promise(resolve => execFile(process.execPath, [path.join(repo, "packages/cli/dist/index.js"), "project", "execution", operation, f.scope.projectId,
    ...(payload === undefined ? [] : ["--file", file]), ...options, "--server", f.serverUrl, "--config", path.join(f.root, "unused-config.json"), "--json"],
  {cwd: repo, timeout: 30000, env: {PATH: process.env.PATH, EVOPILOT_API_TOKEN: "synthetic-operator", EVOPILOT_LOG_LEVEL: "error"}},
  (error, stdout, stderr) => resolve({code: error?.code ?? 0, stdout, stderr, data: stdout.trim() ? JSON.parse(stdout) : undefined})));
}
function authoringInput(f) {
  const {identity, runId, requestDigest, goalTarget} = f.declaration; return {identity, runId, requestDigest, goalTarget};
}
function explicitDraft(f, basis) {
  return {...authoringInput(f), basisDigest: basis.basisDigest, selection: f.declaration.contextPlan.actions[0].selection,
    business: f.declaration.outcomePlan.business, selections: f.selected,
    harness: basis.obligations.map((obligation, index) => ({id: "synthetic-obligation-" + index, obligation,
      evidenceKind: "synthetic-checks", path: ["ok"], predicate: {op: "EQUALS", value: true}}))};
}
test("public pre-plan authoring rejects unscoped users, injected pins and stale basis without effects", async t => {
  const f = await fixture(t), input = authoringInput(f), basis = await f.ok("planning", input);
  for (const token of ["synthetic-viewer", "synthetic-foreign-operator", "synthetic-foreign"])
    assert.equal((await f.request("planning", input, {authorization: "Bearer " + token})).status, 403);
  const value = explicitDraft(f, basis);
  assert.equal((await f.request("draft", {...value, outcomePlan: f.declaration.outcomePlan})).status, 400);
  assert.equal((await f.request("draft", {...value, basisDigest: "sha256:" + "0".repeat(64)})).status, 409);
  const response = await f.request("draft", value);
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.body.data.persisted, false); assert.equal(f.calls(), 0);
  assert.equal((await f.request("inspect", {identity: f.identity})).status, 404);
  const audit = f.runtimeStore.listAudit().filter(r => r.action.startsWith("semantic-execution."));
  assert(audit.some(r => r.action === "semantic-execution.planning.succeeded"));
  assert(audit.some(r => r.action === "semantic-execution.draft.succeeded"));
  assert(!JSON.stringify(audit).includes("NUMBER_RANGE"));
});
test("CLI compiles exact explicit rules without requiring client-computed plan hashes", async t => {
  const f = await fixture(t), read = await cli(f, "planning", authoringInput(f));
  assert.equal(read.code, 0, read.stderr);
  const basis = read.data;
  const result = await cli(f, "draft", explicitDraft(f, basis)); assert.equal(result.code, 0, result.stderr);
  assert.equal(result.data.status, "DRAFT_NOT_PREPARED"); assert.equal(f.calls(), 0);
  const prepared = await cli(f, "prepare", result.data.declaration); assert.equal(prepared.code, 0, prepared.stderr);
  assert.equal(prepared.data.status, "PREPARED_NOT_APPROVED"); assert.equal(f.calls(), 0);
});
test("actual Expert through stdio MCP compiles then separately prepares and reviews a domain declaration", async t => {
  const f = await fixture(t), {client} = await mcp(t, f);
  const {executeExpertSemanticExecution, explainExpertSemanticExecutionResult} = await import("../../packages/evolution-expert/dist/index.js");
  const transport = {invoke: (name, args) => client.callTool({name, arguments: args})};
  const run = async (op, payload) => {
    const response = await executeExpertSemanticExecution(op, {projectId: f.scope.projectId, payload}, transport);
    const explained = explainExpertSemanticExecutionResult(op, response);
    assert.equal(explained.canExecute, false); assert.equal(explained.releaseAuthorized, false); return {response, explained};
  };
  const {explained: basis} = await run("planning", authoringInput(f));
  assert.equal(basis.status, "EXPLICIT_RULES_REQUIRED");
  const {explained: draft} = await run("draft", explicitDraft(f, basis));
  assert.equal(draft.status, "DRAFT_NOT_PREPARED");
  assert.equal((await f.request("inspect", {identity: f.identity})).status, 404);
  await run("prepare", draft.declaration);
  const {explained: bound} = await run("bind", {identity: f.identity});
  const payload = {identity: f.identity, bindingDigest: bound.evidence.bindingDigest};
  const {explained: mapping} = await run("mapping", payload);
  assert(mapping.coverageInputs.every(c => c.ruleIds.length === 0));
  const {explained: reviewed} = await run("review", {...payload,
    coverage: mapping.criteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: ["units"]}))});
  assert.equal(reviewed.status, "WAITING_EXACT_HUMAN_DECISION");
  assert.equal((await f.request("dispatch", payload)).status, 404); assert.equal(f.calls(), 0);
});
async function mcp(t, f) {
  const transport = new StdioClientTransport({command: process.execPath, args: [path.join(repo, "packages/adapter-mcp/dist/stdio.js")], cwd: repo, stderr: "pipe",
    env: {PATH: process.env.PATH, EVOPILOT_SERVER: f.serverUrl, EVOPILOT_API_TOKEN: "synthetic-operator", EVOPILOT_ACTOR: "forged-admin"}});
  const client = new Client({name: "execution-source-test", version: "1.0.0"}); await client.connect(transport); t.after(() => client.close());
  return {client, call: (operation, payload) => client.callTool({name: "evopilot_semantic_execution_" + operation,
    arguments: {projectId: f.scope.projectId, ...(payload === undefined ? {} : {payload})}})};
}
test("semantic preparation fences legacy Goal mutation, raw final report and projections over HTTP", async t => {
  const f = await fixture(t); await f.ok("prepare", f.declaration);
  const url = f.serverUrl + "/api/v1/goals/" + f.identity.goalId;
  const request = async (suffix, method = "GET", token = "synthetic-operator", body) => {
    const response = await fetch(url + suffix, {method, headers: {authorization: "Bearer " + token, "content-type": "application/json"},
      ...(body ? {body: JSON.stringify(body)} : {})});
    return {status: response.status, body: await response.json()};
  };
  assert.equal((await request("/advance", "POST", "synthetic-operator", {})).status, 409);
  assert.equal((await request("/plan", "POST", "synthetic-operator", {force: true})).status, 409);
  f.changeGoal(g => {g.status = "COMPLETED"; g.plan.targets[0].status = "DONE"; g.finalReport = {status: "COMPLETED", conclusion: "injected"};});
  const report = await request("/final-report");
  assert.equal(report.status, 409); assert.equal(report.body.error, "SEMANTIC_GOAL_VIEW_DRIFT");
  const snapshot = await request("/snapshot"); assert.equal(snapshot.status, 409);
  assert.equal(snapshot.body.data, undefined);
  const goal = await request(""); assert.equal(goal.status, 409); assert.equal(goal.body.data, undefined);
  assert.equal((await request("/final-report", "GET", "synthetic-foreign-operator")).status, 403);
  assert.equal(f.calls(), 0);
});
test("public HTTP preparation, exact review, dispatch and outcome use persisted current sources and server audit", async t => {
  const f = await fixture(t), input = await f.reviewed();
  assert.equal((await f.ok("resolve", input)).status, "PREPARED_NOT_DISPATCHED");
  const first = await f.request("dispatch", input, {"x-evopilot-actor": "forged-admin"});
  assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(first.body.data.eligibleForCompletion, false);
  assert.deepEqual(await f.ok("dispatch", input), first.body.data); assert.equal(f.calls(), 1);
  const result = await f.ok("evaluate", input); assert.equal(result.status, "INDETERMINATE"); assert.equal(result.eligibleForCompletion, false);
  assert.equal(f.runtimeStore.readGoal(f.identity.goalId).status, "APPROVED");
  const audit = f.runtimeStore.listAudit().filter(r => r.action.startsWith("semantic-execution."));
  assert(audit.some(r => r.action === "semantic-execution.approveReview.succeeded"));
  assert(audit.every(r => r.actor === f.access.principal.id));
  assert(!JSON.stringify(audit).includes("secret://")); assert(!JSON.stringify(audit).includes("Synthetic API gateway"));
});
test("public invocation cannot skip explicit outcome review approval", async t => {
  const f = await fixture(t), input = await f.prepared();
  assert.equal((await f.request("dispatch", input)).status, 404); assert.equal(f.calls(), 0);
  const review = await f.ok("review", {...input, coverage: f.source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: ["units"]}))});
  for (const decision of [undefined, "REJECT", true]) assert.equal((await f.request("approveReview", {...input, reviewDigest: review.reviewDigest, decision})).status, 400);
  assert.equal((await f.request("dispatch", input)).status, 404); assert.equal(f.calls(), 0);
});
test("public collector negotiates server configuration, rejects client facts and redacts response/audit", async t => {
  const descriptor = {id: "synthetic-http-domain", implementationDigest: d("synthetic-implementation"), qualificationDigest: d("synthetic-qualification"),
    origin: "SYNTHETIC", mode: "READ_ONLY", kinds: ["domain-checks"]};
  let collected = 0;
  const collector = {descriptor, collect: async request => {
    collected++; return {schema: "evopilot-semantic-collector-observation/v1", collectionRequestDigest: request.collectionRequestDigest,
      observedAt: new Date().toISOString(), observations: [{kind: "domain-checks", facts: {units: 5}, sourceDigests: [d("synthetic-snapshot")]}]};
  }};
  const f = await fixture(t, {collectorDescriptor: descriptor, server: {semanticEvidenceCollector: collector}}), input = await f.reviewed();
  assert((await f.ok("capabilities")).operations.includes("collect"));
  assert.equal((await f.request("collect", input)).status, 404); assert.equal(collected, 0);
  await f.ok("dispatch", input);
  for (const field of ["facts", "observations", "collector", "approved", "sourceDigests"]) {
    assert.equal((await f.request("collect", {...input, [field]: {units: 5}})).status, 400);
  }
  for (const token of ["synthetic-viewer", "synthetic-foreign"]) {
    assert.equal((await f.request("collect", input, {authorization: `Bearer ${token}`})).status, 403);
  }
  assert.equal(collected, 0);
  const first = await f.ok("collect", input); assert.equal(first.origin, "SYNTHETIC"); assert.equal(first.status, "COLLECTED_NOT_COMPLETED");
  assert.equal(first.authority.mayCompleteGoal, false); assert(!JSON.stringify(first).includes("units"));
  assert.deepEqual(await f.ok("collect", input), first); assert.equal(collected, 1);
  const cliResult = await cli(f, "collect", input); assert.equal(cliResult.code, 0, cliResult.stderr);
  const {requestId: cliRequestId, ...cliData} = cliResult.data; assert.equal(typeof cliRequestId, "string"); assert(cliRequestId.length > 0); assert.deepEqual(cliData, first);
  const transport = await mcp(t, f), mcpResult = await transport.call("collect", input); assert(!mcpResult.isError); assert.equal(collected, 1);
  const report = await f.ok("evaluate", input); assert.equal(report.business.status, "PASSED"); assert.equal(report.eligibleForCompletion, false);
  assert.equal(report.evidenceTrust, "SYNTHETIC_COLLECTOR_OBSERVATIONS");
  const audit = f.runtimeStore.listAudit().filter(row => row.action.startsWith("semantic-execution.collect."));
  assert(audit.some(row => row.action.endsWith(".succeeded")));
  assert(audit.filter(row => !row.action.endsWith(".rejected")).every(row => row.actor === f.access.principal.id));
  assert(audit.some(row => row.action.endsWith(".rejected") && row.actor === "viewer"));
  assert(!audit.some(row => row.actor === "forged-admin"));
  assert(!JSON.stringify(audit).includes("units"));
});
test("default server does not advertise or select a business collector", async t => {
  const f = await fixture(t), input = await f.reviewed();
  const capabilities = await f.ok("capabilities"); assert.equal(capabilities.collectorConfigured, false); assert(!capabilities.operations.includes("collect"));
  await f.ok("dispatch", input); assert.equal((await f.request("collect", input)).status, 404);
  const result = await cli(f, "collect", input); assert.notEqual(result.code, 0); assert.equal(f.calls(), 1);
});
test("legacy result HTTP cannot complete a semantic-owned request by omitting semantic fields", async t => {
  const f = await fixture(t); await f.prepared(); const pending = f.run.pendingExecution;
  const response = await fetch(`${f.serverUrl}/api/v1/lifecycle-runs/${f.run.id}/external-result`, {
    method: "POST", headers: {authorization: "Bearer synthetic-operator", "content-type": "application/json"},
    body: JSON.stringify({requestId: pending.id, requestDigest: pending.requestDigest, bindingDigest: pending.bindingDigest,
      idempotencyKey: pending.idempotencyKey, status: "SUCCEEDED", receiptDigest: d("synthetic-forgery"), effects: []})});
  assert.equal(response.status, 409); assert.match(JSON.stringify(await response.json()), /LIFECYCLE_SEMANTIC_COMPLETION_REQUIRED/);
  assert.equal(f.lifecycleService.read(f.run.id).status, "WAITING_EXTERNAL_SIGNAL");
});
for (const token of ["synthetic-viewer", "synthetic-foreign"]) test(`${token} cannot use execution routes or override actor`, async t => {
  const f = await fixture(t), input = await f.reviewed();
  for (const [operation, value] of [["capabilities", undefined], ["prepare", f.declaration], ["inspect", {identity: f.identity}], ["dispatch", input], ["evaluate", input]]) {
    assert.equal((await f.request(operation, value, {authorization: `Bearer ${token}`, "x-evopilot-actor": f.access.principal.id})).status, 403);
  }
  assert.equal(f.calls(), 0);
});
test("route/body identity, exact fields, finite operations and request size fail closed", async t => {
  const f = await fixture(t), input = await f.prepared();
  for (const field of ["actor", "permissions", "command", "runtimeDigest", "runId", "requestDigest", "eligibleForCompletion", "adapter"]) {
    assert.equal((await f.request("dispatch", {...input, [field]: "injected"})).status, 400);
  }
  assert.equal((await f.request("bind", {identity: {...f.identity, projectId: "other"}})).status, 400);
  for (const body of ["{", "x".repeat(65537), {...f.declaration, approved: true}]) assert.equal((await f.request("prepare", body)).status, 400);
  for (const operation of ["complete", "publish", "dispatch?approved=true"]) assert.equal((await f.request(operation, input)).status, 400);
  assert.equal((await f.request("dispatch", input, {"content-type": "text/plain"})).status, 400);
  assert.equal((await f.request("dispatch", undefined, {}, "GET")).status, 405); assert.equal(f.calls(), 0);
});
test("server without configured adapter advertises no dispatch and never chooses a fallback", async t => {
  const f = await fixture(t, {noAdapter: true}), input = await f.reviewed(), capabilities = await f.ok("capabilities");
  assert.equal(capabilities.adapterConfigured, false); assert.equal(capabilities.completionAvailable, true); assert.equal(capabilities.phaseCompletionAvailable, true); assert(!capabilities.operations.includes("dispatch"));
  assert.equal((await f.request("dispatch", input)).status, 404); assert.equal(f.calls(), 0);
});
test("HTTP current account suspension and Catalog revocation defeat prepared authority", async t => {
  const f = await fixture(t), input = await f.reviewed();
  f.runtimeStore.writeUser({id: f.access.principal.id, username: f.access.principal.id, passwordHash: "synthetic", role: "operator",
    tenantId: f.scope.tenantId, workspaceId: f.scope.workspaceId, status: "SUSPENDED", platformAdmin: false, mustChangePassword: false});
  assert.equal((await f.request("dispatch", input)).status, 403); assert.equal(f.calls(), 0);
  const g = await fixture(t), next = await g.reviewed(); g.policy.catalogs[0].permission = "DENIED"; await g.write("policy.json", g.policy);
  const r = await g.request("dispatch", next); assert.equal(r.status, 403); assert(!JSON.stringify(r.body).includes(g.root)); assert.equal(g.calls(), 0);
});
test("configured adapter exception is redacted; retained claim blocks replay", async t => {
  let calls = 0;
  const f = await fixture(t, {adapter: {execute: async () => {calls++; throw new Error("PRIVATE_ADAPTER_DETAIL");}}}), input = await f.reviewed();
  const first = await f.request("dispatch", input); assert.equal(first.status, 409); assert(!JSON.stringify(first.body).includes("PRIVATE_ADAPTER_DETAIL"));
  assert.equal((await f.request("dispatch", input)).status, 409); assert.equal(calls, 1);
});
test("authentication and production readiness remain ahead of public execution", async t => {
  const f = await fixture(t); assert.equal((await f.request("capabilities", undefined, {authorization: ""})).status, 401);
  const g = await fixture(t, {server: {runtimeMode: "prod"}}), r = await g.request("prepare", g.declaration);
  assert.equal(r.status, 409); assert.equal(r.body.error, "LLM_PROFILE_REQUIRED"); assert.equal(g.calls(), 0);
});
test("CLI to MCP uses the actual public execution owner, with no automatic approval or completion", async t => {
  const f = await fixture(t), capability = await cli(f, "capabilities"); assert.equal(capability.code, 0, capability.stderr);
  const prepare = await cli(f, "prepare", f.declaration); assert.equal(prepare.code, 0, prepare.stderr);
  const {client, call} = await mcp(t, f);
  const semanticTools = (await client.listTools()).tools.filter(x => x.name.startsWith("evopilot_semantic_execution_"));
  const expected = ["capabilities", "planning", "draft", "prepare", "inspect", "bind", "resolve", "mapping", "review", "approveReview", "dispatch", "collect", "evaluate",
    "commitStage", "stageReceipt", "completeTarget", "completionReceipt", "completionStatus", "completePhase", "phaseReceipt", "completeGoal", "goalReceipt"];
  assert.deepEqual(semanticTools.map(tool => tool.name).sort(), expected.map(op => "evopilot_semantic_execution_" + op).sort());
  assert.ok(semanticTools.some(x => x.name === "evopilot_semantic_execution_completeGoal"));
  assert.ok(semanticTools.some(x => x.name === "evopilot_semantic_execution_goalReceipt"));
  assert.ok(semanticTools.some(x => x.name === "evopilot_semantic_execution_completePhase"));
  assert.ok(semanticTools.some(x => x.name === "evopilot_semantic_execution_phaseReceipt"));
  const binding = await call("bind", {identity: f.identity}); assert.equal(binding.isError, false, JSON.stringify(binding));
  const input = {identity: f.identity, bindingDigest: binding.structuredContent.response.data.bindingDigest};
  assert.equal((await call("dispatch", input)).isError, true); assert.equal(f.calls(), 0);
  const review = await call("review", {...input, coverage: f.source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: ["units"]}))});
  assert.equal(review.isError, false, JSON.stringify(review));
  const approval = await cli(f, "approveReview", {...input, reviewDigest: review.structuredContent.response.data.reviewDigest, decision: "APPROVE"}, ["--actor", "forged-admin"]);
  assert.equal(approval.code, 0, approval.stderr); assert.equal(approval.data.principal.id, f.access.principal.id);
  assert.equal((await call("dispatch", input)).isError, false); assert.equal(f.calls(), 1);
  const outcome = await cli(f, "evaluate", input); assert.equal(outcome.code, 0, outcome.stderr); assert.equal(outcome.data.eligibleForCompletion, false);
});
test("both transports refuse missing capabilities and redirects without forwarding credentials or mutating", async t => {
  const f = await fixture(t), requests = [], forwarded = [];
  const other = await listen(t, http.createServer((req, res) => {forwarded.push(req.headers); res.end("{}");}));
  let mode = "legacy";
  f.serverUrl = await listen(t, http.createServer((req, res) => {requests.push(req.method); res.writeHead(mode === "redirect" ? 302 : mode === "legacy" ? 404 : 200,
    {"content-type": "application/json", ...(mode === "redirect" ? {location: other} : {})}); res.end(JSON.stringify({data: {version: "6.3.0"}}));}));
  const {call} = await mcp(t, f);
  for (mode of ["legacy", "malformed", "redirect"]) {
    assert.notEqual((await cli(f, "prepare", f.declaration)).code, 0);
    assert.equal((await call("prepare", f.declaration)).isError, true);
  }
  assert.equal(requests.length, 6); assert(requests.every(x => x === "GET")); assert.deepEqual(forwarded, []);
});
test("lost HTTP dispatch response can be read through exact retry after server restart without re-invocation", async t => {
  const f = await fixture(t), input = await f.reviewed(); let attempts = 0;
  const proxy = await listen(t, http.createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const upstream = await fetch(f.serverUrl + req.url, {method: req.method, headers: {authorization: "Bearer synthetic-operator", "content-type": "application/json"}, body});
    assert.equal(upstream.status, 200); await upstream.text(); attempts++; res.destroy();
  }));
  await assert.rejects(fetch(proxy + f.basePath + "dispatch", {method: "POST", body: JSON.stringify(input)}));
  assert.equal(attempts, 1); assert.equal(f.calls(), 1);
  const restarted = await listen(t, createServer(f.serverOptions));
  const response = await fetch(restarted + f.basePath + "dispatch", {method: "POST", headers: {authorization: "Bearer synthetic-operator", "content-type": "application/json"}, body: JSON.stringify(input)});
  assert.equal(response.status, 200); assert.equal(f.calls(), 1);
});

for (const phase of ["started", "succeeded"]) test(`audit ${phase} delivery failure never triggers another adapter invocation`, async t => {
  const f = await fixture(t), input = await f.reviewed();
  const prototype = Object.getPrototypeOf(f.runtimeStore), append = prototype.appendAudit;
  let enabled = true;
  t.mock.method(prototype, "appendAudit", function (row) {
    if (enabled && row.action === `semantic-execution.dispatch.${phase}`) throw new Error("PRIVATE_AUDIT_FAILURE");
    return append.call(this, row);
  });
  const r = await f.request("dispatch", input); assert.equal(r.status, 409); assert(!JSON.stringify(r.body).includes("PRIVATE_AUDIT_FAILURE"));
  assert.equal(f.calls(), phase === "started" ? 0 : 1);
  enabled = false;
  assert.equal((await f.request("dispatch", input)).status, 200); assert.equal(f.calls(), 1);
});
test("revocation while adapter is running retains receipt but does not return usable success", async t => {
  const f = await fixture(t, {onRun: v => {v.policy.catalogs[0].permission = "DENIED"; fs.writeFileSync(v.configuration.policyPath, JSON.stringify(v.policy));}}), input = await f.reviewed();
  assert.equal((await f.request("dispatch", input)).status, 403); assert.equal(f.calls(), 1);
  assert.equal(fs.readdirSync(path.join(f.configuration.dataRoot, "project-semantic-bindings/dispatch-results")).length, 1);
  assert.equal((await f.request("dispatch", input)).status, 403); assert.equal(f.calls(), 1);
});
for (const surface of ["cli", "mcp"]) test(`${surface} reports lost dispatch response without automatic retry`, async t => {
  const f = await fixture(t), input = await f.reviewed(); let attempts = 0;
  const proxy = await listen(t, http.createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const upstream = await fetch(f.serverUrl + req.url, {method: req.method, headers: {authorization: "Bearer synthetic-operator", "content-type": "application/json"}, ...(body ? {body} : {})});
    const text = await upstream.text();
    if (req.method === "POST") {attempts++; res.destroy(); return;}
    res.writeHead(upstream.status, {"content-type": "application/json"}); res.end(text);
  }));
  const proxied = {...f, serverUrl: proxy};
  if (surface === "cli") assert.notEqual((await cli(proxied, "dispatch", input)).code, 0);
  else {const {call} = await mcp(t, proxied); assert.equal((await call("dispatch", input)).isError, true);}
  assert.equal(attempts, 1); assert.equal(f.calls(), 1);
  assert.equal((await f.request("dispatch", input)).status, 200); assert.equal(f.calls(), 1);
});
