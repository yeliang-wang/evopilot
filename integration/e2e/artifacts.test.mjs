import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ROOT } from '../../scripts/sync-contract.mjs';
import { validateProductMetadata } from '../../scripts/check.mjs';
import { expectedEntries, validateEntries, archiveEntries, validateDependencyLock, validateInstalledInventory, safePath } from '../../scripts/verify-artifacts.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Synthetic package boundaries exercise guards without unpopulated children.
test('M2 metadata: exact service exports, own bins and Runtime provenance remain bounded', async () => {
  const canonical = await readFile(resolve(ROOT, 'integration/compatibility/v1/reference.mjs'));
  for (const owner of ['runtime', 'harness', 'ontology']) {
    const pkg = structuredClone({"runtime":{"name":"@evopilot-next/runtime","version":"0.2.0","private":true,"type":"module","engines":{"node":">=24.14.0"},"files":["dist","src","vendor","README.md","CONTRIBUTING.md","SECURITY.md","CHANGELOG.md","docs","LICENSE","NOTICE","provenance"],"exports":{".":{"types":"./dist/index.d.ts","import":"./dist/index.js"},"./service":{"types":"./dist/service.d.ts","import":"./dist/service.js"}},"scripts":{"build":"node scripts/build.mjs","check":"node scripts/check.mjs","test":"node --test tests/e2e/*.test.mjs"},"license":"Apache-2.0","bin":{"evopilot-next-runtime":"dist/cli.js"},"devDependencies":{"typescript":"5.9.3","@types/node":"24.19.2"}},"harness":{"name":"@evopilot-next/harness","version":"0.2.0","private":true,"bin":{"evopilot-next-harness":"dist/cli.js"},"type":"module","engines":{"node":">=24.14.0"},"files":["dist","src","vendor","README.md","CONTRIBUTING.md","SECURITY.md","CHANGELOG.md","specifications","examples","assets","docs","provenance","LICENSE","NOTICE"],"exports":{".":{"types":"./dist/index.d.ts","import":"./dist/index.js"},"./sources":{"types":"./dist/asset-sources.d.ts","import":"./dist/asset-sources.js"},"./service":{"types":"./dist/service.d.ts","import":"./dist/service.js"}},"scripts":{"build":"node scripts/build.mjs","check":"node scripts/check.mjs","test":"node --test tests/e2e/*.test.mjs"},"dependencies":{"yaml":"2.9.0"},"license":"Apache-2.0","devDependencies":{"typescript":"5.9.3","@types/node":"24.19.2"}},"ontology":{"name":"@evopilot-next/ontology","version":"0.2.0","private":true,"type":"module","engines":{"node":">=24.14.0"},"files":["dist","src","vendor","README.md","CONTRIBUTING.md","SECURITY.md","CHANGELOG.md","specifications","examples","schemas","docs","provenance","LICENSE","NOTICE","assets"],"exports":{".":{"types":"./dist/index.d.ts","import":"./dist/index.js"},"./compat":{"types":"./dist/compat/index.d.mts","import":"./dist/compat/index.mjs"},"./migration":{"types":"./dist/migration.d.ts","import":"./dist/migration.js"},"./sources":{"types":"./dist/asset-sources.d.ts","import":"./dist/asset-sources.js"},"./service":{"types":"./dist/service.d.ts","import":"./dist/service.js"}},"scripts":{"build":"node scripts/build.mjs","check":"tsc --noEmit && node scripts/check.mjs","test":"node --test tests/e2e/*.test.mjs"},"dependencies":{"ajv":"8.20.0","yaml":"2.9.0"},"license":"Apache-2.0","bin":{"evopilot-next-ontology":"dist/cli.js"},"devDependencies":{"typescript":"5.9.3","@types/node":"24.19.2"}}}[owner]);
    pkg.exports['./workspace-migration'] = {types:'./dist/workspace-migration.d.ts',import:'./dist/workspace-migration.js'};
    const entriesFor = manifest => new Map([
      ...Object.values(manifest.exports).flatMap(entry => typeof entry === 'string' ? [entry] : Object.values(entry)).map(path => [path.slice(2), Buffer.from('// synthetic public module')]),
      ['package.json', Buffer.from(JSON.stringify(manifest))],
      ['src/index.ts', Buffer.from(`export const PRODUCT = '${owner}';\nexport const VERSION = '0.2.0';`)],
      ['src/cli.ts', Buffer.from('// synthetic own CLI')],
      ['dist/cli.js', Buffer.from('// synthetic compiled CLI')],
      ['vendor/compatibility/v1/reference.mjs', canonical],
      ['vendor/compatibility/v1/manifest.json', Buffer.from(JSON.stringify({ module: 'reference.mjs', contractRevision: '1.0.0', sha256: sha256(canonical) }))],
    ]);
    const valid = entriesFor(pkg);
    const noTypes = new Map(valid); noTypes.delete('dist/index.d.ts');
    assert.throws(() => validateEntries(noTypes, noTypes, owner), /declaration/);
    validateEntries(valid, valid, owner);
    assert.equal(validateProductMetadata(pkg, owner).cli, 'PRESENT');
    assert.equal(validateProductMetadata({ ...pkg, files: [...pkg.files].reverse() }, owner).cli, 'PRESENT');
    const missingBin = { ...pkg }; delete missingBin.bin;
    assert.throws(() => validateProductMetadata(missingBin, owner, 'M4'));
    const withBin = { ...pkg, bin: { ['evopilot-next-' + owner]: 'dist/cli.js' } };
    assert.equal(validateProductMetadata(withBin, owner).cli, 'PRESENT');
    for (const mutate of [
      p => { p.bin = { foreign: 'src/cli.mjs' }; },
      p => { p.bin = { ['evopilot-next-' + owner]: '../foreign/cli.mjs' }; },
      p => { p.bin = { ['evopilot-next-' + owner]: 'src/service.mjs' }; },
      p => { p.exports['./service'] = '../foreign/service.mjs'; },
      p => { p.exports['./service'] = './src/index.mjs'; },
      p => { p.exports['./foreign'] = './src/foreign.mjs'; },
      p => { p.dependencies = { ...p.dependencies, foreign: '1.0.0' }; },
      p => { p.scripts.test = 'node --test tests/e2e/reference.test.mjs'; },
      p => { p.files = p.files.filter(path => path !== 'provenance'); },
      ...['CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md'].map(doc => p => { p.files = p.files.filter(path => path !== doc); }),
      p => { p.files.push('arbitrary.txt'); },
      p => { p.files.push('README.md'); },
      ...(owner !== 'ontology' ? [p => { delete p.bin; }] : []),
    ]) {
      const changed = structuredClone(pkg); mutate(changed);
      assert.throws(() => validateProductMetadata(changed, owner));
      const entries = entriesFor(changed);
      assert.throws(() => validateEntries(entries, entries, owner));
    }
  }
});
test('dependency lock requires dev flags for direct and transitive development-only nodes', () => {
  const pkg = {
    name: '@evopilot-next/harness', version: '0.2.0',
    dependencies: { yaml: '2.9.0' },
    devDependencies: { typescript: '5.9.3', '@types/node': '24.19.2' },
  };
  const record = (name, version, extra = {}) => ({
    version, resolved: 'https://registry.npmjs.org/' + name + '/-/fixture.tgz',
    integrity: 'sha512-' + 'A'.repeat(86) + '==', ...extra,
  });
  const lock = {
    name: pkg.name, version: pkg.version, lockfileVersion: 3,
    packages: {
      '': structuredClone(pkg),
      'node_modules/yaml': record('yaml', '2.9.0'),
      'node_modules/typescript': record('typescript', '5.9.3', { dev: true }),
      'node_modules/@types/node': record('@types/node', '24.19.2', {
        dev: true, dependencies: { 'undici-types': '~7.18.0' },
      }),
      'node_modules/undici-types': record('undici-types', '7.18.2', { dev: true }),
    },
  };
  const bytes = Buffer.from(JSON.stringify(lock)), digest = sha256(bytes);
  const retained = validateDependencyLock(bytes, pkg, digest);
  assert.deepEqual(Object.keys(retained.inventory), ['node_modules/yaml']);
  for (const name of ['typescript', '@types/node', 'undici-types']) {
    for (const flag of [undefined, false]) {
      const changed = structuredClone(lock), path = 'node_modules/' + name;
      if (flag === undefined) delete changed.packages[path].dev;
      else changed.packages[path].dev = flag;
      const changedBytes = Buffer.from(JSON.stringify(changed));
      assert.throws(() => validateDependencyLock(changedBytes, pkg, digest), /digest mismatch/);
      assert.throws(() => validateDependencyLock(changedBytes, pkg, sha256(changedBytes)), {
        code: 'ERR_ASSERTION', actual: flag, expected: true,
        message: /^Development-only dependency must be marked dev:/,
      });
    }
  }
  const productionDev = structuredClone(lock);
  productionDev.packages['node_modules/yaml'].dev = true;
  const productionBytes = Buffer.from(JSON.stringify(productionDev));
  assert.throws(() => validateDependencyLock(productionBytes, pkg, sha256(productionBytes)), /Production dependency marked dev/);
  // A node reached through both closures remains a production dependency.
  const shared = structuredClone(lock);
  shared.packages['node_modules/yaml'].dependencies = { 'undici-types': '7.18.2' };
  delete shared.packages['node_modules/undici-types'].dev;
  const sharedBytes = Buffer.from(JSON.stringify(shared));
  assert.deepEqual(Object.keys(validateDependencyLock(sharedBytes, pkg, sha256(sharedBytes)).inventory),
    ['node_modules/undici-types', 'node_modules/yaml']);
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
      lock => { lock.packages['node_modules/yaml'].dev = true; },
      lock => { lock.packages[''].devDependencies.typescript = '0.0.0'; },
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
    for (const name of Object.keys(installed.packages)) if (!Object.hasOwn(retained.inventory, name)) delete installed.packages[name];
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

function assertReadmeTarget(entries, link) {
  if (/^(?:https?:|#)/.test(link)) return;
  const target = decodeURIComponent(link.split('#')[0]).replace(/^\.\//, '');
  const directory = target.endsWith('/');
  const name = safePath('package/' + (directory ? target.slice(0, -1) : target));
  assert((!directory && entries.has(name)) || [...entries.keys()].some(file => file.startsWith(name + '/')),
    'Broken packaged README link: ' + link);
}

test('README directory links require shipped descendants inside the exact safe directory', () => {
  const entries = new Map([['provenance/source.json', Buffer.from('{}')], ['docs/guide.md', Buffer.from('# Guide')]]);
  for (const link of ['provenance/', './provenance/#sources', 'docs/guide.md#guide', '#heading']) assertReadmeTarget(entries, link);
  for (const link of ['missing/', 'docs/missing.md#heading', 'proven/', 'docs/guide.md/', '../provenance/', '/provenance/', '%2e%2e/provenance/', 'docs/../provenance/', 'provenance//']) {
    assert.throws(() => assertReadmeTarget(entries, link));
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
      assertReadmeTarget(entries, link);
    }
  }
});

// Use the real product bytes, then corrupt the package boundary in memory.
// No temporary writes or npm installation are needed for these negative cases.
test('artifact verification rejects missing, foreign and corrupted real product bytes', async () => {
  const expected = await expectedEntries(resolve(ROOT, 'projects/evopilot-runtime'));
  assert.equal(validateEntries(expected, expected, 'runtime').name, '@evopilot-next/runtime');
  for (const path of ['src/index.ts', 'vendor/compatibility/v1/reference.mjs', 'vendor/compatibility/v1/manifest.json']) {
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

