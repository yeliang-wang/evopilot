import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateEvolutionExpertRelease } from "../../scripts/verify-release-pipeline.mjs";
import { verifyExpertReleaseVersion } from "../../scripts/expert-release-version.cjs";

test("Evolution Expert release jobs enforce the independent Expert version key", () => {
  const workflow = fs.readFileSync(".github/workflows/evolution-expert-release.yml", "utf8");
  const result = validateEvolutionExpertRelease(workflow);

  assert.equal(result.status, "PASS", JSON.stringify(result.failures));
  assert.equal(workflow.match(/verifyExpertReleaseVersion\(target, version\)/g)?.length, 2);
  assert.doesNotMatch(workflow, /target\.release\?\.versions\?\.evopilot/);
});

test("Expert release version accepts canonical and historical keys but never Runtime authority", () => {
  const target = JSON.parse(fs.readFileSync("governance/targets/evopilot-evolution-expert-v2.2.1-public-cli-completion-recovery.json"));
  assert.equal(verifyExpertReleaseVersion(target, "2.2.1"), "2.2.1");
  const historical = structuredClone(target);
  historical.release.versions = { "evopilot-evolution-expert": "2.2.1" };
  assert.equal(verifyExpertReleaseVersion(historical, "2.2.1"), "2.2.1");
  assert.throws(() => verifyExpertReleaseVersion(target, "6.2.0"));
  for (const mutate of [t => { t.release.product = "evopilot"; }, t => { t.roadmapBindings[0].releaseProduct = "evopilot"; }, t => { t.release.versions["evopilot-evolution-expert"] = "6.2.0"; }]) {
    const invalid = structuredClone(target);
    mutate(invalid);
    assert.throws(() => verifyExpertReleaseVersion(invalid, "2.2.1"));
  }
});
