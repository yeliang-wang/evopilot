import { createHash } from "node:crypto";

export type PostgresBusinessCollection =
  | "tenants"
  | "workspaces"
  | "projects"
  | "loops"
  | "loop-workspaces"
  | "executor-graphs"
  | "release-evidence"
  | "release-targets"
  | "release-decisions"
  | "source-release-runs"
  | "source-release-deploy-finalizers"
  | "target-loops"
  | "audit-events"
  | "idempotency";

export interface PostgresQueryable {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export interface PostgresBusinessRecord<TPayload = Record<string, unknown>> {
  collection: PostgresBusinessCollection;
  tenantId: string;
  workspaceId: string;
  id: string;
  schema?: string;
  payload: TPayload;
  sourceFile?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PostgresBusinessRecordRow {
  collection: string;
  tenant_id: string;
  workspace_id: string;
  record_id: string;
  schema: string | null;
  payload: unknown;
  source_file: string | null;
  checksum: string;
  created_at: string;
  updated_at: string;
}

export interface PostgresBusinessListOptions {
  collection: PostgresBusinessCollection;
  tenantId?: string;
  workspaceId?: string;
  limit?: number;
}

export const POSTGRES_BUSINESS_STORE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS evopilot_business_records (
    collection text NOT NULL,
    tenant_id text NOT NULL,
    workspace_id text NOT NULL,
    record_id text NOT NULL,
    schema text,
    payload jsonb NOT NULL,
    source_file text,
    checksum text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection, tenant_id, workspace_id, record_id)
  )`,
  `CREATE INDEX IF NOT EXISTS evopilot_business_records_tenant_workspace_idx
    ON evopilot_business_records (tenant_id, workspace_id, collection, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS evopilot_business_records_collection_idx
    ON evopilot_business_records (collection, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS evopilot_business_records_payload_gin_idx
    ON evopilot_business_records USING gin (payload)`
] as const;

export class PostgresBusinessStore {
  constructor(private readonly client: PostgresQueryable) {}

  async initialize(): Promise<void> {
    for (const statement of POSTGRES_BUSINESS_STORE_SCHEMA) {
      await this.client.query(statement);
    }
  }

  async upsert<TPayload = Record<string, unknown>>(record: PostgresBusinessRecord<TPayload>): Promise<PostgresBusinessRecord<TPayload>> {
    const normalized = normalizeBusinessRecord(record);
    const now = normalized.updatedAt ?? new Date().toISOString();
    const createdAt = normalized.createdAt ?? now;
    const checksum = checksumPayload(normalized.payload);
    await this.client.query(
      `INSERT INTO evopilot_business_records
        (collection, tenant_id, workspace_id, record_id, schema, payload, source_file, checksum, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::timestamptz, $10::timestamptz)
       ON CONFLICT (collection, tenant_id, workspace_id, record_id)
       DO UPDATE SET
        schema = EXCLUDED.schema,
        payload = EXCLUDED.payload,
        source_file = EXCLUDED.source_file,
        checksum = EXCLUDED.checksum,
        updated_at = EXCLUDED.updated_at`,
      [
        normalized.collection,
        normalized.tenantId,
        normalized.workspaceId,
        normalized.id,
        normalized.schema ?? null,
        JSON.stringify(normalized.payload),
        normalized.sourceFile ?? null,
        checksum,
        createdAt,
        now
      ]
    );
    return { ...normalized, createdAt, updatedAt: now };
  }

  async read<TPayload = Record<string, unknown>>(collection: PostgresBusinessCollection, id: string, options: { tenantId?: string; workspaceId?: string } = {}): Promise<PostgresBusinessRecord<TPayload> | undefined> {
    const tenantId = normalizeScopeId(options.tenantId);
    const workspaceId = normalizeScopeId(options.workspaceId);
    const result = await this.client.query<PostgresBusinessRecordRow>(
      `SELECT collection, tenant_id, workspace_id, record_id, schema, payload, source_file, checksum, created_at, updated_at
       FROM evopilot_business_records
       WHERE collection = $1 AND tenant_id = $2 AND workspace_id = $3 AND record_id = $4
       LIMIT 1`,
      [collection, tenantId, workspaceId, normalizeRecordId(id)]
    );
    return result.rows[0] ? rowToBusinessRecord<TPayload>(result.rows[0]) : undefined;
  }

  async list<TPayload = Record<string, unknown>>(options: PostgresBusinessListOptions): Promise<Array<PostgresBusinessRecord<TPayload>>> {
    const limit = Math.max(1, Math.min(1000, Math.trunc(options.limit ?? 200)));
    const params: unknown[] = [options.collection];
    const filters = ["collection = $1"];
    if (options.tenantId) {
      params.push(normalizeScopeId(options.tenantId));
      filters.push(`tenant_id = $${params.length}`);
    }
    if (options.workspaceId) {
      params.push(normalizeScopeId(options.workspaceId));
      filters.push(`workspace_id = $${params.length}`);
    }
    params.push(limit);
    const result = await this.client.query<PostgresBusinessRecordRow>(
      `SELECT collection, tenant_id, workspace_id, record_id, schema, payload, source_file, checksum, created_at, updated_at
       FROM evopilot_business_records
       WHERE ${filters.join(" AND ")}
       ORDER BY updated_at DESC, record_id ASC
       LIMIT $${params.length}`,
      params
    );
    return result.rows.map((row) => rowToBusinessRecord<TPayload>(row));
  }

  async remove(collection: PostgresBusinessCollection, id: string, options: { tenantId?: string; workspaceId?: string } = {}): Promise<boolean> {
    const result = await this.client.query(
      `DELETE FROM evopilot_business_records
       WHERE collection = $1 AND tenant_id = $2 AND workspace_id = $3 AND record_id = $4`,
      [collection, normalizeScopeId(options.tenantId), normalizeScopeId(options.workspaceId), normalizeRecordId(id)]
    );
    return Number(result.rowCount ?? 0) > 0;
  }
}

export function normalizeBusinessRecord<TPayload>(record: PostgresBusinessRecord<TPayload>): PostgresBusinessRecord<TPayload> {
  return {
    ...record,
    tenantId: normalizeScopeId(record.tenantId),
    workspaceId: normalizeScopeId(record.workspaceId),
    id: normalizeRecordId(record.id)
  };
}

export function checksumPayload(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function rowToBusinessRecord<TPayload>(row: PostgresBusinessRecordRow): PostgresBusinessRecord<TPayload> {
  return {
    collection: row.collection as PostgresBusinessCollection,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    id: row.record_id,
    schema: row.schema ?? undefined,
    payload: row.payload as TPayload,
    sourceFile: row.source_file ?? undefined,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at)
  };
}

function normalizeScopeId(value: unknown): string {
  const normalized = String(value ?? "default").trim();
  return normalized.length > 0 ? normalized : "default";
}

function normalizeRecordId(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error("Postgres business store record id is required");
  return normalized;
}

function normalizeTimestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
