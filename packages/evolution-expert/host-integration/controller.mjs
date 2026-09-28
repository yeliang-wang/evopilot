import { verifyCredential } from './credential.mjs';
import { randomBytes } from 'node:crypto';
import { validateConfig, requestBinding, verifyAuthority, requireThat, exactKeys } from './contracts.mjs';

// Dependencies are trusted private Host code, never MCP/model-supplied callbacks.
// Only run.mjs constructs production dependencies. Tests inject synthetic fixtures.
export async function provision({config:rawConfig, componentDigest, requestId, permission, deployment}, deps) {
  let stage = 'BINDING', credentials, token, credential, secretId, config, binding;
  const abort = new AbortController();
  const cancel = () => abort.abort();
  deps.signal?.addEventListener('abort', cancel, {once:true});
  if (deps.signal?.aborted) cancel();
  let timer;
  try {
    config = validateConfig(rawConfig);
    binding = requestBinding(config, componentDigest, requestId);
    verifyAuthority(config, binding, permission, deployment);
    requireThat(await deps.integrity() === componentDigest);
    requireThat(deps.platform === 'darwin-arm64');
    timer = setTimeout(cancel, config.timeoutMs);
    if (abort.signal.aborted) return {status:'CANCELLED'};
    // Validate the installation-scoped TLS route before opening any secure fields.
    if(config.localTls) {
      stage='TRANSPORT_PREFLIGHT';
      requireThat(typeof deps.transport.preflight==='function');
      await deps.transport.preflight(abort.signal);
      verifyAuthority(config, binding, permission, deployment);
      requireThat(await deps.integrity() === componentDigest);
    }
    if(config.authentication) {
      stage='AUTH';
      requireThat(typeof deps.credential==='function');
      credential=await deps.credential(abort.signal);
      token=verifyCredential(config,binding,credential);
      // A successful list is availability only, never an identity assertion.
      const check=await deps.transport({method:'GET',pathname:'/api/v1/secrets',token,signal:abort.signal});
      requireThat(check.status===200 && Array.isArray(check.data));
      requireThat(check.data.every(row=>row.tenantId===config.tenantId && row.workspaceId===config.workspaceId));
      verifyAuthority(config,binding,permission,deployment);
      requireThat(await deps.integrity()===componentDigest);
      token=verifyCredential(config,binding,credential);
    }
    secretId = `expert-${randomBytes(24).toString('hex')}`;
    stage = 'CLAIM';
    deps.ledger.claim(binding, secretId);
    if (abort.signal.aborted) return {status:'CANCELLED'};
    stage = 'INPUT';
    credentials = await deps.collect({...binding, username:config.authentication?.actor??config.username, timeoutMs:config.timeoutMs, ...(config.authentication?{authMode:'local-token'}:{})}, abort.signal);
    if (!credentials || abort.signal.aborted) return {status:'CANCELLED'};
    exactKeys(credentials, [...(config.authentication?[]:['password']), 'value', 'bindingDigest']);
    const { digest } = await import('./contracts.mjs');
    requireThat(credentials.bindingDigest === digest(binding));
    for (const key of [...(config.authentication?[]:['password']),'value']) requireThat(typeof credentials[key] === 'string' && credentials[key].length > 0 && Buffer.byteLength(credentials[key]) <= 8192);
    // Recheck authority after the human delay; password-mode login itself audits.
    verifyAuthority(config, binding, permission, deployment);
    requireThat(await deps.integrity() === componentDigest);
    if (abort.signal.aborted) return {status:'CANCELLED'};
    stage = 'AUTH';
    if(config.authentication) { token=verifyCredential(config,binding,credential); } else {
      const auth = await deps.transport({method:'POST', pathname:'/api/v1/auth/login', body:{username:config.username,password:credentials.password}, signal:abort.signal});
      credentials.password = '';
      requireThat(auth.status === 200 && typeof auth.data?.token === 'string' && auth.data.token.length > 0 && auth.data.token.length <= 8192);
      const user = auth.data.user;
      requireThat(user?.username === config.username && user.tenantId === config.tenantId && user.workspaceId === config.workspaceId && !user.mustChangePassword);
      token = auth.data.token; auth.data.token = '';
    }
    stage = 'PRE_SUBMIT';
    const before = await deps.transport({method:'GET',pathname:'/api/v1/secrets',token,signal:abort.signal});
    requireThat(before.status === 200 && Array.isArray(before.data));
    requireThat(before.data.every(row => row.tenantId === config.tenantId && row.workspaceId === config.workspaceId));
    if (before.data.some(row => row.id === secretId)) return {status:'COLLISION'};
    verifyAuthority(config, binding, permission, deployment);
    requireThat(await deps.integrity() === componentDigest);
    if (abort.signal.aborted) return {status:'CANCELLED'};
    if(config.authentication) token=verifyCredential(config,binding,credential);
    // A connection failure can occur after Runtime commits. Never replay this POST.
    stage = 'MAY_HAVE_SUBMITTED';
    const created = await deps.transport({method:'POST',pathname:'/api/v1/secrets',token,signal:abort.signal,
      body:{id:secretId,name:secretId,tenantId:config.tenantId,workspaceId:config.workspaceId,scope:'workspace',kind:'llm-api-key',value:credentials.value}});
    credentials.value = '';
    const row = created.data;
    requireThat(created.status === 201 && row?.schema === 'evopilot-secret/v1' && row.id === secretId && row.secretRef === secretId);
    requireThat(row.tenantId === config.tenantId && row.workspaceId === config.workspaceId && row.scope === 'workspace' && row.kind === 'llm-api-key');
    requireThat(row.status === 'ACTIVE' && row.version === 1 && row.valueConfigured === true && !('encryption' in row) && !('value' in row));
    return {status:'SECRET_REF_CREATED',secretRef:row.secretRef};
  } catch {
    if (stage === 'MAY_HAVE_SUBMITTED') {
      // Fresh bounded read-only signal: cancellation must not cause a write retry.
      try {
        const observed = await deps.transport({method:'GET',pathname:'/api/v1/secrets',token,signal:AbortSignal.timeout(3000)});
        const row = observed.status === 200 && Array.isArray(observed.data) ? observed.data.find(r => r.id === secretId && r.tenantId === config.tenantId && r.workspaceId === config.workspaceId) : null;
        // Metadata cannot prove the submitted value; even a matching row stays UNKNOWN.
        void row;
      } catch { /* No raw server/transport error crosses the private boundary. */ }
      return {status:'UNKNOWN'};
    }
    return {status:stage === 'BINDING' ? 'BINDING_REJECTED' : stage === 'CLAIM' ? 'DUPLICATE_OR_LEDGER_UNAVAILABLE' : stage === 'AUTH' ? 'AUTH_FAILED' : 'FAILED_BEFORE_SECRET_SUBMIT'};
  } finally {
    clearTimeout(timer); deps.signal?.removeEventListener('abort', cancel);
    if (credentials) { credentials.password = ''; credentials.value = ''; }
    if(credential) credential.token='';
    token = undefined;
    // JS/OS copies are not guaranteed erased; do not claim total-memory secrecy.
  }
}
