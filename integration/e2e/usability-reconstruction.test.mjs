import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {createHarnessService} from '@evopilot-next/harness/service';
import {createOntologyService} from '@evopilot-next/ontology/service';
import {maintainWorkspace} from '../../dist/integration/workspace/maintenance.js';
import {createLocalReconstructionAdapter,describeLocalReconstruction} from '../../dist/integration/usability/local-reconstruction.js';
import {createNativeIntegration} from '../../dist/integration/native-composition.js';
import {nativeBytesDigest} from '../../dist/integration/compatibility/v1/native.mjs';
import {reconstructionFixture,hash} from '../../projects/evopilot-runtime/tests/fixtures/reconstruction.mjs';
import {assessmentFixture} from '../../projects/evopilot-harness/tests/fixtures/usability-assessment.mjs';
import {behaviorOracleDigest} from '@evopilot-next/harness';

// These are synthetic generators and plans, executed in real macOS sandbox processes.
// Their results demonstrate adapter mechanics, not a real project or L3 acceptance.
const generate=`import fs from 'node:fs';
const spec=JSON.parse(JSON.parse(fs.readFileSync(process.env.EVOPILOT_SPECIFICATION,'utf8')).files[0].content);
if(spec.operation!=='add'||!Number.isFinite(spec.operand))throw Error('unsupported specification');
const code='export const transform = value => value + '+JSON.stringify(spec.operand)+';';
process.stdout.write(JSON.stringify({files:[{path:'app.mjs',content:code}],usage:{tokens:0,costMicros:0,iterations:1}}));`;
const build=`const app=await import(process.env.EVOPILOT_OUTPUT+'/app.mjs');if(typeof app.transform!=='function')throw Error('missing implementation');process.stdout.write('build ok');`;
const run=`const app=await import(process.env.EVOPILOT_OUTPUT+'/app.mjs');process.stdout.write(JSON.stringify({actual:app.transform(2)}));`;
async function local(t,{generator=generate,runner=run,budget={}}={}){
 const f=await reconstructionFixture(t,{prepare:false,budget:{wallMs:10000,maxTokens:0,maxCostMicros:0,maxOutputBytes:65536,...budget}});
 const root=path.join(f.root,'builder'),toolRoot=path.join(f.root,'tools');fs.mkdirSync(root,{mode:0o700});fs.mkdirSync(toolRoot,{mode:0o700});
 const stages=Object.fromEntries(Object.entries({generation:generator,build,run:runner}).map(([name,content])=>{const entry=path.join(toolRoot,name+'.mjs');fs.writeFileSync(entry,content,{mode:0o600});return [name,{entry,argv:[]}];}));
 const input={files:[{path:'specification.json',content:JSON.stringify({operation:'add',operand:3})}],tools:Object.values(stages).map(s=>({path:s.entry,digest:nativeBytesDigest(fs.readFileSync(s.entry))})),stages};
 const pins=describeLocalReconstruction(input),plan={...f.plan,...Object.fromEntries(['inputManifestDigest','environmentDigest','dependenciesDigest'].map(k=>[k,pins[k]])),executor:{id:'seatbelt-node-v1',version:'1',executableDigest:pins.executableDigest,configurationDigest:pins.configurationDigest,provider:'local-offline',model:'none'}};
 const adapter=createLocalReconstructionAdapter({root,resolve:async()=>input,verify:async p=>({planDigest:hash(p),current:true})});
 f.close();Object.assign(f.providers,adapter);delete f.providers.observeReconstruction;f.open();
 const binding=await f.freeze(plan);return {...f,plan,binding,adapter,input,root,directory:a=>path.join(root,a.claim.claimId.slice(7))};
}
test('T4-A01 real isolated generation, module build and execution run twice in fresh directories',async t=>{
 const f=await local(t),a=(await f.write('reconstruction.dispatch',{planDigest:f.binding.digest})).attempt;
 assert.equal(a.status,'SUCCEEDED',JSON.stringify(a));assert.equal(a.receipt.origin,'SYNTHETIC');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.directory(a),'run.stdout'),'utf8')),{actual:5});
 const b=(await f.write('reconstruction.dispatch',{planDigest:f.binding.digest})).attempt;assert.equal(b.status,'SUCCEEDED');assert.notEqual(a.receipt.workspaceId,b.receipt.workspaceId);
 f.close();f.open();assert.deepEqual((await f.read('reconstruction.attempt',{id:a.id})).receipt,a.receipt);
 fs.appendFileSync(path.join(f.directory(b),'run.stdout'),'tampered trace');await assert.rejects(f.adapter.inspectReconstruction({claim:b.claim,signal:new AbortController().signal}),{code:'BUILDER_TRACE_DRIFT'});
 await assert.rejects(f.read('reconstruction.evidence',{id:a.id}),{code:'RECONSTRUCTION_UNSUPPORTED'});
 const p=path.join(f.directory(a),'work/output/app.mjs');fs.appendFileSync(p,'\n// changed');await assert.rejects(f.adapter.inspectReconstruction({claim:a.claim,signal:new AbortController().signal}),{code:'BUILDER_OUTPUT_DRIFT'});
});
test('T4-A02 sandbox denies source, oracle, previous outputs, credentials, writes, network and child delegation',async t=>{
 const secretRoot=fs.mkdtempSync('/private/tmp/evopilot-denied-');t.after(()=>fs.rmSync(secretRoot,{recursive:true,force:true}));
 const denied=['original-source','hidden-oracle','previous-output','credentials'].map(n=>path.join(secretRoot,n));denied.forEach(p=>fs.writeFileSync(p,'private synthetic sentinel',{mode:0o600}));
 const attack=`import fs from 'node:fs';import net from 'node:net';import {spawnSync} from 'node:child_process';
const denied=${JSON.stringify(denied)};const results=denied.map(p=>{try{fs.readFileSync(p);return false;}catch{return true;}});
try{fs.writeFileSync(process.env.HOME+'/oversize','no');results.push(false);}catch{results.push(true);}
const fork=spawnSync(process.execPath,['-e','process.stdout.write("delegated")']);results.push(fork.status!==0);
const network=await new Promise(r=>{const socket=net.connect({host:'127.0.0.1',port:9});socket.on('error',e=>r(['EPERM','EACCES'].includes(e.code)));socket.on('connect',()=>{socket.destroy();r(false);});});results.push(network);
if(results.some(x=>!x))throw Error(JSON.stringify(results));
process.stdout.write(JSON.stringify({files:[{path:'app.mjs',content:'export const transform = x => x+3;'}],usage:{tokens:0,costMicros:0,iterations:1}}));`;
 const f=await local(t,{generator:attack}),a=(await f.write('reconstruction.dispatch',{planDigest:f.binding.digest})).attempt;assert.equal(a.status,'SUCCEEDED',JSON.stringify(a));
});
test('T4-A03 builder cannot fabricate stages or emit unlimited files; stderr and failure survive',async t=>{
 const bad=await local(t,{generator:'process.stdout.write(JSON.stringify({files:[],usage:{tokens:0,costMicros:0,iterations:1}}));'});
 const a=(await bad.write('reconstruction.dispatch',{planDigest:bad.binding.digest})).attempt;assert.equal(a.status,'FAILED');assert.equal(a.receipt.stages.build,'NOT_RUN');assert.equal(a.receipt.diagnostic,'BUILDER_GENERATION_FORMAT');
 const huge=await local(t,{generator:'process.stdout.write("x".repeat(100000));',budget:{maxOutputBytes:1024}});
 const b=(await huge.write('reconstruction.dispatch',{planDigest:huge.binding.digest})).attempt;assert.equal(b.status,'FAILED');assert.equal(b.receipt.diagnostic,'BUILDER_STREAM_LIMIT');assert(fs.statSync(path.join(huge.directory(b),'generation.stdout')).size<=1024);
});
test('T4-A04 adapter cancellation retains its actual terminal receipt for recovery',async t=>{
 const f=await local(t,{runner:'await new Promise(r=>setTimeout(r,10000));'}),request=await f.request('reconstruction.dispatch',{planDigest:f.binding.digest});
 f.close();const pending=f.open().reconstruction(request);
 let a;for(let n=0;n<100;n++){a=await f.read('reconstruction.attempt',{id:request.requestId}).catch(()=>null);if(a&&fs.existsSync(path.join(f.directory(a),'run.process.json')))break;await new Promise(r=>setTimeout(r,20));}
 assert(a);await f.write('reconstruction.cancel',{id:a.id});await pending;
 let final=await f.read('reconstruction.attempt',{id:a.id});for(let n=0;n<30&&final.status==='UNKNOWN';n++){await new Promise(r=>setTimeout(r,30));final=(await f.write('reconstruction.reconcile',{id:a.id})).attempt;}
 assert.equal(final.status,'CANCELLED');assert.equal(final.receipt.status,'CANCELLED');
});
test('T4-A05 public owner route uses Runtime evidence, not a request-provided observation',async t=>{
 const f=await reconstructionFixture(t),a=(await f.write('reconstruction.dispatch',{planDigest:f.binding.digest})).attempt;
 const integration=createNativeIntegration(f.options,{},owner=>{assert.equal(owner,'runtime');return f.service;},{reconstruction:f.providers});
 assert.deepEqual(await integration.native('runtime',{operation:'reconstruction.attempt',scope:f.scope,input:{id:a.id}}),a);
 for(const owner of ['harness','ontology'])await assert.rejects(integration.native(owner,{operation:'reconstruction.attempt',scope:f.scope,input:{id:a.id}}),{code:'RECONSTRUCTION_OWNER'});
 const o=await integration.harnessProviders.readReconstructionEvidence({workspaceId:f.options.workspaceId,scope:f.scope,attemptId:a.id},new AbortController().signal);assert.equal(o.outputDigest,a.receipt.outputDigest);
});
test('T4-A06 actual worker survives Runtime SIGKILL; reopen reconciles its original protected output',async t=>{
 const f=await local(t,{runner:run+'\nawait new Promise(r=>setTimeout(r,1200));'}),request=await f.request('reconstruction.dispatch',{planDigest:f.binding.digest});f.close();
 const child=fork(new URL('./fixtures/reconstruction-runner.mjs',import.meta.url),[JSON.stringify({options:f.options,root:f.root,input:f.input,request})],{stdio:['ignore','ignore','pipe','ipc']});
 t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});let dir;
 for(let n=0;n<150;n++){const names=fs.readdirSync(f.root);dir=names.length?path.join(f.root,names[0]):undefined;if(dir&&fs.existsSync(path.join(dir,'run.process.json')))break;await new Promise(r=>setTimeout(r,20));}
 assert(dir&&fs.existsSync(path.join(dir,'run.process.json')));child.kill('SIGKILL');await once(child,'exit');const reopened=f.open();
 const original=await f.read('reconstruction.attempt',{id:request.requestId});assert.equal(original.status,'RUNNING');
 for(let n=0;n<100&&!fs.existsSync(path.join(dir,'receipt.json'));n++)await new Promise(r=>setTimeout(r,25));
 const recovered=await f.write('reconstruction.reconcile',{id:request.requestId});assert.equal(recovered.attempt.status,'SUCCEEDED',JSON.stringify(recovered));assert.equal(recovered.attempt.claim.claimId,original.claim.claimId);
 await reopened.reconstruction(request);assert.equal(fs.readdirSync(f.root).length,1);
});
test('T4-A07 marker 7 rejects actual old Runtime writers and preserves receipts through stopped backup/restore',{skip:!process.env.EVOPILOT_V07_APP&&'Requires retained v0.7 installation'},async t=>{
 const f=await reconstructionFixture(t),a=(await f.write('reconstruction.dispatch',{planDigest:f.binding.digest})).attempt;
 await f.planningWrite('planning.revise',{id:f.planning.id,parentDigest:f.planning.digest,draft:{...f.draft,title:'Subsequent planning must not downgrade marker 7'}});f.close();
 for(const factory of [createHarnessService,createOntologyService]){const owner=factory(f.options);owner.initialize();owner.close();}
 const projectRoot=path.join(f.root,'project'),installationRoot=path.join(f.root,'installation');fs.mkdirSync(projectRoot,{mode:0o700});fs.mkdirSync(installationRoot,{mode:0o700});
 fs.writeFileSync(path.join(projectRoot,'workspace-project.json'),JSON.stringify({schema:'evopilot-workspace-project/v1',id:f.options.workspaceId,templateVersion:'0.2.0',specifications:{ontology:'v1',harness:'v1'}}),{mode:0o600});
 const context={projectRoot,stateRoot:f.options.workspaceRoot,workspaceId:f.options.workspaceId,installationRoot},backupRoot=path.join(f.root,'backup');assert.equal(maintainWorkspace(context,'backup',{destinationRoot:backupRoot},'reconstruction-backup').status,'VERIFIED');
 const old=await import(pathToFileURL(path.join(fs.realpathSync(process.env.EVOPILOT_V07_APP),'node_modules/@evopilot-next/runtime/dist/service.js'))),previous=old.createRuntimeService(f.options);
 try{assert.throws(()=>previous.initialize(),{code:'CORRUPT_STATE'});}finally{previous.close();}
 fs.renameSync(f.options.workspaceRoot,f.options.workspaceRoot+'-saved');fs.renameSync(projectRoot,projectRoot+'-saved');maintainWorkspace(context,'restore',{backupRoot},'reconstruction-restore');f.open();assert.deepEqual(await f.read('reconstruction.attempt',{id:a.id}),a);
});
test('T4-A08 two sandbox executions flow through Runtime identity and Harness L3 gates; changed bytes revoke readback',async t=>{
 // ACTUAL-tagged branches below exercise the real provider route with synthetic
 // approval/specification/semantic fixtures. They are not real-project L3 evidence.
 const f=await local(t),oracle={schema:'evopilot-behavior-oracle/v1',author:{actor:'synthetic-route-reviewer',independent:true,origin:'ACTUAL'},cases:[{id:'sum',behaviorId:'b1',facets:['outputs','states','errors','sideEffects','idempotency','concurrency','recovery'],purpose:'Synthetic routed observation',input:{value:2},expected:{output:5,state:null,error:null,effects:[]},tolerances:[]}],negativeControls:[{id:'wrong-sum',caseId:'sum',purpose:'Reject wrong output',actual:{output:6,state:null,error:null,effects:[]}}]};
 const h=await assessmentFixture(t,{level:'L3',scope:f.scope,workspaceOptions:f.options,pinsOverrides:{oracleDigest:behaviorOracleDigest(oracle),inputManifestDigest:f.plan.inputManifestDigest,environmentDigest:f.plan.environmentDigest,dependenciesDigest:f.plan.dependenciesDigest}});
 const plan={...f.plan,origin:'ACTUAL',inventoryDigest:h.inventoryDigest,specificationDigest:h.specificationDigest,oracleDigest:behaviorOracleDigest(oracle)},binding=await f.freeze(plan);
 f.close();f.providers.observeReconstruction=async({claim,receipt})=>{
  const actual=JSON.parse(fs.readFileSync(path.join(f.directory({claim}),'run.stdout'),'utf8')),p=claim.plan;
  const body={schema:'evopilot-reconstruction-observation/v1',workspaceId:f.options.workspaceId,scope:f.scope,attemptId:claim.attemptId,...Object.fromEntries(['inventoryDigest','specificationDigest','oracleDigest','inputManifestDigest','environmentDigest','dependenciesDigest'].map(k=>[k,p[k]])),outputDigest:receipt.outputDigest,executorDigest:receipt.executorDigest,origin:'ACTUAL',inputMode:'ASSETS_ONLY',independent:true,isolated:true,status:'SUCCEEDED',cases:[{caseId:'sum',inputDigest:hash({value:2}),status:'COMPLETE',actual:{output:actual.actual,state:null,error:null,effects:[]}}]};return {...body,digest:hash(body)};
 };
 const runtime=f.open(),integration=createNativeIntegration(f.options,{},owner=>{assert.equal(owner,'runtime');return runtime;},{reconstruction:f.providers});
 h.close();h.providers.readReconstructionEvidence=integration.harnessProviders.readReconstructionEvidence;h.open();await h.record();
 const input={inventoryDigest:h.inventoryDigest,specificationDigest:h.specificationDigest,oracle},review=await h.call('usability.oracle.review',input);await h.write('usability.oracle.freeze',{...input,humanEvidenceRef:h.decision('usability.oracle.freeze',review.digest)});
 const attempts=[],evaluationIds=[];
 for(let n=0;n<2;n++){
  const a=(await f.write('reconstruction.dispatch',{planDigest:binding.digest})).attempt;assert.equal(a.status,'SUCCEEDED');attempts.push(a);
  const r=await h.request('usability.oracle.evaluate',{bindingDigest:review.digest,attemptId:a.id});const evaluated=await h.call(r.operation,r.input,r);assert.equal(evaluated.evaluation.result.status,'PASS');evaluationIds.push(r.requestId);
 }
 await h.write('usability.assessment.start',{id:'routed-l3',inventoryDigest:h.inventoryDigest,specificationDigest:h.specificationDigest,reconstructionEvaluationIds:evaluationIds});
 const result=(await h.write('usability.assessment.evaluate',{id:'routed-l3'})).evaluation.result;assert.equal(result.verifiedLevel,'L3',JSON.stringify(result));assert.equal(result.reconstructionEvidence.length,2);
 fs.appendFileSync(path.join(f.directory(attempts[0]),'work/output/app.mjs'),'\n// drift');const changed=await h.call('usability.assessment.read',{id:'routed-l3'});assert.equal(changed.verifiedLevel,null);assert.equal(changed.freshness,'UNKNOWN');assert.deepEqual(await h.call('usability.assessment.version',{digest:result.digest}),result);
 h.close();f.close();
});
