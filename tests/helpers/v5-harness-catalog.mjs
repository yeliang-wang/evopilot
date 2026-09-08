import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function createSoftwareDeliveryHarnessRegistry(root) {
  const catalogRoot = path.join(root, "v5-test-harness-catalog");
  const component = {
    apiVersion: "harness.evopilot.io/v3",
    kind: "HarnessComponent",
    metadata: {
      id: "software-delivery-validation",
      version: "1.0.0",
      name: "Software Delivery Validation",
      description: "Test-only published validation component for governed software delivery.",
      lifecycle: "published",
      labels: { capability: "software-delivery-validation" }
    },
    spec: {
      capability: "software-delivery-validation",
      environment: { workspaceMode: "isolated", requiredTools: ["node"] },
      actions: [{ id: "validate-approved-change", description: "Validate an approved project change.", executor: "shell", inputs: ["approved-command"], outputs: ["validation-result"] }],
      constraints: ["Execute only commands already allowed by the project binding."],
      evidence: ["validation-result"],
      validators: [{ id: "validation-exit-code", type: "exit-code", assertion: "exit code equals zero", evidenceRefs: ["validation-result"], blocking: true }]
    },
    provenance: { sourceDigests: [digestObject({ source: "v5-test-component" })], ontologyVersion: "software-engineering@1.0.0", policyVersion: "default-matcher@1.0.0" }
  };
  const componentDigest = digestObject(component);
  const profile = {
    apiVersion: "harness.evopilot.io/v3",
    kind: "HarnessProfile",
    metadata: {
      id: "software-delivery",
      version: "1.0.0",
      name: "Software Delivery Harness",
      description: "Test-only published Profile for project delivery and workflow evolution.",
      lifecycle: "published",
      labels: { domain: "software-delivery" }
    },
    spec: {
      classification: { domain: "software-delivery", role: "software-engineering", taskClass: "project-evolution" },
      boundary: { inScope: ["Project delivery, workflow, onboarding, and release evolution."], outOfScope: ["Harness asset authoring and publication."] },
      match: {
        positiveConcepts: ["project", "workflow", "onboarding", "delivery", "agent"],
        negativeConcepts: ["harness-authoring"],
        requiredEvidenceKinds: ["source-code", "validation-result"]
      },
      components: [{ id: "software-delivery-validation", version: "1.0.0", required: true }],
      acceptance: { requiredEvidence: ["target-evidence-package"], blockingValidators: ["validation-exit-code"] },
      evaluationPackRef: "software-delivery@1.0.0"
    },
    provenance: { sourceDigests: [digestObject({ source: "v5-test-profile" })], ontologyVersion: "software-engineering@1.0.0", policyVersion: "default-matcher@1.0.0" }
  };
  const profileDigest = digestObject(profile);
  const bundle = {
    apiVersion: "harness.evopilot.io/v3",
    kind: "HarnessBundle",
    metadata: {
      id: "software-delivery",
      version: "1.0.0",
      name: "Software Delivery Harness Bundle",
      description: "Test-only immutable execution Bundle for software delivery.",
      lifecycle: "published",
      labels: { domain: "software-delivery" }
    },
    spec: {
      profile: { id: "software-delivery", version: "1.0.0", digest: profileDigest },
      resolvedComponents: [{ id: "software-delivery-validation", version: "1.0.0", digest: componentDigest, required: true }],
      executionPlan: ["validate-approved-change"],
      constraints: ["Preserve project and authority boundaries."],
      evidence: ["target-evidence-package"],
      validators: ["validation-exit-code"],
      exports: [{ adapter: "evopilot", path: "exports/evopilot/template.yaml" }]
    },
    provenance: { sourceDigests: [digestObject({ source: "v5-test-bundle" })], ontologyVersion: "software-engineering@1.0.0", policyVersion: "default-matcher@1.0.0" }
  };
  const records = [component, profile, bundle].map((asset) => ({ asset, digest: digestObject(asset) }));
  const entries = records.map(({ asset, digest }) => {
    const kindDir = { HarnessComponent: "components", HarnessProfile: "profiles", HarnessBundle: "bundles" }[asset.kind];
    const assetPath = `./assets/${kindDir}/${asset.metadata.id}/${asset.metadata.version}/asset.yaml`;
    const absolutePath = path.join(catalogRoot, assetPath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, `${JSON.stringify(asset, null, 2)}\n`);
    return {
      kind: asset.kind,
      id: asset.metadata.id,
      version: asset.metadata.version,
      lifecycle: asset.metadata.lifecycle,
      assetPath,
      assetDigest: digest,
      ...(asset.kind === "HarnessProfile" || asset.kind === "HarnessBundle" ? { classification: profile.spec.classification } : {}),
      ...(asset.kind === "HarnessBundle" ? { exportAdapters: ["evopilot"] } : {})
    };
  });
  const index = {
    schema: "evopilot-harness-catalog/v3",
    catalogId: "software-delivery-v5-test",
    generatedAt: "2026-09-08T00:00:00.000Z",
    generatedBy: "evopilot-v5-functional-test",
    assetApiVersion: "harness.evopilot.io/v3",
    entryCount: entries.length,
    entries
  };
  index.catalogDigest = digestObject({
    schema: index.schema,
    catalogId: index.catalogId,
    generatedBy: index.generatedBy,
    assetApiVersion: index.assetApiVersion,
    entryCount: index.entryCount,
    entries: index.entries
  });
  fs.mkdirSync(catalogRoot, { recursive: true });
  fs.writeFileSync(path.join(catalogRoot, "CATALOG.md"), [
    "# Harness Catalog: software-delivery-v5-test",
    "",
    "```yaml evopilot-harness-catalog-v3",
    JSON.stringify(index, null, 2),
    "```",
    ""
  ].join("\n"));
  const registryPath = path.join(root, "v5-test-harness-registry.yaml");
  fs.writeFileSync(registryPath, [
    "schema: evopilot-harness-registry/v2",
    "generatedBy: evopilot-v5-functional-test",
    "catalogs:",
    "  - id: software-delivery-v5-test",
    "    enabled: true",
    "    priority: 100",
    "    root: ./v5-test-harness-catalog",
    "    release: v1.0.0",
    `    expectedCatalogDigest: ${index.catalogDigest}`,
    ""
  ].join("\n"));
  return registryPath;
}

function digestObject(value) {
  return `sha256:${crypto.createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
