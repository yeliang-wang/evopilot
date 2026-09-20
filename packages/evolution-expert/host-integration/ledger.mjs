import fs from 'node:fs';
import path from 'node:path';
import { canonical, digest, requireThat } from './contracts.mjs';

// Non-secret tombstones survive every terminal result, process crash and restart.
// This is client replay suppression, NOT server idempotency.
export function ledger(root) {
  const dir = fs.lstatSync(root);
  requireThat(dir.isDirectory() && !dir.isSymbolicLink() && dir.uid === process.getuid() && (dir.mode & 0o077) === 0);
  requireThat(fs.realpathSync(root) === path.resolve(root));
  return {
    claim(binding, secretId) {
      const file = path.join(root, `${binding.requestId}.json`);
      const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      try { fs.writeFileSync(fd, canonical({bindingDigest:digest(binding), secretId, state:'CLAIMED_NO_REPLAY'})); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      const directory = fs.openSync(root, 'r');
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
      return true;
    }
  };
}
