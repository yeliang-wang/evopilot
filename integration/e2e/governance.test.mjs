import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateGovernance, classifyIntent } from '../../scripts/roadmap.mjs';

const root = new URL('../../', import.meta.url);
const paths = ['roadmap.json', 'implementation-lock.json', 'decisions/local-implementation.json', 'acceptance.json', 'm0.json'];
const [roadmapRaw, ...values] = await Promise.all(paths.map(path => readFile(new URL(`governance/${path}`, root), 'utf8')));
const [lock, decision, acceptance, m0] = values.map(value => JSON.parse(value));
const baseline = { roadmapRaw, lock, decision, acceptance, m0 };
const expected = { status: 'PASSED', localAcceptance: 'NOT_PASSED', authority: 'LOCAL_IMPLEMENTATION_ONLY' };
const localIntent = 'local-v0.1/M1: foundation implementation';
function changeRoadmap(input, change) {
  const roadmap = JSON.parse(input.roadmapRaw);
  change(roadmap);
  input.roadmapRaw = JSON.stringify(roadmap);
}

test('real baseline validates without mutation or inferred acceptance', () => {
  const input = structuredClone(baseline);
  assert.deepEqual(validateGovernance(input), expected);
  assert.deepEqual(input, baseline);
  assert.deepEqual(validateGovernance({ ...input, roadmapRaw: Buffer.from(roadmapRaw) }), expected);
  assert.deepEqual(validateGovernance({ ...input, intent: localIntent }), { ...expected, status: 'ALIGNED' });
});

const mutations = [
  ['changed raw bytes', x => { x.roadmapRaw += '\n'; }, /raw roadmap digest/],
  ['changed lock digest', x => { x.lock.roadmapDigest = 'sha256:wrong'; }, /lock roadmap digest/],
  ['rebound lock digest', x => { x.roadmapRaw += '\n'; x.lock.roadmapDigest = `sha256:${createHash('sha256').update(x.roadmapRaw).digest('hex')}`; }, /lock roadmap digest/],
  ['decision plan mismatch', x => { x.decision.planDigest = 'sha256:wrong'; }, /plan digest/],
  ['lock plan mismatch', x => { x.lock.approvedPlanDigest = 'sha256:wrong'; }, /plan digest/],
  ['roadmap plan mismatch', x => changeRoadmap(x, r => { r.approvedPlanDigest = 'sha256:wrong'; }), /plan digest/],
  ['missing acceptance ID', x => { x.acceptance.criteria.pop(); }, /E01-E19/],
  ['duplicate acceptance ID', x => { x.acceptance.criteria[18].id = 'E01'; }, /E01-E19/],
  ['unknown acceptance ID', x => { x.acceptance.criteria[18].id = 'E20'; }, /E01-E19/],
  ['noncritical criterion', x => { x.acceptance.criteria[0].critical = false; }, /critical/],
  ['nonlocal criterion', x => { x.acceptance.criteria[0].category = 'REMOTE'; }, /LOCAL/],
  ['premature acceptance', x => { x.acceptance.criteria[0].status = 'PASS'; }, /PENDING/],
  ['decision authority escalation', x => { x.decision.authority = 'RELEASE'; }, /authority/],
  ['lock authority escalation', x => { x.lock.authority = 'RELEASE'; }, /authority/],
  ['old source writable', x => { x.decision.oldSourcePolicy = 'WRITE'; }, /source policy/],
  ['fabricated digest review', x => { x.decision.planDigestIndividuallyReviewedByUser = true; }, /technical binding/],
  ['wrong milestone', x => { x.lock.milestone = 'local-v0.2'; }, /milestone/],
  ['wrong version', x => { x.lock.version = '1.0.0'; }, /version/],
  ['M5 in local stages', x => changeRoadmap(x, r => { r.milestones[0].stages.push('M5'); }), /M0-M4/],
  ['duplicate roadmap ID', x => changeRoadmap(x, r => { r.milestones[0].acceptanceIds[18] = 'E01'; }), /E01-E19/],
  ['missing roadmap ID', x => changeRoadmap(x, r => { r.milestones[0].acceptanceIds.pop(); }), /E01-E19/],
  ['release remote flag', x => changeRoadmap(x, r => { r.releaseGate.remoteActionsAuthorized = true; }), /release gate/],
  ['release decision bypass', x => changeRoadmap(x, r => { r.releaseGate.requiresFreshUserDecision = false; }), /release gate/],
  ['M0 not passed', x => { x.m0.technicalStatus = 'PENDING'; }, /technical/],
  ['M0 operations claimed', x => { x.m0.productOperations = 1; }, /technical/],
  ['M0 acceptance passed', x => { x.m0.acceptance.E01 = 'PASS'; }, /PENDING/],
  ['M0 missing acceptance', x => { delete x.m0.acceptance.E19; }, /E01-E19/],
  ['lock remote flag', x => { x.lock.remoteActionsAuthorized = true; }, /authority/],
];
for (const field of ['remoteCreationAuthorized', 'publicationAuthorized', 'oldRepositoryDeletionAuthorized', 'dailyCutoverAuthorized']) {
  mutations.push([`decision ${field}`, x => { x.decision[field] = true; }, new RegExp(field)]);
}
for (const field of ['remoteActionsAuthorized', 'releaseAuthorized', 'fullProductE2EComplete']) {
  mutations.push([`M0 ${field}`, x => { x.m0[field] = true; }, new RegExp(field)]);
}
for (const key of ['lock', 'decision', 'acceptance', 'm0']) {
  mutations.push([`${key} schema`, x => { x[key].schema = 'unknown/v1'; }, /schema/]);
  mutations.push([`missing ${key}`, x => { delete x[key]; }, /schema/]);
}
mutations.push(['roadmap schema', x => changeRoadmap(x, r => { r.schema = 'unknown/v1'; }), /schema/]);
for (const [name, mutate, diagnostic] of mutations) {
  test(`rejects ${name}`, () => {
    const input = structuredClone(baseline);
    mutate(input);
    assert.throws(() => validateGovernance(input), diagnostic);
  });
}

function cli(args) {
  return spawnSync(process.execPath, [fileURLToPath(new URL('scripts/roadmap.mjs', root)), ...args], {
    encoding: 'utf8', env: { ...process.env, OPENSSL_CONF: '/dev/null' },
  });
}
test('CLI check and local gate return compact status', () => {
  for (const [args, status] of [[['--check'], 'PASSED'], [['--gate', '--intent', localIntent], 'ALIGNED']]) {
    const result = cli(args);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { ...expected, status });
    assert.equal(result.stdout.trim().split('\n').length, 1);
  }
});
test('documented local prefix grammar remains supported', () => {
  for (const separator of ['/', ':', ' ']) {
    for (let stage = 0; stage <= 4; stage++) {
      assert.equal(classifyIntent(`local-v0.1${separator}M${stage}: foundation implementation`), 'LOCAL_CANDIDATE');
    }
  }
  assert.equal(classifyIntent(undefined), 'UNKNOWN');
});
for (const intent of ['', 'unknown', 'foundation implementation', 'local-v0.1/M1:', 'local-v0.1/M6: foundation',
  'local-v0.1/M5: foundation', ...['remote', 'delete', 'old-source', 'WorkBuddy', 'release', 'GitHub', 'push', 'publication']
    .map(action => `local-v0.1/M1: ${action}`)]) {
  test(`rejects unauthorized or unknown intent ${JSON.stringify(intent)}`, () => {
    assert.notEqual(classifyIntent(intent), 'LOCAL_CANDIDATE');
    assert.throws(() => validateGovernance({ ...baseline, intent }), /UNKNOWN|BLOCKED/);
    const result = cli(['--gate', '--intent', intent]);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
  });
}
test('CLI defaults deny missing intent, unknown arguments and release', () => {
  for (const args of [[], ['--gate'], ['--gate', '--intent'], ['--unknown'], ['--check', '--approve'], ['--release', '0.1.0']]) {
    const result = cli(args);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /UNKNOWN|BLOCKED/);
    assert.equal(result.stdout, '');
  }
});
