import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildHandoff, fileDigest, verifyHandoff } from "../../scripts/project-candidate-handoff.mjs";

test("Candidate handoff binds exact GitHub build and fresh artifact bytes without release authority", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-candidate-handoff-"));
  const releaseDir = path.join(temp, "fresh", "release");
  const sourceCheckout = path.join(temp, "source");
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.mkdirSync(sourceCheckout, { recursive: true });
  const version = "4.0.0";
  const commit = "a".repeat(40);
  const runId = "123456";
  const targetId = "evopilot-v4.0.0-open-lifecycle-harness";
  const targetAuthorizationDigest = `sha256:${"b".repeat(64)}`;
  const targetPath = path.join(temp, "target.json");
  fs.writeFileSync(targetPath, JSON.stringify({
    schema: "evopilot-evolution-target/v1",
    id: targetId,
    revision: 2,
    status: "APPROVED",
    approvals: { target: { authorizationDigest: targetAuthorizationDigest } }
  }));

  const files = {
    [`evopilot-${version}-source.tar.gz`]: "source",
    [`evopilot-cli-${version}.tgz`]: "npm",
    [`evopilot-${version}-helm-chart.tgz`]: "helm",
    [`evopilot-${version}-sbom.spdx.json`]: "{}",
    [`evopilot-${version}-container-image.tar`]: "image",
    "SHA256SUMS": "checksums"
  };
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(releaseDir, name), content);
  fs.writeFileSync(path.join(releaseDir, `evopilot-${version}-provenance.json`), JSON.stringify({
    version,
    commit,
    github: { runId }
  }));

  const handoff = buildHandoff({
    releaseDir,
    sourceCheckout,
    targetPath,
    targetId,
    targetRevision: "2",
    targetAuthorizationDigest,
    version,
    commit,
    repository: "owner/evopilot",
    runId,
    runAttempt: "1",
    workflow: ".github/workflows/release-candidate.yml",
    workflowDigest: `sha256:${"c".repeat(64)}`,
    ref: "refs/heads/main",
    artifactName: `evopilot-${version}-candidate-release-set`,
    channelArtifactDigest: `sha256:${"d".repeat(64)}`,
    retentionDays: "30",
    createdAt: "2099-01-01T00:00:00.000Z"
  });
  const handoffPath = path.join(temp, "handoff.json");
  fs.writeFileSync(handoffPath, JSON.stringify(handoff));
  const result = verifyHandoff(handoff, {
    releaseDir,
    sourceCheckout,
    handoffPath,
    handoffDigest: fileDigest(handoffPath),
    version,
    repository: "owner/evopilot",
    commit,
    runId,
    targetId
  });

  assert.equal(result.classification, "PASS", JSON.stringify(result.failures));
  assert.equal(handoff.authority.grantsRelease, false);
  assert.equal(handoff.verification.freshMaterialization, true);
  assert.equal(handoff.verification.outsideSourceCheckout, true);

  fs.writeFileSync(path.join(releaseDir, `evopilot-cli-${version}.tgz`), "tampered");
  const tampered = verifyHandoff(handoff, {
    releaseDir,
    sourceCheckout,
    handoffPath,
    handoffDigest: fileDigest(handoffPath),
    version,
    repository: "owner/evopilot",
    commit,
    runId,
    targetId
  });
  assert.equal(tampered.classification, "BLOCKED");
  assert.ok(tampered.failures.some((failure) => failure.includes("digest mismatch")));
});
