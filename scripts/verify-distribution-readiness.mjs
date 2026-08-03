#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const createSource = fs.readFileSync(path.join(root, "packages", "create-evopilot", "src", "index.ts"), "utf8");
const dashboardVersion = createSource.match(/const DASHBOARD_VERSION = "([^"]+)"/)?.[1];
assert.ok(dashboardVersion, "create-evopilot must declare a dashboard image version");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "installers", "manifest.json"), "utf8"));
const packages = [
  "@evopilot/contracts",
  "@evopilot/client",
  "@evopilot/cli",
  "create-evopilot"
];

function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    ...options
  });
  return output == null ? "" : output.trim();
}

function sha256(relativePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(path.join(root, relativePath)));
  return hash.digest("hex");
}

function optionalRun(command, args, options = {}) {
  try {
    return run(command, args, options);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function npmPack(workspace, outDir) {
  const output = run("npm", ["pack", "-w", workspace, "--pack-destination", outDir, "--json"]);
  const parsed = JSON.parse(output);
  assert.equal(parsed.length, 1, `${workspace} should produce one tarball`);
  const filename = parsed[0].filename;
  const filePath = path.join(outDir, filename);
  assert.ok(fs.existsSync(filePath), `${filePath} should exist`);
  assert.ok(fs.statSync(filePath).size > 0, `${filePath} should not be empty`);
  return filePath;
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-distribution-"));
const packDir = path.join(tempRoot, "packs");
const installDir = path.join(tempRoot, "install");
fs.mkdirSync(packDir, { recursive: true });
fs.mkdirSync(installDir, { recursive: true });

assert.equal(manifest.schema, "evopilot-install-manifest/v1");
assert.equal(manifest.version, packageJson.version);
assert.equal(manifest.packages?.["create-evopilot"]?.version, packageJson.version);
assert.equal(manifest.packages?.["@evopilot/cli"]?.version, packageJson.version);
assert.equal(manifest.containers?.evopilot, `ghcr.io/yeliang-wang/evopilot:${packageJson.version}`);
assert.equal(manifest.containers?.["evopilot-dashboard"], `ghcr.io/yeliang-wang/evopilot-dashboard:${dashboardVersion}`);
assert.equal(manifest.installers?.["install.sh"]?.sha256, sha256("install.sh"));
assert.equal(manifest.installers?.["install.ps1"]?.sha256, sha256("install.ps1"));
assert.match(run("bash", ["install.sh", "--skip-manifest", "--dry-run", "--dir", "evopilot-stack"]), /create-evopilot@/);
const pwshHelp = optionalRun("pwsh", ["-NoProfile", "-File", "install.ps1", "-Help"]);
if (pwshHelp == null) {
  console.log("PowerShell not found; static install.ps1 verification passed.");
} else {
  assert.match(pwshHelp, /EvoPilot self-host installer/);
}

for (const workspace of packages) {
  run("npm", ["run", "build", "-w", workspace], { stdio: "inherit" });
}

const tarballs = packages.map((workspace) => npmPack(workspace, packDir));

fs.writeFileSync(path.join(installDir, "package.json"), "{\"type\":\"module\"}\n");
run("npm", ["install", "--ignore-scripts", ...tarballs], { cwd: installDir, stdio: "inherit" });

const binDir = path.join(installDir, "node_modules", ".bin");
const evopilotBin = path.join(binDir, process.platform === "win32" ? "evopilot.cmd" : "evopilot");
const createBin = path.join(binDir, process.platform === "win32" ? "create-evopilot.cmd" : "create-evopilot");
assert.ok(fs.existsSync(evopilotBin), "evopilot bin should be installed");
assert.ok(fs.existsSync(createBin), "create-evopilot bin should be installed");

const help = run(evopilotBin, ["--help"], { cwd: installDir });
assert.match(help, /EvoPilot CLI|evopilot/i);
const installerHelp = run(createBin, ["--help"], { cwd: installDir });
assert.match(installerHelp, /create-evopilot/);

const stackDir = path.join(tempRoot, "stack");
run(createBin, ["self-host", "--dir", stackDir, "--init-env"], {
  cwd: installDir,
  env: {
    ...process.env,
    EVOPILOT_LLM_BASE_URL: "https://llm.internal.example/v1",
    EVOPILOT_LLM_MODEL_NAME: "production-model",
    EVOPILOT_LLM_API_KEY: "test-release-key"
  }
});
for (const relativePath of ["compose.yaml", ".env.example", ".env", "README.md", "verify.sh"]) {
  const filePath = path.join(stackDir, relativePath);
  assert.ok(fs.existsSync(filePath), `${relativePath} should be generated`);
  assert.ok(fs.statSync(filePath).size > 0, `${relativePath} should not be empty`);
}

const compose = fs.readFileSync(path.join(stackDir, "compose.yaml"), "utf8");
assert.match(compose, new RegExp(`ghcr\\.io/yeliang-wang/evopilot:${escapeRegExp(packageJson.version)}`));
assert.match(compose, new RegExp(`ghcr\\.io/yeliang-wang/evopilot-dashboard:${escapeRegExp(dashboardVersion)}`));

const env = fs.readFileSync(path.join(stackDir, ".env"), "utf8");
for (const placeholder of ["change-me", "replace-with", "llm.example.com"]) {
  assert.ok(!env.includes(placeholder), `.env should not include ${placeholder}`);
}
assert.match(env, /EVOPILOT_REQUIRE_LLM=true/);

console.log("Distribution package verification passed.");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
