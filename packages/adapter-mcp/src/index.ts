import { EVOPILOT_PRODUCT_VERSION_FALLBACK } from "@evopilot/contracts";
export type { EvoPilotLifecycleExecutorAdapterV1 as LifecycleExecutorAdapterV1 } from "@evopilot/contracts";

export interface McpEvidenceSignal {
  toolName: string;
  traceId?: string;
  status: "SUCCEEDED" | "FAILED" | "PARTIAL";
  message: string;
  attributes?: Record<string, unknown>;
}

export const EVOPILOT_LIFECYCLE_MCP_SCHEMA = "evopilot-lifecycle-mcp-surface/v1alpha1" as const;
export const EVOPILOT_ADAPTER_MCP_VERSION = EVOPILOT_PRODUCT_VERSION_FALLBACK;

export interface EvoPilotLifecycleMcpTool {
  name: string;
  description: string;
  method: "GET" | "POST";
  path: string;
  authority: "NONE" | "EXACT_BINDING_DECISION" | "EXTERNAL_EXECUTION_RECEIPT";
}

export const EVOPILOT_LIFECYCLE_MCP_TOOLS: EvoPilotLifecycleMcpTool[] = [
  { name: "evopilot_project_definition_list", description: "List versioned declarative EvolutionProjectDefinitions.", method: "GET", path: "/api/v1/evolution-project-definitions", authority: "NONE" },
  { name: "evopilot_project_definition_inspect", description: "Inspect one exact declarative project definition.", method: "GET", path: "/api/v1/evolution-project-definitions/{projectDefinitionId}", authority: "NONE" },
  { name: "evopilot_project_definition_register", description: "Register one immutable human-reviewable project definition; configuration is not approval.", method: "POST", path: "/api/v1/evolution-project-definitions", authority: "NONE" },
  { name: "evopilot_governed_evolution_plan", description: "Resolve Project plus GoalTarget to one published HarnessBundle, compose its open Lifecycle, and create an immutable HarnessExecutionBinding.", method: "POST", path: "/api/v1/governed-evolution/plan", authority: "NONE" },
  { name: "evopilot_governed_evolution_revalidate", description: "Revalidate an exact HarnessExecutionBinding before start, resume, retry, or Loop iteration.", method: "POST", path: "/api/v1/governed-evolution/revalidate", authority: "NONE" },
  { name: "evopilot_recovery_decide", description: "Classify a failure and return the bounded automatic or human recovery boundary.", method: "POST", path: "/api/v1/governed-evolution/recovery/decide", authority: "NONE" },
  { name: "evopilot_automation_registry_inspect", description: "Inspect Automation Registry proposals and active, revoked, or expired rules.", method: "GET", path: "/api/v1/automation-registry", authority: "NONE" },
  { name: "evopilot_automation_rule_propose", description: "Create an inspectable immutable proposal for one reusable safe recovery rule.", method: "POST", path: "/api/v1/automation-registry/proposals", authority: "NONE" },
  { name: "evopilot_automation_rule_activate", description: "Activate one exact Automation Registry proposal after the user's digest-bound decision.", method: "POST", path: "/api/v1/automation-registry/{ruleId}/activate", authority: "EXACT_BINDING_DECISION" },
  { name: "evopilot_automation_rule_revoke", description: "Revoke an Automation Registry rule with exact human evidence.", method: "POST", path: "/api/v1/automation-registry/{ruleId}/revoke", authority: "EXACT_BINDING_DECISION" },
  { name: "evopilot_interaction_render", description: "Render a Runtime-owned Human Interaction Protocol object for any compatible Expert or headless client.", method: "POST", path: "/api/v1/interactions/render", authority: "NONE" },
  { name: "evopilot_lifecycle_list", description: "List available human-readable Lifecycle definitions.", method: "GET", path: "/api/v1/lifecycles", authority: "NONE" },
  { name: "evopilot_lifecycle_inspect", description: "Inspect one exact Lifecycle revision and its digest.", method: "GET", path: "/api/v1/lifecycles/{lifecycleId}", authority: "NONE" },
  { name: "evopilot_lifecycle_resolve", description: "Resolve an explicit or metadata-matched Lifecycle without project-specific Engine branches.", method: "POST", path: "/api/v1/lifecycles/resolve", authority: "NONE" },
  { name: "evopilot_lifecycle_resolve_inputs", description: "Resolve declared and discovered inputs and return only the next unresolved question.", method: "POST", path: "/api/v1/lifecycles/resolve-inputs", authority: "NONE" },
  { name: "evopilot_lifecycle_start", description: "Create a digest-bound Lifecycle run without authorizing execution.", method: "POST", path: "/api/v1/lifecycle-runs", authority: "NONE" },
  { name: "evopilot_lifecycle_run_list", description: "List Lifecycle runs in the authenticated tenant and workspace.", method: "GET", path: "/api/v1/lifecycle-runs", authority: "NONE" },
  { name: "evopilot_lifecycle_run_inspect", description: "Inspect one Lifecycle run and its current immutable binding.", method: "GET", path: "/api/v1/lifecycle-runs/{runId}", authority: "NONE" },
  { name: "evopilot_lifecycle_answer", description: "Answer declared input questions; answers never imply approval.", method: "POST", path: "/api/v1/lifecycle-runs/{runId}/answer", authority: "NONE" },
  { name: "evopilot_lifecycle_finalize_binding", description: "Finalize one immutable Lifecycle execution binding without approving it.", method: "POST", path: "/api/v1/lifecycle-runs/{runId}/finalize-binding", authority: "NONE" },
  { name: "evopilot_lifecycle_authorize", description: "Record an explicit decision for one exact immutable binding digest.", method: "POST", path: "/api/v1/lifecycle-runs/{runId}/authorize", authority: "EXACT_BINDING_DECISION" },
  { name: "evopilot_lifecycle_decision", description: "Record an explicit human decision at the exact pending Lifecycle stage and binding digest.", method: "POST", path: "/api/v1/lifecycle-runs/{runId}/decision", authority: "EXACT_BINDING_DECISION" },
  { name: "evopilot_lifecycle_cancel", description: "Cancel a non-terminal Lifecycle run against its exact binding digest with auditable human evidence.", method: "POST", path: "/api/v1/lifecycle-runs/{runId}/cancel", authority: "EXACT_BINDING_DECISION" },
  { name: "evopilot_lifecycle_advance", description: "Advance automatic stages until the next real authority or external execution boundary.", method: "POST", path: "/api/v1/lifecycle-runs/{runId}/advance", authority: "NONE" },
  { name: "evopilot_lifecycle_record_external_result", description: "Record a reviewed third-party Agent execution receipt for the exact pending request.", method: "POST", path: "/api/v1/lifecycle-runs/{runId}/external-result", authority: "EXTERNAL_EXECUTION_RECEIPT" },
  { name: "evopilot_lifecycle_export_feedback", description: "Create an approved, strict-redacted, immutable private feedback package without mutating Harness assets.", method: "POST", path: "/api/v1/lifecycle-runs/{runId}/feedback", authority: "EXACT_BINDING_DECISION" }
];
