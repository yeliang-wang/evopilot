export type HarnessTemplateMaturityPhase = "alpha" | "beta" | "rc" | "ga";

export interface HarnessTemplateRef {
  templateId: string;
  version: string;
  digest: string;
  catalogRef?: HarnessCatalogRef;
}

export interface HarnessCatalogRef {
  catalogId: string;
  catalogSource: string;
  catalogDigest: string;
  entryPath: string;
  entryDigest: string;
}

export interface HarnessCapabilityDefinition {
  id: string;
  name: string;
  boundary: string;
  requiredEvidence: string[];
}

export interface HarnessTemplateChangelogEntry {
  version: string;
  changedAt: string;
  changedBy?: string;
  summary: string;
  changes: string[];
}

export interface HarnessTemplateSourceReference {
  name: string;
  url?: string;
  category: "github" | "official-doc" | "engineering-practice";
  rationale: string;
}

export type HarnessTemplateLayer = "runtime" | "domain" | "composite";

export interface HarnessTemplateProfile {
  schema: "evopilot-harness-template/v1";
  id: string;
  version: string;
  digest: string;
  catalogRef?: HarnessCatalogRef;
  name: string;
  description: string;
  scope: "platform" | "tenant";
  languageFamily: "python" | "node" | "java" | "go" | "generic";
  harnessLayer?: HarnessTemplateLayer;
  domain?: string;
  baseRuntimeTemplates?: string[];
  compatibleRuntimeProfiles?: string[];
  matchSignals?: {
    include?: string[];
    exclude?: string[];
  };
  capabilities: HarnessCapabilityDefinition[];
  runtimePatterns: Record<string, unknown>;
  validationBaseline: Record<string, unknown>;
  evidenceContract: Record<string, unknown>;
  failureTaxonomy: Record<string, unknown>;
  diagnosticsBaseline: Record<string, unknown>;
  observabilityBaseline: Record<string, unknown>;
  governanceRules: Record<string, unknown>;
  phaseMapping: Record<HarnessTemplateMaturityPhase, string[]>;
  llmDraftPolicy: Record<string, unknown>;
  sourceReferences: HarnessTemplateSourceReference[];
  changelog: HarnessTemplateChangelogEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface HarnessCatalogMount {
  schema: "evopilot-harness-catalog-mount/v1";
  catalogId: string;
  name: string;
  source: string;
  status: "ACTIVE" | "DISABLED";
  mountedBy?: string;
  mountedAt: string;
  updatedAt: string;
  lastReadAt?: string;
  lastReadStatus?: "READY" | "FAILED";
  lastReadError?: string;
  lastReadWarnings?: string[];
  catalogDigest?: string;
  templateCount?: number;
}

export interface PublishedHarnessCatalogEntry {
  name: string;
  version: string;
  layer?: HarnessTemplateLayer;
  domain?: string;
  status: "published" | "deprecated" | "draft" | "disabled";
  path: string;
  digest?: string;
  tags: string[];
  matchSummary?: string;
}

export interface PublishedHarnessCatalog {
  schema: "evopilot-published-harness-catalog/v1";
  catalogVersion: number;
  catalogId: string;
  source: string;
  catalogDigest: string;
  generatedAt?: string;
  compatibleEvopilot?: string;
  entries: PublishedHarnessCatalogEntry[];
  warnings: string[];
}

export interface PublishedHarnessTemplate {
  schema: "evopilot-published-harness-template/v1";
  catalog: PublishedHarnessCatalog;
  entry: PublishedHarnessCatalogEntry;
  template: HarnessTemplateProfile;
  templatePath: string;
  warnings: string[];
}

export interface HarnessCatalogScanResult {
  schema: "evopilot-harness-catalog-scan-result/v1";
  mount: HarnessCatalogMount;
  catalog?: PublishedHarnessCatalog;
  templates: HarnessTemplateProfile[];
  entries: PublishedHarnessCatalogEntry[];
  status: "READY" | "FAILED";
  warnings: string[];
  error?: string;
  scannedAt: string;
}

export interface HarnessTemplateValidationResult {
  schema: "evopilot-harness-template-validation/v1";
  status: "VALIDATED" | "FAILED";
  checks: Array<{ id: string; status: "PASS" | "FAIL" | "WARN"; required: boolean; evidence: string[] }>;
  blockers: string[];
  warnings: string[];
  evaluatedAt: string;
}

export type HarnessKnowledgeSourceType =
  | "web-url"
  | "github-repo"
  | "gitlab-repo"
  | "attachment"
  | "local-pack"
  | "admin-note"
  | "existing-template"
  | "runtime-evidence"
  | "source-project"
  | "source-corpus"
  | "production-log"
  | "evopilot-history";

export type HarnessKnowledgeCategory =
  | "external-reference"
  | "source-project"
  | "project-corpus"
  | "attachment"
  | "runtime-log"
  | "evopilot-history"
  | "template-pack"
  | "admin-note";

export type HarnessGapClassification =
  | "harness-template"
  | "project-profile"
  | "tenant-policy"
  | "evopilot-core"
  | "source-quality";

export type HarnessTemplateEvolutionStatus =
  | "CREATED"
  | "SOURCES_COLLECTED"
  | "ANALYZED"
  | "REVIEW_REQUIRED"
  | "APPROVED"
  | "PUBLISHED"
  | "IMPACT_ANALYZED"
  | "CLOSED"
  | "BLOCKED"
  | "REJECTED"
  | "SUPERSEDED";

export interface HarnessKnowledgeSource {
  schema: "evopilot-harness-knowledge-source/v1";
  sourceId: string;
  type: HarnessKnowledgeSourceType;
  name: string;
  uri?: string;
  ref?: string;
  fileName?: string;
  mediaType?: string;
  contentText?: string;
  contentDigest?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface HarnessKnowledgeSnapshot {
  schema: "evopilot-harness-knowledge-snapshot/v1";
  snapshotId: string;
  sourceId: string;
  type: HarnessKnowledgeSourceType;
  name: string;
  uri?: string;
  ref?: string;
  contentDigest: string;
  textDigest: string;
  extractedText: string;
  extractedTextPreview: string;
  metadata: Record<string, unknown>;
  warnings: string[];
  createdAt: string;
}

export interface HarnessTemplateDraft {
  schema: "evopilot-harness-template-draft/v1";
  draftId: string;
  version: string;
  template: HarnessTemplateProfile;
  pack: {
    readme: string;
    templateYaml: string;
    changelog: string;
    examples: Record<string, string>;
  };
  validation: HarnessTemplateValidationResult;
  diffFromBase: {
    baseTemplateRef: HarnessTemplateRef;
    changedSections: string[];
    summary: string[];
  };
  sourceCoverage: {
    sourceCount: number;
    snapshotCount: number;
    sources: Array<{
      sourceId: string;
      type: HarnessKnowledgeSourceType;
      name: string;
      digest: string;
      knowledgeCategory?: HarnessKnowledgeCategory;
      gapClassification?: HarnessGapClassification;
      redactionApplied?: boolean;
      usedFor: string[];
      projectActions?: string[];
    }>;
  };
  generatedBy: {
    mode: "llm" | "deterministic-template";
    actor?: string;
    llmProfileId?: string;
    provider?: string;
    model?: string;
    requestId?: string;
    evidence: string[];
  };
  createdAt: string;
}

export interface HarnessTemplateImpactReport {
  schema: "evopilot-harness-template-impact-report/v1";
  templateRef: HarnessTemplateRef;
  affectedProjectProfiles: Array<{
    tenantId: string;
    workspaceId: string;
    projectId: string;
    profileId: string;
    activeVersion?: number;
    activeTemplateVersion?: string;
    activeTemplateDigest?: string;
    impact: "MATCHES_TEMPLATE_ID" | "STALE_TEMPLATE_VERSION" | "NO_ACTIVE_PROFILE";
    nextAction: string;
  }>;
  staleProfileCount: number;
  generatedAt: string;
}

export interface HarnessTemplateEvolutionAnalysis {
  schema: "evopilot-harness-template-analysis/v1";
  capabilitySignals: string[];
  runtimeSignals: string[];
  evidenceSignals: string[];
  failureSignals: string[];
  observabilitySignals: string[];
  governanceSignals: string[];
  domainSignals: string[];
  gapClassifications: HarnessGapClassification[];
  sourceCoverage: string[];
  generatedAt: string;
}

export type HarnessTemplateMatchDecision = "EVOLVE_EXISTING" | "CREATE_NEW_FROM_BASE" | "NEEDS_ADMIN_CONFIRMATION";

export interface HarnessTemplateMatchCandidate {
  templateRef: HarnessTemplateRef;
  harnessLayer: HarnessTemplateLayer;
  domain?: string;
  languageFamily: HarnessTemplateProfile["languageFamily"];
  score: number;
  matchedSignals: string[];
  reasons: string[];
}

export interface HarnessTemplateMatchReport {
  schema: "evopilot-harness-template-match-report/v1";
  decision: HarnessTemplateMatchDecision;
  confidence: number;
  baseTemplateRef: HarnessTemplateRef;
  targetTemplateId: string;
  targetVersion: string;
  targetHarnessLayer: HarnessTemplateLayer;
  targetDomain?: string;
  languageSignals: string[];
  runtimeSignals: string[];
  domainSignals: string[];
  sourceDigests: string[];
  candidateTemplates: HarnessTemplateMatchCandidate[];
  reasons: string[];
  llmAdjudication: {
    used: boolean;
    reason: string;
  };
  nextAction: string;
  generatedAt: string;
}

export interface HarnessTemplateEvolutionRun {
  schema: "evopilot-harness-template-evolution-run/v1";
  evolutionId: string;
  tenantId: string;
  workspaceId: string;
  status: HarnessTemplateEvolutionStatus;
  baseTemplateRef: HarnessTemplateRef;
  targetTemplateId: string;
  targetVersion: string;
  intent: string;
  sources: HarnessKnowledgeSource[];
  snapshots: HarnessKnowledgeSnapshot[];
  autoMatch?: HarnessTemplateMatchReport;
  analysisSummary?: HarnessTemplateEvolutionAnalysis;
  draft?: HarnessTemplateDraft;
  review?: {
    status: "APPROVED" | "REJECTED";
    confirmedBy: string;
    confirmation: string;
    confirmedAt: string;
  };
  publishedTemplateRef?: HarnessTemplateRef;
  impactReport?: HarnessTemplateImpactReport;
  blockers: string[];
  warnings: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessTemplateEvolutionActor {
  tenantId: string;
  workspaceId: string;
  actor: string;
}

export interface HarnessTemplateProjectProfileBinding {
  tenantId: string;
  workspaceId: string;
  projectId: string;
  profileId: string;
  templateRef?: HarnessTemplateRef;
  activeTemplateRef?: HarnessTemplateRef;
  activeVersion?: number;
}
