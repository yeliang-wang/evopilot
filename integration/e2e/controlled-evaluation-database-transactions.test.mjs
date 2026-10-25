import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabaseEvaluationGateway,validatePreparedStatements,DatabaseExecutionRejected} from '../../dist/integration/usability/evaluation-database.js';
import {validateEvaluationPolicy} from '../compatibility/usability/v1/evaluation.mjs';
import {usabilityDigest as hash} from '../compatibility/usability/v1/contract.mjs';

function fixture(t,{transactionTargets=['a'],budget={}}={}){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'evopilot-db-transaction-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const nonce='c'.repeat(32),objects=['a','b'].map(id=>({id,name:'ep_eval_'+nonce+'_'+id,ownershipNonce:nonce})),templates=[],statements=[];
 function add(id,operation,objectIds,sql,parameters=[]){templates.push({id,sql});statements.push({id,operation,objectIds,templateDigest:hash(sql),parameters});}
 for(const o of objects){const name='test.'+o.name;add('create-'+o.id,'CREATE_TABLE',[o.id],'CREATE TABLE '+name+' (value INT)');add('insert-'+o.id,'INSERT',[o.id],'INSERT INTO '+name+' (value) VALUES (?)',[{kind:'INTEGER',minimum:0,maximum:100}]);add('read-'+o.id,'READ',[o.id],'SELECT value FROM '+name);add('drop-'+o.id,'DROP_TABLE',[o.id],'DROP TABLE '+name);}
 for(const op of ['BEGIN','COMMIT','ROLLBACK'])add(op.toLowerCase(),op,transactionTargets,op);
 add('commit-b','COMMIT',['b'],'COMMIT');
 const dependency={id:'database',kind:'BOUND_DATABASE',driverDigest:hash('synthetic-driver'),endpointDigest:hash('synthetic-endpoint'),route:'tp',namespace:'test',credentialRef:'credential-ref:synthetic',transportDigest:hash('transaction-transport'),qualificationDigest:hash('qualification'),objects,statements};
 const policy={schema:'evopilot-evaluation-policy/v1',phase:'EVALUATION',brokerDigest:hash('broker'),directNetwork:'DENY',originalSource:'DENY',hiddenOracle:'DENY',priorOutputs:'DENY',hostCredentials:'DENY',dependencies:[dependency]};
 const plan={schema:'evopilot-evaluation-plan/v1',workspaceId:'test',scope:{visibility:'private',projectId:'example'},reconstruction:{attemptId:'first',planDigest:hash('generation'),claimId:hash('claim'),receiptDigest:hash('receipt'),outputDigest:hash('output')},oracleDigest:hash('oracle'),environmentDigest:hash('environment'),dependenciesDigest:hash(dependency),provider:{id:'synthetic',version:'1',executableDigest:hash('binary'),configurationDigest:hash('config')},origin:'SYNTHETIC',policy,budget:{wallMs:5000,maxSessions:1,maxConnections:1,maxRows:100,maxOutputBytes:10000,maxOperations:100,...budget}};
 const body={workspaceId:plan.workspaceId,scope:plan.scope,sessionId:'test',planDigest:hash(plan),plan,ordinal:1,admittedAt:new Date().toISOString(),remaining:Object.fromEntries(Object.entries(plan.budget).filter(([k])=>k!=='maxSessions'))},claim={...body,claimId:hash(body)};
 const tables=new Map(),retained=new Map(),calls=[];let transaction=null,closed=false;
 const driver={...Object.fromEntries(['driverDigest','endpointDigest','transportDigest','qualificationDigest','route','namespace'].map(k=>[k,dependency[k]])),async open(ref){assert.equal(ref,'credential-ref:synthetic')},async inspectObject(name){return{exists:tables.has(name),ownershipNonce:tables.has(name)?nonce:null}},async inspectTransaction(id){return transaction?.id===id?transaction.state:'UNKNOWN'},async execute(request){
  calls.push(request);const value={rows:[],affectedRows:0},name=request.targets[0].name;
  if(request.operation==='BEGIN'){assert.equal(transaction,null);transaction={id:request.operationId,state:'ACTIVE',tables:new Map([...tables].map(([k,v])=>[k,[...v]]))};}
  else if(request.operation==='COMMIT'){assert.equal(transaction.id,request.transactionId);for(const[k,v]of transaction.tables)tables.set(k,v);transaction=null;}
  else if(request.operation==='ROLLBACK'){assert.equal(transaction.id,request.transactionId);transaction=null;}
  else {const target=transaction?.tables??tables;if(request.operation==='CREATE_TABLE')target.set(name,[]);else if(request.operation==='DROP_TABLE')target.delete(name);else if(request.operation==='INSERT'){target.get(name).push(request.parameters[0]);value.affectedRows=1}else if(request.operation==='READ')value.rows=target.get(name).map(n=>[n]);else assert.fail('Unexpected operation');}
  retained.set(request.operationId,value);return value;
 },async reconcile(id){return retained.get(id)??null},async close(){closed=true}};
 const options={root,claim,dependencyId:'database',templates,driver};
 return{options,dependency,policy,templates,driver,calls,retained,tables,closed:()=>closed,open:()=>createDatabaseEvaluationGateway(options),forgetSession:()=>{transaction=null},markFailed:()=>{transaction.state='FAILED'}};
}
async function setup(g){await g.call('create-a',{statementId:'create-a',parameters:[]});await g.call('create-b',{statementId:'create-b',parameters:[]});}
async function cleanup(g){await g.call('drop-a',{statementId:'drop-a',parameters:[]});await g.call('drop-b',{statementId:'drop-b',parameters:[]});await g.cleanup();}

test('transactions require explicit exact reviewed control statements and a session-aware driver',t=>{
 const f=fixture(t);assert.equal(validatePreparedStatements(f.dependency,f.templates).size,f.templates.length);
 for(const sql of ['BEGIN READ WRITE','BEGIN; COMMIT','COMMIT AND CHAIN','ROLLBACK TO x','BEGIN -- comment']){const d=structuredClone(f.dependency),templates=structuredClone(f.templates);d.statements.find(x=>x.id==='begin').templateDigest=hash(sql);templates.find(x=>x.id==='begin').sql=sql;assert.throws(()=>validatePreparedStatements(d,templates),{code:'EVALUATION_TEMPLATE'});}
 const policy=structuredClone(f.policy);policy.dependencies[0].statements.find(x=>x.id==='begin').parameters=[{kind:'INTEGER',minimum:0,maximum:1}];assert.throws(()=>validateEvaluationPolicy(policy,'test'),{code:'EVALUATION_PARAMETER'});
 delete f.driver.inspectTransaction;assert.throws(f.open,{code:'EVALUATION_TRANSACTIONS_UNQUALIFIED'});
});
test('transaction reads, rollback, commit, replay and versioned journal preserve actual effects',async t=>{
 const f=fixture(t),g=f.open();await setup(g);await g.call('tx-1',{statementId:'begin',parameters:[]});await g.call('i-1',{statementId:'insert-a',parameters:[11]});assert.deepEqual(await g.call('r-1',{statementId:'read-a',parameters:[]}),{rows:[[11]],affectedRows:0});assert.deepEqual(f.tables.get(f.dependency.objects[0].name),[]);
 await assert.rejects(g.cleanup(),{code:'EVALUATION_TRANSACTION_OPEN'});await g.call('rb-1',{statementId:'rollback',parameters:[]});assert.deepEqual(await g.call('r-2',{statementId:'read-a',parameters:[]}),{rows:[],affectedRows:0});
 await g.call('tx-2',{statementId:'begin',parameters:[]});await g.call('i-2',{statementId:'insert-a',parameters:[22]});await g.call('cm-2',{statementId:'commit',parameters:[]});const count=f.calls.length;await g.call('cm-2',{statementId:'commit',parameters:[]});assert.equal(f.calls.length,count);assert.deepEqual(await g.call('r-3',{statementId:'read-a',parameters:[]}),{rows:[[22]],affectedRows:0});
 await cleanup(g);assert.equal(g.inspect().schema,'evopilot-database-gateway-journal/v2');assert.deepEqual(g.inspect().transactions,[{beginId:'tx-1',endId:'rb-1',outcome:'ROLLBACK'},{beginId:'tx-2',endId:'cm-2',outcome:'COMMIT'}]);assert.equal(g.receipt().status,'SUCCEEDED');assert(f.closed());assert.deepEqual(f.open().receipt(),g.receipt());
});
test('active transaction cannot change object scope, nest, use DDL or mismatched completion',async t=>{
 const f=fixture(t),g=f.open();await setup(g);await assert.rejects(g.call('no-tx',{statementId:'commit',parameters:[]}),{code:'EVALUATION_TRANSACTION_STATE'});await g.call('tx',{statementId:'begin',parameters:[]});const count=f.calls.length;
 for(const id of ['begin','drop-a','create-a','insert-b'])await assert.rejects(g.call('denied-'+id,{statementId:id,parameters:id==='insert-b'?[1]:[]}),{code:'EVALUATION_TRANSACTION_STATE'});
 await assert.rejects(g.call('wrong-end',{statementId:'commit-b',parameters:[]}),{code:'EVALUATION_TRANSACTION_STATE'});assert.equal(f.calls.length,count);await g.call('end',{statementId:'rollback',parameters:[]});await cleanup(g);
});
test('multi-object transaction completes only its exact object set and charges every target',async t=>{
 const f=fixture(t,{transactionTargets:['a','b']}),g=f.open();await setup(g);await g.call('tx',{statementId:'begin',parameters:[]});await g.call('a',{statementId:'insert-a',parameters:[1]});await g.call('b',{statementId:'insert-b',parameters:[2]});await assert.rejects(g.call('partial-end',{statementId:'commit-b',parameters:[]}),{code:'EVALUATION_TRANSACTION_SCOPE'});await g.call('end',{statementId:'commit',parameters:[]});await cleanup(g);const receipt=g.receipt();assert.equal(receipt.status,'SUCCEEDED');assert(receipt.usage.operations>=receipt.effects.length);assert.equal(g.inspect().transaction,null);
});
test('lost commit reply stays UNKNOWN across restart, without replay or optimistic rollback',async t=>{
 const f=fixture(t),execute=f.driver.execute;let commitId;
 f.driver.execute=async r=>{const v=await execute(r);if(r.operation==='COMMIT'){commitId=r.operationId;f.retained.delete(commitId);throw Error('lost response containing secret')}return v};let g=f.open();await setup(g);await g.call('tx',{statementId:'begin',parameters:[]});await g.call('i',{statementId:'insert-a',parameters:[3]});await assert.rejects(g.call('commit',{statementId:'commit',parameters:[]}),{code:'EVALUATION_DRIVER_ERROR'});const count=f.calls.length;g=f.open();
 for(const [id,statementId]of [['commit','commit'],['new-commit','commit'],['rollback','rollback'],['read','read-a']])await assert.rejects(g.call(id,{statementId,parameters:[]}),{code:'EVALUATION_WRITE_UNKNOWN'});
 assert.equal(await g.reconcile('commit'),null);assert.equal(f.calls.length,count);assert.equal(g.receipt().usage.rows,null);assert.equal(g.receipt().status,'FAILED');await assert.rejects(g.cleanup());
 f.retained.set(commitId,{rows:[],affectedRows:0});await g.reconcile('commit');assert.equal(f.calls.length,count);await cleanup(g);assert.equal(g.receipt().status,'SUCCEEDED');
});
test('a new driver connection cannot impersonate the original live transaction',async t=>{
 const f=fixture(t);let g=f.open();await setup(g);await g.call('tx',{statementId:'begin',parameters:[]});f.forgetSession();g=f.open();const count=f.calls.length;await assert.rejects(g.call('write',{statementId:'insert-a',parameters:[5]}),{code:'EVALUATION_TRANSACTION_UNKNOWN'});assert.equal(f.calls.length,count);assert.equal(g.inspect().transaction.state,'UNKNOWN');await assert.rejects(g.call('rollback',{statementId:'rollback',parameters:[]}),{code:'EVALUATION_TRANSACTION_UNKNOWN'});await assert.rejects(g.cleanup(),{code:'EVALUATION_TRANSACTION_OPEN'});assert.equal(g.receipt().status,'FAILED');
});
test('only the matching active operation can be cancelled; known server rejection requires rollback',async t=>{
 const f=fixture(t),execute=f.driver.execute;let started;const entered=new Promise(r=>started=r);f.driver.execute=async(r,signal)=>{if(r.operation==='READ'){started();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{f.markFailed();reject(new DatabaseExecutionRejected(r.operationId,'57014',hash('actual-synthetic-error-frame')))}, {once:true}));}return execute(r)};
 const g=f.open();await setup(g);await g.call('tx',{statementId:'begin',parameters:[]});const pending=g.call('waiting',{statementId:'read-a',parameters:[]});await entered;assert.throws(()=>g.cancelActive('foreign'),{code:'EVALUATION_OPERATION_NOT_ACTIVE'});assert.deepEqual(g.cancelActive('waiting'),{operationId:'waiting',cancelRequested:true});assert.deepEqual(g.cancelActive('waiting'),{operationId:'waiting',cancelRequested:true});await assert.rejects(pending,{code:'EVALUATION_EXECUTION_REJECTED'});
 assert.equal(g.inspect().transaction.state,'FAILED');const count=f.calls.length;await assert.rejects(g.call('waiting',{statementId:'read-a',parameters:[]}),{code:'EVALUATION_EXECUTION_REJECTED'});await assert.rejects(g.call('commit',{statementId:'commit',parameters:[]}),{code:'EVALUATION_TRANSACTION_STATE'});assert.equal(f.calls.length,count);await g.call('rollback',{statementId:'rollback',parameters:[]});await cleanup(g);assert.equal(g.receipt().status,'SUCCEEDED');assert(g.receipt().effects.every(e=>e.outcome==='CONFIRMED'));
});
test('connection failures and mismatched driver rejections never become definitive SQL failures',async t=>{
 assert.throws(()=>new DatabaseExecutionRejected('id','08006',hash('error')),{code:'EVALUATION_DRIVER_RESULT'});
 const f=fixture(t),execute=f.driver.execute;f.driver.execute=async r=>{if(r.operation==='READ')throw new DatabaseExecutionRejected('foreign-operation','57014',hash('foreign'));return execute(r)};const g=f.open();await setup(g);await assert.rejects(g.call('read',{statementId:'read-a',parameters:[]}),{code:'EVALUATION_DRIVER_ERROR'});assert.equal(g.inspect().entries.find(x=>x.id==='read').status,'UNKNOWN');assert.equal(g.receipt().status,'FAILED');
});


test('reconciled DML resumes only after the original live transaction is verified',async t=>{
 const f=fixture(t),execute=f.driver.execute;f.driver.execute=async r=>{const value=await execute(r);if(r.operation==='INSERT')throw Error('reply lost');return value};let g=f.open();await setup(g);await g.call('tx',{statementId:'begin',parameters:[]});await assert.rejects(g.call('insert',{statementId:'insert-a',parameters:[9]}));assert.equal(g.inspect().transaction.state,'UNKNOWN');const count=f.calls.length;g=f.open();assert.deepEqual(await g.reconcile('insert'),{rows:[],affectedRows:1});assert.equal(f.calls.length,count);assert.equal(g.inspect().transaction.state,'ACTIVE');await g.call('end',{statementId:'commit',parameters:[]});await cleanup(g);assert.equal(g.receipt().status,'SUCCEEDED');
});
test('invalid transaction acknowledgement stays unknown and cannot establish cleanup',async t=>{
 const f=fixture(t),execute=f.driver.execute;f.driver.execute=async r=>{const value=await execute(r);return r.operation==='BEGIN'?{rows:[[1]],affectedRows:0}:value};const g=f.open();await setup(g);await assert.rejects(g.call('tx',{statementId:'begin',parameters:[]}),{code:'EVALUATION_DRIVER_RESULT'});assert.equal(g.inspect().entries.find(e=>e.id==='tx').status,'UNKNOWN');await assert.rejects(g.cleanup());assert.equal(g.receipt().status,'FAILED');
});
