import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { parse as parseYaml } from "yaml";
import { createServer } from "../../packages/server/dist/index.js";

const cliPath = path.resolve("packages/cli/dist/index.js");

test("HarnessTemplate API and CLI upgrade versioned templates with changelog", async () => {
  assert.ok(fs.existsSync(cliPath), "CLI must be built before functional tests run");
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-harness-template-"));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-harness-template-repo-"));
  fs.writeFileSync(path.join(repoRoot, "pyproject.toml"), "[project]\nname = \"template-agent\"\nversion = \"0.1.0\"\n");
  const templateFile = path.join(dataRoot, "template.yaml");
  fs.writeFileSync(templateFile, [
    "schema: evopilot-harness-template/v1",
    "id: python-enterprise-harness",
    "version: 1.2.0",
    "name: Python Enterprise Harness",
    "description: Python enterprise harness with explicit admin-managed template versioning.",
    "scope: platform",
    "languageFamily: python",
    "capabilities:",
    "  - id: source-boundary",
    "    name: Source and workspace boundary",
    "    boundary: Tenant, workspace, repository, branch, and writeback boundaries are explicit.",
    "    requiredEvidence:",
    "      - project-registration",
    "      - source-readiness-preflight",
    "  - id: python-runtime",
    "    name: Python runtime harness",
    "    boundary: Python install, lint, type, unit, and smoke commands are declared.",
    "    requiredEvidence:",
    "      - install-output",
    "      - unit-output",
    "runtimePatterns:",
    "  language: python",
    "  defaultCommands:",
    "    install:",
    "      - uv sync",
    "    unit:",
    "      - pytest",
    "validationBaseline:",
    "  requiredCommandGroups:",
    "    - install",
    "    - unit",
    "evidenceContract:",
    "  requiredArtifacts:",
    "    - target-evidence-package",
    "failureTaxonomy:",
    "  categories:",
    "    - dependency",
    "    - test",
    "diagnosticsBaseline:",
    "  requiredSignals:",
    "    - failing-command",
    "observabilityBaseline:",
    "  requiredSignals:",
    "    - health",
    "governanceRules:",
    "  tenantWorkspaceScopeRequired: true",
    "  profileActivationRequiresApproval: true",
    "  cannotWeaken:",
    "    - tenantWorkspaceScopeRequired",
    "    - profileActivationRequiresApproval",
    "phaseMapping:",
    "  alpha:",
    "    - source-boundary",
    "    - python-runtime",
    "  beta:",
    "    - python-runtime",
    "  rc:",
    "    - python-runtime",
    "  ga:",
    "    - source-boundary",
    "llmDraftPolicy:",
    "  enabled: true",
    "  generatedStatus: DRAFT",
    "  requireUserReview: true",
    ""
  ].join("\n"));

  const server = createServer({ dataRoot, runtimeMode: "debug" });
  await listen(server);
  const baseUrl = serverUrl(server);

  try {
    const applied = await runCliJson([
      "--server", baseUrl,
      "harness", "template", "upgrade",
      "--file", templateFile,
      "--changelog", "Add admin-managed Python enterprise harness template version 1.2.0.",
      "--json"
    ]);
    assert.equal(applied.action, "CREATED_VERSION");
    assert.equal(applied.template.id, "python-enterprise-harness");
    assert.equal(applied.template.version, "1.2.0");
    assert.ok(applied.template.changelog.some((entry) => entry.version === "1.2.0"));

    const duplicate = await postExpectStatus(`${baseUrl}/api/v1/harness/templates`, {
      templateContent: parseYaml(fs.readFileSync(templateFile, "utf8")),
      changelog: ["Duplicate version should require force."]
    }, 409);
    assert.equal(duplicate.error, "HARNESS_TEMPLATE_VERSION_EXISTS");

    const project = await post(`${baseUrl}/api/v1/projects`, {
      id: "template-python-agent",
      name: "Template Python Agent",
      repository: { provider: "local-git", root: repoRoot },
      runtime: {
        language: "python",
        installCommands: ["uv sync"],
        unitCommands: ["pytest"]
      }
    });
    assert.equal(project.data.id, "template-python-agent");

    const generated = await post(`${baseUrl}/api/v1/projects/template-python-agent/harness-profiles/generate`, {
      profileId: "default",
      templateId: "python-enterprise-harness",
      templateVersion: "1.2.0",
      goalLoopTarget: "Use the admin-managed Python enterprise harness template version"
    });
    assert.equal(generated.data.profile.templateRef.version, "1.2.0");
    assert.equal(generated.data.profile.templateRef.digest, applied.template.digest);
  } finally {
    await close(server);
  }
});

test("EvoPilot CLI manages server logging settings", async () => {
  assert.ok(fs.existsSync(cliPath), "CLI must be built before functional tests run");
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-logging-cli-"));
  const server = createServer({ dataRoot, runtimeMode: "debug" });
  await listen(server);
  const baseUrl = serverUrl(server);

  try {
    const initial = await runCliJson(["--server", baseUrl, "logging", "inspect", "--json"]);
    assert.equal(initial.schema, "evopilot-logging-settings/v1");
    assert.equal(initial.level, "info");
    assert.equal(initial.format, "json");

    const updated = await runCliJson([
      "--server", baseUrl,
      "logging", "set",
      "--level", "debug",
      "--include-stack", "false",
      "--json"
    ]);
    assert.equal(updated.status, "UPDATED");
    assert.equal(updated.settings.level, "debug");
    assert.equal(updated.settings.includeStack, false);

    const inspected = await runCliJson(["--server", baseUrl, "logging", "inspect", "--json"]);
    assert.equal(inspected.level, "debug");
    assert.equal(inspected.includeStack, false);
    assert.equal(inspected.source, "control-plane");
  } finally {
    await close(server);
  }
});

test("HarnessTemplate pack CLI lists, validates, and publishes human-readable template packs", async () => {
  assert.ok(fs.existsSync(cliPath), "CLI must be built before functional tests run");
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-harness-template-pack-"));
  const server = createServer({ dataRoot, runtimeMode: "debug" });
  await listen(server);
  const baseUrl = serverUrl(server);
  const packRoot = path.resolve("harness-templates/public");
  const packPath = path.join(packRoot, "python-enterprise-harness");

  try {
    const listed = await runCliJson(["harness", "template", "pack", "list", packRoot, "--json"]);
    assert.equal(listed.schema, "evopilot-harness-template-pack-list/v1");
    assert.ok(listed.packs.some((pack) => pack.id === "python-enterprise-harness" && pack.hasReadme && pack.hasTemplate && pack.hasChangelog && pack.examples > 0));

    const validated = await runCliJson(["--server", baseUrl, "harness", "template", "pack", "validate", packPath, "--json"]);
    assert.equal(validated.status, "VALIDATED");
    assert.equal(validated.localValidation.status, "VALIDATED");
    assert.equal(validated.serverValidation.status, "VALIDATED");
    assert.equal(validated.serverValidation.template.id, "python-enterprise-harness");

    const published = await runCliJson([
      "--server", baseUrl,
      "harness", "template", "pack", "publish", packPath,
      "--force",
      "--json"
    ]);
    assert.equal(published.action, "REPLACED_VERSION");
    assert.equal(published.template.id, "python-enterprise-harness");
    assert.equal(published.template.version, "1.1.0");
  } finally {
    await close(server);
  }
});

test("TenantHarnessPolicy constrains project profiles and goal-plan harness bindings", async () => {
  assert.ok(fs.existsSync(cliPath), "CLI must be built before functional tests run");
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-tenant-harness-policy-"));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-tenant-harness-policy-repo-"));
  fs.writeFileSync(path.join(repoRoot, "pyproject.toml"), "[project]\nname = \"tenant-python-agent\"\nversion = \"0.1.0\"\n");
  fs.mkdirSync(path.join(repoRoot, "tests"));
  fs.writeFileSync(path.join(repoRoot, "tests", "test_smoke.py"), "def test_smoke():\n    assert True\n");

  const policyFile = path.join(dataRoot, "tenant-policy.yaml");
  fs.writeFileSync(policyFile, [
    "schema: evopilot-tenant-harness-policy/v1",
    "policyId: default",
    "name: Tenant Private Harness Policy",
    "description: Workspace-wide private policy for project-level harness contracts.",
    "appliesTo:",
    "  languageFamilies:",
    "    - python",
    "requiredCapabilities:",
    "  - id: tenant-audit-boundary",
    "    name: Tenant audit boundary",
    "    boundary: Every project profile must preserve tenant audit, business request, and repair evidence fields.",
    "    requiredEvidence:",
    "      - tenant-audit-proof",
    "      - business-request-correlation-proof",
    "evidence:",
    "  requiredEvidence:",
    "    - tenant-audit-proof",
    "  correlationFields:",
    "    - tenantId",
    "    - workspaceId",
    "    - projectId",
    "    - requestId",
    "    - traceId",
    "    - businessRequestId",
    "failureHandling:",
    "  requiredFields:",
    "    - tenantId",
    "    - workspaceId",
    "    - errorCode",
    "    - businessRequestId",
    "  exceptionTracking:",
    "    requiredAttributes:",
    "      - tenantId",
    "      - workspaceId",
    "      - business.request_id",
    "diagnostics:",
    "  requiredSignals:",
    "    - tenant-audit-event",
    "observability:",
    "  requiredSignals:",
    "    - audit-log",
    "    - traces",
    "  structuredLogs:",
    "    requiredFields:",
    "      - tenantId",
    "      - workspaceId",
    "      - projectId",
    "      - businessRequestId",
    "      - errorCode",
    "governance:",
    "  tenantPolicyRequired: true",
    "  tenantWorkspaceScopeRequired: true",
    "  profileActivationRequiresApproval: true",
    "  cannotWeaken:",
    "    - tenantPolicyRequired",
    "    - tenantWorkspaceScopeRequired",
    "    - profileActivationRequiresApproval",
    "phaseMapping:",
    "  beta:",
    "    - tenant-audit-boundary",
    "  ga:",
    "    - tenant-audit-boundary",
    "enforcement:",
    "  requiredStructuredLogFields:",
    "    - tenantId",
    "    - workspaceId",
    "    - businessRequestId",
    "  requiredGovernanceTrue:",
    "    - tenantPolicyRequired",
    ""
  ].join("\n"));

  const server = createServer({ dataRoot, runtimeMode: "debug" });
  await listen(server);
  const baseUrl = serverUrl(server);

  try {
    const appliedPolicy = await runCliJson([
      "--server", baseUrl,
      "harness", "policy", "apply",
      "--file", policyFile,
      "--changelog", "Add workspace private harness policy.",
      "--json"
    ]);
    assert.equal(appliedPolicy.status, "VALIDATED");
    assert.equal(appliedPolicy.policy.policyId, "default");
    assert.equal(appliedPolicy.policy.version, 1);
    assert.equal(appliedPolicy.policy.validation.status, "VALIDATED");
    assert.equal(appliedPolicy.policy.changelog[0].summary, "Add workspace private harness policy.");

    const activatedPolicy = await runCliJson([
      "--server", baseUrl,
      "harness", "policy", "activate", "default",
      "--version", "1",
      "--json"
    ]);
    assert.equal(activatedPolicy.status, "ACTIVE");
    assert.equal(activatedPolicy.summary.activeVersion, 1);
    const policyDigestV1 = activatedPolicy.policy.compiledDigest;

    await post(`${baseUrl}/api/v1/projects`, {
      id: "tenant-python-agent",
      name: "Tenant Python Agent",
      repository: { provider: "local-git", root: repoRoot },
      runtime: {
        language: "python",
        installCommands: ["pip install -e ."],
        unitCommands: ["pytest"],
        smokeCommands: ["pytest -q tests"]
      }
    });

    const generated = await post(`${baseUrl}/api/v1/projects/tenant-python-agent/harness-profiles/generate`, {
      profileId: "default",
      goalLoopTarget: "Define the project harness under the tenant private contract"
    });
    assert.equal(generated.data.profile.policyRefs.length, 1);
    assert.equal(generated.data.profile.policyRefs[0].policyId, "default");
    assert.equal(generated.data.profile.policyRefs[0].version, 1);
    assert.equal(generated.data.profile.policyRefs[0].digest, policyDigestV1);
    assert.ok(generated.data.profile.generatedBy.evidence.includes("tenantPolicy=default@v1"));
    assert.ok(generated.data.profile.compiledContent.capabilities.some((capability) => capability.id === "tenant-audit-boundary"));
    assert.ok(generated.data.profile.compiledContent.evidence.correlationFields.includes("businessRequestId"));
    assert.ok(generated.data.profile.compiledContent.observability.structuredLogs.requiredFields.includes("businessRequestId"));
    assert.ok(generated.data.profile.compiledContent.phaseMapping.ga.includes("tenant-audit-boundary"));
    assert.equal(generated.data.profile.validation.status, "VALIDATED");

    const weakenedSource = {
      ...generated.data.profile.sourceContent,
      governance: {
        ...generated.data.profile.sourceContent.governance,
        tenantPolicyRequired: false
      }
    };
    const weakened = await postExpectStatus(`${baseUrl}/api/v1/projects/tenant-python-agent/harness-profiles/validate`, {
      sourceFormat: "json",
      sourceContent: weakenedSource
    }, 409);
    assert.equal(weakened.data.status, "FAILED");
    assert.ok(weakened.data.validation.blockers.some((blocker) => blocker.includes("tenantPolicyRequired")));

    const activatedProfile = await post(`${baseUrl}/api/v1/projects/tenant-python-agent/harness-profiles/default/activate`, { version: 1 });
    assert.equal(activatedProfile.data.status, "ACTIVE");
    assert.equal(activatedProfile.data.profile.policyRefs[0].digest, policyDigestV1);

    const goal = await post(`${baseUrl}/api/v1/goals`, {
      projectId: "tenant-python-agent",
      objective: "Ship a tenant-private controlled Python service"
    });
    const planned = await post(`${baseUrl}/api/v1/goals/${goal.data.id}/plan`, {});
    assert.equal(planned.data.plan.projectHarness.policyRefs[0].policyId, "default");
    assert.equal(planned.data.plan.projectHarness.policyRefs[0].digest, policyDigestV1);
    assert.ok(planned.data.plan.projectHarness.evidence.includes("tenantPolicy=default@v1"));

    const policyV2File = path.join(dataRoot, "tenant-policy-v2.yaml");
    fs.writeFileSync(policyV2File, fs.readFileSync(policyFile, "utf8").replace(
      "      - businessRequestId\n      - errorCode",
      "      - businessRequestId\n      - orgIncidentId\n      - errorCode"
    ));
    const appliedPolicyV2 = await runCliJson([
      "--server", baseUrl,
      "harness", "policy", "apply",
      "--file", policyV2File,
      "--changelog", "Require organization incident correlation in structured logs.",
      "--json"
    ]);
    assert.equal(appliedPolicyV2.policy.version, 2);
    assert.equal(appliedPolicyV2.policy.changelog[0].summary, "Require organization incident correlation in structured logs.");
    const activatedPolicyV2 = await runCliJson([
      "--server", baseUrl,
      "harness", "policy", "activate", "default",
      "--version", "2",
      "--json"
    ]);
    assert.equal(activatedPolicyV2.summary.activeVersion, 2);

    const staleGoal = await post(`${baseUrl}/api/v1/goals`, {
      projectId: "tenant-python-agent",
      objective: "Plan after tenant policy upgrade"
    });
    const stalePlan = await postExpectStatus(`${baseUrl}/api/v1/goals/${staleGoal.data.id}/plan`, {}, 409);
    assert.equal(stalePlan.error, "PROJECT_HARNESS_PROFILE_POLICY_STALE");

    const regenerated = await post(`${baseUrl}/api/v1/projects/tenant-python-agent/harness-profiles/generate`, {
      profileId: "default",
      goalLoopTarget: "Regenerate the project harness after tenant policy v2"
    });
    assert.equal(regenerated.data.profile.policyRefs[0].version, 2);
    assert.ok(regenerated.data.profile.compiledContent.observability.structuredLogs.requiredFields.includes("orgIncidentId"));
  } finally {
    await close(server);
  }
});

test("Fresh install exposes multiple built-in HarnessTemplate types and generates non-Python profiles", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-builtin-harness-library-"));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-java-harness-repo-"));
  const dbRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-database-product-repo-"));
  const gatewayRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-api-gateway-repo-"));
  const javaAppRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-java-app-db-client-repo-"));
  fs.writeFileSync(path.join(repoRoot, "pom.xml"), "<project><modelVersion>4.0.0</modelVersion><groupId>test</groupId><artifactId>agent</artifactId><version>0.1.0</version></project>\n");
  fs.writeFileSync(path.join(dbRepoRoot, "pom.xml"), "<project><modelVersion>4.0.0</modelVersion><groupId>test</groupId><artifactId>database</artifactId><version>0.1.0</version></project>\n");
  fs.mkdirSync(path.join(dbRepoRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(dbRepoRoot, "src", "query_optimizer.java"), "final class QueryOptimizer {}\n");
  fs.writeFileSync(path.join(gatewayRepoRoot, "go.mod"), "module example.com/gateway\n\ngo 1.22\n");
  fs.mkdirSync(path.join(gatewayRepoRoot, "internal", "route"), { recursive: true });
  fs.mkdirSync(path.join(gatewayRepoRoot, "internal", "policy"), { recursive: true });
  fs.mkdirSync(path.join(gatewayRepoRoot, "internal", "plugin"), { recursive: true });
  fs.writeFileSync(path.join(gatewayRepoRoot, "internal", "route", "router.go"), "package route\n");
  fs.writeFileSync(path.join(gatewayRepoRoot, "internal", "policy", "rate_limit.go"), "package policy\n");
  fs.writeFileSync(path.join(gatewayRepoRoot, "internal", "plugin", "lifecycle.go"), "package plugin\n");
  fs.writeFileSync(path.join(javaAppRepoRoot, "pom.xml"), "<project><modelVersion>4.0.0</modelVersion><groupId>test</groupId><artifactId>billing-service</artifactId><version>0.1.0</version></project>\n");

  const server = createServer({ dataRoot, runtimeMode: "debug" });
  await listen(server);
  const baseUrl = serverUrl(server);

  try {
    const templates = await get(`${baseUrl}/api/v1/harness/templates`);
    const ids = templates.data.templates.map((template) => template.id);
    assert.deepEqual(new Set(ids), new Set([
      "python-enterprise-harness",
      "java-ddd-service-harness",
      "node-saas-control-plane-harness",
      "go-middleware-harness",
      "observability-apm-harness",
      "database-product-harness",
      "api-gateway-harness",
      "generic-management-software-harness"
    ]));
    assert.ok(templates.data.templates.every((template) => Array.isArray(template.sourceReferences) && template.sourceReferences.length > 0));

    const javaTemplate = templates.data.templates.find((template) => template.id === "java-ddd-service-harness");
    assert.equal(javaTemplate.languageFamily, "java");
    assert.equal(javaTemplate.version, "1.1.0");
    assert.ok(javaTemplate.capabilities.some((capability) => capability.id === "ddd-boundaries"));
    assert.ok(javaTemplate.capabilities.some((capability) => capability.id === "exception-tracking"));
    assert.ok(javaTemplate.capabilities.some((capability) => capability.id === "slo-monitoring"));
    assert.ok(javaTemplate.capabilities.some((capability) => capability.id === "operational-runbooks"));
    assert.ok(javaTemplate.sourceReferences.some((reference) => reference.name === "Micrometer"));
    assert.ok(javaTemplate.changelog.some((entry) => entry.version === "1.1.0"));
    assert.ok(javaTemplate.failureTaxonomy.exceptionTracking.requiredAttributes.includes("exception.type"));
    assert.ok(javaTemplate.diagnosticsBaseline.runbookRequirements.criticalAlertsRequireRunbook);
    assert.ok(javaTemplate.observabilityBaseline.structuredLogs.requiredFields.includes("traceId"));
    assert.ok(javaTemplate.observabilityBaseline.alerts.required.includes("latency_slo_breach"));

    const databaseTemplate = templates.data.templates.find((template) => template.id === "database-product-harness");
    assert.equal(databaseTemplate.languageFamily, "generic");
    assert.equal(databaseTemplate.version, "2.2.0");
    assert.equal(databaseTemplate.runtimePatterns.harnessLayer, "domain");
    assert.equal(databaseTemplate.runtimePatterns.domain, "database-product");
    assert.ok(databaseTemplate.runtimePatterns.compatibilityProfiles.some((profile) => profile.id === "postgres-compatible"));
    assert.ok(databaseTemplate.runtimePatterns.compatibilityProfiles.some((profile) => profile.id === "mysql-compatible"));
    assert.ok(databaseTemplate.runtimePatterns.referenceBoundary.allowedRoles.includes("differential oracle"));
    assert.ok(databaseTemplate.runtimePatterns.domainExecution.requiredActions.some((action) => action.id === "map-engine-module-boundaries"));
    assert.ok(databaseTemplate.runtimePatterns.domainExecution.evidenceAdapters.some((adapter) => adapter.artifact === "crash-recovery-log"));
    assert.ok(databaseTemplate.validationBaseline.referenceProductsAreOraclesOnly);
    assert.ok(databaseTemplate.validationBaseline.requiredActions.includes("bind-sql-compatibility-suite"));
    assert.ok(databaseTemplate.evidenceContract.requiredArtifacts.includes("benchmark-summary"));
    assert.ok(databaseTemplate.capabilities.some((capability) => capability.id === "database-product-boundary"));
    assert.ok(databaseTemplate.sourceReferences.some((reference) => reference.name === "PostgreSQL" && reference.rationale.includes("not the default evolution target")));

    const gatewayTemplate = templates.data.templates.find((template) => template.id === "api-gateway-harness");
    assert.equal(gatewayTemplate.languageFamily, "generic");
    assert.equal(gatewayTemplate.version, "2.2.0");
    assert.equal(gatewayTemplate.runtimePatterns.harnessLayer, "domain");
    assert.equal(gatewayTemplate.runtimePatterns.domain, "api-gateway");
    assert.ok(gatewayTemplate.runtimePatterns.domainExecution.requiredActions.some((action) => action.id === "map-gateway-control-boundaries"));
    assert.ok(gatewayTemplate.runtimePatterns.domainExecution.evidenceAdapters.some((adapter) => adapter.artifact === "load-summary"));
    assert.ok(gatewayTemplate.evidenceContract.requiredArtifacts.includes("policy-matrix"));

    await post(`${baseUrl}/api/v1/projects`, {
      id: "java-ddd-agent",
      name: "Java DDD Agent",
      repository: { provider: "local-git", root: repoRoot },
      runtime: {
        language: "java",
        unitCommands: ["./mvnw test"],
        smokeCommands: ["./mvnw verify"]
      }
    });

    const generated = await post(`${baseUrl}/api/v1/projects/java-ddd-agent/harness-profiles/generate`, {
      profileId: "default",
      goalLoopTarget: "Add account aggregate invariants and release evidence"
    });
    assert.equal(generated.data.profile.templateRef.templateId, "java-ddd-service-harness");
    assert.ok(generated.data.profile.generatedBy.evidence.includes("templateSelection=auto-match"));
    assert.ok(generated.data.profile.generatedBy.evidence.some((item) => item.includes("runtimeLanguage=java")));
    assert.equal(generated.data.profile.sourceContent.runtime.language, "java");
    assert.ok(generated.data.profile.sourceContent.capabilities.some((capability) => capability.id === "ddd-boundaries"));
    assert.ok(generated.data.profile.sourceContent.runtime.installCommands.some((command) => command.includes("mvnw") || command.includes("gradlew")));
    assert.equal(generated.data.profile.templateRef.version, "1.1.0");
    assert.ok(generated.data.profile.compiledContent.failureHandling.exceptionTracking.requiredAttributes.includes("traceId"));
    assert.ok(generated.data.profile.compiledContent.observability.structuredLogs.requiredFields.includes("errorCode"));
    assert.ok(generated.data.profile.compiledContent.observability.slo.errorBudgetStatusRequiredForRcAndGa);
    assert.ok(generated.data.profile.compiledContent.phaseMapping.rc.includes("operational-runbooks"));
    assert.equal(generated.data.profile.validation.status, "VALIDATED");

    const activated = await post(`${baseUrl}/api/v1/projects/java-ddd-agent/harness-profiles/default/activate`, { version: 1 });
    assert.equal(activated.data.profile.templateRef.templateId, "java-ddd-service-harness");

    const evolved = await post(`${baseUrl}/api/v1/projects/java-ddd-agent/harness-profiles/generate`, {
      profileId: "default",
      goalLoopTarget: "Add Python integration notes without changing the active Java DDD harness lineage"
    });
    assert.equal(evolved.data.profile.templateRef.templateId, "java-ddd-service-harness");
    assert.ok(evolved.data.profile.generatedBy.evidence.includes("templateSelection=previous-active-profile"));
    assert.ok(evolved.data.profile.generatedBy.evidence.includes("previousActiveVersion=1"));

    await post(`${baseUrl}/api/v1/projects`, {
      id: "self-developed-sql-engine",
      name: "Self Developed SQL Engine",
      repository: { provider: "local-git", root: dbRepoRoot },
      runtime: {
        language: "java",
        unitCommands: ["./mvnw test"],
        smokeCommands: ["make smoke-sql"]
      }
    });

    const generatedDatabase = await post(`${baseUrl}/api/v1/projects/self-developed-sql-engine/harness-profiles/generate`, {
      profileId: "default",
      goalLoopTarget: "Evolve our self-developed database product with PostgreSQL-compatible SQL behavior, query optimizer regression tests, storage engine recovery, and MySQL-compatible protocol checks"
    });
    assert.equal(generatedDatabase.data.profile.templateRef.templateId, "database-product-harness");
    assert.equal(generatedDatabase.data.profile.templateRef.version, "2.2.0");
    assert.ok(generatedDatabase.data.profile.generatedBy.evidence.some((item) => item.includes("domain=database-product")));
    assert.equal(generatedDatabase.data.profile.sourceContent.runtime.harnessLayer, "domain");
    assert.equal(generatedDatabase.data.profile.sourceContent.runtime.domain, "database-product");
    assert.ok(generatedDatabase.data.profile.sourceContent.runtime.compatibilityProfiles.some((profile) => profile.id === "postgres-compatible"));
    assert.ok(generatedDatabase.data.profile.sourceContent.validation.requiredActions.includes("map-engine-module-boundaries"));
    assert.ok(generatedDatabase.data.profile.sourceContent.evidence.evidenceAdapters.some((adapter) => adapter.artifact === "differential-oracle-report"));
    assert.ok(generatedDatabase.data.profile.sourceContent.rules.domainHarnessReleaseBlockers.some((blocker) => blocker.includes("PostgreSQL or MySQL")));
    assert.ok(generatedDatabase.data.profile.sourceContent.metadata.repoProbe.moduleSignals.some((signal) => signal.id === "planner" && signal.matchedPaths.length > 0));
    assert.ok(generatedDatabase.data.profile.sourceContent.metadata.referenceProductsAreOraclesOnly);
    assert.ok(generatedDatabase.data.profile.compiledContent.runtime.referenceBoundary.forbiddenRoles.includes("replace the owner's product"));
    assert.ok(generatedDatabase.data.profile.compiledContent.validation.contractChecks.includes("sql-compatibility"));
    assert.ok(generatedDatabase.data.profile.compiledContent.rules.domainHarnessRequiredActions.some((action) => action.id === "bind-correctness-and-recovery-suite"));

    await post(`${baseUrl}/api/v1/projects`, {
      id: "edge-gateway-product",
      name: "Edge Gateway Product",
      repository: { provider: "local-git", root: gatewayRepoRoot },
      runtime: {
        language: "go",
        unitCommands: ["go test ./..."],
        smokeCommands: ["make smoke-gateway"]
      }
    });

    const generatedGateway = await post(`${baseUrl}/api/v1/projects/edge-gateway-product/harness-profiles/generate`, {
      profileId: "default",
      goalLoopTarget: "Evolve our API gateway product with route matching, upstream selection, rate limit policy, plugin lifecycle, Gateway API compatibility, and load regression checks"
    });
    assert.equal(generatedGateway.data.profile.templateRef.templateId, "api-gateway-harness");
    assert.equal(generatedGateway.data.profile.templateRef.version, "2.2.0");
    assert.ok(generatedGateway.data.profile.generatedBy.evidence.some((item) => item.includes("domain=api-gateway")));
    assert.equal(generatedGateway.data.profile.sourceContent.runtime.domain, "api-gateway");
    assert.ok(generatedGateway.data.profile.sourceContent.validation.requiredActions.includes("bind-route-policy-suite"));
    assert.ok(generatedGateway.data.profile.sourceContent.evidence.evidenceAdapters.some((adapter) => adapter.artifact === "route-table"));
    assert.ok(generatedGateway.data.profile.sourceContent.rules.domainHarnessReleaseBlockers.some((blocker) => blocker.includes("load-summary")));
    assert.ok(generatedGateway.data.profile.sourceContent.metadata.repoProbe.moduleSignals.some((signal) => signal.id === "route" && signal.matchedPaths.length > 0));
    assert.ok(generatedGateway.data.profile.compiledContent.validation.contractChecks.includes("route-contract"));

    await post(`${baseUrl}/api/v1/projects`, {
      id: "java-billing-service",
      name: "Java Billing Service",
      repository: { provider: "local-git", root: javaAppRepoRoot },
      runtime: {
        language: "java",
        unitCommands: ["./mvnw test"],
        smokeCommands: ["./mvnw verify"]
      }
    });

    const generatedJavaDatabaseClient = await post(`${baseUrl}/api/v1/projects/java-billing-service/harness-profiles/generate`, {
      profileId: "default",
      goalLoopTarget: "Add MySQL database connection pool and JDBC datasource migration for the billing service"
    });
    assert.equal(generatedJavaDatabaseClient.data.profile.templateRef.templateId, "java-ddd-service-harness");
    assert.ok(generatedJavaDatabaseClient.data.profile.generatedBy.evidence.some((item) => item.includes("runtimeLanguage=java")));
  } finally {
    await close(server);
  }
});

test("ProjectHarnessProfile API creates, validates, activates, explains, and binds profiles to goal plans", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-harness-profile-api-"));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-harness-repo-"));
  fs.writeFileSync(path.join(repoRoot, "pyproject.toml"), "[project]\nname = \"agent\"\nversion = \"0.1.0\"\n");
  fs.mkdirSync(path.join(repoRoot, "tests"));
  fs.writeFileSync(path.join(repoRoot, "tests", "test_smoke.py"), "def test_smoke():\n    assert True\n");

  const server = createServer({ dataRoot, runtimeMode: "debug" });
  await listen(server);
  const baseUrl = serverUrl(server);

  try {
    const templates = await get(`${baseUrl}/api/v1/harness/templates`);
    assert.ok(templates.data.templates.some((template) => template.id === "python-enterprise-harness"));

    const project = await post(`${baseUrl}/api/v1/projects`, {
      id: "python-agent",
      name: "Python Agent",
      repository: { provider: "local-git", root: repoRoot },
      runtime: {
        language: "python",
        installCommands: ["pip install -e ."],
        unitCommands: ["pytest"],
        smokeCommands: ["pytest -q tests"]
      }
    });
    assert.equal(project.data.id, "python-agent");
    assert.equal(project.data.validation.status, "VERIFIED");

    const generated = await post(`${baseUrl}/api/v1/projects/python-agent/harness-profiles/generate`, {
      profileId: "default",
      templateId: "python-enterprise-harness",
      goalLoopTarget: "Define a production Python enterprise harness for this project"
    });
    assert.equal(generated.data.status, "DRAFT");
    assert.equal(generated.data.profile.status, "DRAFT");
    assert.equal(generated.data.profile.validation.status, "VALIDATED");
    assert.equal(generated.data.profile.generatedBy.mode, "deterministic-template");
    assert.equal(generated.data.summary.latestVersion, 1);

    const activated = await post(`${baseUrl}/api/v1/projects/python-agent/harness-profiles/default/activate`, { version: 1 });
    assert.equal(activated.data.status, "ACTIVE");
    assert.equal(activated.data.profile.status, "ACTIVE");
    assert.equal(activated.data.summary.activeVersion, 1);
    const activeDigest = activated.data.profile.compiledDigest;

    const goal = await post(`${baseUrl}/api/v1/goals`, {
      projectId: "python-agent",
      objective: "Ship Python enterprise harness controlled goal planning"
    });
    const planned = await post(`${baseUrl}/api/v1/goals/${goal.data.id}/plan`, {});
    assert.equal(planned.data.plan.projectHarness.profileId, "default");
    assert.equal(planned.data.plan.projectHarness.version, 1);
    assert.equal(planned.data.plan.projectHarness.compiledDigest, activeDigest);
    assert.ok(planned.data.plan.targets.some((target) => target.evidence.includes(`projectHarnessDigest=${activeDigest}`)));

    const explain = await get(`${baseUrl}/api/v1/projects/python-agent/harness-profiles/default/explain`);
    assert.ok(explain.data.moduleMapping.some((row) => row.module === "Goal target planner"));
    assert.ok(explain.data.effectiveControls.capabilities.some((capability) => capability.id === "python-runtime"));

    const sourceV2 = {
      ...activated.data.profile.sourceContent,
      runtime: {
        ...activated.data.profile.sourceContent.runtime,
        lintCommands: ["ruff check .", "ruff format --check ."]
      },
      metadata: {
        ...activated.data.profile.sourceContent.metadata,
        revision: "add-format-check"
      }
    };
    const validation = await post(`${baseUrl}/api/v1/projects/python-agent/harness-profiles/validate`, {
      sourceFormat: "json",
      sourceContent: sourceV2
    });
    assert.equal(validation.data.status, "VALIDATED");
    assert.equal(validation.data.diffFromActive.status, "CHANGED");
    assert.ok(validation.data.diffFromActive.changedSections.includes("runtime"));

    const applied = await post(`${baseUrl}/api/v1/projects/python-agent/harness-profiles`, {
      sourceFormat: "json",
      sourceContent: sourceV2
    });
    assert.equal(applied.data.status, "VALIDATED");
    assert.equal(applied.data.profile.version, 2);
    assert.equal(applied.data.profile.diffFromActive.status, "CHANGED");

    const reactivated = await post(`${baseUrl}/api/v1/projects/python-agent/harness-profiles/default/activate`, { version: 2 });
    assert.equal(reactivated.data.summary.activeVersion, 2);
    const old = await get(`${baseUrl}/api/v1/projects/python-agent/harness-profiles/default/versions/1`);
    assert.equal(old.data.status, "SUPERSEDED");
  } finally {
    await close(server);
  }
});

test("EvoPilot CLI manages ProjectHarnessProfile YAML through server APIs", async () => {
  assert.ok(fs.existsSync(cliPath), "CLI must be built before functional tests run");
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-harness-profile-cli-"));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-harness-cli-repo-"));
  fs.writeFileSync(path.join(repoRoot, "pyproject.toml"), "[project]\nname = \"cli-agent\"\nversion = \"0.1.0\"\n");
  fs.mkdirSync(path.join(repoRoot, "tests"));
  fs.writeFileSync(path.join(repoRoot, "tests", "test_smoke.py"), "def test_smoke():\n    assert True\n");
  const profileFile = path.join(dataRoot, "profile.yaml");
  fs.writeFileSync(profileFile, [
    "schema: evopilot-project-harness-profile/v1",
    "profileId: default",
    "projectId: cli-python-agent",
    "name: CLI Python Harness",
    "template:",
    "  templateId: python-enterprise-harness",
    "runtime:",
    "  language: python",
    "  installCommands:",
    "    - pip install -e .",
    "  lintCommands:",
    "    - ruff check .",
    "  typecheckCommands:",
    "    - mypy .",
    "  unitCommands:",
    "    - pytest",
    "  smokeCommands:",
    "    - pytest -q tests",
    "validation:",
    "  commands:",
    "    - installCommands",
    "    - lintCommands",
    "    - typecheckCommands",
    "    - unitCommands",
    "    - smokeCommands",
    "evidence:",
    "  requiredArtifacts:",
    "    - target-evidence-package",
    "    - phase-package",
    "    - goal-completion-report",
    "governance:",
    "  tenantWorkspaceScopeRequired: true",
    "  targetPlanRequiresApproval: true",
    "  profileActivationRequiresApproval: true",
    "  promotionRequiresReleaseDecision: true",
    "  sourceClosureRequired: true",
    "  noSilentProfileMutation: true",
    ""
  ].join("\n"));

  const server = createServer({ dataRoot, runtimeMode: "debug" });
  await listen(server);
  const baseUrl = serverUrl(server);

  try {
    await post(`${baseUrl}/api/v1/projects`, {
      id: "cli-python-agent",
      name: "CLI Python Agent",
      repository: { provider: "local-git", root: repoRoot },
      runtime: {
        language: "python",
        installCommands: ["pip install -e ."],
        unitCommands: ["pytest"],
        smokeCommands: ["pytest -q tests"]
      }
    });

    const templates = await runCliJson(["--server", baseUrl, "harness", "template", "list", "--json"]);
    assert.ok(templates.templates.some((template) => template.id === "python-enterprise-harness"));

    const validation = await runCliJson(["--server", baseUrl, "harness", "profile", "validate", "--project", "cli-python-agent", "--file", profileFile, "--json"]);
    assert.equal(validation.status, "VALIDATED");

    const applied = await runCliJson(["--server", baseUrl, "harness", "profile", "apply", "--project", "cli-python-agent", "--file", profileFile, "--json"]);
    assert.equal(applied.status, "VALIDATED");
    assert.equal(applied.profile.version, 1);

    const activated = await runCliJson(["--server", baseUrl, "harness", "profile", "activate", "default", "--project", "cli-python-agent", "--version", "1", "--json"]);
    assert.equal(activated.status, "ACTIVE");
    assert.equal(activated.summary.activeVersion, 1);

    const explain = await runCliJson(["--server", baseUrl, "harness", "profile", "explain", "default", "--project", "cli-python-agent", "--json"]);
    assert.ok(explain.moduleMapping.some((row) => row.module === "Release governance"));
  } finally {
    await close(server);
  }
});

test("HarnessTemplate evolution CLI creates reviewable drafts, publishes, and reports project impact", async () => {
  assert.ok(fs.existsSync(cliPath), "CLI must be built before functional tests run");
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-harness-template-evolution-"));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-harness-template-evolution-repo-"));
  fs.writeFileSync(path.join(repoRoot, "pyproject.toml"), "[project]\nname = \"evolution-python-agent\"\nversion = \"0.1.0\"\n");
  fs.mkdirSync(path.join(repoRoot, "docs"));
  fs.writeFileSync(path.join(repoRoot, "README.md"), "# Legacy Cache Scheduler\n\nDistributed cache service with shards, slots, TTL eviction, hot key protection, and scheduler cron DAG jobs.\n");
  fs.writeFileSync(path.join(repoRoot, "docs", "architecture.md"), "# Architecture\n\nCache nodes use consistent hashing, replication, failover, and worker heartbeat. Scheduler jobs track misfire, retry, idempotency, and leader election.\n");
  fs.mkdirSync(path.join(repoRoot, "tests"));
  fs.writeFileSync(path.join(repoRoot, "tests", "test_smoke.py"), "def test_smoke():\n    assert True\n");
  const productionLog = path.join(dataRoot, "prod-incident.log");
  fs.writeFileSync(productionLog, [
    "2026-08-07T10:00:00Z ERROR requestId=req-123 traceId=trace-abc user=ops@example.com token=raw-secret-token Bearer abc.def.ghi",
    "Cache timeout during shard failover; retry exhausted; scheduler misfire for daily settlement job."
  ].join("\n"));
  const pdfAttachment = path.join(dataRoot, "domain-runbook.pdf");
  fs.writeFileSync(pdfAttachment, minimalPdfWithText("PDF runbook: Prometheus dashboards, trace correlation, SLO alerts, and retry repair evidence for cache and scheduler operations."));

  const server = createServer({ dataRoot, runtimeMode: "debug" });
  await listen(server);
  const baseUrl = serverUrl(server);

  try {
    await post(`${baseUrl}/api/v1/projects`, {
      id: "evolution-python-agent",
      name: "Evolution Python Agent",
      repository: { provider: "local-git", root: repoRoot },
      runtime: {
        language: "python",
        installCommands: ["uv sync"],
        unitCommands: ["pytest"],
        smokeCommands: ["pytest -q tests"]
      }
    });

    const generated = await runCliJson([
      "--server", baseUrl,
      "harness", "profile", "generate",
      "--project", "evolution-python-agent",
      "--goal-loop-target", "Use the active Python enterprise harness before template evolution",
      "--json"
    ]);
    assert.equal(generated.profile.templateRef.templateId, "python-enterprise-harness");
    assert.equal(generated.profile.templateRef.version, "1.1.0");

    await runCliJson([
      "--server", baseUrl,
      "harness", "profile", "activate", "default",
      "--project", "evolution-python-agent",
      "--version", String(generated.profile.version),
      "--json"
    ]);

    const created = await runCliJson([
      "--server", baseUrl,
      "harness", "template", "evolution", "create",
      "--base-template", "python-enterprise-harness",
      "--target-version", "1.1.1",
      "--intent", "Add reviewable Python exception tracking, observability, and AI troubleshooting metadata from administrator knowledge.",
      "--source", `project=${repoRoot}`,
      "--source", `log=${productionLog}`,
      "--source", "evopilot-history=evolution-python-agent",
      "--file", pdfAttachment,
      "--note", "Enterprise Python services should map FastAPI exceptions into stable error envelopes, correlate logs with traceId/requestId, expose Prometheus metrics, and keep runbooks for SLO alerts.",
      "--json"
    ]);
    assert.equal(created.status, "CREATED");
    const evolutionId = created.evolution.evolutionId;
    assert.equal(created.evolution.sources.length, 5);

    const collected = await runCliJson(["--server", baseUrl, "harness", "template", "evolution", "advance", evolutionId, "--json"]);
    assert.equal(collected.status, "SOURCES_COLLECTED");
    assert.equal(collected.evolution.snapshots.length, 5);
    assert.match(collected.evolution.snapshots[0].contentDigest, /^sha256:/);
    const logSnapshot = collected.evolution.snapshots.find((snapshot) => snapshot.type === "production-log");
    assert.ok(logSnapshot);
    assert.equal(logSnapshot.metadata.redaction.applied, true);
    assert.equal(logSnapshot.extractedText.includes("raw-secret-token"), false);
    assert.equal(logSnapshot.extractedText.includes("ops@example.com"), false);
    const pdfSnapshot = collected.evolution.snapshots.find((snapshot) => snapshot.name === "domain-runbook.pdf");
    assert.ok(pdfSnapshot);
    assert.equal(pdfSnapshot.type, "attachment");
    assert.equal(pdfSnapshot.metadata.extractedBy, "cli-pdf-text-reader");
    assert.match(pdfSnapshot.extractedText, /Prometheus dashboards/);

    const analyzed = await runCliJson(["--server", baseUrl, "harness", "template", "evolution", "advance", evolutionId, "--json"]);
    assert.equal(analyzed.status, "ANALYZED");
    assert.ok(analyzed.evolution.analysisSummary.observabilitySignals.includes("trace-correlation"));
    assert.ok(analyzed.evolution.analysisSummary.domainSignals.includes("distributed-cache-domain"));
    assert.ok(analyzed.evolution.analysisSummary.domainSignals.includes("scheduler-domain"));
    assert.ok(analyzed.evolution.analysisSummary.gapClassifications.includes("project-profile"));

    const drafted = await runCliJson(["--server", baseUrl, "harness", "template", "evolution", "advance", evolutionId, "--json"]);
    assert.equal(drafted.status, "REVIEW_REQUIRED");
    assert.equal(drafted.evolution.draft.template.id, "python-enterprise-harness");
    assert.equal(drafted.evolution.draft.template.version, "1.1.1");
    assert.equal(drafted.evolution.draft.validation.status, "VALIDATED");
    assert.ok(drafted.evolution.draft.diffFromBase.changedSections.includes("sourceReferences"));
    const sourceCoverage = drafted.evolution.draft.sourceCoverage.sources;
    assert.ok(sourceCoverage.some((source) => source.type === "source-project" && source.knowledgeCategory === "source-project" && source.usedFor.includes("domain-patterns")));
    const logCoverage = sourceCoverage.find((source) => source.type === "production-log");
    assert.ok(logCoverage);
    assert.equal(logCoverage.redactionApplied, true);
    assert.equal(logCoverage.gapClassification, "tenant-policy");
    assert.ok(logCoverage.projectActions.some((action) => action.includes("redacted")));
    assert.ok(sourceCoverage.some((source) => source.type === "attachment" && source.knowledgeCategory === "attachment" && source.usedFor.includes("observability")));

    const approved = await runCliJson([
      "--server", baseUrl,
      "harness", "template", "evolution", "approve", evolutionId,
      "--confirmed-by", "platform-admin",
      "--confirmation", "Reviewed the HarnessTemplateEvolution draft and approved publishing version 1.1.1.",
      "--json"
    ]);
    assert.equal(approved.status, "APPROVED");

    const published = await runCliJson(["--server", baseUrl, "harness", "template", "evolution", "publish", evolutionId, "--json"]);
    assert.equal(published.status, "PUBLISHED");
    assert.equal(published.template.version, "1.1.1");
    assert.equal(published.impactReport.staleProfileCount, 1);
    assert.equal(published.impactReport.affectedProjectProfiles[0].projectId, "evolution-python-agent");
    assert.equal(published.impactReport.affectedProjectProfiles[0].impact, "STALE_TEMPLATE_VERSION");

    const inspected = await runCliJson(["--server", baseUrl, "harness", "template", "evolution", "inspect", evolutionId, "--json"]);
    assert.equal(inspected.status, "PUBLISHED");
    assert.equal(inspected.publishedTemplateRef.version, "1.1.1");

    const impact = await runCliJson(["--server", baseUrl, "harness", "template", "evolution", "impact", evolutionId, "--json"]);
    assert.equal(impact.impactReport.staleProfileCount, 1);

    await post(`${baseUrl}/api/v1/projects`, {
      id: "evolution-python-agent-two",
      name: "Evolution Python Agent Two",
      repository: { provider: "local-git", root: repoRoot },
      runtime: {
        language: "python",
        installCommands: ["uv sync"],
        unitCommands: ["pytest"],
        smokeCommands: ["pytest -q tests"]
      }
    });
    const generatedSecondProfile = await runCliJson([
      "--server", baseUrl,
      "harness", "profile", "generate",
      "--project", "evolution-python-agent-two",
      "--goal-loop-target", "Use the previous Python enterprise harness after template evolution",
      "--from-template", "python-enterprise-harness",
      "--from-template-version", "1.1.0",
      "--json"
    ]);
    assert.equal(generatedSecondProfile.profile.templateRef.version, "1.1.0");
    await runCliJson([
      "--server", baseUrl,
      "harness", "profile", "activate", "default",
      "--project", "evolution-python-agent-two",
      "--version", String(generatedSecondProfile.profile.version),
      "--json"
    ]);
    const refreshedImpact = await runCliJson(["--server", baseUrl, "harness", "template", "evolution", "impact", evolutionId, "--refresh", "--json"]);
    assert.equal(refreshedImpact.status, "IMPACT_ANALYZED");
    assert.equal(refreshedImpact.impactReport.staleProfileCount, 2);

    await post(`${baseUrl}/api/v1/projects`, {
      id: "evolution-python-agent-draft-only",
      name: "Evolution Python Agent Draft Only",
      repository: { provider: "local-git", root: repoRoot },
      runtime: {
        language: "python",
        installCommands: ["uv sync"],
        unitCommands: ["pytest"],
        smokeCommands: ["pytest -q tests"]
      }
    });
    const draftOnlyProfile = await runCliJson([
      "--server", baseUrl,
      "harness", "profile", "generate",
      "--project", "evolution-python-agent-draft-only",
      "--goal-loop-target", "Draft-only profile should not be counted as stale active impact",
      "--from-template", "python-enterprise-harness",
      "--from-template-version", "1.1.0",
      "--json"
    ]);
    assert.equal(draftOnlyProfile.profile.status, "DRAFT");
    const draftOnlyImpact = await runCliJson(["--server", baseUrl, "harness", "template", "evolution", "impact", evolutionId, "--refresh", "--json"]);
    assert.equal(draftOnlyImpact.impactReport.staleProfileCount, 2);
    const noActiveProfile = draftOnlyImpact.impactReport.affectedProjectProfiles.find((profile) => profile.projectId === "evolution-python-agent-draft-only");
    assert.equal(noActiveProfile.impact, "NO_ACTIVE_PROFILE");
    assert.equal(noActiveProfile.activeVersion, undefined);

    const template = await runCliJson(["--server", baseUrl, "harness", "template", "inspect", "python-enterprise-harness", "--version", "1.1.1", "--json"]);
    assert.equal(template.version, "1.1.1");
    assert.ok(template.sourceReferences.some((reference) => reference.name === "Administrator note"));
  } finally {
    await close(server);
  }
});

test("HarnessTemplate evolution auto-matches source projects to existing or new domain templates", async () => {
  assert.ok(fs.existsSync(cliPath), "CLI must be built before functional tests run");
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-harness-template-match-"));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-distributed-cache-repo-"));
  fs.writeFileSync(path.join(repoRoot, "go.mod"), "module example.com/distributed-cache\n\ngo 1.22\n");
  fs.writeFileSync(path.join(repoRoot, "README.md"), [
    "# Distributed Cache Product",
    "",
    "A self-developed Redis-compatible distributed cache product with KV store APIs.",
    "The system owns TTL, LRU eviction, hot key protection, consistent hashing, hash slot migration, shards, replicas, failover, and Raft metadata consensus."
  ].join("\n"));
  fs.mkdirSync(path.join(repoRoot, "docs"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "docs", "architecture.md"), [
    "# Architecture",
    "",
    "Cache nodes are grouped into clusters. Slot migration, replica promotion, and failover are part of the product boundary.",
    "Operational evidence includes benchmark summaries, recovery logs, and shard rebalancing reports."
  ].join("\n"));
  fs.mkdirSync(path.join(repoRoot, "cmd", "cache"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "cmd", "cache", "main.go"), "package main\n\nfunc main() {}\n");

  const server = createServer({ dataRoot, runtimeMode: "debug" });
  await listen(server);
  const baseUrl = serverUrl(server);

  try {
    const matched = await runCliJson([
      "--server", baseUrl,
      "harness", "template", "match",
      "--source-project", repoRoot,
      "--intent", "Create or evolve the harness for self-developed distributed cache products.",
      "--json"
    ]);
    assert.equal(matched.schema, "evopilot-harness-template-match-result/v1");
    assert.equal(matched.match.decision, "CREATE_NEW_FROM_BASE");
    assert.ok(matched.match.confidence >= 0.8);
    assert.equal(matched.match.baseTemplateRef.templateId, "go-middleware-harness");
    assert.equal(matched.match.targetTemplateId, "distributed-cache-harness");
    assert.equal(matched.match.targetVersion, "0.1.0");
    assert.equal(matched.match.targetHarnessLayer, "domain");
    assert.equal(matched.match.targetDomain, "distributed-cache");
    assert.ok(matched.match.languageSignals.some((signal) => signal.includes("go.mod")));
    assert.ok(matched.match.domainSignals.some((signal) => signal.includes("distributed-cache")));

    const created = await runCliJson([
      "--server", baseUrl,
      "harness", "template", "evolution", "create",
      "--source-project", repoRoot,
      "--intent", "Create or evolve the harness for self-developed distributed cache products.",
      "--auto-match",
      "--json"
    ]);
    assert.equal(created.status, "CREATED");
    assert.equal(created.autoMatch.decision, "CREATE_NEW_FROM_BASE");
    assert.equal(created.evolution.autoMatch.decision, "CREATE_NEW_FROM_BASE");
    assert.equal(created.evolution.baseTemplateRef.templateId, "go-middleware-harness");
    assert.equal(created.evolution.targetTemplateId, "distributed-cache-harness");
    assert.equal(created.evolution.targetVersion, "0.1.0");
    assert.equal(created.nextAction, "advance-template-evolution");

    const evolved = await runCliJson([
      "--server", baseUrl,
      "harness", "evolve",
      "--source-project", repoRoot,
      "--goal", "Create or evolve the harness for self-developed distributed cache products.",
      "--json"
    ]);
    assert.equal(evolved.schema, "evopilot-harness-evolve-command-result/v1");
    assert.equal(evolved.workflowResult.schema, "evopilot-harness-evolve-result/v1");
    assert.equal(evolved.workflowResult.status, "REVIEW_REQUIRED");
    assert.equal(evolved.workflowResult.nextAction, "review-approve-template-evolution");
    assert.equal(evolved.workflowResult.evolution.targetTemplateId, "distributed-cache-harness");
    assert.equal(evolved.workflowResult.evolution.targetVersion, "0.1.0");
    assert.equal(evolved.workflowResult.autoMatch.decision, "CREATE_NEW_FROM_BASE");
    assert.equal(evolved.workflowResult.validation.status, "VALIDATED");
    assert.ok(evolved.workflowResult.workflow.steps.some((step) => step.status === "SOURCES_COLLECTED"));
    assert.ok(evolved.workflowResult.workflow.steps.some((step) => step.status === "ANALYZED"));
    assert.ok(evolved.workflowResult.workflow.steps.some((step) => step.status === "REVIEW_REQUIRED"));
    assert.equal(evolved.publications.length, 0);
  } finally {
    await close(server);
  }
});

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function serverUrl(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function get(url) {
  const response = await fetch(url);
  const body = await response.json();
  assert.ok(response.ok, `${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const parsed = await response.json();
  assert.ok(response.ok, `${response.status} ${JSON.stringify(parsed)}`);
  return parsed;
}

async function postExpectStatus(url, body, status) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const parsed = await response.json();
  assert.equal(response.status, status, JSON.stringify(parsed));
  return parsed;
}

async function runCliJson(args) {
  const output = await runCliText(args);
  return JSON.parse(output);
}

async function runCliText(args) {
  const child = spawn(process.execPath, [cliPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 0, stderr || stdout);
  return stdout;
}

function minimalPdfWithText(text) {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${escaped.length + 47} >>\nstream\nBT /F1 12 Tf 72 720 Td (${escaped}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return body;
}
