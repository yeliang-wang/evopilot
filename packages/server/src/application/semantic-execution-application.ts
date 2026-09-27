import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import type {EvoPilotLifecycleExecutorAdapterV1} from "@evopilot/contracts";
import type {LifecycleService} from "../domains/lifecycle/service.js";
import {createSemanticExecutionPlanService} from "./semantic-execution-plan.js";
import {createSemanticExecutionAuthoring} from "./semantic-execution-authoring.js";
import {createSemanticHarnessSourceReader} from "./semantic-harness-sources.js";
import {createSemanticGovernedSourceReader} from "./semantic-governed-sources.js";
import {createSemanticExecutorSourceReader} from "./semantic-executor-sources.js";
import {createSemanticExecutionBindingService, type SemanticExecutionIdentity} from "./semantic-execution-binding.js";
import {createSemanticExecutionContextService} from "./semantic-execution-context.js";
import {createSemanticOutcomeReviewService} from "./semantic-outcome-review.js";
import {createSemanticExecutionTransport} from "./semantic-execution-transport.js";
import {createSemanticExecutionOutcomeService} from "./semantic-execution-outcome.js";
import {createSemanticEvidenceCollectionService, type SemanticEvidenceCollector} from "./semantic-evidence-collection.js";
import {createSemanticStageCompletionService} from "./semantic-stage-completion.js";
import {createSemanticTerminalEvidenceReader} from "./semantic-terminal-evidence.js";
import {createSemanticGoalCompletionService} from "./semantic-goal-completion.js";
import {createSemanticCompletionReport} from "./semantic-completion-report.js";
import {createSemanticGoalViews} from "./semantic-goal-views.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";

// Narrow execution-kernel identity, not a release/package identity or Host
// qualification. Recomputed from these installed module bytes at process start.
export const semanticExecutionImplementationDigest = digestObject([
  "./semantic-execution-application.js", "./semantic-harness-sources.js", "./semantic-execution-plan.js", "./semantic-execution-authoring.js", "./semantic-current-execution.js",
  "./semantic-permission-sources.js", "./semantic-governed-sources.js", "./semantic-executor-sources.js", "./semantic-runtime-sources.js",
  "./semantic-execution-binding.js", "./project-semantic-binding.js", "./semantic-execution-context.js", "./semantic-execution-transport.js", "./semantic-execution-outcome.js",
  "./semantic-outcome-review.js", "./semantic-process-evidence.js", "./semantic-evidence-collection.js", "../storage/semantic-runtime-source.js", "../storage/semantic-binding-store.js",
  "../domains/lifecycle/service.js", "../domains/lifecycle/semantic-stage-grant.js", "../storage/lifecycle-run-store.js", "./semantic-stage-completion.js",
  "./semantic-goal-ownership.js", "../storage/goal-record-store.js", "./semantic-terminal-evidence.js", "../domains/lifecycle/semantic-terminal.js",
  "./semantic-goal-completion.js", "./semantic-completion-report.js", "./semantic-goal-views.js", "./semantic-target-evidence-package.js", "./semantic-phase-completion.js", "./semantic-final-goal-completion.js", "./semantic-execution-usage.js", "./semantic-dispatch-usage.js"
].map(module => ({module, digest: createHash("sha256").update(readFileSync(new URL(module, import.meta.url))).digest("hex")})).concat(
  ["@evopilot/core", "@evopilot/contracts"].map(module => ({module, digest: createHash("sha256").update(readFileSync(new URL(import.meta.resolve(module)))).digest("hex")}))
));

type PlanService = ReturnType<typeof createSemanticExecutionPlanService>;
type Access = Parameters<PlanService["prepare"]>[1];
type Declaration = Parameters<PlanService["prepare"]>[0];
type BoundInput = {identity: SemanticExecutionIdentity; bindingDigest: string};
type Coverage = Parameters<ReturnType<typeof createSemanticOutcomeReviewService>["prepare"]>[0]["coverage"];
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);

/** Fixed application assembly behind the scoped HTTP/CLI/MCP routes.
 * A caller may supply declarations or exact decisions, never current Harness
 * state, permissions, qualifications, a runtime digest or an execution callback.
 * External adapter invocation remains an explicitly configured owner operation.
 */
export function createSemanticExecutionApplication(
  configuration: Parameters<typeof createSemanticExecutionPlanService>[0],
  owners: Omit<Parameters<typeof createSemanticExecutionPlanService>[1], "currentHarness" | "lifecycle"> & {
    lifecycle: Pick<LifecycleService, "readPendingExecution" | "readPendingRevision" | "readPendingObligations" | "read" | "readVerified" | "readSettledVerified" | "readSemanticTerminal" | "commitSemanticStage">;
    adapter?: EvoPilotLifecycleExecutorAdapterV1; collector?: SemanticEvidenceCollector}
) {
  owners = Object.freeze({...owners});
  configuration = Object.freeze({...configuration, ...(configuration.limits ? {limits: Object.freeze({...configuration.limits})} : {}),
    ...(configuration.contextLimits ? {contextLimits: Object.freeze({...configuration.contextLimits})} : {})});
  const materials = createSemanticHarnessSourceReader(configuration, owners);
  const governed = createSemanticGovernedSourceReader(configuration.dataRoot), executor = createSemanticExecutorSourceReader(configuration.dataRoot, owners.now);
  const declarations = createSemanticExecutionPlanService(configuration, {...owners, currentHarness: () => {throw new Error("SEMANTIC_CURRENT_HARNESS_NOT_PREPARED");}});
  async function scoped<T>(value: Declaration, access: Access, operation: (plans: PlanService, executionOwners: {
    governed: typeof owners.governed; lifecycle: typeof owners.lifecycle;
    currentExecution: (identity: SemanticExecutionIdentity) => ReturnType<PlanService["currentExecution"]>
  }) => T | Promise<T>, commitsStage = false, persisted = true) {
    value = structuredClone(value);
    createSemanticGoalCompletionService(configuration, {...owners, implementationDigest: semanticExecutionImplementationDigest}).assertPredecessor(value.identity, access);
    const input = {identity: value.identity, runId: value.runId, requestDigest: value.requestDigest, goalTarget: value.goalTarget, ...access};
    const before = await materials.read(input);
    const plans = createSemanticExecutionPlanService(configuration, {...owners, currentHarness: identity => {
      requireSemantic(same(identity, value.identity), "DRIFT");
      const resources = governed.read(value.selections.governed, before.scope).resources;
      const observation = executor.read(value.selections.executor, identity, before.scope, access.currentAccess().principal?.id ?? "").observation;
      return {...before.material, policyDigest: resources.policy.digest, providerDigest: resources.provider.digest,
        environmentDigest: resources.environment.digest, authorityDigest: resources.authority.digest, evidenceDigest: resources.evidence.digest,
        hostDigest: observation.executor.digest, runtimeDigest: semanticExecutionImplementationDigest};
    }});
    const executionOwners = {governed: owners.governed, lifecycle: owners.lifecycle, currentExecution: (identity: SemanticExecutionIdentity) => plans.currentExecution(identity, access)};
    const result = await operation(plans, executionOwners);
    // The dedicated owner performs fresh synchronous checks and the atomic stage
    // transition. Its successful mutation intentionally consumes the pending
    // request, so a pending-state postcheck would falsely label success as drift.
    if (commitsStage) return result;
    requireSemantic(same(before, await materials.read(input)), "DRIFT");
    // Side effects may already have produced an immutable record/receipt. A final
    // recheck failure must never trigger automatic operation or adapter replay.
    if (persisted) plans.inspect(value.identity, access);
    else await plans.preview(value, access);
    return result;
  }
  function captured(value: BoundInput, extra: string[] = []) {
    requireSemantic(isRecord(value) && Object.keys(value).sort().join() === ["identity", "bindingDigest", ...extra].sort().join() &&
      typeof value.bindingDigest === "string" && /^sha256:[a-f0-9]{64}$/.test(value.bindingDigest), "INVALID");
    return structuredClone(value);
  }
  async function bound<T>(value: BoundInput, access: Access, action: (input: {
    identity: SemanticExecutionIdentity; bindingDigest: string; runId: string; requestDigest: string} & Access,
    executionOwners: Parameters<typeof createSemanticExecutionOutcomeService>[1]) => T | Promise<T>) {
    const declaration = declarations.declaration(value.identity, access);
    return scoped(declaration, access, (_plans, current) => action({...value, ...access,
      runId: declaration.runId, requestDigest: declaration.requestDigest}, current));
  }
  const authoring = createSemanticExecutionAuthoring(configuration, {...owners, planningProject: declarations.planningProject,
    preview: (value, access) => scoped(value, access, plans => plans.preview(value, access), false, false)});
  return Object.freeze({
    planning: authoring.planning,
    draft: authoring.draft,
    completeGoal(input: Parameters<ReturnType<typeof createSemanticGoalCompletionService>["completeGoal"]>[0], access: Access) {
      return createSemanticGoalCompletionService(configuration, {...owners, implementationDigest: semanticExecutionImplementationDigest}).completeGoal(input, access);
    },
    goalReceipt(input: Parameters<ReturnType<typeof createSemanticGoalCompletionService>["goalReceipt"]>[0], access: Access) {
      return createSemanticGoalCompletionService(configuration, {...owners, implementationDigest: semanticExecutionImplementationDigest}).goalReceipt(input, access);
    },
    completePhase(input: Parameters<ReturnType<typeof createSemanticGoalCompletionService>["completePhase"]>[0], access: Access) {
      return createSemanticGoalCompletionService(configuration, {...owners, implementationDigest: semanticExecutionImplementationDigest}).completePhase(input, access);
    },
    phaseReceipt(input: Parameters<ReturnType<typeof createSemanticGoalCompletionService>["phaseReceipt"]>[0], access: Access) {
      return createSemanticGoalCompletionService(configuration, {...owners, implementationDigest: semanticExecutionImplementationDigest}).phaseReceipt(input, access);
    },
    goalViews(goalId: string, access: Parameters<ReturnType<typeof createSemanticGoalViews>["read"]>[1]) {
      const completion = createSemanticGoalCompletionService(configuration, {...owners, implementationDigest: semanticExecutionImplementationDigest});
      return createSemanticGoalViews(configuration.dataRoot, completion, owners.lifecycle).read(goalId, access);
    },
    // Narrow public completion; phase/GA closure and publication are separate.
    completionStatus(input: {identity: SemanticExecutionIdentity; runId: string}, access: Access) {
      const completion = createSemanticGoalCompletionService(configuration, {...owners, implementationDigest: semanticExecutionImplementationDigest});
      return createSemanticCompletionReport(configuration.dataRoot, completion).read(input, access);
    },
    completeTarget(input: {identity: SemanticExecutionIdentity; runId: string}, access: Access) {
      return createSemanticGoalCompletionService(configuration, {...owners, implementationDigest: semanticExecutionImplementationDigest}).commit(input, access);
    },
    completionReceipt(input: {identity: SemanticExecutionIdentity; runId: string}, access: Access) {
      return createSemanticGoalCompletionService(configuration, {...owners, implementationDigest: semanticExecutionImplementationDigest}).receipt(input, access);
    },
    // Internal only. Not in the HTTP/CLI/MCP operation allow-list or capabilities.
    terminalEvidence(input: {identity: SemanticExecutionIdentity; runId: string}, access: Access) {
      return createSemanticTerminalEvidenceReader(configuration.dataRoot, owners.lifecycle).read(input, access);
    },
    commitStage(value: BoundInput, access: Access) {
      value = captured(value); const declaration = declarations.declaration(value.identity, access);
      return scoped(declaration, access, (_plans, current) => createSemanticStageCompletionService(configuration,
        {...current, now: owners.now}).commit({...value, ...access, runId: declaration.runId, requestDigest: declaration.requestDigest}), true);
    },
    stageReceipt(input: BoundInput & {runId: string; requestDigest: string}, access: Access) {
      input = captured(input, ["runId", "requestDigest"]) as typeof input;
      return createSemanticStageCompletionService(configuration, {...owners, currentExecution: () => {throw new Error("HISTORICAL_READBACK_ONLY");}})
        .receipt({...input, ...access});
    },
    prepare(value: Declaration, access: Access) {
      value = structuredClone(value); return scoped(value, access, plans => plans.prepare(value, access));
    },
    inspect(identity: SemanticExecutionIdentity, access: Access) {
      identity = structuredClone(identity); return scoped(declarations.declaration(identity, access), access, plans => plans.inspect(identity, access));
    },
    bind(identity: SemanticExecutionIdentity, access: Access) {
      identity = structuredClone(identity); return scoped(declarations.declaration(identity, access), access,
        (_plans, current) => createSemanticExecutionBindingService(configuration, current).bind(identity, access));
    },
    resolve: (value: BoundInput, access: Access) => bound(captured(value), access, (input, current) => createSemanticExecutionContextService(configuration, current).resolve(input)),
    mapping: (value: BoundInput, access: Access) => bound(captured(value), access, (input, current) => createSemanticOutcomeReviewService(configuration, current).mapping(input)),
    review(value: BoundInput & {coverage: Coverage}, access: Access) {
      value = captured(value, ["coverage"]) as typeof value;
      return bound(value, access, (input, current) => createSemanticOutcomeReviewService(configuration, current).prepare({...input, coverage: value.coverage}));
    },
    approveReview(value: BoundInput & {reviewDigest: string; decision: "APPROVE"}, access: Access) {
      value = captured(value, ["reviewDigest", "decision"]) as typeof value; requireSemantic(value.decision === "APPROVE", "INVALID");
      return bound(value, access, (input, current) => createSemanticOutcomeReviewService(configuration, current).approve({...input, reviewDigest: value.reviewDigest}));
    },
    dispatch(value: BoundInput, access: Access) {
      value = captured(value); requireSemantic(owners.adapter, "UNAVAILABLE");
      return bound(value, access, (input, current) => createSemanticExecutionTransport(configuration, {...current, adapter: owners.adapter!}).execute(input));
    },
    collect(value: BoundInput, access: Access) {
      value = captured(value); requireSemantic(owners.collector, "UNAVAILABLE");
      return bound(value, access, (input, current) => createSemanticEvidenceCollectionService(configuration,
        {...current, collector: owners.collector!, now: owners.now}).collect(input));
    },
    evaluate: (value: BoundInput, access: Access) => bound(captured(value), access, (input, current) => createSemanticExecutionOutcomeService(configuration, {...current, now: owners.now}).evaluate(input))
  });
}
