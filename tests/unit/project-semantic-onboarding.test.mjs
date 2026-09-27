import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {projectSemanticBindingFixture} from "../helpers/project-semantic-binding-fixture.mjs";
import {createProjectSemanticBindingService} from "../../packages/server/dist/application/project-semantic-binding.js";
import {semanticOnboardingGuidance} from "../../packages/server/dist/application/project-semantic-onboarding.js";
import {SemanticBindingStore} from "../../packages/server/dist/storage/semantic-binding-store.js";
import {digestObject as digest} from "../../packages/server/dist/domains/harness-template/utils.js";
const request = f => ({...f.input, catalogId: f.selection.catalogId});
const snapshot = async root => Object.fromEntries(await Promise.all((await fs.readdir(root, {recursive: true})).sort().map(async relative => {
  const file = path.join(root, relative); return [relative, (await fs.stat(file)).isFile() ? digest(await fs.readFile(file, "utf8")) : "directory"];
})));

test("new or legacy-unbound project receives read-only dual-binding review guidance for a minimal map", async t => {
  const f = await projectSemanticBindingFixture(t), before = await snapshot(f.root), result = await f.service.onboarding(request(f));
  assert.equal(result.status, "REVIEW_REQUIRED"); assert.equal(result.recommendedBindingMode, "DUAL_BINDING_REVIEW");
  assert.equal(result.candidates.length, 1); assert.equal(result.candidates[0].artifactSetDigest, f.selection.artifactSetDigest);
  assert.equal(result.candidates[0].bundleDigest, f.selection.bundleDigest); assert.equal(result.candidates[0].status, "COMPATIBLE");
  const bundle = Object.values(f.data.materials).find(doc => doc.kind === "HarnessBundle");
  assert.equal(result.candidates[0].bundleVersion, bundle.metadata.version); assert.equal(result.candidates[0].bundleId, bundle.metadata.id);
  assert.deepEqual(result.missingInputs, ["artifactSetDigest", "bundleDigest"]); assert.equal(result.selectedCandidate, null);
  for (const key of ["bindingCreated", "grantsExecutionAuthority", "eligibleForExecution"]) assert.equal(result[key], false);
  assert.equal(result.preservesLegacyBindings, true); assert.equal(result.businessField, null); assert.equal(result.productType, null);
  const {onboardingDigest, ...body} = result; assert.equal(onboardingDigest, digest(body)); assert(Object.isFrozen(result.candidates[0]));
  assert.deepEqual(await createProjectSemanticBindingService(f.configuration).onboarding(request(f)), result);
  assert.deepEqual(await snapshot(f.root), before);
  const text = JSON.stringify(result); for (const forbidden of [f.root, "authorizationDigest", "skillContent", "materials/"]) assert(!text.includes(forbidden));
});
test("a Bundle without declared semantics requires evidence and never upgrades a legacy project", async t => {
  const f = await projectSemanticBindingFixture(t, false), before = await snapshot(f.root), r = await f.service.onboarding(request(f));
  assert.equal(r.status, "EVIDENCE_REQUIRED"); assert.equal(r.recommendedBindingMode, "UNRESOLVED"); assert.equal(r.selectedCandidate, null);
  assert(r.candidates[0].reasons.includes("REQUIREMENTS_NOT_DECLARED")); assert.deepEqual(await snapshot(f.root), before);
});
test("onboarding preserves the existing exact binding instead of choosing another Catalog or approving a successor", async t => {
  const f = await projectSemanticBindingFixture(t), review = await f.service.prepare({...f.input, ...f.selection});
  const approved = await f.service.approve({...f.input, reviewDigest: review.reviewDigest}), before = await snapshot(f.root);
  const r = await f.service.onboarding({...request(f), catalogId: "another-catalog-not-inspected"});
  assert.equal(r.status, "EXISTING_BINDING"); assert.equal(r.recommendedBindingMode, "PRESERVE_EXISTING_BINDING");
  assert.equal(r.existingBinding.bindingDigest, approved.binding.bindingDigest); assert.equal(r.existingBinding.catalogId, f.selection.catalogId);
  assert.deepEqual(r.candidates, []); assert.equal(r.candidatesDigest, null); assert.deepEqual(r.missingInputs, []);
  assert.deepEqual(await snapshot(f.root), before);
});
for (const [label, change, code] of [
  ["foreign scope", f => {f.access.principal.workspaceId = "foreign";}, "PERMISSION_DENIED"],
  ["missing project", f => {delete f.access.project;}, "PERMISSION_DENIED"],
  ["revoked permission", async f => {f.policy.catalogs[0].permission = "DENIED"; await f.write("policy.json", f.policy);}, "PERMISSION_DENIED"],
  ["missing independent policy", async f => {await fs.unlink(f.configuration.policyPath);}, "UNAVAILABLE"]
]) test(`onboarding refuses ${label} instead of returning no-match or legacy fallback`, async t => {
  const f = await projectSemanticBindingFixture(t); await change(f);
  await assert.rejects(f.service.onboarding(request(f)), {code});
  await assert.rejects(fs.stat(path.join(f.configuration.dataRoot, "project-semantic-bindings")), {code: "ENOENT"});
});
test("revoked or stale existing binding is a failure, never classified as an unbound new project", async t => {
  const f = await projectSemanticBindingFixture(t), r = await f.service.prepare({...f.input, ...f.selection});
  await f.service.approve({...f.input, reviewDigest: r.reviewDigest});
  f.policy.catalogs[0].permission = "DENIED"; await f.write("policy.json", f.policy);
  await assert.rejects(f.service.onboarding(request(f)), {code: "PERMISSION_DENIED"});
  f.policy.catalogs[0].permission = "GRANTED"; await f.write("policy.json", f.policy); f.access.project.updatedAt = "changed";
  await assert.rejects(f.service.onboarding(request(f)), {code: "DRIFT"});
});
test("viewer can read onboarding but cancellation and project drift cannot return partial guidance", async t => {
  const f = await projectSemanticBindingFixture(t); f.access.principal.role = "viewer";
  assert.equal((await f.service.onboarding(request(f))).status, "REVIEW_REQUIRED");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.service.onboarding({...request(f), signal: controller.signal}), {code: "CANCELLED"});
  let reads = 0;
  await assert.rejects(f.service.onboarding({...request(f), currentAccess: () => {if (++reads === 3) f.access.project.updatedAt = "changed"; return f.access;}}), {code: "DRIFT"});
});
test("concurrent initial approval cannot leave a stale unbound onboarding result", async t => {
  const f = await projectSemanticBindingFixture(t), r = await f.service.prepare({...f.input, ...f.selection});
  const approved = await f.service.approve({...f.input, reviewDigest: r.reviewDigest});
  const slot = path.join(f.configuration.dataRoot, "project-semantic-bindings/projects", digest(f.scope).slice(7) + ".json");
  await fs.unlink(slot); let reads = 0;
  const store = new SemanticBindingStore(f.configuration.dataRoot);
  await assert.rejects(f.service.onboarding({...request(f), currentAccess: () => {
    if (++reads === 3) store.put("projects", f.scope, approved); return f.access;
  }}), {code: "DRIFT"});
  assert.deepEqual(await f.service.inspect(f.input), approved);
});
for (const [statuses, status, mode] of [
  [[], "NO_PUBLISHED_CANDIDATE", "UNRESOLVED"], [["INCOMPATIBLE"], "NO_COMPATIBLE_MATCH", "UNRESOLVED"],
  [["INDETERMINATE", "INCOMPATIBLE"], "EVIDENCE_REQUIRED", "UNRESOLVED"], [["COMPATIBLE"], "REVIEW_REQUIRED", "DUAL_BINDING_REVIEW"],
  [["COMPATIBLE", "INDETERMINATE"], "REVIEW_REQUIRED", "DUAL_BINDING_REVIEW"], [["COMPATIBLE", "COMPATIBLE"], "SELECTION_REQUIRED", "DUAL_BINDING_REVIEW"]
]) test(`verified-candidate presentation ${statuses.join("+") || "empty"} => ${status}, never selects`, () => {
  const r = semanticOnboardingGuidance({projectId: "synthetic", projectRevisionDigest: digest("project"), catalogId: "c", candidatesDigest: digest(statuses), maximumCandidates: 64,
    candidates: statuses.map((status, i) => ({artifactSetDigest: digest(i), bundleDigest: digest(i + 100), status, reasons: [], compatibilityDigest: digest(i + 200)}))});
  assert.equal(r.status, status); assert.equal(r.recommendedBindingMode, mode); assert.equal(r.selectedCandidate, null);
  assert.equal(r.bindingCreated, false); assert.equal(r.requiresSeparateBindingApproval, true);
});
