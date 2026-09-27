import assert from 'node:assert/strict';
import path from 'node:path';
import {createInstalledProbeTransport} from './installed-transport.mjs';
import {exactKeys,probeDigest} from './probe-session.mjs';
import {runRuntimeCapabilityProbe} from './runtime/6.3.0/capability-probe.mjs';

export async function runInstalledCapability({contextBytes,expectedContextDigest,inputBytes,signal,timeoutMs}) {
  signal?.throwIfAborted();assert.ok(Buffer.isBuffer(contextBytes)&&contextBytes.length<=8388608);
  assert.ok(Buffer.isBuffer(inputBytes)&&inputBytes.length<=65536);
  const input=JSON.parse(inputBytes),context=JSON.parse(contextBytes);exactKeys(input,['operation','selection','scope','expected']);
  assert.equal(context.product,'runtime');assert.equal(probeDigest(input),context.probeInputDigest,'CAPABILITY_INPUT_DIGEST_MISMATCH');
  const transport=createInstalledProbeTransport({contextBytes,expectedContextDigest,sourceRoot:path.resolve(import.meta.dirname,'../../..'),capabilityMode:true});
  return {...await runRuntimeCapabilityProbe({...input,invoke:transport.invoke,signal,timeoutMs}),installation:transport.identity};
}
