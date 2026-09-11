import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildEvolutionExpertArtifacts } from "../../scripts/build-evolution-expert-release-artifacts.mjs";
import { verifyEvolutionExpertArtifacts } from "../../scripts/verify-evolution-expert-release-artifacts.mjs";

test("Evolution Expert builds and verifies an independent package Candidate set", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-expert-release-"));
  const result = buildEvolutionExpertArtifacts({ outDir, build: false });
  const verification = verifyEvolutionExpertArtifacts({ outDir });

  assert.equal(result.version, "2.0.0");
  assert.equal(result.tag, "evolution-expert-v2.0.0");
  assert.equal(verification.status, "PASS");
  assert.deepEqual(verification.files, [
    "SHA256SUMS",
    "evopilot-evolution-expert-2.0.0-provenance.json",
    "evopilot-evolution-expert-2.0.0-sbom.spdx.json",
    "evopilot-evolution-expert-2.0.0.tgz"
  ]);
});
