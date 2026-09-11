import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApprovedSchemeInventory, createCompletionTrace } from "../packages/core/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const runtimeId = "evopilot-v6.0.0-agent-native-lifecycle-control-plane";
const expertId = "evopilot-evolution-expert-v2.0.0-agent-host-entry";
const runtime = readJson(`governance/targets/${runtimeId}.json`);
const expert = readJson(`governance/targets/${expertId}.json`);
const targets = [runtime, expert];
const campaignId = "evopilot-runtime-6.0.0-expert-2.0.0-agent-native-lifecycle-control-plane";

const requirements = [];
for (const target of targets) {
  const targetPath = `governance/targets/${target.id}.json`;
  const sourceDigest = fileDigest(targetPath);
  for (const [index, statement] of target.scope.include.entries()) {
    requirements.push({ id: `${target.id}-SCOPE-${String(index + 1).padStart(2, "0")}`, sourceRef: `${targetPath}#scope.include.${index}`, sourceDigest, statement, kind: "TARGET_SCOPE", targetId: target.id });
  }
  for (const [section, entries] of [["acceptance", target.acceptance], ["inheritedAcceptance", target.inheritedAcceptance], ["realCaseCoverage", target.realCaseCoverage]]) {
    for (const entry of entries) requirements.push({ id: `${target.id}-${section}-${entry.id}`, sourceRef: `${targetPath}#${section}.${entry.id}`, sourceDigest, statement: entry.criterion ?? entry.scenario ?? entry.origin, kind: section, targetId: target.id, criterionId: entry.id });
  }
}

const inventory = createApprovedSchemeInventory({ campaignId, requirements: requirements.map(({ targetId: _targetId, criterionId: _criterionId, ...item }) => item) });
const requiredCriteria = targets.flatMap(criteria);
const links = inventory.requirements.map((requirement) => {
  const enriched = requirements.find((item) => item.id === requirement.id);
  const target = enriched?.targetId === expertId ? expert : runtime;
  const targetCriteria = requiredCriteria.filter((item) => item.targetId === target.id);
  const acceptanceIds = enriched?.criterionId ? [enriched.criterionId] : bestCriteria(requirement.statement, targetCriteria);
  return {
    requirementId: requirement.id,
    targetIds: [target.id],
    acceptanceIds,
    deliverables: deliverablesFor(target.id, acceptanceIds),
    validatorIds: acceptanceIds.map((id) => validatorId(target.id, id)),
    terminalE2EIds: acceptanceIds.filter((id) => target.realCaseCoverage.some((entry) => entry.id === id))
  };
});
const trace = createCompletionTrace(inventory, links);
const validators = requiredCriteria.map((criterion) => ({
  id: validatorId(criterion.targetId, criterion.criterionId),
  targetId: criterion.targetId,
  criterionId: criterion.criterionId,
  criterion: criterion.criterion,
  requiredEvidence: criterion.requiredEvidence,
  requiredHosts: criterion.requiredHosts,
  prohibitedEffects: criterion.prohibitedEffects,
  command: `node scripts/run-v6-criterion-validator.mjs --target ${criterion.targetId} --criterion ${criterion.criterionId}`,
  evidenceClass: criterion.requiredHosts.some((host) => host.toLowerCase() === "workbuddy") ? "DESIGNATED_HUMAN" : "MACHINE",
  candidateRequired: true,
  installedArtifactRequired: true,
  independent: true
}));

const crossAcceptance = buildCrossAcceptance();
const crossPath = "governance/acceptance/runtime-6.0.0-expert-2.0.0-cross-acceptance-map.json";
const crossContent = `${JSON.stringify(crossAcceptance, null, 2)}\n`;
const contractMaterial = {
  schema: "evopilot-v6-completion-contract/v1",
  campaignId,
  targetBindings: targets.map(targetBinding),
  inventory,
  trace,
  requiredCriteria,
  validators,
  crossAcceptanceRef: { path: crossPath, digest: sha(crossAcceptance) },
  requiredCandidatePair: { runtime: "6.0.0", expert: "2.0.0", installationMode: "ISOLATED_PACKAGED_CANDIDATES", exactBytes: true },
  completionRule: "capabilityInventory=100%; total=passed; failed=pending=stale=warning=generic=unmapped=0; exactInstalledCandidatePairVerified=true; crossAcceptance=PASS; impactClosure=PASS; noRegression=PASS; legacySuiteInvocation=0",
  generatedFrom: [`governance/targets/${runtimeId}.json`, `governance/targets/${expertId}.json`]
};
const contract = { ...contractMaterial, digest: sha(contractMaterial) };
writeOrCheck("governance/acceptance/v6-completion-contract.json", `${JSON.stringify(contract, null, 2)}\n`, "v6 completion contract");
writeOrCheck(crossPath, crossContent, "v6 cross-acceptance map");
console.log(`v6 completion contract ${check ? "current" : "written"}: requirements=${inventory.requirements.length} criteria=${requiredCriteria.length} cross=${crossAcceptance.rows.length} digest=${contract.digest}`);

function criteria(target) {
  return [
    ...target.acceptance.map((item) => ({ item, source: "CURRENT" })),
    ...target.inheritedAcceptance.map((item) => ({ item, source: "INHERITED" })),
    ...target.realCaseCoverage.map((item) => ({ item, source: "E2E" }))
  ].map(({ item, source }) => ({
    targetId: target.id,
    criterionId: item.id,
    source,
    criterion: item.criterion ?? item.scenario ?? item.origin ?? item.id,
    requiredEvidence: item.requiredEvidence ?? "criterion-specific evidence required by the bound Target",
    requiredHosts: [...(item.hosts ?? [])],
    prohibitedEffects: [...(item.prohibitedEffects ?? [])]
  }));
}

function bestCriteria(statement, available) {
  const words = tokens(statement);
  const scored = available.map((item) => ({ item, score: [...tokens(item.criterion)].filter((word) => words.has(word)).length }))
    .sort((left, right) => right.score - left.score || compareText(left.item.criterionId, right.item.criterionId));
  const selected = scored.filter((item) => item.score > 0).slice(0, 4).map((item) => item.item.criterionId);
  return selected.length ? selected : [available[0].criterionId];
}

function buildCrossAcceptance() {
  const rows = [
    row("V6-CROSS01", "Install one Expert Core through generated Codex, Claude Code, WorkBuddy, generic Agent, and generic MCP bundles while preserving one Runtime truth.", ["E2E-INSTALL-CODEX", "E2E-INSTALL-CLAUDE-CODE", "E2E-INSTALL-WORKBUDDY", "E2E-CROSS-HOST"], ["EX2E2E01", "EX2E2E02", "EX2E2E03", "EX2E2E07"]),
    row("V6-CROSS02", "Create and read a new project Lifecycle through Expert over MCP without direct ordinary-human CLI or HTTP operation.", ["E2E-LIFECYCLE-CREATE", "E2E-LIFECYCLE-READ"], ["EX2E2E01", "EX2E2E04"]),
    row("V6-CROSS03", "Update, activate, deactivate, archive, restore, and roll back immutable Lifecycle revisions without changing bound runs.", ["E2E-LIFECYCLE-UPDATE", "E2E-LIFECYCLE-DEACTIVATE", "E2E-LIFECYCLE-ARCHIVE", "E2E-LIFECYCLE-ROLLBACK"], ["EX2E2E04"]),
    row("V6-CROSS04", "Compose reusable Lifecycle modules and reject unsafe, cyclic, missing, or Harness-weakening declarations.", ["E2E-LIFECYCLE-IMPORT", "E2E-SECURITY"], ["EX2E2E08"]),
    row("V6-CROSS05", "Recover tenant-scoped Registry, pointers, runs, receipts, and audit after restart without chat history.", ["E2E-TENANCY", "E2E-RESTART"], ["EX2E2E06"]),
    row("V6-CROSS06", "Execute a real Harness-guided Goal Target Loop through an exact qualified external Agent Runtime request and normalized receipt.", ["E2E-AGENT-RUNTIME", "E2E-REFERENCE-EVOPILOT"], ["EX2E2E05"]),
    row("V6-CROSS07", "Operate DataRig and evopilot-harness as declaration-only projects without project branches or transfer of Harness authority.", ["E2E-REFERENCE-DATARIG", "E2E-REFERENCE-HARNESS"], ["EX2E2E05", "EX2E2E08"]),
    row("V6-CROSS08", "Run representative success, failure, repair, resume, upgrade, and rollback with both legacy Suites absent and no fallback.", ["E2E-NO-SUITE"], ["EX2E2E09", "EX2E2E10"]),
    row("V6-CROSS09", "Keep semantic, credential, database, production, destructive, acceptance, publication, and Release authority explicit.", ["E2E-SECURITY", "E2E-CROSS-HOST"], ["EX2E2E03", "EX2E2E08"]),
    row("V6-CROSS10", "Close every current, inherited, E2E, impact, and NO_REGRESSION obligation before the exact Candidate pair completes active soak.", ["E2E-SOAK"], ["EX2E2E10"])
  ];
  const material = {
    schema: "evopilot-runtime-expert-cross-acceptance-map/v2",
    id: campaignId,
    status: "IMPLEMENTED_AWAITING_CANDIDATE_ACCEPTANCE",
    bindings: { runtime: targetBinding(runtime), expert: targetBinding(expert) },
    legacySuiteFixtures: [
      { id: "evopilot-codex-suite", version: "3.2.1", role: "FROZEN_REFERENCE_FIXTURE" },
      { id: "datarig-codex-suite", version: "2.1.5", role: "FROZEN_REFERENCE_FIXTURE" }
    ],
    rows,
    completionRule: "Every row and every target criterion passes for one exact installed Candidate pair; impact and NO_REGRESSION pass; legacySuiteInvocationCount is zero."
  };
  return { ...material, digest: sha(material) };
}

function row(id, objective, runtimeE2EIds, expertE2EIds) {
  const runtimeAcceptanceIds = linkedAcceptance(runtime, runtimeE2EIds);
  const expertAcceptanceIds = linkedAcceptance(expert, expertE2EIds);
  const hosts = [...new Set([...runtime.realCaseCoverage, ...expert.realCaseCoverage]
    .filter((entry) => [...runtimeE2EIds, ...expertE2EIds].includes(entry.id))
    .flatMap((entry) => entry.hosts ?? []))].sort(compareText);
  return { id, objective, runtimeE2EIds, expertE2EIds, runtimeAcceptanceIds, expertAcceptanceIds, requiredHosts: hosts, status: "PENDING", evidenceRefs: [] };
}

function linkedAcceptance(target, e2eIds) {
  const criteriaValues = target.acceptance.map((item) => ({ targetId: target.id, criterionId: item.id, criterion: item.criterion }));
  const selected = new Set();
  for (const id of e2eIds) {
    const scenario = target.realCaseCoverage.find((item) => item.id === id)?.scenario ?? id;
    for (const criterion of bestCriteria(scenario, criteriaValues)) selected.add(criterion);
  }
  return [...selected].sort(compareText);
}

function deliverablesFor(targetId, ids) {
  const result = targetId === runtimeId
    ? ["packages/core", "packages/server", "packages/adapter-mcp", "schemas/lifecycle", "docs"]
    : ["packages/evolution-expert", "packages/adapter-mcp", "docs/guides/evolution-expert.md"];
  if (ids.some((id) => id.startsWith("E2E") || id.startsWith("EX2E2E"))) result.push("governance/acceptance/v6-completion-contract.json");
  return result;
}

function writeOrCheck(relative, content, label) {
  const target = path.join(root, relative);
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== content) throw new Error(`${label} is missing or stale`);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function targetBinding(target) {
  return { id: target.id, revision: target.revision, authorizationDigest: target.approvals.target.authorizationDigest, fileDigest: fileDigest(`governance/targets/${target.id}.json`) };
}
function validatorId(targetId, criterionId) { return `validate-${targetId}-${criterionId}`; }
function tokens(value) { return new Set(String(value).toLowerCase().match(/[a-z][a-z0-9-]{3,}|[\u4e00-\u9fff]{2,}/g) ?? []); }
function readJson(relative) { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); }
function fileDigest(relative) { return `sha256:${createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex")}`; }
function sha(value) { return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`; }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => compareText(a, b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`; return JSON.stringify(value); }
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
