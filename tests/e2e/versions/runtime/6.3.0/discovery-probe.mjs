import assert from 'node:assert/strict';
import {exactKeys,isDigest,isId,probeSession} from '../../probe-session.mjs';

/** RC01-M1 supporting black-box assertions against an independently prepared,
 * compatible published pair. Only public read-only CLI calls; no private owner
 * imports, approvals, fixture creation, inferred selection or automatic repair. */
export async function runRuntimeDiscoveryProbe({invoke,selection,scope,signal,timeoutMs}) {
  exactKeys(selection,['projectId','catalogId','artifactSetDigest','bundleDigest']);
  exactKeys(scope,['tenantId','workspaceId','projectId']);
  assert.ok([selection.projectId,selection.catalogId,...Object.values(scope)].every(isId),'PROBE_ID_INVALID');
  assert.equal(selection.projectId,scope.projectId);assert.ok([selection.artifactSetDigest,selection.bundleDigest].every(isDigest));
  const chosen=structuredClone(selection),expectedScope=structuredClone(scope);
  return probeSession({product:'runtime',version:'6.3.0',invoke,signal,timeoutMs},async request=>{
    const call=async (operation,pair=false)=>{
      const args=['project','semantic',operation,chosen.projectId];
      if(operation!=='capabilities')args.push('--catalog',chosen.catalogId);
      if(pair)args.push('--artifact-set-digest',chosen.artifactSetDigest,'--bundle-digest',chosen.bundleDigest);
      args.push('--json');const r=await request(args);assert.equal(r.exitCode,0,'PROBE_COMMAND_FAILED');
      assert.equal(r.json.projectId,chosen.projectId,'PROBE_PROJECT_DRIFT');return r.json;
    };
    const caps=await call('capabilities');
    assert.equal(caps.schema,'evopilot-project-semantic-capabilities/v1');
    assert.equal(caps.authority,'RUNTIME_CURRENT_SCOPED_PRINCIPAL');
    assert.equal(caps.executionAvailable,false);assert.equal(caps.completionAvailable,false);
    for(const op of ['inspect','compatibility','onboarding','gap'])assert.ok(caps.operations.includes(op),'PROBE_CAPABILITY_MISSING');
    const discovery=await call('inspect');
    assert.equal(discovery.schema,'evopilot-project-semantic-discovery/v1');assert.equal(discovery.status,'VERIFIED_DISCOVERY_ONLY');
    assert.equal(discovery.catalogId,chosen.catalogId);assert.equal(discovery.bindingCreated,false);assert.equal(discovery.eligibleForExecution,false);
    const pins=['projectRevisionDigest','registryDigest','policyDigest','pointerDigest','generationDigest'];
    for(const field of [...pins,'receiptDigest','discoveryDigest'])assert.ok(isDigest(discovery[field]),'PROBE_DISCOVERY_PIN_MISSING');
    const matches=discovery.sets.filter(s=>s.artifactSetDigest===chosen.artifactSetDigest && s.harnessBundles.some(b=>b.digest===chosen.bundleDigest));
    assert.equal(matches.length,1,'PROBE_PUBLISHED_PAIR_MISSING_OR_AMBIGUOUS');assert.deepEqual(matches[0].scope,expectedScope);
    for(const set of discovery.sets)assert.deepEqual(set.scope,expectedScope,'PROBE_FOREIGN_SCOPE_EXPOSED');
    const compatibility=await call('compatibility',true);
    assert.equal(compatibility.schema,'evopilot-project-semantic-compatibility-inspect/v1');
    for(const field of pins)assert.equal(compatibility[field],discovery[field],'PROBE_BINDING_DRIFT');
    assert.equal(compatibility.bindingCreated,false);assert.equal(compatibility.eligibleForExecution,false);
    assert.equal(compatibility.report.status,'COMPATIBLE');assert.deepEqual(compatibility.report.scope,expectedScope);
    assert.equal(compatibility.report.artifactSetDigest,chosen.artifactSetDigest);assert.ok(isDigest(compatibility.report.compatibilityDigest));
    assert.equal(compatibility.report.bundleRef.digest,chosen.bundleDigest,'PROBE_BUNDLE_DRIFT');
    const onboarding=await call('onboarding');
    assert.equal(onboarding.schema,'evopilot-project-semantic-onboarding/v1');assert.equal(onboarding.projectRevisionDigest,discovery.projectRevisionDigest);
    assert.equal(onboarding.catalogId,chosen.catalogId);assert.ok(['REVIEW_REQUIRED','SELECTION_REQUIRED'].includes(onboarding.status));
    assert.equal(onboarding.selectedCandidate,null);assert.equal(onboarding.businessField,null);assert.equal(onboarding.productType,null);
    assert.equal(onboarding.bindingCreated,false);assert.equal(onboarding.eligibleForExecution,false);assert.equal(onboarding.grantsExecutionAuthority,false);
    assert.equal(onboarding.requiresSeparateBindingApproval,true);assert.ok(isDigest(onboarding.onboardingDigest));
    const gap=await call('gap',true);
    assert.equal(gap.schema,'evopilot-project-semantic-gap/v1');assert.equal(gap.status,'NO_DECLARED_COMPATIBILITY_GAP');
    assert.equal(gap.compatibilityDigest,compatibility.report.compatibilityDigest);assert.equal(gap.artifactSetDigest,chosen.artifactSetDigest);
    assert.equal(gap.bundleRef.digest,chosen.bundleDigest,'PROBE_BUNDLE_DRIFT');
    assert.deepEqual(gap.scope,expectedScope);assert.equal(gap.selectedSuccessor,null);assert.equal(gap.bindingCreated,false);
    assert.equal(gap.eligibleForExecution,false);assert.equal(gap.successorHandoff.preservesExistingRunPins,true);
    exactKeys(gap.authority,['maySelect','mayModify','mayApprove','mayPublish','mayBind','mayExecute']);
    assert.ok(Object.values(gap.authority).every(x=>x===false));assert.ok(isDigest(gap.gapDigest));
    const reread=await call('inspect');assert.equal(reread.discoveryDigest,discovery.discoveryDigest,'PROBE_BINDING_DRIFT');
  });
}
