import {semanticPhaseFixture} from "./semantic-phase-fixture.mjs";
import {semanticPhaseDefinition,semanticTargetDefinition} from "../../packages/server/dist/application/semantic-runtime-sources.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";

// One persisted Goal and shared Catalog/project, four actual Runtime executions.
// Every adapter/collector/native label is synthetic, not real Host qualification.
export const phaseNames = ["alpha","beta","rc","ga"];
export function fourPhaseDefinition(g) {
  const target=g.plan.targets[0],phase=g.plan.phaseTargets[0];
  g.terminalMaturity="ga";g.plan.terminalMaturity="ga";g.plan.decompositionStrategy="ga-maturity-ladder";
  g.plan.targets=phaseNames.map((name,index)=>({...structuredClone(target),id:"target-"+name,phase:name,
    title:"Synthetic "+name,dependencyIds:index?["target-"+phaseNames[index-1]]:[],
    status:index?"PENDING":"READY",nextAction:index?"advance-target":"start-target"}));
  g.plan.phaseTargets=phaseNames.map((name,index)=>({...structuredClone(phase),id:"phase-"+name,phase:name,
    goalTargetIds:["target-"+name],...(index?{dependencyPhase:phaseNames[index-1]}:{})}));
  g.plan.targetCount=4;g.plan.requiredTargetCount=4;
}
// Match the default ladder's three sequential Targets per phase. Only the
// initial Target is READY; no test may author later readiness or completion.
export function twelveTargetDefinition(g) {
  fourPhaseDefinition(g);
  const targets=g.plan.targets;
  g.plan.targets=targets.flatMap((target,phaseIndex)=>[1,2,3].map(number=>({...structuredClone(target),
    id:`target-${target.phase}-${number}`,title:`Synthetic ${target.phase} ${number}`,
    dependencyIds:number>1?[`target-${target.phase}-${number-1}`]:phaseIndex?[`target-${phaseNames[phaseIndex-1]}-3`]:[],
    status:phaseIndex===0&&number===1?"READY":"PENDING",nextAction:phaseIndex===0&&number===1?"start-target":"advance-target"})));
  g.plan.phaseTargets=g.plan.phaseTargets.map(p=>({...p,goalTargetIds:[1,2,3].map(n=>`target-${p.phase}-${n}`)}));
  g.plan.targetCount=12;g.plan.requiredTargetCount=12;
}
export function finalPolicy({source,now,goal,scope}) {
  const {phaseTargetId,...goalScope}=scope;
  return {schema:"evopilot-semantic-final-goal-completion-policy/v1",action:"COMMIT_VALIDATED_GOAL",scope:goalScope,
    goalDigest:source.pins.goalDigest,planDigest:source.pins.planDigest,
    requiredTargets:goal.plan.targets.filter(t=>t.required).map(t=>({targetId:t.id,targetDigest:d(semanticTargetDefinition(t))})).sort((a,b)=>a.targetId.localeCompare(b.targetId)),
    requiredPhases:goal.plan.phaseTargets.map(p=>({phaseTargetId:p.id,phaseDefinitionDigest:d(semanticPhaseDefinition(p))})).sort((a,b)=>a.phaseTargetId.localeCompare(b.phaseTargetId)),
    status:"ACTIVE",validFrom:new Date(now-60000).toISOString(),validUntil:new Date(now+60000).toISOString()};
}
export async function nextPhase(t, previous, name, options={}) {
  return semanticPhaseFixture(t,{targetId:"target-"+name,beforeSource:fourPhaseDefinition,finalGoalCompletionPolicy:finalPolicy,
    ...(previous?{sharedProject:previous.projectFixture,projectRecord:previous.projectRecord,reuseGoal:true}:{}),...options});
}
