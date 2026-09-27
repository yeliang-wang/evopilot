import assert from 'node:assert/strict';
import {exactKeys,isDigest,isId,probeDigest} from '../../probe-session.mjs';

/** Presentation only, independently compared with the actual observed MCP
 * reply. Runtime's execution oracle owns outcome correctness. Neither check
 * qualifies an installed SDK, real Host, business truth or release authority. */
export function assertExpertExecutionPresentation({operation,response,explanation}) {
  assert.ok(['resolve','review','approveReview','dispatch','collect','evaluate'].includes(operation));
  const result=response.structuredContent??response,data=result.response?.data;
  assert.equal(result.schema,'evopilot-mcp-http-result/v1');assert.equal(result.tool,'evopilot_semantic_execution_'+operation);
  assert.equal(result.ok,true);assert.equal(result.status,200);assert.equal(response.isError??false,false);assert.ok(isId(result.requestId));
  assert.ok(data&&typeof data==='object'&&!Array.isArray(data));
  const s=explanation,base=['schema','requestId','canExecute','canComplete','releaseAuthorized','published','goalCompleted','status','nextAction'];
  assert.equal(s.schema,'evopilot-expert-semantic-execution-explanation/v1');assert.equal(s.requestId,result.requestId);
  for(const key of ['canExecute','canComplete','releaseAuthorized','published','goalCompleted'])assert.equal(s[key],false);
  assert.ok(typeof s.nextAction==='string'&&s.nextAction.trim().length>0&&s.nextAction.length<=4096);
  if(operation==='evaluate') {
    exactKeys(s,[...base,'business','harness','agentStatus','outcomeDigest','evidenceTrust','collectorTrust']);
    assert.equal(data.schema,'evopilot-semantic-execution-outcome/v1');assert.equal(data.eligibleForCompletion,false);
    for(const key of ['status','business','harness','agentStatus','outcomeDigest','evidenceTrust','collectorTrust'])assert.deepEqual(s[key],data[key]);
    assert.ok(isDigest(data.outcomeDigest));
    assert.ok(['PASSED','FAILED','INDETERMINATE'].includes(data.business.status)&&['PASSED','FAILED','INDETERMINATE'].includes(data.harness.status));
    assert.equal(s.status,data.agentStatus==='FAILED'||[data.business.status,data.harness.status].includes('FAILED')?'FAILED':
      data.agentStatus==='SUCCEEDED'&&data.business.status==='PASSED'&&data.harness.status==='PASSED'?'DUAL_VALIDATED_NOT_COMPLETED':'INDETERMINATE');
  } else if(operation==='dispatch') {
    exactKeys(s,[...base,'agentStatus','executionRequestId','requestDigest']);
    assert.equal(data.schema,'evopilot-semantic-dispatch-result/v1');assert.equal(data.eligibleForCompletion,false);
    assert.ok(['SUCCEEDED','FAILED','UNCERTAIN'].includes(data.result.status));
    assert.equal(s.agentStatus,data.result.status);assert.equal(s.executionRequestId,data.requestId);assert.equal(s.requestDigest,data.requestDigest);
    assert.equal(s.status,data.result.status==='SUCCEEDED'?'RECEIVED_PENDING_DUAL_VALIDATION':data.result.status==='FAILED'?'FAILED':'BLOCKED');
  } else {
    exactKeys(s,[...base,'evidence',...(operation==='collect'?['origin']:[])]);
    const states={resolve:'PREPARED_NOT_DISPATCHED',review:'WAITING_EXACT_HUMAN_DECISION',approveReview:'RECEIPT_RECORDED',collect:'COLLECTED_NOT_COMPLETED'};
    assert.equal(s.status,states[operation]);
    const fields={resolve:['sliceDigest'],review:['reviewDigest','sliceDigest'],approveReview:['reviewDigest','decisionDigest'],collect:['requestDigest','receiptDigest']}[operation];
    exactKeys(s.evidence,fields);for(const key of fields){assert.ok(isDigest(data[key]));assert.equal(s.evidence[key],data[key]);}
    if(operation==='collect')assert.equal(s.origin,data.origin);
  }
  return {schema:'evopilot-expert-rc04-presentation-assertion/v1',operation,status:'PRESENTATION_ASSERTIONS_PASSED',
    observationDigest:probeDigest({operation,response:result,explanation:s}),targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',realHost:'NOT_QUALIFIED',releaseAuthorized:false};
}
