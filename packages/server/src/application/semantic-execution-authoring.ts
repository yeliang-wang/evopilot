import {performance} from "node:perf_hooks";
import {createSemanticExecutionPlanService} from "./semantic-execution-plan.js";
import {createSemanticHarnessSourceReader} from "./semantic-harness-sources.js";
import {createSemanticRuntimeSourceReader} from "./semantic-runtime-sources.js";
import {createProjectSemanticBindingService} from "./project-semantic-binding.js";
import {semanticProjectAccess} from "./project-semantic-discovery.js";
import {readVerifiedSemanticCatalog} from "../domains/harness-template/semantic-catalog-consumer.js";
import {projectSemanticContext, resolveSemanticContextLimits, type SemanticContextSelection} from "../domains/harness-template/semantic-context-slice.js";
import {normalizeSemanticActionContextPlan} from "../domains/harness-template/semantic-action-context-plan.js";
import {normalizeSemanticOutcomePlan, type SemanticOutcomePlan} from "../domains/harness-template/semantic-outcome-plan.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {freeze, redactSemanticError} from "../domains/harness-template/semantic-catalog-io.js";
import {canonicalJson, digestObject, isRecord} from "../domains/harness-template/utils.js";

type Plans = ReturnType<typeof createSemanticExecutionPlanService>;
type Declaration = Parameters<Plans["prepare"]>[0];
type Access = Parameters<Plans["prepare"]>[1];
type Input = Pick<Declaration, "identity" | "runId" | "requestDigest" | "goalTarget">;
type Draft = Input & {basisDigest: string; selection: SemanticContextSelection; business: SemanticOutcomePlan["business"];
  harness: SemanticOutcomePlan["harness"]; selections: Declaration["selections"]};
const same = (a: unknown, b: unknown) => digestObject(a) === digestObject(b);
const baseKeys = ["identity", "runId", "requestDigest", "goalTarget"];
const authority = {mayApprove: false, mayDispatch: false, mayAttestEvidence: false, mayCompleteGoal: false, mayPublish: false};

/** Read-only authoring before immutable plan preparation. All material and
 * action pins are server-derived. Domain predicates/selections remain explicit
 * untrusted declarations, not inferred truth, approval or executable Pack code.
 */
export function createSemanticExecutionAuthoring(
  configuration: Parameters<typeof createSemanticExecutionPlanService>[0],
  owners: Parameters<typeof createSemanticHarnessSourceReader>[1] & {
    planningProject: Plans["planningProject"]; preview: Plans["preview"]}
) {
  configuration = Object.freeze({...configuration, ...(configuration.limits ? {limits: Object.freeze({...configuration.limits})} : {}),
    ...(configuration.contextLimits ? {contextLimits: Object.freeze({...configuration.contextLimits})} : {})});
  const materials = createSemanticHarnessSourceReader(configuration, owners), sources = createSemanticRuntimeSourceReader(configuration.dataRoot);
  const projects = createProjectSemanticBindingService(configuration), limits = resolveSemanticContextLimits(configuration.contextLimits);
  function capture<T extends Input>(value: T, draft = false): T {
    requireSemantic(isRecord(value) && Object.keys(value).sort().join() === [...baseKeys,
      ...(draft ? ["basisDigest", "selection", "business", "harness", "selections"] : [])].sort().join() &&
      Buffer.byteLength(JSON.stringify(value)) <= 65536, "INVALID");
    return structuredClone(value);
  }
  async function basis(value: Input, access: Access, check: (ceiling?: number) => void) {
    check();
    const before = await materials.read({...value, ...access}); check();
    const subject = () => {
      check(); const current = semanticProjectAccess(value.identity.projectId, access.currentAccess());
      requireSemantic(["operator", "admin"].includes(current.principal.role) && same(current.scope, before.scope), "PERMISSION_DENIED");
      return current;
    };
    const original = subject(), source = sources.read(value.identity, original.principal);
    requireSemantic(same(source.subject, original) && same(source.pins, before.runtimeSourcePins), "DRIFT");
    const projectBindingDigest = owners.planningProject(value.identity, access);
    const projectInput = {projectId: value.identity.projectId, ...access, bindingDigest: projectBindingDigest};
    const project = await projects.inspect(projectInput); check();
    const scope = {...before.scope, goalId: value.identity.goalId, targetId: value.identity.targetId};
    const pending = owners.lifecycle.readPendingExecution(value.runId, value.requestDigest, scope);
    const revision = owners.lifecycle.readPendingRevision(value.runId, value.requestDigest, scope);
    requireSemantic(project.binding.catalogId === pending.harness.catalogId &&
      project.binding.pins.bundleRef.digest === pending.harness.digest, "DRIFT");
    requireSemantic(configuration.registryConfigPath && configuration.policyPath, "TRUST_REQUIRED");
    const snapshot = await readVerifiedSemanticCatalog({registryConfigPath: configuration.registryConfigPath,
      policyPath: configuration.policyPath, catalogId: project.binding.catalogId, limits: configuration.limits, signal: access.signal,
      currentSubject: () => {const current = subject(); requireSemantic(same(current, original), "DRIFT");
        return {scope: current.scope, role: current.principal.role, active: true};}}); check();
    requireSemantic(snapshot.generation.generationDigest === before.catalog.generationDigest && snapshot.pointer.pointerDigest === before.catalog.pointerDigest &&
      snapshot.receipt.receiptDigest === before.catalog.receiptDigest && snapshot.registryDigest === before.material.registryDigest, "DRIFT");
    const pins = project.binding.pins;
    requireSemantic(snapshot.generation.sets?.filter(s => same(s.scope, before.scope) && s.refs.artifactSet === pins.artifactSetDigest &&
      s.refs.closure === pins.closureDigest).length === 1, "DRIFT");
    function material(digest: string, kind: string): Record<string, any> {
      const entries = snapshot.generation.entries.filter(e => same(e.scope, before.scope) && e.objectDigest === digest && e.kind === kind);
      requireSemantic(entries.length === 1, "MATERIAL_MISSING"); const m = snapshot.materials.get(entries[0].path);
      requireSemantic(isRecord(m), "MATERIAL_INVALID"); return m;
    }
    const bundle = material(pins.bundleRef.digest, "HarnessBundle"), artifact = material(pins.artifactSetDigest, "ProjectOntologyArtifactSet");
    const profile = material(bundle.spec.profile.digest, "HarnessProfile");
    const components = bundle.spec.resolvedComponents.map((r: {digest: string}) => material(r.digest, "HarnessComponent"));
    const requirements = bundle.spec.semanticRequirements;
    requireSemantic(isRecord(requirements), "MATERIAL_INVALID");
    const available: SemanticContextSelection = {schema: "evopilot-semantic-context-selection/v1", reasoning: "EXPLICIT_ONLY",
      conceptIds: [...new Set<string>((requirements.requiredConcepts as {conceptId: string}[]).map(c => c.conceptId))].sort(),
      relations: requirements.relationRequirements as SemanticContextSelection["relations"]};
    const projected = projectSemanticContext({scope: before.scope, artifactSet: artifact, bundle,
      reasoningProfile: material(pins.reasoningProfileDigest, "OntologyReasoningProfile"), selection: available, limits, check});
    check(projected.wallTimeLimitMs);
    requireSemantic(projected.compatibilityDigest === pins.compatibilityDigest, "DRIFT");
    const lifecycle = revision.definition.obligations ?? {}, unique = (v: string[]) => [...new Set(v)].sort();
    const required = {validators: unique([...profile.spec.acceptance.blockingValidators, ...bundle.spec.validators,
      ...components.flatMap((c: Record<string, any>) => c.spec.validators.map((v: {id: string}) => v.id)), ...lifecycle.validators ?? []]),
      constraints: unique([...bundle.spec.constraints, ...components.flatMap((c: Record<string, any>) => c.spec.constraints), ...lifecycle.constraints ?? []]),
      evidence: unique([...profile.spec.acceptance.requiredEvidence, ...bundle.spec.evidence,
        ...components.flatMap((c: Record<string, any>) => c.spec.evidence), ...lifecycle.requiredEvidence ?? []])};
    const obligations = [...required.validators.map(value => ({kind: "validator" as const, value})),
      ...required.constraints.map(value => ({kind: "constraint" as const, value})), ...required.evidence.map(value => ({kind: "evidence" as const, value}))];
    requireSemantic(obligations.length <= 64 && source.acceptanceCriteria.length > 0 && source.acceptanceCriteria.length <= 64, "MATERIAL_LIMIT");
    requireSemantic(same(before, await materials.read({...value, ...access})) && same(project, await projects.inspect(projectInput)), "DRIFT");
    requireSemantic(projectBindingDigest === owners.planningProject(value.identity, access) && same(original, subject()) &&
      same(source, sources.read(value.identity, subject().principal)) && same(pending, owners.lifecycle.readPendingExecution(value.runId, value.requestDigest, scope)), "DRIFT");
    check();
    const content = {schema: "evopilot-semantic-authoring-basis/v1", status: "EXPLICIT_RULES_REQUIRED", ...value,
      scope: before.scope, principal: original.principal, projectBindingDigest: project.binding.bindingDigest,
      sourceDigest: before.sourceDigest, runtimeSourcePins: source.pins, pins, goalTargetDigest: before.material.goalTargetDigest,
      pendingExecution: {runId: value.runId, requestDigest: value.requestDigest, lifecycleDigest: pending.lifecycle.digest,
        stageId: pending.stageId, action: pending.action, actionVersion: pending.actionVersion},
      criteria: source.acceptanceCriteria, concepts: projected.content.concepts, relations: projected.content.relations,
      obligations, selection: null, businessRules: [], harnessRules: [], businessField: null, productType: null,
      textIsUntrustedData: true, persisted: false, eligibleForExecution: false, authority};
    return freeze({...content, basisDigest: digestObject(content)});
  }
  async function bounded<T>(access: Access, action: (access: Access, check: (ceiling?: number) => void) => Promise<T>) {
    const start = performance.now(), timeout = new AbortController(), timer = setTimeout(() => timeout.abort(), limits.timeoutMs); timer.unref();
    let wallTimeLimitMs = limits.timeoutMs;
    const check = (ceiling = wallTimeLimitMs) => {wallTimeLimitMs = Math.min(wallTimeLimitMs, ceiling);
      requireSemantic(!access.signal?.aborted, "CANCELLED");
      requireSemantic(!timeout.signal.aborted && performance.now() - start < wallTimeLimitMs, "TIMEOUT");};
    try {
      check(); const result = await action({...access, signal: access.signal ? AbortSignal.any([access.signal, timeout.signal]) : timeout.signal}, check);
      check(); requireSemantic(Buffer.byteLength(canonicalJson(result)) <= limits.maxOutputBytes, "MATERIAL_LIMIT"); return freeze(result);
    } catch (error) {check(); throw redactSemanticError(error);} finally {clearTimeout(timer);}
  }
  return Object.freeze({
    planning(value: Input, access: Access) {value = capture(value); return bounded(access, (a, check) => basis(value, a, check));},
    draft(value: Draft, access: Access) {
      value = capture(value, true);
      return bounded(access, async (a, check) => {
        const input: Input = {identity: value.identity, runId: value.runId, requestDigest: value.requestDigest, goalTarget: value.goalTarget};
        const b = await basis(input, a, check); requireSemantic(value.basisDigest === b.basisDigest, "DRIFT");
        const p = b.pendingExecution;
        const {planDigest: _contextDigest, ...contextPlan} = normalizeSemanticActionContextPlan({schema: "evopilot-semantic-action-context-plan/v1",
          lifecycleDigest: p.lifecycleDigest, actions: [{stageId: p.stageId, action: p.action, actionVersion: p.actionVersion, selection: value.selection}]});
        const selection = contextPlan.actions[0].selection;
        const chosen = [...new Set([...selection.conceptIds, ...selection.relations.flatMap(r => [r.subjectConceptId, r.objectConceptId])])];
        requireSemantic(chosen.every(id => b.concepts.some(c => c.conceptId === id)) && selection.relations.every(r => b.relations.some(e => same(e, r))), "PERMISSION_DENIED");
        const body = {schema: "evopilot-semantic-outcome-plan/v1", goalTargetDigest: b.goalTargetDigest, artifactSetDigest: b.pins.artifactSetDigest,
          bundleDigest: b.pins.bundleRef.digest, lifecycleDigest: p.lifecycleDigest, stageId: p.stageId, action: p.action, actionVersion: p.actionVersion,
          business: value.business, harness: value.harness};
        const outcomePlan = normalizeSemanticOutcomePlan({...body, planDigest: digestObject(body)});
        requireSemantic(outcomePlan.business.every(r => chosen.includes(r.conceptId)), "DRIFT");
        requireSemantic(outcomePlan.harness.every(r => b.obligations.some(o => same(o, r.obligation))) &&
          b.obligations.every(o => outcomePlan.harness.some(r => same(o, r.obligation))), "INVALID");
        const declaration = await owners.preview({...input, contextPlan, outcomePlan, selections: value.selections}, a); check();
        requireSemantic(same(b, await basis(input, a, check)), "DRIFT");
        const content = {schema: "evopilot-semantic-execution-draft/v1", status: "DRAFT_NOT_PREPARED", basisDigest: b.basisDigest,
          declaration, criteria: b.criteria, coverageInputs: b.criteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: [] as string[]})),
          persisted: false, eligibleForExecution: false, textIsUntrustedData: true, authority};
        return {...content, draftDigest: digestObject(content)};
      });
    }
  });
}
