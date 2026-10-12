import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadInstalledProducts } from '../composition.mjs';
import { assembly, clientProcess, rawRequest } from './connection.test.mjs';

test('installed public products: passive discovery, Runtime activation, durable receipt after lost response and restart', { timeout: 45000 }, async () => {
  // Deliberately no skip or fixture fallback when public packages are unavailable.
  const products = await loadInstalledProducts();
  for (const owner of ['runtime', 'harness', 'ontology']) assert.equal(products[owner].PRODUCT, owner);
  const f = await assembly(true);
  try {
    const before = fs.readdirSync(f.base).sort();
    assert.equal((await f.api.inspectConnection(f.configPath)).active, false);
    assert.deepEqual(fs.readdirSync(f.base).sort(), before);
    assert.equal(fs.existsSync(f.config.workspaceRoot), false);
    const [a, b] = await Promise.all([clientProcess(f, 'api.activateConnection(config)'), clientProcess(f, 'api.activateConnection(config)')]);
    assert.equal(a.pid, b.pid);
    assert.equal(fs.existsSync(path.join(f.config.workspaceRoot, 'state/runtime/runtime.db')), true);
    for (const owner of ['harness', 'ontology']) assert.equal(fs.existsSync(path.join(f.config.workspaceRoot, 'state', owner)), false);
    const c = f.configuration.loadConfiguration(f.configPath), record = f.control.readRecord(c);
    assert(!JSON.stringify([a, b]).includes(record.token));
    const scope = { visibility: 'private', projectId: 'connection-test' };
    const revision = (await f.api.callConnection(f.configPath, 'inspect', { owner: 'runtime', scope })).revision;
    const envelope = { operation: 'project.create', scope, input: { name: 'Connection fixture' }, requestId: 'connection-create', expectedRevision: revision };
    // Destroy the response at its headers: the owning transaction has committed,
    // but no result body reaches the caller. Recovery reads the receipt only.
    assert.equal((await rawRequest(f, record, 'request', { owner: 'runtime', envelope }, { drop: true })).lost, true);
    const read = (operation, input) => f.api.callConnection(f.configPath, 'request', { owner: 'runtime', envelope: { operation, scope, input } });
    const receipt = await read('receipt.inspect', { requestId: envelope.requestId });
    assert.equal(receipt.requestId, envelope.requestId);
    assert.deepEqual(receipt.scope, scope);
    assert.equal(receipt.revision, revision + 1);
    const project = await read('project.inspect', {});
    await f.api.stopConnection(f.configPath);
    await f.api.activateConnection(f.configPath);
    assert.deepEqual(await read('project.inspect', {}), project);
    assert.deepEqual(await read('receipt.inspect', { requestId: envelope.requestId }), receipt);
    assert.equal((await f.api.callConnection(f.configPath, 'inspect', { owner: 'runtime', scope })).revision, revision + 1);
  } finally { await f.cleanup(); }
});
