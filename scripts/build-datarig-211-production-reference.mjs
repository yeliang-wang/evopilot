import fs from "node:fs";
import path from "node:path";
import { canonicalDigest, normalizeGovernedResource } from "../packages/core/dist/index.js";

const root = path.resolve(import.meta.dirname, "..");
const inventoryPath = path.join(root, "governance/suite-convergence/datarig-2.1.11-capability-inventory.json");
const outputPath = path.join(root, "examples/governed-evolution/datarig-production-delivery-v1.json");
const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));

if (inventory.source.suiteVersion !== "2.1.11" || inventory.coverage.sourceItems !== 20 || inventory.coverage.unmappedItems !== 0 || inventory.coverage.silentlyExcludedItems !== 0) throw new Error("DATARIG_211_REFERENCE_INVENTORY_INCOMPLETE");
if (inventory.source.suiteGate.decision !== "PASS" || inventory.source.suiteGate.criticalFileCount !== 90 || inventory.source.suiteGate.advisoryFileCount !== 8) throw new Error("DATARIG_211_REFERENCE_SUITE_GATE_INVALID");

const derived = inventory.items.filter((item) => !["NON_APPLICABLE_WITH_REASON", "DATARIG_OWNED_BEHAVIOR", "PROJECT_DEFINITION"].includes(item.disposition));
const resources = derived.map((item) => resourceFor(item));
const projectItem = inventory.items.find((item) => item.disposition === "PROJECT_DEFINITION");
const projectDefinition = {
  schema: "evopilot-evolution-project-definition/v1",
  metadata: { id: "datarig-production-delivery", name: "DataRig production delivery reference", version: "1.0.0", labels: { reference: "datarig", delivery: "enterprise-internal" } },
  provenance: { sourceSuiteId: inventory.source.suiteId, sourceSuiteVersion: inventory.source.suiteVersion, sourceDigest: projectItem.sourceDigest, inventoryId: inventory.id },
  spec: {
    source: { provider: "gitlab", repository: "declared-by-operator", defaultBranch: "main", mode: "owned" },
    ecosystem: { languages: ["java"], packageManagers: ["maven"], frameworks: [] },
    delivery: { model: "enterprise-internal", ciProvider: "gitlab", candidateBeforeAcceptance: true, noRebuildPromotion: true, channels: ["maven"] },
    environment: { development: "local", acceptance: "isolated-real-database" },
    policyRefs: resources.filter((item) => item.kind === "PolicyPack").map(ref),
    lifecycleRefs: ["datarig-production-delivery@1.0.0"],
    secretRefs: ["secret://workspace/datarig-database", "secret://workspace/datarig-release"],
    hostPreferences: ["codex", "claude-code", "workbuddy", "generic-mcp"],
    runtimePreferences: ["external-agent-runtime"],
    evidenceSources: ["gitlab", "maven", "database-e2e", "agent-host"]
  }
};
projectDefinition.digest = canonicalDigest({ ...projectDefinition, digest: undefined });

const material = {
  schema: "evopilot-production-delivery-reference/v1",
  id: "datarig-production-delivery",
  version: "1.0.0",
  status: "REFERENCE_ONLY_INACTIVE",
  source: {
    suiteId: inventory.source.suiteId,
    suiteVersion: inventory.source.suiteVersion,
    manifestDigest: inventory.source.manifestDigest,
    criticalContentDigest: inventory.source.criticalContentDigest,
    advisoryContentDigest: inventory.source.advisoryContentDigest,
    inventoryDigest: canonicalDigest(inventory)
  },
  projectDefinition,
  lifecycleRef: { id: "datarig-production-delivery", version: "1.0.0", source: "lifecycles/reference/datarig-production-delivery.yaml" },
  resources,
  itemProvenance: inventory.items.map((item) => ({ id: item.id, sourceClass: item.sourceClass, sourceDigest: item.sourceDigest, disposition: item.disposition, destination: item.destination, validatorId: item.validatorId, ...(item.reason ? { reason: item.reason } : {}) })),
  coverage: { sourceItems: 20, dispositionedItems: 20, unmappedItems: 0, silentlyExcludedItems: 0, criticalFilesDigestCovered: 90, advisoryFilesDigestCovered: 8, percent: 100 },
  boundary: { runtimeDependency: false, suiteInvocationAllowed: false, suiteMutationAllowed: false, automaticActivation: false, projectSpecificRuntimeBranch: false, activationRequiresRuntimeDecision: true }
};
const output = `${JSON.stringify({ ...material, digest: canonicalDigest(material) }, null, 2)}\n`;

if (process.argv.includes("--check")) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== output) throw new Error("DATARIG_211_PRODUCTION_REFERENCE_DRIFT");
  console.log("DataRig 2.1.11 production reference is complete and current.");
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  console.log(`Wrote ${path.relative(root, outputPath)} with ${resources.length} resources and ${inventory.items.length} provenance rows.`);
}

function resourceFor(item) {
  const kind = item.disposition === "GOVERNANCE_PACK" ? "GovernancePack"
    : item.disposition === "ACTION_PROVIDER" ? "ActionProviderDefinition"
      : item.disposition === "POLICY_RESOURCE" ? "PolicyPack"
        : item.disposition === "LIFECYCLE_RESOURCE" ? "LifecycleModule" : "CapabilityPack";
  const id = item.destination.toLowerCase().replace(/^[^/]+\//, "").replace(/[^a-z0-9.-]+/g, "-").replace(/\//g, "-");
  const spec = kind === "GovernancePack" ? { gates: [item.validatorId], sourceCapability: item.capability }
    : kind === "ActionProviderDefinition" ? {
        execution: "TYPED_ACTIONS_ONLY", arbitraryShell: false,
        actions: [{ id: item.validatorId, inputSchema: { type: "object", additionalProperties: false }, outputSchema: { type: "object", required: ["receiptDigest"] }, receipt: "IMMUTABLE_REQUIRED", idempotencyKeyRequired: true, rollback: item.id.includes("release-operator") ? "COMPENSATING_ACTION" : "NOT_APPLICABLE", requiredAuthorities: item.id.includes("release-operator") ? ["release.publish"] : [], credentialRefs: item.id.includes("release-operator") ? ["secret://workspace/datarig-release"] : [] }]
      }
      : kind === "PolicyPack" ? { rules: [{ id: item.validatorId, statement: item.capability }], defaultDecision: "DENY_UNDECLARED" }
        : kind === "LifecycleModule" ? { lifecycleRef: "datarig-production-delivery@1.0.0", capability: item.capability, validatorId: item.validatorId }
          : { capability: item.capability, expertJourney: "controlled-lifecycle-evolution", validatorId: item.validatorId };
  return normalizeGovernedResource({
    apiVersion: "evopilot.io/v1",
    kind,
    metadata: { id, name: item.destination, version: "1.0.0", labels: { reference: "datarig-production-delivery" } },
    provenance: { sourceType: "LEGACY_SUITE", sourceId: inventory.source.suiteId, sourceVersion: inventory.source.suiteVersion, sourceDigest: item.sourceDigest, sourceRef: item.id },
    compatibility: { runtime: ">=6.0.0 <7.0.0", expert: ">=2.0.0 <3.0.0" },
    capabilityRefs: [item.validatorId],
    spec
  });
}

function ref(resource) {
  return `${resource.kind}/${resource.metadata.id}@${resource.metadata.version}#${resource.digest}`;
}
