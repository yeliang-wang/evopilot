import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {semanticPhaseFixture} from "../helpers/semantic-phase-fixture.mjs";
import {createSemanticRuntimeSourceReader,semanticTargetDefinition} from "../../packages/server/dist/application/semantic-runtime-sources.js";
import {GoalRecordStore} from "../../packages/server/dist/storage/goal-record-store.js";
import {advanceSemanticTargets} from "../../packages/server/dist/application/semantic-target-progression.js";

// Synthetic local execution/collector fixtures exercise the real owner CAS.
// They do not qualify a Host or create real business acceptance evidence.
function dependentPlan(g) {
  const first=g.plan.targets[0];
  g.plan.targets.push({...structuredClone(first),id:"next-target",status:"PENDING",nextAction:"advance-target",dependencyIds:[first.id]},
    {...structuredClone(first),id:"later-target",status:"PENDING",nextAction:"advance-target",dependencyIds:["next-target"]});
  g.plan.phaseTargets[0].goalTargetIds=g.plan.targets.map(target=>target.id);
  g.plan.targetCount=3;g.plan.requiredTargetCount=3;
}
const fixture=t=>semanticPhaseFixture(t,{pendingTarget:true,beforeSource:dependentPlan});
const bytes=f=>fs.readFileSync(f.goalFile,"utf8");
const next=f=>f.rawGoal().plan.targets.find(target=>target.id==="next-target");

test("verified semantic Target completion promotes only the fulfilled immediate dependency in the same Goal CAS",async t=>{
  const f=await fixture(t),before=f.rawGoal(),reader=createSemanticRuntimeSourceReader(f.configuration.dataRoot);
  const identity={...f.identity,targetId:"next-target"};
  assert.throws(()=>reader.read(identity,f.access.currentAccess().principal),{code:"PERMISSION_DENIED"});
  const receipt=await f.app.completeTarget(f.value,f.access),after=f.rawGoal();
  assert.equal(after.plan.targets[0].status,"DONE");assert.equal(next(f).status,"READY");
  assert.equal(next(f).nextAction,"start-target");assert.equal(after.plan.targets[2].status,"PENDING");
  assert.equal(after.semanticTargetCompletions.length,1);assert.equal(after.timeline.length,1);
  assert.deepEqual(after.plan.targets.map(semanticTargetDefinition),before.plan.targets.map(semanticTargetDefinition));
  assert.equal(reader.read(identity,f.access.currentAccess().principal).credentialReadinessVerified,false);
  const committed=bytes(f);
  assert.deepEqual(await f.restart().completeTarget(f.value,f.access),receipt);
  assert.equal(bytes(f),committed);assert.equal(f.calls(),1);
});

test("revoked completion permission never changes dependent readiness or persists a receipt",async t=>{
  const f=await fixture(t),before=bytes(f);
  const access={currentAccess:()=>({...f.access.currentAccess(),principal:{...f.access.currentAccess().principal,role:"viewer"}})};
  await assert.rejects(()=>f.app.completeTarget(f.value,access),{code:"PERMISSION_DENIED"});
  assert.equal(bytes(f),before);assert.equal(next(f).status,"PENDING");assert.equal(f.rawGoal().semanticTargetCompletions,undefined);
});

test("stale semantic completion CAS preserves the intervening owner write and leaves dependents pending",async t=>{
  const f=await fixture(t),write=GoalRecordStore.prototype.write;let injected=false;
  GoalRecordStore.prototype.write=function(value,previous){
    if(value.semanticTargetCompletions&&!injected){injected=true;write.call(this,{...previous,updatedAt:"2026-10-03T00:00:00Z"},previous);}
    return write.call(this,value,previous);
  };
  try{await assert.rejects(()=>f.app.completeTarget(f.value,f.access),/REVISION_CONFLICT/);}
  finally{GoalRecordStore.prototype.write=write;}
  assert(injected);assert.equal(next(f).status,"PENDING");assert.equal(f.rawGoal().semanticTargetCompletions,undefined);
  assert.equal(f.rawGoal().updatedAt,"2026-10-03T00:00:00Z");assert.equal(f.calls(),1);
});

for(const moment of ["before","after"])test(`semantic progression ${moment}-rename failure retains atomic progress and reconciliation`,async t=>{
  const f=await fixture(t),before=bytes(f),rename=fs.renameSync,sync=fs.fsyncSync;let renamed=false;
  fs.renameSync=(...args)=>{if(args[1]===f.goalFile){if(moment==="before")throw Error("PROGRESSION_BEFORE_RENAME");renamed=true;}return rename(...args);};
  fs.fsyncSync=(...args)=>{if(renamed&&moment==="after")throw Error("PROGRESSION_AFTER_RENAME");return sync(...args);};
  try{await assert.rejects(()=>f.app.completeTarget(f.value,f.access),new RegExp(`PROGRESSION_${moment.toUpperCase()}_RENAME`));}
  finally{fs.renameSync=rename;fs.fsyncSync=sync;}
  if(moment==="before"){
    assert.equal(bytes(f),before);assert.equal(next(f).status,"PENDING");assert(!fs.existsSync(f.goalFile+".lock"));
  }else{
    assert.equal(f.rawGoal().plan.targets[0].status,"DONE");assert.equal(next(f).status,"READY");
    assert.equal(f.rawGoal().semanticTargetCompletions.length,1);assert(fs.existsSync(f.goalFile+".lock"));
    await assert.rejects(()=>f.app.completeTarget(f.value,f.access),/RECONCILIATION_REQUIRED/);
    assert.throws(()=>f.app.completionReceipt(f.value,f.access),/RECONCILIATION_REQUIRED/);
  }
  assert.equal(f.calls(),1);
});

// These pure graph tests deliberately use synthetic owner-verifier callbacks.
// Real receipt/permission/storage verification is exercised separately above.
function graph() {
  const target=(id,status,dependencyIds=[])=>({id,goalId:"goal",projectId:"project",releaseTargetId:"release",status,
    nextAction:status==="DONE"?"done":"advance-target",dependencyIds,evidence:[],updatedAt:"before"});
  return {id:"goal",projectId:"project",releaseTargetId:"release",status:"RUNNING",
    semanticExecutionOwners:[{targetId:"first",runId:"synthetic-run"}],
    semanticTargetCompletions:[{identity:{targetId:"first"},runId:"synthetic-run",receiptDigest:"synthetic-owner-proof"}],
    plan:{status:"APPROVED",targets:[target("first","DONE"),target("next","PENDING",["first"]),target("later","PENDING",["next"])],phaseTargets:[]}};
}
const verified={targetReceipt:r=>r,phaseReceipt:r=>r};

test("pure progression derives immediate readiness without mutating input or cascading through unfinished targets",()=>{
  const g=graph(),before=structuredClone(g),next=advanceSemanticTargets(g,verified,"after");
  assert.deepEqual(g,before);assert.equal(next.plan.targets[1].status,"READY");assert.equal(next.plan.targets[1].updatedAt,"after");
  assert.equal(next.plan.targets[2].status,"PENDING");assert.equal(next.plan.targets[0],g.plan.targets[0]);
});

for(const [name,mutate] of [
  ["missing dependency",g=>{g.plan.targets[1].dependencyIds=["absent"];}],
  ["unfinished dependency",g=>{g.plan.targets[0].status="RUNNING";}],
  ["raw DONE without owner receipt",g=>{g.semanticTargetCompletions=[];}],
  ["dependency cycle",g=>{g.plan.targets[1].dependencyIds=["later"];}]
])test(`pure progression leaves ${name} pending without asking a verifier to invent evidence`,()=>{
  const g=graph();mutate(g);const before=structuredClone(g);
  const reject={targetReceipt:()=>{throw Error("verifier must not be called");},phaseReceipt:()=>{throw Error("verifier must not be called");}};
  assert.equal(advanceSemanticTargets(g,reject,"after"),g);assert.deepEqual(g,before);
});

for(const [name,verify] of [
  ["unverified stored Target receipt",()=>undefined],
  ["changed verified Target receipt",r=>({...r,receiptDigest:"another-proof"})],
  ["revoked owner proof",()=>{throw Error("REVOKED_PROOF");}]
])test(`pure progression rejects ${name} without partial mutation`,()=>{
  const g=graph(),before=structuredClone(g);
  assert.throws(()=>advanceSemanticTargets(g,{...verified,targetReceipt:verify},"after"));assert.deepEqual(g,before);
});

test("pure next-phase progression requires a matching verified phase receipt in addition to raw GO",()=>{
  const g=graph();g.plan.targets[0].phase="alpha";g.plan.targets[1].phase="beta";g.plan.targets[2].phase="beta";
  g.plan.phaseTargets=[{id:"alpha",goalId:"goal",phase:"alpha",goalTargetIds:["first"],status:"PASSED",decision:{status:"GO"}},
    {id:"beta",goalId:"goal",phase:"beta",goalTargetIds:["next","later"],dependencyPhase:"alpha",status:"PENDING",decision:{status:"PENDING"}}];
  assert.equal(advanceSemanticTargets(g,verified,"after"),g,"raw phase GO is insufficient");
  g.semanticPhaseCompletions=[{phaseTargetId:"alpha",receiptDigest:"synthetic-phase-proof"}];
  for(const phaseReceipt of [()=>undefined,r=>({...r,receiptDigest:"forged"})]){
    const before=structuredClone(g);assert.throws(()=>advanceSemanticTargets(g,{...verified,phaseReceipt},"after"));assert.deepEqual(g,before);
  }
  const result=advanceSemanticTargets(g,verified,"after");assert.equal(result.plan.targets[1].status,"READY");assert.equal(result.plan.targets[2].status,"PENDING");
});

for(const [name,mutate] of [
  ["blocked Target",g=>{g.plan.targets[1].blocker="requires owner review";}],
  ["loop-owned Target",g=>{g.plan.targets[1].loopId="existing-loop";}],
  ["already semantic-owned Target",g=>{g.semanticExecutionOwners.push({targetId:"next",runId:"pending-run"});}],
  ["manual next action",g=>{g.plan.targets[1].nextAction="review-target";}],
  ["non-PENDING status",g=>{g.plan.targets[1].status="BLOCKED";}],
  ["legacy nonsemantic Goal",g=>{delete g.semanticExecutionOwners;}],
  ["unapproved plan",g=>{g.plan.status="DRAFT";}],
  ["completed Goal",g=>{g.status="COMPLETED";}]
])test(`pure progression preserves ${name}`,()=>{
  const g=graph();mutate(g);const before=structuredClone(g);
  assert.equal(advanceSemanticTargets(g,{targetReceipt:()=>{throw Error("unexpected verification");},phaseReceipt:()=>{throw Error("unexpected verification");}},"after"),g);
  assert.deepEqual(g,before);
});
