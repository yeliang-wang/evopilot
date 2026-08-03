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

mustContain("packages/server/src/index.ts", "@evopilot/contracts", "server composition root must consume shared contracts");
mustContain("packages/server/src/http/composition-root.ts", "serverCompositionRootMetadata", "server must expose composition-root metadata");
mustContain("packages/cli/src/index.ts", "@evopilot/contracts", "CLI interface must consume shared contracts");
mustContain("packages/cli/src/runtime/boundary.ts", "cliInterfaceBoundaryMetadata", "CLI must expose interface-boundary metadata");
mustContain("packages/worker-runtime/src/index.ts", "EVOPILOT_WORKER_RUNTIME_SCHEMA", "worker runtime must expose a typed runtime result");
mustContain("scripts/loop-worker.mjs", "@evopilot/worker-runtime", "loop-worker script must delegate to the runtime package");
mustContain("package.json", "verify:architecture", "root check must include architecture verification");

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
