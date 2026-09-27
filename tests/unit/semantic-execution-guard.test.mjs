import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {LifecycleService} from "../../packages/server/dist/domains/lifecycle/index.js";
import {assertNoUnintegratedSemanticExecution} from "../../packages/server/dist/domains/lifecycle/semantic-execution-guard.js";

for (const key of ["semanticExecutionBindingDigest", "semanticExecutionBinding", "semanticContextSlice", "semanticContext", "outcomePlan", "semanticOutcomePlan"]) test(`explicit ${key} cannot silently degrade to legacy execution`, () => {
  for (const value of [null, false, "", undefined, {}, "sha256:" + "a".repeat(64)]) assert.throws(() => assertNoUnintegratedSemanticExecution({[key]: value}), /SEMANTIC_EXECUTION_INTEGRATION_REQUIRED/);
});
test("unrelated legacy request fields remain permitted", () => {
  for (const value of [{}, undefined, {harnessExecutionBindingDigest: "sha256:" + "a".repeat(64)}, {answers: {domain: "semantic"}}]) assert.doesNotThrow(() => assertNoUnintegratedSemanticExecution(value));
});
test("Lifecycle entry rejects explicit semantic binding before writing or resolving a legacy lifecycle", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-guard-")); t.after(() => fs.rm(root, {recursive: true, force: true}));
  const service = new LifecycleService(root, []);
  assert.throws(() => service.start({semanticExecutionBindingDigest: "sha256:" + "a".repeat(64)}), /SEMANTIC_EXECUTION_INTEGRATION_REQUIRED/);
  assert.throws(() => service.finalizeBinding("absent", {semanticExecutionBindingDigest: "sha256:" + "a".repeat(64)}), /SEMANTIC_EXECUTION_INTEGRATION_REQUIRED/);
  assert.deepEqual(await fs.readdir(path.join(root, "lifecycle-runs")), []);
});
for (const location of ["run", "binding", "pendingExecution", "governance"]) test(`restored unsupported semantic ${location} cannot resume, answer, authorize or accept external success`, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-restored-guard-")); t.after(() => fs.rm(root, {recursive: true, force: true}));
  const service = new LifecycleService(root, []), run = {schema: "evopilot-lifecycle-run/v1alpha1", id: "synthetic", binding: {}, pendingExecution: {governance: {}}};
  const target = location === "run" ? run : location === "governance" ? run.pendingExecution.governance : run[location];
  target.semanticExecutionBindingDigest = "sha256:" + "a".repeat(64);
  const file = path.join(root, "lifecycle-runs/synthetic.json"), bytes = JSON.stringify(run); await fs.writeFile(file, bytes);
  for (const action of [() => service.advance("synthetic"), () => service.advanceUntilBoundary("synthetic"),
    () => service.authorizePlan("synthetic", "APPROVED", "synthetic", "synthetic", "unused"),
    () => service.recordExternalResult("synthetic", {status: "SUCCEEDED"}), () => service.answer("synthetic", {}),
    () => service.finalizeBinding("synthetic", {})]) assert.throws(action, /SEMANTIC_EXECUTION_INTEGRATION_REQUIRED/);
  assert.equal(await fs.readFile(file, "utf8"), bytes);
});
