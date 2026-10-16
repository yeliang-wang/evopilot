import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { nativeBytesDigest, validateNativePackage } from '../../dist/integration/compatibility/v1/native.mjs';
import { nativePackage } from '../../projects/evopilot-ontology/tests/fixtures/native/package.mjs';

test('native package manifests reject permutation, duplicate and case-collision before owner work', () => {
  const pkg = nativePackage(); validateNativePackage(pkg);
  const reversed = structuredClone(pkg); reversed.manifest.files.reverse();
  assert.throws(() => validateNativePackage(reversed), /sorted/);
  const duplicate = structuredClone(pkg); duplicate.manifest.files.push(duplicate.manifest.files[0]);
  assert.throws(() => validateNativePackage(duplicate));
  const collision = structuredClone(pkg), row = collision.manifest.files.find(f => f.path === 'model.ttl');
  collision.files['MODEL.ttl'] = collision.files['model.ttl']; collision.manifest.files.push({ ...row, path: 'MODEL.ttl' }); collision.manifest.files.sort((a,b) => a.path.localeCompare(b.path,'en'));
  assert.throws(() => validateNativePackage(collision), /Duplicate/);
});

test('independent owner distributions contain exact generated code, licenses and lock; standalone CLI fails closed offline', () => {
  const scratch = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'evopilot-independent-native-'));
  try {
    for (const owner of ['harness', 'ontology']) {
      const source = new URL(`../../projects/evopilot-${owner}/vendor/compatibility/v1/`, import.meta.url);
      const root = path.join(scratch, owner); fs.mkdirSync(root, { mode: 0o700 });
      fs.cpSync(source, root, { recursive: true });
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
      const toolchain = path.join(root, 'toolchain'), manifest = JSON.parse(fs.readFileSync(path.join(toolchain, 'manifest.json')));
      for (const entry of manifest.files) assert.equal(nativeBytesDigest(fs.readFileSync(path.join(toolchain, entry.path))).slice(7), entry.sha256);
      const cli = path.join(toolchain, 'cli.js'), run = args => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 10000 });
      const lock = run(['lock']); assert.equal(lock.status, 0, lock.stderr); assert.equal(JSON.parse(lock.stdout).productVersion, '0.3.0');
      const missing = run(['prepare', '--cache', path.join(scratch, owner + '-cache'), '--offline']);
      assert.equal(missing.status, 1); assert.match(missing.stderr, /missing a locked artifact/); assert.equal(missing.stdout, '');
      const injected = run(['prepare', '--cache', path.join(scratch, owner + '-cache'), '--url', 'https://example.invalid/arbitrary']);
      assert.equal(injected.status, 1); assert.match(injected.stderr, /Unknown/);
    }
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
});
