import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root));
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
export function checkControlledEvaluation(bindingTarget){
  const target=JSON.parse(read('governance/controlled-evaluation-v08.json'));
  const planning=JSON.parse(read('governance/asset-usability-v08.json'));
  assert.equal(target.schema,'evopilot-controlled-evaluation-correction/v1');
  assert.equal(target.status,'ACCEPTED_SCOPE_NOT_ACCEPTANCE');assert.equal(target.releaseLine,'v0.8');
  for(const key of ['authority','releaseAuthorized','assetApproval','newExecutionBudget','databaseExecutionAuthorized','defaultEnabled'])assert.equal(target[key],false,key);
  for(const key of ['generationBuildUnchanged','legacySchemasPreserved','nativeV1BytesUnchanged'])assert.equal(target[key],true,key);
  assert.equal(target.newOwnerStateMarker,9);
  assert.deepEqual(target.scope,['Owned sandboxed supervisor evaluation','Bound statement/object database evaluation']);
  assert.deepEqual(target.requiredGuards.map(g=>g.id),Array.from({length:28},(_,i)=>'EVAL-'+String(i+1).padStart(2,'0')));
  assert(target.requiredGuards.every(g=>g.required===true&&g.result==='NOT_EVALUATED'));
  assert.deepEqual(target.unchanged,{requirements:18,acceptanceIds:20,deliveryVariants:79,sourceVariants:64,evopilotOperations:235,evopilotSdkPaths:162,evopilotIntegrationObligations:20,datarigV2MandatoryRows:270,datarigV2IntegrationObligations:17,cleanReconstructionsPerWholeProject:2});
  assert.equal(planning.controlledEvaluationCorrection.target,'governance/controlled-evaluation-v08.json');
  assert.equal(planning.controlledEvaluationCorrection.adr,target.adr);
  assert.equal(planning.controlledEvaluationCorrection.existingAcceptanceUnchanged,true);
  assert.equal(planning.controlledEvaluationCorrection.generationBuildUnchanged,true);
  assert.equal(planning.controlledEvaluationCorrection.defaultEnabled,false);
  assert(read(target.adr).toString().includes('Status: accepted boundary correction'));
  assert(read('docs/roadmap.md').toString().includes('controlled-evaluation-v08.json'));
  if(bindingTarget){
    const b=bindingTarget.evaluationBindingRevision;
    assert.equal(b.schema,'evopilot-evaluation-target-binding/v1');
    for(const field of ['predecessorTargetDigest','predecessorPlanningDigest','predecessorSpecificationDigest','predecessorRoadmapDigest','predecessorBindingDigest'])assert.match(b[field],/^sha256:[a-f0-9]{64}$/);
    assert.equal(b.correctionTarget,'governance/controlled-evaluation-v08.json');
    assert.equal(b.correctionTargetDigest,hash(read(b.correctionTarget)));
    assert.equal(b.correctionAdrDigest,hash(read(target.adr)));
    assert.equal(b.requirementsUnchanged,true);assert.equal(b.acceptanceUnchanged,true);assert.equal(b.authority,false);
    const previous=bindingTarget.bindingRevision;
    assert.equal(b.predecessorBindingDigest,hash(JSON.stringify(Object.fromEntries(Object.keys(previous).sort().map(k=>[k,previous[k]])))));
  }
  return {status:'ALIGNED',targetDigest:hash(read('governance/controlled-evaluation-v08.json')),roadmapDigest:hash(read('docs/roadmap.md')),requiredGuards:28,acceptance:'NOT_EVALUATED',authority:false,releaseAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(checkControlledEvaluation()));
