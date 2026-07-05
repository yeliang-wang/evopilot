import assert from "node:assert/strict";
import test from "node:test";
import {
  POSTGRES_BUSINESS_STORE_SCHEMA,
  PostgresBusinessStore,
  checksumPayload
} from "../../packages/server/dist/postgres-business-store.js";

class FakePostgresClient {
  statements = [];
  records = new Map();

  async query(sql, params = []) {
    this.statements.push({ sql, params });
    if (/INSERT INTO evopilot_business_records/.test(sql)) {
      const [collection, tenantId, workspaceId, recordId, schema, payload, sourceFile, checksum, createdAt, updatedAt] = params;
      const key = this.key(collection, tenantId, workspaceId, recordId);
      this.records.set(key, {
        collection,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        record_id: recordId,
        schema,
        payload: JSON.parse(payload),
        source_file: sourceFile,
        checksum,
        created_at: createdAt,
        updated_at: updatedAt
      });
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT collection/.test(sql) && /record_id = \$4/.test(sql)) {
      const [collection, tenantId, workspaceId, recordId] = params;
      const row = this.records.get(this.key(collection, tenantId, workspaceId, recordId));
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (/SELECT collection/.test(sql)) {
      const [collection] = params;
      const tenantFilterIndex = sql.includes("tenant_id = $2") ? 1 : -1;
      const workspaceFilterIndex = sql.includes("workspace_id = $3") ? 2 : sql.includes("workspace_id = $2") ? 1 : -1;
      const limit = Number(params.at(-1));
      const rows = [...this.records.values()]
        .filter((row) => row.collection === collection)
        .filter((row) => tenantFilterIndex === -1 || row.tenant_id === params[tenantFilterIndex])
        .filter((row) => workspaceFilterIndex === -1 || row.workspace_id === params[workspaceFilterIndex])
        .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)) || String(left.record_id).localeCompare(String(right.record_id)))
        .slice(0, limit);
      return { rows, rowCount: rows.length };
    }
    if (/DELETE FROM evopilot_business_records/.test(sql)) {
      const [collection, tenantId, workspaceId, recordId] = params;
      const deleted = this.records.delete(this.key(collection, tenantId, workspaceId, recordId));
      return { rows: [], rowCount: deleted ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  }

  key(collection, tenantId, workspaceId, recordId) {
    return `${collection}:${tenantId}:${workspaceId}:${recordId}`;
  }
}

test("postgres business store schema creates scoped JSONB records", () => {
  assert.ok(POSTGRES_BUSINESS_STORE_SCHEMA.some((sql) => /CREATE TABLE IF NOT EXISTS evopilot_business_records/.test(sql)));
  assert.ok(POSTGRES_BUSINESS_STORE_SCHEMA.some((sql) => /PRIMARY KEY \(collection, tenant_id, workspace_id, record_id\)/.test(sql)));
  assert.ok(POSTGRES_BUSINESS_STORE_SCHEMA.some((sql) => /USING gin \(payload\)/.test(sql)));
});

test("postgres business store upserts and reads tenant-scoped release decisions", async () => {
  const client = new FakePostgresClient();
  const store = new PostgresBusinessStore(client);
  await store.initialize();
  await store.upsert({
    collection: "release-decisions",
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    id: "decision-1",
    schema: "evopilot-release-decision/v1",
    payload: { id: "decision-1", status: "GO", criteria: [{ id: "postgres-store", passed: true }] },
    sourceFile: "release-decisions/decision-1.json",
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:01:00.000Z"
  });

  const found = await store.read("release-decisions", "decision-1", { tenantId: "tenant-a", workspaceId: "workspace-a" });
  assert.equal(found?.tenantId, "tenant-a");
  assert.equal(found?.workspaceId, "workspace-a");
  assert.equal(found?.payload.status, "GO");
  assert.equal(await store.read("release-decisions", "decision-1", { tenantId: "tenant-b", workspaceId: "workspace-a" }), undefined);
  assert.match(client.statements.find((statement) => /INSERT INTO/.test(statement.sql)).sql, /ON CONFLICT \(collection, tenant_id, workspace_id, record_id\)/);
});

test("postgres business store lists by collection and tenant filters", async () => {
  const client = new FakePostgresClient();
  const store = new PostgresBusinessStore(client);
  await store.upsert({ collection: "loops", tenantId: "tenant-a", workspaceId: "workspace-a", id: "loop-1", payload: { status: "RUNNING" } });
  await store.upsert({ collection: "loops", tenantId: "tenant-b", workspaceId: "workspace-b", id: "loop-2", payload: { status: "SUCCEEDED" } });
  await store.upsert({ collection: "projects", tenantId: "tenant-a", workspaceId: "workspace-a", id: "project-1", payload: { name: "EvoPilot" } });

  const tenantLoops = await store.list({ collection: "loops", tenantId: "tenant-a" });
  assert.equal(tenantLoops.length, 1);
  assert.equal(tenantLoops[0].id, "loop-1");
  assert.equal(tenantLoops[0].payload.status, "RUNNING");
});

test("business payload checksum is stable across object key order", () => {
  assert.equal(
    checksumPayload({ b: 2, a: { z: true, y: "ok" } }),
    checksumPayload({ a: { y: "ok", z: true }, b: 2 })
  );
});
