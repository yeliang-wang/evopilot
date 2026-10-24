import {readRegular} from '../connection/config.js';
import {createComposition,loadInstalledProducts} from '../composition.js';
import {nativeExact,nativeStableSerialize} from '../compatibility/v1/native.mjs';
import type {NativePackage,NativeReference,NativeScope,NativeToolchain} from '../compatibility/v1/native.mjs';
import type {ReadSnapshot} from '../compatibility/readability/v1/readability.mjs';
import type {UsabilityOperation,UsabilityRequest,UsabilityResponse} from '@evopilot-next/harness/service';
import {createAssetConsumption,consumptionFail} from './assets.js';
import {startConsumptionHTTP} from './http.js';
import type {ConsumptionAuthorization} from './http.js';
interface AssetServiceConfig {
  schema:'evopilot-asset-service/v1';workspaceRoot:string;workspaceId:string;
  host:string;port:number;tls:{keyFile:string;certFile:string}|null;authorizationFile:string;toolchainFile:string|null;
}
function privateJSON(path:string):unknown{return JSON.parse(readRegular(path,1048576,true).toString('utf8'));}
/** Local service configuration is explicit; no daily installation or workspace binding changes. */
export async function startAssetService(configPath:string){
  const config=privateJSON(configPath) as AssetServiceConfig;nativeExact(config,['schema','workspaceRoot','workspaceId','host','port','tls','authorizationFile','toolchainFile']);
  if(config.schema!=='evopilot-asset-service/v1'||typeof config.host!=='string'||typeof config.authorizationFile!=='string')consumptionFail('CONSUMPTION_CONFIG');
  if(config.tls!==null)nativeExact(config.tls,['keyFile','certFile']);
  const toolchain=config.toolchainFile===null?undefined:privateJSON(config.toolchainFile) as NativeToolchain;
  const composition=createComposition({workspaceRoot:config.workspaceRoot,workspaceId:config.workspaceId},await loadInstalledProducts(),{},{...(toolchain?{toolchain}:{})});
  const same=(a:unknown,b:unknown)=>nativeStableSerialize(a)===nativeStableSerialize(b);
  async function readPackage({scope,reference}:{scope:NativeScope;reference:NativeReference}){
    const scopes:NativeScope[]=reference.visibility==='private'?[scope]:[...new Set([scope.projectId,'shared'])].map(projectId=>({visibility:'public',projectId}));
    const found:{workspaceId:string;scope:NativeScope;package:NativePackage;published:boolean}[]=[];
    for(const ownerScope of scopes){
      let record:{scope:NativeScope;reference:NativeReference;package:NativePackage;published?:boolean;workspaceId?:string;workspace?:{id:string}};
      try{record=await composition.native(reference.product,{operation:'native.package.readback',scope:ownerScope,input:{id:reference.id,version:reference.version}}) as typeof record;}
      catch(e){if(['NOT_FOUND','NOT_PUBLISHED'].includes(String((e as {code?:string})?.code)))continue;throw e;}
      if(!same(record.reference,reference)||!same(record.scope,ownerScope))consumptionFail('CONSUMPTION_DRIFT');
      found.push({workspaceId:record.workspaceId??record.workspace?.id??'',scope:record.scope,package:record.package,published:reference.product==='ontology'||record.published===true});
    }
    if(found.length!==1)consumptionFail(found.length?'CONSUMPTION_AMBIGUOUS':'CONSUMPTION_UNAVAILABLE');return found[0];
  }
  const api=createAssetConsumption({workspaceId:config.workspaceId,readPackage,
    readSnapshot:async context=>{const material=await readPackage(context);return await composition.native(context.reference.product,{operation:'readable.snapshot',scope:material.scope,input:{id:context.reference.id,version:context.reference.version}}) as ReadSnapshot;},
    usability:async<K extends UsabilityOperation>(request:UsabilityRequest<K>)=>await composition.native('harness',request) as UsabilityResponse<K>,
  });
  try{
    const server=await startConsumptionHTTP({host:config.host,port:config.port,...(config.tls?{tls:{key:readRegular(config.tls.keyFile,65536,true),cert:readRegular(config.tls.certFile,65536)}}:{}),readAuthorization:()=>privateJSON(config.authorizationFile) as ConsumptionAuthorization,consume:api.consume});
    return {address:server.address,close:async()=>{await server.close();composition.close();}};
  }catch(e){composition.close();throw e;}
}
