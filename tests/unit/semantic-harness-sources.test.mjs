import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {canonicalDigest as d} from "../../packages/core/dist/index.js";
import {semanticExecutionFixture} from "../helpers/semantic-execution-fixture.mjs";
import {seedSemanticRuntimeRecords} from "../helpers/semantic-runtime-records.mjs";
import {createSemanticHarnessSourceReader} from "../../packages/server/dist/application/semantic-harness-sources.js";

async function fixture(t, options = {}) {
  const f = await semanticExecutionFixture(t, {pending: true, publishedMaterials: true, ...options});
  const {store} = seedSemanticRuntimeRecords(f);
  const input = {identity: f.identity, runId: f.run.id, requestDigest: f.run.pendingExecution.requestDigest,
    goalTarget: f.state.goalTarget, currentAccess: f.input.currentAccess};
  const owners = {lifecycle: f.lifecycleService}, reader = createSemanticHarnessSourceReader(f.configuration, owners);
  const root = f.configuration.dataRoot, scope = [f.scope.tenantId, f.scope.workspaceId];
  const bindingFile = path.join(root, "harness-execution-bindings", ...scope, f.identity.harnessBindingDigest.slice(7) + ".json");
  const definitionFile = path.join(root, "evolution-project-definitions", ...scope, f.scope.projectId + "--1.0.0.json");
  return {...f, input, owners, reader, store, bindingFile, definitionFile, read: () => reader.read(input)};
}
function inventory(root) {
  return fs.readdirSync(root, {withFileTypes: true}).flatMap(e => {
    const file = path.join(root, e.name); return e.isDirectory() ? inventory(file) : [[file, d(fs.readFileSync(file).toString("base64"))]];
  }).sort((a, b) => a[0].localeCompare(b[0]));
}
test("current Harness material is recomputed from actual Catalog closure, scoped definition and persisted revision without writes", async t => {
  const f = await fixture(t), before = inventory(f.root), result = await f.read();
  assert.equal(result.status, "MATERIAL_REVALIDATED_NOT_EXECUTION_AUTHORIZED"); assert.equal(result.eligibleForExecution, false);
  for (const [key, value] of Object.entries(result.material)) assert.deepEqual(value, f.state.harness[key]);
  assert.equal(result.material.compositionDigest, f.plan.composition.digest);
  assert(f.plan.composition.validators.length > 0); assert(f.plan.composition.requiredEvidence.length > 0);
  for (const key of ["policyDigest", "runtimeDigest", "hostDigest", "authorityDigest", "permissions"]) assert.equal(Object.hasOwn(result.material, key), false);
  assert.deepEqual(inventory(f.root), before);
  assert.deepEqual(await createSemanticHarnessSourceReader(f.configuration, f.owners).read(f.input), result);
  assert(Object.isFrozen(result.material.bundles)); assert(Object.isFrozen(result.authority));
});
test("self-consistent historical metadata is not evidence of current Catalog or composition", async t => {
  const f = await fixture(t, {publishedMaterials: false}); await assert.rejects(f.read(), {code: "DRIFT"});
});
for (const [name, change] of [
  ["Goal objective", f => {f.input.goalTarget = {...f.input.goalTarget, objective: "changed"};}],
  ["identity", f => {f.input.identity = {...f.identity, targetId: "other"};}],
  ["run", f => {f.input.runId = "other";}],
  ["request digest", f => {f.input.requestDigest = "sha256:" + "0".repeat(64);}],
  ["viewer", f => {f.access.principal.role = "viewer";}],
  ["tenant", f => {f.access.principal.tenantId = "other";}],
  ["missing binding", f => {fs.unlinkSync(f.bindingFile);}],
  ["missing pinned project version", f => {fs.unlinkSync(f.definitionFile);}],
  ["binding digest", f => {const v = JSON.parse(fs.readFileSync(f.bindingFile)); v.catalogDigest = "sha256:" + "0".repeat(64); fs.writeFileSync(f.bindingFile, JSON.stringify(v));}],
  ["project definition digest", f => {const v = JSON.parse(fs.readFileSync(f.definitionFile)); v.spec.source.repository = "changed"; fs.writeFileSync(f.definitionFile, JSON.stringify(v));}]
]) test(`current material refuses ${name} drift or absence`, async t => {
  const f = await fixture(t); change(f); await assert.rejects(f.read());
});
test("missing project version never falls back to a later registered definition", async t => {
  const f = await fixture(t), old = JSON.parse(fs.readFileSync(f.definitionFile));
  f.governed.registerProjectDefinition({...old, digest: undefined, metadata: {...old.metadata, version: "2.0.0"}}, f.scope);
  fs.unlinkSync(f.definitionFile); await assert.rejects(f.read(), {code: "UNAVAILABLE"});
});
test("new project activation cannot silently replace a running pinned definition", async t => {
  const f = await fixture(t), expected = await f.read(), old = JSON.parse(fs.readFileSync(f.definitionFile));
  f.governed.registerProjectDefinition({...old, digest: undefined, metadata: {...old.metadata, version: "2.0.0"}}, f.scope);
  f.governed.activateProjectDefinitionVersion(f.scope.projectId, "2.0.0", "synthetic", "synthetic://decision", f.scope);
  assert.deepEqual(await f.read(), expected);
});
for (const name of ["disabled registry", "policy revoked", "missing legacy bytes", "changed Catalog index"]) test(`actual published source refuses ${name}`, async t => {
  const f = await fixture(t);
  if (name === "disabled registry") {f.registry.catalogs[0].enabled = false; await f.write("registry.yaml", f.registry);}
  if (name === "policy revoked") {f.policy.catalogs[0].permission = "DENIED"; await f.write("policy.json", f.policy);}
  if (name === "missing legacy bytes") fs.unlinkSync(path.join(f.root, f.generation.sets[0].refs.harnessAssets[0].entry.assetPath));
  if (name === "changed Catalog index") fs.appendFileSync(path.join(f.root, "CATALOG.md"), "\nchanged");
  await assert.rejects(f.read());
});
test("Registry formatting drift cannot reuse a previously bound registry digest", async t => {
  const f = await fixture(t); await f.read(); fs.appendFileSync(f.configuration.registryConfigPath, "\n");
  await assert.rejects(f.read(), {code: "DRIFT"});
});
test("cancellation and owner revocation during Catalog I/O are rechecked", async t => {
  const f = await fixture(t), abort = new AbortController(); abort.abort();
  await assert.rejects(f.reader.read({...f.input, signal: abort.signal}), {code: "CANCELLED"});
  const pending = f.read(); f.access.principal.role = "viewer"; await assert.rejects(pending);
});
test("project definition changed during Catalog I/O cannot produce a valid current snapshot", async t => {
  const f = await fixture(t), pending = f.read(); fs.unlinkSync(f.definitionFile);
  await assert.rejects(pending, {code: "UNAVAILABLE"});
});
for (const mode of ["symlink", "hardlink"]) test(`strict source refuses ${mode} binding files`, async t => {
  const f = await fixture(t), saved = path.join(f.root, "saved-binding.json"); fs.renameSync(f.bindingFile, saved);
  if (mode === "symlink") fs.symlinkSync(saved, f.bindingFile); else fs.linkSync(saved, f.bindingFile);
  await assert.rejects(f.read());
});
test("missing configured trust paths do not fall back to a Catalog scan or legacy environment", async t => {
  const f = await fixture(t);
  await assert.rejects(createSemanticHarnessSourceReader({dataRoot: f.configuration.dataRoot}, f.owners).read(f.input), {code: "TRUST_REQUIRED"});
});
test("pending revision read is exact, isolated and rejects a mismatched request", async t => {
  const f = await fixture(t), scope = {...f.scope, goalId: f.identity.goalId, targetId: f.identity.targetId};
  const revision = f.lifecycleService.readPendingRevision(f.run.id, f.input.requestDigest, scope);
  revision.definition.stages = [];
  assert(f.lifecycleService.readPendingRevision(f.run.id, f.input.requestDigest, scope).definition.stages.length > 0);
  assert.throws(() => f.lifecycleService.readPendingRevision(f.run.id, "sha256:" + "0".repeat(64), scope));
});
