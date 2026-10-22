import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createComposition,loadInstalledProducts} from '../../dist/integration/composition.js';
import {maintainWorkspace} from '../../dist/integration/workspace/maintenance.js';
import {nativeSha256,nativeBytesDigest} from '../../dist/integration/compatibility/v1/native.mjs';
import {fixture} from './fixtures/native-project.mjs';
import {syntheticDecisionEvidence} from './fixtures/decision-evidence.mjs';
const oldApp=process.env.EVOPILOT_V06_APP;
test('V07-E07/E10 actual installed v0.6 native assets survive v0.7 planning; old reader rejects and stopped backup restores', {timeout:120000,skip:!oldApp&&'Requires real retained v0.6 executable, never a version-string fixture'},async t=>{
 const f=fixture(),options={workspaceRoot:f.stateRoot,workspaceId:'synthetic'},scope=f.scope;
 const old=await import(pathToFileURL(path.join(fs.realpathSync(oldApp),'dist/integration/composition.js')));
 const oldApis=await old.loadInstalledProducts();for(const owner of ['runtime','harness','ontology'])assert.equal(oldApis[owner].VERSION,'0.6.0');
 const toolchain=JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN));let c=old.createComposition(options,oldApis,{},{toolchain});let serial=0;
 t.after(()=>{c?.close();f.cleanup();});
 const read=(owner,operation,input)=>c.native(owner,{operation,scope,input});
 const write=(owner,operation,input)=>c.native(owner,{operation,scope,input,requestId:'upgrade-'+(++serial),expectedRevision:c.inspect(owner,scope).revision});
 const retained={};
 for(const owner of ['ontology','harness']){
  const pkg=f.packages[owner],identity={id:pkg.manifest.id,version:pkg.manifest.version};
  await write(owner,'native.package.put',{package:pkg});await write(owner,'native.package.validate',identity);
  const review=(await write(owner,'native.package.review',identity)).result;
  await write(owner,'native.package.decide',{...identity,reviewDigest:review.reviewDigest,decision:'APPROVE',humanEvidenceRef:syntheticDecisionEvidence(f.root,{owner,operation:'native.package.decide',workspaceId:options.workspaceId,scope,reviewDigest:review.reviewDigest,decision:'APPROVE'})});
  await write(owner,'native.package.publish',identity);retained[owner]=await read(owner,'native.package.inspect',identity);
 }
 const project=await c.request('runtime',{operation:'project.create',scope,input:{name:'Synthetic upgrade'},requestId:'old-project',expectedRevision:c.inspect('runtime',scope).revision});
 const oldReceipt=await c.request('runtime',{operation:'receipt.inspect',scope,input:{requestId:'old-project'}});
 c.close();c=null;
 const installationRoot=path.join(f.root,'candidate-installation');fs.mkdirSync(installationRoot,{mode:0o700});
 const context={projectRoot:f.projectRoot,stateRoot:f.stateRoot,workspaceId:options.workspaceId,installationRoot};
 const backupRoot=path.join(f.root,'before-v07');const before=maintainWorkspace(context,'backup',{destinationRoot:backupRoot},'before-v07');assert.equal(before.status,'VERIFIED');
 c=createComposition(options,await loadInstalledProducts(),{},{toolchain});
 const assertRetained=async()=>{for(const owner of ['ontology','harness']){const pkg=f.packages[owner];assert.deepEqual(await read(owner,'native.package.inspect',{id:pkg.manifest.id,version:pkg.manifest.version}),retained[owner]);}assert.deepEqual(await c.request('runtime',{operation:'receipt.inspect',scope,input:{requestId:'old-project'}}),oldReceipt);};
 await assertRetained();
 const draft={title:'Synthetic v0.7 discussion',objective:'Preserve old data and discuss a new target',sourceRevision:'requirements-one',sourceDigest:nativeSha256('synthetic'),sources:[{id:'chat',kind:'conversation',reference:'synthetic:chat',representation:'excerpt',content:'Discuss only',contentDigest:nativeBytesDigest('Discuss only'),attributedRole:'user'}],items:[{id:'question',kind:'question',text:'Which improvement next?',disposition:'unresolved',sourceIds:['chat'],dependsOn:[],ownerImpact:['runtime'],acceptance:[]}],milestones:[],exclusions:['No execution'],candidates:[]};
 const plan=await c.native('runtime',{operation:'planning.revise',scope,input:{id:'roadmap',parentDigest:null,draft},requestId:'planning-first',expectedRevision:(await read('runtime','planning.inspect',{})).revision});assert.equal(plan.result.revision,1);await assertRetained();c.close();c=null;
 const reader=oldApis.runtime.createRuntimeService(options);try{assert.throws(()=>reader.initialize(),{code:'CORRUPT_STATE'});}finally{reader.close();}
 // Roll back only disposable roots to the verified pre-upgrade backup. The daily installation and its state are untouched.
 fs.renameSync(f.projectRoot,f.projectRoot+'-preserved');fs.renameSync(f.stateRoot,f.stateRoot+'-preserved');
 const restored=maintainWorkspace(context,'restore',{backupRoot},'rollback-v07');assert.equal(restored.manifestDigest,before.manifestDigest);
 c=old.createComposition(options,oldApis,{},{toolchain});await assertRetained();
 t.diagnostic(JSON.stringify({old:'0.6.0',candidate:'0.7.0',publishedAssetsPreserved:true,oldReceiptPreserved:true,oldReaderRejectedNewPlanning:true,rollbackVerified:true,decisions:'SYNTHETIC_TEST_ONLY'}));
});
