import {assertAgentExecutionResultV1Alpha1, type EvoPilotAgentExecutionResultV1Alpha1} from "@evopilot/contracts";
import {createSemanticExecutionContextService} from "./semantic-execution-context.js";
import {createSemanticExecutionBindingService} from "./semantic-execution-binding.js";
import {semanticAgentRequest} from "./semantic-execution-transport.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {SemanticRuntimeSourceStore} from "../storage/semantic-runtime-source.js";
import type {LifecycleService} from "../domains/lifecycle/service.js";
import {readVerifiedSemanticCatalog} from "../domains/harness-template/semantic-catalog-consumer.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {semanticProjectAccess} from "./project-semantic-discovery.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {evaluateSemanticOutcomeRules} from "../domains/harness-template/semantic-outcome-plan.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {createSemanticOutcomeReviewService} from "./semantic-outcome-review.js";
import {collectSemanticProcessEvidence} from "./semantic-process-evidence.js";
import {readSemanticEvidenceCollection, semanticCollectionCorrelation} from "./semantic-evidence-collection.js";

/** Internal result evaluation, never result submission or completion. Reads an
 * existing dispatch receipt and only Runtime-owned content-addressed evidence.
 * Production review routes and evidence collector/ingestion must be composed before
 * exposing this capability. Agent text and source-workspace files are not proof.
 */
export function createSemanticExecutionOutcomeService(
  configuration: Parameters<typeof createSemanticExecutionContextService>[0],
  owners: Parameters<typeof createSemanticExecutionContextService>[1] & {lifecycle: Pick<LifecycleService, "readPendingExecution" | "readPendingObligations">; now?: () => number}
) {
  const contexts = createSemanticExecutionContextService(configuration, owners), bindings = createSemanticExecutionBindingService(configuration, owners);
  const store = new SemanticBindingStore(configuration.dataRoot), sources = new SemanticRuntimeSourceStore(configuration.dataRoot);
  return Object.freeze({async evaluate(input: Parameters<typeof contexts.resolve>[0]) {
    input = {...input, identity: structuredClone(input.identity), selection: input.selection ? structuredClone(input.selection) : undefined};
    const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(), 30000); timer.unref();
    const signal = input.signal ? AbortSignal.any([input.signal, timeout.signal]) : timeout.signal;
    const check = () => {requireSemantic(!input.signal?.aborted, "CANCELLED"); requireSemantic(!timeout.signal.aborted, "TIMEOUT");};
    try {
      check(); const scopedInput = {...input, signal};
      const bound = await bindings.inspect(input.identity, {...scopedInput, checkpoint: "resume"}); check();
      const subject = semanticProjectAccess(input.identity.projectId, input.currentAccess());
      const plan = bound.outcomePlan; requireSemantic(plan, "UNAVAILABLE");
      const reviews = createSemanticOutcomeReviewService(configuration, owners), approval = await reviews.inspect(scopedInput); check();
      const slice = await contexts.resolve(scopedInput); check();
      const scope = {...bound.scope, goalId: input.identity.goalId, targetId: input.identity.targetId};
      const pending = owners.lifecycle.readPendingExecution(input.runId, input.requestDigest, scope);
      requireSemantic(plan.stageId === pending.stageId && plan.action === pending.action && plan.actionVersion === pending.actionVersion, "DRIFT");
      const lifecycleObligations = owners.lifecycle.readPendingObligations(input.runId, input.requestDigest, scope);
      const request = semanticAgentRequest(pending, slice);
      const key = {scope: bound.scope, runId: input.runId, sourceRequestDigest: pending.requestDigest};
      const claim = store.read("dispatch-claims", key), receipt = store.read("dispatch-results", key);
      const expected = {requestDigest: request.requestDigest, executionBindingDigest: bound.bindingDigest, sliceDigest: slice.sliceDigest};
      requireSemantic(isRecord(claim) && digestObject(claim.binding) === digestObject(expected) && isRecord(receipt), "UNAVAILABLE");
      requireSemantic(receipt.schema === "evopilot-semantic-dispatch-result/v1" && receipt.status === "RECEIVED_PENDING_DUAL_VALIDATION" &&
        receipt.eligibleForCompletion === false && Object.entries(expected).every(([key, value]) => receipt[key] === value) &&
        receipt.sourceRequestDigest === pending.requestDigest && receipt.requestId === request.id &&
        receipt.adapterProfileDigest === bound.agentRuntime.profileDigest, "DIGEST_MISMATCH");
      const result = receipt.result as EvoPilotAgentExecutionResultV1Alpha1;
      assertAgentExecutionResultV1Alpha1(result, request);
      requireSemantic(configuration.registryConfigPath && configuration.policyPath, "TRUST_REQUIRED");
      const catalog = await readVerifiedSemanticCatalog({registryConfigPath: configuration.registryConfigPath, policyPath: configuration.policyPath,
        catalogId: bound.harness.catalogId, limits: configuration.limits, signal, currentSubject: () => {
          check(); const subject = semanticProjectAccess(input.identity.projectId, input.currentAccess());
          requireSemantic(digestObject(subject.scope) === digestObject(bound.scope) && ["operator", "admin"].includes(subject.principal.role), "PERMISSION_DENIED");
          return {scope: subject.scope, role: subject.principal.role, active: true};
        }}); check();
      const material = (digest: string, kind: string): Record<string, any> => {
        const entries = catalog.generation.entries.filter(entry => entry.kind === kind && entry.objectDigest === digest && digestObject(entry.scope) === digestObject(bound.scope));
        requireSemantic(entries.length === 1, "MATERIAL_MISSING"); const value = catalog.materials.get(entries[0].path);
        requireSemantic(isRecord(value), "MATERIAL_INVALID"); return value;
      };
      const bundle = material(bound.harness.bundle.digest, "HarnessBundle"), profile = material(bound.harness.profile.digest, "HarnessProfile");
      const components = (bundle.spec.resolvedComponents as Array<{digest: string}>).map(ref => material(ref.digest, "HarnessComponent"));
      const unique = (values: string[]) => [...new Set(values)].sort();
      // Derive the full obligation union from actual published closure and the
      // exact persisted Lifecycle, never from a caller's shortened candidate.
      const required = {
        validators: unique([...profile.spec.acceptance.blockingValidators, ...bundle.spec.validators,
          ...components.flatMap(c => c.spec.validators.map((v: {id: string}) => v.id)), ...lifecycleObligations.validators ?? []]),
        constraints: unique([...bundle.spec.constraints, ...components.flatMap(c => c.spec.constraints), ...lifecycleObligations.constraints ?? []]),
        evidence: unique([...profile.spec.acceptance.requiredEvidence, ...bundle.spec.evidence, ...components.flatMap(c => c.spec.evidence), ...lifecycleObligations.requiredEvidence ?? []])
      };
      const artifacts = result.artifacts ?? []; requireSemantic(artifacts.length <= 16, "MATERIAL_LIMIT");
      let totalBytes = 0;
      const observations = artifacts.map(artifact => {
        check(); const match = /^semantic-evidence:\/\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/([a-f0-9]{64})$/.exec(artifact.ref);
        requireSemantic(match && artifact.digest === `sha256:${match[2]}`, "PATH_DENIED");
        requireSemantic(match[1] !== "agent-process", "PERMISSION_DENIED");
        const evidence = sources.readOutcomeEvidence(bound.scope, artifact.digest), doc = evidence.document;
        requireSemantic(isRecord(doc) && Object.keys(doc).sort().join() === "evidenceContractDigest,executionBindingDigest,facts,kind,requestDigest,schema,scope,sourceRequestDigest" &&
          doc.schema === "evopilot-semantic-outcome-evidence/v1" && doc.kind === match[1] && isRecord(doc.facts) &&
          digestObject(doc.scope) === digestObject(scope) && doc.executionBindingDigest === bound.bindingDigest &&
          doc.requestDigest === request.requestDigest && doc.sourceRequestDigest === pending.requestDigest &&
          doc.evidenceContractDigest === bound.evidenceContractDigest, "DRIFT");
        totalBytes += evidence.byteLength; requireSemantic(totalBytes <= 262144, "TOTAL_MATERIAL_LIMIT");
        return {kind: String(doc.kind), facts: doc.facts, digest: artifact.digest};
      });
      const adapterProfile = owners.currentExecution(input.identity).agentAdapterProfile;
      const correlation = semanticCollectionCorrelation(bound, input.runId, pending.requestDigest, request.requestDigest,
        digestObject(result), approval.review.reviewDigest, approval.decision.decisionDigest);
      const collection = readSemanticEvidenceCollection(configuration.dataRoot, bound, correlation, owners.now?.());
      if (collection) for (const item of collection.observations) {
        // Never silently replace or upgrade Agent-authored evidence of the same kind.
        requireSemantic(!observations.some(existing => existing.kind === item.kind), "IDENTITY_CONFLICT");
        observations.push({kind: item.kind, facts: item.facts, digest: digestObject({receiptDigest: collection.receiptDigest, ...item})});
      }
      requireSemantic(adapterProfile && adapterProfile.digest === bound.agentRuntime.profileDigest, "DRIFT");
      const processEvidence = collectSemanticProcessEvidence(receipt, request, adapterProfile);
      if (processEvidence) observations.push({kind: processEvidence.kind, facts: processEvidence.facts, digest: processEvidence.digest});
      requireSemantic(observations.length <= 16, "MATERIAL_LIMIT");
      const checks = evaluateSemanticOutcomeRules(plan, observations, required, slice.concepts.map(concept => concept.conceptId));
      // Both sides are always reported. Agent success alone cannot pass either.
      const status = result.status === "FAILED" || checks.status === "FAILED" ? "FAILED" :
        result.status === "SUCCEEDED" && checks.status === "PASSED" ? "DUAL_VALIDATED_NOT_COMPLETED" : "INDETERMINATE";
      const content = {schema: "evopilot-semantic-execution-outcome/v1", scope, ...expected, outcomePlanDigest: plan.planDigest,
        outcomeReviewDigest: approval.review.reviewDigest, outcomeDecisionDigest: approval.decision.decisionDigest,
        ...(collection ? {collection: {receiptDigest: collection.receiptDigest, origin: collection.origin, requestDigest: collection.requestDigest},
          collectorTrust: collection.origin === "SYNTHETIC" ? "SYNTHETIC_CONFIGURED_COLLECTOR_ONLY" : "OPERATOR_CONFIGURED_COLLECTOR_NOT_PROOF_OF_BUSINESS_TRUTH"} : {}),
        evidenceTrust: artifacts.length > 0 ? "CONTENT_AND_CORRELATION_VERIFIED_NOT_COLLECTOR_ATTESTED" : collection ?
          collection.origin === "SYNTHETIC" ? "SYNTHETIC_COLLECTOR_OBSERVATIONS" : "CONFIGURED_COLLECTOR_OBSERVATIONS" :
          processEvidence?.origin === "NATIVE_PROCESS_RUNNER" ? "NATIVE_PROCESS_BOUNDARY_ONLY" :
          processEvidence ? "SYNTHETIC_PROCESS_BOUNDARY_ONLY" : "NO_OBSERVATIONS",
        processEvidence: processEvidence ? {digest: processEvidence.digest, origin: processEvidence.origin, observationDigest: processEvidence.observationDigest} : null,
        evaluatorDigest: bound.outcomeEvaluatorDigest,
        receiptDigest: result.receiptDigest, resultDigest: digestObject(result), sourceRequestDigest: pending.requestDigest,
        obligationDigest: digestObject(required), evidenceDigests: observations.map(item => item.digest).sort(),
        business: checks.business, harness: checks.harness, agentStatus: result.status, status, eligibleForCompletion: false,
        authority: {mayCompleteGoal: false, mayAdvanceLifecycle: false, mayApprove: false, mayPublish: false}};
      const report = freeze({...content, outcomeDigest: digestObject(content)});
      await bindings.inspect(input.identity, {...scopedInput, checkpoint: "resume"}); check();
      requireSemantic(digestObject(await reviews.inspect(scopedInput)) === digestObject(approval), "DRIFT"); check();
      requireSemantic(digestObject(owners.lifecycle.readPendingExecution(input.runId, input.requestDigest, scope)) === digestObject(pending) &&
        digestObject(owners.lifecycle.readPendingObligations(input.runId, input.requestDigest, scope)) === digestObject(lifecycleObligations) &&
        digestObject(store.read("dispatch-results", key)) === digestObject(receipt), "DRIFT");
      for (const artifact of artifacts) sources.readOutcomeEvidence(bound.scope, artifact.digest); check();
      requireSemantic(digestObject(readSemanticEvidenceCollection(configuration.dataRoot, bound, correlation, owners.now?.()) ?? null) ===
        digestObject(collection ?? null), "DRIFT");
      const finalSubject = semanticProjectAccess(input.identity.projectId, input.currentAccess());
      requireSemantic(["operator", "admin"].includes(finalSubject.principal.role) && digestObject(finalSubject) === digestObject(subject), "PERMISSION_DENIED");
      const saved = store.put("outcomes", {...key, requestDigest: request.requestDigest, outcomeDigest: report.outcomeDigest}, report);
      requireSemantic(digestObject(saved) === digestObject(report), "IDENTITY_CONFLICT");
      return report;
    } finally {clearTimeout(timer);}
  }});
}
