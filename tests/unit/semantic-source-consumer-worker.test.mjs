import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {semanticConsumerFixture} from '../helpers/semantic-consumer-fixture.mjs';
import {readSourceConsumerEvidence} from '../e2e/versions/runtime/6.3.0/source-consumer-worker.mjs';
import {probeDigest} from '../e2e/versions/probe-session.mjs';
const worker=path.resolve(import.meta.dirname,'../e2e/versions/runtime/6.3.0/source-consumer-worker.mjs');
const input=f=>({mode:'semantic',registryConfigPath:path.join(f.root,'registry.yaml'),policyPath:path.join(f.root,'policy.json'),
  catalogId:f.generation.catalogId,subject:f.currentSubject()});
function invoke(value) {
  const r=spawnSync(process.execPath,[worker],{input:JSON.stringify(value),encoding:'utf8',timeout:15000,maxBuffer:1048576});
  assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.stderr,'');return {status:r.status,value:JSON.parse(r.stdout)};
}
test('source worker preserves exact fixed-consumer projection in a separate process without execution authority',async t=>{
  const f=await semanticConsumerFixture(t),result=invoke(input(f));assert.equal(result.status,0);
  assert.deepEqual(result.value,await readSourceConsumerEvidence(input(f)));
  assert.equal(result.value.eligibleForExecution,false);assert.equal(result.value.status,'CONFIGURED_MATERIALS_VERIFIED');
  assert.deepEqual(result.value.generation,f.generation);
  assert.deepEqual(result.value.materialDigests,Object.entries(f.data.materials).map(([relative,document])=>
    ({path:relative,documentDigest:probeDigest(document)})).sort((a,b)=>a.path.localeCompare(b.path)));
  assert.equal(result.value.legacy.assetFiles,3);
});
test('source worker legacy projection comes from actual v3 reader, not semantic discovery',async t=>{
  const f=await semanticConsumerFixture(t),result=invoke({mode:'legacy',catalogRoot:f.root});assert.equal(result.status,0);
  assert.equal(result.value.status,'READY');assert.equal(result.value.schema,'evopilot-source-legacy-consumer-evidence/v1');
  assert.deepEqual(result.value.entries,f.generation.sets[0].refs.harnessAssets.map(({entry:{kind,id,version,assetDigest}})=>({kind,id,version,assetDigest})));
});
test('source worker cannot inject validators or disclose arbitrary error details',async t=>{
  const f=await semanticConsumerFixture(t),request=input(f);
  for(const extra of [{validateMaterials:'forged-validator'},{mode:'publish'},{authorization:'synthetic-private-marker'}]) {
    const result=invoke({...request,...extra});assert.equal(result.status,1);
    assert.deepEqual(result.value,{schema:'evopilot-source-consumer-refusal/v1',status:'FAILED',code:'SOURCE_WORKER_FAILURE'});
  }
  const refused=invoke({...request,subject:{...request.subject,active:false}});assert.equal(refused.status,1);
  assert.equal(refused.value.code,'PERMISSION_DENIED');
});
