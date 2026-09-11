import assert from "node:assert/strict";
import test from "node:test";
import { EVOLUTION_EXPERT_CORE, assertExpertAdapterConformance, createExpertAdapter, createHostIntegrationBundle, executeExpertTurn, expertCompatibility, expertDoctor, expertMigrationGuide, expertTutorial, expertVersionGuide, planExpertTurn, qualifyExpertHostAdapter, routeExpertIntent } from "../../packages/evolution-expert/dist/index.js";

test("one immutable Expert Core generates conformant Host-neutral adapters", () => {
  const codex = createExpertAdapter("codex");
  const claude = createExpertAdapter("claude-code");
  const workbuddy = createExpertAdapter("workbuddy");
  assert.equal(codex.coreDigest, EVOLUTION_EXPERT_CORE.digest);
  assert.equal(workbuddy.coreDigest, codex.coreDigest);
  assert.equal(claude.coreDigest, codex.coreDigest);
  assert.doesNotThrow(() => assertExpertAdapterConformance(codex));
  assert.equal(expertCompatibility(codex, "6.0.0", codex.requiredCapabilities).conformanceStatus, "CONFORMANT");
  assert.equal(expertCompatibility(codex, "5.1.0", codex.requiredCapabilities).conformanceStatus, "INCOMPATIBLE");
  assert.equal(createHostIntegrationBundle("codex").ordinaryHumanEntry, "EXPERT_OVER_MCP_ONLY");
});

test("Expert 2.0.0 provides version-aware doctor and an MCP-first side-effect-free tutorial", () => {
  const doctor = expertDoctor("codex", "6.0.0", createExpertAdapter("codex").requiredCapabilities);
  assert.equal(doctor.status, "READY");
  assert.equal(doctor.expertVersion, "2.0.0");
  assert.equal(expertDoctor("codex", "5.1.0", createExpertAdapter("codex").requiredCapabilities).status, "INCOMPATIBLE");
  const tutorial = expertTutorial();
  assert.equal(tutorial.sideEffects, false);
  assert.deepEqual(tutorial.steps.map((step) => step.concept), ["Project", "Lifecycle Registry", "Harness", "Goal Target Loop", "Agent Runtime", "Recovery", "Acceptance and Release"]);
  assert.ok(tutorial.steps.every((step) => step.nextPrompt && !("nextCommand" in step)));
  const versions = expertVersionGuide();
  assert.equal(versions.versionLines.find((line) => line.owner === "source Suite").changesWhen.includes("Never"), true);
  assert.equal(expertMigrationGuide().sideEffects, false);
});

test("a third-party Host qualifies without Engine source modification", () => {
  const report = qualifyExpertHostAdapter("independent-host", "6.0.0", ["structured-tool-results", "local-or-remote-mcp", "human-decision-presentation", "runtime-state-resume"]);
  assert.equal(report.status, "QUALIFIED");
  assert.equal(report.sourceModificationRequired, false);
  assert.ok(report.checks.every((check) => check.status === "PASS"));
});

test("Expert routes onboarding, recovery, status, and tutorial without owning Runtime state", () => {
  assert.equal(routeExpertIntent("我是第一次使用 EvoPilot，请告诉我从哪里开始").intent, "help");
  assert.equal(routeExpertIntent("I am new to EvoPilot; where should I start?").intent, "help");
  assert.equal(routeExpertIntent("帮我注册一个新项目").intent, "project-onboard");
  assert.equal(routeExpertIntent("这个错误可以自动恢复吗").intent, "recovery");
  assert.equal(routeExpertIntent("现在进度如何").intent, "status");
  assert.equal(routeExpertIntent("给我一个入门教程").intent, "tutorial");
  assert.equal(routeExpertIntent("解释 Suite 和资源版本关系").intent, "version-explain");
  assert.equal(routeExpertIntent("查看迁移能力清单").intent, "capability");
  assert.equal(routeExpertIntent("是否达到 cutover readiness").intent, "cutover");
  assert.equal(routeExpertIntent("请更新生命周期").intent, "lifecycle-update");
  assert.equal(routeExpertIntent("查看生命周期审计").intent, "lifecycle-audit");
});


test("Expert asks only unresolved fields and exact release authority cannot be inferred", async () => {
  const incomplete = planExpertTurn("注册项目", {});
  assert.equal((await executeExpertTurn(incomplete, { invoke: async () => ({}) })).status, "NEEDS_INPUT");
  const release = planExpertTurn("发布", { sessionDigest: `sha256:${"a".repeat(64)}`, releaseBinding: { digest: "x" }, authorizationDigest: `sha256:${"b".repeat(64)}` });
  await assert.rejects(() => executeExpertTurn(release, { invoke: async () => ({ status: "ok" }) }), /EXACT_DECISION_REQUIRED/);
  await assert.rejects(() => executeExpertTurn(release, { invoke: async () => ({ status: "ok" }) }, { authorizationDigest: `sha256:${"c".repeat(64)}`, evidenceRef: "decision://1" }), /DECISION_DIGEST_MISMATCH/);
});
