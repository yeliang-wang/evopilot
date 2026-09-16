import http from "node:http";
import {
  LlmReadinessError,
  createWorkspaceLlmDefaultBinding,
  llmProfileDigest,
  llmSetupProtocol,
  reconcileRuntimeReadiness
} from "../../domains/llm-readiness/index.js";

interface LlmReadinessRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  deps: Record<string, any>;
}

export async function handleLlmReadinessRoutes(context: LlmReadinessRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options } = context;
  const { audit, envelope, hasRole, readJson, writeJson } = context.deps;

  if (request.method === "GET" && url.pathname === "/api/v1/llm-providers") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope({
      schema: "evopilot-llm-provider-discovery/v1",
      selectionRequired: true,
      defaultProvider: null,
      defaultProfileId: null,
      providers: [
        { id: "openai-compatible", kind: "protocol", userSelectionRequired: true, requiredFields: ["providerName", "baseUrl", "modelName", "secretRef"] },
        { id: "custom", kind: "endpoint", userSelectionRequired: true, requiredFields: ["providerName", "baseUrl", "modelName", "secretRef"] }
      ]
    }));
  }

  if (request.method === "GET" && url.pathname === "/api/v1/runtime-readiness/setup-protocol") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(llmSetupProtocol()));
  }

  if (request.method === "GET" && url.pathname === "/api/v1/runtime-readiness") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(reconcileRuntimeReadiness({
      store,
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      actor: auth.actor
    })));
  }

  if (request.method === "GET" && url.pathname === "/api/v1/runtime-readiness/workspace-default") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const binding = store.readWorkspaceLlmDefaultBinding(auth.tenantId, auth.workspaceId);
    if (!binding) return writeJson(response, 404, { error: "WORKSPACE_LLM_DEFAULT_NOT_FOUND" });
    return writeJson(response, 200, envelope(binding));
  }

  if (request.method === "POST" && url.pathname === "/api/v1/runtime-readiness/workspace-default") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
    const profileId = String(body.profileId ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    if (!profileId || !reason) return writeJson(response, 400, { error: "WORKSPACE_LLM_BINDING_INPUT_REQUIRED", detail: "profileId and reason are required." });
    try {
      const binding = createWorkspaceLlmDefaultBinding({
        store,
        tenantId: auth.tenantId,
        workspaceId: auth.workspaceId,
        profileId,
        expectedProfileDigest: optionalString(body.expectedProfileDigest),
        expectedBindingDigest: body.expectedBindingDigest === null ? "" : optionalString(body.expectedBindingDigest),
        actor: auth.actor,
        reason
      });
      const readiness = reconcileRuntimeReadiness({ store, tenantId: auth.tenantId, workspaceId: auth.workspaceId, actor: auth.actor, reason: "Explicit live-preflight workspace LLM default bound." });
      store.appendAudit(audit(auth, "workspace-llm-default.bound", `${auth.tenantId}/${auth.workspaceId}`, {
        profileId: binding.profileId,
        profileDigest: binding.profileDigest,
        bindingDigest: binding.digest,
        provider: binding.provider,
        model: binding.model,
        secretRef: binding.secretRef,
        readiness: readiness.state
      }));
      return writeJson(response, 200, envelope({ binding, readiness }));
    } catch (error) {
      if (error instanceof LlmReadinessError) return writeJson(response, 409, { error: error.code, detail: error.message });
      throw error;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/v1/runtime-readiness/repair") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const readiness = reconcileRuntimeReadiness({ store, tenantId: auth.tenantId, workspaceId: auth.workspaceId, actor: auth.actor, reason: undefined });
    store.appendAudit(audit(auth, "runtime-readiness.reconciled", `${auth.tenantId}/${auth.workspaceId}`, {
      state: readiness.state,
      bindingDigest: readiness.bindingDigest,
      profileId: readiness.profileId,
      nextAction: readiness.nextAction
    }));
    return writeJson(response, readiness.state === "READY" ? 200 : 409, envelope(readiness));
  }

  if (request.method === "POST" && url.pathname === "/api/v1/runtime-readiness/migrate-v61") {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes) as Record<string, unknown>;
    const candidates = store.listLlmProfiles(auth.tenantId, auth.workspaceId).filter((profile: any) => profile.scope === "workspace" && profile.status === "ACTIVE");
    const requested = optionalString(body.profileId);
    if (!requested && candidates.length !== 1) return writeJson(response, 409, { error: "V61_LLM_MIGRATION_AMBIGUOUS", candidates: candidates.map((profile: any) => ({ id: profile.id, digest: llmProfileDigest(profile) })) });
    const profile = requested ? store.readLlmProfile(requested) : candidates[0];
    if (!profile) return writeJson(response, 404, { error: "LLM_PROFILE_NOT_FOUND" });
    try {
      const binding = createWorkspaceLlmDefaultBinding({
        store,
        tenantId: auth.tenantId,
        workspaceId: auth.workspaceId,
        profileId: profile.id,
        expectedProfileDigest: llmProfileDigest(profile),
        actor: auth.actor,
        reason: String(body.reason ?? "explicit-v6.1-to-v6.2-migration")
      });
      const readiness = reconcileRuntimeReadiness({ store, tenantId: auth.tenantId, workspaceId: auth.workspaceId, actor: auth.actor, reason: "Explicit v6.1 governed LLM migration completed." });
      store.appendAudit(audit(auth, "runtime-readiness.v61-migrated", `${auth.tenantId}/${auth.workspaceId}`, { bindingDigest: binding.digest, profileId: profile.id }));
      return writeJson(response, 200, envelope({ migration: "COMPLETED", binding, readiness }));
    } catch (error) {
      if (error instanceof LlmReadinessError) return writeJson(response, 409, { error: error.code, detail: error.message });
      throw error;
    }
  }

  return false;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result || undefined;
}
