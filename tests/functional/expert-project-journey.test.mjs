import {stageCompiledExpert} from '../helpers/isolated-compiled-expert.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {runInstalledBatch} from '../e2e/versions/run-installed-batch.mjs';
import {validateProjectJourney} from '../e2e/versions/runtime/6.3.0/project-definition-journey.mjs';
import {runInstalledExpertProject,runInstalledExpertProjectReadback} from '../e2e/versions/run-installed-expert-project.mjs';
import {bytesDigest} from '../e2e/versions/installed-transport.mjs';
import {probeDigest} from '../e2e/versions/probe-session.mjs';
import {Client} from '@modelcontextprotocol/client';
import {FileStore} from '../../packages/server/dist/storage/file-store/index.js';
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
const definition=version=>({schema:'evopilot-evolution-project-definition/v1',metadata:{id:'synthetic-project',name:'Synthetic project',version,labels:{revision:version}},spec:{source:{provider:'github',repository:'synthetic/project',defaultBranch:'main',mode:'owned'},ecosystem:{languages:['typescript'],packageManagers:['npm'],frameworks:[]},delivery:{model:'open-source',ciProvider:'github-actions',candidateBeforeAcceptance:true,noRebuildPromotion:true,channels:['npm']},environment:{development:'local',acceptance:'isolated'},policyRefs:[],lifecycleRefs:['lifecycle://synthetic/1'],secretRefs:[],hostPreferences:['generic-agent'],runtimePreferences:['local'],evidenceSources:['synthetic']}});
const projectDefinitionId='synthetic-project';
test('Expert project discovery, immutable registration, revision impact and restart cross actual public stdio MCP',{timeout:60000},async t=>{
  const f=await fixture(t);let host=await f.connect();
  const projectDiscovery=data(await host.turn('discover project',{projectFacts:{projectId:projectDefinitionId,repository:'synthetic/project'}}));
  assert.equal(projectDiscovery.schema,'evopilot-evolution-project-discovery/v1');
  assert.equal(projectDiscovery.detected.repository,'synthetic/project');assert.ok(projectDiscovery.questions.some(q=>q.id==='project-name'));
  assert.equal(data(await host.turn('list project definitions',{})).items.length,0);
  const v1=data(await host.turn('register project',{projectDiscovery,projectDefinition:definition('1.0.0')}));
  assert.equal(v1.metadata.id,projectDefinitionId);assert.equal(v1.spec.source.repository,'synthetic/project');
  assert.equal(data(await host.turn('inspect project definition',{projectDefinitionId})).digest,v1.digest);
  const v2=data(await host.turn('adjust project',{projectImpact:{status:'synthetic-context-not-authority'},projectDefinition:definition('1.1.0')}));
  assert.notEqual(v1.digest,v2.digest);
  assert.equal(data(await host.turn('inspect project definition',{projectDefinitionId})).digest,v1.digest);
  const impact=data(await host.turn('compare project versions',{projectDefinitionId,fromVersion:'1.0.0',toVersion:'1.1.0'}));
  assert.equal(impact.schema,'evopilot-evolution-project-impact/v1');assert.equal(impact.rollbackVersion,'1.0.0');assert.equal(impact.compatibility,'REQUIRES_REVALIDATION');assert.ok(impact.changes.some(x=>x.path==='metadata.labels'));
  const altered=definition('1.0.0');altered.metadata.name='Changed';
  refused(await host.turn('register project',{projectDiscovery,projectDefinition:altered}),'IMMUTABLE_CONFLICT');
  const viewer=await f.connect('viewer'),foreign=await f.connect('foreign');
  refused(await viewer.turn('register project',{projectDiscovery,projectDefinition:definition('1.2.0')}),'FORBIDDEN');
  refused(await foreign.turn('inspect project definition',{projectDefinitionId}),'NOT_FOUND');
  assert.equal(data(await foreign.turn('list project definitions',{})).items.length,0);
  const switchRevision=(verb,target,from,extra={})=>host.turn(`${verb} project definition`,{projectDefinitionId,version:target.metadata.version,definitionDigest:target.digest,expectedActiveDigest:from.digest,authorizationDigest:target.digest,evidenceRef:`decision://synthetic/${verb}`,...extra},{authorizationDigest:target.digest,evidenceRef:`decision://synthetic/${verb}`});
  const beforeCalls=host.calls.length;
  await assert.rejects(host.turn('activate project definition',{projectDefinitionId,version:'1.1.0',definitionDigest:v2.digest,expectedActiveDigest:v1.digest,authorizationDigest:v2.digest,evidenceRef:'decision://synthetic/activate'}),/EXACT_DECISION_REQUIRED/);
  assert.equal(host.calls.length,beforeCalls);
  const activated=data(await switchRevision('activate',v2,v1));assert.equal(activated.reason,'explicit-activation');
  assert.equal(data(await host.turn('inspect project definition',{projectDefinitionId})).digest,v2.digest);
  refused(await switchRevision('rollback',v1,v1),'ACTIVE_CONFLICT');
  refused(await host.client.callTool({name:'evopilot_project_definition_rollback',arguments:{projectDefinitionId,payload:{version:'1.0.0',definitionDigest:v2.digest,expectedActiveDigest:v2.digest,evidenceRef:'decision://wrong-destination'}}}),'DEFINITION_MISMATCH');
  assert.equal(data(await host.turn('inspect project definition',{projectDefinitionId})).digest,v2.digest);
  const rolledBack=data(await switchRevision('rollback',v1,v2));assert.equal(rolledBack.reason,'explicit-rollback');assert.equal(rolledBack.definitionDigest,v1.digest);
  assert.equal(data(await host.turn('inspect project definition',{projectDefinitionId,version:'1.1.0'})).digest,v2.digest);
  await f.restart();host=await f.connect();
  assert.equal(data(await host.turn('inspect project definition',{projectDefinitionId})).digest,v1.digest);
  assert.equal(data(await host.turn('inspect project definition',{projectDefinitionId,version:'1.1.0'})).digest,v2.digest);
  assert.equal(data(await host.turn('list project definitions',{})).items.length,2);
});
test('project registration response loss is read back without automatic replay',{timeout:30000},async t=>{
  const f=await fixture(t),host=await f.connect();let writes=0;
  await assert.rejects(executeExpertTurn(planExpertTurn('register project',{projectDiscovery:{},projectDefinition:definition('1.0.0')}),{invoke:async(name,args)=>{writes++;data(await host.client.callTool({name,arguments:args}));throw Error('SYNTHETIC_RESPONSE_LOST');}}),/SYNTHETIC_RESPONSE_LOST/);
  assert.equal(writes,1);assert.equal(data(await host.turn('inspect project definition',{projectDefinitionId})).metadata.version,'1.0.0');assert.equal(data(await host.turn('list project definitions',{})).items.length,1);
});

// Toy SDK validates installed-runner mechanics against source Runtime. It is
// deliberately not an installed Candidate or a qualified external Agent Host.
async function toyInstalledProject(t,mode='normal'){
 const f=await fixture(t),host=await f.connect();const installationRoot=path.join(f.root,'toy-installation'),pkg='node_modules/@evopilot/evolution-expert';fs.mkdirSync(path.join(installationRoot,pkg,'dist'),{recursive:true});
 const source=`const mode=${JSON.stringify(mode)};
 export function planExpertTurn(text,payload){return {text,payload};}
 export async function executeExpertTurn({text,payload:p},t){
  const op=text.startsWith('discover')?'discover':text.startsWith('list')?'list':text.startsWith('inspect')?'inspect':text.startsWith('compare')?'diff':text.startsWith('activate')?'activate':text.startsWith('rollback')?'rollback':'register';
  const args=op==='discover'?{payload:p.projectFacts}:op==='register'?{payload:p.projectDefinition}:['activate','rollback'].includes(op)?{projectDefinitionId:p.projectDefinitionId,payload:Object.fromEntries(['version','definitionDigest','expectedActiveDigest','evidenceRef'].map(k=>[k,p[k]]))}:p;
  if(mode==='wrong-call')return t.invoke('evopilot_project_definition_activate',{});
  if(mode==='hang')await new Promise(()=>setInterval(()=>{},1000));
  const r=await t.invoke('evopilot_project_definition_'+op,args);
  if(mode==='extra-call')await t.invoke('evopilot_project_definition_'+op,args);
  if(mode==='substitute')r.structuredContent.response.data={fake:true};
  return r;
 }`;
 const files=[];for(const [relative,bytes] of Object.entries({'package.json':JSON.stringify({name:'@evopilot/evolution-expert',version:'2.3.0',type:'module'}),'dist/cli.js':'throw Error("no fallback");','dist/index.js':source})){
  const name=pkg+'/'+relative;fs.writeFileSync(path.join(installationRoot,name),bytes);files.push({path:name,digest:bytesDigest(bytes)});
 }
 const input={first:definition('1.0.0'),successor:definition('1.1.0'),decisionEvidenceRef:'decision://synthetic/project-journey'};
 const context={schema:'evopilot-installed-expert-sdk-context/v1',product:'expert',version:'2.3.0',installationRoot,files,artifactSetDigest:probeDigest('synthetic-artifact'),acceptanceBindingDigest:probeDigest('synthetic-campaign'),probeInputDigest:probeDigest(input)};
 const contextBytes=Buffer.from(JSON.stringify(context));return {f,host,input,options:{contextBytes,expectedContextDigest:bytesDigest(contextBytes),inputBytes:Buffer.from(JSON.stringify(input))}};
}
test('fixed installed project runner exercises full declaration journey with a toy SDK and actual source Runtime',{timeout:60000},async t=>{
 const f=await toyInstalledProject(t),calls=[],effects=[];
 const result=await runInstalledExpertProject({...f.options,authorizeInvocation:async frame=>{effects.push(frame.effect);return true;},invokeMcp:async c=>{calls.push(c);return f.host.client.callTool({name:c.tool,arguments:c.payload});}});
 assert.equal(result.status,'PROJECT_DEFINITION_JOURNEY_ASSERTIONS_PASSED');assert.equal(result.verifiedTurns.length,13);assert.equal(result.events.length,13);assert.equal(result.selectedDigest,result.firstDigest);assert.equal(result.targetCriteriaClosed,0);assert.equal(result.realHost,'NOT_QUALIFIED');
 assert.equal(effects.filter(e=>e==='SELECT_DEFINITION').length,2);assert.equal(calls.filter(c=>c.tool.endsWith('_register')).length,2);
});
test('installed project runner refuses hostile SDK calls, denied authority and uncertain mutations without replay',{timeout:60000},async t=>{
 for(const mode of ['wrong-call','extra-call','substitute','hang','denied','unknown'])await t.test(mode,async t=>{
  const f=await toyInstalledProject(t,['denied','unknown'].includes(mode)?'normal':mode),calls=[];
  const result=await runInstalledExpertProject({...f.options,timeoutMs:mode==='hang'?100:30000,authorizeInvocation:async()=>mode!=='denied',invokeMcp:async c=>{
   calls.push(c);const response=await f.host.client.callTool({name:c.tool,arguments:c.payload});if(mode==='unknown'&&c.tool.endsWith('_register'))throw Error('SYNTHETIC_RESPONSE_LOST');return response;
  }});
  assert.equal(result.status,mode==='unknown'?'UNKNOWN_OUTCOME':'PROJECT_JOURNEY_STOPPED');assert.equal(result.releaseAuthorized,false);
  if(['wrong-call','hang','denied'].includes(mode))assert.equal(calls.length,0);
  if(['extra-call','substitute'].includes(mode))assert.equal(calls.length,1);
  if(mode==='unknown'){assert.equal(calls.length,3);assert.equal(data(await f.host.turn('list project definitions',{})).items.length,1);}
 });
});

test('project declaration journey participates in a resumable frozen batch without replay',{timeout:60000},async t=>{
 const f=await toyInstalledProject(t),context=JSON.parse(f.options.contextBytes),reports=new Map(),calls=[];
 const corpus=JSON.parse(fs.readFileSync(new URL('../e2e/versions/expert/2.3.0/case-plan.json',import.meta.url)));
 const plan={schema:'evopilot-installed-subjourney-batch/v1',id:'synthetic-project-batch',products:[{product:'expert',version:'2.3.0',targetDigest:corpus.target.fileDigest,artifactSetDigest:context.artifactSetDigest}],acceptanceBindingDigest:context.acceptanceBindingDigest,host:{id:'Codex',version:'fixture-1',qualificationDigest:probeDigest('synthetic')},steps:[{id:'project-journey',product:'expert',caseId:'RC01',variantId:'RC01-M1',runner:'expert-project',contextDigest:f.options.expectedContextDigest,inputDigest:bytesDigest(f.options.inputBytes)}]};
 const planBytes=Buffer.from(JSON.stringify(plan));const options={planBytes,expectedPlanDigest:bytesDigest(planBytes),materials:[{id:'project-journey',contextBytes:f.options.contextBytes,inputBytes:f.options.inputBytes}],journalFile:path.join(fs.realpathSync(f.f.root),'project-batch.jsonl'),authorizeCampaign:async()=>true,authorizeInvocation:async()=>true,
  invokeMcp:async c=>{calls.push(c);return f.host.client.callTool({name:c.tool,arguments:c.payload});},persistEvidence:async frame=>{reports.set(frame.step.id,structuredClone(frame));return true;},verifyEvidence:async frame=>{const r=reports.get(frame.step.id);return !!r&&r.planDigest===frame.planDigest&&r.report.status===frame.status&&probeDigest(r.report)===frame.reportDigest;}};
 const first=await runInstalledBatch(options);assert.equal(first.status,'SUBJOURNEYS_COMPLETED_NOT_ACCEPTED');assert.equal(first.completed,1);assert.equal(calls.length,13);
 const resumed=await runInstalledBatch(options);assert.equal(resumed.completed,1);assert.equal(calls.length,13);assert.equal(resumed.targetCriteriaClosed,0);
});
for(const [name,mutate]of Object.entries({
 'credential reference':x=>x.first.spec.secretRefs=['secret://forbidden'],
 'secret label':x=>x.first.metadata.labels.password='synthetic',
 'credential URL':x=>x.first.spec.source.repository='https://synthetic:synthetic@example.test/project',
 'environment field':x=>x.first.spec.environment.password='synthetic',
 'duplicate declaration version':x=>x.successor.metadata.version=x.first.metadata.version,
 'unchanged impact':x=>x.successor.metadata.labels=x.first.metadata.labels,
 'noncanonical array':x=>x.first.spec.ecosystem.languages=['z','a'],
 'unknown source provider':x=>x.first.spec.source.provider='execute-script',
 'arbitrary command':x=>x.command='synthetic'
}))test('project journey preflight refuses '+name,()=>{
 const input={first:definition('1.0.0'),successor:definition('1.1.0'),decisionEvidenceRef:'decision://synthetic/journey'};mutate(input);assert.throws(()=>validateProjectJourney(input));
});

test('Expert connects a separate scoped project through public MCP without inferring LLM or semantic readiness',{timeout:60000},async t=>{
 const f=await fixture(t),host=await f.connect(),source=path.join(f.root,'synthetic-source');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'README.md'),'Synthetic source, never executed.\n');
 const store=new FileStore(f.root),now='2026-09-26T00:00:00Z';store.writeWorkspace({schema:'evopilot-workspace/v1',id:'lifecycle-test',tenantId:'lifecycle-test',name:'Synthetic',status:'ACTIVE',members:[],quotas:{projects:20,loops:20,evidenceGb:1},createdAt:now,updatedAt:now});
 const registration={id:'connected-project',name:'Connected project',repository:{provider:'local-git',root:source,defaultBranch:'main'}};
 const declaration=definition('1.0.0');declaration.metadata.id=registration.id;declaration.spec.source={provider:'local-git',repository:source,defaultBranch:'main',mode:'owned'};
 data(await host.turn('register project',{projectDiscovery:{source:'synthetic-input'},projectDefinition:declaration}));
 assert.ok(!data(await host.turn('list connected projects',{})).some(p=>p.id===registration.id));
 const blocked=await host.turn('plan project connection',{projectRegistration:{...registration,requireLlmReady:true}});
 assert.equal(blocked.isError,true);const checklist=blocked.structuredContent.response.data;assert.equal(checklist.schema,'evopilot-project-onboarding-checklist/v1');assert.equal(checklist.status,'BLOCKED');assert.equal(checklist.steps.find(s=>s.id==='llm').status,'FAIL');
 assert.equal(store.readProject(registration.id),undefined);
 const project=data(await host.turn('connect project',{projectRegistration:registration}));assert.equal(project.id,registration.id);assert.equal(project.tenantId,'lifecycle-test');assert.equal(project.workspaceId,'lifecycle-test');assert.equal(project.validation.status,'VERIFIED');
 assert.equal(data(await host.turn('inspect connected project',{projectId:project.id})).id,project.id);
 const ready=data(await host.turn('project readiness',{projectId:project.id}));assert.equal(ready.schema,'evopilot-project-onboarding-checklist/v1');assert.equal(ready.steps.find(s=>s.id==='llm').status,'WARN');assert.equal(ready.nextAction,'plan-target');
 const viewer=await f.connect('viewer');refused(await viewer.turn('connect project',{projectRegistration:{...registration,id:'viewer-project'}}),'FORBIDDEN');
 const semantic=await host.turn('项目语义接入引导',{projectId:project.id,catalogId:'missing-catalog'});assert.equal(semantic.isError,true);assert.equal(semantic.structuredContent.tool,'evopilot_project_semantic_capabilities');assert.equal(semantic.structuredContent.status,403);assert.equal(semantic.structuredContent.response.error,'SEMANTIC_CATALOG_PERMISSION_DENIED');
 assert.equal(store.readProject(registration.id).id,project.id);assert.equal(store.readProject('viewer-project'),undefined);
});

test('installed project readback checks persisted revisions after actual Runtime restart without mutation',{timeout:60000},async t=>{
 const f=await toyInstalledProject(t);
 const before=await runInstalledExpertProject({...f.options,authorizeInvocation:async()=>true,invokeMcp:c=>f.host.client.callTool({name:c.tool,arguments:c.payload})});
 assert.equal(before.status,'PROJECT_DEFINITION_JOURNEY_ASSERTIONS_PASSED');
 await f.f.restart();const host=await f.f.connect(),calls=[];
 const options={...f.options,authorizeInvocation:async frame=>{assert.equal(frame.effect,'READ_DEFINITION');return true;},invokeMcp:c=>{calls.push(c);return host.client.callTool({name:c.tool,arguments:c.payload});}};
 const result=await runInstalledExpertProjectReadback(options);
 assert.equal(result.status,'PROJECT_DEFINITION_READBACK_ASSERTIONS_PASSED');assert.equal(result.selectedDigest,before.firstDigest);assert.equal(result.verifiedTurns.length,4);
 assert(calls.every(c=>c.tool.endsWith('_inspect')||c.tool.endsWith('_list')));assert.equal(result.targetCriteriaClosed,0);assert.equal(result.releaseAuthorized,false);
 const context=JSON.parse(f.options.contextBytes),corpus=JSON.parse(fs.readFileSync(new URL('../e2e/versions/expert/2.3.0/case-plan.json',import.meta.url))),reports=new Map();
 const plan={schema:'evopilot-installed-subjourney-batch/v1',id:'synthetic-readback-batch',products:[{product:'expert',version:'2.3.0',targetDigest:corpus.target.fileDigest,artifactSetDigest:context.artifactSetDigest}],acceptanceBindingDigest:context.acceptanceBindingDigest,host:{id:'Codex',version:'fixture-1',qualificationDigest:probeDigest('synthetic')},steps:[{id:'readback',product:'expert',caseId:'RC01',variantId:'RC01-M1',runner:'expert-project-readback',contextDigest:f.options.expectedContextDigest,inputDigest:bytesDigest(f.options.inputBytes)}]};
 const planBytes=Buffer.from(JSON.stringify(plan)),batch={planBytes,expectedPlanDigest:bytesDigest(planBytes),materials:[{id:'readback',contextBytes:f.options.contextBytes,inputBytes:f.options.inputBytes}],journalFile:path.join(fs.realpathSync(f.f.root),'readback-batch.jsonl'),authorizeCampaign:async()=>true,authorizeInvocation:frame=>options.authorizeInvocation(frame.invocation),invokeMcp:options.invokeMcp,persistEvidence:async e=>{reports.set(e.step.id,structuredClone(e));return true;},verifyEvidence:async e=>{const r=reports.get(e.step.id);return !!r&&r.planDigest===e.planDigest&&r.report.status===e.status&&probeDigest(r.report)===e.reportDigest;}};
 assert.equal((await runInstalledBatch(batch)).completed,1);assert.equal(calls.length,8);
 assert.equal((await runInstalledBatch(batch)).completed,1);assert.equal(calls.length,8);

 const denied=await runInstalledExpertProjectReadback({...options,authorizeInvocation:async()=>false});assert.equal(denied.status,'PROJECT_JOURNEY_STOPPED');assert.equal(calls.length,8);
 for(const mode of ['wrong-active','missing-revision','changed-definition']){
  const broken=await runInstalledExpertProjectReadback({...options,invokeMcp:async c=>{
   const response=await host.client.callTool({name:c.tool,arguments:c.payload});const payload=response.structuredContent.response;
   if(mode==='wrong-active'&&c.tool.endsWith('_inspect')&&!c.payload.version)payload.data={...f.input.successor,digest:probeDigest(f.input.successor)};
   if(mode==='missing-revision'&&c.tool.endsWith('_list'))payload.data.items.pop();
   if(mode==='changed-definition'&&c.tool.endsWith('_inspect')&&c.payload.version)payload.data.metadata.name='tampered';
   return response;
  }});
  assert.equal(broken.status,'PROJECT_JOURNEY_STOPPED',mode);assert.equal(broken.targetCriteriaClosed,0);
 }
});

// Isolated compiled source packages, not a release Candidate. Unlike the toy
// fault-injection tests this executes the real Expert SDK and contracts in the
// worker. Exact release provenance and real Host qualification remain separate.
async function isolatedCompiledProject(t){
 const f=await fixture(t),host=await f.connect();
 const input={first:definition('1.0.0'),successor:definition('1.1.0'),decisionEvidenceRef:'decision://synthetic/compiled-project'};
 return {f,host,input,...stageCompiledExpert(f.root,input)};
}
test('real compiled Expert SDK runs isolated project lifecycle and post-restart readback through public MCP',{timeout:60000},async t=>{
 const f=await isolatedCompiledProject(t),calls=[],effects=[];
 const authorizeInvocation=async frame=>{effects.push(frame.effect);return true;};
 const first=await runInstalledExpertProject({...f.options,authorizeInvocation,invokeMcp:c=>{calls.push(c);return f.host.client.callTool({name:c.tool,arguments:c.payload});}});
 assert.equal(first.status,'PROJECT_DEFINITION_JOURNEY_ASSERTIONS_PASSED',JSON.stringify(first));assert.equal(first.verifiedTurns.length,13);assert.equal(calls.length,13);
 assert.equal(effects.filter(e=>e==='SELECT_DEFINITION').length,2);assert.equal(first.selectedDigest,first.firstDigest);
 await f.f.restart();const host=await f.f.connect();
 const after=await runInstalledExpertProjectReadback({...f.options,authorizeInvocation:async frame=>{assert.equal(frame.effect,'READ_DEFINITION');return true;},invokeMcp:c=>{calls.push(c);return host.client.callTool({name:c.tool,arguments:c.payload});}});
 assert.equal(after.status,'PROJECT_DEFINITION_READBACK_ASSERTIONS_PASSED',JSON.stringify(after));assert.equal(after.verifiedTurns.length,4);assert.equal(after.selectedDigest,first.firstDigest);assert.equal(calls.length,17);
 assert.equal(after.formalAcceptance,'NOT_EVALUATED');assert.equal(after.realHost,'NOT_QUALIFIED');assert.equal(after.releaseAuthorized,false);
 fs.appendFileSync(path.join(f.installationRoot,'node_modules/@evopilot/contracts/dist/index.js'),'\n// drift\n');
 await assert.rejects(runInstalledExpertProjectReadback({...f.options,authorizeInvocation,invokeMcp:async()=>{throw Error('must not invoke after drift');}}));
 assert.equal(calls.length,17);
});
