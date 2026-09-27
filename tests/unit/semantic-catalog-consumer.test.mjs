import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {test} from "node:test";
import {semanticConsumerFixture} from "../helpers/semantic-consumer-fixture.mjs";

test("fixed composed consumer validates all material layers and legacy files, not execution eligibility", async t => {
  const f = await semanticConsumerFixture(t), before = await fs.readFile(path.join(f.root, "SEMANTIC-CATALOG.json"));
  const result = await f.read(); assert.equal(result.verification.status, "CONFIGURED_MATERIALS_VERIFIED");
  assert.equal(result.verification.eligibleForExecution, false); assert.equal(result.verification.legacyAssetFiles, 3);
  assert.equal(result.verification.sets.length, 1); assert.equal(result.materials.size, 16); assert(Object.isFrozen(result.verification));
  assert.deepEqual(await fs.readFile(path.join(f.root, "SEMANTIC-CATALOG.json")), before);
});
test("consumer rejects rehashed visibility forgery even if a caller supplies a permissive validator", async t => {
  const f = await semanticConsumerFixture(t); for (const entry of f.generation.entries) entry.visibility = "PUBLIC"; await f.publish();
  let called = false;
  await assert.rejects(f.read({validateMaterials: () => {called = true; return true;}}), {code: "MATERIAL_INVALID"}); assert.equal(called, false);
});
test("composed path rejects missing original v3 files", async t => {
  const f = await semanticConsumerFixture(t), file = path.join(f.root, f.generation.sets[0].refs.harnessAssets[0].entry.assetPath);
  await fs.rename(file, `${file}.retained`); await assert.rejects(f.read(), {code: "UNAVAILABLE"});
});
test("composed path rejects original v3 content drift after semantic material validation", async t => {
  const f = await semanticConsumerFixture(t), relative = f.generation.sets[0].refs.harnessAssets[0].entry.assetPath;
  const document = JSON.parse(await fs.readFile(path.join(f.root, relative))); document.metadata.id = "forged"; await f.write(relative, document);
  await assert.rejects(f.read(), {code: "MATERIAL_INVALID"});
});
test("composed path cannot bypass current publication revocation", async t => {
  const f = await semanticConsumerFixture(t); f.policy.catalogs[0].grants[0].revoked = true; await f.write("policy.json", f.policy);
  await assert.rejects(f.read(), {code: "PERMISSION_DENIED"});
});
test("current permission is rechecked after the full validator and v3 membership", async t => {
  const f = await semanticConsumerFixture(t); let calls = 0;
  await assert.rejects(f.read({currentSubject: async () => {
    calls++; if (calls === 3) {f.policy.catalogs[0].permission = "DENIED"; await f.write("policy.json", f.policy);}
    return f.currentSubject();
  }}), {code: "PERMISSION_DENIED"}); assert.equal(calls, 3);
});
test("composed path rejects inactive and cross-project subjects", async t => {
  const f = await semanticConsumerFixture(t);
  await assert.rejects(f.read({currentSubject: () => ({...f.currentSubject(), active: false})}), {code: "PERMISSION_DENIED"});
  await assert.rejects(f.read({currentSubject: () => ({...f.currentSubject(), scope: {...f.currentSubject().scope, projectId: "other"}})}), {code: "PERMISSION_DENIED"});
});
test("composed path retains cancellation and whole-read timeout boundaries", async t => {
  const f = await semanticConsumerFixture(t), controller = new AbortController(); controller.abort();
  await assert.rejects(f.read({signal: controller.signal}), {code: "CANCELLED"});
  await assert.rejects(f.read({limits: {readTimeoutMilliseconds: 5}, currentSubject: () => new Promise(() => {})}), {code: "TIMEOUT"});
});
