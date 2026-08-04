#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const rootPackageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const options = parseArgs(process.argv.slice(2));
const version = options.version ?? rootPackageJson.version;
const registry = options.registry ?? process.env.npm_config_registry ?? "https://registry.npmjs.org/";
const wait = options.wait === true;
const timeoutMs = options.timeoutMs ?? 300_000;
const intervalMs = options.intervalMs ?? 15_000;

const packages = [
  { name: "@evopilot/contracts" },
  { name: "@evopilot/client" },
  { name: "@evopilot/cli", bin: "evopilot" },
  { name: "create-evopilot", bin: "create-evopilot" }
];

try {
  await retry("npm registry metadata", () => {
    for (const packageSpec of packages) verifyRegistryMetadata(packageSpec);
  });

  await retry("empty-project npm install smoke", () => {
    verifyEmptyProjectInstall();
  });

  console.log(`npm registry publication verification passed for ${version}.`);
} catch (error) {
  console.error(`npm registry publication verification failed for ${version}: ${errorMessage(error)}`);
  process.exit(1);
}

function verifyRegistryMetadata(packageSpec) {
  const metadata = readNpmView(`${packageSpec.name}@${version}`);
  assert.equal(metadata.name, packageSpec.name, `${packageSpec.name} registry name should match`);
  assert.equal(metadata.version, version, `${packageSpec.name} registry version should match ${version}`);
  assert.ok(metadata.dist?.tarball, `${packageSpec.name}@${version} must expose a dist tarball`);
  if (packageSpec.bin) {
    const bin = metadata.bin;
    const hasBin = typeof bin === "string" || Boolean(bin?.[packageSpec.bin]);
    assert.ok(hasBin, `${packageSpec.name}@${version} must expose ${packageSpec.bin} bin`);
  }
}

function readNpmView(spec) {
  const output = run("npm", ["view", spec, "--json", "--registry", registry]);
  return JSON.parse(output);
}

function verifyEmptyProjectInstall() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-npm-registry-"));
  const installDir = path.join(tempRoot, "install");
  fs.mkdirSync(installDir, { recursive: true });
  fs.writeFileSync(path.join(installDir, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2) + "\n");

  try {
    run("npm", [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--registry",
      registry,
      ...packages.map((packageSpec) => `${packageSpec.name}@${version}`)
    ], { cwd: installDir, stdio: "inherit" });

    const binDir = path.join(installDir, "node_modules", ".bin");
    const evopilotBin = path.join(binDir, process.platform === "win32" ? "evopilot.cmd" : "evopilot");
    const createBin = path.join(binDir, process.platform === "win32" ? "create-evopilot.cmd" : "create-evopilot");
    assert.ok(fs.existsSync(evopilotBin), "evopilot bin should be installed from npm registry");
    assert.ok(fs.existsSync(createBin), "create-evopilot bin should be installed from npm registry");

    assert.match(run(evopilotBin, ["--help"], { cwd: installDir }), /EvoPilot CLI|evopilot/i);
    assert.match(run(createBin, ["--help"], { cwd: installDir }), /create-evopilot/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function retry(label, operation) {
  const startedAt = Date.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return operation();
    } catch (error) {
      if (!wait || Date.now() - startedAt >= timeoutMs) throw error;
      console.log(`Waiting for ${label} to propagate; attempt ${attempt} failed: ${errorMessage(error)}`);
      await sleep(intervalMs);
    }
  }
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd ?? root,
      encoding: "utf8",
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    const message = compactCommandError(output, error, command, args);
    throw new Error(message);
  }
}

function compactCommandError(output, error, command, args) {
  const code = output.match(/"code":\s*"([^"]+)"/)?.[1] ?? output.match(/npm error code\s+(\w+)/)?.[1];
  const summary = output.match(/"summary":\s*"([^"]+)"/)?.[1];
  if (summary) return code ? `${code}: ${summary}` : summary;
  const npmErrorLine = output.split(/\r?\n/).find((line) => /^npm error (?!A complete log)/.test(line));
  if (npmErrorLine) return npmErrorLine.replace(/^npm error\s*/, "");
  return output || error.message || `${command} ${args.join(" ")} failed`;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--wait") parsed.wait = true;
    else if (arg === "--version") parsed.version = args[++index];
    else if (arg === "--registry") parsed.registry = args[++index];
    else if (arg === "--timeout-ms") parsed.timeoutMs = Number(args[++index]);
    else if (arg === "--interval-ms") parsed.intervalMs = Number(args[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error) {
  return error instanceof Error ? error.message.split(/\r?\n/)[0] : String(error);
}
