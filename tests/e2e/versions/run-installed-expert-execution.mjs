import assert from 'node:assert/strict';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {verifyInstalledExpertExecutionSdk} from './installed-transport.mjs';
import {exactKeys,isId,probeDigest} from './probe-session.mjs';
import {assertExecutionFrame,assertExecutionDecision,assertExecutionDispatch,assertExecutionCollection} from './runtime/6.3.0/execution-journey.mjs';
import {assertExpertExecutionPresentation} from './expert/2.3.0/execution-assertions.mjs';

const effects={resolve:'READ_CONTEXT',review:'PREPARE_OUTCOME_REVIEW',approveReview:'APPROVE_OUTCOME_REVIEW',dispatch:'DISPATCH_EXECUTION',
  collect:'COLLECT_EXECUTION_EVIDENCE',evaluate:'EVALUATE_EXECUTION_OUTCOMES'};
const operations=['planning','draft','prepare','inspect','bind','resolve','mapping','review','approveReview','dispatch','collect','evaluate',
  'commitStage','stageReceipt','completeTarget','completionReceipt','completionStatus','completePhase','phaseReceipt','completeGoal','goalReceipt'];
const limited=value=>{const bytes=JSON.stringify(value);assert.ok(typeof bytes==='string'&&Buffer.byteLength(bytes)<=1048576,'SDK_RESPONSE_LIMIT');return JSON.parse(bytes);};
function capability(response,projectId,operation) {
  const r=response.structuredContent??response;
  assert.equal(response.isError??false,false);assert.equal(r.schema,'evopilot-mcp-http-result/v1');assert.equal(r.tool,'evopilot_semantic_execution_capabilities');
  assert.equal(r.ok,true);assert.equal(r.status,200);assert.ok(isId(r.requestId));
  const c=r.response.data;exactKeys(c,['schema','projectId','operations','authority','adapterConfigured','collectorConfigured','completionAvailable','completionScope',
    'phaseTargetCompletionAvailable','phaseCompletionAvailable','goalCompletionAvailable','releaseAvailable','qualification']);
  assert.equal(c.schema,'evopilot-semantic-execution-capabilities/v1');assert.equal(c.projectId,projectId);
  assert.equal(c.authority,'RUNTIME_CURRENT_SCOPED_PRINCIPAL');assert.equal(c.releaseAvailable,false);assert.equal(c.qualification,'REVALIDATE_PER_REQUEST');
  assert.ok(Array.isArray(c.operations)&&c.operations.length<=operations.length&&new Set(c.operations).size===c.operations.length);
  assert.ok(c.operations.every(op=>operations.includes(op))&&c.operations.includes(operation),'SDK_EXECUTION_CAPABILITY_REQUIRED');
  for(const key of ['adapterConfigured','collectorConfigured','completionAvailable','phaseTargetCompletionAvailable','phaseCompletionAvailable','goalCompletionAvailable'])assert.equal(typeof c[key],'boolean');
  assert.equal(c.completionScope,c.completionAvailable?'VALIDATED_TARGET_AND_NON_PHASE_GOAL':'UNAVAILABLE');
  if(operation==='dispatch')assert.equal(c.adapterConfigured,true);if(operation==='collect')assert.equal(c.collectorConfigured,true);
}

/** One exact installed SDK turn, not a Host qualification or auto-chain. The
 * independent campaign supplies current MCP transport and authorization. */
export async function runInstalledExpertExecution({contextBytes,expectedContextDigest,inputBytes,invokeMcp,authorizeInvocation,signal,timeoutMs=30000}) {
  signal?.throwIfAborted();assert.equal(typeof invokeMcp,'function');assert.equal(typeof authorizeInvocation,'function','CAMPAIGN_AUTHORIZER_REQUIRED');
  assert.ok(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=120000);
  assert.ok(Buffer.isBuffer(inputBytes)&&inputBytes.length<=4194304);
  const input=JSON.parse(inputBytes),{operation,frame}=input;assert.ok(Object.hasOwn(effects,operation),'SDK_OPERATION_DENIED');
  exactKeys(input,['operation','frame',...(operation==='approveReview'?['decision']:[])]);assertExecutionFrame(frame);
  if(operation==='approveReview'){
    exactKeys(input.decision,['authorizationDigest','evidenceRef']);assert.equal(input.decision.authorizationDigest,frame.review.reviewDigest,'SDK_EXACT_DECISION_REQUIRED');
    assert.ok(typeof input.decision.evidenceRef==='string'&&input.decision.evidenceRef.trim().length>0&&input.decision.evidenceRef.length<=1024);
  }
  const installed=verifyInstalledExpertExecutionSdk({contextBytes,expectedContextDigest,sourceRoot:path.resolve(import.meta.dirname,'../../..')});
  assert.equal(probeDigest(input),JSON.parse(contextBytes).probeInputDigest,'SDK_INPUT_DIGEST_MISMATCH');
  const base={identity:frame.identity,bindingDigest:frame.binding.bindingDigest};
  const payload={projectId:frame.scope.projectId,payload:{...base,...(operation==='review'?{coverage:frame.review.coverage}:{}),
    ...(operation==='approveReview'?{reviewDigest:frame.review.reviewDigest,decision:'APPROVE'}:{})}};
  assert.ok(Buffer.byteLength(JSON.stringify(payload.payload))<=65536,'SDK_PAYLOAD_LIMIT');
  const calls=[{tool:'evopilot_semantic_execution_capabilities',payload:{projectId:frame.scope.projectId}},{tool:'evopilot_semantic_execution_'+operation,payload}];
  const controller=new AbortController(),events=[];let worker,timer,settled=false,inFlight=false,writeAttempted=false,observed,finish;
  const abort=()=>finish?.(new Error('SDK_CANCELLED'));
  try {
    const result=await new Promise((resolve,reject)=>{
      finish=(error,value)=>{
        if(settled)return;settled=true;controller.abort();clearTimeout(timer);signal?.removeEventListener('abort',abort);
        if(error&&writeAttempted)resolve({status:'UNVERIFIED_OUTCOME',lastAttemptedOperation:operation,nextAction:'external-read-only-reconciliation-no-mutation-replay',events,targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',releaseAuthorized:false});
        else if(error)reject(error);else resolve(value);
      };
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
      timer=setTimeout(()=>finish(new Error('SDK_TIMEOUT')),timeoutMs);
      worker=new Worker(new URL('./expert/2.3.0/execution-sdk-worker.mjs',import.meta.url),{
        workerData:{sdkEntry:installed.sdkEntry,input:{operation,payload,decision:input.decision}},
        env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',EVOPILOT_LOG_LEVEL:'error'},execArgv:[],stdout:true,stderr:true,
        resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32,stackSizeMb:4}});
      let outputBytes=0;
      for(const stream of [worker.stdout,worker.stderr])stream.on('data',bytes=>{outputBytes+=bytes.length;if(outputBytes>1048576)finish(new Error('SDK_OUTPUT_LIMIT'));});
      worker.on('error',()=>finish(new Error('SDK_WORKER_FAILED')));worker.on('exit',()=>{if(!settled)finish(new Error('SDK_EARLY_EXIT'));});
      worker.on('message',async raw=>{
        if(settled)return;
        try {
          const m=limited(raw);installed.verify();controller.signal.throwIfAborted();
          if(m.type==='invoke') {
            exactKeys(m,['type','id','tool','payload']);assert.equal(inFlight,false,'SDK_CONCURRENT_CALL_DENIED');
            assert.equal(m.id,events.length+1);assert.ok(events.length<calls.length,'SDK_EXTRA_CALL_DENIED');
            const call={tool:m.tool,payload:m.payload};assert.deepEqual(call,calls[events.length],'SDK_CALL_CHANGED');inFlight=true;
            const effect=events.length===0?'READ_CAPABILITIES':effects[operation];
            assert.equal(await authorizeInvocation({...installed.identity,call:structuredClone(call),commandDigest:probeDigest(call),effect},{signal:controller.signal}),true,'CAMPAIGN_INVOCATION_DENIED');
            controller.signal.throwIfAborted();installed.verify();
            if(events.length===1&&operation!=='resolve')writeAttempted=true;
            const response=limited(await invokeMcp(structuredClone(call),{signal:controller.signal}));
            controller.signal.throwIfAborted();installed.verify();
            if(events.length===0)capability(response,frame.scope.projectId,operation);else observed=response;
            events.push({tool:m.tool,commandDigest:probeDigest(call),responseDigest:probeDigest(response)});
            inFlight=false;worker.postMessage({type:'response',id:m.id,value:response});
          } else {
            exactKeys(m,['type','response','explanation']);assert.equal(m.type,'result');assert.equal(inFlight,false);assert.equal(events.length,2);
            assert.deepEqual(m.response,observed,'SDK_RESPONSE_SUBSTITUTED');
            const assertion=assertExpertExecutionPresentation({operation,response:observed,explanation:m.explanation});
            const data=(observed.structuredContent??observed).response.data;
            if(operation==='resolve')assert.deepEqual(data,frame.slice);
            if(operation==='review')assert.deepEqual(data,frame.review);
            if(operation==='approveReview')assertExecutionDecision(frame,data);
            if(operation==='dispatch')assertExecutionDispatch(frame,data);
            if(operation==='collect')assertExecutionCollection(data);
            finish(null,{...assertion,status:'EXPERT_SDK_EXECUTION_ASSERTIONS_PASSED',events});
          }
        } catch(error){finish(error);}
      });
    });
    return {...result,installation:installed.identity,realHost:'NOT_QUALIFIED',workBuddy:'NOT_OPERATED_OR_OBSERVED',
      runtimeOutcomeVerification:'REQUIRES_INDEPENDENT_FULL_RECEIPT_ORACLE'};
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();if(worker)await worker.terminate();}
}
