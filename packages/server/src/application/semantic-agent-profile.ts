import type {EvoPilotAgentRuntimeProfileV1} from "@evopilot/contracts";
import type {ExecutionRuntimeProfile} from "@evopilot/core";
import type {LifecycleExecutorBinding} from "../domains/lifecycle/types.js";
import {requireSemantic} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject} from "../domains/harness-template/utils.js";

/** Core capability qualification and adapter transport qualification are distinct
 * records. Never substitute one digest for the other or mint live conformance.
 */
export function assertSemanticAgentProfile(adapter: EvoPilotAgentRuntimeProfileV1, core: ExecutionRuntimeProfile,
  executor: LifecycleExecutorBinding, runtime?: {name: string; version: string}) {
  const {digest, ...body} = adapter;
  requireSemantic(adapter.schema === "evopilot-agent-runtime-profile/v1" && digest === digestObject(body), "DIGEST_MISMATCH");
  requireSemantic(adapter.id === core.id && adapter.version === core.version && adapter.provider === core.provider &&
    adapter.model === core.model && adapter.host === executor.host && adapter.adapterId === executor.agentRuntime.adapterId &&
    adapter.digest === executor.agentRuntime.profileDigest && adapter.qualification.status === "QUALIFIED" &&
    adapter.qualification.conformanceDigest === executor.agentRuntime.qualificationDigest &&
    /^sha256:[a-f0-9]{64}$/.test(adapter.qualification.conformanceDigest) &&
    adapter.qualification.evidenceRefs.length > 0 && adapter.qualification.evidenceRefs.every(ref => typeof ref === "string" && ref.length > 0), "DRIFT");
  requireSemantic(adapter.constraints.permissionMode === core.permissionMode &&
    adapter.constraints.workspaceRoot === executor.sandbox.workspaceRef &&
    Number.isSafeInteger(adapter.constraints.timeoutMs) && adapter.constraints.timeoutMs > 0 && adapter.constraints.timeoutMs <= 7200000 &&
    Number.isSafeInteger(adapter.constraints.maxOutputBytes) && adapter.constraints.maxOutputBytes > 0 && adapter.constraints.maxOutputBytes <= 67108864 &&
    digestObject([...adapter.capabilities].sort()) === digestObject([...core.capabilities].sort()) &&
    typeof adapter.runtime.name === "string" && adapter.runtime.name.length > 0 &&
    typeof adapter.runtime.version === "string" && adapter.runtime.version.length > 0, "DRIFT");
  if (runtime) requireSemantic(digestObject(adapter.runtime) === digestObject(runtime), "DRIFT");
}
