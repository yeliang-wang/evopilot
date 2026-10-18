import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOwnerFeedback } from '../../dist/integration/compatibility/feedback/v1/owner.mjs';
import { nativeSha256, referenceForPackage } from '../../dist/integration/compatibility/v1/native.mjs';
import { nativePackage } from '../../projects/evopilot-ontology/tests/fixtures/native/package.mjs';
import { syntheticHarnessPackage } from '../../projects/evopilot-harness/examples/native/package.mjs';
import { loadInstalledProducts } from '../../dist/integration/composition.js';
import { mkdtempSync,realpathSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Synthetic provider-boundary tests. Native engine/process journeys are separate in feedback.test.mjs.
function fixture() {
 const scope={visibility:'private',projectId:'feedback-guard'},db=new DatabaseSync(':memory:');
 const packages={ontology:nativePackage(),harness:syntheticHarnessPackage()};
 const pins=Object.fromEntries(Object.entries(packages).map(([o,p])=>[o,referenceForPackage(p)]));
 const h=nativeSha256('synthetic'),claimId=nativeSha256('claim');
 const body={schema:'evopilot-feedback-event/v1',id:nativeSha256({workspaceId:'synthetic',scope,claimId}),workspaceId:'synthetic',scope,projectId:'candidate',projectCandidateDigest:h,source:{direction:'reverse',locator:'synthetic-source',revision:'fixed',treeDigest:h,inventoryDigest:h,requirementsDigest:h},runId:'rc1',runReviewDigest:h,claimId,inputDigest:h,receiptDigest:h,causeId:claimId,origin:'registered-runtime-run',stage:'SUCCEEDED',pins,results:{ontology:{},harness:{}},collectionRefs:[],observation:{}};
 const event={...body,digest:nativeSha256(body)};
 let source=()=>event;
 const providers={readFeedback:()=>source(),resolveFeedbackMaterial:({reference})=>({reference,scope,workspaceId:'synthetic',published:true,package:packages[reference.product]})};
 const service=createOwnerFeedback({db,identity:{id:'synthetic'},guard(){}},'ontology',providers);
 let seq=0;
 const request=async(operation,input={},overrides={})=>{
  const read=['feedback.inspect','feedback.read','feedback.list'].includes(operation);
  return service.feedback({operation,scope,input,...(read?{}:{requestId:'guard-'+(++seq),expectedRevision:(await service.feedback({operation:'feedback.inspect',scope,input:{}})).revision}),...overrides});
 };
 return {scope,db,event,pins,service,providers,request,source(fn){source=fn;}};
}

test('feedback guards: trusted source, tamper, wrong workspace/scope and no caller-supplied provider',async t=>{
 const f=fixture();t.after(()=>f.db.close());const {event,scope}=f;
 await assert.rejects(f.request('feedback.ingest',{id:event.id,digest:event.digest,event}),{name:'TypeError',message:'Missing or unknown native field'});
 f.source(()=>({...event,digest:nativeSha256('tampered')}));await assert.rejects(f.request('feedback.ingest',{id:event.id,digest:event.digest}),{code:'FEEDBACK_INTEGRITY'});
 f.source(()=>event);await assert.rejects(f.request('feedback.ingest',{id:event.id,digest:event.digest},{scope:{...scope,projectId:'another'}}),{code:'SCOPE_MISMATCH'});
 const untrusted=createOwnerFeedback({db:f.db,identity:{id:'synthetic'},guard(){}},'ontology',{});
 await assert.rejects(untrusted.feedback({operation:'feedback.ingest',scope,input:{id:event.id,digest:event.digest},requestId:'untrusted',expectedRevision:0}),{code:'UNTRUSTED_FEEDBACK'});
 await f.request('feedback.ingest',{id:event.id,digest:event.digest});
 const original=await f.request('feedback.read',{id:event.id});
 await f.request('feedback.ingest',{id:event.id,digest:event.digest});assert.deepEqual(await f.request('feedback.read',{id:event.id}),original);
 assert.equal((await f.request('feedback.list')).length,1);
 await assert.rejects(f.request('feedback.read',{id:event.id},{scope:{...scope,visibility:'public'}}),{code:'NOT_FOUND'});
 f.source(()=>{throw Object.assign(Error('Source has changed'),{code:'SOURCE_DRIFT'});});
 await assert.rejects(f.request('feedback.propose',{id:event.id,proposal:{mode:'REUSE',reference:f.pins.ontology,rationale:'Synthetic unchanged source',changes:[]}}),{code:'SOURCE_DRIFT'});
 assert.equal((await f.request('feedback.read',{id:event.id})).review,null);
});

test('feedback guards: competing proposals use CAS and stale reviews cannot decide',async t=>{
 const f=fixture();t.after(()=>f.db.close());const {event,scope}=f;
 await f.request('feedback.ingest',{id:event.id,digest:event.digest});
 const revision=(await f.request('feedback.inspect')).revision;
 const make=(requestId,rationale)=>({operation:'feedback.propose',scope,input:{id:event.id,proposal:{mode:'REUSE',reference:f.pins.ontology,rationale,changes:[]}},requestId,expectedRevision:revision});
 const results=await Promise.allSettled([f.service.feedback(make('a','First interpretation')),f.service.feedback(make('b','Second interpretation'))]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'REVISION_CONFLICT');
 const before=(await f.request('feedback.read',{id:event.id})).review;
 await f.request('feedback.propose',{id:event.id,proposal:{mode:'REUSE',reference:f.pins.ontology,rationale:'Revised exact interpretation',changes:[]}});
 await assert.rejects(f.request('feedback.decide',{id:event.id,reviewDigest:before.reviewDigest,decision:'APPROVE',humanEvidenceRef:'synthetic-unreviewed'}),{code:'REVIEW_REQUIRED'});
 assert.equal((await f.request('feedback.read',{id:event.id})).disposition,null);
});

test('owner shutdown cannot close a database while feedback is pending',async t=>{
 const apis=await loadInstalledProducts(),f=fixture();t.after(()=>f.db.close());
 const root=realpathSync(mkdtempSync(join(tmpdir(),'feedback-lifecycle-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const owner of ['harness','ontology']){
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const options={workspaceRoot:join(root,owner),workspaceId:'synthetic'},create=apis[owner]['create'+owner[0].toUpperCase()+owner.slice(1)+'Service'];
  let service=create(options,{readFeedback:()=>pending});service.initialize();
  const work=service.feedback({operation:'feedback.ingest',scope:f.scope,input:{id:f.event.id,digest:f.event.digest},requestId:'pending-ingest',expectedRevision:0});
  assert.throws(()=>service.close(),{code:'BUSY'});release(f.event);await work;service.close();
  service=create(options);service.initialize();assert.equal((await service.feedback({operation:'feedback.list',scope:f.scope,input:{}})).length,1);service.close();
 }
});
