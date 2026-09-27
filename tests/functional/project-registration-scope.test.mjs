import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from '../../packages/server/dist/index.js';
import {FileStore} from '../../packages/server/dist/storage/file-store/index.js';

test('project registration checks destination and existing project scope before repository access',{timeout:30000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'project-scope-synthetic-')),dataRoot=path.join(root,'runtime'),source=path.join(root,'source');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'README.md'),'Synthetic source, never executed.\n');
  const store=new FileStore(dataRoot),now='2026-09-26T00:00:00Z';
  for(const id of ['owner','foreign'])store.writeWorkspace({schema:'evopilot-workspace/v1',id,tenantId:id,name:id,status:'ACTIVE',members:[],quotas:{projects:20,loops:20,evidenceGb:1},createdAt:now,updatedAt:now});
  store.writeProject({id:'foreign-project',name:'Foreign',tenantId:'foreign',workspaceId:'foreign',profileId:'synthetic',createdAt:now,updatedAt:now,validation:{status:'VERIFIED',checkedAt:now,message:'synthetic fixture'}});
  const before=store.readProject('foreign-project');
  const server=createServer({dataRoot,runtimeMode:'debug',allowSampleData:false,autoRegisterProfileProject:false,tokens:[
    {name:'scoped-admin',token:'synthetic-scoped',role:'admin',platformAdmin:false,tenantId:'owner',workspaceId:'owner'},
    {name:'platform-admin',token:'synthetic-platform',role:'admin',platformAdmin:true,tenantId:'owner',workspaceId:'owner'}]});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});fs.rmSync(root,{recursive:true,force:true});});
  const post=async(body,token='synthetic-scoped')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/projects`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};};
  for(const body of [{id:'new-foreign',tenantId:'foreign',workspaceId:'foreign'},{id:'foreign-project'}]){
    const r=await post({...body,name:'Denied',repository:{provider:'local-git',root:path.join(root,'must-not-be-read')}});
    assert.equal(r.status,403);assert.match(r.body.error,/PROJECT_.*FORBIDDEN/);assert.deepEqual(store.readProject('foreign-project'),before);assert.equal(store.readProject('new-foreign'),undefined);
  }
  const valid=await post({id:'own-project',name:'Own',repository:{provider:'local-git',root:source,defaultBranch:'main'}});assert.equal(valid.status,201);assert.equal(valid.body.data.tenantId,'owner');
  for(const [id,target]of [['foreign-project','owner'],['own-project','foreign']]){
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/projects/${id}/ownership`,{method:'PATCH',headers:{authorization:'Bearer synthetic-scoped','content-type':'application/json'},body:JSON.stringify({tenantId:target,workspaceId:target})});
    assert.equal(r.status,403);assert.deepEqual(store.readProject('foreign-project'),before);assert.equal(store.readProject('own-project').tenantId,'owner');
  }
  const inspect=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/projects/foreign-project`,{headers:{authorization:'Bearer synthetic-scoped'}});assert.equal(inspect.status,403);
  const platform=await post({id:'platform-created',name:'Platform',tenantId:'foreign',workspaceId:'foreign',repository:{provider:'local-git',root:source,defaultBranch:'main'}},'synthetic-platform');assert.equal(platform.status,201);assert.equal(platform.body.data.tenantId,'foreign');
});
