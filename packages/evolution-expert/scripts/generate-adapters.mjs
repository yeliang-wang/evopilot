import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVOLUTION_EXPERT_CORE, createExpertAdapter } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const hosts = ["codex", "workbuddy", "generic-agent", "generic-mcp"];
const expected = new Map();

for (const host of hosts) {
  const adapter = createExpertAdapter(host);
  const directory = path.join(root, "generated", host);
  expected.set(path.join(directory, "adapter.json"), `${JSON.stringify(adapter, null, 2)}\n`);
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
  const name = adapter.host === "codex" ? "evopilot-evolution-expert-codex" : adapter.host === "workbuddy" ? "evopilot-evolution-expert-workbuddy" : `evopilot-evolution-expert-${adapter.host}`;
  return `---\nname: ${name}\ndescription: Generated ${adapter.host} adapter for the independently versioned EvoPilot Evolution Expert.\n---\n\n# EvoPilot Evolution Expert — ${adapter.host}\n\n- Adapter: \`${adapter.id}@${adapter.version}\`\n- Core: \`${adapter.coreDigest}\`\n- Protocol: \`${adapter.protocolVersion}\`\n\n## Required behavior\n\n${adapter.instructions.map((item) => `- ${item}`).join("\n")}\n\n## Prohibited semantics\n\n${adapter.prohibitedSemantics.map((item) => `- ${item}`).join("\n")}\n\nUse EvoPilot MCP or its CLI/API transport. This generated adapter never grants authority and never stores canonical Runtime state.\n`;
}
