import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { hydrateHarnessTemplate } from "./template.js";
import type {
  HarnessCatalogMount,
  HarnessCatalogScanResult,
  HarnessRegistryCatalogRef,
  HarnessRegistryConfig,
  HarnessBundleAssetV3,
  HarnessComponentAssetV3,
  HarnessProfileAssetV3,
  HarnessTemplateLayer,
  HarnessTemplateProfile,
  PublishedHarnessCatalog,
  PublishedHarnessCatalogEntry,
  PublishedHarnessCatalogEntryV3,
  PublishedHarnessCatalogV3,
  PublishedHarnessTemplate
} from "./types.js";
import {
  digestObject,
  digestText,
  isRecord,
  normalizeStringList,
  optionalTrimmedString,
  safeFileName,
  uniqueStrings
} from "./utils.js";

export const EVOPILOT_HARNESS_CATALOG_BLOCK = "evopilot-harness-catalog";
export const EVOPILOT_HARNESS_CATALOG_V3_BLOCK = "evopilot-harness-catalog-v3";
export const EVOPILOT_HARNESS_CATALOG_V3_SCHEMA = "evopilot-harness-catalog/v3";
export const EVOPILOT_HARNESS_ASSET_V3_API_VERSION = "harness.evopilot.io/v3";
export const EVOPILOT_HARNESS_REGISTRY_SCHEMA = "evopilot-harness-registry/v1";
export const EVOPILOT_HARNESS_REGISTRY_V2_SCHEMA = "evopilot-harness-registry/v2";
export const EVOPILOT_HARNESS_CATALOG_COMPAT_VERSION = "5.0.0";

export function hydrateHarnessCatalogMount(input: unknown): HarnessCatalogMount {
  const record = isRecord(input) ? input : {};
  const now = new Date().toISOString();
  const source = String(record.source ?? "");
  const catalogId = safeFileName(String(record.catalogId ?? record.id ?? record.name ?? path.basename(source) ?? "local-harness-catalog"));
  return {
    schema: "evopilot-harness-catalog-mount/v1",
    catalogId,
    name: optionalTrimmedString(record.name) ?? catalogId,
    source,
    status: record.status === "DISABLED" ? "DISABLED" : "ACTIVE",
    priority: typeof record.priority === "number" ? record.priority : Number.isFinite(Number(record.priority)) ? Number(record.priority) : undefined,
    registryPath: optionalTrimmedString(record.registryPath),
    registryDigest: optionalTrimmedString(record.registryDigest),
    expectedCatalogDigest: optionalTrimmedString(record.expectedCatalogDigest),
    release: optionalTrimmedString(record.release),
    owner: optionalTrimmedString(record.owner),
    description: optionalTrimmedString(record.description),
    mountedBy: optionalTrimmedString(record.mountedBy ?? record.actor),
    mountedAt: String(record.mountedAt ?? now),
    updatedAt: String(record.updatedAt ?? record.mountedAt ?? now),
    lastReadAt: optionalTrimmedString(record.lastReadAt),
    lastReadStatus: record.lastReadStatus === "FAILED" ? "FAILED" : record.lastReadStatus === "READY" ? "READY" : undefined,
    lastReadError: optionalTrimmedString(record.lastReadError),
    lastReadWarnings: normalizeStringList(record.lastReadWarnings, []),
    catalogDigest: optionalTrimmedString(record.catalogDigest),
    templateCount: typeof record.templateCount === "number" ? record.templateCount : undefined
  };
}

export function readPublishedHarnessCatalog(source: string, mount?: HarnessCatalogMount): HarnessCatalogScanResult {
  const scannedAt = new Date().toISOString();
  let detectedFormat: HarnessCatalogScanResult["format"] = "legacy-template-v1";
  const sourceRoot = path.resolve(source);
  const mountRecord = hydrateHarnessCatalogMount(mount ?? {
    catalogId: path.basename(sourceRoot),
    name: path.basename(sourceRoot),
    source: sourceRoot
  });
  try {
    const catalogMarkdownPath = path.join(sourceRoot, "CATALOG.md");
    if (!fs.existsSync(catalogMarkdownPath)) {
      throw new Error(`CATALOG.md was not found in ${sourceRoot}`);
    }
    const markdown = fs.readFileSync(catalogMarkdownPath, "utf8");
    const block = extractHarnessCatalogYamlBlock(markdown);
    const parsed = parseYaml(block);
    if (isRecord(parsed) && parsed.schema === EVOPILOT_HARNESS_CATALOG_V3_SCHEMA) {
      detectedFormat = "asset-v3";
      return readPublishedHarnessCatalogV3(parsed, markdown, sourceRoot, mountRecord, scannedAt);
    }
    const catalogDigest = digestText(markdown);
    const catalog = hydratePublishedHarnessCatalog(parsed, sourceRoot, catalogDigest);
    const enrichedCatalog: PublishedHarnessCatalog = {
      ...catalog,
      priority: mountRecord.priority,
      registryPath: mountRecord.registryPath,
      registryDigest: mountRecord.registryDigest,
      expectedCatalogDigest: mountRecord.expectedCatalogDigest,
      release: mountRecord.release,
      owner: mountRecord.owner,
      description: mountRecord.description
    };
    const compatibilityWarning = enrichedCatalog.compatibleEvopilot && !isEvopilotCatalogCompatible(enrichedCatalog.compatibleEvopilot)
      ? [`catalog compatibleEvopilot=${enrichedCatalog.compatibleEvopilot} does not include EvoPilot ${EVOPILOT_HARNESS_CATALOG_COMPAT_VERSION}`]
      : [];
    const digestWarning = mountRecord.expectedCatalogDigest && mountRecord.expectedCatalogDigest !== catalogDigest
      ? [`catalog digest ${catalogDigest} differs from registry expectedCatalogDigest=${mountRecord.expectedCatalogDigest}`]
      : [];
    const templates = enrichedCatalog.entries
      .filter((entry) => entry.status === "published")
      .map((entry) => readPublishedHarnessTemplate(enrichedCatalog, entry))
      .filter((entry): entry is PublishedHarnessTemplate => Boolean(entry));
    const warnings = uniqueStrings([
      ...enrichedCatalog.warnings,
      ...compatibilityWarning,
      ...digestWarning,
      ...templates.flatMap((template) => template.warnings)
    ]);
    return {
      schema: "evopilot-harness-catalog-scan-result/v1",
      mount: {
        ...mountRecord,
        catalogId: catalog.catalogId,
        lastReadAt: scannedAt,
        lastReadStatus: "READY",
        lastReadWarnings: warnings,
        catalogDigest,
        templateCount: templates.length,
        updatedAt: scannedAt
      },
      catalog: enrichedCatalog,
      format: detectedFormat,
      templates: templates.map((item) => item.template),
      profiles: [],
      bundles: [],
      components: [],
      entries: enrichedCatalog.entries,
      status: "READY",
      warnings,
      scannedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      schema: "evopilot-harness-catalog-scan-result/v1",
      mount: {
        ...mountRecord,
        lastReadAt: scannedAt,
        lastReadStatus: "FAILED",
        lastReadError: message,
        updatedAt: scannedAt
      },
      format: detectedFormat,
      templates: [],
      profiles: [],
      bundles: [],
      components: [],
      entries: [],
      status: "FAILED",
      warnings: [],
      error: message,
      scannedAt
    };
  }
}

function readPublishedHarnessCatalogV3(
  input: Record<string, unknown>,
  _markdown: string,
  sourceRoot: string,
  mountRecord: HarnessCatalogMount,
  scannedAt: string
): HarnessCatalogScanResult {
  const catalog = hydratePublishedHarnessCatalogV3(input, sourceRoot, mountRecord);
  const calculatedCatalogDigest = digestObject({
    schema: input.schema,
    catalogId: input.catalogId,
    generatedBy: input.generatedBy,
    assetApiVersion: input.assetApiVersion,
    entryCount: input.entryCount,
    entries: input.entries
  });
  if (calculatedCatalogDigest !== catalog.catalogDigest) {
    throw new Error(`catalog ${catalog.catalogId} digest mismatch: expected=${catalog.catalogDigest} actual=${calculatedCatalogDigest}`);
  }

  const rawAssets = new Map<string, {
    entry: PublishedHarnessCatalogEntryV3;
    asset: HarnessComponentAssetV3 | HarnessProfileAssetV3 | HarnessBundleAssetV3;
    digest: string;
  }>();
  for (const entry of catalog.entries) {
    const assetPath = resolveCatalogAssetPath(sourceRoot, entry.assetPath);
    if (!fs.existsSync(assetPath)) {
      throw new Error(`catalog entry ${entry.kind}:${entry.id}@${entry.version} is missing asset ${entry.assetPath}`);
    }
    const raw = parseYaml(fs.readFileSync(assetPath, "utf8"));
    const asset = hydrateHarnessAssetV3(raw, entry);
    const assetDigest = digestObject(raw);
    if (assetDigest !== entry.assetDigest) {
      throw new Error(`catalog entry ${entry.kind}:${entry.id}@${entry.version} digest mismatch: expected=${entry.assetDigest} actual=${assetDigest}`);
    }
    rawAssets.set(harnessAssetKey(entry.kind, entry.id, entry.version), { entry, asset, digest: assetDigest });
  }

  validateHarnessAssetReferencesV3(rawAssets);
  const warnings = uniqueStrings([
    ...catalog.warnings,
    ...(mountRecord.expectedCatalogDigest && mountRecord.expectedCatalogDigest !== catalog.catalogDigest
      ? [`catalog digest ${catalog.catalogDigest} differs from registry expectedCatalogDigest=${mountRecord.expectedCatalogDigest}`]
      : [])
  ]);
  const enrich = <T extends HarnessComponentAssetV3 | HarnessProfileAssetV3 | HarnessBundleAssetV3>(record: {
    entry: PublishedHarnessCatalogEntryV3;
    asset: T;
    digest: string;
  }): T => ({
    ...record.asset,
    catalogRef: {
      catalogId: catalog.catalogId,
      catalogSource: sourceRoot,
      catalogDigest: catalog.catalogDigest,
      entryPath: record.entry.assetPath,
      entryDigest: record.digest,
      registryPath: mountRecord.registryPath,
      registryDigest: mountRecord.registryDigest,
      registryCatalogId: mountRecord.registryPath ? catalog.catalogId : undefined,
      registryCatalogPriority: mountRecord.priority,
      registryCatalogRelease: mountRecord.release
    }
  });
  const components = [...rawAssets.values()]
    .filter((record): record is typeof record & { asset: HarnessComponentAssetV3 } => record.asset.kind === "HarnessComponent" && record.asset.metadata.lifecycle === "published")
    .map(enrich);
  const profiles = [...rawAssets.values()]
    .filter((record): record is typeof record & { asset: HarnessProfileAssetV3 } => record.asset.kind === "HarnessProfile" && record.asset.metadata.lifecycle === "published")
    .map(enrich);
  const bundles = [...rawAssets.values()]
    .filter((record): record is typeof record & { asset: HarnessBundleAssetV3 } => record.asset.kind === "HarnessBundle" && record.asset.metadata.lifecycle === "published")
    .map(enrich);
  return {
    schema: "evopilot-harness-catalog-scan-result/v1",
    mount: {
      ...mountRecord,
      catalogId: catalog.catalogId,
      lastReadAt: scannedAt,
      lastReadStatus: "READY",
      lastReadWarnings: warnings,
      catalogDigest: catalog.catalogDigest,
      templateCount: bundles.length,
      updatedAt: scannedAt
    },
    catalog,
    format: "asset-v3",
    templates: [],
    profiles,
    bundles,
    components,
    entries: catalog.entries,
    status: "READY",
    warnings,
    scannedAt
  };
}

function hydratePublishedHarnessCatalogV3(
  input: Record<string, unknown>,
  sourceRoot: string,
  mount: HarnessCatalogMount
): PublishedHarnessCatalogV3 {
  if (input.schema !== EVOPILOT_HARNESS_CATALOG_V3_SCHEMA) {
    throw new Error(`catalog schema must be ${EVOPILOT_HARNESS_CATALOG_V3_SCHEMA}`);
  }
  if (input.assetApiVersion !== EVOPILOT_HARNESS_ASSET_V3_API_VERSION) {
    throw new Error(`catalog assetApiVersion must be ${EVOPILOT_HARNESS_ASSET_V3_API_VERSION}`);
  }
  const entries = Array.isArray(input.entries) ? input.entries.map(hydratePublishedHarnessCatalogEntryV3) : [];
  if (Number(input.entryCount) !== entries.length) {
    throw new Error(`catalog entryCount=${String(input.entryCount)} differs from entries.length=${entries.length}`);
  }
  const catalogDigest = requiredString(input.catalogDigest, "catalog.catalogDigest");
  return {
    schema: EVOPILOT_HARNESS_CATALOG_V3_SCHEMA,
    catalogId: safeFileName(requiredString(input.catalogId, "catalog.catalogId")),
    source: sourceRoot,
    catalogDigest,
    assetApiVersion: EVOPILOT_HARNESS_ASSET_V3_API_VERSION,
    generatedAt: optionalTrimmedString(input.generatedAt),
    generatedBy: optionalTrimmedString(input.generatedBy),
    priority: mount.priority,
    registryPath: mount.registryPath,
    registryDigest: mount.registryDigest,
    expectedCatalogDigest: mount.expectedCatalogDigest,
    release: mount.release,
    owner: mount.owner,
    description: mount.description,
    entries,
    warnings: []
  };
}

function hydratePublishedHarnessCatalogEntryV3(input: unknown): PublishedHarnessCatalogEntryV3 {
  const record = requireRecord(input, "catalog entry");
  const kind = record.kind;
  if (kind !== "HarnessComponent" && kind !== "HarnessProfile" && kind !== "HarnessBundle") {
    throw new Error(`catalog entry kind ${String(kind)} is not supported`);
  }
  const lifecycle = normalizeHarnessAssetLifecycle(record.lifecycle, "catalog entry lifecycle");
  const classificationRecord = isRecord(record.classification) ? record.classification : undefined;
  return {
    kind,
    id: safeFileName(requiredString(record.id, "catalog entry id")),
    version: requiredString(record.version, "catalog entry version"),
    lifecycle,
    assetPath: requiredString(record.assetPath, "catalog entry assetPath"),
    assetDigest: requiredDigest(record.assetDigest, "catalog entry assetDigest"),
    classification: classificationRecord ? {
      domain: safeFileName(requiredString(classificationRecord.domain, "catalog entry classification.domain")),
      role: safeFileName(requiredString(classificationRecord.role, "catalog entry classification.role")),
      taskClass: safeFileName(requiredString(classificationRecord.taskClass, "catalog entry classification.taskClass"))
    } : undefined,
    exportAdapters: normalizeStringList(record.exportAdapters, [])
  };
}

function hydrateHarnessAssetV3(
  input: unknown,
  entry: PublishedHarnessCatalogEntryV3
): HarnessComponentAssetV3 | HarnessProfileAssetV3 | HarnessBundleAssetV3 {
  const record = requireRecord(input, `asset ${entry.id}@${entry.version}`);
  if (record.apiVersion !== EVOPILOT_HARNESS_ASSET_V3_API_VERSION) {
    throw new Error(`asset ${entry.id}@${entry.version} apiVersion must be ${EVOPILOT_HARNESS_ASSET_V3_API_VERSION}`);
  }
  if (record.kind !== entry.kind) {
    throw new Error(`asset ${entry.id}@${entry.version} kind=${String(record.kind)} differs from catalog kind=${entry.kind}`);
  }
  const metadataRecord = requireRecord(record.metadata, `asset ${entry.id}@${entry.version} metadata`);
  const metadata = {
    id: safeFileName(requiredString(metadataRecord.id, "asset metadata.id")),
    version: requiredString(metadataRecord.version, "asset metadata.version"),
    name: requiredString(metadataRecord.name, "asset metadata.name"),
    description: requiredString(metadataRecord.description, "asset metadata.description"),
    lifecycle: normalizeHarnessAssetLifecycle(metadataRecord.lifecycle, "asset metadata.lifecycle"),
    owner: optionalTrimmedString(metadataRecord.owner),
    labels: Object.fromEntries(Object.entries(isRecord(metadataRecord.labels) ? metadataRecord.labels : {}).map(([key, value]) => [key, String(value)]))
  };
  if (metadata.id !== entry.id || metadata.version !== entry.version || metadata.lifecycle !== entry.lifecycle) {
    throw new Error(`asset ${metadata.id}@${metadata.version} metadata differs from catalog entry ${entry.id}@${entry.version}/${entry.lifecycle}`);
  }
  const provenanceRecord = isRecord(record.provenance) ? record.provenance : undefined;
  const provenance = provenanceRecord ? {
    sourceDigests: normalizeStringList(provenanceRecord.sourceDigests, []),
    ontologyVersion: optionalTrimmedString(provenanceRecord.ontologyVersion),
    policyVersion: optionalTrimmedString(provenanceRecord.policyVersion),
    advisorRunDigest: optionalTrimmedString(provenanceRecord.advisorRunDigest)
  } : undefined;
  const spec = requireRecord(record.spec, `asset ${entry.id}@${entry.version} spec`);
  if (entry.kind === "HarnessComponent") {
    return {
      apiVersion: EVOPILOT_HARNESS_ASSET_V3_API_VERSION,
      kind: "HarnessComponent",
      metadata,
      spec: {
        capability: requiredString(spec.capability, "component capability"),
        environment: requireRecord(spec.environment, "component environment"),
        actions: requireObjectArray(spec.actions, "component actions").map((action) => ({ ...action, id: requiredString(action.id, "component action id") })),
        constraints: requireStringArray(spec.constraints, "component constraints"),
        evidence: requireStringArray(spec.evidence, "component evidence"),
        validators: requireObjectArray(spec.validators, "component validators").map((validator) => ({ ...validator, id: requiredString(validator.id, "component validator id") }))
      },
      provenance
    };
  }
  if (entry.kind === "HarnessProfile") {
    const classification = requireRecord(spec.classification, "profile classification");
    const boundary = requireRecord(spec.boundary, "profile boundary");
    const match = requireRecord(spec.match, "profile match");
    const acceptance = requireRecord(spec.acceptance, "profile acceptance");
    return {
      apiVersion: EVOPILOT_HARNESS_ASSET_V3_API_VERSION,
      kind: "HarnessProfile",
      metadata,
      spec: {
        classification: {
          domain: safeFileName(requiredString(classification.domain, "profile classification.domain")),
          role: safeFileName(requiredString(classification.role, "profile classification.role")),
          taskClass: safeFileName(requiredString(classification.taskClass, "profile classification.taskClass"))
        },
        boundary: {
          inScope: requireStringArray(boundary.inScope, "profile boundary.inScope"),
          outOfScope: requireStringArray(boundary.outOfScope, "profile boundary.outOfScope")
        },
        match: {
          positiveConcepts: requireStringArray(match.positiveConcepts, "profile match.positiveConcepts"),
          negativeConcepts: normalizeStringList(match.negativeConcepts, []),
          requiredEvidenceKinds: requireStringArray(match.requiredEvidenceKinds, "profile match.requiredEvidenceKinds")
        },
        components: requireObjectArray(spec.components, "profile components").map(hydrateHarnessAssetRefV3),
        acceptance: {
          requiredEvidence: requireStringArray(acceptance.requiredEvidence, "profile acceptance.requiredEvidence"),
          blockingValidators: requireStringArray(acceptance.blockingValidators, "profile acceptance.blockingValidators")
        },
        evaluationPackRef: optionalTrimmedString(spec.evaluationPackRef)
      },
      provenance
    };
  }
  const profile = hydrateHarnessAssetRefV3(requireRecord(spec.profile, "bundle profile"));
  if (!profile.digest) throw new Error(`bundle ${entry.id}@${entry.version} profile digest is required`);
  return {
    apiVersion: EVOPILOT_HARNESS_ASSET_V3_API_VERSION,
    kind: "HarnessBundle",
    metadata,
    spec: {
      profile: { ...profile, digest: profile.digest },
      resolvedComponents: requireObjectArray(spec.resolvedComponents, "bundle resolvedComponents").map((item) => {
        const ref = hydrateHarnessAssetRefV3(item);
        if (!ref.digest) throw new Error(`bundle ${entry.id}@${entry.version} component ${ref.id}@${ref.version} digest is required`);
        return { ...ref, digest: ref.digest };
      }),
      executionPlan: requireStringArray(spec.executionPlan, "bundle executionPlan"),
      constraints: requireStringArray(spec.constraints, "bundle constraints"),
      evidence: requireStringArray(spec.evidence, "bundle evidence"),
      validators: requireStringArray(spec.validators, "bundle validators"),
      exports: requireObjectArray(spec.exports ?? [], "bundle exports").map((item) => ({
        adapter: requiredString(item.adapter, "bundle export adapter"),
        path: requiredString(item.path, "bundle export path")
      }))
    },
    provenance
  };
}

function validateHarnessAssetReferencesV3(records: Map<string, {
  entry: PublishedHarnessCatalogEntryV3;
  asset: HarnessComponentAssetV3 | HarnessProfileAssetV3 | HarnessBundleAssetV3;
  digest: string;
}>): void {
  for (const record of records.values()) {
    if (record.asset.kind === "HarnessProfile") {
      for (const ref of record.asset.spec.components) {
        const component = records.get(harnessAssetKey("HarnessComponent", ref.id, ref.version));
        if (!component || component.asset.kind !== "HarnessComponent") {
          throw new Error(`profile ${record.asset.metadata.id}@${record.asset.metadata.version} references missing component ${ref.id}@${ref.version}`);
        }
      }
    }
    if (record.asset.kind === "HarnessBundle") {
      const profileRef = record.asset.spec.profile;
      const profileRecord = records.get(harnessAssetKey("HarnessProfile", profileRef.id, profileRef.version));
      if (!profileRecord || profileRecord.asset.kind !== "HarnessProfile") {
        throw new Error(`bundle ${record.asset.metadata.id}@${record.asset.metadata.version} references missing profile ${profileRef.id}@${profileRef.version}`);
      }
      if (profileRecord.digest !== profileRef.digest) {
        throw new Error(`bundle ${record.asset.metadata.id}@${record.asset.metadata.version} profile digest mismatch: expected=${profileRef.digest} actual=${profileRecord.digest}`);
      }
      for (const ref of record.asset.spec.resolvedComponents) {
        const component = records.get(harnessAssetKey("HarnessComponent", ref.id, ref.version));
        if (!component || component.asset.kind !== "HarnessComponent") {
          throw new Error(`bundle ${record.asset.metadata.id}@${record.asset.metadata.version} references missing component ${ref.id}@${ref.version}`);
        }
        if (component.digest !== ref.digest) {
          throw new Error(`bundle ${record.asset.metadata.id}@${record.asset.metadata.version} component ${ref.id}@${ref.version} digest mismatch: expected=${ref.digest} actual=${component.digest}`);
        }
      }
      for (const profileComponent of profileRecord.asset.spec.components) {
        if (!record.asset.spec.resolvedComponents.some((ref) => ref.id === profileComponent.id && ref.version === profileComponent.version)) {
          throw new Error(`bundle ${record.asset.metadata.id}@${record.asset.metadata.version} does not resolve profile component ${profileComponent.id}@${profileComponent.version}`);
        }
      }
    }
  }
}

function hydrateHarnessAssetRefV3(input: unknown) {
  const record = requireRecord(input, "asset reference");
  return {
    id: safeFileName(requiredString(record.id, "asset reference id")),
    version: requiredString(record.version, "asset reference version"),
    digest: optionalTrimmedString(record.digest),
    required: record.required === true
  };
}

function harnessAssetKey(kind: string, id: string, version: string): string {
  return `${kind}:${id}@${version}`;
}

function resolveCatalogAssetPath(sourceRoot: string, assetPath: string): string {
  const root = path.resolve(sourceRoot);
  const resolved = path.resolve(root, assetPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`catalog asset path escapes root: ${assetPath}`);
  }
  return resolved;
}

function normalizeHarnessAssetLifecycle(value: unknown, field: string): "draft" | "review" | "approved" | "published" | "deprecated" {
  if (value === "draft" || value === "review" || value === "approved" || value === "published" || value === "deprecated") return value;
  throw new Error(`${field} is invalid: ${String(value)}`);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return value;
}

function requiredString(value: unknown, field: string): string {
  const result = optionalTrimmedString(value);
  if (!result) throw new Error(`${field} is required`);
  return result;
}

function requiredDigest(value: unknown, field: string): string {
  const result = requiredString(value, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(result)) throw new Error(`${field} must be a sha256 digest`);
  return result;
}

function requireStringArray(value: unknown, field: string): string[] {
  const result = normalizeStringList(value, []);
  if (result.length === 0) throw new Error(`${field} must contain at least one value`);
  return result;
}

function requireObjectArray(value: unknown, field: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((item, index) => requireRecord(item, `${field}[${index}]`));
}

export function extractHarnessCatalogYamlBlock(markdown: string): string {
  const v3Pattern = new RegExp("```(?:yaml|yml)\\s+" + EVOPILOT_HARNESS_CATALOG_V3_BLOCK + "\\s*\\n([\\s\\S]*?)```", "i");
  const legacyPattern = new RegExp("```(?:yaml|yml)\\s+" + EVOPILOT_HARNESS_CATALOG_BLOCK + "\\s*\\n([\\s\\S]*?)```", "i");
  const match = markdown.match(v3Pattern) ?? markdown.match(legacyPattern);
  if (!match?.[1]?.trim()) {
    throw new Error(`CATALOG.md must contain a non-empty \`${EVOPILOT_HARNESS_CATALOG_V3_BLOCK}\` or \`${EVOPILOT_HARNESS_CATALOG_BLOCK}\` YAML block.`);
  }
  return match[1];
}

export function readHarnessRegistryConfig(registryConfigPath: string): HarnessRegistryConfig {
  const resolvedPath = path.resolve(registryConfigPath);
  const warnings: string[] = [];
  const blockers: string[] = [];
  if (!fs.existsSync(resolvedPath)) {
    return {
      schema: EVOPILOT_HARNESS_REGISTRY_SCHEMA,
      status: "FAILED",
      path: resolvedPath,
      catalogCount: 0,
      enabledCount: 0,
      catalogs: [],
      warnings,
      blockers: [`registry config was not found at ${resolvedPath}`]
    };
  }
  const source = fs.readFileSync(resolvedPath, "utf8");
  const digest = digestText(source);
  let parsed: unknown;
  try {
    parsed = parseYaml(source);
  } catch (error) {
    return {
      schema: EVOPILOT_HARNESS_REGISTRY_SCHEMA,
      status: "FAILED",
      path: resolvedPath,
      digest,
      catalogCount: 0,
      enabledCount: 0,
      catalogs: [],
      warnings,
      blockers: [error instanceof Error ? error.message : String(error)]
    };
  }
  const record = isRecord(parsed) ? parsed : {};
  const registrySchema = record.schema === EVOPILOT_HARNESS_REGISTRY_V2_SCHEMA
    ? EVOPILOT_HARNESS_REGISTRY_V2_SCHEMA
    : EVOPILOT_HARNESS_REGISTRY_SCHEMA;
  if (record.schema !== EVOPILOT_HARNESS_REGISTRY_SCHEMA && record.schema !== EVOPILOT_HARNESS_REGISTRY_V2_SCHEMA) {
    blockers.push(`registry schema must be ${EVOPILOT_HARNESS_REGISTRY_SCHEMA} or ${EVOPILOT_HARNESS_REGISTRY_V2_SCHEMA}`);
  }
  if (Array.isArray(record.entries)) {
    blockers.push("registry must not contain entries; CATALOG.md is the only Harness entry index");
  }
  const catalogsInput = Array.isArray(record.catalogs) ? record.catalogs : [];
  if (catalogsInput.length === 0) blockers.push("registry catalogs is empty");
  const seen = new Set<string>();
  const catalogs = catalogsInput.map((item) => hydrateHarnessRegistryCatalogRef(item, resolvedPath, blockers));
  for (const catalog of catalogs) {
    if (seen.has(catalog.id)) blockers.push(`duplicate registry catalog id ${catalog.id}`);
    seen.add(catalog.id);
  }
  return {
    schema: registrySchema,
    status: blockers.length === 0 ? "READY" : "FAILED",
    path: resolvedPath,
    digest,
    generatedBy: optionalTrimmedString(record.generatedBy),
    generatedAt: optionalTrimmedString(record.generatedAt),
    catalogCount: catalogs.length,
    enabledCount: catalogs.filter((catalog) => catalog.enabled).length,
    catalogs: catalogs.sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      return left.id.localeCompare(right.id);
    }),
    warnings: uniqueStrings(warnings),
    blockers: uniqueStrings(blockers)
  };
}

export function harnessRegistryCatalogMounts(registryConfigPath: string): HarnessCatalogMount[] {
  const registry = readHarnessRegistryConfig(registryConfigPath);
  if (registry.status !== "READY") return [];
  return registry.catalogs
    .filter((catalog) => catalog.enabled)
    .map((catalog) => hydrateHarnessCatalogMount({
      catalogId: catalog.id,
      name: catalog.id,
      source: catalog.resolvedRoot,
      status: "ACTIVE",
      priority: catalog.priority,
      registryPath: registry.path,
      registryDigest: registry.digest,
      expectedCatalogDigest: catalog.expectedCatalogDigest,
      release: catalog.release,
      owner: catalog.owner,
      description: catalog.description,
      mountedBy: "evopilot-harness-registry-config",
      mountedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    }));
}

function hydrateHarnessRegistryCatalogRef(input: unknown, registryPath: string, blockers: string[]): HarnessRegistryCatalogRef {
  const record = isRecord(input) ? input : {};
  const rawId = optionalTrimmedString(record.id ?? record.catalogId);
  const id = rawId ? safeFileName(rawId) : "missing";
  const root = String(record.root ?? "").trim();
  if (!rawId) blockers.push("registry catalog is missing id");
  if (!root) blockers.push(`registry catalog ${id} is missing root`);
  if (Array.isArray(record.entries)) blockers.push(`registry catalog ${id} must not duplicate CATALOG.md entries`);
  const priority = Number.isFinite(Number(record.priority)) ? Number(record.priority) : 0;
  const resolvedRoot = root ? resolveRegistryRoot(registryPath, root) : "";
  const catalog: HarnessRegistryCatalogRef = {
    id,
    enabled: record.enabled !== false,
    priority,
    root,
    resolvedRoot,
    release: optionalTrimmedString(record.release),
    expectedCatalogDigest: optionalTrimmedString(record.expectedCatalogDigest),
    owner: optionalTrimmedString(record.owner),
    description: optionalTrimmedString(record.description),
    warnings: []
  };
  return catalog;
}

function resolveRegistryRoot(registryPath: string, root: string): string {
  return path.isAbsolute(root) ? path.resolve(root) : path.resolve(path.dirname(registryPath), root);
}

export function hydratePublishedHarnessCatalog(input: unknown, sourceRoot: string, catalogDigest: string): PublishedHarnessCatalog {
  const record = isRecord(input) ? input : {};
  const entries = Array.isArray(record.entries) ? record.entries.map(hydratePublishedHarnessCatalogEntry) : [];
  return {
    schema: "evopilot-published-harness-catalog/v1",
    catalogVersion: Number(record.catalogVersion ?? 1),
    catalogId: safeFileName(String(record.catalogId ?? path.basename(sourceRoot) ?? "harness-catalog")),
    source: sourceRoot,
    catalogDigest,
    generatedAt: optionalTrimmedString(record.generatedAt),
    compatibleEvopilot: optionalTrimmedString(record.compatibleEvopilot),
    entries,
    warnings: normalizeStringList(record.warnings, [])
  };
}

export function hydratePublishedHarnessCatalogEntry(input: unknown): PublishedHarnessCatalogEntry {
  const record = isRecord(input) ? input : {};
  const status = String(record.status ?? "published").trim().toLowerCase();
  return {
    name: safeFileName(String(record.name ?? record.id ?? "harness")),
    version: String(record.version ?? "0.1.0"),
    layer: normalizeCatalogHarnessLayer(record.layer ?? record.harnessLayer),
    domain: optionalTrimmedString(record.domain),
    status: status === "deprecated" || status === "draft" || status === "disabled" ? status : "published",
    path: String(record.path ?? "./harness.yaml"),
    digest: optionalTrimmedString(record.digest),
    tags: normalizeStringList(record.tags, []),
    matchSummary: optionalTrimmedString(record.matchSummary ?? record.summary)
  };
}

export function readPublishedHarnessTemplate(catalog: PublishedHarnessCatalog, entry: PublishedHarnessCatalogEntry): PublishedHarnessTemplate | undefined {
  const templatePath = path.resolve(catalog.source, entry.path);
  const warnings: string[] = [];
  if (!templatePath.startsWith(path.resolve(catalog.source) + path.sep) && templatePath !== path.resolve(catalog.source)) {
    warnings.push(`entry ${entry.name}@${entry.version} path escapes catalog root`);
    return undefined;
  }
  if (!fs.existsSync(templatePath)) {
    warnings.push(`entry ${entry.name}@${entry.version} missing template path ${entry.path}`);
    return undefined;
  }
  const templateSource = fs.readFileSync(templatePath, "utf8");
  const templateSourceDigest = digestText(templateSource);
  const parsed = parseYaml(templateSource);
  const template = hydrateHarnessTemplate(parsed);
  if (template.id !== entry.name) warnings.push(`entry ${entry.name}@${entry.version} points to template ${template.id}@${template.version}`);
  if (template.version !== entry.version) warnings.push(`entry ${entry.name}@${entry.version} version differs from template version ${template.version}`);
  if (entry.digest && entry.digest !== template.digest && entry.digest !== templateSourceDigest) warnings.push(`entry ${entry.name}@${entry.version} digest differs from template digest ${template.digest} and source digest ${templateSourceDigest}`);
  const catalogTemplate: HarnessTemplateProfile = {
    ...template,
    catalogRef: {
      catalogId: catalog.catalogId,
      catalogSource: catalog.source,
      catalogDigest: catalog.catalogDigest,
      entryPath: entry.path,
      entryDigest: entry.digest ?? templateSourceDigest,
      registryPath: catalog.registryPath,
      registryDigest: catalog.registryDigest,
      registryCatalogId: catalog.registryPath ? catalog.catalogId : undefined,
      registryCatalogPriority: catalog.priority,
      registryCatalogRelease: catalog.release
    }
  };
  return {
    schema: "evopilot-published-harness-template/v1",
    catalog,
    entry,
    template: catalogTemplate,
    templatePath,
    warnings
  };
}

export function isEvopilotCatalogCompatible(range: string, currentVersion = EVOPILOT_HARNESS_CATALOG_COMPAT_VERSION): boolean {
  const trimmed = range.trim();
  if (!trimmed || trimmed === "*" || trimmed.toLowerCase() === "any") return true;
  if (trimmed.startsWith(">=")) return compareSemver(currentVersion, trimmed.slice(2).trim()) >= 0;
  if (trimmed.startsWith("^")) {
    const minimum = trimmed.slice(1).trim();
    const [currentMajor] = currentVersion.split(".");
    const [minimumMajor] = minimum.split(".");
    return currentMajor === minimumMajor && compareSemver(currentVersion, minimum) >= 0;
  }
  return compareSemver(currentVersion, trimmed) === 0;
}

function normalizeCatalogHarnessLayer(value: unknown): HarnessTemplateLayer | undefined {
  const layer = String(value ?? "").trim().toLowerCase();
  if (layer === "runtime" || layer === "domain" || layer === "composite") return layer;
  return undefined;
}

function compareSemver(left: string, right: string): number {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  for (let index = 0; index < 3; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function semverParts(value: string): number[] {
  return value.split(/[.-]/).slice(0, 3).map((part) => {
    const parsed = Number(part);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}
