import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {stageCompiledExpert} from '../helpers/isolated-compiled-expert.mjs';
import {bytesDigest,verifyInstalledExpertSdk} from '../e2e/versions/installed-transport.mjs';

// Source-build fixture identity only; no Candidate acceptance or SDK invocation.
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'compiled-expert-identity-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const installed=stageCompiledExpert(root,{scope:'source-build-identity-control'});
 const context=JSON.parse(installed.options.contextBytes);
 const options=()=>{
  const contextBytes=Buffer.from(JSON.stringify(context));
  return {contextBytes,expectedContextDigest:bytesDigest(contextBytes),sourceRoot:path.resolve('.')};
 };
 return {context,options};
}

test('compiled Expert fixture binds the actual package version without changing historical fixture defaults',t=>{
 const f=fixture(t),manifest=JSON.parse(fs.readFileSync('packages/evolution-expert/package.json'));
 assert.equal(f.context.version,manifest.version);
 assert.ok(['2.3.0','2.3.1'].includes(f.context.version));
 const verified=verifyInstalledExpertSdk(f.options());
 assert.equal(verified.identity.version,manifest.version);
 assert.equal(verified.identity.grantsAuthority,false);
});

test('compiled Expert transport rejects unsupported version even with a freshly hashed context',t=>{
 const f=fixture(t);f.context.version='2.3.2';
 assert.throws(()=>verifyInstalledExpertSdk(f.options()),/INSTALLED_VERSION_UNSUPPORTED/);
});

test('compiled Expert transport rejects allowed version mismatching its actual package',t=>{
 const f=fixture(t);f.context.version=f.context.version==='2.3.1'?'2.3.0':'2.3.1';
 assert.throws(()=>verifyInstalledExpertSdk(f.options()),/INSTALLED_PACKAGE_VERSION_MISMATCH/);
});
