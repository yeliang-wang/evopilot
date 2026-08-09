import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "../../packages/server/dist/index.js";

test("EvoPilot consumes a published Harness Catalog without exposing Harness lifecycle APIs", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-catalog-consumer-"));
  const catalogRoot = createPublishedHarnessCatalog(dataRoot);
  const projectRoot = path.join(dataRoot, "self-developed-sql-engine");
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "README.md"), "# Self Developed SQL Engine\n\nDistributed database product with SQL optimizer, transaction log, and storage engine.\n");

  const server = createServer({
    dataRoot,
    runtimeMode: "debug",
    harnessCatalogDirs: [catalogRoot],
    tokens: [
      { name: "viewer", token: "viewer-token", role: "viewer" },
      { name: "operator", token: "operator-token", role: "operator" },
      { name: "admin", token: "admin-token", role: "admin" }
    ]
  });
  await listen(server);
  const baseUrl = serverUrl(server);

  try {
    const catalogs = await jsonFetch(`${baseUrl}/api/v1/harness/catalogs`, { token: "viewer-token" });
    assert.equal(catalogs.status, 200);
    assert.equal(catalogs.body.data.schema, "evopilot-harness-catalog-list/v1");
    assert.equal(catalogs.body.data.catalogs[0].catalogId, "evopilot-public-harness-catalog");
    assert.equal(catalogs.body.data.mounts[0].lastReadStatus, "READY");
    assert.equal(catalogs.body.data.templates[0].id, "database-product-harness");
    assert.equal(catalogs.body.data.nextAction, "use-catalog-harness-for-project-auto-match");

    const inspect = await jsonFetch(`${baseUrl}/api/v1/harness/catalogs/evopilot-public-harness-catalog`, { token: "viewer-token" });
    assert.equal(inspect.status, 200);
    assert.equal(inspect.body.data.scan.status, "READY");
    assert.equal(inspect.body.data.templates[0].catalogRef.catalogId, "evopilot-public-harness-catalog");

    const removedTemplateList = await jsonFetch(`${baseUrl}/api/v1/harness/templates`, { token: "admin-token" });
    assert.equal(removedTemplateList.status, 404);
    const removedTemplateEvolution = await jsonFetch(`${baseUrl}/api/v1/harness/template-evolutions`, {
      method: "POST",
      token: "admin-token",
      body: {}
    });
    assert.equal(removedTemplateEvolution.status, 404);
    const removedCatalogMount = await jsonFetch(`${baseUrl}/api/v1/harness/catalogs`, {
      method: "POST",
      token: "admin-token",
      body: { source: catalogRoot }
    });
    assert.equal(removedCatalogMount.status, 404);

    const project = await jsonFetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      token: "admin-token",
      body: {
        id: "self-developed-sql-engine",
        name: "Self Developed SQL Engine",
        repository: {
          provider: "local-git",
          root: projectRoot,
          defaultBranch: "main"
        },
        runtime: {
          language: "generic",
          unitCommands: ["npm test"]
        }
      }
    });
    assert.equal(project.status, 201);

    const goal = await jsonFetch(`${baseUrl}/api/v1/goals`, {
      method: "POST",
      token: "operator-token",
      body: {
        id: "database-product-ga",
        projectId: "self-developed-sql-engine",
        releaseTargetId: "ga",
        objective: "Evolve this distributed database product with SQL optimizer, transaction, storage, recovery, and replication compatibility goals."
      }
    });
    assert.equal(goal.status, 201);

    const planned = await jsonFetch(`${baseUrl}/api/v1/goals/database-product-ga/plan`, {
      method: "POST",
      token: "operator-token",
      body: {}
    });
    assert.equal(planned.status, 201);
    assert.equal(planned.body.data.plan.selectedHarness.schema, "evopilot-goal-plan-selected-harness-binding/v1");
    assert.equal(planned.body.data.plan.selectedHarness.harnessId, "database-product-harness");
    assert.equal(planned.body.data.plan.selectedHarness.version, "3.0.0");
    assert.equal(planned.body.data.plan.selectedHarness.status, "PUBLISHED");
    assert.equal(planned.body.data.plan.selectedHarness.catalogId, "evopilot-public-harness-catalog");
    assert.ok(planned.body.data.plan.selectedHarness.catalogDigest);
    assert.ok(planned.body.data.plan.selectedHarness.entryDigest);
    assert.ok(planned.body.data.plan.selectedHarness.evidence.some((entry) => entry.startsWith("catalogDigest=")));
    assert.ok(planned.body.data.plan.planner.evidence.some((entry) => entry.startsWith("selectedHarness=database-product-harness@3.0.0")));
    assert.equal(planned.body.data.plan.projectHarness, undefined);
  } finally {
    await close(server);
  }
});

test("EvoPilot reads Harness Registry config and ignores legacy catalog dirs when registry is configured", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-registry-consumer-"));
  const catalogRoot = createPublishedHarnessCatalog(dataRoot);
  const badLegacyDir = path.join(dataRoot, "legacy-empty-catalog");
  fs.mkdirSync(badLegacyDir, { recursive: true });
  const registryPath = writeHarnessRegistry(dataRoot, [
    {
      id: "evopilot-public-harness-catalog",
      priority: 200,
      root: "./published",
      expectedCatalogDigest: digestFile(path.join(catalogRoot, "CATALOG.md")),
      release: "v1.2.0"
    }
  ]);
  const projectRoot = path.join(dataRoot, "registry-sql-engine");
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "README.md"), "# Registry SQL Engine\n\nDatabase product with SQL optimizer, transaction log, storage engine, and replication.\n");

  const server = createServer({
    dataRoot,
    runtimeMode: "debug",
    harnessRegistryConfig: registryPath,
    harnessCatalogDirs: [badLegacyDir],
    tokens: [
      { name: "viewer", token: "viewer-token", role: "viewer" },
      { name: "operator", token: "operator-token", role: "operator" },
      { name: "admin", token: "admin-token", role: "admin" }
    ]
  });
  await listen(server);
  const baseUrl = serverUrl(server);

  try {
    const catalogs = await jsonFetch(`${baseUrl}/api/v1/harness/catalogs`, { token: "viewer-token" });
    assert.equal(catalogs.status, 200);
    assert.equal(catalogs.body.data.registry.status, "READY");
    assert.equal(catalogs.body.data.registry.catalogs[0].id, "evopilot-public-harness-catalog");
    assert.equal(catalogs.body.data.mounts.length, 1);
    assert.equal(catalogs.body.data.mounts[0].source, catalogRoot);
    assert.equal(catalogs.body.data.mounts[0].priority, 200);
    assert.equal(catalogs.body.data.mounts[0].lastReadStatus, "READY");

    const project = await jsonFetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      token: "admin-token",
      body: {
        id: "registry-sql-engine",
        name: "Registry SQL Engine",
        repository: {
          provider: "local-git",
          root: projectRoot,
          defaultBranch: "main"
        },
        runtime: {
          language: "generic",
          unitCommands: ["npm test"]
        }
      }
    });
    assert.equal(project.status, 201);

    const goal = await jsonFetch(`${baseUrl}/api/v1/goals`, {
      method: "POST",
      token: "operator-token",
      body: {
        id: "registry-database-product-ga",
        projectId: "registry-sql-engine",
        releaseTargetId: "ga",
        objective: "Evolve this database product with SQL optimizer, transaction, storage, recovery, and replication goals."
      }
    });
    assert.equal(goal.status, 201);

    const planned = await jsonFetch(`${baseUrl}/api/v1/goals/registry-database-product-ga/plan`, {
      method: "POST",
      token: "operator-token",
      body: {}
    });
    assert.equal(planned.status, 201);
    assert.equal(planned.body.data.plan.selectedHarness.harnessId, "database-product-harness");
    assert.equal(planned.body.data.plan.selectedHarness.registryPath, registryPath);
    assert.ok(planned.body.data.plan.selectedHarness.registryDigest);
    assert.equal(planned.body.data.plan.selectedHarness.registryCatalogPriority, 200);
    assert.ok(planned.body.data.plan.selectedHarness.evidence.some((entry) => entry.startsWith("registryDigest=")));
  } finally {
    await close(server);
  }
});

test("EvoPilot uses Harness Registry catalog priority as auto-match tie breaker", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-registry-priority-"));
  const lowCatalog = createSingleHarnessCatalog(dataRoot, {
    catalogRootName: "low-catalog",
    catalogId: "low-priority-catalog",
    harnessId: "alpha-shared-domain-harness",
    version: "1.0.0",
    domain: "shared-domain",
    description: "Shared domain Harness with identical match signals.",
    signals: ["shared-domain", "capability", "workflow"]
  });
  const highCatalog = createSingleHarnessCatalog(dataRoot, {
    catalogRootName: "high-catalog",
    catalogId: "high-priority-catalog",
    harnessId: "zeta-shared-domain-harness",
    version: "1.0.0",
    domain: "shared-domain",
    description: "Shared domain Harness with identical match signals.",
    signals: ["shared-domain", "capability", "workflow"]
  });
  const registryPath = writeHarnessRegistry(dataRoot, [
    { id: "low-priority-catalog", priority: 10, root: "./low-catalog" },
    { id: "high-priority-catalog", priority: 300, root: "./high-catalog" }
  ]);
  const projectRoot = path.join(dataRoot, "shared-domain-project");
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "README.md"), "# Shared Domain\n\nShared-domain capability workflow.\n");

  const server = createServer({
    dataRoot,
    runtimeMode: "debug",
    harnessRegistryConfig: registryPath,
    tokens: [
      { name: "viewer", token: "viewer-token", role: "viewer" },
      { name: "operator", token: "operator-token", role: "operator" },
      { name: "admin", token: "admin-token", role: "admin" }
    ]
  });
  await listen(server);
  const baseUrl = serverUrl(server);

  try {
    const catalogs = await jsonFetch(`${baseUrl}/api/v1/harness/catalogs`, { token: "viewer-token" });
    assert.equal(catalogs.status, 200);
    assert.deepEqual(catalogs.body.data.mounts.map((mount) => mount.catalogId), ["high-priority-catalog", "low-priority-catalog"]);
    assert.equal(catalogs.body.data.templates.length, 2);

    const project = await jsonFetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      token: "admin-token",
      body: {
        id: "shared-domain-project",
        name: "Shared Domain Project",
        repository: {
          provider: "local-git",
          root: projectRoot,
          defaultBranch: "main"
        },
        runtime: {
          language: "generic",
          unitCommands: ["npm test"]
        }
      }
    });
    assert.equal(project.status, 201);

    const goal = await jsonFetch(`${baseUrl}/api/v1/goals`, {
      method: "POST",
      token: "operator-token",
      body: {
        id: "shared-domain-ga",
        projectId: "shared-domain-project",
        releaseTargetId: "ga",
        objective: "Evolve shared-domain capability workflow."
      }
    });
    assert.equal(goal.status, 201);

    const planned = await jsonFetch(`${baseUrl}/api/v1/goals/shared-domain-ga/plan`, {
      method: "POST",
      token: "operator-token",
      body: {}
    });
    assert.equal(planned.status, 201);
    assert.equal(planned.body.data.plan.selectedHarness.harnessId, "zeta-shared-domain-harness");
    assert.equal(planned.body.data.plan.selectedHarness.catalogId, "high-priority-catalog");
    assert.equal(planned.body.data.plan.selectedHarness.registryCatalogPriority, 300);
    assert.ok(planned.body.data.plan.planner.evidence.some((entry) => entry.startsWith("selectedHarness=zeta-shared-domain-harness@1.0.0")));
  } finally {
    assert.ok(lowCatalog);
    assert.ok(highCatalog);
    await close(server);
  }
});

test("EvoPilot rejects invalid Harness Registry refs instead of guessing catalog identity", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-invalid-registry-"));
  createPublishedHarnessCatalog(dataRoot);
  const registryPath = path.join(dataRoot, "harness-registry.yaml");
  fs.writeFileSync(registryPath, [
    "schema: evopilot-harness-registry/v1",
    "generatedBy: evopilot-harness-test",
    "catalogs:",
    "  - enabled: true",
    "    priority: 100",
    "    root: ./published",
    ""
  ].join("\n"));

  const server = createServer({
    dataRoot,
    runtimeMode: "debug",
    harnessRegistryConfig: registryPath,
    tokens: [
      { name: "viewer", token: "viewer-token", role: "viewer" }
    ]
  });
  await listen(server);
  const baseUrl = serverUrl(server);

  try {
    const catalogs = await jsonFetch(`${baseUrl}/api/v1/harness/catalogs`, { token: "viewer-token" });
    assert.equal(catalogs.status, 200);
    assert.equal(catalogs.body.data.registry.status, "FAILED");
    assert.equal(catalogs.body.data.catalogs.length, 0);
    assert.equal(catalogs.body.data.templates.length, 0);
    assert.equal(catalogs.body.data.nextAction, "repair-harness-registry-config");
    assert.ok(catalogs.body.data.registry.blockers.some((blocker) => blocker.includes("missing id")));
  } finally {
    await close(server);
  }
});

function createPublishedHarnessCatalog(root) {
  return createSingleHarnessCatalog(root, {
    catalogRootName: "published",
    catalogId: "evopilot-public-harness-catalog",
    harnessId: "database-product-harness",
    version: "3.0.0",
    domain: "database-product",
    description: "Published domain harness for self-developed database products.",
    signals: ["database", "sql", "optimizer", "transaction", "storage", "replication"]
  });
}

function createSingleHarnessCatalog(root, options) {
  const catalogRoot = path.join(root, options.catalogRootName);
  const catalogId = options.catalogId;
  const harnessId = options.harnessId;
  const version = options.version;
  const domain = options.domain;
  const actualTemplateDir = path.join(catalogRoot, harnessId, version);
  fs.mkdirSync(actualTemplateDir, { recursive: true });
  fs.writeFileSync(path.join(actualTemplateDir, "template.yaml"), [
    "schema: evopilot-harness-template/v1",
    `id: ${harnessId}`,
    `version: ${version}`,
    `name: ${harnessId.split("-").map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(" ")}`,
    `description: ${options.description}`,
    "scope: platform",
    "languageFamily: generic",
    "harnessLayer: domain",
    `domain: ${domain}`,
    "matchSignals:",
    "  include:",
    ...options.signals.map((signal) => `    - ${signal}`),
    "runtimePatterns:",
    "  harnessLayer: domain",
    `  domain: ${domain}`,
    "  runtimeProfiles:",
    "    - generic",
    "  compatibilityProfiles:",
    "    - mysql-compatible",
    "  architectureProfiles:",
    "    - distributed-sql-engine",
    "  referenceBoundary:",
    "    forbiddenRoles:",
    "      - replace the owner's product",
    "  domainExecution:",
    "    requiredActions:",
    "      - id: compatibility-targets",
    "        title: Define database compatibility targets",
    "    evidenceAdapters:",
    "      - id: sqllogictest",
    "        source: sqllogictest reports",
    "    releaseBlockers:",
    "      - id: data-loss-risk",
    "        severity: critical",
    "validationBaseline:",
    "  referenceProductsAreOraclesOnly: true",
    "evidenceContract:",
    "  requiredArtifacts:",
    "    - sql-compatibility-report",
    "failureTaxonomy:",
    "  categories:",
    "    - correctness",
    "diagnosticsBaseline:",
    "  requiredSignals:",
    "    - failing-sql",
    "observabilityBaseline:",
    "  requiredSignals:",
    "    - query-latency",
    "governanceRules:",
    "  tenantWorkspaceScopeRequired: true",
    "phaseMapping:",
    "  alpha:",
    "    - compatibility-targets",
    "  beta:",
    "    - sql-compatibility-report",
    "  rc:",
    "    - recovery-drill",
    "  ga:",
    "    - release-decision",
    "llmDraftPolicy:",
    "  enabled: true",
    "  requireUserReview: true",
    "sourceReferences:",
    "  - name: internal database product practice",
    "    category: engineering-practice",
    "    rationale: Captures database product evolution controls from prior projects.",
    "changelog:",
    `  - version: ${version}`,
    `    summary: Publish ${harnessId} through external catalog.`,
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(catalogRoot, "CATALOG.md"), [
    "# EvoPilot Harness Catalog",
    "",
    "```yaml evopilot-harness-catalog",
    "catalogVersion: 1",
    `catalogId: ${catalogId}`,
    "generatedAt: \"2026-08-09T00:00:00.000Z\"",
    "compatibleEvopilot: \">=3.0.0\"",
    "entries:",
    `  - name: ${harnessId}`,
    `    version: ${version}`,
    "    layer: domain",
    `    domain: ${domain}`,
    "    status: published",
    `    path: ./${harnessId}/${version}/template.yaml`,
    "    tags:",
    `      - ${domain}`,
    "```",
    ""
  ].join("\n"));
  return catalogRoot;
}

function writeHarnessRegistry(root, catalogs) {
  const registryPath = path.join(root, "harness-registry.yaml");
  fs.writeFileSync(registryPath, [
    "schema: evopilot-harness-registry/v1",
    "generatedBy: evopilot-harness-test",
    "generatedAt: \"2026-08-09T00:00:00.000Z\"",
    "catalogs:",
    ...catalogs.flatMap((catalog) => [
      `  - id: ${catalog.id}`,
      "    enabled: true",
      `    priority: ${catalog.priority}`,
      `    root: ${catalog.root}`,
      ...(catalog.release ? [`    release: ${catalog.release}`] : []),
      ...(catalog.expectedCatalogDigest ? [`    expectedCatalogDigest: ${catalog.expectedCatalogDigest}`] : [])
    ]),
    ""
  ].join("\n"));
  return registryPath;
}

function digestFile(file) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

function serverUrl(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function jsonFetch(url, { method = "GET", token = "viewer-token", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : undefined
  };
}
