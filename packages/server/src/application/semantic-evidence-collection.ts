import {randomUUID} from "node:crypto";
import {assertAgentExecutionResultV1Alpha1, type EvoPilotAgentExecutionResultV1Alpha1} from "@evopilot/contracts";
import {createSemanticExecutionBindingService} from "./semantic-execution-binding.js";
import {createSemanticExecutionContextService} from "./semantic-execution-context.js";
import {createSemanticOutcomeReviewService} from "./semantic-outcome-review.js";
import {semanticAgentRequest} from "./semantic-execution-transport.js";
import {createSemanticGovernedSourceReader} from "./semantic-governed-sources.js";
import {SemanticRuntimeSourceStore} from "../storage/semantic-runtime-source.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {semanticProjectAccess} from "./project-semantic-discovery.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {MAX_SEMANTIC_COLLECTED_OBSERVATIONS} from "../domains/harness-template/semantic-evidence-limits.js";

type Bound = Awaited<ReturnType<ReturnType<typeof createSemanticExecutionBindingService>["inspect"]>>;
type Input = Parameters<ReturnType<typeof createSemanticExecutionContextService>["resolve"]>[0];
type Owners = Parameters<typeof createSemanticExecutionContextService>[1];
export interface SemanticEvidenceCollectorDescriptor {
  id: string; implementationDigest: string; qualificationDigest: string;
  origin: "SYNTHETIC" | "INDEPENDENT"; mode: "READ_ONLY"; kinds: string[];
}
export interface SemanticEvidenceCollector {
  descriptor: SemanticEvidenceCollectorDescriptor;
  /** Trusted server configuration, never supplied through a request or Pack.
   * No shell, URL or credential resolution is performed by the collection owner.
   * Qualification/independence is an operator trust decision, not proved by hash.
   */
  collect(request: Readonly<CollectionRequest>, signal: AbortSignal): Promise<unknown>;
}
type Correlation = {scope: Bound["scope"] & {goalId: string; targetId: string}; runId: string; sourceRequestDigest: string;
  requestDigest: string; executionBindingDigest: string; resultDigest: string; evidenceContractDigest: string;
  outcomePlanDigest: string; outcomeReviewDigest: string; outcomeDecisionDigest: string};
interface CollectionRequest extends Correlation {
  schema: "evopilot-semantic-collection-request/v1"; collector: SemanticEvidenceCollectorDescriptor;
  selectors: Array<{kind: string; path: string[]}>; collectionRequestDigest: string;
}
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
const hash = (v: unknown): v is string => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
function exact(v: unknown, keys: string[]): asserts v is Record<string, any> {
  requireSemantic(isRecord(v) && Object.keys(v).sort().join() === [...keys].sort().join(), "MATERIAL_INVALID");
}
function descriptor(value: unknown): SemanticEvidenceCollectorDescriptor {
  exact(value, ["id", "implementationDigest", "qualificationDigest", "origin", "mode", "kinds"]);
  requireSemantic(id(value.id) && hash(value.implementationDigest) && hash(value.qualificationDigest) &&
    ["SYNTHETIC", "INDEPENDENT"].includes(value.origin) && value.mode === "READ_ONLY" && Array.isArray(value.kinds) &&
    value.kinds.length > 0 && value.kinds.length <= MAX_SEMANTIC_COLLECTED_OBSERVATIONS && value.kinds.every((v: unknown) => id(v) && v !== "agent-process") &&
    new Set(value.kinds).size === value.kinds.length, "MATERIAL_INVALID");
  return structuredClone(value) as SemanticEvidenceCollectorDescriptor;
}
function currentPolicy(dataRoot: string, bound: Bound, now: number) {
  const pins = bound.governedSourcePins; requireSemantic(pins, "TRUST_REQUIRED");
  const refs = Object.fromEntries(Object.entries(pins.resources).map(([slot, ref]) => [slot, {id: ref.id, version: ref.version, digest: ref.digest}]));
  const current = createSemanticGovernedSourceReader(dataRoot).read(refs as Parameters<ReturnType<typeof createSemanticGovernedSourceReader>["read"]>[0], bound.scope);
  requireSemantic(same(current, pins), "DRIFT");
  const ref = current.resources.evidence;
  requireSemantic(ref.digest === bound.evidenceContractDigest, "DRIFT");
  const resource = new SemanticRuntimeSourceStore(dataRoot).readGovernedResource(bound.scope, ref.kind, ref.id, ref.version);
  requireSemantic(isRecord(resource) && isRecord(resource.spec), "MATERIAL_INVALID");
  const policy = resource.spec.semanticCollectorPolicy;
  exact(policy, ["schema", "scope", "status", "validFrom", "validUntil", "collector"]);
  requireSemantic(policy.schema === "evopilot-semantic-collector-policy/v1" && same(policy.scope, bound.scope) && policy.status === "ACTIVE" &&
    typeof policy.validFrom === "string" && typeof policy.validUntil === "string" &&
    Date.parse(policy.validFrom) <= now && now < Date.parse(policy.validUntil), "PERMISSION_DENIED");
  return {collector: descriptor(policy.collector), policyDigest: digestObject(policy), activationDigest: ref.activationDigest};
}
export function semanticCollectionCorrelation(bound: Bound, runId: string, sourceRequestDigest: string, requestDigest: string,
  resultDigest: string, reviewDigest: unknown, decisionDigest: unknown): Correlation {
  requireSemantic(bound.outcomePlan, "UNAVAILABLE");
  requireSemantic(hash(reviewDigest) && hash(decisionDigest), "DIGEST_MISMATCH");
  return {scope: {...bound.scope, goalId: bound.goalTarget.goalId, targetId: bound.goalTarget.targetId}, runId, sourceRequestDigest, requestDigest,
    executionBindingDigest: bound.bindingDigest, resultDigest, evidenceContractDigest: bound.evidenceContractDigest,
    outcomePlanDigest: bound.outcomePlan.planDigest, outcomeReviewDigest: reviewDigest, outcomeDecisionDigest: decisionDigest};
}
function requestFor(bound: Bound, correlation: Correlation, collector: SemanticEvidenceCollectorDescriptor): CollectionRequest {
  const plan = bound.outcomePlan; requireSemantic(plan, "UNAVAILABLE");
  const selectors = [...plan.business, ...plan.harness].flatMap(rule => [{kind: rule.evidenceKind, path: rule.path},
    ...(rule.predicate.op === "STRING_SET_SUBSET" ? [{kind: rule.predicate.evidenceKind, path: rule.predicate.path}] : [])])
    .filter(item => item.kind !== "agent-process");
  const unique = [...new Map(selectors.map(item => [digestObject(item), item])).values()].sort((a, b) => digestObject(a).localeCompare(digestObject(b)));
  requireSemantic(unique.length > 0 && unique.length <= 256 && unique.every(item => collector.kinds.includes(item.kind)), "PERMISSION_DENIED");
  const body = {schema: "evopilot-semantic-collection-request/v1" as const, ...correlation, collector, selectors: unique};
  return freeze({...body, collectionRequestDigest: digestObject(body)});
}
function observation(value: unknown, request: CollectionRequest, startedAt: number, now: number) {
  exact(value, ["schema", "collectionRequestDigest", "observedAt", "observations"]);
  requireSemantic(Buffer.byteLength(JSON.stringify(value)) <= 196608 && value.schema === "evopilot-semantic-collector-observation/v1" &&
    value.collectionRequestDigest === request.collectionRequestDigest && typeof value.observedAt === "string" &&
    startedAt <= Date.parse(value.observedAt) && Date.parse(value.observedAt) <= now && Array.isArray(value.observations) &&
    value.observations.length > 0 && value.observations.length <= MAX_SEMANTIC_COLLECTED_OBSERVATIONS, "MATERIAL_INVALID");
  const kinds = new Set<string>(); let nodes = 0;
  function facts(v: unknown, depth = 0): void {
    requireSemantic(++nodes <= 4096 && depth <= 16, "MATERIAL_LIMIT");
    if (v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) return;
    if (typeof v === "string") {requireSemantic(v.length <= 1024, "MATERIAL_LIMIT"); return;}
    if (Array.isArray(v)) {requireSemantic(v.length <= 256, "MATERIAL_LIMIT"); v.forEach(x => facts(x, depth + 1)); return;}
    requireSemantic(isRecord(v), "MATERIAL_INVALID");
    for (const [key, child] of Object.entries(v)) {
      requireSemantic(id(key) && !["__proto__", "prototype", "constructor"].includes(key) && !/password|secret|token|apikey|authorization/i.test(key), "PERMISSION_DENIED");
      facts(child, depth + 1);
    }
  }
  for (const item of value.observations) {
    exact(item, ["kind", "facts", "sourceDigests"]);
    requireSemantic(id(item.kind) && request.selectors.some(s => s.kind === item.kind) && !kinds.has(item.kind) && isRecord(item.facts) &&
      Array.isArray(item.sourceDigests) && item.sourceDigests.length > 0 && item.sourceDigests.length <= 16 && item.sourceDigests.every(hash) &&
      new Set(item.sourceDigests).size === item.sourceDigests.length, "MATERIAL_INVALID");
    kinds.add(item.kind); facts(item.facts);
    // Only declared top-level fields can enter Runtime storage. Nested structure
    // remains typed bounded data, never executable code or an authority claim.
    const keys = request.selectors.filter(s => s.kind === item.kind).map(s => s.path[0]);
    requireSemantic(Object.keys(item.facts).every(key => keys.includes(key)), "PERMISSION_DENIED");
  }
  return structuredClone(value) as {schema: string; collectionRequestDigest: string; observedAt: string;
    observations: Array<{kind: string; facts: Record<string, unknown>; sourceDigests: string[]}>};
}
const keyFor = (c: Correlation) => ({scope: {tenantId: c.scope.tenantId, workspaceId: c.scope.workspaceId, projectId: c.scope.projectId}, runId: c.runId, sourceRequestDigest: c.sourceRequestDigest});
export function readSemanticEvidenceCollection(dataRoot: string, bound: Bound, correlation: Correlation, now = Date.now()) {
  const store = new SemanticBindingStore(dataRoot), key = keyFor(correlation), saved = store.read("collections", key);
  if (saved === undefined) return undefined;
  exact(saved, ["schema", "request", "observation", "policy", "startedAt", "status", "authority", "receiptDigest"]);
  const {receiptDigest, ...body} = saved;
  requireSemantic(hash(receiptDigest) && digestObject(body) === receiptDigest && saved.schema === "evopilot-semantic-collection-receipt/v1" &&
    saved.status === "COLLECTED_NOT_COMPLETED" && same(saved.authority, {mayCompleteGoal: false, mayAdvanceLifecycle: false, mayPublish: false}), "DIGEST_MISMATCH");
  const policy = currentPolicy(dataRoot, bound, now), request = requestFor(bound, correlation, policy.collector);
  requireSemantic(same(saved.policy, policy) && same(saved.request, request) && typeof saved.startedAt === "number", "DRIFT");
  const claim = store.read("collection-claims", key);
  requireSemantic(isRecord(claim) && claim.collectionRequestDigest === request.collectionRequestDigest && claim.startedAt === saved.startedAt, "DRIFT");
  const checked = observation(saved.observation, request, saved.startedAt, now);
  return freeze({receiptDigest, origin: policy.collector.origin, observations: checked.observations, requestDigest: request.collectionRequestDigest});
}

export function createSemanticEvidenceCollectionService(configuration: Parameters<typeof createSemanticExecutionContextService>[0],
  owners: Owners & {collector: SemanticEvidenceCollector; now?: () => number}) {
  const bindings = createSemanticExecutionBindingService(configuration, owners), contexts = createSemanticExecutionContextService(configuration, owners);
  const reviews = createSemanticOutcomeReviewService(configuration, owners), store = new SemanticBindingStore(configuration.dataRoot);
  const now = owners.now ?? Date.now, declared = descriptor(owners.collector.descriptor), invoke = owners.collector.collect;
  function summary(receipt: NonNullable<ReturnType<typeof readSemanticEvidenceCollection>>) {
    return freeze({receiptDigest: receipt.receiptDigest, requestDigest: receipt.requestDigest, origin: receipt.origin,
      kinds: receipt.observations.map(item => item.kind), status: "COLLECTED_NOT_COMPLETED" as const,
      authority: {mayCompleteGoal: false, mayAdvanceLifecycle: false, mayPublish: false}});
  }
  return Object.freeze({async collect(input: Input) {
    input = {...input, identity: structuredClone(input.identity)};
    const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(), 30000); timer.unref();
    const signal = input.signal ? AbortSignal.any([input.signal, timeout.signal]) : timeout.signal;
    const check = () => {requireSemantic(!input.signal?.aborted, "CANCELLED"); requireSemantic(!timeout.signal.aborted, "TIMEOUT");};
    const scoped = {...input, signal};
    try {
      check(); const bound = await bindings.inspect(input.identity, {...scoped, checkpoint: "resume"});
      const principal = semanticProjectAccess(input.identity.projectId, input.currentAccess());
      const slice = await contexts.resolve(scoped), review = await reviews.inspect(scoped);
      const pending = owners.lifecycle.readPendingExecution(input.runId, input.requestDigest, {...bound.scope, goalId: input.identity.goalId, targetId: input.identity.targetId});
      const request = semanticAgentRequest(pending, slice), key = {scope: bound.scope, runId: input.runId, sourceRequestDigest: input.requestDigest};
      const receipt = store.read("dispatch-results", key), claim = store.read("dispatch-claims", key);
      requireSemantic(isRecord(receipt) && isRecord(claim) && same(claim.binding, {requestDigest: request.requestDigest,
        executionBindingDigest: bound.bindingDigest, sliceDigest: slice.sliceDigest}), "UNAVAILABLE");
      requireSemantic(receipt.schema === "evopilot-semantic-dispatch-result/v1" && receipt.requestDigest === request.requestDigest &&
        receipt.executionBindingDigest === bound.bindingDigest && receipt.sliceDigest === slice.sliceDigest && receipt.sourceRequestDigest === pending.requestDigest &&
        receipt.requestId === request.id && receipt.adapterProfileDigest === bound.agentRuntime.profileDigest &&
        receipt.status === "RECEIVED_PENDING_DUAL_VALIDATION" && receipt.eligibleForCompletion === false, "DRIFT");
      assertAgentExecutionResultV1Alpha1(receipt.result as EvoPilotAgentExecutionResultV1Alpha1, request);
      const correlation = semanticCollectionCorrelation(bound, input.runId, input.requestDigest, request.requestDigest,
        digestObject(receipt.result), review.review.reviewDigest, review.decision.decisionDigest);
      const policy = currentPolicy(configuration.dataRoot, bound, now()), collectionRequest = requestFor(bound, correlation, declared);
      const validate = async () => {
        check(); requireSemantic(same(declared, policy.collector) && same(descriptor(owners.collector.descriptor), declared) && owners.collector.collect === invoke, "DRIFT");
        await bindings.inspect(input.identity, {...scoped, checkpoint: "resume"}); check();
        requireSemantic(same(review, await reviews.inspect(scoped)) && same(policy, currentPolicy(configuration.dataRoot, bound, now())) &&
          same(receipt, store.read("dispatch-results", key)) && same(principal, semanticProjectAccess(input.identity.projectId, input.currentAccess())), "DRIFT"); check();
      };
      await validate();
      const prior = readSemanticEvidenceCollection(configuration.dataRoot, bound, correlation, now());
      if (prior) {await validate(); return summary(prior);}
      const owned = {collectionRequestDigest: collectionRequest.collectionRequestDigest, startedAt: now(), ownerId: randomUUID()};
      requireSemantic(same(store.put("collection-claims", key, owned), owned), "IDENTITY_CONFLICT");
      check();
      let onAbort: () => void = () => {};
      const aborted = new Promise<never>((_, reject) => {onAbort = () => {try {check();} catch (error) {reject(error);}}; signal.addEventListener("abort", onAbort, {once: true}); if (signal.aborted) onAbort();});
      let value: unknown;
      try {value = await Promise.race([Promise.resolve().then(() => {check(); return invoke.call(owners.collector, collectionRequest, signal);}), aborted]);}
      finally {signal.removeEventListener("abort", onAbort);}
      check(); const observed = observation(value, collectionRequest, owned.startedAt, now()); await validate();
      const body = {schema: "evopilot-semantic-collection-receipt/v1", request: collectionRequest, observation: observed, policy,
        startedAt: owned.startedAt, status: "COLLECTED_NOT_COMPLETED", authority: {mayCompleteGoal: false, mayAdvanceLifecycle: false, mayPublish: false}};
      const record = {...body, receiptDigest: digestObject(body)};
      requireSemantic(same(store.put("collections", key, record), record), "IDENTITY_CONFLICT");
      await validate(); return summary(readSemanticEvidenceCollection(configuration.dataRoot, bound, correlation, now())!);
    } finally {clearTimeout(timer);}
  }});
}
