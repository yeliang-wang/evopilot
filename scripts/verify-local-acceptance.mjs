import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLAN = 'sha256:5bae53afa8a1245d9b5f3c63630b9654ea04938481e3f798964c762a5a7cc926';
const ROADMAP = 'sha256:06c0e62d0f2fffce6013720509a603e753ca4f402ce24fc0937c8b45bd8129c2';
const PIN = 'df4f7246ae35ef9114e2b93663d520e7ff4f44f14f886ac8ba43e9fc080ddc9a';
const OWNERS = ['runtime', 'harness', 'ontology'];
const IDS = Array.from({ length: 19 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`);
const HOST = new Set(['E07', 'E09', 'E10', 'E14', 'E15', 'E16']);
const JSON_LIMIT = 4 * 1024 * 1024;
const ARCHIVE_LIMIT = 128 * 1024 * 1024;
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const absolute = value => typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value && value !== path.parse(value).root;
const outside = (file, root) => file !== root && !file.startsWith(root + path.sep);
function exact(value, keys) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected object');
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), 'Unexpected fields');
}

// Check ancestors and the opened inode; stream all inputs with a hard byte cap.
// No archive extraction, configuration loading, service calls or auth-record reads.
async function readBounded(filename, limit, collect = true) {
  assert(absolute(filename), 'Expected canonical absolute file path');
  let cursor = path.parse(filename).root;
  for (const part of filename.slice(cursor.length).split(path.sep)) {
    cursor = path.join(cursor, part);
    const st = await lstat(cursor);
    assert(!st.isSymbolicLink(), 'Linked path forbidden');
    assert(cursor === filename || st.isDirectory(), 'Invalid ancestor');
  }
  assert.equal(await realpath(filename), filename, 'Noncanonical path');
  const before = await lstat(filename);
  assert(before.isFile() && before.nlink === 1 && before.size <= limit, 'Unsafe file or size limit');
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const start = await handle.stat();
    assert(start.isFile() && start.nlink === 1 && start.ino === before.ino && start.dev === before.dev && start.size === before.size, 'File changed');
    const hash = createHash('sha256'), chunks = [];
    let size = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false, highWaterMark: 65536 })) {
      size += chunk.length;
      assert(size <= limit, 'Size limit');
      hash.update(chunk);
      if (collect) chunks.push(chunk);
    }
    const end = await handle.stat();
    assert(size === start.size && end.size === start.size && end.mtimeMs === start.mtimeMs && end.ctimeMs === start.ctimeMs, 'File changed');
    return { sha256: hash.digest('hex'), bytes: collect ? Buffer.concat(chunks) : undefined };
  } finally { await handle.close(); }
}

function validateIdentities(lock, bundle, identity) {
  assert.equal(lock.schema, 'evopilot-local-component-lock/v1', 'Component lock schema');
  assert.equal(lock.sharedContractSHA256, PIN, 'Contract pin');
  assert.equal(lock.authority, false); assert.equal(lock.acceptance, 'NOT_INFERRED');
  const commit = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
  assert(commit(lock.parentSourceCommit), 'Parent source commit');
  assert(Array.isArray(lock.components) && lock.components.length === 3, 'Three components required');
  assert.equal(bundle.schema, 'evopilot-preview-bundle/v1', 'Bundle schema');
  assert.equal(bundle.version, '0.1.0'); assert.equal(bundle.node, '24.14.0');
  assert.equal(bundle.contractSHA256, PIN, 'Contract pin');
  assert(Array.isArray(bundle.packages) && bundle.packages.length === 3, 'Three packages required');
  for (const [i, owner] of OWNERS.entries()) {
    const component = lock.components[i], pkg = bundle.packages[i];
    assert.equal(component.path, `projects/evopilot-${owner}`, 'Component path');
    assert.equal(component.name, `@evopilot-next/${owner}`, 'Component package');
    assert.equal(component.version, '0.1.0', 'Component version'); assert(commit(component.commit), 'Component commit');
    assert.equal(pkg.product, owner, 'Bundle product'); assert.equal(pkg.name, component.name, 'Bundle package');
    assert.equal(pkg.version, component.version, 'Bundle version'); assert(hex(pkg.packageSHA256), 'Package hash');
    assert(owner === 'runtime' ? pkg.dependencyLockSHA256 === null : hex(pkg.dependencyLockSHA256), 'Dependency lock hash');
  }
  assert(Array.isArray(bundle.files) && bundle.files.length > 0 && bundle.files.length <= 10000, 'Bundle inventory');
  const listed = new Set();
  for (const entry of bundle.files) {
    exact(entry, ['path', 'sha256']);
    assert(typeof entry.path === 'string' && /^[a-zA-Z0-9_@./-]+$/.test(entry.path) &&
      !path.isAbsolute(entry.path) && entry.path.split('/').every(p => p && p !== '.' && p !== '..') &&
      hex(entry.sha256) && !listed.has(entry.path), 'Bundle inventory entry');
    listed.add(entry.path);
  }
  // Public installationIdentity() value, never a live connection record.
  exact(identity, ['product', 'version', 'protocol', 'installationId', 'installationRoot', 'installationDigest', 'components', 'workspaceRoot', 'workspaceId']);
  assert.equal(identity.product, 'evopilot-v01-preview'); assert.equal(identity.version, bundle.version);
  assert.equal(identity.protocol, 'evopilot-connection/v1');
  assert(hex(identity.installationDigest), 'Installation digest');
  for (const field of ['installationId', 'workspaceId']) assert(typeof identity[field] === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(identity[field]), 'Identity ID');
  assert(absolute(identity.installationRoot) && absolute(identity.workspaceRoot), 'Identity roots');
  assert(outside(identity.workspaceRoot, identity.installationRoot) && outside(identity.installationRoot, identity.workspaceRoot), 'Overlapping identity roots');
  assert.deepEqual(identity.components, Object.fromEntries(OWNERS.map(owner => [owner, '0.1.0'])), 'Identity components');
  // Installation renders local MCP configuration; its digest is not the bundle digest.
}

export async function validateLocalAcceptance(report, { reportPath } = {}) {
  assert.equal(report?.schema, 'evopilot-local-acceptance-result/v1', 'Report schema');
  assert.equal(report.targetId, 'evopilot-v01-local-20261012');
  assert.equal(report.version, '0.1.0'); assert.equal(report.scope, 'M0-M4_LOCAL');
  assert.equal(report.approvedPlanDigest, PLAN, 'Approved plan digest');
  assert.equal(report.roadmapDigest, ROADMAP, 'Roadmap digest');
  assert.equal(report.authority, 'NONE', 'Report authority');
  for (const field of ['remoteActionsAuthorized', 'releaseAuthorized', 'dailyCutoverAuthorized']) assert.equal(report[field], false, field);
  assert(absolute(reportPath), 'Absolute reportPath required for self-reference checks');
  assert(Array.isArray(report.criteria) && report.criteria.length === 19 &&
    new Set(report.criteria.map(c => c?.id)).size === 19 && IDS.every(id => report.criteria.some(c => c?.id === id)), 'Exactly E01-E19 required');
  for (const c of report.criteria) {
    assert(c.category === 'LOCAL' && c.critical === true, `${c.id}: LOCAL critical required`);
    assert(['PASS', 'FAIL', 'PENDING', 'UNKNOWN', 'SKIPPED'].includes(c.status), `${c.id}: invalid status`);
    assert(Array.isArray(c.evidence) && c.evidence.length <= 256, `${c.id}: bounded evidence array required`);
    assert(c.status !== 'PASS' || c.evidence.length > 0, `${c.id}: PASS requires evidence`);
  }
  const seen = new Map();
  async function reference(ref, archive = false) {
    assert(ref && absolute(ref.path) && hex(ref.sha256), 'Invalid reference path/hash');
    assert(ref.path !== reportPath, 'Self-report reference forbidden');
    assert(!seen.has(ref.path) || seen.get(ref.path) === ref.sha256, 'Duplicate path hash mismatch');
    seen.set(ref.path, ref.sha256);
    const result = await readBounded(ref.path, archive ? ARCHIVE_LIMIT : JSON_LIMIT, !archive);
    assert.equal(result.sha256, ref.sha256, 'Reference hash mismatch');
    return result.bytes;
  }
  exact(report.candidate, ['componentLock', 'bundleManifest', 'sourceArchive', 'installationIdentity']);
  for (const ref of Object.values(report.candidate)) exact(ref, ['path', 'sha256']);
  const lock = JSON.parse(await reference(report.candidate.componentLock));
  const bundle = JSON.parse(await reference(report.candidate.bundleManifest));
  await reference(report.candidate.sourceArchive, true);
  const identity = JSON.parse(await reference(report.candidate.installationIdentity));
  validateIdentities(lock, bundle, identity);
  assert(outside(reportPath, identity.installationRoot) && outside(reportPath, identity.workspaceRoot) &&
    outside(reportPath, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')), 'Report must be outside app, source and workspace');
  for (const c of report.criteria) {
    for (const evidence of c.evidence) {
      assert(evidence && ['technical', 'desktop'].includes(evidence.kind), `${c.id}: evidence kind`);
      assert(typeof evidence.claim === 'string' && evidence.claim.trim().length > 0 && evidence.claim.length <= 8192, `${c.id}: evidence claim`);
      if (evidence.threadId !== undefined) assert(uuid(evidence.threadId), 'Thread UUID');
      if (evidence.installationDigest !== undefined) assert.equal(evidence.installationDigest, identity.installationDigest, 'Installation binding');
      if (evidence.kind === 'desktop') {
        assert(uuid(evidence.threadId), `${c.id}: desktop thread UUID`);
        assert.equal(evidence.installationDigest, identity.installationDigest, `${c.id}: desktop installation binding`);
        assert.equal(evidence.toolNamespace, 'evopilot_v01_preview', `${c.id}: desktop preview namespace`);
      }
      await reference(evidence);
    }
    if (c.status === 'PASS' && HOST.has(c.id)) assert(c.evidence.some(e => e.kind === 'desktop'), `${c.id}: desktop evidence required`);
  }
  const passed = report.criteria.every(c => c.status === 'PASS');
  return { status: passed ? 'PASSED' : 'NOT_PASSED', localAcceptance: passed ? 'PASSED' : 'NOT_PASSED',
    validation: 'STRUCTURAL_BINDING_INTEGRITY_COMPLETENESS_ONLY', authority: 'NONE',
    remoteActionsAuthorized: false, releaseAuthorized: false, dailyCutoverAuthorized: false };
}

export async function verifyLocalAcceptance(reportPath) {
  const { bytes } = await readBounded(reportPath, JSON_LIMIT);
  return validateLocalAcceptance(JSON.parse(bytes), { reportPath });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    assert(args.length === 2 && args[0] === '--report' && absolute(args[1]), 'Usage: node scripts/verify-local-acceptance.mjs --report ABSOLUTE_FILE');
    const result = await verifyLocalAcceptance(args[1]);
    console.log(JSON.stringify(result));
    if (result.localAcceptance !== 'PASSED') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
