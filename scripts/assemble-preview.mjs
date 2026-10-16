import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { archiveEntries, validateEntries, validateDependencyLock, verifyInstalledDependencies } from './verify-artifacts.mjs';
import { SOURCE, VERSION, PIN, OWNERS, sha, json, regular, tree, portable, inventory, put, canonical, newRoot, disjoint, safeRelative, exact, argumentsFor, readBundle } from './manage-preview.mjs';

// Explicit parent whitelist. Assembly helpers and source children are not runtime dependencies.
export const PARENT_FILES = ['package.json', 'README.md', 'LICENSE', 'NOTICE', 'CONTRIBUTING.md', 'SECURITY.md', 'SUPPORT.md', 'CHANGELOG.md',
  'dist', 'integration/composition.ts', 'integration/native-composition.ts', 'integration/types.ts', 'integration/compatibility', 'integration/connection', 'integration/workspace', 'integration/collection', 'integration/toolchain', 'specifications/project/v1', 'plugins/codex', 'expert',
  'docs', 'workspace/README.md', 'workspace/templates',
  'governance/roadmap.json', 'governance/implementation-lock.json', 'governance/decisions/local-implementation.json',
  'governance/acceptance.json', 'governance/m0.json', 'governance/delivery-repair-v011.json', 'governance/workspace-v02.json', 'governance/standards-v03.json', 'governance/readiness-v1.json',
  'scripts/manage-preview.mjs', 'scripts/verify-native-acceptance.mjs', 'scripts/verify-workspace-acceptance.mjs', 'scripts/verify-local-acceptance.mjs', 'scripts/roadmap.mjs'];
export function collect(root, names) {
  const files = new Map();
  const metadata = name => name.split('/').some(part => part === '.DS_Store' || part === '__MACOSX' || part.startsWith('._'));
  for (const name of names) {
    safeRelative(name); const full = path.join(root, name); canonical(full);
    if (fs.lstatSync(full).isDirectory()) {
      for (const [rel, bytes] of tree(full).files) if (!metadata(name + '/' + rel)) files.set(name + '/' + rel, bytes);
    } else if (!metadata(name)) files.set(name, regular(full));
  }
  return files;
}
// Only Markdown destinations are translated. Code, prose and unowned URLs stay
// byte-identical. Owned GitHub files map only when shipped in the complete inventory.
// Source projects/evopilot-OWNER maps to the installed npm pack.
export function installedMarkdown(markdown, filename, packagedFiles = new Map()) {
  const target = value => {
    const owned = value.match(/^https:\/\/github\.com\/yeliang-wang\/(evopilot(?:-runtime|-harness|-ontology)?)\/blob\/main\/([^?#]+)([?#].*)?$/);
    if (owned) {
      let relative;
      try { relative = decodeURIComponent(owned[2]); } catch { return value; }
      if (relative.includes('\\') || relative.startsWith('/') || relative.split('/').some(p => !p || p === '.' || p === '..')) return value;
      const local = (owned[1] === 'evopilot' ? '' : 'node_modules/@evopilot-next/' + owned[1].slice(9) + '/') + relative;
      if (!packagedFiles.has(local)) return value;
      return path.posix.relative(path.posix.dirname(filename), local) + (owned[3] ?? '');
    }
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(value)) return value;
    const match = value.match(/^([^?#]*)([?#].*)?$/);
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(filename), match[1]));
    if (resolved === '..' || resolved.startsWith('../')) return value;
    if (!/^projects\/evopilot-(runtime|harness|ontology)(?:\/|$)/.test(resolved)) return value;
    const installed = resolved.replace(/^projects\/evopilot-(runtime|harness|ontology)/, 'node_modules/@evopilot-next/$1');
    return path.posix.relative(path.posix.dirname(filename), installed) + (match[2] ?? '');
  };
  let fence = null;
  return markdown.split(/(?<=\n)/).map(line => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return line;
    }
    if (fence || /^(?: {4}|\t)/.test(line)) return line;
    return line.split(/(`+[^`]*`+)/).map((part, i) => i % 2 ? part : part
      .replace(/(\]\(<?)([^\s<>)]*)(>?)(?=[\s)])/g, (_, before, dest, after) => before + target(dest) + after)
      .replace(/^(\s{0,3}\[[^\]]+\]:\s*<?)([^\s<>]+)(>?)/, (_, before, dest, after) => before + target(dest) + after)).join('');
  }).join('');
}
export async function assemblePreview({ artifacts, out }) {
  assert.equal(process.versions.node, '24.14.0', 'Requires Node 24.14.0');
  canonical(artifacts); newRoot(out); disjoint(artifacts, out, SOURCE);
  const manifest = JSON.parse(regular(path.join(artifacts, 'manifest.json')));
  exact(manifest, ['schema', 'node', 'authority', 'acceptance', 'packages']);
  assert.equal(manifest.schema, 'evopilot-local-artifacts/v1'); assert.equal(manifest.node, '24.14.0');
  assert.equal(manifest.authority, false); assert.equal(manifest.acceptance, 'NOT_INFERRED');
  assert(Array.isArray(manifest.packages) && manifest.packages.length === 3);
  const app = collect(SOURCE, PARENT_FILES), packages = [];
  for (const [i, record] of manifest.packages.entries()) {
    exact(record, ['product', 'name', 'version', 'packageSHA256', 'tarball', 'exports', 'checkpoint', 'contractSHA256', 'dependencyLock', 'dependencies', 'smoke', 'capabilities']);
    const owner = OWNERS[i]; assert.equal(record.product, owner); assert.equal(record.name, '@evopilot-next/' + owner);
    assert.equal(record.version, VERSION); assert.equal(record.smoke, 'PASSED'); assert.equal(record.contractSHA256, PIN);
    safeRelative(record.tarball); assert(new RegExp('^' + owner + '/[a-zA-Z0-9_.-]+\\.tgz$').test(record.tarball), 'Wrong tarball location');
    const compressed = regular(path.join(artifacts, record.tarball), 67108864);
    assert.equal(sha(compressed), record.packageSHA256, 'Tarball digest mismatch');
    const entries = archiveEntries(compressed), extracted = path.join(artifacts, owner, 'package');
    const pkg = JSON.parse(regular(path.join(extracted, 'package.json')));
    // Metadata validation fixes pkg.files before it is used as a traversal whitelist.
    validateEntries(entries, entries, owner);
    assert.deepEqual(pkg, JSON.parse(entries.get('package.json')), 'Extracted package identity drift');
    const expected = collect(extracted, ['package.json', ...pkg.files]);
    validateEntries(entries, expected, owner); assert.deepEqual(record.exports, pkg.exports);
    const prefix = 'node_modules/@evopilot-next/' + owner + '/';
    for (const [name, bytes] of entries) app.set(prefix + name, bytes);
    let lockSHA = null;
    if (owner === 'runtime') { assert.equal(record.dependencyLock, null); assert.deepEqual(record.dependencies, {}); }
    else {
      exact(record.dependencyLock, ['source', 'file', 'sha256']);
      assert.equal(record.dependencyLock.file, owner + '/dependency-lock.json');
      const bytes = regular(path.join(artifacts, record.dependencyLock.file)); lockSHA = record.dependencyLock.sha256;
      const retained = validateDependencyLock(bytes, pkg, lockSHA);
      assert.deepEqual(record.dependencies, retained.inventory);
      assert.equal(sha(regular(path.join(extracted, 'package-lock.json'))), lockSHA, 'Installed lock drift');
      regular(path.join(extracted, 'node_modules/.package-lock.json'));
      // Traverse first: the verifier must never follow an unvalidated dependency symlink.
      const dependencies = tree(path.join(extracted, 'node_modules'), { omitNpm: true }).files;
      await verifyInstalledDependencies(extracted, retained);
      for (const [name, content] of dependencies) {
        const rel = 'node_modules/' + name;
        assert(Object.keys(retained.inventory).some(p => rel.startsWith(p + '/')), 'Unlisted dependency file');
        app.set(prefix + rel, content);
      }
      app.set(prefix + 'package-lock.json', bytes);
    }
    packages.push({ product: owner, name: pkg.name, version: VERSION, packageSHA256: record.packageSHA256, dependencyLockSHA256: lockSHA });
  }
  // Translate after all verified package inventories exist, including child docs.
  for (const [name, bytes] of app) if (name.endsWith('.md')) app.set(name, Buffer.from(installedMarkdown(bytes.toString('utf8'), name, app)));
  portable(app);
  assert(app.size <= 10000 && [...app.values()].reduce((n, bytes) => n + bytes.length, 0) <= 268435456, 'Bundle limit');
  const report = { schema: 'evopilot-preview-bundle/v1', version: VERSION, node: '24.14.0', contractSHA256: PIN, packages, files: inventory(app) };
  fs.mkdirSync(out, { mode: 0o700 });
  for (const [name, bytes] of app) put(out, 'app/' + name, bytes);
  put(out, 'manifest.json', json(report));
  readBundle(out);
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') console.log('Usage: node scripts/assemble-preview.mjs --artifacts DIR --out NEW_DIR\nCanonical absolute paths; existing parent; Node 24.14.0. Local offline bundle only.');
    else { const a = argumentsFor(args, ['--artifacts', '--out']); await assemblePreview({ artifacts: a['--artifacts'], out: a['--out'] }); console.log('Portable bundle assembled; no product or Host acceptance inferred'); }
  } catch (e) { console.error(e.message + '\nAny partial output is retained for diagnosis.'); process.exitCode = 1; }
}
