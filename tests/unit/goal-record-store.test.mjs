import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {GoalRecordStore} from "../../packages/server/dist/storage/goal-record-store.js";

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-goal-cas-")); t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const store = new GoalRecordStore(directory), value = {schema: "evopilot-global-goal/v1", id: "synthetic", status: "WAITING_EXTERNAL_SIGNAL"};
  store.write(value); return {directory, store, value, file: path.join(directory, "synthetic.json")};
}
test("Goal CAS atomically replaces one exact revision and refuses stale/create overwrite", t => {
  const f = fixture(t), next = {...f.value, status: "RUNNING"}; assert.deepEqual(f.store.write(next, f.value), next);
  assert.throws(() => f.store.write({...next, status: "CANCELLED"}, f.value), /REVISION_CONFLICT/);
  assert.throws(() => f.store.write(f.value), /REVISION_CONFLICT/); assert.deepEqual(f.store.read("synthetic"), next);
  assert.deepEqual(fs.readdirSync(f.directory), ["synthetic.json"]);
});
test("retained write claim requires reconciliation, with no timestamp expiry or replay", t => {
  const f = fixture(t); fs.writeFileSync(f.file + ".lock", "synthetic interrupted claim"); fs.utimesSync(f.file + ".lock", 0, 0);
  assert.throws(() => f.store.write({...f.value, status: "RUNNING"}, f.value), /RECONCILIATION_REQUIRED/);
  assert.deepEqual(f.store.read("synthetic"), f.value); assert(fs.existsSync(f.file + ".lock"));
});
test("pre-rename failure leaves the previous revision and releases this writer's claim", t => {
  const f = fixture(t);
  const rename = t.mock.method(fs, "renameSync", () => {throw new Error("SYNTHETIC_RENAME_FAILURE");});
  assert.throws(() => f.store.write({...f.value, status: "RUNNING"}, f.value), /SYNTHETIC_RENAME_FAILURE/);
  rename.mock.restore();
  assert.deepEqual(f.store.read("synthetic"), f.value); assert.deepEqual(fs.readdirSync(f.directory), ["synthetic.json"]);
  assert.equal(f.store.write({...f.value, status: "CANCELLED"}, f.value).status, "CANCELLED");
});
test("post-rename durability failure preserves the complete new record and blocks replay", t => {
  const f = fixture(t), fsync = fs.fsyncSync;
  const sync = t.mock.method(fs, "fsyncSync", fd => {
    if (fs.fstatSync(fd).isDirectory()) throw new Error("SYNTHETIC_DURABILITY_FAILURE");
    return fsync(fd);
  });
  const next = {...f.value, status: "RUNNING"};
  assert.throws(() => f.store.write(next, f.value), /SYNTHETIC_DURABILITY_FAILURE/); sync.mock.restore();
  assert.deepEqual(f.store.read("synthetic"), next); assert(fs.existsSync(f.file + ".lock"));
  assert.throws(() => f.store.write({...next, status: "CANCELLED"}, next), /RECONCILIATION_REQUIRED/);
  assert.deepEqual(fs.readdirSync(f.directory).sort(), ["synthetic.json", "synthetic.json.lock"]);
});
for (const kind of ["symlink", "hardlink", "oversize", "wrong-id"]) test(`Goal strict mutation read rejects ${kind}`, t => {
  const f = fixture(t), backup = path.join(f.directory, "backup"); fs.renameSync(f.file, backup);
  if (kind === "symlink") fs.symlinkSync(backup, f.file);
  else if (kind === "hardlink") fs.linkSync(backup, f.file);
  else if (kind === "oversize") fs.writeFileSync(f.file, " ".repeat(1024 * 1024 + 1));
  else fs.writeFileSync(f.file, JSON.stringify({...f.value, id: "other"}));
  assert.throws(() => f.store.write({...f.value, status: "RUNNING"}, f.value));
  assert.equal(JSON.parse(fs.readFileSync(backup)).status, "WAITING_EXTERNAL_SIGNAL");
});
test("separate processes cannot both commit from the same Goal revision", async t => {
  const f = fixture(t), module = new URL("../../packages/server/dist/storage/goal-record-store.js", import.meta.url).href;
  const source = `import {GoalRecordStore} from ${JSON.stringify(module)}; const s = new GoalRecordStore(process.argv[1]);
    const before = JSON.parse(process.argv[2]); try {s.write({...before,status:process.argv[3]},before); console.log('COMMITTED');}
    catch(e){if(!/REVISION_CONFLICT|RECONCILIATION_REQUIRED/.test(e.message)) throw e; console.log('REFUSED');}`;
  const run = status => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source, f.directory, JSON.stringify(f.value), status]);
    let stdout = "", stderr = ""; child.stdout.on("data", d => {stdout += d;}); child.stderr.on("data", d => {stderr += d;});
    child.on("error", reject); child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
  });
  assert.deepEqual((await Promise.all([run("RUNNING"), run("CANCELLED")])).sort(), ["COMMITTED", "REFUSED"]);
  assert(["RUNNING", "CANCELLED"].includes(f.store.read("synthetic").status));
});
test("settled-state check refuses even dangling-symlink locks, without deleting or following them", t => {
  const f = fixture(t); fs.symlinkSync(path.join(f.directory, "missing"), f.file + ".lock");
  assert.throws(() => f.store.assertSettled("synthetic"), /RECONCILIATION_REQUIRED/);
  assert(fs.lstatSync(f.file + ".lock").isSymbolicLink()); assert.deepEqual(f.store.read("synthetic"), f.value);
});
