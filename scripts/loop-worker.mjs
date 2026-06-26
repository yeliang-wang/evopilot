import crypto from "node:crypto";

const baseUrl = (process.env.EVOPILOT_BASE_URL ?? "http://127.0.0.1:19876").replace(/\/+$/, "");
const token = process.env.EVOPILOT_API_TOKEN ?? "";
const workerId = process.env.EVOPILOT_LOOP_WORKER_ID ?? `loop-worker-${crypto.randomUUID().slice(0, 8)}`;
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

console.log(JSON.stringify({ event: "loop-worker.started", workerId, baseUrl, pollIntervalMs, leaseSeconds, once }));

let cycles = 0;
while (!stopped && cycles < maxCycles) {
  cycles += 1;
  try {
    await post("/api/v1/loops/watchdog", {});
    const loops = await get("/api/v1/loops");
    const candidate = loops.find((loop) => loop.status === "PENDING" || loop.status === "RUNNING");
    if (candidate) {
      await post("/api/v1/loop-workers/heartbeat", { loopId: candidate.id, workerId, leaseSeconds });
      const action = candidate.currentIteration === 0 ? "start" : "resume";
      const updated = await post(`/api/v1/loops/${encodeURIComponent(candidate.id)}/${action}`, {
        evidence: [`worker=${workerId}`, `cycle=${cycles}`, `action=${action}`]
      });
      console.log(JSON.stringify({
        event: "loop-worker.iteration",
        workerId,
        loopId: updated.id,
        action,
        status: updated.status,
        currentIteration: updated.currentIteration
      }));
    } else {
      console.log(JSON.stringify({ event: "loop-worker.idle", workerId, cycle: cycles }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/LOOP_APPROVAL_REQUIRED/.test(message)) {
      console.error(JSON.stringify({ event: "loop-worker.error", workerId, message }));
      if (once) process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ event: "loop-worker.waiting-approval", workerId, message }));
    }
  }
  if (once || stopped || cycles >= maxCycles) break;
  await sleep(pollIntervalMs);
}

console.log(JSON.stringify({ event: "loop-worker.stopped", workerId, cycles }));

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
    "x-evopilot-actor": workerId
  };
}

function unwrap(body) {
  return body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
