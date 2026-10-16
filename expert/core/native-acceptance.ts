import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

type Phase = 'PRE_RELEASE' | 'POST_RELEASE';
interface Variant { criterionId: string; variantId: string; description: string; expected: string; phase: Phase }
interface Target { id: string; version: string; criterionIds: string[]; acceptanceCatalogDigest: string; acceptanceVariantsDigest: string; acceptanceVariantCount: number }
interface FileRef { path: string; sha256: string }
interface InstancePlan { variantId: string; instances: string[] }
interface Evidence extends FileRef { kind: 'command' | 'desktop' | 'source' | 'review' | 'release'; synthetic: boolean; candidateDigest: string; instanceId: string; locator: string; threadId?: string }
interface Result { variantId: string; instanceId: string; candidateDigest: string; expected: string; status: string; evidence: Evidence[] }
interface Report { schema: string; version: string; candidateDigest: string; instancePlanDigest: string; results: Result[] }
const hash = (bytes: Buffer) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
function requireValue(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function regular(filename: string): Buffer {
  requireValue(path.isAbsolute(filename) && path.normalize(filename) === filename, 'Canonical absolute evidence path required');
  let current = path.parse(filename).root;
  for (const part of filename.split(path.sep).filter(Boolean)) { current = path.join(current, part); requireValue(!fs.lstatSync(current).isSymbolicLink(), 'Evidence links forbidden'); }
  const st = fs.lstatSync(filename);
  requireValue(st.isFile() && st.nlink === 1 && st.size <= 128 * 1024 * 1024, 'Regular bounded evidence required');
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { const before = fs.fstatSync(fd); requireValue(before.ino === st.ino && before.dev === st.dev, 'Evidence changed'); const bytes = fs.readFileSync(fd); requireValue(bytes.length === st.size, 'Evidence changed'); return bytes; } finally { fs.closeSync(fd); }
}
function unique(values: string[], label: string): void { requireValue(values.every(v => typeof v === 'string' && v.length > 0) && new Set(values).size === values.length, 'Duplicate/empty ' + label); }
const sameSet = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const desktopVariants = new Set(['D01.01', 'D01.02', 'D01.03', 'U01.01', 'U01.02', 'U01.03', 'U01.04', 'U02.01', 'D07.01', 'D07.02', 'D07.03', 'R05.04', 'R05.09']);

/** Completeness and byte binding only. It cannot judge domain meaning or grant acceptance/release authority. */
export function verifyNativeAcceptance(options: { targetPath: string; catalogPath: string; variantsPath: string; instancePlanPath: string; instancePlanDigest: string; reportPath: string; candidateDigest: string; phase: Phase }) {
  const target = JSON.parse(regular(options.targetPath).toString()) as Target;
  const catalogBytes = regular(options.catalogPath), variantBytes = regular(options.variantsPath), planBytes = regular(options.instancePlanPath);
  requireValue(target.version === '0.3.0' && hash(catalogBytes) === target.acceptanceCatalogDigest && hash(variantBytes) === target.acceptanceVariantsDigest, 'Frozen acceptance contract differs');
  requireValue(/^sha256:[a-f0-9]{64}$/.test(options.candidateDigest) && hash(planBytes) === options.instancePlanDigest, 'Candidate/instance-plan binding differs');
  requireValue(['PRE_RELEASE', 'POST_RELEASE'].includes(options.phase), 'Unknown phase');
  const catalog = JSON.parse(catalogBytes.toString()) as { criteria: { id: string }[] };
  const variants = (JSON.parse(variantBytes.toString()) as { variants: Variant[] }).variants;
  requireValue(target.criterionIds.length === 65 && target.acceptanceVariantCount === 364, 'Target denominator changed');
  unique(catalog.criteria.map(c => c.id), 'criterion'); unique(variants.map(v => v.variantId), 'variant');
  requireValue(sameSet(catalog.criteria.map(c => c.id), target.criterionIds) && variants.length === target.acceptanceVariantCount, 'Frozen denominator differs');
  requireValue(variants.every(v => target.criterionIds.includes(v.criterionId) && ['PRE_RELEASE', 'POST_RELEASE'].includes(v.phase) && v.description && v.expected), 'Invalid frozen variant');
  requireValue(variants.filter(v => v.phase === 'PRE_RELEASE').length === 356 && variants.filter(v => v.phase === 'POST_RELEASE').length === 8, 'Release phase boundary changed');
  const plan = JSON.parse(planBytes.toString()) as { schema: string; variants: InstancePlan[] };
  requireValue(plan.schema === 'evopilot-acceptance-instance-plan/v1', 'Independent instance plan required');
  unique(plan.variants.map(v => v.variantId), 'instance plan variant');
  requireValue(sameSet(plan.variants.map(v => v.variantId), variants.map(v => v.variantId)), 'Instance plan cannot shrink fixed variants');
  for (const item of plan.variants) { requireValue(item.instances.length > 0, 'Empty instance set'); unique(item.instances, 'instance'); }
  const report = JSON.parse(regular(options.reportPath).toString()) as Report;
  requireValue(report.schema === 'evopilot-native-acceptance-results/v1' && report.version === target.version && report.candidateDigest === options.candidateDigest && report.instancePlanDigest === options.instancePlanDigest, 'Stale acceptance report');
  unique(report.results.map(r => r.variantId + '\0' + r.instanceId), 'result');
  const expectedPairs = new Set(plan.variants.flatMap(p => p.instances.map(id => p.variantId + '\0' + id)));
  requireValue(report.results.every(r => expectedPairs.has(r.variantId + '\0' + r.instanceId)), 'Orphan result');
  const needed = variants.filter(v => options.phase === 'POST_RELEASE' || v.phase === 'PRE_RELEASE');
  const missing: string[] = [], incomplete: string[] = [];
  const checkedFiles = new Map<string, string>();
  let instances = 0;
  for (const v of needed) for (const id of plan.variants.find(p => p.variantId === v.variantId)!.instances) {
    instances++;
    const result = report.results.find(r => r.variantId === v.variantId && r.instanceId === id), key = v.variantId + ':' + id;
    if (!result) { missing.push(key); continue; }
    requireValue(result.candidateDigest === options.candidateDigest && result.expected === v.expected, 'Candidate or expected outcome differs: ' + key);
    if (result.status !== 'PASS' || !result.evidence.length) { incomplete.push(key); continue; }
    if (desktopVariants.has(v.variantId)) requireValue(result.evidence.some(e => e.kind === 'desktop' && e.synthetic === false), 'Actual Host evidence required: ' + key);
    for (const evidence of result.evidence) {
      requireValue(['command', 'desktop', 'source', 'review', 'release'].includes(evidence.kind) && typeof evidence.synthetic === 'boolean' && typeof evidence.locator === 'string' && evidence.locator.trim(), 'Evidence identity missing');
      requireValue(evidence.candidateDigest === options.candidateDigest && evidence.instanceId === id && evidence.path !== options.reportPath && evidence.path !== options.instancePlanPath, 'Evidence self-report or stale binding');
      if (['desktop', 'review', 'release'].includes(evidence.kind)) requireValue(evidence.synthetic === false, 'Synthetic human/Host/release evidence forbidden');
      if (evidence.kind === 'desktop') requireValue(typeof evidence.threadId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(evidence.threadId), 'Actual Host thread identity required');
      const prior = checkedFiles.get(evidence.path);
      requireValue(!prior || prior === evidence.sha256, 'Conflicting evidence file binding');
      if (!prior) { requireValue(hash(regular(evidence.path)) === evidence.sha256, 'Evidence bytes differ'); checkedFiles.set(evidence.path, evidence.sha256); }
    }
  }
  return { targetId: target.id, candidateDigest: options.candidateDigest, phase: options.phase, variants: needed.length, instances, missing, incomplete, completeness: missing.length || incomplete.length ? 'INCOMPLETE' : 'COMPLETE', acceptance: 'NOT_EVALUATED', authority: false, releaseAuthorized: false };
}
