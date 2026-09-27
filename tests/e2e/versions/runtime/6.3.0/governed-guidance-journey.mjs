import assert from 'node:assert/strict';
import {exactKeys,isDigest,probeDigest} from '../../probe-session.mjs';
export function validateGovernedGuidance(input){
 exactKeys(input,['sessionDigest','bindingDigest','sources','dispositions']);assert.ok(isDigest(input.sessionDigest)&&isDigest(input.bindingDigest));
 assert.ok(Array.isArray(input.sources)&&input.sources.length>0&&input.sources.length<=16);
 const text=v=>assert.ok(typeof v==='string'&&v.length>0&&v.length<=1024&&!/:\/\/[^/]*@/.test(v));
 const expected=[];
 for(const source of input.sources){exactKeys(source,['suiteId','sourceVersion','snapshotDigest','capabilities']);text(source.suiteId);assert.match(source.sourceVersion,/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);assert.ok(isDigest(source.snapshotDigest));assert.ok(Array.isArray(source.capabilities)&&source.capabilities.length>0&&source.capabilities.length<=64);
  for(const c of source.capabilities){exactKeys(c,['id','description','digest']);text(c.id);text(c.description);assert.ok(isDigest(c.digest));expected.push(source.suiteId+':'+c.id);}
 }
 assert.equal(new Set(input.sources.map(s=>s.suiteId)).size,input.sources.length);assert.equal(new Set(expected).size,expected.length);
 assert.ok(Array.isArray(input.dispositions)&&input.dispositions.length===expected.length);
 const mapped=[];
 for(const d of input.dispositions){exactKeys(d,['sourceSuiteId','capabilityId','destination','validatorIds']);text(d.sourceSuiteId);text(d.capabilityId);mapped.push(d.sourceSuiteId+':'+d.capabilityId);exactKeys(d.destination,['owner','ref',...(Object.hasOwn(d.destination,'reason')?['reason']:[])]);assert.ok(['RUNTIME','RESOURCE','EXPERT','PROJECT','HARNESS','EXCLUDED'].includes(d.destination.owner));text(d.destination.ref);assert.ok(!/(?:\.codex\/skills|codex-suite\/|legacy-suite-fallback)/i.test(d.destination.ref));if(d.destination.owner==='EXCLUDED')text(d.destination.reason);assert.ok(Array.isArray(d.validatorIds)&&d.validatorIds.length<=64);d.validatorIds.forEach(text);if(d.destination.owner!=='EXCLUDED')assert.ok(d.validatorIds.length>0);
 }
 assert.deepEqual(mapped.slice().sort(),expected.slice().sort());
}
const unwrap=(response,tool)=>{const r=response.structuredContent??response;assert.equal(response.isError??false,false);assert.equal(r.schema,'evopilot-mcp-http-result/v1');assert.equal(r.tool,tool);assert.equal(r.ok,true);assert.equal(r.status,200);assert.ok(typeof r.requestId==='string'&&r.requestId.length>0);const value=r.response.data;const {digest,...body}=value;assert.ok(isDigest(digest));assert.equal(digest,probeDigest(body));return value;};
/** Fixed eight-turn source-neutral guidance corpus. Installed bytes, public MCP,
 * campaign authority and Host qualification belong to the outer runner. */
export async function runGovernedGuidanceJourney({input,invokeTurn,signal}){
 input=structuredClone(input);validateGovernedGuidance(input);const events=[];
 const invoke=async(text,payload,tool,mcpInput,effect)=>{signal?.throwIfAborted();const response=await invokeTurn({text,payload,tool,mcpInput,effect},{signal});signal?.throwIfAborted();const result=unwrap(response,tool);events.push({tool,effect,requestId:(response.structuredContent??response).requestId,responseDigest:probeDigest(response)});return result;};
 const purposes={help:['Explain installed-version concepts and route the user\'s intent.','Offer the smallest relevant next action.'],tutorial:['Run a side-effect-free guided tutorial.','Offer project discovery without registering anything.']};
 for(const text of ['help','tutorial']){
  const payload={sessionDigest:input.sessionDigest},message={interactionId:`expert-${text}-${input.sessionDigest}`,sessionDigest:input.sessionDigest,kind:'HELP',authority:'NONE',title:`EvoPilot ${text}`,summary:purposes[text][0],details:[purposes[text][1]],objectRefs:[],nextAction:purposes[text][1]};
  const result=await invoke(text,payload,'evopilot_interaction_render',{payload:message},'READ_GUIDANCE');assert.equal(result.schema,'evopilot-human-interaction-protocol/v1');assert.equal(result.authority,'NONE');assert.equal(result.sessionDigest,input.sessionDigest);assert.equal(result.nextAction,message.nextAction);assert.deepEqual(result.objectRefs,[]);
 }
 const inventory={sources:input.sources,dispositions:input.dispositions};
 const normalizedSources=input.sources.map(s=>({...s,capabilities:[...s.capabilities].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)})).sort((a,b)=>a.suiteId<b.suiteId?-1:a.suiteId>b.suiteId?1:0);
 for(const text of ['production reference','capability','migration']){
  const result=await invoke(text,inventory,'evopilot_capability_inventory_validate',{payload:inventory},'READ_INVENTORY');assert.equal(result.schema,'evopilot-suite-capability-inventory/v1');assert.equal(result.status,'COMPLETE');assert.equal(result.hiddenFallbackAllowed,false);assert.equal(result.coverage.total,input.dispositions.length);assert.equal(result.coverage.percent,100);assert.deepEqual(result.coverage.unmapped,[]);assert.deepEqual(result.sources,normalizedSources);
  for(const d of input.dispositions){const actual=result.dispositions.find(v=>v.sourceSuiteId===d.sourceSuiteId&&v.capabilityId===d.capabilityId);assert.ok(actual);assert.deepEqual(actual.destination,d.destination);assert.deepEqual([...actual.validatorIds].sort(),[...new Set(d.validatorIds)].sort());}
 }
 for(const [failureClass,attempt,action,budget]of [['TRANSIENT',0,'AUTO_RETRY',2],['TRANSIENT',2,'FAIL',0],['UNCERTAIN_MUTATION',0,'HUMAN_DECISION',2]]){
  const payload={failureClass,failureSignature:'governed-guidance-probe',bindingDigest:input.bindingDigest,attempt,maxAttempts:2,identicalInputs:true,reversible:true,externalEffect:false};
  const result=await invoke('recovery',payload,'evopilot_recovery_decide',{payload},'EVALUATE_RECOVERY');assert.equal(result.schema,'evopilot-recovery-decision/v1');assert.equal(result.action,action);assert.equal(result.bindingDigest,input.bindingDigest);assert.equal(result.remainingBudget,budget);assert.equal(result.humanRequired,action==='HUMAN_DECISION');
 }
 return {schema:'evopilot-governed-guidance-journey-report/v1',status:'GOVERNED_GUIDANCE_ASSERTIONS_PASSED',events,targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',realHost:'NOT_QUALIFIED',releaseAuthorized:false,controlledLifecycleMutation:'NOT_TESTED',productionReferenceAssets:'CALLER_SUPPLIED_NOT_SOURCE_ACQUIRED'};
}
