import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,realpathSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import https from 'node:https';
import {consumptionFixture,token,digest} from './fixtures/usability-consumption.mjs';
import {startConsumptionHTTP} from '../../dist/integration/consumption/http.js';
import {createAssetConsumption,verifyAssetBundle,consumptionDigest} from '../../dist/integration/consumption/assets.js';
import {syntheticHarnessPackage,replaceNativeFile} from '../../projects/evopilot-harness/examples/native/package.mjs';
import {referenceForPackage} from '../../dist/integration/compatibility/v1/native.mjs';
import {usabilityDigest,usabilityBytesDigest} from '../../dist/integration/compatibility/usability/v1/contract.mjs';
const scope={visibility:'private',projectId:'synthetic-one'};
const auth=()=>({schema:'evopilot-asset-authorization/v1',credentials:[{id:'synthetic-client',tokenDigest:digest(token),enabled:true,grants:[{scope,assets:[],inventories:[],assessments:[]}]}]});
const post=(url,request,headers={})=>fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',...headers},body:JSON.stringify(request)});
const discover={operation:'assets.discover',scope,input:{limit:1,cursor:null}};

test('UC01 standalone CLI authenticates real HTTP reads of published native owners, preserves state and supports offline verification',async t=>{
  const f=await consumptionFixture(t),before=Object.fromEntries(['harness','ontology'].map(o=>[o,f.api.inspect(o,f.scope)]));
  assert.equal(existsSync(join(f.options.workspaceRoot,'state/runtime')),false);
  const child=spawn(process.execPath,['scripts/asset-service.mjs','--config',f.configFile],{cwd:new URL('../../',import.meta.url),stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',c=>{stderr+=c;});const ended=once(child,'exit');
  const ready=await Promise.race([once(child.stdout,'data').then(([b])=>JSON.parse(b.toString())),ended.then(()=>{throw Error(stderr);})]);assert.equal(ready.status,'READY');const url=`http://127.0.0.1:${ready.port}/v1/assets`;
  try{
    let response=await post(url,discover);assert.equal(response.status,200);const first=await response.json();assert.equal(first.items.length,1);assert.equal(first.total,2);assert(first.nextCursor);
    const second=await (await post(url,{...discover,input:{limit:1,cursor:first.nextCursor}})).json();assert.equal(second.items.length,1);assert.equal(second.nextCursor,null);assert.notDeepEqual(second.items,first.items);
    for(const reference of f.refs){response=await post(url,{operation:'assets.export',scope:f.scope,input:{reference}});assert.equal(response.status,200);const bundle=await response.json();assert.equal(verifyAssetBundle(bundle).root.digest,reference.digest);assert.equal(bundle.verifiedLevel,null);
      const bad=structuredClone(bundle);bad.packages[0].package.files[Object.keys(bad.packages[0].package.files)[0]]+='changed';assert.throws(()=>verifyAssetBundle(bad));
      response=await post(url,{operation:'assets.query',scope:f.scope,input:{reference,query:{limit:2}}});assert.equal(response.status,200,await response.clone().text());const page=await response.json();assert.equal(page.rows.length,2);
    }
    assert.equal((await post(url,{...discover,scope:{...scope,projectId:'other'}})).status,403);
    f.auth.credentials[0].enabled=false;f.saveAuth();assert.equal((await post(url,discover)).status,401);
    assert.equal(existsSync(join(f.options.workspaceRoot,'state/runtime')),false);for(const owner of ['harness','ontology'])assert.deepEqual(f.api.inspect(owner,f.scope),before[owner]);
  }finally{child.kill('SIGTERM');await ended;}
});

test('UC02 plaintext nonloopback is forbidden; actual TLS listener works with explicit local certificate trust',async()=>{
  await assert.rejects(startConsumptionHTTP({host:'0.0.0.0',port:0,readAuthorization:auth,consume:async()=>({})}),{code:'CONSUMPTION_TLS_REQUIRED'});
  const root=mkdtempSync(join(realpathSync(tmpdir()),'evopilot-tls-')),key=join(root,'key.pem'),cert=join(root,'cert.pem'),conf=join(root,'openssl.cnf');
  writeFileSync(conf,'[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-config',conf],{stdio:'ignore'});
  const server=await startConsumptionHTTP({host:'0.0.0.0',port:0,tls:{key:readFileSync(key),cert:readFileSync(cert)},readAuthorization:auth,consume:async()=>({readOnly:true})});
  try{const body=JSON.stringify(discover);const response=await new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',port:server.address.port,path:'/v1/assets',method:'POST',ca:readFileSync(cert),headers:{authorization:'Bearer '+token,'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{let data='';res.on('data',b=>{data+=b;});res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(data)}));});req.on('error',reject);req.end(body);});assert.equal(response.status,200);assert.deepEqual(response.body,{readOnly:true});}finally{await server.close();rmSync(root,{recursive:true,force:true});}
});

test('UC03 auth, origin, path, method, body and response limits are enforced before disclosure',async()=>{
  let calls=0;const server=await startConsumptionHTTP({host:'127.0.0.1',port:0,readAuthorization:auth,consume:async()=>{calls++;return {text:'<script>alert(1)</script>'};}}),url=`http://127.0.0.1:${server.address.port}/v1/assets`;
  try{
    const origin=new URL(url).origin;
    for(const path of ['/', '/assets/client.js', '/compatibility/readability/v1/presentation.mjs'])assert.equal((await fetch(origin+path)).status,404);
    assert.equal((await post(url,discover,{origin})).status,404);
    assert.equal((await fetch(origin+'/v1/projects')).status,401);
    const projects=await fetch(origin+'/v1/projects',{headers:{authorization:'Bearer '+token}});assert.equal(projects.status,200);assert.deepEqual((await projects.json()).items,[{scope,assetCount:0,assessments:[]}]);
    assert.equal((await post(url,discover,{authorization:'Bearer invalid'})).status,401);assert.equal((await post(url,discover,{origin:'https://untrusted.invalid'})).status,404);assert.equal((await post(url+'?token='+token,discover)).status,404);assert.equal((await fetch(url)).status,404);assert.equal((await post(url,discover,{'content-type':'text/plain'})).status,415);assert.equal((await post(url,{padding:'x'.repeat(17000)})).status,413);assert.equal(calls,0);const r=await post(url,discover);assert.equal(r.headers.get('content-type'),'application/json; charset=utf-8');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('access-control-allow-origin'),null);assert.equal((await r.json()).text,'<script>alert(1)</script>');}finally{await server.close();}
});

test('UC04 revocation during a pending read blocks the final response',async()=>{
  const configuration=auth();let resolveRead,entered;const pending=new Promise(r=>{entered=r;});const server=await startConsumptionHTTP({host:'127.0.0.1',port:0,readAuthorization:()=>configuration,consume:async()=>{entered();return new Promise(r=>{resolveRead=r;});}});
  try{const request=post(`http://127.0.0.1:${server.address.port}/v1/assets`,discover);await pending;configuration.credentials[0].enabled=false;resolveRead({private:'must-not-return'});const response=await request;assert.equal(response.status,403);assert(!(await response.text()).includes('must-not-return'));}finally{await server.close();}
});

test('UC05 repeated authenticated reads are bounded and provider errors never disclose secrets',async()=>{
  const server=await startConsumptionHTTP({host:'127.0.0.1',port:0,readAuthorization:auth,consume:async()=>{throw Error('private-secret');}}),url=`http://127.0.0.1:${server.address.port}/v1/assets`;
  try{for(let i=0;i<120;i++){const r=await post(url,discover);assert.equal(r.status,400);assert(!(await r.text()).includes('private-secret'));}assert.equal((await post(url,discover)).status,429);}finally{await server.close();}
});

function projectionFixture(){
 const pkg=replaceNativeFile(syntheticHarnessPackage(),'spec/contract.json','{"behavior":"synthetic normative requirement"}'),reference=referenceForPackage(pkg),content=pkg.files['spec/contract.json'];
 const inventory={schema:'evopilot-usability-inventory/v1',workspaceId:'synthetic-projection',scope,slice:{id:'slice',version:'1',title:'Synthetic projection',exclusions:['Real acceptance']},targetLevel:'L1',pins:{sourceDigest:usabilityDigest('source'),assetDigests:[reference.digest],environmentDigest:usabilityDigest('env'),dependenciesDigest:usabilityDigest('deps'),oracleDigest:null,inputManifestDigest:null},reviewReference:'synthetic-private-review-path',questions:[{id:'q',question:'What behavior?'}],behaviors:[]};
 const inventoryDigest=usabilityDigest(inventory),spec={schema:'evopilot-usability-specification/v1',inventoryDigest,answers:[{questionId:'q',status:'RESOLVED',statement:{text:'Synthetic behavior',citations:[{assetDigest:reference.digest,path:'spec/contract.json',contentDigest:usabilityBytesDigest(content)}]}}],behaviors:[]};
 const grant={scope,assets:[reference],inventories:[inventoryDigest],assessments:[]},principal={id:'test',grants:[grant]};
 const record={inventory,assets:[{reference,normativePaths:['spec/contract.json']}],digest:inventoryDigest,reviewDigest:usabilityDigest('review')};
 const providers={workspaceId:inventory.workspaceId,readPackage:async()=>({workspaceId:inventory.workspaceId,scope,package:pkg,published:true}),readSnapshot:async()=>{throw Error('unused');},usability:async r=>r.operation==='usability.inventory.read'?record:spec};
 return {pkg,reference,inventory,inventoryDigest,spec,grant,principal,providers,request:()=>({operation:'assets.specification',scope,input:{inventoryDigest,specificationDigest:usabilityDigest(spec)}})};
}
test('UC06 specification-only export retains exact citations and explicit losses, excludes original source and local review paths',async()=>{
 const f=projectionFixture(),api=createAssetConsumption(f.providers),r=await api.consume(f.principal,f.request());assert.equal(r.files.length,1);assert.equal(r.files[0].path,'spec/contract.json');assert(r.losses.omitted.some(x=>x.path.startsWith('sources/')));assert(!JSON.stringify(r).includes('synthetic-private-review-path'));assert.equal(r.verifiedLevel,null);assert.equal(r.inputMode,'ASSETS_ONLY');assert(!r.files.some(x=>x.path.startsWith('tests/')));
 f.spec.answers[0].statement.citations[0].path='sources/requirements.txt';await assert.rejects(api.consume(f.principal,f.request()),{code:'CONSUMPTION_UNSAFE_PROJECTION'});
});
test('UC07 missing citations, stale scoped identity and unauthorized inventory fail closed',async()=>{
 const f=projectionFixture(),api=createAssetConsumption(f.providers);f.spec.answers[0].statement.citations[0].path='missing.md';await assert.rejects(api.consume(f.principal,f.request()),{code:'CONSUMPTION_PARTIAL'});f.grant.inventories=[];await assert.rejects(api.consume(f.principal,f.request()),{code:'CONSUMPTION_FORBIDDEN'});
});
test('UC08 exact dependency closure rejects missing packages and offline tampering',async()=>{
 const f=projectionFixture(),dependency=syntheticHarnessPackage({id:'synthetic-dependency'}),depRef=referenceForPackage(dependency);f.pkg.manifest.dependencies=[depRef];const rootRef=referenceForPackage(f.pkg);f.grant.assets=[rootRef];f.providers.readPackage=async({reference})=>({workspaceId:f.inventory.workspaceId,scope,published:true,package:reference.id===rootRef.id?f.pkg:dependency});const api=createAssetConsumption(f.providers),request={operation:'assets.export',scope,input:{reference:rootRef}};const bundle=await api.consume(f.principal,request);assert.equal(bundle.packages.length,2);assert.deepEqual(verifyAssetBundle(bundle),bundle);
 const partial=structuredClone(bundle);partial.packages=partial.packages.filter(p=>p.reference.id===rootRef.id);const {digest:_,...body}=partial;partial.digest=consumptionDigest(body);assert.throws(()=>verifyAssetBundle(partial),{code:'CONSUMPTION_PARTIAL'});
 f.providers.readPackage=async()=>{throw Error('private-path');};await assert.rejects(api.consume(f.principal,request));
});
