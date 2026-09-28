import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {setupLocalTls,serveLocalTls,readLocalTls} from '../../packages/evolution-expert/host-integration/local-runtime.mjs';
import {privateTransport} from '../../packages/evolution-expert/host-integration/transport.mjs';
import {validateConfig,requestBinding,digest} from '../../packages/evolution-expert/host-integration/contracts.mjs';
import {provision} from '../../packages/evolution-expert/host-integration/controller.mjs';
import {fixture,signed} from '../e2e/expert-host-integration/synthetic-fixture.mjs';

async function listen(server){await new Promise(r=>server.listen(0,'127.0.0.1',r));return server.address().port;}
async function close(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
async function unusedPort(){const server=http.createServer();const port=await listen(server);await close(server);return port;}
function bind(f,setup){
 Object.assign(f.request.config,{destination:setup.destination,localTls:setup.localTls,timeoutMs:5000});
 const binding=requestBinding(f.request.config,f.request.componentDigest,f.request.requestId);
 f.request.permission=signed({schema:'evopilot-host-permission/v1',binding,decision:'ALLOW',hostPermissionObserved:true},f.permissionKey.privateKey);
 f.request.deployment=signed({schema:'evopilot-runtime-deployment-check/v1',destination:setup.destination,tenantId:f.request.config.tenantId,workspaceId:f.request.config.workspaceId,runtimeVersion:'6.3.0',nonDebugEncryption:true,loggingLevel:'info'},f.deploymentKey.privateKey);
 f.deps.collect=async()=>{f.observed.collected++;return {password:f.sentinels.password,value:f.sentinels.value,bindingDigest:digest(binding)};};
 f.deps.transport=privateTransport(f.request.config);
}
test('installation-scoped TLS: real sockets, empty child env, fixed local route and pre-input refusal',async t=>{
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'expert-local-tls-'));fs.chmodSync(root,0o700);
 const f=fixture();let counts={health:0,requests:0,posts:0};let redirect=false,lostResponse=false;
 const upstream=http.createServer(async(req,res)=>{
  if(req.url==='/health'){counts.health++;res.writeHead(200).end('{}');return;}
  counts.requests++;assert.equal(req.headers['x-evopilot-tenant'],'tenant-test');assert.equal(req.headers['x-evopilot-workspace'],'workspace-test');
  let text='';for await(const b of req)text+=b;
  if(redirect){res.writeHead(302,{location:'http://not-allowed.invalid'}).end('{}');return;}
  let data;let status=200;
  if(req.url.endsWith('/login')){assert.equal(JSON.parse(text).password,f.sentinels.password);data={token:f.sentinels.token,user:{username:'synthetic-user',tenantId:'tenant-test',workspaceId:'workspace-test',mustChangePassword:false}};}
  else {assert.equal(req.headers.authorization,`Bearer ${f.sentinels.token}`);if(req.method==='GET')data=[];else {counts.posts++;const body=JSON.parse(text);assert.equal(body.value,f.sentinels.value);status=201;data={schema:'evopilot-secret/v1',id:body.id,secretRef:body.id,tenantId:body.tenantId,workspaceId:body.workspaceId,scope:'workspace',kind:'llm-api-key',status:'ACTIVE',version:1,valueConfigured:true};}}
  if(lostResponse && req.method==='POST' && req.url==='/api/v1/secrets'){res.destroy();return;}
  res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify({data}));
 });
 const upstreamPort=await listen(upstream);let gateway;
 t.after(async()=>{if(gateway)await gateway.close();if(upstream.listening)await close(upstream);fs.rmSync(root,{recursive:true,force:true});});
 const setup=setupLocalTls(root,`http://127.0.0.1:${upstreamPort}`,await unusedPort());
 bind(f,setup);gateway=await serveLocalTls(setup.configPath);
 await t.test('no process-wide trust, explicit certificate and empty environment succeed',async()=>{
  validateConfig(f.request.config);
  const module=new URL('../../packages/evolution-expert/host-integration/transport.mjs',import.meta.url).href;
  const configPath=path.join(root,'public-client-config.json');fs.writeFileSync(configPath,JSON.stringify(f.request.config),{mode:0o600});
  const code=`import fs from 'node:fs';import {privateTransport} from ${JSON.stringify(module)};const c=JSON.parse(fs.readFileSync(process.argv[1]));await privateTransport(c).preflight();console.log('TLS_PREFLIGHT_OK');`;
  const result=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',code,configPath],{env:{},stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',status=>resolve({status,out,err}));});
  assert.deepEqual(result,{status:0,out:'TLS_PREFLIGHT_OK\n',err:''});assert.equal(counts.requests,0);
 });
 await t.test('full controller socket journey returns redacted SecretRef (synthetic permission/input, not Host acceptance)',async()=>{
  const result=await provision(f.request,f.deps);assert.equal(result.status,'SECRET_REF_CREATED');assert.equal(counts.posts,1);assert.equal(f.observed.collected,1);
  for(const value of Object.values(f.sentinels))assert.ok(!JSON.stringify(result).includes(value));
 });
 await t.test('no matching trust rejects without sending HTTP',async()=>{
  const before={...counts};const config={...f.request.config};delete config.localTls;
  await assert.rejects(privateTransport(config)({method:'GET',pathname:'/api/v1/secrets'}),/TRANSPORT_FAILED/);assert.deepEqual(counts,before);
 });
 await t.test('wrong leaf pin rejects with valid CA',async()=>{
  const before={...counts};const config=structuredClone(f.request.config);config.localTls.certificateDigest=digest('different');
  await assert.rejects(privateTransport(config).preflight(),/TRANSPORT_FAILED/);assert.deepEqual(counts,before);
 });
 await t.test('changed gateway binding rejects before upstream access even with the same certificate',async()=>{
  const before={...counts};const config=structuredClone(f.request.config);config.localTls.gatewayConfigDigest=digest('another upstream config');
  await assert.rejects(privateTransport(config).preflight(),/TRANSPORT_FAILED/);assert.deepEqual(counts,before);
 });
 await t.test('custom trust is restricted to literal loopback and configuration digest',async()=>{
  for(const destination of ['https://example.com','https://localhost:19877','https://127.0.0.2:19877','http://127.0.0.1:19876'])assert.throws(()=>validateConfig({...f.request.config,destination}));
  const tampered=structuredClone(f.request.config);tampered.localTls.certificateDigest=digest('bad');assert.throws(()=>validateConfig(tampered));
 });
 await t.test('ingress rejects other routes and methods without upstream effects',async()=>{
  const before={...counts};
  for(const [method,route]of [['DELETE','/api/v1/secrets'],['POST','/api/v1/users'],['POST','/api/v1/secrets?escape=1']]) {
   const status=await new Promise((resolve,reject)=>{const q=https.request(setup.destination+route,{method,ca:setup.localTls.certificatePem},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));});q.on('error',reject);q.end();});assert.equal(status,403);
  }assert.deepEqual(counts,before);
 });
 await t.test('redirect cannot escape local Runtime',async()=>{redirect=true;const response=await privateTransport(f.request.config)({method:'GET',pathname:'/api/v1/secrets',token:f.sentinels.token});assert.equal(response.status,502);redirect=false;});
 await t.test('installation drift prevents forwarding',async()=>{
  const bytes=fs.readFileSync(setup.configPath);const before={...counts};const c=JSON.parse(bytes);c.certificateDigest=digest('tampered');fs.writeFileSync(setup.configPath,JSON.stringify(c));
  await assert.rejects(privateTransport(f.request.config).preflight(),/TRANSPORT_FAILED/);assert.deepEqual(counts,before);fs.writeFileSync(setup.configPath,bytes);
 });
 await t.test('owner-only files and no silent certificate rotation',()=>{
  assert.throws(()=>setupLocalTls(root,`http://127.0.0.1:${upstreamPort}`,19877));
  fs.chmodSync(setup.configPath,0o644);assert.throws(()=>readLocalTls(setup.configPath));fs.chmodSync(setup.configPath,0o600);
  assert.throws(()=>setupLocalTls(root,'http://example.com',19877));
 });
 await t.test('lost creation response remains UNKNOWN with no write replay through real TLS sockets',async()=>{
  const fresh=fixture();bind(fresh,setup);const before=counts.posts;lostResponse=true;
  assert.equal((await provision(fresh.request,fresh.deps)).status,'UNKNOWN');assert.equal(counts.posts,before+1);
  assert.equal((await provision(fresh.request,fresh.deps)).status,'DUPLICATE_OR_LEDGER_UNAVAILABLE');assert.equal(counts.posts,before+1);assert.equal(fresh.observed.collected,1);lostResponse=false;
 });
 await t.test('Runtime down stops before credential collection or replay claim',async()=>{
  await close(upstream);const fresh=fixture();bind(fresh,setup);
  assert.equal((await provision(fresh.request,fresh.deps)).status,'FAILED_BEFORE_SECRET_SUBMIT');assert.equal(fresh.observed.collected,0);assert.equal(fresh.observed.claims,0);
 });
});

test('local TLS ingress preserves real Runtime authentication, RBAC, encrypted Secret and HTTP state',async t=>{
 const {createServer}=await import('../../packages/server/dist/index.js');
 const {randomBytes}=await import('node:crypto');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'expert-local-real-runtime-'));fs.chmodSync(root,0o700);
 const previous=process.env.EVOPILOT_SECRET_MASTER_KEY;process.env.EVOPILOT_SECRET_MASTER_KEY=randomBytes(32).toString('hex');
 const f=fixture();Object.assign(f.request.config,{tenantId:'tenant-production',workspaceId:'workspace-agent-products'});const server=createServer({dataRoot:path.join(root,'runtime'),runtimeMode:'prod',users:[{username:f.request.config.username,password:f.sentinels.password,role:'admin',platformAdmin:true,tenantId:'tenant-production',workspaceId:'workspace-agent-products',mustChangePassword:false},{username:'viewer-test',password:'synthetic-viewer-password',role:'viewer',platformAdmin:false,tenantId:'tenant-production',workspaceId:'workspace-agent-products',mustChangePassword:false}]});
 let gateway;
 t.after(async()=>{if(gateway)await gateway.close();if(server.listening)await close(server);if(previous===undefined)delete process.env.EVOPILOT_SECRET_MASTER_KEY;else process.env.EVOPILOT_SECRET_MASTER_KEY=previous;fs.rmSync(root,{recursive:true,force:true});});
 const port=await listen(server);const setup=setupLocalTls(root,`http://127.0.0.1:${port}`,await unusedPort());gateway=await serveLocalTls(setup.configPath);bind(f,setup);
 const result=await provision(f.request,f.deps);assert.equal(result.status,'SECRET_REF_CREATED');
 const transport=privateTransport(f.request.config);
 const login=await transport({method:'POST',pathname:'/api/v1/auth/login',body:{username:f.request.config.username,password:f.sentinels.password}});assert.equal(login.status,200);
 const headers={authorization:`Bearer ${login.data.token}`,'x-evopilot-tenant':'tenant-production','x-evopilot-workspace':'workspace-agent-products'};
 const direct=await fetch(`http://127.0.0.1:${port}/api/v1/secrets`,{headers});assert.equal(direct.status,200);
 const rows=(await direct.json()).data;assert.equal(rows.filter(r=>r.id===result.secretRef).length,1);
 assert.ok(rows.every(r=>!('value'in r)&&!('encryption'in r)));
 const viewer=await transport({method:'POST',pathname:'/api/v1/auth/login',body:{username:'viewer-test',password:'synthetic-viewer-password'}});assert.equal(viewer.status,200);
 const denied=await transport({method:'POST',pathname:'/api/v1/secrets',token:viewer.data.token,body:{id:'forbidden-secret',name:'forbidden',scope:'workspace',kind:'llm-api-key',value:'synthetic-denied'}});assert.equal(denied.status,403);
 const bad=await transport({method:'POST',pathname:'/api/v1/auth/login',body:{username:f.request.config.username,password:'incorrect-synthetic-password'}});assert.equal(bad.status,401);
 const serialized=JSON.stringify({result,rows,denied,bad});assert.ok(!serialized.includes(f.sentinels.password)&&!serialized.includes(f.sentinels.value));
 const files=[];function visit(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);if(fs.statSync(p).isDirectory())visit(p);else files.push(p);}}visit(path.join(root,'runtime'));
 assert.ok(files.length>0);for(const file of files)assert.ok(!fs.readFileSync(file).includes(Buffer.from(f.sentinels.value)),'raw provider value persisted');
});
