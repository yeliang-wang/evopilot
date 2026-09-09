import fs from "node:fs";
import path from "node:path";
import { canonicalDigest, createCriterionEvidence } from "../packages/core/dist/index.js";

const option = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const targetId = option("--target");
const criterionId = option("--criterion");
if (!targetId || !criterionId) throw new Error("--target and --criterion are required");
const contract = JSON.parse(fs.readFileSync(path.resolve("governance/acceptance/v5-completion-contract.json"), "utf8"));
const validator = contract.validators.find((item) => item.targetId === targetId && item.criterionId === criterionId);
if (!validator) throw new Error(`CRITERION_VALIDATOR_NOT_FOUND: ${targetId}#${criterionId}`);
const evidencePath = option("--evidence");
if (evidencePath) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(evidencePath), "utf8"));
  if (raw.targetId !== targetId || raw.criterionId !== criterionId || raw.validatorId !== validator.id) throw new Error("CRITERION_EVIDENCE_BINDING_MISMATCH");
  if (raw.evidenceClass !== validator.evidenceClass) throw new Error("CRITERION_EVIDENCE_CLASS_MISMATCH");
  if (validator.candidateRequired && (!raw.candidateDigests?.runtime || !raw.candidateDigests?.expert)) throw new Error("CRITERION_EXACT_CANDIDATE_PAIR_REQUIRED");
  const evidence = createCriterionEvidence(raw);
  if (evidence.generic) throw new Error("CRITERION_GENERIC_EVIDENCE_FORBIDDEN");
  process.stdout.write(`${JSON.stringify({ schema: "evopilot-criterion-validation-result/v1", status: "VALIDATED", validatorDigest: canonicalDigest(validator), evidence }, null, 2)}\n`);
} else {
  const request = {
    schema: "evopilot-criterion-validation-request/v1",
    targetId,
    criterionId,
    validatorId: validator.id,
    criterion: validator.criterion,
    requiredEvidence: validator.requiredEvidence,
    requiredHosts: validator.requiredHosts,
    prohibitedEffects: validator.prohibitedEffects,
    evidenceClass: validator.evidenceClass,
    candidateRequired: validator.candidateRequired,
    evidenceTemplate: {
      schema: "evopilot-criterion-evidence/v1",
      id: `evidence-${criterionId}`,
      targetId,
      criterionId,
      validatorId: validator.id,
      status: "PASS|FAIL|PENDING|STALE|WARNING",
      evidenceClass: validator.evidenceClass,
      evidenceRefs: ["path-or-uri@sha256:digest"],
      evidenceDigest: "sha256:<evidence-bundle-digest>",
      candidateDigests: { runtime: "sha256:<runtime-candidate>", expert: "sha256:<expert-candidate>" },
      ...(validator.evidenceClass === "DESIGNATED_HUMAN" ? { designatedHuman: { host: "WorkBuddy", actor: "designated-human", authorityRef: "decision-ref", declarationDigest: "sha256:<declaration-digest>" } } : {}),
      generic: false,
      recordedAt: "RFC3339 timestamp"
    }
  };
  process.stdout.write(`${JSON.stringify({ ...request, status: "READY_FOR_CANDIDATE_EVIDENCE", validatorDigest: canonicalDigest(validator), requestDigest: canonicalDigest(request) }, null, 2)}\n`);
}
