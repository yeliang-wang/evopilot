import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verifyInventory } from './inventory.mjs';
import { exactKeys, requireThat } from './contracts.mjs';
import { setupLocalTls } from './local-runtime.mjs';

function owned(root) {
  requireThat(path.basename(root).startsWith('evopilot-host-isolated-'));
  requireThat(fs.realpathSync(root) === path.resolve(root));
  const stat = fs.lstatSync(root);
  requireThat(stat.isDirectory() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0);
  for (const name of ['installation.json','slots','ledger']) requireThat(!fs.lstatSync(path.join(root,name)).isSymbolicLink());
  const state = JSON.parse(fs.readFileSync(path.join(root,'installation.json')));
  exactKeys(state,['schema','id','active','previous']);
  requireThat(state.schema === 'evopilot-isolated-host-install/v1');
  for (const value of [state.active,state.previous]) requireThat(value === null || /^sha256:[a-f0-9]{64}$/.test(value));
  return state;
}
function slot(root, value) { return path.join(root,'slots',value.slice(7)); }
function project(root, state) {
  const temporary = path.join(root,`projection-${randomUUID()}.json`);
  fs.writeFileSync(temporary, JSON.stringify(state,null,2)+'\n', {flag:'wx',mode:0o600});
  fs.renameSync(temporary,path.join(root,'installation.json'));
}
function stage(root, source, componentDigest) {
  verifyInventory(source,componentDigest);
  const destination = slot(root,componentDigest);
  requireThat(!fs.existsSync(destination));
  fs.cpSync(source,destination,{recursive:true,errorOnExist:true,force:false,verbatimSymlinks:true});
  verifyInventory(destination,componentDigest);
  fs.chmodSync(path.join(destination,'dist/darwin-arm64/secure-input'),0o700);
}
export function install(source, parent, componentDigest) {
  verifyInventory(source,componentDigest);
  requireThat(fs.realpathSync(parent) === path.resolve(parent));
  // Always a fresh directory. Never modifies Host discovery, settings or npm globals.
  const root = fs.mkdtempSync(path.join(parent,'evopilot-host-isolated-'));
  fs.chmodSync(root,0o700);
  fs.mkdirSync(path.join(root,'slots'),{mode:0o700});
  fs.mkdirSync(path.join(root,'ledger'),{mode:0o700});
  stage(root,source,componentDigest);
  project(root,{schema:'evopilot-isolated-host-install/v1',id:randomUUID(),active:componentDigest,previous:null});
  return {status:'INSTALLED',root,componentDigest};
}
export function doctor(root) {
  const state = owned(root);
  verifyInventory(slot(root,state.active),state.active);
  return {status:'INTEGRITY_VERIFIED',componentDigest:state.active,platformSupported:process.platform === 'darwin' && process.arch === 'arm64',
    hostPermission:'NOT_OBSERVED',runtimeReadiness:'NOT_CHECKED'};
}
export function localSetup(root, upstream, port) {
  owned(root); doctor(root);
  return setupLocalTls(root,upstream,port);
}
export function upgrade(root, source, componentDigest) {
  const state = owned(root); doctor(root);
  requireThat(state.active !== componentDigest);
  stage(root,source,componentDigest);
  project(root,{...state,previous:state.active,active:componentDigest});
  return doctor(root);
}
export function rollback(root) {
  const state = owned(root);
  requireThat(state.previous !== null);
  verifyInventory(slot(root,state.previous),state.previous);
  project(root,{...state,active:state.previous,previous:state.active});
  return doctor(root);
}
export function remove(root) {
  owned(root);
  // Recoverable detachment; no recursive deletion and no Runtime resource cleanup.
  const recoveryPath = `${root}.removed-${randomUUID()}`;
  fs.renameSync(root,recoveryPath);
  return {status:'DETACHED_RECOVERABLE',recoveryPath};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command,...args] = process.argv.slice(2);
    const handlers = {install,doctor,health:doctor,upgrade,rollback,remove,'local-setup':localSetup};
    const handler = handlers[command];
    requireThat(Object.hasOwn(handlers,command) && args.length === handler.length);
    console.log(JSON.stringify(handler(...args)));
  } catch { console.log('{"status":"ISOLATED_OPERATION_REJECTED"}'); process.exitCode = 1; }
}
