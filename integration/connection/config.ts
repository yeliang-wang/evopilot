import { errorCode } from '../types.js';
import type { ConnectionConfig, ConnectionIdentity, Configuration, Owner } from '../types.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({ config: 1048576, body: 1048576, response: 8388608, files: 10000, file: 16777216, total: 268435456, startup: 10000, request: 35000 });
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
function outsideGit(root: string) {
  for (let p = root; ; p = path.dirname(p)) {
    if (fs.existsSync(path.join(p, '.git'))) fail('WORKSPACE_IN_GIT');
    if (path.dirname(p) === p) break;
  }
}
export function installationIdentity(config: ConnectionConfig): ConnectionIdentity {
  return Object.freeze({ product: 'evopilot-v01-preview', version: '0.1.1', protocol: 'evopilot-connection/v1', installationId: config.installationId,
    installationRoot: config.installationRoot, installationDigest: digest(canonicalJSON(config.manifest)), components: config.components,
    workspaceRoot: config.workspaceRoot, workspaceId: config.workspaceId });
}
export function loadConfiguration(filename: string): Configuration {
  filename = canonicalPath(filename);
  outsideGit(path.dirname(filename));
  if (filename.startsWith(codeRoot + path.sep)) fail('CONFIG_LOCATION');
  const c: unknown = JSON.parse(readRegular(filename).toString());
  fields(c, ['schema', 'version', 'protocol', 'installationId', 'installationRoot', 'workspaceRoot', 'workspaceId', 'components', 'manifest']);
  if (c.schema !== 'evopilot-connection-config/v1' || c.version !== '0.1.1' || c.protocol !== 'evopilot-connection/v1') fail('CONFIG_VERSION');
  for (const key of ['installationId', 'workspaceId'] as const) if (typeof c[key] !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(c[key])) fail('CONFIG_ID');
  canonicalPath(c.installationRoot);
  if (c.installationRoot !== codeRoot) fail('INSTALLATION_ROOT');
  const workspaceRoot = canonicalPath(c.workspaceRoot, true);
  outsideGit(workspaceRoot);
  if (workspaceRoot === path.parse(workspaceRoot).root || c.workspaceRoot === codeRoot || workspaceRoot.startsWith(codeRoot + path.sep)) fail('WORKSPACE_LOCATION');
  if (fs.existsSync(workspaceRoot) && !fs.lstatSync(workspaceRoot).isDirectory()) fail('WORKSPACE_LOCATION');
  fields(c.components, ['runtime', 'harness', 'ontology']);
  if (Object.values(c.components).some(v => v !== '0.1.1')) fail('COMPONENT_VERSION');
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
  if (parent.name !== '@evopilot-next/stack' || parent.version !== '0.1.1') fail('COMPONENT_IDENTITY');
  for (const owner of Object.keys(c.components) as Owner[]) {
    const pkg = JSON.parse(readRegular(path.join(codeRoot, 'node_modules/@evopilot-next', owner, 'package.json')).toString());
    if (pkg.name !== '@evopilot-next/' + owner || pkg.version !== (c.components as Record<string, unknown>)[owner]) fail('COMPONENT_IDENTITY');
  }
  // All config fields, paths, versions and inventory have been checked above.
  const validated = c as unknown as ConnectionConfig;
  return { ...validated, configPath: filename, controlRoot: workspaceRoot + '.evopilot-control', identity: installationIdentity(validated) };
}
