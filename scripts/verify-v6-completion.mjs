import fs from "node:fs";
import path from "node:path";
import { aggregateCompletion, createApprovedSchemeInventory, createCompletionTrace } from "../packages/core/dist/index.js";

const root = path.resolve(process.cwd());
const contract = JSON.parse(fs.readFileSync(path.join(root, "governance/acceptance/v6-completion-contract.json"), "utf8"));
const inventory = createApprovedSchemeInventory({ campaignId: contract.inventory.campaignId, requirements: contract.inventory.requirements });
if (inventory.digest !== contract.inventory.digest) throw new Error("COMPLETION_INVENTORY_DRIFT");
const trace = createCompletionTrace(inventory, contract.trace.links);
if (trace.digest !== contract.trace.digest) throw new Error("COMPLETION_TRACE_DRIFT");
const evidenceDir = process.env.EVOPILOT_V6_COMPLETION_EVIDENCE_DIR;
const evidence = evidenceDir && fs.existsSync(evidenceDir)
  ? fs.readdirSync(evidenceDir).filter((name) => name.endsWith(".json")).sort().map((name) => JSON.parse(fs.readFileSync(path.join(evidenceDir, name), "utf8")))
  : [];
const candidatePairPath = process.env.EVOPILOT_V6_COMPLETION_CANDIDATE_PAIR;
const candidatePair = candidatePairPath && fs.existsSync(candidatePairPath) ? JSON.parse(fs.readFileSync(candidatePairPath, "utf8")) : { verified: false };
const report = aggregateCompletion({
  inventory,
  trace,
  requiredCriteria: contract.requiredCriteria,
  validators: contract.validators,
  evidence,
  candidatePair,
  impactClosure: process.env.EVOPILOT_V6_IMPACT_CLOSURE === "PASS" ? "PASS" : "PENDING",
  noRegression: process.env.EVOPILOT_V6_NO_REGRESSION === "PASS" ? "PASS" : "PENDING"
});
const cross = JSON.parse(fs.readFileSync(path.join(root, contract.crossAcceptanceRef.path), "utf8"));
const crossComplete = cross.rows.every((row) => row.status === "PASS" && row.evidenceRefs.length > 0);
const final = { ...report, crossAcceptance: crossComplete ? "PASS" : "PENDING", status: report.status === "COMPLETE" && crossComplete ? "COMPLETE" : "INCOMPLETE" };
if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(final, null, 2)}\n`);
else console.log(`v6 completion assurance valid: status=${final.status} total=${report.counts.total} passed=${report.counts.passed} pending=${report.counts.pending} stale=${report.counts.stale} generic=${report.counts.generic} unmapped=${report.counts.unmapped} cross=${final.crossAcceptance}`);
if (process.argv.includes("--require-complete") && final.status !== "COMPLETE") process.exit(1);
