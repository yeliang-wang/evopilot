#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
export function verifyRecoveryPlan(plan, target, roadmapBytes) {
  assert.equal(plan.schema, "evopilot-expert-recovery-acceptance-plan/v1");
  assert.equal(plan.targetId, target.id);
  assert.equal(plan.targetRevision, target.revision);
  assert.equal(plan.targetAuthorizationDigest, target.approvals.target.authorizationDigest);
  assert.equal(plan.roadmapDigest, `sha256:${crypto.createHash("sha256").update(roadmapBytes).digest("hex")}`);
  assert.equal(plan.expertVersion, "2.2.1");
  assert.equal(plan.runtimeVersion, "6.2.0");
  assert.equal(plan.inherited.length, 365);
  assert.equal(new Set(plan.inherited.map(x => x.id)).size, 365);
  assert.deepEqual(new Set(plan.inherited.map(x => x.id)), new Set(target.inheritedAcceptance.map(x => x.id)));
  assert.equal(plan.inherited.filter(x => x.id.startsWith("V62-CROSS")).length, 10);
  assert.deepEqual(plan.realCases.map(x => x.id), ["RC01", "RC02", "RC03", "RC04", "RC05"]);
  for (const item of plan.inherited) {
    const original = target.inheritedAcceptance.find(x => x.id === item.id);
    const lineage = target.acceptanceLineage.find(x => x.id === item.id);
    assert.equal(item.origin, original.origin);
    assert.equal(item.criterion, original.criterion);
    assert.equal(item.requiredEvidence, original.requiredEvidence);
    assert.equal(item.definitionDigest, lineage.criterionDigest);
    assert.equal(item.sourceEvidence, lineage.evidenceRef);
    assert.ok(item.cases.length && item.cases.every(id => plan.realCases.some(c => c.id === id)));
    const fresh = item.id.includes("evolution-expert") || item.id.startsWith("V62-CROSS");
    assert.equal(item.method, fresh ? "FRESH_SUCCESSOR_VALIDATION" : "ITEM_LEVEL_EXACT_UNCHANGED_RUNTIME_PROOF_OR_FRESH_RERUN");
    assert.equal(item.status, "PENDING", "plan must never project historical PASS into successor evidence");
    assert.deepEqual(item.evidenceRefs, []);
  }
  assert.deepEqual(new Set(plan.currentCriteria.map(x => x.id)), new Set(target.acceptance.map(x => x.id)));
  for (const item of plan.currentCriteria) {
    assert.equal(item.status, "PENDING");
    assert.deepEqual(item.cases, target.realCaseCoverage.filter(c => c.coversAcceptanceIds.includes(item.id)).map(c => c.id));
  }
  assert.equal(plan.candidateBinding, null, "a separate append-only Candidate binding is required before execution");
  assert.equal(plan.status, "PREPARED_NOT_EXECUTION_AUTHORIZED");
  assert.equal(plan.candidatePolicy.requiresSeparateExactCommitCandidateAndCampaignAuthority, true);
  assert.equal(plan.publicRelease.authorized, false);
  assert.equal(plan.closure.activeSoakSeconds, 5400);
  assert.equal(plan.closure.noRegressionRequired, true);
  return { status: "PASS", scope: "PLAN_STRUCTURE_ONLY_NOT_ACCEPTANCE", current: 10, inherited: 355, cross: 10, realCases: 5, productAcceptancePassed: false };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = JSON.parse(fs.readFileSync(path.join(root, "governance/acceptance/expert-2.2.1-recovery-plan.json")));
  console.log(JSON.stringify(verifyRecoveryPlan(plan, JSON.parse(fs.readFileSync(path.join(root, plan.target))), fs.readFileSync(path.join(root, "governance/roadmap.yaml"))), null, 2));
}
