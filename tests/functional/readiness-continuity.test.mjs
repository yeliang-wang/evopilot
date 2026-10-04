import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer, LLM_READINESS_FRESHNESS_MS, llmProfileDigest } from "../../packages/server/dist/index.js";
import { resolveLoopLlmSelection } from "../../packages/server/dist/application/control-plane-services.js";
import { FileStore } from "../../packages/server/dist/storage/file-store/index.js";

// Regression only: synthetic loopback provider and virtual Date. No real model,
// installed-product acceptance, Host acceptance or business Goal completion claim.
async function fixture(t, { bind = true } = {}) {
  const startedAt = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now: startedAt });
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-readiness-continuity-"));
  const secretValue = "SYNTHETIC-readiness-continuity-secret";
  const state = { providerCalls: 0 };
  const provider = http.createServer(async (request, response) => {
    state.providerCalls += 1;
    assert.equal(request.url, "/v1/chat/completions");
    assert.equal(request.headers.authorization, `Bearer ${secretValue}`);
    for await (const chunk of request) void chunk;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      id: "synthetic-explicit-preflight", model: "synthetic-continuity-model",
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 }
    }));
  });
  await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve));
  const options = { dataRoot, runtimeMode: "prod", tokens: [
    { name: "admin", token: "synthetic-continuity-admin", role: "admin" },
    { name: "viewer", token: "synthetic-continuity-viewer", role: "viewer" }
  ] };
  let server;
  let baseUrl;
  async function start() {
    server = createServer(options);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
  }
  t.after(async () => {
    await stop();
    await new Promise(resolve => provider.close(resolve));
    fs.rmSync(dataRoot, { recursive: true, force: true });
  });
  await start();
  async function request(route, body, actor = "admin") {
    const response = await fetch(baseUrl + route, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer synthetic-continuity-${actor}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    assert(!text.includes(secretValue), "Responses must not expose the synthetic secret");
    return { status: response.status, body: JSON.parse(text) };
  }
  assert.equal((await request("/api/v1/secrets", {
    id: "continuity-key", kind: "llm-api-key", scope: "workspace", value: secretValue
  })).status, 201);
  assert.equal((await request("/api/v1/llm-profiles", {
    id: "continuity-profile", name: "Synthetic continuity profile", scope: "workspace",
    providerPreset: "custom", provider: "openai-compatible", providerName: "synthetic-provider",
    baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, modelName: "synthetic-continuity-model",
    apiKeyRef: "continuity-key", timeoutSeconds: 2, maxRetries: 0, thinkingType: "disabled"
  })).status, 201);
  const preflight = await request("/api/v1/llm-profiles/continuity-profile/preflight", {});
  assert.equal(preflight.status, 200);
  assert.equal(preflight.body.data.status, "READY");
  assert.equal(state.providerCalls, 1, "Exactly one explicitly requested synthetic probe sets up the fixture");
  const profile = (await request("/api/v1/llm-profiles/continuity-profile")).body.data;
  let binding;
  if (bind) {
    const result = await request("/api/v1/runtime-readiness/workspace-default", {
      profileId: profile.id, expectedProfileDigest: llmProfileDigest(profile),
      expectedBindingDigest: null, reason: "Explicit synthetic first-run provider selection"
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.readiness.state, "READY");
    binding = result.body.data.binding;
    assert.equal(binding.schema, "evopilot-workspace-llm-default-binding/v1");
    assert.equal(binding.readiness.checkedAt, preflight.body.data.checkedAt);
    assert.equal(Date.parse(binding.readiness.expiresAt), startedAt + LLM_READINESS_FRESHNESS_MS);
  }
  function resources() {
    return Object.fromEntries(["secrets", "llm-profiles", "workspace-llm-default-bindings"].map(dir => [dir,
      fs.readdirSync(path.join(dataRoot, dir)).sort().map(name =>
        [name, fs.readFileSync(path.join(dataRoot, dir, name), "utf8")])
    ]));
  }
  return { state, profile, binding, request, resources, dataRoot,
    advanceTo: ageMs => t.mock.timers.setTime(startedAt + ageMs),
    restart: async () => { const previous = server; await stop(); await start(); assert.notEqual(server, previous); }
  };
}

async function assertOperationalWithoutProbe(f, expectedResources) {
  const current = await f.request("/api/v1/runtime-readiness", undefined, "viewer");
  assert.equal(current.status, 200);
  assert.equal(current.body.data.state, "READY");
  assert.equal(current.body.data.nextAction, "normal-operation");
  const ready = await f.request("/ready", undefined, "viewer");
  assert.equal(ready.status, 200);
  assert.equal(ready.body.runtimeReadiness, "READY");
  assert.equal(ready.body.normalOperationsReady, true);
  assert.equal((await f.request("/api/v1/summary", undefined, "viewer")).status, 200);
  assert.deepEqual((await f.request("/api/v1/runtime-readiness/workspace-default")).body.data, f.binding);

  // This is the actual common selector used by both Loop and Goal entry paths.
  // Selection is deliberately separate from business execution and consumes no model.
  const store = new FileStore(f.dataRoot);
  for (const [requestedProfileId, project, source] of [
    [undefined, undefined, "workspace-default"],
    [undefined, { llm: { profileId: f.profile.id } }, "project-default"],
    [f.profile.id, { llm: { profileId: "must-not-fall-back" } }, "loop-override"]
  ]) {
    const result = resolveLoopLlmSelection(store, {
      tenantId: f.profile.tenantId, workspaceId: f.profile.workspaceId,
      requestedProfileId, project, requireLlm: true
    });
    assert.equal(result.selection.source, source);
    assert.equal(result.selection.profileId, f.profile.id);
    assert.equal(result.selection.configured, true);
    assert.equal(result.readiness.status, "READY");
  }
  assert.deepEqual(f.resources(), expectedResources, "Time, inspection and selection must not rewrite Profile, Secret or binding");
  assert.equal(f.state.providerCalls, 1, "No implicit provider probe or renewal is allowed");
}

test("persisted v1 workspace binding survives elapsed preflight freshness and restart without implicit probes", async t => {
  const f = await fixture(t);
  const original = f.resources();
  f.advanceTo(LLM_READINESS_FRESHNESS_MS + 1);
  assert(Date.parse(f.binding.readiness.expiresAt) < Date.now(), "The original v1 freshness deadline really elapsed");
  await assertOperationalWithoutProbe(f, original);
  f.advanceTo(7 * 24 * 60 * 60 * 1000);
  await assertOperationalWithoutProbe(f, original);
  await f.restart();
  await assertOperationalWithoutProbe(f, original);

  // Operational continuity does not let the same old proof authorize a new binding.
  const rebound = await f.request("/api/v1/runtime-readiness/workspace-default", {
    profileId: f.profile.id, expectedProfileDigest: llmProfileDigest(f.profile),
    expectedBindingDigest: f.binding.digest, reason: "Synthetic attempted stale reapproval"
  });
  assert.equal(rebound.status, 409);
  assert.equal(rebound.body.error, "LLM_LIVE_PREFLIGHT_REQUIRED");
  await assertOperationalWithoutProbe(f, original);

  // A real governed credential change still blocks this formerly usable binding.
  assert.equal((await f.request("/api/v1/secrets/continuity-key/revoke", {})).status, 200);
  assert.equal((await f.request("/api/v1/runtime-readiness")).body.data.state, "LLM_BLOCKED");
  assert.equal((await f.request("/ready")).body.normalOperationsReady, false);
  assert.equal((await f.request("/api/v1/summary")).status, 409);
  assert.equal(f.state.providerCalls, 1);
});

test("elapsed success without an existing binding cannot make a new workspace operational", async t => {
  const f = await fixture(t, { bind: false });
  const original = f.resources();
  f.advanceTo(LLM_READINESS_FRESHNESS_MS + 1);
  await f.restart();
  const result = await f.request("/api/v1/runtime-readiness/workspace-default", {
    profileId: f.profile.id, expectedProfileDigest: llmProfileDigest(f.profile),
    expectedBindingDigest: null, reason: "Synthetic stale initial binding attempt"
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "LLM_LIVE_PREFLIGHT_REQUIRED");
  assert.equal((await f.request("/api/v1/runtime-readiness/workspace-default")).status, 404);
  assert.equal((await f.request("/api/v1/runtime-readiness")).body.data.state, "PREFLIGHT_REQUIRED");
  assert.equal((await f.request("/ready")).body.normalOperationsReady, false);
  assert.equal((await f.request("/api/v1/summary")).status, 409);
  assert.deepEqual(f.resources(), original);
  assert.equal(f.state.providerCalls, 1, "Rejecting stale first binding must not probe or import a fallback");
});
