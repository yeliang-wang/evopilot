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
  runtime: {version: "6.3.0", id: "evopilot-v6.3.0-semantic-convergence-successor", revision: 4,
    targetDigest: "sha256:edb75085a57843dbfeacec2fb7a5521c428eb0e93acd7815ca4c56efc9bd2d98",
    authorizationDigest: "sha256:78aba330004f3fde767f73b33f7de1aac62c75d735e0e54570788f82b517c004",
    planDigest: "sha256:ca6af331be67724125db8b5e3f77ba61f22ab1f82ad9bfaa8e1d6c4a952808bf", currentCount: 13},
  expert: {version: "2.3.0", id: "evopilot-evolution-expert-v2.3.0-semantic-convergence-successor", revision: 5,
    targetDigest: "sha256:90df4915e07aad6a026b3f9b08db7f1ba26d8190c7ebcb0ea36b807029b93a2a",
    authorizationDigest: "sha256:920349901bfd44824ff51f7fdaad1ac2ebd2ae5cdaa454def60beacc5361517e",
    planDigest: "sha256:77e9c4e5928f88de639b025afa7d2e2e44fac7e208aa30c4d4aee1cb9b52b1f3", currentCount: 13}
};
const localSuites = {
  runtime: ["tests/unit/semantic-catalog-reader.test.mjs", "tests/unit/semantic-catalog-consumer.test.mjs",
    "tests/unit/semantic-compatibility.test.mjs", "tests/unit/project-semantic-binding.test.mjs",
    "tests/unit/semantic-execution-binding.test.mjs", "tests/unit/semantic-execution-context.test.mjs",
    "tests/unit/semantic-execution-outcome.test.mjs", "tests/unit/semantic-outcome-review.test.mjs",
    "tests/unit/semantic-process-evidence.test.mjs", "tests/unit/project-semantic-transport-contract.test.mjs",
    "tests/functional/project-semantic-transports.test.mjs", "tests/functional/harness-catalog-consumer.test.mjs",
    "tests/e2e/installed-recovery-transport.test.mjs", "tests/functional/audit-scope.test.mjs"],
  expert: ["tests/unit/evolution-expert-semantic.test.mjs", "tests/unit/evolution-expert.test.mjs",
    "tests/unit/evolution-expert-cli.test.mjs", "tests/unit/evolution-expert-first-run-llm.test.mjs",
    "tests/unit/evolution-expert-host-integration.test.mjs", "tests/unit/evolution-expert-public-install.test.mjs",
    "tests/unit/evolution-expert-runtime-materialization.test.mjs", "tests/unit/evolution-expert-recovery-plan.test.mjs",
    "tests/functional/evolution-expert-host-integration.test.mjs", "tests/functional/evolution-expert-local-tls.test.mjs",
    "tests/functional/evolution-expert-token-auth.test.mjs", "tests/functional/project-semantic-transports.test.mjs",
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
// This finite maintenance entry does not reinterpret the immutable 6.3.0/2.3.0
// corpus as a current Candidate acceptance plan. Its approval registry is a
// separate checked-in input, created before the Candidate is built.
const maintenance = {
  runtime: {id: "evopilot-6.3.3-documentation-onboarding", version: "6.3.3", product: "evopilot-runtime",
    packageFile: "package.json", baseline: "governance/targets/evopilot-6.3.2-readiness-continuity.json", count: 419, prefix: "DOC633-"},
  expert: {id: "evopilot-evolution-expert-v2.3.1-documentation-onboarding", version: "2.3.1", product: "evopilot-evolution-expert",
    packageFile: "packages/evolution-expert/package.json", baseline: "governance/targets/evopilot-evolution-expert-v2.3.0-semantic-convergence-successor.json", count: 400, prefix: "DOC231-"}
};
const maintenanceAuthority = "governance/releases/documentation-onboarding-20261006-authority.json";
const maintenanceRegistry = "governance/releases/documentation-onboarding-20261006-target-bindings.json";
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object"
  ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`
  : JSON.stringify(value);
// Match the public v1 Target authorization projection. Progress/status and
// future exact-Candidate publication evidence do not change approved scope.
export function maintenanceScopeDigest(target) {
  const rows = value => Array.isArray(value) ? value.filter(x => x && typeof x === "object" && !Array.isArray(x)) : [];
  const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key] ?? null]));
  const sorted = (items, keys) => [...items].sort((a, b) => {
    for (const key of keys) {
      const left = String(a[key] ?? ""), right = String(b[key] ?? "");
      if (left !== right) return left < right ? -1 : 1;
    }
    return 0;
  });
  const matrix = (key, fields, order = ["id"]) => sorted(rows(target[key]).map(x => pick(x, fields)), order);
  return sha(canonical({schema: "evopilot-evolution-target-authorization/v1", targetId: target.id ?? null,
    ...pick(target, ["revision", "intent", "objective", "evidence"]),
    roadmapBindings: sorted(rows(target.roadmapBindings), ["project"]), scope: pick(target.scope ?? {}, ["include", "exclude"]),
    compatibilityPolicy: target.compatibilityPolicy ?? {mode: "INHERIT"}, acceptanceModel: target.acceptanceModel ?? null,
    acceptance: matrix("acceptance", ["id", "category", "critical", "criterion", "requiredEvidence"]),
    acceptanceLineage: matrix("acceptanceLineage", ["id", "origin", "criterionDigest", "evidenceRef"], ["origin", "id"]),
    inheritedAcceptance: matrix("inheritedAcceptance", ["id", "origin", "criterion", "requiredEvidence"], ["origin", "id"]),
    regressionImpact: target.regressionImpact ?? null,
    excludedHistoricalAcceptance: matrix("excludedHistoricalAcceptance", ["id", "reason", "evidenceRef"]),
    realCaseCoverage: sorted(rows(target.realCaseCoverage).map(x => ({
      ...pick(x, ["id", "scenario", "coversAcceptanceIds", "hosts", "startingState", "terminalState", "prohibitedEffects", "requiredEvidence"]),
      machineVariants: sorted(rows(x.machineVariants).map(v => pick(v, ["id", "scenario", "coversAcceptanceIds", "hosts", "prohibitedEffects", "requiredEvidence"])), ["id"])
    })), ["id"]),
    ...pick(target, ["noRegressionRequired", "acceptanceClosurePolicy", "failurePolicy"])}));
}

function boundedRepositoryBytes(root, relative) {
  const file = safeRepositoryFile(root, relative);
  ensure(fs.statSync(file).size <= 33554432, "MAINTENANCE_INPUT_SIZE_LIMIT");
  return fs.readFileSync(file);
}

/** Candidate-source structure only. Never approves a Target or closes a case. */
export function validateMaintenanceTarget(product, plan, targetBytes, root = ROOT) {
  config(product);
  const c = maintenance[product], targetPath = `governance/targets/${c.id}.json`;
  ensure(targetBytes.length <= 33554432, "TARGET_SIZE_LIMIT");
  const target = JSON.parse(targetBytes);
  ensure(target.schema === "evopilot-evolution-target/v1" && target.id === c.id && target.revision === 3,
    "MAINTENANCE_TARGET_IDENTITY_MISMATCH");
  const roadmapBytes = boundedRepositoryBytes(root, "governance/roadmap.yaml");
  const roadmap = JSON.parse(roadmapBytes), policy = roadmap.documentationMaintenancePatchPolicy;
  const declaration = {id: c.id, revision: 3, product: c.product, version: c.version, path: targetPath};
  ensure(policy?.schema === "evopilot-documentation-maintenance-patch-policy/v1" &&
    policy.id === "documentation-onboarding-20261006" && policy.standingWork === "evopilot-maintenance" &&
    policy.authorityRecord === maintenanceAuthority && policy.targetBindingsRecord === maintenanceRegistry &&
    policy.boundaryChange === false && policy.productBehaviorChange === false && policy.historicalEvidenceImmutable === true &&
    policy.historicalPassTransferAllowed === false && policy.targets?.filter(x => x.id === c.id).length === 1 &&
    isDeepStrictEqual(policy.targets.find(x => x.id === c.id), declaration), "MAINTENANCE_ROADMAP_DECLARATION_MISMATCH");
  const currentVersion = product === "runtime" ? roadmap.versionPolicy?.currentWorkingVersion : roadmap.evolutionExpertPolicy?.currentWorkingVersion;
  ensure(currentVersion === c.version && JSON.parse(boundedRepositoryBytes(root, c.packageFile)).version === c.version &&
    roadmap.milestones?.some(x => x.id === c.id && x.product === c.product && x.targetVersion === c.version &&
      x.status === "IN_PROGRESS" && x.maintenanceBasis === "evopilot-maintenance"), "MAINTENANCE_CURRENT_VERSION_MISMATCH");
  const registry = JSON.parse(boundedRepositoryBytes(root, maintenanceRegistry));
  ensure(registry.schema === "evopilot-documentation-maintenance-target-bindings/v1" && registry.status === "APPROVED_SCOPE_BINDINGS" &&
    registry.authorityRecord === maintenanceAuthority && registry.authorityRecordDigest === policy.authorityRecordDigest &&
    registry.technicalDigestIndividuallyReviewedByUser === false && registry.targets?.filter(x => x.id === c.id).length === 1,
    "MAINTENANCE_REGISTRY_MISMATCH");
  const binding = registry.targets.find(x => x.id === c.id);
  ensure(binding.revision === 3 && binding.product === c.product && binding.version === c.version && binding.targetPath === targetPath &&
    binding.baselineTarget === c.baseline && binding.inheritedCriterionCount === c.count &&
    digestPattern.test(binding.approvedTargetFileDigest) && digestPattern.test(binding.approvedScopeDigest), "MAINTENANCE_REGISTRY_BINDING_MISMATCH");
  ensure(sha(targetBytes) === binding.approvedTargetFileDigest &&
    sha(boundedRepositoryBytes(root, targetPath)) === binding.approvedTargetFileDigest, "MAINTENANCE_APPROVED_TARGET_BYTES_MISMATCH");
  const authorityBytes = boundedRepositoryBytes(root, maintenanceAuthority), authority = JSON.parse(authorityBytes);
  ensure(sha(authorityBytes) === policy.authorityRecordDigest && binding.sourceAuthorityDigest === policy.authorityRecordDigest &&
    authority.schema === "evopilot-user-release-instruction/v1" && typeof authority.implementationInstruction === "string" &&
    authority.implementationInstruction.trim() && typeof authority.releaseInstruction === "string" && authority.releaseInstruction.trim() &&
    authority.technicalDigestIndividuallyReviewedByUser === false && authority.publicationConditionalOnCurrentAcceptance === true &&
    authority.noHistoricalPassTransfer === true && authority.remoteProductionDeploymentAuthorized === false,
    "MAINTENANCE_AUTHORITY_MISMATCH");
  const targetApproval = target.approvals?.target;
  ensure(target.status === "APPROVED" && targetApproval?.decision === "APPROVED" && targetApproval.by === "user" &&
    targetApproval.evidenceRef === maintenanceAuthority && targetApproval.authorizationDigest === binding.approvedScopeDigest,
    "MAINTENANCE_TARGET_APPROVAL_MISMATCH");
  const roadmapBinding = target.roadmapBindings?.[0];
  ensure(target.roadmapBindings?.length === 1 && roadmapBinding.project === "evopilot" &&
    roadmapBinding.releaseProduct === c.product && roadmapBinding.targetVersion === c.version &&
    roadmapBinding.matchedMilestone === c.id && roadmapBinding.classification === "ALIGNED" &&
    roadmapBinding.roadmapDigest === sha(roadmapBytes) && binding.roadmapDigest === sha(roadmapBytes) &&
    target.release?.product === c.product && isDeepStrictEqual(target.release.versions, {evopilot: c.version}),
    "MAINTENANCE_TARGET_ROADMAP_MISMATCH");
  const baselineBytes = boundedRepositoryBytes(root, c.baseline);
  ensure(sha(baselineBytes) === binding.baselineTargetDigest && target.acceptanceModel?.baselineTargetDigest === binding.baselineTargetDigest,
    "MAINTENANCE_BASELINE_DIGEST_MISMATCH");
  const baseline = JSON.parse(baselineBytes);
  const definitions = [...baseline.acceptance.map((row, i) => ({row, pointer: `/acceptance/${i}`})),
    ...baseline.inheritedAcceptance.map((row, i) => ({row, pointer: `/inheritedAcceptance/${i}`}))];
  ensure(definitions.length === c.count && target.inheritedAcceptance?.length === c.count &&
    target.acceptanceLineage?.length === c.count && target.excludedHistoricalAcceptance?.length === 0,
    "MAINTENANCE_BASELINE_COVERAGE_MISMATCH");
  for (const [i, {row, pointer}] of definitions.entries()) {
    const inherited = target.inheritedAcceptance[i], lineage = target.acceptanceLineage[i];
    const origin = `${c.baseline}#${pointer}`;
    ensure(inherited.id === row.id && inherited.criterion === row.criterion && inherited.requiredEvidence === row.requiredEvidence &&
      inherited.origin === origin && isDeepStrictEqual(lineage, {id: row.id, origin,
        criterionDigest: sha(canonical({id: row.id, criterion: row.criterion, requiredEvidence: row.requiredEvidence})),
        evidenceRef: `${c.baseline}@${binding.baselineTargetDigest}#${pointer}`}), "MAINTENANCE_BASELINE_DEFINITION_MISMATCH");
  }
  ensure(isDeepStrictEqual(target.acceptance?.map(x => x.id), Array.from({length: 6}, (_, i) => `${c.prefix}0${i + 1}`)) &&
    isDeepStrictEqual(target.realCaseCoverage?.map(x => x.id), [1, 2, 3].map(i => `${c.prefix}RC0${i}`)),
    "MAINTENANCE_CURRENT_COVERAGE_MISMATCH");
  const currentRows = [...target.acceptance, ...target.inheritedAcceptance, ...target.realCaseCoverage,
    ...target.realCaseCoverage.flatMap(x => x.machineVariants ?? []), target.noRegression];
  ensure(currentRows.every(x => x.status === "PENDING" && Array.isArray(x.evidenceRefs) && x.evidenceRefs.length === 0),
    "MAINTENANCE_PREMATURE_ACCEPTANCE");
  ensure(maintenanceScopeDigest(target) === binding.approvedScopeDigest, "MAINTENANCE_APPROVED_SCOPE_MISMATCH");
  // An existing conditional release instruction is permitted; this report does
  // not resolve it into exact accepted-Candidate release authority.
  return {schema: "evopilot-maintenance-candidate-definition-validation/v1", status: "MAINTENANCE_TARGET_AND_HISTORICAL_DEFINITION_VALIDATED",
    product, version: c.version, targetId: c.id, targetFileDigest: binding.approvedTargetFileDigest,
    authorizationDigest: binding.approvedScopeDigest, roadmapDigest: binding.roadmapDigest,
    currentMaintenanceTarget: "APPROVED_SOURCE_BYTES_VERIFIED", currentCriterionCount: target.acceptance.length,
    inheritedCriterionCount: definitions.length, historicalDefinition: validateCasePlan(product, plan, root),
    localSyntheticTests: "NOT_RUN", installedPackageE2E: "NOT_RUN", realHost: "NOT_RUN", formalAcceptance: "NOT_RUN",
    targetCriteriaClosed: 0, grantsProductAuthority: false, grantsReleaseAuthority: false};
}

export function validateCandidateTarget(product, plan, targetBytes, root = ROOT) {
  config(product);
  ensure(targetBytes.length <= 33554432, "TARGET_SIZE_LIMIT");
  return JSON.parse(targetBytes).id === maintenance[product].id
    ? validateMaintenanceTarget(product, plan, targetBytes, root)
    : validateExternalTarget(product, plan, targetBytes, root);
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
  const report = validateCandidateTarget(product, plan, fs.readFileSync(targetFile));
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
