import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { assemblePreview, collect, installedMarkdown, PARENT_FILES } from '../../scripts/assemble-preview.mjs';
import { SOURCE, PIN, OWNERS, sha, json, put, tree, portable, inventory, readBundle, argumentsFor, disjoint, installPreview, doctorPreview, stopPreview, recoverPreview, uninstallPreview, mcpServerName } from '../../scripts/manage-preview.mjs';

// PACKAGE FIXTURES ONLY. These do not execute or establish actual product acceptance.
function tarEntry(name, bytes) {
  const h = Buffer.alloc(512); h.write('package/' + name);
  h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136); h.fill(32, 148, 156); h.write('0', 156); h.write('ustar\0', 257); h.write('00', 263);
  h.write([...h].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
  return Buffer.concat([h, bytes, Buffer.alloc((512 - bytes.length % 512) % 512)]);
}
function packageFixture(owner) {
  const pkg = structuredClone({"runtime":{"name":"@evopilot-next/runtime","version":"0.5.0","private":true,"type":"module","engines":{"node":">=24.14.0"},"files":["dist","src","vendor","README.md","CONTRIBUTING.md","SECURITY.md","CHANGELOG.md","docs","LICENSE","NOTICE","provenance"],"exports":{".":{"types":"./dist/index.d.ts","import":"./dist/index.js"},"./service":{"types":"./dist/service.d.ts","import":"./dist/service.js"}},"scripts":{"build":"node scripts/build.mjs","check":"node scripts/check.mjs","test":"node --test tests/e2e/*.test.mjs"},"license":"Apache-2.0","bin":{"evopilot-next-runtime":"dist/cli.js"},"devDependencies":{"typescript":"5.9.3","@types/node":"24.19.2"}},"harness":{"name":"@evopilot-next/harness","version":"0.5.0","private":true,"bin":{"evopilot-next-harness":"dist/cli.js"},"type":"module","engines":{"node":">=24.14.0"},"files":["dist","src","vendor","README.md","CONTRIBUTING.md","SECURITY.md","CHANGELOG.md","specifications","examples","assets","docs","provenance","LICENSE","NOTICE"],"exports":{".":{"types":"./dist/index.d.ts","import":"./dist/index.js"},"./sources":{"types":"./dist/asset-sources.d.ts","import":"./dist/asset-sources.js"},"./service":{"types":"./dist/service.d.ts","import":"./dist/service.js"}},"scripts":{"build":"node scripts/build.mjs","check":"node scripts/check.mjs","test":"node --test tests/e2e/*.test.mjs"},"dependencies":{"yaml":"2.9.0"},"license":"Apache-2.0","devDependencies":{"typescript":"5.9.3","@types/node":"24.19.2"}},"ontology":{"name":"@evopilot-next/ontology","version":"0.5.0","private":true,"type":"module","engines":{"node":">=24.14.0"},"files":["dist","src","vendor","README.md","CONTRIBUTING.md","SECURITY.md","CHANGELOG.md","specifications","examples","schemas","docs","provenance","LICENSE","NOTICE","assets"],"exports":{".":{"types":"./dist/index.d.ts","import":"./dist/index.js"},"./compat":{"types":"./dist/compat/index.d.mts","import":"./dist/compat/index.mjs"},"./migration":{"types":"./dist/migration.d.ts","import":"./dist/migration.js"},"./sources":{"types":"./dist/asset-sources.d.ts","import":"./dist/asset-sources.js"},"./service":{"types":"./dist/service.d.ts","import":"./dist/service.js"}},"scripts":{"build":"node scripts/build.mjs","check":"tsc --noEmit && node scripts/check.mjs","test":"node --test tests/e2e/*.test.mjs"},"dependencies":{"ajv":"8.20.0","yaml":"2.9.0"},"license":"Apache-2.0","bin":{"evopilot-next-ontology":"dist/cli.js"},"devDependencies":{"typescript":"5.9.3","@types/node":"24.19.2"}}}[owner]);
  if (owner === 'harness') {
    pkg.exports['./native'] = {types:'./dist/native.d.ts',import:'./dist/native.js'};
    pkg.devDependencies.ajv = '8.20.0';
  }
  pkg.exports['./workspace-migration'] = {types:'./dist/workspace-migration.d.ts',import:'./dist/workspace-migration.js'};
    if(owner !== 'ontology') pkg.exports['./online'] = {types:'./dist/online.d.ts',import:'./dist/online.js'};
  const own = new Map([['package.json', json(pkg)]]);
  own.set('docs/service.md', Buffer.from('Synthetic service documentation fixture.'));
  for (const file of pkg.files) if (!['dist', 'src', 'vendor'].includes(file)) own.set(file.includes('.') || ['LICENSE', 'NOTICE'].includes(file) ? file : file + '/fixture.txt', Buffer.from('Synthetic package fixture, not product acceptance.'));
  for (const file of [...Object.values(pkg.exports).flatMap(Object.values), './dist/cli.js', './src/cli.ts']) own.set(file.slice(2), Buffer.from('// synthetic package fixture\n'));
  if(owner==='harness') own.set('dist/online.js',Buffer.from('export const createAlertmanagerReceiver=()=>{},createPrometheusCollector=()=>{},validatePrometheusConnection=()=>{},readOnlineSecret=()=>{};\n'));
  own.set('src/index.ts', Buffer.from(`export const PRODUCT = '${owner}';\nexport const VERSION = '0.5.0';\n`));
  own.set('vendor/compatibility/v1/reference.mjs', fs.readFileSync(path.join(SOURCE, 'integration/compatibility/v1/reference.mjs')));
  own.set('vendor/compatibility/v1/native.mjs', fs.readFileSync(path.join(SOURCE, 'integration/compatibility/v1/native.mjs')));
  own.set('vendor/compatibility/v1/manifest.json', fs.readFileSync(path.join(SOURCE, 'integration/compatibility/v1/manifest.json')));
  // Minimal public documentation, explicitly synthetic; no Host evidence.
  own.set('README.md', Buffer.from('# Synthetic ' + owner + ' package\n\n[Service](docs/service.md)\n'));
  if (owner !== 'runtime') own.set('specifications/v1/README.md', Buffer.from('# Synthetic specification fixture\n\n[Package](../../README.md)\n'));
  return { pkg, own };
}
function artifactFixtures(root) {
  fs.mkdirSync(root, { mode: 0o700 });
  const report = { schema: 'evopilot-local-artifacts/v1', node: '24.14.0', authority: false, acceptance: 'NOT_INFERRED', packages: [] };
  for (const owner of OWNERS) {
    const { pkg, own } = packageFixture(owner);
    for (const [name, bytes] of own) put(root, owner + '/package/' + name, bytes);
    const tgz = gzipSync(Buffer.concat([...own].flatMap(([name, bytes]) => [tarEntry(name, bytes)]).concat(Buffer.alloc(1024))));
    put(root, owner + '/fixture.tgz', tgz);
    let dependencyLock = null; const dependencies = {};
    if (owner !== 'runtime') {
      const lock = { name: pkg.name, version: pkg.version, lockfileVersion: 3, packages: { '': { name: pkg.name, version: pkg.version, dependencies: pkg.dependencies, devDependencies: pkg.devDependencies } } };
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        const record = { version, resolved: 'https://example.invalid/' + name + '.tgz', integrity: 'sha512-' + 'A'.repeat(86) + '==' };
        dependencies['node_modules/' + name] = record; lock.packages['node_modules/' + name] = record;
        put(root, owner + '/package/node_modules/' + name + '/package.json', json({ name, version }));
        put(root, owner + '/package/node_modules/' + name + '/index.js', Buffer.from('// dependency package fixture'));
      }
      for (const [name, version] of Object.entries(pkg.devDependencies)) lock.packages['node_modules/' + name] = { version, dev: true, resolved: 'https://example.invalid/dev.tgz', integrity: 'sha512-' + 'A'.repeat(86) + '==' };
      const bytes = json(lock); dependencyLock = { source: 'projects/evopilot-' + owner + '/package-lock.json', file: owner + '/dependency-lock.json', sha256: sha(bytes) };
      put(root, dependencyLock.file, bytes); put(root, owner + '/package/package-lock.json', bytes);
      put(root, owner + '/package/node_modules/.package-lock.json', json({ lockfileVersion: 3, packages: dependencies }));
      fs.mkdirSync(path.join(root, owner, 'package/node_modules/.bin'), { mode: 0o700 });
      fs.symlinkSync('../yaml/index.js', path.join(root, owner, 'package/node_modules/.bin/yaml'));
    }
    report.packages.push({ product: owner, name: pkg.name, version: pkg.version, packageSHA256: sha(tgz), tarball: owner + '/fixture.tgz', exports: pkg.exports, checkpoint: { checkpoint: 'M2' }, contractSHA256: PIN, dependencyLock, dependencies, smoke: 'PASSED', capabilities: { fixture: true } });
  }
  put(root, 'manifest.json', json(report));
}
function temp(t) {
  const parent = fs.realpathSync(process.env.EVOPILOT_TEST_TMPDIR ?? os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'evopilot-package-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}
function assertPublicNavigation(files) {
  for (const [name, bytes] of files) {
    if (!name.endsWith('.md')) continue;
    let fence = null;
    for (const line of bytes.toString('utf8').split('\n')) {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
        continue;
      }
      if (fence || /^(?: {4}|\t)/.test(line)) continue;
      const prose = line.replace(/(`+)[^`]*\1/g, '');
      const destinations = [...prose.matchAll(/\]\(<?([^\s<>)]*)>?(?=[\s)])/g),
        ...prose.matchAll(/^\s{0,3}\[[^\]]+\]:\s*<?([^\s<>]+)>?/g)];
      for (const match of destinations) {
        const target = match[1].split(/[?#]/)[0];
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        assert(!target.startsWith('/'), name + ' -> absolute target ' + target);
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), target));
        assert(resolved !== '..' && !resolved.startsWith('../'), name + ' -> outside app ' + target);
        assert(files.has(resolved) || [...files.keys()].some(p => p.startsWith(resolved.replace(/\/$/, '') + '/')), name + ' -> ' + target);
      }
    }
  }
}
test('distribution pure guards and parent portable whitelist', () => {
  assert.throws(() => argumentsFor(['--root', 'a', '--root', 'b'], ['--root', '--bundle']));
  assert.throws(() => argumentsFor(['--root', 'a', '--unknown', 'b'], ['--root']));
  assert.throws(() => disjoint('/program', '/program/app'));
  assert.throws(() => portable(new Map([['.local/token', Buffer.from('x')]])));
  const files = collect(SOURCE, PARENT_FILES); portable(files);
  assert(files.has('scripts/manage-preview.mjs')); assert(!files.has('scripts/assemble-preview.mjs'));
  assert.equal(inventory(files).length, files.size);
});
test('distribution excludes Finder metadata without deleting source files or hidden configuration', t => {
  const root = temp(t);
  const names = ['docs/.DS_Store', 'docs/._README.md', 'docs/__MACOSX/file', 'docs/README.md', 'docs/.gitignore'];
  for (const name of names) put(root, name, Buffer.from('synthetic packaging fixture'));
  const files = collect(root, ['docs']);
  assert.deepEqual([...files.keys()].sort(), ['docs/.gitignore', 'docs/README.md']);
  for (const name of names) assert(fs.existsSync(path.join(root, name)));
});
test('CLI help is standalone and strict (no source children required)', () => {
  for (const script of ['assemble-preview', 'manage-preview']) {
    const run = args => spawnSync(process.execPath, [path.join(SOURCE, 'scripts/' + script + '.mjs'), ...args], { timeout: 5000, encoding: 'utf8', env: { ...process.env, OPENSSL_CONF: '/dev/null' } });
    assert.equal(run(['--help']).status, 0); assert.equal(run(['--help', '--extra']).status, 1);
  }
});
test('PACKAGE FIXTURE: portable assembly, passive install, doctor, preservation and rejection', { timeout: 30000 }, async t => {
  const base = temp(t), artifacts = path.join(base, 'artifacts'), bundle = path.join(base, 'bundle');
  artifactFixtures(artifacts);
  await assemblePreview({ artifacts, out: bundle });
  const manifest = readBundle(bundle); assert.equal(manifest.manifest.packages.length, 3);
  assertPublicNavigation(manifest.app);
  assert(![...manifest.app.keys()].some(p => p.includes('/.bin/') || p.endsWith('/.package-lock.json')));
  assert(!manifest.app.has('scripts/verify-artifacts.mjs'));
  // Relocate before installing: no dependency on original artifact or bundle path.
  const relocated = path.join(base, 'relocated'); fs.renameSync(bundle, relocated);
  fs.rmSync(artifacts, { recursive: true });
  const workspaceRoot = path.join(base, 'workspace'); fs.mkdirSync(workspaceRoot, { mode: 0o700 });
  put(workspaceRoot, 'custom.txt', Buffer.from('keep user file')); put(workspaceRoot, 'audit/receipt.json', json({ keep: true }));
  const before = inventory(tree(workspaceRoot).files), root = path.join(base, 'installed');
  const options = { bundle: relocated, root, workspaceRoot, workspaceId: 'fixture-workspace', installationId: 'fixture-installation' };
  assert.equal((await installPreview(options)).status, 'PASS');
  assert.deepEqual(inventory(tree(workspaceRoot).files), before); assert(!fs.existsSync(workspaceRoot + '.evopilot-control'));
  assert.equal((await doctorPreview({ root })).connection.active, false);
  assert.deepEqual(await stopPreview({ root }), { stopped: false });
  assert.deepEqual(await recoverPreview({ root }), { recovered: false });
  assert.equal(fs.statSync(path.join(root, 'config.json')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(root, 'managed-install.json')).mode & 0o777, 0o600);
  const mcp = JSON.parse(fs.readFileSync(path.join(root, 'app/plugins/codex/.mcp.json')));
  const namespace=mcpServerName(path.join(root,'config.json'));
  assert.deepEqual(Object.keys(mcp.mcpServers),[namespace]);
  assert.equal(mcp.mcpServers[namespace].command, process.execPath);
  assert.match(namespace,/^evopilot_[0-9a-f]{16}$/);
  const parallelRoot=path.join(base,'parallel-install');
  await installPreview({...options,root:parallelRoot,workspaceRoot:null,workspaceId:null});
  const parallelMcp=JSON.parse(fs.readFileSync(path.join(parallelRoot,'app/plugins/codex/.mcp.json')));
  assert.notEqual(Object.keys(parallelMcp.mcpServers)[0],namespace);
  assert.equal(Object.keys({...mcp.mcpServers,...parallelMcp.mcpServers}).length,2);
  assert.equal((await doctorPreview({root:parallelRoot})).connection.active,false);
  await uninstallPreview({root:parallelRoot});
  await assert.rejects(installPreview(options));
  put(root, 'unexpected.txt', Buffer.from('retain'));
  await assert.rejects(doctorPreview({ root })); await assert.rejects(uninstallPreview({ root }));
  assert(fs.existsSync(path.join(root, 'config.json'))); fs.unlinkSync(path.join(root, 'unexpected.txt'));
  const managed = path.join(root, 'app/LICENSE'), original = fs.readFileSync(managed);
  fs.writeFileSync(managed, 'changed'); await assert.rejects(uninstallPreview({ root })); fs.writeFileSync(managed, original);
  fs.mkdirSync(workspaceRoot + '.evopilot-control', { mode: 0o700 });
  put(workspaceRoot + '.evopilot-control', 'audit.json', json({ retained: true }), 0o600);
  const identity = (await doctorPreview({ root })).connection.identity;
  const record = { identity: { ...identity, installationId: 'wrong-owner' }, nonce: 'a'.repeat(64), token: 'b'.repeat(64), pid: process.pid, port: 0, state: 'starting', diagnostic: null };
  const instance = path.join(workspaceRoot + '.evopilot-control', 'instance.json');
  put(workspaceRoot + '.evopilot-control', 'instance.json', json(record), 0o600);
  await assert.rejects(doctorPreview({ root })); await assert.rejects(stopPreview({ root })); await assert.rejects(uninstallPreview({ root }));
  record.identity = identity; fs.writeFileSync(instance, json(record));
  await assert.rejects(uninstallPreview({ root })); await assert.rejects(recoverPreview({ root }));
  assert(fs.existsSync(instance)); assert(fs.existsSync(path.join(root, 'config.json')));
  fs.unlinkSync(instance); // Only this test's synthetic record; never a real daemon.
  await uninstallPreview({ root }); assert(!fs.existsSync(root));
  assert.deepEqual(inventory(tree(workspaceRoot).files), before); assert(fs.existsSync(workspaceRoot + '.evopilot-control/audit.json'));
  const missingWorkspace = path.join(base, 'missing-workspace');
  await installPreview({ ...options, root, workspaceRoot: missingWorkspace }); assert(!fs.existsSync(missingWorkspace)); await uninstallPreview({ root });
  const badRoot = path.join(base, 'must-not-exist');
  await assert.rejects(installPreview({ ...options, root: path.join(relocated, 'nested') }));
  await assert.rejects(installPreview({ ...options, root: badRoot, workspaceId: '../bad' })); assert(!fs.existsSync(badRoot));
  const target = path.join(relocated, 'app/LICENSE'), saved = fs.readFileSync(target);
  fs.writeFileSync(target, 'tampered'); await assert.rejects(installPreview({ ...options, root: badRoot })); assert(!fs.existsSync(badRoot)); fs.writeFileSync(target, saved);
  put(relocated, 'app/unlisted.txt', Buffer.from('unlisted')); assert.throws(() => readBundle(relocated)); fs.unlinkSync(path.join(relocated, 'app/unlisted.txt'));
  fs.mkdirSync(path.join(relocated, 'extra')); assert.throws(() => readBundle(relocated)); fs.rmdirSync(path.join(relocated, 'extra'));
  fs.unlinkSync(target); fs.symlinkSync(path.join(relocated, 'app/NOTICE'), target); assert.throws(() => readBundle(relocated)); fs.unlinkSync(target); fs.writeFileSync(target, saved);
  fs.unlinkSync(target); fs.linkSync(path.join(relocated, 'app/NOTICE'), target); assert.throws(() => readBundle(relocated)); fs.unlinkSync(target); fs.writeFileSync(target, saved);
  fs.symlinkSync(relocated, path.join(base, 'linked')); await assert.rejects(installPreview({ ...options, bundle: path.join(base, 'linked'), root: badRoot }));
});
test('PACKAGE FIXTURE: assembly refuses changed archive, extracted bytes and dependency inventory before output', { timeout: 30000 }, async t => {
  const base = temp(t), artifacts = path.join(base, 'artifacts'); artifactFixtures(artifacts);
  const out = path.join(base, 'out');
  for (const rel of ['runtime/fixture.tgz', 'runtime/package/src/index.ts', 'harness/dependency-lock.json', 'harness/package/node_modules/yaml/package.json']) {
    const full = path.join(artifacts, rel), bytes = fs.readFileSync(full); fs.writeFileSync(full, '{}');
    await assert.rejects(assemblePreview({ artifacts, out })); assert(!fs.existsSync(out)); fs.writeFileSync(full, bytes);
  }
  put(artifacts, 'harness/package/node_modules/unlisted/package.json', json({ name: 'unlisted', version: '1.0.0' }));
  await assert.rejects(assemblePreview({ artifacts, out })); assert(!fs.existsSync(out));
});

test('Markdown product links map exactly; unrelated destinations and examples stay unchanged', () => {
  const source = '[R](../projects/evopilot-runtime/docs/service.md#requests) [H](../projects/evopilot-harness/README.md) [O](<../projects/evopilot-ontology/docs/service.md>)\n[ref]: ../projects/evopilot-ontology/schemas/model.json "Schema"\n';
  const expected = '[R](../node_modules/@evopilot-next/runtime/docs/service.md#requests) [H](../node_modules/@evopilot-next/harness/README.md) [O](<../node_modules/@evopilot-next/ontology/docs/service.md>)\n[ref]: ../node_modules/@evopilot-next/ontology/schemas/model.json "Schema"\n';
  assert.equal(installedMarkdown(source, 'docs/first-journey.md'), expected);
  const untouched = '[web](https://example.invalid/projects/evopilot-runtime/README.md) [absolute](/projects/evopilot-runtime/README.md) [other](../projects/evopilot-other/README.md)\nPlain ../projects/evopilot-runtime/README.md\n`[code](../projects/evopilot-runtime/README.md)`\n```sh\n[example](../projects/evopilot-runtime/README.md)\n```\n    [indented](../projects/evopilot-runtime/README.md)\n';
  assert.equal(installedMarkdown(untouched, 'docs/example.md'), untouched);
  assert.equal(installedMarkdown('[R](projects/evopilot-runtime/README.md)', 'README.md'), '[R](node_modules/@evopilot-next/runtime/README.md)');
  assert.equal(installedMarkdown('[R](../../../projects/evopilot-runtime/README.md)', 'integration/compatibility/v1/README.md'), '[R](../../../node_modules/@evopilot-next/runtime/README.md)');
});

test('owned absolute Markdown URLs map only to shipped files and preserve code and bounds', () => {
  const url = 'https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/service.md';
  const parentURL = 'https://github.com/yeliang-wang/evopilot/blob/main/docs/installation.md';
  const files = new Map([
    ['node_modules/@evopilot-next/ontology/docs/service.md', Buffer.from('fixture')],
    ['docs/installation.md', Buffer.from('fixture')],
  ]);
  const source = '[API](' + url + '#requests)\n[ref]: ' + parentURL + '?view=1#install\n';
  assert.equal(installedMarkdown(source, 'docs/example.md', files),
    '[API](../node_modules/@evopilot-next/ontology/docs/service.md#requests)\n[ref]: installation.md?view=1#install\n');
  assert.equal(installedMarkdown(source, 'docs/example.md'), source);
  assert.equal(installedMarkdown('[Install](' + parentURL + ')', 'node_modules/@evopilot-next/ontology/README.md', files),
    '[Install](../../../docs/installation.md)');
  const untouched = [
    '[missing](' + url.replace('service.md', 'missing.md') + ')',
    '[external](' + url.replace('yeliang-wang', 'other-owner') + ')',
    '[traversal](' + url.replace('docs/service.md', 'docs/%2e%2e/service.md') + ')',
    '[absolute](/docs/installation.md)',
    '[escape](../../projects/evopilot-runtime/README.md)',
    '[local](./installation.md#install)',
    '`[inline](' + url + ')`',
    '    [indented](' + url + ')',
    '```md\n[fenced](' + url + ')\n```',
    'Plain ' + url,
  ].join('\n');
  assert.equal(installedMarkdown(untouched, 'docs/example.md', files), untouched);
});

test('included parent Markdown links resolve after product target translation', () => {
  const files = collect(SOURCE, PARENT_FILES);
  for (const name of ['README.md', 'docs/README.md', 'scripts/verify-local-acceptance.mjs']) {
    assert(files.has(name), 'Missing public entry: ' + name);
    assert.deepEqual(files.get(name), fs.readFileSync(path.join(SOURCE, name)));
  }
  assert(![...files.keys()].some(name => /^(?:projects|node_modules|\.local|tests|integration\/e2e)\//.test(name)));
  assert(!files.has('scripts/verify-artifacts.mjs'));
  for (const owner of OWNERS) for (const [name, bytes] of packageFixture(owner).own) {
    files.set('node_modules/@evopilot-next/' + owner + '/' + name, bytes);
  }
  for (const [name, bytes] of files) if (name.endsWith('.md')) files.set(name, Buffer.from(installedMarkdown(bytes.toString('utf8'), name, files)));
  assertPublicNavigation(files);
  // Missing public targets must fail even though source-only tools are absent.
  for (const target of ['docs/installation.md', 'docs/README.md', 'scripts/verify-local-acceptance.mjs', 'scripts/roadmap.mjs', 'node_modules/@evopilot-next/runtime/docs/service.md', 'node_modules/@evopilot-next/harness/specifications/v1/README.md', 'node_modules/@evopilot-next/ontology/specifications/v1/README.md']) {
    const missing = new Map(files); missing.delete(target);
    assert.throws(() => assertPublicNavigation(missing), / -> /);
  }
});

test('navigation ignores source code examples but rejects real missing public links', () => {
  const files = new Map([['README.md', Buffer.from('Source checkout: `integration/e2e/example.test.mjs` and `[example](scripts/source-only.mjs)`.\n```sh\n[example](scripts/source-only.mjs)\n```\n[Public](<docs/README.md>)\n[reference]: docs/README.md\n')], ['docs/README.md', Buffer.from('[Home](../README.md)')]]);
  assertPublicNavigation(files);
  files.delete('docs/README.md');
  assert.throws(() => assertPublicNavigation(files), /README.md -> docs\/README.md/);
});
