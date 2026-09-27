import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { readSemanticCatalogSnapshot } from "../../packages/server/dist/domains/harness-template/semantic-catalog-reader.js";
import { semanticCatalogLimits, resolveSemanticLimits } from "../../packages/server/dist/domains/harness-template/semantic-catalog-contract.js";
import { canonicalJson, digestObject } from "../../packages/server/dist/domains/harness-template/utils.js";

import { fixture, rejectsCode, signed, contentPath, delay } from "../helpers/semantic-catalog-fixture.mjs";

test("read-only transport verifies an immutable snapshot with an embedded Skill", async t => {
  const f = await fixture(t);
  const before = await fs.readFile(path.join(f.root, "SEMANTIC-CATALOG.json"));
  const result = await f.read();
  assert.equal(result.attempts, 1); assert.equal(result.materials.size, 1);
  assert.equal(result.generation.entries.length, 2); assert.equal(result.registryDigest, f.input.registry.registryDigest);
  assert(Object.isFrozen(result.generation.entries[0].scope));
  assert.deepEqual(await fs.readFile(path.join(f.root, "SEMANTIC-CATALOG.json")), before);
});
test("unconfigured or disabled roots are unavailable without touching disk", async t => {
  const f = await fixture(t); let calls = 0; f.policy.permitCatalog = () => {calls++; return true;};
  await rejectsCode(() => f.read({catalogId: "not-configured"}), "UNAVAILABLE");
  f.input.registry.catalogs[0].enabled = false;
  await rejectsCode(() => f.read(), "UNAVAILABLE"); assert.equal(calls, 0);
});
test("duplicate configured identities and enabled-root budget fail closed", async t => {
  const f = await fixture(t); f.input.registry.catalogs.push({...f.input.registry.catalogs[0]});
  await rejectsCode(() => f.read(), "IDENTITY_CONFLICT");
  await rejectsCode(() => f.read({limits: {enabledRoots: 1}}), "ENTRY_LIMIT");
});
test("budgets only reduce approved integer ceilings", () => {
  assert.deepEqual(resolveSemanticLimits(), semanticCatalogLimits);
  for (const key of Object.keys(semanticCatalogLimits)) {
    assert.throws(() => resolveSemanticLimits({[key]: semanticCatalogLimits[key] + 1}), {code: "BUDGET_INVALID"});
    assert.throws(() => resolveSemanticLimits({[key]: 1.5}), {code: "BUDGET_INVALID"});
  }
  assert.throws(() => resolveSemanticLimits({untrusted: 1}), {code: "BUDGET_INVALID"});
  assert.equal(resolveSemanticLimits({snapshotRetryCount: 0}).snapshotRetryCount, 0);
});
test("missing trusted material validator never defaults to approval", async t => {
  const f = await fixture(t); delete f.policy.validateMaterials;
  await rejectsCode(() => f.read(), "TRUST_REQUIRED");
});
test("catalog permission checked before opening even a missing root", async t => {
  const f = await fixture(t); f.input.registry.catalogs[0].root = path.join(f.root, "absent"); f.policy.permitCatalog = () => false;
  await rejectsCode(() => f.read(), "PERMISSION_DENIED");
});
test("publication AUTHORIZED bytes do not grant independent authority", async t => {
  const f = await fixture(t); f.policy.authorizePublication = () => false;
  await rejectsCode(() => f.read(), "PERMISSION_DENIED");
});
test("all entries require permission before reading shared private material", async t => {
  const f = await fixture(t); await fs.unlink(path.join(f.root, f.entry.path));
  f.policy.permitEntry = (_catalog, entry) => entry.kind !== "ProjectOntologySkill";
  await rejectsCode(() => f.read(), "PERMISSION_DENIED");
});
test("permission revoked during validation is rechecked before returning", async t => {
  const f = await fixture(t); f.policy.validateMaterials = () => {f.policy.permitEntry = () => false; return true;};
  await rejectsCode(() => f.read(), "PERMISSION_DENIED");
});
test("actual domain validation is mandatory even for digest-valid materials", async t => {
  const f = await fixture(t); f.policy.validateMaterials = () => false;
  await rejectsCode(() => f.read(), "MATERIAL_INVALID");
});
test("unknown pointer schemas and fields are rejected", async t => {
  const f = await fixture(t);
  await f.write("SEMANTIC-CATALOG.json", signed({...f.pointer(), schema: "unknown/v9"}, "pointerDigest"));
  await rejectsCode(() => f.read(), "UNSUPPORTED");
  await f.write("SEMANTIC-CATALOG.json", signed({...f.pointer(), execute: "never"}, "pointerDigest"));
  await rejectsCode(() => f.read(), "INVALID");
});
test("pointer traversal/URL paths cannot open materials outside the root", async t => {
  const f = await fixture(t);
  for (const generationPath of ["../secret", "/tmp/secret", "https://example.invalid/secret"]) {
    await f.write("SEMANTIC-CATALOG.json", signed({...f.pointer(), generationPath}, "pointerDigest"));
    await rejectsCode(() => f.read(), "PATH_DENIED");
  }
});
test("pointer, generation, receipt and body tampering are detected", async t => {
  for (const surface of ["pointer", "generation", "receipt", "body"]) {
    const f = await fixture(t);
    if (surface === "pointer") await f.write("SEMANTIC-CATALOG.json", {...f.pointer(), catalogId: "tampered"});
    if (surface === "generation") await f.write(f.pointer().generationPath, {...f.generation(), catalogId: "tampered"});
    if (surface === "receipt") {
      const relative = contentPath("receipts", f.pointer().receiptDigest);
      const receipt = JSON.parse(await fs.readFile(path.join(f.root, relative), "utf8"));
      await f.write(relative, {...receipt, action: "REVOKE"});
    }
    if (surface === "body") await f.write(f.entry.path, Buffer.from(f.bodyBytes.toString().replace("authority", "authOrity")));
    await rejectsCode(() => f.read(), "DIGEST_MISMATCH");
  }
});
test("file size is bounded by declared bytes before material body allocation", async t => {
  const f = await fixture(t); await f.write(f.entry.path, Buffer.concat([f.bodyBytes, Buffer.from(" ")]));
  await rejectsCode(() => f.read(), "FILE_LIMIT");
});
test("pointer, generation, material and aggregate budgets are enforced", async t => {
  const f = await fixture(t);
  for (const [limits, code] of [[{pointerBytes: 1}, "FILE_LIMIT"], [{generationBytes: 1}, "FILE_LIMIT"],
    [{materialBytes: f.entry.bytes - 1}, "MATERIAL_LIMIT"], [{totalMaterialBytes: f.entry.bytes - 1}, "TOTAL_MATERIAL_LIMIT"],
    [{entries: 1}, "ENTRY_LIMIT"], [{dependencyDepth: 1}, "DEPTH_LIMIT"]]) await rejectsCode(() => f.read({limits}), code);
  assert.equal((await f.read({limits: {materialBytes: f.entry.bytes, totalMaterialBytes: f.entry.bytes}})).materials.size, 1);
});
test("symlink files, symlink directories and hardlinks are denied", async t => {
  for (const kind of ["file", "directory", "hardlink"]) {
    const f = await fixture(t); const original = path.join(f.root, f.entry.path);
    if (kind === "directory") {
      const directory = path.dirname(original), moved = path.join(f.root, "elsewhere");
      await fs.rename(directory, moved); await fs.symlink(moved, directory);
    } else {
      const other = path.join(f.root, "other.json"); await fs.rename(original, other);
      if (kind === "file") await fs.symlink(other, original); else await fs.link(other, original);
    }
    await rejectsCode(() => f.read(), "PATH_DENIED");
  }
});
test("missing material is explicit unavailable without network or producer fallback", async t => {
  const f = await fixture(t); await fs.unlink(path.join(f.root, f.entry.path));
  await rejectsCode(() => f.read(), "UNAVAILABLE");
});
test("identity conflicts, missing dependencies, cycles, revocation and parent mismatch fail closed", async t => {
  const cases = [
    [g => g.entries.push({...g.entries[0]}), "IDENTITY_CONFLICT"],
    [g => g.entries[1].dependencies.push(digestObject("absent")), "MATERIAL_MISSING"],
    [g => g.entries[0].dependencies.push(g.entries[1].objectDigest), "DEPENDENCY_CYCLE"],
    [g => g.revokedDigests.push(g.entries[0].objectDigest), "REVOKED"],
    [g => g.entries[1].parent.artifactSetDigest = digestObject("wrong"), "PARENT_INVALID"],
    [g => g.entries[1].scope = {...g.entries[1].scope, tenantId: "other"}, "MATERIAL_MISSING"]
  ];
  for (const [mutate, code] of cases) {const f = await fixture(t); await f.publish(mutate); await rejectsCode(() => f.read(), code);}
});
test("receipt cannot be rebound to a different previous pointer", async t => {
  const f = await fixture(t); await f.publish(() => {}, null, r => r.expectedHead = digestObject("wrong-head"));
  await rejectsCode(() => f.read(), "DIGEST_MISMATCH");
});
test("head drift retries a whole snapshot, never mixes generations", async t => {
  const f = await fixture(t); let calls = 0;
  f.policy.validateMaterials = async () => {
    if (++calls === 1) await f.publish(g => g.entries[0].provenance.revision = 2, f.pointer().pointerDigest);
    return true;
  };
  const result = await f.read(); assert.equal(result.attempts, 2); assert.equal(result.generation.entries[0].provenance.revision, 2);
});
test("continually changing head exhausts exactly the finite retry allowance", async t => {
  const f = await fixture(t); let calls = 0;
  f.policy.validateMaterials = async () => {await f.publish(g => g.entries[0].provenance.revision = ++calls, f.pointer().pointerDigest); return true;};
  await rejectsCode(() => f.read({limits: {snapshotRetryCount: 1}}), "DRIFT"); assert.equal(calls, 2);
});
test("one deadline spans callbacks and retries; hung validator is bounded", async t => {
  const f = await fixture(t);
  f.policy.permitCatalog = async () => {await delay(35); return true;};
  f.policy.authorizePublication = async () => {await delay(35); return true;};
  await rejectsCode(() => f.read({limits: {readTimeoutMilliseconds: 60}}), "TIMEOUT");
  f.policy.permitCatalog = () => true; f.policy.authorizePublication = () => true;
  f.policy.validateMaterials = () => new Promise(() => {});
  await rejectsCode(() => f.read({limits: {readTimeoutMilliseconds: 80}}), "TIMEOUT");
});
test("abort remains sticky and interrupts a waiting read-only callback", async t => {
  const f = await fixture(t), controller = new AbortController();
  f.policy.validateMaterials = () => {controller.abort(); return new Promise(() => {});};
  await rejectsCode(() => f.read({signal: controller.signal}), "CANCELLED");
  await rejectsCode(() => f.read({signal: controller.signal}), "CANCELLED");
});
test("untrusted exception text and deep JSON never escape as diagnostics", async t => {
  const f = await fixture(t); f.policy.validateMaterials = () => {throw new Error("secret path or credential");};
  await rejectsCode(() => f.read(), "IO_OR_VALIDATION_FAILED");
  await f.write("SEMANTIC-CATALOG.json", Buffer.from("[".repeat(65) + "0" + "]".repeat(65)));
  await rejectsCode(() => f.read(), "DEPTH_LIMIT");
});
