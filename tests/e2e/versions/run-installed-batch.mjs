import {runInstalledExpertLifecycle} from './run-installed-expert-lifecycle.mjs';
import {runInstalledExpertGuidance} from './run-installed-expert-guidance.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {exactKeys,isDigest,isId,probeDigest} from './probe-session.mjs';
import {bytesDigest,createInstalledProbeTransport,createInstalledBindingTransport,createInstalledTransitionTransport,
  verifyInstalledExpertSdk,verifyInstalledExpertExecutionSdk,verifyInstalledExpertRecoverySdk,
  verifyInstalledRuntimeExecution,verifyInstalledRuntimeRecovery} from './installed-transport.mjs';
import {runRuntimeDiscoveryProbe} from './runtime/6.3.0/discovery-probe.mjs';
import {runExpertDeclarationProbe} from './expert/2.3.0/declaration-probe.mjs';
import {runInstalledCapability} from './run-installed-capability.mjs';
import {runInstalledRefusal} from './run-installed-refusal.mjs';
import {runInstalledBinding} from './run-installed-binding.mjs';
import {runInstalledTransition} from './run-installed-transition.mjs';
import {runInstalledExecution} from './run-installed-execution.mjs';
import {runInstalledRecovery} from './run-installed-recovery.mjs';
import {runInstalledExpertBinding} from './run-installed-expert-binding.mjs';
import {runInstalledExpertExecution} from './run-installed-expert-execution.mjs';
import {runInstalledExpertProject,runInstalledExpertProjectReadback} from './run-installed-expert-project.mjs';
import {runInstalledExpertRecovery} from './run-installed-expert-recovery.mjs';
import {planPath,validateCasePlan} from '../../../scripts/validate-semantic-convergence-corpus.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
const deny=async()=>false;
const readOnly=options=>createInstalledProbeTransport(options);
const runners=Object.freeze({
  'runtime-discovery':{product:'runtime',verify:readOnly,passed:['PROBE_ASSERTIONS_PASSED'],run:async o=>{
    const input=JSON.parse(o.inputBytes);exactKeys(input,['selection','scope']);
    const transport=readOnly({...o,sourceRoot:root});return {...await runRuntimeDiscoveryProbe({...input,invoke:transport.invoke,signal:o.signal,timeoutMs:o.timeoutMs}),installation:transport.identity};}},
  'expert-declaration':{product:'expert',verify:readOnly,passed:['PROBE_ASSERTIONS_PASSED'],run:async o=>{
    exactKeys(JSON.parse(o.inputBytes),[]);const transport=readOnly({...o,sourceRoot:root});
    return {...await runExpertDeclarationProbe({invoke:transport.invoke,signal:o.signal,timeoutMs:o.timeoutMs}),installation:transport.identity};}},
  'runtime-capability':{product:'runtime',verify:o=>createInstalledProbeTransport({...o,capabilityMode:true}),passed:['CAPABILITY_STOP_SUBCASE_ASSERTIONS_PASSED'],run:runInstalledCapability},
  'runtime-refusal':{product:'runtime',verify:o=>createInstalledProbeTransport({...o,refusalMode:true}),passed:['REFUSAL_SUBCASE_ASSERTIONS_PASSED'],run:runInstalledRefusal},
  'runtime-binding':{product:'runtime',verify:o=>createInstalledBindingTransport({...o,authorizeInvocation:deny}),passed:['BINDING_SUBJOURNEY_ASSERTIONS_PASSED'],run:runInstalledBinding},
  'runtime-transition':{product:'runtime',verify:o=>createInstalledTransitionTransport({...o,authorizeInvocation:deny}),passed:['TRANSITION_SUBJOURNEY_ASSERTIONS_PASSED'],run:runInstalledTransition},
  'runtime-execution':{product:'runtime',verify:verifyInstalledRuntimeExecution,passed:['EXECUTION_SUBJOURNEY_ASSERTIONS_PASSED'],run:runInstalledExecution},
  'runtime-recovery':{product:'runtime',verify:verifyInstalledRuntimeRecovery,passed:['READ_ONLY_RECOVERY_ASSERTIONS_PASSED'],run:runInstalledRecovery},
  'expert-binding':{product:'expert',verify:verifyInstalledExpertSdk,passed:['EXPERT_SDK_BINDING_ASSERTIONS_PASSED','EXPERT_SDK_REFUSAL_ASSERTIONS_PASSED','EXPERT_SDK_CAPABILITY_STOP_ASSERTIONS_PASSED'],run:runInstalledExpertBinding},
  'expert-execution':{product:'expert',verify:verifyInstalledExpertExecutionSdk,passed:['EXPERT_SDK_EXECUTION_ASSERTIONS_PASSED'],run:runInstalledExpertExecution},
  'expert-lifecycle':{product:'expert',verify:verifyInstalledExpertSdk,passed:['LIFECYCLE_STATE_ASSERTIONS_PASSED'],run:runInstalledExpertLifecycle},
  'expert-guidance':{product:'expert',verify:verifyInstalledExpertSdk,passed:['GOVERNED_GUIDANCE_ASSERTIONS_PASSED'],run:runInstalledExpertGuidance},
  'expert-project':{product:'expert',verify:verifyInstalledExpertSdk,passed:['PROJECT_DEFINITION_JOURNEY_ASSERTIONS_PASSED'],run:runInstalledExpertProject},
  'expert-project-readback':{product:'expert',verify:verifyInstalledExpertSdk,passed:['PROJECT_DEFINITION_READBACK_ASSERTIONS_PASSED'],run:runInstalledExpertProjectReadback},
  'expert-recovery':{product:'expert',verify:verifyInstalledExpertRecoverySdk,passed:['EXPERT_SDK_RECOVERY_ASSERTIONS_PASSED'],run:runInstalledExpertRecovery}
});
const bounded=(bytes,limit)=>{assert.ok(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=limit,'BATCH_BYTES_LIMIT');return JSON.parse(bytes);};
const outside=(child,parent)=>{const rel=path.relative(parent,child);assert.ok(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel),'BATCH_JOURNAL_MUST_BE_EXTERNAL');};

/** Mechanical preflight only. Pinned Target hashes and host labels do
 * not prove Candidate provenance or grant effects. No command/module comes from
 * the manifest. Complete RC and inherited coverage remain separately required. */
export function preflightInstalledBatch({planBytes,expectedPlanDigest,materials}) {
  const plan=bounded(planBytes,1048576);assert.ok(isDigest(expectedPlanDigest));assert.equal(bytesDigest(planBytes),expectedPlanDigest,'BATCH_PLAN_DRIFT');
  exactKeys(plan,['schema','id','products','acceptanceBindingDigest','host','steps']);
  assert.equal(plan.schema,'evopilot-installed-subjourney-batch/v1');assert.ok(isId(plan.id)&&isDigest(plan.acceptanceBindingDigest));
  exactKeys(plan.host,['id','version','qualificationDigest']);assert.ok(isId(plan.host.id)&&isId(plan.host.version)&&isDigest(plan.host.qualificationDigest));
  assert.ok(!/workbuddy/i.test(plan.host.id),'WORKBUDDY_AUTOMATION_FORBIDDEN');
  assert.equal(plan.host.id,'Codex','BATCH_CODEX_ONLY_HOST_REQUIRED');
  assert.ok(Array.isArray(plan.products)&&plan.products.length>0&&plan.products.length<=2);
  assert.equal(new Set(plan.products.map(p=>p.product)).size,plan.products.length,'BATCH_DUPLICATE_PRODUCT');
  const corpora=new Map();
  for(const p of plan.products){exactKeys(p,['product','version','targetDigest','artifactSetDigest']);assert.ok(['runtime','expert'].includes(p.product)&&isDigest(p.artifactSetDigest));
    const corpus=JSON.parse(fs.readFileSync(path.join(root,planPath(p.product))));
    assert.equal(p.version,corpus.version);assert.equal(p.targetDigest,corpus.target.fileDigest);
    validateCasePlan(p.product,corpus);corpora.set(p.product,corpus);}
  assert.ok(Array.isArray(plan.steps)&&plan.steps.length>0&&plan.steps.length<=2048,'BATCH_STEP_LIMIT');
  assert.ok(Array.isArray(materials)&&materials.length===plan.steps.length,'BATCH_MATERIAL_COVERAGE');
  assert.equal(new Set(materials.map(m=>m.id)).size,materials.length,'BATCH_DUPLICATE_MATERIAL');
  assert.equal(new Set(plan.steps.map(s=>s.id)).size,plan.steps.length,'BATCH_DUPLICATE_STEP');
  for(const m of materials)exactKeys(m,['id','contextBytes','inputBytes']);
  for(const step of plan.steps){
    exactKeys(step,['id','product','caseId','variantId','runner','contextDigest','inputDigest']);
    assert.ok(isId(step.id)&&isDigest(step.contextDigest)&&isDigest(step.inputDigest));
    assert.ok(Object.hasOwn(runners,step.runner),'BATCH_RUNNER_DENIED');assert.equal(runners[step.runner].product,step.product,'BATCH_PRODUCT_SUBSTITUTION');
    const corpus=corpora.get(step.product),c=corpus?.cases.find(c=>c.id===step.caseId);assert.ok(c?.machineVariants.some(v=>v.id===step.variantId),'BATCH_VARIANT_UNKNOWN');
    const variant=c.machineVariants.find(v=>v.id===step.variantId);
    assert.deepEqual(c.hosts,['Codex'],'BATCH_CASE_HOST_SCOPE_DRIFT');
    assert.deepEqual(variant.hosts,['Codex'],'BATCH_VARIANT_HOST_SCOPE_DRIFT');
    const material=materials.find(m=>m.id===step.id);assert.ok(material,'BATCH_MATERIAL_MISSING');
    const context=bounded(material.contextBytes,8388608),input=bounded(material.inputBytes,4194304);
    assert.equal(bytesDigest(material.contextBytes),step.contextDigest,'BATCH_CONTEXT_DRIFT');assert.equal(bytesDigest(material.inputBytes),step.inputDigest,'BATCH_INPUT_DRIFT');
    assert.equal(context.probeInputDigest,probeDigest(input));assert.equal(context.product,step.product);
    assert.equal(context.artifactSetDigest,plan.products.find(p=>p.product===step.product).artifactSetDigest,'BATCH_ARTIFACT_SUBSTITUTION');
    assert.equal(context.acceptanceBindingDigest,plan.acceptanceBindingDigest,'BATCH_ACCEPTANCE_SUBSTITUTION');
    runners[step.runner].verify({contextBytes:material.contextBytes,expectedContextDigest:step.contextDigest,sourceRoot:root});
  }
  return {schema:'evopilot-installed-batch-preflight/v1',status:'MECHANICAL_BINDINGS_VERIFIED',planDigest:expectedPlanDigest,steps:plan.steps.length,
    plannedVariants:[...new Set(plan.steps.map(s=>s.product+':'+s.variantId))],externalTarget:'REQUIRES_INDEPENDENT_CURRENT_VERIFICATION',fullScenarioCoverage:'NOT_PROVEN',formalAcceptance:'NOT_EVALUATED',targetCriteriaClosed:0,releaseAuthorized:false};
}

function openJournal(file,plan,planDigest,materials){
  assert.ok(path.isAbsolute(file)&&path.resolve(file)===file,'BATCH_JOURNAL_PATH_INVALID');
  assert.equal(fs.realpathSync(path.dirname(file)),path.dirname(file),'BATCH_JOURNAL_PARENT_SYMLINK');outside(file,root);
  for(const m of materials){const c=JSON.parse(m.contextBytes);outside(file,c.installationRoot);assert.notEqual(file,c.configFile);}
  const lock=file+'.lock',lockFd=fs.openSync(lock,'wx',0o600),lockStat=fs.fstatSync(lockFd);let fd;
  const close=()=>{if(fd!==undefined){fs.closeSync(fd);fd=undefined;}fs.closeSync(lockFd);const current=fs.lstatSync(lock);assert.equal(current.ino,lockStat.ino,'BATCH_LOCK_SUBSTITUTED');assert.equal(current.dev,lockStat.dev);fs.unlinkSync(lock);};
  try {
    fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_APPEND|fs.constants.O_RDWR|fs.constants.O_NOFOLLOW,0o600);
    const stat=fs.fstatSync(fd);assert.ok(stat.isFile()&&stat.nlink===1&&(stat.mode&0o077)===0&&stat.size<=16777216,'BATCH_JOURNAL_UNSAFE');
    const bytes=fs.readFileSync(fd,'utf8');assert.ok(!bytes||bytes.endsWith('\n'),'BATCH_JOURNAL_TRUNCATED');
    let expectedBytes=Buffer.from(bytes);
    const directoryFd=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(directoryFd);}finally{fs.closeSync(directoryFd);}
    const records=bytes?bytes.trimEnd().split('\n').map(JSON.parse):[];assert.ok(records.length<=1+plan.steps.length*2,'BATCH_JOURNAL_LIMIT');
    let previous=null,active=null,completed=0,stopped=false;
    for(const [seq,event]of records.entries()){
      exactKeys(event,['seq','planDigest','previousDigest','kind','stepId','stepDigest','status','reportDigest','digest']);
      const {digest,...body}=event;assert.equal(digest,probeDigest(body),'BATCH_JOURNAL_DIGEST');assert.equal(event.seq,seq);assert.equal(event.planDigest,planDigest,'BATCH_JOURNAL_PLAN_DRIFT');assert.equal(event.previousDigest,previous);assert.equal(stopped,false,'BATCH_JOURNAL_AFTER_STOP');
      if(seq===0){assert.equal(event.kind,'BEGIN');assert.equal(event.stepId,null);assert.equal(event.stepDigest,null);assert.equal(event.status,null);assert.equal(event.reportDigest,null);}
      else {const step=plan.steps[completed];assert.ok(step,'BATCH_JOURNAL_EXCESS_STEP');assert.equal(event.stepId,step.id);assert.equal(event.stepDigest,probeDigest(step));
        if(event.kind==='STARTED'){assert.equal(active,null);assert.equal(event.status,null);assert.equal(event.reportDigest,null);active=step.id;}
        else{assert.equal(active,step.id);assert.ok(['COMPLETED','STOPPED'].includes(event.kind));assert.ok(isId(event.status));assert.ok(event.reportDigest===null||isDigest(event.reportDigest));
          if(event.kind==='COMPLETED'){assert.ok(runners[step.runner].passed.includes(event.status));assert.ok(isDigest(event.reportDigest));completed++;active=null;}else stopped=true;}}
      previous=digest;
    }
    function append(kind,step=null,status=null,reportDigest=null){
      const current=fs.lstatSync(file);assert.ok(current.isFile()&&!current.isSymbolicLink()&&current.nlink===1&&current.ino===stat.ino&&current.dev===stat.dev,'BATCH_JOURNAL_SUBSTITUTED');
      assert.equal(fs.fstatSync(fd).size,expectedBytes.length,'BATCH_JOURNAL_DRIFT');
      const observed=Buffer.alloc(expectedBytes.length);let offset=0;
      while(offset<observed.length){const length=fs.readSync(fd,observed,offset,observed.length-offset,offset);assert.ok(length>0,'BATCH_JOURNAL_DRIFT');offset+=length;}
      assert.deepEqual(observed,expectedBytes,'BATCH_JOURNAL_DRIFT');
      const body={seq:records.length,planDigest,previousDigest:previous,kind,stepId:step?.id??null,stepDigest:step?probeDigest(step):null,status,reportDigest};
      const event={...body,digest:probeDigest(body)},bytes=Buffer.from(JSON.stringify(event)+'\n');assert.ok(fs.fstatSync(fd).size+bytes.length<=16777216,'BATCH_JOURNAL_LIMIT');
      fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);expectedBytes=Buffer.concat([expectedBytes,bytes]);records.push(event);previous=event.digest;return event;
    }
    if(!records.length)append('BEGIN');
    return {records,completed,active,stopped,append,close};
  }catch(error){close();throw error;}
}

/** Existing fixed subjourneys only, in frozen order. All callbacks belong to an
 * independently reviewed campaign; no blanket-true production callback or CLI
 * switch is provided. Evidence must be durably stored and independently checked
 * before completion is checkpointed. An interrupted STARTED or STOPPED journal
 * never replays; external read-only reconciliation must decide the next plan.
 * Hash chains detect drift, not hostile writers with directory access. */
export async function runInstalledBatch({planBytes,expectedPlanDigest,materials,journalFile,
  authorizeCampaign,authorizeInvocation,persistEvidence,verifyEvidence,invokeMcp,signal,timeoutMs=120000}) {
  for(const fn of [authorizeCampaign,authorizeInvocation,persistEvidence,verifyEvidence])assert.equal(typeof fn,'function','BATCH_CAMPAIGN_CALLBACK_REQUIRED');
  assert.ok(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=3600000,'BATCH_TIMEOUT_INVALID');
  planBytes=Buffer.from(planBytes);
  materials=materials.map(m=>({...m,contextBytes:Buffer.from(m.contextBytes),inputBytes:Buffer.from(m.inputBytes)}));
  const preflight=preflightInstalledBatch({planBytes,expectedPlanDigest,materials}),plan=JSON.parse(planBytes);
  if(plan.steps.some(s=>s.product==='expert'&&s.runner!=='expert-declaration'))assert.equal(typeof invokeMcp,'function','BATCH_MCP_RELAY_REQUIRED');
  const journal=openJournal(journalFile,plan,expectedPlanDigest,materials),controller=new AbortController();let rejectAbort;
  const abort=()=>controller.abort(new Error('BATCH_CANCELLED'));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const timer=setTimeout(()=>controller.abort(new Error('BATCH_TIMEOUT')),timeoutMs);
  const cancelled=new Promise((_,reject)=>{rejectAbort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',rejectAbort,{once:true});});cancelled.catch(()=>{});
  const wait=async fn=>{controller.signal.throwIfAborted();const value=await Promise.race([Promise.resolve().then(()=>{controller.signal.throwIfAborted();return fn();}),cancelled]);controller.signal.throwIfAborted();return value;};
  const summary=(status,extra={})=>({schema:'evopilot-installed-subjourney-batch-result/v1',status,planDigest:expectedPlanDigest,
    completed:journal.records.filter(e=>e.kind==='COMPLETED').length,total:plan.steps.length,...extra,
    preflight,formalAcceptance:'NOT_EVALUATED',targetCriteriaClosed:0,realHost:'REQUIRES_INDEPENDENT_QUALIFICATION',workBuddy:'NOT_OPERATED_OR_OBSERVED',releaseAuthorized:false});
  const frame=step=>({planDigest:expectedPlanDigest,acceptanceBindingDigest:plan.acceptanceBindingDigest,products:structuredClone(plan.products),host:structuredClone(plan.host),step:structuredClone(step)});
  try{
    if(journal.active||journal.stopped)return summary('STOPPED_RECONCILIATION_REQUIRED',{nextAction:'independent-read-only-reconciliation-no-replay'});
    for(const event of journal.records.filter(e=>e.kind==='COMPLETED')){
      const step=plan.steps.find(s=>s.id===event.stepId);assert.equal(await wait(()=>verifyEvidence({...frame(step),status:event.status,reportDigest:event.reportDigest},{signal:controller.signal})),true,'BATCH_RESUME_EVIDENCE_UNVERIFIED');
    }
    preflightInstalledBatch({planBytes,expectedPlanDigest,materials});controller.signal.throwIfAborted();
    for(let i=journal.completed;i<plan.steps.length;i++){
      const step=plan.steps[i],material=materials.find(m=>m.id===step.id),binding=frame(step);
      assert.equal(await wait(()=>authorizeCampaign(structuredClone(binding),{signal:controller.signal})),true,'BATCH_CAMPAIGN_DENIED');
      // Recheck every captured context after an asynchronous authority decision.
      preflightInstalledBatch({planBytes,expectedPlanDigest,materials});controller.signal.throwIfAborted();
      journal.append('STARTED',step);let report;
      try{
        report=await runners[step.runner].run({contextBytes:material.contextBytes,expectedContextDigest:step.contextDigest,inputBytes:material.inputBytes,
          authorizeInvocation:(f,o)=>authorizeInvocation(structuredClone({...binding,invocation:f}),o),invokeMcp,signal:controller.signal,timeoutMs:Math.min(timeoutMs,120000)});
        controller.signal.throwIfAborted();const reportBytes=Buffer.from(JSON.stringify(report));assert.ok(reportBytes.length<=4194304,'BATCH_REPORT_LIMIT');
        const reportDigest=probeDigest(report),status=report.status;assert.ok(isId(status));
        assert.equal(await wait(()=>persistEvidence(structuredClone({...binding,report,reportDigest}),{signal:controller.signal})),true,'BATCH_EVIDENCE_NOT_DURABLE');
        if(!runners[step.runner].passed.includes(status)){journal.append('STOPPED',step,status,reportDigest);return summary('STOPPED_SUBJOURNEY',{stepId:step.id,subjourneyStatus:status,nextAction:'inspect-exact-subjourney-stop-no-replay'});}
        assert.equal(await wait(()=>verifyEvidence(structuredClone({...binding,status,reportDigest}),{signal:controller.signal})),true,'BATCH_EVIDENCE_UNVERIFIED');
        preflightInstalledBatch({planBytes,expectedPlanDigest,materials});controller.signal.throwIfAborted();
        journal.append('COMPLETED',step,status,reportDigest);
      }catch{journal.append('STOPPED',step,'OUTCOME_NOT_VERIFIED');return summary('STOPPED_RECONCILIATION_REQUIRED',{stepId:step.id,nextAction:'independent-read-only-reconciliation-no-replay'});}
    }
    return summary('SUBJOURNEYS_COMPLETED_NOT_ACCEPTED');
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',rejectAbort);journal.close();}
}
