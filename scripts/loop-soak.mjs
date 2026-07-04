import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const baseUrl = (process.env.EVOPILOT_BASE_URL ?? "http://127.0.0.1:19876").replace(/\/+$/, "");
const token = process.env.EVOPILOT_API_TOKEN ?? "";
const actor = process.env.EVOPILOT_ACTOR ?? "operator";
const durationSeconds = positiveInteger(process.env.EVOPILOT_LOOP_SOAK_SECONDS, 24 * 60 * 60);
const intervalSeconds = positiveInteger(process.env.EVOPILOT_LOOP_SOAK_INTERVAL_SECONDS, 30);
const loopId = process.env.EVOPILOT_LOOP_SOAK_LOOP_ID ?? `loop-soak-${new Date().toISOString().replace(/[^0-9A-Za-z]+/g, "-")}`;
const reportPath = process.env.EVOPILOT_LOOP_SOAK_REPORT ?? `data/production-lifecycle/evopilot-loop-runtime/${loopId}.jsonl`;
const workerCommand = process.env.EVOPILOT_LOOP_SOAK_WORKER_COMMAND ?? "node scripts/loop-worker.mjs --once";

fs.mkdirSync(path.dirname(reportPath), { recursive: true });

const startedAt = new Date();
const deadline = startedAt.getTime() + durationSeconds * 1000;
append({ event: "started", loopId, baseUrl, durationSeconds, intervalSeconds, workerCommand, startedAt: startedAt.toISOString() });

let loop = await ensureLoop();
let checks = 0;
let failures = 0;

while (Date.now() < deadline) {
  checks += 1;
  try {
    const worker = await runWorker();
    loop = await get(`/api/v1/loops/${encodeURIComponent(loopId)}`);
    const timeline = await get(`/api/v1/loops/${encodeURIComponent(loopId)}/timeline`);
    const evidence = await get(`/api/v1/loops/${encodeURIComponent(loopId)}/evidence`);
    append({
      event: "check.passed",
      checks,
      at: new Date().toISOString(),
      worker,
      status: loop.status,
      currentIteration: loop.currentIteration,
      timelineCount: timeline.length,
      evidenceCount: evidence.length
    });
    if (["SUCCEEDED", "BLOCKED", "WAITING_APPROVAL", "FAILED", "CANCELLED"].includes(loop.status)) break;
  } catch (error) {
    failures += 1;
    append({ event: "check.failed", checks, failures, at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
  }
  if (Date.now() < deadline) await sleep(Math.min(intervalSeconds * 1000, Math.max(0, deadline - Date.now())));
}

loop = await get(`/api/v1/loops/${encodeURIComponent(loopId)}`);
const finalTimeline = await get(`/api/v1/loops/${encodeURIComponent(loopId)}/timeline`);
const finalEvidence = await get(`/api/v1/loops/${encodeURIComponent(loopId)}/evidence`);
const finishedAt = new Date();
const status = failures === 0 && finalTimeline.length > 0 && finalEvidence.length > 0 ? "SUCCEEDED" : "FAILED";
append({
  event: "finished",
  status,
  loopId,
  loopStatus: loop.status,
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  durationSeconds: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
  checks,
  failures,
  currentIteration: loop.currentIteration,
  timelineCount: finalTimeline.length,
  evidenceCount: finalEvidence.length
});

if (status !== "SUCCEEDED") process.exit(2);

async function ensureLoop() {
  const existing = await fetchJson(`/api/v1/loops/${encodeURIComponent(loopId)}`, undefined, false);
  if (existing) return existing;
  return post("/api/v1/loops", {
    id: loopId,
    source: "schedule",
    projectId: "evopilot",
    objective: "Run EvoPilot Loop Runtime soak with worker lease, watchdog, timeline, evidence, and artifacts.",
    stopPolicy: {
      maxIterations: positiveInteger(process.env.EVOPILOT_LOOP_SOAK_MAX_ITERATIONS, 2),
      maxDurationSeconds: durationSeconds + 300,
      requireApprovalForRelease: false,
      stopOnRepeatedFailure: 2
    },
    retryPolicy: {
      maxAttemptsPerNode: 2,
      backoffSeconds: 1,
      circuitBreakerFailures: 2
    },
    context: { soak: true, reportPath }
  });
}

function runWorker() {
  return new Promise((resolve) => {
    const started = new Date();
    const [command, ...args] = splitCommand(workerCommand);
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, EVOPILOT_BASE_URL: baseUrl, EVOPILOT_API_TOKEN: token, EVOPILOT_ACTOR: actor, EVOPILOT_LOOP_WORKER_ONCE: "1" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 12000) stdout = stdout.slice(-12000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });
    child.on("close", (code, signal) => {
      const finished = new Date();
      resolve({
        command: workerCommand,
        status: code === 0 ? "PASSED" : "FAILED",
        exitCode: code,
        signal,
        startedAt: started.toISOString(),
        finishedAt: finished.toISOString(),
        durationMs: finished.getTime() - started.getTime(),
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

async function get(pathname) {
  return fetchJson(pathname, undefined, true);
}

async function post(pathname, body) {
  return fetchJson(pathname, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }, true);
}

async function fetchJson(pathname, options, required) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...(options ?? {}),
    headers: {
      ...(options?.headers ?? {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "x-evopilot-actor": actor
    }
  });
  const text = await response.text();
  if (!response.ok) {
    if (!required && response.status === 404) return undefined;
    throw new Error(`${pathname} returned ${response.status}: ${text}`);
  }
  return unwrap(text ? JSON.parse(text) : {});
}

function unwrap(body) {
  return body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
}

function append(record) {
  fs.appendFileSync(reportPath, `${JSON.stringify(record)}\n`, "utf8");
}

function splitCommand(command) {
  return command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((item) => item.replace(/^"|"$/g, "")) ?? ["node", "scripts/loop-worker.mjs", "--once"];
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
