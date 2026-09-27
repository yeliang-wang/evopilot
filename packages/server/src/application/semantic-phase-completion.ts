import path from "node:path";
import {normalizeGovernedResource} from "@evopilot/core";
import type {GlobalGoal, PhaseTarget} from "../model.js";
import type {SemanticTargetCompletion} from "./semantic-goal-completion.js";
import type {SemanticExecutionIdentity} from "./semantic-execution-binding.js";
import {semanticPhaseDefinition} from "./semantic-runtime-sources.js";
import {semanticProjectAccess, semanticRequestId, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import {createSemanticGovernedSourceReader} from "./semantic-governed-sources.js";
import {createSemanticPermissionSourceReader} from "./semantic-permission-sources.js";
import {GoalRecordStore} from "../storage/goal-record-store.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {SemanticRuntimeSourceStore} from "../storage/semantic-runtime-source.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";

type Access = {currentAccess: () => SemanticDiscoveryAccess; signal?: AbortSignal};
type TargetInput = {identity: SemanticExecutionIdentity; runId: string};
export type SemanticPhaseInput = TargetInput & {phaseTargetId: string};
export interface SemanticPhaseCompletion extends SemanticPhaseInput {
  schema: "evopilot-semantic-phase-completion/v1";
  packageDigest: string; policyDigest: string; phaseDefinitionDigest: string;
  targetReceipts: Array<{targetId: string; receiptDigest: string}>;
  predecessorReceiptDigest?: string; previousGoalDigest: string; currentAuthorityDigest: string;
  completedAt: string; completedBy: string; receiptDigest: string;
  goalCompleted: false; releaseAuthorized: false;
}
const same = (a: unknown, b: unknown) => a === b || (a !== undefined && b !== undefined && digestObject(a) === digestObject(b));
const hash = (v: unknown) => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
const doc = (v: unknown): Record<string, any> => {requireSemantic(isRecord(v), "MATERIAL_INVALID"); return v;};
function exact(v: unknown, fields: string[]) {
  const r = doc(v); requireSemantic(Object.keys(r).sort().join() === fields.sort().join(), "MATERIAL_INVALID"); return r;
}
function strings(v: unknown): v is string[] {
  return Array.isArray(v) && v.length <= 64 && new Set(v).size === v.length && v.every(s => typeof s === "string" && s.trim().length > 0 && s.length <= 8192);
}
const ref = (r: SemanticPhaseCompletion) => `semantic-phase-completion://${r.receiptDigest.slice(7)}`;

/** Aggregate phase owner. Completed Target receipts are historical evidence;
 * a separate current scoped phase policy authorizes one Goal CAS. No dispatch,
 * collector invocation, Goal/GA final report or release decision is produced. */
export function createSemanticPhaseCompletionService(dataRoot: string, owners: {
  targetReceipt: (input: TargetInput, access: Access, goal: GlobalGoal) => SemanticTargetCompletion | undefined;
  now?: () => number;
}) {
  const goals = new GoalRecordStore(path.join(dataRoot, "goals")), bindings = new SemanticBindingStore(dataRoot);
  const sources = new SemanticRuntimeSourceStore(dataRoot), governed = createSemanticGovernedSourceReader(dataRoot);
  const now = owners.now ?? Date.now, permissions = createSemanticPermissionSourceReader(dataRoot, now);
  function subject(projectId: string, access: Access) {
    requireSemantic(!access.signal?.aborted, "CANCELLED");
    const s = semanticProjectAccess(projectId, access.currentAccess());
    requireSemantic(["operator", "admin"].includes(s.principal.role), "PERMISSION_DENIED"); return s;
  }
  function goal(input: TargetInput, access: Access) {
    const s = subject(input.identity.projectId, access), g = goals.read(input.identity.goalId);
    requireSemantic(g && Object.entries(s.scope).every(([k,v]) => g[k as keyof GlobalGoal] === v), "PERMISSION_DENIED");
    goals.assertSettled(g.id); requireSemantic(["RUNNING", "COMPLETED"].includes(g.status) && !g.finalReport, "PERMISSION_DENIED"); return g;
  }
  function capture(value: SemanticPhaseInput) {
    exact(value, ["identity", "runId", "phaseTargetId"]); exact(value.identity, ["projectId", "goalId", "targetId", "harnessBindingDigest"]);
    requireSemantic([value.runId, value.phaseTargetId, value.identity.projectId, value.identity.goalId, value.identity.targetId].every(semanticRequestId) &&
      hash(value.identity.harnessBindingDigest), "INVALID"); return structuredClone(value);
  }
  function phase(g: GlobalGoal, id: string): PhaseTarget {
    const phases = g.plan.phaseTargets;
    requireSemantic(Array.isArray(phases) && phases.length > 0 && phases.length <= 64 && new Set(phases.map(p => p.id)).size === phases.length &&
      new Set(phases.map(p => p.phase)).size === phases.length, "MATERIAL_INVALID");
    const p = phases.find(p => p.id === id); requireSemantic(p && p.schema === "evopilot-phase-target/v1" && p.goalId === g.id &&
      ["alpha", "beta", "rc", "ga"].includes(p.phase) && strings(p.goalTargetIds) && p.goalTargetIds.length > 0 &&
      strings(p.acceptanceCriteria) && p.acceptanceCriteria.length > 0 && strings(p.requiredEvidence) && strings(p.reviewCapabilities) && strings(p.packageOutputs) &&
      (p.dependencyPhase === undefined || ["alpha", "beta", "rc", "ga"].includes(p.dependencyPhase)), "MATERIAL_INVALID");
    requireSemantic(same([...p.goalTargetIds].sort(), g.plan.targets.filter(t => t.phase === p.phase).map(t => t.id).sort()), "SCOPE_INVALID"); return p;
  }
  function assemble(input: SemanticPhaseInput, access: Access, g: GlobalGoal) {
    const p = phase(g, input.phaseTargetId), definitionDigest = digestObject(semanticPhaseDefinition(p));
    const s = subject(g.projectId, access), scope = {...s.scope, goalId: g.id, phaseTargetId: p.id};
    const targets = g.plan.targets.filter(t => p.goalTargetIds.includes(t.id) && t.required);
    requireSemantic(targets.length > 0 && targets.length <= 64 && targets.some(t => t.id === input.identity.targetId), "MATERIAL_INVALID");
    const receipts = targets.map(t => {
      const r = g.semanticTargetCompletions?.find(r => r.identity.targetId === t.id);
      requireSemantic(r && owners.targetReceipt({identity: r.identity, runId: r.runId}, access, g) && r.targetPackage?.phaseTargetId === p.id, "TRUST_REQUIRED"); return r;
    });
    const anchor = receipts.find(r => r.identity.targetId === input.identity.targetId)!;
    requireSemantic(same(anchor.identity, input.identity) && anchor.runId === input.runId, "SCOPE_INVALID");
    const stage = anchor.evidence.stages.at(-1)!;
    const key = {scope: s.scope, runId: input.runId, sourceRequestDigest: stage.sourceRequestDigest};
    const collection = doc(bindings.read("collections", key));
    const observations = doc(collection.observation).observations; requireSemantic(Array.isArray(observations), "MATERIAL_INVALID");
    const observed = observations.find((o: any) => o.kind === "phase-package"); requireSemantic(observed, "UNAVAILABLE");
    const pack = exact(exact(observed.facts, ["package"]).package,
      ["schema", "scope", "phaseDefinitionDigest", "criteria", "evidence", "reviews", "outputs"]);
    requireSemantic(pack.schema === "evopilot-semantic-phase-package/v1" && same(pack.scope, scope) && pack.phaseDefinitionDigest === definitionDigest, "DRIFT");
    const plan = doc(bindings.read(anchor.evidence.stages.length === 1 ? "execution-plans" : "execution-stage-plans",
      {scope: s.scope, identity: input.identity, ...(anchor.evidence.stages.length === 1 ? {} : {runId: input.runId, requestDigest: stage.sourceRequestDigest})}));
    const refs = plan.declaration.selections.governed, resourceRef = refs.evidence;
    const resource = normalizeGovernedResource(sources.readGovernedResource(s.scope, "GovernancePack", resourceRef.id, resourceRef.version));
    requireSemantic(resource.digest === resourceRef.digest, "DIGEST_MISMATCH");
    const policy = exact(doc(resource.spec).semanticPhaseCompletionPolicy,
      ["schema", "action", "scope", "status", "validFrom", "validUntil", "phaseDefinitionDigest", "criteriaCoverage"]);
    requireSemantic(policy.schema === "evopilot-semantic-phase-completion-policy/v1" && policy.action === "COMMIT_VALIDATED_PHASE" &&
      same(policy.scope, scope) && policy.phaseDefinitionDigest === definitionDigest && same(policy.criteriaCoverage, pack.criteria), "PERMISSION_DENIED");
    requireSemantic(Array.isArray(pack.criteria) && pack.criteria.length === p.acceptanceCriteria.length && pack.criteria.every(isRecord) &&
      new Set(pack.criteria.map(c => c.criterionDigest)).size === pack.criteria.length, "MATERIAL_INVALID");
    for (const c of pack.criteria) {
      exact(c, ["criterionDigest", "targetId", "targetCriterionDigest"]);
      const r = receipts.find(r => r.identity.targetId === c.targetId), t = targets.find(t => t.id === c.targetId);
      requireSemantic(r && t && p.acceptanceCriteria.some((text, index) => c.criterionDigest === digestObject({phaseDefinitionDigest: definitionDigest, index, text})) &&
        t.acceptanceCriteria.some((text, index) => c.targetCriterionDigest === digestObject({targetDigest: r.evidence.runtimeSourcePins.targetDigest, index, text})), "TRUST_REQUIRED");
    }
    function observedRefs(value: unknown, wanted: string[]) {
      requireSemantic(Array.isArray(value) && value.length === wanted.length && value.every(isRecord) && new Set(value.map(v => v.kind)).size === wanted.length, "MATERIAL_INVALID");
      for (const item of value) {
        exact(item, ["kind", "sourceDigests"]); const source = observations.find((o: any) => o.kind === item.kind);
        requireSemantic(wanted.some(k => k === item.kind) && source && strings(item.sourceDigests) && item.sourceDigests.length > 0 &&
          item.sourceDigests.every(hash) && same(item.sourceDigests, source.sourceDigests), "TRUST_REQUIRED");
      }
    }
    observedRefs(pack.evidence, p.requiredEvidence); observedRefs(pack.outputs, p.packageOutputs);
    requireSemantic(Array.isArray(pack.reviews) && pack.reviews.length === p.reviewCapabilities.length && pack.reviews.every(isRecord) &&
      new Set(pack.reviews.map(r => r.capability)).size === pack.reviews.length, "MATERIAL_INVALID");
    for (const r of pack.reviews) {
      exact(r, ["capability", "status", "evidenceKinds"]);
      requireSemantic(p.reviewCapabilities.some(c => c === r.capability) && r.status === "PASSED" && strings(r.evidenceKinds) &&
        r.evidenceKinds.length > 0 && r.evidenceKinds.every(k => p.requiredEvidence.includes(k)), "TRUST_REQUIRED");
    }
    return {scope, refs, policy, binding: {packageDigest: digestObject(pack), policyDigest: digestObject(policy), phaseDefinitionDigest: definitionDigest,
      targetReceipts: receipts.map(r => ({targetId: r.identity.targetId, receiptDigest: r.receiptDigest})).sort((a,b) => a.targetId.localeCompare(b.targetId))}};
  }
  function verified(input: SemanticPhaseInput, access: Access, g: GlobalGoal, seen = new Set<string>()): SemanticPhaseCompletion | undefined {
    requireSemantic(!seen.has(input.phaseTargetId) && seen.size < 64, "MATERIAL_INVALID"); seen.add(input.phaseTargetId);
    const records = g.semanticPhaseCompletions ?? [];
    requireSemantic(Array.isArray(records) && records.length <= 64 && new Set(records.map(r => r.phaseTargetId)).size === records.length, "MATERIAL_INVALID");
    const r = records.find(r => r.phaseTargetId === input.phaseTargetId); if (!r) return undefined;
    const p = phase(g, input.phaseTargetId), {receiptDigest, ...body} = r;
    requireSemantic(r.schema === "evopilot-semantic-phase-completion/v1" && hash(receiptDigest) && receiptDigest === digestObject(body) &&
      same(r.identity, input.identity) && r.runId === input.runId && hash(r.previousGoalDigest) && hash(r.currentAuthorityDigest) &&
      Number.isFinite(Date.parse(r.completedAt)) && typeof r.completedBy === "string" && r.completedBy.length > 0 &&
      r.goalCompleted === false && r.releaseAuthorized === false && p.status === "PASSED" && p.decision.status === "GO" && p.decision.evidence.includes(ref(r)), "DIGEST_MISMATCH");
    const a = assemble(input, access, g);
    for (const [key, value] of Object.entries(a.binding)) requireSemantic(same(r[key as keyof typeof r], value), "DRIFT");
    const predecessor = predecessorReceipt(g, p, access, seen);
    requireSemantic(a.binding.targetReceipts.every(t => g.semanticTargetCompletions?.find(v => v.identity.targetId === t.targetId)?.predecessorPhaseReceiptDigest === predecessor?.receiptDigest), "DRIFT");
    requireSemantic(r.predecessorReceiptDigest === predecessor?.receiptDigest, "DRIFT"); return freeze(structuredClone(r));
  }
  function predecessorReceipt(g: GlobalGoal, p: PhaseTarget, access: Access, seen = new Set<string>()) {
    if (p.dependencyPhase === undefined) return undefined;
    const previous = g.plan.phaseTargets.find(v => v.phase === p.dependencyPhase);
    const r = g.semanticPhaseCompletions?.find(r => r.phaseTargetId === previous?.id);
    requireSemantic(previous && r, "TRUST_REQUIRED");
    const checked = verified({identity: r.identity, runId: r.runId, phaseTargetId: r.phaseTargetId}, access, g, seen);
    requireSemantic(checked, "TRUST_REQUIRED"); return checked;
  }
  function receipt(value: SemanticPhaseInput, access: Access) {
    const input = capture(value), s = subject(input.identity.projectId, access), g = goal(input, access), result = verified(input, access, g);
    requireSemantic(same(subject(input.identity.projectId, access), s) && same(goal(input, access), g), "DRIFT"); return result;
  }
  return Object.freeze({receipt,
    assertPredecessor(g: GlobalGoal, targetId: string, access: Access) {
      const t = g.plan.targets.find(t => t.id === targetId); requireSemantic(t, "UNAVAILABLE");
      if (t.phase === undefined) return undefined;
      const candidates = g.plan.phaseTargets.filter(p => p.phase === t.phase && p.goalTargetIds?.includes(targetId));
      requireSemantic(candidates.length === 1, "MATERIAL_INVALID");
      return predecessorReceipt(g, phase(g, candidates[0].id), access)?.receiptDigest;
    },
    commit(value: SemanticPhaseInput, access: Access) {
      const input = capture(value), prior = receipt(input, access); if (prior) return prior;
      const s = subject(input.identity.projectId, access), g = goal(input, access), p = phase(g, input.phaseTargetId);
      requireSemantic(g.status === "RUNNING" && g.timeline.length < 4096, "MATERIAL_LIMIT");
      const a = assemble(input, access, g), predecessor = predecessorReceipt(g, p, access);
      requireSemantic(a.binding.targetReceipts.every(t => g.semanticTargetCompletions?.find(v => v.identity.targetId === t.targetId)?.predecessorPhaseReceiptDigest === predecessor?.receiptDigest), "DRIFT");
      const authority = () => {
        const current = assemble(input, access, g), policy = current.policy;
        requireSemantic(same(current, a) && policy.status === "ACTIVE" && typeof policy.validFrom === "string" && typeof policy.validUntil === "string" &&
          Date.parse(policy.validFrom) <= now() && now() < Date.parse(policy.validUntil), "PERMISSION_DENIED");
        const pins = governed.read(current.refs, s.scope), permission = permissions.read({projectId: g.projectId,
          refs: {policy: current.refs.policy, authority: current.refs.authority}, currentAccess: access.currentAccess});
        return {pins, permission};
      };
      const initial = authority(), body = {schema: "evopilot-semantic-phase-completion/v1" as const, ...input, ...a.binding,
        ...(predecessor ? {predecessorReceiptDigest: predecessor.receiptDigest} : {}), previousGoalDigest: digestObject(g), currentAuthorityDigest: digestObject(initial),
        completedBy: s.principal.id, completedAt: new Date(now()).toISOString(), goalCompleted: false as const, releaseAuthorized: false as const};
      const result = freeze({...body, receiptDigest: digestObject(body)});
      const next: GlobalGoal = {...g, updatedAt: result.completedAt, semanticPhaseCompletions: [...(g.semanticPhaseCompletions ?? []), result],
        plan: {...g.plan, phaseTargets: g.plan.phaseTargets.map(v => v.id !== p.id ? v : {...v, status: "PASSED", updatedAt: result.completedAt,
          decision: {status: "GO", rationale: "Verified semantic phase package; no Goal/GA or Release decision", evidence: [ref(result)]}})},
        timeline: [...g.timeline, {timestamp: result.completedAt, type: "TARGET_ADVANCED", message: ref(result)}]};
      requireSemantic(same(subject(g.projectId, access), s) && same(authority(), initial), "DRIFT");
      requireSemantic(same(predecessorReceipt(g, p, access), predecessor), "DRIFT");
      goals.assertSettled(g.id); requireSemantic(!access.signal?.aborted && same(goals.read(g.id), g), "DRIFT");
      goals.write(next, g); return receipt(input, access)!;
    }
  });
}
