import {nativeAssertJSON,nativeExact,nativeSha256,nativeFrozenClone,nativeDigest,validateNativeReference} from '../../v1/native.mjs';
import type {NativeScope,NativeReference,NativeJSON} from '../../v1/native.mjs';
export const ONLINE_CONTRACT='evopilot-online/v1';
export const ONLINE_LIMITS=Object.freeze({bindings:64,samples:2048,queryBytes:2048,windowSeconds:2592000,responseBytes:1048576,timeoutMs:5000,alerts:128,backlogPerTick:8});
export function onlineFail(code:string,message=code):never {throw Object.assign(new Error(message),{code});}
export function onlineSlug(v:unknown):asserts v is string {if(typeof v!=='string'||! /^[a-z0-9][a-z0-9-]{0,63}$/.test(v))onlineFail('ONLINE_ID');}
function openSLOName(v:unknown):asserts v is string {if(typeof v!=='string'||! /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v))onlineFail('OPENSLO_NAME');}
export function onlineText(v:unknown,max=256):asserts v is string {if(typeof v!=='string'||!v.trim()||Buffer.byteLength(v)>max||/[\u0000-\u001f]/.test(v))onlineFail('ONLINE_TEXT');}
export function onlineSeconds(v:unknown):number {if(typeof v!=='string'||! /^[1-9][0-9]*(s|m|h|d|w)$/.test(v))onlineFail('ONLINE_DURATION');const n=Number(v.slice(0,-1))*({s:1,m:60,h:3600,d:86400,w:604800}[v.slice(-1)]??0);if(!Number.isSafeInteger(n)||n>ONLINE_LIMITS.windowSeconds)onlineFail('ONLINE_DURATION');return n;}
export interface OnlineMetricSpec {query:string;freshnessQuery:string;unit:'events'|'events_per_second'}
export interface OnlineMetric {metricSource:{type:'Prometheus';spec:OnlineMetricSpec}}
export interface OnlineSLO {
 apiVersion:'openslo/v1';kind:'SLO';metadata:{name:string};spec:{service:string;
 indicator:{metadata:{name:string};spec:{ratioMetric:{good:OnlineMetric;total:OnlineMetric}}};
 timeWindow:[{duration:string;isRolling:true}];budgetingMethod:'RatioTimeslices';objectives:[{target:number;timeSliceWindow:string}]};
}
export interface ResolvedOnlineSLO {name:string;service:string;windowSeconds:number;stepSeconds:number;target:number;good:OnlineMetricSpec;total:OnlineMetricSpec;profile:'openslo-v1-ratio-timeslices';digest:string}
export function inspectOnlineSLO(value:unknown):ResolvedOnlineSLO {
 nativeAssertJSON(value);nativeExact(value,['apiVersion','kind','metadata','spec']);
 if(value.apiVersion!=='openslo/v1'||value.kind!=='SLO')onlineFail('OPENSLO_UNSUPPORTED');
 nativeExact(value.metadata,['name']);openSLOName(value.metadata.name);
 nativeExact(value.spec,['service','indicator','timeWindow','budgetingMethod','objectives']);const s=value.spec;openSLOName(s.service);
 if(s.budgetingMethod!=='RatioTimeslices')onlineFail('OPENSLO_UNSUPPORTED');
 nativeExact(s.indicator,['metadata','spec']);nativeExact(s.indicator.metadata,['name']);openSLOName(s.indicator.metadata.name);
 nativeExact(s.indicator.spec,['ratioMetric']);nativeExact(s.indicator.spec.ratioMetric,['good','total']);
 const metric=(v:unknown):OnlineMetricSpec=>{nativeExact(v,['metricSource']);nativeExact(v.metricSource,['type','spec']);if(v.metricSource.type!=='Prometheus')onlineFail('OPENSLO_PROVIDER');nativeExact(v.metricSource.spec,['query','freshnessQuery','unit']);const m=v.metricSource.spec;onlineText(m.query,ONLINE_LIMITS.queryBytes);onlineText(m.freshnessQuery,ONLINE_LIMITS.queryBytes);if(m.unit!=='events'&&m.unit!=='events_per_second')onlineFail('OPENSLO_UNIT');return {query:m.query,freshnessQuery:m.freshnessQuery,unit:m.unit};};
 const good=metric(s.indicator.spec.ratioMetric.good),total=metric(s.indicator.spec.ratioMetric.total);if(good.unit!==total.unit)onlineFail('OPENSLO_UNIT');
 if(!Array.isArray(s.timeWindow)||s.timeWindow.length!==1||!Array.isArray(s.objectives)||s.objectives.length!==1)onlineFail('OPENSLO_UNSUPPORTED');
 nativeExact(s.timeWindow[0],['duration','isRolling']);if(s.timeWindow[0].isRolling!==true)onlineFail('OPENSLO_UNSUPPORTED');
 nativeExact(s.objectives[0],['target','timeSliceWindow']);const objective=s.objectives[0];
 if(typeof objective.target!=='number'||!Number.isFinite(objective.target)||objective.target<0||objective.target>=1)onlineFail('OPENSLO_TARGET');
 const windowSeconds=onlineSeconds(s.timeWindow[0].duration),stepSeconds=onlineSeconds(objective.timeSliceWindow);
 if(stepSeconds>3600||windowSeconds%stepSeconds||windowSeconds/stepSeconds<2||windowSeconds/stepSeconds>ONLINE_LIMITS.samples)onlineFail('OPENSLO_WINDOW');
 return nativeFrozenClone({name:value.metadata.name,service:s.service,windowSeconds,stepSeconds,target:objective.target,good,total,profile:'openslo-v1-ratio-timeslices',digest:nativeSha256(value)});
}
export interface OnlineBindingSpec {id:string;serviceId:string;environment:string;deploymentRevision:string;providerId:string;alertSourceId:string;policy:NativeReference;slo:OnlineSLO;intervalSeconds:number}
export function validateOnlineBindingSpec(value:unknown):asserts value is OnlineBindingSpec {
 nativeAssertJSON(value);nativeExact(value,['id','serviceId','environment','deploymentRevision','providerId','alertSourceId','policy','slo','intervalSeconds']);
 for(const k of ['id','serviceId','environment','providerId','alertSourceId']as const)onlineSlug(value[k]);onlineText(value.deploymentRevision,128);
 validateNativeReference(value.policy,{product:'harness'});const slo=inspectOnlineSLO(value.slo);if(slo.service!==value.serviceId)onlineFail('ONLINE_SERVICE_MISMATCH');
 if(typeof value.intervalSeconds!=='number'||!Number.isSafeInteger(value.intervalSeconds)||value.intervalSeconds<slo.stepSeconds||value.intervalSeconds>86400||value.intervalSeconds%slo.stepSeconds)onlineFail('ONLINE_INTERVAL');
}
export interface OnlineDecision {decision:'APPROVE'|'REJECT';reviewDigest:string;humanEvidenceRef:string;digest:string}
export interface OnlineBinding {workspaceId:string;scope:NativeScope;spec:OnlineBindingSpec;slo:ResolvedOnlineSLO;onlineStandardDigest:string;reviewDigest:string;decision:OnlineDecision|null;selected:boolean;nextWindowEnd:number|null;lastWindowEnd:number|null}
export interface OnlinePoint {time:number;good:number;total:number;goodSourceTime:number;totalSourceTime:number}
export interface OnlineMeasurement {schema:'evopilot-online-measurement/v1';bindingDigest:string;providerId:string;windowStart:number;windowEnd:number;stepSeconds:number;status:'COMPLETE'|'INCOMPLETE';reasons:string[];points:OnlinePoint[];ratio:number|null;responseDigests:string[];digest:string}
export interface OnlineObservation {id:string;bindingId:string;bindingDigest:string;workspaceId:string;scope:NativeScope;windowEnd:number;measurement:OnlineMeasurement;policy:NativeReference;nativeReport:NativeJSON|null;outcome:'PASS'|'FAIL'|'INCOMPLETE';diagnostic:string|null;digest:string}
export interface OnlineFinding {schema:'evopilot-online-finding/v1';id:string;workspaceId:string;scope:NativeScope;bindingId:string;bindingDigest:string;serviceId:string;environment:string;deploymentRevision:string;policy:NativeReference;incidentId:string;source:'evaluation'|'alertmanager';state:'FIRING'|'RESOLVED';at:number;evidenceDigest:string;causeId:string;candidate:{kind:'regression';status:'REVIEW_REQUIRED'};digest:string}
export interface OnlineRepairCandidate {id:string;workspaceId:string;scope:NativeScope;bindingId:string;incidentId:string;history:OnlineFinding[];state:'FIRING'|'RESOLVED';status:'REVIEW_REQUIRED';requestedVersion:null;softwareRelease:false;ontologyMutation:false;digest:string}
export interface OnlineEnvelope {operation:string;scope:NativeScope;input:Record<string,unknown>;requestId?:string;expectedRevision?:number}
export interface OnlineProviderInput {binding:OnlineBinding;windowEnd:number}
export interface OnlineHarnessProviders {collectOnline?:(input:OnlineProviderInput)=>Promise<OnlineMeasurement>;deliverOnlineFinding?:(finding:OnlineFinding)=>Promise<{id:string;digest:string}>;readOnlineRepair?:(input:{scope:NativeScope;id:string})=>Promise<OnlineRepairCandidate|null>;inspectOnlineAlert?:(input:{sourceId:string;digest:string})=>Promise<OnlineAlertBatch>}
export interface OnlineRuntimeProviders {readOnlineFinding?:(input:{scope:NativeScope;id:string})=>Promise<OnlineFinding>}
export interface OnlineAlert {fingerprint:string;state:'FIRING'|'RESOLVED';startsAt:number;endsAt:number|null;labels:Record<string,string>;digest:string}
export interface OnlineAlertBatch {schema:'evopilot-alertmanager-receipt/v1';sourceId:string;payloadDigest:string;alerts:OnlineAlert[];digest:string}
export const onlineEqual=(a:unknown,b:unknown):boolean=>nativeSha256(a)===nativeSha256(b);
export function measurementBody(binding:OnlineBinding,windowEnd:number,points:OnlinePoint[],reasons:string[],responseDigests:string[]):Omit<OnlineMeasurement,'digest'> {
 const {windowSeconds,stepSeconds}=binding.slo;
 const windowStart=windowEnd-windowSeconds+stepSeconds;
 const errors=[...new Set(reasons)].sort();
 if(!Number.isSafeInteger(windowEnd)||windowEnd<windowSeconds||windowEnd%stepSeconds)onlineFail('ONLINE_WINDOW');
 if(points.length!==windowSeconds/stepSeconds)errors.push('MISSING_SAMPLES');
 for(const [i,p]of points.entries()){
  nativeExact(p,['time','good','total','goodSourceTime','totalSourceTime']);
  if(p.time!==windowStart+i*stepSeconds||!Number.isSafeInteger(p.time))errors.push('PARTIAL_WINDOW');
  if(![p.good,p.total,p.goodSourceTime,p.totalSourceTime].every(Number.isFinite)||p.good<0||p.total<0||p.good>p.total)errors.push('INVALID_SAMPLE');
  if(p.total===0)errors.push('ZERO_DENOMINATOR');
  if(p.goodSourceTime>p.time||p.totalSourceTime>p.time)errors.push('FUTURE_SAMPLE');
 }
 const unique=[...new Set(errors)].sort();const complete=unique.length===0;
 return {schema:'evopilot-online-measurement/v1',bindingDigest:binding.reviewDigest,providerId:binding.spec.providerId,windowStart,windowEnd,stepSeconds,status:complete?'COMPLETE':'INCOMPLETE',reasons:unique,points,ratio:complete?points.reduce((n,p)=>n+p.good/p.total,0)/points.length:null,responseDigests};
}
export function validateOnlineMeasurement(value:unknown,binding:OnlineBinding,windowEnd:number):asserts value is OnlineMeasurement {
 nativeAssertJSON(value);nativeExact(value,['schema','bindingDigest','providerId','windowStart','windowEnd','stepSeconds','status','reasons','points','ratio','responseDigests','digest']);
 if(!Array.isArray(value.points)||value.points.length>ONLINE_LIMITS.samples||!Array.isArray(value.reasons)||value.reasons.some(r=>typeof r!=='string'||! /^[A-Z_]{1,64}$/.test(r))||!Array.isArray(value.responseDigests)||value.responseDigests.length>4)onlineFail('ONLINE_MEASUREMENT');
 value.responseDigests.forEach(nativeDigest);
 const expected=measurementBody(binding,windowEnd,value.points as unknown as OnlinePoint[],value.reasons as string[],value.responseDigests as string[]);
 if(!onlineEqual(value,{...expected,digest:nativeSha256(expected)}))onlineFail('ONLINE_MEASUREMENT_INTEGRITY');
}
export function validateOnlineFinding(value:unknown):asserts value is OnlineFinding {
 nativeAssertJSON(value);nativeExact(value,['schema','id','workspaceId','scope','bindingId','bindingDigest','serviceId','environment','deploymentRevision','policy','incidentId','source','state','at','evidenceDigest','causeId','candidate','digest']);
 if(value.schema!=='evopilot-online-finding/v1'||!['evaluation','alertmanager'].includes(String(value.source))||!['FIRING','RESOLVED'].includes(String(value.state))||typeof value.at!=='number'||!Number.isSafeInteger(value.at)||value.at<0)onlineFail('ONLINE_FINDING');
 const body=Object.fromEntries(Object.entries(value).filter(([key])=>key!=='digest'));if(value.digest!==nativeSha256(body))onlineFail('ONLINE_INTEGRITY');validateNativeReference(value.policy,{product:'harness'});
 for(const key of ['id','bindingDigest','incidentId','evidenceDigest','causeId','digest']as const)nativeDigest(value[key]);for(const key of ['serviceId','environment']as const)onlineSlug(value[key]);onlineText(value.deploymentRevision,128);
 nativeExact(value.scope,['visibility','projectId']);if(!['public','private'].includes(String(value.scope.visibility)))onlineFail('ONLINE_SCOPE');onlineSlug(value.scope.projectId);onlineSlug(value.workspaceId);onlineSlug(value.bindingId);
 nativeExact(value.candidate,['kind','status']);if(value.candidate.kind!=='regression'||value.candidate.status!=='REVIEW_REQUIRED')onlineFail('ONLINE_FINDING');
}
