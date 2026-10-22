import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createComposition,loadInstalledProducts} from '../../dist/integration/composition.js';
import {getGuide} from '../../dist/expert/core/guide.js';
import {nativeBytesDigest,nativeSha256} from '../../dist/integration/compatibility/v1/native.mjs';

test('V07-E11 compiled composition routes planning only to Runtime and restores a scoped draft',async t=>{
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'evopilot-planning-composition-')),options={workspaceRoot:path.join(root,'state'),workspaceId:'planning-integration'};
 const apis=await loadInstalledProducts();let composition=createComposition(options,apis);
 t.after(()=>{composition.close();fs.rmSync(root,{recursive:true,force:true});});
 const scope={visibility:'private',projectId:'project-a'},draft={title:'Synthetic idea',objective:'Discuss only',sourceRevision:'requirements-one',sourceDigest:nativeSha256('synthetic requirements'),sources:[{id:'chat',kind:'conversation',reference:'codex-thread:synthetic',representation:'excerpt',content:'Explore a proposal',contentDigest:nativeBytesDigest('Explore a proposal'),attributedRole:'user'}],items:[{id:'question',kind:'question',text:'What should change?',disposition:'unresolved',sourceIds:['chat'],dependsOn:[],ownerImpact:['ontology'],acceptance:[]}],milestones:[],exclusions:[],candidates:[]};
 const query=(owner,operation,input={})=>composition.native(owner,{operation,scope,input});
 assert.equal((await query('runtime','planning.inspect')).revision,0);
 await assert.rejects(query('ontology','planning.inspect'),{code:'PLANNING_OWNER'});
 const created=await composition.native('runtime',{operation:'planning.revise',scope,input:{id:'plan',parentDigest:null,draft},requestId:'first',expectedRevision:0});
 composition.close();composition=createComposition(options,apis);
 const resumed=await query('runtime','planning.read',{id:'plan'});assert.equal(resumed.revision.digest,created.result.digest);assert.equal(resumed.executionAuthorized,false);assert(resumed.blockers.length);assert(resumed.readable.markdown.includes('待回答问题'));assert(resumed.readable.markdown.includes('What should change?'));assert(resumed.readable.markdown.includes('不是已接受'));assert.equal(resumed.readable.snapshot.pins.planDigest,created.result.digest);
 assert.deepEqual(await composition.native('runtime',{operation:'planning.list',scope:{...scope,projectId:'project-b'},input:{}}),[]);
 for(let i=1;i<=6;i++) {const guide=getGuide('V07-U0'+i);assert.equal(guide.authority,false);assert.equal(guide.useCase.acceptance,'NOT_INFERRED');assert(guide.operations.includes(i===5?'planning.bind':i===3?'planning.decide':'planning.read'));}
 assert.deepEqual(await query('runtime','collection.list'),[]);assert.deepEqual(await query('runtime','run.list'),[]);
});
