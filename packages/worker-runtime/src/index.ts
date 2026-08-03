import crypto from "node:crypto";
import {
  EVOPILOT_LOG_SCHEMA,
  EVOPILOT_PRODUCT_VERSION_FALLBACK,
  EVOPILOT_WORKER_RUNTIME_SCHEMA
} from "@evopilot/contracts";

export interface LoopWorkerRuntimeConfig {
  baseUrls: string[];
  token?: string;
  workerId: string;
  actor: string;
  preferredLoopId?: string;
  strictPreferredLoop: boolean;
  pollIntervalMs: number;
  leaseSeconds: number;
  requestTimeoutMs: number;
  requestAttempts: number;
  requestRetryBackoffMs: number;
  once: boolean;
  maxCycles: number;
  productVersion: string;
  logStack: boolean;
}

interface LoopWorkerCandidate {
  loopId: string;
  currentIteration?: number;
  status?: string;
  claimable?: boolean;
  workerLease?: {
    workerId?: string;
  };
}

interface LoopWorkerRunResult {
  schema: typeof EVOPILOT_WORKER_RUNTIME_SCHEMA;
  workerId: string;
  cycles: number;
  stopped: boolean;
}

type WorkerLogLevel = "info" | "warn" | "error" | "debug";

export async function runLoopWorkerFromEnv(argv = process.argv, env = process.env): Promise<LoopWorkerRunResult> {
  return runLoopWorker(loopWorkerRuntimeConfigFromEnv(argv, env));
}

export function loopWorkerRuntimeConfigFromEnv(
  argv = process.argv,
  env: NodeJS.ProcessEnv = process.env
): LoopWorkerRuntimeConfig {
  const baseUrls = normalizeBaseUrls(env.EVOPILOT_BASE_URL ?? "http://127.0.0.1:19876", env.EVOPILOT_BASE_URL_FALLBACKS);
  const workerId = env.EVOPILOT_LOOP_WORKER_ID ?? `loop-worker-${crypto.randomUUID().slice(0, 8)}`;
  const once = env.EVOPILOT_LOOP_WORKER_ONCE === "1" || argv.includes("--once");
  return {
    baseUrls,
    token: env.EVOPILOT_API_TOKEN ?? env.EVOPILOT_ADMIN_TOKEN,
    workerId,
    actor: env.EVOPILOT_ACTOR ?? workerId,
    preferredLoopId: env.EVOPILOT_LOOP_WORKER_LOOP_ID || undefined,
    strictPreferredLoop: env.EVOPILOT_LOOP_WORKER_STRICT_LOOP_ID === "1" || env.EVOPILOT_LOOP_WORKER_STRICT_LOOP_ID === "true",
    pollIntervalMs: positiveInteger(env.EVOPILOT_LOOP_WORKER_POLL_MS, 2000),
    leaseSeconds: positiveInteger(env.EVOPILOT_LOOP_WORKER_LEASE_SECONDS, 30),
    requestTimeoutMs: positiveInteger(env.EVOPILOT_LOOP_WORKER_REQUEST_TIMEOUT_MS, 10000),
    requestAttempts: positiveInteger(env.EVOPILOT_LOOP_WORKER_REQUEST_ATTEMPTS, 3),
    requestRetryBackoffMs: positiveInteger(env.EVOPILOT_LOOP_WORKER_RETRY_BACKOFF_MS, 250),
    once,
    maxCycles: positiveInteger(env.EVOPILOT_LOOP_WORKER_MAX_CYCLES, once ? 1 : Number.MAX_SAFE_INTEGER),
    productVersion: env.EVOPILOT_PRODUCT_VERSION ?? EVOPILOT_PRODUCT_VERSION_FALLBACK,
    logStack: env.EVOPILOT_LOOP_WORKER_LOG_STACK === "1"
  };
}

export async function runLoopWorker(config: LoopWorkerRuntimeConfig): Promise<LoopWorkerRunResult> {
  const runtime = new LoopWorkerRuntime(config);
  return runtime.run();
}

class LoopWorkerRuntime {
  private stopped = false;

  constructor(private readonly config: LoopWorkerRuntimeConfig) {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        this.stopped = true;
      });
    }
  }

  async run(): Promise<LoopWorkerRunResult> {
    this.logInfo("loop-worker.started", {
      baseUrl: this.config.baseUrls[0],
      fallbackBaseUrls: this.config.baseUrls.slice(1).length ? this.config.baseUrls.slice(1) : undefined,
      preferredLoopId: this.config.preferredLoopId,
      strictPreferredLoop: this.config.strictPreferredLoop,
      pollIntervalMs: this.config.pollIntervalMs,
      leaseSeconds: this.config.leaseSeconds,
      requestTimeoutMs: this.config.requestTimeoutMs,
      requestAttempts: this.config.requestAttempts,
      requestRetryBackoffMs: this.config.requestRetryBackoffMs,
      once: this.config.once
    });

    let cycles = 0;
    while (!this.stopped && cycles < this.config.maxCycles) {
      cycles += 1;
      try {
        await this.post("/api/v1/loops/watchdog", {});
        const candidate = await this.claimCandidate();
        if (candidate) {
          await this.post("/api/v1/loop-workers/heartbeat", {
            loopId: candidate.loopId,
            workerId: this.config.workerId,
            leaseSeconds: this.config.leaseSeconds
          });
          const action = Number(candidate.currentIteration ?? 0) === 0 ? "start" : "resume";
          const updated = await this.post(`/api/v1/loops/${encodeURIComponent(candidate.loopId)}/${action}`, {
            evidence: [`worker=${this.config.workerId}`, `cycle=${cycles}`, `action=${action}`]
          });
          this.logInfo("loop-worker.iteration", {
            loopId: stringField(updated, "id"),
            action,
            status: stringField(updated, "status"),
            currentIteration: field(updated, "currentIteration")
          });
        } else {
          this.logInfo("loop-worker.idle", {
            cycle: cycles,
            preferredLoopId: this.config.preferredLoopId,
            strictPreferredLoop: this.config.strictPreferredLoop
          });
        }
      } catch (error) {
        const detail = this.describeError(error);
        const message = String(detail.message ?? "");
        if (!/LOOP_APPROVAL_REQUIRED/.test(message)) {
          this.logError("loop-worker.error", detail);
          if (this.config.once) process.exitCode = 1;
        } else {
          this.logWarn("loop-worker.waiting-approval", detail);
        }
      }
      if (this.config.once || this.stopped || cycles >= this.config.maxCycles) break;
      await sleep(this.config.pollIntervalMs);
    }

    this.logInfo("loop-worker.stopped", { cycles });
    return {
      schema: EVOPILOT_WORKER_RUNTIME_SCHEMA,
      workerId: this.config.workerId,
      cycles,
      stopped: this.stopped
    };
  }

  private async claimCandidate(): Promise<LoopWorkerCandidate | undefined> {
    const { preferredLoopId, strictPreferredLoop, workerId, leaseSeconds } = this.config;
    if (preferredLoopId) {
      const queue = await this.get("/api/v1/loop-workers/queue");
      const items = Array.isArray(queue) ? queue as LoopWorkerCandidate[] : [];
      const preferred = items.find((item) => item.loopId === preferredLoopId);
      if (!preferred) return strictPreferredLoop ? undefined : this.claimNextAvailable();
      if (preferred.claimable) {
        const claim = await this.post("/api/v1/loop-workers/claim", { workerId, leaseSeconds, loopId: preferredLoopId });
        const claimed = field(claim, "claimed");
        return isRecord(claimed) && claimed.loopId === preferredLoopId ? claimed as unknown as LoopWorkerCandidate : undefined;
      }
      if (preferred.workerLease?.workerId === workerId && ["PENDING", "RUNNING", "BLOCKED"].includes(String(preferred.status))) {
        return preferred;
      }
      if (strictPreferredLoop) return undefined;
      this.logWarn("loop-worker.preferred-unavailable", {
        preferredLoopId,
        preferredStatus: preferred.status,
        preferredClaimable: preferred.claimable
      });
      return this.claimNextAvailable();
    }
    return this.claimNextAvailable();
  }

  private async claimNextAvailable(): Promise<LoopWorkerCandidate | undefined> {
    const claim = await this.post("/api/v1/loop-workers/claim", {
      workerId: this.config.workerId,
      leaseSeconds: this.config.leaseSeconds
    });
    const claimed = field(claim, "claimed");
    return isRecord(claimed) ? claimed as unknown as LoopWorkerCandidate : undefined;
  }

  private async get(pathname: string): Promise<unknown> {
    return this.requestJson("GET", pathname);
  }

  private async post(pathname: string, body: unknown): Promise<unknown> {
    return this.requestJson("POST", pathname, body);
  }

  private async requestJson(method: string, pathname: string, body?: unknown): Promise<unknown> {
    attemptsLoop:
    for (let attempt = 1; attempt <= this.config.requestAttempts; attempt += 1) {
      for (let index = 0; index < this.config.baseUrls.length; index += 1) {
        const currentBaseUrl = this.config.baseUrls[index];
        const url = `${currentBaseUrl}${pathname}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
        try {
          const response = await fetch(url, {
            method,
            headers: { ...this.headers(), ...(body === undefined ? {} : { "content-type": "application/json" }) },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal
          });
          const text = await response.text();
          if (!response.ok) {
            const error = Object.assign(new Error(`${method} ${pathname} returned ${response.status}: ${truncate(text)}`), {
              name: "WorkerHttpError",
              method,
              pathname,
              baseUrl: currentBaseUrl,
              status: response.status,
              attempts: attempt,
              response: truncate(text)
            });
            if (index < this.config.baseUrls.length - 1 && isRetriableStatus(response.status)) {
              await this.retryAfter(error, attempt, this.config.baseUrls[index + 1], 0);
              continue;
            }
            if (attempt < this.config.requestAttempts && isRetriableStatus(response.status)) {
              await this.retryAfter(error, attempt, this.config.baseUrls[0]);
              continue attemptsLoop;
            }
            throw error;
          }
          return unwrap(text ? JSON.parse(text) : {});
        } catch (error) {
          const enriched = this.enrichRequestError(error, method, pathname, attempt, currentBaseUrl);
          if (index < this.config.baseUrls.length - 1 && isRetriableRequestError(enriched)) {
            await this.retryAfter(enriched, attempt, this.config.baseUrls[index + 1], 0);
            continue;
          }
          if (attempt < this.config.requestAttempts && isRetriableRequestError(enriched)) {
            await this.retryAfter(enriched, attempt, this.config.baseUrls[0]);
            continue attemptsLoop;
          }
          throw enriched;
        } finally {
          clearTimeout(timeout);
        }
      }
    }
    throw Object.assign(new Error(`${method} ${pathname} failed without a response`), {
      name: "WorkerRequestError",
      method,
      pathname,
      attempts: this.config.requestAttempts
    });
  }

  private async retryAfter(error: unknown, attempt: number, nextBaseUrl: string, backoffMs = this.config.requestRetryBackoffMs * 2 ** Math.max(0, attempt - 1)): Promise<void> {
    this.logWarn("loop-worker.request-retry", {
      ...this.describeError(error),
      attempt,
      nextAttempt: backoffMs > 0 ? attempt + 1 : attempt,
      nextBaseUrl,
      maxAttempts: this.config.requestAttempts,
      backoffMs
    });
    if (backoffMs > 0) await sleep(backoffMs);
  }

  private headers(): Record<string, string> {
    return {
      ...(this.config.token ? { authorization: `Bearer ${this.config.token}` } : {}),
      "x-evopilot-actor": this.config.actor
    };
  }

  private enrichRequestError(error: unknown, method: string, pathname: string, attempts: number, baseUrl: string): unknown {
    if (error && typeof error === "object") {
      const mutable = error as Record<string, unknown>;
      mutable.method ??= method;
      mutable.pathname ??= pathname;
      mutable.baseUrl ??= baseUrl;
      mutable.attempts ??= attempts;
      return mutable;
    }
    return Object.assign(new Error(String(error)), {
      name: "WorkerRequestError",
      method,
      pathname,
      baseUrl,
      attempts
    });
  }

  private describeError(error: unknown): Record<string, unknown> {
    const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
    const cause = source.cause && typeof source.cause === "object" ? source.cause as Record<string, unknown> : {};
    return removeUndefined({
      name: source.name ?? typeof error,
      message: source.message ?? String(error),
      method: source.method,
      pathname: source.pathname,
      baseUrl: source.baseUrl,
      status: source.status,
      attempts: source.attempts,
      code: source.code,
      causeName: cause.name,
      causeMessage: cause.message,
      causeCode: cause.code,
      causeErrno: cause.errno,
      causeSyscall: cause.syscall,
      causeAddress: cause.address,
      causePort: cause.port,
      stack: this.config.logStack ? source.stack : undefined
    });
  }

  private logInfo(event: string, record: Record<string, unknown> = {}): void {
    this.writeWorkerLog("info", event, record);
  }

  private logWarn(event: string, record: Record<string, unknown> = {}): void {
    this.writeWorkerLog("warn", event, record);
  }

  private logError(event: string, record: Record<string, unknown> = {}): void {
    this.writeWorkerLog("error", event, record);
  }

  private writeWorkerLog(level: WorkerLogLevel, event: string, record: Record<string, unknown>): void {
    const redacted = redactLogValue(record) as Record<string, unknown>;
    const line = JSON.stringify(removeUndefined({
      timestamp: new Date().toISOString(),
      schema: EVOPILOT_LOG_SCHEMA,
      service: "evopilot",
      version: this.config.productVersion,
      severity: logSeverity(level),
      level,
      category: "worker",
      event,
      workerId: this.config.workerId,
      ...redacted,
      correlation: redacted.loopId ? { loopId: redacted.loopId } : undefined
    }));
    if (level === "error") console.error(line);
    else console.log(line);
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function normalizeBaseUrls(primary: string, fallbacks?: string): string[] {
  const values = [primary, ...String(fallbacks ?? "").split(",")]
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return [...new Set(values)].length ? [...new Set(values)] : ["http://127.0.0.1:19876"];
}

function unwrap(body: unknown): unknown {
  return body && typeof body === "object" && Object.hasOwn(body, "data") ? (body as Record<string, unknown>).data : body;
}

function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isRetriableRequestError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const source = error as Record<string, any>;
  if (typeof source.status === "number") return isRetriableStatus(source.status);
  const code = source.code ?? source.cause?.code;
  const name = source.name ?? source.cause?.name;
  const message = source.message ?? "";
  return /AbortError|TimeoutError/i.test(String(name))
    || /fetch failed|network|terminated|socket|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|UND_ERR/i.test(String(message))
    || /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|UND_ERR/i.test(String(code));
}

function truncate(text: unknown, maxLength = 2000): string {
  return String(text ?? "").length > maxLength ? `${String(text).slice(0, maxLength)}...` : String(text ?? "");
}

function logSeverity(level: WorkerLogLevel): "ERROR" | "WARN" | "DEBUG" | "INFO" {
  return level === "error" ? "ERROR" : level === "warn" ? "WARN" : level === "debug" ? "DEBUG" : "INFO";
}

function redactLogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactLogValue);
  if (!value || typeof value !== "object") return typeof value === "string" ? redactSensitiveText(value) : value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    /token|password|secret|authorization|apiKey|credential/i.test(key) ? "[REDACTED]" : redactLogValue(entry)
  ]));
}

function redactSensitiveText(text: string): string {
  return text
    .replace(/Bearer\s+[^,\s"}]+/gi, "Bearer [REDACTED]")
    .replace(/(token|password|secret|authorization|apiKey|credential)=([^,\s"}]+)/gi, "$1=[REDACTED]");
}

function removeUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function stringField(value: unknown, key: string): string | undefined {
  const result = field(value, key);
  return typeof result === "string" ? result : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
