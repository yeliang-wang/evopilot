import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createServer } from "../../packages/server/dist/index.js";

test("production first run stays setup-only until explicit live-preflight workspace binding", async () => {
  const rawCredential = "test-provider-secret-never-return-this";
  let providerCalls = 0;
  const provider = http.createServer(async (request, response) => {
    providerCalls += 1;
    assert.equal(request.url, "/v1/chat/completions");
    assert.equal(request.headers.authorization, `Bearer ${rawCredential}`);
    for await (const _chunk of request) void _chunk;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      id: "preflight-1",
      model: "test-model",
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 }
    }));
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const providerAddress = provider.address();
  const providerBaseUrl = `http://127.0.0.1:${providerAddress.port}/v1`;

  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-v62-readiness-"));
  const server = createServer({
    dataRoot,
    runtimeMode: "prod",
    tokens: [
      { name: "admin", token: "admin-token", role: "admin" },
      { name: "viewer", token: "viewer-token", role: "viewer" }
    ]
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const initial = await requestJson(`${baseUrl}/api/v1/runtime-readiness`, { token: "viewer-token" });
    assert.equal(initial.status, 200);
    assert.equal(initial.body.data.state, "SETUP_REQUIRED");
    const blocked = await requestJson(`${baseUrl}/api/v1/summary`, { token: "viewer-token" });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error, "LLM_PROFILE_REQUIRED");
    const processReady = await requestJson(`${baseUrl}/ready`);
    assert.equal(processReady.status, 200);
    assert.equal(processReady.body.status, "READY");
    assert.equal(processReady.body.runtimeReadiness, "SETUP_REQUIRED");
    assert.equal(processReady.body.normalOperationsReady, false);

    const providers = await requestJson(`${baseUrl}/api/v1/llm-providers`, { token: "viewer-token" });
    assert.equal(providers.body.data.defaultProvider, null);
    assert.equal(providers.body.data.selectionRequired, true);

    const secret = await requestJson(`${baseUrl}/api/v1/secrets`, {
      method: "POST",
      token: "admin-token",
      body: { id: "runtime-llm-secret", name: "Runtime LLM", kind: "llm-api-key", scope: "workspace", value: rawCredential }
    });
    assert.equal(secret.status, 201);
    assert.doesNotMatch(JSON.stringify(secret.body), new RegExp(rawCredential));

    const profile = await requestJson(`${baseUrl}/api/v1/llm-profiles`, {
      method: "POST",
      token: "admin-token",
      body: {
        id: "runtime-default",
        name: "Runtime Default",
        scope: "workspace",
        providerPreset: "custom",
        provider: "openai-compatible",
        providerName: "selected-provider",
        baseUrl: providerBaseUrl,
        modelName: "test-model",
        apiKeyRef: "runtime-llm-secret",
        maxRetries: 1,
        thinkingType: "disabled"
      }
    });
    assert.equal(profile.status, 201);
    assert.equal(profile.body.data.apiKeyRef, "runtime-llm-secret");

    const preflight = await requestJson(`${baseUrl}/api/v1/llm-profiles/runtime-default/preflight`, { method: "POST", token: "admin-token", body: {} });
    assert.equal(preflight.status, 200);
    assert.equal(preflight.body.data.status, "READY");
    assert.equal(providerCalls, 1);

    const bind = await requestJson(`${baseUrl}/api/v1/runtime-readiness/workspace-default`, {
      method: "POST",
      token: "admin-token",
      body: { profileId: "runtime-default", reason: "Administrator selected and reviewed this provider and model." }
    });
    assert.equal(bind.status, 200);
    assert.equal(bind.body.data.readiness.state, "READY");

    const normal = await requestJson(`${baseUrl}/api/v1/summary`, { token: "viewer-token" });
    assert.equal(normal.status, 200);
    const ready = await requestJson(`${baseUrl}/ready`);
    assert.equal(ready.body.runtimeReadiness, "READY");
    assert.equal(ready.body.normalOperationsReady, true);

    const revoked = await requestJson(`${baseUrl}/api/v1/secrets/runtime-llm-secret/revoke`, { method: "POST", token: "admin-token", body: {} });
    assert.equal(revoked.status, 200);
    const degraded = await requestJson(`${baseUrl}/api/v1/runtime-readiness`, { token: "viewer-token" });
    assert.equal(degraded.body.data.state, "LLM_BLOCKED");
    assert.equal((await requestJson(`${baseUrl}/api/v1/summary`, { token: "viewer-token" })).status, 409);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => provider.close(resolve));
  }
});

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined ? { "content-type": "application/json" } : {})
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}
