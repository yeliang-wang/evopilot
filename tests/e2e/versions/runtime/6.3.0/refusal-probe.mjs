import assert from 'node:assert/strict';
import {exactKeys,isId,isDigest,probeDigest,probeSession} from '../../probe-session.mjs';

// Closed set of deterministic Catalog refusals. TIMEOUT, CANCELLED, DRIFT and
// generic IO/transport failures deliberately cannot satisfy this oracle.
const refusals=Object.freeze({UNSUPPORTED:409,INVALID:409,DIGEST_MISMATCH:409,PATH_DENIED:409,
  SCOPE_INVALID:409,PARENT_INVALID:409,REVOKED:409,TRUST_REQUIRED:409,PERMISSION_DENIED:403,UNAVAILABLE:404});
const reasons=['REQUIREMENTS_NOT_DECLARED','FOUNDATION_MISMATCH','REQUIRED_CONCEPT_MISSING','REQUIRED_META_TYPE_MISMATCH',
  'PROHIBITED_CONCEPT_PRESENT','EXPLICIT_RELATION_MISSING','EVIDENCE_REQUIREMENTS_UNVERIFIED','EXTERNAL_REASONER_UNVERIFIED'];
function assertUsageMeta(meta) {
  exactKeys(meta,['llm']);const v=meta.llm,optional=['provider','model','version','metricsPath','latest'];
  const totals=['calls','succeeded','failed','totalTokens','inputTokens','outputTokens','creditsConsumed'];
  exactKeys(v,['schema','configured','creditUnit',...totals,...optional.filter(k=>Object.hasOwn(v,k))]);
  assert.equal(v.schema,'evopilot-llm-usage-meta/v1');assert.equal(typeof v.configured,'boolean');assert.equal(v.creditUnit,'token');
  for(const k of totals)assert.ok(Number.isFinite(v[k])&&v[k]>=0);
  for(const k of optional.filter(k=>k!=='latest'))if(Object.hasOwn(v,k))assert.ok(typeof v[k]==='string'&&v[k].length<=4096);
  if(v.latest!==undefined){const optionalLatest=['requestId','caller','intent','provider','model','version','status','recordedAt'];
    exactKeys(v.latest,['totalTokens','creditsConsumed',...optionalLatest.filter(k=>Object.hasOwn(v.latest,k))]);
    for(const k of ['totalTokens','creditsConsumed'])assert.ok(Number.isFinite(v.latest[k])&&v.latest[k]>=0);
    for(const k of optionalLatest)if(Object.hasOwn(v.latest,k))assert.ok(typeof v.latest[k]==='string'&&v.latest[k].length<=4096);
  }
  // This is server metadata, not per-probe model usage or execution authority.
}
export function validateRefusalInput({selection,scope,expected}) {
  exactKeys(selection,['projectId','catalogId','artifactSetDigest','bundleDigest']);exactKeys(scope,['tenantId','workspaceId','projectId']);
  assert.ok([selection.projectId,selection.catalogId,...Object.values(scope)].every(isId));assert.equal(selection.projectId,scope.projectId);
  assert.ok([selection.artifactSetDigest,selection.bundleDigest].every(isDigest));
  if(expected.kind==='CATALOG_REFUSAL'){exactKeys(expected,['kind','code']);assert.ok(Object.hasOwn(refusals,expected.code),'RC03_REFUSAL_CODE_DENIED');}
  else {
    exactKeys(expected,['kind','status','reasons']);assert.equal(expected.kind,'COMPATIBILITY_STOP');
    assert.ok(['INCOMPATIBLE','INDETERMINATE'].includes(expected.status));
    assert.ok(Array.isArray(expected.reasons)&&expected.reasons.length>0&&expected.reasons.every(x=>reasons.includes(x)));
    assert.equal(new Set(expected.reasons).size,expected.reasons.length);
    const incompatible=expected.reasons.some(x=>['FOUNDATION_MISMATCH','REQUIRED_CONCEPT_MISSING','REQUIRED_META_TYPE_MISMATCH','PROHIBITED_CONCEPT_PRESENT','EXPLICIT_RELATION_MISSING'].includes(x));
    assert.equal(expected.status,incompatible?'INCOMPATIBLE':'INDETERMINATE','RC03_EXPECTED_STATUS_REASON_CONFLICT');
  }
}
export function assertCatalogRefusal(body,code) {
  assert.ok(Object.hasOwn(refusals,code),'RC03_REFUSAL_CODE_DENIED');
  exactKeys(body,['error','requestId','nextAction','meta']);assertUsageMeta(body.meta);assert.equal(body.error,'SEMANTIC_CATALOG_'+code,'RC03_WRONG_REFUSAL');
  assert.ok(typeof body.requestId==='string'&&/^[a-zA-Z0-9._:-]{1,256}$/.test(body.requestId),'RC03_REQUEST_ID_MISSING');
  assert.equal(body.nextAction,code==='UNAVAILABLE'?'configure-published-semantic-catalog':code==='PERMISSION_DENIED'?'review-catalog-permission':'review-semantic-catalog');
  return refusals[code];
}
/** Preserve CLI JSON stderr only for a named Catalog refusal. No human-output
 * parsing or invented HTTP status (the CLI does not expose HTTP status). */
export function runtimeRefusalCliResult(exitCode,stdout,stderr) {
  assert.ok([stdout,stderr].every(x=>typeof x==='string'&&Buffer.byteLength(x)<=1048576));
  if(exitCode===0){assert.equal(stderr.trim(),'','RC03_UNEXPECTED_STDERR');return {exitCode,json:JSON.parse(stdout)};}
  assert.equal(exitCode,1,'RC03_ABNORMAL_EXIT');assert.equal(stdout.trim(),'','RC03_MIXED_OUTPUT');
  const error=JSON.parse(stderr);exactKeys(error,['error','body']);assert.equal(error.error,error.body?.error);
  const code=error.error?.replace(/^SEMANTIC_CATALOG_/,'');assertCatalogRefusal(error.body,code);
  return {exitCode,json:error.body};
}
export function assertCompatibilityStop({body,selection,scope,expected}) {
  const {requestId,...inspection}=body;
  assert.ok(typeof requestId==='string'&&requestId.length>0&&requestId.length<=256);
  const {inspectionDigest,...core}=inspection;assert.equal(inspectionDigest,probeDigest(core),'RC03_INSPECTION_DIGEST');
  exactKeys(core,['schema','projectId','projectRevisionDigest','catalogId','registryDigest','policyDigest','generationDigest','pointerDigest','closureDigest','report','eligibleForExecution','bindingCreated']);
  assert.equal(core.schema,'evopilot-project-semantic-compatibility-inspect/v1');assert.equal(core.projectId,selection.projectId);assert.equal(core.catalogId,selection.catalogId);
  for(const k of ['projectRevisionDigest','registryDigest','policyDigest','generationDigest','pointerDigest','closureDigest'])assert.ok(isDigest(core[k]));
  assert.equal(core.eligibleForExecution,false);assert.equal(core.bindingCreated,false);
  const {compatibilityDigest,...report}=core.report;assert.equal(compatibilityDigest,probeDigest(report),'RC03_COMPATIBILITY_DIGEST');
  exactKeys(report,['schema','status','scope','artifactSetDigest','snapshotDigest','skillDigest','provenanceDigest','bundleRef','harnessClosure',
    'requirementsDigest','reasoningProfileDigest','evaluationMode','reasons','matchedRequiredConceptIds','missingRequiredConceptIds',
    'mismatchedMetaTypeConceptIds','presentProhibitedConceptIds','missingRelations','eligibleForExecution','bindingCreated','authority','nextAction']);
  for(const k of ['artifactSetDigest','snapshotDigest','skillDigest','provenanceDigest','reasoningProfileDigest'])assert.ok(isDigest(report[k]));
  assert.ok(report.requirementsDigest===null||isDigest(report.requirementsDigest));
  assert.equal(report.schema,'evopilot-project-semantic-compatibility/v1');assert.equal(report.status,expected.status);
  assert.deepEqual(report.scope,scope);assert.equal(report.artifactSetDigest,selection.artifactSetDigest);assert.equal(report.bundleRef.digest,selection.bundleDigest);
  assert.deepEqual(report.reasons,[...expected.reasons].sort(),'RC03_WRONG_COMPATIBILITY_REASON');
  assert.equal(report.evaluationMode,'EXPLICIT_SNAPSHOT_FACTS_ONLY');assert.equal(report.eligibleForExecution,false);assert.equal(report.bindingCreated,false);
  assert.deepEqual(report.authority,{semanticCompatibilityOnly:true,harnessEligibilityIndependent:true,mayApprove:false,mayPublish:false,mayBind:false});
  assert.equal(report.nextAction,expected.status==='INCOMPATIBLE'?'review-semantic-gap':'review-semantic-compatibility-evidence');
  return inspectionDigest;
}
/** One externally prepared negative condition, read twice without mutation or
 * repair. A supplied expectation is NOT proof that a fixture was prepared or
 * that the complete RC03 matrix ran; the campaign owns both independently. */
export async function runRuntimeRefusalProbe({invoke,selection,scope,expected,signal,timeoutMs}) {
  validateRefusalInput({selection,scope,expected});({selection,scope,expected}=structuredClone({selection,scope,expected}));
  const operation=expected.kind==='CATALOG_REFUSAL'?'inspect':'compatibility';
  const args=['project','semantic',operation,selection.projectId,'--catalog',selection.catalogId];
  if(operation==='compatibility')args.push('--artifact-set-digest',selection.artifactSetDigest,'--bundle-digest',selection.bundleDigest);
  args.push('--json');let first;
  const report=await probeSession({product:'runtime',version:'6.3.0',invoke,signal,timeoutMs},async request=>{
    for(let i=0;i<2;i++) {
      const r=await request(args);let stable;
      if(expected.kind==='CATALOG_REFUSAL'){assert.equal(r.exitCode,1,'RC03_EXPECTED_REFUSAL');assertCatalogRefusal(r.json,expected.code);stable=probeDigest({error:r.json.error,nextAction:r.json.nextAction});}
      else {assert.equal(r.exitCode,0,'RC03_TRANSPORT_IS_NOT_COMPATIBILITY');stable=assertCompatibilityStop({body:r.json,selection,scope,expected});}
      if(i)assert.equal(stable,first,'RC03_READBACK_DRIFT');else first=stable;
    }
  });
  return {...report,status:'REFUSAL_SUBCASE_ASSERTIONS_PASSED',expected:structuredClone(expected),
    inputDigest:probeDigest({selection,scope,expected}),fixtureQualification:'REQUIRES_INDEPENDENT_CAMPAIGN_VERIFICATION'};
}
