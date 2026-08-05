import http from "node:http";
import type { ReleaseReport, RuntimeEvidenceEvent } from "@evopilot/core";
import type { ScheduledEvolution } from "../../model.js";

interface DeliveryRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number; deliveryExecutor?: any };
  runtime: any;
  profile: { id: string };
  deps: Record<string, any>;
}

export async function handleDeliveryRoutes(context: DeliveryRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options, runtime, profile } = context;
  const {
    applyReviewDecision,
    audit,
    checkProjectDevopsReadiness,
    createAndStoreRunFromEvidence,
    createReleaseReport,
    envelope,
    evidenceEventsFromAgentSignals,
    evidenceEventsFromEvaluationResults,
    evidenceEventsFromFeedback,
    evidenceEventsFromOtlpLogs,
    evidenceEventsFromOtlpTraces,
    evidenceEventsFromSkyWalking,
    getIdempotencyKey,
    hasRole,
    normalizeDecisionAction,
    normalizeDeliveryParameters,
    normalizeProjectDevopsProvider,
    readJson,
    refreshCodeUpgradeRun,
    refreshPipeline,
    startCodeUpgradeExecution,
    triggerNativeDevopsDelivery,
    writeJson,
    writeText
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/runs") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listRuns()));
  }
  const runMatch = url.pathname.match(/^\/api\/v1\/runs\/([^/]+)$/);
  if (request.method === "GET" && runMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const run = store.readRun(decodeURIComponent(runMatch[1]));
    if (!run) return writeJson(response, 404, { error: "RUN_NOT_FOUND" });
    return writeJson(response, 200, envelope(run));
  }
  const pipelineMatch = url.pathname.match(/^\/api\/v1\/pipelines\/([^/]+)$/);
  if (request.method === "GET" && pipelineMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const pipeline = await refreshPipeline(store, decodeURIComponent(pipelineMatch[1]));
    if (!pipeline) return writeJson(response, 404, { error: "PIPELINE_NOT_FOUND" });
    return writeJson(response, 200, envelope(pipeline));
  }
  const pipelineLogsMatch = url.pathname.match(/^\/api\/v1\/pipelines\/([^/]+)\/logs$/);
  if (request.method === "GET" && pipelineLogsMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const pipeline = await refreshPipeline(store, decodeURIComponent(pipelineLogsMatch[1]));
    if (!pipeline) return writeJson(response, 404, { error: "PIPELINE_NOT_FOUND" });
    writeText(response, 200, pipeline.logRef?.preview ?? "");
    return true;
  }
  const pipelineArtifactsMatch = url.pathname.match(/^\/api\/v1\/pipelines\/([^/]+)\/artifacts$/);
  if (request.method === "GET" && pipelineArtifactsMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const pipeline = await refreshPipeline(store, decodeURIComponent(pipelineArtifactsMatch[1]));
    if (!pipeline) return writeJson(response, 404, { error: "PIPELINE_NOT_FOUND" });
    return writeJson(response, 200, envelope(pipeline.artifacts));
  }
  const codeUpgradeRunMatch = url.pathname.match(/^\/api\/v1\/code-upgrade-runs\/([^/]+)$/);
  if (request.method === "GET" && codeUpgradeRunMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const run = await refreshCodeUpgradeRun(store, decodeURIComponent(codeUpgradeRunMatch[1]));
    if (!run) return writeJson(response, 404, { error: "CODE_UPGRADE_RUN_NOT_FOUND" });
    return writeJson(response, 200, envelope(run));
  }
  const codeUpgradeEventsMatch = url.pathname.match(/^\/api\/v1\/code-upgrade-runs\/([^/]+)\/events$/);
  if (request.method === "GET" && codeUpgradeEventsMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const run = await refreshCodeUpgradeRun(store, decodeURIComponent(codeUpgradeEventsMatch[1]));
    if (!run) return writeJson(response, 404, { error: "CODE_UPGRADE_RUN_NOT_FOUND" });
    return writeJson(response, 200, envelope(store.listCodeUpgradeEvents(run.id)));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/runs") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const idempotencyKey = getIdempotencyKey(request);
    if (idempotencyKey) {
      const existing = store.readIdempotency(idempotencyKey);
      if (existing) return writeJson(response, 200, existing);
    }
    const body = await readJson(request, options.maxBodyBytes);
    const now = String(body.now ?? new Date().toISOString());
    const projectId = String(body.projectId ?? profile.id);
    const events = Array.isArray(body.events) ? body.events as RuntimeEvidenceEvent[] : [];
    const files = Array.isArray(body.files) ? body.files.map(String) : [];
    const run = createAndStoreRunFromEvidence({ store, auth, projectId, events, files, now, profile, idempotencyKey, ingestSource: "http-events" });
    const bodyOut = envelope(run);
    if (idempotencyKey) store.writeIdempotency(idempotencyKey, bodyOut);
    return writeJson(response, 201, bodyOut);
  }
  if (request.method === "POST" && url.pathname === "/api/v1/evidence/events") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const now = String(body.now ?? new Date().toISOString());
    const projectId = String(body.projectId ?? profile.id);
    const signals = Array.isArray(body.events) ? body.events : Array.isArray(body.signals) ? body.signals : [];
    const events = evidenceEventsFromAgentSignals(signals, now);
    const files = Array.isArray(body.files) ? body.files.map(String) : [];
    const run = createAndStoreRunFromEvidence({ store, auth, projectId, events, files, now, profile, ingestSource: "agent-sdk" });
    return writeJson(response, 201, envelope({ run, ingestedEvents: events.length, ingestSource: "agent-sdk" }));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/evidence/otlp/v1/traces") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const now = new Date().toISOString();
    const projectId = String(url.searchParams.get("projectId") ?? body.projectId ?? profile.id);
    const events = evidenceEventsFromOtlpTraces(body, now);
    const run = createAndStoreRunFromEvidence({ store, auth, projectId, events, files: [], now, profile, ingestSource: "otlp-traces" });
    return writeJson(response, 201, envelope({ run, ingestedEvents: events.length, ingestSource: "otlp-traces" }));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/evidence/otlp/v1/logs") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const now = new Date().toISOString();
    const projectId = String(url.searchParams.get("projectId") ?? body.projectId ?? profile.id);
    const events = evidenceEventsFromOtlpLogs(body, now);
    const run = createAndStoreRunFromEvidence({ store, auth, projectId, events, files: [], now, profile, ingestSource: "otlp-logs" });
    return writeJson(response, 201, envelope({ run, ingestedEvents: events.length, ingestSource: "otlp-logs" }));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/evidence/skywalking") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const now = String(body.now ?? new Date().toISOString());
    const projectId = String(body.projectId ?? profile.id);
    const events = evidenceEventsFromSkyWalking(body, now);
    const run = createAndStoreRunFromEvidence({ store, auth, projectId, events, files: [], now, profile, ingestSource: "skywalking" });
    return writeJson(response, 201, envelope({ run, ingestedEvents: events.length, ingestSource: "skywalking" }));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/evidence/evaluations") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const now = String(body.now ?? new Date().toISOString());
    const projectId = String(body.projectId ?? profile.id);
    const results = Array.isArray(body.results) ? body.results : [];
    const events = evidenceEventsFromEvaluationResults(results, now);
    const run = createAndStoreRunFromEvidence({ store, auth, projectId, events, files: [], now, profile, ingestSource: "evaluation-results" });
    return writeJson(response, 201, envelope({ run, ingestedEvents: events.length, ingestSource: "evaluation-results" }));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/evidence/feedback") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const now = String(body.now ?? new Date().toISOString());
    const projectId = String(body.projectId ?? profile.id);
    const feedback = Array.isArray(body.feedback) ? body.feedback : Array.isArray(body.items) ? body.items : [];
    const events = evidenceEventsFromFeedback(feedback, now);
    const run = createAndStoreRunFromEvidence({ store, auth, projectId, events, files: [], now, profile, ingestSource: "user-feedback" });
    return writeJson(response, 201, envelope({ run, ingestedEvents: events.length, ingestSource: "user-feedback" }));
  }
  const decisionMatch = url.pathname.match(/^\/api\/v1\/reviews\/([^/]+)\/decision$/);
  if (request.method === "POST" && decisionMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const reviewId = decodeURIComponent(decisionMatch[1]);
    const run = store.findRunByReviewId(reviewId);
    if (!run) return writeJson(response, 404, { error: "REVIEW_NOT_FOUND" });
    const reviewIndex = run.reviews.findIndex((review: any) => review.id === reviewId);
    const body = await readJson(request, options.maxBodyBytes);
    const updated = applyReviewDecision(run.reviews[reviewIndex], {
      action: normalizeDecisionAction(body.action),
      actor: String(body.actor ?? "user"),
      note: String(body.note ?? ""),
      decidedAt: new Date().toISOString()
    });
    run.reviews[reviewIndex] = updated;
    store.writeRun(run);
    store.appendAudit(audit(auth, "review.decided", reviewId, { action: updated.decisions.at(-1)?.action }));
    return writeJson(response, 200, envelope(updated));
  }
  const executeMatch = url.pathname.match(/^\/api\/v1\/deliveries\/([^/]+)\/execute$/);
  if (request.method === "POST" && executeMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const deliveryId = decodeURIComponent(executeMatch[1]);
    const run = store.findRunByDeliveryId(deliveryId);
    if (!run) return writeJson(response, 404, { error: "DELIVERY_NOT_FOUND" });
    const delivery = run.deliveryPlans.find((item: any) => item.id === deliveryId)!;
    const plan = run.plans.find((item: any) => item.id === delivery.planId)!;
    const review = run.reviews.find((item: any) => item.planId === plan.id);
    const body = await readJson(request, options.maxBodyBytes);
    const freeze = store.projectEvolutionFreezeDiagnostic(delivery.projectId);
    if (freeze && !store.isCostOptimizationDeliveryAllowed(delivery, body)) {
      store.appendAudit(audit(auth, "delivery.blocked-by-cost-freeze", deliveryId, { projectId: delivery.projectId, reason: freeze.reason }));
      return writeJson(response, 409, { error: "EVOLUTION_COST_BUDGET_FROZEN", detail: freeze.reason, costReport: freeze.costReport });
    }
    if (delivery.approvalRequired && review?.status !== "USER_CONFIRMED") {
      return writeJson(response, 409, { error: "USER_CONFIRMATION_REQUIRED" });
    }
    const project = store.readProject(delivery.projectId);
    const nativeExecutor = normalizeProjectDevopsProvider(body.executor ?? project?.devops?.provider);
    if (nativeExecutor) {
      const codeUpgrade = store.findSuccessfulCodeUpgrade(delivery.id);
      if (!codeUpgrade) return writeJson(response, 409, { error: "CODE_UPGRADE_REQUIRED" });
      if (!project?.devops) return writeJson(response, 409, { error: "DEVOPS_NOT_CONFIGURED", detail: "项目未配置 GitHub Actions 或 GitLab CI DevOps。", projectId: delivery.projectId });
      const readiness = await checkProjectDevopsReadiness(project, store);
      if (readiness.status === "BLOCKED") return writeJson(response, 409, { error: "DEVOPS_NOT_READY", detail: readiness.blockers.join("; "), readiness });
      const pipeline = await triggerNativeDevopsDelivery({ store, auth, run, delivery, plan, body: { ...body, executor: nativeExecutor }, runtime });
      if (body.batchId) {
        store.updateEvolutionBatch(String(body.batchId), {
          status: "CICD_RUNNING",
          deliveryPlanId: delivery.id,
          pipelineRunId: pipeline.id
        });
      }
      return writeJson(response, 202, envelope({ pipelineRun: pipeline, readiness }));
    }
    if (!runtime.allowMockIntegrations) {
      return writeJson(response, 400, { error: "DELIVERY_EXECUTOR_REQUIRED", detail: "prod 模式只允许通过项目 DevOps（GitHub Actions/GitLab CI）执行交付。" });
    }
    const execution = options.deliveryExecutor
      ? await options.deliveryExecutor({ run, delivery, plan, requestBody: body })
      : { ciStatus: String(body.ciStatus ?? "PASSED") as "PASSED" | "FAILED" };
    const ciStatus = execution.ciStatus;
    const status: ReleaseReport["status"] = delivery.blockOnCiFailure && ciStatus !== "PASSED" ? "FAILED" : "SUCCEEDED";
    const report = createReleaseReport({
      id: `release-${delivery.id}`,
      projectId: delivery.projectId,
      deliveryPlanId: delivery.id,
      evidenceBundleId: run.evidenceBundle.id,
      version: String(body.version ?? "0.1.0"),
      status,
      validationSummary: execution.validationSummary ?? (status === "SUCCEEDED" ? "CI/CD 与发布后验证已通过。" : "CI 失败，发布已阻断。"),
      releasedAt: status === "SUCCEEDED" ? new Date().toISOString() : undefined
    });
    run.releaseReports.push(report);
    run.learningRecords.push({
      id: `learning-${delivery.id}`,
      projectId: delivery.projectId,
      planId: plan.id,
      prediction: plan.expectedEffect,
      outcome: status === "SUCCEEDED" ? "validated" : "rejected",
      ruleChangesSuggested: status === "SUCCEEDED" ? [] : ["发布前收紧验证契约。"],
      createdAt: new Date().toISOString()
    });
    store.writeRun(run);
    store.appendAudit(audit(auth, "delivery.executed", deliveryId, { status }));
    return writeJson(response, 200, envelope({ releaseReport: report, learningRecords: run.learningRecords }));
  }
  const codeUpgradeMatch = url.pathname.match(/^\/api\/v1\/deliveries\/([^/]+)\/code-upgrade$/);
  if (request.method === "POST" && codeUpgradeMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const deliveryId = decodeURIComponent(codeUpgradeMatch[1]);
    const run = store.findRunByDeliveryId(deliveryId);
    if (!run) return writeJson(response, 404, { error: "DELIVERY_NOT_FOUND" });
    const delivery = run.deliveryPlans.find((item: any) => item.id === deliveryId)!;
    const plan = run.plans.find((item: any) => item.id === delivery.planId)!;
    const review = run.reviews.find((item: any) => item.planId === plan.id);
    const body = await readJson(request, options.maxBodyBytes);
    const freeze = store.projectEvolutionFreezeDiagnostic(delivery.projectId);
    if (freeze && !store.isCostOptimizationDeliveryAllowed(delivery, body)) {
      store.appendAudit(audit(auth, "code-upgrade.blocked-by-cost-freeze", deliveryId, { projectId: delivery.projectId, reason: freeze.reason }));
      return writeJson(response, 409, { error: "EVOLUTION_COST_BUDGET_FROZEN", detail: freeze.reason, costReport: freeze.costReport });
    }
    if (delivery.approvalRequired && review?.status !== "USER_CONFIRMED") {
      return writeJson(response, 409, { error: "USER_CONFIRMATION_REQUIRED" });
    }
    const codeUpgrade = await startCodeUpgradeExecution({ store, auth, run, delivery, plan, review, body, profile, runtime });
    if (body.batchId) {
      store.updateEvolutionBatch(String(body.batchId), {
        status: "CODE_UPGRADING",
        reviewId: review?.id,
        deliveryPlanId: delivery.id,
        codeUpgradeRunId: codeUpgrade.id
      });
    }
    return writeJson(response, 202, envelope({ codeUpgradeRun: codeUpgrade, events: store.listCodeUpgradeEvents(codeUpgrade.id) }));
  }
  const scheduleMatch = url.pathname.match(/^\/api\/v1\/deliveries\/([^/]+)\/schedule$/);
  if (request.method === "POST" && scheduleMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const deliveryId = decodeURIComponent(scheduleMatch[1]);
    const run = store.findRunByDeliveryId(deliveryId);
    if (!run) return writeJson(response, 404, { error: "DELIVERY_NOT_FOUND" });
    const delivery = run.deliveryPlans.find((item: any) => item.id === deliveryId)!;
    const plan = run.plans.find((item: any) => item.id === delivery.planId)!;
    const review = run.reviews.find((item: any) => item.planId === plan.id);
    const body = await readJson(request, options.maxBodyBytes);
    const freeze = store.projectEvolutionFreezeDiagnostic(delivery.projectId);
    if (freeze && !store.isCostOptimizationDeliveryAllowed(delivery, body)) {
      store.appendAudit(audit(auth, "delivery.schedule.blocked-by-cost-freeze", deliveryId, { projectId: delivery.projectId, reason: freeze.reason }));
      return writeJson(response, 409, { error: "EVOLUTION_COST_BUDGET_FROZEN", detail: freeze.reason, costReport: freeze.costReport });
    }
    if (delivery.approvalRequired && review?.status !== "USER_CONFIRMED") {
      return writeJson(response, 409, { error: "USER_CONFIRMATION_REQUIRED" });
    }
    const project = store.readProject(delivery.projectId);
    if (!project?.devops) return writeJson(response, 409, { error: "DEVOPS_NOT_CONFIGURED", detail: "项目未配置 GitHub Actions 或 GitLab CI DevOps。", projectId: delivery.projectId });
    const executor = normalizeProjectDevopsProvider(body.executor ?? project.devops.provider);
    if (!executor) return writeJson(response, 400, { error: "PROJECT_DEVOPS_PROVIDER_REQUIRED", detail: "provider must be github-actions or gitlab-ci." });
    if (executor !== project.devops.provider) return writeJson(response, 409, { error: "DEVOPS_PROVIDER_PROJECT_MISMATCH", detail: `scheduled executor=${executor}, project devops=${project.devops.provider}.`, projectId: delivery.projectId });
    const readiness = await checkProjectDevopsReadiness(project, store);
    if (readiness.status === "BLOCKED") return writeJson(response, 409, { error: "DEVOPS_NOT_READY", detail: readiness.blockers.join("; "), readiness });
    const connectorId = `project:${project.id}`;
    const jobName = project.devops.provider === "gitlab-ci" ? (project.devops.ci.workflow ?? ".gitlab-ci.yml") : (project.devops.ci.workflow ?? ((project.devops.ci.requiredChecks ?? []).join(",") || "github-actions"));
    const scheduledAt = String(body.scheduledAt ?? "");
    const scheduledTime = new Date(scheduledAt);
    if (Number.isNaN(scheduledTime.getTime())) return writeJson(response, 400, { error: "SCHEDULED_AT_REQUIRED" });
    const successfulCodeUpgrade = store.findSuccessfulCodeUpgrade(delivery.id);
    const parameters = normalizeDeliveryParameters(delivery, plan, body.parameters, successfulCodeUpgrade);
    const schedule: ScheduledEvolution = {
      id: `schedule-${delivery.id}-${Date.now()}`,
      projectId: delivery.projectId,
      deliveryPlanId: delivery.id,
      planId: plan.id,
      executor,
      connectorId,
      jobName,
      scheduledAt: scheduledTime.toISOString(),
      status: "SCHEDULED",
      parameters,
      createdAt: new Date().toISOString()
    };
    if (scheduledTime.getTime() <= Date.now()) {
      const codeUpgrade = store.findSuccessfulCodeUpgrade(delivery.id);
      if (!codeUpgrade) return writeJson(response, 409, { error: "CODE_UPGRADE_REQUIRED" });
      const pipeline = await triggerNativeDevopsDelivery({ store, auth, run, delivery, plan, body: { ...body, executor, parameters }, runtime });
      const triggered: ScheduledEvolution = {
        ...schedule,
        status: "TRIGGERED",
        triggeredAt: new Date().toISOString(),
        pipelineRunId: pipeline.id
      };
      store.writeSchedule(triggered);
      store.appendAudit(audit(auth, "delivery.schedule.triggered", triggered.id, { deliveryId, pipelineRunId: pipeline.id }));
      return writeJson(response, 202, envelope({ schedule: triggered, pipelineRun: pipeline }));
    }
    store.writeSchedule(schedule);
    store.appendAudit(audit(auth, "delivery.scheduled", schedule.id, { deliveryId, scheduledAt: schedule.scheduledAt }));
    return writeJson(response, 201, envelope(schedule));
  }


  return false;
}
