import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {canonicalJson, digestObject, isRecord} from "./utils.js";
import {requireSemantic, type SemanticScope} from "./semantic-catalog-contract.js";
import {evaluateProjectSemanticCompatibility} from "./semantic-compatibility.js";
import {freeze} from "./semantic-catalog-io.js";

// Conservative internal projection defaults, not the Catalog transport ceilings.
export const semanticContextLimits = Object.freeze({maxConcepts: 128, maxRelations: 256, maxOutputBytes: 65536, timeoutMs: 30000});
export type SemanticContextLimits = {-readonly [K in keyof typeof semanticContextLimits]: number};
export interface SemanticContextSelection {
  schema: "evopilot-semantic-context-selection/v1";
  reasoning: "EXPLICIT_ONLY";
  conceptIds: string[];
  relations: {subjectConceptId: string; relationType: string; objectConceptId: string}[];
}
const implementationDigest = digestObject(["./semantic-context-slice.js", "./semantic-action-context-plan.js", "../../application/semantic-execution-context.js"].map(relative =>
  ({module: relative, digest: `sha256:${createHash("sha256").update(readFileSync(new URL(relative, import.meta.url))).digest("hex")}`})));
export function resolveSemanticContextLimits(overrides: Partial<SemanticContextLimits> = {}): SemanticContextLimits {
  requireSemantic(isRecord(overrides), "BUDGET_INVALID");
  const limits: SemanticContextLimits = {...semanticContextLimits};
  for (const [key, value] of Object.entries(overrides)) {
    requireSemantic(Object.hasOwn(limits, key), "BUDGET_INVALID");
    const field = key as keyof SemanticContextLimits;
    requireSemantic(Number.isSafeInteger(value) && value > 0 && value <= limits[field], "BUDGET_INVALID");
    limits[field] = value;
  }
  return Object.freeze(limits);
}
export function semanticContextResolverDescriptor(limits: SemanticContextLimits) {
  return freeze({schema: "evopilot-semantic-context-resolver/v1" as const, id: "explicit-minimum-context",
    implementationDigest, limitsDigest: digestObject(resolveSemanticContextLimits(limits))});
}

/** Pure projection AFTER the fixed consumer has verified the complete set.
 * Selection is a trusted Runtime planning input, never generated from Skill prose
 * or caller-supplied materials. This function alone is not a permission boundary.
 */
export function projectSemanticContext(input: {artifactSet: unknown; bundle: unknown; reasoningProfile: unknown; scope: SemanticScope;
  selection: SemanticContextSelection; limits: SemanticContextLimits; check: () => void}) {
  input.check();
  const limits = resolveSemanticContextLimits(input.limits), selection = input.selection;
  requireSemantic(isRecord(selection) && Object.keys(selection).sort().join() === "conceptIds,reasoning,relations,schema" &&
    selection.schema === "evopilot-semantic-context-selection/v1", "INVALID");
  requireSemantic(selection.reasoning === "EXPLICIT_ONLY", "UNSUPPORTED");
  requireSemantic(Array.isArray(selection.conceptIds) && selection.conceptIds.length <= limits.maxConcepts, "MATERIAL_LIMIT");
  requireSemantic(Array.isArray(selection.relations) && selection.relations.length <= limits.maxRelations, "EDGE_LIMIT");
  const id = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/.test(value);
  requireSemantic(selection.conceptIds.every(id) && new Set(selection.conceptIds).size === selection.conceptIds.length, "INVALID");
  for (const edge of selection.relations) requireSemantic(isRecord(edge) &&
    Object.keys(edge).sort().join() === "objectConceptId,relationType,subjectConceptId" && Object.values(edge).every(id), "INVALID");
  requireSemantic(new Set(selection.relations.map(canonicalJson)).size === selection.relations.length, "IDENTITY_CONFLICT");
  const report = evaluateProjectSemanticCompatibility(input);
  requireSemantic(report.status === "COMPATIBLE", "MATERIAL_INVALID");
  const artifact = input.artifactSet as Record<string, any>, bundle = input.bundle as Record<string, any>, profile = input.reasoningProfile as Record<string, any>;
  requireSemantic(["NONE", "RDFS", "OWL_RL"].includes(profile.spec.mode), "UNSUPPORTED");
  const snapshot = artifact.spec.snapshot, requirements = bundle.spec.semanticRequirements;
  const declared = new Set<string>(requirements.requiredConcepts.map((item: any) => item.conceptId));
  for (const edge of requirements.relationRequirements) {declared.add(edge.subjectConceptId); declared.add(edge.objectConceptId);}
  const relations = [...selection.relations].sort((a, b) => canonicalJson(a) < canonicalJson(b) ? -1 : 1);
  requireSemantic(relations.every(edge => requirements.relationRequirements.some((item: unknown) => canonicalJson(item) === canonicalJson(edge))), "PERMISSION_DENIED");
  const ids = [...new Set([...selection.conceptIds, ...relations.flatMap(edge => [edge.subjectConceptId, edge.objectConceptId])])].sort();
  requireSemantic(ids.every(value => declared.has(value)), "PERMISSION_DENIED");
  requireSemantic(ids.length <= Math.min(limits.maxConcepts, profile.spec.limits.maxNodes), "MATERIAL_LIMIT");
  requireSemantic(relations.length <= Math.min(limits.maxRelations, profile.spec.limits.maxEdges), "EDGE_LIMIT");
  const byId = new Map<string, Record<string, any>>(snapshot.concepts.map((concept: any) => [concept.conceptId, concept]));
  const concepts = ids.map(conceptId => {
    input.check(); const concept = byId.get(conceptId);
    requireSemantic(concept && !concept.deprecated, "MATERIAL_MISSING");
    // Exact allowlist: no full relationships, source refs, Pack provenance,
    // projections, Skill instructions, credentials or arbitrary metadata.
    return {conceptId, metaType: concept.metaType, label: concept.label, definition: concept.definition, conceptDigest: concept.conceptDigest};
  });
  input.check();
  const normalized = {schema: selection.schema, reasoning: selection.reasoning, conceptIds: [...selection.conceptIds].sort(), relations};
  const content = {evaluationMode: "EXPLICIT_SNAPSHOT_FACTS_ONLY" as const, concepts, relations};
  requireSemantic(Buffer.byteLength(canonicalJson(content)) <= limits.maxOutputBytes, "MATERIAL_LIMIT");
  return freeze({content, selectionDigest: digestObject(normalized), compatibilityDigest: report.compatibilityDigest,
    wallTimeLimitMs: Math.min(limits.timeoutMs, profile.spec.limits.maxWallTimeMs)});
}
