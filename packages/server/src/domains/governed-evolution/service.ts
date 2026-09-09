import {
  activateAutomationRule,
  automationRuleApplies,
  canonicalDigest,
  composeHarnessAndLifecycle,
  createHarnessExecutionBinding,
  createHumanInteractionMessage,
  decideRecovery,
  discoverEvolutionProject,
  compareEvolutionProjectDefinitions,
  normalizeEvolutionProjectDefinition,
  proposeAutomationRule,
  resolvePublishedHarness,
  revalidateHarnessExecutionBinding,
  type AutomationRule,
  type AutomationRuleProposal,
  type EvolutionProjectDefinition,
  type GoalTargetContext,
  type HarnessExecutionBinding,
  type HarnessExecutionCurrentState,
  type HumanInteractionMessage,
  type PublishedHarnessCandidate,
  type RecoveryContext,
  type RecoveryDecision
} from "@evopilot/core";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { LifecycleRevision } from "../lifecycle/index.js";

export interface GovernedEvolutionPlanInput {
  projectDefinitionId: string;
  projectDefinitionVersion?: string;
  goalTarget: GoalTargetContext;
  candidates: PublishedHarnessCandidate[];
  lifecycle: LifecycleRevision;
  policyDigest: string;
  providerDigest: string;
  environmentDigest: string;
  hostDigest: string;
  runtimeDigest: string;
  authorityDigest: string;
  evidenceDigest: string;
}

export interface GovernedEvolutionScope {
  tenantId: string;
  workspaceId: string;
}

export interface GovernedEvolutionPlan {
  schema: "evopilot-governed-evolution-plan/v1";
  status: "READY";
  projectDefinition: EvolutionProjectDefinition;
  match: ReturnType<typeof resolvePublishedHarness>;
  composition: ReturnType<typeof composeHarnessAndLifecycle>;
  binding: HarnessExecutionBinding;
  digest: string;
}

export class GovernedEvolutionService {
  private readonly projectDefinitionsDir: string;
  private readonly bindingsDir: string;
  private readonly proposalDir: string;
  private readonly rulesDir: string;
  private readonly activeDefinitionsDir: string;
  private readonly recoveryEventsDir: string;

  constructor(dataRoot: string) {
    this.projectDefinitionsDir = path.join(dataRoot, "evolution-project-definitions");
    this.bindingsDir = path.join(dataRoot, "harness-execution-bindings");
    this.proposalDir = path.join(dataRoot, "automation-registry", "proposals");
    this.rulesDir = path.join(dataRoot, "automation-registry", "rules");
    this.activeDefinitionsDir = path.join(dataRoot, "evolution-project-definitions-active");
    this.recoveryEventsDir = path.join(dataRoot, "automation-registry", "recovery-events");
    for (const directory of [this.projectDefinitionsDir, this.bindingsDir, this.proposalDir, this.rulesDir, this.activeDefinitionsDir, this.recoveryEventsDir]) fs.mkdirSync(directory, { recursive: true });
  }

  registerProjectDefinition(input: Omit<EvolutionProjectDefinition, "digest"> & { digest?: string }, scope?: GovernedEvolutionScope): EvolutionProjectDefinition {
    const definition = normalizeEvolutionProjectDefinition(input);
    const target = this.projectDefinitionPath(definition.metadata.id, definition.metadata.version, scope);
    if (fs.existsSync(target)) {
      const existing = this.readJson<EvolutionProjectDefinition>(target);
      if (existing.digest === definition.digest) return existing;
      throw new Error("EVOLUTION_PROJECT_VERSION_IMMUTABLE_CONFLICT");
    }
    this.atomicWrite(target, definition);
    const activePath = path.join(this.scopedDirectory(this.activeDefinitionsDir, scope), `${safeSegment(definition.metadata.id)}.json`);
    if (!fs.existsSync(activePath)) this.writeActiveProjectDefinition(definition, scope, "initial-registration");
    return definition;
  }

  discoverProject(input: Record<string, unknown>) {
    return discoverEvolutionProject(input);
  }

  listProjectDefinitions(scope?: GovernedEvolutionScope): EvolutionProjectDefinition[] {
    return this.readAll<EvolutionProjectDefinition>(this.scopedDirectory(this.projectDefinitionsDir, scope));
  }

  readProjectDefinition(id: string, version?: string, scope?: GovernedEvolutionScope): EvolutionProjectDefinition | undefined {
    const safeId = safeSegment(id);
    const candidates = this.listProjectDefinitions(scope).filter((item) => item.metadata.id === safeId);
    if (version) return candidates.find((item) => item.metadata.version === version);
    const activePath = path.join(this.scopedDirectory(this.activeDefinitionsDir, scope), `${safeId}.json`);
    if (fs.existsSync(activePath)) {
      const active = this.readJson<{ version: string; definitionDigest: string }>(activePath);
      const selected = candidates.find((item) => item.metadata.version === active.version && item.digest === active.definitionDigest);
      if (!selected) throw new Error(`EVOLUTION_PROJECT_ACTIVE_DEFINITION_DRIFT: ${id}`);
      return selected;
    }
    return candidates.sort((left, right) => compareVersions(right.metadata.version, left.metadata.version))[0];
  }

  compareProjectDefinitionVersions(id: string, fromVersion: string, toVersion: string, scope?: GovernedEvolutionScope) {
    const from = this.readProjectDefinition(id, fromVersion, scope);
    const to = this.readProjectDefinition(id, toVersion, scope);
    if (!from || !to) throw new Error(`EVOLUTION_PROJECT_DEFINITION_NOT_FOUND: ${id}`);
    const affectedBindings = this.readAll<HarnessExecutionBinding>(this.scopedDirectory(this.bindingsDir, scope))
      .filter((binding) => binding.projectDefinitionRef.id === id && binding.projectDefinitionRef.version === fromVersion)
      .map((binding) => binding.digest);
    return compareEvolutionProjectDefinitions(from, to, affectedBindings);
  }

  activateProjectDefinitionVersion(id: string, version: string, actor: string, evidenceRef: string, scope?: GovernedEvolutionScope, mode: "activate" | "rollback" = "activate") {
    if (!actor.trim() || !evidenceRef.trim()) throw new Error("EVOLUTION_PROJECT_ACTIVATION_EVIDENCE_REQUIRED");
    const definition = this.readProjectDefinition(id, version, scope);
    if (!definition) throw new Error(`EVOLUTION_PROJECT_DEFINITION_NOT_FOUND: ${id}@${version}`);
    return this.writeActiveProjectDefinition(definition, scope, mode === "rollback" ? "explicit-rollback" : "explicit-activation", actor, evidenceRef);
  }

  plan(input: GovernedEvolutionPlanInput, scope?: GovernedEvolutionScope): GovernedEvolutionPlan {
    const projectDefinition = this.readProjectDefinition(input.projectDefinitionId, input.projectDefinitionVersion, scope);
    if (!projectDefinition) throw new Error(`EVOLUTION_PROJECT_DEFINITION_NOT_FOUND: ${input.projectDefinitionId}`);
    if (input.goalTarget.projectId !== projectDefinition.metadata.id) throw new Error("EVOLUTION_PROJECT_GOAL_TARGET_MISMATCH");
    const match = resolvePublishedHarness({ project: projectDefinition, goalTarget: input.goalTarget, candidates: input.candidates });
    if (match.status !== "MATCHED" || !match.selected) throw new Error(`HARNESS_MATCH_${match.status}: ${match.reason}`);
    const obligations = input.lifecycle.definition.obligations ?? {};
    const composition = composeHarnessAndLifecycle(match.selected.bundle, {
      lifecycleId: input.lifecycle.ref.id,
      lifecycleVersion: input.lifecycle.ref.version,
      lifecycleDigest: input.lifecycle.digest,
      requiredEvidence: obligations.requiredEvidence ?? [],
      validators: obligations.validators ?? [],
      constraints: obligations.constraints ?? [],
      capabilities: input.lifecycle.definition.capabilities ?? [],
      requestedPermissions: obligations.requestedPermissions ?? [],
      disabledHarnessEvidence: obligations.disabledHarnessEvidence,
      disabledHarnessValidators: obligations.disabledHarnessValidators,
      weakenedHarnessConstraints: obligations.weakenedHarnessConstraints
    });
    if (composition.status !== "COMPOSED") throw new Error(`HARNESS_LIFECYCLE_CONFLICT: ${composition.conflicts.join(", ")}`);
    const binding = createHarnessExecutionBinding({
      projectDefinition,
      goalTarget: input.goalTarget,
      match,
      composition,
      policyDigest: input.policyDigest,
      providerDigest: input.providerDigest,
      environmentDigest: input.environmentDigest,
      hostDigest: input.hostDigest,
      runtimeDigest: input.runtimeDigest,
      authorityDigest: input.authorityDigest,
      evidenceDigest: input.evidenceDigest
    });
    this.writeBinding(binding, scope);
    const material = { schema: "evopilot-governed-evolution-plan/v1" as const, status: "READY" as const, projectDefinition, match, composition, binding };
    return { ...material, digest: canonicalDigest(material) };
  }

  readBinding(digest: string, scope?: GovernedEvolutionScope): HarnessExecutionBinding | undefined {
    if (!/^sha256:[a-f0-9]{64}$/.test(digest)) return undefined;
    const target = path.join(this.scopedDirectory(this.bindingsDir, scope), `${digest.slice("sha256:".length)}.json`);
    return fs.existsSync(target) ? this.readJson<HarnessExecutionBinding>(target) : undefined;
  }

  revalidate(bindingDigest: string, current: HarnessExecutionCurrentState, scope?: GovernedEvolutionScope) {
    const binding = this.readBinding(bindingDigest, scope);
    if (!binding) throw new Error(`HARNESS_EXECUTION_BINDING_NOT_FOUND: ${bindingDigest}`);
    return revalidateHarnessExecutionBinding(binding, current);
  }

  assertLifecycleBoundary(input: {
    bindingDigest: string;
    checkpoint: "start" | "resume" | "retry" | "loop-iteration";
    projectId: string;
    goalId?: string;
    targetId?: string;
    lifecycleDigest: string;
    policyDigest: string;
    providerDigest?: string;
    environmentDigest?: string;
    authorityDigest?: string;
    runtimeDigest: string;
    evidenceDigest: string;
    harnessBundle: { id: string; version: string; digest: string; catalogId?: string };
    hostDigest: string;
    currentState?: HarnessExecutionCurrentState;
  }, scope?: GovernedEvolutionScope) {
    const binding = this.readBinding(input.bindingDigest, scope);
    if (!binding) throw new Error(`HARNESS_EXECUTION_BINDING_NOT_FOUND: ${input.bindingDigest}`);
    if (canonicalDigest({ ...binding, digest: undefined }) !== binding.digest) throw new Error("HARNESS_EXECUTION_BINDING_DIGEST_DRIFT");
    const drift: string[] = [];
    compareBoundary("projectId", binding.projectDefinitionRef.id, input.projectId, drift);
    compareBoundary("goalId", binding.goalTargetRef.goalId, input.goalId, drift);
    compareBoundary("targetId", binding.goalTargetRef.targetId, input.targetId, drift);
    compareBoundary("lifecycleDigest", binding.lifecycleRef.digest, input.lifecycleDigest, drift);
    compareBoundary("policyDigest", binding.policyDigest, input.policyDigest, drift);
    compareBoundary("providerDigest", binding.providerDigest, input.providerDigest, drift);
    compareBoundary("environmentDigest", binding.environmentDigest, input.environmentDigest, drift);
    compareBoundary("authorityDigest", binding.authorityDigest, input.authorityDigest, drift);
    compareBoundary("runtimeDigest", binding.runtimeDigest, input.runtimeDigest, drift);
    compareBoundary("evidenceDigest", binding.evidenceDigest, input.evidenceDigest, drift);
    compareBoundary("hostDigest", binding.hostDigest, input.hostDigest, drift);
    compareBoundary("bundleId", binding.bundleRef.id, input.harnessBundle.id, drift);
    compareBoundary("bundleVersion", binding.bundleRef.version, input.harnessBundle.version, drift);
    compareBoundary("bundleDigest", binding.bundleRef.digest, input.harnessBundle.digest, drift);
    if (input.harnessBundle.catalogId) compareBoundary("catalogId", binding.catalogId, input.harnessBundle.catalogId, drift);
    const definition = this.readProjectDefinition(binding.projectDefinitionRef.id, binding.projectDefinitionRef.version, scope);
    compareBoundary("projectDefinitionDigest", binding.projectDefinitionDigest, definition?.digest, drift);
    if (input.currentState) {
      const current = revalidateHarnessExecutionBinding(binding, input.currentState);
      drift.push(...current.drift.map((item) => `current.${item}`));
    }
    if (drift.length) throw new Error(`HARNESS_EXECUTION_BINDING_DRIFT: ${drift.join(",")}`);
    return {
      schema: "evopilot-harness-execution-boundary-check/v1" as const,
      status: "VALID" as const,
      checkpoint: input.checkpoint,
      bindingDigest: binding.digest,
      closure: input.currentState ? "LIVE_IMMUTABLE_CLOSURE" as const : "BOUND_RECORD" as const,
      evidence: [
        `checkpoint=${input.checkpoint}`,
        `binding=${binding.digest}`,
        `registry=${binding.registryDigest}`,
        `catalog=${binding.catalogDigest}`,
        `profile=${binding.profileRef.digest}`,
        `bundle=${binding.bundleRef.digest}`,
        `components=${canonicalDigest(binding.bundleRef.componentDigests)}`
      ],
      digest: canonicalDigest({ checkpoint: input.checkpoint, bindingDigest: binding.digest, currentState: input.currentState })
    };
  }

  decideRecovery(input: RecoveryContext, scope?: GovernedEvolutionScope): RecoveryDecision {
    const active = this.listAutomationRules(scope).find((rule) => automationRuleApplies(rule, {
      failureSignature: input.failureSignature,
      failureClass: input.failureClass,
      mutationReceipt: input.mutationReceipt,
      identicalInputs: input.identicalInputs,
      reversible: input.reversible,
      externalEffect: input.externalEffect,
      projectId: input.projectId,
      lifecycleId: input.lifecycleId,
      actionId: input.actionId,
      hostId: input.hostId,
      now: new Date().toISOString()
    }));
    if (active && input.attempt < Math.min(active.maxAttempts, input.maxAttempts)) {
      const material = {
        schema: "evopilot-recovery-decision/v1" as const,
        action: active.strategy === "REPAIR_THEN_RETRY" ? "AUTO_REPAIR" as const : active.strategy === "RESUME_FROM_RECEIPT" ? "RESUME_FROM_RECEIPT" as const : "AUTO_RETRY" as const,
        humanRequired: false,
        reason: `Active Automation Registry rule ${active.id}@${active.revision} applies.`,
        remainingBudget: Math.max(0, Math.min(active.maxAttempts, input.maxAttempts) - input.attempt),
        bindingDigest: input.bindingDigest
      };
      const decision = { ...material, ruleRef: { id: active.id, revision: active.revision, digest: active.digest }, digest: canonicalDigest({ ...material, ruleRef: { id: active.id, revision: active.revision, digest: active.digest } }) };
      this.recordRecoveryDecision(input, decision, scope);
      return decision;
    }
    let decision = decideRecovery(input);
    if (decision.action === "PROPOSE_AUTOMATION_RULE") {
      const scopeBinding = { projectId: input.projectId, lifecycleId: input.lifecycleId, actionId: input.actionId, hostId: input.hostId };
      const proposalIdentity = canonicalDigest({ failureSignature: input.failureSignature, failureClass: input.failureClass, scope: scopeBinding, bindingDigest: input.bindingDigest });
      const proposal = this.createAutomationProposal({
        id: `learned-${proposalIdentity.slice("sha256:".length, "sha256:".length + 16)}`,
        failureSignature: input.failureSignature,
        failureClass: input.failureClass,
        scope: scopeBinding,
        strategy: input.mutationReceipt ? "RESUME_FROM_RECEIPT" : "REPAIR_THEN_RETRY",
        maxAttempts: Math.max(1, Math.min(5, input.maxAttempts)),
        preconditions: ["exact-binding", "identical-inputs", "reversible", "no-external-effect"],
        prohibitedEffects: ["authority-change", "credential-change", "publication", "production-access", "database-access", "irreversible-external-effect"]
      }, scope);
      const material = { ...decision, proposalRef: { id: proposal.id, digest: proposal.digest }, digest: undefined };
      decision = { ...material, digest: canonicalDigest(material) };
    }
    this.recordRecoveryDecision(input, decision, scope);
    return decision;
  }

  createAutomationProposal(input: Omit<AutomationRuleProposal, "schema" | "digest">, scope?: GovernedEvolutionScope): AutomationRuleProposal {
    const proposal = proposeAutomationRule(input);
    const target = path.join(this.scopedDirectory(this.proposalDir, scope), `${safeSegment(proposal.id)}.json`);
    if (fs.existsSync(target)) {
      const existing = this.readJson<AutomationRuleProposal>(target);
      if (existing.digest === proposal.digest) return existing;
      throw new Error("AUTOMATION_RULE_PROPOSAL_IMMUTABLE_CONFLICT");
    }
    this.atomicWrite(target, proposal);
    return proposal;
  }

  activateAutomationProposal(id: string, input: { proposalDigest: string; actor: string; evidenceRef: string }, scope?: GovernedEvolutionScope): AutomationRule {
    const target = path.join(this.scopedDirectory(this.proposalDir, scope), `${safeSegment(id)}.json`);
    if (!fs.existsSync(target)) throw new Error(`AUTOMATION_RULE_PROPOSAL_NOT_FOUND: ${id}`);
    const proposal = this.readJson<AutomationRuleProposal>(target);
    const existing = this.listAutomationRules(scope).find((rule) => rule.id === proposal.id && rule.status === "ACTIVE");
    if (existing) {
      if (existing.proposalDigest === input.proposalDigest && existing.approvedBy === input.actor && existing.approvalEvidenceRef === input.evidenceRef) return existing;
      throw new Error("AUTOMATION_RULE_ALREADY_ACTIVE");
    }
    const rule = activateAutomationRule(proposal, { ...input, approvedAt: new Date().toISOString() });
    this.atomicWrite(path.join(this.scopedDirectory(this.rulesDir, scope), `${safeSegment(rule.id)}-v${rule.revision}.json`), rule);
    return rule;
  }

  revokeAutomationRule(id: string, actor: string, evidenceRef: string, scope?: GovernedEvolutionScope): AutomationRule {
    if (!actor.trim() || !evidenceRef.trim()) throw new Error("AUTOMATION_RULE_REVOCATION_EVIDENCE_REQUIRED");
    const current = this.listAutomationRules(scope).filter((rule) => rule.id === id).sort((left, right) => right.revision - left.revision)[0];
    if (!current) throw new Error(`AUTOMATION_RULE_NOT_FOUND: ${id}`);
    if (current.status === "REVOKED") return current;
    const material = { ...current, status: "REVOKED" as const, revision: current.revision + 1, approvedBy: actor, approvalEvidenceRef: evidenceRef, approvedAt: new Date().toISOString() };
    const next = { ...material, digest: canonicalDigest({ ...material, digest: undefined }) };
    this.atomicWrite(path.join(this.scopedDirectory(this.rulesDir, scope), `${safeSegment(next.id)}-v${next.revision}.json`), next);
    return next;
  }

  suspendAutomationRule(id: string, revision: number, failureEvidenceRef: string, scope?: GovernedEvolutionScope): AutomationRule {
    if (!failureEvidenceRef.trim()) throw new Error("AUTOMATION_RULE_SUSPENSION_EVIDENCE_REQUIRED");
    const current = this.listAutomationRules(scope).find((rule) => rule.id === id && rule.revision === revision);
    if (!current) throw new Error(`AUTOMATION_RULE_NOT_FOUND: ${id}@${revision}`);
    if (current.status === "SUSPENDED") return current;
    const material = { ...current, status: "SUSPENDED" as const, revision: current.revision + 1, approvedBy: "runtime-recovery-controller", approvalEvidenceRef: failureEvidenceRef, approvedAt: new Date().toISOString() };
    const next = { ...material, digest: canonicalDigest({ ...material, digest: undefined }) };
    this.atomicWrite(path.join(this.scopedDirectory(this.rulesDir, scope), `${safeSegment(next.id)}-v${next.revision}.json`), next);
    return next;
  }

  listAutomationProposals(scope?: GovernedEvolutionScope): AutomationRuleProposal[] {
    return this.readAll<AutomationRuleProposal>(this.scopedDirectory(this.proposalDir, scope));
  }

  listAutomationRules(scope?: GovernedEvolutionScope): AutomationRule[] {
    const all = this.readAll<AutomationRule>(this.scopedDirectory(this.rulesDir, scope));
    const latest = new Map<string, AutomationRule>();
    for (const rule of all.sort((left, right) => left.revision - right.revision)) latest.set(rule.id, rule);
    return [...latest.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  interaction(input: Omit<HumanInteractionMessage, "schema" | "protocolVersion" | "digest">): HumanInteractionMessage {
    return createHumanInteractionMessage(input);
  }

  private writeBinding(binding: HarnessExecutionBinding, scope?: GovernedEvolutionScope): void {
    const target = path.join(this.scopedDirectory(this.bindingsDir, scope), `${binding.digest.slice("sha256:".length)}.json`);
    if (!fs.existsSync(target)) this.atomicWrite(target, binding);
  }

  private writeActiveProjectDefinition(definition: EvolutionProjectDefinition, scope: GovernedEvolutionScope | undefined, reason: string, actor = "runtime", evidenceRef = "registration"): { schema: "evopilot-evolution-project-activation/v1"; projectId: string; version: string; definitionDigest: string; reason: string; actor: string; evidenceRef: string; activatedAt: string; digest: string } {
    const material = { schema: "evopilot-evolution-project-activation/v1" as const, projectId: definition.metadata.id, version: definition.metadata.version, definitionDigest: definition.digest, reason, actor, evidenceRef, activatedAt: new Date().toISOString() };
    const record = { ...material, digest: canonicalDigest(material) };
    this.atomicWrite(path.join(this.scopedDirectory(this.activeDefinitionsDir, scope), `${safeSegment(definition.metadata.id)}.json`), record);
    return record;
  }

  private recordRecoveryDecision(context: RecoveryContext, decision: RecoveryDecision, scope?: GovernedEvolutionScope): void {
    const material = { schema: "evopilot-recovery-event/v1", id: randomUUID(), context, decision, recordedAt: new Date().toISOString() };
    this.atomicWrite(path.join(this.scopedDirectory(this.recoveryEventsDir, scope), `${material.id}.json`), { ...material, digest: canonicalDigest(material) });
  }

  private projectDefinitionPath(id: string, version: string, scope?: GovernedEvolutionScope): string {
    return path.join(this.scopedDirectory(this.projectDefinitionsDir, scope), `${safeSegment(id)}--${safeSegment(version)}.json`);
  }

  private scopedDirectory(root: string, scope?: GovernedEvolutionScope): string {
    const normalized = scope ?? { tenantId: "tenant-default", workspaceId: "workspace-default" };
    const directory = path.join(root, safeSegment(normalized.tenantId), safeSegment(normalized.workspaceId));
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  }

  private atomicWrite(target: string, value: unknown): void {
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, target);
  }

  private readAll<T>(directory: string): T[] {
    return fs.readdirSync(directory).filter((file) => file.endsWith(".json")).sort().map((file) => this.readJson<T>(path.join(directory, file)));
  }

  private readJson<T>(target: string): T {
    return JSON.parse(fs.readFileSync(target, "utf8")) as T;
  }
}

function safeSegment(value: string): string {
  const result = String(value).trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!result) throw new Error("GOVERNED_EVOLUTION_ID_INVALID");
  return result;
}

function compareBoundary(field: string, expected: string | undefined, actual: string | undefined, drift: string[]): void {
  if (expected !== actual) drift.push(`${field}:expected=${expected ?? "missing"};actual=${actual ?? "missing"}`);
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.split(/[.-]/).map((part) => Number(part)).map((part) => Number.isFinite(part) ? part : 0);
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.localeCompare(right);
}
