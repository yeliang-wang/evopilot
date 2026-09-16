import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApprovedSchemeInventory, createCompletionTrace } from "../packages/core/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const runtimeId = "evopilot-v6.1.0-controlled-lifecycle-evolution";
const expertId = "evopilot-evolution-expert-v2.1.0-controlled-lifecycle-evolution";
const runtimePath = process.env.EVOPILOT_V61_RUNTIME_TARGET
  ? path.resolve(process.env.EVOPILOT_V61_RUNTIME_TARGET)
  : path.join(root, `governance/targets/${runtimeId}.json`);
const expertPath = process.env.EVOPILOT_V61_EXPERT_TARGET
  ? path.resolve(process.env.EVOPILOT_V61_EXPERT_TARGET)
  : path.join(root, `governance/targets/${expertId}.json`);
const baselinePath = process.env.EVOPILOT_V61_BASELINE_CONTRACT
  ? path.resolve(process.env.EVOPILOT_V61_BASELINE_CONTRACT)
  : path.join(root, "governance/acceptance/v6-completion-contract.json");
const crossPath = process.env.EVOPILOT_V61_CROSS_ACCEPTANCE_MAP
  ? path.resolve(process.env.EVOPILOT_V61_CROSS_ACCEPTANCE_MAP)
  : path.join(root, "governance/acceptance/runtime-6.1.0-expert-2.1.0-cross-acceptance-map.json");
const contractPath = process.env.EVOPILOT_V61_COMPLETION_CONTRACT
  ? path.resolve(process.env.EVOPILOT_V61_COMPLETION_CONTRACT)
  : path.join(root, "governance/acceptance/v61-completion-contract.json");

const runtime = readJson(runtimePath);
const expert = readJson(expertPath);
const baseline = readJson(baselinePath);
const originalCross = readJson(crossPath);
const currentCriteria = [
  ...criteria(runtime, "CURRENT"),
  ...criteria(expert, "CURRENT")
];
const inheritedCriteria = baseline.requiredCriteria.map((criterion) => ({
  ...criterion,
  source: "INHERITED_PUBLISHED_V6",
  inheritedFrom: "governance/acceptance/v6-completion-contract.json"
}));
const requiredCriteria = [...currentCriteria, ...inheritedCriteria];
assertUnique(requiredCriteria.map(key), "criterion");

const validators = requiredCriteria.map((criterion) => ({
  id: `validate-v61-${criterion.targetId}-${criterion.criterionId}`,
  targetId: criterion.targetId,
  criterionId: criterion.criterionId,
  criterion: criterion.criterion,
  requiredEvidence: criterion.requiredEvidence,
  requiredHosts: criterion.requiredHosts,
  prohibitedEffects: criterion.prohibitedEffects,
  command: `node scripts/run-v61-criterion-validator.mjs --target ${criterion.targetId} --criterion ${criterion.criterionId}`,
  evidenceClass: criterion.requiredHosts.some((host) => host.toLowerCase() === "workbuddy") ? "DESIGNATED_HUMAN" : "MACHINE",
  candidateRequired: true,
  installedArtifactRequired: true,
  independent: true
}));

const requirements = requiredCriteria.map((criterion, index) => ({
  id: `V61-REQ-${String(index + 1).padStart(3, "0")}`,
  sourceRef: criterion.source === "INHERITED_PUBLISHED_V6"
    ? `governance/acceptance/v6-completion-contract.json#requiredCriteria.${index - currentCriteria.length}`
    : `governance/targets/${criterion.targetId}.json#${criterion.sourceSection}.${criterion.sourceIndex}`,
  sourceDigest: criterion.source === "INHERITED_PUBLISHED_V6" ? fileDigest(baselinePath) : fileDigest(criterion.targetId === runtimeId ? runtimePath : expertPath),
  statement: criterion.criterion,
  kind: "TARGET"
}));
const campaignId = "evopilot-runtime-6.1.0-expert-2.1.0-controlled-lifecycle-evolution";
const inventory = createApprovedSchemeInventory({ campaignId, requirements });
const trace = createCompletionTrace(inventory, requirements.map((requirement, index) => {
  const criterion = requiredCriteria[index];
  const validator = validators[index];
  return {
    requirementId: requirement.id,
    targetIds: [criterion.targetId],
    acceptanceIds: [criterion.criterionId],
    deliverables: deliverablesFor(criterion),
    validatorIds: [validator.id],
    terminalE2EIds: criterion.sourceSection === "realCaseCoverage" ? [criterion.criterionId] : []
  };
}));

if (isAcceptedProjectionState()) {
  if (!check) {
    console.error("v6.1 completion contract is immutable after exact Candidate acceptance has been projected");
    process.exit(1);
  }
  validateAcceptedContract();
  process.exit(0);
}

const crossMaterial = {
  ...withoutDigest(originalCross),
  status: "IMPLEMENTED_AWAITING_CANDIDATE_ACCEPTANCE",
  bindings: { runtime: targetBinding(runtime, runtimePath), expert: targetBinding(expert, expertPath) }
};
const cross = { ...crossMaterial, digest: sha(crossMaterial) };
const contractMaterial = {
  schema: "evopilot-v61-completion-contract/v1",
  campaignId,
  status: "IMPLEMENTED_AWAITING_CANDIDATE_ACCEPTANCE",
  targetBindings: [targetBinding(runtime, runtimePath), targetBinding(expert, expertPath)],
  publishedBaseline: {
    path: "governance/acceptance/v6-completion-contract.json",
    fileDigest: fileDigest(baselinePath),
    contractDigest: baseline.digest,
    requiredCriteria: baseline.requiredCriteria.length,
    disposition: "INHERIT_ALL_NO_EXCLUSIONS"
  },
  inventory,
  trace,
  requiredCriteria,
  validators,
  crossAcceptanceRef: {
    path: "governance/acceptance/runtime-6.1.0-expert-2.1.0-cross-acceptance-map.json",
    fileDigest: fileDigestOfContent(`${JSON.stringify(cross, null, 2)}\n`),
    digest: cross.digest
  },
  requiredCandidatePair: { runtime: "6.1.0", expert: "2.1.0", installationMode: "ISOLATED_PACKAGED_CANDIDATES", exactBytes: true },
  counts: { runtimeCurrent: runtime.acceptance.length, runtimeE2E: runtime.realCaseCoverage.length, expertCurrent: expert.acceptance.length, expertE2E: expert.realCaseCoverage.length, inheritedPublishedV6: baseline.requiredCriteria.length, total: requiredCriteria.length },
  completionRule: "total=passed=305; failed=pending=stale=warning=generic=unmapped=silentExclusions=legacySuiteInvocationCount=0; exact Runtime 6.1.0 and Expert 2.1.0 installed Candidate pair verified; all ten cross rows, impact closure, and NO_REGRESSION pass",
  generatedFrom: [`governance/targets/${runtimeId}.json`, `governance/targets/${expertId}.json`, "governance/acceptance/v6-completion-contract.json"]
};
const contract = { ...contractMaterial, digest: sha(contractMaterial) };
writeOrCheck(crossPath, `${JSON.stringify(cross, null, 2)}\n`, "v6.1 cross acceptance map");
writeOrCheck(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "v6.1 completion contract");
console.log(`v6.1 completion contract ${check ? "current" : "written"}: current=${currentCriteria.length} inherited=${inheritedCriteria.length} total=${requiredCriteria.length} cross=${cross.rows.length} digest=${contract.digest}`);

function criteria(target, source) {
  return [["acceptance", target.acceptance], ["realCaseCoverage", target.realCaseCoverage]].flatMap(([sourceSection, entries]) => entries.map((item, sourceIndex) => ({
    targetId: target.id,
    criterionId: item.id,
    source,
    sourceSection,
    sourceIndex,
    criterion: item.criterion ?? item.scenario ?? item.id,
    requiredEvidence: item.requiredEvidence ?? "criterion-specific evidence required by the exact approved Target",
    requiredHosts: [...(item.hosts ?? [])],
    prohibitedEffects: [...(item.prohibitedEffects ?? [])]
  })));
}

function deliverablesFor(criterion) {
  if (criterion.source === "INHERITED_PUBLISHED_V6") return ["governance/acceptance/v6-completion-contract.json", "exact Runtime 6.1.0 and Expert 2.1.0 Candidate pair"];
  if (criterion.targetId === runtimeId) return ["packages/core", "packages/server", "packages/adapter-mcp", "schemas/governed-evolution", "docs"];
  return ["packages/evolution-expert", "packages/adapter-mcp", "docs/guides/evolution-expert.md"];
}

function targetBinding(target, sourcePath) {
  return { id: target.id, revision: target.revision, authorizationDigest: target.approvals.target.authorizationDigest, fileDigest: fileDigest(sourcePath) };
}
function withoutDigest(value) { return Object.fromEntries(Object.entries(value).filter(([name]) => name !== "digest")); }
function key(value) { return `${value.targetId}#${value.criterionId}`; }
function assertUnique(values, label) { if (new Set(values).size !== values.length) throw new Error(`DUPLICATE_${label.toUpperCase()}`); }
function readJson(sourcePath) { return JSON.parse(fs.readFileSync(sourcePath, "utf8")); }
function fileDigest(sourcePath) { return fileDigestOfContent(fs.readFileSync(sourcePath)); }
function fileDigestOfContent(content) { return `sha256:${createHash("sha256").update(content).digest("hex")}`; }
function sha(value) { return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`; }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => compare(a, b)).map(([name, child]) => `${JSON.stringify(name)}:${stable(child)}`).join(",")}}`; return JSON.stringify(value); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function writeOrCheck(sourcePath, content, label) {
  if (check) {
    if (!fs.existsSync(sourcePath) || fs.readFileSync(sourcePath, "utf8") !== content) throw new Error(`${label} is missing or stale`);
    return;
  }
  fs.writeFileSync(sourcePath, content);
}

function isAcceptedProjectionState() {
  return [runtime, expert].every((target) =>
    target.status === "RELEASE_AUTHORIZED"
    && target.approvals?.release?.decision === "AUTHORIZED"
    && /^sha256:[0-9a-f]{64}$/.test(target.approvals?.release?.authorizationDigest ?? "")
    && target.noRegression?.status === "PASSED"
    && [target.acceptance, target.realCaseCoverage]
      .flat()
      .every((item) => item.status === "PASSED" && Array.isArray(item.evidenceRefs) && item.evidenceRefs.length > 0)
  );
}

function validateAcceptedContract() {
  const errors = [];
  if (!fs.existsSync(contractPath)) {
    console.error("immutable accepted v6.1 completion contract is missing");
    process.exit(1);
  }

  let acceptedContract;
  try {
    acceptedContract = readJson(contractPath);
  } catch (error) {
    console.error(`immutable accepted v6.1 completion contract is not valid JSON: ${error.message}`);
    process.exit(1);
  }

  const { digest, ...material } = acceptedContract;
  if (acceptedContract.schema !== "evopilot-v61-completion-contract/v1") errors.push("schema does not match v1");
  if (acceptedContract.campaignId !== campaignId) errors.push("campaign binding changed");
  if (digest !== sha(material)) errors.push("self-digest does not match immutable content");

  const immutableBindings = acceptedContract.targetBindings?.map(withoutMutableBindingFields);
  const currentBindings = [runtime, expert].map((target) => ({
    id: target.id,
    revision: target.revision,
    authorizationDigest: target.approvals.target.authorizationDigest
  }));
  if (stable(immutableBindings) !== stable(currentBindings)) errors.push("Target revision or authorization binding changed");

  if (acceptedContract.requiredCriteria?.length !== 305 || acceptedContract.validators?.length !== 305) {
    errors.push("immutable acceptance inventory must contain exactly 305 criteria and validators");
  }
  if (stable(acceptedContract.requiredCriteria) !== stable(requiredCriteria)) errors.push("Target criterion semantics changed after acceptance");
  if (stable(acceptedContract.validators) !== stable(validators)) errors.push("criterion validator contract changed after acceptance");

  const immutableRequirements = acceptedContract.inventory?.requirements?.map(withoutSourceDigest);
  const currentRequirements = requirements.map(withoutSourceDigest);
  if (stable(immutableRequirements) !== stable(currentRequirements)) errors.push("Target requirement semantics changed after acceptance");
  const immutableInventory = createApprovedSchemeInventory({
    campaignId: acceptedContract.inventory?.campaignId,
    requirements: acceptedContract.inventory?.requirements ?? []
  });
  if (immutableInventory.digest !== acceptedContract.inventory?.digest) errors.push("immutable requirement inventory digest is invalid");
  const immutableTrace = createCompletionTrace(immutableInventory, acceptedContract.trace?.links ?? []);
  if (immutableTrace.digest !== acceptedContract.trace?.digest) errors.push("immutable completion trace digest is invalid");

  if (acceptedContract.publishedBaseline?.path !== "governance/acceptance/v6-completion-contract.json"
    || acceptedContract.publishedBaseline?.fileDigest !== fileDigest(baselinePath)
    || acceptedContract.publishedBaseline?.contractDigest !== baseline.digest
    || acceptedContract.publishedBaseline?.requiredCriteria !== 253
    || acceptedContract.publishedBaseline?.disposition !== "INHERIT_ALL_NO_EXCLUSIONS") {
    errors.push("published v6 baseline binding changed after acceptance");
  }
  if (stable(acceptedContract.counts) !== stable({ runtimeCurrent: 17, runtimeE2E: 13, expertCurrent: 12, expertE2E: 10, inheritedPublishedV6: 253, total: 305 })) {
    errors.push("immutable completion counts changed");
  }

  const acceptedCross = readJson(crossPath);
  const { digest: crossDigest, ...crossMaterial } = acceptedCross;
  if (acceptedCross.schema !== "evopilot-runtime-expert-cross-acceptance-map/v3" || acceptedCross.rows?.length !== 10) {
    errors.push("cross-acceptance contract must retain exactly ten rows");
  }
  if (crossDigest !== sha(crossMaterial)) errors.push("cross-acceptance self-digest is invalid");
  if (stable(Object.values(acceptedCross.bindings ?? {}).map(withoutMutableBindingFields)) !== stable(currentBindings)) {
    errors.push("cross-acceptance Target revision or authorization binding changed");
  }
  if (acceptedContract.crossAcceptanceRef?.path !== "governance/acceptance/runtime-6.1.0-expert-2.1.0-cross-acceptance-map.json"
    || acceptedContract.crossAcceptanceRef?.fileDigest !== fileDigest(crossPath)
    || acceptedContract.crossAcceptanceRef?.digest !== acceptedCross.digest) {
    errors.push("cross-acceptance contract binding changed after acceptance");
  }

  if (errors.length > 0) {
    console.error(`immutable accepted v6.1 completion contract is invalid: ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log(`immutable accepted v6.1 completion contract verified: criteria=305 cross=10 digest=${acceptedContract.digest}`);
}

function withoutMutableBindingFields(value) {
  return {
    id: value.id,
    revision: value.revision,
    authorizationDigest: value.authorizationDigest
  };
}

function withoutSourceDigest(value) {
  const { sourceDigest: _sourceDigest, ...result } = value;
  return result;
}
