import path from "node:path";
import {semanticCurrentOwnerFixture} from "./semantic-current-owner-fixture.mjs";
import {createSemanticStageCompletionService} from "../../packages/server/dist/application/semantic-stage-completion.js";
import {createSemanticEvidenceCollectionService} from "../../packages/server/dist/application/semantic-evidence-collection.js";
import {createSemanticExecutionTransport} from "../../packages/server/dist/application/semantic-execution-transport.js";
import {semanticExecutionImplementationDigest} from "../../packages/server/dist/application/semantic-execution-application.js";
import {digestObject as d} from "../../packages/server/dist/domains/harness-template/utils.js";
const kinds = ["domain-checks", "target-evidence-package", "phase-package", "goal-completion-report", "route-table", "policy-matrix", "plugin-report", "load-summary",
  "source-snapshot", "command-inventory", "validation-command-log", "validation-result"];

// Every datum and provenance declaration here is a SOURCE TEST FIXTURE. Native /
// independent labels exercise policy branches, not real process/Host qualification.
export async function stageCompletionFixture(t, options = {}) {
  const descriptor = {id: "source-fixture-collector", implementationDigest: d("synthetic-code"), qualificationDigest: d("synthetic-qualification"),
    origin: options.syntheticCollector ? "SYNTHETIC" : "INDEPENDENT", mode: "READ_ONLY", kinds};
  const f = await semanticCurrentOwnerFixture(t, {collectorDescriptor: descriptor, stageCompletionPolicy: !options.noPolicy,
    sharedProject: options.sharedProject, projectRecord: options.projectRecord, targetId: options.targetId, reuseGoal: options.reuseGoal,
    goalCompletionPolicy: options.goalCompletionPolicy, phaseCompletionPolicy: options.phaseCompletionPolicy, finalGoalCompletionPolicy: options.finalGoalCompletionPolicy, beforeSource: options.beforeSource, additionalStage: options.additionalStage, terminalControls: options.terminalControls,
    ...(options.application ? {publishedMaterials: true, runtimeDigest: semanticExecutionImplementationDigest} : {})});
  const materials = Object.values(f.data.materials), bundle = materials.find(x => x.kind === "HarnessBundle"), profile = materials.find(x => x.kind === "HarnessProfile"), components = materials.filter(x => x.kind === "HarnessComponent");
  const unique = x => [...new Set(x)].sort();
  const required = {validator: unique([...bundle.spec.validators, ...profile.spec.acceptance.blockingValidators, ...components.flatMap(c => c.spec.validators.map(v => v.id))]),
    constraint: unique([...bundle.spec.constraints, ...components.flatMap(c => c.spec.constraints)]),
    evidence: unique([...bundle.spec.evidence, ...profile.spec.acceptance.requiredEvidence, ...components.flatMap(c => c.spec.evidence)])};
  const plan = structuredClone(f.state.outcomePlan); plan.harness = [];
  for (const kind of ["validator", "constraint"]) required[kind].forEach((value, i) => plan.harness.push({id: `${kind}-${i}`, evidenceKind: "domain-checks",
    path: [kind, String(i)], predicate: {op: "EQUALS", value: true}, obligation: {kind, value}}));
  required.evidence.forEach((value, i) => plan.harness.push({id: `evidence-${i}`, evidenceKind: value, path: ["present"], predicate: {op: "EQUALS", value: true}, obligation: {kind: "evidence", value}}));
  const {planDigest, ...body} = plan; options.configureOutcomePlan?.(body); f.state.outcomePlan = {...body, planDigest: d(body)};
  const bound = options.application ? undefined : await f.bind(), input = bound && f.input(bound);
  if (bound) await f.review(bound);
  const observations = new Map(), adapter = {...f.owners.adapter,
    execute: async request => {
      const result = await f.owners.adapter.execute(request), observation = f.owners.adapter.readProcessObservation(request, result);
      if (!options.syntheticProcess) observation.material.origin = "NATIVE_PROCESS_RUNNER";
      if (options.processUsage) {
        observation.material.cost = structuredClone(options.processUsage);
        observation.material.usageCoverage = "COMPLETE";
        result.cost = structuredClone(options.processUsage);
      }
      observation.receiptDigest = d(observation.material); result.receiptDigest = observation.receiptDigest;
      observations.set(request.id, observation); return result;
    }, readProcessObservation: request => observations.get(request.id)};
  const owners = {...f.owners, adapter, now: f.time.get};
  if (!options.application && !options.noDispatch) await createSemanticExecutionTransport(f.configuration, owners).execute(input);
  const collector = {descriptor, collect: async request => {
    const observation = {schema: "evopilot-semantic-collector-observation/v1",
    collectionRequestDigest: request.collectionRequestDigest, observedAt: new Date(f.time.get()).toISOString(),
    observations: ["domain-checks", ...required.evidence].map(kind => ({kind, sourceDigests: [d("synthetic-source")], facts: kind === "domain-checks" ? {
      units: options.businessFail ? 0 : 5,
      validator: Object.fromEntries(required.validator.map((_, i) => [String(i), !options.harnessFail])),
      constraint: Object.fromEntries(required.constraint.map((_, i) => [String(i), true]))} : {present: true}}))};
    return options.transformObservation ? options.transformObservation(observation, request, f) : observation;
  }};
  if (!options.application && !options.noCollection && !options.noDispatch) await createSemanticEvidenceCollectionService(f.configuration, {...owners, collector}).collect(input);
  const completion = createSemanticStageCompletionService(f.configuration, owners);
  return {...f, bound, input, owners, collector, adapter, completion, commit: () => completion.commit(input), runFile: path.join(f.configuration.dataRoot, "lifecycle-runs", f.run.id + ".json")};
}
