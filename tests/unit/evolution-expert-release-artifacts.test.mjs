import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inventory } from "../../packages/evolution-expert/host-integration/inventory.mjs";

test("Evolution Expert builds and verifies a local release-set unit fixture (not a governed Candidate)", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-expert-release-unit-"));
  const outDir = path.join(root, "unit-output");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Exercise packaging in an isolated workspace, never materialize a release build
  // or native-input manifest in the product checkout during ordinary source tests.
  const source = path.resolve("packages/evolution-expert"), target = path.join(root, "packages/evolution-expert");
  fs.mkdirSync(target, { recursive: true });
  for (const item of ["package.json", "dist", "generated", "host-adapter-kit", "host-integration", "skill", "CHANGELOG.md", "README.md"]) {
    fs.cpSync(path.join(source, item), path.join(target, item), { recursive: true });
  }
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ private: true, workspaces: ["packages/evolution-expert"] }));
  fs.mkdirSync(path.join(root, "scripts"));
  for (const item of ["build-evolution-expert-release-artifacts.mjs", "verify-evolution-expert-release-artifacts.mjs"]) fs.copyFileSync(path.resolve("scripts", item), path.join(root, "scripts", item));
  const integration = path.join(target, "host-integration"), nativeDir = path.join(integration, "dist/darwin-arm64");
  fs.mkdirSync(nativeDir, { recursive: true });
  fs.writeFileSync(path.join(nativeDir, "secure-input"), "UNIT_TEST_ONLY_NONEXECUTABLE_NATIVE_FIXTURE\n");
  fs.writeFileSync(path.join(integration, "manifest.json"), JSON.stringify({ schema: "evopilot-expert-host-integration/v1", expertVersion: "2.3.0", runtimeVersion: "6.3.0", platforms: ["darwin-arm64"], files: inventory(integration) }));
  const { buildEvolutionExpertArtifacts } = await import(pathToFileURL(path.join(root, "scripts/build-evolution-expert-release-artifacts.mjs")));
  const { verifyEvolutionExpertArtifacts } = await import(pathToFileURL(path.join(root, "scripts/verify-evolution-expert-release-artifacts.mjs")));
  const result = buildEvolutionExpertArtifacts({ outDir, build: false });
  const verification = verifyEvolutionExpertArtifacts({ outDir });

  assert.equal(result.version, "2.3.0");
  assert.equal(result.tag, "evolution-expert-v2.3.0");
  assert.equal(verification.status, "PASS");
  assert.deepEqual(verification.files, [
    "SHA256SUMS",
    "evopilot-evolution-expert-2.3.0-provenance.json",
    "evopilot-evolution-expert-2.3.0-sbom.spdx.json",
    "evopilot-evolution-expert-2.3.0.tgz"
  ]);
  const checksums = fs.readFileSync(path.join(outDir, "SHA256SUMS"), "utf8");
  fs.writeFileSync(path.join(outDir, "SHA256SUMS"), `${Array(3).fill(checksums.trim().split("\n")[0]).join("\n")}\n`);
  assert.throws(() => verifyEvolutionExpertArtifacts({ outDir }), /exactly once/);
});
