import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { createApprovedSchemeInventory, createCompletionTrace } from "../packages/core/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.env.EVOPILOT_V5_COMPLETION_CONTRACT
  ? path.resolve(process.env.EVOPILOT_V5_COMPLETION_CONTRACT)
  : path.join(root, "governance/acceptance/v5-completion-contract.json");
const runtimeId = "evopilot-v5.1.0-suite-capability-convergence";
const expertId = "evopilot-evolution-expert-v1.1.0-unified-host-entry";
const runtime = readJson(`governance/targets/${runtimeId}.json`);
const expert = readJson(`governance/targets/${expertId}.json`);
const predecessorRuntime = readJson("governance/targets/evopilot-v5.0.1-harness-guided-completion-recovery.json");
const predecessorExpert = readJson("governance/targets/evopilot-evolution-expert-v1.0.1-completion-recovery.json");
const roadmap = parseYaml(fs.readFileSync(path.join(root, "governance/roadmap.yaml"), "utf8"));

if (isImmutableHistoricalContract(roadmap)) {
  if (!process.argv.includes("--check")) {
    console.error("v5 completion contract is immutable after the v5.1 release line is superseded");
    process.exit(1);
  }
  validateHistoricalContract();
  process.exit(0);
}

const requirements = [];
addTargetRequirements("V5RUNTIME", predecessorRuntime, "TARGET", "governance/targets/evopilot-v5.0.0-harness-guided-governed-evolution-runtime.json");
addTargetRequirements("V5EXPERT", predecessorExpert, "TARGET", "governance/targets/evopilot-evolution-expert-v1.0.0.json");
for (const [index, statement] of [...runtime.scope.include, ...expert.scope.include].entries()) {
  const runtimeStatement = index < runtime.scope.include.length;
  requirements.push({ id: `CONVERGENCE-${String(index + 1).padStart(2, "0")}`, sourceRef: runtimeStatement ? `governance/targets/${runtimeId}.json#scope.include.${index}` : `governance/targets/${expertId}.json#scope.include.${index - runtime.scope.include.length}`, sourceDigest: runtimeStatement ? fileDigest(`governance/targets/${runtimeId}.json`) : fileDigest(`governance/targets/${expertId}.json`), statement, kind: runtimeStatement ? "RUNTIME_5_1" : "EXPERT_1_1" });
}
for (const milestone of (roadmap.milestones ?? []).filter((item) => ["evopilot-5.1-suite-capability-convergence", "evopilot-evolution-expert-1.1-unified-host-entry"].includes(item.id))) {
  for (const [index, statement] of [...(milestone.scope ?? []), ...(milestone.acceptance ?? [])].entries()) requirements.push({ id: `ROADMAP-${milestone.id}-${String(index + 1).padStart(2, "0")}`, sourceRef: `governance/roadmap.yaml#${milestone.id}.${index}`, sourceDigest: fileDigest("governance/roadmap.yaml"), statement: typeof statement === "string" ? statement : JSON.stringify(statement), kind: "ROADMAP" });
}

const inventory = createApprovedSchemeInventory({ campaignId: "evopilot-runtime-5.1.0-expert-1.1.0-suite-capability-convergence", requirements });
const current = [...criteria(runtime, runtimeId), ...criteria(expert, expertId)];
const links = inventory.requirements.map((requirement) => {
  const target = requirement.id.includes("EXPERT") || /Expert|Host Adapter/i.test(requirement.statement) ? expert : runtime;
  const targetId = target.id;
  const available = criteria(target, targetId);
  const acceptanceIds = bestCriteria(requirement.statement, available);
  const validatorIds = acceptanceIds.map((id) => validatorId(targetId, id));
  const terminalE2EIds = (target.realCaseCoverage ?? []).filter((item) => item.coversAcceptanceIds?.some((id) => acceptanceIds.includes(id))).map((item) => item.id);
  return { requirementId: requirement.id, targetIds: [targetId], acceptanceIds, deliverables: deliverablesFor(targetId, acceptanceIds), validatorIds, terminalE2EIds };
});
const trace = createCompletionTrace(inventory, links);
const validators = current.map((criterion) => ({
  id: validatorId(criterion.targetId, criterion.criterionId),
  targetId: criterion.targetId,
  criterionId: criterion.criterionId,
  criterion: criterion.criterion,
  requiredEvidence: criterion.requiredEvidence,
  requiredHosts: criterion.requiredHosts,
  prohibitedEffects: criterion.prohibitedEffects,
  command: `node scripts/run-v5-criterion-validator.mjs --target ${criterion.targetId} --criterion ${criterion.criterionId}`,
  evidenceClass: criterion.requiredHosts.some((host) => host.toLowerCase() === "workbuddy") ? "DESIGNATED_HUMAN" : "MACHINE",
  candidateRequired: true,
  independent: true
}));
const contractMaterial = {
  schema: "evopilot-v5-completion-contract/v2",
  campaignId: inventory.campaignId,
  targetBindings: [targetBinding(runtime), targetBinding(expert)],
  inventory,
  trace,
  requiredCriteria: current,
  validators,
  completionRule: "capabilityInventory=100%; total=passed; failed=pending=stale=warning=generic=unmapped=0; exactCandidatePairVerified=true; impactClosure=PASS; noRegression=PASS; legacySuiteInvocation=0",
  generatedFrom: ["governance/roadmap.yaml", `governance/targets/${runtimeId}.json`, `governance/targets/${expertId}.json`, "governance/targets/evopilot-v5.0.1-harness-guided-completion-recovery.json", "governance/targets/evopilot-evolution-expert-v1.0.1-completion-recovery.json", "governance/suite-convergence/capability-inventory.json"]
};
const contract = { ...contractMaterial, digest: sha(contractMaterial) };
const content = `${JSON.stringify(contract, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== content) {
    console.error("v5 completion contract is missing or stale");
    process.exit(1);
  }
  console.log(`v5 completion contract current: requirements=${inventory.requirements.length} criteria=${current.length} digest=${contract.digest}`);
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, content);
  console.log(`wrote ${path.relative(root, output)} ${contract.digest}`);
}

function addTargetRequirements(prefix, target, kind, relative) {
  const sourceDigest = fileDigest(relative);
  for (const [section, values] of [["scope", target.scope?.include ?? []], ["acceptance", target.acceptance ?? []], ["e2e", target.realCaseCoverage ?? []]]) {
    for (const [index, value] of values.entries()) requirements.push({ id: `${prefix}-${section.toUpperCase()}-${value.id ?? String(index + 1).padStart(2, "0")}`, sourceRef: `${relative}#${section}.${value.id ?? index}`, sourceDigest, statement: typeof value === "string" ? value : value.criterion ?? value.scenario, kind });
  }
}

function criteria(target, targetId) {
  const values = [
    ...(target.acceptance ?? []).map((item) => ({ item, source: "CURRENT" })),
    ...(target.inheritedAcceptance ?? []).map((item) => ({ item, source: "INHERITED" })),
    ...(target.realCaseCoverage ?? []).map((item) => ({ item, source: "E2E" }))
  ];
  return values.map(({ item, source }) => ({
    targetId,
    criterionId: item.id,
    source,
    criterion: item.criterion ?? item.scenario ?? item.origin ?? item.id,
    requiredEvidence: item.requiredEvidence ?? item.evidenceRef ?? "criterion-specific evidence required by the bound Target",
    requiredHosts: [...(item.hosts ?? [])],
    prohibitedEffects: [...(item.prohibitedEffects ?? [])]
  }));
}

function bestCriteria(statement, available) {
  const words = tokens(statement);
  const scored = available.map((item) => {
    const target = item.targetId === runtimeId ? runtime : expert;
    const source = [...(target.acceptance ?? []), ...(target.inheritedAcceptance ?? []), ...(target.realCaseCoverage ?? [])].find((entry) => entry.id === item.criterionId);
    const text = source?.criterion ?? source?.scenario ?? source?.origin ?? item.criterionId;
    return { id: item.criterionId, score: [...tokens(text)].filter((word) => words.has(word)).length };
  }).sort((left, right) => right.score - left.score || compareText(left.id, right.id));
  const selected = scored.filter((item) => item.score > 0).slice(0, 4).map((item) => item.id);
  return selected.length ? selected : [available.find((item) => item.criterionId === "TRACE02")?.criterionId ?? available[0].criterionId];
}

function tokens(value) {
  return new Set(String(value).toLowerCase().match(/[a-z][a-z0-9-]{3,}|[\u4e00-\u9fff]{2,}/g) ?? []);
}

function deliverablesFor(targetId, ids) {
  const base = targetId === runtimeId ? ["packages/core", "packages/server", "schemas/governed-evolution", "docs"] : ["packages/evolution-expert", "packages/adapter-mcp", "docs/guides/evolution-expert.md"];
  if (ids.some((id) => id.startsWith("TRACE"))) base.push("governance/acceptance/v5-completion-contract.json");
  return base;
}

function validatorId(targetId, criterionId) { return `validate-${targetId}-${criterionId}`; }
function targetBinding(target) { return { id: target.id, revision: target.revision, authorizationDigest: target.approvals.target.authorizationDigest, fileDigest: fileDigest(`governance/targets/${target.id}.json`) }; }
function readJson(relative) { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); }
function fileDigest(relative) { return `sha256:${createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex")}`; }
function sha(value) { return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`; }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => compareText(a, b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`; return JSON.stringify(value); }
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function isImmutableHistoricalContract(currentRoadmap) {
  const status = (id) => currentRoadmap.milestones?.find((milestone) => milestone.id === id)?.status;
  return currentRoadmap.versionPolicy?.currentWorkingVersion === "6.0.0"
    && currentRoadmap.evolutionExpertPolicy?.currentWorkingVersion === "2.0.0"
    && status("evopilot-5.1-suite-capability-convergence") === "SUPERSEDED"
    && status("evopilot-evolution-expert-1.1-unified-host-entry") === "SUPERSEDED"
    && status("evopilot-6.0-agent-native-lifecycle-control-plane") === "IN_PROGRESS"
    && status("evopilot-evolution-expert-2.0-agent-host-entry") === "IN_PROGRESS";
}

function validateHistoricalContract() {
  const errors = [];
  if (!fs.existsSync(output)) {
    console.error("historical v5 completion contract is missing");
    process.exit(1);
  }

  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(output, "utf8"));
  } catch (error) {
    console.error(`historical v5 completion contract is not valid JSON: ${error.message}`);
    process.exit(1);
  }

  const { digest, ...material } = contract;
  if (contract.schema !== "evopilot-v5-completion-contract/v2") errors.push("schema does not match v2");
  if (contract.campaignId !== "evopilot-runtime-5.1.0-expert-1.1.0-suite-capability-convergence") errors.push("campaign binding changed");
  if (digest !== sha(material)) errors.push("self-digest does not match immutable content");

  const expectedBindings = [targetBinding(runtime), targetBinding(expert)];
  if (stable(contract.targetBindings) !== stable(expectedBindings)) errors.push("Target bindings do not match the completed v5.1 Runtime and Expert Targets");
  if (contract.inventory?.campaignId !== contract.campaignId) errors.push("inventory campaign binding changed");
  if (contract.inventory?.requirements?.length !== 170) errors.push("historical requirement inventory must contain 170 entries");
  if (contract.requiredCriteria?.length !== 236) errors.push("historical acceptance inventory must contain 236 criteria");
  if (contract.validators?.length !== 236) errors.push("historical validator inventory must contain 236 validators");
  if (contract.validators?.some((validator) => validator.candidateRequired !== true || validator.independent !== true)) errors.push("historical validators must remain Candidate-bound and independent");

  if (errors.length > 0) {
    console.error(`historical v5 completion contract is invalid: ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log(`historical v5 completion contract verified: requirements=170 criteria=236 digest=${contract.digest}`);
}
