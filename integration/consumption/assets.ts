import {createHash} from 'node:crypto';
import {nativeExact,nativeStableSerialize,nativeFrozenClone,referenceForPackage,validateNativeReference} from '../compatibility/v1/native.mjs';
import type {NativePackage,NativeReference,NativeScope} from '../compatibility/v1/native.mjs';
import {usabilityDigest,usabilityBytesDigest,validateUsabilityDigest,validateUsabilityScope,validateUsabilitySpecification,validateUsabilityInventory} from '../compatibility/usability/v1/contract.mjs';
import type {UsabilitySpecification} from '../compatibility/usability/v1/contract.mjs';
import type {UsabilityInventoryRecord,UsabilityRequest,UsabilityOperation,UsabilityResponse} from '@evopilot-next/harness/service';
import {verifyReadSnapshot,queryReadSnapshot,compareReadSnapshots} from '../compatibility/readability/v1/readability.mjs';
import type {ReadQuery,ReadSnapshot} from '../compatibility/readability/v1/readability.mjs';

export const CONSUMPTION_LIMITS=Object.freeze({requestBytes:16384,responseBytes:8388608,assets:64,readMs:5000,totalMs:15000,requestsPerMinute:120,concurrency:4});
export function consumptionFail(code:string):never{throw Object.assign(new Error(code),{code});}
export const consumptionDigest=(value:unknown)=>'sha256:'+createHash('sha256').update(nativeStableSerialize(value)).digest('hex');
const same=(a:unknown,b:unknown)=>nativeStableSerialize(a)===nativeStableSerialize(b);
export interface ConsumptionGrant {scope:NativeScope;assets:NativeReference[];inventories:string[];assessments:string[]}
export interface ConsumptionPrincipal {id:string;grants:ConsumptionGrant[]}
export interface ConsumptionProviders {
  workspaceId:string;
  readPackage(context:{scope:NativeScope;reference:NativeReference},signal:AbortSignal):Promise<{workspaceId:string;scope:NativeScope;package:NativePackage;published:boolean}>;
  readSnapshot(context:{scope:NativeScope;reference:NativeReference},signal:AbortSignal):Promise<ReadSnapshot>;
  usability<K extends UsabilityOperation>(request:UsabilityRequest<K>):Promise<UsabilityResponse<K>>;
}
export interface AssetBundle {
  schema:'evopilot-asset-export/v1';workspaceId:string;scope:NativeScope;root:NativeReference;
  packages:{reference:NativeReference;scope:NativeScope;package:NativePackage}[];
  authority:false;verifiedLevel:null;digest:string;
}
export type ConsumptionRequest=
 |{operation:'assets.discover';scope:NativeScope;input:{limit:number;cursor:string|null}}
 |{operation:'assets.export';scope:NativeScope;input:{reference:NativeReference}}
 |{operation:'assets.compare';scope:NativeScope;input:{before:NativeReference;after:NativeReference;query:{limit:number;cursor:string|null}}}
 |{operation:'assets.query';scope:NativeScope;input:{reference:NativeReference;query:ReadQuery}}
 |{operation:'assets.specification';scope:NativeScope;input:{inventoryDigest:string;specificationDigest:string}}
 |{operation:'assets.assessment';scope:NativeScope;input:{id:string}};

function boundedBytes(value:unknown,max:number=CONSUMPTION_LIMITS.responseBytes):void{if(Buffer.byteLength(nativeStableSerialize(value))>max)consumptionFail('CONSUMPTION_LIMIT');}
async function bounded<T>(work:(signal:AbortSignal)=>Promise<T>,deadline:number):Promise<T>{
  const ms=Math.min(CONSUMPTION_LIMITS.readMs,deadline-performance.now());if(ms<=0)consumptionFail('CONSUMPTION_TIMEOUT');
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([Promise.resolve().then(()=>work(controller.signal)),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(new Error('CONSUMPTION_TIMEOUT'),{code:'CONSUMPTION_TIMEOUT'}));},ms);})]);}finally{clearTimeout(timer);}
}
function permitted(owner:NativeScope,consumer:NativeScope,reference:NativeReference):boolean{return reference.visibility==='private'?same(owner,consumer):owner.visibility==='public'&&[consumer.projectId,'shared'].includes(owner.projectId);}

/** Offline verification: no live service, mutable latest resolution, or acceptance inferred. */
export function verifyAssetBundle(value:AssetBundle):AssetBundle{
  boundedBytes(value);nativeExact(value,['schema','workspaceId','scope','root','packages','authority','verifiedLevel','digest']);
  const {digest,...body}=value;
  if(value.schema!=='evopilot-asset-export/v1'||value.authority!==false||value.verifiedLevel!==null||digest!==consumptionDigest(body))consumptionFail('CONSUMPTION_DRIFT');
  validateUsabilityScope(value.scope);validateNativeReference(value.root);
  if(!Array.isArray(value.packages)||!value.packages.length||value.packages.length>CONSUMPTION_LIMITS.assets)consumptionFail('CONSUMPTION_LIMIT');
  const packages=new Map<string,AssetBundle['packages'][number]>();
  for(const entry of value.packages){nativeExact(entry,['reference','scope','package']);validateNativeReference(entry.reference);validateUsabilityScope(entry.scope);if(!permitted(entry.scope,value.scope,entry.reference)||!same(referenceForPackage(entry.package),entry.reference)||packages.has(entry.reference.digest))consumptionFail('CONSUMPTION_DRIFT');packages.set(entry.reference.digest,entry);}
  const seen=new Set<string>();
  function visit(reference:NativeReference){const entry=packages.get(reference.digest);if(!entry||!same(entry.reference,reference))consumptionFail('CONSUMPTION_PARTIAL');if(seen.has(reference.digest))return;seen.add(reference.digest);for(const dependency of entry.package.manifest.dependencies)visit(dependency);}
  visit(value.root);if(seen.size!==packages.size)consumptionFail('CONSUMPTION_EXTRA');
  return nativeFrozenClone(value);
}
export function createAssetConsumption(providers:ConsumptionProviders){
  async function consume(principal:ConsumptionPrincipal,raw:ConsumptionRequest):Promise<unknown>{
    boundedBytes(raw,CONSUMPTION_LIMITS.requestBytes);const request=nativeFrozenClone(raw);nativeExact(request,['operation','scope','input']);validateUsabilityScope(request.scope);
    const grant=principal.grants.find(g=>same(g.scope,request.scope));if(!grant)consumptionFail('CONSUMPTION_FORBIDDEN');
    const deadline=performance.now()+CONSUMPTION_LIMITS.totalMs;
    function rootAllowed(reference:NativeReference){validateNativeReference(reference);if(!grant!.assets.some(a=>same(a,reference)))consumptionFail('CONSUMPTION_FORBIDDEN');}
    async function read(reference:NativeReference){
      const material=await bounded(signal=>providers.readPackage({scope:request.scope,reference},signal),deadline);boundedBytes(material);
      if(!material.published||material.workspaceId!==providers.workspaceId||!permitted(material.scope,request.scope,reference)||!same(referenceForPackage(material.package),reference))consumptionFail('CONSUMPTION_DRIFT');
      return {reference,scope:material.scope,package:material.package};
    }
    async function closure(reference:NativeReference):Promise<AssetBundle>{
      rootAllowed(reference);const packages=new Map<string,AssetBundle['packages'][number]>();
      async function visit(ref:NativeReference){if(packages.has(ref.digest)){if(!same(packages.get(ref.digest)!.reference,ref))consumptionFail('CONSUMPTION_DRIFT');return;}if(packages.size>=CONSUMPTION_LIMITS.assets)consumptionFail('CONSUMPTION_LIMIT');const entry=await read(ref);packages.set(ref.digest,entry);boundedBytes([...packages.values()]);for(const dep of entry.package.manifest.dependencies)await visit(dep);}
      await visit(reference);const body={schema:'evopilot-asset-export/v1' as const,workspaceId:providers.workspaceId,scope:request.scope,root:reference,packages:[...packages.values()].sort((a,b)=>a.reference.digest.localeCompare(b.reference.digest)),authority:false as const,verifiedLevel:null};
      return verifyAssetBundle({...body,digest:consumptionDigest(body)});
    }
    let result:unknown;
    if(request.operation==='assets.discover'){
      nativeExact(request.input,['limit','cursor']);const {limit,cursor}=request.input;
      if(!Number.isSafeInteger(limit)||limit<1||limit>50||grant.assets.length>CONSUMPTION_LIMITS.assets)consumptionFail('CONSUMPTION_LIMIT');
      const assets=[...grant.assets].sort((a,b)=>nativeStableSerialize(a).localeCompare(nativeStableSerialize(b))),snapshotDigest=consumptionDigest({workspaceId:providers.workspaceId,scope:request.scope,assets});let offset=0;
      if(cursor!==null){if(typeof cursor!=='string'||cursor.length>1024)consumptionFail('CONSUMPTION_CURSOR');let c:{digest:string;offset:number};try{c=JSON.parse(Buffer.from(cursor,'base64url').toString());nativeExact(c,['digest','offset']);}catch{consumptionFail('CONSUMPTION_CURSOR');}if(c.digest!==snapshotDigest||!Number.isSafeInteger(c.offset)||c.offset<0||c.offset>assets.length)consumptionFail('CONSUMPTION_STALE_CURSOR');offset=c.offset;}
      const page=assets.slice(offset,offset+limit);for(const ref of page)await read(ref);const next=offset+page.length;
      result={workspaceId:providers.workspaceId,scope:request.scope,snapshotDigest,total:assets.length,items:page,nextCursor:next<assets.length?Buffer.from(JSON.stringify({digest:snapshotDigest,offset:next})).toString('base64url'):null,authority:false};
    }else if(request.operation==='assets.export'){
      nativeExact(request.input,['reference']);result=await closure(request.input.reference);
    }else if(request.operation==='assets.query'){
      nativeExact(request.input,['reference','query']);rootAllowed(request.input.reference);await closure(request.input.reference);
      const snapshot=await bounded(signal=>providers.readSnapshot({scope:request.scope,reference:request.input.reference},signal),deadline);verifyReadSnapshot(snapshot);
      if(snapshot.workspaceId!==providers.workspaceId||!permitted(snapshot.scope,request.scope,request.input.reference)||snapshot.pins.packageDigest!==request.input.reference.digest)consumptionFail('CONSUMPTION_DRIFT');
      result=queryReadSnapshot(snapshot,request.input.query);
    }else if(request.operation==='assets.compare'){
      nativeExact(request.input,['before','after','query']);nativeExact(request.input.query,['limit','cursor']);const {before,after,query}=request.input;rootAllowed(before);rootAllowed(after);
      if(before.product!==after.product||before.id!==after.id)consumptionFail('CONSUMPTION_FORBIDDEN');
      const snapshots:ReadSnapshot[]=[];
      for(const reference of [before,after]){await closure(reference);const value=await bounded(signal=>providers.readSnapshot({scope:request.scope,reference},signal),deadline);verifyReadSnapshot(value);if(value.workspaceId!==providers.workspaceId||!permitted(value.scope,request.scope,reference)||value.pins.packageDigest!==reference.digest)consumptionFail('CONSUMPTION_DRIFT');snapshots.push(value);}
      result=compareReadSnapshots(snapshots[0],snapshots[1],{limit:query.limit,...(query.cursor===null?{}:{cursor:query.cursor})});
    }else if(request.operation==='assets.assessment'){
      nativeExact(request.input,['id']);if(!grant.assessments.includes(request.input.id))consumptionFail('CONSUMPTION_FORBIDDEN');
      const value=await bounded(()=>providers.usability({operation:'usability.assessment.read',scope:request.scope,input:request.input}),deadline);
      // Local review file URIs are not part of the external assessment projection.
      result={id:value.assessment.id,inventoryDigest:value.assessment.inventoryDigest,specificationDigest:value.assessment.specificationDigest,targetLevel:value.targetLevel,verifiedLevel:value.verifiedLevel,assessmentStatus:value.assessmentStatus,freshness:value.freshness,version:value.version,authority:false};
    }else if(request.operation==='assets.specification'){
      nativeExact(request.input,['inventoryDigest','specificationDigest']);const {inventoryDigest,specificationDigest}=request.input;validateUsabilityDigest(inventoryDigest);validateUsabilityDigest(specificationDigest);
      if(!grant.inventories.includes(inventoryDigest))consumptionFail('CONSUMPTION_FORBIDDEN');
      const record:UsabilityInventoryRecord=await bounded(()=>providers.usability({operation:'usability.inventory.read',scope:request.scope,input:{digest:inventoryDigest}}),deadline);
      const inventory=validateUsabilityInventory(record.inventory),specification:UsabilitySpecification=validateUsabilitySpecification(await bounded(()=>providers.usability({operation:'usability.specification.read',scope:request.scope,input:{digest:specificationDigest}}),deadline));
      if(inventory.workspaceId!==providers.workspaceId||!same(inventory.scope,request.scope)||usabilityDigest(inventory)!==inventoryDigest||usabilityDigest(specification)!==specificationDigest||specification.inventoryDigest!==inventoryDigest)consumptionFail('CONSUMPTION_DRIFT');
      const citations=[...specification.answers.flatMap(a=>a.statement?.citations??[]),...specification.behaviors.flatMap(b=>Object.values(b.facets).flatMap(s=>s.citations))];
      const all=new Map<string,AssetBundle['packages'][number]>();for(const binding of record.assets)for(const entry of (await closure(binding.reference)).packages)all.set(entry.reference.digest,entry);
      const files:{assetDigest:string;path:string;contentDigest:string;content:string}[]=[],omitted:{assetDigest:string;path:string}[]=[];
      for(const entry of all.values())for(const [path,content] of Object.entries(entry.package.files)){
        const used=citations.filter(c=>c.assetDigest===entry.reference.digest&&c.path===path);
        if(!used.length){omitted.push({assetDigest:entry.reference.digest,path});continue;}
        if(!record.assets.find(a=>a.reference.digest===entry.reference.digest)?.normativePaths.includes(path)||/(^|\/)(sources|original|tests|observations|\.git|node_modules)(\/|$)/i.test(path)||/\.(?:tsx?|jsx?|py|sh|exe|dll|dylib|so|wasm|class|jar)$/i.test(path))consumptionFail('CONSUMPTION_UNSAFE_PROJECTION');
        if(used.some(c=>c.contentDigest!==usabilityBytesDigest(content)))consumptionFail('CONSUMPTION_DRIFT');files.push({assetDigest:entry.reference.digest,path,contentDigest:usabilityBytesDigest(content),content});
      }
      if(citations.some(c=>!files.some(f=>f.assetDigest===c.assetDigest&&f.path===c.path&&f.contentDigest===c.contentDigest)))consumptionFail('CONSUMPTION_PARTIAL');
      const body={schema:'evopilot-specification-export/v1',workspaceId:providers.workspaceId,scope:request.scope,inventoryDigest,specificationDigest,slice:inventory.slice,targetLevel:inventory.targetLevel,questions:inventory.questions,behaviors:inventory.behaviors.map(b=>({...b,excludedFacets:b.excludedFacets.map(({reviewReference,...f})=>({...f,reviewDigest:usabilityBytesDigest(reviewReference)}))})),pins:inventory.pins,specification,files,losses:{omitted,reason:'Specification projection excludes original source, hidden oracle, runtime observations and unreferenced package material; it is not a native package or proof of equivalence.'},inputMode:'ASSETS_ONLY',completeness:'NOT_ASSESSED',verifiedLevel:null,authority:false};
      result={...body,digest:consumptionDigest(body)};
    }else consumptionFail('CONSUMPTION_OPERATION');
    boundedBytes(result);return nativeFrozenClone(result);
  }
  return {consume};
}
