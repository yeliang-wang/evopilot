import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {ROOT, planPath, validateCasePlan, validateExternalTarget, supportingSuites, safeRepositoryFile} from "../../scripts/validate-semantic-convergence-corpus.mjs";

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
