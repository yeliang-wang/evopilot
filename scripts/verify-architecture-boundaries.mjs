import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredPackages = [
  ["@evopilot/contracts", "packages/contracts"],
  ["@evopilot/core", "packages/core"],
  ["@evopilot/server", "packages/server"],
  ["@evopilot/worker-runtime", "packages/worker-runtime"],
  ["@evopilot/cli", "packages/cli"],
  ["@evopilot/client", "packages/client"]
];

const failures = [];

for (const [packageName, packagePath] of requiredPackages) {
  const packageJsonPath = path.join(root, packagePath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    failures.push(`${packagePath} is missing package.json`);
    continue;
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (packageJson.name !== packageName) failures.push(`${packagePath} package name is ${packageJson.name}, expected ${packageName}`);
  if (!fs.existsSync(path.join(root, packagePath, "src"))) failures.push(`${packagePath} is missing src/`);
}

mustContain("packages/server/src/http/platform-readiness.ts", "@evopilot/contracts", "platform readiness must consume shared version contracts");
mustContain("packages/server/src/http/server-logging.ts", "@evopilot/contracts", "server logging must consume shared log schema contracts");
mustContain("packages/contracts/src/index.ts", "HTTP control-plane runtime", "contracts must describe the server runtime boundary");
mustContain("packages/contracts/src/index.ts", "runtime auth/config helpers", "contracts must describe extracted server runtime auth/config ownership");
mustContain("packages/contracts/src/index.ts", "executor adapters", "contracts must describe extracted server executor adapter ownership");
mustContain("packages/contracts/src/index.ts", "release target helpers", "contracts must describe extracted server release target ownership");
mustContain("packages/server/src/index.ts", "startServerFromEnvironment", "server package entrypoint must stay thin and delegate startup");
mustContain("packages/server/src/server.ts", "./runtime/control-plane-runtime.js", "server compatibility adapter must delegate to the runtime boundary");
mustContain("packages/server/src/runtime/control-plane-runtime.ts", "createServer", "control-plane runtime must own HTTP composition wiring");
mustContain("packages/server/src/runtime/control-plane-runtime.ts", "../storage/file-store/index.js", "control-plane runtime must consume storage through the file-store boundary");
mustContain("packages/server/src/runtime/control-plane-runtime.ts", "../application/control-plane-services.js", "control-plane runtime must consume application helpers through the application boundary");
mustContain("packages/server/src/runtime/control-plane-runtime.ts", "./runtime-auth.js", "control-plane runtime must delegate runtime auth and config helpers");
mustNotContain("packages/server/src/runtime/control-plane-runtime.ts", "./executor-adapters.js", "control-plane runtime must not directly own executor adapter execution");
mustContain("packages/server/src/runtime/control-plane-runtime.ts", "./release-targets.js", "control-plane runtime must delegate release target helpers");
mustNotContain("packages/server/src/runtime/control-plane-runtime.ts", "class FileStore", "FileStore must not be defined in the HTTP composition root");
mustContain("packages/server/src/runtime/runtime-auth.ts", "resolveRuntimeConfig", "runtime auth and config helpers must live outside the composition root");
mustContain("packages/server/src/runtime/runtime-auth.ts", "authorize", "runtime authorization must live outside the composition root");
mustContain("packages/server/src/runtime/executor-adapters.ts", "executeLoopNode", "loop executor adapter execution must live outside the composition root");
mustContain("packages/server/src/runtime/executor-adapters.ts", "ExecutorAdapterRegistry", "executor adapter registry must live outside the composition root");
mustContain("packages/server/src/runtime/release-targets.ts", "defaultReleaseTargets", "release target defaults must live outside the runtime composition root");
mustContain("packages/server/src/runtime/release-targets.ts", "defaultReleaseScenarioMatrix", "release scenario defaults must live outside the runtime composition root");
mustContain("packages/server/src/runtime/release-targets.ts", "dedupeReleaseRisks", "release risk consolidation must live outside the runtime composition root");
mustContain("packages/server/src/model.ts", "EvoPilotServerOptions", "server model contracts must live outside the composition root");
mustContain("packages/server/src/http/composition-root.ts", "serverCompositionRootMetadata", "server must expose composition-root metadata");
mustContain("packages/server/src/http/errors.ts", "HttpError", "HTTP error helpers must live outside the runtime boundary");
mustContain("packages/server/src/http/router.ts", "handleFirstMatchingRoute", "server route dispatch must use a shared route registry");
mustContain("packages/server/src/http/platform-readiness.ts", "platformHealthBody", "server readiness responses must live outside the composition root");
mustContain("packages/server/src/http/request-logging.ts", "requestCorrelation", "server request logging helpers must live outside the composition root");
mustContain("packages/server/src/http/response.ts", "writeJson", "server response helpers must live outside the composition root");
mustContain("packages/server/src/http/server-logging.ts", "setActiveLoggingSettings", "server structured logging must live outside the composition root");
mustContain("packages/server/src/http/static-assets.ts", "serveDashboard", "static dashboard serving must live outside the runtime boundary");
mustContain("packages/server/src/http/routes/platform.ts", "handlePlatformRoute", "platform routes must live in a route module");
mustContain("packages/server/src/http/routes/auth.ts", "handlePublicAuthRoute", "auth routes must live in a route module");
mustContain("packages/server/src/http/routes/settings.ts", "handleSettingsRoute", "settings routes must live in a route module");
mustContain("packages/server/src/http/routes/read-models.ts", "handleReadModelRoute", "read-model routes must live in a route module");
mustContain("packages/server/src/http/routes/goals.ts", "handleGoalRoutes", "goal and release decision routes must live in a route module");
mustContain("packages/server/src/http/routes/harness.ts", "handleHarnessRoutes", "harness template and policy routes must live in a route module");
mustContain("packages/server/src/http/routes/admin.ts", "handleAdminRoutes", "tenant, workspace, user, secret, and integration admin routes must live in a route module");
mustContain("packages/server/src/http/routes/loop-runtime.ts", "handleLoopRuntimeRoutes", "loop orchestration and runtime routes must live in a route module");
mustContain("packages/server/src/http/routes/loops.ts", "handleLoopRoutes", "loop lifecycle and worker routes must live in a route module");
mustContain("packages/server/src/http/routes/target-loops.ts", "handleTargetLoopRoutes", "target-loop and IM command routes must live in a route module");
mustContain("packages/server/src/http/routes/release-evidence.ts", "handleReleaseEvidenceRoutes", "release evidence and opportunity draft routes must live in a route module");
mustContain("packages/server/src/http/routes/connectors.ts", "handleConnectorRoutes", "connector routes must live in a route module");
mustContain("packages/server/src/http/routes/project-harness-profiles.ts", "handleProjectHarnessProfileRoutes", "project harness profile routes must live in a route module");
mustContain("packages/server/src/http/routes/projects.ts", "handleProjectRoutes", "project, source credential, DevOps, and LLM binding routes must live in a route module");
mustContain("packages/server/src/http/routes/delivery.ts", "handleDeliveryRoutes", "run, evidence ingest, review, delivery, and scheduling routes must live in a route module");
mustContain("packages/server/src/http/routes/rules.ts", "handleRuleRoutes", "rule routes must live in a route module");
mustContain("packages/server/src/http/routes/evaluation.ts", "handleEvaluationRoutes", "evaluation, insight, batch, and soak routes must live in a route module");
mustContain("packages/server/src/http/routes/release-targets.ts", "handleReleaseTargetRoutes", "release target routes must live in a route module");
mustContain("packages/server/src/http/routes/maturity.ts", "handleMaturityRoutes", "maturity standard routes must live in a route module");
mustContain("packages/server/src/http/routes/audit-history.ts", "handleAuditHistoryRoutes", "audit and history routes must live in a route module");
mustContain("packages/server/src/storage/json-files.ts", "atomicWriteJson", "file storage primitives must live outside the runtime boundary");
mustContain("packages/server/src/storage/file-store/index.ts", "class FileStore", "file-backed store must live in the storage boundary");
mustContain("packages/server/src/application/control-plane-services.ts", "buildGoalSnapshot", "control-plane use-case helpers must live in the application boundary");
mustContain("packages/server/src/domains/harness-template/defaults.ts", "defaultHarnessTemplates", "built-in harness templates must live in the harness-template domain");
mustContain("packages/cli/src/commands/runtime.ts", "@evopilot/contracts", "CLI command runtime must consume shared contracts");
mustContain("packages/cli/src/runtime/boundary.ts", "cliInterfaceBoundaryMetadata", "CLI must expose interface-boundary metadata");
mustContain("packages/cli/src/index.ts", "./commands/runtime.js", "CLI process entrypoint must delegate command execution to command modules");
mustContain("packages/cli/src/commands/runtime.ts", "EvoPilotClient", "CLI commands must remain HTTP client adapters");
mustContain("packages/worker-runtime/src/index.ts", "EVOPILOT_WORKER_RUNTIME_SCHEMA", "worker runtime must expose a typed runtime result");
mustContain("scripts/loop-worker.mjs", "@evopilot/worker-runtime", "loop-worker script must delegate to the runtime package");
mustContain("package.json", "verify:architecture", "root check must include architecture verification");

for (const routePrefix of [
  "/api/v1/goals",
  "/api/v1/harness/template-evolutions",
  "/api/v1/harness/templates",
  "/api/v1/harness/policies",
  "/api/v1/tenants",
  "/api/v1/users",
  "/api/v1/workspaces",
  "/api/v1/secrets",
  "/api/v1/llm-profiles",
  "/api/v1/github-app/installations",
  "/api/v1/onboarding/project/checklist",
  "/api/v1/executor-graphs",
  "/api/v1/loop-store",
  "/api/v1/loop-orchestration",
  "/api/v1/loop-target-runtime",
  "/api/v1/loops",
  "/api/v1/loop-workers",
  "/api/v1/im/feishu/webhook",
  "/api/v1/im/wecom/webhook",
  "/api/v1/conversations/commands",
  "/api/v1/target-loops",
  "/api/v1/release/evidence",
  "/api/v1/connectors/code-upgrader",
  "/api/v1/connectors/deploy",
  "/api/v1/schedules",
  "/api/v1/projects",
  "/api/v1/runs",
  "/api/v1/pipelines",
  "/api/v1/code-upgrade-runs",
  "/api/v1/evidence",
  "/api/v1/reviews",
  "/api/v1/deliveries",
  "/api/v1/rules",
  "/api/v1/evaluation-datasets",
  "/api/v1/opportunity-insights",
  "/api/v1/evolution-batches",
  "/api/v1/soak-reports",
  "/api/v1/release/targets",
  "/api/v1/maturity/standards",
  "/api/v1/audit",
  "/api/v1/history"
]) {
  mustNotInlineRoutePrefix("packages/server/src/runtime/control-plane-runtime.ts", routePrefix, "extracted HTTP routes must not be re-inlined in the control-plane runtime");
}

maxLines("packages/server/src/index.ts", 80, "server package entrypoint must remain thin");
maxLines("packages/server/src/server.ts", 80, "server compatibility adapter must remain thin");
maxLines("packages/server/src/runtime/control-plane-runtime.ts", 2200, "control-plane runtime must stay a thin HTTP composition root");
maxLines("packages/server/src/application/control-plane-services.ts", 13500, "control-plane application helpers must not grow without a domain split");
maxLines("packages/server/src/storage/file-store/index.ts", 5200, "file-store boundary must not grow without splitting an aggregate");
maxLines("packages/server/src/runtime/runtime-auth.ts", 450, "runtime auth and config helpers must stay focused");
maxLines("packages/server/src/runtime/executor-adapters.ts", 650, "executor adapter module must stay focused");
maxLines("packages/server/src/runtime/release-targets.ts", 900, "release target helpers must stay focused");
maxLines("packages/server/src/model.ts", 3000, "server contracts must stay readable");
maxLines("packages/server/src/http/errors.ts", 120, "HTTP error helpers must stay focused");
maxLines("packages/server/src/http/static-assets.ts", 120, "static asset serving must stay focused");
maxLines("packages/server/src/http/router.ts", 80, "route registry must stay a small infrastructure helper");
maxLines("packages/server/src/storage/json-files.ts", 80, "file storage primitives must stay focused");
for (const routeFile of fs.readdirSync(path.join(root, "packages/server/src/http/routes")).filter((file) => file.endsWith(".ts"))) {
  maxLines(`packages/server/src/http/routes/${routeFile}`, 650, "HTTP route modules must stay focused");
}
maxLines("packages/cli/src/index.ts", 80, "CLI process entrypoint must remain thin");
maxLines("packages/cli/src/commands/runtime.ts", 4700, "CLI command runtime must not grow without extracting another command domain");

if (failures.length > 0) {
  console.error("Architecture boundary verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Architecture boundary verification passed.");

function mustContain(relativePath, needle, message) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`${relativePath} is missing`);
    return;
  }
  const content = fs.readFileSync(absolute, "utf8");
  if (!content.includes(needle)) failures.push(`${message}: ${relativePath} does not contain ${needle}`);
}

function mustNotContain(relativePath, needle, message) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`${relativePath} is missing`);
    return;
  }
  const content = fs.readFileSync(absolute, "utf8");
  if (content.includes(needle)) failures.push(`${message}: ${relativePath} contains ${needle}`);
}

function mustNotInlineRoutePrefix(relativePath, routePrefix, message) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`${relativePath} is missing`);
    return;
  }
  const content = fs.readFileSync(absolute, "utf8");
  const exactNeedle = `url.pathname === "${routePrefix}`;
  const matcherNeedle = `url.pathname.match(/^${routePrefix.replaceAll("/", "\\/")}`;
  if (content.includes(exactNeedle) || content.includes(matcherNeedle)) {
    failures.push(`${message}: ${relativePath} still inlines ${routePrefix}`);
  }
}

function maxLines(relativePath, limit, message) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`${relativePath} is missing`);
    return;
  }
  const count = fs.readFileSync(absolute, "utf8").split(/\r?\n/).length;
  if (count > limit) failures.push(`${message}: ${relativePath} has ${count} lines, limit ${limit}`);
}
