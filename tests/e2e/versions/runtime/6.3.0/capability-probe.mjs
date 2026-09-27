import assert from 'node:assert/strict';
import {exactKeys,isId,isDigest,probeDigest,probeSession} from '../../probe-session.mjs';

export const capabilityRequiredMessage='SEMANTIC_CAPABILITY_REQUIRED: this Runtime does not advertise the requested project semantic operation; no legacy fallback is allowed';
const operations=['capabilities','inspect','compatibility','review','approve','binding','activation','transitionReview','transitionApprove','onboarding','gap'];
export function validateCapabilityProbeInput({operation,selection,scope,expected}) {
  assert.ok(['inspect','compatibility','onboarding','gap','review'].includes(operation),'CAPABILITY_PROBE_OPERATION_DENIED');
  exactKeys(selection,['projectId','catalogId','artifactSetDigest','bundleDigest']);exactKeys(scope,['tenantId','workspaceId','projectId']);
  assert.ok([selection.projectId,selection.catalogId,...Object.values(scope)].every(isId));assert.equal(selection.projectId,scope.projectId);
  assert.ok([selection.artifactSetDigest,selection.bundleDigest].every(isDigest));
  exactKeys(expected,['kind','capabilityDigest']);assert.equal(expected.kind,'CAPABILITY_MISSING');assert.ok(isDigest(expected.capabilityDigest));
}
/** Independent fixed-wire oracle, never imported from the implementation under
 * test. A hash alone is not sufficient: the selected operation must be absent. */
export function assertMissingCapability({capabilities,operation,projectId,expected}) {
  exactKeys(capabilities,['schema','projectId','operations','executionAvailable','completionAvailable','authority']);
  assert.equal(capabilities.schema,'evopilot-project-semantic-capabilities/v1');assert.equal(capabilities.projectId,projectId);
  assert.equal(capabilities.authority,'RUNTIME_CURRENT_SCOPED_PRINCIPAL');assert.equal(capabilities.executionAvailable,false);assert.equal(capabilities.completionAvailable,false);
  assert.ok(Array.isArray(capabilities.operations)&&capabilities.operations.length>0&&capabilities.operations.length<=operations.length);
  assert.ok(capabilities.operations.every(x=>operations.includes(x)));assert.equal(new Set(capabilities.operations).size,capabilities.operations.length);
  assert.ok(capabilities.operations.includes('capabilities'));assert.equal(capabilities.operations.includes(operation),false,'REQUESTED_CAPABILITY_NOT_MISSING');
  assert.equal(probeDigest(capabilities),expected.capabilityDigest,'CAPABILITY_BINDING_DRIFT');
}
export function assertMissingMcpCapability({response,operation,selection,expected}) {
  const r=response.structuredContent??response;
  exactKeys(r,['schema','tool','authority','status','ok','requestId','response']);
  assert.equal(r.schema,'evopilot-mcp-http-result/v1');assert.equal(r.tool,'evopilot_project_semantic_capabilities');assert.equal(r.authority,'NONE');
  assert.equal(r.ok,true);assert.equal(r.status,200);if(response.structuredContent)assert.equal(response.isError,false);
  assert.ok(typeof r.requestId==='string'&&/^[a-zA-Z0-9._:-]{1,256}$/.test(r.requestId));
  assertMissingCapability({capabilities:r.response.data,operation,projectId:selection.projectId,expected});
}
export function runtimeCapabilityCliResult(exitCode,stdout,stderr) {
  assert.ok([stdout,stderr].every(x=>typeof x==='string'&&Buffer.byteLength(x)<=1048576));
  if(exitCode===0){assert.equal(stderr.trim(),'');return {exitCode,json:JSON.parse(stdout)};}
  assert.equal(exitCode,1,'CAPABILITY_ABNORMAL_EXIT');assert.equal(stdout.trim(),'');
  const json=JSON.parse(stderr);exactKeys(json,['error']);assert.equal(json.error,capabilityRequiredMessage,'CAPABILITY_NAMED_REFUSAL_REQUIRED');
  return {exitCode,json};
}
/** Read-only subset: no review invocation, even when expected to be refused. */
export async function runRuntimeCapabilityProbe({invoke,operation,selection,scope,expected,signal,timeoutMs}) {
  validateCapabilityProbeInput({operation,selection,scope,expected});assert.notEqual(operation,'review','CAPABILITY_READ_ONLY_PROBE');
  ({selection,scope,expected}=structuredClone({selection,scope,expected}));
  const report=await probeSession({product:'runtime',version:'6.3.0',invoke,signal,timeoutMs},async request=>{
    const readCaps=async()=>{
      const r=await request(['project','semantic','capabilities',selection.projectId,'--json']);assert.equal(r.exitCode,0);
      const {requestId,...capabilities}=r.json;assert.ok(typeof requestId==='string'&&requestId.length>0&&requestId.length<=256);
      assertMissingCapability({capabilities,operation,projectId:selection.projectId,expected});
    };
    await readCaps();
    const args=['project','semantic',operation,selection.projectId,'--catalog',selection.catalogId];
    if(['compatibility','gap'].includes(operation))args.push('--artifact-set-digest',selection.artifactSetDigest,'--bundle-digest',selection.bundleDigest);
    args.push('--json');const refusal=await request(args);assert.equal(refusal.exitCode,1);exactKeys(refusal.json,['error']);assert.equal(refusal.json.error,capabilityRequiredMessage);
    await readCaps();
  });
  return {...report,status:'CAPABILITY_STOP_SUBCASE_ASSERTIONS_PASSED',operation,inputDigest:probeDigest({operation,selection,scope,expected}),
    serverNoDispatchEvidence:'REQUIRES_INDEPENDENT_CAMPAIGN_OBSERVATION'};
}
