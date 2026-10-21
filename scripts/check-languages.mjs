import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const hash = b => createHash('sha256').update(b).digest('hex');
async function files(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    assert(!entry.isSymbolicLink(), 'Core source must not be a symlink: ' + path);
    if (entry.isDirectory()) output.push(...await files(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}
export async function checkLanguages(root = ROOT) {
  const policy = JSON.parse(await readFile(resolve(root, 'governance/language-policy.json'), 'utf8'));
  assert.equal(policy.schema, 'evopilot-language-policy/v1');
  const seen = new Set(), counts = { typescript: 0, generatedJavaScript: 0, frozenJavaScript: 0, nativePython: 0 };
  for (const core of policy.coreRoots) for (const file of await files(resolve(root, core))) {
    const name = relative(root, file);
    if (policy.excludeSubtrees.some(prefix => name === prefix || name.startsWith(prefix + '/'))) continue;
    const extension = extname(file), source = await readFile(file), text = source.toString();
    if (['.js', '.mjs', '.cjs'].includes(extension)) {
      if (policy.frozenJavaScript[name]) {
        assert.equal(hash(source), policy.frozenJavaScript[name], 'Frozen JavaScript changed: ' + name);
        seen.add(name); counts.frozenJavaScript++;
      } else {
        const input = file.slice(0, -extension.length) + (extension === '.mjs' ? '.mts' : '.ts');
        await readFile(input).catch(() => assert.fail('Core JavaScript has no TypeScript source: ' + name));
        assert(Object.hasOwn(policy.generatedModules, name), 'Unlisted generated core JavaScript: ' + name);
        assert.equal(policy.generatedModules[name].source, relative(root, input), 'Generated source mapping mismatch: ' + name);
        seen.add(name);
        counts.generatedJavaScript++;
      }
    } else if (extension === '.py') {
      assert(policy.nativePython[name], 'Unlisted Python product implementation: ' + name);
      assert.equal(hash(source), policy.nativePython[name].sha256, 'Native Python adapter changed: ' + name);
      seen.add(name); counts.nativePython++;
    } else if (['.ts', '.mts', '.tsx'].includes(extension) && !/\.d\.[cm]?ts$/.test(name)) {
      assert(!/@ts-(?:nocheck|ignore)\b/.test(text), 'Type checking disabled: ' + name);
      const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
      function visit(node) { assert(node.kind !== ts.SyntaxKind.AnyKeyword, 'Explicit any in core: ' + name); ts.forEachChild(node, visit); }
      visit(ast); counts.typescript++;
    }
  }
  for (const name of [...Object.keys(policy.frozenJavaScript), ...Object.keys(policy.nativePython), ...Object.keys(policy.generatedModules)]) assert(seen.has(name), 'Missing pinned/generated language entry: ' + name);
  for (const repo of ['', 'projects/evopilot-runtime', 'projects/evopilot-harness', 'projects/evopilot-ontology']) {
    const config = JSON.parse(await readFile(resolve(root, repo, 'tsconfig.json'), 'utf8'));
    assert.equal(config.compilerOptions.strict, true, 'Strict TypeScript required: ' + repo);
    assert.equal(config.compilerOptions.declaration, true, 'Public declarations required: ' + repo);
  }
  return { status: 'PASS', ...counts, acceptance: 'SOURCE_LANGUAGE_BOUNDARY_ONLY' };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) console.log(JSON.stringify(await checkLanguages()));
