import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { scenarioCatalogue, scenarioIds } from './scenarios.js';

type Status = 'PASS' | 'FAIL' | 'PENDING' | 'UNKNOWN' | 'SKIPPED';
interface Evidence {
  kind: 'automated' | 'desktop';
  path: string;
  sha256: string;
  installationDigest: string;
  synthetic: boolean;
  branches: string[];
  tests?: string[];
  threadId?: string;
  toolNamespace?: 'evopilot_v01_preview';
}
export interface ExpertAcceptanceReport {
  schema: 'evopilot-expert-evidence/v1';
  version: '0.2.0';
  installationDigest: string;
  scenarios: { id: string; status: Status; evidence: Evidence[] }[];
}
export interface ExpertEvidenceResult {
  completeness: 'COMPLETE' | 'INCOMPLETE' | 'INVALID';
  acceptance: 'NOT_EVALUATED';
  authority: false;
  releaseAuthorized: false;
  problems: string[];
}
const digest = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 256
  && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 4096)
  && new Set(value).size === value.length;
const result = (completeness: ExpertEvidenceResult['completeness'], problems: string[]): ExpertEvidenceResult =>
  ({ completeness, acceptance: 'NOT_EVALUATED', authority: false, releaseAuthorized: false, problems });

/** Metadata completeness only. The caller must review the actual Host and product receipts. */
export function evaluateScenarioEvidence(value: unknown, expectedInstallationDigest: string): ExpertEvidenceResult {
  const invalid = (): ExpertEvidenceResult => result('INVALID', ['Malformed or mismatched Expert evidence report.']);
  if (!digest.test(expectedInstallationDigest) || !record(value, ['schema', 'version', 'installationDigest', 'scenarios'])
    || value.schema !== 'evopilot-expert-evidence/v1' || value.version !== '0.2.0'
    || value.installationDigest !== expectedInstallationDigest || !Array.isArray(value.scenarios)
    || value.scenarios.length !== scenarioIds.length) return invalid();
  const seen = new Set<string>(), problems: string[] = [];
  for (const raw of value.scenarios) {
    if (!record(raw, ['id', 'status', 'evidence']) || typeof raw.id !== 'string' || seen.has(raw.id)
      || !['PASS', 'FAIL', 'PENDING', 'UNKNOWN', 'SKIPPED'].includes(String(raw.status))
      || !Array.isArray(raw.evidence) || raw.evidence.length > 256) return invalid();
    const definition = scenarioCatalogue.find(item => item.id === raw.id);
    if (!definition) return invalid();
    seen.add(raw.id);
    const branches = new Set<string>(), tests = new Set<string>();
    let desktop = false;
    for (const item of raw.evidence) {
      if (!record(item, ['kind', 'path', 'sha256', 'installationDigest', 'synthetic', 'branches'], ['tests', 'threadId', 'toolNamespace'])
        || !['automated', 'desktop'].includes(String(item.kind)) || typeof item.path !== 'string'
        || item.path.length > 4096 || !path.isAbsolute(item.path) || path.normalize(item.path) !== item.path
        || typeof item.sha256 !== 'string' || !digest.test(item.sha256)
        || item.installationDigest !== expectedInstallationDigest || typeof item.synthetic !== 'boolean'
        || !stringList(item.branches) || item.branches.some(branch => !definition.requiredBranches.includes(branch))) return invalid();
      if (item.kind === 'desktop') {
        if (item.synthetic || item.toolNamespace !== 'evopilot_v01_preview' || typeof item.threadId !== 'string'
          || !uuid.test(item.threadId) || Object.hasOwn(item, 'tests')) return invalid();
        desktop = true;
      } else {
        if (Object.hasOwn(item, 'threadId') || Object.hasOwn(item, 'toolNamespace') || !stringList(item.tests)
          || item.tests.length === 0 || item.tests.some(file => !definition.automatedTests.includes(file))) return invalid();
        for (const file of item.tests) tests.add(file);
        for (const branch of item.branches) branches.add(branch);
      }
    }
    if (raw.status !== 'PASS') problems.push(`${definition.id}: ${String(raw.status)}.`);
    if (!desktop) problems.push(`${definition.id}: real Desktop evidence missing.`);
    for (const branch of definition.requiredBranches) if (!branches.has(branch)) problems.push(`${definition.id}: automated branch ${branch} missing.`);
    for (const file of definition.automatedTests) if (!tests.has(file)) problems.push(`${definition.id}: test run ${file} missing.`);
  }
  return result(problems.length ? 'INCOMPLETE' : 'COMPLETE', problems);
}

function verifiedFile(file: string, maximum: number): Buffer {
  if (!path.isAbsolute(file) || path.normalize(file) !== file || realpathSync(file) !== file) throw Error('Unsafe evidence path');
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > maximum) throw Error('Unsafe evidence file');
  return readFileSync(file);
}

/** Verifies bytes and metadata only; cannot determine whether an observed Host behavior was correct. */
export function verifyExpertAcceptanceFile(reportPath: string, expectedInstallationDigest: string): ExpertEvidenceResult {
  try {
    const raw: unknown = JSON.parse(verifiedFile(reportPath, 4 * 1024 * 1024).toString('utf8'));
    const checked = evaluateScenarioEvidence(raw, expectedInstallationDigest);
    if (checked.completeness === 'INVALID') return checked;
    const report = raw as ExpertAcceptanceReport;
    const paths = new Map<string, string>();
    for (const scenario of report.scenarios) for (const evidence of scenario.evidence) {
      if (evidence.path === reportPath) throw Error('Self-referential evidence');
      const prior = paths.get(evidence.path);
      if (prior && prior !== evidence.sha256) throw Error('Conflicting evidence hash');
      if (!prior) {
        const bytes = verifiedFile(evidence.path, 32 * 1024 * 1024);
        if (createHash('sha256').update(bytes).digest('hex') !== evidence.sha256) throw Error('Evidence mismatch');
        paths.set(evidence.path, evidence.sha256);
      }
    }
    return checked;
  } catch {
    return result('INVALID', ['Evidence files are unavailable, unsafe, changed or malformed.']);
  }
}
