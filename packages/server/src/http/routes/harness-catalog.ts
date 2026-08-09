import http from "node:http";

interface HarnessCatalogRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  requestId: string;
  traceId?: string;
  parentRequestId?: string;
  deps: Record<string, any>;
}

export async function handleHarnessCatalogRoutes(context: HarnessCatalogRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options, requestId, traceId, parentRequestId } = context;
  const { envelope, hasRole, safeFileName, writeJson } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/harness/catalogs") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const registry = store.readConfiguredHarnessRegistry();
    const scans = store.listHarnessCatalogScans();
    return writeJson(response, 200, envelope({
      schema: "evopilot-harness-catalog-list/v1",
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      registry,
      catalogs: scans.map((scan: any) => scan.catalog).filter(Boolean),
      mounts: scans.map((scan: any) => scan.mount),
      scans,
      templates: scans.flatMap((scan: any) => scan.templates ?? []),
      nextAction: registry?.status === "FAILED" ? "repair-harness-registry-config" : scans.length === 0 ? "mount-published-harness-catalog" : "use-catalog-harness-for-project-auto-match"
    }));
  }

  const harnessCatalogMatch = url.pathname.match(/^\/api\/v1\/harness\/catalogs\/([^/]+)$/);
  if (!harnessCatalogMatch) return false;

  const catalogId = safeFileName(decodeURIComponent(harnessCatalogMatch[1]));
  if (request.method === "GET") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const scan = store.scanHarnessCatalogMount(catalogId);
    if (!scan) return writeJson(response, 404, { error: "HARNESS_CATALOG_NOT_FOUND" });
    return writeJson(response, 200, envelope({
      schema: "evopilot-harness-catalog-inspect-result/v1",
      mount: scan.mount,
      catalog: scan.catalog,
      templates: scan.templates,
      scan,
      nextAction: scan.status === "FAILED" ? "repair-harness-catalog-source" : "use-catalog-harness-for-project-auto-match"
    }));
  }

  return false;
}
