import assert from 'node:assert/strict';
import {exactKeys,isDigest,probeDigest} from '../../probe-session.mjs';
const decisions=['activateInitial','activateSuccessor','deactivate','archive','restore','rollback'];
export function validateLifecycleJourney(input){
  exactKeys(input,['lifecycleId','evidenceRef','decisions']);
  assert.match(input.lifecycleId,/^[a-z][a-z0-9-]{2,63}$/);
  assert.ok(typeof input.evidenceRef==='string'&&input.evidenceRef.length>0&&input.evidenceRef.length<=512);
  exactKeys(input.decisions,decisions);
  for(const name of decisions){const d=input.decisions[name];exactKeys(d,['authorizationDigest','evidenceRef']);assert.ok(isDigest(d.authorizationDigest));assert.ok(typeof d.evidenceRef==='string'&&d.evidenceRef.length>0&&d.evidenceRef.length<=512);}
}
const definition=(id,version,name)=>`schema: evopilot-lifecycle-definition/v1alpha1
metadata: { id: ${id}, name: ${name}, version: ${version} }
capabilities: [project.read]
stages:
  - id: validate
    name: Validate
    action: { uses: project.validate@1 }
    decision: { mode: AUTO }
`;
/** Fixed lifecycle state subjourney. Never starts a run or qualifies a Host.
 * Caller must supply exact decisions and independently authorize each command.
 * A thrown error stops the sequence; this helper never retries writes. */
export async function runLifecycleJourney({input,invokeTurn,signal}){
  input=structuredClone(input);validateLifecycleJourney(input);const events=[],id=input.lifecycleId;
  const call=async(text,payload,tool,mcpInput,effect,decision)=>{
    signal?.throwIfAborted();const response=await invokeTurn({text,payload,tool,mcpInput,effect,...(decision?{decision}:{})},{signal});signal?.throwIfAborted();
    const r=response.structuredContent??response;
    assert.equal(response.isError??false,false);assert.equal(r.schema,'evopilot-mcp-http-result/v1');assert.equal(r.tool,tool);assert.equal(r.ok,true);assert.equal(r.status,tool==='evopilot_lifecycle_register'?201:200);assert.ok(typeof r.requestId==='string'&&r.requestId.length>0);
    events.push({tool,effect,requestId:r.requestId,responseDigest:probeDigest(response)});return r.response.data;
  };
  const read=(text,suffix,query)=>call(text,query,`evopilot_lifecycle_${suffix}`,query,'READ_LIFECYCLE');
  const inspect=async(version,digest,active,status)=>{const result=await read('inspect lifecycle','inspect',{lifecycleId:id,version});assert.equal(result.revisionDigest,digest);assert.equal(result.active,active);if(status)assert.equal(result.state.status,status);return result;};
  const register=async(version,name,text)=>{
    const payload={yaml:definition(id,version,name),evidenceRef:input.evidenceRef};
    const result=await call(text,payload,'evopilot_lifecycle_register',{payload},'WRITE_LIFECYCLE_REVISION');
    assert.equal(result.id,id);assert.equal(result.version,version);assert.ok(isDigest(result.revisionDigest));return result.revisionDigest;
  };
  const write=(key,action,body)=>{
    const decision=input.decisions[key],payload={lifecycleId:id,...body,evidenceRef:decision.evidenceRef,authorizationDigest:decision.authorizationDigest};
    return call(`${action} lifecycle`,payload,`evopilot_lifecycle_${action}`,{lifecycleId:id,payload:{...body,evidenceRef:decision.evidenceRef}},'WRITE_LIFECYCLE_STATE',decision);
  };
  const visible=await read('list lifecycle','list',{});assert.ok(Array.isArray(visible.lifecycles));assert.equal(visible.lifecycles.some(v=>v.id===id),false,'LIFECYCLE_FIXTURE_ALREADY_EXISTS');
  const v1=await register('1.0.0','Lifecycle acceptance fixture','create lifecycle');await inspect('1.0.0',v1,false,'REGISTERED');
  await write('activateInitial','activate',{version:'1.0.0',expectedActiveDigest:null});await inspect('1.0.0',v1,true);
  const v2=await register('1.1.0','Lifecycle acceptance successor','update lifecycle');assert.notEqual(v1,v2);
  await inspect('1.0.0',v1,true);await inspect('1.1.0',v2,false,'REGISTERED');
  const diff=await read('compare lifecycle versions','diff',{lifecycleId:id,fromVersion:'1.0.0',toVersion:'1.1.0'});
  assert.equal(diff.runningBindingsAffected,false);assert.equal(diff.futurePlanningAffected,true);assert.ok(diff.changes.some(c=>c.path==='$.metadata.name'));
  await write('activateSuccessor','activate',{version:'1.1.0',expectedActiveDigest:v1});await inspect('1.0.0',v1,false);await inspect('1.1.0',v2,true);
  await write('deactivate','deactivate',{expectedActiveDigest:v2});await inspect('1.1.0',v2,false,'INACTIVE');
  await write('archive','archive',{version:'1.1.0',revisionDigest:v2});await inspect('1.1.0',v2,false,'ARCHIVED');
  await write('restore','restore',{version:'1.1.0',revisionDigest:v2});await inspect('1.1.0',v2,false,'INACTIVE');
  const rolled=await write('rollback','rollback',{version:'1.0.0',expectedActiveDigest:v2});assert.equal(rolled.action,'ROLLBACK');assert.equal(rolled.revisionDigest,v1);
  await inspect('1.0.0',v1,true);await inspect('1.1.0',v2,false);
  const audit=await read('lifecycle audit','audit',{lifecycleId:id});
  for(const [action,count]of Object.entries({REGISTER:2,ACTIVATE:2,DEACTIVATE:1,ARCHIVE:1,RESTORE:1,ROLLBACK:1}))assert.equal(audit.filter(e=>e.action===action).length,count,`LIFECYCLE_AUDIT_${action}`);
  return {schema:'evopilot-expert-lifecycle-subjourney/v1',status:'LIFECYCLE_STATE_ASSERTIONS_PASSED',events,targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',realHost:'NOT_QUALIFIED',releaseAuthorized:false,existingRunRetention:'NOT_TESTED',fullScenarioCoverage:'NOT_PROVEN'};
}
