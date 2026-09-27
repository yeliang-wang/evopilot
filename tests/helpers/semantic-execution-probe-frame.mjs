// Expectations from a controlled SOURCE fixture, never returned evaluator
// statuses. Native/independent fixture labels are not Host qualification.
export function executionProbeFrame(f,binding,slice,review,failure) {
  const materials=Object.values(f.data.materials),bundle=materials.find(m=>m.kind==='HarnessBundle'),
    profile=materials.find(m=>m.kind==='HarnessProfile'),components=materials.filter(m=>m.kind==='HarnessComponent');
  const unique=values=>[...new Set(values)].sort();
  return {scope:f.scope,identity:f.identity,runId:f.run.id,sourceRequestDigest:f.run.pendingExecution.requestDigest,
    binding,slice,review,expected:{principalId:f.access.principal.id,lifecycleBindingDigest:f.run.pendingExecution.bindingDigest,criteria:f.source.acceptanceCriteria,
      coverage:f.source.acceptanceCriteria.map(c=>({criterionDigest:c.criterionDigest,ruleIds:['units']})).sort((a,b)=>a.criterionDigest.localeCompare(b.criterionDigest)),
      obligations:{validators:unique([...bundle.spec.validators,...profile.spec.acceptance.blockingValidators,...components.flatMap(c=>c.spec.validators.map(v=>v.id))]),
        constraints:unique([...bundle.spec.constraints,...components.flatMap(c=>c.spec.constraints)]),
        evidence:unique([...bundle.spec.evidence,...profile.spec.acceptance.requiredEvidence,...components.flatMap(c=>c.spec.evidence)])},
      business:f.state.outcomePlan.business.map(r=>({id:r.id,status:failure==='businessFail'?'FAILED':'PASSED'})),
      harness:f.state.outcomePlan.harness.map(r=>({id:r.id,status:failure==='harnessFail'&&r.obligation.kind==='validator'?'FAILED':'PASSED'})),
      agentStatus:'SUCCEEDED'}};
}
