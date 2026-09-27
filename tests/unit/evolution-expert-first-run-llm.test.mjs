import assert from "node:assert/strict";
import test from "node:test";

import {
  createExpertAdapter,
  expertCompatibility,
  executeExpertTurn,
  planExpertLlmReadiness,
  planExpertTurn,
  routeExpertIntent
} from "../../packages/evolution-expert/dist/index.js";

const readiness = (state, nextAction) => ({
  schema: "evopilot-runtime-readiness/v1",
  tenantId: "tenant-production",
  workspaceId: "workspace-agent-products",
  state,
  revision: 1,
  reason: state,
  evidenceRefs: [],
  actor: "test",
  updatedAt: "2026-09-16T00:00:00.000Z",
  digest: `sha256:${"a".repeat(64)}`,
  nextAction
});

test("Expert LLM migration/bootstrap guidance only reads the Runtime contract", async () => {
  for (const prompt of ["迁移 6.1 LLM 配置", "Explain headless LLM bootstrap", "LLM migration guidance"]) {
    const plan = planExpertTurn(prompt);
    assert.equal(plan.intent, "llm-migration");
    assert.equal(plan.operation.tool, "evopilot_llm_setup_protocol");
    assert.equal(plan.operation.authority, "NONE");
    assert.deepEqual(plan.operation.requiredInputs, []);
    assert.match(plan.operation.purpose, /explicit opt-in.*ambiguity.*audit.*cleanup/);
    assert.match(plan.operation.nextOnSuccess, /if administration is absent/);
    assert.match(plan.operation.nextOnSuccess, /do not request raw inputs/);
    const calls = [], runtime = { schema: "evopilot-llm-setup-protocol/v1", runtimeVersion: "6.3.0" };
    assert.deepEqual(await executeExpertTurn(plan, { invoke: async (...args) => { calls.push(args); return runtime; } }), runtime);
    assert.deepEqual(calls, [["evopilot_llm_setup_protocol", {}]]);
  }
});

test("Expert 2.2 routes setup, status, and repair through Runtime MCP", () => {
  assert.equal(routeExpertIntent("帮我完成首次 LLM 配置").intent, "llm-setup");
  assert.equal(routeExpertIntent("查看 LLM readiness").intent, "llm-status");
  assert.equal(routeExpertIntent("修复 LLM_BLOCKED").intent, "llm-repair");
  const plan = planExpertLlmReadiness(readiness("SETUP_REQUIRED", "configure-llm-profile"));
  assert.equal(plan.steps[0].tool, "evopilot_llm_provider_discover");
  assert.equal(plan.steps[1].tool, "host-native-secure-secret-input");
  assert.equal(plan.steps[1].secureInputRequired, true);
  assert.ok(plan.prohibited.includes("Host-LLM-as-Runtime-LLM"));
});

test("Expert refuses apparent raw credentials and drops the payload", () => {
  const plan = planExpertTurn("用这个密钥 sk-test-abcdefghijklmnop 完成配置", { apiKey: "sk-test-abcdefghijklmnop" });
  assert.equal(plan.intent, "llm-setup");
  assert.deepEqual(plan.payload, {});
  assert.match(plan.guidance.join(" "), /refused/i);
});

test("Expert requires Runtime 6.2 and Host-native secure input", () => {
  const adapter = createExpertAdapter("codex");
  assert.ok(adapter.requiredCapabilities.includes("host-native-secure-secret-input"));
  assert.equal(expertCompatibility(adapter, "6.2.0", adapter.requiredCapabilities).conformanceStatus, "CONFORMANT");
  assert.equal(expertCompatibility(adapter, "6.1.0", adapter.requiredCapabilities).conformanceStatus, "INCOMPATIBLE");
  assert.equal(planExpertLlmReadiness(readiness("READY", "normal-operation")).nextAction, "normal-operation");
});

for (const [state, nextAction, tools, secureInput] of [
  ["SETUP_REQUIRED", "configure-secret-ref", ["evopilot_llm_provider_discover", "host-native-secure-secret-input", "evopilot_llm_profile_upsert"], [false, true, false]],
  ["PREFLIGHT_REQUIRED", "preflight-exact-profile", ["evopilot_llm_profile_preflight", "evopilot_workspace_llm_default_bind"], [false, false]],
  ["LLM_BLOCKED", "repair-exact-revoked-secret", ["evopilot_runtime_readiness_inspect", "evopilot_runtime_readiness_repair"], [false, false]],
  ["READY", "normal-operation", [], []]
]) {
  test(`Expert readiness ${state}: exact Runtime-bound guidance without inferred authority`, () => {
    const input = readiness(state, nextAction);
    const before = structuredClone(input);
    Object.freeze(input.evidenceRefs);
    Object.freeze(input);
    const plan = planExpertLlmReadiness(input);
    assert.deepEqual(input, before);
    assert.equal(plan.schema, "evopilot-evolution-expert-llm-readiness-plan/v1");
    assert.equal(plan.state, state);
    assert.equal(plan.runtimeReadinessDigest, input.digest);
    assert.equal(plan.nextAction, nextAction);
    assert.deepEqual(plan.steps.map(step => step.tool), tools);
    assert.deepEqual(plan.steps.map(step => step.secureInputRequired), secureInput);
    assert.deepEqual(plan.prohibited, [
      "raw-secret-in-conversation", "implicit-provider-selection", "Host-LLM-as-Runtime-LLM",
      "Agent-Model-as-Runtime-LLM", "environment-fallback", "silent-profile-switch"
    ]);
    assert.deepEqual(Object.keys(plan).sort(), ["schema", "state", "runtimeReadinessDigest", "steps", "prohibited", "nextAction", "digest"].sort());
    assert.deepEqual(planExpertLlmReadiness(input), plan);
    const changed = planExpertLlmReadiness({ ...input, digest: `sha256:${"b".repeat(64)}` });
    assert.notEqual(changed.digest, plan.digest);
    assert.equal(changed.runtimeReadinessDigest, `sha256:${"b".repeat(64)}`);
    assert.deepEqual(changed.steps, plan.steps);
    if (state === "PREFLIGHT_REQUIRED") assert.match(plan.steps[1].purpose, /Ask the user.*exact READY profile explicitly/);
    if (state === "LLM_BLOCKED") assert.match(plan.steps[1].purpose, /only after.*repaired explicitly/);
  });
}
