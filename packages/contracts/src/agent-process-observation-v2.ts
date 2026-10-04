import {createHash} from "node:crypto";
import type {EvoPilotAgentExecutionRequestV1Alpha1, EvoPilotAgentExecutionResultV1Alpha1, EvoPilotAgentRuntimeProfileV1} from "./index.js";

/** Additive observation contract. Request/result v1alpha1 remain unchanged.
 * Only reported token usage is required. Pricing and monetary limits are not part of execution. */
export interface EvoPilotAgentProcessObservationV2 {
  schema: "evopilot-agent-process-observation/v2";
  receiptDigest: string;
  material: {
    adapterId: string; profileDigest: string; requestDigest: string;
    runtime: {name: string; version: string}; route: string;
    origin: "NATIVE_PROCESS_RUNNER" | "SYNTHETIC_PROCESS_RUNNER";
    invocationDigest: string;
    termination: "EXITED" | "TIMEOUT" | "OUTPUT_LIMIT" | "SPAWN_ERROR";
    exitCode: number | null; signal: string | null;
    stdoutDigest: string; stderrDigest: string; sessionIdsDigest: string;
    eventCount: number; errorEventCount: number; warningEventCount: number; completionEventCount: number; parseFailures: number;
    source: {beforeDigest: string; afterDigest: string | null; manifestDigest: string; changedCount: number; prohibitedCount: number};
    usage: {inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null;
      tokenCoverage: "COMPLETE" | "UNAVAILABLE"};
  };
}
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
const digest = (value: unknown) => "sha256:" + createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const hash = (v: unknown) => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const exact = (v: unknown, keys: string[]) => Boolean(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join() === keys.sort().join());

export function assertAgentProcessObservationV2(value: EvoPilotAgentProcessObservationV2, request: EvoPilotAgentExecutionRequestV1Alpha1,
  result: EvoPilotAgentExecutionResultV1Alpha1, profile: EvoPilotAgentRuntimeProfileV1): void {
  const m = value?.material;
  const invalid = () => {throw new Error("AGENT_PROCESS_OBSERVATION_INVALID");};
  if (!exact(value,["schema","receiptDigest","material"]) || value.schema !== "evopilot-agent-process-observation/v2" ||
    !exact(m,["adapterId","profileDigest","requestDigest","runtime","route","origin","invocationDigest","termination","exitCode","signal","stdoutDigest","stderrDigest","sessionIdsDigest","eventCount","errorEventCount","warningEventCount","completionEventCount","parseFailures","source","usage"]) ||
    !exact(m.runtime,["name","version"]) || !exact(m.source,["beforeDigest","afterDigest","manifestDigest","changedCount","prohibitedCount"]) ||
    !exact(m.usage,["inputTokens","outputTokens","cachedInputTokens","tokenCoverage"])) invalid();
  if (value.receiptDigest !== result.receiptDigest || digest(m) !== value.receiptDigest || m.requestDigest !== request.requestDigest ||
    m.profileDigest !== profile.digest || request.executor.agentRuntime.profileDigest !== profile.digest || m.adapterId !== profile.adapterId ||
    digest(m.runtime) !== digest(profile.runtime) || m.route !== `${profile.provider}/${profile.model}` || result.cost !== undefined)
    throw new Error("AGENT_PROCESS_OBSERVATION_BINDING_INVALID");
  if (!["NATIVE_PROCESS_RUNNER","SYNTHETIC_PROCESS_RUNNER"].includes(m.origin) || !["EXITED","TIMEOUT","OUTPUT_LIMIT","SPAWN_ERROR"].includes(m.termination) ||
    !(m.exitCode === null || count(m.exitCode) && m.exitCode <= 255) || !(m.signal === null || typeof m.signal === "string" && /^SIG[A-Z0-9]{1,16}$/.test(m.signal)) ||
    ![m.invocationDigest,m.stdoutDigest,m.stderrDigest,m.sessionIdsDigest,m.source.beforeDigest,m.source.manifestDigest].every(hash) ||
    !(m.source.afterDigest === null || hash(m.source.afterDigest)) ||
    ![m.eventCount,m.errorEventCount,m.warningEventCount,m.completionEventCount,m.parseFailures,m.source.changedCount,m.source.prohibitedCount].every(count) ||
    m.errorEventCount + m.warningEventCount > m.eventCount || m.completionEventCount > m.eventCount) invalid();
  const u = m.usage;
  if (u.tokenCoverage === "COMPLETE" ? !count(u.inputTokens) || !count(u.outputTokens) || !(u.cachedInputTokens === null || count(u.cachedInputTokens) && u.cachedInputTokens <= u.inputTokens) :
    u.tokenCoverage !== "UNAVAILABLE" || u.inputTokens !== null || u.outputTokens !== null || u.cachedInputTokens !== null) invalid();
  const status = m.termination !== "EXITED" || m.signal !== null || m.source.afterDigest === null ? "UNCERTAIN" :
    m.exitCode !== 0 || m.parseFailures || m.errorEventCount || m.completionEventCount !== 1 || m.source.prohibitedCount ? "FAILED" : "SUCCEEDED";
  if (result.status !== status) throw new Error("AGENT_PROCESS_OBSERVATION_STATUS_INVALID");
  if (result.effects.join() !== (m.source.changedCount ? "REVERSIBLE" : "")) throw new Error("AGENT_PROCESS_OBSERVATION_EFFECTS_INVALID");
}
