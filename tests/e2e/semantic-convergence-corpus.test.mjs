import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {ROOT, planPath, validateCasePlan, validateExternalTarget, supportingSuites, safeRepositoryFile, sha, validateMaintenanceTarget, validateCandidateTarget, maintenanceScopeDigest} from "../../scripts/validate-semantic-convergence-corpus.mjs";

const read = product => JSON.parse(fs.readFileSync(path.join(ROOT, planPath(product))));
for (const product of ["runtime", "expert"]) {
  test(`${product}: versioned definitions retain five families, declared variants and all 388 inheritance bindings`, () => {
    const plan = read(product), before = JSON.stringify(plan), report = validateCasePlan(product, plan);
    assert.equal(report.caseCount, 5); assert.equal(report.machineVariantCount, 11); assert.equal(report.inheritedCriterionCount, 388);
    assert.equal(report.currentCriterionCount, 13);
    assert.equal(new Set(plan.inherited.map(item => item.id)).size, 388);
    assert.equal(report.externalTarget, "NOT_READ"); assert.equal(report.targetCriteriaClosed, 0);
    for (const key of ["installedPackageE2E", "realHost", "activeSoak", "terminalSeriesE2E", "formalAcceptance"]) assert.equal(report[key], "NOT_RUN");
    for (const item of [...plan.current, ...plan.inherited, ...plan.cases, ...plan.cases.flatMap(c => c.machineVariants)]) {
      assert.equal(item.status, "PENDING"); assert.deepEqual(item.evidenceRefs, []); assert.match(item.definitionDigest, /^sha256:[a-f0-9]{64}$/);
    }
    assert.equal(plan.finalPair.activeSoakSeconds, 5400);
    assert(plan.cases.every(item => JSON.stringify(item.hosts) === JSON.stringify(["Codex"]) && item.installedRunner === "NOT_IMPLEMENTED"));
    assert.equal(JSON.stringify(plan), before);
    assert(!before.includes("/Users/") && !before.includes("sourceRef") && !before.includes("apiKey"));
  });
  for (const [name, mutate] of [
    ["missing inherited item", p => p.inherited.pop()],
    ["duplicate lineage", p => {p.inherited[1] = p.inherited[0];}],
    ["weakened criterion", p => {p.current[0].criterion = "Only HTTP 200 required";}],
    ["missing machine variant", p => p.cases[0].machineVariants.pop()],
    ["hidden sixth family", p => p.cases.push({...p.cases[0], id: "RC06"})],
    ["old PASS transfer", p => {p.inherited[0].status = "PASSED";}],
    ["claimed evidence", p => {p.cases[0].evidenceRefs = ["synthetic://not-acceptance"];}],
    ["host substitution", p => {p.cases[0].hosts = ["WorkBuddy"];}],
    ["shortened soak", p => {p.finalPair.activeSoakSeconds = 1;}],
    ["release grant", p => {p.boundaries.release = true;}],
    ["command injection", p => {p.supportingLocalSuites = ["scripts/build-release-artifacts.mjs"];}],
    ["Target substitution", p => {p.target.fileDigest = "sha256:" + "0".repeat(64);}]
  ]) test(`${product}: rejects ${name}`, () => {
    const plan = read(product); mutate(plan);
    assert.throws(() => validateCasePlan(product, plan), {code: "CASE_PLAN_MISMATCH"});
  });
  test(`${product}: wrong external Target is not validated by a matching-looking header`, () => {
    const plan = read(product);
    const forged = {schema: "evopilot-evolution-target/v1", id: plan.target.id, revision: plan.target.revision,
      approvals: {target: {decision: "APPROVED", authorizationDigest: plan.target.authorizationDigest}}};
    assert.throws(() => validateExternalTarget(product, plan, Buffer.from(JSON.stringify(forged))), {code: "TARGET_DIGEST_MISMATCH"});
  });
  test(`${product}: returned local suite list cannot mutate runner commands`, () => {
    const before = supportingSuites(product), changed = supportingSuites(product); changed.push("release.mjs");
    assert.deepEqual(supportingSuites(product), before);
    assert(before.every(file => file.startsWith("tests/") && file.endsWith(".test.mjs")));
  });
}
test("Runtime and Expert definitions and assertions cannot substitute for each other", () => {
  assert.throws(() => validateCasePlan("runtime", read("expert")), {code: "CASE_PLAN_MISMATCH"});
  assert.throws(() => validateCasePlan("expert", read("runtime")), {code: "CASE_PLAN_MISMATCH"});
  assert.throws(() => supportingSuites("__proto__"), {code: "UNKNOWN_PRODUCT"});
});
test("Runtime corpus retains the read-only recovery transport suite exactly once", () => {
  const file = "tests/e2e/installed-recovery-transport.test.mjs", plan = read("runtime");
  assert.equal(supportingSuites("runtime").filter(value => value === file).length, 1);
  assert.equal(plan.supportingLocalSuites.filter(value => value === file).length, 1);
  plan.supportingLocalSuites = plan.supportingLocalSuites.filter(value => value !== file);
  assert.throws(() => validateCasePlan("runtime", plan), {code: "CASE_PLAN_MISMATCH"});
});
test("Expert corpus retains its independent recovery SDK suite exactly once", () => {
  const file = "tests/e2e/installed-expert-recovery-transport.test.mjs", plan = read("expert");
  assert.equal(supportingSuites("expert").filter(value => value === file).length, 1);
  assert.equal(plan.supportingLocalSuites.filter(value => value === file).length, 1);
  plan.supportingLocalSuites = plan.supportingLocalSuites.filter(value => value !== file);
  assert.throws(() => validateCasePlan("expert", plan), {code: "CASE_PLAN_MISMATCH"});
});
test("Expert corpus retains normal SDK capability and unknown-write regression guards", () => {
  const file = "tests/e2e/installed-probe-transport.test.mjs", plan = read("expert");
  assert.equal(supportingSuites("expert").filter(value => value === file).length, 1);
  assert.equal(plan.supportingLocalSuites.filter(value => value === file).length, 1);
  plan.supportingLocalSuites = plan.supportingLocalSuites.filter(value => value !== file);
  assert.throws(() => validateCasePlan("expert", plan), {code: "CASE_PLAN_MISMATCH"});
});
test("repository references reject traversal, absolute paths and symlinked files or parents", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-corpus-unit-"));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, "safe")); fs.writeFileSync(path.join(root, "safe/a.mjs"), "synthetic");
  fs.symlinkSync(path.join(root, "safe/a.mjs"), path.join(root, "file-link"));
  fs.symlinkSync(path.join(root, "safe"), path.join(root, "parent-link"));
  assert.equal(safeRepositoryFile(root, "safe/a.mjs"), path.join(fs.realpathSync(root), "safe/a.mjs"));
  for (const value of ["../a", "/tmp/a", "safe/../a", "./safe/a.mjs", "safe//a.mjs", "file-link", "parent-link/a.mjs"])
    assert.throws(() => safeRepositoryFile(root, value), {code: "UNSAFE_REFERENCE"});
});
test("CLI rejects missing, duplicate or arbitrary command arguments without executing a suite", () => {
  for (const args of [[], ["--product", "runtime"], ["--product", "runtime", "--target", "absent", "--command", "release"],
    ["--product", "runtime", "--target", "absent", "--run-local", "--run-local"]]) {
    const result = spawnSync(process.execPath, [path.join(ROOT, "scripts/validate-semantic-convergence-corpus.mjs"), ...args], {encoding: "utf8"});
    assert.equal(result.status, 2); const report = JSON.parse(result.stdout);
    assert.equal(report.code, "EXPLICIT_PRODUCT_AND_TARGET_REQUIRED"); assert.equal(report.targetCriteriaClosed, 0);
  }
});

const maintenanceRegistryPath = "governance/releases/documentation-onboarding-20261006-target-bindings.json";
const maintenanceAuthorityPath = "governance/releases/documentation-onboarding-20261006-authority.json";
const maintenanceProducts = {
  runtime: {id: "evopilot-6.3.3-documentation-onboarding", version: "6.3.3", product: "evopilot-runtime", packageFile: "package.json", count: 419},
  expert: {id: "evopilot-evolution-expert-v2.3.1-documentation-onboarding", version: "2.3.1", product: "evopilot-evolution-expert", packageFile: "packages/evolution-expert/package.json", count: 400}
};
function maintenanceFixture(t, product) {
  const c = maintenanceProducts[product], root = fs.mkdtempSync(path.join(os.tmpdir(), "maintenance-corpus-unit-"));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const write = (relative, value) => {
    const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
  };
  const targetPath = `governance/targets/${c.id}.json`;
  // A Candidate fixture is independent of the working tree's later acceptance
  // and publication progress. Never edit a real Target to reset its status.
  const target = JSON.parse(fs.readFileSync(path.join(ROOT, targetPath)));
  target.status = "APPROVED";
  for (const row of [...target.acceptance, ...target.inheritedAcceptance, ...target.realCaseCoverage,
    ...target.realCaseCoverage.flatMap(x => x.machineVariants ?? []), target.noRegression]) {
    row.status = "PENDING"; row.evidenceRefs = [];
  }
  const authority = {schema: "evopilot-user-release-instruction/v1", implementationInstruction: "Synthetic bounded implementation instruction",
    releaseInstruction: "Synthetic conditional release instruction", technicalDigestIndividuallyReviewedByUser: false,
    publicationConditionalOnCurrentAcceptance: true, noHistoricalPassTransfer: true, remoteProductionDeploymentAuthorized: false};
  write(maintenanceAuthorityPath, authority);
  const authorityDigest = sha(fs.readFileSync(path.join(root, maintenanceAuthorityPath)));
  const roadmap = {versionPolicy: {currentWorkingVersion: "6.3.3"}, evolutionExpertPolicy: {currentWorkingVersion: "2.3.1"},
    milestones: [{id: c.id, product: c.product, targetVersion: c.version, status: "IN_PROGRESS", maintenanceBasis: "evopilot-maintenance"}],
    documentationMaintenancePatchPolicy: {schema: "evopilot-documentation-maintenance-patch-policy/v1", id: "documentation-onboarding-20261006",
      standingWork: "evopilot-maintenance", authorityRecord: maintenanceAuthorityPath, authorityRecordDigest: authorityDigest,
      targetBindingsRecord: maintenanceRegistryPath, boundaryChange: false, productBehaviorChange: false, historicalEvidenceImmutable: true,
      historicalPassTransferAllowed: false, targets: [{id: c.id, revision: 1, product: c.product, version: c.version, path: targetPath}]}};
  write("governance/roadmap.yaml", roadmap);
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, maintenanceRegistryPath)));
  const binding = registry.targets.find(x => x.id === c.id);
  registry.authorityRecordDigest = binding.sourceAuthorityDigest = authorityDigest;
  binding.roadmapDigest = target.roadmapBindings[0].roadmapDigest = sha(fs.readFileSync(path.join(root, "governance/roadmap.yaml")));
  target.approvals.target = {decision: "APPROVED", by: "user", evidenceRef: maintenanceAuthorityPath, authorizationDigest: binding.approvedScopeDigest};
  // A release instruction is allowed, but it does not close pending evidence.
  target.approvals.release = {decision: "AUTHORIZED", by: "user", evidenceRef: maintenanceAuthorityPath,
    conditionalOn: "Synthetic: exact current Candidate acceptance and separate release gate required"};
  binding.approvedScopeDigest = target.approvals.target.authorizationDigest = maintenanceScopeDigest(target);
  write(binding.baselineTarget, fs.readFileSync(path.join(ROOT, binding.baselineTarget), "utf8"));
  write(c.packageFile, {version: c.version});
  for (const file of supportingSuites(product)) write(file, "// synthetic file-presence fixture; never executed\n");
  const saveTarget = () => {write(targetPath, target); binding.approvedTargetFileDigest = sha(fs.readFileSync(path.join(root, targetPath))); write(maintenanceRegistryPath, registry);};
  saveTarget();
  return {root, target, targetPath, registry, binding, roadmap, write, saveTarget,
    bytes: () => fs.readFileSync(path.join(root, targetPath)), plan: read(product)};
}
for (const product of ["runtime", "expert"]) {
  test(`${product}: finite maintenance Target and old corpus validate separately without granting acceptance or release`, t => {
    const f = maintenanceFixture(t, product), before = f.bytes();
    const report = validateCandidateTarget(product, f.plan, before, f.root);
    assert.equal(report.version, maintenanceProducts[product].version);
    assert.equal(report.currentMaintenanceTarget, "APPROVED_SOURCE_BYTES_VERIFIED");
    assert.equal(report.inheritedCriterionCount, maintenanceProducts[product].count);
    assert.equal(report.currentCriterionCount, 6);
    assert.equal(report.historicalDefinition.version, product === "runtime" ? "6.3.0" : "2.3.0");
    assert.equal(report.historicalDefinition.inheritedCriterionCount, 388);
    assert.equal(report.historicalDefinition.externalTarget, "NOT_READ");
    assert.equal(report.formalAcceptance, "NOT_RUN"); assert.equal(report.targetCriteriaClosed, 0);
    assert.equal(report.grantsProductAuthority, false); assert.equal(report.grantsReleaseAuthority, false);
    assert.deepEqual(f.bytes(), before);
    assert.throws(() => validateExternalTarget(product, f.plan, before, f.root), {code: "TARGET_DIGEST_MISMATCH"});
  });
  for (const [name, mutate, code] of [
    ["scope changed after approval", f => {f.target.scope.include.push("Unapproved capability"); f.write(f.targetPath, f.target);}, "MAINTENANCE_APPROVED_TARGET_BYTES_MISMATCH"],
    ["scope drift with mistakenly refreshed whole-file pin", f => {f.target.scope.include.push("Unapproved capability"); f.saveTarget();}, "MAINTENANCE_APPROVED_SCOPE_MISMATCH"],
    ["weakened regression scope with refreshed whole-file pin", f => {f.target.regressionImpact[0].affectedAcceptanceIds.pop(); f.saveTarget();}, "MAINTENANCE_APPROVED_SCOPE_MISMATCH"],
    ["copied old PASS", f => {f.target.inheritedAcceptance[0].status = "PASSED"; f.target.inheritedAcceptance[0].evidenceRefs = ["historical-only"]; f.saveTarget();}, "MAINTENANCE_PREMATURE_ACCEPTANCE"],
    ["claimed case evidence", f => {f.target.realCaseCoverage[0].evidenceRefs = ["not-observed"]; f.saveTarget();}, "MAINTENANCE_PREMATURE_ACCEPTANCE"],
    ["unapproved status", f => {f.target.status = "DRAFT"; f.saveTarget();}, "MAINTENANCE_TARGET_APPROVAL_MISMATCH"],
    ["later released status on Candidate path", f => {f.target.status = "RELEASE_AUTHORIZED"; f.saveTarget();}, "MAINTENANCE_TARGET_APPROVAL_MISMATCH"],
    ["wrong revision", f => {f.target.revision = 2; f.saveTarget();}, "MAINTENANCE_TARGET_IDENTITY_MISMATCH"],
    ["wrong release product", f => {f.target.release.product = "unrelated"; f.saveTarget();}, "MAINTENANCE_TARGET_ROADMAP_MISMATCH"],
    ["wrong release version", f => {f.target.release.versions.evopilot = "99.0.0"; f.saveTarget();}, "MAINTENANCE_TARGET_ROADMAP_MISMATCH"],
    ["wrong roadmap digest", f => {f.target.roadmapBindings[0].roadmapDigest = "sha256:" + "0".repeat(64); f.saveTarget();}, "MAINTENANCE_TARGET_ROADMAP_MISMATCH"],
    ["wrong approval digest", f => {f.target.approvals.target.authorizationDigest = "sha256:" + "0".repeat(64); f.saveTarget();}, "MAINTENANCE_TARGET_APPROVAL_MISMATCH"],
    ["non-user approval", f => {f.target.approvals.target.by = "assistant"; f.saveTarget();}, "MAINTENANCE_TARGET_APPROVAL_MISMATCH"],
    ["missing inherited item", f => {f.target.inheritedAcceptance.pop(); f.saveTarget();}, "MAINTENANCE_BASELINE_COVERAGE_MISMATCH"],
    ["changed inherited definition", f => {f.target.inheritedAcceptance[0].criterion = "HTTP200 only"; f.saveTarget();}, "MAINTENANCE_BASELINE_DEFINITION_MISMATCH"],
    ["duplicate lineage", f => {f.target.acceptanceLineage[1] = f.target.acceptanceLineage[0]; f.saveTarget();}, "MAINTENANCE_BASELINE_DEFINITION_MISMATCH"],
    ["new inherited exclusion", f => {f.target.excludedHistoricalAcceptance.push({id: "invented"}); f.saveTarget();}, "MAINTENANCE_BASELINE_COVERAGE_MISMATCH"],
    ["omitted current criterion", f => {f.target.acceptance.pop(); f.saveTarget();}, "MAINTENANCE_CURRENT_COVERAGE_MISMATCH"],
    ["unapproved registry", f => {f.registry.status = "DRAFT"; f.write(maintenanceRegistryPath, f.registry);}, "MAINTENANCE_REGISTRY_MISMATCH"],
    ["duplicate registry entry", f => {f.registry.targets.push(f.binding); f.write(maintenanceRegistryPath, f.registry);}, "MAINTENANCE_REGISTRY_MISMATCH"],
    ["wrong registered product", f => {f.binding.product = "unrelated"; f.write(maintenanceRegistryPath, f.registry);}, "MAINTENANCE_REGISTRY_BINDING_MISMATCH"],
    ["unsafe registry Target path", f => {f.binding.targetPath = "../outside.json"; f.write(maintenanceRegistryPath, f.registry);}, "MAINTENANCE_REGISTRY_BINDING_MISMATCH"],
    ["missing Roadmap declaration", f => {f.roadmap.documentationMaintenancePatchPolicy.targets = []; f.write("governance/roadmap.yaml", f.roadmap);}, "MAINTENANCE_ROADMAP_DECLARATION_MISMATCH"],
    ["package identity drift", f => {f.write(maintenanceProducts[product].packageFile, {version: "99.0.0"});}, "MAINTENANCE_CURRENT_VERSION_MISMATCH"],
    ["authority byte drift", f => {f.write(maintenanceAuthorityPath, {schema: "forged"});}, "MAINTENANCE_AUTHORITY_MISMATCH"],
    ["historical baseline byte drift", f => {f.write(f.binding.baselineTarget, {schema: "forged"});}, "MAINTENANCE_BASELINE_DIGEST_MISMATCH"],
    ["historical corpus weakened", f => {f.plan.current[0].criterion = "weakened";}, "CASE_PLAN_MISMATCH"]
  ]) test(`${product}: maintenance path rejects ${name}`, t => {
    const f = maintenanceFixture(t, product); mutate(f);
    assert.throws(() => validateMaintenanceTarget(product, f.plan, f.bytes(), f.root), {code});
  });
  test(`${product}: matching-looking header and undeclared patch never bypass exact registration`, t => {
    const f = maintenanceFixture(t, product);
    const header = {schema: "evopilot-evolution-target/v1", id: f.target.id, revision: 1, status: "APPROVED", approvals: f.target.approvals};
    assert.throws(() => validateCandidateTarget(product, f.plan, Buffer.from(JSON.stringify(header)), f.root), {code: "MAINTENANCE_APPROVED_TARGET_BYTES_MISMATCH"});
    header.id += "-undeclared";
    assert.throws(() => validateCandidateTarget(product, f.plan, Buffer.from(JSON.stringify(header)), f.root), {code: "TARGET_DIGEST_MISMATCH"});
  });
  test(`${product}: maintenance repository symlinks are refused before reading untrusted outside inputs`, t => {
    const f = maintenanceFixture(t, product), file = path.join(f.root, maintenanceAuthorityPath);
    const outside = path.join(f.root, "outside.json"); fs.writeFileSync(outside, "{}"); fs.unlinkSync(file); fs.symlinkSync(outside, file);
    assert.throws(() => validateMaintenanceTarget(product, f.plan, f.bytes(), f.root), {code: "UNSAFE_REFERENCE"});
  });
}

test("maintenance authorization projection matches independently approved public Target scope digests", () => {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, maintenanceRegistryPath)));
  for (const binding of registry.targets) {
    const target = JSON.parse(fs.readFileSync(path.join(ROOT, binding.targetPath)));
    assert.equal(maintenanceScopeDigest(target), binding.approvedScopeDigest);
    const changedProgress = structuredClone(target); changedProgress.status = "VALIDATED";
    changedProgress.acceptance[0].status = "PASSED"; changedProgress.acceptance[0].evidenceRefs = ["synthetic-progress-only"];
    assert.equal(maintenanceScopeDigest(changedProgress), binding.approvedScopeDigest);
  }
});
