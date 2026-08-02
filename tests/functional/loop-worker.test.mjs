import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { createServer } from "../../packages/server/dist/index.js";

test("Loop worker process advances durable loops and loop soak proves runtime continuity", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-loop-worker-"));
  const server = createServer({
    dataRoot,
    runtimeMode: "debug",
    tokens: [{ name: "operator", token: "operator-token", role: "operator" }]
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const created = await post(baseUrl, "/api/v1/loops", {
      id: "worker-driven-loop",
      source: "schedule",
      objective: "Worker should advance this long-running loop.",
      stopPolicy: { maxIterations: 2, requireApprovalForRelease: false }
    });
    assert.equal(created.status, "PENDING");

    const worker = await runNodeScript("scripts/loop-worker.mjs", ["--once"], {
      EVOPILOT_BASE_URL: baseUrl,
      EVOPILOT_API_TOKEN: "operator-token",
      EVOPILOT_ACTOR: "operator",
      EVOPILOT_LOOP_WORKER_ID: "test-worker",
      EVOPILOT_LOOP_WORKER_ONCE: "1"
    });
    assert.equal(worker.code, 0, worker.stderr);
    assert.match(worker.stdout, /loop-worker.iteration/);
    const workerLogs = parseJsonLines(worker.stdout);
    const iterationLog = workerLogs.find((record) => record.event === "loop-worker.iteration");
    assert.equal(iterationLog.schema, "evopilot-log/v1");
    assert.equal(iterationLog.service, "evopilot");
    assert.equal(iterationLog.version, "1.0.4");
    assert.equal(iterationLog.category, "worker");
    assert.equal(iterationLog.severity, "INFO");
    assert.equal(iterationLog.workerId, "test-worker");
    assert.equal(iterationLog.correlation.loopId, "worker-driven-loop");

    const advanced = await get(baseUrl, "/api/v1/loops/worker-driven-loop");
    assert.equal(advanced.currentIteration, 1);
    assert.ok(advanced.artifacts.some((artifact) => artifact.label.includes("sandbox workspace")));
    assert.ok(fs.existsSync(path.join(dataRoot, "loop-workspaces", "worker-driven-loop", "iteration-1", "context")));

    await post(baseUrl, "/api/v1/loops", {
      id: "preferred-worker-loop",
      source: "schedule",
      objective: "Preferred worker should advance only this loop.",
      stopPolicy: { maxIterations: 2, requireApprovalForRelease: false }
    });
    await post(baseUrl, "/api/v1/loops", {
      id: "non-preferred-worker-loop",
      source: "schedule",
      objective: "Preferred worker must not fall back to this loop.",
      stopPolicy: { maxIterations: 2, requireApprovalForRelease: false }
    });
    const preferredWorker = await runNodeScript("scripts/loop-worker.mjs", ["--once"], {
      EVOPILOT_BASE_URL: baseUrl,
      EVOPILOT_API_TOKEN: "operator-token",
      EVOPILOT_ACTOR: "operator",
      EVOPILOT_LOOP_WORKER_ID: "preferred-test-worker",
      EVOPILOT_LOOP_WORKER_LOOP_ID: "preferred-worker-loop",
      EVOPILOT_LOOP_WORKER_ONCE: "1"
    });
    assert.equal(preferredWorker.code, 0, preferredWorker.stderr);
    const preferred = await get(baseUrl, "/api/v1/loops/preferred-worker-loop");
    const nonPreferred = await get(baseUrl, "/api/v1/loops/non-preferred-worker-loop");
    assert.equal(preferred.currentIteration, 1);
    assert.equal(nonPreferred.currentIteration, 0);

    const stalePreferredFallbackWorker = await runNodeScript("scripts/loop-worker.mjs", ["--once"], {
      EVOPILOT_BASE_URL: baseUrl,
      EVOPILOT_API_TOKEN: "operator-token",
      EVOPILOT_ACTOR: "operator",
      EVOPILOT_LOOP_WORKER_ID: "fallback-test-worker",
      EVOPILOT_LOOP_WORKER_LOOP_ID: "preferred-worker-loop",
      EVOPILOT_LOOP_WORKER_ONCE: "1"
    });
    assert.equal(stalePreferredFallbackWorker.code, 0, stalePreferredFallbackWorker.stderr);
    assert.match(stalePreferredFallbackWorker.stdout, /loop-worker.preferred-unavailable/);
    const fallbackLogs = parseJsonLines(stalePreferredFallbackWorker.stdout);
    assert.equal(fallbackLogs.find((record) => record.event === "loop-worker.preferred-unavailable")?.severity, "WARN");
    const fallbackAdvanced = await get(baseUrl, "/api/v1/loops/non-preferred-worker-loop");
    assert.equal(fallbackAdvanced.currentIteration, 1);

    await post(baseUrl, "/api/v1/loops", {
      id: "strict-non-preferred-worker-loop",
      source: "schedule",
      objective: "Strict preferred worker must stay idle when the preferred loop is unavailable.",
      stopPolicy: { maxIterations: 2, requireApprovalForRelease: false }
    });
    const strictPreferredWorker = await runNodeScript("scripts/loop-worker.mjs", ["--once"], {
      EVOPILOT_BASE_URL: baseUrl,
      EVOPILOT_API_TOKEN: "operator-token",
      EVOPILOT_ACTOR: "operator",
      EVOPILOT_LOOP_WORKER_ID: "strict-preferred-test-worker",
      EVOPILOT_LOOP_WORKER_LOOP_ID: "preferred-worker-loop",
      EVOPILOT_LOOP_WORKER_STRICT_LOOP_ID: "1",
      EVOPILOT_LOOP_WORKER_ONCE: "1"
    });
    assert.equal(strictPreferredWorker.code, 0, strictPreferredWorker.stderr);
    assert.match(strictPreferredWorker.stdout, /loop-worker.idle/);
    const strictNonPreferred = await get(baseUrl, "/api/v1/loops/strict-non-preferred-worker-loop");
    assert.equal(strictNonPreferred.currentIteration, 0);

    const reportPath = path.join(dataRoot, "loop-soak.jsonl");
    const soak = await runNodeScript("scripts/loop-soak.mjs", [], {
      EVOPILOT_BASE_URL: baseUrl,
      EVOPILOT_API_TOKEN: "operator-token",
      EVOPILOT_ACTOR: "operator",
      EVOPILOT_LOOP_SOAK_SECONDS: "1",
      EVOPILOT_LOOP_SOAK_INTERVAL_SECONDS: "1",
      EVOPILOT_LOOP_SOAK_LOOP_ID: "worker-soak-loop",
      EVOPILOT_LOOP_WORKER_LOOP_ID: "worker-soak-loop",
      EVOPILOT_LOOP_SOAK_REPORT: reportPath,
      EVOPILOT_LOOP_SOAK_MAX_ITERATIONS: "1"
    });
    assert.equal(soak.code, 0, soak.stderr);
    const report = fs.readFileSync(reportPath, "utf8");
    assert.match(report, /"event":"finished"/);
    assert.match(report, /"status":"SUCCEEDED"/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Loop worker retries transient API failures with structured diagnostics", async () => {
  let watchdogCalls = 0;
  const server = createHttpServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    if (request.method === "POST" && request.url === "/api/v1/loops/watchdog") {
      watchdogCalls += 1;
      if (watchdogCalls === 1) {
        return writeJson(response, 503, { error: "TRANSIENT_UPSTREAM_UNAVAILABLE" });
      }
      return writeJson(response, 200, { data: { released: 0, blocked: 0 } });
    }
    if (request.method === "POST" && request.url === "/api/v1/loop-workers/claim") {
      return writeJson(response, 200, {
        data: {
          schema: "evopilot-loop-worker-claim/v1",
          workerId: "retry-test-worker",
          claimed: null,
          diagnostics: ["claimable=0"]
        }
      });
    }
    return writeJson(response, 404, { error: "NOT_FOUND" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const worker = await runNodeScript("scripts/loop-worker.mjs", ["--once"], {
      EVOPILOT_BASE_URL: baseUrl,
      EVOPILOT_API_TOKEN: "operator-token",
      EVOPILOT_ACTOR: "operator",
      EVOPILOT_LOOP_WORKER_ID: "retry-test-worker",
      EVOPILOT_LOOP_WORKER_ONCE: "1",
      EVOPILOT_LOOP_WORKER_REQUEST_ATTEMPTS: "2",
      EVOPILOT_LOOP_WORKER_RETRY_BACKOFF_MS: "1"
    });
    assert.equal(worker.code, 0, worker.stderr);
    assert.equal(watchdogCalls, 2);
    const workerLogs = parseJsonLines(worker.stdout);
    const retryLog = workerLogs.find((record) => record.event === "loop-worker.request-retry");
    assert.equal(retryLog.severity, "WARN");
    assert.equal(retryLog.method, "POST");
    assert.equal(retryLog.pathname, "/api/v1/loops/watchdog");
    assert.equal(retryLog.status, 503);
    assert.equal(retryLog.nextAttempt, 2);
    assert.ok(workerLogs.some((record) => record.event === "loop-worker.idle"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Loop worker falls back to alternate API base URL when primary is unavailable", async () => {
  const server = createIdleWorkerApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const fallbackBaseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const worker = await runNodeScript("scripts/loop-worker.mjs", ["--once"], {
      EVOPILOT_BASE_URL: "http://127.0.0.1:9",
      EVOPILOT_BASE_URL_FALLBACKS: fallbackBaseUrl,
      EVOPILOT_API_TOKEN: "operator-token",
      EVOPILOT_ACTOR: "operator",
      EVOPILOT_LOOP_WORKER_ID: "fallback-url-test-worker",
      EVOPILOT_LOOP_WORKER_ONCE: "1",
      EVOPILOT_LOOP_WORKER_REQUEST_ATTEMPTS: "1",
      EVOPILOT_LOOP_WORKER_RETRY_BACKOFF_MS: "1"
    });
    assert.equal(worker.code, 0, worker.stderr);
    const workerLogs = parseJsonLines(worker.stdout);
    const retryLog = workerLogs.find((record) => record.event === "loop-worker.request-retry");
    assert.equal(retryLog.baseUrl, "http://127.0.0.1:9");
    assert.equal(retryLog.nextBaseUrl, fallbackBaseUrl);
    assert.equal(retryLog.nextAttempt, 1);
    assert.ok(workerLogs.some((record) => record.event === "loop-worker.idle"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function get(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, { headers: authHeaders() });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  return JSON.parse(text).data;
}

async function post(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  assert.ok(response.status >= 200 && response.status < 300, text);
  return JSON.parse(text).data;
}

function authHeaders() {
  return {
    authorization: "Bearer operator-token",
    "x-evopilot-actor": "operator"
  };
}

function writeJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function createIdleWorkerApiServer() {
  return createHttpServer(async (request, response) => {
    for await (const _ of request) {
      // Drain the request body before responding.
    }
    if (request.method === "POST" && request.url === "/api/v1/loops/watchdog") {
      return writeJson(response, 200, { data: { released: 0, blocked: 0 } });
    }
    if (request.method === "POST" && request.url === "/api/v1/loop-workers/claim") {
      return writeJson(response, 200, {
        data: {
          schema: "evopilot-loop-worker-claim/v1",
          workerId: "fallback-url-test-worker",
          claimed: null,
          diagnostics: ["claimable=0"]
        }
      });
    }
    return writeJson(response, 404, { error: "NOT_FOUND" });
  });
}

function runNodeScript(script, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function parseJsonLines(output) {
  return output
    .trim()
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
