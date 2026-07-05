#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { PostgresBusinessStore } from "../packages/server/dist/postgres-business-store.js";

const DEFAULT_TENANT_ID = "default";
const DEFAULT_WORKSPACE_ID = "default";

const COLLECTION_DIRS = [
  ["tenants", "tenants"],
  ["workspaces", "workspaces"],
  ["projects", "projects"],
  ["loops", "loops"],
  ["loop-workspaces", "loop-workspaces"],
  ["executor-graphs", "executor-graphs"],
  ["release-evidence", "release-evidence"],
  ["release-targets", "release-targets"],
  ["release-decisions", "release-decisions"],
  ["source-release-runs", "source-release-runs"],
  ["source-release-deploy-finalizers", "source-release-deploy-finalizers"],
  ["target-loops", "target-loops"],
  ["idempotency", "idempotency"]
];

export function discoverFileBusinessRecords(dataRoot) {
  const records = [];
  for (const [collection, relativeDir] of COLLECTION_DIRS) {
    const dir = path.join(dataRoot, relativeDir);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((item) => item.endsWith(".json")).sort()) {
      const sourceFile = path.join(relativeDir, file);
      const payload = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      records.push(filePayloadToRecord(collection, sourceFile, payload, path.basename(file, ".json")));
    }
  }

  const auditFile = path.join(dataRoot, "audit", "audit.jsonl");
  if (fs.existsSync(auditFile)) {
    const lines = fs.readFileSync(auditFile, "utf8").split(/\r?\n/).filter(Boolean);
    lines.forEach((line, index) => {
      const payload = JSON.parse(line);
      const id = String(payload.id ?? payload.requestId ?? `audit-${index + 1}-${shortHash(line)}`);
      records.push(filePayloadToRecord("audit-events", "audit/audit.jsonl", payload, id));
    });
  }
  return records;
}

export function filePayloadToRecord(collection, sourceFile, payload, fallbackId) {
  return {
    collection,
    tenantId: String(payload.tenantId ?? payload.tenant_id ?? DEFAULT_TENANT_ID),
    workspaceId: String(payload.workspaceId ?? payload.workspace_id ?? DEFAULT_WORKSPACE_ID),
    id: String(payload.id ?? payload.recordId ?? payload.key ?? fallbackId),
    schema: typeof payload.schema === "string" ? payload.schema : undefined,
    payload,
    sourceFile,
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : undefined,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : undefined
  };
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = parseArgs(rest);
  if (!command || command === "help" || options.help) {
    printHelp();
    return;
  }
  if (command === "migrate") {
    await migrate(options);
    return;
  }
  if (command === "backup") {
    await backup(options);
    return;
  }
  if (command === "restore") {
    await restore(options);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

async function migrate(options) {
  const dataRoot = path.resolve(options.dataRoot ?? process.env.EVOPILOT_DATA_ROOT ?? "data/evopilot");
  const records = discoverFileBusinessRecords(dataRoot);
  if (options.dryRun) {
    writeJson({
      command: "migrate",
      mode: "dry-run",
      dataRoot,
      recordCount: records.length,
      collections: summarizeRecords(records)
    });
    return;
  }
  const store = await connectStore(options);
  await store.initialize();
  for (const record of records) {
    await store.upsert(record);
  }
  await closeStore(store);
  writeJson({
    command: "migrate",
    mode: "write",
    dataRoot,
    recordCount: records.length,
    collections: summarizeRecords(records)
  });
}

async function backup(options) {
  const output = options.out ? path.resolve(options.out) : path.resolve(`evopilot-postgres-business-backup-${Date.now()}.jsonl`);
  const connection = await connectStoreConnection(options);
  await connection.store.initialize();
  const result = await connection.client.query(
    `SELECT collection, tenant_id, workspace_id, record_id, schema, payload, source_file, created_at, updated_at
     FROM evopilot_business_records
     ORDER BY collection ASC, tenant_id ASC, workspace_id ASC, record_id ASC`
  );
  const rows = result.rows.map((row) => ({
    collection: row.collection,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    id: row.record_id,
    schema: row.schema ?? undefined,
    payload: row.payload,
    sourceFile: row.source_file ?? undefined,
    createdAt: normalizeBackupTimestamp(row.created_at),
    updatedAt: normalizeBackupTimestamp(row.updated_at)
  }));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
  await connection.client.end();
  writeJson({ command: "backup", output, recordCount: rows.length, collections: summarizeRecords(rows) });
}

async function restore(options) {
  const input = options.in ? path.resolve(options.in) : undefined;
  if (!input) throw new Error("restore requires --in <backup.jsonl>");
  const lines = fs.readFileSync(input, "utf8").split(/\r?\n/).filter(Boolean);
  const records = lines.map((line) => JSON.parse(line));
  if (options.dryRun) {
    writeJson({ command: "restore", mode: "dry-run", input, recordCount: records.length, collections: summarizeRecords(records) });
    return;
  }
  const store = await connectStore(options);
  await store.initialize();
  for (const record of records) {
    await store.upsert(record);
  }
  await closeStore(store);
  writeJson({ command: "restore", mode: "write", input, recordCount: records.length, collections: summarizeRecords(records) });
}

async function connectStore(options) {
  const connection = await connectStoreConnection(options);
  return connection.store;
}

async function connectStoreConnection(options) {
  const dsn = options.dsn ?? process.env.EVOPILOT_LOOP_STORE_DSN;
  if (!dsn) throw new Error("Postgres DSN is required via --dsn or EVOPILOT_LOOP_STORE_DSN");
  const client = new Client({ connectionString: dsn });
  await client.connect();
  const store = new PostgresBusinessStore(client);
  store.client = client;
  return { store, client };
}

async function closeStore(store) {
  if (store.client?.end) await store.client.end();
}

function summarizeRecords(records) {
  return records.reduce((summary, record) => {
    summary[record.collection] = (summary[record.collection] ?? 0) + 1;
    return summary;
  }, {});
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function normalizeBackupTimestamp(value) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/postgres-business-store.mjs migrate --data-root data/evopilot --dsn postgres://... [--dry-run]
  node scripts/postgres-business-store.mjs backup --dsn postgres://... --out backup.jsonl
  node scripts/postgres-business-store.mjs restore --dsn postgres://... --in backup.jsonl [--dry-run]
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
