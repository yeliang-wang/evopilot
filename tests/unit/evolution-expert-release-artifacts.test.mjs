import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildEvolutionExpertArtifacts } from "../../scripts/build-evolution-expert-release-artifacts.mjs";
import { verifyEvolutionExpertArtifacts } from "../../scripts/verify-evolution-expert-release-artifacts.mjs";

test("Evolution Expert builds and verifies a local release-set unit fixture (not a governed Candidate)", (t) => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-expert-release-"));
  t.after(() => fs.rmSync(outDir, { recursive: true, force: true }));
  const result = buildEvolutionExpertArtifacts({ outDir, build: false });
  const verification = verifyEvolutionExpertArtifacts({ outDir });

  assert.equal(result.version, "2.2.1");
  assert.equal(result.tag, "evolution-expert-v2.2.1");
  assert.equal(verification.status, "PASS");
  assert.deepEqual(verification.files, [
    "SHA256SUMS",
    "evopilot-evolution-expert-2.2.1-provenance.json",
    "evopilot-evolution-expert-2.2.1-sbom.spdx.json",
    "evopilot-evolution-expert-2.2.1.tgz"
  ]);
  const checksums = fs.readFileSync(path.join(outDir, "SHA256SUMS"), "utf8");
  fs.writeFileSync(path.join(outDir, "SHA256SUMS"), `${Array(3).fill(checksums.trim().split("\n")[0]).join("\n")}\n`);
  assert.throws(() => verifyEvolutionExpertArtifacts({ outDir }), /exactly once/);
});
