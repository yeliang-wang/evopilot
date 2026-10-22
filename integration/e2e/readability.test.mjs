import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createComposition,loadInstalledProducts} from '../../dist/integration/composition.js';
import {fixture} from './fixtures/native-project.mjs';
import {rehash} from '../../projects/evopilot-ontology/tests/fixtures/native/package.mjs';
import {nativeSha256} from '../../dist/integration/compatibility/v1/native.mjs';
import {renderReadSnapshot,readSnapshot,readStable,queryReadSnapshot,compareReadSnapshots} from '../../dist/integration/compatibility/readability/v1/readability.mjs';

test('V07-E03/E05/E06 actual owner validation remains distinguishable from expected rejection across every projection', {timeout:90000},async t=>{
 const f=fixture(),root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'evopilot-readable-'));
 const toolchain=JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN,'utf8'));
 const stack=createComposition({workspaceRoot:path.join(root,'state'),workspaceId:'readable-test'},await loadInstalledProducts(),{},{toolchain});
 t.after(()=>{stack.close();f.cleanup();fs.rmSync(root,{recursive:true,force:true});});
 let serial=0;const q=(owner,operation,input={},scope=f.scope)=>stack.native(owner,{operation,scope,input});
 const write=(owner,operation,input)=>stack.native(owner,{operation,scope:f.scope,input,requestId:'readable-'+(++serial),expectedRevision:stack.inspect(owner,f.scope).revision});
 const snapshots={};
 for(const owner of ['ontology','harness']){
  const pkg=f.packages[owner],identity={id:pkg.manifest.id,version:pkg.manifest.version};
  await write(owner,'native.package.put',{package:pkg});
  const before=await q(owner,'readable.snapshot',identity);assert(before.rows.filter(r=>r.kind==='case').every(r=>r.verdict==='NOT_EXECUTED'));
  await write(owner,'native.package.validate',identity);
  const snapshot=await q(owner,'readable.snapshot',identity);snapshots[owner]=snapshot;
  const document=(await import('../../dist/integration/compatibility/readability/v1/presentation.mjs')).buildReadDocument(snapshot);
  assert.equal(document.tables.find(t=>t.id==='results').rows.length,snapshot.rows.filter(r=>r.kind==='case').length);
  assert(document.tables.some(t=>t.id===(owner==='ontology'?'concepts':'rules')));
  assert(snapshot.rows.filter(r=>r.presentation).every(r=>r.references.length));
  const nativeRecord=await q(owner,'native.package.inspect',identity);
  assert.deepEqual(nativeRecord.package,pkg);
  const changedReport=structuredClone(nativeRecord);changedReport.validation.reportDigest=nativeSha256('foreign-report');
  if(owner==='harness'){
   const {harnessReadSnapshot}=await import('../../projects/evopilot-harness/dist/readable.js');
   assert.throws(()=>harnessReadSnapshot(changedReport,'readable-test',f.scope),{code:'READABLE_EVIDENCE_DRIFT'});
  }else{
   const {ontologyReadSnapshot}=await import('../../projects/evopilot-ontology/dist/readable.js');
   await assert.rejects(ontologyReadSnapshot(changedReport,'readable-test',f.scope,toolchain),{code:'READABLE_EVIDENCE_DRIFT'});
  }
  if(owner==='harness'){
   const rules=JSON.parse(pkg.files[pkg.manifest.entrypoints.ruleCatalog]).rules;
   for(const row of snapshot.rows.filter(r=>r.kind==='rule')){const rule=rules.find(r=>row.id==='rule:'+r.ruleId);assert.equal(row.presentation.cells.inputs,rule.inputRefs.join('；')||'未提供');assert.equal(row.presentation.cells.purpose,rule.qualityDomain);assert(row.presentation.cells.policy.includes('required='+rule.required));}
  }
  if(owner==='ontology'){
   const first=await q(owner,'readable.query',{...identity,query:{kind:'constraint',limit:1}});
   assert(first.rows[0].presentation.cells.target.includes('targetClass'));
   assert.equal(first.denominator.variants,snapshot.denominator.variants);
  }
  const negative=snapshot.rows.find(r=>r.kind==='case'&&(r.expected.conforms===false||r.expected.status==='FAIL'));
  assert(negative);assert.equal(negative.verdict,'PASS');assert(negative.actual.conforms===false||negative.actual.status==='FAIL');assert.equal(negative.origin,'synthetic');
  assert.equal(snapshot.stages.find(s=>s.id==='software-release').status,'NOT_ASSERTED');
  const seen=[];let cursor;
  do{const page=await q(owner,'readable.query',{...identity,query:{limit:3,...(cursor?{cursor}:{}),expectedDigest:snapshot.digest}});assert.equal(page.total,snapshot.rows.length);assert.deepEqual(page.denominator,snapshot.denominator);seen.push(...page.rows.map(r=>r.id));cursor=page.nextCursor;}while(cursor);
  assert.deepEqual(seen,snapshot.rows.map(r=>r.id));assert.equal(new Set(seen).size,seen.length);
  for(const format of ['json','markdown','html']){const exp=await q(owner,'readable.export',{...identity,format,expectedDigest:snapshot.digest});assert.equal(exp.snapshotDigest,snapshot.digest);assert.equal(exp.content,renderReadSnapshot(snapshot,format));}
  await assert.rejects(q(owner,'readable.snapshot',identity,{...f.scope,projectId:'foreign'}));
  await assert.rejects(q(owner,'readable.export',{...identity,format:'json',expectedDigest:before.digest}),{code:'READABLE_SNAPSHOT_DRIFT'});
 }
 assert.throws(()=>compareReadSnapshots(snapshots.ontology,snapshots.harness),{code:'READABLE_COMPARISON_SCOPE'});
 const pkg=structuredClone(f.packages.ontology);pkg.manifest.version='1.0.1';pkg.files['model.ttl']='\n# Serialization-only change\n'+pkg.files['model.ttl'];rehash(pkg);
 await write('ontology','native.package.put',{package:pkg});
 const compared=await q('ontology','readable.compare',{id:pkg.manifest.id,beforeVersion:'1.0.0',afterVersion:'1.0.1'});
 assert.equal(compared.rdfGraphEquivalentWithinProfile,true);assert(compared.markdown.includes(compared.before.digest));assert(compared.markdown.includes(compared.after.digest));assert.equal(compared.semanticEquivalence,'NOT_ASSERTED');assert.equal(compared.impact,'REVIEW_REQUIRED');
 assert.notEqual(compared.before.pins.packageDigest,compared.after.pins.packageDigest);
 const structural=structuredClone(pkg);structural.manifest.id='structure-example';
 structural.files['shapes/domain.ttl']+='\n<urn:AdditionalShape> a <http://www.w3.org/ns/shacl#NodeShape> ; <http://www.w3.org/ns/shacl#in> ( "allowed" "other" ) .\n';
 rehash(structural);await write('ontology','native.package.put',{package:structural});
 const structuralSnapshot=await q('ontology','readable.snapshot',{id:structural.manifest.id,version:structural.manifest.version});
 const structureRows=structuralSnapshot.rows.filter(r=>r.kind==='structure');assert(structureRows.length>=2);
 assert(structureRows.some(r=>r.details.some(t=>t[1].value==='http://www.w3.org/1999/02/22-rdf-syntax-ns#first'&&t[2].value==='allowed')));
 assert(structureRows.every(r=>!r.presentation&&r.references[0].digest));
 assert.equal(structuralSnapshot.denominator.variants,snapshots.ontology.denominator.variants);
 assert.deepEqual((await q('ontology','native.package.inspect',{id:structural.manifest.id,version:structural.manifest.version})).package,structural);
 const model=structuredClone(pkg);model.manifest.version='1.0.2';model.files['model.ttl']=model.files['model.ttl'].replace('rdfs:label "Project"','rdfs:label "Renamed project"');assert.notEqual(model.files['model.ttl'],pkg.files['model.ttl']);rehash(model);await write('ontology','native.package.put',{package:model});
 assert.equal((await q('ontology','readable.compare',{id:pkg.manifest.id,beforeVersion:'1.0.1',afterVersion:'1.0.2'})).rdfGraphEquivalentWithinProfile,false);
 const altered=structuredClone(model);altered.manifest.version='1.0.3';
 altered.files['model.ttl']=altered.files['model.ttl'].replace('rdfs:range ex:Capability','rdfs:range ex:Project');
 altered.files['shapes/domain.ttl']=altered.files['shapes/domain.ttl'].replace('sh:minCount 2','sh:minCount 1');
 rehash(altered);await write('ontology','native.package.put',{package:altered});
 async function allComparisonPages(owner,id,beforeVersion,afterVersion){
  const before=await q(owner,'readable.snapshot',{id,version:beforeVersion}),after=await q(owner,'readable.snapshot',{id,version:afterVersion});
  const prior=new Map(before.rows.map(r=>[r.id,r])),next=new Map(after.rows.map(r=>[r.id,r]));
  const expected=[...new Set([...prior.keys(),...next.keys()])].filter(id=>readStable(prior.get(id)??null)!==readStable(next.get(id)??null)).sort();
  const changes=[],tableRows=[];let cursor,first;
  do{
   const page=await q(owner,'readable.compare',{id,beforeVersion,afterVersion,query:{limit:50,...(cursor?{cursor}:{})}});
   first??=page;assert(Buffer.byteLength(JSON.stringify(page))<=12350);assert.equal(page.offset,changes.length);
   assert.equal(page.comparisonDigest,first.comparisonDigest);assert.equal(page.totalChanges,expected.length);
   assert.deepEqual(page.beforeDenominator,before.denominator);assert.deepEqual(page.afterDenominator,after.denominator);
   for(const change of page.changes){assert.deepEqual(change.before,prior.get(change.id)??null);assert.deepEqual(change.after,next.get(change.id)??null);}
   changes.push(...page.changes);tableRows.push(...page.table.rows);cursor=page.nextCursor;
   assert(changes.length<=expected.length);assert(!cursor||page.returnedChanges>0);
  }while(cursor);
  assert.deepEqual(changes.map(c=>c.id).sort(),expected);assert.equal(new Set(changes.map(c=>c.id)).size,changes.length);
  if(first.nextCursor)await assert.rejects(q(owner,'readable.compare',{id,beforeVersion:afterVersion,afterVersion:beforeVersion,query:{cursor:first.nextCursor}}),{code:'READABLE_SNAPSHOT_DRIFT'});
  return {...first,changes,table:{...first.table,rows:tableRows}};
 }
 const semanticChange=await allComparisonPages('ontology',pkg.manifest.id,'1.0.2','1.0.3');
 assert(semanticChange.table.rows.some(r=>r[2]==='range'&&r[3].endsWith('/Capability')&&r[4].endsWith('/Project')));
 assert(semanticChange.table.rows.some(r=>r[2]==='constraint'&&r[3].includes('minCount = "2"')&&r[4].includes('minCount = "1"')));
 assert(semanticChange.changes.some(c=>c.change==='REMOVED'&&c.before.kind==='relation'));
 assert(semanticChange.changes.some(c=>c.change==='ADDED'&&c.after.kind==='relation'));
 assert.equal(semanticChange.semanticEquivalence,'NOT_ASSERTED');
 const parameterChange=structuredClone(f.packages.harness);parameterChange.manifest.version='1.0.1';
 // A new synthetic version explicitly changes its own declared parameter range.
 // Neither the previous package nor the shared native standard is modified.
 const parameterSchema=JSON.parse(parameterChange.files['parameter-schema.json']);parameterSchema.properties.maxWarnings.maximum=2;parameterSchema.properties.maxWarnings.default=2;
 parameterChange.files['parameter-schema.json']=JSON.stringify(parameterSchema);
 parameterChange.files['data/parameters.json']=JSON.stringify({params:{maxWarnings:2}});rehash(parameterChange);
 await write('harness','native.package.put',{package:parameterChange});
 const policyChange=await allComparisonPages('harness',parameterChange.manifest.id,'1.0.0','1.0.1');
 assert(policyChange.table.rows.some(r=>r[2]==='parameters'&&r[3]==='maxWarnings = 0'&&r[4]==='maxWarnings = 2'));
 await assert.rejects(q('ontology','readable.compare',{id:pkg.manifest.id,beforeVersion:'missing',afterVersion:'1.0.3'}));
});

test('V07-E06 unavailable native reader returns an explicit error instead of empty or passing evidence',async t=>{
 const f=fixture(),root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'evopilot-reader-unavailable-'));
 const stack=createComposition({workspaceRoot:path.join(root,'state'),workspaceId:'unavailable-reader'},await loadInstalledProducts());
 t.after(()=>{stack.close();f.cleanup();fs.rmSync(root,{recursive:true,force:true});});
 const pkg=f.packages.ontology,scope=f.scope,identity={id:pkg.manifest.id,version:pkg.manifest.version};
 await stack.native('ontology',{operation:'native.package.put',scope,input:{package:pkg},requestId:'unavailable-put',expectedRevision:stack.inspect('ontology',scope).revision});
 await assert.rejects(stack.native('ontology',{operation:'readable.snapshot',scope,input:identity}),{code:'TOOLCHAIN_NOT_READY'});
 const record=await stack.native('ontology',{operation:'native.package.inspect',scope,input:identity});
 assert.equal(record.validation,null);assert.deepEqual(record.package,pkg);
});

test('V07-E06 filtered pagination retains denominator; exports escape hostile asset text',()=>{
 const rows=Array.from({length:7},(_,i)=>({id:'r'+i,kind:'case',label:'<script>alert(1)</script> ['+i+'](javascript:run())',verdict:i%2?'PASS':'MISSING',expected:{status:'PASS'},actual:null,origin:'synthetic',references:[],details:{}}));
 const snapshot=readSnapshot({owner:'runtime',workspaceId:'test',scope:{visibility:'private',projectId:'example'},subject:{kind:'project',id:'example',version:null},pins:{projectCandidateDigest:nativeSha256('synthetic')},rows,denominator:{requirements:7,variants:7},stages:[],limitations:['Synthetic fixture']});
 const first=queryReadSnapshot(snapshot,{verdict:'MISSING',limit:2});assert.equal(first.matching,4);assert.equal(first.denominator.variants,7);
 const second=queryReadSnapshot(snapshot,{verdict:'MISSING',limit:2,cursor:first.nextCursor});assert.deepEqual([...first.rows,...second.rows].map(r=>r.id),['r0','r2','r4','r6']);assert.equal(second.nextCursor,null);
 assert.throws(()=>queryReadSnapshot(snapshot,{verdict:'PASS',cursor:first.nextCursor}),{code:'READABLE_SNAPSHOT_DRIFT'});
 const html=renderReadSnapshot(snapshot,'html');assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('href='));
 const md=renderReadSnapshot(snapshot,'markdown');assert(md.includes('\\['));assert(!md.includes('<script>'));
});
