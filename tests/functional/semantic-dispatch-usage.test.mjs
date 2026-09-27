import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {semanticCurrentOwnerFixture} from "../helpers/semantic-current-owner-fixture.mjs";
import {createSemanticExecutionApplication,semanticExecutionImplementationDigest} from "../../packages/server/dist/application/semantic-execution-application.js";
import {createServer} from "../../packages/server/dist/index.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

// Synthetic source adapter observations exercise native provenance branches;
// they do not qualify a production Host or establish incurred provider spend.
async function fixture(t,options={}) {
  const f=await semanticCurrentOwnerFixture(t,{publishedMaterials:true,runtimeDigest:semanticExecutionImplementationDigest});
  const observed=new Map();let calls=0;
  const adapter={...f.owners.adapter,execute:async request=>{
    calls++;
    if(options.waiting)throw Error("SYNTHETIC_RESPONSE_LOST");
    const result=await f.owners.adapter.execute(request),observation=f.owners.adapter.readProcessObservation(request,result),m=observation.material;
    m.origin=options.synthetic?"SYNTHETIC_PROCESS_RUNNER":"NATIVE_PROCESS_RUNNER";
    m.usageCoverage=options.unknown?"UNAVAILABLE":"COMPLETE";m.cost={amount:0.25,currency:"USD",inputTokens:3,outputTokens:2};
    if(options.status==="FAILED"){result.status="FAILED";m.exitCode=1;}
    if(options.status==="UNCERTAIN"){result.status="UNCERTAIN";m.termination="TIMEOUT";}
    result.cost=structuredClone(m.cost);observation.receiptDigest=d(m);result.receiptDigest=observation.receiptDigest;
    observed.set(request.id,observation);return result;
  },readProcessObservation:request=>options.noObservation?undefined:observed.get(request.id)};
  const owners={governed:f.governed,lifecycle:f.lifecycleService,adapter,now:f.time.get},restart=()=>createSemanticExecutionApplication(f.configuration,owners),app=restart();
  const access={currentAccess:f.ownerInputs.currentAccess};
  const declaration={identity:f.identity,runId:f.run.id,requestDigest:f.run.pendingExecution.requestDigest,goalTarget:f.state.goalTarget,
    contextPlan:f.state.contextPlan,outcomePlan:f.state.outcomePlan,selections:f.selected};
  await app.prepare(declaration,access);const binding=await app.bind(f.identity,access),input={identity:f.identity,bindingDigest:binding.bindingDigest};
  const review=await app.review({...input,coverage:f.source.acceptanceCriteria.map(c=>({criterionDigest:c.criterionDigest,ruleIds:["units"]}))},access);
  await app.approveReview({...input,reviewDigest:review.reviewDigest,decision:"APPROVE"},access);
  const key={scope:f.scope,runId:f.run.id,sourceRequestDigest:declaration.requestDigest};
  const file=kind=>path.join(f.configuration.dataRoot,"project-semantic-bindings",kind,d(key).slice(7)+".json");
  const mutate=(kind,fn)=>{const name=file(kind),{recordDigest,...body}=JSON.parse(fs.readFileSync(name));fn(body.value);fs.writeFileSync(name,JSON.stringify({...body,recordDigest:d(body)}));};
  return {...f,app,restart,access,input,file,mutate,calls:()=>calls,
    view:(service=app)=>service.goalViews(f.identity.goalId,{currentAccess:()=>access.currentAccess()}).runStatus,
    dispatch:()=>app.dispatch(input,access)};
}
for(const status of ["SUCCEEDED","FAILED","UNCERTAIN"]) test(`uncompleted ${status} dispatch has independently verified usage without completion`,async t=>{
  const f=await fixture(t,{status});assert.equal(f.view().dispatchUsage.entries[0].state,"NOT_DISPATCHED");
  assert.equal(f.calls(),0);await f.dispatch();const before=fs.readFileSync(f.file("dispatch-results"),"utf8"),view=f.view();
  assert.equal(view.status,"BLOCKED");assert.equal(view.llmUsage.totals,null);
  assert.equal(view.dispatchUsage.status,"VERIFIED_KNOWN_DISPATCHES");assert.equal(view.dispatchUsage.totals.totalTokens,5);
  assert.equal(view.dispatchUsage.entries[0].state,status);assert.equal(view.dispatchUsage.grantsAuthority,false);
  assert.deepEqual(f.view(f.restart()).dispatchUsage,view.dispatchUsage);assert.equal(f.calls(),1);
  assert.equal(fs.readFileSync(f.file("dispatch-results"),"utf8"),before);
});
test("claim without receipt stays waiting and readback never replays or clears it",async t=>{
  const f=await fixture(t,{waiting:true});await assert.rejects(f.dispatch(),/SYNTHETIC_RESPONSE_LOST/);
  const before=fs.readFileSync(f.file("dispatch-claims"),"utf8"),usage=f.view().dispatchUsage;
  assert.equal(usage.entries[0].state,"WAITING_RECEIPT");assert.equal(usage.totals,null);assert.equal(usage.coverage.unresolvedRequests,1);
  assert.deepEqual(f.view(f.restart()).dispatchUsage,usage);assert.equal(f.calls(),1);assert.equal(fs.readFileSync(f.file("dispatch-claims"),"utf8"),before);
});
for(const [name,options,state] of [["missing telemetry",{unknown:true},"SUCCEEDED"],["missing observation",{noObservation:true},"OBSERVATION_UNAVAILABLE"],
  ["synthetic provenance",{synthetic:true},"SYNTHETIC_OBSERVATION_EXCLUDED"]]) test(`${name} is unknown rather than zero`,async t=>{
  const f=await fixture(t,options);await f.dispatch();const usage=f.view().dispatchUsage;
  assert.equal(usage.status,"UNAVAILABLE");assert.equal(usage.totals,null);assert.equal(usage.entries[0].state,state);assert.equal(f.calls(),1);
});
test("legacy claim without usage anchor is explicitly unavailable, never reconstructed by execution",async t=>{
  const f=await fixture(t);await f.dispatch();f.mutate("dispatch-claims",c=>{delete c.usageAnchorDigest;});
  const usage=f.view().dispatchUsage;assert.equal(usage.entries[0].state,"LEGACY_ANCHOR_UNAVAILABLE");assert.equal(usage.totals,null);assert.equal(f.calls(),1);
});
for(const kind of ["dispatch-usage-anchors","dispatch-claims","dispatch-results"]) test(`rehashed ${kind} substitution cannot supply usage`,async t=>{
  const f=await fixture(t);await f.dispatch();f.mutate(kind,c=>{if(kind==="dispatch-usage-anchors")c.identity.goalId="foreign";
    else if(kind==="dispatch-claims")c.binding.requestDigest=d("foreign");else c.result.cost.inputTokens=9;});
  assert.throws(()=>f.view());assert.equal(f.calls(),1);
});
test("retained Lifecycle write claim blocks usage without clearing it",async t=>{
  const f=await fixture(t);await f.dispatch();const lock=path.join(f.configuration.dataRoot,"lifecycle-runs",f.run.id+".json.lock");
  fs.writeFileSync(lock,"synthetic retained claim");assert.throws(()=>f.view());assert(fs.existsSync(lock));assert.equal(f.calls(),1);
});
test("rehashing both anchor and claim cannot change the original pending request",async t=>{
  const f=await fixture(t,{waiting:true});await assert.rejects(f.dispatch());let digest,requestDigest;
  f.mutate("dispatch-usage-anchors",a=>{a.request.inputs={injected:"synthetic-substitution"};
    const {requestDigest:old,...body}=a.request;requestDigest=d(body);a.request.requestDigest=requestDigest;a.requestDigest=requestDigest;digest=d(a);});
  f.mutate("dispatch-claims",c=>{c.usageAnchorDigest=digest;c.binding.requestDigest=requestDigest;});
  assert.throws(()=>f.view(),/AGENT_EXECUTION_SEMANTIC_CONTEXT_INVALID/);assert.equal(f.calls(),1);
});
test("HTTP run-status exposes failed dispatch usage only to current scoped operators",async t=>{
  const f=await fixture(t,{status:"FAILED"});await f.dispatch();
  const server=createServer({dataRoot:f.configuration.dataRoot,runtimeMode:"debug",llmClient:{},allowSampleData:false,autoRegisterProfileProject:false,
    harnessRegistryConfig:f.configuration.registryConfigPath,semanticCatalogPolicyPath:f.configuration.policyPath,
    tokens:[{name:f.access.currentAccess().principal.id,token:"synthetic-operator",role:"operator",...f.scope},
      {name:"viewer",token:"synthetic-viewer",role:"viewer",...f.scope},{name:"foreign",token:"synthetic-foreign",role:"operator",tenantId:"other",workspaceId:"other"}]});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const url=`http://127.0.0.1:${server.address().port}/api/v1/goals/${f.identity.goalId}/run-status`;
  const r=await fetch(url,{headers:{authorization:"Bearer synthetic-operator"}});assert.equal(r.status,200);assert.equal(r.headers.get("cache-control"),"no-store");
  const body=(await r.json()).data;assert.equal(body.dispatchUsage.entries[0].state,"FAILED");assert.equal(body.dispatchUsage.totals.totalTokens,5);
  assert.equal(body.release.authorized,false);assert.equal(body.status,"BLOCKED");
  for(const token of ["synthetic-viewer","synthetic-foreign"])assert.equal((await fetch(url,{headers:{authorization:"Bearer "+token}})).status,403);
  assert.equal(f.calls(),1);
});
