import path from "node:path";
import type {GlobalGoal, GoalSnapshot, GoalCompletionReport, GoalGraph} from "../model.js";
import {GoalRecordStore} from "../storage/goal-record-store.js";
import {semanticProjectAccess, semanticRequestId, type SemanticDiscoveryAccess} from "./project-semantic-discovery.js";
import {createSemanticCompletionReport} from "./semantic-completion-report.js";
import type {createSemanticGoalCompletionService} from "./semantic-goal-completion.js";
import {blockSemanticGoalTarget} from "./semantic-goal-projection.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {aggregateSemanticUsage} from "./semantic-execution-usage.js";
import {readSemanticDispatchUsage} from "./semantic-dispatch-usage.js";

/** Read-only bridge for existing Goal views. Reads raw owner records, never the
 * legacy hydrator (which supplies a default GA maturity). No mutation, phase
 * package synthesis, release decision or current execution grant is produced. */
export function createSemanticGoalViews(dataRoot: string, completion: Pick<ReturnType<typeof createSemanticGoalCompletionService>, "receipt" | "phaseReceipt" | "goalReceipt">,
  lifecycle: Parameters<typeof readSemanticDispatchUsage>[2]) {
  const goals = new GoalRecordStore(path.join(dataRoot, "goals")), reports = createSemanticCompletionReport(dataRoot, completion);
  return Object.freeze({read(goalId: string, access: {currentAccess: (projectId: string) => SemanticDiscoveryAccess; signal?: AbortSignal}) {
    requireSemantic(semanticRequestId(goalId), "INVALID");
    const goal = goals.read(goalId);
    if (!goal || (goal.semanticExecutionOwners === undefined && goal.semanticTargetCompletions === undefined)) return undefined;
    function subject() {
      requireSemantic(!access.signal?.aborted, "CANCELLED");
      const s = semanticProjectAccess(goal!.projectId, access.currentAccess(goal!.projectId));
      requireSemantic(["operator", "admin"].includes(s.principal.role) &&
        Object.entries(s.scope).every(([k, v]) => goal![k as keyof GlobalGoal] === v), "PERMISSION_DENIED"); return s;
    }
    const original = subject(); goals.assertSettled(goalId);
    const owner = goal.semanticExecutionOwners?.[0]; requireSemantic(owner, "UNAVAILABLE");
    const input = {identity: {projectId: goal.projectId, goalId, targetId: owner.targetId, harnessBindingDigest: owner.harnessBindingDigest}, runId: owner.runId};
    const report = reports.read(input, {currentAccess: () => access.currentAccess(goal.projectId), signal: access.signal});
    requireSemantic(report.goalRevisionDigest === digestObject(goal), "DRIFT");
    const verified = new Set(report.targets.filter(t => t.status === "VERIFIED_DONE").map(t => t.targetId));
    const targets = goal.plan.targets.map(t => verified.has(t.id) ? structuredClone(t) : blockSemanticGoalTarget(t));
    // Only the independent phase owner can establish phase proof. Never inherit
    // a raw GO, arbitrary success Loop, or auto-generated maturity ladder.
    const phases = goal.plan.phaseTargets.map(p => {
      const record = goal.semanticPhaseCompletions?.find(r => r.phaseTargetId === p.id);
      if (record) {
        requireSemantic(completion.phaseReceipt({identity: record.identity, runId: record.runId, phaseTargetId: p.id},
          {currentAccess: () => access.currentAccess(goal.projectId), signal: access.signal}), "DRIFT");
        return structuredClone(p);
      }
      return {...p, status: "BLOCKED" as const,
        decision: {status: "NO-GO" as const, rationale: "PHASE_OR_GA_CLOSURE_PENDING", evidence: [report.reportDigest]}};
    });
    const completed = report.progress.goalCompleted;
    const status = completed ? "COMPLETED" as const : "BLOCKED" as const;
    const projected: GlobalGoal = {...goal, status, finalReport: undefined, plan: {...goal.plan, targets, phaseTargets: phases}};
    const matrix = targets.map(t => ({targetId: t.id, phase: t.phase, title: t.title, required: t.required, status: t.status,
      acceptanceCriteria: t.acceptanceCriteria, requiredEvidence: t.requiredEvidence, reviewCapabilities: t.reviewCapabilities,
      evidence: verified.has(t.id) ? t.evidence.filter(ref => ref.startsWith("semantic-target-completion://")) : [],
      blocker: t.blocker, loopId: undefined}));
    const snapshot: GoalSnapshot = {schema: "evopilot-goal-snapshot/v1", goal: projected, status,
      progress: {totalTargets: targets.length, requiredTargets: report.progress.requiredTargets,
        completedTargets: report.progress.verifiedRequiredTargets, blockedTargets: targets.filter(t => !verified.has(t.id)).length,
        failedTargets: 0, percent: report.progress.targetPercent}, phases,
      nextAction: completed ? "view-final-report" : "repair", blockers: report.blockers,
      evidence: [report.reportDigest, "release=NOT_EVALUATED"], updatedAt: goal.updatedAt};
    const finalReport: GoalCompletionReport | undefined = completed ? {schema: "evopilot-goal-completion-report/v1",
      goalId, projectId: goal.projectId, releaseTargetId: goal.releaseTargetId, objective: goal.objective, status: "COMPLETED",
      generatedAt: goal.updatedAt,
      targetSummary: {total: targets.length, required: report.progress.requiredTargets, done: report.progress.verifiedRequiredTargets,
        blocked: targets.filter(t => !verified.has(t.id)).length, failed: 0},
      phasePackages: phases.map(p => ({schema:"evopilot-phase-package/v1" as const, goalId, projectId:goal.projectId, releaseTargetId:goal.releaseTargetId,
        phase:p.phase,status:p.status,generatedAt:p.updatedAt,
        targetSummary:{total:targets.filter(t=>p.goalTargetIds.includes(t.id)).length,required:targets.filter(t=>p.goalTargetIds.includes(t.id)&&t.required).length,
          done:targets.filter(t=>p.goalTargetIds.includes(t.id)&&verified.has(t.id)).length,blocked:targets.filter(t=>p.goalTargetIds.includes(t.id)&&!verified.has(t.id)).length,failed:0},
        acceptanceCriteria:p.acceptanceCriteria,requiredEvidence:p.requiredEvidence,reviewCapabilities:p.reviewCapabilities,
        evidenceMatrix:matrix.filter(t=>p.goalTargetIds.includes(t.targetId)),targetPackages:[],blockers:[],decision:p.decision,packageOutputs:p.packageOutputs})), evidenceMatrix: matrix,
      conclusion: phases.length ? "Verified Target and phase receipts plus an explicit scoped Goal policy close the approved Goal. Release remains NOT_EVALUATED; no deployment or publication is authorized." :
        "All required non-phase Targets have verified semantic completion receipts. No phase/GA closure or release authorization is asserted."} : undefined;
    const graph: GoalGraph = {schema:"evopilot-goal-graph/v1",goalId,
      nodes:targets.map(t=>({...t,active:false})),
      edges:targets.flatMap(t=>t.dependencyIds.map(id=>({from:id,to:t.id,type:"depends-on" as const}))),nextAction:snapshot.nextAction};
    const usage = aggregateSemanticUsage(goal.plan.targets.map(t=>t.id), [...verified].map(targetId=>{
      const owner = goal.semanticExecutionOwners!.find(o=>o.targetId === targetId)!;
      const receipt = completion.receipt({identity:{...input.identity,targetId,harnessBindingDigest:owner.harnessBindingDigest},runId:owner.runId},
        {currentAccess:()=>access.currentAccess(goal.projectId),signal:access.signal});
      requireSemantic(receipt,"DRIFT");
      return {targetId,receiptDigest:receipt.receiptDigest,stages:receipt.evidence.stages};
    }));
    // Never manufacture legacy Loop/package evidence or equate a verified
    // completed-target subtotal with all dispatch usage or settled billing.
    const runStatus = {schema:"evopilot-semantic-goal-run-status/v1",scope:original.scope,goal:projected,status,
      nextAction:snapshot.nextAction,snapshot,graph,timeline:goal.timeline,evidenceMatrix:matrix,finalReport,
      semanticCompletion:report,phaseReceipts:phases.filter(p=>p.status === "PASSED").map(p=>({phaseTargetId:p.id,
        receiptDigest:goal.semanticPhaseCompletions!.find(r=>r.phaseTargetId === p.id)!.receiptDigest})),
      targetReceipts:report.targets.filter(t=>t.status === "VERIFIED_DONE").map(t=>({targetId:t.targetId,receiptDigest:t.receiptDigest})),
      goalReceipt:goal.semanticFinalGoalCompletion ? {receiptDigest:goal.semanticFinalGoalCompletion.receiptDigest} : undefined,
      llmUsage:usage,llmUsageStatus:usage.status,dispatchUsage:readSemanticDispatchUsage(dataRoot,goal,lifecycle),
      release:report.release,blockers:report.blockers,updatedAt:goal.updatedAt};
    requireSemantic(digestObject(subject()) === digestObject(original), "DRIFT"); goals.assertSettled(goalId);
    requireSemantic(digestObject(goals.read(goalId)) === report.goalRevisionDigest, "DRIFT");
    return freeze({snapshot, evidenceMatrix: matrix, finalReport, semanticCompletion: report,graph,runStatus});
  }});
}
