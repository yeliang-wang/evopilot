import assert from "node:assert/strict";
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

function createPublishedHarnessCatalog(root) {
  const catalogRoot = path.join(root, "published");
  const templateDir = path.join(catalogRoot, "database-product-harness", "3.0.0");
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, "template.yaml"), [
    "schema: evopilot-harness-template/v1",
    "id: database-product-harness",
    "version: 3.0.0",
    "name: Database Product Harness",
    "description: Published domain harness for self-developed database products.",
    "scope: platform",
    "languageFamily: generic",
    "harnessLayer: domain",
    "domain: database-product",
    "matchSignals:",
    "  include:",
    "    - database",
    "    - sql",
    "    - optimizer",
    "    - transaction",
    "    - storage",
    "    - replication",
    "runtimePatterns:",
    "  harnessLayer: domain",
    "  domain: database-product",
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
    "  - version: 3.0.0",
    "    summary: Publish database product harness through external catalog.",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(catalogRoot, "CATALOG.md"), [
    "# EvoPilot Harness Catalog",
    "",
    "```yaml evopilot-harness-catalog",
    "catalogVersion: 1",
    "catalogId: evopilot-public-harness-catalog",
    "generatedAt: \"2026-08-09T00:00:00.000Z\"",
    "compatibleEvopilot: \">=3.0.0\"",
    "entries:",
    "  - name: database-product-harness",
    "    version: 3.0.0",
    "    layer: domain",
    "    domain: database-product",
    "    status: published",
    "    path: ./database-product-harness/3.0.0/template.yaml",
    "    tags:",
    "      - database-product",
    "```",
    ""
  ].join("\n"));
  return catalogRoot;
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
