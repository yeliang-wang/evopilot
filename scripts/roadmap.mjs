import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ROADMAP_DIGEST = 'sha256:06c0e62d0f2fffce6013720509a603e753ca4f402ce24fc0937c8b45bd8129c2';
const PLAN_DIGEST = 'sha256:5bae53afa8a1245d9b5f3c63630b9654ea04938481e3f798964c762a5a7cc926';
const IDS = Array.from({ length: 19 }, (_, index) => `E${String(index + 1).padStart(2, '0')}`);
const AUTHORITY = 'LOCAL_IMPLEMENTATION_ONLY';

function requireFact(condition, message) {
  if (!condition) throw new Error(`Governance inconsistent: ${message}`);
}

function exactSet(actual, expected, label) {
  requireFact(Array.isArray(actual) && actual.length === expected.length &&
    new Set(actual).size === expected.length && expected.every(value => actual.includes(value)), label);
}

// Parse and hash the same raw roadmap. These are technical bindings, not a
// human signature or product acceptance. No filesystem access in this function.
export function validateGovernance({ roadmapRaw, lock, decision, acceptance, m0, intent } = {}) {
  requireFact(typeof roadmapRaw === 'string' || Buffer.isBuffer(roadmapRaw), 'raw roadmap input required');
  const roadmap = JSON.parse(roadmapRaw.toString());
  for (const [value, schema, label] of [
    [roadmap, 'evopilot-local-roadmap/v1', 'roadmap'],
    [lock, 'evopilot-local-implementation-lock/v1', 'implementation lock'],
    [decision, 'evopilot-local-implementation-authorization/v1', 'decision'],
    [acceptance, 'evopilot-local-acceptance/v1', 'acceptance'],
    [m0, 'evopilot-m0-technical-evidence/v1', 'M0'],
  ]) requireFact(value?.schema === schema, `${label} schema`);
  requireFact(lock.roadmapDigest === ROADMAP_DIGEST, 'implementation lock roadmap digest');
  requireFact(lock.approvedPlanDigest === PLAN_DIGEST && roadmap.approvedPlanDigest === PLAN_DIGEST &&
    decision.planDigest === PLAN_DIGEST, 'approved plan digest binding');
  requireFact(lock.milestone === 'local-v0.1' && lock.version === '0.1.0' &&
    roadmap.version === '0.1.0' && roadmap.product === 'evopilot', 'local milestone/version/product');
  requireFact(lock.authority === AUTHORITY && decision.authority === AUTHORITY &&
    lock.remoteActionsAuthorized === false, 'local-only authority');
  requireFact(decision.oldSourcePolicy === 'READ_ONLY' &&
    decision.planDigestIndividuallyReviewedByUser === false, 'decision source policy and technical binding');
  for (const field of ['remoteCreationAuthorized', 'publicationAuthorized', 'oldRepositoryDeletionAuthorized', 'dailyCutoverAuthorized']) {
    requireFact(decision[field] === false, `decision ${field} must be false`);
  }
  requireFact(Array.isArray(roadmap.milestones) && roadmap.milestones.length === 1 &&
    roadmap.milestones[0]?.id === lock.milestone, 'single current local milestone');
  exactSet(roadmap.milestones[0].stages, ['M0', 'M1', 'M2', 'M3', 'M4'], 'local stages must be M0-M4');
  exactSet(roadmap.milestones[0].acceptanceIds, IDS, 'milestone must cover exactly E01-E19');
  requireFact(roadmap.releaseGate?.stage === 'M5' && roadmap.releaseGate.requiresFreshUserDecision === true &&
    roadmap.releaseGate.remoteActionsAuthorized === false, 'M5 release gate');
  const digest = `sha256:${createHash('sha256').update(roadmapRaw).digest('hex')}`;
  requireFact(digest === lock.roadmapDigest, 'raw roadmap digest mismatch');
  requireFact(acceptance.targetId === 'evopilot-v01-local-20261012' && Array.isArray(acceptance.criteria), 'acceptance target/criteria');
  exactSet(acceptance.criteria.map(item => item?.id), IDS, 'acceptance must cover exactly E01-E19 without duplicates');
  requireFact(acceptance.criteria.every(item => item.category === 'LOCAL' && item.critical === true &&
    item.status === 'PENDING'), 'first M1 acceptance must remain LOCAL, critical and PENDING');
  requireFact(m0.technicalStatus === 'PASS' && m0.scope === 'M0 feasibility only' &&
    m0.productOperations === 0, 'M0 technical feasibility only');
  for (const field of ['remoteActionsAuthorized', 'releaseAuthorized', 'fullProductE2EComplete']) {
    requireFact(m0[field] === false, `M0 ${field} must be false`);
  }
  requireFact(m0.acceptance && typeof m0.acceptance === 'object', 'M0 acceptance required');
  exactSet(Object.keys(m0.acceptance), IDS, 'M0 acceptance must cover exactly E01-E19');
  requireFact(IDS.every(id => m0.acceptance[id] === 'PENDING'), 'M0 acceptance must remain PENDING');
  if (intent !== undefined) {
    const classification = classifyIntent(intent);
    requireFact(classification === 'LOCAL_CANDIDATE', `${classification}: intent is not an authorized local intent`);
  }
  return { status: intent === undefined ? 'PASSED' : 'ALIGNED', localAcceptance: 'NOT_PASSED', authority: AUTHORITY };
}

export async function checkRoadmap(intent) {
  const paths = ['roadmap.json', 'implementation-lock.json', 'decisions/local-implementation.json', 'acceptance.json', 'm0.json'];
  const [roadmapRaw, ...json] = await Promise.all(paths.map(path => readFile(new URL(`../governance/${path}`, import.meta.url), 'utf8')));
  const [lock, decision, acceptance, m0] = json.map(value => JSON.parse(value));
  return validateGovernance({ roadmapRaw, lock, decision, acceptance, m0, intent });
}

export function classifyIntent(intent) {
  if (typeof intent !== 'string' || !intent.trim()) return 'UNKNOWN';
  if (/(remote|release|publish|publication|delet|cutover|workbuddy|old[- _]?source|github|git\s|push|install|deploy)/i.test(intent)) return 'BLOCKED';
  if (/^local-v0\.1[/: ]M5(?:\b|:)/i.test(intent)) return 'BLOCKED';
  if (!/^local-v0\.1[/: ]M[0-4]:\s*\S/.test(intent)) return 'UNKNOWN';
  return 'LOCAL_CANDIDATE';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === '--release') throw new Error('BLOCKED: release requires a fresh human release decision; no CLI flag grants release authority');
    let result;
    if (args.length === 1 && args[0] === '--check') result = await checkRoadmap();
    else if (args.length === 3 && args[0] === '--gate' && args[1] === '--intent') {
      const classification = classifyIntent(args[2]);
      if (classification !== 'LOCAL_CANDIDATE') throw new Error(`${classification}: intent is not an authorized local intent`);
      result = await checkRoadmap(args[2]);
    } else throw new Error('UNKNOWN: use --check or --gate --intent "local-v0.1/M1: concrete intent"');
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
