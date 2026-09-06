import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ACTIVE_GA_SOAK_WORKLOAD,
  resolveActiveGaSoakWorkload
} from "../../scripts/run-active-ga-soak.mjs";

test("active GA soak keeps the production release matrix as its default", () => {
  assert.equal(DEFAULT_ACTIVE_GA_SOAK_WORKLOAD, "node scripts/release-matrix-project-loop.mjs");
  assert.equal(resolveActiveGaSoakWorkload({}), DEFAULT_ACTIVE_GA_SOAK_WORKLOAD);
});

test("active GA soak accepts an explicit isolated acceptance workload", () => {
  assert.equal(
    resolveActiveGaSoakWorkload({ EVOPILOT_GA_SOAK_WORKLOAD_COMMAND: "  node /isolated/workload.mjs  " }),
    "node /isolated/workload.mjs"
  );
});
