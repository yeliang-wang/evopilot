import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import {semanticExecutionFixture} from "../helpers/semantic-execution-fixture.mjs";
import {seedSemanticRuntimeRecords} from "../helpers/semantic-runtime-records.mjs";
import {createOpenCodeRuntimeProfile, createOpenCodeExecutorAdapter} from "../../packages/adapter-opencode/dist/index.js";
import {createSemanticOutcomeReviewService} from "../../packages/server/dist/application/semantic-outcome-review.js";
import {createSemanticExecutionTransport} from "../../packages/server/dist/application/semantic-execution-transport.js";
import {SemanticBindingStore} from "../../packages/server/dist/storage/semantic-binding-store.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

async function fixture(t, options = {}) {
  const profile = createOpenCodeRuntimeProfile({runtimeVersion: "synthetic-1", host: "synthetic-host", provider: "synthetic", model: "test",
    capabilities: ["goal-loop.execute"], workspaceRoot: "/private/tmp/synthetic-review-workspace"});
  const f = await semanticExecutionFixture(t, {pending: true, adapterProfile: profile});
  const {source, store: runtimeStore} = seedSemanticRuntimeRecords(f, options.criteria ?? ["Synthetic units are in range", "Synthetic artifact is present"]);
  const p = f.run.pendingExecution;
  const plan = {schema: "evopilot-semantic-outcome-plan/v1", goalTargetDigest: f.plan.binding.goalTargetDigest,
    artifactSetDigest: f.projectRecord.binding.pins.artifactSetDigest, bundleDigest: f.plan.binding.bundleRef.digest,
    lifecycleDigest: p.lifecycle.digest, stageId: p.stageId, action: p.action, actionVersion: p.actionVersion,
    business: [{id: "units", conceptId: "fixture:entity", evidenceKind: "local-checks", path: ["units"], predicate: {op: "NUMBER_RANGE", minimum: 1, maximum: 10}},
      {id: "artifact", conceptId: "fixture:entity", evidenceKind: "local-checks", path: ["present"], predicate: {op: "EQUALS", value: true}}],
    harness: [{id: "exit", evidenceKind: "local-checks", path: ["exitCodes"], predicate: {op: "ALL_ZERO"}, obligation: {kind: "validator", value: "validation-exit-code"}}]};
  f.state.outcomePlan = {...plan, planDigest: d(plan)};
  const bound = await f.bind(), input = {identity: f.identity, bindingDigest: bound.bindingDigest, runId: f.run.id, requestDigest: p.requestDigest,
    currentAccess: f.input.currentAccess, selection: {schema: "evopilot-semantic-context-selection/v1", reasoning: "EXPLICIT_ONLY", conceptIds: ["fixture:entity"], relations: []}};
  const coverage = source.acceptanceCriteria.map((c, i) => ({criterionDigest: c.criterionDigest, ruleIds: [plan.business[i % 2].id]}));
  let calls = 0;
  const adapter = createOpenCodeExecutorAdapter({profile, runner: async () => {calls++; return {exitCode: 0, signal: null, termination: "EXITED", stdout: '{"type":"step_finish"}', stderr: ""};}});
  const owners = {...f.owners, adapter}, service = createSemanticOutcomeReviewService(f.configuration, owners);
  const records = new SemanticBindingStore(f.configuration.dataRoot), key = {scope: f.scope, runId: input.runId, sourceRequestDigest: input.requestDigest, executionBindingDigest: input.bindingDigest};
  const goalFile = path.join(runtimeStore.goalsDir, f.identity.goalId + ".json");
  const changeGoal = async fn => {const goal = JSON.parse(await fs.readFile(goalFile)); fn(goal); await fs.writeFile(goalFile, JSON.stringify(goal));};
  const prepare = () => service.prepare({...input, coverage}), approve = review => service.approve({...input, reviewDigest: review.reviewDigest});
  const dispatch = () => createSemanticExecutionTransport(f.configuration, owners).execute(input);
  return {...f, input, source, bound, owners, service, coverage, records, key, prepare, approve, dispatch, changeGoal, goalFile, calls: () => calls};
}
test("exact persisted criteria/rules/coverage are separately reviewed before dispatch; restart revalidates", async t => {
  const f = await fixture(t), before = await fs.readFile(f.goalFile, "utf8"), review = await f.prepare();
  assert.deepEqual(review.criteria, f.source.acceptanceCriteria); assert.deepEqual(review.outcomePlan, f.state.outcomePlan);
  assert.equal(review.authority.mayCompleteGoal, false); assert.equal(review.authority.mayAttestEvidence, false);
  await assert.rejects(f.dispatch(), {code: "UNAVAILABLE"}); assert.equal(f.calls(), 0);
  const decision = await f.approve(review); assert.equal(decision.reviewDigest, review.reviewDigest);
  assert.deepEqual(await f.approve(review), decision);
  const restarted = createSemanticOutcomeReviewService(f.configuration, f.owners);
  assert.equal((await restarted.inspect(f.input)).decision.decisionDigest, decision.decisionDigest);
  await f.dispatch(); await f.dispatch(); assert.equal(f.calls(), 1);
  assert.equal(await fs.readFile(f.goalFile, "utf8"), before);
  await assert.rejects(f.prepare(), {code: "PERMISSION_DENIED"});
  assert.deepEqual(await f.approve(review), decision);
});
test("mapping reads bound inputs without selecting coverage, decisions or dispatch", async t => {
  const f = await fixture(t), before = await fs.readFile(f.goalFile, "utf8"), mapping = await f.service.mapping(f.input);
  assert.equal(mapping.status, "COVERAGE_INPUT_REQUIRED"); assert.equal(mapping.businessField, null); assert.equal(mapping.productType, null);
  assert.deepEqual(mapping.criteria, f.source.acceptanceCriteria); assert.deepEqual(mapping.outcomePlan, f.state.outcomePlan);
  assert.deepEqual(mapping.coverageInputs, mapping.criteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: []})));
  assert(mapping.concepts.some(c => c.conceptId === "fixture:entity")); assert(Object.values(mapping.authority).every(v => v === false));
  const {mappingDigest, ...body} = mapping; assert.equal(mappingDigest, d(body)); assert(Object.isFrozen(mapping.coverageInputs));
  assert.deepEqual(await createSemanticOutcomeReviewService(f.configuration, f.owners).mapping(f.input), mapping);
  assert.equal(f.records.read("outcome-decisions", f.key), undefined); assert.equal(f.calls(), 0);
  await assert.rejects(f.service.prepare({...f.input, coverage: mapping.coverageInputs}), {code: "INVALID"});
  await assert.rejects(f.dispatch(), {code: "UNAVAILABLE"}); assert.equal(await fs.readFile(f.goalFile, "utf8"), before);
});
test("mapping refuses stale criteria, revoked access and cancellation", async t => {
  const f = await fixture(t), abort = new AbortController(); abort.abort();
  await assert.rejects(f.service.mapping({...f.input, signal: abort.signal}), {code: "CANCELLED"});
  f.access.principal.role = "viewer"; await assert.rejects(f.service.mapping(f.input), {code: "PERMISSION_DENIED"});
  f.access.principal.role = "operator"; await f.changeGoal(g => {g.plan.targets[0].acceptanceCriteria[0] = "changed";});
  await assert.rejects(f.service.mapping(f.input)); assert.equal(f.calls(), 0);
});
test("mapping rechecks principal during asynchronous source reads", async t => {
  const f = await fixture(t); let reads = 0;
  await assert.rejects(f.service.mapping({...f.input, currentAccess: () => {
    if (++reads === 3) f.access.principal.role = "viewer"; return f.access;
  }}), {code: "PERMISSION_DENIED"}); assert.equal(f.calls(), 0);
});
test("unprepared digest cannot become an approval", async t => {
  const f = await fixture(t); await assert.rejects(f.service.approve({...f.input, reviewDigest: d("invented")}), {code: "UNAVAILABLE"});
  assert.equal(f.records.read("outcome-decisions", f.key), undefined);
});
for (const [name, mutate] of [
  ["missing criterion", x => x.pop()], ["invented criterion", x => {x[0].criterionDigest = d("foreign");}],
  ["duplicate criterion", x => {x[1] = x[0];}], ["unknown rule", x => {x[0].ruleIds = ["foreign"]; }],
  ["Harness rule cannot cover business criterion", x => {x[0].ruleIds = ["exit"]; }],
  ["orphan business rule", x => {x[1].ruleIds = ["units"]; }], ["empty mapping", x => {x[0].ruleIds = []; }],
  ["duplicate rule", x => {x[0].ruleIds.push(x[0].ruleIds[0]); }], ["null entry", x => {x[0] = null;}],
  ["approval injected in mapping", x => {x[0].approved = true;}]
]) test(`review refuses ${name}`, async t => {
  const f = await fixture(t); mutate(f.coverage); await assert.rejects(f.prepare(), {code: "INVALID"});
  assert.equal(f.records.read("outcome-decisions", f.key), undefined); assert.equal(f.calls(), 0);
});
for (const [name, criteria] of [["empty", []], ["blank", [" "]], ["oversized criterion", ["x".repeat(8193)]], ["too many", Array(65).fill("synthetic")]])
  test(`unreviewable ${name} criteria fail closed`, async t => {
    const f = await fixture(t, {criteria}); await assert.rejects(f.prepare(), {code: "MATERIAL_LIMIT"});
  });
for (const [name, change] of [
  ["criterion", goal => {goal.plan.targets[0].acceptanceCriteria[0] = "changed";}],
  ["added criterion", goal => {goal.plan.targets[0].acceptanceCriteria.push("new");}],
  ["Target scope", goal => {goal.plan.targets[0].projectId = "other";}],
  ["plan approval", goal => {goal.plan.status = "PENDING_APPROVAL";}],
  ["Target completed", goal => {goal.plan.targets[0].status = "DONE";}],
  ["Goal cancelled", goal => {goal.status = "CANCELLED";}]
]) test(`current ${name} invalidates prepared and approved review`, async t => {
  const f = await fixture(t), review = await f.prepare(); await f.approve(review); await f.changeGoal(change);
  await assert.rejects(f.service.inspect(f.input)); await assert.rejects(f.dispatch()); assert.equal(f.calls(), 0);
});
test("review order is canonical but meaning changes cannot replace an approved mapping", async t => {
  const f = await fixture(t), review = await f.prepare(); await f.approve(review);
  f.coverage.reverse(); assert.deepEqual(await f.prepare(), review);
  f.coverage.forEach(c => {c.ruleIds = ["units", "artifact"];}); const other = await f.prepare(); assert.notEqual(other.reviewDigest, review.reviewDigest);
  await assert.rejects(f.approve(other), {code: "IDENTITY_CONFLICT"});
});
test("lost current access blocks review and cached dispatch without granting implicit approval", async t => {
  const f = await fixture(t), review = await f.prepare(); await f.approve(review); await f.dispatch(); f.access.principal.role = "viewer";
  await assert.rejects(f.service.inspect(f.input), {code: "PERMISSION_DENIED"}); await assert.rejects(f.approve(review), {code: "PERMISSION_DENIED"});
  await assert.rejects(f.dispatch(), {code: "PERMISSION_DENIED"}); assert.equal(f.calls(), 1);
});
test("input cancellation leaves no approval", async t => {
  const f = await fixture(t), review = await f.prepare(), abort = new AbortController(); abort.abort();
  await assert.rejects(f.service.approve({...f.input, reviewDigest: review.reviewDigest, signal: abort.signal}), {code: "CANCELLED"});
  assert.equal(f.records.read("outcome-decisions", f.key), undefined);
});
test("revoked permission during asynchronous review cannot be persisted", async t => {
  const f = await fixture(t); let reads = 0;
  const currentAccess = () => {if (++reads === 3) f.access.principal.role = "viewer"; return f.access;};
  await assert.rejects(f.service.prepare({...f.input, currentAccess, coverage: f.coverage}), {code: "PERMISSION_DENIED"});
  assert.equal(f.records.read("outcome-decisions", f.key), undefined);
});
test("stored decision body tampering is detected even with rehashed storage envelope", async t => {
  const f = await fixture(t), review = await f.prepare(); await f.approve(review);
  const file = path.join(f.configuration.dataRoot, "project-semantic-bindings/outcome-decisions", d(f.key).slice(7) + ".json");
  const record = JSON.parse(await fs.readFile(file)); record.value.reviewDigest = d("foreign");
  const {recordDigest, ...body} = record; await fs.writeFile(file, JSON.stringify({...body, recordDigest: d(body)}));
  await assert.rejects(f.service.inspect(f.input)); await assert.rejects(f.dispatch()); assert.equal(f.calls(), 0);
});
test("prior ambiguous dispatch claim forbids post-hoc approval", async t => {
  const f = await fixture(t), review = await f.prepare();
  f.records.put("dispatch-claims", {scope: f.scope, runId: f.input.runId, sourceRequestDigest: f.input.requestDigest}, {schema: "synthetic-ambiguous-claim"});
  await assert.rejects(f.approve(review), {code: "PERMISSION_DENIED"}); assert.equal(f.calls(), 0);
});
