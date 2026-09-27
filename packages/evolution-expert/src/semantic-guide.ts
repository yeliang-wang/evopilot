import {projectSemanticRequest, requireProjectSemanticCapability, type EvoPilotProjectSemanticOperation} from "@evopilot/contracts";
import type {ExpertOperation, EvolutionExpertTransport} from "./index.js";

export type SemanticExpertIntent = "semantic-guide" | "semantic-discover" | "semantic-compatibility" | "semantic-review" | "semantic-approve" | "semantic-binding" |
  "semantic-activation" | "semantic-transition-review" | "semantic-transition-approve" | "semantic-onboarding" | "semantic-gap";
export const SEMANTIC_EXPERT_OPERATIONS: Record<SemanticExpertIntent, ExpertOperation> = {
  "semantic-gap": {tool: "evopilot_project_semantic_gap", authority: "NONE", purpose: "Read Runtime compatibility gap handoffs for an exact published pair. Distinguish ontology material review, Harness declaration review, cross-contract mismatch and unresolved evidence/reasoning; a review destination is not proof of a product defect.", requiredInputs: ["projectId", "catalogId", "artifactSetDigest", "bundleDigest"], nextOnSuccess: "Hand verified findings to the separate producer review, never modify/publish assets here. A successor must be separately published, explicitly selected and compatible; prepare its binding review, read the current activation head, prepare an explicit MIGRATE transition review with that reviewDigest, then require separate exact human approval. Never pick newest, rewrite old runs or infer business completion."},
  "semantic-onboarding": {tool: "evopilot_project_semantic_onboarding", authority: "NONE", purpose: "Read Runtime-owned onboarding guidance for an existing scoped project and explicitly selected Catalog. Preserve existing bindings and distinguish compatible, ambiguous, no-match and indeterminate choices; never infer business field or product type.", requiredInputs: ["projectId", "catalogId"], nextOnSuccess: "Recommend reviewed dual binding only from Runtime COMPATIBLE facts. Even a unique candidate needs exact typed selection followed by separate review and human approval. Do not silently upgrade legacy projects, publish missing maps, search another Catalog or run a Goal. Missing maps and evidence stay unresolved; an existing binding routes to activation inspection before any explicit transition."},
  "semantic-guide": {tool: "evopilot_project_semantic_capabilities", authority: "NONE", purpose: "Ask Runtime which project semantic operations are available; explain the business map and Harness as separate required contracts, without inventing project facts.", requiredInputs: ["projectId"], nextOnSuccess: "Show supported operations and unavailable execution/completion explicitly. A gap, successor, migration or rollback request must not use a legacy execution fallback."},
  "semantic-discover": {tool: "evopilot_project_semantic_inspect", authority: "NONE", purpose: "Present Runtime-verified published project semantic sets and exact digests; do not select a set, infer a business field, or execute embedded Skill prose.", requiredInputs: ["projectId", "catalogId"], nextOnSuccess: "Ask only for a missing exact selection from Runtime discovery, then check compatibility before review."},
  "semantic-compatibility": {tool: "evopilot_project_semantic_compatibility", authority: "NONE", purpose: "Explain Runtime COMPATIBLE, INCOMPATIBLE or INDETERMINATE and its reasons; compatibility never implies Harness eligibility or approval.", requiredInputs: ["projectId", "catalogId", "artifactSetDigest", "bundleDigest"], nextOnSuccess: "For incompatible or indeterminate results explain the gap and stop; for compatible results offer a separate review without approval."},
  "semantic-review": {tool: "evopilot_project_semantic_review", authority: "NONE", purpose: "Prepare the exact Runtime-owned project semantic review, preserving published selections and current scope.", requiredInputs: ["projectId", "catalogId", "artifactSetDigest", "bundleDigest"], nextOnSuccess: "Present the review and its exact reviewDigest to the owning human. Acknowledgement, test success and generic continue do not approve it."},
  "semantic-approve": {tool: "evopilot_project_semantic_approve", authority: "EXACT_HUMAN_DECISION", purpose: "Transmit only the owning human's explicit APPROVE decision for the exact reviewDigest; Runtime records the current authenticated principal.", requiredInputs: ["projectId", "reviewDigest", "decision"], nextOnSuccess: "Report REVIEWED_NOT_ACTIVATED and eligibleForExecution=false. Do not run a Goal, advance a Lifecycle or claim Release from this decision."},
  "semantic-binding": {tool: "evopilot_project_semantic_binding", authority: "NONE", purpose: "Reconstruct the current reviewed binding from Runtime after restart, Host transfer or an uncertain approval response; never replay approval from conversation.", requiredInputs: ["projectId"], nextOnSuccess: "Explain exact persisted review/decision/binding digests and any current drift or permission failure. Readback is not activation."},
  "semantic-activation": {tool: "evopilot_project_semantic_activation", authority: "NONE", purpose: "Read the current project semantic selection, exact head and transition receipts before activation, migration, rollback or uncertain-response recovery.", requiredInputs: ["projectId"], nextOnSuccess: "Show Runtime facts only. Ask for an unresolved action and exact destination; never select the newest asset. MIGRATE uses a prepared review digest, ACTIVATE/ROLLBACK a binding digest. Old runs retain original pins; current permission still applies."},
  "semantic-transition-review": {tool: "evopilot_project_semantic_transitionReview", authority: "NONE", purpose: "Prepare a Runtime-owned future-plan switch preview from an explicit action, exact expected head and destination. Do not infer these fields from conversation or ids.", requiredInputs: ["projectId", "action", "expectedHeadDigest", "destinationDigest"], nextOnSuccess: "Show changed fields, old binding, destination, future-plan-only effect and exact transitionReviewDigest. Wait for the owning human's explicit decision; preview is not activation or permission to execute."},
  "semantic-transition-approve": {tool: "evopilot_project_semantic_transitionApprove", authority: "EXACT_HUMAN_DECISION", purpose: "Transmit only an explicit owning-human APPROVE bound to this exact transitionReviewDigest and decision evidence reference; do not reuse a binding review approval.", requiredInputs: ["projectId", "transitionReviewDigest", "decision"], nextOnSuccess: "Report the committed transition receipt, not a completed Goal or Release. After an uncertain response read activation history and match the exact transitionReviewDigest; never replay automatically or assume the old receipt is still the current head."}
};

export function routeSemanticExpertIntent(text: string): SemanticExpertIntent | undefined {
  if (!/semantic|ontology|语义|本体|业务地图|双绑定/i.test(text)) return undefined;
  if (/gap|缺口/i.test(text)) return "semantic-gap";
  if (/onboard|接入|初始化|新项目|默认(?:双)?绑定|default.*binding/i.test(text) && !/approve|批准|评审|review|迁移|回滚|transition|migrat|rollback/i.test(text)) return "semantic-onboarding";
  if (/activat|migrat|rollback|successor|transition|激活|迁移|回滚|切换|后继/i.test(text)) {
    if (/status|inspect|readback|resume|恢复|状态|查看|读取/i.test(text)) return "semantic-activation";
    if (/approve|批准|同意.*评审/i.test(text)) return "semantic-transition-approve";
    if (/review|preview|diff|评审|审核|预览|差异/i.test(text)) return "semantic-transition-review";
    return "semantic-activation";
  }
  if (/approve|批准|同意.*评审/i.test(text)) return "semantic-approve";
  if (/compatib|兼容/i.test(text)) return "semantic-compatibility";
  if (/review|评审|审核/i.test(text)) return "semantic-review";
  if (/inspect.*binding|binding.*(?:inspect|status)|查看.*绑定|读取.*绑定|绑定.*(?:查询|状态)|resume|恢复/i.test(text)) return "semantic-binding";
  if (/discover|inspect.*catalog|发现|查看.*(?:地图|本体)|列出/i.test(text)) return "semantic-discover";
  return "semantic-guide";
}

export function semanticOperationForIntent(intent: string): EvoPilotProjectSemanticOperation | undefined {
  return ({"semantic-guide": "capabilities", "semantic-discover": "inspect", "semantic-compatibility": "compatibility", "semantic-gap": "gap",
    "semantic-review": "review", "semantic-approve": "approve", "semantic-binding": "binding", "semantic-activation": "activation",
    "semantic-transition-review": "transitionReview", "semantic-transition-approve": "transitionApprove", "semantic-onboarding": "onboarding"} as Record<string, EvoPilotProjectSemanticOperation>)[intent];
}

/** MCP only, no state cache, default selection, HTTP/CLI fallback or mutation
 * retry. The capability check is advisory: Runtime rechecks authority on use. */
export async function executeExpertSemanticOperation(operation: EvoPilotProjectSemanticOperation, input: Record<string, unknown>, transport: EvolutionExpertTransport,
  decision?: {authorizationDigest: string; evidenceRef: string}): Promise<unknown> {
  const payload = structuredClone(input), request = projectSemanticRequest(operation, payload);
  if (operation === "approve" || operation === "transitionApprove") {
    if (!decision?.evidenceRef?.trim() || !decision.authorizationDigest) throw new Error("EVOLUTION_EXPERT_EXACT_DECISION_REQUIRED");
    if (decision.authorizationDigest !== payload[operation === "approve" ? "reviewDigest" : "transitionReviewDigest"]) throw new Error("EVOLUTION_EXPERT_DECISION_DIGEST_MISMATCH");
  }
  const capability = await transport.invoke("evopilot_project_semantic_capabilities", {projectId: payload.projectId});
  const cap = semanticRuntimeReply(capability, "capabilities");
  if (!cap.ok) return capability;
  requireProjectSemanticCapability(cap.data, payload.projectId as string, request.operation);
  if (operation === "capabilities") return capability;
  return transport.invoke(`evopilot_project_semantic_${operation}`, payload);
}

function record(value: unknown): value is Record<string, unknown> {return value !== null && typeof value === "object" && !Array.isArray(value);}
const hash = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
function transitionReview(value: unknown): value is Record<string, unknown> {
  return record(value) && value.schema === "evopilot-project-semantic-transition-review/v1" &&
    ["ACTIVATE", "MIGRATE", "ROLLBACK"].includes(String(value.action)) &&
    [value.transitionReviewDigest, value.expectedHeadDigest, value.destinationDigest, value.fromBindingDigest].every(hash) &&
    Array.isArray(value.changedFields) && value.changedFields.every(x => typeof x === "string") &&
    value.effect === "FUTURE_EXECUTION_PLANS_ONLY" && value.mutatesExistingExecutions === false && value.grantsExecutionAuthority === false;
}
function transitionReceipt(value: unknown): value is Record<string, unknown> {
  return record(value) && value.schema === "evopilot-project-semantic-transition/v1" && hash(value.transitionDigest) &&
    transitionReview(value.review) && record(value.decision) && value.decision.decision === "APPROVE" &&
    value.decision.transitionReviewDigest === value.review.transitionReviewDigest && hash(value.decision.decisionDigest) &&
    record(value.destination) && record(value.destination.binding) && hash(value.destination.binding.bindingDigest) &&
    value.destination.binding.eligibleForExecution === false;
}
function semanticRuntimeReply(value: unknown, operation: EvoPilotProjectSemanticOperation) {
  const result = record(value) && record(value.structuredContent) ? value.structuredContent : value;
  if (!record(result) || result.schema !== "evopilot-mcp-http-result/v1" || result.tool !== `evopilot_project_semantic_${operation}` ||
      typeof result.ok !== "boolean" || !Number.isInteger(result.status) || typeof result.status !== "number" || result.status < 0 || result.status > 599 ||
      (result.ok && (result.status < 200 || result.status >= 300))) throw new Error("EVOLUTION_EXPERT_SEMANTIC_RESPONSE_INVALID");
  return {ok: result.ok, data: record(result.response) ? result.response.data : undefined, requestId: result.requestId, status: result.status};
}

/** Presentation only. Preserve all blocking states; never turn HTTP success,
 * a compatibility result or a review into business/Goal completion. */
export function explainExpertSemanticResult(operation: EvoPilotProjectSemanticOperation, value: unknown) {
  const response = semanticRuntimeReply(value, operation);
  if (!response.ok) return {schema: "evopilot-expert-semantic-explanation/v1", status: "BLOCKED", requestId: response.requestId,
    httpStatus: response.status, canExecute: false, canComplete: false, nextAction: "Inspect Runtime error and authoritative state; do not retry an uncertain mutation or fall back to legacy execution."};
  const data = response.data;
  if (!record(data)) throw new Error("EVOLUTION_EXPERT_SEMANTIC_RESPONSE_INVALID");
  const base = {schema: "evopilot-expert-semantic-explanation/v1", requestId: response.requestId, canExecute: false, canComplete: false};
  if (operation === "gap") {
    const destinations: Record<string, string> = {REQUIREMENTS_NOT_DECLARED: "HARNESS_DECLARATION_REVIEW", FOUNDATION_MISMATCH: "CROSS_CONTRACT_REVIEW",
      REQUIRED_CONCEPT_MISSING: "ONTOLOGY_MATERIAL_REVIEW", REQUIRED_META_TYPE_MISMATCH: "ONTOLOGY_MATERIAL_REVIEW",
      PROHIBITED_CONCEPT_PRESENT: "ONTOLOGY_MATERIAL_REVIEW", EXPLICIT_RELATION_MISSING: "ONTOLOGY_MATERIAL_REVIEW",
      EVIDENCE_REQUIREMENTS_UNVERIFIED: "EVIDENCE_QUALIFICATION", EXTERNAL_REASONER_UNVERIFIED: "REASONING_QUALIFICATION"};
    if (data.schema !== "evopilot-project-semantic-gap/v1" || ![data.gapDigest, data.inspectionDigest, data.compatibilityDigest, data.artifactSetDigest].every(hash) ||
      !["COMPATIBLE", "INCOMPATIBLE", "INDETERMINATE"].includes(String(data.compatibilityStatus)) ||
      data.status !== (data.compatibilityStatus === "COMPATIBLE" ? "NO_DECLARED_COMPATIBILITY_GAP" : "REVIEW_REQUIRED") ||
      !Array.isArray(data.findings) || data.findings.length > 8 ||
      !data.findings.every(f => record(f) && typeof f.reason === "string" && Object.hasOwn(destinations, f.reason) && f.destination === destinations[f.reason]) ||
      new Set(data.findings.map(f => f.reason)).size !== data.findings.length ||
      (data.compatibilityStatus === "COMPATIBLE" ? data.findings.length !== 0 : data.findings.length === 0) ||
      data.businessField !== null || data.productType !== null || data.selectedSuccessor !== null || data.bindingCreated !== false || data.eligibleForExecution !== false ||
      !record(data.authority) || Object.keys(data.authority).sort().join() !== "mayApprove,mayBind,mayExecute,mayModify,mayPublish,maySelect" ||
      !Object.values(data.authority).every(v => v === false) || !record(data.successorHandoff) ||
      data.successorHandoff.mode !== "EXTERNAL_PRODUCER_REVIEW_ONLY" || data.successorHandoff.action !== "MIGRATE" ||
      data.successorHandoff.destinationKind !== "PREPARED_REVIEW_DIGEST" || data.successorHandoff.preservesExistingRunPins !== true ||
      data.successorHandoff.grantsExecutionAuthority !== false) throw new Error("EVOLUTION_EXPERT_SEMANTIC_RESPONSE_INVALID");
    return {...base, status: data.status, compatibilityStatus: data.compatibilityStatus, findings: data.findings, details: data.details,
      gapDigest: data.gapDigest, selectedSuccessor: null, businessField: null, productType: null,
      nextAction: SEMANTIC_EXPERT_OPERATIONS["semantic-gap"].nextOnSuccess};
  }
  if (operation === "onboarding" && data.schema === "evopilot-project-semantic-onboarding/v1" && hash(data.onboardingDigest) &&
      data.bindingCreated === false && data.preservesLegacyBindings === true && data.grantsExecutionAuthority === false && data.eligibleForExecution === false &&
      data.requiresSeparateBindingApproval === true && data.selectedCandidate === null && data.businessField === null && data.productType === null &&
      data.maximumCandidates === 64 && Array.isArray(data.candidates) && data.candidates.length <= 64 &&
      data.candidates.every(c => record(c) && ["COMPATIBLE", "INCOMPATIBLE", "INDETERMINATE"].includes(String(c.status)) &&
        [c.artifactSetDigest, c.bundleDigest, c.compatibilityDigest, c.closureDigest].every(hash) &&
        typeof c.bundleId === "string" && typeof c.bundleVersion === "string" && Array.isArray(c.reasons) && c.reasons.every(r => typeof r === "string"))) {
    const compatible = data.candidates.filter(c => c.status === "COMPATIBLE").length;
    const existing = record(data.existingBinding), indeterminate = data.candidates.some(c => c.status === "INDETERMINATE");
    const expected = existing ? "EXISTING_BINDING" : compatible > 1 ? "SELECTION_REQUIRED" : compatible === 1 ? "REVIEW_REQUIRED" :
      indeterminate ? "EVIDENCE_REQUIRED" : data.candidates.length ? "NO_COMPATIBLE_MATCH" : "NO_PUBLISHED_CANDIDATE";
    const missing = compatible ? ["artifactSetDigest", "bundleDigest"] : [];
    if (data.status !== expected || data.compatibleCount !== compatible || JSON.stringify(data.missingInputs) !== JSON.stringify(missing) ||
        data.recommendedBindingMode !== (existing ? "PRESERVE_EXISTING_BINDING" : compatible ? "DUAL_BINDING_REVIEW" : "UNRESOLVED") ||
        (existing ? data.candidates.length !== 0 || !record(data.existingBinding) || !hash(data.existingBinding.bindingDigest) || !hash(data.existingBinding.headDigest) || data.candidatesDigest !== null :
          data.existingBinding !== null || !hash(data.candidatesDigest))) throw new Error("EVOLUTION_EXPERT_SEMANTIC_RESPONSE_INVALID");
    return {...base, status: expected, recommendedBindingMode: data.recommendedBindingMode, candidates: data.candidates,
      existingBinding: data.existingBinding, missingInputs: missing, businessField: null, productType: null, onboardingDigest: data.onboardingDigest,
      nextAction: existing ? "Preserve this binding; inspect Runtime activation before any explicit transition." : compatible ?
        "Ask for the exact published pair, prepare its review, then require a separate digest-bound human decision. A unique candidate is not permission to select or approve." :
        "Explain missing or incompatible semantic evidence. Do not infer a map, invent business facts, switch Catalog or fall back to legacy execution."};
  }
  if (operation === "activation" && data.schema === "evopilot-project-semantic-activation/v1" &&
      ["REVIEWED_DEFAULT", "ACTIVE_FOR_FUTURE_PLANS"].includes(String(data.status)) && hash(data.headDigest) && hash(data.bindingDigest) &&
      data.grantsExecutionAuthority === false && Array.isArray(data.transitions) && data.transitions.length <= 64 && data.transitions.every(transitionReceipt)) {
    const latest = data.transitions.at(-1);
    if (latest ? data.status !== "ACTIVE_FOR_FUTURE_PLANS" || latest.transitionDigest !== data.headDigest ||
        (latest.destination as {binding: {bindingDigest: string}}).binding.bindingDigest !== data.bindingDigest :
        data.status !== "REVIEWED_DEFAULT" || data.headDigest !== data.bindingDigest) throw new Error("EVOLUTION_EXPERT_SEMANTIC_RESPONSE_INVALID");
    return {...base, status: data.status, headDigest: data.headDigest, bindingDigest: data.bindingDigest,
      transitionCount: data.transitions.length, transitionReceipts: data.transitions.map(r => ({transitionDigest: r.transitionDigest,
        transitionReviewDigest: (r.review as Record<string, unknown>).transitionReviewDigest})),
      nextAction: "Reconcile an uncertain decision by its exact review digest. Historical receipt is not current selection. Request only missing explicit action/destination; never replay, auto-select, migrate existing runs or infer execution authority."};
  }
  if (operation === "transitionReview" && transitionReview(data)) return {...base, status: "WAITING_EXACT_HUMAN_DECISION",
    transitionReviewDigest: data.transitionReviewDigest, action: data.action, expectedHeadDigest: data.expectedHeadDigest,
    destinationDigest: data.destinationDigest, fromBindingDigest: data.fromBindingDigest, changedFields: data.changedFields, effect: data.effect,
    nextAction: "Present this exact future-plan-only preview and require an explicit decision bound to transitionReviewDigest, not a prior binding approval."};
  if (operation === "transitionApprove" && transitionReceipt(data)) return {...base, status: "TRANSITION_RECORDED",
    transitionDigest: data.transitionDigest, transitionReviewDigest: (data.review as Record<string, unknown>).transitionReviewDigest,
    nextAction: "Read activation to verify the current head; this receipt may be historical. Existing runs retain original pins. No Goal completion, execution, publication or Release authority is granted."};
  if (operation === "capabilities") {
    requireProjectSemanticCapability(data, String(data.projectId), "capabilities");
    return {...base, status: "CAPABILITIES_ONLY", projectId: data.projectId, operations: data.operations,
      nextAction: "Use only advertised project operations; capability is not permission. Public semantic execution, completion and migration are not enabled by discovery/review."};
  }
  if (operation === "inspect" && data.schema === "evopilot-project-semantic-discovery/v1" && Array.isArray(data.sets)) return {
    ...base, status: "DISCOVERY_ONLY", projectId: data.projectId, catalogId: data.catalogId, availableSetCount: data.sets.length,
    discoveryDigest: data.discoveryDigest, nextAction: "Present exact published selections; business field and product type are unknown unless Runtime supplies them. Do not derive them from identifiers."};
  if (operation === "compatibility" && data.schema === "evopilot-project-semantic-compatibility-inspect/v1" && record(data.report) &&
      ["COMPATIBLE", "INCOMPATIBLE", "INDETERMINATE"].includes(String(data.report.status))) return {...base, status: data.report.status,
    projectId: data.projectId, reasons: data.report.reasons, inspectionDigest: data.inspectionDigest,
    nextAction: data.report.status === "COMPATIBLE" ? "Offer an exact separate binding review; this is not Harness eligibility or approval." : "Explain the Runtime gap and stop; do not pick another asset or invent a successor."};
  if (operation === "review" && data.schema === "evopilot-project-semantic-binding-review/v1") return {...base,
    status: "WAITING_EXACT_HUMAN_DECISION", reviewDigest: data.reviewDigest,
    nextAction: "Show this exact review; require explicit human APPROVE bound to reviewDigest and retain the decision evidence reference."};
  if (["approve", "binding"].includes(operation) && record(data.binding) && data.binding.schema === "evopilot-project-semantic-binding/v1" &&
      data.binding.status === "REVIEWED_NOT_ACTIVATED" && data.binding.eligibleForExecution === false) return {...base,
    status: "REVIEWED_NOT_ACTIVATED", bindingDigest: data.binding.bindingDigest,
    nextAction: "Inspect current Runtime state on resume. Approval does not activate a Goal, Lifecycle, semantic successor or Release."};
  throw new Error("EVOLUTION_EXPERT_SEMANTIC_RESPONSE_INVALID");
}
