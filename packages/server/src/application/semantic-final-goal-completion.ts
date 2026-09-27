import path from "node:path";
import {normalizeGovernedResource} from "@evopilot/core";
import type {GlobalGoal} from "../model.js";
import type {SemanticTargetCompletion} from "./semantic-goal-completion.js";
import type {SemanticPhaseCompletion} from "./semantic-phase-completion.js";
import type {SemanticExecutionIdentity} from "./semantic-execution-binding.js";
import {semanticProjectAccess, semanticRequestId, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import {createSemanticGovernedSourceReader} from "./semantic-governed-sources.js";
import {createSemanticPermissionSourceReader} from "./semantic-permission-sources.js";
import {GoalRecordStore} from "../storage/goal-record-store.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {SemanticRuntimeSourceStore} from "../storage/semantic-runtime-source.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";

type Input = {identity: SemanticExecutionIdentity; runId: string};
type Access = {currentAccess: () => SemanticDiscoveryAccess; signal?: AbortSignal};
export interface SemanticFinalGoalCompletion extends Input {
  schema: "evopilot-semantic-final-goal-completion/v1";
  goalDigest: string; planDigest: string; policyDigest: string;
  targetReceipts: Array<{targetId: string; receiptDigest: string}>;
  phaseReceipts: Array<{phaseTargetId: string; receiptDigest: string}>;
  previousGoalDigest: string; currentAuthorityDigest: string;
  completedAt: string; completedBy: string; receiptDigest: string;
  goalCompleted: true; releaseAuthorized: false;
}
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
const hash = (v: unknown) => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
const doc = (v: unknown): Record<string, any> => {requireSemantic(isRecord(v), "MATERIAL_INVALID"); return v;};
const ref = (r: SemanticFinalGoalCompletion) => `semantic-goal-completion://${r.receiptDigest.slice(7)}`;

/** Final Goal owner, not a release owner. Reuses verified immutable evidence;
 * an independent current policy must authorize this exact approved Goal/plan.
 * One Goal CAS closes progress; no agent, collector, deployment or publication. */
export function createSemanticFinalGoalCompletionService(dataRoot: string, owners: {
  targetReceipt: (input: Input, access: Access, goal: GlobalGoal) => SemanticTargetCompletion | undefined;
  phaseReceipt: (input: Input & {phaseTargetId: string}, access: Access) => SemanticPhaseCompletion | undefined;
  now?: () => number;
}) {
  const goals = new GoalRecordStore(path.join(dataRoot, "goals")), bindings = new SemanticBindingStore(dataRoot);
  const sources = new SemanticRuntimeSourceStore(dataRoot), governed = createSemanticGovernedSourceReader(dataRoot);
  const now = owners.now ?? Date.now, permissions = createSemanticPermissionSourceReader(dataRoot, now);
  function capture(value: Input) {
    requireSemantic(isRecord(value) && Object.keys(value).sort().join() === "identity,runId" && isRecord(value.identity) &&
      Object.keys(value.identity).sort().join() === "goalId,harnessBindingDigest,projectId,targetId" &&
      [value.runId, value.identity.goalId, value.identity.projectId, value.identity.targetId].every(semanticRequestId) && hash(value.identity.harnessBindingDigest), "INVALID");
    return structuredClone(value);
  }
  function subject(input: Input, access: Access) {
    requireSemantic(!access.signal?.aborted, "CANCELLED"); const s = semanticProjectAccess(input.identity.projectId, access.currentAccess());
    requireSemantic(["operator", "admin"].includes(s.principal.role), "PERMISSION_DENIED"); return s;
  }
  function goal(input: Input, access: Access) {
    const s = subject(input, access); goals.assertSettled(input.identity.goalId); const g = goals.read(input.identity.goalId);
    requireSemantic(g && Object.entries(s.scope).every(([k,v]) => g[k as keyof GlobalGoal] === v), "PERMISSION_DENIED");
    requireSemantic(["RUNNING", "COMPLETED"].includes(g.status) && !g.finalReport, "PERMISSION_DENIED"); return g;
  }
  function proof(input: Input, access: Access, g: GlobalGoal) {
    const required = g.plan.targets.filter(t => t.required), phases = g.plan.phaseTargets;
    requireSemantic(required.length > 0 && g.plan.targets.length <= 64 && new Set(g.plan.targets.map(t=>t.id)).size === g.plan.targets.length &&
      g.plan.targets.every(t => !t.loopId) && phases.length > 0 && phases.length <= 64 &&
      new Set(phases.map(p=>p.id)).size === phases.length && new Set(phases.map(p=>p.phase)).size === phases.length, "MATERIAL_INVALID");
    requireSemantic((g.terminalMaturity === undefined || g.terminalMaturity === "ga") &&
      (g.plan.terminalMaturity === undefined || g.plan.terminalMaturity === "ga") &&
      (!(g.terminalMaturity === "ga" || g.plan.terminalMaturity === "ga") || phases.some(p=>p.phase === "ga")), "TRUST_REQUIRED");
    if (g.plan.decompositionStrategy === "ga-maturity-ladder") {
      const ladder = ["alpha", "beta", "rc", "ga"];
      requireSemantic(phases.length === ladder.length && ladder.every((name,index) => {
        const p = phases.find(p=>p.phase === name); return p && p.dependencyPhase === ladder[index-1];
      }), "TRUST_REQUIRED");
    }
    const targets = required.map(t => {
      const r = g.semanticTargetCompletions?.find(r=>r.identity.targetId === t.id);
      requireSemantic(r && owners.targetReceipt({identity:r.identity,runId:r.runId},access,g), "TRUST_REQUIRED"); return r;
    });
    const phaseProofs = phases.map(p => {
      const r = g.semanticPhaseCompletions?.find(r=>r.phaseTargetId === p.id);
      requireSemantic(r && owners.phaseReceipt({identity:r.identity,runId:r.runId,phaseTargetId:p.id},access), "TRUST_REQUIRED"); return r;
    });
    const anchor = targets.find(r=>r.identity.targetId === input.identity.targetId);
    requireSemantic(anchor && same(anchor.identity,input.identity) && anchor.runId === input.runId, "SCOPE_INVALID");
    const pins = anchor.evidence.runtimeSourcePins, stage = anchor.evidence.stages.at(-1)!;
    requireSemantic(targets.every(r=>r.evidence.runtimeSourcePins.goalDigest === pins.goalDigest && r.evidence.runtimeSourcePins.planDigest === pins.planDigest), "DRIFT");
    const s = subject(input,access), plan = doc(bindings.read(anchor.evidence.stages.length === 1 ? "execution-plans" : "execution-stage-plans",
      {scope:s.scope,identity:input.identity,...(anchor.evidence.stages.length === 1 ? {} : {runId:input.runId,requestDigest:stage.sourceRequestDigest})}));
    const refs = plan.declaration.selections.governed, resourceRef = refs.evidence;
    const resource = normalizeGovernedResource(sources.readGovernedResource(s.scope,"GovernancePack",resourceRef.id,resourceRef.version));
    requireSemantic(resource.digest === resourceRef.digest,"DIGEST_MISMATCH");
    const policy = doc(doc(resource.spec).semanticFinalGoalCompletionPolicy);
    requireSemantic(Object.keys(policy).sort().join() === ["schema","action","scope","goalDigest","planDigest","requiredTargets","requiredPhases","status","validFrom","validUntil"].sort().join() &&
      policy.schema === "evopilot-semantic-final-goal-completion-policy/v1" && policy.action === "COMMIT_VALIDATED_GOAL" &&
      same(policy.scope,{...s.scope,goalId:g.id}) && policy.goalDigest === pins.goalDigest && policy.planDigest === pins.planDigest &&
      same(policy.requiredTargets, targets.map(r=>({targetId:r.identity.targetId,targetDigest:r.evidence.runtimeSourcePins.targetDigest})).sort((a,b)=>a.targetId.localeCompare(b.targetId))) &&
      same(policy.requiredPhases, phaseProofs.map(r=>({phaseTargetId:r.phaseTargetId,phaseDefinitionDigest:r.phaseDefinitionDigest})).sort((a,b)=>a.phaseTargetId.localeCompare(b.phaseTargetId))), "PERMISSION_DENIED");
    return {refs,policy,binding:{goalDigest:pins.goalDigest,planDigest:pins.planDigest,policyDigest:digestObject(policy),
      targetReceipts:targets.map(r=>({targetId:r.identity.targetId,receiptDigest:r.receiptDigest})).sort((a,b)=>a.targetId.localeCompare(b.targetId)),
      phaseReceipts:phaseProofs.map(r=>({phaseTargetId:r.phaseTargetId,receiptDigest:r.receiptDigest})).sort((a,b)=>a.phaseTargetId.localeCompare(b.phaseTargetId))}};
  }
  function verified(input: Input, access: Access, g: GlobalGoal) {
    const r = g.semanticFinalGoalCompletion; if (!r) return undefined;
    const {receiptDigest,...body} = r;
    requireSemantic(r.schema === "evopilot-semantic-final-goal-completion/v1" && hash(receiptDigest) && digestObject(body) === receiptDigest &&
      same(r.identity,input.identity) && r.runId === input.runId && hash(r.previousGoalDigest) && hash(r.currentAuthorityDigest) &&
      typeof r.completedBy === "string" && r.completedBy.length > 0 && Number.isFinite(Date.parse(r.completedAt)) && r.goalCompleted === true && r.releaseAuthorized === false &&
      g.status === "COMPLETED" && g.timeline.some(e=>e.type === "COMPLETED" && e.message === ref(r)), "DIGEST_MISMATCH");
    for (const [key,value] of Object.entries(proof(input,access,g).binding)) requireSemantic(same(r[key as keyof typeof r],value),"DRIFT");
    return freeze(structuredClone(r));
  }
  function receipt(value: Input, access: Access) {
    const input = capture(value), s = subject(input,access), g = goal(input,access), r = verified(input,access,g);
    requireSemantic(same(subject(input,access),s),"DRIFT"); goals.assertSettled(g.id); requireSemantic(same(goals.read(g.id),g),"DRIFT"); return r;
  }
  return Object.freeze({receipt, commit(value: Input, access: Access) {
    const input = capture(value), prior = receipt(input,access); if (prior) return prior;
    const s = subject(input,access), g = goal(input,access);
    requireSemantic(g.status === "RUNNING" && g.timeline.length < 4096,"PERMISSION_DENIED");
    const a = proof(input,access,g);
    const authority = () => {
      const current = proof(input,access,g), p = current.policy;
      requireSemantic(same(current,a) && p.status === "ACTIVE" && typeof p.validFrom === "string" && typeof p.validUntil === "string" &&
        Date.parse(p.validFrom) <= now() && now() < Date.parse(p.validUntil),"PERMISSION_DENIED");
      return {pins:governed.read(current.refs,s.scope),permission:permissions.read({projectId:g.projectId,
        refs:{policy:current.refs.policy,authority:current.refs.authority},currentAccess:access.currentAccess})};
    };
    const initial = authority(), body = {schema:"evopilot-semantic-final-goal-completion/v1" as const,...input,...a.binding,
      previousGoalDigest:digestObject(g),currentAuthorityDigest:digestObject(initial),completedAt:new Date(now()).toISOString(),completedBy:s.principal.id,
      goalCompleted:true as const,releaseAuthorized:false as const};
    const result = freeze({...body,receiptDigest:digestObject(body)});
    const next: GlobalGoal = {...g,status:"COMPLETED",updatedAt:result.completedAt,semanticFinalGoalCompletion:result,
      timeline:[...g.timeline,{timestamp:result.completedAt,type:"COMPLETED",message:ref(result)}]};
    requireSemantic(same(subject(input,access),s) && same(authority(),initial),"DRIFT");
    goals.assertSettled(g.id); requireSemantic(!access.signal?.aborted && same(goals.read(g.id),g),"DRIFT");
    goals.write(next,g); return receipt(input,access)!;
  }});
}
