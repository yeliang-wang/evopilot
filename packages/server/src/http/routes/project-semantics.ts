import type http from "node:http";
import {projectSemanticCapabilities} from "@evopilot/contracts";
import {semanticProjectAccess, semanticRequestId, type createProjectSemanticDiscoveryService, type SemanticDiscoveryAccess} from "../../application/project-semantic-discovery.js";
import {redactSemanticError} from "../../domains/harness-template/semantic-catalog-io.js";
import type {createProjectSemanticBindingService} from "../../application/project-semantic-binding.js";

export async function handleProjectSemanticRoutes(context: {
  request: http.IncomingMessage; response: http.ServerResponse; url: URL; requestId: string;
  service: ReturnType<typeof createProjectSemanticDiscoveryService>;
  onboarding: ReturnType<typeof createProjectSemanticBindingService>["onboarding"];
  currentAccess: (projectId: string) => SemanticDiscoveryAccess;
  setRequestErrorCode: (code: string) => void;
  deps: {envelope: (data: unknown) => unknown; writeJson: (response: http.ServerResponse, status: number, body: unknown) => boolean};
}): Promise<boolean> {
  const {request, response, url, requestId, deps} = context;
  const capabilityMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/semantic-capabilities$/);
  const match = capabilityMatch ?? url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/semantic-catalogs\/([^/]+)(\/compatibility|\/onboarding|\/gap)?$/);
  if (!match || request.method !== "GET") return false;
  response.setHeader("Cache-Control", "no-store");
  const fail = (status: number, code: string, nextAction?: string) => {
    context.setRequestErrorCode(code);
    return deps.writeJson(response, status, {error: code, requestId, ...(nextAction ? {nextAction} : {})});
  };
  let projectId: string, catalogId: string;
  try {projectId = decodeURIComponent(match[1]); catalogId = capabilityMatch ? "" : decodeURIComponent(match[2]);}
  catch {return fail(400, "SEMANTIC_REQUEST_INVALID");}
  const compatibility = match[3] === "/compatibility" || match[3] === "/gap";
  const keys = [...url.searchParams.keys()];
  const artifactSetDigest = url.searchParams.get("artifactSetDigest"), bundleDigest = url.searchParams.get("bundleDigest");
  const validSelection = keys.length === 2 && new Set(keys).size === 2 && keys.every(key => ["artifactSetDigest", "bundleDigest"].includes(key)) &&
    [artifactSetDigest, bundleDigest].every(value => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value));
  if (!semanticRequestId(projectId) || (!capabilityMatch && !semanticRequestId(catalogId)) || (compatibility ? !validSelection : url.search) || request.headers["transfer-encoding"] ||
    (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) return fail(400, "SEMANTIC_REQUEST_INVALID");
  const abort = new AbortController();
  const cancel = () => abort.abort();
  request.once("aborted", cancel); response.once("close", cancel);
  try {
    if (request.aborted || response.destroyed) abort.abort();
    if (capabilityMatch) {
      semanticProjectAccess(projectId, context.currentAccess(projectId));
      return deps.writeJson(response, 200, deps.envelope(projectSemanticCapabilities(projectId)));
    }
    const input = {projectId, catalogId, currentAccess: () => context.currentAccess(projectId), signal: abort.signal};
    const result = match[3] === "/onboarding" ? await context.onboarding(input) : compatibility ? await context.service[match[3] === "/gap" ? "gap" : "compatibility"]({...input, artifactSetDigest: artifactSetDigest!, bundleDigest: bundleDigest!}) :
      await context.service.inspect(input);
    return deps.writeJson(response, 200, deps.envelope(result));
  } catch (error) {
    const safe = redactSemanticError(error);
    const status = safe.code === "PERMISSION_DENIED" ? 403 : safe.code === "UNAVAILABLE" ? 404 : safe.code === "TIMEOUT" ? 504 : safe.code === "CANCELLED" ? 408 : 409;
    return fail(status, `SEMANTIC_CATALOG_${safe.code}`, safe.nextAction);
  } finally {request.off("aborted", cancel); response.off("close", cancel);}
}
