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
requireFile("scripts/open-lifecycle-nonfunctional.mjs");
requireFile("scripts/project-candidate-handoff.mjs");
requireFile("scripts/build-evolution-expert-release-artifacts.mjs");
requireFile("scripts/verify-evolution-expert-release-artifacts.mjs");
requireFile("scripts/release-promotion-record.mjs");
requireFile("scripts/verify-release-pipeline.mjs");
requireFile("scripts/verify-npm-registry-publication.mjs");
requireFile("tests/failure-recovery/control-plane-failure-recovery.test.mjs");
requireFile(".github/workflows/ci.yml");
requireFile(".github/workflows/release-candidate.yml");
requireFile(".github/workflows/evolution-expert-release-candidate.yml");
requireFile(".github/workflows/evolution-expert-release.yml");
requireFile(".github/workflows/release-artifacts.yml");
requireFile(".github/workflows/failure-recovery.yml");
requireFile(".github/workflows/release-ready.yml");
requireFile(".github/workflows/pr-artifacts.yml");
requireFile(".github/workflows/npm-packages.yml");

requirePackageScript("check");
requirePackageScript("cli:test");
requirePackageScript("test:failure-recovery");
requirePackageScript("release:ready");
requirePackageScript("release:artifact");
requirePackageScript("evolution-expert:release:artifact");
requirePackageScript("ecs:immutable-rollout");
requirePackageScript("verify:release-artifact");
requirePackageScript("verify:evolution-expert-release-artifact");
requirePackageScript("verify:release-pipeline");
requirePackageScript("verify:npm-registry");
requirePackageScript("test:e2e:production");
requirePackageScript("release:soak:ga:active");
requirePackageScript("test:agent-adapters");
requirePackageScript("test:open-lifecycle:nonfunctional");

requireContent("CHANGELOG.md", new RegExp(`v?${escapeRegExp(version)}`), `CHANGELOG.md must mention ${version}`);
requireContent(`docs/releases/${version}.md`, new RegExp(`v?${escapeRegExp(version)}`), `release notes must mention ${version}`);
requireContent("docs/operations/test-matrix.md", /test:failure-recovery/, "test matrix must document failure recovery");
requireContent("docs/operations/test-matrix.md", /release:ready/, "test matrix must document release readiness");
requireContent("docs/operations/test-matrix.md", /PR artifacts/, "test matrix must document PR artifacts");
requireContent("docs/operations/test-matrix.md", /EvoPilot v4 Candidate Acceptance/, "test matrix must document v4 Candidate acceptance");
requireContent("docs/operations/release-management.md", /ecs:immutable-rollout/, "release management must document immutable rollout automation");
requireContent("docs/operations/release-management.md", /verify:npm-registry/, "release management must document public npm registry verification");
requireContent("docs/operations/distribution.md", /verify:npm-registry/, "distribution docs must document public npm registry verification");
requireContent("docs/operations/release-management.md", /build once/i, "release management must document one-time Candidate construction");
requireContent("docs/operations/release-management.md", /accepted bytes/i, "release management must document accepted-byte promotion");
requireContent("docs/operations/release-management.md", /evolution-expert-release-candidate\.yml/, "release management must document the independent Expert Candidate path");
requireContent(".github/workflows/release-candidate.yml", /npm run release:artifact/, "Candidate workflow must build the release set");
requireContent(".github/workflows/release-candidate.yml", /actions\/upload-artifact@v4/, "Candidate workflow must upload the controlled release set");
requireContent(".github/workflows/evolution-expert-release-candidate.yml", /evolution-expert:release:artifact/, "Expert Candidate workflow must build its independent release set");
requireContent(".github/workflows/evolution-expert-release-candidate.yml", /project-candidate-handoff\.mjs build/, "Expert Candidate workflow must create an immutable handoff");
requireContent(".github/workflows/evolution-expert-release.yml", /project-candidate-handoff\.mjs verify/, "Expert release workflow must verify the accepted handoff");
requireContent(".github/workflows/evolution-expert-release.yml", /npm publish "\$TARBALL" --access public --provenance/, "Expert release workflow must promote the accepted tarball with provenance");
requireContent(".github/workflows/evolution-expert-release.yml", /evopilot-expert compatibility codex 5\.0\.0/, "Expert release workflow must verify Runtime compatibility from a public install");
requireContent("packages/evolution-expert/CHANGELOG.md", new RegExp(escapeRegExp(readJson("packages/evolution-expert/package.json").version)), "Expert changelog must mention its package version");
requireContent(".github/workflows/release-artifacts.yml", /actions\/download-artifact@v4/, "Release workflow must consume the Candidate release set");
requireContent("scripts/immutable-rollback-runbook.mjs", /evopilot-immutable-rollback-runbook\/v1/, "immutable rollback runbook must emit evidence schema");
requireContent("scripts/immutable-rollback-runbook.mjs", /--no-build/, "immutable rollback runbook must avoid production rebuilds");
requireContent("scripts/verify-npm-registry-publication.mjs", /empty-project npm install smoke/, "npm registry verifier must run an empty-project install smoke");
requireContent(".github/workflows/failure-recovery.yml", /npm run test:failure-recovery/, "failure recovery workflow must run the matrix");
requireContent(".github/workflows/release-ready.yml", /npm run release:ready/, "release ready workflow must run release:ready");
requireContent(".github/workflows/npm-packages.yml", /npm run verify:npm-registry/, "npm publish workflow must verify public registry installation");
requireContent(".github/workflows/pr-artifacts.yml", /npm run check/, "PR artifacts workflow must run check");
requireContent(".github/workflows/pr-artifacts.yml", /npm run test:failure-recovery/, "PR artifacts workflow must run failure recovery");
requireContent(".github/workflows/pr-artifacts.yml", /npm run release:artifact/, "PR artifacts workflow must build release artifacts");
requireContent(".github/workflows/pr-artifacts.yml", /npm run verify:release-artifact/, "PR artifacts workflow must verify release artifacts");
requireContent(".github/workflows/pr-artifacts.yml", /actions\/upload-artifact@v4/, "PR artifacts workflow must upload artifacts");

runCommandCheck("release:pipeline-contract", "node", ["scripts/verify-release-pipeline.mjs"]);
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
  if (!fs.existsSync(path.join(root, ".git"))) {
    runPackagedSourceIntegrityCheck();
    return;
  }
  try {
    execFileSync("git", ["diff", "--check"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    checks.push({ id: "git:diff-check", status: "PASS", message: "git diff --check passed" });
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    checks.push({ id: "git:diff-check", status: "FAIL", message: output || "git diff --check failed" });
  }
}

function runCommandCheck(id, command, args) {
  try {
    const output = execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    checks.push({ id, status: "PASS", message: output || `${command} ${args.join(" ")} passed` });
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    checks.push({ id, status: "FAIL", message: output || error.message });
  }
}

function runPackagedSourceIntegrityCheck() {
  const excluded = new Set([".codex", ".git", ".codex-evidence", ".tmp", "data", "dist", "node_modules", "tmp"]);
  const failures = [];
  for (const file of walkSourceFiles(root, excluded)) {
    const buffer = fs.readFileSync(file);
    if (buffer.includes(0)) continue;
    const lines = buffer.toString("utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/[ \t]+$/.test(line)) failures.push(`${path.relative(root, file)}:${index + 1}: trailing whitespace`);
      if (/^(?:<<<<<<<|=======|>>>>>>>)(?:\s|$)/.test(line)) failures.push(`${path.relative(root, file)}:${index + 1}: conflict marker`);
    });
  }
  checks.push({
    id: "source:integrity-check",
    status: failures.length === 0 ? "PASS" : "FAIL",
    message: failures.length === 0 ? "Git-free packaged source integrity check passed" : failures.slice(0, 20).join("; ")
  });
}

function walkSourceFiles(directory, excluded) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...walkSourceFiles(target, excluded));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
