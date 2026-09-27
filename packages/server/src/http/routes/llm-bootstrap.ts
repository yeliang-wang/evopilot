import type http from "node:http";
import { createWorkspaceLlmDefaultBinding, llmProfileDigest, LlmReadinessError, reconcileRuntimeReadiness } from "../../domains/llm-readiness/index.js";

// Explicit administration only: no environment discovery, Host configuration or fallback.
export async function handleLlmBootstrap(context: {
  request: http.IncomingMessage; response: http.ServerResponse; auth: any; store: any;
  options: { maxBodyBytes?: number }; deps: Record<string, any>;
}): Promise<boolean> {
  const { request, response, auth, store, options, deps } = context;
  const { audit, canAccessWorkspace, checkLlmProfileReadiness, encryptSecretValue, envelope, hasRole, normalizeLlmProfileBody, readJson, writeJson } = deps;
  if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
  const workspace = store.readWorkspace(auth.workspaceId);
  if (!workspace || workspace.tenantId !== auth.tenantId || !canAccessWorkspace(auth, workspace, "admin")) {
    return writeJson(response, 403, { error: "WORKSPACE_FORBIDDEN" });
  }
  const body = await readJson(request, options.maxBodyBytes);
  if (!body || body.optIn !== true) return writeJson(response, 400, { error: "LLM_BOOTSTRAP_OPT_IN_REQUIRED" });
  if (body.source !== "explicit-headless" && body.source !== "explicit-v61") return writeJson(response, 400, { error: "LLM_BOOTSTRAP_SOURCE_REQUIRED" });
  if (!Array.isArray(body.candidates) || body.candidates.length !== 1) {
    return writeJson(response, 409, { error: "LLM_BOOTSTRAP_AMBIGUOUS", candidateCount: Array.isArray(body.candidates) ? body.candidates.length : 0 });
  }
  const candidate = body.candidates[0];
  const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
  const validId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
  if (!candidate || !validId(body.profileId) || !validId(body.secretId) || !nonempty(body.reason)
      || ![candidate.providerName, candidate.baseUrl, candidate.modelName, candidate.value].every(nonempty)) {
    return writeJson(response, 400, { error: "LLM_BOOTSTRAP_INPUT_REQUIRED" });
  }
  try {
    const endpoint = new URL(candidate.baseUrl);
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error();
  } catch {
    return writeJson(response, 400, { error: "LLM_BOOTSTRAP_ENDPOINT_INVALID" });
  }
  // Do not overwrite an existing resource, including a globally colliding out-of-scope id.
  if (store.readSecret(body.secretId) || store.readLlmProfile(body.profileId)
      || store.readWorkspaceLlmDefaultBinding(auth.tenantId, auth.workspaceId)) {
    return writeJson(response, 409, { error: "LLM_BOOTSTRAP_ALREADY_CONFIGURED", nextAction: "inspect-and-repair-governed-resources" });
  }
  const draft = normalizeLlmProfileBody({
    id: body.profileId, name: body.profileId, scope: "workspace", providerPreset: "custom",
    provider: "openai-compatible", providerName: candidate.providerName.trim(), baseUrl: candidate.baseUrl.trim(),
    modelName: candidate.modelName.trim(), apiKeyRef: body.secretId, timeoutSeconds: 30, thinkingType: "disabled"
  }, auth);
  const now = new Date().toISOString();
  const encryption = encryptSecretValue(candidate.value.trim());
  // Clear the parsed transient input before the first asynchronous provider operation.
  delete candidate.value;
  const secret = store.writeSecret({ schema: "evopilot-secret/v1", id: body.secretId,
    tenantId: auth.tenantId, workspaceId: auth.workspaceId, scope: "workspace", name: body.secretId,
    kind: "llm-api-key", status: "ACTIVE", version: 1, encryption, createdAt: now, updatedAt: now });
  const profile = store.writeLlmProfile(draft);
  const profileDigest = llmProfileDigest(profile);
  const resources = { profileId: profile.id, profileDigest, secretRef: secret.id, source: body.source };
  store.appendAudit(audit(auth, "runtime-readiness.bootstrap-started", profile.id, resources));
  // Failed/uncertain attempts retain governed resources for explicit repair; never replay mutations.
  let preflight;
  try {
    preflight = await checkLlmProfileReadiness(store, profile, { tenantId: auth.tenantId, workspaceId: auth.workspaceId });
  } catch {
    store.appendAudit(audit(auth, "runtime-readiness.bootstrap-interrupted", profile.id, resources));
    return writeJson(response, 409, envelope({ ...resources, status: "BLOCKED", nextAction: "inspect-and-repair-governed-resources" }));
  }
  const current = store.readLlmProfile(profile.id), currentSecret = store.readSecret(secret.id);
  if (!current || llmProfileDigest(current) !== profileDigest || current.lastPreflight
      || JSON.stringify(currentSecret) !== JSON.stringify(secret)) {
    store.appendAudit(audit(auth, "runtime-readiness.bootstrap-conflict", profile.id, resources));
    return writeJson(response, 409, { error: "LLM_BOOTSTRAP_RESOURCE_DRIFT", ...resources, nextAction: "inspect-and-repair-governed-resources" });
  }
  store.writeLlmProfile({ ...current, lastPreflight: preflight, updatedAt: new Date().toISOString() });
  store.appendAudit(audit(auth, "llm-profile.preflight", profile.id, { ...resources, readiness: preflight.status }));
  if (preflight.status !== "READY") {
    const readiness = reconcileRuntimeReadiness({ store, tenantId: auth.tenantId, workspaceId: auth.workspaceId, actor: auth.actor });
    return writeJson(response, 409, envelope({ ...resources, status: "BLOCKED", preflight, readiness, nextAction: "inspect-and-repair-governed-resources" }));
  }
  try {
    const binding = createWorkspaceLlmDefaultBinding({ store, tenantId: auth.tenantId, workspaceId: auth.workspaceId,
      profileId: profile.id, expectedProfileDigest: profileDigest, expectedBindingDigest: "", actor: auth.actor, reason: body.reason });
    const readiness = reconcileRuntimeReadiness({ store, tenantId: auth.tenantId, workspaceId: auth.workspaceId, actor: auth.actor });
    store.appendAudit(audit(auth, "runtime-readiness.bootstrap-completed", profile.id, { ...resources, bindingDigest: binding.digest }));
    return writeJson(response, 201, envelope({ ...resources, status: "COMPLETED", binding, readiness }));
  } catch (error) {
    if (error instanceof LlmReadinessError) return writeJson(response, 409, { error: error.code, ...resources, nextAction: "inspect-and-repair-governed-resources" });
    throw error;
  }
}
