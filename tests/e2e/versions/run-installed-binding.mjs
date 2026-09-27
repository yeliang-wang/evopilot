import assert from 'node:assert/strict';
import path from 'node:path';
import {createInstalledBindingTransport} from './installed-transport.mjs';
import {exactKeys,probeDigest} from './probe-session.mjs';
import {runRuntimeBindingJourney} from './runtime/6.3.0/binding-journey.mjs';

// Programmatic campaign bridge only: deliberately no command-line entry that
// treats a self-declared digest/boolean as permission for real Runtime writes.
export async function runInstalledBinding({contextBytes,expectedContextDigest,inputBytes,authorizeInvocation,signal}) {
  assert.ok(Buffer.isBuffer(contextBytes)&&contextBytes.length<=8388608);
  assert.ok(Buffer.isBuffer(inputBytes)&&inputBytes.length<=65536);
  const context=JSON.parse(contextBytes),input=JSON.parse(inputBytes);
  assert.ok(['prepare','submit','readback'].includes(input.phase));
  exactKeys(input,['phase','selection','scope',...(input.phase==='prepare'?[]:['review','decision'])]);
  assert.equal(probeDigest(input),context.probeInputDigest,'PROBE_INPUT_DIGEST_MISMATCH');
  const transport=createInstalledBindingTransport({contextBytes,expectedContextDigest,
    sourceRoot:path.resolve(import.meta.dirname,'../../..'),authorizeInvocation});
  const result=await runRuntimeBindingJourney({...input,invoke:transport.invoke,signal});
  return {...result,installation:transport.identity};
}
