#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const packagedHosts = ["codex", "claude-code", "workbuddy", "generic-agent", "generic-mcp"];
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object"
  ? `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}` : JSON.stringify(value);
const digest = value => `sha256:${crypto.createHash("sha256").update(stable(value)).digest("hex")}`;
const readJson = p => JSON.parse(fs.readFileSync(p, "utf8"));

// Called only after Registry integrity/provenance and npm signature verification.
// This local check does not itself assert public availability or real Host readiness.
export function verifyExpertPublicInstallation({ installDir, version, acceptedTarball }) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.ok(acceptedTarball && fs.existsSync(acceptedTarball), "exact accepted tarball is required");
  const pkg = path.join(installDir, "node_modules/@evopilot/evolution-expert");
  const manifest = readJson(path.join(pkg, "package.json"));
  assert.equal(manifest.name, "@evopilot/evolution-expert");
  assert.equal(manifest.version, version);
  assert.equal(manifest.dependencies["@evopilot/contracts"], "6.2.0");
  assert.equal(readJson(path.join(installDir, "node_modules/@evopilot/contracts/package.json")).version, "6.2.0");
  const members = execFileSync("tar", ["-tzf", acceptedTarball], { encoding: "utf8" }).trim().split("\n").filter(x => !x.endsWith("/"));
  assert.ok(members.includes("package/dist/cli.js") && members.includes("package/skill/SKILL.md"));
  for (const member of members) {
    assert.ok(member.startsWith("package/") && !member.split("/").includes(".."), "unsafe accepted tarball path");
    const local = path.join(pkg, member.slice("package/".length));
    assert.ok(fs.lstatSync(local).isFile(), `installed file missing or not regular: ${member}`);
    assert.deepEqual(fs.readFileSync(local), execFileSync("tar", ["-xOf", acceptedTarball, member]), `installed bytes differ from accepted tarball: ${member}`);
  }
  const run = args => spawnSync(process.execPath, [path.join(pkg, "dist/cli.js"), ...args], { cwd: installDir, encoding: "utf8" });
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
      for (const runtime of [[], ["6.2.0"]]) {
        const result = json([command, host, ...runtime]);
        const compatibility = command === "doctor" ? result.compatibility : result;
        assert.equal(compatibility.conformanceStatus, "CONFORMANT");
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
  return { status: "PASS", version, coreDigest: core.digest, hosts: packagedHosts, scope: "ACCEPTED_BYTES_AND_DECLARED_PACKAGE_CONTRACT_ONLY", realHostQualification: "NOT_OBSERVED", runtimeReadiness: "NOT_OBSERVED" };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(verifyExpertPublicInstallation({ installDir: process.argv[2], version: process.argv[3], acceptedTarball: process.argv[4] }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
