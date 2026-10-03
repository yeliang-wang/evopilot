import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {bytesDigest} from '../e2e/versions/installed-transport.mjs';
import {probeDigest} from '../e2e/versions/probe-session.mjs';
const require=createRequire(import.meta.url);

// Isolated compiled source packages, including real CLI dependencies. This
// fixture is not a frozen release Candidate or a qualified Agent execution.
export function stageCompiledRuntime(root,input,server,token){
 const installationRoot=path.join(root,'compiled-runtime');assert.equal(fs.existsSync(installationRoot),false);
 for(const name of ['contracts','client','cli']){
  const source=path.resolve('packages',name),dest=path.join(installationRoot,'node_modules/@evopilot',name);
  fs.mkdirSync(dest,{recursive:true});fs.copyFileSync(path.join(source,'package.json'),path.join(dest,'package.json'));
  fs.cpSync(path.join(source,'dist'),path.join(dest,'dist'),{recursive:true,dereference:false});
 }
 const yaml=path.dirname(require.resolve('yaml/package.json'));
 fs.cpSync(yaml,path.join(installationRoot,'node_modules/yaml'),{recursive:true,dereference:false});
 const files=[];function visit(rel=''){
  for(const n of fs.readdirSync(path.join(installationRoot,rel)).sort()){
   const name=path.posix.join(rel,n),file=path.join(installationRoot,name),stat=fs.lstatSync(file);assert.equal(stat.isSymbolicLink(),false);
   if(stat.isDirectory())visit(name);else files.push({path:name,digest:bytesDigest(fs.readFileSync(file))});
  }
 }visit();
 const configFile=path.join(root,'compiled-cli-config.json'),config=JSON.stringify({token});fs.writeFileSync(configFile,config,{mode:0o600,flag:'wx'});
 const version=JSON.parse(fs.readFileSync(path.join(installationRoot,'node_modules/@evopilot/cli/package.json'),'utf8')).version;
 const context={schema:'evopilot-installed-runtime-execution-context/v1',product:'runtime',version,installationRoot,files,artifactSetDigest:probeDigest(files),acceptanceBindingDigest:probeDigest('source-build-test-not-candidate'),probeInputDigest:probeDigest(input),server,configFile,configDigest:bytesDigest(config)};
 const contextBytes=Buffer.from(JSON.stringify(context));return {contextBytes,expectedContextDigest:bytesDigest(contextBytes),inputBytes:Buffer.from(JSON.stringify(input))};
}
