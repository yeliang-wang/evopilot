import type { CodeUpgraderConnectorConfig, CodeUpgraderRunStatus } from "@evopilot/adapter-code-upgrader";
import type {
  DeliveryPlan,
  EvidenceBundle,
  EvolutionOpportunity,
  EvolutionPlan,
  EvolutionTriggerRule,
  ImpactMap,
  LearningRecord,
  PipelineRun,
  PriorityScore,
  ProjectProfile,
  ReleaseReport,
  ReviewRecord,
  RuntimeEvidenceEvent
} from "@evopilot/core";
import type { LlmTaskClient } from "@evopilot/llm";
import type {
  HarnessCapabilityDefinition,
  HarnessTemplateChangelogEntry,
  HarnessTemplateEvolutionRun,
  HarnessTemplateProfile,
  HarnessTemplateProjectProfileBinding,
  HarnessTemplateRef,
  HarnessTemplateSourceReference
} from "./domains/harness-template/index.js";

export interface EvoPilotServerOptions {
  dataRoot: string;
  profile?: ProjectProfile;
  apiToken?: string;
  tokens?: AuthToken[];
  users?: AuthUser[];
  dashboardRoot?: string;
  deliveryExecutor?: DeliveryExecutor;
  llmClient?: LlmTaskClient;
  requireLlm?: boolean;
  runtimeMode?: EvoPilotRuntimeMode;
  allowAnonymousAdmin?: boolean;
  allowMockIntegrations?: boolean;
  allowSampleData?: boolean;
  autoRegisterProfileProject?: boolean;
  maxBodyBytes?: number;
  proofOpsCoreContractPath?: string;
}

export type EvoPilotRuntimeMode = "prod" | "debug";

export interface RuntimeConfig {
  mode: EvoPilotRuntimeMode;
  requireLlm: boolean;
  allowAnonymousAdmin: boolean;
  allowMockIntegrations: boolean;
  allowSampleData: boolean;
  autoRegisterProfileProject: boolean;
}

export type AuthRole = "viewer" | "operator" | "admin";

export interface AuthToken {
  name: string;
  token: string;
  role: AuthRole;
  tenantId?: string;
  workspaceId?: string;
  displayName?: string;
  platformAdmin?: boolean;
  mustChangePassword?: boolean;
}

export interface AuthUser {
  username: string;
  password: string;
  role: AuthRole;
  tenantId: string;
  workspaceId: string;
  displayName?: string;
  token?: string;
  status?: "ACTIVE" | "SUSPENDED";
  platformAdmin?: boolean;
  mustChangePassword?: boolean;
}

export interface DeliveryExecutorResult {
  ciStatus: "PASSED" | "FAILED";
  validationSummary?: string;
}

export type DeliveryExecutor = (args: {
  run: StoredRun;
  delivery: DeliveryPlan;
  plan: EvolutionPlan;
  requestBody: any;
}) => Promise<DeliveryExecutorResult>;

export interface StoredRun {
  id: string;
  evidenceBundle: EvidenceBundle;
  opportunities: EvolutionOpportunity[];
  scores: PriorityScore[];
  impactMaps: ImpactMap[];
  plans: EvolutionPlan[];
  reviews: ReviewRecord[];
  deliveryPlans: DeliveryPlan[];
  pipelineRuns?: PipelineRun[];
  releaseReports: ReleaseReport[];
  learningRecords: LearningRecord[];
}

export interface StoredProject {
  id: string;
  name: string;
  profileId: string;
  tenantId: string;
  workspaceId: string;
  repository?: ProjectRepositoryRegistration;
  devops?: ProjectDevopsConfiguration;
  llm?: ProjectLlmBinding;
  runtime?: ProjectRuntimeConfiguration;
  validation: ProjectValidation;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectLlmBinding {
  schema: "evopilot-project-llm-binding/v1";
  profileId: string;
  required: boolean;
  boundAt: string;
  boundBy?: string;
}

export type ProjectRepositoryProvider = "local-git" | "gitlab" | "github";

export type ProjectExecutionMode = "owned-repository" | "read-only-public" | "fork-validated-pr" | "upstream-authorized";

export type ProjectClaimBoundary = "read-only-analysis" | "working-repo-ci" | "fork-ci-pr" | "upstream-release";

export interface ProjectRepositoryRef {
  provider: Exclude<ProjectRepositoryProvider, "local-git">;
  gitUrl?: string;
  baseUrl?: string;
  projectId?: string;
  owner?: string;
  repo?: string;
  defaultBranch?: string;
}

export interface ProjectRepositoryTopology {
  executionMode: ProjectExecutionMode;
  upstream?: ProjectRepositoryRef;
  working: ProjectRepositoryRef;
  claimBoundary: ProjectClaimBoundary;
}

export interface ProjectRepositoryRegistration {
  provider: ProjectRepositoryProvider;
  gitUrl?: string;
  root?: string;
  baseUrl?: string;
  projectId?: string;
  owner?: string;
  repo?: string;
  defaultBranch?: string;
  topology?: ProjectRepositoryTopology;
  credentials?: ProjectRepositoryCredentials;
}

export interface ProjectRepositoryCredentials {
  username?: string;
  password?: string;
  token?: string;
  tokenRef?: string;
}

export type ProjectDevopsProvider = "github-actions" | "gitlab-ci";

export interface ProjectDevopsConfiguration {
  provider: ProjectDevopsProvider;
  mode: "scm-native";
  tokenRef?: string;
  boundary?: {
    executionMode: ProjectExecutionMode;
    owner?: string;
    namespace?: string;
    repository?: string;
    workflowRepository?: ProjectRepositoryRef;
    credentialRef?: string;
    expectedPrincipal?: string;
    claimBoundary: ProjectClaimBoundary;
  };
  ci: {
    workflow?: string;
    ref?: string;
    requiredChecks?: string[];
    requiredStages?: string[];
    requiredJobs?: string[];
    timeoutSeconds: number;
  };
  cd?: {
    workflow?: string;
    environment?: string;
    requiredStages?: string[];
    requiredJobs?: string[];
    deployInputs?: Record<string, string>;
    healthUrl?: string;
    readyUrl?: string;
    timeoutSeconds: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRuntimeConfiguration {
  language: "python" | "node" | "java" | "go" | "generic";
  installCommands?: string[];
  unitCommands?: string[];
  service?: {
    enabled: boolean;
    startCommand: string;
    host?: string;
    port?: number;
    healthPath?: string;
    readyTimeoutSeconds?: number;
  };
  smokeCommands?: string[];
  functionalCommands?: string[];
}

export interface ProjectRuntimeDiagnostic {
  projectId: string;
  status: "PASSED" | "WARN" | "FAILED";
  checks: Array<{
    name: string;
    status: "PASSED" | "WARN" | "FAILED";
    detail: string;
    remediation?: string;
  }>;
  recommendedAction: string;
  checkedAt: string;
}

export type ProjectHarnessProfileStatus = "DRAFT" | "VALIDATED" | "ACTIVE" | "SUPERSEDED" | "REJECTED";

export type ProjectHarnessProfileSourceFormat = "object" | "json" | "yaml" | "llm-generated";

export type TenantHarnessPolicyStatus = "DRAFT" | "VALIDATED" | "ACTIVE" | "SUPERSEDED" | "REJECTED";

export type TenantHarnessPolicySourceFormat = "object" | "json" | "yaml";

export interface TenantHarnessPolicyRef {
  policyId: string;
  version: number;
  digest: string;
  scope: "tenant-workspace";
}

export interface TenantHarnessPolicySource {
  schema: "evopilot-tenant-harness-policy/v1";
  policyId: string;
  tenantId?: string;
  workspaceId?: string;
  name: string;
  description?: string;
  appliesTo?: {
    projectIds?: string[];
    excludeProjectIds?: string[];
    languageFamilies?: string[];
    templateIds?: string[];
  };
  requiredCapabilities?: HarnessCapabilityDefinition[];
  runtime?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  rules?: Record<string, unknown>;
  failureHandling?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
  observability?: Record<string, unknown>;
  governance?: Record<string, unknown>;
  phaseMapping?: Partial<Record<MaturityPhase, string[]>>;
  llmDraftPolicy?: Record<string, unknown>;
  enforcement?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ProjectHarnessProfileSource {
  schema: "evopilot-project-harness-profile/v1";
  profileId: string;
  projectId: string;
  tenantId?: string;
  workspaceId?: string;
  name: string;
  description?: string;
  template?: Partial<HarnessTemplateRef> & { id?: string };
  capabilities?: HarnessCapabilityDefinition[];
  runtime?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  rules?: Record<string, unknown>;
  failureHandling?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
  observability?: Record<string, unknown>;
  governance?: Record<string, unknown>;
  phaseMapping?: Partial<Record<MaturityPhase, string[]>>;
  llmDraftPolicy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CompiledProjectHarnessProfile {
  schema: "evopilot-project-harness-compiled-profile/v1";
  tenantId: string;
  workspaceId: string;
  projectId: string;
  profileId: string;
  name: string;
  templateRef: HarnessTemplateRef;
  policyRefs: TenantHarnessPolicyRef[];
  capabilities: HarnessCapabilityDefinition[];
  runtime: Record<string, unknown>;
  validation: Record<string, unknown>;
  evidence: Record<string, unknown>;
  rules: Record<string, unknown>;
  failureHandling: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
  observability: Record<string, unknown>;
  governance: Record<string, unknown>;
  phaseMapping: Record<MaturityPhase, string[]>;
  llmDraftPolicy: Record<string, unknown>;
  inheritedSections: string[];
  overrideSections: string[];
  compiledAt: string;
}

export interface ProjectHarnessProfileValidationResult {
  schema: "evopilot-project-harness-profile-validation/v1";
  tenantId: string;
  workspaceId: string;
  projectId: string;
  profileId: string;
  templateRef?: HarnessTemplateRef;
  policyRefs?: TenantHarnessPolicyRef[];
  status: "VALIDATED" | "FAILED";
  checks: Array<{
    id: string;
    status: "PASS" | "FAIL" | "WARN";
    required: boolean;
    evidence: string[];
  }>;
  blockers: string[];
  warnings: string[];
  sourceDigest?: string;
  compiledDigest?: string;
  evaluatedAt: string;
}

export interface ProjectHarnessProfileDiff {
  schema: "evopilot-project-harness-profile-diff/v1";
  tenantId: string;
  workspaceId: string;
  projectId: string;
  profileId: string;
  baseVersion?: number;
  candidateVersion?: number;
  status: "UNCHANGED" | "CHANGED";
  changedSections: string[];
  breakingChanges: string[];
  warnings: string[];
  generatedAt: string;
}

export interface ProjectHarnessProfileVersion {
  schema: "evopilot-project-harness-profile-version/v1";
  tenantId: string;
  workspaceId: string;
  projectId: string;
  profileId: string;
  version: number;
  status: ProjectHarnessProfileStatus;
  sourceFormat: ProjectHarnessProfileSourceFormat;
  sourceContent: ProjectHarnessProfileSource;
  sourceDigest: string;
  compiledContent: CompiledProjectHarnessProfile;
  compiledDigest: string;
  templateRef: HarnessTemplateRef;
  policyRefs: TenantHarnessPolicyRef[];
  validation: ProjectHarnessProfileValidationResult;
  diffFromActive?: ProjectHarnessProfileDiff;
  generatedBy: {
    mode: "user" | "llm" | "deterministic-template";
    actor?: string;
    llmProfileId?: string;
    provider?: string;
    model?: string;
    requestId?: string;
    evidence: string[];
  };
  approvedAt?: string;
  approvedBy?: string;
  activatedAt?: string;
  activatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectHarnessProfileSummary {
  schema: "evopilot-project-harness-profile-summary/v1";
  tenantId: string;
  workspaceId: string;
  projectId: string;
  profileId: string;
  status: ProjectHarnessProfileStatus | "MISSING";
  activeVersion?: number;
  latestVersion?: number;
  sourceDigest?: string;
  compiledDigest?: string;
  templateRef?: HarnessTemplateRef;
  policyRefs?: TenantHarnessPolicyRef[];
  storage: {
    authority: "evopilot-control-plane";
    format: "json";
    path: string;
  };
  versions: Array<{
    version: number;
    status: ProjectHarnessProfileStatus;
    sourceDigest: string;
    compiledDigest: string;
    createdAt: string;
    updatedAt: string;
  }>;
  updatedAt?: string;
}

export interface CompiledTenantHarnessPolicy {
  schema: "evopilot-tenant-harness-policy-compiled/v1";
  tenantId: string;
  workspaceId: string;
  policyId: string;
  name: string;
  description?: string;
  appliesTo: {
    projectIds: string[];
    excludeProjectIds: string[];
    languageFamilies: string[];
    templateIds: string[];
  };
  requiredCapabilities: HarnessCapabilityDefinition[];
  runtime: Record<string, unknown>;
  validation: Record<string, unknown>;
  evidence: Record<string, unknown>;
  rules: Record<string, unknown>;
  failureHandling: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
  observability: Record<string, unknown>;
  governance: Record<string, unknown>;
  phaseMapping: Partial<Record<MaturityPhase, string[]>>;
  llmDraftPolicy: Record<string, unknown>;
  enforcement: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  compiledAt: string;
}

export interface TenantHarnessPolicyValidationResult {
  schema: "evopilot-tenant-harness-policy-validation/v1";
  tenantId: string;
  workspaceId: string;
  policyId: string;
  status: "VALIDATED" | "FAILED";
  checks: Array<{
    id: string;
    status: "PASS" | "FAIL" | "WARN";
    required: boolean;
    evidence: string[];
  }>;
  blockers: string[];
  warnings: string[];
  sourceDigest: string;
  compiledDigest: string;
  evaluatedAt: string;
}

export interface TenantHarnessPolicyVersion {
  schema: "evopilot-tenant-harness-policy-version/v1";
  tenantId: string;
  workspaceId: string;
  policyId: string;
  version: number;
  status: TenantHarnessPolicyStatus;
  sourceFormat: TenantHarnessPolicySourceFormat;
  sourceContent: TenantHarnessPolicySource;
  sourceDigest: string;
  compiledContent: CompiledTenantHarnessPolicy;
  compiledDigest: string;
  validation: TenantHarnessPolicyValidationResult;
  changelog: HarnessTemplateChangelogEntry[];
  generatedBy: {
    mode: "user";
    actor?: string;
    evidence: string[];
  };
  approvedAt?: string;
  approvedBy?: string;
  activatedAt?: string;
  activatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantHarnessPolicySummary {
  schema: "evopilot-tenant-harness-policy-summary/v1";
  tenantId: string;
  workspaceId: string;
  policyId: string;
  status: TenantHarnessPolicyStatus | "MISSING";
  activeVersion?: number;
  latestVersion?: number;
  sourceDigest?: string;
  compiledDigest?: string;
  storage: {
    authority: "evopilot-control-plane";
    format: "json";
    path: string;
  };
  versions: Array<{
    version: number;
    status: TenantHarnessPolicyStatus;
    sourceDigest: string;
    compiledDigest: string;
    createdAt: string;
    updatedAt: string;
  }>;
  updatedAt?: string;
}

export interface ProjectCodeContext {
  status: "AVAILABLE" | "UNAVAILABLE";
  source: "local-git" | "git-clone" | "none";
  projectId: string;
  branch?: string;
  commitSha?: string;
  fileCount: number;
  writableRoots?: string[];
  selectedFiles: Array<{
    path: string;
    content: string;
    truncated: boolean;
  }>;
  summary: string;
  unavailableReason?: string;
}

export interface ProjectValidation {
  status: "VERIFIED" | "FAILED";
  checkedAt: string;
  message: string;
  fileCount?: number;
}

export interface SourceCredentialReadiness {
  schema: "evopilot-source-credential-readiness/v1";
  projectId: string;
  provider: ProjectRepositoryProvider | "unknown";
  status: "READY" | "READ_ONLY" | "BLOCKED";
  checks: Array<{
    id: "project" | "provider" | "credential-ref" | "token-resolution" | "source-branch" | "writeback-policy";
    status: "PASS" | "FAIL" | "SKIP";
    evidence: string[];
    required: boolean;
  }>;
  blockers: string[];
  capabilities: string[];
  nextAction: "write-source" | "configure-token-ref" | "connect-github-account" | "connect-gitlab-account" | "repair-project" | "use-local-git";
  checkedAt: string;
}

export interface ProjectDevopsReadiness {
  schema: "evopilot-project-devops-readiness/v1";
  projectId: string;
  provider: ProjectDevopsProvider | "unknown";
  executionMode: ProjectExecutionMode;
  repositoryOwner?: string;
  devopsOwner?: string;
  workflowRepository?: string;
  credentialRef?: string;
  credentialPrincipal?: string;
  claimBoundary: ProjectClaimBoundary;
  status: "READY" | "OBSERVABLE" | "BLOCKED";
  checks: Array<{
    id: "project" | "source-provider" | "execution-mode" | "devops-provider" | "devops-owner" | "token-resolution" | "ci-config" | "ci-state" | "cd-config" | "health-ready";
    status: "PASS" | "FAIL" | "SKIP";
    evidence: string[];
    required: boolean;
  }>;
  blockers: string[];
  capabilities: string[];
  nextAction: "run-devops" | "configure-devops" | "configure-source-credentials" | "connect-github-account" | "connect-gitlab-account" | "repair-project" | "inspect-ci";
  checkedAt: string;
}

export interface ProjectOnboardingChecklist {
  schema: "evopilot-project-onboarding-checklist/v1";
  mode: "plan" | "inspect";
  tenantId: string;
  workspaceId: string;
  projectId?: string;
  provider: ProjectRepositoryProvider | "unknown";
  repository?: Omit<ProjectRepositoryRegistration, "credentials"> & {
    credentialMode: "none" | "tokenRef" | "inline-token" | "password";
    tokenRef?: string;
    tokenRefResolved?: boolean;
  };
  status: "READY_TO_ONBOARD" | "READY_TO_RUN" | "WAITING_INPUT" | "BLOCKED";
  steps: Array<{
    id: "workspace" | "repository" | "secret" | "github-app" | "project" | "source-credentials" | "devops" | "llm" | "target";
    label: string;
    status: "PASS" | "WARN" | "FAIL" | "SKIP";
    required: boolean;
    evidence: string[];
    nextAction?: string;
  }>;
  sourceCredentials?: SourceCredentialReadiness;
  devops?: ProjectDevopsReadiness;
  llm?: LlmProfileReadiness;
  missingInputs: string[];
  blockers: string[];
  commands: Array<{
    id: string;
    title: string;
    command: string;
    when: string;
    requiresHuman?: boolean;
  }>;
  nextAction: "store-secret" | "store-llm-secret" | "connect-github-account" | "connect-gitlab-account" | "install-github-app" | "register-project" | "configure-source-credentials" | "configure-devops" | "configure-llm" | "configure-llm-profile" | "repair-llm-provider" | "plan-target" | "repair";
  generatedAt: string;
}

export interface LoopExternalBlocker {
  schema: "evopilot-external-blocker/v1";
  id: string;
  type: "source-credential" | "deploy-target" | "project-binding" | "policy" | "unknown";
  status: "WAITING_HUMAN" | "BLOCKED";
  targetId?: string;
  loopId?: string;
  projectId?: string;
  provider?: ProjectRepositoryProvider | "unknown";
  nextAction: "configure-source-credentials" | "repair-project" | "repair-deploy-target" | "policy-review" | "repair";
  blockers: string[];
  evidence: string[];
  recovery: {
    route: "project-source-credentials" | "deploy-connectors" | "project-settings" | "release-policy" | "loop-repair";
    api?: string;
    dashboardAction?: string;
  };
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  actor: string;
  action: string;
  target: string;
  tenantId: string;
  workspaceId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface StoredCodeUpgraderConnector extends CodeUpgraderConnectorConfig {
  createdAt: string;
  updatedAt: string;
}

export interface StoredDeployConnector {
  id: string;
  name: string;
  type: "http-webhook" | "ecs-docker-compose";
  url?: string;
  rollbackUrl?: string;
  method?: "POST";
  token?: string;
  tokenRef?: string;
  headers?: Record<string, string>;
  timeoutSeconds: number;
  workingDir?: string;
  composeFile?: string;
  serviceName?: string;
  gitRemote?: string;
  gitBranch?: string;
  gitPull?: boolean;
  preserveLocalPaths?: string[];
  build?: boolean;
  skipComposeWhenUnchanged?: boolean;
  deployLock?: boolean;
  idempotency?: boolean;
  rollbackOnFailure?: boolean;
  rollbackOnHealthFailure?: boolean;
  gitCommand?: string;
  dockerCommand?: string;
  healthPath?: string;
  readyPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CodeUpgradeRun {
  id: string;
  projectId: string;
  deliveryPlanId: string;
  planId: string;
  reviewId?: string;
  executor: "code-upgrader";
  status: CodeUpgraderRunStatus;
  proposalMarkdown: string;
  validationCommands: string[];
  branchStrategy: {
    sourceBranch: string;
    upgradeBranch: string;
    commitMessage: string;
    mergeRequestTitle: string;
    mergeRequestDescription: string;
  };
  codeUpgrader: {
    connectorId: string;
    workspaceId?: string;
    conversationId: string;
  };
  artifacts: {
    diffPath?: string;
    branchName?: string;
    commitSha?: string;
    pullRequestUrl?: string;
    changedFiles?: string[];
  };
  failureReason?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CodeUpgradeEvent {
  id: string;
  codeUpgradeRunId: string;
  timestamp: string;
  source: "agent" | "user" | "environment" | "tool" | "evopilot" | "code-upgrader";
  phase: string;
  level: "info" | "warn" | "error";
  message: string;
  raw?: unknown;
}

export interface ScheduledEvolution {
  id: string;
  projectId: string;
  deliveryPlanId: string;
  planId: string;
  executor: ProjectDevopsProvider;
  connectorId: string;
  jobName: string;
  scheduledAt: string;
  status: "SCHEDULED" | "TRIGGERED";
  parameters: Record<string, string>;
  createdAt: string;
  triggeredAt?: string;
  pipelineRunId?: string;
}

export interface AuthContext {
  actor: string;
  role: AuthRole;
  tenantId: string;
  workspaceId: string;
  platformAdmin?: boolean;
  mustChangePassword?: boolean;
}

export type WorkspaceMemberRole = "owner" | "admin" | "developer" | "viewer";

export interface TenantRecord {
  schema: "evopilot-tenant/v1";
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  plan: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  schema: "evopilot-user/v1";
  id: string;
  username: string;
  displayName: string;
  role: AuthRole;
  tenantId: string;
  workspaceId: string;
  status: "ACTIVE" | "SUSPENDED";
  platformAdmin: boolean;
  mustChangePassword: boolean;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface WorkspaceRecord {
  schema: "evopilot-workspace/v1";
  id: string;
  tenantId: string;
  name: string;
  status: "ACTIVE" | "BOUNDARY_DRAFT" | "SUSPENDED";
  members: Array<{
    id: string;
    name: string;
    role: WorkspaceMemberRole;
    status: "ACTIVE" | "INVITED" | "SUSPENDED";
  }>;
  quotas: {
    loops: number;
    projects: number;
    evidenceGb: number;
  };
  createdAt: string;
  updatedAt: string;
}

export type SecretKind = "github-app-private-key" | "github-webhook-secret" | "source-token" | "deploy-token" | "llm-key" | "llm-api-key" | "generic";

export interface SecretRecord {
  schema: "evopilot-secret/v1";
  id: string;
  tenantId: string;
  workspaceId: string;
  name: string;
  kind: SecretKind;
  status: "ACTIVE" | "REVOKED";
  version: number;
  encryption: {
    algorithm: "aes-256-gcm";
    iv: string;
    tag: string;
    ciphertext: string;
  };
  createdAt: string;
  updatedAt: string;
  rotatedAt?: string;
  revokedAt?: string;
}

export type LlmProfileProvider = "openai-compatible";

export interface LlmProfileRecord {
  schema: "evopilot-llm-profile/v1";
  id: string;
  tenantId: string;
  workspaceId: string;
  name: string;
  provider: LlmProfileProvider;
  providerName: string;
  baseUrl: string;
  modelName: string;
  apiKeyRef: string;
  status: "ACTIVE" | "DISABLED";
  timeoutSeconds: number;
  maxRetries: number;
  defaultMaxOutputTokens: number;
  maxOutputTokens: number;
  temperature: number;
  thinkingType: string;
  createdAt: string;
  updatedAt: string;
  lastPreflight?: LlmProfileReadiness;
}

export interface LlmProfileReadiness {
  schema: "evopilot-llm-profile-readiness/v1";
  profileId?: string;
  tenantId: string;
  workspaceId: string;
  source: "global-default" | "profile" | "missing";
  status: "READY" | "BLOCKED";
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKeyRef?: string;
  checks: Array<{
    id: "profile" | "provider" | "base-url" | "model" | "secret" | "provider-call";
    status: "PASS" | "FAIL" | "SKIP";
    required: boolean;
    evidence: string[];
  }>;
  blockers: string[];
  nextAction: "run-loop" | "store-llm-secret" | "configure-llm-profile" | "repair-llm-provider";
  checkedAt: string;
}

export interface LoopLlmSelection {
  schema: "evopilot-loop-llm-selection/v1";
  source: "global-default" | "project-default" | "loop-override" | "none";
  configured: boolean;
  required: boolean;
  profileId?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKeyRef?: string;
  resolvedAt: string;
}

export interface GitHubAppInstallationRecord {
  schema: "evopilot-github-app-installation/v1";
  id: string;
  tenantId: string;
  workspaceId: string;
  installationId: string;
  account: string;
  repositories: string[];
  permissions: Record<string, string>;
  privateKeySecretRef?: string;
  webhookSecretRef?: string;
  status: "READY" | "BLOCKED" | "REVOKED";
  checks: Array<{ id: string; status: "PASS" | "FAIL"; evidence: string[] }>;
  createdAt: string;
  updatedAt: string;
}

export interface RuleMemory {
  id: string;
  userPrompt: string;
  enabled: boolean;
  description: string;
  compiledRule: EvolutionTriggerRule;
  storagePath: string;
  llmTrace?: Record<string, unknown>;
}

export interface EvaluationDataset {
  id: string;
  projectId: string;
  name: string;
  source: string;
  status: "REGRESSION_READY" | "EVALUATED" | "NEEDS_LABELING" | "INSUFFICIENT_EVIDENCE";
  severity: "LOW" | "MEDIUM" | "HIGH";
  sampleCount: number;
  metric: string;
  scope: string;
  triggeredAt: string;
  generatedBy?: "manual" | "self-learning";
  evidenceEventIds?: string[];
  opportunityIds?: string[];
  confidence?: number;
  learningSignal?: string;
}

export type EvolutionBatchStatus =
  | "CANDIDATE"
  | "DRAFT_READY"
  | "CONFIRMED"
  | "CODE_UPGRADING"
  | "CICD_RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "SKIPPED";

export interface EvolutionBatch {
  id: string;
  projectId: string;
  status: EvolutionBatchStatus;
  intent?: "standard-evolution" | "cost-optimization";
  triggerReason: string;
  datasetIds: string[];
  opportunityIds: string[];
  ruleIds: string[];
  confidence: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  priorityScore: number;
  evidenceWindow: {
    from: string;
    to: string;
  };
  watermarks: {
    datasetTriggeredAt: string;
    opportunityRunId?: string;
  };
  draftId?: string;
  reviewId?: string;
  deliveryPlanId?: string;
  codeUpgradeRunId?: string;
  pipelineRunId?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvolutionFreezeDiagnostic {
  projectId: string;
  reason: string;
  costReport?: CostReport;
}

export interface SoakReport {
  id: string;
  name: string;
  durationSeconds: number;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "STOPPED";
  startedAt: string;
  finishedAt?: string;
  summary?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type ReleaseScenarioStatus = "PASS" | "FAIL" | "NOT-RUN" | "NOT-APPLICABLE";

export interface ReleaseScenarioResult {
  id: string;
  name: string;
  status: ReleaseScenarioStatus;
  evidence: string[];
  required: boolean;
  updatedAt: string;
}

export interface ReleaseRisk {
  id: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  source: string;
  status: "OPEN" | "MITIGATED" | "ACCEPTED";
  summary: string;
  evidence: string[];
  recommendedAction: string;
}

export interface ReleaseEvidenceBundle {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId?: string;
  candidate: string;
  status: "GO" | "CONDITIONAL-GO" | "NO-GO";
  releaseTargetId?: string;
  releaseDecisionId?: string;
  generatedAt: string;
  summary: Record<string, unknown>;
  sourceSoakReportIds: string[];
  serviceInventory: Array<{
    id: string;
    type: "evopilot" | "code-upgrader" | "ci" | "connected-project";
    name: string;
    status: "READY" | "WARN" | "BLOCKED";
    endpoint?: string;
    evidence: string;
  }>;
  connectedProjects: Array<{
    id: string;
    name: string;
    repository?: Omit<ProjectRepositoryRegistration, "credentials"> & { credentialsConfigured: boolean };
    devops?: ProjectDevopsConfiguration;
    validation: ProjectValidation;
    releaseReadiness?: ReleaseReadinessReport;
    rolloutStrategy?: RolloutStrategyReport;
  }>;
  scenarioMatrix: ReleaseScenarioResult[];
  riskRegister: ReleaseRisk[];
  artifacts: Array<{
    type: "soak-report" | "pipeline" | "code-upgrade" | "dashboard" | "log" | "other";
    label: string;
    path?: string;
    url?: string;
    status?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseEvidenceListItem {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId?: string;
  candidate: string;
  status: ReleaseEvidenceBundle["status"];
  releaseTargetId?: string;
  releaseDecisionId?: string;
  generatedAt: string;
  summary: {
    projectCount: number;
    runCount: number;
    releaseReadinessScore: number;
    releaseBlockedCount: number;
    rolloutBlockedCount: number;
    releaseDecisionCount: number;
    latestReleaseDecisionId?: string;
  };
  scenarioSummary: {
    total: number;
    passed: number;
    failed: number;
    notRun: number;
    requiredFailed: number;
  };
  riskSummary: {
    total: number;
    open: number;
    highOpen: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseTargetProfile {
  id: string;
  name: string;
  description: string;
  scope?: "platform" | "tenant" | "workspace" | "project";
  projectId?: string;
  templateId?: string;
  minConnectedProjects: number;
  minSucceededSoakSeconds: number;
  requireActiveSoak?: boolean;
  minActiveSoakRunDelta?: number;
  minActiveSoakCodeUpgradeDelta?: number;
  minActiveSoakPipelineDelta?: number;
  minSuccessfulRuns: number;
  minEvaluationDatasets: number;
  minOpportunities: number;
  minSuccessfulEvolutionBatches: number;
  minSuccessfulCodeUpgrades: number;
  minSuccessfulPipelines: number;
  requiredScenarioIds: string[];
  requireNoHighOpenRisks: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseDecisionCriterion {
  id: string;
  name: string;
  status: "PASS" | "FAIL";
  actual: number | string | boolean;
  target: number | string | boolean;
  evidence: string[];
  required: boolean;
}

export interface ReleaseDecision {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId?: string;
  candidate: string;
  targetId: string;
  evidenceBundleId: string;
  status: "GO" | "CONDITIONAL-GO" | "NO-GO";
  generatedAt: string;
  criteria: ReleaseDecisionCriterion[];
  summary: Record<string, unknown>;
  scenarioMatrix: ReleaseScenarioResult[];
  riskRegister: ReleaseRisk[];
  createdAt: string;
  updatedAt: string;
}

export interface ProofOpsCoreContract {
  schema: "proofops-core-contract/v1";
  version: string;
  decisionVocabulary: string[];
  productionReleaseEvidenceRule: string;
  finalReportSchema: "proofops-final-release-report/v1";
  targets?: Array<{ id: string; title?: string; requiredEvidence?: string[] }>;
}

export type TargetLoopStatus = "PENDING_PLAN_APPROVAL" | "RUNNING" | "GO" | "NO-GO" | "BLOCKED";

export type TargetEvidenceStatus = "PASS" | "FAIL" | "NOT_RUN" | "BLOCKED";

export interface TargetLoopEvidenceRow {
  capability: string;
  scenario: string;
  requiredEvidence: string;
  status: TargetEvidenceStatus;
  required: boolean;
  blocker: string;
  nextRepairAction: string;
  evidence: string[];
}

export interface TargetLoopDecisionStep {
  phase: string;
  rule: string;
  decision: "continue" | "repair blocker" | "block" | "release";
  rationale: string;
  nextAction: string;
  evidence: string[];
}

export interface TargetLoopRun {
  schema: "evopilot-proofops-target-loop/v1";
  id: string;
  projectId: string;
  targetId: string;
  releaseTarget: string;
  mode: "proofops-target-loop";
  status: TargetLoopStatus;
  targetPlan: {
    finalGoal: string;
    phaseGoals: string[];
    acceptanceCriteria: string[];
    finalDecision: Array<"GO" | "CONDITIONAL-GO" | "NO-GO" | "BLOCKED">;
    source: "proofops-core-compatible";
    proofOpsCoreVersion?: string;
  };
  targetPlanConfirmation: {
    status: "pending" | "confirmed";
    confirmedAt?: string;
    confirmedBy?: string;
    instruction: string;
  };
  evidenceMatrix: TargetLoopEvidenceRow[];
  decisionChain: TargetLoopDecisionStep[];
  releaseDecision?: {
    id: string;
    status: ReleaseDecision["status"];
    evidenceBundleId: string;
    targetReached: boolean;
    failedCriteria: number;
    highOpenRisks: number;
  };
  finalReport?: {
    schema: "proofops-final-release-report/v1";
    projectId: string;
    releaseTarget: string;
    lifecycleId: string;
    terminalReason: string;
    generatedAt: string;
    targetPlan: TargetLoopRun["targetPlan"];
    targetPlanConfirmation: TargetLoopRun["targetPlanConfirmation"];
    releaseDecision?: TargetLoopRun["releaseDecision"];
    finalTargetSummary: {
      finalGoal: string;
      finalDecision: string;
      targetReached: boolean;
      latestCoverage: {
        required: number;
        passed: number;
        failedOrBlocked: number;
      };
      blocker: string;
      conclusion: string;
    };
    coverageMatrix: TargetLoopEvidenceRow[];
    decisionChain: TargetLoopDecisionStep[];
    productionReleaseRule: string;
  };
  releaseActions: Array<{
    action: string;
    status: "PENDING_APPROVAL" | "APPROVED" | "EXECUTED";
    approvedAt?: string;
    approvedBy?: string;
    executedAt?: string;
    executedBy?: string;
  }>;
  remediationRequests: Array<{
    id: string;
    status: "ROUTED" | "RESOLVED";
    blocker: string;
    routedTo: "evopilot";
    createdAt: string;
    resolvedAt?: string;
  }>;
  artifacts: {
    finalReportJson?: string;
    sourceReleaseEvidenceBundleId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type GlobalGoalStatus = "DRAFT" | "PLANNED" | "APPROVED" | "RUNNING" | "WAITING_HUMAN" | "BLOCKED" | "COMPLETED" | "FAILED";

export type GoalPlanStatus = "MISSING" | "PENDING_APPROVAL" | "APPROVED";

export type GoalTargetStatus = "PENDING" | "READY" | "RUNNING" | "WAITING_HUMAN" | "BLOCKED" | "DONE" | "FAILED";

export type GoalTargetLayer = "planning" | "sandbox" | "context" | "harness" | "loop" | "release";

export type MaturityPhase = "alpha" | "beta" | "rc" | "ga";

export type PhaseTargetStatus = "PENDING" | "RUNNING" | "PASSED" | "BLOCKED" | "FAILED";

export type PhaseDecisionStatus = "PENDING" | "GO" | "NO-GO";

export type ReviewCapability = "architecture" | "security" | "testing" | "documentation" | "operations" | "release";

export type GoalNextAction =
  | "plan-goal"
  | "approve-plan"
  | "start-target"
  | "advance-target"
  | "resume-loop"
  | "human-approval"
  | "configure-source-credentials"
  | "connect-github-account"
  | "connect-gitlab-account"
  | "configure-token-ref"
  | "configure-devops"
  | "configure-llm"
  | "store-llm-secret"
  | "configure-llm-profile"
  | "repair-llm-provider"
  | "repair-project"
  | "repair-deploy-target"
  | "policy-review"
  | "release-decision"
  | "view-final-report"
  | "review-phase-package"
  | "done"
  | "repair";

export interface MaturityStandardTemplate {
  schema: "evopilot-maturity-standard-template/v1";
  id: string;
  standardSetId: string;
  version: string;
  phase: MaturityPhase;
  name: string;
  purpose: string;
  baselineRules: string[];
  acceptanceCriteria: string[];
  requiredEvidence: string[];
  reviewCapabilities: ReviewCapability[];
  packageOutputs: string[];
  goNoGoRules: string[];
  plannerInstructions: string[];
  targetSchema: {
    requiredFields: string[];
    minRequiredTargets: number;
    mustProduceTargetEvidencePackage: boolean;
  };
  packageContract: {
    targetEvidencePackageRequired: boolean;
    phasePackageRequired: boolean;
    nextTargetRequiresPreviousPackageGo: boolean;
  };
  overridePolicy: {
    canAddGoalTargets: boolean;
    canStrengthenCriteria: boolean;
    canRemoveBaselineCriteria: boolean;
    weakerPlanVerdict: "CONDITIONAL-GO" | "NO-GO";
  };
}

export type HarnessTemplateSelectionMode = "request-override" | "previous-active-profile" | "auto-match";

export interface HarnessTemplateSelection {
  template: HarnessTemplateProfile;
  mode: HarnessTemplateSelectionMode;
  reasons: string[];
  candidateScores?: Array<{
    templateId: string;
    version: string;
    score: number;
    reasons: string[];
  }>;
}

export interface PhaseTarget {
  schema: "evopilot-phase-target/v1";
  id: string;
  goalId: string;
  phase: MaturityPhase;
  title: string;
  status: PhaseTargetStatus;
  dependencyPhase?: MaturityPhase;
  goalTargetIds: string[];
  acceptanceCriteria: string[];
  requiredEvidence: string[];
  reviewCapabilities: ReviewCapability[];
  packageOutputs: string[];
  decision: {
    status: PhaseDecisionStatus;
    rationale: string;
    evidence: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface GoalTarget {
  schema: "evopilot-goal-target/v1";
  id: string;
  goalId: string;
  projectId: string;
  releaseTargetId: string;
  phase?: MaturityPhase;
  standardId?: string;
  title: string;
  description: string;
  layer: GoalTargetLayer;
  required: boolean;
  dependencyIds: string[];
  acceptanceCriteria: string[];
  requiredEvidence?: string[];
  reviewCapabilities?: ReviewCapability[];
  status: GoalTargetStatus;
  nextAction: GoalNextAction;
  loopId?: string;
  targetVersion?: string;
  evidence: string[];
  blocker?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoalPlanApprovalConfirmation {
  schema: "evopilot-goal-plan-approval-confirmation/v1";
  confirmedBy: string;
  confirmation: string;
  confirmedAt: string;
  actor: string;
}

export interface GoalPlanPlannerTrace {
  schema: "evopilot-goal-plan-planner-trace/v1";
  mode: "llm-constrained" | "debug-deterministic-no-provider";
  generatedBy: "llm" | "deterministic-debug";
  provider?: string;
  model?: string;
  llmProfileId?: string;
  requestId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  creditsConsumed: number;
  creditUnit: "token";
  guardrails: string[];
  evidence: string[];
  generatedAt: string;
}

export interface GoalPlanProjectHarnessBinding {
  schema: "evopilot-goal-plan-project-harness-binding/v1";
  profileId: string;
  version: number;
  status: "ACTIVE";
  templateRef: HarnessTemplateRef;
  policyRefs: TenantHarnessPolicyRef[];
  sourceDigest: string;
  compiledDigest: string;
  capabilities: string[];
  inheritedSections: string[];
  overrideSections: string[];
  evidence: string[];
  boundAt: string;
}

export interface GoalPlan {
  schema: "evopilot-goal-plan/v1";
  status: GoalPlanStatus;
  decompositionStrategy: "ga-maturity-ladder" | "manual" | "none";
  terminalMaturity?: "ga";
  maturityStandardSetId?: string;
  standardVersion?: string;
  planner?: GoalPlanPlannerTrace;
  projectHarness?: GoalPlanProjectHarnessBinding;
  summary: string;
  targetCount: number;
  requiredTargetCount: number;
  phaseTargets: PhaseTarget[];
  targets: GoalTarget[];
  editablePlan?: {
    status: "PENDING_USER_CONFIRMATION" | "APPROVED";
    allowed: string[];
    denied: string[];
    nextAction: GoalNextAction;
  };
  generatedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  confirmation?: GoalPlanApprovalConfirmation;
}

export interface GoalTimelineEvent {
  type: "CREATED" | "PLAN_GENERATED" | "PLAN_UPDATED" | "PLAN_APPROVED" | "TARGET_CREATED" | "TARGET_ADVANCED" | "LOOP_BOUND" | "PHASE_PACKAGE_GENERATED" | "BLOCKED" | "COMPLETED" | "REPORT_GENERATED";
  message: string;
  timestamp: string;
  targetId?: string;
  loopId?: string;
  metadata?: Record<string, unknown>;
}

export interface GoalEvidenceMatrixRow {
  targetId: string;
  phase?: MaturityPhase;
  title: string;
  required: boolean;
  status: GoalTargetStatus;
  acceptanceCriteria: string[];
  requiredEvidence?: string[];
  reviewCapabilities?: ReviewCapability[];
  evidence: string[];
  blocker?: string;
  loopId?: string;
}

export interface TargetEvidencePackage {
  schema: "evopilot-target-evidence-package/v1";
  goalId: string;
  projectId: string;
  releaseTargetId: string;
  targetId: string;
  phase?: MaturityPhase;
  status: PhaseDecisionStatus;
  generatedAt: string;
  target: {
    title: string;
    status: GoalTargetStatus;
    required: boolean;
    layer: GoalTargetLayer;
  };
  acceptanceCriteria: string[];
  requiredEvidence: string[];
  reviewCapabilities: ReviewCapability[];
  packageOutputs: string[];
  loop?: {
    id: string;
    status: LoopRunStatus;
    iteration: number;
    sourceClosureState: LoopSourceClosureState;
  };
  evidence: string[];
  blockers: string[];
  llmUsage: LlmUsageSummary;
  decision: {
    status: PhaseDecisionStatus;
    rationale: string;
    evidence: string[];
  };
}

export interface PhasePackage {
  schema: "evopilot-phase-package/v1";
  goalId: string;
  projectId: string;
  releaseTargetId: string;
  phase: MaturityPhase;
  status: PhaseTargetStatus;
  generatedAt: string;
  targetSummary: {
    total: number;
    required: number;
    done: number;
    blocked: number;
    failed: number;
  };
  acceptanceCriteria: string[];
  requiredEvidence: string[];
  reviewCapabilities: ReviewCapability[];
  evidenceMatrix: GoalEvidenceMatrixRow[];
  targetPackages: TargetEvidencePackage[];
  blockers: string[];
  decision: PhaseTarget["decision"];
  packageOutputs: string[];
}

export interface GoalCompletionReport {
  schema: "evopilot-goal-completion-report/v1";
  goalId: string;
  projectId: string;
  releaseTargetId: string;
  objective: string;
  status: "COMPLETED" | "BLOCKED" | "FAILED";
  generatedAt: string;
  targetSummary: {
    total: number;
    required: number;
    done: number;
    blocked: number;
    failed: number;
  };
  phasePackages: PhasePackage[];
  evidenceMatrix: GoalEvidenceMatrixRow[];
  releaseDecision?: ReleaseDecision;
  conclusion: string;
}

export interface GlobalGoal {
  schema: "evopilot-global-goal/v1";
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  releaseTargetId: string;
  objective: string;
  terminalMaturity?: "ga";
  maturityStandardSetId?: string;
  llm?: LoopLlmSelection;
  status: GlobalGoalStatus;
  plan: GoalPlan;
  finalReport?: GoalCompletionReport;
  timeline: GoalTimelineEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface GoalSnapshot {
  schema: "evopilot-goal-snapshot/v1";
  goal: GlobalGoal;
  status: GlobalGoalStatus;
  progress: {
    totalTargets: number;
    requiredTargets: number;
    completedTargets: number;
    blockedTargets: number;
    failedTargets: number;
    percent: number;
  };
  phases: PhaseTarget[];
  activeTarget?: GoalTarget;
  nextAction: GoalNextAction;
  blockers: string[];
  evidence: string[];
  releaseDecision?: ReleaseDecision;
  updatedAt: string;
}

export interface GoalGraph {
  schema: "evopilot-goal-graph/v1";
  goalId: string;
  nodes: Array<GoalTarget & { active: boolean }>;
  edges: Array<{ from: string; to: string; type: "depends-on" }>;
  nextAction: GoalNextAction;
}

export interface GoalRunStatus {
  schema: "evopilot-goal-run-status/v1";
  scope: {
    tenantId: string;
    workspaceId: string;
  };
  goal: GlobalGoal;
  status: GlobalGoalStatus;
  nextAction: GoalNextAction;
  snapshot: GoalSnapshot;
  graph: GoalGraph;
  timeline: GoalTimelineEvent[];
  evidenceMatrix: GoalEvidenceMatrixRow[];
  activeTarget?: GoalTarget;
  latestLoop?: LoopRun;
  releaseDecision?: ReleaseDecision;
  finalReport?: GoalCompletionReport;
  phasePackages: PhasePackage[];
  targetPackages: TargetEvidencePackage[];
  llmUsage: LlmUsageSummary;
  chain: Array<{
    id: string;
    label: string;
    status: string;
    detail: string;
  }>;
  blockers: string[];
  updatedAt: string;
}

export interface GoalAdvanceResult {
  schema: "evopilot-goal-advance/v1";
  status: GlobalGoalStatus;
  goal: GlobalGoal;
  snapshot: GoalSnapshot;
  target?: GoalTarget;
  loop?: LoopRun;
  finalReport?: GoalCompletionReport;
  stages: Array<{
    id: "plan-check" | "enterprise-source-preflight" | "enterprise-devops-preflight" | "enterprise-llm-preflight" | "target-select" | "loop-bind" | "loop-iterate" | "human-gate" | "final-report";
    status: "SUCCEEDED" | "SKIPPED" | "BLOCKED" | "FAILED";
    detail: string;
    evidence: string[];
  }>;
  nextAction: GoalNextAction;
  evidence: string[];
  createdAt: string;
}

export type LoopRunStatus = "PENDING" | "RUNNING" | "WAITING_APPROVAL" | "BLOCKED" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export type LoopTriggerSource = "api" | "im" | "schedule" | "runtime-signal" | "release-target" | "evolution-batch";

export type LoopDecision = "CONTINUE" | "REPAIR" | "BLOCK" | "WAIT_APPROVAL" | "SUCCEED" | "FAIL";

export type ExecutorNodeType = "llm" | "code-upgrader" | "ci" | "validator" | "approval" | "release-action";

export type LoopStoreBackendType = "file" | "sqlite" | "postgres";

export type LoopExecutorMode = "serial" | "parallel";

export type LoopSandboxRuntimeType = "host" | "docker" | "k8s";

export type LoopSourceClosureState = "PLANNED" | "CODE_CHANGED" | "PUSHED" | "TAGGED" | "DEPLOYED" | "HEALTH_READY" | "HEALTH_FAILED" | "ROLLED_BACK" | "PROMOTED" | "FAILED";

export type LoopSourceClosureGate = "code-change" | "push" | "tag" | "deploy" | "health-ready";

export type SourceReleaseClosureStage = LoopSourceClosureGate | "review" | "policy" | "merge";

export type SourceReleaseReviewStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "MERGED";

export type SourceReleasePolicyStatus = "PASS" | "BLOCKED";

export type SourceReleasePostMergeDeployStatus = "NOT_REQUIRED" | "SUCCEEDED" | "FAILED" | "ROLLED_BACK";

export interface SourceReleaseClosureRun {
  schema: "evopilot-source-release-closure-run/v1";
  id: string;
  loopId: string;
  projectId: string;
  sourceProjectId: string;
  tenantId: string;
  workspaceId: string;
  provider: LoopSourceClosure["repositoryProvider"];
  releaseStrategy: LoopSourceClosure["releaseStrategy"];
  sourceRef: {
    sourceUrl?: string;
    sourceRoot?: string;
    sourceBranch: string;
    releaseBranch?: string;
  };
  targetVersion?: string;
  deploymentEnvironment?: string;
  status: LoopSourceClosureState;
  stages: Array<{
    gate: SourceReleaseClosureStage;
    label: string;
    status: "PENDING" | "PASSED" | "FAILED" | "SKIPPED";
    evidence: string[];
    checkedAt?: string;
  }>;
  artifacts: LoopSourceClosure["artifacts"];
  review: {
    status: SourceReleaseReviewStatus;
    reviewUrl?: string;
    approvedBy?: string;
    approvedAt?: string;
    rejectedBy?: string;
    rejectedAt?: string;
    mergedBy?: string;
    mergedAt?: string;
    mergeCommitSha?: string;
  };
  policy: {
    status: SourceReleasePolicyStatus;
    evaluatedAt?: string;
    autoMerge: boolean;
    blockers: string[];
    checks: Array<{
      id: string;
      status: "PASS" | "FAIL";
      evidence: string[];
      required: boolean;
    }>;
  };
  postMergeDeployment?: {
    status: SourceReleasePostMergeDeployStatus;
    deployedAt?: string;
    deployedBy?: string;
    deploymentId?: string;
    deploymentUrl?: string;
    healthUrl?: string;
    readyUrl?: string;
    evidence: string[];
  };
  capabilities: string[];
  nextAction: "write-source" | "open-review" | "approve-review" | "policy-review" | "merge-review" | "tag" | "deploy" | "probe-health" | "rollback" | "promoted" | "failed";
  createdAt: string;
  updatedAt: string;
  actor?: string;
}

export interface SourceReleaseDeployFinalizer {
  schema: "evopilot-source-release-deploy-finalizer/v1";
  id: string;
  loopId: string;
  releaseRunId?: string;
  deployConnectorId: string;
  actor: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  createdAt: string;
  updatedAt: string;
  artifacts: LoopSourceClosure["artifacts"];
  deploymentEnvironment?: string;
  healthUrl?: string;
  readyUrl?: string;
  attempts: number;
  maxAttempts: number;
  evidence: string[];
  lastError?: string;
}

export interface SourceClosurePreflightResult {
  schema: "evopilot-source-closure-preflight/v1";
  loopId: string;
  projectId: string;
  sourceProjectId: string;
  provider: LoopSourceClosure["repositoryProvider"];
  status: "PASS" | "FAIL";
  blockers: string[];
  checks: Array<{
    id: "project-binding" | "provider" | "credentials" | "source-branch" | "deploy-target" | "health-ready";
    status: "PASS" | "FAIL" | "SKIP";
    evidence: string[];
    required: boolean;
  }>;
  capabilities: string[];
  nextAction: "write-source" | "repair-credentials" | "repair-project" | "repair-deploy-target";
  createdAt: string;
}

export interface SourceReleaseRunRepairCandidate {
  schema: "evopilot-source-release-repair-candidate/v1";
  id: string;
  loopId: string;
  runId: string;
  projectId: string;
  sourceProjectId: string;
  provider: LoopSourceClosure["repositoryProvider"];
  status: LoopSourceClosureState;
  reason: string;
  suggestedAction: "repair-source-closure" | "inspect-existing-repair";
  latestForLoop: boolean;
  repaired: boolean;
  supersededByRunId?: string;
  ageSeconds: number;
  evidence: string[];
  createdAt: string;
}

export interface SourceReleaseRunRepairQueueResult {
  schema: "evopilot-source-release-repair-queue/v1";
  repaired: Array<{
    runId: string;
    loopId: string;
    status: LoopSourceClosureState;
    action: "repair-and-execute" | "repair-intent";
    repairedRunId: string;
  }>;
  failed: Array<{
    runId: string;
    loopId: string;
    error: string;
  }>;
  skipped: Array<{
    runId: string;
    loopId: string;
    reason: string;
  }>;
}

export interface LoopStopPolicy {
  maxIterations: number;
  maxDurationSeconds: number;
  requireApprovalForRelease: boolean;
  stopOnRepeatedFailure: number;
}

export interface LoopRetryPolicy {
  maxAttemptsPerNode: number;
  backoffSeconds: number;
  circuitBreakerFailures: number;
}

export interface ExecutorNode {
  id: string;
  type: ExecutorNodeType;
  name: string;
  config: Record<string, unknown>;
}

export interface ExecutorEdge {
  from: string;
  to: string;
  type: "sequence" | "conditional" | "fan-out" | "fan-in";
  condition?: string;
  inputSchemaRef?: string;
  outputSchemaRef?: string;
}

export interface ExecutorGraph {
  schema: "evopilot-executor-graph/v1";
  id: string;
  name: string;
  nodes: ExecutorNode[];
  edges: ExecutorEdge[];
  mode: LoopExecutorMode;
  validation: {
    status: "PASSED" | "FAILED";
    evidence: string[];
  };
  capabilities: {
    typedEdges: boolean;
    conditionalRouting: boolean;
    fanOutFanIn: boolean;
    nestedSubgraphs: boolean;
    schemaValidation: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ExecutorStepResult {
  nodeId: string;
  type: ExecutorNodeType;
  status: "SKIPPED" | "SUCCEEDED" | "FAILED" | "WAITING_APPROVAL";
  startedAt: string;
  completedAt?: string;
  attempt: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  evidence: string[];
  failureSignature?: string;
}

export interface LoopSandboxPolicy {
  runtime: LoopSandboxRuntimeType;
  image?: string;
  namespace?: string;
  credentialScope: "none" | "loop" | "project";
  network: "disabled" | "restricted" | "enabled";
  allowedPaths: string[];
  deniedPaths: string[];
  resourceLimits: {
    cpu: string;
    memoryMb: number;
    pids: number;
  };
}

export interface LoopSandboxEnforcement {
  status: "ENFORCED" | "POLICY_ONLY" | "FAILED";
  runtime: LoopSandboxRuntimeType;
  evidence: string[];
  restrictions: {
    network: LoopSandboxPolicy["network"];
    credentialScope: LoopSandboxPolicy["credentialScope"];
    allowedPaths: string[];
    deniedPaths: string[];
  };
}

export interface LoopSandboxBoundaryProof {
  schema: "evopilot-loop-sandbox-boundary-proof/v1";
  loopId: string;
  runtime: LoopSandboxRuntimeType;
  status: LoopSandboxEnforcement["status"];
  executableBoundary: {
    dockerArgs?: string[];
    k8sManifest?: Record<string, unknown>;
    workspaceMount: string;
    networkMode: string;
    credentialMode: string;
    readOnlyRootFilesystem: boolean;
    resourceLimits: LoopSandboxPolicy["resourceLimits"];
  };
  checks: Array<{
    id: string;
    status: "PASS" | "FAIL" | "WARN";
    evidence: string[];
  }>;
  blocksNonHumanExecutors: boolean;
  createdAt: string;
}

export interface LoopSourceClosure {
  sourceProjectId: string;
  repositoryProvider: ProjectRepositoryProvider | "unknown";
  sourceUrl?: string;
  sourceRoot?: string;
  sourceBranch: string;
  controlPlaneUrl?: string;
  targetVersion?: string;
  releaseStrategy: "none" | "github-push" | "gitlab-merge-request" | "local-git-commit";
  requiredGates: LoopSourceClosureGate[];
  deploymentEnvironment?: string;
  deploymentConnectorId?: string;
  closureState: LoopSourceClosureState;
  gateEvidence: Partial<Record<LoopSourceClosureGate, {
    status: "PENDING" | "PASSED" | "FAILED" | "SKIPPED";
    evidence: string[];
    checkedAt: string;
  }>>;
  artifacts: {
    branch?: string;
    commitSha?: string;
    mergeCommitSha?: string;
    pullRequestUrl?: string;
    pullRequestNumber?: number;
    mergeRequestUrl?: string;
    mergeRequestIid?: number;
    reviewStatus?: SourceReleaseReviewStatus;
    approvedAt?: string;
    approvedBy?: string;
    rejectedAt?: string;
    rejectedBy?: string;
    mergedAt?: string;
    mergedBy?: string;
    policyStatus?: SourceReleasePolicyStatus;
    policyBlockers?: string[];
    policyEvaluatedAt?: string;
    autoMerge?: boolean;
    postMergeDeployStatus?: SourceReleasePostMergeDeployStatus;
    postMergeDeployAt?: string;
    postMergeDeployBy?: string;
    tag?: string;
    deploymentConnectorId?: string;
    deploymentId?: string;
    deploymentUrl?: string;
    deployStatusUrl?: string;
    healthUrl?: string;
    readyUrl?: string;
    executedAt?: string;
    executedBy?: string;
  };
}

export interface ExecutorCoordinationPlan {
  mode: LoopExecutorMode;
  sharedContextKeys: string[];
  nodes: Array<{
    nodeId: string;
    type: ExecutorNodeType;
    adapterId?: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    dependsOn: string[];
  }>;
}

export interface LoopStoreRuntime {
  backend: LoopStoreBackendType;
  dsn?: string;
  durable: boolean;
  lockProvider: "file-lease" | "sqlite-transaction" | "postgres-advisory-lock";
  recovery: "idempotent-replay";
}

export interface LoopTraceSummary {
  id: string;
  loopId: string;
  status: LoopRunStatus;
  currentIteration: number;
  executorStepCount: number;
  failedStepCount: number;
  workerLease?: LoopWorkerLease;
  watchdog: {
    expiredLease: boolean;
    ageSeconds: number;
  };
  cost: {
    estimatedUsd: number;
    totalTokens: number;
  };
  llmUsage: LlmUsageSummary;
  failureSignatures: Array<{
    signature: string;
    count: number;
  }>;
  updatedAt: string;
}

export interface LlmUsageStepSummary {
  loopId: string;
  iteration: number;
  nodeId: string;
  type: ExecutorNodeType;
  status: ExecutorStepResult["status"];
  provider?: string;
  model?: string;
  llmProfileId?: string;
  llmSource?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  creditsConsumed: number;
  creditUnit: "token";
  costUsd: number;
  llmRequestId?: string;
  completedAt?: string;
}

export interface LlmUsageSummary {
  schema: "evopilot-llm-usage-summary/v1";
  scope: string;
  provider?: string;
  model?: string;
  providers: string[];
  models: string[];
  providerCount: number;
  modelCount: number;
  providerModelCount: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  creditsConsumed: number;
  creditUnit: "token";
  costUsd: number;
  steps: LlmUsageStepSummary[];
  updatedAt: string;
}

export interface ProjectProviderModelUsageProjection {
  provider?: string;
  model?: string;
  profileId?: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  creditsConsumed: number;
  creditUnit: "token";
  costUsd: number;
  shareOfWorkspace?: number;
  latestLoopId?: string;
  latestLoopStatus?: LoopRunStatus;
  latestLoopTotalTokens?: number;
  latestLoopProvider?: string;
  latestLoopModel?: string;
  requestId?: string;
  updatedAt: string;
}

export interface ProjectLlmUsageProjection {
  schema: "evopilot-project-llm-usage/v1";
  tenantId: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  configuredLlm?: {
    profileId: string;
    required: boolean;
    provider?: string;
    model?: string;
    status?: string;
    boundAt: string;
  };
  loops: {
    used: number;
    usedWithLlm: number;
    latestLoopId?: string;
    latestLoopStatus?: LoopRunStatus;
    latestLoopTotalTokens?: number;
    latestLoopProvider?: string;
    latestLoopModel?: string;
  };
  llmUsage: LlmUsageSummary;
  providerModelUsage: ProjectProviderModelUsageProjection[];
  evidence: string[];
  evaluatedAt: string;
}

export interface WorkspaceUsageProjection {
  schema: "evopilot-workspace-usage/v1";
  tenantId: string;
  workspaceId: string;
  projects: { used: number; limit: number; remaining: number };
  loops: { used: number; limit: number; remaining: number };
  evidenceGb: { used: number; limit: number; remaining: number };
  range: { label: string };
  projectsWithLlmUsage: number;
  projectUsageCount: number;
  loopsWithLlmUsage: number;
  llmUsage: LlmUsageSummary;
  topProject?: {
    projectId: string;
    projectName: string;
    totalTokens: number;
    latestLoopId?: string;
  };
  projectUsage: ProjectLlmUsageProjection[];
  evidence: string[];
  evaluatedAt: string;
}

export interface ExecutorAdapterExecutionInput {
  node: ExecutorNode;
  loop: LoopRun;
  iterationIndex: number;
  attempt: number;
  previousFailureCount: number;
  forceDecision?: LoopDecision;
  workspaceRoot: string;
  nodeWorkspace: string;
  coordination: ExecutorCoordinationPlan;
  sandbox: LoopSandboxPolicy;
  sandboxEnforcement: LoopSandboxEnforcement;
  now: string;
  llmClient?: LlmTaskClient;
  requireLlm: boolean;
}

export interface ExecutorAdapterExecutionOutput {
  status: ExecutorStepResult["status"];
  output: Record<string, unknown>;
  evidence: string[];
  completedAt?: string;
  failureSignature?: string;
}

export interface ExecutorAdapter {
  id: string;
  nodeType: ExecutorNodeType;
  execute(input: ExecutorAdapterExecutionInput): ExecutorAdapterExecutionOutput | Promise<ExecutorAdapterExecutionOutput>;
}

export interface LoopEvidenceSet {
  id: string;
  loopRunId: string;
  iterationId: string;
  validator: string;
  status: "PASS" | "FAIL" | "BLOCKED";
  evidence: string[];
  artifacts: LoopArtifact[];
  createdAt: string;
}

export interface LoopArtifact {
  id: string;
  type: "plan" | "diff" | "ci-log" | "report" | "approval" | "generic";
  label: string;
  path?: string;
  url?: string;
  createdAt: string;
}

export interface LoopTimelineEvent {
  id: string;
  type: "CREATED" | "STARTED" | "ITERATION" | "EVIDENCE" | "DECISION" | "APPROVAL" | "HEARTBEAT" | "LEASE" | "WATCHDOG" | "REPLAY" | "CANCELLED";
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface LoopWorkerLease {
  workerId: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface LoopWorkerQueueItem {
  loopId: string;
  status: LoopRunStatus;
  objective: string;
  currentIteration: number;
  maxIterations: number;
  claimable: boolean;
  leaseExpired: boolean;
  workerLease?: LoopWorkerLease;
  sideEffectGuard: {
    sourceClosureState: LoopSourceClosureState;
    duplicateSourceClosureBlocked: boolean;
  };
  nextAction: "claim" | "renew" | "wait-approval" | "source-closure" | "blocked";
}

export interface LoopWorkerQueueClaim {
  schema: "evopilot-loop-worker-claim/v1";
  workerId: string;
  claimed?: LoopWorkerQueueItem;
  queue: LoopWorkerQueueItem[];
  evidence: string[];
  createdAt: string;
}

export interface LoopIteration {
  id: string;
  loopRunId: string;
  index: number;
  startedAt: string;
  completedAt?: string;
  executorSteps: ExecutorStepResult[];
  evidenceSetId?: string;
  decision: LoopDecision;
  rationale: string;
  replayOfIterationId?: string;
  contextPatch?: Record<string, unknown>;
  traceId: string;
}

export interface LoopCheckpoint {
  schema: "evopilot-loop-checkpoint/v1";
  id: string;
  loopId: string;
  iterationIndex: number;
  iterationId: string;
  status: LoopRunStatus;
  decision: LoopDecision;
  contextSnapshot: Record<string, unknown>;
  contextPatch?: Record<string, unknown>;
  evidenceSetId?: string;
  executorOutputs: Array<{
    nodeId: string;
    status: ExecutorStepResult["status"];
    output: Record<string, unknown>;
    failureSignature?: string;
  }>;
  replayable: boolean;
  createdAt: string;
}

export interface LoopReplayDiff {
  schema: "evopilot-loop-replay-diff/v1";
  loopId: string;
  fromIteration: number;
  previousIterationId?: string;
  replayIterationId?: string;
  contextChangedKeys: string[];
  executorOutputChanges: Array<{
    nodeId: string;
    beforeStatus?: ExecutorStepResult["status"];
    afterStatus?: ExecutorStepResult["status"];
    beforeOutput?: Record<string, unknown>;
    afterOutput?: Record<string, unknown>;
    changed: boolean;
  }>;
  evidence: string[];
  createdAt: string;
}

export interface LoopStreamEvent {
  schema: "evopilot-loop-stream-event/v1";
  id: string;
  loopId: string;
  type: "timeline" | "executor-step" | "checkpoint" | "worker-lease" | "watchdog" | "cost" | "failure-group" | "replay-diff" | "sandbox-proof" | "executor-graph";
  timestamp: string;
  label: string;
  payload: Record<string, unknown>;
}

export interface LoopTraceTree {
  schema: "evopilot-loop-trace-tree/v1";
  loopId: string;
  root: {
    id: string;
    label: string;
    status: LoopRunStatus;
  };
  nodes: Array<{
    id: string;
    parentId?: string;
    type: "loop" | "iteration" | "executor-step" | "checkpoint" | "worker-lease" | "failure-group" | "replay-diff" | "sandbox-proof" | "executor-graph";
    label: string;
    status: string;
    costUsd?: number;
    tokens?: number;
    evidence: string[];
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: "contains" | "emits" | "replays" | "fails-with" | "guards";
  }>;
  summary: {
    checkpointCount: number;
    eventCount: number;
    failureGroupCount: number;
    replayDiffCount: number;
    sandboxProofStatus: LoopSandboxEnforcement["status"];
  };
  createdAt: string;
}

export interface LoopRun {
  schema: "evopilot-loop-run/v1";
  id: string;
  source: LoopTriggerSource;
  projectId: string;
  tenantId: string;
  workspaceId: string;
  objective: string;
  llm?: LoopLlmSelection;
  status: LoopRunStatus;
  currentIteration: number;
  executorGraphId: string;
  controlPlaneUrl?: string;
  sourceClosure: LoopSourceClosure;
  stopPolicy: LoopStopPolicy;
  retryPolicy: LoopRetryPolicy;
  context: Record<string, unknown>;
  store: LoopStoreRuntime;
  sandbox: LoopSandboxPolicy;
  sandboxEnforcement: LoopSandboxEnforcement;
  coordination: ExecutorCoordinationPlan;
  trace: LoopTraceSummary;
  iterations: LoopIteration[];
  evidenceSets: LoopEvidenceSet[];
  artifacts: LoopArtifact[];
  approvals: Array<{
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    reason: string;
    requestedAt: string;
    decidedAt?: string;
    decidedBy?: string;
  }>;
  workerLease?: LoopWorkerLease;
  timeline: LoopTimelineEvent[];
  createdAt: string;
  updatedAt: string;
}

export type LoopOrchestrationTargetStatus = "PENDING" | "RUNNING" | "WAITING_HUMAN" | "DONE" | "BLOCKED";

export interface LoopOrchestrationTarget {
  id: string;
  title: string;
  layer: "sandbox" | "context" | "harness" | "loop";
  presetId: string;
  objective: string;
  acceptanceCriteria: string[];
  status: LoopOrchestrationTargetStatus;
  loopId?: string;
  nextAction: "create-loop" | "start-loop" | "resume-loop" | "human-approval" | "source-closure" | "configure-source-credentials" | "repair-project" | "repair-deploy-target" | "policy-review" | "done" | "repair";
  evidence: string[];
  externalBlocker?: LoopExternalBlocker;
}

export interface LoopOrchestrationAdvanceResult {
  schema: "evopilot-loop-orchestration-advance/v1";
  target: LoopOrchestrationTarget;
  loop?: LoopRun;
  action: LoopOrchestrationTarget["nextAction"];
  advanced: boolean;
  evidence: string[];
  createdAt: string;
}

export interface LoopOrchestrationAutopilotResult {
  schema: "evopilot-loop-orchestration-autopilot/v1";
  status: "SUCCEEDED" | "BLOCKED" | "FAILED";
  target: LoopOrchestrationTarget;
  loop?: LoopRun;
  releaseRun?: SourceReleaseClosureRun;
  stages: Array<{
    id: "advance" | "iterate" | "human-gate" | "source-preflight" | "external-blocker" | "source-closure" | "safe-auto-merge";
    status: "SUCCEEDED" | "SKIPPED" | "BLOCKED" | "FAILED";
    detail: string;
    evidence: string[];
  }>;
  nextAction: "done" | "human-approval" | "source-closure" | "configure-source-credentials" | "repair-project" | "repair-deploy-target" | "policy-review" | "repair";
  externalBlocker?: LoopExternalBlocker;
  evidence: string[];
  createdAt: string;
}

export interface DiscoverySkillCandidate {
  schema: "evopilot-discovery-skill-candidate/v1";
  id: string;
  projectId: string;
  targetId: string;
  title: string;
  source: "repository" | "trace" | "evaluation" | "production" | "manual";
  confidence: number;
  affectedFiles: string[];
  acceptanceCriteria: string[];
  evidence: string[];
  status: "CANDIDATE" | "ACCEPTED" | "REJECTED" | "CONVERTED";
  createdAt: string;
  updatedAt: string;
}

export interface FindingWorktreeHandoff {
  schema: "evopilot-finding-worktree-handoff/v1";
  id: string;
  findingId: string;
  projectId: string;
  provider: ProjectRepositoryProvider | "unknown";
  workspaceRoot: string;
  sourceBranch: string;
  targetBranch: string;
  allowedPaths: string[];
  validationCommands: string[];
  rollbackRef?: string;
  status: "ALLOCATED" | "RESUMABLE" | "ARCHIVED";
  evidence: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AdversarialEvaluation {
  schema: "evopilot-adversarial-evaluation/v1";
  id: string;
  loopId?: string;
  projectId: string;
  targetId?: string;
  status: "PASS" | "WARN" | "BLOCK";
  checkedInputs: string[];
  missingEvidence: string[];
  failureSignatures: string[];
  suggestedActions: string[];
  evidence: string[];
  createdAt: string;
}

export interface RecurringLoopSchedule {
  schema: "evopilot-recurring-loop-schedule/v1";
  id: string;
  projectId: string;
  targetId: string;
  cadence: "manual" | "hourly" | "daily" | "weekly";
  maxBudgetUsd: number;
  triggerRules: string[];
  status: "ACTIVE" | "PAUSED" | "BLOCKED";
  lastRunAt?: string;
  nextRunAt: string;
  idempotencyKey: string;
  evidence: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LoopMemoryInboxItem {
  schema: "evopilot-loop-memory-inbox-item/v1";
  id: string;
  projectId: string;
  type: "finding" | "evaluation" | "feedback" | "release-learning" | "operator-note";
  title: string;
  body: string;
  status: "NEW" | "ACCEPTED" | "MERGED" | "SNOOZED" | "REJECTED" | "CONVERTED";
  targetId?: string;
  provenance: string[];
  evidence: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LoopGuardrailEvaluation {
  schema: "evopilot-budget-judgment-guardrail/v1";
  id: string;
  loopId: string;
  projectId: string;
  status: "PASS" | "WARN" | "BLOCK";
  budgets: {
    maxCostUsd: number;
    maxTokens: number;
    maxDurationSeconds: number;
    maxChangedFiles: number;
    minConfidence: number;
  };
  actual: {
    costUsd: number;
    tokens: number;
    durationSeconds: number;
    changedFiles: number;
    confidence: number;
  };
  releaseJudgment: "ALLOW" | "HUMAN_REVIEW" | "BLOCK";
  blockers: string[];
  evidence: string[];
  createdAt: string;
}

export interface ProjectEvolutionCursor {
  projectId: string;
  lastProcessedDatasetTriggeredAt?: string;
  lastProcessedDatasetIds: string[];
  lastSuccessfulEvolutionAt?: string;
  lastFailedEvolutionAt?: string;
  cooldownUntil?: string;
  activeBatchId?: string;
  updatedAt: string;
}

export interface OpportunityInsight {
  id: string;
  projectId: string;
  title: string;
  category: string;
  score: number;
  confidence: number;
  source: "self-learning";
  evidenceCount: number;
  datasetIds: string[];
  opportunityIds: string[];
  rationale: string[];
  recommendedAction: string;
  generatedAt: string;
}

export interface ServiceScorecard {
  projectId: string;
  projectName: string;
  score: number;
  level: "优秀" | "良好" | "待改进" | "高风险";
  evidenceCoverage: number;
  governanceCoverage: number;
  deliveryCoverage: number;
  learningCoverage: number;
  checks: Array<{
    name: string;
    status: "PASSED" | "WARN" | "FAILED";
    detail: string;
  }>;
  recommendedAction: string;
  updatedAt: string;
}

export interface SloReport {
  projectId: string;
  targetAvailability: number;
  observedHealth: number;
  errorBudgetRemaining: number;
  latencyViolationCount: number;
  failedReleaseCount: number;
  status: "HEALTHY" | "BURNING" | "EXHAUSTED";
  recommendedAction: string;
  updatedAt: string;
}

export interface GovernancePolicyEvaluation {
  id: string;
  name: string;
  status: "PASSED" | "WARN" | "FAILED";
  severity: "LOW" | "MEDIUM" | "HIGH";
  scope: string;
  rationale: string;
  recommendedAction: string;
  evaluatedAt: string;
}

export interface SupplyChainReport {
  id: string;
  name: string;
  implementation?: string;
  role?: string;
  version?: string;
  image?: string;
  digest?: string;
  runtimeImage?: string;
  runtimeDigest?: string;
  required: boolean;
  sourceUrl: string;
  path: string;
  buildCommand?: string;
  packageArtifacts: string[];
  missingArtifacts: string[];
  status: "READY" | "MISSING" | "INCOMPLETE";
  riskLevel: "LOW" | "HIGH";
  rationale: string;
  recommendedAction: string;
  evaluatedAt: string;
}

export interface CostReport {
  projectId: string;
  totalCost: number;
  totalTokens: number;
  highCostEventCount: number;
  status: "HEALTHY" | "WATCH" | "OVER_BUDGET";
  recommendedAction: string;
  updatedAt: string;
}

export interface ReleaseReadinessReport {
  projectId: string;
  status: "READY" | "NEEDS_APPROVAL" | "BLOCKED";
  score: number;
  recommendedAction: string;
  gates: Array<{
    name: string;
    status: "PASSED" | "WARN" | "FAILED";
    detail: string;
  }>;
  evaluatedAt: string;
}

export interface RolloutStrategyReport {
  projectId: string;
  strategy: "CANARY" | "MANUAL_APPROVAL" | "BLOCKED";
  status: "READY" | "NEEDS_APPROVAL" | "BLOCKED";
  canaryPercent: number;
  rollbackReady: boolean;
  recommendedAction: string;
  gates: Array<{
    name: string;
    status: "PASSED" | "WARN" | "FAILED";
    detail: string;
  }>;
  evaluatedAt: string;
}
