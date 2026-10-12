import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, CHILDREN, assertNoSymlinks, readCanonical, syncContract } from './sync-contract.mjs';
import { checkRoadmap } from './roadmap.mjs';

// Bounded M2 metadata; only Ontology's CLI may remain pending until M4.
export function validateProductMetadata(pkg, owner, checkpoint = 'M2') {
  assert(['M2', 'M4'].includes(checkpoint), 'Unknown metadata checkpoint');
  assert(['runtime', 'harness', 'ontology'].includes(owner), 'Unknown product');
  assert.equal(pkg.name, '@evopilot-next/' + owner);
  assert.equal(pkg.version, '0.1.0');
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.license, 'Apache-2.0');
  assert.deepEqual(pkg.engines, { node: '>=24.14.0' });
  const cli = pkg.bin === undefined ? 'PENDING' : 'PRESENT';
  if (checkpoint === 'M4' || owner !== 'ontology' || pkg.bin !== undefined)
    assert.deepEqual(pkg.bin, { ['evopilot-next-' + owner]: 'src/cli.mjs' });
  assert.deepEqual(pkg.dependencies ?? {}, owner === 'runtime' ? {} : owner === 'harness' ? { yaml: '2.9.0' } : { ajv: '8.20.0', yaml: '2.9.0' });
  for (const field of ['devDependencies', 'peerDependencies', 'optionalDependencies']) assert.deepEqual(pkg[field] ?? {}, {});
  assert.deepEqual(pkg.scripts, { build: 'node scripts/check.mjs', check: 'node scripts/check.mjs', test: 'node --test tests/e2e/*.test.mjs' });
  assert.deepEqual(pkg.files, owner === 'runtime' ? ['src', 'vendor', 'README.md', 'docs', 'LICENSE', 'NOTICE', 'provenance']
    : owner === 'harness' ? ['src', 'vendor', 'README.md', 'specifications', 'examples', 'assets', 'docs', 'provenance', 'LICENSE', 'NOTICE']
    : ['src', 'vendor', 'README.md', 'specifications', 'examples', 'schemas', 'docs', 'provenance', 'LICENSE', 'NOTICE', 'assets']);
  assert.deepEqual(pkg.exports, owner === 'runtime' ? { '.': './src/index.mjs', './service': './src/service.mjs' }
    : owner === 'harness' ? { '.': './src/index.mjs', './sources': './src/asset-sources.mjs', './service': './src/service.mjs' }
    : { '.': './src/index.mjs', './compat': './src/compat/index.mjs', './migration': './src/migration.mjs', './sources': './src/asset-sources.mjs', './service': './src/service.mjs' });
  return Object.freeze({ product: owner, checkpoint, cli, allBinsRequiredAt: 'M4' });
}

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
    if (!index) assert.equal(pkg.bin, undefined);
    assert.deepEqual(pkg.scripts, index ? {
      build: 'node scripts/check.mjs', check: 'node scripts/check.mjs',
      test: 'node --test tests/e2e/*.test.mjs',
    } : {
      'artifacts:verify': 'node scripts/verify-artifacts.mjs',
      'components:lock': 'node scripts/lock-components.mjs',
      'roadmap:gate': 'node scripts/roadmap.mjs --gate',
      'roadmap:check': 'node scripts/roadmap.mjs --check',
      'roadmap:release': 'node scripts/roadmap.mjs --release',
      check: 'node scripts/check.mjs', build: 'node scripts/sync-contract.mjs',
      test: 'node --test integration/e2e/*.test.mjs projects/evopilot-runtime/tests/e2e/*.test.mjs projects/evopilot-harness/tests/e2e/*.test.mjs projects/evopilot-ontology/tests/e2e/*.test.mjs',
    });
    if (index) {
      validateProductMetadata(pkg, ['runtime', 'harness', 'ontology'][index - 1]);
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
