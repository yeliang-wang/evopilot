import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {semanticExecutionFixture} from "../helpers/semantic-execution-fixture.mjs";
import {createOpenCodeRuntimeProfile, createOpenCodeExecutorAdapter} from "../../packages/adapter-opencode/dist/index.js";
import {createSemanticExecutionTransport} from "../../packages/server/dist/application/semantic-execution-transport.js";
import {createSemanticExecutionOutcomeService} from "../../packages/server/dist/application/semantic-execution-outcome.js";
import {normalizeSemanticOutcomePlan, evaluateSemanticOutcomeRules} from "../../packages/server/dist/domains/harness-template/semantic-outcome-plan.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";
import {seedSemanticRuntimeRecords} from "../helpers/semantic-runtime-records.mjs";
import {createSemanticOutcomeReviewService} from "../../packages/server/dist/application/semantic-outcome-review.js";

const rehash = plan => {const {planDigest, ...body} = plan; plan.planDigest = d(body); return plan;};
async function fixture(t, options = {}) {
  const profile = createOpenCodeRuntimeProfile({runtimeVersion: "synthetic-1", host: "synthetic-host", provider: "synthetic", model: "test",
    capabilities: ["goal-loop.execute"], workspaceRoot: "/private/tmp/synthetic-outcome-workspace"});
  const f = await semanticExecutionFixture(t, {pending: true, adapterProfile: profile, lifecycleObligations: options.lifecycleObligations});
  const materials = Object.values(f.data.materials), bundle = materials.find(m => m.kind === "HarnessBundle"), p = materials.find(m => m.kind === "HarnessProfile"), components = materials.filter(m => m.kind === "HarnessComponent");
  const unique = xs => [...new Set(xs)].sort();
  const required = {validators: unique([...bundle.spec.validators, ...p.spec.acceptance.blockingValidators, ...components.flatMap(c => c.spec.validators.map(v => v.id))]),
    constraints: unique([...bundle.spec.constraints, ...components.flatMap(c => c.spec.constraints)]),
    evidence: unique([...bundle.spec.evidence, ...p.spec.acceptance.requiredEvidence, ...components.flatMap(c => c.spec.evidence)])};
  const pending = f.run.pendingExecution;
  const plan = rehash({schema: "evopilot-semantic-outcome-plan/v1", goalTargetDigest: f.plan.binding.goalTargetDigest,
    artifactSetDigest: f.projectRecord.binding.pins.artifactSetDigest, bundleDigest: f.plan.binding.bundleRef.digest,
    lifecycleDigest: pending.lifecycle.digest, stageId: pending.stageId, action: pending.action, actionVersion: pending.actionVersion,
    business: [{id: "business-units", conceptId: "fixture:entity", evidenceKind: "local-checks", path: ["units"], predicate: {op: "NUMBER_RANGE", minimum: 1, maximum: 10}}],
    harness: [
      {id: "professional-command-approval", evidenceKind: "local-checks", path: ["executed"], predicate: {op: "STRING_SET_SUBSET", evidenceKind: "local-checks", path: ["approved"]}, obligation: {kind: "validator", value: "approved-command-only"}},
      {id: "professional-exit-code", evidenceKind: "local-checks", path: ["exitCodes"], predicate: {op: "ALL_ZERO"}, obligation: {kind: "validator", value: "validation-exit-code"}},
      ...required.constraints.map((value, i) => ({id: `constraint-${i}`, evidenceKind: "local-checks", path: ["boundaryChecks", String(i)], predicate: {op: "EQUALS", value: true}, obligation: {kind: "constraint", value}})),
      ...required.evidence.map((value, i) => ({id: `evidence-${i}`, evidenceKind: value, path: ["present"], predicate: {op: "EQUALS", value: true}, obligation: {kind: "evidence", value}}))]});
  options.plan?.(plan); rehash(plan); f.state.outcomePlan = plan;
  const {source} = seedSemanticRuntimeRecords(f);
  const bound = await f.bind();
  const facts = {units: 5, executed: ["synthetic-validation"], approved: ["synthetic-validation"], exitCodes: [0], boundaryChecks: Object.fromEntries(required.constraints.map((_, i) => [String(i), true]))};
  options.facts?.(facts);
  const directory = path.join(f.configuration.dataRoot, "semantic-outcome-evidence", f.scope.tenantId, f.scope.workspaceId, f.scope.projectId);
  let calls = 0; const files = [];
  const real = createOpenCodeExecutorAdapter({profile, runner: async () => {calls++; return {exitCode: 0, signal: null, termination: "EXITED", stdout: '{"type":"step_finish"}', stderr: ""};}});
  const adapter = {...real, ...(!options.observeProcess ? {processObservationSchema: undefined, readProcessObservation: undefined} : {}), execute: async request => {
    const result = await real.execute(request); result.artifacts = [];
    await fs.mkdir(directory, {recursive: true});
    for (const kind of ["local-checks", ...required.evidence].filter(k => k !== options.omit)) {
      const doc = {schema: "evopilot-semantic-outcome-evidence/v1", scope: request.scope, executionBindingDigest: bound.bindingDigest,
        sourceRequestDigest: pending.requestDigest, requestDigest: request.requestDigest, evidenceContractDigest: bound.evidenceContractDigest,
        kind, facts: kind === "local-checks" ? facts : {present: true}};
      options.document?.(doc);
      const bytes = JSON.stringify(doc) + " ".repeat(options.padding ?? 0), digest = "sha256:" + createHash("sha256").update(bytes).digest("hex"), file = path.join(directory, digest.slice(7) + ".json");
      await fs.writeFile(file, bytes); files.push(file); result.artifacts.push({ref: `semantic-evidence://${kind}/${digest.slice(7)}`, digest});
    }
    if (options.status) result.status = options.status;
    options.result?.(result);
    return result;
  }};
  const owners = {...f.owners, adapter}, transport = createSemanticExecutionTransport(f.configuration, owners);
  const input = {identity: f.identity, bindingDigest: bound.bindingDigest, runId: f.run.id, requestDigest: pending.requestDigest,
    currentAccess: f.input.currentAccess, selection: {schema: "evopilot-semantic-context-selection/v1", reasoning: "EXPLICIT_ONLY", conceptIds: ["fixture:entity"], relations: []}};
  const outcome = createSemanticExecutionOutcomeService(f.configuration, owners);
  if (!options.skipReview) {
    const reviews = createSemanticOutcomeReviewService(f.configuration, owners);
    const review = await reviews.prepare({...input, coverage: source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: plan.business.map(r => r.id)}))});
    await reviews.approve({...input, reviewDigest: review.reviewDigest});
  }
  return {...f, plan, bound, owners, required, input, files, facts, outcome, calls: () => calls,
    dispatch: () => transport.execute(input), evaluate: () => outcome.evaluate(input)};
}

test("real pending/context/adapter/receipt path independently evaluates both sides without completing Lifecycle or Goal", async t => {
  const f = await fixture(t), runFile = path.join(f.configuration.dataRoot, "lifecycle-runs/context-run.json"), before = await fs.readFile(runFile, "utf8");
  await f.dispatch(); const result = await f.evaluate();
  assert.equal(result.business.status, "PASSED"); assert.equal(result.harness.status, "PASSED");
  assert.equal(result.status, "DUAL_VALIDATED_NOT_COMPLETED"); assert.equal(result.eligibleForCompletion, false);
  assert.equal(result.authority.mayCompleteGoal, false); assert.equal(result.outcomePlanDigest, f.plan.planDigest);
  assert.equal(result.evaluatorDigest, f.bound.outcomeEvaluatorDigest);
  assert.equal(await fs.readFile(runFile, "utf8"), before);
  assert.deepEqual(await f.evaluate(), result); assert.equal(f.calls(), 1);
  assert.deepEqual(await createSemanticExecutionOutcomeService(f.configuration, f.owners).evaluate(f.input), result);
  assert(!JSON.stringify(result).includes("synthetic-validation")); assert(!JSON.stringify(result).includes("boundaryChecks"));
});
test("adapter process evidence reaches the rule engine, without attesting synthetic origin or missing professional evidence", async t => {
  const f = await fixture(t, {observeProcess: true, plan: p => {p.business[0].evidenceKind = "agent-process"; p.business[0].path = ["exitCode"]; p.business[0].predicate = {op: "EQUALS", value: 0};},
    result: r => {r.artifacts = [];}});
  await f.dispatch(); const report = await f.evaluate();
  assert.equal(report.business.status, "PASSED"); assert.equal(report.harness.status, "INDETERMINATE");
  assert.equal(report.status, "INDETERMINATE"); assert.equal(report.evidenceTrust, "SYNTHETIC_PROCESS_BOUNDARY_ONLY");
  assert.equal(report.processEvidence.origin, "SYNTHETIC_PROCESS_RUNNER"); assert.equal(report.eligibleForCompletion, false);
  assert.equal(f.calls(), 1);
});
test("Agent artifact cannot impersonate Runtime process collection", async t => {
  const f = await fixture(t, {result: r => {r.artifacts[0].ref = r.artifacts[0].ref.replace("local-checks", "agent-process");}});
  await f.dispatch(); await assert.rejects(f.evaluate(), {code: "PERMISSION_DENIED"});
});
for (const [name, facts, business, harness] of [
  ["business only", x => {x.units = 0;}, "FAILED", "PASSED"],
  ["professional exit only", x => {x.exitCodes = [1];}, "PASSED", "FAILED"],
  ["unapproved command", x => {x.executed = ["unapproved-command"];}, "PASSED", "FAILED"],
  ["both sides", x => {x.units = 100; x.exitCodes = [1];}, "FAILED", "FAILED"],
  ["constraint failure", x => {x.boundaryChecks[0] = false;}, "PASSED", "FAILED"],
  ["empty execution cannot vacuously pass", x => {x.executed = []; x.exitCodes = [];}, "PASSED", "FAILED"]
]) test(`dual outcome rejects ${name}`, async t => {
  const f = await fixture(t, {facts}); await f.dispatch(); const report = await f.evaluate();
  assert.equal(report.business.status, business); assert.equal(report.harness.status, harness); assert.equal(report.status, "FAILED");
});
test("missing business observation is indeterminate, never defaulted to a passing value", async t => {
  const f = await fixture(t, {facts: x => {delete x.units;}}); await f.dispatch(); const report = await f.evaluate();
  assert.equal(report.business.status, "INDETERMINATE"); assert.equal(report.harness.status, "PASSED"); assert.equal(report.status, "INDETERMINATE");
});
test("missing required evidence cannot pass despite matching receipt and other successful checks", async t => {
  const f = await fixture(t, {omit: "phase-package"}); await f.dispatch(); const report = await f.evaluate();
  assert.equal(report.harness.status, "INDETERMINATE"); assert(report.harness.missingEvidenceKinds.includes("phase-package"));
});
for (const kind of ["validator", "constraint", "evidence"]) test(`omitting a published ${kind} mapping cannot shrink the gate`, async t => {
  const f = await fixture(t, {plan: p => {const i = p.harness.findIndex(r => r.obligation.kind === kind); p.harness.splice(i, 1);}});
  await f.dispatch(); const report = await f.evaluate(); assert.equal(report.harness.status, "INDETERMINATE"); assert.equal(report.harness.missingObligationDigests.length, 1);
});
for (const [name, document] of [
  ["scope", d => {d.scope = {...d.scope, goalId: "foreign"};}],
  ["semantic binding", d => {d.executionBindingDigest = "sha256:" + "a".repeat(64);}],
  ["source request", d => {d.sourceRequestDigest = "sha256:" + "a".repeat(64);}],
  ["dispatch request", d => {d.requestDigest = "sha256:" + "a".repeat(64);}],
  ["evidence contract", d => {d.evidenceContractDigest = "sha256:" + "a".repeat(64);}],
  ["extra authority", d => {d.mayApprove = true;}]
]) test(`even content-addressed evidence with wrong ${name} is refused`, async t => {
  const f = await fixture(t, {document}); await f.dispatch(); await assert.rejects(f.evaluate(), {code: "DRIFT"});
});
for (const mode of ["missing", "tampered", "symlink", "hardlink"]) test(`evidence ${mode} fails closed without fetching arbitrary paths`, async t => {
  const f = await fixture(t); await f.dispatch(); const file = f.files[0];
  if (mode === "tampered") await fs.appendFile(file, " ");
  else {const backup = file + ".fixture"; await fs.rename(file, backup); if (mode === "symlink") await fs.symlink(backup, file); if (mode === "hardlink") await fs.link(backup, file);}
  await assert.rejects(f.evaluate()); assert.equal(f.calls(), 1);
});
test("no persisted receipt means no evaluation and no implicit dispatch", async t => {
  const f = await fixture(t); await assert.rejects(f.evaluate(), {code: "UNAVAILABLE"}); assert.equal(f.calls(), 0);
});
test("changed plan cannot reinterpret an old dispatch or receipt", async t => {
  const f = await fixture(t); await f.dispatch(); f.state.outcomePlan.business[0].predicate.minimum = 0; rehash(f.state.outcomePlan);
  await assert.rejects(f.evaluate(), {code: "DRIFT"}); assert.equal(f.calls(), 1);
});
test("revoked current permission denies even previously validated outcomes", async t => {
  const f = await fixture(t); await f.dispatch(); await f.evaluate(); f.access.principal.role = "viewer";
  await assert.rejects(f.evaluate(), {code: "PERMISSION_DENIED"});
});
test("cancelled current Lifecycle cannot consume a stored successful Agent result", async t => {
  const f = await fixture(t); await f.dispatch(); f.lifecycleService.cancel(f.run.id, "synthetic", "synthetic://cancel", f.run.binding.digest);
  await assert.rejects(f.evaluate(), /LIFECYCLE_EXTERNAL_SIGNAL_NOT_PENDING/);
});
for (const status of ["FAILED", "UNCERTAIN"]) test(`${status} Agent cannot complete despite two passing validators`, async t => {
  const f = await fixture(t, {status}); await f.dispatch(); const report = await f.evaluate();
  assert.equal(report.business.status, "PASSED"); assert.equal(report.harness.status, "PASSED");
  assert.equal(report.status, status === "FAILED" ? "FAILED" : "INDETERMINATE"); assert.equal(report.eligibleForCompletion, false);
});
for (const [name, change] of [
  ["arbitrary executable", p => {p.business[0].predicate = {op: "SHELL", command: "never-run"};}],
  ["prototype path", p => {p.business[0].path = ["__proto__"];}],
  ["duplicate rule", p => {p.business.push(structuredClone(p.business[0]));}],
  ["empty business", p => {p.business = [];}],
  ["too many rules", p => {p.business = Array.from({length: 65}, (_, i) => ({...p.business[0], id: String(i)}));}],
  ["extra rule authority", p => {p.business[0].mayApprove = true;}],
  ["invalid interval", p => {p.business[0].predicate = {op: "NUMBER_RANGE", minimum: 10, maximum: 1};}]
]) test(`outcome plan refuses ${name}`, async t => {
  const f = await fixture(t); const plan = structuredClone(f.plan); change(plan); rehash(plan);
  assert.throws(() => normalizeSemanticOutcomePlan(plan));
});
test("rule engine refuses undeclared concept and invented Harness obligation", async t => {
  const f = await fixture(t); assert.throws(() => evaluateSemanticOutcomeRules(f.plan, [], f.required, []), {code: "DRIFT"});
  const plan = structuredClone(f.plan); plan.harness[0].obligation.value = "invented"; rehash(plan);
  assert.throws(() => evaluateSemanticOutcomeRules(plan, [], f.required, ["fixture:entity"]), {code: "DRIFT"});
});

test("rule engine accepts 32 distinct observations and refuses overflow or duplicate kinds", async t => {
  const f = await fixture(t);
  const evidence = Array.from({length: 32}, (_, i) => ({kind: "bounded-" + i, facts: {present: true}}));
  assert.equal(evaluateSemanticOutcomeRules(f.plan, evidence, f.required, ["fixture:entity"]).status, "INDETERMINATE");
  assert.throws(() => evaluateSemanticOutcomeRules(f.plan, [...evidence, {kind: "overflow", facts: {}}], f.required, ["fixture:entity"]), {code: "IDENTITY_CONFLICT"});
  assert.throws(() => evaluateSemanticOutcomeRules(f.plan, [evidence[0], evidence[0]], f.required, ["fixture:entity"]), {code: "IDENTITY_CONFLICT"});
  assert.equal(f.calls(), 0);
});

test("wrong stage outcome plan is refused before any Agent invocation", async t => {
  const f = await fixture(t, {skipReview: true, plan: p => {p.stageId = "foreign";}});
  await assert.rejects(f.dispatch(), {code: "DRIFT"}); assert.equal(f.calls(), 0);
});
for (const [name, result, code] of [
  ["untrusted source path", r => {r.artifacts[0].ref = "file:///private/tmp/not-runtime-evidence";}, "PATH_DENIED"],
  ["duplicate kind", r => {r.artifacts.push({...r.artifacts[0]});}, "IDENTITY_CONFLICT"],
  ["too many artifacts", r => {r.artifacts = Array.from({length: 17}, () => r.artifacts[0]);}, "MATERIAL_LIMIT"]
]) test(`result evidence rejects ${name}`, async t => {
  const f = await fixture(t, {result}); await f.dispatch(); await assert.rejects(f.evaluate(), {code});
});
for (const [padding, code] of [[65536, "MATERIAL_LIMIT"], [30000, "TOTAL_MATERIAL_LIMIT"]]) test(`actual evidence bytes are bounded including ${padding} whitespace bytes`, async t => {
  const f = await fixture(t, {padding}); await f.dispatch(); await assert.rejects(f.evaluate(), {code});
});
test("pre-cancellation returns no outcome", async t => {
  const f = await fixture(t); await f.dispatch(); const controller = new AbortController(); controller.abort();
  await assert.rejects(f.outcome.evaluate({...f.input, signal: controller.signal}), {code: "CANCELLED"});
});
test("permission loss during final revalidation prevents outcome persistence", async t => {
  const f = await fixture(t); await f.dispatch(); let reads = 0;
  const owners = {...f.owners, lifecycle: {
    readPendingExecution: (...args) => f.lifecycleService.readPendingExecution(...args),
    readPendingObligations: (...args) => {if (++reads === 2) f.access.principal.role = "viewer"; return f.lifecycleService.readPendingObligations(...args);}
  }};
  // A loss observed at the last synchronous owner boundary must also be checked
  // immediately before publishing a local outcome record.
  const service = createSemanticExecutionOutcomeService(f.configuration, owners);
  await assert.rejects(service.evaluate(f.input), {code: "PERMISSION_DENIED"});
});

test("persisted Lifecycle adds obligations that cannot disappear behind a Bundle-only plan", async t => {
  const f = await fixture(t, {lifecycleObligations: {validators: ["lifecycle-independent-validator"]}});
  await f.dispatch(); const report = await f.evaluate();
  assert.equal(report.harness.status, "INDETERMINATE");
  assert.deepEqual(report.harness.missingObligationDigests, [d({kind: "validator", value: "lifecycle-independent-validator"})]);
});
