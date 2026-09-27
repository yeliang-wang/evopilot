// Synthetic published catalog fixture, shared shape with the Catalog consumer regression.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export function createV3HarnessCatalog(root) {
  const catalogRoot = path.join(root, "v3-catalog");
  const component = {
    apiVersion: "harness.evopilot.io/v3",
    kind: "HarnessComponent",
    metadata: {
      id: "engineering-validation",
      version: "1.0.0",
      name: "Engineering Validation",
      description: "Executes approved validation commands and records immutable evidence.",
      lifecycle: "published",
      labels: { capability: "project.read" }
    },
    spec: {
      capability: "project.read",
      environment: { workspaceMode: "isolated", requiredTools: ["node"] },
      actions: [{ id: "run-approved-validation", description: "Run administrator-approved validation commands.", executor: "shell", inputs: ["approved-command"], outputs: ["validation-result"] }],
      constraints: ["Only administrator-approved commands may execute."],
      evidence: ["validation-result"],
      validators: [{ id: "validation-exit-code", type: "exit-code", assertion: "exit code equals zero", evidenceRefs: ["validation-result"], blocking: true }]
    },
    provenance: { sourceDigests: [digestObject({ source: "test-component" })], ontologyVersion: "software-engineering@1.0.0", policyVersion: "default-matcher@1.0.0" }
  };
  const componentDigest = digestObject(component);
  const profile = {
    apiVersion: "harness.evopilot.io/v3",
    kind: "HarnessProfile",
    metadata: {
      id: "database-product",
      version: "3.0.0",
      name: "Database Product Harness",
      description: "Domain Harness Profile for self-developed database product engineering.",
      lifecycle: "published",
      labels: { domain: "database-product" }
    },
    spec: {
      classification: { domain: "database-product", role: "database-product-engineering", taskClass: "domain-task" },
      boundary: { inScope: ["Database engine, SQL optimizer, transaction, storage, recovery, and replication engineering."], outOfScope: ["Database connection and ORM application integration."] },
      match: {
        positiveConcepts: ["database-product", "database-engine", "sql-optimizer", "transaction-recovery", "storage-engine", "replication"],
        negativeConcepts: ["database-connection", "orm"],
        requiredEvidenceKinds: ["source-code", "build-manifest"]
      },
      components: [{ id: "engineering-validation", version: "1.0.0", required: true }],
      acceptance: { requiredEvidence: ["sql-compatibility-report", "recovery-report"], blockingValidators: ["validation-exit-code"] },
      evaluationPackRef: "database-product@3.0.0"
    },
    provenance: { sourceDigests: [digestObject({ source: "test-profile" })], ontologyVersion: "software-engineering@1.0.0", policyVersion: "default-matcher@1.0.0" }
  };
  const profileDigest = digestObject(profile);
  const bundle = {
    apiVersion: "harness.evopilot.io/v3",
    kind: "HarnessBundle",
    metadata: {
      id: "database-product",
      version: "3.0.0",
      name: "Database Product Harness Bundle",
      description: "Immutable resolved execution Bundle for database product engineering.",
      lifecycle: "published",
      labels: { domain: "database-product" }
    },
    spec: {
      profile: { id: "database-product", version: "3.0.0", digest: profileDigest },
      resolvedComponents: [{ id: "engineering-validation", version: "1.0.0", digest: componentDigest, required: true }],
      executionPlan: ["discover-project-commands", "run-approved-validation"],
      constraints: ["Run only approved commands in an isolated workspace."],
      evidence: ["target-evidence-package", "sql-compatibility-report"],
      validators: ["validation-exit-code"],
      exports: [{ adapter: "evopilot", path: "exports/evopilot/template.yaml" }]
    },
    provenance: { sourceDigests: [digestObject({ source: "test-bundle" })], ontologyVersion: "software-engineering@1.0.0", policyVersion: "default-matcher@1.0.0" }
  };
  const bundleDigest = digestObject(bundle);
  const records = [
    { kind: component.kind, id: component.metadata.id, version: component.metadata.version, lifecycle: component.metadata.lifecycle, asset: component, assetDigest: componentDigest },
    { kind: profile.kind, id: profile.metadata.id, version: profile.metadata.version, lifecycle: profile.metadata.lifecycle, asset: profile, assetDigest: profileDigest, classification: profile.spec.classification },
    { kind: bundle.kind, id: bundle.metadata.id, version: bundle.metadata.version, lifecycle: bundle.metadata.lifecycle, asset: bundle, assetDigest: bundleDigest, classification: profile.spec.classification, exportAdapters: ["evopilot"] }
  ];
  const entries = records.map((record) => {
    const kindDir = { HarnessComponent: "components", HarnessProfile: "profiles", HarnessBundle: "bundles" }[record.kind];
    const relativePath = `./assets/${kindDir}/${record.id}/${record.version}/asset.yaml`;
    const assetPath = path.join(catalogRoot, relativePath);
    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    fs.writeFileSync(assetPath, JSON.stringify(record.asset, null, 2));
    return {
      kind: record.kind,
      id: record.id,
      version: record.version,
      lifecycle: record.lifecycle,
      assetPath: relativePath,
      assetDigest: record.assetDigest,
      ...(record.classification ? { classification: record.classification } : {}),
      ...(record.exportAdapters ? { exportAdapters: record.exportAdapters } : {})
    };
  });
  const index = {
    schema: "evopilot-harness-catalog/v3",
    catalogId: "database-product-v3",
    generatedAt: "2026-08-10T00:00:00.000Z",
    generatedBy: "evopilot-harness@3",
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
  fs.writeFileSync(path.join(catalogRoot, "CATALOG.md"), [
    "# Harness Catalog: database-product-v3",
    "",
    "```yaml evopilot-harness-catalog-v3",
    JSON.stringify(index, null, 2),
    "```",
    ""
  ].join("\n"));
  return {
    catalogRoot,
    catalogDigest: index.catalogDigest,
    componentDigest,
    profileDigest,
    bundleDigest,
    profilePath: path.join(catalogRoot, "assets/profiles/database-product/3.0.0/asset.yaml"),
    index
  };
}

export function writeHarnessRegistryV2(root, catalog) {
  const registryPath = path.join(root, "harness-registry-v2.yaml");
  fs.writeFileSync(registryPath, [
    "schema: evopilot-harness-registry/v2",
    "generatedBy: evopilot-harness@3",
    "catalogs:",
    "  - id: database-product-v3",
    "    enabled: true",
    "    priority: 200",
    "    root: ./v3-catalog",
    "    release: v3.0.0",
    `    expectedCatalogDigest: ${catalog.catalogDigest}`,
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
