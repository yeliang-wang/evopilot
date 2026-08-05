import http from "node:http";
import type { ProjectHarnessProfileSource } from "../../model.js";

interface ProjectHarnessProfileRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  requestId: string;
  traceId?: string;
  parentRequestId?: string;
  setRequestErrorCode: (code: string) => void;
  deps: Record<string, any>;
}

export async function handleProjectHarnessProfileRoutes(context: ProjectHarnessProfileRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options, requestId, traceId, parentRequestId, setRequestErrorCode } = context;
  const {
    audit,
    canAccessScopedResource,
    createProjectHarnessProfileVersion,
    diffProjectHarnessProfiles,
    envelope,
    explainProjectHarnessProfile,
    generateProjectHarnessProfileDraft,
    hasRole,
    harnessTemplateRef,
    logInfo,
    logWarn,
    optionalTrimmedString,
    parseProjectHarnessProfilePayload,
    projectHarnessLogMetadata,
    projectHarnessProfileDiffWithoutBase,
    projectHarnessTemplateSelectionMode,
    projectHarnessTemplateSelectionReasons,
    readJson,
    requestCorrelation,
    safeFileName,
    writeJson
  } = context.deps;

  const projectHarnessProfilesMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/harness-profiles$/);
  if (request.method === "GET" && projectHarnessProfilesMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectHarnessProfilesMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    return writeJson(response, 200, envelope({
      schema: "evopilot-project-harness-profile-list/v1",
      projectId: project.id,
      profiles: store.listProjectHarnessProfileSummaries(project.id)
    }));
  }
  if (request.method === "POST" && projectHarnessProfilesMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectHarnessProfilesMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const parsed = parseProjectHarnessProfilePayload(body);
    const candidate = createProjectHarnessProfileVersion(store, project, {
      source: parsed.source,
      sourceFormat: parsed.sourceFormat,
      actor: auth.actor,
      status: "VALIDATED"
    });
    if (candidate.validation.status !== "VALIDATED") {
      setRequestErrorCode("PROJECT_HARNESS_PROFILE_VALIDATION_FAILED");
      logWarn("project-harness-profile.validation.failed", {
        requestId,
        tenantId: project.tenantId,
        workspaceId: project.workspaceId,
        actor: auth.actor,
        role: auth.role,
        outcome: "blocked",
        errorCode: "PROJECT_HARNESS_PROFILE_VALIDATION_FAILED",
        correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
        diagnosis: {
          summary: "ProjectHarnessProfile validation failed.",
          likelyCause: candidate.validation.blockers.join("; ") || "Project harness profile did not satisfy mandatory template gates.",
          recommendedAction: "Inspect validation.checks and validation.blockers, edit the source profile, then rerun harness profile validate/apply.",
          retriable: false,
          humanActionRequired: true
        },
        metadata: projectHarnessLogMetadata(project, candidate, { nextAction: "edit-validate-apply" })
      });
      return writeJson(response, 409, envelope({
        schema: "evopilot-project-harness-profile-apply-result/v1",
        status: "FAILED",
        validation: candidate.validation,
        candidate
      }));
    }
    const saved = store.writeProjectHarnessProfileVersion(candidate);
    logInfo("project-harness-profile.applied", {
      requestId,
      tenantId: project.tenantId,
      workspaceId: project.workspaceId,
      actor: auth.actor,
      role: auth.role,
      outcome: "success",
      correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
      metadata: projectHarnessLogMetadata(project, saved, { nextAction: "activate-reviewed-profile" })
    });
    store.appendAudit(audit(auth, "project-harness-profile.applied", `${project.id}/${saved.profileId}/v${saved.version}`, {
      projectId: project.id,
      profileId: saved.profileId,
      version: saved.version,
      sourceDigest: saved.sourceDigest,
      compiledDigest: saved.compiledDigest,
      templateId: saved.templateRef.templateId,
      templateVersion: saved.templateRef.version
    }));
    return writeJson(response, 201, envelope({
      schema: "evopilot-project-harness-profile-apply-result/v1",
      status: "VALIDATED",
      profile: saved,
      summary: store.projectHarnessProfileSummary(project.id, saved.profileId)
    }));
  }
  const projectHarnessGenerateMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/harness-profiles\/generate$/);
  if (request.method === "POST" && projectHarnessGenerateMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectHarnessGenerateMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
    const draft = await generateProjectHarnessProfileDraft(store, project, body, auth.actor);
    const saved = store.writeProjectHarnessProfileVersion(draft);
    logInfo("project-harness-profile.generated", {
      requestId,
      tenantId: project.tenantId,
      workspaceId: project.workspaceId,
      actor: auth.actor,
      role: auth.role,
      outcome: "success",
      correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
      metadata: projectHarnessLogMetadata(project, saved, {
        generatedBy: saved.generatedBy.mode,
        llmProvider: saved.generatedBy.provider,
        llmModel: saved.generatedBy.model,
        llmRequestId: saved.generatedBy.requestId,
        goalLoopTarget: optionalTrimmedString(body.goalLoopTarget) ? "provided" : "missing",
        nextAction: "review-draft-profile"
      })
    });
    store.appendAudit(audit(auth, "project-harness-profile.generated", `${project.id}/${saved.profileId}/v${saved.version}`, {
      projectId: project.id,
      profileId: saved.profileId,
      version: saved.version,
      mode: saved.generatedBy.mode,
      sourceDigest: saved.sourceDigest,
      compiledDigest: saved.compiledDigest,
      templateId: saved.templateRef.templateId,
      templateVersion: saved.templateRef.version,
      templateSelectionMode: projectHarnessTemplateSelectionMode(saved),
      templateSelectionReasons: projectHarnessTemplateSelectionReasons(saved),
      validation: saved.validation.status
    }));
    return writeJson(response, 201, envelope({
      schema: "evopilot-project-harness-profile-generate-result/v1",
      status: "DRAFT",
      profile: saved,
      summary: store.projectHarnessProfileSummary(project.id, saved.profileId),
      instruction: "Generated ProjectHarnessProfile is DRAFT. Review, validate, then activate explicitly before it controls GoalTarget planning."
    }));
  }
  const projectHarnessValidateMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/harness-profiles\/validate$/);
  if (request.method === "POST" && projectHarnessValidateMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectHarnessValidateMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const parsed = parseProjectHarnessProfilePayload(body);
    const candidate = createProjectHarnessProfileVersion(store, project, {
      source: parsed.source,
      sourceFormat: parsed.sourceFormat,
      actor: auth.actor,
      status: "DRAFT"
    });
    if (candidate.validation.status !== "VALIDATED") {
      setRequestErrorCode("PROJECT_HARNESS_PROFILE_VALIDATION_FAILED");
      logWarn("project-harness-profile.validation.failed", {
        requestId,
        tenantId: project.tenantId,
        workspaceId: project.workspaceId,
        actor: auth.actor,
        role: auth.role,
        outcome: "blocked",
        errorCode: "PROJECT_HARNESS_PROFILE_VALIDATION_FAILED",
        correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
        diagnosis: {
          summary: "ProjectHarnessProfile validation failed.",
          likelyCause: candidate.validation.blockers.join("; ") || "Project harness profile did not satisfy mandatory template gates.",
          recommendedAction: "Inspect validation.checks and validation.blockers, edit the source profile, then rerun harness profile validate.",
          retriable: false,
          humanActionRequired: true
        },
        metadata: projectHarnessLogMetadata(project, candidate, { nextAction: "edit-profile-source" })
      });
    }
    return writeJson(response, candidate.validation.status === "VALIDATED" ? 200 : 409, envelope({
      schema: "evopilot-project-harness-profile-validate-result/v1",
      status: candidate.validation.status,
      validation: candidate.validation,
      diffFromActive: candidate.diffFromActive,
      sourceDigest: candidate.sourceDigest,
      compiledDigest: candidate.compiledDigest,
      compiledContent: candidate.compiledContent
    }));
  }
  const projectHarnessProfileVersionMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/harness-profiles\/([^/]+)\/versions\/(\d+)$/);
  if (request.method === "GET" && projectHarnessProfileVersionMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectHarnessProfileVersionMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const profileId = decodeURIComponent(projectHarnessProfileVersionMatch[2]);
    const version = store.readProjectHarnessProfileVersion(project.id, profileId, Number(projectHarnessProfileVersionMatch[3]));
    if (!version) return writeJson(response, 404, { error: "PROJECT_HARNESS_PROFILE_VERSION_NOT_FOUND" });
    return writeJson(response, 200, envelope(version));
  }
  const projectHarnessProfileActionMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/harness-profiles\/([^/]+)\/(diff|activate|explain|upgrade)$/);
  if (projectHarnessProfileActionMatch) {
    const project = store.readProject(decodeURIComponent(projectHarnessProfileActionMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const profileId = safeFileName(decodeURIComponent(projectHarnessProfileActionMatch[2]));
    const action = projectHarnessProfileActionMatch[3];
    if (request.method === "POST" && action === "diff") {
      if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
      const active = store.readActiveProjectHarnessProfile(project.id, profileId);
      const candidateVersion = body.version ? store.readProjectHarnessProfileVersion(project.id, profileId, Number(body.version)) : undefined;
      const candidate = candidateVersion ?? createProjectHarnessProfileVersion(store, project, {
        source: parseProjectHarnessProfilePayload(body).source,
        sourceFormat: parseProjectHarnessProfilePayload(body).sourceFormat,
        actor: auth.actor,
        status: "DRAFT"
      });
      const diff = active
        ? diffProjectHarnessProfiles(project, profileId, active, candidate.compiledContent, candidate.version, new Date().toISOString())
        : projectHarnessProfileDiffWithoutBase(project, profileId, candidate.version);
      return writeJson(response, 200, envelope({ schema: "evopilot-project-harness-profile-diff-result/v1", diff, candidate }));
    }
    if (request.method === "POST" && action === "activate") {
      if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
      const versions = store.listProjectHarnessProfileVersions(project.id, profileId);
      const selectedVersion = Number(body.version ?? versions[versions.length - 1]?.version ?? 0);
      if (!selectedVersion) return writeJson(response, 404, { error: "PROJECT_HARNESS_PROFILE_VERSION_NOT_FOUND" });
      const activated = store.activateProjectHarnessProfileVersion(project.id, profileId, selectedVersion, auth.actor);
      if (!activated) return writeJson(response, 404, { error: "PROJECT_HARNESS_PROFILE_VERSION_NOT_FOUND" });
      logInfo("project-harness-profile.activated", {
        requestId,
        tenantId: project.tenantId,
        workspaceId: project.workspaceId,
        actor: auth.actor,
        role: auth.role,
        outcome: "success",
        correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
        metadata: projectHarnessLogMetadata(project, activated, { nextAction: "target-plan" })
      });
      store.appendAudit(audit(auth, "project-harness-profile.activated", `${project.id}/${profileId}/v${activated.version}`, {
        projectId: project.id,
        profileId,
        version: activated.version,
        sourceDigest: activated.sourceDigest,
        compiledDigest: activated.compiledDigest,
        templateId: activated.templateRef.templateId,
        templateVersion: activated.templateRef.version
      }));
      return writeJson(response, 200, envelope({
        schema: "evopilot-project-harness-profile-activate-result/v1",
        status: "ACTIVE",
        profile: activated,
        summary: store.projectHarnessProfileSummary(project.id, profileId)
      }));
    }
    if (request.method === "GET" && action === "explain") {
      if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const selectedVersion = url.searchParams.get("version") ? Number(url.searchParams.get("version")) : undefined;
      const version = selectedVersion
        ? store.readProjectHarnessProfileVersion(project.id, profileId, selectedVersion)
        : store.readActiveProjectHarnessProfile(project.id, profileId) ?? store.listProjectHarnessProfileVersions(project.id, profileId).at(-1);
      if (!version) return writeJson(response, 404, { error: "PROJECT_HARNESS_PROFILE_NOT_FOUND" });
      return writeJson(response, 200, envelope(explainProjectHarnessProfile(project, version)));
    }
    if (request.method === "POST" && action === "upgrade") {
      if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
      const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
      const active = store.readActiveProjectHarnessProfile(project.id, profileId);
      if (!active) return writeJson(response, 404, { error: "PROJECT_HARNESS_PROFILE_ACTIVE_NOT_FOUND" });
      const templateId = safeFileName(String(body.templateId ?? active.templateRef.templateId));
      const templateVersion = optionalTrimmedString(body.templateVersion ?? body.version) ?? active.templateRef.version;
      const template = store.readHarnessTemplate(templateId, templateVersion);
      if (!template) return writeJson(response, 404, { error: "HARNESS_TEMPLATE_NOT_FOUND" });
      const source: ProjectHarnessProfileSource = {
        ...active.sourceContent,
        template: harnessTemplateRef(template),
        metadata: {
          ...(active.sourceContent.metadata ?? {}),
          upgradeFromVersion: active.version,
          upgradeReason: optionalTrimmedString(body.reason) ?? "Template upgrade requested by administrator."
        }
      };
      const draft = createProjectHarnessProfileVersion(store, project, {
        source,
        sourceFormat: "object",
        actor: auth.actor,
        status: "DRAFT",
        generatedBy: {
          mode: "deterministic-template",
          actor: auth.actor,
          evidence: [`upgradeFrom=${active.version}`, `template=${template.id}@${template.version}`, `templateDigest=${template.digest}`]
        }
      });
      const saved = store.writeProjectHarnessProfileVersion(draft);
      logInfo("project-harness-profile.upgrade-drafted", {
        requestId,
        tenantId: project.tenantId,
        workspaceId: project.workspaceId,
        actor: auth.actor,
        role: auth.role,
        outcome: "success",
        correlation: requestCorrelation(url, requestId, traceId, parentRequestId),
        metadata: projectHarnessLogMetadata(project, saved, {
          upgradeFromVersion: active.version,
          fromTemplateId: active.templateRef.templateId,
          fromTemplateVersion: active.templateRef.version,
          nextAction: "review-template-upgrade-draft"
        })
      });
      store.appendAudit(audit(auth, "project-harness-profile.upgrade-drafted", `${project.id}/${profileId}/v${saved.version}`, {
        projectId: project.id,
        profileId,
        version: saved.version,
        fromVersion: active.version,
        templateId: template.id,
        templateVersion: template.version,
        validation: saved.validation.status
      }));
      return writeJson(response, 201, envelope({
        schema: "evopilot-project-harness-profile-upgrade-result/v1",
        status: "DRAFT",
        profile: saved,
        summary: store.projectHarnessProfileSummary(project.id, profileId)
      }));
    }
  }
  const projectHarnessProfileMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/harness-profiles\/([^/]+)$/);
  if (request.method === "GET" && projectHarnessProfileMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectHarnessProfileMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const profileId = safeFileName(decodeURIComponent(projectHarnessProfileMatch[2]));
    const versions = store.listProjectHarnessProfileVersions(project.id, profileId);
    if (versions.length === 0) return writeJson(response, 404, { error: "PROJECT_HARNESS_PROFILE_NOT_FOUND" });
    return writeJson(response, 200, envelope({
      schema: "evopilot-project-harness-profile-inspect/v1",
      summary: store.projectHarnessProfileSummary(project.id, profileId),
	          active: versions.find((version: any) => version.status === "ACTIVE"),
      latest: versions[versions.length - 1]
    }));
  }


  return false;
}
