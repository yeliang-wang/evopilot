import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import type { Configuration, InstallationConfiguration, WorkspaceBinding, WorkspaceProject } from '../types.js';
import { errorCode } from '../types.js';
import { canonicalJSON, canonicalPath, codeRoot, digest, fail, fields, loadInstallationConfiguration, readRegular, validateProject, validateStateRoot } from '../connection/config.js';
import { withWorkspaceLease, withInstallationLease } from './lock.js';
import { createComposition, loadInstalledProducts } from '../composition.js';

export interface WorkspaceSetupInput { requestId: string; projectRoot?: string; stateRoot?: string; workspaceId?: string }
interface SetupIntent extends WorkspaceBinding { mode: 'initialize' | 'attach' }
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/;
function present(filename: string) { try { fs.lstatSync(filename); return true; } catch (error) { if (errorCode(error) === 'ENOENT') return false; throw error; } }
function synchronize(directory: string) { const fd = fs.openSync(directory, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function exclusive(filename: string, value: unknown) {
  const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  synchronize(path.dirname(filename));
}
function publishBinding(filename: string, value: unknown) {
  // The installation setup lock serializes writers; readers see complete JSON or absence.
  const temporary = filename + '.write-' + randomBytes(16).toString('hex');
  exclusive(temporary, value);
  try {
    if (present(filename)) fail('WORKSPACE_ALREADY_BOUND');
    fs.renameSync(temporary, filename); synchronize(path.dirname(filename));
  } finally { if (present(temporary)) fs.unlinkSync(temporary); }
}
function disjoint(...roots: string[]) {
  for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
    if (roots[i] === roots[j] || roots[i].startsWith(roots[j] + path.sep) || roots[j].startsWith(roots[i] + path.sep)) fail('WORKSPACE_LOCATION');
  }
}
function directory(root: string) {
  canonicalPath(root);
  const st = fs.lstatSync(root);
  if (!st.isDirectory() || st.uid !== process.getuid!() || (st.mode & 0o077)) fail('UNSAFE_WORKSPACE');
}
function defaultParents(root: string) {
  if (!present(root)) { defaultParents(path.dirname(root)); fs.mkdirSync(root, { mode: 0o700 }); synchronize(path.dirname(root)); }
  canonicalPath(root);
  const st = fs.lstatSync(root);
  if (!st.isDirectory() || st.uid !== process.getuid!() || (st.mode & 0o022)) fail('UNSAFE_DIRECTORY');
}
function stateIdentity(root: string, id: string) {
  directory(root);
  const value = JSON.parse(readRegular(path.join(root, 'workspace.json'), 4096, true).toString());
  const expected = { schema: 'evopilot-workspace/v1', id, canonicalRoot: root, ownerUid: process.getuid!() };
  if (canonicalJSON(value) !== canonicalJSON(expected)) fail('IDENTITY_MISMATCH');
}
function templateFiles(c: InstallationConfiguration) {
  const template = path.join(codeRoot, 'workspace/templates/project'), files = new Map<string, string>();
  let count = 0, total = 0;
  function visit(relative: string) {
    if (++count > 1000) fail('LIMIT');
    const source = path.join(template, relative); canonicalPath(source);
    const st = fs.lstatSync(source);
    if (st.isDirectory()) { for (const name of fs.readdirSync(source)) visit(relative ? relative + '/' + name : name); }
    else {
      const bytes = readRegular(source); total += bytes.length; if (total > 8388608) fail('LIMIT');
      const entry = c.manifest.find(item => item.path === 'workspace/templates/project/' + relative);
      if (!entry || entry.sha256 !== digest(bytes)) fail('TEMPLATE_INCOMPLETE');
      files.set(relative, bytes.toString());
    }
  }
  visit('');
  for (const required of ['README.md', 'docs/storage.md', 'examples/forward/README.md', 'examples/reverse/README.md', 'examples/reverse/source.json', '.gitignore']) if (!files.has(required)) fail('TEMPLATE_INCOMPLETE');
  return files;
}
function makeProject(root: string, id: string, templates: Map<string, string>) {
  if (!present(root)) { fs.mkdirSync(root, { mode: 0o700 }); synchronize(path.dirname(root)); }
  directory(root);
  const descriptor: WorkspaceProject = { schema: 'evopilot-workspace-project/v1', id, templateVersion: '0.2.0', specifications: { ontology: 'v1', harness: 'v1' } };
  const marker = path.join(root, 'workspace-project.json');
  if (!present(marker)) exclusive(marker, descriptor); else validateProject(root, id);
  function makeDirectory(relative: string) {
    let target = root;
    for (const segment of relative.split('/').filter(Boolean)) {
      directory(target); target = path.join(target, segment);
      if (!present(target)) fs.mkdirSync(target, { mode: 0o700 });
      directory(target);
    }
  }
  for (const [relative, bytes] of templates) {
    const target = path.join(root, relative), parent = path.posix.dirname(relative);
    if (parent !== '.') makeDirectory(parent);
    // Initialization recovery never overwrites a user's existing file.
    if (!present(target)) exclusive(target, bytes); else readRegular(target);
  }
  for (const relative of ['public/ontology', 'public/harness', 'private/governance', 'private/projects']) makeDirectory(relative);
}
function publicState(c: InstallationConfiguration) {
  return { configured: c.workspaceRoot !== null, installationId: c.installationId, installationRoot: c.installationRoot, version: c.version, projectRoot: c.projectRoot,
    stateRoot: c.workspaceRoot, workspaceId: c.workspaceId, bindingPath: c.bindingPath, authority: false };
}
export function inspectWorkspace(configPath: string) {
  const c = loadInstallationConfiguration(configPath);
  return { ...publicState(c), setupPending: present(c.bindingPath + '.setup.json'), sessionActivationRequired: true };
}
export async function setupWorkspace(configPath: string, input: WorkspaceSetupInput, mode: 'initialize' | 'attach' = 'initialize') {
  if (!['initialize', 'attach'].includes(mode)) fail('SCHEMA');
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['requestId', 'projectRoot', 'stateRoot', 'workspaceId'].includes(k)) || typeof input.requestId !== 'string' || !idPattern.test(input.requestId)) fail('SCHEMA');
  if (mode === 'attach' && ['projectRoot', 'stateRoot', 'workspaceId'].some(k => typeof input[k as keyof WorkspaceSetupInput] !== 'string')) fail('SCHEMA');
  let c = loadInstallationConfiguration(configPath);
  const workspaceId = input.workspaceId ?? c.workspaceId ?? 'ws-' + digest(c.installationId + ':' + input.requestId).slice(0, 24);
  if (typeof workspaceId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(workspaceId)) fail('CONFIG_ID');
  const projectRoot = input.projectRoot ?? c.projectRoot ?? path.join(os.homedir(), 'evopilot-workspace');
  const stateRoot = input.stateRoot ?? c.workspaceRoot ?? path.join(os.homedir(), '.local/share/evopilot/workspaces', workspaceId);
  if (input.stateRoot === undefined && c.workspaceRoot === null) defaultParents(path.dirname(stateRoot));
  canonicalPath(projectRoot, true); validateStateRoot(stateRoot);
  disjoint(projectRoot, stateRoot, stateRoot + '.evopilot-control', stateRoot + '.evopilot-coordination', path.dirname(c.configPath));
  disjoint(projectRoot, codeRoot);
  const intent: SetupIntent = { schema: 'evopilot-workspace-binding/v1', installationId: c.installationId, installationDigest: c.identity.installationDigest,
    installationRoot: c.installationRoot, projectRoot, stateRoot, workspaceId, requestId: input.requestId, mode };
  const journal = c.bindingPath + '.setup.json';
  return withInstallationLease(c, input.requestId, async () => {
    c = loadInstallationConfiguration(configPath);
    if (c.workspaceRoot !== null) {
      if (c.workspaceRoot !== stateRoot || c.workspaceId !== workspaceId || (c.projectRoot !== null && c.projectRoot !== projectRoot)) fail('WORKSPACE_ALREADY_BOUND');
      if (c.projectRoot !== null) {
        if (present(journal)) {
          const pending = JSON.parse(readRegular(journal, 16384, true).toString());
          fields(pending, ['schema', 'installationId', 'installationDigest', 'installationRoot', 'projectRoot', 'stateRoot', 'workspaceId', 'requestId', 'mode']);
          const { mode: pendingMode, ...pendingBinding } = pending;
          if (!['initialize', 'attach'].includes(String(pendingMode)) || canonicalJSON(pendingBinding) !== canonicalJSON(JSON.parse(readRegular(c.bindingPath, 16384, true).toString()))) fail('SETUP_CONFLICT');
          fs.unlinkSync(journal); synchronize(path.dirname(journal));
        }
        return { ...publicState(c), reused: true, sessionActivationRequired: true };
      }
      if (mode !== 'attach') fail('WORKSPACE_ALREADY_BOUND');
    }
    if (present(journal)) {
      if (canonicalJSON(JSON.parse(readRegular(journal, 16384, true).toString())) !== canonicalJSON(intent)) fail('SETUP_CONFLICT');
    } else {
      if (present(projectRoot)) {
        directory(projectRoot);
        if (fs.readdirSync(projectRoot).length) {
          if (mode !== 'attach') fail('PROJECT_OCCUPIED');
          validateProject(projectRoot, workspaceId);
        }
      }
      if (present(stateRoot)) {
        directory(stateRoot);
        if (mode === 'initialize' && fs.readdirSync(stateRoot).length) fail('WORKSPACE_OCCUPIED');
      }
      if (mode === 'attach') stateIdentity(stateRoot, workspaceId);
      if (present(stateRoot + '.evopilot-control/instance.json')) fail('CONNECTION_MUST_STOP');
      templateFiles(c);
      exclusive(journal, intent);
    }
    // Retained exact intent permits recovery after interruption, but never a different setup.
    if (mode === 'attach') stateIdentity(stateRoot, workspaceId);
    const bound: Configuration = { ...c, workspaceRoot: stateRoot, workspaceId, controlRoot: stateRoot + '.evopilot-control', identity: { ...c.identity, workspaceRoot: stateRoot, workspaceId } };
    await withWorkspaceLease(bound, input.requestId, async () => {
      if (present(stateRoot + '.evopilot-control/instance.json')) fail('CONNECTION_MUST_STOP');
      makeProject(projectRoot, workspaceId, templateFiles(c));
      const composition = createComposition({ workspaceRoot: stateRoot, workspaceId }, await loadInstalledProducts());
      try { for (const owner of ['runtime', 'harness', 'ontology'] as const) composition.inspect(owner, { visibility: 'public', projectId: 'shared' }); }
      finally { composition.close(); }
      stateIdentity(stateRoot, workspaceId);
      const { mode: _mode, ...binding } = intent;
      publishBinding(c.bindingPath, binding);
      fs.unlinkSync(journal); synchronize(path.dirname(journal));
    });
    c = loadInstallationConfiguration(configPath);
    return { ...publicState(c), reused: false, sessionActivationRequired: true };
  });
}
