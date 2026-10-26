import assert from 'node:assert/strict';
import { writeFile, lstat, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ROOT, CHILDREN, readCanonical, assertNoSymlinks } from './sync-contract.mjs';
import { readFile } from 'node:fs/promises';

function git(cwd, ...args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const result = spawnSync('git', ['-C', cwd, ...args], { env, encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
async function repository(root) {
  await assertNoSymlinks(root);
  await lstat(resolve(root, '.git')); // Never discover an enclosing repository.
  assert.equal(await realpath(git(root, 'rev-parse', '--show-toplevel')), await realpath(root), 'Inherited Git repository');
  assert.equal(git(root, 'rev-parse', '--is-inside-work-tree'), 'true');
  assert.equal(git(root, 'status', '--porcelain=v1', '--untracked-files=all'), '', 'Dirty or untracked source: ' + root);
  const head = git(root, 'rev-parse', '--verify', 'HEAD^{commit}');
  assert(/^[0-9a-f]{40,64}$/.test(head));
  return head;
}
export async function componentLock() {
  const parentSourceCommit = await repository(ROOT);
  const canonical = JSON.parse((await readCanonical())['manifest.json']);
  const components = [];
  const gitDirectories = new Set([await realpath(git(ROOT, 'rev-parse', '--absolute-git-dir'))]);
  for (const path of CHILDREN) {
    const root = resolve(ROOT, path), commit = await repository(root);
    const gitDirectory = await realpath(git(root, 'rev-parse', '--absolute-git-dir'));
    assert(!gitDirectories.has(gitDirectory), 'Reused Git directory'); gitDirectories.add(gitDirectory);
    const index = git(ROOT, 'ls-files', '--stage', '--', path);
    assert.equal(index, '160000 ' + commit + ' 0\t' + path, 'Parent index gitlink must match child HEAD');
    const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
    assert.equal(pkg.name, '@evopilot-next/' + path.slice('projects/evopilot-'.length));
    assert.equal(pkg.version, '0.8.1');
    components.push({ path, name: pkg.name, version: pkg.version, commit });
  }
  return { schema: 'evopilot-local-component-lock/v1', parentSourceCommit,
    sharedContractSHA256: canonical.sha256, components, authority: false, acceptance: 'NOT_INFERRED' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') console.log('Usage: node scripts/lock-components.mjs [--out NEW_FILE]\nReports clean, populated local repositories and matching index gitlinks. No Git mutations.');
    else {
      assert(args.length === 0 || args.length === 2 && args[0] === '--out' && args[1] && !args[1].startsWith('-'), 'Expected --out NEW_FILE or no arguments');
      const out = args.length ? resolve(args[1]) : null;
      if (out) {
        await assertNoSymlinks(out, true);
        const source = await realpath(ROOT);
        assert(out !== source && !out.startsWith(source + sep), 'Output must be outside source');
      }
      const bytes = JSON.stringify(await componentLock(), null, 2) + '\n';
      if (out) await writeFile(out, bytes, { flag: 'wx' });
      else process.stdout.write(bytes);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

