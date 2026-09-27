import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fork, spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { executeExpertTurn, planExpertTurn } from "../../packages/evolution-expert/dist/index.js";

const value = "SYNTHETIC-bootstrap-input-not-a-real-key";
const env = { PATH: process.env.PATH, TMPDIR: os.tmpdir(), EVOPILOT_LOG_LEVEL: "error" };

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-bootstrap-"));
  const state = { calls: 0, status: 200, pause: undefined, release: undefined };
  const provider = http.createServer(async (request, response) => {
    state.calls++;
    assert.equal(request.headers.authorization, `Bearer ${value}`);
    for await (const chunk of request) void chunk;
    if (state.pause) { state.pause(); await new Promise(resolve => { state.release = resolve; }); }
    response.writeHead(state.status, { "content-type": "application/json" });
    response.end(JSON.stringify(state.status === 200 ? {
      id: "fixture", model: "synthetic-model", choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 }
    } : { error: { message: "Synthetic rejection", code: "synthetic-rejection" } }));
  });
  await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve));
  let child, base, logs = "";
  async function start() {
    child = fork(path.resolve("tests/fixtures/llm-bootstrap-runtime.mjs"), [root], {
      env: { ...env, EVOPILOT_LLM_API_KEY: "SYNTHETIC-ignored-env", EVOPILOT_LLM_MODEL_NAME: "ignored-env-model" },
      stdio: ["ignore", "pipe", "pipe", "ipc"]
    });
    child.stdout.on("data", data => { logs += data; }); child.stderr.on("data", data => { logs += data; });
    const ready = await Promise.race([once(child, "message"), once(child, "exit").then(() => { throw Error("Fixture Runtime exited before ready"); })]);
    base = `http://127.0.0.1:${ready[0].port}`;
  }
  async function stop() { const exit = once(child, "exit"); child.send("stop"); await exit; }
  await start();
  t.after(async () => {
    state.release?.();
    await stop(); await new Promise(resolve => provider.close(resolve));
    assert(!logs.includes(value));
    fs.rmSync(root, { recursive: true, force: true });
  });
  async function request(route, body, actor = "admin") {
    const response = await fetch(base + route, { method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer synthetic-${actor}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); assert(!text.includes(value));
    return { status: response.status, body: JSON.parse(text) };
  }
  const candidate = () => ({ providerName: "synthetic-provider", baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, modelName: "synthetic-model", value });
  const body = () => ({ source: "explicit-headless", optIn: true, profileId: "bootstrap", secretId: "bootstrap-key", reason: "Explicit fixture authorization", candidates: [candidate()] });
  async function cli(args, input = "") {
    const proc = spawn(process.execPath, [path.resolve("packages/cli/dist/index.js"), ...args, "--server", base,
      "--config", path.join(root, "unused-cli-config.json"), "--json"], {
      env: { ...env, EVOPILOT_API_TOKEN: "synthetic-admin" }, stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "", stderr = "";
    proc.stdout.on("data", data => { stdout += data; }); proc.stderr.on("data", data => { stderr += data; });
    proc.stdin.on("error", () => {}); proc.stdin.end(input);
    const [status] = await once(proc, "exit");
    assert(!stdout.includes(value)); assert(!stderr.includes(value));
    return { status, stdout, stderr, data: stdout.trim() ? JSON.parse(stdout) : undefined };
  }
  function snapshot() {
    return Object.fromEntries(["secrets", "llm-profiles", "workspace-llm-default-bindings"].map(dir => [dir,
      fs.readdirSync(path.join(root, dir)).sort().map(name => [name, fs.readFileSync(path.join(root, dir, name), "utf8")])
    ]));
  }
  return { root, state, request, body, candidate, cli, snapshot, get base() { return base; }, restart: async () => { await stop(); await start(); } };
}

const args = command => ["llm", command, "--opt-in", "--input-stdin", "--profile", "bootstrap", "--secret-id", "bootstrap-key", "--reason", "Reviewed fixture initialization"];

test("Expert migration guidance traverses local stdio MCP to Runtime metadata without provisioning", async t => {
  const f = await fixture(t), before = f.snapshot();
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve("packages/adapter-mcp/dist/stdio.js")],
    env: { ...env, EVOPILOT_SERVER: f.base, EVOPILOT_API_TOKEN: "synthetic-viewer" }, stderr: "pipe" });
  const client = new Client({ name: "synthetic-bootstrap-guidance", version: "1.0.0" });
  try {
    await client.connect(transport);
    const plan = planExpertTurn("Explain LLM migration and headless bootstrap");
    assert.equal(plan.operation.tool, "evopilot_llm_setup_protocol");
    const output = await executeExpertTurn(plan, { invoke: (name, args) => client.callTool({ name, arguments: args }) });
    assert.equal(output.isError, false);
    const text = JSON.stringify(output);
    assert.match(text, /ADMIN_EXPLICIT_OPT_IN/); assert.match(text, /ambiguous-input/);
    assert.match(text, /EXPERT_OVER_MCP_ONLY/); assert.match(text, /inputCleanup/);
    assert(!text.includes(value));
    assert.deepEqual(f.snapshot(), before); assert.equal(f.state.calls, 0);
  } finally { await client.close(); }
});

test("bootstrap preview and refusal are non-mutating and never discover environment defaults", async t => {
  const f = await fixture(t), before = f.snapshot();
  assert.equal((await f.request("/api/v1/runtime-readiness")).body.data.state, "SETUP_REQUIRED");
  const preview = await f.cli(["llm", "bootstrap", "--preview"]);
  assert.equal(preview.status, 0); assert.equal(preview.data.optInRequired, true);
  assert.equal((await f.cli(["llm", "bootstrap", "--input-stdin"], JSON.stringify(f.candidate()))).status, 64);
  const body = f.body(); delete body.optIn;
  assert.equal((await f.request("/api/v1/runtime-readiness/bootstrap", body)).body.error, "LLM_BOOTSTRAP_OPT_IN_REQUIRED");
  assert.deepEqual(f.snapshot(), before); assert.equal(f.state.calls, 0);
});

test("bootstrap rejects malformed, oversized and argv secret input without leaking it", async t => {
  const f = await fixture(t), before = f.snapshot();
  for (const input of [value, "", "x".repeat(65537)]) {
    const result = await f.cli(args("bootstrap"), input);
    assert.equal(result.status, 64, JSON.stringify(result));
  }
  assert.equal((await f.cli([...args("bootstrap"), "--value", value], JSON.stringify(f.candidate()))).status, 64);
  assert.deepEqual(f.snapshot(), before); assert.equal(f.state.calls, 0);
});

for (const actor of ["viewer", "operator"]) test(`bootstrap refuses ${actor} before provisioning or provider calls`, async t => {
  const f = await fixture(t), before = f.snapshot();
  assert.equal((await f.request("/api/v1/runtime-readiness/bootstrap", f.body(), actor)).status, 403);
  assert.deepEqual(f.snapshot(), before); assert.equal(f.state.calls, 0);
});

test("explicit legacy migration rejects zero or multiple candidates without guessing", async t => {
  const f = await fixture(t), before = f.snapshot();
  for (const candidates of [[], [f.candidate(), f.candidate()]]) {
    const result = await f.cli(args("migrate-v61"), JSON.stringify(candidates));
    assert.equal(result.status, 2); assert.equal(result.data.error, "LLM_BOOTSTRAP_AMBIGUOUS");
  }
  assert.deepEqual(f.snapshot(), before); assert.equal(f.state.calls, 0);
});

for (const command of ["bootstrap", "migrate-v61"]) test(`${command} provisions governed resources once and survives actual Runtime process restart`, async t => {
  const f = await fixture(t);
  const result = await f.cli(args(command), JSON.stringify(f.candidate()));
  assert.equal(result.status, 0, JSON.stringify(result)); assert.equal(result.data.status, "COMPLETED");
  assert.equal(result.data.source, command === "bootstrap" ? "explicit-headless" : "explicit-v61");
  assert.equal(result.data.readiness.state, "READY");
  assert.equal(result.data.binding.secretRef, "bootstrap-key");
  assert.equal(result.data.binding.profileDigest, result.data.profileDigest);
  const snapshot = f.snapshot();
  for (const rows of Object.values(snapshot)) assert.equal(rows.length, 1);
  assert(!JSON.stringify(snapshot).includes(value));
  assert.equal(fs.existsSync(path.join(f.root, "unused-cli-config.json")), false);
  assert.equal(f.state.calls, 1);
  const replay = await f.cli(args(command), JSON.stringify(f.candidate()));
  assert.equal(replay.status, 2); assert.equal(replay.data.error, "LLM_BOOTSTRAP_ALREADY_CONFIGURED");
  await f.restart();
  assert.deepEqual(f.snapshot(), snapshot);
  assert.equal((await f.request("/api/v1/runtime-readiness")).body.data.state, "READY");
  assert.deepEqual((await f.request("/api/v1/runtime-readiness/workspace-default")).body.data, result.data.binding);
  assert.equal(f.state.calls, 1);
  const audit = fs.readFileSync(path.join(f.root, "audit/audit.jsonl"), "utf8");
  assert(!audit.includes(value));
  const events = audit.trim().split("\n").map(JSON.parse);
  assert.equal(events.filter(event => event.action === "runtime-readiness.bootstrap-completed").length, 1);
});

test("failed bootstrap preserves repairable resources but never binds, replays or falls back", async t => {
  const f = await fixture(t); f.state.status = 401;
  const failed = await f.cli(args("bootstrap"), JSON.stringify(f.candidate()));
  assert.equal(failed.status, 2); assert.equal(failed.data.status, "BLOCKED", JSON.stringify(failed));
  assert.equal((await f.request("/api/v1/runtime-readiness/workspace-default")).status, 404);
  assert.equal(f.state.calls, 1);
  const before = f.snapshot();
  assert.equal((await f.cli(args("bootstrap"), JSON.stringify(f.candidate()))).data.error, "LLM_BOOTSTRAP_ALREADY_CONFIGURED");
  assert.deepEqual(f.snapshot(), before); assert.equal(f.state.calls, 1);
  f.state.status = 200;
  assert.equal((await f.request("/api/v1/llm-profiles/bootstrap/preflight", {})).status, 200);
  assert.equal((await f.request("/api/v1/runtime-readiness/workspace-default", { profileId: "bootstrap", reason: "Explicit repair after inspection" })).status, 200);
  assert.equal((await f.request("/api/v1/runtime-readiness")).body.data.state, "READY");
});

test("bootstrap refuses concurrent profile edits instead of replacing them with stale preflight", async t => {
  const f = await fixture(t);
  let entered; const paused = new Promise(resolve => { entered = resolve; }); f.state.pause = entered;
  const pending = f.request("/api/v1/runtime-readiness/bootstrap", f.body());
  await paused;
  const changed = await f.request("/api/v1/llm-profiles", { id: "bootstrap", modelName: "explicit-new-model" });
  assert.equal(changed.status, 200);
  f.state.release();
  const result = await pending;
  assert.equal(result.status, 409); assert.equal(result.body.error, "LLM_BOOTSTRAP_RESOURCE_DRIFT");
  assert.equal((await f.request("/api/v1/llm-profiles/bootstrap")).body.data.modelName, "explicit-new-model");
  assert.equal((await f.request("/api/v1/runtime-readiness/workspace-default")).status, 404);
});

test("bootstrap refuses concurrent Secret rotation without restoring old credentials", async t => {
  const f = await fixture(t);
  let entered; const paused = new Promise(resolve => { entered = resolve; }); f.state.pause = entered;
  const pending = f.request("/api/v1/runtime-readiness/bootstrap", f.body());
  await paused;
  assert.equal((await f.request("/api/v1/secrets", { id: "bootstrap-key", scope: "workspace", kind: "llm-api-key", value })).status, 200);
  const afterRotation = f.snapshot().secrets;
  f.state.release();
  assert.equal((await pending).body.error, "LLM_BOOTSTRAP_RESOURCE_DRIFT");
  assert.deepEqual(f.snapshot().secrets, afterRotation);
  assert.equal((await f.request("/api/v1/runtime-readiness/workspace-default")).status, 404);
});

test("bootstrap cannot override request tenant or workspace and refuses existing global resource ids", async t => {
  const f = await fixture(t), body = f.body();
  const secret = await f.request("/api/v1/secrets", { id: "bootstrap-key", scope: "workspace", kind: "llm-api-key", value });
  assert.equal(secret.status, 201);
  // A valid persisted record owned by another workspace is an out-of-scope collision.
  const file = path.join(f.root, "secrets/bootstrap-key.json");
  const stored = JSON.parse(fs.readFileSync(file));
  stored.workspaceId = "other-workspace";
  fs.writeFileSync(file, JSON.stringify(stored));
  const before = f.snapshot();
  assert.equal((await f.request("/api/v1/runtime-readiness/bootstrap", body)).body.error, "LLM_BOOTSTRAP_ALREADY_CONFIGURED");
  assert.deepEqual(f.snapshot(), before); assert.equal(f.state.calls, 0);
  body.secretId = "new-key"; body.tenantId = "foreign-tenant"; body.workspaceId = "foreign-workspace";
  const result = await f.request("/api/v1/runtime-readiness/bootstrap", body);
  assert.equal(result.status, 201);
  assert.notEqual(result.body.data.binding.tenantId, body.tenantId);
  assert.notEqual(result.body.data.binding.workspaceId, body.workspaceId);
  assert.deepEqual(f.snapshot().secrets.find(([name]) => name === "bootstrap-key.json"), before.secrets[0]);
});

test("ordinary preflight also refuses edits made while its provider call was in flight", async t => {
  const f = await fixture(t);
  assert.equal((await f.cli(args("bootstrap"), JSON.stringify(f.candidate()))).status, 0);
  let entered; const paused = new Promise(resolve => { entered = resolve; }); f.state.pause = entered;
  const pending = f.request("/api/v1/llm-profiles/bootstrap/preflight", {});
  await paused;
  assert.equal((await f.request("/api/v1/llm-profiles", { id: "bootstrap", modelName: "changed-during-probe" })).status, 200);
  f.state.release();
  const result = await pending;
  assert.equal(result.status, 409); assert.equal(result.body.error, "LLM_PREFLIGHT_RESOURCE_DRIFT");
  const profile = (await f.request("/api/v1/llm-profiles/bootstrap")).body.data;
  assert.equal(profile.modelName, "changed-during-probe"); assert.equal(profile.lastPreflight, undefined);
});

test("invalid endpoint and resource identifiers stop before secret persistence", async t => {
  const f = await fixture(t), before = f.snapshot();
  for (const baseUrl of ["file:///tmp/config", "https://name:password@example.com/v1", "https://example.com/v1?key=hidden"]) {
    const body = f.body(); body.candidates[0].baseUrl = baseUrl;
    assert.equal((await f.request("/api/v1/runtime-readiness/bootstrap", body)).body.error, "LLM_BOOTSTRAP_ENDPOINT_INVALID");
  }
  const body = f.body(); body.secretId = "../collision";
  assert.equal((await f.request("/api/v1/runtime-readiness/bootstrap", body)).body.error, "LLM_BOOTSTRAP_INPUT_REQUIRED");
  assert.deepEqual(f.snapshot(), before); assert.equal(f.state.calls, 0);
});

for (const mutation of ["profile", "secret"]) test(`${mutation} changes invalidate bootstrap preflight until explicitly repaired`, async t => {
  const f = await fixture(t);
  assert.equal((await f.cli(args("bootstrap"), JSON.stringify(f.candidate()))).status, 0);
  const originalBinding = (await f.request("/api/v1/runtime-readiness/workspace-default")).body.data;
  const changed = mutation === "profile"
    ? await f.request("/api/v1/llm-profiles", { id: "bootstrap", modelName: "explicit-new-model" })
    : await f.request("/api/v1/secrets", { id: "bootstrap-key", scope: "workspace", kind: "llm-api-key", value });
  assert.equal(changed.status, 200);
  assert.equal((await f.request("/api/v1/runtime-readiness")).body.data.state, "LLM_BLOCKED");
  const rebound = await f.request("/api/v1/runtime-readiness/workspace-default", { profileId: "bootstrap", reason: "Cannot reuse old proof" });
  assert.equal(rebound.status, 409); assert.equal(rebound.body.error, "LLM_LIVE_PREFLIGHT_REQUIRED");
  assert.deepEqual((await f.request("/api/v1/runtime-readiness/workspace-default")).body.data, originalBinding);
  assert.equal(f.state.calls, 1);
  await f.restart();
  assert.equal((await f.request("/api/v1/runtime-readiness")).body.data.state, "LLM_BLOCKED");
  assert.equal((await f.request("/api/v1/llm-profiles/bootstrap/preflight", {})).status, 200);
  assert.equal((await f.request("/api/v1/runtime-readiness/workspace-default", {
    profileId: "bootstrap", expectedBindingDigest: originalBinding.digest, reason: "Explicit fresh repair"
  })).status, 200);
});
