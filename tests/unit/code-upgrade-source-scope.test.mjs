import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {CodeUpgraderClient} from '../../packages/adapter-code-upgrader/dist/index.js';
import {exactSourceFiles,parseSourceScopeInput,assertSourceFilesOnDisk,assertSourceFilesPolicy,sourceScopeDigest,sourceScopeTextDigest,approveSourceScope,resolveSourceScope,validateSourceScopeResult} from '../../packages/server/dist/application/code-upgrade-source-scope.js';

const input=()=>({schema:'evopilot-code-upgrade-source-scope/v1',expectedReviewDigest:'sha256:'+'0'.repeat(64),sourceCommit:'a'.repeat(40),proposalDigest:sourceScopeTextDigest('proposal'),files:['docs/release.md','src/new.ts','README.md']});
const context=()=>{const review={id:'review',projectId:'p',planId:'plan',status:'USER_CONFIRM_REQUIRED',decisions:[]},plan={id:'plan',projectId:'p'},project={id:'p',tenantId:'t',workspaceId:'w',validation:{status:'VERIFIED'},repository:{provider:'local-git',root:'/tmp/scoped-source',defaultBranch:'main'}};return {review,plan,project,auth:{actor:'operator',tenantId:'t',workspaceId:'w',role:'operator'},profile:{policy:{protectedPaths:['secrets/**','domains/**','production.yaml']}}};};
function accepted(){const c=context(),i=input();i.expectedReviewDigest=sourceScopeDigest(c.review);const approval=approveSourceScope({...c,input:parseSourceScopeInput(i),sourceCommit:i.sourceCommit,decidedAt:'2026-10-03T00:00:00Z'});c.review={...c.review,status:'USER_CONFIRMED',decisions:[{action:'accept',codeUpgradeSourceScope:approval}]};return {...c,approvalDigest:approval.approvalDigest,proposalMarkdown:'proposal',sourceCommit:i.sourceCommit,approval};}

test('exact reviewed files retain docs/config names without directory expansion',()=>{
  assert.deepEqual(exactSourceFiles(['package-lock.json','docs/release.md','README.md','charts/chart.yaml']),['README.md','charts/chart.yaml','docs/release.md','package-lock.json']);
  for(const files of [[],{},[null],[1],['same','same'],Array.from({length:257},(_,i)=>'f'+i),['x'.repeat(1025)],['a','a/b']])assert.throws(()=>exactSourceFiles(files),/FILES_INVALID/);
  for(const name of ['/a','C:/a','\\host\\share','./a','a/../b','a//b','a/',' a','a\n','a\0','a/*','a/[x]','a/{x}','.git/config','.GiT/config','a/.git/config','node_modules/a','a/DiSt/file'])assert.throws(()=>exactSourceFiles([name]),/FILES_INVALID/,name);
  assert.throws(()=>parseSourceScopeInput({...input(),extra:true}),/INPUT_INVALID/);
});
test('protected policy retains directory glob and exact file semantics',()=>{
  const profile=context().profile;
  for(const file of ['secrets/key.txt','domains/app/source.ts','production.yaml','SeCrEtS/key.txt'])assert.throws(()=>assertSourceFilesPolicy([file],profile),/PROTECTED_PATH/);
  assert.doesNotThrow(()=>assertSourceFilesPolicy(['docs/release.md'],profile));
});
test('source file observation rejects directories and final or parent symlinks',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'scope-files-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'docs'));fs.writeFileSync(path.join(root,'docs/file.md'),'file');fs.symlinkSync('docs',path.join(root,'alias'));fs.symlinkSync('file.md',path.join(root,'docs/link'));
  assert.doesNotThrow(()=>assertSourceFilesOnDisk(root,['docs/file.md','docs/new.md']));
  for(const name of ['docs','alias/file.md','docs/link'])assert.throws(()=>assertSourceFilesOnDisk(root,[name]),/FILE_TYPE_INVALID/);
});
test('approval belongs to the latest owning review, exact proposal and observed base',()=>{
  const c=accepted();assert.equal(resolveSourceScope(c).approvalDigest,c.approvalDigest);
  for(const patch of [{proposalMarkdown:'changed'},{sourceCommit:'b'.repeat(40)},{auth:{...c.auth,workspaceId:'foreign'}},{project:{...c.project,repository:{...c.project.repository,root:'/elsewhere'}}},{plan:{...c.plan,newFact:1}},{review:{...c.review,status:'REJECTED'}},{review:{...c.review,decisions:[...c.review.decisions,{action:'accept'}]}}])assert.throws(()=>resolveSourceScope({...c,...patch}),/CODE_UPGRADE_SCOPE_/);
  const altered=structuredClone(c);altered.review.decisions[0].codeUpgradeSourceScope.files.push('unapproved');assert.throws(()=>resolveSourceScope(altered),/APPROVAL_INVALID/);
  assert.throws(()=>resolveSourceScope({...c,profile:{policy:{protectedPaths:['docs/**']}}}),/PROTECTED_PATH/);
  const before=context();assert.throws(()=>approveSourceScope({...before,input:input(),sourceCommit:'a'.repeat(40),decidedAt:'now'}),/REVIEW_STALE/);
});
test('terminal scope validates raw nonempty actual files without coercion or prefix matching',()=>{
  const {approval}=accepted();assert.doesNotThrow(()=>validateSourceScopeResult(approval,['docs/release.md']));
  for(const names of [undefined,[],['docs/release.md','docs/release.md'],[123],['src/new.ts/child'],['unapproved.ts']])assert.throws(()=>validateSourceScopeResult(approval,names),/CODE_UPGRADE_SCOPE_/);
});
test('explicit managed transport never falls back after missing endpoint, preserving legacy selection',async()=>{
  const calls=[];const client=new CodeUpgraderClient({id:'default',name:'fixture',baseUrl:'http://fixture'},async(url)=>{calls.push(url);return new Response('{}',{status:404});});
  const request={projectId:'p',branchStrategy:{sourceBranch:'main',upgradeBranch:'upgrade'},proposalMarkdown:'p',validationCommands:[],managedOnly:true};
  await assert.rejects(client.startCodeUpgrade(request));assert.equal(calls.length,1);assert.match(calls[0],/api\/v1\/conversations$/);
  calls.length=0;await assert.rejects(client.readCodeUpgradeSnapshot('id',true));assert.equal(calls.length,1);
  const response=new CodeUpgraderClient({id:'default',name:'fixture',baseUrl:'http://fixture'},async()=>Response.json({status:'SUCCEEDED',changedFiles:[123]}));
  assert.deepEqual((await response.readCodeUpgradeSnapshot('id',true)).changedFiles,[123]);
  assert.deepEqual((await response.readCodeUpgradeSnapshot('id')).changedFiles,['123']);
});
