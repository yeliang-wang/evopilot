import { createHash } from "node:crypto";

export const APPROVED_SCHEME_INVENTORY_SCHEMA = "evopilot-approved-scheme-inventory/v1" as const;
export const COMPLETION_TRACE_SCHEMA = "evopilot-completion-trace/v1" as const;
export const ACCEPTANCE_EVIDENCE_SCHEMA = "evopilot-criterion-evidence/v1" as const;
export const COMPLETION_REPORT_SCHEMA = "evopilot-approved-scheme-completion-report/v1" as const;

export type CriterionEvidenceStatus = "PASS" | "FAIL" | "PENDING" | "STALE" | "WARNING";

export interface ApprovedSchemeRequirement {
  id: string;
  sourceRef: string;
  sourceDigest: string;
  statement: string;
  kind: "ROADMAP" | "TARGET" | "USER_CORRECTION" | "AUDITED_GAP";
}

export interface ApprovedSchemeInventory {
  schema: typeof APPROVED_SCHEME_INVENTORY_SCHEMA;
  campaignId: string;
  requirements: ApprovedSchemeRequirement[];
  digest: string;
}

export interface CompletionTraceLink {
  requirementId: string;
  targetIds: string[];
  acceptanceIds: string[];
  deliverables: string[];
  validatorIds: string[];
  terminalE2EIds: string[];
  exclusion?: { reason: string; authorityRef: string };
}

export interface CompletionTrace {
  schema: typeof COMPLETION_TRACE_SCHEMA;
  inventoryDigest: string;
  links: CompletionTraceLink[];
  digest: string;
}

export interface CriterionValidator {
  id: string;
  targetId: string;
  criterionId: string;
  criterion: string;
  requiredEvidence: string;
  requiredHosts: string[];
  prohibitedEffects: string[];
  command: string;
  evidenceClass: "MACHINE" | "DESIGNATED_HUMAN";
  candidateRequired: boolean;
  independent: true;
}

export interface DesignatedHumanEvidence {
  host: string;
  actor: string;
  authorityRef: string;
  declarationDigest: string;
}

export interface CriterionEvidence {
  schema: typeof ACCEPTANCE_EVIDENCE_SCHEMA;
  id: string;
  targetId: string;
  criterionId: string;
  validatorId: string;
  status: CriterionEvidenceStatus;
  evidenceClass: "MACHINE" | "DESIGNATED_HUMAN";
  evidenceRefs: string[];
  evidenceDigest?: string;
  candidateDigests?: { runtime: string; expert?: string };
  designatedHuman?: DesignatedHumanEvidence;
  generic: boolean;
  recordedAt: string;
  recordDigest: string;
}

export interface CompletionCandidatePair {
  runtimeDigest?: string;
  expertDigest?: string;
  installedRuntimeDigest?: string;
  installedExpertDigest?: string;
  verified: boolean;
}

export interface CompletionReport {
  schema: typeof COMPLETION_REPORT_SCHEMA;
  status: "COMPLETE" | "INCOMPLETE";
  inventoryDigest: string;
  traceDigest: string;
  counts: {
    total: number;
    passed: number;
    failed: number;
    pending: number;
    stale: number;
    warning: number;
    generic: number;
    unmapped: number;
  };
  candidatePairVerified: boolean;
  impactClosure: "PASS" | "FAIL" | "PENDING";
  noRegression: "PASS" | "FAIL" | "PENDING";
  failures: string[];
  criterionResults: Array<{ targetId: string; criterionId: string; status: CriterionEvidenceStatus | "UNMAPPED"; evidenceId?: string }>;
  digest: string;
}

const DIGEST = /^sha256:[a-f0-9]{64}$/;

export function createApprovedSchemeInventory(input: Omit<ApprovedSchemeInventory, "schema" | "digest">): ApprovedSchemeInventory {
  requireText(input.campaignId, "campaignId");
  const requirements = [...input.requirements].sort((left, right) => left.id.localeCompare(right.id));
  assertUnique(requirements.map((item) => item.id), "REQUIREMENT_ID");
  for (const requirement of requirements) {
    requireText(requirement.id, "requirement.id");
    requireText(requirement.sourceRef, "requirement.sourceRef");
    requireText(requirement.statement, "requirement.statement");
    assertDigest(requirement.sourceDigest, "requirement.sourceDigest");
  }
  return withDigest({ schema: APPROVED_SCHEME_INVENTORY_SCHEMA, campaignId: input.campaignId, requirements });
}

export function createCompletionTrace(inventory: ApprovedSchemeInventory, links: CompletionTraceLink[]): CompletionTrace {
  assertDigest(inventory.digest, "inventory.digest");
  if (inventory.digest !== digestOf({ schema: inventory.schema, campaignId: inventory.campaignId, requirements: inventory.requirements })) throw new Error("COMPLETION_INVENTORY_DIGEST_MISMATCH");
  const normalized = links.map((link) => ({
    ...link,
    targetIds: unique(link.targetIds),
    acceptanceIds: unique(link.acceptanceIds),
    deliverables: unique(link.deliverables),
    validatorIds: unique(link.validatorIds),
    terminalE2EIds: unique(link.terminalE2EIds)
  })).sort((left, right) => left.requirementId.localeCompare(right.requirementId));
  assertUnique(normalized.map((item) => item.requirementId), "TRACE_REQUIREMENT_ID");
  const known = new Set(inventory.requirements.map((item) => item.id));
  for (const link of normalized) {
    if (!known.has(link.requirementId)) throw new Error(`COMPLETION_TRACE_UNKNOWN_REQUIREMENT: ${link.requirementId}`);
    const mapped = link.targetIds.length > 0 && link.acceptanceIds.length > 0 && link.deliverables.length > 0 && link.validatorIds.length > 0;
    const excluded = Boolean(link.exclusion?.reason.trim() && link.exclusion?.authorityRef.trim());
    if (!mapped && !excluded) throw new Error(`COMPLETION_TRACE_SILENT_EXCLUSION: ${link.requirementId}`);
  }
  const linked = new Set(normalized.map((item) => item.requirementId));
  const missing = inventory.requirements.filter((item) => !linked.has(item.id));
  if (missing.length) throw new Error(`COMPLETION_TRACE_UNMAPPED_REQUIREMENTS: ${missing.map((item) => item.id).join(",")}`);
  return withDigest({ schema: COMPLETION_TRACE_SCHEMA, inventoryDigest: inventory.digest, links: normalized });
}

export function createCriterionEvidence(input: Omit<CriterionEvidence, "schema" | "recordDigest"> & { recordDigest?: string }): CriterionEvidence {
  requireText(input.id, "evidence.id");
  requireText(input.targetId, "evidence.targetId");
  requireText(input.criterionId, "evidence.criterionId");
  requireText(input.validatorId, "evidence.validatorId");
  if (!["PASS", "FAIL", "PENDING", "STALE", "WARNING"].includes(input.status)) throw new Error("COMPLETION_EVIDENCE_STATUS_INVALID");
  if (!["MACHINE", "DESIGNATED_HUMAN"].includes(input.evidenceClass)) throw new Error("COMPLETION_EVIDENCE_CLASS_INVALID");
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0 || input.evidenceRefs.some((item) => !item.trim())) throw new Error("COMPLETION_EVIDENCE_REFS_REQUIRED");
  if (!input.evidenceDigest) throw new Error("COMPLETION_EVIDENCE_DIGEST_REQUIRED");
  assertDigest(input.evidenceDigest, "evidence.evidenceDigest");
  if (!input.candidateDigests?.runtime || !input.candidateDigests.expert) throw new Error("COMPLETION_EVIDENCE_CANDIDATE_PAIR_REQUIRED");
  assertDigest(input.candidateDigests.runtime, "evidence.candidateDigests.runtime");
  assertDigest(input.candidateDigests.expert, "evidence.candidateDigests.expert");
  requireText(input.recordedAt, "evidence.recordedAt");
  if (Number.isNaN(Date.parse(input.recordedAt))) throw new Error("COMPLETION_EVIDENCE_RECORDED_AT_INVALID");
  validateDesignatedHuman(input.evidenceClass, input.designatedHuman);
  const material = {
    schema: ACCEPTANCE_EVIDENCE_SCHEMA,
    id: input.id,
    targetId: input.targetId,
    criterionId: input.criterionId,
    validatorId: input.validatorId,
    status: input.status,
    evidenceClass: input.evidenceClass,
    evidenceRefs: unique(input.evidenceRefs),
    evidenceDigest: input.evidenceDigest,
    ...(input.candidateDigests ? { candidateDigests: input.candidateDigests } : {}),
    ...(input.designatedHuman ? { designatedHuman: input.designatedHuman } : {}),
    generic: input.generic,
    recordedAt: input.recordedAt
  };
  const recordDigest = digestOf(material);
  if (input.recordDigest && input.recordDigest !== recordDigest) throw new Error("COMPLETION_EVIDENCE_RECORD_DIGEST_MISMATCH");
  return { ...material, recordDigest };
}

export function aggregateCompletion(input: {
  inventory: ApprovedSchemeInventory;
  trace: CompletionTrace;
  requiredCriteria: Array<{ targetId: string; criterionId: string }>;
  validators: CriterionValidator[];
  evidence: CriterionEvidence[];
  candidatePair: CompletionCandidatePair;
  impactClosure: "PASS" | "FAIL" | "PENDING";
  noRegression: "PASS" | "FAIL" | "PENDING";
}): CompletionReport {
  const failures: string[] = [];
  let traceValid = true;
  try {
    if (input.trace.inventoryDigest !== input.inventory.digest) throw new Error("COMPLETION_TRACE_INVENTORY_MISMATCH");
    if (input.trace.digest !== digestOf({ schema: input.trace.schema, inventoryDigest: input.trace.inventoryDigest, links: input.trace.links })) throw new Error("COMPLETION_TRACE_DIGEST_MISMATCH");
    createCompletionTrace(input.inventory, input.trace.links);
  } catch (error) {
    traceValid = false;
    failures.push(error instanceof Error ? error.message : String(error));
  }

  const criterionKeys = input.requiredCriteria.map((item) => criterionKey(item.targetId, item.criterionId));
  try { assertUnique(criterionKeys, "REQUIRED_CRITERION"); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  const validatorByCriterion = new Map<string, CriterionValidator[]>();
  const invalidValidatorIds = new Set<string>();
  for (const validator of input.validators) {
    const key = criterionKey(validator.targetId, validator.criterionId);
    validatorByCriterion.set(key, [...(validatorByCriterion.get(key) ?? []), validator]);
    if (validator.independent !== true || !validator.command.trim() || !validator.criterion?.trim() || !validator.requiredEvidence?.trim() || !Array.isArray(validator.requiredHosts) || !Array.isArray(validator.prohibitedEffects)) {
      invalidValidatorIds.add(validator.id);
      failures.push(`COMPLETION_VALIDATOR_CONTRACT_INVALID: ${validator.id}`);
    }
  }
  try { assertUnique(input.validators.map((item) => item.id), "VALIDATOR_ID"); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  const commandCounts = new Map<string, number>();
  for (const validator of input.validators) commandCounts.set(validator.command, (commandCounts.get(validator.command) ?? 0) + 1);
  for (const validator of input.validators) {
    if ((commandCounts.get(validator.command) ?? 0) > 1) {
      invalidValidatorIds.add(validator.id);
      failures.push(`COMPLETION_DUPLICATE_VALIDATOR_COMMAND: ${validator.id}`);
    }
  }

  let failed = 0;
  let pending = 0;
  let stale = 0;
  let warning = 0;
  let generic = 0;
  let unmapped = 0;
  let passed = 0;
  const criterionResults: CompletionReport["criterionResults"] = [];
  for (const criterion of input.requiredCriteria) {
    const key = criterionKey(criterion.targetId, criterion.criterionId);
    const validators = validatorByCriterion.get(key) ?? [];
    if (validators.length !== 1 || (validators[0] && invalidValidatorIds.has(validators[0].id))) {
      unmapped += 1;
      criterionResults.push({ targetId: criterion.targetId, criterionId: criterion.criterionId, status: "UNMAPPED" });
      failures.push(validators.length !== 1 ? `COMPLETION_CRITERION_VALIDATOR_COUNT: ${key}=${validators.length}` : `COMPLETION_CRITERION_VALIDATOR_INVALID: ${key}`);
      continue;
    }
    const validator = validators[0];
    const records = input.evidence.filter((item) => item.targetId === criterion.targetId && item.criterionId === criterion.criterionId && item.validatorId === validator.id);
    if (records.length === 0) {
      pending += 1;
      criterionResults.push({ targetId: criterion.targetId, criterionId: criterion.criterionId, status: "PENDING" });
      failures.push(`COMPLETION_CRITERION_EVIDENCE_MISSING: ${key}`);
      continue;
    }
    if (records.length > 1) {
      unmapped += 1;
      criterionResults.push({ targetId: criterion.targetId, criterionId: criterion.criterionId, status: "UNMAPPED" });
      failures.push(`COMPLETION_CRITERION_EVIDENCE_COUNT: ${key}=${records.length}`);
      continue;
    }
    const record = records[0];
    let status = record.status;
    try {
      createCriterionEvidence(record);
    } catch (error) {
      status = "PENDING";
      failures.push(error instanceof Error ? error.message : String(error));
    }
    if (record.generic || !Array.isArray(record.evidenceRefs) || record.evidenceRefs.length === 0 || !record.evidenceDigest || !DIGEST.test(record.evidenceDigest)) {
      generic += 1;
      status = "PENDING";
      failures.push(`COMPLETION_GENERIC_OR_EMPTY_EVIDENCE: ${key}`);
    }
    if (record.evidenceClass !== validator.evidenceClass) {
      status = "PENDING";
      failures.push(`COMPLETION_EVIDENCE_CLASS_MISMATCH: ${key}`);
    }
    if (record.evidenceClass === "DESIGNATED_HUMAN" && validator.evidenceClass !== "DESIGNATED_HUMAN") {
      status = "PENDING";
      failures.push(`COMPLETION_HUMAN_SUBSTITUTION_FORBIDDEN: ${key}`);
    }
    if (validator.candidateRequired && !candidateEvidenceMatches(record, input.candidatePair)) {
      status = "STALE";
      failures.push(`COMPLETION_WRONG_CANDIDATE: ${key}`);
    }
    if (status === "PASS") passed += 1;
    else if (status === "FAIL") failed += 1;
    else if (status === "STALE") stale += 1;
    else if (status === "WARNING") warning += 1;
    else pending += 1;
    criterionResults.push({ targetId: criterion.targetId, criterionId: criterion.criterionId, status, evidenceId: record.id });
  }

  const candidatePairVerified = exactCandidatePair(input.candidatePair);
  if (!candidatePairVerified) failures.push("COMPLETION_EXACT_CANDIDATE_PAIR_NOT_VERIFIED");
  if (input.impactClosure !== "PASS") failures.push(`COMPLETION_IMPACT_CLOSURE_${input.impactClosure}`);
  if (input.noRegression !== "PASS") failures.push(`COMPLETION_NO_REGRESSION_${input.noRegression}`);
  if (!traceValid) unmapped += input.inventory.requirements.length;
  const total = input.requiredCriteria.length;
  const status = traceValid && total === passed && failed === 0 && pending === 0 && stale === 0 && warning === 0 && generic === 0 && unmapped === 0 && candidatePairVerified && input.impactClosure === "PASS" && input.noRegression === "PASS" ? "COMPLETE" as const : "INCOMPLETE" as const;
  return withDigest({
    schema: COMPLETION_REPORT_SCHEMA,
    status,
    inventoryDigest: input.inventory.digest,
    traceDigest: input.trace.digest,
    counts: { total, passed, failed, pending, stale, warning, generic, unmapped },
    candidatePairVerified,
    impactClosure: input.impactClosure,
    noRegression: input.noRegression,
    failures: unique(failures),
    criterionResults
  });
}

function exactCandidatePair(pair: CompletionCandidatePair): boolean {
  if (!pair.verified || !pair.runtimeDigest || !pair.installedRuntimeDigest || pair.runtimeDigest !== pair.installedRuntimeDigest) return false;
  if (pair.expertDigest || pair.installedExpertDigest) return Boolean(pair.expertDigest && pair.installedExpertDigest && pair.expertDigest === pair.installedExpertDigest);
  return true;
}

function candidateEvidenceMatches(record: CriterionEvidence, pair: CompletionCandidatePair): boolean {
  if (!exactCandidatePair(pair) || record.candidateDigests?.runtime !== pair.runtimeDigest) return false;
  return !pair.expertDigest || record.candidateDigests?.expert === pair.expertDigest;
}

function validateDesignatedHuman(evidenceClass: CriterionEvidence["evidenceClass"], value: DesignatedHumanEvidence | undefined): void {
  if (evidenceClass === "MACHINE") {
    if (value) throw new Error("COMPLETION_MACHINE_EVIDENCE_HAS_HUMAN_DECLARATION");
    return;
  }
  if (!value) throw new Error("COMPLETION_DESIGNATED_HUMAN_DECLARATION_REQUIRED");
  requireText(value.host, "evidence.designatedHuman.host");
  requireText(value.actor, "evidence.designatedHuman.actor");
  requireText(value.authorityRef, "evidence.designatedHuman.authorityRef");
  assertDigest(value.declarationDigest, "evidence.designatedHuman.declarationDigest");
}

function criterionKey(targetId: string, criterionId: string): string {
  return `${targetId}#${criterionId}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort();
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  const duplicate = values.find((item) => seen.has(item) || !seen.add(item));
  if (duplicate) throw new Error(`COMPLETION_DUPLICATE_${label}: ${duplicate}`);
}

function assertDigest(value: string, field: string): void {
  if (!DIGEST.test(value)) throw new Error(`COMPLETION_DIGEST_INVALID: ${field}`);
}

function requireText(value: string, field: string): void {
  if (!value?.trim()) throw new Error(`COMPLETION_FIELD_REQUIRED: ${field}`);
}

function withDigest<T extends Record<string, unknown>>(value: T): T & { digest: string } {
  return { ...value, digest: digestOf(value) };
}

function digestOf(value: unknown): string {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
