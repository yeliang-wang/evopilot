#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HANDOFF_SCHEMA = "evopilot-project-candidate-handoff/v1";

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalDigest(value) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}`;
}

export function fileDigest(filePath) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

export function buildHandoff(options) {
  const releaseDir = path.resolve(options.releaseDir);
  const sourceCheckout = path.resolve(options.sourceCheckout);
  assert.equal(isWithin(releaseDir, sourceCheckout), false, "Candidate release set must be fresh-materialized outside the source checkout");
  const targetPath = path.resolve(options.targetPath);
  const target = readJson(targetPath);
  const provenance = readJson(path.join(releaseDir, `evopilot-${options.version}-provenance.json`));

  assert.equal(target.schema, "evopilot-evolution-target/v1", "Target schema must be evopilot-evolution-target/v1");
  assert.equal(target.status, "APPROVED", "Target must remain APPROVED");
  assert.equal(target.id, options.targetId, "Target id mismatch");
  assert.equal(String(target.revision), String(options.targetRevision), "Target revision mismatch");
  assert.equal(target.approvals?.target?.authorizationDigest, options.targetAuthorizationDigest, "Target authorization digest mismatch");
  assert.equal(provenance.version, options.version, "release provenance version mismatch");
  assert.equal(provenance.commit, options.commit, "release provenance commit mismatch");
  assert.equal(provenance.github?.runId, options.runId, "release provenance run id mismatch");

  const names = fs.readdirSync(releaseDir)
    .filter((name) => fs.statSync(path.join(releaseDir, name)).isFile())
    .filter((name) => !name.endsWith("project-candidate-handoff.json"))
    .sort();
  assert.ok(names.length > 0, "release artifact set must not be empty");

  const baseLocator = `github-actions://${options.repository}/runs/${options.runId}/artifacts/${options.artifactName}`;
  const artifacts = names.map((name) => {
    const filePath = path.join(releaseDir, name);
    return {
      name,
      kind: artifactKind(name),
      mediaType: mediaType(name),
      size: fs.statSync(filePath).size,
      sha256: fileDigest(filePath),
      locator: `${baseLocator}/${name}`,
      destination: artifactDestination(name)
    };
  });

  const retentionDays = Number(options.retentionDays);
  assert.ok(Number.isInteger(retentionDays) && retentionDays > 0, "retentionDays must be a positive integer");
  const createdAt = parseTime(options.createdAt ?? new Date().toISOString());
  const expiresAt = new Date(createdAt.getTime() + retentionDays * 86_400_000).toISOString();
  const releaseSetMaterial = artifacts
    .map(({ name, kind, mediaType, size, sha256, locator, destination }) => ({ name, kind, mediaType, size, sha256, locator, destination }))
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name));

  return {
    schema: HANDOFF_SCHEMA,
    project: "evopilot",
    target: {
      id: target.id,
      revision: target.revision,
      authorizationDigest: options.targetAuthorizationDigest
    },
    releaseBuild: {
      id: `github-actions:${options.repository}:${options.runId}:${options.runAttempt}`,
      version: options.version,
      source: {
        forge: "GITHUB",
        repository: options.repository,
        commit: options.commit,
        workflow: options.workflow,
        workflowDigest: options.workflowDigest,
        runId: options.runId,
        runAttempt: Number(options.runAttempt),
        ref: options.ref
      }
    },
    candidateChannel: {
      class: "GITHUB_ACTIONS_ARTIFACT",
      visibility: "CONTROLLED",
      locator: baseLocator,
      artifactDigest: options.channelArtifactDigest,
      retentionSource: `workflow:retention-days=${retentionDays}`,
      expiresAt
    },
    artifacts,
    releaseSetDigest: canonicalDigest(releaseSetMaterial),
    verification: {
      freshMaterialization: true,
      outsideSourceCheckout: true,
      manifestVerified: true,
      artifactDigestsVerified: true,
      verifiedAt: createdAt.toISOString(),
      evidenceRefs: [
        `${baseLocator}#fresh-download`,
        `${baseLocator}/SHA256SUMS`
      ]
    },
    status: "RC_READY",
    authority: {
      grantsRelease: false
    }
  };
}

export function verifyHandoff(handoff, options) {
  const failures = [];
  const releaseDir = path.resolve(options.releaseDir);
  const sourceCheckout = path.resolve(options.sourceCheckout);
  check(isWithin(releaseDir, sourceCheckout) === false, "Candidate artifacts must be outside the source checkout");
  check(handoff?.schema === HANDOFF_SCHEMA, `schema must be ${HANDOFF_SCHEMA}`);
  check(handoff?.project === "evopilot", "project must be evopilot");
  check(handoff?.status === "RC_READY", "status must be RC_READY");
  check(handoff?.authority?.grantsRelease === false, "Candidate handoff must not grant release authority");
  check(handoff?.candidateChannel?.class === "GITHUB_ACTIONS_ARTIFACT", "Candidate channel must be GitHub Actions Artifact");
  check(handoff?.candidateChannel?.visibility === "CONTROLLED", "Candidate channel must be controlled");
  check(/^sha256:[0-9a-f]{64}$/.test(handoff?.candidateChannel?.artifactDigest ?? ""), "Candidate channel artifact digest is required");
  check(handoff?.verification?.freshMaterialization === true, "fresh materialization proof is required");
  check(handoff?.verification?.outsideSourceCheckout === true, "verification must occur outside the source checkout");
  check(handoff?.verification?.manifestVerified === true, "manifest verification is required");
  check(handoff?.verification?.artifactDigestsVerified === true, "artifact digest verification is required");
  check(handoff?.releaseBuild?.version === options.version, "Candidate version mismatch");
  check(handoff?.releaseBuild?.source?.forge === "GITHUB", "Candidate forge must be GitHub");
  check(handoff?.releaseBuild?.source?.repository === options.repository, "Candidate repository mismatch");
  check(handoff?.releaseBuild?.source?.commit === options.commit, "Candidate commit mismatch");
  check(String(handoff?.releaseBuild?.source?.runId) === String(options.runId), "Candidate run id mismatch");
  check(handoff?.target?.id === options.targetId, "Candidate Target id mismatch");
  if (options.handoffDigest) check(fileDigest(options.handoffPath) === options.handoffDigest, "Candidate handoff file digest mismatch");

  const artifacts = Array.isArray(handoff?.artifacts) ? handoff.artifacts : [];
  check(artifacts.length > 0, "Candidate artifacts must not be empty");
  const names = new Set();
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== "object") {
      failures.push("Candidate artifact entry must be an object");
      continue;
    }
    check(!names.has(artifact.name), `duplicate Candidate artifact: ${artifact.name}`);
    names.add(artifact.name);
    const filePath = path.join(releaseDir, String(artifact.name));
    check(fs.existsSync(filePath), `Candidate artifact missing: ${artifact.name}`);
    if (fs.existsSync(filePath)) {
      check(fs.statSync(filePath).size === artifact.size, `Candidate artifact size mismatch: ${artifact.name}`);
      check(fileDigest(filePath) === artifact.sha256, `Candidate artifact digest mismatch: ${artifact.name}`);
    }
  }
  for (const requiredKind of ["source-archive", "npm-package", "helm-chart", "sbom", "provenance", "checksums", "container-image-archive"]) {
    check(artifacts.some((artifact) => artifact.kind === requiredKind), `Candidate release set missing kind: ${requiredKind}`);
  }
  const material = artifacts
    .map(({ name, kind, mediaType, size, sha256, locator, destination }) => ({ name, kind, mediaType, size, sha256, locator, destination }))
    .sort((left, right) => String(left.kind).localeCompare(String(right.kind)) || String(left.name).localeCompare(String(right.name)));
  check(handoff?.releaseSetDigest === canonicalDigest(material), "Candidate releaseSetDigest mismatch");
  const expiry = parseTime(handoff?.candidateChannel?.expiresAt);
  check(expiry.getTime() > Date.now(), "Candidate artifact has expired");

  return {
    schema: "evopilot-project-candidate-handoff-result/v1",
    classification: failures.length === 0 ? "PASS" : "BLOCKED",
    project: "evopilot",
    releaseSetDigest: handoff?.releaseSetDigest ?? null,
    failures,
    grantsProductAuthority: false,
    grantsRelease: false,
    nextAction: failures.length === 0 ? "fresh-install-exact-candidate" : "repair-candidate-handoff-without-rebuilding-unchanged-bytes"
  };

  function check(condition, message) {
    if (!condition) failures.push(message);
  }
}

function artifactKind(name) {
  if (name === "SHA256SUMS") return "checksums";
  if (name.endsWith("-source.tar.gz")) return "source-archive";
  if (name.endsWith("-container-image.tar")) return "container-image-archive";
  if (name.endsWith("-helm-chart.tgz")) return "helm-chart";
  if (name.endsWith(".tgz")) return "npm-package";
  if (name.endsWith("-sbom.spdx.json")) return "sbom";
  if (name.endsWith("-provenance.json")) return "provenance";
  if (name.endsWith("-image-metadata.json")) return "container-image-metadata";
  if (name.endsWith("-install-manifest.json")) return "install-manifest";
  if (name === "install.sh" || name === "install.ps1") return "installer";
  return "release-asset";
}

function artifactDestination(name) {
  if (name.endsWith("-container-image.tar")) return "ghcr";
  if (name.endsWith(".tgz") && !name.endsWith("-helm-chart.tgz")) return "github-release+npm";
  return "github-release";
}

function mediaType(name) {
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) return "application/gzip";
  if (name.endsWith(".tar")) return "application/x-tar";
  if (name.endsWith(".ps1") || name.endsWith(".sh") || name === "SHA256SUMS") return "text/plain";
  return "application/octet-stream";
}

function parseTime(value) {
  const parsed = new Date(value);
  assert.ok(Number.isFinite(parsed.getTime()), `Invalid ISO-8601 time: ${value}`);
  return parsed;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseArgs(args) {
  const result = { command: args[0] };
  for (let index = 1; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith("--")) throw new Error(`Unknown argument: ${key}`);
    result[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = args[++index];
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "build") {
    const handoff = buildHandoff(options);
    fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
    fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(handoff, null, 2)}\n`);
    console.log(JSON.stringify({ status: "RC_READY", handoff: path.resolve(options.output), releaseSetDigest: handoff.releaseSetDigest }));
    return;
  }
  if (options.command === "verify") {
    options.handoffPath = path.resolve(options.handoff);
    const result = verifyHandoff(readJson(options.handoffPath), options);
    console.log(JSON.stringify(result, null, 2));
    if (result.classification !== "PASS") process.exitCode = 2;
    return;
  }
  throw new Error("Usage: project-candidate-handoff.mjs <build|verify> [options]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
