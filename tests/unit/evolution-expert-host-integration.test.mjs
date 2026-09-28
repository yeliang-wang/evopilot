import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { privateTransport } from '../../packages/evolution-expert/host-integration/transport.mjs';
import { claudePermissionObserver } from '../../packages/evolution-expert/host-integration/permission-observer.mjs';
import { provision } from '../../packages/evolution-expert/host-integration/controller.mjs';
import { ledger } from '../../packages/evolution-expert/host-integration/ledger.mjs';
import { digest } from '../../packages/evolution-expert/host-integration/contracts.mjs';
import { fixture, signed } from '../e2e/expert-host-integration/synthetic-fixture.mjs';

test('synthetic full private path returns actual SecretRef, never READY or raw values',async()=>{
  const f=fixture(), result=await provision(f.request,f.deps);
  assert.deepEqual(result,{status:'SECRET_REF_CREATED',secretRef:f.observed.secretId});
  assert.equal(f.observed.posts,1);
  for(const value of Object.values(f.sentinels))assert.ok(!JSON.stringify({result,observed:f.observed}).includes(value));
  assert.deepEqual(f.observed.calls.map(c=>c.pathname),['/api/v1/auth/login','/api/v1/secrets','/api/v1/secrets']);
});
for(const runtimeVersion of ['6.3.0','6.2.0'])test(`explicit signed ${runtimeVersion} secure setup remains supported`,async()=>{
  const f=fixture();const {issuedAt,expiresAt,...payload}=f.request.deployment.payload;
  f.request.deployment=signed({...payload,runtimeVersion},f.deploymentKey.privateKey);
  assert.equal((await provision(f.request,f.deps)).status,'SECRET_REF_CREATED');assert.equal(f.observed.posts,1);
});
for(const runtimeVersion of ['6.1.0','6.3.0-rc.1','6.3.0invalid','7.0.0',''])test(`signed but unsupported deployment ${runtimeVersion} cannot collect a secret`,async()=>{
  const f=fixture();const {issuedAt,expiresAt,...payload}=f.request.deployment.payload;
  f.request.deployment=signed({...payload,runtimeVersion},f.deploymentKey.privateKey);
  assert.equal((await provision(f.request,f.deps)).status,'BINDING_REJECTED');assert.equal(f.observed.collected,0);assert.equal(f.observed.posts,0);
});
for(const [name,mutate]of [
  ['missing permission',f=>delete f.request.permission],
  ['forged permission',f=>f.request.permission.signature='A'.repeat(86)+'=='],
  ['wrong destination',f=>f.request.config.destination='https://wrong.example.test'],
  ['HTTP prohibited',f=>f.request.config.destination='http://127.0.0.1'],
  ['URL credential',f=>f.request.config.destination='https://user:pass@example.test'],
  ['config raw extra',f=>f.request.config.password='synthetic'],
  ['wrong tenant',f=>f.request.config.tenantId='other'],
  ['wrong request',f=>f.request.requestId='0'.repeat(32)],
  ['tampered component',f=>f.deps.integrity=async()=>digest('other')],
  ['unsupported platform',f=>f.deps.platform='linux-x64'],
  ['unsigned encryption claim',f=>f.request.deployment.payload.nonDebugEncryption=false],
  ['no deployment evidence',f=>delete f.request.deployment],
  ['expired grant',f=>{const p={...f.request.permission.payload,issuedAt:1,expiresAt:2};f.request.permission=signed(p,f.permissionKey.privateKey);f.request.permission.payload.expiresAt=2;}],
  ['host permission not observed',f=>f.request.permission=signed({...f.request.permission.payload,hostPermissionObserved:false},f.permissionKey.privateKey)]
])test(`reject before input: ${name}`,async()=>{const f=fixture();mutate(f);assert.deepEqual(await provision(f.request,f.deps),{status:'BINDING_REJECTED'});assert.equal(f.observed.collected,0);assert.equal(f.observed.calls.length,0);});
test('cancel before input is zero network mutation',async()=>{const f=fixture();f.deps.collect=async()=>null;assert.deepEqual(await provision(f.request,f.deps),{status:'CANCELLED'});assert.equal(f.observed.calls.length,0);});
test('abort before collector',async()=>{const f=fixture();f.deps.signal=AbortSignal.abort();assert.deepEqual(await provision(f.request,f.deps),{status:'CANCELLED'});assert.equal(f.observed.collected,0);});
test('native scope substitution fails before authentication',async()=>{const f=fixture();f.deps.collect=async()=>({...f.sentinels,bindingDigest:digest('wrong')});assert.deepEqual(await provision(f.request,f.deps),{status:'FAILED_BEFORE_SECRET_SUBMIT'});assert.equal(f.observed.calls.length,0);});
test('binding drift during collection is caught before any network write',async()=>{const f=fixture(), collect=f.deps.collect;f.deps.collect=async()=>{const v=await collect();f.deps.integrity=async()=>digest('drift');return v;};assert.equal((await provision(f.request,f.deps)).status,'FAILED_BEFORE_SECRET_SUBMIT');assert.equal(f.observed.calls.length,0);});
for(const [name,change]of [
  ['auth rejection',r=>{r.status=401;}],['wrong authenticated tenant',r=>{r.data.user.tenantId='other';}],
  ['password repair required',r=>{r.data.user.mustChangePassword=true;}],['malformed auth token',r=>{r.data.token=null;}]
])test(name,async()=>{const f=fixture(),transport=f.deps.transport;f.deps.transport=async c=>{const r=await transport(c);if(c.pathname.endsWith('/login'))change(r);return r;};assert.equal((await provision(f.request,f.deps)).status,'AUTH_FAILED');assert.equal(f.observed.posts,0);});
test('detected ID collision never rotates the existing resource',async()=>{const f=fixture(),transport=f.deps.transport;f.deps.transport=async c=>c.method==='GET'?{status:200,data:[{id:f.observed.secretId,tenantId:f.request.config.tenantId,workspaceId:f.request.config.workspaceId}]}:transport(c);assert.equal((await provision(f.request,f.deps)).status,'COLLISION');assert.equal(f.observed.posts,0);});
test('wrong scope in list aborts before secret POST',async()=>{const f=fixture(),transport=f.deps.transport;f.deps.transport=async c=>c.method==='GET'?{status:200,data:[{id:'other',tenantId:'other',workspaceId:'other'}]}:transport(c);assert.equal((await provision(f.request,f.deps)).status,'FAILED_BEFORE_SECRET_SUBMIT');assert.equal(f.observed.posts,0);});
for(const [name,change]of [
  ['response lost',()=>{throw new Error('SYNTHETIC-provider-value-DO-NOT-USE');}],
  ['rotation response',r=>{r.status=200;}],['wrong returned scope',r=>{r.data.workspaceId='other';}],
  ['tampered ref',r=>{r.data.secretRef='secret://invented';}],['raw value reply',r=>{r.data.value='raw';}],
  ['encryption leaked',r=>{r.data.encryption={ciphertext:'raw'};}],['wrong version',r=>{r.data.version=2;}]
])test(`post-send ${name}: UNKNOWN, readback only, no replay`,async()=>{
  const f=fixture(),transport=f.deps.transport;
  f.deps.transport=async c=>{const r=await transport(c);if(c.method==='POST'&&c.pathname==='/api/v1/secrets')change(r);return r;};
  assert.deepEqual(await provision(f.request,f.deps),{status:'UNKNOWN'});assert.equal(f.observed.posts,1);assert.equal(f.observed.reads,2);
  assert.deepEqual(await provision(f.request,f.deps),{status:'DUPLICATE_OR_LEDGER_UNAVAILABLE'});assert.equal(f.observed.posts,1);
});
test('metadata readback never changes uncertain value into a success',async()=>{const f=fixture(),transport=f.deps.transport;let possible=false;f.deps.transport=async c=>{if(possible&&c.method==='GET')return {status:200,data:[{id:f.observed.secretId,tenantId:f.request.config.tenantId,workspaceId:f.request.config.workspaceId}]};const r=await transport(c);if(c.method==='POST'&&c.pathname==='/api/v1/secrets'){possible=true;throw new Error('lost');}return r;};assert.equal((await provision(f.request,f.deps)).status,'UNKNOWN');assert.equal(f.observed.posts,1);});
test('durable exclusive tombstone blocks duplicate after process restart',()=>{const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'expert-ledger-test-'));try{fs.chmodSync(root,0o700);const binding={requestId:'a'.repeat(32)};ledger(root).claim(binding,'expert-synthetic');assert.throws(()=>ledger(root).claim(binding,'other'));const contents=fs.readFileSync(path.join(root,`${binding.requestId}.json`),'utf8');assert.ok(!contents.includes('password'));}finally{fs.rmSync(root,{recursive:true});}});
test('ledger rejects symlink and broad permission roots',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'expert-ledger-test-'));try{fs.chmodSync(root,0o755);assert.throws(()=>ledger(root));}finally{fs.rmSync(root,{recursive:true});}});

test('trusted HTTPS transport pins destination/TLS/scope and never follows redirects',async t=>{
  const f=fixture();let calls=0;
  t.mock.method(https,'request',(url,options,onResponse)=>{
    calls++;assert.equal(url.href,'https://runtime.example.test/api/v1/secrets');
    assert.equal(options.rejectUnauthorized,true);assert.equal(options.agent,false);
    assert.equal(options.headers.authorization,`Bearer ${f.sentinels.token}`);
    assert.equal(options.headers['x-evopilot-workspace'],f.request.config.workspaceId);
    const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=302;res.headers={location:'https://attacker.example.test'};onResponse(res);res.emit('data',Buffer.from('{"data":{"ignored":true}}'));res.emit('end');req.emit('close');});return req;
  });
  const result=await privateTransport(f.request.config)({method:'GET',pathname:'/api/v1/secrets',token:f.sentinels.token});
  assert.equal(result.status,302);assert.equal(calls,1);
});
test('transport errors containing values are replaced by a fixed error',async t=>{
  const f=fixture();t.mock.method(https,'request',()=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{req.emit('error',new Error(f.sentinels.value));req.emit('close');});return req;});
  await assert.rejects(privateTransport(f.request.config)({method:'GET',pathname:'/api/v1/secrets'}),e=>e.message==='TRANSPORT_FAILED');
});
test('transport refuses profile/default-binding/foreign endpoints and DELETE',async()=>{
  const transport=privateTransport(fixture().request.config);
  for(const call of [{method:'POST',pathname:'/api/v1/runtime-readiness/workspace-default'},{method:'DELETE',pathname:'/api/v1/secrets'},{method:'POST',pathname:'https://attacker.example.test'}])await assert.rejects(transport(call),/TRANSPORT_FAILED/);
});
test('cancellation during possible POST stays UNKNOWN, with only readback afterward',async()=>{
  const f=fixture(),original=f.deps.transport,abort=new AbortController();f.deps.signal=abort.signal;
  f.deps.transport=async c=>{const r=await original(c);if(c.method==='POST'&&c.pathname==='/api/v1/secrets'){abort.abort();throw new Error('cancelled after send');}return r;};
  assert.equal((await provision(f.request,f.deps)).status,'UNKNOWN');assert.equal(f.observed.posts,1);assert.equal(f.observed.reads,2);
});
test('bounded input timeout collects no network state',async()=>{
  const f=fixture();f.deps.collect=async(_context,signal)=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve(null),{once:true}));
  assert.equal((await provision(f.request,f.deps)).status,'CANCELLED');assert.equal(f.observed.calls.length,0);
});

test('trusted observer binds actual permission event and exact human response; duplicate denied (synthetic channel)',async()=>{
  const f=fixture(),binding=f.request.permission.payload.binding;
  const observe=claudePermissionObserver({binding,publicKey:f.request.config.permissionPublicKey,signingKey:f.permissionKey.privateKey,requestHumanPermission:async exact=>({...exact,decision:'ALLOW'})});
  const message={type:'control_request',request_id:'host-request-1',request:{subtype:'can_use_tool',tool_name:'mcp__evopilot_private_input__provision_workspace_secret',tool_use_id:'tool-use-1',input:{requestId:f.request.requestId}}};
  const decision=await observe(message);assert.equal(decision.response.behavior,'allow');
  f.request.permission=decision.permission;assert.equal((await provision(f.request,f.deps)).status,'SECRET_REF_CREATED');
  assert.equal((await observe(message)).response.behavior,'deny');
});
test('trusted observer never signs a changed scope or model-supplied ALLOW field',async()=>{
  const f=fixture(),binding=f.request.permission.payload.binding;
  const observe=claudePermissionObserver({binding,publicKey:f.request.config.permissionPublicKey,signingKey:f.permissionKey.privateKey,requestHumanPermission:async exact=>({...exact,decision:'ALLOW',binding:{...binding,workspaceId:'wrong'}})});
  const message={type:'control_request',request_id:'host-request-1',request:{subtype:'can_use_tool',tool_name:'mcp__evopilot_private_input__provision_workspace_secret',tool_use_id:'tool-use-1',input:{requestId:f.request.requestId}}};
  assert.equal((await observe({...message,request:{...message.request,input:{...message.request.input,decision:'ALLOW'}}})).permission,null);
  assert.equal((await observe(message)).permission,null);
});

test('Codex control-event observer binds thread/server/schema and exact human response (synthetic channel)',async()=>{
 const {codexPermissionObserver,codexPermissionRequest}=await import('../../packages/evolution-expert/host-integration/permission-observer.mjs');
 const f=fixture(),binding=f.request.permission.payload.binding;
 const options={binding,threadId:'thread-test',serverName:'evopilot_private_input',publicKey:f.request.config.permissionPublicKey,signingKey:f.permissionKey.privateKey};
 const event={id:3,method:'mcpServer/elicitation/request',params:{threadId:options.threadId,serverName:options.serverName,...codexPermissionRequest(binding)}};
 let humanCalls=0;
 for(const change of [e=>e.params.threadId='wrong',e=>e.params.serverName='wrong',e=>e.params.message+=' changed',e=>e.params.requestedSchema.properties.password={type:'string'},e=>e.params.requestedSchema.additionalProperties=true,e=>e.id=-1,e=>e.method='tools/call']){
  const observer=codexPermissionObserver({...options,requestHumanPermission:async exact=>{humanCalls++;return {...exact,decision:'ALLOW'};}});const bad=structuredClone(event);change(bad);assert.equal((await observer(bad)).permission,null);
 }
 assert.equal(humanCalls,0);
 const projected=structuredClone(event);delete projected.params.requestedSchema.additionalProperties;
 const nativeShape=codexPermissionObserver({...options,requestHumanPermission:async exact=>({...exact,decision:'ALLOW'})});
 assert.ok((await nativeShape(projected)).permission);
 const allow=codexPermissionObserver({...options,requestHumanPermission:async exact=>({...exact,decision:'ALLOW'})});
 const result=await allow(event);assert.deepEqual(result.response,{action:'accept',content:{confirm:true}});assert.ok(result.permission.signature);assert.equal((await allow(event)).permission,null);
 for(const reply of [()=>({decision:'ALLOW'}),exact=>({...exact,threadId:'wrong',decision:'ALLOW'}),exact=>({...exact,decision:'DENY'})]){
  const observer=codexPermissionObserver({...options,requestHumanPermission:async exact=>reply(exact)});assert.equal((await observer({...event,decision:'ALLOW'})).permission,null);
 }
});
