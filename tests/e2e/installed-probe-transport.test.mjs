import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createInstalledProbeTransport,createInstalledBindingTransport,createInstalledTransitionTransport,bytesDigest} from './versions/installed-transport.mjs';
import {probeDigest} from './versions/probe-session.mjs';
import {runInstalledProbe} from './versions/run-installed-probe.mjs';
import {runInstalledBinding} from './versions/run-installed-binding.mjs';
import {runInstalledExpertBinding} from './versions/run-installed-expert-binding.mjs';
import {runInstalledTransition} from './versions/run-installed-transition.mjs';
import {runInstalledRefusal} from './versions/run-installed-refusal.mjs';
import {runInstalledCapability} from './versions/run-installed-capability.mjs';
import {capabilityRequiredMessage} from './versions/runtime/6.3.0/capability-probe.mjs';

// Toy files only: not an npm install, Candidate or product acceptance run.
function fixture(t,product='expert'){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'installed-probe-toy-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const name=product==='expert'?'@evopilot/evolution-expert':'@evopilot/cli',version=product==='expert'?'2.3.0':'6.3.0';
  const entry=product==='expert'?'dist/cli.js':'dist/index.js';
  const root=path.join(temp,'installation'),pkg='node_modules/'+name;fs.mkdirSync(path.join(root,pkg,'dist'),{recursive:true});
  const values={'package.json':JSON.stringify({name,version,type:'module'}),
    [entry]:"process.stdout.write(JSON.stringify({args:process.argv.slice(2),preload:process.env.NODE_OPTIONS??null}));\n"};
  const files=Object.entries(values).map(([relative,value])=>{const p=pkg+'/'+relative;fs.writeFileSync(path.join(root,p),value);return {path:p,digest:bytesDigest(value)};});
  const context={schema:'evopilot-installed-readonly-probe-context/v1',product,version,installationRoot:root,files,
    artifactSetDigest:'sha256:'+'1'.repeat(64),acceptanceBindingDigest:'sha256:'+'2'.repeat(64),probeInputDigest:probeDigest({})};
  if(product==='runtime') {
    context.configFile=path.join(temp,'runtime-config.json');fs.writeFileSync(context.configFile,'{}',{mode:0o600});
    context.configDigest=bytesDigest('{}');context.server='http://127.0.0.1:12345';
  }
  const options=()=>{const contextBytes=Buffer.from(JSON.stringify(context));return {contextBytes,expectedContextDigest:bytesDigest(contextBytes),sourceRoot:path.resolve('.')};};
  return {temp,root,pkg,context,options,cli:path.join(root,pkg,entry)};
}
function sdkFixture(t,operation='review',sdkOverride) {
  const f=fixture(t),hash='sha256:'+'3'.repeat(64),selection={projectId:'p',catalogId:'c',artifactSetDigest:hash,bundleDigest:hash},scope={tenantId:'t',workspaceId:'w',projectId:'p'};
  const body={schema:'evopilot-project-semantic-binding-review/v1',scope,catalogId:'c',pins:{artifactSetDigest:hash,bundleRef:{digest:hash}},bindingCreated:false,eligibleForExecution:false};
  const review={...body,reviewDigest:probeDigest(body)};
  const response={schema:'evopilot-mcp-http-result/v1',tool:'evopilot_project_semantic_'+operation,ok:true,status:200,requestId:'synthetic',response:{data:review}};
  const explanation={schema:'evopilot-expert-semantic-explanation/v1',requestId:'synthetic',canExecute:false,canComplete:false,
    status:'WAITING_EXACT_HUMAN_DECISION',nextAction:'exact decision',reviewDigest:review.reviewDigest};
  const sdk=sdkOverride??`export function planExpertTurn(text,payload){return {text,payload};}
export async function executeExpertTurn(plan,transport){await transport.invoke('evopilot_project_semantic_capabilities',{projectId:plan.payload.projectId});return transport.invoke('evopilot_project_semantic_${operation}',plan.payload);}
export function explainExpertSemanticResult(){return ${JSON.stringify(explanation)};}
`;
  const sdkPath=f.pkg+'/dist/index.js';fs.writeFileSync(path.join(f.root,sdkPath),sdk);f.context.files.push({path:sdkPath,digest:bytesDigest(sdk)});
  const input={operation,selection,scope,...(operation==='approve'?{decision:{authorizationDigest:review.reviewDigest,evidenceRef:'decision://synthetic'}}:{})};
  f.context.schema='evopilot-installed-expert-sdk-context/v1';f.context.probeInputDigest=probeDigest(input);
  return {...f,input,response,explanation,sdkOptions:()=>({...f.options(),inputBytes:Buffer.from(JSON.stringify(input))})};
}
function availableCapabilities(operation,projectId='p') {
  return {schema:'evopilot-mcp-http-result/v1',tool:'evopilot_project_semantic_capabilities',authority:'NONE',status:200,ok:true,requestId:'synthetic-capability',
    response:{data:{schema:'evopilot-project-semantic-capabilities/v1',projectId,operations:['capabilities',operation],executionAvailable:false,
      completionAvailable:false,authority:'RUNTIME_CURRENT_SCOPED_PRINCIPAL'}}};
}
test('parent independently refuses missing normal SDK capabilities before preparing a review',async t=>{
  const f=sdkFixture(t),calls=[];
  await assert.rejects(runInstalledExpertBinding({...f.sdkOptions(),authorizeInvocation:async()=>true,
    invokeMcp:async call=>{calls.push(call.tool);return call.tool.endsWith('_capabilities')?{}:f.response;}}));
  assert.deepEqual(calls,['evopilot_project_semantic_capabilities']);
});
test('lost review response is an unknown write outcome, not a retryable read failure',async t=>{
  const f=sdkFixture(t),calls=[];
  const result=await runInstalledExpertBinding({...f.sdkOptions(),authorizeInvocation:async()=>true,invokeMcp:async call=>{
    calls.push(call.tool);if(call.tool.endsWith('_capabilities'))return availableCapabilities('review');throw Error('synthetic lost review response');
  }});
  assert.equal(result.status,'UNKNOWN_OUTCOME');assert.equal(result.nextAction,'READBACK_ONLY_NO_SUBMISSION_REPLAY');
  assert.deepEqual(calls,['evopilot_project_semantic_capabilities','evopilot_project_semantic_review']);
});
test('normal SDK capability envelope is independently checked before review or approval authority',async t=>{
  const mutations={
    empty:()=>({}),foreign:r=>{r.response.data.projectId='foreign';},missing:r=>{r.response.data.operations=['capabilities'];},
    duplicate:r=>{r.response.data.operations.push('capabilities');},unknown:r=>{r.response.data.operations.push('legacyRun');},
    noDiscovery:r=>{r.response.data.operations=r.response.data.operations.filter(op=>op!=='capabilities');},
    execution:r=>{r.response.data.executionAvailable=true;},completion:r=>{r.response.data.completionAvailable=true;},
    authority:r=>{r.response.data.authority='EXPERT';},wrapperAuthority:r=>{r.authority='EXPERT';},
    tool:r=>{r.tool='evopilot_project_semantic_review';},schema:r=>{r.schema='forged';},
    status:r=>{r.status=403;},ok:r=>{r.ok=false;},requestId:r=>{r.requestId='';},
    extra:r=>{r.response.data.approved=true;},error:r=>({isError:true,structuredContent:r})
  };
  for(const operation of ['review','approve'])for(const [name,mutate] of Object.entries(mutations))await t.test(operation+' '+name,async t=>{
    const f=sdkFixture(t,operation),calls=[],effects=[],r=availableCapabilities(operation),changed=mutate(r);
    await assert.rejects(runInstalledExpertBinding({...f.sdkOptions(),authorizeInvocation:async frame=>{effects.push(frame.effect);return true;},
      invokeMcp:async call=>{calls.push(call.tool);return changed??r;}}));
    assert.deepEqual(calls,['evopilot_project_semantic_capabilities']);assert.deepEqual(effects,['READ']);
  });
  await t.test('wrapped valid capability permits only the separately authorized review',async t=>{
    const f=sdkFixture(t),calls=[];
    const result=await runInstalledExpertBinding({...f.sdkOptions(),authorizeInvocation:async()=>true,invokeMcp:async call=>{
      calls.push(call.tool);return call.tool.endsWith('_capabilities')?{isError:false,structuredContent:availableCapabilities('review')}:f.response;
    }});
    assert.equal(result.status,'EXPERT_SDK_BINDING_ASSERTIONS_PASSED');assert.equal(calls.length,2);assert.equal(result.targetCriteriaClosed,0);
  });
});
test('review interruption after send is UNKNOWN with no replay; denial before send stays a refusal',async t=>{
  for(const behavior of ['timeout','abort','inventory-drift','malformed'])await t.test(behavior,async t=>{
    const f=sdkFixture(t),calls=[],controller=new AbortController();
    const result=await runInstalledExpertBinding({...f.sdkOptions(),timeoutMs:behavior==='timeout'?1000:30000,signal:controller.signal,authorizeInvocation:async()=>true,
      invokeMcp:async call=>{calls.push(call.tool);if(call.tool.endsWith('_capabilities'))return availableCapabilities('review');
        if(behavior==='timeout')return new Promise(()=>{});if(behavior==='abort')controller.abort();
        if(behavior==='inventory-drift')fs.appendFileSync(f.cli,'\n');return behavior==='malformed'?{}:f.response;
      }});
    assert.equal(result.status,'UNKNOWN_OUTCOME');assert.equal(result.nextAction,'READBACK_ONLY_NO_SUBMISSION_REPLAY');
    assert.equal(result.targetCriteriaClosed,0);assert.equal(result.releaseAuthorized,false);
    assert.deepEqual(calls,['evopilot_project_semantic_capabilities','evopilot_project_semantic_review']);
  });
  await t.test('review authorization denied after valid capability sends no write',async t=>{
    const f=sdkFixture(t),calls=[];
    await assert.rejects(runInstalledExpertBinding({...f.sdkOptions(),authorizeInvocation:async frame=>frame.effect==='READ',invokeMcp:async call=>{
      calls.push(call.tool);return availableCapabilities('review');
    }}),/INVOCATION_DENIED/);assert.deepEqual(calls,['evopilot_project_semantic_capabilities']);
  });
});
const refusalBody={error:'SEMANTIC_CATALOG_DIGEST_MISMATCH',requestId:'synthetic-refusal',nextAction:'review-semantic-catalog',
  meta:{llm:{schema:'evopilot-llm-usage-meta/v1',configured:false,creditUnit:'token',calls:0,succeeded:0,failed:0,totalTokens:0,inputTokens:0,outputTokens:0,creditsConsumed:0}}};
const refusalInput={selection:{projectId:'p',catalogId:'c',artifactSetDigest:'sha256:'+'1'.repeat(64),bundleDigest:'sha256:'+'2'.repeat(64)},
  scope:{projectId:'p',tenantId:'t',workspaceId:'w'},expected:{kind:'CATALOG_REFUSAL',code:'DIGEST_MISMATCH'}};
function capabilityFixture(t,operation='inspect',behavior='named-stop') {
  const f=fixture(t),capabilities={schema:'evopilot-project-semantic-capabilities/v1',projectId:'p',operations:['capabilities'],
    executionAvailable:false,completionAvailable:false,authority:'RUNTIME_CURRENT_SCOPED_PRINCIPAL'};
  const input={operation,selection:refusalInput.selection,scope:refusalInput.scope,expected:{kind:'CAPABILITY_MISSING',capabilityDigest:probeDigest(capabilities)}};
  const last=behavior==='named-stop'?`throw Error(${JSON.stringify(capabilityRequiredMessage)});`:
    behavior==='crash'?"throw Error('private arbitrary failure must not become acceptance');":
    behavior==='extra-call'?"return t.invoke('evopilot_project_semantic_review',p.payload);":
    behavior==='success'?'return {};':"await new Promise(()=>{});";
  const sdk=`export function planExpertTurn(text,payload){return {payload};}
export async function executeExpertTurn(p,t){${behavior==='early-stop'?'':"await t.invoke('evopilot_project_semantic_capabilities',{projectId:p.payload.projectId});"}${behavior==='early-stop'?`throw Error(${JSON.stringify(capabilityRequiredMessage)});`:last}}
export function explainExpertSemanticResult(){return {};}
`;
  const file=f.pkg+'/dist/index.js';fs.writeFileSync(path.join(f.root,file),sdk);f.context.files.push({path:file,digest:bytesDigest(sdk)});
  f.context.schema='evopilot-installed-expert-sdk-context/v1';f.context.probeInputDigest=probeDigest(input);
  const response={schema:'evopilot-mcp-http-result/v1',tool:'evopilot_project_semantic_capabilities',authority:'NONE',status:200,ok:true,requestId:'synthetic',response:{data:capabilities}};
  return {...f,input,response,sdkOptions:()=>({...f.options(),inputBytes:Buffer.from(JSON.stringify(input))})};
}
test('installed toy capability probe preserves named CLI stop and denies review before execution',async t=>{
  const f=fixture(t,'runtime'),capabilities={schema:'evopilot-project-semantic-capabilities/v1',projectId:'p',operations:['capabilities'],
    executionAvailable:false,completionAvailable:false,authority:'RUNTIME_CURRENT_SCOPED_PRINCIPAL'};
  const text=`if(process.argv[4]==='capabilities')console.log(${JSON.stringify(JSON.stringify({...capabilities,requestId:'synthetic'}))});
else {console.error(${JSON.stringify(JSON.stringify({error:capabilityRequiredMessage}))});process.exitCode=1;}\n`;
  fs.writeFileSync(f.cli,text);f.context.files.find(x=>x.path.endsWith('/index.js')).digest=bytesDigest(text);
  const input={operation:'inspect',selection:refusalInput.selection,scope:refusalInput.scope,expected:{kind:'CAPABILITY_MISSING',capabilityDigest:probeDigest(capabilities)}};
  f.context.probeInputDigest=probeDigest(input);const options=()=>({...f.options(),inputBytes:Buffer.from(JSON.stringify(input))});
  const report=await runInstalledCapability(options());assert.equal(report.status,'CAPABILITY_STOP_SUBCASE_ASSERTIONS_PASSED');assert.equal(report.events.length,3);
  await assert.rejects(runInstalledCapability({...options(),inputBytes:Buffer.from(JSON.stringify({...input,operation:'gap'}))}),/INPUT_DIGEST_MISMATCH/);
  const transport=createInstalledProbeTransport({...f.options(),capabilityMode:true});
  await assert.rejects(transport.invoke(['project','semantic','review','p','--json']),/PROBE_COMMAND_DENIED/);
  assert.throws(()=>createInstalledProbeTransport({...f.options(),capabilityMode:true,refusalMode:true}));
});
test('installed toy Expert missing capability stops after exactly one authorized read for each supported intent',async t=>{
  for(const operation of ['inspect','compatibility','onboarding','gap','review'])await t.test(operation,async()=>{
    const f=capabilityFixture(t,operation),calls=[],effects=[];
    const result=await runInstalledExpertBinding({...f.sdkOptions(),authorizeInvocation:async frame=>{effects.push(frame.effect);return true;},
      invokeMcp:async call=>{calls.push(call);return f.response;}});
    assert.equal(result.status,'EXPERT_SDK_CAPABILITY_STOP_ASSERTIONS_PASSED');assert.equal(result.targetCriteriaClosed,0);assert.equal(result.events.length,1);
    assert.deepEqual(effects,['READ']);assert.deepEqual(calls,[{tool:'evopilot_project_semantic_capabilities',payload:{projectId:'p'}}]);
  });
});
test('installed toy SDK crash, early named error, success, extra invocation and hang never pass capability stop',async t=>{
  for(const behavior of ['crash','early-stop','success','extra-call','hang'])await t.test(behavior,async()=>{
    const f=capabilityFixture(t,'inspect',behavior);let calls=0;
    await assert.rejects(runInstalledExpertBinding({...f.sdkOptions(),timeoutMs:behavior==='hang'?100:1000,authorizeInvocation:async()=>true,
      invokeMcp:async()=>{calls++;return f.response;}}));assert.ok(calls<=1);
  });
});
test('installed SDK missing-capability evidence rejects drift, forged envelope, cancellation and unauthorized reads',async t=>{
  const f=capabilityFixture(t);
  for(const response of [{...f.response,status:0,ok:false},{...f.response,tool:'evopilot_project_semantic_review'},
    {...f.response,response:{data:{...f.response.response.data,operations:['capabilities','inspect']}}}])
    await assert.rejects(runInstalledExpertBinding({...f.sdkOptions(),authorizeInvocation:async()=>true,invokeMcp:async()=>response}));
  let calls=0;const invokeMcp=async()=>{calls++;return f.response;};
  await assert.rejects(runInstalledExpertBinding({...f.sdkOptions(),authorizeInvocation:async()=>false,invokeMcp}),/INVOCATION_DENIED/);
  const c=new AbortController();await assert.rejects(runInstalledExpertBinding({...f.sdkOptions(),signal:c.signal,authorizeInvocation:async()=>{c.abort();return true;},invokeMcp}),/SDK_CANCELLED/);
  assert.equal(calls,0);
});
test('installed toy RC03 decodes named stderr refusal, enforces input identity and denies mutation commands',async t=>{
  const f=fixture(t,'runtime'),text=`process.stderr.write(${JSON.stringify(JSON.stringify({error:refusalBody.error,body:refusalBody}))});process.exitCode=1;\n`;
  fs.writeFileSync(f.cli,text);f.context.files.find(x=>x.path.endsWith('/index.js')).digest=bytesDigest(text);f.context.probeInputDigest=probeDigest(refusalInput);
  const options=()=>({...f.options(),inputBytes:Buffer.from(JSON.stringify(refusalInput))});
  const r=await runInstalledRefusal(options());assert.equal(r.status,'REFUSAL_SUBCASE_ASSERTIONS_PASSED');assert.equal(r.events.length,2);assert.equal(r.targetCriteriaClosed,0);
  await assert.rejects(runInstalledRefusal({...options(),inputBytes:Buffer.from(JSON.stringify({...refusalInput,expected:{kind:'CATALOG_REFUSAL',code:'PATH_DENIED'}}))}),/INPUT_DIGEST_MISMATCH/);
  const transport=createInstalledProbeTransport({...f.options(),refusalMode:true});
  for(const op of ['review','approve','binding','transitionApprove','capabilities'])await assert.rejects(transport.invoke(['project','semantic',op,'p','--json']),/RC03_READ_ONLY_COMMAND_REQUIRED/);
});
test('installed toy RC03 process crash, empty error, abnormal exit and missing server envelope are not passes',async t=>{
  for(const [name,text] of [['crash',"throw Error('synthetic crash');\n"],['empty','process.exitCode=1;\n'],
    ['abnormal',`console.error(${JSON.stringify(JSON.stringify({error:refusalBody.error,body:refusalBody}))});process.exitCode=2;\n`],
    ['no-envelope',`console.error(${JSON.stringify(JSON.stringify({error:'fetch failed'}))});process.exitCode=1;\n`]])await t.test(name,async()=>{
    const f=fixture(t,'runtime');fs.writeFileSync(f.cli,text);f.context.files.find(x=>x.path.endsWith('/index.js')).digest=bytesDigest(text);f.context.probeInputDigest=probeDigest(refusalInput);
    await assert.rejects(runInstalledRefusal({...f.options(),inputBytes:Buffer.from(JSON.stringify(refusalInput))}),/PROBE_JSON_INVALID/);
  });
});
test('installed toy Expert SDK independently validates named refusal and never creates review or retries',async t=>{
  const f=fixture(t),input={operation:'inspect',...refusalInput},explanation={schema:'evopilot-expert-semantic-explanation/v1',status:'BLOCKED',requestId:refusalBody.requestId,
    httpStatus:409,canExecute:false,canComplete:false,nextAction:'Inspect Runtime error and authoritative state; do not retry an uncertain mutation or fall back to legacy execution.'};
  const sdk=`export function planExpertTurn(text,payload){return {payload};}
export async function executeExpertTurn(p,t){await t.invoke('evopilot_project_semantic_capabilities',{projectId:p.payload.projectId});return t.invoke('evopilot_project_semantic_inspect',p.payload);}
export function explainExpertSemanticResult(){return ${JSON.stringify(explanation)};}
`;
  const file=f.pkg+'/dist/index.js';fs.writeFileSync(path.join(f.root,file),sdk);f.context.files.push({path:file,digest:bytesDigest(sdk)});
  f.context.schema='evopilot-installed-expert-sdk-context/v1';f.context.probeInputDigest=probeDigest(input);
  const response={schema:'evopilot-mcp-http-result/v1',tool:'evopilot_project_semantic_inspect',authority:'NONE',status:409,ok:false,requestId:refusalBody.requestId,response:refusalBody};
  const effects=[],calls=[],options={...f.options(),inputBytes:Buffer.from(JSON.stringify(input)),authorizeInvocation:async frame=>{effects.push(frame.effect);return true;}};
  const report=await runInstalledExpertBinding({...options,invokeMcp:async call=>{calls.push(call);return call.tool.endsWith('_capabilities')?availableCapabilities('inspect'):response;}});
  assert.equal(report.status,'EXPERT_SDK_REFUSAL_ASSERTIONS_PASSED');assert.deepEqual(effects,['READ','READ']);
  assert.deepEqual(calls.map(c=>c.tool),['evopilot_project_semantic_capabilities','evopilot_project_semantic_inspect']);
  assert.deepEqual(calls[1].payload,{projectId:'p',catalogId:'c'});assert.equal(report.targetCriteriaClosed,0);
  for(const changed of [{...response,status:500},{...response,ok:true},{...response,requestId:'other'},
    {...response,response:{...refusalBody,error:'SEMANTIC_CATALOG_TIMEOUT'}}])await assert.rejects(runInstalledExpertBinding({...options,
      invokeMcp:async call=>call.tool.endsWith('_capabilities')?availableCapabilities('inspect'):changed}));
});
test('toy installed Expert SDK relays exact MCP calls with independent authorization and presentation assertions',async t=>{
  const f=sdkFixture(t),calls=[];
  const result=await runInstalledExpertBinding({...f.sdkOptions(),authorizeInvocation:async frame=>{calls.push(frame.effect);frame.call.payload.projectId='tampered';return true;},
    invokeMcp:async call=>{assert.equal(call.payload.projectId,'p');return call.tool.endsWith('_capabilities')?availableCapabilities('review'):f.response;}});
  assert.equal(result.status,'EXPERT_SDK_BINDING_ASSERTIONS_PASSED');assert.deepEqual(calls,['READ','PREPARE_REVIEW']);
  assert.equal(result.targetCriteriaClosed,0);assert.equal(result.realHost,'NOT_QUALIFIED');assert.equal(result.installation.grantsAuthority,false);
});
test('Expert SDK refuses missing authorization, input substitution and artifact drift before MCP',async t=>{
  const f=sdkFixture(t);let calls=0;const invokeMcp=async()=>{calls++;return {};};
  await assert.rejects(runInstalledExpertBinding({...f.sdkOptions(),invokeMcp}),/AUTHORIZER_REQUIRED/);
  await assert.rejects(runInstalledExpertBinding({...f.sdkOptions(),inputBytes:Buffer.from(JSON.stringify({...f.input,scope:{...f.input.scope,tenantId:'foreign'}})),invokeMcp,authorizeInvocation:async()=>true}),/INPUT_DIGEST_MISMATCH/);
  await assert.rejects(runInstalledExpertBinding({...f.sdkOptions(),invokeMcp,authorizeInvocation:async()=>false}),/INVOCATION_DENIED/);
  await assert.rejects(runInstalledExpertBinding({...f.sdkOptions(),invokeMcp,authorizeInvocation:async()=>{fs.writeFileSync(f.cli,'changed');return true;}}),/INVENTORY_DRIFT/);
  assert.equal(calls,0);
});
test('Expert SDK rejects a changed tool and does not fall back to CLI',async t=>{
  const f=sdkFixture(t,'review',`export function planExpertTurn(){return {};}
export async function executeExpertTurn(p,t){return t.invoke('evopilot_project_semantic_transitionApprove',{});}
export function explainExpertSemanticResult(){return {};}
`);let calls=0;
  await assert.rejects(runInstalledExpertBinding({...f.sdkOptions(),invokeMcp:async()=>{calls++;},authorizeInvocation:async()=>true}),/SDK_CALL_CHANGED/);assert.equal(calls,0);
});
test('Expert SDK cancellation during authorization prevents dispatch; hanging worker is bounded',async t=>{
  const f=sdkFixture(t),controller=new AbortController();let calls=0;
  await assert.rejects(runInstalledExpertBinding({...f.sdkOptions(),signal:controller.signal,invokeMcp:async()=>{calls++;},
    authorizeInvocation:async()=>{controller.abort();return true;}}),/SDK_CANCELLED/);assert.equal(calls,0);
  const hanging=sdkFixture(t,'review','await new Promise(()=>{});\n');
  await assert.rejects(runInstalledExpertBinding({...hanging.sdkOptions(),timeoutMs:100,invokeMcp:async()=>{},authorizeInvocation:async()=>true}),/SDK_TIMEOUT|SDK_WORKER_FAILED|SDK_WORKER_EARLY_EXIT/);
});
test('Expert SDK lost approval response returns UNKNOWN and never retries',async t=>{
  const f=sdkFixture(t,'approve'),calls=[];
  const report=await runInstalledExpertBinding({...f.sdkOptions(),authorizeInvocation:async()=>true,invokeMcp:async call=>{
    calls.push(call.tool);if(call.tool.endsWith('_approve'))throw Error('synthetic lost response');return availableCapabilities('approve');
  }});
  assert.equal(report.status,'UNKNOWN_OUTCOME');assert.equal(report.nextAction,'READBACK_ONLY_NO_SUBMISSION_REPLAY');
  assert.deepEqual(calls,['evopilot_project_semantic_capabilities','evopilot_project_semantic_approve']);
});

function transitionFixture() {
  const hash='sha256:'+'3'.repeat(64),scope={tenantId:'t',workspaceId:'w',projectId:'p'},withDigest=(v,k)=>({...v,[k]:probeDigest(v)}),ref={id:'b',version:'1.0.0',digest:hash};
  const pins={artifactSetDigest:hash,snapshotDigest:hash,skillDigest:hash,provenanceDigest:hash,closureDigest:hash,bundleRef:ref,reasoningProfileDigest:hash,
    harnessClosure:{profile:ref,components:[ref]},compatibilityDigest:hash};
  const review=withDigest({schema:'evopilot-project-semantic-binding-review/v1',scope,projectRevisionDigest:hash,catalogId:'c',inspectionDigest:hash,pins,
    approvalPolicy:'current-scoped-operator-or-admin/v1',eligibleForExecution:false,bindingCreated:false},'reviewDigest');
  const principal={id:'operator',role:'operator',tenantId:'t',workspaceId:'w'},approvedAt='2026-09-25T00:00:00Z';
  const bindingDecision=withDigest({schema:'evopilot-project-semantic-binding-decision/v1',decision:'APPROVE',reviewDigest:review.reviewDigest,scope,principal,approvalPolicy:review.approvalPolicy,approvedAt},'decisionDigest');
  const binding=withDigest({schema:'evopilot-project-semantic-binding/v1',scope,projectRevisionDigest:hash,status:'REVIEWED_NOT_ACTIVATED',catalogId:'c',pins,
    reviewDigest:review.reviewDigest,decisionDigest:bindingDecision.decisionDigest,eligibleForExecution:false,nextAction:'resolve-governed-semantic-execution-binding'},'bindingDigest');
  const initial={review,decision:bindingDecision,binding},transition={action:'ACTIVATE',expectedHeadDigest:binding.bindingDigest,destinationDigest:binding.bindingDigest};
  const transitionReview=withDigest({schema:'evopilot-project-semantic-transition-review/v1',...transition,scope,fromBindingDigest:binding.bindingDigest,targetReview:review,
    changedFields:[],effect:'FUTURE_EXECUTION_PLANS_ONLY',mutatesExistingExecutions:false,grantsExecutionAuthority:false},'transitionReviewDigest');
  const decision=withDigest({decision:'APPROVE',principal,approvedAt,approvalPolicy:review.approvalPolicy,transitionReviewDigest:transitionReview.transitionReviewDigest},'decisionDigest');
  const receipt=withDigest({schema:'evopilot-project-semantic-transition/v1',review:transitionReview,destination:initial,decision},'transitionDigest');
  const beforeState={schema:'evopilot-project-semantic-activation/v1',headDigest:binding.bindingDigest,status:'REVIEWED_DEFAULT',bindingDigest:binding.bindingDigest,transitions:[],grantsExecutionAuthority:false};
  const state={...beforeState,headDigest:receipt.transitionDigest,status:'ACTIVE_FOR_FUTURE_PLANS',transitions:[receipt]};
  return {scope,initial,targetReview:review,transition,review:transitionReview,receipt,beforeState,state};
}
test('transition transport requires its own context and only allows exact scoped transition calls',async t=>{
  const f=fixture(t,'runtime'),hash='sha256:'+'3'.repeat(64),effects=[];
  assert.throws(()=>createInstalledTransitionTransport({...f.options(),authorizeInvocation:async()=>true}));
  f.context.schema='evopilot-installed-runtime-transition-context/v1';
  const transport=createInstalledTransitionTransport({...f.options(),authorizeInvocation:async frame=>{effects.push(frame.effect);return true;}});
  for(const args of [['project','semantic','activation','p','--json'],['project','semantic','transitionReview','p','--action','ACTIVATE','--expected-head-digest',hash,'--destination-digest',hash,'--json'],
    ['project','semantic','transitionApprove','p','--transition-review-digest',hash,'--decision','APPROVE','--json']])await transport.invoke(args);
  assert.deepEqual(effects,['READ','PREPARE_TRANSITION_REVIEW','APPROVE_PROJECT_TRANSITION']);
  for(const args of [['project','semantic','approve','p','--review-digest',hash,'--decision','APPROVE','--json'],
    ['project','semantic','transitionReview','p','--action','LATEST','--expected-head-digest',hash,'--destination-digest',hash,'--json'],['project','semantic','activation','p','--actor','admin','--json']])await assert.rejects(transport.invoke(args));
});
test('installed transition runner reads a pinned toy receipt without submitting anything',async t=>{
  const f=fixture(t,'runtime'),x=transitionFixture(),text=`console.log(${JSON.stringify(JSON.stringify({...x.state,requestId:'synthetic'}))});\n`;
  fs.writeFileSync(f.cli,text);f.context.files.find(x=>x.path.endsWith('/index.js')).digest=bytesDigest(text);
  const input={phase:'readback',scope:x.scope,initial:x.initial,targetReview:x.targetReview,transition:x.transition,review:x.review,
    decision:{transitionReviewDigest:x.review.transitionReviewDigest,decision:'APPROVE',principalId:'operator'}};
  f.context.schema='evopilot-installed-runtime-transition-context/v1';f.context.probeInputDigest=probeDigest(input);const effects=[];
  const result=await runInstalledTransition({...f.options(),inputBytes:Buffer.from(JSON.stringify(input)),authorizeInvocation:async frame=>{effects.push(frame.effect);return frame.effect==='READ';}});
  assert.equal(result.status,'TRANSITION_SUBJOURNEY_ASSERTIONS_PASSED');assert.deepEqual(effects,['READ','READ']);assert.equal(result.targetCriteriaClosed,0);
});
test('installed toy Expert transition SDK distinguishes state, review and exact approval; never invents completion',async t=>{
  const x=transitionFixture();
  for(const operation of ['activation','transitionReview','transitionApprove'])await t.test(operation,async()=>{
    const f=fixture(t),base={schema:'evopilot-expert-semantic-explanation/v1',requestId:'synthetic',canExecute:false,canComplete:false,nextAction:'read authoritative state'};
    const explanation=operation==='activation'?{...base,status:x.state.status,headDigest:x.state.headDigest,bindingDigest:x.state.bindingDigest,transitionCount:1,
      transitionReceipts:[{transitionDigest:x.receipt.transitionDigest,transitionReviewDigest:x.review.transitionReviewDigest}]}:
      operation==='transitionApprove'?{...base,status:'TRANSITION_RECORDED',transitionDigest:x.receipt.transitionDigest,transitionReviewDigest:x.review.transitionReviewDigest}:
      {...base,status:'WAITING_EXACT_HUMAN_DECISION',...Object.fromEntries(['transitionReviewDigest','action','expectedHeadDigest','destinationDigest','fromBindingDigest','changedFields','effect'].map(k=>[k,x.review[k]]))};
    const input={operation,scope:x.scope,initial:x.initial,...(operation==='activation'?{}:{beforeState:x.beforeState,targetReview:x.targetReview,transition:x.transition}),
      ...(operation==='transitionApprove'?{review:x.review,decision:{authorizationDigest:x.review.transitionReviewDigest,evidenceRef:'decision://toy'}}:{})};
    const sdk=`export function planExpertTurn(text,payload){return {payload};}
export async function executeExpertTurn(p,t){await t.invoke('evopilot_project_semantic_capabilities',{projectId:p.payload.projectId});return t.invoke('evopilot_project_semantic_${operation}',p.payload);}
export function explainExpertSemanticResult(){return ${JSON.stringify(explanation)};}
`;
    const file=f.pkg+'/dist/index.js';fs.writeFileSync(path.join(f.root,file),sdk);f.context.files.push({path:file,digest:bytesDigest(sdk)});
    f.context.schema='evopilot-installed-expert-sdk-context/v1';f.context.probeInputDigest=probeDigest(input);const effects=[];
    const response={schema:'evopilot-mcp-http-result/v1',tool:'evopilot_project_semantic_'+operation,ok:true,status:200,requestId:'synthetic',
      response:{data:operation==='activation'?x.state:operation==='transitionReview'?x.review:x.receipt}};
    const result=await runInstalledExpertBinding({...f.options(),inputBytes:Buffer.from(JSON.stringify(input)),authorizeInvocation:async frame=>{effects.push(frame.effect);return true;},
      invokeMcp:async call=>call.tool.endsWith('_capabilities')?availableCapabilities(operation):response});
    assert.equal(result.status,'EXPERT_SDK_BINDING_ASSERTIONS_PASSED');assert.equal(result.targetCriteriaClosed,0);
    assert.deepEqual(effects,['READ',operation==='activation'?'READ':operation==='transitionReview'?'PREPARE_TRANSITION_REVIEW':'APPROVE_PROJECT_TRANSITION']);
    if(operation!=='activation'){
      const calls=[];
      const lost=await runInstalledExpertBinding({...f.options(),inputBytes:Buffer.from(JSON.stringify(input)),authorizeInvocation:async()=>true,invokeMcp:async call=>{
        calls.push(call.tool);if(call.tool.endsWith('_capabilities'))return availableCapabilities(operation);throw Error('synthetic lost transition response');
      }});
      assert.equal(lost.status,'UNKNOWN_OUTCOME');assert.equal(lost.nextAction,'READBACK_ONLY_NO_SUBMISSION_REPLAY');
      assert.deepEqual(calls,['evopilot_project_semantic_capabilities','evopilot_project_semantic_'+operation]);
    }
  });
});

test('Runtime transport appends only bound private configuration and server origin',async t=>{
  const f=fixture(t,'runtime'),transport=createInstalledProbeTransport(f.options());
  const args=['project','semantic','capabilities','project-1','--json'];
  assert.deepEqual((await transport.invoke(args)).json.args,[...args,'--server',f.context.server,'--config',fs.realpathSync(f.context.configFile)]);
});
test('binding connection requires separate schema and external invocation authorization',async t=>{
  const f=fixture(t,'runtime');assert.throws(()=>createInstalledBindingTransport(f.options()),/AUTHORIZER_REQUIRED/);
  assert.throws(()=>createInstalledBindingTransport({...f.options(),authorizeInvocation:async()=>true}));
  f.context.schema='evopilot-installed-runtime-binding-context/v1';
  assert.throws(()=>createInstalledProbeTransport(f.options()));
  const args=['project','semantic','approve','p','--review-digest','sha256:'+'3'.repeat(64),'--decision','APPROVE','--json'];
  for(const response of [false,undefined,{approved:true}])await assert.rejects(createInstalledBindingTransport({...f.options(),authorizeInvocation:async()=>response}).invoke(args),/INVOCATION_DENIED/);
  let frame;const r=await createInstalledBindingTransport({...f.options(),authorizeInvocation:async f=>{frame=structuredClone(f);f.args[3]='injected';return true;}}).invoke(args);
  assert.equal(frame.effect,'APPROVE_PROJECT_BINDING');assert.equal(frame.commandDigest,probeDigest(args));assert.equal(frame.contextDigest,f.options().expectedContextDigest);
  assert.equal(r.json.args[3],'p','authorizer cannot replace command bytes');
  const effects=[];
  const readReview=createInstalledBindingTransport({...f.options(),authorizeInvocation:async frame=>{effects.push(frame.effect);return true;}});
  for(const command of [ ['project','semantic','binding','p','--json'],
    ['project','semantic','review','p','--catalog','c','--artifact-set-digest','sha256:'+'1'.repeat(64),'--bundle-digest','sha256:'+'2'.repeat(64),'--json']])
    assert.deepEqual((await readReview.invoke(command)).json.args.slice(0,command.length),command);
  assert.deepEqual(effects,['READ','PREPARE_REVIEW']);
});
test('binding connection rechecks installed identity and cancellation after authorization await',async t=>{
  const f=fixture(t,'runtime');f.context.schema='evopilot-installed-runtime-binding-context/v1';
  const args=['project','semantic','binding','p','--json'],c=new AbortController();
  const transport=createInstalledBindingTransport({...f.options(),authorizeInvocation:async()=>{c.abort();return true;}});
  await assert.rejects(transport.invoke(args,{signal:c.signal}),{name:'AbortError'});
  const drift=createInstalledBindingTransport({...f.options(),authorizeInvocation:async()=>{fs.appendFileSync(f.cli,'\n//drift');return true;}});
  await assert.rejects(drift.invoke(args),/INVENTORY_DRIFT/);
});
test('binding connection rejects unrelated mutations before consulting the campaign',async t=>{
  const f=fixture(t,'runtime');f.context.schema='evopilot-installed-runtime-binding-context/v1';let calls=0;
  const transport=createInstalledBindingTransport({...f.options(),authorizeInvocation:async()=>{calls++;return true;}});
  for(const args of [['project','semantic','transitionApprove','p','--json'],['project','semantic','approve','p','--review-digest','bad','--decision','APPROVE','--json'],['project','semantic','binding','p','--actor','admin','--json']])await assert.rejects(transport.invoke(args));
  assert.equal(calls,0);
});
test('installed binding entry refuses input substitution or missing campaign authorizer',async t=>{
  const f=fixture(t,'runtime');f.context.schema='evopilot-installed-runtime-binding-context/v1';
  const input={phase:'prepare',selection:{},scope:{}},inputBytes=Buffer.from(JSON.stringify(input));
  await assert.rejects(runInstalledBinding({...f.options(),inputBytes,authorizeInvocation:async()=>true}),/INPUT_DIGEST_MISMATCH/);
  f.context.probeInputDigest=probeDigest(input);
  await assert.rejects(runInstalledBinding({...f.options(),inputBytes}),/AUTHORIZER_REQUIRED/);
});
test('installed binding bridge completes readback with a pinned toy package and no write allowance',async t=>{
  const f=fixture(t,'runtime'),hash='sha256:'+'3'.repeat(64),scope={tenantId:'t',workspaceId:'w',projectId:'p'};
  const withDigest=(body,key)=>({...body,[key]:probeDigest(body)}),ref={id:'b',version:'1.0.0',digest:hash};
  const pins={artifactSetDigest:hash,snapshotDigest:hash,skillDigest:hash,provenanceDigest:hash,closureDigest:hash,
    bundleRef:ref,reasoningProfileDigest:hash,harnessClosure:{profile:ref,components:[ref]},compatibilityDigest:hash};
  const review=withDigest({schema:'evopilot-project-semantic-binding-review/v1',scope,projectRevisionDigest:hash,catalogId:'c',inspectionDigest:hash,pins,
    approvalPolicy:'current-scoped-operator-or-admin/v1',eligibleForExecution:false,bindingCreated:false},'reviewDigest');
  const decision=withDigest({schema:'evopilot-project-semantic-binding-decision/v1',decision:'APPROVE',reviewDigest:review.reviewDigest,scope,
    principal:{id:'operator',role:'operator',tenantId:'t',workspaceId:'w'},approvalPolicy:review.approvalPolicy,approvedAt:'2026-09-25T00:00:00Z'},'decisionDigest');
  const binding=withDigest({schema:'evopilot-project-semantic-binding/v1',scope,projectRevisionDigest:hash,status:'REVIEWED_NOT_ACTIVATED',catalogId:'c',pins,
    reviewDigest:review.reviewDigest,decisionDigest:decision.decisionDigest,eligibleForExecution:false,nextAction:'resolve-governed-semantic-execution-binding'},'bindingDigest');
  const responses={binding:{review,decision,binding},onboarding:{schema:'evopilot-project-semantic-onboarding/v1',projectId:'p',status:'EXISTING_BINDING',
    recommendedBindingMode:'PRESERVE_EXISTING_BINDING',existingBinding:{bindingDigest:binding.bindingDigest,headDigest:binding.bindingDigest},
    selectedCandidate:null,eligibleForExecution:false,grantsExecutionAuthority:false}};
  const text=`const responses=${JSON.stringify(responses)};console.log(JSON.stringify({...responses[process.argv[4]],requestId:'synthetic-request'}));\n`;
  fs.writeFileSync(f.cli,text);f.context.files.find(x=>x.path.endsWith('/index.js')).digest=bytesDigest(text);
  const input={phase:'readback',selection:{projectId:'p',catalogId:'c',artifactSetDigest:hash,bundleDigest:hash},scope,review,
    decision:{reviewDigest:review.reviewDigest,decision:'APPROVE',principalId:'operator'}};
  f.context.schema='evopilot-installed-runtime-binding-context/v1';f.context.probeInputDigest=probeDigest(input);const observed=[];
  const report=await runInstalledBinding({...f.options(),inputBytes:Buffer.from(JSON.stringify(input)),authorizeInvocation:async frame=>{observed.push(frame.effect);return frame.effect==='READ';}});
  assert.equal(report.status,'BINDING_SUBJOURNEY_ASSERTIONS_PASSED');assert.deepEqual(observed,['READ','READ','READ']);
  assert.equal(report.targetCriteriaClosed,0);assert.equal(report.installation.grantsAuthority,false);
});
test('Runtime refuses public config permissions or config byte drift',async t=>{
  const f=fixture(t,'runtime');fs.chmodSync(f.context.configFile,0o644);
  assert.throws(()=>createInstalledProbeTransport(f.options()),/PRIVATE_RUNTIME_CONFIG_REQUIRED/);
  fs.chmodSync(f.context.configFile,0o600);const transport=createInstalledProbeTransport(f.options());fs.writeFileSync(f.context.configFile,'{"changed":true}');
  await assert.rejects(transport.invoke(['project','semantic','capabilities','p','--json']),/RUNTIME_CONFIG_DRIFT/);
});
test('Runtime rejects unsafe or credential-bearing origins before any process',t=>{
  const f=fixture(t,'runtime');
  for(const server of ['http://example.invalid','https://example.invalid/path','https://example.invalid?credential=synthetic','https://synthetic@example.invalid','file:///']) {
    f.context.server=server;assert.throws(()=>createInstalledProbeTransport(f.options()),/RUNTIME_ORIGIN_INVALID/);
  }
});
test('Runtime semantic transport cannot mutate or override exact selection and destination',async t=>{
  const f=fixture(t,'runtime'),transport=createInstalledProbeTransport(f.options());
  for(const args of [['project','semantic','approve','p','--json'],['project','semantic','inspect','p','--catalog','c','--server','https://example.invalid','--json'],
    ['project','semantic','compatibility','p','--catalog','c','--artifact-set-digest','arbitrary','--bundle-digest','arbitrary','--json']])
    await assert.rejects(transport.invoke(args));
});
test('Runtime config mutation during a command invalidates the response',async t=>{
  const f=fixture(t,'runtime'),text="import fs from 'node:fs';fs.writeFileSync(process.argv.at(-1),'changed');console.log('{}');\n";
  fs.writeFileSync(f.cli,text);f.context.files.find(x=>x.path.endsWith('/index.js')).digest=bytesDigest(text);
  await assert.rejects(createInstalledProbeTransport(f.options()).invoke(['project','semantic','capabilities','p','--json']),/RUNTIME_CONFIG_DRIFT/);
});
test('pinned toy process uses exact entry and sanitized environment',async t=>{
  const f=fixture(t),previous=process.env.NODE_OPTIONS;
  try {process.env.NODE_OPTIONS='--require=/must-not-load.cjs';const transport=createInstalledProbeTransport(f.options());
    const r=await transport.invoke(['manifest']);assert.equal(r.exitCode,0);assert.equal(r.json.preload,null);assert.deepEqual(r.json.args,['manifest']);
    assert.equal(transport.identity.grantsAuthority,false);
  } finally {if(previous===undefined)delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=previous;}
});
test('wrong context digest fails before process creation',t=>{
  const f=fixture(t);assert.throws(()=>createInstalledProbeTransport({...f.options(),expectedContextDigest:'sha256:'+'0'.repeat(64)}),/CONTEXT_DIGEST_MISMATCH/);
});
test('unlisted installed file refuses before process creation',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'extra.js'),'extra');assert.throws(()=>createInstalledProbeTransport(f.options()),/INVENTORY_DRIFT/);
});
test('changed installed file after transport creation is refused',async t=>{
  const f=fixture(t),transport=createInstalledProbeTransport(f.options());fs.appendFileSync(f.cli,'\n// changed');await assert.rejects(transport.invoke(['manifest']),/INVENTORY_DRIFT/);
});
test('symlink replacement is refused even with unchanged target bytes',t=>{
  const f=fixture(t),other=path.join(f.temp,'outside-cli.js');fs.renameSync(f.cli,other);fs.symlinkSync(other,f.cli);
  assert.throws(()=>createInstalledProbeTransport(f.options()),/SYMLINK_REJECTED/);
});
test('duplicate inventory and traversal entries are refused',t=>{
  const f=fixture(t);f.context.files.push({...f.context.files[0]});assert.throws(()=>createInstalledProbeTransport(f.options()),/INVENTORY_INVALID/);
  f.context.files.pop();f.context.files[0].path='../outside';assert.throws(()=>createInstalledProbeTransport(f.options()),/PATH_INVALID/);
});
test('source checkout and source ancestor cannot be used as installation',t=>{
  const f=fixture(t);assert.throws(()=>createInstalledProbeTransport({...f.options(),sourceRoot:f.root}),/MUST_BE_EXTERNAL/);
  assert.throws(()=>createInstalledProbeTransport({...f.options(),sourceRoot:f.temp}),/MUST_BE_EXTERNAL/);
});
test('mutating or injected commands never reach the process',async t=>{
  const f=fixture(t),transport=createInstalledProbeTransport(f.options());
  for(const args of [['install'],['doctor','codex','6.3.0','--eval','x'],['manifest','--require=x'],['project','semantic','approve','p'],['doctor','--eval','6.3.0'],['doctor','codex',' --eval'],['doctor','codex','6.3.0;whoami'],['doctor','codex','6.3.0\u0000']])
    await assert.rejects(transport.invoke(args),/COMMAND_DENIED/);
});
test('malformed version arguments reach only the fixed declaration command unchanged',async t=>{
  const f=fixture(t),transport=createInstalledProbeTransport(f.options());
  for(const version of ['', ' ', ' 6.3.0', '6.3.0 ', '6.3', '06.3.0', '6.3.0-rc.1']) {
    const args=['compatibility','codex',version];assert.deepEqual((await transport.invoke(args)).json.args,args);
  }
});
test('Runtime-owned transport refuses Harness before looking for an installation',t=>{
  const f=fixture(t);f.context.product='harness';f.context.version='4.8.1';
  assert.throws(()=>createInstalledProbeTransport(f.options()),/PROBE_PRODUCT_INVALID/);
});
test('abort before command launch is propagated',async t=>{
  const f=fixture(t),transport=createInstalledProbeTransport(f.options()),c=new AbortController();c.abort();
  await assert.rejects(transport.invoke(['manifest'],{signal:c.signal}),{name:'AbortError'});
});
test('invalid completed CLI JSON is a transport failure, not negative product evidence',async t=>{
  const f=fixture(t);fs.writeFileSync(f.cli,"console.log('not JSON');\n");f.context.files.find(x=>x.path.endsWith('/cli.js')).digest=bytesDigest(fs.readFileSync(f.cli));
  await assert.rejects(createInstalledProbeTransport(f.options()).invoke(['manifest']),/PROBE_JSON_INVALID/);
});
test('installed executable mutation during command invalidates result',async t=>{
  const f=fixture(t);const text="import fs from 'node:fs';fs.appendFileSync(new URL(import.meta.url),'\\n//changed');console.log('{}');\n";
  fs.writeFileSync(f.cli,text);f.context.files.find(x=>x.path.endsWith('/cli.js')).digest=bytesDigest(text);
  await assert.rejects(createInstalledProbeTransport(f.options()).invoke(['manifest']),/INVENTORY_DRIFT/);
});
test('runner rejects input substitution before invoking the product',async t=>{
  const f=fixture(t),contextFile=path.join(f.temp,'context.json'),inputFile=path.join(f.temp,'input.json');
  fs.writeFileSync(contextFile,f.options().contextBytes);fs.writeFileSync(inputFile,'{"approve":true}');
  await assert.rejects(runInstalledProbe(['--context',contextFile,'--context-digest',f.options().expectedContextDigest,'--input',inputFile]),/INPUT_DIGEST_MISMATCH/);
});
