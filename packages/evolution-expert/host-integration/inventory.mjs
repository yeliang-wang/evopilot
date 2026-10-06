import fs from 'node:fs';
import path from 'node:path';
import { digest, requireThat, exactKeys } from './contracts.mjs';

export function inventory(root) {
  const files = {};
  const visit = relative => {
    for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
      const rel = path.posix.join(relative, name);
      if (rel === 'manifest.json' || name === '.npmignore' || name === '.gitignore') continue;
      const stat = fs.lstatSync(path.join(root,rel));
      requireThat(!stat.isSymbolicLink());
      if (stat.isDirectory()) visit(rel);
      else { requireThat(stat.isFile()); files[rel] = digest(fs.readFileSync(path.join(root,rel))); }
    }
  };
  visit('');
  return files;
}
export function verifyInventory(root, expected) {
  const bytes = fs.readFileSync(path.join(root,'manifest.json'));
  requireThat(digest(bytes) === expected);
  const manifest = JSON.parse(bytes);
  exactKeys(manifest, ['schema','expertVersion','runtimeVersion','platforms','files']);
  requireThat(manifest.schema === 'evopilot-expert-host-integration/v1' && manifest.expertVersion === '2.3.1' && manifest.runtimeVersion === '6.3.0');
  requireThat(JSON.stringify(manifest.platforms) === '["darwin-arm64"]');
  requireThat(digest(manifest.files) === digest(inventory(root)));
  requireThat(typeof manifest.files['dist/darwin-arm64/secure-input'] === 'string');
  return expected;
}
