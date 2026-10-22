import { syntheticDecisionEvidence } from './decision-evidence.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createNativeProjectService} from '../../../dist/integration/workspace/native-project.js';
import {nativeBytesDigest,nativeSha256} from '../../../dist/integration/compatibility/v1/native.mjs';
import {nativePackage,rehash} from '../../../projects/evopilot-ontology/tests/fixtures/native/package.mjs';
import {syntheticHarnessPackage,replaceNativeFile} from '../../../projects/evopilot-harness/examples/native/package.mjs';
// Fixed independently of generated coverage. These fixtures are not business approval evidence.
const expected = [
  ['ontology:scope', ['positive', 'root-type', 'relation', 'combination', 'kind', 'operation', 'limit'], 'ontology.txt'],
  ['harness:requirement-H001', ['positive', 'deny', 'missing-H001', 'actual-observation'], 'harness.txt'],
  ['harness:requirement-H002', ['positive', 'violation', 'missing-H002', 'actual-observation'], 'harness.txt'],
  ['harness:requirement-H003', ['positive', 'warn', 'missing-H003', 'actual-observation'], 'harness.txt'],
];
export const write = (p, value) => fs.writeFileSync(p, typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 });
export function fixture(direction = 'forward', visibility = 'private') {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'evopilot-project-standard-'));
  const projectRoot = path.join(root, 'workspace'), stateRoot = path.join(root, 'state'), source = path.join(root, 'source');
  for (const p of [projectRoot, stateRoot, source]) fs.mkdirSync(p, { mode: 0o700 });
  const workspaceId = 'synthetic', scope = { visibility, projectId: 'synthetic-project' };
  write(path.join(projectRoot, 'workspace-project.json'), { schema: 'evopilot-workspace-project/v1', id: workspaceId, templateVersion: '0.2.0', specifications: { ontology: 'v1', harness: 'v1' } });
  write(path.join(stateRoot, 'workspace.json'), { schema: 'evopilot-workspace/v1', id: workspaceId, canonicalRoot: stateRoot, ownerUid: process.getuid() });
  const packages = { ontology: nativePackage({ visibility }), harness: syntheticHarnessPackage({ visibility, direction }) };
  write(path.join(source, 'ontology.txt'), packages.ontology.files['sources/source.txt']);
  write(path.join(source, 'harness.txt'), packages.harness.files['sources/requirements.txt']);
  write(path.join(source, 'package.json'), { name: 'synthetic-source', private: true });
  const git = (...args) => execFileSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', '-C', source, ...args], { env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'Synthetic Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Synthetic Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' }, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  let revision = 'requirements-one';
  if (direction === 'reverse') { git('init', '-q'); git('add', '.'); git('commit', '-qm', 'Synthetic source baseline'); revision = git('rev-parse', 'HEAD'); }
  for (const owner of ['ontology', 'harness']) {
    const pkg = packages[owner], key = pkg.manifest.sourceBindingRef, bindings = JSON.parse(pkg.files[key]);
    bindings.direction = direction;
    for (const row of bindings.sources) { row.locator = owner + '.txt'; row.revision = revision; row.status = 'observed'; }
    for (const row of bindings.requirements) row.id = owner + ':' + row.id;
    for (const row of bindings.mappings) { row.requirementId = owner + ':' + row.requirementId; row.revision = revision; row.status = 'inferred'; row.rationale = 'Synthetic fixture mapping; explicit domain review still required.'; }
    pkg.files[key] = JSON.stringify(bindings);
    if (owner === 'ontology') { const cases = JSON.parse(pkg.files['tests/cases.json']); for (const c of cases.cases) c.requirementIds = ['ontology:scope']; pkg.files['tests/cases.json'] = JSON.stringify(cases); }
    else { const coverage = JSON.parse(pkg.files['coverage.json']); for (const r of coverage.requirements) r.id = 'harness:' + r.id; replaceNativeFile(pkg, 'coverage.json', coverage); }
    rehash(pkg);
  }
  const requirements = { schema: 'evopilot-project-requirements/v1', projectId: scope.projectId, direction,
    ownerRequirements: expected.map(([criterionId, variantIds, sourceId]) => ({ criterionId, variantIds, origin: direction === 'forward' ? 'design-declaration' : 'source-declaration', description: 'Independent synthetic requirement ' + criterionId, sourceIds: [sourceId] })),
    modules: [{ id: '.', disposition: 'included', requirementIds: expected.map(r => r[0]), reason: 'One synthetic module' }], capabilities: [{ id: 'synthetic-capability', requirementIds: expected.map(r => r[0]) }], exclusions: [] };
  let completedProject = null;
  const nodePath = fs.realpathSync(process.execPath), toolFiles = [{path: nodePath, sha256: nativeBytesDigest(fs.readFileSync(nodePath)).slice(7)}];
  const rawService = createNativeProjectService({ projectRoot, stateRoot, workspaceId }, { nativeToolchain:()=>{if(!process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN)throw Error('Prepare the isolated pinned native toolchain');return JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN,'utf8'));}, toolchains: { node: {toolchainLockDigest:nativeSha256(toolFiles),toolFiles,readRoots:[]} }, readCompletedProject: async () => completedProject ?? { complete: null } });
  const service = {...rawService,reviewDomain(input){if(input.humanEvidenceRef?.startsWith('synthetic')){const frozen=rawService.inspect(input);const subject={candidateDigest:frozen.candidate.reviewDigest,runtimeCandidateDigest:input.runtimeCandidateDigest,assetDigests:input.assetDigests,bindingsDigest:input.bindingsDigest,inferredMappings:input.inferredMappings};input={...input,humanEvidenceRef:syntheticDecisionEvidence(root,{owner:'project',operation:'reviewDomain',workspaceId,scope:input.scope,reviewDigest:nativeSha256(subject),decision:input.decision})};}return rawService.reviewDomain(input);}};
  const input = { id: 'round-one', scope, sourceRoot: source, direction, revision, requirements, standardPins: Object.fromEntries(Object.entries(packages).map(([k, v]) => [k, v.manifest.standardPins])) };
  return { root, source, projectRoot, stateRoot, scope, service, input, packages, git, setCompletion: value => { completedProject = value; }, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
export async function freeze(f, input = f.input, packages = f.packages) { const candidate = await f.service.prepare(input); return f.service.freeze({ scope: f.scope, id: input.id, packages, reviewDigest: candidate.reviewDigest, humanEvidenceRef: syntheticDecisionEvidence(f.root,{owner:'project',operation:'freeze',workspaceId:'synthetic',scope:f.scope,reviewDigest:candidate.reviewDigest,decision:'ACCEPT'}) }); }
