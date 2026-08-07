import { stringify as stringifyYaml } from "yaml";
import { harnessTemplateDomainError } from "./errors.js";
import {
  hydrateHarnessTemplateMatchReport,
  matchHarnessTemplateEvolutionSource
} from "./matching.js";
import {
  harnessTemplateRef,
  hydrateHarnessTemplate,
  hydrateHarnessTemplateRef,
  validateHarnessTemplateProfile
} from "./template.js";
import type {
  HarnessGapClassification,
  HarnessKnowledgeCategory,
  HarnessKnowledgeSnapshot,
  HarnessKnowledgeSource,
  HarnessKnowledgeSourceType,
  HarnessTemplateChangelogEntry,
  HarnessTemplateDraft,
  HarnessTemplateEvolutionActor,
  HarnessTemplateEvolutionAnalysis,
  HarnessTemplateEvolutionRun,
  HarnessTemplateEvolutionStatus,
  HarnessTemplateImpactReport,
  HarnessTemplateMatchReport,
  HarnessTemplateProfile,
  HarnessTemplateProjectProfileBinding,
  HarnessTemplateRef,
  HarnessTemplateSourceReference
} from "./types.js";
import {
  canonicalJson,
  digestText,
  extractJsonObject,
  incrementSemverPatch,
  isRecord,
  normalizeStringList,
  normalizeStringRecord,
  optionalTrimmedString,
  recordObject,
  safeFileName,
  uniqueStrings
} from "./utils.js";

const DEFAULT_TENANT_ID = "tenant-production";
const DEFAULT_WORKSPACE_ID = "workspace-agent-products";

export interface HarnessTemplateEvolutionRepository {
  listHarnessTemplates(): HarnessTemplateProfile[];
  readHarnessTemplate(templateId: string, version?: string): HarnessTemplateProfile | undefined;
  writeHarnessTemplate(template: HarnessTemplateProfile): HarnessTemplateProfile;
  listProjectHarnessTemplateBindings(tenantId: string, workspaceId: string): HarnessTemplateProjectProfileBinding[];
  readProject?: (projectId: string) => unknown;
  listGoals?: () => unknown[];
  readGoal?: (goalId: string) => unknown;
  listLoops?: () => unknown[];
  readLoop?: (loopId: string) => unknown;
  listReleaseEvidenceBundles?: () => unknown[];
  readReleaseEvidenceBundle?: (bundleId: string) => unknown;
  listProjectHarnessProfileSummaries?: (projectId: string) => unknown[];
  listProjectHarnessProfileVersions?: (projectId: string, profileId?: string) => unknown[];
  readActiveProjectHarnessProfile?: (projectId: string, profileId?: string) => unknown;
}

export interface HarnessTemplateEvolutionLlmClient {
  generate(args: {
    caller: string;
    intent: string;
    outputContract: string;
    jsonObject: boolean;
    latencyClass: string;
    complexity: string;
    outputSize: string;
    metadata: Record<string, string>;
    prompt: string;
  }): Promise<{
    success: boolean;
    text: string;
    errorMessage?: string;
    errorCode?: string;
    provider?: string;
    model?: string;
    requestId?: string;
    durationMs?: number;
  }>;
}

export interface HarnessTemplateEvolutionLlmSelection {
  profileId?: string;
  provider?: string;
  model?: string;
}

export interface HarnessTemplateEvolutionLlmResolution {
  client?: HarnessTemplateEvolutionLlmClient;
  selection: HarnessTemplateEvolutionLlmSelection;
  requireLlm: boolean;
}

export interface HarnessTemplateEvolutionPorts {
  resolveLlm?: (args: {
    run: HarnessTemplateEvolutionRun;
    body: Record<string, unknown>;
  }) => HarnessTemplateEvolutionLlmResolution;
}

export function hydrateHarnessTemplateEvolutionRun(input: unknown): HarnessTemplateEvolutionRun {
  const record = isRecord(input) ? input : {};
  const now = new Date().toISOString();
  const baseTemplateRef = hydrateHarnessTemplateRef(record.baseTemplateRef);
  const sources = Array.isArray(record.sources) ? record.sources.map(hydrateHarnessKnowledgeSource) : [];
  const snapshots = Array.isArray(record.snapshots) ? record.snapshots.map(hydrateHarnessKnowledgeSnapshot) : [];
  const autoMatch = isRecord(record.autoMatch) ? hydrateHarnessTemplateMatchReport(record.autoMatch) : undefined;
  const draft = isRecord(record.draft) ? hydrateHarnessTemplateDraft(record.draft, baseTemplateRef) : undefined;
  const review = isRecord(record.review)
    ? {
        status: record.review.status === "REJECTED" ? "REJECTED" as const : "APPROVED" as const,
        confirmedBy: String(record.review.confirmedBy ?? ""),
        confirmation: String(record.review.confirmation ?? ""),
        confirmedAt: String(record.review.confirmedAt ?? now)
      }
    : undefined;
  return {
    schema: "evopilot-harness-template-evolution-run/v1",
    evolutionId: safeFileName(String(record.evolutionId ?? record.id ?? `template-evolution-${Date.now()}`)),
    tenantId: safeFileName(String(record.tenantId ?? DEFAULT_TENANT_ID)),
    workspaceId: safeFileName(String(record.workspaceId ?? DEFAULT_WORKSPACE_ID)),
    status: normalizeHarnessTemplateEvolutionStatus(record.status),
    baseTemplateRef,
    targetTemplateId: safeFileName(String(record.targetTemplateId ?? record.targetTemplate ?? baseTemplateRef.templateId)),
    targetVersion: String(record.targetVersion ?? draft?.version ?? incrementSemverPatch(baseTemplateRef.version)),
    intent: String(record.intent ?? "Evolve HarnessTemplate from administrator-provided knowledge sources."),
    sources,
    snapshots,
    ...(autoMatch ? { autoMatch } : {}),
    analysisSummary: isRecord(record.analysisSummary) ? hydrateHarnessTemplateAnalysis(record.analysisSummary) : undefined,
    ...(draft ? { draft } : {}),
    ...(review ? { review } : {}),
    publishedTemplateRef: isRecord(record.publishedTemplateRef) ? hydrateHarnessTemplateRef(record.publishedTemplateRef) : undefined,
    impactReport: isRecord(record.impactReport) ? hydrateHarnessTemplateImpactReport(record.impactReport) : undefined,
    blockers: normalizeStringList(record.blockers, []),
    warnings: normalizeStringList(record.warnings, []),
    createdBy: String(record.createdBy ?? "unknown"),
    createdAt: String(record.createdAt ?? now),
    updatedAt: String(record.updatedAt ?? record.createdAt ?? now)
  };
}

export function hydrateHarnessKnowledgeSource(input: unknown): HarnessKnowledgeSource {
  const record = isRecord(input) ? input : {};
  const now = new Date().toISOString();
  const type = normalizeHarnessKnowledgeSourceType(record.type);
  const rawContentText = optionalTrimmedString(record.contentText ?? record.text ?? record.content);
  const baseMetadata = isRecord(record.metadata) ? record.metadata : {};
  const redacted = type === "production-log" && rawContentText ? redactHarnessSensitiveText(rawContentText) : undefined;
  const contentText = redacted?.text ?? rawContentText;
  const metadata = redacted
    ? {
        ...baseMetadata,
        redaction: {
          schema: "evopilot-harness-source-redaction/v1",
          applied: redacted.applied,
          rules: redacted.rules,
          originalTextDigest: digestText(rawContentText ?? ""),
          redactedTextDigest: digestText(contentText ?? "")
        }
      }
    : baseMetadata;
  return {
    schema: "evopilot-harness-knowledge-source/v1",
    sourceId: safeFileName(String(record.sourceId ?? record.id ?? `source-${Date.now()}-${Math.random().toString(16).slice(2)}`)),
    type,
    name: optionalTrimmedString(record.name ?? record.title ?? record.fileName ?? record.uri) ?? "Harness knowledge source",
    uri: optionalTrimmedString(record.uri ?? record.url ?? record.repository),
    ref: optionalTrimmedString(record.ref ?? record.branch ?? record.commit ?? record.version),
    fileName: optionalTrimmedString(record.fileName ?? record.filename ?? record.path),
    mediaType: optionalTrimmedString(record.mediaType ?? record.mimeType ?? record.contentType),
    contentText,
    contentDigest: optionalTrimmedString(record.contentDigest) ?? (rawContentText ? digestText(rawContentText) : undefined),
    metadata,
    createdAt: String(record.createdAt ?? now)
  };
}

export function hydrateHarnessKnowledgeSnapshot(input: unknown): HarnessKnowledgeSnapshot {
  const record = isRecord(input) ? input : {};
  const extractedText = String(record.extractedText ?? "");
  const contentDigest = optionalTrimmedString(record.contentDigest) ?? digestText(extractedText);
  return {
    schema: "evopilot-harness-knowledge-snapshot/v1",
    snapshotId: safeFileName(String(record.snapshotId ?? record.id ?? `snapshot-${Date.now()}`)),
    sourceId: safeFileName(String(record.sourceId ?? "source")),
    type: normalizeHarnessKnowledgeSourceType(record.type),
    name: String(record.name ?? "Harness knowledge snapshot"),
    uri: optionalTrimmedString(record.uri),
    ref: optionalTrimmedString(record.ref),
    contentDigest,
    textDigest: optionalTrimmedString(record.textDigest) ?? digestText(extractedText),
    extractedText,
    extractedTextPreview: String(record.extractedTextPreview ?? extractedText.slice(0, 800)),
    metadata: isRecord(record.metadata) ? record.metadata : {},
    warnings: normalizeStringList(record.warnings, []),
    createdAt: String(record.createdAt ?? new Date().toISOString())
  };
}

export function hydrateHarnessTemplateDraft(input: unknown, baseTemplateRef: HarnessTemplateRef): HarnessTemplateDraft {
  const record = isRecord(input) ? input : {};
  const template = hydrateHarnessTemplate(record.template);
  const pack = isRecord(record.pack) ? record.pack : {};
  const validation = isRecord(record.validation)
    ? record.validation as unknown as HarnessTemplateDraft["validation"]
    : validateHarnessTemplateProfile(template);
  const diffFromBase = isRecord(record.diffFromBase) ? record.diffFromBase : {};
  const sourceCoverage = isRecord(record.sourceCoverage) ? record.sourceCoverage : {};
  const generatedBy = isRecord(record.generatedBy) ? record.generatedBy : {};
  return {
    schema: "evopilot-harness-template-draft/v1",
    draftId: safeFileName(String(record.draftId ?? `draft-${template.version}`)),
    version: String(record.version ?? template.version),
    template,
    pack: {
      readme: String(pack.readme ?? ""),
      templateYaml: String(pack.templateYaml ?? stringifyYaml(template)),
      changelog: String(pack.changelog ?? ""),
      examples: normalizeStringRecord(pack.examples)
    },
    validation,
    diffFromBase: {
      baseTemplateRef: hydrateHarnessTemplateRef(diffFromBase.baseTemplateRef ?? baseTemplateRef),
      changedSections: normalizeStringList(diffFromBase.changedSections, []),
      summary: normalizeStringList(diffFromBase.summary, [])
    },
    sourceCoverage: {
      sourceCount: Number(sourceCoverage.sourceCount ?? 0),
      snapshotCount: Number(sourceCoverage.snapshotCount ?? 0),
      sources: Array.isArray(sourceCoverage.sources)
        ? sourceCoverage.sources.map((item) => {
            const source = isRecord(item) ? item : {};
            return {
              sourceId: safeFileName(String(source.sourceId ?? "source")),
              type: normalizeHarnessKnowledgeSourceType(source.type),
              name: String(source.name ?? "source"),
              digest: String(source.digest ?? ""),
              knowledgeCategory: normalizeHarnessKnowledgeCategory(source.knowledgeCategory),
              gapClassification: normalizeHarnessGapClassification(source.gapClassification),
              redactionApplied: typeof source.redactionApplied === "boolean" ? source.redactionApplied : undefined,
              usedFor: normalizeStringList(source.usedFor, []),
              projectActions: normalizeStringList(source.projectActions, [])
            };
          })
        : []
    },
    generatedBy: {
      mode: generatedBy.mode === "llm" ? "llm" : "deterministic-template",
      actor: optionalTrimmedString(generatedBy.actor),
      llmProfileId: optionalTrimmedString(generatedBy.llmProfileId),
      provider: optionalTrimmedString(generatedBy.provider),
      model: optionalTrimmedString(generatedBy.model),
      requestId: optionalTrimmedString(generatedBy.requestId),
      evidence: normalizeStringList(generatedBy.evidence, [])
    },
    createdAt: String(record.createdAt ?? new Date().toISOString())
  };
}

export function hydrateHarnessTemplateAnalysis(input: unknown): HarnessTemplateEvolutionAnalysis {
  const record = isRecord(input) ? input : {};
  return {
    schema: "evopilot-harness-template-analysis/v1",
    capabilitySignals: normalizeStringList(record.capabilitySignals, []),
    runtimeSignals: normalizeStringList(record.runtimeSignals, []),
    evidenceSignals: normalizeStringList(record.evidenceSignals, []),
    failureSignals: normalizeStringList(record.failureSignals, []),
    observabilitySignals: normalizeStringList(record.observabilitySignals, []),
    governanceSignals: normalizeStringList(record.governanceSignals, []),
    domainSignals: normalizeStringList(record.domainSignals, []),
    gapClassifications: normalizeHarnessGapClassificationList(record.gapClassifications),
    sourceCoverage: normalizeStringList(record.sourceCoverage, []),
    generatedAt: String(record.generatedAt ?? new Date().toISOString())
  };
}

export function hydrateHarnessTemplateImpactReport(input: unknown): HarnessTemplateImpactReport {
  const record = isRecord(input) ? input : {};
  return {
    schema: "evopilot-harness-template-impact-report/v1",
    templateRef: hydrateHarnessTemplateRef(record.templateRef),
    affectedProjectProfiles: Array.isArray(record.affectedProjectProfiles)
      ? record.affectedProjectProfiles.map((item) => {
          const profile = isRecord(item) ? item : {};
          const impactValue = String(profile.impact ?? "MATCHES_TEMPLATE_ID");
          const impact: HarnessTemplateImpactReport["affectedProjectProfiles"][number]["impact"] = impactValue === "STALE_TEMPLATE_VERSION" || impactValue === "NO_ACTIVE_PROFILE"
            ? impactValue
            : "MATCHES_TEMPLATE_ID";
          return {
            tenantId: safeFileName(String(profile.tenantId ?? DEFAULT_TENANT_ID)),
            workspaceId: safeFileName(String(profile.workspaceId ?? DEFAULT_WORKSPACE_ID)),
            projectId: safeFileName(String(profile.projectId ?? "project")),
            profileId: safeFileName(String(profile.profileId ?? "default")),
            activeVersion: typeof profile.activeVersion === "number" ? profile.activeVersion : undefined,
            activeTemplateVersion: optionalTrimmedString(profile.activeTemplateVersion),
            activeTemplateDigest: optionalTrimmedString(profile.activeTemplateDigest),
            impact,
            nextAction: String(profile.nextAction ?? "review-template-impact")
          };
        })
      : [],
    staleProfileCount: Number(record.staleProfileCount ?? 0),
    generatedAt: String(record.generatedAt ?? new Date().toISOString())
  };
}

export function normalizeHarnessTemplateEvolutionStatus(value: unknown): HarnessTemplateEvolutionStatus {
  const status = String(value ?? "CREATED").trim().toUpperCase();
  if (status === "SOURCES_COLLECTED" || status === "ANALYZED" || status === "REVIEW_REQUIRED" || status === "APPROVED" || status === "PUBLISHED" || status === "IMPACT_ANALYZED" || status === "CLOSED" || status === "BLOCKED" || status === "REJECTED" || status === "SUPERSEDED") return status;
  return "CREATED";
}

export function normalizeHarnessKnowledgeSourceType(value: unknown): HarnessKnowledgeSourceType {
  const type = String(value ?? "admin-note").trim().toLowerCase();
  if (type === "web-url" || type === "url" || type === "website") return "web-url";
  if (type === "github" || type === "github-repo") return "github-repo";
  if (type === "gitlab" || type === "gitlab-repo") return "gitlab-repo";
  if (type === "file" || type === "attachment" || type === "upload") return "attachment";
  if (type === "local-pack" || type === "pack") return "local-pack";
  if (type === "existing-template" || type === "template") return "existing-template";
  if (type === "runtime-evidence" || type === "evidence") return "runtime-evidence";
  if (type === "source-project" || type === "project" || type === "historical-project" || type === "local-project") return "source-project";
  if (type === "source-corpus" || type === "corpus" || type === "project-corpus" || type === "domain-corpus") return "source-corpus";
  if (type === "production-log" || type === "runtime-log" || type === "incident-log" || type === "log") return "production-log";
  if (type === "evopilot-history" || type === "history" || type === "goal-history" || type === "loop-history" || type === "project-history") return "evopilot-history";
  return "admin-note";
}

function normalizeHarnessKnowledgeCategory(value: unknown): HarnessKnowledgeCategory | undefined {
  const category = String(value ?? "").trim().toLowerCase();
  if (category === "external-reference" || category === "source-project" || category === "project-corpus" || category === "attachment" || category === "runtime-log" || category === "evopilot-history" || category === "template-pack" || category === "admin-note") return category;
  return undefined;
}

function normalizeHarnessGapClassification(value: unknown): HarnessGapClassification | undefined {
  const classification = String(value ?? "").trim().toLowerCase();
  if (classification === "harness-template" || classification === "project-profile" || classification === "tenant-policy" || classification === "evopilot-core" || classification === "source-quality") return classification;
  return undefined;
}

function normalizeHarnessGapClassificationList(value: unknown): HarnessGapClassification[] {
  const classifications = normalizeStringList(value, [])
    .map(normalizeHarnessGapClassification)
    .filter((item): item is HarnessGapClassification => Boolean(item));
  return uniqueStrings(classifications) as HarnessGapClassification[];
}

export function createHarnessTemplateEvolutionRun(store: HarnessTemplateEvolutionRepository, auth: HarnessTemplateEvolutionActor, body: Record<string, unknown>): HarnessTemplateEvolutionRun {
  const sources = parseHarnessKnowledgeSources(body);
  if (sources.length === 0) {
    throw harnessTemplateDomainError(400, "HARNESS_TEMPLATE_EVOLUTION_SOURCES_REQUIRED", "HarnessTemplate evolution requires at least one source, file, or administrator note.");
  }
  const explicitBaseTemplateId = optionalTrimmedString(body.baseTemplateId ?? body.baseTemplate ?? body.templateId);
  const explicitBaseTemplateVersion = optionalTrimmedString(body.baseTemplateVersion ?? body.templateVersion);
  const shouldAutoMatch = harnessTemplateEvolutionAutoMatchRequested(body) || (!explicitBaseTemplateId && hasHarnessTemplateEvolutionSemanticSources(sources));
  const intent = optionalTrimmedString(body.intent ?? body.objective ?? body.description);
  const autoMatch = shouldAutoMatch
    ? matchHarnessTemplateEvolutionSource(store, { sources, intent })
    : undefined;
  const baseTemplateId = safeFileName(String(explicitBaseTemplateId ?? autoMatch?.baseTemplateRef.templateId ?? "python-enterprise-harness"));
  const baseTemplateVersion = explicitBaseTemplateVersion ?? autoMatch?.baseTemplateRef.version;
  const baseTemplate = store.readHarnessTemplate(baseTemplateId, baseTemplateVersion);
  if (!baseTemplate) throw harnessTemplateDomainError(404, "HARNESS_TEMPLATE_NOT_FOUND", `HarnessTemplate ${baseTemplateId}${baseTemplateVersion ? `@${baseTemplateVersion}` : ""} was not found.`);
  const targetTemplateId = safeFileName(String(body.targetTemplateId ?? body.targetTemplate ?? autoMatch?.targetTemplateId ?? baseTemplate.id));
  const targetVersion = optionalTrimmedString(body.targetVersion ?? body.version) ?? autoMatch?.targetVersion ?? incrementSemverPatch(baseTemplate.version);
  const now = new Date().toISOString();
  const warnings = autoMatch?.decision === "NEEDS_ADMIN_CONFIRMATION"
    ? ["auto-match requires administrator confirmation before advancing or override base/target explicitly"]
    : [];
  return hydrateHarnessTemplateEvolutionRun({
    evolutionId: body.id ?? body.evolutionId ?? `${targetTemplateId}-${targetVersion}-${Date.now()}`,
    tenantId: auth.tenantId,
    workspaceId: auth.workspaceId,
    status: "CREATED",
    baseTemplateRef: harnessTemplateRef(baseTemplate),
    targetTemplateId,
    targetVersion,
    intent: intent ?? `Evolve ${baseTemplate.id}@${baseTemplate.version} to ${targetVersion}.`,
    sources,
    snapshots: [],
    ...(autoMatch ? { autoMatch } : {}),
    blockers: [],
    warnings,
    createdBy: auth.actor,
    createdAt: now,
    updatedAt: now
  });
}

function harnessTemplateEvolutionAutoMatchRequested(body: Record<string, unknown>): boolean {
  if (body.autoMatch === true || body.autoMatch === "true") return true;
  const matchMode = optionalTrimmedString(body.matchMode ?? body.match ?? body.templateMatch);
  return matchMode === "auto" || matchMode === "auto-match";
}

function hasHarnessTemplateEvolutionSemanticSources(sources: HarnessKnowledgeSource[]): boolean {
  return sources.some((source) => source.type === "source-project" || source.type === "source-corpus" || source.type === "attachment" || source.type === "production-log" || source.type === "evopilot-history" || Boolean(source.contentText));
}

export function parseHarnessKnowledgeSources(body: Record<string, unknown>): HarnessKnowledgeSource[] {
  const raw = Array.isArray(body.sources) ? body.sources : [];
  const sources = raw.map(hydrateHarnessKnowledgeSource);
  const singleSource = body.source;
  if (isRecord(singleSource)) sources.push(hydrateHarnessKnowledgeSource(singleSource));
  const note = optionalTrimmedString(body.note ?? body.adminNote);
  if (note) {
    sources.push(hydrateHarnessKnowledgeSource({
      type: "admin-note",
      name: "Administrator note",
      contentText: note
    }));
  }
  return sources.map((source, index) => ({
    ...source,
    sourceId: source.sourceId === "source" ? `source-${index + 1}` : source.sourceId
  }));
}

export async function advanceHarnessTemplateEvolutionRun(
  store: HarnessTemplateEvolutionRepository,
  run: HarnessTemplateEvolutionRun,
  auth: HarnessTemplateEvolutionActor,
  body: Record<string, unknown>,
  ports: HarnessTemplateEvolutionPorts = {}
): Promise<HarnessTemplateEvolutionRun> {
  if (run.status === "PUBLISHED" || run.status === "IMPACT_ANALYZED" || run.status === "CLOSED") return run;
  if (run.status === "REJECTED" || run.status === "SUPERSEDED") throw harnessTemplateDomainError(409, "HARNESS_TEMPLATE_EVOLUTION_NOT_ADVANCEABLE", `HarnessTemplate evolution ${run.evolutionId} is ${run.status}.`);
  const now = new Date().toISOString();
  if (run.status === "CREATED") {
    const snapshots = await collectHarnessKnowledgeSnapshots(store, run);
    const blockers = snapshots.length === 0 ? ["sources:no snapshots collected"] : [];
    const warnings = uniqueStrings([...run.warnings, ...snapshots.flatMap((snapshot) => snapshot.warnings)]);
    return hydrateHarnessTemplateEvolutionRun({
      ...run,
      snapshots,
      status: blockers.length > 0 ? "BLOCKED" : "SOURCES_COLLECTED",
      blockers,
      warnings,
      updatedAt: now
    });
  }
  if (run.status === "SOURCES_COLLECTED") {
    const analysisSummary = analyzeHarnessKnowledgeSnapshots(run.snapshots);
    return hydrateHarnessTemplateEvolutionRun({
      ...run,
      analysisSummary,
      status: "ANALYZED",
      updatedAt: now
    });
  }
  if (run.status === "ANALYZED" || run.status === "BLOCKED") {
    const draft = await generateHarnessTemplateEvolutionDraft(store, run, auth, body, ports);
    const blockers = draft.validation.status === "VALIDATED" ? [] : draft.validation.blockers;
    return hydrateHarnessTemplateEvolutionRun({
      ...run,
      draft,
      status: blockers.length > 0 ? "BLOCKED" : "REVIEW_REQUIRED",
      blockers,
      warnings: uniqueStrings([...run.warnings, ...draft.validation.warnings]),
      updatedAt: now
    });
  }
  return run;
}

export async function collectHarnessKnowledgeSnapshots(store: HarnessTemplateEvolutionRepository, run: HarnessTemplateEvolutionRun): Promise<HarnessKnowledgeSnapshot[]> {
  const snapshots: HarnessKnowledgeSnapshot[] = [];
  for (const source of run.sources) {
    const collected = await collectHarnessKnowledgeSnapshot(store, source);
    snapshots.push(collected);
  }
  return snapshots;
}

async function collectHarnessKnowledgeSnapshot(store: HarnessTemplateEvolutionRepository, source: HarnessKnowledgeSource): Promise<HarnessKnowledgeSnapshot> {
  const warnings: string[] = [];
  let extractedText = source.contentText ?? "";
  let metadata: Record<string, unknown> = { ...source.metadata };
  if (!extractedText && source.type === "existing-template") {
    const templateId = optionalTrimmedString(source.metadata.templateId ?? source.uri) ?? source.uri ?? "python-enterprise-harness";
    const templateVersion = optionalTrimmedString(source.metadata.templateVersion ?? source.ref);
    const template = store.readHarnessTemplate(templateId, templateVersion);
    if (template) extractedText = JSON.stringify(template, null, 2);
    else warnings.push(`existing-template-not-found:${templateId}${templateVersion ? `@${templateVersion}` : ""}`);
  }
  if (!extractedText && source.type === "runtime-evidence") {
    const evidenceId = optionalTrimmedString(source.metadata.evidenceBundleId ?? source.metadata.bundleId ?? source.uri);
    const evidence = evidenceId ? store.readReleaseEvidenceBundle?.(evidenceId) : undefined;
    if (evidence) {
      extractedText = JSON.stringify({ evidenceBundleId: evidenceId, evidence }, null, 2);
      metadata = { ...metadata, evidenceBundleId: evidenceId, extractedBy: "server-release-evidence-reader" };
    } else {
      warnings.push(`runtime-evidence-not-found-or-not-readable:${evidenceId ?? "unknown"}`);
    }
  }
  if (!extractedText && source.type === "evopilot-history") {
    const collected = collectEvopilotHistoryText(store, source);
    extractedText = collected.text;
    metadata = { ...metadata, ...collected.metadata };
    warnings.push(...collected.warnings);
  }
  if (!extractedText && source.type === "source-project") {
    const collected = collectRegisteredProjectKnowledgeText(store, source);
    extractedText = collected.text;
    metadata = { ...metadata, ...collected.metadata };
    warnings.push(...collected.warnings);
  }
  if (!extractedText && source.type === "source-corpus") {
    const collected = collectSourceCorpusKnowledgeText(store, source);
    extractedText = collected.text;
    metadata = { ...metadata, ...collected.metadata };
    warnings.push(...collected.warnings);
  }
  if (source.type === "production-log" && extractedText) {
    const redacted = redactHarnessSensitiveText(extractedText);
    extractedText = redacted.text;
    metadata = {
      ...metadata,
      redaction: {
        schema: "evopilot-harness-source-redaction/v1",
        applied: redacted.applied,
        rules: redacted.rules,
        originalTextDigest: digestText(source.contentText ?? extractedText),
        redactedTextDigest: digestText(redacted.text)
      }
    };
  }
  if (!extractedText && source.type === "web-url" && source.uri) {
    const fetched = await fetchHarnessKnowledgeText(source.uri);
    extractedText = fetched.text;
    metadata = { ...metadata, ...fetched.metadata };
    warnings.push(...fetched.warnings);
  }
  if (!extractedText && source.type === "github-repo" && source.uri) {
    const fetched = await fetchGithubHarnessKnowledgeText(source.uri, source.ref);
    extractedText = fetched.text;
    metadata = { ...metadata, ...fetched.metadata };
    warnings.push(...fetched.warnings);
  }
  if (!extractedText && source.type === "gitlab-repo" && source.uri) {
    warnings.push("gitlab-repo-live-fetch-not-configured; provide contentText or attachment text for deterministic extraction");
  }
  if (!extractedText && source.type === "attachment") {
    warnings.push("attachment-text-unavailable; first-stage extraction accepts text/markdown/yaml/json content and records binary digests without semantic claims");
  }
  if (!extractedText && source.type === "production-log") {
    warnings.push("production-log-text-unavailable; provide --source log=<file> or contentText so EvoPilot can redact and analyze runtime failure patterns");
  }
  if (!extractedText) {
    extractedText = [
      `Source ${source.name}`,
      source.uri ? `uri=${source.uri}` : undefined,
      source.fileName ? `file=${source.fileName}` : undefined,
      source.contentDigest ? `contentDigest=${source.contentDigest}` : undefined
    ].filter(Boolean).join("\n");
  }
  const normalized = normalizeHarnessKnowledgeText(extractedText);
  const contentDigest = source.contentDigest ?? digestText(extractedText);
  return hydrateHarnessKnowledgeSnapshot({
    snapshotId: `${source.sourceId}-snapshot`,
    sourceId: source.sourceId,
    type: source.type,
    name: source.name,
    uri: source.uri,
    ref: source.ref,
    contentDigest,
    textDigest: digestText(normalized),
    extractedText: normalized,
    extractedTextPreview: normalized.slice(0, 800),
    metadata,
    warnings
  });
}

async function fetchHarnessKnowledgeText(uri: string): Promise<{ text: string; metadata: Record<string, unknown>; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    const response = await fetchWithTimeout(uri, 8000);
    const contentType = response.headers.get("content-type") ?? "";
    const body = (await response.text()).slice(0, 250_000);
    const text = contentType.includes("html") || /^\s*</.test(body) ? stripHtml(body) : body;
    return {
      text,
      metadata: { httpStatus: response.status, contentType, fetchedAt: new Date().toISOString() },
      warnings: response.ok ? warnings : [`http-status=${response.status}`]
    };
  } catch (error) {
    return {
      text: "",
      metadata: { fetchError: error instanceof Error ? error.message : String(error) },
      warnings: [`fetch-failed:${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

async function fetchGithubHarnessKnowledgeText(uri: string, ref?: string): Promise<{ text: string; metadata: Record<string, unknown>; warnings: string[] }> {
  const parsed = parseGithubRepositoryUri(uri);
  if (!parsed) return { text: "", metadata: {}, warnings: ["github-repo-uri-not-recognized"] };
  const refs = uniqueStrings([ref, "main", "master"].filter((item): item is string => Boolean(item)));
  const readmeNames = ["README.md", "readme.md", "README.rst"];
  const warnings: string[] = [];
  for (const candidateRef of refs) {
    for (const readme of readmeNames) {
      const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${candidateRef}/${readme}`;
      const fetched = await fetchHarnessKnowledgeText(rawUrl);
      if (fetched.text.trim().length > 0 && !fetched.warnings.some((warning) => warning.startsWith("http-status=404"))) {
        return {
          text: fetched.text,
          metadata: { ...fetched.metadata, owner: parsed.owner, repo: parsed.repo, ref: candidateRef, readme },
          warnings: fetched.warnings
        };
      }
      warnings.push(...fetched.warnings.map((warning) => `${readme}@${candidateRef}:${warning}`));
    }
  }
  return { text: "", metadata: { owner: parsed.owner, repo: parsed.repo, attemptedRefs: refs }, warnings: uniqueStrings(warnings) };
}

function parseGithubRepositoryUri(uri: string): { owner: string; repo: string } | undefined {
  const trimmed = uri.trim().replace(/\.git$/, "");
  const shorthand = trimmed.match(/^([^/\s]+)\/([^/\s#]+)(?:#.+)?$/);
  if (shorthand && !trimmed.startsWith("http")) return { owner: shorthand[1], repo: shorthand[2] };
  try {
    const url = new URL(trimmed);
    if (!url.hostname.includes("github.com")) return undefined;
    const [owner, repo] = url.pathname.replace(/^\/+/, "").split("/");
    if (!owner || !repo) return undefined;
    return { owner, repo };
  } catch {
    return undefined;
  }
}

async function fetchWithTimeout(uri: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(uri, { signal: controller.signal, headers: { "user-agent": "EvoPilot HarnessTemplateEvolution/1.0" } });
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHarnessKnowledgeText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").split("\n").map((line) => line.trim()).filter(Boolean).join("\n").slice(0, 120_000);
}

function redactHarnessSensitiveText(value: string): { text: string; applied: boolean; rules: string[] } {
  const rules: Array<{ id: string; pattern: RegExp; replacement: string }> = [
    { id: "private-key-block", pattern: /-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/g, replacement: "[REDACTED_PRIVATE_KEY]" },
    { id: "bearer-token", pattern: /\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, replacement: "$1 [REDACTED]" },
    { id: "credential-assignment", pattern: /\b(api[-_ ]?key|token|access_token|refresh_token|password|passwd|secret|client_secret)\s*[:=]\s*["']?[^"'\s,;]+/gi, replacement: "$1=[REDACTED]" },
    { id: "url-credential", pattern: /:\/\/[^/\s:@]+:[^/\s:@]+@/g, replacement: "://[REDACTED]@" },
    { id: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[REDACTED_EMAIL]" },
    { id: "phone", pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b|\b(?:\+?86[-.\s]?)?1[3-9]\d{9}\b/g, replacement: "[REDACTED_PHONE]" }
  ];
  let text = value;
  const applied: string[] = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    if (!rule.pattern.test(text)) continue;
    rule.pattern.lastIndex = 0;
    text = text.replace(rule.pattern, rule.replacement);
    applied.push(rule.id);
  }
  return { text, applied: applied.length > 0, rules: applied };
}

function collectRegisteredProjectKnowledgeText(store: HarnessTemplateEvolutionRepository, source: HarnessKnowledgeSource): { text: string; metadata: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = [];
  const projectId = projectIdFromSource(source);
  if (!projectId) return { text: "", metadata: {}, warnings: ["source-project-id-missing"] };
  const project = safeStoreRead(() => store.readProject?.(projectId));
  if (!project) {
    return {
      text: "",
      metadata: { projectId, extractedBy: "server-project-reader" },
      warnings: [`source-project-not-found:${projectId}; provide a local source-project path or register the project first`]
    };
  }
  const profileSummaries = safeStoreRead(() => store.listProjectHarnessProfileSummaries?.(projectId)) ?? [];
  const activeProfile = safeStoreRead(() => store.readActiveProjectHarnessProfile?.(projectId, "default"));
  const goals = projectScopedRecords(safeStoreRead(() => store.listGoals?.()) ?? [], projectId).slice(-8);
  const loops = projectScopedRecords(safeStoreRead(() => store.listLoops?.()) ?? [], projectId).slice(-8);
  const evidenceBundles = projectScopedRecords(safeStoreRead(() => store.listReleaseEvidenceBundles?.()) ?? [], projectId).slice(-5);
  return {
    text: safeJsonText({
      sourceKind: "source-project",
      project,
      harnessProfiles: {
        summaries: profileSummaries,
        activeProfile
      },
      recentGoals: goals,
      recentLoops: loops,
      recentReleaseEvidence: evidenceBundles
    }),
    metadata: {
      projectId,
      extractedBy: "server-project-reader",
      goalCount: goals.length,
      loopCount: loops.length,
      releaseEvidenceCount: evidenceBundles.length,
      profileSummaryCount: Array.isArray(profileSummaries) ? profileSummaries.length : 0
    },
    warnings
  };
}

function collectSourceCorpusKnowledgeText(store: HarnessTemplateEvolutionRepository, source: HarnessKnowledgeSource): { text: string; metadata: Record<string, unknown>; warnings: string[] } {
  const projectIds = corpusProjectIdsFromSource(source);
  const warnings: string[] = [];
  const projects = projectIds.map((projectId) => {
    const collected = collectRegisteredProjectKnowledgeText(store, {
      ...source,
      type: "source-project",
      uri: projectId,
      metadata: { ...source.metadata, projectId }
    });
    warnings.push(...collected.warnings);
    return {
      projectId,
      text: collected.text ? collected.text.slice(0, 30_000) : "",
      metadata: collected.metadata
    };
  });
  const text = projects.some((project) => project.text)
    ? safeJsonText({ sourceKind: "source-corpus", corpusName: source.name, projects })
    : "";
  return {
    text,
    metadata: {
      extractedBy: "server-source-corpus-reader",
      projectIds,
      projectCount: projectIds.length,
      readableProjectCount: projects.filter((project) => project.text).length
    },
    warnings
  };
}

function collectEvopilotHistoryText(store: HarnessTemplateEvolutionRepository, source: HarnessKnowledgeSource): { text: string; metadata: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = [];
  const projectId = projectIdFromSource(source);
  const goalId = optionalTrimmedString(source.metadata.goalId ?? source.metadata.globalGoalId);
  const loopId = optionalTrimmedString(source.metadata.loopId);
  const evidenceBundleId = optionalTrimmedString(source.metadata.evidenceBundleId ?? source.metadata.bundleId);
  const project = projectId ? safeStoreRead(() => store.readProject?.(projectId)) : undefined;
  const activeProfile = projectId ? safeStoreRead(() => store.readActiveProjectHarnessProfile?.(projectId, "default")) : undefined;
  const goals = goalId
    ? [safeStoreRead(() => store.readGoal?.(goalId))].filter(Boolean)
    : projectId
      ? projectScopedRecords(safeStoreRead(() => store.listGoals?.()) ?? [], projectId).slice(-8)
      : [];
  const loops = loopId
    ? [safeStoreRead(() => store.readLoop?.(loopId))].filter(Boolean)
    : projectId
      ? projectScopedRecords(safeStoreRead(() => store.listLoops?.()) ?? [], projectId).slice(-8)
      : [];
  const releaseEvidence = evidenceBundleId
    ? [safeStoreRead(() => store.readReleaseEvidenceBundle?.(evidenceBundleId))].filter(Boolean)
    : projectId
      ? projectScopedRecords(safeStoreRead(() => store.listReleaseEvidenceBundles?.()) ?? [], projectId).slice(-5)
      : [];
  if (!project && !goals.length && !loops.length && !releaseEvidence.length && !activeProfile) {
    warnings.push(`evopilot-history-not-found:${source.uri ?? source.name}`);
    return {
      text: "",
      metadata: { projectId, goalId, loopId, evidenceBundleId, extractedBy: "server-evopilot-history-reader" },
      warnings
    };
  }
  return {
    text: safeJsonText({
      sourceKind: "evopilot-history",
      project,
      activeProjectHarnessProfile: activeProfile,
      goals,
      loops,
      releaseEvidence
    }),
    metadata: {
      projectId,
      goalId,
      loopId,
      evidenceBundleId,
      extractedBy: "server-evopilot-history-reader",
      goalCount: goals.length,
      loopCount: loops.length,
      releaseEvidenceCount: releaseEvidence.length
    },
    warnings
  };
}

function projectIdFromSource(source: HarnessKnowledgeSource): string | undefined {
  const explicit = optionalTrimmedString(source.metadata.projectId ?? source.metadata.id);
  if (explicit) return safeFileName(explicit);
  const uri = optionalTrimmedString(source.uri);
  if (!uri) return undefined;
  if (uri.includes(":")) return safeFileName(uri.split(":", 1)[0]);
  if (uri.includes("#")) return safeFileName(uri.split("#", 1)[0]);
  return safeFileName(uri);
}

function corpusProjectIdsFromSource(source: HarnessKnowledgeSource): string[] {
  const metadataIds = normalizeStringList(source.metadata.sourceProjects ?? source.metadata.projectIds ?? source.metadata.sourceProjectIds ?? source.metadata.sourceIds, []);
  const uriIds = optionalTrimmedString(source.uri)?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  return uniqueStrings([...metadataIds, ...uriIds].map(safeFileName).filter(Boolean));
}

function projectScopedRecords(records: unknown[], projectId: string): unknown[] {
  return records.filter((record) => {
    if (!isRecord(record)) return false;
    const project = isRecord(record.project) ? record.project : {};
    return String(record.projectId ?? project.id ?? "") === projectId;
  });
}

function safeStoreRead<T>(reader: () => T): T | undefined {
  try {
    return reader();
  } catch {
    return undefined;
  }
}

function safeJsonText(value: unknown, limit = 120_000): string {
  try {
    return JSON.stringify(value, null, 2).slice(0, limit);
  } catch {
    return String(value).slice(0, limit);
  }
}

export function analyzeHarnessKnowledgeSnapshots(snapshots: HarnessKnowledgeSnapshot[]): HarnessTemplateEvolutionAnalysis {
  const joined = snapshots.map((snapshot) => `${snapshot.name}\n${snapshot.extractedText}`).join("\n").toLowerCase();
  const has = (pattern: RegExp) => pattern.test(joined);
  const capabilitySignals = uniqueStrings([
    has(/ddd|domain|aggregate|bounded context/) ? "domain-boundary-practice" : undefined,
    has(/api|openapi|grpc|graphql|contract/) ? "interface-contract-practice" : undefined,
    has(/worker|queue|consumer|background/) ? "async-runtime-practice" : undefined
  ].filter((item): item is string => Boolean(item)));
  const runtimeSignals = uniqueStrings([
    has(/pytest|ruff|mypy|uv|poetry|pip/) ? "python-runtime-command-practice" : undefined,
    has(/maven|gradle|junit|spring/) ? "java-runtime-command-practice" : undefined,
    has(/npm|pnpm|yarn|vitest|jest/) ? "node-runtime-command-practice" : undefined,
    has(/go test|golang|go mod/) ? "go-runtime-command-practice" : undefined
  ].filter((item): item is string => Boolean(item)));
  const evidenceSignals = uniqueStrings([
    has(/test|coverage|ci|pipeline/) ? "test-and-ci-evidence" : undefined,
    has(/artifact|evidence|report/) ? "artifact-contract-evidence" : undefined,
    has(/release|changelog|version/) ? "release-evidence" : undefined
  ].filter((item): item is string => Boolean(item)));
  const failureSignals = uniqueStrings([
    has(/exception|error|stack trace|traceback/) ? "exception-tracking" : undefined,
    has(/retry|timeout|circuit breaker|fallback/) ? "dependency-failure-handling" : undefined,
    has(/incident|postmortem|root cause/) ? "incident-diagnostics" : undefined
  ].filter((item): item is string => Boolean(item)));
  const observabilitySignals = uniqueStrings([
    has(/opentelemetry|otel|trace|span/) ? "trace-correlation" : undefined,
    has(/metric|prometheus|micrometer|grafana/) ? "metrics-and-dashboard" : undefined,
    has(/log|logging|structured/) ? "structured-logging" : undefined,
    has(/slo|sli|alert|apm|sentry/) ? "slo-alert-apm" : undefined
  ].filter((item): item is string => Boolean(item)));
  const governanceSignals = uniqueStrings([
    has(/approval|review|change control/) ? "human-review-gate" : undefined,
    has(/security|secret|redact|permission/) ? "security-and-redaction-gate" : undefined,
    has(/rollback|release decision|go\/no-go|go no-go/) ? "release-governance-gate" : undefined
  ].filter((item): item is string => Boolean(item)));
  const domainSignals = uniqueStrings([
    has(/database|mysql|postgres|postgresql|sql|transaction|replication|wal|query planner|storage engine|mvcc/) ? "database-product-domain" : undefined,
    has(/gateway|api gateway|reverse proxy|ingress|routing|rate limit|upstream|load balanc/) ? "api-gateway-domain" : undefined,
    has(/cache|redis|memcached|shard|slot|eviction|hot key|ttl|consistent hash/) ? "distributed-cache-domain" : undefined,
    has(/scheduler|cron|dag|job|task queue|misfire|worker heartbeat|leader election/) ? "scheduler-domain" : undefined,
    has(/crm|customer|opportunity|lead|pipeline|account|sales|workflow/) ? "enterprise-management-software-domain" : undefined,
    has(/kafka|pulsar|rabbitmq|message queue|consumer group|offset|stream/) ? "messaging-stream-domain" : undefined,
    has(/observability|opentelemetry|prometheus|grafana|trace|metric|log pipeline/) ? "observability-platform-domain" : undefined
  ].filter((item): item is string => Boolean(item)));
  const gapClassifications = uniqueStrings([
    ...snapshots
      .map((snapshot) => gapClassificationForHarnessSource(snapshot, { failureSignals, governanceSignals, observabilitySignals, domainSignals }))
      .filter((item): item is HarnessGapClassification => Boolean(item)),
    ...snapshots.flatMap(additionalGapClassificationsForHarnessSource)
  ]) as HarnessGapClassification[];
  return {
    schema: "evopilot-harness-template-analysis/v1",
    capabilitySignals,
    runtimeSignals,
    evidenceSignals,
    failureSignals,
    observabilitySignals,
    governanceSignals,
    domainSignals,
    gapClassifications,
    sourceCoverage: snapshots.map((snapshot) => `${snapshot.sourceId}:${snapshot.contentDigest}`),
    generatedAt: new Date().toISOString()
  };
}

async function generateHarnessTemplateEvolutionDraft(
  store: HarnessTemplateEvolutionRepository,
  run: HarnessTemplateEvolutionRun,
  auth: HarnessTemplateEvolutionActor,
  body: Record<string, unknown>,
  ports: HarnessTemplateEvolutionPorts
): Promise<HarnessTemplateDraft> {
  const baseTemplate = store.readHarnessTemplate(run.baseTemplateRef.templateId, run.baseTemplateRef.version);
  if (!baseTemplate) throw harnessTemplateDomainError(404, "HARNESS_TEMPLATE_NOT_FOUND", `Base HarnessTemplate ${run.baseTemplateRef.templateId}@${run.baseTemplateRef.version} was not found.`);
  const llmResolution = ports.resolveLlm?.({ run, body });
  if (llmResolution?.client) {
    return generateHarnessTemplateEvolutionDraftWithLlm(llmResolution.client, baseTemplate, run, auth, llmResolution.selection);
  }
  if (llmResolution?.requireLlm || body.requireLlm === true) {
    throw harnessTemplateDomainError(409, "HARNESS_TEMPLATE_EVOLUTION_LLM_REQUIRED", "HarnessTemplate evolution requires a READY LLM profile or production LLM provider.");
  }
  return deterministicHarnessTemplateEvolutionDraft(baseTemplate, run, auth, {
    mode: "deterministic-template",
    actor: auth.actor,
    evidence: ["llmGenerator=false", "reason=LLM provider is not configured or was not requested"]
  });
}

async function generateHarnessTemplateEvolutionDraftWithLlm(
  client: HarnessTemplateEvolutionLlmClient,
  baseTemplate: HarnessTemplateProfile,
  run: HarnessTemplateEvolutionRun,
  auth: HarnessTemplateEvolutionActor,
  selection: HarnessTemplateEvolutionLlmSelection
): Promise<HarnessTemplateDraft> {
  const startedAt = new Date().toISOString();
  const response = await client.generate({
    caller: "evopilot-harness-template-evolution",
    intent: "structured.extraction",
    outputContract: "json_object",
    jsonObject: true,
    latencyClass: "batch",
    complexity: "high",
    outputSize: "large",
    metadata: {
      productFlow: "harness-template-evolution",
      evolutionId: run.evolutionId,
      tenantId: run.tenantId,
      workspaceId: run.workspaceId,
      baseTemplateId: baseTemplate.id,
      baseTemplateVersion: baseTemplate.version,
      targetVersion: run.targetVersion,
      actor: auth.actor,
      llmProfileId: selection.profileId ?? "global-default"
    },
    prompt: harnessTemplateEvolutionPrompt(baseTemplate, run)
  });
  if (!response.success || !response.text.trim()) {
    throw harnessTemplateDomainError(409, "HARNESS_TEMPLATE_EVOLUTION_LLM_FAILED", response.errorMessage ?? response.errorCode ?? "LLM harness template evolution failed.");
  }
  try {
    const parsed = JSON.parse(extractJsonObject(response.text));
    const templateInput = isRecord(parsed) && isRecord(parsed.template) ? parsed.template : parsed;
    const template = hydrateHarnessTemplate({
      ...baseTemplate,
      ...templateInput,
      id: run.targetTemplateId,
      version: run.targetVersion,
      scope: baseTemplate.scope,
      languageFamily: isRecord(templateInput) ? templateInput.languageFamily ?? baseTemplate.languageFamily : baseTemplate.languageFamily,
      governanceRules: mergeHarnessRecord(baseTemplate.governanceRules, isRecord(templateInput) ? templateInput.governanceRules : undefined),
      llmDraftPolicy: mergeHarnessRecord(baseTemplate.llmDraftPolicy, isRecord(templateInput) ? templateInput.llmDraftPolicy : undefined),
      sourceReferences: mergeHarnessSourceReferences(baseTemplate.sourceReferences, sourceReferencesFromSnapshots(run.snapshots)),
      changelog: templateChangelogForEvolution(baseTemplate, run, auth.actor),
      updatedAt: new Date().toISOString()
    });
    return renderHarnessTemplateEvolutionDraft(baseTemplate, run, template, {
      mode: "llm",
      actor: auth.actor,
      llmProfileId: selection.profileId,
      provider: response.provider ?? selection.provider,
      model: response.model ?? selection.model,
      requestId: response.requestId,
      evidence: [
        `requestId=${response.requestId}`,
        `provider=${response.provider ?? selection.provider ?? "unknown"}`,
        `model=${response.model ?? selection.model ?? "unknown"}`,
        `startedAt=${startedAt}`,
        `durationMs=${response.durationMs}`
      ]
    });
  } catch (error) {
    throw harnessTemplateDomainError(422, "HARNESS_TEMPLATE_EVOLUTION_LLM_OUTPUT_INVALID", error instanceof Error ? error.message : String(error));
  }
}

function deterministicHarnessTemplateEvolutionDraft(baseTemplate: HarnessTemplateProfile, run: HarnessTemplateEvolutionRun, auth: HarnessTemplateEvolutionActor, generatedBy: HarnessTemplateDraft["generatedBy"]): HarnessTemplateDraft {
  const analysis = run.analysisSummary ?? analyzeHarnessKnowledgeSnapshots(run.snapshots);
  const template = hydrateHarnessTemplate({
    ...baseTemplate,
    id: run.targetTemplateId,
    version: run.targetVersion,
    description: `${baseTemplate.description} Evolved through HarnessTemplateEvolution ${run.evolutionId}.`,
    runtimePatterns: mergeHarnessRecord(baseTemplate.runtimePatterns, {
      templateEvolution: {
        evolutionId: run.evolutionId,
        intent: run.intent,
        runtimeSignals: analysis.runtimeSignals,
        capabilitySignals: analysis.capabilitySignals,
        domainSignals: analysis.domainSignals
      }
    }),
    evidenceContract: mergeHarnessRecord(baseTemplate.evidenceContract, {
      templateEvolution: {
        sourceCoverage: analysis.sourceCoverage,
        sourceTypes: uniqueStrings(run.snapshots.map((snapshot) => snapshot.type)),
        gapClassifications: analysis.gapClassifications,
        requiredReviewEvidence: ["source-snapshot-digest", "draft-validation", "admin-approval", "impact-report"],
        projectDryRunEvidence: [
          "ProjectHarnessProfile DRAFT generated from the published template.",
          "goal loop target binds the published template digest before execution.",
          "target evidence package shows source, runtime, validation, observability, and release gates."
        ]
      }
    }),
    failureTaxonomy: mergeHarnessRecord(baseTemplate.failureTaxonomy, {
      templateEvolutionSignals: analysis.failureSignals
    }),
    diagnosticsBaseline: mergeHarnessRecord(baseTemplate.diagnosticsBaseline, {
      templateEvolutionSignals: analysis.evidenceSignals,
      aiTroubleshooting: {
        requiredMetadata: ["evolutionId", "sourceId", "snapshotDigest", "templateDigest", "requestId", "nextAction"]
      }
    }),
    observabilityBaseline: mergeHarnessRecord(baseTemplate.observabilityBaseline, {
      templateEvolutionSignals: analysis.observabilitySignals
    }),
    governanceRules: mergeHarnessRecord(baseTemplate.governanceRules, {
      templateEvolutionRequiresApproval: true,
      templateEvolutionRequiresImpactReport: true,
      templateEvolutionRequiresSourceCoverageReview: true
    }),
    sourceReferences: mergeHarnessSourceReferences(baseTemplate.sourceReferences, sourceReferencesFromSnapshots(run.snapshots)),
    changelog: templateChangelogForEvolution(baseTemplate, run, auth.actor),
    updatedAt: new Date().toISOString()
  });
  return renderHarnessTemplateEvolutionDraft(baseTemplate, run, template, generatedBy);
}

function renderHarnessTemplateEvolutionDraft(baseTemplate: HarnessTemplateProfile, run: HarnessTemplateEvolutionRun, template: HarnessTemplateProfile, generatedBy: HarnessTemplateDraft["generatedBy"]): HarnessTemplateDraft {
  const validation = validateHarnessTemplateProfile(template);
  const sourceCoverage = {
    sourceCount: run.sources.length,
    snapshotCount: run.snapshots.length,
    sources: run.snapshots.map((snapshot) => ({
      sourceId: snapshot.sourceId,
      type: snapshot.type,
      name: snapshot.name,
      digest: snapshot.contentDigest,
      knowledgeCategory: knowledgeCategoryForHarnessSource(snapshot),
      gapClassification: gapClassificationForHarnessSource(snapshot, run.analysisSummary),
      redactionApplied: redactionAppliedForHarnessSource(snapshot),
      usedFor: usedForHarnessSource(snapshot, run.analysisSummary),
      projectActions: projectActionsForHarnessSource(snapshot, run.analysisSummary)
    }))
  };
  return {
    schema: "evopilot-harness-template-draft/v1",
    draftId: `draft-${template.id}-${template.version}`,
    version: template.version,
    template,
    pack: {
      readme: renderHarnessTemplateDraftReadme(baseTemplate, run, template, sourceCoverage),
      templateYaml: stringifyYaml(harnessTemplateSourceObject(template)),
      changelog: renderHarnessTemplateDraftChangelog(baseTemplate, run, template),
      examples: {
        "default-project-profile.yaml": renderHarnessTemplateDefaultProjectProfileExample(template)
      }
    },
    validation,
    diffFromBase: diffHarnessTemplateDraft(baseTemplate, template),
    sourceCoverage,
    generatedBy,
    createdAt: new Date().toISOString()
  };
}

function mergeHarnessRecord(base: Record<string, unknown>, patch: unknown): Record<string, unknown> {
  const next = { ...base };
  const record = isRecord(patch) ? patch : {};
  for (const [key, value] of Object.entries(record)) {
    if (isRecord(value) && isRecord(next[key])) next[key] = mergeHarnessRecord(next[key] as Record<string, unknown>, value);
    else next[key] = value;
  }
  return next;
}

function mergeHarnessSourceReferences(base: HarnessTemplateSourceReference[], additions: HarnessTemplateSourceReference[]): HarnessTemplateSourceReference[] {
  const merged = new Map<string, HarnessTemplateSourceReference>();
  for (const reference of [...base, ...additions]) {
    const key = `${reference.name}|${reference.url ?? ""}|${reference.category}`;
    merged.set(key, reference);
  }
  return [...merged.values()];
}

function sourceReferencesFromSnapshots(snapshots: HarnessKnowledgeSnapshot[]): HarnessTemplateSourceReference[] {
  return snapshots.map((snapshot) => ({
    name: snapshot.name,
    ...(snapshot.uri ? { url: snapshot.uri } : {}),
    category: snapshot.type === "github-repo" ? "github" : snapshot.type === "web-url" ? "official-doc" : "engineering-practice",
    rationale: `HarnessTemplateEvolution source ${snapshot.sourceId} captured as ${snapshot.contentDigest}; used for reviewable template draft evidence.`
  }));
}

function templateChangelogForEvolution(baseTemplate: HarnessTemplateProfile, run: HarnessTemplateEvolutionRun, actor: string): HarnessTemplateChangelogEntry[] {
  const summary = `Evolve ${baseTemplate.id}@${baseTemplate.version} from ${run.sources.length} reviewed harness knowledge source(s).`;
  return [
    ...baseTemplate.changelog,
    {
      version: run.targetVersion,
      changedAt: new Date().toISOString(),
      changedBy: actor,
      summary,
      changes: [
        summary,
        `Intent: ${run.intent}`,
        `Evolution run: ${run.evolutionId}`,
        ...run.snapshots.map((snapshot) => `Source ${snapshot.sourceId}: ${snapshot.contentDigest}`)
      ]
    }
  ];
}

function knowledgeCategoryForHarnessSource(snapshot: HarnessKnowledgeSnapshot): HarnessKnowledgeCategory {
  if (snapshot.type === "source-project") return "source-project";
  if (snapshot.type === "source-corpus") return "project-corpus";
  if (snapshot.type === "production-log") return "runtime-log";
  if (snapshot.type === "evopilot-history" || snapshot.type === "runtime-evidence") return "evopilot-history";
  if (snapshot.type === "local-pack" || snapshot.type === "existing-template") return "template-pack";
  if (snapshot.type === "attachment") return "attachment";
  if (snapshot.type === "admin-note") return "admin-note";
  return "external-reference";
}

function gapClassificationForHarnessSource(snapshot: HarnessKnowledgeSnapshot, analysis?: Partial<HarnessTemplateEvolutionAnalysis>): HarnessGapClassification {
  const text = `${snapshot.name}\n${snapshot.extractedText}\n${snapshot.warnings.join("\n")}`.toLowerCase();
  if (/extractor|semantic extraction|text-unavailable|not-configured/.test(text)) return "evopilot-core";
  if (/secret|token|password|permission|rbac|redact|credential/.test(text)) return "tenant-policy";
  if (snapshot.type === "production-log" && /exception|error|timeout|retry|slow|incident|failover|oom|deadlock/.test(text)) return "project-profile";
  if (snapshot.type === "runtime-evidence" || snapshot.type === "evopilot-history") return "project-profile";
  if (snapshot.type === "web-url" || snapshot.type === "github-repo" || snapshot.type === "gitlab-repo") return "source-quality";
  if ((analysis?.domainSignals ?? []).length > 0) return "harness-template";
  return "harness-template";
}

function additionalGapClassificationsForHarnessSource(snapshot: HarnessKnowledgeSnapshot): HarnessGapClassification[] {
  const text = `${snapshot.name}\n${snapshot.extractedText}\n${snapshot.warnings.join("\n")}`.toLowerCase();
  const classifications: HarnessGapClassification[] = [];
  if (snapshot.type === "production-log" && /exception|error|timeout|retry|slow|incident|failover|oom|deadlock/.test(text)) classifications.push("project-profile");
  if (/secret|token|password|permission|rbac|redact|credential/.test(text)) classifications.push("tenant-policy");
  return classifications;
}

function redactionAppliedForHarnessSource(snapshot: HarnessKnowledgeSnapshot): boolean | undefined {
  const redaction = isRecord(snapshot.metadata.redaction) ? snapshot.metadata.redaction : undefined;
  return typeof redaction?.applied === "boolean" ? redaction.applied : undefined;
}

function usedForHarnessSource(snapshot: HarnessKnowledgeSnapshot, analysis?: HarnessTemplateEvolutionAnalysis): string[] {
  const used = ["source-reference", "changelog-evidence", "review-trace"];
  if (analysis?.observabilitySignals.length) used.push("observability");
  if (analysis?.failureSignals.length) used.push("failure-diagnostics");
  if (analysis?.runtimeSignals.length) used.push("runtime-patterns");
  if (analysis?.domainSignals.length) used.push("domain-patterns");
  if (analysis?.gapClassifications.length) used.push("gap-classification");
  if (redactionAppliedForHarnessSource(snapshot)) used.push("redacted-runtime-evidence");
  if (snapshot.warnings.length > 0) used.push("warning-review");
  return uniqueStrings(used);
}

function projectActionsForHarnessSource(snapshot: HarnessKnowledgeSnapshot, analysis?: HarnessTemplateEvolutionAnalysis): string[] {
  const classification = gapClassificationForHarnessSource(snapshot, analysis);
  const actions: string[] = [];
  if (classification === "harness-template") actions.push("Use the published HarnessTemplate version for future ProjectHarnessProfile drafts in matching domains.");
  if (classification === "project-profile") actions.push("Generate or upgrade the project ProjectHarnessProfile, review the DRAFT, then explicitly activate before goal loop execution.");
  if (classification === "tenant-policy") actions.push("Review TenantHarnessPolicy redaction, permission, logging, and approval rules before activating affected project profiles.");
  if (classification === "evopilot-core") actions.push("Route extractor/schema/API gaps through EvoPilot core evolution before claiming full source semantic coverage.");
  if (classification === "source-quality") actions.push("Add higher-fidelity project docs, logs, attachments, or history evidence before approving a broad template change.");
  if (snapshot.type === "production-log") actions.push("Keep production logs redacted and bind requestId/traceId/errorCode fields into diagnostics evidence.");
  if ((analysis?.domainSignals ?? []).length > 0) actions.push(`Confirm domain match: ${(analysis?.domainSignals ?? []).join(", ")}.`);
  return uniqueStrings(actions);
}

function harnessTemplateSourceObject(template: HarnessTemplateProfile): Record<string, unknown> {
  const { digest: _digest, ...source } = template;
  return source;
}

function diffHarnessTemplateDraft(baseTemplate: HarnessTemplateProfile, template: HarnessTemplateProfile): HarnessTemplateDraft["diffFromBase"] {
  const sections: Array<keyof HarnessTemplateProfile> = ["name", "description", "capabilities", "runtimePatterns", "validationBaseline", "evidenceContract", "failureTaxonomy", "diagnosticsBaseline", "observabilityBaseline", "governanceRules", "phaseMapping", "llmDraftPolicy", "sourceReferences", "changelog"];
  const changedSections = sections.filter((section) => canonicalJson(baseTemplate[section]) !== canonicalJson(template[section])).map(String);
  return {
    baseTemplateRef: harnessTemplateRef(baseTemplate),
    changedSections,
    summary: changedSections.map((section) => `${section} changed`)
  };
}

function renderHarnessTemplateDraftReadme(baseTemplate: HarnessTemplateProfile, run: HarnessTemplateEvolutionRun, template: HarnessTemplateProfile, sourceCoverage: HarnessTemplateDraft["sourceCoverage"]): string {
  return [
    `# ${template.name}`,
    "",
    `Generated by EvoPilot HarnessTemplateEvolution \`${run.evolutionId}\`.`,
    "",
    "## Intent",
    "",
    run.intent,
    "",
    "## Base Template",
    "",
    `- ${baseTemplate.id}@${baseTemplate.version}`,
    `- digest: ${baseTemplate.digest}`,
    "",
    "## Source Coverage",
    "",
    ...sourceCoverage.sources.map((source) => `- ${source.sourceId}: ${source.name} (${source.type}, ${source.digest})${source.gapClassification ? `; gap=${source.gapClassification}` : ""}${source.knowledgeCategory ? `; category=${source.knowledgeCategory}` : ""}`),
    "",
    "## Project Action Contract",
    "",
    ...sourceCoverage.sources.flatMap((source) => (source.projectActions ?? []).map((action) => `- ${source.sourceId}: ${action}`)),
    "",
    "## Review Contract",
    "",
    "This draft is not active until an administrator validates, approves, and publishes it through the EvoPilot control plane.",
    ""
  ].join("\n");
}

function renderHarnessTemplateDraftChangelog(baseTemplate: HarnessTemplateProfile, run: HarnessTemplateEvolutionRun, template: HarnessTemplateProfile): string {
  const current = template.changelog.filter((entry) => entry.version === template.version);
  return [
    `# Changelog`,
    "",
    `## ${template.version}`,
    "",
    ...current.flatMap((entry) => [
      `- ${entry.summary}`,
      ...entry.changes.map((change) => `  - ${change}`)
    ]),
    "",
    `Previous base: ${baseTemplate.id}@${baseTemplate.version}`,
    `Evolution run: ${run.evolutionId}`,
    ""
  ].join("\n");
}

function renderHarnessTemplateDefaultProjectProfileExample(template: HarnessTemplateProfile): string {
  return stringifyYaml({
    schema: "evopilot-project-harness-profile/v1",
    profileId: "default",
    name: `${template.name} Project Harness Profile`,
    description: "Project-level harness profile generated from the evolved public HarnessTemplate.",
    template: harnessTemplateRef(template),
    capabilities: template.capabilities.map((capability) => ({
      id: capability.id,
      name: capability.name,
      boundary: capability.boundary,
      requiredEvidence: capability.requiredEvidence
    })),
    runtime: {
      commandGroups: recordObject(template.runtimePatterns.defaultCommands)
    },
    validation: template.validationBaseline,
    evidence: template.evidenceContract,
    failureHandling: template.failureTaxonomy,
    diagnostics: template.diagnosticsBaseline,
    observability: template.observabilityBaseline,
    governance: template.governanceRules,
    phaseMapping: template.phaseMapping,
    llmDraftPolicy: template.llmDraftPolicy
  });
}

function harnessTemplateEvolutionPrompt(baseTemplate: HarnessTemplateProfile, run: HarnessTemplateEvolutionRun): string {
  return [
    "You are EvoPilot's HarnessTemplate evolution generator.",
    "Return one JSON object with a `template` field. Preserve all mandatory governance gates and do not remove required capabilities.",
    "Use the provided sources only as reviewable signals; do not invent evidence.",
    "",
    "Base HarnessTemplate:",
    JSON.stringify(harnessTemplateSourceObject(baseTemplate), null, 2),
    "",
    "Evolution request:",
    JSON.stringify({
      evolutionId: run.evolutionId,
      targetTemplateId: run.targetTemplateId,
      targetVersion: run.targetVersion,
      intent: run.intent,
      analysisSummary: run.analysisSummary,
      snapshots: run.snapshots.map((snapshot) => ({
        sourceId: snapshot.sourceId,
        type: snapshot.type,
        name: snapshot.name,
        uri: snapshot.uri,
        contentDigest: snapshot.contentDigest,
        knowledgeCategory: knowledgeCategoryForHarnessSource(snapshot),
        gapClassification: gapClassificationForHarnessSource(snapshot, run.analysisSummary),
        redactionApplied: redactionAppliedForHarnessSource(snapshot),
        extractedTextPreview: snapshot.extractedText.slice(0, 4000),
        warnings: snapshot.warnings
      }))
    }, null, 2)
  ].join("\n");
}

export function approveHarnessTemplateEvolutionRun(run: HarnessTemplateEvolutionRun, body: Record<string, unknown>, auth: HarnessTemplateEvolutionActor): HarnessTemplateEvolutionRun {
  if (run.status !== "REVIEW_REQUIRED") throw harnessTemplateDomainError(409, "HARNESS_TEMPLATE_EVOLUTION_NOT_REVIEW_READY", "Only REVIEW_REQUIRED HarnessTemplate evolution runs can be approved.");
  if (!run.draft || run.draft.validation.status !== "VALIDATED") throw harnessTemplateDomainError(409, "HARNESS_TEMPLATE_EVOLUTION_DRAFT_NOT_VALIDATED", "HarnessTemplate evolution draft must validate before approval.");
  const confirmedBy = optionalTrimmedString(body.confirmedBy ?? body.approvedBy) ?? auth.actor;
  const confirmation = optionalTrimmedString(body.confirmation ?? body.approval);
  if (!confirmedBy || !confirmation) throw harnessTemplateDomainError(400, "HARNESS_TEMPLATE_EVOLUTION_CONFIRMATION_REQUIRED", "Approval requires confirmedBy and confirmation.");
  const now = new Date().toISOString();
  return hydrateHarnessTemplateEvolutionRun({
    ...run,
    status: "APPROVED",
    review: {
      status: "APPROVED",
      confirmedBy,
      confirmation,
      confirmedAt: optionalTrimmedString(body.confirmedAt) ?? now
    },
    updatedAt: now
  });
}

export function publishHarnessTemplateEvolutionRun(store: HarnessTemplateEvolutionRepository, run: HarnessTemplateEvolutionRun, body: Record<string, unknown>, auth: HarnessTemplateEvolutionActor): HarnessTemplateEvolutionRun {
  if (run.status !== "APPROVED") throw harnessTemplateDomainError(409, "HARNESS_TEMPLATE_EVOLUTION_NOT_APPROVED", "HarnessTemplate evolution must be approved before publishing.");
  if (!run.draft) throw harnessTemplateDomainError(409, "HARNESS_TEMPLATE_EVOLUTION_DRAFT_NOT_FOUND", "HarnessTemplate evolution has no draft to publish.");
  const force = body.force === true;
  const previous = store.readHarnessTemplate(run.draft.template.id, run.draft.template.version);
  if (previous && !force) throw harnessTemplateDomainError(409, "HARNESS_TEMPLATE_VERSION_EXISTS", `HarnessTemplate ${run.draft.template.id}@${run.draft.template.version} already exists. Publish a new version or retry with force=true.`);
  const validation = validateHarnessTemplateProfile(run.draft.template);
  if (validation.status !== "VALIDATED") throw harnessTemplateDomainError(409, "HARNESS_TEMPLATE_EVOLUTION_DRAFT_VALIDATION_FAILED", `HarnessTemplate draft validation failed: ${validation.blockers.join("; ")}`);
  const saved = store.writeHarnessTemplate(run.draft.template);
  const impactReport = impactReportForHarnessTemplate(store, harnessTemplateRef(saved), run.tenantId, run.workspaceId);
  const now = new Date().toISOString();
  return hydrateHarnessTemplateEvolutionRun({
    ...run,
    status: "PUBLISHED",
    publishedTemplateRef: harnessTemplateRef(saved),
    impactReport,
    updatedAt: now
  });
}

export function impactReportForHarnessTemplate(store: HarnessTemplateEvolutionRepository, templateRef: HarnessTemplateRef, tenantId: string, workspaceId: string): HarnessTemplateImpactReport {
  const affectedProjectProfiles = store.listProjectHarnessTemplateBindings(tenantId, workspaceId)
    .filter((binding) => (binding.activeTemplateRef ?? binding.templateRef)?.templateId === templateRef.templateId)
    .map((binding) => {
      const activeTemplateVersion = binding.activeTemplateRef?.version;
      const activeTemplateDigest = binding.activeTemplateRef?.digest;
      const stale = Boolean(binding.activeTemplateRef) && (activeTemplateVersion !== templateRef.version || activeTemplateDigest !== templateRef.digest);
      const impact = binding.activeTemplateRef ? stale ? "STALE_TEMPLATE_VERSION" as const : "MATCHES_TEMPLATE_ID" as const : "NO_ACTIVE_PROFILE" as const;
      return {
        tenantId: binding.tenantId,
        workspaceId: binding.workspaceId,
        projectId: binding.projectId,
        profileId: binding.profileId,
        activeVersion: binding.activeVersion,
        activeTemplateVersion,
        activeTemplateDigest,
        impact,
        nextAction: impact === "STALE_TEMPLATE_VERSION"
          ? "generate-or-upgrade-project-harness-profile"
          : impact === "NO_ACTIVE_PROFILE"
            ? "activate-reviewed-project-harness-profile-or-ignore-draft"
            : "no-project-profile-action-required"
      };
    });
  return {
    schema: "evopilot-harness-template-impact-report/v1",
    templateRef,
    affectedProjectProfiles,
    staleProfileCount: affectedProjectProfiles.filter((profile) => profile.impact === "STALE_TEMPLATE_VERSION").length,
    generatedAt: new Date().toISOString()
  };
}

export function harnessTemplateEvolutionNextAction(run: HarnessTemplateEvolutionRun): string {
  if (run.status === "CREATED") return "advance-template-evolution";
  if (run.status === "SOURCES_COLLECTED") return "analyze-template-evolution";
  if (run.status === "ANALYZED") return "draft-template-evolution";
  if (run.status === "REVIEW_REQUIRED") return "review-approve-template-evolution";
  if (run.status === "APPROVED") return "publish-template-evolution";
  if (run.status === "PUBLISHED") return "review-impact-report";
  if (run.status === "IMPACT_ANALYZED") return "generate-project-harness-profile-upgrade-drafts";
  if (run.status === "BLOCKED") return "repair-template-evolution-source-or-draft";
  return "inspect-template-evolution";
}

export function harnessTemplateEvolutionLogMetadata(run: HarnessTemplateEvolutionRun, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    evolutionId: run.evolutionId,
    evolutionStatus: run.status,
    tenantId: run.tenantId,
    workspaceId: run.workspaceId,
    baseTemplateId: run.baseTemplateRef.templateId,
    baseTemplateVersion: run.baseTemplateRef.version,
    baseTemplateDigest: run.baseTemplateRef.digest,
    targetTemplateId: run.targetTemplateId,
    targetVersion: run.targetVersion,
    sourceCount: run.sources.length,
    snapshotCount: run.snapshots.length,
    sourceIds: run.sources.map((source) => source.sourceId),
    sourceTypes: uniqueStrings(run.sources.map((source) => source.type)),
    autoMatchDecision: run.autoMatch?.decision,
    autoMatchConfidence: run.autoMatch?.confidence,
    autoMatchTargetDomain: run.autoMatch?.targetDomain,
    snapshotDigests: run.snapshots.map((snapshot) => snapshot.contentDigest),
    domainSignals: run.analysisSummary?.domainSignals ?? [],
    gapClassifications: run.analysisSummary?.gapClassifications ?? [],
    draftVersion: run.draft?.version,
    draftDigest: run.draft?.template.digest,
    validationStatus: run.draft?.validation.status,
    validationBlockers: run.draft?.validation.blockers ?? [],
    publishedTemplateDigest: run.publishedTemplateRef?.digest,
    staleProfileCount: run.impactReport?.staleProfileCount,
    blockers: run.blockers,
    warnings: run.warnings,
    nextAction: harnessTemplateEvolutionNextAction(run),
    ...extra
  };
}
