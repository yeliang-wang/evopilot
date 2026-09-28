import { sign, createPublicKey } from 'node:crypto';
import { canonical, requireThat } from './contracts.mjs';

// Trusted launcher SDK, never registered as a model-callable approval tool.
// The caller owns an authenticated Host control channel and the real human
// permission UI. Merely parsing an object is not proof of its channel provenance.
export function claudePermissionObserver({binding, publicKey, signingKey, requestHumanPermission, now = Date.now}) {
  requireThat(createPublicKey(signingKey).export({type:'spki',format:'pem'}) === publicKey);
  const seen = new Set();
  return async message => {
    const request = message?.request;
    const deny = {behavior:'deny',message:'Exact private input permission required',interrupt:true};
    if (message?.type !== 'control_request' || request?.subtype !== 'can_use_tool' ||
      request.tool_name !== 'mcp__evopilot_private_input__provision_workspace_secret' ||
      typeof message.request_id !== 'string' || typeof request.tool_use_id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,160}$/.test(message.request_id) || !/^[A-Za-z0-9_-]{1,160}$/.test(request.tool_use_id) ||
      canonical(request.input) !== canonical({requestId:binding.requestId}) || seen.size > 0) return {response:deny,permission:null};
    seen.add(message.request_id);
    const exact = Object.freeze({binding:Object.freeze(structuredClone(binding)),hostRequestId:message.request_id,toolUseId:request.tool_use_id});
    let decision;
    try { decision = await requestHumanPermission(exact); } catch { return {response:deny,permission:null}; }
    // The trusted UI returns the exact scope it actually displayed and approved.
    if (canonical(decision) !== canonical({...exact,decision:'ALLOW'})) return {response:deny,permission:null};
    const issuedAt = now();
    const payload = {schema:'evopilot-host-permission/v1',binding,decision:'ALLOW',hostPermissionObserved:true,issuedAt,expiresAt:issuedAt+60000};
    return {response:{behavior:'allow',updatedInput:{requestId:binding.requestId}},
      permission:{payload,signature:sign(null,Buffer.from(canonical(payload)),signingKey).toString('base64')}};
  };
}

// SDK for the trusted Codex App Server client. The client must receive messages
// on its actual control channel and own the human UI; model-supplied JSON is not
// a qualifying event. This SDK neither launches Codex nor auto-approves a request.
export function codexPermissionRequest(binding) {
  return {
    mode:'form',
    message:`EvoPilot private input request ${binding.requestId}\nDestination: ${binding.destination}\nTenant: ${binding.tenantId}\nWorkspace: ${binding.workspaceId}\nHost: ${binding.hostId}\nConfig: ${binding.configDigest}\nComponent: ${binding.componentDigest}\nAllow native private input and Runtime login/Secret creation for this exact request?`,
    requestedSchema:{type:'object',properties:{confirm:{type:'boolean',title:'Allow this exact private-input request'}},required:['confirm'],additionalProperties:false}
  };
}
export function codexPermissionObserver({binding,threadId,serverName,publicKey,signingKey,requestHumanPermission,now=Date.now}) {
  requireThat(createPublicKey(signingKey).export({type:'spki',format:'pem'})===publicKey);
  requireThat(typeof threadId==='string'&&threadId.length>0&&typeof serverName==='string'&&serverName.length>0);
  binding=Object.freeze(structuredClone(binding));
  let used=false;
  return async message=>{
    const denied={response:{action:'cancel'},permission:null};
    const p=message?.params,expected=codexPermissionRequest(binding);
    // Codex 0.155 App Server projects the MCP form schema without the optional
    // additionalProperties:false field. Accept only that exact omission, never
    // true/extra properties or a different form. Our response is still fixed.
    const schema=p?.requestedSchema && structuredClone(p.requestedSchema);
    if(schema && !Object.hasOwn(schema,'additionalProperties'))schema.additionalProperties=false;
    const validId=Number.isSafeInteger(message?.id)&&message.id>=0 || typeof message?.id==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(message.id);
    if(used||!validId||message?.method!=='mcpServer/elicitation/request'||p?.threadId!==threadId||p?.serverName!==serverName||
      canonical({mode:p.mode,message:p.message,requestedSchema:schema})!==canonical(expected))return denied;
    used=true;
    const exact=Object.freeze({binding,threadId,serverName,hostRequestId:message.id});
    let decision;
    try {decision=await requestHumanPermission(exact);}catch{return denied;}
    if(canonical(decision)!==canonical({...exact,decision:'ALLOW'}))return denied;
    const issuedAt=now();const payload={schema:'evopilot-host-permission/v1',binding,decision:'ALLOW',hostPermissionObserved:true,issuedAt,expiresAt:issuedAt+60000};
    return {response:{action:'accept',content:{confirm:true}},permission:{payload,signature:sign(null,Buffer.from(canonical(payload)),signingKey).toString('base64')}};
  };
}
