import http from "node:http";

interface ReleaseTargetRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  deps: Record<string, any>;
}

export async function handleReleaseTargetRoutes(context: ReleaseTargetRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options } = context;
  const {
    audit,
    envelope,
    hasRole,
    normalizeReleaseTarget,
    readJson,
    writeJson
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/release/targets") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listReleaseTargets()));
  }

  if (request.method === "POST" && url.pathname === "/api/v1/release/targets") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const target = store.writeReleaseTarget(normalizeReleaseTarget(body));
    store.appendAudit(audit(auth, "release-target.upserted", target.id, { minConnectedProjects: target.minConnectedProjects, requiredScenarioIds: target.requiredScenarioIds }));
    return writeJson(response, 201, envelope(target));
  }

  const releaseTargetMatch = url.pathname.match(/^\/api\/v1\/release\/targets\/([^/]+)$/);
  if (request.method === "GET" && releaseTargetMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const target = store.readReleaseTarget(decodeURIComponent(releaseTargetMatch[1]));
    if (!target) return writeJson(response, 404, { error: "RELEASE_TARGET_NOT_FOUND" });
    return writeJson(response, 200, envelope(target));
  }

  return false;
}
