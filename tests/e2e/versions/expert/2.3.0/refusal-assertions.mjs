import assert from 'node:assert/strict';
import {exactKeys} from '../../probe-session.mjs';
import {validateRefusalInput,assertCatalogRefusal,assertCompatibilityStop} from '../../runtime/6.3.0/refusal-probe.mjs';

/** Independent presentation check against the actual MCP envelope. Neither
 * isError alone nor Expert BLOCKED text proves a Runtime security refusal. */
export function assertExpertRefusalPresentation({operation,response,explanation,selection,scope,expected}) {
  validateRefusalInput({selection,scope,expected});
  assert.equal(operation,expected.kind==='CATALOG_REFUSAL'?'inspect':'compatibility');
  const r=response.structuredContent??response;
  assert.equal(r.schema,'evopilot-mcp-http-result/v1');assert.equal(r.tool,'evopilot_project_semantic_'+operation);
  assert.equal(r.authority,'NONE');assert.equal(explanation.requestId,r.requestId);
  assert.equal(explanation.schema,'evopilot-expert-semantic-explanation/v1');assert.equal(explanation.canExecute,false);assert.equal(explanation.canComplete,false);
  if(expected.kind==='CATALOG_REFUSAL') {
    const status=assertCatalogRefusal(r.response,expected.code);assert.equal(r.requestId,r.response.requestId);
    assert.equal(r.ok,false);assert.equal(r.status,status);if(response.structuredContent)assert.equal(response.isError,true);
    exactKeys(explanation,['schema','status','requestId','httpStatus','canExecute','canComplete','nextAction']);
    assert.equal(explanation.status,'BLOCKED');assert.equal(explanation.httpStatus,status);
    assert.equal(explanation.nextAction,'Inspect Runtime error and authoritative state; do not retry an uncertain mutation or fall back to legacy execution.');
  } else {
    assert.equal(r.ok,true);assert.equal(r.status,200);if(response.structuredContent)assert.equal(response.isError,false);
    assertCompatibilityStop({body:{...r.response.data,requestId:r.requestId},selection,scope,expected});
    exactKeys(explanation,['schema','requestId','canExecute','canComplete','status','projectId','reasons','inspectionDigest','nextAction']);
    assert.equal(explanation.status,expected.status);assert.equal(explanation.projectId,selection.projectId);
    assert.deepEqual(explanation.reasons,r.response.data.report.reasons);assert.equal(explanation.inspectionDigest,r.response.data.inspectionDigest);
    assert.equal(explanation.nextAction,'Explain the Runtime gap and stop; do not pick another asset or invent a successor.');
  }
  return {status:'REFUSAL_PRESENTATION_ASSERTIONS_PASSED',operation,targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',releaseAuthorized:false};
}
