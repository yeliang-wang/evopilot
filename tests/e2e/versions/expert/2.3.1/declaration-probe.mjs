import assert from 'node:assert/strict';
import {isDigest,probeSession} from '../../probe-session.mjs';
const hosts=Object.freeze(['codex','claude-code','workbuddy','generic-agent','generic-mcp']);
const rejectedVersions=Object.freeze(['5.0.0','6.1.0','7.0.0','6.3.0invalid','6.3','06.3.0','6.03.0','6.3.00','6.3.0-rc.1','',' ',' 6.3.0','6.3.0 ']);

/** This independent 2.3.1 probe inspects packaged declarations, including the WorkBuddy declaration.
 * It does not launch, operate, observe or qualify any of these real Hosts. */
export function runExpertDeclarationProbe({invoke,signal,timeoutMs}) {
  return probeSession({product:'expert',version:'2.3.1',invoke,signal,timeoutMs},async request=>{
    const first=await request(['manifest']);assert.equal(first.exitCode,0);
    const core=first.json;assert.equal(core.schema,'evopilot-evolution-expert-core/v3');assert.equal(core.version,'2.3.1');assert.ok(isDigest(core.digest));
    for(const host of hosts) {
      let adapterDigest;
      for(const command of ['compatibility','doctor'])for(const version of [undefined,'6.3.3','6.3.2','6.3.1','6.3.0','6.2.0']) {
        const r=await request([command,host,...(version?[version]:[])]);assert.equal(r.exitCode,0,'PROBE_DECLARATION_FAILED');
        const compatibility=command==='doctor'?r.json.compatibility:r.json;
        assert.equal(compatibility.conformanceStatus,'CONFORMANT');assert.equal(compatibility.engineVersion,version??'6.3.0');
        assert.equal(compatibility.expertVersion,'2.3.1');assert.equal(compatibility.coreDigest,core.digest);
        assert.ok(isDigest(compatibility.adapterDigest));adapterDigest??=compatibility.adapterDigest;
        assert.equal(compatibility.adapterDigest,adapterDigest,'PROBE_ADAPTER_DRIFT');
        assert.ok(compatibility.requiredHostCapabilities.includes('host-native-secure-secret-input'));
        if(command==='doctor')assert.equal(r.json.status,'READY');
      }
      for(const command of ['compatibility','doctor'])for(const version of rejectedVersions) {
        const r=await request([command,host,version]);
        assert.notEqual(r.exitCode,0,'PROBE_INVALID_VERSION_OR_HOST_ACCEPTED');
        assert.notEqual(r.json?.status,'READY','PROBE_FALSE_READY_ON_REFUSAL');
        assert.notEqual((r.json?.compatibility??r.json)?.conformanceStatus,'CONFORMANT','PROBE_FALSE_CONFORMANCE_ON_REFUSAL');
        if(['5.0.0','6.1.0','7.0.0'].includes(version)) {
          const compatibility=command==='doctor'?r.json.compatibility:r.json;
          assert.equal(compatibility.conformanceStatus,'INCOMPATIBLE');assert.equal(compatibility.engineVersion,version);
          assert.equal(compatibility.coreDigest,core.digest);assert.equal(compatibility.adapterDigest,adapterDigest);
          if(command==='doctor')assert.equal(r.json.status,'INCOMPATIBLE');
        } else {
          assert.equal(r.json.schema,'evopilot-expert-cli-diagnostic-observation/v1');
          assert.equal(r.json.code,'EVOLUTION_EXPERT_INVALID_RUNTIME_VERSION');
        }
      }
    }
    // Nonzero *completed* process results, not timeout/transport failure.
    for(const command of ['doctor','compatibility']) {
      const r=await request([command,'unknown-host','6.3.0']);assert.notEqual(r.exitCode,0,'PROBE_INVALID_VERSION_OR_HOST_ACCEPTED');
      assert.equal(r.json.schema,'evopilot-expert-cli-diagnostic-observation/v1');
      assert.equal(r.json.code,'EVOLUTION_EXPERT_UNKNOWN_PACKAGED_HOST');
    }
    const last=await request(['manifest']);assert.equal(last.exitCode,0);assert.equal(last.json.digest,core.digest,'PROBE_CORE_DRIFT');
  });
}
