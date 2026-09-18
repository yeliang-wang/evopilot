import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EVOLUTION_EXPERT_CORE,
  assertExpertAdapterConformance,
  createExpertAdapter,
  expertCompatibility
} from "../packages/evolution-expert/dist/index.js";
import { llmSetupProtocol } from "../packages/server/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const roadmap = readJson("governance/roadmap.yaml");
const recovery = roadmap.expert22CompletionRecoveryPolicy;
const activeExpertVersion = readJson("packages/evolution-expert/package.json").version;
const supportedExpertVersion = activeExpertVersion === "2.2.0" ? "2.2.0" : recovery?.successorExpertVersion;
if (activeExpertVersion !== "2.2.0") {
  const successor = readJson("governance/targets/evopilot-evolution-expert-v2.2.1-public-cli-completion-recovery.json");
  if (successor.approvals?.target?.decision !== "APPROVED" || successor.roadmapBindings?.[0]?.targetVersion !== activeExpertVersion || successor.roadmapBindings?.[0]?.matchedMilestone !== recovery?.successorMilestone) failures.push("Expert recovery does not bind its approved successor Target");
}

for (const [relative, expected] of [
  ["package.json", "6.2.0"],
  ["packages/contracts/package.json", "6.2.0"],
  ["packages/server/package.json", "6.2.0"],
  ["packages/adapter-mcp/package.json", "6.2.0"],
  ["packages/cli/package.json", "6.2.0"],
  ["packages/create-evopilot/package.json", "6.2.0"],
  ["packages/evolution-expert/package.json", supportedExpertVersion]
]) {
  const actual = readJson(relative).version;
  if (actual !== expected) failures.push(`${relative}: ${actual} != ${expected}`);
}

const runtimeTarget = readJson("governance/targets/evopilot-v6.2.0-first-run-llm-readiness.json");
const expertTarget = readJson("governance/targets/evopilot-evolution-expert-v2.2.0-first-run-llm-setup.json");
const crossMap = readJson("governance/acceptance/runtime-6.2.0-expert-2.2.0-cross-acceptance-map.json");
const implementationAuthorizedStatuses = new Set(["APPROVED", "RELEASE_AUTHORIZED"]);
if (!implementationAuthorizedStatuses.has(runtimeTarget.status) || runtimeTarget.approvals?.target?.decision !== "APPROVED") failures.push("Runtime 6.2 Target is not implementation-authorized");
if (!implementationAuthorizedStatuses.has(expertTarget.status) || expertTarget.approvals?.target?.decision !== "APPROVED") failures.push("Expert 2.2 Target is not implementation-authorized");
if (runtimeTarget.acceptance?.length !== 15 || expertTarget.acceptance?.length !== 10 || crossMap.rows?.length !== 10) failures.push("v6.2 criterion or cross-map count drift");

const protocol = llmSetupProtocol();
if (protocol.runtimeVersion !== "6.2.0" || protocol.expertProtocolRange !== ">=2.2 <3") failures.push("Runtime/Expert LLM setup protocol version drift");
if (protocol.secureInput?.rawSecretAcceptedByExpert !== false || protocol.secureInput?.persistedForm !== "SecretRef only") failures.push("SecretRef-only protocol boundary missing");
for (const state of ["SETUP_REQUIRED", "PREFLIGHT_REQUIRED", "READY", "LLM_BLOCKED"]) if (!protocol.states.includes(state)) failures.push(`Runtime readiness state missing: ${state}`);
for (const fallback of ["Agent Host LLM", "Agent Model", "Codex configuration", "Claude Code configuration", "WorkBuddy configuration", "MyGlm5"]) if (!protocol.forbiddenFallbacks.includes(fallback)) failures.push(`forbidden LLM fallback missing: ${fallback}`);

const domain = read("packages/server/src/domains/llm-readiness/index.ts");
for (const invariant of ["createWorkspaceLlmDefaultBinding", "reconcileRuntimeReadiness", "expectedProfileDigest", "expectedBindingDigest", "LLM_LIVE_PREFLIGHT_REQUIRED", "WORKSPACE_LLM_BINDING_CONFLICT"]) if (!domain.includes(invariant)) failures.push(`Runtime readiness invariant missing: ${invariant}`);
const runtime = read("packages/server/src/runtime/control-plane-runtime.ts");
if (!runtime.includes("LLM_PROFILE_REQUIRED") || !runtime.includes("resolveWorkspaceLlmClient")) failures.push("production setup-only or governed workspace client gate missing");
const installer = read("packages/create-evopilot/src/index.ts");
for (const forbidden of ["EVOPILOT_LLM_PROVIDER_NAME=", "EVOPILOT_LLM_BASE_URL=", "EVOPILOT_LLM_MODEL_NAME=", "EVOPILOT_LLM_API_KEY="]) if (installer.includes(forbidden)) failures.push(`installer contains forbidden LLM default: ${forbidden}`);

const mcp = read("packages/adapter-mcp/src/index.ts");
for (const tool of ["evopilot_runtime_readiness_inspect", "evopilot_llm_provider_discover", "evopilot_llm_profile_list", "evopilot_llm_profile_inspect", "evopilot_llm_profile_upsert", "evopilot_llm_profile_preflight", "evopilot_workspace_llm_default_bind", "evopilot_runtime_readiness_repair"]) if (!mcp.includes(tool)) failures.push(`MCP setup tool missing: ${tool}`);

for (const host of ["codex", "claude-code", "workbuddy", "generic-agent", "generic-mcp"]) {
  try {
    const adapter = createExpertAdapter(host);
    assertExpertAdapterConformance(adapter);
    if (!adapter.requiredCapabilities.includes("host-native-secure-secret-input")) failures.push(`${host}: secure input capability missing`);
    if (expertCompatibility(adapter, "6.2.0", adapter.requiredCapabilities).conformanceStatus !== "CONFORMANT") failures.push(`${host}: Runtime 6.2 compatibility failed`);
    if (expertCompatibility(adapter, "6.1.0", adapter.requiredCapabilities).conformanceStatus !== "INCOMPATIBLE") failures.push(`${host}: unsafe Runtime 6.1 compatibility accepted`);
    const generated = readJson(`packages/evolution-expert/generated/${host}/adapter.json`);
    if (generated.coreDigest !== EVOLUTION_EXPERT_CORE.digest || generated.digest !== adapter.digest) failures.push(`${host}: generated adapter drift`);
  } catch (error) {
    failures.push(`${host}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const readme = read("README.md");
const svg = read("docs/assets/architecture/evopilot-agent-native-architecture.svg");
if (!readme.includes("docs/assets/architecture/evopilot-agent-native-architecture.svg")) failures.push("README architecture SVG link missing");
if (!fs.existsSync(path.join(root, "docs/assets/architecture/evopilot-agent-native-architecture.png"))) failures.push("README architecture PNG fallback missing");
for (const term of ["Third-party AI Agent Host", "Host LLM", "Evolution Expert", "MCP Client", "EvoPilot Runtime", "RuntimeReadiness", "Runtime LLM", "Qualified External Agent Runtime", "Agent Model", "Project Systems", "evopilot-harness Registry / Catalog"]) if (!svg.includes(term)) failures.push(`architecture node missing: ${term}`);
for (const relative of ["docs/guides/first-run-llm-readiness.md", "docs/releases/6.2.0.md", "docs/releases/evolution-expert-2.2.0.md"]) if (!fs.existsSync(path.join(root, relative))) failures.push(`v6.2 documentation missing: ${relative}`);

if (failures.length) {
  console.error("EvoPilot v6.2 first-run LLM readiness verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("EvoPilot v6.2 first-run LLM readiness verification passed: setup-only production start, explicit live-preflight workspace binding, SecretRef-only Expert setup, no hidden provider fallback, generated Host parity, and README SVG/PNG architecture contract.");

function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function readJson(relative) { return JSON.parse(read(relative)); }
