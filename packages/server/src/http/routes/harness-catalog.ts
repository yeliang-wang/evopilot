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
  const {
    audit,
    envelope,
    hasRole,
    logInfo,
    optionalTrimmedString,
    readJson,
    requestCorrelation,
    safeFileName,
    writeJson
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/harness/catalogs") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const scans = store.listHarnessCatalogScans();
    return writeJson(response, 200, envelope({
      schema: "evopilot-harness-catalog-list/v1",
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      catalogs: scans.map((scan: any) => scan.catalog).filter(Boolean),
      mounts: scans.map((scan: any) => scan.mount),
      scans,
      templates: scans.flatMap((scan: any) => scan.templates ?? []),
      nextAction: scans.length === 0 ? "mount-published-harness-catalog" : "use-catalog-harness-for-project-auto-match"
    }));
  }

  if (request.method === "POST" && url.pathname === "/api/v1/harness/catalogs") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
    const source = optionalTrimmedString(body.source ?? body.path ?? body.root);
    if (!source) return writeJson(response, 400, { error: "HARNESS_CATALOG_SOURCE_REQUIRED", detail: "Harness catalog mount requires --source <published-harness-catalog-path>." });
    const catalogId = safeFileName(String(body.catalogId ?? body.id ?? body.name ?? source.split(/[\\/]/).filter(Boolean).pop() ?? "local-harness-catalog"));
    const mountedAt = new Date().toISOString();
    const saved = store.writeHarnessCatalogMount({
      schema: "evopilot-harness-catalog-mount/v1",
      catalogId,
      name: optionalTrimmedString(body.name) ?? catalogId,
      source,
      status: body.status === "DISABLED" ? "DISABLED" : "ACTIVE",
      mountedBy: auth.actor,
      mountedAt,
      updatedAt: mountedAt
    });
    const scan = store.scanHarnessCatalogMount(saved.catalogId);
    const nextAction = scan?.status === "FAILED" ? "repair-harness-catalog-source" : "use-catalog-harness-for-project-auto-match";
    logInfo("harness-catalog.mounted", {
      requestId,
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      actor: auth.actor,
      role: auth.role,
      outcome: scan?.status === "FAILED" ? "blocked" : "success",
      correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
      metadata: {
        catalogId: saved.catalogId,
        source,
        status: scan?.status,
        templateCount: scan?.templates?.length ?? 0,
        catalogDigest: scan?.catalog?.catalogDigest,
        nextAction
      }
    });
    store.appendAudit(audit(auth, "harness-catalog.mounted", saved.catalogId, {
      catalogId: saved.catalogId,
      source,
      status: scan?.status,
      templateCount: scan?.templates?.length ?? 0,
      catalogDigest: scan?.catalog?.catalogDigest
    }));
    return writeJson(response, scan?.status === "FAILED" ? 422 : 201, envelope({
      schema: "evopilot-harness-catalog-mount-result/v1",
      mount: scan?.mount ?? saved,
      scan,
      templates: scan?.templates ?? [],
      nextAction
    }));
  }

  const harnessCatalogMatch = url.pathname.match(/^\/api\/v1\/harness\/catalogs\/([^/]+)(?:\/(scan))?$/);
  if (!harnessCatalogMatch) return false;

  const catalogId = safeFileName(decodeURIComponent(harnessCatalogMatch[1]));
  const action = harnessCatalogMatch[2];
  if (request.method === "GET" && !action) {
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
  if (request.method === "POST" && action === "scan") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const scan = store.scanHarnessCatalogMount(catalogId);
    if (!scan) return writeJson(response, 404, { error: "HARNESS_CATALOG_NOT_FOUND" });
    const nextAction = scan.status === "FAILED" ? "repair-harness-catalog-source" : "use-catalog-harness-for-project-auto-match";
    logInfo("harness-catalog.scanned", {
      requestId,
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      actor: auth.actor,
      role: auth.role,
      outcome: scan.status === "FAILED" ? "blocked" : "success",
      correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
      metadata: {
        catalogId,
        status: scan.status,
        templateCount: scan.templates.length,
        catalogDigest: scan.catalog?.catalogDigest,
        nextAction
      }
    });
    return writeJson(response, scan.status === "FAILED" ? 422 : 200, envelope({
      schema: "evopilot-harness-catalog-scan-result/v1",
      scan,
      mount: scan.mount,
      catalog: scan.catalog,
      templates: scan.templates,
      nextAction
    }));
  }

  return false;
}
