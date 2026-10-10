import { constants, lstatSync, realpathSync, readFileSync, openSync, closeSync,
  fstatSync, mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateRegistration } from './src/service.mjs';

const SOURCE = path.dirname(fileURLToPath(import.meta.url));
const TESTED_CODEX = '0.162.0-alpha.2';
const PINS = Object.freeze({ '@evopilot/adapter-mcp': '6.3.3',
  '@evopilot/evolution-expert': '2.3.1', '@modelcontextprotocol/server': '2.3.1',
  '@modelcontextprotocol/client': '2.0.0', zod: '4.5.4' });
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const USAGE = 'Usage: node install.mjs --destination ABS_NEW_DIR --cli-config ABS_CONFIG --plist ABS_PLIST --runtime-package ABS_PACKAGE_JSON --codex ABS_CODEX_CLI | --doctor ABS_DEST';
const check = (ok, code) => { if (!ok) throw new Error(code); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = bytes => JSON.parse(bytes.toString('utf8'));
const within = (root, filename) => filename === root || filename.startsWith(`${root}${path.sep}`);
function supportedHost() {
  check(process.platform === 'darwin' && process.arch === 'arm64' && /^24\.14\.\d+$/.test(process.versions.node), 'UNSUPPORTED_HOST');
}

export function parseArguments(args) {
  if (args.length === 2 && args[0] === '--doctor') return { doctor: absolute(args[1]) };
  const keys = new Map([['--destination', 'destination'], ['--cli-config', 'cliConfig'],
    ['--plist', 'plist'], ['--runtime-package', 'runtimePackage'], ['--codex', 'codex']]);
  check(args.length === 10, USAGE);
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = keys.get(args[i]);
    check(key && !Object.hasOwn(out, key), USAGE);
    out[key] = absolute(args[i + 1]);
  }
  return out;
}

function absolute(value) {
  check(typeof value === 'string' && path.isAbsolute(value) && value !== '/' &&
    value.length < 4096 && path.normalize(value) === value && !/[\x00-\x1f\x7f]/.test(value), 'INVALID_PATH');
  return value;
}
function safe(filename, privateFile = false, directory = false) {
  absolute(filename);
  check(realpathSync(filename) === filename, 'NONCANONICAL_PATH');
  const uid = process.getuid?.();
  check(Number.isInteger(uid), 'UNSUPPORTED_HOST');
  for (let current = filename; current !== path.dirname(current); current = path.dirname(current)) {
    const stat = lstatSync(current);
    const trustedApplicationsAncestor = process.platform === 'darwin' && current !== filename &&
      current === '/Applications' && stat.isDirectory() && stat.uid === 0 && stat.gid === 80 &&
      (stat.mode & 0o7777) === 0o775;
    check(!stat.isSymbolicLink() && (stat.uid === uid || stat.uid === 0) &&
      (!(stat.mode & 0o022) || trustedApplicationsAncestor), 'UNSAFE_PATH');
  }
  const stat = lstatSync(filename);
  check(directory ? stat.isDirectory() && stat.uid === uid : stat.isFile(), 'INVALID_FILE');
  if (privateFile) check(stat.uid === uid && (stat.mode & 0o777) === 0o600 && stat.nlink === 1, 'UNSAFE_PRIVATE_FILE');
  return stat;
}
function bytes(filename, privateFile = false, limit = 256 * 1024 * 1024) {
  const before = safe(filename, privateFile);
  check(before.size <= limit, 'FILE_TOO_LARGE');
  const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    check(stat.ino === before.ino && stat.dev === before.dev, 'IDENTITY_CHANGED');
    const data = readFileSync(fd);
    const after = fstatSync(fd);
    check(data.length <= limit && stat.size === after.size && stat.mtimeMs === after.mtimeMs &&
      stat.ctimeMs === after.ctimeMs, 'IDENTITY_CHANGED');
    return data;
  } finally { closeSync(fd); }
}
function execute(program, args) {
  // Retain normal host identity for public Codex commands, never caller Node injection.
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  return execFileSync(program, args, { env, encoding: 'utf8', timeout: 15000,
    maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
function packageCheck(root) {
  const pkg = json(bytes(path.join(root, 'package.json')));
  check(pkg.name === '@evopilot/codex-plugin' && pkg.version === '0.1.0', 'INVALID_PLUGIN');
  check(JSON.stringify(Object.keys(pkg.dependencies).sort()) === JSON.stringify(Object.keys(PINS).sort()), 'INVALID_DEPENDENCIES');
  check(Array.isArray(pkg.bundleDependencies) && JSON.stringify([...pkg.bundleDependencies].sort()) ===
    JSON.stringify(Object.keys(PINS).sort()), 'INVALID_BUNDLE');
  for (const [name, version] of Object.entries(PINS)) {
    check(pkg.dependencies[name] === version, 'INVALID_DEPENDENCY_PIN');
    const installed = json(bytes(path.join(root, 'node_modules', name, 'package.json')));
    check(installed.name === name && installed.version === version, 'INVALID_INSTALLED_DEPENDENCY');
  }
  for (const file of ['src/bridge.mjs', 'src/service.mjs', 'skills/evopilot/SKILL.md',
    'README.md', 'LICENSE', 'install.mjs', 'node_modules/@evopilot/adapter-mcp/dist/stdio.js',
    'node_modules/@evopilot/evolution-expert/generated/codex/SKILL.md']) bytes(path.join(root, file));
}

export function prepareInstallation(options) {
  supportedHost();
  const source = realpathSync(SOURCE);
  safe(source, false, true);
  packageCheck(source);
  const destination = absolute(options.destination);
  check(!existsSync(destination), 'DESTINATION_EXISTS');
  safe(path.dirname(destination), false, true);
  check(!within(source, destination) && !within(destination, source), 'DESTINATION_OVERLAP');
  for (const key of ['cliConfig', 'plist', 'runtimePackage', 'codex']) absolute(options[key]);
  const config = json(bytes(options.cliConfig, true, 128 * 1024));
  check(config && Object.keys(config).length === 5 && ['server', 'token', 'tenant', 'workspace', 'actor'].every(key => Object.hasOwn(config, key)), 'INVALID_CONFIGURATION');
  const match = typeof config.server === 'string' && /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/?$/.exec(config.server);
  check(match && Number(match[1]) <= 65535, 'INVALID_SERVER');
  check(typeof config.token === 'string' && config.token.length > 0 && !/[\x00-\x20\x7f]/.test(config.token) &&
    [config.tenant, config.workspace, config.actor].every(value => typeof value === 'string' && NAME.test(value)), 'INVALID_CONFIGURATION');
  const plistBytes = bytes(options.plist);
  const plist = JSON.parse(execute('/usr/bin/plutil', ['-convert', 'json', '-o', '-', options.plist]));
  check(sha(bytes(options.plist)) === sha(plistBytes), 'IDENTITY_CHANGED');
  check(typeof plist.Label === 'string' && NAME.test(plist.Label) && !Object.hasOwn(plist, 'Program') &&
    Array.isArray(plist.ProgramArguments) && plist.ProgramArguments.length === 2 &&
    (!Object.hasOwn(plist, 'EnvironmentVariables') || (plist.EnvironmentVariables &&
      typeof plist.EnvironmentVariables === 'object' && !Array.isArray(plist.EnvironmentVariables) &&
      Object.keys(plist.EnvironmentVariables).length === 0)), 'INVALID_PLIST');
  const [nodePath, launcherPath] = plist.ProgramArguments;
  check(safe(nodePath).mode & 0o111, 'NODE_NOT_EXECUTABLE');
  check(launcherPath.endsWith('.mjs'), 'INVALID_LAUNCHER');
  check(safe(options.codex).mode & 0o111, 'CODEX_NOT_EXECUTABLE');
  const runtimeBytes = bytes(options.runtimePackage);
  const runtime = json(runtimeBytes);
  check(runtime.name === '@evopilot/server' && runtime.version === '6.3.3', 'INVALID_RUNTIME');
  // Read-only launchd lookup: require an existing registration, never bootstrap or start it.
  // Successful lookup says nothing about process health or Runtime readiness.
  execute('/bin/launchctl', ['print', `gui/${process.getuid()}/${plist.Label}`]);
  for (const referenced of [options.cliConfig, options.plist, options.runtimePackage, options.codex, nodePath, launcherPath]) {
    check(!within(path.dirname(referenced), destination) && !within(destination, referenced), 'DESTINATION_OVERLAP');
  }
  const registration = validateRegistration({ schema: 'evopilot-codex-plugin-registration/v1',
    platform: 'darwin', arch: 'arm64', runtimeVersion: '6.3.3', serviceLabel: plist.Label,
    plistPath: options.plist, plistSha256: sha(plistBytes), nodePath, nodeSha256: sha(bytes(nodePath)),
    launcherPath, launcherSha256: sha(bytes(launcherPath)), runtimePackagePath: options.runtimePackage,
    runtimePackageSha256: sha(runtimeBytes), cliConfigPath: options.cliConfig,
    tenantId: config.tenant, workspaceId: config.workspace });
  // Configuration is consumed locally; credentials never enter the returned plan.
  return { source, destination, codex: options.codex, codexSha256: sha(bytes(options.codex)), registration };
}

function exclusive(filename, value) {
  writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}
function directory(filename) { mkdirSync(filename, { recursive: true, mode: 0o700 }); }
function payloadFiles(root) {
  const files = [];
  const forbidden = new Set(['test', 'tests', '.git', '.codex', '.agents', 'receipts', '.bin', '.cache']);
  function walk(relative, ancestors = new Set()) {
    const filename = path.join(root, relative);
    const resolved = realpathSync(filename);
    check(within(root, resolved), 'ESCAPING_PAYLOAD_SYMLINK');
    check(!ancestors.has(resolved), 'CYCLIC_PAYLOAD_SYMLINK');
    const stat = lstatSync(resolved);
    check(!(stat.mode & 0o022) && (stat.uid === process.getuid() || stat.uid === 0), 'UNSAFE_PAYLOAD');
    if (stat.isDirectory()) {
      for (const entry of readdirSync(resolved).sort()) {
        if (forbidden.has(entry)) continue;
        check(!/(?:^|\.)env(?:\.|$)|\.pem$|\.key$/.test(entry), 'PRIVATE_PAYLOAD');
        // These machine-specific host files are generated exclusively at the destination.
        if (path.join(relative, entry) === 'skills/evopilot/agents/openai.yaml') continue;
        walk(path.join(relative, entry), new Set([...ancestors, resolved]));
      }
    } else {
      check(stat.isFile(), 'INVALID_PAYLOAD');
      const data = bytes(resolved);
      files.push({ relative, data, hash: sha(data), mode: stat.mode & 0o111 ? 0o700 : 0o600 });
    }
  }
  for (const file of ['package.json', 'README.md', 'LICENSE', 'install.mjs', 'src', 'skills', 'node_modules']) walk(file);
  return files;
}

export function materializeInstallation(plan) {
  supportedHost();
  // Complete source validation before the first destination write; no rollback on failure.
  packageCheck(plan.source);
  const payload = payloadFiles(plan.source);
  check(!existsSync(plan.destination), 'DESTINATION_EXISTS');
  safe(path.dirname(plan.destination), false, true);
  mkdirSync(plan.destination, { mode: 0o700 });
  const registrationPath = path.join(plan.destination, 'registration.json');
  exclusive(registrationPath, validateRegistration(plan.registration));
  const marketplace = path.join(plan.destination, 'marketplace');
  const plugin = path.join(marketplace, 'plugins', 'evopilot');
  for (const file of payload) {
    const target = path.join(plugin, file.relative);
    directory(path.dirname(target));
    writeFileSync(target, file.data, { flag: 'wx', mode: file.mode });
  }
  directory(path.join(plugin, '.codex-plugin'));
  exclusive(path.join(plugin, '.codex-plugin/plugin.json'), { name: 'evopilot', id: 'evopilot', version: '0.1.0',
    description: 'Use an existing EvoPilot Runtime from Codex', skills: './skills/', mcpServers: './.mcp.json',
    interface: { displayName: 'EvoPilot', shortDescription: 'Start and use your configured Runtime' } });
  exclusive(path.join(plugin, '.mcp.json'), { mcpServers: { evopilot_plugin_010: {
    command: process.execPath, args: [path.join(plugin, 'src/bridge.mjs'), registrationPath],
    startup_timeout_sec: 10, tool_timeout_sec: 75 } } });
  directory(path.join(plugin, 'skills/evopilot/agents'));
  // Source metadata was excluded from the payload; creation is exclusive.
  writeFileSync(path.join(plugin, 'skills/evopilot/agents/openai.yaml'),
    'interface:\n  display_name: "EvoPilot"\n  short_description: "Use your configured EvoPilot Runtime"\npolicy:\n  allow_implicit_invocation: false\n', { flag: 'wx', mode: 0o600 });
  directory(path.join(marketplace, '.agents/plugins'));
  exclusive(path.join(marketplace, '.agents/plugins/marketplace.json'), { name: 'evopilot-plugin', plugins: [
    { name: 'evopilot', source: { source: 'local', path: './plugins/evopilot' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' } }
  ] });
  const hashes = {};
  const modes = {};
  function inventory(current) {
    for (const entry of readdirSync(current).sort()) {
      const filename = path.join(current, entry);
      if (lstatSync(filename).isDirectory()) inventory(filename);
      else {
        const relative = path.relative(plan.destination, filename);
        hashes[relative] = sha(bytes(filename));
        modes[relative] = lstatSync(filename).mode & 0o7777;
      }
    }
  }
  inventory(plan.destination);
  exclusive(path.join(plan.destination, 'preparation.json'), { schema: 'evopilot-plugin-preparation/v1',
    state: 'PREPARED_NOT_REGISTERED', testedCodexVersion: TESTED_CODEX, codex: plan.codex,
    codexSha256: plan.codexSha256, hashes, modes });
  return { state: 'PREPARED_NOT_REGISTERED', destination: plan.destination, marketplace, testedCodexVersion: TESTED_CODEX };
}

const MARKETPLACE = 'evopilot-plugin';
const PLUGIN_ID = 'evopilot@evopilot-plugin';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length < 4096 && !/[\x00-\x1f\x7f]/.test(value);
function validPath(value) {
  try { absolute(value); return true; } catch { return false; }
}
const sourceShape = value => text(value) || (object(value) && Object.keys(value).length > 0);
function publicLists(marketplaces, plugins) {
  const markets = Array.isArray(marketplaces) && marketplaces.length === 0 ? [] :
    object(marketplaces) && Array.isArray(marketplaces.marketplaces) ? marketplaces.marketplaces : null;
  const legacy = Array.isArray(plugins) && plugins.length === 0;
  const installed = legacy ? [] : object(plugins) && Array.isArray(plugins.installed) &&
    Array.isArray(plugins.available) ? plugins.installed : null;
  const available = legacy ? [] : plugins?.available;
  const pluginShape = item => object(item) && text(item.pluginId) && text(item.name) &&
    text(item.marketplaceName) && text(item.version) && sourceShape(item.source);
  if (!markets || !installed || !markets.every(item => object(item) && text(item.name) && validPath(item.root) &&
      (!Object.hasOwn(item, 'marketplaceSource') || sourceShape(item.marketplaceSource))) ||
      !installed.every(item => pluginShape(item) && item.installed === true && typeof item.enabled === 'boolean') ||
      !available.every(item => pluginShape(item) &&
        (!Object.hasOwn(item, 'installed') || typeof item.installed === 'boolean')) ||
      new Set(markets.map(item => item.name)).size !== markets.length ||
      new Set(installed.map(item => item.pluginId)).size !== installed.length) return null;
  return { markets, installed };
}
const ourPlugin = item => item.pluginId === PLUGIN_ID ||
  (item.name === 'evopilot' && item.marketplaceName === MARKETPLACE);
export function listsPermitRegistration(marketplaces, plugins) {
  const lists = publicLists(marketplaces, plugins);
  return lists !== null && !lists.markets.some(item => item.name === MARKETPLACE) &&
    !lists.installed.some(ourPlugin);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const snapshot = items => JSON.stringify(items.map(item => JSON.stringify(canonical(item))).sort());
function registeredSource(source, marketplace) {
  const expected = path.join(marketplace, 'plugins', 'evopilot');
  const matches = value => value === expected || value === './plugins/evopilot';
  if (typeof source === 'string') return matches(source);
  return object(source) && (source.source === 'local' || source.type === 'local') && matches(source.path);
}
export function registerInstallation(destination) {
  supportedHost();
  const evidence = verifyMaterialized(destination);
  check(!existsSync(path.join(destination, 'marketplace-intent.json')) &&
    !existsSync(path.join(destination, 'plugin-intent.json')), 'INSPECT_CURRENT_PLUGIN_STATE');
  const version = execute(evidence.codex, ['--version']).trim();
  if (version !== `codex-cli ${TESTED_CODEX}`) return { state: 'PREPARED_NOT_REGISTERED', testedCodexVersion: TESTED_CODEX };
  const readLists = () => [
    JSON.parse(execute(evidence.codex, ['plugin', 'marketplace', 'list', '--json'])),
    JSON.parse(execute(evidence.codex, ['plugin', 'list', '--json']))
  ];
  let initial;
  try { initial = readLists(); } catch {
    return { state: 'PREPARED_NOT_REGISTERED', instruction: 'Public lists unavailable; inspect before registration.' };
  }
  if (!listsPermitRegistration(...initial)) return { state: 'PREPARED_NOT_REGISTERED', instruction: 'Inspect current public plugin and marketplace state; conflicting identity or unknown list schema refused.' };
  const before = publicLists(...initial);
  const marketplace = path.join(destination, 'marketplace');
  let registeredMarket;
  for (const [kind, args] of [
    ['marketplace', ['plugin', 'marketplace', 'add', marketplace, '--json']],
    ['plugin', ['plugin', 'add', PLUGIN_ID, '--json']]
  ]) {
    exclusive(path.join(destination, `${kind}-intent.json`), { schema: 'evopilot-plugin-intent/v1', kind, args });
    try {
      const reply = JSON.parse(execute(evidence.codex, args));
      // The current CLI has no success field. Keep only bounded, validated fields.
      check(object(reply) && !Object.hasOwn(reply, 'error'), 'UNKNOWN_CLI_REPLY');
      let receipt;
      if (kind === 'marketplace') {
        check(reply.marketplaceName === MARKETPLACE && reply.installedRoot === marketplace &&
          reply.alreadyAdded === false, 'UNKNOWN_CLI_REPLY');
        receipt = { kind, marketplaceName: MARKETPLACE, installedRoot: marketplace, alreadyAdded: false };
      } else {
        check(reply.pluginId === PLUGIN_ID && reply.name === 'evopilot' &&
          reply.marketplaceName === MARKETPLACE && reply.version === '0.1.0' &&
          validPath(reply.installedPath) && reply.authPolicy === 'ON_INSTALL', 'UNKNOWN_CLI_REPLY');
        receipt = { kind, pluginId: PLUGIN_ID, name: 'evopilot', marketplaceName: MARKETPLACE,
          version: '0.1.0', installedPath: reply.installedPath, authPolicy: 'ON_INSTALL' };
      }
      const after = publicLists(...readLists());
      check(after, 'UNKNOWN_CLI_REPLY');
      const addedMarkets = after.markets.filter(item => item.name === MARKETPLACE);
      const addedPlugins = after.installed.filter(ourPlugin);
      check(addedMarkets.length === 1 && addedMarkets[0].root === marketplace &&
        snapshot(after.markets.filter(item => item.name !== MARKETPLACE)) === snapshot(before.markets) &&
        snapshot(after.installed.filter(item => !ourPlugin(item))) === snapshot(before.installed), 'REGISTRATION_READBACK_MISMATCH');
      if (kind === 'marketplace') {
        check(addedPlugins.length === 0, 'REGISTRATION_READBACK_MISMATCH');
        registeredMarket = snapshot(addedMarkets);
      } else {
        check(snapshot(addedMarkets) === registeredMarket && addedPlugins.length === 1, 'REGISTRATION_READBACK_MISMATCH');
        const plugin = addedPlugins[0];
        check(plugin.pluginId === PLUGIN_ID && plugin.name === 'evopilot' &&
          plugin.marketplaceName === MARKETPLACE && plugin.version === '0.1.0' && plugin.enabled === true &&
          registeredSource(plugin.source, marketplace) &&
          (!Object.hasOwn(plugin, 'installedPath') || plugin.installedPath === receipt.installedPath), 'REGISTRATION_READBACK_MISMATCH');
      }
      exclusive(path.join(destination, `${kind}-result.json`), { ...receipt, readbackVerified: true });
    } catch { throw new Error('INSPECT_CURRENT_PLUGIN_STATE'); }
  }
  return { state: 'PLUGIN_REGISTERED', testedCodexVersion: TESTED_CODEX };
}

function verifyMaterialized(destination) {
  safe(destination, false, true);
  const evidence = json(bytes(path.join(destination, 'preparation.json'), true));
  check(evidence.schema === 'evopilot-plugin-preparation/v1' && evidence.state === 'PREPARED_NOT_REGISTERED' &&
    evidence.testedCodexVersion === TESTED_CODEX && evidence.hashes && typeof evidence.hashes === 'object' &&
    !Array.isArray(evidence.hashes) && Object.keys(evidence.hashes).length > 0 &&
    evidence.modes && typeof evidence.modes === 'object' && !Array.isArray(evidence.modes) &&
    Object.keys(evidence.modes).length === Object.keys(evidence.hashes).length, 'INVALID_PREPARATION');
  for (const required of ['registration.json', 'marketplace/.agents/plugins/marketplace.json',
    'marketplace/plugins/evopilot/.codex-plugin/plugin.json', 'marketplace/plugins/evopilot/.mcp.json',
    'marketplace/plugins/evopilot/skills/evopilot/agents/openai.yaml']) {
    check(Object.hasOwn(evidence.hashes, required), 'INCOMPLETE_INVENTORY');
  }
  for (const [relative, hash] of Object.entries(evidence.hashes)) {
    const filename = path.join(destination, relative);
    check(!path.isAbsolute(relative) && path.relative(destination, filename) === relative &&
      within(destination, filename) && /^[a-f0-9]{64}$/.test(hash) &&
      Object.hasOwn(evidence.modes, relative) && [0o600, 0o700].includes(evidence.modes[relative]), 'INVALID_INVENTORY');
    check(sha(bytes(filename)) === hash, 'MATERIALIZED_HASH_MISMATCH');
  }
  const records = new Set(['preparation.json', 'marketplace-intent.json', 'marketplace-result.json',
    'plugin-intent.json', 'plugin-result.json']);
  function verifyInventory(current) {
    for (const entry of readdirSync(current)) {
      const filename = path.join(current, entry);
      const stat = lstatSync(filename);
      check(!stat.isSymbolicLink(), 'UNEXPECTED_SYMLINK');
      if (stat.isDirectory()) verifyInventory(filename);
      else {
        const relative = path.relative(destination, filename);
        check(Object.hasOwn(evidence.hashes, relative) || records.has(relative), 'UNEXPECTED_FILE');
        const publicPayload = relative.startsWith('marketplace/plugins/evopilot/') &&
          !['marketplace/plugins/evopilot/.codex-plugin/plugin.json',
            'marketplace/plugins/evopilot/.mcp.json',
            'marketplace/plugins/evopilot/skills/evopilot/agents/openai.yaml'].includes(relative);
        const owned = safe(filename, !publicPayload);
        const expectedMode = publicPayload ? evidence.modes[relative] : 0o600;
        check(owned.uid === process.getuid() && owned.nlink === 1 &&
          (owned.mode & 0o7777) === expectedMode &&
          (!Object.hasOwn(evidence.modes, relative) || evidence.modes[relative] === expectedMode), 'UNSAFE_MATERIALIZED_FILE');
      }
    }
  }
  verifyInventory(destination);
  const reg = validateRegistration(json(bytes(path.join(destination, 'registration.json'), true)));
  for (const kind of ['plist', 'node', 'launcher', 'runtimePackage']) {
    check(sha(bytes(reg[`${kind}Path`])) === reg[`${kind}Sha256`], 'REGISTRATION_PIN_MISMATCH');
  }
  packageCheck(path.join(destination, 'marketplace/plugins/evopilot'));
  check(safe(evidence.codex).mode & 0o111, 'CODEX_NOT_EXECUTABLE');
  check(sha(bytes(evidence.codex)) === evidence.codexSha256, 'CODEX_PIN_MISMATCH');
  return evidence;
}
export function doctor(destination) {
  supportedHost();
  const evidence = verifyMaterialized(absolute(destination));
  JSON.parse(execute(evidence.codex, ['plugin', 'list', '--json']));
  return { state: 'MATERIALIZED_VERIFIED', publicPluginListRead: true, testedCodexVersion: TESTED_CODEX };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    let outcome;
    if (options.doctor) outcome = doctor(options.doctor);
    else {
      const plan = prepareInstallation(options);
      materializeInstallation(plan);
      outcome = registerInstallation(plan.destination);
    }
    process.stdout.write(`${JSON.stringify(outcome)}\n`);
  } catch (error) {
    // Never emit filesystem/configuration/child exceptions, which may contain private output.
    const known = error.message === USAGE || /^[A-Z][A-Z_]{2,80}$/.test(error.message);
    process.stderr.write(`${known ? error.message : 'INSTALLATION_FAILED'}; retain destination for inspection; inspect current plugin state before any further registration.\n`);
    process.exitCode = 1;
  }
}
