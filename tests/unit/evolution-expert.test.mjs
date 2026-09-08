import assert from "node:assert/strict";
import test from "node:test";
import { EVOLUTION_EXPERT_CORE, assertExpertAdapterConformance, createExpertAdapter, executeExpertTurn, expertCompatibility, planExpertTurn, routeExpertIntent } from "../../packages/evolution-expert/dist/index.js";

test("one immutable Expert Core generates conformant Host-neutral adapters", () => {
  const codex = createExpertAdapter("codex");
  const workbuddy = createExpertAdapter("workbuddy");
  assert.equal(codex.coreDigest, EVOLUTION_EXPERT_CORE.digest);
  assert.equal(workbuddy.coreDigest, codex.coreDigest);
  assert.doesNotThrow(() => assertExpertAdapterConformance(codex));
  assert.equal(expertCompatibility(codex, "5.0.0", codex.requiredCapabilities).conformanceStatus, "CONFORMANT");
  assert.equal(expertCompatibility(codex, "4.0.0", codex.requiredCapabilities).conformanceStatus, "INCOMPATIBLE");
});

test("Expert routes onboarding, recovery, status, and tutorial without owning Runtime state", () => {
  assert.equal(routeExpertIntent("帮我注册一个新项目").intent, "project-onboard");
  assert.equal(routeExpertIntent("这个错误可以自动恢复吗").intent, "recovery");
  assert.equal(routeExpertIntent("现在进度如何").intent, "status");
  assert.equal(routeExpertIntent("给我一个入门教程").intent, "tutorial");
});

test("Expert asks only unresolved fields and exact release authority cannot be inferred", async () => {
  const incomplete = planExpertTurn("注册项目", {});
  assert.equal((await executeExpertTurn(incomplete, { invoke: async () => ({}) })).status, "NEEDS_INPUT");
  const release = planExpertTurn("发布", { sessionDigest: `sha256:${"a".repeat(64)}`, releaseBinding: { digest: "x" }, authorizationDigest: `sha256:${"b".repeat(64)}` });
  await assert.rejects(() => executeExpertTurn(release, { invoke: async () => ({ status: "ok" }) }), /EXACT_DECISION_REQUIRED/);
  await assert.rejects(() => executeExpertTurn(release, { invoke: async () => ({ status: "ok" }) }, { authorizationDigest: `sha256:${"c".repeat(64)}`, evidenceRef: "decision://1" }), /DECISION_DIGEST_MISMATCH/);
});
