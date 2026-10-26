import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readinessFixture} from './fixtures/readiness.mjs';
import {createAssetConsumption} from '../../dist/integration/consumption/assets.js';
import {startConsumptionHTTP} from '../../dist/integration/consumption/http.js';
import {verifyReadinessProjection,readinessDigest} from '../../dist/integration/compatibility/usability/v2/contract.mjs';
test('independent HTTP / SDK v2 readback preserves both states and closed offline specification',async()=>{
  const f=await readinessFixture();let server;try{
    const r=await f.assess();const api=createAssetConsumption({workspaceId:f.workspaceId,readPackage:async()=>({workspaceId:f.workspaceId,scope:f.scope,package:f.pkg,published:true}),readSnapshot:async()=>{throw Error('not used');},usability:async()=>{throw Error('v1 must not be silently invoked');},readiness:async(owner,request)=>owner==='harness'?f.harness().readiness(request):f.projection});
    const principal={id:'technical-client',grants:[{scope:f.scope,assets:[f.projection.reference],inventories:[],assessments:['counter-assessment']}]};
    const token='x'.repeat(48),authorization={schema:'evopilot-asset-authorization/v1',credentials:[{...principal,tokenDigest:'sha256:'+createHash('sha256').update(token).digest('hex'),enabled:true}]};
    server=await startConsumptionHTTP({host:'127.0.0.1',port:0,readAuthorization:()=>authorization,consume:api.consume});
    const post=async(route,request)=>{const res=await fetch('http://127.0.0.1:'+server.address.port+route,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(request)});return {status:res.status,body:await res.json()};};
    const request={operation:'assets.readiness',scope:f.scope,input:{standardVersion:'v2',id:'counter-assessment'}};
    const http=await post('/v2/assets',request),sdk=await api.consume(principal,request);assert.equal(http.status,200);assert.deepEqual(http.body,sdk);assert.equal(sdk.result.assetAssessment.level,'L3');assert.equal(sdk.result.reconstructionVerification.status,'NOT_REQUESTED');assert.equal(sdk.recordedDigest,r.digest);
    assert.equal((await post('/v1/assets',request)).status,400,'old route cannot return a redefined L3');
    const page=await post('/v2/assets',{operation:'assets.specification.v2',scope:f.scope,input:{standardVersion:'v2',reference:f.projection.reference,limit:1,cursor:null}});assert.equal(page.status,200);assert.equal(page.body.nextCursor,null);const exported={...page.body.projection,files:page.body.files};verifyReadinessProjection(exported);assert.equal(exported.digest,f.projection.digest);assert.equal(exported.specification.intent.functionalScope,f.definition.functionalScope);
    await assert.rejects(api.consume({...principal,grants:[]},request),{code:'CONSUMPTION_FORBIDDEN'});authorization.credentials[0].enabled=false;assert.equal((await post('/v2/assets',request)).status,401);
    assert.deepEqual(f.counts,{execution:0,ssh:0,database:0});
  }finally{if(server)await server.close();f.close();}
});
test('optional reconstruction failure and environment staleness never rewrite content grade',async()=>{
  let reconstruction={status:'FAILED',evidenceDigests:[readinessDigest('failure')],artifactDigest:readinessDigest('artifact'),environmentDigest:readinessDigest('environment'),standardVersion:'v1',scopeDescription:'synthetic counter only'};let calls=0;
  const f=await readinessFixture({reconstructionReader:async()=>{calls++;return reconstruction;}});try{
    const content=await f.assess();assert.equal(calls,0,'content assessment must not request execution evidence by default');
    const reviewed=await f.write('harness','readiness.review.record',{reference:f.projection.reference,report:f.report});
    const result=(await f.write('harness','readiness.assessment.evaluate',{id:'linked',intentDigest:f.intent.digest,reference:f.projection.reference,reviewDigest:reviewed.result.digest,reconstructionEvidenceIds:['v1-assessment:counter']})).result;
    assert.equal(result.assetAssessment.level,'L3');assert.equal(result.reconstructionVerification.status,'FAILED');
    reconstruction={...reconstruction,status:'STALE',environmentDigest:readinessDigest('changed-environment')};const current=await f.read('harness','readiness.assessment.read',{id:'linked'});assert.equal(current.result.assetAssessment.level,'L3');assert.equal(current.result.assetAssessment.freshness,'CURRENT');assert.equal(current.result.reconstructionVerification.status,'STALE');assert.deepEqual(await f.read('harness','readiness.assessment.version',{digest:content.digest}),content);
  }finally{f.close();}
});
test('lost mutation response uses exact original receipt; changed payload and stale CAS refuse',async()=>{
  const f=await readinessFixture();try{
    const expectedRevision=(await f.read('harness','readiness.inspect')).revision;
    const request={operation:'readiness.review.record',scope:f.scope,input:{standardVersion:'v2',reference:f.projection.reference,report:f.report},requestId:'retained-v2-review',expectedRevision};
    const first=await f.harness().readiness(request);f.restart();assert.deepEqual(await f.harness().readiness(request),first);assert.deepEqual(await f.read('harness','readiness.receipt.inspect',{requestId:request.requestId}),first);
    await assert.rejects(f.harness().readiness({...request,input:{...request.input,report:{...f.report,actor:'different'}}}),{code:'REQUEST_CONFLICT'});
    await assert.rejects(f.harness().readiness({...request,requestId:'new-stale-cas'}),{code:'REVISION_CONFLICT'});
  }finally{f.close();}
});
