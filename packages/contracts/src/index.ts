export const EVOPILOT_PRODUCT_VERSION_FALLBACK = "5.1.0";
export const EVOPILOT_SERVER_VERSION_FALLBACK = "0.1.0";
export const EVOPILOT_CLI_VERSION_FALLBACK = "5.1.0";
export const EVOPILOT_API_CONTRACT_VERSION = "v1";
export const EVOPILOT_MINIMUM_CLI_VERSION = "5.0.0";

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
export const EVOPILOT_EVOLUTION_PROJECT_DEFINITION_SCHEMA = "evopilot-evolution-project-definition/v1";
export const EVOPILOT_HARNESS_MATCH_RESULT_SCHEMA = "evopilot-harness-match-result/v1";
export const EVOPILOT_HARNESS_EXECUTION_BINDING_SCHEMA = "evopilot-harness-execution-binding/v1";
export const EVOPILOT_HARNESS_LIFECYCLE_COMPOSITION_SCHEMA = "evopilot-harness-lifecycle-composition/v1";
export const EVOPILOT_RECOVERY_DECISION_SCHEMA = "evopilot-recovery-decision/v1";
export const EVOPILOT_AUTOMATION_RULE_SCHEMA = "evopilot-automation-rule/v1";
export const EVOPILOT_HUMAN_INTERACTION_PROTOCOL_SCHEMA = "evopilot-human-interaction-protocol/v1";
export const EVOPILOT_AGENT_HOST_PROFILE_SCHEMA = "evopilot-agent-host-profile/v1";
export const EVOPILOT_EXECUTION_RUNTIME_PROFILE_SCHEMA = "evopilot-execution-runtime-profile/v1";
export const EVOPILOT_LEGACY_SUITE_SNAPSHOT_SCHEMA = "evopilot-legacy-suite-snapshot/v1";
export const EVOPILOT_LEGACY_SUITE_SNAPSHOT_COMPARISON_SCHEMA = "evopilot-legacy-suite-snapshot-comparison/v1";
export const EVOPILOT_LEGACY_SUITE_ISOLATION_PROOF_SCHEMA = "evopilot-legacy-suite-isolation-proof/v1";
export const EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION = "1.0";

export const EVOPILOT_HARNESS_GUIDED_RUNTIME_BOUNDARY = {
  schema: "evopilot-harness-guided-runtime-boundary/v1",
  runtimeVersion: "5.1.0",
  invariant: "Every Goal Target Loop binds one eligible published immutable HarnessBundle plus one resolved declarative Lifecycle.",
  harnessOwnership: "evopilot-harness",
  runtimeOwnership: "evopilot",
  expertOwnership: "independently-versioned-package",
  legacySuiteFallback: false,
  preReleaseLegacySuiteDisposition: "ACTIVE_AND_INDEPENDENT",
  candidateLegacySuiteEnvironment: "LEGACY_SUITES_ABSENT",
  realLegacySuiteCutover: "POST_RELEASE_SEPARATE_TARGET_AND_AUTHORIZATION",
  hostRuntimeConflation: false,
  humanAuthority: ["ambiguous-or-unknown-choice", "irreversible-external-effect", "acceptance-verdict", "release-publication"]
} as const;

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
      "release report primitives",
      "Project and GoalTarget Harness matching",
      "Harness plus Lifecycle composition",
      "immutable execution binding revalidation",
      "bounded recovery and Automation Rule semantics"
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
      "Governed Evolution Runtime persistence and API",
      "Automation Registry persistence",
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
  },
  {
    packageName: "@evopilot/evolution-expert",
    path: "packages/evolution-expert",
    layer: "adapter",
    owns: [
      "Agent-neutral conversational Expert Core",
      "intent routing and progressive disclosure",
      "schema-driven question and deterministic result rendering",
      "installed-version help and side-effect-free tutorials",
      "generated Codex, WorkBuddy, generic Agent, and generic MCP adapters"
    ],
    mustNotOwn: [
      "Runtime domain truth",
      "Harness selection, authoring, mutation, approval, or publication",
      "credentials, approval identity, or durable canonical state",
      "Host-specific Lifecycle, authority, or recovery semantics",
      "general coding Agent model or tool loop"
    ]
  }
] as const;

export interface EvoPilotHumanInteractionMessageV1 {
  schema: typeof EVOPILOT_HUMAN_INTERACTION_PROTOCOL_SCHEMA;
  protocolVersion: typeof EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION;
  interactionId: string;
  sessionDigest: string;
  kind: "HELP" | "QUESTION" | "PLAN" | "PROGRESS" | "DECISION" | "RECOVERY" | "EVIDENCE" | "RESULT" | "COMPATIBILITY_ERROR";
  authority: "NONE" | "EXACT_HUMAN_DECISION";
  title: string;
  summary: string;
  details: string[];
  options?: Array<{ id: string; label: string; consequence: string }>;
  inputSchema?: Record<string, unknown>;
  nextAction?: string;
  objectRefs: Array<{ kind: string; id: string; digest?: string }>;
  digest: string;
}

export interface EvoPilotEvolutionExpertCompatibilityV1 {
  schema: "evopilot-evolution-expert-compatibility/v1";
  expertVersion: string;
  engineProtocolRange: string;
  expertProtocolVersion: typeof EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION;
  coreDigest: string;
  adapterId: string;
  adapterDigest: string;
  requiredHostCapabilities: string[];
  conformanceStatus: "CONFORMANT" | "INCOMPATIBLE" | "UNVERIFIED";
}

export interface EvoPilotEvolutionExpertAdapterManifestV1 {
  schema: "evopilot-evolution-expert-adapter/v1";
  id: string;
  host: "codex" | "workbuddy" | "generic-agent" | "generic-mcp" | string;
  version: string;
  coreDigest: string;
  protocolVersion: typeof EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION;
  requiredCapabilities: string[];
  interactionModes: Array<"skill" | "mcp" | "cli" | "api">;
  instructions: string[];
  prohibitedSemantics: string[];
  digest: string;
}

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
