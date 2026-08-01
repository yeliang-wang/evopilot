import type {
  HarnessCapabilityDefinition,
  HarnessTemplateChangelogEntry,
  HarnessTemplateMaturityPhase,
  HarnessTemplateProfile,
  HarnessTemplateRef,
  HarnessTemplateSourceReference,
  HarnessTemplateValidationResult
} from "./types.js";
import {
  digestObject,
  isRecord,
  normalizeStringList,
  optionalTrimmedString,
  recordObject,
  safeFileName,
  uniqueStrings
} from "./utils.js";

export const HARNESS_TEMPLATE_MATURITY_PHASES: HarnessTemplateMaturityPhase[] = ["alpha", "beta", "rc", "ga"];

export function hydrateHarnessTemplate(input: unknown): HarnessTemplateProfile {
  const record = isRecord(input) ? input : {};
  const now = new Date().toISOString();
  const phaseMapping = hydrateHarnessPhaseMapping(record.phaseMapping);
  const template: Omit<HarnessTemplateProfile, "digest"> & { digest?: string } = {
    schema: "evopilot-harness-template/v1",
    id: safeFileName(String(record.id ?? "python-enterprise-harness")),
    version: String(record.version ?? "1.0.0"),
    name: String(record.name ?? record.id ?? "Harness Template"),
    description: String(record.description ?? ""),
    scope: record.scope === "tenant" ? "tenant" : "platform",
    languageFamily: normalizeHarnessLanguageFamily(record.languageFamily),
    capabilities: hydrateHarnessCapabilities(record.capabilities),
    runtimePatterns: recordObject(record.runtimePatterns),
    validationBaseline: recordObject(record.validationBaseline),
    evidenceContract: recordObject(record.evidenceContract),
    failureTaxonomy: recordObject(record.failureTaxonomy),
    diagnosticsBaseline: recordObject(record.diagnosticsBaseline),
    observabilityBaseline: recordObject(record.observabilityBaseline),
    governanceRules: recordObject(record.governanceRules),
    phaseMapping,
    llmDraftPolicy: recordObject(record.llmDraftPolicy),
    sourceReferences: hydrateHarnessTemplateSourceReferences(record.sourceReferences),
    changelog: hydrateHarnessTemplateChangelog(record.changelog, String(record.version ?? "1.0.0"), String(record.updatedAt ?? now)),
    createdAt: String(record.createdAt ?? now),
    updatedAt: String(record.updatedAt ?? record.createdAt ?? now)
  };
  return {
    ...template,
    digest: digestObject({ ...template, digest: undefined })
  };
}

export function validateHarnessTemplateProfile(template: HarnessTemplateProfile): HarnessTemplateValidationResult {
  const checks: HarnessTemplateValidationResult["checks"] = [];
  const add = (id: string, status: "PASS" | "FAIL" | "WARN", required: boolean, evidence: string[]) => checks.push({ id, status, required, evidence });
  const capabilityIds = template.capabilities.map((capability) => capability.id);
  const requiredCapabilities = ["source-boundary", "exception-tracking", "test-and-quality", "failure-diagnostics", "observability", "slo-monitoring", "operational-runbooks", "release-governance"];
  const missingCapabilities = requiredCapabilities.filter((id) => !capabilityIds.includes(id));
  add("identity", template.id.length > 0 && template.version.length > 0 ? "PASS" : "FAIL", true, [`id=${template.id}`, `version=${template.version}`]);
  add("language-family", ["python", "node", "java", "go", "generic"].includes(template.languageFamily) ? "PASS" : "FAIL", true, [`languageFamily=${template.languageFamily}`]);
  add("capability-baseline", missingCapabilities.length === 0 ? "PASS" : "FAIL", true, [`missing=${missingCapabilities.join(",") || "none"}`, `capabilities=${template.capabilities.length}`]);
  const sectionChecks: Array<[string, Record<string, unknown>]> = [
    ["runtime-patterns", template.runtimePatterns],
    ["validation-baseline", template.validationBaseline],
    ["evidence-contract", template.evidenceContract],
    ["failure-taxonomy", template.failureTaxonomy],
    ["diagnostics-baseline", template.diagnosticsBaseline],
    ["observability-baseline", template.observabilityBaseline],
    ["governance-rules", template.governanceRules],
    ["llm-draft-policy", template.llmDraftPolicy]
  ];
  for (const [id, value] of sectionChecks) {
    add(id, Object.keys(value).length > 0 ? "PASS" : "FAIL", true, [`keys=${Object.keys(value).join(",") || "none"}`]);
  }
  const mappedPhases = HARNESS_TEMPLATE_MATURITY_PHASES.filter((phase) => (template.phaseMapping[phase] ?? []).length > 0);
  add("phase-mapping", mappedPhases.length === HARNESS_TEMPLATE_MATURITY_PHASES.length ? "PASS" : "FAIL", true, [`phases=${mappedPhases.join(",")}`]);
  const currentChangelog = template.changelog.some((entry) => entry.version === template.version && (entry.summary.length > 0 || entry.changes.length > 0));
  add("changelog", currentChangelog ? "PASS" : "FAIL", true, [`version=${template.version}`, `entries=${template.changelog.length}`]);
  add("source-references", template.sourceReferences.length > 0 ? "PASS" : "WARN", false, [`sourceReferences=${template.sourceReferences.length}`]);
  const blockers = checks
    .filter((check) => check.required && check.status === "FAIL")
    .map((check) => `${check.id}:${check.evidence.join(";")}`);
  return {
    schema: "evopilot-harness-template-validation/v1",
    status: blockers.length === 0 ? "VALIDATED" : "FAILED",
    checks,
    blockers,
    warnings: checks.filter((check) => check.status === "WARN").map((check) => `${check.id}:${check.evidence.join(";")}`),
    evaluatedAt: new Date().toISOString()
  };
}

export function hydrateHarnessTemplateChangelog(value: unknown, fallbackVersion: string, fallbackChangedAt: string): HarnessTemplateChangelogEntry[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return raw
    .map((item): HarnessTemplateChangelogEntry | undefined => {
      if (typeof item === "string") {
        const summary = item.trim();
        if (!summary) return undefined;
        return {
          version: fallbackVersion,
          changedAt: fallbackChangedAt,
          summary,
          changes: [summary]
        };
      }
      const record = isRecord(item) ? item : {};
      const version = optionalTrimmedString(record.version) ?? fallbackVersion;
      const changedAt = String(record.changedAt ?? record.date ?? fallbackChangedAt);
      const changedBy = optionalTrimmedString(record.changedBy ?? record.actor ?? record.author);
      const changes = normalizeStringList(record.changes ?? record.items ?? record.details, []);
      const summary = optionalTrimmedString(record.summary ?? record.message ?? record.description) ?? changes[0] ?? "";
      if (!summary && changes.length === 0) return undefined;
      return {
        version,
        changedAt,
        ...(changedBy ? { changedBy } : {}),
        summary: summary || changes[0],
        changes: changes.length > 0 ? uniqueStrings(changes) : [summary]
      };
    })
    .filter((entry): entry is HarnessTemplateChangelogEntry => Boolean(entry));
}

export function hydrateHarnessTemplateSourceReferences(value: unknown): HarnessTemplateSourceReference[] {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((item): HarnessTemplateSourceReference | undefined => {
      const record = isRecord(item) ? item : {};
      const name = optionalTrimmedString(record.name ?? record.id ?? record.title);
      const rationale = optionalTrimmedString(record.rationale ?? record.reason ?? record.description);
      if (!name || !rationale) return undefined;
      const categoryValue = String(record.category ?? record.type ?? "engineering-practice").trim();
      const category: HarnessTemplateSourceReference["category"] = categoryValue === "github" || categoryValue === "official-doc"
        ? categoryValue
        : "engineering-practice";
      return {
        name,
        url: optionalTrimmedString(record.url ?? record.href),
        category,
        rationale
      };
    })
    .filter((reference): reference is HarnessTemplateSourceReference => Boolean(reference));
}

export function hydrateHarnessCapabilities(value: unknown): HarnessCapabilityDefinition[] {
  const fallback: HarnessCapabilityDefinition[] = [{
    id: "baseline",
    name: "Baseline harness capability",
    boundary: "Project capability boundary is declared by the harness profile.",
    requiredEvidence: ["target-evidence-package"]
  }];
  const raw = Array.isArray(value) ? value : fallback;
  return raw.map((item, index) => {
    const record = isRecord(item) ? item : {};
    const id = safeFileName(String(record.id ?? `capability-${index + 1}`));
    return {
      id,
      name: String(record.name ?? id),
      boundary: String(record.boundary ?? "Capability boundary must be declared before execution."),
      requiredEvidence: Array.isArray(record.requiredEvidence) ? uniqueStrings(record.requiredEvidence.map(String)) : ["target-evidence-package"]
    };
  });
}

export function hydrateHarnessPhaseMapping(value: unknown): Record<HarnessTemplateMaturityPhase, string[]> {
  const record = isRecord(value) ? value : {};
  return {
    alpha: normalizeStringList(record.alpha, ["source-boundary", "python-runtime"]),
    beta: normalizeStringList(record.beta, ["test-and-quality"]),
    rc: normalizeStringList(record.rc, ["observability", "release-governance"]),
    ga: normalizeStringList(record.ga, ["release-governance"])
  };
}

export function normalizeHarnessLanguageFamily(value: unknown): HarnessTemplateProfile["languageFamily"] {
  const language = String(value ?? "python").trim().toLowerCase();
  if (language === "python" || language === "node" || language === "java" || language === "go" || language === "generic") return language;
  return "python";
}

export function hydrateHarnessTemplateRef(value: unknown): HarnessTemplateRef {
  const record = isRecord(value) ? value : {};
  return {
    templateId: safeFileName(String(record.templateId ?? record.id ?? "python-enterprise-harness")),
    version: String(record.version ?? "1.0.0"),
    digest: String(record.digest ?? "")
  };
}

export function harnessTemplateRef(template: HarnessTemplateProfile): HarnessTemplateRef {
  return {
    templateId: template.id,
    version: template.version,
    digest: template.digest
  };
}
