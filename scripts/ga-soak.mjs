import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

loadEnvFile(process.env.EVOPILOT_LLM_ENV_FILE ?? "data/evopilot/llm.env");
loadEnvFile(process.env.EVOPILOT_PRODUCTION_E2E_ENV_FILE ?? "data/evopilot/production-e2e.env");

const baseUrl = process.env.EVOPILOT_BASE_URL ?? "http://127.0.0.1:19876";
const codeUpgraderUrl = process.env.EVOPILOT_CODE_UPGRADER_URL ?? process.env.EVOPILOT_CODE_UPGRADER_BASE_URL ?? "http://127.0.0.1:3000";
const token = process.env.EVOPILOT_API_TOKEN ?? "evopilot-48h-local-token";
const durationSeconds = positiveInteger(process.env.EVOPILOT_GA_SOAK_SECONDS, 5400);
const intervalSeconds = positiveInteger(process.env.EVOPILOT_GA_SOAK_INTERVAL_SECONDS, 60);
const minProjects = positiveInteger(process.env.EVOPILOT_GA_SOAK_MIN_PROJECTS, 5);
const minSuccessfulRuns = positiveInteger(process.env.EVOPILOT_GA_SOAK_MIN_SUCCESSFUL_RUNS, 5);
const requireActivity = process.env.EVOPILOT_GA_SOAK_REQUIRE_ACTIVITY !== "false";
const minRunDelta = nonNegativeInteger(process.env.EVOPILOT_GA_SOAK_MIN_RUN_DELTA, 5);
const minCodeUpgradeDelta = nonNegativeInteger(process.env.EVOPILOT_GA_SOAK_MIN_CODE_UPGRADE_DELTA, 5);
const minPipelineDelta = nonNegativeInteger(process.env.EVOPILOT_GA_SOAK_MIN_PIPELINE_DELTA, 5);
const workloadCommand = process.env.EVOPILOT_GA_SOAK_WORKLOAD_COMMAND?.trim();
const workloadIntervalSeconds = positiveInteger(process.env.EVOPILOT_GA_SOAK_WORKLOAD_INTERVAL_SECONDS, Math.max(intervalSeconds, 5 * 60));
const workloadTimeoutMs = positiveInteger(process.env.EVOPILOT_GA_SOAK_WORKLOAD_TIMEOUT_MS, 30 * 60 * 1000);
const reportId = safeId(process.env.EVOPILOT_GA_SOAK_REPORT_ID ?? `ga-soak-${new Date().toISOString()}`);
const logPath = process.env.EVOPILOT_GA_SOAK_LOG ?? `data/production-lifecycle/evopilot-ga-release-matrix/${reportId}.jsonl`;

const startedAt = new Date();
const deadline = startedAt.getTime() + durationSeconds * 1000;
let checks = 0;
let failures = 0;
let lastSummary;
let baselineSummary;
let nextWorkloadAt = workloadCommand ? startedAt.getTime() : Number.POSITIVE_INFINITY;
const workloadRuns = [];

fs.mkdirSync(path.dirname(logPath), { recursive: true });
append({
  event: "started",
  reportId,
  startedAt: startedAt.toISOString(),
  durationSeconds,
  intervalSeconds,
  baseUrl,
  codeUpgraderUrl,
  requireActivity,
  activityThresholds: { minRunDelta, minCodeUpgradeDelta, minPipelineDelta },
  workload: workloadCommand ? { command: workloadCommand, intervalSeconds: workloadIntervalSeconds, timeoutMs: workloadTimeoutMs } : undefined
});

while (Date.now() < deadline) {
  checks += 1;
  try {
    if (!baselineSummary) {
      baselineSummary = compactSummary(await get("/api/v1/summary"));
      append({ event: "baseline.captured", at: new Date().toISOString(), summary: baselineSummary });
    }
    if (workloadCommand && Date.now() >= nextWorkloadAt) {
      const workload = await runWorkload(workloadCommand);
      workloadRuns.push(workload);
      append({ event: "workload.completed", at: new Date().toISOString(), workload });
      if (workload.status !== "PASSED") throw new Error(`workload failed: ${workload.command} exited ${workload.exitCode}`);
      nextWorkloadAt = Date.now() + workloadIntervalSeconds * 1000;
    }
    const codeUpgrader = await fetchJson(`${codeUpgraderUrl.replace(/\/+$/, "")}/health`);
    const evopilot = await fetchJson(`${baseUrl.replace(/\/+$/, "")}/health`);
    const ready = await fetchJson(`${baseUrl.replace(/\/+$/, "")}/ready`);
    const summary = await get("/api/v1/summary");
    lastSummary = compactSummary(summary);
    assertSoakHealthy({ codeUpgrader, evopilot, ready, summary: lastSummary });
    append({
      event: "check.passed",
      at: new Date().toISOString(),
      checks,
      remainingSeconds: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
      codeUpgrader,
      evopilot,
      ready,
      summary: lastSummary
    });
  } catch (error) {
    failures += 1;
    append({
      event: "check.failed",
      at: new Date().toISOString(),
      checks,
      failures,
      error: error instanceof Error ? error.message : String(error),
      summary: lastSummary
    });
  }
  if (Date.now() < deadline) await sleep(Math.min(intervalSeconds * 1000, Math.max(0, deadline - Date.now())));
}

const finishedAt = new Date();
if (failures > 0) {
  append({ event: "finished", status: "FAILED", reportId, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), durationSeconds, checks, failures, summary: lastSummary });
  process.exit(2);
}
const activity = activityDeltas(baselineSummary, lastSummary);
if (requireActivity && !hasRequiredActivity(activity)) {
  append({
    event: "finished",
    status: "FAILED",
    reason: "NO_ACTIVE_WORKLOAD",
    reportId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSeconds,
    checks,
    failures,
    baselineSummary,
    finalSummary: lastSummary,
    activity,
    workload: workloadCommand ? { command: workloadCommand, runs: workloadRuns } : undefined,
    activityThresholds: { minRunDelta, minCodeUpgradeDelta, minPipelineDelta }
  });
  console.error(JSON.stringify({
    status: "FAILED",
    reason: "NO_ACTIVE_WORKLOAD",
    message: "GA soak observed service health only; no successful active workload delta met the configured thresholds.",
    activity,
    activityThresholds: { minRunDelta, minCodeUpgradeDelta, minPipelineDelta },
    logPath
  }, null, 2));
  process.exit(2);
}

const report = await post("/api/v1/soak-reports", {
  id: reportId,
  name: "GA Real Service Soak",
  durationSeconds,
  status: "SUCCEEDED",
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  summary: {
    checks,
    failures,
    baseUrl,
    codeUpgraderUrl,
    minProjects,
    minSuccessfulRuns,
    requireActivity,
    activity,
    workload: workloadCommand ? { command: workloadCommand, runs: workloadRuns } : undefined,
    latestSummary: lastSummary,
    evidenceRule: "Report is written only after continuous live EvoPilot and code-upgrader probes pass for the requested duration and active workload counters meet the configured thresholds."
  }
});
append({ event: "finished", status: "SUCCEEDED", reportId: report.id, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), durationSeconds, checks, failures });
console.log(JSON.stringify({ status: "SUCCEEDED", reportId: report.id, durationSeconds, checks, logPath }, null, 2));

async function get(pathname) {
  return unwrap(await fetchJson(`${baseUrl.replace(/\/+$/, "")}${pathname}`, token));
}

async function post(pathname, body) {
  return unwrap(await fetchJson(`${baseUrl.replace(/\/+$/, "")}${pathname}`, token, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" }
  }));
}

function assertSoakHealthy({ codeUpgrader, evopilot, ready, summary }) {
  if (codeUpgrader.status !== "UP") throw new Error(`code-upgrader health=${codeUpgrader.status}`);
  if (evopilot.status !== "UP") throw new Error(`evopilot health=${evopilot.status}`);
  if (ready.status !== "READY") throw new Error(`evopilot ready=${ready.status}`);
  if (Number(summary.projectCount ?? 0) < minProjects) throw new Error(`projectCount ${summary.projectCount} < ${minProjects}`);
  if (Number(summary.successfulEvolutionBatchCount ?? 0) < minSuccessfulRuns) throw new Error(`successfulEvolutionBatchCount ${summary.successfulEvolutionBatchCount} < ${minSuccessfulRuns}`);
  if (Number(summary.releaseBlockedCount ?? 0) > 0) throw new Error(`releaseBlockedCount=${summary.releaseBlockedCount}`);
  if (Number(summary.failedPolicyCount ?? 0) > 0) throw new Error(`failedPolicyCount=${summary.failedPolicyCount}`);
}

function compactSummary(summary) {
  return {
    projectCount: summary.projectCount,
    runCount: summary.runCount,
    evaluationDatasetCount: summary.evaluationDatasetCount,
    opportunityCount: summary.opportunityCount,
    successfulEvolutionBatchCount: summary.successfulEvolutionBatchCount,
    codeUpgradeCount: summary.codeUpgradeCount,
    pipelineCount: summary.pipelineCount,
    releaseReadyCount: summary.releaseReadyCount,
    releaseBlockedCount: summary.releaseBlockedCount,
    failedPolicyCount: summary.failedPolicyCount,
    releaseReadinessScore: summary.releaseReadinessScore,
    latestReleaseDecision: summary.latestReleaseDecision ? {
      id: summary.latestReleaseDecision.id,
      status: summary.latestReleaseDecision.status,
      generatedAt: summary.latestReleaseDecision.generatedAt
    } : undefined
  };
}

function activityDeltas(before, after) {
  return {
    runDelta: Number(after?.runCount ?? 0) - Number(before?.runCount ?? 0),
    codeUpgradeDelta: Number(after?.codeUpgradeCount ?? 0) - Number(before?.codeUpgradeCount ?? 0),
    pipelineDelta: Number(after?.pipelineCount ?? 0) - Number(before?.pipelineCount ?? 0),
    successfulEvolutionBatchDelta: Number(after?.successfulEvolutionBatchCount ?? 0) - Number(before?.successfulEvolutionBatchCount ?? 0)
  };
}

function hasRequiredActivity(activity) {
  return activity.runDelta >= minRunDelta &&
    activity.codeUpgradeDelta >= minCodeUpgradeDelta &&
    activity.pipelineDelta >= minPipelineDelta;
}

function runWorkload(command) {
  const started = new Date();
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        EVOPILOT_BASE_URL: baseUrl,
        EVOPILOT_API_TOKEN: token
      },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, workloadTimeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 20000) stdout = stdout.slice(-20000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      const finished = new Date();
      resolve({
        command,
        status: code === 0 ? "PASSED" : "FAILED",
        exitCode: code,
        signal,
        startedAt: started.toISOString(),
        finishedAt: finished.toISOString(),
        durationMs: finished.getTime() - started.getTime(),
        stdout: redactSensitiveText(stdout.trim()),
        stderr: redactSensitiveText(stderr.trim())
      });
    });
  });
}

async function fetchJson(url, tokenValue, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(tokenValue ? { authorization: `Bearer ${tokenValue}`, "x-evopilot-actor": "ga-soak-governor" } : {})
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function unwrap(body) {
  return body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
}

function append(record) {
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

function redactSensitiveText(text) {
  return text
    .replace(/glpat-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/(token|password|secret|credential|api[_-]?key)([=:\s]+)([^\\s"',}]+)/gi, "$1$2[REDACTED]");
}

function loadEnvFile(file) {
  if (!file || !fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const raw = trimmed.slice(index + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, "");
  }
}
