import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateCompletion,
  canonicalDigest,
  createApprovedSchemeInventory,
  createCompletionTrace,
  createCriterionEvidence
} from "../../packages/core/dist/index.js";

const d = (value) => canonicalDigest(value);
const targetId = "runtime-5.0.1";

function fixture() {
  const inventory = createApprovedSchemeInventory({
    campaignId: "v5-completion",
    requirements: [{ id: "REQ01", sourceRef: "roadmap#v5", sourceDigest: d("roadmap"), statement: "Bind every Goal Target Loop.", kind: "ROADMAP" }]
  });
  const trace = createCompletionTrace(inventory, [{
    requirementId: "REQ01",
    targetIds: [targetId],
    acceptanceIds: ["FUNC05"],
    deliverables: ["packages/core"],
    validatorIds: ["validate-runtime-FUNC05"],
    terminalE2EIds: ["E2E13"]
  }]);
  const validators = [{ id: "validate-runtime-FUNC05", targetId, criterionId: "FUNC05", criterion: "Bind every Goal Target Loop.", requiredEvidence: "exact binding evidence", requiredHosts: ["Codex"], prohibitedEffects: ["publication"], command: "node validator --criterion FUNC05", evidenceClass: "MACHINE", candidateRequired: true, independent: true }];
  const pair = { runtimeDigest: d("runtime"), expertDigest: d("expert"), installedRuntimeDigest: d("runtime"), installedExpertDigest: d("expert"), verified: true };
  const evidence = [createCriterionEvidence({ id: "evidence-FUNC05", targetId, criterionId: "FUNC05", validatorId: "validate-runtime-FUNC05", status: "PASS", evidenceClass: "MACHINE", evidenceRefs: ["evidence://FUNC05"], evidenceDigest: d("FUNC05 evidence"), candidateDigests: { runtime: pair.runtimeDigest, expert: pair.expertDigest }, generic: false, recordedAt: "2026-09-09T00:00:00Z" })];
  return { inventory, trace, validators, pair, evidence };
}

test("completion closes only with criterion-specific exact-candidate evidence", () => {
  const value = fixture();
  const report = aggregateCompletion({ inventory: value.inventory, trace: value.trace, requiredCriteria: [{ targetId, criterionId: "FUNC05" }], validators: value.validators, evidence: value.evidence, candidatePair: value.pair, impactClosure: "PASS", noRegression: "PASS" });
  assert.equal(report.status, "COMPLETE");
  assert.deepEqual(report.counts, { total: 1, passed: 1, failed: 0, pending: 0, stale: 0, warning: 0, generic: 0, unmapped: 0 });
});

test("completion accepts only digest-bound designated-human evidence for a designated Host criterion", () => {
  const value = fixture();
  const validators = [{ ...value.validators[0], evidenceClass: "DESIGNATED_HUMAN", requiredHosts: ["WorkBuddy"] }];
  const evidence = [createCriterionEvidence({ id: "workbuddy-FUNC05", targetId, criterionId: "FUNC05", validatorId: validators[0].id, status: "PASS", evidenceClass: "DESIGNATED_HUMAN", evidenceRefs: ["runbook://workbuddy/FUNC05"], evidenceDigest: d("workbuddy evidence"), candidateDigests: { runtime: value.pair.runtimeDigest, expert: value.pair.expertDigest }, designatedHuman: { host: "WorkBuddy", actor: "designated-operator", authorityRef: "conversation://workbuddy-range-complete", declarationDigest: d("workbuddy declaration") }, generic: false, recordedAt: "2026-09-09T00:00:00Z" })];
  const report = aggregateCompletion({ inventory: value.inventory, trace: value.trace, requiredCriteria: [{ targetId, criterionId: "FUNC05" }], validators, evidence, candidatePair: value.pair, impactClosure: "PASS", noRegression: "PASS" });
  assert.equal(report.status, "COMPLETE");
  assert.throws(() => createCriterionEvidence({ ...evidence[0], designatedHuman: undefined, recordDigest: undefined }), /DESIGNATED_HUMAN_DECLARATION_REQUIRED/);
});

test("completion rejects all incomplete evidence classes and human substitution", () => {
  for (const status of ["FAIL", "PENDING", "STALE", "WARNING"]) {
    const value = fixture();
    const report = aggregateCompletion({ inventory: value.inventory, trace: value.trace, requiredCriteria: [{ targetId, criterionId: "FUNC05" }], validators: value.validators, evidence: [{ ...value.evidence[0], status }], candidatePair: value.pair, impactClosure: "PASS", noRegression: "PASS" });
    assert.equal(report.status, "INCOMPLETE", status);
    assert.equal(report.counts.passed, 0, status);
  }
  const value = fixture();
  const generic = aggregateCompletion({ inventory: value.inventory, trace: value.trace, requiredCriteria: [{ targetId, criterionId: "FUNC05" }], validators: value.validators, evidence: [{ ...value.evidence[0], generic: true }], candidatePair: value.pair, impactClosure: "PASS", noRegression: "PASS" });
  assert.equal(generic.status, "INCOMPLETE");
  assert.equal(generic.counts.generic, 1);
  const human = aggregateCompletion({ inventory: value.inventory, trace: value.trace, requiredCriteria: [{ targetId, criterionId: "FUNC05" }], validators: value.validators, evidence: [{ ...value.evidence[0], evidenceClass: "DESIGNATED_HUMAN" }], candidatePair: value.pair, impactClosure: "PASS", noRegression: "PASS" });
  assert.equal(human.status, "INCOMPLETE");
  assert.match(human.failures.join(" "), /EVIDENCE_CLASS_MISMATCH/);
});

test("completion rejects missing mappings, duplicate evidence, and wrong Candidate", () => {
  const value = fixture();
  assert.throws(() => createCompletionTrace(value.inventory, []), /UNMAPPED_REQUIREMENTS/);
  assert.throws(() => createCompletionTrace(value.inventory, [{ requirementId: "REQ01", targetIds: [], acceptanceIds: [], deliverables: [], validatorIds: [], terminalE2EIds: [] }]), /SILENT_EXCLUSION/);
  const duplicate = aggregateCompletion({ inventory: value.inventory, trace: value.trace, requiredCriteria: [{ targetId, criterionId: "FUNC05" }], validators: value.validators, evidence: [value.evidence[0], { ...value.evidence[0], id: "duplicate" }], candidatePair: value.pair, impactClosure: "PASS", noRegression: "PASS" });
  assert.equal(duplicate.status, "INCOMPLETE");
  assert.equal(duplicate.counts.unmapped, 1);
  const wrong = aggregateCompletion({ inventory: value.inventory, trace: value.trace, requiredCriteria: [{ targetId, criterionId: "FUNC05" }], validators: value.validators, evidence: value.evidence, candidatePair: { ...value.pair, installedRuntimeDigest: d("other") }, impactClosure: "PASS", noRegression: "PASS" });
  assert.equal(wrong.status, "INCOMPLETE");
  assert.equal(wrong.counts.stale, 1);
});
