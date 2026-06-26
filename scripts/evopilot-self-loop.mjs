#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const baseUrl = trimTrailingSlash(process.env.EVOPILOT_BASE_URL ?? "http://127.0.0.1:19876");
const token = process.env.EVOPILOT_API_TOKEN;
const repoRoot = path.resolve(process.env.EVOPILOT_SELF_REPO_ROOT ?? process.cwd());
const projectId = process.env.EVOPILOT_SELF_PROJECT_ID ?? "evopilot-self";
const loopId = process.env.EVOPILOT_SELF_LOOP_ID ?? "evopilot-self-executor-adapter-contract";
const startLoop = parseBoolean(process.env.EVOPILOT_SELF_LOOP_START, false);

if (!token) fail("EVOPILOT_API_TOKEN is required.");
if (!fs.existsSync(path.join(repoRoot, "package.json"))) {
  fail(`EVOPILOT_SELF_REPO_ROOT must point to an EvoPilot checkout with package.json: ${repoRoot}`);
}

const safetyBoundary = {
  controllerProjectId: projectId,
  targetProjectId: projectId,
  mode: "controlled-self-loop",
  allowedPaths: [
    "packages/server",
    "packages/core",
    "scripts",
    "tests/functional",
    "docs/architecture",
    "README.md",
    "docs/user-guide.md"
  ],
  validationCommands: [
    "npm run loop-runtime:check",
    "npm run check",
    "git diff --check"
  ],
  approvalRequired: true,
  nonGoals: [
    "No automatic merge, tag, release promotion, or push.",
    "No mutation of the currently running controller process.",
    "No production code-upgrader execution until an ExecutorAdapter contract is approved."
  ]
};

const project = await ensureSelfProject();
const evidence = await post("/api/v1/evidence/events", {
  projectId,
  now: new Date().toISOString(),
  events: [
    {
      type: "opportunity.discovered",
      source: "agent",
      name: "executor-adapter-runtime-gap",
      severity: "HIGH",
      message: "Introduce an ExecutorAdapter contract for the EvoPilot self-loop.",
      module: "loop-runtime",
      attributes: {
        projectId,
        loopId,
        capabilityGap: "executor-adapter-contract",
        summary: "Loop Runtime has durable state, approval, evidence, watchdog, and retry controls; the next product gap is binding executor graph nodes to real, approved adapters without uncontrolled self-modification.",
        safetyBoundary
      }
    }
  ],
  files: [
    "packages/server/src/index.ts",
    "scripts/loop-worker.mjs",
    "docs/architecture/loop-runtime.md"
  ]
});

const loop = await ensureSelfLoop();
const startedLoop = startLoop && loop.status === "PENDING"
  ? await post(`/api/v1/loops/${encodeURIComponent(loop.id)}/start`, {
      evidence: [
        `selfProject=${project.id}`,
        `selfEvidenceRun=${evidence.run?.id ?? "unknown"}`,
        "Controlled self-loop started by scripts/evopilot-self-loop.mjs."
      ]
    })
  : undefined;

console.log(JSON.stringify({
  schema: "evopilot-self-loop-result/v1",
  baseUrl,
  projectId: project.id,
  projectValidation: project.validation,
  evidenceRunId: evidence.run?.id,
  ingestedEvents: evidence.ingestedEvents,
  loopId: loop.id,
  loopStatus: (startedLoop ?? loop).status,
  started: Boolean(startedLoop),
  safetyBoundary,
  nextCommands: [
    "npm run loop-runtime:check",
    "npm run check",
    `curl -H "Authorization: Bearer $EVOPILOT_API_TOKEN" ${baseUrl}/api/v1/loops/${encodeURIComponent(loop.id)}`
  ]
}, null, 2));

async function ensureSelfProject() {
  const projects = await get("/api/v1/projects");
  const existing = projects.find((item) => item.id === projectId);
  if (existing?.repository?.provider === "local-git" && existing.repository.root === repoRoot && existing.validation?.status === "VERIFIED") {
    return existing;
  }
  return post("/api/v1/projects", {
    id: projectId,
    name: "EvoPilot Self",
    profileId: "evopilot-self",
    repository: {
      provider: "local-git",
      root: repoRoot,
      defaultBranch: "main"
    }
  });
}

async function ensureSelfLoop() {
  const existing = await get(`/api/v1/loops/${encodeURIComponent(loopId)}`, { allowNotFound: true });
  if (existing) return existing;
  return post("/api/v1/loops", {
    id: loopId,
    source: "api",
    projectId,
    objective: "Introduce an approved ExecutorAdapter contract so EvoPilot can run its own improvement loop through real executor boundaries.",
    stopPolicy: {
      maxIterations: 2,
      maxDurationSeconds: 86400,
      requireApprovalForRelease: true,
      stopOnRepeatedFailure: 2
    },
    retryPolicy: {
      maxAttemptsPerNode: 1,
      backoffSeconds: 30,
      circuitBreakerFailures: 2
    },
    context: {
      productIdea: "EvoPilot is connected as a target project of EvoPilot, with controller and target boundaries preserved.",
      safetyBoundary,
      nextMilestone: "Define and validate the ExecutorAdapter contract before enabling real code-upgrader execution."
    }
  });
}

async function get(endpoint, options = {}) {
  return request("GET", endpoint, undefined, options);
}

async function post(endpoint, body) {
  return request("POST", endpoint, body);
}

async function request(method, endpoint, body, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "x-evopilot-actor": "evopilot-self-loop",
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (options.allowNotFound && response.status === 404) return undefined;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.detail ? `: ${payload.detail}` : "";
    fail(`${method} ${endpoint} failed with ${response.status} ${payload.error ?? response.statusText}${detail}`);
  }
  return payload.data;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function fail(message) {
  console.error(`[evopilot-self-loop] ${message}`);
  process.exit(1);
}
