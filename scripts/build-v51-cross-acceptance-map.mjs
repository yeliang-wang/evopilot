#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimePath = "governance/targets/evopilot-v5.1.0-suite-capability-convergence.json";
const expertPath = "governance/targets/evopilot-evolution-expert-v1.1.0-unified-host-entry.json";
const output = path.join(root, "governance/acceptance/runtime-5.1.0-expert-1.1.0-cross-acceptance-map.json");

export function buildCrossAcceptanceMap({ write = true } = {}) {
  const runtime = read(runtimePath);
  const expert = read(expertPath);
  const rows = runtime.realCaseCoverage.map((scenario, index) => ({
    id: `CROSS${String(index + 1).padStart(2, "0")}`,
    objective: scenario.scenario,
    runtimeE2EIds: [scenario.id],
    expertE2EIds: [expert.realCaseCoverage[index % expert.realCaseCoverage.length].id],
    runtimeAcceptanceIds: runtime.acceptance.filter((_, acceptanceIndex) => acceptanceIndex % runtime.realCaseCoverage.length === index).map((item) => item.id),
    expertAcceptanceIds: expert.acceptance.filter((_, acceptanceIndex) => acceptanceIndex % runtime.realCaseCoverage.length === index).map((item) => item.id),
    requiredHosts: [...new Set([...(scenario.hosts ?? []), ...(expert.realCaseCoverage[index % expert.realCaseCoverage.length].hosts ?? [])])].sort(),
    status: "PENDING",
    evidenceRefs: []
  }));
  const material = {
    schema: "evopilot-runtime-expert-cross-acceptance-map/v1",
    id: "evopilot-runtime-5.1.0-expert-1.1.0-suite-capability-convergence",
    status: "IMPLEMENTED_AWAITING_CANDIDATE_ACCEPTANCE",
    roadmapDigest: runtime.roadmapBindings[0].roadmapDigest,
    bindings: {
      runtime: binding(runtime, runtimePath, "5.1.0"),
      expert: binding(expert, expertPath, "1.1.0")
    },
    migrationBaselines: [
      { suiteId: "evopilot-codex-suite", sourceVersion: "3.2.1", snapshotDigest: "sha256:95e614c87b4bf01938ad559a9f13c4a00a4034437d6b59a22119ff53f22cf2f7" },
      { suiteId: "datarig-codex-suite", sourceVersion: "2.1.5", snapshotDigest: "sha256:064ee6a8a7b21ae8029cfaaf03eafef7ff0816a8b031d8468c49eae6b5b4a330" }
    ],
    versionPolicy: {
      sourceSuiteVersion: "Immutable migration provenance; never renamed or continued as a resource version.",
      resourceVersion: "Independent SemVer plus digest and Runtime compatibility range.",
      runtimeVersion: "Changes only for Runtime code, public contracts, schema compatibility, or execution semantics.",
      expertVersion: "Changes only for Expert Core, guided interaction, adapter generation, or package behavior.",
      compatibleResourceUpgrade: "Requires neither Runtime nor Expert byte or version change."
    },
    completionRule: "Every mapped current, inherited, and E2E criterion must pass for one exact installed Candidate pair; inventory and impact closure are 100 percent; NO_REGRESSION passes; all negative counters and legacy Suite invocation are zero.",
    rows
  };
  const result = { ...material, digest: digest(material) };
  if (write) fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

function binding(target, relative, version) {
  return { targetId: target.id, targetRevision: target.revision, targetPath: relative, targetFileDigest: fileDigest(relative), authorizationDigest: target.approvals.target.authorizationDigest, version };
}
function read(relative) { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); }
function fileDigest(relative) { return `sha256:${createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex")}`; }
function digest(value) { return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`; }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => compareText(a, b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`; return JSON.stringify(value); }
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildCrossAcceptanceMap();
  process.stdout.write(`${JSON.stringify({ status: result.status, rows: result.rows.length, digest: result.digest }, null, 2)}\n`);
}
