#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const DEFAULT_ACTIVE_GA_SOAK_WORKLOAD = "node scripts/release-matrix-project-loop.mjs";

export function resolveActiveGaSoakWorkload(environment = process.env) {
  return String(environment.EVOPILOT_GA_SOAK_WORKLOAD_COMMAND ?? "").trim()
    || DEFAULT_ACTIVE_GA_SOAK_WORKLOAD;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const workload = resolveActiveGaSoakWorkload();
  if (process.argv.includes("--print-workload")) {
    process.stdout.write(`${JSON.stringify({ workload })}\n`);
  } else {
    process.env.EVOPILOT_GA_SOAK_WORKLOAD_COMMAND = workload;
    await import("./ga-soak.mjs");
  }
}
