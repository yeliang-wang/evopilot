import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateReleasePipeline, verifyReleasePipeline } from "../../scripts/verify-release-pipeline.mjs";
import { run as runRegistryCommand } from "../../scripts/verify-npm-registry-publication.mjs";

test("release pipeline forms one Candidate and promotes exact accepted bytes", () => {
  const result = verifyReleasePipeline();
  assert.equal(result.status, "PASS", JSON.stringify(result.failures));
  assert.equal(result.invariants.candidateBuiltOnce, true);
  assert.equal(result.invariants.acceptedBytesPromotedWithoutRebuild, true);
  assert.equal(result.invariants.productLifecycleBoundaryPreserved, true);
});

test("release pipeline contract rejects a GA rebuild", () => {
  const workflows = {
    candidate: fs.readFileSync(".github/workflows/release-candidate.yml", "utf8"),
    release: `${fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8")}\n      - run: npm ci\n      - run: npm run release:artifact\n`,
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("must not rebuild")));
});

test("release pipeline contract rejects product Lifecycle coupling", () => {
  const workflows = {
    candidate: `${fs.readFileSync(".github/workflows/release-candidate.yml", "utf8")}\n# LifecycleRun\n`,
    release: fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8"),
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("product Lifecycle")));
});

test("release pipeline contract rejects runner context in Candidate job-level env", () => {
  const workflows = {
    candidate: `${fs.readFileSync(".github/workflows/release-candidate.yml", "utf8")}\n    env:\n      CANDIDATE_DIR: \${{ runner.temp }}/candidate\n`,
    release: fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8"),
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("runner context in job-level env")));
});

test("release pipeline contract rejects runner context in npm job-level env", () => {
  const workflows = {
    candidate: fs.readFileSync(".github/workflows/release-candidate.yml", "utf8"),
    release: fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8"),
    npm: `${fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")}\n    env:\n      CANDIDATE_DIR: \${{ runner.temp }}/candidate\n`
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("npm promotion must not use runner context in job-level env")));
});

test("release pipeline contract rejects overriding reserved GITHUB_REF_NAME through step env", () => {
  const candidate = fs.readFileSync(".github/workflows/release-candidate.yml", "utf8")
    .replace('run: GITHUB_REF_NAME="$RELEASE_TAG" npm run release:artifact', "run: npm run release:artifact")
    .replace("          EVOPILOT_IMAGE_REF:", "          GITHUB_REF_NAME: ${{ env.RELEASE_TAG }}\n          EVOPILOT_IMAGE_REF:");
  const workflows = {
    candidate,
    release: fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8"),
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("reserved GITHUB_REF_NAME")));
});

test("release pipeline contract rejects an unqualified Candidate channel artifact digest", () => {
  const candidate = fs.readFileSync(".github/workflows/release-candidate.yml", "utf8")
    .replace('artifact_digest: "sha256:${{ steps.release_set.outputs.artifact-digest }}"', "artifact_digest: ${{ steps.release_set.outputs.artifact-digest }}");
  const workflows = {
    candidate,
    release: fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8"),
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("algorithm-qualified channel artifact digest")));
});

test("release pipeline contract rejects Docker-mediated OCI promotion", () => {
  const release = fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8")
    .replace(/oras cp --from-oci-layout[^\n]+/, 'docker load --input "$IMAGE_ARCHIVE"\n          docker push "$IMAGE_REPOSITORY:$VERSION"');
  const workflows = {
    candidate: fs.readFileSync(".github/workflows/release-candidate.yml", "utf8"),
    release,
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("OCI layout") || failure.includes("Docker")));
});

test("release pipeline contract rejects implicit release-tag creation", () => {
  const release = fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8")
    .replace("--verify-tag", '--target "$CANDIDATE_COMMIT"');
  const workflows = {
    candidate: fs.readFileSync(".github/workflows/release-candidate.yml", "utf8"),
    release,
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("pre-existing release tag") || failure.includes("must not ask GITHUB_TOKEN")));
});

test("release pipeline contract rejects missing post-promotion digest enforcement", () => {
  const release = fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8")
    .replace('test "$ACTUAL_DIGEST" = "$EXPECTED_IMAGE_DIGEST"', ": # digest check removed");
  const workflows = {
    candidate: fs.readFileSync(".github/workflows/release-candidate.yml", "utf8"),
    release,
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("digest drift")));
});

test("release pipeline contract rejects conflated GitHub and npm authorization digests", () => {
  const npm = fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
    .replace('--release-authorization-digest "$GITHUB_RELEASE_AUTHORIZATION_DIGEST"', '--release-authorization-digest "$NPM_PUBLICATION_AUTHORIZATION_DIGEST"');
  const workflows = {
    candidate: fs.readFileSync(".github/workflows/release-candidate.yml", "utf8"),
    release: fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8"),
    npm
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("original authorization")));
});

test("release pipeline contract rejects npm promotion through the release environment", () => {
  const workflows = {
    candidate: fs.readFileSync(".github/workflows/release-candidate.yml", "utf8"),
    release: fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8"),
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8").replace("environment: npm", "environment: release")
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("dedicated npm environment") || failure.includes("must not reuse")));
});

test("release pipeline contract rejects GitHub and GHCR promotion through the npm environment", () => {
  const workflows = {
    candidate: fs.readFileSync(".github/workflows/release-candidate.yml", "utf8"),
    release: fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8").replace("environment: release", "environment: npm"),
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("protected release environment") || failure.includes("must not use the npm")));
});

test("npm registry verifier accepts commands that inherit or ignore stdio", () => {
  const output = runRegistryCommand(process.execPath, ["-e", "process.stdout.write('not captured')"], {
    stdio: ["ignore", "ignore", "ignore"]
  });
  assert.equal(output, "");
});

test("release pipeline contract rejects rolling npm mechanics back to Candidate source", () => {
  const workflows = {
    candidate: fs.readFileSync(".github/workflows/release-candidate.yml", "utf8"),
    release: fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8"),
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8").replace("ref: ${{ github.sha }}", "ref: ${{ inputs.candidate_commit }}")
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("workflow commit") || failure.includes("roll back")));
});

test("adapter manifests declare repository metadata for future npm provenance", () => {
  for (const packageName of ["adapter-mcp", "adapter-opencode"]) {
    const manifest = JSON.parse(fs.readFileSync(`packages/${packageName}/package.json`, "utf8"));
    assert.equal(manifest.repository?.url, "git+ssh://git@github.com/yeliang-wang/evopilot.git");
    assert.equal(manifest.repository?.directory, `packages/${packageName}`);
    assert.equal(manifest.homepage, "https://github.com/yeliang-wang/evopilot#readme");
    assert.equal(manifest.bugs?.url, "https://github.com/yeliang-wang/evopilot/issues");
  }
});

test("release pipeline contract rejects unsafe partial npm publication recovery", () => {
  const npm = fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
    .replace("publish_or_verify()", "publish_without_reconciliation()")
    .replace('grep -q "E404"', 'grep -q "ANY_ERROR"')
    .replaceAll('test "$actual_integrity" = "$expected_integrity"', ": # integrity comparison removed");
  const workflows = {
    candidate: fs.readFileSync(".github/workflows/release-candidate.yml", "utf8"),
    release: fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8"),
    npm
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("reconcile every exact package")));
  assert.ok(result.failures.some((failure) => failure.includes("authoritative Registry not-found")));
  assert.ok(result.failures.some((failure) => failure.includes("integrity drift")));
});

test("release pipeline contract rejects lockfile-only signature verification", () => {
  const workflows = {
    candidate: fs.readFileSync(".github/workflows/release-candidate.yml", "utf8"),
    release: fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8"),
    npm: fs.readFileSync(".github/workflows/npm-packages.yml", "utf8").replace(
      "npm install --ignore-scripts --no-audit --no-fund --registry",
      "npm install --package-lock-only --ignore-scripts --no-audit --no-fund --registry"
    )
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("dependency graph") || failure.includes("lockfile-only")));
});

test("release pipeline contract rejects expanding the v4 provenance exception", () => {
  const npm = fs.readFileSync(".github/workflows/npm-packages.yml", "utf8")
    .replace('publish_or_verify "@evopilot/cli" "$CANDIDATE_DIR/evopilot-cli-${VERSION}.tgz" required', 'publish_or_verify "@evopilot/cli" "$CANDIDATE_DIR/evopilot-cli-${VERSION}.tgz" approved-v4-adapter-exception');
  const workflows = {
    candidate: fs.readFileSync(".github/workflows/release-candidate.yml", "utf8"),
    release: fs.readFileSync(".github/workflows/release-artifacts.yml", "utf8"),
    npm
  };
  const result = validateReleasePipeline(workflows);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("retain provenance for cli") || failure.includes("exactly two")));
});
