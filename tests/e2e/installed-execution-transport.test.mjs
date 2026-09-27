import {stageCompiledExpert} from '../helpers/isolated-compiled-expert.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {stageCompletionFixture} from '../helpers/semantic-stage-fixture.mjs';
import {executionProbeFrame} from '../helpers/semantic-execution-probe-frame.mjs';
import {createSemanticExecutionApplication} from '../../packages/server/dist/application/semantic-execution-application.js';
import {runInstalledExecution,executionCliResult} from './versions/run-installed-execution.mjs';
import {runInstalledExpertExecution} from './versions/run-installed-expert-execution.mjs';
import {createInstalledProbeTransport,verifyInstalledRuntimeExecution,bytesDigest} from './versions/installed-transport.mjs';
import {probeDigest} from './versions/probe-session.mjs';

async function sourcePacket(t) {
  const f=await stageCompletionFixture(t,{application:true});
  const app=createSemanticExecutionApplication(f.configuration,{governed:f.governed,lifecycle:f.lifecycleService,adapter:f.adapter,collector:f.collector,now:f.time.get});
  const access={currentAccess:f.ownerInputs.currentAccess};
  await app.prepare({identity:f.identity,runId:f.run.id,requestDigest:f.run.pendingExecution.requestDigest,goalTarget:f.state.goalTarget,
    contextPlan:f.state.contextPlan,outcomePlan:f.state.outcomePlan,selections:f.selected},access);
  const binding=await app.bind(f.identity,access),bound={identity:f.identity,bindingDigest:binding.bindingDigest};
  const slice=await app.resolve(bound,access),coverage=f.source.acceptanceCriteria.map(c=>({criterionDigest:c.criterionDigest,ruleIds:['units']}));
  const review=await app.review({...bound,coverage},access),decision=await app.approveReview({...bound,reviewDigest:review.reviewDigest,decision:'APPROVE'},access);
  const dispatch=await app.dispatch(bound,access),collection=await app.collect(bound,access),outcome=await app.evaluate(bound,access);
  return {frame:executionProbeFrame(f,binding,slice,review),decision:{decision:'APPROVE',reviewDigest:review.reviewDigest,principalId:f.access.principal.id},
    replies:{resolve:slice,review,approveReview:decision,dispatch,collect:collection,evaluate:outcome}};
}

// Tiny toy executable in a disposable external directory. NOT an actual
// installed product, accepted Candidate or qualified Host. Source records only
// seed realistic wire shapes; no product operation happens in the toy process.
function toy(t,packet,behavior='normal') {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'execution-bridge-toy-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const root=path.join(temp,'installation'),pkg='node_modules/@evopilot/cli',log=path.join(temp,'calls.jsonl');
  fs.mkdirSync(path.join(root,pkg,'dist'),{recursive:true});
  const {frame,decision,replies}=structuredClone(packet),input={frame,decision},bound={identity:frame.identity,bindingDigest:frame.binding.bindingDigest};
  const payloads={resolve:bound,review:{...bound,coverage:frame.review.coverage},approveReview:{...bound,reviewDigest:decision.reviewDigest,decision:'APPROVE'},dispatch:bound,collect:bound,evaluate:bound};
  const code=`import fs from 'node:fs';import assert from 'node:assert/strict';
const args=process.argv.slice(2),op=args[2],file=args[5],payload=JSON.parse(fs.readFileSync(file)),replies=${JSON.stringify(replies)},payloads=${JSON.stringify(payloads)};
assert.deepEqual(args.slice(0,2),['project','execution']);assert.equal(args[3],${JSON.stringify(frame.scope.projectId)});assert.equal(args[4],'--file');assert.equal(args[6],'--json');
assert.deepEqual(payload,payloads[op]);assert.equal(fs.statSync(file).mode&0o077,0);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.EVOPILOT_API_TOKEN,undefined);
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({operation:op,file})+'\\n');
if(op==='dispatch'&&${JSON.stringify(behavior)}==='hang')await new Promise(()=>setInterval(()=>{},1000));
if(op==='dispatch'&&${JSON.stringify(behavior)}==='lost'){console.error('synthetic disconnected response');process.exit(1);}
if(op==='dispatch'&&${JSON.stringify(behavior)}==='input-drift')fs.writeFileSync(file,'{}');
if(op==='dispatch'&&${JSON.stringify(behavior)}==='inventory-drift')fs.writeFileSync(new URL('extra.json',import.meta.url),'{}');
const data=replies[op];if(op==='dispatch'&&${JSON.stringify(behavior)}==='forgery')data.executionBindingDigest='sha256:'+'0'.repeat(64);
console.log(JSON.stringify(data.requestId?data:{...data,requestId:'synthetic-http-'+op}));
`;
  const files=[];for(const [rel,bytes] of Object.entries({'package.json':JSON.stringify({name:'@evopilot/cli',version:'6.3.0',type:'module'}),'dist/index.js':code})) {
    const name=pkg+'/'+rel;fs.writeFileSync(path.join(root,name),bytes);files.push({path:name,digest:bytesDigest(bytes)});
  }
  const configFile=path.join(temp,'runtime-config.json');fs.writeFileSync(configFile,'{}',{mode:0o600});
  const context={schema:'evopilot-installed-runtime-execution-context/v1',product:'runtime',version:'6.3.0',installationRoot:root,files,
    artifactSetDigest:probeDigest('synthetic-artifacts'),acceptanceBindingDigest:probeDigest('synthetic-campaign'),probeInputDigest:probeDigest(input),
    configFile,configDigest:bytesDigest('{}'),server:'http://127.0.0.1:12345'};
  const options=()=>{const contextBytes=Buffer.from(JSON.stringify(context));return {contextBytes,expectedContextDigest:bytesDigest(contextBytes),inputBytes:Buffer.from(JSON.stringify(input))};};
  const calls=()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  const clean=()=>{for(const call of calls()){assert.equal(fs.existsSync(call.file),false);assert.equal(fs.existsSync(path.dirname(call.file)),false);}};
  return {temp,root,context,input,options,calls,clean,cli:path.join(root,pkg,'dist/index.js')};
}

test('installed execution bridge fixed sequence, identity, authority and uncertainty controls',async t=>{
  const packet=await sourcePacket(t);
  await t.test('exact six-operation toy journey with no completion/release authority',async t=>{
    const f=toy(t,packet),frames=[];
    const result=await runInstalledExecution({...f.options(),authorizeInvocation:async frame=>{frames.push(structuredClone(frame));frame.projectId='forged';return true;}});
    assert.equal(result.status,'EXECUTION_SUBJOURNEY_ASSERTIONS_PASSED');assert.equal(result.result.status,'DUAL_VALIDATED_NOT_COMPLETED');
    assert.equal(result.targetCriteriaClosed,0);assert.equal(result.releaseAuthorized,false);assert.equal(result.installation.grantsAuthority,false);
    assert.equal(result.httpDispatchCorrelation,'REQUIRES_INDEPENDENT_TRANSPORT_EVIDENCE');
    assert.deepEqual(f.calls().map(c=>c.operation),['resolve','review','approveReview','dispatch','collect','evaluate']);
    assert.deepEqual(frames.map(x=>x.effect),['READ_CONTEXT','PREPARE_OUTCOME_REVIEW','APPROVE_OUTCOME_REVIEW','DISPATCH_EXECUTION','COLLECT_EXECUTION_EVIDENCE','EVALUATE_EXECUTION_OUTCOMES']);
    assert.equal(result.authorizations.length,6);assert.equal(result.events[3].requestId,packet.replies.dispatch.requestId);f.clean();
  });
  for(const behavior of ['lost','hang','forgery','input-drift','inventory-drift'])await t.test('no replay after '+behavior,async t=>{
    const f=toy(t,packet,behavior),result=await runInstalledExecution({...f.options(),timeoutMs:behavior==='hang'?1500:30000,authorizeInvocation:async()=>true});
    assert.equal(result.status,'UNVERIFIED_OUTCOME');assert.equal(result.lastAttemptedOperation,'dispatch');
    assert.equal(result.nextAction,'external-read-only-reconciliation-no-mutation-replay');
    assert.deepEqual(f.calls().map(c=>c.operation),['resolve','review','approveReview','dispatch']);f.clean();
  });
  for(const behavior of ['denied','hang','abort','inventory-drift','config-drift'])await t.test('authorization '+behavior+' cannot launch a process',async t=>{
    const f=toy(t,packet),c=new AbortController();
    await assert.rejects(runInstalledExecution({...f.options(),signal:c.signal,timeoutMs:behavior==='hang'?50:1000,authorizeInvocation:async()=>{
      if(behavior==='denied')return false;
      if(behavior==='hang')return new Promise(()=>{});
      if(behavior==='abort')c.abort();
      if(behavior==='inventory-drift')fs.appendFileSync(f.cli,'\n');
      if(behavior==='config-drift')fs.writeFileSync(f.context.configFile,'{"changed":true}');
      return true;
    }}));assert.deepEqual(f.calls(),[]);
  });
  for(const behavior of ['context','input','decision','schema','extra-file','symlink','wrong-version','config-mode','origin'])await t.test('preflight rejects '+behavior,async t=>{
    const f=toy(t,packet);let override={};
    if(behavior==='context')override.expectedContextDigest=probeDigest('wrong');
    if(behavior==='input')f.input.frame.scope.projectId='wrong';
    if(behavior==='decision'){f.input.decision.reviewDigest=probeDigest('wrong');f.context.probeInputDigest=probeDigest(f.input);}
    if(behavior==='schema')f.context.schema='evopilot-installed-readonly-probe-context/v1';
    if(behavior==='extra-file')fs.writeFileSync(path.join(f.root,'extra.json'),'{}');
    if(behavior==='symlink')fs.symlinkSync(f.cli,path.join(f.root,'link.js'));
    if(behavior==='wrong-version')f.context.version='6.2.0';
    if(behavior==='config-mode')fs.chmodSync(f.context.configFile,0o644);
    if(behavior==='origin')f.context.server='http://remote.example.test';
    await assert.rejects(runInstalledExecution({...f.options(),...override,authorizeInvocation:async()=>true}));assert.deepEqual(f.calls(),[]);
  });
  await t.test('identity verifier exposes no command executor and readonly context does not gain execution',t=>{
    const f=toy(t,packet),options={...f.options(),sourceRoot:path.resolve('.')};
    const identity=verifyInstalledRuntimeExecution(options);assert.equal(identity.invoke,undefined);
    assert.throws(()=>createInstalledProbeTransport(options));
    assert.throws(()=>verifyInstalledRuntimeExecution({...options,sdkMode:true}));
  });
  await t.test('request payloads are preflighted before first read',async t=>{
    const f=toy(t,packet);f.input.frame.review.coverage=[{criterionDigest:probeDigest('criterion'),ruleIds:['x'.repeat(70000)]}];f.context.probeInputDigest=probeDigest(f.input);
    await assert.rejects(runInstalledExecution({...f.options(),authorizeInvocation:async()=>true}),/EXECUTION_PAYLOAD_LIMIT/);assert.deepEqual(f.calls(),[]);
  });
});

test('CLI decoder preserves governed dispatch id and refuses ambiguous process results',()=>{
  const dispatch={schema:'evopilot-semantic-dispatch-result/v1',requestId:'semantic-synthetic',status:'RECEIVED_PENDING_DUAL_VALIDATION'};
  assert.deepEqual(executionCliResult('dispatch',0,JSON.stringify(dispatch),''),{requestId:dispatch.requestId,data:dispatch});
  assert.deepEqual(executionCliResult('resolve',0,'{"sliceDigest":"synthetic","requestId":"http-1"}',''),{requestId:'http-1',data:{sliceDigest:'synthetic'}});
  for(const [operation,code,stdout,stderr] of [['completeGoal',0,'{}',''],['dispatch',1,JSON.stringify(dispatch),''],['dispatch',0,JSON.stringify(dispatch),'warning'],
    ['dispatch',0,'{}',''],['dispatch',0,'[]',''],['dispatch',0,'',''],['dispatch',0,'not-json','']])assert.throws(()=>executionCliResult(operation,code,stdout,stderr));
});

function sdkToy(t,packet,operation,behavior='normal') {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'execution-sdk-toy-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const root=path.join(temp,'installation'),pkg='node_modules/@evopilot/evolution-expert';fs.mkdirSync(path.join(root,pkg,'dist'),{recursive:true});
  const input={operation,frame:structuredClone(packet.frame),...(operation==='approveReview'?{decision:{authorizationDigest:packet.frame.review.reviewDigest,evidenceRef:'synthetic-only'}}:{})};
  const data=packet.replies[operation],envelope=(op,value)=>({schema:'evopilot-mcp-http-result/v1',tool:'evopilot_semantic_execution_'+op,
    ok:true,status:200,requestId:'synthetic-http-'+op,response:{data:value}});
  const response=envelope(operation,data),capabilities=envelope('capabilities',{
    schema:'evopilot-semantic-execution-capabilities/v1',projectId:packet.frame.scope.projectId,
    operations:['resolve','review','approveReview','dispatch','collect','evaluate'],authority:'RUNTIME_CURRENT_SCOPED_PRINCIPAL',
    adapterConfigured:true,collectorConfigured:true,completionAvailable:false,completionScope:'UNAVAILABLE',
    phaseTargetCompletionAvailable:false,phaseCompletionAvailable:false,goalCompletionAvailable:false,releaseAvailable:false,qualification:'REVALIDATE_PER_REQUEST'});
  const explanation={schema:'evopilot-expert-semantic-execution-explanation/v1',requestId:response.requestId,
    canExecute:false,canComplete:false,releaseAuthorized:false,published:false,goalCompleted:false,nextAction:'synthetic-only'};
  if(operation==='evaluate')Object.assign(explanation,...['status','business','harness','agentStatus','outcomeDigest','evidenceTrust','collectorTrust'].map(key=>({[key]:data[key]})));
  else if(operation==='dispatch')Object.assign(explanation,{status:'RECEIVED_PENDING_DUAL_VALIDATION',agentStatus:data.result.status,executionRequestId:data.requestId,requestDigest:data.requestDigest});
  else {
    explanation.status=({resolve:'PREPARED_NOT_DISPATCHED',review:'WAITING_EXACT_HUMAN_DECISION',approveReview:'RECEIPT_RECORDED',collect:'COLLECTED_NOT_COMPLETED'})[operation];
    const fields=({resolve:['sliceDigest'],review:['reviewDigest','sliceDigest'],approveReview:['reviewDigest','decisionDigest'],collect:['requestDigest','receiptDigest']})[operation];
    explanation.evidence=Object.fromEntries(fields.map(key=>[key,data[key]]));if(operation==='collect')explanation.origin=data.origin;
  }
  const sdk=`export function planExpertTurn(text,payload){return {text,payload};}
export async function executeExpertTurn(p,t,decision){
 if(${JSON.stringify(behavior)}==='wrong-call')return t.invoke('evopilot_semantic_execution_completeGoal',{});
 await t.invoke('evopilot_semantic_execution_capabilities',{projectId:p.payload.projectId});
 const r=await t.invoke('evopilot_semantic_execution_${operation}',p.payload);
 if(${JSON.stringify(behavior)}==='substitute')r.response.data={forged:true};
 if(${JSON.stringify(behavior)}==='extra-call')await t.invoke('evopilot_semantic_execution_${operation}',p.payload);
 return r;
}
export function explainExpertSemanticExecutionResult(){const e=${JSON.stringify(explanation)};if(${JSON.stringify(behavior)}==='false-completion')e.goalCompleted=true;return e;}
`;
  const files=[];for(const [rel,bytes] of Object.entries({'package.json':JSON.stringify({name:'@evopilot/evolution-expert',version:'2.3.0',type:'module'}),'dist/cli.js':'throw Error("CLI fallback forbidden");\n','dist/index.js':sdk})) {
    const name=pkg+'/'+rel;fs.writeFileSync(path.join(root,name),bytes);files.push({path:name,digest:bytesDigest(bytes)});
  }
  const context={schema:'evopilot-installed-expert-execution-sdk-context/v1',product:'expert',version:'2.3.0',installationRoot:root,files,
    artifactSetDigest:probeDigest('synthetic-artifacts'),acceptanceBindingDigest:probeDigest('synthetic-campaign'),probeInputDigest:probeDigest(input)};
  const options=()=>{const contextBytes=Buffer.from(JSON.stringify(context));return {contextBytes,expectedContextDigest:bytesDigest(contextBytes),inputBytes:Buffer.from(JSON.stringify(input))};};
  return {root,input,context,response,capabilities,options};
}

test('installed Expert execution SDK fixed turns and independently observed replies',async t=>{
  const packet=await sourcePacket(t);
  for(const operation of ['resolve','review','approveReview','dispatch','collect','evaluate'])await t.test(operation,async t=>{
    const f=sdkToy(t,packet,operation),calls=[],effects=[];
    const result=await runInstalledExpertExecution({...f.options(),authorizeInvocation:async frame=>{effects.push(frame.effect);frame.call.payload={};return true;},
      invokeMcp:async call=>{calls.push(call);return structuredClone(calls.length===1?f.capabilities:f.response);}});
    assert.equal(result.status,'EXPERT_SDK_EXECUTION_ASSERTIONS_PASSED');assert.equal(result.targetCriteriaClosed,0);assert.equal(result.releaseAuthorized,false);
    assert.equal(result.realHost,'NOT_QUALIFIED');assert.equal(calls.length,2);assert.equal(effects[0],'READ_CAPABILITIES');
  });
  for(const behavior of ['lost','hang','substitute','extra-call','false-completion','inventory-drift'])await t.test('no replay after '+behavior,async t=>{
    const f=sdkToy(t,packet,'dispatch',behavior),calls=[];
    const result=await runInstalledExpertExecution({...f.options(),timeoutMs:behavior==='hang'?1000:30000,authorizeInvocation:async()=>true,
      invokeMcp:async call=>{calls.push(call);if(calls.length===1)return f.capabilities;
        if(behavior==='lost')throw Error('synthetic response lost');if(behavior==='hang')return new Promise(()=>{});
        if(behavior==='inventory-drift')fs.writeFileSync(path.join(f.root,'extra.json'),'{}');return structuredClone(f.response);}});
    assert.equal(result.status,'UNVERIFIED_OUTCOME');assert.equal(result.lastAttemptedOperation,'dispatch');assert.equal(calls.length,2);
  });
  for(const behavior of ['denied','wrong-call','missing-capability','foreign-capability','input-drift','context-schema','decision-drift'])await t.test('reject '+behavior+' before operation',async t=>{
    const f=sdkToy(t,packet,behavior==='decision-drift'?'approveReview':'dispatch',behavior),calls=[];
    if(behavior==='missing-capability')f.capabilities.response.data.operations=['resolve'];
    if(behavior==='foreign-capability')f.capabilities.response.data.projectId='foreign';
    if(behavior==='input-drift')f.input.frame.scope.projectId='foreign';
    if(behavior==='context-schema')f.context.schema='evopilot-installed-expert-sdk-context/v1';
    if(behavior==='decision-drift'){f.input.decision.authorizationDigest=probeDigest('wrong');f.context.probeInputDigest=probeDigest(f.input);}
    await assert.rejects(runInstalledExpertExecution({...f.options(),authorizeInvocation:async()=>behavior!=='denied',
      invokeMcp:async call=>{calls.push(call);return f.capabilities;}}));
    assert.ok(calls.length<=1);assert.ok(calls.every(c=>c.tool.endsWith('_capabilities')));
  });
});

test('real compiled Expert SDK verifies every semantic execution turn through the isolated worker',async t=>{
 const packet=await sourcePacket(t);
 for(const operation of ['resolve','review','approveReview','dispatch','collect','evaluate'])await t.test(operation,async t=>{
  const f=sdkToy(t,packet,operation),compiled=stageCompiledExpert(path.dirname(f.root),f.input),context=JSON.parse(compiled.options.contextBytes);
  context.schema='evopilot-installed-expert-execution-sdk-context/v1';const contextBytes=Buffer.from(JSON.stringify(context));const calls=[];
  const result=await runInstalledExpertExecution({...compiled.options,contextBytes,expectedContextDigest:bytesDigest(contextBytes),authorizeInvocation:async()=>true,
   invokeMcp:async call=>{calls.push(call);return structuredClone(calls.length===1?f.capabilities:f.response);}});
  assert.equal(result.status,'EXPERT_SDK_EXECUTION_ASSERTIONS_PASSED',JSON.stringify(result));assert.equal(calls.length,2);
  assert.equal(result.targetCriteriaClosed,0);assert.equal(result.realHost,'NOT_QUALIFIED');assert.equal(result.releaseAuthorized,false);
 });
});

// Real isolated CLI -> HTTP -> source Runtime. The Agent/collector fixture
// remains synthetic, so this validates wiring, not a qualified Host or RC pass.
test('real compiled Runtime CLI executes reviewed dual validation through HTTP',async t=>{
 const {stageCompiledRuntime}=await import('../helpers/isolated-compiled-runtime.mjs');
 const {createServer}=await import('../../packages/server/dist/index.js');
 for(const failure of [undefined,'businessFail','harnessFail','lostDispatch'])await t.test(failure??'both-pass',async t=>{
  const f=await stageCompletionFixture(t,{application:true,...(failure?{[failure]:true}:{})});
  const server=createServer({dataRoot:f.configuration.dataRoot,runtimeMode:'debug',llmClient:{},allowSampleData:false,autoRegisterProfileProject:false,
   harnessRegistryConfig:f.configuration.registryConfigPath,semanticCatalogPolicyPath:f.configuration.policyPath,semanticExecutorAdapter:f.adapter,semanticEvidenceCollector:{...f.collector,collect:async request=>({...await f.collector.collect(request),observedAt:new Date().toISOString()})},
   tokens:[{name:f.access.principal.id,token:'synthetic-operator',role:'operator',tenantId:f.scope.tenantId,workspaceId:f.scope.workspaceId}]});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const origin=`http://127.0.0.1:${server.address().port}`,base=origin+`/api/v1/projects/${f.scope.projectId}/semantic-execution/`;
  async function post(op,payload){const r=await fetch(base+op,{method:'POST',headers:{authorization:'Bearer synthetic-operator','content-type':'application/json'},body:JSON.stringify(payload)});const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body.data;}
  await post('prepare',{identity:f.identity,runId:f.run.id,requestDigest:f.run.pendingExecution.requestDigest,goalTarget:f.state.goalTarget,contextPlan:f.state.contextPlan,outcomePlan:f.state.outcomePlan,selections:f.selected});
  const binding=await post('bind',{identity:f.identity}),bound={identity:f.identity,bindingDigest:binding.bindingDigest};
  const slice=await post('resolve',bound),review=await post('review',{...bound,coverage:f.source.acceptanceCriteria.map(c=>({criterionDigest:c.criterionDigest,ruleIds:['units']}))});
  const input={frame:executionProbeFrame(f,binding,slice,review,failure),decision:{decision:'APPROVE',reviewDigest:review.reviewDigest,principalId:f.access.principal.id}};
  let cliOrigin=origin,dispatchRequests=0;
  if(failure==='lostDispatch'){
   const {createServer:proxyServer}=await import('node:http');
   const proxy=proxyServer(async(req,res)=>{
    try{let body='';for await(const chunk of req)body+=chunk;
     const upstream=await fetch(origin+req.url,{method:req.method,headers:{authorization:'Bearer synthetic-operator','content-type':'application/json'},...(body?{body}:{})});
     const response=await upstream.text();
     if(req.method==='POST'&&req.url.endsWith('/dispatch')){dispatchRequests++;assert.equal(upstream.status,200);res.destroy();return;}
     res.writeHead(upstream.status,{'content-type':'application/json',...(upstream.headers.get('x-request-id')?{'x-request-id':upstream.headers.get('x-request-id')}:{})});res.end(response);
    }catch{res.destroy();}
   });
   await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{proxy.closeAllConnections();proxy.close(resolve);}));
   cliOrigin=`http://127.0.0.1:${proxy.address().port}`;
  }
  const options=stageCompiledRuntime(f.root,input,cliOrigin,'synthetic-operator'),operations=[];
  const result=await runInstalledExecution({...options,authorizeInvocation:async frame=>{operations.push(frame.operation);return true;}});
  if(failure==='lostDispatch'){
   assert.equal(result.status,'UNVERIFIED_OUTCOME',JSON.stringify(result));assert.equal(result.lastAttemptedOperation,'dispatch');
   assert.equal(dispatchRequests,1);assert.equal(f.calls(),1);assert.equal(result.targetCriteriaClosed,0);assert.equal(result.releaseAuthorized,false);
   assert.deepEqual(operations,['resolve','review','approveReview','dispatch']);return;
  }
  assert.equal(result.status,'EXECUTION_SUBJOURNEY_ASSERTIONS_PASSED',JSON.stringify(result));assert.equal(result.targetCriteriaClosed,0);
  assert.deepEqual(operations,['resolve','review','approveReview','dispatch','collect','evaluate']);assert.equal(f.calls(),1);assert.equal(result.releaseAuthorized,false);
 });
});
