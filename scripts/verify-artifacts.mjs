import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname, relative, sep, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ROOT, CHILDREN, assertNoSymlinks } from './sync-contract.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const PIN = 'df4f7246ae35ef9114e2b93663d520e7ff4f44f14f886ac8ba43e9fc080ddc9a';
export function safePath(name) {
  assert(typeof name === 'string' && name.startsWith('package/'), 'Invalid archive prefix');
  const path = name.slice(8);
  assert(path && !isAbsolute(path) && /^[a-zA-Z0-9_@./-]+$/.test(path), 'Invalid archive path');
  assert(path.split('/').every(p => p && p !== '.' && p !== '..'), 'Traversal or empty path');
  assert(!path.split('/').some(p => /^(?:node_modules|\.local|\.git|\.env.*|credentials?|private|localstate)$/i.test(p)), 'Forbidden package content');
  return path;
}
// Validate all bytes and paths before extraction; links and special entries are forbidden.
export function archiveEntries(compressed) {
  const data = gunzipSync(compressed, { maxOutputLength: 64 * 1024 * 1024 });
  const entries = new Map();
  let offset = 0, pax = {}, ended = false;
  const string = b => b.toString('utf8').replace(/\0.*$/s, '');
  const octal = b => { const s = string(b).trim(); assert(/^[0-7]*$/.test(s), 'Invalid tar number'); return parseInt(s || '0', 8); };
  while (offset + 512 <= data.length) {
    const h = data.subarray(offset, offset + 512); offset += 512;
    if (h.every(b => b === 0)) { assert(data.subarray(offset).every(b => b === 0), 'Trailing tar data'); ended = true; break; }
    const checksum = [...h].reduce((sum, b, i) => sum + (i >= 148 && i < 156 ? 32 : b), 0);
    assert.equal(octal(h.subarray(148, 156)), checksum, 'Tar checksum mismatch');
    const size = octal(h.subarray(124, 136));
    assert(offset + Math.ceil(size / 512) * 512 <= data.length, 'Truncated tar');
    const body = data.subarray(offset, offset + size); offset += Math.ceil(size / 512) * 512;
    const type = string(h.subarray(156, 157));
    if (type === 'x') {
      assert.equal(Object.keys(pax).length, 0, 'Repeated extended header');
      let cursor = 0;
      while (cursor < body.length) {
        const space = body.indexOf(32, cursor); assert(space > cursor);
        const lengthText = body.subarray(cursor, space).toString();
        assert(/^[1-9][0-9]*$/.test(lengthText));
        const length = Number(lengthText); assert(length > space - cursor + 2 && cursor + length <= body.length);
        const record = body.subarray(space + 1, cursor + length).toString(); assert(record.endsWith('\n'));
        const equal = record.indexOf('='); assert(equal > 0);
        const key = record.slice(0, equal); assert(['path', 'mtime', 'atime', 'ctime', 'uid', 'gid', 'uname', 'gname'].includes(key), 'Unsupported tar metadata');
        assert(!Object.hasOwn(pax, key)); pax[key] = record.slice(equal + 1, -1); cursor += length;
      }
      continue;
    }
    assert(type === '' || type === '0', 'Non-regular tar entry forbidden');
    const prefix = string(h.subarray(345, 500));
    const name = pax.path ?? (prefix ? prefix + '/' : '') + string(h.subarray(0, 100));
    pax = {};
    const path = safePath(name);
    assert(!entries.has(path), 'Duplicate tar path'); entries.set(path, Buffer.from(body));
  }
  assert.equal(Object.keys(pax).length, 0, 'Dangling extended header');
  assert(entries.size > 0 && ended, 'Empty or unterminated archive');
  return entries;
}
export function validateEntries(entries, expected, owner) {
  assert.deepEqual([...entries.keys()].sort(), [...expected.keys()].sort(), 'Package whitelist mismatch');
  for (const [path, bytes] of entries) {
    safePath('package/' + path);
    assert.equal(hash(bytes), hash(expected.get(path)), 'Package source digest mismatch: ' + path);
  }
  const pkg = JSON.parse(entries.get('package.json'));
  assert.equal(pkg.name, '@evopilot-next/' + owner); assert.equal(pkg.version, '0.1.0');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.license, 'Apache-2.0'); assert.equal(pkg.private, true);
  assert.deepEqual(pkg.engines, { node: '>=24.14.0' });
  assert.equal(pkg.bin, undefined);
  for (const field of ['devDependencies', 'peerDependencies', 'optionalDependencies']) assert.deepEqual(pkg[field] ?? {}, {});
  assert.deepEqual(pkg.files, owner === 'runtime' ? ['src', 'vendor', 'README.md', 'docs', 'LICENSE', 'NOTICE']
    : owner === 'harness' ? ['src', 'vendor', 'README.md', 'specifications', 'examples', 'assets', 'docs', 'provenance', 'LICENSE', 'NOTICE']
    : ['src', 'vendor', 'README.md', 'specifications', 'examples', 'schemas', 'docs', 'provenance', 'LICENSE', 'NOTICE', 'assets']);
  assert.deepEqual(pkg.exports, owner === 'runtime' ? './src/index.mjs'
    : owner === 'harness' ? { '.': './src/index.mjs', './sources': './src/asset-sources.mjs' }
    : { '.': './src/index.mjs', './compat': './src/compat/index.mjs', './migration': './src/migration.mjs', './sources': './src/asset-sources.mjs' });
  const manifest = JSON.parse(entries.get('vendor/compatibility/v1/manifest.json'));
  assert.equal(manifest.module, 'reference.mjs'); assert.equal(manifest.contractRevision, '1.0.0');
  assert.equal(manifest.sha256, PIN); assert.equal(hash(entries.get('vendor/compatibility/v1/reference.mjs')), PIN);
  const index = entries.get('src/index.mjs').toString();
  assert(index.includes("export const PRODUCT = '" + owner + "';"));
  assert(index.includes("export const VERSION = '0.1.0';"));
  const exports = typeof pkg.exports === 'string' ? { '.': pkg.exports } : pkg.exports;
  for (const path of Object.values(exports)) assert(path.startsWith('./src/') && entries.has(path.slice(2)), 'Invalid export');
  const deps = owner === 'runtime' ? {} : owner === 'harness' ? { yaml: '2.9.0' } : { ajv: '8.20.0', yaml: '2.9.0' };
  assert.deepEqual(pkg.dependencies ?? {}, deps);
  return pkg;
}
export async function expectedEntries(root) {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const entries = new Map();
  async function visit(path) {
    assert(path.startsWith(resolve(root) + sep), 'Source whitelist escapes product');
    await assertNoSymlinks(path);
    const stat = await lstat(path);
    if (stat.isDirectory()) for (const name of (await readdir(path)).sort()) await visit(resolve(path, name));
    else {
      assert(stat.isFile()); const name = relative(root, path).split(sep).join('/');
      safePath('package/' + name); entries.set(name, await readFile(path));
    }
  }
  for (const name of ['package.json', ...pkg.files]) await visit(resolve(root, name));
  return entries;
}
// The source lock is separate assembly material, never an npm tarball member.
export function validateDependencyLock(bytes, pkg, expectedSHA256) {
  assert.equal(hash(bytes), expectedSHA256, 'Dependency lock digest mismatch');
  const lock = JSON.parse(bytes);
  assert.equal(lock.lockfileVersion, 3, 'Expected own v3 lock');
  assert.equal(lock.name, pkg.name, 'Lock identity mismatch');
  assert.equal(lock.version, pkg.version, 'Lock version mismatch');
  const root = lock.packages?.[''];
  assert(root, 'Missing lock root');
  assert.equal(root.name, pkg.name); assert.equal(root.version, pkg.version);
  assert.deepEqual(root.dependencies ?? {}, pkg.dependencies ?? {}, 'Lock direct dependencies mismatch');
  for (const field of ['devDependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.deepEqual(root[field] ?? {}, {});
  }
  const inventory = dependencyInventory(lock);
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    assert.equal(inventory['node_modules/' + name]?.version, version, 'Locked direct version mismatch');
  }
  // Require every declared edge to resolve inside this lock, including transitives.
  const reached = new Set();
  function visit(path, record) {
    for (const name of Object.keys(record.dependencies ?? {})) {
      assert(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name), 'Invalid dependency name');
      assert(name.split('/').every(part => part !== '.' && part !== '..'), 'Invalid dependency name');
      let parent = path, target;
      while (true) {
        const candidate = (parent ? parent + '/' : '') + 'node_modules/' + name;
        if (inventory[candidate]) { target = candidate; break; }
        if (!parent) break;
        const boundary = parent.lastIndexOf('/node_modules/');
        parent = boundary < 0 ? '' : parent.slice(0, boundary);
      }
      assert(target, 'Unresolved lock dependency: ' + name);
      if (!reached.has(target)) { reached.add(target); visit(target, lock.packages[target]); }
    }
  }
  visit('', root);
  assert.deepEqual([...reached].sort(), Object.keys(inventory).sort(), 'Unreachable lock records');
  return { lock, inventory };
}
export function dependencyInventory(lock) {
  assert.equal(lock.lockfileVersion, 3);
  assert(lock.packages && typeof lock.packages === 'object');
  return Object.fromEntries(Object.entries(lock.packages).filter(([path]) => path !== '').sort().map(([path, record]) => {
    assert(/^(?:node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)(?:\/node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)*$/i.test(path), 'Invalid dependency lock path');
    assert(path.split('/').every(part => part !== '.' && part !== '..'), 'Invalid dependency lock path');
    assert(!record.link && !record.dev && !record.optional, 'Unsupported lock record');
    assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(record.version), 'Invalid locked version');
    const url = new URL(record.resolved);
    assert(url.protocol === 'https:' && !url.username && !url.password && !url.hash, 'Invalid resolved dependency');
    assert(/^sha512-[A-Za-z0-9+/]{86}==$/.test(record.integrity), 'Invalid dependency integrity');
    return [path, { version: record.version, resolved: record.resolved, integrity: record.integrity }];
  }));
}
export function validateInstalledInventory(installed, expected) {
  assert.deepEqual(dependencyInventory(installed), expected, 'Installed dependency inventory mismatch');
}
export async function verifyInstalledDependencies(extracted, retained) {
  const hidden = JSON.parse(await readFile(resolve(extracted, 'node_modules/.package-lock.json'), 'utf8'));
  validateInstalledInventory(hidden, retained.inventory);
  const found = [];
  async function scan(directory, prefix = 'node_modules') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.bin' || entry.name === '.package-lock.json') continue;
      assert(entry.isDirectory() && !entry.isSymbolicLink(), 'Unexpected installed dependency entry');
      const path = prefix + '/' + entry.name, absolute = resolve(directory, entry.name);
      if (entry.name.startsWith('@')) { await scan(absolute, path); continue; }
      found.push(path);
      const expected = retained.lock.packages[path]; assert(expected, 'Unexpected installed package');
      const pkg = JSON.parse(await readFile(resolve(absolute, 'package.json'), 'utf8'));
      assert.equal(pkg.name, path.split('node_modules/').at(-1), 'Installed package identity mismatch');
      assert.equal(pkg.version, expected.version, 'Installed package version mismatch');
      assert.deepEqual(pkg.dependencies ?? {}, expected.dependencies ?? {}, 'Installed dependency edges mismatch');
      try { await lstat(resolve(absolute, 'node_modules')); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      await assertNoSymlinks(resolve(absolute, 'node_modules'));
      await scan(resolve(absolute, 'node_modules'), path + '/node_modules');
    }
  }
  await scan(resolve(extracted, 'node_modules'));
  assert.deepEqual(found.sort(), Object.keys(retained.inventory).sort(), 'Installed package paths mismatch');
}
function run(command, args, cwd, extraEnv = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key) || /^npm_config_cache$/i.test(key)));
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024,
    env: { ...env, NODE_OPTIONS: '', OPENSSL_CONF: '/dev/null', ...extraEnv },
  });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
function smoke(owner, pkg) {
  return '(' + smokePackage.toString() + ')(' + JSON.stringify(owner) + ',' + JSON.stringify(pkg.name) + ')';
}
async function smokePackage(owner, name) {
  const { default: assert } = await import('node:assert/strict');
  const api = await import(name);
  assert.equal(api.PRODUCT, owner); assert.equal(api.VERSION, '0.1.0');
  assert.equal(api.capabilities().authority, false);
  assert.equal(api.capabilities().businessOperationsReady, false);
  const ref = product => ({ product, id: 'artifact', version: '0.1.0', specVersion: 'v1', digest: 'sha256:' + 'a'.repeat(64), visibility: 'private' });
  const result = owner === 'runtime'
    ? api.inspectPinnedInputs({ontology: ref('ontology'), observedOntology: ref('ontology'), harness: ref('harness'), observedHarness: ref('harness')})
    : (api.inspectOntologyReference ?? api.inspectArtifactReference)(ref('ontology'), ref('ontology'));
  assert.equal(result.authority, false); assert(Object.isFrozen(result));
  if (owner !== 'runtime') {
    const sources = await import(name + '/sources');
    const list = sources.listPublicSources();
    assert.equal(list.count, owner === 'harness' ? 101 : 4);
    assert.equal(sources.readPublicSource(list.sources[0].sourcePath).status, 'PRESERVED_SOURCE');
    assert.throws(() => sources.readPublicSource('../private.yaml'));
    const fs = await import('node:fs/promises');
    const asset = JSON.parse(await fs.readFile('./specifications/v1/templates/' + (owner === 'harness' ? 'harness' : 'model') + '.json'));
    assert.equal((api.validateHarness ?? api.validateOntology)(asset).valid, true);
    assert.equal(api.verifyDelivery(api.buildDelivery(asset)).valid, true);
  }
  if (owner === 'ontology') {
    const compat = await import(name + '/compat');
    const migration = await import(name + '/migration');
    const foundation = compat.grounding.resolveOntologyFoundation();
    assert.equal(compat.validation.validateDocument(foundation).valid, true);
    assert.equal(migration.inspectLegacySource(foundation, {sourceLocator: 'synthetic://artifact', sourceRevision: 'r1', sourceVisibility: 'public'}).valid, true);
  }
}
export async function verifyArtifacts(out) {
  assert.equal(process.versions.node, '24.14.0', 'Use Node 24.14.0');
  out = resolve(out);
  await assertNoSymlinks(out, true);
  const source = await realpath(ROOT);
  assert(out !== source && !out.startsWith(source + sep) && !source.startsWith(out + sep), 'Output conflicts with source');
  await mkdir(out); // No recursive creation: existing output and missing parent both fail.
  const npmEnv = { npm_config_userconfig: resolve(out, 'npmrc'), npm_config_globalconfig: resolve(out, 'global.npmrc') };
  for (const path of Object.values(npmEnv)) await writeFile(path, '', { flag: 'wx' });
  const report = { schema: 'evopilot-local-artifacts/v1', node: process.versions.node, authority: false, acceptance: 'NOT_INFERRED', packages: [] };
  const save = () => writeFile(resolve(out, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
  await save();
  try {
    for (const child of CHILDREN) {
      const owner = child.slice('projects/evopilot-'.length), root = resolve(ROOT, child);
      const expected = await expectedEntries(root);
      const identity = validateEntries(expected, expected, owner);
      const lockSource = resolve(root, 'package-lock.json');
      let lockBytes, lockSHA256, retained;
      if (owner === 'runtime') assert.deepEqual(identity.dependencies ?? {}, {});
      else {
        await assertNoSymlinks(lockSource);
        lockBytes = await readFile(lockSource); // Missing own lock must fail before packing.
        lockSHA256 = hash(lockBytes);
        retained = validateDependencyLock(lockBytes, identity, lockSHA256);
      }
      const destination = resolve(out, owner); await mkdir(destination);
      if (lockBytes) await writeFile(resolve(destination, 'dependency-lock.json'), lockBytes, { flag: 'wx' });
      const packed = JSON.parse(run('npm', ['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', destination], root, npmEnv));
      assert.equal(packed.length, 1);
      assert(/^[a-zA-Z0-9_.-]+\.tgz$/.test(packed[0].filename));
      const tarball = resolve(destination, packed[0].filename);
      const bytes = await readFile(tarball), entries = archiveEntries(bytes);
      const pkg = validateEntries(entries, expected, owner);
      assert.deepEqual(pkg.exports, identity.exports);
      assert.deepEqual(packed[0].files.map(f => f.path).sort(), [...entries.keys()].sort());
      const extracted = resolve(destination, 'package'); await mkdir(extracted);
      for (const [path, content] of entries) {
        const target = resolve(extracted, path); await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, { flag: 'wx' });
      }
      const record = { product: owner, name: pkg.name, version: pkg.version, packageSHA256: hash(bytes),
        tarball: relative(out, tarball), exports: pkg.exports, contractSHA256: PIN,
        dependencyLock: lockBytes ? { source: relative(ROOT, lockSource), file: relative(out, resolve(destination, 'dependency-lock.json')), sha256: lockSHA256 } : null,
        dependencies: retained?.inventory ?? {}, smoke: 'PENDING' };
      report.packages.push(record); await save();
      if (lockBytes) {
        assert.equal(hash(await readFile(lockSource)), lockSHA256, 'Source lock drift');
        const bundleBytes = await readFile(resolve(destination, 'dependency-lock.json'));
        retained = validateDependencyLock(bundleBytes, pkg, lockSHA256);
        await writeFile(resolve(extracted, 'package-lock.json'), bundleBytes, { flag: 'wx' });
        run('npm', ['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], extracted, npmEnv);
        assert.equal(hash(await readFile(resolve(extracted, 'package-lock.json'))), lockSHA256, 'Installed lock drift');
        await verifyInstalledDependencies(extracted, retained);
        assert.equal(hash(await readFile(lockSource)), lockSHA256, 'Source lock drift');
      }
      run(process.execPath, ['--permission', '--allow-fs-read=' + extracted, '--input-type=module', '-e', smoke(owner, pkg)], extracted);
      record.smoke = 'PASSED'; await save();
    }
    return report;
  } catch (error) { report.error = error.message; await save(); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') console.log('Usage: node scripts/verify-artifacts.mjs --out NEW_DIRECTORY\nOffline local rehearsal; no publication or acceptance. Parent directory must exist.');
    else {
      assert(args.length === 2 && args[0] === '--out' && args[1] && !args[1].startsWith('-'), 'Expected --out NEW_DIRECTORY; use --help');
      await verifyArtifacts(args[1]); console.log('Artifact isolation checks passed; manifest retained; no acceptance inferred');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

