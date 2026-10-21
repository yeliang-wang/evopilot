import type { NativeRuntimeProviders } from '@evopilot-next/runtime/service';
export type Owner = 'runtime' | 'harness' | 'ontology';
export type MaterialOwner = Exclude<Owner, 'runtime'>;
export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
export interface Scope { visibility: 'public' | 'private'; projectId: string }
export interface Reference { product: MaterialOwner; id: string; version: string; specVersion: 'v1'; digest: string; visibility: Scope['visibility'] }
export interface Options { workspaceRoot: string; workspaceId: string }
export interface Envelope { operation: string; scope: Scope; input: unknown; requestId?: string; expectedRevision?: number }
export interface ExternalRequest { scope: Scope; id: string; requestId: string; expectedRevision: number }
export interface Workspace { schema: 'evopilot-workspace/v1'; id: string; canonicalRoot: string; ownerUid: number }
export interface ResolveRequest { reference: Reference; workspace: Workspace; scope: Scope }
export interface HarnessResolveRequest { reference: Reference; workspaceId: string; scope: Scope }
export interface Evidence { id: string; version: string; source: { locator: string; revision: string; digest: string }; values: Record<string, JSONValue> }
export interface CompositionInput { schema: 'runtime-composition/v1'; ontologyInstance: { entities: { id: string; conceptRef: string; properties: Record<string, (string | number | boolean | null)[]> }[]; relations: { id: string; relationRef: string; from: string; to: string }[] }; harness: { mode: 'component' | 'composed'; evidence: Evidence | Record<string, Evidence>; configuration: Record<string, JSONValue> } }
export interface Claim { claimId: string; id: string; inputDigest: string; scope: Scope; pins: { ontology: Reference; harness: Reference }; input: CompositionInput }
export interface Evaluation { status: string; valid?: boolean }
export interface EvaluationReport extends Evaluation { reference: Reference }
export interface Receipt<T = unknown> { requestId: string; operation: string; scope: Scope; requestDigest: string; revision: number; result: T }
export interface ProviderReceipt { claimId: string; inputDigest: string; pins: Claim['pins']; providerReceiptId: string; status: 'SUCCEEDED' | 'FAILED'; result: { evaluation: string; evidenceDigest: string } }
export interface AssetRecord { scope: Scope; model: { id: string; version: string; specVersion: 'v1' }; delivery: { digest: string } | null; resolution?: unknown }
export interface WorkspaceInspection { revision: number; scope: Scope; workspaceId: string; authority: boolean }
export interface ProductService { initialize(): unknown; execute(request: Envelope): unknown; native?(request: Envelope): Promise<unknown>; feedback?(request:Envelope):Promise<unknown>; online?(request:Envelope):Promise<unknown>; response?(request:Envelope):Promise<unknown>; capabilities(): unknown; close(): void }
export interface RuntimeService extends ProductService { dispatch(args: ExternalRequest): Promise<unknown>; reconcile(args: ExternalRequest): Promise<unknown> }
export interface OntologyService extends ProductService { classify(request: Envelope): Promise<unknown> }
export interface RuntimeProviders extends NativeRuntimeProviders { resolveOntology(request: ResolveRequest): unknown; resolveHarness(request: ResolveRequest): unknown; execute(context: unknown): ProviderReceipt; inspectReceipt(context: unknown): ProviderReceipt }
export interface OntologyProviders { resolveClassificationSource?: (request: unknown) => unknown; classificationAdvisor?: (request: unknown) => unknown; classificationModel?: { providerId: string; modelId: string; revision: string; timeoutMs: number }; resolveLegacyHarness?: (request: unknown) => unknown }
export interface ProductAPIs {
  runtime: { PRODUCT: string; VERSION: string; createRuntimeService(options: Options, providers: RuntimeProviders): RuntimeService };
  harness: { PRODUCT: string; VERSION: string; createHarnessService(options: Options, providers: { resolveOntology(request: HarnessResolveRequest): unknown }): ProductService; verifyDelivery(value: unknown): { valid: boolean } };
  ontology: { PRODUCT: string; VERSION: string; createOntologyService(options: Options, providers: OntologyProviders): OntologyService; verifyDelivery(value: unknown): { valid: boolean }; validateInstances(model: unknown, instance: unknown): Evaluation };
}
export interface ManifestEntry { path: string; sha256: string }
export interface ConnectionConfig extends Options { schema: 'evopilot-connection-config/v1'; version: '0.6.0'; protocol: 'evopilot-connection/v1'; installationId: string; installationRoot: string; components: Record<Owner, '0.6.0'>; manifest: ManifestEntry[] }
export interface ConnectionIdentity extends Options { product: 'evopilot-v01-preview'; version: '0.6.0'; protocol: 'evopilot-connection/v1'; installationId: string; installationRoot: string; installationDigest: string; components: ConnectionConfig['components'] }
export interface Configuration extends ConnectionConfig { configPath: string; controlRoot: string; bindingPath: string; projectRoot: string | null; identity: ConnectionIdentity }
export interface UnboundConnectionConfig extends Omit<ConnectionConfig, 'workspaceRoot' | 'workspaceId'> { workspaceRoot: null; workspaceId: null }
export interface InstallationConfiguration extends Omit<ConnectionConfig, 'workspaceRoot' | 'workspaceId'> { workspaceRoot: string | null; workspaceId: string | null; configPath: string; bindingPath: string; projectRoot: string | null; identity: Omit<ConnectionIdentity, 'workspaceRoot' | 'workspaceId'> & { workspaceRoot: string | null; workspaceId: string | null } }
export interface WorkspaceBinding { schema: 'evopilot-workspace-binding/v1'; installationId: string; installationDigest: string; installationRoot: string; projectRoot: string; stateRoot: string; workspaceId: string; requestId: string }
export interface WorkspaceProject { schema: 'evopilot-workspace-project/v1'; id: string; templateVersion: '0.2.0'; specifications: { ontology: 'v1'; harness: 'v1' } }
export interface ControlRecord { identity: ConnectionIdentity; nonce: string; token: string; pid: number; port: number; state: 'starting' | 'ready' | 'failed'; diagnostic: string | null }
export type Action = 'health' | 'stop' | 'capabilities' | 'request' | 'native' | 'native_project' | 'dispatch' | 'reconcile' | 'inspect';
export interface ActionPayload { owner?: Owner; envelope?: Envelope; args?: ExternalRequest; scope?: Scope; operation?: string; input?: unknown }
export interface ConnectionRequest { protocol: string; identity: ConnectionIdentity; nonce: string; action: Action; payload: ActionPayload }
export interface Schema { type?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; enum?: readonly unknown[]; pattern?: string; minimum?: number; minLength?: number; maxLength?: number }
export interface MCPMessage { jsonrpc: string; id?: string | number | null; method: string; params?: Record<string, unknown> }
export function errorCode(error: unknown): string | undefined { return error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined; }
