import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EVOPILOT_LIFECYCLE_MCP_TOOLS } from "../../packages/adapter-mcp/dist/index.js";
import { createServer } from "../../packages/server/dist/index.js";

const definition = (version, name) => `
schema: evopilot-lifecycle-definition/v1alpha1
metadata: { id: api-project, name: ${name}, version: ${version} }
capabilities: [project.read]
stages:
  - id: validate
    name: Validate
    action: { uses: project.validate@1, with: { strict: true } }
    decision: { mode: AUTO }
`;

test("Lifecycle Registry exposes consistent governed CRUD through HTTP and MCP contracts", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-lifecycle-api-"));
  const server = createServer({ dataRoot, runtimeMode: "debug", tokens: [
    { name: "viewer", token: "viewer-token", role: "viewer" },
    { name: "admin", token: "admin-token", role: "admin" }
  ] });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const registered1 = await request(base, "/api/v1/lifecycles", "POST", "admin-token", { yaml: definition("1.0.0", "API Project"), evidenceRef: "decision://create" });
    assert.equal(registered1.status, 201);
    const v1 = registered1.body.data;
    const activated1 = await request(base, "/api/v1/lifecycles/api-project/activate", "POST", "admin-token", { version: "1.0.0", evidenceRef: "decision://activate" });
    assert.equal(activated1.status, 200);
    const registered2 = await request(base, "/api/v1/lifecycles", "POST", "admin-token", { yaml: definition("1.1.0", "API Project Successor"), evidenceRef: "decision://successor" });
    assert.equal(registered2.status, 201);
    const diff = await request(base, "/api/v1/lifecycles/api-project/diff?from=1.0.0&to=1.1.0", "GET", "viewer-token");
    assert.equal(diff.status, 200);
    assert.equal(diff.body.data.runningBindingsAffected, false);
    const conflict = await request(base, "/api/v1/lifecycles/api-project/activate", "POST", "admin-token", { version: "1.1.0", evidenceRef: "decision://activate-successor", expectedActiveDigest: "sha256:" + "0".repeat(64) });
    assert.equal(conflict.status, 409);
    const activated2 = await request(base, "/api/v1/lifecycles/api-project/activate", "POST", "admin-token", { version: "1.1.0", evidenceRef: "decision://activate-successor", expectedActiveDigest: v1.revisionDigest });
    assert.equal(activated2.status, 200);
    const old = await request(base, "/api/v1/lifecycles/api-project?version=1.0.0", "GET", "viewer-token");
    assert.equal(old.body.data.revisionDigest, v1.revisionDigest);
    assert.equal(old.body.data.active, false);
    const audit = await request(base, "/api/v1/lifecycles/api-project/audit", "GET", "viewer-token");
    assert.deepEqual(audit.body.data.filter((item) => item.action === "REGISTER").length, 2);
    assert.ok(EVOPILOT_LIFECYCLE_MCP_TOOLS.some((tool) => tool.name === "evopilot_lifecycle_rollback" && tool.authority === "EXACT_BINDING_DECISION"));
    assert.ok(EVOPILOT_LIFECYCLE_MCP_TOOLS.some((tool) => tool.name === "evopilot_lifecycle_audit" && tool.method === "GET"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function request(base, route, method, token, body) {
  const response = await fetch(`${base}${route}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}
