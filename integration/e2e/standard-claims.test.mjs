import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStandardClaims, checkCurrentStandardDocs } from '../../scripts/check-standard-claims.mjs';

test('S01: current README, specifications and native API docs keep upstream standards and EvoPilot conventions distinct', () => {
  assert.equal(checkCurrentStandardDocs().checked.length, 10);
});
for (const [id, statement] of [
  ['S01.06', 'The EvoPilot directory layout is a W3C standard.'],
  ['S01.07', '`specVersion=v1` means the SHACL standard version 1.'],
  ['S01.08', 'pySHACL 0.40.1 defines the SHACL standard version.'],
  ['S01.06-zh', 'EvoPilot 目录布局是 W3C 标准。'],
  ['S01.07-zh', '`specifications/v1` 表示 SHACL 版本。'],
  ['Harness-universal', 'Conftest is a universal Harness standard.'],
]) test(id + ': reject an explicit false standard assertion in documentation', () => {
  assert.throws(() => checkStandardClaims('# Adoption\n\n' + statement), /Conflated standard claim/);
});
test('S01: explicit distinctions and tool versions remain valid documentation', () => {
  assert.doesNotThrow(() => checkStandardClaims('SHACL 2017 is implemented by pySHACL 0.40.1. EvoPilot directory layout is not a W3C standard. specVersion=v1 is the EvoPilot specification label, not the SHACL version.'));
});
