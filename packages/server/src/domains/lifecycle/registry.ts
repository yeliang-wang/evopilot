import { createHash } from "node:crypto";

export interface LifecycleActionDefinition {
  id: string;
  version: string;
  execution: "INTERNAL" | "EXTERNAL_ADAPTER";
  capabilities: string[];
  parameters: string[];
  effect: "READ_ONLY" | "REVERSIBLE" | "EXTERNAL" | "IRREVERSIBLE";
}

const ACTIONS: LifecycleActionDefinition[] = [
  { id: "project.validate", version: "1", execution: "INTERNAL", capabilities: ["project.read"], parameters: ["strict"], effect: "READ_ONLY" },
  { id: "readiness.evaluate", version: "1", execution: "INTERNAL", capabilities: ["evidence.read"], parameters: ["profile"], effect: "READ_ONLY" },
  { id: "evidence.aggregate", version: "1", execution: "INTERNAL", capabilities: ["evidence.write"], parameters: ["format"], effect: "REVERSIBLE" },
  { id: "agent.execute", version: "1", execution: "EXTERNAL_ADAPTER", capabilities: ["agent.execute"], parameters: ["objective", "scope", "mode"], effect: "REVERSIBLE" },
  { id: "evopilot.goal-loop", version: "1", execution: "EXTERNAL_ADAPTER", capabilities: ["goal-loop.execute"], parameters: ["goalId", "targetId", "objective"], effect: "REVERSIBLE" },
  { id: "build.verify", version: "1", execution: "EXTERNAL_ADAPTER", capabilities: ["build.execute"], parameters: ["profile"], effect: "REVERSIBLE" },
  { id: "test.verify", version: "1", execution: "EXTERNAL_ADAPTER", capabilities: ["test.execute"], parameters: ["suite"], effect: "REVERSIBLE" },
  { id: "release.prepare", version: "1", execution: "INTERNAL", capabilities: ["release.readiness"], parameters: ["channel"], effect: "READ_ONLY" },
  { id: "release.publish", version: "1", execution: "EXTERNAL_ADAPTER", capabilities: ["release.publish"], parameters: ["channel"], effect: "IRREVERSIBLE" }
];

export class LifecycleActionRegistry {
  readonly actions: LifecycleActionDefinition[];
  readonly capabilities: string[];
  readonly digest: string;

  constructor(actions: LifecycleActionDefinition[] = ACTIONS) {
    this.actions = actions.map((action) => ({ ...action, capabilities: [...action.capabilities], parameters: [...action.parameters] }));
    this.capabilities = [...new Set(this.actions.flatMap((action) => action.capabilities))].sort();
    this.digest = `sha256:${createHash("sha256").update(stableJson({ actions: this.actions, capabilities: this.capabilities })).digest("hex")}`;
  }

  resolve(uses: string): LifecycleActionDefinition | undefined {
    const [id, version] = uses.split("@");
    return this.actions.find((action) => action.id === id && action.version === (version || "1"));
  }

  validateParameters(uses: string, parameters: Record<string, unknown> = {}): void {
    const action = this.resolve(uses);
    if (!action) throw new Error(`LIFECYCLE_ACTION_NOT_REGISTERED: ${uses}`);
    const unknown = Object.keys(parameters).filter((key) => !action.parameters.includes(key));
    if (unknown.length > 0) throw new Error(`LIFECYCLE_ACTION_PARAMETER_UNSUPPORTED: ${uses} does not accept ${unknown.join(", ")}`);
  }

  validateCapabilities(capabilities: string[]): void {
    const unknown = capabilities.filter((capability) => !this.capabilities.includes(capability));
    if (unknown.length > 0) throw new Error(`LIFECYCLE_CAPABILITY_NOT_REGISTERED: ${unknown.join(", ")}`);
  }
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sortValue(child)]));
}
