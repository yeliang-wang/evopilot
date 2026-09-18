#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Immutable Runtime 6.2.0 release artifact, never compiled by the Expert recovery.
const expected = "60a561961768aa43cd15a47d1b667a832aa45bed2c7dd88edfefff2f36448c47";
const root = path.resolve(import.meta.dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "expert-runtime-contract-"));
try {
  let archive = process.argv[2];
  if (!archive) {
    execFileSync("npm", ["pack", "@evopilot/contracts@6.2.0", "--ignore-scripts", "--registry=https://registry.npmjs.org/", "--pack-destination", temporary], { cwd: temporary, stdio: "pipe" });
    archive = path.join(temporary, "evopilot-contracts-6.2.0.tgz");
  }
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex"), expected, "published Runtime contract archive drift");
  const manifest = JSON.parse(execFileSync("tar", ["-xOf", archive, "package/package.json"], { encoding: "utf8" }));
  assert.equal(manifest.name, "@evopilot/contracts");
  assert.equal(manifest.version, "6.2.0");
  execFileSync("tar", ["-xzf", archive, "--strip-components=1", "-C", path.join(root, "packages/contracts"), "package/dist"]);
  console.log(JSON.stringify({ status: "PASS", version: "6.2.0", sha256: expected, runtimeRebuilt: false, materialized: "packages/contracts/dist" }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
