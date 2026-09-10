#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest, createCapabilityInventory } from "../packages/core/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(root, "governance", "suite-convergence", "frozen-latest.json");
const outputPath = path.join(root, "governance", "suite-convergence", "capability-inventory.json");

export function buildSuiteCapabilityInventory({ write = true } = {}) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const sources = baseline.sources.map((source) => ({
    suiteId: source.suiteId,
    sourceVersion: source.sourceVersion,
    snapshotDigest: source.snapshotDigest,
    capabilities: source.capabilities.map((capability) => ({ ...capability, digest: canonicalDigest({ suiteId: source.suiteId, sourceVersion: source.sourceVersion, ...capability }) }))
  }));
  const dispositions = sources.flatMap((source) => source.capabilities.map((capability) => disposition(source.suiteId, capability.id)));
  const inventory = createCapabilityInventory({ sources, dispositions });
  if (write) fs.writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);
  return inventory;
}

function disposition(sourceSuiteId, capabilityId) {
  const expert = new Set(["entry-routing", "documentation-assurance"]);
  const runtime = new Set(["bounded-defect-closure", "bounded-recovery", "completion-assurance"]);
  const harness = new Set(["harness-guided-operation"]);
  const advisory = new Set(["evolution-journal", "oss-maturity-audit", "dashboard-routing"]);
  const owner = expert.has(capabilityId) ? "EXPERT" : runtime.has(capabilityId) ? "RUNTIME" : harness.has(capabilityId) ? "HARNESS" : advisory.has(capabilityId) ? "PROJECT" : "RESOURCE";
  const ref = owner === "EXPERT" ? "EvolutionExpert/interaction" : owner === "RUNTIME" ? "Runtime/governed-evolution" : owner === "HARNESS" ? "HarnessBundle/published-binding" : owner === "PROJECT" ? `ProjectCapability/${capabilityId}` : `GovernancePack/migrated/${capabilityId}`;
  return { sourceSuiteId, capabilityId, destination: { owner, ref }, validatorIds: [`suite-convergence:${capabilityId}`] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inventory = buildSuiteCapabilityInventory();
  process.stdout.write(`${JSON.stringify({ status: inventory.status, coverage: inventory.coverage, digest: inventory.digest }, null, 2)}\n`);
}
