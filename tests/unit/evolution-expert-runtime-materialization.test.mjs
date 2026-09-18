import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

for (const script of ["materialize-expert-runtime-contract.mjs", "materialize-expert-runtime-fixtures.mjs"]) {
  test(`${script} rejects non-pinned input before extracting compiled fixtures`, t => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "expert-materializer-negative-"));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    const archive = path.join(tmp, "invalid.tar");
    fs.writeFileSync(archive, "not the published immutable Runtime artifact");
    const result = spawnSync(process.execPath, [`scripts/${script}`, archive], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /archive drift/);
    assert.doesNotMatch(result.stdout, /"status":"PASS"/);
  });
}
