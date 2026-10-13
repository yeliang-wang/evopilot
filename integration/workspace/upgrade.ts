import fs from 'node:fs';
import path from 'node:path';
import type { ProjectContext } from './project.js';
import { withInstallationLease } from './lock.js';
import { canonicalJSON, canonicalPath, digest, fail, fields, loadInstallationConfiguration, readRegular } from '../connection/config.js';

export interface TemplateUpgradeInput { requestId: string; expectedTemplateVersion: string; targetTemplateVersion: '0.2.0' }
interface TemplateFile { relative: string; bytes: Buffer; sha256: string }
interface UpgradePlan {
  schema: 'evopilot-template-upgrade/v1'; requestId: string; workspaceId: string;
  installationDigest: string; previousVersion: string; targetVersion: '0.2.0';
  originalMarkerDigest: string; upgradedMarkerDigest: string;
  created: string[]; customized: string[]; unchanged: string[]; authority: false;
}
const exists = (filename: string): boolean => { try { fs.lstatSync(filename); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } };
function directory(root: string): void {
  canonicalPath(root); const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.uid !== process.getuid!() || (stat.mode & 0o077)) fail('TEMPLATE_UPGRADE_PATH');
}
function synchronize(root: string): void { const fd = fs.openSync(root, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function createFile(filename: string, bytes: Buffer, stagingRoot: string): void {
  // Reserved request staging is disposable; final user paths never contain partial writes.
  const pending = path.join(stagingRoot, digest(filename) + '.pending');
  if (exists(pending)) { readRegular(pending, 8 * 1024 * 1024, true); fs.unlinkSync(pending); synchronize(stagingRoot); }
  const fd = fs.openSync(pending, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (exists(filename)) {
    if (digest(readRegular(filename)) !== digest(bytes)) fail('TEMPLATE_UPGRADE_CONFLICT');
    fs.unlinkSync(pending);
  } else fs.renameSync(pending, filename);
  synchronize(stagingRoot); synchronize(path.dirname(filename));
}
function parentDirectories(root: string, relative: string, create: boolean): void {
  let current = root;
  for (const segment of relative.split('/').slice(0, -1)) {
    current = path.join(current, segment);
    if (!exists(current)) { if (!create) return; fs.mkdirSync(current, { mode: 0o700 }); synchronize(path.dirname(current)); }
    directory(current);
  }
}

/** Explicit template upgrade; product installation and business state are never changed. */
export async function upgradeWorkspaceProject(context: ProjectContext & { configPath: string }, input: TemplateUpgradeInput) {
  fields(input, ['requestId', 'expectedTemplateVersion', 'targetTemplateVersion']);
  if (typeof input.requestId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.requestId)
    || !['0.1.1', '0.2.0'].includes(input.expectedTemplateVersion) || input.targetTemplateVersion !== '0.2.0') fail('TEMPLATE_VERSION');
  const installation = loadInstallationConfiguration(context.configPath);
  return withInstallationLease(installation, input.requestId, async () => upgradeUnderLease(context, input));
}

function upgradeUnderLease(context: ProjectContext & { configPath: string }, input: TemplateUpgradeInput) {
  // Revalidate identity, marker and durable plan after acquiring the shared installation lease.
  const configuration = loadInstallationConfiguration(context.configPath);
  if (configuration.installationRoot !== context.installationRoot || configuration.projectRoot !== context.projectRoot
    || configuration.workspaceRoot !== context.stateRoot || configuration.workspaceId !== context.workspaceId) fail('TEMPLATE_UPGRADE_IDENTITY');
  directory(context.projectRoot);
  const markerPath = path.join(context.projectRoot, 'workspace-project.json');
  const markerBytes = readRegular(markerPath, 8192, true);
  const marker: unknown = JSON.parse(markerBytes.toString());
  fields(marker, ['schema', 'id', 'templateVersion', 'specifications']); fields(marker.specifications, ['ontology', 'harness']);
  if (marker.schema !== 'evopilot-workspace-project/v1' || marker.id !== context.workspaceId
    || !['0.1.1', '0.2.0'].includes(String(marker.templateVersion)) || marker.specifications.ontology !== 'v1'
    || marker.specifications.harness !== 'v1') fail('TEMPLATE_SCHEMA');
  const upgradedBytes = Buffer.from(JSON.stringify({ ...marker, templateVersion: '0.2.0' }, null, 2) + '\n');
  const templateRoot = path.join(context.installationRoot, 'workspace/templates/project');
  const files: TemplateFile[] = []; let count = 0, total = 0;
  function visit(relative: string): void {
    if (++count > 1000) fail('LIMIT');
    const filename = path.join(templateRoot, relative); canonicalPath(filename);
    if (fs.lstatSync(filename).isDirectory()) {
      for (const name of fs.readdirSync(filename).sort()) visit(relative ? relative + '/' + name : name);
      return;
    }
    const bytes = readRegular(filename); total += bytes.length;
    if (total > 8 * 1024 * 1024) fail('LIMIT');
    const bound = configuration.manifest.find(entry => entry.path === 'workspace/templates/project/' + relative);
    if (!bound || digest(bytes) !== bound.sha256) fail('TEMPLATE_INCOMPLETE');
    files.push({ relative, bytes, sha256: bound.sha256 });
  }
  visit('');
  for (const required of ['README.md', 'docs/storage.md', 'examples/forward/README.md', 'examples/reverse/README.md', 'examples/reverse/source.json', '.gitignore']) {
    if (!files.some(file => file.relative === required)) fail('TEMPLATE_INCOMPLETE');
  }
  // All existing destinations are validated before writes. Templates never replace user bytes.
  const created: string[] = [], customized: string[] = [], unchanged: string[] = [];
  for (const file of files) {
    parentDirectories(context.projectRoot, file.relative, false);
    const target = path.join(context.projectRoot, file.relative);
    if (!exists(target)) created.push(file.relative);
    else if (digest(readRegular(target)) === file.sha256) unchanged.push(file.relative);
    else customized.push(file.relative);
  }
  const recordRoot = path.join(context.projectRoot, '.evopilot-template-upgrades');
  if (exists(recordRoot)) directory(recordRoot);
  const planPath = path.join(recordRoot, input.requestId + '.json');
  const backupPath = path.join(recordRoot, input.requestId + '.workspace-project.json');
  const plan: UpgradePlan = { schema: 'evopilot-template-upgrade/v1', requestId: input.requestId, workspaceId: context.workspaceId,
    installationDigest: configuration.identity.installationDigest, previousVersion: input.expectedTemplateVersion,
    targetVersion: '0.2.0', originalMarkerDigest: digest(markerBytes), upgradedMarkerDigest: digest(upgradedBytes),
    created, customized, unchanged, authority: false };
  let original = plan, reused = false;
  if (exists(planPath)) {
    const prior: unknown = JSON.parse(readRegular(planPath, 1024 * 1024, true).toString());
    fields(prior, Object.keys(plan));
    if (prior.schema !== plan.schema || prior.requestId !== input.requestId || prior.workspaceId !== context.workspaceId
      || prior.installationDigest !== plan.installationDigest || prior.previousVersion !== input.expectedTemplateVersion
      || prior.targetVersion !== input.targetTemplateVersion || prior.authority !== false
      || typeof prior.originalMarkerDigest !== 'string' || typeof prior.upgradedMarkerDigest !== 'string'
      || !/^[a-f0-9]{64}$/.test(prior.originalMarkerDigest) || !/^[a-f0-9]{64}$/.test(prior.upgradedMarkerDigest)) fail('TEMPLATE_UPGRADE_CONFLICT');
    const flattened: string[] = [];
    for (const key of ['created', 'customized', 'unchanged'] as const) {
      if (!Array.isArray(prior[key]) || prior[key].some(item => typeof item !== 'string' || !files.some(file => file.relative === item))) fail('TEMPLATE_UPGRADE_CONFLICT');
      flattened.push(...prior[key] as string[]);
    }
    if (flattened.length !== files.length || new Set(flattened).size !== files.length) fail('TEMPLATE_UPGRADE_CONFLICT');
    if (digest(readRegular(backupPath, 8192, true)) !== prior.originalMarkerDigest) fail('TEMPLATE_UPGRADE_CONFLICT');
    if (![prior.originalMarkerDigest, prior.upgradedMarkerDigest].includes(digest(markerBytes))) fail('TEMPLATE_UPGRADE_CONFLICT');
    original = prior as unknown as UpgradePlan; reused = true;
  } else if (marker.templateVersion !== input.expectedTemplateVersion) fail('TEMPLATE_VERSION_CONFLICT');

  if (digest(readRegular(markerPath, 8192, true)) !== digest(markerBytes)) fail('TEMPLATE_UPGRADE_CONFLICT');
  if (!exists(recordRoot)) { fs.mkdirSync(recordRoot, { mode: 0o700 }); synchronize(context.projectRoot); }
  directory(recordRoot);
  const stagingRoot = path.join(recordRoot, '.staging-' + input.requestId);
  if (!exists(stagingRoot)) { fs.mkdirSync(stagingRoot, { mode: 0o700 }); synchronize(recordRoot); }
  directory(stagingRoot);
  if (!reused) {
    if (exists(backupPath)) { if (digest(readRegular(backupPath, 8192, true)) !== original.originalMarkerDigest) fail('TEMPLATE_UPGRADE_CONFLICT'); }
    else createFile(backupPath, markerBytes, stagingRoot);
    createFile(planPath, Buffer.from(canonicalJSON(original) + '\n'), stagingRoot);
  }
  for (const relative of original.created) {
    const file = files.find(item => item.relative === relative)!;
    parentDirectories(context.projectRoot, relative, true);
    const target = path.join(context.projectRoot, relative);
    if (exists(target)) { if (digest(readRegular(target)) !== file.sha256) fail('TEMPLATE_UPGRADE_CONFLICT'); }
    else createFile(target, file.bytes, stagingRoot);
  }
  if (digest(readRegular(markerPath, 8192, true)) === original.originalMarkerDigest) {
    const newBytes = Buffer.from(JSON.stringify({ ...JSON.parse(readRegular(backupPath, 8192, true).toString()), templateVersion: '0.2.0' }, null, 2) + '\n');
    if (digest(newBytes) !== original.upgradedMarkerDigest) fail('TEMPLATE_UPGRADE_CONFLICT');
    const temporary = path.join(context.projectRoot, '.workspace-project-' + input.requestId + '.tmp');
    if (exists(temporary)) { if (digest(readRegular(temporary, 8192, true)) !== digest(newBytes)) fail('TEMPLATE_UPGRADE_CONFLICT'); }
    else createFile(temporary, newBytes, stagingRoot);
    fs.renameSync(temporary, markerPath); synchronize(context.projectRoot);
  }
  if (fs.readdirSync(stagingRoot).length === 0) { fs.rmdirSync(stagingRoot); synchronize(recordRoot); }
  return { ...original, status: original.previousVersion === '0.2.0' ? 'CURRENT' : 'UPGRADED', reused, markerBackupPath: backupPath,
    conflicts: original.customized.map(relative => ({ path: relative, resolution: 'PRESERVED_CUSTOMIZED' })), authority: false as const };
}
