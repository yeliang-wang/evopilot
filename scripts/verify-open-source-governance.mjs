import { readFile } from "node:fs/promises";

const requiredFiles = [
  "LICENSE",
  "NOTICE",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/pull_request_template.md",
  "docs/reference/open-source-readiness.md",
  "docs/reference/github-metadata.md",
];

const requiredReadmeLinkTargets = [
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  "NOTICE",
  "LICENSE",
  "CHANGELOG.md",
  "docs/reference/open-source-readiness.md",
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
for (const phrase of ["Public Trust Assets", "Product Evidence Assets", "Validation Commands"]) {
  if (!readiness.includes(phrase)) {
    failures.push(`docs/reference/open-source-readiness.md must include ${phrase}`);
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
