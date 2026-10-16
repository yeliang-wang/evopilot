import { lstat, readFile, mkdir, open, rename, unlink, mkdtemp, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, parse, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const CHILDREN = Object.freeze(['projects/evopilot-runtime', 'projects/evopilot-harness', 'projects/evopilot-ontology']);
const canonical = 'integration/compatibility/v1';
const names = ['reference.mjs', 'reference.d.mts', 'native.mjs', 'native.d.mts', 'manifest.json'];
const legacySha256 = 'df4f7246ae35ef9114e2b93663d520e7ff4f44f14f886ac8ba43e9fc080ddc9a';
const hex = bytes => createHash('sha256').update(bytes).digest('hex');

async function compileNative() {
  const output = await mkdtemp(resolve(tmpdir(), 'evopilot-native-contract-'));
  try {
    const result = spawnSync(process.execPath, [resolve(ROOT, 'node_modules/typescript/bin/tsc'), resolve(ROOT, canonical, 'native.mts'), '--outDir', output, '--target', 'ES2023', '--module', 'NodeNext', '--strict', '--declaration', '--noEmitOnError'], {cwd:ROOT,encoding:'utf8'});
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    return {'native.mjs':await readFile(resolve(output,'native.mjs')), 'native.d.mts':await readFile(resolve(output,'native.d.mts'))};
  } finally { await rm(output,{recursive:true,force:true}); }
}

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
  if (manifest.contractRevision !== '1.1.0' || manifest.module !== 'native.mjs' ||
      JSON.stringify(manifest.children) !== JSON.stringify(CHILDREN) ||
      manifest.sha256 !== hex(buffers['native.mjs']) || manifest.legacySha256 !== legacySha256 || hex(buffers['reference.mjs']) !== legacySha256 ||
      manifest.sourceSha256 !== hex(await readFile(resolve(ROOT,canonical,'native.mts'))) ||
      ['reference.d.mts','native.d.mts'].some(name => manifest.files?.[name] !== hex(buffers[name]))) {
    throw new Error('Canonical contract pin or declared child paths do not match; pins are never auto-refreshed');
  }
  const compiled = await compileNative();
  for (const name of Object.keys(compiled)) if (!compiled[name].equals(buffers[name])) throw new Error('Current native contract differs from strict TypeScript source: '+name);
  const source = buffers['native.mjs'].toString('utf8');
  if (!source.includes("export const NATIVE_CONTRACT_REVISION = '1.1.0';")) throw new Error('Contract revision mismatch');
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
  if (!check) {
    // This explicit canonical producer is the sole writer of current shared bytes.
    const generated = await compileNative();
    for (const [name,bytes] of Object.entries(generated)) await replaceAtomically(resolve(ROOT,canonical,name),bytes);
    const reference = await readFile(resolve(ROOT,canonical,'reference.mjs'));
    if (hex(reference)!==legacySha256) throw new Error('Historical reference bytes changed');
    const declaration = await readFile(resolve(ROOT,canonical,'reference.d.mts'));
    const manifest={contractRevision:'1.1.0',module:'native.mjs',sha256:hex(generated['native.mjs']),sourceSha256:hex(await readFile(resolve(ROOT,canonical,'native.mts'))),legacyModule:'reference.mjs',legacySha256,files:{'reference.d.mts':hex(declaration),'native.d.mts':hex(generated['native.d.mts'])},children:CHILDREN};
    await replaceAtomically(resolve(ROOT,canonical,'manifest.json'),Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
  }
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
