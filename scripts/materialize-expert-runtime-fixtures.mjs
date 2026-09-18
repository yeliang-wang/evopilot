#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Offline extraction only: never load/start an image or rebuild Runtime.
const expected = "5ac36864a42dcecd8c88731570a15d66a546b88233cff9e1a25a1e07473eb0c0";
const layerDigest = "6fa168b6748e3eb8061eb34dde01dfd29ac58450b02cc0b377142285f78e41f7";
const root = path.resolve(import.meta.dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "expert-runtime-fixtures-"));
try {
  const archive = process.argv[2] ?? path.join(temporary, "evopilot-6.2.0-container-image.tar");
  if (!process.argv[2]) execFileSync("curl", ["--fail", "--location", "--proto", "=https", "--tlsv1.2", "--output", archive, "https://github.com/yeliang-wang/evopilot/releases/download/v6.2.0/evopilot-6.2.0-container-image.tar"], { stdio: "pipe" });
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex"), expected, "immutable Runtime archive drift");
  const layer = execFileSync("tar", ["-xOf", archive, `blobs/sha256/${layerDigest}`], { maxBuffer: 200_000_000 });
  assert.equal(crypto.createHash("sha256").update(layer).digest("hex"), layerDigest, "Runtime fixture layer drift");
  const entries = execFileSync("tar", ["-tzf", "-"], { input: layer, encoding: "utf8", maxBuffer: 10_000_000 }).split("\n");
  const directories = entries.filter(name => /^app\/packages\/[a-z0-9-]+\/dist\/$/.test(name) && !/^app\/packages\/(evolution-expert|contracts)\//.test(name));
  assert.ok(directories.includes("app/packages/core/dist/") && directories.includes("app/packages/server/dist/"));
  execFileSync("tar", ["-xzf", "-", "--strip-components=1", "-C", root, ...directories], { input: layer });
  console.log(JSON.stringify({ status: "PASS", runtimeVersion: "6.2.0", archiveDigest: `sha256:${expected}`, layerDigest: `sha256:${layerDigest}`, runtimeRebuilt: false, runtimeStarted: false, directories }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
