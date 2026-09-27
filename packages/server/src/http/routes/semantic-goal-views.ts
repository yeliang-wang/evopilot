import type http from "node:http";
import type {createSemanticExecutionApplication} from "../../application/semantic-execution-application.js";
import type {SemanticDiscoveryAccess} from "../../application/project-semantic-discovery.js";
import {redactSemanticError} from "../../domains/harness-template/semantic-catalog-io.js";

/** Existing read paths use verified semantic views; non-semantic Goals keep the
 * existing route. This route never clears claims or persists a final report. */
export function handleSemanticGoalViews(context: {
  request: http.IncomingMessage; response: http.ServerResponse; url: URL; requestId: string;
  service: ReturnType<typeof createSemanticExecutionApplication>;
  currentAccess: (projectId: string) => SemanticDiscoveryAccess;
  listVisibleGoals?: () => Array<{id:string}> | undefined;
  deps: {envelope: (data: unknown) => unknown; writeJson: (response: http.ServerResponse, status: number, body: unknown) => boolean};
}): boolean {
  const {request, response, url, deps} = context;
  const match = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)(?:\/(snapshot|evidence-matrix|final-report|graph|run-status|targets|phases|timeline))?$/);
  const listing = url.pathname === "/api/v1/goals";
  if ((!match && !listing) || request.method !== "GET") return false;
  const fail = (status: number, error: string, nextAction?: string) => deps.writeJson(response, status,
    {error, requestId: context.requestId, ...(nextAction ? {nextAction} : {})});
  try {
    if (listing) {
      const visible = context.listVisibleGoals?.(); if (!visible) return false;
      let semantic = false;
      const values = visible.map(goal => {
        const result = context.service.goalViews(goal.id,{currentAccess:context.currentAccess});
        if (result) {semantic=true;return result.snapshot.goal;} return goal;
      });
      if (!semantic) return false;
      response.setHeader("Cache-Control","no-store");
      if (url.search || request.headers["transfer-encoding"] || (request.headers["content-length"] && request.headers["content-length"] !== "0"))
        return fail(400,"SEMANTIC_GOAL_VIEW_REQUEST_INVALID");
      return deps.writeJson(response,200,deps.envelope(values));
    }
    const result = context.service.goalViews(decodeURIComponent(match![1]), {currentAccess: context.currentAccess});
    if (!result) return false;
    response.setHeader("Cache-Control", "no-store");
    if (url.search || request.headers["transfer-encoding"] || (request.headers["content-length"] && request.headers["content-length"] !== "0"))
      return fail(400, "SEMANTIC_GOAL_VIEW_REQUEST_INVALID");
    const view = match![2];
    if (view === "final-report" && !result.finalReport) return fail(409, "GOAL_SEMANTIC_COMPLETION_REQUIRED");
    return deps.writeJson(response, 200, deps.envelope(view === "snapshot" ? result.snapshot : view === "evidence-matrix" ? result.evidenceMatrix :
      view === "final-report" ? result.finalReport : view === "graph" ? result.graph : view === "run-status" ? result.runStatus :
      view === "targets" ? result.snapshot.goal.plan.targets : view === "phases" ? result.snapshot.phases :
      view === "timeline" ? result.snapshot.goal.timeline : result.snapshot.goal));
  } catch (error) {
    response.setHeader("Cache-Control", "no-store");
    if (["GOAL_WRITE_RECONCILIATION_REQUIRED", "LIFECYCLE_WRITE_RECONCILIATION_REQUIRED"].includes((error as {code?: string})?.code ?? ""))
      return fail(409, "SEMANTIC_EXECUTION_RECONCILIATION_REQUIRED", "inspect-retained-write-claim-do-not-replay");
    const safe = redactSemanticError(error);
    return fail(safe.code === "PERMISSION_DENIED" ? 403 : 409, "SEMANTIC_GOAL_VIEW_" + safe.code, safe.nextAction);
  }
}
