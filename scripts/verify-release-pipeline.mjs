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
    requireMatch(workflow, /actions\/download-artifact@v4/, `${name} must download the exact Candidate artifacts`);
    requireMatch(workflow, /run-id:\s*\$\{\{ inputs\.candidate_run_id \}\}/, `${name} must download from the exact Candidate run`);
    requireMatch(workflow, /project-candidate-handoff\.mjs verify/, `${name} must verify the Candidate handoff`);
    rejectMatch(workflow, /^ {6}[A-Z][A-Z0-9_]*:\s*\$\{\{\s*runner\./m, `${name} must not use runner context in job-level env`);
    for (const forbidden of [/npm ci/, /npm run build/, /npm pack/, /npm run release:artifact/, /docker\/build-push-action/, /--clobber/]) {
      rejectMatch(workflow, forbidden, `${name} must not rebuild or overwrite accepted artifacts (${forbidden.source})`);
    }
  }

  requireMatch(release, /environment:\s*release/, "GitHub/GHCR promotion must use the protected release environment");
  rejectMatch(release, /environment:\s*npm/, "GitHub/GHCR promotion must not use the npm environment");
  requireMatch(npm, /environment:\s*npm/, "npm promotion must use the dedicated npm environment");
  rejectMatch(npm, /environment:\s*release/, "npm promotion must not reuse the release environment");

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
  requireMatch(npm, /github_release_authorization_digest:/, "npm promotion must separately bind the prior GitHub Release authorization");
  requireMatch(npm, /GITHUB_RELEASE_AUTHORIZATION_DIGEST:\s*\$\{\{ inputs\.github_release_authorization_digest \}\}/, "npm promotion must project the prior GitHub Release authorization separately");
  requireMatch(npm, /NPM_PUBLICATION_AUTHORIZATION_DIGEST:\s*\$\{\{ inputs\.release_authorization_digest \}\}/, "npm promotion must project the npm publication authorization separately");
  requireMatch(npm, /--release-authorization-digest "\$GITHUB_RELEASE_AUTHORIZATION_DIGEST"/, "npm promotion must verify the public GitHub Release against its original authorization");
  requireMatch(npm, /authorizationDigest !== NPM_PUBLICATION_AUTHORIZATION_DIGEST|authorizationDigest !== authorizationDigest/, "npm promotion must verify its current publication authorization against the Target");
  requireMatch(npm, /publish_or_verify\(\)/, "npm promotion must reconcile every exact package version before publication");
  requireMatch(npm, /grep -q "E404"/, "npm promotion may publish only after an authoritative Registry not-found result");
  requireMatch(npm, /test "\$actual_integrity" = "\$expected_integrity"/, "npm promotion must reject existing package integrity drift");
  requireMatch(npm, /npm audit signatures/, "npm promotion must verify Registry signatures and provenance after publication");
  requireMatch(npm, /npm install --ignore-scripts --no-audit --no-fund --registry "\$REGISTRY"/, "npm signature verification must install the registry dependency graph before auditing signatures");
  rejectMatch(npm, /npm install --package-lock-only/, "npm signature verification must not use a lockfile-only install that leaves no auditable dependency graph");
  requireMatch(npm, /CANDIDATE_DIR=\$RUNNER_TEMP\/evopilot-candidate\/release/, "npm promotion must initialize Candidate paths at runner step runtime");
  requireMatch(npm, /ref:\s*\$\{\{ github\.sha \}\}/, "npm promotion must use the dispatched workflow commit for recoverable promotion mechanics");
  rejectMatch(npm, /ref:\s*\$\{\{ inputs\.candidate_commit \}\}/, "npm promotion mechanics must not roll back to the immutable Candidate source");
  requireMatch(npm, /if \[\[ "\$VERSION" == "4\.0\.0" \]\]; then\s*\n\s*echo "approved-v4-adapter-exception"/, "npm promotion must bind the adapter provenance exception to exactly v4.0.0");
  requireLiteral(npm, 'publish_or_verify "@evopilot/adapter-mcp" "$CANDIDATE_DIR/evopilot-adapter-mcp-${VERSION}.tgz" "$ADAPTER_PROVENANCE_MODE"', "npm promotion must apply the version-bound provenance policy to adapter-mcp");
  requireLiteral(npm, 'publish_or_verify "@evopilot/adapter-opencode" "$CANDIDATE_DIR/evopilot-adapter-opencode-${VERSION}.tgz" "$ADAPTER_PROVENANCE_MODE"', "npm promotion must apply the version-bound provenance policy to adapter-opencode");
  requireLiteral(npm, 'publish_or_verify "@evopilot/contracts" "$CANDIDATE_DIR/evopilot-contracts-${VERSION}.tgz" required', "npm promotion must retain provenance for contracts");
  requireLiteral(npm, 'publish_or_verify "@evopilot/client" "$CANDIDATE_DIR/evopilot-client-${VERSION}.tgz" required', "npm promotion must retain provenance for client");
  requireLiteral(npm, 'publish_or_verify "@evopilot/cli" "$CANDIDATE_DIR/evopilot-cli-${VERSION}.tgz" required', "npm promotion must retain provenance for cli");
  requireLiteral(npm, 'publish_or_verify "create-evopilot" "$CANDIDATE_DIR/create-evopilot-${VERSION}.tgz" required', "npm promotion must retain provenance for create-evopilot");
  requireMatch(npm, /approved-v4-adapter-exception\)\s*\n\s*npm publish "\$tarball" --access public --provenance=false/, "npm promotion must disable provenance only behind the approved adapter exception mode");

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
  const dynamicAdapterCalls = npm.match(/(?:publish_or_verify|verify_public_package)[^\n]+\$ADAPTER_PROVENANCE_MODE/g) ?? [];
  if (dynamicAdapterCalls.length !== 4) failures.push("npm promotion must apply the version-bound provenance policy to exactly two publish and two verification adapter calls");

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

export function validateEvolutionExpertCandidate(candidate) {
  const failures = [];

  requireMatch(/workflow_dispatch:/, "Expert Candidate formation must be an explicit workflow dispatch");
  requireMatch(/commit_sha:/, "Expert Candidate formation must accept an exact commit SHA");
  requireMatch(/target_id:/, "Expert Candidate formation must bind the approved Expert Target");
  requireMatch(/\^evopilot-evolution-expert-v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/, "Expert Candidate formation must reject a Target outside the versioned Expert namespace");
  requireMatch(/test "\$TARGET_ID" = "evopilot-evolution-expert-v\$VERSION"/, "Expert Candidate formation must bind the Target id to the independent Expert package version");
  requireMatch(/packages\/evolution-expert\/package\.json/, "Expert Candidate formation must bind the independent Expert package version");
  requireMatch(/npm run check/, "Expert Candidate formation must run the full repository check");
  requireMatch(/npm run release:ready/, "Expert Candidate formation must pass repository release readiness");
  requireMatch(/npm run verify:release-pipeline/, "Expert Candidate formation must pass the combined release-pipeline contract");
  requireMatch(/npm run evolution-expert:release:artifact/, "Expert Candidate formation must build the Expert release set");
  requireMatch(/npm run verify:evolution-expert-release-artifact/, "Expert Candidate formation must verify the Expert release set");
  requireMatch(/actions\/upload-artifact@v4/, "Expert Candidate formation must upload a controlled artifact");
  requireMatch(/artifact_digest:\s*["']sha256:\$\{\{\s*steps\.release_set\.outputs\.artifact-digest\s*\}\}["']/, "Expert Candidate handoff must receive an algorithm-qualified channel digest");
  requireMatch(/project-candidate-handoff\.mjs build/, "Expert Candidate formation must build the exact handoff after fresh materialization");
  requireMatch(/project-candidate-handoff\.mjs verify/, "Expert Candidate formation must verify the exact handoff");
  requireMatch(/--release-unit evolution-expert/, "Expert Candidate handoff must identify the independent release unit");
  requireMatch(/--artifact-prefix evopilot-evolution-expert/, "Expert Candidate handoff must use its independent artifact namespace");
  requireMatch(/--required-kinds npm-package,sbom,provenance,checksums/, "Expert Candidate handoff must require its complete package release set");
  requireMatch(/retention-days:\s*30/, "Expert Candidate channel must declare bounded retention");
  rejectMatch(/npm publish/, "Expert Candidate formation must not publish npm packages");
  rejectMatch(/gh release (?:create|upload|edit)/, "Expert Candidate formation must not mutate GitHub Releases");
  rejectMatch(/push:\s*true/, "Expert Candidate formation must not publish an image");
  rejectMatch(/lifecycles\//, "Expert Candidate workflow must not invoke EvoPilot product Lifecycle definitions");
  rejectMatch(/Lifecycle(?:Definition|Revision|Binding|Run)/, "Expert Candidate workflow must remain separate from product Lifecycle objects");

  return {
    schema: "evopilot-evolution-expert-candidate-pipeline-result/v1",
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    invariants: {
      independentVersionBound: failures.every((item) => !item.includes("independent Expert package version")),
      completeCandidateHandoff: failures.every((item) => !item.includes("handoff") && !item.includes("release set")),
      noPublication: failures.every((item) => !item.includes("must not"))
    }
  };

  function requireMatch(pattern, message) {
    if (!pattern.test(candidate)) failures.push(message);
  }

  function rejectMatch(pattern, message) {
    if (pattern.test(candidate)) failures.push(message);
  }
}

export function verifyReleasePipeline(rootDir = path.resolve(import.meta.dirname, "..")) {
  const runtime = validateReleasePipeline({
    candidate: fs.readFileSync(path.join(rootDir, ".github/workflows/release-candidate.yml"), "utf8"),
    release: fs.readFileSync(path.join(rootDir, ".github/workflows/release-artifacts.yml"), "utf8"),
    npm: fs.readFileSync(path.join(rootDir, ".github/workflows/npm-packages.yml"), "utf8")
  });
  const expert = validateEvolutionExpertCandidate(
    fs.readFileSync(path.join(rootDir, ".github/workflows/evolution-expert-release-candidate.yml"), "utf8")
  );
  return {
    ...runtime,
    status: runtime.status === "PASS" && expert.status === "PASS" ? "PASS" : "FAIL",
    failures: [...runtime.failures, ...expert.failures],
    invariants: {
      ...runtime.invariants,
      expertCandidateIndependent: expert.status === "PASS"
    },
    releaseUnits: {
      runtime: runtime.status,
      evolutionExpert: expert.status
    }
  };
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
