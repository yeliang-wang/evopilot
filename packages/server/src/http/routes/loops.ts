import http from "node:http";
import type { SourceReleaseDeployFinalizer } from "../../model.js";

interface LoopRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  requireLlm: boolean;
  deps: Record<string, any>;
}

export async function handleLoopRoutes(context: LoopRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options, requireLlm } = context;
  const {
    applySourceClosureReviewDecision,
    audit,
    buildSourceReleaseClosureRun,
    canAccessScopedResource,
    canAccessWorkspace,
    discoverSourceReleaseRunRepairCandidates,
    envelope,
    executeLoopSourceClosure,
    getIdempotencyKey,
    hasRole,
    isRecord,
    llmProfileIdFromPayload,
    normalizeLoopArtifact,
    normalizeLoopDecision,
    normalizeLoopTriggerSource,
    optionalTrimmedString,
    preflightLoopSourceClosure,
    readJson,
    repairSourceReleaseRun,
    repairSourceReleaseRunCandidates,
    resolveLoopLlmSelection,
    safeFileName,
    workspaceUsage,
    writeEventStream,
    writeJson
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/loops") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listLoops()
      .filter((loop: any) => canAccessScopedResource(auth, loop.tenantId, loop.workspaceId))
      .slice(-50)
      .reverse()));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/loops") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const idempotencyKey = getIdempotencyKey(request);
    if (idempotencyKey) {
      const existing = store.readIdempotency(`loop:create:${idempotencyKey}`);
      if (existing) return writeJson(response, 200, existing);
    }
    const body = await readJson(request, options.maxBodyBytes);
    const objective = String(body.objective ?? "").trim();
    if (!objective) return writeJson(response, 400, { error: "LOOP_OBJECTIVE_REQUIRED" });
    const projectId = body.projectId ? safeFileName(String(body.projectId)) : "evopilot";
    const project = store.readProject(projectId);
    const tenantId = safeFileName(optionalTrimmedString(body.tenantId) ?? project?.tenantId ?? auth.tenantId);
    const workspaceId = safeFileName(optionalTrimmedString(body.workspaceId) ?? project?.workspaceId ?? auth.workspaceId);
    const workspace = store.readWorkspace(workspaceId);
    if (!workspace) return writeJson(response, 404, { error: "WORKSPACE_NOT_FOUND" });
    if (!canAccessWorkspace(auth, workspace, "developer")) return writeJson(response, 403, { error: "WORKSPACE_FORBIDDEN" });
    const usage = workspaceUsage(store, workspace);
    if (usage.loops.used >= usage.loops.limit) {
      return writeJson(response, 429, { error: "WORKSPACE_LOOP_QUOTA_EXCEEDED", detail: usage });
    }
    const llmResolution = resolveLoopLlmSelection(store, {
      project,
      tenantId,
      workspaceId,
      requestedProfileId: llmProfileIdFromPayload(body),
      requireLlm
    });
    if (llmResolution.readiness.status !== "READY" && (llmProfileIdFromPayload(body) || project?.llm?.required)) {
      return writeJson(response, 409, { error: "LLM_PROFILE_NOT_READY", readiness: llmResolution.readiness });
    }
    const loop = store.createLoop({
      id: body.id ? String(body.id) : undefined,
      source: normalizeLoopTriggerSource(body.source),
      projectId,
      tenantId,
      workspaceId,
      objective,
      executorGraphId: body.executorGraphId ? String(body.executorGraphId) : undefined,
      controlPlaneUrl: body.controlPlaneUrl ? String(body.controlPlaneUrl) : undefined,
      sourceClosure: isRecord(body.sourceClosure) ? body.sourceClosure : undefined,
      stopPolicy: isRecord(body.stopPolicy) ? body.stopPolicy : undefined,
      retryPolicy: isRecord(body.retryPolicy) ? body.retryPolicy : undefined,
      sandbox: isRecord(body.sandbox) ? body.sandbox : undefined,
      context: isRecord(body.context) ? body.context : undefined,
      llm: llmResolution.selection
    });
    store.appendAudit(audit(auth, "loop.created", loop.id, { source: loop.source, projectId: loop.projectId, executorGraphId: loop.executorGraphId, llmProfileId: loop.llm?.profileId, llmProvider: loop.llm?.provider, llmModel: loop.llm?.model }));
    const bodyOut = envelope(loop);
    if (idempotencyKey) store.writeIdempotency(`loop:create:${idempotencyKey}`, bodyOut);
    return writeJson(response, 201, bodyOut);
  }
  const loopStartMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/start$/);
  if (request.method === "POST" && loopStartMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const idempotencyKey = getIdempotencyKey(request);
    if (idempotencyKey) {
      const existing = store.readIdempotency(`loop:start:${decodeURIComponent(loopStartMatch[1])}:${idempotencyKey}`);
      if (existing) return writeJson(response, 200, existing);
    }
    const body = await readJson(request, options.maxBodyBytes);
    const loop = await store.startLoop(decodeURIComponent(loopStartMatch[1]), auth.actor, {
      forceDecision: normalizeLoopDecision(body.forceDecision),
      evidence: Array.isArray(body.evidence) ? body.evidence.map(String) : undefined
    });
    if (!loop) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop.started", loop.id, { status: loop.status, iteration: loop.currentIteration }));
    const bodyOut = envelope(loop);
    if (idempotencyKey) store.writeIdempotency(`loop:start:${loop.id}:${idempotencyKey}`, bodyOut);
    return writeJson(response, 200, bodyOut);
  }
  const loopResumeMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/resume$/);
  if (request.method === "POST" && loopResumeMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const idempotencyKey = getIdempotencyKey(request);
    if (idempotencyKey) {
      const existing = store.readIdempotency(`loop:resume:${decodeURIComponent(loopResumeMatch[1])}:${idempotencyKey}`);
      if (existing) return writeJson(response, 200, existing);
    }
    const body = await readJson(request, options.maxBodyBytes);
    const loop = await store.resumeLoop(decodeURIComponent(loopResumeMatch[1]), auth.actor, {
      forceDecision: normalizeLoopDecision(body.forceDecision),
      evidence: Array.isArray(body.evidence) ? body.evidence.map(String) : undefined
    });
    if (!loop) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop.resumed", loop.id, { status: loop.status, iteration: loop.currentIteration }));
    const bodyOut = envelope(loop);
    if (idempotencyKey) store.writeIdempotency(`loop:resume:${loop.id}:${idempotencyKey}`, bodyOut);
    return writeJson(response, 200, bodyOut);
  }
  const loopReplayMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/replay$/);
  if (request.method === "POST" && loopReplayMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const loop = await store.replayLoop(decodeURIComponent(loopReplayMatch[1]), auth.actor, {
      fromIteration: Number(body.fromIteration ?? body.iteration ?? 1),
      contextPatch: isRecord(body.contextPatch) ? body.contextPatch : isRecord(body.context) ? body.context : undefined,
      evidence: Array.isArray(body.evidence) ? body.evidence.map(String) : undefined,
      artifacts: Array.isArray(body.artifacts) ? body.artifacts.map(normalizeLoopArtifact) : undefined,
      forceDecision: normalizeLoopDecision(body.forceDecision)
    });
    if (!loop) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop.replayed", loop.id, { status: loop.status, iteration: loop.currentIteration }));
    return writeJson(response, 200, envelope(loop));
  }
  const loopCheckpointsMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/checkpoints$/);
  if (request.method === "GET" && loopCheckpointsMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const checkpoints = store.listLoopCheckpoints(decodeURIComponent(loopCheckpointsMatch[1]));
    if (!checkpoints) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    return writeJson(response, 200, envelope(checkpoints));
  }
  const loopTimeTravelReplayMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/time-travel\/replay$/);
  if (request.method === "POST" && loopTimeTravelReplayMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const result = await store.replayLoopWithDiff(decodeURIComponent(loopTimeTravelReplayMatch[1]), auth.actor, {
      fromIteration: Number(body.fromIteration ?? body.iteration ?? 1),
      contextPatch: isRecord(body.contextPatch) ? body.contextPatch : isRecord(body.context) ? body.context : undefined,
      evidence: Array.isArray(body.evidence) ? body.evidence.map(String) : undefined,
      artifacts: Array.isArray(body.artifacts) ? body.artifacts.map(normalizeLoopArtifact) : undefined,
      forceDecision: normalizeLoopDecision(body.forceDecision)
    });
    if (!result) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop.time-travel-replayed", result.loop.id, {
      fromIteration: result.replayDiff.fromIteration,
	          changedExecutorOutputs: result.replayDiff.executorOutputChanges.filter((item: any) => item.changed).length
    }));
    return writeJson(response, 200, envelope(result));
  }
  const loopApproveMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/approve$/);
  if (request.method === "POST" && loopApproveMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const loop = store.approveLoop(decodeURIComponent(loopApproveMatch[1]), auth.actor, body.approvalId ? String(body.approvalId) : undefined);
    if (!loop) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop.approved", loop.id, { status: loop.status }));
    return writeJson(response, 200, envelope(loop));
  }
  const loopCancelMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/cancel$/);
  if (request.method === "POST" && loopCancelMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const loop = store.cancelLoop(decodeURIComponent(loopCancelMatch[1]), auth.actor, body.reason ? String(body.reason) : undefined);
    if (!loop) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop.cancelled", loop.id, { status: loop.status }));
    return writeJson(response, 200, envelope(loop));
  }
  const loopTimelineMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/timeline$/);
  if (request.method === "GET" && loopTimelineMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const loop = store.readLoop(decodeURIComponent(loopTimelineMatch[1]));
    if (!loop) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    return writeJson(response, 200, envelope(loop.timeline));
  }
  const loopEvidenceMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/evidence$/);
  if (request.method === "GET" && loopEvidenceMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const loop = store.readLoop(decodeURIComponent(loopEvidenceMatch[1]));
    if (!loop) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    return writeJson(response, 200, envelope(loop.evidenceSets));
  }
  const loopArtifactsMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/artifacts$/);
  if (request.method === "GET" && loopArtifactsMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const loop = store.readLoop(decodeURIComponent(loopArtifactsMatch[1]));
    if (!loop) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    return writeJson(response, 200, envelope(loop.artifacts));
  }
  const loopTraceMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/trace$/);
  if (request.method === "GET" && loopTraceMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const loop = store.readLoop(decodeURIComponent(loopTraceMatch[1]));
    if (!loop) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    return writeJson(response, 200, envelope(loop.trace));
  }
  const loopTraceTreeMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/trace-tree$/);
  if (request.method === "GET" && loopTraceTreeMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const tree = store.readLoopTraceTree(decodeURIComponent(loopTraceTreeMatch[1]));
    if (!tree) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    return writeJson(response, 200, envelope(tree));
  }
  const loopEventsMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/events$/);
  if (request.method === "GET" && loopEventsMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const events = store.listLoopStreamEvents(decodeURIComponent(loopEventsMatch[1]));
    if (!events) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    if (String(request.headers.accept ?? "").includes("text/event-stream")) {
      writeEventStream(response, events);
      return true;
    }
    return writeJson(response, 200, envelope(events));
  }
  const loopSandboxProofMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/sandbox-proof$/);
  if (request.method === "GET" && loopSandboxProofMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const proof = store.readLoopSandboxProof(decodeURIComponent(loopSandboxProofMatch[1]));
    if (!proof) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    return writeJson(response, 200, envelope(proof));
  }
  const loopSandboxProofVerifyMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/sandbox-proof\/verify$/);
  if (request.method === "POST" && loopSandboxProofVerifyMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const result = store.verifyLoopSandboxProof(decodeURIComponent(loopSandboxProofVerifyMatch[1]), auth.actor);
    if (!result) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop.sandbox-proof-verified", result.loop.id, { status: result.proof.status, runtime: result.proof.runtime }));
    return writeJson(response, 200, envelope(result));
  }
  const loopSourceClosureExecuteMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/source-closure\/execute$/);
  if (request.method === "POST" && loopSourceClosureExecuteMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const result = await executeLoopSourceClosure(store, decodeURIComponent(loopSourceClosureExecuteMatch[1]), auth.actor, body);
    if (!result) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop.source-closure-executed", result.loop.id, {
      provider: result.loop.sourceClosure.repositoryProvider,
      closureState: result.loop.sourceClosure.closureState,
      branch: result.loop.sourceClosure.artifacts.branch,
      tag: result.loop.sourceClosure.artifacts.tag,
      releaseRunId: result.releaseRun.id
    }));
    return writeJson(response, 200, envelope({ ...result.loop, sourceReleaseRun: result.releaseRun }));
  }
  const loopSourceClosureReviewDecisionMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/source-closure\/review-decision$/);
  if (request.method === "POST" && loopSourceClosureReviewDecisionMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const result = await applySourceClosureReviewDecision(store, decodeURIComponent(loopSourceClosureReviewDecisionMatch[1]), auth.actor, body);
    if (!result) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop.source-closure-review-decided", result.loop.id, {
      action: result.action,
      provider: result.loop.sourceClosure.repositoryProvider,
      reviewStatus: result.releaseRun.review.status,
      mergeCommitSha: result.releaseRun.review.mergeCommitSha,
      releaseRunId: result.releaseRun.id
    }));
    return writeJson(response, 200, envelope({ ...result.loop, sourceReleaseRun: result.releaseRun }));
  }
  const loopSourceClosurePlanMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/source-closure\/plan$/);
  if (request.method === "GET" && loopSourceClosurePlanMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const loop = store.readLoop(decodeURIComponent(loopSourceClosurePlanMatch[1]));
    if (!loop) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    const latestRun = store.listSourceReleaseClosureRuns(loop.id).at(-1);
    return writeJson(response, 200, envelope(latestRun ?? buildSourceReleaseClosureRun(loop)));
  }
  const sourceReleaseRunRepairMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/source-release-runs\/([^/]+)\/repair$/);
  if (request.method === "POST" && sourceReleaseRunRepairMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const result = await repairSourceReleaseRun(store, decodeURIComponent(sourceReleaseRunRepairMatch[1]), decodeURIComponent(sourceReleaseRunRepairMatch[2]), auth.actor, body);
    if (!result) return writeJson(response, 404, { error: "SOURCE_RELEASE_RUN_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop.source-release-run-repaired", result.loop.id, {
      originalReleaseRunId: result.originalReleaseRun.id,
      releaseRunId: result.releaseRun.id,
      closureState: result.loop.sourceClosure.closureState
    }));
    return writeJson(response, 200, envelope(result));
  }
  const loopSourceClosurePreflightMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/source-closure\/preflight$/);
  if ((request.method === "GET" || request.method === "POST") && loopSourceClosurePreflightMatch) {
    if (!hasRole(auth, request.method === "POST" ? "operator" : "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const result = await preflightLoopSourceClosure(store, decodeURIComponent(loopSourceClosurePreflightMatch[1]), {
      actor: auth.actor,
      persist: request.method === "POST"
    });
    if (!result) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop.source-closure-preflight", result.loopId, {
      status: result.status,
      provider: result.provider,
      blockers: result.blockers
    }));
    return writeJson(response, result.status === "PASS" ? 200 : 409, envelope(result));
  }
  const loopSourceReleaseRunsMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/source-release-runs$/);
  if (request.method === "GET" && loopSourceReleaseRunsMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listSourceReleaseClosureRuns(decodeURIComponent(loopSourceReleaseRunsMatch[1]))));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/source-release-runs") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listSourceReleaseClosureRuns()));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/source-release-runs/repair-candidates") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const includeRepaired = url.searchParams.get("includeRepaired") === "true";
    return writeJson(response, 200, envelope(discoverSourceReleaseRunRepairCandidates(store, { includeRepaired })));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/source-release-runs/repair-candidates/repair") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const result = await repairSourceReleaseRunCandidates(store, auth.actor, body);
    store.appendAudit(audit(auth, "source-release-run-repair-queue.executed", "source-release-runs", {
      repaired: result.repaired.length,
      failed: result.failed.length,
      skipped: result.skipped.length
    }));
    return writeJson(response, 200, envelope(result));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/source-release-deploy-finalizers") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const status = optionalTrimmedString(url.searchParams.get("status"))?.toUpperCase() as SourceReleaseDeployFinalizer["status"] | undefined;
    const filter = status === "PENDING" || status === "SUCCEEDED" || status === "FAILED" ? status : undefined;
    return writeJson(response, 200, envelope(store.listSourceReleaseDeployFinalizers(filter)));
  }
  const loopMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)$/);
  if (request.method === "GET" && loopMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const loop = store.readLoop(decodeURIComponent(loopMatch[1]));
    if (!loop) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    return writeJson(response, 200, envelope(loop));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/loop-workers/heartbeat") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const loopId = String(body.loopId ?? "").trim();
    const workerId = String(body.workerId ?? "").trim();
    if (!loopId || !workerId) return writeJson(response, 400, { error: "LOOP_WORKER_HEARTBEAT_REQUIRED" });
    const loop = store.heartbeatLoop(loopId, workerId, body.leaseSeconds === undefined ? 120 : Number(body.leaseSeconds));
    if (!loop) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop-worker.heartbeat", loop.id, { workerId, expiresAt: loop.workerLease?.expiresAt }));
    return writeJson(response, 200, envelope(loop.workerLease));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-workers/leases") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listLoopLeases()));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-workers/queue") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listLoopWorkerQueue()));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/loop-workers/claim") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const workerId = String(body.workerId ?? "").trim();
    if (!workerId) return writeJson(response, 400, { error: "LOOP_WORKER_ID_REQUIRED" });
    const result = store.claimNextLoop(workerId, body.leaseSeconds === undefined ? 120 : Number(body.leaseSeconds), new Date(), optionalTrimmedString(body.loopId));
    store.appendAudit(audit(auth, "loop-worker.claimed", result.claimed?.loopId ?? "none", {
      workerId: result.workerId,
      claimed: result.claimed?.loopId
    }));
    return writeJson(response, result.claimed ? 201 : 200, envelope(result));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/loops/watchdog") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const result = store.runLoopWatchdog();
    store.appendAudit(audit(auth, "loop-watchdog.ran", "loops", { recovered: result.recovered.length, blocked: result.blocked.length }));
    return writeJson(response, 200, envelope(result));
  }


  return false;
}
