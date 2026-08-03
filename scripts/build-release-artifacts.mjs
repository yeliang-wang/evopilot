#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectName = "evopilot";
const root = process.cwd();
const outDir = path.join(root, "dist", "release");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = packageJson.version;
const tag = process.env.GITHUB_REF_NAME || `v${version}`;
const expectedTag = `v${version}`;

if (tag !== expectedTag) {
  throw new Error(`Release tag ${tag} does not match package version ${version}`);
}

function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    ...options
  });
  return output == null ? "" : output.trim();
}

function optionalRun(command, args) {
  try {
    return run(command, args);
  } catch {
    return null;
  }
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function safeSpdxId(value) {
  return `SPDXRef-${value.replace(/[^A-Za-z0-9.-]/g, "-")}`;
}

function generateSbom() {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const packages = [
    {
      name: packageJson.name,
      SPDXID: "SPDXRef-Package-root",
      versionInfo: version,
      downloadLocation: "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: packageJson.license || "NOASSERTION",
      licenseDeclared: packageJson.license || "NOASSERTION",
      supplier: "Organization: EvoPilot"
    }
  ];

  for (const [lockPath, metadata] of Object.entries(lock.packages || {})) {
    if (!lockPath || !metadata.version) continue;
    const name = metadata.name || lockPath.split("node_modules/").pop();
    if (!name) continue;
    const pkg = {
      name,
      SPDXID: safeSpdxId(`${name}-${metadata.version}`),
      versionInfo: metadata.version,
      downloadLocation: metadata.resolved || "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: metadata.license || "NOASSERTION",
      licenseDeclared: metadata.license || "NOASSERTION",
      supplier: "NOASSERTION"
    };
    if (metadata.integrity) {
      pkg.externalRefs = [
        {
          referenceCategory: "PACKAGE-MANAGER",
          referenceType: "purl",
          referenceLocator: `pkg:npm/${encodeURIComponent(name)}@${metadata.version}`
        }
      ];
    }
    packages.push(pkg);
  }

  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `${projectName}-${version}-sbom`,
    documentNamespace: `https://github.com/yeliang-wang/evopilot/releases/download/${tag}/${projectName}-${version}-sbom.spdx.json`,
    creationInfo: {
      created: new Date().toISOString(),
      creators: ["Tool: evopilot-release-artifacts/v1"]
    },
    packages,
    relationships: packages.slice(1).map((pkg) => ({
      spdxElementId: "SPDXRef-Package-root",
      relationshipType: "DEPENDS_ON",
      relatedSpdxElement: pkg.SPDXID
    }))
  };
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => !name.endsWith(".tmp"))
    .sort()
    .map((name) => path.join(dir, name))
    .filter((filePath) => fs.statSync(filePath).isFile());
}

const commit = run("git", ["rev-parse", "HEAD"]);
const remote = optionalRun("git", ["remote", "get-url", "origin"]);
const dirty = optionalRun("git", ["status", "--short"]);
if (dirty && process.env.CI === "true") {
  throw new Error(`Release artifact build requires a clean checkout:\n${dirty}`);
}

run("npm", ["run", "build"], { stdio: "inherit" });

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const sourceArchive = `${projectName}-${version}-source.tar.gz`;
const sourceArchivePath = path.join(outDir, sourceArchive);
run("tar", [
  "--exclude", "node_modules",
  "--exclude", ".git",
  "--exclude", ".codex-evidence",
  "--exclude", "dist",
  "--exclude", "tmp",
  "--exclude", ".tmp",
  "-czf",
  sourceArchivePath,
  "AGENTS.md",
  ".github",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "Dockerfile",
  "LICENSE",
  "NOTICE",
  "README.md",
  "SECURITY.md",
  "deploy",
  "docker-compose.yml",
  "docs",
  "examples",
  "harness-templates",
  "llms.txt",
  "octopus.project.json",
  "package-lock.json",
  "package.json",
  "packages",
  "runtimes",
  "scripts",
  "standards",
  "templates",
  "tests"
], { stdio: "inherit" });

const sbomPath = path.join(outDir, `${projectName}-${version}-sbom.spdx.json`);
fs.writeFileSync(sbomPath, `${JSON.stringify(generateSbom(), null, 2)}\n`);

const imageMetadataPath = path.join(outDir, `${projectName}-${version}-image-metadata.json`);
const imageDigest = process.env.EVOPILOT_IMAGE_DIGEST || null;
const imageRef = process.env.EVOPILOT_IMAGE_REF || null;
if (imageDigest || imageRef) {
  fs.writeFileSync(imageMetadataPath, `${JSON.stringify({
    schema: "evopilot-image-metadata/v1",
    project: projectName,
    version,
    tag,
    imageRef,
    imageDigest,
    immutableRef: imageRef && imageDigest ? `${imageRef}@${imageDigest}` : null,
    generatedAt: new Date().toISOString()
  }, null, 2)}\n`);
}

const artifactFiles = listFiles(outDir)
  .filter((filePath) => !filePath.endsWith("SHA256SUMS") && !filePath.endsWith("-provenance.json"));

const artifacts = artifactFiles.map((filePath) => ({
  name: path.basename(filePath),
  bytes: fs.statSync(filePath).size,
  sha256: sha256(filePath)
}));

const provenancePath = path.join(outDir, `${projectName}-${version}-provenance.json`);
fs.writeFileSync(provenancePath, `${JSON.stringify({
  schema: "evopilot-release-provenance/v1",
  project: projectName,
  version,
  tag,
  commit,
  remote,
  generatedAt: new Date().toISOString(),
  github: {
    repository: process.env.GITHUB_REPOSITORY || null,
    runId: process.env.GITHUB_RUN_ID || null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    workflow: process.env.GITHUB_WORKFLOW || null,
    ref: process.env.GITHUB_REF || null,
    sha: process.env.GITHUB_SHA || null
  },
  artifactMode: imageDigest ? "release-archive+container-image-digest" : "release-archive",
  artifacts
}, null, 2)}\n`);

const checksumFiles = [...artifactFiles, provenancePath].sort();
const checksums = checksumFiles
  .map((filePath) => `${sha256(filePath)}  ${path.basename(filePath)}`)
  .join("\n");
fs.writeFileSync(path.join(outDir, "SHA256SUMS"), `${checksums}\n`);

console.log(`Release artifacts written to ${path.relative(root, outDir)}`);
