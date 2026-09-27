import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVOLUTION_EXPERT_CORE, createExpertAdapter, createHostIntegrationBundle } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const hosts = ["codex", "claude-code", "workbuddy", "generic-agent", "generic-mcp"];
const expected = new Map();

for (const host of hosts) {
  const adapter = createExpertAdapter(host);
  const directory = path.join(root, "generated", host);
  expected.set(path.join(directory, "adapter.json"), `${JSON.stringify(adapter, null, 2)}\n`);
  expected.set(path.join(directory, "bundle.json"), `${JSON.stringify(createHostIntegrationBundle(host), null, 2)}\n`);
  expected.set(path.join(directory, "SKILL.md"), renderSkill(adapter));
}

const failures = [];
for (const [target, content] of expected) {
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== content) failures.push(path.relative(root, target));
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

if (failures.length) {
  console.error(`Generated Expert adapters are stale: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(check ? "Evolution Expert generated adapters are current." : `Generated ${hosts.length} Evolution Expert adapters from Core ${EVOLUTION_EXPERT_CORE.digest}.`);

function renderSkill(adapter) {
  const name = `evopilot-evolution-expert-${adapter.host}`;
  const projectGuide = Object.entries(EVOLUTION_EXPERT_CORE.operations).filter(([intent]) => intent.startsWith("project-")).map(([, operation]) =>
    `- \`${operation.tool}\`: ${operation.purpose} Required fields: ${operation.requiredInputs.join(", ")}. ${operation.nextOnSuccess}`).join("\n");
  const semanticGuide = Object.entries(EVOLUTION_EXPERT_CORE.operations).filter(([intent]) => intent.startsWith("semantic-") && !intent.startsWith("semantic-execution-")).map(([, operation]) =>
    `- \`${operation.tool}\`: ${operation.purpose} Required fields: ${operation.requiredInputs.join(", ")}. ${operation.nextOnSuccess}`).join("\n");
  const executionGuide = Object.entries(EVOLUTION_EXPERT_CORE.operations).filter(([intent]) => intent.startsWith("semantic-execution-")).map(([, operation]) =>
    `- \`${operation.tool}\`: ${operation.purpose} Required fields: ${operation.requiredInputs.join(", ")}. ${operation.nextOnSuccess}`).join("\n");
  return `---\nname: ${name}\ndescription: Generated ${adapter.host} adapter for the independently versioned EvoPilot Evolution Expert.\n---\n\n# EvoPilot Evolution Expert — ${adapter.host}\n\n- Adapter: \`${adapter.id}@${adapter.version}\`\n- Core: \`${adapter.coreDigest}\`\n- Protocol: \`${adapter.protocolVersion}\`\n\n## Required behavior\n\n${adapter.instructions.map((item) => `- ${item}`).join("\n")}\n\n## Prohibited semantics\n\n${adapter.prohibitedSemantics.map((item) => `- ${item}`).join("\n")}\n\n## Project definition guidance\n\nExpert projects projectFacts or projectDefinition into the MCP payload; discovery/impact context is guidance only and never authority. Use Runtime readback after unknown outcomes; do not replay registration automatically.\n\n${projectGuide}\n\n## Project semantic operations\n\nNegotiate the exact project's Runtime semantic capabilities before using this surface. These operations use top-level typed fields, not an arbitrary payload. Explicit advertised transition operations switch only future-plan selection after an exact human decision. They do not authorize execution or completion, migrate existing runs, publish assets or grant Release. A missing operation is a stop, not permission to use a legacy substitute.\n\n${semanticGuide}\n\n## Dual-bound execution and evidence\n\nUse the independent evopilot_semantic_execution_capabilities surface. Execution tools take {projectId, payload: {exact operation fields}}; capabilities takes {projectId} only. Dotted required fields below name nested payload fields, not literal keys. A generic request to run only inspects capability. An explicitly selected operation requires exact Runtime identity, plans, pins and current authority. Outcome review approval requires its own reviewDigest and explicit human evidence. Do not chain effects, retry uncertain mutations or infer facts from prose. Read completionStatus for verified Goal progress; business/Harness validation, stage/Target/phase receipts and Release are separate.\n\n${executionGuide}\n\n## First conversation\n\n- Connect this Host to the EvoPilot Runtime MCP surface; ordinary-human operation must not fall back to direct CLI or HTTP.\n- Ask: “Check EvoPilot health and compatibility, then give me the side-effect-free tutorial.”\n- Continue naturally: “Help me register a project,” “Show my Lifecycle revisions,” or “Run this Goal with the matched HarnessBundle.”\n- Resume only from Runtime-owned state after interruption or Host transfer; conversation history is never canonical state.\n- CLI, HTTP, and CI remain administrator, machine, diagnostic, and recovery surfaces.\n\nThis generated adapter never grants authority, executes source work, or stores canonical Runtime state. Its bundle.json defines install, doctor, health, version, upgrade, rollback, removal, help, and tutorial lifecycle metadata.\n`;
}
