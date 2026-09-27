import {parentPort,workerData} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {capabilityRequiredMessage} from '../../runtime/6.3.0/capability-probe.mjs';

// The parent verifies the complete installation before starting this fixed
// worker. No source fallback, arbitrary script, credentials or CLI transport.
const sdk=await import(pathToFileURL(workerData.sdkEntry).href);
let sequence=0;
const transport={invoke:(tool,payload)=>new Promise((resolve,reject)=>{
  const id=++sequence;
  const receive=message=>{if(message.id!==id)return;parentPort.off('message',receive);
    message.type==='response'?resolve(message.value):reject(new Error('SDK_RELAY_REFUSED'));};
  parentPort.on('message',receive);parentPort.postMessage({type:'invoke',id,tool,payload});
})};
try {
  const {operation,text,payload,decision}=workerData.input;
  const response=await sdk.executeExpertTurn(sdk.planExpertTurn(text,payload),transport,decision);
  const explanation=sdk.explainExpertSemanticResult(operation,response);
  parentPort.postMessage({type:'result',response,explanation});
} catch(error) {
  // Never forward arbitrary error text, stack or credentials into evidence.
  parentPort.postMessage({type:'failure',code:error instanceof Error&&error.message===capabilityRequiredMessage?'SEMANTIC_CAPABILITY_REQUIRED':'SDK_OPERATION_FAILED'});
}
parentPort.close();
