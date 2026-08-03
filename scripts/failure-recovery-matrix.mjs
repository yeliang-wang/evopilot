import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const reportDir = path.join(process.cwd(), "dist", "test-matrix");
const reportPath = path.join(reportDir, "failure-recovery-matrix.json");
const startedAt = new Date().toISOString();

const scenarios = [
  {
    id: "auth-request-id",
    layer: "control-plane",
    command: "node --test tests/failure-recovery/control-plane-failure-recovery.test.mjs",
    evidence: ["401 protected API", "x-request-id", "UNAUTHORIZED"]
  },
  {
    id: "source-credential-preflight",
    layer: "control-plane",
    command: "node --test tests/failure-recovery/control-plane-failure-recovery.test.mjs",
    evidence: ["evopilot-source-credential-readiness/v1", "READ_ONLY", "connect-github-account"]
  },
  {
    id: "devops-preflight",
    layer: "control-plane",
    command: "node --test tests/failure-recovery/control-plane-failure-recovery.test.mjs",
    evidence: ["evopilot-project-devops-readiness/v1", "BLOCKED", "configure-devops"]
  },
  {
    id: "explicit-llm-profile-blocker",
    layer: "control-plane",
    command: "node --test tests/failure-recovery/control-plane-failure-recovery.test.mjs",
    evidence: ["LLM_PROFILE_NOT_READY", "evopilot-llm-profile-readiness/v1", "configure-llm-profile"]
  },
  {
    id: "source-closure-preflight",
    layer: "release-writeback",
    command: "node --test tests/failure-recovery/control-plane-failure-recovery.test.mjs",
    evidence: ["evopilot-source-closure-preflight/v1", "FAIL", "repair-credentials"]
  },
  {
    id: "worker-transient-retry",
    layer: "worker-runtime",
    command: "node --test tests/functional/loop-worker.test.mjs",
    evidence: ["loop-worker.request-retry", "503", "nextAttempt"]
  },
  {
    id: "worker-base-url-fallback",
    layer: "worker-runtime",
    command: "node --test tests/functional/loop-worker.test.mjs",
    evidence: ["EVOPILOT_BASE_URL_FALLBACKS", "nextBaseUrl", "loop-worker.idle"]
  }
];

fs.mkdirSync(reportDir, { recursive: true });

const build = run(npmCommand(), ["run", "build"]);
let tests = { status: "SKIPPED", code: 1, stdout: "", stderr: "" };
if (build.code === 0) {
  tests = run(process.execPath, [
    "--test",
    "tests/failure-recovery/control-plane-failure-recovery.test.mjs",
    "tests/functional/loop-worker.test.mjs"
  ]);
}

const finishedAt = new Date().toISOString();
const status = build.code === 0 && tests.code === 0 ? "PASS" : "FAIL";
const report = {
  schema: "evopilot-failure-recovery-matrix/v1",
  status,
  startedAt,
  finishedAt,
  scenarios,
  commands: [
    {
      name: "build",
      command: "npm run build",
      exitCode: build.code,
      stdout: tail(build.stdout),
      stderr: tail(build.stderr)
    },
    {
      name: "failure-recovery-tests",
      command: "node --test tests/failure-recovery/control-plane-failure-recovery.test.mjs tests/functional/loop-worker.test.mjs",
      exitCode: tests.code,
      stdout: tail(tests.stdout),
      stderr: tail(tests.stderr)
    }
  ],
  reportPath
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Failure recovery matrix ${status}: ${reportPath}`);
if (status !== "PASS") process.exit(tests.code || build.code || 1);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function tail(value, maxLines = 80) {
  return value.split(/\r?\n/).slice(-maxLines).join("\n").trim();
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}
