import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ROOT } from '../../scripts/sync-contract.mjs';
import { validateProductMetadata } from '../../scripts/check.mjs';
import { expectedEntries, validateEntries, archiveEntries, validateDependencyLock, validateInstalledInventory } from '../../scripts/verify-artifacts.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Synthetic package boundaries exercise guards without unpopulated children.
test('M2 metadata: exact service exports, own bins and Runtime provenance remain bounded', async () => {
  const canonical = await readFile(resolve(ROOT, 'integration/compatibility/v1/reference.mjs'));
  for (const owner of ['runtime', 'harness', 'ontology']) {
    const pkg = {
      name: '@evopilot-next/' + owner, version: '0.1.0', private: true, type: 'module', license: 'Apache-2.0', engines: { node: '>=24.14.0' },
      scripts: { build: 'node scripts/check.mjs', check: 'node scripts/check.mjs', test: 'node --test tests/e2e/*.test.mjs' },
      files: owner === 'runtime' ? ['src', 'vendor', 'README.md', 'docs', 'LICENSE', 'NOTICE', 'provenance']
        : owner === 'harness' ? ['src', 'vendor', 'README.md', 'specifications', 'examples', 'assets', 'docs', 'provenance', 'LICENSE', 'NOTICE']
        : ['src', 'vendor', 'README.md', 'specifications', 'examples', 'schemas', 'docs', 'provenance', 'LICENSE', 'NOTICE', 'assets'],
      exports: { '.': './src/index.mjs', ...(owner === 'ontology' ? { './compat': './src/compat/index.mjs', './migration': './src/migration.mjs' } : {}), ...(owner !== 'runtime' ? { './sources': './src/asset-sources.mjs' } : {}), './service': './src/service.mjs' },
      bin: { ['evopilot-next-' + owner]: 'src/cli.mjs' },
      dependencies: owner === 'runtime' ? {} : owner === 'harness' ? { yaml: '2.9.0' } : { ajv: '8.20.0', yaml: '2.9.0' },
    };
    const entriesFor = manifest => new Map([
      ...Object.values(manifest.exports).map(path => [path.slice(2), Buffer.from('// synthetic public module')]),
      ['package.json', Buffer.from(JSON.stringify(manifest))],
      ['src/index.mjs', Buffer.from(`export const PRODUCT = '${owner}';\nexport const VERSION = '0.1.0';`)],
      ['src/cli.mjs', Buffer.from('// synthetic own CLI')],
      ['vendor/compatibility/v1/reference.mjs', canonical],
      ['vendor/compatibility/v1/manifest.json', Buffer.from(JSON.stringify({ module: 'reference.mjs', contractRevision: '1.0.0', sha256: sha256(canonical) }))],
    ]);
    const valid = entriesFor(pkg);
    validateEntries(valid, valid, owner);
    assert.equal(validateProductMetadata(pkg, owner).cli, 'PRESENT');
    const missingBin = { ...pkg }; delete missingBin.bin;
    assert.throws(() => validateProductMetadata(missingBin, owner, 'M4'));
    const withBin = { ...pkg, bin: { ['evopilot-next-' + owner]: 'src/cli.mjs' } };
    assert.equal(validateProductMetadata(withBin, owner).cli, 'PRESENT');
    for (const mutate of [
      p => { p.bin = { foreign: 'src/cli.mjs' }; },
      p => { p.bin = { ['evopilot-next-' + owner]: '../foreign/cli.mjs' }; },
      p => { p.bin = { ['evopilot-next-' + owner]: 'src/service.mjs' }; },
      p => { p.exports['./service'] = '../foreign/service.mjs'; },
      p => { p.exports['./service'] = './src/index.mjs'; },
      p => { p.exports['./foreign'] = './src/foreign.mjs'; },
      p => { p.dependencies.foreign = '1.0.0'; },
      p => { p.scripts.test = 'node --test tests/e2e/reference.test.mjs'; },
      p => { p.files = p.files.filter(path => path !== 'provenance'); },
      ...(owner !== 'ontology' ? [p => { delete p.bin; }] : []),
    ]) {
      const changed = structuredClone(pkg); mutate(changed);
      assert.throws(() => validateProductMetadata(changed, owner));
      const entries = entriesFor(changed);
      assert.throws(() => validateEntries(entries, entries, owner));
    }
  }
});
test('real own locks match packed identities and reject identity, direct and transitive changes', async () => {
  for (const owner of ['harness', 'ontology']) {
    const root = resolve(ROOT, 'projects/evopilot-' + owner);
    const entries = await expectedEntries(root);
    const pkg = validateEntries(entries, entries, owner);
    const bytes = await readFile(resolve(root, 'package-lock.json'));
    const digest = sha256(bytes);
    const retained = validateDependencyLock(bytes, pkg, digest);
    assert.equal(Object.keys(retained.inventory).length, owner === 'harness' ? 1 : 6);
    assert(!entries.has('package-lock.json'), 'Own lock is separate bundle material');
    if (owner === 'ontology') {
      // Even well-formed replacement transitive records must not replace retained bytes.
      for (const field of ['version', 'resolved', 'integrity']) {
        const changed = structuredClone(retained.lock);
        changed.packages['node_modules/fast-uri'][field] = field === 'version' ? '3.1.6'
          : field === 'resolved' ? 'https://example.invalid/fast-uri.tgz' : 'sha512-' + 'A'.repeat(86) + '==';
        assert.throws(() => validateDependencyLock(Buffer.from(JSON.stringify(changed)), pkg, digest), /digest mismatch/);
      }
    }
    for (const mutate of [
      lock => { lock.name = '@foreign/package'; },
      lock => { lock.version = '9.0.0'; },
      lock => { lock.packages[''].name = '@foreign/package'; },
      lock => { lock.packages[''].dependencies.yaml = '0.0.0'; },
      lock => { lock.packages['node_modules/yaml'].version = '0.0.0'; },
      lock => { lock.packages['node_modules/yaml'].integrity = 'missing'; },
      lock => { lock.packages['node_modules/yaml'].resolved = 'file:/foreign'; },
      ...(owner === 'ontology' ? [
        lock => { delete lock.packages['node_modules/fast-uri']; },
        lock => { lock.packages['node_modules/fast-uri'].integrity = 'invalid'; },
      ] : []),
    ]) {
      const changed = structuredClone(retained.lock); mutate(changed);
      const changedBytes = Buffer.from(JSON.stringify(changed));
      assert.throws(() => validateDependencyLock(changedBytes, pkg, digest), /digest mismatch/);
      // Also reject semantic defects independently of the snapshot digest.
      assert.throws(() => validateDependencyLock(changedBytes, pkg, sha256(changedBytes)));
    }
    const installed = { lockfileVersion: 3, packages: structuredClone(retained.lock.packages) };
    delete installed.packages[''];
    validateInstalledInventory(installed, retained.inventory);
    for (const path of Object.keys(installed.packages)) {
      for (const field of ['version', 'resolved', 'integrity']) {
        const changed = structuredClone(installed);
        changed.packages[path][field] = field === 'version' ? '99.0.0' : field === 'resolved'
          ? 'https://example.invalid/changed.tgz' : 'sha512-' + 'A'.repeat(86) + '==';
        assert.throws(() => validateInstalledInventory(changed, retained.inventory), /inventory mismatch/);
      }
      const missing = structuredClone(installed); delete missing.packages[path];
      assert.throws(() => validateInstalledInventory(missing, retained.inventory), /inventory mismatch/);
    }
  }
});

test('consumer README links resolve in each actual package file inventory', async () => {
  for (const owner of ['runtime', 'harness', 'ontology']) {
    const entries = await expectedEntries(resolve(ROOT, 'projects/evopilot-' + owner));
    const artifact = gzipSync(Buffer.concat([
      ...[...entries].map(([path, bytes]) => tarEntry('package/' + path, '0', bytes)), Buffer.alloc(1024),
    ]));
    validateEntries(archiveEntries(artifact), entries, owner);
    for (const [, link] of entries.get('README.md').toString().matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(link)) continue;
      assert(entries.has(link.split('#')[0]), owner + ' broken packaged README link: ' + link);
    }
  }
});

// Use the real product bytes, then corrupt the package boundary in memory.
// No temporary writes or npm installation are needed for these negative cases.
test('artifact verification rejects missing, foreign and corrupted real product bytes', async () => {
  const expected = await expectedEntries(resolve(ROOT, 'projects/evopilot-runtime'));
  assert.equal(validateEntries(expected, expected, 'runtime').name, '@evopilot-next/runtime');
  for (const path of ['src/index.mjs', 'vendor/compatibility/v1/reference.mjs', 'vendor/compatibility/v1/manifest.json']) {
    const corrupt = new Map(expected); corrupt.set(path, Buffer.from('corrupted'));
    assert.throws(() => validateEntries(corrupt, expected, 'runtime'), /digest mismatch/);
    const missing = new Map(expected); missing.delete(path);
    assert.throws(() => validateEntries(missing, expected, 'runtime'), /whitelist/);
  }
  const extra = new Map(expected); extra.set('node_modules/foreign/index.js', Buffer.from('foreign'));
  assert.throws(() => validateEntries(extra, expected, 'runtime'), /whitelist/);
  assert.throws(() => validateEntries(expected, expected, 'harness'));
});

test('a self-consistent replacement manifest cannot change the contract pin', async () => {
  const entries = await expectedEntries(resolve(ROOT, 'projects/evopilot-runtime'));
  const path = 'vendor/compatibility/v1/manifest.json';
  const manifest = JSON.parse(entries.get(path)); manifest.module = '../../src/index.mjs';
  entries.set(path, Buffer.from(JSON.stringify(manifest)));
  assert.throws(() => validateEntries(entries, entries, 'runtime'));
});

function tarEntry(name, type = '0', body = Buffer.from('payload')) {
  const header = Buffer.alloc(512);
  header.write(name); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
  header.write('00000000000\0', 136); header.fill(32, 148, 156); header.write(type, 156);
  header.write('ustar\0', 257); header.write('00', 263);
  const sum = [...header].reduce((a, b) => a + b, 0);
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512)]);
}
test('tar boundary rejects traversal, links, duplicate paths and checksum corruption before extraction', () => {
  const pack = (...entries) => gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));
  assert.equal(archiveEntries(pack(tarEntry('package/src/index.mjs'))).get('src/index.mjs').toString(), 'payload');
  for (const path of ['package/../escape', '/absolute', 'package/node_modules/x', 'package/.local/data', 'package/credentials/key', 'package/private/data']) {
    assert.throws(() => archiveEntries(pack(tarEntry(path))));
  }
  for (const type of ['1', '2', '3', '5']) assert.throws(() => archiveEntries(pack(tarEntry('package/link', type))));
  assert.throws(() => archiveEntries(pack(tarEntry('package/x'), tarEntry('package/x'))), /Duplicate/);
  const corrupt = tarEntry('package/x'); corrupt[0] ^= 1;
  assert.throws(() => archiveEntries(pack(corrupt)), /checksum/);
});

