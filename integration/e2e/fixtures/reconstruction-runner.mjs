import {createRuntimeService} from '@evopilot-next/runtime/service';
import {createLocalReconstructionAdapter} from '../../../dist/integration/usability/local-reconstruction.js';
import {usabilityDigest} from '../../../dist/integration/compatibility/usability/v1/contract.mjs';
const {options,root,input,request}=JSON.parse(process.argv[2]);
const adapter=createLocalReconstructionAdapter({root,resolve:async()=>input,verify:async plan=>({planDigest:usabilityDigest(plan),current:true})});
const runtime=createRuntimeService(options,adapter);runtime.initialize();await runtime.reconstruction(request);runtime.close();
