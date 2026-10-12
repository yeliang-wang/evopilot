import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, CHILDREN, assertNoSymlinks, readCanonical, syncContract } from './sync-contract.mjs';
import { checkRoadmap } from './roadmap.mjs';

export async function checkPackages() {
  for (const [index, directory] of ['.', ...CHILDREN].entries()) {
    const path = resolve(ROOT, directory, 'package.json');
    await assertNoSymlinks(path);
    const pkg = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(pkg.name, `@evopilot-next/${['stack', 'runtime', 'harness', 'ontology'][index]}`);
    assert.equal(pkg.version, '0.1.0');
    assert.equal(pkg.private, true);
    assert.equal(pkg.type, 'module');
  assert.equal(pkg.license, 'Apache-2.0');
    assert.deepEqual(pkg.engines, { node: '>=24.14.0' });
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      if (index === 3 && field === "dependencies") assert.deepEqual(pkg.dependencies, { ajv: "8.20.0", yaml: "2.9.0" });
      else if (index === 2 && field === 'dependencies') assert.deepEqual(pkg.dependencies, { yaml: '2.9.0' });
      else assert.equal(Object.keys(pkg[field] ?? {}).length, 0, `${field} must be empty`);
    }
    assert.equal(pkg.bin, undefined);
    assert.deepEqual(pkg.scripts, index ? {
      build: 'node scripts/check.mjs', check: 'node scripts/check.mjs',
      test: index === 1 ? 'node --test tests/e2e/reference.test.mjs' : 'node --test tests/e2e/*.test.mjs',
    } : {
      'artifacts:verify': 'node scripts/verify-artifacts.mjs',
      'components:lock': 'node scripts/lock-components.mjs',
      'roadmap:gate': 'node scripts/roadmap.mjs --gate',
      'roadmap:check': 'node scripts/roadmap.mjs --check',
      'roadmap:release': 'node scripts/roadmap.mjs --release',
      check: 'node scripts/check.mjs', build: 'node scripts/sync-contract.mjs',
      test: 'node --test integration/e2e/*.test.mjs projects/evopilot-runtime/tests/e2e/reference.test.mjs projects/evopilot-harness/tests/e2e/*.test.mjs projects/evopilot-ontology/tests/e2e/*.test.mjs',
    });
    if (index) {
      assert.deepEqual(pkg.files, index === 3 ? ['src', 'vendor', 'README.md', 'specifications', 'examples', 'schemas', 'docs', 'provenance', 'LICENSE', 'NOTICE', 'assets'] : index === 2 ? ['src', 'vendor', 'README.md', 'specifications', 'examples', 'assets', 'docs', 'provenance', 'LICENSE', 'NOTICE'] : ['src', 'vendor', 'README.md', 'docs', 'LICENSE', 'NOTICE']);
      assert.deepEqual(pkg.exports, index === 3 ? { '.': './src/index.mjs', './compat': './src/compat/index.mjs', './migration': './src/migration.mjs', './sources': './src/asset-sources.mjs' } : index === 2 ? { '.': './src/index.mjs', './sources': './src/asset-sources.mjs' } : './src/index.mjs');
      const sourcePath = resolve(ROOT, directory, 'src/index.mjs');
      await assertNoSymlinks(sourcePath);
      const source = await readFile(sourcePath, 'utf8');
      assert(source.includes("export const VERSION = '0.1.0';"));
      assert(source.includes(`export const PRODUCT = '${['runtime', 'harness', 'ontology'][index - 1]}';`));
    }
  }
  await readCanonical();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const failures = [];
  if (process.argv.length !== 2) failures.push('Unknown check arguments');
  for (const check of [checkPackages, checkRoadmap, () => syncContract({ check: true }),
    ...CHILDREN.map(child => async () => (await import(pathToFileURL(resolve(ROOT, child, 'scripts/check.mjs')).href)).checkSource())]) {
    try { await check(); } catch (error) { failures.push(error.message); }
  }
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log('Source, governance and pinned vendor checks passed; no acceptance inferred');
}
