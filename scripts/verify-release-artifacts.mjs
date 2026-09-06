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
  `evopilot-adapter-mcp-${version}.tgz`,
  `evopilot-adapter-opencode-${version}.tgz`,
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
assert.match(sourceListing, /^\.env\.example$/m, "source archive must include the environment template");
assert.match(sourceListing, /^\.evopilot\/source-closures\//m, "source archive must include checked-in source-closure examples");
assert.match(sourceListing, /^installers\/manifest\.json$/m, "source archive must include installer manifest");
assert.match(sourceListing, /^charts\/evopilot\/values\.production\.example\.yaml$/m, "source archive must include production Helm values");
assert.match(sourceListing, /^evidence\/production-soak\/README\.md$/m, "source archive must include the checked-in production-soak evidence contract");
assert.match(sourceListing, /^governance\/roadmap\.yaml$/m, "source archive must include the authoritative Roadmap");
assert.match(sourceListing, /^governance\/targets\/evopilot-v4\.0\.0-open-lifecycle-harness\.json$/m, "source archive must include the approved v4.0.0 Evolution Target");
assert.match(sourceListing, /^scripts\/run-active-ga-soak\.mjs$/m, "source archive must include the configurable active-soak launcher");

const installManifest = readJson(path.join(outDir, `${projectName}-${version}-install-manifest.json`));
assert.equal(installManifest.schema, "evopilot-install-manifest/v1");
assert.equal(installManifest.version, version);
assert.equal(installManifest.packages?.["create-evopilot"]?.registryStatus, "not_published");
assert.equal(installManifest.packages?.["@evopilot/cli"]?.registryStatus, "not_published");
assert.equal(installManifest.packages?.["@evopilot/adapter-mcp"]?.registryStatus, "not_published");
assert.equal(installManifest.packages?.["@evopilot/adapter-opencode"]?.registryStatus, "not_published");
assert.match(installManifest.packages?.["create-evopilot"]?.packageSpec || "", new RegExp(`create-evopilot-${escapeRegExp(version)}\\.tgz$`));
assert.match(installManifest.packages?.["@evopilot/cli"]?.packageSpec || "", new RegExp(`evopilot-cli-${escapeRegExp(version)}\\.tgz$`));
assert.match(installManifest.packages?.["@evopilot/adapter-mcp"]?.packageSpec || "", new RegExp(`evopilot-adapter-mcp-${escapeRegExp(version)}\\.tgz$`));
assert.equal(installManifest.packages?.["@evopilot/adapter-mcp"]?.binary, "evopilot-mcp");
assert.match(installManifest.packages?.["@evopilot/adapter-opencode"]?.packageSpec || "", new RegExp(`evopilot-adapter-opencode-${escapeRegExp(version)}\\.tgz$`));
assert.equal(installManifest.packages?.["@evopilot/adapter-opencode"]?.runtime?.package, "opencode-ai");
assert.match(installManifest.packages?.["@evopilot/adapter-opencode"]?.runtime?.version || "", /^\d+\.\d+\.\d+$/);
assert.deepEqual(installManifest.packages?.["@evopilot/cli"]?.dependencyPackageSpecs || [], [
  `https://github.com/yeliang-wang/evopilot/releases/download/v${version}/evopilot-contracts-${version}.tgz`,
  `https://github.com/yeliang-wang/evopilot/releases/download/v${version}/evopilot-client-${version}.tgz`
]);
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
assert.ok(provenance.artifacts.some((artifact) => artifact.name === `evopilot-adapter-mcp-${version}.tgz`));
assert.ok(provenance.artifacts.some((artifact) => artifact.name === `evopilot-adapter-opencode-${version}.tgz`));
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
  if (imageMetadata.candidateArchive) {
    const archivePath = path.join(outDir, imageMetadata.candidateArchive);
    assert.ok(fs.existsSync(archivePath), "candidate container image archive must exist");
    assert.equal(`sha256:${sha256(archivePath)}`, imageMetadata.candidateArchiveSha256, "candidate image archive checksum mismatch");
    assert.ok(provenance.artifacts.some((artifact) => artifact.name === imageMetadata.candidateArchive), "candidate image archive must be in provenance");
  }
}

console.log("Release artifact verification passed.");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
