import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {verifyInstalledRuntimeExecution} from './installed-transport.mjs';
import {exactKeys,isId,probeDigest} from './probe-session.mjs';
import {runReviewedExecutionJourney} from './runtime/6.3.0/execution-journey.mjs';

const effects=Object.freeze({resolve:'READ_CONTEXT',review:'PREPARE_OUTCOME_REVIEW',approveReview:'APPROVE_OUTCOME_REVIEW',
  dispatch:'DISPATCH_EXECUTION',collect:'COLLECT_EXECUTION_EVIDENCE',evaluate:'EVALUATE_EXECUTION_OUTCOMES'});

/** CLI preserves an intrinsic dispatch requestId instead of attaching the HTTP
 * requestId. Never strip that governed Agent identity or invent an HTTP id. */
export function executionCliResult(operation,exitCode,stdout,stderr) {
  assert.ok(Object.hasOwn(effects,operation),'EXECUTION_OPERATION_DENIED');
  assert.equal(exitCode,0,'EXECUTION_CLI_REFUSED');assert.equal(stderr.trim(),'','EXECUTION_CLI_STDERR');
  assert.ok(Buffer.byteLength(stdout)<=1048576&&stdout.trim().length>0,'EXECUTION_CLI_RESPONSE_LIMIT');
  const value=JSON.parse(stdout);assert.ok(value&&typeof value==='object'&&!Array.isArray(value)&&isId(value.requestId),'EXECUTION_REQUEST_ID_REQUIRED');
  if(operation==='dispatch')return {requestId:value.requestId,data:value};
  const {requestId,...data}=value;return {requestId,data};
}

/** Programmatic only; exact external authority and artifact provenance must
 * already exist. Does not install, prepare/bind a new execution, run arbitrary
 * CLI, complete/advance/release, or repeat an uncertain invocation. */
export async function runInstalledExecution({contextBytes,expectedContextDigest,inputBytes,authorizeInvocation,signal,timeoutMs=30000}) {
  assert.ok(Buffer.isBuffer(contextBytes)&&contextBytes.length<=8388608);
  assert.ok(Buffer.isBuffer(inputBytes)&&inputBytes.length<=4194304);
  assert.equal(typeof authorizeInvocation,'function','CAMPAIGN_AUTHORIZER_REQUIRED');
  const context=JSON.parse(contextBytes),input=JSON.parse(inputBytes);exactKeys(input,['frame','decision']);
  assert.equal(probeDigest(input),context.probeInputDigest,'PROBE_INPUT_DIGEST_MISMATCH');
  const installed=verifyInstalledRuntimeExecution({contextBytes,expectedContextDigest,sourceRoot:path.resolve(import.meta.dirname,'../../..')});
  const projectId=input.frame.scope.projectId;
  const base={identity:input.frame.identity,bindingDigest:input.frame.binding.bindingDigest};
  const expected={resolve:base,review:{...base,coverage:input.frame.review.coverage},
    approveReview:{...base,decision:'APPROVE',reviewDigest:input.decision.reviewDigest},dispatch:base,collect:base,evaluate:base};
  // Preflight every payload before even a read, rather than encountering a
  // request-size failure only after a previous mutation was sent.
  for(const payload of Object.values(expected))assert.ok(Buffer.byteLength(JSON.stringify(payload))<=65536,'EXECUTION_PAYLOAD_LIMIT');
  const check=(operation,payload)=>{
    assert.ok(Object.hasOwn(expected,operation),'EXECUTION_OPERATION_DENIED');
    assert.deepEqual(payload,expected[operation],'EXECUTION_PAYLOAD_DRIFT');
  };
  const authorizations=[],pending=new Set();let report;
  try {report=await runReviewedExecutionJourney({...input,signal,timeoutMs,
    authorize:async({operation,payload},{signal})=>{
      check(operation,payload);signal.throwIfAborted();installed.verify();
      const frame={contextDigest:expectedContextDigest,acceptanceBindingDigest:context.acceptanceBindingDigest,
        inputDigest:context.probeInputDigest,projectId,operation,payloadDigest:probeDigest(payload),effect:effects[operation]};
      const allowed=await authorizeInvocation(structuredClone(frame),{signal});
      signal.throwIfAborted();installed.verify();
      if(allowed===true)authorizations.push({operation,frameDigest:probeDigest(frame)});
      return allowed;
    },
    invoke:(operation,payload,{signal})=>{
      const task=(async()=>{
      check(operation,payload);signal.throwIfAborted();installed.verify();
      const config=installed.runtimeConfiguration(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'evopilot-execution-request-'));
      const file=path.join(directory,'request.json'),bytes=Buffer.from(JSON.stringify(payload));
      try {
        fs.writeFileSync(file,bytes,{mode:0o600,flag:'wx'});
        const args=[installed.entry,'project','execution',operation,projectId,'--file',file,'--json',...config];
        signal.throwIfAborted();
        const response=await new Promise((resolve,reject)=>execFile(process.execPath,args,
          {cwd:installed.root,signal,timeout:10000,maxBuffer:1048576,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',EVOPILOT_LOG_LEVEL:'error'}},
          (error,stdout,stderr)=>{
            if(error&&(!Number.isInteger(error.code)||error.killed||error.signal))return reject(new Error('EXECUTION_TRANSPORT_FAILED'));
            try{resolve(executionCliResult(operation,error?.code??0,stdout,stderr));}catch{reject(new Error('EXECUTION_RESPONSE_UNVERIFIED'));}
          }));
        signal.throwIfAborted();installed.verify();
        assert.equal(fs.lstatSync(file).isSymbolicLink(),false,'EXECUTION_REQUEST_SUBSTITUTED');
        assert.deepEqual(fs.readFileSync(file),bytes,'EXECUTION_REQUEST_DRIFT');return response;
      } finally {
        // Only the runner-created file and then its empty private directory;
        // never recursively remove unexpected files created by an executable.
        try{fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
        fs.rmdirSync(directory);
      }
      })();
      pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;
    }});
  } finally {await Promise.allSettled([...pending]);}
  return {...report,installation:installed.identity,authorizations,
    requestIdSemantics:'DISPATCH_AGENT_EXECUTION_ID_OTHER_OPERATIONS_HTTP_CORRELATION',
    httpDispatchCorrelation:'REQUIRES_INDEPENDENT_TRANSPORT_EVIDENCE'};
}
