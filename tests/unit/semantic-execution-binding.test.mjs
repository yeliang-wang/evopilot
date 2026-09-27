import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import {semanticExecutionFixture} from "../helpers/semantic-execution-fixture.mjs";
import {createSemanticExecutionBindingService} from "../../packages/server/dist/application/semantic-execution-binding.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

test("complete semantic execution record pins independent Runtime and Agent routes without granting execution", async t => {
  const f = await semanticExecutionFixture(t), record = await f.bind();
  assert.equal(record.schema, "evopilot-semantic-execution-binding/v1");
  assert.equal(record.status, "BOUND_PENDING_EXECUTION_INTEGRATION"); assert.equal(record.eligibleForExecution, false);
  assert.equal(record.projectBindingDigest, f.projectRecord.binding.bindingDigest);
  assert.equal(record.harness.bindingDigest, f.plan.binding.digest);
  assert.deepEqual(record.lifecycle, f.plan.binding.lifecycleRef);
  assert.equal(record.llm.model, "synthetic-runtime-model"); assert.equal(record.agentRuntime.model, "synthetic-agent-model");
  assert.equal(record.agentRuntime.qualificationDigest, f.state.qualification.digest);
  assert.equal(record.semantic.harnessClosure.profile.digest, record.harness.profile.digest);
  assert(Object.isFrozen(record.semantic.harnessClosure));
  const {bindingDigest, ...body} = record; assert.equal(bindingDigest, d(body));
  const text = JSON.stringify(record); assert(!text.includes("secret://")); assert(!text.includes("synthetic.invalid"));
  assert.deepEqual(await f.bind(), record);
  const restarted = createSemanticExecutionBindingService(f.configuration, f.owners);
  assert.deepEqual(await restarted.bind(f.identity, f.input), record);
  for (const checkpoint of record.revalidateAt) {
    const result = await restarted.verifyBoundary(f.identity, {...f.input, bindingDigest, checkpoint});
    assert.equal(result.status, "VALIDATED"); assert.equal(result.eligibleForExecution, false);
    assert.equal(result.checkpoint, checkpoint); assert.equal(result.harnessBindingDigest, f.plan.binding.digest);
  }
});
for (const [name, mutate] of [
  ["current goal objective", f => {f.state.goalTarget.objective = "other";}],
  ["lifecycle", f => {f.state.harness.lifecycleDigest = d("other");}],
  ["policy", f => {f.state.harness.policyDigest = d("other");}],
  ["environment", f => {f.state.harness.environmentDigest = d("other");}],
  ["authority", f => {f.state.harness.authorityDigest = d("other");}],
  ["evidence contract", f => {f.state.harness.evidenceDigest = d("other");}],
  ["provider", f => {f.state.harness.providerDigest = d("other");}],
  ["runtime", f => {f.state.harness.runtimeDigest = d("other");}],
  ["Harness Component", f => {f.state.harness.bundles = [{...f.state.harness.bundles[0], componentDigests: [d("other")]}];}],
  ["Host executor", f => {f.state.executor.host = "other";}],
  ["Agent qualification", f => {f.state.qualification.status = "REJECTED";}],
  ["Agent profile", f => {f.state.agentRuntime.model = "other";}],
  ["Runtime LLM model", f => {f.state.llmProfile.modelName = "other";}],
  ["Runtime LLM endpoint", f => {f.state.llmProfile.baseUrl = "https://other.invalid";}],
  ["Runtime LLM disabled", f => {f.state.llmProfile.status = "DISABLED";}],
  ["Runtime LLM scope", f => {f.state.llmProfile.workspaceId = "foreign";}],
  ["private LLM owner", f => {f.state.llmProfile.scope = "user"; f.state.llmProfile.ownerActor = "other";}],
  ["resolver implementation", f => {f.state.resolver.implementationDigest = d("other");}],
  ["resolver limits", f => {f.state.resolver.limitsDigest = d("other");}],
  ["permission effects", f => {f.state.permissions.allowedEffects = [];}],
  ["permission capabilities", f => {f.state.permissions.capabilities = [];}],
  ["permission revision", f => {f.state.permissions.revisionDigest = d("other");}],
  ["principal", f => {f.access.principal.id = "other";}],
  ["project revision", f => {f.access.project.updatedAt = "other";}]
]) test(`execution boundary rejects ${name} drift without rewriting its record`, async t => {
  const f = await semanticExecutionFixture(t), record = await f.bind();
  const directory = path.join(f.configuration.dataRoot, "project-semantic-bindings/executions");
  const file = path.join(directory, (await fs.readdir(directory))[0]), before = await fs.readFile(file, "utf8");
  mutate(f); await assert.rejects(f.verify(record)); assert.equal(await fs.readFile(file, "utf8"), before);
});
test("Catalog permission revocation blocks all four boundary checkpoints", async t => {
  const f = await semanticExecutionFixture(t), record = await f.bind();
  f.policy.catalogs[0].permission = "DENIED"; await f.write("policy.json", f.policy);
  for (const checkpoint of record.revalidateAt) await assert.rejects(f.verify(record, checkpoint), {code: "PERMISSION_DENIED"});
});
test("semantic records cannot cross project/goal/target/scope or use arbitrary digests", async t => {
  const f = await semanticExecutionFixture(t), record = await f.bind();
  for (const key of ["projectId", "goalId", "targetId"]) await assert.rejects(f.execution.verifyBoundary({...f.identity, [key]: "other"}, {...f.input, bindingDigest: record.bindingDigest, checkpoint: "start"}));
  await assert.rejects(f.execution.verifyBoundary(f.identity, {...f.input, bindingDigest: d("other"), checkpoint: "start"}), {code: "DIGEST_MISMATCH"});
  f.access.principal.tenantId = "other"; await assert.rejects(f.verify(record), {code: "PERMISSION_DENIED"});
});
test("owner state mutation during existing-slot lookup fails before persistence", async t => {
  const f = await semanticExecutionFixture(t); let count = 0;
  const service = createSemanticExecutionBindingService(f.configuration, {...f.owners, currentExecution: () => {
    if (++count === 2) f.state.resolver.limitsDigest = d("changed-during-read"); return f.state;
  }});
  await assert.rejects(service.bind(f.identity, f.input), {code: "DRIFT"});
  await assert.rejects(fs.stat(path.join(f.configuration.dataRoot, "project-semantic-bindings/executions")), {code: "ENOENT"});
});
test("owner state mutation across material verification fails before persistence", async t => {
  const f = await semanticExecutionFixture(t); let count = 0;
  const service = createSemanticExecutionBindingService(f.configuration, {...f.owners, currentExecution: () => {
    if (++count === 4) f.state.resolver.limitsDigest = d("changed-during-material-read"); return f.state;
  }});
  await assert.rejects(service.bind(f.identity, f.input), {code: "DRIFT"});
});
test("final owner-state check prevents write after preflight result was returned", async t => {
  const f = await semanticExecutionFixture(t); let count = 0;
  const service = createSemanticExecutionBindingService(f.configuration, {...f.owners, currentExecution: () => {
    if (++count === 5) f.state.resolver.limitsDigest = d("changed-before-commit"); return f.state;
  }});
  await assert.rejects(service.bind(f.identity, f.input), {code: "DRIFT"});
  assert.equal(count, 5);
  await assert.rejects(fs.stat(path.join(f.configuration.dataRoot, "project-semantic-bindings/executions")), {code: "ENOENT"});
});
test("viewers and cancelled operations cannot form execution records", async t => {
  const f = await semanticExecutionFixture(t); f.access.principal.role = "viewer";
  await assert.rejects(f.bind(), {code: "PERMISSION_DENIED"}); f.access.principal.role = "operator";
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.execution.bind(f.identity, {...f.input, signal: controller.signal}), {code: "CANCELLED"});
});
test("rehashing forged stored execution fields does not bypass fresh owner recomputation", async t => {
  const f = await semanticExecutionFixture(t), record = await f.bind();
  const directory = path.join(f.configuration.dataRoot, "project-semantic-bindings/executions");
  const file = path.join(directory, (await fs.readdir(directory))[0]), original = JSON.parse(await fs.readFile(file, "utf8"));
  for (const field of ["projectBindingDigest", "projectReviewDigest", "projectDecisionDigest", "projectRevisionDigest", "environmentDigest", "policyDigest", "providerDigest", "authorityDigest", "runtimeDigest", "evidenceContractDigest", "permissionDigest"]) {
    const document = structuredClone(original); document.value[field] = d("forged");
    delete document.value.bindingDigest; document.value.bindingDigest = d(document.value);
    delete document.recordDigest; document.recordDigest = d(document); await fs.writeFile(file, JSON.stringify(document));
    // An invented project pin fails at the exact historical-record lookup;
    // other forged pins reach, and fail, the fresh owner comparison.
    await assert.rejects(f.execution.verifyBoundary(f.identity, {...f.input, bindingDigest: document.value.bindingDigest, checkpoint: "resume"}),
      {code: field === "projectBindingDigest" ? "UNAVAILABLE" : "DRIFT"});
  }
  await fs.writeFile(file, JSON.stringify(original)); assert.equal((await f.verify(record)).status, "VALIDATED");
});
test("binding replay cannot silently replace changed LLm/resolver pins", async t => {
  const f = await semanticExecutionFixture(t); await f.bind(); f.state.resolver.implementationDigest = d("successor");
  await assert.rejects(f.bind(), {code: "IDENTITY_CONFLICT"});
});
test("no empty qualification, missing credential reference or permissive sandbox", async t => {
  const f = await semanticExecutionFixture(t), before = structuredClone(f.state);
  for (const change of [s => {s.qualification.evidenceRefs = [];}, s => {s.llmProfile.apiKeyRef = "raw-key";}, s => {s.executor.sandbox.permissionMode = "BYPASS";}]) {
    Object.assign(f.state, structuredClone(before)); change(f.state); await assert.rejects(f.bind());
  }
});
