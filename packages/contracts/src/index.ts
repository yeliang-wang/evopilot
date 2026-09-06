export const EVOPILOT_PRODUCT_VERSION_FALLBACK = "4.0.0";
export const EVOPILOT_SERVER_VERSION_FALLBACK = "0.1.0";
export const EVOPILOT_CLI_VERSION_FALLBACK = "4.0.0";
export const EVOPILOT_API_CONTRACT_VERSION = "v1";
export const EVOPILOT_MINIMUM_CLI_VERSION = "4.0.0";

export const EVOPILOT_LOG_SCHEMA = "evopilot-log/v1";
export const EVOPILOT_CLI_RUNTIME_SCHEMA = "evopilot-cli-runtime/v1";
export const EVOPILOT_WORKER_RUNTIME_SCHEMA = "evopilot-worker-runtime/v1";
export const EVOPILOT_LIFECYCLE_DEFINITION_SCHEMA = "evopilot-lifecycle-definition/v1alpha1";
export const EVOPILOT_LIFECYCLE_REVISION_SCHEMA = "evopilot-lifecycle-revision/v1alpha1";
export const EVOPILOT_LIFECYCLE_INPUT_BINDING_SCHEMA = "evopilot-lifecycle-input-binding/v1alpha1";
export const EVOPILOT_LIFECYCLE_BINDING_SCHEMA = "evopilot-lifecycle-binding/v1alpha1";
export const EVOPILOT_LIFECYCLE_RUN_SCHEMA = "evopilot-lifecycle-run/v1alpha1";
export const EVOPILOT_LIFECYCLE_EXECUTOR_ADAPTER_SCHEMA = "evopilot-lifecycle-executor-adapter/v1";
export const EVOPILOT_AGENT_RUNTIME_PROFILE_SCHEMA = "evopilot-agent-runtime-profile/v1";
export const EVOPILOT_AGENT_EXECUTION_REQUEST_SCHEMA = "evopilot-agent-execution-request/v1alpha1";
export const EVOPILOT_AGENT_EXECUTION_RESULT_SCHEMA = "evopilot-agent-execution-result/v1alpha1";

export const EVOPILOT_CLI_PACKAGE_NAME = "@evopilot/cli";

export type EvoPilotBoundaryLayer =
  | "contract"
  | "domain"
  | "application"
  | "interface"
  | "runtime"
  | "adapter"
  | "artifact";

export type EvoPilotRouteGroup =
  | "platform-readiness"
  | "auth-access"
  | "project-onboarding"
  | "evidence"
  | "harness"
  | "lifecycle-harness"
  | "goal-planning"
  | "loop-runtime"
  | "source-closure"
  | "release-governance"
  | "operations"
  | "static-dashboard"
  | "unknown";

export interface EvoPilotPackageBoundary {
  packageName: string;
  path: string;
  layer: EvoPilotBoundaryLayer;
  owns: string[];
  mustNotOwn?: string[];
}

export const EVOPILOT_PACKAGE_BOUNDARIES: readonly EvoPilotPackageBoundary[] = [
  {
    packageName: "@evopilot/contracts",
    path: "packages/contracts",
    layer: "contract",
    owns: [
      "shared schema names",
      "version constants",
      "public API/CLI/runtime boundary metadata",
      "LifecycleDefinition, LifecycleBinding, LifecycleRun, and ExecutorAdapter schema names"
    ],
    mustNotOwn: [
      "business decisions",
      "HTTP transport",
      "filesystem state"
    ]
  },
  {
    packageName: "@evopilot/core",
    path: "packages/core",
    layer: "domain",
    owns: [
      "evidence models",
      "evolution opportunities",
      "release report primitives"
    ],
    mustNotOwn: [
      "HTTP routing",
      "CLI parsing",
      "server-side persistence"
    ]
  },
  {
    packageName: "@evopilot/server",
    path: "packages/server",
    layer: "interface",
    owns: [
      "HTTP control-plane runtime",
      "thin compatibility adapter",
      "focused HTTP route modules",
      "application helper boundary",
      "file-backed storage boundary",
      "runtime auth/config helpers",
      "executor adapters",
      "release target helpers",
      "Open Lifecycle Harness domain and persistence",
      "RBAC enforcement",
      "tenant/workspace scoped API orchestration"
    ],
    mustNotOwn: [
      "CLI semantics",
      "Dashboard-only state"
    ]
  },
  {
    packageName: "@evopilot/worker-runtime",
    path: "packages/worker-runtime",
    layer: "runtime",
    owns: [
      "loop worker polling",
      "worker lease heartbeat",
      "watchdog/start/resume request loop"
    ],
    mustNotOwn: [
      "release verdicts",
      "approval bypasses",
      "direct store access"
    ]
  },
  {
    packageName: "@evopilot/cli",
    path: "packages/cli",
    layer: "interface",
    owns: [
      "command parsing",
      "agent-safe JSON output",
      "stop-rule presentation"
    ],
    mustNotOwn: [
      "server-side policy decisions",
      "tenant/workspace store mutation without API calls"
    ]
  },
  {
    packageName: "@evopilot/client",
    path: "packages/client",
    layer: "adapter",
    owns: [
      "typed HTTP request helper",
      "request headers",
      "response normalization"
    ],
    mustNotOwn: [
      "business workflow orchestration"
    ]
  },
  {
    packageName: "@evopilot/adapter-mcp",
    path: "packages/adapter-mcp",
    layer: "adapter",
    owns: [
      "host-neutral MCP stdio transport",
      "server-governed Lifecycle tool projection"
    ],
    mustNotOwn: [
      "Lifecycle decisions",
      "Agent execution",
      "publication authority"
    ]
  },
  {
    packageName: "@evopilot/adapter-opencode",
    path: "packages/adapter-opencode",
    layer: "adapter",
    owns: [
      "first-class OpenCode runtime invocation",
      "capability negotiation",
      "normalized execution receipts",
      "safe resumable request correlation"
    ],
    mustNotOwn: [
      "Lifecycle planning",
      "Engine authority decisions",
      "automatic permission approval",
      "Harness Asset mutation"
    ]
  }
] as const;

export interface EvoPilotAgentRuntimeProfileV1 {
  schema: typeof EVOPILOT_AGENT_RUNTIME_PROFILE_SCHEMA;
  id: string;
  version: string;
  adapterId: string;
  runtime: { name: string; version: string };
  host: string;
  provider: string;
  model: string;
  capabilities: string[];
  constraints: {
    workspaceRoot: string;
    permissionMode: "HOST_MANAGED_DENY_UNDECLARED";
    timeoutMs: number;
    maxOutputBytes: number;
  };
  digest: string;
}

export interface EvoPilotAgentExecutionRequestV1Alpha1 {
  schema: typeof EVOPILOT_AGENT_EXECUTION_REQUEST_SCHEMA;
  id: string;
  runId: string;
  stageId: string;
  action: string;
  actionVersion: string;
  bindingDigest: string;
  inputs: Record<string, unknown>;
  capabilities: string[];
  executor: {
    host: string;
    provider: string;
    model: string;
    capabilities: string[];
    digest: string;
  };
}

export interface EvoPilotAgentExecutionResultV1Alpha1 {
  schema: typeof EVOPILOT_AGENT_EXECUTION_RESULT_SCHEMA;
  requestId: string;
  requestDigest: string;
  status: "SUCCEEDED" | "FAILED" | "UNCERTAIN";
  receiptDigest: string;
  evidence: string[];
  cost?: { amount: number; currency: string; inputTokens?: number; outputTokens?: number };
  artifacts?: Array<{ ref: string; digest: string }>;
}

export interface EvoPilotLifecycleExecutorAdapterV1 {
  schema: typeof EVOPILOT_LIFECYCLE_EXECUTOR_ADAPTER_SCHEMA;
  id: string;
  host: string;
  capabilities: string[];
  profile: EvoPilotAgentRuntimeProfileV1;
  execute(request: EvoPilotAgentExecutionRequestV1Alpha1): Promise<EvoPilotAgentExecutionResultV1Alpha1>;
}

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RAW_SECRET_PATTERN = /(?:token|password|secret|api[-_]?key)\s*[=:]\s*(?!<redacted>|secret:\/\/)[^\s,;]+/i;

export function assertLifecycleExecutorAdapterV1(value: EvoPilotLifecycleExecutorAdapterV1): void {
  if (value?.schema !== EVOPILOT_LIFECYCLE_EXECUTOR_ADAPTER_SCHEMA) throw new Error("EXECUTOR_ADAPTER_SCHEMA_UNSUPPORTED");
  if (!value.id?.trim() || !value.host?.trim() || typeof value.execute !== "function") throw new Error("EXECUTOR_ADAPTER_IDENTITY_INVALID");
  if (!Array.isArray(value.capabilities) || value.capabilities.some((capability) => !capability.trim())) throw new Error("EXECUTOR_ADAPTER_CAPABILITIES_INVALID");
  if (value.profile?.schema !== EVOPILOT_AGENT_RUNTIME_PROFILE_SCHEMA || !DIGEST_PATTERN.test(value.profile.digest)) throw new Error("AGENT_RUNTIME_PROFILE_INVALID");
  if (value.profile.adapterId !== value.id || value.profile.host !== value.host) throw new Error("AGENT_RUNTIME_PROFILE_ADAPTER_MISMATCH");
  if (JSON.stringify([...new Set(value.profile.capabilities)].sort()) !== JSON.stringify([...new Set(value.capabilities)].sort())) throw new Error("AGENT_RUNTIME_PROFILE_CAPABILITY_MISMATCH");
}

export function assertAgentExecutionRequestV1Alpha1(value: EvoPilotAgentExecutionRequestV1Alpha1): void {
  if (value?.schema !== EVOPILOT_AGENT_EXECUTION_REQUEST_SCHEMA) throw new Error("AGENT_EXECUTION_REQUEST_SCHEMA_UNSUPPORTED");
  for (const field of ["id", "runId", "stageId", "action", "actionVersion"] as const) {
    if (!value[field]?.trim()) throw new Error(`AGENT_EXECUTION_REQUEST_${field.toUpperCase()}_REQUIRED`);
  }
  if (!DIGEST_PATTERN.test(value.bindingDigest) || !DIGEST_PATTERN.test(value.executor?.digest ?? "")) throw new Error("AGENT_EXECUTION_REQUEST_DIGEST_INVALID");
  if (!Array.isArray(value.capabilities) || !value.executor || !Array.isArray(value.executor.capabilities)) throw new Error("AGENT_EXECUTION_REQUEST_EXECUTOR_INVALID");
}

export function assertAgentExecutionResultV1Alpha1(value: EvoPilotAgentExecutionResultV1Alpha1, request: EvoPilotAgentExecutionRequestV1Alpha1): void {
  if (value?.schema !== EVOPILOT_AGENT_EXECUTION_RESULT_SCHEMA) throw new Error("AGENT_EXECUTION_RESULT_SCHEMA_UNSUPPORTED");
  if (value.requestId !== request.id || !DIGEST_PATTERN.test(value.requestDigest) || !DIGEST_PATTERN.test(value.receiptDigest)) throw new Error("AGENT_EXECUTION_RESULT_BINDING_INVALID");
  if (!["SUCCEEDED", "FAILED", "UNCERTAIN"].includes(value.status)) throw new Error("AGENT_EXECUTION_RESULT_STATUS_INVALID");
  if (!Array.isArray(value.evidence) || value.evidence.some((item) => typeof item !== "string" || RAW_SECRET_PATTERN.test(item))) throw new Error("AGENT_EXECUTION_RESULT_EVIDENCE_UNSAFE");
  for (const artifact of value.artifacts ?? []) {
    if (!artifact.ref?.trim() || !DIGEST_PATTERN.test(artifact.digest)) throw new Error("AGENT_EXECUTION_RESULT_ARTIFACT_INVALID");
  }
  if (value.cost && (!Number.isFinite(value.cost.amount) || value.cost.amount < 0 || !value.cost.currency?.trim())) throw new Error("AGENT_EXECUTION_RESULT_COST_INVALID");
}

export async function executeConformantLifecycleAdapter(
  adapter: EvoPilotLifecycleExecutorAdapterV1,
  request: EvoPilotAgentExecutionRequestV1Alpha1
): Promise<EvoPilotAgentExecutionResultV1Alpha1> {
  assertLifecycleExecutorAdapterV1(adapter);
  assertAgentExecutionRequestV1Alpha1(request);
  const result = await adapter.execute(request);
  assertAgentExecutionResultV1Alpha1(result, request);
  return result;
}

export function packageBoundaryFor(packageName: string): EvoPilotPackageBoundary | undefined {
  return EVOPILOT_PACKAGE_BOUNDARIES.find((boundary) => boundary.packageName === packageName);
}

export const EVOPILOT_HARNESS_CONSUMPTION_BOUNDARY = {
  producerSystemOfRecord: "evopilot-harness",
  consumer: "evopilot",
  discoveryMode: "dynamic-read-only",
  matchingMayRead: ["HarnessProfile", "HarnessBundle"],
  executionRequires: {
    kind: "HarnessBundle",
    lifecycle: "published",
    immutable: true,
    pinnedDependencies: true,
    revalidateAt: ["goal-loop-create", "loop-iteration"],
    additiveCatalogGrowthAllowed: true
  },
  legacyTemplateConsumptionIsBundleCompliance: false,
  mandatorySignatureVerification: false,
  forbiddenCapabilities: [
    "Harness authoring",
    "Harness evolution",
    "Harness approval",
    "Harness publication",
    "Catalog mutation"
  ]
} as const;

export const EVOPILOT_LIFECYCLE_HARNESS_BOUNDARY = {
  owner: "evopilot",
  purpose: "project and Goal Loop execution lifecycle",
  definitionModel: "open-yaml-graph-over-closed-versioned-actions",
  inputAuthority: "configuration-only",
  harnessAssetAuthority: "read-only-published-bundle-consumer",
  decisionModes: ["AUTO", "POLICY", "HUMAN", "EXTERNAL_SIGNAL", "DISABLED"],
  externalAgentTransport: ["MCP", "HTTP", "CLI", "CI"],
  forbiddenCapabilities: [
    "arbitrary executable lifecycle code",
    "raw secret persistence",
    "inferred approval",
    "Harness Asset authoring or publication",
    "unapproved project release or publication"
  ]
} as const;

export interface EvoPilotStopRule {
  status: string;
  reason: string;
}

export const EVOPILOT_AGENT_STOP_RULES: readonly EvoPilotStopRule[] = [
  { status: "NO-GO", reason: "release or target decision blocks continuation" },
  { status: "BLOCKED", reason: "server returned a durable blocker or repair requirement" },
  { status: "FAILED", reason: "execution failed and must be diagnosed before retry" },
  { status: "PENDING_APPROVAL", reason: "human review or policy approval is required" },
  { status: "NEXT_ACTION", reason: "server returned a nextAction boundary for the operator" }
] as const;
