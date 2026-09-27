import assert from 'node:assert/strict';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {verifyInstalledExpertSdk} from './installed-transport.mjs';
import {exactKeys,probeDigest} from './probe-session.mjs';
import {runLifecycleJourney,validateLifecycleJourney} from './expert/2.3.0/lifecycle-journey.mjs';
const limited=value=>{const bytes=JSON.stringify(value);assert.ok(typeof bytes==='string'&&Buffer.byteLength(bytes)<=1048576,'LIFECYCLE_SDK_MESSAGE_LIMIT');return JSON.parse(bytes);};
function expectedCall(frame){return {tool:frame.tool,payload:structuredClone(frame.mcpInput)};}
/** Fixed Lifecycle state subjourney against a byte-verified installed Expert, relayed only
 * through the campaign's independently verified MCP. No installation, default
 * approval, credential handling, replay, Candidate or Host claim is provided. */
export async function runInstalledExpertLifecycle({contextBytes,expectedContextDigest,inputBytes,invokeMcp,authorizeInvocation,signal,timeoutMs=120000}){
  assert.equal(typeof invokeMcp,'function');assert.equal(typeof authorizeInvocation,'function');
  assert.ok(Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=120000);
  assert.ok(Buffer.isBuffer(inputBytes)&&inputBytes.length<=65536);const input=JSON.parse(inputBytes);validateLifecycleJourney(input);
  const installed=verifyInstalledExpertSdk({contextBytes,expectedContextDigest,sourceRoot:path.resolve(import.meta.dirname,'../../..')});
  assert.equal(JSON.parse(contextBytes).probeInputDigest,probeDigest(input),'LIFECYCLE_SDK_INPUT_DRIFT');
  const controller=new AbortController();const abort=()=>controller.abort(Error('LIFECYCLE_SDK_CANCELLED'));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(()=>controller.abort(Error('LIFECYCLE_SDK_TIMEOUT')),timeoutMs);
  const verifiedTurns=[];let attemptedMutation=false;
  try{
    const result=await runLifecycleJourney({input,signal:controller.signal,invokeTurn:async frame=>{
      controller.signal.throwIfAborted();installed.verify();const expected=structuredClone(expectedCall(frame));let worker,settled=false,invoked=false,response;
      try{return await new Promise((resolve,reject)=>{
        const finish=(error,value)=>{if(settled)return;settled=true;controller.signal.removeEventListener('abort',cancel);if(error){controller.abort(error);reject(error);}else resolve(value);};
        const cancel=()=>finish(controller.signal.reason);controller.signal.addEventListener('abort',cancel,{once:true});if(controller.signal.aborted){cancel();return;}
        worker=new Worker(new URL('./expert/2.3.0/project-sdk-worker.mjs',import.meta.url),{workerData:{sdkEntry:installed.sdkEntry,turn:structuredClone(frame)},
          env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C'},execArgv:[],stdout:true,stderr:true,resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32,stackSizeMb:4}});
        let output=0;for(const stream of [worker.stdout,worker.stderr])stream.on('data',bytes=>{output+=bytes.length;if(output>1048576)finish(Error('LIFECYCLE_SDK_OUTPUT_LIMIT'));});
        worker.on('error',()=>finish(Error('LIFECYCLE_SDK_WORKER_ERROR')));worker.on('exit',()=>{if(!settled)finish(Error('LIFECYCLE_SDK_EARLY_EXIT'));});
        worker.on('message',async raw=>{
          if(settled)return;
          try{const m=limited(raw);controller.signal.throwIfAborted();installed.verify();
            if(m.type==='invoke'){
              exactKeys(m,['type','tool','payload']);assert.equal(invoked,false,'LIFECYCLE_SDK_EXTRA_INVOCATION');invoked=true;
              assert.deepEqual({tool:m.tool,payload:m.payload},expected,'LIFECYCLE_SDK_CALL_SUBSTITUTION');
              assert.equal(await authorizeInvocation(structuredClone({...installed.identity,call:expected,effect:frame.effect,decision:frame.decision??null,commandDigest:probeDigest(expected)}),{signal:controller.signal}),true,'LIFECYCLE_SDK_AUTHORITY_DENIED');
              controller.signal.throwIfAborted();installed.verify();
              attemptedMutation=!frame.effect.startsWith('READ_');
              response=limited(await invokeMcp(structuredClone(expected),{signal:controller.signal}));controller.signal.throwIfAborted();installed.verify();
              worker.postMessage({type:'response',value:response});
            }else{
              exactKeys(m,['type','response']);assert.equal(m.type,'result');assert.equal(invoked,true);assert.ok(response);assert.deepEqual(m.response,response,'LIFECYCLE_SDK_RESPONSE_SUBSTITUTION');
              verifiedTurns.push({tool:expected.tool,commandDigest:probeDigest(expected),responseDigest:probeDigest(response)});attemptedMutation=false;finish(null,response);
            }
          }catch(error){finish(error);}
        });
      });}finally{if(worker)await worker.terminate();}
    }});
    installed.verify();return {...result,installation:installed.identity,verifiedTurns,workBuddy:'NOT_OPERATED_OR_OBSERVED'};
  }catch{
    return {status:attemptedMutation?'UNKNOWN_OUTCOME':'LIFECYCLE_JOURNEY_STOPPED',nextAction:'INSPECT_VERIFIED_PREFIX_AND_RUNTIME_NO_AUTOMATIC_REPLAY',verifiedTurns,
      installation:installed.identity,targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',realHost:'NOT_QUALIFIED',releaseAuthorized:false};
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
