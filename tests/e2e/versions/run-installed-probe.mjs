import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createInstalledProbeTransport} from './installed-transport.mjs';
import {probeDigest,exactKeys} from './probe-session.mjs';
import {runRuntimeDiscoveryProbe} from './runtime/6.3.0/discovery-probe.mjs';
import {runExpertDeclarationProbe} from './expert/2.3.0/declaration-probe.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
const read=(file,limit)=>{assert.ok(path.isAbsolute(file));const stat=fs.lstatSync(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=limit);return fs.readFileSync(file);};
export async function runInstalledProbe(args) {
  assert.equal(args.length,6,'EXPLICIT_CONTEXT_AND_INPUT_REQUIRED');
  assert.equal(args[0],'--context');assert.equal(args[2],'--context-digest');assert.equal(args[4],'--input');
  const contextBytes=read(args[1],8388608),context=JSON.parse(contextBytes);
  assert.ok(['runtime','expert'].includes(context.product),'OWNING_PRODUCT_REQUIRED');
  const input=JSON.parse(read(args[5],65536));assert.equal(probeDigest(input),context.probeInputDigest,'PROBE_INPUT_DIGEST_MISMATCH');
  const transport=createInstalledProbeTransport({contextBytes,expectedContextDigest:args[3],sourceRoot:root});
  let report;
  if(context.product==='runtime') {exactKeys(input,['selection','scope']);report=await runRuntimeDiscoveryProbe({invoke:transport.invoke,...input});}
  else {exactKeys(input,[]);report=await runExpertDeclarationProbe({invoke:transport.invoke});}
  return {...report,installation:transport.identity};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {process.stdout.write(JSON.stringify(await runInstalledProbe(process.argv.slice(2)))+'\n');}
  catch {process.stdout.write(JSON.stringify({status:'BLOCKED',code:'INSTALLED_PROBE_REFUSED',targetCriteriaClosed:0,
    formalAcceptance:'NOT_EVALUATED',releaseAuthorized:false})+'\n');process.exitCode=2;}
}
