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
mustContain("packages/server/src/index.ts", "startServerFromEnvironment", "server package entrypoint must stay thin and delegate startup");
mustContain("packages/server/src/server.ts", "./runtime/control-plane-runtime.js", "server compatibility adapter must delegate to the runtime boundary");
mustContain("packages/server/src/runtime/control-plane-runtime.ts", "createServer", "control-plane runtime must own HTTP composition wiring");
mustContain("packages/server/src/runtime/control-plane-runtime.ts", "./runtime-auth.js", "control-plane runtime must delegate runtime auth and config helpers");
mustContain("packages/server/src/runtime/control-plane-runtime.ts", "./executor-adapters.js", "control-plane runtime must delegate executor adapter execution");
mustContain("packages/server/src/runtime/runtime-auth.ts", "resolveRuntimeConfig", "runtime auth and config helpers must live outside the composition root");
mustContain("packages/server/src/runtime/runtime-auth.ts", "authorize", "runtime authorization must live outside the composition root");
mustContain("packages/server/src/runtime/executor-adapters.ts", "executeLoopNode", "loop executor adapter execution must live outside the composition root");
mustContain("packages/server/src/runtime/executor-adapters.ts", "ExecutorAdapterRegistry", "executor adapter registry must live outside the composition root");
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
mustContain("packages/server/src/storage/json-files.ts", "atomicWriteJson", "file storage primitives must live outside the runtime boundary");
mustContain("packages/server/src/domains/harness-template/defaults.ts", "defaultHarnessTemplates", "built-in harness templates must live in the harness-template domain");
mustContain("packages/cli/src/index.ts", "@evopilot/contracts", "CLI interface must consume shared contracts");
mustContain("packages/cli/src/runtime/boundary.ts", "cliInterfaceBoundaryMetadata", "CLI must expose interface-boundary metadata");
mustContain("packages/worker-runtime/src/index.ts", "EVOPILOT_WORKER_RUNTIME_SCHEMA", "worker runtime must expose a typed runtime result");
mustContain("scripts/loop-worker.mjs", "@evopilot/worker-runtime", "loop-worker script must delegate to the runtime package");
mustContain("package.json", "verify:architecture", "root check must include architecture verification");

maxLines("packages/server/src/index.ts", 80, "server package entrypoint must remain thin");
maxLines("packages/server/src/server.ts", 80, "server compatibility adapter must remain thin");
maxLines("packages/server/src/runtime/control-plane-runtime.ts", 21600, "control-plane runtime must not grow without extracting another boundary");
maxLines("packages/server/src/runtime/runtime-auth.ts", 450, "runtime auth and config helpers must stay focused");
maxLines("packages/server/src/runtime/executor-adapters.ts", 650, "executor adapter module must stay focused");
maxLines("packages/server/src/model.ts", 3000, "server contracts must stay readable");
maxLines("packages/server/src/http/errors.ts", 120, "HTTP error helpers must stay focused");
maxLines("packages/server/src/http/static-assets.ts", 120, "static asset serving must stay focused");
maxLines("packages/server/src/http/router.ts", 80, "route registry must stay a small infrastructure helper");
maxLines("packages/server/src/storage/json-files.ts", 80, "file storage primitives must stay focused");
for (const routeFile of fs.readdirSync(path.join(root, "packages/server/src/http/routes")).filter((file) => file.endsWith(".ts"))) {
  maxLines(`packages/server/src/http/routes/${routeFile}`, 750, "HTTP route modules must stay focused");
}

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

function maxLines(relativePath, limit, message) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`${relativePath} is missing`);
    return;
  }
  const count = fs.readFileSync(absolute, "utf8").split(/\r?\n/).length;
  if (count > limit) failures.push(`${message}: ${relativePath} has ${count} lines, limit ${limit}`);
}
