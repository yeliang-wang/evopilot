import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import {projectSemanticCapabilities, semanticExecutionCapabilities} from "../../packages/contracts/dist/index.js";
import {EVOLUTION_EXPERT_CORE, planExpertTurn, executeExpertTurn, executeExpertSemanticOperation,
  routeExpertIntent, explainExpertSemanticResult, explainExpertSemanticExecutionResult, createExpertAdapter} from "../../packages/evolution-expert/dist/index.js";

const hash = "sha256:" + "a".repeat(64), projectId = "p";
const selection = {projectId, catalogId: "c", artifactSetDigest: hash, bundleDigest: hash};
const reply = (operation, data, status = 200) => ({schema: "evopilot-mcp-http-result/v1", tool: "evopilot_project_semantic_" + operation,
  status, ok: status >= 200 && status < 300, requestId: "synthetic-request", response: {data}});
const canonical = x => Array.isArray(x) ? `[${x.map(canonical).join(",")}]` : x && typeof x === "object" ?
  `{${Object.entries(x).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}` : JSON.stringify(x);
const digest = x => "sha256:" + crypto.createHash("sha256").update(canonical(x)).digest("hex");
for (const [text, intent] of [
  ["查看项目语义地图", "semantic-discover"], ["check ontology compatibility with this HarnessBundle", "semantic-compatibility"],
  ["查看语义缺口及后继建议", "semantic-gap"], ["semantic evidence gap", "semantic-gap"],
  ["准备项目语义绑定评审", "semantic-review"], ["批准项目语义评审", "semantic-approve"],
  ["恢复语义绑定状态", "semantic-binding"], ["运行双绑定 Goal", "semantic-execution-capabilities"],
  ["迁移语义本体并回滚", "semantic-activation"], ["semantic successor activation", "semantic-activation"],
  ["准备语义迁移评审", "semantic-transition-review"], ["approve semantic transition review", "semantic-transition-approve"],
  ["恢复语义回滚状态", "semantic-activation"], ["新项目语义接入", "semantic-onboarding"],
  ["onboard project semantic map", "semantic-onboarding"], ["项目默认双绑定", "semantic-onboarding"]
]) test(`semantic routing preserves its boundary: ${text}`, () => {
  assert.equal(routeExpertIntent(text).intent, intent); assert(EVOLUTION_EXPERT_CORE.intents.includes(intent));
  assert(EVOLUTION_EXPERT_CORE.operations[intent].tool.startsWith(intent.startsWith("semantic-execution-") ? "evopilot_semantic_execution_" : "evopilot_project_semantic_"));
});
test("gap explanation refuses guessed ownership, successor selection and authority", () => {
  const data = {schema: "evopilot-project-semantic-gap/v1", gapDigest: hash, inspectionDigest: hash, compatibilityDigest: hash, artifactSetDigest: hash,
    compatibilityStatus: "INDETERMINATE", status: "REVIEW_REQUIRED", findings: [{reason: "REQUIREMENTS_NOT_DECLARED", destination: "HARNESS_DECLARATION_REVIEW"}],
    businessField: null, productType: null, selectedSuccessor: null, bindingCreated: false, eligibleForExecution: false,
    authority: {maySelect: false, mayModify: false, mayApprove: false, mayPublish: false, mayBind: false, mayExecute: false},
    successorHandoff: {mode: "EXTERNAL_PRODUCER_REVIEW_ONLY", action: "MIGRATE", destinationKind: "PREPARED_REVIEW_DIGEST",
      preservesExistingRunPins: true, grantsExecutionAuthority: false}};
  const explain = d => explainExpertSemanticResult("gap", reply("gap", d));
  assert.equal(explain(data).canExecute, false); assert.equal(explain(data).selectedSuccessor, null);
  for (const change of [{selectedSuccessor: hash}, {businessField: "guessed"}, {eligibleForExecution: true}, {bindingCreated: true},
    {findings: []}, {compatibilityStatus: "COMPATIBLE"}, {authority: {...data.authority, mayPublish: true}},
    {findings: [{reason: "EVIDENCE_REQUIREMENTS_UNVERIFIED", destination: "ONTOLOGY_MATERIAL_REVIEW"}]},
    {successorHandoff: {...data.successorHandoff, preservesExistingRunPins: false}}]) assert.throws(() => explain({...data, ...change}), /RESPONSE_INVALID/);
});
test("semantic approval needs exact separate evidence; generic continue and wrong digest cannot invoke any tool", async () => {
  const plan = planExpertTurn("批准项目语义评审", {projectId, reviewDigest: hash, decision: "APPROVE"}), calls = [];
  const transport = {invoke: async (...args) => {calls.push(args); return {};}};
  for (const decision of [undefined, {authorizationDigest: hash, evidenceRef: ""}, {authorizationDigest: "sha256:" + "b".repeat(64), evidenceRef: "decision://synthetic"}])
    await assert.rejects(() => executeExpertTurn(plan, transport, decision), /EXACT_DECISION_REQUIRED|DECISION_DIGEST_MISMATCH/);
  await assert.rejects(() => executeExpertSemanticOperation("approve", plan.payload, transport), /EXACT_DECISION_REQUIRED/);
  assert.deepEqual(calls, []);
  const incomplete = planExpertTurn("批准项目语义评审", {projectId, reviewDigest: hash});
  assert.deepEqual((await executeExpertTurn(incomplete, transport)).missing, ["decision"]);
});

test("semantic onboarding collects only unresolved exact project/Catalog fields and never falls back", async () => {
  const transport = {invoke: async () => {throw Error("must not invoke");}};
  assert.deepEqual((await executeExpertTurn(planExpertTurn("新项目语义接入", {}), transport)).missing, ["projectId", "catalogId"]);
  assert.deepEqual((await executeExpertTurn(planExpertTurn("新项目语义接入", {projectId}), transport)).missing, ["catalogId"]);
  const calls = [];
  await executeExpertTurn(planExpertTurn("新项目语义接入", {projectId, catalogId: "c"}), {invoke: async (tool, payload) => {
    calls.push({tool, payload}); return reply(tool.split("_").at(-1), tool.endsWith("capabilities") ? projectSemanticCapabilities(projectId) : {});
  }});
  assert.deepEqual(calls, [{tool: "evopilot_project_semantic_capabilities", payload: {projectId}}, {tool: "evopilot_project_semantic_onboarding", payload: {projectId, catalogId: "c"}}]);
  let count = 0;
  await assert.rejects(() => executeExpertTurn(planExpertTurn("新项目语义接入", {projectId, catalogId: "c"}), {invoke: async () => {
    count++; return reply("capabilities", {...projectSemanticCapabilities(projectId), operations: ["capabilities", "inspect"]});
  }}), /SEMANTIC_CAPABILITY_REQUIRED/); assert.equal(count, 1);
});

test("onboarding explanation rejects selection/authority injection and contradictory counts or states", () => {
  const candidate = {artifactSetDigest: hash, bundleDigest: hash, compatibilityDigest: hash, closureDigest: hash, bundleId: "b", bundleVersion: "1.0.0", status: "COMPATIBLE", reasons: []};
  const data = {schema: "evopilot-project-semantic-onboarding/v1", onboardingDigest: hash, candidatesDigest: hash, status: "REVIEW_REQUIRED",
    recommendedBindingMode: "DUAL_BINDING_REVIEW", candidates: [candidate], compatibleCount: 1, maximumCandidates: 64, selectedCandidate: null, existingBinding: null,
    businessField: null, productType: null, missingInputs: ["artifactSetDigest", "bundleDigest"], bindingCreated: false, preservesLegacyBindings: true,
    grantsExecutionAuthority: false, eligibleForExecution: false, requiresSeparateBindingApproval: true};
  const explain = value => explainExpertSemanticResult("onboarding", reply("onboarding", value));
  assert.equal(explain(data).status, "REVIEW_REQUIRED"); assert.equal(explain(data).canExecute, false);
  for (const change of [{selectedCandidate: candidate}, {bindingCreated: true}, {compatibleCount: 2}, {status: "READY"}, {missingInputs: []},
    {grantsExecutionAuthority: true}, {requiresSeparateBindingApproval: false}, {existingBinding: {bindingDigest: hash, headDigest: hash}},
    {candidates: [{...candidate, bundleDigest: "latest"}]}, {businessField: "inferred-from-name"}]) assert.throws(() => explain({...data, ...change}), /SEMANTIC_RESPONSE_INVALID/);
  for (const [statuses, expected] of [[[], "NO_PUBLISHED_CANDIDATE"], [["INCOMPATIBLE"], "NO_COMPATIBLE_MATCH"], [["INDETERMINATE"], "EVIDENCE_REQUIRED"],
    [["COMPATIBLE", "COMPATIBLE"], "SELECTION_REQUIRED"]]) {
    const n = statuses.filter(s => s === "COMPATIBLE").length;
    const summary = explain({...data, candidates: statuses.map(status => ({...candidate, status})), status: expected,
      compatibleCount: n, missingInputs: n ? data.missingInputs : [], recommendedBindingMode: n ? "DUAL_BINDING_REVIEW" : "UNRESOLVED"});
    assert.equal(summary.status, expected); assert.equal(summary.canComplete, false);
  }
});
test("valid exact decision negotiates MCP then delegates only exact fields without inserting approval metadata", async () => {
  const input = {projectId, reviewDigest: hash, decision: "APPROVE"}, plan = planExpertTurn("approve semantic review", input), calls = [];
  const result = await executeExpertTurn(plan, {invoke: async (tool, payload) => {
    calls.push({tool, payload}); return reply(tool.split("_").at(-1), tool.endsWith("capabilities") ? projectSemanticCapabilities(projectId) : {delegated: true});
  }}, {authorizationDigest: hash, evidenceRef: "decision://synthetic"});
  assert.deepEqual(calls, [{tool: "evopilot_project_semantic_capabilities", payload: {projectId}}, {tool: "evopilot_project_semantic_approve", payload: input}]);
  assert.equal(result.response.data.delegated, true);
});
test("legacy, wrong-project, failed or malformed capability never calls a semantic write or legacy tool", async () => {
  const plan = planExpertTurn("semantic review", selection);
  for (const value of [{}, reply("capabilities", {version: "6.3.0"}), reply("capabilities", projectSemanticCapabilities("other")),
    reply("capabilities", {error: "NOT_FOUND"}, 404), reply("binding", projectSemanticCapabilities(projectId))]) {
    const calls = [], transport = {invoke: async (tool) => {calls.push(tool); return value;}};
    try {const result = await executeExpertTurn(plan, transport); assert.equal(result.ok, false);} catch (error) {
      assert.match(error.message, /SEMANTIC_RESPONSE_INVALID|SEMANTIC_CAPABILITY_REQUIRED/);
    }
    assert.deepEqual(calls, ["evopilot_project_semantic_capabilities"]);
  }
});
test("semantic execution requests only inspect capability, never invoke legacy Goal execution", async () => {
  for (const text of ["run dual-bound semantic Goal", "运行双绑定 Goal"]) {
    const calls = [], plan = planExpertTurn(text, {projectId});
    const result = await executeExpertTurn(plan, {invoke: async (tool) => {calls.push(tool); return {...reply("capabilities", semanticExecutionCapabilities(projectId, true, true, true)), tool};}});
    assert.deepEqual(calls, ["evopilot_semantic_execution_capabilities"]);
    const explanation = explainExpertSemanticExecutionResult("capabilities", result);
    assert.equal(explanation.canExecute, false); assert.equal(explanation.canComplete, false);
  }
});

test("migration starts with Runtime activation read and never invents transition fields", async () => {
  for (const text of ["语义后继迁移", "回滚语义地图"]) {
    const calls = [];
    await executeExpertTurn(planExpertTurn(text, {projectId}), {invoke: async tool => {
      calls.push(tool); return reply(tool.split("_").at(-1), tool.endsWith("capabilities") ? projectSemanticCapabilities(projectId) : {});
    }});
    assert.deepEqual(calls, ["evopilot_project_semantic_capabilities", "evopilot_project_semantic_activation"]);
  }
  const result = await executeExpertTurn(planExpertTurn("预览语义迁移", {projectId}), {invoke: async () => {throw Error("must not invoke");}});
  assert.deepEqual(result.missing, ["action", "expectedHeadDigest", "destinationDigest"]);
});

test("transition decision requires its own digest and evidence before any MCP call", async () => {
  const payload = {projectId, transitionReviewDigest: hash, decision: "APPROVE"}, plan = planExpertTurn("批准语义迁移评审", payload);
  const calls = [], transport = {invoke: async (tool, input) => {
    calls.push({tool, input}); return reply(tool.split("_").at(-1), tool.endsWith("capabilities") ? projectSemanticCapabilities(projectId) : {});
  }};
  for (const decision of [undefined, {authorizationDigest: hash, evidenceRef: ""}, {authorizationDigest: "sha256:" + "b".repeat(64), evidenceRef: "decision://binding-only"}])
    await assert.rejects(() => executeExpertTurn(plan, transport, decision), /EXACT_DECISION_REQUIRED|DECISION_DIGEST_MISMATCH/);
  await assert.rejects(() => executeExpertSemanticOperation("transitionApprove", payload, transport), /EXACT_DECISION_REQUIRED/);
  assert.deepEqual(calls, []);
  await executeExpertTurn(plan, transport, {authorizationDigest: hash, evidenceRef: "decision://transition"});
  assert.deepEqual(calls, [{tool: "evopilot_project_semantic_capabilities", input: {projectId}}, {tool: "evopilot_project_semantic_transitionApprove", input: payload}]);
});

test("transition presentation preserves future-only effect and refuses malformed or contradictory activation", () => {
  const review = {schema: "evopilot-project-semantic-transition-review/v1", action: "ACTIVATE", transitionReviewDigest: hash,
    expectedHeadDigest: hash, destinationDigest: hash, fromBindingDigest: hash, changedFields: [], effect: "FUTURE_EXECUTION_PLANS_ONLY",
    mutatesExistingExecutions: false, grantsExecutionAuthority: false};
  const receipt = {schema: "evopilot-project-semantic-transition/v1", transitionDigest: hash, review,
    decision: {decision: "APPROVE", transitionReviewDigest: hash, decisionDigest: hash}, destination: {binding: {bindingDigest: hash, eligibleForExecution: false}}};
  const state = {schema: "evopilot-project-semantic-activation/v1", status: "ACTIVE_FOR_FUTURE_PLANS", headDigest: hash, bindingDigest: hash,
    grantsExecutionAuthority: false, transitions: [receipt]};
  assert.equal(explainExpertSemanticResult("transitionReview", reply("transitionReview", review)).status, "WAITING_EXACT_HUMAN_DECISION");
  assert.equal(explainExpertSemanticResult("transitionApprove", reply("transitionApprove", receipt)).status, "TRANSITION_RECORDED");
  const explained = explainExpertSemanticResult("activation", reply("activation", state));
  assert.equal(explained.transitionCount, 1); assert.equal(explained.canExecute, false); assert.equal(explained.canComplete, false);
  for (const bad of [{...state, headDigest: "sha256:" + "b".repeat(64)}, {...state, grantsExecutionAuthority: true}, {...state, transitions: []},
    {...state, transitions: [{...receipt, decision: {...receipt.decision, transitionReviewDigest: "sha256:" + "b".repeat(64)}}]}])
    assert.throws(() => explainExpertSemanticResult("activation", reply("activation", bad)), /SEMANTIC_RESPONSE_INVALID/);
  assert.throws(() => explainExpertSemanticResult("transitionReview", reply("transitionReview", {...review, mutatesExistingExecutions: true})), /SEMANTIC_RESPONSE_INVALID/);
  assert.throws(() => explainExpertSemanticResult("transitionApprove", reply("transitionApprove", {...receipt, destination: {binding: {bindingDigest: hash, eligibleForExecution: true}}})), /SEMANTIC_RESPONSE_INVALID/);
});
test("readback after uncertain approval never submits a new decision and preserves transport failure", async () => {
  const approval = planExpertTurn("approve semantic review", {projectId, reviewDigest: hash, decision: "APPROVE"});
  const calls = [], transport = {invoke: async (tool) => {
    calls.push(tool); if (tool.endsWith("capabilities")) return reply("capabilities", projectSemanticCapabilities(projectId));
    throw new Error("SYNTHETIC_RESPONSE_LOST");
  }};
  await assert.rejects(() => executeExpertTurn(approval, transport, {authorizationDigest: hash, evidenceRef: "decision://test"}), /RESPONSE_LOST/);
  assert.deepEqual(calls, ["evopilot_project_semantic_capabilities", "evopilot_project_semantic_approve"]);
  const resumed = planExpertTurn("恢复项目语义绑定", {projectId});
  assert.equal(resumed.operation.tool, "evopilot_project_semantic_binding"); assert.equal(resumed.requiresExactHumanDecision, false);
});
test("recomputed caller plan digest cannot replace the Core operation or remove its human authority", async () => {
  const plan = structuredClone(planExpertTurn("approve semantic review", {projectId, reviewDigest: hash, decision: "APPROVE"}));
  plan.operation.authority = "NONE"; plan.digest = digest({...plan, digest: undefined});
  let calls = 0;
  await assert.rejects(() => executeExpertTurn(plan, {invoke: async () => {calls++; return {};}}), /OPERATION_DRIFT/);
  assert.equal(calls, 0);
});
test("semantic payload is copied before async negotiation and strict fields reject authority injection", async () => {
  const plan = planExpertTurn("semantic review", {...selection}); let forwarded;
  await executeExpertTurn(plan, {invoke: async (tool, input) => {
    if (tool.endsWith("capabilities")) {plan.payload.bundleDigest = "sha256:" + "b".repeat(64); return reply("capabilities", projectSemanticCapabilities(projectId));}
    forwarded = input; return reply("review", {});
  }});
  assert.equal(forwarded.bundleDigest, hash);
  let calls = 0;
  await assert.rejects(() => executeExpertTurn(planExpertTurn("semantic review", {...selection, actor: "admin"}), {invoke: async () => {calls++; return {};}}), /SEMANTIC_REQUEST_INVALID/);
  assert.equal(calls, 0);
});
for (const status of ["COMPATIBLE", "INCOMPATIBLE", "INDETERMINATE"]) test(`presentation retains ${status} without claiming execution`, () => {
  const result = explainExpertSemanticResult("compatibility", reply("compatibility", {
    schema: "evopilot-project-semantic-compatibility-inspect/v1", projectId, inspectionDigest: hash, report: {status, reasons: ["synthetic-reason"]}}));
  assert.equal(result.status, status); assert.equal(result.canExecute, false); assert.equal(result.canComplete, false);
});
test("review and approved binding remain distinct from activation and completion", () => {
  const review = explainExpertSemanticResult("review", reply("review", {schema: "evopilot-project-semantic-binding-review/v1", reviewDigest: hash}));
  assert.equal(review.status, "WAITING_EXACT_HUMAN_DECISION");
  const approved = explainExpertSemanticResult("approve", reply("approve", {binding: {
    schema: "evopilot-project-semantic-binding/v1", status: "REVIEWED_NOT_ACTIVATED", eligibleForExecution: false, bindingDigest: hash}}));
  assert.equal(approved.status, "REVIEWED_NOT_ACTIVATED"); assert.equal(approved.canExecute, false); assert.equal(approved.canComplete, false);
  assert.equal(explainExpertSemanticResult("approve", reply("approve", {}, 409)).status, "BLOCKED");
  assert.throws(() => explainExpertSemanticResult("binding", reply("binding", {binding: {status: "DONE"}})), /SEMANTIC_RESPONSE_INVALID/);
});
test("all five generated Host adapters contain the same Core-bound operation guide without host-specific authority", () => {
  for (const host of ["codex", "claude-code", "workbuddy", "generic-agent", "generic-mcp"]) {
    const adapter = createExpertAdapter(host), generated = JSON.parse(fs.readFileSync(new URL(`../../packages/evolution-expert/generated/${host}/adapter.json`, import.meta.url)));
    assert.deepEqual(generated, adapter); assert.equal(generated.coreDigest, EVOLUTION_EXPERT_CORE.digest);
    const skill = fs.readFileSync(new URL(`../../packages/evolution-expert/generated/${host}/SKILL.md`, import.meta.url), "utf8");
    for (const [intent, operation] of Object.entries(EVOLUTION_EXPERT_CORE.operations).filter(([id]) => id.startsWith("semantic-"))) {
      assert(skill.includes(operation.tool), `${host}/${intent}`); assert(skill.includes(operation.nextOnSuccess));
    }
  }
});
test("LLM repair and setup stay ahead of semantic work when requested together", () => {
  assert.equal(routeExpertIntent("修复 LLM 后查看语义地图").intent, "llm-repair");
  assert.equal(routeExpertIntent("配置模型，再发现项目本体").intent, "llm-setup");
  assert.equal(routeExpertIntent("inspect llm readiness before semantic discovery").intent, "llm-status");
});
