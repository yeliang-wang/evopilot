import { canonicalDigest, composeHarnessAndLifecycle, type HarnessExecutionCurrentState } from "@evopilot/core";
import { createHash } from "node:crypto";
import http from "node:http";
import type { GovernedEvolutionService } from "../../domains/governed-evolution/index.js";
import { publishedHarnessCandidatesV5 } from "../../domains/harness-template/bundle.js";
import type { LifecycleService } from "../../domains/lifecycle/index.js";

interface GovernedEvolutionRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  service: GovernedEvolutionService;
  lifecycleService: LifecycleService;
  options: { maxBodyBytes?: number };
  deps: Record<string, any>;
}

export async function handleGovernedEvolutionRoutes(context: GovernedEvolutionRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, service, lifecycleService, options } = context;
  const { audit, envelope, hasRole, readJson, writeJson, appendAudit } = context.deps;
  const scope = { tenantId: auth.tenantId, workspaceId: auth.workspaceId };
  const reject = (status: number, error: unknown) => writeJson(response, status, governedError(error));
  try {
    if (request.method === "GET" && url.pathname === "/api/v1/evolution-project-definitions") {
      if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
      return writeJson(response, 200, envelope({ schema: "evopilot-evolution-project-definition-list/v1", items: service.listProjectDefinitions(scope) }));
    }
    if (request.method === "POST" && url.pathname === "/api/v1/evolution-project-definitions") {
      if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes);
      const definition = service.registerProjectDefinition(body as never, scope);
      appendAudit(audit(auth, "evolution-project-definition.registered", `${definition.metadata.id}@${definition.metadata.version}`, { digest: definition.digest }));
      return writeJson(response, 201, envelope(definition));
    }
    if (request.method === "POST" && url.pathname === "/api/v1/evolution-project-definitions/discover") {
      if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes);
      return writeJson(response, 200, envelope(service.discoverProject(body)));
    }
    const definitionDiffMatch = url.pathname.match(/^\/api\/v1\/evolution-project-definitions\/([^/]+)\/diff$/);
    if (request.method === "GET" && definitionDiffMatch) {
      if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
      return writeJson(response, 200, envelope(service.compareProjectDefinitionVersions(decodeURIComponent(definitionDiffMatch[1]), String(url.searchParams.get("from") ?? ""), String(url.searchParams.get("to") ?? ""), scope)));
    }
    const definitionActivationMatch = url.pathname.match(/^\/api\/v1\/evolution-project-definitions\/([^/]+)\/(activate|rollback)$/);
    if (request.method === "POST" && definitionActivationMatch) {
      if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes);
      const projectId = decodeURIComponent(definitionActivationMatch[1]);
      const version = String(body.version ?? "");
      const activation = service.activateProjectDefinitionVersion(projectId, version, auth.actor, String(body.evidenceRef ?? ""), scope, definitionActivationMatch[2] as "activate" | "rollback");
      appendAudit(audit(auth, `evolution-project-definition.${definitionActivationMatch[2]}`, `${projectId}@${version}`, { definitionDigest: activation.definitionDigest, activationDigest: activation.digest }));
      return writeJson(response, 200, envelope(activation));
    }
    const definitionMatch = url.pathname.match(/^\/api\/v1\/evolution-project-definitions\/([^/]+)$/);
    if (request.method === "GET" && definitionMatch) {
      if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const definition = service.readProjectDefinition(decodeURIComponent(definitionMatch[1]), url.searchParams.get("version") ?? undefined, scope);
      return definition ? writeJson(response, 200, envelope(definition)) : writeJson(response, 404, { error: "EVOLUTION_PROJECT_DEFINITION_NOT_FOUND" });
    }
    if (request.method === "POST" && url.pathname === "/api/v1/governed-evolution/plan") {
      if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes);
      assertScopedProject(store, auth, String(body.goalTarget?.projectId ?? ""));
      const lifecycle = lifecycleService.catalog.resolve(String(body.lifecycleId ?? ""), optionalString(body.lifecycleVersion));
      const plan = service.plan({
        projectDefinitionId: String(body.projectDefinitionId ?? ""),
        projectDefinitionVersion: optionalString(body.projectDefinitionVersion),
        goalTarget: body.goalTarget,
        candidates: publishedCandidates(store),
        lifecycle,
        policyDigest: String(body.policyDigest ?? ""),
        providerDigest: String(body.providerDigest ?? ""),
        environmentDigest: String(body.environmentDigest ?? ""),
        hostDigest: body.executor ? digestExecutor(body.executor) : String(body.hostDigest ?? ""),
        runtimeDigest: String(body.runtimeDigest ?? ""),
        authorityDigest: scopedAuthorityDigest(auth),
        evidenceDigest: String(body.evidenceDigest ?? "")
      }, scope);
      appendAudit(audit(auth, "governed-evolution.plan-created", plan.binding.digest, { projectId: plan.projectDefinition.metadata.id, harnessBundle: plan.binding.bundleRef, lifecycle: plan.binding.lifecycleRef }));
      return writeJson(response, 201, envelope(plan));
    }
    if (request.method === "POST" && url.pathname === "/api/v1/governed-evolution/runs") {
      if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes);
      const bindingDigest = String(body.bindingDigest ?? "");
      const binding = service.readBinding(bindingDigest, scope);
      if (!binding) return writeJson(response, 404, { error: "HARNESS_EXECUTION_BINDING_NOT_FOUND" });
      assertScopedProject(store, auth, binding.projectDefinitionRef.id);
      const exactCandidate = publishedCandidates(store).find((item) => item.bundle.id === binding.bundleRef.id && item.bundle.version === binding.bundleRef.version && item.bundle.digest === binding.bundleRef.digest);
      if (!exactCandidate) throw new Error("HARNESS_EXECUTION_BUNDLE_NOT_PUBLISHED");
      const lifecycle = lifecycleService.catalog.resolve(binding.lifecycleRef.id, binding.lifecycleRef.version);
      if (lifecycle.digest !== binding.lifecycleRef.digest) throw new Error("HARNESS_EXECUTION_LIFECYCLE_DRIFT");
      const executor = body.executor;
      service.assertLifecycleBoundary({
        bindingDigest,
        checkpoint: "start",
        projectId: binding.projectDefinitionRef.id,
        goalId: binding.goalTargetRef.goalId,
        targetId: binding.goalTargetRef.targetId,
        lifecycleDigest: lifecycle.digest,
        policyDigest: binding.policyDigest,
        providerDigest: binding.providerDigest,
        environmentDigest: binding.environmentDigest,
        authorityDigest: binding.authorityDigest,
        runtimeDigest: binding.runtimeDigest,
        evidenceDigest: binding.evidenceDigest,
        harnessBundle: { id: binding.bundleRef.id, version: binding.bundleRef.version, digest: binding.bundleRef.digest, catalogId: binding.catalogId },
        hostDigest: digestExecutor(executor)
      }, scope);
      const run = lifecycleService.start({
        id: optionalString(body.id),
        lifecycleId: binding.lifecycleRef.id,
        lifecycleVersion: binding.lifecycleRef.version,
        tenantId: auth.tenantId,
        workspaceId: auth.workspaceId,
        projectId: binding.projectDefinitionRef.id,
        goalId: binding.goalTargetRef.goalId,
        targetId: binding.goalTargetRef.targetId,
        policyDigest: binding.policyDigest,
        providerDigest: binding.providerDigest,
        environmentDigest: binding.environmentDigest,
        authorityDigest: binding.authorityDigest,
        runtimeDigest: binding.runtimeDigest,
        evidenceDigest: binding.evidenceDigest,
        harnessExecutionBindingDigest: binding.digest,
        harnessBundle: { id: binding.bundleRef.id, version: binding.bundleRef.version, digest: binding.bundleRef.digest, catalogId: binding.catalogId },
        executor,
        answers: record(body.answers),
        projectFacts: record(body.projectFacts),
        organizationDefaults: record(body.organizationDefaults),
        runtimeCapabilities: record(body.runtimeCapabilities),
        deterministicValues: record(body.deterministicValues)
      });
      appendAudit(audit(auth, "governed-evolution.run-created", run.id, { harnessExecutionBindingDigest: binding.digest, lifecycleBindingDigest: run.binding?.digest }));
      return writeJson(response, 201, envelope(run));
    }
    if (request.method === "POST" && url.pathname === "/api/v1/governed-evolution/revalidate") {
      if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes);
      const bindingDigest = String(body.bindingDigest ?? "");
      const binding = service.readBinding(bindingDigest, scope);
      if (!binding) return writeJson(response, 404, { error: "HARNESS_EXECUTION_BINDING_NOT_FOUND" });
      const definition = service.readProjectDefinition(binding.projectDefinitionRef.id, binding.projectDefinitionRef.version, scope);
      if (!definition) throw new Error("EVOLUTION_PROJECT_DEFINITION_NOT_FOUND");
      const goalTarget = body.goalTarget;
      if (!goalTarget || goalTarget.goalId !== binding.goalTargetRef.goalId || goalTarget.targetId !== binding.goalTargetRef.targetId) throw new Error("HARNESS_EXECUTION_GOAL_TARGET_MISMATCH");
      assertScopedProject(store, auth, String(goalTarget.projectId ?? ""));
      const lifecycle = lifecycleService.catalog.resolve(binding.lifecycleRef.id, binding.lifecycleRef.version);
      const candidate = publishedCandidates(store).find((item) => item.bundle.id === binding.bundleRef.id && item.bundle.version === binding.bundleRef.version && item.bundle.digest === binding.bundleRef.digest);
      const obligations = lifecycle.definition.obligations ?? {};
      const composition = candidate ? composeHarnessAndLifecycle(candidate.bundle, {
        lifecycleId: lifecycle.ref.id,
        lifecycleVersion: lifecycle.ref.version,
        lifecycleDigest: lifecycle.digest,
        requiredEvidence: obligations.requiredEvidence ?? [],
        validators: obligations.validators ?? [],
        constraints: obligations.constraints ?? [],
        capabilities: lifecycle.definition.capabilities ?? [],
        requestedPermissions: obligations.requestedPermissions ?? [],
        disabledHarnessEvidence: obligations.disabledHarnessEvidence,
        disabledHarnessValidators: obligations.disabledHarnessValidators,
        weakenedHarnessConstraints: obligations.weakenedHarnessConstraints
      }) : undefined;
      const catalogs = store.listHarnessCatalogScans().filter((scan: any) => scan.status === "READY" && scan.format === "asset-v3");
      const current: HarnessExecutionCurrentState = {
        projectDefinitionDigest: definition.digest,
        goalTargetDigest: digestFromBody(body.goalTargetDigest, goalTarget),
        registryDigest: candidate?.profile.registryDigest ?? "missing",
        catalogDigests: Object.fromEntries(catalogs.map((scan: any) => [scan.catalog.catalogId, scan.catalog.catalogDigest])),
        profiles: publishedCandidates(store).map((item) => ({ id: item.profile.id, version: item.profile.version, digest: item.profile.digest })),
        bundles: publishedCandidates(store).map((item) => ({ id: item.bundle.id, version: item.bundle.version, digest: item.bundle.digest, componentDigests: item.bundle.componentDigests })),
        lifecycleDigest: lifecycle.digest,
        compositionDigest: composition?.digest ?? "missing",
        policyDigest: String(body.policyDigest ?? ""),
        providerDigest: String(body.providerDigest ?? ""),
        environmentDigest: String(body.environmentDigest ?? ""),
        hostDigest: String(body.hostDigest ?? ""),
        runtimeDigest: String(body.runtimeDigest ?? ""),
        authorityDigest: scopedAuthorityDigest(auth),
        evidenceDigest: String(body.evidenceDigest ?? "")
      };
      const result = service.revalidate(bindingDigest, current, scope);
      appendAudit(audit(auth, "governed-evolution.binding-revalidated", bindingDigest, { status: result.status, drift: result.drift }));
      return writeJson(response, result.status === "VALID" ? 200 : 409, envelope(result));
    }
    if (request.method === "POST" && url.pathname === "/api/v1/governed-evolution/recovery/decide") {
      if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes);
      return writeJson(response, 200, envelope(service.decideRecovery(body as never, scope)));
    }
    if (request.method === "GET" && url.pathname === "/api/v1/automation-registry") {
      if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
      return writeJson(response, 200, envelope({ schema: "evopilot-automation-registry/v1", proposals: service.listAutomationProposals(scope), rules: service.listAutomationRules(scope) }));
    }
    if (request.method === "POST" && url.pathname === "/api/v1/automation-registry/proposals") {
      if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes);
      const proposal = service.createAutomationProposal(body as never, scope);
      appendAudit(audit(auth, "automation-rule.proposed", proposal.id, { proposalDigest: proposal.digest, failureClass: proposal.failureClass }));
      return writeJson(response, 201, envelope(proposal));
    }
    const automationMatch = url.pathname.match(/^\/api\/v1\/automation-registry\/([^/]+)\/(activate|revoke)$/);
    if (request.method === "POST" && automationMatch) {
      if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes);
      const id = decodeURIComponent(automationMatch[1]);
      const action = automationMatch[2];
      const rule = action === "activate"
        ? service.activateAutomationProposal(id, { proposalDigest: String(body.proposalDigest ?? ""), actor: auth.actor, evidenceRef: String(body.evidenceRef ?? "") }, scope)
        : service.revokeAutomationRule(id, auth.actor, String(body.evidenceRef ?? ""), scope);
      appendAudit(audit(auth, `automation-rule.${action}d`, rule.id, { digest: rule.digest, revision: rule.revision, status: rule.status }));
      return writeJson(response, 200, envelope(rule));
    }
    if (request.method === "POST" && url.pathname === "/api/v1/interactions/render") {
      if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes);
      return writeJson(response, 200, envelope(service.interaction(body as never)));
    }
    return false;
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0] : "GOVERNED_EVOLUTION_REQUEST_INVALID";
    const status = code.includes("NOT_FOUND") ? 404 : code.includes("AMBIGUOUS") || code.includes("ABSTAINED") || code.includes("CONFLICT") || code.includes("MISMATCH") ? 409 : 400;
    return reject(status, error);
  }
}

function publishedCandidates(store: any) {
  return publishedHarnessCandidatesV5({ profiles: store.listPublishedHarnessProfilesV3(), bundles: store.listPublishedHarnessBundlesV3(), components: store.listPublishedHarnessComponentsV3() });
}

function assertScopedProject(store: any, auth: any, projectId: string): void {
  const project = store.readProject(projectId);
  if (!project || project.tenantId !== auth.tenantId || project.workspaceId !== auth.workspaceId) throw new Error(`EVOLUTION_PROJECT_NOT_FOUND: ${projectId}`);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function digestExecutor(value: unknown): string {
  const executor = record(value);
  const material = {
    host: String(executor.host ?? ""),
    provider: String(executor.provider ?? ""),
    model: String(executor.model ?? ""),
    capabilities: [...new Set(Array.isArray(executor.capabilities) ? executor.capabilities.map(String) : [])].sort()
  };
  if (!material.host || !material.provider || !material.model) throw new Error("LIFECYCLE_EXECUTOR_BINDING_REQUIRED");
  const digest = canonicalDigest(material);
  if (executor.digest && executor.digest !== digest) throw new Error("LIFECYCLE_EXECUTOR_DIGEST_MISMATCH");
  return digest;
}

function governedError(error: unknown): { error: string; detail: string } {
  const detail = error instanceof Error ? error.message : String(error);
  return { error: detail.split(":")[0] || "GOVERNED_EVOLUTION_REQUEST_INVALID", detail };
}

function digestFromBody(value: unknown, fallback: unknown): string {
  if (typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)) return value;
  return `sha256:${createHash("sha256").update(stableJson(fallback)).digest("hex")}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function scopedAuthorityDigest(auth: any): string {
  return canonicalDigest({
    schema: "evopilot-request-authority-context/v1",
    tenantId: auth.tenantId,
    workspaceId: auth.workspaceId,
    actor: auth.actor,
    role: auth.role
  });
}
