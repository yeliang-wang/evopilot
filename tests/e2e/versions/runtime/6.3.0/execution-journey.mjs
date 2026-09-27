import assert from 'node:assert/strict';
import {exactKeys,isDigest,isId,probeDigest} from '../../probe-session.mjs';

const policy='current-scoped-operator-or-admin/v1';
const hashed=(value,key,schema)=>{
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value));
  const {[key]:digest,...body}=value;
  assert.equal(value.schema,schema);assert.ok(isDigest(digest));assert.equal(digest,probeDigest(body),'RC04_RECORD_DIGEST');
};
const bounded=value=>{const bytes=JSON.stringify(value);assert.ok(bytes&&Buffer.byteLength(bytes)<=4194304,'RC04_MATERIAL_LIMIT');return JSON.parse(bytes);};
const unique=values=>[...new Set(values)].sort();

/** Campaign supplies the frozen frame and independently chosen expectations.
 * Hash consistency alone cannot establish business truth or Host qualification.
 * No Runtime implementation, package evaluator or product schema is imported. */
export function assertExecutionFrame(frame) {
  exactKeys(frame,['scope','identity','runId','sourceRequestDigest','binding','slice','review','expected']);
  const {scope,identity,runId,sourceRequestDigest,binding,slice,review,expected}=frame;
  exactKeys(scope,['tenantId','workspaceId','projectId']);assert.ok(Object.values(scope).every(isId));
  exactKeys(identity,['projectId','goalId','targetId','harnessBindingDigest']);
  assert.ok([identity.projectId,identity.goalId,identity.targetId,runId].every(isId));
  assert.equal(identity.projectId,scope.projectId);assert.ok(isDigest(sourceRequestDigest)&&isDigest(identity.harnessBindingDigest));
  hashed(binding,'bindingDigest','evopilot-semantic-execution-binding/v1');
  assert.deepEqual(binding.scope,scope);assert.equal(binding.harness.bindingDigest,identity.harnessBindingDigest);
  assert.equal(binding.status,'BOUND_PENDING_EXECUTION_INTEGRATION');assert.equal(binding.eligibleForExecution,false);
  hashed(binding.outcomePlan,'planDigest','evopilot-semantic-outcome-plan/v1');
  hashed(slice,'sliceDigest','evopilot-semantic-context-slice/v1');
  assert.deepEqual(slice.scope,scope);assert.equal(slice.executionBindingDigest,binding.bindingDigest);
  assert.equal(slice.pendingExecution.runId,runId);assert.equal(slice.pendingExecution.requestDigest,sourceRequestDigest);
  assert.ok(isDigest(expected.lifecycleBindingDigest));assert.equal(slice.pendingExecution.lifecycleBindingDigest,expected.lifecycleBindingDigest);
  assert.equal(slice.pins.harnessBindingDigest,identity.harnessBindingDigest);assert.equal(slice.pins.bundleDigest,binding.harness.bundle.digest);
  assert.equal(slice.contextPlanDigest,binding.contextPlan.planDigest);
  for(const key of ['artifactSetDigest','snapshotDigest','skillDigest','closureDigest','reasoningProfileDigest'])assert.equal(slice.pins[key],binding.semantic[key]);
  assert.equal(slice.status,'PREPARED_NOT_DISPATCHED');assert.equal(slice.eligibleForExecution,false);
  assert.deepEqual(slice.authority,{semanticDataOnly:true,textIsUntrustedData:true,mayApprove:false,mayExecute:false,mayPublish:false});
  hashed(review,'reviewDigest','evopilot-semantic-outcome-review/v1');
  exactKeys(review,['schema','scope','runId','sourceRequestDigest','executionBindingDigest','sliceDigest','outcomePlan','runtimeSourcePins','evaluatorDigest','criteria','coverage','approvalPolicy','authority','reviewDigest']);
  assert.deepEqual(review.scope,scope);assert.equal(review.runId,runId);assert.equal(review.sourceRequestDigest,sourceRequestDigest);
  assert.equal(review.executionBindingDigest,binding.bindingDigest);assert.equal(review.sliceDigest,slice.sliceDigest);
  assert.deepEqual(review.outcomePlan,binding.outcomePlan);assert.deepEqual(review.runtimeSourcePins,binding.runtimeSourcePins);
  assert.equal(review.evaluatorDigest,binding.outcomeEvaluatorDigest);assert.equal(review.approvalPolicy,policy);
  assert.deepEqual(review.authority,{mayDispatch:false,mayAttestEvidence:false,mayCompleteGoal:false,mayRelease:false});
  exactKeys(expected,['principalId','lifecycleBindingDigest','criteria','coverage','obligations','business','harness','agentStatus']);
  assert.ok(typeof expected.principalId==='string'&&expected.principalId.trim().length>0&&expected.principalId.length<=2048);
  assert.deepEqual(review.criteria,expected.criteria);assert.deepEqual(review.coverage,expected.coverage);
  assert.ok(Array.isArray(expected.criteria)&&expected.criteria.length>0&&expected.criteria.length<=64);
  assert.equal(new Set(expected.criteria.map(c=>c.criterionDigest)).size,expected.criteria.length);
  assert.deepEqual(unique(review.coverage.map(c=>c.criterionDigest)),unique(expected.criteria.map(c=>c.criterionDigest)));
  assert.equal(review.coverage.length,expected.criteria.length);
  const businessIds=binding.outcomePlan.business.map(r=>r.id);
  assert.deepEqual(unique(review.coverage.flatMap(c=>c.ruleIds)),unique(businessIds));
  for(const c of review.coverage){exactKeys(c,['criterionDigest','ruleIds']);assert.ok(isDigest(c.criterionDigest));assert.ok(c.ruleIds.length>0);assert.deepEqual(c.ruleIds,unique(c.ruleIds));}
  exactKeys(expected.obligations,['validators','constraints','evidence']);
  const obligations=[];
  for(const [plural,kind] of [['validators','validator'],['constraints','constraint'],['evidence','evidence']]) {
    const values=expected.obligations[plural];assert.ok(Array.isArray(values)&&values.length<=256);assert.deepEqual(values,unique(values));
    for(const value of values){assert.ok(typeof value==='string'&&value.length>0&&value.length<=2048);obligations.push({kind,value});}
  }
  assert.deepEqual(unique(binding.outcomePlan.harness.map(r=>probeDigest(r.obligation))),unique(obligations.map(probeDigest)),'RC04_OBLIGATION_COVERAGE');
  for(const group of ['business','harness']) {
    assert.ok(Array.isArray(expected[group])&&expected[group].length>0&&expected[group].length<=64);
    assert.deepEqual(expected[group].map(c=>c.id),binding.outcomePlan[group].map(r=>r.id));
    assert.equal(new Set(expected[group].map(c=>c.id)).size,expected[group].length);
    for(const check of expected[group]){exactKeys(check,['id','status']);assert.ok(['PASSED','FAILED','INDETERMINATE'].includes(check.status));}
  }
  assert.ok(['SUCCEEDED','FAILED','UNCERTAIN'].includes(expected.agentStatus));
}
export function assertExecutionDecision(frame,decision) {
  exactKeys(decision,['schema','decision','reviewDigest','scope','principal','approvedAt','approvalPolicy','decisionDigest']);
  hashed(decision,'decisionDigest','evopilot-semantic-outcome-decision/v1');
  assert.equal(decision.decision,'APPROVE');assert.equal(decision.reviewDigest,frame.review.reviewDigest);
  assert.deepEqual(decision.scope,frame.scope);assert.equal(decision.approvalPolicy,policy);
  assert.equal(decision.principal.id,frame.expected.principalId);assert.ok(['operator','admin'].includes(decision.principal.role));
  assert.equal(decision.principal.tenantId,frame.scope.tenantId);assert.equal(decision.principal.workspaceId,frame.scope.workspaceId);
  assert.ok(Number.isFinite(Date.parse(decision.approvedAt)));
}
export function assertExecutionDispatch(frame,dispatch) {
  const {binding,slice,sourceRequestDigest,expected}=frame;
  assert.equal(dispatch.schema,'evopilot-semantic-dispatch-result/v1');assert.equal(dispatch.status,'RECEIVED_PENDING_DUAL_VALIDATION');
  assert.equal(dispatch.eligibleForCompletion,false);assert.equal(dispatch.executionBindingDigest,binding.bindingDigest);
  assert.equal(dispatch.sliceDigest,slice.sliceDigest);assert.equal(dispatch.sourceRequestDigest,sourceRequestDigest);
  assert.equal(dispatch.adapterProfileDigest,binding.agentRuntime.profileDigest);assert.ok(isDigest(dispatch.requestDigest)&&isId(dispatch.requestId));
  assert.equal(dispatch.requestId,'semantic-'+probeDigest({sourceRequestDigest,executionBindingDigest:binding.bindingDigest,sliceDigest:slice.sliceDigest}).slice(7));
  assert.equal(dispatch.result.schema,'evopilot-agent-execution-result/v1alpha1');assert.equal(dispatch.result.idempotencyKey,dispatch.requestId);
  assert.equal(dispatch.result.requestId,dispatch.requestId);assert.equal(dispatch.result.requestDigest,dispatch.requestDigest);
  assert.equal(dispatch.result.bindingDigest,expected.lifecycleBindingDigest);assert.equal(dispatch.result.status,expected.agentStatus);
  assert.ok(isDigest(dispatch.result.receiptDigest));
}
export function assertExecutionCollection(collection) {
  exactKeys(collection,['receiptDigest','requestDigest','origin','kinds','status','authority']);
  assert.ok(isDigest(collection.receiptDigest)&&isDigest(collection.requestDigest));assert.ok(['INDEPENDENT','SYNTHETIC'].includes(collection.origin));
  assert.equal(collection.status,'COLLECTED_NOT_COMPLETED');assert.ok(Array.isArray(collection.kinds)&&collection.kinds.length<=16);
  assert.equal(new Set(collection.kinds).size,collection.kinds.length);assert.ok(collection.kinds.every(isId));
  assert.deepEqual(collection.authority,{mayCompleteGoal:false,mayAdvanceLifecycle:false,mayPublish:false});
}
export function assertRuntimeExecutionEvidence({frame,decision,dispatch,collection,outcome}) {
  bounded({frame,decision,dispatch,collection,outcome});assertExecutionFrame(frame);assertExecutionDecision(frame,decision);
  assertExecutionDispatch(frame,dispatch);assertExecutionCollection(collection);
  const {binding,slice,review,scope,identity,sourceRequestDigest,expected}=frame;
  hashed(outcome,'outcomeDigest','evopilot-semantic-execution-outcome/v1');
  exactKeys(outcome,['schema','scope','requestDigest','executionBindingDigest','sliceDigest','outcomePlanDigest','outcomeReviewDigest','outcomeDecisionDigest',
    'collection','collectorTrust','evidenceTrust','processEvidence','evaluatorDigest','receiptDigest','resultDigest','sourceRequestDigest','obligationDigest',
    'evidenceDigests','business','harness','agentStatus','status','eligibleForCompletion','authority','outcomeDigest']);
  assert.deepEqual(outcome.scope,{...scope,goalId:identity.goalId,targetId:identity.targetId});
  for(const [key,value] of Object.entries({requestDigest:dispatch.requestDigest,executionBindingDigest:binding.bindingDigest,sliceDigest:slice.sliceDigest,
    outcomePlanDigest:binding.outcomePlan.planDigest,outcomeReviewDigest:review.reviewDigest,outcomeDecisionDigest:decision.decisionDigest,
    evaluatorDigest:binding.outcomeEvaluatorDigest,receiptDigest:dispatch.result.receiptDigest,resultDigest:probeDigest(dispatch.result),sourceRequestDigest,
    obligationDigest:probeDigest(expected.obligations)}))assert.equal(outcome[key],value,'RC04_CORRELATION_'+key);
  assert.deepEqual(outcome.collection,{receiptDigest:collection.receiptDigest,origin:collection.origin,requestDigest:collection.requestDigest});
  assert.equal(outcome.collectorTrust,collection.origin==='SYNTHETIC'?'SYNTHETIC_CONFIGURED_COLLECTOR_ONLY':'OPERATOR_CONFIGURED_COLLECTOR_NOT_PROOF_OF_BUSINESS_TRUTH');
  assert.equal(outcome.evidenceTrust,dispatch.result.artifacts?.length?'CONTENT_AND_CORRELATION_VERIFIED_NOT_COLLECTOR_ATTESTED':
    collection.origin==='SYNTHETIC'?'SYNTHETIC_COLLECTOR_OBSERVATIONS':'CONFIGURED_COLLECTOR_OBSERVATIONS');
  assert.ok(Array.isArray(outcome.evidenceDigests)&&outcome.evidenceDigests.length<=16&&outcome.evidenceDigests.every(isDigest));
  assert.deepEqual(outcome.evidenceDigests,unique(outcome.evidenceDigests));
  if(dispatch.processObservationStatus==='COLLECTED') {
    const observation=dispatch.processObservation,material=observation.material;
    assert.equal(observation.receiptDigest,probeDigest(material));assert.equal(observation.receiptDigest,dispatch.result.receiptDigest);
    exactKeys(outcome.processEvidence,['digest','origin','observationDigest']);
    assert.equal(outcome.processEvidence.origin,material.origin);assert.equal(outcome.processEvidence.observationDigest,probeDigest(observation));
    assert.ok(isDigest(outcome.processEvidence.digest)&&outcome.evidenceDigests.includes(outcome.processEvidence.digest));
  } else {
    assert.ok(dispatch.processObservationStatus===undefined||dispatch.processObservationStatus==='UNAVAILABLE');
    assert.equal(dispatch.processObservation,undefined);assert.equal(outcome.processEvidence,null);
  }
  const groupStatus=checks=>checks.some(c=>c.status==='FAILED')?'FAILED':checks.every(c=>c.status==='PASSED')?'PASSED':'INDETERMINATE';
  const business=groupStatus(expected.business),harness=groupStatus(expected.harness);
  assert.deepEqual(outcome.business,{status:business,checks:expected.business});
  assert.deepEqual(outcome.harness,{status:harness,checks:expected.harness,missingObligationDigests:[],missingEvidenceKinds:[]});
  assert.equal(outcome.agentStatus,expected.agentStatus);
  const status=expected.agentStatus==='FAILED'||[business,harness].includes('FAILED')?'FAILED':
    expected.agentStatus==='SUCCEEDED'&&business==='PASSED'&&harness==='PASSED'?'DUAL_VALIDATED_NOT_COMPLETED':'INDETERMINATE';
  assert.equal(outcome.status,status);assert.equal(outcome.eligibleForCompletion,false);
  assert.deepEqual(outcome.authority,{mayCompleteGoal:false,mayAdvanceLifecycle:false,mayApprove:false,mayPublish:false});
  return {status,business,harness,outcomeDigest:outcome.outcomeDigest};
}

/** Fixed reviewed RC04 execution tail. Each call needs external campaign
 * authorization; an exact review decision is not dispatch permission. Never
 * launches a Host, advances a stage, completes a Goal, releases, retries or
 * treats an uncertain dispatch as safe to replay. Invoke returns {requestId,data}.
 * Caller must first prepare/bind/resolve/review through governed transports. */
export async function runReviewedExecutionJourney({frame,decision,invoke,authorize,signal,timeoutMs=30000}) {
  frame=bounded(frame);decision=bounded(decision);assertExecutionFrame(frame);
  exactKeys(decision,['decision','reviewDigest','principalId']);assert.equal(decision.decision,'APPROVE');
  assert.equal(decision.reviewDigest,frame.review.reviewDigest,'RC04_EXACT_DECISION_REQUIRED');assert.equal(decision.principalId,frame.expected.principalId);
  assert.equal(typeof invoke,'function');assert.equal(typeof authorize,'function');assert.ok(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=120000);
  const controller=new AbortController(),events=[];let attempted,abort;
  const cancel=()=>controller.abort(new Error('RC04_CANCELLED'));signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const timer=setTimeout(()=>controller.abort(new Error('RC04_TIMEOUT')),timeoutMs);
  const cancelled=new Promise((_,reject)=>{abort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',abort,{once:true});});cancelled.catch(()=>{});
  const report=(status,extra={})=>({schema:'evopilot-runtime-rc04-execution-journey/v1',status,...extra,events,observationDigest:probeDigest(events),
    targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',realHost:'NOT_QUALIFIED',workBuddy:'NOT_OPERATED_OR_OBSERVED',releaseAuthorized:false});
  const input={identity:frame.identity,bindingDigest:frame.binding.bindingDigest};
  const call=async(operation,payload)=>{
    controller.signal.throwIfAborted();const request=bounded({operation,payload});
    const authorized=await Promise.race([Promise.resolve().then(()=>authorize(structuredClone(request),{signal:controller.signal})),cancelled]);
    controller.signal.throwIfAborted();assert.equal(authorized,true,'RC04_CAMPAIGN_AUTHORITY_REQUIRED');
    const response=await Promise.race([Promise.resolve().then(()=>{
      controller.signal.throwIfAborted();if(operation!=='resolve')attempted=operation;
      return invoke(operation,structuredClone(payload),{signal:controller.signal});
    }),cancelled]);
    controller.signal.throwIfAborted();const result=bounded(response);exactKeys(result,['requestId','data']);assert.ok(isId(result.requestId));
    events.push({operation,requestDigest:probeDigest(request),responseDigest:probeDigest(result),requestId:result.requestId});return result.data;
  };
  try {
    assert.deepEqual(await call('resolve',input),frame.slice,'RC04_FRAME_DRIFT');
    assert.deepEqual(await call('review',{...input,coverage:frame.review.coverage}),frame.review,'RC04_REVIEW_DRIFT');
    const approved=await call('approveReview',{...input,decision:'APPROVE',reviewDigest:decision.reviewDigest});assertExecutionDecision(frame,approved);
    const dispatch=await call('dispatch',input);assertExecutionDispatch(frame,dispatch);
    const collection=await call('collect',input);assertExecutionCollection(collection);
    const outcome=await call('evaluate',input);
    const result=assertRuntimeExecutionEvidence({frame,decision:approved,dispatch,collection,outcome});
    return report('EXECUTION_SUBJOURNEY_ASSERTIONS_PASSED',{result,nextAction:'separate-governed-stage-and-goal-completion'});
  } catch(error) {
    if(attempted)return report('UNVERIFIED_OUTCOME',{lastAttemptedOperation:attempted,nextAction:'external-read-only-reconciliation-no-mutation-replay'});
    controller.signal.throwIfAborted();throw error;
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',abort);}
}
