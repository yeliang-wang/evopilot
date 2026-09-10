import assert from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const adapterEntrypoint = path.join(repositoryRoot, "packages/adapter-mcp/dist/stdio.js");

test("installed-style stdio MCP exposes the complete lifecycle surface and delegates to HTTP authority", async () => {
  const binDirectory = await mkdtemp(path.join(os.tmpdir(), "evopilot-mcp-bin-"));
  const installedStyleEntrypoint = path.join(binDirectory, "evopilot-mcp");
  await symlink(adapterEntrypoint, installedStyleEntrypoint);
  const requests = [];
  const api = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      tenant: request.headers["x-evopilot-tenant"],
      workspace: request.headers["x-evopilot-workspace"],
      actor: request.headers["x-evopilot-actor"],
      idempotencyKey: request.headers["x-idempotency-key"],
      body: body ? JSON.parse(body) : undefined
    });
    response.writeHead(200, { "content-type": "application/json", "x-request-id": "request-mcp-1" });
    response.end(JSON.stringify({ data: { delegated: true, path: request.url } }));
  });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  const address = api.address();
  assert.ok(address && typeof address === "object");

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [installedStyleEntrypoint],
    cwd: repositoryRoot,
    stderr: "pipe",
    env: {
      ...process.env,
      EVOPILOT_SERVER: `http://127.0.0.1:${address.port}`,
      EVOPILOT_API_TOKEN: "mcp-test-token",
      EVOPILOT_TENANT: "tenant-a",
      EVOPILOT_WORKSPACE: "workspace-a",
      EVOPILOT_ACTOR: "host-user"
    }
  });
  const client = new Client({ name: "evopilot-mcp-functional-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const listing = await client.listTools();
    assert.equal(listing.tools.length, 43);
    for (const name of ["evopilot_resource_register", "evopilot_resource_diff", "evopilot_capability_inventory_validate", "evopilot_action_provider_qualify", "evopilot_governance_pack_evaluate", "evopilot_remediation_campaign_start", "evopilot_remediation_campaign_resume"]) {
      assert.ok(listing.tools.some((tool) => tool.name === name), `${name} missing`);
    }
    assert.ok(listing.tools.some((tool) => tool.name === "evopilot_project_definition_register"));
    assert.ok(listing.tools.some((tool) => tool.name === "evopilot_project_definition_discover"));
    assert.ok(listing.tools.some((tool) => tool.name === "evopilot_project_definition_diff"));
    assert.ok(listing.tools.some((tool) => tool.name === "evopilot_project_definition_activate"));
    assert.ok(listing.tools.some((tool) => tool.name === "evopilot_governed_evolution_plan"));
    assert.ok(listing.tools.some((tool) => tool.name === "evopilot_governed_evolution_run"));
    assert.ok(listing.tools.some((tool) => tool.name === "evopilot_recovery_decide"));
    assert.ok(listing.tools.some((tool) => tool.name === "evopilot_interaction_render"));
    assert.ok(listing.tools.some((tool) => tool.name === "evopilot_lifecycle_finalize_binding"));
    assert.ok(listing.tools.some((tool) => tool.name === "evopilot_lifecycle_decision"));

    const inspected = await client.callTool({
      name: "evopilot_lifecycle_inspect",
      arguments: { lifecycleId: "oss lifecycle", version: "1.0.0" }
    });
    assert.equal(inspected.isError, false);
    assert.equal(inspected.structuredContent.ok, true);
    assert.equal(inspected.structuredContent.requestId, "request-mcp-1");
    assert.equal(requests[0].url, "/api/v1/lifecycles/oss%20lifecycle?version=1.0.0");
    assert.equal(requests[0].authorization, "Bearer mcp-test-token");
    assert.equal(requests[0].tenant, "tenant-a");
    assert.equal(requests[0].workspace, "workspace-a");
    assert.equal(requests[0].actor, "host-user");

    const decision = await client.callTool({
      name: "evopilot_lifecycle_decision",
      arguments: {
        runId: "run/one",
        idempotencyKey: "decision-once",
        payload: { bindingDigest: "sha256:exact", stageId: "publication", decision: "REJECTED" }
      }
    });
    assert.equal(decision.isError, false);
    assert.equal(requests[1].method, "POST");
    assert.equal(requests[1].url, "/api/v1/lifecycle-runs/run%2Fone/decision");
    assert.equal(requests[1].idempotencyKey, "decision-once");
    assert.deepEqual(requests[1].body, { bindingDigest: "sha256:exact", stageId: "publication", decision: "REJECTED" });

    const missingBinding = await client.callTool({ name: "evopilot_lifecycle_run_inspect", arguments: {} });
    assert.equal(missingBinding.isError, true);
    assert.match(missingBinding.content[0].text, /runId is required/);
  } finally {
    await client.close();
    await new Promise((resolve, reject) => api.close((error) => error ? reject(error) : resolve()));
    await rm(binDirectory, { recursive: true, force: true });
  }
});
