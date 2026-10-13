import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyExpertAcceptanceFile} from '../dist/expert/core/acceptance.js';

// Evidence completeness only. Publication still needs review of actual receipts.
export function verifyWorkspaceAcceptance({report,installationDigest}) {
  const target=JSON.parse(fs.readFileSync(new URL('../governance/workspace-v02.json',import.meta.url)));
  assert.equal(target.schema,'evopilot-evolution-target/v1');
  assert.equal(target.version,'0.2.0');
  const checked=verifyExpertAcceptanceFile(report,installationDigest);
  return {...checked,targetId:target.id,reportDigest:createHash('sha256').update(fs.readFileSync(report)).digest('hex')};
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  try {
    assert.deepEqual(process.argv.slice(2).filter((_,i)=>i%2===0),['--report','--installation-digest']);
    assert.equal(process.argv.length,6);
    const result=verifyWorkspaceAcceptance({report:process.argv[3],installationDigest:process.argv[5]});
    console.log(JSON.stringify(result));
    if(result.completeness!=='COMPLETE') process.exitCode=1;
  } catch(error) { console.error('Workspace evidence verification failed: '+error.message);process.exitCode=1; }
}
