import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, rm, symlink, link, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateLocalAcceptance, verifyLocalAcceptance } from '../../scripts/verify-local-acceptance.mjs';

// report-verifier unit fixtures only. No real Host events, product acceptance,
// human decisions or source-package provenance are asserted by these bytes.
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pin = 'df4f7246ae35ef9114e2b93663d520e7ff4f44f14f886ac8ba43e9fc080ddc9a';
const owners = ['runtime', 'harness', 'ontology'];
const header = () => ({ schema: 'evopilot-local-acceptance-result/v1', targetId: 'evopilot-v01-local-20261012',
  version: '0.1.0', scope: 'M0-M4_LOCAL', approvedPlanDigest: 'sha256:5bae53afa8a1245d9b5f3c63630b9654ea04938481e3f798964c762a5a7cc926',
  roadmapDigest: 'sha256:06c0e62d0f2fffce6013720509a603e753ca4f402ce24fc0937c8b45bd8129c2',
  authority: 'NONE', remoteActionsAuthorized: false, releaseAuthorized: false, dailyCutoverAuthorized: false,
  criteria: Array.from({ length: 19 }, (_, i) => ({ id: `E${String(i + 1).padStart(2, '0')}`, category: 'LOCAL', critical: true, status: 'PENDING', evidence: [] })) });

const malformed = [
  ['missing criterion', r => r.criteria.pop(), /E01-E19/],
  ['duplicate criterion', r => { r.criteria[18].id = 'E01'; }, /E01-E19/],
  ['weak critical', r => { r.criteria[0].critical = false; }, /critical/],
  ['wrong category', r => { r.criteria[0].category = 'REMOTE'; }, /LOCAL/],
  ['wrong plan digest', r => { r.approvedPlanDigest = 'sha256:' + '0'.repeat(64); }, /plan digest/],
  ['wrong roadmap digest', r => { r.roadmapDigest = 'sha256:' + '0'.repeat(64); }, /Roadmap digest/],
  ['authority true', r => { r.authority = true; }, /authority/],
  ['empty PASS evidence', r => { r.criteria[0].status = 'PASS'; }, /requires evidence/],
  ['unknown status', r => { r.criteria[0].status = 'APPROVED'; }, /invalid status/],
  ...['remoteActionsAuthorized', 'releaseAuthorized', 'dailyCutoverAuthorized'].map(field => [field, r => { r[field] = true; }, new RegExp(field)]),
];
for (const [name, mutate, message] of malformed) test(`report-verifier unit preflight: ${name}`, async () => {
  const report = header(); mutate(report);
  await assert.rejects(validateLocalAcceptance(report, { reportPath: '/synthetic-unit/report.json' }), message);
});

test('report-verifier unit preflight: real baseline bytes cannot serve as a candidate report', async () => {
  const baselinePath = fileURLToPath(new URL('../../governance/acceptance.json', import.meta.url));
  await assert.rejects(verifyLocalAcceptance(baselinePath), /Report schema/);
});

async function fixture(t) {
  const dir = await mkdtemp(path.join(await realpath(process.env.EVOPILOT_TEST_TMPDIR || tmpdir()), 'report-verifier-unit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  async function put(name, value) {
    const bytes = typeof value === 'string' ? value : JSON.stringify(value);
    const filename = path.join(dir, name);
    await writeFile(filename, bytes);
    return { path: filename, sha256: sha(bytes) };
  }
  const lock = { schema: 'evopilot-local-component-lock/v1', parentSourceCommit: 'a'.repeat(40), sharedContractSHA256: pin,
    components: owners.map(owner => ({ path: `projects/evopilot-${owner}`, name: `@evopilot-next/${owner}`, version: '0.1.0', commit: 'b'.repeat(40) })), authority: false, acceptance: 'NOT_INFERRED' };
  const bundle = { schema: 'evopilot-preview-bundle/v1', version: '0.1.0', node: '24.14.0', contractSHA256: pin,
    packages: owners.map(product => ({ product, name: `@evopilot-next/${product}`, version: '0.1.0', packageSHA256: 'c'.repeat(64), dependencyLockSHA256: product === 'runtime' ? null : 'd'.repeat(64) })),
    files: [{ path: 'package.json', sha256: 'e'.repeat(64) }] };
  const identity = { product: 'evopilot-v01-preview', version: '0.1.0', protocol: 'evopilot-connection/v1', installationId: 'synthetic-unit',
    installationRoot: path.join(dir, 'app'), workspaceRoot: path.join(dir, 'workspace'), workspaceId: 'synthetic-unit', installationDigest: 'f'.repeat(64),
    components: Object.fromEntries(owners.map(owner => [owner, '0.1.0'])) };
  const report = header();
  report.candidate = { componentLock: await put('components.json', lock), bundleManifest: await put('bundle.json', bundle),
    sourceArchive: await put('source.tar', 'SYNTHETIC report-verifier unit bytes; not a source package'), installationIdentity: await put('identity.json', identity) };
  const evidence = { ...await put('receipt.json', { scope: 'report-verifier-unit', synthetic: true }), kind: 'desktop',
    claim: 'Synthetic integrity fixture only; NOT Host acceptance', threadId: '00000000-0000-4000-8000-000000000001',
    installationDigest: identity.installationDigest, toolNamespace: 'evopilot_v01_preview' };
  for (const c of report.criteria) { c.status = 'PASS'; c.evidence = [{ ...evidence }]; }
  const reportPath = path.join(dir, 'report.json');
  const save = () => writeFile(reportPath, JSON.stringify(report));
  return { dir, report, reportPath, save, put, lock, bundle, identity };
}

test('report-verifier unit filesystem: structural PASS is integrity only; CLI and immutable input', async t => {
  const f = await fixture(t), before = structuredClone(f.report);
  await f.save();
  const result = await verifyLocalAcceptance(f.reportPath);
  assert.equal(result.localAcceptance, 'PASSED'); assert.equal(result.authority, 'NONE');
  assert.equal(result.releaseAuthorized, false); assert.equal(result.remoteActionsAuthorized, false);
  assert.equal(result.validation, 'STRUCTURAL_BINDING_INTEGRITY_COMPLETENESS_ONLY');
  assert.deepEqual(f.report, before);
  const cli = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/verify-local-acceptance.mjs', import.meta.url)), ...args], { encoding: 'utf8', env: { ...process.env, OPENSSL_CONF: '/dev/null' } });
  assert.equal(cli('--report', f.reportPath).status, 0);
  f.report.criteria[0].status = 'PENDING'; await f.save();
  const pending = cli('--report', f.reportPath);
  assert.equal(pending.status, 1); assert.equal(JSON.parse(pending.stdout).localAcceptance, 'NOT_PASSED');
  assert.equal(cli('--report', 'relative.json').status, 1);
  assert.equal(cli('--release').status, 1);
  f.report.authority = true; await f.save(); assert.equal(cli('--report', f.reportPath).status, 1);
});
for (const status of ['PENDING', 'FAIL', 'UNKNOWN', 'SKIPPED']) test(`report-verifier unit filesystem: ${status} blocks whole PASS`, async t => {
  const f = await fixture(t); f.report.criteria[9].status = status; f.report.criteria[9].evidence = [];
  const result = await validateLocalAcceptance(f.report, f);
  assert.equal(result.status, 'NOT_PASSED'); assert.equal(result.localAcceptance, 'NOT_PASSED');
  assert(!JSON.stringify(result).includes('100'));
});
const invalidFixtures = [
  ['wrong file digest', f => { f.report.candidate.sourceArchive.sha256 = '0'.repeat(64); }, /hash mismatch/],
  ['wrong package', async f => { f.lock.components[0].name = '@other/runtime'; f.report.candidate.componentLock = await f.put('components.json', f.lock); }, /Component package/],
  ['wrong version', async f => { f.bundle.packages[0].version = '0.2.0'; f.report.candidate.bundleManifest = await f.put('bundle.json', f.bundle); }, /Bundle version/],
  ['wrong contract pin', async f => { f.lock.sharedContractSHA256 = '0'.repeat(64); f.report.candidate.componentLock = await f.put('components.json', f.lock); }, /Contract pin/],
  ['wrong identity', async f => { f.identity.product = 'evopilot-v01-m0'; f.report.candidate.installationIdentity = await f.put('identity.json', f.identity); }, /evopilot-v01-preview/],
  ['live auth record', async f => { f.identity.nonce = 'not-a-real-secret'; f.report.candidate.installationIdentity = await f.put('identity.json', f.identity); }, /Unexpected fields/],
  ['missing Host kind', f => { f.report.criteria[6].evidence[0].kind = 'technical'; }, /desktop evidence required/],
  ['missing Host thread', f => { delete f.report.criteria[8].evidence[0].threadId; }, /thread UUID/],
  ['missing Host binding', f => { delete f.report.criteria[9].evidence[0].installationDigest; }, /installation binding/],
  ['wrong Host binding', f => { f.report.criteria[13].evidence[0].installationDigest = '0'.repeat(64); }, /Installation binding/],
  ['M0 namespace', f => { f.report.criteria[14].evidence[0].toolNamespace = 'evopilot_v01_m0'; }, /preview namespace/],
  ['self report', f => { f.report.candidate.sourceArchive.path = f.reportPath; }, /Self-report/],
  ['duplicate path mismatch', f => { f.report.criteria[1].evidence[0].sha256 = '0'.repeat(64); }, /Duplicate path hash mismatch/],
  ['relative path', f => { f.report.candidate.sourceArchive.path = 'relative.tar'; }, /reference path/],
  ['uppercase hash', f => { f.report.candidate.sourceArchive.sha256 = 'A'.repeat(64); }, /reference path\/hash/],
  ['symlink', async f => { const name = path.join(f.dir, 'linked.tar'); await symlink(f.report.candidate.sourceArchive.path, name); f.report.candidate.sourceArchive.path = name; }, /Linked path/],
  ['hardlink', async f => { await link(f.report.candidate.sourceArchive.path, path.join(f.dir, 'hard.tar')); }, /Unsafe file/],
  ['archive size', async f => { await truncate(f.report.candidate.sourceArchive.path, 128 * 1024 * 1024 + 1); }, /size limit/],
  ['JSON size', async f => { await truncate(f.report.candidate.componentLock.path, 4 * 1024 * 1024 + 1); }, /size limit/],
];
for (const [name, mutate, message] of invalidFixtures) test(`report-verifier unit filesystem: rejects ${name}`, async t => {
  const f = await fixture(t); await mutate(f);
  await assert.rejects(validateLocalAcceptance(f.report, f), message);
});
