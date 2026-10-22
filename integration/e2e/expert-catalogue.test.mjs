import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { scenarioCatalogue, scenarioIds, guideNames, getScenario } from '../../dist/expert/core/scenarios.js';
import { getGuide, scenarios } from '../../dist/expert/core/guide.js';
import { loadInstalledProducts } from '../../dist/integration/composition.js';

const nativeIds = ['V06-U01', 'V06-U02', 'V06-U03', 'V06-U04', 'V06-U05', 'V05-U01', 'V05-U02', 'V05-U03', 'V05-U04', 'V05-U05', 'V04-U01', 'V04-U02', 'V04-U03', 'V03-U01', 'V03-U02', 'V03-U03', 'V03-U04', 'V03-U05', 'V03-U06'];
const root = fileURLToPath(new URL('../../', import.meta.url));

test('V02 catalogue metadata: exact approved IDs, bidirectional guide coverage, required branches and existing E2E bindings', () => {
  const target = JSON.parse(readFileSync(new URL('../../governance/workspace-v02.json', import.meta.url)));
  assert.deepEqual(scenarioIds, target.scenarioIds);
  assert.equal(new Set(scenarioIds).size, 27);
  assert.deepEqual(new Set(scenarios), new Set([...guideNames, 'operations-profile', 'response-assess', 'response-execute', 'response-recovery', 'response-learning', 'runtime-feedback', 'asset-feedback-review', 'feedback-recovery', 'online-setup', 'online-observe', 'online-repair', 'online-regression', 'online-recovery', 'readable-assets', 'draft-preflight', 'planning-explore', 'planning-review', 'planning-resume', 'planning-handoff', ...Array.from({length:6},(_,i)=>'V07-U0'+(i+1)), ...nativeIds, ...scenarioIds]));
  const documented = readFileSync(new URL('../../docs/expert-scenarios.md', import.meta.url), 'utf8');
  for (const entry of scenarioCatalogue) {
    assert(guideNames.includes(entry.guide));
    for (const name of ['preconditions', 'prompts', 'operations', 'expectedOutputs', 'unchanged', 'automatedTests', 'requiredBranches']) {
      assert(entry[name].length > 0, `${entry.id} has no ${name}`);
      assert.equal(new Set(entry[name]).size, entry[name].length, `${entry.id} duplicate ${name}`);
    }
    assert.equal(entry.desktopEvidence.required, true);
    assert(entry.desktopEvidence.observations.length > 0);
    for (const file of entry.automatedTests) {
      assert.match(file, /^(integration|projects\/evopilot-(runtime|harness|ontology)\/tests)\/e2e\/[a-z0-9-]+\.test\.mjs$/);
      assert(existsSync(join(root, file)), `${entry.id}: missing actual test file ${file}`);
    }
    assert(documented.includes(`| ${entry.id} |`), `${entry.id} absent from user-facing catalogue`);
    assert.equal(getGuide(entry.id).useCase.id, entry.id);
    assert.equal(getGuide(entry.id).useCase.historicalReadOnly, true);
    assert.deepEqual(getGuide(entry.id).useCase.operations, getGuide(entry.guide).operations);
  }
  for (const guide of guideNames) assert(scenarioCatalogue.some(item => item.guide === guide), `orphan guide ${guide}`);
  const copy = getScenario('V02-A02'); copy.preconditions.length = 0;
  assert(getScenario('V02-A02').preconditions.length > 0);
  assert(Object.isFrozen(scenarioCatalogue));
  assert(Object.isFrozen(scenarioCatalogue[0].requiredBranches));
  assert.throws(() => getScenario('V02-A99'), { code: 'INVALID_REQUEST' });
});

test('Current guides: real public owner capabilities contain every named operation without initializing state', async t => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'evopilot-expert-catalogue-')));
  t.after(() => rmSync(scratch, { force: true, recursive: true }));
  const workspaceRoot = join(scratch, 'not-created');
  const apis = await loadInstalledProducts();
  const services = [apis.runtime.createRuntimeService, apis.harness.createHarnessService, apis.ontology.createOntologyService]
    .map(create => create({ workspaceRoot, workspaceId: 'catalogue-only' }));
  try {
    const operations = new Set(services.flatMap(service => [...service.capabilities().operations, ...(service.capabilities().nativeOperations ?? []), ...(service.capabilities().feedbackOperations ?? []), ...(service.capabilities().onlineOperations ?? []), ...(service.capabilities().responseOperations ?? [])]));
    for (const id of nativeIds) for (const operation of getGuide(id).operations) {
      if (operation.startsWith('evopilot_v01_')) continue;
      assert(operations.has(operation), `${id}: operation ${operation} is absent from all actual owner capabilities`);
    }
    assert.equal(existsSync(workspaceRoot), false);
  } finally { for (const service of services) service.close(); }
});

test('V02-A01: actual compiled MCP reads all concrete guides with no config, activation or filesystem writes', () => {
  const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'synthetic-catalogue-e2e', version: '0.2.0' } } };
  const frames = [initialize, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, ...[...scenarioIds, ...nativeIds].map((scenario, index) => ({ jsonrpc: '2.0', id: index + 3, method: 'tools/call', params: { name: 'evopilot_v01_guide', arguments: { scenario } } }))];
  const child = spawnSync(process.execPath, ['--permission', '--allow-fs-read=' + root, join(root, 'dist/plugins/codex/server.js'), '--config', join(root, 'nonexistent-passive-guide-config.json')], {
    input: frames.map(frame => JSON.stringify(frame)).join('\n') + '\n', encoding: 'utf8', timeout: 10000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, OPENSSL_CONF: '/dev/null' },
  });
  assert.ifError(child.error); assert.equal(child.status, 0, child.stderr); assert.equal(child.stderr, '');
  const replies = child.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(replies.length, frames.length);
  const toolIds = new Set(replies[1].result.tools.map(tool => tool.name));
  for (const entry of scenarioCatalogue) for (const operation of entry.operations.filter(operation => operation.startsWith('evopilot_v01_'))) {
    assert(toolIds.has(operation), `${entry.id}: missing actual MCP tool ${operation}`);
  }
  for (const [index, id] of [...scenarioIds, ...nativeIds].entries()) {
    const response = replies[index + 2].result.structuredContent;
    assert.equal(response.sessionActive, false); assert.equal(response.connection, null);
    assert.equal(response.result.scenario, id); assert.deepEqual(response.result.useCase, getGuide(id).useCase);
    assert.equal(response.result.authority, false);
  }
});
