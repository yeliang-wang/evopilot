import assert from 'node:assert/strict';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {verifyInstalledExpertSdk} from './installed-transport.mjs';
import {exactKeys,isDigest,isId,probeDigest} from './probe-session.mjs';
import {assertExpertBindingPresentation} from './expert/2.3.0/binding-assertions.mjs';
import {assertExpertTransitionPresentation} from './expert/2.3.0/transition-assertions.mjs';
import {assertExpertRefusalPresentation} from './expert/2.3.0/refusal-assertions.mjs';
import {validateRefusalInput} from './runtime/6.3.0/refusal-probe.mjs';
import {validateCapabilityProbeInput,assertMissingMcpCapability} from './runtime/6.3.0/capability-probe.mjs';
import {assertActivationHistory,assertTransitionReview} from './runtime/6.3.0/transition-journey.mjs';

const texts={onboarding:'新项目语义接入',review:'准备项目语义绑定评审',approve:'批准项目语义评审',binding:'恢复语义绑定状态',
  activation:'恢复语义迁移状态',transitionReview:'准备语义激活评审',transitionApprove:'批准语义激活评审',
  inspect:'列出项目语义地图',compatibility:'检查项目语义兼容性',gap:'查看语义缺口'};
const limited=value=>{const bytes=JSON.stringify(value);assert.ok(typeof bytes==='string'&&Buffer.byteLength(bytes)<=1048576,'SDK_RESPONSE_LIMIT');return JSON.parse(bytes);};
const semanticOperations=['capabilities','inspect','compatibility','review','approve','binding','activation','transitionReview','transitionApprove','onboarding','gap'];
function assertAvailableCapability(response,projectId,operation) {
  const r=response.structuredContent??response;
  exactKeys(r,['schema','tool','authority','status','ok','requestId','response']);
  assert.equal(r.schema,'evopilot-mcp-http-result/v1');assert.equal(r.tool,'evopilot_project_semantic_capabilities');assert.equal(r.authority,'NONE');
  assert.equal(response.isError??false,false);assert.equal(r.status,200);assert.equal(r.ok,true);
  assert.ok(typeof r.requestId==='string'&&/^[a-zA-Z0-9._:-]{1,256}$/.test(r.requestId));
  const c=r.response.data;exactKeys(c,['schema','projectId','operations','executionAvailable','completionAvailable','authority']);
  assert.equal(c.schema,'evopilot-project-semantic-capabilities/v1');assert.equal(c.projectId,projectId);
  assert.equal(c.authority,'RUNTIME_CURRENT_SCOPED_PRINCIPAL');assert.equal(c.executionAvailable,false);assert.equal(c.completionAvailable,false);
  assert.ok(Array.isArray(c.operations)&&c.operations.length>0&&c.operations.length<=semanticOperations.length);
  assert.equal(new Set(c.operations).size,c.operations.length);assert.ok(c.operations.every(op=>semanticOperations.includes(op)));
  assert.ok(c.operations.includes('capabilities')&&c.operations.includes(operation),'SDK_CAPABILITY_REQUIRED');
}

/** A single installed Expert SDK turn, relayed to an independently verified MCP
 * transport. This is not a Host adapter, campaign authorizer or full RC01. */
export async function runInstalledExpertBinding({contextBytes,expectedContextDigest,inputBytes,invokeMcp,authorizeInvocation,signal,timeoutMs=30000}) {
  signal?.throwIfAborted();assert.equal(typeof invokeMcp,'function');assert.equal(typeof authorizeInvocation,'function','CAMPAIGN_AUTHORIZER_REQUIRED');
  assert.ok(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=120000);
  assert.ok(Buffer.isBuffer(inputBytes)&&inputBytes.length<=65536);
  const input=JSON.parse(inputBytes);assert.ok(Object.hasOwn(texts,input.operation),'SDK_OPERATION_DENIED');
  const transitionMode=['activation','transitionReview','transitionApprove'].includes(input.operation),approval=['approve','transitionApprove'].includes(input.operation);
  const capabilityMode=input.expected?.kind==='CAPABILITY_MISSING';
  const refusalMode=!capabilityMode&&['inspect','compatibility'].includes(input.operation);
  exactKeys(input,transitionMode?['operation','scope','initial',...(input.operation==='activation'?[]:['beforeState','targetReview','transition']),...(approval?['review','decision']:[])]:
    ['operation','selection','scope',...(approval?['decision']:[]),...(refusalMode||capabilityMode?['expected']:[])]);
  if(capabilityMode)validateCapabilityProbeInput(input);
  if(input.operation==='gap')assert.equal(capabilityMode,true,'SDK_GAP_MODE_REQUIRED');
  if(refusalMode){validateRefusalInput(input);assert.equal(input.operation,input.expected.kind==='CATALOG_REFUSAL'?'inspect':'compatibility');}
  const {operation,selection,scope}=input;
  exactKeys(scope,['tenantId','workspaceId','projectId']);assert.ok(Object.values(scope).every(isId));
  if(!transitionMode) {
  exactKeys(selection,['projectId','catalogId','artifactSetDigest','bundleDigest']);
  assert.ok([selection.projectId,selection.catalogId,...Object.values(scope)].every(isId));assert.equal(selection.projectId,scope.projectId);
  assert.ok([selection.artifactSetDigest,selection.bundleDigest].every(isDigest));
  } else {
    const initialState={schema:'evopilot-project-semantic-activation/v1',headDigest:input.initial.binding.bindingDigest,status:'REVIEWED_DEFAULT',
      bindingDigest:input.initial.binding.bindingDigest,transitions:[],grantsExecutionAuthority:false};
    assertActivationHistory({state:initialState,initial:input.initial,scope});
    if(operation!=='activation') {
      exactKeys(input.transition,['action','expectedHeadDigest','destinationDigest']);assert.ok(['ACTIVATE','MIGRATE','ROLLBACK'].includes(input.transition.action));
      assert.ok([input.transition.expectedHeadDigest,input.transition.destinationDigest].every(isDigest));
      const {current}=assertActivationHistory({state:input.beforeState,initial:input.initial,scope});assert.equal(input.beforeState.headDigest,input.transition.expectedHeadDigest);
      if(operation==='transitionApprove')assertTransitionReview({review:input.review,from:current,targetReview:input.targetReview,transition:input.transition,scope});
    }
  }
  if(approval) {
    exactKeys(input.decision,['authorizationDigest','evidenceRef']);assert.ok(isDigest(input.decision.authorizationDigest));
    assert.ok(typeof input.decision.evidenceRef==='string'&&input.decision.evidenceRef.trim()&&input.decision.evidenceRef.length<=1024);
    if(operation==='transitionApprove')assert.equal(input.decision.authorizationDigest,input.review.transitionReviewDigest,'SDK_EXACT_TRANSITION_DECISION_REQUIRED');
  }
  const identity=verifyInstalledExpertSdk({contextBytes,expectedContextDigest,sourceRoot:path.resolve(import.meta.dirname,'../../..')});
  assert.equal(probeDigest(input),JSON.parse(contextBytes).probeInputDigest,'SDK_INPUT_DIGEST_MISMATCH');
  const payload=operation==='activation'?{projectId:scope.projectId}:operation==='transitionReview'?{projectId:scope.projectId,...input.transition}:
    operation==='transitionApprove'?{projectId:scope.projectId,transitionReviewDigest:input.decision.authorizationDigest,decision:'APPROVE'}:
    operation==='approve'?{projectId:selection.projectId,reviewDigest:input.decision.authorizationDigest,decision:'APPROVE'}:
    ['review','compatibility','gap'].includes(operation)?selection:['onboarding','inspect'].includes(operation)?{projectId:selection.projectId,catalogId:selection.catalogId}:{projectId:selection.projectId};
  const expectedCalls=[{tool:'evopilot_project_semantic_capabilities',payload:{projectId:scope.projectId}},
    {tool:'evopilot_project_semantic_'+operation,payload}];
  if(capabilityMode)expectedCalls.length=1;
  const controller=new AbortController(),events=[];let writeAttempted=false,worker,timer,settled=false,inFlight=false,observedResponse;
  let finish;
  const abort=()=>finish?.(new Error('SDK_CANCELLED'));
  const result=await new Promise((resolve,reject)=>{
    finish=(error,value)=>{
      if(settled)return;settled=true;controller.abort();clearTimeout(timer);signal?.removeEventListener('abort',abort);
      worker?.terminate().catch(()=>{});
      if(error&&writeAttempted)resolve({status:'UNKNOWN_OUTCOME',nextAction:'READBACK_ONLY_NO_SUBMISSION_REPLAY',events,
        targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',releaseAuthorized:false});
      else if(error)reject(error);else resolve(value);
    };
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
    timer=setTimeout(()=>finish(new Error('SDK_TIMEOUT')),timeoutMs);
    worker=new Worker(new URL('./expert/2.3.0/sdk-worker.mjs',import.meta.url),{
      workerData:{sdkEntry:identity.sdkEntry,input:{operation,text:texts[operation],payload,decision:input.decision}},
      env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',EVOPILOT_LOG_LEVEL:'error'},execArgv:[],stdout:true,stderr:true,
      resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32,stackSizeMb:4}});
    let outputBytes=0;
    for(const stream of [worker.stdout,worker.stderr])stream.on('data',bytes=>{outputBytes+=bytes.length;if(outputBytes>1048576)finish(new Error('SDK_OUTPUT_LIMIT'));});
    worker.on('error',()=>finish(new Error('SDK_WORKER_FAILED')));
    worker.on('exit',()=>{if(!settled)finish(new Error('SDK_WORKER_EARLY_EXIT'));});
    worker.on('message',async raw=>{
      if(settled)return;
      try {
        const message=limited(raw);identity.verify();controller.signal.throwIfAborted();
        if(message.type==='invoke') {
          assert.equal(inFlight,false,'SDK_CONCURRENT_CALL_DENIED');exactKeys(message,['type','id','tool','payload']);
          assert.equal(message.id,events.length+1);assert.ok(events.length<expectedCalls.length,'SDK_EXTRA_CALL_DENIED');
          assert.deepEqual({tool:message.tool,payload:message.payload},expectedCalls[events.length],'SDK_CALL_CHANGED');inFlight=true;
          const effect=({evopilot_project_semantic_approve:'APPROVE_PROJECT_BINDING',evopilot_project_semantic_review:'PREPARE_REVIEW',
            evopilot_project_semantic_transitionApprove:'APPROVE_PROJECT_TRANSITION',evopilot_project_semantic_transitionReview:'PREPARE_TRANSITION_REVIEW'})[message.tool]??'READ';
          const call={tool:message.tool,payload:message.payload};
          assert.equal(await authorizeInvocation({...identity.identity,call:structuredClone(call),commandDigest:probeDigest(call),effect},{signal:controller.signal}),true,'CAMPAIGN_INVOCATION_DENIED');
          controller.signal.throwIfAborted();identity.verify();
          if(['PREPARE_REVIEW','PREPARE_TRANSITION_REVIEW','APPROVE_PROJECT_BINDING','APPROVE_PROJECT_TRANSITION'].includes(effect))writeAttempted=true;
          const response=limited(await invokeMcp(structuredClone(call),{signal:controller.signal}));
          controller.signal.throwIfAborted();identity.verify();
          if(events.length===0&&!capabilityMode)assertAvailableCapability(response,scope.projectId,operation);
          events.push({tool:message.tool,commandDigest:probeDigest(call),responseDigest:probeDigest(response)});
          if(events.length===expectedCalls.length)observedResponse=response;
          if(capabilityMode)assertMissingMcpCapability({...input,response});
          inFlight=false;worker.postMessage({type:'response',id:message.id,value:response});
        } else {
          if(capabilityMode) {
            exactKeys(message,['type','code']);assert.equal(message.type,'failure');assert.equal(message.code,'SEMANTIC_CAPABILITY_REQUIRED','SDK_NAMED_CAPABILITY_STOP_REQUIRED');
            assert.equal(events.length,1);assert.equal(inFlight,false);assertMissingMcpCapability({...input,response:observedResponse});
            finish(null,{status:'EXPERT_SDK_CAPABILITY_STOP_ASSERTIONS_PASSED',operation,events,targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',releaseAuthorized:false});return;
          }
          exactKeys(message,['type','response','explanation']);assert.equal(message.type,'result');assert.equal(events.length,2);assert.equal(inFlight,false);
          assert.deepEqual(message.response,observedResponse,'SDK_RESPONSE_SUBSTITUTED');
          const assertion=refusalMode?assertExpertRefusalPresentation({...input,response:message.response,explanation:message.explanation}):transitionMode?assertExpertTransitionPresentation({...input,response:message.response,explanation:message.explanation}):
            assertExpertBindingPresentation({operation,response:message.response,explanation:message.explanation,selection,scope});
          if(operation==='approve')assert.equal((observedResponse.structuredContent??observedResponse).response.data.review.reviewDigest,input.decision.authorizationDigest,'SDK_APPROVED_REVIEW_CHANGED');
          finish(null,{...assertion,status:refusalMode?'EXPERT_SDK_REFUSAL_ASSERTIONS_PASSED':'EXPERT_SDK_BINDING_ASSERTIONS_PASSED',events});
        }
      } catch(error){finish(error);}
    });
  });
  return {...result,installation:identity.identity,realHost:'NOT_QUALIFIED',workBuddy:'NOT_OPERATED_OR_OBSERVED'};
}
