import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {stageCompletionFixture} from "./semantic-stage-fixture.mjs";
import {createSemanticExecutionApplication} from "../../packages/server/dist/application/semantic-execution-application.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

// Entirely synthetic local sources, including declared native/independent
// labels. No real collector/Host qualification, installation or Release claim.
export async function semanticTerminalFixture(t, options = {}) {
  const f = await stageCompletionFixture(t, {application: true, ...options});
  const owners = {governed: f.governed, lifecycle: f.lifecycleService, adapter: f.adapter, collector: f.collector, now: f.time.get};
  const restart = () => createSemanticExecutionApplication(f.configuration, owners), app = restart();
  const access = {currentAccess: f.ownerInputs.currentAccess}, stages = [];
  let run = f.run;
  while (run.pendingExecution) {
    const pending = run.pendingExecution, contextPlan = structuredClone(f.state.contextPlan);
    contextPlan.actions[0].stageId = pending.stageId;
    const {planDigest, ...body} = structuredClone(f.state.outcomePlan); body.stageId = pending.stageId;
    const declaration = {identity: f.identity, runId: run.id, requestDigest: pending.requestDigest, goalTarget: f.state.goalTarget,
      contextPlan, outcomePlan: {...body, planDigest: d(body)}, selections: f.selected};
    const plan = await app.prepare(declaration, access), binding = await app.bind(f.identity, access), input = {identity: f.identity, bindingDigest: binding.bindingDigest};
    const review = await app.review({...input, coverage: f.source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: body.business.map(r => r.id)}))}, access);
    await app.approveReview({...input, decision: "APPROVE", reviewDigest: review.reviewDigest}, access);
    await app.dispatch(input, access); await app.collect(input, access); await app.commitStage(input, access);
    stages.push({plan, binding, pending, review});
    run = f.lifecycleService.advanceUntilBoundary(run.id);
  }
  assert.equal(run.status, "SUCCEEDED");
  const value = {identity: f.identity, runId: run.id};
  const file = (kind, key) => path.join(f.configuration.dataRoot, "project-semantic-bindings", kind, d(key).slice(7) + ".json");
  return {...f, app, restart, access, value, stages, terminal: run, file,
    read: () => app.terminalEvidence(value, access),
    scope5: {...f.scope, goalId: f.identity.goalId, targetId: f.identity.targetId},
    mutateRun: mutate => {const value = JSON.parse(fs.readFileSync(f.runFile)); mutate(value); fs.writeFileSync(f.runFile, JSON.stringify(value));}};
}
