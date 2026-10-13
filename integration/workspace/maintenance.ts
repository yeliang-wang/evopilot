/** Consistent Workspace maintenance; caller holds the connection maintenance lease. */
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { inspectWorkspaceSnapshot as inspectRuntime, relocateWorkspaceSnapshot as relocateRuntime } from '@evopilot-next/runtime/workspace-migration';
import { inspectWorkspaceSnapshot as inspectHarness, relocateWorkspaceSnapshot as relocateHarness } from '@evopilot-next/harness/workspace-migration';
import { inspectWorkspaceSnapshot as inspectOntology, relocateWorkspaceSnapshot as relocateOntology } from '@evopilot-next/ontology/workspace-migration';
import type { WorkspaceSnapshot as RuntimeSnapshot } from '@evopilot-next/runtime/workspace-migration';
import type { WorkspaceSnapshot as HarnessSnapshot } from '@evopilot-next/harness/workspace-migration';
import type { WorkspaceSnapshot as OntologySnapshot } from '@evopilot-next/ontology/workspace-migration';
import { canonicalJSON, canonicalPath, codeRoot, digest, fail, fields, outsideGit, readRegular, validateProject, validateStateRoot } from '../connection/config.js';
import type { ProjectContext } from './project.js';
export type { ProjectContext } from './project.js';

export type MaintenanceOperation = 'backup' | 'restore' | 'migrate';
export interface OwnerSnapshots { runtime: RuntimeSnapshot; harness: HarnessSnapshot; ontology: OntologySnapshot }
interface FileEntry { path: string; kind: 'file' | 'directory'; bytes: number; sha256: string }
interface WorkspaceLocation { projectRoot: string; stateRoot: string; workspaceId: string }
interface BackupManifest {
  schema: 'evopilot-workspace-backup/v1'; source: WorkspaceLocation; createdAt: string; requestId: string;
  ownerUid: number; project: FileEntry[]; state: FileEntry[]; ownerSnapshots: OwnerSnapshots;
  requiredKeyIds: string[]; manifestDigest: string;
}
export interface MaintenanceResult {
  schema: 'evopilot-workspace-maintenance-result/v1'; requestId: string; operation: MaintenanceOperation;
  status: 'VERIFIED'; source: WorkspaceLocation; destination: WorkspaceLocation | { backupRoot: string };
  manifestDigest: string; ownerSnapshots: OwnerSnapshots; requiredKeyIds: string[]; completedAt: string; authority: false;
}
interface Journal {
  schema: 'evopilot-workspace-maintenance-journal/v1'; requestId: string; intentDigest: string;
  operation: MaintenanceOperation; status: 'PREPARED' | 'COPYING' | 'VERIFYING' | 'VERIFIED' | 'INTERRUPTED';
  source: WorkspaceLocation; destinations: string[]; manifest: BackupManifest | null; copied: boolean;
  result: MaintenanceResult | null; lastError: string | null;
}
const fileLimit = 64 * 1048576, totalLimit = 512 * 1048576, entryLimit = 20000;
const owners = ['runtime', 'harness', 'ontology'] as const;
const relocation = { runtime: relocateRuntime, harness: relocateHarness, ontology: relocateOntology };
const equal = (a: unknown, b: unknown) => canonicalJSON(a) === canonicalJSON(b);
const location = (context: ProjectContext): WorkspaceLocation => ({ projectRoot: context.projectRoot, stateRoot: context.stateRoot, workspaceId: context.workspaceId });
function stat(filename: string) { try { return fs.lstatSync(filename); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }
function slug(value: unknown): asserts value is string { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) fail('MAINTENANCE_ID'); }
function disjoint(roots: string[]) {
  for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) if (roots[i] === roots[j] || roots[i].startsWith(roots[j] + path.sep) || roots[j].startsWith(roots[i] + path.sep)) fail('MAINTENANCE_LOCATION');
}
function privateDirectory(root: string) {
  canonicalPath(root); const s = fs.lstatSync(root);
  if (!s.isDirectory() || s.uid !== process.getuid?.() || (s.mode & 0o777) !== 0o700) fail('MAINTENANCE_PERMISSIONS');
}
function target(root: unknown, gitAllowed = false): string {
  const result = canonicalPath(root, true); if (!gitAllowed) outsideGit(result);
  if (result === codeRoot || result.startsWith(codeRoot + path.sep) || codeRoot.startsWith(result + path.sep)) fail('MAINTENANCE_LOCATION');
  if (result === path.parse(result).root) fail('MAINTENANCE_LOCATION');
  if (stat(result)) privateDirectory(result);
  return result;
}
function syncDir(root: string) { const fd = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function mkdir(root: string) { if (!stat(root)) { fs.mkdirSync(root, { mode: 0o700 }); syncDir(path.dirname(root)); } privateDirectory(root); }
function jsonFile(filename: string): unknown { return JSON.parse(readRegular(filename, 32 * 1048576, true).toString()); }
function save(filename: string, value: unknown, replace = true) {
  const bytes = canonicalJSON(value) + '\n';
  if (Buffer.byteLength(bytes) > 32 * 1048576) fail('MAINTENANCE_LIMIT');
  if (!replace && stat(filename)) { if (readRegular(filename, 32 * 1048576, true).toString() !== bytes) fail('MAINTENANCE_CONFLICT'); return; }
  const temporary = filename + '.pending-' + randomBytes(12).toString('hex');
  const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(temporary, filename); syncDir(path.dirname(filename)); } catch (error) { try { fs.unlinkSync(temporary); } catch {} throw error; }
}
function safeRelative(value: string) {
  if (!value || path.isAbsolute(value) || value.includes('\\') || value.split('/').some(part => !part || part === '.' || part === '..')) fail('MAINTENANCE_PATH');
}
function inventory(root: string): FileEntry[] {
  privateDirectory(root); let total = 0; const output: FileEntry[] = [];
  const visit = (directory: string) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const filename = path.join(directory, name), relative = filename.slice(root.length + 1); safeRelative(relative); canonicalPath(filename);
      const s = fs.lstatSync(filename);
      if (s.uid !== process.getuid?.() || (s.mode & 0o022) || s.isSymbolicLink()) fail('MAINTENANCE_PERMISSIONS');
      if (output.length >= entryLimit) fail('MAINTENANCE_LIMIT');
      if (s.isDirectory()) { output.push({ path: relative, kind: 'directory', bytes: 0, sha256: '' }); visit(filename); }
      else {
        if (!s.isFile() || s.nlink !== 1 || s.size > fileLimit || (total += s.size) > totalLimit) fail('MAINTENANCE_LIMIT');
        const bytes = readRegular(filename, fileLimit);
        if (bytes.length !== s.size) fail('MAINTENANCE_DRIFT');
        output.push({ path: relative, kind: 'file', bytes: bytes.length, sha256: digest(bytes) });
      }
    }
  };
  visit(root); return output.sort((a, b) => a.path.localeCompare(b.path));
}
function ensureEmpty(root: string) { if (stat(root) && fs.readdirSync(root).length) fail('MAINTENANCE_DESTINATION_NOT_EMPTY'); }
function copyInventory(source: string, destination: string, entries: FileEntry[], requestId: string) {
  mkdir(destination);
  // Staging stays on the destination filesystem so final publication is atomic.
  const stageName = '.evopilot-copy-' + requestId, stage = path.join(destination, stageName);
  if (entries.some(entry => entry.path === stageName || entry.path.startsWith(stageName + '/'))) fail('MAINTENANCE_PARTIAL_CONFLICT');
  const expected = new Map(entries.map(entry => [entry.path, entry]));
  const staged = new Map(entries.filter(entry => entry.kind === 'file').map(entry => [digest(canonicalJSON({ destination, requestId, path: entry.path, sha256: entry.sha256 })), entry]));
  const originalInventory = inventory(destination);
  for (const present of originalInventory) {
    if (present.path === stageName || present.path.startsWith(stageName + '/')) continue;
    if (!equal(expected.get(present.path), present)) fail('MAINTENANCE_PARTIAL_CONFLICT');
  }
  mkdir(stage);
  for (const name of fs.readdirSync(stage)) {
    const entry = staged.get(name);
    if (!entry) fail('MAINTENANCE_PARTIAL_CONFLICT');
    const partial = readRegular(path.join(stage, name), fileLimit, true), complete = readRegular(path.join(source, entry.path), fileLimit);
    if (complete.length !== entry.bytes || digest(complete) !== entry.sha256 || partial.length > complete.length || !partial.equals(complete.subarray(0, partial.length))) fail('MAINTENANCE_PARTIAL_CONFLICT');
  }
  // Tree order is explicit: a lexical child cannot precede its parent.
  for (const entry of [...entries].sort((a, b) => a.path.split('/').length - b.path.split('/').length || Number(!['workspace-project.json', 'workspace.json'].includes(a.path)) - Number(!['workspace-project.json', 'workspace.json'].includes(b.path)) || a.path.localeCompare(b.path))) {
    const from = path.join(source, entry.path), to = path.join(destination, entry.path); safeRelative(entry.path);
    if (entry.kind === 'directory') { mkdir(to); continue; }
    const temporary = path.join(stage, digest(canonicalJSON({ destination, requestId, path: entry.path, sha256: entry.sha256 })));
    if (stat(to)) { if (stat(temporary)) { fs.unlinkSync(temporary); syncDir(stage); } continue; }
    const bytes = readRegular(from, fileLimit);
    if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) fail('MAINTENANCE_DRIFT');
    if (stat(temporary)) { fs.unlinkSync(temporary); syncDir(stage); } // Validated exact expected prefix above.
    const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (stat(to)) fail('MAINTENANCE_PARTIAL_CONFLICT');
    fs.renameSync(temporary, to); syncDir(path.dirname(to)); syncDir(stage);
  }
  fs.rmdirSync(stage); syncDir(destination);
  if (!equal(inventory(destination), entries)) fail('MAINTENANCE_COPY_DIFFERENT');
}
function snapshots(stateRoot: string, workspaceId: string): OwnerSnapshots {
  const options = { workspaceRoot: stateRoot, workspaceId };
  return { runtime: inspectRuntime(options), harness: inspectHarness(options), ontology: inspectOntology(options) };
}
function keyIds(snapshots: OwnerSnapshots): string[] { return [...new Set(owners.flatMap(owner => snapshots[owner].requiredKeyIds))].sort(); }
function requireReconciled(snapshots: OwnerSnapshots) {
  if (owners.some(owner => snapshots[owner].unresolved.some(item => item.nextAction === 'RECONCILE_OR_CANCEL'))) fail('MIGRATION_RECONCILIATION_REQUIRED');
}
function retainedKeys(ids: string[]) {
  if (!Array.isArray(ids) || ids.length > 192) fail('MAINTENANCE_KEYS');
  for (const id of ids) {
    if (!/^[a-f0-9]{64}$/.test(id)) fail('MAINTENANCE_KEYS');
    const directory = path.join(homedir(), '.local', 'share', 'evopilot', 'relocation-keys');
    const file = path.join(directory, id + '.key');
    if (!stat(directory) || !stat(file)) fail('MISSING_RELOCATION_KEY');
    canonicalPath(directory); privateDirectory(directory); canonicalPath(file); const s = fs.lstatSync(file);
    if (!s.isFile() || s.nlink !== 1 || s.uid !== process.getuid?.() || (s.mode & 0o777) !== 0o600 || s.size !== 32) fail('MISSING_RELOCATION_KEY');
  }
}
function maintenanceRoot(context: ProjectContext, create = false): string {
  const root = target(context.stateRoot + '.evopilot-maintenance');
  disjoint([root, context.projectRoot, context.stateRoot, context.installationRoot]);
  if (create) { mkdir(root); for (const name of ['requests', 'known-backups']) mkdir(path.join(root, name)); }
  else privateDirectory(root);
  return root;
}
function validateContext(context: ProjectContext, restoring: boolean) {
  fields(context, ['projectRoot','stateRoot','workspaceId','installationRoot']); slug(context.workspaceId);
  canonicalPath(context.installationRoot); target(context.projectRoot, true); validateStateRoot(context.stateRoot);
  disjoint([context.projectRoot, context.stateRoot, context.installationRoot]);
  if (!restoring) { validateProject(context.projectRoot, context.workspaceId); privateDirectory(context.stateRoot); }
}
function manifest(context: ProjectContext, requestId: string): BackupManifest {
  const before = snapshots(context.stateRoot, context.workspaceId);
  const project = inventory(context.projectRoot), state = inventory(context.stateRoot);
  const after = snapshots(context.stateRoot, context.workspaceId);
  if (!equal(before, after) || !equal(project, inventory(context.projectRoot)) || !equal(state, inventory(context.stateRoot))) fail('MAINTENANCE_SOURCE_CHANGED');
  const subject = { schema: 'evopilot-workspace-backup/v1' as const, source: location(context), createdAt: new Date().toISOString(), requestId, ownerUid: process.getuid!(), project, state, ownerSnapshots: before, requiredKeyIds: keyIds(before) };
  return { ...subject, manifestDigest: digest(canonicalJSON(subject)) };
}
function unchangedSource(context: ProjectContext, saved: BackupManifest) {
  if (!equal(snapshots(context.stateRoot, context.workspaceId), saved.ownerSnapshots) || !equal(inventory(context.projectRoot), saved.project) || !equal(inventory(context.stateRoot), saved.state)) fail('MAINTENANCE_SOURCE_CHANGED');
}
function retainedStateFiles(entries: FileEntry[]): FileEntry[] {
  // Owners may add lineage only to their exact database files and the shared
  // identity marker. Every other copied byte, including user evidence, is fixed.
  const mutable = new Set(['workspace.json', ...owners.flatMap(owner =>
    ['', '-wal', '-shm', '-journal'].map(suffix => `state/${owner}/${owner}.db${suffix}`))]);
  return entries.filter(entry => entry.kind !== 'file' || !mutable.has(entry.path));
}
function loadBackup(context: ProjectContext, backupRoot: string): BackupManifest {
  privateDirectory(backupRoot); outsideGit(backupRoot);
  const value = jsonFile(path.join(backupRoot, 'manifest.json'));
  fields(value, ['schema','source','createdAt','requestId','ownerUid','project','state','ownerSnapshots','requiredKeyIds','manifestDigest']);
  const saved = value as unknown as BackupManifest, { manifestDigest, ...subject } = saved;
  if (saved.schema !== 'evopilot-workspace-backup/v1' || saved.ownerUid !== process.getuid!() || !equal(saved.source, location(context)) || !/^[a-f0-9]{64}$/.test(manifestDigest) || manifestDigest !== digest(canonicalJSON(subject))) fail('MAINTENANCE_BACKUP_IDENTITY');
  const index = jsonFile(path.join(maintenanceRoot(context), 'known-backups', manifestDigest + '.json'));
  if (!equal(index, { schema: 'evopilot-known-backup/v1', backupRoot, source: saved.source, manifestDigest })) fail('MAINTENANCE_BACKUP_UNKNOWN');
  if (!equal(fs.readdirSync(backupRoot).sort(), ['manifest.json','project','state']) || !equal(inventory(path.join(backupRoot, 'project')), saved.project) || !equal(inventory(path.join(backupRoot, 'state')), saved.state)) fail('MAINTENANCE_BACKUP_CHANGED');
  if (!equal(keyIds(saved.ownerSnapshots), saved.requiredKeyIds)) fail('MAINTENANCE_KEYS'); retainedKeys(saved.requiredKeyIds); return saved;
}
export function inspectWorkspaceBackup(context: ProjectContext, backupRoot: string) {
  validateContext(context, true); target(backupRoot);
  disjoint([backupRoot, context.projectRoot, context.stateRoot, context.installationRoot, context.stateRoot + '.evopilot-maintenance']);
  const saved = loadBackup(context, backupRoot);
  return { schema: 'evopilot-workspace-backup-inspection/v1' as const, status: 'VERIFIED' as const, backupRoot, source: saved.source, manifestDigest: saved.manifestDigest, ownerSnapshots: saved.ownerSnapshots, requiredKeyIds: saved.requiredKeyIds, authority: false as const };
}
export function maintainWorkspace(context: ProjectContext, operation: MaintenanceOperation, input: unknown, requestId: string): MaintenanceResult {
  slug(requestId); if (!['backup','restore','migrate'].includes(operation)) fail('MAINTENANCE_OPERATION'); validateContext(context, operation === 'restore');
  let roots: string[], backupRoot: string | null = null;
  if (operation === 'backup') { fields(input, ['destinationRoot']); roots = [target(input.destinationRoot)]; backupRoot = roots[0]; }
  else if (operation === 'restore') { fields(input, ['backupRoot']); backupRoot = target(input.backupRoot); roots = [context.projectRoot, context.stateRoot]; }
  else { fields(input, ['destinationProjectRoot','destinationStateRoot']); roots = [target(input.destinationProjectRoot, true), target(input.destinationStateRoot)]; }
  if (operation === 'migrate') requireReconciled(snapshots(context.stateRoot, context.workspaceId));
  const control = maintenanceRoot(context, true);
  disjoint(operation === 'restore' ? [backupRoot!, context.projectRoot, context.stateRoot, context.installationRoot, control] : [...roots, context.projectRoot, context.stateRoot, context.installationRoot, control]);
  const journalPath = path.join(control, 'requests', requestId + '.json'), intentDigest = digest(canonicalJSON({ source: location(context), operation, input }));
  let journal: Journal;
  if (stat(journalPath)) {
    journal = jsonFile(journalPath) as Journal;
    if (journal.schema !== 'evopilot-workspace-maintenance-journal/v1' || journal.requestId !== requestId || journal.intentDigest !== intentDigest || journal.operation !== operation || !equal(journal.source, location(context)) || !equal(journal.destinations, roots)) fail('MAINTENANCE_REQUEST_CONFLICT');
    if (journal.status === 'VERIFIED' && journal.result) return journal.result;
  } else {
    for (const root of roots) ensureEmpty(root);
    journal = { schema: 'evopilot-workspace-maintenance-journal/v1', requestId, intentDigest, operation, status: 'PREPARED', source: location(context), destinations: roots, manifest: null, copied: false, result: null, lastError: null };
    save(journalPath, journal, false);
  }
  try {
    if (!journal.manifest) {
      journal.manifest = operation === 'restore' ? loadBackup(context, backupRoot!) : manifest(context, requestId);
      save(journalPath, journal);
    }
    const saved = journal.manifest;
    if (operation === 'migrate') requireReconciled(saved.ownerSnapshots);
    if (operation === 'restore') { const verified = loadBackup(context, backupRoot!); if (!equal(saved, verified)) fail('MAINTENANCE_BACKUP_CHANGED'); }
    else unchangedSource(context, saved);
    if (!journal.copied) {
      journal.status = 'COPYING'; save(journalPath, journal);
      if (operation === 'backup') { mkdir(roots[0]); copyInventory(context.projectRoot, path.join(roots[0], 'project'), saved.project, requestId); copyInventory(context.stateRoot, path.join(roots[0], 'state'), saved.state, requestId); save(path.join(roots[0], 'manifest.json'), saved, false); }
      else if (operation === 'restore') { copyInventory(path.join(backupRoot!, 'project'), roots[0], saved.project, requestId); copyInventory(path.join(backupRoot!, 'state'), roots[1], saved.state, requestId); }
      else { copyInventory(context.projectRoot, roots[0], saved.project, requestId); copyInventory(context.stateRoot, roots[1], saved.state, requestId); }
      journal.copied = true; journal.status = 'VERIFYING'; save(journalPath, journal);
    }
    let verified = saved.ownerSnapshots;
    if (operation === 'backup') {
      unchangedSource(context, saved);
      save(path.join(control, 'known-backups', saved.manifestDigest + '.json'), { schema: 'evopilot-known-backup/v1', backupRoot: roots[0], source: saved.source, manifestDigest: saved.manifestDigest }, false);
      loadBackup(context, roots[0]);
    } else if (operation === 'restore') {
      validateProject(context.projectRoot, context.workspaceId); verified = snapshots(context.stateRoot, context.workspaceId);
      if (!equal(verified, saved.ownerSnapshots) || !equal(inventory(context.projectRoot), saved.project) || !equal(inventory(context.stateRoot), saved.state)) fail('MAINTENANCE_RESTORE_DIFFERENT');
    } else {
      for (const owner of owners) relocation[owner]({ sourceRoot: context.stateRoot, destinationRoot: roots[1], workspaceId: context.workspaceId, expectedSnapshotDigest: saved.ownerSnapshots[owner].snapshotDigest });
      verified = snapshots(roots[1], context.workspaceId);
      for (const owner of owners) if (verified[owner].recordsDigest !== saved.ownerSnapshots[owner].recordsDigest || verified[owner].blobsDigest !== saved.ownerSnapshots[owner].blobsDigest) fail('MAINTENANCE_RELOCATION_DIFFERENT');
      if (!equal(inventory(roots[0]), saved.project)) fail('MAINTENANCE_PROJECT_CHANGED');
      if (!equal(retainedStateFiles(inventory(roots[1])), retainedStateFiles(saved.state))) fail('MAINTENANCE_RELOCATION_DIFFERENT');
      unchangedSource(context, saved);
      // Original-location backup anchors remain at the original maintenance root.
    }
    const result: MaintenanceResult = { schema: 'evopilot-workspace-maintenance-result/v1', requestId, operation, status: 'VERIFIED', source: saved.source, destination: operation === 'backup' ? { backupRoot: roots[0] } : { projectRoot: roots[0], stateRoot: roots[1], workspaceId: context.workspaceId }, manifestDigest: saved.manifestDigest, ownerSnapshots: verified, requiredKeyIds: keyIds(verified), completedAt: new Date().toISOString(), authority: false };
    journal.result = result; journal.status = 'VERIFIED'; journal.lastError = null; save(journalPath, journal); return result;
  } catch (error) {
    journal.status = 'INTERRUPTED'; journal.lastError = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'MAINTENANCE_FAILED'; save(journalPath, journal); throw error;
  }
}
