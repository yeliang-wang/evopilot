import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const VERSION = '6.3.3';
const LIMIT = 128 * 1024;
const RESPONSE_LIMIT = 256 * 1024;
const FIELDS = ['schema', 'platform', 'arch', 'runtimeVersion', 'serviceLabel',
  'plistPath', 'plistSha256', 'nodePath', 'nodeSha256', 'launcherPath',
  'launcherSha256', 'runtimePackagePath', 'runtimePackageSha256',
  'cliConfigPath', 'tenantId', 'workspaceId'];
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const failures = new WeakMap();
function fail(code) {
  const error = new Error(code);
  failures.set(error, code);
  return error;
}
function codeOf(error) { return failures.get(error) || 'CONNECTION_FAILED'; }
function requireValue(condition, code) { if (!condition) throw fail(code); }
function absolute(value) {
  return typeof value === 'string' && value.length < 4096 &&
    !/[\x00-\x1f\x7f]/.test(value) && path.isAbsolute(value) &&
    path.normalize(value) === value && value !== '/';
}
function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateRegistration(value) {
  requireValue(object(value) && Object.keys(value).length === FIELDS.length &&
    FIELDS.every(key => Object.hasOwn(value, key)), 'INVALID_REGISTRATION');
  requireValue(value.schema === 'evopilot-codex-plugin-registration/v1' &&
    value.platform === 'darwin' && value.arch === 'arm64' &&
    value.runtimeVersion === VERSION, 'INVALID_PRODUCT');
  for (const key of ['serviceLabel', 'tenantId', 'workspaceId']) {
    requireValue(typeof value[key] === 'string' && NAME.test(value[key]), 'INVALID_NAME');
  }
  for (const key of FIELDS.filter(key => key.endsWith('Path'))) {
    requireValue(absolute(value[key]), 'INVALID_PATH');
  }
  for (const key of FIELDS.filter(key => key.endsWith('Sha256'))) {
    requireValue(typeof value[key] === 'string' && /^[a-f0-9]{64}$/.test(value[key]), 'INVALID_HASH');
  }
  return Object.freeze({ ...value });
}

async function checkedFile(filename, privateFile, budget, digestOnly = false) {
  requireValue(absolute(filename), 'INVALID_PATH');
  const uid = process.getuid?.();
  requireValue(Number.isInteger(uid), 'UNSUPPORTED_PLATFORM');
  // Reject symlinks in every component, including parent directories.
  for (let parent = filename; parent !== path.dirname(parent); parent = path.dirname(parent)) {
    requireValue(!(await lstat(parent)).isSymbolicLink(), 'INSECURE_FILE');
  }
  const before = await lstat(filename);
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    requireValue(stat.isFile() && stat.dev === before.dev && stat.ino === before.ino &&
      (stat.uid === uid || (!privateFile && stat.uid === 0)) &&
      (stat.mode & 0o022) === 0, 'INSECURE_FILE');
    requireValue(!privateFile || ((stat.mode & 0o777) === 0o600 && stat.nlink === 1), 'INSECURE_FILE');
    requireValue(stat.size <= budget, 'FILE_TOO_LARGE');
    const hash = createHash('sha256');
    const chunks = [];
    let size = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      size += chunk.length;
      requireValue(size <= budget, 'FILE_TOO_LARGE');
      hash.update(chunk);
      if (!digestOnly) chunks.push(chunk);
    }
    const after = await file.stat();
    requireValue(stat.size === after.size && stat.mtimeMs === after.mtimeMs &&
      stat.ctimeMs === after.ctimeMs, 'IDENTITY_CHANGED');
    return { hash: hash.digest('hex'), text: digestOnly ? undefined : Buffer.concat(chunks).toString('utf8') };
  } finally { await file.close(); }
}
function parse(text) {
  try { return JSON.parse(text); } catch { throw fail('INVALID_CONFIGURATION'); }
}

// Commands and their arguments are exclusively assembled below, never from MCP input.
function command(program, args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => { child.kill(); finish(fail('COMMAND_TIMEOUT')); }, timeout);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      size += chunk.length;
      if (size > RESPONSE_LIMIT) { child.kill(); finish(fail('OUTPUT_TOO_LARGE')); }
      else chunks.push(chunk);
    });
    child.on('error', () => finish(fail('COMMAND_FAILED')));
    child.on('close', code => finish(null, { code, text: Buffer.concat(chunks).toString('utf8') }));
  });
}

async function response(server, pathname, headers) {
  const abort = AbortSignal.timeout(5000);
  try {
    const res = await fetch(new URL(pathname, server), { headers, redirect: 'error', signal: abort });
    requireValue(res.ok, res.status === 401 || res.status === 403 ? 'UNAUTHORIZED' : 'HTTP_FAILED');
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      requireValue(size <= RESPONSE_LIMIT, 'OUTPUT_TOO_LARGE');
      chunks.push(chunk);
    }
    return parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { throw fail(failures.get(error) || 'NETWORK_FAILED'); }
}

export function createConnection(registrationPath, unit = {}) {
  // Controlled module-only IO seams. The bridge passes only the registration path.
  const read = unit.readFile ?? checkedFile;
  const run = unit.command ?? command;
  const request = unit.response ?? response;
  // No filesystem access, configuration discovery, process launch, or credential read here.
  let activated = false;
  let starting;
  let registrationHash;
  let configHash;
  let scope;
  let secret;
  let current = view(false, 'INACTIVE', 'INACTIVE', 'INACTIVE');
  function view(active, processState, readinessState, code, pid, requestId) {
    return { pluginVersion: '0.1.0', runtimeVersion: VERSION, active, processState,
      readinessState, code, ...(pid ? { pid } : {}), ...(scope ? { scope: { ...scope } } : {}),
      ...(typeof requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId) && requestId !== secret ? { requestId } : {}) };
  }
  async function identity() {
    requireValue((unit.platform ?? process.platform) === 'darwin' && (unit.arch ?? process.arch) === 'arm64', 'UNSUPPORTED_PLATFORM');
    const registrationFile = await read(registrationPath, true, LIMIT);
    requireValue(!registrationHash || registrationFile.hash === registrationHash, 'IDENTITY_CHANGED');
    const reg = validateRegistration(parse(registrationFile.text));
    registrationHash ??= registrationFile.hash;
    scope = { tenantId: reg.tenantId, workspaceId: reg.workspaceId };
    let packageText;
    for (const kind of ['plist', 'node', 'launcher', 'runtimePackage']) {
      const file = await read(reg[`${kind}Path`], false,
        kind === 'node' ? 256 * 1024 * 1024 : 4 * 1024 * 1024, kind === 'node');
      requireValue(file.hash === reg[`${kind}Sha256`], 'PIN_MISMATCH');
      if (kind === 'runtimePackage') packageText = file.text;
    }
    const pkg = parse(packageText);
    requireValue(pkg.name === '@evopilot/server' && pkg.version === VERSION, 'INVALID_PRODUCT');
    const plistResult = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', reg.plistPath]);
    requireValue(plistResult.code === 0, 'INVALID_PLIST');
    const plist = parse(plistResult.text);
    requireValue(plist.Label === reg.serviceLabel && !Object.hasOwn(plist, 'Program') &&
      Array.isArray(plist.ProgramArguments) && plist.ProgramArguments.length === 2 &&
      plist.ProgramArguments[0] === reg.nodePath && plist.ProgramArguments[1] === reg.launcherPath,
    'INVALID_PLIST');
    // launchd environment injection could otherwise invalidate the pinned program identity.
    requireValue(!Object.hasOwn(plist, 'EnvironmentVariables') ||
      (object(plist.EnvironmentVariables) && Object.keys(plist.EnvironmentVariables).length === 0), 'INVALID_PLIST');
    const configFile = await read(reg.cliConfigPath, true, LIMIT);
    requireValue(!configHash || configHash === configFile.hash, 'IDENTITY_CHANGED');
    const config = parse(configFile.text);
    requireValue(object(config) && Object.keys(config).length === 5 &&
      ['server', 'token', 'tenant', 'workspace', 'actor'].every(key => Object.hasOwn(config, key)), 'INVALID_CONFIGURATION');
    requireValue(typeof config.server === 'string' && /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/?$/.test(config.server), 'INVALID_SERVER');
    const port = Number(new URL(config.server).port || 80);
    requireValue(port <= 65535, 'INVALID_SERVER');
    config.server = config.server.endsWith('/') ? config.server : `${config.server}/`;
    requireValue(config.tenant === reg.tenantId && config.workspace === reg.workspaceId, 'SCOPE_MISMATCH');
    requireValue(typeof config.token === 'string' && config.token.trim().length > 0 &&
      !/[\x00-\x20\x7f]/.test(config.token) && typeof config.actor === 'string' && NAME.test(config.actor), 'INVALID_CONFIGURATION');
    secret = config.token;
    configHash ??= configFile.hash;
    return { reg, config, port };
  }
  async function owner(reg, timeout = 5000) {
    const target = `gui/${process.getuid()}/${reg.serviceLabel}`;
    const printed = await run('/bin/launchctl', ['print', target], timeout);
    if (printed.code !== 0) {
      requireValue(/Could not find service|Could not find specified service/i.test(printed.text), 'OWNER_INSPECTION_FAILED');
      return { target, exists: false };
    }
    const matches = [...printed.text.matchAll(/^\s*pid = ([1-9][0-9]*)\s*$/gm)];
    requireValue(matches.length <= 1, 'OWNER_IDENTITY_FAILED');
    const pid = matches.length ? Number(matches[0][1]) : undefined;
    requireValue(pid === undefined || Number.isSafeInteger(pid), 'OWNER_IDENTITY_FAILED');
    return { target, exists: true, pid };
  }
  async function inspect(mayKickstart) {
    try {
      const { reg, config, port } = await identity();
      let processOwner = await owner(reg);
      if (!processOwner.exists) {
        current = view(true, 'MISSING', 'SETUP_REQUIRED', 'SETUP_REQUIRED');
        return { status: current };
      }
      if (!processOwner.pid && mayKickstart) {
        const deadline = Date.now() + 15000;
        const kicked = await run('/bin/launchctl', ['kickstart', processOwner.target]);
        requireValue(kicked.code === 0, 'OWNER_START_FAILED');
        while (!processOwner.pid && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, Math.min(250, deadline - Date.now())));
          if (Date.now() >= deadline) break;
          processOwner = await owner(reg, Math.max(1, Math.min(5000, deadline - Date.now())));
          if (!processOwner.exists) break;
        }
      }
      if (!processOwner.pid) {
        current = view(true, processOwner.exists ? 'STOPPED' : 'MISSING', 'SETUP_REQUIRED', 'SETUP_REQUIRED');
        return { status: current };
      }
      const listening = await run('/usr/sbin/lsof', ['-nP', '-a', '-p', String(processOwner.pid), '-iTCP', '-sTCP:LISTEN', '-Fpn']);
      let listedPid;
      let ownsListener = false;
      for (const line of listening.text.split('\n')) {
        if (line.startsWith('p')) listedPid = Number(line.slice(1));
        if (line === `n127.0.0.1:${port}` && listedPid === processOwner.pid) ownsListener = true;
      }
      requireValue(listening.code === 0 && ownsListener, 'OWNER_IDENTITY_FAILED');
      const headers = { Authorization: `Bearer ${config.token}`, 'x-evopilot-tenant': config.tenant,
        'x-evopilot-workspace': config.workspace, 'x-evopilot-actor': config.actor };
      const version = await request(config.server, '/api/v1/version', headers);
      requireValue(version?.data?.productVersion === VERSION, 'VERSION_MISMATCH');
      const readiness = await request(config.server, '/api/v1/runtime-readiness', headers);
      requireValue(readiness?.data?.tenantId === reg.tenantId &&
        readiness?.data?.workspaceId === reg.workspaceId, 'SCOPE_MISMATCH');
      const state = readiness.data.state;
      requireValue(state === 'READY' || state === 'SETUP_REQUIRED', 'INVALID_READINESS');
      // Detect observed file and launchd-owner changes over the HTTP inspection interval.
      await identity();
      requireValue((await owner(reg)).pid === processOwner.pid, 'OWNER_IDENTITY_FAILED');
      current = view(true, 'RUNNING', state, state, processOwner.pid, readiness.requestId);
      const env = Object.freeze({ PATH: '/usr/bin:/bin', EVOPILOT_SERVER: config.server,
        EVOPILOT_API_TOKEN: config.token, EVOPILOT_TENANT: config.tenant,
        EVOPILOT_WORKSPACE: config.workspace, EVOPILOT_ACTOR: config.actor });
      return { status: current, env };
    } catch (error) {
      current = view(true, 'UNKNOWN', 'UNKNOWN', codeOf(error));
      return { status: current };
    }
  }
  return Object.freeze({
    start() {
      if (starting) return starting;
      activated = true;
      starting = inspect(true).then(result => ({ ...result.status })).finally(() => { starting = undefined; });
      return starting;
    },
    async status() {
      if (!activated) return { ...current };
      return { ...(await inspect(false)).status };
    },
    async withRuntime(callback) {
      requireValue(activated, 'ACTIVATION_REQUIRED');
      const result = await inspect(false);
      requireValue(result.env && result.status.processState === 'RUNNING', result.status.code);
      // The bridge callback must consume, never return, this private environment.
      try { return await callback(result.env, { ...result.status }); }
      catch { throw fail('RUNTIME_CALLBACK_FAILED'); }
    }
  });
}
