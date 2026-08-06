import http from "node:http";
import type { GitHubAppInstallationRecord, WorkspaceRecord } from "../../model.js";

interface AdminRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  profile: { id: string };
  runtime: any;
  deps: Record<string, any>;
}

export async function handleAdminRoutes(context: AdminRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options, profile, runtime } = context;
  const {
    audit,
    buildProjectOnboardingChecklist,
    canAccessScopedResource,
    canAccessWorkspace,
    checkLlmProfileReadiness,
    encryptSecretValue,
    envelope,
    canMutateLlmProfile,
    canReadLlmProfile,
    githubAppInstallationChecks,
    hasRole,
    hashPassword,
    isRecord,
    logInfo,
    maskGitHubAppInstallation,
    maskLlmProfile,
    maskSecret,
    maskUser,
    normalizeAuthRole,
    normalizeLlmProfileBody,
    normalizeSecretKind,
    normalizeTenantStatus,
    normalizeUserStatus,
    normalizeWorkspaceMemberRole,
    normalizeWorkspaceMemberStatus,
    normalizeWorkspaceQuotas,
    normalizeWorkspaceStatus,
    optionalTrimmedString,
    readJson,
    requireBodyString,
    resolveWorkspace,
    safeFileName,
    workspaceUsage,
    writeJson
  } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/tenants") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const tenants = auth.platformAdmin ? store.listTenants() : store.listTenants().filter((tenant: any) => tenant.id === auth.tenantId);
    return writeJson(response, 200, envelope(tenants));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/tenants") {
    if (!auth.platformAdmin) return writeJson(response, 403, { error: "PLATFORM_ADMIN_REQUIRED" });
    const body = await readJson(request, options.maxBodyBytes);
    const now = new Date().toISOString();
    const tenantId = safeFileName(optionalTrimmedString(body.id) ?? optionalTrimmedString(body.name) ?? `tenant-${Date.now()}`);
    const tenant = store.writeTenant({
      schema: "evopilot-tenant/v1",
      id: tenantId,
      name: optionalTrimmedString(body.name) ?? tenantId,
      status: normalizeTenantStatus(body.status),
      plan: optionalTrimmedString(body.plan) ?? "SaaS",
      createdAt: store.readTenant(tenantId)?.createdAt ?? now,
      updatedAt: now
    });
    store.appendAudit(audit(auth, "tenant.upserted", tenant.id, { status: tenant.status, plan: tenant.plan }));
    return writeJson(response, 201, envelope(tenant));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/users") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const tenantId = auth.platformAdmin ? optionalTrimmedString(url.searchParams.get("tenantId")) : auth.tenantId;
    return writeJson(response, 200, envelope(store.listUsers(tenantId, true).map(maskUser)));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/users") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
    const username = optionalTrimmedString(body.username);
    const password = body.password === undefined || body.password === null ? "change-me" : String(body.password);
    if (!username) return writeJson(response, 400, { error: "USERNAME_REQUIRED" });
    if (store.readUser(username)) return writeJson(response, 409, { error: "USER_ALREADY_EXISTS" });
    const tenantId = safeFileName(optionalTrimmedString(body.tenantId) ?? auth.tenantId);
    if (!auth.platformAdmin && tenantId !== auth.tenantId) return writeJson(response, 403, { error: "TENANT_FORBIDDEN" });
    const workspaceId = safeFileName(optionalTrimmedString(body.workspaceId) ?? auth.workspaceId);
    const workspace = store.readWorkspace(workspaceId);
    if (workspace && workspace.tenantId !== tenantId) return writeJson(response, 409, { error: "USER_WORKSPACE_TENANT_MISMATCH" });
    const platformAdmin = Boolean(auth.platformAdmin && Boolean(body.platformAdmin));
    if (!auth.platformAdmin && platformAdmin) return writeJson(response, 403, { error: "PLATFORM_ADMIN_REQUIRED" });
    const now = new Date().toISOString();
    const user = store.writeUser({
      schema: "evopilot-user/v1",
      id: safeFileName(username),
      username,
      displayName: optionalTrimmedString(body.displayName) ?? username,
      role: normalizeAuthRole(body.role, "viewer"),
      tenantId,
      workspaceId,
      status: normalizeUserStatus(body.status),
      platformAdmin,
      mustChangePassword: body.mustChangePassword === undefined ? true : Boolean(body.mustChangePassword),
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now
    });
    store.appendAudit(audit(auth, "user.created", user.id, { tenantId: user.tenantId, workspaceId: user.workspaceId, role: user.role, platformAdmin: user.platformAdmin }));
    return writeJson(response, 201, envelope(maskUser(user)));
  }
  const userMatch = url.pathname.match(/^\/api\/v1\/users\/([^/]+)$/);
  if (request.method === "PATCH" && userMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const user = store.readUser(decodeURIComponent(userMatch[1]));
    if (!user) return writeJson(response, 404, { error: "USER_NOT_FOUND" });
    if (!auth.platformAdmin && user.tenantId !== auth.tenantId) return writeJson(response, 403, { error: "TENANT_FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
    const nextTenantId = safeFileName(optionalTrimmedString(body.tenantId) ?? user.tenantId);
    if (!auth.platformAdmin && nextTenantId !== auth.tenantId) return writeJson(response, 403, { error: "TENANT_FORBIDDEN" });
    const nextPlatformAdmin = body.platformAdmin === undefined ? user.platformAdmin : Boolean(body.platformAdmin);
    if (!auth.platformAdmin && nextPlatformAdmin !== user.platformAdmin) return writeJson(response, 403, { error: "PLATFORM_ADMIN_REQUIRED" });
    const updated = store.writeUser({
      ...user,
      displayName: optionalTrimmedString(body.displayName) ?? user.displayName,
      role: body.role === undefined ? user.role : normalizeAuthRole(body.role, user.role),
      tenantId: nextTenantId,
      workspaceId: safeFileName(optionalTrimmedString(body.workspaceId) ?? user.workspaceId),
      status: body.status === undefined ? user.status : normalizeUserStatus(body.status),
      platformAdmin: nextPlatformAdmin,
      mustChangePassword: body.mustChangePassword === undefined ? user.mustChangePassword : Boolean(body.mustChangePassword),
      updatedAt: new Date().toISOString()
    });
    store.appendAudit(audit(auth, "user.updated", updated.id, { tenantId: updated.tenantId, workspaceId: updated.workspaceId, role: updated.role, status: updated.status, platformAdmin: updated.platformAdmin }));
    return writeJson(response, 200, envelope(maskUser(updated)));
  }
  const resetPasswordMatch = url.pathname.match(/^\/api\/v1\/users\/([^/]+)\/reset-password$/);
  if (request.method === "POST" && resetPasswordMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const user = store.readUser(decodeURIComponent(resetPasswordMatch[1]));
    if (!user) return writeJson(response, 404, { error: "USER_NOT_FOUND" });
    if (!auth.platformAdmin && user.tenantId !== auth.tenantId) return writeJson(response, 403, { error: "TENANT_FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
    const nextPassword = body.password === undefined || body.password === null ? "change-me" : String(body.password);
    if (nextPassword.trim().length < 4) return writeJson(response, 400, { error: "PASSWORD_TOO_SHORT" });
    const updated = store.writeUser({ ...user, passwordHash: hashPassword(nextPassword), mustChangePassword: true, updatedAt: new Date().toISOString() });
    store.appendAudit(audit(auth, "user.password.reset", updated.id, { tenantId: updated.tenantId, workspaceId: updated.workspaceId }));
    return writeJson(response, 200, envelope(maskUser(updated)));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/workspaces") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const tenantId = auth.platformAdmin ? optionalTrimmedString(url.searchParams.get("tenantId")) : auth.tenantId;
    return writeJson(response, 200, envelope(store.listWorkspaces(tenantId)));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/secrets") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listSecrets(auth.tenantId, auth.workspaceId)
      .filter((secret: any) => secret.scope !== "user" || secret.ownerActor === auth.actor || auth.platformAdmin || auth.role === "admin")
      .map(maskSecret)));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/secrets") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const tenantId = safeFileName(optionalTrimmedString(body.tenantId) ?? auth.tenantId);
    const workspaceId = safeFileName(optionalTrimmedString(body.workspaceId) ?? auth.workspaceId);
    const workspace = store.readWorkspace(workspaceId);
    if (!workspace) return writeJson(response, 404, { error: "WORKSPACE_NOT_FOUND" });
    if (workspace.tenantId !== tenantId) return writeJson(response, 409, { error: "SECRET_WORKSPACE_TENANT_MISMATCH" });
    const secretScope = String(body.scope ?? "").trim().toLowerCase() === "user" ? "user" : "workspace";
    const kind = normalizeSecretKind(body.kind);
    const userLlmSecret = secretScope === "user" && (kind === "llm-key" || kind === "llm-api-key") && tenantId === auth.tenantId && workspaceId === auth.workspaceId;
    if (userLlmSecret && !canAccessWorkspace(auth, workspace, "developer")) return writeJson(response, 403, { error: "WORKSPACE_FORBIDDEN" });
    if (!userLlmSecret && !canAccessWorkspace(auth, workspace, "admin")) return writeJson(response, 403, { error: "WORKSPACE_FORBIDDEN" });
    const value = optionalTrimmedString(body.value);
    if (!value) return writeJson(response, 400, { error: "SECRET_VALUE_REQUIRED" });
    const now = new Date().toISOString();
    const id = safeFileName(optionalTrimmedString(body.id) ?? optionalTrimmedString(body.name) ?? `secret-${Date.now()}`);
    const existing = store.readSecret(id);
    const secret = store.writeSecret({
      schema: "evopilot-secret/v1",
      id,
      tenantId,
      workspaceId,
      scope: secretScope,
      ownerActor: secretScope === "user" ? auth.actor : optionalTrimmedString(body.ownerActor),
      name: optionalTrimmedString(body.name) ?? id,
      kind,
      status: "ACTIVE",
      version: existing ? existing.version + 1 : 1,
      encryption: encryptSecretValue(value),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      rotatedAt: existing ? now : undefined
    });
    store.appendAudit(audit(auth, existing ? "secret.rotated" : "secret.created", secret.id, { kind: secret.kind, version: secret.version }));
    return writeJson(response, existing ? 200 : 201, envelope(maskSecret(secret)));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/llm-profiles") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listLlmProfiles(auth.tenantId, auth.workspaceId).filter((item: any) => canReadLlmProfile(auth, item)).map(maskLlmProfile)));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/llm-profiles") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const existingId = optionalTrimmedString(body.id) ?? optionalTrimmedString(body.profileId) ?? optionalTrimmedString(body.name);
    const existing = existingId ? store.readLlmProfile(existingId) : undefined;
    const profile = normalizeLlmProfileBody(body, auth, existing);
    const workspace = store.readWorkspace(profile.workspaceId);
    if (!workspace) return writeJson(response, 404, { error: "WORKSPACE_NOT_FOUND" });
    if (workspace.tenantId !== profile.tenantId) return writeJson(response, 409, { error: "LLM_PROFILE_WORKSPACE_TENANT_MISMATCH" });
    if (!canMutateLlmProfile(auth, profile)) return writeJson(response, 403, { error: "LLM_PROFILE_FORBIDDEN" });
    if (profile.scope === "user" && profile.ownerActor !== auth.actor && !auth.platformAdmin && auth.role !== "admin") return writeJson(response, 403, { error: "LLM_PROFILE_OWNER_REQUIRED" });
    if (profile.scope === "user" && !canAccessWorkspace(auth, workspace, "developer")) return writeJson(response, 403, { error: "WORKSPACE_FORBIDDEN" });
    if (profile.scope === "workspace" && !canAccessWorkspace(auth, workspace, "admin")) return writeJson(response, 403, { error: "WORKSPACE_FORBIDDEN" });
    if (profile.scope === "user") {
      const secret = store.readSecret(profile.apiKeyRef);
      if (!secret || secret.scope !== "user" || secret.ownerActor !== profile.ownerActor) return writeJson(response, 403, { error: "LLM_PROFILE_SECRET_FORBIDDEN", detail: "User LLM profiles must reference a user-owned LLM secret." });
    }
    if (!profile.baseUrl || !profile.modelName || !profile.apiKeyRef) return writeJson(response, 400, { error: "LLM_PROFILE_REQUIRED", detail: "baseUrl, model/modelName, and apiKeyRef are required." });
    const written = store.writeLlmProfile(profile);
    store.appendAudit(audit(auth, existing ? "llm-profile.updated" : "llm-profile.created", written.id, {
      provider: written.providerName,
      model: written.modelName,
      apiKeyRef: written.apiKeyRef,
      scope: written.scope,
      ownerActor: written.ownerActor,
      tenantId: written.tenantId,
      workspaceId: written.workspaceId
    }));
    return writeJson(response, existing ? 200 : 201, envelope(maskLlmProfile(written)));
  }
  const llmProfileMatch = url.pathname.match(/^\/api\/v1\/llm-profiles\/([^/]+)$/);
  if (request.method === "GET" && llmProfileMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const profileRecord = store.readLlmProfile(decodeURIComponent(llmProfileMatch[1]));
    if (!profileRecord) return writeJson(response, 404, { error: "LLM_PROFILE_NOT_FOUND" });
    if (!canReadLlmProfile(auth, profileRecord)) return writeJson(response, 403, { error: "LLM_PROFILE_FORBIDDEN" });
    return writeJson(response, 200, envelope(maskLlmProfile(profileRecord)));
  }
  const llmProfilePreflightMatch = url.pathname.match(/^\/api\/v1\/llm-profiles\/([^/]+)\/preflight$/);
  if ((request.method === "GET" || request.method === "POST") && llmProfilePreflightMatch) {
    if (!hasRole(auth, request.method === "POST" ? "operator" : "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const profileRecord = store.readLlmProfile(decodeURIComponent(llmProfilePreflightMatch[1]));
    if (!profileRecord) return writeJson(response, 404, { error: "LLM_PROFILE_NOT_FOUND" });
    if (!canReadLlmProfile(auth, profileRecord)) return writeJson(response, 403, { error: "LLM_PROFILE_FORBIDDEN" });
    const readiness = await checkLlmProfileReadiness(store, profileRecord, { tenantId: profileRecord.tenantId, workspaceId: profileRecord.workspaceId });
    const updated = store.writeLlmProfile({ ...profileRecord, lastPreflight: readiness, updatedAt: new Date().toISOString() });
    if (request.method === "POST") {
      store.appendAudit(audit(auth, "llm-profile.preflight", updated.id, {
        provider: updated.providerName,
        model: updated.modelName,
        readiness: readiness.status,
        blockers: readiness.blockers
      }));
      logInfo("llm-profile.preflight", {
        actor: auth.actor,
        target: updated.id,
        metadata: {
          tenantId: updated.tenantId,
          workspaceId: updated.workspaceId,
          provider: updated.providerName,
          model: updated.modelName,
          readiness: readiness.status,
          blockers: readiness.blockers
        }
      });
    }
    return writeJson(response, readiness.status === "READY" ? 200 : 409, envelope(readiness));
  }
  const secretRevokeMatch = url.pathname.match(/^\/api\/v1\/secrets\/([^/]+)\/revoke$/);
  if (request.method === "POST" && secretRevokeMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const secret = store.readSecret(decodeURIComponent(secretRevokeMatch[1]));
    if (!secret) return writeJson(response, 404, { error: "SECRET_NOT_FOUND" });
    const workspace = store.readWorkspace(secret.workspaceId);
    if (!workspace || !canAccessWorkspace(auth, workspace, "admin")) return writeJson(response, 403, { error: "WORKSPACE_FORBIDDEN" });
    const updated = store.writeSecret({ ...secret, status: "REVOKED", revokedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    store.appendAudit(audit(auth, "secret.revoked", updated.id, { kind: updated.kind, version: updated.version }));
    return writeJson(response, 200, envelope(maskSecret(updated)));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/github-app/installations") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listGitHubAppInstallations(auth.tenantId, auth.workspaceId).map(maskGitHubAppInstallation)));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/github-app/installations") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const tenantId = safeFileName(optionalTrimmedString(body.tenantId) ?? auth.tenantId);
    const workspaceId = safeFileName(optionalTrimmedString(body.workspaceId) ?? auth.workspaceId);
    const workspace = store.readWorkspace(workspaceId);
    if (!workspace) return writeJson(response, 404, { error: "WORKSPACE_NOT_FOUND" });
    if (!canAccessWorkspace(auth, workspace, "admin")) return writeJson(response, 403, { error: "WORKSPACE_FORBIDDEN" });
    if (workspace.tenantId !== tenantId) return writeJson(response, 409, { error: "GITHUB_APP_WORKSPACE_TENANT_MISMATCH" });
    const now = new Date().toISOString();
    const installationId = requireBodyString(body.installationId, "GITHUB_APP_INSTALLATION_ID_REQUIRED", runtime);
    const id = safeFileName(optionalTrimmedString(body.id) ?? `github-app-${installationId}`);
    const draft = {
      privateKeySecretRef: optionalTrimmedString(body.privateKeySecretRef),
      webhookSecretRef: optionalTrimmedString(body.webhookSecretRef),
      repositories: Array.isArray(body.repositories) ? body.repositories.map(String).filter(Boolean) : [],
      permissions: isRecord(body.permissions) ? Object.fromEntries(Object.entries(body.permissions).map(([key, value]) => [key, String(value)])) : {}
    };
    const checks = githubAppInstallationChecks(store, tenantId, workspaceId, draft);
    const installation = store.writeGitHubAppInstallation({
      schema: "evopilot-github-app-installation/v1",
      id,
      tenantId,
      workspaceId,
      installationId,
      account: requireBodyString(body.account, "GITHUB_APP_ACCOUNT_REQUIRED", runtime),
      repositories: draft.repositories,
      permissions: draft.permissions,
      privateKeySecretRef: draft.privateKeySecretRef,
      webhookSecretRef: draft.webhookSecretRef,
      status: checks.every((check: any) => check.status === "PASS") ? "READY" : "BLOCKED",
      checks,
      createdAt: store.readGitHubAppInstallation(id)?.createdAt ?? now,
      updatedAt: now
    });
    store.appendAudit(audit(auth, "github-app.installation.upserted", installation.id, {
      installationId: installation.installationId,
      status: installation.status,
      repositories: installation.repositories.length
    }));
    return writeJson(response, installation.status === "READY" ? 201 : 409, envelope(maskGitHubAppInstallation(installation)));
  }
  const githubAppInstallationPreflightMatch = url.pathname.match(/^\/api\/v1\/github-app\/installations\/([^/]+)\/preflight$/);
  if ((request.method === "GET" || request.method === "POST") && githubAppInstallationPreflightMatch) {
    if (!hasRole(auth, request.method === "POST" ? "operator" : "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const installation = store.readGitHubAppInstallation(decodeURIComponent(githubAppInstallationPreflightMatch[1]));
    if (!installation) return writeJson(response, 404, { error: "GITHUB_APP_INSTALLATION_NOT_FOUND" });
    if (!canAccessScopedResource(auth, installation.tenantId, installation.workspaceId)) return writeJson(response, 403, { error: "GITHUB_APP_INSTALLATION_FORBIDDEN" });
    const checks = githubAppInstallationChecks(store, installation.tenantId, installation.workspaceId, installation);
    const status = checks.every((check: any) => check.status === "PASS") ? "READY" : "BLOCKED";
    const updated: GitHubAppInstallationRecord = {
      ...installation,
      status,
      checks,
      updatedAt: new Date().toISOString()
    };
    if (request.method === "POST") {
      store.writeGitHubAppInstallation(updated);
      store.appendAudit(audit(auth, "github-app.installation-preflight", updated.id, {
        status,
        installationId: updated.installationId,
        repositories: updated.repositories.length
      }));
    }
    return writeJson(response, status === "READY" ? 200 : 409, envelope({
      ...maskGitHubAppInstallation(updated),
      checkedAt: updated.updatedAt,
      nextAction: status === "READY" ? "use-installation" : "repair-github-app-installation"
    }));
  }
  const githubAppInstallationMatch = url.pathname.match(/^\/api\/v1\/github-app\/installations\/([^/]+)$/);
  if (request.method === "GET" && githubAppInstallationMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const installation = store.readGitHubAppInstallation(decodeURIComponent(githubAppInstallationMatch[1]));
    if (!installation) return writeJson(response, 404, { error: "GITHUB_APP_INSTALLATION_NOT_FOUND" });
    if (!canAccessScopedResource(auth, installation.tenantId, installation.workspaceId)) return writeJson(response, 403, { error: "GITHUB_APP_INSTALLATION_FORBIDDEN" });
    return writeJson(response, 200, envelope(maskGitHubAppInstallation(installation)));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/onboarding/project/checklist") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const tenantId = safeFileName(optionalTrimmedString(body.tenantId) ?? auth.tenantId);
    const workspaceId = safeFileName(optionalTrimmedString(body.workspaceId) ?? auth.workspaceId);
    if (!canAccessScopedResource(auth, tenantId, workspaceId)) return writeJson(response, 403, { error: "ONBOARDING_WORKSPACE_FORBIDDEN" });
    const checklist = await buildProjectOnboardingChecklist({ store, auth, body, profileId: profile.id, mode: "plan" });
    return writeJson(response, checklist.status === "BLOCKED" ? 409 : 200, envelope(checklist));
  }
  const projectOnboardingChecklistMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/onboarding-checklist$/);
  if (request.method === "GET" && projectOnboardingChecklistMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const project = store.readProject(decodeURIComponent(projectOnboardingChecklistMatch[1]));
    if (!project) return writeJson(response, 404, { error: "PROJECT_NOT_FOUND" });
    if (!canAccessScopedResource(auth, project.tenantId, project.workspaceId)) return writeJson(response, 403, { error: "PROJECT_FORBIDDEN" });
    const body = Object.fromEntries(url.searchParams.entries());
    const checklist = await buildProjectOnboardingChecklist({ store, auth, body, profileId: profile.id, mode: "inspect", project });
    return writeJson(response, checklist.status === "BLOCKED" ? 409 : 200, envelope(checklist));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/workspaces") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const now = new Date().toISOString();
    const workspaceId = safeFileName(optionalTrimmedString(body.id) ?? optionalTrimmedString(body.workspaceId) ?? `workspace-${Date.now()}`);
    const tenantId = safeFileName(optionalTrimmedString(body.tenantId) ?? auth.tenantId);
    if (!auth.platformAdmin && tenantId !== auth.tenantId) return writeJson(response, 403, { error: "TENANT_FORBIDDEN" });
    const workspace: WorkspaceRecord = {
      schema: "evopilot-workspace/v1",
      id: workspaceId,
      tenantId,
      name: optionalTrimmedString(body.name) ?? workspaceId,
      status: normalizeWorkspaceStatus(body.status),
      members: [
        {
          id: safeFileName(auth.actor),
          name: auth.actor,
          role: "owner",
          status: "ACTIVE"
        }
      ],
      quotas: normalizeWorkspaceQuotas(body.quotas),
      createdAt: now,
      updatedAt: now
    };
    store.ensureTenant(workspace.tenantId, optionalTrimmedString(body.tenantName) ?? workspace.tenantId);
    store.writeWorkspace(workspace);
    store.appendAudit(audit(auth, "workspace.created", workspace.id, { tenantId: workspace.tenantId, memberCount: workspace.members.length }));
    return writeJson(response, 201, envelope(workspace));
  }
  const workspaceMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)$/);
  if (request.method === "GET" && workspaceMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const workspace = resolveWorkspace(store, decodeURIComponent(workspaceMatch[1]), auth);
    if (!workspace) return writeJson(response, 404, { error: "WORKSPACE_NOT_FOUND" });
    if (!canAccessWorkspace(auth, workspace, "viewer")) return writeJson(response, 403, { error: "WORKSPACE_FORBIDDEN" });
    return writeJson(response, 200, envelope(workspace));
  }
  const workspaceInviteMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/invitations$/);
  if (request.method === "POST" && workspaceInviteMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const workspace = store.readWorkspace(decodeURIComponent(workspaceInviteMatch[1]));
    if (!workspace) return writeJson(response, 404, { error: "WORKSPACE_NOT_FOUND" });
    if (!canAccessWorkspace(auth, workspace, "admin")) return writeJson(response, 403, { error: "WORKSPACE_FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const role = normalizeWorkspaceMemberRole(body.role, "viewer");
    const memberId = safeFileName(optionalTrimmedString(body.id) ?? optionalTrimmedString(body.email) ?? optionalTrimmedString(body.name) ?? `invite-${Date.now()}`);
    const member = {
      id: memberId,
      name: optionalTrimmedString(body.name) ?? optionalTrimmedString(body.email) ?? memberId,
      role,
      status: "INVITED" as const
    };
    const updated = store.writeWorkspace({
      ...workspace,
      members: [...workspace.members.filter((item: any) => item.id !== memberId), member],
      updatedAt: new Date().toISOString()
    });
    store.appendAudit(audit(auth, "workspace.invitation.created", updated.id, { memberId, role }));
    return writeJson(response, 201, envelope({ workspace: updated, invitation: member }));
  }
  const workspaceMemberMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/members\/([^/]+)$/);
  if (request.method === "PATCH" && workspaceMemberMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const workspace = store.readWorkspace(decodeURIComponent(workspaceMemberMatch[1]));
    if (!workspace) return writeJson(response, 404, { error: "WORKSPACE_NOT_FOUND" });
    if (!canAccessWorkspace(auth, workspace, "admin")) return writeJson(response, 403, { error: "WORKSPACE_FORBIDDEN" });
    const memberId = safeFileName(decodeURIComponent(workspaceMemberMatch[2]));
    const body = await readJson(request, options.maxBodyBytes);
    const member = workspace.members.find((item: any) => item.id === memberId);
    if (!member) return writeJson(response, 404, { error: "WORKSPACE_MEMBER_NOT_FOUND" });
    const nextRole = body.role === undefined ? member.role : normalizeWorkspaceMemberRole(body.role, member.role);
    const nextStatus = body.status === undefined ? member.status : normalizeWorkspaceMemberStatus(body.status, member.status);
    const nextMembers = workspace.members.map((item: any) => item.id === memberId ? { ...item, role: nextRole, status: nextStatus } : item);
    if (!nextMembers.some((item: any) => item.role === "owner" && item.status === "ACTIVE")) {
      return writeJson(response, 409, { error: "WORKSPACE_REQUIRES_ACTIVE_OWNER" });
    }
    const updated = store.writeWorkspace({
      ...workspace,
      members: nextMembers,
      updatedAt: new Date().toISOString()
    });
    store.appendAudit(audit(auth, "workspace.member.updated", updated.id, { memberId, role: nextRole, status: nextStatus }));
    return writeJson(response, 200, envelope(updated));
  }
  const workspaceUsageMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/usage$/);
  if (request.method === "GET" && workspaceUsageMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const workspace = resolveWorkspace(store, decodeURIComponent(workspaceUsageMatch[1]), auth);
    if (!workspace) return writeJson(response, 404, { error: "WORKSPACE_NOT_FOUND" });
    if (!canAccessWorkspace(auth, workspace, "viewer")) return writeJson(response, 403, { error: "WORKSPACE_FORBIDDEN" });
    return writeJson(response, 200, envelope(workspaceUsage(store, workspace)));
  }


  return false;
}
