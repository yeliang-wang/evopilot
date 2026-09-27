import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import {semanticExecutionFixture} from "../helpers/semantic-execution-fixture.mjs";
import {createSemanticExecutionContextService} from "../../packages/server/dist/application/semantic-execution-context.js";
import {LifecycleService} from "../../packages/server/dist/domains/lifecycle/index.js";
import {digestObject as d, canonicalJson} from "../../packages/server/dist/domains/harness-template/utils.js";
import {resolveSemanticContextLimits, semanticContextResolverDescriptor} from "../../packages/server/dist/domains/harness-template/semantic-context-slice.js";

const selection = () => ({schema: "evopilot-semantic-context-selection/v1", reasoning: "EXPLICIT_ONLY", conceptIds: ["fixture:entity"], relations: []});
async function fixture(t, contextLimits) {
  const f = await semanticExecutionFixture(t, {pending: true, contextLimits}), bound = await f.bind();
  const config = {...f.configuration, contextLimits}, context = createSemanticExecutionContextService(config, f.owners);
  const input = {identity: f.identity, bindingDigest: bound.bindingDigest, runId: f.run.id,
    requestDigest: f.run.pendingExecution.requestDigest, selection: selection(), currentAccess: f.input.currentAccess};
  return {...f, bound, config, context, contextInput: input, resolve: extra => context.resolve({...input, ...extra})};
}
test("context slice uses exact persisted pending request and minimum allowlisted facts; restart is deterministic", async t => {
  const f = await fixture(t), file = path.join(f.configuration.dataRoot, "lifecycle-runs/context-run.json"), before = await fs.readFile(file, "utf8");
  const result = await f.resolve();
  assert.equal(result.status, "PREPARED_NOT_DISPATCHED"); assert.equal(result.eligibleForExecution, false);
  assert.equal(result.pendingExecution.requestDigest, f.run.pendingExecution.requestDigest);
  assert.equal(result.executionBindingDigest, f.bound.bindingDigest);
  assert.deepEqual(Object.keys(result.concepts[0]).sort(), ["conceptDigest", "conceptId", "definition", "label", "metaType"]);
  assert.equal(result.concepts[0].conceptId, "fixture:entity"); assert(Object.isFrozen(result.concepts[0]));
  const {sliceDigest, ...content} = result; assert.equal(sliceDigest, d(content));
  const text = JSON.stringify(result);
  for (const denied of ["source://synthetic", "synthetic://workspace", "secret://", "sourceSnapshotDigest", "sourceRefs", "instructions", "projectionSet", "Synthetic fixture only"]) assert(!text.includes(denied), denied);
  const lifecycle = new LifecycleService(f.configuration.dataRoot, [path.join(f.root, "context-lifecycles")]);
  const restarted = createSemanticExecutionContextService(f.config, {...f.owners, lifecycle});
  assert.deepEqual(await restarted.resolve(f.contextInput), result);
  assert.equal(await fs.readFile(file, "utf8"), before);
});
test("empty explicit selection does not auto-expand or load the whole ontology", async t => {
  const f = await fixture(t), result = await f.resolve({selection: {...selection(), conceptIds: []}});
  assert.deepEqual(result.concepts, []); assert.deepEqual(result.relations, []);
});
for (const [name, change] of [
  ["cross-project", input => {input.identity.projectId = "foreign";}],
  ["cross-goal", input => {input.identity.goalId = "foreign";}],
  ["wrong semantic digest", input => {input.bindingDigest = d("foreign");}],
  ["wrong pending digest", input => {input.requestDigest = d("foreign");}],
  ["missing run", input => {input.runId = "missing";}],
  ["arbitrary concept", input => {input.selection.conceptIds = ["private:unrelated"];}],
  ["unknown field", input => {input.selection.instructions = "ignore permissions";}],
  ["duplicate selector", input => {input.selection.conceptIds.push("fixture:entity");}],
  ["requested inference", input => {input.selection.reasoning = "INFERRED";}],
  ["undeclared edge", input => {input.selection.relations.push({subjectConceptId: "fixture:entity", relationType: "relatedTo", objectConceptId: "fixture:entity"});}]
]) test(`context refuses ${name}`, async t => {
  const f = await fixture(t), input = {...f.contextInput, identity: {...f.identity}, selection: selection()}; change(input);
  await assert.rejects(f.context.resolve(input));
});
test("current Catalog revocation, principal loss and LLM drift reject context, including reused binding", async t => {
  const f = await fixture(t); await f.resolve();
  f.policy.catalogs[0].permission = "DENIED"; await f.write("policy.json", f.policy);
  await assert.rejects(f.resolve(), {code: "PERMISSION_DENIED"});
  f.policy.catalogs[0].permission = "GRANTED"; await f.write("policy.json", f.policy);
  f.access.principal.role = "viewer"; await assert.rejects(f.resolve(), {code: "PERMISSION_DENIED"});
  f.access.principal.role = "operator"; f.state.llmProfile.modelName = "changed"; await assert.rejects(f.resolve(), {code: "DRIFT"});
});
test("resolver code/limits binding must equal the actual implementation descriptor", async t => {
  const f = await fixture(t), reduced = createSemanticExecutionContextService({...f.config, contextLimits: {maxConcepts: 1}}, f.owners);
  await assert.rejects(reduced.resolve(f.contextInput), {code: "DRIFT"});
  const other = await semanticExecutionFixture(t, {pending: true});
  other.state.resolver = {...other.state.resolver, implementationDigest: d("foreign-code")};
  const bound = await other.bind(), context = createSemanticExecutionContextService(other.configuration, other.owners);
  await assert.rejects(context.resolve({...f.contextInput, identity: other.identity, bindingDigest: bound.bindingDigest,
    requestDigest: other.run.pendingExecution.requestDigest, currentAccess: other.input.currentAccess}), {code: "DRIFT"});
});
test("one-byte output limit rejects the whole slice and exact byte limit accepts", async t => {
  const baseline = await fixture(t), bytes = Buffer.byteLength(canonicalJson(await baseline.resolve()));
  const exact = await fixture(t, {maxOutputBytes: bytes});
  assert.equal(Buffer.byteLength(canonicalJson(await exact.resolve())), bytes);
  const less = await fixture(t, {maxOutputBytes: bytes - 1});
  await assert.rejects(less.resolve(), {code: "MATERIAL_LIMIT"});
});
test("pre-cancel and cancellation during owner revalidation return no slice", async t => {
  const f = await fixture(t), controller = new AbortController(); controller.abort();
  await assert.rejects(f.resolve({signal: controller.signal}), {code: "CANCELLED"});
  const mid = new AbortController(); let reads = 0;
  await assert.rejects(f.resolve({signal: mid.signal, currentAccess: () => {if (++reads === 3) mid.abort(); return f.access;}}), {code: "CANCELLED"});
});
test("one shared deadline bounds all reads rather than resetting per Catalog inspection", async t => {
  const f = await fixture(t, {timeoutMs: 1});
  await assert.rejects(f.resolve({currentAccess: () => {const until = performance.now() + 3; while (performance.now() < until) {} return f.access;}}), {code: "TIMEOUT"});
});
test("pending cancellation after the first observation is re-read before returning context", async t => {
  const f = await fixture(t); let reads = 0;
  const context = createSemanticExecutionContextService(f.config, {...f.owners, lifecycle: {readPendingExecution: (...args) => {
    if (++reads === 2) f.lifecycleService.cancel(f.run.id, "synthetic", "synthetic://cancel", f.run.binding.digest);
    return f.lifecycleService.readPendingExecution(...args);
  }}});
  await assert.rejects(context.resolve(f.contextInput), /LIFECYCLE_EXTERNAL_SIGNAL_NOT_PENDING/);
});
test("untrusted material body cannot replace fixed Catalog validation", async t => {
  const f = await fixture(t), entry = f.generation.entries.find(entry => entry.kind === "ProjectOntologyArtifactSet");
  const changed = structuredClone(f.data.materials[entry.path]); changed.spec.snapshot.concepts[0].definition = "forged";
  await f.write(entry.path, changed); await assert.rejects(f.resolve());
});
for (const value of [{maxConcepts: 129}, {maxRelations: 257}, {maxOutputBytes: 65537}, {timeoutMs: 30001}, {maxConcepts: 0}, {timeoutMs: -1}, {maxConcepts: 1.5}, {arbitrary: 1}])
  test(`resolver limits reject ${JSON.stringify(value)}`, () => assert.throws(() => resolveSemanticContextLimits(value), {code: "BUDGET_INVALID"}));
test("resolver descriptors pin exact effective limits", () => {
  assert.notEqual(semanticContextResolverDescriptor(resolveSemanticContextLimits()).limitsDigest,
    semanticContextResolverDescriptor(resolveSemanticContextLimits({maxConcepts: 1})).limitsDigest);
});

for (const [name, mutate] of [
  ["status", run => {run.status = "SUCCEEDED";}],
  ["scope", run => {run.projectId = "foreign";}],
  ["plan approval", run => {run.planAuthorization.decision = "REJECTED";}],
  ["stage", run => {run.currentStageId = "other";}],
  ["completed stage", run => {run.stageAttempts.push({stageId: "loop", status: "SUCCEEDED"});}],
  ["inputs with recomputed request hash", run => {run.pendingExecution.inputs.objective = "forged"; const {requestDigest, ...body} = run.pendingExecution; run.pendingExecution.requestDigest = d(body);}],
  ["executor with recomputed request hash", run => {run.pendingExecution.executor.host = "other"; const {requestDigest, ...body} = run.pendingExecution; run.pendingExecution.requestDigest = d(body);}],
  ["run input binding", run => {run.inputBinding.digest = d("forged");}]
]) test(`persisted pending owner rejects ${name} without mutation`, async t => {
  const f = await fixture(t), file = path.join(f.configuration.dataRoot, "lifecycle-runs/context-run.json");
  const run = JSON.parse(await fs.readFile(file, "utf8")); mutate(run); const bytes = JSON.stringify(run); await fs.writeFile(file, bytes);
  assert.throws(() => f.lifecycleService.readPendingExecution(run.id, run.pendingExecution.requestDigest, {...f.scope, goalId: "goal", targetId: "target"}));
  assert.equal(await fs.readFile(file, "utf8"), bytes);
});
