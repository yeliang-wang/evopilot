import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {assembly} from './connection.test.mjs';
import {prepareNativeToolchain} from '../../dist/integration/toolchain/locked.js';
import {syntheticOnlinePackage} from '../../projects/evopilot-harness/examples/native/online-package.mjs';
import {syntheticDecisionEvidence} from './fixtures/decision-evidence.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const limit=Date.now()+30000;let value;while(Date.now()<limit){value=await fn();if(value)return value;await pause(150);}throw Error('Actual worker condition timed out');}
test('installed supervised worker survives client exit, restores selected schedules, blocks maintenance and stops only its owned job',{timeout:120000},async t=>{
 const f=await assembly(true),c=f.configuration.loadConfiguration(f.configPath);
 const lifecycle=await import(pathToFileURL(path.join(f.install,'dist/integration/online/lifecycle.js'))),configuration=await import(pathToFileURL(path.join(f.install,'dist/integration/online/config.js')));
 if(process.platform!=='darwin'){assert.throws(()=>lifecycle.inspectOnlineWorker(c),{code:'ONLINE_SUPERVISOR_UNSUPPORTED'});await f.cleanup();return;}
 let composition,server;let ratio=1;
 t.after(async()=>{composition?.close();try{await lifecycle.stopOnlineWorker(c,true);}finally{server?.closeAllConnections();await new Promise(r=>server?server.close(r):r());await f.cleanup();}});
 assert.equal(lifecycle.inspectOnlineWorker(c).loaded,false);assert.equal(fs.existsSync(c.workspaceRoot),false);
 await f.api.activateConnection(f.configPath);await f.api.stopConnection(f.configPath);
 const installedTools=JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN));const tools=await prepareNativeToolchain({cacheRoot:path.join(c.workspaceRoot,'native-toolchain'),downloadCache:path.join(path.dirname(path.dirname(installedTools.environmentRoot)),'downloads'),offline:true});
 server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),q=url.searchParams.get('query'),start=Number(url.searchParams.get('start')),end=Number(url.searchParams.get('end')),step=Number(url.searchParams.get('step'));const values=[];for(let at=start;at<=end;at+=step)values.push([at,String(q.startsWith('timestamp(')?at:q.includes('total')?1:ratio)]);res.end(JSON.stringify({status:'success',data:{resultType:'matrix',result:[{metric:{service:'example-service',environment:'test',deployment:'fixed'},values}]}}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const portServer=http.createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const port=portServer.address().port;await new Promise(r=>portServer.close(r));
 const tokenFile=path.join(f.base,'alert-token');fs.writeFileSync(tokenFile,'synthetic-worker-alert-secret',{mode:0o600});const scope={visibility:'private',projectId:'fictional'};
 const settings={scopes:[scope],prometheus:[{id:'metrics',origin:'http://127.0.0.1:'+server.address().port,bearerTokenFile:null,freshnessSeconds:3}],alertmanager:[{id:'alerts',bearerTokenFile:tokenFile}],receiverPort:port,tickSeconds:1};
 const configured=await f.api.withWorkspaceMaintenance(f.configPath,'configure',cfg=>configuration.configureOnline(cfg,{settings,expectedDigest:null,requestId:'configure'}));assert.equal(configured.workerStarted,false);
 const apis=await import(pathToFileURL(path.join(f.install,'dist/integration/composition.js')));composition=apis.createComposition({workspaceRoot:c.workspaceRoot,workspaceId:c.workspaceId},await apis.loadInstalledProducts(),{},{toolchain:tools});
 let serial=0;const read=(owner,operation,input={})=>composition.native(owner,{operation,scope,input});const write=async(operation,input)=>{
  if(input.humanEvidenceRef==='synthetic')input={...input,humanEvidenceRef:syntheticDecisionEvidence(f.base,{owner:'harness',operation,workspaceId:c.workspaceId,scope,reviewDigest:input.reviewDigest,decision:input.decision})};
  return composition.native('harness',{operation,scope,input,requestId:'prepare-'+(++serial),expectedRevision:operation.startsWith('online.')?(await read('harness','online.inspect')).revision:composition.inspect('harness',scope).revision});
 };
 const pkg=syntheticOnlinePackage(),id={id:pkg.manifest.id,version:pkg.manifest.version};await write('native.package.put',{package:pkg});await write('native.package.validate',id);const review=(await write('native.package.review',id)).result;await write('native.package.decide',{...id,reviewDigest:review.reviewDigest,decision:'APPROVE',humanEvidenceRef:'synthetic'});const pin=(await write('native.package.publish',id)).result.reference;
 const slo=JSON.parse(fs.readFileSync(new URL('../../projects/evopilot-harness/specifications/online/v1/example.json',import.meta.url)));slo.spec.timeWindow[0].duration='2s';
 const spec={id:'monitor',serviceId:'example-service',environment:'test',deploymentRevision:'fixed',providerId:'metrics',alertSourceId:'alerts',policy:pin,slo,intervalSeconds:2};const b=(await write('online.binding.put',{spec})).result;await write('online.binding.decide',{id:'monitor',reviewDigest:b.reviewDigest,decision:'APPROVE',humanEvidenceRef:'synthetic'});await write('online.binding.select',{id:'monitor',selected:true});
 const starter=`import {loadConfiguration} from ${JSON.stringify(pathToFileURL(path.join(f.install,'dist/integration/connection/config.js')).href)};import {startOnlineWorker} from ${JSON.stringify(pathToFileURL(path.join(f.install,'dist/integration/online/lifecycle.js')).href)};console.log(JSON.stringify(startOnlineWorker(loadConfiguration(${JSON.stringify(f.configPath)}))));`;
 const child=spawn(process.execPath,['--input-type=module','-e',starter],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const exit=await new Promise(r=>child.on('exit',r));assert.equal(exit,0,stderr);assert.equal(JSON.parse(stdout).started,true);
 const first=await until(()=>{const s=lifecycle.inspectOnlineWorker(c);return s.ready&&s.status.lastTickAt?s:null;});assert.ok(first.pid);assert.equal((await f.api.inspectConnection(f.configPath)).active,false,'Codex connection and launching client have both exited');
 await assert.rejects(()=>f.api.withWorkspaceMaintenance(f.configPath,'backup-check',async()=>{throw Error('must not enter');}),{code:'ONLINE_WORKER_ACTIVE'});
 ratio=0;const failed=await until(async()=>{const s=await read('runtime','online.inspect');return s.repairCandidates.find(x=>x.state==='FIRING');});assert.equal(failed.softwareRelease,false);
 const watermark=(await read('harness','online.binding.inspect',{id:'monitor'})).nextWindowEnd;
 await lifecycle.stopOnlineWorker(c);assert.equal(lifecycle.inspectOnlineWorker(c).loaded,false);
 ratio=1;lifecycle.startOnlineWorker(c);const second=await until(()=>{const s=lifecycle.inspectOnlineWorker(c);return s.ready&&s.pid!==first.pid?s:null;});assert.notEqual(second.pid,first.pid);
 const recovered=await until(async()=>{const r=await read('runtime','online.repair.inspect',{id:failed.id});return r?.state==='RESOLVED'?r:null;});assert.ok(recovered.history.some(h=>h.state==='FIRING'));assert.ok((await read('harness','online.binding.inspect',{id:'monitor'})).nextWindowEnd>watermark);
 const stopped=await lifecycle.stopOnlineWorker(c,true);assert.equal(stopped.evidencePreserved,true);assert.equal(lifecycle.inspectOnlineWorker(c).loaded,false);
 const count=(await read('harness','online.inspect')).observations.length;await pause(1100);assert.equal((await read('harness','online.inspect')).observations.length,count);
 await f.api.withWorkspaceMaintenance(f.configPath,'after-stop',async()=>({stopped:true}));
 assert.equal(fs.existsSync(tokenFile),true);const retained=await read('runtime','online.repair.inspect',{id:failed.id});assert(recovered.history.every(h=>retained.history.some(r=>r.digest===h.digest)));await pause(1100);assert.deepEqual(await read('runtime','online.repair.inspect',{id:failed.id}),retained);
});
