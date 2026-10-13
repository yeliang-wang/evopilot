import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { validateAction } from '../../dist/integration/connection/client.js';
import { canonicalJSON, installationIdentity } from '../../dist/integration/connection/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Resolve public installed entries, then copy regular package bytes, never the
// development node_modules links or unrelated installation/workspace content.
function packageRoot(entry, name) {
  for (let dir = path.dirname(fs.realpathSync(entry)); ; dir = path.dirname(dir)) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest)).name === name) return dir;
    assert.notEqual(path.dirname(dir), dir, 'Missing installed package identity: ' + name);
  }
}
function packageLock(directory) {
  for (let dir = directory; ; dir = path.dirname(dir)) {
    for (const relative of ['package-lock.json', 'node_modules/.package-lock.json']) {
      const filename = path.join(dir, relative);
      if (!fs.existsSync(filename)) continue;
      const lock = JSON.parse(fs.readFileSync(filename));
      const location = path.relative(dir, directory).split(path.sep).join('/');
      if (lock.lockfileVersion === 3 && lock.packages?.[location]) return { lock, location };
    }
    assert.notEqual(path.dirname(dir), dir, 'Missing installed dependency lock');
  }
}
function lockedDependency(context, name) {
  let parent = context.location;
  while (true) {
    const location = (parent ? parent + '/' : '') + 'node_modules/' + name;
    const record = context.lock.packages[location];
    if (record) {
      assert(!record.link && !record.dev && !record.optional, 'Expected locked production dependency');
      assert(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(record.version), 'Expected pinned dependency');
      return { lock: context.lock, location, record };
    }
    assert(parent, 'Unresolved locked dependency: ' + name);
    const boundary = parent.lastIndexOf('/node_modules/');
    parent = boundary < 0 ? '' : parent.slice(0, boundary);
  }
}
function copyInstalledPackage(source, destination, name, version, context, ancestors = new Set()) {
  source = fs.realpathSync(source);
  assert(!ancestors.has(source), 'Unexpected dependency cycle');
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
  assert.equal(pkg.name, name); assert.equal(pkg.version, version);
  if (context?.record) assert.deepEqual(pkg.dependencies ?? {}, context.record.dependencies ?? {});
  const next = new Set(ancestors).add(source);
  const excluded = part => part.startsWith('.') || /^(?:node_modules|tests?|__tests__|coverage|credentials?|private|localstate)$/i.test(part) || /\.(?:env|pem)$/i.test(part);
  function copy(relative) {
    assert(relative.split('/').every(part => part && part !== '..' && part !== '.'), 'Invalid package file');
    if (relative.split('/').some(excluded)) return;
    const filename = path.join(source, relative), canonical = fs.realpathSync(filename);
    assert(canonical.startsWith(source + path.sep), 'Package file escapes own package');
    const st = fs.statSync(filename), target = path.join(destination, relative);
    if (st.isDirectory()) {
      // Root npm bindings are dereferenced; internal directory links are not package files.
      assert(!fs.lstatSync(filename).isSymbolicLink(), 'Unexpected internal directory link');
      for (const item of fs.readdirSync(filename)) copy(relative + '/' + item);
    } else {
      assert(st.isFile(), 'Expected regular package file');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(canonical, target);
    }
  }
  // Use published file whitelists where supplied, without invoking npm.
  const entries = pkg.files ?? fs.readdirSync(source);
  for (const entry of new Set(['package.json', ...entries,
    ...fs.readdirSync(source).filter(n => /^(?:readme|licen[cs]e|notice)(?:\.|$)/i.test(n))])) {
    const relative = entry.replace(/^\.\//, '').replace(/\/$/, '');
    assert(!path.isAbsolute(relative) && !relative.split('/').includes('..'), 'Invalid package whitelist');
    if (/[*?\[\]{}]/.test(relative)) {
      const matches = fs.globSync(relative, { cwd: source });
      assert(matches.length, 'Missing whitelisted package files: ' + relative);
      for (const match of matches) copy(match.split(path.sep).join('/'));
    } else copy(relative);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(destination, 'package.json'))), pkg);
  if (Object.keys(pkg.dependencies ?? {}).length && !context) {
    context = packageLock(source);
    const record = context.lock.packages[context.location];
    assert.equal(record.version, pkg.version);
    assert.deepEqual(record.dependencies ?? {}, pkg.dependencies);
  }
  const require = createRequire(path.join(source, 'package.json'));
  for (const dependency of Object.keys(pkg.dependencies ?? {})) {
    assert(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(dependency), 'Invalid dependency identity');
    const locked = lockedDependency(context, dependency);
    const dependencyRoot = packageRoot(require.resolve(dependency), dependency);
    copyInstalledPackage(dependencyRoot, path.join(destination, 'node_modules', dependency), dependency, locked.record.version, locked, next);
  }
}

// Synthetic packages exist only inside this test's temporary installation.
// Production always imports public bare packages and has no injected fallback.
export async function assembly(realProducts = false) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'evopilot-connection-')));
  const install = path.join(base, 'install');
  fs.mkdirSync(install);
  const copy = relative => { fs.mkdirSync(path.dirname(path.join(install, relative)), { recursive: true }); fs.copyFileSync(path.join(root, relative), path.join(install, relative)); };
  const files = ['package.json', 'dist/integration/types.js', 'dist/integration/composition.js', 'dist/integration/compatibility/v1/reference.mjs', 'dist/integration/compatibility/v1/manifest.json', ...['config', 'control', 'client', 'daemon'].map(n => `dist/integration/connection/${n}.js`)];
  files.forEach(copy);
  if (realProducts) for (const owner of ['runtime', 'harness', 'ontology']) {
    const name = '@evopilot-next/' + owner;
    const source = packageRoot(fileURLToPath(import.meta.resolve(name)), name);
    copyInstalledPackage(source, path.join(install, 'node_modules', name), name, '0.1.1');
  }
  else for (const owner of ['runtime', 'harness', 'ontology']) {
    const dir = path.join(install, 'node_modules/@evopilot-next', owner);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@evopilot-next/' + owner, version: '0.1.1', type: 'module', exports: { '.': './index.mjs', './service': './index.mjs' } }));
    const factory = 'create' + owner[0].toUpperCase() + owner.slice(1) + 'Service';
    fs.writeFileSync(path.join(dir, 'index.mjs'), `
      import fs from 'node:fs';
      export const PRODUCT = '${owner}', VERSION = '0.1.1';
      export const verifyDelivery = () => ({valid:true});
      export const validateInstances = () => ({valid:true});
      export function ${factory}(options) {
        return { initialize() { fs.mkdirSync(options.workspaceRoot, {recursive:true}); fs.writeFileSync(options.workspaceRoot + '/${owner}', 'initialized'); },
          capabilities() { return {product:PRODUCT}; }, close() {},
          async dispatch() { await new Promise(r => setTimeout(r, 250)); return {fixture:true}; },
          reconcile() { return {fixture:true}; },
          execute(r) { if (r.operation === 'fixture.fail') throw Object.assign(new Error('private provider message'), {code:'REVISION_CONFLICT'}); return {revision:0, scope:r.scope, requestId:r.requestId??null}; }
        };
      }
    `);
  }
  function walk(relative) {
    for (const name of fs.readdirSync(path.join(install, relative))) {
      const entry = relative + '/' + name;
      if (fs.lstatSync(path.join(install, entry)).isDirectory()) walk(entry); else files.push(entry);
    }
  }
  walk('node_modules');
  const config = { schema: 'evopilot-connection-config/v1', version: '0.1.1', protocol: 'evopilot-connection/v1', installationRoot: install,
    installationId: 'test-install', workspaceRoot: path.join(base, 'workspace'), workspaceId: 'test-workspace',
    components: { runtime: '0.1.1', harness: '0.1.1', ontology: '0.1.1' },
    manifest: files.sort().map(relative => ({ path: relative, sha256: createHash('sha256').update(fs.readFileSync(path.join(install, relative))).digest('hex') })) };
  const configPath = path.join(base, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  const api = await import(pathToFileURL(path.join(install, 'dist/integration/connection/client.js')));
  const configuration = await import(pathToFileURL(path.join(install, 'dist/integration/connection/config.js')));
  const control = await import(pathToFileURL(path.join(install, 'dist/integration/connection/control.js')));
  const cleanup = async () => {
    try { await api.stopConnection(configPath); } catch {}
    // Test cleanup only removes its own fixture after exact authenticated stop.
    const c = configuration.loadConfiguration(configPath), r = control.readRecord(c);
    if (r && !control.processDead(r.pid)) throw Error('Owned fixture daemon still running; preserve evidence');
    fs.rmSync(base, { recursive: true, force: true });
  };
  return { base, install, config, configPath, api, configuration, control, cleanup };
}

export function clientProcess(f, expression) {
  return new Promise((resolve, reject) => {
    const source = `import * as api from ${JSON.stringify(pathToFileURL(path.join(f.install, 'dist/integration/connection/client.js')).href)}; const config = ${JSON.stringify(f.configPath)}; console.log(JSON.stringify(await (${expression})));`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], { env: { LANG: 'C', OPENSSL_CONF: '/dev/null' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    const timer = setTimeout(() => { child.kill(); reject(Error('Fixture client timeout')); }, 15000);
    child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { errors += b; });
    child.on('error', reject);
    child.on('exit', code => { clearTimeout(timer); if (code) reject(Error(errors)); else { try { resolve(JSON.parse(output)); } catch (e) { reject(e); } } });
  });
}

export async function rawRequest(f, record, action, payload, { drop = false, headers = {}, nonce = record.nonce } = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ protocol: f.config.protocol, identity: record.identity, nonce, action, payload });
    const req = http.request({ host: '127.0.0.1', port: record.port, method: 'POST', path: '/', agent: false,
      headers: { host: '127.0.0.1:' + record.port, authorization: 'Bearer ' + record.token, 'content-type': 'application/json', ...headers } }, res => {
      if (drop) { res.destroy(); resolve({ lost: true }); return; }
      let bytes = ''; res.on('data', b => { bytes += b; }); res.on('end', () => resolve({ status: res.statusCode, body: bytes }));
    });
    req.setTimeout(3000, () => req.destroy(Error('Fixture request timeout')));
    req.on('error', reject); req.end(body);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  test('closed action schemas and deterministic public identity are pure', () => {
    assert.throws(() => validateAction('classify', {}), { code: 'ACTION' });
    assert.throws(() => validateAction('request', { owner: 'other', envelope: {} }), { code: 'OWNER' });
    assert.throws(() => validateAction('capabilities', { extra: true }), { code: 'SCHEMA' });
    assert.throws(() => validateAction('dispatch', { args: null }), { code: 'SCHEMA' });
    assert.equal(canonicalJSON({ b: 2, a: 1 }), canonicalJSON({ a: 1, b: 2 }));
    const config = { installationId: 'fixture', installationRoot: '/installation', workspaceRoot: '/workspace', workspaceId: 'fixture', manifest: [], components: {} };
    assert.deepEqual(installationIdentity(config), installationIdentity({ ...config }));
    assert.equal(Object.hasOwn(installationIdentity(config), 'token'), false);
  });
  test('real detached election, authenticated forwarding, independent clients, stop and restart', { timeout: 30000 }, async () => {
    const f = await assembly();
    try {
      assert.equal((await f.api.inspectConnection(f.configPath)).active, false);
      assert.equal(fs.existsSync(f.config.workspaceRoot), false);
      assert.equal(fs.existsSync(f.config.workspaceRoot + '.evopilot-control'), false);
      const [a, b] = await Promise.all([clientProcess(f, 'api.activateConnection(config)'), clientProcess(f, 'api.activateConnection(config)')]);
      assert.equal(a.pid, b.pid);
      assert.deepEqual(fs.readdirSync(f.config.workspaceRoot), ['runtime']);
      assert.equal((await f.api.inspectConnection(f.configPath)).pid, a.pid, 'starter exit leaves daemon alive');
      const c = f.configuration.loadConfiguration(f.configPath), record = f.control.readRecord(c);
      assert(!JSON.stringify(a).includes(record.token));
      const health = await rawRequest(f, record, 'health', {});
      assert.equal(health.status, 200); assert(!health.body.includes(record.token));
      assert.equal((await rawRequest(f, record, 'health', {}, { headers: { origin: 'http://other' } })).status, 403);
      assert.equal((await rawRequest(f, record, 'health', {}, { headers: { authorization: 'Bearer wrong' } })).status, 403);
      assert.equal((await rawRequest(f, record, 'health', {}, { headers: { host: 'localhost:' + record.port } })).status, 403);
      assert.equal((await rawRequest(f, record, 'health', {}, { nonce: 'bad' })).status, 400);
      await assert.rejects(f.api.callConnection(f.configPath, 'request', { owner: 'foreign', envelope: {} }), { code: 'OWNER' });
      const envelope = { operation: 'fixture.fail', requestId: 'exact', scope: { visibility: 'private', projectId: 'test' }, expectedRevision: 7 };
      await assert.rejects(f.api.callConnection(f.configPath, 'request', { owner: 'runtime', envelope }), e => e.code === 'REVISION_CONFLICT' && e.correlation.requestId === 'exact' && e.correlation.expectedRevision === 7);
      const pending = f.api.callConnection(f.configPath, 'dispatch', { args: {} });
      await sleep(50);
      await assert.rejects(f.api.stopConnection(f.configPath), { code: 'BUSY' });
      await pending;
      await f.api.stopConnection(f.configPath);
      assert.equal((await f.api.inspectConnection(f.configPath)).active, false);
      const next = await f.api.activateConnection(f.configPath);
      assert.notEqual(next.nonce, a.nonce);
    } finally { await f.cleanup(); }
  });

  test('identity conflict, forged/private metadata, manifest drift and explicit dead-process recovery', { timeout: 20000 }, async () => {
    const f = await assembly();
    try {
      await f.api.activateConnection(f.configPath);
      const c = f.configuration.loadConfiguration(f.configPath), record = f.control.readRecord(c);
      const alternate = path.join(f.base, 'alternate.json');
      fs.writeFileSync(alternate, JSON.stringify({ ...f.config, installationId: 'other-install' }));
      await assert.rejects(f.api.activateConnection(alternate), { code: 'IDENTITY_CONFLICT' });
      assert.throws(() => f.api.recoverStaleConnection(f.configPath), { code: 'PROCESS_NOT_PROVABLY_DEAD' });
      const filename = path.join(c.controlRoot, 'instance.json');
      fs.chmodSync(filename, 0o644);
      await assert.rejects(f.api.inspectConnection(f.configPath), { code: 'CONTROL_INVALID' });
      fs.chmodSync(filename, 0o600);
      await f.api.stopConnection(f.configPath);
      // A reaped actual child supplies provable dead PID evidence, never an arbitrary PID.
      const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
      await new Promise(resolve => child.on('exit', resolve));
      f.control.writeRecord(c, { ...record, pid: child.pid, state: 'starting', port: 0 }, true);
      assert.equal(f.api.recoverStaleConnection(f.configPath).recovered, true);
      assert.equal(fs.existsSync(f.config.workspaceRoot), true);
      fs.appendFileSync(path.join(f.install, 'dist/integration/composition.js'), '\n// drift');
      assert.throws(() => f.configuration.loadConfiguration(f.configPath), { code: 'INSTALLATION_DIGEST' });
      fs.copyFileSync(path.join(root, 'dist/integration/composition.js'), path.join(f.install, 'dist/integration/composition.js'));
    } finally { await f.cleanup(); }
  });
}
