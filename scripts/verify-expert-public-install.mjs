#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyInventory } from "../packages/evolution-expert/host-integration/inventory.mjs";
import { digest as fileDigest } from "../packages/evolution-expert/host-integration/contracts.mjs";

export const packagedHosts = ["codex", "claude-code", "workbuddy", "generic-agent", "generic-mcp"];
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object"
  ? `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}` : JSON.stringify(value);
const digest = value => `sha256:${crypto.createHash("sha256").update(stable(value)).digest("hex")}`;
const readJson = p => JSON.parse(fs.readFileSync(p, "utf8"));
const verifierEnv = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C", LC_ALL: "C" };
const limits = { files: 4096, depth: 32, archiveBytes: 64 * 1024 * 1024, fileBytes: 16 * 1024 * 1024, totalBytes: 256 * 1024 * 1024 };
function regularFile(file, maximum) {
  const stat = fs.lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), "regular file required; symlink rejected");
  assert.ok(stat.size <= maximum, "verification file size limit exceeded");
  return stat;
}
function installedInventory(pkg) {
  const files = []; let total = 0, directories = 0;
  function visit(relative, depth) {
    assert.ok(depth <= limits.depth && ++directories <= limits.files, "installed inventory directory limit exceeded");
    assert.ok(fs.lstatSync(path.join(pkg, relative)).isDirectory(), "installed directory required; symlink rejected");
    for (const name of fs.readdirSync(path.join(pkg, relative)).sort()) {
      const rel = path.posix.join(relative, name), file = path.join(pkg, rel), stat = fs.lstatSync(file);
      assert.ok(!stat.isSymbolicLink(), "installed symlink rejected");
      if (stat.isDirectory()) visit(rel, depth + 1);
      else {
        regularFile(file, limits.fileBytes); total += stat.size;
        assert.ok(total <= limits.totalBytes && files.length < limits.files, "installed inventory resource limit exceeded");
        files.push({ path: rel, digest: fileDigest(fs.readFileSync(file)) });
      }
    }
  }
  visit("", 0); return files.sort((a, b) => a.path.localeCompare(b.path));
}

// Called only after Registry integrity/provenance and npm signature verification.
// This local check does not itself assert public availability or real Host readiness.
export function verifyExpertPublicInstallation({ installDir, version, acceptedTarball }) {
  const deadline = Date.now() + 120000;
  const timeout = cap => {const left = deadline - Date.now(); assert.ok(left > 0, "installation verifier deadline exceeded"); return Math.min(cap, left);};
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.ok(acceptedTarball && fs.existsSync(acceptedTarball), "exact accepted tarball is required");
  installDir = fs.realpathSync(installDir);
  let pkg = installDir;
  for (const part of ["node_modules", "@evopilot", "evolution-expert"]) {
    pkg = path.join(pkg, part);
    assert.ok(fs.lstatSync(pkg).isDirectory(), "installed directory required; symlink rejected");
  }
  regularFile(acceptedTarball, limits.archiveBytes);
  const acceptedDigest = fileDigest(fs.readFileSync(acceptedTarball));
  const before = installedInventory(pkg);
  const tar = (args, maxBuffer = 1024 * 1024) => execFileSync("/usr/bin/tar", args,
    {encoding: "buffer", env: verifierEnv, timeout: timeout(10000), maxBuffer});
  const allMembers = tar(["-tzf", acceptedTarball]).toString("utf8").trim().split("\n");
  const types = tar(["-tvzf", acceptedTarball]).toString("utf8").trim().split("\n").map(line => line[0]);
  assert.ok(allMembers.length <= limits.files * 2 && allMembers.length === types.length, "archive inventory limit or type mismatch");
  const seen = new Set();
  for (let i = 0; i < allMembers.length; i++) {
    const member = allMembers[i], directory = member.endsWith("/"), normalized = directory ? member.slice(0, -1) : member;
    assert.ok(/^[a-zA-Z0-9_.\/-]+$/.test(normalized) && normalized.split("/").every(p => p && p !== "." && p !== "..") &&
      (normalized === "package" || normalized.startsWith("package/")), "unsafe accepted tarball path");
    assert.ok(!seen.has(normalized), "duplicate archive member"); seen.add(normalized);
    assert.equal(types[i], directory ? "d" : "-", "archive member must be a regular file or directory");
  }
  const members = allMembers.filter(x => !x.endsWith("/"));
  assert.deepEqual(before.map(x => "package/" + x.path).sort(), [...members].sort(), "installed inventory has missing or unexpected files");
  const manifest = readJson(path.join(pkg, "package.json"));
  assert.equal(manifest.name, "@evopilot/evolution-expert");
  assert.equal(manifest.version, version);
  assert.equal(manifest.dependencies["@evopilot/contracts"], "6.3.0");
  const contracts = path.join(installDir, "node_modules/@evopilot/contracts");
  assert.ok(fs.lstatSync(contracts).isDirectory(), "installed dependency directory required; symlink rejected");
  const dependencyBefore = installedInventory(contracts);
  assert.equal(readJson(path.join(contracts, "package.json")).version, "6.3.0");
  assert.ok(members.includes("package/dist/cli.js") && members.includes("package/skill/SKILL.md"));
  assert.ok(members.includes("package/host-integration/manifest.json") && members.includes("package/host-integration/dist/darwin-arm64/secure-input"), "accepted Host integration is required");
  for (const member of members) {
    assert.ok(member.startsWith("package/") && !member.split("/").includes(".."), "unsafe accepted tarball path");
    const local = path.join(pkg, member.slice("package/".length));
    assert.ok(fs.lstatSync(local).isFile(), `installed file missing or not regular: ${member}`);
    assert.deepEqual(fs.readFileSync(local), tar(["-xOf", acceptedTarball, member], limits.fileBytes), `installed bytes differ from accepted tarball: ${member}`);
  }
  assert.equal(fileDigest(fs.readFileSync(acceptedTarball)), acceptedDigest, "accepted archive changed during verification");
  assert.deepEqual(installedInventory(pkg), before, "installed inventory changed during verification");
  const componentDigest = fileDigest(fs.readFileSync(path.join(pkg, "host-integration/manifest.json")));
  verifyInventory(path.join(pkg, "host-integration"), componentDigest);
  // Never inherit NODE_OPTIONS, loader hooks, credentials, or shell configuration
  // into the installed CLI. These declared-contract probes require no network.
  const run = args => {
    const result = spawnSync(process.execPath, [path.join(pkg, "dist/cli.js"), ...args],
      {cwd: installDir, encoding: "utf8", env: verifierEnv, timeout: timeout(5000), maxBuffer: 1024 * 1024});
    assert.ok(!result.error && result.signal === null && Number.isInteger(result.status), "installed CLI probe failed or exceeded bounds");
    return result;
  };
  const json = args => { const result = run(args); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); };
  const core = json(["manifest"]);
  assert.equal(core.schema, "evopilot-evolution-expert-core/v3", "Expert public CLI Core schema mismatch");
  assert.equal(core.version, version);
  assert.equal(core.digest, digest({ ...core, digest: undefined }), "Core digest mismatch");
  for (const host of packagedHosts) {
    const adapter = readJson(path.join(pkg, `generated/${host}/adapter.json`));
    assert.equal(adapter.host, host);
    assert.equal(adapter.version, version);
    assert.equal(adapter.coreDigest, core.digest);
    assert.equal(adapter.digest, digest({ ...adapter, digest: undefined }), "Adapter digest mismatch");
    assert.ok(adapter.requiredCapabilities.includes("host-native-secure-secret-input"));
    for (const command of ["compatibility", "doctor"]) {
      for (const runtime of [[], ["6.3.1"], ["6.3.0"], ["6.2.0"]]) {
        const result = json([command, host, ...runtime]);
        const compatibility = command === "doctor" ? result.compatibility : result;
        assert.equal(compatibility.conformanceStatus, "CONFORMANT");
        assert.equal(compatibility.engineVersion, runtime[0] ?? "6.3.0");
        assert.equal(compatibility.expertVersion, version);
        assert.equal(compatibility.coreDigest, core.digest);
        assert.equal(compatibility.adapterDigest, adapter.digest);
        assert.deepEqual(compatibility.requiredHostCapabilities, adapter.requiredCapabilities);
        if (command === "doctor") {
          assert.equal(result.status, "READY");
          assert.equal(result.digest, digest({ ...result, digest: undefined }));
        }
      }
      for (const invalid of ["6.1.0", "7.0.0", "6.2.0invalid"]) assert.notEqual(run([command, host, invalid]).status, 0);
    }
  }
  for (const command of ["compatibility", "doctor"]) assert.notEqual(run([command, "unknown-host", "6.2.0"]).status, 0);
  assert.deepEqual(installedInventory(pkg), before, "installed inventory changed during CLI probes");
  assert.deepEqual(installedInventory(contracts), dependencyBefore, "installed dependency changed during CLI probes");
  regularFile(acceptedTarball, limits.archiveBytes);
  assert.equal(fileDigest(fs.readFileSync(acceptedTarball)), acceptedDigest, "accepted archive changed during CLI probes");
  return { status: "PASS", version, acceptedTarballDigest: acceptedDigest, installedFileCount: before.length,
    coreDigest: core.digest, componentDigest, hosts: packagedHosts, scope: "ACCEPTED_BYTES_AND_DECLARED_PACKAGE_CONTRACT_ONLY",
    runtimeDependencyBytes: "NOT_VERIFIED_BY_THIS_CHECK", realHostQualification: "NOT_OBSERVED", runtimeReadiness: "NOT_OBSERVED" };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(verifyExpertPublicInstallation({ installDir: process.argv[2], version: process.argv[3], acceptedTarball: process.argv[4] }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
