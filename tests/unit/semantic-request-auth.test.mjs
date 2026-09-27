import assert from "node:assert/strict";
import test from "node:test";
import {resolveSemanticRequestPrincipal} from "../../packages/server/dist/runtime/semantic-request-auth.js";
import {resolveRuntimeConfig, userSessionToken} from "../../packages/server/dist/runtime/runtime-auth.js";

function fixture() {
  const token = {name: "reader", token: "synthetic-only", role: "viewer", tenantId: "tenant", workspaceId: "workspace"};
  const records = [], options = {runtimeMode: "debug", tokens: [token]}, request = {headers: {authorization: "Bearer synthetic-only"}};
  const read = () => resolveSemanticRequestPrincipal({request, options, tokens: options.tokens, runtime: resolveRuntimeConfig(options),
    store: {listUsers: (_tenant, suspended = true) => records.filter(user => suspended || user.status === "ACTIVE")}});
  return {token, records, options, request, read};
}
test("semantic principal is credential identity, never the spoofable actor header", () => {
  const f = fixture(); f.request.headers["x-evopilot-actor"] = "admin";
  assert.deepEqual(f.read(), {id: "reader", role: "viewer", tenantId: "tenant", workspaceId: "workspace"});
});
test("credential scope wins over arbitrary request scope headers", () => {
  const f = fixture(); f.request.headers["x-evopilot-tenant"] = "other"; f.request.headers["x-evopilot-workspace"] = "other";
  assert.equal(f.read().tenantId, "tenant"); assert.equal(f.read().workspaceId, "workspace");
});
for (const header of [undefined, "Bearer unknown", "Basic synthetic-only", ""]) test(`semantic route rejects absent or invalid bearer (${header ?? "absent"})`, () => {
  const f = fixture(); f.request.headers.authorization = header; assert.equal(f.read(), undefined);
});
for (const [field, value] of [["status", "SUSPENDED"], ["role", "admin"], ["tenantId", "other"], ["workspaceId", "other"], ["mustChangePassword", true]]) {
  test(`persisted ${field} change cannot be hidden by a static token/debug projection`, () => {
    const f = fixture(); f.records.push({username: "reader", status: "ACTIVE", role: "viewer", tenantId: "tenant", workspaceId: "workspace", passwordHash: "synthetic-hash"});
    assert(f.read()); f.records[0][field] = value; assert.equal(f.read(), undefined);
  });
}
test("configured suspended users cannot authenticate through old session tokens", () => {
  const f = fixture(); f.options.tokens = []; const user = {username: "configured", password: "synthetic-only", role: "viewer", tenantId: "tenant", workspaceId: "workspace", status: "ACTIVE"};
  f.options.users = [user]; f.request.headers.authorization = `Bearer ${userSessionToken(user)}`;
  assert(f.read()); user.status = "SUSPENDED"; assert.equal(f.read(), undefined);
});
test("current token removal invalidates further semantic reads", () => {
  const f = fixture(); assert(f.read()); f.options.tokens.length = 0; assert.equal(f.read(), undefined);
});
test("debug token projection cannot mask an explicitly suspended configured user", () => {
  const f = fixture(); f.options.users = [{username: "reader", password: "synthetic-only", role: "viewer", tenantId: "tenant", workspaceId: "workspace", status: "SUSPENDED"}];
  assert.equal(f.read(), undefined);
});
