import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {execFile} from "node:child_process";
import {createServer} from "../../packages/server/dist/index.js";
import {nextPhase,phaseNames,fourPhaseDefinition,twelveTargetDefinition} from "../helpers/semantic-four-phase-fixture.mjs";
import {createSemanticRuntimeSourceReader} from "../../packages/server/dist/application/semantic-runtime-sources.js";

test("one persisted Goal executes alpha through GA, restarts, closes and preserves prior receipts",async t=>{
  const phases=[],targets=[],executions=[];let previous;
  for (const name of phaseNames) {
    const f=await nextPhase(t,previous,name,{processUsage:{amount:0.25,currency:"USD",inputTokens:3,outputTokens:2}});executions.push(f);if(previous)assert.equal(f.configuration.dataRoot,previous.configuration.dataRoot);
    assert.equal(f.rawGoal().status,"RUNNING");assert.equal(f.calls(),1);
    assert.throws(()=>f.app.completeGoal(f.value,f.access));
    const target=f.app.completionReceipt(f.value,f.access),phase=f.app.completePhase(f.phaseInput,f.access);
    assert.equal(target.predecessorPhaseReceiptDigest,phases.at(-1)?.receiptDigest);
    assert.equal(phase.predecessorReceiptDigest,phases.at(-1)?.receiptDigest);
    phases.push(phase);targets.push(target);
    for(let i=0;i<executions.length;i++) {
      const e=executions[i];assert.deepEqual(e.restart().completionReceipt(e.value,e.access),targets[i]);
      assert.deepEqual(e.restart().phaseReceipt(e.phaseInput,e.access),phases[i]);
    }
    previous=f;
  }
  const f=previous,receipt=f.app.completeGoal(f.value,f.access),before=fs.readFileSync(f.goalFile,"utf8");
  assert.equal(receipt.phaseReceipts.length,4);assert.equal(receipt.targetReceipts.length,4);assert.equal(receipt.releaseAuthorized,false);
  assert.deepEqual(f.restart().goalReceipt(f.value,f.access),receipt);assert.deepEqual(f.app.completeGoal(f.value,f.access),receipt);
  assert.equal(fs.readFileSync(f.goalFile,"utf8"),before);
  const view=f.app.goalViews(f.identity.goalId,{currentAccess:()=>f.access.currentAccess()});
  assert.equal(view.snapshot.status,"COMPLETED");assert.equal(view.finalReport.phasePackages.length,4);
  assert.equal(view.runStatus.llmUsageStatus,"VERIFIED_COMPLETED_TARGETS");assert.equal(view.runStatus.llmUsage.totals.totalTokens,20);
  assert.equal(view.runStatus.llmUsage.totals.reportedCost.amount,1);assert.equal(view.runStatus.llmUsage.executions.length,4);
  assert.equal(view.runStatus.dispatchUsage.status,"VERIFIED_KNOWN_DISPATCHES");
  assert.equal(view.runStatus.dispatchUsage.totals.totalTokens,20);assert.equal(view.runStatus.dispatchUsage.entries.length,4);
  assert.deepEqual(f.restart().goalViews(f.identity.goalId,{currentAccess:()=>f.access.currentAccess()}).runStatus.llmUsage,view.runStatus.llmUsage);
  assert(view.snapshot.phases.every(p=>p.decision.status==="GO"));assert.equal(view.finalReport.releaseDecision,undefined);
  assert.equal(executions.reduce((n,f)=>n+f.calls(),0),4);
  assert.equal(new Set(targets.map(r=>r.identity.harnessBindingDigest)).size,4);
  // Fresh HTTP server reads the same persisted Goal; no test-authored success
  // records or copied phase receipts are installed between phases or restarts.
  const server=createServer({dataRoot:f.configuration.dataRoot,runtimeMode:"debug",llmClient:{},allowSampleData:false,autoRegisterProfileProject:false,
    harnessRegistryConfig:f.configuration.registryConfigPath,semanticCatalogPolicyPath:f.configuration.policyPath,
    tokens:[{name:f.access.currentAccess().principal.id,token:"synthetic-operator",role:"operator",...f.scope}]});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const url=`http://127.0.0.1:${server.address().port}`,headers={authorization:"Bearer synthetic-operator"};
  for(const suffix of ["","/snapshot","/final-report","/run-status"]) {
    const r=await fetch(url+`/api/v1/goals/${f.identity.goalId}`+suffix,{headers});assert.equal(r.status,200);
    const body=(await r.json()).data;assert.equal(body.status,"COMPLETED");assert.equal(body.releaseDecision,undefined);
  }
  const graph=(await(await fetch(url+`/api/v1/goals/${f.identity.goalId}/graph`,{headers})).json()).data;
  assert.equal(graph.edges.length,3);assert(graph.nodes.every(n=>n.status==="DONE"));
  const list=(await(await fetch(url+"/api/v1/goals",{headers})).json()).data;assert.equal(list.find(g=>g.id===f.identity.goalId).status,"COMPLETED");
  const cli=await new Promise(resolve=>execFile(process.execPath,[path.resolve("packages/cli/dist/index.js"),"goal","graph",f.identity.goalId,
    "--server",url,"--config",path.join(f.root,"unused-cli-config.json"),"--json"],
    {timeout:30000,env:{PATH:process.env.PATH,EVOPILOT_API_TOKEN:"synthetic-operator",EVOPILOT_LOG_LEVEL:"error"}},
    (error,stdout,stderr)=>resolve({code:error?.code??0,stdout,stderr})));
  assert.equal(cli.code,0,cli.stderr);assert(JSON.parse(cli.stdout).nodes.every(n=>n.status==="DONE"));
  assert.equal(fs.readFileSync(f.goalFile,"utf8"),before);
});
test("raw predecessor GO cannot start the next phase or generate a Goal receipt",async t=>{
  const first=await nextPhase(t,undefined,"alpha");
  first.changeGoal(g=>{g.plan.phaseTargets[0].status="PASSED";g.plan.phaseTargets[0].decision.status="GO";});
  await assert.rejects(nextPhase(t,first,"beta"));
  assert.equal(first.rawGoal().semanticTargetCompletions.length,1);assert.equal(first.rawGoal().semanticFinalGoalCompletion,undefined);
});

test("twelve default dependent Targets advance only through verified Target and phase commits",async t=>{
  const standards=Object.fromEntries(phaseNames.map(name=>[name,
    JSON.parse(fs.readFileSync(new URL(`../../standards/maturity/evopilot-default/v1/${name}.json`,import.meta.url)))]));
  const fixtureKinds=["domain-checks","target-evidence-package","phase-package","goal-completion-report","route-table","policy-matrix",
    "plugin-report","load-summary","source-snapshot","command-inventory","validation-command-log","validation-result"];
  let previous;
  const executions=[],targetReceipts=[],phaseReceipts=[];
  for(const [phaseIndex,name] of phaseNames.entries()) {
    const standard=standards[name],phaseKinds=[...new Set([...standard.requiredEvidence,...standard.packageOutputs])];
    for(const number of [1,2,3]) {
      const f=await nextPhase(t,previous,name,{
        targetId:`target-${name}-${number}`,
        collectorKinds:[...new Set([...fixtureKinds,...phaseKinds])],
        additionalEvidenceKinds:phaseKinds.filter(kind=>!fixtureKinds.includes(kind)),
        beforeSource:g=>{
          twelveTargetDefinition(g);
          for(const p of g.plan.phaseTargets)for(const key of ["acceptanceCriteria","requiredEvidence","reviewCapabilities","packageOutputs"])
            p[key]=[...standards[p.phase][key]];
          assert.equal(g.plan.targets.filter(target=>target.status==="READY").length,1);
          assert.equal(g.plan.targets.filter(target=>target.status==="PENDING").length,11);
        }
      });
      executions.push(f);targetReceipts.push(f.app.completionReceipt(f.value,f.access));
      const g=f.rawGoal(),current=g.plan.targets.find(target=>target.id===f.identity.targetId);
      assert.equal(current.status,"DONE");assert.equal(f.calls(),1);assert.equal(g.status,"RUNNING");
      assert.equal(g.semanticTargetCompletions.length,targetReceipts.length);
      assert.equal(g.semanticPhaseCompletions?.length??0,phaseReceipts.length);
      assert.equal(g.semanticFinalGoalCompletion,undefined);assert.equal(g.releaseDecision,undefined);
      if(number<3) {
        const next=g.plan.targets.find(target=>target.id===`target-${name}-${number+1}`);
        assert.equal(next.status,"READY");assert.equal(next.nextAction,"start-target");
        assert.throws(()=>f.app.completePhase(f.phaseInput,f.access));
      }
      const later=g.plan.targets.filter(target=>phaseNames.indexOf(target.phase)>phaseIndex);
      assert(later.every(target=>target.status==="PENDING"),"Target completion cannot bypass the predecessor phase receipt");
      assert.deepEqual(f.restart().completionReceipt(f.value,f.access),targetReceipts.at(-1));
      previous=f;
    }
    const f=previous,nextId=phaseIndex<3?`target-${phaseNames[phaseIndex+1]}-1`:undefined;
    const reader=createSemanticRuntimeSourceReader(f.configuration.dataRoot);
    if(nextId)assert.throws(()=>reader.read({...f.identity,targetId:nextId},f.access.currentAccess().principal),{code:"PERMISSION_DENIED"});
    const phase=f.app.completePhase(f.phaseInput,f.access);phaseReceipts.push(phase);
    assert.equal(phase.targetReceipts.length,3);
    const g=f.rawGoal();
    if(nextId) {
      assert.equal(g.plan.targets.find(target=>target.id===nextId).status,"READY");
      assert.equal(g.plan.targets.find(target=>target.id===`target-${phaseNames[phaseIndex+1]}-2`).status,"PENDING");
      assert.equal(reader.read({...f.identity,targetId:nextId},f.access.currentAccess().principal).credentialReadinessVerified,false);
    }
    const bytes=fs.readFileSync(f.goalFile,"utf8");
    assert.deepEqual(f.restart().phaseReceipt(f.phaseInput,f.access),phase);
    assert.deepEqual(f.app.completePhase(f.phaseInput,f.access),phase);
    assert.equal(fs.readFileSync(f.goalFile,"utf8"),bytes,"historical phase readback does not promote or rewrite targets");
  }
  const receipt=previous.app.completeGoal(previous.value,previous.access);
  assert.equal(receipt.targetReceipts.length,12);assert.equal(receipt.phaseReceipts.length,4);
  assert.equal(receipt.goalCompleted,true);assert.equal(receipt.releaseAuthorized,false);
  assert(previous.rawGoal().plan.targets.every(target=>target.status==="DONE"));
  assert.equal(executions.reduce((n,f)=>n+f.calls(),0),12);
  assert.deepEqual(previous.restart().goalReceipt(previous.value,previous.access),receipt);
  for(let i=0;i<executions.length;i++)assert.deepEqual(executions[i].restart().completionReceipt(executions[i].value,executions[i].access),targetReceipts[i]);
});

// These are synthetic observations, but the phase obligations are the exact
// shipped baseline. This guards capacity and completion, not real business truth.
for (const omitGaOutput of [false, true]) test(
  omitGaOutput ? "default GA cannot close with a missing required output" : "all default maturity obligations reach guarded four-phase Goal completion",
  async t => {
    const standards = Object.fromEntries(phaseNames.map(name => [name,
      JSON.parse(fs.readFileSync(new URL("../../standards/maturity/evopilot-default/v1/" + name + ".json", import.meta.url)))
    ]));
    const fixtureKinds = ["domain-checks", "target-evidence-package", "phase-package", "goal-completion-report", "route-table", "policy-matrix",
      "plugin-report", "load-summary", "source-snapshot", "command-inventory", "validation-command-log", "validation-result"];
    let previous;
    for (const name of phaseNames) {
      const standard = standards[name], phaseKinds = [...new Set([...standard.requiredEvidence, ...standard.packageOutputs])];
      const f = await nextPhase(t, previous, name, {
        collectorKinds: [...new Set([...fixtureKinds, ...phaseKinds])],
        additionalEvidenceKinds: phaseKinds.filter(kind => !fixtureKinds.includes(kind)),
        beforeSource: g => {
          fourPhaseDefinition(g);
          for (const p of g.plan.phaseTargets) {
            const s = standards[p.phase];
            for (const key of ["acceptanceCriteria", "requiredEvidence", "reviewCapabilities", "packageOutputs"]) p[key] = [...s[key]];
          }
        },
        ...(omitGaOutput && name === "ga" ? {package: p => {p.outputs = p.outputs.filter(x => x.kind !== "security-governance-report");}} : {})
      });
      const phase = f.rawGoal().plan.phaseTargets.find(p => p.phase === name);
      for (const key of ["acceptanceCriteria", "requiredEvidence", "reviewCapabilities", "packageOutputs"]) assert.deepEqual(phase[key], standard[key]);
      assert.equal(f.calls(), 1);
      if (omitGaOutput && name === "ga") {
        assert.throws(() => f.app.completePhase(f.phaseInput, f.access));
        assert.throws(() => f.app.completeGoal(f.value, f.access));
        assert.equal(f.rawGoal().status, "RUNNING");
        assert.equal(f.rawGoal().semanticFinalGoalCompletion, undefined);
        return;
      }
      f.app.completePhase(f.phaseInput, f.access); previous = f;
    }
    const receipt = previous.app.completeGoal(previous.value, previous.access);
    assert.equal(receipt.targetReceipts.length, 4); assert.equal(receipt.phaseReceipts.length, 4);
    assert.equal(receipt.goalCompleted, true); assert.equal(receipt.releaseAuthorized, false);
    assert.deepEqual(previous.restart().goalReceipt(previous.value, previous.access), receipt);
    assert.equal(previous.rawGoal().status, "COMPLETED");
  }
);
