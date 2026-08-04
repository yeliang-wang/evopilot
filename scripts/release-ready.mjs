import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = readJson("package.json");
const version = packageJson.version;
const reportDir = path.join(root, "dist", "test-matrix");
const reportPath = path.join(reportDir, "release-ready.json");
const checks = [];

fs.mkdirSync(reportDir, { recursive: true });

requireFile("CHANGELOG.md");
requireFile(`docs/releases/${version}.md`);
requireFile("docs/operations/test-matrix.md");
requireFile("scripts/failure-recovery-matrix.mjs");
requireFile("scripts/immutable-rollback-runbook.mjs");
requireFile("scripts/release-ready.mjs");
requireFile("tests/failure-recovery/control-plane-failure-recovery.test.mjs");
requireFile(".github/workflows/ci.yml");
requireFile(".github/workflows/release-artifacts.yml");
requireFile(".github/workflows/failure-recovery.yml");
requireFile(".github/workflows/release-ready.yml");
requireFile(".github/workflows/pr-artifacts.yml");

requirePackageScript("check");
requirePackageScript("cli:test");
requirePackageScript("test:failure-recovery");
requirePackageScript("release:ready");
requirePackageScript("release:artifact");
requirePackageScript("ecs:immutable-rollout");
requirePackageScript("verify:release-artifact");
requirePackageScript("test:e2e:production");
requirePackageScript("release:soak:ga:active");

requireContent("CHANGELOG.md", new RegExp(`v?${escapeRegExp(version)}`), `CHANGELOG.md must mention ${version}`);
requireContent(`docs/releases/${version}.md`, new RegExp(`v?${escapeRegExp(version)}`), `release notes must mention ${version}`);
requireContent("docs/operations/test-matrix.md", /test:failure-recovery/, "test matrix must document failure recovery");
requireContent("docs/operations/test-matrix.md", /release:ready/, "test matrix must document release readiness");
requireContent("docs/operations/test-matrix.md", /PR artifacts/, "test matrix must document PR artifacts");
requireContent("docs/operations/release-management.md", /ecs:immutable-rollout/, "release management must document immutable rollout automation");
requireContent("scripts/immutable-rollback-runbook.mjs", /evopilot-immutable-rollback-runbook\/v1/, "immutable rollback runbook must emit evidence schema");
requireContent("scripts/immutable-rollback-runbook.mjs", /--no-build/, "immutable rollback runbook must avoid production rebuilds");
requireContent(".github/workflows/failure-recovery.yml", /npm run test:failure-recovery/, "failure recovery workflow must run the matrix");
requireContent(".github/workflows/release-ready.yml", /npm run release:ready/, "release ready workflow must run release:ready");
requireContent(".github/workflows/pr-artifacts.yml", /npm run check/, "PR artifacts workflow must run check");
requireContent(".github/workflows/pr-artifacts.yml", /npm run test:failure-recovery/, "PR artifacts workflow must run failure recovery");
requireContent(".github/workflows/pr-artifacts.yml", /npm run release:artifact/, "PR artifacts workflow must build release artifacts");
requireContent(".github/workflows/pr-artifacts.yml", /npm run verify:release-artifact/, "PR artifacts workflow must verify release artifacts");
requireContent(".github/workflows/pr-artifacts.yml", /actions\/upload-artifact@v4/, "PR artifacts workflow must upload artifacts");

runDiffCheck();

const failures = checks.filter((check) => check.status !== "PASS");
const report = {
  schema: "evopilot-release-readiness/v1",
  status: failures.length === 0 ? "PASS" : "FAIL",
  version,
  generatedAt: new Date().toISOString(),
  checks,
  reportPath
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) {
  console.error("Release readiness failed:");
  for (const failure of failures) console.error(`- ${failure.id}: ${failure.message}`);
  console.error(`Report: ${reportPath}`);
  process.exit(1);
}

console.log(`Release readiness passed: ${reportPath}`);

function requireFile(relativePath) {
  const ok = fs.existsSync(path.join(root, relativePath));
  checks.push({
    id: `file:${relativePath}`,
    status: ok ? "PASS" : "FAIL",
    message: ok ? "present" : `${relativePath} is missing`
  });
}

function requirePackageScript(name) {
  const ok = Boolean(packageJson.scripts?.[name]);
  checks.push({
    id: `script:${name}`,
    status: ok ? "PASS" : "FAIL",
    message: ok ? packageJson.scripts[name] : `${name} script is missing`
  });
}

function requireContent(relativePath, pattern, message) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    checks.push({ id: `content:${relativePath}`, status: "FAIL", message: `${relativePath} is missing` });
    return;
  }
  const content = fs.readFileSync(absolute, "utf8");
  const ok = pattern.test(content);
  checks.push({
    id: `content:${relativePath}:${pattern.source}`,
    status: ok ? "PASS" : "FAIL",
    message: ok ? "matched" : message
  });
}

function runDiffCheck() {
  try {
    execFileSync("git", ["diff", "--check"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    checks.push({ id: "git:diff-check", status: "PASS", message: "git diff --check passed" });
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    checks.push({ id: "git:diff-check", status: "FAIL", message: output || "git diff --check failed" });
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
