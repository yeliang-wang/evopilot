import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {EVOLUTION_EXPERT_CORE,planExpertTurn,executeExpertTurn,createExpertAdapter,
  createHostIntegrationBundle,assertExpertAdapterConformance,expertCompatibility} from '../../packages/evolution-expert/dist/index.js';

const digest=value=>'sha256:'+createHash('sha256').update(stable(value)).digest('hex');
function stable(value){if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;return JSON.stringify(value);}
const authorizationDigest='sha256:'+'a'.repeat(64),wrongDigest='sha256:'+'b'.repeat(64);
// These are independent public-intent expectations, not values derived from Core.
const cases=[
  ['create','create lifecycle','创建生命周期','register',false],
  ['update','update lifecycle','更新生命周期','register',false],
  ['list','list lifecycle','生命周期列表','list',false],
  ['inspect','inspect lifecycle','查看生命周期','inspect',false],
  ['activate','activate lifecycle','激活生命周期','activate',true],
  ['deactivate','deactivate lifecycle','停用生命周期','deactivate',true],
  ['archive','archive lifecycle','归档生命周期','archive',true],
  ['restore','restore lifecycle','恢复生命周期','restore',true],
  ['rollback','rollback lifecycle','生命周期回滚','rollback',true],
  ['dependencies','lifecycle dependencies','生命周期依赖','dependencies',false],
  ['usage','lifecycle usage','生命周期引用','usage',false],
  ['audit','lifecycle audit','生命周期审计','audit',false]
];
for(const [operation,english,chinese,tool,decisionRequired] of cases){
  test(`lifecycle ${operation}: bilingual intent preserves the exact Runtime tool and decision boundary`,async()=>{
    for(const text of [english,chinese,`Please ${english}.`,english.toUpperCase()]){
      const empty=planExpertTurn(text);
      assert.equal(empty.intent,`lifecycle-${operation}`);
      assert.equal(empty.operation.tool,`evopilot_lifecycle_${tool}`);
      assert.equal(empty.requiresExactHumanDecision,decisionRequired);
      const payload=Object.fromEntries(empty.operation.requiredInputs.map(k=>[k,k==='authorizationDigest'?authorizationDigest:`synthetic-${k}`]));
      const plan=planExpertTurn(text,payload),calls=[],response={status:'RUNTIME_OBSERVED',requestId:'synthetic-request',nextAction:'inspect-runtime-state'};
      const transport={invoke:async(name,input)=>{calls.push({name,input:structuredClone(input)});return response;}};
      if(decisionRequired){
        await assert.rejects(executeExpertTurn(plan,transport),/EXACT_DECISION_REQUIRED/);
        await assert.rejects(executeExpertTurn(plan,transport,{authorizationDigest:wrongDigest,evidenceRef:'decision://synthetic'}),/DECISION_DIGEST_MISMATCH/);
        await assert.rejects(executeExpertTurn(plan,transport,{authorizationDigest,evidenceRef:' '}),/EXACT_DECISION_REQUIRED/);
        assert.deepEqual(calls,[]);
      }
      assert.strictEqual(await executeExpertTurn(plan,transport,decisionRequired?{authorizationDigest,evidenceRef:'decision://synthetic'}:undefined),response);
      const write=['create','update','activate','deactivate','archive','restore','rollback'].includes(operation);
      const expected=write?{...(payload.lifecycleId?{lifecycleId:payload.lifecycleId}:{}),payload:Object.fromEntries(Object.entries(payload).filter(([key])=>!['lifecycleId','authorizationDigest'].includes(key)))}:payload;
      assert.deepEqual(calls,[{name:`evopilot_lifecycle_${tool}`,input:expected}]);
      assert.deepEqual(plan.payload,payload);
      for(const key of empty.operation.requiredInputs){
        const partial={...payload};delete partial[key];const count=calls.length;
        const result=await executeExpertTurn(planExpertTurn(text,partial),transport);
        assert.equal(result.status,'NEEDS_INPUT');assert.deepEqual(result.missing,[key]);assert.equal(calls.length,count);
      }
    }
  });
}
test('release guidance cannot infer a decision or invoke publication',async()=>{
  const payload={sessionDigest:wrongDigest,releaseBinding:{digest:wrongDigest},authorizationDigest};
  const plan=planExpertTurn('release',payload),calls=[];
  const observed={status:'WAITING_RUNTIME_RELEASE_GATE',published:false};
  const transport={invoke:async(tool,payload)=>{calls.push({tool,payload});return observed;}};
  await assert.rejects(executeExpertTurn(plan,transport),/EXACT_DECISION_REQUIRED/);
  assert.equal(calls.length,0);
  assert.strictEqual(await executeExpertTurn(plan,transport,{authorizationDigest,evidenceRef:'decision://synthetic'}),observed);
  assert.equal(calls.length,1);assert.equal(calls[0].tool,'evopilot_interaction_render');
  const message=calls[0].payload.payload;assert.equal(message.authority,'NONE');assert.equal(message.sessionDigest,payload.sessionDigest);assert.equal(message.kind,'HELP');
  assert.ok(message.details.includes(JSON.stringify({releaseBinding:payload.releaseBinding})));
  assert.equal('authorizationDigest' in message,false);assert.match(message.nextAction,/owning Runtime gate/);
});
test('turn payload and Core drift fail before any Runtime call',async()=>{
  let calls=0;const transport={invoke:async()=>{calls++;}};
  const plan=planExpertTurn('inspect lifecycle',{lifecycleId:'synthetic-one'});
  await assert.rejects(executeExpertTurn({...plan,payload:{lifecycleId:'synthetic-two'}},transport),/TURN_DRIFT/);
  await assert.rejects(executeExpertTurn({...plan,coreDigest:wrongDigest},transport),/TURN_DRIFT/);
  const forged={...plan,operation:{...plan.operation,tool:'evopilot_harness_publish'}};
  forged.digest=digest({...forged,digest:undefined});
  await assert.rejects(executeExpertTurn(forged,transport),/OPERATION_DRIFT/);assert.equal(calls,0);
});
test('unknown intent cannot call Runtime or reuse a prior turn result',async()=>{
  const calls=[],transport={invoke:async(tool,payload)=>{calls.push({tool,payload});return {requestId:`synthetic-${calls.length}`,state:calls.length};}};
  const unknown=await executeExpertTurn(planExpertTurn('xyz-unclassified'),transport);
  assert.equal(unknown.status,'NEEDS_CLARIFICATION');assert.equal(calls.length,0);
  const plan=planExpertTurn('inspect lifecycle',{lifecycleId:'synthetic-one'});
  assert.deepEqual(await executeExpertTurn(plan,transport),{requestId:'synthetic-1',state:1});
  assert.deepEqual(await executeExpertTurn(plan,transport),{requestId:'synthetic-2',state:2});
  assert.equal(calls.length,2);
});
for(const host of ['codex','claude-code','workbuddy','generic-agent','generic-mcp'])test(`generated ${host} binds the same Core and complete lifecycle metadata without running a Host`,()=>{
  const a=createExpertAdapter(host),b=createHostIntegrationBundle(host);
  assert.deepEqual(createExpertAdapter(host),a);assert.deepEqual(createHostIntegrationBundle(host),b);
  assert.equal(a.coreDigest,EVOLUTION_EXPERT_CORE.digest);assert.deepEqual(a.instructions,EVOLUTION_EXPERT_CORE.principles);
  assert.equal(b.expertCoreDigest,a.coreDigest);assert.equal(b.adapterDigest,a.digest);assert.equal(b.ordinaryHumanEntry,'EXPERT_OVER_MCP_ONLY');
  assert.deepEqual(Object.keys(b.lifecycle).sort(),['doctor','health','help','install','removal','rollback','tutorial','upgrade','version']);
  for(const value of Object.values(b.lifecycle))assert.ok(value.startsWith(`host://${host}/evopilot-evolution-expert/`));
  assert.doesNotThrow(()=>assertExpertAdapterConformance(a));
});
for(const prohibition of ['own-runtime-state','select-or-mutate-harness','infer-approval','collect-raw-secrets','host-specific-lifecycle','automatic-publication','ordinary-human-cli-or-http-fallback','execute-source-work'])test(`adapter rejects removal of ${prohibition} even with recomputed digest`,()=>{
  const a=createExpertAdapter('generic-agent');a.prohibitedSemantics=a.prohibitedSemantics.filter(p=>p!==prohibition);a.digest=digest({...a,digest:undefined});
  assert.throws(()=>assertExpertAdapterConformance(a),/PROHIBITION_MISSING/);
});
for(const capability of ['structured-tool-results','local-or-remote-mcp','human-decision-presentation','runtime-state-resume','host-native-secure-secret-input'])test(`compatibility rejects missing ${capability}`,()=>{
  const a=createExpertAdapter('generic-agent');const caps=a.requiredCapabilities.filter(c=>c!==capability);
  assert.equal(expertCompatibility(a,'6.3.0',caps).conformanceStatus,'INCOMPATIBLE');
});
test('adapter rejects mismatched Core, protocol and content digests',()=>{
  const a=createExpertAdapter('generic-agent');
  assert.throws(()=>assertExpertAdapterConformance({...a,coreDigest:wrongDigest}),/CORE_BINDING_INVALID/);
  assert.throws(()=>assertExpertAdapterConformance({...a,protocolVersion:'unsupported'}),/PROTOCOL_INCOMPATIBLE/);
  assert.throws(()=>assertExpertAdapterConformance({...a,host:'changed-host'}),/ADAPTER_DIGEST_MISMATCH/);
});
