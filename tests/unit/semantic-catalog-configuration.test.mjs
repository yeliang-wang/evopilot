import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import {fixture, rejectsCode, contentPath, delay} from "../helpers/semantic-catalog-fixture.mjs";
import {digestObject} from "../../packages/server/dist/domains/harness-template/utils.js";
import {readConfiguredSemanticCatalog, loadSemanticRegistry} from "../../packages/server/dist/domains/harness-template/semantic-catalog-configuration.js";
import {createSemanticOperation} from "../../packages/server/dist/domains/harness-template/semantic-catalog-io.js";
import {resolveSemanticLimits} from "../../packages/server/dist/domains/harness-template/semantic-catalog-contract.js";

async function configured(t) {
  const f = await fixture(t);
  const assetPublication = {decision: "AUTHORIZED", actor: "asset-publisher", authorizationDigest: digestObject("asset-authority")};
  await f.publish(g => {g.entries[0].publication = assetPublication;});
  const receipt = JSON.parse(await fs.readFile(path.join(f.root, contentPath("receipts", f.pointer().receiptDigest)), "utf8"));
  const {catalogId, generationDigest, expectedHead, action, requestDigest} = receipt;
  const registry = {schema: "evopilot-harness-registry/v2", catalogs: [{id: "synthetic", enabled: true, root: "."}]};
  const policy = {schema: "evopilot-harness-semantic-catalog-policy/v1", catalogs: [{id: "synthetic", permission: "GRANTED", trustContext: "test-trust",
    rootBindingDigest: digestObject({id: "synthetic", root: "."}), scopes: [{scope: f.entry.scope, visibilities: ["PRIVATE"]}],
    grants: [
      {...assetPublication, subjectDigest: f.entry.objectDigest, purpose: "ASSET_PUBLICATION", revoked: false, expiresAt: null},
      {...receipt.authorization, subjectDigest: digestObject({catalogId, generationDigest, expectedHead, action, requestDigest}),
        purpose: "CATALOG_PUBLICATION", revoked: false, expiresAt: null}
    ]}]};
  const subject = {scope: {...f.entry.scope}, role: "viewer", active: true};
  const input = {registryConfigPath: path.join(f.root, "harness-registry.yaml"), policyPath: path.join(f.root, "policy.json"), catalogId: "synthetic",
    currentSubject: () => subject, validateMaterials: f.policy.validateMaterials};
  async function save() {await f.write("harness-registry.yaml", registry); await f.write("policy.json", policy);}
  await save();
  return {...f, registry, policy, subject, input, save, read: overrides => readConfiguredSemanticCatalog({...input, ...overrides})};
}
test("configured reader binds Registry, independent policy, current subject and unchanged Catalog bytes", async t => {
  const f = await configured(t), result = await f.read();
  assert.equal(result.materials.size, 1); assert.equal(result.trustContext, "test-trust");
  assert.match(result.policyDigest, /^sha256:/); assert.match(result.registryDigest, /^sha256:/);
  assert(Object.isFrozen(result.limits)); assert.equal(result.limits.enabledRoots, 16);
});
test("inactive/invalid Runtime subject is denied before config files are opened", async t => {
  const f = await configured(t); f.subject.active = false;
  await rejectsCode(() => f.read({registryConfigPath: path.join(f.root, "missing")}), "PERMISSION_DENIED");
  f.subject.active = true; f.subject.role = "owner";
  await rejectsCode(() => f.read(), "PERMISSION_DENIED");
});
test("Registry v1 and relative/absolute roots preserve explicit configuration semantics", async t => {
  const f = await configured(t); f.registry.schema = "evopilot-harness-registry/v1";
  f.registry.catalogs[0].root = f.root;
  f.policy.catalogs[0].rootBindingDigest = digestObject({id: "synthetic", root: f.root});
  await f.save(); assert.equal((await f.read()).catalogId, "synthetic");
});
test("unknown, disabled or empty configured Registry has no legacy fallback", async t => {
  for (const catalogs of [[], [{id: "synthetic", root: ".", enabled: false}]]) {
    const f = await configured(t); f.registry.catalogs = catalogs; await f.save();
    await rejectsCode(() => f.read(), "UNAVAILABLE");
  }
});
test("YAML duplicates, aliases, unknown tags and nested abuse fail closed", async t => {
  const f = await configured(t);
  for (const raw of ["schema: a\nschema: b\n", "schema: evopilot-harness-registry/v2\ncatalogs: &x [*x]\n", "schema: !unsafe evopilot-harness-registry/v2\n"]) {
    await fs.writeFile(f.input.registryConfigPath, raw);
    await rejectsCode(() => f.read(), "INVALID");
  }
  await fs.writeFile(f.input.registryConfigPath, "[".repeat(80) + "0" + "]".repeat(80));
  await rejectsCode(() => f.read(), "DEPTH_LIMIT");
});
test("Registry root URLs, sanitized identity collisions and embedded entries are rejected", async t => {
  for (const [edit, code] of [
    [r => r.catalogs[0].root = "https://example.invalid/catalog", "PATH_DENIED"],
    [r => r.catalogs[0].id = "synthetic/escape", "IDENTITY_CONFLICT"],
    [r => r.entries = [], "INVALID"], [r => r.catalogs[0].assets = [], "INVALID"],
    [r => r.catalogs[0].enabled = "false", "INVALID"],
    [r => r.catalogs.push({...r.catalogs[0], enabled: false}), "IDENTITY_CONFLICT"]
  ]) {const f = await configured(t); edit(f.registry); await f.save(); await rejectsCode(() => f.read(), code);}
});
test("Registry configured-file symlinks, hardlinks and oversized files are rejected", async t => {
  for (const kind of ["symlink", "hardlink", "size"]) {
    const f = await configured(t);
    if (kind === "size") {await rejectsCode(() => f.read({limits: {generationBytes: 1}}), "FILE_LIMIT"); continue;}
    const other = path.join(f.root, "other-registry"); await fs.rename(f.input.registryConfigPath, other);
    if (kind === "symlink") await fs.symlink(other, f.input.registryConfigPath); else await fs.link(other, f.input.registryConfigPath);
    await rejectsCode(() => f.read(), "PATH_DENIED");
  }
});
test("independent Catalog and asset grants must both be exact, current and non-revoked", async t => {
  for (const [field, value] of [["revoked", true], ["expiresAt", "2000-01-01T00:00:00Z"], ["actor", "other"],
    ["authorizationDigest", digestObject("wrong")], ["subjectDigest", digestObject("wrong")], ["purpose", "CATALOG_RECOVERY"]]) {
    for (const grant of [0, 1]) {
      const f = await configured(t); f.policy.catalogs[0].grants[grant][field] = value; await f.save();
      await rejectsCode(() => f.read(), "PERMISSION_DENIED");
    }
  }
});
test("duplicate active/revoked grants cannot use an allow-wins ambiguity", async t => {
  const f = await configured(t); f.policy.catalogs[0].grants.push({...f.policy.catalogs[0].grants[0], revoked: true}); await f.save();
  await rejectsCode(() => f.read(), "IDENTITY_CONFLICT");
});
test("root-binding mismatch and PRIVATE visibility absence deny access", async t => {
  for (const mutate of [r => r.rootBindingDigest = digestObject("wrong"), r => r.scopes[0].visibilities = ["PUBLIC"], r => r.permission = "DENIED"]) {
    const f = await configured(t); mutate(f.policy.catalogs[0]); await f.save(); await rejectsCode(() => f.read(), "PERMISSION_DENIED");
  }
});
test("PUBLIC visibility is not a cross-project or cross-tenant access grant", async t => {
  const f = await configured(t); f.subject.scope.projectId = "other-project";
  f.policy.catalogs[0].scopes.push({scope: f.subject.scope, visibilities: ["PRIVATE", "PUBLIC"]}); await f.save();
  await rejectsCode(() => f.read(), "PERMISSION_DENIED");
});
test("known asset kinds cannot bypass asset-publication authority by changing category", async t => {
  const f = await configured(t);
  await f.publish(g => g.entries[0].category = "DEPENDENCY");
  const receipt = JSON.parse(await fs.readFile(path.join(f.root, contentPath("receipts", f.pointer().receiptDigest)), "utf8"));
  const {catalogId, generationDigest, expectedHead, action, requestDigest} = receipt;
  f.policy.catalogs[0].grants[1].subjectDigest = digestObject({catalogId, generationDigest, expectedHead, action, requestDigest});
  f.policy.catalogs[0].grants[0].revoked = true; await f.save();
  await rejectsCode(() => f.read(), "PERMISSION_DENIED");
});
test("Registry and trust-context drift during validation never return a snapshot", async t => {
  for (const mutate of [f => f.registry.catalogs[0].enabled = false, f => f.policy.catalogs[0].trustContext = "different"]) {
    const f = await configured(t);
    await rejectsCode(() => f.read({validateMaterials: async () => {mutate(f); await f.save(); return true;}}), "DRIFT");
  }
});
test("on-disk policy revocation and subject suspension are read back before success", async t => {
  for (const mutate of [f => f.policy.catalogs[0].grants[0].revoked = true, f => f.subject.active = false]) {
    const f = await configured(t);
    await rejectsCode(() => f.read({validateMaterials: async () => {mutate(f); await f.save(); return true;}}), "PERMISSION_DENIED");
  }
});
test("Registry/current-subject lookup and material checks share one deadline", async t => {
  const f = await configured(t);
  await rejectsCode(() => f.read({limits: {readTimeoutMilliseconds: 55}, currentSubject: async () => {await delay(35); return f.subject;}}), "TIMEOUT");
});
test("missing domain validator and malformed policy cannot grant eligibility", async t => {
  const f = await configured(t);
  await rejectsCode(() => f.read({validateMaterials: undefined}), "TRUST_REQUIRED");
  f.policy.catalogs[0].grants[0].expiresAt = "not-a-time"; await f.save();
  await rejectsCode(() => f.read(), "TRUST_REQUIRED");
});
test("Registry loader enforces exact enabled-root ceiling before root traversal", async t => {
  const f = await configured(t);
  const limits = resolveSemanticLimits(), operation = createSemanticOperation(limits);
  try {
    f.registry.catalogs = Array.from({length: 16}, (_, i) => ({id: `root-${i}`, root: `./missing-${i}`}));
    await f.save(); assert.equal((await loadSemanticRegistry(f.input.registryConfigPath, limits, operation)).catalogs.length, 16);
    f.registry.catalogs.push({id: "root-16", root: "./missing-16"}); await f.save();
    await rejectsCode(() => loadSemanticRegistry(f.input.registryConfigPath, limits, operation), "ENTRY_LIMIT");
  } finally {operation.close();}
});
