import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  discoverFileBusinessRecords,
  filePayloadToRecord
} from "../../scripts/postgres-business-store.mjs";

test("file to postgres migration discovers core business collections", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-pg-migration-"));
  fs.mkdirSync(path.join(dataRoot, "tenants"), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, "workspaces"), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, "projects"), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, "loops"), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, "release-decisions"), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, "audit"), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, "tenants", "tenant-a.json"), JSON.stringify({ id: "tenant-a", schema: "tenant/v1" }), "utf8");
  fs.writeFileSync(path.join(dataRoot, "workspaces", "workspace-a.json"), JSON.stringify({ id: "workspace-a", tenantId: "tenant-a" }), "utf8");
  fs.writeFileSync(path.join(dataRoot, "projects", "project-a.json"), JSON.stringify({ id: "project-a", tenantId: "tenant-a", workspaceId: "workspace-a" }), "utf8");
  fs.writeFileSync(path.join(dataRoot, "loops", "loop-a.json"), JSON.stringify({ id: "loop-a", tenantId: "tenant-a", workspaceId: "workspace-a", status: "SUCCEEDED" }), "utf8");
  fs.writeFileSync(path.join(dataRoot, "release-decisions", "decision-a.json"), JSON.stringify({ id: "decision-a", tenantId: "tenant-a", workspaceId: "workspace-a", status: "GO" }), "utf8");
  fs.writeFileSync(path.join(dataRoot, "audit", "audit.jsonl"), `${JSON.stringify({ id: "audit-a", tenantId: "tenant-a", workspaceId: "workspace-a", action: "release.approved" })}\n`, "utf8");

  const records = discoverFileBusinessRecords(dataRoot);
  assert.deepEqual(records.map((record) => record.collection).sort(), [
    "audit-events",
    "loops",
    "projects",
    "release-decisions",
    "tenants",
    "workspaces"
  ]);
  assert.equal(records.find((record) => record.collection === "release-decisions")?.payload.status, "GO");
  assert.equal(records.find((record) => record.collection === "audit-events")?.sourceFile, "audit/audit.jsonl");
});

test("file payload mapping preserves tenant and workspace boundaries", () => {
  const record = filePayloadToRecord(
    "source-release-runs",
    "source-release-runs/run-1.json",
    { id: "run-1", tenantId: "tenant-a", workspaceId: "workspace-a", schema: "evopilot-source-release-closure-run/v1" },
    "fallback"
  );
  assert.equal(record.id, "run-1");
  assert.equal(record.tenantId, "tenant-a");
  assert.equal(record.workspaceId, "workspace-a");
  assert.equal(record.schema, "evopilot-source-release-closure-run/v1");
  assert.equal(record.sourceFile, "source-release-runs/run-1.json");
});
