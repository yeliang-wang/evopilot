import {parentPort,workerData} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';

// Trusted-artifact worker, not a security sandbox. Parent pins the complete
// inventory and validates every call and each independently observed response.
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
  for(const operation of ['completionReceipt','completionStatus']){
    const response=await sdk.executeExpertTurn(sdk.planExpertTurn('semantic execution '+operation,workerData.payload),transport);
    const explanation=sdk.explainExpertSemanticExecutionResult(operation,response);
    parentPort.postMessage({type:'result',operation,response,explanation});
  }
} catch {parentPort.postMessage({type:'failure',code:'SDK_RECOVERY_FAILED'});}
parentPort.close();
