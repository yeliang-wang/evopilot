import test from "node:test";
import assert from "node:assert/strict";
import {SEMANTIC_EXECUTION_OPERATIONS, semanticExecutionCapabilities, projectSemanticCapabilities} from "../../packages/contracts/dist/index.js";
import {EVOLUTION_EXPERT_CORE, planExpertTurn, executeExpertTurn, executeExpertSemanticExecution,
  explainExpertSemanticExecutionResult as explain, routeExpertIntent} from "../../packages/evolution-expert/dist/index.js";
const hash = "sha256:" + "a".repeat(64), other = "sha256:" + "b".repeat(64), projectId = "p";
const identity = {projectId, goalId: "g", targetId: "t", harnessBindingDigest: hash};
const values = {identity, runId: "r", requestDigest: hash, bindingDigest: hash, goalTarget: {}, contextPlan: {}, outcomePlan: {},
  selections: {}, coverage: [], reviewDigest: hash, decision: "APPROVE", phaseTargetId: "phase",
  basisDigest: hash, selection: {}, business: [{}], harness: [{}]};
const caps = () => semanticExecutionCapabilities(projectId, true, true, true);
const reply = (op, data, status = 200) => ({schema: "evopilot-mcp-http-result/v1", tool: "evopilot_semantic_execution_" + op,
  ok: status >= 200 && status < 300, status, requestId: "synthetic-request", response: {data}});
const input = op => ({projectId, payload: Object.fromEntries(EVOLUTION_EXPERT_CORE.operations["semantic-execution-" + op].requiredInputs
  .filter(k => k.startsWith("payload.")).map(k => [k.slice(8), structuredClone(values[k.slice(8)])]))});
const decision = {authorizationDigest: hash, evidenceRef: "decision://synthetic-outcome"};
for (const op of SEMANTIC_EXECUTION_OPERATIONS) test(`Expert delegates only exact advertised execution operation ${op}`, async () => {
  const args = input(op), calls = [], plan = planExpertTurn("semantic execution " + op, args);
  assert.equal(plan.intent, "semantic-execution-" + op);
  const result = await executeExpertTurn(plan, {invoke: async (tool, payload) => {
    calls.push({tool, payload}); return reply(tool.split("_").at(-1), tool.endsWith("capabilities") ? caps() : {});
  }}, op === "approveReview" ? decision : undefined);
  assert.equal(result.ok, true); assert.deepEqual(calls, [
    {tool: "evopilot_semantic_execution_capabilities", payload: {projectId}}, {tool: "evopilot_semantic_execution_" + op, payload: args}]);
});
test("generic semantic run remains read-only; recovery and project migration stay separate", async () => {
  assert.equal(routeExpertIntent("语义业务规则映射").intent, "semantic-execution-mapping");
  for (const text of ["运行双绑定 Goal", "run dual-bound semantic Goal"]) {
    const calls = [], p = planExpertTurn(text, {projectId});
    const result = await executeExpertTurn(p, {invoke: async tool => {calls.push(tool); return reply("capabilities", caps());}});
    assert.deepEqual(calls, ["evopilot_semantic_execution_capabilities"]); assert.equal(explain("capabilities", result).canExecute, false);
  }
  for (const [text, expected] of [["恢复语义执行", "semantic-execution-inspect"], ["双绑定完成进度", "semantic-execution-completionStatus"],
    ["查看语义 Goal 回执", "semantic-execution-goalReceipt"], ["批准语义业务结果评审", "semantic-execution-approveReview"],
    ["准备语义结果评审", "semantic-execution-review"], ["批准语义迁移评审", "semantic-transition-approve"],
    ["批准项目语义评审", "semantic-approve"], ["配置模型再运行双绑定 Goal", "llm-setup"]]) assert.equal(routeExpertIntent(text).intent, expected);
});
test("mapping explanation never converts empty inputs to coverage or approval", () => {
  const data = {schema: "evopilot-semantic-outcome-mapping/v1", status: "COVERAGE_INPUT_REQUIRED", mappingDigest: hash, executionBindingDigest: hash,
    sliceDigest: hash, outcomePlan: {planDigest: hash, business: [{id: "rule"}], harness: []}, criteria: [{criterionDigest: hash, text: "synthetic"}],
    coverageInputs: [{criterionDigest: hash, ruleIds: []}], concepts: [], businessField: null, productType: null, textIsUntrustedData: true,
    authority: {mayApprove: false, mayDispatch: false, mayAttestEvidence: false, mayCompleteGoal: false, mayRelease: false}};
  const result = explain("mapping", reply("mapping", data));
  assert.equal(result.status, "COVERAGE_INPUT_REQUIRED"); assert.deepEqual(result.coverageInputs, data.coverageInputs);
  assert.equal(result.canExecute, false); assert.equal(result.goalCompleted, false);
  for (const change of [{coverageInputs: [{criterionDigest: hash, ruleIds: ["rule"]}]}, {criteria: []}, {businessField: "guessed"},
    {textIsUntrustedData: false}, {status: "APPROVED"}, {authority: {...data.authority, mayApprove: true}}, {authority: undefined}])
    assert.throws(() => explain("mapping", reply("mapping", {...data, ...change})), /RESPONSE_INVALID/);
});
test("missing nested fields are collected precisely, never guessed or sent", async () => {
  const calls = [], transport = {invoke: async x => {calls.push(x); return {};}};
  const p = planExpertTurn("semantic execution approveReview", {projectId, payload: {identity}});
  assert.deepEqual((await executeExpertTurn(p, transport)).missing, ["payload.bindingDigest", "payload.reviewDigest", "payload.decision"]);
  assert.deepEqual(calls, []);
});
test("outcome decision requires its own exact digest and evidence before capability or writes", async () => {
  const calls = [], transport = {invoke: async x => {calls.push(x); return {};}};
  for (const d of [undefined, {...decision, evidenceRef: " "}, {...decision, authorizationDigest: other}]) {
    await assert.rejects(executeExpertTurn(planExpertTurn("semantic execution approveReview", input("approveReview")), transport, d), /EXACT_DECISION_REQUIRED|DECISION_DIGEST_MISMATCH/);
    await assert.rejects(executeExpertSemanticExecution("approveReview", input("approveReview"), transport, d), /EXACT_DECISION_REQUIRED|DECISION_DIGEST_MISMATCH/);
  }
  assert.deepEqual(calls, []);
});
test("snapshot and exact payload schema resist authority injection and mutation during capability await", async () => {
  for (const op of SEMANTIC_EXECUTION_OPERATIONS) {
    const args = input(op); args.payload.approved = true;
    await assert.rejects(executeExpertSemanticExecution(op, args, {invoke: async () => assert.fail("must not invoke")}, decision), /REQUEST_INVALID/);
  }
  const args = input("dispatch"), calls = [];
  await executeExpertSemanticExecution("dispatch", args, {invoke: async (tool, payload) => {
    calls.push(payload);
    if (tool.endsWith("capabilities")) {args.payload.bindingDigest = other; return reply("capabilities", caps());}
    return reply("dispatch", {});
  }});
  assert.equal(calls[1].payload.bindingDigest, hash);
  await assert.rejects(executeExpertSemanticExecution("dispatch", {...input("dispatch"), actor: "admin"}, {invoke: async () => assert.fail()}), /REQUEST_INVALID/);
});
test("legacy, wrong scope, unavailable adapter/completion and malformed capability fail closed", async () => {
  const cases = [["dispatch", projectSemanticCapabilities(projectId)], ["dispatch", {...caps(), projectId: "foreign"}],
    ["dispatch", semanticExecutionCapabilities(projectId, false, true, true)], ["collect", semanticExecutionCapabilities(projectId, true, false, true)],
    ["completeGoal", semanticExecutionCapabilities(projectId, true, true, false)], ["completeGoal", {...caps(), goalCompletionAvailable: false}],
    ["completePhase", {...caps(), phaseCompletionAvailable: false}], ["dispatch", {...caps(), releaseAvailable: true}]];
  for (const [op, capability] of cases) {
    const calls = [];
    await assert.rejects(executeExpertSemanticExecution(op, input(op), {invoke: async tool => {calls.push(tool); return reply("capabilities", capability);}}), /CAPABILITY_REQUIRED|RESPONSE_INVALID/);
    assert.deepEqual(calls, ["evopilot_semantic_execution_capabilities"]);
  }
});
test("failed capability or uncertain write is never replayed or converted to completion", async () => {
  for (const status of [403, 404, 409, 504]) {
    const calls = [], result = await executeExpertSemanticExecution("dispatch", input("dispatch"), {invoke: async tool => {calls.push(tool); return reply("capabilities", {}, status);}});
    assert.equal(calls.length, 1); assert.equal(explain("capabilities", result).status, "BLOCKED");
  }
  let writes = 0;
  await assert.rejects(executeExpertSemanticExecution("dispatch", input("dispatch"), {invoke: async tool => {
    if (tool.endsWith("capabilities")) return reply("capabilities", caps()); writes++; throw Error("LOST_RESPONSE");
  }}), /LOST_RESPONSE/); assert.equal(writes, 1);
});
test("business/Harness failures or missing facts remain distinct from Agent success", () => {
  for (const [business, harness, agent, status] of [["PASSED", "PASSED", "SUCCEEDED", "DUAL_VALIDATED_NOT_COMPLETED"],
    ["FAILED", "PASSED", "SUCCEEDED", "FAILED"], ["PASSED", "FAILED", "SUCCEEDED", "FAILED"],
    ["INDETERMINATE", "PASSED", "SUCCEEDED", "INDETERMINATE"], ["PASSED", "PASSED", "FAILED", "FAILED"]]) {
    const data = {schema: "evopilot-semantic-execution-outcome/v1", outcomeDigest: hash, eligibleForCompletion: false, status,
      business: {status: business}, harness: {status: harness}, agentStatus: agent, evidenceTrust: "SYNTHETIC_COLLECTOR_OBSERVATIONS"};
    const x = explain("evaluate", reply("evaluate", data)); assert.equal(x.status, status); assert.equal(x.goalCompleted, false);
    assert.equal(x.business.status, business); assert.equal(x.harness.status, harness); assert.equal(x.releaseAuthorized, false);
    assert.throws(() => explain("evaluate", reply("evaluate", {...data, status: "COMPLETED"})), /RESPONSE_INVALID/);
  }
});
test("100 percent Targets with phase blocker is PARTIAL; only verified completion report closes Goal, never Release", () => {
  const data = {schema: "evopilot-semantic-goal-completion-report/v1", reportDigest: hash, status: "PARTIAL",
    targets: [{targetId: "t", required: true, status: "VERIFIED_DONE", receiptDigest: hash}],
    progress: {requiredTargets: 1, verifiedRequiredTargets: 1, targetPercent: 100, goalCompleted: false}, blockers: ["PHASE_OR_GA_CLOSURE_PENDING"],
    release: {status: "NOT_EVALUATED", authorized: false, published: false}};
  const x = explain("completionStatus", reply("completionStatus", data)); assert.equal(x.goalCompleted, false); assert.equal(x.progress.targetPercent, 100);
  const complete = {...data, status: "COMPLETED", blockers: [], progress: {...data.progress, goalCompleted: true}};
  assert.equal(explain("completionStatus", reply("completionStatus", complete)).goalCompleted, true);
  for (const change of [{status: "COMPLETED"}, {progress: {...data.progress, targetPercent: 99}}, {blockers: []},
    {targets: [...data.targets, ...data.targets]}, {release: {...data.release, published: true}}, {authority: {mayPublish: true}}])
    assert.throws(() => explain("completionStatus", reply("completionStatus", {...data, ...change})), /RESPONSE_INVALID/);
});
test("malformed envelopes and unexpected completion schemas cannot become successful explanations", () => {
  for (const v of [{}, {...reply("evaluate", {}), status: 409}, reply("dispatch", {})])
    assert.throws(() => explain("evaluate", v), /RESPONSE_INVALID/);
  for (const op of ["completeTarget", "completePhase", "completeGoal", "goalReceipt", "stageReceipt"])
    assert.throws(() => explain(op, reply(op, {schema: "made-up", receiptDigest: hash, status: "COMPLETED"})), /RESPONSE_INVALID/);
});
test("public execution inspect returns the plan directly, not its internal record/state wrapper", () => {
  const plan = {schema: "evopilot-semantic-execution-plan/v1", planDigest: hash, status: "PREPARED_NOT_APPROVED",
    authority: {mayDispatch: false, mayCompleteGoal: false, mayApprove: false, mayPublish: false}};
  assert.equal(explain("inspect", reply("inspect", plan)).evidence.planDigest, hash);
  assert.throws(() => explain("inspect", reply("inspect", {record: plan, state: {}})), /RESPONSE_INVALID/);
});
test("context safety annotations are true data labels, never executable authority", () => {
  const context = {schema: "evopilot-semantic-context-slice/v1", sliceDigest: hash, status: "PREPARED_NOT_DISPATCHED", eligibleForExecution: false,
    authority: {semanticDataOnly: true, textIsUntrustedData: true, mayApprove: false, mayExecute: false, mayPublish: false}};
  assert.equal(explain("resolve", reply("resolve", context)).canExecute, false);
  for (const key of ["mayApprove", "mayExecute", "mayPublish", "unknownAuthority"]) assert.throws(() =>
    explain("resolve", reply("resolve", {...context, authority: {...context.authority, [key]: true}})), /RESPONSE_INVALID/);
});
test("known failed or uncertain Agent receipt remains stopped despite successful HTTP dispatch response", () => {
  for (const [agentStatus, status] of [["FAILED", "FAILED"], ["UNCERTAIN", "BLOCKED"], ["SUCCEEDED", "RECEIVED_PENDING_DUAL_VALIDATION"]]) {
    const d = {schema: "evopilot-semantic-dispatch-result/v1", requestDigest: hash, status: "RECEIVED_PENDING_DUAL_VALIDATION",
      eligibleForCompletion: false, result: {status: agentStatus}};
    assert.equal(explain("dispatch", reply("dispatch", d)).status, status); assert.equal(explain("dispatch", reply("dispatch", d)).goalCompleted, false);
  }
});
test("public collection, decision and completion receipts preserve exact evidence without release claims", () => {
  const examples = {
    collect: {status: "COLLECTED_NOT_COMPLETED", receiptDigest: hash, origin: "SYNTHETIC"},
    approveReview: {schema: "evopilot-semantic-outcome-decision/v1", decisionDigest: hash, reviewDigest: hash, decision: "APPROVE"},
    commitStage: {schema: "evopilot-semantic-stage-commit/v1", proofDigest: hash, status: "STAGE_COMMITTED"},
    completionReceipt: {schema: "evopilot-semantic-target-completion/v1", receiptDigest: hash},
    phaseReceipt: {schema: "evopilot-semantic-phase-completion/v1", receiptDigest: hash, packageDigest: hash, goalCompleted: false, releaseAuthorized: false},
    goalReceipt: {schema: "evopilot-semantic-final-goal-completion/v1", receiptDigest: hash, goalCompleted: true, releaseAuthorized: false}
  };
  for (const [op, data] of Object.entries(examples)) {
    const x = explain(op, reply(op, data)); assert.equal(x.goalCompleted, false); assert.equal(x.releaseAuthorized, false); assert.equal(x.published, false);
    assert(Object.values(x.evidence).includes(hash));
  }
  assert.throws(() => explain("phaseReceipt", reply("phaseReceipt", {...examples.phaseReceipt, goalCompleted: true})), /RESPONSE_INVALID/);
  assert.throws(() => explain("goalReceipt", reply("goalReceipt", {...examples.goalReceipt, releaseAuthorized: true})), /RESPONSE_INVALID/);
});
test("Runtime and runbook are not execution verbs in project semantic discovery", () => {
  for (const text of ["查看 Runtime 语义地图", "inspect Runtime semantic catalog", "discover semantic catalog from the Runtime runbook"])
    assert.equal(routeExpertIntent(text).intent, "semantic-discover");
  assert.equal(routeExpertIntent("run semantic Goal").intent, "semantic-execution-capabilities");
  assert.equal(routeExpertIntent("inspect semantic execution").intent, "semantic-execution-inspect");
});
