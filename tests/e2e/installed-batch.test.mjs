import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {preflightInstalledBatch,runInstalledBatch} from './versions/run-installed-batch.mjs';
import {bytesDigest} from './versions/installed-transport.mjs';
import {probeDigest} from './versions/probe-session.mjs';
import {capabilityRequiredMessage} from './versions/runtime/6.3.0/capability-probe.mjs';

// Deliberately synthetic toy executables, not installed EvoPilot Candidate bytes.
// The Codex label below tests scope matching only; test-1 and qualification hashes
// are synthetic and are not real Host evidence.
// Blanket-true callbacks are permitted only inside these disposable tests.
function fixture(t,count=2){
  const temp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'evopilot-batch-toy-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const installationRoot=path.join(temp,'installation'),pkg='node_modules/@evopilot/cli',marker=path.join(temp,'calls.jsonl');
  fs.mkdirSync(path.join(installationRoot,pkg,'dist'),{recursive:true});
  const hash='sha256:'+'1'.repeat(64),binding='sha256:'+'2'.repeat(64),caps={schema:'evopilot-project-semantic-capabilities/v1',projectId:'p',operations:['capabilities'],executionAvailable:false,completionAvailable:false,authority:'RUNTIME_CURRENT_SCOPED_PRINCIPAL'};
  const source=`import fs from 'node:fs';fs.appendFileSync(${JSON.stringify(marker)},JSON.stringify(process.argv.slice(2))+'\\n');
if(process.argv[4]==='capabilities')process.stdout.write(JSON.stringify(${JSON.stringify({...caps,requestId:'synthetic'})}));
else{process.stderr.write(JSON.stringify({error:${JSON.stringify(capabilityRequiredMessage)}}));process.exitCode=1;}`;
  const entries={'package.json':JSON.stringify({name:'@evopilot/cli',version:'6.3.0',type:'module'}),'dist/index.js':source};
  const files=Object.entries(entries).map(([p,bytes])=>{fs.writeFileSync(path.join(installationRoot,pkg,p),bytes);return{path:pkg+'/'+p,digest:bytesDigest(bytes)};});
  const configFile=path.join(temp,'config.json');fs.writeFileSync(configFile,'{}',{mode:0o600});
  const input={operation:'inspect',selection:{projectId:'p',catalogId:'c',artifactSetDigest:hash,bundleDigest:hash},scope:{tenantId:'t',workspaceId:'w',projectId:'p'},expected:{kind:'CAPABILITY_MISSING',capabilityDigest:probeDigest(caps)}};
  const inputBytes=Buffer.from(JSON.stringify(input)),context={schema:'evopilot-installed-readonly-probe-context/v1',product:'runtime',version:'6.3.0',installationRoot,files,artifactSetDigest:hash,acceptanceBindingDigest:binding,probeInputDigest:probeDigest(input),configFile,configDigest:bytesDigest('{}'),server:'http://127.0.0.1:1'};
  const contextBytes=Buffer.from(JSON.stringify(context));
  const corpus=JSON.parse(fs.readFileSync(new URL('./versions/runtime/6.3.0/case-plan.json',import.meta.url)));
  const plan={schema:'evopilot-installed-subjourney-batch/v1',id:'synthetic-batch',products:[{product:'runtime',version:'6.3.0',targetDigest:corpus.target.fileDigest,artifactSetDigest:hash}],acceptanceBindingDigest:binding,
    host:{id:'Codex',version:'test-1',qualificationDigest:hash},steps:Array.from({length:count},(_,i)=>({id:'step-'+i,product:'runtime',caseId:'RC03',variantId:'RC03-M1',runner:'runtime-capability',contextDigest:bytesDigest(contextBytes),inputDigest:bytesDigest(inputBytes)}))};
  const materials=plan.steps.map(s=>({id:s.id,contextBytes:Buffer.from(contextBytes),inputBytes:Buffer.from(inputBytes)})),evidence=new Map(),authorized=[];
  const options=()=>({planBytes:Buffer.from(JSON.stringify(plan)),expectedPlanDigest:bytesDigest(JSON.stringify(plan)),materials,journalFile:path.join(temp,'journal.jsonl'),
    authorizeCampaign:async f=>{authorized.push(f);return true;},authorizeInvocation:async()=>true,
    persistEvidence:async f=>{evidence.set(f.step.id,structuredClone(f));return true;},
    verifyEvidence:async f=>{const stored=evidence.get(f.step.id);return !!stored&&stored.report.status===f.status&&probeDigest(stored.report)===f.reportDigest&&stored.planDigest===f.planDigest;}});
  const calls=()=>fs.existsSync(marker)?fs.readFileSync(marker,'utf8').trim().split('\n').filter(Boolean).length:0;
  return{temp,installationRoot,context,input,plan,materials,evidence,authorized,options,calls,entry:path.join(installationRoot,pkg,'dist/index.js')};
}
test('batch executes fixed installed subjourneys serially and resumes only verified evidence',async t=>{
  const f=fixture(t),result=await runInstalledBatch(f.options());assert.equal(result.status,'SUBJOURNEYS_COMPLETED_NOT_ACCEPTED');assert.equal(result.completed,2);assert.equal(f.calls(),6);
  assert.equal(result.formalAcceptance,'NOT_EVALUATED');assert.equal(result.targetCriteriaClosed,0);assert.equal(result.releaseAuthorized,false);
  assert.equal(result.preflight.fullScenarioCoverage,'NOT_PROVEN');assert.equal(f.authorized.length,2);
  assert(f.authorized.every(x=>x.acceptanceBindingDigest===f.plan.acceptanceBindingDigest&&x.products[0].targetDigest===f.plan.products[0].targetDigest));
  const resumed=await runInstalledBatch(f.options());assert.equal(resumed.completed,2);assert.equal(f.calls(),6);assert.equal(f.authorized.length,2);
});
for(const [name,mutate]of Object.entries({
  'shell runner':f=>f.plan.steps[0].runner='sh -c publish',
  'foreign product':f=>f.plan.steps[0].product='expert',
  'undeclared variant':f=>f.plan.steps[0].variantId='RC06-M1',
  'raw secret field':f=>f.plan.apiKey='SYNTHETIC',
  'WorkBuddy host':f=>f.plan.host.id='WorkBuddy',
  'Claude Code host':f=>f.plan.host.id='Claude Code',
  'OpenCode host':f=>f.plan.host.id='OpenCode',
  'unqualified generic host':f=>f.plan.host.id='synthetic-host',
  'Codex lookalike host':f=>f.plan.host.id='Codex-compatible',
  'duplicate step':f=>f.plan.steps[1].id=f.plan.steps[0].id,
  'duplicate material':f=>f.materials[1].id=f.materials[0].id,
  'missing material':f=>f.materials.pop(),
  'Target substitution':f=>f.plan.products[0].targetDigest='sha256:'+'9'.repeat(64),
  'artifact substitution':f=>f.plan.products[0].artifactSetDigest='sha256:'+'9'.repeat(64),
  'acceptance substitution':f=>f.plan.acceptanceBindingDigest='sha256:'+'9'.repeat(64),
  'later input drift':f=>f.materials[1].inputBytes=Buffer.from('{}'),
  'later context drift':f=>f.materials[1].contextBytes=Buffer.from('{}'),
  'installed byte drift':f=>fs.appendFileSync(f.entry,'\n// drift')
}))test('batch rejects '+name+' before any process',async t=>{
  const f=fixture(t);mutate(f);await assert.rejects(runInstalledBatch(f.options()));assert.equal(f.calls(),0);assert.equal(f.authorized.length,0);
});
test('batch plan digest and callbacks cannot be omitted or replaced with manifest flags',async t=>{
  const f=fixture(t);assert.throws(()=>preflightInstalledBatch({...f.options(),expectedPlanDigest:'sha256:'+'0'.repeat(64)}));
  for(const name of ['authorizeCampaign','authorizeInvocation','persistEvidence','verifyEvidence'])await assert.rejects(runInstalledBatch({...f.options(),[name]:true}),/CALLBACK_REQUIRED/);
  assert.equal(f.calls(),0);
});
test('denied batch authority invokes nothing and can be resumed after actual authority changes',async t=>{
  const f=fixture(t);await assert.rejects(runInstalledBatch({...f.options(),authorizeCampaign:async()=>false}),/BATCH_CAMPAIGN_DENIED/);assert.equal(f.calls(),0);
  assert.equal((await runInstalledBatch(f.options())).completed,2);
});
test('installed drift across asynchronous authority stops before STARTED or invocation',async t=>{
  const f=fixture(t);await assert.rejects(runInstalledBatch({...f.options(),authorizeCampaign:async()=>{fs.appendFileSync(f.entry,'\n// drift');return true;}}));assert.equal(f.calls(),0);
  assert.equal(fs.readFileSync(f.options().journalFile,'utf8').trim().split('\n').length,1);
});
test('evidence persistence failure stops and the journal never replays the attempted step',async t=>{
  const f=fixture(t),r=await runInstalledBatch({...f.options(),persistEvidence:async()=>{throw Error('SYNTHETIC-do-not-echo');}});
  assert.equal(r.status,'STOPPED_RECONCILIATION_REQUIRED');assert.equal(r.completed,0);assert.equal(f.calls(),3);assert(!JSON.stringify(r).includes('SYNTHETIC'));
  assert.equal((await runInstalledBatch(f.options())).status,'STOPPED_RECONCILIATION_REQUIRED');assert.equal(f.calls(),3);
});
test('lost journal tail at STARTED is not permission to repeat an invocation',async t=>{
  const f=fixture(t);await runInstalledBatch(f.options());const file=f.options().journalFile;
  const records=fs.readFileSync(file,'utf8').trim().split('\n');fs.writeFileSync(file,records.slice(0,2).join('\n')+'\n',{mode:0o600});
  assert.equal((await runInstalledBatch(f.options())).status,'STOPPED_RECONCILIATION_REQUIRED');assert.equal(f.calls(),6);
});
test('completed journal hashes never replace independent evidence verification on resume',async t=>{
  const f=fixture(t);await runInstalledBatch(f.options());f.evidence.clear();await assert.rejects(runInstalledBatch(f.options()),/BATCH_RESUME_EVIDENCE_UNVERIFIED/);assert.equal(f.calls(),6);
});
test('journal tampering and truncation fail closed without process replay',async t=>{
  const f=fixture(t);await runInstalledBatch(f.options());const file=f.options().journalFile,original=fs.readFileSync(file,'utf8');
  fs.writeFileSync(file,original.replace('COMPLETED','UNVERIFIED'));await assert.rejects(runInstalledBatch(f.options()),/BATCH_JOURNAL_DIGEST/);
  fs.writeFileSync(file,original.slice(0,-1));await assert.rejects(runInstalledBatch(f.options()),/BATCH_JOURNAL_TRUNCATED/);assert.equal(f.calls(),6);
});
test('a concurrent runner cannot own the same journal',async t=>{
  const f=fixture(t);let release,entered;const ready=new Promise(r=>{entered=r;}),hold=new Promise(r=>{release=r;});
  const running=runInstalledBatch({...f.options(),authorizeCampaign:async()=>{entered();await hold;return true;}});
  await ready;try{await assert.rejects(runInstalledBatch(f.options()),{code:'EEXIST'});assert.equal(f.calls(),0);}finally{release();}assert.equal((await running).completed,2);
});
test('pre-cancel and authority timeout cannot launch a process later',async t=>{
  const f=fixture(t),controller=new AbortController();controller.abort();await assert.rejects(runInstalledBatch({...f.options(),signal:controller.signal}));assert.equal(f.calls(),0);
  let release;const hold=new Promise(r=>{release=r;});await assert.rejects(runInstalledBatch({...f.options(),timeoutMs:10,authorizeCampaign:()=>hold}),/BATCH_TIMEOUT/);release(true);await new Promise(r=>setImmediate(r));assert.equal(f.calls(),0);
});
test('journal cannot be inside the installation or be a symlink',async t=>{
  const f=fixture(t);await assert.rejects(runInstalledBatch({...f.options(),journalFile:path.join(f.installationRoot,'state.jsonl')}),/EXTERNAL/);assert.equal(f.calls(),0);
  const destination=path.join(f.temp,'untouched');fs.writeFileSync(destination,'preserve',{mode:0o600});fs.symlinkSync(destination,f.options().journalFile);await assert.rejects(runInstalledBatch(f.options()));assert.equal(fs.readFileSync(destination,'utf8'),'preserve');
});
test('journal drift during asynchronous authorization is refused before invocation',async t=>{
  const f=fixture(t);await assert.rejects(runInstalledBatch({...f.options(),authorizeCampaign:async()=>{
    const file=f.options().journalFile,bytes=fs.readFileSync(file,'utf8');fs.writeFileSync(file,bytes.replace('BEGIN','BROKEN'));return true;
  }}),/BATCH_JOURNAL_DRIFT/);assert.equal(f.calls(),0);
});
test('later authority denial preserves the completed prefix without marking the next step attempted',async t=>{
  const f=fixture(t),options=f.options();await assert.rejects(runInstalledBatch({...options,authorizeCampaign:async x=>x.step.id==='step-0'}),/BATCH_CAMPAIGN_DENIED/);assert.equal(f.calls(),3);
  const resumed=await runInstalledBatch(f.options());assert.equal(resumed.completed,2);assert.equal(f.calls(),6);
});
test('failed independent evidence verification cannot checkpoint or replay success',async t=>{
  const f=fixture(t),r=await runInstalledBatch({...f.options(),verifyEvidence:async()=>false});assert.equal(r.status,'STOPPED_RECONCILIATION_REQUIRED');assert.equal(r.completed,0);assert.equal(f.calls(),3);
  assert.equal((await runInstalledBatch(f.options())).status,'STOPPED_RECONCILIATION_REQUIRED');assert.equal(f.calls(),3);
});
test('a foreign frozen plan cannot reuse even a fully successful journal',async t=>{
  const f=fixture(t);await runInstalledBatch(f.options());f.plan.id='different-plan';await assert.rejects(runInstalledBatch(f.options()),/BATCH_JOURNAL_PLAN_DRIFT/);assert.equal(f.calls(),6);
});
function expertFixture(t){
  const temp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'evopilot-batch-sdk-toy-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const installationRoot=path.join(temp,'installation'),pkg='node_modules/@evopilot/evolution-expert';fs.mkdirSync(path.join(installationRoot,pkg,'dist'),{recursive:true});
  const sdk="export function planExpertTurn(text,payload){return {payload};}\nexport async function executeExpertTurn(plan,transport){await transport.invoke('evopilot_project_semantic_capabilities',{projectId:plan.payload.projectId});return transport.invoke('evopilot_project_semantic_review',plan.payload);}\nexport function explainExpertSemanticResult(){throw Error('unexpected after lost response');}\n";
  const values={'package.json':JSON.stringify({name:'@evopilot/evolution-expert',version:'2.3.0',type:'module'}),'dist/cli.js':'// synthetic unused CLI entry\n','dist/index.js':sdk};
  const files=Object.entries(values).map(([p,bytes])=>{fs.writeFileSync(path.join(installationRoot,pkg,p),bytes);return{path:pkg+'/'+p,digest:bytesDigest(bytes)};});
  const hash='sha256:'+'3'.repeat(64),input={operation:'review',selection:{projectId:'p',catalogId:'c',artifactSetDigest:hash,bundleDigest:hash},scope:{tenantId:'t',workspaceId:'w',projectId:'p'}};
  const inputBytes=Buffer.from(JSON.stringify(input)),context={schema:'evopilot-installed-expert-sdk-context/v1',product:'expert',version:'2.3.0',installationRoot,files,artifactSetDigest:hash,acceptanceBindingDigest:hash,probeInputDigest:probeDigest(input)},contextBytes=Buffer.from(JSON.stringify(context));
  const corpus=JSON.parse(fs.readFileSync(new URL('./versions/expert/2.3.0/case-plan.json',import.meta.url)));
  const plan={schema:'evopilot-installed-subjourney-batch/v1',id:'synthetic-sdk-batch',products:[{product:'expert',version:'2.3.0',targetDigest:corpus.target.fileDigest,artifactSetDigest:hash}],acceptanceBindingDigest:hash,host:{id:'Codex',version:'test-1',qualificationDigest:hash},
    steps:[0,1].map(i=>({id:'sdk-'+i,product:'expert',caseId:'RC01',variantId:'RC01-M1',runner:'expert-binding',contextDigest:bytesDigest(contextBytes),inputDigest:bytesDigest(inputBytes)}))};
  const calls=[],frames=[],saved=[];
  const options={planBytes:Buffer.from(JSON.stringify(plan)),expectedPlanDigest:bytesDigest(JSON.stringify(plan)),materials:plan.steps.map(s=>({id:s.id,contextBytes,inputBytes})),journalFile:path.join(temp,'journal.jsonl'),
    authorizeCampaign:async()=>true,authorizeInvocation:async f=>{frames.push(f);return true;},persistEvidence:async e=>{saved.push(e);return true;},verifyEvidence:async()=>false,
    invokeMcp:async call=>{calls.push(call.tool);if(call.tool.endsWith('_review'))throw Error('synthetic lost review response');return{schema:'evopilot-mcp-http-result/v1',tool:'evopilot_project_semantic_capabilities',authority:'NONE',status:200,ok:true,requestId:'synthetic',response:{data:{schema:'evopilot-project-semantic-capabilities/v1',projectId:'p',operations:['capabilities','review'],executionAvailable:false,completionAvailable:false,authority:'RUNTIME_CURRENT_SCOPED_PRINCIPAL'}}};}};
  return{options,calls,frames,saved};
}
test('SDK review uncertainty stops the batch and cannot be converted to a completed step',async t=>{
  const f=expertFixture(t),r=await runInstalledBatch(f.options);assert.equal(r.status,'STOPPED_SUBJOURNEY');assert.equal(r.subjourneyStatus,'UNKNOWN_OUTCOME');assert.equal(r.completed,0);
  assert.deepEqual(f.calls,['evopilot_project_semantic_capabilities','evopilot_project_semantic_review']);assert.equal(f.saved.length,1);
  assert(f.frames.every(x=>x.step.id==='sdk-0'&&x.planDigest===f.options.expectedPlanDigest&&x.invocation));
  assert.equal((await runInstalledBatch(f.options)).status,'STOPPED_RECONCILIATION_REQUIRED');assert.equal(f.calls.length,2);
});
test('SDK batch requires a real relay callback before any journal or process starts',async t=>{
  const f=expertFixture(t);await assert.rejects(runInstalledBatch({...f.options,invokeMcp:undefined}),/BATCH_MCP_RELAY_REQUIRED/);assert.equal(f.calls.length,0);assert.equal(fs.existsSync(f.options.journalFile),false);
});
test('installation drift during evidence persistence cannot become a completed final step',async t=>{
  const f=fixture(t,1),o=f.options();const result=await runInstalledBatch({...o,persistEvidence:async e=>{await o.persistEvidence(e);fs.appendFileSync(f.entry,'\n// drift after report');return true;}});
  assert.equal(result.status,'STOPPED_RECONCILIATION_REQUIRED');assert.equal(result.completed,0);assert.equal(f.calls(),3);
});
test('resume rechecks installation after asynchronous evidence verification',async t=>{
  const f=fixture(t,1);await runInstalledBatch(f.options());const o=f.options();await assert.rejects(runInstalledBatch({...o,verifyEvidence:async e=>{const valid=await o.verifyEvidence(e);fs.appendFileSync(f.entry,'\n// drift during resume');return valid;}}));assert.equal(f.calls(),3);
});
