import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import type {Configuration,ConnectionIdentity} from '../types.js';
import {nativeExact,nativeSha256} from '../compatibility/v1/native.mjs';
import {canonicalPath,canonicalJSON,readRegular,digest,fail} from '../connection/config.js';
import {privateDirectory,atomicPrivateJSON,readOnlineConfiguration} from './config.js';
export interface WorkerOwner {schema:'evopilot-online-worker/v1';label:string;domain:string;identity:ConnectionIdentity;configPath:string;configurationDigest:string;nodePath:string;nodeDigest:string;plistDigest:string;nonce:string}
export const workerRoot=(c:Pick<Configuration,'workspaceRoot'>)=>c.workspaceRoot+'.evopilot-online-worker';
export const workerLabel=(c:Pick<Configuration,'workspaceRoot'|'workspaceId'>)=>'io.evopilot.online.'+digest(c.workspaceRoot+'\0'+c.workspaceId).slice(0,24);
function launch(args:string[]){if(process.platform!=='darwin')fail('ONLINE_SUPERVISOR_UNSUPPORTED');const r=spawnSync('/bin/launchctl',args,{encoding:'utf8',timeout:10000,maxBuffer:1024*1024});if(r.error)fail('ONLINE_SUPERVISOR_ERROR');return r;}
function loaded(c:Pick<Configuration,'workspaceRoot'|'workspaceId'>):string|null{
 const r=launch(['print','gui/'+process.getuid!()+'/'+workerLabel(c)]);if(r.status===0)return r.stdout;
 if(r.status===113&&r.stderr.includes('Could not find service'))return null;fail('ONLINE_SUPERVISOR_ERROR');
}
export function readWorkerOwner(c:Configuration):WorkerOwner|null {
 const filename=path.join(workerRoot(c),'owner.json');if(!fs.existsSync(filename))return null;
 const value:unknown=JSON.parse(readRegular(filename,1048576,true).toString());nativeExact(value,['schema','label','domain','identity','configPath','configurationDigest','nodePath','nodeDigest','plistDigest','nonce']);
 if(value.schema!=='evopilot-online-worker/v1'||value.label!==workerLabel(c)||value.domain!=='gui/'+process.getuid!()||canonicalJSON(value.identity)!==canonicalJSON(c.identity)||value.configPath!==c.configPath||typeof value.nodePath!=='string'||typeof value.nonce!=='string')fail('ONLINE_WORKER_IDENTITY');
 const owner=value as unknown as WorkerOwner;canonicalPath(owner.nodePath);
 if(digest(readRegular(path.join(workerRoot(c),'job.plist'),1048576,true))!==owner.plistDigest||digest(fs.readFileSync(owner.nodePath))!==owner.nodeDigest)fail('ONLINE_WORKER_INTEGRITY');
 return owner;
}
function ownedLoaded(c:Configuration,owner:WorkerOwner|null,state:string|null){
 if(state&&(!owner||!state.includes('\n\tpath = '+path.join(workerRoot(c),'job.plist')+'\n')||!state.includes('\n\tprogram = '+owner.nodePath+'\n')))fail('ONLINE_WORKER_NOT_OWNED');
}
export function inspectOnlineWorker(c:Configuration){
 const state=loaded(c),owner=readWorkerOwner(c);ownedLoaded(c,owner,state);
 const statusPath=path.join(workerRoot(c),'status.json');let status:Record<string,unknown>|null=null;
 if(fs.existsSync(statusPath)){status=JSON.parse(readRegular(statusPath,1048576,true).toString()) as Record<string,unknown>;if(status.nonce!==owner?.nonce||status.configurationDigest!==owner?.configurationDigest)fail('ONLINE_WORKER_STATUS_IDENTITY');}
 const pid=state?Number(state.match(/\n\tpid = (\d+)\n/)?.[1])||null:null;
 return {label:workerLabel(c),supervisor:'launchd',loaded:state!==null,pid,ready:!!pid&&status?.pid===pid&&status.state==='READY'&&typeof status.heartbeatAt==='number'&&Date.now()-status.heartbeatAt<15000,status,authority:false};
}
/** Called while holding the shared Workspace lease, before maintenance reads. */
export function requireOnlineWorkerStopped(c:Configuration):void {
 if(process.platform!=='darwin'){if(fs.existsSync(path.join(workerRoot(c),'owner.json')))fail('ONLINE_SUPERVISOR_UNSUPPORTED');return;}
 const state=loaded(c);if(state)fail('ONLINE_WORKER_ACTIVE','Disable the independent online worker before Workspace maintenance');
}
const xml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
/** Lifecycle callers hold the Workspace lease. No implicit discovery start. */
export function startOnlineWorker(c:Configuration){
 const configuration=readOnlineConfiguration(c);if(!configuration)fail('ONLINE_UNCONFIGURED');
 const old=readWorkerOwner(c),state=loaded(c);ownedLoaded(c,old,state);
 if(state){if(old?.configurationDigest!==configuration.digest)fail('ONLINE_CONFIGURATION_CHANGED');return inspectOnlineWorker(c);}
 const root=workerRoot(c);privateDirectory(root);
 const nodePath=fs.realpathSync(process.execPath);canonicalPath(nodePath);
 const workerPath=path.join(c.installationRoot,'dist/integration/online/worker.js');readRegular(workerPath);
 const label=workerLabel(c),domain='gui/'+process.getuid!(),nonce=randomUUID();
 const argv=[nodePath,workerPath,c.configPath,configuration.digest,nonce];
 const plist=`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${xml(label)}</string><key>ProgramArguments</key><array>${argv.map(x=>'<string>'+xml(x)+'</string>').join('')}</array><key>WorkingDirectory</key><string>${xml(c.installationRoot)}</string><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>5</integer><key>Umask</key><integer>63</integer><key>StandardOutPath</key><string>${xml(path.join(root,'stdout.log'))}</string><key>StandardErrorPath</key><string>${xml(path.join(root,'stderr.log'))}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/usr/bin:/bin</string><key>NODE_NO_WARNINGS</key><string>1</string></dict></dict></plist>\n`;
 for(const name of ['stdout.log','stderr.log'])if(!fs.existsSync(path.join(root,name)))fs.writeFileSync(path.join(root,name),'',{flag:'wx',mode:0o600});
 const plistPath=path.join(root,'job.plist');if(fs.existsSync(plistPath))readRegular(plistPath,1048576,true);fs.writeFileSync(plistPath,plist,{mode:0o600});
 const owner:WorkerOwner={schema:'evopilot-online-worker/v1',label,domain,identity:c.identity,configPath:c.configPath,configurationDigest:configuration.digest,nodePath,nodeDigest:digest(fs.readFileSync(nodePath)),plistDigest:digest(plist),nonce};
 atomicPrivateJSON(path.join(root,'owner.json'),owner);atomicPrivateJSON(path.join(root,'status.json'),{nonce,configurationDigest:configuration.digest,state:'STARTING',pid:null,heartbeatAt:Date.now(),authority:false});
 const r=launch(['bootstrap',domain,plistPath]);if(r.status!==0)fail('ONLINE_SUPERVISOR_START');
 return {started:true,label,configurationDigest:configuration.digest,independentOfCodex:true,authority:false};
}
export async function stopOnlineWorker(c:Configuration,uninstall=false){
 const owner=readWorkerOwner(c),state=loaded(c);ownedLoaded(c,owner,state);
 if(state){const pid=Number(state.match(/\n\tpid = (\d+)\n/)?.[1]);const result=launch(['bootout',owner!.domain+'/'+owner!.label]);if(result.status!==0)fail('ONLINE_SUPERVISOR_STOP');
  // bootout may return while launchd is still reaping the terminating child.
  const deadline=Date.now()+20000;for(;;){let alive=false;if(pid)try{process.kill(pid,0);alive=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}
   if(!alive&&loaded(c)===null)break;if(Date.now()>deadline)fail('ONLINE_WORKER_STILL_RUNNING');await new Promise(resolve=>setTimeout(resolve,50));}
 }
 return {stopped:!!state,uninstalled:uninstall,supervisorRegistered:false,evidencePreserved:true,label:workerLabel(c),authority:false};
}
