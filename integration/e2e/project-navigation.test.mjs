import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture, freeze, write } from './fixtures/native-project.mjs';
import { nativePackageDigest, nativeSha256 } from '../../dist/integration/compatibility/v1/native.mjs';

test('C01.04: broken README navigation blocks project layout and completion evidence without rewriting assets', async () => {
  const f = fixture();
  try {
    const frozen = await freeze(f);
    await f.service.materialize({ scope: f.scope, id: f.input.id, packages: f.packages });
    const root = f.service.candidateLocation({ scope: f.scope, id: f.input.id });
    const readme = path.join(root, 'README.md'), original = fs.readFileSync(readme);
    const model = path.join(root, 'ontology', f.packages.ontology.manifest.id, 'model.ttl'), modelBytes = fs.readFileSync(model);
    const outside = path.join(f.root, 'outside.txt'); write(outside, 'synthetic external file');
    fs.symlinkSync(outside, path.join(root, 'linked.txt'));
    for (const navigation of [
      '[Missing](ontology/absent.ttl)',
      '[Missing][asset]\n\n[asset]: ontology/absent.ttl',
      '[Escaping](../outside.txt)',
      '[Encoded escape](%2e%2e/outside.txt)',
      '[Linked](linked.txt)',
      '[Malformed](invalid%zz)',
    ]) {
      write(readme, original.toString() + '\n' + navigation + '\n');
      assert.throws(() => f.service.checkLayout({ scope: f.scope, id: f.input.id }), { code: 'PROJECT_NAVIGATION' }, navigation);
      const project = { scope: f.scope, sourceScope: frozen.candidate.sourceScope, requirements: frozen.candidate.nativeRequirements, candidateDigest: nativeSha256('synthetic-runtime') };
      const run = { claim: { context: { synthetic: true } }, reviewDigest: nativeSha256('synthetic-run'), plan: { pins: Object.fromEntries(Object.entries(f.packages).map(([owner,pkg]) => [owner,{digest:nativePackageDigest(pkg)}])) } };
      const check = f.service.verifyProject({ project, run });
      assert.equal(check.criteria.find(c => c.criterionId === 'project:directory').status, 'FAIL');
      assert.deepEqual(fs.readFileSync(model), modelBytes);
    }
    fs.unlinkSync(path.join(root, 'linked.txt')); fs.writeFileSync(readme, original);
    assert.equal(f.service.checkLayout({ scope: f.scope, id: f.input.id }).conforms, true);
  } finally { f.cleanup(); }
});

test('C01.04: real local links resolve while documentation examples and remote links remain passive', async () => {
  const f = fixture();
  try {
    await freeze(f); await f.service.materialize({ scope: f.scope, id: f.input.id, packages: f.packages });
    const root = f.service.candidateLocation({ scope: f.scope, id: f.input.id }), readme = path.join(root, 'README.md');
    write(path.join(root, 'user notes.txt'), 'Synthetic user documentation.');
    fs.appendFileSync(readme, '\n[Notes](<user notes.txt>)\n[Encoded](user%20notes.txt)\n[Scope][scope]\n[scope]: scope/requirements.json\n[Remote](https://example.invalid/not-fetched)\n[Mail](mailto:test@example.invalid)\n[Section](#section)\n`[code](absent.md)`\n```markdown\n[Example](absent.md)\n```\n    [Indented example](absent.md)\n<!-- [Comment](absent.md) -->\n');
    assert.equal(f.service.checkLayout({ scope: f.scope, id: f.input.id }).conforms, true);
  } finally { f.cleanup(); }
});
