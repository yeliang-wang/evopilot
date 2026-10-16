import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Bounded lint for the explicit S01 negative cases. This is not an NLP verifier
// and does not establish the truth or completeness of all documentation claims.
export function checkStandardClaims(text) {
  const plain = text.replace(/[`*_]/g, '');
  const forbidden = [
    ['directory-as-W3C', /(?:EvoPilot.{0,50}(?:directory|layout)|(?:directory|layout).{0,50}EvoPilot).{0,30}(?:is|follows|implements|conforms to)\s+(?:a |the )?W3C\s+(?:standard|specification)/i],
    ['spec-label-as-SHACL-version', /(?:specVersion\s*=\s*v1|specifications\/v1).{0,25}(?:is|means|denotes|represents)\s+(?:the )?SHACL\s+(?:standard\s+)?version/i],
    ['tool-version-as-standard', /(?:pySHACL|Conftest|OPA CLI)\s+(?:v?\d[\w.]*\s+)?(?:is|defines|specifies)\s+(?:the )?(?:SHACL|RDF|Rego)\s+standard(?:\s+version)?/i],
    ['universal-Harness-standard', /(?:Rego|Conftest)\s+(?:is|defines)\s+(?:the |a )?(?:universal|industry-wide)\s+Harness\s+standard/i],
    ['directory-as-W3C-zh', /(?:EvoPilot.{0,30}(?:目录|布局)|(?:目录|布局).{0,30}EvoPilot).{0,15}(?:是|遵循)\s*W3C\s*标准/],
    ['spec-label-as-SHACL-version-zh', /(?:specVersion\s*=\s*v1|specifications\/v1).{0,15}(?:是|表示|代表)\s*SHACL\s*(?:标准)?版本/],
  ];
  const failures = forbidden.filter(([, pattern]) => pattern.test(plain)).map(([id]) => id);
  assert.equal(failures.length, 0, 'Conflated standard claim: ' + failures.join(', '));
  return { checked: true, checkScope: 'Known positive assertions conflating conventions, standards and tool versions', authority: false };
}

export function checkCurrentStandardDocs(root = fileURLToPath(new URL('../', import.meta.url))) {
  const checked = [];
  for (const owner of ['ontology', 'harness']) {
    const base = path.join(root, 'projects/evopilot-' + owner);
    for (const name of ['README.md', 'specifications/README.md', 'specifications/v1/README.md', 'specifications/v1/adoption.md', owner === 'ontology' ? 'docs/native-service.md' : 'docs/native-harness.md']) {
      checkStandardClaims(fs.readFileSync(path.join(base, name), 'utf8')); checked.push('projects/evopilot-' + owner + '/' + name);
    }
  }
  return { checked, authority: false, acceptance: 'NOT_EVALUATED' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { assert.equal(process.argv.length, 2); console.log(JSON.stringify(checkCurrentStandardDocs())); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
