import {canonicalDigest as d, normalizeExecutionRuntimeProfile, qualifyExecutionRuntimeProfile} from "../../packages/core/dist/index.js";
import {GovernedEvolutionService} from "../../packages/server/dist/domains/governed-evolution/index.js";
import {createSemanticExecutionBindingService} from "../../packages/server/dist/application/semantic-execution-binding.js";
import {projectSemanticBindingFixture} from "./project-semantic-binding-fixture.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import {LifecycleService} from "../../packages/server/dist/domains/lifecycle/index.js";
import {semanticContextResolverDescriptor, resolveSemanticContextLimits} from "../../packages/server/dist/domains/harness-template/semantic-context-slice.js";
import {publishedHarnessCandidatesV5} from "../../packages/server/dist/domains/harness-template/bundle.js";

export async function semanticExecutionFixture(t, options = {}) {
  const f = options.sharedProject ?? await projectSemanticBindingFixture(t);
  const review = options.sharedProject ? undefined : await f.service.prepare({...f.input, ...f.selection});
  const projectRecord = options.projectRecord ?? await f.service.approve({...f.input, reviewDigest: review.reviewDigest});
  const governed = new GovernedEvolutionService(f.configuration.dataRoot);
  const definition = governed.registerProjectDefinition({schema: "evopilot-evolution-project-definition/v1",
    metadata: {id: f.scope.projectId, name: "Synthetic", version: "1.0.0", labels: {}},
    spec: {source: {provider: "local-git", repository: "synthetic/project", defaultBranch: "main", mode: "owned"},
      ecosystem: {languages: [], packageManagers: [], frameworks: []},
      delivery: {model: "library", ciProvider: "synthetic", candidateBeforeAcceptance: true, noRebuildPromotion: true, channels: []},
      environment: {development: "local", acceptance: "synthetic"}, policyRefs: [], lifecycleRefs: [], secretRefs: [], hostPreferences: [], runtimePreferences: [], evidenceSources: []}}, f.scope);
  const bundle = Object.values(f.data.materials).find(doc => doc.kind === "HarnessBundle");
  let candidate = {profile: {...bundle.spec.profile, catalogId: f.selection.catalogId, catalogDigest: d("synthetic-v3-catalog"), registryDigest: d("synthetic-registry"),
    domains: ["synthetic"], taskClasses: ["test"], positiveConcepts: [], negativeConcepts: []},
    bundle: {id: bundle.metadata.id, version: bundle.metadata.version, digest: f.selection.bundleDigest, profileDigest: bundle.spec.profile.digest,
      componentDigests: bundle.spec.resolvedComponents.map(component => component.digest), requiredEvidence: [], validators: [], constraints: [], capabilities: ["goal-loop.execute"], permissions: []},
    published: true, eligible: true};
  const goalTarget = {projectId: f.scope.projectId, goalId: "goal", targetId: "target", objective: "Synthetic loop", domain: "synthetic", taskClass: "test", requiredCapabilities: ["goal-loop.execute"]};
  if (options.targetId) goalTarget.targetId = options.targetId;
  if (options.publishedMaterials) {
    const snapshot = await f.read();
    const assets = kind => snapshot.generation.entries.filter(e => e.kind === kind).map(e => ({...snapshot.materials.get(e.path), catalogRef: {
      catalogId: snapshot.catalogId, catalogSource: f.root, catalogDigest: snapshot.verification.legacyCatalogDigest,
      registryDigest: snapshot.registryDigest, entryPath: e.path, entryDigest: e.objectDigest}}));
    [candidate] = publishedHarnessCandidatesV5({profiles: assets("HarnessProfile"), bundles: assets("HarnessBundle"), components: assets("HarnessComponent")});
    Object.assign(goalTarget, {domain: candidate.profile.domains[0], taskClass: candidate.profile.taskClasses[0],
      objective: "Synthetic API gateway material verification", requiredCapabilities: []});
  }
  const adapterProfile = options.adapterProfile;
  const agentRuntime = normalizeExecutionRuntimeProfile({schema: "evopilot-execution-runtime-profile/v1", id: adapterProfile?.id ?? "synthetic-runtime", version: adapterProfile?.version ?? "1.0.0", provider: adapterProfile?.provider ?? "synthetic-agent-provider", model: adapterProfile?.model ?? "synthetic-agent-model", capabilities: adapterProfile?.capabilities ?? ["goal-loop.execute"], permissionMode: "HOST_MANAGED_DENY_UNDECLARED"});
  const qualification = qualifyExecutionRuntimeProfile(agentRuntime, ["goal-loop.execute"], ["synthetic://qualified-local-fixture"]);
  const executorCore = {host: adapterProfile?.host ?? "synthetic-host", provider: agentRuntime.provider, model: agentRuntime.model, capabilities: ["goal-loop.execute"],
    agentRuntime: {profileId: agentRuntime.id, profileVersion: agentRuntime.version, adapterId: adapterProfile?.adapterId ?? "synthetic.adapter@1", profileDigest: adapterProfile?.digest ?? agentRuntime.digest, qualificationDigest: adapterProfile?.qualification.conformanceDigest ?? qualification.digest},
    sandbox: {workspaceRef: adapterProfile?.constraints.workspaceRoot ?? "synthetic://workspace", permissionMode: "HOST_MANAGED_DENY_UNDECLARED"}, allowedEffects: options.pending ? ["READ_ONLY", "REVERSIBLE"] : ["READ_ONLY"], credentialRefs: []};
  const executor = {...executorCore, digest: d(executorCore)};
  let lifecycle = {ref: {id: "synthetic-lifecycle", version: "1.0.0"}, digest: d("synthetic-lifecycle"), definition: {capabilities: ["goal-loop.execute"], obligations: {}}};
  let lifecycleService;
  if (options.pending) {
    const root = path.join(f.root, "context-lifecycles" + (options.targetId ? "-" + options.targetId : "")); await fs.mkdir(root);
    await fs.writeFile(path.join(root, "context.yaml"), `schema: evopilot-lifecycle-definition/v1alpha1
metadata: { id: synthetic-lifecycle, name: Synthetic context, version: 1.0.0 }
capabilities: ${options.terminalControls ? "[goal-loop.execute, evidence.write, agent.execute]" : "[goal-loop.execute]"}
obligations: ${JSON.stringify(options.lifecycleObligations ?? {})}
${options.terminalControls ? 'inputs: [{ id: unused, type: boolean, prompt: Optional test branch, required: false }]' : ""}
stages:
  - id: loop
    name: Synthetic pending loop
    action: { uses: evopilot.goal-loop@1, with: { objective: Synthetic fixture only } }
    decision: { mode: AUTO }
${options.additionalStage ? `  - id: followup
    name: Synthetic next stage
    needs: [loop]
    action: { uses: evopilot.goal-loop@1, with: { objective: Synthetic followup only } }
    decision: { mode: AUTO }
` : ""}
${options.terminalControls ? `  - id: aggregate
    name: Internal terminal aggregation
    needs: [${options.additionalStage ? "followup" : "loop"}]
    action: { uses: evidence.aggregate@1, with: { format: json } }
    decision: { mode: AUTO }
  - id: disabled
    name: Explicitly disabled stage
    needs: [aggregate]
    action: { uses: agent.execute@1 }
    decision: { mode: DISABLED }
  - id: conditional
    name: Unmatched condition
    needs: [disabled]
    when: { input: unused, exists: true }
    action: { uses: agent.execute@1 }
    decision: { mode: AUTO }
` : ""}
`);
    lifecycleService = new LifecycleService(f.configuration.dataRoot, [root]);
    const revision = lifecycleService.catalog.resolve("synthetic-lifecycle", "1.0.0");
    lifecycle = {...lifecycle, ref: revision.ref, digest: revision.digest, definition: revision.definition};
  }
  const plan = governed.plan({projectDefinitionId: f.scope.projectId, goalTarget, candidates: [candidate], lifecycle,
    policyDigest: d("policy"), providerDigest: d("provider"), environmentDigest: d("environment"), hostDigest: executor.digest,
    runtimeDigest: options.runtimeDigest ?? d("runtime"), authorityDigest: d("authority"), evidenceDigest: d("evidence")}, f.scope);
  const b = plan.binding;
  const state = {goalTarget, executor, agentRuntime, qualification, ...(adapterProfile ? {agentAdapterProfile: adapterProfile} : {}),
    harness: {projectDefinitionDigest: definition.digest, goalTargetDigest: b.goalTargetDigest, registryDigest: b.registryDigest,
      catalogDigests: {[b.catalogId]: b.catalogDigest}, profiles: [b.profileRef], bundles: [b.bundleRef], lifecycleDigest: b.lifecycleRef.digest,
      compositionDigest: b.compositionDigest, policyDigest: b.policyDigest, providerDigest: b.providerDigest, environmentDigest: b.environmentDigest,
      hostDigest: b.hostDigest, runtimeDigest: b.runtimeDigest, authorityDigest: b.authorityDigest, evidenceDigest: b.evidenceDigest},
    llmProfile: {schema: "evopilot-llm-profile/v1", id: "runtime-llm", tenantId: f.scope.tenantId, workspaceId: f.scope.workspaceId, scope: "workspace",
      name: "Synthetic Runtime route", providerPreset: "custom", provider: "openai-compatible", providerName: "synthetic-runtime-provider", baseUrl: "https://synthetic.invalid/v1",
      modelName: "synthetic-runtime-model", apiKeyRef: "secret://synthetic/not-resolved", status: "ACTIVE", timeoutSeconds: 10, maxRetries: 0,
      defaultMaxOutputTokens: 100, maxOutputTokens: 100, temperature: 0, thinkingType: "disabled", createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z"},
    resolver: options.pending ? semanticContextResolverDescriptor(resolveSemanticContextLimits(options.contextLimits)) : {schema: "evopilot-semantic-context-resolver/v1", id: "synthetic-resolver", implementationDigest: d("synthetic-resolver-code"), limitsDigest: d("synthetic-resolver-limits")},
    permissions: {scope: f.scope, principalId: f.access.principal.id, allowedEffects: [...executor.allowedEffects], capabilities: ["goal-loop.execute"], revisionDigest: d("current-permissions")}};
  const identity = {projectId: f.scope.projectId, goalId: goalTarget.goalId, targetId: goalTarget.targetId, harnessBindingDigest: b.digest};
  const owners = {governed, currentExecution: () => state, ...(lifecycleService ? {lifecycle: lifecycleService} : {})};
  let run;
  if (lifecycleService) {
    lifecycleService.configureGovernanceHooks({verifyBoundary: input => {
      const result = governed.assertLifecycleBoundary({...input, currentState: state.harness}, f.scope);
      if (result.status !== "VALID") throw new Error("SYNTHETIC_BOUNDARY_INVALID");
      return {bindingDigest: b.digest, evidence: ["synthetic://boundary-check"]};
    }, decideRecovery: () => {throw new Error("SYNTHETIC_RECOVERY_NOT_IMPLEMENTED");}});
    run = lifecycleService.start({id: "context-run" + (options.targetId ? "-" + options.targetId : ""), lifecycleId: lifecycle.ref.id, lifecycleVersion: lifecycle.ref.version,
      ...f.scope, goalId: goalTarget.goalId, targetId: goalTarget.targetId, policyDigest: b.policyDigest, providerDigest: b.providerDigest,
      environmentDigest: b.environmentDigest, authorityDigest: b.authorityDigest, runtimeDigest: b.runtimeDigest, evidenceDigest: b.evidenceDigest,
      harnessExecutionBindingDigest: b.digest, harnessBundle: {id: b.bundleRef.id, version: b.bundleRef.version, digest: b.bundleRef.digest, catalogId: b.catalogId}, executor});
    lifecycleService.authorizePlan(run.id, "APPROVED", "synthetic-fixture", "synthetic://local-plan-decision", run.binding.digest);
    run = lifecycleService.advanceUntilBoundary(run.id);
  }
  const execution = createSemanticExecutionBindingService(f.configuration, owners);
  return {...f, projectFixture: f, projectRecord, governed, plan, state, identity, owners, execution, lifecycleService, run,
    bind: () => execution.bind(identity, f.input), verify: (binding, checkpoint = "resume") => execution.verifyBoundary(identity, {...f.input, bindingDigest: binding.bindingDigest, checkpoint})};
}
