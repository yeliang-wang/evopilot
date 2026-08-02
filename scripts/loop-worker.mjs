import crypto from "node:crypto";

const baseUrls = normalizeBaseUrls(process.env.EVOPILOT_BASE_URL ?? "http://127.0.0.1:19876", process.env.EVOPILOT_BASE_URL_FALLBACKS);
const baseUrl = baseUrls[0];
const token = process.env.EVOPILOT_API_TOKEN ?? process.env.EVOPILOT_ADMIN_TOKEN ?? "";
const workerId = process.env.EVOPILOT_LOOP_WORKER_ID ?? `loop-worker-${crypto.randomUUID().slice(0, 8)}`;
const actor = process.env.EVOPILOT_ACTOR ?? workerId;
const preferredLoopId = process.env.EVOPILOT_LOOP_WORKER_LOOP_ID ?? "";
const strictPreferredLoop = process.env.EVOPILOT_LOOP_WORKER_STRICT_LOOP_ID === "1" || process.env.EVOPILOT_LOOP_WORKER_STRICT_LOOP_ID === "true";
const pollIntervalMs = positiveInteger(process.env.EVOPILOT_LOOP_WORKER_POLL_MS, 2000);
const leaseSeconds = positiveInteger(process.env.EVOPILOT_LOOP_WORKER_LEASE_SECONDS, 30);
const requestTimeoutMs = positiveInteger(process.env.EVOPILOT_LOOP_WORKER_REQUEST_TIMEOUT_MS, 10000);
const requestAttempts = positiveInteger(process.env.EVOPILOT_LOOP_WORKER_REQUEST_ATTEMPTS, 3);
const requestRetryBackoffMs = positiveInteger(process.env.EVOPILOT_LOOP_WORKER_RETRY_BACKOFF_MS, 250);
const once = process.env.EVOPILOT_LOOP_WORKER_ONCE === "1" || process.argv.includes("--once");
const maxCycles = positiveInteger(process.env.EVOPILOT_LOOP_WORKER_MAX_CYCLES, once ? 1 : Number.MAX_SAFE_INTEGER);
const productVersion = process.env.EVOPILOT_PRODUCT_VERSION ?? "1.0.1";

let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopped = true;
  });
}

logInfo("loop-worker.started", {
  baseUrl,
  fallbackBaseUrls: baseUrls.slice(1).length ? baseUrls.slice(1) : undefined,
  preferredLoopId: preferredLoopId || undefined,
  strictPreferredLoop,
  pollIntervalMs,
  leaseSeconds,
  requestTimeoutMs,
  requestAttempts,
  requestRetryBackoffMs,
  once
});

let cycles = 0;
while (!stopped && cycles < maxCycles) {
  cycles += 1;
  try {
    await post("/api/v1/loops/watchdog", {});
    const candidate = await claimCandidate();
    if (candidate) {
      await post("/api/v1/loop-workers/heartbeat", { loopId: candidate.loopId, workerId, leaseSeconds });
      const action = Number(candidate.currentIteration ?? 0) === 0 ? "start" : "resume";
      const updated = await post(`/api/v1/loops/${encodeURIComponent(candidate.loopId)}/${action}`, {
        evidence: [`worker=${workerId}`, `cycle=${cycles}`, `action=${action}`]
      });
      logInfo("loop-worker.iteration", {
        loopId: updated.id,
        action,
        status: updated.status,
        currentIteration: updated.currentIteration
      });
    } else {
      logInfo("loop-worker.idle", { cycle: cycles, preferredLoopId: preferredLoopId || undefined, strictPreferredLoop });
    }
  } catch (error) {
    const detail = describeError(error);
    const message = detail.message;
    if (!/LOOP_APPROVAL_REQUIRED/.test(message)) {
      logError("loop-worker.error", detail);
      if (once) process.exitCode = 1;
    } else {
      logWarn("loop-worker.waiting-approval", detail);
    }
  }
  if (once || stopped || cycles >= maxCycles) break;
  await sleep(pollIntervalMs);
}

logInfo("loop-worker.stopped", { cycles });

async function claimCandidate() {
  if (preferredLoopId) {
    const queue = await get("/api/v1/loop-workers/queue");
    const preferred = queue.find((item) => item.loopId === preferredLoopId);
    if (!preferred) return strictPreferredLoop ? undefined : claimNextAvailable();
    if (preferred.claimable) {
      const claim = await post("/api/v1/loop-workers/claim", { workerId, leaseSeconds, loopId: preferredLoopId });
      return claim.claimed?.loopId === preferredLoopId ? claim.claimed : undefined;
    }
    if (preferred.workerLease?.workerId === workerId && ["PENDING", "RUNNING", "BLOCKED"].includes(preferred.status)) {
      return preferred;
    }
    if (strictPreferredLoop) return undefined;
    logWarn("loop-worker.preferred-unavailable", {
      preferredLoopId,
      preferredStatus: preferred.status,
      preferredClaimable: preferred.claimable
    });
    return claimNextAvailable();
  }
  return claimNextAvailable();
}

async function claimNextAvailable() {
  const claim = await post("/api/v1/loop-workers/claim", { workerId, leaseSeconds });
  return claim.claimed;
}

async function get(pathname) {
  return requestJson("GET", pathname);
}

async function post(pathname, body) {
  return requestJson("POST", pathname, body);
}

async function requestJson(method, pathname, body) {
  attemptsLoop:
  for (let attempt = 1; attempt <= requestAttempts; attempt += 1) {
    for (let index = 0; index < baseUrls.length; index += 1) {
      const currentBaseUrl = baseUrls[index];
      const url = `${currentBaseUrl}${pathname}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(url, {
          method,
          headers: { ...headers(), ...(body === undefined ? {} : { "content-type": "application/json" }) },
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
          if (index < baseUrls.length - 1 && isRetriableStatus(response.status)) {
            await retryAfter(error, attempt, baseUrls[index + 1], 0);
            continue;
          }
          if (attempt < requestAttempts && isRetriableStatus(response.status)) {
            await retryAfter(error, attempt, baseUrls[0]);
            continue attemptsLoop;
          }
          throw error;
        }
        return unwrap(text ? JSON.parse(text) : {});
      } catch (error) {
        const enriched = enrichRequestError(error, method, pathname, attempt, currentBaseUrl);
        if (index < baseUrls.length - 1 && isRetriableRequestError(enriched)) {
          await retryAfter(enriched, attempt, baseUrls[index + 1], 0);
          continue;
        }
        if (attempt < requestAttempts && isRetriableRequestError(enriched)) {
          await retryAfter(enriched, attempt, baseUrls[0]);
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
    attempts: requestAttempts
  });
}

async function retryAfter(error, attempt, nextBaseUrl, backoffMs = requestRetryBackoffMs * 2 ** Math.max(0, attempt - 1)) {
  logWarn("loop-worker.request-retry", {
    ...describeError(error),
    attempt,
    nextAttempt: backoffMs > 0 ? attempt + 1 : attempt,
    nextBaseUrl,
    maxAttempts: requestAttempts,
    backoffMs
  });
  if (backoffMs > 0) await sleep(backoffMs);
}

function headers() {
  return {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    "x-evopilot-actor": actor
  };
}

function unwrap(body) {
  return body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function normalizeBaseUrls(primary, fallbacks) {
  const values = [primary, ...String(fallbacks ?? "").split(",")]
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return [...new Set(values)].length ? [...new Set(values)] : ["http://127.0.0.1:19876"];
}

function enrichRequestError(error, method, pathname, attempts, baseUrl) {
  if (error && typeof error === "object") {
    error.method ??= method;
    error.pathname ??= pathname;
    error.baseUrl ??= baseUrl;
    error.attempts ??= attempts;
    return error;
  }
  return Object.assign(new Error(String(error)), {
    name: "WorkerRequestError",
    method,
    pathname,
    baseUrl,
    attempts
  });
}

function isRetriableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function isRetriableRequestError(error) {
  if (typeof error.status === "number") return isRetriableStatus(error.status);
  const code = error.code ?? error.cause?.code;
  const name = error.name ?? error.cause?.name;
  const message = error.message ?? "";
  return /AbortError|TimeoutError/i.test(String(name))
    || /fetch failed|network|terminated|socket|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|UND_ERR/i.test(String(message))
    || /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|UND_ERR/i.test(String(code));
}

function describeError(error) {
  const source = error && typeof error === "object" ? error : {};
  const cause = source.cause && typeof source.cause === "object" ? source.cause : {};
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
    stack: process.env.EVOPILOT_LOOP_WORKER_LOG_STACK === "1" ? source.stack : undefined
  });
}

function truncate(text, maxLength = 2000) {
  return String(text ?? "").length > maxLength ? `${String(text).slice(0, maxLength)}...` : String(text ?? "");
}

function logInfo(event, record = {}) {
  writeWorkerLog("info", event, record);
}

function logWarn(event, record = {}) {
  writeWorkerLog("warn", event, record);
}

function logError(event, record = {}) {
  writeWorkerLog("error", event, record);
}

function writeWorkerLog(level, event, record) {
  const redacted = redactLogValue(record);
  const line = JSON.stringify(removeUndefined({
    timestamp: new Date().toISOString(),
    schema: "evopilot-log/v1",
    service: "evopilot",
    version: productVersion,
    severity: logSeverity(level),
    level,
    category: "worker",
    event,
    workerId,
    ...redacted,
    correlation: redacted.loopId ? { loopId: redacted.loopId } : undefined
  }));
  if (level === "error") console.error(line);
  else console.log(line);
}

function logSeverity(level) {
  return level === "error" ? "ERROR" : level === "warn" ? "WARN" : level === "debug" ? "DEBUG" : "INFO";
}

function redactLogValue(value) {
  if (Array.isArray(value)) return value.map(redactLogValue);
  if (!value || typeof value !== "object") return typeof value === "string" ? redactSensitiveText(value) : value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    /token|password|secret|authorization|apiKey|credential/i.test(key) ? "[REDACTED]" : redactLogValue(entry)
  ]));
}

function redactSensitiveText(text) {
  return text
    .replace(/Bearer\s+[^,\s"}]+/gi, "Bearer [REDACTED]")
    .replace(/(token|password|secret|authorization|apiKey|credential)=([^,\s"}]+)/gi, "$1=[REDACTED]");
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
