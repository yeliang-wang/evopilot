import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import {semanticExecutionFixture} from "../helpers/semantic-execution-fixture.mjs";
import {createSemanticExecutionTransport} from "../../packages/server/dist/application/semantic-execution-transport.js";
import {createOpenCodeRuntimeProfile, createOpenCodeExecutorAdapter} from "../../packages/adapter-opencode/dist/index.js";
import {assertAgentExecutionRequestV1Alpha1, executeConformantLifecycleAdapter} from "../../packages/contracts/dist/index.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

async function fixture(t) {
  const profile = createOpenCodeRuntimeProfile({runtimeVersion: "synthetic-1", host: "synthetic-host", provider: "synthetic", model: "test",
    capabilities: ["goal-loop.execute"], workspaceRoot: "/private/tmp/synthetic-semantic-workspace", timeoutMs: 1000});
  const f = await semanticExecutionFixture(t, {pending: true, adapterProfile: profile});
  const bound = await f.bind(), requests = [], invocations = [];
  const realAdapter = createOpenCodeExecutorAdapter({profile, runner: async invocation => {
    invocations.push(invocation);
    return {exitCode: 0, signal: null, termination: "EXITED", stdout: JSON.stringify({type: "step_finish", part: {cost: 0, tokens: {input: 3, output: 2}}}), stderr: ""};
  }});
  const adapter = {...realAdapter, execute: async request => {requests.push(request); return realAdapter.execute(request);}};
  const owners = {...f.owners, adapter}, transport = createSemanticExecutionTransport(f.configuration, owners);
  const input = {identity: f.identity, bindingDigest: bound.bindingDigest, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest,
    currentAccess: f.input.currentAccess, selection: {schema: "evopilot-semantic-context-selection/v1", reasoning: "EXPLICIT_ONLY", conceptIds: ["fixture:entity"], relations: []}};
  return {...f, bound, profile, adapter, owners, transport, input, requests, invocations, execute: () => transport.execute(input)};
}

test("actual context preparation to OpenCode serialization and correlated result; no Lifecycle completion", async t => {
  const f = await fixture(t), file = path.join(f.configuration.dataRoot, "lifecycle-runs/context-run.json"), before = await fs.readFile(file, "utf8");
  const result = await f.execute();
  assert.equal(result.status, "RECEIVED_PENDING_DUAL_VALIDATION"); assert.equal(result.eligibleForCompletion, false);
  assert.equal(result.result.status, "SUCCEEDED"); assert.equal(result.result.cost.inputTokens, 3);
  assert.equal(f.invocations.length, 1); assert.equal(f.requests.length, 1);
  const request = f.requests[0], prompt = JSON.parse(f.invocations[0].args.at(-1));
  assert.deepEqual(prompt.request, request); assertAgentExecutionRequestV1Alpha1(request);
  assert.notEqual(request.requestDigest, f.run.pendingExecution.requestDigest); assert.notEqual(request.id, f.run.pendingExecution.id);
  assert.equal(request.semanticContext.sourceRequestDigest, f.run.pendingExecution.requestDigest);
  assert.equal(request.semanticContext.slice.concepts[0].conceptId, "fixture:entity");
  assert.equal(request.executor.agentRuntime.profileDigest, f.profile.digest);
  assert.notEqual(f.bound.agentRuntime.coreProfileDigest, f.profile.digest);
  assert.equal(await fs.readFile(file, "utf8"), before);
  assert.deepEqual(await f.execute(), result); assert.equal(f.invocations.length, 1);
  const restarted = createSemanticExecutionTransport(f.configuration, f.owners);
  assert.deepEqual(await restarted.execute(f.input), result); assert.equal(f.invocations.length, 1);
});

for (const [name, change] of [
  ["adapter profile digest tamper", f => {f.adapter.profile = {...f.profile, model: "different"};}],
  ["unsupported semantic transport", f => {delete f.adapter.semanticContextSchema;}],
  ["stale LLM route", f => {f.state.llmProfile.modelName = "different";}],
  ["lost permission", f => {f.access.principal.role = "viewer";}],
  ["wrong source request", f => {f.input.requestDigest = d("different");}],
  ["pre-cancel", f => {const controller = new AbortController(); controller.abort(); f.input.signal = controller.signal;}]
]) test(`dispatch refuses ${name} without invoking adapter`, async t => {
  const f = await fixture(t); change(f); await assert.rejects(f.execute()); assert.equal(f.invocations.length, 0);
});

test("parallel dispatch elects one durable claim and never calls the adapter twice", async t => {
  const f = await fixture(t);
  const results = await Promise.allSettled([f.execute(), createSemanticExecutionTransport(f.configuration, f.owners).execute(f.input)]);
  assert(results.some(result => result.status === "fulfilled")); assert.equal(f.invocations.length, 1);
  for (const result of results) if (result.status === "rejected") assert.match(result.reason.message, /RECONCILIATION_REQUIRED/);
});

test("exception after possible side effects is not retried, including after restart", async t => {
  const f = await fixture(t); let calls = 0;
  const adapter = {...f.adapter, execute: async () => {calls++; throw new Error("synthetic-unknown-outcome");}};
  const owners = {...f.owners, adapter}, transport = createSemanticExecutionTransport(f.configuration, owners);
  await assert.rejects(transport.execute(f.input), /synthetic-unknown-outcome/);
  await assert.rejects(createSemanticExecutionTransport(f.configuration, owners).execute(f.input), /RECONCILIATION_REQUIRED/);
  assert.equal(calls, 1);
});

for (const [name, mutate] of [
  ["foreign request", result => {result.requestDigest = d("foreign");}],
  ["foreign binding", result => {result.bindingDigest = d("foreign");}],
  ["foreign key", result => {result.idempotencyKey = "foreign";}],
  ["undeclared effect", result => {result.effects = ["PUBLICATION"];}],
  ["raw evidence secret", result => {result.evidence = ["apiKey=synthetic-not-a-real-secret"];}],
  ["negative tokens", result => {result.cost.inputTokens = -1;}],
  ["oversized evidence", result => {result.evidence = ["x".repeat(65537)];}],
  ["unknown result authority", result => {result.goalComplete = true;}]
]) test(`invalid ${name} cannot be accepted or automatically replayed`, async t => {
  const f = await fixture(t), adapter = {...f.adapter, execute: async request => {const result = await f.adapter.execute(request); mutate(result); return result;}};
  const owners = {...f.owners, adapter};
  await assert.rejects(createSemanticExecutionTransport(f.configuration, owners).execute(f.input));
  await assert.rejects(createSemanticExecutionTransport(f.configuration, owners).execute(f.input), /RECONCILIATION_REQUIRED/);
  assert.equal(f.invocations.length, 1);
});

test("permission revocation during execution retains receipt but denies return and replay", async t => {
  const f = await fixture(t), adapter = {...f.adapter, execute: async request => {const result = await f.adapter.execute(request); f.access.principal.role = "viewer"; return result;}};
  const owners = {...f.owners, adapter}, transport = createSemanticExecutionTransport(f.configuration, owners);
  await assert.rejects(transport.execute(f.input), {code: "PERMISSION_DENIED"});
  await assert.rejects(transport.execute(f.input), {code: "PERMISSION_DENIED"});
  assert.equal((await fs.readdir(path.join(f.configuration.dataRoot, "project-semantic-bindings/dispatch-results"))).length, 1);
  f.access.principal.role = "operator";
  assert.equal((await transport.execute(f.input)).eligibleForCompletion, false); assert.equal(f.invocations.length, 1);
});

for (const status of ["FAILED", "UNCERTAIN"]) test(`${status} receipt is preserved without retry or completion`, async t => {
  const f = await fixture(t), adapter = {...f.adapter, processObservationSchema: undefined, readProcessObservation: undefined,
    execute: async request => ({...await f.adapter.execute(request), status})};
  const transport = createSemanticExecutionTransport(f.configuration, {...f.owners, adapter});
  assert.equal((await transport.execute(f.input)).result.status, status);
  assert.equal((await transport.execute(f.input)).eligibleForCompletion, false); assert.equal(f.invocations.length, 1);
});

for (const [name, mutate] of [
  ["slice content", r => {r.semanticContext.slice.concepts[0].label = "changed";}],
  ["pending binding", r => {r.semanticContext.slice.pendingExecution.lifecycleBindingDigest = d("wrong");}],
  ["source inputs", r => {r.inputs.objective = "replace approved action";}],
  ["source key", r => {r.semanticContext.sourceIdempotencyKey = "different";}],
  ["foreign scope", r => {r.scope.workspaceId = "foreign";}],
  ["authority", r => {r.semanticContext.slice.authority.mayApprove = true;}],
  ["legacy request id", r => {r.id = r.semanticContext.slice.pendingExecution.requestId;}]
]) test(`adapter contract rejects rehashed ${name}`, async t => {
  const f = await fixture(t); await f.execute(); const request = structuredClone(f.requests[0]); mutate(request);
  const {requestDigest, ...body} = request; request.requestDigest = d(body);
  assert.throws(() => assertAgentExecutionRequestV1Alpha1(request), /SEMANTIC_CONTEXT_INVALID/);
});

test("generic adapter execution denies unnegotiated semantic context", async t => {
  const f = await fixture(t); await f.execute(); const adapter = {...f.adapter}; delete adapter.semanticContextSchema;
  await assert.rejects(executeConformantLifecycleAdapter(adapter, f.requests[0]), /SEMANTIC_CONTEXT_UNSUPPORTED/);
  assert.equal(f.invocations.length, 1);
});

for (const mode of ["timeout", "cancellation"]) test(`${mode} stops waiting without replay; late receipt is retained`, async t => {
  const f = await fixture(t), controller = new AbortController(); let release, entered;
  const started = new Promise(resolve => {entered = resolve;});
  const held = new Promise(resolve => {release = resolve;});
  const adapter = {...f.adapter, execute: async request => {entered(); await held; return f.adapter.execute(request);}};
  const transport = createSemanticExecutionTransport(f.configuration, {...f.owners, adapter});
  const attempt = transport.execute({...f.input, signal: controller.signal});
  const rejected = assert.rejects(attempt, /RECONCILIATION_REQUIRED/);
  await started; if (mode === "cancellation") controller.abort();
  await rejected;
  await assert.rejects(transport.execute(f.input), /RECONCILIATION_REQUIRED/);
  release();
  let receipt;
  for (let index = 0; index < 20; index++) {
    await new Promise(resolve => setTimeout(resolve, 5));
    try {receipt = await transport.execute(f.input); break;} catch (error) {assert.match(error.message, /RECONCILIATION_REQUIRED/);}
  }
  assert.equal(receipt?.eligibleForCompletion, false); assert.equal(f.invocations.length, 1);
});
