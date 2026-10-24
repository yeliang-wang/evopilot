import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { feedbackBounded } from '../../dist/integration/compatibility/feedback/v1/feedback.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createComposition, loadInstalledProducts } from '../../dist/integration/composition.js';
import { createLocalCollector } from '../../dist/integration/collection/local.js';
import { maintainWorkspace } from '../../dist/integration/workspace/maintenance.js';
import { nativeSha256, nativePackageDigest, referenceForPackage, NATIVE_CONTRACT_DIGEST } from '../../dist/integration/compatibility/v1/native.mjs';
import { rehash } from '../../projects/evopilot-ontology/tests/fixtures/native/package.mjs';
import { createFeedbackStore, inspectFeedbackSnapshot } from '../../dist/integration/compatibility/feedback/v1/feedback.mjs';
import { fixture, freeze, syntheticModelingIntent } from './fixtures/native-project.mjs';
import { syntheticDecisionEvidence } from './fixtures/decision-evidence.mjs';

test('feedback provider timeout preserves uncertainty without a second invocation',async()=>{let calls=0;await assert.rejects(feedbackBounded(()=>{calls++;return new Promise(()=>{});},15),{code:'FEEDBACK_TIMEOUT'});assert.equal(calls,1);});

test('feedback store: atomic Run/outbox rollback, CAS and conflicting replay',()=>{
 const db=new DatabaseSync(':memory:');const store={db,identity:{id:'synthetic'},guard(){}};const s=createFeedbackStore(store,'runtime');const scope={visibility:'private',projectId:'fictional'};
 const req={operation:'test.configure',scope,input:{},requestId:'one',expectedRevision:0};
 const receipt=s.mutate(req,()=>{s.put(scope,'configuration','p',{enabled:true});return {configured:true};});
 assert.deepEqual(s.mutate(req,()=>{throw Error('must not repeat');}),receipt);
 assert.throws(()=>s.mutate({...req,input:{different:true}},()=>({})),{code:'REQUEST_CONFLICT'});
 assert.throws(()=>s.mutate({...req,requestId:'stale'},()=>({})),{code:'REVISION_CONFLICT'});
 db.exec('CREATE TABLE run_results(id TEXT PRIMARY KEY, result TEXT)');
 db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO run_results VALUES(?,?)').run('run','SUCCEEDED');s.put(scope,'outbox','event',{pending:true});s.recordTransition({run:'run'},{pending:true});db.exec('ROLLBACK');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM run_results').get().n,0);assert.equal(s.get(scope,'outbox','event'),null);assert.equal(s.inspect(scope).revision,1);
 db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO run_results VALUES(?,?)').run('run','SUCCEEDED');s.put(scope,'outbox','event',{pending:true});s.recordTransition({run:'run'},{pending:true});db.exec('COMMIT');
 const snapshot=inspectFeedbackSnapshot(db);assert.equal(snapshot.recordCount,2);assert.equal(snapshot.revision,2);
 db.prepare("UPDATE feedback_records SET data='{}' WHERE kind='outbox'").run();assert.throws(()=>inspectFeedbackSnapshot(db),{code:'FEEDBACK_STATE'});db.close();
});

test('v0.4: registered RC failure and correction retain owner feedback, require review and survive restart', {timeout:150_000}, async()=>{
 assert.ok(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN,'Pinned toolchain required');
 const toolchain=JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN,'utf8'));
 const f=fixture('reverse','private'),scope=f.scope,options={workspaceRoot:f.stateRoot,workspaceId:'synthetic'},apis=await loadInstalledProducts();
 let loseResponse=true,ingestCalls=0;
 // Isolated fault injection wraps the real locked Conftest binary. Every receipt still comes from an actual subprocess and owner store.
 const faultMarker=path.join(f.root,'inject-conftest-exit'),wrapper=path.join(f.root,'conftest-wrapper.mjs');
 const wrapperSource=`#!${process.execPath}\nimport fs from 'node:fs';import {spawnSync} from 'node:child_process';if(fs.existsSync(${JSON.stringify(faultMarker)}))process.exit(73);const r=spawnSync(${JSON.stringify(toolchain.tools.conftest.executable)},process.argv.slice(2),{stdio:'inherit'});process.exit(r.status??74);\n`;
 fs.writeFileSync(wrapper,wrapperSource,{mode:0o700});const faultToolchain=structuredClone(toolchain);faultToolchain.tools.conftest={...toolchain.tools.conftest,executable:wrapper,sha256:(await import('node:crypto')).createHash('sha256').update(wrapperSource).digest('hex')};
 const realFactory=apis.harness.createHarnessService;
 apis.harness={...apis.harness,createHarnessService(...args){const service=realFactory(args[0],{...args[1],nativeToolchain:faultToolchain});return {...service,async feedback(request){const result=await service.feedback(request);if(request.operation==='feedback.ingest'){ingestCalls++;if(loseResponse){loseResponse=false;throw Object.assign(Error('Synthetic transport loses response after actual owner commit'),{code:'SIMULATED_RESPONSE_LOSS'});}}return result;}};}};
 for(const r of f.input.requirements.ownerRequirements)if(r.criterionId.startsWith('harness:'))r.origin='execution-result';
 f.packages.harness.manifest.dependencies=[referenceForPackage(f.packages.ontology)];
 f.input.modelingIntent=syntheticModelingIntent(f);
 const frozen=await freeze(f);await f.service.materialize({scope,id:f.input.id,packages:f.packages});
 const binding=await f.service.prepareExecution({scope,id:f.input.id,executionId:'feedback-execution',toolchainId:'node'});
 const trusted={toolchain,...createLocalCollector({resolveExecution:f.service.resolveExecution}),resolveNativeAuthoring:f.service.resolveNativeAuthoring,inspectSource:f.service.inspectSource,resolveRequirements:f.service.resolveRequirements,verifyProject:f.service.verifyProject};
 let c=createComposition(options,apis,{},trusted),seq=0;
 const query=(owner,operation,input={},queryScope=scope)=>c.native(owner,{operation,scope:queryScope,input});
 async function mutate(owner,operation,input){
  if(input.humanEvidenceRef==='synthetic')input={...input,humanEvidenceRef:syntheticDecisionEvidence(f.root,{owner,operation,workspaceId:'synthetic',scope,reviewDigest:input.reviewDigest,decision:input.decision??'APPROVE'})};
  const expectedRevision=operation.startsWith('feedback.')?(await query(owner,'feedback.inspect')).revision:owner==='runtime'?(await query(owner,'workspace.inspect')).revision:c.inspect(owner,scope).revision;
  return c.native(owner,{operation,scope,input,expectedRevision,requestId:'feedback-test-'+(++seq)});
 }
 try {
  const pins={};for(const owner of ['ontology','harness']){
   const pkg=f.packages[owner],id={id:pkg.manifest.id,version:pkg.manifest.version};
   await mutate(owner,'native.package.put',{package:pkg});await mutate(owner,'native.package.validate',id);const review=(await mutate(owner,'native.package.review',id)).result;
   await mutate(owner,'native.package.decide',{...id,reviewDigest:review.reviewDigest,decision:'APPROVE',humanEvidenceRef:'synthetic'});pins[owner]=(await mutate(owner,'native.package.publish',id)).result.reference;
  }
  const standardPins=Object.fromEntries(['ontology','harness'].map(o=>[o,{standardDigest:pins[o].standardDigest,standardLockDigest:pins[o].standardLockDigest}]));
  const sourceScope=frozen.candidate.sourceScope,requirements=frozen.candidate.nativeRequirements;
  const project=(await mutate('runtime','project.prepare',{id:'feedback-project',goalId:'feedback-goal',sourceScope,standardPins,requirements})).result;
  assert.deepEqual(await query('runtime','feedback.list'),[]);
  const savedRuns=[];
  for(const [number,warnings] of [[0,0],[1,1],[2,0],[3,0]]) {
   const id='rc-'+number;const recipe={schema:'evopilot-collection-recipe/v1',sourceScope,executable:binding.toolFiles[0].path,executableDigest:'sha256:'+binding.toolFiles[0].sha256,argv:['-e',`console.log(JSON.stringify({tests:{exitCode:0},evidenceDigest:"actual-process",warnings:${warnings}}))`],cwd:binding.cwd,environment:{PATH:'/usr/bin:/bin'},toolchainLockDigest:binding.toolchainLockDigest,timeoutMs:5000,maxOutputBytes:65536,allowedOutputs:['stdout.txt','stderr.txt'],network:{mode:'none',hosts:[]},selectors:['tests','evidenceDigest','warnings'].map(id=>({id,output:'stdout.txt',kind:'json-pointer',pointer:'/'+id}))};
   const collection=(await mutate('runtime','collection.prepare',{id,projectId:project.id,recipe})).result;
   await mutate('runtime','collection.decide',{id,reviewDigest:collection.reviewDigest,decision:'APPROVE',humanEvidenceRef:'synthetic'});const raw=(await mutate('runtime','collection.execute',{id})).result.receipt;
   const observation={schema:'evopilot-observation/v1',origin:'execution-result',source:{revision:sourceScope.revision,digest:sourceScope.treeDigest},values:raw.observations,collectionReceiptRef:{id:raw.id,digest:raw.digest,claimId:raw.claimId},sourceScopeDigest:nativeSha256(sourceScope)};
   const input={schema:'runtime-composition/v1',contractDigest:NATIVE_CONTRACT_DIGEST,projectCandidateDigest:project.candidateDigest,standardPins,sourceScope,requirements,effectiveConfig:{params:{maxWarnings:0}},nativeInputs:{ontology:{packageDigest:nativePackageDigest(f.packages.ontology)},harness:{observation}},collectionReceipts:[{id:raw.id,digest:raw.digest}]};
   const planned=(await mutate('runtime','run.prepare',{id,projectId:project.id,goalId:project.goalId,ontology:pins.ontology,harness:pins.harness,input})).result;
   await mutate('runtime','run.decide',{id,reviewDigest:planned.reviewDigest,decision:'APPROVE',humanEvidenceRef:'synthetic'});
   if(number===3)fs.writeFileSync(faultMarker,'synthetic process failure');
   const run=(await mutate('runtime','run.dispatch',{id})).result;
   if(number===0){assert.deepEqual(await query('runtime','feedback.list'),[]);await mutate('runtime','feedback.configure',{projectId:project.id});continue;}
   savedRuns.push(run);
   if(number===3){fs.unlinkSync(faultMarker);assert.equal(run.stage,'FAILED');assert.equal(run.receipt.ownerReceipts.harness.executionStatus,'ERROR');const event=(await query('runtime','feedback.list')).find(x=>x.event.runId===id);assert.equal(event.event.stage,'FAILED');assert.equal(event.event.results.harness.qualityStatus,'ERROR');assert.ok(event.destinations.ontology&&event.destinations.harness);continue;}
   assert.equal(run.stage,'SUCCEEDED');assert.equal(run.receipt.ownerReceipts.harness.qualityStatus,number===1?'FAIL':'PASS');
   let out=(await query('runtime','feedback.list')).find(x=>x.event.runId===id);assert.ok(out);assert.equal(out.event.source.revision,f.input.revision);
   if(number===1){
    assert.equal(out.errors.harness,'SIMULATED_RESPONSE_LOSS');assert.equal(out.destinations.harness,null);
    assert.equal((await query('harness','feedback.list')).length,1);assert.equal(ingestCalls,1);
    c.close();c=createComposition(options,apis,{},trusted);
    const request={operation:'feedback.deliver',scope,input:{id:out.event.id},requestId:'lost-response-recovery',expectedRevision:(await query('runtime','feedback.inspect')).revision};
    const resumed=await c.native('runtime',request);assert.deepEqual(await c.native('runtime',request),resumed);
    assert.equal(ingestCalls,1,'Recovery must read the retained inbox rather than redeliver');out=await query('runtime','feedback.read',{id:out.event.id});
   }
   assert.deepEqual(out.errors,{ontology:null,harness:null},JSON.stringify(out));assert.ok(out.destinations.ontology&&out.destinations.harness);assert.equal(out.dispositions.ontology,null);
   for(const owner of ['ontology','harness']){const inbox=await query(owner,'feedback.read',{id:out.event.id});assert.equal(inbox.candidate.evidenceDigest,nativeSha256(run.receipt));assert.equal(inbox.candidate.status,'REVIEW_REQUIRED');}
  }
  const events=await query('runtime','feedback.list');assert.equal(events.length,3);assert.notEqual(events[0].event.id,events[1].event.id);
  for(const owner of ['ontology','harness'])assert.equal((await query(owner,'feedback.list')).length,3,'Owner receipts must not echo into additional events');
  const failed=events.find(x=>x.event.runId==='rc-1');
  for(const owner of ['ontology','harness']){
   const changed=structuredClone(f.packages[owner]);changed.manifest.version='1.1.0';
   if(owner==='ontology'){
    assert.match(changed.files['shapes/domain.ttl'],/sh:path ex:limit/);
    changed.files['model.ttl']=changed.files['model.ttl'].replace('rdfs:comment "Project capability link"','rdfs:comment "Deprecated project capability relation; preserved for existing consumers"');
    changed.files['shapes/domain.ttl']=changed.files['shapes/domain.ttl'].replace('sh:maxInclusive 10','sh:maxInclusive 6').replace('sh:path ex:limit; sh:minCount 1; sh:maxCount 1','sh:path ex:limit; sh:minCount 1; sh:maxCount 2');
    changed.files['tests/over-limit.ttl']=changed.files['tests/positive.ttl'].replace('ex:limit 3','ex:limit 7');
    const cases=JSON.parse(changed.files['tests/cases.json']);cases.cases.push({id:'over-limit',data:'tests/over-limit.ttl',expectedConforms:false,requirementIds:['ontology:scope'],shapeIds:['https://example.invalid/r1/LimitShape']});changed.files['tests/cases.json']=JSON.stringify(cases);
    const coverage=JSON.parse(changed.files['scope/coverage.json']);coverage.requiredCaseIds.push('over-limit');changed.files['scope/coverage.json']=JSON.stringify(coverage);
   }else{
    changed.files['policy/quality.rego']=changed.files['policy/quality.rego'].replace('  object.get(input.values,"warnings",-1) > data.params.maxWarnings','  is_number(object.get(input.values,"warnings",-1))\n  object.get(input.values,"warnings",-1) > data.params.maxWarnings');
    changed.files['policy/quality.rego']+='\nwarn_H003 contains {"msg":"warning count must be numeric","ruleId":"H003"} if { "warnings" in object.keys(input.values); not is_number(input.values.warnings) }\n';
    changed.files['policy/quality_test.rego']+='\ntest_H003_type if { count(warn_H003) == 1 with input as {"values":{"warnings":"unknown"}} }\n';
    const catalog=JSON.parse(changed.files['rule-catalog.json']);const rule=catalog.rules.find(r=>r.ruleId==='H003');rule.testIds.push('test_H003_type');rule.caseIds.push('invalid-warning-type');changed.files['rule-catalog.json']=JSON.stringify(catalog);
    const coverage=JSON.parse(changed.files['coverage.json']);coverage.requiredTestIds.push('test_H003_type');coverage.requiredCaseIds.push('invalid-warning-type');coverage.requirements.find(r=>r.ruleIds.includes('H003')).caseIds.push('invalid-warning-type');coverage.cases.push({id:'invalid-warning-type',input:'tests/fixtures/invalid-warning-type.json',expected:'WARN',expectedRuleIds:['H003']});changed.files['coverage.json']=JSON.stringify(coverage);
    const observation=JSON.parse(changed.files['observations/current.json']);observation.values.warnings='unknown';changed.files['tests/fixtures/invalid-warning-type.json']=JSON.stringify(observation);
   }
   rehash(changed);
   const correctedInput={...f.input,id:'correction-'+owner,requirements:structuredClone(f.input.requirements)},correctedPackages={...f.packages,[owner]:changed};
   // New behavior is added to the independently fixed test inventory before candidate review.
   correctedInput.requirements.ownerRequirements.find(r=>r.criterionId===(owner==='ontology'?'ontology:scope':'harness:requirement-H003')).variantIds.push(owner==='ontology'?'over-limit':'invalid-warning-type');
   correctedInput.modelingIntent=syntheticModelingIntent({...f,input:correctedInput});
   await freeze(f,correctedInput,correctedPackages);await f.service.materialize({scope,id:correctedInput.id,packages:correctedPackages});
   const identity={id:changed.manifest.id,version:changed.manifest.version};await mutate(owner,'native.package.put',{package:changed});
   const validation=(await mutate(owner,'native.package.validate',identity)).result;assert.equal(owner==='ontology'?validation.status:validation.qualityStatus,owner==='ontology'?'CONFORMS':'PASS',JSON.stringify({diagnostics:validation.diagnostics,issues:validation.issues}));
   const assetReview=(await mutate(owner,'native.package.review',identity)).result;await mutate(owner,'native.package.decide',{...identity,reviewDigest:assetReview.reviewDigest,decision:'APPROVE',humanEvidenceRef:'synthetic'});const reference=(await mutate(owner,'native.package.publish',identity)).result.reference;
   const proposal={mode:'DELIVER',reference,rationale:'Synthetic bounded interpretation strengthens the unchanged source requirement; actual native cases passed.',changes:[{kind:owner==='ontology'?'cardinality':'rule',identifiers:[owner==='ontology'?'https://example.invalid/r1/LimitShape':'H003'],sourcePaths:[owner==='ontology'?'sources/source.txt':'sources/requirements.txt'],explanation:'Add a missing upper-bound/type regression; old published assets remain intact.'}]};
   if(owner==='ontology')proposal.changes.push({kind:'relation',identifiers:['https://example.invalid/r1/hasCapability'],sourcePaths:['sources/source.txt'],explanation:'Retain existing relation with explicit deprecation and compatibility impact.'},{kind:'deprecation',identifiers:['https://example.invalid/r1/hasCapability'],sourcePaths:['sources/source.txt'],explanation:'Identifier stays resolvable; dependent Harness must review before removal.'});
   const review=(await mutate(owner,'feedback.propose',{id:failed.event.id,proposal})).result;assert.ok(review.changedFiles.length>0);
   if(owner==='ontology')assert.deepEqual(review.dependentHarness,[pins.harness]);
   await assert.rejects(mutate(owner,'feedback.propose',{id:failed.event.id,proposal:{...proposal,mode:'REUSE'}}),{code:'REUSE_MISMATCH'});
   const before=await query(owner,'native.package.readback',{id:pins[owner].id,version:pins[owner].version});assert.equal(before.reference.digest,pins[owner].digest);
   await mutate(owner,'feedback.decide',{id:failed.event.id,reviewDigest:review.reviewDigest,decision:'APPROVE',humanEvidenceRef:'synthetic'});
  }
  const good=events.find(x=>x.event.runId==='rc-2');const run=savedRuns[1];
  const bindings=f.service.checkLayout({scope,id:f.input.id}).bindings;await f.service.reviewDomain({scope,id:f.input.id,runtimeCandidateDigest:project.candidateDigest,assetDigests:{ontology:pins.ontology.digest,harness:pins.harness.digest},bindingsDigest:bindings.digest,inferredMappings:bindings.inferred,decision:'ACCEPT',humanEvidenceRef:'synthetic-domain'});
  await assert.rejects(mutate('runtime','project.validate',{id:project.id,runId:'rc-2'}),{code:'FEEDBACK_PENDING'});
  await assert.rejects(query('harness','feedback.read',{id:good.event.id},{visibility:'public',projectId:scope.projectId}),{code:'NOT_FOUND'});
  await assert.rejects(mutate('harness','feedback.ingest',{id:good.event.id,digest:'sha256:'+'f'.repeat(64)}),{code:'EVENT_CONFLICT'});
  for(const owner of ['ontology','harness']){
   const before=await query(owner,'feedback.list');await mutate(owner,'feedback.ingest',{id:good.event.id,digest:good.event.digest});assert.deepEqual(await query(owner,'feedback.list'),before);
   const review=(await mutate(owner,'feedback.propose',{id:good.event.id,proposal:{mode:'REUSE',reference:pins[owner],rationale:'Synthetic reviewed correction affects runtime observation only; exact model and rules remain applicable.',changes:[]}})).result;
   await assert.rejects(mutate(owner,'feedback.decide',{id:good.event.id,reviewDigest:review.reviewDigest,decision:'APPROVE',humanEvidenceRef:'invented-test-pass'}),{code:'HUMAN_EVIDENCE_REQUIRED'});
   await mutate(owner,'feedback.decide',{id:good.event.id,reviewDigest:review.reviewDigest,decision:'APPROVE',humanEvidenceRef:'synthetic'});
  }
  await assert.rejects(mutate('runtime','project.validate',{id:project.id,runId:'rc-2'}),{code:'FEEDBACK_PENDING'});
  await mutate('runtime','feedback.refresh',{id:good.event.id});const eligibility=(await mutate('runtime','project.validate',{id:project.id,runId:'rc-2'})).result;assert.equal(eligibility.eligible,true);
  await mutate('runtime','project.complete',{id:project.id,runId:'rc-2',reviewDigest:eligibility.reviewDigest,humanEvidenceRef:'synthetic'});
  const retained=await query('runtime','feedback.list');c.close();c=createComposition(options,apis,{},trusted);
  assert.deepEqual(await query('runtime','feedback.list'),retained);for(const r of savedRuns)assert.deepEqual(await query('runtime','run.inspect',{id:r.plan.id}),r);
  const complete=(await query('runtime','project.inspect',{id:project.id})).complete;assert.equal(complete.runId,'rc-2');assert.equal(complete.feedback.eventId,good.event.id);assert.ok(complete.feedback.dispositions.ontology&&complete.feedback.dispositions.harness);
  assert.equal(f.git('status','--porcelain'),'');
  c.close();const installationRoot=path.join(f.root,'installation');fs.mkdirSync(installationRoot);const context={projectRoot:f.projectRoot,stateRoot:f.stateRoot,workspaceId:'synthetic',installationRoot};
  const backup=maintainWorkspace(context,'backup',{destinationRoot:path.join(f.root,'backup')},'feedback-backup');assert.equal(backup.status,'VERIFIED');
  // Preserve the actual pre-restore directories; restore only into their missing original paths.
  fs.renameSync(f.projectRoot,f.projectRoot+'-preserved');fs.renameSync(f.stateRoot,f.stateRoot+'-preserved');
  const restored=maintainWorkspace(context,'restore',{backupRoot:path.join(f.root,'backup')},'feedback-restore');assert.equal(restored.status,'VERIFIED');
  c=createComposition(options,apis,{},trusted);assert.deepEqual(await query('runtime','feedback.list'),retained);assert.deepEqual((await query('runtime','project.inspect',{id:project.id})).complete,complete);
 } finally {c.close();f.cleanup();}
});
