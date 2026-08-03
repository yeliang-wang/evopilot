#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectName = "evopilot";
const root = process.cwd();
const outDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "dist", "release");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = packageJson.version;

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

assert.ok(fs.existsSync(outDir), `${outDir} must exist`);

const required = [
  `${projectName}-${version}-source.tar.gz`,
  `${projectName}-${version}-sbom.spdx.json`,
  `${projectName}-${version}-provenance.json`,
  `${projectName}-${version}-helm-chart.tgz`,
  `evopilot-contracts-${version}.tgz`,
  `evopilot-client-${version}.tgz`,
  `evopilot-cli-${version}.tgz`,
  `create-evopilot-${version}.tgz`,
  `${projectName}-${version}-install-manifest.json`,
  "install.sh",
  "install.ps1",
  "SHA256SUMS"
];

for (const name of required) {
  const filePath = path.join(outDir, name);
  assert.ok(fs.existsSync(filePath), `${name} is required`);
  assert.ok(fs.statSync(filePath).size > 0, `${name} must not be empty`);
}

const checksumLines = fs.readFileSync(path.join(outDir, "SHA256SUMS"), "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

for (const line of checksumLines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  assert.ok(match, `invalid checksum line: ${line}`);
  const [, expected, name] = match;
  const filePath = path.join(outDir, name);
  assert.ok(fs.existsSync(filePath), `${name} listed in SHA256SUMS must exist`);
  assert.equal(sha256(filePath), expected, `${name} checksum mismatch`);
}

const sbom = readJson(path.join(outDir, `${projectName}-${version}-sbom.spdx.json`));
assert.equal(sbom.spdxVersion, "SPDX-2.3");
assert.ok(Array.isArray(sbom.packages));
assert.ok(sbom.packages.some((pkg) => pkg.name === packageJson.name && pkg.versionInfo === version));

const sourceListing = execFileSync("tar", ["-tzf", path.join(outDir, `${projectName}-${version}-source.tar.gz`)], {
  encoding: "utf8"
});
assert.match(sourceListing, /^install\.sh$/m, "source archive must include install.sh");
assert.match(sourceListing, /^install\.ps1$/m, "source archive must include install.ps1");
assert.match(sourceListing, /^installers\/manifest\.json$/m, "source archive must include installer manifest");
assert.match(sourceListing, /^charts\/evopilot\/values\.production\.example\.yaml$/m, "source archive must include production Helm values");

const installManifest = readJson(path.join(outDir, `${projectName}-${version}-install-manifest.json`));
assert.equal(installManifest.schema, "evopilot-install-manifest/v1");
assert.equal(installManifest.version, version);
assert.equal(installManifest.installers?.["install.sh"]?.sha256, sha256(path.join(outDir, "install.sh")));
assert.equal(installManifest.installers?.["install.ps1"]?.sha256, sha256(path.join(outDir, "install.ps1")));

const provenance = readJson(path.join(outDir, `${projectName}-${version}-provenance.json`));
assert.equal(provenance.schema, "evopilot-release-provenance/v1");
assert.equal(provenance.project, projectName);
assert.equal(provenance.version, version);
assert.equal(provenance.tag, `v${version}`);
assert.ok(Array.isArray(provenance.artifacts));
assert.ok(provenance.artifacts.some((artifact) => artifact.name === `${projectName}-${version}-source.tar.gz`));
assert.ok(provenance.artifacts.some((artifact) => artifact.name === `${projectName}-${version}-helm-chart.tgz`));
assert.ok(provenance.artifacts.some((artifact) => artifact.name === `evopilot-cli-${version}.tgz`));
for (const artifact of provenance.artifacts) {
  const filePath = path.join(outDir, artifact.name);
  assert.ok(fs.existsSync(filePath), `${artifact.name} from provenance must exist`);
  assert.equal(fs.statSync(filePath).size, artifact.bytes, `${artifact.name} byte count mismatch`);
  assert.equal(sha256(filePath), artifact.sha256, `${artifact.name} provenance checksum mismatch`);
}

const imageMetadataPath = path.join(outDir, `${projectName}-${version}-image-metadata.json`);
if (fs.existsSync(imageMetadataPath)) {
  const imageMetadata = readJson(imageMetadataPath);
  assert.equal(imageMetadata.schema, "evopilot-image-metadata/v1");
  assert.equal(imageMetadata.project, projectName);
  assert.equal(imageMetadata.version, version);
  assert.match(imageMetadata.imageDigest || "", /^sha256:[a-f0-9]{64}$/);
  assert.ok(imageMetadata.immutableRef?.includes("@sha256:"), "image metadata must include immutable image ref");
}

console.log("Release artifact verification passed.");
