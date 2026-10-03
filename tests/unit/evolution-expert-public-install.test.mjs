import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {createRequire} from "node:module";
import { verifyExpertPublicInstallation } from "../../scripts/verify-expert-public-install.mjs";
import { inventory } from "../../packages/evolution-expert/host-integration/inventory.mjs";

// Synthetic local unit fixture only: no Candidate identity, npm publication or real Host.
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "expert-public-verifier-unit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pkg = path.join(root, "node_modules/@evopilot/evolution-expert");
  fs.mkdirSync(pkg, { recursive: true });
  for (const entry of ["dist", "generated", "skill", "host-integration", "package.json"]) fs.cpSync(new URL(`../../packages/evolution-expert/${entry}`, import.meta.url), path.join(pkg, entry), { recursive: true });
  // This tests byte verification, not native execution or real Host qualification.
  const integration = path.join(pkg, "host-integration");
  fs.mkdirSync(path.join(integration, "dist/darwin-arm64"), { recursive: true });
  const native = path.join(integration, "dist/darwin-arm64/secure-input");
  fs.writeFileSync(native, "synthetic NOT executable native artifact\n");
  fs.chmodSync(native, 0o600);
  fs.writeFileSync(path.join(integration, "manifest.json"), JSON.stringify({
    schema: "evopilot-expert-host-integration/v1", expertVersion: "2.3.0", runtimeVersion: "6.3.0",
    platforms: ["darwin-arm64"], files: inventory(integration),
  }, null, 2) + "\n");
  const contracts = path.join(root, "node_modules/@evopilot/contracts");
  fs.mkdirSync(contracts, { recursive: true });
  const expertRequire=createRequire(new URL("../../packages/evolution-expert/package.json",import.meta.url));
  const contractsRoot=path.dirname(expertRequire.resolve("@evopilot/contracts/package.json"));
  for (const entry of ["dist", "package.json"]) fs.cpSync(path.join(contractsRoot,entry), path.join(contracts, entry), { recursive: true });
  const acceptedTarball = path.join(root, "unit-fixture.tgz");
  const repack = () => {
    fs.cpSync(pkg, path.join(root, "package"), { recursive: true });
    execFileSync("tar", ["-czf", acceptedTarball, "-C", root, "package"]);
  };
  repack();
  return { root, pkg, repack, options: { installDir: root, version: "2.3.0", acceptedTarball } };
}

test("public verifier accepts Core v3 exact bytes and all five declared CLI adapters", t => {
  const f = fixture(t);
  const result = verifyExpertPublicInstallation(f.options);
  assert.equal(result.status, "PASS");
  assert.equal(result.hosts.length, 5);
  assert.equal(result.realHostQualification, "NOT_OBSERVED");
  assert.equal(result.runtimeReadiness, "NOT_OBSERVED");
  assert.equal(result.runtimeDependencyBytes, "NOT_VERIFIED_BY_THIS_CHECK");
  assert.match(result.acceptedTarballDigest, /^sha256:[0-9a-f]{64}$/);
  assert.ok(result.installedFileCount > 0);
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

test("public verifier rejects an additional installed file absent from accepted bytes", t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.pkg, "dist/unaccepted.js"), "export const unaccepted = true;\n");
  assert.throws(() => verifyExpertPublicInstallation(f.options), /inventory|unexpected/i);
});
test("public verifier rejects a substituted installed directory even if bytes match", t => {
  const f = fixture(t), replacement = path.join(f.root, "substitute-generated");
  fs.renameSync(path.join(f.pkg, "generated"), replacement);
  fs.symlinkSync(replacement, path.join(f.pkg, "generated"));
  assert.throws(() => verifyExpertPublicInstallation(f.options), /symlink|regular|directory/i);
});
test("public verifier rejects duplicate archive members including empty files", t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.pkg, "empty"), "");
  f.repack();
  execFileSync("tar", ["-czf", f.options.acceptedTarball, "-C", f.root, "package", "package/empty"]);
  assert.throws(() => verifyExpertPublicInstallation(f.options), /duplicate/i);
});
test("public verifier rejects a substituted package root", t => {
  const f = fixture(t), replacement = path.join(f.root, "substitute-package");
  fs.renameSync(f.pkg, replacement); fs.symlinkSync(replacement, f.pkg);
  assert.throws(() => verifyExpertPublicInstallation(f.options), /symlink|directory/i);
});
test("public verifier rejects a symlinked Runtime dependency before invoking the CLI", t => {
  const f = fixture(t), installed = path.join(f.root, "node_modules/@evopilot/contracts"), replacement = path.join(f.root, "substitute-contracts");
  fs.renameSync(installed, replacement); fs.symlinkSync(replacement, installed);
  assert.throws(() => verifyExpertPublicInstallation(f.options), /symlink|directory/i);
});
test("public verifier rejects oversized archives before listing or CLI execution", t => {
  const f = fixture(t);
  fs.truncateSync(f.options.acceptedTarball, 64 * 1024 * 1024 + 1);
  assert.throws(() => verifyExpertPublicInstallation(f.options), /size limit/i);
});
test("public verifier does not inherit Node preload hooks into the CLI", t => {
  const f = fixture(t), marker = path.join(f.root, "preload-was-run"), preload = path.join(f.root, "preload.cjs");
  fs.writeFileSync(preload, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected');`);
  const previous = process.env.NODE_OPTIONS;
  try {
    process.env.NODE_OPTIONS = `--require=${preload}`;
    assert.equal(verifyExpertPublicInstallation(f.options).status, "PASS");
    assert.equal(fs.existsSync(marker), false);
  } finally { if (previous === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = previous; }
});
test("public verifier bounds an unresponsive declared-contract CLI probe", {timeout: 15000}, t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.pkg, "dist/cli.js"), "setInterval(() => {}, 1000);\n"); f.repack();
  const start = Date.now();
  assert.throws(() => verifyExpertPublicInstallation(f.options), /probe failed|bounds/i);
  assert.ok(Date.now() - start < 10000);
});
test("public verifier bounds CLI stdout instead of accepting a partial response", t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.pkg, "dist/cli.js"), "process.stdout.write('x'.repeat(2 * 1024 * 1024));\n"); f.repack();
  assert.throws(() => verifyExpertPublicInstallation(f.options), /probe failed|bounds/i);
});
test("public verifier rejects installed-file mutation during otherwise valid CLI probes", t => {
  const f = fixture(t), cli = path.join(f.pkg, "dist/cli.js");
  const text = fs.readFileSync(cli, "utf8").replace(/^#![^\n]*\n/, "");
  fs.writeFileSync(cli, `import {appendFileSync as mutateFixture} from 'node:fs'; mutateFixture(new URL('../skill/SKILL.md', import.meta.url), '\\nchanged');\n` + text);
  f.repack();
  assert.throws(() => verifyExpertPublicInstallation(f.options), /inventory changed/i);
});
