import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildSuiteCapabilityInventory } from "../../scripts/build-suite-capability-inventory.mjs";
import { buildCrossAcceptanceMap } from "../../scripts/build-v51-cross-acceptance-map.mjs";

const runtime = JSON.parse(fs.readFileSync("governance/targets/evopilot-v5.1.0-suite-capability-convergence.json", "utf8"));
const expert = JSON.parse(fs.readFileSync("governance/targets/evopilot-evolution-expert-v1.1.0-unified-host-entry.json", "utf8"));

test("exact latest Suite inventory is complete and keeps immutable source identities", () => {
  const inventory = buildSuiteCapabilityInventory({ write: false });
  assert.equal(inventory.coverage.percent, 100);
  assert.equal(inventory.coverage.unmapped.length, 0);
  assert.equal(inventory.sources.find((item) => item.suiteId === "datarig-codex-suite").sourceVersion, "2.1.5");
  assert.equal(inventory.sources.find((item) => item.suiteId === "evopilot-codex-suite").sourceVersion, "3.2.1");
  assert.equal(inventory.hiddenFallbackAllowed, false);
});

test("cross acceptance map covers every new Runtime and Expert criterion and E2E", () => {
  const map = buildCrossAcceptanceMap({ write: false });
  const runtimeAcceptance = new Set(map.rows.flatMap((row) => row.runtimeAcceptanceIds));
  const expertAcceptance = new Set(map.rows.flatMap((row) => row.expertAcceptanceIds));
  const runtimeE2E = new Set(map.rows.flatMap((row) => row.runtimeE2EIds));
  const expertE2E = new Set(map.rows.flatMap((row) => row.expertE2EIds));
  assert.deepEqual([...runtimeAcceptance].sort(), runtime.acceptance.map((item) => item.id).sort());
  assert.deepEqual([...expertAcceptance].sort(), expert.acceptance.map((item) => item.id).sort());
  assert.deepEqual([...runtimeE2E].sort(), runtime.realCaseCoverage.map((item) => item.id).sort());
  assert.deepEqual([...expertE2E].sort(), expert.realCaseCoverage.map((item) => item.id).sort());
  assert.equal(map.bindings.runtime.authorizationDigest, "sha256:a6a7e8bceb264f9b8bef8875631ee53df6922d829ea872e316ad188b5bd1a1fe");
  assert.equal(map.bindings.expert.authorizationDigest, "sha256:983881153c0be7bb96d80cb9a468e2f01a10f808f63ab05db8ca20384e04e375");
});
