import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { transport } from '../../dist/integration/connection/client.js';
import { LIMITS } from '../../dist/integration/connection/config.js';

// Deterministic transport event fixtures. Actual HTTP/owner-commit coverage lives
// in native-transport-limits.test.mjs; this fixes otherwise timing-sensitive
// close-without-error ordering, not a synthetic claim of owner acceptance.
for (const mode of ['oversized-final-chunk', 'incomplete-close', 'timeout-close', 'success']) {
  test(`transport event fixture settles ${mode} without redispatch`, async t => {
    const identity = { synthetic: true };
    const configuration = { protocol: 'synthetic/v1', identity };
    const record = { identity, nonce: 'synthetic', token: 'synthetic', pid: 123, port: 1234 };
    const payload = { owner: 'ontology', envelope: {
      operation: 'native.package.put', scope: { visibility: 'private', projectId: 'synthetic' },
      input: {}, requestId: 'retained-request', expectedRevision: 7,
    } };
    let attempts = 0, requestDestroyed = false, responseDestroyed = false;
    t.mock.method(http, 'request', (_options, onResponse) => {
      attempts++;
      const request = new EventEmitter();
      request.destroy = () => { requestDestroyed = true; request.emit('close'); return request; };
      request.end = () => queueMicrotask(() => {
        if (mode === 'timeout-close') return;
        const response = new EventEmitter();
        response.statusCode = 200;
        response.destroy = () => { responseDestroyed = true; response.emit('close'); return response; };
        onResponse(response);
        if (mode === 'oversized-final-chunk') {
          response.complete = true;
          response.emit('data', Buffer.alloc(LIMITS.nativeResponse + 1));
        } else if (mode === 'incomplete-close') {
          response.complete = false;
          response.emit('data', Buffer.from('{'));
          response.emit('close');
        } else {
          response.complete = true;
          response.emit('data', Buffer.from(JSON.stringify({ identity, nonce: record.nonce, pid: record.pid, result: { retained: true } })));
          response.emit('end');
          response.emit('close');
        }
      });
      return request;
    });
    const outcome = await Promise.race([
      transport(configuration, record, 'native', payload, 30).then(value => ({ value }), error => ({ error })),
      delay(200, { pending: true }),
    ]);
    assert.equal(outcome.pending, undefined, 'Close/deadline must settle even when no error/end follows');
    assert.equal(attempts, 1);
    if (mode === 'success') {
      assert.deepEqual(outcome.value, { retained: true });
      assert.equal(requestDestroyed, false);
    } else {
      assert.equal(outcome.error.code, 'UNKNOWN');
      assert.deepEqual(outcome.error.correlation, { owner: 'ontology', operation: 'native.package.put', scope: payload.envelope.scope, requestId: 'retained-request', expectedRevision: 7 });
      if (mode === 'oversized-final-chunk') assert.equal(responseDestroyed, true);
      if (mode === 'timeout-close') assert.equal(requestDestroyed, true);
    }
  });
}
