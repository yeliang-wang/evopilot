import http from "node:http";

interface GoalRoutesContext {
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

export async function handleGoalRoutes(context: GoalRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options, profile, requireLlm } = context;
  const {
    audit,
    buildPhasePackages,
    buildTargetEvidencePackages,
    canAccessScopedResource,
    canAccessWorkspace,
    currentReleaseDecision,
    DEFAULT_MATURITY_STANDARD_SET_ID,
    envelope,
    hasRole,
    llmProfileIdFromPayload,
    normalizeGoalPlanApprovalConfirmation,
    normalizeLoopDecision,
    normalizeOptionalMaturityPhase,
    optionalTrimmedString,
    readJson,
    resolveLoopLlmSelection,
    safeFileName,
    writeJson
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/goals") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const goals = store.listGoals()
      .filter((goal: any) => canAccessScopedResource(auth, goal.tenantId, goal.workspaceId))
      .slice(-50)
      .reverse();
    return writeJson(response, 200, envelope(goals));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/goals") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const objective = String(body.objective ?? "").trim();
    if (!objective) return writeJson(response, 400, { error: "GOAL_OBJECTIVE_REQUIRED" });
    const projectId = body.projectId ? safeFileName(String(body.projectId)) : "evopilot";
    const project = store.readProject(projectId);
    const tenantId = safeFileName(optionalTrimmedString(body.tenantId) ?? project?.tenantId ?? auth.tenantId);
    const workspaceId = safeFileName(optionalTrimmedString(body.workspaceId) ?? project?.workspaceId ?? auth.workspaceId);
    const workspace = store.readWorkspace(workspaceId);
    if (!workspace) return writeJson(response, 404, { error: "WORKSPACE_NOT_FOUND" });
    if (!canAccessWorkspace(auth, workspace, "developer")) return writeJson(response, 403, { error: "WORKSPACE_FORBIDDEN" });
    const releaseTargetId = safeFileName(String(body.releaseTargetId ?? body.targetId ?? "ga"));
    const releaseTarget = store.readReleaseTarget(releaseTargetId);
    if (!releaseTarget) return writeJson(response, 404, { error: "RELEASE_TARGET_NOT_FOUND" });
    const llmResolution = resolveLoopLlmSelection(store, {
      project,
      tenantId,
      workspaceId,
      requestedProfileId: llmProfileIdFromPayload(body),
      requireLlm,
      actor: auth
    });
    if (llmResolution.readiness.status !== "READY" && llmProfileIdFromPayload(body)) {
      return writeJson(response, 409, { error: "LLM_PROFILE_NOT_READY", readiness: llmResolution.readiness });
    }
    const goal = store.createGoal({
      id: body.id ? String(body.id) : undefined,
      projectId,
      releaseTargetId,
      objective,
      tenantId,
      workspaceId,
      llm: llmResolution.selection
    });
    store.appendAudit(audit(auth, "goal.created", goal.id, { projectId, releaseTargetId, objective, llmProfileId: goal.llm?.profileId, llmProvider: goal.llm?.provider, llmModel: goal.llm?.model }));
    return writeJson(response, 201, envelope(goal));
  }
  const goalPlanMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/plan$/);
  if (request.method === "POST" && goalPlanMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const goal = store.readGoal(decodeURIComponent(goalPlanMatch[1]));
    if (!goal) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, goal.tenantId, goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    const planned = await store.generateGoalPlan(goal.id, auth.actor, { force: Boolean(body.force) });
    if (!planned) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    store.appendAudit(audit(auth, "goal.plan-generated", planned.id, { targetCount: planned.plan.targets.length, releaseTargetId: planned.releaseTargetId }));
    return writeJson(response, 201, envelope(planned));
  }
  const goalPlanApplyMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/plan\/apply$/);
  if (request.method === "POST" && goalPlanApplyMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const goal = store.readGoal(decodeURIComponent(goalPlanApplyMatch[1]));
    if (!goal) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, goal.tenantId, goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    const updated = store.applyGoalPlan(goal.id, auth.actor, body);
    if (!updated) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    store.appendAudit(audit(auth, "goal.plan-updated", updated.id, { targetCount: updated.plan.targets.length, phases: updated.plan.phaseTargets.map((phase: any) => phase.phase) }));
    return writeJson(response, 200, envelope(updated));
  }
  const goalApprovePlanMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/approve-plan$/);
  if (request.method === "POST" && goalApprovePlanMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const goal = store.readGoal(decodeURIComponent(goalApprovePlanMatch[1]));
    if (!goal) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, goal.tenantId, goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    const confirmation = normalizeGoalPlanApprovalConfirmation(body, auth.actor);
    const approved = store.approveGoalPlan(goal.id, auth.actor, confirmation);
    if (!approved) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    store.appendAudit(audit(auth, "goal.plan-approved", approved.id, { targetCount: approved.plan.targets.length, confirmedBy: confirmation.confirmedBy, confirmation: confirmation.confirmation }));
    return writeJson(response, 200, envelope(approved));
  }
  const goalTargetsMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/targets$/);
  if (request.method === "GET" && goalTargetsMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const snapshot = store.goalSnapshot(decodeURIComponent(goalTargetsMatch[1]));
    if (!snapshot) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, snapshot.goal.tenantId, snapshot.goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(snapshot.goal.plan.targets));
  }
  const goalPhasePlanMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/phase-plan$/);
  if (request.method === "GET" && goalPhasePlanMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const snapshot = store.goalSnapshot(decodeURIComponent(goalPhasePlanMatch[1]));
    if (!snapshot) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, snapshot.goal.tenantId, snapshot.goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope({
      schema: "evopilot-goal-phase-plan/v1",
      goalId: snapshot.goal.id,
      terminalMaturity: snapshot.goal.terminalMaturity ?? "ga",
      maturityStandardSetId: snapshot.goal.maturityStandardSetId ?? DEFAULT_MATURITY_STANDARD_SET_ID,
      status: snapshot.goal.plan.status,
      editablePlan: snapshot.goal.plan.editablePlan,
      phases: snapshot.phases,
      targets: snapshot.goal.plan.targets,
      nextAction: snapshot.nextAction
    }));
  }
  const goalPhasesMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/phases$/);
  if (request.method === "GET" && goalPhasesMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const snapshot = store.goalSnapshot(decodeURIComponent(goalPhasesMatch[1]));
    if (!snapshot) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, snapshot.goal.tenantId, snapshot.goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(snapshot.phases));
  }
  const goalAdvanceMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/advance$/);
  if (request.method === "POST" && goalAdvanceMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const goal = store.readGoal(decodeURIComponent(goalAdvanceMatch[1]));
    if (!goal) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, goal.tenantId, goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    const result = await store.advanceGoal(goal.id, auth.actor, {
      autoStart: body.autoStart === false ? false : true,
      approveHumanGate: body.approveHumanGate === true,
      forceDecision: body.forceDecision ? normalizeLoopDecision(body.forceDecision) : undefined
    });
    if (!result) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    store.appendAudit(audit(auth, "goal.advanced", result.goal.id, { status: result.status, nextAction: result.nextAction, targetId: result.target?.id, loopId: result.loop?.id }));
    return writeJson(response, result.status === "BLOCKED" || result.nextAction === "plan-goal" || result.nextAction === "approve-plan" ? 409 : 200, envelope(result));
  }
  const goalSnapshotMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/snapshot$/);
  if (request.method === "GET" && goalSnapshotMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const snapshot = store.goalSnapshot(decodeURIComponent(goalSnapshotMatch[1]));
    if (!snapshot) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, snapshot.goal.tenantId, snapshot.goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(snapshot));
  }
  const goalRunStatusMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/run-status$/);
  if (request.method === "GET" && goalRunStatusMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const status = store.goalRunStatus(decodeURIComponent(goalRunStatusMatch[1]));
    if (!status) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, status.goal.tenantId, status.goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(status));
  }
  const goalGraphMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/graph$/);
  if (request.method === "GET" && goalGraphMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const goal = store.readGoal(decodeURIComponent(goalGraphMatch[1]));
    if (!goal) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, goal.tenantId, goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.goalGraph(goal.id)));
  }
  const goalTimelineMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/timeline$/);
  if (request.method === "GET" && goalTimelineMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const goal = store.readGoal(decodeURIComponent(goalTimelineMatch[1]));
    if (!goal) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, goal.tenantId, goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(goal.timeline));
  }
  const goalEvidenceMatrixMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/evidence-matrix$/);
  if (request.method === "GET" && goalEvidenceMatrixMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const goal = store.readGoal(decodeURIComponent(goalEvidenceMatrixMatch[1]));
    if (!goal) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, goal.tenantId, goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.goalEvidenceMatrix(goal.id)));
  }
  const goalPhasePackagesMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/phase-packages(?:\/([^/]+))?$/);
  if (request.method === "GET" && goalPhasePackagesMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const snapshot = store.goalSnapshot(decodeURIComponent(goalPhasePackagesMatch[1]));
    if (!snapshot) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, snapshot.goal.tenantId, snapshot.goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    const packages = buildPhasePackages(snapshot.goal, (id: string) => store.readLoop(id));
    const phase = normalizeOptionalMaturityPhase(goalPhasePackagesMatch[2]);
    if (goalPhasePackagesMatch[2] && !phase) return writeJson(response, 400, { error: "MATURITY_PHASE_INVALID" });
    const selected = phase ? packages.find((item: any) => item.phase === phase) : undefined;
    if (phase && !selected) return writeJson(response, 404, { error: "PHASE_PACKAGE_NOT_FOUND" });
    return writeJson(response, 200, envelope(selected ?? packages));
  }
  const goalTargetPackagesMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/target-packages(?:\/([^/]+))?$/);
  if (request.method === "GET" && goalTargetPackagesMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const snapshot = store.goalSnapshot(decodeURIComponent(goalTargetPackagesMatch[1]));
    if (!snapshot) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, snapshot.goal.tenantId, snapshot.goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    const packages = buildTargetEvidencePackages(snapshot.goal, (id: string) => store.readLoop(id));
    const targetId = goalTargetPackagesMatch[2] ? safeFileName(decodeURIComponent(goalTargetPackagesMatch[2])) : undefined;
    if (targetId) {
      const selected = packages.find((item: any) => item.targetId === targetId);
      if (!selected) return writeJson(response, 404, { error: "TARGET_EVIDENCE_PACKAGE_NOT_FOUND" });
      return writeJson(response, 200, envelope(selected));
    }
    return writeJson(response, 200, envelope(packages));
  }
  const goalReportMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/final-report$/);
  if (request.method === "GET" && goalReportMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const goal = store.readGoal(decodeURIComponent(goalReportMatch[1]));
    if (!goal) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, goal.tenantId, goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    if (!goal.finalReport) return writeJson(response, 409, { error: "GOAL_FINAL_REPORT_PENDING" });
    return writeJson(response, 200, envelope(goal.finalReport));
  }
  const goalMatch = url.pathname.match(/^\/api\/v1\/goals\/([^/]+)$/);
  if (request.method === "GET" && goalMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const snapshot = store.goalSnapshot(decodeURIComponent(goalMatch[1]));
    if (!snapshot) return writeJson(response, 404, { error: "GOAL_NOT_FOUND" });
    if (!canAccessScopedResource(auth, snapshot.goal.tenantId, snapshot.goal.workspaceId)) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(snapshot.goal));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/release/decisions") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const targetId = optionalTrimmedString(url.searchParams.get("targetId"));
    const projectId = optionalTrimmedString(url.searchParams.get("projectId"));
    const currentOnly = url.searchParams.get("current") === "true";
    const decisions = store.listReleaseDecisions()
      .filter((decision: any) => canAccessScopedResource(auth, decision.tenantId, decision.workspaceId))
      .filter((decision: any) => !targetId || decision.targetId === targetId)
      .filter((decision: any) => !projectId || decision.projectId === projectId);
    if (currentOnly) {
      const current = currentReleaseDecision(decisions);
      return writeJson(response, 200, envelope(current ? [current] : []));
    }
    return writeJson(response, 200, envelope(decisions
      .slice(-20)
      .reverse()));
  }


  return false;
}
