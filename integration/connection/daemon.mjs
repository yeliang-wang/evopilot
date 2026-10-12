import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadConfiguration, LIMITS, fields, fail } from './config.mjs';
import { checkDirectory, writeRecord, removeRecord, readRecord, same } from './control.mjs';
import { validateAction } from './client.mjs';
import { createComposition, loadInstalledProducts } from '../composition.mjs';

// No fixture/provider override: the installed public bare packages are the only loader.
export async function runDaemon(configPath) {
  const c = loadConfiguration(configPath);
  checkDirectory(c, true);
  const record = { identity: c.identity, nonce: randomBytes(32).toString('hex'), token: randomBytes(32).toString('hex'), pid: process.pid, port: 0, state: 'starting', diagnostic: null };
  try { writeRecord(c, record, true); } catch (e) { if (e.code === 'EEXIST') return; throw e; }
  let composition, server, active = 0, closing = false;
  const publicReply = value => ({ identity: c.identity, nonce: record.nonce, pid: record.pid, ...value });
  try {
    composition = createComposition({ workspaceRoot: c.workspaceRoot, workspaceId: c.workspaceId }, await loadInstalledProducts());
    composition.inspect('runtime', { visibility: 'public', projectId: 'shared' });
    server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000, keepAliveTimeout: 1000 }, async (req, res) => {
      const send = (status, value) => {
        const body = JSON.stringify(publicReply(value));
        if (Buffer.byteLength(body) > LIMITS.response) { res.destroy(); return; }
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', connection: 'close' }); res.end(body);
      };
      const expected = Buffer.from('Bearer ' + record.token), actual = Buffer.from(req.headers.authorization ?? '');
      if (req.method !== 'POST' || req.url !== '/' || req.headers.host !== '127.0.0.1:' + record.port || req.headers.origin !== undefined || req.headers['content-type'] !== 'application/json' || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        res.writeHead(403, { connection: 'close' }); res.end(); return;
      }
      let entered = false, request;
      const timer = setTimeout(() => req.destroy(), 5000);
      try {
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > LIMITS.body) fail('LIMIT'); chunks.push(chunk); }
        clearTimeout(timer);
        request = JSON.parse(Buffer.concat(chunks));
        fields(request, ['protocol', 'identity', 'nonce', 'action', 'payload']);
        if (request.protocol !== c.protocol || !same(request.identity, c.identity) || request.nonce !== record.nonce) fail('IDENTITY_CONFLICT');
        validateAction(request.action, request.payload);
        if (closing) fail('CLOSING');
        const { action, payload } = request;
        if (action === 'health') { send(200, { result: { identity: c.identity } }); return; }
        if (action === 'stop') {
          if (active) fail('BUSY');
          closing = true;
          composition.close();
          removeRecord(c, record.nonce);
          server.close();
          send(200, { result: { stopped: true } });
          server.closeIdleConnections();
          return;
        }
        active++; entered = true;
        let result;
        if (action === 'request') result = await composition.request(payload.owner, payload.envelope);
        else if (action === 'dispatch' || action === 'reconcile') result = await composition[action](payload.args);
        else if (action === 'inspect') result = await composition.inspect(payload.owner, payload.scope);
        else result = composition.capabilities();
        send(200, { result });
      } catch (error) {
        // Never serialize provider messages/stacks or authentication material.
        const source = request?.payload?.envelope ?? request?.payload?.args;
        const correlation = source ? Object.fromEntries(['requestId', 'scope', 'expectedRevision'].filter(k => Object.hasOwn(source, k)).map(k => [k, source[k]])) : null;
        send(400, { error: { code: typeof error.code === 'string' && /^[A-Z_0-9]{1,80}$/.test(error.code) ? error.code : entered ? 'UNKNOWN' : 'SCHEMA', correlation } });
      } finally { clearTimeout(timer); if (entered) active--; }
    });
    server.maxConnections = 64;
    server.on('clientError', (_error, socket) => socket.destroy());
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    record.port = server.address().port; record.state = 'ready';
    writeRecord(c, record);
  } catch (error) {
    server?.close();
    try { composition?.close(); } catch {}
    const own = readRecord(c);
    if (own?.nonce === record.nonce) {
      record.state = 'failed'; record.diagnostic = /^[A-Z_0-9]{1,80}$/.test(error.code ?? '') ? error.code : 'STARTUP_FAILED';
      writeRecord(c, record);
    }
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) process.exitCode = 1;
  else runDaemon(process.argv[2]).catch(() => { process.exitCode = 1; });
}
