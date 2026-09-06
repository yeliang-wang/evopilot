export const LIFECYCLE_DEFINITION_SCHEMA = "evopilot-lifecycle-definition/v1alpha1" as const;
export const LIFECYCLE_REVISION_SCHEMA = "evopilot-lifecycle-revision/v1alpha1" as const;
export const LIFECYCLE_INPUT_BINDING_SCHEMA = "evopilot-lifecycle-input-binding/v1alpha1" as const;
export const LIFECYCLE_BINDING_SCHEMA = "evopilot-lifecycle-binding/v1alpha1" as const;
export const LIFECYCLE_RUN_SCHEMA = "evopilot-lifecycle-run/v1alpha1" as const;

export type LifecycleDecisionMode = "AUTO" | "POLICY" | "HUMAN" | "EXTERNAL_SIGNAL" | "DISABLED";
export type LifecycleInputType = "string" | "integer" | "number" | "boolean" | "enum" | "string-array" | "secret-ref";
export type LifecycleInputSource = "user" | "project" | "organization" | "runtime" | "deterministic" | "default";

export interface LifecycleMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  labels?: Record<string, string>;
}

export interface LifecycleImportRef {
  id: string;
  version: string;
}

export interface LifecycleVisibilityCondition {
  input: string;
  equals?: string | number | boolean;
  exists?: boolean;
}

export interface LifecycleInputDefinition {
  id: string;
  type: LifecycleInputType;
  prompt: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: Array<string | number | boolean>;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  visibleWhen?: LifecycleVisibilityCondition;
  sensitive?: boolean;
  review?: boolean;
}

export interface LifecycleStageDefinition {
  id: string;
  name: string;
  needs?: string[];
  when?: LifecycleVisibilityCondition;
  action: {
    uses: string;
    with?: Record<string, unknown>;
  };
  capabilities?: string[];
  decision: {
    mode: LifecycleDecisionMode;
    authority?: "plan" | "credential" | "production" | "release" | "publication" | "exception" | "recovery";
    prompt?: string;
  };
  retry?: {
    maxAttempts: number;
  };
  timeoutSeconds?: number;
}

export interface LifecycleDefinition {
  schema: typeof LIFECYCLE_DEFINITION_SCHEMA;
  metadata: LifecycleMetadata;
  imports?: LifecycleImportRef[];
  capabilities?: string[];
  inputs?: LifecycleInputDefinition[];
  stages: LifecycleStageDefinition[];
}

export interface LifecycleRevision {
  schema: typeof LIFECYCLE_REVISION_SCHEMA;
  ref: { id: string; version: string };
  digest: string;
  sourceDigests: string[];
  definition: LifecycleDefinition;
  graph: {
    order: string[];
    edges: Array<{ from: string; to: string }>;
  };
}

export interface LifecycleResolvedInput {
  id: string;
  value: unknown;
  source: LifecycleInputSource;
  sourceRef: string;
  sensitive: boolean;
}

export interface LifecycleInputQuestion {
  id: string;
  type: LifecycleInputType;
  prompt: string;
  description?: string;
  required: boolean;
  default?: unknown;
  options?: Array<string | number | boolean>;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  sensitive: boolean;
}

export interface LifecycleInputBinding {
  schema: typeof LIFECYCLE_INPUT_BINDING_SCHEMA;
  lifecycleDigest: string;
  digest: string;
  status: "INCOMPLETE" | "READY_FOR_REVIEW";
  values: Record<string, LifecycleResolvedInput>;
  unresolved: string[];
  review: Array<{ id: string; displayValue: unknown; source: LifecycleInputSource; sourceRef: string }>;
  nextQuestion?: LifecycleInputQuestion;
}

export interface LifecycleHarnessBundleBinding {
  id: string;
  version: string;
  digest: string;
  catalogId?: string;
}

export interface LifecycleExecutorBinding {
  host: string;
  provider: string;
  model: string;
  capabilities: string[];
  digest: string;
}

export interface LifecycleBinding {
  schema: typeof LIFECYCLE_BINDING_SCHEMA;
  digest: string;
  lifecycleRef: { id: string; version: string; digest: string };
  inputBindingDigest: string;
  actionRegistryDigest: string;
  policyDigest: string;
  harnessBundle: LifecycleHarnessBundleBinding;
  executor: LifecycleExecutorBinding;
  runtimeDigest: string;
  evidenceDigest: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  goalId?: string;
  targetId?: string;
  createdAt: string;
}

export interface LifecycleStageAttempt {
  stageId: string;
  attempt: number;
  status: "SUCCEEDED" | "WAITING_DECISION" | "WAITING_EXTERNAL_SIGNAL" | "FAILED" | "SKIPPED";
  action: string;
  receiptDigest?: string;
  externalRequestId?: string;
  evidence: string[];
  startedAt: string;
  finishedAt?: string;
}

export interface LifecycleDecisionRecord {
  stageId: string;
  authority: string;
  decision: "APPROVED" | "REJECTED";
  bindingDigest: string;
  actor: string;
  evidenceRef: string;
  decidedAt: string;
}

export interface LifecycleAgentExecutionRequest {
  schema: "evopilot-agent-execution-request/v1alpha1";
  id: string;
  runId: string;
  stageId: string;
  action: string;
  actionVersion: string;
  bindingDigest: string;
  inputs: Record<string, unknown>;
  capabilities: string[];
  executor: Omit<LifecycleExecutorBinding, "digest"> & { digest?: string };
}

export interface LifecycleAgentTrajectoryEntry {
  schema: "evopilot-agent-trajectory-entry/v1alpha1";
  requestId: string;
  runId: string;
  stageId: string;
  bindingDigest: string;
  host: string;
  provider: string;
  model: string;
  capabilities: string[];
  status: "SUCCEEDED" | "FAILED" | "UNCERTAIN";
  receiptDigest: string;
  cost: { amount: number; currency: string; inputTokens?: number; outputTokens?: number };
  artifacts: Array<{ ref: string; digest: string }>;
  evidence: string[];
  recordedAt: string;
}

export interface LifecycleRewardContract {
  schema: "evopilot-lifecycle-reward-contract/v1alpha1";
  outcome: number;
  process: number;
  safety: number;
  cost: number;
  aggregate: number;
  evidence: string[];
}

export interface HarnessExecutionFeedbackPackage {
  schema: "evopilot-harness-execution-feedback-package/v1alpha1";
  id: string;
  lifecycleRunId: string;
  bindingDigest: string;
  harnessBundle: LifecycleHarnessBundleBinding;
  visibility: "PRIVATE";
  redaction: "STRICT";
  trajectory: LifecycleAgentTrajectoryEntry[];
  reward: LifecycleRewardContract;
  approval: LifecycleDecisionRecord;
  digest: string;
  createdAt: string;
}

export interface LifecycleRun {
  schema: typeof LIFECYCLE_RUN_SCHEMA;
  id: string;
  status: "WAITING_INPUT" | "WAITING_BINDING_REVIEW" | "WAITING_AUTHORIZATION" | "RUNNING" | "WAITING_DECISION" | "WAITING_EXTERNAL_SIGNAL" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  binding?: LifecycleBinding;
  revision: LifecycleRevision;
  inputBinding: LifecycleInputBinding;
  planAuthorization?: LifecycleDecisionRecord;
  stageAttempts: LifecycleStageAttempt[];
  decisions: LifecycleDecisionRecord[];
  trajectory: LifecycleAgentTrajectoryEntry[];
  pendingExecution?: LifecycleAgentExecutionRequest;
  pendingDecisionAuthority?: "stage" | "recovery";
  currentStageId?: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  goalId?: string;
  targetId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LifecycleInputSources {
  answers?: Record<string, unknown>;
  projectFacts?: Record<string, unknown>;
  organizationDefaults?: Record<string, unknown>;
  runtimeCapabilities?: Record<string, unknown>;
  deterministicValues?: Record<string, unknown>;
}

export interface LifecycleStartRequest extends LifecycleInputSources {
  id?: string;
  lifecycleId: string;
  lifecycleVersion?: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  goalId?: string;
  targetId?: string;
  policyDigest: string;
  runtimeDigest: string;
  evidenceDigest?: string;
  harnessBundle: LifecycleHarnessBundleBinding;
  executor: LifecycleExecutorBinding;
}

export interface LifecycleExternalResult {
  requestId: string;
  status: "SUCCEEDED" | "FAILED" | "UNCERTAIN";
  receiptDigest: string;
  evidence?: string[];
  cost?: { amount?: number; currency?: string; inputTokens?: number; outputTokens?: number };
  artifacts?: Array<{ ref: string; digest: string }>;
}
