import { createHash } from "node:crypto";
import {
  EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION,
  EVOPILOT_HUMAN_INTERACTION_PROTOCOL_SCHEMA,
  type EvoPilotEvolutionExpertAdapterManifestV1,
  type EvoPilotEvolutionExpertCompatibilityV1,
  type EvoPilotHumanInteractionMessageV1
} from "@evopilot/contracts";

export const EVOPILOT_EVOLUTION_EXPERT_VERSION = "1.0.0";
export const EVOPILOT_EVOLUTION_EXPERT_CORE_SCHEMA = "evopilot-evolution-expert-core/v1";

export type ExpertIntent =
  | "help"
  | "tutorial"
  | "project-onboard"
  | "project-adjust"
  | "harness-explain"
  | "goal-run"
  | "status"
  | "recovery"
  | "evidence"
  | "acceptance"
  | "release"
  | "unknown";

export interface EvolutionExpertCore {
  schema: typeof EVOPILOT_EVOLUTION_EXPERT_CORE_SCHEMA;
  version: typeof EVOPILOT_EVOLUTION_EXPERT_VERSION;
  protocolVersion: typeof EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION;
  intents: ExpertIntent[];
  principles: string[];
  operations: Record<Exclude<ExpertIntent, "unknown">, ExpertOperation>;
  digest: string;
}

export interface ExpertOperation {
  tool: string;
  authority: "NONE" | "EXACT_HUMAN_DECISION";
  purpose: string;
  requiredInputs: string[];
  nextOnSuccess: string;
}

export interface ExpertTurnPlan {
  schema: "evopilot-evolution-expert-turn/v1";
  intent: ExpertIntent;
  confidence: number;
  coreDigest: string;
  operation?: ExpertOperation;
  guidance: string[];
  requiresExactHumanDecision: boolean;
  payload: Record<string, unknown>;
  digest: string;
}

export interface EvolutionExpertTransport {
  invoke(tool: string, payload: Record<string, unknown>): Promise<EvoPilotHumanInteractionMessageV1 | Record<string, unknown>>;
}

const operations: EvolutionExpertCore["operations"] = {
  help: { tool: "evopilot_interaction_render", authority: "NONE", purpose: "Explain installed-version concepts and route the user's intent.", requiredInputs: ["sessionDigest"], nextOnSuccess: "Offer the smallest relevant next action." },
  tutorial: { tool: "evopilot_interaction_render", authority: "NONE", purpose: "Run a side-effect-free guided tutorial.", requiredInputs: ["sessionDigest"], nextOnSuccess: "Offer project discovery without registering anything." },
  "project-onboard": { tool: "evopilot_project_definition_register", authority: "NONE", purpose: "Register one immutable declarative project definition from Runtime-owned schema answers.", requiredInputs: ["projectDefinition"], nextOnSuccess: "Resolve a published Harness for the first GoalTarget." },
  "project-adjust": { tool: "evopilot_project_definition_register", authority: "NONE", purpose: "Create a new project-definition revision; never overwrite the old revision.", requiredInputs: ["projectDefinition"], nextOnSuccess: "Show selective drift and rollback options." },
  "harness-explain": { tool: "evopilot_governed_evolution_plan", authority: "NONE", purpose: "Explain Runtime-produced match, rejected alternatives, immutable Bundle, and Lifecycle composition.", requiredInputs: ["projectDefinitionId", "goalTarget", "lifecycleId"], nextOnSuccess: "Present the exact binding and non-authorizing review." },
  "goal-run": { tool: "evopilot_lifecycle_start", authority: "NONE", purpose: "Create a governed run from an exact Runtime binding without authorizing execution.", requiredInputs: ["projectId", "goalId", "targetId", "harnessBundle", "lifecycleId"], nextOnSuccess: "Ask only unresolved inputs, then present the exact plan decision if required." },
  status: { tool: "evopilot_lifecycle_run_inspect", authority: "NONE", purpose: "Show Runtime-owned progress, evidence, blockers, and next action.", requiredInputs: ["runId"], nextOnSuccess: "Continue automatic work or explain the exact boundary." },
  recovery: { tool: "evopilot_recovery_decide", authority: "NONE", purpose: "Classify failure and render automatic recovery, rule proposal, or exact human boundary.", requiredInputs: ["failureClass", "failureSignature", "bindingDigest"], nextOnSuccess: "Apply bounded automation or present one exact decision." },
  evidence: { tool: "evopilot_lifecycle_run_inspect", authority: "NONE", purpose: "Explain immutable Runtime evidence without creating facts.", requiredInputs: ["runId"], nextOnSuccess: "Map evidence to pending criteria." },
  acceptance: { tool: "evopilot_interaction_render", authority: "NONE", purpose: "Explain Candidate-bound acceptance readiness and missing evidence.", requiredInputs: ["sessionDigest", "acceptanceAggregate"], nextOnSuccess: "Remain stopped until every required criterion passes." },
  release: { tool: "evopilot_interaction_render", authority: "EXACT_HUMAN_DECISION", purpose: "Render one exact release decision after accepted Candidate evidence; never publish by itself.", requiredInputs: ["sessionDigest", "releaseBinding", "authorizationDigest"], nextOnSuccess: "Return the authorized object to Runtime release mechanics." }
};

const coreWithoutDigest = {
  schema: EVOPILOT_EVOLUTION_EXPERT_CORE_SCHEMA as typeof EVOPILOT_EVOLUTION_EXPERT_CORE_SCHEMA,
  version: EVOPILOT_EVOLUTION_EXPERT_VERSION as typeof EVOPILOT_EVOLUTION_EXPERT_VERSION,
  protocolVersion: EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION as typeof EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION,
  intents: ["help", "tutorial", "project-onboard", "project-adjust", "harness-explain", "goal-run", "status", "recovery", "evidence", "acceptance", "release", "unknown"] as ExpertIntent[],
  principles: [
    "Runtime objects are authoritative; conversation is presentation and input only.",
    "Every Goal Target Loop requires an eligible published immutable HarnessBundle and resolved open Lifecycle.",
    "Explain Harness match results; never select, fabricate, mutate, approve, or publish Harness assets.",
    "Ask only unresolved schema fields and never collect raw secrets; use SecretRef.",
    "Continue deterministic reversible work automatically and reserve human decisions for genuine authority or uncertainty.",
    "Keep Project, Lifecycle, Harness, Goal, Target, Loop, evidence, recovery, acceptance, and release state in Runtime.",
    "Remain Host neutral and preserve complete CLI, API, and CI operation without this Expert."
  ],
  operations
};

export const EVOLUTION_EXPERT_CORE: EvolutionExpertCore = { ...coreWithoutDigest, digest: digest(coreWithoutDigest) };

export function routeExpertIntent(text: string): { intent: ExpertIntent; confidence: number } {
  const normalized = text.trim().toLowerCase();
  const patterns: Array<[ExpertIntent, RegExp]> = [
    ["tutorial", /tutorial|教程|入门|演示/],
    ["project-adjust", /adjust project|update project|rollback project|调整项目|修改项目|回滚项目/],
    ["project-onboard", /onboard|register project|new project|接入项目|注册项目|新项目/],
    ["harness-explain", /harness|bundle|匹配|专业约束/],
    ["recovery", /recover|retry|resume|failure|异常|错误|恢复|重试/],
    ["acceptance", /acceptance|e2e|验收|端到端/],
    ["release", /release|publish|发布/],
    ["evidence", /evidence|proof|证据/],
    ["status", /status|progress|next|状态|进度|下一步/],
    ["goal-run", /goal|target|loop|执行目标|运行/],
    ["help", /help|how|what|帮助|怎么|是什么/]
  ];
  for (const [intent, pattern] of patterns) if (pattern.test(normalized)) return { intent, confidence: 0.95 };
  return { intent: "unknown", confidence: 0 };
}

export function planExpertTurn(text: string, payload: Record<string, unknown> = {}): ExpertTurnPlan {
  const routed = routeExpertIntent(text);
  const operation = routed.intent === "unknown" ? undefined : EVOLUTION_EXPERT_CORE.operations[routed.intent];
  const missing = operation?.requiredInputs.filter((key) => payload[key] === undefined) ?? [];
  const guidance = routed.intent === "unknown"
    ? ["Describe whether you want help, a tutorial, project onboarding, Harness explanation, a Goal run, recovery, evidence, acceptance, or release guidance."]
    : missing.length
      ? [`Ask only for unresolved Runtime schema fields: ${missing.join(", ")}.`, "Input collection does not authorize execution or publication."]
      : [operation!.purpose, operation!.nextOnSuccess];
  const material = {
    schema: "evopilot-evolution-expert-turn/v1" as const,
    intent: routed.intent,
    confidence: routed.confidence,
    coreDigest: EVOLUTION_EXPERT_CORE.digest,
    ...(operation ? { operation } : {}),
    guidance,
    requiresExactHumanDecision: operation?.authority === "EXACT_HUMAN_DECISION",
    payload
  };
  return { ...material, digest: digest(material) };
}

export async function executeExpertTurn(plan: ExpertTurnPlan, transport: EvolutionExpertTransport, decision?: { authorizationDigest: string; evidenceRef: string }): Promise<unknown> {
  if (plan.coreDigest !== EVOLUTION_EXPERT_CORE.digest || plan.digest !== digest({ ...plan, digest: undefined })) throw new Error("EVOLUTION_EXPERT_TURN_DRIFT");
  if (!plan.operation) return { status: "NEEDS_CLARIFICATION", guidance: plan.guidance };
  const missing = plan.operation.requiredInputs.filter((key) => plan.payload[key] === undefined);
  if (missing.length) return { status: "NEEDS_INPUT", missing, guidance: plan.guidance };
  if (plan.operation.authority === "EXACT_HUMAN_DECISION") {
    if (!decision?.authorizationDigest || !/^sha256:[a-f0-9]{64}$/.test(decision.authorizationDigest) || !decision.evidenceRef?.trim()) throw new Error("EVOLUTION_EXPERT_EXACT_DECISION_REQUIRED");
    if (plan.payload.authorizationDigest !== decision.authorizationDigest) throw new Error("EVOLUTION_EXPERT_DECISION_DIGEST_MISMATCH");
  }
  return transport.invoke(plan.operation.tool, plan.payload);
}

export function createExpertAdapter(host: string, version = EVOPILOT_EVOLUTION_EXPERT_VERSION): EvoPilotEvolutionExpertAdapterManifestV1 {
  const id = `evopilot-evolution-expert-${host}`;
  const material = {
    schema: "evopilot-evolution-expert-adapter/v1" as const,
    id,
    host,
    version,
    coreDigest: EVOLUTION_EXPERT_CORE.digest,
    protocolVersion: EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION as typeof EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION,
    requiredCapabilities: ["structured-tool-results", "local-or-remote-mcp", "human-decision-presentation"],
    interactionModes: host === "generic-mcp" ? ["mcp" as const] : ["skill" as const, "mcp" as const],
    instructions: EVOLUTION_EXPERT_CORE.principles,
    prohibitedSemantics: ["own-runtime-state", "select-or-mutate-harness", "infer-approval", "collect-raw-secrets", "host-specific-lifecycle", "automatic-publication"]
  };
  return { ...material, digest: digest(material) };
}

export function assertExpertAdapterConformance(adapter: EvoPilotEvolutionExpertAdapterManifestV1): void {
  if (adapter.schema !== "evopilot-evolution-expert-adapter/v1" || adapter.coreDigest !== EVOLUTION_EXPERT_CORE.digest) throw new Error("EVOLUTION_EXPERT_CORE_BINDING_INVALID");
  if (adapter.protocolVersion !== EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION) throw new Error("EVOLUTION_EXPERT_PROTOCOL_INCOMPATIBLE");
  const required = ["own-runtime-state", "select-or-mutate-harness", "infer-approval", "collect-raw-secrets", "host-specific-lifecycle", "automatic-publication"];
  if (required.some((item) => !adapter.prohibitedSemantics.includes(item))) throw new Error("EVOLUTION_EXPERT_PROHIBITION_MISSING");
  if (adapter.digest !== digest({ ...adapter, digest: undefined })) throw new Error("EVOLUTION_EXPERT_ADAPTER_DIGEST_MISMATCH");
}

export function expertCompatibility(adapter: EvoPilotEvolutionExpertAdapterManifestV1, engineVersion: string, hostCapabilities: string[]): EvoPilotEvolutionExpertCompatibilityV1 {
  const compatibleEngine = /^5\./.test(engineVersion);
  const missing = adapter.requiredCapabilities.filter((capability) => !hostCapabilities.includes(capability));
  return {
    schema: "evopilot-evolution-expert-compatibility/v1",
    expertVersion: EVOPILOT_EVOLUTION_EXPERT_VERSION,
    engineProtocolRange: ">=5.0.0 <6.0.0",
    expertProtocolVersion: EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION,
    coreDigest: EVOLUTION_EXPERT_CORE.digest,
    adapterId: adapter.id,
    adapterDigest: adapter.digest,
    requiredHostCapabilities: adapter.requiredCapabilities,
    conformanceStatus: compatibleEngine && missing.length === 0 ? "CONFORMANT" : "INCOMPATIBLE"
  };
}

export function renderInteraction(message: EvoPilotHumanInteractionMessageV1): string {
  if (message.schema !== EVOPILOT_HUMAN_INTERACTION_PROTOCOL_SCHEMA || message.protocolVersion !== EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION) throw new Error("EVOLUTION_EXPERT_INTERACTION_PROTOCOL_INCOMPATIBLE");
  const lines = [message.title, message.summary, ...message.details];
  if (message.authority === "EXACT_HUMAN_DECISION") {
    lines.push("This is an exact human authority boundary. Generic confirmation does not count.");
    for (const option of message.options ?? []) lines.push(`${option.id}: ${option.label} — ${option.consequence}`);
  }
  if (message.nextAction) lines.push(`Next: ${message.nextAction}`);
  return lines.join("\n");
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
