import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const eq = (a, b) => assert.deepEqual([...a].sort(), [...b].sort());
const hasId = (name, id) => name.split(/[^A-Za-z0-9_]+/).includes(id);

export function checkTraceability({ root = ROOT, events }) {
  assert(Array.isArray(events) && events.length, 'Actual test events required');
  const seen = new Set(), results = [];
  for (const e of events) {
    assert.equal(e.schema, 'evopilot-test-event/v1');
    if (!['test:pass', 'test:fail'].includes(e.type)) continue;
    assert(e.file && !path.isAbsolute(e.file) && !e.file.split('/').includes('..'), 'Owned test source required');
    assert.equal(e.sourceSHA256, sha(fs.readFileSync(path.join(root, e.file))), 'Stale test source');
    const key = e.file + '\0' + e.name;
    assert(!seen.has(key), 'Duplicate test event'); seen.add(key);
    assert(e.type === 'test:pass' && !e.skip && !e.todo, 'Failed/skipped/todo test evidence');
    results.push(e);
  }
  const summary = events.filter(e => e.type === 'test:summary' && !e.file).at(-1);
  assert(summary?.success === true, 'Successful terminal test summary required');
  assert.equal(summary.counts?.failed, 0); assert.equal(summary.counts?.skipped, 0);
  assert.equal(summary.counts?.todo, 0); assert.equal(summary.counts?.cancelled, 0);
  assert.equal(summary.counts?.tests, results.length, 'Incomplete event stream');
  const clauses = [];
  for (const owner of ['ontology', 'harness']) {
    const prefix = 'projects/evopilot-' + owner + '/', dir = path.join(root, prefix, 'specifications/v1');
    const matrix = read(path.join(dir, 'support-matrix.json'));
    const cases = read(path.join(dir, 'conformance-cases.json'));
    const records = owner === 'ontology' ? matrix.entries : matrix.records;
    assert(new Set(records.map(r => r.id ?? r.standardId)).size === records.length, 'Duplicate clause');
    if (owner === 'ontology') eq(records.map(r => r.id), cases.entries.map(c => c.clauseId));
    else eq(records.flatMap(r => r.testIds.map(id => r.standardId + ':' + id)), cases.cases.map(c => c.standardId + ':' + c.testId));
    for (const row of records) {
      const id = row.id ?? row.standardId;
      assert(row.testIds.length, 'Missing required test IDs');
      assert(/^https:\/\//.test(row.officialURL), 'Missing primary reference');
      const mapping = owner === 'ontology' ? cases.entries.find(c => c.clauseId === id) : null;
      if (mapping) eq(row.testIds, mapping.requiredTestIds);
      const tests = [];
      for (const testId of row.testIds) {
        const files = (mapping ? mapping.productTests : cases.cases.filter(c => c.standardId === id && c.testId === testId).map(c => c.suite)).map(f => prefix + f);
        assert(files.length, 'Missing test-file mapping');
        const matches = results.filter(e => files.includes(e.file) && hasId(e.name, testId));
        assert(matches.length, owner + ':' + id + ':' + testId + ' has no actual passing event');
        tests.push({ testId, events: matches.map(e => ({ file: e.file, name: e.name, sourceSHA256: e.sourceSHA256 })) });
      }
      clauses.push({ owner, id, status: row.status ?? row.supportStatus,
        matrixSHA256: sha(fs.readFileSync(path.join(dir, 'support-matrix.json'))),
        casesSHA256: sha(fs.readFileSync(path.join(dir, 'conformance-cases.json'))), tests });
    }
  }
  return { schema: 'evopilot-executed-traceability/v1', clauses, testCount: results.length,
    coverageMeaning: 'Declared clause IDs resolve to actual passing source-bound events. Review of test semantics, upstream fixture results, package bytes and the fixed acceptance ledger remains separate.',
    acceptance: 'NOT_EVALUATED', authority: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assert.equal(process.argv.length, 3, 'Usage: node scripts/check-native-traceability.mjs REPORT.jsonl');
    const bytes = fs.readFileSync(process.argv[2]);
    const result = checkTraceability({ events: bytes.toString().trim().split('\n').map(line => JSON.parse(line)) });
    console.log(JSON.stringify({ ...result, reportSHA256: sha(bytes) }));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
