#!/usr/bin/env node
import { safeDiagnostic } from './diagnostics.js';
import type { SafeDiagnostic } from './diagnostics.js';
import { errorCode } from '../../integration/types.js';
import type { Schema, MCPMessage, ActionPayload } from '../../integration/types.js';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { inspectConnection, activateConnection, callConnection, withWorkspaceMaintenance } from '../../integration/connection/client.js';
import { loadConfiguration, LIMITS, connectionBodyLimit, mcpOutputLimit, connectionCorrelation } from '../../integration/connection/config.js';
import { withWorkspaceLease } from '../../integration/workspace/lock.js';
import { inspectWorkspace, setupWorkspace } from '../../integration/workspace/bootstrap.js';
import { projectOperation } from '../../integration/workspace/project.js';
import { upgradeWorkspaceProject } from '../../integration/workspace/upgrade.js';
import type { TemplateUpgradeInput } from '../../integration/workspace/upgrade.js';
import type { WorkspaceSetupInput } from '../../integration/workspace/bootstrap.js';
import { getGuide, scenarios } from '../../expert/core/guide.js';
import { inspectNativeToolchain, inspectBundledToolchainLock } from '../../integration/toolchain/locked.js';
import { inspectToolchainPreparation, startToolchainPreparation } from '../../integration/toolchain/preparation.js';
import {configureOnline,readOnlineConfiguration} from '../../integration/online/config.js';
import {inspectOnlineWorker,startOnlineWorker,stopOnlineWorker} from '../../integration/online/lifecycle.js';

const INPUT = LIMITS.nativeBody, OUTPUT = LIMITS.response;
const prefix = 'evopilot_v01_';
const object = (properties: Record<string, Schema> = {}, required = Object.keys(properties)): Schema => ({ type: 'object', properties, required, additionalProperties: false });
const slug = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,63}$' };
const scope = object({ visibility: { enum: ['public', 'private'] }, projectId: slug });
const revision = { type: 'integer', minimum: 0 };
const envelope = object({ operation: { type: 'string', minLength: 1, maxLength: 128 }, scope, input: { type: 'object' }, requestId: slug, expectedRevision: revision }, ['operation', 'scope', 'input']);
const args = object({ scope, id: slug, requestId: slug, expectedRevision: revision });
const absolutePath = { type: 'string', minLength: 1, maxLength: 4096 };
const setup = object({ requestId: slug, projectRoot: absolutePath, stateRoot: absolutePath, workspaceId: slug }, ['requestId']);
const attach = object({ requestId: slug, projectRoot: absolutePath, stateRoot: absolutePath, workspaceId: slug });
const definitions: Record<string, [string, Schema]> = {
  online_configure:['Configure private read-only Prometheus and authenticated Alertmanager connections using credential file references. Requires this active session and a stopped worker; stops the shared connection and deactivates this session. Does not select monitoring.',object({settings:{type:'object'},expectedDigest:{},requestId:slug})],
  online_worker:['Inspect the independent online worker passively, or explicitly start/stop/uninstall its verified launchd job in this active session. Monitoring bindings must be reviewed and selected separately. Evidence is preserved.',object({operation:{enum:['inspect','start','stop','uninstall']},requestId:slug})],
  workspace_capacity:['Read bounded Workspace file counts, byte totals and digest. A live scan is not a consistent backup and does not stop services.',object()],
  workspace_inspect: ['Inspect installation and Workspace binding without starting services or creating files.', object()],
  workspace_initialize: ['Explicitly initialize your private editable project and separate protected service state; does not activate the session.', setup],
  workspace_attach: ['Explicitly attach an existing validated and stopped Workspace, creating its editable project if absent. Cannot switch an already bound installation.', attach],
  workspace_project: ['Manage private project baselines and Goal/Target/Loop evidence; template upgrade preserves customized files. Requires this active session.', object({operation:{enum:['bind','inspect','drift','baseline.accept','campaign.write','campaign.inspect','template.upgrade']},input:{type:'object'},requestId:slug})],
  workspace_backup: ['Stop the verified connection and back up the private project and owner state into a new protected destination. Deactivates this session.', object({destinationRoot:absolutePath,requestId:slug})],
  workspace_backup_inspect: ['Verify every retained backup byte against its protected manifest anchor without starting services.', object({backupRoot:absolutePath,requestId:slug})],
  workspace_restore: ['Restore a retained verified same-host backup only into its missing or empty original project/state locations. Does not activate this session.', object({backupRoot:absolutePath,requestId:slug})],
  workspace_migrate: ['Stop the connection, copy to new private project/state locations and verify owner relocation lineage. Preserves the source and requires explicit attachment to the destination.', object({destinationProjectRoot:absolutePath,destinationStateRoot:absolutePath,requestId:slug})],
  inspect: ['Inspect this session and passive authenticated connection identity.', object()],
  activate: ['Explicitly activate this session; start or reuse the verified shared connection.', object()],
  deactivate: ['Deactivate only this session; keep the shared connection running.', object()],
  guide: ['Read a scenario guide without activating or accessing product state.', object({ scenario: { enum: scenarios } })],
  request: ['Forward one exact owning product envelope; await classification start/reanalyze.', object({ owner: { enum: ['runtime', 'harness', 'ontology'] }, envelope })],
  native: ['Call a corrected-v1 owning product operation. Real collection, owner receipts and exact project completion gates remain mandatory.', object({ owner: { enum: ['runtime', 'harness', 'ontology'] }, envelope })],
  native_project: ['Prepare and inspect a corrected-v1 project candidate, freeze an actually reviewed scope, materialize native assets or record an exact domain review. Candidate files do not replace current deliveries. prepare-execution currently supports the installed Node toolchain only.', object({ operation: { enum: ['preflight', 'prepare', 'freeze', 'materialize', 'review-domain', 'inspect', 'check-layout', 'candidate-location', 'prepare-execution', 'promote'] }, input: { type: 'object' } })],
  toolchain_inspect: ['Verify the bundled native toolchain lock and local installed bytes without downloading or activating.', object()],
  toolchain_prepare: ['Start bounded preparation of bundled pinned dependencies and return a retained status. Inspect progress; never repeat a pending request. Deactivates this session; activate only after toolchain_inspect reports ready.', object({ requestId: slug })],
  dispatch: ['Dispatch one explicitly approved Runtime run without retry.', object({ args })],
  reconcile: ['Read retained provider evidence through Runtime reconciliation, without redispatch.', object({ args })],
  capabilities: ['Read actual composition capabilities after session activation.', object()],
};
const tools = Object.entries(definitions).map(([name, [description, inputSchema]]) => ({ name: prefix + name, description, inputSchema }));
function validate(value: unknown, schema: Schema, depth = 0): void {
  if (depth > 64) throw Error('SCHEMA');
  if (schema.enum && !schema.enum.includes(value)) throw Error('SCHEMA');
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('SCHEMA');
    if (schema.properties) {
      if (schema.required!.some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(k => !Object.hasOwn(schema.properties!, k))) throw Error('SCHEMA');
      for (const k of Object.keys(value)) validate((value as Record<string, unknown>)[k], schema.properties[k], depth + 1);
    }
  }
  if (schema.type === 'string' && (typeof value !== 'string' || value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity) || (schema.pattern && !new RegExp(schema.pattern).test(value)))) throw Error('SCHEMA');
  if (schema.type === 'integer' && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (schema.minimum ?? -Infinity))) throw Error('SCHEMA');
}
function finiteJSON(value: unknown, depth = 0) {
  if (depth > 64 || (typeof value === 'number' && !Number.isFinite(value))) throw Error('SCHEMA');
  if (value && typeof value === 'object') for (const v of Object.values(value)) finiteJSON(v, depth + 1);
}

const argv = process.argv.slice(2);
if (argv.length !== 2 || argv[0] !== '--config' || !path.isAbsolute(argv[1]) || path.normalize(argv[1]) !== argv[1] || !argv[1].endsWith('.json')) {
  process.stderr.write('Invalid adapter configuration argument\n'); process.exitCode = 2;
} else {
  await serve(argv[1]);
}
async function serve(configPath: string) {
  const sessionId = randomUUID();
  const namespace = 'evopilot_' + createHash('sha256').update(configPath).digest('hex').slice(0, 16);
  let initialized = false, sessionActive = false, connection: Awaited<ReturnType<typeof inspectConnection>> | null = null;
  const identity = () => ({ namespace, sessionId, pid: process.pid, sessionActive, connection, authority: false });
  const receipt = (result: unknown, error?: { code: string; correlation: unknown; diagnostic?: SafeDiagnostic }) => {
    const data: ReturnType<typeof identity> & { result?: unknown; error?: { code: string; correlation: unknown; diagnostic?: SafeDiagnostic }; correlation?: unknown } = { ...identity(), ...(error ? { error } : { result }) };
    return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, ...(error ? { isError: true } : {}) };
  };
  const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
  async function write(value: { jsonrpc: string; id?: unknown; result?: unknown; error?: unknown }, outputLimit: number = OUTPUT) {
    let bytes;
    try { bytes = JSON.stringify(value); } catch { bytes = ''; }
    if (!bytes || Buffer.byteLength(bytes) > outputLimit) {
      // Native package responses can follow a durable write. An output failure
      // cannot certify that nothing happened; retain the reconciliation identity.
      const data = receipt(undefined, { code: outputLimit === OUTPUT ? 'LIMIT' : 'UNKNOWN', correlation: (value.result as ReturnType<typeof receipt> | undefined)?.structuredContent?.correlation ?? null });
      bytes = JSON.stringify({ jsonrpc: '2.0', id: value.id ?? null, result: data });
    }
    await new Promise<void>((resolve, reject) => process.stdout.write(bytes + '\n', error => error ? reject(error) : resolve()));
  }
  async function handle(line: Uint8Array) {
    let r: MCPMessage;
    try { r = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)); }
    catch { await write(rpcError(null, line.length > LIMITS.body ? -32600 : -32700, line.length > LIMITS.body ? 'Input limit exceeded' : 'Parse error')); return; }
    const route = r?.method === 'tools/call' && typeof r.params?.name === 'string' && r.params.name.startsWith(prefix) ? r.params.name.slice(prefix.length) : null;
    if (line.length > connectionBodyLimit(route, r?.params?.arguments)) { await write(rpcError(null, -32600, 'Input limit exceeded')); return; }
    const validId = (id: unknown) => typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));
    const hasId = r && Object.hasOwn(r, 'id');
    const notification = r && !Array.isArray(r) && r.jsonrpc === '2.0' && typeof r.method === 'string' && !hasId;
    if (!r || Array.isArray(r) || typeof r !== 'object' || r.jsonrpc !== '2.0' || typeof r.method !== 'string' || (hasId && !validId(r.id)) || Object.keys(r).some(k => !['jsonrpc','id','method','params'].includes(k))) {
      if (!notification) await write(rpcError(null, -32600, 'Invalid Request'));
      return;
    }
    // Notifications never trigger tools or initialization, and never receive a response.
    if (notification) return;
    const error = (code: number, message: string) => write(rpcError(r.id, code, message));
    try { finiteJSON(r); } catch { await error(-32602, 'Invalid params'); return; }
    if (!initialized && !['initialize', 'ping'].includes(r.method)) { await error(-32002, 'Not initialized'); return; }
    // Metadata is bounded transport data, never business input or response data.
    const params = r.params;
    if (params !== undefined && (!params || typeof params !== 'object' || Array.isArray(params))) { await error(-32602, 'Invalid params'); return; }
    if (params && Object.hasOwn(params, '_meta')) {
      const meta = params._meta;
      if (!meta || typeof meta !== 'object' || Array.isArray(meta) ||
          (Object.hasOwn(meta, 'progressToken') && typeof (meta as Record<string, unknown>).progressToken !== 'string' && typeof (meta as Record<string, unknown>).progressToken !== 'number')) {
        await error(-32602, 'Invalid params'); return;
      }
    }
    let result;
    if (r.method === 'initialize') {
      const p = r.params;
      if (initialized || !p || Object.keys(p).some(k => !['protocolVersion', 'capabilities', 'clientInfo', '_meta'].includes(k)) || typeof p.protocolVersion !== 'string' || !p.capabilities || typeof p.capabilities !== 'object' || Array.isArray(p.capabilities) || !p.clientInfo || typeof (p.clientInfo as Record<string, unknown>).name !== 'string' || typeof (p.clientInfo as Record<string, unknown>).version !== 'string') { await error(-32602, 'Invalid params'); return; }
      initialized = true;
      result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'evopilot-v01-preview', version: '0.8.0' } };
    } else if (r.method === 'ping' || r.method === 'tools/list') {
      if (params && (Object.keys(params).some(k => !['_meta', ...(r.method === 'tools/list' ? ['cursor'] : [])].includes(k)) || (Object.hasOwn(params, 'cursor') && (typeof params.cursor !== 'string' || params.cursor !== '')))) { await error(-32602, 'Invalid params'); return; }
      result = r.method === 'ping' ? {} : { tools };
    } else if (r.method === 'tools/call') {
      const p = r.params, def = tools.find(t => t.name === p?.name);
      if (!def || !p || Object.keys(p).some(k => !['name', 'arguments', '_meta'].includes(k))) { await error(-32602, 'Invalid params'); return; }
      const rawInput = p.arguments ?? {};
      try { validate(rawInput, def.inputSchema); } catch { await error(-32602, 'Invalid params'); return; }
      // The tool-specific schema above checks each forwarded field before use.
      const input = rawInput as ActionPayload & WorkspaceSetupInput & { scenario: string; operation: Parameters<typeof projectOperation>[1] | 'template.upgrade'; input: Record<string,unknown>; destinationRoot: string; backupRoot: string; destinationProjectRoot: string; destinationStateRoot: string };
      const action = (p.name as string).slice(prefix.length);
      const correlation = connectionCorrelation(action, input);
      try {
        let value;
        if (action === 'guide') value = getGuide(input.scenario);
        else if(action==='online_worker'){
          const operation=String(input.operation),c=loadConfiguration(configPath);
          if(operation==='inspect'){const cfg=readOnlineConfiguration(c);value={configurationDigest:cfg?.digest??null,providerIds:cfg?.settings.prometheus.map(p=>p.id)??[],alertSourceIds:cfg?.settings.alertmanager.map(p=>p.id)??[],worker:inspectOnlineWorker(c)};}
          else {if(!sessionActive)throw Object.assign(Error(),{code:'SESSION_INACTIVE'});value=await withWorkspaceLease(c,input.requestId,async()=>operation==='start'?startOnlineWorker(c):stopOnlineWorker(c,operation==='uninstall'));}
        }
        else if(action==='online_configure'){
          if(!sessionActive)throw Object.assign(Error(),{code:'SESSION_INACTIVE'});
          try{value=await withWorkspaceMaintenance(configPath,input.requestId,c=>configureOnline(c,rawInput as Parameters<typeof configureOnline>[1]));}
          finally{sessionActive=false;connection=await inspectConnection(configPath);}
        }
        else if (action === 'toolchain_inspect') {
          const lock = inspectBundledToolchainLock(), c = loadConfiguration(configPath), preparation = inspectToolchainPreparation(configPath);
          try {
            const toolchain = inspectNativeToolchain({ cacheRoot: path.join(c.workspaceRoot, 'native-toolchain') });
            value = { ready: true, lock, toolchain, preparation, authority: false };
          } catch (error) {
            const code = errorCode(error);
            if (code !== 'ENOENT' && code !== 'TOOLCHAIN_NOT_READY') throw error;
            value = { ready: false, lock, preparation, diagnostic: 'TOOLCHAIN_NOT_READY', nextAction: preparation && ['RUNNING','UNKNOWN'].includes(preparation.status) ? 'toolchain_inspect' : 'toolchain_prepare', authority: false };
          }
        } else if (action === 'toolchain_prepare') {
          try {
            value = await startToolchainPreparation(configPath, input.requestId);
          } finally { sessionActive = false; connection = await inspectConnection(configPath); }
        }
        else if(action==='workspace_capacity'){const c=loadConfiguration(configPath);if(!c.projectRoot)throw Object.assign(Error(),{code:'WORKSPACE_UNCONFIGURED'});const {inspectWorkspaceCapacity}=await import('../../integration/workspace/maintenance.js');value=inspectWorkspaceCapacity({projectRoot:c.projectRoot,stateRoot:c.workspaceRoot,workspaceId:c.workspaceId,installationRoot:c.installationRoot});}
        else if (action === 'workspace_inspect') value = inspectWorkspace(configPath);
        else if (action === 'workspace_initialize' || action === 'workspace_attach') {
          value = await setupWorkspace(configPath, input, action === 'workspace_attach' ? 'attach' : 'initialize');
          connection = await inspectConnection(configPath);
        }
        else if (action === 'deactivate') { sessionActive = false; value = { deactivated: true }; }
        else if (action === 'inspect') { connection = await inspectConnection(configPath); value = { inspected: true }; }
        else if (action === 'activate') {
          {
            const ready = await activateConnection(configPath);
            if (ready?.active !== true || !ready.identity || !Number.isSafeInteger(ready.pid)) throw Object.assign(Error(), { code: 'NOT_READY' });
            connection = ready; sessionActive = true;
          }
          value = { activated: true };
        } else if (action === 'workspace_project') {
          if (!sessionActive) throw Object.assign(Error(), {code:'SESSION_INACTIVE'});
          const c = loadConfiguration(configPath);
          if (!c.projectRoot) throw Object.assign(Error(), {code:'WORKSPACE_UNCONFIGURED'});
          const context = {projectRoot:c.projectRoot,stateRoot:c.workspaceRoot,workspaceId:c.workspaceId,installationRoot:c.installationRoot,configPath};
          if (input.operation === 'template.upgrade') {
            try { value = await withWorkspaceMaintenance(configPath,input.requestId,async()=>upgradeWorkspaceProject(context,{...input.input,requestId:input.requestId} as TemplateUpgradeInput)); }
            finally { sessionActive=false; }
          } else {
            value = await withWorkspaceLease(c,input.requestId,async()=>{
              const state=await inspectConnection(configPath);
              if (!state.active) { sessionActive=false; throw Object.assign(Error(),{code:'SESSION_INACTIVE'}); }
              return projectOperation(context,input.operation as Parameters<typeof projectOperation>[1],input.input,input.requestId);
            });
          }
        } else if (action === 'workspace_backup_inspect') {
          const c=loadConfiguration(configPath,{allowMissingProject:true});
          if (!c.projectRoot) throw Object.assign(Error(),{code:'WORKSPACE_UNCONFIGURED'});
          value=await withWorkspaceLease(c,input.requestId,async()=>{
            const {inspectWorkspaceBackup}=await import('../../integration/workspace/maintenance.js');
            return inspectWorkspaceBackup({projectRoot:c.projectRoot!,stateRoot:c.workspaceRoot,workspaceId:c.workspaceId,installationRoot:c.installationRoot},input.backupRoot);
          });
        } else if (['workspace_backup','workspace_restore','workspace_migrate'].includes(action)) {
          if (!sessionActive && action !== 'workspace_restore') throw Object.assign(Error(), {code:'SESSION_INACTIVE'});
          const operation = action.slice('workspace_'.length) as 'backup'|'restore'|'migrate';
          const details = operation === 'backup' ? {destinationRoot:input.destinationRoot} : operation === 'restore' ? {backupRoot:input.backupRoot} : {destinationProjectRoot:input.destinationProjectRoot,destinationStateRoot:input.destinationStateRoot};
          try {
            value = await withWorkspaceMaintenance(configPath,input.requestId,async c=>{
              if (!c.projectRoot) throw Object.assign(Error(),{code:'WORKSPACE_UNCONFIGURED'});
              const {maintainWorkspace} = await import('../../integration/workspace/maintenance.js');
              return maintainWorkspace({projectRoot:c.projectRoot,stateRoot:c.workspaceRoot,workspaceId:c.workspaceId,installationRoot:c.installationRoot},operation,details,input.requestId);
            },{restoring:operation==='restore'});
            connection = await inspectConnection(configPath);
          } finally { sessionActive=false; }
        } else {
          if (!sessionActive) throw Object.assign(Error(), { code: 'SESSION_INACTIVE' });
          value = await callConnection(configPath, action, input);
        }
        result = receipt(value);
        result.structuredContent.correlation = correlation;
        result.content[0].text = JSON.stringify(result.structuredContent);
      } catch (e) {
        const code = errorCode(e) ?? '';
        result = receipt(undefined, { ...safeDiagnostic(code), correlation });
      }
    } else { await error(-32601, 'Method not found'); return; }
    await write({ jsonrpc: '2.0', id: r.id, result }, mcpOutputLimit(route, r.params?.arguments));
  }
  // One in-flight request, no application queue. Backpressure bounds both streams.
  let parts: Buffer[] = [], size = 0, dropping = false;
  try {
    for await (const chunk of process.stdin) {
      let start = 0;
      while (start < chunk.length) {
        const newline = chunk.indexOf(10, start), end = newline < 0 ? chunk.length : newline;
        const part = chunk.subarray(start, end);
        if (!dropping) {
          size += part.length;
          if (size > INPUT) { dropping = true; parts = []; size = 0; }
          else parts.push(part);
        }
        if (newline < 0) break;
        if (dropping) await write(rpcError(null, -32600, 'Input limit exceeded'));
        else await handle(Buffer.concat(parts, size));
        parts = []; size = 0; dropping = false; start = newline + 1;
      }
    }
    if (dropping) await write(rpcError(null, -32600, 'Input limit exceeded'));
    else if (size) await handle(Buffer.concat(parts, size));
  } catch {
    process.stderr.write('Adapter transport closed\n'); process.exitCode = 1;
  }
  // EOF never closes or stops the shared daemon.
}
