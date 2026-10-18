import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {randomUUID} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {loadConfiguration,fail} from '../connection/config.js';
import {createComposition,loadInstalledProducts} from '../composition.js';
import {inspectNativeToolchain} from '../toolchain/locked.js';
import {withWorkspaceLease} from '../workspace/lock.js';
import {readOnlineConfiguration,onlineAdapters,atomicPrivateJSON} from './config.js';
import {readWorkerOwner,workerRoot} from './lifecycle.js';
import {ONLINE_LIMITS} from '../compatibility/online/v1/online.mjs';
import type {OnlineBinding,OnlineAlertBatch} from '../compatibility/online/v1/online.mjs';
import type {Scope} from '../types.js';
const safeCode=(error:unknown)=>{const code=(error as {code?:unknown})?.code;return typeof code==='string'&&/^[A-Z_0-9]{1,80}$/.test(code)?code:'ONLINE_WORKER_ERROR';};
export async function runOnlineWorker(configPath:string,expectedDigest:string,nonce:string){
 const c=loadConfiguration(configPath),configuration=readOnlineConfiguration(c),owner=readWorkerOwner(c);
 if(!configuration||configuration.digest!==expectedDigest||owner?.nonce!==nonce||owner.configurationDigest!==expectedDigest)fail('ONLINE_WORKER_IDENTITY');
 const adapters=onlineAdapters(configuration)!;
 const toolchain=inspectNativeToolchain({cacheRoot:path.join(c.workspaceRoot,'native-toolchain')});
 const composition=createComposition({workspaceRoot:c.workspaceRoot,workspaceId:c.workspaceId},await loadInstalledProducts(),{},{toolchain,online:{collectOnline:adapters.collectOnline,inspectOnlineAlert:adapters.inspectOnlineAlert}});
 let stopping=false,queued=0,tickRunning=false,queue:Promise<unknown>=Promise.resolve();
 const status:{nonce:string;configurationDigest:string;pid:number;state:string;heartbeatAt:number;lastTickAt:number|null;scopes:unknown[];diagnostic:string|null;authority:false}={nonce,configurationDigest:expectedDigest,pid:process.pid,state:'STARTING',heartbeatAt:Date.now(),lastTickAt:null,scopes:[],diagnostic:null,authority:false};
 const save=()=>{status.heartbeatAt=Date.now();atomicPrivateJSON(path.join(workerRoot(c),'status.json'),status);};
 const enqueue=<T>(fn:()=>Promise<T>):Promise<T>=>{if(stopping||queued>=16)fail('ONLINE_WORKER_BUSY');queued++;const next=queue.then(()=>withWorkspaceLease(c,'online-'+randomUUID(),async()=>{
  if(readOnlineConfiguration(c)?.digest!==expectedDigest)fail('ONLINE_CONFIGURATION_CHANGED');return fn();
 }));queue=next.catch(()=>{}).finally(()=>{queued--;});return next;};
 async function ingest(batch:OnlineAlertBatch){
  const matching:Scope[]=[];
  for(const scope of configuration!.settings.scopes){const state=await composition.native('harness',{operation:'online.inspect',scope,input:{}}) as {bindings:OnlineBinding[]};
   if(batch.alerts.every(a=>state.bindings.some(b=>b.selected&&b.spec.alertSourceId===batch.sourceId&&b.spec.serviceId===a.labels.service&&b.spec.environment===a.labels.environment&&b.spec.deploymentRevision===a.labels.deployment)))matching.push(scope);
  }
  if(matching.length!==1)fail('ALERT_SERVICE_MISMATCH');const scope=matching[0];
  const state=await composition.native('harness',{operation:'online.inspect',scope,input:{}}) as {revision:number};
  await composition.native('harness',{operation:'online.alert.ingest',scope,input:{sourceId:batch.sourceId,digest:batch.digest},requestId:'online-alert-'+batch.digest.slice(7),expectedRevision:state.revision});
  return {accepted:true,batchDigest:batch.digest};
 }
 const server=http.createServer({maxHeaderSize:8192,requestTimeout:5000,headersTimeout:5000,keepAliveTimeout:1000},async(req,res)=>{
  const send=(code:number,value:unknown)=>{if(!res.destroyed){res.writeHead(code,{'content-type':'application/json','cache-control':'no-store',connection:'close'});res.end(JSON.stringify(value));}};
  if(stopping||req.method!=='POST'||req.headers.host!=='127.0.0.1:'+configuration!.settings.receiverPort||req.headers.origin!==undefined||req.headers['content-type']!=='application/json'||!/^\/alerts\/[a-z0-9][a-z0-9-]{0,63}$/.test(req.url??'')){send(403,{error:'ALERT_REQUEST'});return;}
  const timer=setTimeout(()=>req.destroy(),5000);
  try{const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>ONLINE_LIMITS.responseBytes)fail('ALERT_BODY_LIMIT');chunks.push(chunk);}clearTimeout(timer);
   const sourceId=req.url!.slice('/alerts/'.length);
   const result=await adapters.receiver.receive(sourceId,req.headers.authorization,Buffer.concat(chunks),batch=>enqueue(()=>ingest(batch)));send(200,result);
  }catch(error){const code=safeCode(error);send(code==='ALERT_UNAUTHORIZED'?403:code==='ALERT_BODY_LIMIT'?413:code==='ALERT_IN_PROGRESS'||code==='ONLINE_WORKER_BUSY'?503:400,{error:code});}
  finally{clearTimeout(timer);}
 });
 server.maxConnections=16;server.on('clientError',(_error,socket)=>socket.destroy());
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(configuration.settings.receiverPort,'127.0.0.1',resolve);});
 status.state='READY';save();
 async function tick(){if(stopping||tickRunning)return;tickRunning=true;try{const results=await enqueue(async()=>{
  const values=[];for(const scope of configuration!.settings.scopes)values.push({scope,result:await composition.native('harness',{operation:'online.tick',scope,input:{}})});return values;
 });status.scopes=results;status.lastTickAt=Date.now();status.diagnostic=null;}catch(error){status.diagnostic=safeCode(error);}finally{tickRunning=false;save();}}
 const timer=setInterval(()=>void tick(),configuration.settings.tickSeconds*1000),heartbeat=setInterval(save,3000);void tick();
 const stop=()=>{if(stopping)return;stopping=true;clearInterval(timer);clearInterval(heartbeat);status.state='STOPPING';save();server.close();server.closeIdleConnections();void queue.finally(()=>{composition.close();status.state='STOPPED';save();process.exit(0);});};
 process.on('SIGTERM',stop);process.on('SIGINT',stop);
 server.on('error',()=>{status.diagnostic='ONLINE_RECEIVER_ERROR';save();stop();});
 return {stop};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{if(process.argv.length!==5)fail('ONLINE_WORKER_ARGUMENTS');await runOnlineWorker(process.argv[2],process.argv[3],process.argv[4]);}
 catch(error){process.stderr.write(JSON.stringify({error:safeCode(error),authority:false})+'\n');process.exitCode=1;}
}
