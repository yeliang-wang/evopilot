import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { maintainWorkspace } from '../../dist/integration/workspace/maintenance.js';
import { createComposition, loadInstalledProducts } from '../../dist/integration/composition.js';
import { createLocalCollector } from '../../dist/integration/collection/local.js';
import { nativeSha256, nativeBytesDigest, nativePackageDigest, NATIVE_CONTRACT_DIGEST } from '../../dist/integration/compatibility/v1/native.mjs';
import { nativePackage, rehash } from '../../projects/evopilot-ontology/tests/fixtures/native/package.mjs';
import { syntheticHarnessPackage, replaceNativeFile } from '../../projects/evopilot-harness/examples/native/package.mjs';

import {fixture,freeze} from './fixtures/native-project.mjs';

for (const direction of ['forward', 'reverse']) for (const visibility of ['public', 'private'])
test(`U03: ${direction} ${visibility} journey publishes native packages, consumes collection bytes and verifies both owner receipts`, { timeout: 120_000 }, async () => {
  assert.ok(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN, 'Prepare the pinned native toolchain before native E2E');
  const toolchain = JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN, 'utf8'));
  const f = fixture(direction, visibility), scope = f.scope;
  for (const r of f.input.requirements.ownerRequirements) if (r.criterionId.startsWith('harness:')) r.origin = 'execution-result';
  const frozen = await freeze(f), samples = f.packages;
  await f.service.materialize({scope,id:f.input.id,packages:samples});
  const requirements = frozen.candidate.nativeRequirements, sourceScope = frozen.candidate.sourceScope;
  const options = {workspaceRoot:f.stateRoot,workspaceId:'synthetic'}, apis = await loadInstalledProducts();
  const binding = await f.service.prepareExecution({scope,id:f.input.id,executionId:'collection-one',toolchainId:'node'});
  const executable = binding.toolFiles[0].path, tool = binding.toolFiles[0];
  const collector = createLocalCollector({resolveExecution:f.service.resolveExecution});
  const trusted = {toolchain,...collector,inspectSource:f.service.inspectSource,resolveRequirements:f.service.resolveRequirements,verifyProject:f.service.verifyProject};
  let composition = createComposition(options, apis, {}, trusted), sequence = 0;
  const mutate = async (owner, operation, input) => {
    const expectedRevision = owner === 'runtime' ? (await composition.native(owner, { operation: 'workspace.inspect', scope, input: {} })).revision : composition.inspect(owner, scope).revision;
    return composition.native(owner, { operation, scope, input, requestId: 'request-' + (++sequence), expectedRevision });
  };
  try {
    const pins = {};
    for (const owner of ['ontology', 'harness']) {
      const pkg = samples[owner], identity = { id: pkg.manifest.id, version: pkg.manifest.version };
      await mutate(owner, 'native.package.put', { package: pkg });
      await mutate(owner, 'native.package.validate', identity);
      const review = (await mutate(owner, 'native.package.review', identity)).result;
      await mutate(owner, 'native.package.decide', { ...identity, reviewDigest: review.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic-fixture-domain-review' });
      pins[owner] = (await mutate(owner, 'native.package.publish', identity)).result.reference;
    }
    const standards = Object.fromEntries(['ontology', 'harness'].map(o => [o, { standardDigest: pins[o].standardDigest, standardLockDigest: pins[o].standardLockDigest }]));
    const project = (await mutate('runtime', 'project.prepare', { id: 'candidate-one', goalId: 'synthetic-goal', sourceScope, standardPins: standards, requirements })).result;
    const recipe = { schema: 'evopilot-collection-recipe/v1', sourceScope, executable, executableDigest: 'sha256:' + tool.sha256,
      argv: ['-e', 'console.log(JSON.stringify({tests:{exitCode:0},evidenceDigest:"actual-process-value",warnings:0}))'], cwd: binding.cwd, environment: { PATH: '/usr/bin:/bin' }, toolchainLockDigest: binding.toolchainLockDigest, timeoutMs: 5000, maxOutputBytes: 65536,
      allowedOutputs: ['stdout.txt', 'stderr.txt'], network: { mode: 'none', hosts: [] }, selectors: ['tests', 'evidenceDigest', 'warnings'].map(id => ({ id, output: 'stdout.txt', kind: 'json-pointer', pointer: '/' + id })) };
    const collection = (await mutate('runtime', 'collection.prepare', { id: 'collection-one', projectId: project.id, recipe })).result;
    await mutate('runtime', 'collection.decide', { id: collection.id, reviewDigest: collection.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic-reviewed-recipe' });
    const collected = (await mutate('runtime', 'collection.execute', { id: collection.id })).result;
    assert.equal(collected.stage, 'SUCCEEDED', JSON.stringify(collected));
    const raw = collected.receipt;
    const observation = { schema: 'evopilot-observation/v1', origin: 'execution-result', source: { revision: sourceScope.revision, digest: sourceScope.treeDigest }, values: raw.observations, collectionReceiptRef: { id: raw.id, digest: raw.digest, claimId: raw.claimId }, sourceScopeDigest: nativeSha256(sourceScope) };
    const input = { schema: 'runtime-composition/v1', contractDigest: NATIVE_CONTRACT_DIGEST, projectCandidateDigest: project.candidateDigest, standardPins: standards, sourceScope, requirements,
      effectiveConfig: { params: { maxWarnings: 0 } }, nativeInputs: { ontology: { packageDigest: nativePackageDigest(samples.ontology) }, harness: { observation } }, collectionReceipts: [{ id: raw.id, digest: raw.digest }] };
    const fabricated = structuredClone(input); fabricated.nativeInputs.harness.observation.values.warnings = 1;
    await assert.rejects(mutate('runtime', 'run.prepare', { id: 'fake-observation', projectId: project.id, goalId: project.goalId, ontology: pins.ontology, harness: pins.harness, input: fabricated }), /observation|Observation|OBSERVATION|COLLECTION|receipt/i);
    const run = (await mutate('runtime', 'run.prepare', { id: 'run-one', projectId: project.id, goalId: project.goalId, ontology: pins.ontology, harness: pins.harness, input })).result;
    await mutate('runtime', 'run.decide', { id: run.plan.id, reviewDigest: run.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic-reviewed-run' });
    const completedRun = (await mutate('runtime', 'run.dispatch', { id: run.plan.id })).result;
    assert.equal(completedRun.stage, 'SUCCEEDED', JSON.stringify(completedRun));
    assert.equal(completedRun.receipt.ownerReceipts.ontology.qualityStatus, 'PASS'); assert.equal(completedRun.receipt.ownerReceipts.harness.qualityStatus, 'PASS');
    await assert.rejects(mutate('runtime','project.validate',{id:project.id,runId:run.plan.id}), /incomplete|UNKNOWN|PROJECT|criteria|require/i);
    const bindings = f.service.checkLayout({scope,id:f.input.id}).bindings;
    await f.service.reviewDomain({scope,id:f.input.id,runtimeCandidateDigest:project.candidateDigest,assetDigests:{ontology:pins.ontology.digest,harness:pins.harness.digest},bindingsDigest:bindings.digest,inferredMappings:bindings.inferred,decision:'ACCEPT',humanEvidenceRef:'synthetic-exact-domain-decision'});
    const review = (await mutate('runtime', 'project.validate', { id: project.id, runId: run.plan.id })).result;
    assert.equal(review.eligible, true);
    await mutate('runtime', 'project.complete', { id: project.id, runId: run.plan.id, reviewDigest: review.reviewDigest, humanEvidenceRef: 'synthetic-final-domain-review' });
    composition.close(); composition = createComposition(options, apis, {}, trusted);
    const reread = await composition.native('runtime', { operation: 'project.inspect', scope, input: { id: project.id } });
    assert.equal(reread.complete.runId, run.plan.id);
    assert.equal(reread.sourceScope.direction, direction);
    assert.equal(reread.scope.visibility, visibility);
    if (direction === 'forward') {
      assert(reread.requirements.filter(r => !r.criterionId.startsWith('harness:')).every(r => r.origin === 'design-declaration'));
      // No implementation/production attestation can be added to this exact
      // design-snapshot completion by an unrecognised caller flag.
      await assert.rejects(mutate('runtime', 'project.complete', {
        id: project.id, runId: run.plan.id, reviewDigest: review.reviewDigest,
        humanEvidenceRef: 'synthetic-design-review', productionReady: true,
      }), /Unexpected|INVALID|Unknown|keys|field/i);
    }
    f.setCompletion(reread);
    const promoted=await f.service.promote({scope,id:f.input.id,runtimeProjectId:project.id});
    assert.equal(promoted.completed,true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(promoted.current,'project-manifest.json'))).candidateDigest,frozen.candidate.reviewDigest);
    // Actual native rows, raw collection blobs and owner reports survive same-machine relocation.
    const retained = await composition.native('runtime', {operation:'run.inspect',scope,input:{id:run.plan.id}});
    composition.close();
    const context = {projectRoot:f.projectRoot,stateRoot:f.stateRoot,workspaceId:'synthetic',installationRoot:path.join(f.root,'installation')};
    fs.mkdirSync(context.installationRoot,{mode:0o700});
    const backupRoot=path.join(f.root,'backup');
    const backup=maintainWorkspace(context,'backup',{destinationRoot:backupRoot},'native-backup');
    assert.equal(backup.status,'VERIFIED');
    const destinationProjectRoot=path.join(f.root,'moved-project'),destinationStateRoot=path.join(f.root,'moved-state');
    const moved=maintainWorkspace(context,'migrate',{destinationProjectRoot,destinationStateRoot},'native-move');
    assert.equal(moved.status,'VERIFIED');
    try {
      composition=createComposition({workspaceRoot:destinationStateRoot,workspaceId:'synthetic'},apis,{},trusted);
      assert.deepEqual(await composition.native('runtime',{operation:'project.inspect',scope,input:{id:project.id}}),reread);
      assert.deepEqual(await composition.native('runtime',{operation:'run.inspect',scope,input:{id:run.plan.id}}),retained);
      for (const owner of ['ontology','harness']) {
        const record=await composition.native(owner,{operation:'native.package.inspect',scope,input:{id:pins[owner].id,version:pins[owner].version}});
        assert.equal(record.reference.digest,pins[owner].digest);
      }
      composition.close();
      // Restore the exact original location; old completed evidence is never rewritten.
      fs.rmSync(f.projectRoot,{recursive:true});fs.rmSync(f.stateRoot,{recursive:true});
      assert.equal(maintainWorkspace(context,'restore',{backupRoot},'native-restore').status,'VERIFIED');
      composition=createComposition(options,apis,{},trusted);
      assert.deepEqual(await composition.native('runtime',{operation:'project.inspect',scope,input:{id:project.id}}),reread);
    } finally {
      for (const id of moved.requiredKeyIds) fs.rmSync(path.join(os.homedir(),'.local/share/evopilot/relocation-keys',id+'.key'),{force:true});
    }
    if (direction === 'reverse') {
      assert.equal(f.git('rev-parse','HEAD'),f.input.revision); assert.equal(f.git('status','--porcelain'), '');
    } else {
      assert.equal(fs.existsSync(path.join(f.source, '.git')), false);
      assert.equal(fs.readFileSync(path.join(f.source, 'ontology.txt'), 'utf8'), samples.ontology.files['sources/source.txt']);
      assert.equal(fs.readFileSync(path.join(f.source, 'harness.txt'), 'utf8'), samples.harness.files['sources/requirements.txt']);
    }
  } finally { composition.close(); f.cleanup(); }
});
