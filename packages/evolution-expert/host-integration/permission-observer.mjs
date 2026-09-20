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
