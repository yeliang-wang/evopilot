import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createComposition,loadInstalledProducts} from '../../../dist/integration/composition.js';
import {syntheticAuthoring} from './authoring.mjs';
import {syntheticDecisionEvidence} from './decision-evidence.mjs';
import {syntheticHarnessPackage} from '../../../projects/evopilot-harness/examples/native/package.mjs';
import {nativePackage} from '../../../projects/evopilot-ontology/tests/fixtures/native/package.mjs';
export const token='synthetic_test_token_for_asset_service_00000001';
export const digest=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
export async function consumptionFixture(t){
  const root=fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()),'evopilot-consumer-')),options={workspaceRoot:path.join(root,'state'),workspaceId:'synthetic-consumer'},scope={visibility:'private',projectId:'synthetic-one'};
  const toolchain=JSON.parse(fs.readFileSync(process.env.EVOPILOT_TEST_NATIVE_TOOLCHAIN));
  const api=createComposition(options,await loadInstalledProducts(),{},{toolchain,resolveNativeAuthoring:syntheticAuthoring});
  const refs=[];
  for(const [owner,pkg]of [['harness',syntheticHarnessPackage()],['ontology',nativePackage()]]){
    const identity={id:pkg.manifest.id,version:pkg.manifest.version},write=(operation,input,id)=>api.native(owner,{operation,scope,input,requestId:id,expectedRevision:api.inspect(owner,scope).revision});
    await write('native.package.put',{package:pkg},'put-'+owner);await write('native.package.validate',identity,'validate-'+owner);const review=(await write('native.package.review',identity,'review-'+owner)).result;
    const humanEvidenceRef=syntheticDecisionEvidence(root,{owner,operation:'native.package.decide',workspaceId:options.workspaceId,scope,reviewDigest:review.reviewDigest,decision:'APPROVE'});
    await write('native.package.decide',{...identity,reviewDigest:review.reviewDigest,decision:'APPROVE',humanEvidenceRef},'decide-'+owner);const published=await write('native.package.publish',identity,'publish-'+owner);refs.push(published.result.reference);
  }
  const auth={schema:'evopilot-asset-authorization/v1',credentials:[{id:'synthetic-client',tokenDigest:digest(token),enabled:true,grants:[{scope,assets:refs,inventories:[],assessments:[]}]}]};
  const authFile=path.join(root,'auth.json'),configFile=path.join(root,'service.json'),toolFile=path.join(root,'tools.json');
  const saveAuth=()=>fs.writeFileSync(authFile,JSON.stringify(auth),{mode:0o600});saveAuth();fs.writeFileSync(toolFile,JSON.stringify(toolchain),{mode:0o600});
  fs.writeFileSync(configFile,JSON.stringify({schema:'evopilot-asset-service/v1',...options,host:'127.0.0.1',port:0,tls:null,authorizationFile:authFile,toolchainFile:toolFile}),{mode:0o600});
  t.after(()=>{api.close();fs.rmSync(root,{recursive:true,force:true});});
  return{root,options,scope,api,refs,auth,saveAuth,authFile,configFile,token};
}
