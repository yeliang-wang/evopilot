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

test("EvoPilot auto-matches a v3 Profile and binds an immutable Bundle through Goal Loop execution", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-v3-bundle-consumer-"));
  const catalog = createV3HarnessCatalog(dataRoot);
  const registryPath = writeHarnessRegistryV2(dataRoot, catalog);
  const projectRoot = path.join(dataRoot, "distributed-sql-engine");
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "README.md"), "# Distributed SQL Engine\n\nDatabase product with SQL optimizer, storage engine, transaction recovery, and replication.\n");
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
    assert.equal(catalogs.body.data.registry.schema, "evopilot-harness-registry/v2");
    assert.equal(catalogs.body.data.scans[0].format, "asset-v3");
    assert.equal(catalogs.body.data.profiles.length, 1);
    assert.equal(catalogs.body.data.bundles.length, 1);
    assert.equal(catalogs.body.data.components.length, 1);
    assert.equal(catalogs.body.data.templates.length, 0);

    const project = await jsonFetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      token: "admin-token",
      body: {
        id: "distributed-sql-engine",
        name: "Distributed SQL Engine Database Product",
        repository: { provider: "local-git", root: projectRoot, defaultBranch: "main" },
        runtime: { language: "generic", unitCommands: ["npm test"] }
      }
    });
    assert.equal(project.status, 201);
    const goal = await jsonFetch(`${baseUrl}/api/v1/goals`, {
      method: "POST",
      token: "operator-token",
      body: {
        id: "v3-database-product-ga",
        projectId: "distributed-sql-engine",
        releaseTargetId: "ga",
        objective: "Evolve the database product SQL optimizer, transaction recovery, storage engine, and replication."
      }
    });
    assert.equal(goal.status, 201);
    const planned = await jsonFetch(`${baseUrl}/api/v1/goals/v3-database-product-ga/plan`, {
      method: "POST",
      token: "operator-token",
      body: {}
    });
    assert.equal(planned.status, 201);
    const binding = planned.body.data.plan.selectedHarness;
    assert.equal(binding.schema, "evopilot-goal-plan-selected-harness-binding/v2");
    assert.equal(binding.bindingMode, "immutable-bundle");
    assert.equal(binding.harnessId, "database-product");
    assert.equal(binding.bundleRef.digest, catalog.bundleDigest);
    assert.equal(binding.profileRef.digest, catalog.profileDigest);
    assert.equal(binding.resolvedComponents[0].digest, catalog.componentDigest);
    assert.deepEqual(binding.executionPlan, ["discover-project-commands", "run-approved-validation"]);
    assert.ok(binding.requiredEvidence.includes("sql-compatibility-report"));
    assert.ok(planned.body.data.plan.targets.some((target) => target.requiredEvidence.includes("harness-bundle-binding")));
    const expandedCatalogDigest = appendUnrelatedV3CatalogAsset(catalog);
    assert.notEqual(expandedCatalogDigest, binding.catalogDigest);

    const approved = await jsonFetch(`${baseUrl}/api/v1/goals/v3-database-product-ga/approve-plan`, {
      method: "POST",
      token: "operator-token",
      body: {
        confirmedBy: "Project Owner",
        confirmation: "Project Owner reviewed and approved the immutable HarnessBundle phase plan"
      }
    });
    assert.equal(approved.status, 200);
    const bound = await jsonFetch(`${baseUrl}/api/v1/goals/v3-database-product-ga/advance`, {
      method: "POST",
      token: "operator-token",
      body: { autoStart: false }
    });
    assert.equal(bound.status, 200);
    assert.equal(bound.body.data.loop.context.harnessBundle.bindingMode, "immutable-bundle");
    assert.equal(bound.body.data.loop.context.harnessBundle.bundleRef.digest, catalog.bundleDigest);
    assert.ok(bound.body.data.loop.context.harnessBundleEvidence.some((entry) => entry.startsWith("harnessProfileDigest=")));
    assert.ok(bound.body.data.loop.context.harnessBundleEvidence.includes(`harnessCatalogCurrentDigest=${expandedCatalogDigest}`));

    const advanced = await jsonFetch(`${baseUrl}/api/v1/goals/v3-database-product-ga/advance`, {
      method: "POST",
      token: "operator-token",
      body: {}
    });
    assert.equal(advanced.status, 200);
    assert.ok(advanced.body.data.loop.evidenceSets[0].evidence.includes(`harnessBundleDigest=${catalog.bundleDigest}`));
    assert.ok(advanced.body.data.loop.evidenceSets[0].evidence.includes(`harnessProfileDigest=${catalog.profileDigest}`));
    assert.ok(advanced.body.data.loop.evidenceSets[0].evidence.includes("harnessExecutionPlan[0]=discover-project-commands"));
  } finally {
    await close(server);
  }
});

test("EvoPilot revalidates a planned v3 HarnessBundle before each Goal Loop iteration", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-v3-bundle-tamper-"));
  const catalog = createV3HarnessCatalog(dataRoot);
  const registryPath = writeHarnessRegistryV2(dataRoot, catalog);
  const projectRoot = path.join(dataRoot, "database-engine");
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "README.md"), "# Database Engine\n\nDatabase product with SQL optimizer and transaction recovery.\n");
  const server = createServer({
    dataRoot,
    runtimeMode: "debug",
    harnessRegistryConfig: registryPath,
    tokens: [
      { name: "operator", token: "operator-token", role: "operator" },
      { name: "admin", token: "admin-token", role: "admin" }
    ]
  });
  await listen(server);
  const baseUrl = serverUrl(server);
  try {
    assert.equal((await jsonFetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      token: "admin-token",
      body: {
        id: "database-engine",
        name: "Database Engine Product",
        repository: { provider: "local-git", root: projectRoot, defaultBranch: "main" },
        runtime: { language: "generic", unitCommands: ["npm test"] }
      }
    })).status, 201);
    assert.equal((await jsonFetch(`${baseUrl}/api/v1/goals`, {
      method: "POST",
      token: "operator-token",
      body: { id: "v3-tamper-ga", projectId: "database-engine", releaseTargetId: "ga", objective: "Evolve this database product SQL engine." }
    })).status, 201);
    assert.equal((await jsonFetch(`${baseUrl}/api/v1/goals/v3-tamper-ga/plan`, { method: "POST", token: "operator-token", body: {} })).status, 201);
    assert.equal((await jsonFetch(`${baseUrl}/api/v1/goals/v3-tamper-ga/approve-plan`, {
      method: "POST",
      token: "operator-token",
      body: { confirmedBy: "Project Owner", confirmation: "Project Owner reviewed and approved the immutable HarnessBundle plan" }
    })).status, 200);

    const bound = await jsonFetch(`${baseUrl}/api/v1/goals/v3-tamper-ga/advance`, {
      method: "POST",
      token: "operator-token",
      body: { autoStart: false }
    });
    assert.equal(bound.status, 200);
    assert.equal(bound.body.data.loop.currentIteration, 0);

    const profile = JSON.parse(fs.readFileSync(catalog.profilePath, "utf8"));
    profile.metadata.description = "Tampered profile content that no longer matches the published immutable digest.";
    fs.writeFileSync(catalog.profilePath, JSON.stringify(profile, null, 2));
    const failedCatalogs = await jsonFetch(`${baseUrl}/api/v1/harness/catalogs`, { token: "operator-token" });
    assert.equal(failedCatalogs.status, 200);
    assert.equal(failedCatalogs.body.data.scans[0].status, "FAILED");
    assert.equal(failedCatalogs.body.data.scans[0].format, "asset-v3");
    assert.match(failedCatalogs.body.data.scans[0].mount.lastReadError, /digest mismatch/);
    const blocked = await jsonFetch(`${baseUrl}/api/v1/loops/${encodeURIComponent(bound.body.data.loop.id)}/start`, {
      method: "POST",
      token: "operator-token",
      body: {}
    });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error, "HARNESS_BUNDLE_DIGEST_MISMATCH");
  } finally {
    await close(server);
  }
});

test("Open Lifecycle Harness binds a published immutable Bundle and preserves transport-neutral authority", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-open-lifecycle-"));
  const catalog = createV3HarnessCatalog(dataRoot);
  const server = createServer({
    dataRoot,
    runtimeMode: "debug",
    harnessCatalogDirs: [catalog.catalogRoot],
    lifecycleCatalogDirs: [path.resolve("lifecycles")],
    tokens: [
      { name: "viewer", token: "viewer-token", role: "viewer" },
      { name: "operator", token: "operator-token", role: "operator" },
      { name: "admin", token: "admin-token", role: "admin" }
    ]
  });
  await listen(server);
  const baseUrl = serverUrl(server);
  try {
    const projectRoot = path.join(dataRoot, "oss-project");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "README.md"), "# OSS project\n");
    const project = await jsonFetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      token: "admin-token",
      body: { id: "oss-project", name: "OSS Project", repository: { provider: "local-git", root: projectRoot, defaultBranch: "main" }, runtime: { language: "generic" } }
    });
    assert.equal(project.status, 201);
    const available = await jsonFetch(`${baseUrl}/api/v1/lifecycles`, { token: "viewer-token" });
    assert.equal(available.status, 200);
    assert.ok(available.body.data.lifecycles.some((item) => item.id === "evopilot-harness-oss"));

    const created = await jsonFetch(`${baseUrl}/api/v1/lifecycle-runs`, {
      method: "POST",
      token: "operator-token",
      body: {
        id: "oss-lifecycle-run",
        lifecycleId: "evopilot-harness-oss",
        lifecycleVersion: "1.0.0",
        projectId: "oss-project",
        policyDigest: `sha256:${"1".repeat(64)}`,
        runtimeDigest: `sha256:${"2".repeat(64)}`,
        harnessBundle: { id: "database-product", version: "3.0.0", digest: catalog.bundleDigest, catalogId: "database-product-v3" },
        executor: { host: "conformant-test-host", provider: "test-provider", model: "test-model", capabilities: ["build.execute", "test.execute", "goal-loop.execute", "release.publish"] },
        answers: { projectRoot: "/workspace/project", verificationProfile: "release", candidateVersion: "4.5.0", testSuite: "release", publicationChannel: "both" }
      }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.status, "WAITING_AUTHORIZATION");
    assert.equal(created.body.data.binding.harnessBundle.digest, catalog.bundleDigest);

    const inferred = await jsonFetch(`${baseUrl}/api/v1/lifecycle-runs/oss-lifecycle-run/advance`, { method: "POST", token: "operator-token", body: {} });
    assert.equal(inferred.status, 200);
    assert.equal(inferred.body.data.status, "WAITING_AUTHORIZATION");
    const bindingDigest = created.body.data.binding.digest;
    const approved = await jsonFetch(`${baseUrl}/api/v1/lifecycle-runs/oss-lifecycle-run/authorize`, {
      method: "POST",
      token: "operator-token",
      body: { decision: "APPROVED", bindingDigest, evidenceRef: "human:reviewed-exact-binding" }
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.planAuthorization.bindingDigest, bindingDigest);

    const advanced = await jsonFetch(`${baseUrl}/api/v1/lifecycle-runs/oss-lifecycle-run/advance`, { method: "POST", token: "operator-token", body: {} });
    assert.equal(advanced.status, 200);
    assert.equal(advanced.body.data.status, "WAITING_EXTERNAL_SIGNAL");
    assert.equal(advanced.body.data.pendingExecution.action, "build.verify");
    assert.equal(advanced.body.data.pendingExecution.bindingDigest, bindingDigest);
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

function createV3HarnessCatalog(root) {
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
      labels: { capability: "engineering-validation" }
    },
    spec: {
      capability: "engineering-validation",
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

function appendUnrelatedV3CatalogAsset(catalog) {
  const asset = {
    apiVersion: "harness.evopilot.io/v3",
    kind: "HarnessComponent",
    metadata: {
      id: "documentation-review",
      version: "1.0.0",
      name: "Documentation Review",
      description: "Unrelated published Component added after the database Bundle was planned.",
      lifecycle: "published",
      labels: { capability: "documentation-review" }
    },
    spec: {
      capability: "documentation-review",
      environment: { workspaceMode: "read-only", requiredTools: [] },
      actions: [{ id: "review-documentation", description: "Review project documentation evidence.", executor: "manual", inputs: ["documentation"], outputs: ["documentation-review"] }],
      constraints: ["Do not mutate project documentation."],
      evidence: ["documentation-review"],
      validators: [{ id: "documentation-review-complete", type: "manual-review", assertion: "documentation review is complete", evidenceRefs: ["documentation-review"], blocking: true }]
    },
    provenance: { sourceDigests: [digestObject({ source: "unrelated-component" })], ontologyVersion: "software-engineering@1.0.0", policyVersion: "default-matcher@1.0.0" }
  };
  const assetDigest = digestObject(asset);
  const relativePath = "./assets/components/documentation-review/1.0.0/asset.yaml";
  const assetPath = path.join(catalog.catalogRoot, relativePath);
  fs.mkdirSync(path.dirname(assetPath), { recursive: true });
  fs.writeFileSync(assetPath, JSON.stringify(asset, null, 2));
  catalog.index.entries.push({
    kind: asset.kind,
    id: asset.metadata.id,
    version: asset.metadata.version,
    lifecycle: asset.metadata.lifecycle,
    assetPath: relativePath,
    assetDigest,
    exportAdapters: []
  });
  catalog.index.entryCount = catalog.index.entries.length;
  catalog.index.catalogDigest = digestObject({
    schema: catalog.index.schema,
    catalogId: catalog.index.catalogId,
    generatedBy: catalog.index.generatedBy,
    assetApiVersion: catalog.index.assetApiVersion,
    entryCount: catalog.index.entryCount,
    entries: catalog.index.entries
  });
  fs.writeFileSync(path.join(catalog.catalogRoot, "CATALOG.md"), [
    "# Harness Catalog: database-product-v3",
    "",
    "```yaml evopilot-harness-catalog-v3",
    JSON.stringify(catalog.index, null, 2),
    "```",
    ""
  ].join("\n"));
  return catalog.index.catalogDigest;
}

function writeHarnessRegistryV2(root, catalog) {
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
