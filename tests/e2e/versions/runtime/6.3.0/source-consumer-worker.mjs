import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readPublishedHarnessCatalog} from '../../../../../packages/server/dist/domains/harness-template/catalog.js';
import {readVerifiedSemanticCatalog} from '../../../../../packages/server/dist/domains/harness-template/semantic-catalog-consumer.js';
import {exactKeys,probeDigest} from '../../probe-session.mjs';

// Source-test worker, NOT a public CLI or installed-Host adapter. Fixed owning
// Runtime validators, no Harness imports, injected validator or write operation.
export async function readSourceConsumerEvidence(input) {
  if(input.mode==='legacy') {
    exactKeys(input,['mode','catalogRoot']);assert.ok(path.isAbsolute(input.catalogRoot));
    const result=readPublishedHarnessCatalog(input.catalogRoot);
    assert.equal(result.status,'READY','LEGACY_CONSUMER_REFUSED');assert.equal(result.format,'asset-v3');
    assert.deepEqual(result.warnings,[]);
    return {schema:'evopilot-source-legacy-consumer-evidence/v1',status:'READY',catalogDigest:result.catalog.catalogDigest,
      entries:result.catalog.entries.map(({kind,id,version,assetDigest})=>({kind,id,version,assetDigest}))};
  }
  exactKeys(input,['mode','registryConfigPath','policyPath','catalogId','subject']);assert.equal(input.mode,'semantic');
  assert.ok(path.isAbsolute(input.registryConfigPath)&&path.isAbsolute(input.policyPath));
  const subject=structuredClone(input.subject);
  const result=await readVerifiedSemanticCatalog({registryConfigPath:input.registryConfigPath,policyPath:input.policyPath,
    catalogId:input.catalogId,currentSubject:()=>structuredClone(subject)});
  assert.equal(result.verification.status,'CONFIGURED_MATERIALS_VERIFIED');assert.equal(result.verification.eligibleForExecution,false);
  return {schema:'evopilot-source-semantic-consumer-evidence/v1',status:result.verification.status,catalogId:result.catalogId,
    registryDigest:result.registryDigest,policyDigest:result.policyDigest,trustContext:result.trustContext,
    pointer:result.pointer,generation:result.generation,receipt:result.receipt,
    materialDigests:[...result.materials].map(([relative,document])=>({path:relative,documentDigest:probeDigest(document)})).sort((a,b)=>a.path.localeCompare(b.path)),
    legacy:{catalogDigest:result.verification.legacyCatalogDigest,markdownDigest:result.verification.legacyMarkdownDigest,
      assetFiles:result.verification.legacyAssetFiles},eligibleForExecution:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const bytes=fs.readFileSync(0);assert.ok(bytes.length>0&&bytes.length<=65536,'WORKER_INPUT_LIMIT');
    console.log(JSON.stringify(await readSourceConsumerEvidence(JSON.parse(bytes))));
  }catch(error) {
    const known=new Set(['UNAVAILABLE','PERMISSION_DENIED','TRUST_REQUIRED','PATH_DENIED','INVALID','INVALID_JSON',
      'IDENTITY_CONFLICT','UNSUPPORTED','DIGEST_MISMATCH','MATERIAL_INVALID','MATERIAL_MISSING','FILE_LIMIT','ENTRY_LIMIT','DRIFT','CANCELLED','TIMEOUT']);
    console.log(JSON.stringify({schema:'evopilot-source-consumer-refusal/v1',status:'FAILED',
      code:known.has(error?.code)?error.code:'SOURCE_WORKER_FAILURE'}));process.exitCode=1;
  }
}
