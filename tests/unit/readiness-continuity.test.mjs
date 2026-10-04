import assert from "node:assert/strict";
import test from "node:test";
import { LLM_READINESS_FRESHNESS_MS, createWorkspaceLlmDefaultBinding, llmProfileDigest, reconcileRuntimeReadiness } from "../../packages/server/dist/domains/llm-readiness/index.js";
import { encryptSecretValue, resolveLoopLlmSelection } from "../../packages/server/dist/application/control-plane-services.js";

// Synthetic in-memory regression only; no provider calls or real acceptance evidence.
function fixture() {
  const now = new Date("2026-09-16T00:00:00.000Z");
  const scope = { tenantId: "tenant-a", workspaceId: "workspace-a" };
  const secret = { id: "secret-a", ...scope, status: "ACTIVE" };
  const profile = {
    schema: "evopilot-llm-profile/v1", id: "profile-a", ...scope,
    scope: "workspace", name: "Synthetic model", providerPreset: "custom",
    provider: "openai-compatible", providerName: "synthetic-provider",
    baseUrl: "https://provider.invalid/v1", modelName: "synthetic-model",
    apiKeyRef: secret.id, status: "ACTIVE", timeoutSeconds: 30, maxRetries: 1,
    defaultMaxOutputTokens: 1024, maxOutputTokens: 2048, temperature: 0.2,
    thinkingType: "disabled", createdAt: now.toISOString(), updatedAt: now.toISOString(),
    lastPreflight: {
      schema: "evopilot-llm-profile-readiness/v1", profileId: "profile-a", ...scope,
      source: "profile", status: "READY", provider: "synthetic-provider", model: "synthetic-model",
      baseUrl: "https://provider.invalid/v1", apiKeyRef: secret.id,
      checks: [{ id: "provider-call", status: "PASS", required: true, evidence: ["providerCall=ok"] }],
      blockers: [], nextAction: "run-loop", checkedAt: now.toISOString()
    }
  };
  const state = { profiles: [profile], secrets: new Map([[secret.id, secret]]),
    binding: undefined, readiness: undefined, writes: { binding: 0, readiness: 0 } };
  const store = {
    listLlmProfiles: (tenant, workspace) => state.profiles.filter(p => p.tenantId === tenant && p.workspaceId === workspace),
    readLlmProfile: id => state.profiles.find(p => p.id === id),
    readSecret: id => state.secrets.get(id),
    readRuntimeReadiness: () => state.readiness,
    readWorkspaceLlmDefaultBinding: () => state.binding,
    writeRuntimeReadiness: (record, expected) => {
      assert.equal(expected, state.readiness?.digest);
      state.writes.readiness += 1;
      return state.readiness = record;
    },
    writeWorkspaceLlmDefaultBinding: (record, expected) => {
      assert.equal(expected, state.binding?.digest);
      state.writes.binding += 1;
      return state.binding = record;
    }
  };
  return { now, scope, secret, profile, state, store };
}
function bind(f, now = f.now, overrides = {}) {
  return createWorkspaceLlmDefaultBinding({ store: f.store, ...f.scope, profileId: f.profile.id,
    expectedProfileDigest: llmProfileDigest(f.profile), expectedBindingDigest: f.state.binding?.digest ?? "",
    actor: "admin", reason: "Explicit synthetic selection", now, ...overrides });
}
function inspect(f, now = f.now) {
  return reconcileRuntimeReadiness({ store: f.store, ...f.scope, actor: "reader", now });
}
function select(f, overrides = {}) {
  return resolveLoopLlmSelection(f.store, { ...f.scope, requireLlm: true, ...overrides });
}
function selectionFixture(t) {
  const f = fixture();
  t.mock.timers.enable({ apis: ["Date"], now: f.now.getTime() + 7 * 86400000 });
  t.mock.method(globalThis, "fetch", () => { assert.fail("No implicit provider call allowed"); });
  const previousEnv = process.env;
  process.env = { EVOPILOT_SECRET_MASTER_KEY: "synthetic-unit-test-master-key" };
  t.after(() => { process.env = previousEnv; });
  f.secret.encryption = encryptSecretValue("synthetic-unit-test-secret");
  bind(f);
  return f;
}

test("unchanged v1 binding stays READY at 900000, 900001ms and seven days without writes or probes", t => {
  t.mock.method(globalThis, "fetch", () => { assert.fail("No implicit provider call allowed"); });
  const f = fixture();
  assert.equal(LLM_READINESS_FRESHNESS_MS, 900000);
  const binding = bind(f);
  assert.equal(binding.schema, "evopilot-workspace-llm-default-binding/v1");
  assert.equal(Date.parse(binding.readiness.expiresAt), f.now.getTime() + 900000);
  const first = inspect(f);
  const snapshot = structuredClone(f.state);
  for (const age of [900000, 900001, 7 * 86400000]) {
    for (let reader = 0; reader < 2; reader += 1) {
      assert.strictEqual(inspect(f, new Date(f.now.getTime() + age)), first);
      assert.equal(first.state, "READY");
    }
  }
  assert.deepEqual(f.state.writes, { readiness: 1, binding: 1 });
  assert.deepEqual(f.state, snapshot);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("initial and explicit rebind require fresh successful proof including the exact boundary", () => {
  for (const rebind of [false, true]) {
    for (const invalid of ["stale", "missing", "BLOCKED", "future", "malformed"]) {
      const f = fixture();
      if (rebind) bind(f);
      const previous = f.state.binding;
      if (invalid === "missing") delete f.profile.lastPreflight;
      else if (invalid === "BLOCKED") f.profile.lastPreflight.status = "BLOCKED";
      else f.profile.lastPreflight.checkedAt = invalid === "malformed" ? "not-a-date"
        : new Date(f.now.getTime() + (invalid === "future" ? 1 : -900001)).toISOString();
      assert.throws(() => bind(f), /LLM_LIVE_PREFLIGHT_REQUIRED/, invalid);
      assert.strictEqual(f.state.binding, previous);
      assert.equal(f.state.writes.binding, rebind ? 1 : 0);
    }
    const f = fixture();
    if (rebind) bind(f);
    assert.equal(bind(f, new Date(f.now.getTime() + 900000)).revision, rebind ? 2 : 1);
    assert.equal(inspect(f, new Date(f.now.getTime() + 900000)).state, "READY");
  }
});

test("full canonical proof digest detects same-timestamp changes and ignores object key order", () => {
  for (const mutate of [
    proof => { proof.checks[0].evidence.push("changed"); },
    proof => { proof.model = "changed"; },
    proof => { proof.blockers.push("changed"); },
    proof => { proof.extraEvidence = { retained: true }; }
  ]) {
    const f = fixture(); bind(f);
    const checkedAt = f.profile.lastPreflight.checkedAt;
    mutate(f.profile.lastPreflight);
    assert.equal(f.profile.lastPreflight.checkedAt, checkedAt);
    const result = inspect(f);
    assert.equal(result.state, "LLM_BLOCKED");
    assert.match(result.reason, /proof failed, changed, or is invalid/);
  }
  const f = fixture(); bind(f);
  f.profile.lastPreflight = Object.fromEntries(Object.entries(f.profile.lastPreflight).reverse());
  assert.equal(inspect(f).state, "READY");
});

test("changed checkedAt requires explicit valid rebind and preserves CAS controls", () => {
  const f = fixture();
  const previous = bind(f);
  const now = new Date(f.now.getTime() + 1000);
  f.profile.lastPreflight.checkedAt = now.toISOString();
  assert.equal(inspect(f, now).state, "LLM_BLOCKED");
  assert.strictEqual(f.state.binding, previous);
  assert.throws(() => bind(f, now, { expectedProfileDigest: "wrong" }), /LLM_PROFILE_DIGEST_MISMATCH/);
  assert.throws(() => bind(f, now, { expectedBindingDigest: "wrong" }), /WORKSPACE_LLM_BINDING_CONFLICT/);
  const rebound = bind(f, now);
  assert.equal(rebound.previousBindingDigest, previous.digest);
  assert.equal(rebound.revision, 2);
  assert.equal(inspect(f, now).state, "READY");
});

test("existing binding still blocks profile drift and missing, revoked or out-of-scope SecretRefs", () => {
  for (const [field, value] of [
    ["provider", "changed"], ["providerName", "changed"], ["modelName", "changed"],
    ["baseUrl", "https://changed.invalid"], ["apiKeyRef", "missing"], ["status", "DISABLED"],
    ["scope", "user"], ["tenantId", "other"], ["workspaceId", "other"]
  ]) {
    const f = fixture(); bind(f); f.profile[field] = value;
    assert.equal(inspect(f).state, "LLM_BLOCKED", field);
  }
  for (const mutate of [
    f => { f.state.profiles = []; }, f => { f.state.secrets.clear(); },
    f => { f.secret.status = "REVOKED"; }, f => { f.secret.tenantId = "other"; },
    f => { f.secret.workspaceId = "other"; }, f => { delete f.profile.lastPreflight; },
    f => { f.profile.lastPreflight.status = "BLOCKED"; },
    f => { f.profile.lastPreflight.checkedAt = "invalid"; }
  ]) {
    const f = fixture(); bind(f); mutate(f);
    assert.equal(inspect(f).state, "LLM_BLOCKED");
  }
  const f = fixture(); bind(f);
  assert.equal(inspect(f, new Date(f.now.getTime() - 1)).state, "LLM_BLOCKED", "future unchanged proof");
});

test("actual selector accepts aged proof and preserves requested > project > workspace precedence", t => {
  const f = selectionFixture(t);
  const projectProfile = { ...f.profile, id: "project-profile" };
  const userProfile = { ...f.profile, id: "user-profile", scope: "user", ownerActor: "owner" };
  f.state.profiles.push(projectProfile, userProfile);
  const actor = { actor: "owner", role: "developer", ...f.scope };
  const snapshot = structuredClone(f.state);
  for (const [input, id, source] of [
    [{}, f.profile.id, "workspace-default"],
    [{ project: { llm: { profileId: projectProfile.id } } }, projectProfile.id, "project-default"],
    [{ requestedProfileId: userProfile.id, project: { llm: { profileId: projectProfile.id } }, actor }, userProfile.id, "loop-override"],
    [{ project: { llm: { profileId: userProfile.id } } }, userProfile.id, "project-default"]
  ]) {
    const result = select(f, input);
    assert.equal(result.readiness.status, "READY");
    assert.equal(result.selection.configured, true);
    assert.equal(result.selection.profileId, id);
    assert.equal(result.selection.source, source);
  }
  assert.equal(select(f, { requestedProfileId: userProfile.id, actor: { ...actor, actor: "other" } }).selection.configured, false);
  assert.equal(select(f, { requestedProfileId: "missing" }).selection.configured, false);
  assert.equal(select(f, { project: { llm: { profileId: "missing" } } }).selection.configured, false);
  assert.deepEqual(f.state, snapshot);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("actual selector rejects invalid proof and retains profile and governed SecretRef checks", t => {
  const f = selectionFixture(t);
  const originalProfile = structuredClone(f.profile);
  const originalSecret = structuredClone(f.secret);
  for (const mutate of [
    () => { delete f.profile.lastPreflight; }, () => { f.profile.lastPreflight.status = "BLOCKED"; },
    () => { f.profile.lastPreflight.checkedAt = "not-a-date"; },
    () => { delete f.profile.lastPreflight.checkedAt; },
    () => { f.profile.lastPreflight.checkedAt = new Date(Date.now() + 1).toISOString(); },
    () => { f.profile.status = "DISABLED"; }, () => { f.profile.tenantId = "other"; },
    () => { f.profile.workspaceId = "other"; }, () => { f.profile.apiKeyRef = "missing"; },
    () => { f.profile.baseUrl = ""; }, () => { f.profile.modelName = ""; },
    () => { f.secret.status = "REVOKED"; }, () => { f.secret.tenantId = "other"; },
    () => { f.secret.workspaceId = "other"; }, () => { f.secret.id = "different-secret"; },
    () => { f.secret.encryption.ciphertext = "invalid"; }
  ]) {
    Object.assign(f.profile, structuredClone(originalProfile));
    Object.assign(f.secret, structuredClone(originalSecret));
    mutate();
    const result = select(f);
    assert.equal(result.readiness.status, "BLOCKED");
    assert.equal(result.selection.configured, false);
  }
  assert.deepEqual(f.state.writes, { readiness: 0, binding: 1 });
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});
