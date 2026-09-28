import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createServer} from '../../packages/server/dist/index.js';
import {FileStore} from '../../packages/server/dist/storage/file-store/index.js';
import {DEFAULT_TENANT_ID,DEFAULT_WORKSPACE_ID} from '../../packages/server/dist/runtime/runtime-auth.js';

const scopes={owner:{tenantId:'tenant-a',workspaceId:'workspace-a'},sibling:{tenantId:'tenant-a',workspaceId:'workspace-b'},foreign:{tenantId:'tenant-b',workspaceId:'workspace-a'}};
const row=(id,scope,extra={})=>({id,actor:'synthetic-actor',action:'synthetic.audit',target:'synthetic-target',timestamp:`2026-09-28T00:00:${String(Number(id.replace(/\D/g,''))%60).padStart(2,'0')}.000Z`,...scope,...extra});
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evopilot-audit-scope-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return {root,store:new FileStore(root)};
}
const ids=records=>records.map(record=>record.id);
const write=(store,records,ending='\n')=>fs.writeFileSync(store.auditFile,records.map(record=>JSON.stringify(record)).join('\n')+ending);

test('audit selection filters both raw scope fields before limiting the latest authorized records',t=>{
  const {store}=fixture(t),records=[row('a1',scopes.owner),row('b1',scopes.sibling),row('c1',scopes.foreign),row('a2',scopes.owner),row('a3',scopes.owner),row('b2',scopes.sibling),row('c2',scopes.foreign)];
  write(store,records);
  for(const scope of Object.values(scopes))for(const limit of [1,2,3,20])for(const order of ['asc','desc']){
    const selected=records.filter(r=>r.tenantId===scope.tenantId&&r.workspaceId===scope.workspaceId).slice(-limit);
    assert.deepEqual(store.listAudit({scope,limit,order}),order==='desc'?[...selected].reverse():selected);
  }
  assert.deepEqual(store.listAudit({scope:scopes.owner}),records.filter(r=>r.tenantId===scopes.owner.tenantId&&r.workspaceId===scopes.owner.workspaceId));
  assert.deepEqual(store.listAudit({scope:{tenantId:'unknown',workspaceId:'unknown'},limit:1}),[]);
});

test('raw legacy and malformed scopes cannot be hydrated into default or normalized authorization',t=>{
  const {store}=fixture(t),scope={tenantId:DEFAULT_TENANT_ID,workspaceId:DEFAULT_WORKSPACE_ID};
  const valid=row('valid1',scope),malformed=[row('missing-both'),row('missing-tenant',{workspaceId:scope.workspaceId}),row('missing-workspace',{tenantId:scope.tenantId}),
    ...[null,42,true,'',' ',scope.tenantId.replace('-','/'),scope.tenantId+' '].map((tenantId,i)=>row('invalid-tenant'+i,{tenantId,workspaceId:scope.workspaceId})),
    ...[null,42,true,'',' ',scope.workspaceId.replace('-','/'),scope.workspaceId+' '].map((workspaceId,i)=>row('invalid-workspace'+i,{tenantId:scope.tenantId,workspaceId}))];
  write(store,[valid,...malformed]);
  assert.deepEqual(store.listAudit({scope,limit:2}),[valid]);
  for(const bad of [{tenantId:'',workspaceId:scope.workspaceId},{tenantId:42,workspaceId:scope.workspaceId},{tenantId:scope.tenantId,workspaceId:'workspace/default'}])assert.deepEqual(store.listAudit({scope:bad}),[]);
  assert.equal(store.listAudit().length,malformed.length+1,'internal/global reads preserve legacy record visibility');
});

test('scoped reverse audit reads cross large foreign tails and UTF-8/line chunk boundaries',t=>{
  const {store}=fixture(t);
  const first=row('owner1',scopes.owner,{metadata:{text:'边界🙂'.repeat(25000)}}),last=row('owner2',scopes.owner,{metadata:{text:'完整中文🙂'}});
  const foreign=Array.from({length:1600},(_,i)=>row('foreign'+i,scopes.foreign,{metadata:{padding:'x'.repeat(80)}}));
  fs.writeFileSync(store.auditFile,JSON.stringify(first)+'\r\n\n'+foreign.map(x=>JSON.stringify(x)).join('\n')+'\n'+JSON.stringify(last));
  assert.deepEqual(store.listAudit({scope:scopes.owner,limit:2}),[first,last]);
  assert.deepEqual(store.listAudit({scope:scopes.owner,limit:2,order:'desc'}),[last,first]);
});

test('limited audit reads avoid full-file allocation and stop after enough authorized rows',t=>{
  const {store}=fixture(t);
  const foreign=Array.from({length:2000},(_,i)=>row('foreign'+i,scopes.foreign,{metadata:{padding:'x'.repeat(100)}}));
  write(store,[...foreign,row('owner1',scopes.owner),row('owner2',scopes.owner)]);
  const originalRead=fs.readSync,originalReadFile=fs.readFileSync;let bytesRead=0;
  try{
    fs.readFileSync=function(file,...args){assert.notEqual(file,store.auditFile,'limited read cannot load the entire audit log');return originalReadFile.call(this,file,...args);};
    fs.readSync=function(...args){const count=originalRead.apply(this,args);bytesRead+=count;return count;};
    assert.deepEqual(ids(store.listAudit({scope:scopes.owner,limit:1})),['owner2']);
    assert.equal(bytesRead,64*1024);
    assert.ok(bytesRead<fs.statSync(store.auditFile).size);
  }finally{fs.readSync=originalRead;fs.readFileSync=originalReadFile;}
});

test('audit scope reads preserve bytes and return stable results after storage restart',t=>{
  const {root,store}=fixture(t),records=[row('a1',scopes.owner),row('b1',scopes.foreign),row('a2',scopes.owner)];write(store,records);
  const before=fs.readFileSync(store.auditFile),expected=store.listAudit({scope:scopes.owner,limit:2,order:'desc'});
  for(let i=0;i<3;i++)assert.deepEqual(new FileStore(root).listAudit({scope:scopes.owner,limit:2,order:'desc'}),expected);
  assert.deepEqual(fs.readFileSync(store.auditFile),before);
});

test('audit and history enforce authenticated scope, preserve explicit platform access and reject spoofing',{timeout:30000},async t=>{
  const {root,store}=fixture(t);
  const records=[row('a1',scopes.owner),row('b1',scopes.sibling),row('c1',scopes.foreign),row('a2',scopes.owner),row('b2',scopes.sibling),row('c2',scopes.foreign),row('legacy1')];
  write(store,records);const before=fs.readFileSync(store.auditFile);
  const tokens=[...['admin','operator','viewer'].map(role=>({name:'owner-'+role,token:'synthetic-owner-'+role,role,platformAdmin:false,...scopes.owner})),
    {name:'sibling',token:'synthetic-sibling',role:'admin',platformAdmin:false,...scopes.sibling},
    {name:'foreign',token:'synthetic-foreign',role:'admin',platformAdmin:false,...scopes.foreign},
    {name:'platform',token:'synthetic-platform',role:'admin',platformAdmin:true,...scopes.owner},
    {name:'legacy-platform',token:'synthetic-legacy-platform',role:'admin',...scopes.owner},
    {name:'empty',token:'synthetic-empty',role:'viewer',platformAdmin:false,tenantId:'empty',workspaceId:'empty'},
    {name:'default',token:'synthetic-default',role:'viewer',platformAdmin:false,tenantId:DEFAULT_TENANT_ID,workspaceId:DEFAULT_WORKSPACE_ID}];
  const start=async()=>{const server=createServer({dataRoot:root,runtimeMode:'debug',allowSampleData:false,autoRegisterProfileProject:false,tokens});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server;};
  const stop=server=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
  let server=await start();t.after(()=>stop(server));
  const get=async(route,token,headers={})=>{const res=await fetch(`http://127.0.0.1:${server.address().port}${route}`,{headers:{authorization:'Bearer '+token,...headers}});return{status:res.status,body:await res.json()};};
  for(const token of tokens){
    const platform=token.platformAdmin===true||token.name==='legacy-platform';
    const expected=records.filter(r=>platform||(r.tenantId===token.tenantId&&r.workspaceId===token.workspaceId));
    for(const order of ['asc','desc'])for(const limit of [1,2,20]){
      const res=await get(`/api/v1/audit?limit=${limit}&order=${order}`,token.token);assert.equal(res.status,200);
      const selection=expected.slice(-limit);assert.deepEqual(ids(res.body.data),ids(order==='desc'?[...selection].reverse():selection),token.name);
    }
    const spoofed=await get('/api/v1/audit?tenantId=tenant-b&workspaceId=workspace-a&platformAdmin=true',token.token,{'x-evopilot-tenant':'tenant-b','x-evopilot-workspace':'workspace-a'});
    assert.equal(spoofed.status,200);assert.deepEqual(ids(spoofed.body.data),ids(expected),token.name+' spoofed scope');
    const history=await get('/api/v1/history?limit=200',token.token);assert.equal(history.status,200);
    const historyIds=history.body.data.entries.filter(r=>r.type==='audit').map(r=>r.source.auditId).sort();assert.deepEqual(historyIds,ids(expected).sort(),token.name+' history');
  }
  for(const query of ['limit=0','limit=-1','limit=1.5','order=sideways'])assert.equal((await get('/api/v1/audit?'+query,'synthetic-owner-viewer')).status,400);
  assert.equal((await get('/api/v1/audit','invalid')).status,401);
  assert.deepEqual(fs.readFileSync(store.auditFile),before);
  const expected=await get('/api/v1/audit?limit=2&order=desc','synthetic-owner-viewer');
  await stop(server);server=await start();
  const actual=await get('/api/v1/audit?limit=2&order=desc','synthetic-owner-viewer');assert.deepEqual(actual.body.data,expected.body.data);
  assert.deepEqual(fs.readFileSync(store.auditFile),before);
});

test('audit returns an empty list when no audit history exists',t=>{
  const {store}=fixture(t);assert.deepEqual(store.listAudit({scope:scopes.owner,limit:1}),[]);
});
