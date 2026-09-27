import {stageCompiledExpert} from '../helpers/isolated-compiled-expert.mjs';
import {runInstalledExpertGuidance} from '../e2e/versions/run-installed-expert-guidance.mjs';
import {runInstalledBatch} from '../e2e/versions/run-installed-batch.mjs';
import {bytesDigest} from '../e2e/versions/installed-transport.mjs';
import {probeDigest} from '../e2e/versions/probe-session.mjs';
import {runGovernedGuidanceJourney,validateGovernedGuidance} from '../e2e/versions/runtime/6.3.0/governed-guidance-journey.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {executeExpertTurn,planExpertTurn} from '../../packages/evolution-expert/dist/index.js';
const env={PATH:process.env.PATH,TMPDIR:os.tmpdir(),EVOPILOT_LOG_LEVEL:'error'};
async function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evopilot-expert-lifecycle-'));
  const clients=new Set();let child,base;
  async function start(){child=fork(path.resolve('tests/fixtures/lifecycle-expert-runtime.mjs'),[root],{env,stdio:['ignore','ignore','pipe','ipc']});let errors='';child.stderr.on('data',b=>{errors+=b;});const ready=await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw Error('Runtime fixture startup failed: '+errors);})]);base=`http://127.0.0.1:${ready[0].port}`;}
  async function stop(){if(child&&child.exitCode===null){const exit=once(child,'exit');child.send('stop');await exit;}}
  async function closeClients(){for(const c of clients)await c.close();clients.clear();}
  t.after(async()=>{await closeClients();await stop();fs.rmSync(root,{recursive:true,force:true});});await start();
  async function connect(actor='admin'){
    const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/adapter-mcp/dist/stdio.js')],env:{...env,EVOPILOT_SERVER:base,EVOPILOT_API_TOKEN:`synthetic-${actor}`},stderr:'pipe'});
    const client=new Client({name:'synthetic-lifecycle-journey',version:'1.0.0'});clients.add(client);await client.connect(transport);const calls=[];
    const invoke=async(name,args)=>{calls.push({name,args:structuredClone(args)});return client.callTool({name,arguments:args});};
    return{client,calls,turn:(text,payload,decision)=>executeExpertTurn(planExpertTurn(text,payload),{invoke},decision)};
  }
  return{root,connect,restart:async()=>{await closeClients();await stop();await start();}};
}
const data=result=>{assert.equal(result.isError,false,JSON.stringify(result));assert.equal(result.structuredContent.ok,true);assert.ok(result.structuredContent.requestId);return result.structuredContent.response.data;};
const refused=(result,code)=>{assert.equal(result.isError,true,JSON.stringify(result));assert.match(JSON.stringify(result.structuredContent),new RegExp(code));};
const hash='sha256:'+'a'.repeat(64);
test('Expert guidance crosses public stdio MCP with exact recovery facts and no implicit follow-on',{timeout:60000},async t=>{
 const f=await fixture(t),host=await f.connect();
 for(const text of ['help','tutorial']){
  const result=data(await host.turn(text,{sessionDigest:hash}));assert.equal(result.sessionDigest,hash);assert.equal(result.authority,'NONE');assert.equal(result.kind,'HELP');assert.ok(result.interactionId);assert.ok(result.digest);
 }
 const recovery={failureClass:'TRANSIENT',failureSignature:'synthetic-transient',bindingDigest:hash,attempt:0,maxAttempts:2,identicalInputs:true,reversible:true,externalEffect:false};
 const retry=data(await host.turn('recovery',recovery));assert.equal(retry.action,'AUTO_RETRY');assert.equal(retry.remainingBudget,2);assert.equal(retry.bindingDigest,hash);
 assert.equal(data(await host.turn('recovery',{...recovery,attempt:2})).action,'FAIL');
 assert.equal(data(await host.turn('recovery',{...recovery,failureClass:'UNCERTAIN_MUTATION'})).action,'HUMAN_DECISION');
 assert.equal(host.calls.length,5);
 refused(await host.turn('goal',{bindingDigest:hash,executor:{}}),'HARNESS_EXECUTION_BINDING_NOT_FOUND');
 const viewer=await f.connect('viewer');refused(await viewer.turn('recovery',recovery),'FORBIDDEN');
 for(const [text,payload]of [['acceptance',{sessionDigest:hash,acceptanceAggregate:{status:'PASS'}}],['cutover',{sessionDigest:hash,cutoverReadiness:{status:'READY'}}],['release',{sessionDigest:hash,releaseBinding:{digest:hash},authorizationDigest:hash}]]){
  const result=data(await host.turn(text,payload,{authorizationDigest:hash,evidenceRef:'decision://synthetic'}));assert.equal(result.authority,'NONE');assert.match(result.details.join(' '),/does not validate readiness or grant authority/);
 }
});
test('Expert observation survives actual MCP persistence and uncertain response without replay',{timeout:60000},async t=>{
 const f=await fixture(t);let host=await f.connect();
 const context={tenantId:'lifecycle-test',workspaceId:'lifecycle-test',...Object.fromEntries(['projectDefinitionDigest','lifecycleRevisionDigest','harnessExecutionBindingDigest','harnessBundleDigest','goalTargetDigest','runtimeDigest','hostDigest','providerDigest','environmentDigest','authorityDigest','evaluatorDigest','scorerDigest','evidenceDigest'].map(k=>[k,hash]))};
 const observation={id:'synthetic-feedback',context,signals:[{id:'synthetic-signal',kind:'USER_FEEDBACK',severity:'LOW',summary:'Synthetic feedback',evidenceRefs:['evidence://synthetic']}],capturedAt:'2026-09-26T00:00:00Z',provenance:{source:'EXPERT_INPUT',sourceRef:'conversation://synthetic'}};
 let calls=0;await assert.rejects(executeExpertTurn(planExpertTurn('record feedback',observation),{invoke:async(name,args)=>{calls++;const saved=data(await host.client.callTool({name,arguments:args}));assert.equal(saved.id,observation.id);assert.deepEqual(saved.context,context);throw Error('SYNTHETIC_RESPONSE_LOST');}}),/SYNTHETIC_RESPONSE_LOST/);assert.equal(calls,1);
 await f.restart();host=await f.connect();
 const saved=data(await host.turn('inspect lifecycle observation',{observationId:observation.id}));assert.equal(saved.observation.id,observation.id);assert.deepEqual(saved.observation.signals,observation.signals);
 const foreign=await f.connect('foreign');refused(await foreign.turn('inspect lifecycle observation',{observationId:observation.id}),'NOT_FOUND');
});
test('capability inventory preserves declared source provenance over public MCP',{timeout:60000},async t=>{
 const f=await fixture(t),host=await f.connect();
 const sources=[{suiteId:'synthetic-suite',sourceVersion:'1.0.0',snapshotDigest:hash,capabilities:[{id:'synthetic-capability',description:'Synthetic evidence',digest:hash}]}];
 const dispositions=[{sourceSuiteId:'synthetic-suite',capabilityId:'synthetic-capability',destination:{owner:'EXPERT',ref:'expert://synthetic'},validatorIds:['synthetic-validator']}];
 for(const text of ['production reference','capability','migration']){
  const inventory=data(await host.turn(text,{sources,dispositions}));assert.equal(inventory.coverage.total,1);assert.equal(inventory.coverage.percent,100);assert.deepEqual(inventory.sources,sources);assert.deepEqual(inventory.dispositions,dispositions);assert.equal(inventory.hiddenFallbackAllowed,false);
 }
 refused(await host.turn('capability',{sources,dispositions:[]}),'CAPABILITY_INVENTORY_UNMAPPED');
});

const guidanceInput=()=>({sessionDigest:hash,bindingDigest:hash,sources:[{suiteId:'synthetic-suite',sourceVersion:'1.0.0',snapshotDigest:hash,capabilities:[{id:'synthetic-capability',description:'Synthetic evidence',digest:hash}]}],dispositions:[{sourceSuiteId:'synthetic-suite',capabilityId:'synthetic-capability',destination:{owner:'EXPERT',ref:'expert://synthetic'},validatorIds:['synthetic-validator']}]});
test('fixed eight-turn guidance corpus verifies actual source Expert and MCP without claiming installed acceptance',{timeout:60000},async t=>{
 const f=await fixture(t),host=await f.connect();
 const result=await runGovernedGuidanceJourney({input:guidanceInput(),invokeTurn:frame=>executeExpertTurn(planExpertTurn(frame.text,frame.payload),{invoke:async(name,args)=>{assert.equal(name,frame.tool);assert.deepEqual(args,frame.mcpInput);return host.client.callTool({name,arguments:args});}})});
 assert.equal(result.status,'GOVERNED_GUIDANCE_ASSERTIONS_PASSED');assert.equal(result.events.length,8);assert.equal(result.targetCriteriaClosed,0);assert.equal(result.realHost,'NOT_QUALIFIED');
});
for(const [name,mutate]of Object.entries({arbitraryCommand:x=>x.command='synthetic',emptyInventory:x=>x.sources=[],duplicateDisposition:x=>x.dispositions.push(x.dispositions[0]),unmapped:x=>x.dispositions=[],credentialUrl:x=>x.sources[0].capabilities[0].description='https://synthetic:synthetic@example.test',fallback:x=>x.dispositions[0].destination.ref='codex-suite/legacy'}))test('guidance corpus rejects '+name,()=>{const input=guidanceInput();mutate(input);assert.throws(()=>validateGovernedGuidance(input));});
async function toyGuidance(t,mode='normal'){
 const f=await fixture(t),host=await f.connect(),installationRoot=path.join(f.root,'toy-sdk'),pkg='node_modules/@evopilot/evolution-expert';fs.mkdirSync(path.join(installationRoot,pkg,'dist'),{recursive:true});
 const source=`const mode=${JSON.stringify(mode)};
 export const planExpertTurn=(text,payload)=>({text,payload});
 export async function executeExpertTurn({text,payload},t){
  if(mode==='wrong')return t.invoke('evopilot_project_register',{});
  if(mode==='hang')return new Promise(()=>{});
  const help=text==='help'||text==='tutorial';
  const summary=text==='help'?"Explain installed-version concepts and route the user's intent.":'Run a side-effect-free guided tutorial.';
  const next=text==='help'?'Offer the smallest relevant next action.':'Offer project discovery without registering anything.';
  const body=help?{interactionId:'expert-'+text+'-'+payload.sessionDigest,sessionDigest:payload.sessionDigest,kind:'HELP',authority:'NONE',title:'EvoPilot '+text,summary,details:[next],objectRefs:[],nextAction:next}:payload;
  const tool=help?'evopilot_interaction_render':text==='recovery'?'evopilot_recovery_decide':'evopilot_capability_inventory_validate';
  const r=await t.invoke(tool,{payload:body});
  if(mode==='extra')await t.invoke(tool,{payload:body});
  return mode==='substitute'?{...r,changed:true}:r;
 }`;
 const files=[];for(const [relative,bytes]of Object.entries({'package.json':JSON.stringify({name:'@evopilot/evolution-expert',version:'2.3.0',type:'module'}),'dist/cli.js':'throw Error("no fallback");','dist/index.js':source})){
  const name=pkg+'/'+relative;fs.writeFileSync(path.join(installationRoot,name),bytes);files.push({path:name,digest:bytesDigest(bytes)});
 }
 const input=guidanceInput(),context={schema:'evopilot-installed-expert-sdk-context/v1',product:'expert',version:'2.3.0',installationRoot,files,artifactSetDigest:probeDigest('synthetic-artifact'),acceptanceBindingDigest:probeDigest('synthetic-campaign'),probeInputDigest:probeDigest(input)};
 const contextBytes=Buffer.from(JSON.stringify(context));return {f,host,input,options:{contextBytes,expectedContextDigest:bytesDigest(contextBytes),inputBytes:Buffer.from(JSON.stringify(input))}};
}
test('guidance SDK worker verifies fixed calls and actual MCP outputs using a toy package, not a Candidate',{timeout:60000},async t=>{
 const f=await toyGuidance(t),calls=[];
 const result=await runInstalledExpertGuidance({...f.options,authorizeInvocation:async()=>true,invokeMcp:async c=>{calls.push(c);return f.host.client.callTool({name:c.tool,arguments:c.payload});}});
 assert.equal(result.status,'GOVERNED_GUIDANCE_ASSERTIONS_PASSED');assert.equal(calls.length,8);assert.equal(result.verifiedTurns.length,8);assert.equal(result.targetCriteriaClosed,0);assert.equal(result.realHost,'NOT_QUALIFIED');
});
test('guidance worker rejects substituted calls/results, denial, timeout and response loss without replay',{timeout:60000},async t=>{
 for(const mode of ['wrong','extra','substitute','denied','hang','unknown'])await t.test(mode,async t=>{
  const f=await toyGuidance(t,['denied','unknown'].includes(mode)?'normal':mode),calls=[];
  const result=await runInstalledExpertGuidance({...f.options,timeoutMs:mode==='hang'?100:30000,authorizeInvocation:async()=>mode!=='denied',invokeMcp:async c=>{calls.push(c);const r=await f.host.client.callTool({name:c.tool,arguments:c.payload});if(mode==='unknown'&&c.tool==='evopilot_recovery_decide')throw Error('SYNTHETIC_RESPONSE_LOST');return r;}});
  assert.equal(result.status,mode==='unknown'?'UNKNOWN_OUTCOME':'GUIDANCE_JOURNEY_STOPPED');assert.equal(result.releaseAuthorized,false);
  assert.equal(calls.length,['wrong','denied','hang'].includes(mode)?0:mode==='unknown'?6:1);
 });
});
test('fixed guidance batch resumes verified evidence without repeating MCP requests',{timeout:60000},async t=>{
 const f=await toyGuidance(t),context=JSON.parse(f.options.contextBytes),reports=new Map(),calls=[];
 const corpus=JSON.parse(fs.readFileSync(new URL('../e2e/versions/expert/2.3.0/case-plan.json',import.meta.url)));
 const plan={schema:'evopilot-installed-subjourney-batch/v1',id:'synthetic-guidance-batch',products:[{product:'expert',version:'2.3.0',targetDigest:corpus.target.fileDigest,artifactSetDigest:context.artifactSetDigest}],acceptanceBindingDigest:context.acceptanceBindingDigest,host:{id:'Codex',version:'fixture-1',qualificationDigest:probeDigest('synthetic')},steps:[{id:'guidance',product:'expert',caseId:'RC01',variantId:'RC01-M1',runner:'expert-guidance',contextDigest:f.options.expectedContextDigest,inputDigest:bytesDigest(f.options.inputBytes)}]};
 const planBytes=Buffer.from(JSON.stringify(plan));const options={planBytes,expectedPlanDigest:bytesDigest(planBytes),materials:[{id:'guidance',contextBytes:f.options.contextBytes,inputBytes:f.options.inputBytes}],journalFile:path.join(fs.realpathSync(f.f.root),'guidance-batch.jsonl'),authorizeCampaign:async()=>true,authorizeInvocation:async()=>true,invokeMcp:async c=>{calls.push(c);return f.host.client.callTool({name:c.tool,arguments:c.payload});},persistEvidence:async frame=>{reports.set(frame.step.id,structuredClone(frame));return true;},verifyEvidence:async frame=>{const r=reports.get(frame.step.id);return !!r&&r.planDigest===frame.planDigest&&r.report.status===frame.status&&probeDigest(r.report)===frame.reportDigest;}};
 const first=await runInstalledBatch(options);assert.equal(first.status,'SUBJOURNEYS_COMPLETED_NOT_ACCEPTED');assert.equal(first.completed,1);assert.equal(calls.length,8);
 const resumed=await runInstalledBatch(options);assert.equal(resumed.completed,1);assert.equal(calls.length,8);assert.equal(resumed.targetCriteriaClosed,0);
});

test('real compiled Expert SDK exercises governed guidance through isolated worker and public MCP',{timeout:60000},async t=>{
 const f=await fixture(t),host=await f.connect(),input=guidanceInput(),installed=stageCompiledExpert(f.root,input),calls=[];
 const result=await runInstalledExpertGuidance({...installed.options,authorizeInvocation:async()=>true,invokeMcp:c=>{calls.push(c);return host.client.callTool({name:c.tool,arguments:c.payload});}});
 assert.equal(result.status,'GOVERNED_GUIDANCE_ASSERTIONS_PASSED',JSON.stringify(result));assert.equal(result.verifiedTurns.length,8);assert.equal(calls.length,8);
 assert.equal(result.formalAcceptance,'NOT_EVALUATED');assert.equal(result.realHost,'NOT_QUALIFIED');assert.equal(result.targetCriteriaClosed,0);assert.equal(result.releaseAuthorized,false);
});
