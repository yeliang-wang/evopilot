#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const artifactPrefix = "evopilot-evolution-expert";

export function verifyEvolutionExpertArtifacts(options = {}) {
  const packageJson = readJson(path.join(root, "packages", "evolution-expert", "package.json"));
  const version = packageJson.version;
  const outDir = path.resolve(options.outDir ?? process.argv[2] ?? path.join(root, "dist", "evolution-expert-release"));
  const names = {
    tarball: `${artifactPrefix}-${version}.tgz`,
    sbom: `${artifactPrefix}-${version}-sbom.spdx.json`,
    provenance: `${artifactPrefix}-${version}-provenance.json`,
    checksums: "SHA256SUMS"
  };

  assert.ok(fs.existsSync(outDir), `${outDir} must exist`);
  for (const name of Object.values(names)) {
    const filePath = path.join(outDir, name);
    assert.ok(fs.existsSync(filePath), `${name} is required`);
    assert.ok(fs.statSync(filePath).size > 0, `${name} must not be empty`);
  }

  const expectedNames = new Set(Object.values(names));
  const actualNames = fs.readdirSync(outDir).filter((name) => fs.statSync(path.join(outDir, name)).isFile());
  assert.deepEqual(new Set(actualNames), expectedNames, "Expert Candidate release set contains unexpected or missing files");

  const checksumLines = fs.readFileSync(path.join(outDir, names.checksums), "utf8").trim().split(/\r?\n/).filter(Boolean);
  assert.equal(checksumLines.length, 3, "checksums must bind the tarball, SBOM, and provenance");
  for (const line of checksumLines) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    assert.ok(match, `invalid checksum line: ${line}`);
    const [, expected, name] = match;
    assert.equal(sha256(path.join(outDir, name)), expected, `${name} checksum mismatch`);
  }

  const packedManifest = JSON.parse(execFileSync("tar", ["-xOf", path.join(outDir, names.tarball), "package/package.json"], { encoding: "utf8" }));
  assert.equal(packedManifest.name, packageJson.name);
  assert.equal(packedManifest.version, version);
  const runtimeContractRange = packageJson.dependencies?.["@evopilot/contracts"];
  assert.ok(runtimeContractRange, "Expert package must declare its compatible Runtime contract range");
  assert.equal(packedManifest.dependencies?.["@evopilot/contracts"], runtimeContractRange);

  const sbom = readJson(path.join(outDir, names.sbom));
  assert.equal(sbom.spdxVersion, "SPDX-2.3");
  assert.ok(sbom.packages.some((item) => item.name === packageJson.name && item.versionInfo === version));
  assert.ok(sbom.packages.some((item) => item.name === "@evopilot/contracts" && item.versionInfo === runtimeContractRange));

  const provenance = readJson(path.join(outDir, names.provenance));
  assert.equal(provenance.schema, "evopilot-evolution-expert-release-provenance/v1");
  assert.equal(provenance.project, "evopilot");
  assert.equal(provenance.releaseUnit, "evolution-expert");
  assert.equal(provenance.package, packageJson.name);
  assert.equal(provenance.version, version);
  assert.equal(provenance.tag, `evolution-expert-v${version}`);
  assert.deepEqual(new Set(provenance.artifacts.map((item) => item.name)), new Set([names.tarball, names.sbom]));
  for (const artifact of provenance.artifacts) {
    const filePath = path.join(outDir, artifact.name);
    assert.equal(fs.statSync(filePath).size, artifact.bytes, `${artifact.name} byte count mismatch`);
    assert.equal(sha256(filePath), artifact.sha256, `${artifact.name} provenance checksum mismatch`);
  }

  return {
    status: "PASS",
    releaseUnit: "evolution-expert",
    version,
    outDir,
    files: [...expectedNames].sort()
  };
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(verifyEvolutionExpertArtifacts(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
