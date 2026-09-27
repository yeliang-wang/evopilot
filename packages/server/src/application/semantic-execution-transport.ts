import {randomUUID} from "node:crypto";
import {assertAgentExecutionRequestV1Alpha1, assertAgentExecutionResultV1Alpha1, assertLifecycleExecutorAdapterV1,
  assertAgentProcessObservation, type EvoPilotAgentProcessObservationV1,
  type EvoPilotAgentExecutionRequestV1Alpha1, type EvoPilotLifecycleExecutorAdapterV1} from "@evopilot/contracts";
import {createSemanticExecutionContextService} from "./semantic-execution-context.js";
import {createSemanticExecutionBindingService} from "./semantic-execution-binding.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import type {LifecycleAgentExecutionRequest} from "../domains/lifecycle/types.js";
import {createSemanticOutcomeReviewService} from "./semantic-outcome-review.js";
import {collectSemanticProcessEvidence} from "./semantic-process-evidence.js";

export function semanticAgentRequest(pending: LifecycleAgentExecutionRequest,
  slice: Awaited<ReturnType<ReturnType<typeof createSemanticExecutionContextService>["resolve"]>>): EvoPilotAgentExecutionRequestV1Alpha1 {
  requireSemantic(typeof pending.executor.digest === "string" && !Object.hasOwn(pending, "semanticContext"), "INVALID");
  const semanticContext = {schema: "evopilot-semantic-agent-context/v1" as const, sourceRequestDigest: pending.requestDigest,
    sourceIdempotencyKey: pending.idempotencyKey, executionBindingDigest: slice.executionBindingDigest, slice};
  const dispatchId = `semantic-${digestObject({sourceRequestDigest: pending.requestDigest, executionBindingDigest: slice.executionBindingDigest, sliceDigest: slice.sliceDigest}).slice(7)}`;
  const {requestDigest: _sourceDigest, ...body} = pending;
  const material = {...body, executor: {...pending.executor, digest: pending.executor.digest}, id: dispatchId, idempotencyKey: dispatchId, semanticContext};
  const request = freeze({...material, requestDigest: digestObject(material)});
  assertAgentExecutionRequestV1Alpha1(request);
  return request;
}

/** Internal transport only. No HTTP/MCP route, completion write, retry, secret
 * resolution or Host selection. A claim is persisted BEFORE invoking an owner-
 * configured adapter. An ambiguous claim is never automatically replayed.
 * SUCCEEDED here is an Agent report, not business/Harness validation or approval.
 */
export function createSemanticExecutionTransport(
  configuration: Parameters<typeof createSemanticExecutionContextService>[0],
  owners: Parameters<typeof createSemanticExecutionContextService>[1] & {adapter: EvoPilotLifecycleExecutorAdapterV1}
) {
  const contexts = createSemanticExecutionContextService(configuration, owners);
  const bindings = createSemanticExecutionBindingService(configuration, owners);
  const store = new SemanticBindingStore(configuration.dataRoot), adapter = owners.adapter;
  const adapterFingerprint = () => {
    assertLifecycleExecutorAdapterV1(adapter);
    requireSemantic(adapter.semanticContextSchema === "evopilot-semantic-agent-context/v1", "UNSUPPORTED");
    const {digest, ...profile} = adapter.profile;
    requireSemantic(digest === digestObject(profile), "DIGEST_MISMATCH");
    return digestObject({id: adapter.id, host: adapter.host, capabilities: adapter.capabilities, profile: adapter.profile,
      semanticContextSchema: adapter.semanticContextSchema, processObservationSchema: adapter.processObservationSchema});
  };
  const adapterExecute = adapter.execute;
  const readObservation = adapter.readProcessObservation;
  return Object.freeze({async execute(input: Parameters<typeof contexts.resolve>[0]) {
    input = {...input, identity: structuredClone(input.identity), selection: input.selection ? structuredClone(input.selection) : undefined};
    const initialAdapter = adapterFingerprint();
    const slice = await contexts.resolve(input);
    const bound = await bindings.inspect(input.identity, {...input, checkpoint: "resume"});
    requireSemantic(bound.agentRuntime.profileDigest === adapter.profile.digest &&
      "adapterProfileDigest" in bound.agentRuntime && bound.agentRuntime.adapterProfileDigest === adapter.profile.digest &&
      bound.host.id === adapter.host && bound.agentRuntime.adapterId === adapter.id, "DRIFT");
    const pending = owners.lifecycle.readPendingExecution(input.runId, input.requestDigest,
      {...bound.scope, goalId: input.identity.goalId, targetId: input.identity.targetId});
    requireSemantic(pending.requestDigest === slice.pendingExecution.requestDigest && pending.executor.digest === bound.host.executorDigest, "DRIFT");
    if (bound.outcomePlan) requireSemantic(bound.outcomePlan.stageId === pending.stageId && bound.outcomePlan.action === pending.action &&
      bound.outcomePlan.actionVersion === pending.actionVersion, "DRIFT");
    const request = semanticAgentRequest(pending, slice);
    // Caller/Agent supplied plans cannot bypass the exact Runtime-owned review.
    if (bound.outcomePlan) await createSemanticOutcomeReviewService(configuration, owners).inspect(input);
    requireSemantic(initialAdapter === adapterFingerprint() && adapterExecute === adapter.execute && readObservation === adapter.readProcessObservation, "DRIFT");
    const key = {scope: bound.scope, runId: input.runId, sourceRequestDigest: pending.requestDigest};
    const expected = {requestDigest: request.requestDigest, executionBindingDigest: bound.bindingDigest, sliceDigest: slice.sliceDigest};
    const prior = store.read("dispatch-claims", key);
    if (prior !== undefined) {
      requireSemantic(isRecord(prior) && digestObject(prior.binding) === digestObject(expected), "IDENTITY_CONFLICT");
      const saved = store.read("dispatch-results", key);
      if (saved === undefined) throw new Error("SEMANTIC_DISPATCH_RECONCILIATION_REQUIRED");
      requireSemantic(isRecord(saved) && saved.requestDigest === request.requestDigest && saved.status === "RECEIVED_PENDING_DUAL_VALIDATION" &&
        saved.eligibleForCompletion === false, "DIGEST_MISMATCH");
      assertAgentExecutionResultV1Alpha1(saved.result as Parameters<typeof assertAgentExecutionResultV1Alpha1>[0], request);
      requireSemantic(saved.processObservationStatus !== "REJECTED", "MATERIAL_INVALID");
      collectSemanticProcessEvidence(saved, request, adapter.profile);
      return freeze(saved);
    }
    // Atomic immutable insertion elects exactly one process. Losing a race or
    // crashing after this write requires inspection, never a second invocation.
    // Persist the exact private request/profile before the claim or external
    // invocation. Read-only usage inspection must not resolve current execution
    // authority or replay a failed/uncertain dispatch to reconstruct history.
    const usageAnchor = {schema:"evopilot-semantic-dispatch-usage-anchor/v1",identity:input.identity,
      runId:input.runId,sourceRequestDigest:pending.requestDigest,...expected,request,profile:structuredClone(adapter.profile)};
    requireSemantic(digestObject(store.put("dispatch-usage-anchors",key,usageAnchor)) === digestObject(usageAnchor),"IDENTITY_CONFLICT");
    const claim = {schema: "evopilot-semantic-dispatch-claim/v1", binding: expected, usageAnchorDigest:digestObject(usageAnchor), nonce: randomUUID()};
    const winner = store.put("dispatch-claims", key, claim);
    if (digestObject(winner) !== digestObject(claim)) throw new Error("SEMANTIC_DISPATCH_RECONCILIATION_REQUIRED");
    requireSemantic(!input.signal?.aborted, "CANCELLED");
    // No await between final owner validation/claim and dispatch. Capture result
    // even if access is revoked during the external await; never lose the receipt.
    const receive = async () => {
      const raw = await adapterExecute.call(adapter, request);
      const result = structuredClone(raw);
      assertAgentExecutionResultV1Alpha1(result, request);
      requireSemantic(Buffer.byteLength(JSON.stringify(result)) <= 65536, "MATERIAL_LIMIT");
      // Exact allowlist prevents arbitrary adapter fields becoming Runtime evidence.
      requireSemantic(Object.keys(result).every(key => ["schema", "requestId", "requestDigest", "bindingDigest", "idempotencyKey", "status",
        "receiptDigest", "effects", "evidence", "cost", "artifacts"].includes(key)), "INVALID");
      if (result.cost) requireSemantic([result.cost.inputTokens, result.cost.outputTokens].every(value =>
        value === undefined || Number.isSafeInteger(value) && value >= 0), "INVALID");
      let processObservation: EvoPilotAgentProcessObservationV1 | undefined;
      let processObservationStatus: "COLLECTED" | "UNAVAILABLE" | "REJECTED" | undefined;
      if (readObservation) {
        try {
          requireSemantic(initialAdapter === adapterFingerprint() && readObservation === adapter.readProcessObservation, "DRIFT");
          const observed = readObservation.call(adapter, request, result);
          if (observed) {
            processObservation = structuredClone(observed);
            assertAgentProcessObservation(processObservation, request, result, adapter.profile);
            requireSemantic(Buffer.byteLength(JSON.stringify(processObservation)) <= 16384, "MATERIAL_LIMIT");
            processObservationStatus = "COLLECTED";
          } else processObservationStatus = "UNAVAILABLE";
        } catch {processObservation = undefined; processObservationStatus = "REJECTED";}
      }
      const receipt = {schema: "evopilot-semantic-dispatch-result/v1", ...expected, sourceRequestDigest: pending.requestDigest,
        requestId: request.id, adapterProfileDigest: bound.agentRuntime.profileDigest,
        ...(processObservationStatus ? {processObservationStatus} : {}), ...(processObservation ? {processObservation} : {}),
        result, status: "RECEIVED_PENDING_DUAL_VALIDATION", eligibleForCompletion: false};
      store.put("dispatch-results", key, receipt);
      // Retain the result even when collection is invalid. Never replay an
      // already executed request to manufacture a new observation.
      requireSemantic(processObservationStatus !== "REJECTED", "MATERIAL_INVALID");
      return receipt;
    };
    // Timeout/cancellation stops this waiter, not an external mutation. A late
    // valid receipt is still captured; the durable claim prevents blind replay.
    const receipt = await waitForReceipt(receive(), adapter.profile.constraints.timeoutMs, input.signal);
    // Revalidation failure retains the receipt but does not return a usable result.
    await bindings.inspect(input.identity, {...input, checkpoint: "resume"});
    if (bound.outcomePlan) await createSemanticOutcomeReviewService(configuration, owners).inspect(input);
    requireSemantic(initialAdapter === adapterFingerprint() && adapterExecute === adapter.execute, "DRIFT");
    owners.lifecycle.readPendingExecution(input.runId, input.requestDigest,
      {...bound.scope, goalId: input.identity.goalId, targetId: input.identity.targetId});
    return freeze(receipt);
  }});
}

function waitForReceipt<T>(operation: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancelled = () => reject(new Error("SEMANTIC_DISPATCH_CANCELLED_RECONCILIATION_REQUIRED"));
    const timer = setTimeout(() => reject(new Error("SEMANTIC_DISPATCH_TIMEOUT_RECONCILIATION_REQUIRED")), timeoutMs);
    signal?.addEventListener("abort", cancelled, {once: true});
    if (signal?.aborted) cancelled();
    operation.then(resolve, reject).finally(() => {clearTimeout(timer); signal?.removeEventListener("abort", cancelled);});
  });
}
