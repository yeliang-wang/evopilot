#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {pathToFileURL} from "node:url";
import {spawnSync} from "node:child_process";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const sha = bytes => `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
const objectDigest = value => sha(JSON.stringify(value));
const products = {
  runtime: {version: "6.3.0", id: "evopilot-v6.3.0-semantic-convergence-successor", revision: 3,
    targetDigest: "sha256:16f255c53a99df7db5c92c98f27669200538b66a3817babf43d2c2fb02d86a45",
    authorizationDigest: "sha256:b91dd829ac447c1e1628df8614fd5e014935a147b9421356ebbd4b715ad788fc",
    planDigest: "sha256:d27036b5b573752fdfce53750095bf88c671c65a7f33cfcc3fb47ca49d52cd1b", currentCount: 12},
  expert: {version: "2.3.0", id: "evopilot-evolution-expert-v2.3.0-semantic-convergence-successor", revision: 3,
    targetDigest: "sha256:6119dd0f6c22a28ebfb2f6a34929ac086db25e5eea02c08b94f5387d6ab78a42",
    authorizationDigest: "sha256:8f27ec50d13216d16b47f57e5a246a61ddf5962ab0dd013e40214335074e1e89",
    planDigest: "sha256:99aaafc6e1891c3d2809931e2be11b3c28803d1d7c49d2a98d521be0c664d9f1", currentCount: 11}
};
const localSuites = {
  runtime: ["tests/unit/semantic-catalog-reader.test.mjs", "tests/unit/semantic-catalog-consumer.test.mjs",
    "tests/unit/semantic-compatibility.test.mjs", "tests/unit/project-semantic-binding.test.mjs",
    "tests/unit/semantic-execution-binding.test.mjs", "tests/unit/semantic-execution-context.test.mjs",
    "tests/unit/semantic-execution-outcome.test.mjs", "tests/unit/semantic-outcome-review.test.mjs",
    "tests/unit/semantic-process-evidence.test.mjs", "tests/unit/project-semantic-transport-contract.test.mjs",
    "tests/functional/project-semantic-transports.test.mjs", "tests/functional/harness-catalog-consumer.test.mjs",
    "tests/e2e/installed-recovery-transport.test.mjs"],
  expert: ["tests/unit/evolution-expert-semantic.test.mjs", "tests/unit/evolution-expert.test.mjs",
    "tests/unit/evolution-expert-cli.test.mjs", "tests/unit/evolution-expert-first-run-llm.test.mjs",
    "tests/unit/evolution-expert-host-integration.test.mjs", "tests/unit/evolution-expert-public-install.test.mjs",
    "tests/unit/evolution-expert-runtime-materialization.test.mjs", "tests/unit/evolution-expert-recovery-plan.test.mjs",
    "tests/functional/evolution-expert-host-integration.test.mjs", "tests/functional/project-semantic-transports.test.mjs",
    "tests/e2e/installed-expert-recovery-transport.test.mjs", "tests/e2e/installed-probe-transport.test.mjs"]
};
const ensure = (condition, code) => {if (!condition) throw Object.assign(new Error(code), {code});};
const config = product => {ensure(Object.hasOwn(products, product), "UNKNOWN_PRODUCT"); return products[product];};
export const planPath = product => `tests/e2e/versions/${product}/${config(product).version}/case-plan.json`;

// Fixed source tests only, never manifest-provided commands, package builds,
// provider calls, live Hosts or publication. A suite's PASS does not close a case.
export function supportingSuites(product) {config(product); return [...localSuites[product]];}
export function safeRepositoryFile(root, relative) {
  ensure(typeof relative === "string" && /^[a-zA-Z0-9._/-]+$/.test(relative) && !path.isAbsolute(relative) &&
    relative.split("/").every(part => part && part !== "." && part !== ".."), "UNSAFE_REFERENCE");
  let current = fs.realpathSync(root);
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    ensure(!fs.lstatSync(current).isSymbolicLink(), "UNSAFE_REFERENCE");
  }
  ensure(fs.statSync(current).isFile(), "FILE_REQUIRED"); return current;
}
export function projectCasePlan(product, targetBytes) {
  const c = config(product);
  ensure(targetBytes.length <= 33554432 && sha(targetBytes) === c.targetDigest, "TARGET_DIGEST_MISMATCH");
  const target = JSON.parse(targetBytes);
  ensure(target.schema === "evopilot-evolution-target/v1" && target.id === c.id && target.revision === c.revision &&
    target.approvals.target.decision === "APPROVED" && target.approvals.target.authorizationDigest === c.authorizationDigest, "TARGET_BINDING_MISMATCH");
  ensure(target.acceptance.length === c.currentCount && target.inheritedAcceptance.length === 388 &&
    isDeepStrictEqual(target.realCaseCoverage.map(item => item.id), ["RC01", "RC02", "RC03", "RC04", "RC05"]), "TARGET_COVERAGE_MISMATCH");
  const definition = (item, pointer) => ({id: item.id, targetPointer: pointer, definitionDigest: objectDigest(item)});
  return {schema: "evopilot-series-e2e-development-plan/v1", product, version: c.version,
    projectionMode: "SOURCE_DEVELOPMENT_ONLY_NOT_ACCEPTANCE",
    target: {id: c.id, revision: c.revision, fileDigest: c.targetDigest, authorizationDigest: c.authorizationDigest},
    current: target.acceptance.map((item, i) => ({...definition(item, `/acceptance/${i}`), criterion: item.criterion,
      requiredEvidence: item.requiredEvidence, status: "PENDING", evidenceRefs: []})),
    // Preserve every exact definition and lineage, without copying private source
    // locations, credentials or historical evidence into a distributable corpus.
    inherited: target.inheritedAcceptance.map((item, i) => {
      const index = target.acceptanceLineage.findIndex(line => line.id === item.id);
      ensure(index >= 0, "MISSING_LINEAGE");
      return {...definition(item, `/inheritedAcceptance/${i}`), lineagePointer: `/acceptanceLineage/${index}`,
        lineageDigest: objectDigest(target.acceptanceLineage[index]), status: "PENDING", evidenceRefs: []};
    }),
    cases: target.realCaseCoverage.map((item, i) => ({...definition(item, `/realCaseCoverage/${i}`), scenario: item.scenario,
      hosts: item.hosts, startingState: item.startingState, terminalState: item.terminalState,
      coversAcceptanceIds: item.coversAcceptanceIds, requiredEvidence: item.requiredEvidence,
      prohibitedEffects: item.prohibitedEffects, status: "PENDING", evidenceRefs: [], installedRunner: "NOT_IMPLEMENTED",
      machineVariants: item.machineVariants.map((variant, j) => ({...definition(variant, `/realCaseCoverage/${i}/machineVariants/${j}`),
        scenario: variant.scenario, hosts: variant.hosts, coversAcceptanceIds: variant.coversAcceptanceIds,
        requiredEvidence: variant.requiredEvidence, prohibitedEffects: variant.prohibitedEffects, status: "PENDING", evidenceRefs: []}))})),
    supportingLocalSuites: supportingSuites(product),
    boundaries: {localTestsCloseCriteria: false, inferredBusinessSuccess: false, inheritedPassTransfer: false,
      candidateFormation: false, realHostExecution: false, workBuddyObservation: false, publication: false, release: false},
    finalPair: {harness: "4.8.1", runtime: "6.3.0", expert: "2.3.0", activeSoakSeconds: 5400,
      terminalSeriesE2E: "E2E-SERIES-SEMANTIC-CONVERGENCE-4.8.1-6.3.0-2.3.0", terminalSeriesStatus: "NOT_RUN"}};
}

/** This verifies the fixed checked-in definition, not installed-product behavior.
 * Explicit external Target validation is an additional separate check below. */
export function validateCasePlan(product, plan, root = ROOT) {
  const c = config(product);
  ensure(objectDigest(plan) === c.planDigest, "CASE_PLAN_MISMATCH");
  for (const file of supportingSuites(product)) safeRepositoryFile(root, file);
  return {schema: "evopilot-series-e2e-development-validation/v1", status: "CASE_DEFINITION_VALIDATED",
    product, version: c.version, caseCount: plan.cases.length,
    machineVariantCount: plan.cases.reduce((n, item) => n + item.machineVariants.length, 0),
    currentCriterionCount: plan.current.length, inheritedCriterionCount: plan.inherited.length,
    targetFileDigest: c.targetDigest, planDigest: c.planDigest, externalTarget: "NOT_READ",
    installedRunners: "NOT_IMPLEMENTED", localSyntheticTests: "NOT_RUN", installedPackageE2E: "NOT_RUN",
    realHost: "NOT_RUN", activeSoak: "NOT_RUN", terminalSeriesE2E: "NOT_RUN", formalAcceptance: "NOT_RUN",
    targetCriteriaClosed: 0, grantsProductAuthority: false};
}
export function validateExternalTarget(product, plan, targetBytes, root = ROOT) {
  const projected = projectCasePlan(product, targetBytes);
  ensure(isDeepStrictEqual(plan, projected), "CASE_PLAN_MISMATCH");
  return {...validateCasePlan(product, plan, root), externalTarget: "EXACT_BYTES_VERIFIED"};
}
function run() {
  const args = process.argv.slice(2);
  ensure((args.length === 4 || (args.length === 5 && args[4] === "--run-local")) &&
    args[0] === "--product" && args[2] === "--target", "EXPLICIT_PRODUCT_AND_TARGET_REQUIRED");
  const product = args[1]; config(product);
  const targetFile = path.resolve(args[3]);
  ensure(fs.statSync(targetFile).isFile() && fs.statSync(targetFile).size <= 33554432, "TARGET_SIZE_LIMIT");
  const planFile = safeRepositoryFile(ROOT, planPath(product));
  ensure(fs.statSync(planFile).size <= 1048576, "PLAN_SIZE_LIMIT");
  const plan = JSON.parse(fs.readFileSync(planFile));
  const report = validateExternalTarget(product, plan, fs.readFileSync(targetFile));
  if (args.includes("--run-local")) {
    const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...supportingSuites(product)],
      {cwd: ROOT, encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024,
        env: {PATH: process.env.PATH, TMPDIR: "/private/tmp", EVOPILOT_LOG_LEVEL: "error"}});
    ensure(result.status === 0, "LOCAL_SYNTHETIC_TESTS_FAILED");
    const count = Number(result.stdout.match(/^# pass (\d+)$/m)?.[1]);
    ensure(Number.isSafeInteger(count) && count > 0 && /^# fail 0$/m.test(result.stdout), "LOCAL_TEST_REPORT_INVALID");
    report.localSyntheticTests = {status: "PASSED", passedCount: count, outputDigest: sha(result.stdout)};
  }
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {run();} catch (error) {
    process.stdout.write(JSON.stringify({status: "BLOCKED", code: error.code ?? "CORPUS_VALIDATION_FAILED",
      formalAcceptance: "NOT_RUN", targetCriteriaClosed: 0, grantsProductAuthority: false}) + "\n");
    process.exitCode = 2;
  }
}
