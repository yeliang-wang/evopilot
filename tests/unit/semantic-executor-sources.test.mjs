import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {canonicalDigest as d} from "../../packages/core/dist/index.js";
import {semanticExecutionFixture} from "../helpers/semantic-execution-fixture.mjs";
import {createSemanticExecutorSourceReader, withSemanticExecutorSources} from "../../packages/server/dist/application/semantic-executor-sources.js";
import {createSemanticExecutionBindingService} from "../../packages/server/dist/application/semantic-execution-binding.js";
import {createSemanticExecutionContextService} from "../../packages/server/dist/application/semantic-execution-context.js";
import {createOpenCodeRuntimeProfile} from "../../packages/adapter-opencode/dist/index.js";

async function fixture(t, mutate = () => {}, activate = true, adapterProfile) {
  const f = await semanticExecutionFixture(t, {pending: true, adapterProfile});
  let now = Date.now() + 1000;
  const observation = {schema: "evopilot-semantic-executor-observation/v1", scope: f.scope, identity: f.identity, status: "READY",
    principalId: f.access.principal.id, observedAt: new Date(now - 60000).toISOString(), validUntil: new Date(now + 60000).toISOString(),
    observedBy: "synthetic-runtime-observer", evidenceRefs: ["synthetic://observation-only"], runtime: adapterProfile?.runtime ?? {name: "synthetic-agent", version: "1.2.3"},
    ...(adapterProfile ? {adapterProfile} : {}),
    profile: f.state.agentRuntime, qualification: f.state.qualification, executor: f.state.executor,
    environment: {status: "READY", digest: f.state.harness.environmentDigest, workspaceRef: f.state.executor.sandbox.workspaceRef,
      evidenceRefs: ["synthetic://environment-only"]},
    governance: Object.fromEntries(["policyDigest", "providerDigest", "authorityDigest", "runtimeDigest", "evidenceDigest"].map(key => [key, f.state.harness[key]])),
    permissionCeiling: {allowedEffects: [...f.state.executor.allowedEffects], capabilities: [...f.state.executor.capabilities]}};
  const body = structuredClone(observation); mutate(body); body.digest = d(body);
  const resource = f.governed.registerResource({apiVersion: "evopilot.io/v1", kind: "AgentRuntimeProfile",
    metadata: {id: "synthetic-observation", name: "Synthetic only", version: "1.0.0"},
    provenance: {sourceType: "NATIVE", sourceId: "synthetic", sourceVersion: "1.0.0", sourceDigest: d("synthetic")},
    compatibility: {runtime: ">=6.2.0 <7.0.0"}, capabilityRefs: [], spec: {semanticObservation: body}}, f.scope);
  if (activate) f.governed.activateResourceVersion(resource.kind, resource.metadata.id, resource.metadata.version, "synthetic-reviewer", "synthetic://review", f.scope);
  const ref = {id: resource.metadata.id, version: resource.metadata.version, digest: resource.digest};
  const reader = createSemanticExecutorSourceReader(f.configuration.dataRoot, () => now);
  const currentExecution = withSemanticExecutorSources(f.configuration.dataRoot, {currentAccess: f.input.currentAccess,
    currentRef: () => ref, currentExecution: () => f.state, now: () => now});
  const owners = {...f.owners, currentExecution}, execution = createSemanticExecutionBindingService(f.configuration, owners);
  const context = createSemanticExecutionContextService(f.configuration, owners);
  const file = active => path.join(f.configuration.dataRoot, active ? "governed-evolution-resources-active" : "governed-evolution-resources",
    f.scope.tenantId, f.scope.workspaceId, `AgentRuntimeProfile--${ref.id}${active ? "" : "--" + ref.version}.json`);
  return {...f, ref, resource, observation: body, reader, currentExecution, owners, execution, file,
    time: {get: () => now, set: value => {now = value;}},
    read: () => reader.read(ref, f.identity, f.scope, f.access.principal.id), bind: () => execution.bind(f.identity, f.input),
    resolve: binding => context.resolve({identity: f.identity, bindingDigest: binding.bindingDigest, runId: f.run.id,
      requestDigest: f.run.pendingExecution.requestDigest, currentAccess: f.input.currentAccess,
      selection: {schema: "evopilot-semantic-context-selection/v1", reasoning: "EXPLICIT_ONLY", conceptIds: ["fixture:entity"], relations: []}})};
}

const adapterProfile = () => createOpenCodeRuntimeProfile({runtimeVersion: "synthetic-1", host: "synthetic-host", provider: "synthetic", model: "test",
  capabilities: ["goal-loop.execute"], workspaceRoot: "/private/tmp/synthetic-semantic-workspace"});
test("activated transport observation retains separate core and adapter qualifications", async t => {
  const f = await fixture(t, () => {}, true, adapterProfile()), bound = await f.bind();
  assert.equal(bound.agentRuntime.adapterProfileDigest, f.observation.adapterProfile.digest);
  assert.equal(bound.agentRuntime.coreProfileDigest, f.observation.profile.digest);
  assert.equal(bound.agentRuntime.coreQualificationDigest, f.observation.qualification.digest);
  assert.notEqual(bound.agentRuntime.qualificationDigest, f.observation.qualification.digest);
  assert.equal((await f.resolve(bound)).eligibleForExecution, false);
});
for (const [name, mutate] of [
  ["physical runtime", o => {o.runtime.version = "foreign";}],
  ["adapter host", o => {o.adapterProfile.host = "foreign";}],
  ["adapter scope", o => {o.adapterProfile.constraints.workspaceRoot = "/private/tmp/foreign";}],
  ["adapter capabilities", o => {o.adapterProfile.capabilities.push("publish");}],
  ["adapter route", o => {o.adapterProfile.model = "foreign";}],
  ["adapter evidence", o => {o.adapterProfile.qualification.evidenceRefs = [];}],
  ["core qualification", o => {o.qualification.digest = d("foreign");}]
]) test(`transport observation rejects rehashed ${name}`, async t => {
  const f = await fixture(t, o => {mutate(o); const {digest, ...body} = o.adapterProfile; o.adapterProfile.digest = d(body);}, true, adapterProfile());
  await assert.rejects(f.bind());
});

test("persisted exact executor observation supplies qualification and bounded permissions through binding and context preparation", async t => {
  const f = await fixture(t), filesBefore = [false, true].map(active => fs.readFileSync(f.file(active), "utf8"));
  f.state.agentRuntime = {...f.state.agentRuntime, model: "stale-owner-metadata"};
  const binding = await f.bind(), slice = await f.resolve(binding);
  assert.deepEqual(binding.executorSourcePins, f.read().pins);
  assert.equal(binding.agentRuntime.model, f.observation.profile.model);
  assert.equal(slice.status, "PREPARED_NOT_DISPATCHED"); assert.equal(slice.eligibleForExecution, false);
  assert.equal(binding.eligibleForExecution, false);
  assert.deepEqual([false, true].map(active => fs.readFileSync(f.file(active), "utf8")), filesBefore);
  assert(Object.isFrozen(f.read().observation));
  assert(!JSON.stringify(binding.executorSourcePins).includes("workspaceRef"));
  const restarted = createSemanticExecutorSourceReader(f.configuration.dataRoot, f.time.get);
  assert.deepEqual(restarted.read(f.ref, f.identity, f.scope, f.access.principal.id), f.read());
  assert.deepEqual(await createSemanticExecutionBindingService(f.configuration, f.owners).bind(f.identity, f.input), binding);
});

for (const [name, mutate] of [
  ["revoked", o => {o.status = "REVOKED";}],
  ["foreign scope", o => {o.scope.workspaceId = "foreign";}],
  ["other Goal", o => {o.identity.goalId = "foreign";}],
  ["other Target", o => {o.identity.targetId = "foreign";}],
  ["other binding", o => {o.identity.harnessBindingDigest = d("foreign");}],
  ["other principal", o => {o.principalId = "foreign";}],
  ["future observation", o => {o.observedAt = "2099-01-01T00:00:00Z";}],
  ["expired observation", o => {o.validUntil = "2000-01-01T00:00:00Z";}],
  ["invalid expiry", o => {o.validUntil = "invalid";}],
  ["no evidence", o => {o.evidenceRefs = [];}],
  ["no observer", o => {o.observedBy = "";}],
  ["no runtime version", o => {o.runtime.version = "";}],
  ["profile tamper", o => {o.profile.model = "changed";}],
  ["rejected qualification", o => {o.qualification.status = "REJECTED";}],
  ["missing qualification evidence", o => {o.qualification.evidenceRefs = [];}],
  ["executor tamper", o => {o.executor.host = "changed";}],
  ["environment blocked", o => {o.environment.status = "BLOCKED";}],
  ["environment unknown", o => {o.environment.status = "UNKNOWN";}],
  ["environment digest drift", o => {o.environment.digest = d("changed");}],
  ["environment workspace mismatch", o => {o.environment.workspaceRef = "synthetic://other";}],
  ["missing environment evidence", o => {o.environment.evidenceRefs = [];}],
  ["policy drift", o => {o.governance.policyDigest = d("changed");}],
  ["provider drift", o => {o.governance.providerDigest = d("changed");}],
  ["authority drift", o => {o.governance.authorityDigest = d("changed");}],
  ["Runtime digest drift", o => {o.governance.runtimeDigest = d("changed");}],
  ["evidence contract drift", o => {o.governance.evidenceDigest = d("changed");}],
  ["empty permission ceiling", o => {o.permissionCeiling.allowedEffects = [];}],
  ["missing capability ceiling", o => {o.permissionCeiling.capabilities = [];}],
  ["extra authority field", o => {o.mayApprove = true;}]
]) test(`executor source refuses ${name} even in a rehashed, explicitly activated resource`, async t => {
  const f = await fixture(t, mutate); await assert.rejects(f.bind());
});
test("initial registration is not explicit observation activation", async t => {
  const f = await fixture(t, () => {}, false); await assert.rejects(f.bind(), {code: "PERMISSION_DENIED"});
});
test("observation cannot restore live permissions or principal access after revocation", async t => {
  const f = await fixture(t), bound = await f.bind();
  f.state.permissions.allowedEffects = [];
  await assert.rejects(f.resolve(bound), {code: "PERMISSION_DENIED"});
  f.access.principal.role = "viewer"; assert.throws(() => f.currentExecution(f.identity), {code: "PERMISSION_DENIED"});
});
test("extra observation permissions never expand current authority", async t => {
  const f = await fixture(t, o => {o.permissionCeiling.allowedEffects.push("PUBLICATION"); o.permissionCeiling.capabilities.push("publish");});
  const current = f.currentExecution(f.identity);
  assert.deepEqual(current.permissions.allowedEffects, f.state.permissions.allowedEffects);
  assert.deepEqual(current.permissions.capabilities, f.state.permissions.capabilities);
});
test("exact expiry stops context preparation and all execution checkpoints", async t => {
  const f = await fixture(t), bound = await f.bind(); f.time.set(Date.parse(f.observation.validUntil));
  await assert.rejects(f.resolve(bound), {code: "UNAVAILABLE"});
  for (const checkpoint of ["start", "resume", "retry", "loop-iteration"])
    await assert.rejects(f.execution.verifyBoundary(f.identity, {...f.input, bindingDigest: bound.bindingDigest, checkpoint}), {code: "UNAVAILABLE"});
});
test("clock rollback and expiry during remaining owner reads stop preparation", async t => {
  const f = await fixture(t);
  const current = withSemanticExecutorSources(f.configuration.dataRoot, {currentAccess: f.input.currentAccess, currentRef: () => f.ref,
    currentExecution: () => {f.time.set(Date.parse(f.observation.validUntil)); return f.state;}, now: f.time.get});
  assert.throws(() => current(f.identity), {code: "UNAVAILABLE"});
  // This also predates explicit activation, so its authority check refuses first.
  f.time.set(Date.parse(f.observation.observedAt) - 1); assert.throws(f.read, {code: "PERMISSION_DENIED"});
});
test("missing or corrupted active observation never falls back to a saved qualification", async t => {
  const f = await fixture(t), binding = await f.bind(), p = f.file(true), raw = fs.readFileSync(p, "utf8");
  fs.unlinkSync(p); await assert.rejects(f.resolve(binding), {code: "UNAVAILABLE"});
  const active = JSON.parse(raw); active.actor = "tampered"; fs.writeFileSync(p, JSON.stringify(active));
  await assert.rejects(f.resolve(binding), {code: "PERMISSION_DENIED"});
});
test("changed exact observation activation invalidates old binding even when resource bytes remain identical", async t => {
  const f = await fixture(t), binding = await f.bind();
  f.governed.activateResourceVersion("AgentRuntimeProfile", f.ref.id, f.ref.version, "new-reviewer", "synthetic://new-review", f.scope);
  await assert.rejects(f.resolve(binding), {code: "DRIFT"});
});
test("executor source pins are scope checked by the binding kernel", async t => {
  const f = await fixture(t), state = structuredClone(f.currentExecution(f.identity)); state.executorSourcePins.scope.workspaceId = "foreign";
  const service = createSemanticExecutionBindingService(f.configuration, {...f.owners, currentExecution: () => state});
  await assert.rejects(service.bind(f.identity, f.input), {code: "INVALID"});
});
test("permission intersection cannot launder an invalid current permission revision", async t => {
  const f = await fixture(t); f.state.permissions.revisionDigest = "missing-current-authority";
  await assert.rejects(f.bind(), {code: "INVALID"});
});
