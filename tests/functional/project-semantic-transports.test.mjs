import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import http from "node:http";
import fs from "node:fs/promises";
import {execFile} from "node:child_process";
import {Worker} from "node:worker_threads";
import {Client} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";
import {projectSemanticBindingFixture} from "../helpers/project-semantic-binding-fixture.mjs";
import {createServer} from "../../packages/server/dist/index.js";
import {FileStore} from "../../packages/server/dist/storage/file-store/index.js";
import {executeExpertTurn, planExpertTurn, explainExpertSemanticResult} from "../../packages/evolution-expert/dist/index.js";
import {projectSemanticCapabilities} from "../../packages/contracts/dist/index.js";
import {runRuntimeDiscoveryProbe} from "../e2e/versions/runtime/6.3.0/discovery-probe.mjs";
import {runRuntimeBindingJourney} from "../e2e/versions/runtime/6.3.0/binding-journey.mjs";
import {runRuntimeTransitionJourney,assertActivationHistory} from "../e2e/versions/runtime/6.3.0/transition-journey.mjs";
import {probeDigest} from "../e2e/versions/probe-session.mjs";
import {assertExpertBindingPresentation} from "../e2e/versions/expert/2.3.0/binding-assertions.mjs";
import {assertExpertTransitionPresentation} from "../e2e/versions/expert/2.3.0/transition-assertions.mjs";
import {runRuntimeRefusalProbe,runtimeRefusalCliResult} from "../e2e/versions/runtime/6.3.0/refusal-probe.mjs";
import {assertExpertRefusalPresentation} from "../e2e/versions/expert/2.3.0/refusal-assertions.mjs";
import {runRuntimeCapabilityProbe,runtimeCapabilityCliResult,assertMissingMcpCapability} from "../e2e/versions/runtime/6.3.0/capability-probe.mjs";

const repo = path.resolve(import.meta.dirname, "../..");
async function listen(t, server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(t, compatible = true) {
  const f = await projectSemanticBindingFixture(t, compatible), store = new FileStore(f.configuration.dataRoot);
  store.writeProject({...f.access.project, name: "Synthetic", createdAt: f.access.project.updatedAt,
    validation: {status: "VERIFIED", checkedAt: f.access.project.updatedAt, message: "synthetic source fixture"}});
  const server = createServer({dataRoot: f.configuration.dataRoot, runtimeMode: "debug", llmClient: {}, allowSampleData: false, autoRegisterProfileProject: false,
    harnessRegistryConfig: f.configuration.registryConfigPath, semanticCatalogPolicyPath: f.configuration.policyPath,
    tokens: [
      {name: "current-operator", token: "synthetic-operator", role: "operator", tenantId: f.scope.tenantId, workspaceId: f.scope.workspaceId},
      {name: "viewer", token: "synthetic-viewer", role: "viewer", tenantId: f.scope.tenantId, workspaceId: f.scope.workspaceId},
      {name: "foreign", token: "synthetic-foreign", role: "admin", tenantId: "other", workspaceId: "other"}
    ]});
  return {...f, store, server, serverUrl: await listen(t, server)};
}
function cli(f, operation, options = [], token = "synthetic-operator") {
  return new Promise(resolve => execFile(process.execPath, [path.join(repo, "packages/cli/dist/index.js"), "project", "semantic", operation, f.scope.projectId,
    ...options, "--server", f.serverUrl, "--config", path.join(f.root, "unused-cli-config.json"), "--json"],
  {cwd: repo, timeout: 30000, env: {PATH: process.env.PATH, EVOPILOT_API_TOKEN: token, EVOPILOT_LOG_LEVEL: "error"}},
  (error, stdout, stderr) => resolve({code: error?.code ?? 0, stdout, stderr, data: stdout.trim() ? JSON.parse(stdout) : undefined})));
}
async function mcp(t, f, token = "synthetic-operator") {
  const transport = new StdioClientTransport({command: process.execPath, args: [path.join(repo, "packages/adapter-mcp/dist/stdio.js")], cwd: repo, stderr: "pipe",
    env: {PATH: process.env.PATH, EVOPILOT_SERVER: f.serverUrl, EVOPILOT_API_TOKEN: token, EVOPILOT_ACTOR: "forged-admin"}});
  const client = new Client({name: "semantic-source-test", version: "1.0.0"});
  await client.connect(transport); t.after(() => client.close());
  return {client, call: (operation, fields = {}) => client.callTool({name: "evopilot_project_semantic_" + operation, arguments: {projectId: f.scope.projectId, ...fields}})};
}
const selectionArgs = f => ["--catalog", f.selection.catalogId, "--artifact-set-digest", f.selection.artifactSetDigest, "--bundle-digest", f.selection.bundleDigest];
for(const [operation,text] of [['inspect','列出项目语义地图'],['compatibility','检查项目语义兼容性'],['onboarding','新项目语义接入'],['gap','查看语义缺口'],['review','准备项目语义绑定评审']])
test('RC03 missing '+operation+' stops actual CLI/source SDK/MCP before dispatch against a controlled legacy advertisement',async t=>{
  const f=await fixture(t),requests=[],capabilities={...projectSemanticCapabilities(f.scope.projectId),operations:projectSemanticCapabilities(f.scope.projectId).operations.filter(x=>x!==operation)};
  // Controlled old/incomplete Runtime protocol, not a real old-version install.
  f.serverUrl=await listen(t,http.createServer((req,res)=>{
    requests.push({method:req.method,path:req.url});res.writeHead(200,{'content-type':'application/json','x-request-id':'synthetic-capability-request'});
    res.end(JSON.stringify({data:capabilities}));
  }));
  const input={operation,selection:{projectId:f.scope.projectId,...f.selection},scope:f.scope,expected:{kind:'CAPABILITY_MISSING',capabilityDigest:probeDigest(capabilities)}};
  if(operation!=='review') {
    const r=await runRuntimeCapabilityProbe({...input,invoke:async args=>{const out=await cli(f,args[2],args.slice(4,-1));return runtimeCapabilityCliResult(out.code,out.stdout,out.stderr);}});
    assert.equal(r.status,'CAPABILITY_STOP_SUBCASE_ASSERTIONS_PASSED');assert.equal(requests.length,3);
  }
  const before=requests.length,{client}=await mcp(t,f),calls=[];
  const payload=['inspect','onboarding'].includes(operation)?{projectId:f.scope.projectId,catalogId:f.selection.catalogId}:input.selection;
  const worker=new Worker(new URL('../e2e/versions/expert/2.3.0/sdk-worker.mjs',import.meta.url),{
    workerData:{sdkEntry:path.join(repo,'packages/evolution-expert/dist/index.js'),input:{operation,text,payload}},
    env:{PATH:'/usr/bin:/bin',EVOPILOT_LOG_LEVEL:'error'},execArgv:[]});t.after(()=>worker.terminate());
  const result=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{worker.terminate();reject(Error('source SDK capability timeout'));},10000);
    const fail=e=>{clearTimeout(timer);reject(e);};worker.on('error',fail);
    worker.on('message',async message=>{
      try {
        if(message.type==='invoke') {
          assert.equal(calls.length,0,'must not dispatch business operation');calls.push(message.tool);
          assert.equal(message.tool,'evopilot_project_semantic_capabilities');assert.deepEqual(message.payload,{projectId:f.scope.projectId});
          const response=await client.callTool({name:message.tool,arguments:message.payload});assertMissingMcpCapability({...input,response});
          worker.postMessage({type:'response',id:message.id,value:response});
        } else {clearTimeout(timer);resolve(message);}
      }catch(error){fail(error);}
    });
  });
  assert.deepEqual(result,{type:'failure',code:'SEMANTIC_CAPABILITY_REQUIRED'});assert.equal(requests.length,before+1);
  assert.ok(requests.every(r=>r.method==='GET'&&r.path===`/api/v1/projects/${f.scope.projectId}/semantic-capabilities`));
  assert.deepEqual(calls,['evopilot_project_semantic_capabilities']);assert.equal(f.store.listAudit().filter(x=>x.action==='project-semantic-binding.approved').length,0);
});
async function changePointer(f,change,reHash=true) {
  const pointer=JSON.parse(await fs.readFile(path.join(f.root,'SEMANTIC-CATALOG.json')));change(pointer);
  if(reHash){delete pointer.pointerDigest;pointer.pointerDigest=probeDigest(pointer);}await f.write('SEMANTIC-CATALOG.json',pointer);
}
for(const [name,code,change] of [
  ['unsupported pointer schema','UNSUPPORTED',f=>changePointer(f,p=>{p.schema='unsupported/v99';})],
  ['corrupt pointer digest','DIGEST_MISMATCH',f=>changePointer(f,p=>{p.pointerDigest='sha256:'+'0'.repeat(64);},false)],
  ['rehashed traversal path','PATH_DENIED',f=>changePointer(f,p=>{p.generationPath='../unrelated.json';})],
  ['denied current catalog permission','PERMISSION_DENIED',async f=>{f.policy.catalogs[0].permission='DENIED';await f.write('policy.json',f.policy);}],
  ['revoked publication permission','PERMISSION_DENIED',async f=>{f.policy.catalogs[0].grants[0].revoked=true;await f.write('policy.json',f.policy);}],
  ['disabled published catalog','UNAVAILABLE',async f=>{f.registry.catalogs[0].enabled=false;await f.write('registry.yaml',f.registry);}],
  ['revoked material digest','REVOKED',async f=>{f.generation.revokedDigests=[f.generation.entries[0].objectDigest];await f.publish();}],
  ['wrong embedded Skill parent','PARENT_INVALID',async f=>{f.generation.entries.find(e=>e.kind==='ProjectOntologySkill').parent.jsonPointer='/other';await f.publish();}]
])test('RC03 actual CLI and Expert/MCP named refusal: '+name,async t=>{
  const f=await fixture(t);assert.equal((await cli(f,'inspect',['--catalog',f.selection.catalogId])).code,0,'positive control before isolated fault');
  await change(f);
  const input={selection:{projectId:f.scope.projectId,...f.selection},scope:f.scope,expected:{kind:'CATALOG_REFUSAL',code}};
  const pointer=await fs.readFile(path.join(f.root,'SEMANTIC-CATALOG.json')),operations=[];
  const result=await runRuntimeRefusalProbe({...input,invoke:async args=>{
    operations.push(args[2]);const r=await cli(f,args[2],args.slice(4,-1));return runtimeRefusalCliResult(r.code,r.stdout,r.stderr);
  }});
  assert.equal(result.status,'REFUSAL_SUBCASE_ASSERTIONS_PASSED');assert.equal(result.targetCriteriaClosed,0);assert.deepEqual(operations,['inspect','inspect']);
  const {client}=await mcp(t,f),calls=[];
  const response=await executeExpertTurn(planExpertTurn('列出项目语义地图',{projectId:f.scope.projectId,catalogId:f.selection.catalogId}),{
    invoke:(tool,payload)=>{calls.push(tool);return client.callTool({name:tool,arguments:payload});}});
  const explanation=explainExpertSemanticResult('inspect',response);
  assert.equal(assertExpertRefusalPresentation({...input,operation:'inspect',response,explanation}).status,'REFUSAL_PRESENTATION_ASSERTIONS_PASSED');
  assert.deepEqual(calls,['evopilot_project_semantic_capabilities','evopilot_project_semantic_inspect']);
  for(const altered of [{...explanation,status:'COMPLETE'},{...explanation,canExecute:true},{...explanation,requestId:'wrong'},{...explanation,releaseAuthorized:true}])
    assert.throws(()=>assertExpertRefusalPresentation({...input,operation:'inspect',response,explanation:altered}));
  const forged=structuredClone(response);forged.structuredContent.response.error='SEMANTIC_CATALOG_TIMEOUT';
  assert.throws(()=>assertExpertRefusalPresentation({...input,operation:'inspect',response:forged,explanation}));
  assert.deepEqual(await fs.readFile(path.join(f.root,'SEMANTIC-CATALOG.json')),pointer);
  assert.equal(f.store.listAudit().filter(x=>x.action==='project-semantic-binding.approved').length,0);
  assert.equal((await cli(f,'binding')).code,1);
});
test('RC03 undeclared compatibility stays indeterminate through actual CLI and Expert/MCP without fallback',async t=>{
  const f=await fixture(t,false),input={selection:{projectId:f.scope.projectId,...f.selection},scope:f.scope,
    expected:{kind:'COMPATIBILITY_STOP',status:'INDETERMINATE',reasons:['REQUIREMENTS_NOT_DECLARED']}};
  const responses=[];
  const report=await runRuntimeRefusalProbe({...input,invoke:async args=>{
    const r=await cli(f,args[2],args.slice(4,-1)),normalized=runtimeRefusalCliResult(r.code,r.stdout,r.stderr);responses.push(normalized);return normalized;
  }});assert.equal(report.status,'REFUSAL_SUBCASE_ASSERTIONS_PASSED');
  const {client}=await mcp(t,f),calls=[];
  const response=await executeExpertTurn(planExpertTurn('检查项目语义兼容性',input.selection),{
    invoke:(tool,payload)=>{calls.push(tool);return client.callTool({name:tool,arguments:payload});}});
  const explanation=explainExpertSemanticResult('compatibility',response);
  assert.equal(assertExpertRefusalPresentation({...input,operation:'compatibility',response,explanation}).targetCriteriaClosed,0);
  assert.deepEqual(calls,['evopilot_project_semantic_capabilities','evopilot_project_semantic_compatibility']);
  for(const mutate of [r=>{r.report.status='COMPATIBLE';},r=>{r.report.reasons=['EXTERNAL_REASONER_UNVERIFIED'];},
    r=>{r.report.scope.projectId='foreign';},r=>{r.report.authority.mayApprove=true;}]) {
    const forged=structuredClone(responses[0]);mutate(forged.json);
    delete forged.json.report.compatibilityDigest;forged.json.report.compatibilityDigest=probeDigest(forged.json.report);
    const {requestId,inspectionDigest,...core}=forged.json;forged.json.inspectionDigest=probeDigest(core);
    await assert.rejects(runRuntimeRefusalProbe({...input,invoke:async()=>forged}));
  }
  assert.equal((await cli(f,'binding')).code,1);assert.equal(f.store.listAudit().filter(x=>x.action==='project-semantic-binding.approved').length,0);
});
function bindingJourneyInput(f,operations=[]) {
  return {selection:{projectId:f.scope.projectId,...f.selection},scope:f.scope,
    invoke:(args,{signal})=>new Promise((resolve,reject)=>{
      operations.push(args[2]);
      execFile(process.execPath,[path.join(repo,'packages/cli/dist/index.js'),...args,'--server',f.serverUrl,'--config',path.join(f.root,'unused-journey-config.json')],
        {signal,timeout:10000,env:{PATH:process.env.PATH,EVOPILOT_API_TOKEN:'synthetic-operator',EVOPILOT_LOG_LEVEL:'error'}},
        (error,stdout)=>{if(error&&!Number.isInteger(error.code))return reject(new Error('SYNTHETIC_TRANSPORT_FAILURE'));
          try{resolve({exitCode:error?.code??0,json:stdout.trim()?JSON.parse(stdout):null});}catch{reject(new Error('SYNTHETIC_JSON_FAILURE'));}});
    })};
}
test('RC01 binding subjourney prepares, requires exact decision and reads immutable result without activation',async t=>{
  const f=await fixture(t),operations=[],input=bindingJourneyInput(f,operations);
  const prepared=await runRuntimeBindingJourney(input);
  assert.equal(prepared.status,'WAITING_EXACT_DECISION');assert.equal(prepared.targetCriteriaClosed,0);
  assert.equal(operations.includes('approve'),false);assert.equal((await cli(f,'binding')).code,1);
  const decision={reviewDigest:prepared.review.reviewDigest,decision:'APPROVE',principalId:'current-operator'};
  const before=operations.length;
  for(const invalid of [{...decision,reviewDigest:'sha256:'+'0'.repeat(64)},{...decision,decision:'continue'},{...decision,actor:'forged'}])
    await assert.rejects(runRuntimeBindingJourney({...input,phase:'submit',review:prepared.review,decision:invalid}));
  assert.equal(operations.length,before,'invalid decisions must stop before any command');
  const completed=await runRuntimeBindingJourney({...input,phase:'submit',review:prepared.review,decision});
  assert.equal(completed.status,'BINDING_SUBJOURNEY_ASSERTIONS_PASSED');assert.equal(completed.formalAcceptance,'NOT_EVALUATED');
  assert.equal(operations.filter(x=>x==='approve').length,1);
  assert.equal((await cli(f,'activation')).data.transitions.length,0);
  const {call}=await mcp(t,f,'synthetic-viewer');
  assert.equal((await call('binding')).structuredContent.response.data.binding.bindingDigest,completed.bindingDigest);
  const resumed=await runRuntimeBindingJourney({...input,phase:'readback',review:prepared.review,decision});
  assert.equal(resumed.bindingDigest,completed.bindingDigest);assert.equal(operations.filter(x=>x==='approve').length,1);
  assert.equal(JSON.stringify(completed).includes('synthetic-operator'),false);
});
for(const kind of ['binding','transition'])for(const phase of ['prepare','submit'])
test(`Runtime ${kind} ${phase} lost preparation response never permits review replay`,async t=>{
  const f=await fixture(t),operations=[],transport=bindingJourneyInput(f,operations);
  const {requestId,...initial}=kind==='transition'?await initialBinding(f):{};
  const run=kind==='binding'?runRuntimeBindingJourney:runRuntimeTransitionJourney;
  const operation=kind==='binding'?'review':'transitionReview';
  const input=kind==='binding'?transport:{scope:f.scope,initial,targetReview:initial.review,invoke:transport.invoke,
    transition:{action:'ACTIVATE',expectedHeadDigest:initial.binding.bindingDigest,destinationDigest:initial.binding.bindingDigest}};
  const prepared=phase==='submit'?await run(input):undefined,key=kind==='binding'?'reviewDigest':'transitionReviewDigest';
  const expectation=prepared?{review:prepared.review,decision:{[key]:prepared.review[key],decision:'APPROVE',principalId:'current-operator'}}:{};
  const before=operations.length;let persisted;
  const result=await run({...input,...expectation,phase,invoke:async(args,options)=>{
    const response=await transport.invoke(args,options);
    if(args[2]===operation){assert.equal(response.exitCode,0);persisted=response.json;throw Error('lost persisted review response');}
    return response;
  }});
  assert.ok(persisted);assert.equal(result.status,'UNKNOWN_OUTCOME');assert.equal(result.uncertainOperation,operation);
  assert.equal(result.nextAction,'reconcile-review-only-no-submission-replay');assert.equal(result.targetCriteriaClosed,0);
  assert.equal(result.review,undefined);assert.equal(result.reviewDigest,undefined);assert.equal(result.transitionReviewDigest,undefined);
  assert.equal(operations.slice(before).filter(x=>x===operation).length,1);assert.equal(operations.at(-1),operation);
  assert.equal(operations.some(x=>['approve','transitionApprove'].includes(x)),false);
  assert.equal((await cli(f,'activation')).data?.transitions?.length??0,0);
});
for(const kind of ['binding','transition'])for(const phase of ['prepare','submit'])
  for(const fault of ['cancel','deadline','invalid-response','invalid-review'])
test(`Runtime ${kind} ${phase} ${fault} after review invocation stops without replay`,async t=>{
  const f=await fixture(t),operations=[],transport=bindingJourneyInput(f,operations);
  const {requestId,...initial}=kind==='transition'?await initialBinding(f):{};
  const run=kind==='binding'?runRuntimeBindingJourney:runRuntimeTransitionJourney;
  const operation=kind==='binding'?'review':'transitionReview';
  const input=kind==='binding'?transport:{scope:f.scope,initial,targetReview:initial.review,invoke:transport.invoke,
    transition:{action:'ACTIVATE',expectedHeadDigest:initial.binding.bindingDigest,destinationDigest:initial.binding.bindingDigest}};
  const prepared=phase==='submit'?await run(input):undefined;
  const key=kind==='binding'?'reviewDigest':'transitionReviewDigest';
  const expectation=prepared?{review:prepared.review,decision:{[key]:prepared.review[key],decision:'APPROVE',principalId:'current-operator'}}:{};
  const before=operations.length,c=new AbortController();let invocationSignal;
  const result=await run({...input,...expectation,phase,signal:c.signal,timeoutMs:fault==='deadline'?2000:10000,
    invoke:async(args,options)=>{
      const response=await transport.invoke(args,options);
      if(args[2]!==operation)return response;
      assert.equal(response.exitCode,0);invocationSignal=options.signal;
      if(fault==='cancel')c.abort();
      if(fault==='deadline')return new Promise(()=>{});
      if(fault==='invalid-response')return {exitCode:0,json:null};
      if(fault==='invalid-review'){
        response.json.scope.workspaceId='forged-workspace';
        const {requestId,[key]:ignored,...body}=response.json;response.json[key]=probeDigest(body);
      }
      return response;
    }});
  assert.equal(result.status,'UNKNOWN_OUTCOME');assert.equal(result.uncertainOperation,operation);
  assert.equal(result.nextAction,'reconcile-review-only-no-submission-replay');assert.equal(result.targetCriteriaClosed,0);
  assert.equal(result.review,undefined);assert.equal(result[key],undefined);
  assert.equal(operations.slice(before).filter(x=>x===operation).length,1);assert.equal(operations.at(-1),operation);
  assert.equal(operations.some(x=>['approve','transitionApprove'].includes(x)),false);
  if(['cancel','deadline'].includes(fault))assert.equal(invocationSignal.aborted,true);
});
test('RC01 unknown approval response recovers by readback without replaying mutation',async t=>{
  const f=await fixture(t),operations=[],input=bindingJourneyInput(f,operations),prepared=await runRuntimeBindingJourney(input);
  const decision={reviewDigest:prepared.review.reviewDigest,decision:'APPROVE',principalId:'current-operator'};
  const lost=await runRuntimeBindingJourney({...input,phase:'submit',review:prepared.review,decision,
    invoke:async(args,options)=>{const r=await input.invoke(args,options);if(args[2]==='approve')throw Error('lost response after commit');return r;}});
  assert.equal(lost.status,'UNKNOWN_OUTCOME');assert.equal(lost.nextAction,'readback-only-no-submission-replay');
  assert.equal(lost.targetCriteriaClosed,0);assert.equal(operations.at(-1),'approve');
  const recovered=await runRuntimeBindingJourney({...input,phase:'readback',review:prepared.review,decision});
  assert.equal(recovered.status,'BINDING_SUBJOURNEY_ASSERTIONS_PASSED');assert.equal(operations.filter(x=>x==='approve').length,1);
  assert.equal(f.store.listAudit().filter(x=>x.action==='project-semantic-binding.approved').length,1);
});
test('RC01 changed review evidence stops before approval and pre-cancellation invokes nothing',async t=>{
  const f=await fixture(t),operations=[],input=bindingJourneyInput(f,operations),prepared=await runRuntimeBindingJourney(input);
  const decision={reviewDigest:prepared.review.reviewDigest,decision:'APPROVE',principalId:'current-operator'};
  f.policy.catalogs[0].trustContext='changed-after-review';await f.write('policy.json',f.policy);
  await assert.rejects(runRuntimeBindingJourney({...input,phase:'submit',review:prepared.review,decision}),/RC01_REVIEW_DRIFT/);
  assert.equal(operations.includes('approve'),false);assert.equal((await cli(f,'binding')).code,1);
  const c=new AbortController();c.abort();const before=operations.length;
  await assert.rejects(runRuntimeBindingJourney({...input,signal:c.signal}),/RC01_CANCELLED/);assert.equal(operations.length,before);
});
test('RC01 cancellation after committed approval never claims success or repeats the submission',async t=>{
  const f=await fixture(t),operations=[],input=bindingJourneyInput(f,operations),prepared=await runRuntimeBindingJourney(input),c=new AbortController();
  const decision={reviewDigest:prepared.review.reviewDigest,decision:'APPROVE',principalId:'current-operator'};
  const r=await runRuntimeBindingJourney({...input,phase:'submit',review:prepared.review,decision,signal:c.signal,
    invoke:async(args,options)=>{const value=await input.invoke(args,options);if(args[2]==='approve')c.abort();return value;}});
  assert.equal(r.status,'UNKNOWN_OUTCOME');assert.equal(operations.at(-1),'approve');
  const recovery=await runRuntimeBindingJourney({...input,phase:'readback',review:prepared.review,decision});
  assert.equal(recovery.status,'BINDING_SUBJOURNEY_ASSERTIONS_PASSED');assert.equal(operations.filter(x=>x==='approve').length,1);
});
test('RC01 forged binding, scope or receipt is refused even if its digest is recomputed',async t=>{
  const f=await fixture(t),input=bindingJourneyInput(f),prepared=await runRuntimeBindingJourney(input);
  const decision={reviewDigest:prepared.review.reviewDigest,decision:'APPROVE',principalId:'current-operator'};
  assert.equal((await runRuntimeBindingJourney({...input,phase:'submit',review:prepared.review,decision})).status,'BINDING_SUBJOURNEY_ASSERTIONS_PASSED');
  for(const [name,mutate] of [
    ['binding gains execution',r=>{r.binding.eligibleForExecution=true;}],
    ['unrecognized authority',r=>{r.binding.releaseApproved=true;}],
    ['foreign scope',r=>{r.binding.scope.tenantId='foreign';}],
    ['wrong receipt',r=>{r.binding.decisionDigest='sha256:'+'0'.repeat(64);}],
    ['unexpected review field',r=>{r.review.approve=true;}]
  ])await t.test(name,async()=>{
    let reads=0;await assert.rejects(runRuntimeBindingJourney({...input,phase:'readback',review:prepared.review,decision,
      invoke:async(args,options)=>{reads++;const r=await input.invoke(args,options);assert.equal(args[2],'binding');mutate(r.json);
        const {bindingDigest,...body}=r.json.binding;r.json.binding.bindingDigest=probeDigest(body);return r;}}));
    assert.equal(reads,1);
  });
});
test('RC01 review timeout aborts its invocation and cannot submit or return partial success',async()=>{
  let calls=0,signal;
  await assert.rejects(runRuntimeBindingJourney({selection:{projectId:'p',catalogId:'c',artifactSetDigest:'sha256:'+'1'.repeat(64),bundleDigest:'sha256:'+'2'.repeat(64)},
    scope:{tenantId:'t',workspaceId:'w',projectId:'p'},timeoutMs:10,invoke:async(_args,options)=>{calls++;signal=options.signal;return new Promise(()=>{});}}),/RC01_TIMEOUT/);
  assert.equal(calls,1);assert.equal(signal.aborted,true);
});
test("versioned discovery probe uses only public CLI reads against an actual synthetic Runtime", async t => {
  const f = await fixture(t), operations=[],responses=[];
  const report=await runRuntimeDiscoveryProbe({selection:{projectId:f.scope.projectId,...f.selection},scope:f.scope,
    invoke:async (args,{signal})=>{
      operations.push(args[2]);
      return new Promise((resolve,reject)=>execFile(process.execPath,[path.join(repo,'packages/cli/dist/index.js'),...args,
        '--server',f.serverUrl,'--config',path.join(f.root,'unused-probe-config.json')],
        {signal,timeout:10000,env:{PATH:process.env.PATH,EVOPILOT_API_TOKEN:'synthetic-operator',EVOPILOT_LOG_LEVEL:'error'}},
        (error,stdout)=>{if(error)return reject(error);try{const json=JSON.parse(stdout);responses.push(json);resolve({exitCode:0,json});}catch(e){reject(e);}}));
    }});
  assert.equal(report.status,'PROBE_ASSERTIONS_PASSED');assert.equal(report.targetCriteriaClosed,0);
  assert.equal(report.formalAcceptance,'NOT_EVALUATED');
  assert.deepEqual(operations,['capabilities','inspect','compatibility','onboarding','gap','inspect']);
  assert.equal((await cli(f,'binding')).code,1);
  assert.equal(f.store.listAudit().filter(row=>row.action==='project-semantic-binding.approved').length,0);
  assert.equal(JSON.stringify(report).includes('synthetic-operator'),false);
  // Replays test refusal logic only; none is accepted as fresh product evidence.
  for(const [name,index,mutate] of [
    ['invented execution authority',0,r=>{r.executionAvailable=true;}],
    ['foreign scope disclosure',1,r=>{r.sets[0].scope.tenantId='foreign';}],
    ['wrong bundle on compatible response',2,r=>{r.report.bundleRef.digest='sha256:'+'0'.repeat(64);}],
    ['automatic candidate selection',3,r=>{r.selectedCandidate={id:'unreviewed'};}],
    ['missing gap authority fields',4,r=>{r.authority={};}],
    ['snapshot changed between reads',5,r=>{r.discoveryDigest='sha256:'+'0'.repeat(64);}]
  ])await t.test('probe refuses '+name,async()=>{
    let position=0;await assert.rejects(runRuntimeDiscoveryProbe({selection:{projectId:f.scope.projectId,...f.selection},scope:f.scope,
      invoke:async()=>{const json=structuredClone(responses[position]);if(position++===index)mutate(json);return {exitCode:0,json};}}));
    assert.equal(position,index+1);
  });
});
test("Expert gap through actual MCP and CLI reads exact pair without binding or successor mutation", async t => {
  const f = await fixture(t), {client, call} = await mcp(t, f), invoked = [];
  const response = await executeExpertTurn(planExpertTurn("查看语义缺口及后继建议", {projectId: f.scope.projectId, ...f.selection}), {
    invoke: (tool, payload) => {invoked.push(tool); return client.callTool({name: tool, arguments: payload});}
  });
  const summary = explainExpertSemanticResult("gap", response);
  assert.equal(summary.status, "NO_DECLARED_COMPATIBILITY_GAP"); assert.equal(summary.selectedSuccessor, null);
  assert.deepEqual(invoked, ["evopilot_project_semantic_capabilities", "evopilot_project_semantic_gap"]);
  assert.equal((await call("binding")).structuredContent.status, 404);
  const read = await cli(f, "gap", selectionArgs(f), "synthetic-viewer"); assert.equal(read.code, 0, read.stderr);
  assert.equal(read.data.gapDigest, summary.gapDigest); assert.equal(read.data.successorHandoff.preservesExistingRunPins, true);
  assert.notEqual((await cli(f, "gap", selectionArgs(f), "synthetic-foreign")).code, 0);
  assert.equal((await call("gap", {...f.selection, selectedSuccessor: "latest"})).isError, true);
});
test('SDK relay worker runs actual source Expert through MCP, not an installed artifact or real Host',async t=>{
  const f=await fixture(t),{client}=await mcp(t,f);
  const worker=new Worker(new URL('../e2e/versions/expert/2.3.0/sdk-worker.mjs',import.meta.url),{
    workerData:{sdkEntry:path.join(repo,'packages/evolution-expert/dist/index.js'),input:{operation:'review',text:'准备项目语义绑定评审',payload:{projectId:f.scope.projectId,...f.selection}}},
    env:{PATH:'/usr/bin:/bin',EVOPILOT_LOG_LEVEL:'error'},execArgv:[]});
  t.after(()=>worker.terminate());const calls=[];
  const result=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{worker.terminate();reject(Error('source SDK worker timeout'));},10000);
    worker.on('error',error=>{clearTimeout(timer);reject(error);});
    worker.on('message',async message=>{
      try {
        if(message.type==='invoke') {
          calls.push(message.tool);assert.ok(['evopilot_project_semantic_capabilities','evopilot_project_semantic_review'].includes(message.tool));
          const value=await client.callTool({name:message.tool,arguments:message.payload});worker.postMessage({type:'response',id:message.id,value});
        } else {clearTimeout(timer);assert.equal(message.type,'result');resolve(message);}
      }catch(error){clearTimeout(timer);reject(error);}
    });
  });
  assert.deepEqual(calls,['evopilot_project_semantic_capabilities','evopilot_project_semantic_review']);
  assert.equal(assertExpertBindingPresentation({...result,operation:'review',selection:{projectId:f.scope.projectId,...f.selection},scope:f.scope}).status,'PRESENTATION_ASSERTIONS_PASSED');
});

test("Expert Core -> stdio MCP -> actual Runtime review and exact decision preserve one truth", async t => {
  const f = await fixture(t), {client} = await mcp(t, f), calls = [];
  const transport = {invoke: async (tool, payload) => {calls.push(tool); return client.callTool({name: tool, arguments: payload});}};
  const review = await executeExpertTurn(planExpertTurn("准备项目语义绑定评审", {projectId: f.scope.projectId, ...f.selection}), transport);
  assert.equal(review.isError, false, JSON.stringify(review));
  const summary = explainExpertSemanticResult("review", review); assert.equal(summary.status, "WAITING_EXACT_HUMAN_DECISION");
  const oracle=(operation,response)=>assertExpertBindingPresentation({operation,response,explanation:explainExpertSemanticResult(operation,response),
    selection:{projectId:f.scope.projectId,...f.selection},scope:f.scope});
  assert.equal(oracle('review',review).status,'PRESENTATION_ASSERTIONS_PASSED');
  for(const changed of [{...summary,canExecute:true},{...summary,status:'COMPLETE'},{...summary,releaseApproved:true},{...summary,reviewDigest:'sha256:'+'0'.repeat(64)}])
    assert.throws(()=>assertExpertBindingPresentation({operation:'review',response:review,explanation:changed,selection:{projectId:f.scope.projectId,...f.selection},scope:f.scope}));
  const plan = planExpertTurn("批准项目语义评审", {projectId: f.scope.projectId, reviewDigest: summary.reviewDigest, decision: "APPROVE"});
  const before = calls.length; await assert.rejects(() => executeExpertTurn(plan, transport), /EXACT_DECISION_REQUIRED/); assert.equal(calls.length, before);
  const approval = await executeExpertTurn(plan, transport, {authorizationDigest: summary.reviewDigest, evidenceRef: "decision://synthetic-fixture"});
  assert.equal(approval.isError, false, JSON.stringify(approval));
  assert.equal(explainExpertSemanticResult("approve", approval).status, "REVIEWED_NOT_ACTIVATED");
  assert.equal(oracle('approve',approval).targetCriteriaClosed,0);
  const inspected = await executeExpertTurn(planExpertTurn("恢复语义绑定状态", {projectId: f.scope.projectId}), transport);
  assert.deepEqual(inspected.structuredContent.response.data.binding, approval.structuredContent.response.data.binding);
  assert.equal(oracle('binding',inspected).status,'PRESENTATION_ASSERTIONS_PASSED');
  assert.equal(f.store.listAudit().filter(row => row.action === "project-semantic-binding.approved").length, 1);
});
test("CLI discovery -> compatibility -> review -> explicit approval -> MCP fresh read uses actual Runtime", async t => {
  const f = await fixture(t);
  const capabilities = await cli(f, "capabilities"); assert.equal(capabilities.code, 0, capabilities.stderr);
  assert.equal(capabilities.data.executionAvailable, false);
  const discovery = await cli(f, "inspect", ["--catalog", f.selection.catalogId]); assert.equal(discovery.code, 0, discovery.stderr);
  assert.equal(discovery.data.status, "VERIFIED_DISCOVERY_ONLY"); assert(discovery.data.requestId);
  const compatible = await cli(f, "compatibility", selectionArgs(f)); assert.equal(compatible.code, 0, compatible.stderr);
  assert.equal(compatible.data.report.status, "COMPATIBLE");
  const reviewed = await cli(f, "review", selectionArgs(f)); assert.equal(reviewed.code, 0, reviewed.stderr);
  assert.match(reviewed.data.reviewDigest, /^sha256:/);
  assert.notEqual((await cli(f, "binding")).code, 0);
  const args = ["--review-digest", reviewed.data.reviewDigest, "--decision", "APPROVE", "--actor", "forged-admin"];
  const approved = await cli(f, "approve", args); assert.equal(approved.code, 0, approved.stderr);
  assert.equal(approved.data.decision.principal.id, "current-operator");
  assert.equal(approved.data.binding.eligibleForExecution, false);
  const repeat = await cli(f, "approve", args); assert.equal(repeat.code, 0, repeat.stderr);
  assert.equal(repeat.data.binding.bindingDigest, approved.data.binding.bindingDigest);
  const {call} = await mcp(t, f, "synthetic-viewer"), read = await call("binding");
  assert.equal(read.isError, false, JSON.stringify(read));
  assert.deepEqual(read.structuredContent.response.data.binding, approved.data.binding);
  assert.equal(f.store.listAudit().filter(row => row.action === "project-semantic-binding.approved").length, 2);
});
test("MCP exposes strict semantic inventory and never infers approval", async t => {
  const f = await fixture(t), {client, call} = await mcp(t, f);
  const listed = (await client.listTools()).tools.filter(tool => tool.name.startsWith("evopilot_project_semantic_"));
  assert.equal(listed.length, projectSemanticCapabilities(f.scope.projectId).operations.length);
  assert.equal(listed.find(tool => tool.name.endsWith("approve"))._meta["evopilot/authority"], "EXACT_BINDING_DECISION");
  assert.equal(listed.find(tool => tool.name.endsWith("transitionApprove"))._meta["evopilot/authority"], "EXACT_BINDING_DECISION");
  for (const fields of [{...f.selection, actor: "admin"}, {...f.selection, payload: {approved: true}}, {...f.selection, policyPath: "/tmp"}]) {
    assert.equal((await call("review", fields)).isError, true);
  }
  const review = await call("review", f.selection); assert.equal(review.isError, false, JSON.stringify(review));
  const reviewDigest = review.structuredContent.response.data.reviewDigest;
  assert.equal((await call("approve", {reviewDigest})).isError, true);
  const approved = await call("approve", {reviewDigest, decision: "APPROVE"});
  assert.equal(approved.isError, false, JSON.stringify(approved));
  assert.equal(approved.structuredContent.response.data.decision.principal.id, "current-operator");
  const binding = await cli(f, "binding", [], "synthetic-viewer"); assert.equal(binding.code, 0);
  assert.equal(binding.data.binding.bindingDigest, approved.structuredContent.response.data.binding.bindingDigest);
});

async function initialBinding(f) {
  const review = await cli(f, "review", selectionArgs(f)); assert.equal(review.code, 0, review.stderr);
  const approved = await cli(f, "approve", ["--review-digest", review.data.reviewDigest, "--decision", "APPROVE"]);
  assert.equal(approved.code, 0, approved.stderr); return approved.data;
}
const transitionArgs = (action, expectedHeadDigest, destinationDigest) => ["--action", action, "--expected-head-digest", expectedHeadDigest, "--destination-digest", destinationDigest];

test("Expert -> MCP onboarding and CLI readback guide a reviewed default without implicit binding", async t => {
  const f = await fixture(t), {client, call} = await mcp(t, f);
  const transport = {invoke: (tool, payload) => client.callTool({name: tool, arguments: payload})};
  const input = {projectId: f.scope.projectId, catalogId: f.selection.catalogId};
  const result = await executeExpertTurn(planExpertTurn("新项目语义接入", input), transport);
  assert.equal(result.isError, false, JSON.stringify(result));
  const r = explainExpertSemanticResult("onboarding", result); assert.equal(r.status, "REVIEW_REQUIRED");
  assert.equal(assertExpertBindingPresentation({operation:'onboarding',response:result,explanation:r,selection:{projectId:f.scope.projectId,...f.selection},scope:f.scope}).targetCriteriaClosed,0);
  assert.equal(r.canExecute, false); assert.equal(r.canComplete, false);
  assert.equal((await call("binding")).structuredContent.status, 404);
  const cliRead = await cli(f, "onboarding", ["--catalog", f.selection.catalogId], "synthetic-viewer");
  assert.equal(cliRead.code, 0, cliRead.stderr); assert.equal(cliRead.data.onboardingDigest, r.onboardingDigest);
  assert.equal(f.store.listAudit().filter(a => a.action === "project-semantic-binding.approved").length, 0);
  const initial = await initialBinding(f);
  const current = explainExpertSemanticResult("onboarding", await executeExpertTurn(planExpertTurn("项目默认双绑定接入", input), transport));
  assert.equal(current.status, "EXISTING_BINDING"); assert.equal(current.existingBinding.bindingDigest, initial.binding.bindingDigest);
  assert.equal(current.recommendedBindingMode, "PRESERVE_EXISTING_BINDING");
  assert.equal((await cli(f, "activation")).data.transitions.length, 0);
});

async function onboardingFixtureData(name) {
  const source=JSON.parse(await fs.readFile(new URL('../fixtures/semantic-onboarding-catalogs.json',import.meta.url)));
  assert.equal(source.fixtureKind,'SOURCE_SYNTHETIC_ONLY');
  const generation=source.generations[name],paths=new Set(generation.entries.map(e=>e.path));
  return {generation,materials:Object.fromEntries([...paths].map(p=>[p,source.materials[p]]))};
}
async function catalogBytes(f) {
  const files=(await fs.readdir(f.root,{recursive:true})).filter(p=>!p.startsWith('runtime-data')).sort(),result={};
  for(const p of files)if((await fs.stat(path.join(f.root,p))).isFile())result[p]=probeDigest((await fs.readFile(path.join(f.root,p))).toString('base64'));
  return result;
}
const onboardingBranches=[
  ['unique',['COMPATIBLE'],'REVIEW_REQUIRED','DUAL_BINDING_REVIEW'],
  ['incompatible',['INCOMPATIBLE'],'NO_COMPATIBLE_MATCH','UNRESOLVED'],
  ['undeclared',['INDETERMINATE'],'EVIDENCE_REQUIRED','UNRESOLVED'],
  ['ambiguous',['COMPATIBLE','COMPATIBLE'],'SELECTION_REQUIRED','DUAL_BINDING_REVIEW'],
  ['mixed-compatible',['COMPATIBLE','INDETERMINATE'],'REVIEW_REQUIRED','DUAL_BINDING_REVIEW'],
  ['mixed-unresolved',['INCOMPATIBLE','INDETERMINATE'],'EVIDENCE_REQUIRED','UNRESOLVED']
];
for(const [name,statuses,status,mode] of onboardingBranches)for(const role of ['viewer','operator'])
test(`RC02 onboarding branch ${name} via ${role} CLI and Expert MCP is read-only`,async t=>{
  const f=await fixture(t,await onboardingFixtureData(name)),token='synthetic-'+role,{client}=await mcp(t,f,token);
  const before=await catalogBytes(f),project=f.store.readProject(f.scope.projectId),audit=f.store.listAudit();
  const observed=[],observe=req=>observed.push({method:req.method,url:req.url});f.server.on('request',observe);
  const out=await cli(f,'onboarding',['--catalog',f.selection.catalogId],token);assert.equal(out.code,0,out.stderr);
  const calls=[],response=await executeExpertTurn(planExpertTurn('新项目语义接入',{projectId:f.scope.projectId,catalogId:f.selection.catalogId}),{
    invoke:(tool,payload)=>{calls.push(tool);return client.callTool({name:tool,arguments:payload});}});
  const data=response.structuredContent.response.data,summary=explainExpertSemanticResult('onboarding',response);
  assert.equal(response.isError,false);assert.equal(data.status,status);assert.equal(summary.status,status);assert.equal(summary.recommendedBindingMode,mode);
  assert.deepEqual(calls,['evopilot_project_semantic_capabilities','evopilot_project_semantic_onboarding']);
  const {requestId,...cliData}=out.data;assert.match(requestId,/^[a-zA-Z0-9._-]{1,128}$/);assert.deepEqual(cliData,data);
  const {onboardingDigest,...body}=data;assert.equal(onboardingDigest,probeDigest(body));assert.equal(summary.onboardingDigest,onboardingDigest);
  assert.equal(data.compatibleCount,statuses.filter(s=>s==='COMPATIBLE').length);assert.equal(data.candidates.length,statuses.length);
  const byId=[...data.candidates].sort((a,b)=>a.bundleId.localeCompare(b.bundleId));
  for(const [i,candidate] of byId.entries()){
    const entry=f.generation.entries.find(e=>e.kind==='HarnessBundle'&&e.id==='onboarding-'+i);
    assert.equal(candidate.bundleDigest,entry.objectDigest);assert.equal(candidate.artifactSetDigest,f.selection.artifactSetDigest);
    assert.equal(candidate.status,statuses[i]);assert.deepEqual(candidate.reasons,statuses[i]==='COMPATIBLE'?[]:[statuses[i]==='INCOMPATIBLE'?'REQUIRED_CONCEPT_MISSING':'REQUIREMENTS_NOT_DECLARED']);
  }
  assert.deepEqual(summary.candidates,data.candidates);assert.equal(data.selectedCandidate,null);assert.equal(data.existingBinding,null);
  assert.deepEqual(data.missingInputs,data.compatibleCount?['artifactSetDigest','bundleDigest']:[]);
  for(const key of ['bindingCreated','eligibleForExecution','grantsExecutionAuthority'])assert.equal(data[key],false);
  assert.equal(data.preservesLegacyBindings,true);assert.equal(data.requiresSeparateBindingApproval,true);
  assert.equal(summary.businessField,null);assert.equal(summary.productType,null);assert.equal(summary.canExecute,false);assert.equal(summary.canComplete,false);
  assert.ok(observed.length>=4);assert.ok(observed.every(r=>r.method==='GET'&&(
    r.url===`/api/v1/projects/${f.scope.projectId}/semantic-capabilities`||r.url===`/api/v1/projects/${f.scope.projectId}/semantic-catalogs/${f.selection.catalogId}/onboarding`)));
  assert.deepEqual(await catalogBytes(f),before);assert.deepEqual(f.store.readProject(f.scope.projectId),project);assert.deepEqual(f.store.listAudit(),audit);
  await assert.rejects(fs.stat(path.join(f.configuration.dataRoot,'project-semantic-bindings')),{code:'ENOENT'});
  for(const mutate of [r=>{r.status='COMPLETE';},r=>{r.selectedCandidate=r.candidates[0];},r=>{r.compatibleCount++;},r=>{r.businessField='invented';},r=>{r.grantsExecutionAuthority=true;}]){
    const forged=structuredClone(response);mutate(forged.structuredContent.response.data);
    const d=forged.structuredContent.response.data;delete d.onboardingDigest;d.onboardingDigest=probeDigest(d);
    assert.throws(()=>explainExpertSemanticResult('onboarding',forged),/SEMANTIC_RESPONSE_INVALID/);
  }
});

for(const role of ['viewer','operator'])test(`RC02 existing binding via ${role} preserves exact pins despite ambiguous candidates and another Catalog request`,async t=>{
  const f=await fixture(t,await onboardingFixtureData('ambiguous')),initial=await initialBinding(f),token='synthetic-'+role,{client}=await mcp(t,f,token);
  const before=await catalogBytes(f),audit=f.store.listAudit(),calls=[];
  const response=await executeExpertTurn(planExpertTurn('新项目语义接入',{projectId:f.scope.projectId,catalogId:'not-configured-catalog'}),{
    invoke:(tool,payload)=>{calls.push(tool);return client.callTool({name:tool,arguments:payload});}});
  const summary=explainExpertSemanticResult('onboarding',response),out=await cli(f,'onboarding',['--catalog','not-configured-catalog'],token);
  assert.equal(out.code,0,out.stderr);assert.equal(summary.status,'EXISTING_BINDING');assert.equal(summary.recommendedBindingMode,'PRESERVE_EXISTING_BINDING');
  assert.equal(summary.existingBinding.bindingDigest,initial.binding.bindingDigest);assert.equal(summary.existingBinding.catalogId,f.selection.catalogId);
  assert.deepEqual(summary.candidates,[]);assert.deepEqual(summary.missingInputs,[]);assert.equal(summary.canExecute,false);assert.equal(summary.canComplete,false);
  assert.equal(out.data.onboardingDigest,summary.onboardingDigest);assert.deepEqual(calls,['evopilot_project_semantic_capabilities','evopilot_project_semantic_onboarding']);
  const {requestId,...bound}=(await cli(f,'binding',[],token)).data,{requestId:ignored,...expected}=initial;
  assert.deepEqual(bound,expected);assert.equal((await cli(f,'activation',[],token)).data.transitions.length,0);
  assert.deepEqual(await catalogBytes(f),before);assert.deepEqual(f.store.listAudit(),audit);
});
for(const [name,change] of [
  ['unconfigured selected Catalog',async f=>{f.registry.catalogs[0].enabled=false;await f.write('registry.yaml',f.registry);}],
  ['missing published pointer',f=>fs.rename(path.join(f.root,'SEMANTIC-CATALOG.json'),path.join(f.root,'unpublished-pointer.json'))]
])test(`RC02 onboarding ${name} remains a named refusal, never fabricated empty guidance`,async t=>{
  const f=await fixture(t),{client}=await mcp(t,f,'synthetic-viewer');assert.equal((await cli(f,'onboarding',['--catalog',f.selection.catalogId])).data.status,'REVIEW_REQUIRED');
  await change(f);const before=await catalogBytes(f),audit=f.store.listAudit(),calls=[];
  const out=await cli(f,'onboarding',['--catalog',f.selection.catalogId],'synthetic-viewer');
  const refusal=runtimeRefusalCliResult(out.code,out.stdout,out.stderr);assert.equal(refusal.json.error,'SEMANTIC_CATALOG_UNAVAILABLE');
  const response=await executeExpertTurn(planExpertTurn('新项目语义接入',{projectId:f.scope.projectId,catalogId:f.selection.catalogId}),{
    invoke:(tool,payload)=>{calls.push(tool);return client.callTool({name:tool,arguments:payload});}});
  assert.equal(response.isError,true);assert.equal(response.structuredContent.status,404);assert.equal(response.structuredContent.response.error,'SEMANTIC_CATALOG_UNAVAILABLE');
  const summary=explainExpertSemanticResult('onboarding',response);assert.equal(summary.status,'BLOCKED');assert.equal(summary.canExecute,false);assert.equal(summary.canComplete,false);
  assert.deepEqual(calls,['evopilot_project_semantic_capabilities','evopilot_project_semantic_onboarding']);
  assert.deepEqual(await catalogBytes(f),before);assert.deepEqual(f.store.listAudit(),audit);
  await assert.rejects(fs.stat(path.join(f.configuration.dataRoot,'project-semantic-bindings')),{code:'ENOENT'});
});
for(const [name,reason,destination] of [['incompatible','REQUIRED_CONCEPT_MISSING','ONTOLOGY_MATERIAL_REVIEW'],['undeclared','REQUIREMENTS_NOT_DECLARED','HARNESS_DECLARATION_REVIEW']])
test(`RC02 ${name} gap handoff through CLI and Expert MCP never selects a successor`,async t=>{
  const f=await fixture(t,await onboardingFixtureData(name)),{client}=await mcp(t,f,'synthetic-viewer'),before=await catalogBytes(f),audit=f.store.listAudit();
  const calls=[],response=await executeExpertTurn(planExpertTurn('查看语义缺口',{projectId:f.scope.projectId,...f.selection}),{
    invoke:(tool,payload)=>{calls.push(tool);return client.callTool({name:tool,arguments:payload});}});
  assert.equal(response.isError,false);const summary=explainExpertSemanticResult('gap',response),data=response.structuredContent.response.data;
  const out=await cli(f,'gap',selectionArgs(f),'synthetic-viewer');assert.equal(out.code,0,out.stderr);assert.equal(out.data.gapDigest,summary.gapDigest);
  const {gapDigest,...body}=data;assert.equal(gapDigest,probeDigest(body));assert.deepEqual(summary.findings,[{reason,destination}]);
  assert.equal(summary.status,'REVIEW_REQUIRED');assert.equal(summary.compatibilityStatus,name==='incompatible'?'INCOMPATIBLE':'INDETERMINATE');
  assert.equal(data.selectedSuccessor,null);assert.ok(Object.values(data.authority).every(v=>v===false));assert.equal(data.successorHandoff.preservesExistingRunPins,true);
  assert.equal(summary.canExecute,false);assert.equal(summary.canComplete,false);assert.deepEqual(calls,['evopilot_project_semantic_capabilities','evopilot_project_semantic_gap']);
  assert.deepEqual(await catalogBytes(f),before);assert.deepEqual(f.store.listAudit(),audit);
  await assert.rejects(fs.stat(path.join(f.configuration.dataRoot,'project-semantic-bindings')),{code:'ENOENT'});
});

test("onboarding transport refuses extra fields, body/query injection, foreign scope and old capability", async t => {
  const f = await fixture(t), {call} = await mcp(t, f), args = ["--catalog", f.selection.catalogId];
  assert.equal((await call("onboarding", {catalogId: f.selection.catalogId, decision: "APPROVE"})).isError, true);
  assert.notEqual((await cli(f, "onboarding", [...args, "--bundle-digest", f.selection.bundleDigest])).code, 0);
  assert.notEqual((await cli(f, "onboarding", args, "synthetic-foreign")).code, 0);
  const base = `${f.serverUrl}/api/v1/projects/${f.scope.projectId}/semantic-catalogs/${f.selection.catalogId}/onboarding`;
  const response = await fetch(base + "?actor=admin", {headers: {authorization: "Bearer synthetic-operator"}});
  assert.equal(response.status, 400); assert.equal(response.headers.get("cache-control"), "no-store");
  const requests = []; f.serverUrl = await listen(t, http.createServer((req, res) => {
    requests.push(req.url); res.writeHead(200, {"content-type": "application/json"});
    res.end(JSON.stringify({data: {...projectSemanticCapabilities(f.scope.projectId), operations: projectSemanticCapabilities(f.scope.projectId).operations.filter(op => op !== "onboarding")}}));
  }));
  assert.notEqual((await cli(f, "onboarding", args)).code, 0);
  const older = await mcp(t, f); assert.equal((await older.call("onboarding", {catalogId: f.selection.catalogId})).isError, true);
  assert.equal(requests.length, 2); assert(requests.every(url => url.endsWith("/semantic-capabilities")));
});

test('RC02 runner executes activation, successor migration, rollback and historical readback against actual CLI/Runtime',async t=>{
  const f=await fixture(t),{requestId,...initial}=await initialBinding(f),operations=[];
  const base={scope:f.scope,initial,invoke:bindingJourneyInput(f,operations).invoke};
  const activateInput={...base,targetReview:initial.review,transition:{action:'ACTIVATE',expectedHeadDigest:initial.binding.bindingDigest,destinationDigest:initial.binding.bindingDigest}};
  const prepared=await runRuntimeTransitionJourney(activateInput);assert.equal(prepared.status,'WAITING_EXACT_DECISION');assert.deepEqual(operations,['activation','transitionReview']);
  const decision={transitionReviewDigest:prepared.review.transitionReviewDigest,decision:'APPROVE',principalId:'current-operator'};
  const activated=await runRuntimeTransitionJourney({...activateInput,phase:'submit',review:prepared.review,decision});assert.equal(activated.status,'TRANSITION_SUBJOURNEY_ASSERTIONS_PASSED');
  f.policy.catalogs[0].trustContext='rc02-successor';await f.write('policy.json',f.policy);
  const {requestId:ignored,...targetReview}=(await cli(f,'review',selectionArgs(f))).data;
  const migrateInput={...base,targetReview,transition:{action:'MIGRATE',expectedHeadDigest:activated.headDigest,destinationDigest:targetReview.reviewDigest}};
  const migration=await runRuntimeTransitionJourney(migrateInput),migrationDecision={...decision,transitionReviewDigest:migration.review.transitionReviewDigest};
  const migrated=await runRuntimeTransitionJourney({...migrateInput,phase:'submit',review:migration.review,decision:migrationDecision});assert.equal(migrated.receiptPosition,'CURRENT_HEAD');
  const rollbackInput={...base,targetReview:initial.review,transition:{action:'ROLLBACK',expectedHeadDigest:migrated.headDigest,destinationDigest:initial.binding.bindingDigest}};
  const rollback=await runRuntimeTransitionJourney(rollbackInput);
  const rolled=await runRuntimeTransitionJourney({...rollbackInput,phase:'submit',review:rollback.review,decision:{...decision,transitionReviewDigest:rollback.review.transitionReviewDigest}});
  assert.equal(rolled.status,'TRANSITION_SUBJOURNEY_ASSERTIONS_PASSED');
  const before=operations.length;
  const historical=await runRuntimeTransitionJourney({...migrateInput,phase:'readback',review:migration.review,decision:migrationDecision});
  assert.equal(historical.receiptPosition,'HISTORICAL');assert.equal(historical.headDigest,rolled.headDigest);
  assert.deepEqual(operations.slice(before),['activation','activation']);assert.equal(operations.filter(x=>x==='transitionApprove').length,3);
  const {requestId:correlation,...state}=(await cli(f,'activation')).data;assert.equal(state.bindingDigest,initial.binding.bindingDigest);
  const rehash=(v,k)=>{delete v[k];v[k]=probeDigest(v);};
  for(const [name,mutate] of [
    ['head substitution',v=>{v.headDigest=initial.binding.bindingDigest;}],
    ['broken predecessor',v=>{v.transitions[1].review.expectedHeadDigest=initial.binding.bindingDigest;rehash(v.transitions[1].review,'transitionReviewDigest');rehash(v.transitions[1],'transitionDigest');}],
    ['invented execution authority',v=>{v.transitions[0].review.grantsExecutionAuthority=true;rehash(v.transitions[0].review,'transitionReviewDigest');rehash(v.transitions[0],'transitionDigest');}],
    ['changed diff',v=>{v.transitions[0].review.changedFields=['catalogId'];rehash(v.transitions[0].review,'transitionReviewDigest');rehash(v.transitions[0],'transitionDigest');}],
    ['wrong principal scope',v=>{v.transitions[0].decision.principal.workspaceId='foreign';rehash(v.transitions[0].decision,'decisionDigest');rehash(v.transitions[0],'transitionDigest');}]
  ])await t.test(name,()=>{const bad=structuredClone(state);mutate(bad);assert.throws(()=>assertActivationHistory({state:bad,initial,scope:f.scope}));});
});

test('RC02 validated refreshed review drift is a known refusal before approval',async t=>{
  const f=await fixture(t),{requestId,...initial}=await initialBinding(f),operations=[];
  const input={scope:f.scope,initial,invoke:bindingJourneyInput(f,operations).invoke,targetReview:initial.review,
    transition:{action:'ACTIVATE',expectedHeadDigest:initial.binding.bindingDigest,destinationDigest:initial.binding.bindingDigest}};
  const prepared=await runRuntimeTransitionJourney(input);
  const {transitionReviewDigest,...body}=prepared.review,review={...body,extraExpectedField:'not-in-current-review'};
  review.transitionReviewDigest=probeDigest(review);
  await assert.rejects(runRuntimeTransitionJourney({...input,phase:'submit',review,
    decision:{transitionReviewDigest:review.transitionReviewDigest,decision:'APPROVE',principalId:'current-operator'}}),/RC02_REVIEW_DRIFT/);
  assert.equal(operations.includes('transitionApprove'),false);assert.equal(operations.at(-1),'transitionReview');
});
test('RC02 exact decision, stale head, cancellation and unknown-response readback never replay approval',async t=>{
  const f=await fixture(t),{requestId,...initial}=await initialBinding(f),operations=[];
  const base={scope:f.scope,initial,invoke:bindingJourneyInput(f,operations).invoke,targetReview:initial.review,
    transition:{action:'ACTIVATE',expectedHeadDigest:initial.binding.bindingDigest,destinationDigest:initial.binding.bindingDigest}};
  const prepared=await runRuntimeTransitionJourney(base),decision={transitionReviewDigest:prepared.review.transitionReviewDigest,decision:'APPROVE',principalId:'current-operator'};
  const before=operations.length;
  await assert.rejects(runRuntimeTransitionJourney({...base,phase:'submit',review:prepared.review,decision:{...decision,transitionReviewDigest:initial.review.reviewDigest}}),/EXACT_DECISION_REQUIRED/);
  const controller=new AbortController();controller.abort();await assert.rejects(runRuntimeTransitionJourney({...base,signal:controller.signal}),/RC02_CANCELLED/);assert.equal(operations.length,before);
  const lost=await runRuntimeTransitionJourney({...base,phase:'submit',review:prepared.review,decision,invoke:async(args,options)=>{
    const result=await base.invoke(args,options);if(args[2]==='transitionApprove')throw Error('synthetic reply lost');return result;
  }});assert.equal(lost.status,'UNKNOWN_OUTCOME');
  const recovered=await runRuntimeTransitionJourney({...base,phase:'readback',review:prepared.review,decision});assert.equal(recovered.receiptPosition,'CURRENT_HEAD');
  await assert.rejects(runRuntimeTransitionJourney({...base,phase:'submit',review:prepared.review,decision}),/RC02_STALE_HEAD/);
  assert.equal(operations.filter(x=>x==='transitionApprove').length,1);
  await assert.rejects(runRuntimeTransitionJourney({...base,timeoutMs:20,invoke:()=>new Promise(()=>{})}),/RC02_TIMEOUT/);
});

test("CLI and MCP switch only future defaults through activation, migration, rollback and historical receipt readback", async t => {
  const f = await fixture(t), initial = await initialBinding(f), {call} = await mcp(t, f);
  const initialDigest = initial.binding.bindingDigest;
  const state = await cli(f, "activation", [], "synthetic-viewer"); assert.equal(state.code, 0); assert.equal(state.data.status, "REVIEWED_DEFAULT");
  const activation = await cli(f, "transitionReview", transitionArgs("ACTIVATE", state.data.headDigest, initialDigest));
  assert.equal(activation.code, 0, activation.stderr);
  assert.equal((await call("transitionApprove", {transitionReviewDigest: activation.data.transitionReviewDigest})).isError, true);
  assert.equal((await call("transitionApprove", {reviewDigest: initial.review.reviewDigest, decision: "APPROVE"})).isError, true);
  const activated = await call("transitionApprove", {transitionReviewDigest: activation.data.transitionReviewDigest, decision: "APPROVE"});
  assert.equal(activated.isError, false, JSON.stringify(activated));
  const head = activated.structuredContent.response.data.transitionDigest;
  f.policy.catalogs[0].trustContext = "transport-successor"; await f.write("policy.json", f.policy);
  const successor = await cli(f, "review", selectionArgs(f)); assert.equal(successor.code, 0);
  const review = await call("transitionReview", {action: "MIGRATE", expectedHeadDigest: head, destinationDigest: successor.data.reviewDigest});
  assert.equal(review.isError, false, JSON.stringify(review));
  assert.equal(review.structuredContent.response.data.effect, "FUTURE_EXECUTION_PLANS_ONLY");
  const reviewDigest = review.structuredContent.response.data.transitionReviewDigest;
  const args = ["--transition-review-digest", reviewDigest, "--decision", "APPROVE"];
  const migrated = await cli(f, "transitionApprove", args); assert.equal(migrated.code, 0, migrated.stderr);
  assert.equal(migrated.data.decision.principal.id, "current-operator");
  const current = (await call("activation")).structuredContent.response.data;
  assert.equal(current.headDigest, migrated.data.transitionDigest); assert.notEqual(current.bindingDigest, initialDigest);
  const stale = await cli(f, "transitionReview", transitionArgs("ROLLBACK", head, initialDigest)); assert.notEqual(stale.code, 0);
  const rollbackReview = await cli(f, "transitionReview", transitionArgs("ROLLBACK", current.headDigest, initialDigest)); assert.equal(rollbackReview.code, 0);
  const rolled = await call("transitionApprove", {transitionReviewDigest: rollbackReview.data.transitionReviewDigest, decision: "APPROVE"});
  assert.equal(rolled.isError, false, JSON.stringify(rolled));
  const before = (await cli(f, "activation")).data; assert.equal(before.bindingDigest, initialDigest); assert.equal(before.transitions.length, 3);
  assert.deepEqual((await cli(f, "transitionApprove", args)).data.transitionDigest, migrated.data.transitionDigest);
  const after = (await call("activation")).structuredContent.response.data;
  assert.equal(after.headDigest, before.headDigest); assert.equal(after.transitions.length, 3);
  assert.equal(explainExpertSemanticResult("transitionApprove", rolled).status, "TRANSITION_RECORDED");
  assert.equal(explainExpertSemanticResult("activation", await call("activation")).transitionCount, 3);
  const viewer = await mcp(t, f, "synthetic-viewer");
  assert.equal((await viewer.call("activation")).isError, false);
  assert.equal((await viewer.call("transitionApprove", {transitionReviewDigest: reviewDigest, decision: "APPROVE"})).structuredContent.status, 403);
});

test("Expert Core drives exact transition through stdio MCP and recovers from Runtime state only", async t => {
  const f = await fixture(t), {requestId,...initial} = await initialBinding(f), {client} = await mcp(t, f), calls = [];
  const transport = {invoke: async (tool, payload) => {calls.push(tool); return client.callTool({name: tool, arguments: payload});}};
  const stateResponse=await executeExpertTurn(planExpertTurn("激活语义地图", {projectId: f.scope.projectId}), transport);
  const state = explainExpertSemanticResult("activation",stateResponse);
  assert.equal(state.status, "REVIEWED_DEFAULT"); assert.equal(state.transitionCount, 0);
  const expected={scope:f.scope,initial,beforeState:stateResponse.structuredContent.response.data,targetReview:initial.review,
    transition:{action:'ACTIVATE',expectedHeadDigest:state.headDigest,destinationDigest:initial.binding.bindingDigest}};
  const oracle=(operation,response,extra={})=>assertExpertTransitionPresentation({...expected,operation,response,explanation:explainExpertSemanticResult(operation,response),...extra});
  assert.equal(oracle('activation',stateResponse).status,'TRANSITION_PRESENTATION_ASSERTIONS_PASSED');
  const preview = await executeExpertTurn(planExpertTurn("准备语义激活评审", {projectId: f.scope.projectId, action: "ACTIVATE",
    expectedHeadDigest: state.headDigest, destinationDigest: initial.binding.bindingDigest}), transport);
  const summary = explainExpertSemanticResult("transitionReview", preview); assert.equal(summary.status, "WAITING_EXACT_HUMAN_DECISION");
  assert.equal(oracle('transitionReview',preview).targetCriteriaClosed,0);
  const plan = planExpertTurn("批准语义激活评审", {projectId: f.scope.projectId, transitionReviewDigest: summary.transitionReviewDigest, decision: "APPROVE"});
  const count = calls.length; await assert.rejects(() => executeExpertTurn(plan, transport), /EXACT_DECISION_REQUIRED/); assert.equal(calls.length, count);
  const decision={authorizationDigest: summary.transitionReviewDigest, evidenceRef: "decision://synthetic-transition"};
  const approved = await executeExpertTurn(plan, transport, decision);
  assert.equal(explainExpertSemanticResult("transitionApprove", approved).status, "TRANSITION_RECORDED");
  assert.equal(oracle('transitionApprove',approved,{review:preview.structuredContent.response.data,decision}).status,'TRANSITION_PRESENTATION_ASSERTIONS_PASSED');
  const resumedResponse=await executeExpertTurn(planExpertTurn("恢复语义迁移状态", {projectId: f.scope.projectId}), transport);
  const resumed = explainExpertSemanticResult("activation",resumedResponse);
  assert.equal(oracle('activation',resumedResponse).status,'TRANSITION_PRESENTATION_ASSERTIONS_PASSED');
  for(const forged of [{...resumed,canExecute:true},{...resumed,status:'COMPLETE'},{...resumed,transitionCount:0},{...resumed,transitionReceipts:[]}])
    assert.throws(()=>oracle('activation',resumedResponse,{explanation:forged}));
  assert.equal(resumed.status, "ACTIVE_FOR_FUTURE_PLANS"); assert.equal(resumed.transitionReceipts[0].transitionReviewDigest, summary.transitionReviewDigest);
  assert.equal(resumed.canExecute, false); assert.equal(resumed.canComplete, false);
  assert.equal(calls.filter(tool => tool.endsWith("transitionApprove")).length, 1);
});

test("older six-operation Runtime cannot admit transition tools by version or schema alone", async t => {
  const f = await fixture(t), requests = [];
  f.serverUrl = await listen(t, http.createServer((req, res) => {
    requests.push({method: req.method, url: req.url}); res.writeHead(200, {"content-type": "application/json"});
    res.end(JSON.stringify({data: {...projectSemanticCapabilities(f.scope.projectId), operations: ["capabilities", "inspect", "compatibility", "review", "approve", "binding"]}}));
  }));
  const {call} = await mcp(t, f), hash = "sha256:" + "a".repeat(64);
  for (const [operation, args, fields] of [["activation", [], {}], ["transitionReview", transitionArgs("ACTIVATE", hash, hash), {action: "ACTIVATE", expectedHeadDigest: hash, destinationDigest: hash}],
    ["transitionApprove", ["--transition-review-digest", hash, "--decision", "APPROVE"], {transitionReviewDigest: hash, decision: "APPROVE"}]]) {
    assert.notEqual((await cli(f, operation, args)).code, 0);
    assert.equal((await call(operation, fields)).isError, true);
  }
  assert.equal(requests.length, 6); assert(requests.every(r => r.method === "GET" && r.url.endsWith("/semantic-capabilities")));
});

test("transition approval rechecks revoked policy and strict transport fields cannot inject authority", async t => {
  const f = await fixture(t), initial = await initialBinding(f), {call} = await mcp(t, f), hash = initial.binding.bindingDigest;
  const review = await cli(f, "transitionReview", transitionArgs("ACTIVATE", hash, hash)); assert.equal(review.code, 0);
  assert.equal((await call("transitionReview", {action: "ACTIVATE", expectedHeadDigest: hash, destinationDigest: hash, actor: "admin"})).isError, true);
  for (const args of [[...transitionArgs("ACTIVATE", hash, hash), "--action", "MIGRATE"], transitionArgs("LATEST", hash, hash)])
    assert.notEqual((await cli(f, "transitionReview", args)).code, 0);
  f.policy.catalogs[0].permission = "DENIED"; await f.write("policy.json", f.policy);
  const refused = await call("transitionApprove", {transitionReviewDigest: review.data.transitionReviewDigest, decision: "APPROVE"});
  assert.equal(refused.structuredContent.status, 403);
  assert.equal(f.store.listAudit().filter(row => row.action === "project-semantic-binding.transition-approved").length, 0);
});

for (const transportName of ["cli", "mcp"]) test(`${transportName} lost transition approval response is reconciled by exact activation receipt without replay`, async t => {
  const f = await fixture(t), initial = await initialBinding(f), realUrl = f.serverUrl, hash = initial.binding.bindingDigest;
  const review = await cli(f, "transitionReview", transitionArgs("ACTIVATE", hash, hash)); assert.equal(review.code, 0);
  const digest = review.data.transitionReviewDigest; let mutations = 0;
  const proxyUrl = await listen(t, http.createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const upstream = await fetch(realUrl + req.url, {method: req.method, headers: {authorization: "Bearer synthetic-operator", "content-type": "application/json"}, ...(body ? {body} : {})});
    const text = await upstream.text();
    if (req.method === "POST") {mutations++; assert.equal(upstream.status, 200); res.destroy(); return;}
    res.writeHead(upstream.status, {"content-type": "application/json"}); res.end(text);
  }));
  const proxied = {...f, serverUrl: proxyUrl};
  if (transportName === "cli") assert.notEqual((await cli(proxied, "transitionApprove", ["--transition-review-digest", digest, "--decision", "APPROVE"])).code, 0);
  else {const {call} = await mcp(t, proxied); assert.equal((await call("transitionApprove", {transitionReviewDigest: digest, decision: "APPROVE"})).isError, true);}
  assert.equal(mutations, 1);
  let state;
  if (transportName === "cli") {const {call} = await mcp(t, f); state = (await call("activation")).structuredContent.response.data;}
  else {const read = await cli(f, "activation"); assert.equal(read.code, 0); state = read.data;}
  assert.equal(state.transitions.length, 1); assert.equal(state.transitions[0].review.transitionReviewDigest, digest);
  assert.equal(state.headDigest, state.transitions[0].transitionDigest); assert.equal(mutations, 1);
  assert.equal(f.store.listAudit().filter(row => row.action === "project-semantic-binding.transition-approved").length, 1);
});
test("server capability and mutation paths preserve scope and current operator authority", async t => {
  const f = await fixture(t);
  assert.notEqual((await cli(f, "capabilities", [], "synthetic-foreign")).code, 0);
  const {call} = await mcp(t, f, "synthetic-viewer");
  assert.equal((await call("capabilities")).isError, false);
  const denied = await call("review", f.selection); assert.equal(denied.isError, true);
  assert.equal(denied.structuredContent.status, 403);
  const result = await fetch(`${f.serverUrl}/api/v1/projects/${f.scope.projectId}/semantic-capabilities?actor=admin`, {headers: {authorization: "Bearer synthetic-operator"}});
  assert.equal(result.status, 400); assert.equal(result.headers.get("cache-control"), "no-store");
});
test("CLI and MCP refuse legacy Runtime without trying the semantic mutation or old fallback", async t => {
  const f = await fixture(t), requests = [];
  f.serverUrl = await listen(t, http.createServer((request, response) => {
    requests.push({method: request.method, url: request.url}); response.writeHead(404, {"content-type": "application/json", "x-request-id": "legacy-refusal"});
    response.end(JSON.stringify({error: "NOT_FOUND", requestId: "legacy-refusal"}));
  }));
  assert.notEqual((await cli(f, "review", selectionArgs(f))).code, 0);
  const {call} = await mcp(t, f), refused = await call("review", f.selection);
  assert.equal(refused.isError, true); assert.equal(refused.structuredContent.stage, "CAPABILITY_NEGOTIATION");
  assert.equal(refused.structuredContent.requestId, "legacy-refusal");
  assert.equal(requests.length, 2); assert(requests.every(r => r.method === "GET" && r.url.endsWith("/semantic-capabilities")));
});
test("invalid CLI fields and duplicate selection fail before any server request", async t => {
  const f = await fixture(t), requests = [];
  f.serverUrl = await listen(t, http.createServer((req, res) => {requests.push(req.url); res.writeHead(500); res.end();}));
  for (const args of [[...selectionArgs(f), "--approved"], [...selectionArgs(f), "--catalog", "other"], [...selectionArgs(f), "--file", "anything.json"]]) {
    assert.notEqual((await cli(f, "review", args)).code, 0);
  }
  assert.deepEqual(requests, []);
});

test("malformed capability response and redirect never permit mutation or forward credentials", async t => {
  const f = await fixture(t), requests = [], redirected = [];
  const other = await listen(t, http.createServer((req, res) => {redirected.push(req.headers); res.end("{}");}));
  let redirect = false;
  f.serverUrl = await listen(t, http.createServer((req, res) => {
    requests.push(req.method); res.writeHead(redirect ? 302 : 200, {"content-type": "application/json", ...(redirect ? {location: other} : {})});
    res.end(JSON.stringify({data: {version: "6.3.0", operations: ["review"], projectId: f.scope.projectId}}));
  }));
  const {call} = await mcp(t, f);
  for (const value of [false, true]) {
    redirect = value;
    assert.notEqual((await cli(f, "review", selectionArgs(f))).code, 0);
    assert.equal((await call("review", f.selection)).isError, true);
  }
  assert.deepEqual(requests, ["GET", "GET", "GET", "GET"]); assert.deepEqual(redirected, []);
});

test("valid negotiation cannot override policy revoked after review", async t => {
  const f = await fixture(t), {call} = await mcp(t, f);
  const review = await cli(f, "review", selectionArgs(f)); assert.equal(review.code, 0);
  f.policy.catalogs[0].permission = "DENIED"; await f.write("policy.json", f.policy);
  const result = await call("approve", {reviewDigest: review.data.reviewDigest, decision: "APPROVE"});
  assert.equal(result.isError, true); assert.equal(result.structuredContent.status, 403);
  assert.equal(f.store.listAudit().filter(row => row.action === "project-semantic-binding.approved").length, 0);
  assert.equal((await call("binding")).structuredContent.status, 404);
});

for (const transportName of ["cli", "mcp"]) test(`${transportName} lost approval response is not retried; fresh other transport inspects authoritative binding`, async t => {
  const f = await fixture(t), realUrl = f.serverUrl;
  const review = await cli(f, "review", selectionArgs(f)); assert.equal(review.code, 0);
  let mutations = 0;
  const proxyUrl = await listen(t, http.createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const upstream = await fetch(realUrl + req.url, {method: req.method, headers: {authorization: "Bearer synthetic-operator", "content-type": "application/json"},
      ...(body ? {body} : {})});
    const text = await upstream.text();
    if (req.method === "POST") {mutations++; res.destroy(); return;}
    res.writeHead(upstream.status, {"content-type": "application/json"}); res.end(text);
  }));
  const proxied = {...f, serverUrl: proxyUrl};
  if (transportName === "cli") {
    assert.notEqual((await cli(proxied, "approve", ["--review-digest", review.data.reviewDigest, "--decision", "APPROVE"])).code, 0);
  } else {
    const {call} = await mcp(t, proxied);
    assert.equal((await call("approve", {reviewDigest: review.data.reviewDigest, decision: "APPROVE"})).isError, true);
  }
  assert.equal(mutations, 1);
  assert.equal(f.store.listAudit().filter(row => row.action === "project-semantic-binding.approved").length, 1);
  if (transportName === "cli") {
    const {call} = await mcp(t, f), result = await call("binding"); assert.equal(result.isError, false);
    assert.equal(result.structuredContent.response.data.review.reviewDigest, review.data.reviewDigest);
  } else {
    const result = await cli(f, "binding"); assert.equal(result.code, 0); assert.equal(result.data.review.reviewDigest, review.data.reviewDigest);
  }
  assert.equal(mutations, 1);
});
