import assert from 'node:assert/strict';
import test from 'node:test';
import {executeExpertTurn,planExpertTurn} from '../../packages/evolution-expert/dist/index.js';
const hash='sha256:'+'a'.repeat(64);
const recovery={failureClass:'TRANSIENT',failureSignature:'synthetic',bindingDigest:hash,attempt:0,maxAttempts:2,identicalInputs:true,reversible:true,externalEffect:false};
test('recovery preserves budget and exact binding inside public MCP body',async()=>{
 const calls=[];await executeExpertTurn(planExpertTurn('recovery',{...recovery,idempotencyKey:'synthetic'}),{invoke:async(name,args)=>calls.push({name,args})});
 assert.deepEqual(calls,[{name:'evopilot_recovery_decide',args:{idempotencyKey:'synthetic',payload:recovery}}]);
});
test('recovery collects missing budget facts before invoking Runtime',async()=>{
 let calls=0;const r=await executeExpertTurn(planExpertTurn('recovery',{failureClass:'TRANSIENT',failureSignature:'s',bindingDigest:hash}),{invoke:async()=>calls++});assert.equal(r.status,'NEEDS_INPUT');assert.ok(r.missing.includes('maxAttempts'));assert.equal(calls,0);
});
for(const key of ['serverUrl','actor','payload','candidates','tenantId','authorityDigest'])test('governed input refuses root override '+key,async()=>{
 let calls=0;await assert.rejects(executeExpertTurn(planExpertTurn('recovery',{...recovery,[key]:'synthetic'}),{invoke:async()=>calls++}),/GOVERNED_INPUT_INVALID/);assert.equal(calls,0);
});
test('run answers cannot forward a raw credential',async()=>{
 let calls=0;await assert.rejects(executeExpertTurn(planExpertTurn('goal',{bindingDigest:hash,executor:{},answers:{nested:{apiKey:'synthetic'}}}),{invoke:async()=>calls++}),/RAW_SECRET_REFUSED/);assert.equal(calls,0);
});
test('unknown mutation outcome escapes without automatic replay',async()=>{
 let calls=0;await assert.rejects(executeExpertTurn(planExpertTurn('goal',{bindingDigest:hash,executor:{}}),{invoke:async()=>{calls++;throw Error('UNKNOWN_OUTCOME');}}),/UNKNOWN_OUTCOME/);assert.equal(calls,1);
});
for(const [text,payload]of [['help',{sessionDigest:hash}],['tutorial',{sessionDigest:hash}],['acceptance',{sessionDigest:hash,acceptanceAggregate:{status:'PASS'}}],['cutover',{sessionDigest:hash,cutoverReadiness:{status:'READY'}}],['release',{sessionDigest:hash,releaseBinding:{digest:hash},authorizationDigest:hash}]])test(text+' renders an explicit non-authorizing protocol object',async()=>{
 const calls=[];await executeExpertTurn(planExpertTurn(text,payload),{invoke:async(name,args)=>calls.push({name,args})},{authorizationDigest:hash,evidenceRef:'decision://synthetic'});
 assert.equal(calls.length,1);assert.equal(calls[0].name,'evopilot_interaction_render');assert.equal(calls[0].args.payload.authority,'NONE');assert.equal(calls[0].args.payload.sessionDigest,hash);assert.ok(Array.isArray(calls[0].args.payload.details));assert.deepEqual(calls[0].args.payload.objectRefs,[]);
});
for(const [texts,intent,tool,payload,expected]of [
 [['classify lifecycle observation','分类生命周期观察'],'lifecycle-classify','evopilot_lifecycle_gap_classify',{observationId:'o',gapClass:'NO_ACTION',rationale:['synthetic'],evidenceRefs:['evidence://synthetic']},{observationId:'o',payload:{gapClass:'NO_ACTION',rationale:['synthetic'],evidenceRefs:['evidence://synthetic']}}],
 [['inspect lifecycle observation','查看生命周期观察'],'lifecycle-observation-inspect','evopilot_lifecycle_observation_inspect',{observationId:'o'},{observationId:'o'}],
 [['inspect lifecycle successor','查看生命周期后继'],'lifecycle-successor-inspect','evopilot_lifecycle_successor_inspect',{proposalId:'p'},{proposalId:'p'}]
])test(intent+' routes both languages to the exact public path and body',async()=>{
 for(const text of texts){const calls=[],plan=planExpertTurn(text,payload);assert.equal(plan.intent,intent);await executeExpertTurn(plan,{invoke:async(name,args)=>calls.push({name,args})});assert.deepEqual(calls,[{name:tool,args:expected}]);}
});
test('typed Lifecycle answers refuse nested raw credentials before transport',async()=>{
 let calls=0;await assert.rejects(executeExpertTurn(planExpertTurn('resolve lifecycle inputs',{lifecycleId:'synthetic',answers:{database:{password:'synthetic-value'}}}),{invoke:async()=>calls++}),/RAW_SECRET_REFUSED/);assert.equal(calls,0);
});
