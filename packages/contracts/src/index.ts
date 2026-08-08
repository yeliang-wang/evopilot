export const EVOPILOT_PRODUCT_VERSION_FALLBACK = "2.4.1";
export const EVOPILOT_SERVER_VERSION_FALLBACK = "0.1.0";
export const EVOPILOT_CLI_VERSION_FALLBACK = "2.4.1";
export const EVOPILOT_API_CONTRACT_VERSION = "v1";
export const EVOPILOT_MINIMUM_CLI_VERSION = "2.4.0";

export const EVOPILOT_LOG_SCHEMA = "evopilot-log/v1";
export const EVOPILOT_CLI_RUNTIME_SCHEMA = "evopilot-cli-runtime/v1";
export const EVOPILOT_WORKER_RUNTIME_SCHEMA = "evopilot-worker-runtime/v1";

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
      "public API/CLI/runtime boundary metadata"
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
  }
] as const;

export function packageBoundaryFor(packageName: string): EvoPilotPackageBoundary | undefined {
  return EVOPILOT_PACKAGE_BOUNDARIES.find((boundary) => boundary.packageName === packageName);
}

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
