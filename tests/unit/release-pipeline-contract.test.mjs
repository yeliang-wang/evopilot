import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateReleasePipeline, verifyReleasePipeline } from "../../scripts/verify-release-pipeline.mjs";

test("release pipeline forms one Candidate and promotes exact accepted bytes", () => {
  const result = verifyReleasePipeline();
  assert.equal(result.status, "PASS", JSON.stringify(result.failures));
  assert.equal(result.invariants.candidateBuiltOnce, true);
  assert.equal(result.invariants.acceptedBytesPromotedWithoutRebuild, true);
  assert.equal(result.invariants.productLifecycleBoundaryPreserved, true);
});

test("release pipeline contract rejects a GA rebuild", () => {
  const workflows = {
    candidate: fs.readFileSync(".github/workflows/release-candidate.yml", "utf8"),
    release: `${fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8")}\n      - run: npm ci\n      - run: npm run release:artifact\n`,
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("must not rebuild")));
});

test("release pipeline contract rejects product Lifecycle coupling", () => {
  const workflows = {
    candidate: `${fs.readFileSync(".github/workflows/release-candidate.yml", "utf8")}\n# LifecycleRun\n`,
    release: fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8"),
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("product Lifecycle")));
});
