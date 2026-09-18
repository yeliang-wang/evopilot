import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyExpertPublicInstallation } from "../../scripts/verify-expert-public-install.mjs";

// Synthetic local unit fixture only: no Candidate identity, npm publication or real Host.
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "expert-public-verifier-unit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pkg = path.join(root, "node_modules/@evopilot/evolution-expert");
  fs.mkdirSync(pkg, { recursive: true });
  for (const entry of ["dist", "generated", "skill", "package.json"]) fs.cpSync(new URL(`../../packages/evolution-expert/${entry}`, import.meta.url), path.join(pkg, entry), { recursive: true });
  const contracts = path.join(root, "node_modules/@evopilot/contracts");
  fs.mkdirSync(contracts, { recursive: true });
  for (const entry of ["dist", "package.json"]) fs.cpSync(new URL(`../../packages/contracts/${entry}`, import.meta.url), path.join(contracts, entry), { recursive: true });
  const acceptedTarball = path.join(root, "unit-fixture.tgz");
  const repack = () => {
    fs.cpSync(pkg, path.join(root, "package"), { recursive: true });
    execFileSync("tar", ["-czf", acceptedTarball, "-C", root, "package"]);
  };
  repack();
  return { root, pkg, repack, options: { installDir: root, version: "2.2.1", acceptedTarball } };
}

test("public verifier accepts Core v3 exact bytes and all five declared CLI adapters", t => {
  const f = fixture(t);
  const result = verifyExpertPublicInstallation(f.options);
  assert.equal(result.status, "PASS");
  assert.equal(result.hosts.length, 5);
  assert.equal(result.realHostQualification, "NOT_OBSERVED");
  assert.equal(result.runtimeReadiness, "NOT_OBSERVED");
});
test("public verifier rejects version skew, unobserved package and installed-byte tampering", t => {
  const f = fixture(t);
  assert.throws(() => verifyExpertPublicInstallation({ ...f.options, version: "2.2.0" }));
  assert.throws(() => verifyExpertPublicInstallation({ ...f.options, installDir: path.join(f.root, "absent") }));
  fs.appendFileSync(path.join(f.pkg, "skill/SKILL.md"), "\nchanged\n");
  assert.throws(() => verifyExpertPublicInstallation(f.options), /installed bytes differ/);
});
test("public verifier rejects legacy Core schema even when artifact and installed bytes agree", t => {
  const f = fixture(t), index = path.join(f.pkg, "dist/index.js");
  const before = fs.readFileSync(index, "utf8");
  assert.match(before, /evopilot-evolution-expert-core\/v3/);
  fs.writeFileSync(index, before.replace("evopilot-evolution-expert-core/v3", "evopilot-evolution-expert-core/v2"));
  f.repack();
  assert.throws(() => verifyExpertPublicInstallation(f.options), /Core schema mismatch/);
});
test("public verifier rejects malformed Adapter digest even when artifact bytes agree", t => {
  const f = fixture(t), p = path.join(f.pkg, "generated/codex/adapter.json");
  const adapter = JSON.parse(fs.readFileSync(p));
  adapter.digest = `sha256:${"0".repeat(64)}`;
  fs.writeFileSync(p, JSON.stringify(adapter));
  f.repack();
  assert.throws(() => verifyExpertPublicInstallation(f.options), /Adapter digest mismatch/);
});
