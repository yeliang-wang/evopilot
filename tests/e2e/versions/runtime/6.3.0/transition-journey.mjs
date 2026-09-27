import assert from 'node:assert/strict';
import {exactKeys,isDigest,isId,probeDigest} from '../../probe-session.mjs';
import {verifyBinding,verifyReview} from './binding-journey.mjs';

const selection=review=>({projectId:review.scope.projectId,catalogId:review.catalogId,artifactSetDigest:review.pins.artifactSetDigest,bundleDigest:review.pins.bundleRef.digest});
const hashed=(record,key)=>{const {[key]:hash,...body}=record;assert.ok(isDigest(hash));assert.equal(probeDigest(body),hash,'RC02_DIGEST_MISMATCH');};
const record=(value,scope)=>verifyBinding(value,value.review,selection(value.review),scope,value.decision.principal.id);
export function assertTransitionReview({review,from,targetReview,transition,scope}) {
  exactKeys(review,['schema','action','expectedHeadDigest','destinationDigest','scope','fromBindingDigest','targetReview','changedFields','effect','mutatesExistingExecutions','grantsExecutionAuthority','transitionReviewDigest']);
  hashed(review,'transitionReviewDigest');assert.equal(review.schema,'evopilot-project-semantic-transition-review/v1');
  for(const key of ['action','expectedHeadDigest','destinationDigest'])assert.equal(review[key],transition[key]);
  assert.deepEqual(review.scope,scope);assert.equal(review.fromBindingDigest,from.binding.bindingDigest);
  verifyReview(review.targetReview,selection(targetReview),scope);assert.deepEqual(review.targetReview,targetReview,'RC02_TARGET_REVIEW_CHANGED');
  const fields=r=>({catalogId:r.catalogId,projectRevisionDigest:r.projectRevisionDigest,...r.pins});
  const before=fields(from.review),after=fields(targetReview);
  assert.deepEqual(review.changedFields,Object.keys(before).filter(k=>probeDigest(before[k])!==probeDigest(after[k])).sort());
  assert.equal(review.effect,'FUTURE_EXECUTION_PLANS_ONLY');assert.equal(review.mutatesExistingExecutions,false);assert.equal(review.grantsExecutionAuthority,false);
}

/** Independent history oracle. Never imports Runtime implementation or infers
 * permission from a receipt. Initial binding must be pinned by the campaign. */
export function assertActivationHistory({state,initial,scope}) {
  record(initial,scope);exactKeys(state,['schema','headDigest','status','bindingDigest','transitions','grantsExecutionAuthority']);
  assert.equal(state.schema,'evopilot-project-semantic-activation/v1');assert.equal(state.grantsExecutionAuthority,false);
  assert.ok(Array.isArray(state.transitions)&&state.transitions.length<=64);
  let current=initial,head=initial.binding.bindingDigest;const records=[initial],seen=new Set();
  for(const [index,item] of state.transitions.entries()) {
    exactKeys(item,['schema','review','destination','decision','transitionDigest']);hashed(item,'transitionDigest');
    assert.equal(item.schema,'evopilot-project-semantic-transition/v1');assert.ok(!seen.has(item.transitionDigest));seen.add(item.transitionDigest);
    const {review,destination,decision}=item;record(destination,scope);
    assert.equal(review.expectedHeadDigest,head,'RC02_BROKEN_HISTORY');
    assert.ok(['ACTIVATE','MIGRATE','ROLLBACK'].includes(review.action));
    assertTransitionReview({review,from:current,targetReview:destination.review,transition:review,scope});
    exactKeys(decision,['decision','principal','approvedAt','approvalPolicy','transitionReviewDigest','decisionDigest']);hashed(decision,'decisionDigest');
    exactKeys(decision.principal,['id','role','tenantId','workspaceId']);
    assert.equal(decision.decision,'APPROVE');assert.equal(decision.transitionReviewDigest,review.transitionReviewDigest);
    assert.equal(decision.approvalPolicy,'current-scoped-operator-or-admin/v1');assert.ok(isId(decision.principal.id));
    assert.ok(['operator','admin'].includes(decision.principal.role));assert.equal(decision.principal.tenantId,scope.tenantId);assert.equal(decision.principal.workspaceId,scope.workspaceId);
    assert.ok(Number.isFinite(Date.parse(decision.approvedAt)));
    if(review.action==='ACTIVATE') {assert.equal(index,0);assert.deepEqual(destination,initial);assert.equal(review.destinationDigest,initial.binding.bindingDigest);}
    else if(review.action==='MIGRATE') {
      assert.ok(index>0);assert.equal(review.destinationDigest,destination.review.reviewDigest);
      assert.notEqual(destination.review.reviewDigest,current.review.reviewDigest);
      assert.deepEqual(decision.principal,destination.decision.principal);assert.equal(decision.approvedAt,destination.decision.approvedAt);
    } else {
      assert.ok(index>0);assert.notEqual(destination.binding.bindingDigest,current.binding.bindingDigest);
      assert.equal(review.destinationDigest,destination.binding.bindingDigest);
      assert.ok(records.some(r=>probeDigest(r)===probeDigest(destination)),'RC02_UNRETAINED_ROLLBACK');
    }
    current=destination;head=item.transitionDigest;records.push(destination);
  }
  assert.equal(state.headDigest,head);assert.equal(state.bindingDigest,current.binding.bindingDigest);
  assert.equal(state.status,state.transitions.length?'ACTIVE_FOR_FUTURE_PLANS':'REVIEWED_DEFAULT');
  return {current,records};
}

/** prepare never approves; submit requires the exact external decision and
 * refreshes its reviewed frame; uncertain submit resumes by readback only. */
export async function runRuntimeTransitionJourney({invoke,scope,initial,targetReview,transition,phase='prepare',review,decision,signal,timeoutMs=30000}) {
  assert.equal(typeof invoke,'function');assert.ok(['prepare','submit','readback'].includes(phase));
  assert.ok(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=120000);
  ({scope,initial,targetReview,transition,review,decision}=structuredClone({scope,initial,targetReview,transition,review,decision}));
  exactKeys(scope,['tenantId','workspaceId','projectId']);assert.ok(Object.values(scope).every(isId));record(initial,scope);
  verifyReview(targetReview,selection(targetReview),scope);exactKeys(transition,['action','expectedHeadDigest','destinationDigest']);
  assert.ok(['ACTIVATE','MIGRATE','ROLLBACK'].includes(transition.action));assert.ok([transition.expectedHeadDigest,transition.destinationDigest].every(isDigest));
  if(phase==='prepare')assert.ok(review===undefined&&decision===undefined);
  else {
    assert.ok(review);hashed(review,'transitionReviewDigest');exactKeys(decision,['transitionReviewDigest','decision','principalId']);
    assert.equal(decision.transitionReviewDigest,review.transitionReviewDigest,'RC02_EXACT_DECISION_REQUIRED');assert.equal(decision.decision,'APPROVE');assert.ok(isId(decision.principalId));
    for(const key of Object.keys(transition))assert.equal(review[key],transition[key]);assert.deepEqual(review.targetReview,targetReview);
  }
  const controller=new AbortController(),events=[];let submitted=false,reviewUnresolved=false;
  const cancel=()=>controller.abort(new Error('RC02_CANCELLED'));signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const timer=setTimeout(()=>controller.abort(new Error('RC02_TIMEOUT')),timeoutMs);
  let abort;const cancelled=new Promise((_,reject)=>{abort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',abort,{once:true});});cancelled.catch(()=>{});
  const call=async(operation,options=[])=>{
    controller.signal.throwIfAborted();const args=['project','semantic',operation,scope.projectId,...options,'--json'];
    const response=await Promise.race([Promise.resolve().then(()=>{controller.signal.throwIfAborted();if(operation==='transitionApprove')submitted=true;if(operation==='transitionReview')reviewUnresolved=true;return invoke(args,{signal:controller.signal});}),cancelled]);
    controller.signal.throwIfAborted();exactKeys(response,['exitCode','json']);assert.equal(response.exitCode,0,'RC02_PRODUCT_REFUSAL');
    const bytes=JSON.stringify(response.json);assert.ok(typeof bytes==='string'&&Buffer.byteLength(bytes)<=1048576,'RC02_RESPONSE_LIMIT');
    const {requestId,...body}=JSON.parse(bytes);assert.ok(typeof requestId==='string'&&/^[a-zA-Z0-9._-]{1,128}$/.test(requestId),'RC02_REQUEST_ID_REQUIRED');
    events.push({operation,commandDigest:probeDigest(args),responseDigest:probeDigest(response.json),requestId});return body;
  };
  const report=(status,extra={})=>({schema:'evopilot-runtime-rc02-transition-journey/v1',phase,status,...extra,events,
    observationDigest:probeDigest(events),targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',realHost:'NOT_QUALIFIED',releaseAuthorized:false});
  const reviewOptions=['--action',transition.action,'--expected-head-digest',transition.expectedHeadDigest,'--destination-digest',transition.destinationDigest];
  try {
    const before=await call('activation');const history=assertActivationHistory({state:before,initial,scope});
    if(phase!=='readback') {
      assert.equal(before.headDigest,transition.expectedHeadDigest,'RC02_STALE_HEAD');
      if(transition.action==='MIGRATE')assert.equal(transition.destinationDigest,targetReview.reviewDigest);
      else assert.ok(history.records.some(r=>r.binding.bindingDigest===transition.destinationDigest&&probeDigest(r.review)===probeDigest(targetReview)));
      const fresh=await call('transitionReview',reviewOptions);
      assertTransitionReview({review:fresh,from:history.current,targetReview,transition,scope});
      reviewUnresolved=false;
      if(phase==='prepare')return report('WAITING_EXACT_DECISION',{review:fresh,nextAction:'external-exact-transition-decision'});
      assert.deepEqual(fresh,review,'RC02_REVIEW_DRIFT');
      const receipt=await call('transitionApprove',['--transition-review-digest',decision.transitionReviewDigest,'--decision','APPROVE']);
      assert.deepEqual(receipt.review,review);assert.equal(receipt.decision.principal.id,decision.principalId);
      const after=await call('activation');assertActivationHistory({state:after,initial,scope});
      assert.deepEqual(after.transitions.slice(0,before.transitions.length),before.transitions,'RC02_HISTORY_REWRITTEN');
      assert.ok(after.transitions.some(t=>probeDigest(t)===probeDigest(receipt)),'RC02_RECEIPT_NOT_COMMITTED');
    }
    const state=phase==='readback'?before:await call('activation');assertActivationHistory({state,initial,scope});
    const matches=state.transitions.filter(t=>t.review.transitionReviewDigest===decision.transitionReviewDigest);assert.equal(matches.length,1,'RC02_RECEIPT_NOT_FOUND');
    const receipt=matches[0];assert.deepEqual(receipt.review,review);assert.equal(receipt.decision.principal.id,decision.principalId);
    const after=await call('activation');assert.deepEqual(after,state,'RC02_READBACK_DRIFT');
    return report('TRANSITION_SUBJOURNEY_ASSERTIONS_PASSED',{transitionDigest:receipt.transitionDigest,headDigest:state.headDigest,
      receiptPosition:receipt.transitionDigest===state.headDigest?'CURRENT_HEAD':'HISTORICAL',nextAction:'remaining-independent-RC02-assertions'});
  }catch(error){
    if(submitted)return report('UNKNOWN_OUTCOME',{transitionReviewDigest:decision.transitionReviewDigest,nextAction:'readback-only-no-submission-replay'});
    if(reviewUnresolved)return report('UNKNOWN_OUTCOME',{uncertainOperation:'transitionReview',nextAction:'reconcile-review-only-no-submission-replay'});
    controller.signal.throwIfAborted();throw error;
  }
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',abort);}
}
