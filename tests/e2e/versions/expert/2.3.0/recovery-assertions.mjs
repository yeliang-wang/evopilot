import assert from 'node:assert/strict';
import {exactKeys,isId,probeDigest} from '../../probe-session.mjs';

// Presentation check against the independently observed MCP reply. Runtime's
// separate readback oracle owns scope, hashes and receipt/report correlations.
export function assertExpertRecoveryPresentation({operation,response,explanation}) {
  assert.ok(['completionReceipt','completionStatus'].includes(operation));
  const r=response.structuredContent??response,s=explanation,data=r.response?.data;
  assert.equal(response.isError??false,false);assert.equal(r.schema,'evopilot-mcp-http-result/v1');
  assert.equal(r.tool,'evopilot_semantic_execution_'+operation);assert.equal(r.ok,true);assert.equal(r.status,200);assert.ok(isId(r.requestId));
  const base=['schema','requestId','canExecute','canComplete','releaseAuthorized','published','goalCompleted','status','nextAction'];
  assert.equal(s.schema,'evopilot-expert-semantic-execution-explanation/v1');assert.equal(s.requestId,r.requestId);
  for(const field of ['canExecute','canComplete','releaseAuthorized','published'])assert.equal(s[field],false);
  assert.ok(typeof s.nextAction==='string'&&s.nextAction.trim().length>0&&s.nextAction.length<=4096);
  if(operation==='completionReceipt'){
    exactKeys(s,[...base,'evidence']);assert.equal(s.status,'RECEIPT_RECORDED');assert.equal(s.goalCompleted,false);
    assert.deepEqual(s.evidence,{receiptDigest:data.receiptDigest});
  }else{
    exactKeys(s,[...base,'progress','blockers','targets','reportDigest','release']);
    for(const field of ['status','progress','blockers','targets','reportDigest','release'])assert.deepEqual(s[field],data[field]);
    assert.equal(s.goalCompleted,data.progress.goalCompleted);
  }
  return {status:'RECOVERY_PRESENTATION_ASSERTIONS_PASSED',observationDigest:probeDigest({operation,response:r,explanation:s}),targetCriteriaClosed:0,releaseAuthorized:false};
}
