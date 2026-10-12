// Synthetic local process PROBE only. No EvoPilot operations or product authority.
import * as fs from 'node:fs';
import http from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCT = 'synthetic-m0-PROBE', VERSION = '0.1.0';
const identityKeys = ['nonce', 'workspace', 'product', 'version', 'pid'];
export const sameIdentity = (a, b) => !!a && !!b && identityKeys.every(k => a[k] === b[k]);
// Initialization and discovery never create directories, locks, or counter state.
export const initialize = workspace => ({ workspace: fs.realpathSync(workspace), product: PRODUCT, version: VERSION });
export function request(port, path, body, agent = false) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: body ? 'POST' : 'GET', agent }, res => {
      let data = ''; res.on('data', c => { data += c; }); res.on('error', reject);
      res.on('end', () => { try { resolve({ code: res.statusCode, body: JSON.parse(data) }); } catch (e) { reject(e); } });
    });
    const deadline = setTimeout(() => req.destroy(Error('HTTP deadline')), 400);
    req.on('close', () => clearTimeout(deadline)); req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
export async function handshake(identity, agent = false) {
  const r = await request(identity.port, '/identity', undefined, agent);
  if (r.code !== 200 || r.body.marker !== 'PROBE' || !sameIdentity(r.body, identity) || r.body.port !== identity.port) throw Error('Identity mismatch');
  return r.body;
}
export async function discover(config) {
  let identity;
  try { identity = JSON.parse(fs.readFileSync(join(config.workspace, 'daemon.lock'), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) return null; throw e; }
  if (identity.workspace !== config.workspace || identity.product !== config.product || identity.version !== config.version || !Number.isInteger(identity.pid) || identity.pid <= 0 || typeof identity.nonce !== 'string' || !identity.nonce) throw Error('Invalid lock identity');
  if (!identity.port) return null;
  return handshake(identity);
}
function atomic(path, value) {
  const temp = `${path}.${process.pid}.new`;
  const fd = fs.openSync(temp, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, path);
}
async function main() {
  const options = JSON.parse(process.argv[2]);
  const config = initialize(options.workspace);
  const identity = { marker: 'PROBE', ...config, nonce: options.nonce, pid: process.pid, port: 0 };
  if (typeof identity.nonce !== 'string' || !identity.nonce || config.workspace !== options.workspace) throw Error('Explicit canonical workspace and nonce required');
  const lock = join(config.workspace, 'daemon.lock'), statePath = join(config.workspace, 'synthetic-state.json');
  let owned = false, server, finished = false;
  const finish = (code, status) => {
    if (finished) return; finished = true;
    if (owned) {
      try { if (sameIdentity(JSON.parse(fs.readFileSync(lock, 'utf8')), identity)) fs.unlinkSync(lock); } catch (e) { if (e.code !== 'ENOENT') code = 1; }
    }
    server?.close(); console.log(JSON.stringify({ marker: 'PROBE', status, released: false })); process.exit(code);
  };
  process.on('SIGTERM', () => finish(0, 'STOPPED'));
  process.on('disconnect', () => finish(1, 'OWNER_DISCONNECTED'));
  setTimeout(() => finish(1, 'LIFETIME_DEADLINE'), 30000).unref();
  process.send?.({ type: 'identity', ...identity });
  try {
    let fd;
    try { fd = fs.openSync(lock, 'wx', 0o600); }
    catch (e) { if (e.code === 'EEXIST') return finish(0, 'CONTENDED'); throw e; }
    owned = true;
    try { fs.writeFileSync(fd, JSON.stringify(identity)); } finally { fs.closeSync(fd); }
    if (options.stall) { setInterval(() => {}, 1000); return; }
    let state = { counter: 0, revision: 0, receipts: {} };
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    server = http.createServer((req, res) => {
      const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.method === 'GET' && req.url === '/identity') return send(200, identity);
      if (req.method !== 'POST' || req.url !== '/op') return send(404, { error: 'Unknown PROBE route' });
      let text = ''; req.on('error', () => {});
      req.on('data', c => { text += c; if (text.length > 8192) req.destroy(); });
      req.on('end', () => {
        try {
          const b = JSON.parse(text);
          if (!sameIdentity(b.identity, identity)) return send(409, { error: 'Identity mismatch' });
          if (b.action === 'read') return send(200, state);
          if (b.action === 'receipt') return send(200, Object.hasOwn(state.receipts, b.key) ? state.receipts[b.key] : null);
          if (b.action !== 'increment' || typeof b.key !== 'string' || !/^[a-z0-9-]{1,64}$/.test(b.key) || !Number.isSafeInteger(b.delta) || b.delta <= 0 || !Number.isSafeInteger(b.revision)) return send(400, { error: 'Invalid synthetic mutation' });
          const payload = { delta: b.delta, revision: b.revision };
          if (Object.hasOwn(state.receipts, b.key)) {
            const receipt = state.receipts[b.key];
            return send(JSON.stringify(receipt.payload) === JSON.stringify(payload) ? 200 : 409, receipt);
          }
          if (b.revision !== state.revision) return send(409, { error: 'Stale revision' });
          if (!Number.isSafeInteger(state.counter + b.delta)) return send(400, { error: 'Counter overflow' });
          const receipt = { key: b.key, payload, counter: state.counter + b.delta, revision: state.revision + 1 };
          const next = { counter: receipt.counter, revision: receipt.revision, receipts: { ...state.receipts, [b.key]: receipt } };
          atomic(statePath, next); state = next; // Commit precedes deliberate response loss.
          if (b.dropResponse === true) return res.destroy();
          send(200, receipt);
        } catch (e) { send(500, { error: e.message }); }
      });
    });
    server.requestTimeout = 1000; server.headersTimeout = 1000;
    server.on('error', e => finish(1, e.code || 'LISTEN_FAILED'));
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      identity.port = server.address().port; atomic(lock, identity);
    });
  } catch (e) { finish(1, e.message); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.log(JSON.stringify({ marker: 'PROBE', status: 'ERROR', error: e.message })); process.exitCode = 1; });
}
