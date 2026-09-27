import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";

const hash = (v: unknown): v is string => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 512;
const tokens = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
function add(a: number, b: number) {const value = a + b; requireSemantic(tokens(value), "MATERIAL_LIMIT"); return value;}

/** Called only after terminal evidence verifies the exact dispatch/result and
 * process observation against committed proof. This is reported process usage,
 * not provider billing, business evidence or fresh execution authority. */
export function semanticStageUsage(dispatch: Record<string, any>, binding: Record<string, any>) {
  const observation = dispatch.processObservation, m = observation?.material, cost = m?.cost;
  requireSemantic(isRecord(cost) && Object.keys(cost).sort().join() === "amount,currency,inputTokens,outputTokens" &&
    tokens(cost.inputTokens) && tokens(cost.outputTokens) && typeof cost.amount === "number" &&
    Number.isFinite(cost.amount) && cost.amount >= 0 && cost.currency === "USD", "MATERIAL_INVALID");
  requireSemantic(text(binding.agentRuntime?.provider) && text(binding.agentRuntime?.model) && text(binding.host?.id) &&
    hash(binding.agentRuntime?.profileDigest) && hash(binding.bindingDigest) && text(dispatch.requestId) &&
    hash(dispatch.requestDigest) && hash(dispatch.sourceRequestDigest), "MATERIAL_INVALID");
  requireSemantic(dispatch.result?.requestId === dispatch.requestId && dispatch.result.requestDigest === dispatch.requestDigest &&
    dispatch.adapterProfileDigest === binding.agentRuntime.profileDigest && m.profileDigest === binding.agentRuntime.profileDigest &&
    m.requestDigest === dispatch.requestDigest && m.route === `${binding.agentRuntime.provider}/${binding.agentRuntime.model}` &&
    m.origin === "NATIVE_PROCESS_RUNNER" && digestObject(m) === observation.receiptDigest &&
    observation.receiptDigest === dispatch.result.receiptDigest && digestObject(cost) === digestObject(dispatch.result.cost), "DRIFT");
  const coverage = m.usageCoverage ?? "UNAVAILABLE";
  requireSemantic(["COMPLETE","PARTIAL","UNAVAILABLE"].includes(coverage),"MATERIAL_INVALID");
  return freeze({requestId: dispatch.requestId, requestDigest: dispatch.requestDigest, sourceRequestDigest: dispatch.sourceRequestDigest,
    executionBindingDigest: binding.bindingDigest, adapterProfileDigest: binding.agentRuntime.profileDigest as string,
    provider: binding.agentRuntime.provider as string, model: binding.agentRuntime.model as string, host: binding.host.id as string,
    observationDigest: digestObject(observation), coverage: coverage as "COMPLETE" | "PARTIAL" | "UNAVAILABLE",
    inputTokens: coverage === "COMPLETE" ? cost.inputTokens : null, outputTokens: coverage === "COMPLETE" ? cost.outputTokens : null,
    totalTokens: coverage === "COMPLETE" ? add(cost.inputTokens, cost.outputTokens) : null,
    reportedCost: coverage === "COMPLETE" ? {amount: cost.amount, currency: "USD" as const} : null});
}
type StageUsage = ReturnType<typeof semanticStageUsage>;

/** Pure aggregation of already-verified completed Target receipts. The caller
 * supplies only receipts returned by the completion owner, never raw Goal data.
 * Pending/failed/uncertain dispatches and internal actions are not covered. */
export function aggregateSemanticUsage(targetIds: string[], receipts: Array<{targetId: string; receiptDigest: string;
  stages: Array<{stageId: string; usage: StageUsage}>}>) {
  requireSemantic(targetIds.length > 0 && targetIds.length <= 64 && new Set(targetIds).size === targetIds.length &&
    receipts.length <= targetIds.length && new Set(receipts.map(r => r.targetId)).size === receipts.length, "MATERIAL_INVALID");
  const seen = new Set<string>();
  const executions = receipts.flatMap(r => {
    requireSemantic(targetIds.includes(r.targetId) && hash(r.receiptDigest) && r.stages.length > 0 && r.stages.length <= 64, "MATERIAL_INVALID");
    return r.stages.map(s => {
      const u = s.usage;
      requireSemantic(u && hash(u.requestDigest) && ["COMPLETE","PARTIAL","UNAVAILABLE"].includes(u.coverage),"MATERIAL_INVALID");
      requireSemantic(u.coverage === "COMPLETE" ? tokens(u.inputTokens) && tokens(u.outputTokens) &&
        u.totalTokens === add(u.inputTokens, u.outputTokens) && u.reportedCost && Number.isFinite(u.reportedCost.amount) &&
        u.reportedCost.amount >= 0 && u.reportedCost.currency === "USD" :
        u.inputTokens === null && u.outputTokens === null && u.totalTokens === null && u.reportedCost === null, "MATERIAL_INVALID");
      requireSemantic(!seen.has(u.requestDigest), "IDENTITY_CONFLICT"); seen.add(u.requestDigest);
      return {targetId: r.targetId, targetReceiptDigest: r.receiptDigest, stageId: s.stageId, ...u};
    });
  });
  const {totals,routes,measuredExecutions} = summarizeSemanticUsage(executions);
  const body = {schema:"evopilot-semantic-execution-usage/v1", basis:"VERIFIED_COMPLETED_TARGET_RECEIPTS",
    status:!measuredExecutions ? "UNAVAILABLE" : receipts.length === targetIds.length && measuredExecutions === executions.length ? "VERIFIED_COMPLETED_TARGETS" : "PARTIAL",
    totals, routes, executions,
    coverage:{plannedTargets:targetIds.length,verifiedTargets:receipts.length,verifiedExecutions:executions.length,measuredExecutions,
      unverifiedTargetIds:targetIds.filter(id=>!receipts.some(r=>r.targetId===id)),
      excludes:["PENDING_FAILED_UNCERTAIN_DISPATCHES","INTERNAL_ACTIONS","OTHER_GOALS","PROVIDER_BILLING"]},
    billingReconciled:false, grantsAuthority:false};
  return freeze({...body,usageDigest:digestObject(body)});
}

/** Shared arithmetic only: callers must first verify scoped receipt provenance. */
export function summarizeSemanticUsage(executions: StageUsage[]) {
  const groups = new Map<string, {provider: string; model: string; host: string; adapterProfileDigest: string;
    executions: number; inputTokens: number; outputTokens: number; totalTokens: number; reportedCost: {amount: number; currency: "USD"}}>();
  let inputTokens = 0, outputTokens = 0, amount = 0;
  const measured = executions.filter(u=>u.coverage === "COMPLETE");
  for (const entry of measured) {
    const u = {...entry,inputTokens:entry.inputTokens!,outputTokens:entry.outputTokens!,reportedCost:entry.reportedCost!};
    inputTokens = add(inputTokens, u.inputTokens); outputTokens = add(outputTokens, u.outputTokens); amount += u.reportedCost.amount;
    requireSemantic(Number.isFinite(amount), "MATERIAL_LIMIT");
    const route = {provider:u.provider, model:u.model, host:u.host, adapterProfileDigest:u.adapterProfileDigest}, key = digestObject(route);
    const g = groups.get(key) ?? {...route, executions:0, inputTokens:0, outputTokens:0, totalTokens:0, reportedCost:{amount:0,currency:"USD"}};
    g.executions++; g.inputTokens = add(g.inputTokens,u.inputTokens); g.outputTokens = add(g.outputTokens,u.outputTokens);
    g.totalTokens = add(g.inputTokens,g.outputTokens); g.reportedCost.amount += u.reportedCost.amount; groups.set(key,g);
  }
  const totals = measured.length ? {inputTokens,outputTokens,totalTokens:add(inputTokens,outputTokens),reportedCost:{amount,currency:"USD"}} : null;
  return {totals,routes:[...groups.values()],measuredExecutions:measured.length};
}
