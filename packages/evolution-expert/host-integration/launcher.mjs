// SDK for a reviewed trusted Host launcher, never a model-callable token API.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {digest,validateConfig,requestBinding,verifyAuthority,requireThat,exactKeys} from './contracts.mjs';
import {verifyInventory} from './inventory.mjs';
import {verifyCredential} from './credential.mjs';

export async function launchLocalTokenInput({configPath,configDigest,componentDigest,request,credentialProvider,signal}) {
  let packet;
  try {
    const stat=fs.lstatSync(configPath);
    requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.uid===process.getuid() && (stat.mode&0o077)===0 && stat.size<=16384);
    const config=validateConfig(JSON.parse(fs.readFileSync(configPath)));
    requireThat(config.authentication && digest(config)===configDigest && typeof credentialProvider==='function' && !signal.aborted);
    requireThat(process.platform==='darwin' && process.arch==='arm64');
    verifyInventory(import.meta.dirname,componentDigest);
    exactKeys(request,['requestId','permission','deployment']);
    const binding=requestBinding(config,componentDigest,request.requestId);
    verifyAuthority(config,binding,request.permission,request.deployment);
    // Provider is installed trusted code reading its own authoritative credential
    // registration, not a path, environment name, token or callback from an Agent.
    const sourceAbort=new AbortController();
    const cancelSource=()=>sourceAbort.abort();signal.addEventListener('abort',cancelSource,{once:true});
    let sourceTimer,settled=false;
    try {
      packet=await Promise.race([
        Promise.resolve().then(()=>credentialProvider({binding,signal:sourceAbort.signal})).then(value=>{if(settled){if(value)value.token='';throw Error('CREDENTIAL_UNAVAILABLE');}return value;}),
        new Promise((_,reject)=>{sourceTimer=setTimeout(()=>{sourceAbort.abort();reject(Error('CREDENTIAL_UNAVAILABLE'));},5000);sourceAbort.signal.addEventListener('abort',()=>reject(Error('CREDENTIAL_UNAVAILABLE')),{once:true});})
      ]);
    } finally {settled=true;clearTimeout(sourceTimer);signal.removeEventListener('abort',cancelSource);sourceAbort.abort();}
    verifyCredential(config,binding,packet);
    verifyAuthority(config,binding,request.permission,request.deployment);
    requireThat(!signal.aborted);
    return await new Promise(resolve=>{
      const child=spawn(process.execPath,[`${import.meta.dirname}/run.mjs`,configPath,configDigest,componentDigest],{env:{},stdio:['pipe','pipe','ignore','pipe']});
      let output='',invalid=false;
      const stop=()=>child.kill('SIGTERM');signal.addEventListener('abort',stop,{once:true});
      const soft=setTimeout(stop,config.timeoutMs+10000),hard=setTimeout(()=>child.kill('SIGKILL'),config.timeoutMs+15000);
      child.on('error',()=>{invalid=true;});
      child.stdout.on('data',b=>{if(Buffer.byteLength(output)+b.length>4096){invalid=true;stop();}else output+=b.toString();});
      for(const fd of [child.stdin,child.stdio[3]])fd.on('error',()=>{});
      child.on('close',()=>{
        clearTimeout(soft);clearTimeout(hard);signal.removeEventListener('abort',stop);
        try {
          const r=JSON.parse(output);requireThat(!invalid);
          requireThat(['SECRET_REF_CREATED','CANCELLED','UNKNOWN','BINDING_REJECTED','DUPLICATE_OR_LEDGER_UNAVAILABLE','COLLISION','AUTH_FAILED','FAILED_BEFORE_SECRET_SUBMIT'].includes(r.status));
          exactKeys(r,r.status==='SECRET_REF_CREATED'?['status','secretRef']:['status']);
          if(r.secretRef)requireThat(/^expert-[a-f0-9]{48}$/.test(r.secretRef));resolve(r);
        } catch {resolve({status:'UNKNOWN'});}
      });
      const bytes=Buffer.from(JSON.stringify(packet));
      child.stdio[3].end(bytes,()=>bytes.fill(0));
      child.stdin.end(JSON.stringify(request));
      if(signal.aborted)stop();
    });
  } catch { return {status:'BINDING_REJECTED'}; }
  finally {if(packet)packet.token='';}
}
