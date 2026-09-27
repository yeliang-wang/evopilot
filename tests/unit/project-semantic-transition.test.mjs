import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {projectSemanticBindingFixture} from "../helpers/project-semantic-binding-fixture.mjs";
import {createProjectSemanticBindingService} from "../../packages/server/dist/application/project-semantic-binding.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

async function fixture(t) {
  const f = await projectSemanticBindingFixture(t);
  const review = await f.service.prepare({...f.input, ...f.selection});
  const initial = await f.service.approve({...f.input, reviewDigest: review.reviewDigest});
  const restart = () => createProjectSemanticBindingService(f.configuration);
  const prepare = async (action, destinationDigest) => f.service.prepareTransition({...f.input, action, destinationDigest,
    expectedHeadDigest: (await f.service.activation(f.input)).headDigest});
  const approve = (r, service = f.service) => service.approveTransition({...f.input, transitionReviewDigest: r.transitionReviewDigest});
  const activate = async () => approve(await prepare("ACTIVATE", initial.binding.bindingDigest));
  async function successor(label = "successor") {
    f.policy.catalogs[0].trustContext = label; await f.write("policy.json", f.policy);
    return f.service.prepare({...f.input, ...f.selection});
  }
  return {...f, initial, restart, prepare, approve, activate, successor};
}
test("explicit activation, migration and rollback append receipts; restart and old binding read remain exact", async t => {
  const f = await fixture(t), initialBytes = await fs.readFile(path.join(f.configuration.dataRoot, "project-semantic-bindings/projects", d(f.scope).slice(7) + ".json"), "utf8");
  assert.equal((await f.service.activation(f.input)).status, "REVIEWED_DEFAULT");
  const activation = await f.activate();
  assert.equal(activation.review.grantsExecutionAuthority, false);
  const successor = await f.successor(), review = await f.prepare("MIGRATE", successor.reviewDigest);
  assert.equal(review.effect, "FUTURE_EXECUTION_PLANS_ONLY");
  assert.equal((await f.service.inspect(f.input)).binding.bindingDigest, f.initial.binding.bindingDigest);
  const migrated = await f.approve(review);
  assert.notEqual(migrated.destination.binding.bindingDigest, f.initial.binding.bindingDigest);
  assert.deepEqual(await f.restart().inspect(f.input), migrated.destination);
  assert.deepEqual(await f.restart().inspect({...f.input, bindingDigest: f.initial.binding.bindingDigest}), f.initial);
  assert.deepEqual(await f.approve(review, f.restart()), migrated);
  const rollback = await f.approve(await f.prepare("ROLLBACK", f.initial.binding.bindingDigest));
  assert.deepEqual(await f.restart().inspect(f.input), f.initial);
  const before = await f.service.activation(f.input);
  assert.equal(before.headDigest, rollback.transitionDigest); assert.equal(before.transitions.length, 3);
  // A lost old response may be read back, but cannot reactivate its destination.
  assert.deepEqual(await f.approve(review), migrated);
  assert.deepEqual(await f.service.activation(f.input), before);
  assert.equal(await fs.readFile(path.join(f.configuration.dataRoot, "project-semantic-bindings/projects", d(f.scope).slice(7) + ".json"), "utf8"), initialBytes);
});
test("concurrent exact decisions converge; another principal never adopts the original approval", async t => {
  const f = await fixture(t), r = await f.prepare("ACTIVATE", f.initial.binding.bindingDigest);
  const results = await Promise.all([f.approve(r), f.approve(r, f.restart())]);
  assert.deepEqual(results[0], results[1]);
  f.access.principal.id = "other-operator";
  await assert.rejects(f.approve(r), {code: "IDENTITY_CONFLICT"});
  assert.equal((await f.service.activation(f.input)).transitions.length, 1);
});
test("stale sibling reviews cannot overwrite a committed expected-head slot", async t => {
  const f = await fixture(t); await f.activate();
  const a = await f.prepare("MIGRATE", (await f.successor("a")).reviewDigest);
  const b = await f.prepare("MIGRATE", (await f.successor("b")).reviewDigest);
  await f.approve(b);
  await assert.rejects(f.approve(a), {code: "DRIFT"});
  assert.equal((await f.service.activation(f.input)).transitions.length, 2);
});
for (const [name, mutate, code] of [
  ["viewer", f => {f.access.principal.role = "viewer";}, "PERMISSION_DENIED"],
  ["foreign scope", f => {f.access.principal.tenantId = "other";}, "PERMISSION_DENIED"],
  ["project revision", f => {f.access.project.updatedAt = "changed";}, "DRIFT"],
  ["permission revoked", async f => {f.policy.catalogs[0].permission = "DENIED"; await f.write("policy.json", f.policy);}, "PERMISSION_DENIED"],
  ["review material drift", async f => {f.policy.catalogs[0].trustContext = "changed-after-review"; await f.write("policy.json", f.policy);}, "DRIFT"]
]) test(`migration decision refuses ${name} without adding a transition`, async t => {
  const f = await fixture(t); await f.activate();
  const r = await f.prepare("MIGRATE", (await f.successor()).reviewDigest);
  await mutate(f); await assert.rejects(f.approve(r), {code});
  assert.equal((await fs.readdir(path.join(f.configuration.dataRoot, "project-semantic-bindings/project-transitions"))).length, 1);
});
test("cancelled transition and forged current role during validation never commit", async t => {
  const f = await fixture(t), r = await f.prepare("ACTIVATE", f.initial.binding.bindingDigest);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.service.approveTransition({...f.input, transitionReviewDigest: r.transitionReviewDigest, signal: controller.signal}), {code: "CANCELLED"});
  let calls = 0;
  await assert.rejects(f.service.approveTransition({...f.input, transitionReviewDigest: r.transitionReviewDigest,
    currentAccess: () => {if (++calls === 8) f.access.principal.id = "replacement"; return f.access;}}), {code: "DRIFT"});
  await assert.rejects(fs.stat(path.join(f.configuration.dataRoot, "project-semantic-bindings/project-transitions")), {code: "ENOENT"});
});
test("unknown rollback, no-op migration and migration before activation are refused", async t => {
  const f = await fixture(t), successor = await f.successor();
  await assert.rejects(f.prepare("MIGRATE", successor.reviewDigest), {code: "PERMISSION_DENIED"});
  await f.activate();
  await assert.rejects(f.prepare("ROLLBACK", d("unknown")), {code: "UNAVAILABLE"});
  await assert.rejects(f.prepare("ROLLBACK", f.initial.binding.bindingDigest), {code: "IDENTITY_CONFLICT"});
  await assert.rejects(f.prepare("ACTIVATE", f.initial.binding.bindingDigest), {code: "IDENTITY_CONFLICT"});
  await assert.rejects(f.prepare("MIGRATE", f.initial.review.reviewDigest), {code: "IDENTITY_CONFLICT"});
});
test("rehashing an outer receipt cannot hide a broken review or predecessor link", async t => {
  const f = await fixture(t); await f.activate();
  const file = path.join(f.configuration.dataRoot, "project-semantic-bindings/project-transitions", d({scope: f.scope, predecessorDigest: f.initial.binding.bindingDigest}).slice(7) + ".json");
  const doc = JSON.parse(await fs.readFile(file, "utf8")); doc.value.review.expectedHeadDigest = d("wrong");
  const {recordDigest, ...body} = doc; doc.recordDigest = d(body); await fs.writeFile(file, JSON.stringify(doc));
  await assert.rejects(f.restart().activation(f.input), {code: "DRIFT"});
  await assert.rejects(f.restart().inspect(f.input), {code: "DRIFT"});
});
test("read-only activation and historical inspection do not create records", async t => {
  const f = await fixture(t); await f.activate();
  const root = path.join(f.configuration.dataRoot, "project-semantic-bindings");
  const snapshot = async () => Object.fromEntries(await Promise.all((await fs.readdir(root, {recursive: true})).filter(p => p.endsWith(".json")).map(async p => [p, await fs.readFile(path.join(root, p), "utf8")])));
  const before = await snapshot(); f.access.principal.role = "viewer";
  await f.restart().activation(f.input); await f.restart().inspect({...f.input, bindingDigest: f.initial.binding.bindingDigest});
  assert.deepEqual(await snapshot(), before);
});
test("independent processes elect one exact activation receipt without replacing files", async t => {
  const f = await fixture(t), review = await f.prepare("ACTIVATE", f.initial.binding.bindingDigest);
  const module = new URL("../../packages/server/dist/application/project-semantic-binding.js", import.meta.url).href;
  const script = `import {createProjectSemanticBindingService} from ${JSON.stringify(module)};
    const service = createProjectSemanticBindingService(${JSON.stringify(f.configuration)});
    const record = await service.approveTransition({projectId:${JSON.stringify(f.scope.projectId)}, currentAccess:()=>(${JSON.stringify(f.access)}), transitionReviewDigest:${JSON.stringify(review.transitionReviewDigest)}});
    console.log(JSON.stringify(record));`;
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script]); let stdout = "", stderr = "";
    child.stdout.on("data", b => {stdout += b;}); child.stderr.on("data", b => {stderr += b;}); child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error(stderr)));
  });
  const [a, b] = await Promise.all([run(), run()]); assert.deepEqual(a, b);
  assert.equal((await f.service.activation(f.input)).transitions.length, 1);
});
test("a project revision change requires a fresh migration review and prevents rollback to a stale project revision", async t => {
  const f = await fixture(t), activated = await f.activate();
  f.access.project.updatedAt = "2026-09-24T01:00:00Z";
  await assert.rejects(f.service.inspect(f.input), {code: "DRIFT"});
  const successor = await f.successor();
  const review = await f.service.prepareTransition({...f.input, action: "MIGRATE", destinationDigest: successor.reviewDigest, expectedHeadDigest: activated.transitionDigest});
  assert(review.changedFields.includes("projectRevisionDigest"));
  const migrated = await f.approve(review); assert.deepEqual(await f.service.inspect(f.input), migrated.destination);
  await assert.rejects(f.prepare("ROLLBACK", f.initial.binding.bindingDigest), {code: "DRIFT"});
});
test("exact 64-transition capacity stays readable and never prunes or admits a 65th transition", async t => {
  const f = await fixture(t); await f.activate();
  for (let i = 1; i < 64; i++) await f.approve(await f.prepare("MIGRATE", (await f.successor(`revision-${i}`)).reviewDigest));
  const before = await f.service.activation(f.input); assert.equal(before.transitions.length, 64);
  await assert.rejects(f.prepare("ROLLBACK", f.initial.binding.bindingDigest), {code: "DRIFT"});
  assert.deepEqual(await f.restart().activation(f.input), before);
});
