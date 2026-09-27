import assert from "node:assert/strict";
import test from "node:test";
import { encryptSecretValue, resolveLlmProfileApiKey, resolveLoopLlmSelection } from "../../packages/server/dist/application/control-plane-services.js";

function fixture() {
  const now = new Date().toISOString();
  const secret = { id: "EVOPILOT_SYNTHETIC_PROFILE_COLLISION", tenantId: "tenant-a", workspaceId: "workspace-a", scope: "workspace", status: "ACTIVE", encryption: encryptSecretValue("synthetic-governed-value") };
  const profiles = ["override", "project", "workspace"].map(id => ({
    id, tenantId: secret.tenantId, workspaceId: secret.workspaceId, scope: "workspace", status: "ACTIVE",
    provider: "openai-compatible", providerName: "synthetic-provider", modelName: id, baseUrl: "http://127.0.0.1:1/v1", apiKeyRef: secret.id,
    lastPreflight: { status: "READY", checkedAt: now }
  }));
  const store = { readSecret: id => id === secret.id ? secret : undefined,
    readLlmProfile: id => profiles.find(profile => profile.id === id), readWorkspaceLlmDefaultBinding: () => ({ profileId: "workspace" }) };
  return { secret, profiles, store, input: { tenantId: secret.tenantId, workspaceId: secret.workspaceId, requireLlm: true } };
}

test("governed LLM SecretRef is never overridden or substituted by an environment variable", () => {
  const f = fixture(), name = f.secret.id, old = process.env[name];
  process.env[name] = "synthetic-forbidden-environment-value";
  try {
    assert.equal(resolveLlmProfileApiKey(f.store, f.profiles[0]), "synthetic-governed-value");
    assert.equal(resolveLlmProfileApiKey(undefined, f.profiles[0]), undefined);
    f.secret.status = "REVOKED";
    assert.equal(resolveLlmProfileApiKey(f.store, f.profiles[0]), undefined);
    f.secret.status = "ACTIVE"; f.secret.workspaceId = "workspace-b";
    assert.equal(resolveLlmProfileApiKey(f.store, f.profiles[0]), undefined);
    f.secret.workspaceId = "workspace-a"; f.secret.tenantId = "tenant-b";
    assert.equal(resolveLlmProfileApiKey(f.store, f.profiles[0]), undefined);
  } finally { if (old === undefined) delete process.env[name]; else process.env[name] = old; }
});

test("LLM selection precedence is explicit run override then project then workspace", () => {
  const f = fixture();
  for (const [requestedProfileId, project, id, source] of [
    ["override", { llm: { profileId: "project" } }, "override", "loop-override"],
    [undefined, { llm: { profileId: "project" } }, "project", "project-default"],
    [undefined, undefined, "workspace", "workspace-default"]
  ]) {
    const result = resolveLoopLlmSelection(f.store, { ...f.input, requestedProfileId, project });
    assert.equal(result.selection.source, source); assert.equal(result.selection.profileId, id);
    assert.equal(result.selection.configured, true); assert.equal(result.readiness.status, "READY");
  }
});

for (const mutation of ["missing", "disabled", "tenant", "workspace"]) test(`invalid ${mutation} override cannot fall back to a valid project or workspace default`, () => {
  const f = fixture();
  const requestedProfileId = mutation === "missing" ? "absent" : "override";
  if (mutation === "disabled") f.profiles[0].status = "DISABLED";
  if (mutation === "tenant") f.profiles[0].tenantId = "tenant-b";
  if (mutation === "workspace") f.profiles[0].workspaceId = "workspace-b";
  const result = resolveLoopLlmSelection(f.store, { ...f.input, requestedProfileId, project: { llm: { profileId: "project" } } });
  assert.equal(result.selection.source, "loop-override"); assert.equal(result.selection.profileId, requestedProfileId);
  assert.equal(result.selection.configured, false); assert.equal(result.readiness.status, "BLOCKED");
});
