// Synthetic local feasibility PROBE; no Desktop or final product E2E claim.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initialize, discover, handshake, request, sameIdentity } from './probe-daemon.mjs';

const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 2500) {
  const deadline = Date.now() + ms;
  do { const result = await fn(); if (result) return result; await delay(20); } while (Date.now() < deadline);
  throw Error('Startup/exit deadline');
}
async function run() {
  // This is the only generated tree; only its owner removes it, after children exit.
  const workspace = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'synthetic-m0-probe-')));
  const children = [], agents = []; let blocker;
  const config = initialize(workspace);
  function launch(extra = {}) {
    const nonce = randomUUID();
    const child = spawn(process.execPath, [fileURLToPath(new URL('./probe-daemon.mjs', import.meta.url)), JSON.stringify({ workspace, nonce, ...extra })], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const entry = { child, expected: { ...config, nonce, pid: child.pid }, exited: false, boot: null, output: '' };
    child.on('message', m => { if (m.type === 'identity' && sameIdentity(m, entry.expected)) entry.boot = m; });
    child.stdout.on('data', c => { entry.output += c; }); child.stderr.resume();
    child.on('error', e => { entry.error = e; entry.exited = true; });
    child.on('close', (code, signal) => { entry.exited = true; entry.code = code; entry.signal = signal; });
    children.push(entry); return entry;
  }
  async function stop(entry) {
    if (entry.exited) return;
    await until(() => entry.boot || entry.exited);
    if (entry.exited) return;
    // IPC identity must match our actual ChildProcess and its private launch nonce.
    assert.ok(sameIdentity(entry.boot, entry.expected)); assert.equal(entry.child.pid, entry.expected.pid);
    entry.child.kill('SIGTERM'); await until(() => entry.exited);
  }
  async function start(extra = {}, timeout = 2500) {
    const entry = launch(extra);
    const identity = await until(async () => {
      if (entry.error || (entry.exited && entry.code !== 0)) throw entry.error || Error('Child startup failed');
      return discover(config);
    }, timeout);
    return { entry, identity };
  }
  const client = identity => {
    const agent = new http.Agent({ keepAlive: true }); agents.push(agent);
    return { close: () => agent.destroy(), op: body => request(identity.port, '/op', { ...body, identity }, agent) };
  };
  try {
    assert.deepEqual(fs.readdirSync(workspace), []);
    assert.equal(await discover(config), null); assert.deepEqual(fs.readdirSync(workspace), []);
    const [a, b] = await Promise.all([start(), start()]);
    assert.deepEqual(a.identity, b.identity);
    const identity = a.identity;
    const owner = children.find(e => e.child.pid === identity.pid);
    assert.ok(owner); await until(() => owner.boot);
    const loser = children.find(e => e !== owner); await until(() => loser.exited);
    assert.equal(loser.code, 0); assert.equal(JSON.parse(loser.output).status, 'CONTENDED');
    assert.equal(children.filter(e => !e.exited).length, 1);
    assert.ok(sameIdentity(owner.boot, identity));
    assert.equal(fs.existsSync(join(workspace, 'synthetic-state.json')), false);
    const c1 = client(identity), c2 = client(identity);
    assert.deepEqual((await c1.op({ action: 'read' })).body, { counter: 0, revision: 0, receipts: {} });
    for (const [key, value] of [['nonce', 'wrong'], ['workspace', `${workspace}/wrong`], ['product', 'wrong'], ['version', '999'], ['pid', process.pid]]) {
      await assert.rejects(handshake({ ...identity, [key]: value }), /Identity mismatch/);
      assert.equal((await request(identity.port, '/op', { identity: { ...identity, [key]: value }, action: 'read' })).code, 409);
    }
    const mutation = { action: 'increment', key: 'lost-response', revision: 0, delta: 1, dropResponse: true };
    await assert.rejects(c1.op(mutation)); // No retry: resolve uncertainty by exact receipt lookup.
    c1.close();
    const expected = { key: mutation.key, payload: { delta: 1, revision: 0 }, counter: 1, revision: 1 };
    assert.deepEqual((await c2.op({ action: 'receipt', key: mutation.key })).body, expected);
    const persisted = (await c2.op({ action: 'read' })).body;
    assert.deepEqual(persisted, { counter: 1, revision: 1, receipts: { 'lost-response': expected } });
    assert.equal((await c2.op({ ...mutation, dropResponse: false, delta: 2 })).code, 409);
    assert.equal((await c2.op({ ...mutation, key: 'stale', dropResponse: false })).code, 409);
    assert.deepEqual((await c2.op({ action: 'read' })).body, persisted);
    c2.close(); await stop(owner);
    assert.equal(await discover(config), null);
    const restarted = await start(); assert.notEqual(restarted.identity.nonce, identity.nonce);
    const c3 = client(restarted.identity);
    assert.deepEqual((await c3.op({ action: 'read' })).body, persisted);
    assert.deepEqual((await c3.op({ action: 'receipt', key: mutation.key })).body, expected);
    const next = { action: 'increment', key: 'replay-check', revision: 1, delta: 2 };
    const receipt = await c3.op(next); assert.equal(receipt.code, 200);
    assert.deepEqual(await c3.op(next), receipt);
    assert.equal((await c3.op({ action: 'read' })).body.counter, 3);
    c3.close(); await stop(restarted.entry);
    blocker = http.createServer((req, res) => res.end('{}'));
    await new Promise((resolve, reject) => { blocker.once('error', reject); blocker.listen(0, '127.0.0.1', resolve); });
    await assert.rejects(start({ port: blocker.address().port }), /startup failed/);
    assert.equal(await discover(config), null);
    await new Promise(resolve => blocker.close(resolve)); blocker = null;
    const began = Date.now();
    await assert.rejects(start({ stall: true }, 300), /deadline/);
    assert.ok(Date.now() - began < 2000);
    assert.equal(await discover(config), null); // Live PID plus lock is insufficient.
    await stop(children.at(-1)); assert.equal(await discover(config), null);
    assert.equal(fs.statSync(workspace).mode & 0o077, 0);
    assert.equal(fs.statSync(join(workspace, 'synthetic-state.json')).mode & 0o077, 0);
    return { marker: 'PROBE', status: 'PASS', released: false, synthetic: true, tests: ['pure discovery', 'concurrent election', 'exact identity', 'lost response receipt without replay', 'client independence', 'atomic persistence/restart', 'revision/idempotency conflicts', 'port conflict', 'bounded startup failure'], limits: ['local process feasibility only', 'no automatic stale-lock recovery', 'no crash/power-loss durability claim', 'no Desktop or final product E2E'] };
  } finally {
    agents.forEach(a => a.destroy());
    if (blocker) { blocker.closeAllConnections(); await new Promise(resolve => blocker.close(resolve)); }
    await Promise.all(children.map(stop));
    assert.ok(children.every(e => e.exited)); fs.rmSync(workspace, { recursive: true, force: true });
  }
}
run().then(result => console.log(JSON.stringify(result))).catch(e => { console.log(JSON.stringify({ marker: 'PROBE', status: 'ERROR', error: e.message, released: false })); process.exitCode = 1; });
