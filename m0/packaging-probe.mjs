// Offline installed-files/copy feasibility PROBE, not npm distribution acceptance.
// Operator-run only: requires own temporary directory and fresh Node processes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = fileURLToPath(new URL('./shared-contract/', import.meta.url));
const files = ['package.json', 'index.mjs'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
assert.equal(manifest.name, '@evopilot-next/m0-reference-contract');
assert.equal(manifest.version, '0.1.0');
assert.deepEqual(manifest.dependencies, {});
assert.deepEqual(manifest.exports, { '.': './index.mjs' });
assert.deepEqual(manifest.files, ['index.mjs']);
assert.equal(manifest.type, 'module');
assert.deepEqual(manifest.engines, { node: '>=22' });
// Closed package: the sole module has no imports, re-exports, require, or eval.
// Conservative textual guard deliberately fails closed if its implementation changes.
const implementation = readFileSync(join(source, 'index.mjs'), 'utf8');
assert.doesNotMatch(implementation.replace(/\/\/[^\n]*/g, ''), /\b(?:import|from|require|eval|Function)\b/);
const recorded = Object.fromEntries(files.map(f => {
  assert.equal(lstatSync(join(source, f)).isFile(), true);
  assert.equal(lstatSync(join(source, f)).isSymbolicLink(), false);
  return [f, sha(readFileSync(join(source, f)))];
}));

const runner = String.raw`
import assert from 'node:assert/strict';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateReference, assertReferenceBinding } from '@evopilot-next/m0-reference-contract';
const identity = '@evopilot-next/m0-reference-contract';
const local = resolve('node_modules', identity);
assert.equal(fileURLToPath(import.meta.resolve(identity)), resolve(local, 'index.mjs'));
assert.equal(realpathSync(local), local);
assert.equal(process.permission.has('fs.read', process.argv[2]), false);
assert.throws(() => readFileSync(process.argv[2]), { code: 'ERR_ACCESS_DENIED' });
assert.throws(() => import.meta.resolve(identity + '/index.mjs'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
const recorded = JSON.parse(readFileSync('shared-sha256.json', 'utf8'));
for (const [file, digest] of Object.entries(recorded)) {
  const path = resolve(local, file);
  assert.equal(lstatSync(path).isSymbolicLink(), false);
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), digest);
}
for (const product of ['ontology', 'harness']) for (const visibility of ['public', 'private']) {
  const ref = { product, id: 'synthetic-' + product, version: '0.1.0', specVersion: 'v1', digest: 'sha256:' + 'a'.repeat(64), visibility };
  assert.equal(validateReference(ref).valid, true);
  assert.ok(Object.isFrozen(assertReferenceBinding(ref, { ...ref })));
  for (const [key, value] of Object.entries({ product: product === 'ontology' ? 'harness' : 'ontology', id: 'other-workspace-asset', version: '0.1.1', specVersion: 'v9', digest: 'sha256:' + 'b'.repeat(64), visibility: visibility === 'public' ? 'private' : 'public' })) {
    assert.throws(() => assertReferenceBinding(ref, { ...ref, [key]: value }), TypeError);
  }
  if (visibility === 'private') assert.throws(() => assertReferenceBinding(ref, ref, { allowPrivate: false }), TypeError);
  else assert.deepEqual(assertReferenceBinding(ref, ref, { allowPrivate: false }), ref);
  assert.equal(validateReference({ ...ref, version: 'latest' }).valid, false);
  assert.equal(validateReference({ ...ref, digest: 'tampered' }).valid, false);
}
console.log(JSON.stringify({ marker: 'PROBE', status: 'PASS', released: false }));
`;

const temporary = mkdtempSync(join(tmpdir(), 'evopilot-m0-copy-probe-'));
try {
  const relocated = [];
  for (const consumer of ['ontology-consumer', 'harness-consumer']) {
    const staging = join(temporary, consumer);
    const vendor = join(staging, 'node_modules', manifest.name);
    mkdirSync(vendor, { recursive: true });
    for (const file of files) copyFileSync(join(source, file), join(vendor, file));
    writeFileSync(join(staging, 'shared-sha256.json'), JSON.stringify(recorded, null, 2));
    writeFileSync(join(staging, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    writeFileSync(join(staging, 'probe.mjs'), runner);
    const root = join(temporary, 'relocated-' + consumer);
    renameSync(staging, root);
    relocated.push(realpathSync(root));
  }
  for (const file of files) assert.deepEqual(readFileSync(join(relocated[0], 'node_modules', manifest.name, file)), readFileSync(join(relocated[1], 'node_modules', manifest.name, file)));
  for (const root of relocated) {
    // Node's read boundary excludes the workspace and the other consumer.
    // Clear inherited loaders/NODE_PATH; no source absolute import is performed.
    const child = spawnSync(process.execPath, ['--permission', '--allow-fs-read=' + root, join(root, 'probe.mjs'), join(source, 'index.mjs')], {
      cwd: root, env: { OPENSSL_CONF: '/dev/null' }, encoding: 'utf8', timeout: 30000,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr || child.stdout);
    assert.equal(JSON.parse(child.stdout).status, 'PASS');
  }
  console.log(JSON.stringify({ marker: 'PROBE', status: 'PASS', consumers: 2, sharedSHA256: recorded,
    limits: ['offline installed-files copy feasibility only', 'not npm distribution acceptance', 'no product acceptance or release authority'], released: false }));
} finally {
  // Only this invocation's mkdtemp tree is removed, even on subprocess failure.
  rmSync(temporary, { recursive: true, force: true });
}
