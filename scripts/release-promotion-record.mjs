#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const handoff = readJson(path.resolve(args.handoff));

assert.match(args.candidateCommit, /^[0-9a-f]{40}$/);
assert.match(args.handoffDigest, /^sha256:[0-9a-f]{64}$/);
assert.match(args.acceptanceDigest, /^sha256:[0-9a-f]{64}$/);
assert.match(args.releaseAuthorizationDigest, /^sha256:[0-9a-f]{64}$/);
assert.equal(fileDigest(path.resolve(args.handoff)), args.handoffDigest, "Candidate handoff digest mismatch");
assert.equal(handoff.releaseBuild?.version, args.version, "Candidate version mismatch");
assert.equal(handoff.releaseBuild?.source?.commit, args.candidateCommit, "Candidate commit mismatch");
assert.equal(String(handoff.releaseBuild?.source?.runId), String(args.candidateRunId), "Candidate run mismatch");
assert.equal(handoff.target?.id, args.targetId, "Candidate Target mismatch");
assert.equal(handoff.authority?.grantsRelease, false, "Candidate handoff must not grant release authority");

const expected = {
  schema: "evopilot-release-promotion-record/v1",
  project: "evopilot",
  version: args.version,
  targetId: args.targetId,
  candidate: {
    runId: String(args.candidateRunId),
    commit: args.candidateCommit,
    handoffDigest: args.handoffDigest,
    releaseSetDigest: handoff.releaseSetDigest
  },
  acceptanceDigest: args.acceptanceDigest,
  releaseAuthorizationDigest: args.releaseAuthorizationDigest
};

if (args.command === "build") {
  const record = {
    ...expected,
    promotion: {
      repository: args.repository,
      workflow: args.workflow,
      runId: String(args.promotionRunId),
      runAttempt: Number(args.promotionRunAttempt),
      generatedAt: new Date().toISOString()
    },
    authority: {
      source: "SEPARATE_RELEASE_BINDING_AND_GITHUB_RELEASE_ENVIRONMENT",
      grantsProductLifecycleAuthority: false
    }
  };
  fs.writeFileSync(path.resolve(args.output), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ status: "READY", output: path.resolve(args.output), digest: fileDigest(path.resolve(args.output)) }));
} else if (args.command === "verify") {
  const actual = readJson(path.resolve(args.record));
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, `promotion record ${key} mismatch`);
  assert.equal(actual.promotion?.repository, args.repository);
  assert.equal(actual.promotion?.workflow, args.workflow);
  assert.equal(actual.authority?.grantsProductLifecycleAuthority, false);
  console.log(JSON.stringify({ status: "PASS", releaseSetDigest: actual.candidate.releaseSetDigest }));
} else {
  throw new Error("Usage: release-promotion-record.mjs <build|verify> [options]");
}

function fileDigest(filePath) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseArgs(values) {
  const result = { command: values[0] };
  for (let index = 1; index < values.length; index += 1) {
    const key = values[index];
    if (!key.startsWith("--")) throw new Error(`Unknown argument: ${key}`);
    result[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = values[++index];
  }
  return result;
}
