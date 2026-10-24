import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createNativeIntegration} from '../../dist/integration/native-composition.js';
import {createRuntimeService} from '@evopilot-next/runtime/service';
import {createOntologyService} from '@evopilot-next/ontology/service';
import {maintainWorkspace} from '../../dist/integration/workspace/maintenance.js';
import {assessmentFixture} from '../../projects/evopilot-harness/tests/fixtures/usability-assessment.mjs';

test('UIA01 parent native router preserves scoped Harness assessment and refuses other owners',async t=>{
 const f=await assessmentFixture(t);await f.record();await f.evaluate();f.close();const harness=f.open();
 const integration=createNativeIntegration(f.options,{},owner=>{assert.equal(owner,'harness');return harness;});
 const request={operation:'usability.assessment.read',scope:f.scope,input:{id:'assessment'}};
 assert.deepEqual(await integration.native('harness',request),await f.call(request.operation,request.input));
 await assert.rejects(integration.native('ontology',request),{code:'USABILITY_OWNER'});
 await assert.rejects(integration.native('runtime',request),{code:'USABILITY_OWNER'});
});

test('UIA02 state marker 7 preserves assessment through stopped backup/restore and rejects actual v0.7 writers',{skip:!process.env.EVOPILOT_V07_APP&&'Requires retained installed v0.7'},async t=>{
 const f=await assessmentFixture(t,{prepare:false});f.close();
 for(const factory of [createRuntimeService,createOntologyService]){const owner=factory(f.options);owner.initialize();owner.close();}
 const projectRoot=path.join(f.root,'project'),installationRoot=path.join(f.root,'installation');fs.mkdirSync(projectRoot,{mode:0o700});fs.mkdirSync(installationRoot,{mode:0o700});
 fs.writeFileSync(path.join(projectRoot,'workspace-project.json'),JSON.stringify({schema:'evopilot-workspace-project/v1',id:f.options.workspaceId,templateVersion:'0.2.0',specifications:{ontology:'v1',harness:'v1'}}),{mode:0o600});
 const context={projectRoot,stateRoot:f.options.workspaceRoot,workspaceId:f.options.workspaceId,installationRoot};
 const beforeRoot=path.join(f.root,'before'),afterRoot=path.join(f.root,'after');
 maintainWorkspace(context,'backup',{destinationRoot:beforeRoot},'before-assessment');
 f.open();await f.write('usability.inventory.freeze',{inventory:f.inventory,assets:f.assets});await f.write('usability.specification.put',{specification:f.spec});await f.start();await f.record();const result=await f.evaluate();f.close();
 const backup=maintainWorkspace(context,'backup',{destinationRoot:afterRoot},'after-assessment');assert.equal(backup.status,'VERIFIED');
 const old=await import(pathToFileURL(path.join(fs.realpathSync(process.env.EVOPILOT_V07_APP),'node_modules/@evopilot-next/harness/dist/service.js')));let previous=old.createHarnessService(f.options);
 try{assert.throws(()=>previous.initialize(),{code:'CORRUPT_STATE'});}finally{previous.close();}
 fs.renameSync(f.options.workspaceRoot,f.options.workspaceRoot+'-saved');fs.renameSync(projectRoot,projectRoot+'-saved');maintainWorkspace(context,'restore',{backupRoot:afterRoot},'restore-assessment');f.open();assert.deepEqual(await f.call('usability.assessment.version',{digest:result.digest}),result);f.close();
 fs.renameSync(f.options.workspaceRoot,f.options.workspaceRoot+'-restored-saved');fs.renameSync(projectRoot,projectRoot+'-restored-saved');maintainWorkspace(context,'restore',{backupRoot:beforeRoot},'rollback-assessment');previous=old.createHarnessService(f.options);previous.initialize();previous.close();f.open();await assert.rejects(f.call('usability.assessment.version',{digest:result.digest}),{code:'USABILITY_NOT_FOUND'});
});

test('UIA03 oracle evidence callback is configured only by the trusted parent; public routing preserves owner boundaries',async t=>{
 const f=await assessmentFixture(t);f.close();const harness=f.open();let invoked=false;const reader=async()=>{invoked=true;throw Error('unused provider');};
 const integration=createNativeIntegration(f.options,{},()=>harness,{readReconstructionEvidence:reader});
 assert.equal(integration.harnessProviders.readReconstructionEvidence,reader);
 assert(harness.capabilities().usabilityOperations.includes('usability.oracle.evaluate'));
 const request={operation:'usability.oracle.version',scope:f.scope,input:{digest:'sha256:'+'a'.repeat(64)}};
 await assert.rejects(integration.native('harness',request),{code:'ORACLE_NOT_FOUND'});
 for(const owner of ['ontology','runtime'])await assert.rejects(integration.native(owner,request),{code:'USABILITY_OWNER'});
 assert.equal(invoked,false);
});
