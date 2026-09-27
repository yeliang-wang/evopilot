import {assertAgentExecutionRequestV1Alpha1,assertAgentExecutionResultV1Alpha1,assertAgentProcessObservation} from "@evopilot/contracts";
import type {GlobalGoal} from "../model.js";
import type {LifecycleService} from "../domains/lifecycle/service.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject,isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";
import {semanticStageUsage,summarizeSemanticUsage} from "./semantic-execution-usage.js";

type Doc = Record<string,any>;
const same = (a:unknown,b:unknown)=>digestObject(a) === digestObject(b);
/** Internal read projection. Caller must authenticate the exact raw Goal and
 * check its revision before/after. Enumerates only requests reachable from its
 * verified Lifecycle owners, never scans other Goals or invokes an adapter. */
export function readSemanticDispatchUsage(dataRoot:string,goal:GlobalGoal,lifecycle:Pick<LifecycleService,"readSettledVerified">) {
  const store = new SemanticBindingStore(dataRoot),scope={tenantId:goal.tenantId,workspaceId:goal.workspaceId,projectId:goal.projectId};
  const owners=goal.semanticExecutionOwners ?? [];
  requireSemantic(owners.length <= 64 && new Set(owners.map(o=>o.targetId)).size === owners.length,"MATERIAL_LIMIT");
  const witnesses:Array<{kind:Parameters<SemanticBindingStore["read"]>[0];key:unknown;value:unknown}>=[],runs:Array<{id:string;digest:string}>=[];
  function read(kind:Parameters<SemanticBindingStore["read"]>[0],key:unknown):Doc|undefined {
    const value=store.read(kind,key);requireSemantic(value === undefined || isRecord(value),"MATERIAL_INVALID");
    witnesses.push({kind,key,value});return value as Doc|undefined;
  }
  const entries:Array<{targetId:string;runId:string;stageId:string;sourceRequestDigest:string;state:string;
    usage:ReturnType<typeof semanticStageUsage>|null;anchorDigest?:string}>=[],seen=new Set<string>();
  for(const owner of owners) {
    const run=lifecycle.readSettledVerified(owner.runId);requireSemantic(run,"UNAVAILABLE");
    requireSemantic(Object.entries({...scope,goalId:goal.id,targetId:owner.targetId}).every(([k,v])=>run[k as keyof typeof run]===v) &&
      run.binding?.harnessExecutionBindingDigest === owner.harnessBindingDigest,"PERMISSION_DENIED");
    runs.push({id:run.id,digest:digestObject(run)});
    const proofs=run.semanticStageCompletions ?? [];requireSemantic(proofs.length <= 64,"MATERIAL_LIMIT");
    const requests=[...proofs.map(p=>({stageId:p.stageId,sourceRequestDigest:p.sourceRequestDigest,proof:p})),
      ...(run.pendingExecution ? [{stageId:run.pendingExecution.stageId,sourceRequestDigest:run.pendingExecution.requestDigest,proof:undefined}] : [])];
    for(const item of requests) {
      requireSemantic(!seen.has(item.sourceRequestDigest),"IDENTITY_CONFLICT");seen.add(item.sourceRequestDigest);
      const key={scope,runId:run.id,sourceRequestDigest:item.sourceRequestDigest},claim=read("dispatch-claims",key),result=read("dispatch-results",key);
      const base={targetId:owner.targetId,runId:run.id,stageId:item.stageId,sourceRequestDigest:item.sourceRequestDigest};
      if(!claim) {requireSemantic(!result && !item.proof,"DRIFT");entries.push({...base,state:"NOT_DISPATCHED",usage:null});continue;}
      requireSemantic(claim.schema === "evopilot-semantic-dispatch-claim/v1" && isRecord(claim.binding),"MATERIAL_INVALID");
      if(claim.usageAnchorDigest === undefined) {entries.push({...base,state:"LEGACY_ANCHOR_UNAVAILABLE",usage:null});continue;}
      const anchor=read("dispatch-usage-anchors",key);requireSemantic(anchor && digestObject(anchor)===claim.usageAnchorDigest,"DIGEST_MISMATCH");
      requireSemantic(anchor.schema === "evopilot-semantic-dispatch-usage-anchor/v1" && anchor.runId===run.id &&
        anchor.sourceRequestDigest===item.sourceRequestDigest && same(anchor.identity,{projectId:goal.projectId,goalId:goal.id,targetId:owner.targetId,harnessBindingDigest:owner.harnessBindingDigest}) &&
        same(claim.binding,{requestDigest:anchor.requestDigest,executionBindingDigest:anchor.executionBindingDigest,sliceDigest:anchor.sliceDigest}),"DRIFT");
      const request=anchor.request,profile=anchor.profile;
      assertAgentExecutionRequestV1Alpha1(request);
      const {requestDigest,...requestBody}=request,{digest:profileDigest,...profileBody}=profile;
      const {semanticContext,...sourceBody}=requestBody;
      requireSemantic(typeof semanticContext?.sourceIdempotencyKey === "string","MATERIAL_INVALID");
      const sourceId=semanticContext.sourceIdempotencyKey.split(":")[0];
      const source={...sourceBody,id:sourceId,idempotencyKey:semanticContext.sourceIdempotencyKey};
      const {sliceDigest,...sliceBody}=semanticContext.slice;
      requireSemantic(digestObject(source)===item.sourceRequestDigest && digestObject(sliceBody)===sliceDigest,"DIGEST_MISMATCH");
      requireSemantic(requestDigest===digestObject(requestBody) && profileDigest===digestObject(profileBody) &&
        requestDigest===anchor.requestDigest && request.runId===run.id && request.stageId===item.stageId &&
        request.bindingDigest===run.binding!.digest && request.harness?.harnessExecutionBindingDigest===owner.harnessBindingDigest &&
        same(request.scope,{...scope,goalId:goal.id,targetId:owner.targetId}) &&
        request.semanticContext?.sourceRequestDigest===item.sourceRequestDigest &&
        request.semanticContext?.executionBindingDigest===anchor.executionBindingDigest &&
        request.semanticContext?.slice?.sliceDigest===anchor.sliceDigest && request.executor.agentRuntime.profileDigest===profileDigest &&
        request.executor.host===profile.host && request.executor.provider===profile.provider && request.executor.model===profile.model,"DRIFT");
      if(!item.proof) requireSemantic(same({...source,requestDigest:item.sourceRequestDigest},run.pendingExecution),"DRIFT");
      if(item.proof) requireSemantic(item.proof.requestDigest===requestDigest && item.proof.executionBindingDigest===anchor.executionBindingDigest,"DRIFT");
      if(!result) {requireSemantic(!item.proof,"DRIFT");entries.push({...base,state:"WAITING_RECEIPT",anchorDigest:claim.usageAnchorDigest,usage:null});continue;}
      requireSemantic(result.schema === "evopilot-semantic-dispatch-result/v1" && result.status === "RECEIVED_PENDING_DUAL_VALIDATION" &&
        result.eligibleForCompletion===false && result.requestDigest===requestDigest && result.requestId===request.id &&
        result.sourceRequestDigest===item.sourceRequestDigest && result.executionBindingDigest===anchor.executionBindingDigest &&
        result.sliceDigest===anchor.sliceDigest && result.adapterProfileDigest===profileDigest,"DRIFT");
      assertAgentExecutionResultV1Alpha1(result.result,request);
      if(item.proof) requireSemantic(digestObject(result.result)===item.proof.resultDigest,"DRIFT");
      if(result.processObservationStatus!=="COLLECTED") {
        requireSemantic([undefined,"UNAVAILABLE","REJECTED"].includes(result.processObservationStatus) && !result.processObservation,"MATERIAL_INVALID");
        entries.push({...base,state:"OBSERVATION_UNAVAILABLE",anchorDigest:claim.usageAnchorDigest,usage:null});continue;
      }
      assertAgentProcessObservation(result.processObservation,request,result.result,profile);
      if(result.processObservation.material.origin!=="NATIVE_PROCESS_RUNNER") {
        entries.push({...base,state:"SYNTHETIC_OBSERVATION_EXCLUDED",anchorDigest:claim.usageAnchorDigest,usage:null});continue;
      }
      const usage=semanticStageUsage(result,{bindingDigest:anchor.executionBindingDigest,agentRuntime:{provider:profile.provider,model:profile.model,profileDigest},host:{id:profile.host}});
      entries.push({...base,state:result.result.status,anchorDigest:claim.usageAnchorDigest,usage});
    }
  }
  for(const w of witnesses) requireSemantic(same(store.read(w.kind,w.key) ?? null,w.value ?? null),"DRIFT");
  for(const r of runs) requireSemantic(digestObject(lifecycle.readSettledVerified(r.id))===r.digest,"DRIFT");
  const usages=entries.flatMap(e=>e.usage?[e.usage]:[]),summary=summarizeSemanticUsage(usages);
  const body={schema:"evopilot-semantic-dispatch-usage/v1",basis:"VERIFIED_REACHABLE_DISPATCH_RECEIPTS",...summary,entries,
    status:!summary.measuredExecutions?"UNAVAILABLE":summary.measuredExecutions===entries.length?"VERIFIED_KNOWN_DISPATCHES":"PARTIAL",
    coverage:{knownRequests:entries.length,measuredExecutions:summary.measuredExecutions,
      unresolvedRequests:entries.filter(e=>e.usage?.coverage!=="COMPLETE").length,
      includes:["SUCCEEDED","FAILED","UNCERTAIN"],excludes:["UNREACHABLE_OR_OTHER_GOAL_RECORDS","INTERNAL_ACTIONS","PROVIDER_BILLING"]},
    billingReconciled:false,grantsAuthority:false};
  return freeze({...body,usageDigest:digestObject(body)});
}
