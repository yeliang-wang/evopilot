import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGuide, scenarios } from '../../dist/expert/core/guide.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const server = fileURLToPath(new URL('../../dist/plugins/codex/server.js', import.meta.url));
const env = { ...process.env, OPENSSL_CONF: '/dev/null' };
const config = root + 'nonexistent-protocol-config.json';
const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'protocol-fixture', version: '1' } } };
const call = (id, action, args = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'evopilot_v01_' + action, arguments: args } });
const expectedToolIds = ['inspect','activate','deactivate','guide','request','dispatch','reconcile','capabilities','workspace_inspect','workspace_initialize','workspace_attach','workspace_project','workspace_backup','workspace_backup_inspect','workspace_restore','workspace_migrate'].map(name => 'evopilot_v01_' + name).sort();
const scope = { visibility: 'private', projectId: 'example' };
const request = (operation, input = {}) => ({ owner: 'ontology', envelope: { operation, scope, input, requestId: 'retained-request', expectedRevision: 1 } });
const lines = values => values.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('\n') + '\n';

// Protocol fixture ONLY: redirects the one connection module in a child loader.
// Actual server, parser, schemas, guide and session state execute unchanged.
// No fake product or Host acceptance; no files or workspace are created.
const fixtureCode = `
let activations = 0, calls = 0;
export async function withWorkspaceMaintenance() { throw Error('Unexpected maintenance call in protocol-only fixture'); }
const ready = { active: true, pid: 1234, identity: { fixture: true, installationId: 'protocol-only', workspaceId: 'fixture' } };
export async function inspectConnection() { return ready; }
export async function activateConnection() { activations++; return ready; }
export async function callConnection(config, action, payload) {
  calls++;
  if (payload.envelope?.operation === 'unknown') throw Object.assign(Error('SECRET_PROVIDER_TEXT'), { code: 'UNKNOWN' });
  if (payload.envelope?.operation === 'unsafe-error') throw Object.assign(Error('SECRET_PROVIDER_TEXT'), { code: 'SECRET_PROVIDER_CODE' });
  if (payload.envelope?.operation === 'diagnostic') throw Object.assign(Error('SECRET_PROVIDER_TEXT'), { code: payload.envelope.input.code, detail: 'SECRET_PROVIDER_DETAIL' });
  if (payload.envelope?.operation === 'oversize') return 'x'.repeat(5 * 1048576);
  if (payload.envelope?.operation === 'roundtrip') return payload.envelope.input.value;
  await Promise.resolve();
  return { action, payload, calls, activations, values: ['text', { nested: [null, 0.25, true] }] };
}
`;
const dataURL = source => 'data:text/javascript,' + encodeURIComponent(source);
const clientURL = new URL('../../dist/integration/connection/client.js', import.meta.url).href;
const hook = dataURL("import { registerHooks } from 'node:module'; registerHooks({resolve(specifier, context, nextResolve) { if ((specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) && new URL(specifier, context.parentURL).href === " + JSON.stringify(clientURL) + ") return {url:" + JSON.stringify(dataURL(fixtureCode)) + ",shortCircuit:true}; return nextResolve(specifier,context); }});");
function args(fixture = false) {
  return ['--permission', '--allow-fs-read=' + root, ...(fixture ? ['--import', hook] : []), server, '--config', config];
}
function run(values, fixture = false) {
  const result = spawnSync(process.execPath, args(fixture), { env, input: lines(values), encoding: 'utf8', timeout: 10000, maxBuffer: 10 * 1048576 });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}
const data = r => r.result.structuredContent;

test('actual spawned server: passive discovery and guide need no config, live connection or filesystem writes', () => {
  const out = run([init, {jsonrpc:'2.0',id:2,method:'tools/list'}, call(3,'guide',{scenario:'onboarding'}), call(4,'request',request('workspace.inspect')), call(5,'capabilities')]);
  assert.equal(out[0].result.protocolVersion, '2025-06-18');
  assert.equal(out[0].result.serverInfo.name, 'evopilot-v01-preview');
  assert.deepEqual(out[1].result.tools.map(t => t.name).sort(), expectedToolIds);
  assert.equal(new Set(out[1].result.tools.map(t => t.name)).size, expectedToolIds.length);
  assert(out[1].result.tools.every(t => t.name.startsWith('evopilot_v01_')));
  assert.equal(data(out[2]).sessionActive, false);
  assert.equal(data(out[2]).connection, null);
  assert.equal(data(out[3]).error.code, 'SESSION_INACTIVE');
  assert.equal(data(out[4]).error.code, 'SESSION_INACTIVE');
});

test('actual spawned server: invalid JSON, IDs, unknown methods, schema, notifications, CRLF and EOF', () => {
  const out = run([
    {jsonrpc:'2.0',id:0,method:'tools/list'}, '{',
    {jsonrpc:'2.0',id:null,method:'ping'}, {jsonrpc:'2.0',id:{bad:1},method:'ping'},
    {...init, id:undefined}, init,
    {jsonrpc:'2.0',method:'tools/call',params:{name:'evopilot_v01_activate'}},
    {jsonrpc:'2.0',id:'unknown',method:'not/implemented'},
    call(8,'request',{...request('x'), path:'/not-allowed'}),
    call(9,'guide',{scenario:'wrong'}),
    JSON.stringify({jsonrpc:'2.0',id:10,method:'ping'})+'\r',
  ]);
  assert.deepEqual(out.slice(0,4).map(r=>r.error.code),[-32002,-32700,-32600,-32600]);
  assert.equal(out.length,9);
  assert.equal(out[5].error.code,-32601);
  assert.equal(out[6].error.code,-32602);
  assert.equal(out[7].error.code,-32602);
  assert.deepEqual(out[8].result,{});
  const eof = spawnSync(process.execPath,args(),{env,input:JSON.stringify(init),encoding:'utf8'});
  assert.equal(JSON.parse(eof.stdout).id,1);
});

test('actual spawned server: oversized line is discarded and subsequent frames survive', () => {
  const out = run(['x'.repeat(1048577), init, {jsonrpc:'2.0',id:2,method:'ping'}]);
  assert.equal(out[0].error.code,-32600);
  assert.equal(out[1].id,1); assert.deepEqual(out[2].result,{});
});

test('protocol fixture: verified session activation, once-only forwarding, structured JSON and safe UNKNOWN correlation', () => {
  const out = run([init, call(2,'inspect'), call(3,'request',request('x')), call(4,'activate'), call(5,'activate'),
    call(6,'request',request('classification.start',{id:'session',sourceId:'source',taxonomy:{}})),
    call(7,'dispatch',{args:{scope,id:'run',requestId:'dispatch',expectedRevision:2}}),
    call(8,'reconcile',{args:{scope,id:'run',requestId:'reconcile',expectedRevision:3}}),
    call(9,'request',request('unknown')), call(10,'request',request('unsafe-error')),
    call(11,'deactivate'), call(12,'capabilities'), call(13,'inspect')],true);
  assert.equal(data(out[1]).connection.active,true); assert.equal(data(out[1]).sessionActive,false);
  assert.equal(data(out[2]).error.code,'SESSION_INACTIVE');
  assert.equal(data(out[5]).result.activations,2, 'Each activation revalidates the shared connection; business forwarding still occurs once');
  assert.equal(data(out[5]).result.calls,1);
  assert.deepEqual(data(out[5]).result.payload,request('classification.start',{id:'session',sourceId:'source',taxonomy:{}}));
  assert.deepEqual(data(out[5]).result.values,['text',{nested:[null,0.25,true]}]);
  assert.equal(data(out[6]).result.action,'dispatch');
  assert.equal(data(out[7]).result.action,'reconcile');
  assert.equal(data(out[8]).error.code,'UNKNOWN');
  assert.equal(data(out[8]).error.correlation.requestId,'retained-request');
  assert.equal(out[8].result.isError,true);
  assert.equal(data(out[9]).error.code,'CONNECTION_ERROR');
  assert(!JSON.stringify(out).includes('SECRET_PROVIDER'));
  assert.equal(data(out[11]).error.code,'SESSION_INACTIVE');
  assert.equal(data(out[12]).connection.active,true);
  assert(out.slice(1).every(r=>data(r).namespace==='evopilot_v01_preview'));
  const other = run([init,call(2,'inspect')],true);
  assert.notEqual(data(other[1]).sessionId,data(out[1]).sessionId);
  assert.equal(data(other[1]).sessionActive,false);
});

test('protocol fixture: finite public source/Pack diagnostics preserve correlation while arbitrary codes and details remain redacted', () => {
  const known = ['SOURCE_QUARANTINED', 'PACK_NAMESPACE_COLLISION', 'PACK_OVERRIDE_INCOMPATIBLE'];
  const codes = [...known, 'PACK_SECRET_PROVIDER_CODE', 'SECRET_PROVIDER_CODE'];
  const out = run([init, call(2, 'activate'), ...codes.map((code, index) => call(index + 3, 'request', request('diagnostic', { code })))], true);
  for (const [index, code] of codes.entries()) {
    const reply = out[index + 2], value = data(reply);
    assert.equal(reply.result.isError, true);
    assert.equal(value.error.code, known.includes(code) ? code : 'CONNECTION_ERROR');
    assert.deepEqual(value.error.correlation, { requestId: 'retained-request', scope, expectedRevision: 1, operation: 'diagnostic' });
    assert.deepEqual(Object.keys(value.error).sort(), ['code', 'correlation']);
  }
  assert.doesNotMatch(JSON.stringify(out), /SECRET_PROVIDER|\"message\"|\"stack\"|\"detail\"/);
});

test('protocol fixture: bounded serialized output retains owning correlation', () => {
  const out=run([init,call(2,'activate'),call(3,'request',request('oversize')),call(4,'capabilities')],true);
  assert.equal(data(out[2]).error.code,'LIMIT');
  assert.equal(data(out[2]).error.correlation.requestId,'retained-request');
  assert.equal(data(out[3]).result.calls,2);
});

test('protocol fixture: arrays, strings and nested JSON roundtrip without coercion', () => {
  for (const value of ['string result', [1, { values: [false, null, '中文'] }], { nested: { array: [] } }]) {
    const out = run([init, call(2, 'activate'), call(3, 'request', request('roundtrip', { value }))], true);
    assert.deepEqual(data(out[2]).result, value);
    assert.deepEqual(JSON.parse(out[2].result.content[0].text), data(out[2]));
  }
});

test('protocol fixture: concurrent adapters keep independent sessions across peer EOF', async () => {
  function start() {
    const child = spawn(process.execPath, args(true), { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', stderr = ''; const waiting = [], received = [];
    child.stderr.on('data', chunk => stderr += chunk);
    child.stdout.on('data', chunk => {
      buffer += chunk;
      for (let end; (end = buffer.indexOf('\n')) >= 0;) {
        const value = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        if (waiting.length) waiting.shift()(value); else received.push(value);
      }
    });
    const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => { if (code || stderr) reject(Error('Fixture child failed')); else resolve(); }); });
    return { child, closed, send(value) { child.stdin.write(JSON.stringify(value) + '\n'); return received.length ? Promise.resolve(received.shift()) : new Promise(resolve => waiting.push(resolve)); } };
  }
  const first = start(), second = start();
  try {
    await Promise.all([first.send(init), second.send(init)]);
    const a = data(await first.send(call(2, 'activate')));
    const b = data(await second.send(call(2, 'inspect')));
    assert.notEqual(a.sessionId, b.sessionId);
    assert.equal(a.sessionActive, true); assert.equal(b.sessionActive, false);
    assert.equal(b.connection.active, true);
    first.child.stdin.end(); await first.closed;
    assert.equal(data(await second.send(call(3, 'capabilities'))).error.code, 'SESSION_INACTIVE');
    assert.equal(data(await second.send(call(4, 'activate'))).sessionActive, true);
    assert.equal(data(await second.send(call(5, 'inspect'))).connection.pid, b.connection.pid);
  } finally {
    first.child.stdin.end(); second.child.stdin.end();
    await Promise.all([first.closed, second.closed]);
  }
});

test('actual spawned server: fragmented UTF-8 and lines; EOF does not stop a connection', async () => {
  const child=spawn(process.execPath,args(true),{env,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',b=>stdout+=b); child.stderr.on('data',b=>stderr+=b);
  const done = new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  const payload=Buffer.from(lines([init,call(2,'activate'),call(3,'request',request('echo',{text:'中文'})),call(4,'inspect')]));
  for(let i=0;i<payload.length;i+=7) child.stdin.write(payload.subarray(i,i+7));
  child.stdin.end();
  assert.equal(await done,0); assert.equal(stderr,'');
  const out=stdout.trim().split('\n').map(JSON.parse);
  assert.equal(data(out[2]).result.payload.envelope.input.text,'中文');
  assert.equal(data(out[3]).connection.active,true);
});

test('distribution invariant and explicit entry metadata; not decision or Host acceptance', () => {
  const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
  assert.equal(read('expert/adapters/codex/SKILL.md'),read('plugins/codex/skills/evopilot-v01-expert/SKILL.md'));
  assert.equal(read('expert/adapters/codex/agents/openai.yaml'),read('plugins/codex/skills/evopilot-v01-expert/agents/openai.yaml'));
  assert.match(read('expert/adapters/codex/SKILL.md'),/^---\nname: "evopilot-v01-expert"\ndescription: "[^\n]+"\n---/);
  const metadata=read('expert/adapters/codex/agents/openai.yaml');
  assert.match(metadata,/allow_implicit_invocation: false/);
  assert.match(metadata,/\$evopilot-v01-expert/);
  const manifest=JSON.parse(read('plugins/codex/.codex-plugin/plugin.json'));
  assert.equal(manifest.name,'evopilot-v01-preview'); assert.equal(manifest.mcpServers,'./.mcp.json');
  assert(manifest.interface.shortDescription.length>=25 && manifest.interface.shortDescription.length<=64);
  const template=JSON.parse(read('plugins/codex/mcp.template.json')).mcpServers.evopilot_v01_preview;
  assert.equal(template.command,'${nodeExecutable}');
  assert.deepEqual(template.args,['${serverPath}','--config','${configPath}']);
  for(const scenario of scenarios) {
    const guide=getGuide(scenario); assert.equal(guide.authority,false);
    assert(guide.firstWhenActive.includes('evopilot_v01_capabilities'));
    guide.rules.length=0; assert(getGuide(scenario).rules.length>0);
  }
});


test('actual spawned server: standard metadata is ignored and fractional IDs roundtrip', () => {
  const meta = { progressToken: 0.25, opaque: { marker: 'META_ONLY', list: [null, true] } };
  const withMeta = r => ({ ...r, params: { ...r.params, _meta: meta } });
  const out = run([withMeta(init), withMeta({jsonrpc:'2.0',id:2.5,method:'ping'}),
    withMeta({jsonrpc:'2.0',id:'list',method:'tools/list',params:{cursor:''}}),
    withMeta(call(4,'activate')), withMeta(call(5,'request',request('echo'))),
    {...call(6,'guide',{scenario:'ontology-reverse'}), params:{...call(6,'guide',{scenario:'ontology-reverse'}).params,_meta:{progressToken:'opaque'}}}], true);
  assert.equal(out[1].id, 2.5); assert.deepEqual(out[1].result, {});
  assert.deepEqual(out[2].result.tools.map(t => t.name).sort(), expectedToolIds);
  assert.deepEqual(data(out[4]).result.payload, request('echo'));
  assert.equal(data(out[4]).result.calls, 1);
  assert(!JSON.stringify(out).includes('META_ONLY'));
  assert(!JSON.stringify(out).includes('progressToken'));
});
test('actual spawned server: malformed metadata rejects before initialization or effects', () => {
  const invalid = [null, [], 'x', 1, {progressToken:null}, {progressToken:true}, {progressToken:{}}, {progressToken:[]}];
  for (const meta of invalid) {
    const withMeta = r => ({...r,params:{...r.params,_meta:meta}});
    const out=run([withMeta(init),init,
      withMeta({jsonrpc:'2.0',id:2,method:'ping'}),
      withMeta({jsonrpc:'2.0',id:3,method:'tools/list'}),
      withMeta(call(4,'activate')),call(5,'capabilities'),call(6,'activate'),
      withMeta(call(7,'request',request('echo'))),call(8,'capabilities')],true);
    for(const i of [0,2,3,4,7]) assert.equal(out[i].error.code,-32602);
    assert.equal(data(out[5]).error.code,'SESSION_INACTIVE');
    assert.equal(data(out[8]).result.activations,1);
    assert.equal(data(out[8]).result.calls,1);
  }
  let deep={}; for(let i=0;i<66;i++) deep={nested:deep};
  const out=run([init,
    '{"jsonrpc":"2.0","id":2,"method":"ping","params":{"_meta":{"progressToken":1e400}}}',
    {jsonrpc:'2.0',id:3,method:'ping',params:{_meta:deep}},
    {jsonrpc:'2.0',id:4,method:'tools/list',params:{cursor:'unsupported'}},
    {jsonrpc:'2.0',id:5,method:'tools/list',params:{cursor:1}},
    {jsonrpc:'2.0',id:6,method:'ping',params:{business:true,_meta:{}}},
    {...call(7,'activate'),params:{...call(7,'activate').params,unexpected:true,_meta:{}}},
    {jsonrpc:'2.0',id:8,method:'ping',params:{_meta:{payload:'x'.repeat(1048576)}}},
    {jsonrpc:'2.0',id:9,method:'ping'}],true);
  assert(out.slice(1,7).every(r=>r.error.code===-32602));
  assert.equal(out[7].error.code,-32600); assert.deepEqual(out[8].result,{});
});
test('pure guide maps every source reference to the installed package layout', () => {
  // Concrete app-root paths are independent of the source-to-package mapping.
  // No installed child repositories or filesystem fixtures are needed.
  const installationRoot = '/managed/evopilot/app';
  const expectedPaths = [
    '/managed/evopilot/app/docs/first-journey.md',
    '/managed/evopilot/app/docs/product-composition.md',
    '/managed/evopilot/app/node_modules/@evopilot-next/ontology/docs/service.md',
    '/managed/evopilot/app/node_modules/@evopilot-next/ontology/docs/classification-service.md',
    '/managed/evopilot/app/node_modules/@evopilot-next/ontology/docs/legacy-api.md',
    '/managed/evopilot/app/node_modules/@evopilot-next/ontology/docs/catalog-service.md',
    '/managed/evopilot/app/node_modules/@evopilot-next/ontology/specifications',
    '/managed/evopilot/app/node_modules/@evopilot-next/ontology/schemas',
    '/managed/evopilot/app/node_modules/@evopilot-next/harness/specifications',
    '/managed/evopilot/app/node_modules/@evopilot-next/harness/docs/service.md',
    '/managed/evopilot/app/node_modules/@evopilot-next/runtime/docs/service.md',
  ];
  for (const scenario of scenarios) {
    const guide=getGuide(scenario);
    const resolvedPaths = guide.installedReferences.map(p => resolve(installationRoot, p));
    assert.deepEqual(resolvedPaths, expectedPaths);
    assert(resolvedPaths.every(p => p.startsWith(installationRoot + '/')));
    assert(guide.installedReferences.every(p=>!p.includes('projects/')));
    assert.equal(guide.referenceBases.installedReferences,'verified installationRoot');
  }
  const reverse=getGuide('ontology-reverse');
  assert(reverse.operations.includes('asset.put'));
  assert.match(reverse.steps.join(' '),/never an arbitrary Java/);
});
