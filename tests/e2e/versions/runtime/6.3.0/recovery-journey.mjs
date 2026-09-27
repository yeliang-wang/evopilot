import assert from 'node:assert/strict';
import {exactKeys,isDigest,isId,probeDigest} from '../../probe-session.mjs';

const bounded=value=>{const s=JSON.stringify(value);assert.ok(s&&Buffer.byteLength(s)<=4194304,'RC05_MATERIAL_LIMIT');return JSON.parse(s);};
const hashed=(value,key,schema)=>{const {[key]:digest,...body}=value;assert.equal(value.schema,schema);assert.ok(isDigest(digest));assert.equal(digest,probeDigest(body),'RC05_RECORD_DIGEST');};
const noAuthority={mayCompleteGoal:false,mayCompleteTarget:false,mayDispatch:false,mayPublish:false};
function checkFrame(f) {
  exactKeys(f,['scope','identity','runId','targets','completedBy']);exactKeys(f.scope,['tenantId','workspaceId','projectId']);
  exactKeys(f.identity,['projectId','goalId','targetId','harnessBindingDigest']);
  assert.ok([...Object.values(f.scope),f.identity.projectId,f.identity.goalId,f.identity.targetId,f.runId].every(isId));
  assert.equal(f.scope.projectId,f.identity.projectId);assert.ok(isDigest(f.identity.harnessBindingDigest));
  assert.ok(typeof f.completedBy==='string'&&f.completedBy.trim().length>0&&f.completedBy.length<=2048);
  assert.ok(Array.isArray(f.targets)&&f.targets.length>0&&f.targets.length<=64);
  for(const t of f.targets){exactKeys(t,['targetId','required']);assert.ok(isId(t.targetId));assert.equal(typeof t.required,'boolean');}
  assert.equal(new Set(f.targets.map(t=>t.targetId)).size,f.targets.length);
  assert.ok(f.targets.some(t=>t.required)&&f.targets.some(t=>t.targetId===f.identity.targetId));
}
export {checkFrame as assertRecoveryFrame};

/** Independently correlates a NON-PHASE Target receipt and current report.
 * Does not attest underlying business facts, current execution permission,
 * installed provenance or real Host qualification. Caller pins expected scope,
 * identity, target inventory and completing principal independently. */
export function assertRecoveryReadback(frame,receipt,report) {
  checkFrame(frame);
  exactKeys(receipt,['schema','identity','runId','scope','evidence','currentAuthorityDigest','previousGoalDigest','completedAt','completedBy','resultingGoalStatus','receiptDigest']);
  hashed(receipt,'receiptDigest','evopilot-semantic-target-completion/v1');
  assert.deepEqual(receipt.identity,frame.identity);assert.equal(receipt.runId,frame.runId);
  const scope={...frame.scope,goalId:frame.identity.goalId,targetId:frame.identity.targetId};assert.deepEqual(receipt.scope,scope);
  assert.equal(receipt.completedBy,frame.completedBy);assert.ok(Number.isFinite(Date.parse(receipt.completedAt)));
  assert.ok(isDigest(receipt.currentAuthorityDigest)&&isDigest(receipt.previousGoalDigest));
  assert.ok(['RUNNING','COMPLETED'].includes(receipt.resultingGoalStatus));
  const evidence=receipt.evidence;hashed(evidence,'evidenceDigest','evopilot-semantic-terminal-evidence/v1');
  assert.deepEqual(evidence.scope,scope);assert.deepEqual(evidence.identity,frame.identity);assert.equal(evidence.runId,frame.runId);
  assert.equal(evidence.status,'TERMINAL_EVIDENCE_VERIFIED_NOT_COMPLETED');assert.equal(evidence.eligibleForCompletion,false);
  assert.equal(evidence.currentCompletionAuthorityVerified,false);assert.deepEqual(evidence.authority,noAuthority);
  for(const field of ['runDigest','terminalDigest','sourceWitnessDigest'])assert.ok(isDigest(evidence[field]));
  assert.ok(Array.isArray(evidence.stages)&&evidence.stages.length>0&&evidence.stages.length<=64);
  exactKeys(report,['schema','scope','goalId','status','targets','progress','blockers','release','goalRevisionDigest','authority','reportDigest']);
  hashed(report,'reportDigest','evopilot-semantic-goal-completion-report/v1');
  assert.deepEqual(report.scope,frame.scope);assert.equal(report.goalId,frame.identity.goalId);assert.ok(isDigest(report.goalRevisionDigest));
  assert.deepEqual(report.authority,noAuthority);assert.deepEqual(report.release,{status:'NOT_EVALUATED',authorized:false,published:false});
  assert.ok(Array.isArray(report.targets));assert.deepEqual(report.targets.map(({targetId,required})=>({targetId,required})),frame.targets);
  for(const t of report.targets){assert.ok(['VERIFIED_DONE','NOT_VERIFIED'].includes(t.status));exactKeys(t,['targetId','required','status',...(t.status==='VERIFIED_DONE'?['receiptDigest']:[])]);if(t.status==='VERIFIED_DONE')assert.ok(isDigest(t.receiptDigest));}
  const target=report.targets.find(t=>t.targetId===frame.identity.targetId);assert.equal(target.status,'VERIFIED_DONE');assert.equal(target.receiptDigest,receipt.receiptDigest);
  const required=report.targets.filter(t=>t.required),done=required.filter(t=>t.status==='VERIFIED_DONE').length,complete=report.status==='COMPLETED';
  assert.deepEqual(report.progress,{requiredTargets:required.length,verifiedRequiredTargets:done,targetPercent:Math.floor(done*100/required.length),goalCompleted:complete});
  assert.ok(Array.isArray(report.blockers)&&new Set(report.blockers).size===report.blockers.length);
  assert.ok(report.blockers.every(b=>['REQUIRED_TARGET_COMPLETION_PENDING','PHASE_OR_GA_CLOSURE_PENDING','GOAL_COMPLETION_RECORD_REQUIRED'].includes(b)));
  assert.equal(report.blockers.includes('REQUIRED_TARGET_COMPLETION_PENDING'),done!==required.length);
  assert.equal(report.status,complete?'COMPLETED':done?'PARTIAL':'PENDING');
  if(complete){assert.equal(done,required.length);assert.deepEqual(report.blockers,[]);}else assert.ok(report.blockers.length>0);
  return {receiptDigest:receipt.receiptDigest,reportDigest:report.reportDigest,observedGoalStatus:report.status};
}

/** Fixed two-read recovery subjourney. No mutation callback, automatic retry,
 * dispatch, completion, fallback or inferred authority is available here. */
export async function runCompletionRecovery({frame,invoke,authorize,signal,timeoutMs=30000}) {
  frame=bounded(frame);checkFrame(frame);assert.equal(typeof invoke,'function');assert.equal(typeof authorize,'function');
  assert.ok(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=120000);signal?.throwIfAborted();
  const controller=new AbortController(),events=[],input={identity:frame.identity,runId:frame.runId};
  let rejectAbort;const stopped=new Promise((_,reject)=>{rejectAbort=reject;});stopped.catch(()=>{});
  const stop=reason=>{controller.abort();rejectAbort(new Error(reason));},abort=()=>stop('RC05_CANCELLED');
  signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>stop('RC05_TIMEOUT'),timeoutMs);
  const read=async operation=>{
    controller.signal.throwIfAborted();
    assert.equal(await Promise.race([Promise.resolve().then(()=>authorize({operation,payload:structuredClone(input),effect:'READ_RECOVERY_EVIDENCE'},{signal:controller.signal})),stopped]),true,'RC05_READ_AUTHORIZATION_REQUIRED');
    controller.signal.throwIfAborted();
    const r=bounded(await Promise.race([Promise.resolve().then(()=>invoke(operation,structuredClone(input),{signal:controller.signal})),stopped]));
    controller.signal.throwIfAborted();exactKeys(r,['requestId','data']);assert.ok(isId(r.requestId));
    events.push({operation,requestId:r.requestId,responseDigest:probeDigest(r.data)});return r.data;
  };
  try {
    const receipt=await read('completionReceipt'),report=await read('completionStatus');
    const result=assertRecoveryReadback(frame,receipt,report);
    return {schema:'evopilot-rc05-completion-recovery-subjourney/v1',status:'READ_ONLY_RECOVERY_ASSERTIONS_PASSED',...result,events,
      targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',realHost:'NOT_QUALIFIED',releaseAuthorized:false,mutationsIssued:0};
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
}
