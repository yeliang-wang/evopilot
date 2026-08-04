import { readFile } from "node:fs/promises";

const requiredFiles = [
  "LICENSE",
  "NOTICE",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  ".github/workflows/release-artifacts.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/pull_request_template.md",
  "docs/reference/open-source-readiness.md",
  "docs/reference/open-source-maturity-report.md",
  "docs/reference/github-metadata.md",
  "docs/operations/self-hosting.md",
  "docs/operations/release-management.md",
  "docs/releases/1.1.2.md",
  "deploy/ecs/compose.immutable.yaml",
  "scripts/build-release-artifacts.mjs",
  "scripts/verify-release-artifacts.mjs",
  "examples/README.md",
  "examples/source-to-ga/README.md",
  "examples/source-to-ga/node-api-service-goal-loop.md",
  "examples/source-to-ga/evopilot-dashboard-goal-loop.md",
];

const requiredReadmeLinkTargets = [
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  "NOTICE",
  "LICENSE",
  "CHANGELOG.md",
  "docs/reference/open-source-readiness.md",
  "docs/reference/open-source-maturity-report.md",
  "docs/operations/self-hosting.md",
  "docs/operations/release-management.md",
  "docs/reference/github-metadata.md",
];

const failures = [];

async function readRequired(path) {
  try {
    const content = await readFile(path, "utf8");
    if (!content.trim()) {
      failures.push(`${path} is empty`);
    }
    return content;
  } catch (error) {
    failures.push(`${path} is missing: ${error.message}`);
    return "";
  }
}

for (const file of requiredFiles) {
  await readRequired(file);
}

const packageJson = JSON.parse(await readRequired("package.json"));
if (packageJson.license !== "Apache-2.0") {
  failures.push(`package.json license must be Apache-2.0, got ${packageJson.license ?? "<missing>"}`);
}

const license = await readRequired("LICENSE");
if (!license.includes("Apache License") || !license.includes("Version 2.0")) {
  failures.push("LICENSE must contain Apache License 2.0 text");
}

const notice = await readRequired("NOTICE");
if (!notice.includes("EvoPilot") || !notice.includes("Apache License, Version 2.0")) {
  failures.push("NOTICE must identify EvoPilot and the Apache License 2.0 basis");
}

const readme = await readRequired("README.md");
for (const target of requiredReadmeLinkTargets) {
  if (!readme.includes(`(${target})`) && !readme.includes(`(./${target})`)) {
    failures.push(`README.md must link to ${target}`);
  }
}

const readiness = await readRequired("docs/reference/open-source-readiness.md");
for (const phrase of ["Public Trust Assets", "Product Evidence Assets", "Validation Commands", "Top-Tier Open Source Boundary"]) {
  if (!readiness.includes(phrase)) {
    failures.push(`docs/reference/open-source-readiness.md must include ${phrase}`);
  }
}

const maturity = await readRequired("docs/reference/open-source-maturity-report.md");
for (const phrase of ["Conclusion", "Capability Coverage", "Top-Tier Gap Assessment", "Maturity Target"]) {
  if (!maturity.includes(phrase)) {
    failures.push(`docs/reference/open-source-maturity-report.md must include ${phrase}`);
  }
}

const selfHosting = await readRequired("docs/operations/self-hosting.md");
for (const phrase of ["15 Minute Path", "Backup", "Upgrade Path", "Acceptance Checklist"]) {
  if (!selfHosting.includes(phrase)) {
    failures.push(`docs/operations/self-hosting.md must include ${phrase}`);
  }
}

const releaseManagement = await readRequired("docs/operations/release-management.md");
for (const phrase of ["Release Policy", "Versioning", "Release Checklist", "GitHub Release Notes", "Immutable Release Artifacts"]) {
  if (!releaseManagement.includes(phrase)) {
    failures.push(`docs/operations/release-management.md must include ${phrase}`);
  }
}

const examples = await readRequired("examples/source-to-ga/README.md");
for (const phrase of ["Node API service", "EvoPilot Dashboard", "Required Stop Points"]) {
  if (!examples.includes(phrase)) {
    failures.push(`examples/source-to-ga/README.md must include ${phrase}`);
  }
}

const metadata = await readRequired("docs/reference/github-metadata.md");
for (const phrase of ["Description", "Topics", "Update Rule"]) {
  if (!metadata.includes(phrase)) {
    failures.push(`docs/reference/github-metadata.md must include ${phrase}`);
  }
}

if (failures.length > 0) {
  console.error("Open-source governance verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Open-source governance verification passed.");
