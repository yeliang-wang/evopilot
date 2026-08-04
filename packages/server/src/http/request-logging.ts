import type { IncomingMessage } from "node:http";

export type HttpLogOutcome = "success" | "rejected" | "failed" | "blocked";

export interface HttpLogCorrelation {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  parentRequestId?: string;
  loopId?: string;
  goalId?: string;
  projectId?: string;
  releaseTargetId?: string;
  releaseDecisionId?: string;
  releaseRunId?: string;
}

export interface HttpLogDiagnosis {
  summary?: string;
  likelyCause?: string;
  recommendedAction?: string;
  retriable?: boolean;
  humanActionRequired?: boolean;
}

export function requestClientMetadata(request: IncomingMessage): Record<string, unknown> {
  return removeUndefined({
    name: requestHeader(request, "x-evopilot-client"),
    surface: requestHeader(request, "x-evopilot-client-surface"),
    command: requestHeader(request, "x-evopilot-cli-command"),
    step: requestHeader(request, "x-evopilot-cli-step"),
    cliVersion: requestHeader(request, "x-evopilot-cli-version"),
    platform: requestHeader(request, "x-evopilot-cli-platform"),
    pid: requestHeader(request, "x-evopilot-cli-pid"),
    tty: requestHeader(request, "x-evopilot-cli-tty")
  }) as Record<string, unknown>;
}

export function routeGroup(pathname: string): string {
  if (pathname === "/health" || pathname === "/ready") return "platform-readiness";
  if (pathname.startsWith("/api/v1/tenants")) return "tenant-control-plane";
  if (pathname.startsWith("/api/v1/workspaces")) return "workspace-control-plane";
  if (pathname.startsWith("/api/v1/settings/logging")) return "logging-control-plane";
  if (pathname.includes("harness")) return "harness-control-plane";
  if (pathname.startsWith("/api/v1/loops") || pathname.includes("loop-")) return "loop-runtime";
  if (pathname.includes("release")) return "release-governance";
  if (pathname.includes("evidence") || pathname.includes("audit")) return "evidence-audit";
  if (pathname.includes("code-upgrade")) return "code-upgrade";
  if (pathname.includes("devops") || pathname.includes("pipeline") || pathname.includes("delivery")) return "cicd";
  return pathname.startsWith("/api/") ? "api" : "dashboard";
}

export function requestCorrelation(url: URL, requestId: string, traceId?: string, parentRequestId?: string): HttpLogCorrelation {
  const pathIds = correlationIdsFromPath(url.pathname);
  const query = (name: string): string | undefined => url.searchParams.get(name) ?? undefined;
  return {
    requestId,
    traceId,
    parentRequestId,
    loopId: query("loopId") ?? pathIds.loopId,
    goalId: query("goalId") ?? pathIds.goalId,
    projectId: query("projectId") ?? pathIds.projectId,
    releaseTargetId: query("targetId") ?? query("releaseTargetId") ?? pathIds.releaseTargetId,
    releaseDecisionId: query("releaseDecisionId") ?? pathIds.releaseDecisionId,
    releaseRunId: query("releaseRunId") ?? pathIds.releaseRunId
  };
}

function correlationIdsFromPath(pathname: string): Partial<NonNullable<HttpLogCorrelation>> {
  const sourceReleaseRunRepair = pathname.match(/^\/api\/v1\/loops\/([^/]+)\/source-release-runs\/([^/]+)\/repair$/);
  if (sourceReleaseRunRepair) {
    return {
      loopId: decodePathSegment(sourceReleaseRunRepair[1]),
      releaseRunId: decodePathSegment(sourceReleaseRunRepair[2])
    };
  }
  const sourceReleaseRun = pathname.match(/^\/api\/v1\/source-release-runs\/([^/]+)$/);
  if (sourceReleaseRun) return { releaseRunId: decodePathSegment(sourceReleaseRun[1]) };
  const loop = pathname.match(/^\/api\/v1\/loops\/([^/]+)/);
  if (loop) return { loopId: decodePathSegment(loop[1]) };
  const targetLoop = pathname.match(/^\/api\/v1\/target-loops\/([^/]+)/);
  if (targetLoop) return { loopId: decodePathSegment(targetLoop[1]) };
  const goal = pathname.match(/^\/api\/v1\/goals\/([^/]+)/);
  if (goal) return { goalId: decodePathSegment(goal[1]) };
  const project = pathname.match(/^\/api\/v1\/projects\/([^/]+)/);
  if (project) return { projectId: decodePathSegment(project[1]) };
  const releaseTarget = pathname.match(/^\/api\/v1\/release\/targets\/([^/]+)/);
  if (releaseTarget) return { releaseTargetId: decodePathSegment(releaseTarget[1]) };
  const releaseDecision = pathname.match(/^\/api\/v1\/release\/decisions\/([^/]+)/);
  if (releaseDecision) return { releaseDecisionId: decodePathSegment(releaseDecision[1]) };
  return {};
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function latencyBucket(durationMs: number): string {
  if (durationMs < 50) return "<50ms";
  if (durationMs < 200) return "50-199ms";
  if (durationMs < 1000) return "200-999ms";
  if (durationMs < 5000) return "1-4s";
  return "5s+";
}

export function httpOutcome(statusCode: number): HttpLogOutcome {
  if (statusCode >= 500) return "failed";
  if (statusCode === 409 || statusCode === 423 || statusCode === 429) return "blocked";
  if (statusCode >= 400) return "rejected";
  return "success";
}

export function diagnosisForHttpStatus(statusCode: number, errorCode?: string): HttpLogDiagnosis | undefined {
  if (statusCode < 400) return undefined;
  if (statusCode === 401) {
    if (errorCode === "INVALID_CREDENTIALS") {
      return {
        summary: "Login request rejected.",
        likelyCause: "Username or password did not match an active EvoPilot user.",
        recommendedAction: "Verify the username/password source, reset credentials if needed, and avoid retrying with the same secret in an automated loop.",
        retriable: false,
        humanActionRequired: true
      };
    }
    return {
      summary: "Request rejected before authorization.",
      likelyCause: "Missing, expired, or invalid EvoPilot API token.",
      recommendedAction: "Verify Authorization: Bearer token, EVOPILOT_TOKENS, and tenant/workspace scope before retrying.",
      retriable: true,
      humanActionRequired: true
    };
  }
  if (statusCode === 403) {
    return {
      summary: "Request authenticated but blocked by RBAC or tenant/workspace scope.",
      likelyCause: errorCode ?? "FORBIDDEN",
      recommendedAction: "Check the role matrix, workspace membership, and requested tenant/workspace ownership.",
      retriable: false,
      humanActionRequired: true
    };
  }
  if (statusCode === 404) {
    return {
      summary: "Requested route or resource was not found.",
      likelyCause: errorCode ?? "NOT_FOUND",
      recommendedAction: "Confirm the API path, resource id, and whether the selected workspace can access it.",
      retriable: false,
      humanActionRequired: true
    };
  }
  if (statusCode === 409) {
    return {
      summary: "Business guardrail or consistency check blocked the request.",
      likelyCause: errorCode ?? "CONFLICT",
      recommendedAction: "Inspect response detail, release blockers, workspace boundary, and audit records before retrying.",
      retriable: false,
      humanActionRequired: true
    };
  }
  if (statusCode === 429) {
    return {
      summary: "Request was rate limited or quota constrained.",
      likelyCause: errorCode ?? "RATE_LIMITED",
      recommendedAction: "Check tenant quota, worker concurrency, and retry after the configured backoff window.",
      retriable: true,
      humanActionRequired: false
    };
  }
  if (statusCode >= 500) {
    return {
      summary: "Unhandled server error during request processing.",
      likelyCause: errorCode ?? "SERVER_ERROR",
      recommendedAction: "Collect logs with the same correlation.requestId, inspect stack traces, loop/release ids, and recent deploy changes.",
      retriable: true,
      humanActionRequired: true
    };
  }
  return {
    summary: "Request was rejected by HTTP validation.",
    likelyCause: errorCode ?? `HTTP_${statusCode}`,
    recommendedAction: "Review request payload, role, tenant/workspace scope, and the response error detail.",
    retriable: false,
    humanActionRequired: true
  };
}

export function requestHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function redactUrlSearch(params: URLSearchParams): Record<string, string> | undefined {
  const entries = [...params.entries()];
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map(([key, value]) => [
    key,
    /token|password|secret|authorization|apiKey|credential/i.test(key) ? "[REDACTED]" : value
  ]));
}

function removeUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}
