import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("v6.2 readiness verification remains valid after release authorization", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-v62-first-run-llm-readiness.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /first-run LLM readiness verification passed/);
});
