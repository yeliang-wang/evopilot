import { rm, mkdir, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readCanonical, syncContract } from './sync-contract.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await readCanonical();
await syncContract({ check: true });
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const target = new URL('../dist/integration/compatibility/v1/', import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ['reference.mjs', 'manifest.json', 'reference.d.mts']) {
  await copyFile(new URL('../integration/compatibility/v1/' + name, import.meta.url), new URL(name, target));
}
