/** Public transport selection only. Runtime remains the authority for access,
 * catalog verification, review decisions and immutable binding persistence. */
export const EVOPILOT_PROJECT_SEMANTIC_CAPABILITIES_SCHEMA = "evopilot-project-semantic-capabilities/v1" as const;
export const EVOPILOT_PROJECT_SEMANTIC_OPERATIONS = ["capabilities", "inspect", "compatibility", "review", "approve", "binding", "activation", "transitionReview", "transitionApprove", "onboarding", "gap"] as const;
export type EvoPilotProjectSemanticOperation = typeof EVOPILOT_PROJECT_SEMANTIC_OPERATIONS[number];

export interface EvoPilotProjectSemanticCapabilities {
  schema: typeof EVOPILOT_PROJECT_SEMANTIC_CAPABILITIES_SCHEMA;
  projectId: string;
  operations: readonly EvoPilotProjectSemanticOperation[];
  executionAvailable: false;
  completionAvailable: false;
  authority: "RUNTIME_CURRENT_SCOPED_PRINCIPAL";
}

export function projectSemanticCapabilities(projectId: string): EvoPilotProjectSemanticCapabilities {
  assertId(projectId);
  return Object.freeze({schema: EVOPILOT_PROJECT_SEMANTIC_CAPABILITIES_SCHEMA, projectId,
    operations: Object.freeze([...EVOPILOT_PROJECT_SEMANTIC_OPERATIONS]), executionAvailable: false,
    completionAvailable: false, authority: "RUNTIME_CURRENT_SCOPED_PRINCIPAL"});
}

export function requireProjectSemanticCapability(value: unknown, projectId: string, operation: EvoPilotProjectSemanticOperation): void {
  if (!record(value) || value.schema !== EVOPILOT_PROJECT_SEMANTIC_CAPABILITIES_SCHEMA || value.projectId !== projectId ||
      value.authority !== "RUNTIME_CURRENT_SCOPED_PRINCIPAL" || !Array.isArray(value.operations) ||
      !value.operations.includes(operation)) throw new Error("SEMANTIC_CAPABILITY_REQUIRED: this Runtime does not advertise the requested project semantic operation; no legacy fallback is allowed");
}

export function projectSemanticRequest(operation: string, input: Record<string, unknown>): {
  operation: EvoPilotProjectSemanticOperation; method: "GET" | "POST"; path: string;
  capabilityPath: string; body?: Record<string, string>;
} {
  if (!(EVOPILOT_PROJECT_SEMANTIC_OPERATIONS as readonly string[]).includes(operation)) throw new Error("SEMANTIC_REQUEST_INVALID: unknown project semantic operation");
  const fields = ["inspect", "onboarding"].includes(operation) ? ["projectId", "catalogId"] :
    ["compatibility", "review", "gap"].includes(operation) ? ["projectId", "catalogId", "artifactSetDigest", "bundleDigest"] :
    operation === "approve" ? ["projectId", "reviewDigest", "decision"] :
    operation === "transitionReview" ? ["projectId", "action", "expectedHeadDigest", "destinationDigest"] :
    operation === "transitionApprove" ? ["projectId", "transitionReviewDigest", "decision"] : ["projectId"];
  if (Object.keys(input).length !== fields.length || !fields.every(key => Object.hasOwn(input, key) && typeof input[key] === "string"))
    throw new Error("SEMANTIC_REQUEST_INVALID: exact operation fields are required");
  assertId(input.projectId);
  if (fields.includes("catalogId")) assertId(input.catalogId);
  for (const key of ["artifactSetDigest", "bundleDigest", "reviewDigest", "expectedHeadDigest", "destinationDigest", "transitionReviewDigest"]) if (fields.includes(key) && !/^sha256:[a-f0-9]{64}$/.test(input[key] as string))
    throw new Error("SEMANTIC_REQUEST_INVALID: invalid digest");
  if (["approve", "transitionApprove"].includes(operation) && input.decision !== "APPROVE") throw new Error("SEMANTIC_REQUEST_INVALID: explicit APPROVE decision required");
  if (operation === "transitionReview" && !["ACTIVATE", "MIGRATE", "ROLLBACK"].includes(input.action as string)) throw new Error("SEMANTIC_REQUEST_INVALID: explicit transition action required");
  const base = `/api/v1/projects/${encodeURIComponent(input.projectId as string)}`;
  const capabilityPath = `${base}/semantic-capabilities`;
  const result = {operation: operation as EvoPilotProjectSemanticOperation, capabilityPath};
  if (operation === "capabilities") return {...result, method: "GET", path: capabilityPath};
  if (operation === "binding") return {...result, method: "GET", path: `${base}/semantic-binding`};
  if (operation === "activation") return {...result, method: "GET", path: `${base}/semantic-binding/activation`};
  if (operation === "transitionReview") return {...result, method: "POST", path: `${base}/semantic-binding/transition-reviews`, body: {
    action: input.action as string, expectedHeadDigest: input.expectedHeadDigest as string, destinationDigest: input.destinationDigest as string}};
  if (operation === "transitionApprove") return {...result, method: "POST", path: `${base}/semantic-binding/transition-approvals`, body: {
    transitionReviewDigest: input.transitionReviewDigest as string, decision: "APPROVE"}};
  if (operation === "approve") return {...result, method: "POST", path: `${base}/semantic-binding/approvals`, body: {
    reviewDigest: input.reviewDigest as string, decision: "APPROVE"}};
  if (operation === "review") return {...result, method: "POST", path: `${base}/semantic-binding/reviews`, body: {
    catalogId: input.catalogId as string, artifactSetDigest: input.artifactSetDigest as string, bundleDigest: input.bundleDigest as string}};
  const catalogPath = `${base}/semantic-catalogs/${encodeURIComponent(input.catalogId as string)}`;
  return {...result, method: "GET", path: operation === "inspect" ? catalogPath : operation === "onboarding" ? `${catalogPath}/onboarding` :
    `${catalogPath}/${operation}?${new URLSearchParams({artifactSetDigest: input.artifactSetDigest as string, bundleDigest: input.bundleDigest as string})}`};
}

function assertId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) throw new Error("SEMANTIC_REQUEST_INVALID: invalid identifier");
}
function record(value: unknown): value is Record<string, unknown> {return typeof value === "object" && value !== null && !Array.isArray(value);}
