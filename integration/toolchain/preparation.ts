import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { withWorkspaceMaintenance } from '../connection/client.js';
import { canonicalPath, canonicalJSON, readRegular, loadConfiguration, fail } from '../connection/config.js';
import { errorCode } from '../types.js';
import { inspectBundledToolchainLock, prepareNativeToolchain } from './locked.js';

interface Preparation {
  schema: 'evopilot-toolchain-preparation/v1';
  requestId: string;
  workspaceId: string;
  workspaceRoot: string;
  installationDigest: string;
  lockDigest: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  startedAt: string;
  completedAt: string | null;
  diagnostic: string | null;
}
const active = new Map<string, Promise<void>>();
const slug = (value: string) => { if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) fail('SCHEMA'); };
function directory(root: string, create = false) {
  canonicalPath(root, create);
  if (create && !fs.existsSync(root)) fs.mkdirSync(root, { mode: 0o700 });
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.uid !== process.getuid!() || (stat.mode & 0o777) !== 0o700) fail('TOOLCHAIN_PREPARATION_UNSAFE');
}
function journalRoot(configPath: string) {
  const c = loadConfiguration(configPath);
  return { c, root: path.join(c.workspaceRoot, 'native-toolchain-preparation') };
}
function records(root: string): Preparation[] {
  if (!fs.existsSync(root)) { canonicalPath(root, true); return []; }
  directory(root);
  const names = fs.readdirSync(root);
  if (names.length > 1000) fail('TOOLCHAIN_PREPARATION_LIMIT');
  return names.map(name => {
    if (!/^[a-z0-9][a-z0-9-]{0,63}\.json$/.test(name)) fail('TOOLCHAIN_PREPARATION_UNSAFE');
    const value: unknown = JSON.parse(readRegular(path.join(root, name), 16384, true).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('TOOLCHAIN_PREPARATION_INVALID');
    const r = value as Preparation;
    if (Object.keys(r).sort().join('|') !== ['schema','requestId','workspaceId','workspaceRoot','installationDigest','lockDigest','status','startedAt','completedAt','diagnostic'].sort().join('|')
      || r.schema !== 'evopilot-toolchain-preparation/v1' || name !== r.requestId + '.json'
      || !['RUNNING','SUCCEEDED','FAILED'].includes(r.status) || typeof r.startedAt !== 'string'
      || !/^[a-f0-9]{64}$/.test(r.installationDigest) || !/^sha256:[a-f0-9]{64}$/.test(r.lockDigest)
      || typeof r.workspaceId !== 'string' || typeof r.workspaceRoot !== 'string'
      || (r.status === 'RUNNING' ? r.completedAt !== null || r.diagnostic !== null : typeof r.completedAt !== 'string')
      || (r.status === 'FAILED' ? typeof r.diagnostic !== 'string' : r.diagnostic !== null)) fail('TOOLCHAIN_PREPARATION_INVALID');
    return r;
  }).sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.requestId.localeCompare(b.requestId));
}
function save(root: string, record: Preparation) {
  const filename = path.join(root, record.requestId + '.json');
  if (fs.existsSync(filename)) readRegular(filename, 16384, true);
  const temporary = filename + '.' + randomUUID();
  fs.writeFileSync(temporary, canonicalJSON(record), { flag: 'wx', mode: 0o600 });
  try { fs.renameSync(temporary, filename); } finally { fs.rmSync(temporary, { force: true }); }
}
function publicRecord(root: string, r: Preparation) {
  return { ...r, status: r.status === 'RUNNING' && !active.has(path.join(root, r.requestId)) ? 'UNKNOWN' : r.status,
    nextAction: r.status === 'SUCCEEDED' ? 'toolchain_inspect' : r.status === 'FAILED' ? 'review_failure_before_new_request' : 'toolchain_inspect', authority: false };
}
/** A retained RUNNING record from another process is uncertain, never permission to retry. */
export function inspectToolchainPreparation(configPath: string) {
  const { c, root } = journalRoot(configPath), all = records(root);
  if (all.some(r => r.workspaceId !== c.workspaceId || r.workspaceRoot !== c.workspaceRoot)) fail('TOOLCHAIN_PREPARATION_IDENTITY');
  return all.length ? publicRecord(root, all.at(-1)!) : null;
}
/** Return after admission. The bounded download continues while the MCP adapter is alive. */
export async function startToolchainPreparation(configPath: string, requestId: string) {
  slug(requestId);
  const { c, root } = journalRoot(configPath), lock = inspectBundledToolchainLock(), key = path.join(root, requestId);
  const existing = records(root), previous = existing.find(r => r.requestId === requestId);
  if (previous) {
    if (previous.workspaceRoot !== c.workspaceRoot || previous.workspaceId !== c.workspaceId || previous.installationDigest !== c.identity.installationDigest || previous.lockDigest !== lock.lockDigest) fail('REQUEST_CONFLICT');
    return { preparation: publicRecord(root, previous), reused: true, authority: false };
  }
  if (existing.some(r => r.status === 'RUNNING')) fail('TOOLCHAIN_PREPARATION_UNCERTAIN');
  let admitted!: () => void, rejectAdmission!: (error: unknown) => void;
  const admission = new Promise<void>((resolve, reject) => { admitted = resolve; rejectAdmission = reject; });
  const task = withWorkspaceMaintenance(configPath, requestId, async current => {
    directory(root, true);
    const prior = records(root);
    if (prior.some(r => r.status === 'RUNNING')) fail('TOOLCHAIN_PREPARATION_UNCERTAIN');
    if (prior.some(r => r.requestId === requestId)) fail('REQUEST_CONFLICT');
    if (prior.length >= 1000) fail('TOOLCHAIN_PREPARATION_LIMIT');
    const record: Preparation = { schema: 'evopilot-toolchain-preparation/v1', requestId, workspaceId: current.workspaceId,
      workspaceRoot: current.workspaceRoot, installationDigest: current.identity.installationDigest, lockDigest: lock.lockDigest,
      status: 'RUNNING', startedAt: new Date().toISOString(), completedAt: null, diagnostic: null };
    save(root, record); admitted();
    try {
      await prepareNativeToolchain({ cacheRoot: path.join(current.workspaceRoot, 'native-toolchain') });
      record.status = 'SUCCEEDED';
    } catch (error) {
      record.status = 'FAILED';
      const code = errorCode(error) ?? '';
      record.diagnostic = /^TOOLCHAIN_[A-Z0-9_]+$/.test(code) ? code : 'TOOLCHAIN_PREPARATION_FAILED';
    }
    record.completedAt = new Date().toISOString(); save(root, record);
  }).catch(rejectAdmission).finally(() => { active.delete(key); });
  active.set(key, task);
  await admission;
  return { preparation: publicRecord(root, records(root).find(r => r.requestId === requestId)!), reused: false, authority: false };
}
