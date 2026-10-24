import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createOntologyService} from '@evopilot-next/ontology/service';
import {createHarnessService} from '@evopilot-next/harness/service';
import {nativePackage} from '../../projects/evopilot-ontology/tests/fixtures/native/package.mjs';
import {syntheticHarnessPackage} from '../../projects/evopilot-harness/examples/native/package.mjs';
import {nativePackageDigest,nativeSha256} from '../../dist/integration/compatibility/v1/native.mjs';
import {syntheticAuthoring} from './fixtures/authoring.mjs';
import {syntheticDecisionEvidence} from './fixtures/decision-evidence.mjs';
import {fixture,freeze} from './fixtures/native-project.mjs';
import {maintainWorkspace} from '../../dist/integration/workspace/maintenance.js';
const scope={visibility:'private',projectId:'synthetic'};
function env(owner,resolver,withTools=false){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'owner-admission-')),options={workspaceRoot:path.join(root,'state'),workspaceId:'synthetic-admission'};
 const factory=owner==='ontology'?createOntologyService:createHarnessService;
 const providers={...(resolver?{resolveNativeAuthoring:resolver}:{}),...(withTools?{nativeToolchain:JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN))}:{})};
 let service=factory(options,providers);service.initialize();
 const pkg=owner==='ontology'?nativePackage():syntheticHarnessPackage({direction:'reverse'});
 return {root,options,pkg,identity:{id:pkg.manifest.id,version:pkg.manifest.version},get service(){return service;},state(){return service.execute({operation:'workspace.inspect',scope,input:{}});},read(operation,input){return service.native({operation,scope,input});},write(operation,input,requestId){return service.native({operation,scope,input,requestId,expectedRevision:this.state().revision});},reopen(next={}){service.close();service=factory(options,next);service.initialize();},cleanup(){service.close();fs.rmSync(root,{recursive:true,force:true});}};
}
for(const owner of ['ontology','harness']){
 test(owner+': missing trusted resolver blocks new package without a receipt, asset or revision',async()=>{
  const e=env(owner);try{const before=e.state();await assert.rejects(e.write('native.package.put',{package:e.pkg},'no-context'),{code:'AUTHORING_CONTEXT_REQUIRED'});assert.deepEqual(e.state(),before);assert.deepEqual(await e.read('native.package.list',{}),[]);
  await assert.rejects(e.read('native.receipt.inspect',{requestId:'no-context'}),{code:'NOT_FOUND'});
  await assert.rejects(e.write('native.package.put',{package:e.pkg,skipGate:true},'skip'));assert.deepEqual(e.state(),before);
  }finally{e.cleanup();}
 });
 for(const field of ['workspaceId','scope','owner','packageDigest','sourceBindingsDigest','sourceDirection'])test(owner+': resolver cannot return a different '+field,async()=>{
  const e=env(owner,r=>({...syntheticAuthoring(r),[field]:field==='scope'?{...r.scope,projectId:'other'}:field==='sourceDirection'?(r.sourceDirection==='forward'?'reverse':'forward'):field==='owner'?(owner==='ontology'?'harness':'ontology'):field.endsWith('Digest')?'sha256:'+'f'.repeat(64):'other'}));
  try{const before=e.state();await assert.rejects(e.write('native.package.put',{package:e.pkg},'different'),{code:'AUTHORING_CONTEXT_STALE'});assert.deepEqual(e.state(),before);}finally{e.cleanup();}
 });
 test(owner+': async, malformed or caller authority assertions cannot establish admission',async()=>{
  for(const resolver of [async r=>syntheticAuthoring(r),async()=>{throw Error('synthetic-private-provider-error');},()=>({approved:true}),r=>({...syntheticAuthoring(r),authority:true})]){
   const e=env(owner,resolver);try{await assert.rejects(e.write('native.package.put',{package:e.pkg},'invalid'),{code:'AUTHORING_CONTEXT_INVALID'});assert.deepEqual(await e.read('native.package.list',{}),[]);}finally{e.cleanup();}
  }
 });
 test(owner+': reverse authoring requires an actual intent binding in its trusted admission',async()=>{
  const e=env(owner,r=>({...syntheticAuthoring(r),modelingIntentDigest:null,targetLevel:null}));
  try{assert.equal(JSON.parse(e.pkg.files[e.pkg.manifest.sourceBindingRef]).direction,'reverse');const before=e.state();await assert.rejects(e.write('native.package.put',{package:e.pkg},'no-intent'),{code:'AUTHORING_CONTEXT_REQUIRED'});assert.deepEqual(e.state(),before);}finally{e.cleanup();}
 });
 test(owner+': retained admission is rechecked; old exact receipt remains readable after resolver removal',async()=>{
  let drift=false;const e=env(owner,r=>({...syntheticAuthoring(r),...(drift?{candidateDigest:'sha256:'+'a'.repeat(64)}:{})}));
  try{const envelope={operation:'native.package.put',scope,input:{package:e.pkg},requestId:'put',expectedRevision:e.state().revision};const put=await e.service.native(envelope);
   const record=await e.read('native.package.inspect',e.identity);assert.equal(record.authoring.packageDigest,nativePackageDigest(e.pkg));assert.equal(record.authoring.authority,false);assert.equal(record.verifiedLevel,undefined);
   drift=true;const before=e.state();await assert.rejects(e.write('native.package.review',e.identity,'stale'),{code:'AUTHORING_CONTEXT_STALE'});assert.deepEqual(e.state(),before);
   e.reopen();assert.deepEqual(await e.service.native(envelope),put);assert.deepEqual(await e.read('native.package.inspect',e.identity),record);
   await assert.rejects(e.write('native.package.review',e.identity,'missing'),{code:'AUTHORING_CONTEXT_REQUIRED'});
  }finally{e.cleanup();}
 });
 test(owner+': published asset read and actual validation survive missing authoring resolver',async()=>{
  const e=env(owner,syntheticAuthoring,true);try{
   await e.write('native.package.put',{package:e.pkg},'put');await e.write('native.package.validate',e.identity,'validate');const review=(await e.write('native.package.review',e.identity,'review')).result;
   const humanEvidenceRef=syntheticDecisionEvidence(e.root,{owner,operation:'native.package.decide',workspaceId:e.options.workspaceId,scope,reviewDigest:review.reviewDigest,decision:'APPROVE'});
   await e.write('native.package.decide',{...e.identity,reviewDigest:review.reviewDigest,decision:'APPROVE',humanEvidenceRef},'decide');await e.write('native.package.publish',e.identity,'publish');
   const before=await e.read('native.package.readback',e.identity);
   e.reopen({nativeToolchain:JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN))});
   assert.deepEqual(await e.read('native.package.readback',e.identity),before);
   const validation=(await e.write('native.package.validate',e.identity,'consume-existing')).result;assert.equal(owner==='ontology'?validation.status:validation.qualityStatus,owner==='ontology'?'CONFORMS':'PASS');
   assert.deepEqual((await e.read('native.package.readback',e.identity)).package,before.package);
  }finally{e.cleanup();}
 });
 test(owner+': changed admission while actual validation runs cannot commit a passing draft report',async()=>{
  let validating=false,calls=0;const e=env(owner,r=>({...syntheticAuthoring(r),...(validating&&++calls>1?{candidateDigest:'sha256:'+'e'.repeat(64)}:{})}),true);
  try{
   await e.write('native.package.put',{package:e.pkg},'put');validating=true;
   await assert.rejects(e.write('native.package.validate',e.identity,'changed-during-validation'),{code:'AUTHORING_CONTEXT_STALE'});
   assert.equal((await e.read('native.package.inspect',e.identity)).validation,null);
   const retained=await e.read('native.receipt.inspect',{requestId:'changed-during-validation'});
   if(owner==='harness')assert.equal(retained.status,'FAILED');
   else {assert.equal(retained.result.status,'RUNNING');const recovery=await e.write('native.package.reconcile',e.identity,'reconcile-uncertainty');assert.equal(recovery.result.redispatched,false);assert.equal(recovery.result.claim.status,'UNKNOWN');}
  }finally{e.cleanup();}
 });
}

for(const direction of ['forward','reverse'])test('actual project resolver binds '+direction+' source, scope, intent and exact materialized package',async()=>{
 const f=fixture(direction);try{
  const frozen=await freeze(f);await f.service.materialize({scope:f.scope,id:f.input.id,packages:f.packages});
  for(const owner of ['ontology','harness']){
   const pkg=f.packages[owner],bindings=JSON.parse(pkg.files[pkg.manifest.sourceBindingRef]);
   const request={workspaceId:'synthetic',scope:f.scope,owner,packageDigest:nativePackageDigest(pkg),sourceBindingsDigest:nativeSha256(bindings),sourceDirection:direction};
   const admitted=f.service.resolveNativeAuthoring(request);assert.equal(admitted.candidateDigest,frozen.candidate.reviewDigest);assert.equal(admitted.targetLevel,direction==='reverse'?'L1':null);
   assert.throws(()=>f.service.resolveNativeAuthoring({...request,sourceDirection:direction==='reverse'?'forward':'reverse'}),{code:'AUTHORING_CONTEXT_STALE'});
   assert.throws(()=>f.service.resolveNativeAuthoring({...request,packageDigest:'sha256:'+'a'.repeat(64)}),{code:'AUTHORING_CONTEXT_REQUIRED'});
   if(direction==='reverse'){
    const url=new URL(f.input.modelingIntent.humanEvidenceRef);url.hash='';const before=fs.readFileSync(url);fs.writeFileSync(url,'tampered');assert.throws(()=>f.service.resolveNativeAuthoring(request),{code:'HUMAN_EVIDENCE_REQUIRED'});fs.writeFileSync(url,before);
   }
  }
  fs.appendFileSync(path.join(f.source,'ontology.txt'),'changed source');
  const pkg=f.packages.ontology;assert.throws(()=>f.service.resolveNativeAuthoring({workspaceId:'synthetic',scope:f.scope,owner:'ontology',packageDigest:nativePackageDigest(pkg),sourceBindingsDigest:nativeSha256(JSON.parse(pkg.files[pkg.manifest.sourceBindingRef])),sourceDirection:direction}),{code:'AUTHORING_CONTEXT_STALE'});
 }finally{f.cleanup();}
});

test('actual v0.7 records retain read/replay; unfinished drafts block, old writers reject admitted state and backup restores', {skip:!process.env.EVOPILOT_V07_APP&&'Requires actual retained v0.7 code',timeout:60000},async t=>{
 const f=fixture(),options={workspaceRoot:f.stateRoot,workspaceId:'synthetic'},toolchain=JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN));
 const old=await import(pathToFileURL(path.join(fs.realpathSync(process.env.EVOPILOT_V07_APP),'dist/integration/composition.js'))),apis=await old.loadInstalledProducts();
 for(const owner of ['ontology','harness','runtime'])assert.equal(apis[owner].VERSION,'0.7.0');
 let composition=old.createComposition(options,apis,{},{toolchain});const retained={};
 try{
  for(const owner of ['ontology','harness']){
   const envelope={operation:'native.package.put',scope:f.scope,input:{package:f.packages[owner]},requestId:'legacy-draft-'+owner,expectedRevision:composition.inspect(owner,f.scope).revision};
   const receipt=await composition.native(owner,envelope),identity={id:f.packages[owner].manifest.id,version:f.packages[owner].manifest.version};
   retained[owner]={envelope,receipt,identity,record:await composition.native(owner,{operation:'native.package.inspect',scope:f.scope,input:identity})};
   assert.equal(retained[owner].record.authoring,undefined);
  }
  composition.inspect('runtime',f.scope);
  composition.close();composition=null;
  const installationRoot=path.join(f.root,'isolated-candidate');fs.mkdirSync(installationRoot,{mode:0o700});
  const context={projectRoot:f.projectRoot,stateRoot:f.stateRoot,workspaceId:'synthetic',installationRoot},backupRoot=path.join(f.root,'before-admission');
  const backup=maintainWorkspace(context,'backup',{destinationRoot:backupRoot},'before-admission');assert.equal(backup.status,'VERIFIED');
  const frozen=await freeze(f);await f.service.materialize({scope:f.scope,id:f.input.id,packages:f.packages});
  for(const owner of ['ontology','harness']){
   const factory=owner==='ontology'?createOntologyService:createHarnessService,entry=retained[owner];
   const current=factory(options,{nativeToolchain:toolchain,resolveNativeAuthoring:f.service.resolveNativeAuthoring});current.initialize();
   try{
    assert.deepEqual(await current.native({operation:'native.package.inspect',scope:f.scope,input:entry.identity}),entry.record);
    assert.deepEqual(await current.native(entry.envelope),entry.receipt);
    const before=current.execute({operation:'workspace.inspect',scope:f.scope,input:{}}).revision;
    await assert.rejects(current.native({operation:'native.package.review',scope:f.scope,input:entry.identity,requestId:'legacy-continue',expectedRevision:before}),{code:'AUTHORING_CONTEXT_REQUIRED'});
    assert.equal(current.execute({operation:'workspace.inspect',scope:f.scope,input:{}}).revision,before);
    await current.native({...entry.envelope,requestId:'new-bound-admission',expectedRevision:before});
    const updated=await current.native({operation:'native.package.inspect',scope:f.scope,input:entry.identity});assert.equal(updated.authoring.candidateDigest,frozen.candidate.reviewDigest);
   }finally{current.close();}
   const oldReader=apis[owner][owner==='ontology'?'createOntologyService':'createHarnessService'](options);
   try{assert.throws(()=>oldReader.initialize(),{code:'CORRUPT_STATE'});}finally{oldReader.close();}
  }
  fs.renameSync(f.stateRoot,f.stateRoot+'-new-state');fs.renameSync(f.projectRoot,f.projectRoot+'-new-project');
  const restored=maintainWorkspace(context,'restore',{backupRoot},'restore-before-admission');assert.equal(restored.manifestDigest,backup.manifestDigest);
  composition=old.createComposition(options,apis,{},{toolchain});
  for(const owner of ['ontology','harness'])assert.deepEqual(await composition.native(owner,{operation:'native.package.inspect',scope:f.scope,input:retained[owner].identity}),retained[owner].record);
  t.diagnostic(JSON.stringify({actualPreviousVersion:'0.7.0',syntheticProject:true,historicalReadAndReplay:true,legacyDraftBlocked:true,oldWriterRejected:true,stoppedBackupRestored:true,authority:false}));
 }finally{composition?.close();f.cleanup();}
});


test('actual project resolver rejects ambiguous matching candidates without choosing one',async()=>{
 const f=fixture('reverse');try{
  await freeze(f);await f.service.materialize({scope:f.scope,id:f.input.id,packages:f.packages});
  const other={...f.input,id:'second-binding'};
  await freeze(f,other);await f.service.materialize({scope:f.scope,id:other.id,packages:f.packages});
  for(const owner of ['ontology','harness']){
   const pkg=f.packages[owner];
   assert.throws(()=>f.service.resolveNativeAuthoring({workspaceId:'synthetic',scope:f.scope,owner,packageDigest:nativePackageDigest(pkg),sourceBindingsDigest:nativeSha256(JSON.parse(pkg.files[pkg.manifest.sourceBindingRef])),sourceDirection:'reverse'}),{code:'AUTHORING_CONTEXT_AMBIGUOUS'});
  }
 }finally{f.cleanup();}
});
