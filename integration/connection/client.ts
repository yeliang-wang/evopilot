import {connectionRequestTimeout} from './config.js';
import { errorCode } from '../types.js';
import type { Configuration, ControlRecord, ActionPayload } from '../types.js';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { withWorkspaceLease } from '../workspace/lock.js';
import { spawn } from 'node:child_process';
import { loadConfiguration, loadInstallationConfiguration, LIMITS, connectionBodyLimit, connectionResponseLimit, connectionCorrelation, fail, fields } from './config.js';
import { readRecord, same, recoverRecord } from './control.js';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export function validateAction(action: string, payload: ActionPayload) {
  const shapes: Record<string, string[]> = { health: [], stop: [], capabilities: [], request: ['owner', 'envelope'], native: ['owner', 'envelope'], native_project: ['operation', 'input'], dispatch: ['args'], reconcile: ['args'], inspect: ['owner', 'scope'] };
  if (!Object.hasOwn(shapes, action)) fail('ACTION');
  fields(payload, shapes[action]);
  if (['request', 'native', 'inspect'].includes(action) && !['runtime', 'harness', 'ontology'].includes(typeof payload.owner === 'string' ? payload.owner : '')) fail('OWNER');
  if (['request', 'native'].includes(action) && (!payload.envelope || typeof payload.envelope !== 'object' || Array.isArray(payload.envelope))) fail('SCHEMA');
  if (action === 'native_project' && (typeof payload.operation !== 'string' || !payload.input || typeof payload.input !== 'object' || Array.isArray(payload.input))) fail('SCHEMA');
  if (['dispatch', 'reconcile'].includes(action) && (!payload.args || typeof payload.args !== 'object' || Array.isArray(payload.args))) fail('SCHEMA');
}
export function transport(c: Configuration, record: ControlRecord, action: string, payload: ActionPayload = {}, timeout: number = LIMITS.request) {
  validateAction(action, payload);
  const body = JSON.stringify({ protocol: c.protocol, identity: c.identity, nonce: record.nonce, action, payload });
  if (Buffer.byteLength(body) > connectionBodyLimit(action, payload)) fail('LIMIT');
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const correlation = connectionCorrelation(action, payload);
    const unknown = () => Object.assign(new Error('Connection outcome unknown; inspect the owning receipt before any new action'), { code: 'UNKNOWN', correlation });
    const req = http.request({ hostname: '127.0.0.1', port: record.port, path: '/', method: 'POST', agent: false,
      headers: { authorization: 'Bearer ' + record.token, host: '127.0.0.1:' + record.port, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, res => {
      let size = 0; const chunks: Buffer[] = [];
      res.on('data', chunk => { size += chunk.length; if (size > connectionResponseLimit(action, payload)) res.destroy(); else chunks.push(chunk); });
      res.on('error', () => { clearTimeout(timer); reject(unknown()); });
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const value: unknown = JSON.parse(Buffer.concat(chunks).toString());
          if (!value || typeof value !== 'object') throw Error();
          const reply = value as Record<string, unknown>;
          if (!same(reply.identity, c.identity) || reply.nonce !== record.nonce || reply.pid !== record.pid) throw Error();
          if (reply.error) {
            const error = reply.error as { code?: string };
            reject(Object.assign(new Error(error.code), error));
          }
          else if (res.statusCode !== 200) reject(unknown());
          else resolve(reply.result);
        } catch { reject(unknown()); }
      });
    });
    timer = setTimeout(() => req.destroy(), timeout);
    req.on('error', () => { clearTimeout(timer); reject(unknown()); });
    req.end(body);
  });
}
function publicConnection(c: Configuration, r: ControlRecord) { return { active: true, identity: c.identity, pid: r.pid, nonce: r.nonce, address: '127.0.0.1', port: r.port, authority: false }; }
export async function inspectConnection(configPath: string) {
  const installation = loadInstallationConfiguration(configPath);
  if (installation.workspaceRoot === null) return { active: false, configured: false, identity: installation.identity, authority: false };
  const c = loadConfiguration(configPath), r = readRecord(c);
  if (!r) return { active: false, configured: true, identity: c.identity, authority: false };
  if (r.state !== 'ready') return { active: false, identity: c.identity, state: r.state, diagnostic: r.diagnostic ?? 'STARTING' };
  await transport(c, r, 'health', {}, 1500);
  return publicConnection(c, r);
}
export async function activateConnection(configPath: string) {
  const c = loadConfiguration(configPath);
  return withWorkspaceLease(c, 'activate-' + randomUUID(), () => activateVerifiedConnection(c));
}
async function activateVerifiedConnection(c: Configuration) {
  let r = readRecord(c);
  if (!r) {
    const child = spawn(process.execPath, [path.join(c.installationRoot, 'dist/integration/connection/daemon.js'), c.configPath], {
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
    try { r = readRecord(c); } catch (e) { if (errorCode(e) !== 'CONTROL_INVALID') throw e; }
    if (r?.state === 'failed') fail(r.diagnostic ?? 'STARTUP_FAILED');
    if (r?.state === 'ready') {
      await transport(c, r, 'health', {}, 1500);
      return publicConnection(c, r);
    }
    await pause(50);
  }
  fail('STARTUP_TIMEOUT', 'Startup timed out; retained control evidence requires explicit diagnosis/recovery');
}
export async function callConnection(configPath: string, action: string, payload: ActionPayload = {}) {
  validateAction(action, payload);
  if (['stop', 'health'].includes(action)) fail('ACTION');
  const c = loadConfiguration(configPath), r = readRecord(c);
  if (!r || r.state !== 'ready') fail('INACTIVE');
  return transport(c, r, action, payload, connectionRequestTimeout(action,payload));
}
export async function stopConnection(configPath: string) {
  if (loadInstallationConfiguration(configPath).workspaceRoot === null) return { stopped: false };
  const c = loadConfiguration(configPath);
  return withWorkspaceLease(c, 'stop-' + randomUUID(), () => stopVerifiedConnection(c));
}
async function stopVerifiedConnection(c: Configuration) {
  const r = readRecord(c);
  if (!r) return { stopped: false };
  if (r.state !== 'ready') fail('NOT_READY');
  await transport(c, r, 'health', {}, 1500);
  return transport(c, r, 'stop', {}, 3000);
}
export function recoverStaleConnection(configPath: string) { if (loadInstallationConfiguration(configPath).workspaceRoot === null) return { recovered: false }; return recoverRecord(loadConfiguration(configPath)); }

export async function withWorkspaceMaintenance<T>(configPath: string, requestId: string, callback: (configuration: Configuration) => Promise<T> | T, options: { restoring?: boolean } = {}): Promise<T> {
  const c = loadConfiguration(configPath, { allowMissingProject: options.restoring === true, restoreRequestId: options.restoring === true ? requestId : undefined });
  return withWorkspaceLease(c, requestId, async () => {
    const {requireOnlineWorkerStopped}=await import('../online/lifecycle.js');requireOnlineWorkerStopped(c);
    await stopVerifiedConnection(c);
    if (readRecord(c) !== null) fail('WORKSPACE_BUSY');
    return callback(c);
  });
}
