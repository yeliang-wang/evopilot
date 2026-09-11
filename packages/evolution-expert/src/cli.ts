#!/usr/bin/env node

import fs from "node:fs";
import { EVOLUTION_EXPERT_CORE, EVOPILOT_EVOLUTION_EXPERT_VERSION, createExpertAdapter, expertCompatibility, expertDoctor, expertMigrationGuide, expertTutorial, expertVersionGuide, planExpertTurn, renderInteraction } from "./index.js";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
let output: unknown;
if (command === "--version" || command === "version") output = { product: "@evopilot/evolution-expert", version: EVOPILOT_EVOLUTION_EXPERT_VERSION };
else if (command === "manifest") output = EVOLUTION_EXPERT_CORE;
else if (command === "adapter") output = createExpertAdapter(args[1] ?? "generic-agent");
else if (command === "compatibility") {
  const adapter = createExpertAdapter(args[1] ?? "generic-agent");
  output = expertCompatibility(adapter, args[2] ?? "6.0.0", ["structured-tool-results", "local-or-remote-mcp", "human-decision-presentation", "runtime-state-resume"]);
} else if (command === "doctor") output = expertDoctor(args[1] ?? "generic-agent", args[2] ?? "6.0.0", ["structured-tool-results", "local-or-remote-mcp", "human-decision-presentation", "runtime-state-resume"]);
else if (command === "tutorial") output = expertTutorial();
else if (command === "versions") output = expertVersionGuide();
else if (["migration", "shadow", "cutover", "rollback"].includes(command)) output = expertMigrationGuide();
else if (command === "render") output = renderInteraction(JSON.parse(fs.readFileSync(requiredArg(args[1], "render requires a Runtime interaction JSON file"), "utf8")));
else output = planExpertTurn(args.slice(command === "help" || command === "plan" ? 1 : 0).join(" ") || "help me use EvoPilot");
process.stdout.write(typeof output === "string" ? `${output}\n` : `${JSON.stringify(output, null, 2)}\n`);

function requiredArg(value: string | undefined, message: string): string {
  if (!value) throw new Error(message);
  return value;
}
