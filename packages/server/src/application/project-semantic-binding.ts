import {createProjectSemanticDiscoveryService, semanticProjectAccess, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {semanticOnboardingGuidance} from "./project-semantic-onboarding.js";
import {semanticRequestId} from "./project-semantic-discovery.js";

type AccessInput = {projectId: string; currentAccess: () => SemanticDiscoveryAccess; signal?: AbortSignal};
type Selection = {catalogId: string; artifactSetDigest: string; bundleDigest: string};
type Inspection = Awaited<ReturnType<ReturnType<typeof createProjectSemanticDiscoveryService>["compatibility"]>>;
const hash = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const approvalPolicy = "current-scoped-operator-or-admin/v1";

function pins(inspection: Inspection) {
  const r = inspection.report;
  return {artifactSetDigest: r.artifactSetDigest as string, snapshotDigest: r.snapshotDigest as string,
    skillDigest: r.skillDigest as string, provenanceDigest: r.provenanceDigest, closureDigest: inspection.closureDigest as string,
    bundleRef: r.bundleRef as {id: string; version: string; digest: string}, reasoningProfileDigest: r.reasoningProfileDigest as string,
    harnessClosure: r.harnessClosure as {profile: {id: string; version: string; digest: string}; components: {id: string; version: string; digest: string}[]},
    compatibilityDigest: r.compatibilityDigest};
}
function review(inspection: Inspection) {
  requireSemantic(inspection.report.status === "COMPATIBLE", "MATERIAL_INVALID");
  const value = {schema: "evopilot-project-semantic-binding-review/v1" as const,
    scope: inspection.report.scope, projectRevisionDigest: inspection.projectRevisionDigest!,
    catalogId: inspection.catalogId, inspectionDigest: inspection.inspectionDigest, pins: pins(inspection),
    approvalPolicy, eligibleForExecution: false as const, bindingCreated: false as const};
  return freeze({...value, reviewDigest: digestObject(value)});
}
type Review = ReturnType<typeof review>;
function decisionRecord(r: Review, principal: ReturnType<typeof semanticProjectAccess>["principal"], approvedAt: string) {
  const decision = {schema: "evopilot-project-semantic-binding-decision/v1" as const, decision: "APPROVE" as const,
    reviewDigest: r.reviewDigest, scope: r.scope, principal, approvalPolicy, approvedAt};
  const authority = {...decision, decisionDigest: digestObject(decision)};
  const binding = {schema: "evopilot-project-semantic-binding/v1" as const, scope: r.scope, projectRevisionDigest: r.projectRevisionDigest,
    status: "REVIEWED_NOT_ACTIVATED" as const,
    catalogId: r.catalogId, pins: r.pins, reviewDigest: r.reviewDigest, decisionDigest: authority.decisionDigest,
    eligibleForExecution: false as const, nextAction: "resolve-governed-semantic-execution-binding"};
  return freeze({review: r, decision: authority, binding: {...binding, bindingDigest: digestObject(binding)}});
}
type Record = ReturnType<typeof decisionRecord>;
type TransitionAction = "ACTIVATE" | "MIGRATE" | "ROLLBACK";
type TransitionInput = {action: TransitionAction; expectedHeadDigest: string; destinationDigest: string};
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
const maximumTransitions = 64;
function transitionReview(input: TransitionInput, from: Record, target: Review) {
  const before = {catalogId: from.binding.catalogId, projectRevisionDigest: from.binding.projectRevisionDigest, ...from.binding.pins};
  const after = {catalogId: target.catalogId, projectRevisionDigest: target.projectRevisionDigest, ...target.pins};
  const value = {schema: "evopilot-project-semantic-transition-review/v1" as const, ...input, scope: target.scope,
    fromBindingDigest: from.binding.bindingDigest, targetReview: target,
    changedFields: Object.keys(before).filter(key => !same(before[key as keyof typeof before], after[key as keyof typeof after])).sort(),
    effect: "FUTURE_EXECUTION_PLANS_ONLY" as const, mutatesExistingExecutions: false as const, grantsExecutionAuthority: false as const};
  return freeze({...value, transitionReviewDigest: digestObject(value)});
}
type TransitionReview = ReturnType<typeof transitionReview>;
function transitionRecord(review: TransitionReview, destination: Record, principal: ReturnType<typeof semanticProjectAccess>["principal"], approvedAt: string) {
  const decision = {decision: "APPROVE" as const, principal, approvedAt, approvalPolicy, transitionReviewDigest: review.transitionReviewDigest};
  const value = {schema: "evopilot-project-semantic-transition/v1" as const, review, destination,
    decision: {...decision, decisionDigest: digestObject(decision)}};
  return freeze({...value, transitionDigest: digestObject(value)});
}
type Transition = ReturnType<typeof transitionRecord>;

/** One initial immutable binding per exact project scope. Explicit transitions
 * append an atomic decision/destination tuple without rewriting old bindings.
 * Catalog growth is evidence drift during review, but is
 * not a dependency of an already approved binding. The latter revalidates its
 * selected pins against freshly permitted, complete published material instead.
 */
export function createProjectSemanticBindingService(configuration: Parameters<typeof createProjectSemanticDiscoveryService>[0] & {dataRoot: string}) {
  const discovery = createProjectSemanticDiscoveryService(configuration), store = new SemanticBindingStore(configuration.dataRoot);
  function access(input: AccessInput, write = false) {
    requireSemantic(!input.signal?.aborted, "CANCELLED");
    const state = semanticProjectAccess(input.projectId, input.currentAccess());
    if (write) requireSemantic(["operator", "admin"].includes(state.principal.role), "PERMISSION_DENIED");
    return state;
  }
  function storedReview(value: unknown): Review {
    requireSemantic(isRecord(value), "MATERIAL_INVALID");
    const {reviewDigest, ...content} = value;
    requireSemantic(hash(reviewDigest) && digestObject(content) === reviewDigest, "DIGEST_MISMATCH");
    requireSemantic(value.schema === "evopilot-project-semantic-binding-review/v1" && value.approvalPolicy === approvalPolicy &&
      isRecord(value.scope) && isRecord(value.pins) && value.eligibleForExecution === false && value.bindingCreated === false, "MATERIAL_INVALID");
    return value as Review;
  }
  function storedRecord(value: unknown): Record {
    requireSemantic(isRecord(value) && isRecord(value.decision), "MATERIAL_INVALID");
    const r = storedReview(value.review), d = value.decision;
    requireSemantic(isRecord(d.principal) && ["operator", "admin"].includes(String(d.principal.role)) &&
      d.principal.tenantId === r.scope.tenantId && d.principal.workspaceId === r.scope.workspaceId &&
      typeof d.principal.id === "string" && d.principal.id.length > 0 && d.principal.id.length <= 256 &&
      typeof d.approvedAt === "string" && Number.isFinite(Date.parse(d.approvedAt)), "MATERIAL_INVALID");
    const expected = decisionRecord(r, d.principal as ReturnType<typeof semanticProjectAccess>["principal"], d.approvedAt);
    requireSemantic(digestObject(expected) === digestObject(value), "DIGEST_MISMATCH");
    return expected;
  }
  function sameScope(r: Review, state: ReturnType<typeof access>) {
    requireSemantic(digestObject(r.scope) === digestObject(state.scope), "PERMISSION_DENIED");
    requireSemantic(r.projectRevisionDigest === state.projectRevisionDigest, "DRIFT");
  }
  function selection(r: Review): Selection {
    return {catalogId: r.catalogId, artifactSetDigest: r.pins.artifactSetDigest, bundleDigest: r.pins.bundleRef.digest};
  }
  async function revalidate(record: Record, input: AccessInput) {
    sameScope(record.review, access(input));
    const current = await discovery.compatibility({...input, ...selection(record.review)});
    requireSemantic(current.report.status === "COMPATIBLE" && digestObject(pins(current)) === digestObject(record.binding.pins), "DRIFT");
    sameScope(record.review, access(input));
    return record;
  }
  function history(input: AccessInput) {
    const state = access(input), rawInitial = store.read("projects", state.scope);
    requireSemantic(rawInitial !== undefined, "UNAVAILABLE");
    const initial = storedRecord(rawInitial);
    requireSemantic(same(initial.binding.scope, state.scope), "PERMISSION_DENIED");
    const records = [initial], transitions: Transition[] = [];
    let current = initial, headDigest = initial.binding.bindingDigest;
    // Follow only this scoped chain. A slot is a no-replace CAS on its exact
    // predecessor; no directory scan, mutable head or multi-file transaction.
    for (let index = 0; index <= maximumTransitions; index++) {
      const raw = store.read("project-transitions", {scope: state.scope, predecessorDigest: headDigest});
      if (raw === undefined) return {records, transitions, current, headDigest};
      requireSemantic(index < maximumTransitions, "MATERIAL_LIMIT");
      requireSemantic(isRecord(raw) && isRecord(raw.review) && isRecord(raw.decision), "MATERIAL_INVALID");
      const target = storedRecord(raw.destination), r = raw.review;
      const action = r.action as TransitionAction;
      requireSemantic(["ACTIVATE", "MIGRATE", "ROLLBACK"].includes(action) && hash(r.destinationDigest) &&
        r.expectedHeadDigest === headDigest && same(target.binding.scope, state.scope), "DRIFT");
      if (action === "ACTIVATE") requireSemantic(index === 0 && same(target, initial) && r.destinationDigest === initial.binding.bindingDigest, "DRIFT");
      else if (action === "ROLLBACK") requireSemantic(index > 0 && target.binding.bindingDigest !== current.binding.bindingDigest &&
        records.some(record => same(record, target)) && r.destinationDigest === target.binding.bindingDigest, "DRIFT");
      else requireSemantic(index > 0 && r.destinationDigest === target.review.reviewDigest && target.review.reviewDigest !== current.review.reviewDigest &&
        same(raw.decision.principal, target.decision.principal) && raw.decision.approvedAt === target.decision.approvedAt, "DRIFT");
      const expectedReview = transitionReview({action, expectedHeadDigest: headDigest, destinationDigest: r.destinationDigest}, current, target.review);
      requireSemantic(same(r, expectedReview), "DIGEST_MISMATCH");
      // Reuse the binding decision validator for current transition authority,
      // including rollback by a different currently authorized operator.
      const authority = storedRecord(decisionRecord(target.review, raw.decision.principal as Record["decision"]["principal"], raw.decision.approvedAt as string));
      const expected = transitionRecord(expectedReview, target, authority.decision.principal, authority.decision.approvedAt);
      requireSemantic(same(raw, expected), "DIGEST_MISMATCH");
      transitions.push(expected); records.push(target); current = target; headDigest = expected.transitionDigest;
    }
    throw new Error("UNREACHABLE");
  }
  function stable(input: AccessInput, headDigest: string) { requireSemantic(history(input).headDigest === headDigest, "DRIFT"); }
  function findRecord(input: AccessInput, bindingDigest?: string) {
    const h = history(input);
    const record = bindingDigest === undefined ? h.current : h.records.find(r => r.binding.bindingDigest === bindingDigest);
    requireSemantic(record, "UNAVAILABLE"); return {h, record};
  }
  return Object.freeze({
    async onboarding(input: AccessInput & {catalogId: string}) {
      requireSemantic(semanticRequestId(input.catalogId), "SCOPE_INVALID");
      const original = access(input);
      if (store.read("projects", original.scope) !== undefined) {
        const h = history(input); await revalidate(h.current, input); stable(input, h.headDigest);
        requireSemantic(same(original, access(input)), "DRIFT");
        const result = {schema: "evopilot-project-semantic-onboarding/v1", projectId: input.projectId, projectRevisionDigest: original.projectRevisionDigest,
          catalogId: input.catalogId, candidatesDigest: null, candidates: [], compatibleCount: 0, status: "EXISTING_BINDING",
          recommendedBindingMode: "PRESERVE_EXISTING_BINDING", selectedCandidate: null,
          existingBinding: {catalogId: h.current.binding.catalogId, bindingDigest: h.current.binding.bindingDigest, headDigest: h.headDigest},
          businessField: null, productType: null, missingInputs: [], nextAction: "inspect-activation-before-explicit-transition",
          bindingCreated: false, preservesLegacyBindings: true, eligibleForExecution: false, grantsExecutionAuthority: false,
          requiresSeparateBindingApproval: true, maximumCandidates: 64};
        return freeze({...result, onboardingDigest: digestObject(result)});
      }
      const choices = await discovery.onboardingCandidates(input);
      requireSemantic(same(original, access(input)) && choices.projectRevisionDigest === original.projectRevisionDigest, "DRIFT");
      // If a peer approves while we inspect, report drift, not an obsolete
      // unbound prompt. Only absence of the exact slot means unbound/legacy.
      requireSemantic(store.read("projects", original.scope) === undefined, "DRIFT");
      return semanticOnboardingGuidance(choices);
    },
    async prepare(input: AccessInput & Selection) {
      const original = access(input, true);
      const prepared = review(await discovery.compatibility(input));
      const current = access(input, true);
      requireSemantic(digestObject(original) === digestObject(current), "DRIFT"); sameScope(prepared, current);
      const saved = storedReview(store.put("reviews", {scope: current.scope, reviewDigest: prepared.reviewDigest}, prepared));
      requireSemantic(digestObject(saved) === digestObject(prepared), "DIGEST_MISMATCH");
      return saved;
    },
    async approve(input: AccessInput & {reviewDigest: string}) {
      requireSemantic(hash(input.reviewDigest), "INVALID");
      const original = access(input, true);
      const raw = store.read("reviews", {scope: original.scope, reviewDigest: input.reviewDigest});
      requireSemantic(raw !== undefined, "UNAVAILABLE");
      const prepared = storedReview(raw); sameScope(prepared, original);
      requireSemantic(prepared.reviewDigest === input.reviewDigest, "DIGEST_MISMATCH");
      const prior = store.read("projects", original.scope);
      if (prior !== undefined) {
        const record = storedRecord(prior);
        requireSemantic(record.review.reviewDigest === input.reviewDigest && digestObject(record.decision.principal) === digestObject(original.principal), "IDENTITY_CONFLICT");
        await revalidate(record, input);
        requireSemantic(digestObject(original) === digestObject(access(input, true)), "DRIFT");
        return record;
      }
      const fresh = review(await discovery.compatibility({...input, ...selection(prepared)}));
      requireSemantic(fresh.reviewDigest === input.reviewDigest, "DRIFT");
      const current = access(input, true);
      requireSemantic(digestObject(original) === digestObject(current), "DRIFT");
      // No asynchronous gap between the final current-principal check and the
      // synchronous, no-replace store commit. This is product API authority,
      // never Codex Target approval, Host output or semantic asset prose.
      const record = storedRecord(store.put("projects", current.scope, decisionRecord(prepared, current.principal, new Date().toISOString())));
      requireSemantic(record.review.reviewDigest === prepared.reviewDigest && digestObject(record.decision.principal) === digestObject(current.principal), "IDENTITY_CONFLICT");
      return record;
    },
    async prepareTransition(input: AccessInput & TransitionInput) {
      input = {...input};
      const original = access(input, true), h = history(input);
      requireSemantic(["ACTIVATE", "MIGRATE", "ROLLBACK"].includes(input.action) && hash(input.expectedHeadDigest) && hash(input.destinationDigest), "INVALID");
      requireSemantic(h.headDigest === input.expectedHeadDigest && h.transitions.length < maximumTransitions, "DRIFT");
      let target: Review;
      if (input.action === "MIGRATE") {
        requireSemantic(h.transitions.length > 0, "PERMISSION_DENIED");
        const raw = store.read("reviews", {scope: original.scope, reviewDigest: input.destinationDigest});
        requireSemantic(raw !== undefined, "UNAVAILABLE"); target = storedReview(raw);
        requireSemantic(target.reviewDigest === input.destinationDigest && target.reviewDigest !== h.current.review.reviewDigest, "IDENTITY_CONFLICT");
        sameScope(target, original);
        requireSemantic(same(target, review(await discovery.compatibility({...input, ...selection(target)}))), "DRIFT");
      } else {
        const record = h.records.find(r => r.binding.bindingDigest === input.destinationDigest);
        requireSemantic(record, "UNAVAILABLE");
        requireSemantic(input.action === "ACTIVATE" ? h.transitions.length === 0 : h.transitions.length > 0 && !same(record, h.current), "IDENTITY_CONFLICT");
        target = (await revalidate(record, input)).review;
      }
      stable(input, h.headDigest); requireSemantic(same(original, access(input, true)), "DRIFT");
      const prepared = transitionReview({action: input.action, expectedHeadDigest: input.expectedHeadDigest, destinationDigest: input.destinationDigest}, h.current, target);
      requireSemantic(same(store.put("project-transition-reviews", {scope: original.scope, transitionReviewDigest: prepared.transitionReviewDigest}, prepared), prepared), "DIGEST_MISMATCH");
      return prepared;
    },
    async approveTransition(input: AccessInput & {transitionReviewDigest: string}) {
      input = {...input};
      const original = access(input, true); requireSemantic(hash(input.transitionReviewDigest), "INVALID");
      const raw = store.read("project-transition-reviews", {scope: original.scope, transitionReviewDigest: input.transitionReviewDigest});
      requireSemantic(isRecord(raw), "UNAVAILABLE");
      const {transitionReviewDigest, ...body} = raw;
      requireSemantic(transitionReviewDigest === input.transitionReviewDigest && digestObject(body) === transitionReviewDigest, "DIGEST_MISMATCH");
      const readCommitted = async () => {
        const snapshot = history(input), prior = snapshot.transitions.find(r => r.review.transitionReviewDigest === transitionReviewDigest);
        if (!prior) return undefined;
        requireSemantic(same(prior.decision.principal, original.principal), "IDENTITY_CONFLICT");
        await revalidate(prior.destination, input); stable(input, snapshot.headDigest);
        requireSemantic(same(original, access(input, true)), "DRIFT"); return prior;
      };
      const prior = await readCommitted(); if (prior) return prior;
      const h = history(input);
      try {
        requireSemantic(h.headDigest === raw.expectedHeadDigest && h.transitions.length < maximumTransitions, "DRIFT");
        const prepared = await this.prepareTransition({...input, action: raw.action as TransitionAction,
          expectedHeadDigest: raw.expectedHeadDigest as string, destinationDigest: raw.destinationDigest as string});
        requireSemantic(same(prepared, raw), "DIGEST_MISMATCH");
        const approvedAt = new Date().toISOString();
        const destination = prepared.action === "MIGRATE" ? decisionRecord(prepared.targetReview, original.principal, approvedAt) :
          h.records.find(r => r.binding.bindingDigest === prepared.destinationDigest)!;
        stable(input, h.headDigest); requireSemantic(same(original, access(input, true)), "DRIFT");
        const result = store.put("project-transitions", {scope: original.scope, predecessorDigest: h.headDigest}, transitionRecord(prepared, destination, original.principal, approvedAt));
        const committed = history(input).transitions.find(r => r.review.expectedHeadDigest === h.headDigest)!;
        requireSemantic(same(result, committed) && committed.review.transitionReviewDigest === prepared.transitionReviewDigest &&
          same(committed.decision.principal, original.principal), "IDENTITY_CONFLICT");
        return committed;
      } catch (error) {
        // Inspect an exact concurrent winner without retrying preparation,
        // committing again, or treating a different successor as our decision.
        const committed = await readCommitted(); if (committed) return committed;
        throw error;
      }
    },
    async activation(input: AccessInput) {
      const h = history(input); await revalidate(h.current, input); stable(input, h.headDigest);
      return freeze({schema: "evopilot-project-semantic-activation/v1", headDigest: h.headDigest,
        status: h.transitions.length ? "ACTIVE_FOR_FUTURE_PLANS" : "REVIEWED_DEFAULT", bindingDigest: h.current.binding.bindingDigest,
        transitions: h.transitions, grantsExecutionAuthority: false});
    },
    async inspect(input: AccessInput & {bindingDigest?: string}) {
      if (input.bindingDigest !== undefined) requireSemantic(hash(input.bindingDigest), "INVALID");
      const {h, record} = findRecord(input, input.bindingDigest);
      await revalidate(record, input); stable(input, h.headDigest); return record;
    }
  });
}
