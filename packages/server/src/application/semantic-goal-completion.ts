import path from "node:path";
import type {GlobalGoal} from "../model.js";
import type {LifecycleService} from "../domains/lifecycle/service.js";
import {GoalRecordStore} from "../storage/goal-record-store.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {SemanticRuntimeSourceStore} from "../storage/semantic-runtime-source.js";
import {createSemanticTerminalEvidenceReader} from "./semantic-terminal-evidence.js";
import {createSemanticHarnessSourceReader} from "./semantic-harness-sources.js";
import {createSemanticCurrentExecutionReader} from "./semantic-current-execution.js";
import {createSemanticExecutionBindingService, type SemanticExecutionIdentity} from "./semantic-execution-binding.js";
import {readSemanticEvidenceCollection, semanticCollectionCorrelation} from "./semantic-evidence-collection.js";
import {semanticProjectAccess, semanticRequestId, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {verifySemanticTargetEvidencePackage} from "./semantic-target-evidence-package.js";
import {createSemanticPhaseCompletionService} from "./semantic-phase-completion.js";
import {createSemanticFinalGoalCompletionService} from "./semantic-final-goal-completion.js";

type Configuration = Parameters<typeof createSemanticHarnessSourceReader>[0] & Parameters<typeof createSemanticCurrentExecutionReader>[0];
type Input = {identity: SemanticExecutionIdentity; runId: string};
type Access = {currentAccess: () => SemanticDiscoveryAccess; signal?: AbortSignal};
type Evidence = ReturnType<ReturnType<typeof createSemanticTerminalEvidenceReader>["read"]>;
export interface SemanticTargetCompletion {
  schema: "evopilot-semantic-target-completion/v1";
  identity: SemanticExecutionIdentity; runId: string;
  scope: {tenantId: string; workspaceId: string; projectId: string; goalId: string; targetId: string};
  evidence: Evidence;
  targetPackage?: ReturnType<typeof verifySemanticTargetEvidencePackage>;
  predecessorPhaseReceiptDigest?: string;
  currentAuthorityDigest: string;
  previousGoalDigest: string;
  completedAt: string; completedBy: string;
  resultingGoalStatus: "RUNNING" | "COMPLETED";
  receiptDigest: string;
}
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
const hash = (v: unknown): v is string => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
function doc(value: unknown): Record<string, any> {requireSemantic(isRecord(value), "UNAVAILABLE"); return value;}
const evidenceRef = (receipt: SemanticTargetCompletion) => `semantic-target-completion://${receipt.receiptDigest.slice(7)}`;

/** Fixed-owner completion behind the scoped public API, never a release decision.
 * Revalidates every historical stage against current owners, then atomically
 * persists Target progress and its receipt in one Goal CAS. No Agent/collector
 * invocation, cross-record transaction or automatic ambiguous-write replay.
 * Phase Targets additionally require typed package proof; GA/phase Goals cannot close until their separate
 * package/release owners are composed, even if a non-phase Target is committed.
 */
export function createSemanticGoalCompletionService(configuration: Configuration, owners: {
  lifecycle: Pick<LifecycleService, "readPendingExecution" | "readPendingRevision" | "readSemanticTerminal">;
  governed: Parameters<typeof createSemanticExecutionBindingService>[1]["governed"];
  implementationDigest: string; now?: () => number;
}) {
  const goals = new GoalRecordStore(path.join(configuration.dataRoot, "goals")), store = new SemanticBindingStore(configuration.dataRoot);
  const sources = new SemanticRuntimeSourceStore(configuration.dataRoot), now = owners.now ?? Date.now;
  const terminal = createSemanticTerminalEvidenceReader(configuration.dataRoot, owners.lifecycle);
  const historical = createSemanticTerminalEvidenceReader(configuration.dataRoot, owners.lifecycle, true);
  const harness = createSemanticHarnessSourceReader(configuration, owners);
  const phases = createSemanticPhaseCompletionService(configuration.dataRoot, {targetReceipt: verifiedReceipt, now});
  const finalGoal = createSemanticFinalGoalCompletionService(configuration.dataRoot, {targetReceipt: verifiedReceipt, phaseReceipt: phases.receipt, now});
  function capture(input: Input) {
    requireSemantic(isRecord(input) && Object.keys(input).sort().join() === "identity,runId" && isRecord(input.identity) &&
      Object.keys(input.identity).sort().join() === "goalId,harnessBindingDigest,projectId,targetId" &&
      [input.runId, input.identity.goalId, input.identity.targetId, input.identity.projectId].every(semanticRequestId) && hash(input.identity.harnessBindingDigest), "INVALID");
    return structuredClone(input);
  }
  function subject(input: Input, access: Access) {
    requireSemantic(!access.signal?.aborted, "CANCELLED");
    const s = semanticProjectAccess(input.identity.projectId, access.currentAccess());
    requireSemantic(["operator", "admin"].includes(s.principal.role), "PERMISSION_DENIED"); return s;
  }
  function goal(input: Input, access: Access) {
    const s = subject(input, access); goals.assertSettled(input.identity.goalId);
    const g = goals.read(input.identity.goalId); goals.assertSettled(input.identity.goalId);
    requireSemantic(g && Object.entries(s.scope).every(([k, v]) => g[k as keyof GlobalGoal] === v), "PERMISSION_DENIED"); return g;
  }
  function verifiedReceipt(input: Input, access: Access, g: GlobalGoal) {
    const records = g.semanticTargetCompletions ?? [];
    requireSemantic(Array.isArray(records) && records.length <= 4096 && new Set(records.map(r => r.identity.targetId)).size === records.length, "MATERIAL_INVALID");
    const r = records.find(r => r.identity.targetId === input.identity.targetId);
    if (!r) return undefined;
    const {receiptDigest, ...body} = r, s = subject(input, access);
    const target = g.plan.targets.find(t => t.id === input.identity.targetId);
    requireSemantic(r.schema === "evopilot-semantic-target-completion/v1" && hash(receiptDigest) && digestObject(body) === receiptDigest &&
      same(r.identity, input.identity) && r.runId === input.runId && same(r.scope, {...s.scope, goalId: g.id, targetId: input.identity.targetId}) &&
      hash(r.currentAuthorityDigest) && hash(r.previousGoalDigest) && typeof r.completedBy === "string" && r.completedBy.length > 0 &&
      Number.isFinite(Date.parse(r.completedAt)) && ["RUNNING", "COMPLETED"].includes(r.resultingGoalStatus) &&
      ["RUNNING", "COMPLETED"].includes(g.status) && target?.status === "DONE" && target.nextAction === "done" &&
      !target.blocker && !target.loopId && target.evidence.includes(evidenceRef(r)), "DIGEST_MISMATCH");
    requireSemantic(same(historical.read(input, access), r.evidence), "DRIFT");
    requireSemantic(target.phase ? same(r.targetPackage, verifySemanticTargetEvidencePackage(configuration.dataRoot, g, r.evidence)) :
      r.targetPackage === undefined, "DRIFT");
    if (!target.phase) requireSemantic(r.predecessorPhaseReceiptDigest === undefined, "DRIFT");
    return freeze(structuredClone(r));
  }
  function receipt(value: Input, access: Access) {
    const input = capture(value), before = goal(input, access), s = subject(input, access);
    const r = verifiedReceipt(input, access, before);
    if (r) requireSemantic(r.predecessorPhaseReceiptDigest === phases.assertPredecessor(before, input.identity.targetId, access), "DRIFT");
    if (r && before.status === "COMPLETED" && before.semanticFinalGoalCompletion) {
      const c = before.semanticFinalGoalCompletion;
      requireSemantic(finalGoal.receipt({identity:c.identity,runId:c.runId},access), "DRIFT");
    } else if (r && before.status === "COMPLETED") {
      requireSemantic(before.terminalMaturity === undefined && before.plan.phaseTargets.length === 0 && !before.finalReport &&
        before.plan.targets.every(t => t.phase === undefined && !t.loopId) &&
        before.semanticTargetCompletions?.some(c => c.resultingGoalStatus === "COMPLETED"), "DRIFT");
      const required = before.plan.targets.filter(t => t.required);
      requireSemantic(required.length > 0, "MATERIAL_INVALID");
      for (const target of required) {
        const other = before.semanticTargetCompletions?.find(c => c.identity.targetId === target.id);
        requireSemantic(other && verifiedReceipt({identity: other.identity, runId: other.runId}, access, before), "DRIFT");
      }
    }
    requireSemantic(same(goal(input, access), before) && same(subject(input, access), s), "DRIFT");
    return r;
  }
  return Object.freeze({receipt, completePhase: phases.commit, phaseReceipt: phases.receipt,
    completeGoal: finalGoal.commit, goalReceipt: finalGoal.receipt,
    assertPredecessor(identity: SemanticExecutionIdentity, access: Access) {
      const input = {identity, runId: "predecessor-check"}, before = goal(input, access);
      const result = phases.assertPredecessor(before, identity.targetId, access);
      requireSemantic(same(goal(input, access), before), "DRIFT"); return result;
    },
    async commit(value: Input, access: Access) {
      const input = capture(value), original = subject(input, access);
      const prior = receipt(input, access); if (prior) return prior; // Historical read only, even after policy expiry.
      const previous = goal(input, access), evidence = terminal.read(input, access);
      // Semantic terminal proof does not replace GA/phase packages or release policy.
      const target = previous.plan.targets.find(t => t.id === input.identity.targetId);
      requireSemantic(!previous.finalReport && target && !target.loopId, "UNSUPPORTED");
      const targetPackage = target.phase ? verifySemanticTargetEvidencePackage(configuration.dataRoot, previous, evidence) : undefined;
      const predecessorPhaseReceiptDigest = phases.assertPredecessor(previous, target.id, access);
      requireSemantic(Array.isArray(previous.timeline) && previous.timeline.length < 4096, "MATERIAL_LIMIT");
      const rootKey = {scope: original.scope, identity: input.identity};
      const checks: Array<() => unknown> = [], initial: unknown[] = [];
      for (let index = 0; index < evidence.stages.length; index++) {
        const stage = evidence.stages[index], proof = owners.lifecycle.readSemanticTerminal(input.runId, evidence.scope).run.semanticStageCompletions![index];
        const plan = doc(store.read(index ? "execution-stage-plans" : "execution-plans", index ?
          {...rootKey, runId: input.runId, requestDigest: proof.sourceRequestDigest} : rootKey));
        requireSemantic(plan.planDigest === stage.planDigest, "DRIFT");
        const declaration = plan.declaration;
        const materialInput = {...declaration, ...access, terminal: true as const};
        const material = await harness.read(materialInput);
        const current = createSemanticCurrentExecutionReader(configuration, {currentAccess: access.currentAccess, now,
          currentSelections: () => declaration.selections,
          currentPlan: () => ({goalTarget: declaration.goalTarget, contextPlan: declaration.contextPlan, outcomePlan: declaration.outcomePlan,
            harness: {...material.material, runtimeDigest: owners.implementationDigest} as any})});
        const currentExecution = (identity: SemanticExecutionIdentity) => {
          requireSemantic(same(identity, input.identity), "DRIFT");
          return {...current(identity), executionStage: {runId: input.runId, requestDigest: proof.sourceRequestDigest,
            ...(index ? {predecessorProofDigest: evidence.stages[index - 1].proofDigest} : {})}};
        };
        const bound = await createSemanticExecutionBindingService(configuration, {governed: owners.governed, currentExecution})
          .inspect(input.identity, {...access, bindingDigest: stage.bindingDigest, checkpoint: "resume"});
        const correlation = semanticCollectionCorrelation(bound, input.runId, proof.sourceRequestDigest, proof.requestDigest,
          proof.resultDigest, proof.outcomeReviewDigest, proof.outcomeDecisionDigest);
        const check = () => {
          const state = currentExecution(input.identity), pins = state.governedSourcePins;
          requireSemantic(pins, "TRUST_REQUIRED");
          const ref = pins.resources.evidence;
          const resource = doc(sources.readGovernedResource(original.scope, ref.kind, ref.id, ref.version));
          const policy = doc(doc(resource.spec).semanticGoalCompletionPolicy);
          const policyKeys = ["action", "goalCompletion", "schema", "scope", "status", "validFrom", "validUntil",
            ...(targetPackage ? ["phaseTargetCompletion"] : [])];
          requireSemantic(Object.keys(policy).sort().join() === policyKeys.sort().join() &&
            policy.schema === "evopilot-semantic-goal-completion-policy/v1" && policy.action === "COMMIT_VALIDATED_TARGET" &&
            policy.goalCompletion === "ALL_REQUIRED_SEMANTIC_TARGETS_DONE" && policy.status === "ACTIVE" && same(policy.scope, evidence.scope) &&
            (!targetPackage || policy.phaseTargetCompletion === "VERIFIED_TARGET_EVIDENCE_PACKAGE") &&
            typeof policy.validFrom === "string" && typeof policy.validUntil === "string" &&
            Date.parse(policy.validFrom) <= now() && now() < Date.parse(policy.validUntil), "PERMISSION_DENIED");
          const collection = readSemanticEvidenceCollection(configuration.dataRoot, bound, correlation, now());
          requireSemantic(collection?.origin === "INDEPENDENT" && collection.receiptDigest === stage.collectionReceiptDigest, "TRUST_REQUIRED");
          return {state, policyDigest: digestObject(policy), collection};
        };
        initial.push(check()); checks.push(check);
        requireSemantic(same(material, await harness.read(materialInput)), "DRIFT");
      }
      // Prior required completions are historical receipts, not arbitrary DONE flags.
      const records = previous.semanticTargetCompletions ?? [];
      for (const dependencyId of target.dependencyIds) {
        const dependency = records.find(r => r.identity.targetId === dependencyId);
        requireSemantic(dependency && verifiedReceipt({identity: dependency.identity, runId: dependency.runId}, access, previous), "TRUST_REQUIRED");
      }
      const required = previous.plan.targets.filter(t => t.required);
      requireSemantic(required.length > 0 && records.length < 4096, "MATERIAL_LIMIT");
      let closesGoal = previous.terminalMaturity === undefined && previous.plan.phaseTargets.length === 0 &&
        previous.plan.targets.every(t => t.phase === undefined && !t.loopId);
      for (const target of required) if (target.id !== input.identity.targetId) {
        if (target.status !== "DONE") {closesGoal = false; continue;}
        const r = records.find(r => r.identity.targetId === target.id);
        requireSemantic(r && verifiedReceipt({identity: r.identity, runId: r.runId}, access, previous), "DRIFT");
      }
      const resultingGoalStatus = closesGoal ? "COMPLETED" as const : "RUNNING" as const;
      const body = {schema: "evopilot-semantic-target-completion/v1" as const, ...input, scope: evidence.scope, evidence,
        ...(targetPackage ? {targetPackage} : {}),
        ...(predecessorPhaseReceiptDigest ? {predecessorPhaseReceiptDigest} : {}),
        currentAuthorityDigest: digestObject(initial), previousGoalDigest: digestObject(previous), completedAt: new Date(now()).toISOString(),
        completedBy: original.principal.id, resultingGoalStatus};
      const committed = freeze({...body, receiptDigest: digestObject(body)});
      const completed: GlobalGoal = {...previous, status: resultingGoalStatus, updatedAt: body.completedAt,
        semanticTargetCompletions: [...records, committed], plan: {...previous.plan, targets: previous.plan.targets.map(target =>
          target.id === input.identity.targetId ? {...target, status: "DONE", nextAction: "done", blocker: undefined,
            evidence: [...target.evidence, evidenceRef(committed)], updatedAt: body.completedAt} : target)},
        timeline: [...previous.timeline, {timestamp: body.completedAt, type: closesGoal ? "COMPLETED" : "TARGET_ADVANCED",
          targetId: input.identity.targetId, message: evidenceRef(committed)}]};
      const next = phases.progress(completed, access, body.completedAt);
      // No await or callbacks after these final reads and before the shared CAS.
      requireSemantic(same(subject(input, access), original) && same(terminal.read(input, access), evidence), "DRIFT");
      requireSemantic(same(checks.map(check => check()), initial), "DRIFT");
      requireSemantic(phases.assertPredecessor(previous, target.id, access) === predecessorPhaseReceiptDigest, "DRIFT");
      // Read the final Goal revision directly: no access callback may mutate an
      // already checked authority source after the final owner checks.
      goals.assertSettled(input.identity.goalId);
      requireSemantic(!access.signal?.aborted, "CANCELLED");
      requireSemantic(same(goals.read(input.identity.goalId), previous), "DRIFT");
      goals.write(next, previous);
      return receipt(input, access)!;
    }
  });
}
