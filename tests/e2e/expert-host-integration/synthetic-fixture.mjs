// Local controller fixture ONLY. No Runtime, real Host, GUI or E2E PASS inference.
import { generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import { canonical, digest, requestBinding } from '../../../packages/evolution-expert/host-integration/contracts.mjs';
export function signed(payload, key) {
  const now = Date.now();
  payload = {...payload,issuedAt:now-1000,expiresAt:now+60000};
  return {payload,signature:sign(null,Buffer.from(canonical(payload)),key).toString('base64')};
}
export function fixture() {
  const permissionKey = generateKeyPairSync('ed25519'), deploymentKey = generateKeyPairSync('ed25519');
  const config = {schema:'evopilot-expert-host-config/v1',destination:'https://runtime.example.test',tenantId:'tenant-test',workspaceId:'workspace-test',
    username:'synthetic-user',hostId:'synthetic-host',timeoutMs:1000,ledgerPath:'/synthetic-only/ledger',
    permissionPublicKey:permissionKey.publicKey.export({type:'spki',format:'pem'}),deploymentPublicKey:deploymentKey.publicKey.export({type:'spki',format:'pem'})};
  const componentDigest = digest('synthetic component'), requestId = randomBytes(16).toString('hex');
  const binding = requestBinding(config,componentDigest,requestId);
  const request = {config,componentDigest,requestId,
    permission:signed({schema:'evopilot-host-permission/v1',binding,decision:'ALLOW',hostPermissionObserved:true},permissionKey.privateKey),
    deployment:signed({schema:'evopilot-runtime-deployment-check/v1',destination:config.destination,tenantId:config.tenantId,workspaceId:config.workspaceId,
      runtimeVersion:'6.2.0',nonDebugEncryption:true,loggingLevel:'info'},deploymentKey.privateKey)};
  const observed = {calls:[],collected:0,claims:0,reads:0,posts:0};
  const sentinels = {password:'SYNTHETIC-runtime-password-DO-NOT-USE',value:'SYNTHETIC-provider-value-DO-NOT-USE',token:'SYNTHETIC-session-token-DO-NOT-USE'};
  let claimed = false;
  const deps = {platform:'darwin-arm64',integrity:async()=>componentDigest,
    ledger:{claim(_binding,secretId){if(claimed)throw new Error('duplicate'); claimed=true; observed.claims++; observed.secretId=secretId;}},
    collect:async()=>{observed.collected++; return {password:sentinels.password,value:sentinels.value,bindingDigest:digest(binding)};},
    transport:async call=>{
      observed.calls.push({method:call.method,pathname:call.pathname});
      if (call.pathname.endsWith('/login')) return {status:200,data:{token:sentinels.token,user:{username:config.username,tenantId:config.tenantId,workspaceId:config.workspaceId,mustChangePassword:false}}};
      if (call.method === 'GET') { observed.reads++; return {status:200,data:[]}; }
      observed.posts++;
      return {status:201,data:{schema:'evopilot-secret/v1',id:call.body.id,secretRef:call.body.id,tenantId:config.tenantId,workspaceId:config.workspaceId,scope:'workspace',kind:'llm-api-key',status:'ACTIVE',version:1,valueConfigured:true}};
    }};
  return {request,deps,observed,sentinels,permissionKey,deploymentKey};
}
