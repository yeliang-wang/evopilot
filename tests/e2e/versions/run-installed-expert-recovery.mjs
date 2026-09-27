import assert from 'node:assert/strict';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {verifyInstalledExpertRecoverySdk} from './installed-transport.mjs';
import {exactKeys,isId,probeDigest} from './probe-session.mjs';
import {assertRecoveryFrame,assertRecoveryReadback} from './runtime/6.3.0/recovery-journey.mjs';
import {assertExpertRecoveryPresentation} from './expert/2.3.0/recovery-assertions.mjs';

const reads=['completionReceipt','completionStatus'];
const operations=['planning','draft','prepare','inspect','bind','resolve','mapping','review','approveReview','dispatch','collect','evaluate',
  'commitStage','stageReceipt','completeTarget','completionReceipt','completionStatus','completePhase','phaseReceipt','completeGoal','goalReceipt'];
const limited=value=>{const bytes=JSON.stringify(value);assert.ok(typeof bytes==='string'&&Buffer.byteLength(bytes)<=1048576,'SDK_RESPONSE_LIMIT');return JSON.parse(bytes);};
function capability(response,projectId,operation){
  const r=response.structuredContent??response;
  assert.equal(response.isError??false,false);assert.equal(r.schema,'evopilot-mcp-http-result/v1');assert.equal(r.tool,'evopilot_semantic_execution_capabilities');
  assert.equal(r.ok,true);assert.equal(r.status,200);assert.ok(isId(r.requestId));
  const c=r.response.data;exactKeys(c,['schema','projectId','operations','authority','adapterConfigured','collectorConfigured','completionAvailable','completionScope',
    'phaseTargetCompletionAvailable','phaseCompletionAvailable','goalCompletionAvailable','releaseAvailable','qualification']);
  assert.equal(c.schema,'evopilot-semantic-execution-capabilities/v1');assert.equal(c.projectId,projectId);
  assert.equal(c.authority,'RUNTIME_CURRENT_SCOPED_PRINCIPAL');assert.equal(c.releaseAvailable,false);assert.equal(c.qualification,'REVALIDATE_PER_REQUEST');
  assert.ok(Array.isArray(c.operations)&&c.operations.length<=operations.length&&new Set(c.operations).size===c.operations.length);
  assert.ok(c.operations.every(op=>operations.includes(op))&&c.operations.includes(operation),'SDK_RECOVERY_CAPABILITY_REQUIRED');
  for(const key of ['adapterConfigured','collectorConfigured','completionAvailable','phaseTargetCompletionAvailable','phaseCompletionAvailable','goalCompletionAvailable'])assert.equal(typeof c[key],'boolean');
  assert.equal(c.completionScope,c.completionAvailable?'VALIDATED_TARGET_AND_NON_PHASE_GOAL':'UNAVAILABLE');
}

/** Exact installed-SDK presentation plus independent two-record Runtime oracle.
 * No installer, mutation, retry, Host qualification or campaign authority is
 * supplied here. MCP transport must honor its bounded abort signal. */
export async function runInstalledExpertRecovery({contextBytes,expectedContextDigest,inputBytes,invokeMcp,authorizeInvocation,signal,timeoutMs=30000}){
  signal?.throwIfAborted();assert.equal(typeof invokeMcp,'function');assert.equal(typeof authorizeInvocation,'function','CAMPAIGN_AUTHORIZER_REQUIRED');
  assert.ok(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=120000);
  assert.ok(Buffer.isBuffer(inputBytes)&&inputBytes.length<=4194304);
  const input=JSON.parse(inputBytes);exactKeys(input,['frame']);assertRecoveryFrame(input.frame);
  const installed=verifyInstalledExpertRecoverySdk({contextBytes,expectedContextDigest,sourceRoot:path.resolve(import.meta.dirname,'../../..')});
  const context=JSON.parse(contextBytes);assert.equal(probeDigest(input),context.probeInputDigest,'SDK_INPUT_DIGEST_MISMATCH');
  const {frame}=input,payload={projectId:frame.scope.projectId,payload:{identity:frame.identity,runId:frame.runId}};
  assert.ok(Buffer.byteLength(JSON.stringify(payload.payload))<=65536,'SDK_PAYLOAD_LIMIT');
  const calls=reads.flatMap(operation=>[{tool:'evopilot_semantic_execution_capabilities',payload:{projectId:frame.scope.projectId}},
    {tool:'evopilot_semantic_execution_'+operation,payload}]);
  const controller=new AbortController(),events=[],observed=[],presentations=[];let worker,timer,settled=false,inFlight=false,finish;
  const abort=()=>finish?.(new Error('SDK_CANCELLED'));
  try {
    const result=await new Promise((resolve,reject)=>{
      finish=(error,value)=>{if(settled)return;settled=true;controller.abort();clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(value);};
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
      timer=setTimeout(()=>finish(new Error('SDK_TIMEOUT')),timeoutMs);
      worker=new Worker(new URL('./expert/2.3.0/recovery-sdk-worker.mjs',import.meta.url),{
        workerData:{sdkEntry:installed.sdkEntry,payload},env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',EVOPILOT_LOG_LEVEL:'error'},execArgv:[],stdout:true,stderr:true,
        resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32,stackSizeMb:4}});
      let outputBytes=0;for(const stream of [worker.stdout,worker.stderr])stream.on('data',bytes=>{outputBytes+=bytes.length;if(outputBytes>1048576)finish(new Error('SDK_OUTPUT_LIMIT'));});
      worker.on('error',()=>finish(new Error('SDK_WORKER_FAILED')));worker.on('exit',()=>{if(!settled)finish(new Error('SDK_EARLY_EXIT'));});
      worker.on('message',async raw=>{
        if(settled)return;
        try {
          const m=limited(raw);installed.verify();controller.signal.throwIfAborted();
          if(m.type==='invoke'){
            exactKeys(m,['type','id','tool','payload']);assert.equal(inFlight,false,'SDK_CONCURRENT_CALL_DENIED');
            assert.equal(m.id,events.length+1);assert.ok(events.length<calls.length,'SDK_EXTRA_CALL_DENIED');
            assert.equal(presentations.length,Math.floor(events.length/2),'SDK_PREVIOUS_PRESENTATION_REQUIRED');
            const call={tool:m.tool,payload:m.payload};assert.deepEqual(call,calls[events.length],'SDK_CALL_CHANGED');inFlight=true;
            const index=events.length,effect=index%2===0?'READ_CAPABILITIES':'READ_RECOVERY_EVIDENCE';
            assert.equal(await authorizeInvocation({...installed.identity,inputDigest:context.probeInputDigest,call:structuredClone(call),commandDigest:probeDigest(call),effect},{signal:controller.signal}),true,'CAMPAIGN_INVOCATION_DENIED');
            controller.signal.throwIfAborted();installed.verify();
            const response=limited(await invokeMcp(structuredClone(call),{signal:controller.signal}));controller.signal.throwIfAborted();installed.verify();
            if(index%2===0)capability(response,frame.scope.projectId,reads[Math.floor(index/2)]);else observed.push(response);
            const requestId=(response.structuredContent??response).requestId;assert.ok(isId(requestId),'SDK_REQUEST_ID_REQUIRED');
            events.push({tool:m.tool,requestId,commandDigest:probeDigest(call),responseDigest:probeDigest(response)});
            inFlight=false;worker.postMessage({type:'response',id:m.id,value:response});
          }else{
            exactKeys(m,['type','operation','response','explanation']);assert.equal(m.type,'result');assert.equal(inFlight,false);
            const index=presentations.length;assert.ok(index<2);assert.equal(events.length,(index+1)*2);assert.equal(m.operation,reads[index]);
            assert.deepEqual(m.response,observed[index],'SDK_RESPONSE_SUBSTITUTED');
            presentations.push(assertExpertRecoveryPresentation({operation:m.operation,response:observed[index],explanation:m.explanation}));
            if(presentations.length===2){
              const data=observed.map(r=>(r.structuredContent??r).response.data),readback=assertRecoveryReadback(frame,...data);
              finish(null,{schema:'evopilot-expert-sdk-recovery-subjourney/v1',status:'EXPERT_SDK_RECOVERY_ASSERTIONS_PASSED',...readback,events,presentations,
                targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',mutationsIssued:0,releaseAuthorized:false});
            }
          }
        }catch(error){finish(error);}
      });
    });
    return {...result,installation:installed.identity,realHost:'NOT_QUALIFIED',workBuddy:'NOT_OPERATED_OR_OBSERVED',
      provenance:'REQUIRES_INDEPENDENT_CAMPAIGN_VERIFICATION'};
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();if(worker)await worker.terminate();}
}
