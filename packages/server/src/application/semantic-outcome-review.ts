import {createSemanticExecutionContextService} from "./semantic-execution-context.js";
import {createSemanticExecutionBindingService} from "./semantic-execution-binding.js";
import {createSemanticRuntimeSourceReader} from "./semantic-runtime-sources.js";
import {semanticProjectAccess} from "./project-semantic-discovery.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";

type ContextService = ReturnType<typeof createSemanticExecutionContextService>;
type Input = Parameters<ContextService["resolve"]>[0];
type Coverage = Array<{criterionDigest: string; ruleIds: string[]}>;
const policy = "current-scoped-operator-or-admin/v1";
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);

/** Product-owned review of a frozen execution's business mapping. A syntactic
 * coverage check cannot decide whether a predicate means the business criterion:
 * the current scoped operator reviews the exact criteria, rules and mapping.
 * This decision grants no dispatch, evidence-truth, completion or release rights.
 * Public transports use the fixed Runtime owner composition.
 */
export function createSemanticOutcomeReviewService(
  configuration: Parameters<typeof createSemanticExecutionContextService>[0],
  owners: Parameters<typeof createSemanticExecutionContextService>[1]
) {
  const contexts = createSemanticExecutionContextService(configuration, owners);
  const bindings = createSemanticExecutionBindingService(configuration, owners);
  const sources = createSemanticRuntimeSourceReader(configuration.dataRoot), store = new SemanticBindingStore(configuration.dataRoot);
  function subject(input: Input) {
    requireSemantic(!input.signal?.aborted, "CANCELLED");
    const value = semanticProjectAccess(input.identity.projectId, input.currentAccess());
    requireSemantic(["operator", "admin"].includes(value.principal.role), "PERMISSION_DENIED");
    return value;
  }
  function slot(input: Input) {
    return {scope: subject(input).scope, runId: input.runId, sourceRequestDigest: input.requestDigest, executionBindingDigest: input.bindingDigest};
  }
  async function mappingBasis(input: Input) {
    const original = subject(input), source = sources.read(input.identity, original.principal);
    requireSemantic(same(source.subject, original), "DRIFT");
    const bound = await bindings.inspect(input.identity, {...input, checkpoint: "resume"});
    const plan = bound.outcomePlan; requireSemantic(plan && bound.runtimeSourcePins && same(bound.runtimeSourcePins, source.pins), "UNAVAILABLE");
    const slice = await contexts.resolve(input);
    const pending = owners.lifecycle.readPendingExecution(input.runId, input.requestDigest, {...bound.scope,
      goalId: input.identity.goalId, targetId: input.identity.targetId});
    requireSemantic(plan.stageId === pending.stageId && plan.action === pending.action && plan.actionVersion === pending.actionVersion &&
      plan.business.every(rule => slice.concepts.some(concept => concept.conceptId === rule.conceptId)), "DRIFT");
    const criteria = source.acceptanceCriteria;
    requireSemantic(criteria.length > 0 && criteria.length <= 64 && criteria.every(c => c.text.trim().length > 0 && c.text.length <= 8192), "MATERIAL_LIMIT");
    requireSemantic(same(source, sources.read(input.identity, subject(input).principal)) && same(original, subject(input)), "DRIFT");
    return {source, bound, plan, slice, criteria};
  }
  async function prepareValue(input: Input, coverage: Coverage) {
    const {source, bound, plan, slice, criteria} = await mappingBasis(input);
    requireSemantic(Array.isArray(coverage) && coverage.length === criteria.length && coverage.every(isRecord) &&
      new Set(coverage.map(c => c.criterionDigest)).size === coverage.length, "INVALID");
    const ruleIds = plan.business.map(rule => rule.id);
    requireSemantic(coverage.every(c => isRecord(c) && Object.keys(c).sort().join() === "criterionDigest,ruleIds" &&
      criteria.some(criterion => criterion.criterionDigest === c.criterionDigest) && Array.isArray(c.ruleIds) &&
      c.ruleIds.length > 0 && c.ruleIds.length <= 64 && new Set(c.ruleIds).size === c.ruleIds.length && c.ruleIds.every(id => ruleIds.includes(id))) &&
      ruleIds.every(id => coverage.some(c => c.ruleIds.includes(id))), "INVALID");
    requireSemantic(same(source, sources.read(input.identity, subject(input).principal)) && same(source.subject, subject(input)), "DRIFT");
    const content = {schema: "evopilot-semantic-outcome-review/v1", ...slot(input),
      sliceDigest: slice.sliceDigest, outcomePlan: plan, runtimeSourcePins: source.pins,
      evaluatorDigest: bound.outcomeEvaluatorDigest, criteria,
      coverage: coverage.map(c => ({criterionDigest: c.criterionDigest, ruleIds: [...c.ruleIds].sort()})).sort((a, b) => a.criterionDigest.localeCompare(b.criterionDigest)),
      approvalPolicy: policy, authority: {mayDispatch: false, mayAttestEvidence: false, mayCompleteGoal: false, mayRelease: false}};
    return freeze({...content, reviewDigest: digestObject(content)});
  }
  type Review = Awaited<ReturnType<typeof prepareValue>>;
  function reviewRecord(value: unknown): Review {
    requireSemantic(isRecord(value), "UNAVAILABLE"); const {reviewDigest, ...body} = value;
    requireSemantic(value.schema === "evopilot-semantic-outcome-review/v1" && reviewDigest === digestObject(body), "DIGEST_MISMATCH");
    return value as Review;
  }
  function decision(review: Review, principal: ReturnType<typeof subject>["principal"], approvedAt: string) {
    const body = {schema: "evopilot-semantic-outcome-decision/v1", decision: "APPROVE", reviewDigest: review.reviewDigest,
      scope: review.scope, principal, approvedAt, approvalPolicy: policy};
    return freeze({...body, decisionDigest: digestObject(body)});
  }
  async function revalidate(input: Input, review: Review) {
    requireSemantic(same(await prepareValue(input, review.coverage), review), "DRIFT");
  }
  function capture(input: Input): Input {
    return {...input, identity: structuredClone(input.identity), selection: input.selection ? structuredClone(input.selection) : undefined};
  }
  return Object.freeze({
    async mapping(input: Input) {
      const captured = capture(input), original = subject(captured);
      const {source, bound, plan, slice, criteria} = await mappingBasis(captured);
      requireSemantic(same(original, subject(captured)) && same(source, sources.read(captured.identity, subject(captured).principal)), "DRIFT");
      const content = {schema: "evopilot-semantic-outcome-mapping/v1", status: "COVERAGE_INPUT_REQUIRED", ...slot(captured),
        sliceDigest: slice.sliceDigest, outcomePlan: plan, runtimeSourcePins: source.pins, evaluatorDigest: bound.outcomeEvaluatorDigest,
        criteria, concepts: slice.concepts, pendingExecution: slice.pendingExecution,
        coverageInputs: criteria.map(criterion => ({criterionDigest: criterion.criterionDigest, ruleIds: [] as string[]})),
        businessField: null, productType: null, textIsUntrustedData: true,
        constraints: {everyCriterionRequired: true, everyBusinessRuleRequired: true, harnessRulesCannotCoverBusinessCriteria: true},
        authority: {mayApprove: false, mayDispatch: false, mayAttestEvidence: false, mayCompleteGoal: false, mayRelease: false},
        nextAction: "supply-explicit-criterion-to-business-rule-coverage-then-prepare-separate-review"};
      return freeze({...content, mappingDigest: digestObject(content)});
    },
    async prepare(input: Input & {coverage: Coverage}) {
      const captured = capture(input), original = subject(captured), coverage = structuredClone(input.coverage);
      requireSemantic(store.read("dispatch-claims", {scope: original.scope, runId: captured.runId, sourceRequestDigest: captured.requestDigest}) === undefined, "PERMISSION_DENIED");
      const review = await prepareValue(captured, coverage);
      requireSemantic(same(original, subject(captured)), "DRIFT");
      const saved = reviewRecord(store.put("outcome-reviews", {...slot(captured), reviewDigest: review.reviewDigest}, review));
      requireSemantic(same(saved, review), "IDENTITY_CONFLICT"); return saved;
    },
    async approve(input: Input & {reviewDigest: string}) {
      const captured = capture(input), original = subject(captured), reviewDigest = input.reviewDigest;
      requireSemantic(/^sha256:[a-f0-9]{64}$/.test(reviewDigest), "INVALID");
      const key = slot(captured), review = reviewRecord(store.read("outcome-reviews", {...key, reviewDigest}));
      requireSemantic(review.reviewDigest === reviewDigest, "DIGEST_MISMATCH");
      await revalidate(captured, review);
      requireSemantic(same(original, subject(captured)), "DRIFT");
      const prior = store.read("outcome-decisions", key);
      if (prior !== undefined) {
        requireSemantic(isRecord(prior) && typeof prior.approvedAt === "string" && same(prior, decision(review, original.principal, prior.approvedAt)), "IDENTITY_CONFLICT");
        return freeze(prior);
      }
      requireSemantic(store.read("dispatch-claims", {scope: original.scope, runId: captured.runId, sourceRequestDigest: captured.requestDigest}) === undefined, "PERMISSION_DENIED");
      const approved = decision(review, original.principal, new Date().toISOString());
      const saved = store.put("outcome-decisions", key, approved);
      requireSemantic(same(saved, approved), "IDENTITY_CONFLICT"); return approved;
    },
    async inspect(input: Input) {
      input = capture(input); const original = subject(input), key = slot(input), saved = store.read("outcome-decisions", key);
      requireSemantic(isRecord(saved) && saved.decision === "APPROVE" && isRecord(saved.principal) &&
        typeof saved.approvedAt === "string" && Number.isFinite(Date.parse(saved.approvedAt)) &&
        ["operator", "admin"].includes(String(saved.principal.role)) && saved.principal.tenantId === original.scope.tenantId &&
        saved.principal.workspaceId === original.scope.workspaceId && typeof saved.principal.id === "string" && saved.principal.id.length > 0, "UNAVAILABLE");
      const review = reviewRecord(store.read("outcome-reviews", {...key, reviewDigest: saved.reviewDigest}));
      requireSemantic(same(saved, decision(review, saved.principal as ReturnType<typeof subject>["principal"], saved.approvedAt)), "DIGEST_MISMATCH");
      await revalidate(input, review);
      requireSemantic(same(original, subject(input)) && same(store.read("outcome-decisions", key), saved), "DRIFT");
      return freeze({review, decision: saved});
    }
  });
}
