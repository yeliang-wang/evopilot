import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {semanticTerminalFixture} from '../helpers/semantic-terminal-fixture.mjs';
import {runInstalledExpertRecovery} from './versions/run-installed-expert-recovery.mjs';
import {verifyInstalledExpertRecoverySdk,verifyInstalledExpertExecutionSdk,verifyInstalledExpertSdk,bytesDigest} from './versions/installed-transport.mjs';
import {probeDigest} from './versions/probe-session.mjs';

async function sourcePacket(t,remaining=false){
  const f=await semanticTerminalFixture(t,{goalCompletionPolicy:true,beforeSource:g=>{
    delete g.terminalMaturity;g.plan.phaseTargets=[];
    if(remaining)g.plan.targets.push({...g.plan.targets[0],id:'remaining-target',status:'READY'});
  }});
  const goalFile=path.join(f.configuration.dataRoot,'goals',f.identity.goalId+'.json');
  const frame={scope:f.scope,identity:f.identity,runId:f.run.id,completedBy:f.access.currentAccess().principal.id,
    targets:JSON.parse(fs.readFileSync(goalFile)).plan.targets.map(({id,required})=>({targetId:id,required}))};
  await f.app.completeTarget(f.value,f.access);const restarted=f.restart();
  return {frame,replies:{completionReceipt:restarted.completionReceipt(f.value,f.access),completionStatus:restarted.completionStatus(f.value,f.access)}};
}
const envelope=(op,data)=>({schema:'evopilot-mcp-http-result/v1',tool:'evopilot_semantic_execution_'+op,ok:true,status:200,
  requestId:'synthetic-http-'+op,response:{data}});

// A disposable toy SDK, not an installed release or a real Host. Source
// application receipts supply realistic wire shapes, not business evidence.
function toy(t,packet,behavior='normal'){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'expert-recovery-toy-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const root=path.join(temp,'installation'),pkg='node_modules/@evopilot/evolution-expert';fs.mkdirSync(path.join(root,pkg,'dist'),{recursive:true});
  const input={frame:structuredClone(packet.frame)},responses=Object.fromEntries(Object.entries(packet.replies).map(([op,r])=>[op,envelope(op,structuredClone(r))]));
  const capabilities=envelope('capabilities',{schema:'evopilot-semantic-execution-capabilities/v1',projectId:input.frame.scope.projectId,
    operations:['completionReceipt','completionStatus'],authority:'RUNTIME_CURRENT_SCOPED_PRINCIPAL',adapterConfigured:false,collectorConfigured:false,
    completionAvailable:true,completionScope:'VALIDATED_TARGET_AND_NON_PHASE_GOAL',phaseTargetCompletionAvailable:false,phaseCompletionAvailable:false,
    goalCompletionAvailable:false,releaseAvailable:false,qualification:'REVALIDATE_PER_REQUEST'});
  const code=`import assert from 'node:assert/strict';
assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.EVOPILOT_API_TOKEN,undefined);
const behavior=${JSON.stringify(behavior)};
if(behavior==='worker-error')throw Error('synthetic import failure');
if(behavior==='worker-hang')await new Promise(()=>setInterval(()=>{},1000));
export function planExpertTurn(text,payload){return {op:text.split(' ').at(-1),payload};}
export async function executeExpertTurn(p,t){
 if(behavior==='wrong-call')return t.invoke('evopilot_semantic_execution_completeGoal',{});
 if(behavior==='concurrent')return Promise.all([t.invoke('evopilot_semantic_execution_capabilities',{projectId:p.payload.projectId}),t.invoke('evopilot_semantic_execution_completeTarget',{})]);
 await t.invoke('evopilot_semantic_execution_capabilities',{projectId:p.payload.projectId});
 if(behavior==='changed-payload')p.payload.payload.runId='foreign';
 const r=await t.invoke('evopilot_semantic_execution_'+p.op,p.payload);
 if(behavior==='extra-call')await t.invoke('evopilot_semantic_execution_'+p.op,p.payload);
 if(behavior==='substitute')r.response.data={forged:true};return r;
}
export function explainExpertSemanticExecutionResult(op,r){
 const data=r.response.data,s={schema:'evopilot-expert-semantic-execution-explanation/v1',requestId:r.requestId,canExecute:false,canComplete:false,
  releaseAuthorized:false,published:false,goalCompleted:false,nextAction:'synthetic-read-only'};
 if(op==='completionReceipt'){s.status='RECEIPT_RECORDED';s.evidence={receiptDigest:data.receiptDigest};}
 else{for(const key of ['status','progress','blockers','targets','reportDigest','release'])s[key]=data[key];s.goalCompleted=data.progress.goalCompleted;}
 if(behavior==='false-goal')s.goalCompleted=!s.goalCompleted;
 if(behavior==='false-authority')s.canComplete=true;
 if(behavior==='false-request')s.requestId='foreign';
 return s;
}
`;
  const files=[];for(const [rel,bytes] of Object.entries({'package.json':JSON.stringify({name:'@evopilot/evolution-expert',version:'2.3.0',type:'module'}),
    'dist/cli.js':'throw Error("CLI fallback forbidden");\n','dist/index.js':code})){
    const name=pkg+'/'+rel;fs.writeFileSync(path.join(root,name),bytes);files.push({path:name,digest:bytesDigest(bytes)});
  }
  const context={schema:'evopilot-installed-expert-recovery-sdk-context/v1',product:'expert',version:'2.3.0',installationRoot:root,files,
    artifactSetDigest:probeDigest('synthetic-artifacts'),acceptanceBindingDigest:probeDigest('synthetic-campaign'),probeInputDigest:probeDigest(input)};
  const options=()=>{const contextBytes=Buffer.from(JSON.stringify(context));return {contextBytes,expectedContextDigest:bytesDigest(contextBytes),inputBytes:Buffer.from(JSON.stringify(input))};};
  return {root,input,context,responses,capabilities,options,sdk:path.join(root,pkg,'dist/index.js')};
}
const response=(f,call)=>structuredClone(call.tool.endsWith('_capabilities')?f.capabilities:f.responses[call.tool.slice('evopilot_semantic_execution_'.length)]);
const tools=['capabilities','completionReceipt','capabilities','completionStatus'].map(op=>'evopilot_semantic_execution_'+op);

test('Expert recovery SDK verifies two independent presentations without mutation or authority (toy SDK)',async t=>{
  const packet=await sourcePacket(t);
  for(const pending of [false,true])await t.test('preserves '+(pending?'pending':'completed')+' Goal status',async t=>{
    const f=toy(t,pending?await sourcePacket(t,true):packet),calls=[],effects=[];
    const result=await runInstalledExpertRecovery({...f.options(),authorizeInvocation:async frame=>{effects.push(frame.effect);frame.call.payload={};return true;},
      invokeMcp:async call=>{calls.push(call);return response(f,call);}});
    assert.equal(result.status,'EXPERT_SDK_RECOVERY_ASSERTIONS_PASSED');assert.equal(result.observedGoalStatus,pending?'PARTIAL':'COMPLETED');
    assert.equal(result.mutationsIssued,0);assert.equal(result.targetCriteriaClosed,0);assert.equal(result.releaseAuthorized,false);assert.equal(result.realHost,'NOT_QUALIFIED');
    assert.equal(result.presentations.length,2);assert.equal(result.installation.grantsAuthority,false);assert.deepEqual(calls.map(c=>c.tool),tools);
    assert.deepEqual(result.events.map(event=>event.requestId),['capabilities','completionReceipt','capabilities','completionStatus'].map(op=>'synthetic-http-'+op));
    assert.deepEqual(effects,['READ_CAPABILITIES','READ_RECOVERY_EVIDENCE','READ_CAPABILITIES','READ_RECOVERY_EVIDENCE']);
  });
  for(const behavior of ['wrong-call','concurrent','changed-payload','extra-call','substitute','false-goal','false-authority','false-request','worker-error','worker-hang'])await t.test('reject SDK '+behavior,async t=>{
    const f=toy(t,packet,behavior),calls=[];
    await assert.rejects(runInstalledExpertRecovery({...f.options(),timeoutMs:behavior==='worker-hang'?1000:30000,authorizeInvocation:async()=>true,
      invokeMcp:async call=>{calls.push(call);return response(f,call);}}));
    assert.ok(calls.length<=2);assert.deepEqual(calls.map(c=>c.tool),tools.slice(0,calls.length));
  });
  for(const at of [1,2,3,4])for(const behavior of ['denied','abort','inventory-drift'])await t.test(`authorization ${at} stops ${behavior}`,async t=>{
    const f=toy(t,packet),calls=[],c=new AbortController();let seen=0;
    await assert.rejects(runInstalledExpertRecovery({...f.options(),signal:c.signal,authorizeInvocation:async()=>{
      if(++seen!==at)return true;if(behavior==='denied')return false;if(behavior==='abort')c.abort();
      if(behavior==='inventory-drift')fs.appendFileSync(f.sdk,'\n');return true;
    },invokeMcp:async call=>{calls.push(call);return response(f,call);}}));
    assert.equal(seen,at);assert.deepEqual(calls.map(c=>c.tool),tools.slice(0,at-1));
  });
  for(const at of [1,3])for(const behavior of ['missing','foreign','release'])await t.test(`capability ${at} rejects ${behavior}`,async t=>{
    const f=toy(t,packet),calls=[];
    await assert.rejects(runInstalledExpertRecovery({...f.options(),authorizeInvocation:async()=>true,invokeMcp:async call=>{
      calls.push(call);const r=response(f,call);if(calls.length===at){if(behavior==='missing')r.response.data.operations=[];
        if(behavior==='foreign')r.response.data.projectId='foreign';if(behavior==='release')r.response.data.releaseAvailable=true;}return r;
    }}));assert.deepEqual(calls.map(c=>c.tool),tools.slice(0,at));
  });
  for(const [at,behavior] of [[1,'auth-hang'],[4,'auth-hang'],[2,'read-hang'],[4,'read-hang'],[2,'lost'],[4,'lost'],[4,'response-drift']])await t.test(`bounded transport ${at} ${behavior}`,async t=>{
    const f=toy(t,packet),calls=[];let auth=0;
    await assert.rejects(runInstalledExpertRecovery({...f.options(),timeoutMs:behavior.includes('hang')?1000:30000,authorizeInvocation:async()=>{
      if(++auth===at&&behavior==='auth-hang')return new Promise(()=>{});return true;
    },invokeMcp:async call=>{calls.push(call);if(calls.length===at){if(behavior==='lost')throw Error('synthetic disconnect');
      if(behavior==='read-hang')return new Promise(()=>{});if(behavior==='response-drift')fs.writeFileSync(path.join(f.root,'extra.json'),'{}');}return response(f,call);}}));
    assert.deepEqual(calls.map(c=>c.tool),tools.slice(0,behavior==='auth-hang'?at-1:at));
  });
  for(const behavior of ['context','input','schema','version','extra-file','symlink','foreign-frame','extra-operation'])await t.test('preflight '+behavior+' never invokes MCP',async t=>{
    const f=toy(t,packet);let override={};
    if(behavior==='context')override.expectedContextDigest=probeDigest('wrong');if(behavior==='input')f.input.frame.runId='wrong';
    if(behavior==='schema')f.context.schema='evopilot-installed-expert-execution-sdk-context/v1';if(behavior==='version')f.context.version='2.2.1';
    if(behavior==='extra-file')fs.writeFileSync(path.join(f.root,'extra.json'),'{}');if(behavior==='symlink')fs.symlinkSync(f.sdk,path.join(f.root,'link.js'));
    if(behavior==='foreign-frame'){f.input.frame.scope.projectId='foreign';f.context.probeInputDigest=probeDigest(f.input);}
    if(behavior==='extra-operation'){f.input.operation='completeTarget';f.context.probeInputDigest=probeDigest(f.input);}
    let auth=0,calls=0;await assert.rejects(runInstalledExpertRecovery({...f.options(),...override,authorizeInvocation:async()=>{auth++;return true;},invokeMcp:async()=>{calls++;}}));
    assert.equal(auth,0);assert.equal(calls,0);
  });
  for(const [name,mutate] of Object.entries({principal:p=>{p.replies.completionReceipt.completedBy='foreign';},scope:p=>{p.replies.completionReceipt.scope.workspaceId='foreign';},
    link:p=>{p.replies.completionStatus.targets[0].receiptDigest=probeDigest('forged');},release:p=>{p.replies.completionStatus.release.authorized=true;},
    authority:p=>{p.replies.completionStatus.authority.mayDispatch=true;},progress:p=>{p.replies.completionStatus.progress.targetPercent=50;}}))await t.test('independent readback rejects rehashed '+name,async t=>{
    const p=structuredClone(packet);mutate(p);
    for(const [op,key] of [['completionReceipt','receiptDigest'],['completionStatus','reportDigest']]){const {[key]:ignored,...body}=p.replies[op];p.replies[op][key]=probeDigest(body);}
    const f=toy(t,p),calls=[];await assert.rejects(runInstalledExpertRecovery({...f.options(),authorizeInvocation:async()=>true,invokeMcp:async call=>{calls.push(call);return response(f,call);}}));
    assert.deepEqual(calls.map(c=>c.tool),tools);
  });
  await t.test('identity exposes no executor and cannot be reused by other SDK contexts',t=>{
    const f=toy(t,packet),options={...f.options(),sourceRoot:path.resolve('.')};assert.equal(verifyInstalledExpertRecoverySdk(options).invoke,undefined);
    assert.throws(()=>verifyInstalledExpertExecutionSdk(options));assert.throws(()=>verifyInstalledExpertSdk(options));
    assert.throws(()=>verifyInstalledExpertRecoverySdk({...options,executionMode:true}));
  });
  await t.test('already cancelled request cannot authorize',async t=>{
    const f=toy(t,packet),c=new AbortController();c.abort();let count=0;
    await assert.rejects(runInstalledExpertRecovery({...f.options(),signal:c.signal,authorizeInvocation:async()=>{count++;return true;},invokeMcp:async()=>{count++;}}));assert.equal(count,0);
  });
});
