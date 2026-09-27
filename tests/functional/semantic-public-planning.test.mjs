import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {semanticCurrentOwnerFixture} from '../helpers/semantic-current-owner-fixture.mjs';
import {createServer} from '../../packages/server/dist/index.js';
import {semanticExecutionImplementationDigest} from '../../packages/server/dist/application/semantic-execution-application.js';

async function fixture(t) {
 const f=await semanticCurrentOwnerFixture(t,{publishedMaterials:true,runtimeDigest:semanticExecutionImplementationDigest});
 const server=createServer({dataRoot:f.configuration.dataRoot,runtimeMode:'debug',llmClient:{},allowSampleData:false,autoRegisterProfileProject:false,
  harnessRegistryConfig:f.configuration.registryConfigPath,semanticCatalogPolicyPath:f.configuration.policyPath,
  tokens:[{name:f.access.principal.id,token:'controlled-admin',role:'admin',tenantId:f.scope.tenantId,workspaceId:f.scope.workspaceId}]});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const call=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/`+route,{method:'POST',headers:{authorization:'Bearer controlled-admin','content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const ok=async(route,body)=>{const r=await call(route,body);assert.ok(r.status>=200&&r.status<300,JSON.stringify(r));return r.body.data;};
 await ok('workspaces',{id:f.scope.workspaceId,tenantId:f.scope.tenantId,name:'Controlled test workspace'});
 const yaml=fs.readFileSync(path.join(f.root,'context-lifecycles/context.yaml'),'utf8').replaceAll('synthetic-lifecycle','public-lifecycle');
 await ok('lifecycles',{yaml,sourceType:'NATIVE',sourceRef:'test://public-setup',evidenceRef:'test://controlled-fixture'});
 await ok('lifecycles/public-lifecycle/activate',{version:'1.0.0',evidenceRef:'test://controlled-fixture'});
 const input={projectDefinitionId:f.scope.projectId,goalTarget:f.state.goalTarget,lifecycleId:'public-lifecycle',lifecycleVersion:'1.0.0',executor:f.state.executor,semanticGovernedSources:f.refs};
 return {...f,call,ok,input};
}
test('public Goal approval persists dependency-ready targets without projecting completion',async t=>{
 const f=await fixture(t),goal=await f.ok('goals',{id:'public-created',projectId:f.scope.projectId,objective:'Controlled data only'});
 await f.ok(`goals/${goal.id}/plan/apply`,{targets:['alpha','beta','rc','ga'].map((phase,i)=>({id:phase,phase,title:phase,description:'Controlled fixture',layer:'runtime',required:true,dependencyIds:i?[['alpha','beta','rc','ga'][i-1]]:[],acceptanceCriteria:['typed data assertion']}))});
 await f.ok(`goals/${goal.id}/approve-plan`,{confirmedBy:'test-operator',confirmation:'Approve controlled fixture only'});
 const raw=JSON.parse(fs.readFileSync(path.join(f.configuration.dataRoot,'goals',goal.id+'.json')));
 assert.equal(raw.status,'APPROVED');assert.deepEqual(raw.plan.targets.map(x=>x.status),['READY','PENDING','PENDING','PENDING']);assert.ok(raw.plan.targets.every(x=>!x.loopId));assert.equal(raw.finalReport,undefined);
});
test('public semantic planning derives live resource and implementation pins, retaining the legacy route',async t=>{
 const f=await fixture(t),plan=await f.ok('governed-evolution/plan',f.input);
 assert.equal(plan.binding.authorityDigest,f.refs.authority.digest);assert.equal(plan.binding.runtimeDigest,semanticExecutionImplementationDigest);
 const revalidated=await f.ok('governed-evolution/revalidate',{...f.input,bindingDigest:plan.binding.digest});assert.equal(revalidated.status,'VALID');
 for(const k of ['policy','provider','environment','evidence'])assert.equal(plan.binding[k+'Digest'],f.refs[k].digest);
 const {semanticGovernedSources,...legacy}=f.input;
 Object.assign(legacy,Object.fromEntries(['policy','provider','environment','evidence'].map(k=>[k+'Digest',f.refs[k].digest])),{runtimeDigest:semanticExecutionImplementationDigest});
 const ordinary=await f.ok('governed-evolution/plan',legacy);assert.notEqual(ordinary.binding.authorityDigest,f.refs.authority.digest);
});
test('public semantic planning rejects missing, stale, injected and denied sources before writing a plan',async t=>{
 const f=await fixture(t),before=fs.readdirSync(f.governed.bindingsDir,{recursive:true}).sort();
 for(const [change,expected] of [
  [x=>{x.semanticGovernedSources=null;},400],
  [x=>{delete x.semanticGovernedSources.authority;},400],
  [x=>{x.semanticGovernedSources.authority.digest='sha256:'+'0'.repeat(64);},409],
  [x=>{x.semanticGovernedSources.authority.id='foreign-grant';},404],
  [x=>{x.runtimeDigest='sha256:'+'0'.repeat(64);},409],
  [x=>{x.authorityDigest='sha256:'+'0'.repeat(64);},409],
  [x=>{x.executor.allowedEffects.push('IRREVERSIBLE');},403],
  [x=>{x.executor.capabilities.push('release.publish');},403]
 ]){const input=structuredClone(f.input);change(input);const response=await f.call('governed-evolution/plan',input);assert.equal(response.status,expected,JSON.stringify(response));}
 assert.deepEqual(fs.readdirSync(f.governed.bindingsDir,{recursive:true}).sort(),before);
});

test('public planning, pending execution and explicit draft share the same active source pins',async t=>{
 const f=await fixture(t),plan=await f.ok('governed-evolution/plan',f.input);
 const identity={...f.identity,harnessBindingDigest:plan.binding.digest};
 const run=await f.ok('governed-evolution/runs',{id:'public-pending',bindingDigest:plan.binding.digest,executor:f.state.executor});
 await f.ok('lifecycle-runs/'+run.id+'/authorize',{decision:'APPROVED',bindingDigest:run.binding.digest,evidenceRef:'test://controlled-exact-plan'});
 const pending=await f.ok('lifecycle-runs/'+run.id+'/advance',{});
 assert.equal(pending.status,'WAITING_EXTERNAL_SIGNAL');
 const base={identity,runId:run.id,requestDigest:pending.pendingExecution.requestDigest,goalTarget:f.state.goalTarget};
 const basis=await f.ok(`projects/${f.scope.projectId}/semantic-execution/planning`,base);
 const {canonicalDigest:d}=await import('../../packages/core/dist/index.js');
 const {digest:old,...body}=f.observation;
 const observation={...body,identity,governance:{...body.governance,runtimeDigest:semanticExecutionImplementationDigest}};
 observation.digest=d(observation);
 const resource=await f.ok('evolution-resources',{apiVersion:'evopilot.io/v1',kind:'AgentRuntimeProfile',metadata:{id:'public-observer',name:'Controlled observation',version:'1.0.0'},provenance:{sourceType:'NATIVE',sourceId:'synthetic-fixture',sourceVersion:'1.0.0',sourceDigest:d('synthetic-fixture')},compatibility:{runtime:'>=6.2.0 <7.0.0'},capabilityRefs:[],spec:{semanticObservation:observation}});
 await f.ok('evolution-resources/AgentRuntimeProfile/public-observer/activate',{version:'1.0.0',evidenceRef:'test://controlled-observation'});
 const draft=await f.ok(`projects/${f.scope.projectId}/semantic-execution/draft`,{...base,basisDigest:basis.basisDigest,
  selection:f.state.contextPlan.actions[0].selection,business:f.state.outcomePlan.business,
  harness:basis.obligations.map((obligation,i)=>({id:'check-'+i,obligation,evidenceKind:'synthetic-checks',path:['ok'],predicate:{op:'EQUALS',value:true}})),
  selections:{governed:f.refs,executor:{id:resource.metadata.id,version:resource.metadata.version,digest:resource.digest}}});
 assert.equal(draft.status,'DRAFT_NOT_PREPARED');assert.equal(draft.persisted,false);assert.equal(f.calls(),0);
 const prepared=await f.ok(`projects/${f.scope.projectId}/semantic-execution/prepare`,draft.declaration);
 assert.equal(prepared.status,'PREPARED_NOT_APPROVED');assert.equal(f.calls(),0);
});
