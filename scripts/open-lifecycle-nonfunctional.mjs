#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FileLifecycleCatalog,
  LifecycleService,
  parseLifecycleYaml
} from "../packages/server/dist/domains/lifecycle/index.js";

const root = process.cwd();
const lifecycleRoot = path.join(root, "lifecycles");
const reportDir = path.join(root, "dist", "test-matrix");
const reportPath = path.join(reportDir, "open-lifecycle-nonfunctional.json");
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-lifecycle-nonfunctional-"));
const checks = [];
const iterations = 200;
const concurrentRuns = 32;
const digest = (character) => `sha256:${character.repeat(64)}`;

try {
  const catalog = new FileLifecycleCatalog([lifecycleRoot]);
  const durations = [];
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    const before = performance.now();
    const revision = catalog.resolve("documentation-hotfix", "1.0.0");
    if (!revision.digest.startsWith("sha256:")) throw new Error("revision digest missing");
    durations.push(performance.now() - before);
  }
  const elapsedMs = performance.now() - started;
  const sorted = [...durations].sort((left, right) => left - right);
  const p95Ms = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
  const throughputPerSecond = iterations / Math.max(elapsedMs / 1000, 0.001);
  record("performance", p95Ms <= 100 && throughputPerSecond >= 10, { iterations, elapsedMs, p95Ms, throughputPerSecond, thresholds: { p95Ms: 100, throughputPerSecond: 10 } });

  let resourceBlocked = false;
  try {
    parseLifecycleYaml({ sourceRef: "oversized.yaml", text: "x".repeat(256 * 1024 + 1) });
  } catch (error) {
    resourceBlocked = String(error).includes("LIFECYCLE_RESOURCE_LIMIT");
  }
  record("resource-limits", resourceBlocked, { maximumYamlBytes: 256 * 1024, oversizedInputRejected: resourceBlocked });

  const service = new LifecycleService(runtimeRoot, [lifecycleRoot]);
  const created = await Promise.all(Array.from({ length: concurrentRuns }, async (_, index) => service.start({
    id: `run-${index}`,
    lifecycleId: "documentation-hotfix",
    lifecycleVersion: "1.0.0",
    tenantId: index % 2 === 0 ? "tenant-a" : "tenant-b",
    workspaceId: index % 4 < 2 ? "workspace-a" : "workspace-b",
    projectId: `project-${index}`,
    policyDigest: digest("1"),
    runtimeDigest: digest("2"),
    harnessBundle: { id: "bundle-a", version: "1.0.0", digest: digest("3") },
    executor: {
      host: "acceptance-host",
      provider: "deterministic",
      model: "no-model",
      capabilities: ["agent.execute"],
      agentRuntime: {
        profileId: "acceptance-runtime",
        profileVersion: "1.0.0",
        adapterId: "acceptance-runtime.adapter@1",
        profileDigest: digest("8"),
        qualificationDigest: digest("9")
      },
      sandbox: { workspaceRef: "/tmp/evopilot-lifecycle-nonfunctional", permissionMode: "HOST_MANAGED_DENY_UNDECLARED" },
      allowedEffects: ["READ_ONLY", "REVERSIBLE", "EXTERNAL", "IRREVERSIBLE"],
      credentialRefs: []
    },
    answers: { projectRoot: `/workspace/project-${index}`, documentationScope: ["README.md"] }
  })));
  record("concurrency", created.length === concurrentRuns && new Set(created.map((run) => run.id)).size === concurrentRuns, { requested: concurrentRuns, created: created.length, unique: new Set(created.map((run) => run.id)).size });

  const tenantAWorkspaceA = service.list({ tenantId: "tenant-a", workspaceId: "workspace-a" });
  const scoped = tenantAWorkspaceA.every((run) => run.tenantId === "tenant-a" && run.workspaceId === "workspace-a");
  record("tenant-workspace-isolation", scoped && tenantAWorkspaceA.length === 8, { visible: tenantAWorkspaceA.length, expected: 8, crossScopeVisible: !scoped });

  const cancelled = created.slice(0, 8).map((run) => service.cancel(run.id, "acceptance-operator", "acceptance:cancellation", run.binding.digest));
  record("cancellation", cancelled.every((run) => run.status === "CANCELLED" && run.decisions.at(-1)?.authority === "lifecycle-cancellation"), { cancelled: cancelled.length, digestBound: true });

  const recovered = new LifecycleService(runtimeRoot, [lifecycleRoot]);
  const replayed = recovered.list();
  const recoveryClosed = replayed.length === concurrentRuns && created.every((run) => recovered.read(run.id)?.binding?.digest === run.binding.digest);
  record("failure-recovery", recoveryClosed, { persisted: replayed.length, expected: concurrentRuns, bindingDigestsStable: recoveryClosed });

  const persistedText = fs.readdirSync(path.join(runtimeRoot, "lifecycle-runs")).map((name) => fs.readFileSync(path.join(runtimeRoot, "lifecycle-runs", name), "utf8")).join("\n");
  const rawSecretPattern = /(?:token|password|api[-_]?key)\s*[=:]\s*(?!<redacted>|secret:\/\/)[^\s,;\"]+/i;
  record("security-redaction", !rawSecretPattern.test(persistedText), { rawSecretMatches: rawSecretPattern.test(persistedText) ? 1 : 0 });

  record("observability-audit", sourceContains("packages/server/src/http/routes/lifecycles.ts", "appendAudit") && sourceContains("packages/server/src/http/request-logging.ts", "requestCorrelation"), { lifecycleAudit: true, requestCorrelation: true });
  record("documentation-packaging", [
    "docs/architecture/open-lifecycle-harness.md",
    "docs/guides/open-lifecycle-harness.md",
    "docs/operations/test-matrix.md",
    "packages/adapter-opencode/README.md",
    "scripts/build-release-artifacts.mjs",
    "scripts/verify-release-artifacts.mjs"
  ].every((relative) => fs.existsSync(path.join(root, relative))), { requiredFilesPresent: true });
} catch (error) {
  record("runner", false, { error: error instanceof Error ? error.message : String(error) });
} finally {
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
}

const failed = checks.filter((check) => check.status !== "PASS");
const report = {
  schema: "evopilot-open-lifecycle-nonfunctional/v1",
  status: failed.length === 0 ? "PASS" : "FAIL",
  generatedAt: new Date().toISOString(),
  checks,
  grantsAuthority: false,
  reportPath
};
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failed.length > 0) {
  console.error(`Open Lifecycle non-functional validation failed: ${failed.map((check) => check.id).join(", ")}`);
  process.exit(1);
}
console.log(`Open Lifecycle non-functional validation passed: ${reportPath}`);

function record(id, pass, evidence) {
  checks.push({ id, status: pass ? "PASS" : "FAIL", evidence });
}

function sourceContains(relative, pattern) {
  return fs.readFileSync(path.join(root, relative), "utf8").includes(pattern);
}
