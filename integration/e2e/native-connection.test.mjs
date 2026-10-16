import test from 'node:test';
import assert from 'node:assert/strict';
import { assembly } from './connection.test.mjs';

test('installed daemon routes corrected-v1 public APIs; missing bindings and legacy write attempts fail closed', async () => {
  const f = await assembly(true), scope = { visibility: 'private', projectId: 'synthetic' };
  try {
    await f.api.activateConnection(f.configPath);
    const state = await f.api.callConnection(f.configPath, 'native', { owner: 'runtime', envelope: { operation: 'workspace.inspect', scope, input: {} } });
    assert.equal(state.revision, 0);
    for (const owner of ['ontology', 'harness']) {
      const standard = await f.api.callConnection(f.configPath, 'native', { owner, envelope: { operation: 'standard.inspect', scope, input: {} } });
      assert.match(standard.standardDigest, /^sha256:[a-f0-9]{64}$/);
      await assert.rejects(f.api.callConnection(f.configPath, 'request', { owner, envelope: { operation: 'asset.create', scope, input: {}, requestId: 'legacy-write', expectedRevision: 0 } }));
    }
    await assert.rejects(f.api.callConnection(f.configPath, 'native_project', { operation: 'inspect', input: { scope, id: 'none' } }), { code: 'WORKSPACE_UNCONFIGURED' });
    await assert.rejects(f.api.callConnection(f.configPath, 'native', { owner: 'runtime', envelope: { operation: 'project.prepare', scope, input: {}, requestId: 'invalid-native', expectedRevision: 0 } }));
    const after = await f.api.callConnection(f.configPath, 'native', { owner: 'runtime', envelope: { operation: 'workspace.inspect', scope, input: {} } });
    assert.equal(after.revision, 0);
  } finally { await f.cleanup(); }
});
