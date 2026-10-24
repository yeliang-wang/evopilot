import http from 'node:http';
import https from 'node:https';
import {createHash,timingSafeEqual} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {nativeExact,nativeStableSerialize,validateNativeReference} from '../compatibility/v1/native.mjs';
import {validateUsabilityScope,validateUsabilityDigest} from '../compatibility/usability/v1/contract.mjs';
import {CONSUMPTION_LIMITS,consumptionFail} from './assets.js';
import type {ConsumptionPrincipal,ConsumptionRequest} from './assets.js';
export interface ConsumptionCredential extends ConsumptionPrincipal {tokenDigest:string;enabled:boolean}
export interface ConsumptionAuthorization {schema:'evopilot-asset-authorization/v1';credentials:ConsumptionCredential[]}
export interface ConsumptionHTTPOptions {
  host:string;port:number;tls?:{key:Buffer;cert:Buffer};
  readAuthorization():ConsumptionAuthorization;
  consume(principal:ConsumptionPrincipal,request:ConsumptionRequest):Promise<unknown>;
}
export function validateConsumptionAuthorization(raw:ConsumptionAuthorization):ConsumptionAuthorization{
  nativeExact(raw,['schema','credentials']);if(raw.schema!=='evopilot-asset-authorization/v1'||!Array.isArray(raw.credentials)||raw.credentials.length>64)consumptionFail('CONSUMPTION_AUTH_CONFIG');
  const ids=new Set<string>(),tokens=new Set<string>();
  for(const c of raw.credentials){nativeExact(c,['id','tokenDigest','enabled','grants']);if(typeof c.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(c.id)||typeof c.enabled!=='boolean'||!/^sha256:[a-f0-9]{64}$/.test(c.tokenDigest)||ids.has(c.id)||tokens.has(c.tokenDigest)||!Array.isArray(c.grants)||c.grants.length>32)consumptionFail('CONSUMPTION_AUTH_CONFIG');ids.add(c.id);tokens.add(c.tokenDigest);const scopes=new Set<string>();
    for(const g of c.grants){nativeExact(g,['scope','assets','inventories','assessments']);validateUsabilityScope(g.scope);const key=nativeStableSerialize(g.scope);if(scopes.has(key)||!Array.isArray(g.assets)||g.assets.length>64||!Array.isArray(g.inventories)||g.inventories.length>128||!Array.isArray(g.assessments)||g.assessments.length>128)consumptionFail('CONSUMPTION_AUTH_CONFIG');scopes.add(key);for(const ref of g.assets)validateNativeReference(ref);for(const d of g.inventories)validateUsabilityDigest(d);for(const id of g.assessments)if(typeof id!=='string'||id.length>256)consumptionFail('CONSUMPTION_AUTH_CONFIG');}
  }
  return structuredClone(raw);
}
/** A standalone, read-only server. Credentials are reread for every request. */
export async function startConsumptionHTTP(options:ConsumptionHTTPOptions){
  if(!['127.0.0.1','::1','localhost'].includes(options.host)&&!options.tls)consumptionFail('CONSUMPTION_TLS_REQUIRED');
  if(!Number.isSafeInteger(options.port)||options.port<0||options.port>65535)consumptionFail('CONSUMPTION_LISTEN');
  validateConsumptionAuthorization(options.readAuthorization());
  let active=0;const rates=new Map<string,{start:number;count:number}>();
  function send(res:http.ServerResponse,status:number,value:unknown){const body=JSON.stringify(value);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'none'",'referrer-policy':'no-referrer'});res.end(body);}
  function authenticate(req:http.IncomingMessage):ConsumptionPrincipal|null{
    const auth=req.headers.authorization;if(typeof auth!=='string'||!/^Bearer [A-Za-z0-9_-]{32,256}$/.test(auth))return null;
    const actual=createHash('sha256').update(auth.slice(7)).digest();let matched:ConsumptionCredential|undefined;
    for(const c of validateConsumptionAuthorization(options.readAuthorization()).credentials)if(timingSafeEqual(actual,Buffer.from(c.tokenDigest.slice(7),'hex'))&&c.enabled)matched=c;
    return matched?{id:matched.id,grants:matched.grants}:null;
  }
  const handler=async(req:http.IncomingMessage,res:http.ServerResponse)=>{
    const projectsRoute=req.url==='/v1/projects'&&req.method==='GET';
    // Service clients only: no browser Origin, CORS, URL tokens, forms, or redirects.
    if((!projectsRoute&&(req.url!=='/v1/assets'||req.method!=='POST'))||req.headers.origin){send(res,404,{error:'CONSUMPTION_ROUTE'});req.resume();return;}
    let principal:ConsumptionPrincipal|null;
    try{principal=authenticate(req);}catch{send(res,503,{error:'CONSUMPTION_AUTH_UNAVAILABLE'});req.resume();return;}
    if(!principal){send(res,401,{error:'CONSUMPTION_UNAUTHORIZED'});req.resume();return;}
    const now=Date.now(),last=rates.get(principal.id),bucket=last&&now-last.start<60000?last:{start:now,count:0};bucket.count++;rates.set(principal.id,bucket);
    for(const [id,b]of rates)if(now-b.start>=60000)rates.delete(id);
    if(rates.size>64||bucket.count>CONSUMPTION_LIMITS.requestsPerMinute||active>=CONSUMPTION_LIMITS.concurrency){send(res,429,{error:'CONSUMPTION_LIMIT'});req.resume();return;}
    if(projectsRoute){send(res,200,{items:principal.grants.map(g=>({scope:g.scope,assetCount:g.assets.length,assessments:g.assessments})),authority:false});req.resume();return;}
    if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']){send(res,415,{error:'CONSUMPTION_CONTENT_TYPE'});req.resume();return;}
    if(Number(req.headers['content-length']??0)>CONSUMPTION_LIMITS.requestBytes){send(res,413,{error:'CONSUMPTION_LIMIT'});req.resume();return;}
    active++;
    try{
      const chunks:Buffer[]=[];let bytes=0;
      for await(const chunk of req){const b=Buffer.from(chunk);bytes+=b.length;if(bytes>CONSUMPTION_LIMITS.requestBytes)consumptionFail('CONSUMPTION_LIMIT');chunks.push(b);}
      let request:ConsumptionRequest;try{request=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{consumptionFail('CONSUMPTION_REQUEST');}
      const result=await options.consume(principal,request);const body=JSON.stringify(result);if(Buffer.byteLength(body)>CONSUMPTION_LIMITS.responseBytes)consumptionFail('CONSUMPTION_LIMIT');
      // Revocation while a provider was running also prevents delivery.
      const current=authenticate(req);if(!current||nativeStableSerialize(current)!==nativeStableSerialize(principal))consumptionFail('CONSUMPTION_REVOKED');send(res,200,result);
    }catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'';const allowed=new Set(['CONSUMPTION_LIMIT','CONSUMPTION_FORBIDDEN','CONSUMPTION_REVOKED','CONSUMPTION_DRIFT','CONSUMPTION_PARTIAL','CONSUMPTION_EXTRA','CONSUMPTION_CURSOR','CONSUMPTION_STALE_CURSOR','CONSUMPTION_UNSAFE_PROJECTION','CONSUMPTION_OPERATION','CONSUMPTION_REQUEST','CONSUMPTION_TIMEOUT','READABLE_SNAPSHOT_DRIFT','READABLE_QUERY']);const safe=allowed.has(code)?code:'CONSUMPTION_UNAVAILABLE';if(!res.destroyed)send(res,['CONSUMPTION_FORBIDDEN','CONSUMPTION_REVOKED'].includes(safe)?403:safe==='CONSUMPTION_LIMIT'?413:safe==='CONSUMPTION_TIMEOUT'?504:400,{error:safe});}
    finally{active--;}
  };
  const server=options.tls?https.createServer({key:options.tls.key,cert:options.tls.cert,minVersion:'TLSv1.2',maxHeaderSize:8192},handler):http.createServer({maxHeaderSize:8192},handler);
  server.requestTimeout=10000;server.headersTimeout=10000;server.timeout=20000;server.keepAliveTimeout=2000;server.maxConnections=16;
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port,options.host,()=>{server.off('error',reject);resolve();});});
  const address=server.address() as AddressInfo;
  return {address:{host:address.address,port:address.port,tls:!!options.tls},close:()=>new Promise<void>((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections();})};
}
