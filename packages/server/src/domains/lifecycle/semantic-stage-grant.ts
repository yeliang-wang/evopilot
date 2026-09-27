import type {LifecycleAgentExecutionRequest} from "./types.js";
import type {EvoPilotAgentExecutionResultV1Alpha1} from "@evopilot/contracts";
import {digestObject} from "../harness-template/utils.js";

export interface SemanticStageProof {
  schema: "evopilot-semantic-stage-proof/v1";
  scope: {tenantId: string; workspaceId: string; projectId: string; goalId: string; targetId: string};
  runId: string; stageId: string; sourceRequestDigest: string; requestDigest: string;
  executionBindingDigest: string; outcomeDigest: string; collectionReceiptDigest: string;
  completionPolicyDigest: string;
  outcomeReviewDigest: string; outcomeDecisionDigest: string; resultDigest: string;
  committedBy: string; proofDigest: string;
}
type Grant = {pending: LifecycleAgentExecutionRequest; result: EvoPilotAgentExecutionResultV1Alpha1;
  proof: SemanticStageProof; expectedRunDigest: string};
const grants = new WeakMap<object, Grant>();

/** Internal application/owner bridge. Not exported by a package entry point and
 * never serialized. The caller is trusted Runtime code after fresh validation;
 * this mechanism rejects client JSON, copied tokens and durable token replay.
 */
export function withSemanticStageGrant<T>(value: Grant, commit: (token: object) => T): T {
  const token = Object.freeze({}); grants.set(token, structuredClone(value));
  try {return commit(token);} finally {grants.delete(token);}
}
export function consumeSemanticStageGrant(token: unknown): Grant {
  if (!token || typeof token !== "object" || !grants.has(token)) throw new Error("LIFECYCLE_SEMANTIC_GRANT_REQUIRED");
  const value = grants.get(token)!; grants.delete(token);
  const {proofDigest, ...body} = value.proof;
  if (proofDigest !== digestObject(body) || value.result.status !== "SUCCEEDED" || value.proof.resultDigest !== digestObject(value.result) ||
    value.proof.sourceRequestDigest !== value.pending.requestDigest || value.proof.requestDigest !== value.result.requestDigest ||
    value.proof.runId !== value.pending.runId || value.proof.stageId !== value.pending.stageId) throw new Error("LIFECYCLE_SEMANTIC_GRANT_INVALID");
  return value;
}
