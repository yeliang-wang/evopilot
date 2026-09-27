import { createHash, createPublicKey, verify } from 'node:crypto';
import path from 'node:path';

export const PURPOSE = 'provision-workspace-llm-secret';
export const digest = value => `sha256:${createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex')}`;
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function requireThat(condition) { if (!condition) throw new Error('INVALID_BINDING'); }
export function exactKeys(value, keys) {
  requireThat(value && Object.getPrototypeOf(value) === Object.prototype);
  requireThat(Object.keys(value).sort().join(',') === [...keys].sort().join(','));
}
const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
export function validateConfig(config) {
  exactKeys(config, ['schema', 'destination', 'tenantId', 'workspaceId', 'username', 'hostId', 'permissionPublicKey', 'deploymentPublicKey', 'timeoutMs', 'ledgerPath']);
  requireThat(config.schema === 'evopilot-expert-host-config/v1');
  requireThat(typeof config.ledgerPath === 'string' && path.isAbsolute(config.ledgerPath) && path.resolve(config.ledgerPath) === config.ledgerPath);
  const url = new URL(config.destination);
  requireThat(url.protocol === 'https:' && url.origin === config.destination && !url.username && !url.password);
  for (const key of ['tenantId', 'workspaceId', 'username', 'hostId']) requireThat(id(config[key]));
  requireThat(Number.isInteger(config.timeoutMs) && config.timeoutMs >= 1000 && config.timeoutMs <= 120000);
  for (const key of ['permissionPublicKey', 'deploymentPublicKey']) requireThat(createPublicKey(config[key]).asymmetricKeyType === 'ed25519');
  return Object.freeze(structuredClone(config));
}
export function requestBinding(config, componentDigest, requestId) {
  requireThat(/^sha256:[a-f0-9]{64}$/.test(componentDigest));
  requireThat(typeof requestId === 'string' && /^[a-f0-9]{32}$/.test(requestId));
  return { purpose: PURPOSE, requestId, configDigest: digest(config), componentDigest,
    destination: config.destination, tenantId: config.tenantId, workspaceId: config.workspaceId, hostId: config.hostId };
}
export function verifySigned(envelope, publicKey, expected, now = Date.now()) {
  exactKeys(envelope, ['payload', 'signature']);
  exactKeys(envelope.payload, [...Object.keys(expected), 'issuedAt', 'expiresAt']);
  const { payload } = envelope;
  requireThat(Object.entries(expected).every(([k,v]) => canonical(payload[k]) === canonical(v)));
  requireThat(Number.isSafeInteger(payload.issuedAt) && Number.isSafeInteger(payload.expiresAt));
  requireThat(payload.issuedAt <= now && payload.expiresAt > now && payload.expiresAt - payload.issuedAt <= 300000);
  requireThat(typeof envelope.signature === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(envelope.signature));
  requireThat(verify(null, Buffer.from(canonical(payload)), publicKey, Buffer.from(envelope.signature, 'base64')));
}
export function verifyAuthority(config, binding, permission, deployment, now) {
  verifySigned(permission, config.permissionPublicKey, {schema:'evopilot-host-permission/v1', binding, decision:'ALLOW', hostPermissionObserved:true}, now);
  // Exact signed deployment version, never inferred from the Expert version.
  // 6.2 remains explicit legacy secure-setup compatibility, not semantic support.
  const runtimeVersion = deployment?.payload?.runtimeVersion;
  requireThat(runtimeVersion === '6.3.0' || runtimeVersion === '6.2.0');
  verifySigned(deployment, config.deploymentPublicKey, {schema:'evopilot-runtime-deployment-check/v1', destination:config.destination,
    tenantId:config.tenantId, workspaceId:config.workspaceId, runtimeVersion, nonDebugEncryption:true, loggingLevel:'info'}, now);
}
