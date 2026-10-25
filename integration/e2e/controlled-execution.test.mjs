import test from 'node:test';import assert from 'node:assert/strict';
import {validateExecutionPolicy,validateExecutionEvidence,validateReconstructionDependencies,executionIsolated} from '../compatibility/usability/v1/execution.mjs';
import {usabilityDigest as hash} from '../compatibility/usability/v1/contract.mjs';
const policy=()=>({schema:'evopilot-execution-policy/v1',externalNetwork:'DENY',internalTransport:'OWNED_LOOPBACK',childProcesses:'BROKERED_OWNED',originalSource:'DENY',hiddenOracle:'DENY',priorOutputs:'DENY',hostCredentials:'DENY',brokerDigest:hash('synthetic-broker'),dependencyManifestDigest:hash('synthetic-dependencies')});
test('CE01 typed authority never accepts external, unrelated or implicit source authority',()=>{
 assert.deepEqual(validateExecutionPolicy(policy()),policy());
 for(const [key,value]of [['externalNetwork','ALLOW'],['internalTransport','ANY_LOOPBACK'],['childProcesses','ALLOW'],['originalSource','ALLOW'],['hiddenOracle','ALLOW'],['priorOutputs','ALLOW'],['hostCredentials','ALLOW'],['extra',true],['brokerDigest','latest']])assert.throws(()=>validateExecutionPolicy({...policy(),[key]:value}));
 assert.throws(()=>validateExecutionPolicy({...policy(),childProcesses:'DENY'}));
 assert.equal(validateExecutionPolicy({...policy(),internalTransport:'NONE',childProcesses:'DENY'}).internalTransport,'NONE');
});
test('CE02 exact enforcement identity and actual closure govern isolation',()=>{
 const e={policy:policy(),policyDigest:hash(policy()),enforcementDigest:hash('synthetic-journal'),externalConnections:0,unrelatedPeerConnections:0,allOwnedProcessesClosed:true};assert(executionIsolated(validateExecutionEvidence(e)));
 for(const key of ['externalConnections','unrelatedPeerConnections']){assert(!executionIsolated(validateExecutionEvidence({...e,[key]:1})));assert.throws(()=>validateExecutionEvidence({...e,[key]:-1}));}
 assert(!executionIsolated(validateExecutionEvidence({...e,allOwnedProcessesClosed:false})));assert.throws(()=>validateExecutionEvidence({...e,policyDigest:hash('other')}));assert.throws(()=>validateExecutionEvidence({...e,policy:{...policy(),brokerDigest:hash('changed')}}));
});
test('CE03 dependency closure is exact bounded declarative input, not business-code permission',()=>{
 const m={schema:'evopilot-reconstruction-dependencies/v1',dependencies:[{id:'normative-example',kind:'NORMATIVE_COMPATIBILITY',version:'1.0.0',purpose:'Synthetic fixed wire standard',license:'Apache-2.0',files:[{path:'contract.mjs',bytes:10,digest:hash('fixture')}]}]};assert.deepEqual(validateReconstructionDependencies(m),m);
 for(const mutate of [x=>x.dependencies[0].kind='ORIGINAL_IMPLEMENTATION',x=>x.dependencies[0].files[0].path='../source.ts',x=>x.dependencies[0].files.push({...x.dependencies[0].files[0],path:'CONTRACT.mjs'}),x=>x.dependencies.push(x.dependencies[0]),x=>x.dependencies[0].files[0].bytes=268435457,x=>x.dependencies[0].files=[]]){const x=structuredClone(m);mutate(x);assert.throws(()=>validateReconstructionDependencies(x));}
});
