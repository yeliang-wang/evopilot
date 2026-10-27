import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBilingualDocumentation, validateBilingualReadmes, checkLocalLinks } from '../../scripts/check-bilingual-documentation.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = () => ({ version: '0.8.3', repository: 'evopilot',
  en: fs.readFileSync(path.join(root, 'README.md'), 'utf8'),
  zh: fs.readFileSync(path.join(root, 'README_CN.md'), 'utf8') });

test('all four owned bilingual entry points pass their independent guard', async () => {
  const canonical = fs.readFileSync(path.join(root, 'scripts/check-bilingual-documentation.mjs'), 'utf8');
  for (const directory of ['.', ...['runtime','harness','ontology'].map(o => 'projects/evopilot-' + o)]) {
    const child = path.join(root, directory);
    assert.equal(fs.readFileSync(path.join(child, 'scripts/check-bilingual-documentation.mjs'), 'utf8'), canonical);
    const result = await checkBilingualDocumentation(child);
    assert(result.checkedPages >= 5);
    assert.equal(result.semanticReview, 'REQUIRED_SEPARATELY');
    assert.equal(result.authority, false);
  }
});
for (const [name, before, after, error] of [
  ['missing language route', '[English](README.md)', 'English', /language switch/],
  ['stale version heading', '# EvoPilot · v0.8.3', '# EvoPilot · v0.8.2', /heading/],
  ['changed installer argument', '--installation-id preview-install', '--installation-id other-install', /code blocks/],
  ['lost reconstruction state', 'NOT_REQUESTED', 'VERIFIED', /boundary token/],
  ['wrong technical field', '`assetAssessment`', 'assetAssessment', /technical tokens/],
  ['English-only component route', '/evopilot-runtime/blob/main/README_CN.md', '/evopilot-runtime/blob/main/README.md', /Chinese product navigation/],
  ['omitted section', '## 文档与贡献', '文档与贡献', /section count/],
]) test('bilingual guard rejects ' + name, () => {
  const pair = fixture(); assert(pair.zh.includes(before));
  pair.zh = pair.zh.replace(before, after);
  assert.throws(() => validateBilingualReadmes(pair), error);
});
test('local navigation validates Chinese headings and retained aliases, rejects broken and escaping links', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evopilot-doc-links-'));
  try {
    fs.writeFileSync(path.join(tmp, 'README.md'), '# 文档\n\n## 开始使用\n\n<a id="old-entry"></a>\n');
    checkLocalLinks(tmp, 'README.md', '[中文](#开始使用) [Old](#old-entry)');
    assert.throws(() => checkLocalLinks(tmp, 'README.md', '[Missing](missing.md)'), /Missing link target/);
    assert.throws(() => checkLocalLinks(tmp, 'README.md', '[Missing](#gone)'), /Missing link anchor/);
    assert.throws(() => checkLocalLinks(tmp, 'README.md', '[Escape](../README.md)'), /escapes/);
  } finally { fs.rmSync(tmp, {recursive:true,force:true}); }
});
