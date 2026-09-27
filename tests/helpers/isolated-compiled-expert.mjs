import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {bytesDigest} from '../e2e/versions/installed-transport.mjs';
import {probeDigest} from '../e2e/versions/probe-session.mjs';

// Source-build integration fixture only: no release build, publication, npm
// scripts, network install or real Host qualification is performed here.
export function stageCompiledExpert(root,input){
 const installationRoot=path.join(root,'compiled-installation');
 assert.equal(fs.existsSync(installationRoot),false,'COMPILED_FIXTURE_MUST_BE_FRESH');
 for(const name of ['contracts','evolution-expert']){
  const source=path.resolve('packages',name),dest=path.join(installationRoot,'node_modules/@evopilot',name);
  fs.mkdirSync(dest,{recursive:true});fs.copyFileSync(path.join(source,'package.json'),path.join(dest,'package.json'));
  fs.cpSync(path.join(source,'dist'),path.join(dest,'dist'),{recursive:true,dereference:false});
 }
 const files=[];function visit(rel=''){
  for(const n of fs.readdirSync(path.join(installationRoot,rel)).sort()){
   const name=path.posix.join(rel,n),file=path.join(installationRoot,name),stat=fs.lstatSync(file);assert.equal(stat.isSymbolicLink(),false);
   if(stat.isDirectory())visit(name);else files.push({path:name,digest:bytesDigest(fs.readFileSync(file))});
  }
 }visit();
 const context={schema:'evopilot-installed-expert-sdk-context/v1',product:'expert',version:'2.3.0',installationRoot,files,artifactSetDigest:probeDigest(files),acceptanceBindingDigest:probeDigest('source-build-test-not-candidate'),probeInputDigest:probeDigest(input)};
 const contextBytes=Buffer.from(JSON.stringify(context));return {installationRoot,options:{contextBytes,expectedContextDigest:bytesDigest(contextBytes),inputBytes:Buffer.from(JSON.stringify(input))}};
}
