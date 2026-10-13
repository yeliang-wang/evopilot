import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir, homedir } from 'node:os';
import { maintainWorkspace, inspectWorkspaceBackup } from '../../dist/integration/workspace/maintenance.js';
import { createRuntimeService } from '@evopilot-next/runtime/service';
import { createHarnessService } from '@evopilot-next/harness/service';
import { createOntologyService } from '@evopilot-next/ontology/service';
import { inspectWorkspaceSnapshot as runtimeSnapshot } from '@evopilot-next/runtime/workspace-migration';
import { inspectWorkspaceSnapshot as harnessSnapshot } from '@evopilot-next/harness/workspace-migration';
import { inspectWorkspaceSnapshot as ontologySnapshot } from '@evopilot-next/ontology/workspace-migration';
import { sha256, stableSerialize } from '../../integration/compatibility/v1/reference.mjs';
const scope = { visibility: 'public', projectId: 'synthetic' };
const read = (service, operation, input = {}) => service.execute({ operation, scope, input });
let serial = 0;
const write = (service, operation, input) => service.execute({ operation, scope, input, requestId: 'maintenance-' + (++serial), expectedRevision: read(service, 'workspace.inspect').revision });
function json(filename, value) { fs.writeFileSync(filename, JSON.stringify(value), { mode: 0o600 }); }
async function setup(t, uncertain = false) {
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()), 'evopilot-maintenance-'));
  const context = { projectRoot: path.join(parent, 'project'), stateRoot: path.join(parent, 'state'), workspaceId: 'maintenance-test', installationRoot: path.join(parent, 'installation') };
  fs.mkdirSync(context.projectRoot, { mode: 0o700 }); fs.mkdirSync(context.installationRoot, { mode: 0o700 });
  json(path.join(context.projectRoot, 'workspace-project.json'), { schema: 'evopilot-workspace-project/v1', id: context.workspaceId, templateVersion: '0.2.0', specifications: { ontology: 'v1', harness: 'v1' } });
  fs.writeFileSync(path.join(context.projectRoot, 'README.md'), 'Synthetic personal workspace\n', { mode: 0o600 });
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const options = { workspaceRoot: context.stateRoot, workspaceId: context.workspaceId }, pins = {};
  for (const [product, factory] of [['harness', createHarnessService], ['ontology', createOntologyService]]) {
    const service = factory(options); service.initialize();
    const samples = JSON.parse(fs.readFileSync(new URL(product === 'harness' ? '../../projects/evopilot-harness/examples/synthetic-harnesses.json' : '../../projects/evopilot-ontology/examples/synthetic-models.json', import.meta.url)));
    const model = product === 'harness' ? samples[0].asset : samples.assets[0], input = { id: model.id, version: model.version };
    write(service, 'asset.put', product === 'harness' ? { asset: model } : { model });
    const review = write(service, 'asset.review', input).result;
    write(service, 'asset.decide', { ...input, reviewDigest: review.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic:maintenance-approval' });
    pins[product] = write(service, 'asset.publish', input).result.reference; service.close();
  }
  const digest = 'sha256:' + 'b'.repeat(64);
  const resolve = ({ reference, workspace }) => ({ reference, workspace, scope, published: true, materialDigest: digest, descriptor: { kind: reference.product + '-composition/v1', digest } });
  const service = createRuntimeService(options, { resolveHarness: resolve, resolveOntology: resolve, execute: claim => { if (uncertain) throw Error('Synthetic lost execution response'); return ({ claimId: claim.claimId, inputDigest: claim.inputDigest, pins: claim.pins, providerReceiptId: 'synthetic:finished', status: 'SUCCEEDED', result: { evaluation: 'PASS', evidenceDigest: digest } }); } });
  service.initialize(); write(service, 'project.create', { name: 'Synthetic' }); write(service, 'goal.create', { id: 'goal', description: 'Verified maintenance' });
  const prepared = write(service, 'run.prepare', { id: 'run', goalId: 'goal', ...pins, input: { schema: 'runtime-composition/v1', ontologyInstance: { entities: [], relations: [] }, harness: { mode: 'composed', evidence: {}, configuration: {} } } }).result;
  write(service, 'run.decide', { id: 'run', reviewDigest: prepared.reviewDigest, decision: 'APPROVE', humanEvidenceRef: 'synthetic:maintenance-approval' });
  await service.dispatch({ scope, id: 'run', requestId: 'dispatch', expectedRevision: read(service, 'workspace.inspect').revision });
  const run = read(service, 'run.inspect', { id: 'run' }), receipt = read(service, 'receipt.inspect', { requestId: 'dispatch' }); service.close();
  return { parent, context, options, run, receipt, pins };
}
function ownerSnapshots(context) { const options = { workspaceRoot: context.stateRoot, workspaceId: context.workspaceId }; return { runtime: runtimeSnapshot(options), harness: harnessSnapshot(options), ontology: ontologySnapshot(options) }; }
function assertReadback(context, fixture) {
  const service = createRuntimeService({ workspaceRoot: context.stateRoot, workspaceId: context.workspaceId }); service.initialize();
  try { assert.deepEqual(read(service, 'run.inspect', { id: 'run' }), fixture.run); assert.deepEqual(read(service, 'receipt.inspect', { requestId: 'dispatch' }), fixture.receipt); } finally { service.close(); }
}
test('actual owners backup, readback and same-original-location restore preserve rows and published assets', async t => {
  const fixture = await setup(t), { context, parent } = fixture, before = ownerSnapshots(context), backupRoot = path.join(parent, 'backup');
  const backup = maintainWorkspace(context, 'backup', { destinationRoot: backupRoot }, 'backup');
  assert.equal(backup.status, 'VERIFIED'); assert.equal(backup.authority, false); assert.deepEqual(backup.ownerSnapshots, before);
  assert.deepEqual(maintainWorkspace(context, 'backup', { destinationRoot: backupRoot }, 'backup'), backup);
  assert.equal(inspectWorkspaceBackup(context, backupRoot).manifestDigest, backup.manifestDigest);
  assert.throws(() => maintainWorkspace(context, 'restore', { backupRoot }, 'no-overwrite'), { code: 'MAINTENANCE_DESTINATION_NOT_EMPTY' });
  fs.rmSync(context.projectRoot, { recursive: true }); fs.rmSync(context.stateRoot, { recursive: true });
  const restored = maintainWorkspace(context, 'restore', { backupRoot }, 'restore');
  assert.equal(restored.status, 'VERIFIED'); assert.deepEqual(ownerSnapshots(context), before); assertReadback(context, fixture);
  assert.equal(fs.readFileSync(path.join(context.projectRoot, 'README.md'), 'utf8'), 'Synthetic personal workspace\n');
});
test('migrate retains source and post-cutover writes; stale migration or backup cannot replace new records', async t => {
  const fixture = await setup(t), { context, parent } = fixture, before = ownerSnapshots(context);
  const originalBackup = path.join(parent, 'pre-cutover-backup');
  maintainWorkspace(context, 'backup', { destinationRoot: originalBackup }, 'pre-cutover-backup');
  const input = { destinationProjectRoot: path.join(parent, 'next-project'), destinationStateRoot: path.join(parent, 'next-state') };
  const result = maintainWorkspace(context, 'migrate', input, 'migrate');
  t.after(() => { for (const id of result.requiredKeyIds) fs.rmSync(path.join(homedir(), '.local/share/evopilot/relocation-keys', id + '.key'), { force: true }); });
  assert.equal(result.status, 'VERIFIED'); assert.equal(result.requiredKeyIds.length, 3); assert.deepEqual(ownerSnapshots(context), before);
  const next = { ...context, projectRoot: input.destinationProjectRoot, stateRoot: input.destinationStateRoot };
  for (const product of ['runtime','harness','ontology']) { assert.equal(result.ownerSnapshots[product].recordsDigest, before[product].recordsDigest); assert.equal(result.ownerSnapshots[product].blobsDigest, before[product].blobsDigest); }
  assertReadback(next, fixture); assertReadback(context, fixture);
  const afterCutover = createRuntimeService({ workspaceRoot: next.stateRoot, workspaceId: next.workspaceId }); afterCutover.initialize();
  const added = write(afterCutover, 'goal.create', { id: 'post-cutover-goal', description: 'New work after the verified cutover' });
  const newGoal = read(afterCutover, 'goal.inspect', { id: 'post-cutover-goal' }); afterCutover.close();
  const retained = () => {
    const service = createRuntimeService({ workspaceRoot: next.stateRoot, workspaceId: next.workspaceId }); service.initialize();
    try { assert.deepEqual(read(service, 'goal.inspect', { id: 'post-cutover-goal' }), newGoal); assert.deepEqual(read(service, 'receipt.inspect', { requestId: added.requestId }), added); }
    finally { service.close(); }
  };
  // Exact retry returns historical migration evidence, and must never recopy its old snapshot.
  assert.deepEqual(maintainWorkspace(context, 'migrate', input, 'migrate'), result); retained();
  assert.throws(() => maintainWorkspace(context, 'migrate', input, 'stale-new-migration'), { code: 'MAINTENANCE_DESTINATION_NOT_EMPTY' }); retained();
  assert.throws(() => maintainWorkspace(next, 'restore', { backupRoot: originalBackup }, 'old-location-restore'), { code: 'MAINTENANCE_DESTINATION_NOT_EMPTY' }); retained();
  assert.deepEqual(ownerSnapshots(context), before, 'Cutover and later writes do not alter original source');
  const backupRoot = path.join(parent, 'relocated-backup'); maintainWorkspace(next, 'backup', { destinationRoot: backupRoot }, 'backup');
  const key = path.join(homedir(), '.local/share/evopilot/relocation-keys', result.requiredKeyIds[0] + '.key'); fs.renameSync(key, key + '.held');
  try { assert.throws(() => inspectWorkspaceBackup(next, backupRoot)); } finally { fs.renameSync(key + '.held', key); }
  assert.throws(() => maintainWorkspace(next, 'restore', { backupRoot }, 'occupied-restore'), { code: 'MAINTENANCE_DESTINATION_NOT_EMPTY' }); retained();
  fs.rmSync(next.projectRoot, { recursive: true }); fs.rmSync(next.stateRoot, { recursive: true });
  maintainWorkspace(next, 'restore', { backupRoot }, 'restore'); assertReadback(next, fixture); retained();
});
test('corruption, self-rehashed foreign backup, linked paths and conflicting request never overwrite data', async t => {
  const { context, parent } = await setup(t), backupRoot = path.join(parent, 'backup');
  maintainWorkspace(context, 'backup', { destinationRoot: backupRoot }, 'backup');
  assert.throws(() => maintainWorkspace(context, 'backup', { destinationRoot: path.join(parent, 'other') }, 'backup'), { code: 'MAINTENANCE_REQUEST_CONFLICT' });
  const file = path.join(backupRoot, 'project/README.md'), original = fs.readFileSync(file); fs.writeFileSync(file, 'changed');
  assert.throws(() => inspectWorkspaceBackup(context, backupRoot), { code: 'MAINTENANCE_BACKUP_CHANGED' }); fs.writeFileSync(file, original);
  const manifestPath = path.join(backupRoot, 'manifest.json'), savedBytes = fs.readFileSync(manifestPath), manifest = JSON.parse(savedBytes);
  manifest.createdAt = '2099-01-01T00:00:00.000Z'; const { manifestDigest, ...subject } = manifest; manifest.manifestDigest = sha256(subject).slice(7); json(manifestPath, manifest);
  assert.throws(() => inspectWorkspaceBackup(context, backupRoot)); fs.writeFileSync(manifestPath, savedBytes);
  const linked = path.join(parent, 'linked'); fs.symlinkSync(context.projectRoot, linked);
  assert.throws(() => maintainWorkspace(context, 'migrate', { destinationProjectRoot: linked, destinationStateRoot: path.join(parent, 'next-state') }, 'linked'), { code: 'SYMLINK' });
  const before = fs.readFileSync(path.join(context.projectRoot, 'README.md')); assert.deepEqual(before, original);
});

test('interrupted restore leaves a recoverable journal and resumes without overwriting unrelated bytes', async t => {
  const fixture = await setup(t), { parent, context } = fixture, backupRoot = path.join(parent, 'backup');
  maintainWorkspace(context, 'backup', { destinationRoot: backupRoot }, 'backup');
  fs.rmSync(context.projectRoot, { recursive: true }); fs.rmSync(context.stateRoot, { recursive: true });
  const rename = fs.renameSync;
  fs.renameSync = function(from, to) { if (to === path.join(context.projectRoot, 'README.md')) throw Object.assign(Error('synthetic interrupted copy'), { code: 'SYNTHETIC_INTERRUPTION' }); return rename.call(this, from, to); };
  try { assert.throws(() => maintainWorkspace(context, 'restore', { backupRoot }, 'restore-interrupted'), { code: 'SYNTHETIC_INTERRUPTION' }); } finally { fs.renameSync = rename; }
  assert(fs.existsSync(path.join(context.projectRoot, 'workspace-project.json')), 'identity is copied before other files, so the maintenance loader can resume');
  const journal = JSON.parse(fs.readFileSync(context.stateRoot + '.evopilot-maintenance/requests/restore-interrupted.json'));
  assert.equal(journal.status, 'INTERRUPTED'); assert.equal(journal.result, null);
  const resumed = maintainWorkspace(context, 'restore', { backupRoot }, 'restore-interrupted');
  assert.equal(resumed.status, 'VERIFIED'); assertReadback(context, fixture);
});
test('V02-D03: interrupted migration resumes its exact journal and preserves all original owner evidence', async t => {
  const fixture = await setup(t), { parent, context } = fixture, before = ownerSnapshots(context);
  const input = { destinationProjectRoot: path.join(parent, 'next-project'), destinationStateRoot: path.join(parent, 'next-state') };
  const rename = fs.renameSync;
  fs.renameSync = function(from, to) { if (to === path.join(input.destinationProjectRoot, 'README.md')) throw Object.assign(Error('Synthetic interrupted migration copy'), { code: 'SYNTHETIC_INTERRUPTION' }); return rename.call(this, from, to); };
  try { assert.throws(() => maintainWorkspace(context, 'migrate', input, 'interrupted-migration'), { code: 'SYNTHETIC_INTERRUPTION' }); }
  finally { fs.renameSync = rename; }
  const journal = JSON.parse(fs.readFileSync(context.stateRoot + '.evopilot-maintenance/requests/interrupted-migration.json'));
  assert.equal(journal.status, 'INTERRUPTED'); assert.equal(journal.result, null);
  assert.deepEqual(ownerSnapshots(context), before); assertReadback(context, fixture);
  const resumed = maintainWorkspace(context, 'migrate', input, 'interrupted-migration');
  t.after(() => { for (const id of resumed.requiredKeyIds) fs.rmSync(path.join(homedir(), '.local/share/evopilot/relocation-keys', id + '.key'), { force: true }); });
  assert.equal(resumed.status, 'VERIFIED'); assert.equal(resumed.requiredKeyIds.length, 3);
  assert.deepEqual(ownerSnapshots(context), before);
  assertReadback({ ...context, projectRoot: input.destinationProjectRoot, stateRoot: input.destinationStateRoot }, fixture);
});

test('source changes during copy cannot produce a verified backup or a trusted restore anchor', async t => {
  const { parent, context } = await setup(t), backupRoot = path.join(parent, 'backup');
  const rename = fs.renameSync; let changed = false;
  fs.renameSync = function(from, to) {
    if (!changed && to === path.join(backupRoot, 'project/README.md')) { changed = true; fs.writeFileSync(path.join(context.projectRoot, 'README.md'), 'changed concurrently\n'); }
    return rename.call(this, from, to);
  };
  try { assert.throws(() => maintainWorkspace(context, 'backup', { destinationRoot: backupRoot }, 'drifting-backup'), { code: 'MAINTENANCE_SOURCE_CHANGED' }); } finally { fs.renameSync = rename; }
  const journal = JSON.parse(fs.readFileSync(context.stateRoot + '.evopilot-maintenance/requests/drifting-backup.json'));
  assert.equal(journal.status, 'INTERRUPTED'); assert.equal(journal.result, null);
  assert.throws(() => inspectWorkspaceBackup(context, backupRoot));
  assert.equal(fs.readFileSync(path.join(context.projectRoot, 'README.md'), 'utf8'), 'changed concurrently\n');
});
test('migration rejects ancillary destination evidence changed after copy while native owner rows still verify', async t => {
  const { parent, context } = await setup(t);
  const relative = 'private/projects/synthetic/notes.txt';
  fs.mkdirSync(path.dirname(path.join(context.stateRoot, relative)), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(context.stateRoot, relative), 'Retained synthetic evidence', { mode: 0o600 });
  const input = { destinationProjectRoot: path.join(parent, 'next-project'), destinationStateRoot: path.join(parent, 'next-state') };
  let requiredKeyIds=[];
  t.after(() => { for (const id of requiredKeyIds) fs.rmSync(path.join(homedir(), '.local/share/evopilot/relocation-keys', id + '.key'), { force: true }); });
  const rename = fs.renameSync; let changed = false;
  fs.renameSync = function(from, to) {
    const result = rename.call(this, from, to);
    if (!changed && to === context.stateRoot + '.evopilot-maintenance/requests/destination-drift.json' && JSON.parse(fs.readFileSync(to)).status === 'VERIFYING') {
      changed = true; fs.writeFileSync(path.join(input.destinationStateRoot, relative), 'Changed after copy');
    }
    return result;
  };
  try { assert.throws(() => maintainWorkspace(context, 'migrate', input, 'destination-drift'), { code: 'MAINTENANCE_RELOCATION_DIFFERENT' }); }
  finally {
    fs.renameSync = rename;
    if (fs.existsSync(input.destinationStateRoot)) requiredKeyIds=Object.values(ownerSnapshots({ ...context, stateRoot: input.destinationStateRoot })).flatMap(snapshot=>snapshot.requiredKeyIds);
  }
  assert.equal(changed, true);
  const journal = JSON.parse(fs.readFileSync(context.stateRoot + '.evopilot-maintenance/requests/destination-drift.json'));
  assert.equal(journal.status, 'INTERRUPTED'); assert.equal(journal.result, null);
  assert.equal(fs.readFileSync(path.join(context.stateRoot, relative), 'utf8'), 'Retained synthetic evidence');
});

test('migration blocks unresolved claims before copy while backup retains UNKNOWN for reconciliation without redispatch', async t => {
  const fixture = await setup(t, true), { parent, context } = fixture;
  const before = ownerSnapshots(context);
  assert.equal(before.runtime.unresolved[0].status, 'UNKNOWN');
  const input = { destinationProjectRoot: path.join(parent, 'next-project'), destinationStateRoot: path.join(parent, 'next-state') };
  assert.throws(() => maintainWorkspace(context, 'migrate', input, 'unresolved-move'), { code: 'MIGRATION_RECONCILIATION_REQUIRED' });
  assert.equal(fs.existsSync(input.destinationProjectRoot), false);
  assert.equal(fs.existsSync(input.destinationStateRoot), false);
  assert.deepEqual(ownerSnapshots(context), before);
  const backupRoot = path.join(parent, 'uncertain-backup');
  const backup = maintainWorkspace(context, 'backup', { destinationRoot: backupRoot }, 'uncertain-backup');
  assert.equal(backup.status, 'VERIFIED');
  assert.deepEqual(backup.ownerSnapshots, before);
  assertReadback(context, fixture);
});

test('SIGKILL during partial copied payload resumes only journal-bound expected bytes and refuses foreign staging', {timeout:20000}, async t => {
  const fixture = await setup(t), { parent, context } = fixture, backupRoot = path.join(parent, 'backup');
  maintainWorkspace(context, 'backup', { destinationRoot: backupRoot }, 'backup');
  fs.rmSync(context.projectRoot, { recursive: true }); fs.rmSync(context.stateRoot, { recursive: true });
  const script = `import fs from 'node:fs';import {maintainWorkspace} from ${JSON.stringify(new URL('../../dist/integration/workspace/maintenance.js', import.meta.url).href)};
    const write=fs.writeFileSync;fs.writeFileSync=function(fd,bytes,...args){if(typeof fd==='number' && Buffer.isBuffer(bytes) && bytes.toString().includes('evopilot-workspace-project/v1')){write.call(this,fd,bytes.subarray(0,7));fs.fsyncSync(fd);process.kill(process.pid,'SIGKILL');}return write.call(this,fd,bytes,...args);};
    maintainWorkspace(${JSON.stringify(context)},'restore',${JSON.stringify({backupRoot})},'partial-restore');`;
  const child = spawn(process.execPath, ['--input-type=module','-e',script], {stdio:['ignore','pipe','pipe']});
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  let stderr='';child.stderr.on('data', bytes => stderr += bytes);
  const [code,signal] = await once(child,'exit'); assert.equal(signal,'SIGKILL',stderr); assert.equal(code,null);
  assert.equal(fs.existsSync(path.join(context.projectRoot,'workspace-project.json')),false);
  const stage=path.join(context.projectRoot,'.evopilot-copy-partial-restore');
  const staged=fs.readdirSync(stage);assert.equal(staged.length,1);
  const stagedPath=path.join(stage,staged[0]), partial=fs.readFileSync(stagedPath);assert.equal(partial.length,7);
  const journal=JSON.parse(fs.readFileSync(context.stateRoot+'.evopilot-maintenance/requests/partial-restore.json'));
  assert.equal(journal.status,'COPYING');assert.equal(journal.result,null);
  fs.writeFileSync(stagedPath,'foreign bytes');
  assert.throws(()=>maintainWorkspace(context,'restore',{backupRoot},'partial-restore'),{code:'MAINTENANCE_PARTIAL_CONFLICT'});
  assert.equal(fs.readFileSync(stagedPath,'utf8'),'foreign bytes');
  fs.writeFileSync(stagedPath,partial);
  assert.equal(maintainWorkspace(context,'restore',{backupRoot},'partial-restore').status,'VERIFIED');
  assert.equal(fs.existsSync(stage),false);assertReadback(context,fixture);
});
