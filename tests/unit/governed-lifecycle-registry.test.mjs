import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FileLifecycleCatalog, GovernedLifecycleRegistry, LifecycleActionRegistry } from "../../packages/server/dist/domains/lifecycle/index.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const lifecycleRoot = path.join(repositoryRoot, "lifecycles");
const scopeA = { tenantId: "tenant-a", workspaceId: "workspace-a" };
const scopeB = { tenantId: "tenant-b", workspaceId: "workspace-a" };

function yaml(id, version, name = "Custom delivery") {
  return `
schema: evopilot-lifecycle-definition/v1alpha1
metadata:
  id: ${id}
  name: ${name}
  version: ${version}
  labels: { class: custom }
capabilities: [project.read]
stages:
  - id: validate
    name: Validate project
    action: { uses: project.validate@1, with: { strict: true } }
    decision: { mode: AUTO }
`;
}

function registry(dataRoot) {
  const actions = new LifecycleActionRegistry();
  return new GovernedLifecycleRegistry(dataRoot, new FileLifecycleCatalog([lifecycleRoot], actions), actions);
}

test("persists tenant-scoped immutable Lifecycle revisions and imports bootstrap fixtures once", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-lifecycle-registry-"));
  const first = registry(dataRoot);
  assert.ok(first.list(scopeA).some((item) => item.id === "evopilot-oss" && item.active));
  const record = first.register({ yaml: yaml("unknown-project", "1.0.0"), actor: "owner", evidenceRef: "decision:create" }, scopeA);
  assert.equal(record.sourceType, "PROJECT");
  assert.throws(() => first.register({ yaml: yaml("unknown-project", "1.0.0", "Changed"), actor: "owner", evidenceRef: "decision:update" }, scopeA), /IMMUTABLE_CONFLICT/);
  assert.equal(first.list(scopeB).some((item) => item.id === "unknown-project"), false);
  const restarted = registry(dataRoot);
  assert.equal(restarted.inspect("unknown-project", "1.0.0", scopeA).revisionDigest, record.revisionDigest);
  assert.equal(restarted.audit("unknown-project", scopeA).filter((item) => item.action === "REGISTER").length, 1);
});

test("updates by successor, changes only the future active pointer, and rolls back without rewriting history", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-lifecycle-successor-"));
  const store = registry(dataRoot);
  const v1 = store.register({ yaml: yaml("third-party", "1.0.0"), actor: "owner", evidenceRef: "decision:create" }, scopeA);
  const firstPointer = store.activate(v1.id, v1.version, { actor: "owner", evidenceRef: "decision:activate" }, scopeA);
  assert.equal(store.activate(v1.id, v1.version, { actor: "owner", evidenceRef: "decision:activate" }, scopeA).digest, firstPointer.digest);
  const v11 = store.register({ yaml: yaml("third-party", "1.1.0", "Custom delivery successor"), actor: "owner", evidenceRef: "decision:update" }, scopeA);
  const semantic = store.diff(v1.id, v1.version, v11.version, scopeA);
  assert.equal(semantic.runningBindingsAffected, false);
  assert.equal(semantic.futurePlanningAffected, true);
  assert.ok(semantic.changes.some((item) => item.path === "$.metadata.name"));
  assert.throws(() => store.activate(v11.id, v11.version, { actor: "owner", evidenceRef: "decision:activate-successor" }, scopeA), /EXPECTED_ACTIVE_DIGEST_REQUIRED/);
  const successorPointer = store.activate(v11.id, v11.version, { expectedActiveDigest: firstPointer.revisionDigest, actor: "owner", evidenceRef: "decision:activate-successor" }, scopeA);
  assert.equal(store.resolveActive(v11.id, undefined, scopeA).digest, v11.revisionDigest);
  assert.equal(store.resolveExact(v1.id, v1.version, v1.revisionDigest, scopeA).digest, v1.revisionDigest);
  const rollback = store.activate(v1.id, v1.version, { expectedActiveDigest: successorPointer.revisionDigest, actor: "owner", evidenceRef: "decision:rollback", rollback: true }, scopeA);
  assert.equal(rollback.action, "ROLLBACK");
  assert.equal(store.resolveActive(v1.id, undefined, scopeA).digest, v1.revisionDigest);
  assert.equal(store.audit(v1.id, scopeA).filter((item) => item.action === "ROLLBACK").length, 1);
});

test("preserves referential integrity across usage, archive, restore, deactivation, and restricted draft deletion", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-lifecycle-integrity-"));
  const store = registry(dataRoot);
  const v1 = store.register({ yaml: yaml("managed", "1.0.0"), actor: "owner", evidenceRef: "decision:create" }, scopeA);
  const active = store.activate(v1.id, v1.version, { actor: "owner", evidenceRef: "decision:activate" }, scopeA);
  store.recordUsage({ id: "plan-1", lifecycleId: v1.id, version: v1.version, revisionDigest: v1.revisionDigest, usageType: "PLAN", objectId: "plan-1", bindingDigest: "sha256:" + "a".repeat(64) }, scopeA);
  assert.throws(() => store.archive(v1.id, v1.version, { revisionDigest: v1.revisionDigest, actor: "owner", evidenceRef: "decision:archive" }, scopeA), /ACTIVE_REVISION_ARCHIVE_FORBIDDEN/);
  const inactive = store.deactivate(v1.id, { expectedActiveDigest: active.revisionDigest, actor: "owner", evidenceRef: "decision:deactivate" }, scopeA);
  assert.equal(store.deactivate(v1.id, { expectedActiveDigest: active.revisionDigest, actor: "owner", evidenceRef: "decision:deactivate" }, scopeA).digest, inactive.digest);
  assert.throws(() => store.resolveActive(v1.id, undefined, scopeA), /NOT_ACTIVE/);
  const archived = store.archive(v1.id, v1.version, { revisionDigest: v1.revisionDigest, actor: "owner", evidenceRef: "decision:archive" }, scopeA);
  assert.equal(store.archive(v1.id, v1.version, { revisionDigest: v1.revisionDigest, actor: "owner", evidenceRef: "decision:archive" }, scopeA).digest, archived.digest);
  assert.equal(store.inspect(v1.id, v1.version, scopeA).state.status, "ARCHIVED");
  assert.equal(store.inspect(v1.id, v1.version, scopeA).state.tombstone, true);
  const restored = store.restore(v1.id, v1.version, { revisionDigest: v1.revisionDigest, actor: "owner", evidenceRef: "decision:restore" }, scopeA);
  assert.equal(store.restore(v1.id, v1.version, { revisionDigest: v1.revisionDigest, actor: "owner", evidenceRef: "decision:restore" }, scopeA).digest, restored.digest);
  assert.equal(store.inspect(v1.id, v1.version, scopeA).state.status, "INACTIVE");
  assert.throws(() => store.deleteUnreferencedDraft(v1.id, v1.version, { revisionDigest: v1.revisionDigest, actor: "owner", evidenceRef: "decision:delete" }, scopeA), /UNREFERENCED_DRAFT/);
  const draft = store.register({ yaml: yaml("temporary", "1.0.0"), actor: "owner", evidenceRef: "decision:create-draft" }, scopeA);
  store.deleteUnreferencedDraft(draft.id, draft.version, { revisionDigest: draft.revisionDigest, actor: "owner", evidenceRef: "decision:delete-draft" }, scopeA);
  assert.throws(() => store.inspect(draft.id, draft.version, scopeA), /LIFECYCLE_NOT_FOUND/);
});
