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

test("HarnessTemplate API and CLI apply versioned templates with changelog", async () => {
  assert.ok(fs.existsSync(cliPath), "CLI must be built before functional tests run");
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-harness-template-"));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-harness-template-repo-"));
  fs.writeFileSync(path.join(repoRoot, "pyproject.toml"), "[project]\nname = \"template-agent\"\nversion = \"0.1.0\"\n");
  const templateFile = path.join(dataRoot, "template.yaml");
  fs.writeFileSync(templateFile, [
    "schema: evopilot-harness-template/v1",
    "id: python-enterprise-harness",
    "version: 1.1.0",
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
      "harness", "template", "apply",
      "--file", templateFile,
      "--changelog", "Add admin-managed Python enterprise harness template version 1.1.0.",
      "--json"
    ]);
    assert.equal(applied.action, "CREATED_VERSION");
    assert.equal(applied.template.id, "python-enterprise-harness");
    assert.equal(applied.template.version, "1.1.0");
    assert.ok(applied.template.changelog.some((entry) => entry.version === "1.1.0"));

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
      templateVersion: "1.1.0",
      goalLoopTarget: "Use the admin-managed Python enterprise harness template version"
    });
    assert.equal(generated.data.profile.templateRef.version, "1.1.0");
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
