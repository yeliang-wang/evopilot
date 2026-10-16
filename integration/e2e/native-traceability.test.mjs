import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { checkTraceability } from '../../scripts/check-native-traceability.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'evopilot-traceability-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (name, value) => { const p = path.join(root, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof value === 'string' ? value : JSON.stringify(value)); };
  const events = [];
  for (const owner of ['ontology', 'harness']) {
    const prefix = 'projects/evopilot-' + owner + '/', id = owner === 'ontology' ? 'O_FIXTURE' : 'H_FIXTURE';
    const source = '// Synthetic verifier fixture; not product acceptance.\n';
    put(prefix + 'tests/e2e/sample.test.mjs', source);
    const record = { officialURL: 'https://example.invalid/fixture', testIds: [id] };
    put(prefix + 'specifications/v1/support-matrix.json', owner === 'ontology'
      ? { entries: [{ ...record, id: 'clause', status: 'SUPPORTED' }] }
      : { records: [{ ...record, standardId: 'clause', supportStatus: 'SUPPORTED' }] });
    put(prefix + 'specifications/v1/conformance-cases.json', owner === 'ontology'
      ? { entries: [{ clauseId: 'clause', requiredTestIds: [id], productTests: ['tests/e2e/sample.test.mjs'] }] }
      : { cases: [{ standardId: 'clause', testId: id, suite: 'tests/e2e/sample.test.mjs' }] });
    events.push({ schema: 'evopilot-test-event/v1', type: 'test:pass', name: id + ': synthetic fixture',
      file: prefix + 'tests/e2e/sample.test.mjs', sourceSHA256: createHash('sha256').update(source).digest('hex'), skip: false, todo: false });
  }
  events.push({ schema: 'evopilot-test-event/v1', type: 'test:summary', file: null, success: true,
    counts: { tests: 2, failed: 0, skipped: 0, todo: 0, cancelled: 0 } });
  return { root, events, put, check: value => checkTraceability({ root, events: value ?? events }) };
}

test('S03/R03 traceability needs actual event identities, complete terminal results and unchanged test bytes', t => {
  const f = fixture(t), result = f.check();
  assert.equal(result.clauses.length, 2); assert.equal(result.acceptance, 'NOT_EVALUATED'); assert.equal(result.authority, false);
  for (const change of [
    e => e.shift(), e => e.pop(), e => e.push(e[0]), e => { e[0].name = 'unrelated passing test'; },
    e => { e[0].type = 'test:fail'; }, e => { e[0].skip = true; }, e => { e[0].todo = true; },
    e => { e[0].sourceSHA256 = '0'.repeat(64); }, e => { e[0].file = '../foreign'; },
    e => { e.at(-1).counts.tests = 1; }, e => { e.at(-1).success = false; },
  ]) { const events = structuredClone(f.events); change(events); assert.throws(() => f.check(events)); }
  f.put(f.events[0].file, '// changed source\n'); assert.throws(() => f.check(), /Stale/);
});

test('S03/R03 removing a declared case or replacing its suite cannot be satisfied by an unrelated green test', t => {
  const f = fixture(t);
  f.put('projects/evopilot-harness/specifications/v1/conformance-cases.json', { cases: [] });
  assert.throws(() => f.check());
  f.put('projects/evopilot-harness/specifications/v1/conformance-cases.json', {
    cases: [{ standardId: 'clause', testId: 'H_FIXTURE', suite: 'tests/e2e/unexecuted.test.mjs' }],
  });
  assert.throws(() => f.check(), /no actual passing event/);
});

test('test-event reporter preserves a real child failure and never reports an all-green terminal result', t => {
  const f = fixture(t), filename = path.join(f.root, 'failure.test.mjs');
  fs.writeFileSync(filename, "import test from 'node:test'; test('intentional failure', () => { throw Error('fixture'); });\n");
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ['--test', '--test-reporter', new URL('../../scripts/native-test-report.mjs', import.meta.url).pathname, filename], { cwd: f.root, env, encoding: 'utf8', timeout: 10000 });
  assert.ifError(run.error); assert.equal(run.status, 1);
  const events = run.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert(events.some(e => e.type === 'test:fail' && e.name === 'intentional failure'));
  assert(events.some(e => e.type === 'test:summary' && e.success === false));
});
