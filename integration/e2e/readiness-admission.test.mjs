import test from 'node:test';
import assert from 'node:assert/strict';
import {createOntologyService} from '@evopilot-next/ontology/service';
import {createHarnessService} from '@evopilot-next/harness/service';
import {readinessFixture} from './fixtures/readiness.mjs';
import {syntheticAuthoring} from '../../projects/evopilot-ontology/tests/fixtures/native/authoring.mjs';
import {syntheticHarnessPackage as harnessPackage} from '../../projects/evopilot-harness/examples/native/package.mjs';
import {rehash as rehashHarness} from '../../projects/evopilot-ontology/tests/fixtures/native/package.mjs';
import {nativeBytesDigest,referenceForPackage} from '../../dist/integration/compatibility/v1/native.mjs';
import {READINESS_SPEC_PATH,validateReadinessReconstruction} from '../../dist/integration/compatibility/usability/v2/contract.mjs';
import {getGuide} from '../../dist/expert/core/guide.js';
import {assertModelingIntent} from '../../dist/integration/workspace/modeling-intent.js';
import {syntheticDecisionEvidence} from './fixtures/decision-evidence.mjs';
import {readinessDigest} from '../../dist/integration/compatibility/usability/v2/contract.mjs';
import {READINESS_STANDARD_DIGEST,readinessCriteria} from '../../dist/integration/compatibility/usability/v2/contract.mjs';
import {fixture as projectFixture,freeze} from './fixtures/native-project.mjs';
import {inspectSourceInventory} from '../../dist/integration/workspace/native-project.js';

test('v2 read envelopes reject write-only fields without changing any owner revision',async()=>{
  const f=await readinessFixture();const ontology=createOntologyService({workspaceRoot:f.state,workspaceId:f.workspaceId});ontology.initialize();
  try{
    for(const [owner,service] of [['runtime',f.runtime()],['harness',f.harness()],['ontology',ontology]]){
      const scope=f.scope,input={standardVersion:'v2'},operation='readiness.standard.inspect';
      const before=service.execute({operation:'workspace.inspect',scope,input:{}}).revision;
      await assert.rejects(service.readiness({operation,scope,input,requestId:'read-with-cas',expectedRevision:before}),{code:'READINESS_SCHEMA'});
      await assert.rejects(service.readiness({operation,scope,input:{...input,humanEvidenceRef:'not-a-read-field'}}),{code:'READINESS_SCHEMA'});
      const valid=await service.readiness({operation,scope,input});assert.equal(valid.standardDigest,READINESS_STANDARD_DIGEST,owner);
      assert.equal(service.execute({operation:'workspace.inspect',scope,input:{}}).revision,before,owner);
    }
    await assert.rejects(f.read('runtime','readiness.intent.review',{definition:f.definition,previousDigest:f.intent.digest,humanEvidenceRef:'record-only'}),{code:'READINESS_SCHEMA'});
    await assert.rejects(f.read('runtime','readiness.intent.read',{intentDigest:f.intent.digest}),{code:'READINESS_SCHEMA'});
    assert.equal((await f.read('runtime','readiness.intent.read',{digest:f.intent.digest})).digest,f.intent.digest);
  }finally{ontology.close();f.close();}
});

test('readiness CAS uses its own counter in a nonempty workspace',async()=>{
  const f=await readinessFixture();try{
    const legacy=f.runtime().execute({operation:'workspace.inspect',scope:f.scope,input:{}}).revision;
    const current=(await f.read('runtime','readiness.inspect')).revision;assert.notEqual(legacy,current);
    const definition={...f.definition,purpose:'Synthetic changed purpose for counter separation'};
    const humanEvidenceRef=syntheticDecisionEvidence(f.root,{owner:'runtime',operation:'readiness.intent.record',workspaceId:f.workspaceId,scope:f.scope,reviewDigest:readinessDigest(definition),decision:'ACCEPT'});
    const request={operation:'readiness.intent.record',scope:f.scope,input:{standardVersion:'v2',definition,previousDigest:f.intent.digest,humanEvidenceRef},requestId:'wrong-counter',expectedRevision:legacy};
    await assert.rejects(f.runtime().readiness(request),{code:'REVISION_CONFLICT'});
    assert.equal(await f.read('runtime','readiness.receipt.inspect',{requestId:request.requestId}),null);
    assert.equal((await f.read('runtime','readiness.intent.read',{digest:f.intent.digest})).current,true);
    const receipt=await f.runtime().readiness({...request,requestId:'correct-counter',expectedRevision:current});
    assert.equal(receipt.revision,current+1);assert.equal(f.runtime().execute({operation:'workspace.inspect',scope:f.scope,input:{}}).revision,legacy);
  }finally{f.close();}
});

for(const mode of ['SOURCE_REVERSE','DOCUMENT_FORWARD','ASSET_COMPOSITION'])for(const owner of ['ontology','harness'])test(owner+' native admission requires exact v2 intent for '+mode,async()=>{
  const f=await readinessFixture({mode});let service;
  try{
    // Synthetic materials exercise the real native admission path, not project acceptance.
    f.harness().close();const create=owner==='ontology'?createOntologyService:createHarnessService;
    const pkg=owner==='ontology'?f.pkg:harnessPackage();
    if(owner==='harness'){
      for(const [path,content] of Object.entries({[READINESS_SPEC_PATH]:JSON.stringify(f.specification),...f.projection.files})){
        pkg.files[path]=content;pkg.manifest.files.push({path,mediaType:path.endsWith('.json')?'application/json':'text/markdown',sha256:nativeBytesDigest(content).slice(7)});
      }rehashHarness(pkg);for(const f of pkg.manifest.files)f.mediaType=f.path.endsWith('.json')?'application/json':f.path.endsWith('.md')?'text/markdown':'text/plain';
    }
    const options={workspaceRoot:f.state,workspaceId:f.workspaceId};
    const open=resolver=>{service=create(options,{resolveNativeAuthoring:syntheticAuthoring,...(resolver?{resolveReadinessAuthoring:resolver}:{})});service.initialize();};
    const put=id=>service.native({operation:'native.package.put',scope:f.scope,input:{package:pkg},requestId:id,expectedRevision:service.execute({operation:'workspace.inspect',scope:f.scope,input:{}}).revision});
    open();await assert.rejects(put('no-intent'),{code:'READINESS_INTENT_REQUIRED'});service.close();
    open(()=>({...f.intent,digest:'sha256:'+'0'.repeat(64)}));await assert.rejects(put('wrong-intent'),{code:'READINESS_INTENT_STALE'});service.close();
    open(()=>f.intent);const receipt=await put('admitted');assert.equal(receipt.operation,'native.package.put');
    const actual=await service.native({operation:'native.package.inspect',scope:f.scope,input:{id:pkg.manifest.id,version:pkg.manifest.version}});assert.equal(actual.package.files[READINESS_SPEC_PATH],pkg.files[READINESS_SPEC_PATH]);
  }finally{service?.close();f.close();}
});
test('reconstruction provider cannot assert VERIFIED without scoped artifact/environment evidence',()=>{
  const base={status:'VERIFIED',evidenceDigests:[],artifactDigest:null,environmentDigest:null,standardVersion:null,scopeDescription:null};
  assert.throws(()=>validateReadinessReconstruction(base),{code:'READINESS_RECONSTRUCTION_EVIDENCE'});
  assert.throws(()=>validateReadinessReconstruction({...base,status:'PASS'}),{code:'READINESS_RECONSTRUCTION'});
});
test('content completion readback cannot present a retained success as current after a confirmed defect',async()=>{
  const f=await readinessFixture();try{
    await f.assess();const receipt=await f.write('runtime','readiness.project.complete',{intentDigest:f.intent.digest,assessmentId:'counter-assessment'});
    let view=await f.read('runtime','readiness.project.inspect',{intentDigest:f.intent.digest});assert.equal(view.currentStatus,'CURRENT');
    await f.write('harness','readiness.gap.record',{projectionDigest:f.projection.digest,criterionId:'closure:C06',reason:'Synthetic recovery omission',evidenceDigest:nativeBytesDigest('synthetic defect')});
    view=await f.read('runtime','readiness.project.inspect',{intentDigest:f.intent.digest});assert.equal(view.currentStatus,'STALE');assert.deepEqual(view.completion,receipt.result);assert.equal(view.assessment.assetAssessment.level,null);
    const reReview=await f.read('harness','readiness.review.prepare',{reference:f.projection.reference,report:f.report});assert.equal(reReview.candidateContent.status,'FAILED');assert.equal(reReview.candidateContent.level,null);assert(reReview.candidateContent.gaps.some(g=>g.code==='READINESS_CONFIRMED_DEFECT'));
  }finally{f.close();}
});
test('a replaced intent keeps its historical completion but is explicitly stale',async()=>{
  const f=await readinessFixture();try{
    await f.assess();const completed=await f.write('runtime','readiness.project.complete',{intentDigest:f.intent.digest,assessmentId:'counter-assessment'});
    const definition={...f.definition,purpose:'Revised independent implementation purpose'};
    const humanEvidenceRef=syntheticDecisionEvidence(f.root,{owner:'runtime',operation:'readiness.intent.record',workspaceId:f.workspaceId,scope:f.scope,reviewDigest:readinessDigest(definition),decision:'ACCEPT'});
    await f.write('runtime','readiness.intent.record',{definition,previousDigest:f.intent.digest,humanEvidenceRef});
    const view=await f.read('runtime','readiness.project.inspect',{intentDigest:f.intent.digest});
    assert.equal(view.currentStatus,'STALE');assert.deepEqual(view.completion,completed.result);assert.equal(view.assessment,null);
  }finally{f.close();}
});
test('six current Expert guides keep v2 content and optional execution distinct',()=>{
  for(const id of ['ontology-forward','ontology-reverse','usability-assessment','asset-consumption','controlled-reconstruction','reconstruction-recovery']){
    const guide=getGuide(id),body=JSON.stringify(guide.steps);assert(body.includes('v2')||body.includes('content'));assert(guide.sourceReferences.includes('docs/asset-readiness-v081-workflow.md'));assert.equal(guide.authority,false);
  }
  assert(getGuide('ontology-forward').steps.some(s=>s.includes('Image-only')));
  assert(getGuide('controlled-reconstruction').steps.some(s=>s.includes('zero build/SSH/database')));
});
for(const mode of ['SOURCE_REVERSE','DOCUMENT_FORWARD','ASSET_COMPOSITION'])test('formal '+mode+' intent binds exact source hash and native variants, not matching prose',async()=>{
  const f=await readinessFixture({mode});try{
    const definition=structuredClone(f.definition);definition.requirements[0].acceptanceVariants=['positive','negative'];
    const proof=()=>({definition,humanEvidenceRef:syntheticDecisionEvidence(f.root,{owner:'runtime',operation:'readiness.intent.record',workspaceId:f.workspaceId,scope:f.scope,reviewDigest:readinessDigest(definition),decision:'ACCEPT'})});
    const context={workspaceId:f.workspaceId,scope:f.scope,sourceRoot:definition.sources[0].reference,revision:definition.sources[0].revision,sourceDigest:definition.sources[0].digest,direction:mode==='SOURCE_REVERSE'?'reverse':'forward',requirements:{ownerRequirements:[{criterionId:'meaning',variantIds:['positive','negative']}]}};
    assert.equal(assertModelingIntent(proof(),context).definition.targetLevel,'L3');
    assert.throws(()=>assertModelingIntent(proof(),{...context,sourceDigest:nativeBytesDigest('changed source')}),{code:'MODELING_INTENT_STALE'});
    definition.requirements[0].acceptance='Both positive and negative are mentioned in prose.';delete definition.requirements[0].acceptanceVariants;
    assert.throws(()=>assertModelingIntent(proof(),context),{code:'MODELING_INTENT_ACCEPTANCE'});
  }finally{f.close();}
});

for(const mode of ['SOURCE_REVERSE','DOCUMENT_FORWARD','ASSET_COMPOSITION'])test('complete native v2 authoring: '+mode+' prepare, preflight, freeze, materialize and both owner admissions',async()=>{
  const f=projectFixture(mode==='SOURCE_REVERSE'?'reverse':'forward');const services=[];
  try{
    const inventory=inspectSourceInventory(f.source,f.input.direction,f.input.revision);
    const definition={schema:'evopilot-modeling-intent/v2',standardVersion:'v2',standardDigest:READINESS_STANDARD_DIGEST,workspaceId:'synthetic',scope:f.scope,id:'native-v2',mode,purpose:'Synthetic native authoring integration',functionalScope:'The complete fixed synthetic input',exclusions:[],targetLevel:'L1',sources:[{id:'source',kind:mode==='SOURCE_REVERSE'?'SOURCE':mode==='DOCUMENT_FORWARD'?'DOCUMENT':'ASSET',reference:f.source,revision:f.input.revision,digest:inventory.treeDigest}],requirements:f.input.requirements.ownerRequirements.map(r=>({id:r.criterionId,kind:'DOMAIN',description:r.description,acceptance:'Preserve the exact independently fixed native variants.',acceptanceVariants:r.variantIds,sourceIds:['source'],excludedFacets:[]})),userIntentOrigin:'explicit-request'};
    const intentDigest=readinessDigest(definition);
    f.input.modelingIntent={definition,humanEvidenceRef:syntheticDecisionEvidence(f.root,{owner:'runtime',operation:'readiness.intent.record',workspaceId:'synthetic',scope:f.scope,reviewDigest:intentDigest,decision:'ACCEPT'})};
    const specification={schema:'evopilot-readiness-specification/v2',standardVersion:'v2',standardDigest:READINESS_STANDARD_DIGEST,intentDigest,intent:definition,author:'Synthetic integration fixture',statements:readinessCriteria(definition).map(criterionId=>({criterionId,text:'Synthetic candidate; this test grants no real content grade.',status:'MISSING',provenance:[],citations:[]})),dependencies:[],normativeFiles:[]};
    for(const pkg of Object.values(f.packages)){
      pkg.files[READINESS_SPEC_PATH]=JSON.stringify(specification);
      pkg.manifest.files.push({path:READINESS_SPEC_PATH,mediaType:'application/json',sha256:nativeBytesDigest(pkg.files[READINESS_SPEC_PATH]).slice(7)});rehashHarness(pkg);
    }
    if(mode==='ASSET_COMPOSITION'){
      for(const owner of ['ontology','harness']){
        const conflict=structuredClone(f.packages),reference=referenceForPackage(conflict[owner]);
        conflict[owner].manifest.dependencies=[reference,{...reference,version:'9.9.9'}];
        await assert.rejects(f.service.preflight({project:f.input,packages:conflict}),{code:'READINESS_DEPENDENCY'});
      }
    }
    const preflight=await f.service.preflight({project:f.input,packages:f.packages});assert.equal(preflight.checks.fixedCoverage,true);
    await freeze(f);await f.service.materialize({scope:f.scope,id:f.input.id,packages:f.packages});
    assert.equal(f.service.checkLayout({scope:f.scope,id:f.input.id}).conforms,true);
    for(const [owner,create] of [['ontology',createOntologyService],['harness',createHarnessService]]){
      const service=create({workspaceRoot:f.stateRoot,workspaceId:'synthetic'},{resolveNativeAuthoring:f.service.resolveNativeAuthoring,resolveReadinessAuthoring:f.service.resolveReadinessAuthoring});services.push(service);service.initialize();
      const revision=service.execute({operation:'workspace.inspect',scope:f.scope,input:{}}).revision;
      await service.native({operation:'native.package.put',scope:f.scope,input:{package:f.packages[owner]},requestId:'synthetic-native-v2-'+owner,expectedRevision:revision});
      const retained=await service.native({operation:'native.package.inspect',scope:f.scope,input:{id:f.packages[owner].manifest.id,version:f.packages[owner].manifest.version}});
      assert.equal(retained.package.files[READINESS_SPEC_PATH],f.packages[owner].files[READINESS_SPEC_PATH]);
    }
  }finally{for(const service of services)service.close();f.cleanup();}
});
