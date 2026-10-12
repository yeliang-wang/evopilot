import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfiguration, LIMITS, fail, fields } from './config.mjs';
import { readRecord, same, recoverRecord } from './control.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export function validateAction(action, payload) {
  const shapes = { health: [], stop: [], capabilities: [], request: ['owner', 'envelope'], dispatch: ['args'], reconcile: ['args'], inspect: ['owner', 'scope'] };
  if (!Object.hasOwn(shapes, action)) fail('ACTION');
  fields(payload, shapes[action]);
  if (['request', 'inspect'].includes(action) && !['runtime', 'harness', 'ontology'].includes(payload.owner)) fail('OWNER');
  if (action === 'request' && (!payload.envelope || typeof payload.envelope !== 'object' || Array.isArray(payload.envelope))) fail('SCHEMA');
  if (['dispatch', 'reconcile'].includes(action) && (!payload.args || typeof payload.args !== 'object' || Array.isArray(payload.args))) fail('SCHEMA');
}
export function transport(c, record, action, payload = {}, timeout = LIMITS.request) {
  validateAction(action, payload);
  const body = JSON.stringify({ protocol: c.protocol, identity: c.identity, nonce: record.nonce, action, payload });
  if (Buffer.byteLength(body) > LIMITS.body) fail('LIMIT');
  return new Promise((resolve, reject) => {
    let timer;
    const source = payload.envelope ?? payload.args;
    const correlation = source ? Object.fromEntries(['requestId', 'scope', 'expectedRevision'].filter(k => Object.hasOwn(source, k)).map(k => [k, source[k]])) : null;
    const unknown = () => Object.assign(new Error('Connection outcome unknown; inspect the owning receipt before any new action'), { code: 'UNKNOWN', correlation });
    const req = http.request({ hostname: '127.0.0.1', port: record.port, path: '/', method: 'POST', agent: false,
      headers: { authorization: 'Bearer ' + record.token, host: '127.0.0.1:' + record.port, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, res => {
      let size = 0; const chunks = [];
      res.on('data', chunk => { size += chunk.length; if (size > LIMITS.response) res.destroy(); else chunks.push(chunk); });
      res.on('error', () => { clearTimeout(timer); reject(unknown()); });
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const value = JSON.parse(Buffer.concat(chunks));
          if (!same(value.identity, c.identity) || value.nonce !== record.nonce || value.pid !== record.pid) throw Error();
          if (value.error) reject(Object.assign(new Error(value.error.code), value.error));
          else if (res.statusCode !== 200) reject(unknown());
          else resolve(value.result);
        } catch { reject(unknown()); }
      });
    });
    timer = setTimeout(() => req.destroy(), timeout);
    req.on('error', () => { clearTimeout(timer); reject(unknown()); });
    req.end(body);
  });
}
function publicConnection(c, r) { return { active: true, identity: c.identity, pid: r.pid, nonce: r.nonce, address: '127.0.0.1', port: r.port, authority: false }; }
export async function inspectConnection(configPath) {
  const c = loadConfiguration(configPath), r = readRecord(c);
  if (!r) return { active: false, identity: c.identity, authority: false };
  if (r.state !== 'ready') return { active: false, identity: c.identity, state: r.state, diagnostic: r.diagnostic ?? 'STARTING' };
  await transport(c, r, 'health', {}, 1500);
  return publicConnection(c, r);
}
export async function activateConnection(configPath) {
  const c = loadConfiguration(configPath);
  let r = readRecord(c);
  if (!r) {
    const child = spawn(process.execPath, [path.join(c.installationRoot, 'integration/connection/daemon.mjs'), c.configPath], {
      detached: true, stdio: 'ignore', cwd: c.installationRoot, env: { LANG: 'C', TZ: 'UTC' },
    });
    let spawnError = false;
    child.on('error', () => { spawnError = true; });
    child.unref();
    await pause(20);
    if (spawnError) fail('SPAWN_FAILED');
  }
  const deadline = Date.now() + LIMITS.startup;
  while (Date.now() < deadline) {
    try { r = readRecord(c); } catch (e) { if (e.code !== 'CONTROL_INVALID') throw e; }
    if (r?.state === 'failed') fail(r.diagnostic ?? 'STARTUP_FAILED');
    if (r?.state === 'ready') {
      await transport(c, r, 'health', {}, 1500);
      return publicConnection(c, r);
    }
    await pause(50);
  }
  fail('STARTUP_TIMEOUT', 'Startup timed out; retained control evidence requires explicit diagnosis/recovery');
}
export async function callConnection(configPath, action, payload = {}) {
  validateAction(action, payload);
  if (['stop', 'health'].includes(action)) fail('ACTION');
  const c = loadConfiguration(configPath), r = readRecord(c);
  if (!r || r.state !== 'ready') fail('INACTIVE');
  return transport(c, r, action, payload);
}
export async function stopConnection(configPath) {
  const c = loadConfiguration(configPath), r = readRecord(c);
  if (!r) return { stopped: false };
  if (r.state !== 'ready') fail('NOT_READY');
  await transport(c, r, 'health', {}, 1500);
  return transport(c, r, 'stop', {}, 3000);
}
export function recoverStaleConnection(configPath) { return recoverRecord(loadConfiguration(configPath)); }
