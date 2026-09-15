import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { normalizeGovernedResource, qualifyActionProvider } from "../../packages/core/dist/index.js";
import { LifecycleService } from "../../packages/server/dist/domains/lifecycle/index.js";

const root = path.resolve(import.meta.dirname, "../..");
const inventory = JSON.parse(fs.readFileSync(path.join(root, "governance/suite-convergence/datarig-2.1.11-capability-inventory.json"), "utf8"));
const reference = JSON.parse(fs.readFileSync(path.join(root, "examples/governed-evolution/datarig-production-delivery-v1.json"), "utf8"));

test("exact DataRig Suite 2.1.11 production reference covers every item without invoking or mutating the Suite", () => {
  assert.equal(inventory.source.suiteVersion, "2.1.11");
  assert.equal(inventory.source.suiteGate.decision, "PASS");
  assert.equal(inventory.coverage.sourceItems, 20);
  assert.equal(reference.itemProvenance.length, 20);
  assert.deepEqual(reference.itemProvenance.map((item) => item.id).sort(), inventory.items.map((item) => item.id).sort());
  assert.deepEqual(reference.coverage, { sourceItems: 20, dispositionedItems: 20, unmappedItems: 0, silentlyExcludedItems: 0, criticalFilesDigestCovered: 90, advisoryFilesDigestCovered: 8, percent: 100 });
  assert.equal(reference.boundary.runtimeDependency, false);
  assert.equal(reference.boundary.suiteInvocationAllowed, false);
  assert.equal(reference.boundary.suiteMutationAllowed, false);
  assert.equal(reference.boundary.projectSpecificRuntimeBranch, false);
});

test("DataRig production delivery resolves entirely as valid declarations and typed providers", () => {
  const resources = reference.resources.map(normalizeGovernedResource);
  assert.equal(resources.length, 17);
  const providers = resources.filter((item) => item.kind === "ActionProviderDefinition");
  assert.equal(providers.length, 4);
  for (const provider of providers) {
    const actions = provider.spec.actions;
    const authorities = actions.flatMap((action) => action.requiredAuthorities);
    const credentials = actions.flatMap((action) => action.credentialRefs);
    assert.equal(qualifyActionProvider(provider, authorities, credentials).status, "QUALIFIED");
  }
  const lifecycle = new LifecycleService(path.join(root, ".tmp-datarig-reference-test"), [path.join(root, "lifecycles")]).catalog.resolve("datarig-production-delivery", "1.0.0");
  assert.equal(lifecycle.definition.metadata.version, "1.0.0");
  assert.equal(lifecycle.definition.stages.some((stage) => stage.action.uses === "evopilot.goal-loop@1"), true);
  assert.equal(lifecycle.definition.stages.some((stage) => stage.decision.authority === "production"), true);
  assert.equal(lifecycle.definition.stages.some((stage) => stage.decision.authority === "release"), true);
  fs.rmSync(path.join(root, ".tmp-datarig-reference-test"), { recursive: true, force: true });
});

test("controlled evolution Core and service contain no DataRig project branch", () => {
  const files = [
    "packages/core/src/controlled-lifecycle-evolution.ts",
    "packages/server/src/domains/governed-evolution/service.ts",
    "packages/server/src/http/routes/governed-evolution.ts"
  ];
  for (const file of files) assert.equal(/datarig/i.test(fs.readFileSync(path.join(root, file), "utf8")), false, file);
});
