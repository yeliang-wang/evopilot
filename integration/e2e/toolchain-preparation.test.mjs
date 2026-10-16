import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assembly } from './connection.test.mjs';

test('native preparation returns before a slow download, retains failure and never redispatches a request', { timeout: 30000 }, async () => {
  const f = await assembly(true), original = globalThis.fetch, originalTimeout = AbortSignal.timeout;
  let release, calls = 0;
  const deadlines = [];
  try {
    await f.api.activateConnection(f.configPath);
    const url = pathToFileURL(path.join(f.install, 'dist/integration/toolchain/preparation.js')).href;
    const api = await import(url);
    AbortSignal.timeout = ms => { deadlines.push(ms); return originalTimeout(ms); };
    globalThis.fetch = async (_url, options) => { assert(options.signal instanceof AbortSignal); calls++; return new Promise(resolve => { release = () => resolve(new Response('synthetic unavailable', { status: 503 })); }); };
    const admitted = await Promise.race([api.startToolchainPreparation(f.configPath, 'slow-download'),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Preparation blocked on body')), 2000); timer.unref(); })]);
    assert.equal(admitted.preparation.status, 'RUNNING'); assert.equal(calls, 1);
    assert(deadlines.includes(900000), 'A slow large locked artifact has a bounded fifteen-minute budget');
    assert.equal(api.inspectToolchainPreparation(f.configPath).status, 'RUNNING');
    const duplicate = await api.startToolchainPreparation(f.configPath, 'slow-download');
    assert.equal(duplicate.reused, true); assert.equal(calls, 1);
    await assert.rejects(api.startToolchainPreparation(f.configPath, 'different-pending'), { code: 'TOOLCHAIN_PREPARATION_UNCERTAIN' });
    // A fresh module has no proof of owning the original in-flight promise.
    const fresh = await import(url + '?independent-reader');
    assert.equal(fresh.inspectToolchainPreparation(f.configPath).status, 'UNKNOWN');
    assert.equal((await fresh.startToolchainPreparation(f.configPath, 'slow-download')).preparation.status, 'UNKNOWN');
    assert.equal(calls, 1);
    release();
    for (let i = 0; i < 100 && api.inspectToolchainPreparation(f.configPath).status === 'RUNNING'; i++) await new Promise(r => setTimeout(r, 10));
    const failed = api.inspectToolchainPreparation(f.configPath);
    assert.equal(failed.status, 'FAILED'); assert.equal(failed.diagnostic, 'TOOLCHAIN_DOWNLOAD');
    assert.equal((await fresh.startToolchainPreparation(f.configPath, 'slow-download')).preparation.status, 'FAILED');
    assert.equal(calls, 1, 'A failed original request is read back, never silently dispatched again');
    assert.deepEqual(fs.readdirSync(path.join(f.config.workspaceRoot, 'native-toolchain/downloads')), []);
    globalThis.fetch = async () => { calls++; throw new TypeError('synthetic private network details'); };
    await api.startToolchainPreparation(f.configPath, 'explicit-terminal-retry');
    for (let i = 0; i < 100 && api.inspectToolchainPreparation(f.configPath).status === 'RUNNING'; i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(calls, 2); assert.equal(api.inspectToolchainPreparation(f.configPath).diagnostic, 'TOOLCHAIN_DOWNLOAD_NETWORK');
    const directory = path.join(f.config.workspaceRoot, 'native-toolchain-preparation');
    const retained = fs.readFileSync(path.join(directory, 'slow-download.json'), 'utf8');
    assert(!retained.includes('synthetic')); assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(directory, 'slow-download.json')).mode & 0o777, 0o600);
    fs.writeFileSync(path.join(directory, 'invalid.json'), '{}', { mode: 0o600 });
    assert.throws(() => api.inspectToolchainPreparation(f.configPath), { code: 'TOOLCHAIN_PREPARATION_INVALID' });
  } finally { if (release) release(); globalThis.fetch = original; AbortSignal.timeout = originalTimeout; await f.cleanup(); }
});

test('native preparation verifies ready cache without fetching and retains a terminal receipt across readers', { timeout: 60000 }, async () => {
  const f = await assembly(true), original = globalThis.fetch;
  try {
    await f.api.activateConnection(f.configPath); await f.api.stopConnection(f.configPath);
    const url = name => pathToFileURL(path.join(f.install, 'dist/integration/toolchain/' + name + '.js')).href;
    const locked = await import(url('locked')), api = await import(url('preparation'));
    const tools = JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN, 'utf8'));
    const cacheRoot = path.join(f.config.workspaceRoot, 'native-toolchain');
    await locked.prepareNativeToolchain({ cacheRoot, downloadCache: path.join(path.dirname(path.dirname(tools.environmentRoot)), 'downloads'), offline: true });
    globalThis.fetch = async () => { throw Error('Ready cache must never fetch'); };
    await api.startToolchainPreparation(f.configPath, 'ready-cache');
    for (let i = 0; i < 100 && api.inspectToolchainPreparation(f.configPath).status === 'RUNNING'; i++) await new Promise(r => setTimeout(r, 10));
    const receipt = api.inspectToolchainPreparation(f.configPath);
    assert.equal(receipt.status, 'SUCCEEDED'); assert.equal(receipt.diagnostic, null);
    const fresh = await import(url('preparation') + '?terminal-reader');
    assert.deepEqual(fresh.inspectToolchainPreparation(f.configPath), receipt);
    assert.equal((await fresh.startToolchainPreparation(f.configPath, 'ready-cache')).reused, true);
    assert.equal(locked.inspectNativeToolchain({ cacheRoot }).lockDigest, receipt.lockDigest);
  } finally { globalThis.fetch = original; await f.cleanup(); }
});
