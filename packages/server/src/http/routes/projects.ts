import http from "node:http";
import type { StoredProject } from "../../model.js";

interface ProjectRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  runtime: any;
  profile: { id: string };
  requireLlm: boolean;
  deps: Record<string, any>;
}

export async function handleProjectRoutes(context: ProjectRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options, runtime, profile, requireLlm } = context;
  const {
    audit,
    canAccessScopedResource,
    checkLlmProfileReadiness,
    checkProjectDevopsReadiness,
    checkSourceCredentialReadiness,
    devopsProviderMatchesRepository,
    diagnoseProjectRuntime,
    envelope,
    hasRole,
    logInfo,
    maskLlmProfile,
    maskProject,
    normalizeProjectDevops,
    normalizeProjectLlmBinding,
    normalizeProjectRepository,
    normalizeProjectRuntime,
    optionalTrimmedString,
    projectLlmUsage,
    readJson,
    repositoryDisplayName,
    repositoryNamespaceFromRegistration,
    resolveLoopLlmSelection,
    safeFileName,
    updateProjectSourceCredentials,
    validateProjectRepository,
    workspaceUsage,
    writeJson
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/projects") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listProjects()
      .filter((project: any) => canAccessScopedResource(auth, project.tenantId, project.workspaceId))
      .map((project: any) => maskProject(project, store))));
  }
  const projectOwnershipMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/ownership$/);
  if (request.method === "PATCH" && projectOwnershipMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectOwnershipMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    const body = await readJson(request, options.maxBodyBytes);
    const tenantId = safeFileName(optionalTrimmedString(body.tenantId) ?? project.tenantId);
    const workspaceId = safeFileName(optionalTrimmedString(body.workspaceId) ?? project.workspaceId);
    const workspace = store.readWorkspace(workspaceId);
    if (!workspace) return writeJson(response, 404, { error: "WORKSPACE_NOT_FOUND" });
    if (workspace.tenantId !== tenantId) return writeJson(response, 409, { error: "PROJECT_WORKSPACE_TENANT_MISMATCH" });
    const updated = {
      ...project,
      tenantId,
      workspaceId,
      updatedAt: new Date().toISOString()
    };
    store.writeProject(updated);
    store.appendAudit(audit(auth, "project.ownership.updated", updated.id, {
      fromTenantId: project.tenantId,
      fromWorkspaceId: project.workspaceId,
      tenantId,
      workspaceId
    }));
    return writeJson(response, 200, envelope(maskProject(updated, store)));
  }
  const projectDiagnosticsMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/diagnostics$/);
  if (request.method === "GET" && projectDiagnosticsMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectDiagnosticsMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    return writeJson(response, 200, envelope(await diagnoseProjectRuntime({ store, project, runtime })));
  }
  const projectUsageMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/usage$/);
  if (request.method === "GET" && projectUsageMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectUsageMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    return writeJson(response, 200, envelope(projectLlmUsage(store, project)));
  }
  const projectSourceCredentialMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/source-credentials$/);
  if (request.method === "POST" && projectSourceCredentialMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectSourceCredentialMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    if (!project.repository) return writeJson(response, 409, { error: "PROJECT_REPOSITORY_NOT_CONFIGURED" });
    const body = await readJson(request, options.maxBodyBytes);
    const updated = updateProjectSourceCredentials(project, body);
    updated.validation = await validateProjectRepository(updated.repository, store, updated);
    updated.updatedAt = new Date().toISOString();
    store.writeProject(updated);
    const readiness = await checkSourceCredentialReadiness(updated, store);
    store.appendAudit(audit(auth, "project.source-credentials.updated", updated.id, {
      provider: updated.repository?.provider,
      tokenRefConfigured: Boolean(updated.repository?.credentials?.tokenRef),
      tokenConfigured: Boolean(updated.repository?.credentials?.token || updated.repository?.credentials?.password),
      readiness: readiness.status,
      blockers: readiness.blockers
    }));
    return writeJson(response, readiness.status === "READY" ? 200 : 409, envelope({ project: maskProject(updated, store), readiness }));
  }
  const projectSourceCredentialPreflightMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/source-credentials\/preflight$/);
  if ((request.method === "GET" || request.method === "POST") && projectSourceCredentialPreflightMatch) {
    if (!hasRole(auth, request.method === "POST" ? "operator" : "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectSourceCredentialPreflightMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const readiness = await checkSourceCredentialReadiness(project, store);
    if (request.method === "POST") {
      store.appendAudit(audit(auth, "project.source-credentials-preflight", project.id, {
        provider: project.repository?.provider,
        readiness: readiness.status,
        blockers: readiness.blockers
      }));
    }
    return writeJson(response, readiness.status === "READY" ? 200 : 409, envelope(readiness));
  }
  const projectDevopsMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/devops$/);
  if (request.method === "GET" && projectDevopsMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectDevopsMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    if (!project.devops) return writeJson(response, 404, { error: "PROJECT_DEVOPS_NOT_CONFIGURED", projectId: project.id });
    return writeJson(response, 200, envelope(project.devops));
  }
  if ((request.method === "POST" || request.method === "PUT") && projectDevopsMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectDevopsMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const devops = normalizeProjectDevops(body, project);
    if (!devops) return writeJson(response, 400, { error: "PROJECT_DEVOPS_PROVIDER_REQUIRED", detail: "provider must be github-actions or gitlab-ci." });
    const providerCheck = devopsProviderMatchesRepository(project, devops);
    if (!providerCheck.ok) return writeJson(response, 409, { error: "DEVOPS_PROVIDER_PROJECT_MISMATCH", detail: providerCheck.detail, projectId: project.id });
    const updated: StoredProject = {
      ...project,
      devops,
      updatedAt: new Date().toISOString()
    };
    store.writeProject(updated);
    const readiness = await checkProjectDevopsReadiness(updated, store);
	        store.appendAudit(audit(auth, "project.devops.updated", updated.id, {
	          provider: devops.provider,
	          executionMode: readiness.executionMode,
	          devopsOwner: readiness.devopsOwner,
	          workflowRepository: readiness.workflowRepository,
	          claimBoundary: readiness.claimBoundary,
	          ciWorkflow: devops.ci.workflow,
	          cdWorkflow: devops.cd?.workflow,
	          readiness: readiness.status,
	          blockers: readiness.blockers
    }));
    logInfo("project.devops.updated", {
      actor: auth.actor,
      target: updated.id,
      metadata: {
	            projectId: updated.id,
	            provider: devops.provider,
	            executionMode: readiness.executionMode,
	            devopsOwner: readiness.devopsOwner,
	            workflowRepository: readiness.workflowRepository,
	            claimBoundary: readiness.claimBoundary,
	            readiness: readiness.status,
	            blockers: readiness.blockers
	          }
	        });
    return writeJson(response, readiness.status === "BLOCKED" ? 409 : 200, envelope({ project: maskProject(updated, store), devops, readiness }));
  }
  if (request.method === "DELETE" && projectDevopsMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectDevopsMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const { devops, ...rest } = project;
    const updated: StoredProject = { ...rest, updatedAt: new Date().toISOString() };
    store.writeProject(updated);
    store.appendAudit(audit(auth, "project.devops.cleared", updated.id, { previousProvider: devops?.provider }));
    return writeJson(response, 200, envelope({ project: maskProject(updated, store), cleared: Boolean(devops) }));
  }
  const projectDevopsPreflightMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/devops\/preflight$/);
  if ((request.method === "GET" || request.method === "POST") && projectDevopsPreflightMatch) {
    if (!hasRole(auth, request.method === "POST" ? "operator" : "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectDevopsPreflightMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const readiness = await checkProjectDevopsReadiness(project, store);
    if (request.method === "POST") {
	          store.appendAudit(audit(auth, "project.devops-preflight", project.id, {
	            provider: project.devops?.provider,
	            executionMode: readiness.executionMode,
	            devopsOwner: readiness.devopsOwner,
	            workflowRepository: readiness.workflowRepository,
	            claimBoundary: readiness.claimBoundary,
	            readiness: readiness.status,
	            blockers: readiness.blockers
	          }));
      logInfo("project.devops.preflight", {
        actor: auth.actor,
        target: project.id,
        metadata: {
	              projectId: project.id,
	              provider: project.devops?.provider,
	              executionMode: readiness.executionMode,
	              devopsOwner: readiness.devopsOwner,
	              workflowRepository: readiness.workflowRepository,
	              claimBoundary: readiness.claimBoundary,
	              readiness: readiness.status,
	              blockers: readiness.blockers
	            }
      });
    }
    return writeJson(response, readiness.status === "READY" ? 200 : 409, envelope(readiness));
  }
  const projectLlmMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/llm$/);
  if (request.method === "GET" && projectLlmMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectLlmMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const resolved = resolveLoopLlmSelection(store, { project, tenantId: project.tenantId, workspaceId: project.workspaceId, requireLlm });
    return writeJson(response, resolved.readiness.status === "READY" ? 200 : 409, envelope({
      schema: "evopilot-project-llm/v1",
      projectId: project.id,
      llm: project.llm,
      selection: resolved.selection,
      profile: resolved.profile ? maskLlmProfile(resolved.profile) : undefined,
      readiness: resolved.readiness
    }));
  }
  if ((request.method === "POST" || request.method === "PUT") && projectLlmMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectLlmMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const profileId = safeFileName(optionalTrimmedString(body.profileId) ?? optionalTrimmedString(body.profile) ?? optionalTrimmedString(body.llmProfileId) ?? "");
    if (!profileId) return writeJson(response, 400, { error: "LLM_PROFILE_REQUIRED", detail: "profileId is required." });
    const profileRecord = store.readLlmProfile(profileId);
    if (!profileRecord) return writeJson(response, 404, { error: "LLM_PROFILE_NOT_FOUND" });
    if (profileRecord.tenantId !== project.tenantId || profileRecord.workspaceId !== project.workspaceId) return writeJson(response, 403, { error: "LLM_PROFILE_FORBIDDEN" });
    const updated: StoredProject = {
      ...project,
      llm: {
        schema: "evopilot-project-llm-binding/v1",
        profileId,
        required: body.required === undefined ? true : body.required !== false,
        boundAt: new Date().toISOString(),
        boundBy: auth.actor
      },
      updatedAt: new Date().toISOString()
    };
    store.writeProject(updated);
    const resolved = resolveLoopLlmSelection(store, { project: updated, tenantId: updated.tenantId, workspaceId: updated.workspaceId, requireLlm: true });
    store.appendAudit(audit(auth, "project.llm.updated", updated.id, {
      profileId,
      provider: profileRecord.providerName,
      model: profileRecord.modelName,
      readiness: resolved.readiness.status,
      blockers: resolved.readiness.blockers
    }));
    logInfo("project.llm.updated", {
      actor: auth.actor,
      target: updated.id,
      metadata: {
        projectId: updated.id,
        profileId,
        provider: profileRecord.providerName,
        model: profileRecord.modelName,
        readiness: resolved.readiness.status,
        blockers: resolved.readiness.blockers
      }
    });
    return writeJson(response, resolved.readiness.status === "READY" ? 200 : 409, envelope({
      schema: "evopilot-project-llm/v1",
      project: maskProject(updated, store),
      llm: updated.llm,
      selection: resolved.selection,
      profile: maskLlmProfile(profileRecord),
      readiness: resolved.readiness
    }));
  }
  if (request.method === "DELETE" && projectLlmMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectLlmMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const { llm, ...rest } = project;
    const updated: StoredProject = { ...rest, updatedAt: new Date().toISOString() };
    store.writeProject(updated);
    store.appendAudit(audit(auth, "project.llm.cleared", updated.id, { previousProfileId: llm?.profileId }));
    const resolved = resolveLoopLlmSelection(store, { project: updated, tenantId: updated.tenantId, workspaceId: updated.workspaceId, requireLlm });
    return writeJson(response, 200, envelope({ project: maskProject(updated, store), cleared: Boolean(llm), selection: resolved.selection, readiness: resolved.readiness }));
  }
  const projectLlmPreflightMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/llm\/preflight$/);
  if ((request.method === "GET" || request.method === "POST") && projectLlmPreflightMatch) {
    if (!hasRole(auth, request.method === "POST" ? "operator" : "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectLlmPreflightMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const resolved = resolveLoopLlmSelection(store, { project, tenantId: project.tenantId, workspaceId: project.workspaceId, requireLlm: true });
    const readiness = resolved.profile
      ? await checkLlmProfileReadiness(store, resolved.profile, { tenantId: project.tenantId, workspaceId: project.workspaceId })
      : resolved.readiness;
    if (request.method === "POST") {
      store.appendAudit(audit(auth, "project.llm-preflight", project.id, {
        profileId: project.llm?.profileId,
        provider: readiness.provider,
        model: readiness.model,
        readiness: readiness.status,
        blockers: readiness.blockers
      }));
      logInfo("project.llm.preflight", {
        actor: auth.actor,
        target: project.id,
        metadata: {
          projectId: project.id,
          profileId: project.llm?.profileId,
          provider: readiness.provider,
          model: readiness.model,
          readiness: readiness.status,
          blockers: readiness.blockers
        }
      });
    }
    return writeJson(response, readiness.status === "READY" ? 200 : 409, envelope(readiness));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/pipelines") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listPipelines().slice(-10).reverse()));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/code-upgrade-runs") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listCodeUpgradeRuns().slice(-10).reverse()));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/projects") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const now = new Date().toISOString();
    const projectId = String(body.id ?? "").trim();
    const tenantId = safeFileName(optionalTrimmedString(body.tenantId) ?? auth.tenantId);
    const workspaceId = safeFileName(optionalTrimmedString(body.workspaceId) ?? auth.workspaceId);
    const workspace = store.readWorkspace(workspaceId);
    if (!workspace) return writeJson(response, 404, { error: "WORKSPACE_NOT_FOUND" });
    if (workspace.tenantId !== tenantId) return writeJson(response, 409, { error: "PROJECT_WORKSPACE_TENANT_MISMATCH" });
    const usage = workspaceUsage(store, workspace);
    if (usage.projects.used >= usage.projects.limit) {
      return writeJson(response, 429, { error: "WORKSPACE_PROJECT_QUOTA_EXCEEDED", detail: usage });
    }
    const repository = normalizeProjectRepository(body);
    const validation = await validateProjectRepository(repository, store, { tenantId, workspaceId });
    const projectRuntime = normalizeProjectRuntime(body);
    const projectLlm = normalizeProjectLlmBinding(body, auth.actor);
    if (projectLlm) {
      const llmProfile = store.readLlmProfile(projectLlm.profileId);
      if (!llmProfile) {
        const readiness = resolveLoopLlmSelection(store, {
          tenantId,
          workspaceId,
          requestedProfileId: projectLlm.profileId,
          requireLlm: true
        }).readiness;
        return writeJson(response, 409, { error: "LLM_PROFILE_NOT_READY", profileId: projectLlm.profileId, readiness });
      }
      if (llmProfile.tenantId !== tenantId || llmProfile.workspaceId !== workspaceId) return writeJson(response, 403, { error: "LLM_PROFILE_FORBIDDEN", profileId: projectLlm.profileId });
    }
    const projectDevops = normalizeProjectDevops(body, {
      id: projectId,
      name: String(body.name ?? body.id ?? "").trim(),
      profileId: String(body.profileId ?? profile.id),
      tenantId,
      workspaceId,
      repository,
      llm: projectLlm,
      validation,
      createdAt: now,
      updatedAt: now
    });
    const devopsProviderCheck = projectDevops ? devopsProviderMatchesRepository({ repository } as StoredProject, projectDevops) : { ok: true };
    if (!devopsProviderCheck.ok) return writeJson(response, 409, { error: "DEVOPS_PROVIDER_PROJECT_MISMATCH", detail: devopsProviderCheck.detail, projectId });
    const project: StoredProject = {
      id: projectId,
      name: String(body.name ?? body.id ?? "").trim(),
      profileId: String(body.profileId ?? profile.id),
      tenantId,
      workspaceId,
      repository,
      devops: projectDevops,
      llm: projectLlm,
      runtime: projectRuntime,
      validation,
      createdAt: now,
      updatedAt: now
    };
    if (!project.id || !project.name) return writeJson(response, 400, { error: "PROJECT_ID_AND_NAME_REQUIRED" });
    if (project.validation.status !== "VERIFIED") return writeJson(response, 400, { error: "PROJECT_VALIDATION_FAILED", detail: project.validation.message });
    store.writeProject(project);
    store.appendAudit(audit(auth, "project.created", project.id, {
      provider: repository?.provider,
      executionMode: repository?.topology?.executionMode,
      repositoryOwner: repositoryNamespaceFromRegistration(repository),
      workingRepository: repositoryDisplayName(repository?.topology?.working),
      upstreamRepository: repositoryDisplayName(repository?.topology?.upstream),
      validation: validation.status,
      devopsProvider: project.devops?.provider,
      devopsOwner: project.devops?.boundary?.owner,
      claimBoundary: project.devops?.boundary?.claimBoundary,
      llmProfileId: project.llm?.profileId
    }));
    return writeJson(response, 201, envelope(maskProject(project, store)));
  }


  return false;
}
