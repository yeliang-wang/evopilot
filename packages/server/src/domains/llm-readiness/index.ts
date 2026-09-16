import { createHash } from "node:crypto";
import {
  EVOPILOT_LLM_SETUP_PROTOCOL_SCHEMA,
  EVOPILOT_RUNTIME_READINESS_SCHEMA,
  EVOPILOT_WORKSPACE_LLM_DEFAULT_BINDING_SCHEMA,
  type EvoPilotLlmSetupProtocolV1,
  type EvoPilotRuntimeReadinessState
} from "@evopilot/contracts";
import type {
  LlmProfileRecord,
  RuntimeReadinessRecord,
  SecretRecord,
  WorkspaceLlmDefaultBinding
} from "../../model.js";

export const LLM_READINESS_FRESHNESS_MS = 15 * 60 * 1000;

export const LLM_SETUP_ONLY_PATHS = [
  "/api/v1/health",
  "/api/v1/readiness",
  "/api/v1/auth/",
  "/api/v1/runtime-readiness",
  "/api/v1/llm-providers",
  "/api/v1/llm-profiles",
  "/api/v1/secrets",
  "/api/v1/interactions/render",
  "/api/v1/settings/logging",
  "/api/v1/diagnostics"
] as const;

export const LLM_SETUP_ONLY_TOOLS = [
  "evopilot_runtime_readiness_inspect",
  "evopilot_llm_provider_discover",
  "evopilot_llm_profile_list",
  "evopilot_llm_profile_inspect",
  "evopilot_llm_profile_upsert",
  "evopilot_llm_profile_preflight",
  "evopilot_workspace_llm_default_bind",
  "evopilot_runtime_readiness_repair"
] as const;

export const FORBIDDEN_LLM_FALLBACKS = [
  "process environment",
  "Agent Host LLM",
  "Agent Model",
  "Codex configuration",
  "Claude Code configuration",
  "WorkBuddy configuration",
  "CodeBuddy models.json",
  "MyGlm5",
  "hard-coded provider preset"
] as const;

export interface RuntimeReadinessStore {
  listLlmProfiles(tenantId?: string, workspaceId?: string): LlmProfileRecord[];
  readLlmProfile(id: string): LlmProfileRecord | undefined;
  readSecret(id: string): SecretRecord | undefined;
  readRuntimeReadiness(tenantId: string, workspaceId: string): RuntimeReadinessRecord | undefined;
  writeRuntimeReadiness(record: RuntimeReadinessRecord, expectedDigest?: string): RuntimeReadinessRecord;
  readWorkspaceLlmDefaultBinding(tenantId: string, workspaceId: string): WorkspaceLlmDefaultBinding | undefined;
  writeWorkspaceLlmDefaultBinding(binding: WorkspaceLlmDefaultBinding, expectedDigest?: string): WorkspaceLlmDefaultBinding;
}

export class LlmReadinessError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
  }
}

export function llmSetupProtocol(): EvoPilotLlmSetupProtocolV1 {
  return {
    schema: EVOPILOT_LLM_SETUP_PROTOCOL_SCHEMA,
    runtimeVersion: "6.2.0",
    expertProtocolRange: ">=2.2 <3",
    states: ["SETUP_REQUIRED", "PREFLIGHT_REQUIRED", "READY", "LLM_BLOCKED"],
    setupOnlyTools: [...LLM_SETUP_ONLY_TOOLS],
    forbiddenFallbacks: [...FORBIDDEN_LLM_FALLBACKS],
    secureInput: {
      rawSecretAcceptedByExpert: false,
      persistedForm: "SecretRef only",
      hostCapability: "host-native-secure-secret-input"
    }
  };
}

export function llmProfileDigest(profile: LlmProfileRecord): string {
  return digest({
    schema: profile.schema,
    id: profile.id,
    tenantId: profile.tenantId,
    workspaceId: profile.workspaceId,
    scope: profile.scope,
    ownerActor: profile.ownerActor,
    name: profile.name,
    providerPreset: profile.providerPreset,
    provider: profile.provider,
    providerName: profile.providerName,
    baseUrl: profile.baseUrl,
    modelName: profile.modelName,
    secretRef: profile.apiKeyRef,
    status: profile.status,
    timeoutSeconds: profile.timeoutSeconds,
    maxRetries: profile.maxRetries,
    defaultMaxOutputTokens: profile.defaultMaxOutputTokens,
    maxOutputTokens: profile.maxOutputTokens,
    temperature: profile.temperature,
    thinkingType: profile.thinkingType
  });
}

export function createWorkspaceLlmDefaultBinding(input: {
  store: RuntimeReadinessStore;
  tenantId: string;
  workspaceId: string;
  profileId: string;
  expectedProfileDigest?: string;
  expectedBindingDigest?: string;
  actor: string;
  reason: string;
  now?: Date;
}): WorkspaceLlmDefaultBinding {
  const now = input.now ?? new Date();
  const profile = input.store.readLlmProfile(input.profileId);
  if (!profile || profile.tenantId !== input.tenantId || profile.workspaceId !== input.workspaceId || profile.scope !== "workspace" || profile.status !== "ACTIVE") {
    throw new LlmReadinessError("LLM_PROFILE_NOT_BINDABLE");
  }
  const profileDigest = llmProfileDigest(profile);
  if (input.expectedProfileDigest && input.expectedProfileDigest !== profileDigest) throw new LlmReadinessError("LLM_PROFILE_DIGEST_MISMATCH");
  const secret = input.store.readSecret(profile.apiKeyRef);
  if (!secret || secret.status !== "ACTIVE" || secret.tenantId !== input.tenantId || secret.workspaceId !== input.workspaceId) {
    throw new LlmReadinessError("LLM_SECRET_REF_NOT_READY");
  }
  const readiness = profile.lastPreflight;
  if (!readiness || readiness.status !== "READY" || !isFresh(readiness.checkedAt, now)) throw new LlmReadinessError("LLM_LIVE_PREFLIGHT_REQUIRED");
  const previous = input.store.readWorkspaceLlmDefaultBinding(input.tenantId, input.workspaceId);
  if (input.expectedBindingDigest !== undefined && input.expectedBindingDigest !== (previous?.digest ?? "")) throw new LlmReadinessError("WORKSPACE_LLM_BINDING_CONFLICT");
  const material: Omit<WorkspaceLlmDefaultBinding, "digest"> = {
    schema: EVOPILOT_WORKSPACE_LLM_DEFAULT_BINDING_SCHEMA,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    revision: (previous?.revision ?? 0) + 1,
    profileId: profile.id,
    profileDigest,
    provider: profile.providerName,
    model: profile.modelName,
    secretRef: profile.apiKeyRef,
    readiness: {
      status: "READY" as const,
      checkedAt: readiness.checkedAt,
      expiresAt: new Date(new Date(readiness.checkedAt).getTime() + LLM_READINESS_FRESHNESS_MS).toISOString(),
      evidenceDigest: digest(readiness)
    },
    actor: input.actor,
    reason: input.reason.trim() || "explicit-workspace-default",
    createdAt: now.toISOString(),
    previousBindingDigest: previous?.digest
  };
  return input.store.writeWorkspaceLlmDefaultBinding({ ...material, digest: digest(material) }, previous?.digest);
}

export function reconcileRuntimeReadiness(input: {
  store: RuntimeReadinessStore;
  tenantId: string;
  workspaceId: string;
  actor: string;
  reason?: string;
  now?: Date;
}): RuntimeReadinessRecord {
  const now = input.now ?? new Date();
  const previous = input.store.readRuntimeReadiness(input.tenantId, input.workspaceId);
  const profiles = input.store.listLlmProfiles(input.tenantId, input.workspaceId).filter((profile) => profile.scope === "workspace" && profile.status === "ACTIVE");
  const binding = input.store.readWorkspaceLlmDefaultBinding(input.tenantId, input.workspaceId);
  let state: EvoPilotRuntimeReadinessState = "SETUP_REQUIRED";
  let reason = "No governed workspace LLM profile exists.";
  let profileId: string | undefined;
  const evidenceRefs: string[] = [];

  if (profiles.length > 0 && !binding) {
    state = "PREFLIGHT_REQUIRED";
    reason = "A workspace profile exists but no fresh explicit workspace-default binding is active.";
    evidenceRefs.push(...profiles.map((profile) => `profile:${profile.id}@${llmProfileDigest(profile)}`));
  } else if (binding) {
    profileId = binding.profileId;
    const profile = input.store.readLlmProfile(binding.profileId);
    const secret = profile ? input.store.readSecret(profile.apiKeyRef) : undefined;
    const profileMatches = Boolean(profile && llmProfileDigest(profile) === binding.profileDigest && profile.tenantId === input.tenantId && profile.workspaceId === input.workspaceId && profile.scope === "workspace" && profile.status === "ACTIVE");
    const secretMatches = Boolean(secret && secret.status === "ACTIVE" && secret.tenantId === input.tenantId && secret.workspaceId === input.workspaceId && profile?.apiKeyRef === binding.secretRef);
    const preflightMatches = Boolean(profile?.lastPreflight?.status === "READY" && profile.lastPreflight.checkedAt === binding.readiness.checkedAt && isFresh(binding.readiness.checkedAt, now));
    evidenceRefs.push(`binding:${binding.digest}`, `profile:${binding.profileId}@${binding.profileDigest}`, `preflight:${binding.readiness.evidenceDigest}`);
    if (profileMatches && secretMatches && preflightMatches) {
      state = "READY";
      reason = "Explicit workspace LLM default is live-preflight READY.";
    } else {
      state = "LLM_BLOCKED";
      reason = !profileMatches ? "Bound profile drifted or is unavailable." : !secretMatches ? "Bound SecretRef is unavailable or out of scope." : "Bound live preflight is stale or invalid.";
    }
  }

  const nextAction = nextActionFor(state, profiles.length > 0);
  evidenceRefs.sort();
  const unchanged = Boolean(previous
    && previous.state === state
    && previous.bindingDigest === binding?.digest
    && previous.profileId === profileId
    && previous.reason === reason
    && previous.nextAction === nextAction
    && stable(previous.evidenceRefs) === stable(evidenceRefs));
  if (unchanged && previous) return previous;
  const material: Omit<RuntimeReadinessRecord, "digest"> = {
    schema: EVOPILOT_RUNTIME_READINESS_SCHEMA,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    state,
    revision: (previous?.revision ?? 0) + 1,
    bindingDigest: binding?.digest,
    profileId,
    reason,
    evidenceRefs,
    actor: input.actor,
    updatedAt: now.toISOString(),
    nextAction
  };
  const record: RuntimeReadinessRecord = { ...material, digest: digest(material) };
  return input.store.writeRuntimeReadiness(record, previous?.digest);
}

export function isSetupOnlyHttpPath(pathname: string): boolean {
  if (pathname === "/api/v1/health" || pathname === "/api/v1/readiness") return true;
  return LLM_SETUP_ONLY_PATHS.some((prefix) => prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function nextActionFor(state: EvoPilotRuntimeReadinessState, profileExists: boolean): RuntimeReadinessRecord["nextAction"] {
  if (state === "READY") return "normal-operation";
  if (state === "LLM_BLOCKED") return "repair-llm-readiness";
  if (state === "PREFLIGHT_REQUIRED") return profileExists ? "run-live-preflight" : "configure-llm-profile";
  return "configure-secret-ref";
}

function isFresh(value: string, now: Date): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now.getTime() && now.getTime() - time <= LLM_READINESS_FRESHNESS_MS;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
