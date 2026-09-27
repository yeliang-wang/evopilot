import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {semanticTerminalFixture} from '../helpers/semantic-terminal-fixture.mjs';
import {runInstalledRecovery,recoveryCliResult} from './versions/run-installed-recovery.mjs';
import {verifyInstalledRuntimeRecovery,verifyInstalledRuntimeExecution,createInstalledProbeTransport,bytesDigest} from './versions/installed-transport.mjs';
import {probeDigest} from './versions/probe-session.mjs';

async function sourcePacket(t,remaining=false) {
  const f=await semanticTerminalFixture(t,{goalCompletionPolicy:true,beforeSource:g=>{
    delete g.terminalMaturity;g.plan.phaseTargets=[];
    if(remaining)g.plan.targets.push({...g.plan.targets[0],id:'remaining-target',status:'READY'});
  }});
  const goalFile=path.join(f.configuration.dataRoot,'goals',f.identity.goalId+'.json');
  const frame={scope:f.scope,identity:f.identity,runId:f.run.id,completedBy:f.access.currentAccess().principal.id,
    targets:JSON.parse(fs.readFileSync(goalFile)).plan.targets.map(({id,required})=>({targetId:id,required}))};
  await f.app.completeTarget(f.value,f.access);
  const restarted=f.restart();
  return {frame,replies:{completionReceipt:restarted.completionReceipt(f.value,f.access),completionStatus:restarted.completionStatus(f.value,f.access)}};
}

// Disposable toy executable, never an installed product or qualified Host.
// Real source application receipts seed wire shapes; the child only returns
// fixture data. Its call log is outside the attested installation tree.
function toy(t,packet,behavior='normal') {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-bridge-toy-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const root=path.join(temp,'installation'),pkg='node_modules/@evopilot/cli',log=path.join(temp,'calls.jsonl');
  fs.mkdirSync(path.join(root,pkg,'dist'),{recursive:true});
  const {frame,replies}=structuredClone(packet),input={frame},payload={identity:frame.identity,runId:frame.runId};
  const code=`import fs from 'node:fs';import assert from 'node:assert/strict';
const args=process.argv.slice(2),op=args[2],file=args[5],data=${JSON.stringify(replies)}[op];
assert.deepEqual(args.slice(0,2),['project','execution']);assert.ok(['completionReceipt','completionStatus'].includes(op));
assert.equal(args[3],${JSON.stringify(frame.scope.projectId)});assert.equal(args[4],'--file');assert.equal(args[6],'--json');
assert.deepEqual(JSON.parse(fs.readFileSync(file)),${JSON.stringify(payload)});assert.equal(fs.statSync(file).mode&0o077,0);
assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.EVOPILOT_API_TOKEN,undefined);
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({operation:op,file})+'\\n');
const behavior=${JSON.stringify(behavior)};
if(op==='completionReceipt'){
 if(behavior==='hang')await new Promise(()=>setInterval(()=>{},1000));
 if(behavior==='lost'){console.error('synthetic transport failure');process.exit(1);}
 if(behavior==='input-drift')fs.writeFileSync(file,'{}');
 if(behavior==='inventory-drift')fs.writeFileSync(new URL('extra.json',import.meta.url),'{}');
 if(behavior==='bad-json'){console.log('not-json');process.exit(0);}
 if(behavior==='stderr')console.error('synthetic warning');
}
console.log(JSON.stringify({...data,requestId:'synthetic-http-'+op}));
`;
  const files=[];for(const [rel,bytes] of Object.entries({'package.json':JSON.stringify({name:'@evopilot/cli',version:'6.3.0',type:'module'}),'dist/index.js':code})){
    const name=pkg+'/'+rel;fs.writeFileSync(path.join(root,name),bytes);files.push({path:name,digest:bytesDigest(bytes)});
  }
  const configFile=path.join(temp,'runtime-config.json');fs.writeFileSync(configFile,'{}',{mode:0o600});
  const context={schema:'evopilot-installed-runtime-recovery-context/v1',product:'runtime',version:'6.3.0',installationRoot:root,files,
    artifactSetDigest:probeDigest('synthetic-artifacts'),acceptanceBindingDigest:probeDigest('synthetic-campaign'),probeInputDigest:probeDigest(input),
    configFile,configDigest:bytesDigest('{}'),server:'http://127.0.0.1:12345'};
  const options=()=>{const contextBytes=Buffer.from(JSON.stringify(context));return {contextBytes,expectedContextDigest:bytesDigest(contextBytes),inputBytes:Buffer.from(JSON.stringify(input))};};
  const calls=()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  const clean=()=>{for(const call of calls()){assert.equal(fs.existsSync(call.file),false);assert.equal(fs.existsSync(path.dirname(call.file)),false);}};
  return {temp,root,context,input,options,calls,clean,cli:path.join(root,pkg,'dist/index.js')};
}

test('recovery installation connection is read-only, exact-bound and fail-closed (toy processes)',async t=>{
  const packet=await sourcePacket(t);
  for(const remaining of [false,true])await t.test('exact two reads retain '+(remaining?'pending Goal':'completed Goal')+' without Release',async t=>{
    const f=toy(t,remaining?await sourcePacket(t,true):packet),frames=[];
    const result=await runInstalledRecovery({...f.options(),authorizeInvocation:async frame=>{frames.push(structuredClone(frame));frame.projectId='forged';return true;}});
    assert.equal(result.status,'READ_ONLY_RECOVERY_ASSERTIONS_PASSED');assert.equal(result.observedGoalStatus,remaining?'PARTIAL':'COMPLETED');
    assert.equal(result.mutationsIssued,0);assert.equal(result.targetCriteriaClosed,0);assert.equal(result.releaseAuthorized,false);
    assert.equal(result.realHost,'NOT_QUALIFIED');assert.equal(result.installation.grantsAuthority,false);
    assert.deepEqual(f.calls().map(c=>c.operation),['completionReceipt','completionStatus']);
    assert.deepEqual(frames.map(x=>x.effect),['READ_RECOVERY_EVIDENCE','READ_RECOVERY_EVIDENCE']);assert.equal(result.authorizations.length,2);
    for(const frame of frames){assert.equal(frame.contextDigest,f.options().expectedContextDigest);assert.equal(frame.inputDigest,f.context.probeInputDigest);assert.equal(frame.acceptanceBindingDigest,f.context.acceptanceBindingDigest);}
    f.clean();
  });
  for(const behavior of ['lost','hang','input-drift','inventory-drift','bad-json','stderr'])await t.test('stop after first read, no replay: '+behavior,async t=>{
    const f=toy(t,packet,behavior);
    await assert.rejects(runInstalledRecovery({...f.options(),timeoutMs:behavior==='hang'?1500:30000,authorizeInvocation:async()=>true}));
    assert.deepEqual(f.calls().map(c=>c.operation),['completionReceipt']);f.clean();
  });
  for(const at of [1,2])for(const behavior of ['denied','hang','abort','inventory-drift','config-drift'])await t.test(`authorization ${at} stops ${behavior}`,async t=>{
    const f=toy(t,packet),controller=new AbortController();let seen=0;
    await assert.rejects(runInstalledRecovery({...f.options(),signal:controller.signal,timeoutMs:behavior==='hang'?1500:30000,authorizeInvocation:async()=>{
      if(++seen!==at)return true;
      if(behavior==='denied')return false;if(behavior==='hang')return new Promise(()=>{});
      if(behavior==='abort')controller.abort();if(behavior==='inventory-drift')fs.appendFileSync(f.cli,'\n');
      if(behavior==='config-drift')fs.writeFileSync(f.context.configFile,'{"changed":true}');return true;
    }}));assert.equal(seen,at);assert.deepEqual(f.calls().map(c=>c.operation),at===1?[]:['completionReceipt']);f.clean();
  });
  for(const behavior of ['context','input','schema','version','extra-file','symlink','config-mode','origin','foreign-frame','extra-operation'])await t.test('preflight denies '+behavior,async t=>{
    const f=toy(t,packet);let override={};
    if(behavior==='context')override.expectedContextDigest=probeDigest('wrong');
    if(behavior==='input')f.input.frame.runId='wrong';
    if(behavior==='schema')f.context.schema='evopilot-installed-runtime-execution-context/v1';
    if(behavior==='version')f.context.version='6.2.0';
    if(behavior==='extra-file')fs.writeFileSync(path.join(f.root,'extra.json'),'{}');
    if(behavior==='symlink')fs.symlinkSync(f.cli,path.join(f.root,'link.js'));
    if(behavior==='config-mode')fs.chmodSync(f.context.configFile,0o644);
    if(behavior==='origin')f.context.server='http://remote.example.test';
    if(behavior==='foreign-frame'){f.input.frame.scope.projectId='foreign';f.context.probeInputDigest=probeDigest(f.input);}
    if(behavior==='extra-operation'){f.input.operation='completeTarget';f.context.probeInputDigest=probeDigest(f.input);}
    let authorized=0;await assert.rejects(runInstalledRecovery({...f.options(),...override,authorizeInvocation:async()=>{authorized++;return true;}}));
    assert.equal(authorized,0);assert.deepEqual(f.calls(),[]);
  });
  for(const [name,mutate] of Object.entries({principal:p=>{p.replies.completionReceipt.completedBy='foreign';},scope:p=>{p.replies.completionReceipt.scope.tenantId='foreign';},
    link:p=>{p.replies.completionStatus.targets[0].receiptDigest=probeDigest('forged');},release:p=>{p.replies.completionStatus.release.authorized=true;},
    authority:p=>{p.replies.completionStatus.authority.mayDispatch=true;},progress:p=>{p.replies.completionStatus.progress.targetPercent=50;}}))await t.test('independent oracle rejects rehashed '+name,async t=>{
    const p=structuredClone(packet);mutate(p);
    for(const [operation,key] of [['completionReceipt','receiptDigest'],['completionStatus','reportDigest']]){
      const {[key]:ignored,...body}=p.replies[operation];p.replies[operation][key]=probeDigest(body);
    }
    const f=toy(t,p);await assert.rejects(runInstalledRecovery({...f.options(),authorizeInvocation:async()=>true}));
    assert.deepEqual(f.calls().map(c=>c.operation),['completionReceipt','completionStatus']);f.clean();
  });
  await t.test('recovery identity exposes no executor; contexts cannot be interchanged',t=>{
    const f=toy(t,packet),options={...f.options(),sourceRoot:path.resolve('.')};
    assert.equal(verifyInstalledRuntimeRecovery(options).invoke,undefined);
    assert.throws(()=>verifyInstalledRuntimeExecution(options));assert.throws(()=>createInstalledProbeTransport(options));
    assert.throws(()=>verifyInstalledRuntimeRecovery({...options,sdkMode:true}));
  });
  await t.test('already cancelled invocation never authorizes or launches',async t=>{
    const f=toy(t,packet),c=new AbortController();c.abort();let seen=0;
    await assert.rejects(runInstalledRecovery({...f.options(),signal:c.signal,authorizeInvocation:async()=>{seen++;return true;}}));assert.equal(seen,0);assert.deepEqual(f.calls(),[]);
  });
});

test('recovery CLI decoder never accepts mutation operations or ambiguous process output',()=>{
  for(const op of ['completionReceipt','completionStatus'])assert.deepEqual(recoveryCliResult(op,0,'{"requestId":"http-1","status":"sample"}',''),{requestId:'http-1',data:{status:'sample'}});
  for(const [op,code,stdout,stderr] of [['completeTarget',0,'{}',''],['dispatch',0,'{}',''],['completionStatus',1,'{}',''],
    ['completionReceipt',0,'{"requestId":"http-1"}','warning'],['completionReceipt',0,'[]',''],['completionReceipt',0,'{}',''],
    ['completionReceipt',0,'not-json',''],['completionReceipt',0,'',''],['completionReceipt',0,'x'.repeat(1048577),'']])assert.throws(()=>recoveryCliResult(op,code,stdout,stderr));
});
