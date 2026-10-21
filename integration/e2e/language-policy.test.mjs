import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { checkLanguages } from '../../scripts/check-languages.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'evopilot-language-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function write(name, value) {
    const path = join(root, name); mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const legacy = 'export const legacy = true;\n', hash = b => createHash('sha256').update(b).digest('hex');
  const policy = { schema: 'evopilot-language-policy/v1', coreRoots: ['src'], generatedModules: { 'src/service.js': {source: 'src/service.ts', generator: 'fixture'} }, excludeSubtrees: [], frozenJavaScript: { 'src/legacy.mjs': hash(legacy) }, nativePython: { 'src/validator.py': { sha256: hash('pass\n') } } };
  write('governance/language-policy.json', policy); write('src/legacy.mjs', legacy); write('src/validator.py', 'pass\n');
  write('src/service.ts', 'export const value: number = 1;\n'); write('src/service.js', 'export const value = 1;\n');
  for (const repo of ['', 'projects/evopilot-runtime/', 'projects/evopilot-harness/', 'projects/evopilot-ontology/']) write(repo + 'tsconfig.json', { compilerOptions: { strict: true, declaration: true } });
  return { root, write };
}
test('language boundary accepts typed source, generated JS and exact named historical/native adapters', async t => {
  const f = fixture(t); const result = await checkLanguages(f.root);
  assert.equal(result.status, 'PASS'); assert.equal(result.typescript, 1); assert.equal(result.generatedJavaScript, 1);
  f.write('src/untyped.js', 'export const bypass = true;');
  await assert.rejects(checkLanguages(f.root), /no TypeScript source/);
  f.write('src/untyped.ts', 'export const bypass: boolean = true;');
  await assert.rejects(checkLanguages(f.root), /Unlisted generated core JavaScript/);
});
test('language boundary rejects changed compatibility or expanded Python product logic', async t => {
  const f = fixture(t); f.write('src/legacy.mjs', 'export const legacy = false;');
  await assert.rejects(checkLanguages(f.root), /Frozen JavaScript changed/);
  f.write('src/legacy.mjs', 'export const legacy = true;\n'); f.write('src/workflow.py', 'pass\n');
  await assert.rejects(checkLanguages(f.root), /Unlisted Python/);
});
test('language boundary rejects disabling type checks and explicit any', async t => {
  const f = fixture(t); f.write('src/service.ts', '// @ts-nocheck\nexport const x = 1;');
  await assert.rejects(checkLanguages(f.root), /Type checking disabled/);
  f.write('src/service.ts', 'export const x: any = 1;');
  await assert.rejects(checkLanguages(f.root), /Explicit any/);
});
