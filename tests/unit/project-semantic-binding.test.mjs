import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {projectSemanticBindingFixture} from "../helpers/project-semantic-binding-fixture.mjs";
import {createProjectSemanticBindingService} from "../../packages/server/dist/application/project-semantic-binding.js";
import {digestObject} from "../../packages/server/dist/domains/harness-template/utils.js";

async function prepare(f) {return f.service.prepare({...f.input, ...f.selection});}
async function approve(f, reviewDigest) {return f.service.approve({...f.input, reviewDigest});}
test("exact reviewed minimal map persists provenance, real principal and immutable canonical digests across restart", async t => {
  const f = await projectSemanticBindingFixture(t), r = await prepare(f);
  assert.deepEqual(await prepare(f), r); assert.equal(r.bindingCreated, false);
  await assert.rejects(f.service.inspect(f.input), {code: "UNAVAILABLE"});
  const record = await approve(f, r.reviewDigest);
  assert.equal(record.binding.schema, "evopilot-project-semantic-binding/v1");
  assert.equal(record.binding.status, "REVIEWED_NOT_ACTIVATED");
  assert.equal(record.binding.pins.artifactSetDigest, f.selection.artifactSetDigest);
  for (const key of ["snapshotDigest", "skillDigest", "provenanceDigest", "closureDigest", "reasoningProfileDigest"]) assert.match(record.binding.pins[key], /^sha256:[a-f0-9]{64}$/);
  assert.equal(record.decision.principal.id, "reviewer@example.test"); assert.equal(record.binding.eligibleForExecution, false);
  for (const [value, field] of [[record.review, "reviewDigest"], [record.decision, "decisionDigest"], [record.binding, "bindingDigest"]]) {
    const core = {...value}; delete core[field]; assert.equal(value[field], digestObject(core));
  }
  assert(Object.isFrozen(record.binding.pins));
  const restarted = createProjectSemanticBindingService(f.configuration);
  assert.deepEqual(await restarted.inspect(f.input), record);
  assert.deepEqual(await restarted.approve({...f.input, reviewDigest: r.reviewDigest}), record);
});
test("concurrent exact approvals converge on one immutable decision and original timestamp", async t => {
  const f = await projectSemanticBindingFixture(t), r = await prepare(f);
  const results = await Promise.all(Array.from({length: 4}, () => approve(f, r.reviewDigest)));
  assert(results.every(record => digestObject(record) === digestObject(results[0])));
});
for (const [name, change, code] of [
  ["viewer", f => {f.access.principal.role = "viewer";}, "PERMISSION_DENIED"],
  ["missing principal", f => {delete f.access.principal;}, "PERMISSION_DENIED"],
  ["foreign admin", f => {f.access.principal.role = "admin"; f.access.principal.tenantId = "other";}, "PERMISSION_DENIED"],
  ["project revision", f => {f.access.project.updatedAt = "later";}, "DRIFT"]
]) test(`approval rejects ${name} after preparation without installing a binding`, async t => {
  const f = await projectSemanticBindingFixture(t), r = await prepare(f); change(f);
  await assert.rejects(approve(f, r.reviewDigest), {code});
  await assert.rejects(fs.stat(path.join(f.configuration.dataRoot, "project-semantic-bindings/projects")), {code: "ENOENT"});
});
test("no implicit first match or arbitrary caller digest may approve a binding", async t => {
  const f = await projectSemanticBindingFixture(t);
  await assert.rejects(approve(f, digestObject("unissued")), {code: "UNAVAILABLE"});
  await assert.rejects(approve(f, "../unsafe"), {code: "INVALID"});
  await assert.rejects(f.service.prepare({...f.input, ...f.selection, bundleDigest: digestObject("missing")}), {code: "UNAVAILABLE"});
});
test("indeterminate legacy Bundle remains unbound; legacy Catalog is never auto-upgraded", async t => {
  const f = await projectSemanticBindingFixture(t, false);
  await assert.rejects(prepare(f), {code: "MATERIAL_INVALID"});
  await assert.rejects(fs.stat(path.join(f.configuration.dataRoot, "project-semantic-bindings")), {code: "ENOENT"});
});
test("current permission loss blocks approval, inspection and exact idempotent replay", async t => {
  const f = await projectSemanticBindingFixture(t), r = await prepare(f); await approve(f, r.reviewDigest);
  f.policy.catalogs[0].permission = "DENIED"; await f.write("policy.json", f.policy);
  for (const operation of [() => f.service.inspect(f.input), () => approve(f, r.reviewDigest)]) await assert.rejects(operation(), {code: "PERMISSION_DENIED"});
});
test("review authority change during asynchronous validation fails before write", async t => {
  const f = await projectSemanticBindingFixture(t), r = await prepare(f); let calls = 0;
  await assert.rejects(f.service.approve({...f.input, reviewDigest: r.reviewDigest, currentAccess: () => {
    if (++calls === 4) f.access.principal.id = "replacement"; return f.access;
  }}), {code: "DRIFT"});
  await assert.rejects(fs.stat(path.join(f.configuration.dataRoot, "project-semantic-bindings/projects")), {code: "ENOENT"});
});
test("fresh inspection digest is required at approval; current compatible global-policy change is not silently approved", async t => {
  const f = await projectSemanticBindingFixture(t), r = await prepare(f);
  f.policy.catalogs[0].trustContext = "updated-trusted-context"; await f.write("policy.json", f.policy);
  await assert.rejects(approve(f, r.reviewDigest), {code: "DRIFT"});
});
test("approved selected pins survive unrelated Registry growth and compatible policy metadata change", async t => {
  const f = await projectSemanticBindingFixture(t), r = await prepare(f), record = await approve(f, r.reviewDigest);
  f.registry.catalogs.push({id: "unrelated", root: "does-not-exist", enabled: false}); await f.write("registry.yaml", f.registry);
  f.policy.catalogs[0].trustContext = "updated-trusted-context"; await f.write("policy.json", f.policy);
  assert.deepEqual(await f.service.inspect(f.input), record);
  assert.deepEqual(await approve(f, r.reviewDigest), record);
  const successor = await prepare(f); assert.notEqual(successor.reviewDigest, r.reviewDigest);
  await assert.rejects(approve(f, successor.reviewDigest), {code: "IDENTITY_CONFLICT"});
});
test("another approver cannot relabel the original immutable approval", async t => {
  const f = await projectSemanticBindingFixture(t), r = await prepare(f); await approve(f, r.reviewDigest);
  f.access.principal.id = "other-operator";
  await assert.rejects(approve(f, r.reviewDigest), {code: "IDENTITY_CONFLICT"});
  assert.equal((await f.service.inspect(f.input)).decision.principal.id, "reviewer@example.test");
});
test("viewer may inspect an approved binding but cannot prepare or approve one", async t => {
  const f = await projectSemanticBindingFixture(t), r = await prepare(f), record = await approve(f, r.reviewDigest);
  f.access.principal.role = "viewer"; assert.deepEqual(await f.service.inspect(f.input), record);
  await assert.rejects(prepare(f), {code: "PERMISSION_DENIED"}); await assert.rejects(approve(f, r.reviewDigest), {code: "PERMISSION_DENIED"});
});
test("persisted decision tampering fails closed after restart", async t => {
  const f = await projectSemanticBindingFixture(t), r = await prepare(f); await approve(f, r.reviewDigest);
  const file = path.join(f.configuration.dataRoot, "project-semantic-bindings/projects", digestObject(f.scope).slice(7) + ".json");
  const doc = JSON.parse(await fs.readFile(file, "utf8")); doc.value.decision.principal.id = "forged";
  // Even a rewritten outer checksum cannot mask the broken review/decision/binding chain.
  delete doc.recordDigest; doc.recordDigest = digestObject(doc); await fs.writeFile(file, JSON.stringify(doc));
  await assert.rejects(createProjectSemanticBindingService(f.configuration).inspect(f.input), {code: "DIGEST_MISMATCH"});
});
test("changed published material is checked afresh, not trusted from stored approval", async t => {
  const f = await projectSemanticBindingFixture(t), r = await prepare(f); await approve(f, r.reviewDigest);
  const entry = f.generation.entries.find(e => !e.parent); await fs.writeFile(path.join(f.root, entry.path), "{}");
  await assert.rejects(f.service.inspect(f.input));
});
test("cancelled approval creates no binding", async t => {
  const f = await projectSemanticBindingFixture(t), r = await prepare(f), controller = new AbortController(); controller.abort();
  await assert.rejects(f.service.approve({...f.input, reviewDigest: r.reviewDigest, signal: controller.signal}), {code: "CANCELLED"});
  await assert.rejects(fs.stat(path.join(f.configuration.dataRoot, "project-semantic-bindings/projects")), {code: "ENOENT"});
});
