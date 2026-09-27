#!/usr/bin/env node
// Read-only development trace audit. Never executes a declared validator or
// converts a declaration, source test, or historical PASS into acceptance.
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {isDeepStrictEqual} from "node:util";
import {projectCasePlan, sha} from "./validate-semantic-convergence-corpus.mjs";

const ensure = (condition, code) => {if (!condition) throw Object.assign(new Error(code), {code});};
const digest = value => sha(JSON.stringify(value));
const exact = (value, keys, code) => ensure(value && typeof value === "object" && !Array.isArray(value) &&
  isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort()), code);
const unique = (values, code) => ensure(new Set(values).size === values.length, code);

export function createTracePlan(product, targetBytes) {
  const corpus = projectCasePlan(product, targetBytes); // Pins independent approved bytes before reading fields.
  const target = JSON.parse(targetBytes);
  const retainId = product === "runtime" ? "R-C01" : "E-C01";
  const clauses = [];
  for (const side of ["include", "exclude"]) target.scope[side].forEach((statement, index) =>
    clauses.push({pointer: `/scope/${side}/${index}`, statement, digest: digest(statement)}));
  const requirements = ["acceptance", "inheritedAcceptance"].flatMap(section => target[section].map((item, index) => ({
    id: item.id, pointer: `/${section}/${index}`, definitionDigest: digest(item), definition: item,
    lineage: section === "inheritedAcceptance" ? target.acceptanceLineage.find(line => line.id === item.id) : null,
    // An explicit retention clause is ownership, not executable journey coverage.
    retentionCriterion: section === "inheritedAcceptance" ? retainId : null,
    machineVariants: section === "acceptance" ? corpus.cases.flatMap(c => c.machineVariants)
      .filter(v => v.coversAcceptanceIds.includes(item.id)).map(v => v.id) : [],
    validator: null
  })));
  return {schema: "evopilot-semantic-development-trace/v1", product, target: corpus.target,
    scope: clauses, roadmapBindings: target.roadmapBindings, sourceEvidence: target.evidence,
    requirements, journeys: corpus.cases, historicalSchemeInventory: "NOT_RECONCILED",
    formalAcceptance: "NOT_RUN", targetCriteriaClosed: 0, grantsProductAuthority: false};
}

// Pure comparison for synthetic tests. The caller-supplied expectation is not
// an approved Target; only auditTracePlan verifies that independent binding.
export function compareTraceDefinitions(expected, plan) {
  exact(plan, Object.keys(expected), "TRACE_FIELDS_INVALID");
  for (const field of Object.keys(expected).filter(key => key !== "requirements"))
    ensure(isDeepStrictEqual(plan[field], expected[field]), `TRACE_BINDING_DRIFT:${field}`);
  ensure(Array.isArray(plan.requirements) && plan.requirements.length === expected.requirements.length, "REQUIREMENT_SET_MISMATCH");
  unique(plan.requirements.map(r => r.id), "DUPLICATE_REQUIREMENT");
  const variants = new Map(expected.journeys.flatMap(c => c.machineVariants.map(v => [v.id, v])));
  const validatorIds = [], entrypoints = [];
  let missingValidators = 0, unmappedInherited = 0, declaredValidators = 0;
  const gaps = [];
  plan.requirements.forEach((row, index) => {
    const original = expected.requirements[index];
    exact(row, Object.keys(original), "REQUIREMENT_FIELDS_INVALID");
    for (const key of Object.keys(original).filter(key => !["validator", "machineVariants"].includes(key)))
      ensure(isDeepStrictEqual(row[key], original[key]), `REQUIREMENT_DRIFT:${original.id}:${key}`);
    ensure(Array.isArray(row.machineVariants), "MACHINE_VARIANTS_REQUIRED");
    unique(row.machineVariants, "DUPLICATE_MACHINE_VARIANT");
    for (const id of row.machineVariants) ensure(variants.has(id), "UNKNOWN_MACHINE_VARIANT");
    if (original.retentionCriterion === null)
      ensure(isDeepStrictEqual(row.machineVariants, original.machineVariants), "CURRENT_ROUTE_DRIFT");
    else {
      // Current Target variants name current acceptance IDs only. An inherited
      // route needs reviewed criterion-specific assertions; do not infer one
      // merely from the retention clause, text similarity or a catch-all RC.
      ensure(row.machineVariants.length === 0, "UNREVIEWED_INHERITED_ROUTE");
      unmappedInherited++;
      gaps.push({id: row.id, code: "INHERITED_EXECUTABLE_ROUTE_MISSING"});
    }
    if (row.validator === null) {
      missingValidators++;
      gaps.push({id: row.id, code: "INDEPENDENT_VALIDATOR_MISSING"});
    } else {
      const v = row.validator;
      exact(v, ["id", "criterionId", "definitionDigest", "requiredEvidence", "entrypoint", "assertions"], "VALIDATOR_FIELDS_INVALID");
      ensure(typeof v.id === "string" && v.id.trim() === v.id && v.id.length > 0, "VALIDATOR_ID_REQUIRED");
      ensure(v.criterionId === row.id && v.definitionDigest === row.definitionDigest &&
        v.requiredEvidence === row.definition.requiredEvidence, "VALIDATOR_CONTRACT_MISMATCH");
      ensure(typeof v.entrypoint === "string" && /^[a-zA-Z0-9_/-]+\.mjs#[a-zA-Z][a-zA-Z0-9_]*$/.test(v.entrypoint) &&
        !v.entrypoint.startsWith("/") && !v.entrypoint.split("/").some(p => !p || p === ".."), "VALIDATOR_ENTRYPOINT_INVALID");
      ensure(Array.isArray(v.assertions) && v.assertions.length > 0 && v.assertions.every(s => typeof s === "string" && s.trim().length > 0), "CONCRETE_ASSERTIONS_REQUIRED");
      unique(v.assertions, "DUPLICATE_ASSERTION");
      validatorIds.push(v.id); entrypoints.push(v.entrypoint); declaredValidators++;
      // Declaration only: no loading untrusted code, no independence inferred.
      gaps.push({id: row.id, code: "VALIDATOR_IMPLEMENTATION_AND_INDEPENDENCE_UNVERIFIED"});
    }
  });
  unique(validatorIds, "DUPLICATE_VALIDATOR_ID");
  unique(entrypoints, "GENERIC_AGGREGATE_VALIDATOR_FORBIDDEN");
  return {counts: {requirements: plan.requirements.length, scopeClauses: plan.scope.length,
    inheritedRequirements: unmappedInherited, declaredValidators, missingValidators, unmappedInherited}, gaps};
}

export function auditTracePlan(product, targetBytes, plan) {
  const expected = createTracePlan(product, targetBytes);
  const compared = compareTraceDefinitions(expected, plan);
  return {schema: "evopilot-semantic-development-trace-audit/v1", status: "INCOMPLETE", product,
    targetDigest: expected.target.fileDigest, traceDigest: digest(plan),
    definitionIntegrity: "VERIFIED", ...compared, historicalSchemeInventory: "NOT_RECONCILED", installedExecution: "NOT_RUN", realHost: "NOT_RUN",
    formalAcceptance: "NOT_RUN", targetCriteriaClosed: 0, grantsProductAuthority: false};
}

function readBounded(file) {
  const stat = fs.statSync(file);
  ensure(stat.isFile() && stat.size <= 33554432, "INPUT_SIZE_LIMIT");
  const bytes = fs.readFileSync(file); ensure(bytes.length <= 33554432, "INPUT_SIZE_LIMIT"); return bytes;
}
function run() {
  const args = process.argv.slice(2);
  ensure([4, 5, 6].includes(args.length) && args[0] === "--product" && args[2] === "--target" &&
    (args.length === 4 || (args.length === 5 && args[4] === "--project") || (args.length === 6 && args[4] === "--trace")), "EXPLICIT_TRACE_ARGUMENTS_REQUIRED");
  const bytes = readBounded(args[3]);
  const plan = args.length === 6 ? JSON.parse(readBounded(args[5])) : createTracePlan(args[1], bytes);
  const report = auditTracePlan(args[1], bytes, plan);
  process.stdout.write(JSON.stringify(args[4] === "--project" ? plan : report, null, 2) + "\n");
  // A projection can succeed; an incomplete audit must not look like readiness.
  if (args[4] !== "--project") process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {run();} catch (error) {
    process.stdout.write(JSON.stringify({status: "BLOCKED", code: error.code ?? "TRACE_AUDIT_FAILED",
      targetCriteriaClosed: 0, grantsProductAuthority: false}) + "\n"); process.exitCode = 2;
  }
}
