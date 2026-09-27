import {parentPort,workerData} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
const sdk=await import(pathToFileURL(workerData.sdkEntry).href);
try{
  const {text,payload,decision}=workerData.turn;
  const response=await sdk.executeExpertTurn(sdk.planExpertTurn(text,payload),{invoke:(tool,payload)=>new Promise((resolve,reject)=>{
    parentPort.once('message',message=>message.type==='response'?resolve(message.value):reject(Error('RELAY_REFUSED')));
    parentPort.postMessage({type:'invoke',tool,payload});
  })},decision);
  parentPort.postMessage({type:'result',response});
}catch{parentPort.postMessage({type:'failure',code:'PROJECT_SDK_TURN_FAILED'});}
parentPort.close();
