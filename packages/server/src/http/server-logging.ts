import { EVOPILOT_LOG_SCHEMA } from "@evopilot/contracts";
import { EVOPILOT_PRODUCT_VERSION } from "./platform-readiness.js";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogSeverity = "DEBUG" | "INFO" | "WARN" | "ERROR";
export type LogCategory = "http" | "auth" | "runtime" | "release" | "worker" | "code-upgrade" | "cicd" | "audit" | "harness" | "system";
export type LogOutcome = "success" | "rejected" | "failed" | "blocked";

export interface LoggingSettings {
  schema: "evopilot-logging-settings/v1";
  level: LogLevel;
  format: "json";
  includeStack: boolean;
  source: "env" | "control-plane";
  updatedAt: string;
  updatedBy?: string;
}

export interface LogRecord {
  timestamp?: string;
  level: LogLevel;
  schema?: string;
  severity?: LogSeverity;
  service?: "evopilot";
  version?: string;
  event: string;
  category?: LogCategory;
  requestId?: string;
  tenantId?: string;
  workspaceId?: string;
  actor?: string;
  role?: string;
  action?: string;
  target?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  latencyBucket?: string;
  routeGroup?: string;
  outcome?: LogOutcome;
  correlation?: {
    requestId?: string;
    traceId?: string;
    spanId?: string;
    parentRequestId?: string;
    loopId?: string;
    goalId?: string;
    projectId?: string;
    releaseTargetId?: string;
    releaseDecisionId?: string;
    releaseRunId?: string;
  };
  diagnosis?: {
    summary?: string;
    likelyCause?: string;
    recommendedAction?: string;
    retriable?: boolean;
    humanActionRequired?: boolean;
  };
  error?: string;
  errorCode?: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

export class LogSettingsHttpError extends Error {
  readonly statusCode = 400;

  constructor(
    readonly code: string,
    readonly detail?: string
  ) {
    super(code);
  }
}

export function logDebug(event: string, record: Omit<LogRecord, "level" | "event"> = {}): void {
  writeLog({ ...record, level: "debug", event });
}

export function logInfo(event: string, record: Omit<LogRecord, "level" | "event"> = {}): void {
  writeLog({ ...record, level: "info", event });
}

export function logWarn(event: string, record: Omit<LogRecord, "level" | "event"> = {}): void {
  writeLog({ ...record, level: "warn", event });
}

export function logError(event: string, error: unknown, record: Omit<LogRecord, "level" | "event" | "error" | "stack"> = {}): void {
  writeLog({
    ...record,
    level: "error",
    event,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
}

let activeLoggingSettings: LoggingSettings | undefined;

export function setActiveLoggingSettings(settings: LoggingSettings): void {
  activeLoggingSettings = settings;
}

export function defaultLoggingSettings(): LoggingSettings {
  return {
    schema: "evopilot-logging-settings/v1",
    level: normalizeLogLevel(process.env.EVOPILOT_LOG_LEVEL),
    format: "json",
    includeStack: parseBoolean(process.env.EVOPILOT_LOG_STACK, true),
    source: "env",
    updatedAt: new Date().toISOString()
  };
}

export function normalizeLoggingSettings(input: unknown, source: LoggingSettings["source"]): LoggingSettings {
  const record = isRecord(input) ? input : {};
  const includeStack = record.includeStack !== undefined
    ? parseLoggingBoolean(record.includeStack, true)
    : record.stack !== undefined
      ? parseLoggingBoolean(record.stack, true)
      : parseBoolean(process.env.EVOPILOT_LOG_STACK, true);
  return {
    schema: "evopilot-logging-settings/v1",
    level: normalizeLogLevel(record.level ?? process.env.EVOPILOT_LOG_LEVEL),
    format: "json",
    includeStack,
    source,
    updatedAt: String(record.updatedAt ?? new Date().toISOString()),
    ...(record.updatedBy ? { updatedBy: String(record.updatedBy) } : {})
  };
}

function parseLoggingBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function normalizeLogLevel(value: unknown): LogLevel {
  const normalized = String(value ?? "info").trim().toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") return normalized;
  throw new LogSettingsHttpError("LOG_LEVEL_INVALID", "Log level must be debug, info, warn, or error.");
}

function logSeverity(level: LogLevel): LogSeverity {
  const severities: Record<LogLevel, LogSeverity> = { debug: "DEBUG", info: "INFO", warn: "WARN", error: "ERROR" };
  return severities[level];
}

function logCategory(event: string): LogCategory {
  if (event.startsWith("http.")) return "http";
  if (event.startsWith("audit.")) return "audit";
  if (event.startsWith("harness-") || event.startsWith("project-harness") || event.startsWith("goal-plan.project-harness")) return "harness";
  if (event.startsWith("code-upgrade.")) return "code-upgrade";
  if (event.startsWith("devops.") || event.startsWith("project.devops")) return "cicd";
  if (event.startsWith("loop-worker.")) return "worker";
  if (event.includes("release")) return "release";
  if (event.includes("auth")) return "auth";
  if (event.startsWith("server.") || event.startsWith("process.")) return "runtime";
  return "system";
}

function writeLog(record: LogRecord): void {
  if (!shouldLog(record.level)) return;
  const normalized: LogRecord = {
    timestamp: record.timestamp ?? new Date().toISOString(),
    schema: EVOPILOT_LOG_SCHEMA,
    service: "evopilot",
    version: EVOPILOT_PRODUCT_VERSION,
    severity: logSeverity(record.level),
    category: record.category ?? logCategory(record.event),
    ...record,
    correlation: record.correlation ? redactLogValue(record.correlation) as LogRecord["correlation"] : undefined,
    diagnosis: record.diagnosis ? redactLogValue(record.diagnosis) as LogRecord["diagnosis"] : undefined,
    metadata: record.metadata ? redactLogValue(record.metadata) as Record<string, unknown> : undefined,
    error: record.error ? redactSensitiveText(record.error) : undefined,
    stack: includeLogStack() && record.stack ? redactSensitiveText(record.stack) : undefined
  };
  const line = JSON.stringify(removeUndefined(normalized));
  if (record.level === "error") console.error(line);
  else console.log(line);
}

function shouldLog(level: LogLevel): boolean {
  const ranks: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
  const configured = activeLoggingSettings?.level ?? defaultLoggingSettings().level;
  const threshold = ranks[configured] ?? ranks.info;
  return ranks[level] >= threshold;
}

function includeLogStack(): boolean {
  return activeLoggingSettings?.includeStack ?? defaultLoggingSettings().includeStack;
}

function redactLogValue(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) return value.map((entry, index) => redactLogValue(entry, [...path, String(index)]));
  if (!value || typeof value !== "object") return typeof value === "string" ? redactSensitiveText(value) : value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    const childPath = [...path, key];
    if (isSensitiveLogKey(key) && !isObservableLlmUsageKey(key, path)) return [key, "[REDACTED]"];
    return [key, redactLogValue(entry, childPath)];
  }));
}

function isSensitiveLogKey(key: string): boolean {
  return /token|password|secret|authorization|apiKey|credential/i.test(key);
}

function isObservableLlmUsageKey(key: string, path: string[]): boolean {
  const normalized = key.toLowerCase();
  if (!/token/.test(normalized)) return false;
  const countKey = /^(inputtokens|outputtokens|totaltokens|prompttokens|completiontokens|tokencount|tokens)$/i.test(key)
    || /tokens$/i.test(key);
  if (!countKey) return false;
  return path.some((segment) => /llmusage|llm|usage|metrics|cost|request|cumulative|latest|summary/i.test(segment));
}

function removeUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactSensitiveText(text: string): string {
  return text
    .replace(/Authorization:\s*Bearer\s+[A-Za-z0-9._~+\/=:-]+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/=:-]+/gi, "Bearer [REDACTED]")
    .replace(/(token|password|secret|apiKey)([=:\"']+)([^\s,}]+)/gi, "$1$2[REDACTED]")
    .replace(/(authorization)([=:\"']+)([^\s,}]+)/gi, "$1$2[REDACTED]");
}
