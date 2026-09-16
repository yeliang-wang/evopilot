import assert from "node:assert/strict";
import test from "node:test";

import {
  LLM_READINESS_FRESHNESS_MS,
  LlmReadinessError,
  createWorkspaceLlmDefaultBinding,
  llmProfileDigest,
  llmSetupProtocol,
  reconcileRuntimeReadiness
} from "../../packages/server/dist/index.js";
import { resolveLoopLlmSelection } from "../../packages/server/dist/application/control-plane-services.js";

function fixture(now = new Date("2026-09-16T00:00:00.000Z")) {
  const tenantId = "tenant-a";
  const workspaceId = "workspace-a";
  const secret = { id: "secret-a", tenantId, workspaceId, status: "ACTIVE" };
  const profile = {
    schema: "evopilot-llm-profile/v1",
    id: "profile-a",
    tenantId,
    workspaceId,
    scope: "workspace",
    name: "Production model",
    providerPreset: "custom",
    provider: "openai-compatible",
    providerName: "selected-provider",
    baseUrl: "https://provider.invalid/v1",
    modelName: "selected-model",
    apiKeyRef: secret.id,
    status: "ACTIVE",
    timeoutSeconds: 30,
    maxRetries: 1,
    defaultMaxOutputTokens: 1024,
    maxOutputTokens: 2048,
    temperature: 0.2,
    thinkingType: "disabled",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lastPreflight: {
      schema: "evopilot-llm-profile-readiness/v1",
      profileId: "profile-a",
      tenantId,
      workspaceId,
      source: "profile",
      status: "READY",
      provider: "selected-provider",
      model: "selected-model",
      baseUrl: "https://provider.invalid/v1",
      apiKeyRef: secret.id,
      checks: [{ id: "provider-call", status: "PASS", required: true, evidence: ["providerCall=ok"] }],
      blockers: [],
      nextAction: "run-loop",
      checkedAt: now.toISOString()
    }
  };
  const state = { profiles: [], secrets: new Map([[secret.id, secret]]), readiness: undefined, binding: undefined };
  const store = {
    listLlmProfiles: (tenant, workspace) => state.profiles.filter((item) => (!tenant || item.tenantId === tenant) && (!workspace || item.workspaceId === workspace)),
    readLlmProfile: (id) => state.profiles.find((item) => item.id === id),
    readSecret: (id) => state.secrets.get(id),
    readRuntimeReadiness: () => state.readiness,
    writeRuntimeReadiness: (record, expectedDigest) => {
      assert.equal(expectedDigest, state.readiness?.digest);
      state.readiness = record;
      return record;
    },
    readWorkspaceLlmDefaultBinding: () => state.binding,
    writeWorkspaceLlmDefaultBinding: (binding, expectedDigest) => {
      assert.equal(expectedDigest, state.binding?.digest);
      state.binding = binding;
      return binding;
    }
  };
  return { now, tenantId, workspaceId, secret, profile, state, store };
}

test("fresh Runtime starts setup-only and the protocol declares no hidden fallback", () => {
  const f = fixture();
  const readiness = reconcileRuntimeReadiness({ store: f.store, tenantId: f.tenantId, workspaceId: f.workspaceId, actor: "test", now: f.now });
  assert.equal(readiness.state, "SETUP_REQUIRED");
  assert.equal(readiness.nextAction, "configure-secret-ref");
  const protocol = llmSetupProtocol();
  assert.equal(protocol.runtimeVersion, "6.2.0");
  assert.equal(protocol.secureInput.rawSecretAcceptedByExpert, false);
  assert.ok(protocol.forbiddenFallbacks.includes("Agent Host LLM"));
  assert.ok(protocol.forbiddenFallbacks.includes("MyGlm5"));
});

test("only a fresh live-preflight workspace Profile can be explicitly bound", () => {
  const f = fixture();
  f.state.profiles.push(f.profile);
  assert.equal(reconcileRuntimeReadiness({ store: f.store, tenantId: f.tenantId, workspaceId: f.workspaceId, actor: "test", now: f.now }).state, "PREFLIGHT_REQUIRED");
  const binding = createWorkspaceLlmDefaultBinding({
    store: f.store,
    tenantId: f.tenantId,
    workspaceId: f.workspaceId,
    profileId: f.profile.id,
    expectedProfileDigest: llmProfileDigest(f.profile),
    actor: "admin",
    reason: "Reviewed provider and model selection.",
    now: f.now
  });
  assert.equal(binding.profileDigest, llmProfileDigest(f.profile));
  assert.equal(binding.secretRef, f.secret.id);
  assert.equal(reconcileRuntimeReadiness({ store: f.store, tenantId: f.tenantId, workspaceId: f.workspaceId, actor: "test", now: f.now }).state, "READY");
});

test("readiness inspection is stable across readers and event-specific reasons", () => {
  const f = fixture();
  const first = reconcileRuntimeReadiness({
    store: f.store,
    tenantId: f.tenantId,
    workspaceId: f.workspaceId,
    actor: "admin-a",
    reason: "request-specific context must not become aggregate truth",
    now: f.now
  });
  const second = reconcileRuntimeReadiness({
    store: f.store,
    tenantId: f.tenantId,
    workspaceId: f.workspaceId,
    actor: "viewer-b",
    reason: "different request-specific context",
    now: new Date(f.now.getTime() + 1_000)
  });
  assert.equal(second.digest, first.digest);
  assert.equal(second.revision, first.revision);
  assert.equal(second.actor, "admin-a");
});

test("selection never falls back to environment or an implicit global model", () => {
  const f = fixture();
  const previous = {
    provider: process.env.EVOPILOT_LLM_PROVIDER_NAME,
    model: process.env.EVOPILOT_LLM_MODEL_NAME,
    key: process.env.EVOPILOT_LLM_API_KEY
  };
  process.env.EVOPILOT_LLM_PROVIDER_NAME = "forbidden-environment-provider";
  process.env.EVOPILOT_LLM_MODEL_NAME = "forbidden-environment-model";
  process.env.EVOPILOT_LLM_API_KEY = "forbidden-environment-key";
  try {
    const result = resolveLoopLlmSelection(f.store, {
      tenantId: f.tenantId,
      workspaceId: f.workspaceId,
      requireLlm: true
    });
    assert.equal(result.selection.source, "none");
    assert.equal(result.selection.configured, false);
    assert.equal(result.readiness.status, "BLOCKED");
    assert.deepEqual(result.readiness.provider, undefined);
    assert.deepEqual(result.readiness.model, undefined);
  } finally {
    restoreEnv("EVOPILOT_LLM_PROVIDER_NAME", previous.provider);
    restoreEnv("EVOPILOT_LLM_MODEL_NAME", previous.model);
    restoreEnv("EVOPILOT_LLM_API_KEY", previous.key);
  }
});

test("profile drift, SecretRef revocation, and stale proof fail closed", () => {
  const f = fixture();
  f.state.profiles.push(f.profile);
  createWorkspaceLlmDefaultBinding({ store: f.store, tenantId: f.tenantId, workspaceId: f.workspaceId, profileId: f.profile.id, actor: "admin", reason: "bind", now: f.now });

  f.profile.modelName = "drifted-model";
  assert.equal(reconcileRuntimeReadiness({ store: f.store, tenantId: f.tenantId, workspaceId: f.workspaceId, actor: "test", now: f.now }).state, "LLM_BLOCKED");
  f.profile.modelName = "selected-model";
  f.secret.status = "REVOKED";
  assert.equal(reconcileRuntimeReadiness({ store: f.store, tenantId: f.tenantId, workspaceId: f.workspaceId, actor: "test", now: f.now }).state, "LLM_BLOCKED");
  f.secret.status = "ACTIVE";
  assert.equal(reconcileRuntimeReadiness({ store: f.store, tenantId: f.tenantId, workspaceId: f.workspaceId, actor: "test", now: new Date(f.now.getTime() + LLM_READINESS_FRESHNESS_MS + 1) }).state, "LLM_BLOCKED");
});

test("cross-scope, non-workspace, and stale Profiles cannot be bound", () => {
  const f = fixture();
  f.state.profiles.push({ ...f.profile, tenantId: "tenant-b" });
  assert.throws(() => createWorkspaceLlmDefaultBinding({ store: f.store, tenantId: f.tenantId, workspaceId: f.workspaceId, profileId: f.profile.id, actor: "admin", reason: "bind", now: f.now }), (error) => error instanceof LlmReadinessError && error.code === "LLM_PROFILE_NOT_BINDABLE");
  f.state.profiles[0] = { ...f.profile, scope: "user" };
  assert.throws(() => createWorkspaceLlmDefaultBinding({ store: f.store, tenantId: f.tenantId, workspaceId: f.workspaceId, profileId: f.profile.id, actor: "admin", reason: "bind", now: f.now }), /LLM_PROFILE_NOT_BINDABLE/);
  f.state.profiles[0] = { ...f.profile, lastPreflight: { ...f.profile.lastPreflight, checkedAt: new Date(f.now.getTime() - LLM_READINESS_FRESHNESS_MS - 1).toISOString() } };
  assert.throws(() => createWorkspaceLlmDefaultBinding({ store: f.store, tenantId: f.tenantId, workspaceId: f.workspaceId, profileId: f.profile.id, actor: "admin", reason: "bind", now: f.now }), /LLM_LIVE_PREFLIGHT_REQUIRED/);
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
