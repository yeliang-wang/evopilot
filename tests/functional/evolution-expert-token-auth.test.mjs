import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fixture,signed} from '../e2e/expert-host-integration/synthetic-fixture.mjs';
import {digest,requestBinding,validateConfig} from '../../packages/evolution-expert/host-integration/contracts.mjs';
import {provision} from '../../packages/evolution-expert/host-integration/controller.mjs';
import {setupLocalTls,serveLocalTls} from '../../packages/evolution-expert/host-integration/local-runtime.mjs';
import {privateTransport} from '../../packages/evolution-expert/host-integration/transport.mjs';
import {launchLocalTokenInput} from '../../packages/evolution-expert/host-integration/launcher.mjs';
import {verifyCredential} from '../../packages/evolution-expert/host-integration/credential.mjs';

function bind(setup) {
 const f=fixture(),key=generateKeyPairSync('ed25519'),c=f.request.config;
 delete c.username;Object.assign(c,{destination:setup.destination,localTls:setup.localTls,tenantId:'tenant-production',workspaceId:'workspace-agent-products',authentication:{mode:'local-token',credentialId:'test-local-credential',actor:'test-operator',role:'admin',credentialPublicKey:key.publicKey.export({type:'spki',format:'pem'})}});
 const binding=requestBinding(c,f.request.componentDigest,f.request.requestId);
 f.request.permission=signed({schema:'evopilot-host-permission/v1',binding,decision:'ALLOW',hostPermissionObserved:true},f.permissionKey.privateKey);
 f.request.deployment=signed({schema:'evopilot-runtime-deployment-check/v1',destination:c.destination,tenantId:c.tenantId,workspaceId:c.workspaceId,runtimeVersion:'6.3.0',nonDebugEncryption:true,loggingLevel:'info'},f.deploymentKey.privateKey);
 const token=randomBytes(32).toString('hex');
 const payload={schema:'evopilot-local-runtime-credential/v1',binding,credentialId:c.authentication.credentialId,actor:c.authentication.actor,role:c.authentication.role,tenantId:c.tenantId,workspaceId:c.workspaceId,upstream:c.localTls.upstream,tokenDigest:digest(token)};
 f.packet={token,attestation:signed(payload,key.privateKey)};f.binding=binding;f.sign=p=>signed(p,key.privateKey);
 f.deps.credential=async()=>f.packet;f.deps.transport.preflight=async()=>{};
 f.deps.collect=async context=>{assert.equal(context.authMode,'local-token');f.observed.collected++;return {value:f.sentinels.value,bindingDigest:digest(binding)};};
 return f;
}
test('local token binding and source pipe fail closed, retain actual Runtime RBAC',async t=>{
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'expert-token-tests-'));fs.chmodSync(root,0o700);
 const net=await import('node:net');const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));
 const setup=setupLocalTls(root,'http://127.0.0.1:19876',port);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 await t.test('valid bound credential creates SecretRef with provider-only input and no login',async()=>{
  const f=bind(setup);validateConfig(f.request.config);assert.equal((await provision(f.request,f.deps)).status,'SECRET_REF_CREATED');assert.equal(f.observed.collected,1);assert.ok(f.observed.calls.every(x=>!x.pathname.endsWith('/login')));assert.equal(f.packet.token,'');
 });
 for(const field of ['actor','role','credentialId','tenantId','workspaceId','upstream','tokenDigest'])await t.test(`signed wrong ${field} refused before input even with successful empty list`,async()=>{
  const f=bind(setup);const {issuedAt,expiresAt,...payload}=f.packet.attestation.payload;payload[field]='wrong';f.packet.attestation=f.sign(payload);assert.equal((await provision(f.request,f.deps)).status,'AUTH_FAILED');assert.equal(f.observed.collected,0);assert.equal(f.observed.claims,0);
 });
 await t.test('expired, wrong signer, changed request and changed token rejected',()=>{
  for(const mode of ['expired','signer','request','token']){const f=bind(setup);if(mode==='expired')f.packet.attestation.payload.expiresAt=0;if(mode==='signer')f.packet.attestation=signed(f.packet.attestation.payload,generateKeyPairSync('ed25519').privateKey);if(mode==='request')f.binding={...f.binding,requestId:'0'.repeat(32)};if(mode==='token')f.packet.token='x'.repeat(32);assert.throws(()=>verifyCredential(f.request.config,f.binding,f.packet));}
 });
 await t.test('missing pipe provider, cancelled input, and expired binding after input never submit',async()=>{
  for(const mode of ['missing','cancel','expired']){const f=bind(setup);if(mode==='missing')delete f.deps.credential;else f.deps.collect=async()=>{if(mode==='cancel')return null;f.packet.attestation.payload.expiresAt=0;return {value:f.sentinels.value,bindingDigest:digest(f.binding)};};const r=await provision(f.request,f.deps);assert.equal(r.status,mode==='cancel'?'CANCELLED':'AUTH_FAILED');assert.equal(f.observed.posts,0);}
 });
 await t.test('token write with lost response stays UNKNOWN without replay or password fallback',async()=>{
  const f=bind(setup),transport=f.deps.transport;f.deps.transport=async call=>{if(call.method==='POST'){f.observed.posts++;throw Error('lost');}return transport(call);};f.deps.transport.preflight=async()=>{};
  assert.equal((await provision(f.request,f.deps)).status,'UNKNOWN');assert.equal(f.observed.posts,1);assert.equal(f.observed.collected,1);assert.ok(f.observed.calls.every(x=>!x.pathname.endsWith('/login')));
 });
 await t.test('password-bearing native result is rejected in token mode',async()=>{
  const f=bind(setup);f.deps.collect=async()=>({password:'unwanted',value:f.sentinels.value,bindingDigest:digest(f.binding)});
  assert.equal((await provision(f.request,f.deps)).status,'FAILED_BEFORE_SECRET_SUBMIT');assert.equal(f.observed.posts,0);
 });
 await t.test('local token config cannot accept username, remote destination, viewer role or missing local TLS',()=>{
  for(const change of [c=>c.username='hidden',c=>c.destination='https://runtime.example.test',c=>c.authentication.role='viewer',c=>delete c.localTls]){const f=bind(setup);change(f.request.config);assert.throws(()=>validateConfig(f.request.config));}
 });
 await t.test('trusted launcher refuses changed config before consulting credential source',async()=>{
  const f=bind(setup),configPath=path.join(root,'launcher-config.json');fs.writeFileSync(configPath,JSON.stringify(f.request.config),{mode:0o600});let consulted=0;
  const result=await launchLocalTokenInput({configPath,configDigest:digest('wrong config'),componentDigest:f.request.componentDigest,request:{requestId:f.request.requestId,permission:f.request.permission,deployment:f.request.deployment},credentialProvider:async()=>{consulted++;return f.packet;},signal:new AbortController().signal});
  assert.deepEqual(result,{status:'BINDING_REJECTED'});assert.equal(consulted,0);
 });
 await t.test('credential crosses inherited socket only, not argv/env/output; regular file and oversize refused',async()=>{
  const module=new URL('../../packages/evolution-expert/host-integration/credential.mjs',import.meta.url).href;
  const code=`import {readCredentialPipe} from ${JSON.stringify(module)};try{const p=await readCredentialPipe(3,new AbortController().signal);console.log(p.token.length>0?'PRIVATE_PIPE_OK':'FAIL');p.token='';}catch{console.log('REFUSED');}`;
  const run=async(fd,packet)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code],{env:{},stdio:['ignore','pipe','ignore',fd]});let output='';child.stdout.on('data',b=>output+=b);child.on('error',reject);child.on('close',()=>resolve(output.trim()));if(fd==='pipe'){child.stdio[3].on('error',()=>{});child.stdio[3].end(packet);}});
  const f=bind(setup);assert.equal(await run('pipe',JSON.stringify(f.packet)),'PRIVATE_PIPE_OK');assert.equal(await run('pipe','x'.repeat(40000)),'REFUSED');const file=path.join(root,'nonsecret-file');fs.writeFileSync(file,'{}');const fd=fs.openSync(file,'r');try{assert.equal(await run(fd),'REFUSED');}finally{fs.closeSync(fd);}
 });
 await t.test('real Runtime bearer authentication, invalid token and insufficient role (synthetic input)',async()=>{
  const {createServer}=await import('../../packages/server/dist/index.js');const previous=process.env.EVOPILOT_SECRET_MASTER_KEY;process.env.EVOPILOT_SECRET_MASTER_KEY=randomBytes(32).toString('hex');
  const f=bind(setup),viewer=bind(setup),revoked=bind(setup);const c=f.request.config;const server=createServer({dataRoot:path.join(root,'runtime'),runtimeMode:'prod',allowSampleData:false,autoRegisterProfileProject:false,tokens:[{name:c.authentication.actor,token:f.packet.token,role:'admin',platformAdmin:true,tenantId:c.tenantId,workspaceId:c.workspaceId},{name:'viewer',token:viewer.packet.token,role:'viewer',tenantId:c.tenantId,workspaceId:c.workspaceId}]});let gateway;
  try{await new Promise(r=>server.listen(0,'127.0.0.1',r));const realRoot=path.join(root,'actual');fs.mkdirSync(realRoot,{mode:0o700});const actual=setupLocalTls(realRoot,`http://127.0.0.1:${server.address().port}`,port);gateway=await serveLocalTls(actual.configPath);
   function rebind(f){const c=f.request.config;Object.assign(c,{destination:actual.destination,localTls:actual.localTls});const b=requestBinding(c,f.request.componentDigest,f.request.requestId);f.binding=b;f.request.permission=signed({schema:'evopilot-host-permission/v1',binding:b,decision:'ALLOW',hostPermissionObserved:true},f.permissionKey.privateKey);f.packet.attestation=f.sign({...f.packet.attestation.payload,binding:b,upstream:actual.upstream});f.deps.transport=privateTransport(c);f.deps.collect=async()=>{f.observed.collected++;return {value:f.sentinels.value,bindingDigest:digest(b)};};}
   for(const x of [f,viewer,revoked])rebind(x);
   const result=await provision(f.request,f.deps);assert.equal(result.status,'SECRET_REF_CREATED');
   assert.equal((await provision(revoked.request,revoked.deps)).status,'AUTH_FAILED');assert.equal(revoked.observed.collected,0);
   // Dishonest fixture attestation cannot upgrade a real viewer token in Runtime.
   assert.equal((await provision(viewer.request,viewer.deps)).status,'UNKNOWN');
   assert.ok(!JSON.stringify(result).includes(f.sentinels.value));
  }finally{if(gateway)await gateway.close();server.closeAllConnections();await new Promise(r=>server.close(r));if(previous===undefined)delete process.env.EVOPILOT_SECRET_MASTER_KEY;else process.env.EVOPILOT_SECRET_MASTER_KEY=previous;}
 });
});
