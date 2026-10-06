import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import path from 'node:path';
import {probeSession} from './versions/probe-session.mjs';
import {runRuntimeDiscoveryProbe} from './versions/runtime/6.3.0/discovery-probe.mjs';
import {runExpertDeclarationProbe} from './versions/expert/2.3.0/declaration-probe.mjs';
import {runExpertDeclarationProbe as runCurrentExpertDeclarationProbe} from './versions/expert/2.3.1/declaration-probe.mjs';
import {expertCliResult} from './versions/expert-cli-result.mjs';

test('Expert versioned probe checks actual source CLI declarations without operating Hosts',async()=>{
  const report=await runCurrentExpertDeclarationProbe({invoke:(args,{signal})=>new Promise((resolve,reject)=>{
    execFile(process.execPath,[path.resolve('packages/evolution-expert/dist/cli.js'),...args],
      {signal,timeout:5000,maxBuffer:1048576,env:{PATH:process.env.PATH}},(error,stdout,stderr)=>{
        if(error && !Number.isInteger(error.code))return reject(error);
        try{resolve(expertCliResult(error?.code??0,stdout,stderr));}catch(e){reject(e);}
      });
  })});
  assert.equal(report.status,'PROBE_ASSERTIONS_PASSED');assert.equal(report.events.length,194);
  assert.equal(report.targetCriteriaClosed,0);assert.equal(report.workBuddy,'NOT_OPERATED_OR_OBSERVED');
});
for (const [version,probe,otherVersion] of [['2.3.0',runExpertDeclarationProbe,'2.3.1'],['2.3.1',runCurrentExpertDeclarationProbe,'2.3.0']]) {
  test(`Expert ${version} declaration probe refuses a ${otherVersion} manifest before further commands`,async()=>{
    let calls=0;
    await assert.rejects(probe({invoke:async args=>{
      calls++;assert.deepEqual(args,['manifest']);
      return {exitCode:0,json:{schema:'evopilot-evolution-expert-core/v3',version:otherVersion,digest:'sha256:'+'1'.repeat(64)}};
    }}),{code:'ERR_ASSERTION'});
    assert.equal(calls,1);
  });
}
test('named Expert diagnostics are retained without stacks; arbitrary failures do not prove rejection',()=>{
  const code='EVOLUTION_EXPERT_INVALID_RUNTIME_VERSION';
  assert.deepEqual(expertCliResult(1,'',`Error: ${code}: expected an exact stable version\n at private-path`),
    {exitCode:1,json:{schema:'evopilot-expert-cli-diagnostic-observation/v1',code}});
  for(const [exit,stderr] of [[0,`Error: ${code}`],[2,`Error: ${code}`],[1,'Error: unrelated crash'],[1,''],[1,`Error: ${code}\nError: second failure`]])
    assert.throws(()=>expertCliResult(exit,'',stderr),/UNRECOGNIZED_EXPERT_FAILURE/);
});
const base={product:'synthetic',version:'0.0.0'};
test('probe cancellation before start invokes nothing',async()=>{
  const c=new AbortController();c.abort();let calls=0;
  await assert.rejects(probeSession({...base,signal:c.signal,invoke:()=>{calls++;}},async call=>call([])),/PROBE_CANCELLED/);assert.equal(calls,0);
});
test('deadline reaches transport and prevents following commands and partial PASS',async()=>{
  let observed,calls=0;
  await assert.rejects(probeSession({...base,timeoutMs:10,invoke:(_,{signal})=>{calls++;observed=signal;return new Promise(()=>{});}},
    async call=>{await call(['read']);await call(['next']);}),/PROBE_TIMEOUT/);
  assert.equal(calls,1);assert.equal(observed.aborted,true);
});
test('cancelling in flight stops subsequent commands',async()=>{
  const c=new AbortController();let calls=0;
  await assert.rejects(probeSession({...base,signal:c.signal,invoke:async()=>{calls++;c.abort();return {exitCode:0,json:{}};}},
    async call=>{await call(['read']);await call(['next']);}),/PROBE_CANCELLED/);assert.equal(calls,1);
});
for(const result of [{exitCode:null,json:{}},{exitCode:-1,json:{}},{exitCode:0,json:{},raw:'secret'},{exitCode:0,json:undefined},{exitCode:0,json:'x'.repeat(1048577)}])
  test('malformed or oversized transport result produces no probe report '+String(result.exitCode)+'/'+Object.keys(result).join(','),async()=>{
    await assert.rejects(probeSession({...base,invoke:async()=>result},async call=>call(['read'])));
  });
test('transport exceptions are not a successful negative assertion',async()=>{
  await assert.rejects(runExpertDeclarationProbe({invoke:async()=>{throw Error('TRANSPORT_DOWN');}}),/TRANSPORT_DOWN/);
});
test('reports contain response hashes, not private response content',async()=>{
  const report=await probeSession({...base,invoke:async()=>({exitCode:0,json:{private:'do-not-record'}})},async call=>call(['read']));
  assert.equal(JSON.stringify(report).includes('do-not-record'),false);assert.equal(report.events.length,1);
});
test('selection injection fails before Runtime calls',async()=>{
  let calls=0;await assert.rejects(runRuntimeDiscoveryProbe({invoke:()=>calls++,scope:{tenantId:'t',workspaceId:'w',projectId:'p'},
    selection:{projectId:'p',catalogId:'c',artifactSetDigest:'sha256:'+'1'.repeat(64),bundleDigest:'sha256:'+'2'.repeat(64),approve:true}}));
  assert.equal(calls,0);
});
test('missing Runtime semantic capability does not fall back or continue',async()=>{
  let calls=0;await assert.rejects(runRuntimeDiscoveryProbe({invoke:async()=>{calls++;return {exitCode:0,json:{projectId:'p',schema:'legacy'}};},
    scope:{tenantId:'t',workspaceId:'w',projectId:'p'},selection:{projectId:'p',catalogId:'c',artifactSetDigest:'sha256:'+'1'.repeat(64),bundleDigest:'sha256:'+'2'.repeat(64)}}));
  assert.equal(calls,1);
});
