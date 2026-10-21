import { nativeAssertJSON, nativeExact, nativeText, nativeDigest, nativeSha256, nativeRelativePath, validateNativeReference } from '../../v1/native.mjs';
import type { NativeScope, NativeReference, NativeJSON } from '../../v1/native.mjs';
import { feedbackScope, feedbackEqual, feedbackFail } from '../../feedback/v1/feedback.mjs';

export type ResponseOwner = 'runtime' | 'harness' | 'ontology' | 'workspace';
export interface ResponseEvidenceRef { owner: ResponseOwner; id: string; digest: string }
export interface ScopedResponseReference extends ResponseEvidenceRef { workspaceId: string; scope: NativeScope }
export interface RunbookPin { reference: NativeReference; path: string; digest: string }
/** Guidance contains no executable text. The independently reviewed collection supplies the action. */
export interface ResponseRunbook {
  schema: 'evopilot-response-runbook/v1'; id: string; version: string;
  serviceId: string; environment: string; sourceRevision: string;
  parameters: Record<string, NativeJSON>; prerequisites: ResponseEvidenceRef[];
  steps: { id: string; description: string; operation: 'isolated-collection' }[];
  stopConditions: string[]; effectScope: 'isolated-local';
  maxEvidenceAgeSeconds: number; expiresAt: number;
}
export interface ResolvedResponseRunbook {
  workspaceId: string; scope: NativeScope; pin: RunbookPin;
  runbook: ResponseRunbook; published: true; withdrawn: boolean;
}
export interface ResponseEvidence {
  workspaceId: string; scope: NativeScope; reference: ResponseEvidenceRef;
  status: 'PASS' | 'FAIL' | 'UNKNOWN'; observedAt: number;
}
export interface ResponseCause { kind: 'observed' | 'suspected' | 'confirmed'; description: string; evidence: ResponseEvidenceRef[] }
/** Reviewed preventive work; no executable command or execution permission. */
export interface ResponseFollowup {
  id: string; description: string; actor: string;
  status: 'PROPOSED' | 'TRACKED' | 'DONE'; evidence: ResponseEvidenceRef[];
}
export interface ResponseDisposition {
  kind: 'OPEN' | 'DEFERRED' | 'RISK_ACCEPTED' | 'VERIFIED_CLOSED';
  actor: string; rationale: string; expiresAt: number | null;
  humanEvidenceRef: string; reviewDigest: string; at: number;
}
export interface ResponseProblem {
  schema: 'evopilot-response-problem/v1'; id: string; workspaceId: string; scope: NativeScope;
  incidentId: string; findingIds: string[]; serviceId: string; environment: string;
  deploymentRevision: string; impact: string; causes: ResponseCause[]; followups: ResponseFollowup[];
  evidence: ResponseEvidenceRef[]; disposition: ResponseDisposition | null;
  history: ResponseDisposition[]; digest: string;
}
export interface ResponseRecovery {
  workspaceId: string; scope: NativeScope; reference: ResponseEvidenceRef;
  bindingId: string; incidentId: string; serviceId: string; environment: string;
  deploymentRevision: string; faultDigest: string; recoveryDigest: string;
  faultAt: number; recoveryAt: number; outcome: 'PASS' | 'FAIL' | 'UNKNOWN';
}
export interface ResponseExecutionVerification {
  workspaceId: string; scope: NativeScope; reference: ResponseEvidenceRef;
  problemId: string; problemDigest: string; serviceId: string; environment: string;
  deploymentRevision: string; status: 'VERIFIED' | 'UNVERIFIED';
  recovery: ResponseEvidenceRef | null; verifiedAt: number | null;
}
export interface ResponseEnvelope { operation: string; scope: NativeScope; input: Record<string, unknown>; requestId?: string; expectedRevision?: number }
export interface ResponseRuntimeProviders {
  resolveResponseRunbook?: (input: { scope: NativeScope; pin: RunbookPin }) => Promise<ResolvedResponseRunbook> | ResolvedResponseRunbook;
  readResponseProblem?: (input: { scope: NativeScope; id: string }) => Promise<ResponseProblem> | ResponseProblem;
  readResponseEvidence?: (input: { scope: NativeScope; reference: ResponseEvidenceRef }) => Promise<ResponseEvidence> | ResponseEvidence;
  readResponseRecovery?: (input: { scope: NativeScope; reference: ResponseEvidenceRef }) => Promise<ResponseRecovery> | ResponseRecovery;
  cancelResponseCollection?: (input: { scope: NativeScope; collectionId: string; claimId: string }) => Promise<{ requested: true; claimId: string }> | { requested: true; claimId: string };
}
export const responseEqual = feedbackEqual;
export function responseFail(code: string, message = code): never { return feedbackFail(code, message); }
export const RESPONSE_STOP_CONDITIONS = ['SOURCE_DRIFT', 'PREREQUISITE_FAILED', 'GUIDANCE_WITHDRAWN', 'EXPIRED', 'TIMEOUT', 'UNKNOWN'] as const;
export function responseReference(value: unknown): asserts value is ResponseEvidenceRef {
  nativeExact(value, ['owner', 'id', 'digest']);
  if (!['runtime', 'harness', 'ontology', 'workspace'].includes(value.owner as string)) responseFail('RESPONSE_REFERENCE');
  nativeText(value.id); nativeDigest(value.digest);
}
export function responseRunbookPin(value: unknown): asserts value is RunbookPin {
  nativeExact(value, ['reference', 'path', 'digest']);
  validateNativeReference(value.reference, { product: 'harness', visibility: (value.reference as NativeReference).visibility });
  nativeRelativePath(value.path); nativeDigest(value.digest);
}
export function validateResponseRunbook(value: unknown): asserts value is ResponseRunbook {
  nativeAssertJSON(value);
  nativeExact(value, ['schema', 'id', 'version', 'serviceId', 'environment', 'sourceRevision', 'parameters', 'prerequisites', 'steps', 'stopConditions', 'effectScope', 'maxEvidenceAgeSeconds', 'expiresAt']);
  if (value.schema !== 'evopilot-response-runbook/v1' || value.effectScope !== 'isolated-local') responseFail('RESPONSE_RUNBOOK');
  for (const key of ['id', 'serviceId', 'environment', 'sourceRevision'] as const) nativeText(value[key]);
  if (typeof value.version !== 'string' || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value.version)) responseFail('RESPONSE_RUNBOOK');
  if (!value.parameters || typeof value.parameters !== 'object' || Array.isArray(value.parameters) || Object.keys(value.parameters).length > 32) responseFail('RESPONSE_PARAMETERS');
  if (!Array.isArray(value.prerequisites) || !value.prerequisites.length || value.prerequisites.length > 32) responseFail('RESPONSE_PREREQUISITES');
  for (const ref of value.prerequisites) { responseReference(ref); if (ref.owner === 'workspace') responseFail('RESPONSE_PREREQUISITES', 'Governance file references are not operational prerequisites'); }
  if (new Set(value.prerequisites.map(ref => ref.owner + ':' + ref.id)).size !== value.prerequisites.length) responseFail('RESPONSE_PREREQUISITES');
  if (!Array.isArray(value.steps) || value.steps.length !== 1) responseFail('RESPONSE_RUNBOOK', 'The v0.6 profile supports one isolated action per reviewed plan');
  for (const step of value.steps) { nativeExact(step, ['id', 'description', 'operation']); nativeText(step.id); nativeText(step.description); if (step.operation !== 'isolated-collection') responseFail('RESPONSE_RUNBOOK'); }
  if (!Array.isArray(value.stopConditions) || !feedbackEqual([...value.stopConditions].sort(), [...RESPONSE_STOP_CONDITIONS].sort())) responseFail('RESPONSE_RUNBOOK', 'All fixed machine stop conditions are required');
  if (!Number.isSafeInteger(value.expiresAt) || (value.expiresAt as number) < 1 || !Number.isSafeInteger(value.maxEvidenceAgeSeconds) || (value.maxEvidenceAgeSeconds as number) < 1 || (value.maxEvidenceAgeSeconds as number) > 86400) responseFail('RESPONSE_RUNBOOK');
}
export function validateResolvedResponseRunbook(value: unknown): asserts value is ResolvedResponseRunbook {
  nativeAssertJSON(value); nativeExact(value, ['workspaceId', 'scope', 'pin', 'runbook', 'published', 'withdrawn']);
  nativeText(value.workspaceId); feedbackScope(value.scope); responseRunbookPin(value.pin); validateResponseRunbook(value.runbook);
  if (value.published !== true || typeof value.withdrawn !== 'boolean' || value.pin.digest !== nativeSha256(value.runbook)) responseFail('RESPONSE_RUNBOOK_INTEGRITY');
}
export function validateResponseEvidence(value: unknown): asserts value is ResponseEvidence {
  nativeAssertJSON(value); nativeExact(value, ['workspaceId', 'scope', 'reference', 'status', 'observedAt']);
  nativeText(value.workspaceId); feedbackScope(value.scope); responseReference(value.reference);
  if (!['PASS', 'FAIL', 'UNKNOWN'].includes(value.status as string) || !Number.isSafeInteger(value.observedAt) || (value.observedAt as number) < 1) responseFail('RESPONSE_EVIDENCE');
}
export function validateResponseFollowup(value: unknown): asserts value is ResponseFollowup {
  nativeAssertJSON(value); nativeExact(value, ['id', 'description', 'actor', 'status', 'evidence']);
  for (const key of ['id', 'description', 'actor'] as const) nativeText(value[key]);
  if (!['PROPOSED', 'TRACKED', 'DONE'].includes(value.status as string) || !Array.isArray(value.evidence) || value.evidence.length > 32) responseFail('RESPONSE_FOLLOWUP');
  for (const ref of value.evidence) responseReference(ref);
  if (new Set(value.evidence.map(ref => ref.owner + ':' + ref.id)).size !== value.evidence.length) responseFail('RESPONSE_FOLLOWUP_EVIDENCE');
  if (value.status === 'DONE' && (!value.evidence.length || value.evidence.some(ref => ref.owner === 'workspace'))) responseFail('RESPONSE_FOLLOWUP_EVIDENCE', 'Completion requires owning product evidence, not governance prose');
}
export function validateResponseProblem(value: unknown): asserts value is ResponseProblem {
  nativeAssertJSON(value); nativeExact(value, ['schema', 'id', 'workspaceId', 'scope', 'incidentId', 'findingIds', 'serviceId', 'environment', 'deploymentRevision', 'impact', 'causes', 'followups', 'evidence', 'disposition', 'history', 'digest']);
  if (value.schema !== 'evopilot-response-problem/v1') responseFail('RESPONSE_PROBLEM');
  for (const key of ['id', 'workspaceId', 'serviceId', 'environment', 'deploymentRevision', 'impact'] as const) nativeText(value[key]);
  nativeDigest(value.incidentId); feedbackScope(value.scope);
  if (!Array.isArray(value.findingIds) || !value.findingIds.length || value.findingIds.length > 128) responseFail('RESPONSE_PROBLEM');
  for (const id of value.findingIds) nativeDigest(id);
  if (!Array.isArray(value.causes) || value.causes.length > 32 || !Array.isArray(value.evidence) || value.evidence.length > 64 || !Array.isArray(value.history) || value.history.length > 128) responseFail('RESPONSE_PROBLEM');
  for (const ref of value.evidence) responseReference(ref);
  for (const cause of value.causes) {
    nativeExact(cause, ['kind', 'description', 'evidence']); nativeText(cause.description);
    if (!['observed', 'suspected', 'confirmed'].includes(cause.kind as string) || !Array.isArray(cause.evidence) || !cause.evidence.length || cause.evidence.length > 32) responseFail('RESPONSE_CAUSE');
    for (const ref of cause.evidence) responseReference(ref);
  }
  if (!Array.isArray(value.followups) || value.followups.length > 32) responseFail('RESPONSE_FOLLOWUP');
  for (const followup of value.followups) validateResponseFollowup(followup);
  if (new Set(value.followups.map(followup => followup.id)).size !== value.followups.length) responseFail('RESPONSE_FOLLOWUP');
  for (const disposition of [...value.history, ...(value.disposition ? [value.disposition] : [])]) {
    nativeExact(disposition, ['kind', 'actor', 'rationale', 'expiresAt', 'humanEvidenceRef', 'reviewDigest', 'at']);
    if (!['OPEN', 'DEFERRED', 'RISK_ACCEPTED', 'VERIFIED_CLOSED'].includes(disposition.kind as string)) responseFail('RESPONSE_DISPOSITION');
    for (const key of ['actor', 'rationale', 'humanEvidenceRef'] as const) nativeText(disposition[key]); nativeDigest(disposition.reviewDigest);
    if (!Number.isSafeInteger(disposition.at) || (disposition.at as number) < 1 || (disposition.expiresAt !== null && (!Number.isSafeInteger(disposition.expiresAt) || (disposition.expiresAt as number) <= (disposition.at as number)))) responseFail('RESPONSE_DISPOSITION');
    if (['DEFERRED', 'RISK_ACCEPTED'].includes(disposition.kind as string) && disposition.expiresAt === null) responseFail('RESPONSE_DISPOSITION');
  }
  const digest = value.digest, body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'digest'));
  if (digest !== nativeSha256(body)) responseFail('RESPONSE_PROBLEM_INTEGRITY');
}
export function validateResponseRecovery(value: unknown): asserts value is ResponseRecovery {
  nativeAssertJSON(value); nativeExact(value, ['workspaceId', 'scope', 'reference', 'bindingId', 'incidentId', 'serviceId', 'environment', 'deploymentRevision', 'faultDigest', 'recoveryDigest', 'faultAt', 'recoveryAt', 'outcome']);
  nativeText(value.workspaceId); feedbackScope(value.scope); responseReference(value.reference);
  for (const key of ['bindingId', 'serviceId', 'environment', 'deploymentRevision'] as const) nativeText(value[key]);
  for (const key of ['incidentId', 'faultDigest', 'recoveryDigest'] as const) nativeDigest(value[key]);
  if (!['PASS', 'FAIL', 'UNKNOWN'].includes(value.outcome as string) || !Number.isSafeInteger(value.faultAt) || !Number.isSafeInteger(value.recoveryAt) || (value.recoveryAt as number) <= (value.faultAt as number)) responseFail('RESPONSE_RECOVERY');
}
export function validateResponseExecutionVerification(value: unknown): asserts value is ResponseExecutionVerification {
  nativeAssertJSON(value); nativeExact(value, ['workspaceId', 'scope', 'reference', 'problemId', 'problemDigest', 'serviceId', 'environment', 'deploymentRevision', 'status', 'recovery', 'verifiedAt']);
  for (const key of ['workspaceId', 'problemId', 'serviceId', 'environment', 'deploymentRevision'] as const) nativeText(value[key]);
  feedbackScope(value.scope); responseReference(value.reference); nativeDigest(value.problemDigest);
  if (value.reference.owner !== 'runtime' || !['VERIFIED', 'UNVERIFIED'].includes(value.status as string)) responseFail('RESPONSE_EXECUTION');
  if (value.recovery !== null) responseReference(value.recovery);
  if (value.verifiedAt !== null && (!Number.isSafeInteger(value.verifiedAt) || (value.verifiedAt as number) < 1)) responseFail('RESPONSE_EXECUTION');
  if (value.status === 'VERIFIED' && (!value.recovery || value.verifiedAt === null)) responseFail('RESPONSE_EXECUTION');
}
