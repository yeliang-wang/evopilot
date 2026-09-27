#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod";
import {projectSemanticRequest, requireProjectSemanticCapability, semanticExecutionRequest, requireSemanticExecutionCapability} from "@evopilot/contracts";
import {
  EVOPILOT_ADAPTER_MCP_VERSION,
  EVOPILOT_LIFECYCLE_MCP_SCHEMA,
  EVOPILOT_LIFECYCLE_MCP_TOOLS,
  type EvoPilotLifecycleMcpTool
} from "./index.js";

const toolInputSchema = z.object({
  serverUrl: z.string().url().optional().describe("EvoPilot API base URL; defaults to EVOPILOT_SERVER."),
  lifecycleId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  profileId: z.string().min(1).optional(),
  campaignId: z.string().min(1).optional(),
  observationId: z.string().min(1).optional(),
  proposalId: z.string().min(1).optional(),
  projectId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/).optional(),
  projectDefinitionId: z.string().min(1).optional(),
  ruleId: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  fromVersion: z.string().min(1).optional(),
  toVersion: z.string().min(1).optional(),
  runtimeVersion: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).optional().describe("JSON request body. Approval fields remain subject to server-side exact-binding gates.")
});

const semanticToolInputSchema = toolInputSchema.pick({serverUrl: true, idempotencyKey: true}).extend({
  projectId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
  catalogId: z.string().optional(),
  artifactSetDigest: z.string().optional(),
  bundleDigest: z.string().optional(),
  reviewDigest: z.string().optional(),
  action: z.enum(["ACTIVATE", "MIGRATE", "ROLLBACK"]).optional(),
  expectedHeadDigest: z.string().optional(),
  destinationDigest: z.string().optional(),
  transitionReviewDigest: z.string().optional(),
  decision: z.literal("APPROVE").optional().describe("Only pass after the user explicitly approves this exact Runtime review digest.")
}).strict();
type ToolInput = z.infer<typeof toolInputSchema> & Partial<z.infer<typeof semanticToolInputSchema>>;
const semanticBase = {serverUrl: true, idempotencyKey: true, projectId: true} as const;
const executionToolSchema = semanticToolInputSchema.pick({serverUrl: true, idempotencyKey: true, projectId: true}).extend({payload: z.record(z.string(), z.unknown())}).strict();
const semanticSchemas = {
  capabilities: semanticToolInputSchema.pick(semanticBase),
  binding: semanticToolInputSchema.pick(semanticBase),
  activation: semanticToolInputSchema.pick(semanticBase),
  transitionReview: semanticToolInputSchema.pick({...semanticBase, action: true, expectedHeadDigest: true, destinationDigest: true}).required({action: true, expectedHeadDigest: true, destinationDigest: true}),
  transitionApprove: semanticToolInputSchema.pick({...semanticBase, transitionReviewDigest: true, decision: true}).required({transitionReviewDigest: true, decision: true}),
  inspect: semanticToolInputSchema.pick({...semanticBase, catalogId: true}).required({catalogId: true}),
  onboarding: semanticToolInputSchema.pick({...semanticBase, catalogId: true}).required({catalogId: true}),
  compatibility: semanticToolInputSchema.pick({...semanticBase, catalogId: true, artifactSetDigest: true, bundleDigest: true}).required({catalogId: true, artifactSetDigest: true, bundleDigest: true}),
  gap: semanticToolInputSchema.pick({...semanticBase, catalogId: true, artifactSetDigest: true, bundleDigest: true}).required({catalogId: true, artifactSetDigest: true, bundleDigest: true}),
  review: semanticToolInputSchema.pick({...semanticBase, catalogId: true, artifactSetDigest: true, bundleDigest: true}).required({catalogId: true, artifactSetDigest: true, bundleDigest: true}),
  approve: semanticToolInputSchema.pick({...semanticBase, reviewDigest: true, decision: true}).required({reviewDigest: true, decision: true})
};

export function createEvoPilotMcpServer(): McpServer {
  const server = new McpServer(
    { name: "evopilot-open-lifecycle", version: EVOPILOT_ADAPTER_MCP_VERSION },
    { capabilities: { tools: {} } }
  );

  for (const tool of EVOPILOT_LIFECYCLE_MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: titleFor(tool.name),
        description: `${tool.description} Authority: ${tool.authority}.`,
        inputSchema: tool.executionOperation ? (tool.executionOperation === "capabilities" ? executionToolSchema.omit({payload: true}) : executionToolSchema) : tool.semanticOperation ? semanticSchemas[tool.semanticOperation] : toolInputSchema,
        annotations: {
          readOnlyHint: tool.method === "GET",
          destructiveHint: tool.authority !== "NONE",
          idempotentHint: tool.method === "GET",
          openWorldHint: true
        },
        _meta: {
          "evopilot/schema": EVOPILOT_LIFECYCLE_MCP_SCHEMA,
          "evopilot/authority": tool.authority,
          "evopilot/httpMethod": tool.method,
          "evopilot/httpPath": tool.path
        }
      },
      async (input: ToolInput) => invokeEvoPilot(tool, input)
    );
  }
  return server;
}

async function invokeEvoPilot(tool: EvoPilotLifecycleMcpTool, input: ToolInput) {
  try {
    const semanticInput = Object.fromEntries(Object.entries(input).filter(([key]) => !["serverUrl", "idempotencyKey"].includes(key)));
    const semantic = tool.semanticOperation ? projectSemanticRequest(tool.semanticOperation, semanticInput) : undefined;
    const execution = tool.executionOperation ? semanticExecutionRequest(tool.executionOperation, input.projectId!, input.payload) : undefined;
    const path = execution?.path ?? semantic?.path ?? bindPath(tool.path, input);
    const serverUrl = normalizeServerUrl(input.serverUrl ?? process.env.EVOPILOT_SERVER ?? process.env.EVOPILOT_BASE_URL ?? "http://127.0.0.1:19876");
    const url = new URL(path, serverUrl);
    if ((tool.name.includes("inspect") || tool.name === "evopilot_lifecycle_dependencies" || tool.name === "evopilot_lifecycle_usage") && input.version) url.searchParams.set("version", input.version);
    if (input.fromVersion) url.searchParams.set("from", input.fromVersion);
    if (input.toVersion) url.searchParams.set("to", input.toVersion);
    if (input.runtimeVersion) url.searchParams.set("runtimeVersion", input.runtimeVersion);

    const headers = new Headers({ accept: "application/json" });
    const token = process.env.EVOPILOT_API_TOKEN;
    if (token) headers.set("authorization", `Bearer ${token}`);
    setHeaderFromEnvironment(headers, "x-evopilot-tenant", "EVOPILOT_TENANT");
    setHeaderFromEnvironment(headers, "x-evopilot-workspace", "EVOPILOT_WORKSPACE");
    setHeaderFromEnvironment(headers, "x-evopilot-actor", "EVOPILOT_ACTOR");
    if (input.idempotencyKey) headers.set("x-idempotency-key", input.idempotencyKey);

    if (execution && tool.executionOperation !== "capabilities") {
      const capability = await fetch(new URL(execution.capabilityPath, serverUrl), {headers, redirect: "error", signal: AbortSignal.timeout(30000)});
      const parsed = await parseResponse(capability);
      if (!capability.ok) return httpResult(tool, capability, parsed, "CAPABILITY_NEGOTIATION");
      requireSemanticExecutionCapability(unwrapData(parsed), input.projectId!, tool.executionOperation!);
    }

    if (semantic && semantic.operation !== "capabilities") {
      const capability = await fetch(new URL(semantic.capabilityPath, serverUrl), {headers, redirect: "error", signal: AbortSignal.timeout(30000)});
      const parsed = await parseResponse(capability);
      if (!capability.ok) return httpResult(tool, capability, parsed, "CAPABILITY_NEGOTIATION");
      requireProjectSemanticCapability(unwrapData(parsed), input.projectId!, semantic.operation);
    }

    let body: string | undefined;
    if (tool.method === "POST" || tool.method === "DELETE") {
      headers.set("content-type", "application/json");
      body = JSON.stringify(execution?.body ?? semantic?.body ?? input.payload ?? {});
    }
    const response = await fetch(url, { method: tool.method, headers, body,
      ...(semantic || execution ? {redirect: "error" as const, signal: AbortSignal.timeout(30000)} : {}) });
    const parsed = await parseResponse(response);
    if (semantic?.operation === "capabilities" && response.ok) requireProjectSemanticCapability(unwrapData(parsed), input.projectId!, semantic.operation);
    if (tool.executionOperation === "capabilities" && response.ok) requireSemanticExecutionCapability(unwrapData(parsed), input.projectId!, "capabilities");
    return httpResult(tool, response, parsed);
  } catch (error) {
    const result = {
      schema: "evopilot-mcp-http-result/v1",
      tool: tool.name,
      authority: tool.authority,
      status: 0,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      structuredContent: result,
      isError: true
    };
  }
}

function unwrapData(value: unknown): unknown {
  return value && typeof value === "object" && "data" in value ? value.data : value;
}
function httpResult(tool: EvoPilotLifecycleMcpTool, response: Response, parsed: unknown, stage?: string) {
  const result = {schema: "evopilot-mcp-http-result/v1", tool: tool.name, authority: tool.authority,
    status: response.status, ok: response.ok, requestId: response.headers.get("x-request-id") ?? undefined,
    response: parsed, ...(stage ? {stage} : {})};
  return {content: [{type: "text" as const, text: JSON.stringify(result)}], structuredContent: result, isError: !response.ok};
}

function bindPath(path: string, input: ToolInput): string {
  return path.replace(/\{(lifecycleId|runId|kind|resourceId|profileId|campaignId|observationId|proposalId|projectId|projectDefinitionId|ruleId)\}/g, (_match, name: "lifecycleId" | "runId" | "kind" | "resourceId" | "profileId" | "campaignId" | "observationId" | "proposalId" | "projectId" | "projectDefinitionId" | "ruleId") => {
    const value = input[name];
    if (!value) throw new Error(`${name} is required for this tool`);
    return encodeURIComponent(value);
  });
}

function normalizeServerUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("serverUrl or EVOPILOT_SERVER must not be empty");
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function setHeaderFromEnvironment(headers: Headers, header: string, environmentName: string): void {
  const value = process.env[environmentName];
  if (value) headers.set(header, value);
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function titleFor(name: string): string {
  return name.replace(/^evopilot_/, "").split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

if (isDirectExecution()) {
  serveStdio(createEvoPilotMcpServer, {
    onerror: (error) => process.stderr.write(`[evopilot-mcp] ${error.message}\n`)
  });
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
