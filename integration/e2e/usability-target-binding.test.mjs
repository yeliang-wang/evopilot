import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../../',import.meta.url));
const files=[
  'scripts/verify-controlled-evaluation.mjs','governance/controlled-evaluation-v08.json','docs/architecture/0012-bounded-evaluation-environments.md',
  'scripts/verify-usability-target.mjs','scripts/verify-usability-delivery.mjs','scripts/verify-release-scope.mjs',
  'governance/asset-usability-v08.json','governance/asset-usability-v08-execution.json',
  'governance/asset-usability-v08-delivery.json','governance/controlled-execution-v08.json',
  'governance/release-scope.json','governance/readability-v07.json',
  'docs/roadmap.md','docs/asset-usability-v08.md','docs/architecture/0011-controlled-process-authority.md',
];
function fixture(t){
  const directory=mkdtempSync(join(tmpdir(),'evopilot-target-binding-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  for(const file of files){mkdirSync(dirname(join(directory,file)),{recursive:true});copyFileSync(join(root,file),join(directory,file));}
  return directory;
}
function edit(directory,file,change){
  const path=join(directory,file),value=JSON.parse(readFileSync(path,'utf8'));
  change(value);writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
function run(directory,kind){
  const result=spawnSync(process.execPath,['scripts/verify-usability-'+kind+'.mjs','--roadmap','docs/roadmap.md'],{cwd:directory,encoding:'utf8',timeout:10000});
  assert.ifError(result.error);assert.equal(result.signal,null);return result;
}
const targets={target:'governance/asset-usability-v08-execution.json',delivery:'governance/asset-usability-v08-delivery.json'};
for(const kind of Object.keys(targets)){
  test('target binding '+kind+' admits the exact inputs without granting acceptance',t=>{
    const result=run(fixture(t),kind);assert.equal(result.status,0,result.stderr);
    const report=JSON.parse(result.stdout);assert.equal(report.status,'ALIGNED');assert.equal(report.authority,false);assert.equal(report.acceptance,'NOT_INFERRED');
  });
  for(const file of ['governance/controlled-evaluation-v08.json','docs/architecture/0012-bounded-evaluation-environments.md','docs/roadmap.md','governance/asset-usability-v08.json','docs/asset-usability-v08.md','governance/controlled-execution-v08.json','docs/architecture/0011-controlled-process-authority.md']){
    test('target binding '+kind+' rejects changed '+file,t=>{
      const directory=fixture(t),path=join(directory,file);writeFileSync(path,readFileSync(path,'utf8')+'\n');
      const result=run(directory,kind);assert.notEqual(result.status,0);assert.match(result.stderr,/AssertionError/);
    });
  }
  test('target binding '+kind+' rejects inferred authority',t=>{
    const directory=fixture(t);edit(directory,targets[kind],value=>{value.bindingRevision.authority=true;});
    assert.notEqual(run(directory,kind).status,0);
  });
  test('target binding '+kind+' rejects removal of a required variant',t=>{
    const directory=fixture(t);edit(directory,targets[kind],value=>{value[kind==='target'?'stageVariants':'variants'].pop();});
    assert.notEqual(run(directory,kind).status,0);
  });
}
test('delivery rejects execution and delivery lineage disagreement',t=>{
  const directory=fixture(t);edit(directory,targets.target,value=>{value.bindingRevision.predecessorPlanningDigest='sha256:'+'0'.repeat(64);});
  const result=run(directory,'delivery');assert.notEqual(result.status,0);assert.match(result.stderr,/correction lineage must agree/);
});
