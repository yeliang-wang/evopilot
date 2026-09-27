import type http from "node:http";
import type {createProjectSemanticBindingService} from "../../application/project-semantic-binding.js";
import {semanticProjectAccess, semanticRequestId, type SemanticDiscoveryAccess} from "../../application/project-semantic-discovery.js";
import {redactSemanticError} from "../../domains/harness-template/semantic-catalog-io.js";
import {requireSemantic} from "../../domains/harness-template/semantic-catalog-contract.js";
import {isRecord} from "../../domains/harness-template/utils.js";

export async function handleProjectSemanticBindingRoutes(context: {
  request: http.IncomingMessage; response: http.ServerResponse; url: URL; requestId: string;
  service: ReturnType<typeof createProjectSemanticBindingService>;
  currentAccess: (projectId: string) => SemanticDiscoveryAccess;
  setRequestErrorCode: (code: string) => void;
  deps: {envelope: (data: unknown) => unknown; writeJson: (response: http.ServerResponse, status: number, body: unknown) => boolean;
    readJson: (request: http.IncomingMessage, maximumBytes: number) => Promise<unknown>;
    auditApproval: (record: Awaited<ReturnType<ReturnType<typeof createProjectSemanticBindingService>["approve"]>>) => void;
    auditTransition: (record: Awaited<ReturnType<ReturnType<typeof createProjectSemanticBindingService>["approveTransition"]>>) => void};
}): Promise<boolean> {
  const {request, response, url, requestId, deps} = context;
  const match = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/semantic-binding(?:\/(reviews|approvals|activation|transition-reviews|transition-approvals))?$/);
  if (!match || (match[2] && match[2] !== "activation" ? request.method !== "POST" : request.method !== "GET")) return false;
  response.setHeader("Cache-Control", "no-store");
  const fail = (status: number, code: string, nextAction?: string) => {
    context.setRequestErrorCode(code);
    return deps.writeJson(response, status, {error: code, requestId, ...(nextAction ? {nextAction} : {})});
  };
  let projectId: string;
  try { projectId = decodeURIComponent(match[1]); } catch { return fail(400, "SEMANTIC_REQUEST_INVALID"); }
  if (!semanticRequestId(projectId) || url.search) return fail(400, "SEMANTIC_REQUEST_INVALID");
  const abort = new AbortController(), cancel = () => abort.abort();
  request.once("aborted", cancel); response.once("close", cancel);
  try {
    const input = {projectId, currentAccess: () => context.currentAccess(projectId), signal: abort.signal};
    const principal = semanticProjectAccess(projectId, input.currentAccess()).principal;
    if (request.aborted || response.destroyed) abort.abort();
    if (!match[2] || match[2] === "activation") {
      if (request.headers["transfer-encoding"] || (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) return fail(400, "SEMANTIC_REQUEST_INVALID");
      return deps.writeJson(response, 200, deps.envelope(await (match[2] === "activation" ? context.service.activation(input) : context.service.inspect(input))));
    }
    requireSemantic(["operator", "admin"].includes(principal.role), "PERMISSION_DENIED");
    if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") return fail(400, "SEMANTIC_REQUEST_INVALID");
    let body: unknown;
    try { body = await deps.readJson(request, 2048); } catch { return fail(400, "SEMANTIC_REQUEST_INVALID"); }
    const fields = match[2] === "reviews" ? ["catalogId", "artifactSetDigest", "bundleDigest"] : match[2] === "transition-reviews" ?
      ["action", "expectedHeadDigest", "destinationDigest"] : match[2] === "transition-approvals" ? ["transitionReviewDigest", "decision"] : ["reviewDigest", "decision"];
    if (!isRecord(body) || Object.keys(body).length !== fields.length || !fields.every(key => typeof body[key] === "string")) return fail(400, "SEMANTIC_REQUEST_INVALID");
    if (match[2] === "reviews") {
      if (!semanticRequestId(body.catalogId) || ![body.artifactSetDigest, body.bundleDigest].every(value => /^sha256:[a-f0-9]{64}$/.test(String(value)))) return fail(400, "SEMANTIC_REQUEST_INVALID");
      const result = await context.service.prepare({...input, catalogId: body.catalogId, artifactSetDigest: body.artifactSetDigest as string, bundleDigest: body.bundleDigest as string});
      return deps.writeJson(response, 200, deps.envelope(result));
    }
    if (match[2] === "transition-reviews") {
      if (!["ACTIVATE", "MIGRATE", "ROLLBACK"].includes(body.action as string) || ![body.expectedHeadDigest, body.destinationDigest].every(value => /^sha256:[a-f0-9]{64}$/.test(String(value)))) return fail(400, "SEMANTIC_REQUEST_INVALID");
      return deps.writeJson(response, 200, deps.envelope(await context.service.prepareTransition({...input,
        action: body.action as "ACTIVATE" | "MIGRATE" | "ROLLBACK", expectedHeadDigest: body.expectedHeadDigest as string, destinationDigest: body.destinationDigest as string})));
    }
    if (match[2] === "transition-approvals") {
      if (body.decision !== "APPROVE" || !/^sha256:[a-f0-9]{64}$/.test(body.transitionReviewDigest as string)) return fail(400, "SEMANTIC_REQUEST_INVALID");
      const record = await context.service.approveTransition({...input, transitionReviewDigest: body.transitionReviewDigest as string});
      deps.auditTransition(record);
      return deps.writeJson(response, 200, deps.envelope(record));
    }
    if (body.decision !== "APPROVE" || !/^sha256:[a-f0-9]{64}$/.test(body.reviewDigest as string)) return fail(400, "SEMANTIC_REQUEST_INVALID");
    const record = await context.service.approve({...input, reviewDigest: body.reviewDigest as string});
    // The immutable record already contains the authoritative decision/audit
    // tuple. An uncertain audit/response failure is recovered by exact retry,
    // not by replacing the binding. Shared audit delivery is at-least-once.
    deps.auditApproval(record);
    return deps.writeJson(response, 200, deps.envelope(record));
  } catch (error) {
    const safe = redactSemanticError(error);
    const status = safe.code === "PERMISSION_DENIED" ? 403 : safe.code === "UNAVAILABLE" ? 404 : safe.code === "TIMEOUT" ? 504 : safe.code === "CANCELLED" ? 408 : 409;
    return fail(status, `SEMANTIC_BINDING_${safe.code}`, safe.nextAction);
  } finally {request.off("aborted", cancel); response.off("close", cancel);}
}
