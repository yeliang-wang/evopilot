import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {projectOperation} from '../../dist/integration/workspace/project.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
function fixture() {
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'evopilot-project-')));
  const context={projectRoot:path.join(base,'project'),stateRoot:path.join(base,'state'),installationRoot:path.join(base,'install'),workspaceId:'synthetic-project'};
  for(const root of Object.values(context).slice(0,3)) fs.mkdirSync(root,{mode:0o700});
  fs.writeFileSync(path.join(context.projectRoot,'workspace-project.json'),JSON.stringify({schema:'evopilot-workspace-project/v1',id:context.workspaceId}),{mode:0o600});
  const sourceRoot=path.join(base,'source');fs.mkdirSync(sourceRoot,{mode:0o700});
  fs.writeFileSync(path.join(sourceRoot,'requirements.md'),'Synthetic requirements one',{mode:0o600});
  const run=(op,input,id='test-request')=>projectOperation(context,op,input,id);
  const input={projectId:'sample',sourceRoot,files:['requirements.md']};
  return {base,context,sourceRoot,run,input,cleanup:()=>fs.rmSync(base,{recursive:true,force:true})};
}
test('V02-A06/B06: readonly requirements binding, drift, exact reviewed baseline and retained history',async()=>{
  const f=fixture();try {
    const before=fs.readFileSync(path.join(f.sourceRoot,'requirements.md'));
    const initial=(await f.run('bind',f.input)).record;
    assert.deepEqual(fs.readFileSync(path.join(f.sourceRoot,'requirements.md')),before);
    assert.equal((await f.run('drift',{projectId:'sample'})).status,'ALIGNED');
    fs.writeFileSync(path.join(f.sourceRoot,'requirements.md'),'Synthetic requirements two');
    const drift=await f.run('drift',{projectId:'sample'});
    assert.equal(drift.status,'REVIEW_REQUIRED');assert.deepEqual(drift.changed,['requirements.md']);
    assert.equal((await f.run('inspect',{projectId:'sample'})).record.baseline.digest,initial.baseline.digest);
    const review={projectId:'sample',previousDigest:initial.baseline.digest,newDigest:drift.current.digest,reviewReason:'Explicit synthetic source-change review'};
    await assert.rejects(()=>f.run('baseline.accept',{...review,newDigest:'0'.repeat(64)},'wrong'),{code:'PROJECT_SOURCE_CHANGED'});
    assert.equal((await f.run('baseline.accept',review,'accept-two')).record.baseline.digest,drift.current.digest);
    assert.equal((await f.run('baseline.accept',review,'accept-two')).reused,true);
    assert.equal((await f.run('drift',{projectId:'sample'})).status,'ALIGNED');
    await assert.rejects(()=>f.run('baseline.accept',review,'stale-review'),{code:'PROJECT_CONFLICT'});
    const retained=JSON.parse(fs.readFileSync(path.join(f.context.projectRoot,'private/projects/sample/project.json')));
    assert.deepEqual(retained,initial);
    await assert.rejects(()=>f.run('bind',{...f.input,projectId:'../escape'}),{code:'PROJECT_ID'});
    await assert.rejects(()=>f.run('bind',{...f.input,files:['../requirements.md']}),{code:'PROJECT_PATH'});
  }finally{f.cleanup();}
});
test('V02-B07: private Goal/Target/Loop ledger requires exact scoped evidence and cannot complete a stale source',async()=>{
  const f=fixture();try{
    const baseline=(await f.run('bind',f.input)).record.baseline;
    const evidencePath='private/projects/sample/evidence.json', evidence=Buffer.from('{"synthetic":true,"status":"PASS"}');
    fs.writeFileSync(path.join(f.context.projectRoot,evidencePath),evidence,{mode:0o600});
    const campaign={projectId:'sample',id:'first-target',goal:'Verify synthetic project',sourceDigest:baseline.digest,
      criteria:[{id:'delivery',status:'PASS',evidence:[{root:'project',path:evidencePath,sha256:hash(evidence)}]}],
      loops:[{id:'loop-one',observation:'Initial synthetic scope',action:'Run independent evidence check',result:'PASS'}],status:'COMPLETE'};
    assert.equal((await f.run('campaign.write',campaign,'loop-one')).campaign.status,'COMPLETE');
    assert.equal((await f.run('campaign.inspect',{projectId:'sample',id:'first-target'})).revisions.length,1);
    assert.equal((await f.run('campaign.write',campaign,'loop-one')).authority,false);
    await assert.rejects(()=>f.run('campaign.write',{...campaign,criteria:[{...campaign.criteria[0],evidence:[]}]}),{code:'CAMPAIGN_EVIDENCE_REQUIRED'});
    await assert.rejects(()=>f.run('campaign.write',{...campaign,criteria:[{...campaign.criteria[0],status:'UNKNOWN'}]}),{code:'CAMPAIGN_INCOMPLETE'});
    await assert.rejects(()=>f.run('campaign.write',{...campaign,loops:[{id:'wrong'}]}),{code:'PROJECT_SCHEMA'});
    for (const root of ['project','state']) {
      const rootPath=f.context[root==='project'?'projectRoot':'stateRoot'];
      for (const relative of ['private/projects/other/evidence.json','state/runtime/runtime.db','workspace.json','private/projects/sample/.project-control/lease.db','private/projects/sample/raw.db']) {
        const changed={...campaign,criteria:[{...campaign.criteria[0],evidence:[{root,path:relative,sha256:hash(evidence)}]}]};
        await assert.rejects(()=>f.run('campaign.write',changed,'wrong-scope'),{code:'CAMPAIGN_EVIDENCE_SCOPE'});
      }
      fs.mkdirSync(path.join(rootPath,'public'),{mode:0o700}); fs.writeFileSync(path.join(rootPath,'public/shared.json'),evidence,{mode:0o600});
      const shared={...campaign,criteria:[{...campaign.criteria[0],evidence:[{root,path:'public/shared.json',sha256:hash(evidence)}]}]};
      assert.equal((await f.run('campaign.write',shared,'shared-'+root)).campaign.status,'COMPLETE');
    }
    fs.writeFileSync(path.join(f.sourceRoot,'requirements.md'),'Changed after review');
    await assert.rejects(()=>f.run('campaign.write',campaign,'stale-source'),{code:'PROJECT_SOURCE_CHANGED'});
    fs.writeFileSync(path.join(f.context.projectRoot,evidencePath),'tampered');
    await assert.rejects(()=>f.run('campaign.write',{...campaign,status:'IN_PROGRESS'}),{code:'CAMPAIGN_EVIDENCE_CHANGED'});
    assert(!fs.existsSync(path.join(f.context.installationRoot,'governance')));
  }finally{f.cleanup();}
});
test('reviewed source reverts A→B→A→C retain an unambiguous immutable event chain',async()=>{
  const f=fixture();try {
    const initial=(await f.run('bind',f.input)).record;
    const originalBytes=fs.readFileSync(path.join(f.context.projectRoot,'private/projects/sample/project.json'));
    for (const [id,content] of [['to-b','Synthetic requirements two'],['revert-a','Synthetic requirements one'],['to-c','Synthetic requirements three']]) {
      fs.writeFileSync(path.join(f.sourceRoot,'requirements.md'),content);
      const drift=await f.run('drift',{projectId:'sample'});
      const changed=await f.run('baseline.accept',{projectId:'sample',previousDigest:drift.baselineDigest,newDigest:drift.current.digest,reviewReason:'Review '+id},id);
      assert.equal((await f.run('inspect',{projectId:'sample'})).record.baseline.digest,changed.record.baseline.digest);
      if(id==='revert-a')assert.equal(changed.record.baseline.digest,initial.baseline.digest);
    }
    const history=path.join(f.context.projectRoot,'private/projects/sample/baselines');
    assert.equal(fs.readdirSync(history).length,3);
    assert.deepEqual(fs.readFileSync(path.join(f.context.projectRoot,'private/projects/sample/project.json')),originalBytes);
    assert.equal((await f.run('drift',{projectId:'sample'})).status,'ALIGNED');
  }finally{f.cleanup();}
});
test('killed baseline writer releases OS lock and staged partial write cannot corrupt history', {timeout:20000},async t=>{
  const f=fixture();t.after(f.cleanup);
  const initial=(await f.run('bind',f.input)).record;
  fs.writeFileSync(path.join(f.sourceRoot,'requirements.md'),'Synthetic requirements two');
  const drift=await f.run('drift',{projectId:'sample'});
  const review={projectId:'sample',previousDigest:initial.baseline.digest,newDigest:drift.current.digest,reviewReason:'Review interrupted write'};
  const filename=path.join(f.context.projectRoot,'private/projects/sample/baselines/killed.json');
  const script=`import fs from 'node:fs';import {projectOperation} from ${JSON.stringify(new URL('../../dist/integration/workspace/project.js',import.meta.url).href)};
    const rename=fs.renameSync;fs.renameSync=function(from,to){if(to===${JSON.stringify(filename)}){fs.writeSync(1,'STAGED\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}return rename.call(this,from,to);};
    await projectOperation(${JSON.stringify(f.context)},'baseline.accept',${JSON.stringify(review)},'killed');`;
  const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  let stderr='';child.stderr.on('data',bytes=>stderr+=bytes);
  const signal=await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Writer exited before stage: '+stderr);})]);
  assert.match(signal[0].toString(),/STAGED/);
  const exited=once(child,'exit');child.kill('SIGKILL');await exited;
  assert.equal(fs.existsSync(filename),false);
  assert.equal((await f.run('inspect',{projectId:'sample'})).record.baseline.digest,initial.baseline.digest);
  const results=await Promise.allSettled([f.run('baseline.accept',review,'recovered'),f.run('baseline.accept',review,'concurrent')]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.code,'PROJECT_CONFLICT');
  assert.equal((await f.run('inspect',{projectId:'sample'})).record.baseline.digest,drift.current.digest);
  assert.equal(fs.readdirSync(path.join(f.context.projectRoot,'private/projects/sample/.project-control')).some(name=>name.startsWith('pending-')),false);
});
