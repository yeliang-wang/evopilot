import http from "node:http";
import fs from "node:fs";
import path from "node:path";

export async function readJson(request: http.IncomingMessage, maxBodyBytes: number = 1024 * 1024): Promise<any> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBodyBytes) throw new Error(`请求体超过 ${maxBodyBytes} 字节`);
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function envelope<T>(data: T): { data: T; meta: { llm: LlmResponseUsageMeta } } {
  return { data, meta: { llm: currentLlmResponseUsageMeta() } };
}

export interface LlmResponseUsageMeta {
  schema: "evopilot-llm-usage-meta/v1";
  configured: boolean;
  provider?: string;
  model?: string;
  version?: string;
  metricsPath?: string;
  calls: number;
  succeeded: number;
  failed: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  creditsConsumed: number;
  creditUnit: "token";
  latest?: {
    requestId?: string;
    caller?: string;
    intent?: string;
    provider?: string;
    model?: string;
    version?: string;
    totalTokens: number;
    creditsConsumed: number;
    status?: string;
    recordedAt?: string;
  };
}

export function currentLlmResponseUsageMeta(): LlmResponseUsageMeta {
  const configuredProvider = optionalTrimmedString(process.env.EVOPILOT_LLM_PROVIDER_NAME);
  const configuredModel = optionalTrimmedString(process.env.EVOPILOT_LLM_MODEL_NAME);
  const metricsPath = resolveLlmMetricsPath();
  const records = readRecentLlmMetricRecords(metricsPath, 200);
  const latest = records[records.length - 1];
  const totals = records.reduce((acc, record) => {
    const totalTokens = Number(record.totalTokens ?? 0);
    acc.calls += 1;
    acc.succeeded += String(record.status ?? "").toUpperCase() === "SUCCEEDED" ? 1 : 0;
    acc.failed += String(record.status ?? "").toUpperCase() === "FAILED" ? 1 : 0;
    acc.totalTokens += totalTokens;
    acc.inputTokens += Number(record.inputTokens ?? 0);
    acc.outputTokens += Number(record.outputTokens ?? 0);
    acc.creditsConsumed += Number(record.creditsConsumed ?? totalTokens);
    return acc;
  }, { calls: 0, succeeded: 0, failed: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0, creditsConsumed: 0 });
  return {
    schema: "evopilot-llm-usage-meta/v1",
    configured: Boolean(configuredProvider || configuredModel || process.env.EVOPILOT_LLM_API_KEY),
    provider: latest?.provider || configuredProvider,
    model: latest?.model || configuredModel,
    version: latest?.model || configuredModel,
    metricsPath,
    creditUnit: "token",
    ...totals,
    latest: latest ? {
      requestId: optionalTrimmedString(latest.requestId),
      caller: optionalTrimmedString(latest.caller),
      intent: optionalTrimmedString(latest.intent),
      provider: optionalTrimmedString(latest.provider),
      model: optionalTrimmedString(latest.model),
      version: optionalTrimmedString(latest.model),
      totalTokens: Number(latest.totalTokens ?? 0),
      creditsConsumed: Number(latest.creditsConsumed ?? latest.totalTokens ?? 0),
      status: optionalTrimmedString(latest.status),
      recordedAt: optionalTrimmedString(latest.recordedAt)
    } : undefined
  };
}

export function llmResponseUsageDelta(before: LlmResponseUsageMeta, after: LlmResponseUsageMeta): Record<string, unknown> {
  const calls = Math.max(0, after.calls - before.calls);
  const totalTokens = Math.max(0, after.totalTokens - before.totalTokens);
  const inputTokens = Math.max(0, after.inputTokens - before.inputTokens);
  const outputTokens = Math.max(0, after.outputTokens - before.outputTokens);
  const creditsConsumed = Math.max(0, after.creditsConsumed - before.creditsConsumed);
  return {
    schema: "evopilot-http-llm-usage-delta/v1",
    provider: after.provider,
    model: after.model,
    version: after.version,
    request: {
      calls,
      inputTokens,
      outputTokens,
      totalTokens,
      creditsConsumed,
      creditUnit: after.creditUnit
    },
    cumulative: {
      calls: after.calls,
      succeeded: after.succeeded,
      failed: after.failed,
      inputTokens: after.inputTokens,
      outputTokens: after.outputTokens,
      totalTokens: after.totalTokens,
      creditsConsumed: after.creditsConsumed,
      creditUnit: after.creditUnit
    },
    latest: calls > 0 || totalTokens > 0 ? after.latest : undefined
  };
}

function resolveLlmMetricsPath(): string | undefined {
  const configured = optionalTrimmedString(process.env.EVOPILOT_LLM_METRICS_PATH);
  const requested = configured ?? (optionalTrimmedString(process.env.EVOPILOT_DATA_ROOT) ? "llm-metrics.jsonl" : undefined);
  if (!requested) return undefined;
  if (path.isAbsolute(requested)) return requested;
  const dataRoot = optionalTrimmedString(process.env.EVOPILOT_DATA_ROOT);
  if (!dataRoot) return requested;
  const normalized = requested.replace(/^data\/evopilot\/?/, "");
  return path.join(dataRoot, normalized || "llm-metrics.jsonl");
}

function readRecentLlmMetricRecords(file: string | undefined, maxRecords: number): any[] {
  if (!file || !fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean).slice(-maxRecords);
  const records: any[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      // Ignore malformed metric lines so API responses stay available.
    }
  }
  return records;
}

function optionalTrimmedString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

export function writeJson(response: http.ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(withLlmResponseMeta(body)));
}

function withLlmResponseMeta(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const value = body as Record<string, unknown>;
  const meta = value.meta && typeof value.meta === "object" && !Array.isArray(value.meta)
    ? value.meta as Record<string, unknown>
    : {};
  if (meta.llm) return body;
  return {
    ...value,
    meta: {
      ...meta,
      llm: currentLlmResponseUsageMeta()
    }
  };
}

export function writeEventStream(response: http.ServerResponse, events: Array<{ id: string; type: string }>): void {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });
  for (const event of events) {
    response.write(`id: ${event.id}\n`);
    response.write(`event: ${event.type}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  response.end();
}

export function writeText(response: http.ServerResponse, statusCode: number, body: string): void {
  response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  response.end(body);
}

export function renderMetrics(summary: any, saasObservability?: any): string {
  return [
    "# TYPE evopilot_projects_total gauge",
    `evopilot_projects_total ${summary.projectCount}`,
    "# TYPE evopilot_runs_total gauge",
    `evopilot_runs_total ${summary.runCount}`,
    "# TYPE evopilot_code_upgrades_total gauge",
    `evopilot_code_upgrades_total ${summary.codeUpgradeCount ?? 0}`,
    "# TYPE evopilot_running_code_upgrades_total gauge",
    `evopilot_running_code_upgrades_total ${summary.runningCodeUpgradeCount ?? 0}`,
    "# TYPE evopilot_opportunities_total gauge",
    `evopilot_opportunities_total ${summary.opportunityCount}`,
    "# TYPE evopilot_pending_reviews_total gauge",
    `evopilot_pending_reviews_total ${summary.pendingReviewCount}`,
    "# TYPE evopilot_release_health gauge",
    `evopilot_release_health ${summary.releaseHealth}`,
    "# TYPE evopilot_slo_health gauge",
    `evopilot_slo_health ${summary.sloHealth ?? 100}`,
    "# TYPE evopilot_cost_health gauge",
    `evopilot_cost_health ${summary.costHealth ?? 100}`,
    "# TYPE evopilot_supply_chain_risks_total gauge",
    `evopilot_supply_chain_risks_total ${summary.supplyChainRiskCount ?? 0}`,
    "# TYPE evopilot_release_readiness_score gauge",
    `evopilot_release_readiness_score ${summary.releaseReadinessScore ?? 100}`,
    "# TYPE evopilot_release_blocked_total gauge",
    `evopilot_release_blocked_total ${summary.releaseBlockedCount ?? 0}`,
    "# TYPE evopilot_saas_tenants_total gauge",
    `evopilot_saas_tenants_total ${saasObservability?.tenantCount ?? 0}`,
    "# TYPE evopilot_saas_workspaces_total gauge",
    `evopilot_saas_workspaces_total ${saasObservability?.workspaceCount ?? 0}`,
    "# TYPE evopilot_saas_running_loops_total gauge",
    `evopilot_saas_running_loops_total ${saasObservability?.runningLoopCount ?? 0}`,
    "# TYPE evopilot_saas_blocked_loops_total gauge",
    `evopilot_saas_blocked_loops_total ${saasObservability?.blockedLoopCount ?? 0}`,
    "# TYPE evopilot_saas_github_app_ready_total gauge",
    `evopilot_saas_github_app_ready_total ${saasObservability?.githubAppReadyCount ?? 0}`,
    "# TYPE evopilot_saas_credential_blockers_total gauge",
    `evopilot_saas_credential_blockers_total ${saasObservability?.credentialBlockedCount ?? 0}`,
    "# TYPE evopilot_saas_quota_blocked_workspaces_total gauge",
    `evopilot_saas_quota_blocked_workspaces_total ${saasObservability?.quotaBlockedWorkspaceCount ?? 0}`,
    "# TYPE evopilot_saas_postgres_store_ready gauge",
    `evopilot_saas_postgres_store_ready ${saasObservability?.postgresStoreReady ? 1 : 0}`
  ].join("\n");
}
