import {nativePackage} from '../../projects/evopilot-ontology/tests/fixtures/native/package.mjs';
import {syntheticHarnessPackage} from '../../projects/evopilot-harness/examples/native/package.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm, mkdir, realpath} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ROOT, CHILDREN} from '../../scripts/sync-contract.mjs';
import {syncUsability} from '../../scripts/sync-usability.mjs';

test('usability generated contract matches all three independent owners',async()=>{
  await syncUsability({check:true});
  const manifest=JSON.parse(await readFile(resolve(ROOT,'integration/compatibility/usability/v1/manifest.json'),'utf8'));
  for(const child of CHILDREN)for(const [name,sha]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile(resolve(ROOT,child,'vendor/usability/v1',name))).digest('hex'),sha);
});

test('standalone packed Harness exposes usability SDK with parent reads denied',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'evopilot-usability-package-')));
  const run=(command,args,cwd)=>{const r=spawnSync(command,args,{cwd,encoding:'utf8',timeout:60000,env:{...process.env,NODE_OPTIONS:''}});assert.ifError(r.error);assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;};
  try{
    const packed=JSON.parse(run('npm',['pack','--json','--ignore-scripts','--pack-destination',root],resolve(ROOT,'projects/evopilot-harness')))[0];
    for(const path of ['dist/usability.js','dist/usability.d.ts','vendor/usability/v1/contract.mjs','vendor/usability/v1/contract.d.mts','docs/usability.md'])assert(packed.files.some(f=>f.path===path),path);
    await mkdir(join(root,'consumer'));
    run('npm',['install','--ignore-scripts','--offline','--no-audit','--no-fund',join(root,packed.filename)],join(root,'consumer'));
    run(process.execPath,['--permission','--allow-fs-read='+root,'--input-type=module','-e',`
      import assert from 'node:assert/strict';
      import {preflightUsability, USABILITY_LEVELS, USABILITY_STANDARD_DIGEST} from '@evopilot-next/harness';
      assert.equal(typeof preflightUsability,'function');
      assert(Object.isFrozen(USABILITY_LEVELS.L3.includes));
      assert.match(USABILITY_STANDARD_DIGEST,/^sha256:[a-f0-9]{64}$/);
      assert.throws(()=>USABILITY_LEVELS.L3.includes.push('unsafe'),TypeError);
    `],join(root,'consumer'));
  }finally{await rm(root,{recursive:true,force:true});}
});


for(const owner of ['ontology','harness'])test('packed '+owner+' owns authoring contract and service entry with parent reads denied',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'evopilot-authoring-package-')));
 const run=(command,args,cwd)=>{const r=spawnSync(command,args,{cwd,encoding:'utf8',timeout:60000,env:{...process.env,NODE_OPTIONS:''}});assert.ifError(r.error);assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;};
 try{
  const packed=JSON.parse(run('npm',['pack','--json','--ignore-scripts','--pack-destination',root],resolve(ROOT,'projects/evopilot-'+owner)))[0];
  for(const name of ['vendor/usability/v1/authoring.mjs','vendor/usability/v1/authoring.d.mts','dist/service.js','dist/service.d.ts'])assert(packed.files.some(f=>f.path===name),name);
  const consumer=join(root,'consumer');await mkdir(consumer);
  run('npm',['install','--ignore-scripts','--offline','--no-audit','--no-fund',join(root,packed.filename)],consumer);
  await writeFile(join(consumer,'synthetic-package.json'),JSON.stringify(owner==='ontology'?nativePackage():syntheticHarnessPackage()),{mode:0o600});
  // Constructors and the actual shared guard run with every parent path denied.
  // Persistence separately exercises the installed package in this temporary root;
  // owners inspect ancestor directory metadata, which needs broader fs permissions.
  run(process.execPath,['--permission','--allow-fs-read='+root,'--input-type=module','-e',`
   import assert from 'node:assert/strict';
   import {create${owner==='ontology'?'Ontology':'Harness'}Service as factory} from '@evopilot-next/${owner}/service';
   import {requireNativeAuthoring} from './node_modules/@evopilot-next/${owner}/vendor/usability/v1/authoring.mjs';
   const options={workspaceRoot:process.cwd()+'/unopened-state',workspaceId:'synthetic-packed'};
   const request={workspaceId:options.workspaceId,scope:{visibility:'private',projectId:'synthetic'},owner:'${owner}',packageDigest:'sha256:'+'a'.repeat(64),sourceBindingsDigest:'sha256:'+'b'.repeat(64),sourceDirection:'forward'};
   assert.throws(()=>requireNativeAuthoring(undefined,request),{code:'AUTHORING_CONTEXT_REQUIRED'});
   const resolver=r=>({...r,schema:'evopilot-native-authoring-admission/v1',candidateDigest:'sha256:'+'c'.repeat(64),sourceInventoryDigest:'sha256:'+'d'.repeat(64),requirementsDigest:'sha256:'+'e'.repeat(64),modelingIntentDigest:null,targetLevel:null,authority:false});
   assert.equal(requireNativeAuthoring(resolver,request).authority,false);
   const service=factory(options,{resolveNativeAuthoring:resolver});assert.equal(typeof service.native,'function');service.close();
   assert.throws(()=>factory(options,{resolveNativeAuthoring:true}));
  `],consumer);
  run(process.execPath,['--input-type=module','-e',`
   import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
   import {create${owner==='ontology'?'Ontology':'Harness'}Service as factory} from '@evopilot-next/${owner}/service';
   const options={workspaceRoot:path.join(process.cwd(),'state'),workspaceId:'synthetic-packed'},scope={visibility:'private',projectId:'synthetic'},pkg=JSON.parse(fs.readFileSync('synthetic-package.json'));
   const envelope={operation:'native.package.put',scope,input:{package:pkg},requestId:'synthetic-put',expectedRevision:0};
   let service=factory(options);service.initialize();
   await assert.rejects(service.native(envelope),{code:'AUTHORING_CONTEXT_REQUIRED'});
   assert.equal(service.execute({operation:'workspace.inspect',scope,input:{}}).revision,0);service.close();
   // Test-only trusted host; these fixed synthetic pins never approve real assets.
   const resolveNativeAuthoring=request=>({...request,schema:'evopilot-native-authoring-admission/v1',candidateDigest:'sha256:'+'a'.repeat(64),sourceInventoryDigest:'sha256:'+'b'.repeat(64),requirementsDigest:'sha256:'+'c'.repeat(64),modelingIntentDigest:request.sourceDirection==='reverse'?'sha256:'+'d'.repeat(64):null,targetLevel:request.sourceDirection==='reverse'?'L1':null,authority:false});
   service=factory(options,{resolveNativeAuthoring});service.initialize();await service.native(envelope);
   const record=await service.native({operation:'native.package.inspect',scope,input:{id:pkg.manifest.id,version:pkg.manifest.version}});
   assert.equal(record.authoring.authority,false);assert.equal(record.verifiedLevel,undefined);service.close();
  `],consumer);
 }finally{await rm(root,{recursive:true,force:true});}
});
