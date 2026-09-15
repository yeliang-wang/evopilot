import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { aggregateCompletion, createApprovedSchemeInventory, createCompletionTrace } from "../packages/core/dist/index.js";

const root = path.resolve(process.cwd());
const contract = read("governance/acceptance/v61-completion-contract.json");
const inventory = createApprovedSchemeInventory({ campaignId: contract.inventory.campaignId, requirements: contract.inventory.requirements });
if (inventory.digest !== contract.inventory.digest) throw new Error("COMPLETION_INVENTORY_DRIFT");
const trace = createCompletionTrace(inventory, contract.trace.links);
if (trace.digest !== contract.trace.digest) throw new Error("COMPLETION_TRACE_DRIFT");
if (contract.requiredCriteria.length !== 305 || contract.validators.length !== 305) throw new Error("V61_EXACT_305_CRITERIA_REQUIRED");
if (contract.counts.runtimeCurrent !== 17 || contract.counts.runtimeE2E !== 13 || contract.counts.expertCurrent !== 12 || contract.counts.expertE2E !== 10 || contract.counts.inheritedPublishedV6 !== 253) throw new Error("V61_CRITERION_COUNTS_DRIFT");
const baseline = read(contract.publishedBaseline.path);
if (contract.publishedBaseline.fileDigest !== fileDigest(contract.publishedBaseline.path) || contract.publishedBaseline.contractDigest !== baseline.digest || contract.publishedBaseline.disposition !== "INHERIT_ALL_NO_EXCLUSIONS") throw new Error("V61_PUBLISHED_BASELINE_DRIFT");
const cross = read(contract.crossAcceptanceRef.path);
if (cross.rows.length !== 10 || cross.digest !== contract.crossAcceptanceRef.digest || fileDigest(contract.crossAcceptanceRef.path) !== contract.crossAcceptanceRef.fileDigest) throw new Error("V61_CROSS_ACCEPTANCE_DRIFT");

const evidenceDir = process.env.EVOPILOT_V61_COMPLETION_EVIDENCE_DIR;
const evidence = evidenceDir && fs.existsSync(evidenceDir) ? fs.readdirSync(evidenceDir).filter((name) => name.endsWith(".json")).sort().map((name) => JSON.parse(fs.readFileSync(path.join(evidenceDir, name), "utf8"))) : [];
const candidatePairPath = process.env.EVOPILOT_V61_COMPLETION_CANDIDATE_PAIR;
const candidatePair = candidatePairPath && fs.existsSync(candidatePairPath) ? JSON.parse(fs.readFileSync(candidatePairPath, "utf8")) : { verified: false };
const report = aggregateCompletion({ inventory, trace, requiredCriteria: contract.requiredCriteria, validators: contract.validators, evidence, candidatePair, impactClosure: process.env.EVOPILOT_V61_IMPACT_CLOSURE === "PASS" ? "PASS" : "PENDING", noRegression: process.env.EVOPILOT_V61_NO_REGRESSION === "PASS" ? "PASS" : "PENDING" });
const crossComplete = cross.rows.every((row) => row.status === "PASS" && row.evidenceRefs.length > 0);
const legacySuiteInvocationCount = Number(process.env.EVOPILOT_V61_LEGACY_SUITE_INVOCATION_COUNT ?? 0);
const final = { ...report, crossAcceptance: crossComplete ? "PASS" : "PENDING", legacySuiteInvocationCount, status: report.status === "COMPLETE" && crossComplete && legacySuiteInvocationCount === 0 ? "COMPLETE" : "INCOMPLETE" };
if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(final, null, 2)}\n`);
else console.log(`v6.1 completion assurance valid: status=${final.status} total=${report.counts.total} passed=${report.counts.passed} pending=${report.counts.pending} stale=${report.counts.stale} generic=${report.counts.generic} unmapped=${report.counts.unmapped} cross=${final.crossAcceptance} legacySuiteInvocationCount=${legacySuiteInvocationCount}`);
if (process.argv.includes("--require-complete") && final.status !== "COMPLETE") process.exit(1);

function read(relative) { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); }
function fileDigest(relative) { return `sha256:${createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex")}`; }
