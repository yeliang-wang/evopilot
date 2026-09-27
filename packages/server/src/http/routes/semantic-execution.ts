import type http from "node:http";
import {semanticExecutionCapabilities, semanticExecutionRequest, type SemanticExecutionOperation} from "@evopilot/contracts";
import type {createSemanticExecutionApplication} from "../../application/semantic-execution-application.js";
import {semanticProjectAccess, semanticRequestId, type SemanticDiscoveryAccess} from "../../application/project-semantic-discovery.js";
import {redactSemanticError} from "../../domains/harness-template/semantic-catalog-io.js";
import {requireSemantic} from "../../domains/harness-template/semantic-catalog-contract.js";
import {digestObject} from "../../domains/harness-template/utils.js";

type Application = ReturnType<typeof createSemanticExecutionApplication>;
export type SemanticExecutionAudit = {operation: string; phase: "STARTED" | "SUCCEEDED" | "REJECTED";
  projectId: string; requestId: string; principal: ReturnType<typeof semanticProjectAccess>["principal"];
  resultDigest?: string; errorCode?: string};

/** Scoped, audited owner operations. No client-authored facts, permissions or
 * success flags, arbitrary adapters, phase/GA closure or publication. */
export async function handleSemanticExecutionRoutes(context: {
  request: http.IncomingMessage; response: http.ServerResponse; url: URL; requestId: string;
  service: Application; adapterConfigured: boolean; collectorConfigured?: boolean; currentAccess: (projectId: string) => SemanticDiscoveryAccess;
  setRequestErrorCode: (code: string) => void;
  deps: {envelope: (data: unknown) => unknown; writeJson: (response: http.ServerResponse, status: number, body: unknown) => boolean;
    readJson: (request: http.IncomingMessage, maximumBytes: number) => Promise<unknown>; audit: (event: SemanticExecutionAudit) => void};
}): Promise<boolean> {
  const {request, response, url, requestId, deps} = context;
  const match = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/semantic-execution\/([^/]+)$/);
  if (!match) return false;
  response.setHeader("Cache-Control", "no-store");
  const fail = (status: number, code: string, nextAction?: string) => {
    context.setRequestErrorCode(code); return deps.writeJson(response, status, {error: code, requestId, ...(nextAction ? {nextAction} : {})});
  };
  let projectId: string;
  try {projectId = decodeURIComponent(match[1]);} catch {return fail(400, "SEMANTIC_EXECUTION_REQUEST_INVALID");}
  const operation = match[2];
  if (!semanticRequestId(projectId) || url.search) return fail(400, "SEMANTIC_EXECUTION_REQUEST_INVALID");
  if (request.method !== (operation === "capabilities" ? "GET" : "POST")) return fail(405, "SEMANTIC_EXECUTION_METHOD_INVALID");
  const abort = new AbortController(), cancel = () => abort.abort();
  request.once("aborted", cancel); response.once("close", cancel);
  let principal: SemanticExecutionAudit["principal"] | undefined;
  const audit = (phase: SemanticExecutionAudit["phase"], extra: Partial<SemanticExecutionAudit> = {}) => {
    if (principal) deps.audit({operation, phase, projectId, requestId, principal, ...extra});
  };
  try {
    const access = {currentAccess: () => context.currentAccess(projectId), signal: abort.signal};
    principal = semanticProjectAccess(projectId, access.currentAccess()).principal;
    requireSemantic(["operator", "admin"].includes(principal.role), "PERMISSION_DENIED");
    if (request.aborted || response.destroyed) abort.abort();
    requireSemantic(!abort.signal.aborted, "CANCELLED");
    if (operation === "capabilities") {
      if (request.headers["transfer-encoding"] || (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) return fail(400, "SEMANTIC_EXECUTION_REQUEST_INVALID");
      return deps.writeJson(response, 200, deps.envelope(semanticExecutionCapabilities(projectId, context.adapterConfigured, context.collectorConfigured, true)));
    }
    if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") return fail(400, "SEMANTIC_EXECUTION_REQUEST_INVALID");
    let value: Record<string, unknown>;
    try {value = semanticExecutionRequest(operation, projectId, await deps.readJson(request, 65536)).body!;}
    catch {audit("REJECTED", {errorCode: "INVALID"}); return fail(400, "SEMANTIC_EXECUTION_REQUEST_INVALID");}
    requireSemantic(digestObject(principal) === digestObject(semanticProjectAccess(projectId, access.currentAccess()).principal), "PERMISSION_DENIED");
    // Record intent before effects. Failure here prevents invocation. Success
    // delivery is at-least-once; persisted claims/results prevent blind replay.
    audit("STARTED");
    const service = context.service;
    let result: unknown;
    switch (operation as SemanticExecutionOperation) {
      case "planning": result = await service.planning(value as Parameters<Application["planning"]>[0], access); break;
      case "draft": result = await service.draft(value as Parameters<Application["draft"]>[0], access); break;
      case "prepare": result = await service.prepare(value as Parameters<Application["prepare"]>[0], access); break;
      case "inspect": result = await service.inspect(value.identity as Parameters<Application["inspect"]>[0], access); break;
      case "bind": result = await service.bind(value.identity as Parameters<Application["bind"]>[0], access); break;
      case "resolve": result = await service.resolve(value as Parameters<Application["resolve"]>[0], access); break;
      case "mapping": result = await service.mapping(value as Parameters<Application["mapping"]>[0], access); break;
      case "review": result = await service.review(value as Parameters<Application["review"]>[0], access); break;
      case "approveReview": result = await service.approveReview(value as Parameters<Application["approveReview"]>[0], access); break;
      case "dispatch": result = await service.dispatch(value as Parameters<Application["dispatch"]>[0], access); break;
      case "collect": result = await service.collect(value as Parameters<Application["collect"]>[0], access); break;
      case "evaluate": result = await service.evaluate(value as Parameters<Application["evaluate"]>[0], access); break;
      case "commitStage": result = await service.commitStage(value as Parameters<Application["commitStage"]>[0], access); break;
      case "stageReceipt": result = service.stageReceipt(value as Parameters<Application["stageReceipt"]>[0], access); requireSemantic(result, "UNAVAILABLE"); break;
      case "completeTarget": result = await service.completeTarget(value as Parameters<Application["completeTarget"]>[0], access); break;
      case "completionReceipt": result = service.completionReceipt(value as Parameters<Application["completionReceipt"]>[0], access); requireSemantic(result, "UNAVAILABLE"); break;
      case "completionStatus": result = service.completionStatus(value as Parameters<Application["completionStatus"]>[0], access); break;
      case "completeGoal": result = service.completeGoal(value as Parameters<Application["completeGoal"]>[0], access); break;
      case "goalReceipt": result = service.goalReceipt(value as Parameters<Application["goalReceipt"]>[0], access); requireSemantic(result, "UNAVAILABLE"); break;
      case "completePhase": result = service.completePhase(value as Parameters<Application["completePhase"]>[0], access); break;
      case "phaseReceipt": result = service.phaseReceipt(value as Parameters<Application["phaseReceipt"]>[0], access); requireSemantic(result, "UNAVAILABLE"); break;
    }
    requireSemantic(!abort.signal.aborted, "CANCELLED");
    requireSemantic(digestObject(principal) === digestObject(semanticProjectAccess(projectId, access.currentAccess()).principal), "PERMISSION_DENIED");
    audit("SUCCEEDED", {resultDigest: digestObject(result)});
    return deps.writeJson(response, 200, deps.envelope(result));
  } catch (error) {
    const code = (error as {code?: string})?.code;
    if (["GOAL_WRITE_RECONCILIATION_REQUIRED", "LIFECYCLE_WRITE_RECONCILIATION_REQUIRED"].includes(code ?? "")) {
      try {audit("REJECTED", {errorCode: "RECONCILIATION_REQUIRED"});} catch { /* preserve uncertain write */ }
      return fail(409, "SEMANTIC_EXECUTION_RECONCILIATION_REQUIRED", "inspect-retained-write-claim-do-not-replay");
    }
    const safe = redactSemanticError(error);
    // Unknown adapter/audit exceptions never expose raw paths or messages.
    try {audit("REJECTED", {errorCode: safe.code});} catch { /* fail closed without replay */ }
    const status = safe.code === "PERMISSION_DENIED" ? 403 : safe.code === "UNAVAILABLE" ? 404 : safe.code === "TIMEOUT" ? 504 : safe.code === "CANCELLED" ? 408 : 409;
    return fail(status, `SEMANTIC_EXECUTION_${safe.code}`, safe.nextAction);
  } finally {request.off("aborted", cancel); response.off("close", cancel);}
}
