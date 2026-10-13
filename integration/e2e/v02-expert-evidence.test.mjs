import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync, rmSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { scenarioCatalogue } from '../../dist/expert/core/scenarios.js';
import { evaluateScenarioEvidence, verifyExpertAcceptanceFile } from '../../dist/expert/core/acceptance.js';

// Verifier fixtures only. A fabricated complete-shaped report is never Host evidence.
const installationDigest = '1'.repeat(64);
function report(path = '/synthetic/verifier-only/evidence.json', sha256 = '2'.repeat(64)) {
  return { schema: 'evopilot-expert-evidence/v1', version: '0.2.0', installationDigest,
    scenarios: scenarioCatalogue.map(item => ({ id: item.id, status: 'PASS', evidence: [
      { kind: 'automated', path, sha256, installationDigest, synthetic: true, branches: [...item.requiredBranches], tests: [...item.automatedTests] },
      { kind: 'desktop', path, sha256, installationDigest, synthetic: false, branches: [], threadId: '11111111-2222-3333-4444-555555555555', toolNamespace: 'evopilot_v01_preview' },
    ] })) };
}

test('V02 verifier fixture: complete-shaped evidence has no acceptance or release authority', () => {
  const checked = evaluateScenarioEvidence(report(), installationDigest);
  assert.equal(checked.completeness, 'COMPLETE');
  assert.equal(checked.acceptance, 'NOT_EVALUATED'); assert.equal(checked.authority, false); assert.equal(checked.releaseAuthorized, false);
  assert.deepEqual(checked.problems, []);
});

test('V02 verifier fixture: absent, duplicate, orphan, stale-candidate and synthetic Desktop evidence fail', () => {
  for (const mutate of [
    r => r.scenarios.pop(), r => r.scenarios.push(r.scenarios[0]), r => { r.scenarios[0].id = 'V02-A99'; },
    r => { r.scenarios[1].id = r.scenarios[0].id; }, r => { r.installationDigest = '3'.repeat(64); },
    r => { r.scenarios[0].evidence[0].installationDigest = '3'.repeat(64); },
    r => { r.scenarios[0].evidence[1].synthetic = true; }, r => { r.scenarios[0].evidence[1].toolNamespace = 'evopilot_m0_probe'; },
    r => { r.scenarios[0].evidence[1].threadId = 'made-up'; }, r => { r.scenarios[0].evidence[0].tests = ['not-the-declared-test']; },
    r => { r.scenarios[0].evidence[0].branches = ['unknown-case']; }, r => { r.releaseAuthorized = true; },
  ]) { const value = report(); mutate(value); assert.equal(evaluateScenarioEvidence(value, installationDigest).completeness, 'INVALID'); }
});

test('V02 verifier fixture: incomplete actual required paths and branches cannot pass', () => {
  for (const status of ['FAIL', 'PENDING', 'UNKNOWN', 'SKIPPED']) {
    const value = report(); value.scenarios[0].status = status;
    assert.equal(evaluateScenarioEvidence(value, installationDigest).completeness, 'INCOMPLETE');
  }
  for (const mutate of [
    r => r.scenarios[0].evidence.pop(),
    r => r.scenarios[0].evidence[0].branches.pop(),
    r => r.scenarios[0].evidence[0].tests.pop(),
  ]) { const value = report(); mutate(value); assert.equal(evaluateScenarioEvidence(value, installationDigest).completeness, 'INCOMPLETE'); }
});

test('V02 verifier fixture: hashes, links, conflicting file bindings and self-report references are checked', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'evopilot-expert-report-')));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const evidencePath = join(root, 'synthetic-verifier-fixture.json'), reportPath = join(root, 'report.json');
  const bytes = '{"syntheticVerifierFixture":true,"authority":false}';
  writeFileSync(evidencePath, bytes);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const value = report(evidencePath, hash);
  const check = data => { writeFileSync(reportPath, JSON.stringify(data)); return verifyExpertAcceptanceFile(reportPath, installationDigest); };
  assert.equal(check(value).completeness, 'COMPLETE');
  writeFileSync(evidencePath, bytes + ' '); assert.equal(check(value).completeness, 'INVALID'); writeFileSync(evidencePath, bytes);
  const linked = join(root, 'linked.json'); symlinkSync(evidencePath, linked);
  assert.equal(check(report(linked, hash)).completeness, 'INVALID');
  const hard = join(root, 'hard.json'); linkSync(evidencePath, hard);
  assert.equal(check(value).completeness, 'INVALID'); rmSync(hard);
  const conflict = structuredClone(value); conflict.scenarios[1].evidence[0].sha256 = '3'.repeat(64);
  assert.equal(check(conflict).completeness, 'INVALID');
  const self = structuredClone(value); self.scenarios[0].evidence[0].path = reportPath;
  assert.equal(check(self).completeness, 'INVALID');
  rmSync(evidencePath); assert.equal(check(value).completeness, 'INVALID');
});
