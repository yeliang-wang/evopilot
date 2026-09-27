import {FileStore} from "../../packages/server/dist/storage/file-store/index.js";
import {GoalRecordStore} from "../../packages/server/dist/storage/goal-record-store.js";
import {createSemanticRuntimeSourceReader} from "../../packages/server/dist/application/semantic-runtime-sources.js";

/** Synthetic owner records only. Does not resolve credentials or attest facts. */
export function seedSemanticRuntimeRecords(f, acceptanceCriteria = ["Synthetic units must be within the declared range"], beforeSource, reuseGoal = false) {
  const store = new FileStore(f.configuration.dataRoot, {requireLlm: false, allowLegacyGlobalLlm: false});
  const now = "2026-09-22T00:00:00Z";
  if (!reuseGoal) store.writeProject({...f.access.project, name: "Synthetic", createdAt: now, validation: {status: "PASSED", checkedAt: now, message: "synthetic-only"}});
  const profile = reuseGoal ? f.state.llmProfile : store.writeLlmProfile(f.state.llmProfile);
  const target = {schema: "evopilot-goal-target/v1", id: f.identity.targetId, goalId: f.identity.goalId, projectId: f.identity.projectId,
    releaseTargetId: "ga", title: "Synthetic target", description: "Synthetic only", layer: "runtime", required: true,
    dependencyIds: [], acceptanceCriteria, status: "READY", nextAction: "start-target", evidence: [], createdAt: now, updatedAt: now};
  if (!reuseGoal) store.writeGoal({schema: "evopilot-global-goal/v1", id: f.identity.goalId, ...f.scope, objective: f.state.goalTarget.objective,
    releaseTargetId: "ga", status: "APPROVED", llm: {schema: "evopilot-loop-llm-selection/v1", source: "loop-override", configured: true, required: true,
      profileId: profile.id, provider: profile.providerName, model: profile.modelName, baseUrl: profile.baseUrl, apiKeyRef: profile.apiKeyRef, resolvedAt: now},
    plan: {schema: "evopilot-goal-plan/v1", status: "APPROVED", decompositionStrategy: "manual", summary: "Synthetic plan", targets: [target],
      phaseTargets: [], targetCount: 1, requiredTargetCount: 1, editablePlan: {status: "APPROVED", allowed: [], denied: [], nextAction: "start-target"},
      approvedBy: "synthetic", approvedAt: now, confirmation: {schema: "evopilot-goal-plan-approval-confirmation/v1", confirmedBy: "synthetic",
        confirmation: "synthetic approval fixture", actor: "synthetic", confirmedAt: now}}, timeline: [], createdAt: now, updatedAt: now});
  if (beforeSource && !reuseGoal) {
    const records = new GoalRecordStore(store.goalsDir), previous = records.read(f.identity.goalId), goal = structuredClone(previous);
    beforeSource(goal); records.write(goal, previous);
  }
  const source = createSemanticRuntimeSourceReader(f.configuration.dataRoot).read(f.identity, f.access.principal);
  f.state.runtimeSourcePins = source.pins;
  return {store, source};
}
