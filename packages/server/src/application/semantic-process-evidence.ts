import {assertAgentProcessObservation, type EvoPilotAgentProcessObservation, type EvoPilotAgentExecutionRequestV1Alpha1,
  type EvoPilotAgentExecutionResultV1Alpha1, type EvoPilotAgentRuntimeProfileV1} from "@evopilot/contracts";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";

/** Finite trusted-composition collector. Only measured Agent-process boundary
 * facts, never model-authored business facts, tool authorization or inferred
 * validator success. Synthetic runners remain explicitly synthetic. No I/O,
 * caller-selected source paths, dynamic collectors or command execution. */
export function collectSemanticProcessEvidence(receipt: Record<string, unknown>, request: EvoPilotAgentExecutionRequestV1Alpha1,
  profile: EvoPilotAgentRuntimeProfileV1) {
  if (receipt.processObservationStatus === undefined || receipt.processObservationStatus === "UNAVAILABLE") {
    requireSemantic(receipt.processObservation === undefined, "MATERIAL_INVALID"); return undefined;
  }
  requireSemantic(receipt.processObservationStatus === "COLLECTED" && isRecord(receipt.processObservation), "MATERIAL_INVALID");
  const observation = receipt.processObservation as unknown as EvoPilotAgentProcessObservation;
  requireSemantic(Buffer.byteLength(JSON.stringify(observation)) <= 16384, "MATERIAL_LIMIT");
  assertAgentProcessObservation(observation, request, receipt.result as EvoPilotAgentExecutionResultV1Alpha1, profile);
  const m = observation.material;
  const content = {schema: "evopilot-runtime-process-evidence/v1", kind: "agent-process", scope: request.scope,
    requestDigest: request.requestDigest, sourceRequestDigest: request.semanticContext?.sourceRequestDigest,
    executionBindingDigest: request.semanticContext?.executionBindingDigest,
    evidenceContractDigest: request.governance.evidenceDigest, adapterProfileDigest: profile.digest,
    receiptDigest: observation.receiptDigest, observationDigest: digestObject(observation), origin: m.origin,
    facts: {exitCode: m.exitCode, termination: m.termination, signal: m.signal,
      eventCount: m.eventCount, errorEventCount: m.errorEventCount, completionEventCount: m.completionEventCount, parseFailures: m.parseFailures}};
  return freeze({...content, digest: digestObject(content)});
}
