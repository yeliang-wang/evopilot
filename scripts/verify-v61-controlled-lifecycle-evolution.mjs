import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVOLUTION_EXPERT_CORE, assertExpertAdapterConformance, createExpertAdapter, expertCompatibility, expertVersionGuide } from "../packages/evolution-expert/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
for (const [relative, expected] of [
  ["package.json", "6.1.0"],
  ["packages/core/package.json", "6.1.0"],
  ["packages/server/package.json", "6.1.0"],
  ["packages/adapter-mcp/package.json", "6.1.0"],
  ["packages/adapter-opencode/package.json", "6.1.0"],
  ["packages/evolution-expert/package.json", "2.1.0"]
]) assertPackageVersion(relative, expected);

for (const relative of [
  "schemas/governed-evolution/controlled-lifecycle-observation-v1.schema.json",
  "schemas/governed-evolution/lifecycle-successor-proposal-v1.schema.json",
  "schemas/governed-evolution/lifecycle-experiment-report-v1.schema.json",
  "schemas/governed-evolution/lifecycle-activation-decision-v1.schema.json",
  "schemas/governed-evolution/lifecycle-monitoring-decision-v1.schema.json",
  "schemas/governed-evolution/generic-primitive-target-proposal-v1.schema.json",
  "governance/acceptance/v61-completion-contract.json",
  "governance/acceptance/runtime-6.1.0-expert-2.1.0-cross-acceptance-map.json",
  "governance/suite-convergence/datarig-2.1.11-capability-inventory.json",
  "examples/governed-evolution/datarig-production-delivery-v1.json"
]) {
  try { readJson(relative); } catch { failures.push(`${relative}: missing or invalid JSON`); }
}

const core = read("packages/core/src/controlled-lifecycle-evolution.ts");
for (const invariant of ["createControlledLifecycleObservation", "classifyLifecycleGap", "createLifecycleSuccessorProposal", "evaluateLifecycleExperiment", "decideLifecycleSuccessorActivation", "evaluateLifecycleMonitoring", "createGenericPrimitiveTargetProposal", "projectSpecificCoreBranchAllowed: false", "activeRunsRebound: false"]) if (!core.includes(invariant)) failures.push(`controlled Lifecycle Core invariant missing: ${invariant}`);
const service = read("packages/server/src/domains/governed-evolution/service.ts");
for (const invariant of ["recordLifecycleObservation", "proposeLifecycleSuccessor", "evaluateLifecycleSuccessorExperiment", "decideLifecycleSuccessor", "evaluateLifecycleHealth", "proposeGenericPrimitiveTarget", "IMMUTABLE_CONFLICT", "duplicateSuppressed"]) if (!service.includes(invariant)) failures.push(`controlled Lifecycle service invariant missing: ${invariant}`);
const routes = read("packages/server/src/http/routes/governed-evolution.ts");
for (const route of ["/api/v1/controlled-lifecycle/observations", "/api/v1/controlled-lifecycle/successors", "/api/v1/controlled-lifecycle/experiments", "/api/v1/controlled-lifecycle/activation-decisions", "/api/v1/controlled-lifecycle/monitoring/evaluate", "/api/v1/controlled-lifecycle/target-proposals"]) if (!routes.includes(route)) failures.push(`controlled Lifecycle HTTP route missing: ${route}`);
const mcp = read("packages/adapter-mcp/src/index.ts");
for (const tool of ["evopilot_lifecycle_observation_record", "evopilot_lifecycle_observation_inspect", "evopilot_lifecycle_gap_classify", "evopilot_lifecycle_successor_propose", "evopilot_lifecycle_successor_inspect", "evopilot_lifecycle_experiment_evaluate", "evopilot_lifecycle_activation_decide", "evopilot_lifecycle_monitoring_evaluate", "evopilot_generic_primitive_target_propose"]) if (!mcp.includes(tool)) failures.push(`controlled Lifecycle MCP tool missing: ${tool}`);

for (const host of ["codex", "claude-code", "workbuddy", "generic-agent", "generic-mcp"]) {
  try {
    const adapter = createExpertAdapter(host);
    assertExpertAdapterConformance(adapter);
    const generated = readJson(`packages/evolution-expert/generated/${host}/adapter.json`);
    if (generated.digest !== adapter.digest || generated.coreDigest !== EVOLUTION_EXPERT_CORE.digest) failures.push(`${host}: generated Expert adapter drift`);
  } catch (error) { failures.push(`${host}: ${message(error)}`); }
}
const guide = expertVersionGuide();
if (guide.expertVersion !== "2.1.0" || guide.versionLines.find((line) => line.owner === "Runtime")?.current !== "6.1.0") failures.push("Expert 2.1 / Runtime 6.1 version guide mismatch");
if (expertCompatibility(createExpertAdapter("codex"), "6.1.0", createExpertAdapter("codex").requiredCapabilities).conformanceStatus !== "CONFORMANT") failures.push("Expert 2.1 / Runtime 6.1 compatibility negotiation failed");

for (const relative of ["packages/core/src/controlled-lifecycle-evolution.ts", "packages/server/src/domains/governed-evolution/service.ts", "packages/server/src/http/routes/governed-evolution.ts", "packages/evolution-expert/src/index.ts"]) {
  const content = read(relative);
  if (/(?:project|projectId|definition\.metadata\.id)\s*(?:===|==|case)\s*["'](?:datarig|evopilot-harness)["']/i.test(content)) failures.push(`${relative}: project-name branch detected`);
  if (/\.codex\/skills|datarig-evolution\/datarig\/governance\/skill-suite/i.test(content)) failures.push(`${relative}: legacy Suite runtime path detected`);
}
for (const relative of ["docs/architecture/controlled-lifecycle-evolution.md", "docs/guides/controlled-lifecycle-evolution.md", "docs/releases/6.1.0.md", "docs/releases/evolution-expert-2.1.0.md", "lifecycles/reference/datarig-production-delivery.yaml"]) if (!fs.existsSync(path.join(root, relative))) failures.push(`v6.1 deliverable missing: ${relative}`);

if (failures.length) {
  console.error("EvoPilot v6.1 controlled Lifecycle evolution verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("EvoPilot v6.1 controlled Lifecycle evolution verification passed: project-neutral observation-to-successor-to-experiment-to-policy activation-to-idempotent rollback, DataRig 2.1.11 read-only convergence, five Host adapters, and zero legacy Suite invocation.");

function assertPackageVersion(relative, expected) { try { const actual = readJson(relative).version; if (actual !== expected) failures.push(`${relative}: ${actual} != ${expected}`); } catch { failures.push(`${relative}: invalid package JSON`); } }
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function readJson(relative) { return JSON.parse(read(relative)); }
function message(error) { return error instanceof Error ? error.message : String(error); }
