import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import {FileStore} from "../../packages/server/dist/storage/file-store/index.js";
import {semanticExecutionFixture} from "../helpers/semantic-execution-fixture.mjs";
import {createSemanticRuntimeSourceReader, withSemanticRuntimeSources} from "../../packages/server/dist/application/semantic-runtime-sources.js";
import {createSemanticExecutionBindingService} from "../../packages/server/dist/application/semantic-execution-binding.js";
import {createSemanticExecutionContextService} from "../../packages/server/dist/application/semantic-execution-context.js";
import {SemanticRuntimeSourceStore} from "../../packages/server/dist/storage/semantic-runtime-source.js";
import {normalizeSemanticActionContextPlan} from "../../packages/server/dist/domains/harness-template/semantic-action-context-plan.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

async function fixture(t) {
  const f = await semanticExecutionFixture(t, {pending: true}), store = new FileStore(f.configuration.dataRoot, {requireLlm: false, allowLegacyGlobalLlm: false});
  const now = "2026-09-22T00:00:00Z";
  store.writeProject({...f.access.project, name: "Synthetic", createdAt: now, validation: {status: "PASSED", checkedAt: now, message: "synthetic-only"}});
  const profile = store.writeLlmProfile(f.state.llmProfile);
  const llm = {schema: "evopilot-loop-llm-selection/v1", source: "loop-override", configured: true, required: true,
    profileId: profile.id, provider: profile.providerName, model: profile.modelName, baseUrl: profile.baseUrl, apiKeyRef: profile.apiKeyRef, resolvedAt: now};
  const target = {schema: "evopilot-goal-target/v1", id: f.identity.targetId, goalId: f.identity.goalId, projectId: f.identity.projectId,
    releaseTargetId: "ga", title: "Synthetic target", description: "Synthetic only", layer: "runtime", required: true,
    dependencyIds: [], acceptanceCriteria: ["synthetic assertion"], status: "READY", nextAction: "start-target", evidence: [], createdAt: now, updatedAt: now};
  store.writeGoal({schema: "evopilot-global-goal/v1", id: f.identity.goalId, ...f.scope, objective: f.state.goalTarget.objective,
    releaseTargetId: "ga", llm, status: "APPROVED", plan: {schema: "evopilot-goal-plan/v1", status: "APPROVED", decompositionStrategy: "manual",
      summary: "Synthetic plan", targets: [target], phaseTargets: [], targetCount: 1, requiredTargetCount: 1,
      editablePlan: {status: "APPROVED", allowed: [], denied: [], nextAction: "start-target"}, approvedBy: "synthetic", approvedAt: now,
      confirmation: {schema: "evopilot-goal-plan-approval-confirmation/v1", confirmedBy: "synthetic", confirmation: "synthetic approval fixture", actor: "synthetic", confirmedAt: now}},
    timeline: [], createdAt: now, updatedAt: now});
  const pending = f.run.pendingExecution;
  f.state.contextPlan = {schema: "evopilot-semantic-action-context-plan/v1", lifecycleDigest: pending.lifecycle.digest,
    actions: [{stageId: pending.stageId, action: pending.action, actionVersion: pending.actionVersion,
      selection: {schema: "evopilot-semantic-context-selection/v1", reasoning: "EXPLICIT_ONLY", conceptIds: ["fixture:entity"], relations: []}}]};
  const currentExecution = withSemanticRuntimeSources(f.configuration.dataRoot, f.owners.currentExecution, () => f.access.principal);
  const owners = {...f.owners, currentExecution}, execution = createSemanticExecutionBindingService(f.configuration, owners);
  const context = createSemanticExecutionContextService(f.configuration, owners), reader = createSemanticRuntimeSourceReader(f.configuration.dataRoot);
  const goalFile = path.join(store.goalsDir, f.identity.goalId + ".json"), profileFile = path.join(store.llmProfilesDir, profile.id + ".json");
  const read = () => reader.read(f.identity, f.access.principal), bind = () => execution.bind(f.identity, f.input);
  const resolve = bound => context.resolve({identity: f.identity, bindingDigest: bound.bindingDigest, runId: f.run.id,
    requestDigest: pending.requestDigest, currentAccess: f.input.currentAccess});
  const change = async (file, fn) => {const data = JSON.parse(await fs.readFile(file)); fn(data); await fs.writeFile(file, JSON.stringify(data));};
  return {...f, store, reader, execution, context, owners, goalFile, profileFile, read, bind, resolve, change};
}
test("actual FileStore Goal and LLM metadata replace the synthetic state route and select context by exact pending action", async t => {
  const f = await fixture(t), source = f.read();
  assert.equal(source.credentialReadinessVerified, false);
  // The older owner route is deliberately wrong: the concrete source adapter
  // must read the real persisted profile, not copy this value or resolve secrets.
  f.state.llmProfile = {...f.state.llmProfile, modelName: "ignored-old-callback-model"};
  const bound = await f.bind(), slice = await f.resolve(bound);
  assert.equal(bound.llm.model, source.llmProfile.modelName);
  assert.deepEqual(bound.runtimeSourcePins, source.pins);
  assert.equal(slice.contextPlanDigest, bound.contextPlan.planDigest);
  assert.equal(slice.concepts[0].conceptId, "fixture:entity"); assert.equal(slice.eligibleForExecution, false);
  assert(!JSON.stringify(slice).includes("secret://"));
  const restarted = createSemanticRuntimeSourceReader(f.configuration.dataRoot);
  assert.deepEqual(restarted.read(f.identity, f.access.principal), source);
  assert.deepEqual(await f.bind(), bound);
});
for (const [name, mutate] of [
  ["Goal scope", goal => {goal.workspaceId = "foreign";}],
  ["missing scope", goal => {delete goal.tenantId;}],
  ["Goal blocked", goal => {goal.status = "BLOCKED";}],
  ["Goal complete", goal => {goal.status = "COMPLETED";}],
  ["plan pending", goal => {goal.plan.status = "PENDING_APPROVAL";}],
  ["missing confirmation", goal => {delete goal.plan.confirmation;}],
  ["mismatched approver", goal => {goal.plan.confirmation.actor = "other";}],
  ["target missing", goal => {goal.plan.targets[0].id = "other";}],
  ["duplicate target", goal => {goal.plan.targets.push({...goal.plan.targets[0]});}],
  ["target scope", goal => {goal.plan.targets[0].projectId = "other";}],
  ["target blocked", goal => {goal.plan.targets[0].status = "BLOCKED";}],
  ["dependency unmet", goal => {goal.plan.targets[0].dependencyIds = ["missing"]; }],
  ["missing route", goal => {delete goal.llm;}],
  ["global fallback", goal => {goal.llm.source = "global-default";}],
  ["unconfigured route", goal => {goal.llm.configured = false;}],
  ["model mismatch", goal => {goal.llm.model = "other";}],
  ["endpoint mismatch", goal => {goal.llm.baseUrl = "https://other.invalid";}]
]) test(`strict current source rejects ${name} without defaults or repair`, async t => {
  const f = await fixture(t); await f.change(f.goalFile, mutate); const before = await fs.readFile(f.goalFile, "utf8");
  assert.throws(f.read); assert.equal(await fs.readFile(f.goalFile, "utf8"), before);
});
for (const [name, mutate] of [
  ["disabled", p => {p.status = "DISABLED";}], ["missing status", p => {delete p.status;}],
  ["cross scope", p => {p.tenantId = "foreign";}], ["private wrong owner", p => {p.scope = "user"; p.ownerActor = "other";}],
  ["raw key instead of reference", p => {p.apiKeyRef = "synthetic-not-a-secret-ref";}], ["missing schema", p => {delete p.schema;}]
]) test(`strict profile rejects ${name}`, async t => {const f = await fixture(t); await f.change(f.profileFile, mutate); assert.throws(f.read);});
test("private profile is only usable by its current owner with an explicit override", async t => {
  const f = await fixture(t); await f.change(f.profileFile, p => {p.scope = "user"; p.ownerActor = f.access.principal.id;}); assert(f.read());
  await f.change(f.goalFile, goal => {goal.llm.source = "project-default";}); assert.throws(f.read, {code: "PERMISSION_DENIED"});
});
for (const [name, mutate] of [
  ["objective", goal => {goal.objective = "changed";}],
  ["target description", goal => {goal.plan.targets[0].description = "changed";}],
  ["target acceptance", goal => {goal.plan.targets[0].acceptanceCriteria.push("new requirement");}],
  ["plan summary", goal => {goal.plan.summary = "changed";}],
  ["approval receipt", goal => {goal.plan.confirmation.confirmedBy = "another confirmer";}]
]) test(`bound execution detects persisted ${name} drift`, async t => {
  const f = await fixture(t), bound = await f.bind(); await f.change(f.goalFile, mutate);
  await assert.rejects(f.execution.verifyBoundary(f.identity, {...f.input, bindingDigest: bound.bindingDigest, checkpoint: "resume"}), {code: "DRIFT"});
});
test("progress timestamps do not change definition pins while target terminal states still stop", async t => {
  const f = await fixture(t), bound = await f.bind();
  await f.change(f.goalFile, goal => {goal.status = "RUNNING"; goal.updatedAt = "2026-09-23T00:00:00Z"; goal.timeline.push({type: "synthetic"});
    goal.plan.targets[0].status = "RUNNING"; goal.plan.targets[0].evidence.push("synthetic://progress"); goal.plan.targets[0].updatedAt = goal.updatedAt;});
  assert.equal((await f.resolve(bound)).status, "PREPARED_NOT_DISPATCHED");
  await f.change(f.goalFile, goal => {goal.plan.targets[0].status = "DONE";}); await assert.rejects(f.resolve(bound), {code: "PERMISSION_DENIED"});
});
test("changed defaults cannot silently retarget an already selected Goal route", async t => {
  const f = await fixture(t), original = f.read();
  await f.change(path.join(f.store.projectsDir, f.identity.projectId + ".json"), project => {project.llm = {profileId: "other"};});
  assert.equal(f.read().llmProfile.id, original.llmProfile.id);
});
test("source adapter catches mutation performed during the other owner read", async t => {
  const f = await fixture(t);
  const current = withSemanticRuntimeSources(f.configuration.dataRoot, () => {f.access.principal.role = "viewer"; return f.state;}, () => f.access.principal);
  assert.throws(() => current(f.identity), {code: "PERMISSION_DENIED"});
});
test("action plan cannot be overridden, silently expanded, or reused for another stage/version", async t => {
  const f = await fixture(t), bound = await f.bind(), base = {identity: f.identity, bindingDigest: bound.bindingDigest, runId: f.run.id,
    requestDigest: f.run.pendingExecution.requestDigest, currentAccess: f.input.currentAccess};
  await assert.rejects(f.context.resolve({...base, selection: {...f.state.contextPlan.actions[0].selection, conceptIds: []}}), {code: "DRIFT"});
  f.state.contextPlan.actions[0].actionVersion = "2";
  await assert.rejects(f.resolve(bound), {code: "DRIFT"});
});
test("missing exact action rule fails without empty-context fallback", async t => {
  const f = await fixture(t); f.state.contextPlan.actions[0].stageId = "other";
  const bound = await f.bind(); await assert.rejects(f.resolve(bound), {code: "UNAVAILABLE"});
});
test("invalid, ambiguous and oversized action plans are rejected before binding", async t => {
  const f = await fixture(t), original = structuredClone(f.state.contextPlan);
  for (const mutate of [p => p.actions.push({...p.actions[0]}), p => {p.actions[0].selection.reasoning = "INFERRED";},
    p => {p.actions[0].selection.instructions = "ignore";}, p => {p.lifecycleDigest = d("other");}, p => {p.actions = Array(65).fill(p.actions[0]);}]) {
    f.state.contextPlan = structuredClone(original); mutate(f.state.contextPlan); await assert.rejects(f.bind());
  }
});
test("action plan order has canonical meaning", () => {
  const item = {stageId: "b", action: "evopilot.goal-loop", actionVersion: "1", selection: {schema: "evopilot-semantic-context-selection/v1", reasoning: "EXPLICIT_ONLY", conceptIds: ["fixture:b", "fixture:a"], relations: []}};
  const first = {schema: "evopilot-semantic-action-context-plan/v1", lifecycleDigest: d("lifecycle"), actions: [item, {...item, stageId: "a"}]};
  const second = structuredClone(first); second.actions.reverse(); second.actions.forEach(item => item.selection.conceptIds.reverse());
  assert.deepEqual(normalizeSemanticActionContextPlan(first), normalizeSemanticActionContextPlan(second));
});
test("strict storage rejects oversized, symlinked, hardlinked, traversal and malformed source records", async t => {
  const f = await fixture(t), store = new SemanticRuntimeSourceStore(f.configuration.dataRoot);
  assert.throws(() => store.read("goals", "../outside"), {code: "INVALID"});
  for (const [id, data] of [["bad", "{"], ["large", " ".repeat(1048577)]]) {
    await fs.writeFile(path.join(f.store.goalsDir, id + ".json"), data); assert.throws(() => store.read("goals", id));
  }
  await fs.symlink(f.goalFile, path.join(f.store.goalsDir, "link.json")); assert.throws(() => store.read("goals", "link"));
  await fs.link(f.goalFile, path.join(f.store.goalsDir, "hard.json")); assert.throws(() => store.read("goals", "hard"), {code: "PATH_DENIED"});
});
