#!/usr/bin/env node

import { EVOLUTION_EXPERT_CORE, createExpertAdapter, expertCompatibility, planExpertTurn } from "./index.js";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
let output: unknown;
if (command === "manifest") output = EVOLUTION_EXPERT_CORE;
else if (command === "adapter") output = createExpertAdapter(args[1] ?? "generic-agent");
else if (command === "compatibility") {
  const adapter = createExpertAdapter(args[1] ?? "generic-agent");
  output = expertCompatibility(adapter, args[2] ?? "5.0.0", ["structured-tool-results", "local-or-remote-mcp", "human-decision-presentation"]);
} else output = planExpertTurn(args.slice(command === "help" ? 1 : 0).join(" ") || "help me use EvoPilot");
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
