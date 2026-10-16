import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NATIVE_CONTRACT_DIGEST } from '../integration/compatibility/v1/native.mjs';

export const VERSION = '0.3.0';
export const PIN = NATIVE_CONTRACT_DIGEST.slice(7);
export const LEGACY_PIN = 'df4f7246ae35ef9114e2b93663d520e7ff4f44f14f886ac8ba43e9fc080ddc9a';
export const OWNERS = ['runtime', 'harness', 'ontology'];
export const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function exact(value, keys) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected object');
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), 'Unexpected fields');
}
export function safeRelative(value) {
  assert(typeof value === 'string' && /^[a-zA-Z0-9_@./-]+$/.test(value) && !path.isAbsolute(value), 'Unsafe relative path');
  assert(value.split('/').every(v => v && v !== '.' && v !== '..'), 'Unsafe relative path');
  return value;
}
export function canonical(value, missing = false) {
  assert(typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value, 'Use a canonical absolute path');
  let cursor = path.parse(value).root;
  const parts = value.slice(cursor.length).split('/').filter(Boolean);
  for (const [index, part] of parts.entries()) {
    cursor = path.join(cursor, part);
    let st;
    try { st = fs.lstatSync(cursor); } catch (e) { if (e.code === 'ENOENT' && missing && index === parts.length - 1) return value; throw e; }
    assert(!st.isSymbolicLink(), 'Symlink forbidden');
    assert(st.isDirectory() || index === parts.length - 1, 'Invalid ancestor');
  }
  assert.equal(fs.realpathSync(value), value, 'Noncanonical path');
  return value;
}
export function disjoint(...roots) {
  for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
    const [a, b] = [roots[i], roots[j]];
    const contains = (parent, child) => { const rel = path.relative(parent, child); return !rel || (!rel.startsWith('../') && rel !== '..' && !path.isAbsolute(rel)); };
    assert(!contains(a, b) && !contains(b, a), 'Overlapping roots');
  }
}
export function outsideGit(root) {
  for (let p = root; ; p = path.dirname(p)) {
    try { fs.lstatSync(path.join(p, '.git')); assert.fail('Root must be outside Git'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (path.dirname(p) === p) break;
  }
}
export function regular(filename, max = 16777216) {
  canonical(filename);
  const st = fs.lstatSync(filename);
  assert(st.isFile() && st.nlink === 1 && st.uid === process.getuid() && !(st.mode & 0o022) && st.size <= max, 'Unsafe regular file');
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd);
    assert(opened.ino === st.ino && opened.dev === st.dev && opened.size === st.size, 'File changed');
    const bytes = fs.readFileSync(fd); assert(bytes.length <= max); return bytes;
  } finally { fs.closeSync(fd); }
}
// Count directories too; reject unexpected empty trees and bound traversal.
export function tree(root, { omitNpm = false } = {}) {
  canonical(root);
  const files = new Map(), directories = []; let count = 0, total = 0;
  function visit(rel, depth) {
    assert(++count <= 10000 && depth <= 40, 'Traversal limit');
    const absolute = path.join(root, rel), st = fs.lstatSync(absolute);
    assert(!st.isSymbolicLink(), 'Symlink forbidden');
    if (st.isDirectory()) {
      assert(st.uid === process.getuid() && !(st.mode & 0o022), 'Unsafe directory');
      if (rel) directories.push(rel);
      for (const name of fs.readdirSync(absolute).sort()) {
        if (omitNpm && (rel === '' || rel.endsWith('/node_modules')) && ['.bin', '.package-lock.json'].includes(name)) continue;
        visit(safeRelative(rel ? rel + '/' + name : name), depth + 1);
      }
    } else {
      const bytes = regular(absolute); total += bytes.length; assert(total <= 268435456, 'Bundle size limit'); files.set(rel, bytes);
    }
  }
  visit('', 0); return { files, directories: directories.sort() };
}
export const inventory = files => [...files].map(([path, bytes]) => ({ path, sha256: sha(bytes) })).sort((a, b) => a.path.localeCompare(b.path));
function checkInventory(list, files) {
  assert(Array.isArray(list) && list.length && list.length <= 10000, 'Invalid inventory');
  for (const e of list) { exact(e, ['path', 'sha256']); safeRelative(e.path); assert(hex(e.sha256)); }
  assert.deepEqual(list, inventory(files), 'Unexpected or changed files');
}
function expectedDirectories(files) {
  const dirs = new Set();
  for (const name of files.keys()) for (let d = path.dirname(name); d !== '.'; d = path.dirname(d)) dirs.add(d);
  return [...dirs].sort();
}
export function portable(files) {
  for (const [name, bytes] of files) {
    safeRelative(name);
    assert(!name.split('/').some(p => /^(?:\.git|\.local|\.env.*|.*\.pem|credentials?|private|audit|localstate|\.bin|\.package-lock\.json)$/i.test(p)), 'Forbidden distribution file');
    assert(!/(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)/.test(bytes.toString()), 'Personal absolute path in distribution');
  }
}
export function put(root, name, bytes, mode = 0o644) {
  safeRelative(name); const dest = path.join(root, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  fs.writeFileSync(dest, bytes, { flag: 'wx', mode });
}
export function newRoot(root) {
  canonical(root, true); assert(!fs.existsSync(root), 'Root must be new');
  assert(fs.statSync(path.dirname(root)).isDirectory());
}
export function readBundle(bundle) {
  canonical(bundle); const all = tree(bundle);
  const bytes = all.files.get('manifest.json'); assert(bytes, 'Missing bundle manifest');
  const m = JSON.parse(bytes);
  exact(m, ['schema', 'version', 'node', 'contractSHA256', 'packages', 'files']);
  assert.equal(m.schema, 'evopilot-preview-bundle/v1'); assert.equal(m.version, VERSION);
  assert.equal(m.node, '24.14.0'); assert.equal(m.contractSHA256, PIN);
  assert(Array.isArray(m.packages) && m.packages.length === 3);
  for (const [i, p] of m.packages.entries()) {
    exact(p, ['product', 'name', 'version', 'packageSHA256', 'dependencyLockSHA256']);
    assert.equal(p.product, OWNERS[i]); assert.equal(p.name, '@evopilot-next/' + p.product); assert.equal(p.version, VERSION);
    assert(hex(p.packageSHA256)); assert(p.product === 'runtime' ? p.dependencyLockSHA256 === null : hex(p.dependencyLockSHA256));
  }
  const app = new Map();
  for (const [name, content] of all.files) { if (name === 'manifest.json') continue; assert(name.startsWith('app/'), 'Unexpected bundle file'); app.set(name.slice(4), content); }
  checkInventory(m.files, app); portable(app);
  assert.deepEqual(all.directories, expectedDirectories(all.files), 'Unexpected bundle directory');
  const required = ['package.json', 'LICENSE', 'NOTICE', 'scripts/manage-preview.mjs', 'dist/plugins/codex/server.js', 'plugins/codex/mcp.template.json', 'plugins/codex/.codex-plugin/plugin.json', 'dist/expert/core/guide.js', 'dist/integration/composition.js', ...['config', 'client', 'control', 'daemon'].map(n => 'dist/integration/connection/' + n + '.js')];
  for (const name of required) assert(app.has(name), 'Incomplete bundle: ' + name);
  for (const owner of ['stack', ...OWNERS]) {
    const name = owner === 'stack' ? 'package.json' : 'node_modules/@evopilot-next/' + owner + '/package.json';
    const p = JSON.parse(app.get(name)); assert.equal(p.name, '@evopilot-next/' + owner); assert.equal(p.version, VERSION);
  }
  assert.equal(sha(app.get('integration/compatibility/v1/reference.mjs')), LEGACY_PIN);
  assert.equal(sha(app.get('dist/integration/compatibility/v1/reference.mjs')), LEGACY_PIN);
  assert.equal(sha(app.get('integration/compatibility/v1/native.mjs')), PIN);
  assert.equal(sha(app.get('dist/integration/compatibility/v1/native.mjs')), PIN);
  assert(app.has('dist/integration/compatibility/v1/reference.d.mts'));
  const contract = JSON.parse(app.get('integration/compatibility/v1/manifest.json'));
  assert.equal(contract.sha256, PIN); assert.equal(contract.module, 'native.mjs'); assert.equal(contract.contractRevision, '1.1.0'); assert.equal(contract.legacySha256, LEGACY_PIN);
  return { manifest: m, bytes, app };
}
export async function installPreview({ bundle, root, workspaceRoot = null, workspaceId = null, installationId }) {
  assert.equal(process.versions.node, '24.14.0', 'Requires Node 24.14.0');
  canonical(bundle); newRoot(root); outsideGit(root);
  assert.equal(workspaceRoot === null, workspaceId === null, 'Workspace root and id must be supplied together');
  if (workspaceRoot !== null) { canonical(workspaceRoot, true); outsideGit(workspaceRoot); }
  for (const id of [installationId, ...(workspaceId === null ? [] : [workspaceId])]) assert(typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(id), 'Invalid identity');
  if (workspaceRoot !== null && fs.existsSync(workspaceRoot)) assert(fs.statSync(workspaceRoot).isDirectory(), 'Workspace must be a directory');
  const control = workspaceRoot === null ? null : workspaceRoot + '.evopilot-control';
  if (control !== null) canonical(control, true);
  disjoint(root, bundle, ...[workspaceRoot, control].filter(v => v !== null));
  for (const other of [root, workspaceRoot, control].filter(v => v !== null)) disjoint(other, SOURCE);
  assert(!fs.existsSync(root + '.evopilot-binding.json'), 'Installation root has an existing Workspace binding');
  const { manifest, bytes, app } = readBundle(bundle);
  assert(!app.has('plugins/codex/.mcp.json'), 'Bundle contains live configuration');
  const template = JSON.parse(app.get('plugins/codex/mcp.template.json'));
  assert.deepEqual(template, { mcpServers: { evopilot_v01_preview: { command: '${nodeExecutable}', args: ['${serverPath}', '--config', '${configPath}'] } } }, 'Unexpected MCP template');
  const replacements = { '${nodeExecutable}': process.execPath, '${serverPath}': path.join(root, 'app/dist/plugins/codex/server.js'), '${configPath}': path.join(root, 'config.json') };
  const render = v => typeof v === 'string' ? replacements[v] ?? v : Array.isArray(v) ? v.map(render) : Object.fromEntries(Object.entries(v).map(([k, val]) => [k, render(val)]));
  const rendered = json(render(template)); assert(!rendered.toString().includes('${'), 'Unresolved MCP template');
  app.set('plugins/codex/.mcp.json', rendered);
  const config = { schema: 'evopilot-connection-config/v1', version: VERSION, protocol: 'evopilot-connection/v1', installationId,
    installationRoot: path.join(root, 'app'), workspaceRoot, workspaceId, components: Object.fromEntries(OWNERS.map(o => [o, VERSION])), manifest: inventory(app) };
  fs.mkdirSync(root, { mode: 0o700 });
  for (const [name, content] of app) put(root, 'app/' + name, content);
  put(root, 'bundle-manifest.json', bytes);
  put(root, '.agents/plugins/marketplace.json', json({ name: 'evopilot-v01-preview-local', plugins: [{ name: 'evopilot-v01-preview', source: { source: 'local', path: './app/plugins/codex' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' } }] }));
  put(root, 'config.json', json(config), 0o600);
  const snapshot = tree(root);
  const descriptor = { schema: 'evopilot-preview-install/v1', version: VERSION, root, installationId, workspaceRoot, workspaceId, bundleManifestSHA256: sha(bytes), files: inventory(snapshot.files), directories: snapshot.directories };
  put(root, 'managed-install.json', json(descriptor), 0o600);
  const result = await doctorPreview({ root });
  assert(!result.connection.active && !result.connection.state, 'Install found retained connection state');
  return { status: 'PASS', root, version: manifest.version, authority: false };
}
async function installed(root) {
  canonical(root); outsideGit(root);
  assert.equal(fs.lstatSync(root).mode & 0o777, 0o700, 'Private managed root required');
  const descriptorPath = path.join(root, 'managed-install.json');
  assert.equal(fs.lstatSync(descriptorPath).mode & 0o777, 0o600);
  const d = JSON.parse(regular(descriptorPath));
  exact(d, ['schema', 'version', 'root', 'installationId', 'workspaceRoot', 'workspaceId', 'bundleManifestSHA256', 'files', 'directories']);
  assert.equal(d.schema, 'evopilot-preview-install/v1'); assert.equal(d.version, VERSION); assert.equal(d.root, root); assert(hex(d.bundleManifestSHA256));
  const snapshot = tree(root); snapshot.files.delete('managed-install.json');
  checkInventory(d.files, snapshot.files); assert.deepEqual(d.directories, snapshot.directories, 'Unexpected directories');
  assert.equal(sha(snapshot.files.get('bundle-manifest.json')), d.bundleManifestSHA256);
  assert.equal(fs.lstatSync(path.join(root, 'config.json')).mode & 0o777, 0o600);
  const api = await import(pathToFileURL(path.join(root, 'app/dist/integration/connection/config.js')).href);
  const c = api.loadInstallationConfiguration(path.join(root, 'config.json'));
  const configured = JSON.parse(snapshot.files.get('config.json'));
  assert.equal(c.installationId, d.installationId); assert.equal(configured.workspaceId, d.workspaceId); assert.equal(configured.workspaceRoot, d.workspaceRoot);
  if (c.workspaceRoot !== null) disjoint(root, c.workspaceRoot, c.workspaceRoot + '.evopilot-control');
  const app = new Map([...snapshot.files].filter(([name]) => name.startsWith('app/')).map(([name, bytes]) => [name.slice(4), bytes]));
  checkInventory(c.manifest, app);
  const client = await import(pathToFileURL(path.join(root, 'app/dist/integration/connection/client.js')).href);
  return { d, c, client, snapshot };
}
export async function doctorPreview({ root }) {
  const { c, client } = await installed(root);
  const connection = await client.inspectConnection(c.configPath);
  assert(!connection.state, 'Retained non-ready connection; explicit recovery required');
  return { status: 'PASS', connection, authority: false };
}
export async function stopPreview({ root }) { const { c, client } = await installed(root); return client.stopConnection(c.configPath); }
export async function recoverPreview({ root }) { const { c, client } = await installed(root); return client.recoverStaleConnection(c.configPath); }
export async function uninstallPreview({ root }) {
  const { c, client } = await installed(root);
  const connection = await client.inspectConnection(c.configPath);
  assert(!connection.state, 'Explicit recovery required before uninstall');
  if (connection.active) {
    const stopped = await client.stopConnection(c.configPath); assert(stopped.stopped === true, 'Stop not confirmed');
    const after = await client.inspectConnection(c.configPath); assert(!after.active && !after.state, 'Connection remains active');
  }
  // Revalidate the retained inventory immediately before touching program files.
  const { snapshot } = await installed(root);
  for (const name of snapshot.files.keys()) fs.unlinkSync(path.join(root, name));
  fs.unlinkSync(path.join(root, 'managed-install.json'));
  for (const dir of [...snapshot.directories].sort((a, b) => b.split('/').length - a.split('/').length)) fs.rmdirSync(path.join(root, dir));
  fs.rmdirSync(root);
  return { removed: true, workspacePreserved: true, controlEvidencePreserved: true };
}
export function argumentsFor(args, names) {
  assert.equal(args.length, names.length * 2, 'Missing or unexpected arguments');
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    assert(names.includes(args[i]) && !Object.hasOwn(values, args[i]) && args[i + 1] && !args[i + 1].startsWith('-'), 'Invalid arguments'); values[args[i]] = args[i + 1];
  }
  return values;
}
const help = `Requires Node 24.14.0. No network, activation or Codex registration.
install --bundle DIR --root NEW_ROOT --installation-id ID [--workspace ROOT --workspace-id ID]
workspace-init --root ROOT --project-root DIR --state-root DIR --workspace-id ID --request-id ID
workspace-attach --root ROOT --project-root DIR --state-root DIR --workspace-id ID --request-id ID
workspace-inspect --root ROOT
doctor|stop|recover|uninstall --root ROOT
Unregister this preview entry BEFORE uninstall (explicit operator actions):
codex plugin remove evopilot-v01-preview@evopilot-v01-preview-local --json
codex plugin marketplace remove evopilot-v01-preview-local --json
Register explicitly after install:
codex plugin marketplace add ROOT --json
codex plugin add evopilot-v01-preview@evopilot-v01-preview-local --json`;
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') console.log(help);
    else {
      assert.equal(process.versions.node, '24.14.0', 'Requires Node 24.14.0');
      const command = args.shift(); let result;
      if (command === 'install') {
        const names = ['--bundle', '--root', '--installation-id', ...(args.includes('--workspace') || args.includes('--workspace-id') ? ['--workspace', '--workspace-id'] : [])];
        const a = argumentsFor(args, names);
        result = await installPreview({ bundle: a['--bundle'], root: a['--root'], workspaceRoot: a['--workspace'] ?? null, workspaceId: a['--workspace-id'] ?? null, installationId: a['--installation-id'] });
      } else if (['workspace-init', 'workspace-attach', 'workspace-inspect'].includes(command)) {
        const names = command === 'workspace-inspect' ? ['--root'] : ['--root', '--project-root', '--state-root', '--workspace-id', '--request-id'];
        const a = argumentsFor(args, names), { c } = await installed(a['--root']);
        const api = await import(pathToFileURL(path.join(c.installationRoot, 'dist/integration/workspace/bootstrap.js')).href);
        result = command === 'workspace-inspect' ? api.inspectWorkspace(c.configPath) : await api.setupWorkspace(c.configPath, { projectRoot: a['--project-root'], stateRoot: a['--state-root'], workspaceId: a['--workspace-id'], requestId: a['--request-id'] }, command === 'workspace-init' ? 'initialize' : 'attach');
      } else {
        const commands = { doctor: doctorPreview, stop: stopPreview, recover: recoverPreview, uninstall: uninstallPreview };
        assert(Object.hasOwn(commands, command), 'Unknown command; use --help');
        result = await commands[command]({ root: argumentsFor(args, ['--root'])['--root'] });
      }
      console.log(JSON.stringify(result));
    }
  } catch (e) { console.error(e.message + '\nAny partial new program directory is retained for diagnosis.'); process.exitCode = 1; }
}
