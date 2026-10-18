import { rm, mkdir, copyFile, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readCanonical, syncContract } from './sync-contract.mjs';
import { syncToolchain } from './sync-toolchain.mjs';
import {syncFeedback} from './sync-feedback.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await readCanonical();
await syncContract({ check: true });
await syncToolchain({ check: true });
await syncFeedback({check:true});
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const target = new URL('../dist/integration/compatibility/v1/', import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ['reference.mjs', 'manifest.json', 'reference.d.mts', 'native.mjs', 'native.d.mts', 'decision-evidence.mjs', 'decision-evidence.d.mts']) {
  await copyFile(new URL('../integration/compatibility/v1/' + name, import.meta.url), new URL(name, target));
}
const toolchain = new URL('../dist/integration/toolchain/', import.meta.url);
await mkdir(toolchain, { recursive: true });
for (const name of ['toolchain.lock.json', 'requirements.lock', 'conftest-dependencies.json', 'opa-dependencies.json', 'licenses']) {
  await cp(new URL('../integration/toolchain/' + name, import.meta.url), new URL(name, toolchain), { recursive: true });
}

await cp(new URL('../integration/compatibility/feedback/', import.meta.url),new URL('../dist/integration/compatibility/feedback/', import.meta.url),{recursive:true});
