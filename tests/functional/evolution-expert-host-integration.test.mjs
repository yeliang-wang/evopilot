import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { install,doctor,upgrade,rollback,remove } from '../../packages/evolution-expert/host-integration/manage.mjs';
import { inventory,verifyInventory } from '../../packages/evolution-expert/host-integration/inventory.mjs';
import { digest } from '../../packages/evolution-expert/host-integration/contracts.mjs';

const source=path.resolve(import.meta.dirname,'../../packages/evolution-expert/host-integration');
function temporary(t){const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'expert-hi-functional-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function frozenFixture(root,label){const slot=path.join(root,label);fs.cpSync(source,slot,{recursive:true});fs.mkdirSync(path.join(slot,'dist/darwin-arm64'),{recursive:true});fs.writeFileSync(path.join(slot,'dist/darwin-arm64/secure-input'),'synthetic NOT executable native artifact');fs.writeFileSync(path.join(slot,'fixture-label.txt'),label);const manifest={schema:'evopilot-expert-host-integration/v1',expertVersion:'2.2.1',runtimeVersion:'6.2.0',platforms:['darwin-arm64'],files:inventory(slot)};const bytes=JSON.stringify(manifest,null,2)+'\n';fs.writeFileSync(path.join(slot,'manifest.json'),bytes);return {slot,componentDigest:digest(bytes)};}
test('isolated install, upgrade, rollback and recoverable detach preserve ledger/unrelated state (synthetic directory, not Candidate)',t=>{
  const root=temporary(t),a=frozenFixture(root,'a'),b=frozenFixture(root,'b');
  fs.writeFileSync(path.join(root,'unrelated'),'preserve');
  const installed=install(a.slot,root,a.componentDigest);
  assert.equal(doctor(installed.root).hostPermission,'NOT_OBSERVED');
  fs.writeFileSync(path.join(installed.root,'ledger','synthetic-tombstone'),'preserve',{mode:0o600});
  assert.equal(upgrade(installed.root,b.slot,b.componentDigest).componentDigest,b.componentDigest);
  assert.equal(rollback(installed.root).componentDigest,a.componentDigest);
  const detached=remove(installed.root);
  assert.ok(!fs.existsSync(installed.root));
  assert.equal(fs.readFileSync(path.join(detached.recoveryPath,'ledger','synthetic-tombstone'),'utf8'),'preserve');
  assert.equal(fs.readFileSync(path.join(root,'unrelated'),'utf8'),'preserve');
});
test('install and doctor reject tampered bytes without touching unrelated roots',t=>{
  const root=temporary(t),a=frozenFixture(root,'a');
  fs.appendFileSync(path.join(a.slot,'controller.mjs'),'\n// tampered\n');
  assert.throws(()=>install(a.slot,root,a.componentDigest));
  assert.throws(()=>remove(root));assert.throws(()=>rollback(root));
});
test('inventory rejects symlinks, added files and missing native bytes',t=>{
  const root=temporary(t),a=frozenFixture(root,'a');
  fs.symlinkSync(path.join(root,'missing'),path.join(a.slot,'escape'));
  assert.throws(()=>verifyInventory(a.slot,a.componentDigest));fs.unlinkSync(path.join(a.slot,'escape'));
  fs.unlinkSync(path.join(a.slot,'dist/darwin-arm64/secure-input'));
  assert.throws(()=>verifyInventory(a.slot,a.componentDigest));
});
test('malformed private invocation exits redacted without any UI or network',()=>{
  const result=spawnSync(process.execPath,[path.join(source,'run.mjs')],{input:'{"password":"SYNTHETIC-private-input"}',encoding:'utf8',timeout:3000,env:{}});
  assert.equal(result.status,1);assert.deepEqual(JSON.parse(result.stdout),{status:'BINDING_REJECTED'});assert.equal(result.stderr,'');
});
test('supplementary MCP discovery has no raw input fields; unbound call refuses without UI',()=>{
  const messages=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}},{jsonrpc:'2.0',id:2,method:'tools/list'},
    {jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'provision_workspace_secret',arguments:{requestId:'a'.repeat(32)}}}];
  const result=spawnSync(process.execPath,[path.join(source,'mcp.mjs')],{input:messages.map(JSON.stringify).join('\n')+'\n',encoding:'utf8',timeout:3000,env:{}});
  assert.equal(result.status,0);assert.equal(result.stderr,'');const replies=result.stdout.trim().split('\n').map(JSON.parse);
  assert.deepEqual(Object.keys(replies.find(r=>r.id===2).result.tools[0].inputSchema.properties),['requestId']);
  assert.equal(JSON.parse(replies.find(r=>r.id===3).result.content[0].text).status,'BINDING_REJECTED');
});
test('E2E definitions cover exact added Target variants, preserve pending authority',()=>{
  const corpus=JSON.parse(fs.readFileSync(new URL('../e2e/expert-host-integration/cases.json',import.meta.url)));
  const target=JSON.parse(fs.readFileSync(new URL('../../governance/targets/evopilot-evolution-expert-v2.2.1-public-cli-completion-recovery.json',import.meta.url)));
  assert.equal(corpus.targetAuthorizationDigest,target.approvals.target.authorizationDigest);
  assert.equal(corpus.status,'NOT_RUN');assert.equal(corpus.localSyntheticIsAcceptance,false);
  assert.equal(target.acceptance.length,18);assert.equal(target.inheritedAcceptance.length,365);
  assert.equal(target.realCaseCoverage.length,5);assert.equal(target.excludedHistoricalAcceptance.length,0);
  assert.deepEqual(corpus.cases.map(c=>c.id),['RC01-M3','RC02-M3','RC03-M3','RC04-M3','RC05-M3']);
  for(const c of corpus.cases){const actual=target.realCaseCoverage.flatMap(x=>x.machineVariants).find(v=>v.id===c.id);assert.deepEqual(c.covers,actual.coversAcceptanceIds);assert.ok(c.steps.length>0&&c.evidence.length>0);}
});
