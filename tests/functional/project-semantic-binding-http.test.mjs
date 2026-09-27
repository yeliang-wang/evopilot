import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {projectSemanticBindingFixture} from "../helpers/project-semantic-binding-fixture.mjs";
import {createServer} from "../../packages/server/dist/index.js";
import {FileStore} from "../../packages/server/dist/storage/file-store/index.js";

async function fixture(t, overrides = {}) {
  const f = await projectSemanticBindingFixture(t), store = new FileStore(f.configuration.dataRoot);
  store.writeProject({...f.access.project, name: "Synthetic", createdAt: f.access.project.updatedAt,
    validation: {status: "VERIFIED", checkedAt: f.access.project.updatedAt, message: "synthetic only"}});
  const options = {dataRoot: f.configuration.dataRoot, runtimeMode: "debug", llmClient: {}, allowSampleData: false, autoRegisterProfileProject: false,
    harnessRegistryConfig: f.configuration.registryConfigPath, semanticCatalogPolicyPath: f.configuration.policyPath,
    tokens: [
      {name: "actual-reviewer", token: "synthetic-operator", role: "operator", tenantId: f.scope.tenantId, workspaceId: f.scope.workspaceId},
      {name: "viewer", token: "synthetic-viewer", role: "viewer", tenantId: f.scope.tenantId, workspaceId: f.scope.workspaceId},
      {name: "foreign", token: "synthetic-foreign", role: "admin", tenantId: "other", workspaceId: "other"}
    ], ...overrides};
  const server = createServer(options); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/projects/${f.scope.projectId}/semantic-binding`;
  const request = async (suffix = "", body, headers = {}) => {
    const response = await fetch(base + suffix, {method: body === undefined ? "GET" : "POST", headers: {
      authorization: "Bearer synthetic-operator", "content-type": "application/json", ...headers}, ...(body === undefined ? {} : {body: typeof body === "string" ? body : JSON.stringify(body)})});
    return {status: response.status, body: await response.json(), headers: response.headers};
  };
  const prepare = async () => {const r = await request("/reviews", f.selection); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.data;};
  return {...f, store, request, prepare, options, server};
}
test("real HTTP exact review/approval/read records server principal and survives idempotent response retry", async t => {
  const f = await fixture(t), review = await f.prepare();
  assert.equal((await f.request()).status, 404);
  const body = {reviewDigest: review.reviewDigest, decision: "APPROVE"};
  const approved = await f.request("/approvals", body, {"x-evopilot-actor": "forged-admin"});
  assert.equal(approved.status, 200, JSON.stringify(approved.body)); assert.equal(approved.headers.get("cache-control"), "no-store");
  assert.equal(approved.body.data.decision.principal.id, "actual-reviewer");
  assert.equal(approved.body.data.binding.eligibleForExecution, false);
  assert.deepEqual((await f.request("/approvals", body)).body.data, approved.body.data);
  assert.deepEqual((await f.request("", undefined, {authorization: "Bearer synthetic-viewer"})).body.data, approved.body.data);
  const records = f.store.listAudit().filter(row => row.action === "project-semantic-binding.approved");
  assert.equal(records.length, 2); assert(records.every(row => row.actor === "actual-reviewer"));
});
for (const token of ["synthetic-viewer", "synthetic-foreign"]) test(`HTTP ${token} cannot prepare or approve by forging actor/role`, async t => {
  const f = await fixture(t), review = await f.prepare();
  for (const [suffix, body] of [["/reviews", f.selection], ["/approvals", {reviewDigest: review.reviewDigest, decision: "APPROVE"}]]) {
    const r = await f.request(suffix, body, {authorization: `Bearer ${token}`, "x-evopilot-actor": "actual-reviewer"});
    assert.equal(r.status, 403); assert(r.body.requestId); assert(!r.body.data);
  }
});
test("HTTP rejects unknown authority fields, invalid selectors, query injection and oversized/invalid JSON", async t => {
  const f = await fixture(t), review = await f.prepare();
  for (const body of [ {...f.selection, actor: "admin"}, {...f.selection, policyPath: "/tmp"}, {...f.selection, catalogId: "../escape"}, {...f.selection, bundleDigest: "bad"}, "{", "x".repeat(2050)]) {
    assert.equal((await f.request("/reviews", body)).status, 400);
  }
  for (const body of [{reviewDigest: review.reviewDigest, decision: "APPROVE", approved: true}, {reviewDigest: review.reviewDigest, decision: "REJECT"}, {reviewDigest: "bad", decision: "APPROVE"}]) assert.equal((await f.request("/approvals", body)).status, 400);
  assert.equal((await f.request("/reviews?actor=admin", f.selection)).status, 400);
  assert.equal((await f.request("/reviews", f.selection, {"content-type": "text/plain"})).status, 400);
});
test("HTTP persisted suspension between review and approval does not write a binding", async t => {
  const f = await fixture(t), review = await f.prepare();
  f.store.writeUser({id: "actual-reviewer", username: "actual-reviewer", passwordHash: "synthetic-hash", role: "operator",
    tenantId: f.scope.tenantId, workspaceId: f.scope.workspaceId, status: "SUSPENDED", platformAdmin: false, mustChangePassword: false});
  assert.equal((await f.request("/approvals", {reviewDigest: review.reviewDigest, decision: "APPROVE"})).status, 403);
  await assert.rejects(fs.stat(path.join(f.configuration.dataRoot, "project-semantic-bindings/projects")), {code: "ENOENT"});
});
test("HTTP current policy revocation returns redacted failure and leaves review unapproved", async t => {
  const f = await fixture(t), review = await f.prepare();
  f.policy.catalogs[0].permission = "DENIED"; await f.write("policy.json", f.policy);
  const response = await f.request("/approvals", {reviewDigest: review.reviewDigest, decision: "APPROVE"});
  assert.equal(response.status, 403); assert(!JSON.stringify(response.body).includes(f.root));
  assert.equal((await f.request()).status, 404);
});
test("HTTP no credentials or production LLM readiness cannot be bypassed by binding routes", async t => {
  const f = await fixture(t); assert.equal((await f.request("/reviews", f.selection, {authorization: ""})).status, 401);
  const prod = await fixture(t, {runtimeMode: "prod"});
  const response = await prod.request("/reviews", prod.selection);
  assert.equal(response.status, 409); assert.equal(response.body.error, "LLM_PROFILE_REQUIRED");
});
test("fresh local server reconstructs the exact binding without approval replay", async t => {
  const f = await fixture(t), review = await f.prepare();
  const before = await f.request("/approvals", {reviewDigest: review.reviewDigest, decision: "APPROVE"});
  assert.equal(before.status, 200);
  await new Promise(resolve => {f.server.closeAllConnections(); f.server.close(resolve);});
  const restarted = createServer(f.options); await new Promise(resolve => restarted.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => {restarted.closeAllConnections(); restarted.close(resolve);}));
  const response = await fetch(`http://127.0.0.1:${restarted.address().port}/api/v1/projects/${f.scope.projectId}/semantic-binding`, {headers: {authorization: "Bearer synthetic-viewer"}});
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).data, before.body.data);
});
test("HTTP transition review, exact approval and rollback are scoped, audited and server owned", async t => {
  const f = await fixture(t), initialReview = await f.prepare();
  const initial = (await f.request("/approvals", {reviewDigest: initialReview.reviewDigest, decision: "APPROVE"})).body.data;
  const transition = async (action, destinationDigest) => {
    const head = await f.request("/activation"); assert.equal(head.status, 200, JSON.stringify(head.body));
    const prepared = await f.request("/transition-reviews", {action, expectedHeadDigest: head.body.data.headDigest, destinationDigest});
    assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
    const value = {transitionReviewDigest: prepared.body.data.transitionReviewDigest, decision: "APPROVE"};
    for (const token of ["synthetic-viewer", "synthetic-foreign"]) {
      assert.equal((await f.request("/transition-approvals", value, {authorization: `Bearer ${token}`, "x-evopilot-actor": "admin"})).status, 403);
    }
    assert.equal((await f.request("/transition-approvals", {...value, actor: "admin"})).status, 400);
    const result = await f.request("/transition-approvals", value, {"x-evopilot-actor": "forged-admin"});
    assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(result.body.data.decision.principal.id, "actual-reviewer"); return result.body.data;
  };
  await transition("ACTIVATE", initial.binding.bindingDigest);
  f.policy.catalogs[0].trustContext = "reviewed-successor"; await f.write("policy.json", f.policy);
  const successor = await f.prepare(); const migrated = await transition("MIGRATE", successor.reviewDigest);
  assert.equal((await f.request()).body.data.binding.bindingDigest, migrated.destination.binding.bindingDigest);
  await transition("ROLLBACK", initial.binding.bindingDigest);
  assert.deepEqual((await f.request()).body.data, initial);
  assert.equal((await f.request("/activation", undefined, {authorization: "Bearer synthetic-viewer"})).body.data.transitions.length, 3);
  assert.equal((await f.request("/activation", undefined, {authorization: "Bearer synthetic-foreign"})).status, 403);
  const audit = f.store.listAudit().filter(r => r.action === "project-semantic-binding.transition-approved");
  assert.equal(audit.length, 3); assert(audit.every(r => r.actor === "actual-reviewer"));
});
