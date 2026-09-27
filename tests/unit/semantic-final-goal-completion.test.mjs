import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {semanticPhaseFixture} from "../helpers/semantic-phase-fixture.mjs";
import {semanticPhaseDefinition,semanticTargetDefinition} from "../../packages/server/dist/application/semantic-runtime-sources.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";
import {createServer} from "../../packages/server/dist/index.js";
import {GoalRecordStore} from "../../packages/server/dist/storage/goal-record-store.js";

// Synthetic local fixtures, never real Host, provider or release qualification.
async function fixture(t,options={}) {
  const f = await semanticPhaseFixture(t,{
    beforeSource:g=>{
      if (!options.nonGa) {g.terminalMaturity="ga";g.plan.terminalMaturity="ga";g.plan.targets[0].phase="ga";g.plan.phaseTargets[0].phase="ga";}
      else {delete g.terminalMaturity;delete g.plan.terminalMaturity;}
      options.beforeSource?.(g);
    },
    finalGoalCompletionPolicy:options.noPolicy ? undefined : ({source,now,goal,scope})=>{
      const {phaseTargetId,...goalScope}=scope;
      const policy={schema:"evopilot-semantic-final-goal-completion-policy/v1",action:"COMMIT_VALIDATED_GOAL",scope:goalScope,
        goalDigest:source.pins.goalDigest,planDigest:source.pins.planDigest,
        requiredTargets:goal.plan.targets.filter(t=>t.required).map(t=>({targetId:t.id,targetDigest:d(semanticTargetDefinition(t))})).sort((a,b)=>a.targetId.localeCompare(b.targetId)),
        requiredPhases:goal.plan.phaseTargets.map(p=>({phaseTargetId:p.id,phaseDefinitionDigest:d(semanticPhaseDefinition(p))})).sort((a,b)=>a.phaseTargetId.localeCompare(b.phaseTargetId)),
        status:"ACTIVE",validFrom:new Date(now-60000).toISOString(),validUntil:new Date(now+60000).toISOString()};
      options.policy?.(policy); return policy;
    }});
  if (!options.pendingPhase) f.app.completePhase(f.phaseInput,f.access);
  return f;
}
const snapshot=f=>Object.fromEntries(fs.readdirSync(f.configuration.dataRoot,{recursive:true}).filter(n=>n.endsWith(".json"))
  .map(n=>[n,fs.readFileSync(path.join(f.configuration.dataRoot,n),"utf8")]));
const commit=f=>f.app.completeGoal(f.value,f.access);
for(const nonGa of [false,true]) test(`explicit ${nonGa?"phase":"GA"} Goal closes atomically, survives restart and never releases`,async t=>{
  const f=await fixture(t,{nonGa}),before=snapshot(f),r=commit(f),after=snapshot(f),g=f.rawGoal();
  assert.equal(g.status,"COMPLETED"); assert.equal(r.goalCompleted,true);assert.equal(r.releaseAuthorized,false);
  assert.equal(g.finalReport,undefined);assert.equal(g.releaseDecision,undefined);assert.equal(g.timeline.at(-1).type,"COMPLETED");
  assert.deepEqual(Object.keys(after).filter(k=>before[k]!==after[k]),["goals/"+g.id+".json"]);
  f.time.set(f.time.get()+300000);
  assert.deepEqual(f.restart().goalReceipt(f.value,f.access),r);assert.deepEqual(commit(f),r);
  assert(f.restart().phaseReceipt(f.phaseInput,f.access));assert(f.restart().completionReceipt(f.value,f.access));
  assert.deepEqual(snapshot(f),after);assert.equal(f.calls(),1);
  const report=f.app.completionStatus(f.value,f.access);assert.equal(report.progress.goalCompleted,true);assert.deepEqual(report.blockers,[]);assert.equal(report.release.authorized,false);
  const view=f.app.goalViews(g.id,{currentAccess:()=>f.access.currentAccess()});assert.equal(view.snapshot.status,"COMPLETED");
  assert.equal(view.finalReport.phasePackages.length,1);assert.equal(view.finalReport.phasePackages[0].decision.status,"GO");assert.equal(view.finalReport.releaseDecision,undefined);
});
for(const [name,options] of [
  ["missing Goal policy",{noPolicy:true}], ["revoked policy",{policy:p=>{p.status="REVOKED";}}],
  ["expired policy",{policy:p=>{p.validUntil="2000-01-01T00:00:00Z";}}],
  ["foreign policy scope",{policy:p=>{p.scope.workspaceId="foreign";}}],
  ["wrong Goal",{policy:p=>{p.goalDigest=d("other");}}], ["wrong plan",{policy:p=>{p.planDigest=d("other");}}],
  ["omitted required Target",{policy:p=>{p.requiredTargets=[];}}], ["omitted phase",{policy:p=>{p.requiredPhases=[];}}],
  ["release authority injection",{policy:p=>{p.releaseAuthorized=true;}}],
  ["uncommitted phase",{pendingPhase:true}],
  ["truncated GA maturity ladder",{beforeSource:g=>{g.plan.decompositionStrategy="ga-maturity-ladder";}}],
  ["GA goal without GA phase",{beforeSource:g=>{g.plan.targets[0].phase="alpha";g.plan.phaseTargets[0].phase="alpha";}}]
]) test(`final Goal refuses ${name} without mutation or execution`,async t=>{
  const f=await fixture(t,options),before=snapshot(f);assert.throws(()=>commit(f));assert.deepEqual(snapshot(f),before);assert.equal(f.calls(),1);
});
test("raw phase GO and raw Goal COMPLETED do not substitute for receipts",async t=>{
  const f=await fixture(t,{pendingPhase:true});f.changeGoal(g=>{g.plan.phaseTargets[0].status="PASSED";g.plan.phaseTargets[0].decision.status="GO";});
  const before=snapshot(f);assert.throws(()=>commit(f));assert.deepEqual(snapshot(f),before);
  f.changeGoal(g=>{g.status="COMPLETED";});assert.throws(()=>f.app.completionStatus(f.value,f.access));assert.throws(()=>commit(f));
});
test("optional unfinished Target is not silently promoted by final Goal completion",async t=>{
  const f=await fixture(t,{beforeSource:g=>{g.plan.targets.push({...g.plan.targets[0],id:"optional",required:false});g.plan.phaseTargets[0].goalTargetIds.push("optional");}});
  const r=commit(f);assert.equal(r.targetReceipts.length,1);assert.equal(f.rawGoal().plan.targets[1].status,"READY");
});
test("missing required Target and declared phase keep final Goal open",async t=>{
  const f=await fixture(t,{beforeSource:g=>{
    g.plan.targets.push({...g.plan.targets[0],id:"missing",phase:"beta"});
    g.plan.phaseTargets.push({...g.plan.phaseTargets[0],id:"phase-beta",phase:"beta",goalTargetIds:["missing"]});
  }}),before=snapshot(f);assert.throws(()=>commit(f));assert.deepEqual(snapshot(f),before);
});
test("current scope, role, cancellation, revocation and retained claim fail closed",async t=>{
  const f=await fixture(t),before=snapshot(f),abort=new AbortController();abort.abort();
  assert.throws(()=>f.app.completeGoal(f.value,{...f.access,signal:abort.signal}));
  assert.throws(()=>f.app.completeGoal(f.value,{currentAccess:()=>({...f.access.currentAccess(),principal:{...f.access.currentAccess().principal,role:"viewer"}})}));
  assert.throws(()=>f.app.completeGoal({...f.value,identity:{...f.identity,projectId:"foreign"}},f.access));
  fs.writeFileSync(f.goalFile+".lock","retained");assert.throws(()=>commit(f));fs.unlinkSync(f.goalFile+".lock");assert.deepEqual(snapshot(f),before);
  fs.unlinkSync(path.join(f.configuration.dataRoot,"governed-evolution-resources-active",f.scope.tenantId,f.scope.workspaceId,`GovernancePack--${f.refs.evidence.id}.json`));
  const revoked=snapshot(f);assert.throws(()=>commit(f));assert.deepEqual(snapshot(f),revoked);
});
for(const moment of ["before-rename","after-rename"]) test(`final Goal ${moment} failure retains reconciliation boundary`,async t=>{
  const f=await fixture(t),before=fs.readFileSync(f.goalFile,"utf8"),rename=fs.renameSync,sync=fs.fsyncSync;let renamed=false;
  fs.renameSync=(...args)=>{if(args[1]===f.goalFile){if(moment==="before-rename")throw Error("injected");renamed=true;}return rename(...args);};
  fs.fsyncSync=(...args)=>{if(renamed&&moment==="after-rename")throw Error("injected");return sync(...args);};
  try{assert.throws(()=>commit(f),/injected/);}finally{fs.renameSync=rename;fs.fsyncSync=sync;}
  if(moment==="before-rename")assert.equal(fs.readFileSync(f.goalFile,"utf8"),before);
  else{assert(fs.existsSync(f.goalFile+".lock"));assert.throws(()=>commit(f),/RECONCILIATION_REQUIRED/);assert.throws(()=>f.app.goalReceipt(f.value,f.access),/RECONCILIATION_REQUIRED/);}
});
test("stale final Goal CAS never overwrites intervening changes",async t=>{
  const f=await fixture(t),write=GoalRecordStore.prototype.write;let injected=false;
  GoalRecordStore.prototype.write=function(next,previous){if(next.semanticFinalGoalCompletion&&!injected){injected=true;write.call(this,{...previous,updatedAt:"2026-09-24T12:00:00Z"},previous);}return write.call(this,next,previous);};
  try{assert.throws(()=>commit(f),/REVISION_CONFLICT/);}finally{GoalRecordStore.prototype.write=write;}
  assert.equal(f.rawGoal().semanticFinalGoalCompletion,undefined);assert.equal(f.rawGoal().status,"RUNNING");
});
test("tampered phase or Goal proof prevents completed readback",async t=>{
  const f=await fixture(t);commit(f);f.changeGoal(g=>{g.semanticPhaseCompletions[0].packageDigest=d("tampered");});
  assert.throws(()=>f.restart().goalReceipt(f.value,f.access));assert.throws(()=>f.app.completionStatus(f.value,f.access));assert.throws(()=>f.app.goalViews(f.identity.goalId,{currentAccess:()=>f.access.currentAccess()}));
});
test("public HTTP final Goal completion exposes receipt and report without release",async t=>{
  const f=await fixture(t),server=createServer({dataRoot:f.configuration.dataRoot,runtimeMode:"debug",llmClient:{},allowSampleData:false,autoRegisterProfileProject:false,
    harnessRegistryConfig:f.configuration.registryConfigPath,semanticCatalogPolicyPath:f.configuration.policyPath,
    tokens:[{name:f.access.currentAccess().principal.id,token:"synthetic-operator",role:"operator",...f.scope}]});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const url=`http://127.0.0.1:${server.address().port}`,headers={authorization:"Bearer synthetic-operator","content-type":"application/json"};
  const call=(op,body=f.value)=>fetch(url+`/api/v1/projects/${f.scope.projectId}/semantic-execution/${op}`,{method:"POST",headers,body:JSON.stringify(body)});
  assert.equal((await call("completeGoal",{...f.value,releaseAuthorized:true})).status,400);
  const response=await call("completeGoal"),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
  assert.deepEqual((await(await call("goalReceipt")).json()).data,body.data);
  const report=await fetch(url+`/api/v1/goals/${f.identity.goalId}/final-report`,{headers});assert.equal(report.status,200);assert.equal((await report.json()).data.releaseDecision,undefined);
});
