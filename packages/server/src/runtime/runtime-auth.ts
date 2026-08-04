import fs from "node:fs";
import http from "node:http";
import { createHash } from "node:crypto";
import type { LlmTaskClient } from "@evopilot/llm";
import type {
  AuditRecord,
  AuthContext,
  AuthRole,
  AuthToken,
  AuthUser,
  EvoPilotRuntimeMode,
  EvoPilotServerOptions,
  RuntimeConfig,
  UserRecord
} from "../model.js";
import { safeFileName } from "../storage/json-files.js";

export const DEFAULT_TENANT_ID = "tenant-production";
export const DEFAULT_WORKSPACE_ID = "workspace-agent-products";

type UserDirectory = {
  listUsers(tenantId?: string, includeSuspended?: boolean): UserRecord[];
};

export function resolveRuntimeConfig(options: EvoPilotServerOptions): RuntimeConfig {
  const envMode = String(process.env.EVOPILOT_RUN_MODE ?? process.env.EVOPILOT_MODE ?? "").trim().toLowerCase();
  const debugEnabled = parseBoolean(process.env.EVOPILOT_DEBUG, false);
  const mode: EvoPilotRuntimeMode = options.runtimeMode ?? (envMode === "debug" || debugEnabled ? "debug" : "prod");
  const debug = mode === "debug";
  return {
    mode,
    requireLlm: options.requireLlm ?? parseBoolean(process.env.EVOPILOT_REQUIRE_LLM, !debug),
    allowAnonymousAdmin: options.allowAnonymousAdmin ?? parseBoolean(process.env.EVOPILOT_ALLOW_ANONYMOUS_ADMIN, debug),
    allowMockIntegrations: options.allowMockIntegrations ?? parseBoolean(process.env.EVOPILOT_ALLOW_MOCK_INTEGRATIONS, debug),
    allowSampleData: options.allowSampleData ?? parseBoolean(process.env.EVOPILOT_ALLOW_SAMPLE_DATA, debug),
    autoRegisterProfileProject: options.autoRegisterProfileProject ?? parseBoolean(process.env.EVOPILOT_AUTO_REGISTER_PROFILE_PROJECT, debug)
  };
}

export function assertProductionRuntimeIsConfigured(runtime: RuntimeConfig, tokens: AuthToken[], llmClient?: LlmTaskClient): void {
  if (runtime.mode !== "prod") return;
  if (runtime.allowAnonymousAdmin) throw new Error("EVOPILOT_PROD_FORBIDS_ANONYMOUS_ADMIN");
  if (runtime.allowMockIntegrations) throw new Error("EVOPILOT_PROD_FORBIDS_MOCK_INTEGRATIONS");
  if (!runtime.requireLlm) throw new Error("EVOPILOT_PROD_REQUIRES_LLM");
  if (tokens.length === 0) throw new Error("EVOPILOT_PROD_REQUIRES_TOKENS");
  if (!llmClient) throw new Error("EVOPILOT_PROD_REQUIRES_LLM_PROVIDER");
}

export function requireBodyString(value: unknown, errorCode: string, runtime: RuntimeConfig, debugFallback?: string): string {
  const normalized = value === undefined || value === null ? "" : String(value).trim();
  if (normalized) return normalized;
  if (runtime.mode === "debug" && debugFallback) return debugFallback;
  throw new Error(errorCode);
}

export function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function normalizeTokens(options: EvoPilotServerOptions): AuthToken[] {
  if (options.tokens) return options.tokens;
  if (options.apiToken) return [{ name: "admin", token: options.apiToken, role: "admin" }];
  return [];
}

export function normalizeUsers(options: EvoPilotServerOptions, tokens: AuthToken[], runtime: RuntimeConfig, store: UserDirectory): AuthUser[] {
  const merged = new Map<string, AuthUser>();
  const addUsers = (users: AuthUser[]) => {
    for (const user of users) {
      merged.set(user.username, { ...user, platformAdmin: user.platformAdmin ?? user.role === "admin", status: user.status ?? "ACTIVE" });
    }
  };
  addUsers(store.listUsers(undefined, false).map(authUserFromRecord));
  const envUsers = parseEnvUsers(process.env.EVOPILOT_USERS);
  if (envUsers?.length) addUsers(envUsers);
  if (options.users) addUsers(options.users);
  if (runtime.mode === "debug") {
    addUsers(tokens.map((token) => ({
      username: token.name,
      password: token.token,
      role: token.role,
      tenantId: token.tenantId ?? DEFAULT_TENANT_ID,
      workspaceId: token.workspaceId ?? DEFAULT_WORKSPACE_ID,
      displayName: token.displayName ?? token.name,
      token: token.token,
      status: "ACTIVE",
      platformAdmin: token.role === "admin"
    })));
  }
  return [...merged.values()];
}

export function mergeUserTokens(tokens: AuthToken[], users: AuthUser[]): AuthToken[] {
  const merged = new Map<string, AuthToken>();
  for (const token of tokens) merged.set(token.token, token);
  for (const user of users) {
    const token = userSessionToken(user);
    if (merged.has(token)) continue;
    merged.set(token, {
      name: user.username,
      token,
      role: user.role,
      tenantId: user.tenantId,
      workspaceId: user.workspaceId,
      displayName: user.displayName,
      platformAdmin: user.platformAdmin,
      mustChangePassword: user.mustChangePassword
    });
  }
  return [...merged.values()];
}

export function userSessionToken(user: AuthUser): string {
  if (user.token) return user.token;
  return createHash("sha256")
    .update(["evopilot-session-v1", user.username, user.password, user.role, user.tenantId, user.workspaceId, user.platformAdmin ? "platform" : "tenant"].join(":"))
    .digest("hex");
}

export function publicUser(user: AuthUser): Omit<AuthUser, "password" | "token"> {
  const { password: _password, token: _token, ...safe } = user;
  return safe;
}

export function authUserFromRecord(user: UserRecord): AuthUser {
  return {
    username: user.username,
    password: user.passwordHash,
    role: user.role,
    tenantId: user.tenantId,
    workspaceId: user.workspaceId,
    displayName: user.displayName,
    status: user.status,
    platformAdmin: user.platformAdmin,
    mustChangePassword: user.mustChangePassword
  };
}

export function maskUser(user: UserRecord): Omit<UserRecord, "passwordHash"> {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export function hashPassword(password: string): string {
  return `sha256:${createHash("sha256").update(`evopilot-user-password:${password}`).digest("hex")}`;
}

export function verifyPassword(input: string, stored: string): boolean {
  if (stored.startsWith("sha256:")) return hashPassword(input) === stored;
  return input === stored;
}

export function requestScope(request: http.IncomingMessage): Pick<AuthContext, "tenantId" | "workspaceId"> {
  const tenantId = optionalRuntimeString(request.headers["x-evopilot-tenant"]) ?? DEFAULT_TENANT_ID;
  const workspaceId = optionalRuntimeString(request.headers["x-evopilot-workspace"]) ?? DEFAULT_WORKSPACE_ID;
  return {
    tenantId: safeFileName(tenantId),
    workspaceId: safeFileName(workspaceId)
  };
}

export function authorize(request: http.IncomingMessage, tokens: AuthToken[], runtime: RuntimeConfig, allowAnonymousFallback = false): AuthContext | undefined {
  const requestedScope = requestScope(request);
  const value = String(request.headers.authorization ?? "");
  if (allowAnonymousFallback && runtime.allowAnonymousAdmin && !value) {
    return { actor: String(request.headers["x-evopilot-actor"] ?? "system"), role: "admin", platformAdmin: true, ...requestedScope };
  }
  if (tokens.length === 0) {
    if (!runtime.allowAnonymousAdmin) return undefined;
    return { actor: String(request.headers["x-evopilot-actor"] ?? "system"), role: "admin", platformAdmin: true, ...requestedScope };
  }
  const token = value.startsWith("Bearer ") ? value.slice("Bearer ".length) : "";
  const matched = tokens.find((item) => item.token === token);
  if (!matched) return undefined;
  const scope = {
    tenantId: matched.tenantId ?? requestedScope.tenantId,
    workspaceId: matched.workspaceId ?? requestedScope.workspaceId
  };
  return {
    actor: String(request.headers["x-evopilot-actor"] ?? matched.name),
    role: matched.role,
    platformAdmin: matched.platformAdmin ?? matched.role === "admin",
    mustChangePassword: matched.mustChangePassword,
    ...scope
  };
}

export function hasRole(context: AuthContext, required: AuthRole): boolean {
  const rank: Record<AuthRole, number> = { viewer: 1, operator: 2, admin: 3 };
  return rank[context.role] >= rank[required];
}

export function audit(context: AuthContext, action: string, target: string, metadata?: Record<string, unknown>): AuditRecord {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    actor: context.actor,
    action,
    target,
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    timestamp: new Date().toISOString(),
    metadata
  };
}

export function getIdempotencyKey(request: http.IncomingMessage): string | undefined {
  const value = request.headers["x-idempotency-key"];
  const key = Array.isArray(value) ? value[0] : value;
  return key && key.trim().length > 0 ? key.trim() : undefined;
}

export function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const raw = trimmed.slice(index + 1).trim();
    const value = raw.replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

export function parseEnvTokens(value: string | undefined): AuthToken[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((item) => {
    const [name, token, role] = item.split(":");
    if (!name || !token || (role !== "viewer" && role !== "operator" && role !== "admin")) {
      throw new Error("EVOPILOT_TOKENS 条目必须使用 name:token:role 格式");
    }
    return { name, token, role };
  });
}

export function parseEnvUsers(value: string | undefined): AuthUser[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((item) => {
    const [username, password, role, tenantId = DEFAULT_TENANT_ID, workspaceId = DEFAULT_WORKSPACE_ID, displayName, platformAdminRaw] = item.split(":");
    if (!username || !password || (role !== "viewer" && role !== "operator" && role !== "admin")) {
      throw new Error("EVOPILOT_USERS 条目必须使用 username:password:role[:tenantId[:workspaceId[:displayName]]] 格式");
    }
    return {
      username,
      password,
      role,
      tenantId: safeFileName(tenantId),
      workspaceId: safeFileName(workspaceId),
      displayName: displayName || username,
      status: "ACTIVE",
      platformAdmin: platformAdminRaw === undefined ? role === "admin" : parseBoolean(platformAdminRaw, role === "admin")
    };
  });
}

function optionalRuntimeString(value: unknown): string | undefined {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text.length > 0 ? text : undefined;
}
