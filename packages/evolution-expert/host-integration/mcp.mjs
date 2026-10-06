// Supplementary Host-local bridge. Credentials are never MCP arguments/results.
import fs from 'node:fs';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { exactKeys, requireThat, digest, validateConfig } from './contracts.mjs';

const [configPath,configDigest,componentDigest,receiptPath] = process.argv.slice(2);
const name = 'provision_workspace_secret';
const tool = {name,description:'Request exact Host permission and visible native scope confirmation to privately create one workspace LLM SecretRef. No credential arguments. Does not bind a Profile or assert READY.',
  inputSchema:{type:'object',additionalProperties:false,required:['requestId'],properties:{requestId:{type:'string',pattern:'^[a-f0-9]{32}$'}}}};
const write = value => process.stdout.write(`${JSON.stringify(value)}\n`);
let initialized = false, consumed = false, active = null, activeId;
const statuses = new Set(['SECRET_REF_CREATED','CANCELLED','UNKNOWN','BINDING_REJECTED','DUPLICATE_OR_LEDGER_UNAVAILABLE','COLLISION','AUTH_FAILED','FAILED_BEFORE_SECRET_SUBMIT']);
async function invoke(requestId) {
  requireThat(process.argv.length === 6 && !consumed);
  consumed = true;
  const stat = fs.lstatSync(receiptPath);
  requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0 && stat.size <= 32768);
  const receipt = JSON.parse(fs.readFileSync(receiptPath));
  exactKeys(receipt,['requestId','permission','deployment']);requireThat(receipt.requestId === requestId);
  const configStat=fs.lstatSync(configPath);
  requireThat(configStat.isFile() && !configStat.isSymbolicLink() && configStat.uid===process.getuid() && (configStat.mode&0o077)===0 && configStat.size<=16384);
  const config=validateConfig(JSON.parse(fs.readFileSync(configPath)));requireThat(digest(config)===configDigest);
  const privateFd=config.authentication?fs.fstatSync(3):null;
  if(privateFd)requireThat(privateFd.isFIFO()||privateFd.isSocket());
  // Signed permission/attestation files contain metadata only, never credentials.
  return new Promise(resolve=>{
    active=spawn(process.execPath,[`${import.meta.dirname}/run.mjs`,configPath,configDigest,componentDigest],{env:{},stdio:['pipe','pipe','ignore',...(privateFd?[3]:[])]});
    let output='',overflow=false;
    const child=active;
    const timer=setTimeout(()=>{overflow=true;child.kill('SIGTERM');},130000);
    const hard=setTimeout(()=>child.kill('SIGKILL'),135000);
    child.stdout.on('data',chunk=>{if(Buffer.byteLength(output)+chunk.length>4096){overflow=true;child.kill('SIGTERM');}else output+=chunk.toString();});
    child.stdin.on('error',()=>{});child.on('error',()=>{overflow=true;});
    child.on('close',()=>{
      clearTimeout(timer);clearTimeout(hard);active=null;
      try {
        const result=JSON.parse(output);requireThat(!overflow && statuses.has(result.status));
        exactKeys(result,result.status==='SECRET_REF_CREATED'?['status','secretRef']:['status']);
        if(result.secretRef)requireThat(/^expert-[a-f0-9]{48}$/.test(result.secretRef));
        resolve(result);
      } catch { resolve({status:'UNKNOWN'}); }
    });
    child.stdin.end(JSON.stringify(receipt));
  });
}
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
// Bound a single line before readline can accumulate an unbounded model request.
let lineBytes=0;
process.stdin.on('data',chunk=>{for(const byte of chunk){lineBytes=byte===10?0:lineBytes+1;if(lineBytes>65536){active?.kill('SIGTERM');process.stdin.destroy();lines.close();break;}}});
lines.on('line',async line=>{
  let message;
  try {
    requireThat(Buffer.byteLength(line)<=65536);message=JSON.parse(line);
    requireThat(message.jsonrpc==='2.0');
    if(message.method==='notifications/cancelled'){if(message.params?.requestId===activeId)active?.kill('SIGTERM');return;}
    if(message.id===undefined)return;
    requireThat(typeof message.id==='string'||Number.isSafeInteger(message.id));
    let result;
    if(message.method==='initialize'){
      requireThat(!initialized);initialized=true;
      result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'evopilot-private-input',version:'2.3.1'}};
    }else if(message.method==='ping')result={};
    else if(message.method==='tools/list'){requireThat(initialized);result={tools:[tool]};}
    else if(message.method==='tools/call'){
      requireThat(initialized && message.params?.name===name && !active);
      exactKeys(message.params.arguments,['requestId']);requireThat(/^[a-f0-9]{32}$/.test(message.params.arguments.requestId));
      activeId=message.id;
      let value;try{value=await invoke(message.params.arguments.requestId);}catch{value={status:'BINDING_REJECTED'};}
      result={content:[{type:'text',text:JSON.stringify(value)}],isError:value.status!=='SECRET_REF_CREATED'};
    }else throw new Error('UNSUPPORTED');
    write({jsonrpc:'2.0',id:message.id,result});
  }catch{write({jsonrpc:'2.0',id:typeof message?.id==='string'||Number.isSafeInteger(message?.id)?message.id:null,error:{code:-32600,message:'Private input request rejected'}});}
});
lines.on('close',()=>active?.kill('SIGTERM'));
for(const event of ['SIGTERM','SIGINT','SIGHUP'])process.on(event,()=>{active?.kill('SIGTERM');lines.close();});
