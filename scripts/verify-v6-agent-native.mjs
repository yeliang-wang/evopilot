import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { normalizeEvolutionProjectDefinition, normalizeGovernedResource } from "../packages/core/dist/index.js";
import { EVOLUTION_EXPERT_CORE, assertExpertAdapterConformance, createExpertAdapter, createHostIntegrationBundle, expertVersionGuide } from "../packages/evolution-expert/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const hosts = ["codex", "claude-code", "workbuddy", "generic-agent", "generic-mcp"];

assertPackageVersion("package.json", "6.0.0");
assertPackageVersion("packages/core/package.json", "6.0.0");
assertPackageVersion("packages/server/package.json", "6.0.0");
assertPackageVersion("packages/adapter-mcp/package.json", "6.0.0");
assertPackageVersion("packages/adapter-opencode/package.json", "6.0.0");
assertPackageVersion("packages/evolution-expert/package.json", "2.0.0");

for (const id of ["datarig", "evopilot", "evopilot-harness", "new-project"]) {
  try { normalizeEvolutionProjectDefinition(parse(read(`examples/projects/${id}.yaml`))); }
  catch (error) { failures.push(`${id} declaration: ${message(error)}`); }
}
for (const host of hosts) {
  try {
    const adapter = createExpertAdapter(host);
    assertExpertAdapterConformance(adapter);
    const installed = readJson(`packages/evolution-expert/generated/${host}/adapter.json`);
    const bundle = readJson(`packages/evolution-expert/generated/${host}/bundle.json`);
    const expectedBundle = createHostIntegrationBundle(host);
    if (installed.digest !== adapter.digest || installed.coreDigest !== EVOLUTION_EXPERT_CORE.digest) failures.push(`${host}: generated adapter drift`);
    if (bundle.digest !== expectedBundle.digest || bundle.adapterDigest !== adapter.digest || bundle.expertCoreDigest !== EVOLUTION_EXPERT_CORE.digest) failures.push(`${host}: generated bundle drift`);
    if (bundle.ordinaryHumanEntry !== "EXPERT_OVER_MCP_ONLY" || !bundle.lifecycle?.install || !bundle.lifecycle?.doctor || !bundle.lifecycle?.rollback || !bundle.lifecycle?.removal) failures.push(`${host}: Host Integration Bundle lifecycle incomplete`);
  } catch (error) { failures.push(`${host}: ${message(error)}`); }
}

for (const relative of [
  "schemas/lifecycle/governed-lifecycle-record-v1.schema.json",
  "schemas/lifecycle/governed-lifecycle-pointer-v1.schema.json",
  "schemas/lifecycle/governed-lifecycle-audit-v1.schema.json",
  "schemas/lifecycle/agent-runtime-profile-v1.schema.json",
  "schemas/lifecycle/agent-execution-request-v1alpha1.schema.json",
  "schemas/lifecycle/agent-execution-result-v1alpha1.schema.json",
  "governance/acceptance/v6-completion-contract.json",
  "governance/acceptance/runtime-6.0.0-expert-2.0.0-cross-acceptance-map.json",
  "examples/governed-resources/codex-agent-runtime-profile.json"
]) {
  try { readJson(relative); } catch { failures.push(`${relative}: missing or invalid JSON`); }
}

try { normalizeGovernedResource(readJson("examples/governed-resources/codex-agent-runtime-profile.json")); }
catch (error) { failures.push(`AgentRuntimeProfile resource example: ${message(error)}`); }

const registry = read("packages/server/src/domains/lifecycle/governed-registry.ts");
for (const invariant of ["class GovernedLifecycleRegistry", "expectedActiveDigest", "DELETE_DRAFT", "recordUsage", "withLifecycleLock", "atomicWrite"]) if (!registry.includes(invariant)) failures.push(`Lifecycle Registry invariant missing: ${invariant}`);
const lifecycleService = read("packages/server/src/domains/lifecycle/service.ts");
for (const invariant of ["resolveExact", "requestDigest", "idempotencyKey", "qualificationDigest", "HOST_MANAGED_DENY_UNDECLARED", "LIFECYCLE_EXTERNAL_RESULT_BINDING_MISMATCH", "LIFECYCLE_EXTERNAL_RECEIPT_CONFLICT"]) if (!lifecycleService.includes(invariant)) failures.push(`Lifecycle execution invariant missing: ${invariant}`);
const mcp = read("packages/adapter-mcp/src/index.ts");
for (const tool of ["evopilot_lifecycle_register", "evopilot_lifecycle_activate", "evopilot_lifecycle_rollback", "evopilot_lifecycle_audit", "evopilot_agent_runtime_qualify"]) if (!mcp.includes(tool)) failures.push(`MCP tool missing: ${tool}`);
const contract = read("packages/contracts/src/index.ts");
for (const invariant of ["requestDigest", "qualificationDigest", "AGENT_EXECUTION_REQUEST_DIGEST_MISMATCH", "AGENT_EXECUTION_RESULT_BINDING_INVALID", "legacySuiteFallback: false"]) if (!contract.includes(invariant)) failures.push(`Agent Runtime contract invariant missing: ${invariant}`);

for (const relative of [
  "docs/architecture/agent-native-lifecycle-control-plane.md",
  "docs/guides/lifecycle-registry.md",
  "docs/guides/agent-runtime.md",
  "docs/guides/evolution-expert.md",
  "docs/operations/agent-native-recovery.md",
  "docs/operations/v6-acceptance.md",
  "docs/security/agent-native-boundaries.md",
  "docs/migrations/v6-agent-native.md",
  "docs/releases/6.0.0.md",
  "docs/releases/evolution-expert-2.0.0.md"
]) if (!fs.existsSync(path.join(root, relative))) failures.push(`v6 documentation missing: ${relative}`);

for (const relative of ["packages/core/src", "packages/server/src/domains/lifecycle", "packages/server/src/domains/governed-evolution", "packages/evolution-expert/src"]) {
  for (const file of walk(path.join(root, relative))) {
    const content = fs.readFileSync(file, "utf8");
    if (/(?:project|projectId|definition\.metadata\.id)\s*(?:===|==|case)\s*["'](?:datarig|evopilot-harness)["']/i.test(content)) failures.push(`${path.relative(root, file)}: project-name branch detected`);
    if (/\.codex\/skills|datarig-evolution\/datarig\/governance\/skill-suite/i.test(content)) failures.push(`${path.relative(root, file)}: legacy Suite runtime path detected`);
  }
}

const guide = expertVersionGuide();
if (guide.expertVersion !== "2.0.0" || guide.versionLines.find((line) => line.owner === "Runtime")?.current !== "6.0.0") failures.push("Evolution Expert 2.0.0 version compatibility mismatch");
if (failures.length) {
  console.error("EvoPilot v6 agent-native verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`EvoPilot v6 agent-native verification passed: governed Lifecycle Registry, exact external Agent Runtime boundary, ${hosts.length} generated Host bundles, four declaration-only projects, and zero legacy Suite fallback.`);

function assertPackageVersion(relative, expected) { try { const actual = readJson(relative).version; if (actual !== expected) failures.push(`${relative}: ${actual} != ${expected}`); } catch { failures.push(`${relative}: invalid package JSON`); } }
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function readJson(relative) { return JSON.parse(read(relative)); }
function message(error) { return error instanceof Error ? error.message : String(error); }
function walk(directory) { const files = []; for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const target = path.join(directory, entry.name); if (entry.isDirectory()) files.push(...walk(target)); else if (/\.(?:ts|mjs|js)$/.test(entry.name)) files.push(target); } return files; }
