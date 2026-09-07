#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function validateReleasePipeline(workflows) {
  const failures = [];
  const candidate = workflows.candidate;
  const release = workflows.release;
  const npm = workflows.npm;

  requireMatch(candidate, /workflow_dispatch:/, "Candidate formation must be an explicit workflow dispatch");
  requireMatch(candidate, /commit_sha:/, "Candidate formation must accept an exact commit SHA");
  requireMatch(candidate, /target_id:/, "Candidate formation must bind an approved Target");
  requireMatch(candidate, /npm run check/, "Candidate formation must run the full check");
  requireMatch(candidate, /run:\s*GITHUB_REF_NAME="\$RELEASE_TAG" npm run release:artifact/, "Candidate formation must bind the synthetic Candidate tag directly on the artifact-builder process");
  requireMatch(candidate, /npm run verify:release-artifact/, "Candidate formation must verify the release set");
  requireMatch(candidate, /outputs:\s*type=docker,dest=/, "Candidate formation must export a loadable container archive");
  requireMatch(candidate, /push:\s*false/, "Candidate image build must not publish during controlled Candidate formation");
  requireMatch(candidate, /actions\/upload-artifact@v4/, "Candidate formation must upload a controlled GitHub Actions artifact");
  requireMatch(candidate, /artifact_digest:\s*["']sha256:\$\{\{\s*steps\.release_set\.outputs\.artifact-digest\s*\}\}["']/, "Candidate handoff must receive an algorithm-qualified channel artifact digest");
  requireMatch(candidate, /project-candidate-handoff\.mjs build/, "Candidate formation must create the exact handoff after fresh materialization");
  rejectMatch(candidate, /^ {6}[A-Z][A-Z0-9_]*:\s*\$\{\{\s*runner\./m, "Candidate workflow must not use runner context in job-level env");
  rejectMatch(candidate, /^ {10}GITHUB_REF_NAME:/m, "Candidate workflow must not attempt to override reserved GITHUB_REF_NAME through step env");
  rejectMatch(candidate, /push:\s*true/, "Controlled Candidate formation must not push a public image");
  rejectMatch(candidate, /gh release (?:create|upload|edit)/, "Controlled Candidate formation must not create or mutate a GitHub Release");
  rejectMatch(candidate, /npm publish/, "Controlled Candidate formation must not publish npm packages");

  for (const [name, workflow] of [["GitHub/GHCR promotion", release], ["npm promotion", npm]]) {
    requireMatch(workflow, /workflow_dispatch:/, `${name} must require explicit dispatch`);
    requireMatch(workflow, /candidate_run_id:/, `${name} must bind the Candidate run id`);
    requireMatch(workflow, /candidate_commit:/, `${name} must bind the Candidate commit`);
    requireMatch(workflow, /candidate_handoff_sha256:/, `${name} must bind the Candidate handoff digest`);
    requireMatch(workflow, /acceptance_digest:/, `${name} must bind final Candidate acceptance`);
    requireMatch(workflow, /release_authorization_digest:/, `${name} must bind separate release authorization`);
    requireMatch(workflow, /environment:\s*release/, `${name} must use the protected release environment`);
    requireMatch(workflow, /actions\/download-artifact@v4/, `${name} must download the exact Candidate artifacts`);
    requireMatch(workflow, /run-id:\s*\$\{\{ inputs\.candidate_run_id \}\}/, `${name} must download from the exact Candidate run`);
    requireMatch(workflow, /project-candidate-handoff\.mjs verify/, `${name} must verify the Candidate handoff`);
    for (const forbidden of [/npm ci/, /npm run build/, /npm pack/, /npm run release:artifact/, /docker\/build-push-action/, /--clobber/]) {
      rejectMatch(workflow, forbidden, `${name} must not rebuild or overwrite accepted artifacts (${forbidden.source})`);
    }
  }

  requireMatch(release, /existing_image_digest:/, "GHCR recovery must bind the exact reconciled digest it may replace");
  requireMatch(release, /oras-project\/setup-oras@1d808f7d7f6995cc68b7bf507bfe5c5446e1dc9d/, "GHCR promotion must pin the reviewed ORAS setup action");
  requireMatch(release, /version:\s*1\.3\.3/, "GHCR promotion must pin ORAS 1.3.3");
  requireMatch(release, /oras resolve --oci-layout/, "GHCR promotion must verify the accepted OCI layout manifest before publication");
  requireMatch(release, /oras cp --from-oci-layout/, "GHCR promotion must copy the accepted OCI layout without manifest conversion");
  requireMatch(release, /oras resolve "\$IMAGE_REPOSITORY:\$TAG"/, "GHCR promotion must resolve every public tag after promotion");
  requireMatch(release, /test "\$ACTUAL_DIGEST" = "\$EXPECTED_IMAGE_DIGEST"/, "GHCR promotion must reject post-promotion digest drift");
  rejectMatch(release, /docker load --input/, "GHCR promotion must not convert the accepted OCI manifest through docker load");
  rejectMatch(release, /docker (?:tag|push)/, "GHCR promotion must not convert or republish the accepted OCI manifest through Docker");
  requireMatch(release, /gh release create/, "GitHub promotion must create the Release from accepted artifacts");
  requireMatch(release, /--verify-tag/, "GitHub promotion must use an exact pre-existing release tag");
  rejectMatch(release, /--target\s+"?\$CANDIDATE_COMMIT/, "GitHub promotion must not ask GITHUB_TOKEN to create a tag at the Candidate commit");
  requireMatch(release, /REMOTE_TAG_COMMIT=.*git ls-remote/, "GitHub promotion must resolve the remote release tag before creating a Release");
  requireMatch(release, /cmp --silent/, "Draft Release recovery must compare existing assets instead of clobbering them");
  requireMatch(release, /gh release upload/, "GitHub promotion must upload accepted artifacts");
  requireMatch(release, /release-promotion-record\.mjs build/, "GitHub promotion must preserve Candidate, acceptance, and Release Binding digests");
  requireOrder(release, "gh release create", "oras cp --from-oci-layout", "GitHub promotion must create an inspectable draft before changing GHCR tags");
  requireOrder(release, "oras cp --from-oci-layout", "gh release edit \"$RELEASE_TAG\" --draft=false", "GitHub promotion must publish the Release only after GHCR digest verification");
  rejectMatch(release, /push:\s*\n\s*tags:/, "Release promotion must not be triggered implicitly by a tag push");
  requireMatch(npm, /release-promotion-record\.mjs verify/, "npm promotion must match the public GitHub Release promotion record");

  for (const packageName of [
    "evopilot-contracts-${VERSION}.tgz",
    "evopilot-client-${VERSION}.tgz",
    "evopilot-adapter-mcp-${VERSION}.tgz",
    "evopilot-adapter-opencode-${VERSION}.tgz",
    "evopilot-cli-${VERSION}.tgz",
    "create-evopilot-${VERSION}.tgz"
  ]) {
    requireLiteral(npm, packageName, `npm promotion must publish accepted tarball ${packageName}`);
  }
  rejectMatch(npm, /npm publish\s+-w/, "npm promotion must publish tarballs, never workspaces");

  for (const [name, workflow] of Object.entries(workflows)) {
    rejectMatch(workflow, /lifecycles\//, `${name} release workflow must not invoke EvoPilot product Lifecycle definitions`);
    rejectMatch(workflow, /Lifecycle(?:Definition|Revision|Binding|Run)/, `${name} release workflow must remain separate from product Lifecycle objects`);
  }

  return {
    schema: "evopilot-release-pipeline-contract-result/v1",
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    invariants: {
      candidateBuiltOnce: failures.every((item) => !item.includes("Candidate formation")),
      acceptedBytesPromotedWithoutRebuild: failures.every((item) => !item.includes("promotion")),
      productLifecycleBoundaryPreserved: failures.every((item) => !item.includes("product Lifecycle"))
    }
  };

  function requireMatch(text, pattern, message) {
    if (!pattern.test(text)) failures.push(message);
  }

  function rejectMatch(text, pattern, message) {
    if (pattern.test(text)) failures.push(message);
  }

  function requireLiteral(text, literal, message) {
    if (!text.includes(literal)) failures.push(message);
  }

  function requireOrder(text, before, after, message) {
    const beforeIndex = text.indexOf(before);
    const afterIndex = text.indexOf(after);
    if (beforeIndex === -1 || afterIndex === -1 || beforeIndex >= afterIndex) failures.push(message);
  }
}

export function verifyReleasePipeline(rootDir = path.resolve(import.meta.dirname, "..")) {
  return validateReleasePipeline({
    candidate: fs.readFileSync(path.join(rootDir, ".github/workflows/release-candidate.yml"), "utf8"),
    release: fs.readFileSync(path.join(rootDir, ".github/workflows/release-artifacts.yml"), "utf8"),
    npm: fs.readFileSync(path.join(rootDir, ".github/workflows/npm-packages.yml"), "utf8")
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyReleasePipeline();
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "PASS") process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
