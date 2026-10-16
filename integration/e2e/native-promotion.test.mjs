import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { preparePromotion, finishPromotion } from '../../dist/integration/workspace/native-promotion.js';
import { nativeSha256 } from '../../dist/integration/compatibility/v1/native.mjs';

function fixture(prepare = true) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'evopilot-promotion-'));
  const current = path.join(root, 'project'), candidate = path.join(current, 'campaigns/candidate/project'), archiveRoot = path.join(root, 'history'), retained = path.join(root, 'state');
  for (const p of [current, path.join(current,'campaigns'), path.join(current,'campaigns/candidate'), candidate, archiveRoot, retained]) fs.mkdirSync(p, { mode: 0o700 });
  fs.writeFileSync(path.join(current,'README.md'), 'old', { mode:0o600 }); fs.writeFileSync(path.join(candidate,'README.md'), 'new', { mode:0o600 });
  const options = { id:'synthetic', candidateDigest:nativeSha256('candidate'), completionDigest:nativeSha256('trusted-completion'), current, candidate, archiveRoot, retained };
  const plan = prepare ? preparePromotion(options) : null;
  return { root, retained, plan, options, cleanup:()=>fs.rmSync(root,{recursive:true,force:true}) };
}

test('actual process death after the old tree is moved resumes only the exact retained promotion', () => {
  const f=fixture();
  try {
    const moduleUrl=new URL('../../dist/integration/workspace/native-promotion.js',import.meta.url).href;
    const code=`import fs from 'node:fs';import {finishPromotion} from ${JSON.stringify(moduleUrl)};const original=fs.renameSync;fs.renameSync=(...args)=>{original(...args);process.kill(process.pid,'SIGKILL');};finishPromotion(${JSON.stringify(f.plan)},${JSON.stringify(f.retained)});`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:5000});
    assert.equal(child.signal,'SIGKILL'); assert.equal(fs.existsSync(f.plan.current),false);
    const result=finishPromotion(f.plan,f.retained); assert.equal(result.completed,true);
    assert.equal(fs.readFileSync(path.join(f.plan.previous,'README.md'),'utf8'),'old');
    assert.equal(fs.readFileSync(path.join(f.plan.current,'README.md'),'utf8'),'new');
    assert.deepEqual(finishPromotion(f.plan,f.retained),result);
  } finally {f.cleanup();}
});

test('unknown bytes in the staged tree refuse transition without touching the current or prior project', () => {
  const f=fixture();
  try {
    fs.writeFileSync(path.join(f.plan.next,'README.md'),'unreviewed');
    assert.throws(()=>finishPromotion(f.plan,f.retained),{code:'PROJECT_PROMOTION_DRIFT'});
    assert.equal(fs.readFileSync(path.join(f.plan.current,'README.md'),'utf8'),'old');
    assert.equal(fs.existsSync(f.plan.previous),false);
  } finally {f.cleanup();}
});

for (const tamper of [false,true]) test(`staging crash resumes only journal-bound partial files; tamper=${tamper}`, () => {
  const f=fixture(false);
  try {
    const moduleUrl=new URL('../../dist/integration/workspace/native-promotion.js',import.meta.url).href;
    const code=`import fs from 'node:fs';import {preparePromotion} from ${JSON.stringify(moduleUrl)};const original=fs.writeFileSync;fs.writeFileSync=(fd,...rest)=>{original(fd,...rest);if(typeof fd==='number'&&fs.existsSync(${JSON.stringify(path.join(f.options.archiveRoot,'next'))}))process.kill(process.pid,'SIGKILL');};preparePromotion(${JSON.stringify(f.options)});`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:5000});
    assert.equal(child.signal,'SIGKILL');
    assert.equal(fs.readFileSync(path.join(f.options.current,'README.md'),'utf8'),'old');
    assert(fs.existsSync(path.join(f.retained,'promotion-synthetic.json')));
    if(tamper){
      fs.writeFileSync(path.join(f.options.archiveRoot,'next','foreign.txt'),'foreign',{mode:0o600});
      assert.throws(()=>preparePromotion(f.options),{code:'PROJECT_PROMOTION_DRIFT'});
      assert.equal(fs.readFileSync(path.join(f.options.current,'README.md'),'utf8'),'old');
    }else{
      const plan=preparePromotion(f.options);
      assert.equal(finishPromotion(plan,f.retained).completed,true);
      assert.equal(fs.readFileSync(path.join(plan.current,'README.md'),'utf8'),'new');
    }
  }finally{f.cleanup();}
});
