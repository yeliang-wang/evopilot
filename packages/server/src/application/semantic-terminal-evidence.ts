import type {LifecycleService} from "../domains/lifecycle/service.js";
import type {SemanticExecutionIdentity} from "./semantic-execution-binding.js";
import {createSemanticGoalOwnership} from "./semantic-goal-ownership.js";
import {createSemanticRuntimeSourceReader} from "./semantic-runtime-sources.js";
import {semanticProjectAccess, semanticRequestId, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {semanticStageUsage} from "./semantic-execution-usage.js";

type Doc = Record<string, any>;
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
const hash = (value: unknown) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
/** Read-only pre-completion evidence assembly. Current Goal definition/approval
 * pins must still match the complete historical chain. This does NOT refresh
 * Catalog/collector/Host permission or issue a completion grant. Only the
 * separate dedicated mutation owner may do those checks and CAS-write the Goal. */
export function createSemanticTerminalEvidenceReader(dataRoot: string, lifecycle: Pick<LifecycleService, "readSemanticTerminal">,
  historicalReceipt = false) {
  const store = new SemanticBindingStore(dataRoot), ownership = createSemanticGoalOwnership(dataRoot);
  const runtime = createSemanticRuntimeSourceReader(dataRoot);
  const readSource = historicalReceipt ? runtime.readHistorical : runtime.read;
  return Object.freeze({read(input: {identity: SemanticExecutionIdentity; runId: string},
    access: {currentAccess: () => SemanticDiscoveryAccess; signal?: AbortSignal}) {
    input = structuredClone(input);
    const {identity, runId} = input;
    requireSemantic(Object.keys(input).sort().join() === "identity,runId" && isRecord(identity) &&
      Object.keys(identity).sort().join() === "goalId,harnessBindingDigest,projectId,targetId" &&
      [runId, identity.goalId, identity.projectId, identity.targetId].every(semanticRequestId) && hash(identity.harnessBindingDigest), "INVALID");
    function subject() {
      requireSemantic(!access.signal?.aborted, "CANCELLED");
      const value = semanticProjectAccess(identity.projectId, access.currentAccess());
      requireSemantic(["operator", "admin"].includes(value.principal.role), "PERMISSION_DENIED"); return value;
    }
    const original = subject(), scope = {...original.scope, goalId: identity.goalId, targetId: identity.targetId};
    const owner = {schema: "evopilot-semantic-goal-owner/v1" as const, targetId: identity.targetId, runId, harnessBindingDigest: identity.harnessBindingDigest};
    ownership.assert(identity.goalId, original.scope, owner);
    const terminal = lifecycle.readSemanticTerminal(runId, scope), source = readSource(identity, original.principal);
    requireSemantic(same(source.subject, original) && terminal.proof.harnessBindingDigest === identity.harnessBindingDigest, "DRIFT");
    const proofs = terminal.run.semanticStageCompletions!;
    requireSemantic(proofs.length <= 64, "MATERIAL_LIMIT");
    const witnesses: Array<{kind: Parameters<SemanticBindingStore["read"]>[0]; key: unknown; digest: string}> = [];
    function record(kind: Parameters<SemanticBindingStore["read"]>[0], key: unknown, schema?: string, digestField?: string, expected?: string): Doc {
      const value = store.read(kind, key); requireSemantic(isRecord(value), "UNAVAILABLE");
      if (schema) requireSemantic(value.schema === schema, "MATERIAL_INVALID");
      if (digestField) {
        const body = {...value}; delete body[digestField];
        requireSemantic(hash(value[digestField]) && digestObject(body) === value[digestField] &&
          (expected === undefined || value[digestField] === expected), "DIGEST_MISMATCH");
      }
      witnesses.push({kind, key, digest: digestObject(value)}); return value;
    }
    const rootKey = {scope: original.scope, identity};
    const root = record("execution-plans", rootKey, "evopilot-semantic-execution-plan/v1", "planDigest");
    const stages = proofs.map((proof, index) => {
      const key = {scope: original.scope, runId, sourceRequestDigest: proof.sourceRequestDigest};
      const executionStage = {runId, requestDigest: proof.sourceRequestDigest,
        ...(index ? {predecessorProofDigest: proofs[index - 1].proofDigest} : {})};
      const plan = index ? record("execution-stage-plans", {...rootKey, runId, requestDigest: proof.sourceRequestDigest},
        "evopilot-semantic-execution-plan/v1", "planDigest") : root;
      requireSemantic(same(plan.identity, identity) && same(plan.scope, original.scope) && same(plan.declaration?.identity, identity) &&
        plan.declaration.runId === runId && plan.declaration.requestDigest === proof.sourceRequestDigest &&
        plan.predecessorProofDigest === executionStage.predecessorProofDigest && plan.status === "PREPARED_NOT_APPROVED" &&
        same(plan.runtimeSourcePins, source.pins) && same(plan.runtimeSourcePins, root.runtimeSourcePins), "DRIFT");
      const bound = record("executions", {scope: original.scope, goalId: identity.goalId, targetId: identity.targetId,
        harnessBindingDigest: identity.harnessBindingDigest, executionStage}, "evopilot-semantic-execution-binding/v1", "bindingDigest", proof.executionBindingDigest);
      requireSemantic(same(bound.scope, original.scope) && same(bound.executionStage, executionStage) &&
        same(bound.runtimeSourcePins, source.pins) && bound.harness?.bindingDigest === identity.harnessBindingDigest &&
        bound.goalTarget?.goalId === identity.goalId && bound.goalTarget?.targetId === identity.targetId &&
        same(bound.outcomePlan, plan.declaration.outcomePlan), "DRIFT");
      const slot = {...key, executionBindingDigest: proof.executionBindingDigest};
      const review = record("outcome-reviews", {...slot, reviewDigest: proof.outcomeReviewDigest},
        "evopilot-semantic-outcome-review/v1", "reviewDigest", proof.outcomeReviewDigest);
      const decision = record("outcome-decisions", slot, "evopilot-semantic-outcome-decision/v1", "decisionDigest", proof.outcomeDecisionDigest);
      requireSemantic(Object.entries(slot).every(([k, v]) => same(review[k], v)) && same(review.runtimeSourcePins, source.pins) &&
        same(review.outcomePlan, bound.outcomePlan) && same(review.criteria, source.acceptanceCriteria) && same(decision.scope, original.scope) &&
        decision.decision === "APPROVE" && decision.reviewDigest === review.reviewDigest && same(decision.approvalPolicy, review.approvalPolicy) &&
        isRecord(decision.principal) && typeof decision.principal.role === "string" && ["operator", "admin"].includes(decision.principal.role) &&
        typeof decision.approvedAt === "string" && Number.isFinite(Date.parse(decision.approvedAt)), "DRIFT");
      const outcome = record("outcomes", {...key, requestDigest: proof.requestDigest, outcomeDigest: proof.outcomeDigest},
        "evopilot-semantic-execution-outcome/v1", "outcomeDigest", proof.outcomeDigest);
      requireSemantic(outcome.status === "DUAL_VALIDATED_NOT_COMPLETED" && outcome.business?.status === "PASSED" && outcome.harness?.status === "PASSED" &&
        outcome.agentStatus === "SUCCEEDED" && outcome.evidenceTrust === "CONFIGURED_COLLECTOR_OBSERVATIONS" &&
        outcome.outcomeReviewDigest === review.reviewDigest && outcome.outcomeDecisionDigest === decision.decisionDigest &&
        outcome.outcomePlanDigest === bound.outcomePlan.planDigest && outcome.evaluatorDigest === review.evaluatorDigest &&
        outcome.evaluatorDigest === bound.outcomeEvaluatorDigest, "TRUST_REQUIRED");
      const collection = record("collections", key, "evopilot-semantic-collection-receipt/v1", "receiptDigest", proof.collectionReceiptDigest);
      const request = collection.request; requireSemantic(isRecord(request), "MATERIAL_INVALID");
      const {collectionRequestDigest, ...requestBody} = request;
      requireSemantic(digestObject(requestBody) === collectionRequestDigest && request.scope && same(request.scope, scope) &&
        request.runId === runId && request.sourceRequestDigest === proof.sourceRequestDigest && request.requestDigest === proof.requestDigest &&
        request.executionBindingDigest === bound.bindingDigest && request.resultDigest === proof.resultDigest &&
        request.outcomeReviewDigest === review.reviewDigest && request.outcomeDecisionDigest === decision.decisionDigest &&
        request.outcomePlanDigest === bound.outcomePlan.planDigest && request.evidenceContractDigest === bound.evidenceContractDigest &&
        isRecord(request.collector) && request.collector.origin === "INDEPENDENT" && same(request.collector, collection.policy?.collector) &&
        collection.observation?.collectionRequestDigest === collectionRequestDigest &&
        collection.status === "COLLECTED_NOT_COMPLETED" && outcome.collection?.requestDigest === collectionRequestDigest, "DRIFT");
      const claim = record("collection-claims", key);
      requireSemantic(claim.collectionRequestDigest === collectionRequestDigest && claim.startedAt === collection.startedAt, "DRIFT");
      const dispatch = record("dispatch-results", key, "evopilot-semantic-dispatch-result/v1");
      const dispatchClaim = record("dispatch-claims", key);
      requireSemantic(same(dispatchClaim.binding, {requestDigest: proof.requestDigest, executionBindingDigest: bound.bindingDigest, sliceDigest: review.sliceDigest}) &&
        dispatch.sliceDigest === review.sliceDigest && dispatch.sourceRequestDigest === proof.sourceRequestDigest &&
        dispatch.requestDigest === proof.requestDigest && dispatch.executionBindingDigest === bound.bindingDigest &&
        digestObject(dispatch.result) === proof.resultDigest && dispatch.result?.status === "SUCCEEDED" &&
        (!dispatch.result.artifacts || dispatch.result.artifacts.length === 0) &&
        dispatch.processObservationStatus === "COLLECTED" && dispatch.processObservation?.material?.origin === "NATIVE_PROCESS_RUNNER" &&
        digestObject(dispatch.processObservation) === outcome.processEvidence?.observationDigest, "TRUST_REQUIRED");
      return {stageId: proof.stageId, sourceRequestDigest: proof.sourceRequestDigest, proofDigest: proof.proofDigest, planDigest: plan.planDigest, bindingDigest: bound.bindingDigest,
        reviewDigest: review.reviewDigest, decisionDigest: decision.decisionDigest, outcomeDigest: outcome.outcomeDigest, collectionReceiptDigest: collection.receiptDigest,
        usage: semanticStageUsage(dispatch, bound)};
    });
    for (const item of witnesses) requireSemantic(digestObject(store.read(item.kind, item.key)) === item.digest, "DRIFT");
    ownership.assert(identity.goalId, original.scope, owner);
    requireSemantic(same(lifecycle.readSemanticTerminal(runId, scope), terminal) && same(readSource(identity, subject().principal), source) &&
      same(subject(), original), "DRIFT");
    const body = {schema: "evopilot-semantic-terminal-evidence/v1", scope, identity, runId, runDigest: terminal.proof.runDigest,
      terminalDigest: terminal.proof.terminalDigest, runtimeSourcePins: source.pins, stages, sourceWitnessDigest: digestObject(witnesses),
      status: "TERMINAL_EVIDENCE_VERIFIED_NOT_COMPLETED", eligibleForCompletion: false,
      currentCompletionAuthorityVerified: false, authority: {mayCompleteGoal: false, mayCompleteTarget: false, mayDispatch: false, mayPublish: false}};
    return freeze({...body, evidenceDigest: digestObject(body)});
  }});
}
