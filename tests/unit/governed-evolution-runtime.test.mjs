import assert from "node:assert/strict";
import test from "node:test";
import {
  activateAutomationRule, assertNoLegacySuiteFallback, automationRuleApplies, canonicalDigest,
  compareEvolutionProjectDefinitions, compareLegacySuiteSnapshots, composeHarnessAndLifecycle, createHarnessExecutionBinding, createLegacySuiteIsolationProof, decideRecovery, discoverEvolutionProject,
  normalizeAgentHostProfile, normalizeEvolutionProjectDefinition, normalizeExecutionRuntimeProfile, normalizeLegacySuiteSnapshot,
  proposeAutomationRule, resolvePublishedHarness, revalidateHarnessExecutionBinding
} from "../../packages/core/dist/index.js";

const d = (value) => canonicalDigest(value);

function project() {
  return normalizeEvolutionProjectDefinition({
    schema: "evopilot-evolution-project-definition/v1",
    metadata: { id: "sample", name: "Sample", version: "1.0.0", labels: { delivery: "oss" } },
    spec: {
      source: { provider: "github", repository: "org/sample", defaultBranch: "main", mode: "owned" },
      ecosystem: { languages: ["typescript"], packageManagers: ["npm"], frameworks: [] },
      delivery: { model: "open-source", ciProvider: "github-actions", candidateBeforeAcceptance: true, noRebuildPromotion: true, channels: ["npm", "github-release"] },
      environment: { development: "local", acceptance: "isolated-rc" },
      policyRefs: ["policy://oss/v1"], lifecycleRefs: ["lifecycle://oss/v1"], secretRefs: ["secret://github/release"],
      hostPreferences: ["codex"], runtimePreferences: ["local"], evidenceSources: ["github-actions"]
    }
  });
}

function candidate(id = "oss", priority = 1) {
  const profileDigest = d({ profile: id });
  return {
    profile: { id, version: "1.0.0", digest: profileDigest, catalogId: "public", catalogDigest: d("catalog"), registryDigest: d("registry"), domains: ["software"], taskClasses: ["release"], positiveConcepts: ["npm"], negativeConcepts: [] },
    bundle: { id: `${id}-bundle`, version: "1.0.0", digest: d({ bundle: id }), profileDigest, componentDigests: [d("component")], requiredEvidence: ["tests"], validators: ["integrity"], constraints: ["no-rebuild"], capabilities: ["build"], permissions: ["build.run"] },
    published: true, eligible: true, priority
  };
}

function projectWithHarnessSelection(selected = candidate("b"), overrides = {}) {
  const base = project();
  return normalizeEvolutionProjectDefinition({
    ...base,
    metadata: { ...base.metadata, version: "1.1.0" },
    spec: {
      ...base.spec,
      resources: [{
        apiVersion: "evopilot.dev/v1",
        kind: "HarnessSelection",
        metadata: { id: "primary", version: "1.0.0" },
        spec: {
          registryDigest: selected.profile.registryDigest,
          catalogRef: { id: selected.profile.catalogId, digest: selected.profile.catalogDigest },
          profileRef: { id: selected.profile.id, version: selected.profile.version, digest: selected.profile.digest },
          bundleRef: { id: selected.bundle.id, version: selected.bundle.version, digest: selected.bundle.digest, componentDigests: selected.bundle.componentDigests },
          decisionEvidenceRef: "decision://project-owner/harness-selection",
          ...overrides
        }
      }]
    },
    digest: undefined
  });
}

const goal = { projectId: "sample", goalId: "goal-1", targetId: "target-1", objective: "Publish npm package", taskClass: "release", domain: "software", requiredCapabilities: ["build"] };

test("Project plus GoalTarget resolves exactly one published immutable HarnessBundle", () => {
  const matched = resolvePublishedHarness({ project: project(), goalTarget: goal, candidates: [candidate()] });
  assert.equal(matched.status, "MATCHED");
  assert.equal(matched.selected.bundle.id, "oss-bundle");
  assert.equal(resolvePublishedHarness({ project: project(), goalTarget: goal, candidates: [] }).status, "ABSTAINED");
  assert.equal(resolvePublishedHarness({ project: project(), goalTarget: goal, candidates: [candidate("a"), candidate("b")] }).status, "AMBIGUOUS");
  const selected = resolvePublishedHarness({ project: projectWithHarnessSelection(), goalTarget: goal, candidates: [candidate("a"), candidate("b")] });
  assert.equal(selected.status, "MATCHED");
  assert.equal(selected.selected.bundle.id, "b-bundle");
  assert.equal(selected.selection.status, "APPLIED");
  assert.equal(selected.candidates.find((item) => item.bundleId === "b-bundle").selectedByProjectDefinition, true);
  assert.deepEqual(selected.candidates.map((item) => item.rank), [1, 2]);
  assert.match(selected.candidates[0].bundleDigest, /^sha256:/);
  const unavailable = resolvePublishedHarness({ project: projectWithHarnessSelection(candidate("b"), { registryDigest: d("other-registry") }), goalTarget: goal, candidates: [candidate("a"), candidate("b")] });
  assert.equal(unavailable.status, "ABSTAINED");
  assert.equal(unavailable.selection.status, "UNAVAILABLE");
  const unpublished = { ...candidate("b"), published: false };
  const rejected = resolvePublishedHarness({ project: projectWithHarnessSelection(unpublished), goalTarget: goal, candidates: [candidate("a"), unpublished] });
  assert.equal(rejected.status, "ABSTAINED");
  assert.equal(rejected.selection.status, "REJECTED");
  assert.ok(rejected.candidates.find((item) => item.selectedByProjectDefinition).rejectionReasons.includes("bundle-not-published"));
});

test("Project discovery is question-driven and DDD resources are immutable and diffable", () => {
  const discovery = discoverEvolutionProject({ projectId: "sample", repository: "org/sample", sourceProvider: "github" });
  assert.equal(discovery.secretHandling, "REFERENCE_ONLY");
  assert.ok(discovery.questions.every((question) => question.authority === "NONE"));
  assert.ok(discovery.questions.some((question) => question.path === "spec.secretRefs"));
  assert.throws(() => discoverEvolutionProject({ apiToken: "raw-secret" }), /RAW_SECRET_FIELD_FORBIDDEN/);
  const before = project();
  const after = normalizeEvolutionProjectDefinition({
    ...before,
    metadata: { ...before.metadata, version: "1.1.0" },
    spec: {
      ...before.spec,
      resources: [{ apiVersion: "evopilot.dev/v1", kind: "EvidenceDiscovery", metadata: { id: "ci", version: "1" }, spec: { provider: "github-actions" }, capabilityRefs: ["evidence.read"] }]
    },
    digest: undefined
  });
  assert.match(after.spec.resources[0].digest, /^sha256:/);
  const impact = compareEvolutionProjectDefinitions(before, after, [d("binding")]);
  assert.equal(impact.compatibility, "REQUIRES_REVALIDATION");
  assert.equal(impact.rollbackVersion, "1.0.0");
  assert.ok(impact.changes.some((change) => change.path === "spec.resources"));
});

test("Lifecycle composition can strengthen but never weaken Harness obligations", () => {
  const harness = candidate().bundle;
  const lifecycle = { lifecycleId: "oss", lifecycleVersion: "1.0.0", lifecycleDigest: d("lifecycle"), requiredEvidence: ["sbom"], validators: ["signature"], constraints: ["approval-bound"], capabilities: ["build", "goal-loop.execute"], requestedPermissions: ["build.run"] };
  const composed = composeHarnessAndLifecycle(harness, lifecycle);
  assert.equal(composed.status, "COMPOSED");
  assert.deepEqual(composed.requiredEvidence, ["sbom", "tests"]);
  assert.deepEqual(composed.capabilities, ["build", "goal-loop.execute"]);
  assert.deepEqual(composeHarnessAndLifecycle(harness, { ...lifecycle, disabledHarnessEvidence: ["tests"] }).conflicts, ["required-evidence-disabled:tests"]);
  assert.equal(composeHarnessAndLifecycle(harness, { ...lifecycle, requestedPermissions: ["release.publish"] }).status, "CONFLICT");
});

test("binding revalidates only its exact immutable closure at every Loop boundary", () => {
  const p = project();
  const match = resolvePublishedHarness({ project: p, goalTarget: goal, candidates: [candidate()] });
  const composition = composeHarnessAndLifecycle(match.selected.bundle, { lifecycleId: "oss", lifecycleVersion: "1.0.0", lifecycleDigest: d("lifecycle"), requiredEvidence: [], validators: [], constraints: [], capabilities: ["build"], requestedPermissions: ["build.run"] });
  const fixed = d("fixed");
  const binding = createHarnessExecutionBinding({ projectDefinition: p, goalTarget: goal, match, composition, policyDigest: fixed, providerDigest: fixed, environmentDigest: fixed, hostDigest: fixed, runtimeDigest: fixed, authorityDigest: fixed, evidenceDigest: fixed });
  assert.throws(() => createHarnessExecutionBinding({ projectDefinition: p, goalTarget: { ...goal, projectId: "other" }, match, composition, policyDigest: fixed, providerDigest: fixed, environmentDigest: fixed, hostDigest: fixed, runtimeDigest: fixed, authorityDigest: fixed, evidenceDigest: fixed }), /PROJECT_GOAL_TARGET_MISMATCH/);
  assert.deepEqual(binding.revalidateAt, ["start", "resume", "retry", "loop-iteration"]);
  const current = { projectDefinitionDigest: p.digest, goalTargetDigest: d(goal), registryDigest: d("registry"), catalogDigests: { public: d("catalog"), unrelated: d("new-catalog") }, profiles: [{ id: match.selected.profile.id, version: "1.0.0", digest: match.selected.profile.digest }], bundles: [{ id: match.selected.bundle.id, version: "1.0.0", digest: match.selected.bundle.digest, componentDigests: match.selected.bundle.componentDigests }], lifecycleDigest: d("lifecycle"), compositionDigest: composition.digest, policyDigest: fixed, providerDigest: fixed, environmentDigest: fixed, hostDigest: fixed, runtimeDigest: fixed, authorityDigest: fixed, evidenceDigest: fixed };
  assert.equal(revalidateHarnessExecutionBinding(binding, current).status, "VALID");
  assert.equal(revalidateHarnessExecutionBinding(binding, { ...current, registryDigest: d("changed-registry") }).status, "DRIFTED");
  assert.equal(revalidateHarnessExecutionBinding(binding, { ...current, policyDigest: d("changed") }).status, "DRIFTED");
});

test("Recovery automates bounded safe defects and learns only after one exact approval", () => {
  const bindingDigest = d("binding");
  assert.equal(decideRecovery({ failureClass: "DETERMINISTIC_MECHANICS", failureSignature: "format", bindingDigest, attempt: 0, maxAttempts: 2, identicalInputs: true, reversible: true, externalEffect: false }).action, "AUTO_REPAIR");
  assert.equal(decideRecovery({ failureClass: "DETERMINISTIC_MECHANICS", failureSignature: "external-format", bindingDigest, attempt: 0, maxAttempts: 2, identicalInputs: true, reversible: true, externalEffect: true }).action, "FAIL");
  assert.equal(decideRecovery({ failureClass: "UNCERTAIN_MUTATION", failureSignature: "publish", bindingDigest, attempt: 1, maxAttempts: 2, identicalInputs: true, reversible: false, externalEffect: true }).humanRequired, true);
  assert.equal(decideRecovery({ failureClass: "UNKNOWN", failureSignature: "new-safe-case", bindingDigest, attempt: 0, maxAttempts: 2, identicalInputs: true, reversible: true, externalEffect: false }).action, "PROPOSE_AUTOMATION_RULE");
  const proposal = proposeAutomationRule({ id: "rule-1", failureSignature: "new-safe-case", failureClass: "UNKNOWN", scope: { projectId: "sample" }, strategy: "REPAIR_THEN_RETRY", maxAttempts: 2, preconditions: ["same-binding"], prohibitedEffects: ["publish"] });
  const rule = activateAutomationRule(proposal, { proposalDigest: proposal.digest, actor: "owner", evidenceRef: "decision://1", approvedAt: "2026-09-08T00:00:00Z" });
  const safeRuleContext = { failureSignature: "new-safe-case", failureClass: "UNKNOWN", identicalInputs: true, reversible: true, externalEffect: false, projectId: "sample", now: "2026-09-08T00:00:01Z" };
  assert.equal(automationRuleApplies(rule, safeRuleContext), true);
  assert.equal(automationRuleApplies(rule, { ...safeRuleContext, failureClass: "AUTHORITY_REQUIRED" }), false);
  assert.equal(automationRuleApplies(rule, { ...safeRuleContext, externalEffect: true }), false);
});

test("Host, execution runtime, and legacy Suite transition are separate enforceable boundaries", () => {
  const host = normalizeAgentHostProfile({ schema: "evopilot-agent-host-profile/v1", id: "codex", version: "1", protocolVersions: ["1.0"], capabilities: ["mcp"], interactionModes: ["skill", "mcp"] });
  const runtime = normalizeExecutionRuntimeProfile({ schema: "evopilot-execution-runtime-profile/v1", id: "local", version: "1", provider: "openai", model: "configured-by-host", capabilities: ["filesystem"], permissionMode: "HOST_MANAGED_DENY_UNDECLARED" });
  assert.notEqual(host.digest, runtime.digest);
  assert.doesNotThrow(() => assertNoLegacySuiteFallback({ legacySuiteInvocationCount: 0, loadedPaths: [] }));
  assert.throws(() => assertNoLegacySuiteFallback({ legacySuiteInvocationCount: 1, loadedPaths: [] }), /LEGACY_SUITE_INVOCATION_DETECTED/);
});

test("legacy Suite comparison binds late exact read-only snapshots and stales only affected evidence", () => {
  const baseline = normalizeLegacySuiteSnapshot({ schema: "evopilot-legacy-suite-snapshot/v1", suiteId: "datarig-codex-suite", sourceIdentity: "git:/datarig-suite", version: "3.0.0", treeDigest: d("tree-a"), skillAndRuleInventory: [{ path: "skills/orchestrator", digest: d("orchestrator-a") }], capturedAt: "2026-09-08T00:00:00Z", comparisonCorpusDigest: d("corpus"), readOnly: true });
  const same = normalizeLegacySuiteSnapshot({ ...baseline, capturedAt: "2026-09-08T01:00:00Z", digest: undefined });
  assert.equal(compareLegacySuiteSnapshots({ baseline, current: same, affectedEvidenceRefs: ["evidence://datarig"] }).status, "CURRENT");
  const changed = normalizeLegacySuiteSnapshot({ ...baseline, treeDigest: d("tree-b"), capturedAt: "2026-09-08T02:00:00Z", digest: undefined });
  const comparison = compareLegacySuiteSnapshots({ baseline, current: changed, affectedEvidenceRefs: ["evidence://datarig", "evidence://datarig"] });
  assert.equal(comparison.status, "STALE");
  assert.deepEqual(comparison.selectiveRerunEvidenceRefs, ["evidence://datarig"]);
  const proof = createLegacySuiteIsolationProof({ environment: "ISOLATED_CANDIDATE", expectedAbsentSuiteIds: ["evopilot-codex-suite", "datarig-codex-suite"], presentSuiteIds: [], legacySuiteInvocationCount: 0, loadedPaths: ["/candidate/evopilot"], realInstalledSuiteMutations: [] });
  assert.equal(proof.status, "INDEPENDENT");
  assert.throws(() => createLegacySuiteIsolationProof({ environment: "ISOLATED_CANDIDATE", expectedAbsentSuiteIds: ["datarig-codex-suite"], presentSuiteIds: ["datarig-codex-suite"], legacySuiteInvocationCount: 0, loadedPaths: [], realInstalledSuiteMutations: [] }), /PRESENT_IN_ISOLATED_CANDIDATE/);
});
