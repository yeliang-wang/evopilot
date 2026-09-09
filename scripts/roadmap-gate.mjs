import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const contractPath = process.env.EVOPILOT_ROADMAP_CONTRACT
  ? path.resolve(process.env.EVOPILOT_ROADMAP_CONTRACT)
  : path.join(root, "governance/roadmap.yaml");
const args = process.argv.slice(2);
const json = args.includes("--json");
const intent = option("--intent");
const releaseVersion = option("--release-version") ?? positionalAfter("--release-version");
const releaseProduct = option("--release-product") ?? "evopilot-runtime";

let roadmap;
try {
  roadmap = JSON.parse(fs.readFileSync(contractPath, "utf8"));
} catch (error) {
  fail(`Roadmap contract is not valid JSON-compatible YAML: ${error.message}`);
}

const errors = validateRoadmap(roadmap);
if (errors.length > 0) {
  const result = { schema: "evopilot-roadmap-gate-result/v1", project: roadmap?.project, classification: "INVALID", approvalRequired: true, errors, nextAction: "repair-roadmap-contract" };
  emit(result, 1);
}

if (releaseVersion) {
  const normalized = releaseVersion.replace(/^v/, "");
  const release = classifyRelease(normalized, releaseProduct, roadmap);
  emit(baseResult(release.classification, {
    intent: `release ${normalized}`,
    releaseProduct,
    matchedMilestones: release.matchedMilestones,
    reasons: release.reasons,
    approvalRequired: release.classification !== "ALIGNED",
    nextAction: release.classification === "ALIGNED" ? "continue-release-validation" : "revise-roadmap-before-release"
  }), release.classification === "ALIGNED" ? 0 : 2);
}

if (intent != null) {
  const result = classifyIntent(intent, roadmap);
  emit(baseResult(result.classification, result), result.classification === "ALIGNED" ? 0 : 2);
}

emit(baseResult("ALIGNED", {
  intent: "static-roadmap-contract-validation",
  matchedMilestones: [],
  matchedStandingWork: [],
  reasons: ["Roadmap schema, repository integration, and version declarations are valid."],
  approvalRequired: false,
  nextAction: "run-intent-gate-before-product-work"
}), 0);

function validateRoadmap(value) {
  const failures = [];
  required(value?.schema === "evopilot-series-roadmap/v1", "schema must be evopilot-series-roadmap/v1");
  required(value?.roadmapFamily === "evopilot-series-agentic-evolution", "roadmapFamily is invalid");
  required(typeof value?.contractVersion === "string", "contractVersion is required");
  required(value?.project === "evopilot", "project must be evopilot");
  required(Array.isArray(value?.ownership?.owns) && value.ownership.owns.length > 0, "ownership.owns is required");
  required(Array.isArray(value?.ownership?.mustNotOwn) && value.ownership.mustNotOwn.length > 0, "ownership.mustNotOwn is required");
  required(semver(value?.versionPolicy?.publishedBaseline), "publishedBaseline must be SemVer");
  required(semver(value?.versionPolicy?.currentWorkingVersion), "currentWorkingVersion must be SemVer");
  required(value?.versionPolicy?.runtimeProduct === "evopilot-runtime", "versionPolicy.runtimeProduct must be evopilot-runtime");
  required(value?.evolutionExpertPolicy?.product === "evopilot-evolution-expert", "evolutionExpertPolicy.product must be evopilot-evolution-expert");
  required(semver(value?.evolutionExpertPolicy?.publishedBaseline), "evolutionExpertPolicy.publishedBaseline must be SemVer");
  required(semver(value?.evolutionExpertPolicy?.currentWorkingVersion), "evolutionExpertPolicy.currentWorkingVersion must be SemVer");
  required(value?.evolutionExpertPolicy?.lockstepWithRuntime === false, "Evolution Expert must not be version-locked to the Runtime");
  required(value?.harnessGuidedExecutionPolicy?.requiredForGoalTargetLoop === true, "Harness-guided execution must be required for Goal Target Loops");
  required(value?.harnessGuidedExecutionPolicy?.publishedAssetsReadOnly === true, "published Harness assets must remain read-only");
  required(value?.harnessGuidedExecutionPolicy?.perIterationRevalidation === true, "Harness binding must be revalidated before every Loop iteration");
  required(value?.harnessGuidedExecutionPolicy?.lifecycleMayReplaceHarness === false, "Lifecycle must not replace the Harness binding");
  required(value?.harnessGuidedExecutionPolicy?.lifecycleMayWeakenHarness === false, "Lifecycle must not weaken Harness obligations");
  required(value?.acceptancePortfolio?.functional === 21, "v5 acceptancePortfolio.functional must be 21");
  required(value?.acceptancePortfolio?.capability === 16, "v5 acceptancePortfolio.capability must be 16");
  required(value?.acceptancePortfolio?.documentation === 13, "v5 acceptancePortfolio.documentation must be 13");
  required(value?.acceptancePortfolio?.endToEnd === 13, "v5 acceptancePortfolio.endToEnd must be 13");
  required(value?.acceptancePortfolio?.completion === 6, "v5 acceptancePortfolio.completion must be 6");
  required(value?.acceptancePortfolio?.completionIds === "TRACE01-TRACE06", "v5 acceptancePortfolio.completionIds must be TRACE01-TRACE06");
  const completionAssurance = value?.acceptancePortfolio?.completionAssurance;
  required(completionAssurance?.schema === "evopilot-approved-scheme-completeness/v1", "completion assurance schema is invalid");
  required(completionAssurance?.required === true, "completion assurance must be required");
  required(completionAssurance?.originalSchemeCoveragePercent === 100, "original v5 scheme coverage must be 100 percent");
  required(arrayEquals(completionAssurance?.requiredAcceptanceIds, ["TRACE01", "TRACE02", "TRACE03", "TRACE04", "TRACE05", "TRACE06"]), "completion assurance must require TRACE01-TRACE06");
  for (const binding of ["accepted v5 Roadmap revisions", "Runtime v5.0.0 Target revision 2", "Evolution Expert v1.0.0 Target revision 2", "explicit user corrections and requirements", "audited acceptance, Runtime, Expert, project, contract, documentation, public-truth, governance, and reference gaps"]) {
    required(completionAssurance?.binds?.includes(binding), `completion assurance is missing inventory binding: ${binding}`);
  }
  for (const link of ["requirement", "successor Target criterion", "implementation deliverable", "independent executable validator", "concrete evidence", "terminal E2E when user-observable"]) {
    required(completionAssurance?.requiresTraceability?.includes(link), `completion assurance is missing traceability link: ${link}`);
  }
  required(completionAssurance?.bulkPassProjectionAllowed === false, "bulk PASS projection must be forbidden");
  required(completionAssurance?.silentExclusionAllowed === false, "silent exclusions must be forbidden");
  required(completionAssurance?.warningCountsAsPass === false, "warnings must not count as PASS");
  required(completionAssurance?.humanDeclarationSubstitutesForMachineEvidence === false, "human declaration must not replace required machine evidence");
  required(completionAssurance?.completeWhen === "TOTAL_EQUALS_PASSED_AND_FAILED_PENDING_STALE_GENERIC_UNMAPPED_ARE_ZERO_AND_NO_REGRESSION_PASSED", "completion formula must fail closed on every incomplete evidence class");
  const suiteTransition = value?.legacySuiteTransition;
  required(suiteTransition?.preRelease?.installedSuiteDisposition === "ACTIVE_AND_INDEPENDENT", "legacy Suites must remain active and independent before v5 release");
  required(suiteTransition?.preRelease?.shadowComparisonMode === "READ_ONLY", "pre-release legacy Suite comparison must be read-only");
  required(suiteTransition?.preRelease?.snapshotPolicy === "LATE_BOUND_EXACT", "pre-release legacy Suite snapshots must be late-bound and exact");
  required(suiteTransition?.preRelease?.snapshotDriftPolicy === "STALE_AND_SELECTIVE_RERUN", "legacy Suite snapshot drift must stale affected evidence and require selective rerun");
  required(suiteTransition?.preRelease?.candidateEnvironment === "LEGACY_SUITES_ABSENT", "v5 Candidate independence must be proven with legacy Suites absent from the isolated environment");
  required(suiteTransition?.preRelease?.realInstalledSuiteMutationAllowed === false, "v5 release acceptance must not mutate real installed legacy Suites");
  required(suiteTransition?.postRelease?.timing === "AFTER_PUBLIC_COMPLETION_SUCCESSORS_AND_VERIFIED_INSTALLATION", "legacy Suite Cutover must occur only after the public completion successors and installation verification");
  required(suiteTransition?.postRelease?.releaseBlockerForV5 === false, "post-release legacy Suite Cutover must not block the v5 release");
  required(suiteTransition?.postRelease?.requiresSeparateEvolutionTarget === true, "post-release legacy Suite Cutover requires a separate Evolution Target");
  required(suiteTransition?.postRelease?.requiresSeparateHumanAuthorization === true, "post-release legacy Suite Cutover requires separate human authorization");
  required(Array.isArray(value?.milestones) && value.milestones.length > 0, "milestones are required");
  const milestones = value?.milestones ?? [];
  const ids = new Set();
  for (const milestone of milestones) {
    required(typeof milestone.id === "string" && !ids.has(milestone.id), `milestone id must be unique: ${milestone.id}`);
    ids.add(milestone.id);
    required(["IN_PROGRESS", "PLANNED", "DEFERRED", "COMPLETE"].includes(milestone.status), `invalid milestone status: ${milestone.id}`);
    required(semver(milestone.targetVersion), `targetVersion must be SemVer: ${milestone.id}`);
    required(/^\d+\.\d+\.x$/.test(milestone.releaseLine), `releaseLine must be major.minor.x: ${milestone.id}`);
    required(["evopilot-runtime", "evopilot-evolution-expert"].includes(milestone.product), `milestone product is invalid: ${milestone.id}`);
    required(Array.isArray(milestone.signals) && milestone.signals.length > 0, `signals are required: ${milestone.id}`);
    required(Array.isArray(milestone.acceptance) && milestone.acceptance.length > 0, `acceptance is required: ${milestone.id}`);
  }
  const currentMilestones = milestones.filter((milestone) => milestone.product === value?.versionPolicy?.runtimeProduct && milestone.status === "IN_PROGRESS" && milestone.targetVersion === value?.versionPolicy?.currentWorkingVersion);
  required(currentMilestones.length === 1, "Runtime currentWorkingVersion must match exactly one IN_PROGRESS Runtime milestone");
  const currentExpertMilestones = milestones.filter((milestone) => milestone.product === value?.evolutionExpertPolicy?.product && milestone.status === "IN_PROGRESS" && milestone.targetVersion === value?.evolutionExpertPolicy?.currentWorkingVersion);
  required(currentExpertMilestones.length === 1, "Evolution Expert currentWorkingVersion must match exactly one IN_PROGRESS Expert milestone");
  const runtimeCompletion = milestones.find((milestone) => milestone.id === "evopilot-5.0-harness-guided-governed-evolution-runtime");
  const expertCompletion = milestones.find((milestone) => milestone.id === "evopilot-evolution-expert-1.0");
  validateCompletionSuccessor(runtimeCompletion, "5.0.0", "5.0.1", "Runtime");
  validateCompletionSuccessor(expertCompletion, "1.0.0", "1.0.1", "Evolution Expert");
  const cutoverMilestone = milestones.find((milestone) => milestone.id === suiteTransition?.postRelease?.milestone);
  required(cutoverMilestone?.status === "PLANNED", "post-release legacy Suite Cutover milestone must be PLANNED");
  required(cutoverMilestone?.standaloneReleaseEligible === false, "post-release legacy Suite Cutover must not create another release line");
  required(cutoverMilestone?.releaseBlockerForV5 === false, "post-release legacy Suite Cutover milestone must not block v5 release");
  required(cutoverMilestone?.timing === "AFTER_PUBLIC_COMPLETION_SUCCESSORS_AND_VERIFIED_INSTALLATION", "post-release legacy Suite Cutover milestone timing is invalid");
  required(cutoverMilestone?.targetVersion === value?.versionPolicy?.currentWorkingVersion, "post-release legacy Suite Cutover must bind the Runtime completion successor");
  for (const milestone of milestones.filter((item) => item.status === "DEFERRED")) {
    const destination = milestones.find((item) => item.id === milestone.deferredInto);
    required(typeof milestone.deferredInto === "string" && destination != null, `DEFERRED milestone must name a declared deferredInto milestone: ${milestone.id}`);
    required(milestone.standaloneReleaseEligible === false, `DEFERRED milestone must disable standalone release eligibility: ${milestone.id}`);
    required(["IN_PROGRESS", "COMPLETE"].includes(destination?.status), `DEFERRED milestone destination must be IN_PROGRESS or COMPLETE: ${milestone.id}`);
    required(destination?.inheritsMilestone === milestone.id, `DEFERRED milestone destination must declare inheritsMilestone: ${milestone.id}`);
    required(Array.isArray(destination?.inheritedAcceptance) && destination.inheritedAcceptance.length > 0, `DEFERRED milestone destination must declare inheritedAcceptance: ${milestone.id}`);
    const transition = (value?.transitionPolicies ?? []).find((item) => item.sourceMilestone === milestone.id && item.destinationMilestone === milestone.deferredInto);
    required(transition?.sourceReleaseDisposition === "DEFERRED", `DEFERRED milestone must have a matching transition policy: ${milestone.id}`);
    required(transition?.preserveSourceCodeAndEvidence === true && transition?.deleteSourceGuarantees === false && transition?.destinationMustRetestSourceAcceptance === true, `DEFERRED milestone transition must preserve and retest source guarantees: ${milestone.id}`);
  }
  const packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const knownVersions = new Set([value?.versionPolicy?.publishedBaseline, value?.versionPolicy?.currentWorkingVersion, ...(value?.milestones ?? []).filter((item) => item.product === value?.versionPolicy?.runtimeProduct).map((item) => item.targetVersion)]);
  required(knownVersions.has(packageVersion), `package version ${packageVersion} is not declared by the Roadmap`);
  required(fs.existsSync(path.join(root, "docs/roadmap/ROADMAP.md")), "docs/roadmap/ROADMAP.md is missing");
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  required(agents.includes("Roadmap Gate"), "AGENTS.md must require the Roadmap Gate");
  const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
  required(packageJson.includes('"roadmap:check"'), "package.json must expose roadmap:check");
  required(packageJson.includes('"roadmap:gate"'), "package.json must expose roadmap:gate");
  required(packageJson.includes('"roadmap:release"'), "package.json must expose roadmap:release");
  return failures;

  function required(condition, message) {
    if (!condition) failures.push(message);
  }

  function validateCompletionSuccessor(milestone, predecessorVersion, successorVersion, label) {
    required(milestone?.targetVersion === successorVersion, `${label} completion successor must target ${successorVersion}`);
    required(milestone?.publishedPredecessor?.version === predecessorVersion, `${label} published predecessor must be ${predecessorVersion}`);
    required(milestone?.publishedPredecessor?.state === "PUBLISHED_DISTRIBUTION_REMEDIATION_REQUIRED", `${label} predecessor state must preserve the completion-remediation finding`);
    required(milestone?.publishedPredecessor?.immutable === true, `${label} published predecessor must remain immutable`);
    required(milestone?.publishedPredecessor?.acceptanceEvidenceDisposition === "HISTORICAL_PROCESS_EVIDENCE_NOT_COMPLETION_PROOF", `${label} predecessor evidence must not count as completion proof`);
    if (milestone?.status === "COMPLETE") {
      const report = milestone?.completionEvidence;
      required(report?.schema === "evopilot-approved-scheme-completion-report/v1", `${label} COMPLETE requires a completion report`);
      required(report?.total === report?.passed && report?.total > 0, `${label} COMPLETE requires total == passed > 0`);
      for (const key of ["failed", "pending", "stale", "generic", "unmapped"]) required(report?.[key] === 0, `${label} COMPLETE requires ${key}=0`);
      required(report?.noRegression === "PASSED", `${label} COMPLETE requires NO_REGRESSION PASSED`);
      required(report?.exactInstalledCandidatePair === "VERIFIED", `${label} COMPLETE requires the exact installed Candidate pair VERIFIED`);
    }
  }
}

function classifyIntent(rawIntent, value) {
  const normalized = normalize(rawIntent);
  if (!normalized) return decision("UNKNOWN", [], [], ["Intent is empty or not classifiable."], "NONE");

  const boundaryMatches = (value.boundaryRules ?? []).filter((rule) => matches(normalized, rule.signals));
  if (boundaryMatches.length > 0) {
    return decision("BOUNDARY_CHANGE", [], [], boundaryMatches.map((rule) => `${rule.id}: ${rule.reason}`), "REPLACEMENT_ADR_REQUIRED");
  }
  if (matches(normalized, value.deviationSignals ?? [])) {
    return decision("DEVIATION", [], [], ["Intent explicitly changes the accepted Roadmap, milestone order, or product boundary."], "ROADMAP_REVISION_REQUIRED");
  }

  const matchingMilestones = value.milestones.filter((milestone) => matches(normalized, milestone.signals));
  const deferredMatches = matchingMilestones.filter((milestone) => milestone.status === "DEFERRED");
  const matchedMilestones = matchingMilestones.filter((milestone) => milestone.status !== "DEFERRED").map((milestone) => milestone.id);
  const matchedStandingItems = value.standingWork.filter((item) => matches(normalized, item.signals));
  const capabilityExpansion = matches(normalized, value.intentPolicy?.capabilityExpansionSignals ?? []);
  const alignedStandingItems = matchedStandingItems.filter((item) => !capabilityExpansion || item.allowsCapabilityExpansion === true);
  const matchedStandingWork = matchedStandingItems.map((item) => item.id);
  if (matchedMilestones.length > 0 || alignedStandingItems.length > 0) {
    return decision("ALIGNED", matchedMilestones, alignedStandingItems.map((item) => item.id), ["Intent matches declared Roadmap work."], "NONE");
  }
  if (deferredMatches.length > 0) {
    return decision("DEVIATION", deferredMatches.map((item) => item.id), [], ["Intent matches only a DEFERRED milestone; explicit Roadmap reactivation is required."], "ROADMAP_REVISION_REQUIRED");
  }
  if (matchedStandingWork.length > 0 && capabilityExpansion) {
    return decision("UNPLANNED", [], matchedStandingWork, ["Standing-work wording cannot authorize a product capability expansion."], "USER_REVIEW_REQUIRED");
  }
  return decision("UNPLANNED", [], [], ["Intent does not match a declared milestone or standing maintenance class."], "USER_REVIEW_REQUIRED");
}

function classifyRelease(version, product, value) {
  if (!semver(version)) return { classification: "UNKNOWN", matchedMilestones: [], reasons: [`Release version is not SemVer: ${version}`] };
  const knownProducts = new Set([value.versionPolicy.runtimeProduct, value.evolutionExpertPolicy.product]);
  if (!knownProducts.has(product)) return { classification: "UNKNOWN", matchedMilestones: [], reasons: [`Unknown release product: ${product}`] };
  const versionPolicy = product === value.versionPolicy.runtimeProduct ? value.versionPolicy : value.evolutionExpertPolicy;
  const exactBaseline = [versionPolicy.publishedBaseline, versionPolicy.currentWorkingVersion].includes(version);
  const matchingMilestones = value.milestones.filter((milestone) => milestone.product === product && (version === milestone.targetVersion || inReleaseLine(version, milestone.releaseLine)));
  const matchedMilestones = matchingMilestones.map((milestone) => milestone.id);
  const eligibleMilestones = matchingMilestones.filter((milestone) => milestone.status !== "DEFERRED" && milestone.standaloneReleaseEligible !== false);
  if (matchingMilestones.length > 0 && eligibleMilestones.length === 0) {
    return { classification: "UNPLANNED", matchedMilestones, reasons: [`Release ${version} matches only a DEFERRED milestone and requires explicit Roadmap reactivation.`] };
  }
  if (exactBaseline || eligibleMilestones.length > 0) return { classification: "ALIGNED", matchedMilestones: eligibleMilestones.map((milestone) => milestone.id), reasons: [`Release ${product} ${version} is declared by the Roadmap.`] };
  return { classification: "UNPLANNED", matchedMilestones: [], reasons: [`Release ${product} ${version} is outside every declared baseline and release line.`] };
}

function baseResult(classification, details) {
  return {
    schema: "evopilot-roadmap-gate-result/v1",
    roadmapFamily: roadmap.roadmapFamily,
    contractVersion: roadmap.contractVersion,
    roadmapDigest: `sha256:${crypto.createHash("sha256").update(fs.readFileSync(contractPath)).digest("hex")}`,
    project: roadmap.project,
    classification,
    ...details
  };
}

function decision(classification, matchedMilestones, matchedStandingWork, reasons, boundaryImpact) {
  return {
    classification,
    intent,
    matchedMilestones,
    matchedStandingWork,
    reasons,
    boundaryImpact,
    approvalRequired: classification !== "ALIGNED",
    nextAction: classification === "ALIGNED" ? "continue-with-scoped-implementation" : classification === "BOUNDARY_CHANGE" ? "stop-and-propose-replacement-adr-and-roadmap-revision" : "stop-and-request-user-review"
  };
}

function matches(text, signals) {
  return signals.some((signal) => text.includes(normalize(signal)));
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function semver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(value ?? ""));
}

function arrayEquals(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function inReleaseLine(version, line) {
  const [major, minor] = version.split(".");
  return `${major}.${minor}.x` === line;
}

function option(name) {
  const equal = args.find((arg) => arg.startsWith(`${name}=`));
  if (equal) return equal.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args.length > index + 1 && !args[index + 1].startsWith("--") ? args[index + 1] : undefined;
}

function positionalAfter(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function emit(result, exitCode) {
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Roadmap Gate: ${result.classification}`);
    console.log(`Project: ${result.project}`);
    if (result.intent) console.log(`Intent: ${result.intent}`);
    for (const reason of result.reasons ?? result.errors ?? []) console.log(`- ${reason}`);
    console.log(`Next action: ${result.nextAction}`);
  }
  process.exit(exitCode);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
