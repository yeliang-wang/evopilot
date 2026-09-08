#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const workspace = "@evopilot/evolution-expert";
const releaseUnit = "evolution-expert";
const artifactPrefix = "evopilot-evolution-expert";

export function buildEvolutionExpertArtifacts(options = {}) {
  const packagePath = path.join(root, "packages", "evolution-expert", "package.json");
  const packageJson = readJson(packagePath);
  const version = packageJson.version;
  const outDir = path.resolve(options.outDir ?? process.env.EVOPILOT_EXPERT_RELEASE_DIR ?? path.join(root, "dist", "evolution-expert-release"));
  const tag = process.env.EVOPILOT_EXPERT_TAG || `evolution-expert-v${version}`;
  const commit = optionalRun("git", ["rev-parse", "HEAD"]);
  const remote = optionalRun("git", ["remote", "get-url", "origin"]);

  if (options.build !== false) run("npm", ["run", "build", "-w", workspace], { stdio: "inherit" });
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  run("npm", ["pack", "-w", workspace, "--pack-destination", outDir], { stdio: "inherit" });

  const tarballName = `${artifactPrefix}-${version}.tgz`;
  const tarballPath = path.join(outDir, tarballName);
  if (!fs.existsSync(tarballPath)) throw new Error(`Expected Expert tarball was not produced: ${tarballName}`);

  const sbomName = `${artifactPrefix}-${version}-sbom.spdx.json`;
  const sbomPath = path.join(outDir, sbomName);
  fs.writeFileSync(sbomPath, `${JSON.stringify(buildSbom(packageJson, version, tag), null, 2)}\n`);

  const artifactFiles = [tarballPath, sbomPath];
  const provenanceName = `${artifactPrefix}-${version}-provenance.json`;
  const provenancePath = path.join(outDir, provenanceName);
  fs.writeFileSync(provenancePath, `${JSON.stringify({
    schema: "evopilot-evolution-expert-release-provenance/v1",
    project: "evopilot",
    releaseUnit,
    package: packageJson.name,
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
    artifacts: artifactFiles.map(describeArtifact)
  }, null, 2)}\n`);

  const checksumFiles = [...artifactFiles, provenancePath].sort();
  const checksums = checksumFiles.map((filePath) => `${sha256(filePath)}  ${path.basename(filePath)}`).join("\n");
  fs.writeFileSync(path.join(outDir, "SHA256SUMS"), `${checksums}\n`);

  return { outDir, version, tag, tarballName, provenanceName };
}

function buildSbom(packageJson, version, tag) {
  const packages = [{
    name: packageJson.name,
    SPDXID: "SPDXRef-Package-evopilot-evolution-expert",
    versionInfo: version,
    downloadLocation: "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: packageJson.license || "NOASSERTION",
    licenseDeclared: packageJson.license || "NOASSERTION",
    supplier: "Organization: EvoPilot"
  }];
  for (const [name, dependencyVersion] of Object.entries(packageJson.dependencies ?? {})) {
    packages.push({
      name,
      SPDXID: `SPDXRef-Dependency-${name.replace(/[^A-Za-z0-9.-]/g, "-")}`,
      versionInfo: dependencyVersion,
      downloadLocation: "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: "NOASSERTION",
      licenseDeclared: "NOASSERTION",
      supplier: "NOASSERTION"
    });
  }
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `${artifactPrefix}-${version}-sbom`,
    documentNamespace: `https://github.com/yeliang-wang/evopilot/releases/download/${tag}/${artifactPrefix}-${version}-sbom.spdx.json`,
    creationInfo: { created: new Date().toISOString(), creators: ["Tool: evopilot-evolution-expert-release-artifacts/v1"] },
    packages,
    relationships: packages.slice(1).map((dependency) => ({
      spdxElementId: "SPDXRef-Package-evopilot-evolution-expert",
      relationshipType: "DEPENDS_ON",
      relatedSpdxElement: dependency.SPDXID
    }))
  };
}

function describeArtifact(filePath) {
  return { name: path.basename(filePath), bytes: fs.statSync(filePath).size, sha256: sha256(filePath) };
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: options.stdio ?? ["ignore", "pipe", "pipe"] });
}

function optionalRun(command, args) {
  try {
    return run(command, args).trim() || null;
  } catch {
    return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildEvolutionExpertArtifacts();
  console.log(JSON.stringify({ status: "PASS", ...result }));
}
