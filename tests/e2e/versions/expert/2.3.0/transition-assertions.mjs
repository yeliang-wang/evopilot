import assert from 'node:assert/strict';
import {exactKeys,probeDigest} from '../../probe-session.mjs';
import {assertActivationHistory,assertTransitionReview} from '../../runtime/6.3.0/transition-journey.mjs';

/** Independent presentation checks: a transition receipt is not proof that it
 * remains the current head, or that old executions were migrated. */
export function assertExpertTransitionPresentation({operation,response,explanation,scope,initial,beforeState,targetReview,transition,review,decision}) {
  assert.ok(['activation','transitionReview','transitionApprove'].includes(operation));
  const result=response.structuredContent??response;
  assert.equal(result.schema,'evopilot-mcp-http-result/v1');assert.equal(result.tool,'evopilot_project_semantic_'+operation);
  assert.equal(result.ok,true);assert.equal(result.status,200);assert.equal(response.isError??false,false);
  const data=result.response.data,summary=explanation,base=['schema','status','requestId','canExecute','canComplete','nextAction'];
  assert.equal(summary.schema,'evopilot-expert-semantic-explanation/v1');assert.equal(summary.requestId,result.requestId);
  assert.equal(summary.canExecute,false);assert.equal(summary.canComplete,false);assert.ok(typeof summary.nextAction==='string'&&summary.nextAction.length>0);
  if(operation==='activation') {
    assertActivationHistory({state:data,initial,scope});
    exactKeys(summary,[...base,'headDigest','bindingDigest','transitionCount','transitionReceipts']);
    for(const key of ['status','headDigest','bindingDigest'])assert.equal(summary[key],data[key]);
    assert.equal(summary.transitionCount,data.transitions.length);
    assert.deepEqual(summary.transitionReceipts,data.transitions.map(t=>({transitionDigest:t.transitionDigest,transitionReviewDigest:t.review.transitionReviewDigest})));
  } else {
    const {current}=assertActivationHistory({state:beforeState,initial,scope});assert.equal(beforeState.headDigest,transition.expectedHeadDigest);
    if(operation==='transitionReview') {
      assertTransitionReview({review:data,from:current,targetReview,transition,scope});
      exactKeys(summary,[...base,'transitionReviewDigest','action','expectedHeadDigest','destinationDigest','fromBindingDigest','changedFields','effect']);
      assert.equal(summary.status,'WAITING_EXACT_HUMAN_DECISION');
      for(const key of ['transitionReviewDigest','action','expectedHeadDigest','destinationDigest','fromBindingDigest','changedFields','effect'])assert.deepEqual(summary[key],data[key]);
    } else {
      assert.deepEqual(data.review,review);assert.equal(review.transitionReviewDigest,decision.authorizationDigest);
      assertActivationHistory({state:{...beforeState,status:'ACTIVE_FOR_FUTURE_PLANS',headDigest:data.transitionDigest,
        bindingDigest:data.destination.binding.bindingDigest,transitions:[...beforeState.transitions,data]},initial,scope});
      exactKeys(summary,[...base,'transitionDigest','transitionReviewDigest']);assert.equal(summary.status,'TRANSITION_RECORDED');
      assert.equal(summary.transitionDigest,data.transitionDigest);assert.equal(summary.transitionReviewDigest,review.transitionReviewDigest);
    }
  }
  return {schema:'evopilot-expert-rc02-transition-assertion/v1',operation,status:'TRANSITION_PRESENTATION_ASSERTIONS_PASSED',
    observationDigest:probeDigest({operation,response:result,explanation:summary}),targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',releaseAuthorized:false};
}
