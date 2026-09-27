import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {verifyInstalledRuntimeRecovery} from './installed-transport.mjs';
import {exactKeys,isId,probeDigest} from './probe-session.mjs';
import {runCompletionRecovery} from './runtime/6.3.0/recovery-journey.mjs';

const operations=Object.freeze(['completionReceipt','completionStatus']);
export function recoveryCliResult(operation,exitCode,stdout,stderr) {
  assert.ok(operations.includes(operation),'RECOVERY_OPERATION_DENIED');
  assert.equal(exitCode,0,'RECOVERY_CLI_REFUSED');assert.equal(stderr.trim(),'','RECOVERY_CLI_STDERR');
  assert.ok(Buffer.byteLength(stdout)<=1048576&&stdout.trim().length>0,'RECOVERY_RESPONSE_LIMIT');
  const value=JSON.parse(stdout);assert.ok(value&&typeof value==='object'&&!Array.isArray(value)&&isId(value.requestId),'RECOVERY_REQUEST_ID_REQUIRED');
  const {requestId,...data}=value;return {requestId,data};
}

/** Two read-only commands on exact external bytes. Neither the inventory nor
 * the callback establishes Candidate provenance or real campaign authority.
 * No completion mutation, fallback, retry or arbitrary CLI operation exists. */
export async function runInstalledRecovery({contextBytes,expectedContextDigest,inputBytes,authorizeInvocation,signal,timeoutMs=30000}) {
  signal?.throwIfAborted();assert.equal(typeof authorizeInvocation,'function','CAMPAIGN_AUTHORIZER_REQUIRED');
  assert.ok(Buffer.isBuffer(contextBytes)&&contextBytes.length<=8388608);
  assert.ok(Buffer.isBuffer(inputBytes)&&inputBytes.length<=4194304);
  const context=JSON.parse(contextBytes),input=JSON.parse(inputBytes);exactKeys(input,['frame']);
  assert.equal(probeDigest(input),context.probeInputDigest,'PROBE_INPUT_DIGEST_MISMATCH');
  const installed=verifyInstalledRuntimeRecovery({contextBytes,expectedContextDigest,sourceRoot:path.resolve(import.meta.dirname,'../../..')});
  const projectId=input.frame.scope.projectId,expected={identity:input.frame.identity,runId:input.frame.runId};
  assert.ok(Buffer.byteLength(JSON.stringify(expected))<=65536,'RECOVERY_PAYLOAD_LIMIT');
  const check=(operation,payload)=>{assert.ok(operations.includes(operation),'RECOVERY_OPERATION_DENIED');assert.deepEqual(payload,expected,'RECOVERY_PAYLOAD_DRIFT');};
  const authorizations=[],pending=new Set();let report;
  try {report=await runCompletionRecovery({...input,signal,timeoutMs,
    authorize:async({operation,payload},{signal})=>{
      check(operation,payload);signal.throwIfAborted();installed.verify();
      const frame={contextDigest:expectedContextDigest,acceptanceBindingDigest:context.acceptanceBindingDigest,inputDigest:context.probeInputDigest,
        projectId,operation,payloadDigest:probeDigest(payload),effect:'READ_RECOVERY_EVIDENCE'};
      const allowed=await authorizeInvocation(structuredClone(frame),{signal});
      signal.throwIfAborted();installed.verify();
      if(allowed===true)authorizations.push({operation,frameDigest:probeDigest(frame)});return allowed;
    },
    invoke:(operation,payload,{signal})=>{
      const task=(async()=>{
        check(operation,payload);signal.throwIfAborted();installed.verify();
        const config=installed.runtimeConfiguration(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'evopilot-recovery-request-'));
        const file=path.join(directory,'request.json'),bytes=Buffer.from(JSON.stringify(payload));
        try {
          fs.writeFileSync(file,bytes,{mode:0o600,flag:'wx'});signal.throwIfAborted();
          const response=await new Promise((resolve,reject)=>execFile(process.execPath,
            [installed.entry,'project','execution',operation,projectId,'--file',file,'--json',...config],
            {cwd:installed.root,signal,timeout:10000,maxBuffer:1048576,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',EVOPILOT_LOG_LEVEL:'error'}},
            (error,stdout,stderr)=>{
              if(error&&(!Number.isInteger(error.code)||error.killed||error.signal))return reject(new Error('RECOVERY_TRANSPORT_FAILED'));
              try{resolve(recoveryCliResult(operation,error?.code??0,stdout,stderr));}catch{reject(new Error('RECOVERY_RESPONSE_UNVERIFIED'));}
            }));
          signal.throwIfAborted();installed.verify();
          assert.equal(fs.lstatSync(file).isSymbolicLink(),false,'RECOVERY_REQUEST_SUBSTITUTED');
          assert.deepEqual(fs.readFileSync(file),bytes,'RECOVERY_REQUEST_DRIFT');return response;
        } finally {
          try{fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
          fs.rmdirSync(directory);
        }
      })();
      pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;
    }});
  } finally {await Promise.allSettled([...pending]);}
  return {...report,installation:installed.identity,authorizations,workBuddy:'NOT_OPERATED_OR_OBSERVED',
    provenance:'REQUIRES_INDEPENDENT_CAMPAIGN_VERIFICATION',requestIdSemantics:'HTTP_CORRELATION_ONLY'};
}
