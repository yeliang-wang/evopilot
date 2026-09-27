import assert from 'node:assert/strict';
import {exactKeys,isDigest,isId,probeDigest} from '../../probe-session.mjs';
import {runRuntimeDiscoveryProbe} from './discovery-probe.mjs';

function digestRecord(value,key) {
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'RC01_RECORD_INVALID');
  const {[key]:digest,...body}=value;
  assert.ok(isDigest(digest)&&probeDigest(body)===digest,'RC01_RECORD_DIGEST_MISMATCH');
}
export function verifyReview(review,selection,scope) {
  exactKeys(review,['schema','scope','projectRevisionDigest','catalogId','inspectionDigest','pins','approvalPolicy','eligibleForExecution','bindingCreated','reviewDigest']);
  digestRecord(review,'reviewDigest');
  assert.equal(review.schema,'evopilot-project-semantic-binding-review/v1');
  assert.deepEqual(review.scope,scope);assert.equal(review.catalogId,selection.catalogId);
  exactKeys(review.pins,['artifactSetDigest','snapshotDigest','skillDigest','provenanceDigest','closureDigest','bundleRef','reasoningProfileDigest','harnessClosure','compatibilityDigest']);
  exactKeys(review.pins.harnessClosure,['profile','components']);assert.ok(Array.isArray(review.pins.harnessClosure.components));
  assert.ok(review.pins.harnessClosure.components.length>0&&review.pins.harnessClosure.components.length<=4096);
  for(const ref of [review.pins.bundleRef,review.pins.harnessClosure.profile,...review.pins.harnessClosure.components]) {
    exactKeys(ref,['id','version','digest']);assert.ok(isId(ref.id)&&typeof ref.version==='string'&&ref.version.length<=128&&isDigest(ref.digest));
  }
  assert.equal(review.pins.artifactSetDigest,selection.artifactSetDigest);assert.equal(review.pins.bundleRef.digest,selection.bundleDigest);
  for(const key of ['snapshotDigest','skillDigest','provenanceDigest','closureDigest','reasoningProfileDigest','compatibilityDigest'])assert.ok(isDigest(review.pins[key]));
  assert.ok(isDigest(review.projectRevisionDigest)&&isDigest(review.inspectionDigest));
  assert.equal(review.approvalPolicy,'current-scoped-operator-or-admin/v1');
  assert.equal(review.eligibleForExecution,false);assert.equal(review.bindingCreated,false);
}
export function verifyBinding(record,expectedReview,selection,scope,principalId) {
  exactKeys(record,['review','decision','binding']);
  verifyReview(record.review,selection,scope);assert.deepEqual(record.review,expectedReview,'RC01_REVIEW_DRIFT');
  const {binding,decision}=record;
  exactKeys(decision,['schema','decision','reviewDigest','scope','principal','approvalPolicy','approvedAt','decisionDigest']);
  exactKeys(decision.principal,['id','role','tenantId','workspaceId']);
  exactKeys(binding,['schema','scope','projectRevisionDigest','status','catalogId','pins','reviewDigest','decisionDigest','eligibleForExecution','nextAction','bindingDigest']);
  digestRecord(binding,'bindingDigest');digestRecord(decision,'decisionDigest');
  assert.equal(decision.schema,'evopilot-project-semantic-binding-decision/v1');assert.equal(decision.decision,'APPROVE');
  assert.equal(decision.reviewDigest,expectedReview.reviewDigest);assert.deepEqual(decision.scope,scope);
  assert.equal(decision.principal.id,principalId);assert.equal(decision.principal.tenantId,scope.tenantId);assert.equal(decision.principal.workspaceId,scope.workspaceId);
  assert.ok(['operator','admin'].includes(decision.principal.role));assert.ok(Number.isFinite(Date.parse(decision.approvedAt)));
  assert.equal(decision.approvalPolicy,expectedReview.approvalPolicy);
  assert.equal(binding.schema,'evopilot-project-semantic-binding/v1');assert.equal(binding.status,'REVIEWED_NOT_ACTIVATED');
  assert.deepEqual(binding.scope,scope);assert.equal(binding.catalogId,selection.catalogId);
  assert.equal(binding.projectRevisionDigest,expectedReview.projectRevisionDigest);assert.deepEqual(binding.pins,expectedReview.pins);
  assert.equal(binding.reviewDigest,expectedReview.reviewDigest);assert.equal(binding.decisionDigest,decision.decisionDigest);
  assert.equal(binding.eligibleForExecution,false);assert.equal(binding.nextAction,'resolve-governed-semantic-execution-binding');
}

/** Fixed RC01 binding subjourney. No package imports, shell, asset publication,
 * automatic approval, Host launch or formal acceptance. The caller must supply
 * a separately authorized campaign transport; the read-only installed probe
 * transport intentionally cannot perform this workflow's review/approve calls.
 * A supplied exact decision is data, never proof of campaign authorization.
 * After uncertain submission, resume ONLY with readback, never blind replay. */
export async function runRuntimeBindingJourney({invoke,selection,scope,phase='prepare',review,decision,signal,timeoutMs=30000}) {
  exactKeys(selection,['projectId','catalogId','artifactSetDigest','bundleDigest']);exactKeys(scope,['tenantId','workspaceId','projectId']);
  assert.ok([selection.projectId,selection.catalogId,...Object.values(scope)].every(isId));assert.equal(selection.projectId,scope.projectId);
  assert.ok([selection.artifactSetDigest,selection.bundleDigest].every(isDigest));
  assert.ok(['prepare','submit','readback'].includes(phase),'RC01_PHASE_INVALID');assert.equal(typeof invoke,'function');
  assert.ok(Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=120000);
  const chosen=structuredClone(selection),expectedScope=structuredClone(scope),expectedReview=review===undefined?undefined:structuredClone(review),exactDecision=decision===undefined?undefined:structuredClone(decision);
  if(phase==='prepare')assert.ok(review===undefined&&decision===undefined,'RC01_UNEXPECTED_DECISION');
  else {
    verifyReview(expectedReview,chosen,expectedScope);exactKeys(exactDecision,['reviewDigest','decision','principalId']);
    assert.equal(exactDecision.reviewDigest,expectedReview.reviewDigest,'RC01_EXACT_DECISION_REQUIRED');
    assert.equal(exactDecision.decision,'APPROVE','RC01_EXACT_DECISION_REQUIRED');assert.ok(isId(exactDecision.principalId));
  }
  const controller=new AbortController(),events=[];let submissionAttempted=false,reviewUnresolved=false;
  const cancel=()=>controller.abort(new Error('RC01_CANCELLED'));signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const timer=setTimeout(()=>controller.abort(new Error('RC01_TIMEOUT')),timeoutMs);
  let abortListener;const cancelled=new Promise((_,reject)=>{abortListener=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',abortListener,{once:true});});cancelled.catch(()=>{});
  const request=async args=>{
    controller.signal.throwIfAborted();
    const response=await Promise.race([Promise.resolve().then(()=>{controller.signal.throwIfAborted();if(args[2]==='approve')submissionAttempted=true;if(args[2]==='review')reviewUnresolved=true;return invoke(structuredClone(args),{signal:controller.signal});}),cancelled]);
    controller.signal.throwIfAborted();exactKeys(response,['exitCode','json']);
    assert.ok(Number.isInteger(response.exitCode)&&response.exitCode>=0&&response.exitCode<=255);
    const bytes=JSON.stringify(response.json);assert.ok(typeof bytes==='string'&&Buffer.byteLength(bytes)<=1048576,'RC01_RESPONSE_LIMIT');
    const json=JSON.parse(bytes);
    if(json?.requestId!==undefined)assert.ok(typeof json.requestId==='string'&&/^[a-zA-Z0-9._-]{1,128}$/.test(json.requestId),'RC01_REQUEST_ID_INVALID');
    events.push({commandDigest:probeDigest(args),responseDigest:probeDigest(json),exitCode:response.exitCode,
      ...(json?.requestId===undefined?{}:{requestId:json.requestId})});
    assert.equal(response.exitCode,0,'RC01_PRODUCT_REFUSAL');return {exitCode:response.exitCode,json};
  };
  const call=async(operation,options=[])=> {
    const value=(await request(['project','semantic',operation,chosen.projectId,...options,'--json'])).json;
    assert.ok(value&&typeof value==='object'&&!Array.isArray(value));
    const {requestId,...body}=value;
    assert.ok(typeof requestId==='string'&&/^[a-zA-Z0-9._-]{1,128}$/.test(requestId),'RC01_REQUEST_ID_REQUIRED');
    return body;
  };
  const selected=['--catalog',chosen.catalogId,'--artifact-set-digest',chosen.artifactSetDigest,'--bundle-digest',chosen.bundleDigest];
  const report=(status,extra={})=>({schema:'evopilot-runtime-rc01-binding-journey/v1',product:'runtime',version:'6.3.0',phase,status,
    events,observationDigest:probeDigest(events),...extra,targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',
    installedIdentity:'REQUIRES_EXTERNAL_EXACT_BINDING',realHost:'NOT_QUALIFIED',workBuddy:'NOT_OPERATED_OR_OBSERVED',releaseAuthorized:false});
  try {
    controller.signal.throwIfAborted();
    if(phase==='prepare') {
      await runRuntimeDiscoveryProbe({invoke:request,selection:chosen,scope:expectedScope,signal:controller.signal,timeoutMs});
      const prepared=await call('review',selected);verifyReview(prepared,chosen,expectedScope);
      reviewUnresolved=false;
      return report('WAITING_EXACT_DECISION',{review:prepared,nextAction:'external-exact-binding-decision'});
    }
    if(phase==='submit') {
      const fresh=await call('review',selected);verifyReview(fresh,chosen,expectedScope);reviewUnresolved=false;
      assert.deepEqual(fresh,expectedReview,'RC01_REVIEW_DRIFT');
      const approved=await call('approve',['--review-digest',exactDecision.reviewDigest,'--decision','APPROVE']);
      verifyBinding(approved,expectedReview,chosen,expectedScope,exactDecision.principalId);
    }
    const bound=await call('binding');verifyBinding(bound,expectedReview,chosen,expectedScope,exactDecision.principalId);
    const onboarding=await call('onboarding',['--catalog',chosen.catalogId]);
    assert.equal(onboarding.schema,'evopilot-project-semantic-onboarding/v1');assert.equal(onboarding.projectId,chosen.projectId);
    assert.equal(onboarding.status,'EXISTING_BINDING');assert.equal(onboarding.recommendedBindingMode,'PRESERVE_EXISTING_BINDING');
    assert.equal(onboarding.existingBinding.bindingDigest,bound.binding.bindingDigest);assert.equal(onboarding.existingBinding.headDigest,bound.binding.bindingDigest);
    assert.equal(onboarding.selectedCandidate,null);assert.equal(onboarding.eligibleForExecution,false);assert.equal(onboarding.grantsExecutionAuthority,false);
    const reread=await call('binding');assert.deepEqual(reread,bound,'RC01_BINDING_CHANGED');
    return report('BINDING_SUBJOURNEY_ASSERTIONS_PASSED',{bindingDigest:bound.binding.bindingDigest,reviewDigest:expectedReview.reviewDigest,nextAction:'remaining-independent-RC01-assertions'});
  } catch(error) {
    if(submissionAttempted)return report('UNKNOWN_OUTCOME',{reviewDigest:expectedReview.reviewDigest,nextAction:'readback-only-no-submission-replay'});
    if(reviewUnresolved)return report('UNKNOWN_OUTCOME',{uncertainOperation:'review',nextAction:'reconcile-review-only-no-submission-replay'});
    controller.signal.throwIfAborted();
    throw error;
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',abortListener);}
}
