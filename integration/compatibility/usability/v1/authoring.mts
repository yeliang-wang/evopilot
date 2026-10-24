import {usabilityStable, type UsabilityScope, type UsabilityLevel} from './contract.mjs';
import {isPromise} from 'node:util/types';

/** A trusted host resolves this from reviewed project/source state, never request flags. */
export interface NativeAuthoringRequest {
  workspaceId: string; scope: UsabilityScope; owner: 'ontology'|'harness';
  packageDigest: string; sourceBindingsDigest: string; sourceDirection: 'forward'|'reverse';
}
export interface NativeAuthoringAdmission extends NativeAuthoringRequest {
  schema: 'evopilot-native-authoring-admission/v1';
  candidateDigest: string; sourceInventoryDigest: string; requirementsDigest: string;
  modelingIntentDigest: string|null; targetLevel: UsabilityLevel|null; authority: false;
}
export type NativeAuthoringResolver = (request: Readonly<NativeAuthoringRequest>) => NativeAuthoringAdmission;
function fail(code: string): never {throw Object.assign(new Error(code),{code});}
const digest=(v: unknown)=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
const text=(v: unknown)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=128;
function copy<T>(value: T): T {
  const result=JSON.parse(usabilityStable(value)) as T;
  function freeze(v: unknown): void {if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}}
  freeze(result);return result;
}
/** Synchronous trusted host callback; implementations must use bounded local reads. A technical admission never grants a level or publication. */
export function requireNativeAuthoring(resolve: NativeAuthoringResolver|undefined, request: NativeAuthoringRequest, retained?: NativeAuthoringAdmission): NativeAuthoringAdmission {
  if(typeof resolve!=='function')fail('AUTHORING_CONTEXT_REQUIRED');
  const pinned=copy(request);
  if(!text(pinned.workspaceId)||!text(pinned.scope.projectId)||!['public','private'].includes(pinned.scope.visibility)||!['ontology','harness'].includes(pinned.owner)||!['forward','reverse'].includes(pinned.sourceDirection)||!digest(pinned.packageDigest)||!digest(pinned.sourceBindingsDigest))fail('AUTHORING_CONTEXT_INVALID');
  let actual: NativeAuthoringAdmission;
  try {
    const value=resolve(pinned);
    if(isPromise(value)){void Promise.prototype.then.call(value,()=>{},()=>{});fail('AUTHORING_CONTEXT_INVALID');}
    actual=copy(value);
  }
  catch(error) {
    // Preserve only the finite gate diagnostics, never arbitrary provider details.
    const code=error&&typeof error==='object'&&'code' in error?error.code:undefined;
    if(typeof code==='string'&&['AUTHORING_CONTEXT_REQUIRED','AUTHORING_CONTEXT_STALE','AUTHORING_CONTEXT_AMBIGUOUS','MODELING_INTENT_REQUIRED','MODELING_INTENT_INVALID','MODELING_INTENT_STALE','MODELING_INTENT_ACCEPTANCE','MODELING_INTENT_LEVEL','MODELING_INTENT_AMBIGUOUS','HUMAN_EVIDENCE_REQUIRED'].includes(code))fail(code);
    fail('AUTHORING_CONTEXT_INVALID');
  }
  const keys=['schema','workspaceId','scope','owner','packageDigest','sourceBindingsDigest','sourceDirection','candidateDigest','sourceInventoryDigest','requirementsDigest','modelingIntentDigest','targetLevel','authority'];
  if(!actual||typeof actual!=='object'||Object.keys(actual).length!==keys.length||keys.some(k=>!Object.hasOwn(actual,k)))fail('AUTHORING_CONTEXT_INVALID');
  if(actual.schema!=='evopilot-native-authoring-admission/v1'||actual.authority!==false||!digest(actual.candidateDigest)||!digest(actual.sourceInventoryDigest)||!digest(actual.requirementsDigest))fail('AUTHORING_CONTEXT_INVALID');
  for(const key of ['workspaceId','scope','owner','packageDigest','sourceBindingsDigest','sourceDirection'] as const)if(usabilityStable(actual[key])!==usabilityStable(pinned[key]))fail('AUTHORING_CONTEXT_STALE');
  if(actual.sourceDirection==='reverse'){
    if(!digest(actual.modelingIntentDigest)||!['L1','L2','L3'].includes(actual.targetLevel??''))fail('AUTHORING_CONTEXT_REQUIRED');
  }else if(actual.modelingIntentDigest!==null||actual.targetLevel!==null)fail('AUTHORING_CONTEXT_INVALID');
  if(retained&&usabilityStable(actual)!==usabilityStable(retained))fail('AUTHORING_CONTEXT_STALE');
  return actual;
}
