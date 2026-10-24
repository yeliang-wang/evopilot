import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {reconstructionFixture,hash} from '../../projects/evopilot-runtime/tests/fixtures/reconstruction.mjs';
import {nativeBytesDigest} from '../../dist/integration/compatibility/v1/native.mjs';
import {createCodexReconstructionAdapter,describeCodexReconstruction,CODEX_STATE_ADAPTER} from '../../dist/integration/usability/codex-reconstruction.js';
import {recoverCodexStateAdmission} from '../../dist/integration/usability/codex-recovery.js';
const digest=p=>nativeBytesDigest(fs.readFileSync(p));
// Synthetic model and explicit synthetic maintenance time; actual legacy worker/phase processes.
async function legacy(t){
 const f=await reconstructionFixture(t,{prepare:false,budget:{wallMs:1800000,maxTokens:1000,maxCostMicros:null,maxOutputBytes:65536}}),root=path.join(f.root,'adapter'),tools=path.join(f.root,'tools');
 fs.mkdirSync(root,{mode:0o700});fs.mkdirSync(tools,{mode:0o700});
 const policy=path.join(tools,'AGENTS.md');fs.writeFileSync(policy,'Synthetic generic policy.\n',{mode:0o600});
 const executable=path.join(tools,'codex');fs.writeFileSync(executable,'#!'+process.execPath+'\nimport {serve} from '+JSON.stringify(new URL('./fixtures/reconstruction-codex-server.mjs',import.meta.url).href)+';serve("state",'+JSON.stringify(policy)+');\n',{mode:0o700});
 const stages=Object.fromEntries(['build','run'].map(name=>{const entry=path.join(tools,name+'.mjs');fs.writeFileSync(entry,'throw Error("must not execute");',{mode:0o600});return [name,{entry,argv:[]}];}));
 const configuration=path.join(os.homedir(),'.codex/config.toml'),input={files:[{path:'specification.json',content:'{"synthetic":true}'}],tools:Object.values(stages).map(s=>({path:s.entry,digest:digest(s.entry)})),stages,state:{kind:'fixed-hfs-v1',bytes:8388608},codex:{executable,version:'0.163.0-alpha.10.2',model:'gpt-synthetic',effort:'low',configuration:{path:configuration,digest:digest(configuration)},policyFiles:[{path:policy,digest:digest(policy)}],disabledServers:[]}};
 const pins=describeCodexReconstruction(input),plan={...f.plan,...Object.fromEntries(['inputManifestDigest','environmentDigest','dependenciesDigest'].map(k=>[k,pins[k]])),executor:{id:CODEX_STATE_ADAPTER,version:input.codex.version,provider:'openai',model:input.codex.model,executableDigest:pins.executableDigest,configurationDigest:pins.configurationDigest}};
 const app=path.join(f.root,'legacy');fs.mkdirSync(app,{mode:0o700});fs.writeFileSync(path.join(app,'package.json'),'{"type":"module"}',{mode:0o600});
 fs.cpSync(fileURLToPath(new URL('../../dist/integration',import.meta.url)),path.join(app,'integration'),{recursive:true});fs.symlinkSync(fileURLToPath(new URL('../../node_modules',import.meta.url)),path.join(app,'node_modules'));
 const modules=path.join(app,'integration/usability');fs.copyFileSync(fileURLToPath(new URL('./fixtures/reconstruction-legacy-state-phase.mjs',import.meta.url)),path.join(modules,'codex-state-phase.js'));
 const adapter=createCodexReconstructionAdapter({root,resolve:async()=>input,verify:async p=>({planDigest:hash(p),current:true})});let request;
 f.close();Object.assign(f.providers,adapter,{executeReconstruction:async({claim})=>{
   const directory=path.join(root,claim.claimId.slice(7));fs.mkdirSync(directory,{mode:0o700});request={claim,directory,input};fs.writeFileSync(path.join(directory,'request.json'),JSON.stringify(request)+'\n',{mode:0o600});
   const fd=fs.openSync(path.join(directory,'worker.stderr'),'wx',0o600),child=spawn(process.execPath,[path.join(modules,'codex-worker.js'),path.join(directory,'request.json')],{stdio:['ignore','ignore',fd],env:{PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8',HOME:os.homedir()}});fs.closeSync(fd);
   const [exit]=await once(child,'close');assert.equal(exit,0);assert(fs.existsSync(path.join(directory,'worker.unknown.json')));throw Object.assign(Error('Synthetic controller observes missing original receipt'),{code:'CODEX_STATE_UNKNOWN'});
 }});f.open();const binding=await f.freeze(plan),attempt=(await f.write('reconstruction.dispatch',{planDigest:binding.digest})).attempt;
 assert.equal(attempt.status,'UNKNOWN');assert.equal(attempt.receipt,null);
 return {...f,adapter,modules,request,attempt};
}
test('T4-C19 exact legacy admission failure reconciles as failed without generation, state execution or replenished budget',async t=>{
 const f=await legacy(t),dir=f.request.directory,files=fs.readdirSync(dir).filter(n=>n!=='work'),before=Object.fromEntries(files.map(n=>[n,digest(path.join(dir,n))]));
 assert.equal(await f.adapter.inspectReconstruction({claim:f.attempt.claim,signal:new AbortController().signal}),null);
 assert.throws(()=>recoverCodexStateAdmission(f.request,f.modules),{code:'CODEX_RECOVERY_TIME'});
 t.mock.timers.enable({apis:['Date'],now:Date.parse(f.attempt.claim.admittedAt)+1801000});
 const recovered=recoverCodexStateAdmission(f.request,f.modules);
 assert.equal(recovered.status,'FAILED');assert.equal(recovered.usage.wallMs,1801000);assert.equal(recovered.usage.tokens,123);assert.equal(recovered.usage.costMicros,null);
 assert.deepEqual(recovered.stages,{generation:'SUCCEEDED',build:'NOT_RUN',run:'NOT_RUN'});assert.deepEqual(recovered.outputs,[]);assert.equal(recovered.interventions.length,1);
 assert(!fs.existsSync(path.join(dir,'receipt.json')));assert(!fs.existsSync(path.join(dir,'state.dmg')));
 assert.deepEqual(Object.fromEntries(files.map(n=>[n,digest(path.join(dir,n))])),before);
 assert.deepEqual(recoverCodexStateAdmission(f.request,f.modules),recovered);
 const a=(await f.write('reconstruction.reconcile',{id:f.attempt.id})).attempt;assert.equal(a.status,'FAILED');assert.equal(a.claim.claimId,f.attempt.claim.claimId);assert.deepEqual(a.receipt,recovered);
 await assert.rejects(f.write('reconstruction.dispatch',{planDigest:f.attempt.claim.planDigest}),{code:'RECONSTRUCTION_BUDGET'});
 fs.appendFileSync(path.join(dir,'state.stderr'),'changed');await assert.rejects(f.adapter.inspectReconstruction({claim:a.claim,signal:new AbortController().signal}),{code:'CODEX_RECOVERY_DRIFT'});
});
test('T4-C20 recovery rejects live processes, other crash sites, phase effects, changed modules and changed generation',async t=>{
 const f=await legacy(t),dir=f.request.directory,phase=path.join(dir,'state.phase.json'),phaseBytes=fs.readFileSync(phase);
 fs.writeFileSync(phase,JSON.stringify({...JSON.parse(phaseBytes),workerPid:process.pid}));assert.throws(()=>recoverCodexStateAdmission(f.request,f.modules),{code:'CODEX_RECOVERY_PROCESS'});fs.writeFileSync(phase,phaseBytes);
 for(const name of ['state.storage.json','state.cleanup-unknown.json','run.process.json']){const file=path.join(dir,name);fs.writeFileSync(file,'{}',{mode:0o600});assert.throws(()=>recoverCodexStateAdmission(f.request,f.modules),{code:'CODEX_RECOVERY_STAGE_OBSERVED'});fs.unlinkSync(file);}
 const stderr=path.join(dir,'state.stderr'),err=fs.readFileSync(stderr);fs.writeFileSync(stderr,err.toString().replace(':60:9',':64:9'));assert.throws(()=>recoverCodexStateAdmission(f.request,f.modules),{code:'CODEX_RECOVERY_REJECTION'});fs.writeFileSync(stderr,err);
 const module=path.join(f.modules,'codex-state-phase.js'),bytes=fs.readFileSync(module);fs.appendFileSync(module,'\n');assert.throws(()=>recoverCodexStateAdmission(f.request,f.modules),{code:'CODEX_RECOVERY_MODULE'});fs.writeFileSync(module,bytes);
 const result=path.join(dir,'generation.result.json'),gen=fs.readFileSync(result);fs.writeFileSync(result,JSON.stringify({...JSON.parse(gen),tokens:0}));assert.throws(()=>recoverCodexStateAdmission(f.request,f.modules),{code:'CODEX_RECOVERY_GENERATION'});fs.writeFileSync(result,gen);
 assert(!fs.existsSync(path.join(dir,'recovery')));assert.equal((await f.write('reconstruction.reconcile',{id:f.attempt.id})).attempt.status,'UNKNOWN');
 await assert.rejects(f.write('reconstruction.dispatch',{planDigest:f.attempt.claim.planDigest}),{code:'RECONSTRUCTION_BUSY'});
});
