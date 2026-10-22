import type { FeedbackEnvelope, FeedbackEvent, FeedbackInbox, FeedbackOwner, FeedbackMaterial } from './compatibility/feedback/v1/feedback.mjs';
import type {OnlineEnvelope,OnlineFinding,OnlineRepairCandidate,OnlineHarnessProviders,OnlineRuntimeProviders} from './compatibility/online/v1/online.mjs';
import { nativeAssertJSON, nativeExact, nativeSha256, nativeStableSerialize, nativePackageDigest, referenceForPackage, validateNativeReference, NATIVE_CONTRACT_DIGEST } from './compatibility/v1/native.mjs';
import type { NativePackage, NativeReference, NativeToolchain, NativeScope, StandardPins, NativeJSON } from './compatibility/v1/native.mjs';
import type { NativeRuntimeProviders, NativeRunClaim, NativeRun, NativeMaterial, NativeOwnerReceipt, NativeProviderReceipt } from '@evopilot-next/runtime/service';
import type { NativeOntologyValidation, NativeOntologyRecord } from '@evopilot-next/ontology';
import type { NativeHarnessReport, HarnessObservation } from '@evopilot-next/harness/native';
import type { Options, ProductService, Owner, Envelope } from './types.js';
import type { ResponseEnvelope, ResponseRuntimeProviders, ResponseEvidenceRef, ResponseEvidence, ResponseRecovery, ResponseProblem, RunbookPin, ResolvedResponseRunbook, ResponseExecutionVerification } from './compatibility/response/v1/response.mjs';
import { readRuntimeResponseEvidence, requestResponseCollectionCancellation } from './response/evidence.js';

export interface NativeIntegrationConfiguration extends Pick<NativeRuntimeProviders, 'collect' | 'inspectCollection' | 'inspectSource' | 'resolveRequirements' | 'verifyProject'> {
  toolchain?: NativeToolchain;
  online?:Pick<OnlineHarnessProviders,'collectOnline'|'inspectOnlineAlert'>;
  readResponseWorkspaceEvidence?: (input: { scope: NativeScope; reference: ResponseEvidenceRef }) => Promise<ResponseEvidence> | ResponseEvidence;
}
export interface NativeIntegrationAPIs {
  ontology: { inspectOntologyStandard?: () => StandardPins & { contractDigest: string } };
  harness: { inspectHarnessStandard?: () => StandardPins & { contractDigest: string }; inspectHarnessPackage?: (pkg: unknown) => { parameters: Record<string, NativeJSON>; effectiveConfigDigest: string } };
}
interface Published { reference: NativeReference; scope: NativeScope; package: NativePackage; materialDigest: string }
type NativeService = ProductService & { native(request: Envelope): Promise<unknown> };
const same = (a: unknown, b: unknown) => nativeStableSerialize(a) === nativeStableSerialize(b);
function fail(code: string, message = code): never { throw Object.assign(new Error(message), { code }); }
export function createNativeIntegration(options: Options, apis: NativeIntegrationAPIs, getService: (owner: Owner) => ProductService, configuration: NativeIntegrationConfiguration = {}) {
  function service(owner: Owner): NativeService {
    const instance = getService(owner);
    if (typeof instance.native !== 'function') fail('NATIVE_API_UNAVAILABLE');
    return instance as NativeService;
  }
  function standards() {
    if (!apis.ontology.inspectOntologyStandard || !apis.harness.inspectHarnessStandard) fail('NATIVE_API_UNAVAILABLE');
    const ontology = apis.ontology.inspectOntologyStandard(), harness = apis.harness.inspectHarnessStandard();
    for (const value of [ontology, harness]) if (value.contractDigest !== NATIVE_CONTRACT_DIGEST) fail('CONTRACT_MISMATCH');
    const pins = (s: StandardPins) => ({ standardDigest: s.standardDigest, standardLockDigest: s.standardLockDigest });
    return { ontology: pins(ontology), harness: pins(harness) };
  }
  async function published(reference: NativeReference, consumer: NativeScope): Promise<Published> {
    validateNativeReference(reference);
    if (consumer.visibility === 'public' && reference.visibility === 'private') fail('SCOPE_MISMATCH');
    if (!same({ standardDigest: reference.standardDigest, standardLockDigest: reference.standardLockDigest }, standards()[reference.product])) fail('STANDARD_MISMATCH');
    const scopes = reference.visibility === 'private' ? [consumer] : [...new Set([consumer.projectId, 'shared'])].map(projectId => ({ projectId, visibility: 'public' as const }));
    const found: Published[] = [];
    for (const scope of scopes) {
      let record: { reference: NativeReference | null; scope: NativeScope; package: NativePackage; published?: boolean; workspaceId?: string; workspace?: { id: string; canonicalRoot: string } };
      try { record = await service(reference.product).native({ operation: 'native.package.readback', scope, input: { id: reference.id, version: reference.version } }) as typeof record; }
      catch (error) { if (['NOT_FOUND', 'NOT_PUBLISHED'].includes(String((error as { code?: string }).code))) continue; throw error; }
      if (!record.reference || !same(record.reference, reference) || !same(record.scope, scope) || !same(referenceForPackage(record.package), reference)) fail('MATERIAL_INTEGRITY');
      if (reference.product === 'ontology' ? record.workspace?.id !== options.workspaceId || record.workspace.canonicalRoot !== options.workspaceRoot : record.workspaceId !== options.workspaceId || record.published !== true) fail('MATERIAL_SCOPE');
      found.push({ reference, scope, package: record.package, materialDigest: nativePackageDigest(record.package) });
    }
    if (found.length !== 1) fail(found.length ? 'MATERIAL_AMBIGUOUS' : 'MATERIAL_UNAVAILABLE');
    return found[0];
  }
  async function resolveNative(request: Parameters<NonNullable<NativeRuntimeProviders['resolveNative']>>[0]): Promise<NativeMaterial> {
    if (request.workspace.id !== options.workspaceId || request.workspace.canonicalRoot !== options.workspaceRoot || request.workspace.schema !== 'evopilot-workspace/v1') fail('MATERIAL_SCOPE');
    const value = await published(request.reference, request.scope);
    return { reference: value.reference, workspace: request.workspace, scope: value.scope, published: true, materialDigest: value.materialDigest,
      descriptor: { kind: request.reference.product === 'ontology' ? 'ontology-composition/v1' : 'harness-composition/v1', digest: value.materialDigest } };
  }
  async function claimInputs(claim: Readonly<NativeRunClaim>) {
    const run = await service('runtime').native({ operation: 'run.inspect', scope: claim.scope, input: { id: claim.id } }) as NativeRun;
    if (!same(run.claim, claim) || claim.inputDigest !== nativeSha256(claim.input)) fail('CLAIM_MISMATCH');
    const ontology = await published(claim.pins.ontology, claim.scope), harness = await published(claim.pins.harness, claim.scope);
    nativeExact(claim.input.nativeInputs.ontology, ['packageDigest']);
    if ((claim.input.nativeInputs.ontology as { packageDigest: string }).packageDigest !== nativePackageDigest(ontology.package)) fail('CLAIM_INPUT_MISMATCH');
    nativeExact(claim.input.nativeInputs.harness, ['observation']);
    if (!apis.harness.inspectHarnessPackage) fail('NATIVE_API_UNAVAILABLE');
    const parameters = apis.harness.inspectHarnessPackage(harness.package);
    if (!same(claim.input.effectiveConfig, { params: parameters.parameters }) || claim.context.effectiveConfigDigest !== parameters.effectiveConfigDigest) fail('CONFIGURATION_MISMATCH');
    return { ontology, harness };
  }
  const validationId = (claim: Readonly<NativeRunClaim>, owner: 'ontology' | 'harness') => 'native-' + owner + '-' + nativeSha256({ claimId: claim.claimId }).slice(7, 47);
  function validationInput(claim: Readonly<NativeRunClaim>, owner: 'ontology' | 'harness') {
    const identity = { id: claim.pins[owner].id, version: claim.pins[owner].version, context: claim.context };
    return owner === 'ontology' ? identity : { ...identity, observation: (claim.input.nativeInputs.harness as unknown as { observation: HarnessObservation }).observation };
  }
  async function readOwnerReceipt({ owner, requestId, scope, claim }: Parameters<NonNullable<NativeRuntimeProviders['readOwnerReceipt']>>[0]): Promise<NativeOwnerReceipt> {
    if (!same(scope, claim.scope) || requestId !== validationId(claim, owner)) fail('RECEIPT_MISMATCH');
    const materials = await claimInputs(claim), actualScope = materials[owner].scope;
    const retained = await service(owner).native({ operation: 'native.receipt.inspect', scope: actualScope, input: { requestId } }) as {
      requestId: string; operation: string; scope: NativeScope; requestDigest: string; result: NativeOntologyValidation | NativeHarnessReport;
    };
    const input = validationInput(claim, owner);
    if (retained.requestId !== requestId || retained.operation !== 'native.package.validate' || !same(retained.scope, actualScope)
      || retained.requestDigest !== nativeSha256({ operation: 'native.package.validate', scope: actualScope, input })) fail('RECEIPT_MISMATCH');
    const report = retained.result;
    if (!report || !same(report.context, claim.context) || report.toolchainLockDigest !== configuration.toolchain?.lockDigest) fail('RECEIPT_MISMATCH');
    const { reportDigest, ...body } = report;
    if (reportDigest !== nativeSha256(body)) fail('REPORT_INTEGRITY');
    let executionStatus: NativeOwnerReceipt['executionStatus'], qualityStatus: NativeOwnerReceipt['qualityStatus'];
    if (owner === 'harness') {
      const value = report as NativeHarnessReport;
      if (!same(value.reference, claim.pins.harness)) fail('RECEIPT_MISMATCH');
      executionStatus = value.executionStatus; qualityStatus = value.qualityStatus;
    } else {
      const value = report as NativeOntologyValidation;
      if (value.packageDigest !== nativePackageDigest(materials.ontology.package) || !same(value.standardPins, claim.input.standardPins.ontology)) fail('RECEIPT_MISMATCH');
      executionStatus = value.status === 'UNKNOWN' ? 'UNKNOWN' : value.status === 'ERROR' ? 'ERROR' : 'SUCCEEDED';
      qualityStatus = value.status === 'CONFORMS' ? 'PASS' : value.status === 'NONCONFORMING' ? 'FAIL' : value.status === 'UNSUPPORTED' ? 'UNSUPPORTED' : value.status === 'UNKNOWN' ? 'INDETERMINATE' : 'ERROR';
    }
    return { owner, requestId, receiptDigest: nativeSha256(retained), reference: claim.pins[owner], context: claim.context, executionStatus, qualityStatus, reportDigest, criteria: report.criteria };
  }
  async function receipt(claim: Readonly<NativeRunClaim>): Promise<NativeProviderReceipt> {
    const ontology = await readOwnerReceipt({ owner: 'ontology', requestId: validationId(claim, 'ontology'), scope: claim.scope, claim });
    const harness = await readOwnerReceipt({ owner: 'harness', requestId: validationId(claim, 'harness'), scope: claim.scope, claim });
    return { schema: 'runtime-receipt/v1', contractDigest: NATIVE_CONTRACT_DIGEST, producer: { product: 'runtime', version: '0.3.0' }, claimId: claim.claimId,
      inputDigest: claim.inputDigest, projectCandidateDigest: claim.input.projectCandidateDigest, pins: claim.pins, standardPins: claim.input.standardPins, ownerReceipts: { ontology, harness } };
  }
  async function executeNative({ claim, signal }: Parameters<NonNullable<NativeRuntimeProviders['executeNative']>>[0]) {
    if (signal.aborted) fail('ABORTED');
    const materials = await claimInputs(claim);
    for (const owner of ['ontology', 'harness'] as const) {
      if (signal.aborted) fail('ABORTED');
      const instance = service(owner), scope = materials[owner].scope;
      const state = instance.execute({ operation: 'workspace.inspect', scope, input: {} }) as { revision: number };
      await instance.native({ operation: 'native.package.validate', scope, input: validationInput(claim, owner), requestId: validationId(claim, owner), expectedRevision: state.revision });
    }
    if (signal.aborted) fail('ABORTED');
    return receipt(claim);
  }
  async function feedbackAPI(owner:Owner,envelope:FeedbackEnvelope):Promise<unknown> {
    const instance=service(owner);if(!instance.feedback)fail('FEEDBACK_API_UNAVAILABLE');return instance.feedback(envelope);
  }
  async function onlineAPI(owner:Owner,envelope:OnlineEnvelope):Promise<unknown>{
    const instance=service(owner);if(!instance.online)fail('ONLINE_API_UNAVAILABLE');return instance.online(envelope);
  }
  async function responseAPI(owner:Owner,envelope:ResponseEnvelope):Promise<unknown>{
    const instance=service(owner);if(!instance.response)fail('RESPONSE_API_UNAVAILABLE');return instance.response(envelope);
  }
  const readResponseEvidence=async({scope,reference}:{scope:NativeScope;reference:ResponseEvidenceRef}):Promise<ResponseEvidence>=>{
    if(reference.owner==='runtime')return readRuntimeResponseEvidence(options,r=>service('runtime').native(r),scope,reference);
    if(reference.owner==='harness')return await responseAPI('harness',{operation:'response.evidence.inspect',scope,input:{reference}}) as ResponseEvidence;
    if(reference.owner==='workspace'&&configuration.readResponseWorkspaceEvidence)return configuration.readResponseWorkspaceEvidence({scope,reference});
    fail('RESPONSE_EVIDENCE_UNSUPPORTED');
  };
  const readResponseRecovery=async({scope,reference}:{scope:NativeScope;reference:ResponseEvidenceRef}):Promise<ResponseRecovery>=>{
    if(reference.owner!=='harness')fail('RESPONSE_EVIDENCE_OWNER');
    const result=await responseAPI('harness',{operation:'response.recovery.inspect',scope,input:{id:reference.id}}) as ResponseRecovery;
    if(!same(result.reference,reference))fail('RESPONSE_EVIDENCE_DRIFT');return result;
  };
  const responseRuntimeProviders:ResponseRuntimeProviders={
    resolveResponseRunbook:async({scope,pin}:{scope:NativeScope;pin:RunbookPin})=>await responseAPI('harness',{operation:'response.runbook.inspect',scope,input:{pin}}) as ResolvedResponseRunbook,
    readResponseProblem:async({scope,id}:{scope:NativeScope;id:string})=>await responseAPI('harness',{operation:'response.problem.inspect',scope,input:{id}}) as ResponseProblem,
    readResponseEvidence,readResponseRecovery,
    cancelResponseCollection:({scope,collectionId,claimId})=>requestResponseCollectionCancellation(options,r=>service('runtime').native(r),scope,collectionId,claimId),
  };
  const readOnlineFinding=async({scope,id}:{scope:NativeScope;id:string})=>await onlineAPI('harness',{operation:'online.finding.inspect',scope,input:{id}}) as OnlineFinding;
  const readOnlineRepair=async({scope,id}:{scope:NativeScope;id:string})=>await onlineAPI('runtime',{operation:'online.repair.inspect',scope,input:{id}}) as OnlineRepairCandidate|null;
  async function deliverOnlineFinding(finding:OnlineFinding):Promise<{id:string;digest:string}>{
    const state=await onlineAPI('runtime',{operation:'online.inspect',scope:finding.scope,input:{}}) as {revision:number};
    const response=await onlineAPI('runtime',{operation:'online.repair.ingest',scope:finding.scope,input:{id:finding.id},requestId:'online-finding-'+finding.id.slice(7),expectedRevision:state.revision}) as {result:{id:string;digest:string}};
    return response.result;
  }
  async function readFeedbackInbox({owner,scope,id}:{owner:FeedbackOwner;scope:NativeScope;id:string}):Promise<FeedbackInbox|null> {
    try{return await feedbackAPI(owner,{operation:'feedback.read',scope,input:{id}}) as FeedbackInbox;}catch(e){if((e as {code?:string}).code==='NOT_FOUND')return null;throw e;}
  }
  async function deliverFeedback({owner,event}:{owner:FeedbackOwner;event:FeedbackEvent}):Promise<FeedbackInbox> {
    const existing=await readFeedbackInbox({owner,scope:event.scope,id:event.id});if(existing)return existing;
    const state=await feedbackAPI(owner,{operation:'feedback.inspect',scope:event.scope,input:{}}) as {revision:number};
    await feedbackAPI(owner,{operation:'feedback.ingest',scope:event.scope,input:{id:event.id,digest:event.digest},requestId:'feedback-'+event.id.slice(7,55),expectedRevision:state.revision});
    const result=await readFeedbackInbox({owner,scope:event.scope,id:event.id});if(!result)fail('FEEDBACK_RECEIPT_UNAVAILABLE');return result;
  }
  const ownerFeedbackProviders={
    readFeedback:async({id,scope}:{id:string;scope:NativeScope})=>await feedbackAPI('runtime',{operation:'feedback.event',scope,input:{id}}) as FeedbackEvent,
    resolveFeedbackMaterial:async({reference,scope}:{reference:NativeReference;scope:NativeScope}):Promise<FeedbackMaterial>=>{
      const value=await published(reference,scope);return {...value,workspaceId:options.workspaceId,published:true};
    },
  };
  const runtimeProviders = (): NativeRuntimeProviders & OnlineRuntimeProviders & ResponseRuntimeProviders => ({
    ...(apis.ontology.inspectOntologyStandard && apis.harness.inspectHarnessStandard ? { nativeStandards: standards() } : {}),
    ...Object.fromEntries((['collect', 'inspectCollection', 'inspectSource', 'resolveRequirements', 'verifyProject'] as const).filter(k => configuration[k]).map(k => [k, configuration[k]])),
    resolveNative, executeNative, readOwnerReceipt, deliverFeedback, readFeedbackInbox, readOnlineFinding,
    ...responseRuntimeProviders,
    inspectNative: async ({ claim, signal }) => { if (signal.aborted) fail('ABORTED'); return receipt(claim); },
  });
  const harnessProviders = {
    ...ownerFeedbackProviders,
    readResponseEvidence,readResponseRecovery,
    readResponseExecution:async({scope,reference}:{scope:NativeScope;reference:ResponseEvidenceRef})=>{
      if(reference.owner!=='runtime'||!reference.id.startsWith('response:'))fail('RESPONSE_EXECUTION_REFERENCE');
      const result=await responseAPI('runtime',{operation:'response.execution.inspect',scope,input:{id:reference.id.slice(9)}}) as ResponseExecutionVerification;
      if(!same(result.reference,reference))fail('RESPONSE_EXECUTION_REFERENCE');return result;
    },
    ...configuration.online,deliverOnlineFinding,readOnlineRepair,
    ...(configuration.toolchain ? { nativeToolchain: configuration.toolchain } : {}),
    resolveNativeDependency: async ({ reference, workspaceId, scope }: { reference: NativeReference; workspaceId: string; scope: NativeScope }) => {
      if (workspaceId !== options.workspaceId) fail('MATERIAL_SCOPE');
      const record = await published(reference, scope);
      return { reference: record.reference, published: true, workspaceId, scope: record.scope };
    },
  };
  return { runtimeProviders, harnessProviders, ontologyProviders: {...ownerFeedbackProviders,...(configuration.toolchain ? { nativeToolchain: configuration.toolchain } : {})},
    native: async (owner: Owner, envelope: Envelope) => {
      if(envelope.operation.startsWith('readable.')){const api=service(owner).readable;if(!api)fail('READABLE_API_UNAVAILABLE');return api(envelope);}
      if(envelope.operation.startsWith('planning.')){if(owner!=='runtime')fail('PLANNING_OWNER');const api=service(owner).planning;if(!api)fail('PLANNING_API_UNAVAILABLE');return api(envelope);}
      if(envelope.operation.startsWith('response.')){nativeAssertJSON(envelope.input);if(!envelope.input||typeof envelope.input!=='object'||Array.isArray(envelope.input))fail('INVALID_INPUT');return responseAPI(owner,{...envelope,input:Object.fromEntries(Object.entries(envelope.input))});}
      if(envelope.operation.startsWith('online.')){nativeAssertJSON(envelope.input);if(!envelope.input||typeof envelope.input!=='object'||Array.isArray(envelope.input))fail('INVALID_INPUT');return onlineAPI(owner,{...envelope,input:Object.fromEntries(Object.entries(envelope.input))});}
      if(!envelope.operation.startsWith('feedback.'))return service(owner).native(envelope);
      nativeAssertJSON(envelope.input);if(!envelope.input||typeof envelope.input!=='object'||Array.isArray(envelope.input))fail('INVALID_INPUT');
      return feedbackAPI(owner,{...envelope,input:Object.fromEntries(Object.entries(envelope.input))});
    }, standards };
}
