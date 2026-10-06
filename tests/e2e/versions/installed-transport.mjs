import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {exactKeys,isDigest,probeDigest} from './probe-session.mjs';
import {expertCliResult} from './expert-cli-result.mjs';
import {runtimeRefusalCliResult} from './runtime/6.3.0/refusal-probe.mjs';
import {runtimeCapabilityCliResult} from './runtime/6.3.0/capability-probe.mjs';

export const bytesDigest = value => 'sha256:' + crypto.createHash('sha256').update(value).digest('hex');
const packages = {
  runtime:{name:'@evopilot/cli',versions:['6.3.0','6.3.1','6.3.2','6.3.3'],entry:'dist/index.js'},
  expert:{name:'@evopilot/evolution-expert',versions:['2.3.0'],entry:'dist/cli.js'}
};
function safeRelative(relative) {
  assert.ok(typeof relative==='string' && relative.length<=1024 && !path.isAbsolute(relative) &&
    /^[a-zA-Z0-9@_.+/-]+$/.test(relative) && relative.split('/').every(p=>p && p!=='.' && p!=='..'),'INSTALLED_PATH_INVALID');
}
function outside(child,parent) {const rel=path.relative(parent,child);assert.ok(rel.startsWith('..'+path.sep)||rel==='..'||path.isAbsolute(rel),'INSTALLATION_MUST_BE_EXTERNAL');}
function fileBytes(file,max=33554432) {
  const stat=fs.lstatSync(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=max,'INSTALLED_FILE_INVALID');
  return fs.readFileSync(file);
}
function tree(root) {
  let total=0,entries=0;const files=[];
  const visit=(relative,depth)=>{
    assert.ok(depth<=32,'INSTALLED_DEPTH_LIMIT');
    for(const name of fs.readdirSync(path.join(root,relative)).sort()) {
      assert.ok(++entries<=32768,'INSTALLED_ENTRY_LIMIT');
      const rel=path.posix.join(relative,name);safeRelative(rel);assert.notEqual(name,'.git','SOURCE_CHECKOUT_NOT_ALLOWED');
      const file=path.join(root,rel),stat=fs.lstatSync(file);assert.ok(!stat.isSymbolicLink(),'INSTALLED_SYMLINK_REJECTED');
      if(stat.isDirectory())visit(rel,depth+1);
      else {total+=stat.size;assert.ok(total<=536870912,'INSTALLED_BYTES_LIMIT');files.push({path:rel,digest:bytesDigest(fileBytes(file))});}
    }
  };
  visit('',0);return files.sort((a,b)=>a.path.localeCompare(b.path));
}

/** Mechanical installation identity check, NOT a Candidate/Host authorization.
 * The external campaign must independently prove that this complete inventory
 * came from the accepted artifacts, including every Runtime dependency. */
export function createInstalledProbeTransport({contextBytes,expectedContextDigest,sourceRoot,refusalMode=false,capabilityMode=false}) {
  return createTransport({contextBytes,expectedContextDigest,sourceRoot,refusalMode,capabilityMode});
}

/** Only a separately verified campaign may supply this effect-authorization
 * callback. Context digests and callback presence do not prove authorization. */
export function createInstalledBindingTransport(options) {
  assert.equal(typeof options.authorizeInvocation,'function','CAMPAIGN_AUTHORIZER_REQUIRED');
  return createTransport(options);
}
export function createInstalledTransitionTransport(options) {
  assert.equal(typeof options.authorizeInvocation,'function','CAMPAIGN_AUTHORIZER_REQUIRED');
  return createTransport({...options,transitionMode:true});
}
// Identity only: the SDK runner separately owns its narrow MCP relay and effect
// authorization. This is neither an installer nor proof of artifact provenance.
export function verifyInstalledExpertSdk(options) {
  return createTransport({...options,sdkMode:true,authorizeInvocation:undefined});
}
export function verifyInstalledExpertExecutionSdk(options) {
  return createTransport({...options,sdkMode:true,executionSdkMode:true,authorizeInvocation:undefined});
}
export function verifyInstalledExpertRecoverySdk(options) {
  return createTransport({...options,sdkMode:true,recoverySdkMode:true,authorizeInvocation:undefined});
}
// Identity/configuration only. The separate execution bridge owns its fixed
// operation sequence and per-call campaign authority; no raw CLI is exposed.
export function verifyInstalledRuntimeExecution(options) {
  return createTransport({...options,executionMode:true,authorizeInvocation:undefined});
}
export function verifyInstalledRuntimeRecovery(options) {
  return createTransport({...options,recoveryMode:true,authorizeInvocation:undefined});
}
function createTransport({contextBytes,expectedContextDigest,sourceRoot,authorizeInvocation,sdkMode=false,transitionMode=false,refusalMode=false,capabilityMode=false,executionMode=false,executionSdkMode=false,recoveryMode=false,recoverySdkMode=false}) {
  assert.ok(Buffer.isBuffer(contextBytes)&&contextBytes.length<=8388608,'CONTEXT_SIZE_LIMIT');
  assert.ok(isDigest(expectedContextDigest)&&bytesDigest(contextBytes)===expectedContextDigest,'CONTEXT_DIGEST_MISMATCH');
  const context=JSON.parse(contextBytes);
  assert.ok(Object.hasOwn(packages,context.product),'PROBE_PRODUCT_INVALID');
  const extra=context.product==='runtime'?['configFile','configDigest','server']:[];
  exactKeys(context,['schema','product','version','installationRoot','files','artifactSetDigest','acceptanceBindingDigest','probeInputDigest',...extra]);
  const bindingMode=typeof authorizeInvocation==='function';
  if(recoverySdkMode){assert.equal(context.product,'expert');assert.equal(sdkMode,true);assert.equal(bindingMode||transitionMode||refusalMode||capabilityMode||executionMode||executionSdkMode||recoveryMode,false);}
  if(recoveryMode){assert.equal(context.product,'runtime');assert.equal(bindingMode||sdkMode||transitionMode||refusalMode||capabilityMode||executionMode||executionSdkMode,false);}
  if(executionMode){assert.equal(context.product,'runtime');assert.equal(bindingMode||sdkMode||transitionMode||refusalMode||capabilityMode,false);}
  if(executionSdkMode){assert.equal(context.product,'expert');assert.equal(sdkMode,true);assert.equal(bindingMode||transitionMode||refusalMode||capabilityMode||executionMode,false);}
  if(refusalMode){assert.equal(context.product,'runtime');assert.equal(bindingMode||sdkMode||transitionMode,false);}
  if(capabilityMode){assert.equal(context.product,'runtime');assert.equal(bindingMode||sdkMode||transitionMode||refusalMode,false);}
  assert.equal(context.schema,recoverySdkMode?'evopilot-installed-expert-recovery-sdk-context/v1':recoveryMode?'evopilot-installed-runtime-recovery-context/v1':executionMode?'evopilot-installed-runtime-execution-context/v1':executionSdkMode?'evopilot-installed-expert-execution-sdk-context/v1':sdkMode?'evopilot-installed-expert-sdk-context/v1':transitionMode?'evopilot-installed-runtime-transition-context/v1':bindingMode?'evopilot-installed-runtime-binding-context/v1':'evopilot-installed-readonly-probe-context/v1');
  if(bindingMode)assert.equal(context.product,'runtime','RUNTIME_BINDING_ONLY');
  if(sdkMode)assert.equal(context.product,'expert','EXPERT_SDK_ONLY');
  const spec=packages[context.product];assert.ok(spec.versions.includes(context.version),'INSTALLED_VERSION_UNSUPPORTED');
  assert.ok([context.artifactSetDigest,context.acceptanceBindingDigest,context.probeInputDigest].every(isDigest),'EXTERNAL_BINDING_REFERENCE_REQUIRED');
  assert.ok(path.isAbsolute(context.installationRoot)&&path.isAbsolute(sourceRoot),'ABSOLUTE_ROOT_REQUIRED');
  const root=fs.realpathSync(context.installationRoot),source=fs.realpathSync(sourceRoot);outside(root,source);outside(source,root);
  assert.ok(Array.isArray(context.files)&&context.files.length>0&&context.files.length<=32768,'INSTALLED_INVENTORY_INVALID');
  const seen=new Set();
  for(const item of context.files){exactKeys(item,['path','digest']);safeRelative(item.path);assert.ok(isDigest(item.digest)&&!seen.has(item.path),'INSTALLED_INVENTORY_INVALID');seen.add(item.path);}
  const expected=[...context.files].sort((a,b)=>a.path.localeCompare(b.path));
  const verify=()=>assert.deepEqual(tree(root),expected,'INSTALLED_INVENTORY_DRIFT');verify();
  const packageRoot=path.join(root,'node_modules',spec.name);
  const manifest=JSON.parse(fileBytes(path.join(packageRoot,'package.json')));
  assert.equal(manifest.name,spec.name);assert.equal(manifest.version,context.version);
  const entry=path.join(packageRoot,spec.entry);fileBytes(entry);
  const identity=Object.freeze({contextDigest:expectedContextDigest,artifactSetDigest:context.artifactSetDigest,
    acceptanceBindingDigest:context.acceptanceBindingDigest,product:context.product,version:context.version,
    artifactProvenance:'REQUIRES_INDEPENDENT_CAMPAIGN_VERIFICATION',grantsAuthority:false});
  if(sdkMode){const sdkEntry=path.join(packageRoot,'dist/index.js');fileBytes(sdkEntry);return Object.freeze({identity,root,sdkEntry,verify});}
  const runtimeConfiguration=()=>{
    assert.ok(path.isAbsolute(context.configFile)&&isDigest(context.configDigest),'RUNTIME_CONFIG_BINDING_REQUIRED');
    const config=fs.realpathSync(context.configFile);outside(config,root);
    assert.equal(bytesDigest(fileBytes(config,1048576)),context.configDigest,'RUNTIME_CONFIG_DRIFT');
    assert.equal(fs.statSync(config).mode&0o077,0,'PRIVATE_RUNTIME_CONFIG_REQUIRED');
    const server=new URL(context.server);
    assert.ok(!server.username&&!server.password&&!server.search&&!server.hash&&server.pathname==='/'&&
      (server.protocol==='https:'||(server.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(server.hostname))),'RUNTIME_ORIGIN_INVALID');
    return ['--server',server.origin,'--config',config];
  };
  if(context.product==='runtime')runtimeConfiguration();
  if(executionMode||recoveryMode)return Object.freeze({identity,root,entry,verify:()=>{verify();runtimeConfiguration();},runtimeConfiguration});
  const allowed=args=>{
    assert.ok(Array.isArray(args)&&args.every(x=>typeof x==='string'),'PROBE_COMMAND_INVALID');
    if(refusalMode)assert.ok(['inspect','compatibility'].includes(args[2]),'RC03_READ_ONLY_COMMAND_REQUIRED');
    if(transitionMode) {
      assert.equal(args[0],'project');assert.equal(args[1],'semantic');assert.match(args[3],/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/);
      const suffix=args.slice(4);
      if(args[2]==='activation')assert.deepEqual(suffix,['--json']);
      else if(args[2]==='transitionReview') {
        assert.equal(suffix.length,7);assert.equal(suffix[0],'--action');assert.ok(['ACTIVATE','MIGRATE','ROLLBACK'].includes(suffix[1]));
        assert.equal(suffix[2],'--expected-head-digest');assert.ok(isDigest(suffix[3]));assert.equal(suffix[4],'--destination-digest');assert.ok(isDigest(suffix[5]));assert.equal(suffix[6],'--json');
      } else {assert.equal(args[2],'transitionApprove');assert.equal(suffix.length,5);assert.equal(suffix[0],'--transition-review-digest');assert.ok(isDigest(suffix[1]));assert.deepEqual(suffix.slice(2),['--decision','APPROVE','--json']);}
      return;
    }
    if(context.product==='expert')assert.ok(args.length===1&&args[0]==='manifest'||
      [2,3].includes(args.length)&&['doctor','compatibility'].includes(args[0])&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(args[1])&&
      // Deliberate malformed-version values are positional, bounded, and never shell text or flags.
      (args.length===2||args[2].length<=128&&/^[a-zA-Z0-9. +_-]*$/.test(args[2])&&!args[2].trimStart().startsWith('-')),'PROBE_COMMAND_DENIED');
    else {
      const operations=['capabilities','inspect','compatibility','onboarding','gap',...(bindingMode?['review','approve','binding']:[])];
      assert.ok(args[0]==='project'&&args[1]==='semantic'&&operations.includes(args[2])&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(args[3]),'PROBE_COMMAND_DENIED');
      const suffix=args.slice(4);const pair=['compatibility','gap','review'].includes(args[2]);
      if(['capabilities','binding'].includes(args[2]))assert.deepEqual(suffix,['--json']);
      else if(args[2]==='approve') {
        assert.equal(suffix.length,5);assert.equal(suffix[0],'--review-digest');assert.ok(isDigest(suffix[1]));
        assert.deepEqual(suffix.slice(2),['--decision','APPROVE','--json']);
      }
      else {assert.equal(suffix.length,pair?7:3);assert.equal(suffix[0],'--catalog');assert.match(suffix[1],/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/);assert.equal(suffix.at(-1),'--json');
        if(pair){assert.equal(suffix[2],'--artifact-set-digest');assert.ok(isDigest(suffix[3]));assert.equal(suffix[4],'--bundle-digest');assert.ok(isDigest(suffix[5]));}}
    }
  };
  return Object.freeze({identity,
    invoke:async(args,{signal}={})=>{
      args=structuredClone(args);signal?.throwIfAborted();allowed(args);verify();
      if(bindingMode) {
        const effect=({review:'PREPARE_REVIEW',approve:'APPROVE_PROJECT_BINDING',transitionReview:'PREPARE_TRANSITION_REVIEW',transitionApprove:'APPROVE_PROJECT_TRANSITION'})[args[2]]??'READ';
        const frame={contextDigest:expectedContextDigest,acceptanceBindingDigest:context.acceptanceBindingDigest,
          commandDigest:probeDigest(args),args:structuredClone(args),effect};
        assert.equal(await authorizeInvocation(frame,{signal}),true,'CAMPAIGN_INVOCATION_DENIED');
        signal?.throwIfAborted();verify();
      }
      const extraArgs=context.product==='runtime'?runtimeConfiguration():[];
      signal?.throwIfAborted();
      const r=await new Promise((resolve,reject)=>execFile(process.execPath,[entry,...args,...extraArgs],
        {cwd:root,signal,timeout:10000,maxBuffer:1048576,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',EVOPILOT_LOG_LEVEL:'error'}},
        (error,stdout,stderr)=>{
          if(error&&(!Number.isInteger(error.code)||error.killed||error.signal))return reject(new Error('PROBE_TRANSPORT_FAILED'));
          try{resolve(context.product==='expert'?expertCliResult(error?.code??0,stdout,stderr):capabilityMode?runtimeCapabilityCliResult(error?.code??0,stdout,stderr):refusalMode?runtimeRefusalCliResult(error?.code??0,stdout,stderr):{exitCode:error?.code??0,json:stdout.trim()?JSON.parse(stdout):null});}catch{reject(new Error('PROBE_JSON_INVALID'));}
        }));
      signal?.throwIfAborted();verify();if(context.product==='runtime')runtimeConfiguration();return r;
    }});
}
