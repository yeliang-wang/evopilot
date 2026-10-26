import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { connectionBodyLimit, connectionResponseLimit, mcpOutputLimit } from '../../dist/integration/connection/config.js';
const MiB = 1048576;
const guide = fs.readFileSync(new URL('../../docs/native-workflow.md', import.meta.url), 'utf8');
const payload = (owner, operation) => ({ owner, envelope: { operation } });
const cases = [
  ...['preflight', 'freeze', 'materialize'].map(operation => ({ row: '`native_project.' + operation + '`', action: 'native_project', payload: { operation }, limits: [8, 16, 32] })),
  ...['ontology', 'harness'].flatMap(owner => [
    { row: 'Ontology/Harness `native.package.put`', action: 'native', payload: payload(owner, 'native.package.put'), limits: [8, 16, 32] },
    ...['native.package.inspect', 'native.package.readback', 'native.package.publish', 'native.receipt.inspect'].map(operation => ({ row: 'Ontology/Harness `native.package.inspect`, `native.package.readback`, `native.package.publish`, `native.receipt.inspect`', action: 'native', payload: payload(owner, operation), limits: [1, 16, 32] })),
  ]),
  ...['runtime', 'harness', 'ontology'].map(owner => ({ row: '`native` with explicit `readiness.*`', action: 'native', payload: payload(owner, 'readiness.standard.inspect'), limits: [8, 32, 64] })),
  ...['runtime', 'harness', 'ontology'].map(owner => ({ row: '`native` with `readable.*`', action: 'native', payload: payload(owner, 'readable.snapshot'), limits: [1, 64, 128] })),
  ...['prepare', 'inspect'].map(operation => ({ row: 'Other routes, including `native_project.prepare` and `native_project.inspect`', action: 'native_project', payload: { operation }, limits: [1, 8, 8] })),
];
function verify(text) {
  for (const c of cases) {
    assert(text.includes('| ' + c.row + ' | ' + c.limits.join(' | ') + ' |'), 'Missing or incorrect transport documentation: ' + c.row);
    assert.deepEqual([connectionBodyLimit(c.action, c.payload), connectionResponseLimit(c.action, c.payload), mcpOutputLimit(c.action, c.payload)].map(n => n / MiB), c.limits);
  }
}
test('all documented native, readiness and readable transport bounds match actual compiled behavior', () => verify(guide));
test('regression guard detects the released preflight/freeze documentation omission', () => {
  for (const operation of ['preflight', 'freeze']) {
    const row = '| `native_project.' + operation + '` | 8 | 16 | 32 |';
    assert.throws(() => verify(guide.replace(row, '')), /Missing or incorrect transport documentation/);
  }
});
test('regression guard rejects incorrect ordinary and readiness input limits', () => {
  assert.throws(() => verify(guide.replace('| `native` with explicit `readiness.*` | 8 |', '| `native` with explicit `readiness.*` | 1 |')), /Missing or incorrect/);
  assert.throws(() => verify(guide.replace('`native_project.inspect` | 1 | 8 | 8 |', '`native_project.inspect` | 8 | 8 | 8 |')), /Missing or incorrect/);
});

test('local service guide includes all package-bearing routes and links the complete table', () => {
  const local = fs.readFileSync(new URL('../../docs/local-service.md', import.meta.url), 'utf8');
  for (const text of ['`preflight`', '`freeze`', '`materialize`', '8/32/64 MiB', '1/64/128 MiB', 'native-workflow.md#native-package-transport-bounds']) assert(local.includes(text), text);
});
