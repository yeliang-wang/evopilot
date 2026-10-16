import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createNativeProjectService, inspectSourceInventory } from '../../dist/integration/workspace/native-project.js';
import { nativeBytesDigest, nativePackageDigest, nativeSha256 } from '../../dist/integration/compatibility/v1/native.mjs';
import { nativePackage, rehash } from '../../projects/evopilot-ontology/tests/fixtures/native/package.mjs';
import { syntheticHarnessPackage, replaceNativeFile } from '../../projects/evopilot-harness/examples/native/package.mjs';

import {fixture,freeze,write} from './fixtures/native-project.mjs';

for (const direction of ['forward', 'reverse']) for (const visibility of ['public', 'private']) {
  test(`${direction}/${visibility}: fixed scope, native assets, exact directory and explicit domain review`, async () => {
    const f = fixture(direction, visibility);
    try {
      const frozen = await freeze(f), material = await f.service.materialize({ scope: f.scope, id: f.input.id, packages: f.packages });
      assert.equal(f.service.checkLayout({ scope: f.scope, id: f.input.id }).conforms, true);
      assert.equal(frozen.candidate.inventory.files.length, 3);
      assert.equal(frozen.candidate.nativeRequirements.length, 10);
      const project = { scope: f.scope, sourceScope: frozen.candidate.sourceScope, requirements: frozen.candidate.nativeRequirements, candidateDigest: nativeSha256('synthetic-runtime-candidate') };
      const assetDigests = Object.fromEntries(Object.entries(f.packages).map(([owner, pkg]) => [owner, nativePackageDigest(pkg)]));
      const run = { claim: { context: { fixture: 'synthetic-context' } }, reviewDigest: nativeSha256('synthetic-run'), plan: { pins: Object.fromEntries(Object.entries(assetDigests).map(([owner, digest]) => [owner, { digest }])) } };
      let receipt = f.service.verifyProject({ project, run });
      assert.equal(receipt.criteria.filter(c => c.status === 'PASS').length, 5);
      assert.equal(receipt.criteria.find(c => c.criterionId.startsWith('domain:')).status, 'UNKNOWN');
      const bindings = f.service.checkLayout({ scope: f.scope, id: f.input.id }).bindings;
      await assert.rejects(f.service.reviewDomain({ scope: f.scope, id: f.input.id, runtimeCandidateDigest: project.candidateDigest, assetDigests, bindingsDigest: material.bindingsDigest, inferredMappings: [], decision: 'ACCEPT', humanEvidenceRef: 'synthetic-domain-decision' }), { code: 'REVIEW_REQUIRED' });
      await f.service.reviewDomain({ scope: f.scope, id: f.input.id, runtimeCandidateDigest: project.candidateDigest, assetDigests, bindingsDigest: material.bindingsDigest, inferredMappings: bindings.inferred, decision: 'ACCEPT', humanEvidenceRef: 'synthetic-domain-decision' });
      receipt = f.service.verifyProject({ project, run }); assert.ok(receipt.criteria.every(c => c.status === 'PASS'));
      const dir = f.service.candidateLocation({ scope: f.scope, id: f.input.id });
      fs.unlinkSync(path.join(dir, 'ontology', f.packages.ontology.manifest.id, 'model.ttl'));
      assert.throws(() => f.service.checkLayout({ scope: f.scope, id: f.input.id }));
      assert.equal(f.service.verifyProject({ project, run }).criteria.find(c => c.criterionId === 'project:directory').status, 'FAIL');
      write(path.join(dir, 'ontology', f.packages.ontology.manifest.id, 'model.ttl'), f.packages.ontology.files['model.ttl']);
      write(path.join(f.source, 'unreviewed.txt'), 'new source must invalidate the fixed inventory');
      assert.throws(() => f.service.checkLayout({ scope: f.scope, id: f.input.id }), /changed|DIRTY|REVIEW_REQUIRED/);
    } finally { f.cleanup(); }
  });
}

test('candidate preparation and a second version preserve all current and historical bytes', async () => {
  const f = fixture();
  try {
    await f.service.prepare(f.input);
    const current = path.join(f.projectRoot, 'private/projects', f.scope.projectId);
    write(path.join(current, 'README.md'), '# Existing user navigation\n'); write(path.join(current, 'project.json'), '{"historical":true}\n'); write(path.join(current, 'project-manifest.json'), '{"old":"current"}\n');
    const originals = Object.fromEntries(fs.readdirSync(current).map(name => [name, fs.readFileSync(path.join(current, name))]));
    await freeze(f); await f.service.materialize({ scope: f.scope, id: f.input.id, packages: f.packages });
    const firstRoot = f.service.candidateLocation({ scope: f.scope, id: f.input.id });
    const firstManifest = fs.readFileSync(path.join(firstRoot, 'project-manifest.json'));
    const second = { ...f.input, id: 'round-two', revision: 'requirements-two' };
    write(path.join(f.source, 'new-requirement.txt'), 'Substantive source change retained in the complete inventory.');
    const secondPackages = structuredClone(f.packages);
    for (const pkg of Object.values(secondPackages)) { pkg.manifest.version = '1.1.0'; const b = JSON.parse(pkg.files[pkg.manifest.sourceBindingRef]); for (const s of b.sources) s.revision = second.revision; for (const m of b.mappings) m.revision = second.revision; pkg.files[pkg.manifest.sourceBindingRef] = JSON.stringify(b); rehash(pkg); }
    await freeze(f, second); await f.service.materialize({ scope: f.scope, id: second.id, packages: secondPackages });
    for (const [name, bytes] of Object.entries(originals)) assert.deepEqual(fs.readFileSync(path.join(current, name)), bytes);
    assert.deepEqual(fs.readFileSync(path.join(firstRoot, 'project-manifest.json')), firstManifest);
    assert.equal(f.service.checkLayout({ scope: f.scope, id: second.id }).conforms, true);
  } finally { f.cleanup(); }
});

test('independent module requirements and exact source fragments cannot be replaced by generated coverage', async () => {
  const f = fixture();
  try {
    await assert.rejects(f.service.prepare({ ...f.input, requirements: { ...f.input.requirements, modules: [] } }), { code: 'PROJECT_MODULE_COVERAGE' });
    await freeze(f);
    const changed = structuredClone(f.packages), b = JSON.parse(changed.harness.files['source-bindings.json']);
    b.mappings[0].fragmentDigest = nativeBytesDigest('a different source fragment'); changed.harness.files['source-bindings.json'] = JSON.stringify(b); rehash(changed.harness);
    await assert.rejects(f.service.materialize({ scope: f.scope, id: f.input.id, packages: changed }), { code: 'PROJECT_FRAGMENT_DRIFT' });
    const missing = structuredClone(f.packages), coverage = JSON.parse(missing.harness.files['coverage.json']); coverage.requirements[0].caseIds = ['positive']; replaceNativeFile(missing.harness, 'coverage.json', coverage);
    await assert.rejects(f.service.materialize({ scope: f.scope, id: f.input.id, packages: missing }), { code: 'PROJECT_COVERAGE' });
    const inv = inspectSourceInventory(f.source, 'forward', f.input.revision); assert.deepEqual(inv.modules, [{ id: '.', entrypoints: ['package.json'] }]);
  } finally { f.cleanup(); }
});

test('current delivery transition requires protected Runtime completion and preserves the complete old project', async () => {
  const f = fixture();
  try {
    const frozen = await freeze(f); await f.service.materialize({ scope: f.scope, id: f.input.id, packages: f.packages });
    const current = path.join(f.projectRoot, 'private/projects', f.scope.projectId);
    write(path.join(current, 'README.md'), 'Historical navigation bytes\n');
    write(path.join(current, 'custom.txt'), 'User customization\n');
    const input = { scope: f.scope, id: f.input.id, runtimeProjectId: 'runtime-candidate' };
    await assert.rejects(f.service.promote(input), { code: 'PROJECT_COMPLETION_REQUIRED' });
    assert.equal(fs.readFileSync(path.join(current, 'README.md'), 'utf8'), 'Historical navigation bytes\n');
    const project = { id: input.runtimeProjectId, scope: f.scope, sourceScope: frozen.candidate.sourceScope, requirements: frozen.candidate.nativeRequirements, standardPins: frozen.candidate.standardPins, candidateDigest: nativeSha256('runtime-candidate') };
    const assetDigests = Object.fromEntries(Object.entries(f.packages).map(([owner, pkg]) => [owner, nativePackageDigest(pkg)]));
    const bindings = f.service.checkLayout({ scope: f.scope, id: f.input.id }).bindings;
    await f.service.reviewDomain({ scope: f.scope, id: f.input.id, runtimeCandidateDigest: project.candidateDigest, assetDigests, bindingsDigest: bindings.digest, inferredMappings: bindings.inferred, decision: 'ACCEPT', humanEvidenceRef: 'synthetic-decision-only' });
    const run = { claim: { context: { fixture: 'synthetic' } }, reviewDigest: nativeSha256('run'), plan: { pins: Object.fromEntries(Object.entries(assetDigests).map(([owner, digest]) => [owner, { digest }])) } };
    const projectCheck = f.service.verifyProject({ project, run });
    assert(projectCheck.criteria.every(c => c.status === 'PASS'));
    // Trusted SDK fixture, never a caller-supplied plugin completion input.
    f.setCompletion({ ...project, complete: { runId: 'run', runDigest: nativeSha256('complete'), projectCheck, decision: { decision: 'APPROVE' }, at: 'synthetic-time' } });
    const receipt = await f.service.promote(input);
    assert.equal(receipt.completed, true);
    assert.equal(fs.readFileSync(path.join(receipt.previous, 'README.md'), 'utf8'), 'Historical navigation bytes\n');
    assert.equal(fs.readFileSync(path.join(current, 'custom.txt'), 'utf8'), 'User customization\n');
    assert.equal(JSON.parse(fs.readFileSync(path.join(current, 'project-manifest.json'))).candidateDigest, frozen.candidate.reviewDigest);
    assert.deepEqual(await f.service.promote(input), receipt);
  } finally { f.cleanup(); }
});

test('same reviewed source supports immutable corrected drafts without reusing an earlier domain decision', async () => {
  const f=fixture();
  try {
    const first=await freeze(f);
    await f.service.materialize({scope:f.scope,id:f.input.id,packages:f.packages});
    const bytes=fs.readFileSync(path.join(f.service.candidateLocation({scope:f.scope,id:f.input.id}),'project-manifest.json'));
    const next={...f.input,id:'corrected-draft'};
    const second=await freeze(f,next),packages=structuredClone(f.packages);
    packages.ontology.files['model.ttl']+='\n# A corrected interpretation keeps the reviewed source scope.\n';rehash(packages.ontology);
    await f.service.materialize({scope:f.scope,id:next.id,packages});
    assert.deepEqual(f.service.inspectSource({scope:f.scope,sourceScope:first.candidate.sourceScope}),first.candidate.sourceScope);
    assert.deepEqual(f.service.resolveRequirements({scope:f.scope,sourceScope:second.candidate.sourceScope}),second.candidate.nativeRequirements);
    const project={scope:f.scope,sourceScope:second.candidate.sourceScope,requirements:second.candidate.nativeRequirements,candidateDigest:nativeSha256('runtime-corrected')};
    const run={claim:{context:{fixture:'synthetic'}},reviewDigest:nativeSha256('run'),plan:{pins:Object.fromEntries(Object.entries(packages).map(([owner,pkg])=>[owner,{digest:nativePackageDigest(pkg)}]))}};
    const checked=f.service.verifyProject({project,run});
    assert.equal(checked.details.candidateDigest,second.candidate.reviewDigest);
    assert(checked.criteria.filter(c=>c.criterionId.startsWith('project:')).every(c=>c.status==='PASS'));
    assert.equal(checked.criteria.find(c=>c.criterionId.startsWith('domain:')).status,'UNKNOWN');
    const binding=await f.service.prepareExecution({scope:f.scope,id:next.id,executionId:'corrected-execution',toolchainId:'node'});
    assert.deepEqual(f.service.resolveExecution({scope:f.scope,recipe:{sourceScope:second.candidate.sourceScope,cwd:binding.cwd,toolchainLockDigest:binding.toolchainLockDigest}}),binding);
    assert.deepEqual(fs.readFileSync(path.join(f.service.candidateLocation({scope:f.scope,id:f.input.id}),'project-manifest.json')),bytes);
    run.plan.pins.ontology.digest=nativeSha256('foreign');
    assert.throws(()=>f.service.verifyProject({project,run}),{code:'PROJECT_SCOPE_AMBIGUOUS'});
  } finally {f.cleanup();}
});
