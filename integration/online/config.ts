import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {createPrometheusCollector,createAlertmanagerReceiver,validatePrometheusConnection,readOnlineSecret} from '@evopilot-next/harness/online';
import type {PrometheusConnection,AlertmanagerConnection} from '@evopilot-next/harness/online';
import {nativeAssertJSON,nativeExact,nativeSha256,nativeFrozenClone} from '../compatibility/v1/native.mjs';
import {onlineSlug,ONLINE_LIMITS} from '../compatibility/online/v1/online.mjs';
import {feedbackScope} from '../compatibility/feedback/v1/feedback.mjs';
import type {Configuration,Scope} from '../types.js';
import {canonicalPath,outsideGit,readRegular,fail} from '../connection/config.js';
export interface OnlineSettings {scopes:Scope[];prometheus:PrometheusConnection[];alertmanager:AlertmanagerConnection[];receiverPort:number;tickSeconds:number}
export interface OnlineConfiguration {schema:'evopilot-online-configuration/v1';workspaceId:string;settings:OnlineSettings;digest:string}
export function privateDirectory(directory:string):void {
 canonicalPath(directory,true);outsideGit(directory);
 try{fs.mkdirSync(directory,{mode:0o700});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
 const s=fs.lstatSync(directory);if(!s.isDirectory()||s.uid!==process.getuid!()||(s.mode&0o777)!==0o700)fail('ONLINE_PRIVATE_DIRECTORY');
}
export function atomicPrivateJSON(filename:string,value:unknown):void {
 canonicalPath(filename,true);if(fs.existsSync(filename))readRegular(filename,8*1048576,true);
 const temp=path.join(path.dirname(filename),'.'+randomUUID()+'.tmp'),fd=fs.openSync(temp,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(temp,filename);const dir=fs.openSync(path.dirname(filename),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
}
export function validateOnlineSettings(value:unknown):asserts value is OnlineSettings {
 nativeAssertJSON(value);nativeExact(value,['scopes','prometheus','alertmanager','receiverPort','tickSeconds']);
 for(const key of ['scopes','prometheus','alertmanager']as const)if(!Array.isArray(value[key])||!value[key].length||value[key].length>ONLINE_LIMITS.bindings)fail('ONLINE_CONFIGURATION_LIMIT');
 const scopes=value.scopes as unknown[];scopes.forEach(feedbackScope);if(new Set(scopes.map(nativeSha256)).size!==scopes.length)fail('ONLINE_SCOPE_DUPLICATE');
 const providers=value.prometheus as unknown[];providers.forEach(validatePrometheusConnection);if(new Set((providers as PrometheusConnection[]).map(x=>x.id)).size!==providers.length)fail('ONLINE_PROVIDER_DUPLICATE');
 const alerts=value.alertmanager as unknown[];for(const a of alerts){nativeExact(a,['id','bearerTokenFile']);onlineSlug(a.id);if(typeof a.bearerTokenFile!=='string'||!path.isAbsolute(a.bearerTokenFile))fail('ONLINE_CREDENTIAL_PATH');}
 if(new Set((alerts as AlertmanagerConnection[]).map(x=>x.id)).size!==alerts.length)fail('ONLINE_ALERT_DUPLICATE');
 if(typeof value.receiverPort!=='number'||!Number.isInteger(value.receiverPort)||value.receiverPort<1024||value.receiverPort>65535||typeof value.tickSeconds!=='number'||!Number.isInteger(value.tickSeconds)||value.tickSeconds<1||value.tickSeconds>300)fail('ONLINE_CONFIGURATION_LIMIT');
}
export const onlineConfigPath=(c:Pick<Configuration,'workspaceRoot'>)=>path.join(c.workspaceRoot,'online','configuration.json');
export function readOnlineConfiguration(c:Pick<Configuration,'workspaceRoot'|'workspaceId'>):OnlineConfiguration|null {
 const filename=onlineConfigPath(c);if(!fs.existsSync(filename))return null;
 const value:unknown=JSON.parse(readRegular(filename,1048576,true).toString());nativeExact(value,['schema','workspaceId','settings','digest']);validateOnlineSettings(value.settings);
 const subject={schema:value.schema,workspaceId:value.workspaceId,settings:value.settings};if(value.schema!=='evopilot-online-configuration/v1'||value.workspaceId!==c.workspaceId||value.digest!==nativeSha256(subject))fail('ONLINE_CONFIGURATION_INTEGRITY');
 return nativeFrozenClone(value) as unknown as OnlineConfiguration;
}
/** Caller holds the stopped-Workspace maintenance lease. */
export function configureOnline(c:Configuration,request:{settings:unknown;expectedDigest:string|null;requestId:string}) {
 nativeExact(request,['settings','expectedDigest','requestId']);onlineSlug(request.requestId);validateOnlineSettings(request.settings);
 const directory=path.dirname(onlineConfigPath(c));privateDirectory(directory);privateDirectory(path.join(directory,'requests'));
 const receiptFile=path.join(directory,'requests',request.requestId+'.json'),intent=nativeSha256(request);
 if(fs.existsSync(receiptFile)){const prior=JSON.parse(readRegular(receiptFile,1048576,true).toString()) as {intent:string;result:unknown};if(prior.intent!==intent)fail('REQUEST_CONFLICT');return prior.result;}
 const before=readOnlineConfiguration(c);
 for(const p of request.settings.prometheus)if(p.bearerTokenFile)readOnlineSecret(p.bearerTokenFile);
 for(const p of request.settings.alertmanager)readOnlineSecret(p.bearerTokenFile);
 const subject={schema:'evopilot-online-configuration/v1' as const,workspaceId:c.workspaceId,settings:request.settings};const value={...subject,digest:nativeSha256(subject)};
 // Recover a crash after publishing the exact requested configuration but before its receipt.
 if((before?.digest??null)!==request.expectedDigest&&before?.digest!==value.digest)fail('REVISION_CONFLICT');
 atomicPrivateJSON(onlineConfigPath(c),value);
 const result={configured:true,configurationDigest:value.digest,workspaceId:c.workspaceId,providerIds:value.settings.prometheus.map(x=>x.id),alertSourceIds:value.settings.alertmanager.map(x=>x.id),scopeCount:value.settings.scopes.length,workerStarted:false,authority:false};
 atomicPrivateJSON(receiptFile,{intent,result});return result;
}
export function onlineAdapters(configuration:OnlineConfiguration|null){
 if(!configuration)return null;
 const receiver=createAlertmanagerReceiver(configuration.settings.alertmanager);
 return {collectOnline:createPrometheusCollector(configuration.settings.prometheus),inspectOnlineAlert:receiver.inspect,receiver};
}
