import assert from 'node:assert/strict';
import {exactKeys,isDigest,isId,probeDigest} from '../../probe-session.mjs';

/** Independent presentation oracle: no Expert/Runtime imports, no tool calls,
 * no mutations. The campaign supplies actual Runtime replies and actual Expert
 * explanations separately; neither product's PASS substitutes for the other. */
export function assertExpertBindingPresentation({operation,response,explanation,selection,scope}) {
  assert.ok(['onboarding','review','approve','binding'].includes(operation));
  exactKeys(selection,['projectId','catalogId','artifactSetDigest','bundleDigest']);exactKeys(scope,['tenantId','workspaceId','projectId']);
  assert.ok([selection.projectId,selection.catalogId,...Object.values(scope)].every(isId));assert.equal(selection.projectId,scope.projectId);
  assert.ok([selection.artifactSetDigest,selection.bundleDigest].every(isDigest));
  const result=response.structuredContent??response;
  assert.equal(result.schema,'evopilot-mcp-http-result/v1');assert.equal(result.tool,'evopilot_project_semantic_'+operation);
  assert.equal(result.ok,true);assert.equal(result.status,200);assert.equal(response.isError??false,false);
  const data=result.response.data,summary=explanation;
  assert.equal(summary.schema,'evopilot-expert-semantic-explanation/v1');assert.equal(summary.requestId,result.requestId);
  assert.equal(summary.canExecute,false);assert.equal(summary.canComplete,false);
  assert.ok(typeof summary.nextAction==='string'&&summary.nextAction.length>0);
  const base=['schema','requestId','canExecute','canComplete','status','nextAction'];
  if(operation==='onboarding') {
    exactKeys(summary,[...base,'recommendedBindingMode','candidates','existingBinding','missingInputs','businessField','productType','onboardingDigest']);
    assert.equal(data.schema,'evopilot-project-semantic-onboarding/v1');assert.equal(data.projectId,selection.projectId);assert.equal(data.catalogId,selection.catalogId);
    assert.equal(data.bindingCreated,false);assert.equal(data.eligibleForExecution,false);assert.equal(data.grantsExecutionAuthority,false);assert.equal(data.selectedCandidate,null);
    assert.equal(data.requiresSeparateBindingApproval,true);assert.ok(isDigest(data.onboardingDigest));
    for(const field of ['status','recommendedBindingMode','candidates','existingBinding','missingInputs','onboardingDigest'])assert.deepEqual(summary[field],data[field]);
    assert.equal(summary.businessField,null);assert.equal(summary.productType,null);
    if(data.existingBinding===null) {
      assert.ok(['REVIEW_REQUIRED','SELECTION_REQUIRED'].includes(summary.status));
      assert.equal(summary.recommendedBindingMode,'DUAL_BINDING_REVIEW');
      assert.equal(data.candidates.filter(x=>x.artifactSetDigest===selection.artifactSetDigest&&x.bundleDigest===selection.bundleDigest&&x.status==='COMPATIBLE').length,1);
    } else {assert.equal(summary.status,'EXISTING_BINDING');assert.equal(summary.recommendedBindingMode,'PRESERVE_EXISTING_BINDING');assert.ok(isDigest(summary.existingBinding.bindingDigest));}
  } else {
    const review=operation==='review'?data:data.review;
    assert.equal(review.schema,'evopilot-project-semantic-binding-review/v1');assert.deepEqual(review.scope,scope);
    assert.equal(review.catalogId,selection.catalogId);assert.equal(review.pins.artifactSetDigest,selection.artifactSetDigest);assert.equal(review.pins.bundleRef.digest,selection.bundleDigest);
    const {reviewDigest,...body}=review;assert.equal(reviewDigest,probeDigest(body));
    assert.equal(review.bindingCreated,false);assert.equal(review.eligibleForExecution,false);
    if(operation==='review') {exactKeys(summary,[...base,'reviewDigest']);assert.equal(summary.status,'WAITING_EXACT_HUMAN_DECISION');assert.equal(summary.reviewDigest,reviewDigest);}
    else {
      exactKeys(summary,[...base,'bindingDigest']);assert.equal(summary.status,'REVIEWED_NOT_ACTIVATED');
      assert.equal(data.binding.schema,'evopilot-project-semantic-binding/v1');assert.deepEqual(data.binding.scope,scope);
      assert.equal(data.binding.status,'REVIEWED_NOT_ACTIVATED');assert.equal(data.binding.eligibleForExecution,false);
      assert.equal(data.binding.reviewDigest,reviewDigest);assert.deepEqual(data.binding.pins,review.pins);
      const {bindingDigest,...bindingBody}=data.binding;assert.equal(bindingDigest,probeDigest(bindingBody));assert.equal(summary.bindingDigest,bindingDigest);
    }
  }
  return {schema:'evopilot-expert-rc01-presentation-assertion/v1',operation,status:'PRESENTATION_ASSERTIONS_PASSED',
    observationDigest:probeDigest({operation,response:result,explanation:summary}),targetCriteriaClosed:0,
    formalAcceptance:'NOT_EVALUATED',realHost:'NOT_QUALIFIED',releaseAuthorized:false};
}
