import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { READINESS_STANDARD } from '../integration/compatibility/usability/v2/contract.mjs';

export const guidanceFiles = ['README.md', 'docs/README.md', 'docs/installation.md', 'docs/capabilities.md', 'docs/codex.md', 'docs/native-workflow.md', 'docs/migration.md', 'docs/migration-v080-v081.md', 'docs/testing.md', 'docs/first-journey.md', ...['runtime', 'harness', 'ontology'].map(owner => 'projects/evopilot-' + owner + '/docs/README.md')];
const section = (text, heading) => {
  const start = text.indexOf(heading + '\n');
  assert(start >= 0, 'Missing current guidance section: ' + heading);
  return text.slice(start + heading.length).split(/\n## /)[0];
};

// Maintenance evidence only. The public v2 contract and actual plugin manifest
// are independent inputs; historical v1 sections must remain available.
export function validateCurrentGuidance({ version, plugin, documents, standard = READINESS_STANDARD }) {
  assert.equal(standard.requiresExecution, false, 'Current v2 content standard unexpectedly requires execution');
  assert.equal(plugin.version, version, 'Plugin version differs from the product');
  const displayName = plugin.interface.displayName;
  assert.equal(displayName, 'EvoPilot v' + version + ' Preview');
  for (const file of guidanceFiles) assert(documents[file]?.trim(), 'Missing guidance: ' + file);
  for (const file of ['README.md', 'docs/installation.md', 'docs/codex.md']) {
    assert(documents[file].includes(displayName), 'Current plugin selection missing in ' + file);
    for (const match of documents[file].matchAll(/EvoPilot v[\d.]+ Preview/g)) assert.equal(match[0], displayName, 'Stale plugin selection in ' + file);
  }
  for (const [file, heading] of [['docs/README.md', '## v' + version + ' Preview'], ['docs/capabilities.md', '## Current asset readiness (v2)'], ['docs/native-workflow.md', '## Current modeling purpose (v2)']]) {
    const current = section(documents[file], heading).split(/\n### Historical/)[0];
    assert(current.includes('standardVersion: "v2"') && current.includes('L3') && current.includes('NOT_REQUESTED'), 'Current v2 grading/routing missing in ' + file);
    assert(current.includes('does not require') && current.includes('reconstruction'), 'Current v2 execution separation missing in ' + file);
    assert(!/L3[^.\n]*(?<!not )\brequires? (?:two|real|actual|software)/i.test(current), 'Historical reconstruction prerequisite leaked into current v2 guidance in ' + file);
    assert(current.includes('asset-readiness-v081-workflow.md'), 'Current entry must route to explicit v2 workflow in ' + file);
    assert(/Historical usability v1/.test(documents[file]), 'Retained v1 semantics need an explicit historical label in ' + file);
  }
  for (const owner of ['runtime', 'harness', 'ontology']) {
    const file = 'projects/evopilot-' + owner + '/docs/README.md';
    const current = section(documents[file], '## v' + version + ' Preview').split(/\n### Historical/)[0];
    assert(current.includes('standardVersion: "v2"') && current.includes('NOT_REQUESTED') && current.includes('does not require') && current.includes('readiness-v2.md'), 'Current owner v2 grading/routing missing in ' + file);
    assert(!/requires two clean/.test(current), 'Historical reconstruction prerequisite leaked into current owner guidance in ' + file);
    assert(documents[file].includes('### Historical usability v1'), 'Owner v1 history must be labeled');
  }
  for (const file of ['README.md', 'docs/installation.md', 'docs/first-journey.md']) {
    assert(documents[file].includes('migration.md#current-upgrade-route') && documents[file].includes('migration-v080-v081.md'), 'Current migration routing missing in ' + file);
    assert(!/migration\.md#upgrade-from-v0[67]-to-v0[78]0/.test(documents[file]), 'Old migration route used by current install entry in ' + file);
  }
  for (const file of ['docs/installation.md', 'docs/migration.md']) assert(documents[file].includes('Runtime 8 / Harness 8 / Ontology 5'), 'Current v2 state markers missing in ' + file);
  assert(documents['docs/migration-v080-v081.md'].includes('markers to 8') && documents['docs/migration-v080-v081.md'].includes('marker to 5'), 'Current migration contract differs from entry guidance');
  assert(documents['docs/testing.md'].includes('72 variants: 63 before release and nine after publication'), 'Current acceptance route is stale');
  return { status: 'PASS', version, checkedDocuments: guidanceFiles.length, standardVersion: 'v2', authority: false };
}

export function checkCurrentGuidance(root = fileURLToPath(new URL('../', import.meta.url))) {
  const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
  return validateCurrentGuidance({ version: read('package.json').version, plugin: read('plugins/codex/.codex-plugin/plugin.json'), documents: Object.fromEntries(guidanceFiles.map(p => [p, fs.readFileSync(path.join(root, p), 'utf8')])) });
}
