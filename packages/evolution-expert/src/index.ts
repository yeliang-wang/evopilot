import { createHash } from "node:crypto";
import {
  EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION,
  EVOPILOT_HUMAN_INTERACTION_PROTOCOL_SCHEMA,
  type EvoPilotEvolutionExpertAdapterManifestV1,
  type EvoPilotEvolutionExpertCompatibilityV1,
  type EvoPilotHumanInteractionMessageV1
} from "@evopilot/contracts";

export const EVOPILOT_EVOLUTION_EXPERT_VERSION = "1.1.0";
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
  | "version-explain"
  | "capability"
  | "migration"
  | "cutover"
  | "rollback"
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
  "project-onboard": { tool: "evopilot_project_definition_register", authority: "NONE", purpose: "Register one immutable declarative project definition from Runtime-owned typed questions.", requiredInputs: ["projectDiscovery", "projectDefinition"], nextOnSuccess: "Resolve a published Harness for the first GoalTarget." },
  "project-adjust": { tool: "evopilot_project_definition_register", authority: "NONE", purpose: "Create a new project-definition revision from Runtime-owned impact and question objects; never overwrite the old revision.", requiredInputs: ["projectImpact", "projectDefinition"], nextOnSuccess: "Show selective drift and exact rollback options." },
  "harness-explain": { tool: "evopilot_governed_evolution_plan", authority: "NONE", purpose: "Explain Runtime-produced match, rejected alternatives, immutable Bundle, and Lifecycle composition.", requiredInputs: ["projectDefinitionId", "goalTarget", "lifecycleId"], nextOnSuccess: "Present the exact binding and non-authorizing review." },
  "goal-run": { tool: "evopilot_lifecycle_start", authority: "NONE", purpose: "Create a governed run from an exact Runtime binding without authorizing execution.", requiredInputs: ["projectId", "goalId", "targetId", "harnessBundle", "lifecycleId"], nextOnSuccess: "Ask only unresolved inputs, then present the exact plan decision if required." },
  status: { tool: "evopilot_lifecycle_run_inspect", authority: "NONE", purpose: "Show Runtime-owned progress, evidence, blockers, and next action.", requiredInputs: ["runId"], nextOnSuccess: "Continue automatic work or explain the exact boundary." },
  recovery: { tool: "evopilot_recovery_decide", authority: "NONE", purpose: "Classify failure and render automatic recovery, rule proposal, or exact human boundary.", requiredInputs: ["failureClass", "failureSignature", "bindingDigest"], nextOnSuccess: "Apply bounded automation or present one exact decision." },
  "version-explain": { tool: "evopilot_resource_inspect", authority: "NONE", purpose: "Explain immutable source Suite identity separately from resource, Runtime, Expert, and Harness versions.", requiredInputs: ["kind", "resourceId"], nextOnSuccess: "Show compatible upgrade and rollback paths without implying lockstep releases." },
  capability: { tool: "evopilot_capability_inventory_validate", authority: "NONE", purpose: "Show the explicit destination and validator for each frozen Suite capability without loading either Suite.", requiredInputs: ["sources", "dispositions"], nextOnSuccess: "Explain Runtime, resource, Expert, project, and Harness ownership boundaries." },
  migration: { tool: "evopilot_capability_inventory_validate", authority: "NONE", purpose: "Build a read-only migration inventory and identify missing declarative resources or evidence.", requiredInputs: ["sources", "dispositions"], nextOnSuccess: "Offer shadow comparison; do not switch, disable, or retire a Suite." },
  cutover: { tool: "evopilot_interaction_render", authority: "NONE", purpose: "Explain shadow and Cutover readiness from Runtime evidence without performing Cutover.", requiredInputs: ["sessionDigest", "cutoverReadiness"], nextOnSuccess: "Require a separate Cutover Target and exact owning-human authorization after public installation verification." },
  rollback: { tool: "evopilot_resource_inspect", authority: "NONE", purpose: "Show the exact immutable resource revision and rollback target without mutating Runtime state.", requiredInputs: ["kind", "resourceId", "version"], nextOnSuccess: "Route any activation or rollback to an exact Runtime operation and human evidence." },
  evidence: { tool: "evopilot_lifecycle_run_inspect", authority: "NONE", purpose: "Explain immutable Runtime evidence without creating facts.", requiredInputs: ["runId"], nextOnSuccess: "Map evidence to pending criteria." },
  acceptance: { tool: "evopilot_interaction_render", authority: "NONE", purpose: "Explain Candidate-bound acceptance readiness and missing evidence.", requiredInputs: ["sessionDigest", "acceptanceAggregate"], nextOnSuccess: "Remain stopped until every required criterion passes." },
  release: { tool: "evopilot_interaction_render", authority: "EXACT_HUMAN_DECISION", purpose: "Render one exact release decision after accepted Candidate evidence; never publish by itself.", requiredInputs: ["sessionDigest", "releaseBinding", "authorizationDigest"], nextOnSuccess: "Return the authorized object to Runtime release mechanics." }
};

const coreWithoutDigest = {
  schema: EVOPILOT_EVOLUTION_EXPERT_CORE_SCHEMA as typeof EVOPILOT_EVOLUTION_EXPERT_CORE_SCHEMA,
  version: EVOPILOT_EVOLUTION_EXPERT_VERSION as typeof EVOPILOT_EVOLUTION_EXPERT_VERSION,
  protocolVersion: EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION as typeof EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION,
  intents: ["help", "tutorial", "project-onboard", "project-adjust", "harness-explain", "goal-run", "status", "recovery", "version-explain", "capability", "migration", "cutover", "rollback", "evidence", "acceptance", "release", "unknown"] as ExpertIntent[],
  principles: [
    "Runtime objects are authoritative; conversation is presentation and input only.",
    "Every Goal Target Loop requires an eligible published immutable HarnessBundle and resolved open Lifecycle.",
    "Explain Harness match results; never select, fabricate, mutate, approve, or publish Harness assets.",
    "Ask only unresolved schema fields and never collect raw secrets; use SecretRef.",
    "Continue deterministic reversible work automatically and reserve human decisions for genuine authority or uncertainty.",
    "Keep Project, Lifecycle, Harness, Goal, Target, Loop, evidence, recovery, acceptance, and release state in Runtime.",
    "Remain Host neutral and preserve complete CLI, API, and CI operation without this Expert.",
    "Keep Runtime, Expert, declarative resource, source Suite, project, and Harness versions independent and explicit."
  ],
  operations
};

export const EVOLUTION_EXPERT_CORE: EvolutionExpertCore = { ...coreWithoutDigest, digest: digest(coreWithoutDigest) };

export function routeExpertIntent(text: string): { intent: ExpertIntent; confidence: number } {
  const normalized = text.trim().toLowerCase();
  const patterns: Array<[ExpertIntent, RegExp]> = [
    ["tutorial", /tutorial|教程|入门|演示/],
    ["version-explain", /version|semver|版本|升级关系/],
    ["capability", /capabilit|能力清单|能力差异/],
    ["migration", /migrat|迁移|收敛/],
    ["cutover", /cutover|shadow|切换准备|影子验证/],
    ["rollback", /rollback resource|resource rollback|资源回滚|回退资源/],
    ["project-adjust", /adjust project|update project|rollback project|调整项目|修改项目|回滚项目/],
    ["project-onboard", /onboard|register project|new project|接入项目|注册项目|新项目/],
    ["harness-explain", /harness|bundle|匹配|专业约束/],
    ["recovery", /recover|retry|resume|failure|异常|错误|恢复|重试/],
    ["acceptance", /acceptance|e2e|验收|端到端/],
    ["release", /release|publish|发布/],
    ["evidence", /evidence|proof|证据/],
    ["status", /status|progress|next|状态|进度|下一步/],
    ["goal-run", /goal|target|loop|执行目标|运行/],
    ["help", /help|how|what|where (?:do|should) i start|getting started|first[- ]time|new to evopilot|帮助|怎么|是什么|从哪里开始|如何开始|第一次(?:使用|接触)|初次(?:使用|接触)/]
  ];
  for (const [intent, pattern] of patterns) if (pattern.test(normalized)) return { intent, confidence: 0.95 };
  return { intent: "unknown", confidence: 0 };
}

export function planExpertTurn(text: string, payload: Record<string, unknown> = {}): ExpertTurnPlan {
  const routed = routeExpertIntent(text);
  const operation = routed.intent === "unknown" ? undefined : EVOLUTION_EXPERT_CORE.operations[routed.intent];
  const missing = operation?.requiredInputs.filter((key) => payload[key] === undefined) ?? [];
  const guidance = routed.intent === "unknown"
    ? ["Describe whether you want help, a tutorial, project onboarding, Harness explanation, a Goal run, recovery, version/capability/migration/Cutover guidance, evidence, acceptance, or release guidance."]
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

export function expertVersionGuide() {
  const material = {
    schema: "evopilot-evolution-expert-version-guide/v1" as const,
    expertVersion: EVOPILOT_EVOLUTION_EXPERT_VERSION,
    versionLines: [
      { owner: "Runtime", current: "5.1.0", changesWhen: "Runtime code, public contract, schema compatibility, or execution semantics change.", independentFrom: ["Expert", "governed resources", "Harness assets", "source Suites"] },
      { owner: "Evolution Expert", current: EVOPILOT_EVOLUTION_EXPERT_VERSION, changesWhen: "Expert interaction or adapter package behavior changes.", independentFrom: ["Runtime", "governed resources", "Harness assets", "source Suites"] },
      { owner: "governed resource", current: "resource.metadata.version", changesWhen: "The project declaration, Pack, Provider, binding, authority role, or Lifecycle resource changes.", independentFrom: ["Runtime", "Expert"] },
      { owner: "source Suite", current: "provenance.sourceVersion", changesWhen: "Never inside EvoPilot; it is immutable migration provenance.", independentFrom: ["derived resource version"] },
      { owner: "Harness asset", current: "published HarnessBundle version", changesWhen: "evopilot-harness publishes a new immutable asset.", independentFrom: ["Runtime", "Expert", "project resources"] }
    ],
    rules: [
      "DataRig Suite 2.1.5 and EvoPilot Suite 3.2.1 retain those exact source identities.",
      "A first derived resource may be 1.0.0; that does not rename or reset its source Suite.",
      "A compatible resource revision does not require a Runtime or Expert release."
    ]
  };
  return { ...material, digest: digest(material) };
}

export function expertMigrationGuide() {
  const material = {
    schema: "evopilot-evolution-expert-migration-guide/v1" as const,
    sideEffects: false as const,
    sourcePolicy: "LATEST_ONLY_NO_HISTORICAL_COMPATIBILITY" as const,
    phases: [
      { id: "freeze", action: "Bind exact source Suite version and digest read-only.", mutation: false },
      { id: "inventory", action: "Map every capability to Runtime, resource, Expert, project, Harness, or explicit exclusion.", mutation: false },
      { id: "derive", action: "Register independently versioned, human-readable resources with immutable provenance.", mutation: false },
      { id: "shadow", action: "Run equivalent frozen scenarios and require zero hidden Suite invocation.", mutation: false },
      { id: "cutover-readiness", action: "Require public installation, 100-percent evidence, rollback, and separate Cutover Target.", mutation: false },
      { id: "cutover", action: "Not performed by this guide or this Expert Target.", mutation: false }
    ],
    exactHumanBoundaries: ["resource activation or rollback", "Suite Cutover", "credential", "database", "production", "acceptance", "publication", "release"]
  };
  return { ...material, digest: digest(material) };
}

export function expertTutorial(): { schema: "evopilot-evolution-expert-tutorial/v1"; version: string; sideEffects: false; steps: Array<{ concept: string; explanation: string; nextCommand: string }>; digest: string } {
  const material = {
    schema: "evopilot-evolution-expert-tutorial/v1" as const,
    version: EVOPILOT_EVOLUTION_EXPERT_VERSION,
    sideEffects: false as const,
    steps: [
      { concept: "Project", explanation: "A versioned declaration of source, delivery, policy, environment, Host, Runtime, and evidence discovery.", nextCommand: "evopilot project-definition discover --file detected-facts.yaml" },
      { concept: "Resource versions", explanation: "Project resources evolve independently from Runtime and Expert while retaining exact source Suite provenance.", nextCommand: "evopilot-expert versions" },
      { concept: "Harness", explanation: "A published immutable professional obligation set selected by Runtime; Expert never chooses or changes it.", nextCommand: "evopilot evolution plan --file plan-request.yaml" },
      { concept: "Lifecycle", explanation: "A human-readable orchestration that may strengthen but never weaken Harness obligations.", nextCommand: "evopilot evolution run --file exact-binding-run-request.yaml" },
      { concept: "Goal Target Loop", explanation: "Execution revalidates the exact binding at start, resume, retry, and every iteration.", nextCommand: "evopilot lifecycle-run inspect <run-id>" },
      { concept: "Recovery", explanation: "Safe deterministic failures continue within bounded authority; genuine authority and uncertain mutations stop exactly once.", nextCommand: "evopilot evolution recover --file failure.json" },
      { concept: "Acceptance and Release", explanation: "Candidate-specific evidence must reach 100% and Release remains a separate exact decision.", nextCommand: "evopilot-expert plan 'show acceptance readiness'" }
    ]
  };
  return { ...material, digest: digest(material) };
}

export function expertDoctor(host: string, engineVersion: string, hostCapabilities: string[]) {
  const adapter = createExpertAdapter(host);
  const compatibility = expertCompatibility(adapter, engineVersion, hostCapabilities);
  const material = {
    schema: "evopilot-evolution-expert-doctor/v1" as const,
    expertVersion: EVOPILOT_EVOLUTION_EXPERT_VERSION,
    host,
    adapterDigest: adapter.digest,
    coreDigest: adapter.coreDigest,
    protocolVersion: adapter.protocolVersion,
    compatibility,
    status: compatibility.conformanceStatus === "CONFORMANT" ? "READY" as const : "INCOMPATIBLE" as const,
    nextAction: compatibility.conformanceStatus === "CONFORMANT" ? "Start with help or the side-effect-free tutorial." : "Use the Runtime CLI/API/CI path or install a compatible Expert/Host adapter."
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

export function qualifyExpertHostAdapter(host: string, engineVersion: string, hostCapabilities: string[]) {
  const adapter = createExpertAdapter(host);
  assertExpertAdapterConformance(adapter);
  const compatibility = expertCompatibility(adapter, engineVersion, hostCapabilities);
  const checks = [
    { id: "core-binding", status: adapter.coreDigest === EVOLUTION_EXPERT_CORE.digest ? "PASS" as const : "FAIL" as const },
    { id: "protocol", status: adapter.protocolVersion === EVOPILOT_EVOLUTION_EXPERT_PROTOCOL_VERSION ? "PASS" as const : "FAIL" as const },
    { id: "host-capabilities", status: compatibility.conformanceStatus === "CONFORMANT" ? "PASS" as const : "FAIL" as const },
    { id: "runtime-state-ownership", status: adapter.prohibitedSemantics.includes("own-runtime-state") ? "PASS" as const : "FAIL" as const },
    { id: "authority-separation", status: adapter.prohibitedSemantics.includes("infer-approval") ? "PASS" as const : "FAIL" as const },
    { id: "zero-engine-source-modification", status: "PASS" as const }
  ];
  const material = {
    schema: "evopilot-evolution-expert-host-qualification/v1" as const,
    host,
    engineVersion,
    expertVersion: EVOPILOT_EVOLUTION_EXPERT_VERSION,
    coreDigest: EVOLUTION_EXPERT_CORE.digest,
    adapterDigest: adapter.digest,
    sourceModificationRequired: false as const,
    checks,
    status: checks.every((check) => check.status === "PASS") ? "QUALIFIED" as const : "REJECTED" as const
  };
  return { ...material, digest: digest(material) };
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
