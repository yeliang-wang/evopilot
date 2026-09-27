import test from "node:test";
import assert from "node:assert/strict";
import {projectSemanticRequest, projectSemanticCapabilities, requireProjectSemanticCapability} from "../../packages/contracts/dist/index.js";

const digest = "sha256:" + "a".repeat(64);
const selection = {projectId: "project-a", catalogId: "catalog-a", artifactSetDigest: digest, bundleDigest: digest};
for (const [operation, input, method, suffix] of [
  ["capabilities", {projectId: selection.projectId}, "GET", "/semantic-capabilities"],
  ["inspect", {projectId: selection.projectId, catalogId: selection.catalogId}, "GET", "/semantic-catalogs/catalog-a"],
  ["onboarding", {projectId: selection.projectId, catalogId: selection.catalogId}, "GET", "/semantic-catalogs/catalog-a/onboarding"],
  ["compatibility", selection, "GET", "/semantic-catalogs/catalog-a/compatibility"],
  ["gap", selection, "GET", "/semantic-catalogs/catalog-a/gap"],
  ["review", selection, "POST", "/semantic-binding/reviews"],
  ["approve", {projectId: selection.projectId, reviewDigest: digest, decision: "APPROVE"}, "POST", "/semantic-binding/approvals"],
  ["binding", {projectId: selection.projectId}, "GET", "/semantic-binding"],
  ["activation", {projectId: selection.projectId}, "GET", "/semantic-binding/activation"],
  ["transitionReview", {projectId: selection.projectId, action: "MIGRATE", expectedHeadDigest: digest, destinationDigest: digest}, "POST", "/semantic-binding/transition-reviews"],
  ["transitionApprove", {projectId: selection.projectId, transitionReviewDigest: digest, decision: "APPROVE"}, "POST", "/semantic-binding/transition-approvals"]
]) test(`exact ${operation} transport does not invent selection or authority`, () => {
  const req = projectSemanticRequest(operation, input);
  assert.equal(req.method, method); assert.equal(req.path.split("?")[0], "/api/v1/projects/project-a" + suffix);
  assert.equal(req.capabilityPath, "/api/v1/projects/project-a/semantic-capabilities");
  requireProjectSemanticCapability(projectSemanticCapabilities("project-a"), "project-a", operation);
  for (const field of ["actor", "approved", "policyPath", "workspaceId", "payload", "executionAvailable"]) {
    assert.throws(() => projectSemanticRequest(operation, {...input, [field]: true}), /SEMANTIC_REQUEST_INVALID/);
  }
  for (const key of Object.keys(input)) {const missing = {...input}; delete missing[key]; assert.throws(() => projectSemanticRequest(operation, missing), /SEMANTIC_REQUEST_INVALID/);}
});
for (const id of ["..", "../x", "a/b", "a%2fb", "", "a".repeat(129), "a?actor=admin"]) test(`unsafe identifier ${JSON.stringify(id)} is rejected`, () => {
  assert.throws(() => projectSemanticRequest("binding", {projectId: id}), /SEMANTIC_REQUEST_INVALID/);
});
test("compatibility keeps exact digest query; review and approval are separate requests", () => {
  const req = projectSemanticRequest("compatibility", selection), url = new URL(req.path, "http://localhost");
  assert.deepEqual(Object.fromEntries(url.searchParams), {artifactSetDigest: digest, bundleDigest: digest});
  assert.equal(projectSemanticRequest("review", selection).body.decision, undefined);
  for (const decision of [undefined, true, "APPROVED", "REJECT", "approve"]) assert.throws(() => projectSemanticRequest("approve", {projectId: "p", reviewDigest: digest, decision}));
  assert.throws(() => projectSemanticRequest("activate", selection));
  assert.throws(() => projectSemanticRequest("review", {...selection, bundleDigest: "sha256:invalid"}));
});
test("legacy, mismatched, omitted or unadvertised capabilities never enable fallback", () => {
  for (const value of [undefined, {}, {version: "6.3.0"}, {...projectSemanticCapabilities("p"), schema: "future"},
    projectSemanticCapabilities("other"), {...projectSemanticCapabilities("p"), operations: ["inspect"]},
    {...projectSemanticCapabilities("p"), authority: "HOST"}]) {
    assert.throws(() => requireProjectSemanticCapability(value, "p", "approve"), /SEMANTIC_CAPABILITY_REQUIRED/);
  }
  const capabilities = projectSemanticCapabilities("p");
  assert.equal(capabilities.executionAvailable, false); assert.equal(capabilities.completionAvailable, false);
  assert(Object.isFrozen(capabilities)); assert(Object.isFrozen(capabilities.operations));
});

test("transition fields do not accept guessed action, approval substitution or malformed head/destination", () => {
  const input = {projectId: "p", action: "MIGRATE", expectedHeadDigest: digest, destinationDigest: digest};
  for (const action of ["ACTIVATE", "MIGRATE", "ROLLBACK"]) assert.equal(projectSemanticRequest("transitionReview", {...input, action}).body.action, action);
  for (const action of ["migrate", "LATEST", true, "APPROVE"]) assert.throws(() => projectSemanticRequest("transitionReview", {...input, action}));
  for (const field of ["expectedHeadDigest", "destinationDigest"]) assert.throws(() => projectSemanticRequest("transitionReview", {...input, [field]: "latest"}));
  assert.throws(() => projectSemanticRequest("transitionApprove", {projectId: "p", reviewDigest: digest, decision: "APPROVE"}));
  for (const decision of ["approve", true, undefined]) assert.throws(() => projectSemanticRequest("transitionApprove", {projectId: "p", transitionReviewDigest: digest, decision}));
  const old = {...projectSemanticCapabilities("p"), operations: ["capabilities", "inspect", "compatibility", "review", "approve", "binding"]};
  for (const operation of ["activation", "transitionReview", "transitionApprove"]) assert.throws(() => requireProjectSemanticCapability(old, "p", operation), /SEMANTIC_CAPABILITY_REQUIRED/);
});
