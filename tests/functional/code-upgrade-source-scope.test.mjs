import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {createServer} from '../../packages/server/dist/index.js';
import {FileStore} from '../../packages/server/dist/storage/file-store/index.js';
import {DEFAULT_TENANT_ID,DEFAULT_WORKSPACE_ID} from '../../packages/server/dist/runtime/runtime-auth.js';
import {sourceScopeDigest,sourceScopeTextDigest} from '../../packages/server/dist/application/code-upgrade-source-scope.js';

// Isolated protocol tests: the provider is deliberately synthetic; no real upgrade claim.
async function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'scope-http-')),repo=path.join(root,'repo'),dataRoot=path.join(root,'data');fs.mkdirSync(repo);
  const git=(...args)=>execFileSync('/usr/bin/git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-b','main');git('config','user.name','Scope Test');git('config','user.email','scope@example.test');
  fs.mkdirSync(path.join(repo,'docs'));fs.mkdirSync(path.join(repo,'src'));fs.writeFileSync(path.join(repo,'README.md'),'base');fs.writeFileSync(path.join(repo,'docs/release.md'),'base');fs.writeFileSync(path.join(repo,'src/main.ts'),'export {};');git('add','.');git('commit','-m','base');
  const base=git('rev-parse','HEAD'),state={requests:[],changedFiles:['docs/release.md'],startStatus:'RUNNING',snapshotStatus:'SUCCEEDED',capable:true,startAck:true,snapshotAck:true};
  const provider=http.createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;
    if(req.url==='/health'){res.end(JSON.stringify({capabilities:state.capable?['evopilot-code-upgrade-source-binding/v1']:[]}));return;}
    if(req.method==='POST'){const request=JSON.parse(text);state.requests.push(request);res.end(JSON.stringify({conversationId:'fixture',status:state.startStatus,...(state.startAck?{sourceScopeBinding:request.sourceScopeBinding}:{})}));}
    else res.end(JSON.stringify({conversationId:'fixture',status:state.snapshotStatus,events:[],changedFiles:state.changedFiles,commitSha:base,branchName:'upgrade',diff:'synthetic protocol fixture',...(state.snapshotAck?{sourceScopeBinding:state.requests.at(-1)?.sourceScopeBinding}:{})}));});
  await new Promise(r=>provider.listen(0,'127.0.0.1',r));
  const scope={tenantId:DEFAULT_TENANT_ID,workspaceId:DEFAULT_WORKSPACE_ID},tokens=['viewer','operator','admin'].map(role=>({name:'scope-'+role,token:role,role,platformAdmin:role==='admin',...scope}));tokens.push({name:'foreign-admin',token:'foreign',role:'admin',platformAdmin:false,tenantId:'foreign',workspaceId:scope.workspaceId},{name:'sibling-admin',token:'sibling',role:'admin',platformAdmin:false,tenantId:scope.tenantId,workspaceId:'sibling'});
  const server=createServer({dataRoot,runtimeMode:'debug',tokens});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{await new Promise(r=>server.close(r));await new Promise(r=>provider.close(r));fs.rmSync(root,{recursive:true,force:true});});
  const call=async(method,p,body,token='admin',headers={})=>{const r=await fetch(url+p,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
  const project=await call('POST','/api/v1/projects',{id:'scope-project',name:'Scope fixture',repository:{provider:'local-git',root:repo,defaultBranch:'main'}});assert.equal(project.status,201,JSON.stringify(project));
  assert.equal((await call('POST','/api/v1/connectors/code-upgrader',{id:'default',baseUrl:'http://127.0.0.1:'+provider.address().port})).status,201);
  const response=await call('POST','/api/v1/runs',{projectId:'scope-project',now:'2026-10-03T00:00:00.000Z',events:[{id:'e',type:'mcp.call',source:'mcp',timestamp:'2026-10-03T00:00:00.000Z',severity:'MEDIUM',message:'observed slow operation',attributes:{durationMs:3500}}],files:['src/main.ts']},'operator');assert.equal(response.status,201,JSON.stringify(response));
  const run=response.body.data,review=run.reviews[0],delivery=run.deliveryPlans[0],proposal='# Exact reviewed maintenance fixture';
  const scopeInput={schema:'evopilot-code-upgrade-source-scope/v1',expectedReviewDigest:sourceScopeDigest(review),sourceCommit:base,proposalDigest:sourceScopeTextDigest(proposal),files:['docs/release.md','README.md','src/new.ts']};
  const reviewPath='/api/v1/reviews/'+review.id+'/decision',upgradePath='/api/v1/deliveries/'+delivery.id+'/code-upgrade';
  const approve=async(extra={})=>call('POST',reviewPath,{action:'accept',actor:'untrusted-display-actor',codeUpgradeSourceScope:{...scopeInput,...extra}},'operator');
  const upgrade=async(approval,extra={},token='admin')=>call('POST',upgradePath,{sourceScopeApprovalDigest:approval.approvalDigest,proposalMarkdown:proposal,sourceBranch:'main',upgradeBranch:'upgrade',validationCommands:['npm test'],...extra},token);
  return {root,repo,dataRoot,store:new FileStore(dataRoot),git,base,state,scope,run,review,delivery,proposal,scopeInput,reviewPath,upgradePath,call,approve,upgrade};
}

test('existing review binds exact docs and source files; managed request has no inferred roots',async t=>{
  const f=await fixture(t),r=await f.approve();assert.equal(r.status,200,JSON.stringify(r));const approved=r.body.data.decisions.at(-1).codeUpgradeSourceScope;assert.equal(approved.approvedBy,'scope-operator');assert.equal(approved.sourceCommit,f.base);
  const response=await f.upgrade(approved);assert.equal(response.status,202,JSON.stringify(response));assert.equal(response.body.data.codeUpgradeRun.status,'SUCCEEDED');assert.deepEqual(f.state.requests[0].allowedPaths,[...f.scopeInput.files].sort());assert.equal(f.state.requests.length,1);assert.equal(response.body.data.codeUpgradeRun.sourceScope.approvalDigest,approved.approvalDigest);
  const audit=f.store.listAudit();assert.ok(audit.some(x=>x.action==='review.decided'&&x.metadata.sourceScopeApprovalDigest===approved.approvalDigest));
});
test('role and project scope reject scoped and legacy review/upgrade before provider calls',async t=>{
  const f=await fixture(t);
  for(const token of ['viewer','foreign','sibling'])assert.equal((await f.call('POST',f.reviewPath,{action:'accept',codeUpgradeSourceScope:f.scopeInput},token)).status,403);
  for(const token of ['foreign','sibling'])assert.equal((await f.call('POST',f.reviewPath,{action:'accept'},token)).status,403);
  const r=await f.approve(),approved=r.body.data.decisions.at(-1).codeUpgradeSourceScope;
  for(const token of ['viewer','operator','foreign','sibling'])assert.equal((await f.upgrade(approved,{},token)).status,403);
  for(const token of ['foreign','sibling'])assert.equal((await f.call('POST',f.upgradePath,{proposalMarkdown:f.proposal},token)).status,403);
  assert.equal(f.state.requests.length,0);
});
test('invalid, protected, directory and symlink scopes do not create approvals',async t=>{
  const f=await fixture(t);fs.symlinkSync('README.md',path.join(f.repo,'link'));f.git('add','link');f.git('commit','-m','link');const sourceCommit=f.git('rev-parse','HEAD');
  for(const files of [['secrets/key'],['domains/source.ts'],['production.yaml'],['docs'],['link'],['.GiT/config'],['docs/*'],['README.md','README.md']]){
    const r=await f.approve({files,sourceCommit});assert.ok([400,409].includes(r.status),JSON.stringify(r));
  }
  assert.equal(f.store.findRunByReviewId(f.review.id).reviews[0].decisions.length,0);assert.equal(f.state.requests.length,0);
});
test('scope requires its own latest accepted decision and exact proposal',async t=>{
  const f=await fixture(t);await f.call('POST',f.reviewPath,{action:'accept'},'operator');assert.equal((await f.upgrade({approvalDigest:'sha256:'+'a'.repeat(64)})).status,409);
  const current=f.store.findRunByReviewId(f.review.id).reviews[0],r=await f.approve({expectedReviewDigest:sourceScopeDigest(current)}),approved=r.body.data.decisions.at(-1).codeUpgradeSourceScope;
  assert.equal((await f.upgrade(approved,{proposalMarkdown:'different'})).status,409);
  await f.call('POST',f.reviewPath,{action:'request-changes'},'operator');assert.equal((await f.upgrade(approved)).status,409);assert.equal(f.state.requests.length,0);
});
test('changed source, dirty source and stale review digest reject before managed dispatch',async t=>{
  const f=await fixture(t),r=await f.approve(),approved=r.body.data.decisions.at(-1).codeUpgradeSourceScope;
  assert.equal((await f.approve()).status,409);
  fs.appendFileSync(path.join(f.repo,'README.md'),'dirty');assert.equal((await f.upgrade(approved)).status,409);assert.equal(f.state.requests.length,0);
  f.git('add','.');f.git('commit','-m','advanced');const result=await f.upgrade(approved);assert.equal(result.status,409);assert.equal(result.body.error,'CODE_UPGRADE_SCOPE_SOURCE_STALE');assert.equal(f.state.requests.length,0);
});
test('provider terminal results cannot escape exact files or coerce non-string evidence',async t=>{
  const f=await fixture(t),r=await f.approve(),approved=r.body.data.decisions.at(-1).codeUpgradeSourceScope;
  f.state.changedFiles=['docs/release.md/child'];const out=await f.upgrade(approved);assert.equal(out.status,202,JSON.stringify(out));assert.equal(out.body.data.codeUpgradeRun.status,'FAILED');assert.match(out.body.data.codeUpgradeRun.failureReason,/RESULT_OUTSIDE_SCOPE/);
  f.state.changedFiles=[123];const malformed=await f.upgrade(approved);assert.equal(malformed.body.data.codeUpgradeRun.status,'FAILED');assert.match(malformed.body.data.codeUpgradeRun.failureReason,/FILES_INVALID/);
});
test('initial terminal managed status still requires validated actual snapshot',async t=>{
  const f=await fixture(t),r=await f.approve(),approved=r.body.data.decisions.at(-1).codeUpgradeSourceScope;f.state.startStatus='SUCCEEDED';f.state.changedFiles=[];
  const result=await f.upgrade(approved);assert.equal(result.status,202,JSON.stringify(result));assert.equal(result.body.data.codeUpgradeRun.status,'FAILED');
});
test('bearer principal owns approval even with a forged actor header',async t=>{
  const f=await fixture(t),r=await f.call('POST',f.reviewPath,{action:'accept',codeUpgradeSourceScope:f.scopeInput},'operator',{'x-evopilot-actor':'forged-owner'});
  assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.data.decisions.at(-1).actor,'scope-operator');assert.equal(r.body.data.decisions.at(-1).codeUpgradeSourceScope.approvedBy,'scope-operator');
});
test('unsupported scope capability blocks before provider POST',async t=>{
  const f=await fixture(t),r=await f.approve(),approved=r.body.data.decisions.at(-1).codeUpgradeSourceScope;f.state.capable=false;
  const result=await f.upgrade(approved);assert.equal(result.status,409,JSON.stringify(result));assert.equal(result.body.error,'CODE_UPGRADE_SCOPE_PROVIDER_CAPABILITY_REQUIRED');assert.equal(f.state.requests.length,0);
});
test('missing start or snapshot binding retains conversation and uncertain failure',async t=>{
  const f=await fixture(t),r=await f.approve(),approved=r.body.data.decisions.at(-1).codeUpgradeSourceScope;f.state.startAck=false;
  const start=await f.upgrade(approved);assert.equal(start.status,202,JSON.stringify(start));assert.equal(start.body.data.codeUpgradeRun.status,'FAILED');assert.equal(start.body.data.codeUpgradeRun.codeUpgrader.conversationId,'fixture');assert.equal(start.body.data.codeUpgradeRun.sourceScopeAcknowledgement.effectsUncertain,true);
  f.state.startAck=true;f.state.snapshotAck=false;const snapshot=await f.upgrade(approved);assert.equal(snapshot.body.data.codeUpgradeRun.status,'FAILED');assert.equal(snapshot.body.data.codeUpgradeRun.sourceScopeAcknowledgement.effectsUncertain,true);
});
test('omitting exact scope preserves ordinary inferred managed request behavior',async t=>{
  const f=await fixture(t);await f.call('POST',f.reviewPath,{action:'accept'},'operator');const result=await f.call('POST',f.upgradePath,{proposalMarkdown:f.proposal,validationCommands:['npm test']});assert.equal(result.status,202,JSON.stringify(result));assert.ok(f.state.requests[0].allowedPaths.includes('src'));assert.ok(f.state.requests[0].allowedPaths.includes('docs/evopilot-upgrades'));assert.equal(result.body.data.codeUpgradeRun.sourceScope,undefined);
});
