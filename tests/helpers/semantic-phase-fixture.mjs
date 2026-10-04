import fs from "node:fs";
import path from "node:path";
import {semanticTerminalFixture} from "./semantic-terminal-fixture.mjs";
import {semanticPhaseDefinition, semanticTargetDefinition} from "../../packages/server/dist/application/semantic-runtime-sources.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

// Synthetic source fixture; no real collector, process or Host qualification.
export async function semanticPhaseFixture(t, options = {}) {
  let phaseDefinition, scope, criteria, goalDefinition, phaseRecord;
  function captureGoal(g, targetId) {
    const target = g.plan.targets.find(t => t.id === targetId), p = g.plan.phaseTargets.find(p => p.goalTargetIds.includes(targetId));
    goalDefinition = structuredClone(g); phaseRecord = structuredClone(p);
    phaseDefinition = d(semanticPhaseDefinition(p)); scope = {tenantId:g.tenantId,workspaceId:g.workspaceId,projectId:g.projectId,goalId:g.id,phaseTargetId:p.id};
    criteria = p.acceptanceCriteria.map((text,index)=>({criterionDigest:d({phaseDefinitionDigest:phaseDefinition,index,text}),targetId:target.id,
      targetCriterionDigest:d({targetDigest:d(semanticTargetDefinition(target)),index:0,text:target.acceptanceCriteria[0]})}));
  }
  const f = await semanticTerminalFixture(t, {goalCompletionPolicy: {phaseTargetCompletion: "VERIFIED_TARGET_EVIDENCE_PACKAGE"},
    sharedProject:options.sharedProject,projectRecord:options.projectRecord,targetId:options.targetId,reuseGoal:options.reuseGoal,processUsage:options.processUsage,
    collectorKinds: options.collectorKinds,
    beforeSource: g => {
      const target = g.plan.targets[0]; target.phase = "alpha"; target.requiredEvidence = ["domain-checks"]; target.reviewCapabilities = ["testing"];
      const p = {schema: "evopilot-phase-target/v1", id: "phase-alpha", goalId: g.id, phase: "alpha", title: "Synthetic alpha",
        status: "PENDING", goalTargetIds: [target.id], acceptanceCriteria: ["Synthetic reviewed aggregate criterion"], requiredEvidence: ["domain-checks"],
        reviewCapabilities: ["testing"], packageOutputs: ["phase-package"], decision: {status: "PENDING", rationale: "Pending", evidence: []},
        createdAt: g.createdAt, updatedAt: g.updatedAt};
      g.plan.phaseTargets = [p]; options.beforeSource?.(g);
      captureGoal(g,target.id);
    },
    finalGoalCompletionPolicy: options.finalGoalCompletionPolicy ? context => options.finalGoalCompletionPolicy({...context,goal:goalDefinition,phaseDefinition,scope}) : undefined,
    phaseCompletionPolicy: options.noPolicy ? undefined : ({now,f:seed}) => {
      captureGoal(JSON.parse(fs.readFileSync(path.join(seed.configuration.dataRoot,"goals",seed.identity.goalId+".json"))),seed.identity.targetId);
      return {schema: "evopilot-semantic-phase-completion-policy/v1", action: "COMMIT_VALIDATED_PHASE", scope,
      phaseDefinitionDigest: phaseDefinition, criteriaCoverage: criteria, status: "ACTIVE", validFrom: new Date(now - 60000).toISOString(),
      validUntil: new Date(now + 60000).toISOString(), ...options.policy};},
    configureOutcomePlan: plan => {
      for (const [kind, schema] of [["target-evidence-package", "evopilot-semantic-target-evidence-package/v1"], ["phase-package", "evopilot-semantic-phase-package/v1"]]) {
        const rule = plan.harness.find(r => r.obligation.kind === "evidence" && r.obligation.value === kind);
        rule.path = ["package", "schema"]; rule.predicate = {op: "EQUALS", value: schema};
      }
      for (const [i, kind] of (options.additionalEvidenceKinds ?? []).entries()) {
        plan.business.push({id: "phase-evidence-" + i, conceptId: "fixture:entity", evidenceKind: kind,
          path: ["present"], predicate: {op: "EQUALS", value: true}});
      }
    },
    transformObservation: (observation, request, seed) => {
      const g = JSON.parse(fs.readFileSync(path.join(seed.configuration.dataRoot, "goals", seed.identity.goalId + ".json")));
      const target = g.plan.targets.find(t=>t.id===seed.identity.targetId), observations = observation.observations;
      for (const kind of options.additionalEvidenceKinds ?? []) if (!observations.some(o => o.kind === kind)) {
        observations.push({kind, sourceDigests: [d({syntheticPhase: phaseRecord.id, kind})], facts: {present: true}});
      }
      const evidence = kind => ({kind, sourceDigests: observations.find(o => o.kind === kind).sourceDigests});
      observations.find(o => o.kind === "target-evidence-package").facts = {package: {schema: "evopilot-semantic-target-evidence-package/v1", scope: request.scope,
        phase: target.phase, targetDefinitionDigest: d(semanticTargetDefinition(target)), phaseDefinitionDigest: phaseDefinition,
        criteria: seed.source.acceptanceCriteria.map(c => ({criterionDigest: c.criterionDigest, ruleIds: seed.state.outcomePlan.business.map(r => r.id).sort()})).sort((a,b) => a.criterionDigest.localeCompare(b.criterionDigest)),
        evidence: [evidence("domain-checks")], reviews: [{capability: "testing", status: "PASSED", evidenceKinds: ["domain-checks"]}]}};
      const pack = {schema: "evopilot-semantic-phase-package/v1", scope, phaseDefinitionDigest: phaseDefinition, criteria: structuredClone(criteria),
        evidence: phaseRecord.requiredEvidence.map(evidence),
        reviews: phaseRecord.reviewCapabilities.map(capability => ({capability, status: "PASSED", evidenceKinds: [...phaseRecord.requiredEvidence]})),
        outputs: phaseRecord.packageOutputs.map(evidence)};
      options.package?.(pack); observations.find(o => o.kind === "phase-package").facts = {package: pack}; return observation;
    }});
  const goalFile = path.join(f.configuration.dataRoot, "goals", f.identity.goalId + ".json");
  if (!options.pendingTarget) await f.app.completeTarget(f.value, f.access);
  return {...f, phaseInput: {...f.value, phaseTargetId: scope.phaseTargetId}, goalFile, rawGoal: () => JSON.parse(fs.readFileSync(goalFile))};
}
