import test from 'node:test';
import assert from 'node:assert/strict';
import {probeDigest} from './versions/probe-session.mjs';
import {runRuntimeCapabilityProbe,runtimeCapabilityCliResult,capabilityRequiredMessage,assertMissingMcpCapability} from './versions/runtime/6.3.0/capability-probe.mjs';

const caps={schema:'evopilot-project-semantic-capabilities/v1',projectId:'p',operations:['capabilities'],executionAvailable:false,completionAvailable:false,authority:'RUNTIME_CURRENT_SCOPED_PRINCIPAL'};
const input={operation:'inspect',selection:{projectId:'p',catalogId:'c',artifactSetDigest:'sha256:'+'1'.repeat(64),bundleDigest:'sha256:'+'2'.repeat(64)},
  scope:{projectId:'p',tenantId:'t',workspaceId:'w'},expected:{kind:'CAPABILITY_MISSING',capabilityDigest:probeDigest(caps)}};
const invoke=async args=>args[2]==='capabilities'?{exitCode:0,json:{...structuredClone(caps),requestId:'synthetic'}}:{exitCode:1,json:{error:capabilityRequiredMessage}};
test('capability probe reads exact capability twice around named readonly refusal, never closes full RC03',async()=>{
  const calls=[];const r=await runRuntimeCapabilityProbe({...input,invoke:async args=>{calls.push(args);return invoke(args);}});
  assert.equal(r.status,'CAPABILITY_STOP_SUBCASE_ASSERTIONS_PASSED');assert.equal(r.targetCriteriaClosed,0);
  assert.deepEqual(calls.map(c=>c[2]),['capabilities','inspect','capabilities']);assert.equal(r.serverNoDispatchEvidence,'REQUIRES_INDEPENDENT_CAMPAIGN_OBSERVATION');
});
test('capability CLI decoder refuses generic, malformed, extra-field, mixed and abnormal errors',()=>{
  const stderr=JSON.stringify({error:capabilityRequiredMessage});assert.deepEqual(runtimeCapabilityCliResult(1,'',stderr),{exitCode:1,json:{error:capabilityRequiredMessage}});
  for(const args of [[2,'',stderr],[1,'{}',stderr],[1,'',''],[1,'','crash'],[1,'',JSON.stringify({error:'fetch failed'})],
    [1,'',JSON.stringify({error:capabilityRequiredMessage,body:{}})],[0,'{}',stderr]])assert.throws(()=>runtimeCapabilityCliResult(...args));
});
test('capability mismatch, malformed schema, foreign project and advertised operation cannot pass even when rehashed',async()=>{
  for(const mutate of [c=>{c.operations.push('inspect');},c=>{c.schema='unsupported';},c=>{c.projectId='other';},c=>{c.authority='AGENT';},
    c=>{c.executionAvailable=true;},c=>{c.operations=['inspect'];},c=>{c.operations=['capabilities','capabilities'];},c=>{c.operations.push('unknown');}]) {
    const changed=structuredClone(caps);mutate(changed);let calls=0;
    await assert.rejects(runRuntimeCapabilityProbe({...input,expected:{kind:'CAPABILITY_MISSING',capabilityDigest:probeDigest(changed)},
      invoke:async()=>{calls++;return {exitCode:0,json:{...changed,requestId:'synthetic'}};}}));assert.equal(calls,1);
  }
  let calls=0;await assert.rejects(runRuntimeCapabilityProbe({...input,operation:'review',invoke:async()=>{calls++;}}));assert.equal(calls,0);
});
test('capability stop refuses missing/mismatched error, stale reread, cancellation, timeout and IO failure',async()=>{
  for(const changed of [{exitCode:1,json:{}},{exitCode:0,json:{error:capabilityRequiredMessage}},{exitCode:1,json:{error:'fetch failed'}}])
    await assert.rejects(runRuntimeCapabilityProbe({...input,invoke:async args=>args[2]==='capabilities'?invoke(args):changed}));
  let reads=0;await assert.rejects(runRuntimeCapabilityProbe({...input,invoke:async args=>{const r=await invoke(args);if(args[2]==='capabilities'&&++reads===2)r.json.operations.push('inspect');return r;}}));
  const c=new AbortController();c.abort();let calls=0;
  await assert.rejects(runRuntimeCapabilityProbe({...input,signal:c.signal,invoke:async()=>{calls++;}}),/PROBE_CANCELLED/);assert.equal(calls,0);
  await assert.rejects(runRuntimeCapabilityProbe({...input,timeoutMs:10,invoke:()=>new Promise(()=>{})}),/PROBE_TIMEOUT/);
  await assert.rejects(runRuntimeCapabilityProbe({...input,invoke:async()=>{throw Error('IO');}}),/IO/);
});
test('MCP status zero or isError alone is not a missing-capability observation',()=>{
  const good={schema:'evopilot-mcp-http-result/v1',tool:'evopilot_project_semantic_capabilities',authority:'NONE',status:200,ok:true,requestId:'synthetic',response:{data:caps}};
  assert.doesNotThrow(()=>assertMissingMcpCapability({...input,response:good}));
  for(const r of [{...good,status:0,ok:false},{...good,tool:'evopilot_project_semantic_inspect'},{...good,requestId:''},
    {...good,response:{data:{...caps,projectId:'foreign'}}},{structuredContent:good,isError:true}])assert.throws(()=>assertMissingMcpCapability({...input,response:r}));
});
