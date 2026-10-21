import fs from 'node:fs';
import path from 'node:path';
import type { CollectionRecord, NativeRun } from '@evopilot-next/runtime/service';
import type { NativeScope } from '../compatibility/v1/native.mjs';
import { nativeAssertJSON, nativeBytesDigest, nativeExact, nativeSha256, nativeRelativePath } from '../compatibility/v1/native.mjs';
import type { ResponseEvidence, ResponseEvidenceRef } from '../compatibility/response/v1/response.mjs';
import { responseEqual, responseFail, responseReference, validateResponseEvidence } from '../compatibility/response/v1/response.mjs';
import { canonicalPath, readRegular } from '../connection/config.js';
import type { Envelope, Options } from '../types.js';
import { validateCampaignDocument } from '../workspace/campaign.js';

type NativeRead = (request: Envelope) => Promise<unknown>;
function seconds(value: string): number {
  const result = Math.floor(Date.parse(value) / 1000);
  if (!Number.isSafeInteger(result) || result < 1) responseFail('RESPONSE_EVIDENCE_TIME');
  return result;
}

/** Resolve registered Runtime outputs; caller-supplied PASS values never reach this boundary. */
export async function readRuntimeResponseEvidence(options: Options, read: NativeRead, scope: NativeScope, reference: ResponseEvidenceRef): Promise<ResponseEvidence> {
  responseReference(reference);
  if (reference.owner !== 'runtime') responseFail('RESPONSE_EVIDENCE_OWNER');
  let actualDigest: string, observedAt: number, status: ResponseEvidence['status'];
  if (reference.id.startsWith('collection:')) {
    const id = reference.id.slice(11);
    const c = await read({ operation: 'collection.inspect', scope, input: { id } }) as CollectionRecord;
    if (!c.receipt || !c.claim || !responseEqual(c.scope, scope) || c.workspace.id !== options.workspaceId || c.id !== id) responseFail('RESPONSE_EVIDENCE_INCOMPLETE');
    const { digest, ...subject } = c.receipt;
    if (nativeSha256(subject) !== digest || c.receipt.claimId !== c.claim.claimId) responseFail('RESPONSE_EVIDENCE_INTEGRITY');
    actualDigest = digest; observedAt = seconds(c.receipt.result.endedAt);
    status = c.stage === 'SUCCEEDED' ? 'PASS' : c.stage === 'FAILED' ? 'FAIL' : 'UNKNOWN';
  } else if (reference.id.startsWith('run:')) {
    const id = reference.id.slice(4), run = await read({ operation: 'run.inspect', scope, input: { id } }) as NativeRun;
    if (!run.receipt || !run.claim || !responseEqual(run.plan.scope, scope) || run.plan.workspace.id !== options.workspaceId || run.plan.id !== id) responseFail('RESPONSE_EVIDENCE_INCOMPLETE');
    actualDigest = nativeSha256(run.receipt);
    const collectionTimes: number[] = [];
    for (const ref of run.plan.input.collectionReceipts) {
      const evidence = await readRuntimeResponseEvidence(options, read, scope, { owner: 'runtime', id: 'collection:' + ref.id, digest: ref.digest });
      collectionTimes.push(evidence.observedAt);
    }
    if (!collectionTimes.length) responseFail('RESPONSE_EXECUTION_EVIDENCE_REQUIRED');
    observedAt = Math.min(...collectionTimes);
    const reports = Object.values(run.receipt.ownerReceipts);
    status = run.stage === 'SUCCEEDED' && reports.every(r => r.executionStatus === 'SUCCEEDED' && r.qualityStatus === 'PASS') ? 'PASS'
      : run.stage === 'FAILED' || reports.some(r => r.qualityStatus === 'FAIL') ? 'FAIL' : 'UNKNOWN';
  } else responseFail('RESPONSE_EVIDENCE_UNSUPPORTED');
  if (actualDigest !== reference.digest) responseFail('RESPONSE_EVIDENCE_DRIFT');
  const result: ResponseEvidence = { workspaceId: options.workspaceId, scope, reference, status, observedAt };
  validateResponseEvidence(result); return result;
}

/** Existing private campaign JSON remains the Target/Loop ledger. It is never approval. */
export function readWorkspaceResponseEvidence(context: { projectRoot: string; workspaceId: string }, scope: NativeScope, reference: ResponseEvidenceRef): ResponseEvidence {
  responseReference(reference);
  if (reference.owner !== 'workspace' || scope.visibility !== 'private') responseFail('RESPONSE_LEDGER_SCOPE');
  const parts = reference.id.split('#loop=');
  if (parts.length > 2 || reference.id.includes('#') && parts.length !== 2) responseFail('RESPONSE_LEDGER_REFERENCE');
  const relative = parts[0]; nativeRelativePath(relative);
  if (!relative.startsWith('private/projects/' + scope.projectId + '/targets/') || !relative.endsWith('.json')) responseFail('RESPONSE_LEDGER_SCOPE');
  const marker: unknown = JSON.parse(readRegular(path.join(context.projectRoot, 'workspace-project.json'), 1048576, true).toString());
  if (!marker || typeof marker !== 'object' || !('id' in marker) || marker.id !== context.workspaceId) responseFail('RESPONSE_LEDGER_WORKSPACE');
  const raw = readRegular(path.join(context.projectRoot, relative), 1048576, true), campaign: unknown = JSON.parse(raw.toString());
  nativeAssertJSON(campaign); nativeExact(campaign, ['schema', 'projectId', 'id', 'goal', 'sourceDigest', 'criteria', 'loops', 'status', 'authority']);
  if (campaign.schema !== 'evopilot-private-campaign/v1' || campaign.projectId !== scope.projectId || campaign.authority !== false || !Array.isArray(campaign.loops) || !['IN_PROGRESS', 'COMPLETE'].includes(String(campaign.status))) responseFail('RESPONSE_LEDGER_SCOPE');
  validateCampaignDocument(campaign);
  if (relative.split('/').at(-2) !== campaign.id) responseFail('RESPONSE_LEDGER_REFERENCE');
  const campaignDigest = nativeBytesDigest(raw);
  let actualDigest = campaignDigest;
  if (parts.length === 2) {
    const loops = campaign.loops.filter((loop: unknown) => !!loop && typeof loop === 'object' && 'id' in loop && loop.id === parts[1]);
    if (loops.length !== 1) responseFail('RESPONSE_LEDGER_LOOP');
    nativeExact(loops[0], ['id', 'observation', 'action', 'result']);
    actualDigest = nativeSha256({ campaignDigest, loop: loops[0] });
  }
  if (actualDigest !== reference.digest) responseFail('RESPONSE_LEDGER_DRIFT');
  // Historical campaign records have no authoritative timestamp. This sentinel
  // is structural readback only and is forbidden as an operational prerequisite.
  return { workspaceId: context.workspaceId, scope, reference, status: 'PASS', observedAt: 1 };
}

/** Signal only the journal of the exact owned collection; confirmation comes from its result receipt. */
export async function requestResponseCollectionCancellation(options: Options, read: NativeRead, scope: NativeScope, collectionId: string, claimId: string): Promise<{ requested: true; claimId: string }> {
  const record = await read({ operation: 'collection.inspect', scope, input: { id: collectionId } }) as CollectionRecord;
  if (!record.claim || record.claim.claimId !== claimId || record.workspace.id !== options.workspaceId || !responseEqual(record.scope, scope) || !['RUNNING', 'UNKNOWN'].includes(record.stage)) responseFail('RESPONSE_CANCEL_CLAIM');
  const artifactRoot = path.join(options.workspaceRoot, 'state/runtime-native', claimId.slice(7)), journal = path.join(artifactRoot, '.collector');
  canonicalPath(journal);
  const retained: unknown = JSON.parse(readRegular(path.join(journal, 'request.json'), 32 * 1048576, true).toString());
  nativeExact(retained, ['schema', 'claim', 'artifactRoot', 'binding']);
  if (retained.schema !== 'evopilot-collection-worker/v1' || retained.artifactRoot !== artifactRoot || !responseEqual(retained.claim, record.claim)) responseFail('RESPONSE_CANCEL_CLAIM');
  const filename = path.join(journal, 'cancel');
  try {
    const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeSync(fd, 'cancel\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    const dir = fs.openSync(journal, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || readRegular(filename, 16, true).toString() !== 'cancel\n') throw error;
  }
  return { requested: true, claimId };
}
