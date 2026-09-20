import https from 'node:https';

// No proxy, cookies, redirects, automatic retries, ordinary environment credentials,
// custom CA bypass, response logging or caller-supplied endpoint/header surface.
export function privateTransport(config) {
  return ({method, pathname, body, token, signal}) => new Promise((resolve, reject) => {
    if (!['/api/v1/auth/login', '/api/v1/secrets'].includes(pathname) || !['GET','POST'].includes(method)) return reject(new Error('TRANSPORT_FAILED'));
    let payload;
    try { payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body)); } catch { return reject(new Error('TRANSPORT_FAILED')); }
    const headers = {'accept':'application/json', 'x-evopilot-tenant':config.tenantId, 'x-evopilot-workspace':config.workspaceId};
    if (payload) { headers['content-type'] = 'application/json'; headers['content-length'] = payload.length; }
    if (token) headers.authorization = `Bearer ${token}`;
    const req = https.request(new URL(pathname, config.destination), {method, headers, signal, agent:false, rejectUnauthorized:true, timeout:config.timeoutMs}, res => {
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
}
