import { packageBoundaryFor } from "@evopilot/contracts";

export const EVOPILOT_CLI_INTERFACE_BOUNDARY_SCHEMA = "evopilot-cli-interface-boundary/v1";

export interface EvoPilotCliInterfaceBoundaryMetadata {
  schema: typeof EVOPILOT_CLI_INTERFACE_BOUNDARY_SCHEMA;
  packageName: "@evopilot/cli";
  layer: string;
  responsibilities: string[];
  rule: string;
}

export function cliInterfaceBoundaryMetadata(): EvoPilotCliInterfaceBoundaryMetadata {
  const boundary = packageBoundaryFor("@evopilot/cli");
  return {
    schema: EVOPILOT_CLI_INTERFACE_BOUNDARY_SCHEMA,
    packageName: "@evopilot/cli",
    layer: boundary?.layer ?? "interface",
    responsibilities: boundary?.owns ?? [
      "command parsing",
      "agent-safe JSON output",
      "stop-rule presentation"
    ],
    rule: "The CLI is an HTTP interface adapter. It must not bypass server RBAC, tenant/workspace scope, approval gates, source closure, release policy, or audit."
  };
}
