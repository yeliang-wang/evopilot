import fs from 'node:fs';
import path from 'node:path';
import type { Configuration, InstallationConfiguration } from '../types.js';
import { errorCode } from '../types.js';
import { canonicalJSON, canonicalPath, fail, outsideGit, validateStateRoot } from '../connection/config.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function present(filename: string) { try { fs.lstatSync(filename); return true; } catch (error) { if (errorCode(error) === 'ENOENT') return false; throw error; } }
function safe(filename: string, directory: boolean) {
  canonicalPath(filename);
  const st = fs.lstatSync(filename);
  if (st.uid !== process.getuid!() || (st.mode & 0o777) !== (directory ? 0o700 : 0o600) || (directory ? !st.isDirectory() : !st.isFile() || st.nlink !== 1 || st.size > 1048576)) fail('UNSAFE_COORDINATION');
}
function check(root: string) {
  safe(root, true);
  for (const name of fs.readdirSync(root)) {
    if (!['lease.db', 'lease.db-journal'].includes(name)) fail('UNSAFE_COORDINATION');
    try { safe(path.join(root, name), false); } catch (error) { if (name !== 'lease.db-journal' || errorCode(error) !== 'ENOENT') throw error; }
  }
}
/** A real SQLite write transaction is the process-death-safe lease, not an advisory PID receipt. */
export async function withWorkspaceLease<T>(c: Configuration, requestId: string, callback: () => Promise<T>): Promise<T> {
  validateStateRoot(c.workspaceRoot);
  const subject = { schema: 'evopilot-workspace/v1', id: c.workspaceId, canonicalRoot: c.workspaceRoot, ownerUid: process.getuid!() };
  return lease(c.workspaceRoot + '.evopilot-coordination', subject, c.identity, requestId, callback);
}
/** Serializes one installation's initial binding and template changes without a pre-existing Workspace. */
export async function withInstallationLease<T>(c: InstallationConfiguration, requestId: string, callback: () => Promise<T>): Promise<T> {
  const subject = { schema: 'evopilot-installation-setup/v1', id: c.installationId, canonicalRoot: c.installationRoot, ownerUid: process.getuid!() };
  return lease(c.bindingPath + '.coordination', subject, c.identity, requestId, callback);
}
async function lease<T>(root: string, subject: unknown, owner: unknown, requestId: string, callback: () => Promise<T>): Promise<T> {
  if (typeof requestId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(requestId)) fail('SCHEMA');
  canonicalPath(root, true); outsideGit(root);
  try { fs.mkdirSync(root, { mode: 0o700 }); } catch (error) { if (errorCode(error) !== 'EEXIST') throw error; }
  check(root);
  const filename = path.join(root, 'lease.db');
  if (!present(filename)) {
    try { const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600); fs.closeSync(fd); }
    catch (error) { if (errorCode(error) !== 'EEXIST') throw error; }
  }
  safe(filename, false);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(filename, { timeout: 0, allowExtension: false }); db.enableDefensive(true);
  let held = false;
  const deadline = Date.now() + 10000;
  try {
    while (!held) {
      check(root);
      try { db.exec('BEGIN IMMEDIATE'); held = true; }
      catch (error) {
        const busy = error && typeof error === 'object' && 'errcode' in error && [5, 6].includes(Number(error.errcode));
        if (!busy) throw error;
        if (Date.now() >= deadline) fail('WORKSPACE_BUSY');
        await sleep(40);
      }
    }
    db.exec('CREATE TABLE IF NOT EXISTS workspace_lease (id INTEGER PRIMARY KEY CHECK(id=1), workspace TEXT NOT NULL, owner TEXT NOT NULL)');
    const workspace = canonicalJSON(subject);
    const previous = db.prepare('SELECT workspace FROM workspace_lease WHERE id=1').get();
    if (previous && previous.workspace !== workspace) fail('IDENTITY_CONFLICT');
    db.prepare('INSERT INTO workspace_lease (id,workspace,owner) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner').run(workspace, canonicalJSON({ installation: owner, requestId, pid: process.pid }));
    const value = await callback();
    db.prepare('UPDATE workspace_lease SET owner=? WHERE id=1').run('null');
    db.exec('COMMIT'); held = false;
    return value;
  } finally {
    if (held) { try { db.exec('ROLLBACK'); } catch {} }
    db.close(); check(root);
  }
}
