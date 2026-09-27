import type {GlobalGoal} from "../model.js";
import type {createSemanticTerminalEvidenceReader} from "./semantic-terminal-evidence.js";
import {semanticPhaseDefinition, semanticTargetDefinition} from "./semantic-runtime-sources.js";
import {SemanticBindingStore} from "../storage/semantic-binding-store.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";
import {freeze} from "../domains/harness-template/semantic-catalog-io.js";

type Evidence = ReturnType<ReturnType<typeof createSemanticTerminalEvidenceReader>["read"]>;
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
const hash = (v: unknown) => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
const reviewCapabilities = ["architecture", "security", "testing", "documentation", "operations", "release"];
function strings(v: unknown): v is string[] {
  return Array.isArray(v) && v.length <= 64 && new Set(v).size === v.length &&
    v.every(s => typeof s === "string" && s.trim().length > 0 && s.length <= 8192);
}
function exact(v: unknown, keys: string[]): asserts v is Record<string, any> {
  requireSemantic(isRecord(v) && Object.keys(v).sort().join() === keys.sort().join(), "MATERIAL_INVALID");
}

/** Internal verifier, called only after the complete terminal chain is verified.
 * It consumes the pinned independent collector's typed facts, never client
 * package claims, raw DONE/GO, another Loop or a {present:true} placeholder.
 * Target package verification is NOT aggregate PhasePackage/GA authorization.
 */
export function verifySemanticTargetEvidencePackage(dataRoot: string, goal: GlobalGoal, terminal: Evidence) {
  const target = goal.plan.targets.find(t => t.id === terminal.identity.targetId);
  requireSemantic(target && target.phase && ["alpha", "beta", "rc", "ga"].includes(target.phase), "UNSUPPORTED");
  const phases = goal.plan.phaseTargets;
  requireSemantic(phases.length > 0 && phases.length <= 64 && new Set(phases.map(p => p.id)).size === phases.length &&
    new Set(phases.map(p => p.phase)).size === phases.length, "MATERIAL_INVALID");
  const candidates = phases.filter(p => p.goalTargetIds?.includes(target.id));
  requireSemantic(candidates.length === 1, "MATERIAL_INVALID");
  const phase = candidates[0];
  requireSemantic(phase.schema === "evopilot-phase-target/v1" && phase.goalId === goal.id && phase.phase === target.phase &&
    typeof phase.id === "string" && phase.id.length > 0 && strings(phase.goalTargetIds) && phase.goalTargetIds.length > 0 &&
    phase.goalTargetIds.every(id => goal.plan.targets.some(t => t.id === id && t.phase === phase.phase)) &&
    strings(phase.acceptanceCriteria) && strings(phase.requiredEvidence) && strings(phase.reviewCapabilities) && strings(phase.packageOutputs) &&
    strings(target.requiredEvidence ?? []) && strings(target.reviewCapabilities ?? []) &&
    (target.reviewCapabilities ?? []).every(c => reviewCapabilities.includes(c)), "MATERIAL_INVALID");
  const stage = terminal.stages.at(-1); requireSemantic(stage, "UNAVAILABLE");
  const store = new SemanticBindingStore(dataRoot);
  const scope = {tenantId: goal.tenantId, workspaceId: goal.workspaceId, projectId: goal.projectId};
  const key = {scope, runId: terminal.runId, sourceRequestDigest: stage.sourceRequestDigest};
  const collection = store.read("collections", key), review = store.read("outcome-reviews", {...key,
    executionBindingDigest: stage.bindingDigest, reviewDigest: stage.reviewDigest});
  requireSemantic(isRecord(collection) && isRecord(review), "UNAVAILABLE");
  const {receiptDigest, ...collectionBody} = collection, {reviewDigest, ...reviewBody} = review;
  requireSemantic(receiptDigest === stage.collectionReceiptDigest && digestObject(collectionBody) === receiptDigest &&
    reviewDigest === stage.reviewDigest && digestObject(reviewBody) === reviewDigest, "DIGEST_MISMATCH");
  requireSemantic(isRecord(collection.observation) && Array.isArray(collection.observation.observations), "MATERIAL_INVALID");
  const observations = collection.observation.observations;
  requireSemantic(observations.length <= 64 && observations.every(isRecord) &&
    new Set(observations.map(o => o.kind)).size === observations.length, "MATERIAL_INVALID");
  const packages = observations.filter(o => o.kind === "target-evidence-package");
  requireSemantic(packages.length === 1, "UNAVAILABLE");
  const observed = packages[0]; exact(observed.facts, ["package"]);
  const facts = observed.facts.package;
  exact(facts, ["schema", "scope", "phase", "targetDefinitionDigest", "phaseDefinitionDigest", "criteria", "evidence", "reviews"]);
  requireSemantic(facts.schema === "evopilot-semantic-target-evidence-package/v1" && same(facts.scope, terminal.scope) &&
    facts.phase === target.phase && facts.targetDefinitionDigest === digestObject(semanticTargetDefinition(target)) &&
    facts.targetDefinitionDigest === terminal.runtimeSourcePins.targetDigest &&
    facts.phaseDefinitionDigest === digestObject(semanticPhaseDefinition(phase)) && same(facts.criteria, review.coverage), "DRIFT");
  requireSemantic(strings(observed.sourceDigests) && observed.sourceDigests.length > 0 && observed.sourceDigests.every(hash), "TRUST_REQUIRED");
  const required = target.requiredEvidence ?? [], capabilities = target.reviewCapabilities ?? [];
  requireSemantic(Array.isArray(facts.evidence) && facts.evidence.length === required.length && facts.evidence.every(isRecord) &&
    new Set(facts.evidence.map(e => e.kind)).size === required.length, "MATERIAL_INVALID");
  for (const item of facts.evidence) {
    exact(item, ["kind", "sourceDigests"]);
    const observation = observations.find(o => o.kind === item.kind);
    requireSemantic(typeof item.kind === "string" && required.includes(item.kind) && observation && strings(item.sourceDigests) && item.sourceDigests.length > 0 &&
      item.sourceDigests.every(hash) && same(item.sourceDigests, observation.sourceDigests), "TRUST_REQUIRED");
  }
  requireSemantic(Array.isArray(facts.reviews) && facts.reviews.length === capabilities.length && facts.reviews.every(isRecord) &&
    new Set(facts.reviews.map(r => r.capability)).size === capabilities.length, "MATERIAL_INVALID");
  for (const review of facts.reviews) {
    exact(review, ["capability", "status", "evidenceKinds"]);
    requireSemantic(capabilities.some(c => c === review.capability) && review.status === "PASSED" && strings(review.evidenceKinds) &&
      review.evidenceKinds.length > 0 && review.evidenceKinds.every(kind => required.includes(kind)), "TRUST_REQUIRED");
  }
  const body = {schema: "evopilot-semantic-target-package-verification/v1", scope: terminal.scope, phase: target.phase,
    phaseTargetId: phase.id, targetDefinitionDigest: facts.targetDefinitionDigest, phaseDefinitionDigest: facts.phaseDefinitionDigest,
    terminalEvidenceDigest: terminal.evidenceDigest, collectionReceiptDigest: receiptDigest, reviewDigest,
    packageDigest: digestObject(facts), sourceDigests: observed.sourceDigests,
    status: "VERIFIED_TARGET_PACKAGE_NOT_PHASE_CLOSURE", phaseClosureVerified: false, releaseAuthorized: false};
  return freeze({...body, verificationDigest: digestObject(body)});
}
