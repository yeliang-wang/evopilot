import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(root+p));
const digest=p=>'sha256:'+createHash('sha256').update(fs.readFileSync(root+p)).digest('hex');
export function checkReadinessTarget(){
  const t=read('governance/asset-readiness-v081.json'), a=read(t.acceptance);
  assert.equal(t.schema,'evopilot-evolution-target/v1');assert.equal(t.targetVersion,'0.8.1');
  assert.equal(t.roadmapDigest,digest('docs/roadmap.md'));
  for(const k of ['plan','adr','acceptance'])assert.equal(t[k+'Digest'],digest(t[k]),k+' drift');
  assert.equal(a.criteria.length,24);
  const variants=a.criteria.flatMap(c=>c.variants.map(v=>v.id));
  assert.equal(variants.length,72);assert.equal(new Set(variants).size,72);assert.deepEqual(t.variants,variants);
  assert.equal(a.criteria.filter(c=>c.stage==='PRE_RELEASE').flatMap(c=>c.variants).length,63);
  assert.equal(a.criteria.filter(c=>c.stage==='POST_RELEASE').flatMap(c=>c.variants).length,9);
  const map=read('governance/asset-readiness-v081-legacy-map.json'),old=read('governance/asset-usability-v08.json');
  assert.deepEqual(map.map(m=>m.obligation),old.acceptance);
  assert(t.exclusions.includes('business DB or SSH operations'));assert(t.exclusions.includes('Dashboard'));
  assert.equal(t.authority,false);assert.equal(t.acceptanceInferred,false);
  return {status:'ALIGNED',target:t.id,version:t.targetVersion,variants:72,acceptance:'NOT_INFERRED',authority:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(checkReadinessTarget()));
