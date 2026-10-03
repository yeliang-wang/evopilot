import {digestObject, isRecord} from "./utils.js";
import {MAX_SEMANTIC_OUTCOME_OBSERVATIONS} from "./semantic-evidence-limits.js";
import {requireSemantic} from "./semantic-catalog-contract.js";
import {freeze} from "./semantic-catalog-io.js";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

export const semanticOutcomeEvaluatorDigest = digestObject(["./semantic-outcome-plan.js", "./semantic-evidence-limits.js", "../../application/semantic-execution-outcome.js",
  "../../application/semantic-execution-transport.js", "../../application/semantic-outcome-review.js",
  "../../application/semantic-process-evidence.js", "../../application/semantic-evidence-collection.js",
  "../../application/semantic-runtime-sources.js", "../../storage/semantic-runtime-source.js"].map(module =>
  ({module, digest: `sha256:${createHash("sha256").update(readFileSync(new URL(module, import.meta.url))).digest("hex")}`})).concat(
    [{module: "@evopilot/contracts", digest: `sha256:${createHash("sha256").update(readFileSync(new URL(import.meta.resolve("@evopilot/contracts")))).digest("hex")}`}]
  ));

type Scalar = string | number | boolean | null;
export type OutcomePredicate = {op: "EQUALS"; value: Scalar} | {op: "NUMBER_RANGE"; minimum: number; maximum: number} |
  {op: "ALL_ZERO"} | {op: "STRING_SET_SUBSET"; evidenceKind: string; path: string[]};
interface Rule {id: string; evidenceKind: string; path: string[]; predicate: OutcomePredicate}
export interface SemanticOutcomePlan {
  schema: "evopilot-semantic-outcome-plan/v1";
  goalTargetDigest: string; artifactSetDigest: string; bundleDigest: string; lifecycleDigest: string;
  stageId: string; action: string; actionVersion: string;
  business: Array<Rule & {conceptId: string}>;
  harness: Array<Rule & {obligation: {kind: "validator" | "constraint" | "evidence"; value: string}}>;
  planDigest: string;
}
export interface OutcomeEvidence {kind: string; facts: Record<string, unknown>}
const hash = (v: unknown) => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 2048;
function exact(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  requireSemantic(isRecord(v) && Object.keys(v).sort().join() === [...keys].sort().join(), "INVALID");
}
function selector(value: unknown) {
  requireSemantic(Array.isArray(value) && value.length > 0 && value.length <= 16 && value.every(key => text(key) &&
    key.length <= 128 && !["__proto__", "prototype", "constructor"].includes(key)), "INVALID");
}
/** A server-planned, reviewed mapping, not a Pack interpreter. No prose, shell,
 * scripts, regex, network, model calls or caller-supplied validator functions.
 * Pin before dispatch; this module does not approve a mapping's domain meaning.
 */
export function normalizeSemanticOutcomePlan(value: unknown): SemanticOutcomePlan {
  exact(value, ["schema", "goalTargetDigest", "artifactSetDigest", "bundleDigest", "lifecycleDigest", "stageId", "action", "actionVersion", "business", "harness", "planDigest"]);
  requireSemantic(value.schema === "evopilot-semantic-outcome-plan/v1" &&
    [value.goalTargetDigest, value.artifactSetDigest, value.bundleDigest, value.lifecycleDigest, value.planDigest].every(hash) &&
    [value.stageId, value.action, value.actionVersion].every(text), "INVALID");
  const ids = new Set<string>();
  for (const group of ["business", "harness"] as const) {
    const rules = value[group];
    requireSemantic(Array.isArray(rules) && rules.length > 0 && rules.length <= 64, "MATERIAL_LIMIT");
    for (const rule of rules) {
      exact(rule, ["id", "evidenceKind", "path", "predicate", group === "business" ? "conceptId" : "obligation"]);
      requireSemantic(text(rule.id) && text(rule.evidenceKind) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(rule.evidenceKind) && !ids.has(rule.id), "INVALID");
      ids.add(rule.id); selector(rule.path);
      if (group === "business") requireSemantic(text(rule.conceptId), "INVALID");
      else {
        exact(rule.obligation, ["kind", "value"]);
        requireSemantic(["validator", "constraint", "evidence"].includes(String(rule.obligation.kind)) && text(rule.obligation.value), "INVALID");
      }
      requireSemantic(isRecord(rule.predicate), "INVALID"); const predicate = rule.predicate;
      switch (predicate.op) {
        case "EQUALS":
          exact(predicate, ["op", "value"]);
          requireSemantic(predicate.value === null || typeof predicate.value === "boolean" ||
            typeof predicate.value === "number" && Number.isFinite(predicate.value) || typeof predicate.value === "string" && predicate.value.length <= 2048, "INVALID"); break;
        case "NUMBER_RANGE":
          exact(predicate, ["op", "minimum", "maximum"]);
          requireSemantic(typeof predicate.minimum === "number" && Number.isFinite(predicate.minimum) &&
            typeof predicate.maximum === "number" && Number.isFinite(predicate.maximum) && predicate.minimum <= predicate.maximum, "INVALID"); break;
        case "ALL_ZERO": exact(predicate, ["op"]); break;
        case "STRING_SET_SUBSET":
          exact(predicate, ["op", "evidenceKind", "path"]);
          requireSemantic(text(predicate.evidenceKind) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(predicate.evidenceKind), "INVALID"); selector(predicate.path); break;
        default: requireSemantic(false, "UNSUPPORTED");
      }
    }
  }
  const {planDigest, ...body} = value;
  requireSemantic(Buffer.byteLength(JSON.stringify(value)) <= 32768, "MATERIAL_LIMIT");
  requireSemantic(planDigest === digestObject(body), "DIGEST_MISMATCH");
  return freeze(structuredClone(value) as unknown as SemanticOutcomePlan);
}

function at(facts: unknown, path: string[]): unknown {
  let value = facts;
  for (const key of path) {if (!isRecord(value) || !Object.hasOwn(value, key)) return undefined; value = value[key];}
  return value;
}
export function evaluateSemanticOutcomeRules(plan: SemanticOutcomePlan, evidence: OutcomeEvidence[], required: {
  validators: string[]; constraints: string[]; evidence: string[];
}, conceptIds: string[]) {
  plan = normalizeSemanticOutcomePlan(plan);
  requireSemantic(evidence.length <= MAX_SEMANTIC_OUTCOME_OBSERVATIONS && new Set(evidence.map(item => item.kind)).size === evidence.length, "IDENTITY_CONFLICT");
  requireSemantic(plan.business.every(rule => conceptIds.includes(rule.conceptId)), "DRIFT");
  const requirements = [...required.validators.map(value => ({kind: "validator", value})),
    ...required.constraints.map(value => ({kind: "constraint", value})), ...required.evidence.map(value => ({kind: "evidence", value}))];
  const key = (value: unknown) => digestObject(value), wanted = new Set(requirements.map(key));
  requireSemantic(plan.harness.every(rule => wanted.has(key(rule.obligation))), "DRIFT");
  const missing = requirements.filter(item => !plan.harness.some(rule => key(rule.obligation) === key(item)));
  const facts = new Map(evidence.map(item => [item.kind, item.facts]));
  const missingEvidenceKinds = required.evidence.filter(kind => !facts.has(kind)).sort();
  function check(rule: Rule) {
    const actual = at(facts.get(rule.evidenceKind), rule.path), p = rule.predicate;
    let passed: boolean | undefined;
    if (actual !== undefined) {
      if (p.op === "EQUALS") passed = actual === p.value;
      else if (p.op === "NUMBER_RANGE") passed = typeof actual === "number" && Number.isFinite(actual) && actual >= p.minimum && actual <= p.maximum;
      else if (p.op === "ALL_ZERO") passed = Array.isArray(actual) && actual.length > 0 && actual.length <= 256 && actual.every(value => value === 0);
      else {
        const allowed = at(facts.get(p.evidenceKind), p.path);
        if (allowed !== undefined) passed = Array.isArray(actual) && actual.length > 0 && actual.length <= 256 &&
          Array.isArray(allowed) && allowed.length > 0 && allowed.length <= 256 && allowed.every(text) &&
          actual.every(value => text(value) && allowed.includes(value));
      }
    }
    return {id: rule.id, status: passed === undefined ? "INDETERMINATE" : passed ? "PASSED" : "FAILED"};
  }
  const status = (checks: ReturnType<typeof check>[], incomplete = false) => checks.some(c => c.status === "FAILED") ? "FAILED" :
    incomplete || checks.some(c => c.status !== "PASSED") ? "INDETERMINATE" : "PASSED";
  const business = plan.business.map(check), harness = plan.harness.map(check);
  const businessStatus = status(business), harnessStatus = status(harness, missing.length > 0 || missingEvidenceKinds.length > 0);
  return freeze({business: {status: businessStatus, checks: business}, harness: {status: harnessStatus, checks: harness,
    missingObligationDigests: missing.map(key).sort(), missingEvidenceKinds}, status: [businessStatus, harnessStatus].includes("FAILED") ? "FAILED" :
      businessStatus === "PASSED" && harnessStatus === "PASSED" ? "PASSED" : "INDETERMINATE"});
}
