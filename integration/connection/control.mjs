import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { canonicalPath, canonicalJSON, fields, readRegular, fail } from './config.mjs';

export const same = (a, b) => canonicalJSON(a) === canonicalJSON(b);
export function checkDirectory(c, create = false) {
  canonicalPath(c.controlRoot, true);
  if (create) { try { fs.mkdirSync(c.controlRoot, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; } }
  let st;
  try { st = fs.lstatSync(c.controlRoot); } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
  if (!st.isDirectory() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o700) fail('UNSAFE_CONTROL');
  return true;
}
function syncDirectory(c) { const fd = fs.openSync(c.controlRoot, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
export function readRecord(c) {
  if (!checkDirectory(c)) return null;
  let record;
  try { record = JSON.parse(readRegular(path.join(c.controlRoot, 'instance.json'), 16384, true)); }
  catch (e) { if (e.code === 'ENOENT') return null; fail('CONTROL_INVALID'); }
  fields(record, ['identity', 'nonce', 'token', 'pid', 'port', 'state', 'diagnostic']);
  if (!same(record.identity, c.identity)) fail('IDENTITY_CONFLICT');
  if (!/^[a-f0-9]{64}$/.test(record.nonce) || !/^[a-f0-9]{64}$/.test(record.token) || !Number.isSafeInteger(record.pid) || record.pid < 1 || !Number.isInteger(record.port) || record.port < 0 || record.port > 65535 || !['starting', 'ready', 'failed'].includes(record.state) || !(record.diagnostic === null || typeof record.diagnostic === 'string' && /^[A-Z_0-9]{1,80}$/.test(record.diagnostic))) fail('CONTROL_INVALID');
  if (record.state === 'ready' && record.port === 0) fail('CONTROL_INVALID');
  return record;
}
export function writeRecord(c, record, exclusive = false) {
  checkDirectory(c);
  if (exclusive && fs.existsSync(path.join(c.controlRoot, 'recovery.json'))) fail('RECOVERY_PENDING');
  const target = path.join(c.controlRoot, 'instance.json');
  const temporary = path.join(c.controlRoot, 'write-' + randomBytes(16).toString('hex'));
  const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(record)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try {
    if (exclusive) { fs.linkSync(temporary, target); fs.unlinkSync(temporary); }
    else {
      const old = readRecord(c);
      if (!old || old.nonce !== record.nonce) fail('OWNERSHIP');
      fs.renameSync(temporary, target);
    }
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  syncDirectory(c);
}
export function removeRecord(c, nonce) {
  const r = readRecord(c);
  if (!r || r.nonce !== nonce) fail('OWNERSHIP');
  fs.unlinkSync(path.join(c.controlRoot, 'instance.json'));
  syncDirectory(c);
}
export function processDead(pid) {
  try { process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; }
}
export function recoverRecord(c) {
  if (!checkDirectory(c)) return { recovered: false };
  const marker = path.join(c.controlRoot, 'recovery.json');
  let fd;
  try { fd = fs.openSync(marker, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600); }
  catch (e) { if (e.code === 'EEXIST') fail('RECOVERY_PENDING'); throw e; }
  const ownership = fs.fstatSync(fd);
  try {
    fs.writeFileSync(fd, JSON.stringify({ identity: c.identity, pid: process.pid })); fs.fsyncSync(fd);
    const r = readRecord(c);
    if (!r) return { recovered: false };
    if (!processDead(r.pid)) fail('PROCESS_NOT_PROVABLY_DEAD');
    removeRecord(c, r.nonce);
    return { recovered: true, identity: c.identity };
  } finally {
    fs.closeSync(fd);
    const current = fs.lstatSync(marker);
    if (current.ino !== ownership.ino || current.dev !== ownership.dev || current.isSymbolicLink()) fail('OWNERSHIP');
    fs.unlinkSync(marker); syncDirectory(c);
  }
}
