import assert from 'node:assert/strict';
import test from 'node:test';
import {executeExpertTurn,planExpertTurn} from '../../packages/evolution-expert/dist/index.js';

const cases=[
  ['lifecycle-diff',['compare lifecycle versions','生命周期差异'],{lifecycleId:'synthetic',fromVersion:'1.0.0',toVersion:'1.1.0'},'diff',false],
  ['lifecycle-resolve',['resolve lifecycle','解析生命周期'],{lifecycleId:'synthetic',lifecycleVersion:'1.0.0',labels:{class:'custom'},goalText:'synthetic goal'},'resolve',true],
  ['lifecycle-resolve-inputs',['resolve lifecycle inputs','解析生命周期输入'],{lifecycleId:'synthetic',lifecycleVersion:'1.0.0',answers:{name:'example'},projectFacts:{},organizationDefaults:{},runtimeCapabilities:{},deterministicValues:{}},'resolve_inputs',true]
];
for(const [intent,texts,payload,tool,body] of cases)test(`${intent}: bilingual read-only guidance preserves public MCP fields`,async()=>{
  for(const text of texts){
    const plan=planExpertTurn(text,payload),calls=[];
    assert.equal(plan.intent,intent);assert.equal(plan.requiresExactHumanDecision,false);
    await executeExpertTurn(plan,{invoke:async(name,input)=>calls.push({name,input})});
    assert.deepEqual(calls,[{name:`evopilot_lifecycle_${tool}`,input:body?{payload}:payload}]);
    if(body){calls[0].input.payload.lifecycleId='mutated-by-transport';assert.equal(plan.payload.lifecycleId,'synthetic');}
  }
});
for(const key of ['actor','serverUrl','payload','authorizationDigest','unexpected'])test(`lifecycle projection rejects undeclared ${key} before transport`,async()=>{
  let calls=0;
  await assert.rejects(executeExpertTurn(planExpertTurn('inspect lifecycle',{lifecycleId:'synthetic',[key]:'synthetic'}),{invoke:async()=>{calls++;}}),/LIFECYCLE_INPUT_INVALID/);
  assert.equal(calls,0);
});
test('existing raw-secret boundary prevents lifecycle transport',async()=>{
  const calls=[],plan=planExpertTurn('inspect lifecycle',{lifecycleId:'synthetic',token:'synthetic-not-a-credential'});
  assert.equal(plan.intent,'llm-setup');assert.deepEqual(plan.payload,{});
  await executeExpertTurn(plan,{invoke:async(name,input)=>{calls.push({name,input});}});
  assert.deepEqual(calls,[{name:'evopilot_runtime_readiness_inspect',input:{}}]);
});
test('lifecycle writes preserve idempotency keys and separate exact decision from Runtime body',async()=>{
  const authorizationDigest='sha256:'+'a'.repeat(64),input={lifecycleId:'synthetic',version:'1.0.0',expectedActiveDigest:null,evidenceRef:'evidence://activate',authorizationDigest,idempotencyKey:'synthetic-once'};
  const calls=[];
  await executeExpertTurn(planExpertTurn('activate lifecycle',input),{invoke:async(name,args)=>calls.push({name,args})},{authorizationDigest,evidenceRef:'decision://synthetic'});
  assert.deepEqual(calls,[{name:'evopilot_lifecycle_activate',args:{lifecycleId:'synthetic',idempotencyKey:'synthetic-once',payload:{version:'1.0.0',expectedActiveDigest:null,evidenceRef:'evidence://activate'}}}]);
});
test('lifecycle uncertainty is surfaced after one invocation without automatic replay',async()=>{
  let calls=0;const plan=planExpertTurn('create lifecycle',{yaml:'synthetic',evidenceRef:'evidence://synthetic'});
  await assert.rejects(executeExpertTurn(plan,{invoke:async()=>{calls++;throw Error('SYNTHETIC_UNKNOWN_OUTCOME');}}),/SYNTHETIC_UNKNOWN_OUTCOME/);
  assert.equal(calls,1);
});
