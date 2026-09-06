#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod";
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
  version: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).optional().describe("JSON request body. Approval fields remain subject to server-side exact-binding gates.")
});

type ToolInput = z.infer<typeof toolInputSchema>;

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
        inputSchema: toolInputSchema,
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
      async (input) => invokeEvoPilot(tool, input)
    );
  }
  return server;
}

async function invokeEvoPilot(tool: EvoPilotLifecycleMcpTool, input: ToolInput) {
  try {
    const path = bindPath(tool.path, input);
    const serverUrl = normalizeServerUrl(input.serverUrl ?? process.env.EVOPILOT_SERVER ?? process.env.EVOPILOT_BASE_URL ?? "http://127.0.0.1:19876");
    const url = new URL(path, serverUrl);
    if (tool.name === "evopilot_lifecycle_inspect" && input.version) url.searchParams.set("version", input.version);

    const headers = new Headers({ accept: "application/json" });
    const token = process.env.EVOPILOT_API_TOKEN;
    if (token) headers.set("authorization", `Bearer ${token}`);
    setHeaderFromEnvironment(headers, "x-evopilot-tenant", "EVOPILOT_TENANT");
    setHeaderFromEnvironment(headers, "x-evopilot-workspace", "EVOPILOT_WORKSPACE");
    setHeaderFromEnvironment(headers, "x-evopilot-actor", "EVOPILOT_ACTOR");
    if (input.idempotencyKey) headers.set("x-idempotency-key", input.idempotencyKey);

    let body: string | undefined;
    if (tool.method === "POST") {
      headers.set("content-type", "application/json");
      body = JSON.stringify(input.payload ?? {});
    }
    const response = await fetch(url, { method: tool.method, headers, body });
    const parsed = await parseResponse(response);
    const result = {
      schema: "evopilot-mcp-http-result/v1",
      tool: tool.name,
      authority: tool.authority,
      status: response.status,
      ok: response.ok,
      requestId: response.headers.get("x-request-id") ?? undefined,
      response: parsed
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      structuredContent: result,
      isError: !response.ok
    };
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

function bindPath(path: string, input: ToolInput): string {
  return path.replace(/\{(lifecycleId|runId)\}/g, (_match, name: "lifecycleId" | "runId") => {
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

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  serveStdio(createEvoPilotMcpServer, {
    onerror: (error) => process.stderr.write(`[evopilot-mcp] ${error.message}\n`)
  });
}
