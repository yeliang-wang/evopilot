import { canonicalDigest } from "./governed-evolution.js";

export const GOVERNED_RESOURCE_API_VERSION = "evopilot.io/v1" as const;
export const CAPABILITY_INVENTORY_SCHEMA = "evopilot-suite-capability-inventory/v1" as const;
export const ACTION_PROVIDER_QUALIFICATION_SCHEMA = "evopilot-action-provider-qualification/v1" as const;
export const REMEDIATION_CAMPAIGN_SCHEMA = "evopilot-remediation-campaign/v1" as const;
export const CONVERGENCE_COMPLETION_SCHEMA = "evopilot-suite-convergence-completion/v1" as const;

export type GovernedResourceKind =
  | "CapabilityPack"
  | "LifecycleModule"
  | "PolicyPack"
  | "GovernancePack"
  | "ActionProviderDefinition"
  | "EnvironmentBinding"
  | "ReleaseChannelBinding"
  | "SecretRef"
  | "HumanAuthorityRole"
  | "AgentRuntimeProfile";

export interface GovernedResourceProvenance {
  sourceType: "LEGACY_SUITE" | "NATIVE" | "PROJECT";
  sourceId: string;
  sourceVersion: string;
  sourceDigest: string;
  sourceRef?: string;
}

export interface GovernedResource {
  apiVersion: typeof GOVERNED_RESOURCE_API_VERSION;
  kind: GovernedResourceKind;
  metadata: {
    id: string;
    name: string;
    version: string;
    labels?: Record<string, string>;
  };
  provenance: GovernedResourceProvenance;
  compatibility: {
    runtime: string;
    expert?: string;
  };
  capabilityRefs: string[];
  spec: Record<string, unknown>;
  digest: string;
}

export interface GovernedResourceImpact {
  schema: "evopilot-governed-resource-impact/v1";
  resource: { kind: GovernedResourceKind; id: string; fromVersion: string; toVersion: string };
  changes: Array<{ path: string; before: unknown; after: unknown }>;
  compatibility: "COMPATIBLE_RESOURCE_REVISION" | "RUNTIME_CHANGE_REQUIRED";
  runtimeVersionChangeRequired: boolean;
  expertVersionChangeRequired: boolean;
  activeBindingsRequireRevalidation: boolean;
  rollbackVersion: string;
  digest: string;
}

export interface ActionProviderAction {
  id: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  receipt: "IMMUTABLE_REQUIRED";
  idempotencyKeyRequired: true;
  rollback: "SUPPORTED" | "COMPENSATING_ACTION" | "NOT_APPLICABLE";
  requiredAuthorities: string[];
  credentialRefs: string[];
}

export interface CapabilityInventorySource {
  suiteId: string;
  sourceVersion: string;
  snapshotDigest: string;
  capabilities: Array<{ id: string; description: string; digest: string }>;
}

export interface CapabilityDisposition {
  sourceSuiteId: string;
  capabilityId: string;
  destination: {
    owner: "RUNTIME" | "RESOURCE" | "EXPERT" | "PROJECT" | "HARNESS" | "EXCLUDED";
    ref: string;
    reason?: string;
  };
  validatorIds: string[];
}

export interface CapabilityInventory {
  schema: typeof CAPABILITY_INVENTORY_SCHEMA;
  baselinePolicy: "LATEST_ONLY_NO_HISTORICAL_COMPATIBILITY";
  sources: CapabilityInventorySource[];
  dispositions: CapabilityDisposition[];
  coverage: { total: number; mapped: number; excluded: number; percent: number; unmapped: string[] };
  hiddenFallbackAllowed: false;
  status: "COMPLETE";
  digest: string;
}

export type RemediationFailureClass =
  | "DETERMINISTIC_MECHANICS"
  | "TRANSIENT_INFRA"
  | "HOST_TRANSPORT"
  | "SOURCE_BINDING"
  | "BINDING_OR_PROJECTION"
  | "REPOSITORY_HYGIENE"
  | "PRODUCT_DEFECT_REPAIRABLE"
  | "PRODUCT_SEMANTIC_CHANGE"
  | "AUTHORITY_EXPANSION_REQUIRED"
  | "UNCERTAIN_MUTATION";

export interface RemediationCandidateLineage {
  parentCandidateDigest: string;
  replacementCandidateDigest: string;
  parentSourceDigest: string;
  replacementSourceDigest: string;
  repairDigest: string;
  readinessRefreshed: true;
  credentialLeasesRefreshed: true;
  failedFirstRequired: true;
  fullMatrixRequired: true;
  digest: string;
}

export interface RemediationCampaign {
  schema: typeof REMEDIATION_CAMPAIGN_SCHEMA;
  id: string;
  targetDigest: string;
  bindingDigest: string;
  sourceDigest: string;
  activeCandidateDigest: string;
  state: "ACTIVE" | "WAITING_HUMAN_DECISION" | "HALTED" | "VERIFIED";
  budget: { maxAttempts: number; maxSameFailure: number; maxWallClockMinutes: number; startedAt: string };
  counters: { attempts: number; sameFailure: number };
  lastFailureSignature?: string;
  history: Array<{ sequence: number; action: string; evidenceRef: string; digest: string }>;
  replacementLineage: RemediationCandidateLineage[];
  digest: string;
}

export interface RemediationIncident {
  failureClass: RemediationFailureClass;
  failureSignature: string;
  occurredAt: string;
  deterministicReproduction: boolean;
  withinApprovedTarget: boolean;
  reversible: boolean;
  externalEffect: boolean;
  mutationOutcomeKnown: boolean;
  receiptDigest?: string;
  requiresAuthority?: Array<"SEMANTIC" | "CREDENTIAL" | "DATABASE" | "PRODUCTION" | "DESTRUCTIVE" | "ACCEPTANCE" | "PUBLICATION" | "RELEASE">;
}

export interface RemediationCampaignDecision {
  schema: "evopilot-remediation-campaign-decision/v1";
  campaignDigest: string;
  action: "RESUME_FROM_RECEIPT" | "AUTO_RETRY" | "AUTO_REPAIR_SOURCE" | "HALT" | "HUMAN_DECISION";
  humanRequired: boolean;
  reason: string;
  rerun: "AFFECTED_STAGE" | "FAILED_FIRST_IMPACT_THEN_FULL_MATRIX" | "NONE";
  remainingAttempts: number;
  digest: string;
}

export type CompletionStatus = "PASSED" | "FAILED" | "PENDING" | "STALE" | "WARNING" | "GENERIC" | "UNMAPPED";

export function normalizeGovernedResource(input: unknown): GovernedResource {
  const value = input as Partial<GovernedResource>;
  if (value.apiVersion !== GOVERNED_RESOURCE_API_VERSION) throw new Error("GOVERNED_RESOURCE_API_VERSION_UNSUPPORTED");
  if (!isResourceKind(value.kind)) throw new Error("GOVERNED_RESOURCE_KIND_UNSUPPORTED");
  requireText(value.metadata?.id, "metadata.id");
  requireText(value.metadata?.name, "metadata.name");
  requireSemver(value.metadata?.version, "metadata.version");
  if (!value.spec || typeof value.spec !== "object" || Array.isArray(value.spec)) throw new Error("GOVERNED_RESOURCE_SPEC_INVALID");
  const provenance = value.provenance as GovernedResourceProvenance | undefined;
  if (!provenance || !["LEGACY_SUITE", "NATIVE", "PROJECT"].includes(provenance.sourceType)) throw new Error("GOVERNED_RESOURCE_PROVENANCE_INVALID");
  requireText(provenance.sourceId, "provenance.sourceId");
  requireSemver(provenance.sourceVersion, "provenance.sourceVersion");
  assertDigest(provenance.sourceDigest, "provenance.sourceDigest");
  if (provenance.sourceType === "LEGACY_SUITE" && !/(?:datarig|evopilot)-codex-suite/.test(provenance.sourceId)) throw new Error("GOVERNED_RESOURCE_LEGACY_SOURCE_ID_INVALID");
  requireText(value.compatibility?.runtime, "compatibility.runtime");
  rejectRawSecrets(value);
  const material = {
    apiVersion: GOVERNED_RESOURCE_API_VERSION,
    kind: value.kind,
    metadata: {
      id: value.metadata!.id.trim(),
      name: value.metadata!.name.trim(),
      version: value.metadata!.version,
      ...(value.metadata!.labels ? { labels: sortedRecord(value.metadata!.labels) } : {})
    },
    provenance: { ...provenance },
    compatibility: { ...value.compatibility! },
    capabilityRefs: unique(value.capabilityRefs ?? []),
    spec: value.spec
  };
  if (value.kind === "ActionProviderDefinition") validateActionProviderSpec(value.spec);
  const digest = canonicalDigest(material);
  if (value.digest && value.digest !== digest) throw new Error("GOVERNED_RESOURCE_DIGEST_MISMATCH");
  return { ...material, digest };
}

export function compareGovernedResourceRevisions(fromInput: unknown, toInput: unknown, runtimeVersion: string): GovernedResourceImpact {
  const from = normalizeGovernedResource(fromInput);
  const to = normalizeGovernedResource(toInput);
  if (from.kind !== to.kind || from.metadata.id !== to.metadata.id) throw new Error("GOVERNED_RESOURCE_IDENTITY_MISMATCH");
  if (compareSemver(to.metadata.version, from.metadata.version) <= 0) throw new Error("GOVERNED_RESOURCE_VERSION_NOT_SUCCESSOR");
  const paths = ["metadata.labels", "provenance", "compatibility", "capabilityRefs", "spec"];
  const changes = paths.flatMap((path) => {
    const before = readPath(from, path);
    const after = readPath(to, path);
    return stableJson(before) === stableJson(after) ? [] : [{ path, before, after }];
  });
  const runtimeCompatible = satisfiesRuntimeRange(runtimeVersion, to.compatibility.runtime) && to.spec.breakingChange !== true;
  const material = {
    schema: "evopilot-governed-resource-impact/v1" as const,
    resource: { kind: from.kind, id: from.metadata.id, fromVersion: from.metadata.version, toVersion: to.metadata.version },
    changes,
    compatibility: runtimeCompatible ? "COMPATIBLE_RESOURCE_REVISION" as const : "RUNTIME_CHANGE_REQUIRED" as const,
    runtimeVersionChangeRequired: !runtimeCompatible,
    expertVersionChangeRequired: false,
    activeBindingsRequireRevalidation: changes.length > 0,
    rollbackVersion: from.metadata.version
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function qualifyActionProvider(input: unknown, allowedAuthorities: string[], availableCredentialRefs: string[]) {
  const provider = normalizeGovernedResource(input);
  if (provider.kind !== "ActionProviderDefinition") throw new Error("ACTION_PROVIDER_KIND_REQUIRED");
  const actions = (provider.spec.actions ?? []) as ActionProviderAction[];
  const failures: string[] = [];
  for (const action of actions) {
    for (const authority of action.requiredAuthorities) if (!allowedAuthorities.includes(authority)) failures.push(`authority-not-allowed:${action.id}:${authority}`);
    for (const credentialRef of action.credentialRefs) if (!availableCredentialRefs.includes(credentialRef)) failures.push(`credential-ref-unavailable:${action.id}:${credentialRef}`);
  }
  const material = {
    schema: ACTION_PROVIDER_QUALIFICATION_SCHEMA,
    providerRef: { id: provider.metadata.id, version: provider.metadata.version, digest: provider.digest },
    qualifiedActions: failures.length ? [] : actions.map((action) => action.id).sort(),
    failures: unique(failures),
    status: failures.length ? "REJECTED" as const : "QUALIFIED" as const,
    arbitraryShellAllowed: false as const,
    authorityExpanded: false as const
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function builtInActionProviderDefinitions(): GovernedResource[] {
  const definitions = [
    { id: "local-git", capabilities: ["source.read", "source.patch", "source.commit"], credentialRefs: [] },
    { id: "github", capabilities: ["source.read", "candidate.build", "release.readback"], credentialRefs: ["secret://github/actions"] },
    { id: "gitlab", capabilities: ["source.read", "candidate.build", "release.readback"], credentialRefs: ["secret://gitlab/pipeline"] },
    { id: "npm", capabilities: ["artifact.verify", "release.publish", "release.readback"], credentialRefs: ["secret://npm/publish"] },
    { id: "maven", capabilities: ["artifact.verify", "release.publish", "release.readback"], credentialRefs: ["secret://maven/publish"] },
    { id: "candidate", capabilities: ["candidate.construct", "candidate.handoff"], credentialRefs: [] },
    { id: "artifact-verifier", capabilities: ["artifact.digest", "artifact.signature", "artifact.provenance"], credentialRefs: [] }
  ];
  return definitions.map((definition) => normalizeGovernedResource({
    apiVersion: GOVERNED_RESOURCE_API_VERSION,
    kind: "ActionProviderDefinition",
    metadata: { id: definition.id, name: `${definition.id} typed actions`, version: "1.0.0" },
    provenance: { sourceType: "NATIVE", sourceId: "evopilot-runtime", sourceVersion: "6.0.0", sourceDigest: canonicalDigest({ runtime: "6.0.0", provider: definition.id }) },
    compatibility: { runtime: ">=6.0.0 <7.0.0" },
    capabilityRefs: definition.capabilities,
    spec: {
      execution: "TYPED_ACTIONS_ONLY",
      arbitraryShell: false,
      actions: definition.capabilities.map((id) => ({
        id,
        inputSchema: { type: "object", additionalProperties: false },
        outputSchema: { type: "object", required: ["receiptDigest"] },
        receipt: "IMMUTABLE_REQUIRED",
        idempotencyKeyRequired: true,
        rollback: id.includes("publish") || id.includes("commit") ? "COMPENSATING_ACTION" : "NOT_APPLICABLE",
        requiredAuthorities: id.includes("publish") ? ["release.publish"] : id.includes("commit") ? ["source.commit"] : [],
        credentialRefs: definition.credentialRefs
      }))
    }
  }));
}

export function evaluateGovernancePack(input: {
  pack: unknown;
  bindingDigest: string;
  evidence: Array<{ gateId: string; status: "PASS" | "FAIL" | "PENDING"; digest: string; bindingDigest: string }>;
}) {
  const pack = normalizeGovernedResource(input.pack);
  if (pack.kind !== "GovernancePack") throw new Error("GOVERNANCE_PACK_KIND_REQUIRED");
  assertDigest(input.bindingDigest, "bindingDigest");
  const gates = pack.spec.gates;
  if (!Array.isArray(gates) || !gates.length || gates.some((gate) => typeof gate !== "string" || !gate.trim())) throw new Error("GOVERNANCE_PACK_GATES_REQUIRED");
  const results = unique(gates as string[]).map((gateId) => {
    const matches = input.evidence.filter((item) => item.gateId === gateId);
    const exact = matches.find((item) => item.bindingDigest === input.bindingDigest);
    if (exact) assertDigest(exact.digest, `evidence.${gateId}.digest`);
    const status = !exact ? "MISSING" as const : exact.status;
    return { gateId, status, evidenceDigest: exact?.digest };
  });
  const material = {
    schema: "evopilot-governance-pack-evaluation/v1" as const,
    packRef: { id: pack.metadata.id, version: pack.metadata.version, digest: pack.digest },
    bindingDigest: input.bindingDigest,
    results,
    authorityInferred: false as const,
    status: results.every((item) => item.status === "PASS") ? "PASS" as const : "BLOCKED" as const
  };
  return { ...material, digest: canonicalDigest(material) };
}

export function createCapabilityInventory(input: { sources: CapabilityInventorySource[]; dispositions: CapabilityDisposition[] }): CapabilityInventory {
  const sources = input.sources.map((source) => {
    requireText(source.suiteId, "source.suiteId");
    requireSemver(source.sourceVersion, "source.sourceVersion");
    assertDigest(source.snapshotDigest, "source.snapshotDigest");
    const capabilities = [...source.capabilities].map((capability) => {
      requireText(capability.id, "capability.id");
      requireText(capability.description, "capability.description");
      assertDigest(capability.digest, "capability.digest");
      return { ...capability };
    }).sort((left, right) => compareText(left.id, right.id));
    if (new Set(capabilities.map((item) => item.id)).size !== capabilities.length) throw new Error(`CAPABILITY_INVENTORY_DUPLICATE_SOURCE_CAPABILITY:${source.suiteId}`);
    return { ...source, capabilities };
  }).sort((left, right) => compareText(left.suiteId, right.suiteId));
  const expected = sources.flatMap((source) => source.capabilities.map((capability) => `${source.suiteId}:${capability.id}`));
  const dispositions = [...input.dispositions].map((item) => {
    const key = `${item.sourceSuiteId}:${item.capabilityId}`;
    if (!expected.includes(key)) throw new Error(`CAPABILITY_DISPOSITION_UNKNOWN:${key}`);
    if (!item.destination.ref.trim()) throw new Error(`CAPABILITY_DISPOSITION_REF_REQUIRED:${key}`);
    if (item.destination.owner === "EXCLUDED" && !item.destination.reason?.trim()) throw new Error(`CAPABILITY_DISPOSITION_EXCLUSION_REASON_REQUIRED:${key}`);
    if (item.destination.owner !== "EXCLUDED" && !item.validatorIds.length) throw new Error(`CAPABILITY_DISPOSITION_VALIDATOR_REQUIRED:${key}`);
    if (/(?:\.codex\/skills|codex-suite\/|legacy-suite-fallback)/i.test(item.destination.ref)) throw new Error(`CAPABILITY_DISPOSITION_HIDDEN_FALLBACK:${key}`);
    return { ...item, validatorIds: unique(item.validatorIds) };
  }).sort((left, right) => compareText(`${left.sourceSuiteId}:${left.capabilityId}`, `${right.sourceSuiteId}:${right.capabilityId}`));
  const keys = dispositions.map((item) => `${item.sourceSuiteId}:${item.capabilityId}`);
  if (new Set(keys).size !== keys.length) throw new Error("CAPABILITY_DISPOSITION_DUPLICATE");
  const unmapped = expected.filter((key) => !keys.includes(key));
  if (unmapped.length) throw new Error(`CAPABILITY_INVENTORY_UNMAPPED:${unmapped.join(",")}`);
  const material = {
    schema: CAPABILITY_INVENTORY_SCHEMA,
    baselinePolicy: "LATEST_ONLY_NO_HISTORICAL_COMPATIBILITY" as const,
    sources,
    dispositions,
    coverage: { total: expected.length, mapped: keys.length, excluded: dispositions.filter((item) => item.destination.owner === "EXCLUDED").length, percent: expected.length ? 100 : 0, unmapped: [] as string[] },
    hiddenFallbackAllowed: false as const,
    status: "COMPLETE" as const
  };
  if (!material.coverage.total) throw new Error("CAPABILITY_INVENTORY_EMPTY");
  return { ...material, digest: canonicalDigest(material) };
}

export function createRemediationCampaign(input: Omit<RemediationCampaign, "schema" | "state" | "counters" | "history" | "replacementLineage" | "digest">): RemediationCampaign {
  for (const [field, value] of Object.entries({ targetDigest: input.targetDigest, bindingDigest: input.bindingDigest, sourceDigest: input.sourceDigest, activeCandidateDigest: input.activeCandidateDigest })) assertDigest(value, field);
  requireText(input.id, "campaign.id");
  if (input.budget.maxAttempts < 1 || input.budget.maxSameFailure < 1 || input.budget.maxWallClockMinutes < 1 || !Number.isFinite(Date.parse(input.budget.startedAt))) throw new Error("REMEDIATION_BUDGET_INVALID");
  const material = { ...input, schema: REMEDIATION_CAMPAIGN_SCHEMA, state: "ACTIVE" as const, counters: { attempts: 0, sameFailure: 0 }, history: [] as RemediationCampaign["history"], replacementLineage: [] as RemediationCandidateLineage[] };
  return { ...material, digest: canonicalDigest(material) };
}

export function decideRemediationCampaign(campaignInput: RemediationCampaign, incident: RemediationIncident): RemediationCampaignDecision {
  const campaign = verifyCampaign(campaignInput);
  requireText(incident.failureSignature, "incident.failureSignature");
  if (!Number.isFinite(Date.parse(incident.occurredAt))) throw new Error("REMEDIATION_OCCURRED_AT_INVALID");
  if (incident.receiptDigest) assertDigest(incident.receiptDigest, "incident.receiptDigest");
  const elapsed = Date.parse(incident.occurredAt) - Date.parse(campaign.budget.startedAt);
  const sameFailure = campaign.lastFailureSignature === incident.failureSignature ? campaign.counters.sameFailure + 1 : 1;
  const remainingAttempts = Math.max(0, campaign.budget.maxAttempts - campaign.counters.attempts);
  let action: RemediationCampaignDecision["action"] = "HALT";
  let humanRequired = false;
  let reason = "Campaign cannot safely continue.";
  let rerun: RemediationCampaignDecision["rerun"] = "NONE";
  const authority = incident.requiresAuthority ?? [];
  const semanticStop = ["PRODUCT_SEMANTIC_CHANGE", "AUTHORITY_EXPANSION_REQUIRED", "UNCERTAIN_MUTATION"].includes(incident.failureClass);
  if (authority.length || semanticStop) {
    action = "HUMAN_DECISION";
    humanRequired = true;
    reason = authority.length ? `Owning-human authority required: ${authority.sort().join(",")}.` : `Failure class ${incident.failureClass} requires an exact human decision.`;
  } else if (elapsed > campaign.budget.maxWallClockMinutes * 60_000 || remainingAttempts === 0 || sameFailure > campaign.budget.maxSameFailure) {
    action = "HALT";
    reason = elapsed > campaign.budget.maxWallClockMinutes * 60_000 ? "Wall-clock budget exhausted." : remainingAttempts === 0 ? "Attempt budget exhausted." : "Same-failure circuit breaker opened.";
  } else if (incident.receiptDigest && incident.mutationOutcomeKnown) {
    action = "RESUME_FROM_RECEIPT";
    reason = "An immutable receipt proves the prior mutation outcome; replay is suppressed.";
    rerun = "AFFECTED_STAGE";
  } else if (["TRANSIENT_INFRA", "HOST_TRANSPORT", "SOURCE_BINDING", "BINDING_OR_PROJECTION"].includes(incident.failureClass) && incident.mutationOutcomeKnown) {
    action = "AUTO_RETRY";
    reason = "Retryable technical failure remains inside the bound campaign and attempt budget.";
    rerun = "AFFECTED_STAGE";
  } else if (["DETERMINISTIC_MECHANICS", "REPOSITORY_HYGIENE", "PRODUCT_DEFECT_REPAIRABLE"].includes(incident.failureClass) && incident.deterministicReproduction && incident.withinApprovedTarget && incident.reversible && !incident.externalEffect && incident.mutationOutcomeKnown) {
    action = "AUTO_REPAIR_SOURCE";
    reason = "Deterministic repair is reversible and inside the approved Target; a changed product repair must form a replacement Candidate.";
    rerun = "FAILED_FIRST_IMPACT_THEN_FULL_MATRIX";
  }
  const material = { schema: "evopilot-remediation-campaign-decision/v1" as const, campaignDigest: campaign.digest, action, humanRequired, reason, rerun, remainingAttempts };
  return { ...material, digest: canonicalDigest(material) };
}

export function createReplacementCandidateLineage(input: Omit<RemediationCandidateLineage, "readinessRefreshed" | "credentialLeasesRefreshed" | "failedFirstRequired" | "fullMatrixRequired" | "digest">): RemediationCandidateLineage {
  for (const [field, value] of Object.entries(input)) assertDigest(value, field);
  if (input.parentCandidateDigest === input.replacementCandidateDigest || input.parentSourceDigest === input.replacementSourceDigest) throw new Error("REMEDIATION_REPLACEMENT_MUST_CHANGE_BYTES");
  const material = { ...input, readinessRefreshed: true as const, credentialLeasesRefreshed: true as const, failedFirstRequired: true as const, fullMatrixRequired: true as const };
  return { ...material, digest: canonicalDigest(material) };
}

export function recordRemediationDecision(campaignInput: RemediationCampaign, incident: RemediationIncident, decision: RemediationCampaignDecision, evidenceRef: string, replacement?: RemediationCandidateLineage): RemediationCampaign {
  const campaign = verifyCampaign(campaignInput);
  if (decision.campaignDigest !== campaign.digest) throw new Error("REMEDIATION_DECISION_CAMPAIGN_DRIFT");
  requireText(evidenceRef, "evidenceRef");
  const sameFailure = campaign.lastFailureSignature === incident.failureSignature ? campaign.counters.sameFailure + 1 : 1;
  const sequence = campaign.history.length + 1;
  const eventMaterial = { sequence, action: decision.action, evidenceRef, incidentDigest: canonicalDigest(incident), decisionDigest: decision.digest };
  const event = { sequence, action: decision.action, evidenceRef, digest: canonicalDigest(eventMaterial) };
  const state = decision.action === "HUMAN_DECISION" ? "WAITING_HUMAN_DECISION" as const : decision.action === "HALT" ? "HALTED" as const : "ACTIVE" as const;
  const material = {
    ...campaign,
    digest: undefined,
    state,
    counters: { attempts: campaign.counters.attempts + (decision.action === "AUTO_REPAIR_SOURCE" || decision.action === "AUTO_RETRY" ? 1 : 0), sameFailure },
    lastFailureSignature: incident.failureSignature,
    history: [...campaign.history, event],
    replacementLineage: replacement ? [...campaign.replacementLineage, replacement] : campaign.replacementLineage,
    ...(replacement ? { sourceDigest: replacement.replacementSourceDigest, activeCandidateDigest: replacement.replacementCandidateDigest } : {})
  };
  return { ...material, digest: canonicalDigest(material) } as RemediationCampaign;
}

export function transitionRemediationCampaign(campaignInput: RemediationCampaign, input: { action: "RESUME" | "CANCEL" | "VERIFY"; campaignDigest: string; actor: string; evidenceRef: string }): RemediationCampaign {
  const campaign = verifyCampaign(campaignInput);
  if (input.campaignDigest !== campaign.digest) throw new Error("REMEDIATION_TRANSITION_CAMPAIGN_DRIFT");
  requireText(input.actor, "transition.actor");
  requireText(input.evidenceRef, "transition.evidenceRef");
  if (input.action === "RESUME" && campaign.state !== "WAITING_HUMAN_DECISION") throw new Error("REMEDIATION_RESUME_NOT_WAITING");
  if (input.action === "VERIFY" && campaign.state !== "ACTIVE") throw new Error("REMEDIATION_VERIFY_NOT_ACTIVE");
  if (input.action === "CANCEL" && campaign.state === "VERIFIED") throw new Error("REMEDIATION_CANCEL_VERIFIED");
  const state = input.action === "RESUME" ? "ACTIVE" as const : input.action === "VERIFY" ? "VERIFIED" as const : "HALTED" as const;
  const sequence = campaign.history.length + 1;
  const eventMaterial = { sequence, action: input.action, evidenceRef: input.evidenceRef, actor: input.actor, priorCampaignDigest: campaign.digest };
  const event = { sequence, action: input.action, evidenceRef: input.evidenceRef, digest: canonicalDigest(eventMaterial) };
  const material = { ...campaign, digest: undefined, state, history: [...campaign.history, event] };
  return { ...material, digest: canonicalDigest(material) } as RemediationCampaign;
}

export function aggregateConvergenceCompletion(input: {
  inventory: CapabilityInventory;
  current: Array<{ id: string; status: CompletionStatus; evidenceRefs: string[] }>;
  inherited: Array<{ id: string; status: CompletionStatus; evidenceRefs: string[] }>;
  e2e: Array<{ id: string; status: CompletionStatus; evidenceRefs: string[] }>;
  impactClosurePercent: number;
  exactInstalledCandidatePairVerified: boolean;
  noRegression: "PASSED" | "FAILED" | "PENDING";
  legacySuiteInvocationCount: number;
}) {
  if (input.inventory.status !== "COMPLETE" || input.inventory.coverage.percent !== 100) throw new Error("CONVERGENCE_CAPABILITY_INVENTORY_INCOMPLETE");
  const all = [...input.current, ...input.inherited, ...input.e2e];
  const counts = Object.fromEntries(["PASSED", "FAILED", "PENDING", "STALE", "WARNING", "GENERIC", "UNMAPPED"].map((status) => [status.toLowerCase(), all.filter((item) => item.status === status).length])) as Record<string, number>;
  const missingEvidence = all.filter((item) => item.status === "PASSED" && !item.evidenceRefs.length).map((item) => item.id);
  const pass = all.length > 0 && counts.passed === all.length && missingEvidence.length === 0 && input.impactClosurePercent === 100 && input.exactInstalledCandidatePairVerified && input.noRegression === "PASSED" && input.legacySuiteInvocationCount === 0;
  const material = {
    schema: CONVERGENCE_COMPLETION_SCHEMA,
    total: all.length,
    counts,
    missingEvidence,
    capabilityInventoryCoverage: input.inventory.coverage.percent,
    impactClosurePercent: input.impactClosurePercent,
    exactInstalledCandidatePairVerified: input.exactInstalledCandidatePairVerified,
    noRegression: input.noRegression,
    legacySuiteInvocationCount: input.legacySuiteInvocationCount,
    status: pass ? "PASSED" as const : "BLOCKED" as const
  };
  return { ...material, digest: canonicalDigest(material) };
}

function validateActionProviderSpec(spec: Record<string, unknown>): void {
  if (spec.execution !== "TYPED_ACTIONS_ONLY" || spec.arbitraryShell !== false) throw new Error("ACTION_PROVIDER_EXECUTION_BOUNDARY_INVALID");
  const actions = spec.actions;
  if (!Array.isArray(actions) || !actions.length) throw new Error("ACTION_PROVIDER_ACTIONS_REQUIRED");
  const ids: string[] = [];
  for (const raw of actions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("ACTION_PROVIDER_ACTION_INVALID");
    const action = raw as Partial<ActionProviderAction>;
    requireText(action.id, "action.id");
    ids.push(action.id!);
    if (!action.inputSchema || !action.outputSchema) throw new Error(`ACTION_PROVIDER_SCHEMAS_REQUIRED:${action.id}`);
    if (action.receipt !== "IMMUTABLE_REQUIRED" || action.idempotencyKeyRequired !== true) throw new Error(`ACTION_PROVIDER_RECEIPT_INVALID:${action.id}`);
    if (!["SUPPORTED", "COMPENSATING_ACTION", "NOT_APPLICABLE"].includes(String(action.rollback))) throw new Error(`ACTION_PROVIDER_ROLLBACK_INVALID:${action.id}`);
    if (!Array.isArray(action.requiredAuthorities) || !Array.isArray(action.credentialRefs)) throw new Error(`ACTION_PROVIDER_AUTHORITY_OR_CREDENTIAL_REFS_INVALID:${action.id}`);
    for (const ref of action.credentialRefs) if (!/^secret:\/\/[A-Za-z0-9._/-]+$/.test(ref)) throw new Error(`ACTION_PROVIDER_CREDENTIAL_REF_INVALID:${action.id}`);
  }
  if (new Set(ids).size !== ids.length) throw new Error("ACTION_PROVIDER_ACTION_DUPLICATE");
}

function verifyCampaign(value: RemediationCampaign): RemediationCampaign {
  if (value.schema !== REMEDIATION_CAMPAIGN_SCHEMA || value.digest !== canonicalDigest({ ...value, digest: undefined })) throw new Error("REMEDIATION_CAMPAIGN_DIGEST_DRIFT");
  return value;
}

function satisfiesRuntimeRange(version: string, range: string): boolean {
  requireSemver(version, "runtimeVersion");
  const clauses = range.trim().split(/\s+/).filter(Boolean);
  return clauses.every((clause) => {
    const match = clause.match(/^(>=|>|<=|<|=)?(\d+\.\d+\.\d+)$/);
    if (!match) throw new Error("GOVERNED_RESOURCE_RUNTIME_RANGE_INVALID");
    const cmp = compareSemver(version, match[2]);
    return match[1] === ">=" ? cmp >= 0 : match[1] === ">" ? cmp > 0 : match[1] === "<=" ? cmp <= 0 : match[1] === "<" ? cmp < 0 : cmp === 0;
  });
}

function compareSemver(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function isResourceKind(value: unknown): value is GovernedResourceKind {
  return ["CapabilityPack", "LifecycleModule", "PolicyPack", "GovernancePack", "ActionProviderDefinition", "EnvironmentBinding", "ReleaseChannelBinding", "SecretRef", "HumanAuthorityRole", "AgentRuntimeProfile"].includes(String(value));
}

function rejectRawSecrets(value: unknown, path = "resource"): void {
  if (Array.isArray(value)) return value.forEach((item, index) => rejectRawSecrets(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/(?:password|token|api[-_]?key|private[-_]?key|credentialValue|secretValue)/i.test(key)) throw new Error(`GOVERNED_RESOURCE_RAW_SECRET_FORBIDDEN:${path}.${key}`);
    rejectRawSecrets(child, `${path}.${key}`);
  }
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
}

function requireText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`FIELD_REQUIRED:${field}`);
}

function requireSemver(value: unknown, field: string): asserts value is string {
  requireText(value, field);
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value)) throw new Error(`SEMVER_REQUIRED:${field}`);
}

function assertDigest(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`DIGEST_INVALID:${field}`);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))].sort();
}

function sortedRecord(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareText(left, right)));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined).sort(([left], [right]) => compareText(left, right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
