import path from "node:path";
import { createSemanticOperation, freeze, openSemanticRoot, redactSemanticError, type SemanticOperation } from "./semantic-catalog-io.js";
import { createHash } from "node:crypto";
import {
  SemanticCatalogError, parseSemanticJson, requireSemantic, resolveSemanticLimits,
  semanticContentPath, semanticGeneration, semanticPointer, semanticReceipt,
  type SemanticCatalogLimits, type SemanticEntry, type SemanticGeneration, type SemanticPointer, type SemanticReceipt
} from "./semantic-catalog-contract.js";

export interface ConfiguredSemanticCatalog { id: string; root: string; enabled: boolean }
export interface SemanticRegistryBinding {
  // Must come from the Runtime's configured Registry loader, never request/Catalog data.
  registryDigest: string;
  catalogs: readonly ConfiguredSemanticCatalog[];
}
export interface SemanticSnapshot {
  registryDigest: string; catalogId: string; pointer: SemanticPointer; generation: SemanticGeneration;
  receipt: SemanticReceipt; materials: ReadonlyMap<string, unknown>; attempts: number; limits: Readonly<SemanticCatalogLimits>;
}
export interface SemanticReadPolicy {
  permitCatalog(catalog: Readonly<ConfiguredSemanticCatalog>): boolean | Promise<boolean>;
  authorizePublication(catalog: Readonly<ConfiguredSemanticCatalog>, receipt: Readonly<SemanticReceipt>): boolean | Promise<boolean>;
  permitEntry(catalog: Readonly<ConfiguredSemanticCatalog>, entry: Readonly<SemanticEntry>): boolean | Promise<boolean>;
  // Trusted Runtime validator must prove actual material schemas, object digests,
  // closure/Skill/snapshot bindings and exact v3 references. Byte integrity alone
  // cannot establish semantic eligibility. No default permissive validator.
  validateMaterials(snapshot: SemanticSnapshot, context: SemanticValidationContext): boolean | Promise<boolean>;
}
export interface SemanticValidationContext {
  // Capability for the same already-authorized root, not a caller-selected path.
  files: Awaited<ReturnType<typeof openSemanticRoot>>;
  operation: Pick<SemanticOperation, "check">;
}
/** Internal transport, not a public AVAILABLE/acceptance API. The production
 * Registry loader and full domain-material validator must be wired separately.
 * This function performs no writes, network fetches, producer calls or scanning.
 */
export async function readSemanticCatalogSnapshot(input: {
  registry: SemanticRegistryBinding; catalogId: string; policy: SemanticReadPolicy;
  limits?: Partial<SemanticCatalogLimits>; signal?: AbortSignal; operation?: SemanticOperation;
}): Promise<SemanticSnapshot> {
  const limits = resolveSemanticLimits(input.limits);
  const operation = input.operation ?? createSemanticOperation(limits, input.signal);
  try {
    operation.check();
    const policy = input.policy;
    requireSemantic(policy && [policy.permitCatalog, policy.authorizePublication, policy.permitEntry, policy.validateMaterials]
      .every(method => typeof method === "function"), "TRUST_REQUIRED");
    requireSemantic(input.registry && /^sha256:[a-f0-9]{64}$/.test(input.registry.registryDigest) &&
      Array.isArray(input.registry.catalogs), "TRUST_REQUIRED");
    const enabled = input.registry.catalogs.filter(catalog => catalog.enabled === true);
    requireSemantic(enabled.length <= limits.enabledRoots, "ENTRY_LIMIT");
    requireSemantic(enabled.every(catalog => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(catalog.id)) &&
      new Set(enabled.map(catalog => catalog.id)).size === enabled.length, "IDENTITY_CONFLICT");
    const selected = enabled.find(catalog => catalog.id === input.catalogId);
    requireSemantic(selected, "UNAVAILABLE");
    const registryDigest = input.registry.registryDigest;
    const catalog = Object.freeze({ ...selected });
    requireSemantic(typeof catalog.root === "string" && path.isAbsolute(catalog.root), "PATH_DENIED");
    requireSemantic(await operation.wait(() => policy.permitCatalog(catalog)) === true, "PERMISSION_DENIED");
    const files = await openSemanticRoot(catalog.root, operation);
    async function read(relative: string, maxBytes: number) {
      const { bytes } = await files.read(relative, maxBytes);
      const value = freeze(parseSemanticJson(bytes));
      operation.check();
      return { bytes, value };
    }
    async function head() {
      const result = await read("SEMANTIC-CATALOG.json", limits.pointerBytes);
      const pointer = semanticPointer(result.value, catalog.id);
      operation.check(); return pointer;
    }
    for (let attempt = 0; attempt <= limits.snapshotRetryCount; attempt++) {
      const pointer = await head();
      const generationFile = await read(pointer.generationPath, limits.generationBytes);
      const generation = semanticGeneration(generationFile.value, pointer, limits);
      operation.check();
      const receiptFile = await read(semanticContentPath("receipts", pointer.receiptDigest), limits.pointerBytes);
      const receipt = semanticReceipt(receiptFile.value, pointer);
      requireSemantic(await operation.wait(() => policy.authorizePublication(catalog, receipt)) === true, "PERMISSION_DENIED");
      // Even when bodies are shared (embedded Skill), all entries must be
      // permitted before opening the first body. PUBLIC is not an auth bypass.
      for (const entry of generation.entries) {
        requireSemantic(await operation.wait(() => policy.permitEntry(catalog, entry)) === true, "PERMISSION_DENIED");
      }
      const materials = new Map<string, unknown>();
      const unique = [...new Map(generation.entries.map(entry => [entry.path, entry])).values()];
      let index = 0, failed = false;
      const workers = Array.from({ length: Math.min(limits.readerConcurrency, unique.length) }, async () => {
        while (!failed && index < unique.length) {
          const entry = unique[index++];
          try {
            const material = await read(entry.path, entry.bytes);
            requireSemantic(material.bytes.length === entry.bytes &&
              `sha256:${createHash("sha256").update(material.bytes).digest("hex")}` === entry.fileDigest, "DIGEST_MISMATCH");
            materials.set(entry.path, material.value);
          } catch (error) { failed = true; throw error; }
        }
      });
      const results = await Promise.allSettled(workers);
      const failure = results.find(result => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      const snapshot = Object.freeze({ registryDigest, catalogId: catalog.id, pointer, generation, receipt, materials, attempts: attempt + 1, limits });
      requireSemantic(await operation.wait(() => policy.validateMaterials(snapshot,
        Object.freeze({files, operation: Object.freeze({check: operation.check})}))) === true, "MATERIAL_INVALID");
      // Recheck current authority after potentially slow material validation.
      requireSemantic(await operation.wait(() => policy.permitCatalog(catalog)) === true, "PERMISSION_DENIED");
      requireSemantic(await operation.wait(() => policy.authorizePublication(catalog, receipt)) === true, "PERMISSION_DENIED");
      for (const entry of generation.entries) {
        requireSemantic(await operation.wait(() => policy.permitEntry(catalog, entry)) === true, "PERMISSION_DENIED");
      }
      const after = await head();
      if (after.pointerDigest === pointer.pointerDigest) return snapshot;
      // Retry only a changed publication head, under the original deadline.
    }
    throw new SemanticCatalogError("DRIFT");
  } catch (error) {
    throw redactSemanticError(error);
  } finally { if (!input.operation) operation.close(); }
}
