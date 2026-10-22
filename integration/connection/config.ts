import { errorCode } from '../types.js';
import type { ConnectionConfig, ConnectionIdentity, Configuration, InstallationConfiguration, WorkspaceBinding, Owner } from '../types.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({ config: 1048576, body: 1048576, response: 8388608, nativeBody: 8388608, nativeResponse: 16777216, nativeOutput: 33554432, files: 10000, file: 16777216, total: 268435456, startup: 10000, request: 35000 });
function nativePackageRoute(action: unknown, payload: unknown, read = false): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const p = payload as Record<string, unknown>;
  if (action === 'native_project') return ['preflight','freeze','materialize'].includes(String(p.operation));
  if (action !== 'native' || typeof p.owner !== 'string' || !['ontology', 'harness'].includes(p.owner) || !p.envelope || typeof p.envelope !== 'object' || Array.isArray(p.envelope)) return false;
  const operation = (p.envelope as Record<string, unknown>).operation;
  return operation === 'native.package.put' || (read && typeof operation === 'string' && ['native.package.inspect', 'native.package.readback', 'native.package.publish', 'native.receipt.inspect'].includes(operation));
}
function readableRoute(action:unknown,payload:unknown):boolean {if(action!=='native'||!payload||typeof payload!=='object')return false;const p=payload as {envelope?:{operation?:unknown}};return typeof p.envelope?.operation==='string'&&p.envelope.operation.startsWith('readable.');}
/** Only package-bearing routes receive the larger finite budget, never caller-selected limits. */
export const connectionRequestTimeout = (action:unknown,payload:unknown):number => action==='native'||nativePackageRoute(action,payload) ? 625_000 : LIMITS.request;
export const connectionBodyLimit = (action: unknown, payload: unknown): number => nativePackageRoute(action, payload) ? LIMITS.nativeBody : LIMITS.body;
export const connectionResponseLimit = (action: unknown, payload: unknown): number => readableRoute(action,payload) ? 67108864 : nativePackageRoute(action, payload, true) ? LIMITS.nativeResponse : LIMITS.response;
export const mcpOutputLimit = (action: unknown, payload: unknown): number => readableRoute(action,payload) ? 134217728 : nativePackageRoute(action, payload, true) ? LIMITS.nativeOutput : LIMITS.response;
/** Keep the candidate identity on uncertain outcomes without echoing package contents. */
export function connectionCorrelation(action: unknown, payload: unknown): Record<string, unknown> | null {
  const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const p = record(payload);
  if (!p) return null;
  let source = record(p.envelope) ?? record(p.args);
  if (!source && action === 'native_project') {
    const input = record(p.input);
    source = { operation: p.operation, ...(input && Object.hasOwn(input, 'scope') ? { scope: input.scope } : {}), ...(input && Object.hasOwn(input, 'id') ? { id: input.id } : {}) };
  }
  if (!source && Object.hasOwn(p, 'requestId')) source = { requestId: p.requestId, operation: p.operation ?? action };
  const selected = source;
  if (!selected) return null;
  const owner = action === 'native' && typeof p.owner === 'string' && ['runtime', 'harness', 'ontology'].includes(p.owner) ? { owner: p.owner } : {};
  return { ...owner, ...Object.fromEntries(['requestId', 'scope', 'expectedRevision', 'operation', 'id'].filter(k => Object.hasOwn(selected, k)).map(k => [k, selected[k]])) };
}
export const codeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export function fail(code: string, message = code): never { throw Object.assign(new Error(message), { code }); }
export const canonicalJSON = (value: unknown): string => JSON.stringify(value && typeof value === 'object' ? Array.isArray(value) ? value.map(v => JSON.parse(canonicalJSON(v))) : Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonicalJSON((value as Record<string, unknown>)[k]))])) : value);
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function fields(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail('SCHEMA');
}
export function canonicalPath(value: unknown, missingFinal = false) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value) fail('PATH');
  const parts = value.split(path.sep).filter(Boolean);
  let current = path.parse(value).root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let st;
    try { st = fs.lstatSync(current); } catch (e) { if (errorCode(e) === 'ENOENT' && missingFinal && i === parts.length - 1) return value; throw e; }
    if (st.isSymbolicLink()) fail('SYMLINK');
    if (i < parts.length - 1 && !st.isDirectory()) fail('PATH');
  }
  if (fs.realpathSync(value) !== value) fail('PATH');
  return value;
}
export function readRegular(filename: string, max: number = LIMITS.config, privateFile = false) {
  canonicalPath(filename);
  const before = fs.lstatSync(filename);
  if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid!() || (before.mode & 0o022) || (privateFile && (before.mode & 0o777) !== 0o600) || before.size > max) fail('UNSAFE_FILE');
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    if (st.ino !== before.ino || st.dev !== before.dev || st.size !== before.size) fail('FILE_CHANGED');
    const bytes = fs.readFileSync(fd);
    if (bytes.length > max) fail('LIMIT');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function present(filename: string) { try { fs.lstatSync(filename); return true; } catch (error) { if (errorCode(error) === 'ENOENT') return false; throw error; } }
export function outsideGit(root: string) {
  for (let p = root; ; p = path.dirname(p)) {
    if (present(path.join(p, '.git'))) fail('WORKSPACE_IN_GIT');
    if (path.dirname(p) === p) break;
  }
}
export function installationIdentity(config: ConnectionConfig): ConnectionIdentity {
  return Object.freeze({ product: 'evopilot-v01-preview', version: '0.7.0', protocol: 'evopilot-connection/v1', installationId: config.installationId,
    installationRoot: config.installationRoot, installationDigest: digest(canonicalJSON(config.manifest)), components: config.components,
    workspaceRoot: config.workspaceRoot, workspaceId: config.workspaceId });
}
interface ConfigurationReadOptions { allowMissingProject?: boolean; restoreRequestId?: string }
function restoreStagingProject(binding: WorkspaceBinding, requestId: string | undefined): boolean {
  if (!requestId || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(requestId) || present(path.join(binding.projectRoot, 'workspace-project.json'))) return false;
  const privateDirectory = (root: string) => {
    canonicalPath(root); const st = fs.lstatSync(root);
    if (!st.isDirectory() || st.uid !== process.getuid!() || (st.mode & 0o777) !== 0o700) fail('UNSAFE_PROJECT');
  };
  privateDirectory(binding.projectRoot);
  const stageName = '.evopilot-copy-' + requestId;
  if (canonicalJSON(fs.readdirSync(binding.projectRoot)) !== canonicalJSON([stageName])) return false;
  const control = binding.stateRoot + '.evopilot-maintenance';
  outsideGit(control); privateDirectory(control); privateDirectory(path.join(control, 'requests'));
  const journal = JSON.parse(readRegular(path.join(control, 'requests', requestId + '.json'), 32 * 1048576, true).toString());
  fields(journal, ['schema', 'requestId', 'intentDigest', 'operation', 'status', 'source', 'destinations', 'manifest', 'copied', 'result', 'lastError']);
  const source = { projectRoot: binding.projectRoot, stateRoot: binding.stateRoot, workspaceId: binding.workspaceId };
  if (journal.schema !== 'evopilot-workspace-maintenance-journal/v1' || journal.requestId !== requestId || journal.operation !== 'restore' || !['COPYING', 'INTERRUPTED'].includes(String(journal.status)) || journal.result !== null || journal.copied !== false || canonicalJSON(journal.source) !== canonicalJSON(source) || canonicalJSON(journal.destinations) !== canonicalJSON([binding.projectRoot, binding.stateRoot])) fail('RESTORE_JOURNAL');
  if (!journal.manifest || typeof journal.manifest !== 'object' || Array.isArray(journal.manifest) || canonicalJSON((journal.manifest as Record<string, unknown>).source) !== canonicalJSON(source)) fail('RESTORE_JOURNAL');
  const stage = path.join(binding.projectRoot, stageName); privateDirectory(stage);
  for (const name of fs.readdirSync(stage)) {
    if (!/^[a-f0-9]{64}$/.test(name)) fail('RESTORE_STAGING');
    const filename = path.join(stage, name); canonicalPath(filename); const st = fs.lstatSync(filename);
    if (!st.isFile() || st.nlink !== 1 || st.uid !== process.getuid!() || (st.mode & 0o777) !== 0o600 || st.size > 64 * 1048576) fail('RESTORE_STAGING');
  }
  // The maintenance owner verifies the pinned backup and exact partial bytes
  // before publishing anything. This allowance only reaches that recovery path.
  return true;
}
export function loadInstallationConfiguration(filename: string, options: ConfigurationReadOptions = {}): InstallationConfiguration {
  filename = canonicalPath(filename);
  outsideGit(path.dirname(filename));
  if (filename.startsWith(codeRoot + path.sep)) fail('CONFIG_LOCATION');
  const c: unknown = JSON.parse(readRegular(filename).toString());
  fields(c, ['schema', 'version', 'protocol', 'installationId', 'installationRoot', 'workspaceRoot', 'workspaceId', 'components', 'manifest']);
  if (c.schema !== 'evopilot-connection-config/v1' || c.version !== '0.7.0' || c.protocol !== 'evopilot-connection/v1') fail('CONFIG_VERSION');
  if (typeof c.installationId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(c.installationId)) fail('CONFIG_ID');
  if ((c.workspaceRoot === null) !== (c.workspaceId === null)) fail('CONFIG_WORKSPACE');
  if (c.workspaceId !== null && (typeof c.workspaceId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(c.workspaceId))) fail('CONFIG_ID');
  canonicalPath(c.installationRoot);
  if (c.installationRoot !== codeRoot) fail('INSTALLATION_ROOT');
  if (c.workspaceRoot !== null) validateStateRoot(c.workspaceRoot);
  fields(c.components, ['runtime', 'harness', 'ontology']);
  if (Object.values(c.components).some(v => v !== '0.7.0')) fail('COMPONENT_VERSION');
  if (!Array.isArray(c.manifest) || !c.manifest.length || c.manifest.length > LIMITS.files) fail('MANIFEST');
  const listed = new Set();
  let total = 0;
  for (const entry of c.manifest) {
    fields(entry, ['path', 'sha256']);
    if (typeof entry.path !== 'string' || !/^[a-zA-Z0-9_@./-]+$/.test(entry.path) || path.isAbsolute(entry.path) || entry.path.split('/').some(s => !s || s === '.' || s === '..') || !/^[a-f0-9]{64}$/.test(entry.sha256 as string) || listed.has(entry.path)) fail('MANIFEST');
    listed.add(entry.path);
    const bytes = readRegular(path.join(codeRoot, entry.path), LIMITS.file);
    total += bytes.length;
    if (total > LIMITS.total) fail('LIMIT');
    if (digest(bytes) !== entry.sha256) fail('INSTALLATION_DIGEST');
  }
  const required = ['package.json', 'dist/integration/composition.js', 'dist/integration/types.js', 'dist/integration/compatibility/v1/reference.mjs', 'dist/integration/compatibility/v1/manifest.json', ...['config', 'control', 'client', 'daemon'].map(n => `dist/integration/connection/${n}.js`)];
  let visited = 0;
  function walk(relative: string) {
    if (++visited > LIMITS.files) fail('MANIFEST');
    const absolute = path.join(codeRoot, relative);
    canonicalPath(absolute);
    const st = fs.lstatSync(absolute);
    if (st.isDirectory()) {
      if (st.uid !== process.getuid!() || (st.mode & 0o022)) fail('UNSAFE_DIRECTORY');
      for (const name of fs.readdirSync(absolute)) walk(relative + '/' + name);
    } else { if (!st.isFile()) fail('MANIFEST'); required.push(relative); }
  }
  walk('node_modules');
  if (required.some(p => !listed.has(p))) fail('MANIFEST_INCOMPLETE');
  const parent = JSON.parse(readRegular(path.join(codeRoot, 'package.json')).toString());
  if (parent.name !== '@evopilot-next/stack' || parent.version !== '0.7.0') fail('COMPONENT_IDENTITY');
  for (const owner of Object.keys(c.components) as Owner[]) {
    const pkg = JSON.parse(readRegular(path.join(codeRoot, 'node_modules/@evopilot-next', owner, 'package.json')).toString());
    if (pkg.name !== '@evopilot-next/' + owner || pkg.version !== (c.components as Record<string, unknown>)[owner]) fail('COMPONENT_IDENTITY');
  }
  // A binding is private mutable user configuration, outside immutable program inventory.
  const bindingPath = path.dirname(filename) + '.evopilot-binding.json';
  const validated = c as unknown as ConnectionConfig;
  let workspaceRoot = c.workspaceRoot as string | null, workspaceId = c.workspaceId as string | null, projectRoot: string | null = null;
  if (present(bindingPath)) {
    const binding: WorkspaceBinding = JSON.parse(readRegular(bindingPath, LIMITS.config, true).toString());
    fields(binding, ['schema', 'installationId', 'installationDigest', 'installationRoot', 'projectRoot', 'stateRoot', 'workspaceId', 'requestId']);
    if (binding.schema !== 'evopilot-workspace-binding/v1' || binding.installationId !== c.installationId || binding.installationRoot !== c.installationRoot || binding.installationDigest !== digest(canonicalJSON(c.manifest))) fail('BINDING_IDENTITY');
    for (const id of [binding.workspaceId, binding.requestId]) if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(id)) fail('BINDING_IDENTITY');
    validateStateRoot(binding.stateRoot); canonicalPath(binding.projectRoot, options.allowMissingProject === true);
    if (workspaceRoot !== null && (workspaceRoot !== binding.stateRoot || workspaceId !== binding.workspaceId)) fail('WORKSPACE_ALREADY_BOUND');
    const projectMissing = options.allowMissingProject === true && (!present(binding.projectRoot) || (fs.lstatSync(binding.projectRoot).isDirectory() && fs.readdirSync(binding.projectRoot).length === 0));
    if (projectMissing && present(binding.projectRoot)) { const st = fs.lstatSync(binding.projectRoot); if (st.uid !== process.getuid!() || (st.mode & 0o777) !== 0o700) fail('UNSAFE_PROJECT'); }
    if (!projectMissing && !(options.allowMissingProject === true && restoreStagingProject(binding, options.restoreRequestId))) validateProject(binding.projectRoot, binding.workspaceId);
    const roots = [binding.projectRoot, binding.stateRoot, path.dirname(filename)];
    for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) if (roots[i] === roots[j] || roots[i].startsWith(roots[j] + path.sep) || roots[j].startsWith(roots[i] + path.sep)) fail('WORKSPACE_LOCATION');
    workspaceRoot = binding.stateRoot; workspaceId = binding.workspaceId; projectRoot = binding.projectRoot;
  }
  return { ...validated, workspaceRoot, workspaceId, projectRoot, configPath: filename, bindingPath,
    identity: { ...installationIdentity(validated), workspaceRoot, workspaceId } };
}
export function validateStateRoot(value: unknown): string {
  const root = canonicalPath(value, true); outsideGit(root);
  if (root === path.parse(root).root || root === codeRoot || root.startsWith(codeRoot + path.sep) || codeRoot.startsWith(root + path.sep)) fail('WORKSPACE_LOCATION');
  if (fs.existsSync(root) && !fs.lstatSync(root).isDirectory()) fail('WORKSPACE_LOCATION');
  return root;
}
export function validateProject(root: string, id: string) {
  canonicalPath(root);
  if (root === codeRoot || root.startsWith(codeRoot + path.sep) || codeRoot.startsWith(root + path.sep)) fail('WORKSPACE_LOCATION');
  const st = fs.lstatSync(root);
  if (!st.isDirectory() || st.uid !== process.getuid!() || (st.mode & 0o077)) fail('UNSAFE_PROJECT');
  const p = JSON.parse(readRegular(path.join(root, 'workspace-project.json'), LIMITS.config, true).toString());
  fields(p, ['schema', 'id', 'templateVersion', 'specifications']); fields(p.specifications, ['ontology', 'harness']);
  if (p.schema !== 'evopilot-workspace-project/v1' || p.id !== id || (typeof p.templateVersion !== 'string' || !['0.1.1', '0.2.0'].includes(p.templateVersion)) || p.specifications.ontology !== 'v1' || p.specifications.harness !== 'v1') fail('PROJECT_IDENTITY');
  return p;
}
export function loadConfiguration(filename: string, options: ConfigurationReadOptions = {}): Configuration {
  const c = loadInstallationConfiguration(filename, options);
  if (c.workspaceRoot === null || c.workspaceId === null) fail('WORKSPACE_UNCONFIGURED');
  return { ...c, workspaceRoot: c.workspaceRoot, workspaceId: c.workspaceId, controlRoot: c.workspaceRoot + '.evopilot-control', identity: { ...c.identity, workspaceRoot: c.workspaceRoot, workspaceId: c.workspaceId } };
}
