import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyDecisionEvidence } from '../../integration/compatibility/v1/decision-evidence.mjs';
import { syntheticDecisionEvidence } from './fixtures/decision-evidence.mjs';
const subject={owner:'ontology',operation:'native.package.decide',workspaceId:'synthetic',scope:{visibility:'private',projectId:'synthetic'},reviewDigest:'sha256:'+'1'.repeat(64),decision:'APPROVE'};
test('C04 evidence: exact pinned attestation and anchor; missing, forged, mismatched and changed evidence fail closed',()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'decision-evidence-')));
 try{
  const ref=syntheticDecisionEvidence(root,subject);verifyDecisionEvidence(ref,subject);
  for(const bad of ['synthetic-human-approved','https://example.invalid/approval',pathToFileURL(path.join(root,'absent')).href+'#sha256='+'0'.repeat(64),ref.slice(0,-1)+(ref.endsWith('0')?'1':'0')])assert.throws(()=>verifyDecisionEvidence(bad,subject),{code:'HUMAN_EVIDENCE_REQUIRED'});
  for(const change of [{workspaceId:'other'},{owner:'runtime'},{operation:'native.package.publish'},{reviewDigest:'sha256:'+'2'.repeat(64)},{decision:'REJECT'},{scope:{visibility:'public',projectId:'synthetic'}}])assert.throws(()=>verifyDecisionEvidence(ref,{...subject,...change}),{code:'HUMAN_EVIDENCE_REQUIRED'});
  const record=JSON.parse(fs.readFileSync(fileURLToPath(new URL(ref)),'utf8')),anchor=fileURLToPath(new URL(record.source.reference));
  fs.appendFileSync(anchor,'\nchanged');assert.throws(()=>verifyDecisionEvidence(ref,subject),{code:'HUMAN_EVIDENCE_REQUIRED'});
  const other=syntheticDecisionEvidence(root,{...subject,operation:'another'}),link=path.join(root,'link.json');fs.symlinkSync(fileURLToPath(new URL(other)),link);const linked=pathToFileURL(link);linked.hash=new URL(other).hash;assert.throws(()=>verifyDecisionEvidence(linked.href,{...subject,operation:'another'}),{code:'HUMAN_EVIDENCE_REQUIRED'});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
