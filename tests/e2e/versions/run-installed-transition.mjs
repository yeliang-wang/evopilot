import assert from 'node:assert/strict';
import path from 'node:path';
import {createInstalledTransitionTransport} from './installed-transport.mjs';
import {exactKeys,probeDigest} from './probe-session.mjs';
import {runRuntimeTransitionJourney} from './runtime/6.3.0/transition-journey.mjs';

export async function runInstalledTransition({contextBytes,expectedContextDigest,inputBytes,authorizeInvocation,signal}) {
  assert.ok(Buffer.isBuffer(contextBytes)&&contextBytes.length<=8388608);
  assert.ok(Buffer.isBuffer(inputBytes)&&inputBytes.length<=65536);
  const context=JSON.parse(contextBytes),input=JSON.parse(inputBytes);
  assert.ok(['prepare','submit','readback'].includes(input.phase));
  exactKeys(input,['phase','scope','initial','targetReview','transition',...(input.phase==='prepare'?[]:['review','decision'])]);
  assert.equal(probeDigest(input),context.probeInputDigest,'PROBE_INPUT_DIGEST_MISMATCH');
  const transport=createInstalledTransitionTransport({contextBytes,expectedContextDigest,sourceRoot:path.resolve(import.meta.dirname,'../../..'),authorizeInvocation});
  return {...await runRuntimeTransitionJourney({...input,invoke:transport.invoke,signal}),installation:transport.identity};
}
