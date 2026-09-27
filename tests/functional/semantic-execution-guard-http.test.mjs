import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {createServer} from "../../packages/server/dist/index.js";

test("public Lifecycle/governed entry rejects explicit unsupported semantic execution rather than dropping its fields", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-guard-http-")); t.after(() => fs.rm(root, {recursive: true, force: true}));
  const server = createServer({dataRoot: root, runtimeMode: "debug", llmClient: {}, allowSampleData: false, autoRegisterProfileProject: false,
    tokens: [{name: "synthetic-operator", token: "synthetic-only", role: "operator", tenantId: "tenant", workspaceId: "workspace"}]});
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const endpoint of ["/api/v1/lifecycle-runs", "/api/v1/governed-evolution/plan", "/api/v1/governed-evolution/runs"]) {
    for (const key of ["semanticExecutionBindingDigest", "semanticExecutionBinding", "semanticContextSlice", "semanticContext", "outcomePlan", "semanticOutcomePlan"]) {
      const response = await fetch(base + endpoint, {method: "POST", headers: {authorization: "Bearer synthetic-only", "content-type": "application/json"}, body: JSON.stringify({[key]: "sha256:" + "a".repeat(64)})});
      assert(response.status >= 400); assert.equal((await response.json()).error, "SEMANTIC_EXECUTION_INTEGRATION_REQUIRED");
    }
  }
  assert.deepEqual(await fs.readdir(path.join(root, "lifecycle-runs")), []);
});
