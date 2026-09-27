import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {semanticConsumerFixture} from "../helpers/semantic-consumer-fixture.mjs";
import {createProjectSemanticDiscoveryService} from "../../packages/server/dist/application/project-semantic-discovery.js";
import {digestObject} from "../../packages/server/dist/domains/harness-template/utils.js";

async function fixture(t) {
  const f = await semanticConsumerFixture(t), scope = f.generation.sets[0].scope;
  const access = {principal: {id: "reader@example.test", role: "viewer", tenantId: scope.tenantId, workspaceId: scope.workspaceId},
    project: {id: scope.projectId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, profileId: "profile", updatedAt: "2026-09-22T00:00:00Z"}};
  const configuration = {registryConfigPath: path.join(f.root, "registry.yaml"), policyPath: path.join(f.root, "policy.json")};
  const service = createProjectSemanticDiscoveryService(configuration);
  return {...f, scope, access, configuration, service, inspect: (overrides = {}) => service.inspect({projectId: scope.projectId,
    catalogId: f.generation.catalogId, currentAccess: () => access, ...overrides})};
}
test("project discovery is stable allowlisted evidence, not a binding or execution authority", async t => {
  const f = await fixture(t), result = await f.inspect();
  assert.equal(result.status, "VERIFIED_DISCOVERY_ONLY"); assert.equal(result.eligibleForExecution, false); assert.equal(result.bindingCreated, false);
  assert.equal(result.sets.length, 1); assert(Object.isFrozen(result.sets[0]));
  const {discoveryDigest, ...core} = result; assert.equal(discoveryDigest, digestObject(core));
  assert.deepEqual(await f.inspect(), result);
  const text = JSON.stringify(result); for (const forbidden of [f.root, "materials", "publication", "grants", "authorizationDigest", "skillContent"]) assert(!text.includes(forbidden));
  f.configuration.policyPath = "/not-used"; assert.deepEqual(await f.inspect(), result);
});
for (const [name, change] of [
  ["missing principal", a => {delete a.principal;}], ["missing project", a => {delete a.project;}],
  ["cross tenant", a => {a.principal.tenantId = "other";}], ["cross workspace", a => {a.principal.workspaceId = "other";}],
  ["other project identity", a => {a.project.id = "other";}], ["invalid role", a => {a.principal.role = "owner";}]
]) test(`discovery rejects ${name} before Catalog reads`, async t => {
  const f = await fixture(t); change(f.access); await f.write("registry.yaml", {invalid: true});
  await assert.rejects(f.inspect(), {code: "PERMISSION_DENIED"});
});
for (const [name, change, code] of [
  ["account revocation", a => {delete a.principal;}, "PERMISSION_DENIED"],
  ["project ownership", a => {a.project.workspaceId = "other";}, "PERMISSION_DENIED"],
  ["project revision", a => {a.project.updatedAt = "2026-09-23T00:00:00Z";}, "DRIFT"],
  ["principal replacement", a => {a.principal.id = "replacement";}, "DRIFT"],
  ["role downgrade", a => {a.principal.role = "operator";}, "DRIFT"]
]) test(`final current-authority check rejects ${name} without a partial result`, async t => {
  const f = await fixture(t); let calls = 0;
  await assert.rejects(f.inspect({currentAccess: () => {if (++calls === 3) change(f.access); return f.access;}}), {code});
  assert.equal(calls, 3);
});
test("missing independent configuration never falls back to legacy Catalogs", async t => {
  const f = await fixture(t); await assert.rejects(createProjectSemanticDiscoveryService({registryConfigPath: f.configuration.registryConfigPath}).inspect({
    projectId: f.scope.projectId, catalogId: f.generation.catalogId, currentAccess: () => f.access}), {code: "TRUST_REQUIRED"});
});
test("request identity rejects traversal without invoking the server resolver", async t => {
  const f = await fixture(t); await assert.rejects(f.inspect({projectId: "../escape", currentAccess: () => {throw Error("must not run");}}), {code: "SCOPE_INVALID"});
});
test("cancellation remains within the shared bounded read operation", async t => {
  const f = await fixture(t), controller = new AbortController(); controller.abort();
  await assert.rejects(f.inspect({signal: controller.signal}), {code: "CANCELLED"});
});
test("service evaluates only explicitly selected published members of one verified set", async t => {
  const f = await fixture(t), discovered = await f.inspect(); const set = discovered.sets[0];
  const selection = {projectId: f.scope.projectId, catalogId: f.generation.catalogId, currentAccess: () => f.access,
    artifactSetDigest: set.artifactSetDigest, bundleDigest: set.harnessBundles[0].digest};
  const result = await f.service.compatibility(selection);
  assert.equal(result.report.status, "INDETERMINATE"); assert.deepEqual(result.report.reasons, ["REQUIREMENTS_NOT_DECLARED"]);
  assert.equal(result.bindingCreated, false); assert.equal(result.eligibleForExecution, false);
  assert.equal(result.report.bundleRef.digest, selection.bundleDigest);
  await assert.rejects(f.service.compatibility({...selection, bundleDigest: digestObject("missing")}), {code: "UNAVAILABLE"});
  await assert.rejects(f.service.compatibility({...selection, artifactSetDigest: "../unsafe"}), {code: "INVALID"});
});
test("compatibility repeats current permission checks and never reuses discovery as authority", async t => {
  const f = await fixture(t), set = (await f.inspect()).sets[0];
  f.policy.catalogs[0].permission = "DENIED"; await f.write("policy.json", f.policy);
  await assert.rejects(f.service.compatibility({projectId: f.scope.projectId, catalogId: f.generation.catalogId, currentAccess: () => f.access,
    artifactSetDigest: set.artifactSetDigest, bundleDigest: set.harnessBundles[0].digest}), {code: "PERMISSION_DENIED"});
});
test("gap service revalidates exact published pair, cancellation and current access", async t => {
  const f = await fixture(t), set = (await f.inspect()).sets[0];
  const input = {projectId: f.scope.projectId, catalogId: f.generation.catalogId, currentAccess: () => f.access,
    artifactSetDigest: set.artifactSetDigest, bundleDigest: set.harnessBundles[0].digest};
  const gap = await f.service.gap(input);
  assert.equal(gap.compatibilityStatus, "INDETERMINATE");
  assert.deepEqual(gap.findings, [{reason: "REQUIREMENTS_NOT_DECLARED", destination: "HARNESS_DECLARATION_REVIEW"}]);
  assert.deepEqual(await createProjectSemanticDiscoveryService(f.configuration).gap(input), gap);
  await assert.rejects(f.service.gap({...input, bundleDigest: digestObject("missing")}), {code: "UNAVAILABLE"});
  const abort = new AbortController(); abort.abort(); await assert.rejects(f.service.gap({...input, signal: abort.signal}), {code: "CANCELLED"});
  let calls = 0;
  await assert.rejects(f.service.gap({...input, currentAccess: () => {
    if (++calls === 3) f.access.project.updatedAt = "2026-09-24T00:00:00Z"; return f.access;
  }}), {code: "DRIFT"});
  f.access.principal.workspaceId = "foreign"; await assert.rejects(f.service.gap(input), {code: "PERMISSION_DENIED"});
});
