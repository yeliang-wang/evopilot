import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import path from 'node:path';
import {reconstructionFixture,receipt as generationReceipt,observation,hash} from '../../projects/evopilot-runtime/tests/fixtures/reconstruction.mjs';
import {supervisorLabel} from '../compatibility/usability/v1/evaluation.mjs';
const prefix='reconstruction.evaluation.';const seal=body=>({...body,digest:hash(body)});
const generationPolicy={schema:'evopilot-execution-policy/v1',externalNetwork:'DENY',internalTransport:'NONE',childProcesses:'DENY',originalSource:'DENY',hiddenOracle:'DENY',priorOutputs:'DENY',hostCredentials:'DENY',brokerDigest:hash('synthetic-broker'),dependencyManifestDigest:hash('synthetic-dependencies')};
function evalReceipt(claim,overrides={}){const p=claim.plan,d=p.policy.dependencies[0];return seal({schema:'evopilot-evaluation-receipt/v1',claimId:claim.claimId,planDigest:claim.planDigest,sessionId:claim.sessionId,origin:p.origin,outputDigest:p.reconstruction.outputDigest,oracleDigest:p.oracleDigest,environmentDigest:p.environmentDigest,dependenciesDigest:p.dependenciesDigest,policyDigest:hash(p.policy),providerDigest:hash(p.provider),status:'SUCCEEDED',usage:{wallMs:10,connections:0,rows:0,outputBytes:10,operations:1},violations:{directConnections:0,unrelatedPeers:0,sourceReads:0,oracleReads:0,credentialReads:0,foreignEffects:0},effects:[{id:'inspect-1',dependencyId:d.id,targetId:d.label,operation:'INSPECT',outcome:'CONFIRMED',traceDigest:hash('inspect')}],cleanup:[{dependencyId:d.id,ownedTargets:[d.label],confirmedAbsent:true,traceDigest:hash('cleanup')}],containment:[{dependencyId:d.id,sandboxDigest:d.sandboxDigest,allProcessesClosed:true,traceDigest:hash('sandbox')}],enforcementDigest:hash('journal'),diagnostic:null,...overrides});}
async function fixture(t,{providerOverrides={},budget={},freeze=true}={}){
 const generations=new Map(),receipts=new Map();let calls=0;
 const f=await reconstructionFixture(t,{prepare:false,providerOverrides:{executeReconstruction:async({claim})=>{const r=generationReceipt(claim,{schema:'evopilot-reconstruction-receipt/v2',authority:{policy:claim.plan.authority,policyDigest:hash(claim.plan.authority),enforcementDigest:hash('isolated'),externalConnections:0,unrelatedPeerConnections:0,allOwnedProcessesClosed:true}});generations.set(claim.claimId,r);return r;},inspectReconstruction:async({claim})=>generations.get(claim.claimId),verifyEvaluationPlan:async p=>({planDigest:hash(p),current:true,qualified:true}),executeEvaluation:async({claim})=>{calls++;const r=evalReceipt(claim);receipts.set(claim.claimId,r);return r;},inspectEvaluation:async({claim})=>receipts.get(claim.claimId)??null,cancelEvaluation:async({claim})=>evalReceipt(claim,{status:'CANCELLED'}),...providerOverrides}});
 const gBinding=await f.freeze({...f.plan,schema:'evopilot-reconstruction-plan/v2',authority:generationPolicy});const g=(await f.write('reconstruction.dispatch',{planDigest:gBinding.digest})).attempt;assert.equal(g.status,'SUCCEEDED');
 const nonce='a'.repeat(32),policy={schema:'evopilot-evaluation-policy/v1',phase:'EVALUATION',brokerDigest:hash('evaluation-broker'),directNetwork:'DENY',originalSource:'DENY',hiddenOracle:'DENY',priorOutputs:'DENY',hostCredentials:'DENY',dependencies:[{id:'worker',kind:'OWNED_SUPERVISOR',ownerUid:501,domain:'gui/501',label:supervisorLabel(f.options.workspaceId,nonce),nonce,root:'/private/tmp/example',executableDigest:hash('node'),workerDigest:hash('worker'),plistDigest:hash('plist'),sandboxDigest:hash('sandbox'),qualificationDigest:hash('qualified'),operations:['INSPECT','BOOTSTRAP','BOOTOUT','RECONCILE']}]};
 const plan={schema:'evopilot-evaluation-plan/v1',workspaceId:f.options.workspaceId,scope:f.scope,reconstruction:{attemptId:g.id,planDigest:g.claim.planDigest,claimId:g.claim.claimId,receiptDigest:g.receipt.digest,outputDigest:g.receipt.outputDigest},oracleDigest:g.claim.plan.oracleDigest,environmentDigest:g.claim.plan.environmentDigest,dependenciesDigest:g.claim.plan.dependenciesDigest,provider:{id:'synthetic',version:'1',executableDigest:hash('binary'),configurationDigest:hash('config')},origin:'SYNTHETIC',policy,budget:{wallMs:1000,maxSessions:2,maxConnections:0,maxRows:0,maxOutputBytes:1000,maxOperations:10,...budget}};
 const freezePlan=async(p=plan)=>(await f.write(prefix+'freeze',{plan:p,humanEvidenceRef:f.evidence(prefix+'freeze',hash(p))})).result;
 const binding=freeze?await freezePlan():null;
 f.close();f.providers.observeEvaluation=async({claim,receipt})=>{const {digest,...o}=observation(g.claim,g.receipt);return seal({...o,schema:'evopilot-reconstruction-observation/v3',authority:g.receipt.authority,execution:{planDigest:g.claim.planDigest,claimId:g.claim.claimId,cleanWorkspaceId:g.receipt.workspaceId,receiptDigest:g.receipt.digest},evaluation:{plan:claim.plan,claim,receipt}});};f.open();
 return {f,g,gBinding,plan,binding,freezePlan,receipts,generations,calls:()=>calls};
}
test('evaluation requires exact approval, completed generation and trusted configuration',async t=>{
 const {f,g,plan,freezePlan}=await fixture(t,{freeze:false});
 await assert.rejects(f.write(prefix+'freeze',{plan,humanEvidenceRef:'approval'}));
 for(const p of [{...plan,reconstruction:{...plan.reconstruction,outputDigest:hash('other')}},{...plan,origin:'ACTUAL'},{...plan,oracleDigest:hash('different')}])await assert.rejects(f.read(prefix+'review',{plan:p}),{code:'EVALUATION_GENERATION_BINDING'});
 const binding=await freezePlan();f.close();delete f.providers.executeEvaluation;f.open();await assert.rejects(f.write(prefix+'dispatch',{planDigest:binding.digest}),{code:'EVALUATION_UNSUPPORTED'});
 assert.equal((await f.read(prefix+'list',{planDigest:binding.digest})).length,0);assert.equal((await f.read('reconstruction.attempt',{id:g.id})).status,'SUCCEEDED');
});
test('evaluation is separately durable with marker 9, exact receipt replay and v3 evidence',async t=>{
 const {f,binding,calls,g}=await fixture(t),request=await f.request(prefix+'dispatch',{planDigest:binding.digest}),first=await f.service.reconstruction(request);assert.equal(first.session.status,'SUCCEEDED');
 assert.deepEqual(await f.service.reconstruction(request),first);f.close();f.open();assert.deepEqual(await f.service.reconstruction(request),first);assert.equal(calls(),1);
 const evidence=await f.read(prefix+'evidence',{id:first.session.id});assert.equal(evidence.schema,'evopilot-reconstruction-observation/v3');assert.equal(evidence.evaluation.receipt.digest,first.session.receipt.digest);assert.equal(evidence.execution.receiptDigest,g.receipt.digest);assert.equal(evidence.origin,'SYNTHETIC');
 await assert.rejects(f.read(prefix+'evidence',{id:first.session.id,receipt:first.session.receipt}));
 f.close();const db=new DatabaseSync(path.join(f.options.workspaceRoot,'state/runtime/runtime.db'),{readOnly:true});try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,9)}finally{db.close()}f.open();
});
test('evaluation transport loss blocks generation and all new evaluation sessions until original receipt reconciles',async t=>{
 let executions=0,retained;const {f,binding,gBinding}=await fixture(t,{providerOverrides:{executeEvaluation:async({claim})=>{executions++;retained=evalReceipt(claim);throw Error('lost');},inspectEvaluation:async()=>retained}});
 const a=(await f.write(prefix+'dispatch',{planDigest:binding.digest})).session;assert.equal(a.status,'UNKNOWN');
 await assert.rejects(f.write(prefix+'dispatch',{planDigest:binding.digest}),{code:'EVALUATION_BUSY'});await assert.rejects(f.write('reconstruction.dispatch',{planDigest:gBinding.digest}),{code:'RECONSTRUCTION_BUSY'});
 f.close();f.open();const b=(await f.write(prefix+'reconcile',{id:a.id})).session;assert.equal(b.status,'SUCCEEDED');assert.equal(b.claim.claimId,a.claim.claimId);assert.equal(executions,1);
});
test('unknown effects and cleanup cannot free the lock even in a failed terminal receipt',async t=>{
 let claim;const {f,binding}=await fixture(t,{providerOverrides:{executeEvaluation:async c=>{claim=c.claim;return evalReceipt(claim,{status:'FAILED',cleanup:[]});}}});
 const a=(await f.write(prefix+'dispatch',{planDigest:binding.digest})).session;assert.equal(a.status,'UNKNOWN');assert.equal(a.reason,'EVALUATION_EFFECTS_UNRESOLVED');assert.equal(a.receipt.status,'FAILED');
 f.close();f.providers.inspectEvaluation=async()=>evalReceipt(claim,{status:'FAILED'});f.open();const b=(await f.write(prefix+'reconcile',{id:a.id})).session;assert.equal(b.status,'FAILED');
});
test('bounded evaluation usage is cumulative and unknown accounting prevents reuse',async t=>{
 const {f,binding}=await fixture(t,{budget:{maxOutputBytes:10}});assert.equal((await f.write(prefix+'dispatch',{planDigest:binding.digest})).session.status,'SUCCEEDED');const b=(await f.write(prefix+'dispatch',{planDigest:binding.digest})).session;assert.equal(b.status,'UNKNOWN');assert.equal(b.reason,'EVALUATION_BUDGET');
 const u=await fixture(t,{providerOverrides:{executeEvaluation:async({claim})=>evalReceipt(claim,{status:'FAILED',usage:{wallMs:10,connections:null,rows:0,outputBytes:0,operations:1}})}});assert.equal((await u.f.write(prefix+'dispatch',{planDigest:u.binding.digest})).session.status,'FAILED');u.f.close();u.f.open();await assert.rejects(u.f.write(prefix+'dispatch',{planDigest:u.binding.digest}),{code:'EVALUATION_BUDGET_UNKNOWN'});
});
test('stale environment or unqualified adapter cannot begin evaluation',async t=>{
 for(const flags of [{current:false,qualified:true},{current:true,qualified:false}]){const {f,binding,calls}=await fixture(t,{providerOverrides:{verifyEvaluationPlan:async p=>({planDigest:hash(p),...flags})}});const s=(await f.write(prefix+'dispatch',{planDigest:binding.digest})).session;assert.equal(s.status,'FAILED');assert.equal(s.reason,'EVALUATION_STALE_OR_UNQUALIFIED');assert.equal(calls(),0);}
});
test('evidence rechecks both generated output and evaluation receipt',async t=>{
 const {f,binding,receipts,g,generations}=await fixture(t);const s=(await f.write(prefix+'dispatch',{planDigest:binding.digest})).session;
 receipts.set(s.claim.claimId,evalReceipt(s.claim,{diagnostic:'modified'}));await assert.rejects(f.read(prefix+'evidence',{id:s.id}),{code:'EVALUATION_RECEIPT_DRIFT'});receipts.set(s.claim.claimId,s.receipt);
 generations.set(g.claim.claimId,generationReceipt(g.claim,{schema:'evopilot-reconstruction-receipt/v2',authority:g.receipt.authority,diagnostic:'modified'}));await assert.rejects(f.read(prefix+'evidence',{id:s.id}),{code:'RECONSTRUCTION_RECEIPT_DRIFT'});
});
test('cancellation stays sticky when evaluation finishes late',async t=>{
 let resolveStarted,finish;const started=new Promise(r=>resolveStarted=r);const {f,binding}=await fixture(t,{providerOverrides:{executeEvaluation:async({claim})=>{resolveStarted(claim);return new Promise(r=>finish=r);}}});
 const pending=f.write(prefix+'dispatch',{planDigest:binding.digest}),claim=await started;assert.throws(()=>f.close(),{code:'BUSY'});const cancelled=(await f.write(prefix+'cancel',{id:claim.sessionId})).session;assert.equal(cancelled.status,'CANCELLED');finish(evalReceipt(claim));assert.equal((await pending).session.status,'CANCELLED');await assert.rejects(f.read(prefix+'evidence',{id:claim.sessionId}),{code:'EVALUATION_NOT_SUCCEEDED'});
});

import fs from 'node:fs';import {homedir} from 'node:os';import {inspectWorkspaceSnapshot,relocateWorkspaceSnapshot} from '@evopilot-next/runtime/workspace-migration';import {createRuntimeService} from '@evopilot-next/runtime/service';
test('marker 9 stopped backup and same-host relocation retain complete evaluation and generation histories',async t=>{
 const {f,binding,g}=await fixture(t);const s=(await f.write(prefix+'dispatch',{planDigest:binding.digest})).session;f.close();
 const before=inspectWorkspaceSnapshot(f.options),destinationRoot=path.join(f.root,'relocated');fs.cpSync(f.options.workspaceRoot,destinationRoot,{recursive:true,preserveTimestamps:true});
 const privateCopy=p=>{const stat=fs.lstatSync(p);assert(!stat.isSymbolicLink());fs.chmodSync(p,stat.isDirectory()?0o700:0o600);if(stat.isDirectory())for(const child of fs.readdirSync(p))privateCopy(path.join(p,child));};privateCopy(destinationRoot);
 const moved=relocateWorkspaceSnapshot({sourceRoot:f.options.workspaceRoot,destinationRoot,workspaceId:f.options.workspaceId,expectedSnapshotDigest:before.snapshotDigest});
 t.after(()=>{for(const id of moved.requiredKeyIds)fs.rmSync(path.join(homedir(),'.local/share/evopilot/relocation-keys',id+'.key'),{force:true});});
 assert.equal(moved.snapshot.recordsDigest,before.recordsDigest);assert.deepEqual(inspectWorkspaceSnapshot(f.options),before);
 const restored=createRuntimeService({...f.options,workspaceRoot:destinationRoot},f.providers);restored.initialize();try{
  assert.deepEqual(await restored.reconstruction({operation:prefix+'session',scope:f.scope,input:{id:s.id}}),s);
  assert.deepEqual(await restored.reconstruction({operation:'reconstruction.attempt',scope:f.scope,input:{id:g.id}}),g);
 }finally{restored.close();}
 const db=new DatabaseSync(path.join(destinationRoot,'state/runtime/runtime.db'),{readOnly:true});try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,9)}finally{db.close()}
});
