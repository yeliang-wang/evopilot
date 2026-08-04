import http from "node:http";

interface ReadModelRouteContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  profile: unknown;
  deps: {
    envelope: <T>(data: T) => unknown;
    hasRole: (auth: any, role: "viewer" | "operator" | "admin") => boolean;
    renderMetrics: (summary: any, saasObservability?: any) => string;
    writeJson: (response: http.ServerResponse, statusCode: number, body: unknown) => void;
    writeText: (response: http.ServerResponse, statusCode: number, body: string) => void;
  };
}

export function handleReadModelRoute(context: ReadModelRouteContext): boolean {
  const { request, response, url, auth, store, deps } = context;
  if (request.method !== "GET") return false;

  if (url.pathname === "/api/v1/summary") {
    if (!deps.hasRole(auth, "viewer")) return forbidden(context);
    deps.writeJson(response, 200, deps.envelope(store.summary()));
    return true;
  }
  if (url.pathname === "/api/v1/metrics") {
    if (!deps.hasRole(auth, "viewer")) return forbidden(context);
    deps.writeText(response, 200, deps.renderMetrics(store.summary(), store.saasObservability()));
    return true;
  }
  if (url.pathname === "/api/v1/profiles") {
    if (!deps.hasRole(auth, "viewer")) return forbidden(context);
    deps.writeJson(response, 200, deps.envelope([context.profile]));
    return true;
  }
  if (url.pathname === "/api/v1/service-scorecards") {
    if (!deps.hasRole(auth, "viewer")) return forbidden(context);
    deps.writeJson(response, 200, deps.envelope(store.computeServiceScorecards()));
    return true;
  }
  if (url.pathname === "/api/v1/slo-reports") {
    if (!deps.hasRole(auth, "viewer")) return forbidden(context);
    deps.writeJson(response, 200, deps.envelope(store.computeSloReports()));
    return true;
  }
  if (url.pathname === "/api/v1/governance/policy-evaluations") {
    if (!deps.hasRole(auth, "viewer")) return forbidden(context);
    deps.writeJson(response, 200, deps.envelope(store.evaluateGovernancePolicies()));
    return true;
  }
  if (url.pathname === "/api/v1/supply-chain/reports") {
    if (!deps.hasRole(auth, "viewer")) return forbidden(context);
    deps.writeJson(response, 200, deps.envelope(store.computeSupplyChainReports()));
    return true;
  }
  if (url.pathname === "/api/v1/runtimes") {
    if (!deps.hasRole(auth, "viewer")) return forbidden(context);
    deps.writeJson(response, 200, deps.envelope(store.computeSupplyChainReports()));
    return true;
  }
  if (url.pathname === "/api/v1/cost/reports") {
    if (!deps.hasRole(auth, "viewer")) return forbidden(context);
    deps.writeJson(response, 200, deps.envelope(store.computeCostReports()));
    return true;
  }
  if (url.pathname === "/api/v1/release/readiness") {
    if (!deps.hasRole(auth, "viewer")) return forbidden(context);
    deps.writeJson(response, 200, deps.envelope(store.computeReleaseReadinessReports()));
    return true;
  }
  if (url.pathname === "/api/v1/rollout/strategies") {
    if (!deps.hasRole(auth, "viewer")) return forbidden(context);
    deps.writeJson(response, 200, deps.envelope(store.computeRolloutStrategyReports()));
    return true;
  }

  return false;
}

function forbidden(context: ReadModelRouteContext): true {
  context.deps.writeJson(context.response, 403, { error: "FORBIDDEN" });
  return true;
}
