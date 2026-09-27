import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {canonicalDigest as d} from "../../packages/core/dist/index.js";
import {semanticExecutionFixture} from "../helpers/semantic-execution-fixture.mjs";
import {createSemanticGovernedSourceReader, withSemanticGovernedSources} from "../../packages/server/dist/application/semantic-governed-sources.js";
import {createSemanticExecutionBindingService} from "../../packages/server/dist/application/semantic-execution-binding.js";
import {SemanticRuntimeSourceStore} from "../../packages/server/dist/storage/semantic-runtime-source.js";

const kinds = {policy: "PolicyPack", provider: "ActionProviderDefinition", environment: "EnvironmentBinding", authority: "HumanAuthorityRole", evidence: "GovernancePack"};
const slots = Object.keys(kinds);
async function fixture(t) {
  const f = await semanticExecutionFixture(t), refs = {}, resources = {};
  for (const [slot, kind] of Object.entries(kinds)) {
    resources[slot] = f.governed.registerResource({apiVersion: "evopilot.io/v1", kind,
      metadata: {id: "synthetic-" + slot, name: "Synthetic metadata only", version: "1.0.0"},
      provenance: {sourceType: "NATIVE", sourceId: "synthetic", sourceVersion: "1.0.0", sourceDigest: d("synthetic")},
      compatibility: {runtime: ">=6.2.0 <7.0.0"}, capabilityRefs: [],
      spec: slot === "provider" ? {execution: "TYPED_ACTIONS_ONLY", arbitraryShell: false, actions: [{id: "synthetic.read",
        inputSchema: {type: "object"}, outputSchema: {type: "object"}, receipt: "IMMUTABLE_REQUIRED", idempotencyKeyRequired: true,
        rollback: "NOT_APPLICABLE", requiredAuthorities: [], credentialRefs: []}]} : {purpose: "synthetic metadata, no operational rights"}}, f.scope);
    refs[slot] = {id: resources[slot].metadata.id, version: resources[slot].metadata.version, digest: resources[slot].digest};
  }
  const old = f.plan.binding;
  const plan = f.governed.plan({projectDefinitionId: f.scope.projectId, goalTarget: f.state.goalTarget, candidates: [f.plan.match.selected],
    lifecycle: {ref: {id: old.lifecycleRef.id, version: old.lifecycleRef.version}, digest: old.lifecycleRef.digest,
      definition: {capabilities: ["goal-loop.execute"], obligations: {}}},
    policyDigest: refs.policy.digest, providerDigest: refs.provider.digest, environmentDigest: refs.environment.digest,
    authorityDigest: refs.authority.digest, evidenceDigest: refs.evidence.digest, runtimeDigest: old.runtimeDigest, hostDigest: old.hostDigest}, f.scope);
  const identity = {...f.identity, harnessBindingDigest: plan.binding.digest};
  const currentExecution = withSemanticGovernedSources(f.configuration.dataRoot, {currentAccess: f.input.currentAccess,
    currentRefs: () => refs, currentExecution: () => f.state});
  const owners = {...f.owners, currentExecution}, execution = createSemanticExecutionBindingService(f.configuration, owners);
  const reader = createSemanticGovernedSourceReader(f.configuration.dataRoot);
  const file = (slot, active = false) => path.join(f.configuration.dataRoot, active ? "governed-evolution-resources-active" : "governed-evolution-resources",
    f.scope.tenantId, f.scope.workspaceId, `${kinds[slot]}--${refs[slot].id}${active ? "" : "--" + refs[slot].version}.json`);
  const change = (slot, active, fn) => {const p = file(slot, active), value = JSON.parse(fs.readFileSync(p)); fn(value); fs.writeFileSync(p, JSON.stringify(value));};
  const rehash = value => {delete value.digest; value.digest = d(value);};
  return {...f, refs, resources, identity, owners, reader, file, change, rehash, currentExecution,
    read: () => reader.read(refs, f.scope), bind: () => execution.bind(identity, f.input),
    verify: binding => execution.verifyBoundary(identity, {...f.input, bindingDigest: binding.bindingDigest, checkpoint: "resume"})};
}

test("current scoped resources replace stale callback digests and are pinned across restart without granting execution", async t => {
  const f = await fixture(t), before = slots.map(slot => fs.readFileSync(f.file(slot), "utf8"));
  const pins = f.read(), binding = await f.bind();
  assert(Object.isFrozen(pins.resources.policy));
  assert.deepEqual(binding.governedSourcePins, pins);
  for (const slot of slots) assert.equal(binding[slot === "evidence" ? "evidenceContractDigest" : slot + "Digest"], f.refs[slot].digest);
  assert.equal(binding.status, "BOUND_PENDING_EXECUTION_INTEGRATION"); assert.equal(binding.eligibleForExecution, false);
  assert.equal((await f.verify(binding)).eligibleForExecution, false);
  assert.deepEqual(createSemanticGovernedSourceReader(f.configuration.dataRoot).read(f.refs, f.scope), pins);
  const restarted = createSemanticExecutionBindingService(f.configuration, f.owners);
  assert.deepEqual(await restarted.bind(f.identity, f.input), binding);
  assert.deepEqual(slots.map(slot => fs.readFileSync(f.file(slot), "utf8")), before);
  assert(!JSON.stringify(pins).includes("synthetic metadata, no operational rights"));
});
for (const slot of slots) test(`missing active ${slot} pointer never falls back to latest resource`, async t => {
  const f = await fixture(t); fs.unlinkSync(f.file(slot, true));
  // Legacy general reader accepts latest; this strict semantic path must not.
  assert(f.governed.readResource(kinds[slot], f.refs[slot].id, undefined, f.scope));
  await assert.rejects(f.bind(), {code: "UNAVAILABLE"}); assert.equal(fs.existsSync(f.file(slot, true)), false);
});
for (const slot of slots) test(`modified persisted ${slot} resource cannot hide behind its old digest`, async t => {
  const f = await fixture(t), binding = await f.bind(); f.change(slot, false, r => {r.metadata.name = "tampered";});
  await assert.rejects(f.verify(binding), {code: "MATERIAL_INVALID"});
});
for (const slot of slots) test(`activation of successor ${slot} rejects old selected source`, async t => {
  const f = await fixture(t), binding = await f.bind();
  f.governed.registerResource({...f.resources[slot], digest: undefined, metadata: {...f.resources[slot].metadata, version: "1.0.1"}}, f.scope);
  f.governed.activateResourceVersion(kinds[slot], f.refs[slot].id, "1.0.1", "synthetic", "synthetic://decision", f.scope);
  await assert.rejects(f.verify(binding), {code: "DRIFT"});
});
test("inactive newer versions and unrelated resources do not change selected source pins", async t => {
  const f = await fixture(t), before = f.read(), binding = await f.bind();
  f.governed.registerResource({...f.resources.policy, digest: undefined, metadata: {...f.resources.policy.metadata, version: "1.0.1"}}, f.scope);
  f.governed.registerResource({...f.resources.policy, digest: undefined, metadata: {...f.resources.policy.metadata, id: "unrelated"}}, f.scope);
  assert.deepEqual(f.read(), before); assert.equal((await f.verify(binding)).status, "VALIDATED");
});
test("explicit reactivation of same bytes invalidates the old activation receipt pin", async t => {
  const f = await fixture(t), binding = await f.bind();
  f.governed.activateResourceVersion(kinds.policy, f.refs.policy.id, "1.0.0", "synthetic-new-actor", "synthetic://new-decision", f.scope);
  assert.equal(f.read().resources.policy.digest, f.refs.policy.digest);
  await assert.rejects(f.verify(binding), {code: "DRIFT"});
});
for (const [label, mutate] of [
  ["digest", r => {r.actor = "changed-without-rehash";}],
  ["actor", (r, h) => {r.actor = ""; h(r);}],
  ["receipt", (r, h) => {r.evidenceRef = ""; h(r);}],
  ["date", (r, h) => {r.activatedAt = "bad"; h(r);}],
  ["identity", (r, h) => {r.resourceId = "other"; h(r);}]
]) test(`invalid activation ${label} is refused`, async t => {
  const f = await fixture(t); f.change("policy", true, r => mutate(r, f.rehash)); assert.throws(f.read);
});
test("unknown slots, kinds, traversal and cross-scope reads fail without creating directories", async t => {
  const f = await fixture(t), store = new SemanticRuntimeSourceStore(f.configuration.dataRoot);
  assert.throws(() => f.reader.read({...f.refs, extra: f.refs.policy}, f.scope), {code: "INVALID"});
  assert.throws(() => store.readGovernedResource(f.scope, "SecretRef", "private"), {code: "INVALID"});
  assert.throws(() => store.readGovernedResource(f.scope, "PolicyPack", "../policy"), {code: "INVALID"});
  assert.throws(() => f.reader.read(f.refs, {...f.scope, workspaceId: "foreign"}), {code: "UNAVAILABLE"});
  assert(!fs.existsSync(path.join(f.configuration.dataRoot, "governed-evolution-resources", f.scope.tenantId, "foreign")));
});
test("source read rejects intermediate-directory symlinks as well as hardlinked resource files", async t => {
  const f = await fixture(t), file = f.file("policy"), dir = path.dirname(file), moved = dir + "-moved";
  fs.renameSync(dir, moved); fs.symlinkSync(moved, dir); assert.throws(f.read, {code: "PATH_DENIED"});
  fs.unlinkSync(dir); fs.renameSync(moved, dir);
  const hard = file + ".link"; fs.linkSync(file, hard); assert.throws(f.read, {code: "PATH_DENIED"});
});
test("permissions and other mandatory owners are not repaired by reading governance metadata", async t => {
  const f = await fixture(t); f.state.permissions.allowedEffects = [];
  await assert.rejects(f.bind(), {code: "PERMISSION_DENIED"});
  f.access.principal.role = "viewer"; assert.throws(() => f.currentExecution(f.identity), {code: "PERMISSION_DENIED"});
});
test("effective-principal changes inside another owner read are detected", async t => {
  const f = await fixture(t);
  const current = withSemanticGovernedSources(f.configuration.dataRoot, {currentAccess: f.input.currentAccess, currentRefs: () => f.refs,
    currentExecution: () => {f.access.principal.role = "viewer"; return f.state;}});
  assert.throws(() => current(f.identity), {code: "PERMISSION_DENIED"});
});
test("resource mutation between observations is rejected before returning source pins", async t => {
  const f = await fixture(t), original = SemanticRuntimeSourceStore.prototype.readGovernedResource;
  let changed = false;
  SemanticRuntimeSourceStore.prototype.readGovernedResource = function(scope, kind, id, version) {
    const result = original.call(this, scope, kind, id, version);
    if (!changed && kind === "GovernancePack" && version) {
      changed = true; f.change("policy", true, active => {active.actor = "changed"; f.rehash(active);});
    }
    return result;
  };
  try {assert.throws(f.read, {code: "DRIFT"});} finally {SemanticRuntimeSourceStore.prototype.readGovernedResource = original;}
});
test("missing or inconsistent source pins cannot be used to replace independently checked Harness state", async t => {
  const f = await fixture(t), state = structuredClone(f.currentExecution(f.identity));
  state.governedSourcePins.resources.policy.digest = d("unrelated");
  const execution = createSemanticExecutionBindingService(f.configuration, {...f.owners, currentExecution: () => state});
  await assert.rejects(execution.bind(f.identity, f.input), {code: "DRIFT"});
});
