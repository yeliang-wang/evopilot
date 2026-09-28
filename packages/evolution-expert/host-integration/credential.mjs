// Trusted launcher boundary. Never an MCP credential argument or a token file.
import fs from 'node:fs';
import {exactKeys,requireThat,verifySigned,digest} from './contracts.mjs';

export function verifyCredential(config,binding,packet) {
  const a=config.authentication;
  requireThat(a?.mode==='local-token' && config.localTls);
  exactKeys(packet,['token','attestation']);
  requireThat(typeof packet.token==='string' && /^[\x21-\x7e]{32,8192}$/.test(packet.token));
  verifySigned(packet.attestation,a.credentialPublicKey,{
    schema:'evopilot-local-runtime-credential/v1',binding,
    credentialId:a.credentialId,actor:a.actor,role:a.role,
    tenantId:config.tenantId,workspaceId:config.workspaceId,
    upstream:config.localTls.upstream,tokenDigest:digest(packet.token)
  });
  return packet.token;
}

export async function readCredentialPipe(fd,signal) {
  requireThat(!signal.aborted && fd===3);
  const stat=fs.fstatSync(fd);requireThat(stat.isFIFO()||stat.isSocket());
  const stream=fs.createReadStream(null,{fd,autoClose:true,highWaterMark:4096});
  const chunks=[];let size=0;
  const abort=()=>stream.destroy(new Error('CREDENTIAL_UNAVAILABLE'));
  signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,5000);
  let bytes;
  try {
    for await(const chunk of stream){size+=chunk.length;if(size>32768){chunk.fill(0);throw Error('CREDENTIAL_UNAVAILABLE');}chunks.push(chunk);}
    requireThat(!signal.aborted && size>0);bytes=Buffer.concat(chunks);
    const packet=JSON.parse(bytes.toString());exactKeys(packet,['token','attestation']);return packet;
  } catch { throw new Error('CREDENTIAL_UNAVAILABLE'); }
  finally {clearTimeout(timer);signal.removeEventListener('abort',abort);stream.destroy();bytes?.fill(0);for(const b of chunks)b.fill(0);}
}
