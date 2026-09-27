import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer, llmProfileDigest } from "../../packages/server/dist/index.js";

// Local synthetic HTTP only. These are not installed-package or real-Host E2E.
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-first-run-recovery-"));
  const state = { status: 200, calls: 0 };
  const value = "SYNTHETIC-provider-input-not-a-real-credential";
  const provider = http.createServer(async (request, response) => {
    state.calls++;
    assert.equal(request.url, "/v1/chat/completions");
    assert.equal(request.headers.authorization, `Bearer ${value}`);
    for await (const chunk of request) void chunk;
    response.writeHead(state.status, { "content-type": "application/json" });
    response.end(JSON.stringify(state.status === 200 ? {
      id: "synthetic-preflight", model: "synthetic-model",
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 }
    } : { error: { message: "Synthetic provider rejection", code: `synthetic-${state.status}` } }));
  });
  await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve));
  const server = createServer({ dataRoot: root, runtimeMode: "prod", tokens: [
    { name: "admin", token: "synthetic-admin", role: "admin" },
    { name: "operator", token: "synthetic-operator", role: "operator" },
    { name: "viewer", token: "synthetic-viewer", role: "viewer" }
  ] });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => provider.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, body, actor = "admin") {
    const response = await fetch(base + route, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer synthetic-${actor}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    assert(!text.includes(value), "Runtime response must not expose provider input");
    return { status: response.status, body: JSON.parse(text) };
  }
  async function profile(id, preflight = true) {
    const secret = await request("/api/v1/secrets", { id: `secret-${id}`, name: id, kind: "llm-api-key", scope: "workspace", value });
    assert.equal(secret.status, 201);
    const created = await request("/api/v1/llm-profiles", {
      id, name: id, scope: "workspace", providerPreset: "custom", provider: "openai-compatible",
      providerName: "explicit-synthetic-provider", baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
      modelName: "synthetic-model", apiKeyRef: `secret-${id}`, timeoutSeconds: 2, maxRetries: 0, thinkingType: "disabled"
    });
    assert.equal(created.status, 201);
    if (preflight) assert.equal((await request(`/api/v1/llm-profiles/${id}/preflight`, {})).status, 200);
    return (await request(`/api/v1/llm-profiles/${id}`)).body.data;
  }
  function resources() {
    return Object.fromEntries(["secrets", "llm-profiles", "workspace-llm-default-bindings"].map(dir => [dir,
      fs.readdirSync(path.join(root, dir)).sort().map(name => [name, fs.readFileSync(path.join(root, dir, name), "utf8")])
    ]));
  }
  function audit(action) {
    const file = path.join(root, "audit/audit.jsonl");
    const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    assert(!text.includes(value));
    return text.trim().split("\n").filter(Boolean).map(JSON.parse).filter(record => record.action === action);
  }
  return { root, state, request, profile, resources, audit };
}

async function assertNoMigration(f, body, code, status = 409, actor = "admin") {
  const before = f.resources(), calls = f.state.calls;
  const result = await f.request("/api/v1/runtime-readiness/migrate-v61", body, actor);
  assert.equal(result.status, status);
  assert.equal(result.body.error, code);
  assert.deepEqual(f.resources(), before);
  assert.equal(f.state.calls, calls);
  assert.equal(f.audit("runtime-readiness.v61-migrated").length, 0);
  assert.equal((await f.request("/api/v1/runtime-readiness/workspace-default")).status, 404);
  return result;
}

test("migration with no governed profile stops without importing or creating resources", async t => {
  const f = await fixture(t);
  const result = await assertNoMigration(f, {}, "V61_LLM_MIGRATION_AMBIGUOUS");
  assert.deepEqual(result.body.candidates, []);
  assert.equal((await f.request("/api/v1/runtime-readiness")).body.data.state, "SETUP_REQUIRED");
});

test("migration binds the single explicitly provisioned and preflighted profile", async t => {
  const f = await fixture(t), profile = await f.profile("one");
  const result = await f.request("/api/v1/runtime-readiness/migrate-v61", { reason: "Reviewed synthetic migration" });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.migration, "COMPLETED");
  assert.equal(result.body.data.binding.profileId, "one");
  assert.equal(result.body.data.binding.profileDigest, llmProfileDigest(profile));
  assert.equal(result.body.data.binding.secretRef, "secret-one");
  assert.equal(result.body.data.binding.reason, "Reviewed synthetic migration");
  assert.equal(result.body.data.readiness.state, "READY");
  assert.equal(f.audit("runtime-readiness.v61-migrated").length, 1);
  assert.equal(f.state.calls, 1);
});

test("ambiguous migration reports exact candidates and never chooses a default", async t => {
  const f = await fixture(t), a = await f.profile("a"), b = await f.profile("b");
  const result = await assertNoMigration(f, {}, "V61_LLM_MIGRATION_AMBIGUOUS");
  assert.deepEqual(result.body.candidates.sort((a, b) => a.id.localeCompare(b.id)), [
    { id: "a", digest: llmProfileDigest(a) }, { id: "b", digest: llmProfileDigest(b) }
  ]);
});

test("explicit migration selection resolves ambiguity without changing the other profile", async t => {
  const f = await fixture(t);
  await f.profile("a"); const b = await f.profile("b"), before = f.resources();
  const result = await f.request("/api/v1/runtime-readiness/migrate-v61", { profileId: "b", reason: "User selected exact b" });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.binding.profileId, "b");
  assert.equal(result.body.data.binding.profileDigest, llmProfileDigest(b));
  assert.deepEqual(f.resources().secrets, before.secrets);
  assert.deepEqual(f.resources()["llm-profiles"], before["llm-profiles"]);
  assert.equal(f.audit("runtime-readiness.v61-migrated").length, 1);
  assert.equal(f.state.calls, 2);
});

test("migration cannot turn an unpreflighted profile into READY", async t => {
  const f = await fixture(t); await f.profile("one", false);
  await assertNoMigration(f, { profileId: "one" }, "LLM_LIVE_PREFLIGHT_REQUIRED");
  assert.equal((await f.request("/api/v1/runtime-readiness")).body.data.state, "PREFLIGHT_REQUIRED");
});

test("migration rejects a missing explicit profile without selecting an existing one", async t => {
  const f = await fixture(t); await f.profile("one");
  await assertNoMigration(f, { profileId: "missing" }, "LLM_PROFILE_NOT_FOUND", 404);
});

for (const actor of ["viewer", "operator"]) test(`migration refuses ${actor} before binding or provider access`, async t => {
  const f = await fixture(t); await f.profile("one");
  await assertNoMigration(f, { profileId: "one" }, "FORBIDDEN", 403, actor);
});

test("explicit headless API setup requires preflight and separate administrator binding", async t => {
  const f = await fixture(t);
  const providers = await f.request("/api/v1/llm-providers");
  assert.equal(providers.body.data.selectionRequired, true);
  assert.equal(providers.body.data.defaultProvider, null);
  await f.profile("headless", false);
  const premature = await f.request("/api/v1/runtime-readiness/workspace-default", { profileId: "headless", reason: "explicit setup" });
  assert.equal(premature.status, 409); assert.equal(premature.body.error, "LLM_LIVE_PREFLIGHT_REQUIRED");
  assert.equal((await f.request("/api/v1/llm-profiles/headless/preflight", {})).status, 200);
  assert.equal((await f.request("/api/v1/runtime-readiness")).body.data.state, "PREFLIGHT_REQUIRED");
  assert.equal((await f.request("/api/v1/summary")).status, 409);
  const body = { profileId: "headless", reason: "Explicit administrator confirmation" };
  assert.equal((await f.request("/api/v1/runtime-readiness/workspace-default", body, "operator")).status, 403);
  const bound = await f.request("/api/v1/runtime-readiness/workspace-default", body);
  assert.equal(bound.status, 200); assert.equal(bound.body.data.readiness.state, "READY");
  assert.equal(f.audit("secret.created").length, 1);
  assert.equal(f.audit("llm-profile.created").length, 1);
  assert.equal(f.audit("workspace-llm-default.bound").length, 1);
  assert.equal(f.state.calls, 1);
});

for (const status of [401, 404, 503]) test(`provider ${status} cannot be repaired by reconcile alone or implicit fallback`, async t => {
  const f = await fixture(t); await f.profile("repair");
  const first = await f.request("/api/v1/runtime-readiness/workspace-default", { profileId: "repair", reason: "Initial explicit binding" });
  assert.equal(first.status, 200);
  const binding = first.body.data.binding;
  f.state.status = status;
  const failed = await f.request("/api/v1/llm-profiles/repair/preflight", {});
  assert.equal(failed.status, 409); assert.equal(failed.body.data.status, "BLOCKED");
  assert.equal((await f.request("/api/v1/runtime-readiness")).body.data.state, "LLM_BLOCKED");
  const before = f.state.calls;
  const reconcile = await f.request("/api/v1/runtime-readiness/repair", {}, "operator");
  assert.equal(reconcile.status, 409); assert.equal(reconcile.body.data.state, "LLM_BLOCKED");
  assert.equal(f.state.calls, before);
  assert.deepEqual((await f.request("/api/v1/runtime-readiness/workspace-default")).body.data, binding);
  f.state.status = 200;
  assert.equal((await f.request("/api/v1/llm-profiles/repair/preflight", {})).status, 200);
  // A new preflight proof cannot silently replace the proof pinned by the old binding.
  assert.equal((await f.request("/api/v1/runtime-readiness")).body.data.state, "LLM_BLOCKED");
  const current = (await f.request("/api/v1/llm-profiles/repair")).body.data;
  const rebound = await f.request("/api/v1/runtime-readiness/workspace-default", {
    profileId: "repair", reason: "Explicit repaired provider approval",
    expectedBindingDigest: binding.digest, expectedProfileDigest: llmProfileDigest(current)
  });
  assert.equal(rebound.status, 200);
  assert.equal(rebound.body.data.binding.previousBindingDigest, binding.digest);
  assert.equal(rebound.body.data.binding.revision, binding.revision + 1);
  assert.equal(rebound.body.data.readiness.state, "READY");
  assert.equal((await f.request("/api/v1/summary")).status, 200);
  assert.equal(f.audit("workspace-llm-default.bound").length, 2);
  assert.equal(f.audit("secret.created").length, 1);
  assert.equal(f.audit("llm-profile.created").length, 1);
});
