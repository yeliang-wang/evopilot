import { canonicalJson, digestObject, isRecord } from "./utils.js";

// Runtime-owned, read-only wire validation. No producer lifecycle dependency.
export const semanticCatalogLimits = Object.freeze({
  enabledRoots: 16, pointerBytes: 65536, generationBytes: 4194304,
  entries: 4096, materialBytes: 16777216, totalMaterialBytes: 268435456,
  dependencyEdges: 16384, dependencyDepth: 64, readerConcurrency: 4,
  snapshotRetryCount: 2, lockWaitMilliseconds: 5000, readTimeoutMilliseconds: 30000
});
export type SemanticCatalogLimits = { -readonly [K in keyof typeof semanticCatalogLimits]: number };
export type SemanticCatalogFailure = "UNAVAILABLE" | "UNSUPPORTED" | "INVALID" | "DIGEST_MISMATCH" |
  "IDENTITY_CONFLICT" | "PATH_DENIED" | "SCOPE_INVALID" | "BUDGET_INVALID" | "FILE_LIMIT" |
  "ENTRY_LIMIT" | "MATERIAL_LIMIT" | "TOTAL_MATERIAL_LIMIT" | "EDGE_LIMIT" | "DEPTH_LIMIT" |
  "DEPENDENCY_CYCLE" | "MATERIAL_MISSING" | "PARENT_INVALID" | "REVOKED" | "TRUST_REQUIRED" |
  "PERMISSION_DENIED" | "MATERIAL_INVALID" | "CANCELLED" | "TIMEOUT" | "DRIFT" | "IO_OR_VALIDATION_FAILED";

export class SemanticCatalogError extends Error {
  readonly nextAction: string;
  constructor(readonly code: SemanticCatalogFailure) {
    super(`Semantic Catalog ${code}.`);
    this.name = "SemanticCatalogError";
    this.nextAction = code === "UNAVAILABLE" ? "configure-published-semantic-catalog" :
      code === "PERMISSION_DENIED" ? "review-catalog-permission" : "review-semantic-catalog";
  }
}
export function requireSemantic(condition: unknown, code: SemanticCatalogFailure = "INVALID"): asserts condition {
  if (!condition) throw new SemanticCatalogError(code);
}
export function resolveSemanticLimits(overrides: Partial<SemanticCatalogLimits> = {}): SemanticCatalogLimits {
  requireSemantic(isRecord(overrides), "BUDGET_INVALID");
  const limits = { ...semanticCatalogLimits } as SemanticCatalogLimits;
  for (const [key, value] of Object.entries(overrides)) {
    requireSemantic(Object.hasOwn(limits, key), "BUDGET_INVALID");
    const field = key as keyof SemanticCatalogLimits;
    requireSemantic(Number.isSafeInteger(value) && value >= (field === "snapshotRetryCount" ? 0 : 1) &&
      value <= limits[field], "BUDGET_INVALID");
    limits[field] = value;
  }
  return Object.freeze(limits);
}
const hash = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const id = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
const version = (value: unknown) => typeof value === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
function fields(value: unknown, required: string[], optional: string[] = []): asserts value is Record<string, unknown> {
  requireSemantic(isRecord(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
}
export function semanticContentPath(category: "generations" | "receipts" | "materials", digest: string): string {
  requireSemantic(hash(digest), "DIGEST_MISMATCH");
  return `semantic-catalog/${category}/${digest.slice(7)}.json`;
}
export function parseSemanticJson(bytes: Buffer): unknown {
  let depth = 0, quoted = false, escaped = false;
  for (const byte of bytes) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (byte === 92) escaped = true;
      else if (byte === 34) quoted = false;
    } else if (byte === 34) quoted = true;
    else if (byte === 123 || byte === 91) { depth++; requireSemantic(depth <= 64, "DEPTH_LIMIT"); }
    else if (byte === 125 || byte === 93) depth--;
  }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new SemanticCatalogError("INVALID"); }
}
function digest(value: unknown, field: string, schema: string): asserts value is Record<string, unknown> {
  requireSemantic(isRecord(value) && value.schema === schema, "UNSUPPORTED");
  const content = { ...value };
  delete content[field];
  requireSemantic(hash(value[field]) && value[field] === digestObject(content), "DIGEST_MISMATCH");
}
export interface SemanticScope { tenantId: string; workspaceId: string; projectId: string }
function scope(value: unknown): asserts value is SemanticScope {
  fields(value, ["tenantId", "workspaceId", "projectId"]);
  requireSemantic(Object.values(value).every(id), "SCOPE_INVALID");
}
export interface SemanticPointer {
  schema: string; catalogId: string; generationPath: string; generationDigest: string;
  previousPointerDigest: string | null; receiptDigest: string; pointerDigest: string;
}
export function semanticPointer(value: unknown, catalogId: string): SemanticPointer {
  digest(value, "pointerDigest", "evopilot-harness-semantic-catalog-pointer/v1");
  fields(value, ["schema", "catalogId", "generationPath", "generationDigest", "previousPointerDigest", "receiptDigest", "pointerDigest"]);
  requireSemantic(id(value.catalogId) && value.catalogId === catalogId, "IDENTITY_CONFLICT");
  requireSemantic(hash(value.generationDigest) && hash(value.receiptDigest) &&
    (value.previousPointerDigest === null || hash(value.previousPointerDigest)));
  requireSemantic(value.generationPath === semanticContentPath("generations", value.generationDigest), "PATH_DENIED");
  return value as unknown as SemanticPointer;
}
export interface SemanticReceipt {
  schema: string; catalogId: string; generationDigest: string; expectedHead: string | null;
  action: "PUBLISH" | "ROLLBACK" | "REVOKE"; requestDigest: string; receiptDigest: string;
  authorization: { decision: "AUTHORIZED"; actor: string; authorizationDigest: string }; transitionDigest?: string;
}
export function semanticReceipt(value: unknown, pointer: SemanticPointer): SemanticReceipt {
  digest(value, "receiptDigest", "evopilot-harness-semantic-catalog-receipt/v1");
  fields(value, ["schema", "catalogId", "generationDigest", "expectedHead", "action", "requestDigest", "authorization", "receiptDigest"], ["transitionDigest"]);
  requireSemantic(value.catalogId === pointer.catalogId && value.generationDigest === pointer.generationDigest &&
    value.expectedHead === pointer.previousPointerDigest && value.receiptDigest === pointer.receiptDigest, "DIGEST_MISMATCH");
  requireSemantic(["PUBLISH", "ROLLBACK", "REVOKE"].includes(String(value.action)) && hash(value.requestDigest) &&
    (!Object.hasOwn(value, "transitionDigest") || hash(value.transitionDigest)));
  fields(value.authorization, ["decision", "actor", "authorizationDigest"]);
  requireSemantic(value.authorization.decision === "AUTHORIZED" && typeof value.authorization.actor === "string" &&
    value.authorization.actor.length > 0 && value.authorization.actor.length <= 256 && hash(value.authorization.authorizationDigest));
  return value as unknown as SemanticReceipt;
}
export interface SemanticEntry {
  kind: string; id: string; version: string | null; schema: string; category?: "ASSET" | "DEPENDENCY";
  objectDigest: string; fileDigest: string; bytes: number; path: string; scope: SemanticScope;
  visibility: "PUBLIC" | "DOMAIN" | "PRIVATE"; provenance: Record<string, unknown>;
  publication?: Record<string, unknown> | null;
  parent: { artifactSetDigest: string; jsonPointer: "/spec/projectOntologySkill" } | null; dependencies: string[];
}
export interface SemanticGeneration {
  schema: string; catalogId: string; entries: SemanticEntry[]; revokedDigests: string[]; generationDigest: string;
  sets?: { scope: SemanticScope; refs: Record<string, unknown> }[];
}
export function semanticGeneration(value: unknown, pointer: SemanticPointer, limits: SemanticCatalogLimits): SemanticGeneration {
  digest(value, "generationDigest", "evopilot-harness-semantic-catalog/v1");
  fields(value, ["schema", "catalogId", "entries", "revokedDigests", "generationDigest"], ["sets"]);
  requireSemantic(value.catalogId === pointer.catalogId && value.generationDigest === pointer.generationDigest, "DIGEST_MISMATCH");
  requireSemantic(Array.isArray(value.entries) && value.entries.length <= limits.entries, "ENTRY_LIMIT");
  requireSemantic(Array.isArray(value.revokedDigests) && value.revokedDigests.length <= limits.entries &&
    value.revokedDigests.every(hash) && new Set(value.revokedDigests).size === value.revokedDigests.length);
  const revoked = new Set(value.revokedDigests);
  requireSemantic(value.entries.length > 0 || value.revokedDigests.length > 0, "MATERIAL_MISSING");
  if (Object.hasOwn(value, "sets")) {
    requireSemantic(Array.isArray(value.sets) && value.sets.length <= limits.entries, "ENTRY_LIMIT");
    for (const set of value.sets) { fields(set, ["scope", "refs"]); scope(set.scope); requireSemantic(isRecord(set.refs)); }
  }
  const identities = new Set<string>(), scoped = new Map<string, SemanticEntry>(), paths = new Map<string, SemanticEntry>();
  let edges = 0, bytes = 0;
  for (const entry of value.entries) {
    fields(entry, ["kind", "id", "version", "schema", "objectDigest", "fileDigest", "bytes", "path", "scope", "visibility", "provenance", "parent", "dependencies"], ["category", "publication"]);
    requireSemantic(id(entry.kind) && id(entry.id) && (version(entry.version) || (entry.category === "DEPENDENCY" && entry.version === null)) &&
      typeof entry.schema === "string" && entry.schema.length > 0 && hash(entry.objectDigest) && hash(entry.fileDigest));
    requireSemantic(!Object.hasOwn(entry, "category") || entry.category === "ASSET" || entry.category === "DEPENDENCY");
    requireSemantic(!Object.hasOwn(entry, "publication") || entry.publication === null || isRecord(entry.publication));
    scope(entry.scope);
    requireSemantic(["PUBLIC", "DOMAIN", "PRIVATE"].includes(String(entry.visibility)) && isRecord(entry.provenance), "SCOPE_INVALID");
    requireSemantic(typeof entry.bytes === "number" && Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= limits.materialBytes, "MATERIAL_LIMIT");
    requireSemantic(entry.path === semanticContentPath("materials", entry.fileDigest), "PATH_DENIED");
    requireSemantic(Array.isArray(entry.dependencies) && entry.dependencies.every(hash) && new Set(entry.dependencies).size === entry.dependencies.length);
    edges += entry.dependencies.length;
    requireSemantic(edges <= limits.dependencyEdges, "EDGE_LIMIT");
    requireSemantic(!revoked.has(entry.objectDigest) && !entry.dependencies.some(dep => revoked.has(dep)), "REVOKED");
    if (entry.kind === "ProjectOntologySkill") {
      fields(entry.parent, ["artifactSetDigest", "jsonPointer"]);
      requireSemantic(hash(entry.parent.artifactSetDigest) && entry.parent.jsonPointer === "/spec/projectOntologySkill", "PARENT_INVALID");
    } else requireSemantic(entry.parent === null, "PARENT_INVALID");
    const identity = canonicalJson([entry.scope, entry.kind, entry.id, entry.version, entry.parent]);
    const key = canonicalJson([entry.scope, entry.objectDigest]);
    requireSemantic(!identities.has(identity) && !scoped.has(key), "IDENTITY_CONFLICT");
    identities.add(identity);
    const typed = entry as unknown as SemanticEntry;
    scoped.set(key, typed);
    const existing = paths.get(typed.path);
    if (existing) requireSemantic(existing.bytes === typed.bytes && existing.fileDigest === typed.fileDigest, "DIGEST_MISMATCH");
    else { paths.set(typed.path, typed); bytes += typed.bytes; }
    requireSemantic(bytes <= limits.totalMaterialBytes, "TOTAL_MATERIAL_LIMIT");
  }
  const generation = value as unknown as SemanticGeneration;
  const heights = new Map<string, number>();
  function visit(entry: SemanticEntry, active: Set<string>): number {
    const key = canonicalJson([entry.scope, entry.objectDigest]);
    requireSemantic(!active.has(key), "DEPENDENCY_CYCLE");
    const prior = heights.get(key);
    if (prior !== undefined) return prior;
    requireSemantic(active.size < limits.dependencyDepth, "DEPTH_LIMIT");
    active.add(key);
    let height = 1;
    for (const dep of entry.dependencies) {
      const dependency = scoped.get(canonicalJson([entry.scope, dep]));
      requireSemantic(dependency, "MATERIAL_MISSING");
      height = Math.max(height, 1 + visit(dependency, active));
      requireSemantic(height <= limits.dependencyDepth, "DEPTH_LIMIT");
    }
    active.delete(key); heights.set(key, height); return height;
  }
  for (const entry of generation.entries) {
    visit(entry, new Set());
    if (entry.parent) {
      const parent = scoped.get(canonicalJson([entry.scope, entry.parent.artifactSetDigest]));
      requireSemantic(parent?.kind === "ProjectOntologyArtifactSet" && parent.path === entry.path &&
        parent.fileDigest === entry.fileDigest && parent.bytes === entry.bytes && entry.dependencies.includes(parent.objectDigest), "PARENT_INVALID");
    }
  }
  return generation;
}
