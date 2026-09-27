import {parentPort,workerData} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';

// Fixed trusted-artifact worker, not a sandbox for hostile code. Parent owns
// exact identity, deadlines, allowed calls and independent response comparison.
const sdk=await import(pathToFileURL(workerData.sdkEntry).href);
let sequence=0;
const transport={invoke:(tool,payload)=>new Promise((resolve,reject)=>{
  const id=++sequence,receive=message=>{
    if(message.id!==id)return;parentPort.off('message',receive);
    message.type==='response'?resolve(message.value):reject(new Error('SDK_RELAY_REFUSED'));
  };
  parentPort.on('message',receive);parentPort.postMessage({type:'invoke',id,tool,payload});
})};
try {
  const {operation,payload,decision}=workerData.input;
  const response=await sdk.executeExpertTurn(sdk.planExpertTurn('semantic execution '+operation,payload),transport,decision);
  const explanation=sdk.explainExpertSemanticExecutionResult(operation,response);
  parentPort.postMessage({type:'result',response,explanation});
} catch {
  parentPort.postMessage({type:'failure',code:'SDK_EXECUTION_FAILED'});
}
parentPort.close();
