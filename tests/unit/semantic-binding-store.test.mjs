import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {SemanticBindingStore} from "../../packages/server/dist/storage/semantic-binding-store.js";
import {digestObject} from "../../packages/server/dist/domains/harness-template/utils.js";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-binding-store-")); t.after(() => fs.rm(root, {recursive: true, force: true}));
  const store = new SemanticBindingStore(root), key = {projectId: "synthetic", tenantId: "tenant", workspaceId: "workspace"};
  const directory = path.join(root, "project-semantic-bindings/projects"), file = path.join(directory, digestObject(key).slice(7) + ".json");
  return {root, store, key, directory, file};
}
test("reads do not create state and immutable slots never replace the first record", async t => {
  const f = await fixture(t); assert.equal(f.store.read("projects", f.key), undefined);
  assert.deepEqual(await fs.readdir(f.root), []);
  assert.deepEqual(f.store.put("projects", f.key, {a: 1}), {a: 1});
  assert.deepEqual(f.store.put("projects", f.key, {a: 2}), {a: 1});
  assert.deepEqual(new SemanticBindingStore(f.root).read("projects", f.key), {a: 1});
  assert.equal((await fs.stat(f.file)).mode & 0o777, 0o600);
});
test("store rejects changed bytes, oversize records and incomplete files", async t => {
  const f = await fixture(t); f.store.put("projects", f.key, {a: 1});
  await fs.writeFile(f.file, JSON.stringify({keyDigest: digestObject(f.key), value: "forged", recordDigest: digestObject("wrong")}));
  assert.throws(() => f.store.read("projects", f.key), {code: "DIGEST_MISMATCH"});
  await fs.writeFile(f.file, "{"); assert.throws(() => f.store.read("projects", f.key), {code: "INVALID"});
  await fs.writeFile(f.file, "x".repeat(262145)); assert.throws(() => f.store.read("projects", f.key), {code: "FILE_LIMIT"});
});
test("records cannot be transplanted to a different scope slot", async t => {
  const f = await fixture(t); f.store.put("projects", f.key, {a: 1});
  const other = {...f.key, tenantId: "other"}; await fs.copyFile(f.file, path.join(f.directory, digestObject(other).slice(7) + ".json"));
  assert.throws(() => f.store.read("projects", other), {code: "SCOPE_INVALID"});
});
test("symlink and hardlink record files are not read or replaced", async t => {
  const f = await fixture(t); f.store.put("projects", f.key, {a: 1}); const retained = path.join(f.root, "retained.json");
  await fs.rename(f.file, retained); await fs.symlink(retained, f.file);
  assert.throws(() => f.store.read("projects", f.key));
  await fs.unlink(f.file); await fs.link(retained, f.file);
  assert.throws(() => f.store.put("projects", f.key, {a: 2}), {code: "PATH_DENIED"});
});
test("symlink directories cannot redirect writes", async t => {
  const f = await fixture(t); await fs.symlink(f.root, path.join(f.root, "project-semantic-bindings"));
  assert.throws(() => f.store.put("projects", f.key, {a: 1}), {code: "PATH_DENIED"});
});
test("orphan partial temporary files are never treated as committed decisions", async t => {
  const f = await fixture(t); await fs.mkdir(f.directory, {recursive: true}); await fs.writeFile(path.join(f.directory, ".pending-interrupted"), "{");
  assert.equal(f.store.read("projects", f.key), undefined); assert.deepEqual(f.store.put("projects", f.key, {a: 1}), {a: 1});
});
test("independent processes compete for one complete no-replace record", async t => {
  const f = await fixture(t), moduleUrl = new URL("../../packages/server/dist/storage/semantic-binding-store.js", import.meta.url).href;
  // A brief hardlink transition may fail closed; exact replay must observe the winner.
  const run = n => new Promise((resolve, reject) => {
    const code = `import {SemanticBindingStore} from ${JSON.stringify(moduleUrl)}; const s=new SemanticBindingStore(${JSON.stringify(f.root)}); try {s.put("projects",${JSON.stringify(f.key)},{winner:${n},payload:"x".repeat(100000)})} catch(e) {if(e.code!=="PATH_DENIED")throw e;}`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", code]); let stderr = "";
    child.stderr.on("data", chunk => {stderr += chunk;}); child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(Error(stderr)));
  });
  await Promise.all(Array.from({length: 6}, (_, n) => run(n)));
  const winner = f.store.read("projects", f.key); assert.equal(winner.payload.length, 100000);
  assert.deepEqual(f.store.put("projects", f.key, {winner: 100}), winner);
  assert.equal((await fs.readdir(f.directory)).length, 1);
});
