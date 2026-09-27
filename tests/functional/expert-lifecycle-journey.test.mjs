import {stageCompiledExpert} from '../helpers/isolated-compiled-expert.mjs';
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
import {LifecycleService} from '../../packages/server/dist/domains/lifecycle/index.js';

const env={PATH:process.env.PATH,TMPDIR:os.tmpdir(),EVOPILOT_LOG_LEVEL:'error'};
const definition=(version,name='Synthetic lifecycle')=>`schema: evopilot-lifecycle-definition/v1alpha1
metadata: { id: expert-journey, name: ${name}, version: ${version} }
capabilities: [project.read]
stages:
  - id: validate
    name: Validate
    action: { uses: project.validate@1 }
    decision: { mode: AUTO }
`;
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
const authorizationDigest='sha256:'+'a'.repeat(64);
const decision={authorizationDigest,evidenceRef:'decision://synthetic/exact'};
const lifecycleId='expert-journey';

test('Expert registration traverses actual stdio MCP and Runtime without adapter-side field loss',{timeout:30000},async t=>{
  const f=await fixture(t),host=await f.connect();
  const registered=data(await host.turn('create lifecycle',{yaml:definition('1.0.0'),evidenceRef:'decision://synthetic/create'}));
  assert.equal(registered.id,'expert-journey');assert.equal(registered.version,'1.0.0');
  const inspected=data(await host.turn('inspect lifecycle',{lifecycleId:registered.id,version:registered.version}));
  assert.equal(inspected.active,false);assert.equal(inspected.state.status,'REGISTERED');assert.equal(inspected.revisionDigest,registered.revisionDigest);
});

test('Expert lifecycle journey uses real local MCP and durable Runtime with synthetic authority only',{timeout:60000},async t=>{
  const f=await fixture(t);let host=await f.connect(),v1,v2,run,runBytes;
  const inspect=version=>host.turn('inspect lifecycle',{lifecycleId,version}).then(data);
  const audit=()=>host.turn('lifecycle audit',{lifecycleId}).then(data);
  const write=(action,body)=>host.turn(`${action} lifecycle`,{lifecycleId,...body,authorizationDigest},decision);
  const assertRun=async()=>{
    const observed=data(await host.client.callTool({name:'evopilot_lifecycle_run_inspect',arguments:{runId:run.id}}));
    assert.deepEqual(observed.binding,JSON.parse(runBytes).binding);assert.equal(observed.revision.digest,v1.revisionDigest);
    assert.equal(observed.status,'WAITING_AUTHORIZATION');
    assert.deepEqual(fs.readFileSync(path.join(f.root,'lifecycle-runs',run.id+'.json')),runBytes);
  };
  await t.test('create remains inactive; missing exact decision never reaches MCP',async()=>{
    v1=data(await host.turn('create lifecycle',{yaml:definition('1.0.0'),evidenceRef:'evidence://create'}));
    assert.equal((await inspect('1.0.0')).active,false);
    const payload={lifecycleId,version:'1.0.0',expectedActiveDigest:null,evidenceRef:'evidence://activate-v1',authorizationDigest},before=host.calls.length;
    await assert.rejects(host.turn('activate lifecycle',payload),/EXACT_DECISION_REQUIRED/);
    await assert.rejects(host.turn('activate lifecycle',payload,{...decision,authorizationDigest:'sha256:'+'b'.repeat(64)}),/DECISION_DIGEST_MISMATCH/);
    assert.equal(host.calls.length,before);
    data(await write('activate',{version:'1.0.0',expectedActiveDigest:null,evidenceRef:'evidence://activate-v1'}));
    assert.equal((await inspect('1.0.0')).active,true);
  });
  await t.test('resolve and input resolution are Runtime-owned reads, not activation or execution',async()=>{
    const before=await audit();
    const resolved=data(await host.turn('resolve lifecycle',{lifecycleId,lifecycleVersion:'1.0.0'}));
    assert.equal(resolved.revision.digest,v1.revisionDigest);
    const inputs=data(await host.turn('resolve lifecycle inputs',{lifecycleId,lifecycleVersion:'1.0.0',answers:{}}));
    assert.equal(inputs.status,'READY_FOR_REVIEW');assert.deepEqual(await audit(),before);
    // Seed only an existing bound run. This is NOT public run-start, published
    // Harness acceptance, live execution, or observed third-party Host qualification.
    const service=new LifecycleService(f.root,[path.resolve('lifecycles')]);
    run=service.start({id:'synthetic-existing-run',lifecycleId,lifecycleVersion:'1.0.0',tenantId:'lifecycle-test',workspaceId:'lifecycle-test',projectId:'synthetic',policyDigest:authorizationDigest,runtimeDigest:authorizationDigest,
      harnessBundle:{id:'synthetic',version:'1.0.0',digest:authorizationDigest},executor:{host:'synthetic-host',provider:'synthetic',model:'synthetic',capabilities:['project.read'],agentRuntime:{profileId:'synthetic',profileVersion:'1.0.0',adapterId:'synthetic@1',profileDigest:authorizationDigest,qualificationDigest:authorizationDigest},sandbox:{workspaceRef:f.root,permissionMode:'HOST_MANAGED_DENY_UNDECLARED'},allowedEffects:['READ_ONLY'],credentialRefs:[]}});
    runBytes=fs.readFileSync(path.join(f.root,'lifecycle-runs',run.id+'.json'));await assertRun();
  });
  await t.test('successor diff affects future planning without changing the existing bound run',async()=>{
    v2=data(await host.turn('update lifecycle',{yaml:definition('1.1.0','Synthetic successor'),evidenceRef:'evidence://successor'}));
    const diff=data(await host.turn('compare lifecycle versions',{lifecycleId,fromVersion:'1.0.0',toVersion:'1.1.0'}));
    assert.equal(diff.runningBindingsAffected,false);assert.equal(diff.futurePlanningAffected,true);
    assert.ok(diff.changes.some(change=>change.path==='$.metadata.name'));
    assert.equal((await inspect('1.0.0')).active,true);assert.equal((await inspect('1.1.0')).active,false);await assertRun();
  });
  await t.test('Runtime enforces viewer and cross-tenant boundaries despite a matching Expert decision',async()=>{
    const viewer=await f.connect('viewer'),foreign=await f.connect('foreign'),before=await audit();
    refused(await viewer.turn('activate lifecycle',{lifecycleId,version:'1.1.0',expectedActiveDigest:v1.revisionDigest,evidenceRef:'evidence://viewer',authorizationDigest},decision),'FORBIDDEN');
    refused(await foreign.turn('inspect lifecycle',{lifecycleId,version:'1.0.0'}),'LIFECYCLE_NOT_FOUND');
    const visible=data(await foreign.turn('list lifecycle',{}));assert.equal(visible.lifecycles.some(item=>item.id===lifecycleId),false);
    assert.deepEqual(await audit(),before);await assertRun();
  });
  await t.test('stale compare-and-set and active archive fail without state or audit mutation',async()=>{
    const before=await audit();
    refused(await write('activate',{version:'1.1.0',expectedActiveDigest:'sha256:'+'f'.repeat(64),evidenceRef:'evidence://stale'}),'MISMATCH|CONFLICT');
    refused(await write('archive',{version:'1.0.0',revisionDigest:v1.revisionDigest,evidenceRef:'evidence://active-archive'}),'ACTIVE_REVISION_ARCHIVE_FORBIDDEN');
    assert.equal((await inspect('1.0.0')).active,true);assert.deepEqual(await audit(),before);await assertRun();
  });
  await t.test('activate successor and explicit duplicate preserve one durable receipt and historical pins',async()=>{
    const input={version:'1.1.0',expectedActiveDigest:v1.revisionDigest,evidenceRef:'evidence://activate-v2'};
    const pointer=data(await write('activate',input)),before=await audit(),duplicate=data(await write('activate',input));
    assert.equal(pointer.digest,duplicate.digest);assert.deepEqual(await audit(),before);
    assert.equal((await inspect('1.0.0')).active,false);assert.equal((await inspect('1.1.0')).active,true);await assertRun();
  });
  await t.test('deactivate, archive and restore are distinct; restore never activates automatically',async()=>{
    const input={expectedActiveDigest:v2.revisionDigest,evidenceRef:'evidence://deactivate'};
    const pointer=data(await write('deactivate',input)),before=await audit();
    assert.equal(data(await write('deactivate',input)).digest,pointer.digest);assert.deepEqual(await audit(),before);
    refused(await host.turn('resolve lifecycle',{lifecycleId}),'NOT_ACTIVE');
    for(const action of ['archive','restore']){
      const body={version:'1.1.0',revisionDigest:v2.revisionDigest,evidenceRef:`evidence://${action}`};
      const first=data(await write(action,body)),auditBefore=await audit();assert.equal(data(await write(action,body)).digest,first.digest);assert.deepEqual(await audit(),auditBefore);
      const inspected=await inspect('1.1.0');assert.equal(inspected.active,false);assert.equal(inspected.state.status,action==='archive'?'ARCHIVED':'INACTIVE');
    }
    await assertRun();
  });
  await t.test('rollback restores the exact predecessor and exposes Runtime usage and audit',async()=>{
    const rollback=data(await write('rollback',{version:'1.0.0',expectedActiveDigest:v2.revisionDigest,evidenceRef:'evidence://rollback'}));
    assert.equal(rollback.action,'ROLLBACK');assert.equal(rollback.revisionDigest,v1.revisionDigest);
    const usage=data(await host.turn('lifecycle usage',{lifecycleId,version:'1.0.0'}));assert.ok(usage.some(item=>item.objectId===run.id&&item.bindingDigest===run.binding.digest));
    data(await host.turn('lifecycle dependencies',{lifecycleId,version:'1.0.0'}));
    const actions=(await audit()).map(item=>item.action);
    for(const action of ['REGISTER','ACTIVATE','DEACTIVATE','ARCHIVE','RESTORE','ROLLBACK'])assert.ok(actions.includes(action));
    assert.equal(actions.filter(action=>action==='ROLLBACK').length,1);await assertRun();
  });
  await t.test('actual Runtime and MCP process restart retains revisions, active pointer, audit and run bytes',async()=>{
    const before=await audit();await f.restart();host=await f.connect();
    assert.deepEqual(await audit(),before);assert.equal((await inspect('1.0.0')).active,true);assert.equal((await inspect('1.1.0')).active,false);
    await assertRun();
  });
});

test('uncertain Expert response does not replay an actual Runtime write; read-back finds one registration',{timeout:30000},async t=>{
  const f=await fixture(t),host=await f.connect();let writes=0;
  await assert.rejects(executeExpertTurn(planExpertTurn('create lifecycle',{yaml:definition('1.0.0'),evidenceRef:'evidence://uncertain'}),{invoke:async(name,args)=>{writes++;data(await host.client.callTool({name,arguments:args}));throw Error('SYNTHETIC_RESPONSE_LOST');}}),/SYNTHETIC_RESPONSE_LOST/);
  assert.equal(writes,1);assert.equal(data(await host.turn('inspect lifecycle',{lifecycleId,version:'1.0.0'})).active,false);
  assert.equal(data(await host.turn('lifecycle audit',{lifecycleId})).filter(item=>item.action==='REGISTER').length,1);
});

// Fixed corpus is exercised through the source SDK and public MCP. This fixture
// provides synthetic authority only and is not a Candidate or qualified Host.
import {runLifecycleJourney,validateLifecycleJourney} from '../e2e/versions/expert/2.3.0/lifecycle-journey.mjs';
import {runInstalledExpertLifecycle} from '../e2e/versions/run-installed-expert-lifecycle.mjs';
import {runInstalledBatch} from '../e2e/versions/run-installed-batch.mjs';
import {bytesDigest} from '../e2e/versions/installed-transport.mjs';
import {probeDigest} from '../e2e/versions/probe-session.mjs';
const journeyInput=()=>({lifecycleId:'corpus-lifecycle',evidenceRef:'evidence://synthetic/register',decisions:Object.fromEntries(['activateInitial','activateSuccessor','deactivate','archive','restore','rollback'].map(k=>[k,{authorizationDigest,evidenceRef:'decision://synthetic/'+k}]))});
test('fixed lifecycle corpus independently checks actual SDK envelopes and Runtime state',{timeout:60000},async t=>{
 const f=await fixture(t),host=await f.connect();
 const result=await runLifecycleJourney({input:journeyInput(),invokeTurn:frame=>executeExpertTurn(planExpertTurn(frame.text,frame.payload),{invoke:async(name,args)=>{assert.equal(name,frame.tool);assert.deepEqual(args,frame.mcpInput);return host.client.callTool({name,arguments:args});}},frame.decision)});
 assert.equal(result.status,'LIFECYCLE_STATE_ASSERTIONS_PASSED');assert.equal(result.events.length,22);assert.equal(result.targetCriteriaClosed,0);assert.equal(result.fullScenarioCoverage,'NOT_PROVEN');
 const before=host.calls.length;await assert.rejects(runLifecycleJourney({input:journeyInput(),invokeTurn:frame=>host.turn(frame.text,frame.payload,frame.decision)}),/FIXTURE_ALREADY_EXISTS/);assert.equal(host.calls.length,before+1);
});
for(const [name,change]of Object.entries({missingDecision:i=>delete i.decisions.restore,invalidDigest:i=>i.decisions.rollback.authorizationDigest='yes',yamlInjection:i=>i.lifecycleId='x, version: 9',extraAuthority:i=>i.approved=true}))test('lifecycle corpus rejects '+name+' before calls',async()=>{
 const input=journeyInput();change(input);let calls=0;assert.throws(()=>validateLifecycleJourney(input));await assert.rejects(runLifecycleJourney({input,invokeTurn:async()=>{calls++;}}));assert.equal(calls,0);
});
async function toyLifecycle(t,mode='normal'){
 const f=await fixture(t),host=await f.connect(),installationRoot=path.join(fs.realpathSync(f.root),'toy-sdk'),pkg='node_modules/@evopilot/evolution-expert';fs.mkdirSync(path.join(installationRoot,pkg,'dist'),{recursive:true});
 // This intentionally tiny substitute is a hostile relay fixture, not shipped SDK bytes.
 const source=`export const planExpertTurn=(text,payload)=>({text,payload});
 export async function executeExpertTurn({text,payload},t){
  const mode=${JSON.stringify(mode)};if(mode==='wrong')return t.invoke('evopilot_project_register',{});if(mode==='hang')return new Promise(()=>{setInterval(()=>{},1000);});
  const {authorizationDigest,...body}=payload;let suffix,argument;
  if(text==='create lifecycle'||text==='update lifecycle'){suffix='register';argument={payload:body};}
  else if(text==='compare lifecycle versions'){suffix='diff';argument=body;}
  else if(text==='lifecycle audit'){suffix='audit';argument=body;}
  else{suffix=text.split(' ')[0];if(['activate','deactivate','archive','restore','rollback'].includes(suffix)){const {lifecycleId,...rest}=body;argument={lifecycleId,payload:rest};}else argument=body;}
  const result=await t.invoke('evopilot_lifecycle_'+suffix,argument);
  if(mode==='extra')await t.invoke('evopilot_lifecycle_'+suffix,argument);
  return mode==='substitute'?{...result,changed:true}:result;
 }`;
 const files=[];for(const [relative,bytes]of Object.entries({'package.json':JSON.stringify({name:'@evopilot/evolution-expert',version:'2.3.0',type:'module'}),'dist/cli.js':'throw Error("no fallback");','dist/index.js':source})){
  const name=pkg+'/'+relative;fs.writeFileSync(path.join(installationRoot,name),bytes);files.push({path:name,digest:bytesDigest(bytes)});
 }
 const input=journeyInput(),context={schema:'evopilot-installed-expert-sdk-context/v1',product:'expert',version:'2.3.0',installationRoot,files,artifactSetDigest:probeDigest('synthetic-artifact'),acceptanceBindingDigest:probeDigest('synthetic-campaign'),probeInputDigest:probeDigest(input)};
 const contextBytes=Buffer.from(JSON.stringify(context));return{f,host,input,options:{contextBytes,expectedContextDigest:bytesDigest(contextBytes),inputBytes:Buffer.from(JSON.stringify(input))}};
}
test('lifecycle worker fails closed on denial, substitution, extra calls, timeout and uncertain mutation',{timeout:60000},async t=>{
 for(const mode of ['wrong','extra','substitute','denied','hang','unknown','restoreLie'])await t.test(mode,async t=>{
  const f=await toyLifecycle(t,['denied','unknown','restoreLie'].includes(mode)?'normal':mode),calls=[];let restored=false;
  const result=await runInstalledExpertLifecycle({...f.options,timeoutMs:mode==='hang'?100:30000,authorizeInvocation:async()=>mode!=='denied',invokeMcp:async c=>{
   calls.push(c);const r=await f.host.client.callTool({name:c.tool,arguments:c.payload});
   if(mode==='unknown'&&c.tool==='evopilot_lifecycle_register')throw Error('SYNTHETIC_RESPONSE_LOST');
   if(c.tool==='evopilot_lifecycle_restore')restored=true;
   if(mode==='restoreLie'&&restored&&c.tool==='evopilot_lifecycle_inspect')r.structuredContent.response.data.active=true;
   return r;
  }});
  assert.equal(result.status,mode==='unknown'?'UNKNOWN_OUTCOME':'LIFECYCLE_JOURNEY_STOPPED');assert.equal(result.releaseAuthorized,false);
  assert.equal(calls.length,['wrong','denied','hang'].includes(mode)?0:mode==='unknown'?2:mode==='restoreLie'?18:1);
  if(mode==='unknown'){const rows=data(await f.host.turn('lifecycle audit',{lifecycleId:f.input.lifecycleId}));assert.equal(rows.filter(r=>r.action==='REGISTER').length,1);}
  assert.equal(calls.some(c=>c.tool==='evopilot_lifecycle_rollback'),false);
 });
});
test('lifecycle batch persists a verified prefix and resumes without replaying state mutations',{timeout:60000},async t=>{
 const f=await toyLifecycle(t),context=JSON.parse(f.options.contextBytes),reports=new Map(),calls=[];
 const corpus=JSON.parse(fs.readFileSync(new URL('../e2e/versions/expert/2.3.0/case-plan.json',import.meta.url)));
 const plan={schema:'evopilot-installed-subjourney-batch/v1',id:'synthetic-lifecycle-batch',products:[{product:'expert',version:'2.3.0',targetDigest:corpus.target.fileDigest,artifactSetDigest:context.artifactSetDigest}],acceptanceBindingDigest:context.acceptanceBindingDigest,host:{id:'Codex',version:'fixture-1',qualificationDigest:probeDigest('synthetic')},steps:[{id:'lifecycle',product:'expert',caseId:'RC01',variantId:'RC01-M1',runner:'expert-lifecycle',contextDigest:f.options.expectedContextDigest,inputDigest:bytesDigest(f.options.inputBytes)}]};
 const planBytes=Buffer.from(JSON.stringify(plan));const options={planBytes,expectedPlanDigest:bytesDigest(planBytes),materials:[{id:'lifecycle',contextBytes:f.options.contextBytes,inputBytes:f.options.inputBytes}],journalFile:path.join(fs.realpathSync(f.f.root),'lifecycle-batch.jsonl'),authorizeCampaign:async()=>true,authorizeInvocation:async()=>true,invokeMcp:async c=>{calls.push(c);return f.host.client.callTool({name:c.tool,arguments:c.payload});},persistEvidence:async frame=>{reports.set(frame.step.id,structuredClone(frame));return true;},verifyEvidence:async frame=>{const r=reports.get(frame.step.id);return !!r&&r.planDigest===frame.planDigest&&r.report.status===frame.status&&probeDigest(r.report)===frame.reportDigest;}};
 const first=await runInstalledBatch(options);assert.equal(first.status,'SUBJOURNEYS_COMPLETED_NOT_ACCEPTED');assert.equal(first.completed,1);assert.equal(calls.length,22);
 const resumed=await runInstalledBatch(options);assert.equal(resumed.completed,1);assert.equal(calls.length,22);assert.equal(resumed.targetCriteriaClosed,0);
});

test('real compiled Expert SDK exercises Lifecycle state transitions through isolated worker and public MCP',{timeout:60000},async t=>{
 const f=await fixture(t),host=await f.connect(),input=journeyInput(),installed=stageCompiledExpert(f.root,input),calls=[];
 const result=await runInstalledExpertLifecycle({...installed.options,authorizeInvocation:async()=>true,invokeMcp:c=>{calls.push(c);return host.client.callTool({name:c.tool,arguments:c.payload});}});
 assert.equal(result.status,'LIFECYCLE_STATE_ASSERTIONS_PASSED',JSON.stringify(result));assert.equal(result.verifiedTurns.length,22);assert.equal(calls.length,22);
 assert.equal(result.formalAcceptance,'NOT_EVALUATED');assert.equal(result.realHost,'NOT_QUALIFIED');assert.equal(result.targetCriteriaClosed,0);assert.equal(result.releaseAuthorized,false);
});
