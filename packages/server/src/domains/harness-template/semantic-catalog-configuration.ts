import path from "node:path";
import { createHash } from "node:crypto";
import { parseDocument, visit, isAlias } from "yaml";
import { canonicalJson, digestObject, isRecord } from "./utils.js";
import { requireSemantic, parseSemanticJson, resolveSemanticLimits, type SemanticScope,
  type SemanticCatalogLimits, type SemanticEntry, type SemanticReceipt } from "./semantic-catalog-contract.js";
import { createSemanticOperation, freeze, openSemanticRoot, redactSemanticError, type SemanticOperation } from "./semantic-catalog-io.js";
import { readSemanticCatalogSnapshot, type SemanticSnapshot, type SemanticRegistryBinding, type SemanticReadPolicy } from "./semantic-catalog-reader.js";

const id = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
const sha = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
function shape(value: unknown, required: string[], optional: string[] = []): asserts value is Record<string, unknown> {
  requireSemantic(isRecord(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key)), "TRUST_REQUIRED");
}
function validateScope(value: unknown): asserts value is SemanticScope {
  shape(value, ["tenantId", "workspaceId", "projectId"]);
  requireSemantic(Object.values(value).every(id), "SCOPE_INVALID");
}
export function parseSemanticYaml(bytes: Buffer): unknown {
  const document = parseDocument(new TextDecoder("utf-8", {fatal: true}).decode(bytes), {uniqueKeys: true, strict: true});
  requireSemantic(document.errors.length === 0 && document.warnings.length === 0, "INVALID");
  // Reject aliases before toJS, including aliases that happen to be small.
  visit(document, (_key, node, ancestry) => {
    requireSemantic(ancestry.length <= 64, "DEPTH_LIMIT");
    requireSemantic(!isAlias(node), "INVALID");
  });
  return document.toJS({maxAliasCount: 0});
}
async function configuredFile(file: string, limits: SemanticCatalogLimits, operation: SemanticOperation, yaml: boolean) {
  requireSemantic(typeof file === "string" && path.isAbsolute(file) && !file.includes("\0"), "PATH_DENIED");
  const root = await openSemanticRoot(path.dirname(file), operation);
  const {bytes} = await root.read(path.basename(file), limits.generationBytes);
  const value = yaml ? parseSemanticYaml(bytes) : parseSemanticJson(bytes);
  operation.check();
  return {value: freeze(value), digest: sha(bytes)};
}
export interface LoadedSemanticRegistry extends SemanticRegistryBinding {
  references: readonly {id: string; rawRoot: string; expectedCatalogDigest?: string; priority: number}[];
}
export async function loadSemanticRegistry(file: string, limits: SemanticCatalogLimits, operation: SemanticOperation): Promise<LoadedSemanticRegistry> {
  const {value, digest} = await configuredFile(file, limits, operation, true);
  requireSemantic(isRecord(value) && ["evopilot-harness-registry/v1", "evopilot-harness-registry/v2"].includes(String(value.schema)), "UNSUPPORTED");
  requireSemantic(!Object.hasOwn(value, "entries") && !Object.hasOwn(value, "assets") && Array.isArray(value.catalogs), "INVALID");
  requireSemantic(value.catalogs.length <= limits.entries, "ENTRY_LIMIT");
  const seen = new Set<string>();
  const catalogs: LoadedSemanticRegistry["catalogs"][number][] = [], references: LoadedSemanticRegistry["references"][number][] = [];
  for (const entry of value.catalogs) {
    requireSemantic(isRecord(entry) && !Object.hasOwn(entry, "entries") && !Object.hasOwn(entry, "assets"), "INVALID");
    const catalogId = entry.id ?? entry.catalogId;
    requireSemantic(id(catalogId) && (!Object.hasOwn(entry, "id") || !Object.hasOwn(entry, "catalogId") || entry.id === entry.catalogId) && !seen.has(catalogId), "IDENTITY_CONFLICT");
    seen.add(catalogId);
    requireSemantic(typeof entry.root === "string" && entry.root.length > 0 && entry.root.length <= 1024 &&
      !entry.root.includes("\0") && !entry.root.includes("\\") && !/^[a-z][a-z0-9+.-]*:/i.test(entry.root), "PATH_DENIED");
    requireSemantic(entry.enabled === undefined || typeof entry.enabled === "boolean", "INVALID");
    requireSemantic(entry.priority === undefined || (typeof entry.priority === "number" && Number.isFinite(entry.priority)), "INVALID");
    requireSemantic(entry.expectedCatalogDigest === undefined || hash(entry.expectedCatalogDigest), "INVALID");
    catalogs.push({id: catalogId, root: path.resolve(path.dirname(file), entry.root), enabled: entry.enabled !== false});
    references.push({id: catalogId, rawRoot: entry.root, priority: entry.priority as number ?? 0,
      ...(entry.expectedCatalogDigest ? {expectedCatalogDigest: entry.expectedCatalogDigest as string} : {})});
  }
  requireSemantic(catalogs.filter(item => item.enabled).length <= limits.enabledRoots, "ENTRY_LIMIT");
  return freeze({registryDigest: digest, catalogs, references});
}
interface Grant {
  decision: "AUTHORIZED"; actor: string; authorizationDigest: string; subjectDigest: string;
  purpose: string; revoked: boolean; expiresAt: string | null;
}
interface CatalogRule {
  id: string; permission: "GRANTED" | "DENIED"; trustContext: string; rootBindingDigest: string;
  scopes: {scope: SemanticScope; visibilities: string[]}[]; grants: Grant[];
}
function rules(value: unknown, limits: SemanticCatalogLimits): CatalogRule[] {
  shape(value, ["schema", "catalogs"]);
  requireSemantic(value.schema === "evopilot-harness-semantic-catalog-policy/v1", "UNSUPPORTED");
  requireSemantic(Array.isArray(value.catalogs) && value.catalogs.length <= limits.enabledRoots, "ENTRY_LIMIT");
  const identities = new Set<string>();
  for (const rule of value.catalogs) {
    shape(rule, ["id", "permission", "trustContext", "rootBindingDigest", "scopes", "grants"]);
    requireSemantic(id(rule.id) && !identities.has(rule.id), "IDENTITY_CONFLICT"); identities.add(rule.id);
    requireSemantic(["GRANTED", "DENIED"].includes(String(rule.permission)) && id(rule.trustContext) && hash(rule.rootBindingDigest), "TRUST_REQUIRED");
    requireSemantic(Array.isArray(rule.scopes) && rule.scopes.length <= limits.entries && Array.isArray(rule.grants) && rule.grants.length <= limits.entries, "ENTRY_LIMIT");
    const scopes = new Set<string>();
    for (const scope of rule.scopes) {
      shape(scope, ["scope", "visibilities"]); validateScope(scope.scope);
      const key = canonicalJson(scope.scope); requireSemantic(!scopes.has(key), "IDENTITY_CONFLICT"); scopes.add(key);
      requireSemantic(Array.isArray(scope.visibilities) && scope.visibilities.length <= 3 && new Set(scope.visibilities).size === scope.visibilities.length &&
        scope.visibilities.every(value => ["PUBLIC", "DOMAIN", "PRIVATE"].includes(String(value))), "SCOPE_INVALID");
    }
    const grants = new Set<string>();
    for (const grant of rule.grants) {
      shape(grant, ["decision", "actor", "authorizationDigest", "subjectDigest", "purpose", "revoked", "expiresAt"], ["version", "at"]);
      requireSemantic(grant.decision === "AUTHORIZED" && typeof grant.actor === "string" && grant.actor.length > 0 && grant.actor.length <= 256 &&
        hash(grant.authorizationDigest) && hash(grant.subjectDigest) && ["ASSET_PUBLICATION", "CATALOG_PUBLICATION", "CATALOG_RECOVERY"].includes(String(grant.purpose)) &&
        typeof grant.revoked === "boolean" && (grant.expiresAt === null || (typeof grant.expiresAt === "string" && grant.expiresAt.length <= 64 && Number.isFinite(Date.parse(grant.expiresAt)))), "TRUST_REQUIRED");
      requireSemantic(grant.version === undefined || (typeof grant.version === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(grant.version)), "TRUST_REQUIRED");
      requireSemantic(grant.at === undefined || (typeof grant.at === "string" && grant.at.length <= 64), "TRUST_REQUIRED");
      const key = canonicalJson([grant.actor, grant.authorizationDigest, grant.subjectDigest, grant.purpose]);
      requireSemantic(!grants.has(key), "IDENTITY_CONFLICT"); grants.add(key);
    }
  }
  return value.catalogs as CatalogRule[];
}
function authorized(rule: CatalogRule, actor: unknown, authorizationDigest: unknown, subjectDigest: string, purpose: string): boolean {
  return rule.grants.some(grant => grant.actor === actor && grant.authorizationDigest === authorizationDigest && grant.subjectDigest === subjectDigest &&
    grant.purpose === purpose && !grant.revoked && (grant.expiresAt === null || Date.parse(grant.expiresAt) > Date.now()));
}
export function semanticPublicationSubject(receipt: SemanticReceipt): string {
  return digestObject({catalogId: receipt.catalogId, generationDigest: receipt.generationDigest, expectedHead: receipt.expectedHead,
    action: receipt.action, requestDigest: receipt.requestDigest, ...(receipt.transitionDigest ? {transitionDigest: receipt.transitionDigest} : {})});
}
export interface SemanticConsumerSubject { scope: SemanticScope; role: "viewer" | "operator" | "admin"; active: boolean }

// Server-side integration primitive: paths, subject resolver and domain validator
// must be supplied by trusted composition code, never by a request or Catalog.
// HTTP composition uses the fixed readVerifiedSemanticCatalog entry, never a
// request-supplied validator or this lower-level callback directly.
export async function readConfiguredSemanticCatalog(input: {
  registryConfigPath: string; policyPath: string; catalogId: string;
  currentSubject: () => SemanticConsumerSubject | Promise<SemanticConsumerSubject>;
  validateMaterials: SemanticReadPolicy["validateMaterials"];
  limits?: Partial<SemanticCatalogLimits>; signal?: AbortSignal;
}): Promise<SemanticSnapshot & {policyDigest: string; trustContext: string}> {
  const limits = resolveSemanticLimits(input.limits), operation = createSemanticOperation(limits, input.signal);
  try {
    requireSemantic(typeof input.currentSubject === "function" && typeof input.validateMaterials === "function", "TRUST_REQUIRED");
    // Obtain authenticated Runtime scope before opening even the Registry file.
    async function subject() {
      const current = await operation.wait(input.currentSubject);
      requireSemantic(current && current.active === true && ["viewer", "operator", "admin"].includes(current.role), "PERMISSION_DENIED");
      validateScope(current.scope); return freeze({...current, scope: {...current.scope}});
    }
    const originalSubject = await subject();
    const registry = await loadSemanticRegistry(input.registryConfigPath, limits, operation);
    const reference = registry.references.find(item => item.id === input.catalogId);
    requireSemantic(reference && registry.catalogs.find(item => item.id === input.catalogId)?.enabled, "UNAVAILABLE");
    let activeRule: CatalogRule | undefined, policyDigest = "";
    async function current() {
      requireSemantic(same((await subject()).scope, originalSubject.scope), "PERMISSION_DENIED");
      const nextRegistry = await loadSemanticRegistry(input.registryConfigPath, limits, operation);
      requireSemantic(nextRegistry.registryDigest === registry.registryDigest, "DRIFT");
      const policy = await configuredFile(input.policyPath, limits, operation, false);
      const rule = rules(policy.value, limits).find(item => item.id === input.catalogId);
      requireSemantic(rule?.permission === "GRANTED" && rule.rootBindingDigest === digestObject({id: reference!.id, root: reference!.rawRoot}) &&
        rule.scopes.some(item => same(item.scope, originalSubject.scope)), "PERMISSION_DENIED");
      if (activeRule) requireSemantic(rule.trustContext === activeRule.trustContext, "DRIFT");
      activeRule = rule; policyDigest = policy.digest;
      return true;
    }
    const result = await readSemanticCatalogSnapshot({registry, catalogId: input.catalogId, limits, signal: input.signal, operation,
      policy: {
        permitCatalog: current,
        authorizePublication: (_catalog, receipt) => !!activeRule && authorized(activeRule, receipt.authorization.actor,
          receipt.authorization.authorizationDigest, semanticPublicationSubject(receipt), "CATALOG_PUBLICATION"),
        permitEntry: (_catalog, entry: SemanticEntry) => {
          if (!activeRule || !same(entry.scope, originalSubject.scope) ||
            !activeRule.scopes.some(item => same(item.scope, entry.scope) && item.visibilities.includes(entry.visibility))) return false;
          if (["ProjectOntologyArtifactSet", "TerminalSemanticClosure"].includes(entry.kind) || (entry.category === "ASSET" && !entry.parent)) {
            return !!entry.publication && entry.publication.decision === "AUTHORIZED" && authorized(activeRule,
              entry.publication.actor, entry.publication.authorizationDigest, entry.objectDigest, "ASSET_PUBLICATION");
          }
          return true;
        },
        validateMaterials: input.validateMaterials
      }});
    requireSemantic(activeRule, "TRUST_REQUIRED");
    return Object.freeze({...result, policyDigest, trustContext: activeRule.trustContext});
  } catch (error) { throw redactSemanticError(error); }
  finally { operation.close(); }
}
