import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { hydrateHarnessTemplate } from "./template.js";
import type {
  HarnessCatalogMount,
  HarnessCatalogScanResult,
  HarnessRegistryCatalogRef,
  HarnessRegistryConfig,
  HarnessTemplateLayer,
  HarnessTemplateProfile,
  PublishedHarnessCatalog,
  PublishedHarnessCatalogEntry,
  PublishedHarnessTemplate
} from "./types.js";
import {
  digestText,
  isRecord,
  normalizeStringList,
  optionalTrimmedString,
  safeFileName,
  uniqueStrings
} from "./utils.js";

export const EVOPILOT_HARNESS_CATALOG_BLOCK = "evopilot-harness-catalog";
export const EVOPILOT_HARNESS_REGISTRY_SCHEMA = "evopilot-harness-registry/v1";
export const EVOPILOT_HARNESS_CATALOG_COMPAT_VERSION = "3.1.0";

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
    const catalogDigest = digestText(markdown);
    const block = extractHarnessCatalogYamlBlock(markdown);
    const parsed = parseYaml(block);
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
      templates: templates.map((item) => item.template),
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
      templates: [],
      entries: [],
      status: "FAILED",
      warnings: [],
      error: message,
      scannedAt
    };
  }
}

export function extractHarnessCatalogYamlBlock(markdown: string): string {
  const pattern = new RegExp("```(?:yaml|yml)\\s+" + EVOPILOT_HARNESS_CATALOG_BLOCK + "\\s*\\n([\\s\\S]*?)```", "i");
  const match = markdown.match(pattern);
  if (!match?.[1]?.trim()) {
    throw new Error(`CATALOG.md must contain a non-empty \`${EVOPILOT_HARNESS_CATALOG_BLOCK}\` YAML block.`);
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
  if (record.schema !== EVOPILOT_HARNESS_REGISTRY_SCHEMA) {
    blockers.push(`registry schema must be ${EVOPILOT_HARNESS_REGISTRY_SCHEMA}`);
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
    schema: EVOPILOT_HARNESS_REGISTRY_SCHEMA,
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
