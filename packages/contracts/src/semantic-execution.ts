/** Transport declarations only. No current authority or completion assertion. */
export const SEMANTIC_COMPLETION_OPERATIONS = ["commitStage", "stageReceipt", "completeTarget", "completionReceipt", "completionStatus", "completePhase", "phaseReceipt", "completeGoal", "goalReceipt"] as const;
export const SEMANTIC_EXECUTION_OPERATIONS = ["planning", "draft", "prepare", "inspect", "bind", "resolve", "mapping", "review", "approveReview", "dispatch", "collect", "evaluate", ...SEMANTIC_COMPLETION_OPERATIONS] as const;
export type SemanticExecutionOperation = typeof SEMANTIC_EXECUTION_OPERATIONS[number];
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const id = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
const hash = (v: unknown) => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
function valid(v: unknown): asserts v {if (!v) throw new Error("SEMANTIC_EXECUTION_REQUEST_INVALID");}

export function semanticExecutionCapabilities(projectId: string, adapterConfigured: boolean, collectorConfigured = false, completionConfigured = false) {
  valid(id(projectId));
  return Object.freeze({schema: "evopilot-semantic-execution-capabilities/v1", projectId,
    operations: Object.freeze(SEMANTIC_EXECUTION_OPERATIONS.filter(op => (op !== "dispatch" || adapterConfigured) && (op !== "collect" || collectorConfigured) &&
      (!(SEMANTIC_COMPLETION_OPERATIONS as readonly string[]).includes(op) || completionConfigured))),
    authority: "RUNTIME_CURRENT_SCOPED_PRINCIPAL", adapterConfigured, collectorConfigured, completionAvailable: completionConfigured,
    completionScope: completionConfigured ? "VALIDATED_TARGET_AND_NON_PHASE_GOAL" : "UNAVAILABLE",
    phaseTargetCompletionAvailable: completionConfigured, phaseCompletionAvailable: completionConfigured, goalCompletionAvailable: completionConfigured, releaseAvailable: false,
    qualification: "REVALIDATE_PER_REQUEST"});
}
export function requireSemanticExecutionCapability(value: unknown, projectId: string, operation: string) {
  if (!record(value) || value.schema !== "evopilot-semantic-execution-capabilities/v1" || value.projectId !== projectId ||
    value.authority !== "RUNTIME_CURRENT_SCOPED_PRINCIPAL" || !Array.isArray(value.operations) ||
    (operation !== "capabilities" && !value.operations.includes(operation)) ||
    ((SEMANTIC_COMPLETION_OPERATIONS as readonly string[]).includes(operation) &&
      (value.completionAvailable !== true || value.completionScope !== "VALIDATED_TARGET_AND_NON_PHASE_GOAL"))) throw new Error("SEMANTIC_EXECUTION_CAPABILITY_REQUIRED");
  if (["completeGoal", "goalReceipt"].includes(operation) && value.goalCompletionAvailable !== true) throw new Error("SEMANTIC_EXECUTION_CAPABILITY_REQUIRED");
  if (["completePhase", "phaseReceipt"].includes(operation) && value.phaseCompletionAvailable !== true) throw new Error("SEMANTIC_EXECUTION_CAPABILITY_REQUIRED");
}
export function semanticExecutionRequest(operation: string, projectId: string, value?: unknown) {
  valid(id(projectId));
  const capabilityPath = `/api/v1/projects/${encodeURIComponent(projectId)}/semantic-execution/capabilities`;
  if (operation === "capabilities") {valid(value === undefined); return {method: "GET" as const, path: capabilityPath, capabilityPath};}
  valid((SEMANTIC_EXECUTION_OPERATIONS as readonly string[]).includes(operation) && record(value));
  const fields = ["planning", "draft"].includes(operation) ? ["identity", "runId", "requestDigest", "goalTarget",
    ...(operation === "draft" ? ["basisDigest", "selection", "business", "harness", "selections"] : [])] :
    operation === "prepare" ? ["identity", "runId", "requestDigest", "goalTarget", "contextPlan", "outcomePlan", "selections"] :
    ["inspect", "bind"].includes(operation) ? ["identity"] : ["completePhase", "phaseReceipt"].includes(operation) ? ["identity", "runId", "phaseTargetId"] : ["completeTarget", "completionReceipt", "completionStatus", "completeGoal", "goalReceipt"].includes(operation) ? ["identity", "runId"] : ["identity", "bindingDigest",
      ...(operation === "stageReceipt" ? ["runId", "requestDigest"] : []),
      ...(operation === "review" ? ["coverage"] : operation === "approveReview" ? ["reviewDigest", "decision"] : [])];
  valid(Object.keys(value).sort().join() === fields.sort().join());
  const identity = value.identity;
  valid(record(identity) && Object.keys(identity).sort().join() === "goalId,harnessBindingDigest,projectId,targetId" &&
    identity.projectId === projectId && [identity.projectId, identity.goalId, identity.targetId].every(id) && hash(identity.harnessBindingDigest));
  if (operation === "prepare") valid(id(value.runId) && hash(value.requestDigest) &&
    [value.goalTarget, value.contextPlan, value.outcomePlan, value.selections].every(record));
  if (["planning", "draft"].includes(operation)) valid(record(value.goalTarget));
  if (operation === "draft") valid(hash(value.basisDigest) && record(value.selection) && record(value.selections) &&
    [value.business, value.harness].every(v => Array.isArray(v) && v.length > 0 && v.length <= 64));
  if (fields.includes("bindingDigest")) valid(hash(value.bindingDigest));
  if (fields.includes("runId")) valid(id(value.runId));
  if (fields.includes("phaseTargetId")) valid(id(value.phaseTargetId));
  if (fields.includes("requestDigest")) valid(hash(value.requestDigest));
  if (operation === "review") valid(Array.isArray(value.coverage) && value.coverage.length <= 1024);
  if (operation === "approveReview") valid(hash(value.reviewDigest) && value.decision === "APPROVE");
  valid(new TextEncoder().encode(JSON.stringify(value)).byteLength <= 65536);
  return {method: "POST" as const, path: capabilityPath.replace(/capabilities$/, operation), capabilityPath,
    body: structuredClone(value)};
}
