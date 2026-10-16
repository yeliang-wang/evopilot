import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { archivePath, readTarGz, readWheel } from '../../dist/integration/toolchain/archive.js';
import { inspectNativeToolchain, prepareNativeToolchain, inspectBundledToolchainLock } from '../../dist/integration/toolchain/locked.js';

test('native distribution paths and corrupt containers fail closed', () => {
  for (const value of ['../x', '/x', 'a/../../x', 'a\\b', 'a//b', 'C:x', 'a\0b']) assert.throws(() => archivePath(value));
  assert.equal(archivePath('python/lib/site.py'), 'python/lib/site.py');
  assert.throws(() => readTarGz(gzipSync(Buffer.alloc(512))), /empty tar/);
  assert.throws(() => readTarGz(gzipSync(Buffer.alloc(512, 1))), /tar/);
  assert.throws(() => readWheel(Buffer.alloc(100)), /ZIP/);
});

test('native toolchain requires preparation; doctor never fetches on cold/offline input', async () => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    assert.throws(() => inspectBundledToolchainLock(), { code: 'TOOLCHAIN_UNSUPPORTED_PLATFORM' }); return;
  }
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'evopilot-native-cold-'));
  try {
    assert.throws(() => inspectNativeToolchain({ cacheRoot: root }), { code: 'TOOLCHAIN_NOT_READY' });
    await assert.rejects(prepareNativeToolchain({ cacheRoot: root, offline: true }), { code: 'TOOLCHAIN_NOT_READY' });
    assert.deepEqual(fs.readdirSync(path.join(root, 'downloads')), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('failed locked downloads expose bounded diagnostics and never retain partial artifacts', async () => {
  const original = globalThis.fetch;
  for (const [code, failure] of [
    ['TOOLCHAIN_DOWNLOAD_TIMEOUT', new DOMException('synthetic timeout', 'TimeoutError')],
    ['TOOLCHAIN_DOWNLOAD_NETWORK', new TypeError('synthetic network details must not escape')],
    ['TOOLCHAIN_DOWNLOAD', null],
  ]) {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'evopilot-download-failure-'));
    try {
      globalThis.fetch = async () => { if (failure) throw failure; return new Response('unavailable', { status: 503 }); };
      await assert.rejects(prepareNativeToolchain({ cacheRoot: root }), error => {
        assert.equal(error.code, code); assert(!error.message.includes('synthetic'));
        return true;
      });
      assert.deepEqual(fs.readdirSync(root), ['downloads']);
      assert.deepEqual(fs.readdirSync(path.join(root, 'downloads')), []);
    } finally { globalThis.fetch = original; fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('a timed out response body retains no partial artifact or ready toolchain', async () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'evopilot-download-body-'));
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      assert(options.signal instanceof AbortSignal);
      return { ok: true, url: 'https://example.invalid/synthetic-locked-artifact',
        body: { async *[Symbol.asyncIterator]() {
          yield Buffer.from('synthetic partial download');
          throw new DOMException('synthetic body timeout', 'TimeoutError');
        } } };
    };
    await assert.rejects(prepareNativeToolchain({ cacheRoot: root }), { code: 'TOOLCHAIN_DOWNLOAD_TIMEOUT' });
    assert.deepEqual(fs.readdirSync(root), ['downloads']);
    assert.deepEqual(fs.readdirSync(path.join(root, 'downloads')), []);
    assert.throws(() => inspectNativeToolchain({ cacheRoot: root }), { code: 'TOOLCHAIN_NOT_READY' });
  } finally { globalThis.fetch = original; fs.rmSync(root, { recursive: true, force: true }); }
});

test('pinned distribution reconstructs offline and detects executable, dependency, pyc and configuration drift', { timeout: 120_000 }, async () => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    assert.throws(() => inspectBundledToolchainLock(), { code: 'TOOLCHAIN_UNSUPPORTED_PLATFORM' }); return;
  }
  assert.ok(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN, 'Set EVOPILOT_TEST_NATIVE_TOOLCHAIN to the prepared native configuration (validation never downloads)');
  const configured = JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN, 'utf8'));
  const mirror = path.join(path.dirname(path.dirname(configured.environmentRoot)), 'downloads');
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'evopilot-native-lock-'));
  try {
    const actual = await prepareNativeToolchain({ cacheRoot: root, downloadCache: mirror, offline: true });
    assert.equal(actual.lockDigest, configured.lockDigest);
    assert.ok(actual.dependencyFiles.length > 2000);
    assert.deepEqual(inspectNativeToolchain({ cacheRoot: root }), actual);
    const output = spawnSync(actual.tools.python.executable, ['-I', '-B', '-c', 'import pyshacl,rdflib;print(pyshacl.__version__,rdflib.__version__)'], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(output.status, 0, output.stderr);
    assert.equal(output.stdout.trim(), '0.40.1 7.6.0');
    const target = actual.dependencyFiles.find(f => f.path.endsWith('/pyshacl/__init__.py'));
    assert.ok(target);
    const bytes = fs.readFileSync(target.path);
    fs.appendFileSync(target.path, '\n# changed\n');
    assert.throws(() => inspectNativeToolchain({ cacheRoot: root }), { code: 'TOOLCHAIN_INTEGRITY' });
    fs.writeFileSync(target.path, bytes);
    const injected = path.join(path.dirname(target.path), 'injected.pyc'); fs.writeFileSync(injected, 'unlocked bytecode');
    assert.throws(() => inspectNativeToolchain({ cacheRoot: root }), /Unexpected executable dependency/);
    fs.unlinkSync(injected);
    const cfg = path.join(actual.environmentRoot, 'venv/pyvenv.cfg'), original = fs.readFileSync(cfg);
    fs.writeFileSync(cfg, original.toString().replace('include-system-site-packages = false', 'include-system-site-packages = true'));
    assert.throws(() => inspectNativeToolchain({ cacheRoot: root }), { code: 'TOOLCHAIN_INTEGRITY' });
    fs.writeFileSync(cfg, original);
    const opa = actual.tools.opa.executable, raw = fs.readFileSync(opa); fs.appendFileSync(opa, 'changed');
    assert.throws(() => inspectNativeToolchain({ cacheRoot: root }), { code: 'TOOLCHAIN_INTEGRITY' });
    fs.writeFileSync(opa, raw);
    assert.deepEqual(await prepareNativeToolchain({ cacheRoot: root, offline: true }), actual);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
