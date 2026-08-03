import { packageBoundaryFor } from "@evopilot/contracts";

export const EVOPILOT_SERVER_COMPOSITION_ROOT_SCHEMA = "evopilot-server-composition-root/v1";

export interface EvoPilotServerCompositionRootMetadata {
  schema: typeof EVOPILOT_SERVER_COMPOSITION_ROOT_SCHEMA;
  packageName: "@evopilot/server";
  layer: string;
  responsibilities: string[];
  delegatesTo: string[];
  rule: string;
}

export function serverCompositionRootMetadata(): EvoPilotServerCompositionRootMetadata {
  const boundary = packageBoundaryFor("@evopilot/server");
  return {
    schema: EVOPILOT_SERVER_COMPOSITION_ROOT_SCHEMA,
    packageName: "@evopilot/server",
    layer: boundary?.layer ?? "interface",
    responsibilities: boundary?.owns ?? [
      "HTTP composition root",
      "RBAC enforcement",
      "tenant/workspace scoped API orchestration"
    ],
    delegatesTo: [
      "@evopilot/contracts",
      "@evopilot/core",
      "@evopilot/llm",
      "@evopilot/adapter-github",
      "@evopilot/adapter-gitlab",
      "@evopilot/adapter-code-upgrader"
    ],
    rule: "The server owns transport, auth, audit, and orchestration; domain rules must move behind domain or contract modules before reuse by CLI or Dashboard."
  };
}
