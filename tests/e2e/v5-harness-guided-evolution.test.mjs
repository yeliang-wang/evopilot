import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalDigest } from "../../packages/core/dist/index.js";
import { EVOLUTION_EXPERT_CORE, createExpertAdapter, planExpertTurn } from "../../packages/evolution-expert/dist/index.js";
import { GovernedEvolutionService } from "../../packages/server/dist/domains/governed-evolution/index.js";

test("new project travels from declaration through Harness-guided plan without a legacy Suite", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-v5-e2e-"));
  const d = (value) => canonicalDigest(value);
  try {
    const service = new GovernedEvolutionService(root);
    service.registerProjectDefinition({ schema: "evopilot-evolution-project-definition/v1", metadata: { id: "fresh-service", name: "Fresh Service", version: "1.0.0", labels: { delivery: "oss" } }, spec: { source: { provider: "github", repository: "org/fresh-service", defaultBranch: "main", mode: "owned" }, ecosystem: { languages: ["typescript"], packageManagers: ["npm"], frameworks: [] }, delivery: { model: "open-source", ciProvider: "github-actions", candidateBeforeAcceptance: true, noRebuildPromotion: true, channels: ["npm"] }, environment: { development: "local", acceptance: "isolated-rc" }, policyRefs: ["policy://oss/v1"], lifecycleRefs: ["lifecycle://oss/1"], secretRefs: [], hostPreferences: ["generic-mcp"], runtimePreferences: ["local"], evidenceSources: ["ci"] } });
    const profileDigest = d("fresh-profile");
    const bundle = { id: "node-oss-bundle", version: "1", digest: d("fresh-bundle"), profileDigest, componentDigests: [d("build")], requiredEvidence: ["tests"], validators: ["integrity"], constraints: ["candidate-first"], capabilities: ["build.execute"], permissions: ["build.verify"] };
    const fixed = d("fixed");
    const plan = service.plan({ projectDefinitionId: "fresh-service", goalTarget: { projectId: "fresh-service", goalId: "goal", targetId: "target", objective: "Build npm release candidate", taskClass: "release", domain: "software", requiredCapabilities: ["build.execute"] }, candidates: [{ profile: { id: "node-oss", version: "1", digest: profileDigest, catalogId: "public", catalogDigest: d("catalog"), registryDigest: d("registry"), domains: ["software"], taskClasses: ["release"], positiveConcepts: ["npm"], negativeConcepts: [] }, bundle, published: true, eligible: true }], lifecycle: { ref: { id: "oss", version: "1" }, digest: d("lifecycle"), definition: { capabilities: ["build.execute"], obligations: { requiredEvidence: ["sbom"], validators: ["signature"], constraints: ["no-rebuild"], requestedPermissions: ["build.verify"] } } }, policyDigest: fixed, providerDigest: fixed, environmentDigest: fixed, hostDigest: fixed, runtimeDigest: fixed, authorityDigest: fixed, evidenceDigest: fixed });
    assert.equal(plan.binding.bundleRef.digest, bundle.digest);
    assert.deepEqual(plan.binding.revalidateAt, ["start", "resume", "retry", "loop-iteration"]);
    assert.equal(createExpertAdapter("generic-mcp").coreDigest, EVOLUTION_EXPERT_CORE.digest);
    assert.equal(planExpertTurn("why this harness", { projectDefinitionId: "fresh-service", goalTarget: {}, lifecycleId: "oss" }).intent, "harness-explain");
    assert.equal(service.readBinding(plan.binding.digest)?.digest, plan.binding.digest);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
