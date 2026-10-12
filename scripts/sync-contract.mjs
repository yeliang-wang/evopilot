import { lstat, readFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, parse, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const CHILDREN = Object.freeze(['projects/evopilot-runtime', 'projects/evopilot-harness', 'projects/evopilot-ontology']);
const canonical = 'integration/compatibility/v1';
const names = ['reference.mjs', 'manifest.json'];

// Check every ancestor, including those above ROOT, before reading or writing.
export async function assertNoSymlinks(path, allowMissing = false) {
  const full = resolve(path);
  let current = parse(full).root;
  for (const part of relative(current, full).split('/').filter(Boolean)) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlink forbidden: ${current}`);
    } catch (error) {
      if (allowMissing && error.code === 'ENOENT') continue;
      throw error;
    }
  }
}

export async function readCanonical() {
  const buffers = {};
  for (const name of names) {
    const path = resolve(ROOT, canonical, name);
    await assertNoSymlinks(path);
    buffers[name] = await readFile(path);
  }
  const manifest = JSON.parse(buffers['manifest.json']);
  if (manifest.contractRevision !== '1.0.0' || manifest.module !== 'reference.mjs' ||
      JSON.stringify(manifest.children) !== JSON.stringify(CHILDREN) ||
      manifest.sha256 !== createHash('sha256').update(buffers['reference.mjs']).digest('hex')) {
    throw new Error('Canonical contract pin or declared child paths do not match; pins are never auto-refreshed');
  }
  const source = buffers['reference.mjs'].toString('utf8');
  if (!source.includes("export const CONTRACT_REVISION = '1.0.0';")) throw new Error('Contract revision mismatch');
  return buffers;
}

async function replaceAtomically(path, bytes) {
  await assertNoSymlinks(path, true);
  await mkdir(dirname(path), { recursive: true });
  await assertNoSymlinks(path, true);
  const temporary = `${path}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o644);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await assertNoSymlinks(path, true);
    await rename(temporary, path);
  } finally {
    if (handle) await handle.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function syncContract({ check = false } = {}) {
  const buffers = await readCanonical();
  // Validate all destinations before making the first change.
  const destinations = CHILDREN.flatMap(child => names.map(name => ({ name, path: resolve(ROOT, child, 'vendor/compatibility/v1', name) })));
  for (const { path } of destinations) await assertNoSymlinks(path, true);
  for (const { name, path } of destinations) {
    if (check) {
      let actual;
      try { actual = await readFile(path); }
      catch (error) {
        if (error.code === 'ENOENT') throw new Error('Missing generated contract: run npm run build in the independent operator step');
        throw error;
      }
      if (!actual.equals(buffers[name])) throw new Error(`Generated contract differs from canonical pin: ${relative(ROOT, path)}`);
    } else {
      await replaceAtomically(path, buffers[name]);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) throw new Error('Usage: sync-contract.mjs [--check]');
    await syncContract({ check: args[0] === '--check' });
    console.log(args[0] === '--check' ? 'Pinned vendor copies verified' : 'Pinned vendor copies generated');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
