import test from "node:test";
import assert from "node:assert/strict";
import {semanticStageUsage,aggregateSemanticUsage} from "../../packages/server/dist/application/semantic-execution-usage.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

function fixture(id="one",coverage="COMPLETE",inputTokens=3,outputTokens=2) {
  const binding={agentRuntime:{provider:"synthetic",model:"model",profileDigest:d("profile")},host:{id:"synthetic-host"},bindingDigest:d(id+"binding")};
  const material={profileDigest:d("profile"),requestDigest:d(id),route:"synthetic/model",origin:"NATIVE_PROCESS_RUNNER",
    cost:{amount:0.25,currency:"USD",inputTokens,outputTokens},...(coverage?{usageCoverage:coverage}:{})};
  const receiptDigest=d(material),dispatch={requestId:id,requestDigest:d(id),sourceRequestDigest:d(id+"source"),adapterProfileDigest:d("profile"),
    processObservation:{receiptDigest,material},result:{requestId:id,requestDigest:d(id),receiptDigest,cost:material.cost}};
  return {binding,dispatch,usage:()=>semanticStageUsage(dispatch,binding)};
}
const receipt=(targetId,usage)=>({targetId,receiptDigest:d(targetId),stages:usage.map((u,i)=>({stageId:"stage-"+i,usage:u}))});
test("verified stage usage preserves exact route and digest-bound provenance",()=>{
  const f=fixture(),u=f.usage();assert.equal(u.totalTokens,5);assert.equal(u.provider,"synthetic");assert.equal(u.requestDigest,d("one"));assert(Object.isFrozen(u));
});
test("all completed Targets aggregate once without implying all dispatch costs or billing",()=>{
  const result=aggregateSemanticUsage(["a","b"],[receipt("a",[fixture("1").usage(),fixture("2").usage()]),receipt("b",[fixture("3").usage()])]);
  assert.equal(result.status,"VERIFIED_COMPLETED_TARGETS");assert.equal(result.totals.totalTokens,15);
  assert.equal(result.totals.reportedCost.amount,0.75);assert.equal(result.routes.length,1);assert.equal(result.routes[0].executions,3);
  assert.equal(result.billingReconciled,false);assert.equal(result.grantsAuthority,false);assert(result.coverage.excludes.includes("PENDING_FAILED_UNCERTAIN_DISPATCHES"));
});
test("unknown or legacy usage remains null, while explicit measured zero is zero",()=>{
  for(const coverage of [undefined,"UNAVAILABLE","PARTIAL"]){const f=fixture("1",coverage??null),u=f.usage();assert.equal(u.totalTokens,null);
    const result=aggregateSemanticUsage(["a"],[receipt("a",[u])]);assert.equal(result.status,"UNAVAILABLE");assert.equal(result.totals,null);}
  const f=fixture("zero","COMPLETE",0,0);f.dispatch.processObservation.material.cost.amount=0;
  f.dispatch.processObservation.receiptDigest=d(f.dispatch.processObservation.material);f.dispatch.result.receiptDigest=f.dispatch.processObservation.receiptDigest;
  assert.equal(aggregateSemanticUsage(["a"],[receipt("a",[f.usage()])]).totals.totalTokens,0);
});
test("pending Targets and incomplete stage telemetry make known subtotals partial",()=>{
  const r=aggregateSemanticUsage(["a","b"],[receipt("a",[fixture().usage(),fixture("missing","UNAVAILABLE").usage()])]);
  assert.equal(r.status,"PARTIAL");assert.equal(r.totals.totalTokens,5);assert.deepEqual(r.coverage.unverifiedTargetIds,["b"]);
  assert.equal(r.coverage.measuredExecutions,1);assert.equal(r.coverage.verifiedExecutions,2);
  assert.equal(aggregateSemanticUsage(["a"],[]).totals,null);
});
test("different provider/model routes are not collapsed",()=>{
  const a=fixture("a").usage(),b={...fixture("b").usage(),model:"other"};
  assert.equal(aggregateSemanticUsage(["a"],[receipt("a",[a,b])]).routes.length,2);
});
test("duplicate requests or Target receipts fail rather than double count",()=>{
  const u=fixture().usage();assert.throws(()=>aggregateSemanticUsage(["a"],[receipt("a",[u,u])]),{code:"IDENTITY_CONFLICT"});
  assert.throws(()=>aggregateSemanticUsage(["a","b"],[receipt("a",[u]),receipt("a",[u])]));
});
for(const [name,mutate] of [
  ["route mismatch",f=>{f.binding.agentRuntime.model="foreign";}],
  ["profile mismatch",f=>{f.binding.agentRuntime.profileDigest=d("foreign");}],
  ["unbound cost",f=>{f.dispatch.result.cost={...f.dispatch.result.cost,inputTokens:9};}],
  ["invalid coverage",f=>{f.dispatch.processObservation.material.usageCoverage="TRUST_ME";}],
  ["negative cost",f=>{f.dispatch.processObservation.material.cost.amount=-1;}],
  ["fractional tokens",f=>{f.dispatch.processObservation.material.cost.inputTokens=0.5;}]
]) test(`usage rejects ${name}`,()=>{const f=fixture();mutate(f);assert.throws(()=>f.usage());});
test("per-execution and aggregate token overflow fail closed",()=>{
  assert.throws(()=>fixture("large","COMPLETE",Number.MAX_SAFE_INTEGER,1).usage(),{code:"MATERIAL_LIMIT"});
  assert.throws(()=>aggregateSemanticUsage(["a"],[receipt("a",[fixture("1","COMPLETE",Number.MAX_SAFE_INTEGER,0).usage(),fixture("2").usage()])]),{code:"MATERIAL_LIMIT"});
});

function tokenFixture(id="tokens", inputTokens=31, outputTokens=7) {
  const f=fixture(id);
  const material=f.dispatch.processObservation.material;
  delete material.cost; delete material.usageCoverage; delete f.dispatch.result.cost;
  material.usage={inputTokens,outputTokens,cachedInputTokens:inputTokens===null?null:2,tokenCoverage:inputTokens===null?"UNAVAILABLE":"COMPLETE"};
  f.dispatch.processObservation.schema="evopilot-agent-process-observation/v2";
  f.seal=()=>{f.dispatch.processObservation.receiptDigest=d(material);f.dispatch.result.receiptDigest=d(material);};
  f.seal();return f;
}
test("token-only observations preserve exact known tokens without money or price configuration",()=>{
  const f=tokenFixture(),u=f.usage();
  assert.equal(u.inputTokens,31);assert.equal(u.outputTokens,7);assert.equal(u.totalTokens,38);
  assert.equal(Object.hasOwn(u,"reportedCost"),false);
  const r=aggregateSemanticUsage(["a"],[receipt("a",[u])]);
  assert.equal(r.status,"VERIFIED_COMPLETED_TARGETS");
  assert.deepEqual(r.totals,{inputTokens:31,outputTokens:7,totalTokens:38});
  assert.equal(Object.hasOwn(r.routes[0],"reportedCost"),false);
});
test("mixed legacy and token-only observations never invent a monetary total",()=>{
  const r=aggregateSemanticUsage(["a"],[receipt("a",[fixture("legacy").usage(),tokenFixture().usage()])]);
  assert.equal(r.totals.totalTokens,43);assert.equal(r.status,"VERIFIED_COMPLETED_TARGETS");
  assert.equal(Object.hasOwn(r.totals,"reportedCost"),false);
  assert.equal(Object.hasOwn(r.routes[0],"reportedCost"),false);
});
test("unreported tokens stay unavailable while measured zero remains zero",()=>{
  const missing=tokenFixture("missing",null,null);
  const u=missing.usage();assert.equal(u.totalTokens,null);
  const zero=tokenFixture("zero",0,0);zero.dispatch.processObservation.material.usage.cachedInputTokens=0;zero.seal();
  const r=aggregateSemanticUsage(["a"],[receipt("a",[u,zero.usage()])]);
  assert.equal(r.status,"PARTIAL");assert.deepEqual(r.totals,{inputTokens:0,outputTokens:0,totalTokens:0});
});
for(const [name,mutate,reseal=true] of [
  ["negative tokens",f=>f.dispatch.processObservation.material.usage.inputTokens=-1],
  ["fractional tokens",f=>f.dispatch.processObservation.material.usage.outputTokens=.1],
  ["fabricated result money",f=>f.dispatch.result.cost={amount:0,currency:"USD",inputTokens:31,outputTokens:7}],
  ["tampered digest",f=>f.dispatch.processObservation.material.usage.inputTokens=30,false],
  ["foreign route",f=>f.dispatch.processObservation.material.route="other/model"],
  ["partial null",f=>f.dispatch.processObservation.material.usage.inputTokens=null],
  ["token overflow",f=>f.dispatch.processObservation.material.usage.inputTokens=Number.MAX_SAFE_INTEGER]
]) test(`token-only usage rejects ${name}`,()=>{const f=tokenFixture();mutate(f);if(reseal)f.seal();assert.throws(()=>f.usage());});
