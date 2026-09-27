import assert from 'node:assert/strict';
import {exactKeys,isDigest,isId,probeDigest} from '../../probe-session.mjs';

export function validateProjectJourney(input){
  exactKeys(input,['first','successor','decisionEvidenceRef']);
  assert.ok(typeof input.decisionEvidenceRef==='string'&&/^decision:\/\/[A-Za-z0-9._/-]+$/.test(input.decisionEvidenceRef),'PROJECT_JOURNEY_DECISION_REFERENCE');
  const text=value=>assert.ok(typeof value==='string'&&value.length>0&&value.length<=1024&&!/:\/\/[^/]*@/.test(value),'PROJECT_JOURNEY_TEXT_INVALID');
  for(const d of [input.first,input.successor]){
    exactKeys(d,['schema','metadata','spec']);assert.equal(d.schema,'evopilot-evolution-project-definition/v1');
    exactKeys(d.metadata,['id','name','version','labels']);assert.ok(isId(d.metadata.id)&&isId(d.metadata.version)&&typeof d.metadata.name==='string'&&d.metadata.name.length>0);
    exactKeys(d.spec,['source','ecosystem','delivery','environment','policyRefs','lifecycleRefs','secretRefs','hostPreferences','runtimePreferences','evidenceSources']);
    exactKeys(d.spec.source,['provider','repository','defaultBranch','mode']);
    assert.ok(['github','gitlab','local-git'].includes(d.spec.source.provider));Object.values(d.spec.source).forEach(text);
    assert.ok(d.metadata.labels&&typeof d.metadata.labels==='object'&&!Array.isArray(d.metadata.labels));
    assert.ok(Object.keys(d.metadata.labels).length<=64);for(const [key,value]of Object.entries(d.metadata.labels)){text(key);text(value);assert.ok(!/password|token|secret|credential|api.?key/i.test(key),'PROJECT_JOURNEY_SECRET_FIELD');}
    exactKeys(d.spec.environment,['development','acceptance']);Object.values(d.spec.environment).forEach(text);
    exactKeys(d.spec.ecosystem,['languages','packageManagers','frameworks']);
    exactKeys(d.spec.delivery,['model','ciProvider','candidateBeforeAcceptance','noRebuildPromotion','channels']);
    text(d.spec.delivery.model);text(d.spec.delivery.ciProvider);
    assert.equal(d.spec.delivery.candidateBeforeAcceptance,true);assert.equal(d.spec.delivery.noRebuildPromotion,true);
    for(const a of [...Object.values(d.spec.ecosystem),d.spec.delivery.channels,...['policyRefs','lifecycleRefs','secretRefs','hostPreferences','runtimePreferences','evidenceSources'].map(k=>d.spec[k])]){
      assert.ok(Array.isArray(a)&&a.length<=64&&a.every(v=>typeof v==='string'&&v.length<=1024));assert.deepEqual(a,[...new Set(a)].sort(),'PROJECT_JOURNEY_CANONICAL_ARRAY_REQUIRED');
    }
    assert.equal(d.spec.secretRefs.length,0,'PROJECT_JOURNEY_NO_CREDENTIAL_USE');
  }
  assert.equal(input.first.metadata.id,input.successor.metadata.id);assert.notEqual(input.first.metadata.version,input.successor.metadata.version);
  assert.notDeepEqual(input.first.metadata.labels,input.successor.metadata.labels,'PROJECT_JOURNEY_LABEL_IMPACT_REQUIRED');
}
const unwrap=(result,tool)=>{
  const r=result.structuredContent??result;assert.equal(result.isError??false,false);assert.equal(r.schema,'evopilot-mcp-http-result/v1');assert.equal(r.tool,tool);assert.equal(r.ok,true);assert.ok([200,201].includes(r.status));assert.ok(typeof r.requestId==='string'&&r.requestId.length>0);return r.response.data;
};
const definition=(result,expected)=>{
  exactKeys(result,['schema','metadata','spec','digest']);const {digest,...body}=result;
  assert.ok(isDigest(digest));assert.deepEqual(body,expected,'PROJECT_JOURNEY_DEFINITION_CHANGED');assert.equal(digest,probeDigest(expected));return result;
};
/** Fixed project-definition journey. Caller owns installed identity, each effect
 * decision, scope, transport and durable checkpointing. No operational project,
 * Host qualification, complete RC or Target closure is inferred from this run. */
export async function runProjectDefinitionJourney({input,invokeTurn,signal}){
  input=structuredClone(input);validateProjectJourney(input);assert.equal(typeof invokeTurn,'function');
  const projectDefinitionId=input.first.metadata.id,events=[];
  async function turn(text,payload,suffix,effect,decision){
    signal?.throwIfAborted();const tool='evopilot_project_definition_'+suffix;
    const result=await invokeTurn({text,payload,tool,effect,decision},{signal});signal?.throwIfAborted();
    const data=unwrap(result,tool);events.push({tool,effect,requestId:(result.structuredContent??result).requestId,responseDigest:probeDigest(result)});return data;
  }
  const discovery=await turn('discover project',{projectFacts:{projectId:projectDefinitionId,repository:input.first.spec.source.repository}},'discover','READ_DISCOVERY');
  assert.equal(discovery.schema,'evopilot-evolution-project-discovery/v1');assert.equal(discovery.detected.projectId,projectDefinitionId);assert.equal(discovery.detected.repository,input.first.spec.source.repository);assert.equal(discovery.secretHandling,'REFERENCE_ONLY');assert.ok(discovery.questions.some(q=>q.id==='project-name'));
  const before=await turn('list project definitions',{},'list','READ_DEFINITIONS');assert.equal(before.schema,'evopilot-evolution-project-definition-list/v1');assert.ok(Array.isArray(before.items));assert.ok(!before.items.some(d=>d.metadata.id===projectDefinitionId),'PROJECT_JOURNEY_FRESH_ID_REQUIRED');
  const first=definition(await turn('register project',{projectDiscovery:discovery,projectDefinition:input.first},'register','REGISTER_DEFINITION'),input.first);
  const inspect=async(expected,version)=>definition(await turn('inspect project definition',{projectDefinitionId,...(version?{version}:{})},'inspect','READ_DEFINITION'),expected);
  await inspect(input.first);
  const successor=definition(await turn('adjust project',{projectImpact:{source:'explicit-successor-input'},projectDefinition:input.successor},'register','REGISTER_SUCCESSOR'),input.successor);
  await inspect(input.first);
  const impact=await turn('compare project versions',{projectDefinitionId,fromVersion:first.metadata.version,toVersion:successor.metadata.version},'diff','READ_IMPACT');
  assert.equal(impact.schema,'evopilot-evolution-project-impact/v1');assert.equal(impact.projectId,projectDefinitionId);assert.equal(impact.fromVersion,first.metadata.version);assert.equal(impact.toVersion,successor.metadata.version);assert.equal(impact.rollbackVersion,first.metadata.version);assert.equal(impact.compatibility,'REQUIRES_REVALIDATION');assert.ok(impact.changes.some(c=>c.path==='metadata.labels'));assert.deepEqual(impact.affectedBindings,[],'PROJECT_JOURNEY_FRESH_BINDINGS_REQUIRED');
  for(const [action,destination,current,expected] of [['activate',successor,first,input.successor],['rollback',first,successor,input.first]]){
    const evidenceRef=input.decisionEvidenceRef+'/'+action,decision={authorizationDigest:destination.digest,evidenceRef};
    const result=await turn(action+' project definition',{projectDefinitionId,version:destination.metadata.version,definitionDigest:destination.digest,expectedActiveDigest:current.digest,authorizationDigest:destination.digest,evidenceRef},action,'SELECT_DEFINITION',decision);
    assert.equal(result.schema,'evopilot-evolution-project-activation/v1');assert.equal(result.projectId,projectDefinitionId);assert.equal(result.definitionDigest,destination.digest);assert.equal(result.version,destination.metadata.version);assert.equal(result.evidenceRef,evidenceRef);assert.equal(result.reason,action==='rollback'?'explicit-rollback':'explicit-activation');
    const {digest,...body}=result;assert.equal(digest,probeDigest(body));await inspect(expected);
  }
  await inspect(input.successor,successor.metadata.version);
  const after=await turn('list project definitions',{},'list','READ_DEFINITIONS');
  assert.equal(after.items.filter(d=>d.metadata.id===projectDefinitionId).length,2);
  for(const original of before.items)assert.ok(after.items.some(d=>d.digest===original.digest),'PROJECT_JOURNEY_UNRELATED_DEFINITION_CHANGED');
  return {schema:'evopilot-project-definition-journey-report/v1',status:'PROJECT_DEFINITION_JOURNEY_ASSERTIONS_PASSED',events,firstDigest:first.digest,successorDigest:successor.digest,selectedDigest:first.digest,
    operationalProjectOnboarding:'NOT_TESTED',existingExecutionBindings:'NOT_TESTED',restart:'REQUIRES_SEPARATE_STAGE',targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',realHost:'NOT_QUALIFIED',releaseAuthorized:false};
}

/** Read back the completed declaration journey after an externally controlled
 * restart. No writes or replay; this function does not prove a restart occurred. */
export async function runProjectDefinitionReadback({input,invokeTurn,signal}) {
  input=structuredClone(input);validateProjectJourney(input);assert.equal(typeof invokeTurn,'function');
  const projectDefinitionId=input.first.metadata.id,events=[];
  async function read(text,payload,suffix) {
    signal?.throwIfAborted();const tool='evopilot_project_definition_'+suffix;
    const result=await invokeTurn({text,payload,tool,effect:'READ_DEFINITION'},{signal});signal?.throwIfAborted();
    const value=unwrap(result,tool);events.push({tool,effect:'READ_DEFINITION',requestId:(result.structuredContent??result).requestId,responseDigest:probeDigest(result)});return value;
  }
  const active=definition(await read('inspect project definition',{projectDefinitionId},'inspect'),input.first);
  for(const expected of [input.first,input.successor])definition(await read('inspect project definition',{projectDefinitionId,version:expected.metadata.version},'inspect'),expected);
  const listed=await read('list project definitions',{},'list');assert.equal(listed.schema,'evopilot-evolution-project-definition-list/v1');assert.ok(Array.isArray(listed.items));
  const own=listed.items.filter(d=>d.metadata.id===projectDefinitionId);assert.equal(own.length,2,'PROJECT_READBACK_REVISION_SET_DRIFT');
  for(const expected of [input.first,input.successor])definition(own.find(d=>d.metadata.version===expected.metadata.version),expected);
  return {schema:'evopilot-project-definition-readback-report/v1',status:'PROJECT_DEFINITION_READBACK_ASSERTIONS_PASSED',events,selectedDigest:active.digest,
    restart:'REQUIRES_INDEPENDENT_RESTART_EVIDENCE',targetCriteriaClosed:0,formalAcceptance:'NOT_EVALUATED',realHost:'NOT_QUALIFIED',releaseAuthorized:false};
}
