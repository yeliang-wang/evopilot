import test from 'node:test';
import assert from 'node:assert/strict';
import {runRuntimeRefusalProbe,runtimeRefusalCliResult} from './versions/runtime/6.3.0/refusal-probe.mjs';

const input={selection:{projectId:'p',catalogId:'c',artifactSetDigest:'sha256:'+'1'.repeat(64),bundleDigest:'sha256:'+'2'.repeat(64)},
  scope:{projectId:'p',tenantId:'t',workspaceId:'w'},expected:{kind:'CATALOG_REFUSAL',code:'DIGEST_MISMATCH'}};
const body={error:'SEMANTIC_CATALOG_DIGEST_MISMATCH',requestId:'synthetic-request',nextAction:'review-semantic-catalog',
  meta:{llm:{schema:'evopilot-llm-usage-meta/v1',configured:false,creditUnit:'token',calls:0,succeeded:0,failed:0,totalTokens:0,inputTokens:0,outputTokens:0,creditsConsumed:0}}};
test('RC03 CLI decoder accepts only complete named JSON Catalog failures',()=>{
  assert.deepEqual(runtimeRefusalCliResult(1,'',JSON.stringify({error:body.error,body})),{exitCode:1,json:body});
  for(const [code,stdout,stderr] of [[2,'',JSON.stringify({error:body.error,body})],[1,'',''],[1,'','crash'],[1,'',JSON.stringify({error:'fetch failed'})],
    [1,'{}',JSON.stringify({error:body.error,body})],[1,'',JSON.stringify({error:body.error,body:{...body,nextAction:'retry'}})],
    [1,'',JSON.stringify({error:body.error,body:{...body,secret:'unexpected'}})],
    [1,'',JSON.stringify({error:body.error,body:{...body,meta:{secret:'unexpected'}}})],
    ...['TIMEOUT','CANCELLED','IO_OR_VALIDATION_FAILED','DRIFT'].map(c=>[1,'',JSON.stringify({error:'SEMANTIC_CATALOG_'+c,body:{...body,error:'SEMANTIC_CATALOG_'+c}})])])
    assert.throws(()=>runtimeRefusalCliResult(code,stdout,stderr));
});
test('RC03 refuses exit-only, wrong reason, success, oversized and changing replies',async()=>{
  for(const result of [{exitCode:1,json:null},{exitCode:1,json:{}},{exitCode:0,json:body},{exitCode:2,json:body},
    {exitCode:1,json:{...body,error:'SEMANTIC_CATALOG_UNSUPPORTED'}},{exitCode:1,json:{...body,requestId:''}},
    {exitCode:1,json:{...body,requestId:'x'.repeat(1048577)}}])await assert.rejects(runRuntimeRefusalProbe({...input,invoke:async()=>result}));
  let calls=0;await assert.rejects(runRuntimeRefusalProbe({...input,invoke:async()=>({exitCode:1,json:++calls===1?body:{...body,error:'SEMANTIC_CATALOG_UNAVAILABLE'}})}));
  assert.equal(calls,2);
});
test('RC03 timeouts, transport errors and pre-cancellation are never product passes',async()=>{
  await assert.rejects(runRuntimeRefusalProbe({...input,invoke:async()=>{throw Error('transport failure');}}),/transport failure/);
  await assert.rejects(runRuntimeRefusalProbe({...input,timeoutMs:10,invoke:()=>new Promise(()=>{})}),/PROBE_TIMEOUT/);
  const c=new AbortController();c.abort();let calls=0;
  await assert.rejects(runRuntimeRefusalProbe({...input,signal:c.signal,invoke:async()=>{calls++;}}),/PROBE_CANCELLED/);assert.equal(calls,0);
  await assert.rejects(runRuntimeRefusalProbe({...input,expected:{kind:'CATALOG_REFUSAL',code:'TIMEOUT'},invoke:async()=>{calls++;}}));assert.equal(calls,0);
});
