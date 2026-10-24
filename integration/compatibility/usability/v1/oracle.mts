import {validateEvaluationEvidence} from './evaluation.mjs';
import type {EvaluationEvidence} from './evaluation.mjs';
import {validateExecutionEvidence,executionIsolated} from './execution.mjs';
import type {ExecutionEvidence} from './execution.mjs';
import {BEHAVIOR_FACETS,usabilityStable,usabilityDigest,usabilityFail as fail,validateUsabilityScope,validateUsabilityDigest} from './contract.mjs';
import type {BehaviorFacet,UsabilityScope} from './contract.mjs';

export type OracleJSON=null|boolean|number|string|OracleJSON[]|{[key:string]:OracleJSON};
export interface BehaviorObservation {output:OracleJSON;state:OracleJSON;error:OracleJSON;effects:OracleJSON[]}
export interface OracleTolerance {field:'output'|'state';path:string[];absolute:number;relative:number}
export interface BehaviorOracle {
  schema:'evopilot-behavior-oracle/v1';
  author:{actor:string;independent:boolean;origin:'ACTUAL'|'SYNTHETIC'};
  cases:{id:string;behaviorId:string;facets:BehaviorFacet[];purpose:string;input:OracleJSON;expected:BehaviorObservation;tolerances:OracleTolerance[]}[];
  negativeControls:{id:string;caseId:string;purpose:string;actual:BehaviorObservation}[];
}
interface ReconstructionObservationFields {
  workspaceId:string;scope:UsabilityScope;attemptId:string;
  inventoryDigest:string;specificationDigest:string;oracleDigest:string;inputManifestDigest:string;
  environmentDigest:string;dependenciesDigest:string;outputDigest:string;executorDigest:string;
  origin:'ACTUAL'|'SYNTHETIC';inputMode:'ASSETS_ONLY'|'SOURCE_ASSISTED';independent:boolean;isolated:boolean;
  status:'SUCCEEDED'|'FAILED'|'INCOMPLETE'|'UNKNOWN';
  execution?:{planDigest:string;claimId:string;cleanWorkspaceId:string;receiptDigest:string};
  cases:{caseId:string;inputDigest:string;status:'COMPLETE'|'FAILED'|'SKIPPED'|'UNKNOWN';actual:BehaviorObservation|null}[];
  digest:string;
}
export type ReconstructionObservation=ReconstructionObservationFields&({schema:'evopilot-reconstruction-observation/v1'}|{schema:'evopilot-reconstruction-observation/v2';authority:ExecutionEvidence}|{schema:'evopilot-reconstruction-observation/v3';authority:ExecutionEvidence;evaluation:EvaluationEvidence});
export interface BehaviorOracleResult {
  schema:'evopilot-behavior-oracle-result/v1';workspaceId:string;scope:UsabilityScope;bindingDigest:string;attemptId:string;
  oracleDigest:string;observationDigest:string|null;outputDigest:string|null;
  status:'PASS'|'FAIL'|'INCOMPLETE'|'STALE'|'UNSUPPORTED';
  denominator:number;results:{caseId:string;status:'PASS'|'FAIL'|'INCOMPLETE';differences:string[]}[];
  negativeControls:{required:number;rejected:number};gaps:string[];
  assessedAt:string;verifiedLevel:null;authority:false;softwareRelease:false;digest:string;
}
export const ORACLE_OBSERVABLE_FACETS=Object.freeze(['outputs','states','errors','sideEffects','idempotency','concurrency','recovery'] as const);
export const ORACLE_LIMITS=Object.freeze({cases:256,negativeControls:128,tolerancesPerCase:32});
function exact(v:unknown,keys:string[],optional:string[]=[]):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||keys.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!keys.includes(k)&&!optional.includes(k)))fail('ORACLE_SCHEMA');return v as Record<string,unknown>;}
function text(v:unknown,max=512):asserts v is string{if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0'))fail('ORACLE_SCHEMA');}
function id(v:unknown):asserts v is string{text(v,128);if(!/^[a-z0-9][a-z0-9:._-]*$/.test(v))fail('ORACLE_SCHEMA');}
function array(v:unknown,max:number):unknown[]{if(!Array.isArray(v)||v.length>max)fail('ORACLE_LIMIT');return v;}
function unique(rows:unknown[],key:(v:unknown)=>unknown){if(new Set(rows.map(key)).size!==rows.length)fail('ORACLE_DUPLICATE');}
function observation(v:unknown):void{const r=exact(v,['output','state','error','effects']);array(r.effects,4096);}
function at(value:OracleJSON,path:string[]):OracleJSON|undefined{let v:OracleJSON|undefined=value;for(const k of path){if(!v||typeof v!=='object'||!Object.hasOwn(v,k))return undefined;v=(v as Record<string,OracleJSON>)[k];}return v;}
export function compareBehavior(expected:BehaviorObservation,actual:BehaviorObservation,tolerances:OracleTolerance[]):string[]{
  const differences:string[]=[];
  function compare(a:OracleJSON,b:OracleJSON,field:string,path:string[]){
    const tolerance=tolerances.find(t=>t.field===field&&usabilityStable(t.path)===usabilityStable(path));
    if(tolerance&&typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<=tolerance.absolute+tolerance.relative*Math.abs(a))return;
    if(usabilityStable(a)===usabilityStable(b))return;
    if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)&&usabilityStable(Object.keys(a).sort())===usabilityStable(Object.keys(b).sort())){
      for(const key of Object.keys(a))compare((a as Record<string,OracleJSON>)[key]!, (b as Record<string,OracleJSON>)[key]!,field,[...path,key]);
    }else differences.push(field+':'+usabilityStable(path));
  }
  for(const field of ['output','state','error','effects'] as const)compare(expected[field],actual[field],field,[]);
  return differences;
}
export function validateBehaviorOracle(raw:unknown):BehaviorOracle{
  usabilityStable(raw);const r=exact(raw,['schema','author','cases','negativeControls']);if(r.schema!=='evopilot-behavior-oracle/v1')fail('ORACLE_SCHEMA');
  const author=exact(r.author,['actor','independent','origin']);text(author.actor,256);if(typeof author.independent!=='boolean'||!['ACTUAL','SYNTHETIC'].includes(String(author.origin)))fail('ORACLE_SCHEMA');
  const cases=array(r.cases,ORACLE_LIMITS.cases);if(!cases.length)fail('ORACLE_EMPTY');
  for(const value of cases){const c=exact(value,['id','behaviorId','facets','purpose','input','expected','tolerances']);id(c.id);id(c.behaviorId);text(c.purpose,8192);observation(c.expected);
    const facets=array(c.facets,BEHAVIOR_FACETS.length);if(!facets.length||facets.some(f=>!BEHAVIOR_FACETS.includes(f as BehaviorFacet)))fail('ORACLE_SCHEMA');unique(facets,x=>x);
    const tolerances=array(c.tolerances,ORACLE_LIMITS.tolerancesPerCase);
    for(const rawTolerance of tolerances){const t=exact(rawTolerance,['field','path','absolute','relative']);if(!['output','state'].includes(String(t.field)))fail('ORACLE_SCHEMA');const path=array(t.path,24);for(const k of path){text(k);if(['__proto__','prototype','constructor'].includes(k as string))fail('ORACLE_SCHEMA');}for(const key of ['absolute','relative'])if(typeof t[key]!=='number'||!Number.isFinite(t[key])||t[key]<0)fail('ORACLE_SCHEMA');
      if(typeof at((c.expected as BehaviorObservation)[t.field as 'output'|'state'],path as string[])!=='number')fail('ORACLE_TOLERANCE');
    }unique(tolerances,x=>{const t=x as OracleTolerance;return usabilityStable([t.field,t.path]);});
  }unique(cases,x=>(x as {id:string}).id);
  const controls=array(r.negativeControls,ORACLE_LIMITS.negativeControls);if(!controls.length)fail('ORACLE_CONTROLS_REQUIRED');
  for(const value of controls){const c=exact(value,['id','caseId','purpose','actual']);id(c.id);id(c.caseId);text(c.purpose,8192);observation(c.actual);const target=(cases as BehaviorOracle['cases']).find(x=>x.id===c.caseId);if(!target)fail('ORACLE_UNKNOWN_CASE');if(!compareBehavior(target.expected,c.actual as BehaviorObservation,target.tolerances).length)fail('ORACLE_INEFFECTIVE_CONTROL');}unique(controls,x=>(x as {id:string}).id);
  return JSON.parse(usabilityStable(raw)) as BehaviorOracle;
}
export const behaviorOracleDigest=(oracle:BehaviorOracle):string=>usabilityDigest(validateBehaviorOracle(oracle));
export function validateReconstructionObservation(raw:unknown):ReconstructionObservation{
  usabilityStable(raw);const v3=!!raw&&typeof raw==='object'&&'schema'in raw&&raw.schema==='evopilot-reconstruction-observation/v3';const v2=v3||!!raw&&typeof raw==='object'&&'schema'in raw&&raw.schema==='evopilot-reconstruction-observation/v2';const r=exact(raw,['schema','workspaceId','scope','attemptId','inventoryDigest','specificationDigest','oracleDigest','inputManifestDigest','environmentDigest','dependenciesDigest','outputDigest','executorDigest','origin','inputMode','independent','isolated','status','cases','digest',...(v2?['authority']:[]),...(v3?['evaluation']:[])],['execution']);
  if(!['evopilot-reconstruction-observation/v1','evopilot-reconstruction-observation/v2','evopilot-reconstruction-observation/v3'].includes(String(r.schema)))fail('ORACLE_SCHEMA');id(r.workspaceId);id(r.attemptId);validateUsabilityScope(r.scope);
  for(const k of ['inventoryDigest','specificationDigest','oracleDigest','inputManifestDigest','environmentDigest','dependenciesDigest','outputDigest','executorDigest','digest'])validateUsabilityDigest(r[k]);
  if(!['ACTUAL','SYNTHETIC'].includes(String(r.origin))||!['ASSETS_ONLY','SOURCE_ASSISTED'].includes(String(r.inputMode))||typeof r.independent!=='boolean'||typeof r.isolated!=='boolean'||!['SUCCEEDED','FAILED','INCOMPLETE','UNKNOWN'].includes(String(r.status)))fail('ORACLE_SCHEMA');
  if(v2){const authority=validateExecutionEvidence(r.authority);if(r.isolated!==executionIsolated(authority))fail('ORACLE_AUTHORITY_BINDING');}
  if(v3){const e=validateEvaluationEvidence(r.evaluation),p=e.plan;if(p.workspaceId!==r.workspaceId||usabilityStable(p.scope)!==usabilityStable(r.scope)||p.reconstruction.attemptId!==r.attemptId||p.reconstruction.outputDigest!==r.outputDigest||p.origin!==r.origin||['oracleDigest','environmentDigest','dependenciesDigest'].some(k=>p[k as keyof typeof p]!==r[k])||e.receipt.status!=='SUCCEEDED')fail('ORACLE_EVALUATION_BINDING');if(!r.execution)fail('ORACLE_EVALUATION_BINDING');const x=r.execution as Record<string,unknown>;if(x.planDigest!==p.reconstruction.planDigest||x.claimId!==p.reconstruction.claimId||x.receiptDigest!==p.reconstruction.receiptDigest)fail('ORACLE_EVALUATION_BINDING');}
  if(r.execution!==undefined){const execution=exact(r.execution,['planDigest','claimId','cleanWorkspaceId','receiptDigest']);for(const k of ['planDigest','claimId','receiptDigest'])validateUsabilityDigest(execution[k]);text(execution.cleanWorkspaceId,256);}
  const cases=array(r.cases,ORACLE_LIMITS.cases);for(const value of cases){const c=exact(value,['caseId','inputDigest','status','actual']);id(c.caseId);validateUsabilityDigest(c.inputDigest);if(!['COMPLETE','FAILED','SKIPPED','UNKNOWN'].includes(String(c.status)))fail('ORACLE_SCHEMA');if(c.actual!==null)observation(c.actual);if(c.status==='COMPLETE'&&c.actual===null)fail('ORACLE_SCHEMA');}unique(cases,x=>(x as {caseId:string}).caseId);
  const {digest,...body}=r;if(digest!==usabilityDigest(body))fail('ORACLE_RECEIPT_DIGEST');return JSON.parse(usabilityStable(raw)) as ReconstructionObservation;
}
