import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { canonicalDigest as digest } from '../../packages/core/dist/index.js';
import { executeExpertTurn, planExpertTurn } from '../../packages/evolution-expert/dist/index.js';
import { createServer } from '../../packages/server/dist/index.js';

test('Expert public MCP creates only a review proposal for a generic primitive gap', { timeout: 60000 }, async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'expert-primitive-gap-'));
  const server = createServer({ dataRoot, runtimeMode: 'debug', tokens: [{ name: 'admin', token: 'synthetic-token', role: 'admin' }] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new Client({ name: 'source-primitive-gap-fixture', version: '1.0.0' });
  const calls = [];
  const turn = (text, input) => executeExpertTurn(planExpertTurn(text, input), { invoke: (name, args) => {
    calls.push({ name, args });
    return client.callTool({ name, arguments: args });
  } });
  const readLifecycles = async () => {
    const response = await fetch(`${base}/api/v1/lifecycles`, { headers: { authorization: 'Bearer synthetic-token' } });
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('packages/adapter-mcp/dist/stdio.js')], env: { PATH: process.env.PATH, TMPDIR: os.tmpdir(), EVOPILOT_SERVER: base, EVOPILOT_API_TOKEN: 'synthetic-token' }, stderr: 'pipe' }));
    const before = await readLifecycles();
    const context = {
      tenantId: 'tenant-production', workspaceId: 'workspace-agent-products',
      ...Object.fromEntries(['projectDefinitionDigest', 'lifecycleRevisionDigest', 'harnessExecutionBindingDigest', 'harnessBundleDigest', 'goalTargetDigest', 'runtimeDigest', 'hostDigest', 'providerDigest', 'environmentDigest', 'authorityDigest', 'evaluatorDigest', 'scorerDigest', 'evidenceDigest'].map(key => [key, digest(`synthetic:${key}`)]))
    };
    for (const [id, gapClass] of [['generic-gap', 'GENERIC_RUNTIME_PRIMITIVE_GAP'], ['declarative-gap', 'PROJECT_LIFECYCLE_GAP']]) {
      const observed = await turn('record feedback', { id, context, signals: [{ id: 'missing-capability', kind: 'FAILURE', severity: 'MEDIUM', summary: 'Synthetic missing public comparison primitive', evidenceRefs: ['evidence://synthetic-gap'] }], capturedAt: '2026-09-26T00:00:00Z', provenance: { source: 'EXPERT_INPUT', sourceRef: 'fixture://primitive-gap' } });
      assert.equal(observed.isError, false);
      const classified = await turn('classify lifecycle observation', { observationId: id, gapClass, rationale: ['Synthetic classification for transport verification'], evidenceRefs: ['evidence://synthetic-classification'] });
      assert.equal(classified.isError, false);
    }
    const input = { observationId: 'generic-gap', id: 'generic-comparison-target', objective: 'Review a generic comparison primitive', requiredPrimitive: 'generic-safe-comparison', evidenceRefs: ['evidence://synthetic-proposal'] };
    const plan = planExpertTurn('generic primitive', input);
    assert.equal(plan.intent, 'primitive-gap');
    const response = await turn('generic primitive', input);
    assert.equal(response.isError, false, JSON.stringify(response));
    const proposal = response.structuredContent.response.data;
    assert.equal(proposal.owner, 'RUNTIME');
    assert.equal(proposal.status, 'PROPOSED_FOR_REVIEW');
    assert.equal(proposal.projectSpecificBranchAllowed, false);
    assert.equal(proposal.sourceMutationPerformed, false);
    assert.equal(proposal.unsafeActivationBlocked, true);
    assert.equal(proposal.objective, input.objective);
    assert.equal(proposal.requiredPrimitive, input.requiredPrimitive);
    const { digest: actualDigest, ...material } = proposal;
    assert.equal(actualDigest, digest(material));
    const repeated = await turn('generic primitive', input);
    assert.equal(repeated.isError, false);
    assert.deepEqual(repeated.structuredContent.response.data, proposal);
    const conflict = await turn('generic primitive', { ...input, objective: 'Different proposal under the same immutable id' });
    assert.equal(conflict.isError, true);
    assert.match(JSON.stringify(conflict.structuredContent), /GENERIC_PRIMITIVE_TARGET_PROPOSAL_IMMUTABLE_CONFLICT/);
    const wrongClass = await turn('generic primitive', { ...input, id: 'wrong-classification', observationId: 'declarative-gap' });
    assert.equal(wrongClass.isError, true);
    assert.match(JSON.stringify(wrongClass.structuredContent), /GENERIC_PRIMITIVE_TARGET_CLASSIFICATION_REQUIRED/);
    assert.deepEqual(await readLifecycles(), before);
    assert.deepEqual(calls.map(call => call.name), ['evopilot_lifecycle_observation_record', 'evopilot_lifecycle_gap_classify', 'evopilot_lifecycle_observation_record', 'evopilot_lifecycle_gap_classify', ...Array(4).fill('evopilot_generic_primitive_target_propose')]);
    assert.deepEqual(calls[4].args, { payload: input });
  } finally {
    await client.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});
