import http from "node:http";
import { auditListOrder, optionalPositiveIntegerQuery } from "../errors.js";

interface AuditHistoryRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  deps: Record<string, any>;
}

export async function handleAuditHistoryRoutes(context: AuditHistoryRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store } = context;
  const {
    envelope,
    hasRole,
    historyView,
    writeJson
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/audit") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listAudit({
      limit: optionalPositiveIntegerQuery(url.searchParams.get("limit"), "limit", 1000),
      order: auditListOrder(url.searchParams.get("order"))
    })));
  }

  if (request.method === "GET" && url.pathname === "/api/v1/history") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(historyView(store, auth, url)));
  }

  return false;
}
