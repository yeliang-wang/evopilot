import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { hydrateHarnessTemplate } from "./template.js";
import type {
  HarnessCatalogMount,
  HarnessCatalogScanResult,
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
export const EVOPILOT_HARNESS_CATALOG_COMPAT_VERSION = "3.0.0";

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
    const compatibilityWarning = catalog.compatibleEvopilot && !isEvopilotCatalogCompatible(catalog.compatibleEvopilot)
      ? [`catalog compatibleEvopilot=${catalog.compatibleEvopilot} does not include EvoPilot ${EVOPILOT_HARNESS_CATALOG_COMPAT_VERSION}`]
      : [];
    const templates = catalog.entries
      .filter((entry) => entry.status === "published")
      .map((entry) => readPublishedHarnessTemplate(catalog, entry))
      .filter((entry): entry is PublishedHarnessTemplate => Boolean(entry));
    const warnings = uniqueStrings([
      ...catalog.warnings,
      ...compatibilityWarning,
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
      catalog,
      templates: templates.map((item) => item.template),
      entries: catalog.entries,
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
      entryDigest: entry.digest ?? templateSourceDigest
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
