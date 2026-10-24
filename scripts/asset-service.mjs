#!/usr/bin/env node
import {startAssetService} from '../dist/integration/consumption/service.js';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--config'){
  process.stderr.write('Usage: node scripts/asset-service.mjs --config /absolute/private-config.json\n');process.exitCode=2;
}else{
  try{
    const service=await startAssetService(args[1]);
    process.stdout.write(JSON.stringify({status:'READY',...service.address,readOnly:true})+'\n');
    let closing=false;const stop=()=>{if(closing)return;closing=true;service.close().then(()=>{process.exitCode=0;},()=>{process.stderr.write('Asset service shutdown failed\n');process.exitCode=1;});};
    process.once('SIGTERM',stop);process.once('SIGINT',stop);
  }catch{process.stderr.write('Asset service configuration or startup failed; inspect the explicit local configuration.\n');process.exitCode=1;}
}
