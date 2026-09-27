import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import {createServer} from "../../packages/server/dist/index.js";
import {FileStore} from "../../packages/server/dist/storage/file-store/index.js";
import {semanticConsumerFixture} from "../helpers/semantic-consumer-fixture.mjs";

async function fixture(t, overrides = {}) {
  const f = await semanticConsumerFixture(t), scope = f.generation.sets[0].scope;
  const dataRoot = path.join(f.root, "runtime-data");
  const store = new FileStore(dataRoot), now = "2026-09-22T00:00:00Z";
  store.writeProject({id: scope.projectId, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
    name: "Synthetic project", profileId: "synthetic", createdAt: now, updatedAt: now,
    validation: {status: "VERIFIED", checkedAt: now, message: "fixture only"}});
  const options = {dataRoot, runtimeMode: "debug", llmClient: {}, allowSampleData: false, autoRegisterProfileProject: false,
    harnessRegistryConfig: path.join(f.root, "registry.yaml"), semanticCatalogPolicyPath: path.join(f.root, "policy.json"),
    tokens: [{name: "semantic-reader", token: "synthetic-reader", role: "viewer", tenantId: scope.tenantId, workspaceId: scope.workspaceId},
      {name: "foreign-admin", token: "synthetic-foreign", role: "admin", tenantId: "other", workspaceId: "other"}], ...overrides};
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
  const base = `http://127.0.0.1:${server.address().port}`;
  const endpoint = `/api/v1/projects/${scope.projectId}/semantic-catalogs/${f.generation.catalogId}`;
  async function get(suffix = "", init = {}) {
    const res = await fetch(base + endpoint + suffix, {method: init.method ?? "GET", headers: {authorization: "Bearer synthetic-reader", ...init.headers}});
    return {status: res.status, body: await res.json(), headers: res.headers};
  }
  return {...f, scope, store, options, server, base, endpoint, get};
}
test("real local HTTP composition returns only verified scoped discovery and correlated no-store evidence", async t => {
  const f = await fixture(t), a = await f.get();
  assert.equal(a.status, 200); assert.equal(a.headers.get("cache-control"), "no-store");
  assert.equal(a.body.data.schema, "evopilot-project-semantic-discovery/v1"); assert.equal(a.body.data.eligibleForExecution, false);
  assert.equal(a.body.data.bindingCreated, false); assert.deepEqual(a.body.data.sets[0].scope, f.scope);
  assert.equal((await f.get()).body.data.discoveryDigest, a.body.data.discoveryDigest);
  const serialized = JSON.stringify(a.body.data); assert(!serialized.includes(f.root)); assert(!serialized.includes("materials"));
});
test("HTTP rejects missing credentials before semantic discovery", async t => {
  const f = await fixture(t);
  for (const suffix of ["", "/onboarding"]) assert.equal((await f.get(suffix, {headers: {authorization: ""}})).status, 401);
});
test("platform admin in another scope cannot read project semantics", async t => {
  const f = await fixture(t), r = await f.get("", {headers: {authorization: "Bearer synthetic-foreign", "x-evopilot-actor": "semantic-reader"}});
  assert.equal(r.status, 403); assert.equal(r.body.error, "SEMANTIC_CATALOG_PERMISSION_DENIED"); assert(r.body.requestId);
});
test("semantic HTTP rejects query/path configuration injection without opening untrusted paths", async t => {
  const f = await fixture(t);
  for (const suffix of ["?root=/tmp", "?policyPath=/tmp", "?validateMaterials=true", "?projectId=other", "?limit=1", "?catalogId=other&catalogId=other"]) {
    const r = await f.get(suffix); assert.equal(r.status, 400); assert.equal(r.body.error, "SEMANTIC_REQUEST_INVALID");
  }
  for (const id of ["a%2fb", "%00", "%ZZ"]) {
    const res = await fetch(`${f.base}/api/v1/projects/${id}/semantic-catalogs/${f.generation.catalogId}`, {headers: {authorization: "Bearer synthetic-reader"}});
    assert.equal(res.status, 400); assert.equal((await res.json()).error, "SEMANTIC_REQUEST_INVALID");
  }
});
test("semantic endpoint exposes no POST/PATCH/DELETE asset or binding mutation", async t => {
  const f = await fixture(t);
  for (const suffix of ["", "/onboarding"]) for (const method of ["POST", "PATCH", "DELETE"]) assert.equal((await f.get(suffix, {method})).status, 404);
});
test("missing independent policy fails closed without legacy fallback", async t => {
  const f = await fixture(t, {semanticCatalogPolicyPath: undefined});
  for (const suffix of ["", "/onboarding"]) {
    const r = await f.get(suffix); assert.equal(r.status, 409); assert.equal(r.body.error, "SEMANTIC_CATALOG_TRUST_REQUIRED"); assert.equal(r.body.data, undefined);
  }
});
test("policy revocation is visible on the next HTTP read, not cached", async t => {
  const f = await fixture(t); assert.equal((await f.get()).status, 200);
  f.policy.catalogs[0].permission = "DENIED"; await f.write("policy.json", f.policy);
  const r = await f.get(); assert.equal(r.status, 403); assert.equal(r.body.data, undefined);
});
test("persisted user suspension invalidates static-token semantic HTTP access", async t => {
  const f = await fixture(t); assert.equal((await f.get()).status, 200);
  f.store.writeUser({id: "semantic-reader", username: "semantic-reader", passwordHash: "synthetic-hash", role: "viewer",
    tenantId: f.scope.tenantId, workspaceId: f.scope.workspaceId, status: "SUSPENDED", platformAdmin: false, mustChangePassword: false});
  assert.equal((await f.get("", {headers: {"x-evopilot-actor": "somebody-else"}})).status, 403);
});
test("project ownership change invalidates semantic discovery", async t => {
  const f = await fixture(t); assert.equal((await f.get()).status, 200);
  f.store.writeProject({...f.store.readProject(f.scope.projectId), workspaceId: "moved"}); assert.equal((await f.get()).status, 403);
});
test("material corruption yields a redacted error and no partial discovery", async t => {
  const f = await fixture(t); const material = f.generation.entries.find(entry => !entry.parent);
  await fs.writeFile(path.join(f.root, material.path), "corrupt fixture");
  const r = await f.get(); assert.equal(r.status, 409); assert.equal(r.body.data, undefined);
  assert(!JSON.stringify(r.body).includes(f.root)); assert(!JSON.stringify(r.body).includes("corrupt fixture"));
});
test("production setup-only LLM readiness gate remains ahead of semantic HTTP", async t => {
  const f = await fixture(t, {runtimeMode: "prod"});
  for (const suffix of ["", "/onboarding"]) {
    const r = await f.get(suffix); assert.equal(r.status, 409); assert.equal(r.body.error, "LLM_PROFILE_REQUIRED"); assert.equal(r.body.data, undefined);
  }
});
test("HTTP compatibility requires two exact digest selectors and returns no binding", async t => {
  const f = await fixture(t), set = (await f.get()).body.data.sets[0];
  const query = new URLSearchParams({artifactSetDigest: set.artifactSetDigest, bundleDigest: set.harnessBundles[0].digest});
  const result = await f.get(`/compatibility?${query}`);
  assert.equal(result.status, 200); assert.equal(result.body.data.report.status, "INDETERMINATE"); assert.equal(result.body.data.bindingCreated, false);
  for (const suffix of ["/compatibility", `/compatibility?${query}&root=/tmp`, `/compatibility?${query}&bundleDigest=${set.harnessBundles[0].digest}`, "/compatibility?artifactSetDigest=bad&bundleDigest=bad"]) {
    assert.equal((await f.get(suffix)).status, 400);
  }
  assert.equal((await f.get(`/compatibility?${query}`, {headers: {authorization: "Bearer synthetic-foreign"}})).status, 403);
});
