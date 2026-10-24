import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixture, syntheticModelingIntent, write} from './fixtures/native-project.mjs';
import {createNativeProjectRouter} from '../../dist/integration/workspace/native-router.js';
import {inspectSourceInventory} from '../../dist/integration/workspace/native-project.js';
import {nativeSha256} from '../../dist/integration/compatibility/v1/native.mjs';
import {MODELING_PROFILES} from '../../dist/integration/workspace/modeling-intent.js';
import {safeDiagnostic} from '../../dist/plugins/codex/diagnostics.js';

const retained=f=>path.join(f.stateRoot,'state/project-standards',f.scope.visibility,f.scope.projectId);
const noCandidate=f=>assert.equal(fs.existsSync(path.join(retained(f),'candidates',f.input.id+'.json')),false);
const intent=(f,changes={})=>syntheticModelingIntent({...f,workspaceId:'synthetic'},changes);

test('modeling admission diagnostics preserve actionable safe codes without arbitrary provider text',()=>{
 for(const code of ['MODELING_INTENT_REQUIRED','MODELING_INTENT_INVALID','MODELING_INTENT_AMBIGUOUS','MODELING_INTENT_LEVEL','MODELING_INTENT_STALE','MODELING_INTENT_ACCEPTANCE','HUMAN_EVIDENCE_REQUIRED']){
  const diagnostic=safeDiagnostic(code);assert.equal(diagnostic.code,code);assert.equal(diagnostic.diagnostic.retrySafe,false);assert.notEqual(diagnostic.diagnostic.category,'TRANSPORT');
 }
 assert.equal(safeDiagnostic('MODELING_INTENT_SECRET_PROVIDER_TEXT').code,'CONNECTION_ERROR');
});

test('reverse admission precedes source inventory and all candidate writes',async()=>{
 const f=fixture('reverse');try{const input={...f.input,sourceRoot:'/not-a-real-source'};delete input.modelingIntent;
 await assert.rejects(f.service.prepare(input),{code:'MODELING_INTENT_REQUIRED'});noCandidate(f);
 await assert.rejects(f.service.preflight({project:input,packages:f.packages}),{code:'MODELING_INTENT_REQUIRED'});noCandidate(f);
 }finally{f.cleanup();}
});
for(const field of ['purpose','functionalScope','exclusions','targetLevel','requirementsDigest','acceptance','userIntentOrigin'])test('missing mandatory modeling field blocks writes: '+field,async()=>{
 const f=fixture('reverse');try{delete f.input.modelingIntent.definition[field];await assert.rejects(f.service.prepare(f.input),{code:'MODELING_INTENT_INVALID'});noCandidate(f);}finally{f.cleanup();}
});
test('a boolean approval or absent actual intent evidence cannot replace the binding',async()=>{
 const f=fixture('reverse');try{f.input.modelingIntent={definition:f.input.modelingIntent.definition,approved:true};await assert.rejects(f.service.prepare(f.input));noCandidate(f);
 f.input.modelingIntent=intent(f);f.input.modelingIntent.humanEvidenceRef='approved';await assert.rejects(f.service.prepare(f.input),{code:'HUMAN_EVIDENCE_REQUIRED'});noCandidate(f);
 }finally{f.cleanup();}
});
test('unresolved intent is blocked even with a syntactically valid evidence record',async()=>{
 const f=fixture('reverse');try{f.input.modelingIntent=intent(f,{unresolvedQuestions:['Which module is included?']});await assert.rejects(f.service.prepare(f.input),{code:'MODELING_INTENT_AMBIGUOUS'});noCandidate(f);}finally{f.cleanup();}
});
for(const level of ['L1','L2','L3'])test('cumulative '+level+' profile admits preparation without awarding a verified level',async()=>{
 const f=fixture('reverse');try{f.input.modelingIntent=intent(f,{targetLevel:level,useCase:level==='L1'?'understand':level==='L2'?'implement':'reconstruct',behaviors:level==='L1'?[]:['The independently specified synthetic behavior'],reconstruction:level==='L3'?{inputMode:'SPECIFICATION_ONLY',independentAttempts:2,oraclePlan:'Independent withheld contract cases',environment:'Pinned isolated Node environment'}:null});
 const c=await f.service.prepare(f.input);assert.equal(c.modelingIntent.definition.targetLevel,level);assert.equal(c.verifiedLevel,undefined);assert.equal(c.authority,false);
 assert.deepEqual(MODELING_PROFILES[level].includes,level==='L1'?[]:level==='L2'?['L1']:['L1','L2']);
 }finally{f.cleanup();}
});
test('implementation/reconstruction intent cannot select an insufficient target or omit its profile',async()=>{
 const f=fixture('reverse');try{
 f.input.modelingIntent=intent(f,{useCase:'reconstruct'});await assert.rejects(f.service.prepare(f.input),{code:'MODELING_INTENT_LEVEL'});
 f.input.modelingIntent=intent(f,{targetLevel:'L2'});await assert.rejects(f.service.prepare(f.input),{code:'MODELING_INTENT_INVALID'});
 f.input.modelingIntent=intent(f,{targetLevel:'L3',behaviors:['fixed behavior']});await assert.rejects(f.service.prepare(f.input));noCandidate(f);
 }finally{f.cleanup();}
});
test('clear retained context is reused without a new decision record or duplicate candidate',async()=>{
 const f=fixture('reverse');try{f.input.modelingIntent=intent(f,{userIntentOrigin:'retained-context'});const sourceBefore=fs.readdirSync(path.join(f.root,'synthetic-decision-evidence')).sort();
 const first=await f.service.prepare(f.input),again=await f.service.prepare(f.input);assert.deepEqual(again,first);assert.deepEqual(fs.readdirSync(path.join(f.root,'synthetic-decision-evidence')).sort(),sourceBefore);assert.equal(fs.readdirSync(path.join(retained(f),'candidates')).length,1);
 }finally{f.cleanup();}
});
test('SDK callers cannot mutate the requirement binding while preparation is pending',async()=>{
 const f=fixture('reverse');try{
 const before=structuredClone(f.input.requirements),pending=f.service.prepare(f.input);
 f.input.requirements.ownerRequirements[0].description='Changed after dispatch';
 const candidate=await pending;assert.deepEqual(candidate.requirements,before);
 assert.equal(candidate.modelingIntent.definition.requirementsDigest,nativeSha256(candidate.requirements));
 const subject={...candidate};delete subject.reviewDigest;assert.equal(candidate.reviewDigest,nativeSha256(subject));
 }finally{f.cleanup();}
});
for(const change of ['source','scope','requirements','purpose','target'])test('changed '+change+' cannot reuse the previous intent binding',async()=>{
 const f=fixture('reverse');try{
 if(change==='source')f.input.revision='a'.repeat(40);
 if(change==='scope')f.input.scope={...f.scope,projectId:'different-project'};
 if(change==='requirements')f.input.requirements.ownerRequirements[0].description+=' changed requirement';
 if(change==='purpose')f.input.modelingIntent.definition.purpose='A different purpose';
 if(change==='target')f.input.modelingIntent.definition.targetLevel='L2';
 await assert.rejects(f.service.prepare(f.input));noCandidate(f);
 }finally{f.cleanup();}
});
test('acceptance cannot remove or duplicate mandatory variants',async()=>{
 const f=fixture('reverse');try{const acceptance=structuredClone(f.input.modelingIntent.definition.acceptance);acceptance[0].variantIds.pop();f.input.modelingIntent=intent(f,{acceptance});await assert.rejects(f.service.prepare(f.input),{code:'MODELING_INTENT_ACCEPTANCE'});
 acceptance.push(acceptance[0]);f.input.modelingIntent=intent(f,{acceptance});await assert.rejects(f.service.prepare(f.input),{code:'MODELING_INTENT_ACCEPTANCE'});noCandidate(f);
 }finally{f.cleanup();}
});
test('changed evidence after preparation blocks freeze before validation or writes',async()=>{
 const f=fixture('reverse');try{const c=await f.service.prepare(f.input);const url=new URL(f.input.modelingIntent.humanEvidenceRef);url.hash='';fs.writeFileSync(url,'changed evidence');
 await assert.rejects(f.service.freeze({scope:f.scope,id:f.input.id,reviewDigest:c.reviewDigest,humanEvidenceRef:'unused',packages:f.packages}),{code:'HUMAN_EVIDENCE_REQUIRED'});assert.equal(fs.existsSync(path.join(retained(f),'frozen')),false);
 }finally{f.cleanup();}
});
test('historical reverse candidate remains readable but cannot start new materialization without intent',async()=>{
 const f=fixture('reverse');try{const c=structuredClone(await f.service.prepare(f.input));delete c.modelingIntent;delete c.reviewDigest;c.reviewDigest=nativeSha256(c);
 const subject={candidate:c,reviewEvidenceRef:'historical-synthetic-fixture',frozenAt:'2026-01-01T00:00:00.000Z',authority:false};const frozen={...subject,digest:nativeSha256(subject)};
 const dir=path.join(retained(f),'frozen');fs.mkdirSync(dir,{mode:0o700});write(path.join(dir,f.input.id+'.json'),frozen);
 assert.deepEqual(f.service.inspect({scope:f.scope,id:f.input.id}),frozen);
 await assert.rejects(f.service.materialize({scope:f.scope,id:f.input.id,packages:f.packages}),{code:'MODELING_INTENT_REQUIRED'});
 assert.equal(fs.existsSync(path.join(retained(f),'materials')),false);
 }finally{f.cleanup();}
});
test('read-only source inventory and existing forward preparation do not require reverse intent',async()=>{
 const r=fixture('reverse'),f=fixture();try{delete r.input.modelingIntent;assert.equal(inspectSourceInventory(r.source,'reverse',r.input.revision).files.length,3);noCandidate(r);assert.equal((await f.service.prepare(f.input)).modelingIntent,undefined);}finally{r.cleanup();f.cleanup();}
});
test('direct router shares the SDK gate and cannot supply a bypass flag',async()=>{
 const f=fixture('reverse');try{const router=createNativeProjectRouter({projectRoot:f.projectRoot,stateRoot:f.stateRoot,workspaceId:'synthetic'});const input={...f.input};delete input.modelingIntent;
 await assert.rejects(router.request({operation:'prepare',input}),{code:'MODELING_INTENT_REQUIRED'});await assert.rejects(router.request({operation:'prepare',input:{...input,skipGate:true}}));noCandidate(f);
 const c=await router.request({operation:'prepare',input:f.input});assert.equal(c.modelingIntent.definition.targetLevel,'L1');
 }finally{f.cleanup();}
});
