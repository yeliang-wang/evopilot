import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("release promotion record preserves Candidate, acceptance, and separate Release Binding", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-release-promotion-"));
  const handoffPath = path.join(temp, "handoff.json");
  const recordPath = path.join(temp, "record.json");
  const commit = "a".repeat(40);
  const acceptanceDigest = `sha256:${"b".repeat(64)}`;
  const releaseAuthorizationDigest = `sha256:${"c".repeat(64)}`;
  fs.writeFileSync(handoffPath, JSON.stringify({
    releaseBuild: { version: "4.0.0", source: { commit, runId: "123" } },
    target: { id: "evopilot-v4.0.0-open-lifecycle-harness" },
    releaseSetDigest: `sha256:${"d".repeat(64)}`,
    authority: { grantsRelease: false }
  }));
  const handoffDigest = `sha256:${crypto.createHash("sha256").update(fs.readFileSync(handoffPath)).digest("hex")}`;
  const common = [
    "--handoff", handoffPath,
    "--version", "4.0.0",
    "--target-id", "evopilot-v4.0.0-open-lifecycle-harness",
    "--candidate-run-id", "123",
    "--candidate-commit", commit,
    "--handoff-digest", handoffDigest,
    "--acceptance-digest", acceptanceDigest,
    "--release-authorization-digest", releaseAuthorizationDigest,
    "--repository", "owner/evopilot",
    "--workflow", ".github/workflows/release-artifacts.yml"
  ];
  execFileSync(process.execPath, ["scripts/release-promotion-record.mjs", "build", "--output", recordPath, ...common, "--promotion-run-id", "456", "--promotion-run-attempt", "1"]);
  const output = execFileSync(process.execPath, ["scripts/release-promotion-record.mjs", "verify", "--record", recordPath, ...common], { encoding: "utf8" });
  assert.match(output, /"status":"PASS"/);
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  assert.equal(record.acceptanceDigest, acceptanceDigest);
  assert.equal(record.releaseAuthorizationDigest, releaseAuthorizationDigest);
  assert.equal(record.authority.grantsProductLifecycleAuthority, false);
});
