import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, CHILDREN, assertNoSymlinks, readCanonical, syncContract } from './sync-contract.mjs';
import { checkRoadmap } from './roadmap.mjs';

// Exact current delivery metadata; historical governance stays independent.
export function validateProductMetadata(pkg, owner, checkpoint = 'M2') {
  assert(['M2', 'M4'].includes(checkpoint), 'Unknown metadata checkpoint');
  assert(['runtime', 'harness', 'ontology'].includes(owner), 'Unknown product');
  assert.equal(pkg.name, '@evopilot-next/' + owner);
  assert.equal(pkg.version, '0.3.0');
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.license, 'Apache-2.0');
  assert.deepEqual(pkg.engines, { node: '>=24.14.0' });
  const cli = pkg.bin === undefined ? 'PENDING' : 'PRESENT';
    assert.deepEqual(pkg.bin, { ['evopilot-next-' + owner]: 'dist/cli.js' });
  assert.deepEqual(pkg.dependencies ?? {}, owner === 'runtime' ? {} : owner === 'harness' ? { yaml: '2.9.0' } : { ajv: '8.20.0', yaml: '2.9.0' });
  assert.deepEqual(pkg.devDependencies, { typescript: '5.9.3', '@types/node': '24.19.2' });
  for (const field of ['peerDependencies', 'optionalDependencies']) assert.deepEqual(pkg[field] ?? {}, {});
  assert.deepEqual(pkg.scripts, { build: 'node scripts/build.mjs', check: owner === 'ontology' ? 'tsc --noEmit && node scripts/check.mjs' : 'node scripts/check.mjs', test: 'node --test tests/e2e/*.test.mjs' });
  assert.deepEqual([...pkg.files].sort(), ( owner === 'runtime' ? ['dist', 'src', 'vendor', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'docs', 'LICENSE', 'NOTICE', 'provenance']
    : owner === 'harness' ? ['dist', 'src', 'vendor', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'specifications', 'examples', 'assets', 'docs', 'provenance', 'LICENSE', 'NOTICE']
    : ['dist', 'src', 'vendor', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'specifications', 'examples', 'schemas', 'docs', 'provenance', 'LICENSE', 'NOTICE', 'assets']).sort());
  const names = { '.': 'index', ...(owner === 'ontology' ? { './compat': 'compat/index', './migration': 'migration' } : {}), ...(owner !== 'runtime' ? { './sources': 'asset-sources' } : {}), './service': 'service', './workspace-migration': 'workspace-migration', ...(owner === 'harness' ? { './native': 'native' } : {}) };
  assert.deepEqual(pkg.exports, Object.fromEntries(Object.entries(names).map(([key, name]) => [key, { types: './dist/' + name + (key === './compat' ? '.d.mts' : '.d.ts'), import: './dist/' + name + (key === './compat' ? '.mjs' : '.js') }])));
  return Object.freeze({ product: owner, checkpoint, cli, allBinsRequiredAt: 'M4' });
}

export async function checkPackages() {
  for (const [index, directory] of ['.', ...CHILDREN].entries()) {
    const path = resolve(ROOT, directory, 'package.json');
    await assertNoSymlinks(path);
    const pkg = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(pkg.name, `@evopilot-next/${['stack', 'runtime', 'harness', 'ontology'][index]}`);
    assert.equal(pkg.version, '0.3.0');
    assert.equal(pkg.private, true);
    assert.equal(pkg.type, 'module');
  assert.equal(pkg.license, 'Apache-2.0');
    assert.deepEqual(pkg.engines, { node: '>=24.14.0' });
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      if (field === 'devDependencies') assert.deepEqual(pkg[field], { typescript: '5.9.3', '@types/node': '24.19.2' });
      else if (index === 3 && field === "dependencies") assert.deepEqual(pkg.dependencies, { ajv: "8.20.0", yaml: "2.9.0" });
      else if (index === 2 && field === 'dependencies') assert.deepEqual(pkg.dependencies, { yaml: '2.9.0' });
      else assert.equal(Object.keys(pkg[field] ?? {}).length, 0, `${field} must be empty`);
    }
    if (!index) assert.equal(pkg.bin, undefined);
    assert.deepEqual(pkg.scripts, index ? {
      build: 'node scripts/build.mjs', check: index === 3 ? 'tsc --noEmit && node scripts/check.mjs' : 'node scripts/check.mjs',
      test: 'node --test tests/e2e/*.test.mjs',
    } : {
      'artifacts:verify': 'node scripts/verify-artifacts.mjs',
      'components:lock': 'node scripts/lock-components.mjs',
      'roadmap:gate': 'node scripts/roadmap.mjs --gate',
      'roadmap:check': 'node scripts/roadmap.mjs --check',
      'roadmap:release': 'node scripts/roadmap.mjs --release',
      check: 'node scripts/check.mjs', build: 'node scripts/build.mjs',
      test: 'node --test integration/e2e/*.test.mjs projects/evopilot-runtime/tests/e2e/*.test.mjs projects/evopilot-harness/tests/e2e/*.test.mjs projects/evopilot-ontology/tests/e2e/*.test.mjs',
    });
    if (index) {
      validateProductMetadata(pkg, ['runtime', 'harness', 'ontology'][index - 1]);
      const sourcePath = resolve(ROOT, directory, 'src/index.ts');
      await assertNoSymlinks(sourcePath);
      const source = await readFile(sourcePath, 'utf8');
      assert(source.includes("export const VERSION = '0.3.0';"));
      assert(source.includes(`export const PRODUCT = '${['runtime', 'harness', 'ontology'][index - 1]}';`));
    }
  }
  await readCanonical();
  await checkStrictConsumers();
}

export async function checkStrictConsumers() {
  const { default: ts } = await import('typescript');
  assert.equal(ts.version, '5.9.3');
  const file = resolve(ROOT, '__public_consumer_check.mts');
  const source = ['runtime', 'harness', 'ontology'].map((owner, i) =>
    'import * as api' + i + ' from "@evopilot-next/' + owner + '";\n' +
    'const version' + i + ': string = api' + i + '.VERSION;\n' +
    '// @ts-expect-error A typed version cannot be a number.\n' +
    'const invalid' + i + ': number = api' + i + '.VERSION;\n' +
    'import { create' + owner[0].toUpperCase() + owner.slice(1) + 'Service as service' + i + ' } from "@evopilot-next/' + owner + '/service";\n' +
    'service' + i + '({workspaceRoot: "/consumer", workspaceId: "consumer"});\n' +
    '// @ts-expect-error Service options must reject a numeric workspaceRoot.\n' +
    'service' + i + '({workspaceRoot: 1, workspaceId: "consumer"});\n').join('\n');
  const options = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: ['node'] };
  const host = ts.createCompilerHost(options), getSource = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...args) => name === file ? ts.createSourceFile(name, source, options.target, true) : getSource(name, ...args);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => ROOT, getCanonicalFileName: name => name, getNewLine: () => '\n' }));
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
