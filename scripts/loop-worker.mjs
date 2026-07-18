import crypto from "node:crypto";

const baseUrl = (process.env.EVOPILOT_BASE_URL ?? "http://127.0.0.1:19876").replace(/\/+$/, "");
const token = process.env.EVOPILOT_API_TOKEN ?? process.env.EVOPILOT_ADMIN_TOKEN ?? "";
const workerId = process.env.EVOPILOT_LOOP_WORKER_ID ?? `loop-worker-${crypto.randomUUID().slice(0, 8)}`;
const actor = process.env.EVOPILOT_ACTOR ?? workerId;
const preferredLoopId = process.env.EVOPILOT_LOOP_WORKER_LOOP_ID ?? "";
const strictPreferredLoop = process.env.EVOPILOT_LOOP_WORKER_STRICT_LOOP_ID === "1" || process.env.EVOPILOT_LOOP_WORKER_STRICT_LOOP_ID === "true";
const pollIntervalMs = positiveInteger(process.env.EVOPILOT_LOOP_WORKER_POLL_MS, 2000);
const leaseSeconds = positiveInteger(process.env.EVOPILOT_LOOP_WORKER_LEASE_SECONDS, 30);
const once = process.env.EVOPILOT_LOOP_WORKER_ONCE === "1" || process.argv.includes("--once");
const maxCycles = positiveInteger(process.env.EVOPILOT_LOOP_WORKER_MAX_CYCLES, once ? 1 : Number.MAX_SAFE_INTEGER);

let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopped = true;
  });
}

logInfo("loop-worker.started", { baseUrl, preferredLoopId: preferredLoopId || undefined, strictPreferredLoop, pollIntervalMs, leaseSeconds, once });

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
    const message = error instanceof Error ? error.message : String(error);
    if (!/LOOP_APPROVAL_REQUIRED/.test(message)) {
      logError("loop-worker.error", { message, error: message });
      if (once) process.exitCode = 1;
    } else {
      logWarn("loop-worker.waiting-approval", { message });
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
  const response = await fetch(`${baseUrl}${pathname}`, { headers: headers() });
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}: ${text}`);
  const body = text ? JSON.parse(text) : {};
  return unwrap(body);
}

async function post(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}: ${text}`);
  return unwrap(text ? JSON.parse(text) : {});
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
    version: "1.0.0",
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
