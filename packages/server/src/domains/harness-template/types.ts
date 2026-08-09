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
  registryPath?: string;
  registryDigest?: string;
  registryCatalogId?: string;
  registryCatalogPriority?: number;
  registryCatalogRelease?: string;
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
  priority?: number;
  registryPath?: string;
  registryDigest?: string;
  expectedCatalogDigest?: string;
  release?: string;
  owner?: string;
  description?: string;
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

export interface HarnessRegistryCatalogRef {
  id: string;
  enabled: boolean;
  priority: number;
  root: string;
  resolvedRoot: string;
  release?: string;
  expectedCatalogDigest?: string;
  owner?: string;
  description?: string;
  warnings: string[];
}

export interface HarnessRegistryConfig {
  schema: "evopilot-harness-registry/v1";
  status: "READY" | "FAILED";
  path: string;
  digest?: string;
  generatedBy?: string;
  generatedAt?: string;
  catalogCount: number;
  enabledCount: number;
  catalogs: HarnessRegistryCatalogRef[];
  warnings: string[];
  blockers: string[];
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
  priority?: number;
  registryPath?: string;
  registryDigest?: string;
  expectedCatalogDigest?: string;
  release?: string;
  owner?: string;
  description?: string;
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

export interface HarnessTemplateProjectProfileBinding {
  tenantId: string;
  workspaceId: string;
  projectId: string;
  profileId: string;
  templateRef?: HarnessTemplateRef;
  activeTemplateRef?: HarnessTemplateRef;
  activeVersion?: number;
}
