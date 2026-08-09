import type { EvoPilotRequestOptions, EvoPilotResponse } from "@evopilot/client";

interface ParsedArgs {
  positionals: string[];
  options: Record<string, string | boolean | string[]>;
}

interface HarnessCatalogCommandContext {
  args: ParsedArgs;
  client: {
    get(path: string): Promise<EvoPilotResponse>;
    post(path: string, body: unknown, options?: EvoPilotRequestOptions): Promise<EvoPilotResponse>;
  };
  json: boolean;
}

interface HarnessCatalogCommandHelpers {
  requiredOption: (args: ParsedArgs, name: string) => string;
  requestOptions: (ctx: any) => EvoPilotRequestOptions;
  stringOption: (args: ParsedArgs, name: string) => string | undefined;
  usage: (message: string) => Error;
}

export async function runHarnessCatalogCommand(
  ctx: HarnessCatalogCommandContext,
  command: string | undefined,
  id: string | undefined,
  helpers: HarnessCatalogCommandHelpers
): Promise<number> {
  if (command === "list" || command === undefined) return harnessCatalogList(ctx);
  if (command === "mount" || command === "add") return harnessCatalogMount(ctx, helpers);
  if (command === "inspect") return harnessCatalogInspect(ctx, id, helpers);
  if (command === "scan") return harnessCatalogScan(ctx, id, helpers);
  throw helpers.usage("Use: evopilot harness catalog <list|mount|inspect|scan> [catalog-id] --source <published-harness-catalog-path>");
}

async function harnessCatalogList(ctx: HarnessCatalogCommandContext): Promise<number> {
  const response = await ctx.client.get("/api/v1/harness/catalogs");
  printHarnessCatalogResult(ctx, "harness catalog list", response.data ?? response.body, response.status);
  return response.ok ? 0 : 2;
}

async function harnessCatalogMount(ctx: HarnessCatalogCommandContext, helpers: HarnessCatalogCommandHelpers): Promise<number> {
  const source = helpers.requiredOption(ctx.args, "source");
  const body = {
    catalogId: helpers.stringOption(ctx.args, "catalog-id") ?? helpers.stringOption(ctx.args, "id"),
    name: helpers.stringOption(ctx.args, "name"),
    source
  };
  const response = await ctx.client.post("/api/v1/harness/catalogs", body, helpers.requestOptions(ctx));
  printHarnessCatalogResult(ctx, "harness catalog mount", response.data ?? response.body, response.status);
  return response.ok ? 0 : 2;
}

async function harnessCatalogInspect(ctx: HarnessCatalogCommandContext, id: string | undefined, helpers: HarnessCatalogCommandHelpers): Promise<number> {
  const catalogId = id ?? helpers.requiredOption(ctx.args, "catalog-id");
  const response = await ctx.client.get(`/api/v1/harness/catalogs/${encodeURIComponent(catalogId)}`);
  printHarnessCatalogResult(ctx, "harness catalog inspect", response.data ?? response.body, response.status);
  return response.ok ? 0 : 2;
}

async function harnessCatalogScan(ctx: HarnessCatalogCommandContext, id: string | undefined, helpers: HarnessCatalogCommandHelpers): Promise<number> {
  const catalogId = id ?? helpers.requiredOption(ctx.args, "catalog-id");
  const response = await ctx.client.post(`/api/v1/harness/catalogs/${encodeURIComponent(catalogId)}/scan`, {}, helpers.requestOptions(ctx));
  printHarnessCatalogResult(ctx, "harness catalog scan", response.data ?? response.body, response.status);
  return response.ok ? 0 : 2;
}

function printHarnessCatalogResult(ctx: HarnessCatalogCommandContext, command: string, data: unknown, statusCode: number): void {
  const payload = isRecord(data) && isRecord(data.data) ? data.data : data;
  if (ctx.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  const scan = field(payload, "scan");
  const mount = field(payload, "mount") ?? (Array.isArray(field(payload, "mounts")) ? (field(payload, "mounts") as unknown[])[0] : undefined);
  const catalog = field(payload, "catalog") ?? (Array.isArray(field(payload, "catalogs")) ? (field(payload, "catalogs") as unknown[])[0] : undefined);
  const templates = field(payload, "templates");
  const scans = field(payload, "scans");
  const lines = [
    `${command}: http=${statusCode}`,
    isRecord(mount) ? `catalog=${field(mount, "catalogId")} source=${field(mount, "source")}` : undefined,
    isRecord(scan) ? `scan=${field(scan, "status")} templates=${arrayLength(field(scan, "templates"))}` : undefined,
    isRecord(catalog) ? `catalogDigest=${field(catalog, "catalogDigest")}` : undefined,
    Array.isArray(scans) ? `catalogs=${scans.length}` : undefined,
    Array.isArray(templates) ? `templates=${templates.length}` : undefined,
    isRecord(payload) && field(payload, "nextAction") ? `nextAction=${field(payload, "nextAction")}` : undefined,
    isRecord(scan) && field(scan, "error") ? `error=${field(scan, "error")}` : undefined
  ].filter(Boolean);
  process.stdout.write(`${lines.join("\n")}\n`);
}

function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
