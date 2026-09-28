import https from 'node:https';
import tls from 'node:tls';
import { digest } from './contracts.mjs';

// No proxy, cookies, redirects, automatic retries, ordinary environment credentials,
// global CA changes, response logging or caller-supplied endpoint/header surface.
export function privateTransport(config) {
  const trust=config.localTls?{ca:config.localTls.certificatePem,checkServerIdentity:(host,cert)=>{
    const error=tls.checkServerIdentity(host,cert);
    return error || (digest(cert.raw)===config.localTls.certificateDigest?undefined:new Error('TRANSPORT_FAILED'));
  }}:{};
  const request=({method, pathname, body, token, signal},preflight=false) => new Promise((resolve, reject) => {
    if (!(preflight && config.localTls && method==='GET' && pathname==='/private-input/ready') && (!['/api/v1/auth/login', '/api/v1/secrets'].includes(pathname) || !['GET','POST'].includes(method))) return reject(new Error('TRANSPORT_FAILED'));
    let payload;
    try { payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body)); } catch { return reject(new Error('TRANSPORT_FAILED')); }
    const headers = {'accept':'application/json', 'x-evopilot-tenant':config.tenantId, 'x-evopilot-workspace':config.workspaceId};
    if(config.localTls)headers['x-evopilot-local-gateway-binding']=config.localTls.gatewayConfigDigest;
    if (payload) { headers['content-type'] = 'application/json'; headers['content-length'] = payload.length; }
    if (token) headers.authorization = `Bearer ${token}`;
    const req = https.request(new URL(pathname, config.destination), {method, headers, signal, agent:false, ...trust, rejectUnauthorized:true, timeout:config.timeoutMs}, res => {
      let size = 0; const chunks = [];
      const clear = () => { for (const chunk of chunks) chunk.fill(0); chunks.length = 0; };
      res.on('data', chunk => { size += chunk.length; if (size > 1048576) { clear(); res.destroy(new Error('TRANSPORT_FAILED')); } else chunks.push(chunk); });
      res.on('error', () => { clear(); reject(new Error('TRANSPORT_FAILED')); });
      res.on('end', () => {
        const bytes = Buffer.concat(chunks);
        try { resolve({status:res.statusCode, data:JSON.parse(bytes.toString()).data}); }
        catch { reject(new Error('TRANSPORT_FAILED')); }
        finally { bytes.fill(0); clear(); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('TRANSPORT_FAILED')));
    req.on('error', () => reject(new Error('TRANSPORT_FAILED')));
    req.on('close', () => { payload?.fill(0); delete headers.authorization; });
    req.end(payload);
  });
  const transport=call=>request(call);
  transport.preflight=async signal=>{
    if(!config.localTls)return;
    const reply=await request({method:'GET',pathname:'/private-input/ready',signal},true);
    if(reply.status!==200 || reply.data?.ready!==true)throw new Error('TRANSPORT_FAILED');
  };
  return transport;
}
