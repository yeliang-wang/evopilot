import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

test("v6.1 completion contract binds all 305 current and inherited criteria without exclusions", () => {
  execFileSync(process.execPath, ["scripts/build-v61-completion-contract.mjs", "--check"], { cwd: root, stdio: "pipe" });
  const contract = JSON.parse(fs.readFileSync(path.join(root, "governance/acceptance/v61-completion-contract.json"), "utf8"));
  assert.deepEqual(contract.counts, { runtimeCurrent: 17, runtimeE2E: 13, expertCurrent: 12, expertE2E: 10, inheritedPublishedV6: 253, total: 305 });
  assert.equal(contract.requiredCriteria.length, 305);
  assert.equal(contract.validators.length, 305);
  assert.equal(contract.publishedBaseline.disposition, "INHERIT_ALL_NO_EXCLUSIONS");
  assert.equal(new Set(contract.requiredCriteria.map((item) => `${item.targetId}#${item.criterionId}`)).size, 305);
});

test("v6.1 completion remains incomplete without exact installed Candidate evidence", () => {
  const output = execFileSync(process.execPath, ["scripts/verify-v61-completion.mjs", "--json"], { cwd: root, encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.status, "INCOMPLETE");
  assert.equal(report.counts.total, 305);
  assert.equal(report.counts.pending, 305);
  assert.equal(report.candidatePairVerified, false);
  assert.equal(report.crossAcceptance, "PENDING");
  assert.equal(report.legacySuiteInvocationCount, 0);
});
