import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import {semanticExecutionFixture} from "../helpers/semantic-execution-fixture.mjs";
import {createSemanticExecutionTransport} from "../../packages/server/dist/application/semantic-execution-transport.js";
import {collectSemanticProcessEvidence} from "../../packages/server/dist/application/semantic-process-evidence.js";
import {createOpenCodeRuntimeProfile, createOpenCodeExecutorAdapter} from "../../packages/adapter-opencode/dist/index.js";
import {assertAgentProcessObservation} from "../../packages/contracts/dist/index.js";
import {SemanticBindingStore} from "../../packages/server/dist/storage/semantic-binding-store.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

async function fixture(t, options = {}) {
  const profile = createOpenCodeRuntimeProfile({runtimeVersion: "synthetic-1", host: "synthetic-host", provider: "synthetic", model: "test",
    capabilities: ["goal-loop.execute"], workspaceRoot: "/private/tmp/synthetic-process-workspace", timeoutMs: 1000});
  const f = await semanticExecutionFixture(t, {pending: true, adapterProfile: profile}), bound = await f.bind();
  const receipts = path.join(f.root, "private-receipts"), requests = []; let calls = 0;
  const processResult = {exitCode: 0, signal: null, termination: "EXITED", stdout: JSON.stringify({type: "step_finish", sessionID: "synthetic-private-session",
    part: {cost: 0.01, tokens: {input: 3, output: 2}, text: "private model content is not proof"}}), stderr: "private diagnostic"};
  Object.assign(processResult, options.process);
  const makeAdapter = () => createOpenCodeExecutorAdapter({profile, receiptStoreDir: receipts, runner: async () => {calls++; return processResult;}});
  const real = makeAdapter(), adapter = {...real, execute: async request => {requests.push(request); return real.execute(request);}};
  options.adapter?.(adapter);
  const owners = {...f.owners, adapter}, input = {identity: f.identity, bindingDigest: bound.bindingDigest, runId: f.run.id,
    requestDigest: f.run.pendingExecution.requestDigest, currentAccess: f.input.currentAccess,
    selection: {schema: "evopilot-semantic-context-selection/v1", reasoning: "EXPLICIT_ONLY", conceptIds: ["fixture:entity"], relations: []}};
  const store = new SemanticBindingStore(f.configuration.dataRoot), key = {scope: f.scope, runId: input.runId, sourceRequestDigest: input.requestDigest};
  return {...f, bound, profile, owners, adapter, input, receipts, requests, store, key, makeAdapter, calls: () => calls,
    execute: () => createSemanticExecutionTransport(f.configuration, owners).execute(input),
    evidence: receipt => collectSemanticProcessEvidence(receipt, requests[0], profile)};
}
test("adapter-measured receipt is collected without Agent-authored facts, raw outputs, or completion authority", async t => {
  const f = await fixture(t), receipt = await f.execute(), evidence = f.evidence(receipt);
  assert.equal(receipt.processObservationStatus, "COLLECTED"); assert.equal(evidence.kind, "agent-process");
  assert.equal(evidence.origin, "SYNTHETIC_PROCESS_RUNNER"); assert.equal(evidence.facts.exitCode, 0);
  assert.equal(evidence.facts.completionEventCount, 1); assert.equal(evidence.scope.goalId, f.identity.goalId);
  assert.equal(evidence.requestDigest, f.requests[0].requestDigest); assert.equal(evidence.sourceRequestDigest, f.input.requestDigest);
  assert.equal(evidence.evidenceContractDigest, f.bound.evidenceContractDigest); assert.equal(receipt.eligibleForCompletion, false);
  for (const value of ["private model content", "private diagnostic", "synthetic-private-session"]) assert(!JSON.stringify(receipt).includes(value));
  assert.deepEqual(f.evidence(await f.execute()), evidence); assert.equal(f.calls(), 1);
});
test("adapter restart reads persisted observation without rerunning the process", async t => {
  const f = await fixture(t), receipt = await f.execute(), restarted = f.makeAdapter();
  assert.deepEqual(restarted.readProcessObservation(f.requests[0], receipt.result), receipt.processObservation);
  await restarted.execute(f.requests[0]); assert.equal(f.calls(), 1);
});
for (const [name, process, status] of [
  ["nonzero", {exitCode: 2}, "FAILED"], ["timeout", {termination: "TIMEOUT", exitCode: null, signal: "SIGTERM"}, "UNCERTAIN"],
  ["output limit", {termination: "OUTPUT_LIMIT", exitCode: null}, "UNCERTAIN"],
  ["spawn error", {termination: "SPAWN_ERROR", exitCode: null, stdout: ""}, "FAILED"],
  ["malformed events", {stdout: "not JSON"}, "FAILED"], ["error event", {stdout: '{"type":"error"}'}, "FAILED"]
]) test(`collector preserves ${name} facts without inventing a pass`, async t => {
  const f = await fixture(t, {process}), receipt = await f.execute();
  assert.equal(receipt.result.status, status); assert.equal(f.evidence(receipt).facts.exitCode, process.exitCode ?? (process.exitCode === null ? null : 0));
  await f.execute(); assert.equal(f.calls(), 1);
});
for (const [name, mutate] of [
  ["request", m => {m.requestDigest = d("foreign");}], ["profile", m => {m.profileDigest = d("foreign");}],
  ["runtime", m => {m.runtime.version = "other";}], ["route", m => {m.route = "other";}],
  ["extra business fact", m => {m.businessSuccess = true;}], ["invalid origin", m => {m.origin = "MODEL_SAID_SO";}],
  ["negative counter", m => {m.eventCount = -1;}], ["fractional token", m => {m.cost.inputTokens = 0.5;}],
  ["NaN exit", m => {m.exitCode = NaN;}], ["raw output injected", m => {m.stdout = "unsafe";}],
  ["status mismatch", m => {m.exitCode = 9;}]
]) test(`rehashing does not make ${name} observation valid`, async t => {
  const f = await fixture(t), receipt = structuredClone(await f.execute()); mutate(receipt.processObservation.material);
  receipt.processObservation.receiptDigest = d(receipt.processObservation.material); receipt.result.receiptDigest = receipt.processObservation.receiptDigest;
  assert.throws(() => f.evidence(receipt));
});
test("invalid observer output is refused after retaining result; retry never re-executes", async t => {
  const f = await fixture(t, {adapter: adapter => {const read = adapter.readProcessObservation; adapter.readProcessObservation = (request, result) => {
    const observation = read(request, result); observation.material.exitCode = 8; return observation;
  };}});
  await assert.rejects(f.execute(), {code: "MATERIAL_INVALID"});
  const saved = f.store.read("dispatch-results", f.key); assert.equal(saved.result.status, "SUCCEEDED"); assert.equal(saved.processObservationStatus, "REJECTED");
  await assert.rejects(f.execute(), {code: "MATERIAL_INVALID"}); assert.equal(f.calls(), 1);
});
test("missing observation and legacy receipts stay unavailable, never synthesized from result text", async t => {
  const f = await fixture(t, {adapter: adapter => {adapter.readProcessObservation = () => undefined;}}), receipt = await f.execute();
  assert.equal(receipt.processObservationStatus, "UNAVAILABLE"); assert.equal(f.evidence(receipt), undefined);
  const file = path.join(f.receipts, f.requests[0].id + ".json"), old = JSON.parse(await fs.readFile(file)); delete old.processObservation;
  await fs.writeFile(file, JSON.stringify(old)); assert.equal(f.makeAdapter().readProcessObservation(f.requests[0], receipt.result), undefined);
});
test("observation cannot be injected without negotiated collection status", async t => {
  const f = await fixture(t), receipt = structuredClone(await f.execute()); delete receipt.processObservationStatus;
  assert.throws(() => f.evidence(receipt), {code: "MATERIAL_INVALID"});
});
test("restored observation with substituted receipt digest fails correlation", async t => {
  const f = await fixture(t), receipt = await f.execute();
  assert.throws(() => assertAgentProcessObservation(receipt.processObservation, f.requests[0], {...receipt.result, receiptDigest: d("foreign")}, f.profile));
});
test("Runtime cached receipt revalidates stored observation before replay without invoking the adapter", async t => {
  const f = await fixture(t); await f.execute();
  const file = path.join(f.configuration.dataRoot, "project-semantic-bindings/dispatch-results", d(f.key).slice(7) + ".json");
  const doc = JSON.parse(await fs.readFile(file)); doc.value.processObservation.material.exitCode = 9;
  const {recordDigest, ...content} = doc; await fs.writeFile(file, JSON.stringify({...content, recordDigest: d(content)}));
  await assert.rejects(f.execute()); assert.equal(f.calls(), 1);
});
for (const mode of ["symlink", "hardlink", "oversized"]) test(`adapter receipt ${mode} is refused`, async t => {
  const f = await fixture(t), receipt = await f.execute(), file = path.join(f.receipts, f.requests[0].id + ".json");
  const backup = file + ".fixture"; await fs.rename(file, backup);
  if (mode === "symlink") await fs.symlink(backup, file);
  else if (mode === "hardlink") await fs.link(backup, file);
  else await fs.writeFile(file, " ".repeat(65537));
  assert.throws(() => f.makeAdapter().readProcessObservation(f.requests[0], receipt.result)); assert.equal(f.calls(), 1);
});
test("native receipt store cannot be placed in the Agent workspace; no process is launched", async t => {
  const f = await fixture(t), workspaceRoot = path.join(f.root, "native-no-run"); await fs.mkdir(workspaceRoot);
  const profile = createOpenCodeRuntimeProfile({runtimeVersion: "synthetic-no-run", host: "local", provider: "test", model: "test", capabilities: ["goal-loop.execute"], workspaceRoot});
  assert.throws(() => createOpenCodeExecutorAdapter({profile, receiptStoreDir: path.join(workspaceRoot, "receipts")}), /STORE_INSIDE_AGENT_WORKSPACE/);
  assert.equal(f.calls(), 0);
});
