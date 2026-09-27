import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { inventory } from '../host-integration/inventory.mjs';
import { digest } from '../host-integration/contracts.mjs';

const root = path.resolve(import.meta.dirname,'../host-integration');
if (!process.argv.includes('--inventory-only')) {
  if (process.platform !== 'darwin') throw new Error('Native compilation requires macOS; import the exact CI native artifact on other builders.');
  fs.mkdirSync(`${root}/dist/darwin-arm64`, {recursive:true});
  execFileSync('/usr/bin/xcrun', ['swiftc','-target','arm64-apple-macosx13.0','-O','-framework','AppKit',`${root}/native/PrivateInput.swift`,'-o',`${root}/dist/darwin-arm64/secure-input`], {stdio:'inherit'});
}
const files = inventory(root);
if (!files['dist/darwin-arm64/secure-input']) throw new Error('Required native artifact missing');
const manifest = {schema:'evopilot-expert-host-integration/v1',expertVersion:'2.3.0',runtimeVersion:'6.3.0',platforms:['darwin-arm64'],files};
const bytes = JSON.stringify(manifest,null,2)+'\n';
fs.writeFileSync(`${root}/manifest.json`,bytes);
console.log(JSON.stringify({status:'PASS',componentDigest:digest(bytes),fileCount:Object.keys(files).length}));
