import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createLocalCollector } from '../../dist/integration/collection/local.js';
import { nativeSha256, nativeBytesDigest } from '../../dist/integration/compatibility/v1/native.mjs';

function fixture(code, timeoutMs = 5000) {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'evopilot-collector-'));
  const cwd = path.join(base, 'source'), raw = path.join(base, 'raw');
  fs.mkdirSync(cwd, { mode: 0o700 }); fs.mkdirSync(raw, { mode: 0o700 }); fs.writeFileSync(path.join(cwd, 'source.txt'), 'fixed');
  const executable = fs.realpathSync(process.execPath), tool = { path: executable, sha256: nativeBytesDigest(fs.readFileSync(executable)).slice(7) };
  const sourceScope = { direction: 'reverse', locator: cwd, revision: 'synthetic-v1', treeDigest: nativeSha256('tree'), inventoryDigest: nativeSha256('inventory'), requirementsDigest: nativeSha256('requirements') };
  const recipe = { schema: 'evopilot-collection-recipe/v1', sourceScope, executable, executableDigest: 'sha256:' + tool.sha256,
    argv: ['-e', code], cwd, environment: { PATH: '/usr/bin:/bin' }, toolchainLockDigest: nativeSha256([tool]), timeoutMs, maxOutputBytes: 65536,
    allowedOutputs: ['stdout.txt', 'stderr.txt'], network: { mode: 'none', hosts: [] }, selectors: [{ id: 'passed', output: 'stdout.txt', kind: 'json-pointer', pointer: '/passed' }] };
  const claim = { schema: 'evopilot-collection-claim/v1', id: 'one', claimId: 'synthetic-claim', idempotencyKey: 'one',
    workspace: { schema: 'evopilot-workspace/v1', id: 'synthetic', canonicalRoot: base }, scope: { visibility: 'private', projectId: 'demo' }, projectCandidateDigest: nativeSha256('candidate'),
    recipe, recipeDigest: nativeSha256(recipe), decision: { reviewDigest: nativeSha256(recipe), decision: 'APPROVE', humanEvidenceRef: 'synthetic-test-only', uid: process.getuid(), at: new Date().toISOString() }, attemptCount: 1 };
  const binding = { cwd, sourceFiles: [{ path: 'source.txt', sha256: nativeBytesDigest('fixed').slice(7) }], toolchainLockDigest: recipe.toolchainLockDigest, toolFiles: [tool], readRoots: [] };
  const adapter = createLocalCollector({ resolveExecution: () => binding });
  return { base, cwd, raw, claim, binding, adapter, context: { claim, artifactRoot: raw, signal: new AbortController().signal }, cleanup: () => fs.rmSync(base, { recursive: true, force: true }) };
}
async function until(fn, ms = 5000) { const begin = Date.now(); for (;;) { const result = await fn(); if (result) return result; if (Date.now() - begin > ms) throw new Error('Timed out waiting for real worker evidence'); await new Promise(r => setTimeout(r, 25)); } }

test('collection uses real process output and cannot redispatch an admitted claim', async () => {
  const f = fixture('console.log(JSON.stringify({passed:1}));console.error("raw warning")');
  try {
    const result = await f.adapter.collect(f.context);
    assert.equal(result.exitCode, 0, JSON.stringify(result)); assert.equal(result.error, null);
    assert.equal(fs.readFileSync(path.join(f.raw, 'stdout.txt'), 'utf8'), '{"passed":1}\n');
    assert.equal(fs.readFileSync(path.join(f.raw, 'stderr.txt'), 'utf8'), 'raw warning\n');
    assert.equal(result.outputs.length, 2);
    await assert.rejects(f.adapter.collect(f.context), { code: 'COLLECTION_ALREADY_ATTEMPTED' });
    assert.deepEqual(await f.adapter.inspectCollection(f.context), result);
  } finally { f.cleanup(); }
});

test('timeout preserves partial raw bytes and records termination', async () => {
  const f = fixture('console.log("partial");setInterval(()=>{},1000)', 300);
  try {
    const result = await f.adapter.collect(f.context);
    assert.equal(result.timedOut, true); assert.equal(result.signal, 'SIGKILL');
    assert.equal(fs.readFileSync(path.join(f.raw, 'stdout.txt'), 'utf8'), 'partial\n');
    assert.equal(result.outputs.length, 2);
  } finally { f.cleanup(); }
});

test('sandbox blocks source-external writes and cannot rewrite retained collector receipts', async () => {
  const f = fixture('');
  f.claim.recipe.argv = ['-e', `const fs=require('fs');let blocked=0;for(const p of ${JSON.stringify([path.join(f.base, 'outside.txt'), path.join(f.raw, '.collector/result.json')])}){try{fs.writeFileSync(p,'forged')}catch(e){if(e.code==='EPERM'||e.code==='EACCES')blocked++}};console.log(JSON.stringify({blocked}))`];
  f.claim.recipeDigest = nativeSha256(f.claim.recipe);
  try {
    const result = await f.adapter.collect(f.context); assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.raw, 'stdout.txt'))), { blocked: 2 });
    assert.equal(fs.existsSync(path.join(f.base, 'outside.txt')), false);
  } finally { f.cleanup(); }
});

test('a detached collection completes after its calling process crashes; reconciliation only reads', async () => {
  const f = fixture('const fs=require("fs");fs.appendFileSync("attempts.txt","one\\n");console.log("started");setTimeout(()=>console.log("finished"),500)');
  try {
    const input = path.join(f.base, 'input.json'); fs.writeFileSync(input, JSON.stringify({ claim: f.claim, artifactRoot: f.raw, binding: f.binding }));
    const moduleUrl = new URL('../../dist/integration/collection/local.js', import.meta.url).href;
    const child = spawn(process.execPath, ['--input-type=module', '-e', `import fs from 'node:fs';import {createLocalCollector} from ${JSON.stringify(moduleUrl)};const c=JSON.parse(fs.readFileSync(process.argv[1]));await createLocalCollector({resolveExecution:()=>c.binding}).collect({...c,signal:new AbortController().signal});`, input], { stdio: 'ignore' });
    await until(() => fs.existsSync(path.join(f.raw, '.collector/process.json')));
    child.kill('SIGKILL'); await new Promise(r => child.once('close', r));
    const result = await until(() => f.adapter.inspectCollection(f.context));
    assert.equal(result.exitCode, 0); assert.equal(fs.readFileSync(path.join(f.cwd, 'attempts.txt'), 'utf8'), 'one\n');
    for (let i = 0; i < 3; i++) assert.deepEqual(await f.adapter.inspectCollection(f.context), result);
    assert.equal(fs.readFileSync(path.join(f.cwd, 'attempts.txt'), 'utf8'), 'one\n');
  } finally { f.cleanup(); }
});

test('collection refuses unpinned subprocess executables', async () => {
  const f=fixture(`const r=require('child_process').spawnSync('/bin/sh',['-c','echo unpinned']);console.log(JSON.stringify({blocked:!!r.error,code:r.error?.code}));`);
  try{
    const result=await f.adapter.collect(f.context); assert.equal(result.exitCode,0,JSON.stringify(result));
    const value=JSON.parse(fs.readFileSync(path.join(f.raw,'stdout.txt')));
    assert.equal(value.blocked,true);assert(['EPERM','EACCES'].includes(value.code));
  }finally{f.cleanup();}
});
