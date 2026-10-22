import test from 'node:test';
import assert from 'node:assert/strict';
import {readSnapshot,readStable,renderReadSnapshot,compareReadSnapshots} from '../../dist/integration/compatibility/readability/v1/readability.mjs';
import {buildReadDocument} from '../../dist/integration/compatibility/readability/v1/presentation.mjs';
import {ontologyPresentation,shapeNodeKind,shapeNodeRank} from '../../projects/evopilot-ontology/dist/readable-presentation.js';
const row=(verdict,actual=null)=>({id:verdict,kind:'case',label:'Case '+verdict,expected:{status:'PASS'},actual,verdict,origin:'synthetic',references:[{kind:'evidence',id:'fixture',digest:null}],details:{}});
const snapshot=rows=>readSnapshot({owner:'harness',workspaceId:'synthetic',scope:{visibility:'private',projectId:'fixture'},subject:{kind:'asset',id:'fixture',version:'1.0.0'},pins:{packageDigest:null},denominator:{requirements:6,variants:6},rows,stages:[],limitations:['SYNTHETIC']});
test('V07-E12.04/E12.06 result tables preserve distinct states and expected rejection without changing raw outcomes',()=>{
 const negative={...row('PASS',{status:'FAIL',ruleIds:['R']}),expected:{status:'FAIL',ruleIds:['R']}};
 const s=snapshot([negative,...['MISSING','NOT_EXECUTED','ERROR','UNKNOWN','FAIL'].map(v=>row(v))]);
 const before=JSON.stringify(s),doc=buildReadDocument(s),table=doc.tables.find(t=>t.id==='results');
 assert.equal(table.rows.length,6);assert.equal(new Set(table.rows.map(r=>r[3])).size,6);
 assert(table.rows[0][2].includes('FAIL'));assert(table.rows[0][3].includes('PASS'));assert(table.rows[0][5].includes('不能据此认定业务执行成功'));
 for(const format of ['markdown','html']){const rendered=renderReadSnapshot(s,format);assert(rendered.includes('未执行'));assert(rendered.includes('工具或执行错误'));assert(rendered.includes('缺少证据'));assert(rendered.includes(s.digest));}
 assert.equal(JSON.stringify(s),before);
});
test('V07-E12.02 native SHACL strict bound, language, datatype and missing metadata remain exact',()=>{
 const iri=value=>({kind:'iri',value}),literal=(value,datatype)=>({kind:'literal',value,datatype,language:null});
 const SH='http://www.w3.org/ns/shacl#';
 const triples=[[iri('urn:shape'),iri(SH+'path'),iri('urn:duration')],[iri('urn:shape'),iri(SH+'minExclusive'),literal('12','http://www.w3.org/2001/XMLSchema#decimal')]];
 const helper=ontologyPresentation([{path:'shape.ttl',role:'shape',triples}]);
 const p=helper.present('shape','shape.ttl',triples);assert.equal(p.cells.path,'urn:duration');assert.equal(p.cells.severity,'未提供');assert(p.cells.constraint.includes('minExclusive = "12"^^http://www.w3.org/2001/XMLSchema#decimal'));assert(!p.cells.constraint.includes('13'));
});
test('V07-E12.05 comparison retains exact before/after cells and both evidence identities',()=>{
 const before=snapshot([{...row('DECLARED'),presentation:{section:'rules',cells:{name:'latency',parameters:'limit = 12'}}}]);
 const body=structuredClone(before);delete body.schema;delete body.authority;delete body.digest;body.subject.version='1.0.1';body.rows[0].presentation.cells.parameters='limit = 13';
 const after=readSnapshot(body),diff=compareReadSnapshots(before,after);
 assert(diff.table.rows.some(r=>r[2]==='parameters'&&r[3]==='limit = 12'&&r[4]==='limit = 13'));
 assert(diff.markdown.includes(before.digest));assert(diff.markdown.includes(after.digest));assert.equal(diff.semanticEquivalence,'NOT_ASSERTED');assert.equal(diff.authority,false);
});
test('V07-E12.02 RDF list and path structure are distinguished from directly declared SHACL shapes',()=>{
 const iri=value=>({kind:'iri',value}),blank=value=>({kind:'blank',value});
 const SH='http://www.w3.org/ns/shacl#',RDF='http://www.w3.org/1999/02/22-rdf-syntax-ns#';
 const list=[[blank('list'),iri(RDF+'first'),iri('urn:allowed')],[blank('list'),iri(RDF+'rest'),iri(RDF+'nil')]];
 const path=[[blank('path'),iri(SH+'inversePath'),iri('urn:property')]];
 const target=[[iri('urn:shape'),iri(SH+'targetClass'),iri('urn:Project')]];
 const property=[[blank('property'),iri(SH+'path'),blank('path')],[blank('property'),iri(SH+'minCount'),{kind:'literal',value:'1'}]];
 const nested=[[blank('nested'),iri(SH+'class'),iri('urn:Project')]];
 assert.equal(shapeNodeKind(list),'structure');assert.equal(shapeNodeKind(path),'structure');
 for(const declared of [target,property,nested])assert.equal(shapeNodeKind(declared),'constraint');
 assert(shapeNodeRank(target)<shapeNodeRank(property));assert(shapeNodeRank(property)<shapeNodeRank(nested));assert(shapeNodeRank(nested)<shapeNodeRank(list));
});
test('V07-E06/E08 comparison pages bound Host output without truncating evidence or accepting stale cursors',()=>{
 const makeRows=value=>Array.from({length:60},(_,i)=>({...row('DECLARED'),id:'row-'+String(i).padStart(2,'0'),details:{value,text:'原始证据'.repeat(90)},presentation:{section:'rules',cells:{parameters:'limit = '+value}}}));
 const before=snapshot(makeRows(1)),after=snapshot(makeRows(2));
 let cursor,first,offset=0;const actual=[];
 do{
  const page=compareReadSnapshots(before,after,{limit:50,...(cursor?{cursor}:{})});first??=page;
  assert(Buffer.byteLength(JSON.stringify(page))<=12288);assert.equal(page.offset,offset);assert.equal(page.totalChanges,60);
  assert.equal(page.returnedChanges,page.changes.length);assert(page.changes.length>0);assert.equal(page.before.digest,before.digest);assert.equal(page.after.digest,after.digest);
  for(const change of page.changes){assert.deepEqual(change.before,before.rows.find(r=>r.id===change.id));assert.deepEqual(change.after,after.rows.find(r=>r.id===change.id));}
  offset+=page.changes.length;actual.push(...page.changes.map(c=>c.id));cursor=page.nextCursor;
 }while(cursor);
 assert.deepEqual(actual,before.rows.map(r=>r.id));assert(first.returnedChanges<50);
 assert.throws(()=>compareReadSnapshots(after,before,{cursor:first.nextCursor}),{code:'READABLE_SNAPSHOT_DRIFT'});
 for(const query of [{limit:0},{limit:51},{cursor:'bad'},{extra:true},null])assert.throws(()=>compareReadSnapshots(before,after,query),{code:'READABLE_QUERY'});
 const empty=compareReadSnapshots(before,before);assert.equal(empty.totalChanges,0);assert.equal(empty.nextCursor,null);
 const oversized=snapshot([{...row('DECLARED'),details:{text:'x'.repeat(14000)}}]);
 assert.throws(()=>compareReadSnapshots(snapshot([]),oversized),{code:'READABLE_LIMIT'});
});
test('V07-E08.03 hostile presentation fields stay literal; cyclic and deeply nested JSON fail boundedly',()=>{
 const s=snapshot([{...row('PASS'),presentation:{section:'rules',cells:{name:'<img src=x onerror=alert(1)>',purpose:'[approve](javascript:x)\n| spoof |'}}}]);
 const html=renderReadSnapshot(s,'html'),md=renderReadSnapshot(s,'markdown');assert(!html.includes('<img'));assert(!html.includes('href='));assert(md.includes('\\[approve\\]'));assert(md.includes('\\| spoof \\|'));
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>readStable(cyclic),{code:'READABLE_INVALID_JSON'});
 let deep={};for(let i=0;i<70;i++)deep={child:deep};assert.throws(()=>readStable(deep),{code:'READABLE_LIMIT'});
});

test('V07-E02 bounded native preflight keeps the native validator timeout allowance',async()=>{
 const {connectionRequestTimeout,LIMITS}=await import('../../dist/integration/connection/config.js');
 for(const operation of ['preflight','freeze','materialize'])assert.equal(connectionRequestTimeout('native_project',{operation}),625000);
 assert.equal(connectionRequestTimeout('native_project',{operation:'inspect'}),LIMITS.request);
 assert.equal(connectionRequestTimeout('inspect',{}),LIMITS.request);
});
