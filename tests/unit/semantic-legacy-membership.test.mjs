import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {test} from "node:test";
import {inspectSemanticLegacyMembership} from "../../packages/server/dist/domains/harness-template/semantic-legacy-membership.js";
import {resolveSemanticLimits} from "../../packages/server/dist/domains/harness-template/semantic-catalog-contract.js";
import {createSemanticOperation, openSemanticRoot} from "../../packages/server/dist/domains/harness-template/semantic-catalog-io.js";
import {digestObject, digestText} from "../../packages/server/dist/domains/harness-template/utils.js";

async function fixture(t) {
  const data = JSON.parse(await fs.readFile(new URL("../fixtures/semantic-catalog-materials.json", import.meta.url), "utf8"));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "evopilot-membership-test-"));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const snapshot = {catalogId: data.generation.catalogId, generation: data.generation, materials: new Map(Object.entries(data.materials)), limits: resolveSemanticLimits()};
  // The wire-only fixture intentionally shares a placeholder path. This
  // filesystem projection needs independently addressable synthetic assets.
  for (const item of data.generation.sets[0].refs.harnessAssets) item.entry.assetPath = `./assets/${item.entry.kind}-${item.entry.id}.yaml`;
  const entries = structuredClone(data.generation.sets[0].refs.harnessAssets.map(item => item.entry));
  for (const item of data.generation.sets[0].refs.harnessAssets) {
    const entry = data.generation.entries.find(entry => entry.objectDigest === item.ref), document = data.materials[entry.path];
    const file = path.join(root, item.entry.assetPath); await fs.mkdir(path.dirname(file), {recursive: true}); await fs.writeFile(file, JSON.stringify(document));
  }
  async function publish(values = entries) {
    const index = {schema: "evopilot-harness-catalog/v3", catalogId: snapshot.catalogId, generatedBy: "synthetic-test", assetApiVersion: "harness.evopilot.io/v3", entryCount: values.length, entries: values};
    index.catalogDigest = digestObject(index);
    const markdown = "# Synthetic Catalog\n\n```yaml evopilot-harness-catalog-v3\n" + JSON.stringify(index, null, 2) + "\n```\n";
    await fs.writeFile(path.join(root, "CATALOG.md"), markdown);
    await fs.writeFile(path.join(root, "catalog.lock.json"), JSON.stringify({...index, markdownDigest: digestText(markdown)}));
  }
  await publish();
  async function inspect({signal, wrap} = {}) {
    const operation = createSemanticOperation(snapshot.limits, signal);
    try {const files = await openSemanticRoot(root, operation); return await inspectSemanticLegacyMembership({snapshot, files: wrap ? wrap(files) : files, operation});}
    finally {operation.close();}
  }
  return {root, snapshot, entries, publish, inspect};
}
test("exact original v3 lock, Markdown and published asset bytes are verified read-only", async t => {
  const f = await fixture(t), result = await f.inspect();
  assert.equal(result.status, "LEGACY_MEMBERSHIP_INSPECTED"); assert.equal(result.eligibleForExecution, false); assert.equal(result.assetFiles, 3);
});
test("unrelated Catalog growth preserves bound membership", async t => {
  const f = await fixture(t), before = await f.inspect();
  await f.publish([...f.entries, {...f.entries[0], id: "unrelated", assetPath: "not-read.yaml"}]);
  const after = await f.inspect(); assert.notEqual(after.catalogDigest, before.catalogDigest); assert.equal(after.assetFiles, before.assetFiles);
});
test("missing or changed published membership is rejected", async t => {
  const f = await fixture(t); await f.publish(f.entries.slice(1));
  await assert.rejects(f.inspect(), {code: "MATERIAL_INVALID"});
  f.entries[0].lifecycle = "draft"; await f.publish(); await assert.rejects(f.inspect(), {code: "MATERIAL_INVALID"});
});
test("duplicate Catalog identities fail closed", async t => {
  const f = await fixture(t); await f.publish([...f.entries, f.entries[0]]); await assert.rejects(f.inspect(), {code: "IDENTITY_CONFLICT"});
});
test("Markdown tampering and multiple independently hashed index blocks fail closed", async t => {
  const f = await fixture(t); await fs.appendFile(path.join(f.root, "CATALOG.md"), "tampered"); await assert.rejects(f.inspect(), {code: "DIGEST_MISMATCH"});
  await f.publish(); const file = path.join(f.root, "CATALOG.md"), doubled = (await fs.readFile(file, "utf8")).repeat(2);
  await fs.writeFile(file, doubled); const lockFile = path.join(f.root, "catalog.lock.json"), lock = JSON.parse(await fs.readFile(lockFile)); lock.markdownDigest = digestText(doubled);
  await fs.writeFile(lockFile, JSON.stringify(lock)); await assert.rejects(f.inspect(), {code: "INVALID"});
});
test("asset body drift is rejected despite unchanged Catalog digests", async t => {
  const f = await fixture(t); const file = path.join(f.root, f.entries[0].assetPath), document = JSON.parse(await fs.readFile(file)); document.metadata.id = "tampered";
  await fs.writeFile(file, JSON.stringify(document)); await assert.rejects(f.inspect(), {code: "MATERIAL_INVALID"});
});
test("path escape fails before any v3 asset read", async t => {
  const f = await fixture(t); f.entries[0].assetPath = "../escape.yaml";
  f.snapshot.generation.sets[0].refs.harnessAssets[0].entry.assetPath = "../escape.yaml"; await f.publish();
  const opened = [];
  await assert.rejects(f.inspect({wrap: files => ({read: (relative, limit) => {opened.push(relative); return files.read(relative, limit);}})}), {code: "PATH_DENIED"});
  assert.deepEqual(opened, ["catalog.lock.json", "CATALOG.md"]);
});
test("symlink assets cannot escape the configured root", async t => {
  const f = await fixture(t), file = path.join(f.root, f.entries[0].assetPath), retained = `${file}.retained`;
  await fs.rename(file, retained); await fs.symlink(retained, file); await assert.rejects(f.inspect(), {code: "PATH_DENIED"});
});
test("total byte exact boundary passes and one-under fails without a partial result", async t => {
  const f = await fixture(t), result = await f.inspect();
  f.snapshot.limits = resolveSemanticLimits({totalMaterialBytes: result.totalMaterialBytes}); await f.inspect();
  f.snapshot.limits = resolveSemanticLimits({totalMaterialBytes: result.totalMaterialBytes - 1}); await assert.rejects(f.inspect(), {code: "FILE_LIMIT"});
});
test("cancellation and index drift during asset validation fail closed", async t => {
  const f = await fixture(t), controller = new AbortController(); controller.abort(); await assert.rejects(f.inspect({signal: controller.signal}), {code: "CANCELLED"});
  let changed = false;
  await assert.rejects(f.inspect({wrap: files => ({read: async (relative, limit) => {
    const result = await files.read(relative, limit);
    if (!changed && relative !== "CATALOG.md" && relative !== "catalog.lock.json") {changed = true; await f.publish([...f.entries, {...f.entries[0], id: "new-unrelated"}]);}
    return result;
  }})}), {code: "DRIFT"});
});
