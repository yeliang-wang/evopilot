import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readWorkspaceResponseEvidence } from '../../dist/integration/response/evidence.js';
import { nativeBytesDigest, nativeSha256 } from '../../dist/integration/compatibility/v1/native.mjs';

// These are structural reference tests, not domain approval or real project acceptance.
function ledger(t) {
  const projectRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'response-ledger-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const context = { projectRoot, workspaceId: 'synthetic-ledger' };
  const scope = { visibility: 'private', projectId: 'fictional' };
  const id = 'private/projects/fictional/targets/repair/request-1.json';
  const file = path.join(projectRoot, id);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(projectRoot, 'workspace-project.json'), JSON.stringify({ schema: 'evopilot-workspace-project/v1', id: context.workspaceId }), { mode: 0o600 });
  const campaign = { schema: 'evopilot-private-campaign/v1', projectId: scope.projectId, id: 'repair', goal: 'Explain the synthetic action', sourceDigest: nativeSha256('source').slice(7), criteria: [{ id: 'check', status: 'PENDING', evidence: [] }], loops: [{ id: 'l1', observation: 'retained fault', action: 'review', result: 'pending' }], status: 'IN_PROGRESS', authority: false };
  const bytes = JSON.stringify(campaign);
  fs.writeFileSync(file, bytes, { mode: 0o600 });
  const target = { owner: 'workspace', id, digest: nativeBytesDigest(Buffer.from(bytes)) };
  const loop = { owner: 'workspace', id: id + '#loop=l1', digest: nativeSha256({ campaignDigest: target.digest, loop: campaign.loops[0] }) };
  return { context, scope, file, campaign, target, loop };
}

test('response governance refs read exact target and loop without pretending they are fresh observations', t => {
  const f = ledger(t);
  for (const ref of [f.target, f.loop]) {
    const result = readWorkspaceResponseEvidence(f.context, f.scope, ref);
    assert.equal(result.observedAt, 1);
    assert.deepEqual(result.reference, ref);
    assert.equal(result.status, 'PASS');
  }
  assert.throws(() => readWorkspaceResponseEvidence(f.context, f.scope, { ...f.loop, id: f.target.id + '#loop=absent' }), { code: 'RESPONSE_LEDGER_LOOP' });
  fs.writeFileSync(f.file, JSON.stringify({ ...f.campaign, goal: 'Changed after plan review' }));
  assert.throws(() => readWorkspaceResponseEvidence(f.context, f.scope, f.target), { code: 'RESPONSE_LEDGER_DRIFT' });
  assert.throws(() => readWorkspaceResponseEvidence(f.context, f.scope, f.loop), { code: 'RESPONSE_LEDGER_DRIFT' });
});

test('response governance refs reject public/cross-project/workspace reads and linked or unsafe files', t => {
  const f = ledger(t);
  assert.throws(() => readWorkspaceResponseEvidence(f.context, { ...f.scope, visibility: 'public' }, f.target), { code: 'RESPONSE_LEDGER_SCOPE' });
  assert.throws(() => readWorkspaceResponseEvidence(f.context, { ...f.scope, projectId: 'other' }, f.target), { code: 'RESPONSE_LEDGER_SCOPE' });
  assert.throws(() => readWorkspaceResponseEvidence({ ...f.context, workspaceId: 'other' }, f.scope, f.target), { code: 'RESPONSE_LEDGER_WORKSPACE' });
  fs.chmodSync(f.file, 0o644);
  assert.throws(() => readWorkspaceResponseEvidence(f.context, f.scope, f.target), { code: 'UNSAFE_FILE' });
  fs.chmodSync(f.file, 0o600);
  fs.renameSync(f.file, f.file + '.retained'); fs.symlinkSync(f.file + '.retained', f.file);
  assert.throws(() => readWorkspaceResponseEvidence(f.context, f.scope, f.target), { code: 'SYMLINK' });
});

test('response governance refs never accept an authority-bearing ledger or duplicate loop identity', t => {
  const f = ledger(t);
  fs.writeFileSync(f.file, JSON.stringify({ ...f.campaign, authority: true }));
  assert.throws(() => readWorkspaceResponseEvidence(f.context, f.scope, f.target), { code: 'RESPONSE_LEDGER_SCOPE' });
  const changed = { ...f.campaign, loops: [f.campaign.loops[0], f.campaign.loops[0]] };
  fs.writeFileSync(f.file, JSON.stringify(changed));
  assert.throws(() => readWorkspaceResponseEvidence(f.context, f.scope, f.loop), { code: 'CAMPAIGN_LOOP' });
});

test('response governance reader shares writer schema for malformed goal, criteria and loop fields', t => {
  const f = ledger(t);
  for (const changed of [ { ...f.campaign, goal: null }, { ...f.campaign, criteria: null }, { ...f.campaign, loops: [{ ...f.campaign.loops[0], result: null }] } ]) {
    fs.writeFileSync(f.file, JSON.stringify(changed));
    assert.throws(() => readWorkspaceResponseEvidence(f.context, f.scope, f.target), error => ['CAMPAIGN_SCHEMA', 'CAMPAIGN_LOOP'].includes(error.code));
  }
});
