import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assembly } from './connection.test.mjs';

const source = fileURLToPath(new URL('../../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const f = await assembly(true);
  for (const relative of ['dist/integration/workspace', 'workspace/templates']) fs.cpSync(path.join(source, relative), path.join(f.install, relative), { recursive: true });
  const files = [];
  function walk(relative = '') {
    for (const name of fs.readdirSync(path.join(f.install, relative))) {
      const key = relative ? relative + '/' + name : name, item = path.join(f.install, key);
      if (fs.lstatSync(item).isDirectory()) walk(key);
      else files.push({ path: key, sha256: sha(fs.readFileSync(item)) });
    }
  }
  walk();
  const managed = path.join(f.base, 'managed'); fs.mkdirSync(managed, { mode: 0o700 });
  const configPath = path.join(managed, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ ...f.config, workspaceRoot: null, workspaceId: null, manifest: files }), { mode: 0o600 });
  const bootstrap = await import(pathToFileURL(path.join(f.install, 'dist/integration/workspace/bootstrap.js')).href);
  const upgrade = await import(pathToFileURL(path.join(f.install, 'dist/integration/workspace/upgrade.js')).href);
  const setup = { projectRoot: path.join(f.base, 'user-project'), stateRoot: path.join(f.base, 'service-state'), workspaceId: 'upgrade-user', requestId: 'initialize' };
  await bootstrap.setupWorkspace(configPath, setup);
  const context = { ...setup, installationRoot: f.install, configPath };
  return { ...f, context, upgrade, files, marker: path.join(setup.projectRoot, 'workspace-project.json'), async cleanup() { await f.api.stopConnection(configPath); await f.cleanup(); } };
}
const input = { requestId: 'upgrade-template', expectedTemplateVersion: '0.1.1', targetTemplateVersion: '0.2.0' };
function priorMarker(f, version = '0.1.1') {
  // Synthetic prior compatible metadata, never an edited real user Workspace.
  const marker = JSON.parse(fs.readFileSync(f.marker)); marker.templateVersion = version;
  fs.writeFileSync(f.marker, JSON.stringify(marker, null, 2) + '\n');
}

test('V02-D04: actual installed templates upgrade compatible metadata, fill missing files and preserve customization, state and inventory', async () => {
  const f = await fixture();
  try {
    priorMarker(f);
    const originalMarker = fs.readFileSync(f.marker), readme = path.join(f.context.projectRoot, 'README.md');
    fs.appendFileSync(readme, '\nUser customization: keep this verbatim.\n');
    const custom = fs.readFileSync(readme), example = path.join(f.context.projectRoot, 'examples/forward/README.md');
    fs.unlinkSync(example);
    const configBefore = fs.readFileSync(f.context.configPath), stateBefore = fs.readFileSync(path.join(f.context.stateRoot, 'workspace.json'));
    const result = await f.upgrade.upgradeWorkspaceProject(f.context, input);
    assert.equal(result.status, 'UPGRADED'); assert.equal(result.authority, false);
    assert(result.created.includes('examples/forward/README.md'));
    assert.deepEqual(result.conflicts.find(item => item.path === 'README.md'), { path: 'README.md', resolution: 'PRESERVED_CUSTOMIZED' });
    assert.deepEqual(fs.readFileSync(readme), custom);
    assert.deepEqual(fs.readFileSync(example), fs.readFileSync(path.join(f.install, 'workspace/templates/project/examples/forward/README.md')));
    assert.deepEqual(fs.readFileSync(result.markerBackupPath), originalMarker);
    assert.equal(JSON.parse(fs.readFileSync(f.marker)).templateVersion, '0.2.0');
    const replay = await f.upgrade.upgradeWorkspaceProject(f.context, input);
    assert.equal(replay.reused, true); assert.deepEqual(replay.conflicts, result.conflicts);
    assert.deepEqual(fs.readFileSync(f.context.configPath), configBefore);
    assert.deepEqual(fs.readFileSync(path.join(f.context.stateRoot, 'workspace.json')), stateBefore);
    for (const item of f.files) assert.equal(sha(fs.readFileSync(path.join(f.install, item.path))), item.sha256);
  } finally { await f.cleanup(); }
});

test('V02-D04/D05: unsupported version, stale expectation, changed installation and unsafe destination are refused before upgrade writes', async () => {
  for (const mode of ['unsupported', 'stale', 'changed-installation', 'symlink']) {
    const f = await fixture();
    try {
      priorMarker(f, mode === 'unsupported' ? '99.0.0' : '0.1.1');
      if (mode === 'changed-installation') fs.appendFileSync(path.join(f.install, 'workspace/templates/project/README.md'), '\nUnbound bytes\n');
      if (mode === 'symlink') { const filename = path.join(f.context.projectRoot, 'README.md'); fs.unlinkSync(filename); fs.symlinkSync(path.join(f.install, 'workspace/templates/project/README.md'), filename); }
      const before = fs.readFileSync(f.marker);
      const request = mode === 'stale' ? { ...input, expectedTemplateVersion: '0.2.0' } : input;
      await assert.rejects(() => f.upgrade.upgradeWorkspaceProject(f.context, request), error => ['PROJECT_IDENTITY', 'TEMPLATE_VERSION_CONFLICT', 'INSTALLATION_DIGEST', 'SYMLINK'].includes(error.code));
      assert.deepEqual(fs.readFileSync(f.marker), before);
      assert(!fs.existsSync(path.join(f.context.projectRoot, '.evopilot-template-upgrades')));
    } finally {
      // A intentionally corrupted fixture cannot pass connection configuration validation.
      await f.cleanup().catch(() => fs.rmSync(f.base, { recursive: true, force: true }));
    }
  }
});

test('V02-D04: current templates are explicit no-overwrite maintenance, incompatible requests and identity mismatch never mutate files', async () => {
  const f = await fixture();
  try {
    const before = fs.readFileSync(f.marker);
    const current = await f.upgrade.upgradeWorkspaceProject(f.context, { ...input, expectedTemplateVersion: '0.2.0' });
    assert.equal(current.status, 'CURRENT'); assert.deepEqual(current.created, []);
    assert.deepEqual(fs.readFileSync(f.marker), before);
    for (const invalid of [{ ...input, expectedTemplateVersion: '0.0.1' }, { ...input, targetTemplateVersion: '2.0.0' }, { ...input, requestId: '../escape' }]) {
      await assert.rejects(() => f.upgrade.upgradeWorkspaceProject(f.context, invalid), { code: 'TEMPLATE_VERSION' });
    }
    await assert.rejects(() => f.upgrade.upgradeWorkspaceProject({ ...f.context, workspaceId: 'foreign' }, input), { code: 'TEMPLATE_UPGRADE_IDENTITY' });
    assert.deepEqual(fs.readFileSync(f.marker), before);
  } finally { await f.cleanup(); }
});

test('V02-D04: installation lease serializes concurrent upgrades and a retained plan recovers an interrupted marker commit', async () => {
  const f = await fixture();
  try {
    priorMarker(f);
    const missing = path.join(f.context.projectRoot, 'examples/forward/README.md'); fs.unlinkSync(missing);
    const [result, duplicate] = await Promise.all([
      f.upgrade.upgradeWorkspaceProject(f.context, input),
      f.upgrade.upgradeWorkspaceProject(f.context, input)
    ]);
    assert.equal(result.reused, false); assert.equal(duplicate.reused, true);
    assert.deepEqual(duplicate.created, result.created);
    // Synthetic interruption boundary after files and journal persisted but before marker commit.
    fs.writeFileSync(f.marker, fs.readFileSync(result.markerBackupPath));
    const restored = await f.upgrade.upgradeWorkspaceProject(f.context, input);
    assert.equal(restored.reused, true); assert.equal(JSON.parse(fs.readFileSync(f.marker)).templateVersion, '0.2.0');
    assert(!fs.existsSync(path.join(f.context.projectRoot, '.evopilot-template-upgrade.lock')));
    fs.appendFileSync(missing, '\nUser changed a file after this request.\n');
    const customized = fs.readFileSync(missing);
    await assert.rejects(() => f.upgrade.upgradeWorkspaceProject(f.context, input), { code: 'TEMPLATE_UPGRADE_CONFLICT' });
    assert.deepEqual(fs.readFileSync(missing), customized);
  } finally { await f.cleanup(); }
});

test('V02-D04: an interrupted reserved staging write resumes without exposing partial final files', async () => {
  const f = await fixture();
  try {
    priorMarker(f);
    const missing = path.join(f.context.projectRoot, 'examples/forward/README.md'); fs.unlinkSync(missing);
    const records = path.join(f.context.projectRoot, '.evopilot-template-upgrades'); fs.mkdirSync(records, { mode: 0o700 });
    const staging = path.join(records, '.staging-' + input.requestId); fs.mkdirSync(staging, { mode: 0o700 });
    // A synthetic process-death boundary during write, before atomic final rename.
    fs.writeFileSync(path.join(staging, sha(missing) + '.pending'), 'partial', { mode: 0o600 });
    fs.writeFileSync(path.join(staging, sha(path.join(records, input.requestId + '.json')) + '.pending'), '', { mode: 0o600 });
    assert(!fs.existsSync(missing));
    const result = await f.upgrade.upgradeWorkspaceProject(f.context, input);
    assert.equal(result.status, 'UPGRADED');
    assert.deepEqual(fs.readFileSync(missing), fs.readFileSync(path.join(f.install, 'workspace/templates/project/examples/forward/README.md')));
    assert(!fs.existsSync(staging));
  } finally { await f.cleanup(); }
});
