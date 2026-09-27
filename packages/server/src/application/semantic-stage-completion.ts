import type {LifecycleService} from "../domains/lifecycle/service.js";
import {withSemanticStageGrant, type SemanticStageProof} from "../domains/lifecycle/semantic-stage-grant.js";
import {createSemanticExecutionOutcomeService} from "./semantic-execution-outcome.js";
import {createSemanticExecutionBindingService} from "./semantic-execution-binding.js";
import {readSemanticEvidenceCollection, semanticCollectionCorrelation} from "./semantic-evidence-collection.js";
import {createSemanticGovernedSourceReader} from "./semantic-governed-sources.js";
import {SemanticRuntimeSourceStore} from "../storage/semantic-runtime-source.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {semanticProjectAccess} from "./project-semantic-discovery.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import type {EvoPilotAgentExecutionResultV1Alpha1} from "@evopilot/contracts";

type Configuration = Parameters<typeof createSemanticExecutionOutcomeService>[0];
type Owners = Parameters<typeof createSemanticExecutionOutcomeService>[1] & {
  lifecycle: Pick<LifecycleService, "read" | "readSettledVerified" | "readPendingExecution" | "readPendingObligations" | "commitSemanticStage">;
};
type Input = Parameters<ReturnType<typeof createSemanticExecutionOutcomeService>["evaluate"]>[0];
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
const hash = (v: unknown): v is string => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);

/** Stage mutation owner behind the fixed HTTP/CLI/MCP application.
 * Production composition, successor planning and Goal/Target terminal projection
 * remain separate. No caller-supplied PASSED report, synthetic bypass or boolean
 * completion grant. Native/independent provenance is necessary, not proof that
 * a collector's qualification or domain mapping is adequate in the real world.
 */
export function createSemanticStageCompletionService(configuration: Configuration, owners: Owners) {
  const bindings = createSemanticExecutionBindingService(configuration, owners), outcomes = createSemanticExecutionOutcomeService(configuration, owners);
  const store = new SemanticBindingStore(configuration.dataRoot), sources = new SemanticRuntimeSourceStore(configuration.dataRoot);
  const now = owners.now ?? Date.now;
  function subject(input: Input) {
    requireSemantic(!input.signal?.aborted, "CANCELLED");
    const s = semanticProjectAccess(input.identity.projectId, input.currentAccess());
    requireSemantic(["operator", "admin"].includes(s.principal.role), "PERMISSION_DENIED"); return s;
  }
  function summary(proof: SemanticStageProof) {
    return freeze({schema: "evopilot-semantic-stage-commit/v1", status: "STAGE_COMMITTED", proofDigest: proof.proofDigest,
      runId: proof.runId, stageId: proof.stageId, sourceRequestDigest: proof.sourceRequestDigest, outcomeDigest: proof.outcomeDigest,
      nextAction: "INSPECT_LIFECYCLE_AND_PREPARE_SUCCESSOR", authority: {mayCompleteGoal: false, mayCompleteTarget: false, mayDispatch: false, mayPublish: false}});
  }
  function receipt(input: Input) {
    const s = subject(input), run = owners.lifecycle.readSettledVerified(input.runId); requireSemantic(run, "UNAVAILABLE");
    const scope = {...s.scope, goalId: input.identity.goalId, targetId: input.identity.targetId};
    requireSemantic(Object.entries(scope).every(([key, value]) => run[key as keyof typeof run] === value) &&
      run.binding?.harnessExecutionBindingDigest === input.identity.harnessBindingDigest, "PERMISSION_DENIED");
    const candidates = run.semanticStageCompletions?.filter(p => p.sourceRequestDigest === input.requestDigest) ?? [];
    requireSemantic(candidates.length <= 1, "IDENTITY_CONFLICT");
    if (!candidates.length) return undefined;
    const proof = candidates[0], {proofDigest, ...body} = proof;
    requireSemantic(hash(proofDigest) && digestObject(body) === proofDigest && proof.executionBindingDigest === input.bindingDigest && same(proof.scope, scope) &&
      run.stageAttempts.some(a => a.stageId === proof.stageId && a.status === "SUCCEEDED" && a.evidence.includes(`semantic-completion://${proofDigest.slice(7)}`)) &&
      run.trajectory.some(t => t.requestDigest === proof.requestDigest && t.status === "SUCCEEDED"), "DIGEST_MISMATCH");
    requireSemantic(same(owners.lifecycle.readSettledVerified(input.runId), run), "DRIFT");
    return summary(proof);
  }
  return Object.freeze({receipt,
    async commit(input: Input) {
      input = {...input, identity: structuredClone(input.identity)};
      const prior = receipt(input); if (prior) return prior; // Historical readback only; never repeats a write.
      const original = subject(input), run = owners.lifecycle.read(input.runId); requireSemantic(run, "UNAVAILABLE");
      const bound = await bindings.inspect(input.identity, {...input, checkpoint: "resume"});
      const pins = bound.governedSourcePins; requireSemantic(pins, "TRUST_REQUIRED");
      const scope = {...bound.scope, goalId: input.identity.goalId, targetId: input.identity.targetId};
      function policy() {
        const refs = Object.fromEntries(Object.entries(pins!.resources).map(([slot, ref]) => [slot, {id: ref.id, version: ref.version, digest: ref.digest}]));
        requireSemantic(same(createSemanticGovernedSourceReader(configuration.dataRoot).read(refs as any, bound.scope), pins), "DRIFT");
        const ref = pins!.resources.evidence, resource = sources.readGovernedResource(bound.scope, ref.kind, ref.id, ref.version);
        requireSemantic(isRecord(resource) && isRecord(resource.spec), "MATERIAL_INVALID");
        const p = resource.spec.semanticCompletionPolicy;
        requireSemantic(isRecord(p) && Object.keys(p).sort().join() === "action,schema,scope,status,validFrom,validUntil" &&
          p.schema === "evopilot-semantic-stage-completion-policy/v1" && p.status === "ACTIVE" && p.action === "COMMIT_VALIDATED_STAGE" &&
          same(p.scope, scope) && typeof p.validFrom === "string" && typeof p.validUntil === "string" &&
          Date.parse(p.validFrom) <= now() && now() < Date.parse(p.validUntil), "PERMISSION_DENIED");
        return digestObject(p);
      }
      const policyDigest = policy(), beforeState = digestObject(owners.currentExecution(input.identity));
      const pending = owners.lifecycle.readPendingExecution(input.runId, input.requestDigest, scope);
      const report = await outcomes.evaluate(input);
      requireSemantic(report.status === "DUAL_VALIDATED_NOT_COMPLETED" && report.business.status === "PASSED" && report.harness.status === "PASSED" &&
        report.agentStatus === "SUCCEEDED", "PERMISSION_DENIED");
      requireSemantic(report.collection?.origin === "INDEPENDENT" && report.processEvidence?.origin === "NATIVE_PROCESS_RUNNER" &&
        report.evidenceTrust === "CONFIGURED_COLLECTOR_OBSERVATIONS", "TRUST_REQUIRED");
      const key = {scope: bound.scope, runId: input.runId, sourceRequestDigest: input.requestDigest};
      const dispatch = store.read("dispatch-results", key);
      requireSemantic(isRecord(dispatch) && isRecord(dispatch.result) && (!dispatch.result.artifacts || Array.isArray(dispatch.result.artifacts) && dispatch.result.artifacts.length === 0) &&
        digestObject(dispatch.result) === report.resultDigest && dispatch.requestDigest === report.requestDigest, "DIGEST_MISMATCH");
      const result = dispatch.result as unknown as EvoPilotAgentExecutionResultV1Alpha1;
      const correlation = semanticCollectionCorrelation(bound, input.runId, input.requestDigest, report.requestDigest, report.resultDigest,
        report.outcomeReviewDigest, report.outcomeDecisionDigest);
      const collection = readSemanticEvidenceCollection(configuration.dataRoot, bound, correlation, now());
      requireSemantic(collection?.receiptDigest === report.collection.receiptDigest && collection.origin === "INDEPENDENT", "DRIFT");
      requireSemantic(hash(report.outcomeDecisionDigest), "DIGEST_MISMATCH");
      const body = {schema: "evopilot-semantic-stage-proof/v1" as const, scope, runId: input.runId, stageId: pending.stageId,
        sourceRequestDigest: input.requestDigest, requestDigest: report.requestDigest, executionBindingDigest: bound.bindingDigest,
        outcomeDigest: report.outcomeDigest, collectionReceiptDigest: collection.receiptDigest,
        completionPolicyDigest: policyDigest,
        outcomeReviewDigest: report.outcomeReviewDigest, outcomeDecisionDigest: report.outcomeDecisionDigest,
        resultDigest: report.resultDigest, committedBy: original.principal.id};
      // Synchronous final checks and CAS commit: no await or external invocation in between.
      requireSemantic(policy() === policyDigest && same(subject(input), original) && digestObject(owners.currentExecution(input.identity)) === beforeState &&
        same(owners.lifecycle.readPendingExecution(input.runId, input.requestDigest, scope), pending), "DRIFT");
      const proof = freeze({...body, proofDigest: digestObject(body)});
      withSemanticStageGrant({pending, result, proof, expectedRunDigest: digestObject(run)}, token => owners.lifecycle.commitSemanticStage(token));
      return receipt(input)!;
    }
  });
}
