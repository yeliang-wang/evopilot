import {BEHAVIOR_FACETS, usabilityDigest, usabilityStable, usabilityFail, validateUsabilityDigest, validateUsabilityScope} from './contract.mjs';
import type {UsabilityInventory, UsabilityScope, UsabilityLevel, UsabilityPins} from './contract.mjs';

export type UsabilityVerdict = 'PASS'|'FAIL'|'UNKNOWN'|'UNSUPPORTED';
export interface UsabilitySemanticReport {
  schema: 'evopilot-usability-semantic-report/v1'; workspaceId: string; scope: UsabilityScope;
  inventoryDigest: string; specificationDigest: string; actor: string;
  inputMode: 'ASSETS_ONLY'; independent: boolean; origin: 'ACTUAL'|'SYNTHETIC';
  results: {criterionId: string; status: UsabilityVerdict; reason: string; evidenceDigests: string[]}[];
}
export interface UsabilityAssessmentResult {
  schema: 'evopilot-usability-assessment-result/v1'; workspaceId: string; scope: UsabilityScope;
  standardDigest:string;assessedAt:string;assessor:{actor:string;independent:boolean;origin:'ACTUAL'|'SYNTHETIC'}|null;
  inventoryDigest: string; specificationDigest: string; slice: UsabilityInventory['slice'];
  targetLevel: UsabilityLevel; verifiedLevel: UsabilityLevel|null;
  assessmentStatus: 'VERIFIED'|'FAILED'|'INCOMPLETE'|'STALE'|'UNSUPPORTED';
  pins: UsabilityPins; denominator: {questions: number; behaviorFacets: number; excludedBehaviorFacets:number; required: number};
  gaps: {requirementId: string; code: string}[]; semanticReportDigest: string|null;
  reconstructionEvidence: string[]; authority: false; softwareRelease: false; digest: string;
}
export const semanticCriteria=(inventory:UsabilityInventory):{id:string;level:'L1'|'L2'}[]=>[
  ...inventory.questions.map(q=>({id:'question:'+q.id,level:'L1' as const})),
  ...(inventory.targetLevel==='L1'?[]:inventory.behaviors).flatMap(b=>BEHAVIOR_FACETS.filter(f=>!b.excludedFacets.some(e=>e.facet===f)).map(f=>({id:'behavior:'+b.id+':'+f,level:'L2' as const}))),
];
function exact(value:unknown,keys:string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.sort().join(','))usabilityFail('USABILITY_SCHEMA');return value as Record<string,unknown>;
}
export function validateSemanticReport(value:unknown):UsabilitySemanticReport {
  usabilityStable(value);const r=exact(value,['schema','workspaceId','scope','inventoryDigest','specificationDigest','actor','inputMode','independent','origin','results']);
  if(r.schema!=='evopilot-usability-semantic-report/v1'||r.inputMode!=='ASSETS_ONLY'||!['ACTUAL','SYNTHETIC'].includes(String(r.origin))||typeof r.independent!=='boolean'||typeof r.actor!=='string'||!r.actor.trim()||r.actor.length>256||typeof r.workspaceId!=='string'||!r.workspaceId.trim())usabilityFail('USABILITY_SCHEMA');
  validateUsabilityScope(r.scope);validateUsabilityDigest(r.inventoryDigest);validateUsabilityDigest(r.specificationDigest);
  if(!Array.isArray(r.results)||r.results.length>1024)usabilityFail('USABILITY_LIMIT');
  const ids=new Set<string>();for(const item of r.results){const row=exact(item,['criterionId','status','reason','evidenceDigests']);
    if(typeof row.criterionId!=='string'||!row.criterionId||ids.has(row.criterionId)||!['PASS','FAIL','UNKNOWN','UNSUPPORTED'].includes(String(row.status))||typeof row.reason!=='string'||!row.reason.trim()||row.reason.length>8192||!Array.isArray(row.evidenceDigests)||row.evidenceDigests.length>128)usabilityFail('USABILITY_SCHEMA');
    ids.add(row.criterionId);row.evidenceDigests.forEach(validateUsabilityDigest);if(new Set(row.evidenceDigests).size!==row.evidenceDigests.length)usabilityFail('USABILITY_DUPLICATE');
  }
  return JSON.parse(usabilityStable(value)) as UsabilitySemanticReport;
}
/** A report is still evidence, not an authorization or a request-supplied grade. */
export function semanticReportDigest(report:UsabilitySemanticReport):string{return usabilityDigest(validateSemanticReport(report));}
