#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EVOPILOT_VERSION = "1.1.1";
const DASHBOARD_VERSION = "1.0.8";

type ParsedArgs = {
  command: string | null;
  dir: string;
  force: boolean;
  evopilotImage: string;
  dashboardImage: string;
  dashboardPort: string;
  apiPort: string;
  initEnv: boolean;
  start: boolean;
  skipVerify: boolean;
};

function main(argv: string[]): void {
  const args = parseArgs(argv);
  if (!args.command || args.command === "help" || has(argv, "--help") || has(argv, "-h")) {
    printHelp();
    return;
  }
  if (args.command !== "self-host") {
    fail(`Unknown command: ${args.command}`);
  }

  const targetDir = path.resolve(args.dir);
  fs.mkdirSync(targetDir, { recursive: true });
  writeStack(targetDir, args);
  if (args.start) {
    startStack(targetDir, args);
  } else {
    printNextSteps(targetDir, args);
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv.find((item) => !item.startsWith("-")) ?? null;
  const get = (name: string, fallback: string): string => {
    const index = argv.indexOf(name);
    if (index >= 0) {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) fail(`${name} requires a value`);
      return value;
    }
    const prefix = `${name}=`;
    const match = argv.find((item) => item.startsWith(prefix));
    return match ? match.slice(prefix.length) : fallback;
  };

  return {
    command,
    dir: get("--dir", "evopilot-stack"),
    force: has(argv, "--force"),
    evopilotImage: get("--evopilot-image", `ghcr.io/yeliang-wang/evopilot:${EVOPILOT_VERSION}`),
    dashboardImage: get("--dashboard-image", `ghcr.io/yeliang-wang/evopilot-dashboard:${DASHBOARD_VERSION}`),
    dashboardPort: get("--dashboard-port", "8080"),
    apiPort: get("--api-port", "19876"),
    initEnv: has(argv, "--init-env") || has(argv, "--start"),
    start: has(argv, "--start"),
    skipVerify: has(argv, "--skip-verify")
  };
}

function has(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function writeStack(targetDir: string, args: ParsedArgs): void {
  writeFile(targetDir, "compose.yaml", composeYaml(args), args.force);
  writeFile(targetDir, ".env.example", envExample(args), args.force);
  if (args.initEnv) {
    writeRuntimeEnv(targetDir, args);
  }
  writeFile(targetDir, "README.md", stackReadme(args), args.force);
  writeFile(targetDir, "verify.sh", verifyScript(args), args.force, 0o755);
}

function writeFile(targetDir: string, relativePath: string, content: string, force: boolean, mode?: number): void {
  const filePath = path.join(targetDir, relativePath);
  if (fs.existsSync(filePath) && !force) {
    fail(`${relativePath} already exists in ${targetDir}. Re-run with --force to overwrite generated files.`);
  }
  fs.writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode });
}

function writeRuntimeEnv(targetDir: string, args: ParsedArgs): void {
  const filePath = path.join(targetDir, ".env");
  if (fs.existsSync(filePath) && !args.force) {
    return;
  }
  fs.writeFileSync(filePath, runtimeEnv(args), { mode: 0o600 });
}

function composeYaml(args: ParsedArgs): string {
  return `name: evopilot

services:
  evopilot-postgres:
    image: \${EVOPILOT_POSTGRES_IMAGE:-docker.m.daocloud.io/library/postgres:16-alpine}
    environment:
      POSTGRES_DB: \${EVOPILOT_POSTGRES_DB:-evopilot}
      POSTGRES_USER: \${EVOPILOT_POSTGRES_USER:-evopilot}
      POSTGRES_PASSWORD: \${EVOPILOT_POSTGRES_PASSWORD:?set EVOPILOT_POSTGRES_PASSWORD in .env}
    volumes:
      - evopilot-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${EVOPILOT_POSTGRES_USER:-evopilot} -d \${EVOPILOT_POSTGRES_DB:-evopilot}"]
      interval: 10s
      timeout: 5s
      retries: 12
    restart: unless-stopped

  evopilot-server:
    image: \${EVOPILOT_IMAGE:-${args.evopilotImage}}
    depends_on:
      evopilot-postgres:
        condition: service_healthy
      evopilot-code-upgrader:
        condition: service_started
    env_file:
      - .env
    environment:
      EVOPILOT_HOST: 0.0.0.0
      EVOPILOT_PORT: "19876"
      EVOPILOT_RUN_MODE: prod
      EVOPILOT_DATA_ROOT: /var/lib/evopilot
      EVOPILOT_CODE_UPGRADER_BASE_URL: http://evopilot-code-upgrader:3000
      EVOPILOT_LOOP_STORE_BACKEND: postgres
      EVOPILOT_LOOP_STORE_DSN: postgres://\${EVOPILOT_POSTGRES_USER:-evopilot}:\${EVOPILOT_POSTGRES_PASSWORD}@evopilot-postgres:5432/\${EVOPILOT_POSTGRES_DB:-evopilot}
    ports:
      - "\${EVOPILOT_PORT:-${args.apiPort}}:19876"
    volumes:
      - evopilot-data:/var/lib/evopilot
      - \${EVOPILOT_HOST_WORKSPACE:-./workspace}:/workspace
      - \${EVOPILOT_DOCKER_SOCK:-/var/run/docker.sock}:/var/run/docker.sock
    restart: unless-stopped

  evopilot-code-upgrader:
    image: \${EVOPILOT_IMAGE:-${args.evopilotImage}}
    command: ["npm", "run", "code-upgrader"]
    env_file:
      - .env
    environment:
      EVOPILOT_RUN_MODE: prod
      EVOPILOT_DATA_ROOT: /var/lib/evopilot
      EVOPILOT_CODE_UPGRADER_HOST: 0.0.0.0
      EVOPILOT_CODE_UPGRADER_PORT: "3000"
    volumes:
      - evopilot-data:/var/lib/evopilot
      - \${EVOPILOT_HOST_WORKSPACE:-./workspace}:/workspace
      - \${EVOPILOT_DOCKER_SOCK:-/var/run/docker.sock}:/var/run/docker.sock
    restart: unless-stopped

  evopilot-loop-worker:
    image: \${EVOPILOT_IMAGE:-${args.evopilotImage}}
    command: ["npm", "run", "loop-worker"]
    depends_on:
      evopilot-server:
        condition: service_started
    env_file:
      - .env
    environment:
      EVOPILOT_BASE_URL: http://evopilot-server:19876
      EVOPILOT_BASE_URL_FALLBACKS: http://host.docker.internal:19876
      EVOPILOT_RUN_MODE: prod
      EVOPILOT_DATA_ROOT: /var/lib/evopilot
      EVOPILOT_LOOP_WORKER_ID: \${EVOPILOT_LOOP_WORKER_ID:-evopilot-self-host-worker}
    volumes:
      - evopilot-data:/var/lib/evopilot
      - \${EVOPILOT_HOST_WORKSPACE:-./workspace}:/workspace
      - \${EVOPILOT_DOCKER_SOCK:-/var/run/docker.sock}:/var/run/docker.sock
    restart: unless-stopped

  evopilot-dashboard:
    image: \${EVOPILOT_DASHBOARD_IMAGE:-${args.dashboardImage}}
    depends_on:
      evopilot-server:
        condition: service_started
    environment:
      EVOPILOT_API_BASE_URL: http://evopilot-server:19876
    ports:
      - "\${EVOPILOT_DASHBOARD_PORT:-${args.dashboardPort}}:8080"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/health >/dev/null"]
      interval: 20s
      timeout: 5s
      retries: 10
    restart: unless-stopped

volumes:
  evopilot-data:
  evopilot-postgres-data:
`;
}

function envExample(args: ParsedArgs): string {
  return `# Copy to .env and edit before starting services.
EVOPILOT_IMAGE=${args.evopilotImage}
EVOPILOT_DASHBOARD_IMAGE=${args.dashboardImage}
EVOPILOT_PORT=${args.apiPort}
EVOPILOT_DASHBOARD_PORT=${args.dashboardPort}

EVOPILOT_RUN_MODE=prod
EVOPILOT_DATA_ROOT=/var/lib/evopilot
EVOPILOT_HOST_WORKSPACE=./workspace

EVOPILOT_POSTGRES_DB=evopilot
EVOPILOT_POSTGRES_USER=evopilot
EVOPILOT_POSTGRES_PASSWORD=change-me-postgres-password

EVOPILOT_USERS=admin:change-me-admin-password:admin:tenant-production:workspace-agent-products:PlatformAdmin
EVOPILOT_TOKENS=admin:change-me-admin-token:admin,operator:change-me-operator-token:operator,viewer:change-me-viewer-token:viewer

EVOPILOT_LLM_PROVIDER_NAME=openai-compatible
EVOPILOT_LLM_BASE_URL=https://llm.example.com/v1
EVOPILOT_LLM_MODEL_NAME=replace-with-model
EVOPILOT_LLM_API_KEY=replace-with-server-side-secret
EVOPILOT_REQUIRE_LLM=true
`;
}

function runtimeEnv(args: ParsedArgs): string {
  const postgresPassword = randomSecret();
  const adminPassword = randomSecret();
  const adminToken = randomSecret();
  const operatorToken = randomSecret();
  const viewerToken = randomSecret();
  const llmBaseUrl = process.env.EVOPILOT_LLM_BASE_URL || "https://llm.example.com/v1";
  const llmModel = process.env.EVOPILOT_LLM_MODEL_NAME || "replace-with-model";
  const llmApiKey = process.env.EVOPILOT_LLM_API_KEY || "replace-with-server-side-secret";

  return `# Generated by create-evopilot. Do not commit this file.
EVOPILOT_IMAGE=${args.evopilotImage}
EVOPILOT_DASHBOARD_IMAGE=${args.dashboardImage}
EVOPILOT_PORT=${args.apiPort}
EVOPILOT_DASHBOARD_PORT=${args.dashboardPort}

EVOPILOT_RUN_MODE=prod
EVOPILOT_DATA_ROOT=/var/lib/evopilot
EVOPILOT_HOST_WORKSPACE=./workspace

EVOPILOT_POSTGRES_DB=evopilot
EVOPILOT_POSTGRES_USER=evopilot
EVOPILOT_POSTGRES_PASSWORD=${postgresPassword}

EVOPILOT_USERS=admin:${adminPassword}:admin:tenant-production:workspace-agent-products:PlatformAdmin
EVOPILOT_TOKENS=admin:${adminToken}:admin,operator:${operatorToken}:operator,viewer:${viewerToken}:viewer

EVOPILOT_LLM_PROVIDER_NAME=openai-compatible
EVOPILOT_LLM_BASE_URL=${llmBaseUrl}
EVOPILOT_LLM_MODEL_NAME=${llmModel}
EVOPILOT_LLM_API_KEY=${llmApiKey}
EVOPILOT_REQUIRE_LLM=true
`;
}

function stackReadme(args: ParsedArgs): string {
  const envStep = args.initEnv
    ? "# Review .env and replace unresolved LLM values before production use."
    : "cp .env.example .env\n# Edit .env before starting services. Do not leave change-me values in production.";
  return `# EvoPilot Self-Hosted Stack

Generated by \`create-evopilot self-host\`.

## Start

\`\`\`bash
${envStep}
docker compose up -d
./verify.sh
\`\`\`

## Services

- EvoPilot API: http://127.0.0.1:${args.apiPort}
- EvoPilot Dashboard: http://127.0.0.1:${args.dashboardPort}
- Postgres: internal Docker network only

## Security Boundary

Do not commit \`.env\`. Store GitHub, GitLab, LLM, deploy, and password secrets server-side, then reference them through EvoPilot token refs or LLM profile ids during daily operation.
`;
}

function verifyScript(args: ParsedArgs): string {
  return `#!/usr/bin/env bash
set -euo pipefail

curl -fsS "http://127.0.0.1:${args.apiPort}/health" >/dev/null
curl -fsS "http://127.0.0.1:${args.apiPort}/ready" >/dev/null
curl -fsS "http://127.0.0.1:${args.dashboardPort}/health" >/dev/null
curl -fsSI "http://127.0.0.1:${args.dashboardPort}/" >/dev/null

echo "EvoPilot self-hosted stack is reachable."
`;
}

function startStack(targetDir: string, args: ParsedArgs): void {
  assertStartReady(targetDir);
  execFileSync("docker", ["compose", "up", "-d"], { cwd: targetDir, stdio: "inherit" });
  if (!args.skipVerify) {
    execFileSync("bash", [path.join(targetDir, "verify.sh")], { cwd: targetDir, stdio: "inherit" });
  }
  printStarted(targetDir, args);
}

function assertStartReady(targetDir: string): void {
  const envPath = path.join(targetDir, ".env");
  if (!fs.existsSync(envPath)) {
    fail(`${envPath} is missing. Re-run with --init-env or copy .env.example to .env first.`);
  }
  const unresolved = fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .filter((line) => /change-me|replace-with|llm\.example\.com/.test(line));
  if (unresolved.length > 0) {
    fail(`Refusing to start with unresolved production values in .env: ${unresolved.map((line) => line.split("=")[0]).join(", ")}`);
  }
}

function randomSecret(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function printHelp(): void {
  console.log(`create-evopilot

Usage:
  create-evopilot self-host [--dir evopilot-stack] [--init-env] [--start] [--force]

Options:
  --dir <path>              Output directory. Default: evopilot-stack
  --evopilot-image <image>  EvoPilot image. Default: ghcr.io/yeliang-wang/evopilot:${EVOPILOT_VERSION}
  --dashboard-image <img>   Dashboard image. Default: ghcr.io/yeliang-wang/evopilot-dashboard:${DASHBOARD_VERSION}
  --api-port <port>         Host API port. Default: 19876
  --dashboard-port <port>   Host Dashboard port. Default: 8080
  --init-env                Generate .env with random local auth and database secrets
  --start                   Generate .env if needed, run docker compose up -d, then verify
  --skip-verify             Skip verify.sh after --start
  --force                   Overwrite generated files
`);
}

function printNextSteps(targetDir: string, args: ParsedArgs): void {
  const displayPath = targetDir.startsWith(os.homedir()) ? targetDir.replace(os.homedir(), "~") : targetDir;
  const envStep = args.initEnv ? "Review .env and replace any unresolved LLM values before production use." : "cp .env.example .env\n  # Edit .env before starting services.";
  console.log(`EvoPilot self-host stack generated in ${displayPath}

Next:
  cd ${shellQuote(targetDir)}
  ${envStep}
  docker compose up -d
  ./verify.sh
`);
}

function printStarted(targetDir: string, args: ParsedArgs): void {
  const displayPath = targetDir.startsWith(os.homedir()) ? targetDir.replace(os.homedir(), "~") : targetDir;
  console.log(`EvoPilot self-host stack started from ${displayPath}

API: http://127.0.0.1:${args.apiPort}
Dashboard: http://127.0.0.1:${args.dashboardPort}
`);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function fail(message: string): never {
  console.error(`create-evopilot: ${message}`);
  process.exit(1);
}

main(process.argv.slice(2));
