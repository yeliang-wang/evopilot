import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateEvolutionExpertRelease } from "../../scripts/verify-release-pipeline.mjs";

test("Evolution Expert release jobs enforce the independent Expert version key", () => {
  const workflow = fs.readFileSync(".github/workflows/evolution-expert-release.yml", "utf8");
  const result = validateEvolutionExpertRelease(workflow);

  assert.equal(result.status, "PASS", JSON.stringify(result.failures));
  assert.equal(workflow.match(/target\.release\?\.versions\?\.\["evopilot-evolution-expert"\]/g)?.length, 2);
  assert.doesNotMatch(workflow, /target\.release\?\.versions\?\.evopilot/);
});
