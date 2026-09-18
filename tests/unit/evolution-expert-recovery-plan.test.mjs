import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { verifyRecoveryPlan } from "../../scripts/verify-expert-recovery-plan.mjs";
const plan = JSON.parse(fs.readFileSync("governance/acceptance/expert-2.2.1-recovery-plan.json"));
const target = JSON.parse(fs.readFileSync(plan.target));
const roadmap = fs.readFileSync("governance/roadmap.yaml");
test("recovery maps every historical/current item without carrying PASS or granting execution", () => {
  assert.equal(verifyRecoveryPlan(plan, target, roadmap).status, "PASS");
});
test("recovery rejects missing, duplicated, stale, weakened or already-passed lineage", () => {
  for (const change of [p => p.inherited.pop(), p => { p.inherited[1] = p.inherited[0]; }, p => { p.inherited[0].method = "REUSE"; }, p => { p.inherited[0].status = "PASSED"; }, p => { p.inherited[0].definitionDigest = "changed"; }, p => { p.currentCriteria[0].cases = []; }, p => { p.publicRelease.authorized = true; }]) {
    const invalid = structuredClone(plan); change(invalid);
    assert.throws(() => verifyRecoveryPlan(invalid, target, roadmap));
  }
});
