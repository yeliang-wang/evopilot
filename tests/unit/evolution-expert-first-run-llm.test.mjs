import assert from "node:assert/strict";
import test from "node:test";

import {
  createExpertAdapter,
  expertCompatibility,
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
