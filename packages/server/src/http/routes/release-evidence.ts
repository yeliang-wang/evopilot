import http from "node:http";

interface ReleaseEvidenceRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  runtime: any;
  profile: { id: string };
  llmClient: any;
  requireLlm: boolean;
  deps: Record<string, any>;
}

export async function handleReleaseEvidenceRoutes(context: ReleaseEvidenceRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options, runtime, profile, llmClient, requireLlm } = context;
  const {
    audit,
    canAccessScopedResource,
    collectProjectCodeContext,
    defaultEvaluationDatasets,
    envelope,
    hasRole,
    maskProjectCodeContext,
    normalizeEvolutionBatchStatus,
    normalizeScenarioMatrix,
    optionalTrimmedString,
    readJson,
    renderOpportunityDraftMarkdown,
    writeJson
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/release/evidence") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listReleaseEvidenceSummaries()
      .filter((bundle: any) => canAccessScopedResource(auth, bundle.tenantId, bundle.workspaceId))
      .slice(-20)
      .reverse()));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/release/evidence") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const bundle = store.generateReleaseEvidenceBundle({
      id: body.id ? String(body.id) : undefined,
      tenantId: optionalTrimmedString(body.tenantId) ?? auth.tenantId,
      workspaceId: optionalTrimmedString(body.workspaceId) ?? auth.workspaceId,
      projectId: optionalTrimmedString(body.projectId),
      candidate: body.candidate ? String(body.candidate) : undefined,
      releaseTargetId: body.releaseTargetId ? String(body.releaseTargetId) : undefined,
      scenarioMatrix: normalizeScenarioMatrix(body.scenarioMatrix),
      artifactPaths: Array.isArray(body.artifactPaths) ? body.artifactPaths.map(String) : []
    });
    store.appendAudit(audit(auth, "release-evidence.generated", bundle.id, { status: bundle.status, candidate: bundle.candidate }));
    return writeJson(response, 201, envelope(bundle));
  }
  const releaseEvidenceMatch = url.pathname.match(/^\/api\/v1\/release\/evidence\/([^/]+)$/);
  if (request.method === "GET" && releaseEvidenceMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const bundle = store.readReleaseEvidenceBundle(decodeURIComponent(releaseEvidenceMatch[1]));
    if (!bundle) return writeJson(response, 404, { error: "RELEASE_EVIDENCE_NOT_FOUND" });
    if (!canAccessScopedResource(auth, bundle.tenantId, bundle.workspaceId)) return writeJson(response, 403, { error: "RELEASE_EVIDENCE_FORBIDDEN" });
    return writeJson(response, 200, envelope(bundle));
  }
  const batchMatch = url.pathname.match(/^\/api\/v1\/evolution-batches\/([^/]+)$/);
  if (request.method === "GET" && batchMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const batch = store.readEvolutionBatch(decodeURIComponent(batchMatch[1]));
    if (!batch) return writeJson(response, 404, { error: "EVOLUTION_BATCH_NOT_FOUND" });
    return writeJson(response, 200, envelope(batch));
  }
  const batchStatusMatch = url.pathname.match(/^\/api\/v1\/evolution-batches\/([^/]+)\/status$/);
  if (request.method === "POST" && batchStatusMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const batchId = decodeURIComponent(batchStatusMatch[1]);
    const body = await readJson(request, options.maxBodyBytes);
    const updated = store.updateEvolutionBatch(batchId, {
      status: normalizeEvolutionBatchStatus(body.status),
      draftId: body.draftId ? String(body.draftId) : undefined,
      reviewId: body.reviewId ? String(body.reviewId) : undefined,
      deliveryPlanId: body.deliveryPlanId ? String(body.deliveryPlanId) : undefined,
      codeUpgradeRunId: body.codeUpgradeRunId ? String(body.codeUpgradeRunId) : undefined,
      pipelineRunId: body.pipelineRunId ? String(body.pipelineRunId) : undefined,
      failureReason: body.failureReason ? String(body.failureReason) : undefined
    });
    if (!updated) return writeJson(response, 404, { error: "EVOLUTION_BATCH_NOT_FOUND" });
    store.appendAudit(audit(auth, "evolution-batch.status-updated", updated.id, { projectId: updated.projectId, status: updated.status }));
    return writeJson(response, 200, envelope(updated));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/opportunity-drafts") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const datasetIds = Array.isArray(body.datasetIds) ? body.datasetIds.map(String) : [];
    const datasetSource = store.listEvaluationDatasets();
    const availableDatasets = datasetSource.length > 0 ? datasetSource : runtime.allowSampleData ? defaultEvaluationDatasets() : [];
    if (availableDatasets.length === 0) return writeJson(response, 503, { error: "EVALUATION_DATASET_SOURCE_NOT_CONFIGURED" });
    const datasets = availableDatasets.filter((dataset: any) => datasetIds.includes(dataset.id));
    if (datasets.length === 0) return writeJson(response, 400, { error: "EVALUATION_DATASETS_REQUIRED" });
    const title = String(body.title ?? "订单助手端到端响应体验优化").trim();
    const target = String(body.target ?? "端到端响应时间提升 5%，p95 小于 3 秒，RAG 命中率不下降").trim();
    const projectId = String(body.projectId ?? datasets[0]?.projectId ?? profile.id);
    const project = store.readProject(projectId);
    const codeContext = await collectProjectCodeContext({ store, project, runtime, profile });
    if (runtime.mode === "prod" && codeContext.status !== "AVAILABLE") {
      return writeJson(response, 409, { error: "PROJECT_CODE_CONTEXT_NOT_AVAILABLE", detail: codeContext.unavailableReason });
    }
    const now = new Date().toISOString();
    const llmDraft = await renderOpportunityDraftMarkdown({ title, target, datasets, project, codeContext, llmClient, requireLlm });
    const draft = {
      id: `draft-${Date.now()}`,
      projectId,
      title,
      target,
      datasetIds,
      sampleCount: datasets.reduce((sum: number, dataset: any) => sum + dataset.sampleCount, 0),
      triggerSource: "评测集组装 / Trace + RAG + Cost",
      createdAt: now,
      codeContext: maskProjectCodeContext(codeContext),
      proposalMarkdown: llmDraft.markdown,
      llmTrace: llmDraft.trace
    };
    store.appendAudit(audit(auth, "opportunity-draft.created", draft.id, { projectId, datasetIds, codeContextStatus: codeContext.status, codeContextFiles: codeContext.fileCount }));
    return writeJson(response, 201, envelope(draft));
  }


  return false;
}
