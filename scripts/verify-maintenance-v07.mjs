// Explicit resource acceptance driver. Synthetic files only; never accepts an existing workspace.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createRuntimeService} from '@evopilot-next/runtime/service';
import {createHarnessService} from '@evopilot-next/harness/service';
import {createOntologyService} from '@evopilot-next/ontology/service';
import {maintainWorkspace,inspectWorkspaceCapacity} from '../dist/integration/workspace/maintenance.js';

const reportPath=process.argv[2];assert(reportPath&&path.isAbsolute(reportPath),'Provide a private report filename');
const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'evopilot-v07-volume-'));
const context={projectRoot:path.join(root,'project'),stateRoot:path.join(root,'state'),installationRoot:path.join(root,'installation'),workspaceId:'synthetic-volume'};
const timings={};const measure=(id,fn)=>{const begin=performance.now();const value=fn();timings[id]=Math.round(performance.now()-begin);console.log(id+' completed in '+timings[id]+' ms');return value;};
let outcome;
try{
 for(const p of [context.projectRoot,context.installationRoot])fs.mkdirSync(p,{mode:0o700});
 fs.writeFileSync(path.join(context.projectRoot,'workspace-project.json'),JSON.stringify({schema:'evopilot-workspace-project/v1',id:context.workspaceId,templateVersion:'0.2.0',specifications:{ontology:'v1',harness:'v1'}}),{mode:0o600});
 for(const factory of [createRuntimeService,createHarnessService,createOntologyService]){const s=factory({workspaceRoot:context.stateRoot,workspaceId:context.workspaceId});s.initialize();s.close();}
 measure('prepareSyntheticCorpus',()=>{
  const small=Buffer.alloc(4096,0x5a);for(let d=0;d<100;d++){const dir=path.join(context.projectRoot,'cache-'+String(d).padStart(3,'0'));fs.mkdirSync(dir,{mode:0o700});for(let i=0;i<1000;i++)fs.writeFileSync(path.join(dir,'entry-'+i+'.dat'),small,{mode:0o600});}
  for(let i=0;i<15;i++){const fd=fs.openSync(path.join(context.projectRoot,'large-'+i+'.dat'),'wx',0o600);fs.ftruncateSync(fd,268435456);fs.closeSync(fd);}
  for(let i=0;i<20;i++)fs.symlinkSync('cache-000/entry-'+i+'.dat',path.join(context.projectRoot,'link-'+i));
 });
 const capacity=measure('capacity',()=>inspectWorkspaceCapacity(context));
 const backup=measure('backup',()=>maintainWorkspace(context,'backup',{destinationRoot:path.join(root,'backup')},'volume-backup'));
 fs.rmSync(context.projectRoot,{recursive:true});fs.rmSync(context.stateRoot,{recursive:true});
 const restored=measure('restore',()=>maintainWorkspace(context,'restore',{backupRoot:path.join(root,'backup')},'volume-restore'));
 assert.equal(restored.manifestDigest,backup.manifestDigest);for(let i=0;i<20;i++)assert.equal(fs.readlinkSync(path.join(context.projectRoot,'link-'+i)),'cache-000/entry-'+i+'.dat');
 const peakRssBytes=process.resourceUsage().maxRSS*1024;
 outcome={schema:'evopilot-v07-maintenance-benchmark/v1',fixture:'SYNTHETIC_NOT_BUSINESS_ACCEPTANCE',capacity,timings,peakRssBytes,manifestDigest:backup.manifestDigest,status:'PASS'};
 assert(timings.backup<=900000&&timings.restore<=900000,'900 second budget');assert(peakRssBytes<=536870912,'512 MiB peak RSS budget');
}catch(error){outcome={...outcome,status:'FAIL',timings,peakRssBytes:process.resourceUsage().maxRSS*1024,error:{code:error.code??'BENCHMARK_ASSERTION',message:error.message}};process.exitCode=1;}
finally{fs.writeFileSync(reportPath,JSON.stringify(outcome,null,2)+'\n',{mode:0o600});fs.rmSync(root,{recursive:true,force:true});}
console.log(JSON.stringify({status:outcome.status,timings,peakRssBytes:outcome.peakRssBytes}));
