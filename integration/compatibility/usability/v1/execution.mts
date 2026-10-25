import {usabilityDigest,usabilityStable,usabilityFail as fail,validateUsabilityDigest} from './contract.mjs';

export interface ExecutionPolicy {
  schema:'evopilot-execution-policy/v1';
  externalNetwork:'DENY';internalTransport:'NONE'|'OWNED_LOOPBACK';childProcesses:'DENY'|'BROKERED_OWNED';
  originalSource:'DENY';hiddenOracle:'DENY';priorOutputs:'DENY';hostCredentials:'DENY';
  brokerDigest:string;dependencyManifestDigest:string;
}
export interface ExecutionEvidence {
  policy:ExecutionPolicy;policyDigest:string;enforcementDigest:string;
  externalConnections:number;unrelatedPeerConnections:number;allOwnedProcessesClosed:boolean;
}
export interface ReconstructionDependencies {
  schema:'evopilot-reconstruction-dependencies/v1';
  dependencies:{id:string;kind:'NORMATIVE_COMPATIBILITY'|'THIRD_PARTY';version:string;purpose:string;license:string;
    files:{path:string;bytes:number;digest:string}[]}[];
}
function exact(v:unknown,keys:string[]):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail('EXECUTION_AUTHORITY_SCHEMA');return v as Record<string,unknown>;}
function text(v:unknown,max=512):asserts v is string{if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0'))fail('EXECUTION_AUTHORITY_SCHEMA');}
function count(v:unknown):asserts v is number{if(!Number.isSafeInteger(v)||(v as number)<0)fail('EXECUTION_AUTHORITY_SCHEMA');}
export function validateExecutionPolicy(raw:unknown):ExecutionPolicy{
  usabilityStable(raw);const p=exact(raw,['schema','externalNetwork','internalTransport','childProcesses','originalSource','hiddenOracle','priorOutputs','hostCredentials','brokerDigest','dependencyManifestDigest']);
  if(p.schema!=='evopilot-execution-policy/v1'||['externalNetwork','originalSource','hiddenOracle','priorOutputs','hostCredentials'].some(k=>p[k]!=='DENY')||!['NONE','OWNED_LOOPBACK'].includes(String(p.internalTransport))||!['DENY','BROKERED_OWNED'].includes(String(p.childProcesses)))fail('EXECUTION_AUTHORITY_POLICY');
  if(p.internalTransport==='OWNED_LOOPBACK'&&p.childProcesses!=='BROKERED_OWNED')fail('EXECUTION_AUTHORITY_POLICY');
  validateUsabilityDigest(p.brokerDigest);validateUsabilityDigest(p.dependencyManifestDigest);return JSON.parse(usabilityStable(raw)) as ExecutionPolicy;
}
export function validateExecutionEvidence(raw:unknown):ExecutionEvidence{
  usabilityStable(raw);const e=exact(raw,['policy','policyDigest','enforcementDigest','externalConnections','unrelatedPeerConnections','allOwnedProcessesClosed']);
  const policy=validateExecutionPolicy(e.policy);validateUsabilityDigest(e.policyDigest);validateUsabilityDigest(e.enforcementDigest);
  if(e.policyDigest!==usabilityDigest(policy))fail('EXECUTION_AUTHORITY_BINDING');count(e.externalConnections);count(e.unrelatedPeerConnections);if(typeof e.allOwnedProcessesClosed!=='boolean')fail('EXECUTION_AUTHORITY_SCHEMA');
  return JSON.parse(usabilityStable(raw)) as ExecutionEvidence;
}
export function executionIsolated(e:ExecutionEvidence):boolean{return e.externalConnections===0&&e.unrelatedPeerConnections===0&&e.allOwnedProcessesClosed;}
export function validateReconstructionDependencies(raw:unknown):ReconstructionDependencies{
  usabilityStable(raw);const m=exact(raw,['schema','dependencies']);if(m.schema!=='evopilot-reconstruction-dependencies/v1'||!Array.isArray(m.dependencies)||m.dependencies.length>128)fail('EXECUTION_DEPENDENCY_SCHEMA');
  const ids=new Set<string>();let files=0,bytes=0;
  for(const value of m.dependencies){const d=exact(value,['id','kind','version','purpose','license','files']);text(d.id,128);text(d.version,128);text(d.purpose,8192);text(d.license,512);
    if(ids.has(d.id)||!['NORMATIVE_COMPATIBILITY','THIRD_PARTY'].includes(String(d.kind))||!Array.isArray(d.files)||!d.files.length)fail('EXECUTION_DEPENDENCY_SCHEMA');ids.add(d.id);const names=new Set<string>();
    for(const value of d.files){const f=exact(value,['path','bytes','digest']);text(f.path,240);if(!/^[A-Za-z0-9_@.$-]+(?:\/[A-Za-z0-9_@.$-]+)*$/.test(f.path)||f.path.split('/').some(x=>x==='.'||x==='..')||f.path!==f.path.normalize('NFC')||names.has(f.path.toLowerCase()))fail('EXECUTION_DEPENDENCY_PATH');names.add(f.path.toLowerCase());count(f.bytes);validateUsabilityDigest(f.digest);files++;bytes+=f.bytes;if(files>16384||bytes>268435456)fail('EXECUTION_DEPENDENCY_LIMIT');}
  }
  return JSON.parse(usabilityStable(raw)) as ReconstructionDependencies;
}
