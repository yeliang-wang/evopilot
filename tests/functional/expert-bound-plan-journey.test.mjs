import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {createServer} from '../../packages/server/dist/index.js';
import {FileStore} from '../../packages/server/dist/storage/file-store/index.js';
import {canonicalDigest as d} from '../../packages/core/dist/index.js';
import {executeExpertTurn,planExpertTurn} from '../../packages/evolution-expert/dist/index.js';
import {createV3HarnessCatalog,writeHarnessRegistryV2} from '../fixtures/published-v3-catalog.mjs';
const data=r=>{assert.equal(r.isError,false,JSON.stringify(r));assert.equal(r.structuredContent.ok,true);assert.ok(r.structuredContent.requestId);return r.structuredContent.response.data;};
test('Expert public MCP consumes published Catalog into immutable composed plan and guarded run creation',{timeout:60000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'expert-bound-plan-')),catalog=createV3HarnessCatalog(root),harnessRegistryConfig=writeHarnessRegistryV2(root,catalog);
 const scope={tenantId:'synthetic-tenant',workspaceId:'synthetic-workspace'};
 const store=new FileStore(root);store.writeProject({id:'synthetic-project',name:'Synthetic',...scope,repository:{provider:'local-git',root},createdAt:'2026-09-26T00:00:00Z',updatedAt:'2026-09-26T00:00:00Z'});
 const server=createServer({dataRoot:root,runtimeMode:'debug',harnessRegistryConfig,tokens:[{name:'guided-admin',token:'synthetic-admin',role:'admin',...scope}]});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const client=new Client({name:'synthetic-bound-expert',version:'1.0.0'});
 t.after(async()=>{await client.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/adapter-mcp/dist/stdio.js')],env:{PATH:process.env.PATH,TMPDIR:os.tmpdir(),EVOPILOT_SERVER:`http://127.0.0.1:${server.address().port}`,EVOPILOT_API_TOKEN:'synthetic-admin'},stderr:'pipe'}));
 const calls=[],turn=(text,payload,decision)=>executeExpertTurn(planExpertTurn(text,payload),{invoke:async(name,args)=>{calls.push(name);return client.callTool({name,arguments:args});}},decision);
 const definition={schema:'evopilot-evolution-project-definition/v1',metadata:{id:'synthetic-project',name:'Synthetic',version:'1.0.0',labels:{}},spec:{source:{provider:'local-git',repository:root,defaultBranch:'main',mode:'owned'},ecosystem:{languages:['typescript'],packageManagers:['npm'],frameworks:[]},delivery:{model:'open-source',ciProvider:'github-actions',candidateBeforeAcceptance:true,noRebuildPromotion:true,channels:['npm']},environment:{development:'local',acceptance:'isolated'},policyRefs:[],lifecycleRefs:['synthetic'],secretRefs:[],hostPreferences:['generic-agent'],runtimePreferences:['local'],evidenceSources:['synthetic']}};
 data(await turn('register project',{projectDiscovery:{source:'synthetic'},projectDefinition:definition}));
 const yaml=`schema: evopilot-lifecycle-definition/v1alpha1
metadata: {id: synthetic, name: Synthetic, version: 1.0.0}
capabilities: [project.read]
obligations:
  requiredEvidence: [synthetic-extra-evidence]
  validators: [synthetic-extra-validator]
  constraints: [synthetic-extra-constraint]
  requestedPermissions: [run-approved-validation]
stages:
  - id: verify
    name: Verify
    action: {uses: project.validate@1}
    decision: {mode: AUTO}
`;
 const revision=data(await turn('create lifecycle',{yaml,evidenceRef:'evidence://synthetic/register'}));
 const decision={authorizationDigest:revision.revisionDigest,evidenceRef:'decision://synthetic/activate'};
 data(await turn('activate lifecycle',{lifecycleId:'synthetic',version:'1.0.0',expectedActiveDigest:null,authorizationDigest:decision.authorizationDigest,evidenceRef:decision.evidenceRef},decision));
 const fixed=d('synthetic'),executor={host:'generic-agent',provider:'synthetic-provider',model:'synthetic-model',capabilities:['project.read'],agentRuntime:{profileId:'synthetic',profileVersion:'1.0.0',adapterId:'synthetic@1',profileDigest:fixed,qualificationDigest:fixed},sandbox:{workspaceRef:root,permissionMode:'HOST_MANAGED_DENY_UNDECLARED'},allowedEffects:['READ_ONLY'],credentialRefs:[]};
 const input={projectDefinitionId:'synthetic-project',goalTarget:{projectId:'synthetic-project',goalId:'synthetic-goal',targetId:'synthetic-target',objective:'database-engine sql-optimizer',taskClass:'domain-task',domain:'database-product',requiredCapabilities:['project.read']},lifecycleId:'synthetic',policyDigest:fixed,providerDigest:fixed,environmentDigest:fixed,executor,runtimeDigest:fixed,evidenceDigest:fixed};
 const plan=data(await turn('explain harness',input));
 assert.equal(plan.status,'READY');assert.equal(plan.binding.bundleRef.digest,catalog.bundleDigest);assert.equal(plan.binding.profileRef.digest,catalog.profileDigest);assert.deepEqual(plan.binding.bundleRef.componentDigests,[catalog.componentDigest]);
 assert.ok(plan.composition.requiredEvidence.includes('sql-compatibility-report'));assert.ok(plan.composition.requiredEvidence.includes('synthetic-extra-evidence'));assert.ok(plan.composition.validators.includes('validation-exit-code'));assert.ok(plan.composition.validators.includes('synthetic-extra-validator'));assert.ok(plan.composition.constraints.includes('synthetic-extra-constraint'));
 const run=data(await turn('goal',{bindingDigest:plan.binding.digest,executor}));
 assert.equal(run.binding.harnessExecutionBindingDigest,plan.binding.digest);assert.equal(run.status,'WAITING_AUTHORIZATION');assert.deepEqual(run.stageAttempts,[]);assert.equal(run.pendingExecution,undefined);
 const inspected=data(await turn('status',{runId:run.id}));assert.equal(inspected.id,run.id);
 const forged=await turn('goal',{bindingDigest:plan.binding.digest,executor:{...executor,model:'different-model'}});assert.equal(forged.isError,true);assert.match(JSON.stringify(forged.structuredContent),/MISMATCH|DRIFT/);
 assert.equal(calls.filter(name=>name==='evopilot_governed_evolution_run').length,2);
});
