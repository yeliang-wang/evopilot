import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkCurrentGuidance, validateCurrentGuidance, guidanceFiles } from '../../scripts/check-current-guidance.mjs';
const root = new URL('../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
function current() { return { version: JSON.parse(read('package.json')).version, plugin: JSON.parse(read('plugins/codex/.codex-plugin/plugin.json')), documents: Object.fromEntries(guidanceFiles.map(p => [p, read(p)])) }; }

test('current entry guidance agrees with v2 execution separation and installed plugin identity', () => assert.equal(checkCurrentGuidance().status, 'PASS'));
test('the actual historical L3 paragraph cannot be presented as current v2 guidance', () => {
  const c = current(); const p = 'docs/README.md';
  c.documents[p] = c.documents[p].replace('L3 does not require software reconstruction', 'Verified L3 requires two clean complete reconstructions');
  assert.throws(() => validateCurrentGuidance(c), /separation|prerequisite/);
});
test('old plugin display name is rejected even when package headings are current', () => {
  const c = current(); c.documents['docs/installation.md'] = c.documents['docs/installation.md'].replaceAll(c.plugin.interface.displayName, 'EvoPilot v0.8 Preview');
  assert.throws(() => validateCurrentGuidance(c), /plugin selection/);
});
test('old migration route and marker-only installation guidance are rejected', () => {
  for (const [before, after] of [['migration.md#current-upgrade-route', 'migration.md#upgrade-from-v06-to-v070'], ['Runtime 8 / Harness 8 / Ontology 5', 'Runtime reconstruction and Harness assessment use marker 7']]) {
    const c = current(); c.documents['docs/installation.md'] = c.documents['docs/installation.md'].replaceAll(before, after);
    assert.throws(() => validateCurrentGuidance(c), /migration routing|state markers/);
  }
});
test('historical v1 reconstruction semantics stay valid in explicitly historical sections', () => {
  const c = current(); c.documents['docs/README.md'] += '\n## Historical usability v1 examples\n\nV1 L3 requires two clean complete reconstructions.\n';
  assert.equal(validateCurrentGuidance(c).status, 'PASS');
});
test('a v1-required-execution contract cannot masquerade as current v2 content semantics', () => {
  assert.throws(() => validateCurrentGuidance({ ...current(), standard: { requiresExecution: true } }), /requires execution/);
});
test('each child documentation entry rejects the old current-L3 reconstruction prerequisite', () => {
  for (const owner of ['runtime', 'harness', 'ontology']) {
    const c = current(), file = 'projects/evopilot-' + owner + '/docs/README.md';
    c.documents[file] = c.documents[file].replace('L3 does not require software reconstruction', 'Verified L3 requires two clean complete reconstructions');
    assert.throws(() => validateCurrentGuidance(c), /owner v2|prerequisite/);
  }
});
test('first-journey routing cannot silently return users to the old migration procedure', () => {
  const c = current(); c.documents['docs/first-journey.md'] = c.documents['docs/first-journey.md'].replace('migration.md#current-upgrade-route', 'migration.md#upgrade-from-v07-to-v080');
  assert.throws(() => validateCurrentGuidance(c), /migration routing/);
});
test('current configuration samples and owner installation labels cannot retain obsolete releases', () => {
  const c = current(); c.documents['docs/local-service.md'] = c.documents['docs/local-service.md'].replaceAll(c.version, '0.6.0');
  assert.throws(() => validateCurrentGuidance(c), /configuration example is stale/);
  const d = current(); d.documents['projects/evopilot-ontology/docs/README.md'] = d.documents['projects/evopilot-ontology/docs/README.md'].replace('[current package installation]', '[v0.7.0 package installation]');
  assert.throws(() => validateCurrentGuidance(d), /obsolete version label/);
});
