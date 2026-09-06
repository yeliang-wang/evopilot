import http from "node:http";
import type { LifecycleService } from "../../domains/lifecycle/index.js";

interface LifecycleRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  service: LifecycleService;
  options: { maxBodyBytes?: number };
  deps: Record<string, any>;
}

export async function handleLifecycleRoutes(context: LifecycleRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, service, options } = context;
  const { audit, envelope, hasRole, readJson, writeJson, appendAudit } = context.deps;
  const reject = (status: number, error: unknown) => writeJson(response, status, lifecycleError(error));

  try {
    if (request.method === "GET" && url.pathname === "/api/v1/lifecycles") {
      if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
      return writeJson(response, 200, envelope({
        schema: "evopilot-lifecycle-catalog/v1alpha1",
        actionRegistryDigest: service.registry.digest,
        lifecycles: service.catalog.list()
      }));
    }
    const inspectMatch = url.pathname.match(/^\/api\/v1\/lifecycles\/([^/]+)$/);
    if (request.method === "GET" && inspectMatch) {
      if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
      return writeJson(response, 200, envelope(service.catalog.resolve(decodeURIComponent(inspectMatch[1]), url.searchParams.get("version") ?? undefined)));
    }
    if (request.method === "POST" && url.pathname === "/api/v1/lifecycles/resolve-inputs") {
      if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes);
      return writeJson(response, 200, envelope(service.resolveInputs(String(body.lifecycleId ?? ""), optionalString(body.lifecycleVersion), inputSources(body))));
    }
    if (request.method === "POST" && url.pathname === "/api/v1/lifecycles/resolve") {
      if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes);
      const selection = service.catalog.select({ lifecycleId: optionalString(body.lifecycleId), lifecycleVersion: optionalString(body.lifecycleVersion), labels: record(body.labels) as Record<string, string>, goalText: optionalString(body.goalText) });
      return writeJson(response, 200, envelope({ schema: "evopilot-lifecycle-resolution/v1alpha1", selection, revision: service.catalog.resolve(selection.lifecycle.id, selection.lifecycle.version) }));
    }
    if (request.method === "GET" && url.pathname === "/api/v1/lifecycle-runs") {
      if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
      return writeJson(response, 200, envelope(service.list({ tenantId: auth.tenantId, workspaceId: auth.workspaceId })));
    }
    if (request.method === "POST" && url.pathname === "/api/v1/lifecycle-runs") {
      if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes);
      assertProjectBinding(store, auth, body);
      assertPublishedHarnessBundle(store, body.harnessBundle);
      assertGoalBinding(store, auth, body);
      const run = service.start({
        id: optionalString(body.id),
        lifecycleId: String(body.lifecycleId ?? ""),
        lifecycleVersion: optionalString(body.lifecycleVersion),
        tenantId: auth.tenantId,
        workspaceId: auth.workspaceId,
        projectId: String(body.projectId ?? ""),
        goalId: optionalString(body.goalId),
        targetId: optionalString(body.targetId),
        policyDigest: String(body.policyDigest ?? ""),
        runtimeDigest: String(body.runtimeDigest ?? ""),
        evidenceDigest: optionalString(body.evidenceDigest),
        harnessBundle: body.harnessBundle,
        executor: body.executor,
        ...inputSources(body)
      });
      appendAudit(audit(auth, "lifecycle-run.created", run.id, { lifecycle: run.revision.ref, bindingDigest: run.binding?.digest, projectId: run.projectId, goalId: run.goalId }));
      return writeJson(response, 201, envelope(run));
    }
    const runMatch = url.pathname.match(/^\/api\/v1\/lifecycle-runs\/([^/]+)$/);
    if (request.method === "GET" && runMatch) {
      if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const run = service.read(decodeURIComponent(runMatch[1]));
      if (!run || run.tenantId !== auth.tenantId || run.workspaceId !== auth.workspaceId) return writeJson(response, 404, { error: "LIFECYCLE_RUN_NOT_FOUND" });
      return writeJson(response, 200, envelope(run));
    }
    const mutationMatch = url.pathname.match(/^\/api\/v1\/lifecycle-runs\/([^/]+)\/(answer|finalize-binding|authorize|decision|cancel|advance|external-result|feedback)$/);
    if (request.method === "POST" && mutationMatch) {
      if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const id = decodeURIComponent(mutationMatch[1]);
      const existing = service.read(id);
      if (!existing || existing.tenantId !== auth.tenantId || existing.workspaceId !== auth.workspaceId) return writeJson(response, 404, { error: "LIFECYCLE_RUN_NOT_FOUND" });
      const action = mutationMatch[2];
      const body = await readJson(request, options.maxBodyBytes);
      if (["authorize", "decision", "advance", "external-result", "feedback"].includes(action) && existing.binding) assertPublishedHarnessBundle(store, existing.binding.harnessBundle);
      let run;
      if (action === "answer") run = service.answer(id, record(body.answers), inputSources(body));
      else if (action === "finalize-binding") {
        assertPublishedHarnessBundle(store, body.harnessBundle);
        run = service.finalizeBinding(id, { policyDigest: String(body.policyDigest ?? ""), runtimeDigest: String(body.runtimeDigest ?? ""), evidenceDigest: optionalString(body.evidenceDigest), harnessBundle: body.harnessBundle, executor: body.executor });
      }
      else if (action === "authorize") run = service.authorizePlan(id, decision(body.decision), auth.actor, String(body.evidenceRef ?? ""), String(body.bindingDigest ?? ""));
      else if (action === "decision") run = service.decide(id, String(body.stageId ?? ""), decision(body.decision), auth.actor, String(body.evidenceRef ?? ""), String(body.bindingDigest ?? ""));
      else if (action === "cancel") run = service.cancel(id, auth.actor, String(body.evidenceRef ?? ""), String(body.bindingDigest ?? ""));
      else if (action === "external-result") run = service.recordExternalResult(id, {
        requestId: String(body.requestId ?? ""),
        status: resultStatus(body.status),
        receiptDigest: String(body.receiptDigest ?? ""),
        evidence: stringList(body.evidence),
        cost: record(body.cost) as any,
        artifacts: Array.isArray(body.artifacts) ? body.artifacts : []
      });
      else if (action === "feedback") {
        const feedback = service.createFeedbackPackage(id, { bindingDigest: String(body.bindingDigest ?? ""), actor: auth.actor, evidenceRef: String(body.evidenceRef ?? "") });
        appendAudit(audit(auth, "lifecycle-run.feedback", feedback.id, { lifecycleRunId: id, bindingDigest: feedback.bindingDigest, feedbackDigest: feedback.digest }));
        return writeJson(response, 201, envelope(feedback));
      }
      else run = service.advanceUntilBoundary(id);
      appendAudit(audit(auth, `lifecycle-run.${action}`, run.id, { status: run.status, currentStageId: run.currentStageId, bindingDigest: run.binding?.digest }));
      return writeJson(response, 200, envelope(run));
    }
    return false;
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0] : "LIFECYCLE_REQUEST_INVALID";
    const status = code === "LIFECYCLE_NOT_FOUND" || code === "LIFECYCLE_RUN_NOT_FOUND" ? 404 : code.includes("LOCKED") || code.includes("NOT_PENDING") || code.includes("REQUIRED") ? 409 : 400;
    return reject(status, error);
  }
}

function assertPublishedHarnessBundle(store: any, value: unknown): void {
  const binding = record(value);
  const id = optionalString(binding.id);
  const version = optionalString(binding.version);
  const digest = optionalString(binding.digest);
  if (!id || !version || !digest) throw new Error("LIFECYCLE_HARNESS_BUNDLE_BINDING_REQUIRED");
  const catalogId = optionalString(binding.catalogId);
  const bundles = store.listHarnessCatalogScans().filter((scan: any) => scan.status === "READY" && scan.format === "asset-v3")
    .filter((scan: any) => !catalogId || scan.catalog?.catalogId === catalogId || scan.mount?.catalogId === catalogId)
    .flatMap((scan: any) => scan.bundles ?? []);
  const exact = bundles.find((bundle: any) => bundle.metadata?.id === id && bundle.metadata?.version === version && bundle.metadata?.lifecycle === "published" && bundle.catalogRef?.entryDigest === digest);
  if (!exact) throw new Error(`LIFECYCLE_HARNESS_BUNDLE_NOT_PUBLISHED: ${id}@${version} digest=${digest}`);
}

function assertGoalBinding(store: any, auth: any, body: Record<string, any>): void {
  const goalId = optionalString(body.goalId);
  if (!goalId) return;
  const goal = store.readGoal(goalId);
  if (!goal || goal.tenantId !== auth.tenantId || goal.workspaceId !== auth.workspaceId) throw new Error(`LIFECYCLE_GOAL_NOT_FOUND: ${goalId}`);
  if (goal.projectId !== String(body.projectId ?? "")) throw new Error(`LIFECYCLE_GOAL_PROJECT_MISMATCH: expected ${goal.projectId}`);
  const selected = goal.plan?.selectedHarness;
  const requested = record(body.harnessBundle);
  if (selected?.bindingMode === "immutable-bundle" && (selected.bundleRef?.id !== requested.id || selected.bundleRef?.version !== requested.version || selected.bundleRef?.digest !== requested.digest)) {
    throw new Error("LIFECYCLE_GOAL_HARNESS_BUNDLE_MISMATCH");
  }
}

function assertProjectBinding(store: any, auth: any, body: Record<string, any>): void {
  const projectId = optionalString(body.projectId);
  if (!projectId) throw new Error("LIFECYCLE_PROJECT_BINDING_REQUIRED");
  const project = store.readProject(projectId);
  if (!project || project.tenantId !== auth.tenantId || project.workspaceId !== auth.workspaceId) throw new Error(`LIFECYCLE_PROJECT_NOT_FOUND: ${projectId}`);
}

function lifecycleError(error: unknown): { error: string; detail: string } {
  const detail = error instanceof Error ? error.message : String(error);
  return { error: detail.split(":")[0] || "LIFECYCLE_REQUEST_INVALID", detail };
}

function inputSources(body: Record<string, any>) {
  return {
    answers: record(body.answers),
    projectFacts: record(body.projectFacts),
    organizationDefaults: record(body.organizationDefaults),
    runtimeCapabilities: record(body.runtimeCapabilities),
    deterministicValues: record(body.deterministicValues)
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function decision(value: unknown): "APPROVED" | "REJECTED" {
  if (value !== "APPROVED" && value !== "REJECTED") throw new Error("LIFECYCLE_DECISION_INVALID");
  return value;
}

function resultStatus(value: unknown): "SUCCEEDED" | "FAILED" | "UNCERTAIN" {
  if (value !== "SUCCEEDED" && value !== "FAILED" && value !== "UNCERTAIN") throw new Error("LIFECYCLE_EXTERNAL_RESULT_INVALID");
  return value;
}
