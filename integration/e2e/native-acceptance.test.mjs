import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyNativeAcceptance} from '../../dist/expert/core/native-acceptance.js';
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const desktop=new Set(['D01.01','D01.02','D01.03','U01.01','U01.02','U01.03','U01.04','U02.01','D07.01','D07.02','D07.03','R05.04','R05.09']);
function fixture(t){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'evopilot-evidence-check-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const write=(name,value)=>{const p=path.join(root,name);fs.writeFileSync(p,JSON.stringify(value),{mode:0o600});return p;};
 const ids=JSON.parse(fs.readFileSync(new URL('../../governance/standards-v03.json',import.meta.url))).criterionIds;
 const variants=Array.from({length:364},(_,i)=>({criterionId:ids[i%65],variantId:ids[i%65]+'.'+String(Math.floor(i/65)+1).padStart(2,'0'),description:'Synthetic verifier fixture',expected:'Expected fixture outcome',phase:i<356?'PRE_RELEASE':'POST_RELEASE'}));
 const catalogPath=write('catalog.json',{criteria:ids.map(id=>({id}))}),variantsPath=write('variants.json',{variants});
 const targetPath=write('target.json',{id:'synthetic-verifier-only',version:'0.3.0',criterionIds:ids,acceptanceVariantCount:364,acceptanceCatalogDigest:digest(fs.readFileSync(catalogPath)),acceptanceVariantsDigest:digest(fs.readFileSync(variantsPath))});
 const plan={schema:'evopilot-acceptance-instance-plan/v1',variants:variants.map(v=>({variantId:v.variantId,instances:['case-one','case-two']}))};
 const instancePlanPath=write('instances.json',plan),instancePlanDigest=digest(fs.readFileSync(instancePlanPath));
 const evidencePath=write('fixture.json',{syntheticVerifierFixture:true,authority:false});
 const candidateDigest=digest(Buffer.from('synthetic-candidate'));
 const report={schema:'evopilot-native-acceptance-results/v1',version:'0.3.0',candidateDigest,instancePlanDigest,results:variants.flatMap(v=>['case-one','case-two'].map(instanceId=>({variantId:v.variantId,instanceId,candidateDigest,expected:v.expected,status:'PASS',evidence:[{path:evidencePath,sha256:digest(fs.readFileSync(evidencePath)),kind:desktop.has(v.variantId)?'desktop':'command',synthetic:!desktop.has(v.variantId),candidateDigest,instanceId,locator:'synthetic verifier shape only',...(desktop.has(v.variantId)?{threadId:'11111111-2222-3333-4444-555555555555'}:{})}]})))};
 const reportPath=write('report.json',report);
 const options={targetPath,catalogPath,variantsPath,instancePlanPath,instancePlanDigest,reportPath,candidateDigest,phase:'PRE_RELEASE'};
 return {root,write,options,report,plan,check(value=report,phase='PRE_RELEASE'){write('report.json',value);return verifyNativeAcceptance({...options,phase});}};
}
test('native verifier fixture: full-shaped evidence only proves completeness, never real acceptance or publication',t=>{
 const f=fixture(t),pre=f.check();assert.equal(pre.completeness,'COMPLETE');assert.equal(pre.variants,356);assert.equal(pre.instances,712);assert.equal(pre.acceptance,'NOT_EVALUATED');assert.equal(pre.authority,false);assert.equal(pre.releaseAuthorized,false);
 assert.equal(f.check(f.report,'POST_RELEASE').instances,728);
});
test('native verifier cannot shrink frozen denominator, per-instance results or pre-release requirements',t=>{
 const f=fixture(t);const r=structuredClone(f.report);r.results.shift();assert.equal(f.check(r).completeness,'INCOMPLETE');
 for(const status of ['PLANNED','UNKNOWN','SKIPPED','FAIL']){const r=structuredClone(f.report);r.results[0].status=status;assert.equal(f.check(r).completeness,'INCOMPLETE');}
 const missingPost=structuredClone(f.report);missingPost.results=missingPost.results.slice(0,712);assert.equal(f.check(missingPost).completeness,'COMPLETE');assert.equal(f.check(missingPost,'POST_RELEASE').completeness,'INCOMPLETE');
 f.plan.variants.pop();f.write('instances.json',f.plan);assert.throws(()=>f.check(),/binding/);
});
test('native verifier rejects stale, duplicate, orphan, rewritten expectations and fabricated Host metadata',t=>{
 const f=fixture(t);
 for(const change of [
  r=>r.results.push(r.results[0]),r=>r.results[0].variantId='foreign',r=>r.results[0].expected='weakened',r=>r.results[0].candidateDigest=digest(Buffer.from('other')),
  r=>r.results.find(x=>desktop.has(x.variantId)).evidence[0].synthetic=true,
  r=>r.results.find(x=>desktop.has(x.variantId)).evidence[0].kind='command',
  ...['D07.01','D07.02','D07.03','R05.04'].map(id=>r=>{r.results.find(x=>x.variantId===id).evidence[0].kind='command';}),
  r=>r.results.find(x=>desktop.has(x.variantId)).evidence[0].threadId='invented',
  r=>r.results[0].evidence[0].path=f.options.reportPath,
 ]){const r=structuredClone(f.report);change(r);assert.throws(()=>f.check(r));}
});
test('native verifier rejects modified evidence and linked files',t=>{
 const f=fixture(t),file=f.report.results[0].evidence[0].path;fs.appendFileSync(file,'changed');assert.throws(()=>f.check(),/bytes/);
 fs.unlinkSync(file);fs.symlinkSync(f.options.catalogPath,file);assert.throws(()=>f.check(),/links/);
});
