import http from "node:http";

interface LoopRuntimeRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  profile: { id: string };
  requireLlm: boolean;
  deps: Record<string, any>;
}

export async function handleLoopRuntimeRoutes(context: LoopRuntimeRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options, profile, requireLlm } = context;
  const {
    advanceLoopOrchestrationTarget,
    audit,
    envelope,
    executorGraphFromLoopOrchestrationRequest,
    hasRole,
    llmProfileIdFromPayload,
    loopOrchestrationPresets,
    loopOrchestrationTargets,
    loopStoreReadiness,
    isRecord,
    normalizeExecutorGraph,
    normalizeMemoryInboxStatus,
    optionalTrimmedString,
    readJson,
    resolveLoopLlmSelection,
    runLoopOrchestrationAutopilot,
    safeFileName,
    workflowCanvasContextFromRequest,
    writeJson
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/executor-graphs") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listExecutorGraphs()));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/executor-graphs") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const graph = store.writeExecutorGraph(normalizeExecutorGraph(body));
    store.appendAudit(audit(auth, "executor-graph.upserted", graph.id, { nodeCount: graph.nodes.length, edgeCount: graph.edges.length }));
    return writeJson(response, 201, envelope(graph));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-store") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.loopStoreRuntime()));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-store/readiness") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(await loopStoreReadiness(store.loopStoreRuntime(), { verifyConnection: true })));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/saas/observability") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.saasObservability()));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-observability") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listLoopTraces().slice(-50).reverse()));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-orchestration/presets") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(loopOrchestrationPresets(store)));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-orchestration/targets") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(loopOrchestrationTargets(store)));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/loop-orchestration/advance") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const result = await advanceLoopOrchestrationTarget(store, auth.actor, {
      targetId: optionalTrimmedString(body.targetId),
      projectId: optionalTrimmedString(body.projectId),
      targetVersion: optionalTrimmedString(body.targetVersion),
      objective: optionalTrimmedString(body.objective),
      controlPlaneUrl: optionalTrimmedString(body.controlPlaneUrl),
      deployConnectorId: optionalTrimmedString(body.deployConnectorId),
      autoStart: body.autoStart !== false
    });
    store.appendAudit(audit(auth, "loop-orchestration.advanced", result.target.id, { action: result.action, loopId: result.loop?.id, advanced: result.advanced }));
    return writeJson(response, result.advanced ? 201 : 200, envelope(result));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/loop-orchestration/autopilot") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const result = await runLoopOrchestrationAutopilot(store, auth.actor, body);
    store.appendAudit(audit(auth, "loop-orchestration.autopilot", result.target.id, {
      status: result.status,
      loopId: result.loop?.id,
      nextAction: result.nextAction,
      releaseRunId: result.releaseRun?.id
    }));
    return writeJson(response, result.status === "SUCCEEDED" ? 200 : 409, envelope(result));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-target-runtime/summary") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.loopTargetRuntimeSummary()));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/loop-target-runtime/discovery/run") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const candidates = store.runDiscoverySkillRuntime(optionalTrimmedString(body.projectId));
    store.appendAudit(audit(auth, "loop-target-runtime.discovery-run", "discovery-skill-runtime", { candidateCount: candidates.length, projectId: body.projectId }));
    return writeJson(response, 201, envelope(candidates));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-target-runtime/discovery/candidates") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listDiscoverySkillCandidates().slice(-100).reverse()));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/loop-target-runtime/handoffs") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const handoff = store.allocateFindingWorktreeHandoff({
      findingId: optionalTrimmedString(body.findingId),
      projectId: optionalTrimmedString(body.projectId),
      targetId: optionalTrimmedString(body.targetId),
      allowedPaths: Array.isArray(body.allowedPaths) ? body.allowedPaths.map(String) : undefined,
      validationCommands: Array.isArray(body.validationCommands) ? body.validationCommands.map(String) : undefined
    });
    store.appendAudit(audit(auth, "loop-target-runtime.handoff-allocated", handoff.id, { projectId: handoff.projectId, targetBranch: handoff.targetBranch }));
    return writeJson(response, 201, envelope(handoff));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-target-runtime/handoffs") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listFindingWorktreeHandoffs().slice(-100).reverse()));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/loop-target-runtime/adversarial-evaluations") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const evaluation = store.runAdversarialEvaluation({
      loopId: optionalTrimmedString(body.loopId),
      projectId: optionalTrimmedString(body.projectId),
      targetId: optionalTrimmedString(body.targetId)
    });
    store.appendAudit(audit(auth, "loop-target-runtime.adversarial-evaluated", evaluation.id, { status: evaluation.status, loopId: evaluation.loopId }));
    return writeJson(response, evaluation.status === "BLOCK" ? 409 : 201, envelope(evaluation));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-target-runtime/adversarial-evaluations") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listAdversarialEvaluations().slice(-100).reverse()));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/loop-target-runtime/schedules") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const schedule = store.upsertRecurringLoopSchedule({
      id: optionalTrimmedString(body.id),
      projectId: optionalTrimmedString(body.projectId),
      targetId: optionalTrimmedString(body.targetId),
      cadence: optionalTrimmedString(body.cadence),
      maxBudgetUsd: body.maxBudgetUsd === undefined ? undefined : Number(body.maxBudgetUsd),
      triggerRules: Array.isArray(body.triggerRules) ? body.triggerRules.map(String) : undefined
    });
    store.appendAudit(audit(auth, "loop-target-runtime.schedule-upserted", schedule.id, { cadence: schedule.cadence, nextRunAt: schedule.nextRunAt }));
    return writeJson(response, 201, envelope(schedule));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-target-runtime/schedules") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listRecurringLoopSchedules().slice(-100).reverse()));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-target-runtime/memory-inbox") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listLoopMemoryInboxItems().slice(-100).reverse()));
  }
  const memoryInboxTriageMatch = url.pathname.match(/^\/api\/v1\/loop-target-runtime\/memory-inbox\/([^/]+)\/triage$/);
  if (request.method === "POST" && memoryInboxTriageMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const status = normalizeMemoryInboxStatus(body.status);
    const item = store.triageLoopMemoryInboxItem(decodeURIComponent(memoryInboxTriageMatch[1]), status, optionalTrimmedString(body.targetId));
    if (!item) return writeJson(response, 404, { error: "MEMORY_INBOX_ITEM_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop-target-runtime.memory-triaged", item.id, { status: item.status, targetId: item.targetId }));
    return writeJson(response, 200, envelope(item));
  }
  const guardrailEvaluateMatch = url.pathname.match(/^\/api\/v1\/loop-target-runtime\/guardrails\/([^/]+)\/evaluate$/);
  if (request.method === "POST" && guardrailEvaluateMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const evaluation = store.evaluateBudgetAndJudgmentGuardrails(decodeURIComponent(guardrailEvaluateMatch[1]), isRecord(body) ? body : {});
    if (!evaluation) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "loop-target-runtime.guardrail-evaluated", evaluation.id, { status: evaluation.status, releaseJudgment: evaluation.releaseJudgment }));
    return writeJson(response, evaluation.status === "BLOCK" ? 409 : 200, envelope(evaluation));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/loop-target-runtime/guardrails") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listGuardrailEvaluations().slice(-100).reverse()));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/loop-orchestration/instantiate") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const preset = loopOrchestrationPresets(store).find((item: any) => item.id === String(body.presetId ?? "source-release-closure"));
    if (!preset) return writeJson(response, 404, { error: "LOOP_ORCHESTRATION_PRESET_NOT_FOUND" });
    const projectId = safeFileName(String(body.projectId ?? "evopilot"));
    const project = store.readProject(projectId);
    const llmResolution = resolveLoopLlmSelection(store, {
      project,
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      requestedProfileId: llmProfileIdFromPayload(body),
      requireLlm,
      actor: auth
    });
    if (llmResolution.readiness.status !== "READY" && (llmProfileIdFromPayload(body) || project?.llm?.required)) {
      return writeJson(response, 409, { error: "LLM_PROFILE_NOT_READY", readiness: llmResolution.readiness });
    }
    const deployConnectorId = optionalTrimmedString(body.deployConnectorId)
      ?? (store.listDeployConnectors().length === 1 ? store.listDeployConnectors()[0].id : undefined);
    const graph = store.writeExecutorGraph(executorGraphFromLoopOrchestrationRequest(body, preset.id));
    const workflowContext = workflowCanvasContextFromRequest(body);
    const loop = store.createLoop({
      id: body.id ? String(body.id) : undefined,
      source: "api",
      projectId,
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      objective: optionalTrimmedString(body.objective) ?? preset.defaultObjective,
      executorGraphId: graph.id,
      controlPlaneUrl: optionalTrimmedString(body.controlPlaneUrl) ?? preset.controlPlaneUrl,
      sourceClosure: {
        sourceProjectId: projectId,
        repositoryProvider: project?.repository?.provider ?? "unknown",
        sourceBranch: optionalTrimmedString(body.sourceBranch) ?? project?.repository?.defaultBranch ?? "main",
        targetVersion: optionalTrimmedString(body.targetVersion) ?? preset.defaultTargetVersion,
        deploymentConnectorId: deployConnectorId,
        deploymentEnvironment: optionalTrimmedString(body.deploymentEnvironment) ?? "production",
        requiredGates: ["code-change", "push", "deploy", "health-ready"]
      },
      sandbox: {
        runtime: "docker",
        network: "restricted",
        credentialScope: "loop",
        allowedPaths: ["src", "packages", "apps", "docs", "tests"],
        deniedPaths: [".env", ".env.*", ".git", "node_modules"]
      },
      stopPolicy: {
        maxIterations: Number(body.maxIterations ?? 8),
        maxDurationSeconds: Number(body.maxDurationSeconds ?? 24 * 60 * 60),
        requireApprovalForRelease: true,
        stopOnRepeatedFailure: 2
      },
      retryPolicy: {
        maxAttemptsPerNode: 2,
        backoffSeconds: 5,
        circuitBreakerFailures: 2
      },
      context: {
        orchestrationPresetId: preset.id,
        dashboardWorkbench: true,
        ...(workflowContext ? { workflowCanvasEditor: workflowContext } : {}),
        unattendedProof: {
          watchdog: true,
          workerLease: true,
          sourceClosure: true,
          deployRollback: true
        }
      },
      llm: llmResolution.selection
    });
    store.appendAudit(audit(auth, "loop-orchestration.instantiated", loop.id, {
      presetId: preset.id,
      projectId,
      executorGraphId: graph.id,
      llmProfileId: loop.llm?.profileId,
      llmProvider: loop.llm?.provider,
      llmModel: loop.llm?.model,
      graphValidation: graph.validation.status,
      graphCapabilities: graph.capabilities
    }));
    return writeJson(response, 201, envelope(loop));
  }
  const executorGraphMatch = url.pathname.match(/^\/api\/v1\/executor-graphs\/([^/]+)$/);
  if (request.method === "GET" && executorGraphMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const graph = store.readExecutorGraph(decodeURIComponent(executorGraphMatch[1]));
    if (!graph) return writeJson(response, 404, { error: "EXECUTOR_GRAPH_NOT_FOUND" });
    return writeJson(response, 200, envelope(graph));
  }
  const loopExecutorGraphMatch = url.pathname.match(/^\/api\/v1\/loops\/([^/]+)\/executor-graph$/);
  if (request.method === "GET" && loopExecutorGraphMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const loop = store.readLoop(decodeURIComponent(loopExecutorGraphMatch[1]));
    if (!loop) return writeJson(response, 404, { error: "LOOP_NOT_FOUND" });
    const graph = store.readExecutorGraph(loop.executorGraphId);
    if (!graph) return writeJson(response, 404, { error: "EXECUTOR_GRAPH_NOT_FOUND" });
    return writeJson(response, 200, envelope({
      loopId: loop.id,
      executorGraph: graph,
      coordination: loop.coordination,
      validation: graph.validation,
      capabilities: graph.capabilities,
      evidence: [
        `loop=${loop.id}`,
        `executorGraph=${graph.id}`,
        `nodes=${graph.nodes.length}`,
        `edges=${graph.edges.length}`,
        `validation=${graph.validation.status}`,
        `typedEdges=${graph.capabilities.typedEdges}`,
        `conditionalRouting=${graph.capabilities.conditionalRouting}`,
        `fanOutFanIn=${graph.capabilities.fanOutFanIn}`,
        `nestedSubgraphs=${graph.capabilities.nestedSubgraphs}`,
        `schemaValidation=${graph.capabilities.schemaValidation}`
      ]
    }));
  }


  return false;
}
