import test from "node:test";
import assert from "node:assert/strict";
import {SEMANTIC_EXECUTION_OPERATIONS, semanticExecutionRequest, semanticExecutionCapabilities, requireSemanticExecutionCapability} from "../../packages/contracts/dist/index.js";
const digest = "sha256:" + "a".repeat(64), identity = {projectId: "p", goalId: "g", targetId: "t", harnessBindingDigest: digest};
for (const operation of SEMANTIC_EXECUTION_OPERATIONS) test(`strict ${operation} request and capability negotiation`, () => {
  const body = ["planning", "draft"].includes(operation) ? {identity, runId: "run", requestDigest: digest, goalTarget: {},
    ...(operation === "draft" ? {basisDigest: digest, selection: {}, business: [{}], harness: [{}], selections: {}} : {})} :
    operation === "prepare" ? {identity, runId: "run", requestDigest: digest, goalTarget: {}, contextPlan: {}, outcomePlan: {}, selections: {}} :
    ["inspect", "bind"].includes(operation) ? {identity} : ["completePhase", "phaseReceipt"].includes(operation) ? {identity, runId: "run", phaseTargetId: "alpha"} : ["completeTarget", "completionReceipt", "completionStatus", "completeGoal", "goalReceipt"].includes(operation) ? {identity, runId: "run"} : {identity, bindingDigest: digest,
      ...(operation === "stageReceipt" ? {runId: "run", requestDigest: digest} : {}),
      ...(operation === "review" ? {coverage: []} : operation === "approveReview" ? {reviewDigest: digest, decision: "APPROVE"} : {})};
  const request = semanticExecutionRequest(operation, "p", body); assert.equal(request.method, "POST");
  assert.equal(request.path, `/api/v1/projects/p/semantic-execution/${operation}`); assert.deepEqual(request.body, body); assert.notEqual(request.body, body);
  requireSemanticExecutionCapability(semanticExecutionCapabilities("p", true, true, true), "p", operation);
  for (const field of ["actor", "approved", "command", "permissions", "currentHarness", "completionAvailable"]) assert.throws(() => semanticExecutionRequest(operation, "p", {...body, [field]: true}));
  for (const key of Object.keys(body)) {const missing = {...body}; delete missing[key]; assert.throws(() => semanticExecutionRequest(operation, "p", missing));}
  assert.throws(() => semanticExecutionRequest(operation, "other", body));
});
test("capabilities never imply approval, qualified execution or completion", () => {
  const c = semanticExecutionCapabilities("p", false); assert.equal(c.completionAvailable, false); assert(!c.operations.includes("dispatch"));
  assert.throws(() => requireSemanticExecutionCapability(c, "p", "dispatch"));
  assert(!c.operations.includes("collect")); assert.equal(c.collectorConfigured, false);
  assert.throws(() => requireSemanticExecutionCapability(c, "p", "collect"));
  for (const v of [undefined, {}, {version: "6.3.0"}, {...c, authority: "HOST"}, {...c, projectId: "other"}]) assert.throws(() => requireSemanticExecutionCapability(v, "p", "prepare"));
  for (const op of ["complete", "publish", "../dispatch"]) assert.throws(() => semanticExecutionRequest(op, "p", {identity}));
  assert.throws(() => semanticExecutionRequest("capabilities", "p", {})); assert.throws(() => semanticExecutionRequest("capabilities", "../p"));
  assert.throws(() => semanticExecutionRequest("approveReview", "p", {identity, bindingDigest: digest, reviewDigest: digest, decision: "REJECT"}));
  assert.throws(() => requireSemanticExecutionCapability({...c, operations: ["completeTarget"]}, "p", "completeTarget"));
  const enabled = semanticExecutionCapabilities("p", false, false, true);
  assert.equal(enabled.completionAvailable, true); assert.equal(enabled.phaseCompletionAvailable, true); assert.equal(enabled.releaseAvailable, false);
  assert.throws(() => requireSemanticExecutionCapability({...enabled, phaseCompletionAvailable: false}, "p", "completePhase"));
  assert.throws(() => requireSemanticExecutionCapability({...enabled, goalCompletionAvailable: false}, "p", "completeGoal"));
  requireSemanticExecutionCapability(enabled, "p", "completeTarget");
});
