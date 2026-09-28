// Installation-owned loopback TLS ingress. Never an MCP tool or a new authority.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { digest, exactKeys, requireThat } from './contracts.mjs';

function owned(file, directory=false) {
  requireThat(fs.realpathSync(file) === path.resolve(file));
  const s=fs.lstatSync(file);
  requireThat((directory?s.isDirectory():s.isFile()) && s.uid===process.getuid() && (s.mode&0o077)===0);
  if(!directory) requireThat(s.size<=16384);
}
function loopback(origin, protocol) {
  const u=new URL(origin);
  requireThat(u.origin===origin && u.protocol===protocol && u.hostname==='127.0.0.1' && !u.username && !u.password);
  return u;
}
export function setupLocalTls(root, upstream, port) {
  owned(root,true);loopback(upstream,'http:');
  requireThat(/^\d+$/.test(String(port)) && Number(port)>=1024 && Number(port)<=65535);
  requireThat(new URL(upstream).port!==String(Number(port)));
  const dir=path.join(root,'local-tls');
  fs.mkdirSync(dir,{mode:0o700}); // Exclusive: never silently rotate trust or overwrite keys.
  const keyPath=path.join(dir,'key.pem'),certificatePath=path.join(dir,'certificate.pem');
  const opensslConfig=path.join(dir,'openssl.cnf');
  fs.writeFileSync(opensslConfig,'[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=EvoPilot local private input\n[ext]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n',{flag:'wx',mode:0o600});
  try {
    execFileSync('/usr/bin/openssl',['req','-x509','-newkey','rsa:3072','-nodes','-days','30','-config',opensslConfig,'-keyout',keyPath,'-out',certificatePath],{stdio:'ignore',timeout:30000,env:{}});
    fs.chmodSync(keyPath,0o600);fs.chmodSync(certificatePath,0o600);
    const certificatePem=fs.readFileSync(certificatePath,'utf8');
    const certificateDigest=digest(new X509Certificate(certificatePem).raw);
    const destination=`https://127.0.0.1:${Number(port)}`;
    const config={schema:'evopilot-local-private-tls/v1',destination,upstream,keyPath,certificatePath,certificateDigest};
    const configPath=path.join(dir,'gateway.json');fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
    return {status:'LOCAL_TLS_CONFIGURED',configPath,destination,localTls:{certificatePem,certificateDigest,upstream,gatewayConfigDigest:digest(config)},upstream,expiresAt:new X509Certificate(certificatePem).validTo};
  } catch {throw new Error('LOCAL_TLS_SETUP_FAILED');}
}
export function readLocalTls(configPath) {
  owned(path.dirname(configPath),true);owned(configPath);
  const c=JSON.parse(fs.readFileSync(configPath));
  exactKeys(c,['schema','destination','upstream','keyPath','certificatePath','certificateDigest']);
  requireThat(c.schema==='evopilot-local-private-tls/v1');loopback(c.destination,'https:');loopback(c.upstream,'http:');
  for(const f of [c.keyPath,c.certificatePath]) {requireThat(path.dirname(f)===path.dirname(configPath));owned(f);}
  const cert=fs.readFileSync(c.certificatePath),x509=new X509Certificate(cert);
  requireThat(digest(x509.raw)===c.certificateDigest && x509.checkIP('127.0.0.1')==='127.0.0.1');
  requireThat(Date.parse(x509.validFrom)<=Date.now() && Date.parse(x509.validTo)>Date.now());
  return {config:c,cert,key:fs.readFileSync(c.keyPath)};
}
export async function serveLocalTls(configPath) {
  const {config,cert,key}=readLocalTls(configPath);
  const active=new Set();
  const server=https.createServer({key,cert,minVersion:'TLSv1.2'},async(req,res)=>{
    const probe=req.method==='GET' && req.url==='/private-input/ready';
    const allowed=probe || (req.method==='POST'&&req.url==='/api/v1/auth/login') || (['GET','POST'].includes(req.method)&&req.url==='/api/v1/secrets');
    const fail=(status=502)=>{if(!res.headersSent)res.writeHead(status,{'content-type':'application/json'});res.end('{"data":null}');};
    if(!allowed){req.resume();fail(403);return;}
    if(req.headers['x-evopilot-local-gateway-binding']!==digest(config)){req.resume();fail(403);return;}
    // Recheck installation binding before accepting private bytes.
    try {requireThat(digest(readLocalTls(configPath).config)===digest(config));} catch {req.resume();fail(503);return;}
    const chunks=[];let size=0;
    try {
      for await(const chunk of req){size+=chunk.length;if(size>32768)throw Error();chunks.push(chunk);}
      if(req.method==='GET' && size!==0)throw Error();
    } catch {for(const b of chunks)b.fill(0);fail(400);return;}
    const payload=Buffer.concat(chunks);for(const b of chunks)b.fill(0);
    const headers={'accept':'application/json'};
    if(!probe)for(const name of ['authorization','x-evopilot-tenant','x-evopilot-workspace'])if(typeof req.headers[name]==='string')headers[name]=req.headers[name];
    if(payload.length){headers['content-type']='application/json';headers['content-length']=payload.length;}
    const upstream=http.request(new URL(probe?'/health':req.url,config.upstream),{method:probe?'GET':req.method,headers,agent:false,timeout:5000},reply=>{
      const buffers=[];let count=0;
      reply.on('data',b=>{count+=b.length;if(count>1048576){b.fill(0);for(const x of buffers)x.fill(0);reply.destroy();}else buffers.push(b);});
      reply.on('error',()=>{for(const b of buffers)b.fill(0);fail();});
      reply.on('end',()=>{
        const bytes=Buffer.concat(buffers);for(const b of buffers)b.fill(0);
        // Never follow redirects or forward cookies, Location, or raw upstream errors.
        try {
          if(probe){res.writeHead(reply.statusCode===200?200:503,{'content-type':'application/json'});res.end(JSON.stringify({data:{ready:reply.statusCode===200}}));}
          else if(reply.statusCode>=300&&reply.statusCode<400)fail();
          else {
            const responseHeaders={'content-type':'application/json'};
            const requestId=reply.headers['x-request-id'];
            if(typeof requestId==='string' && /^[a-zA-Z0-9_-]{1,128}$/.test(requestId))responseHeaders['x-request-id']=requestId;
            res.writeHead(reply.statusCode??502,responseHeaders);
            res.end(bytes,()=>bytes.fill(0));
            return;
          }
        } finally {if(probe || (reply.statusCode>=300&&reply.statusCode<400))bytes.fill(0);}
      });
    });
    active.add(upstream);
    upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>fail());
    upstream.on('close',()=>{active.delete(upstream);payload.fill(0);delete headers.authorization;});
    res.on('close',()=>{if(!res.writableFinished)upstream.destroy();});
    upstream.end(payload);
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.on('tlsClientError',()=>{});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(new URL(config.destination).port),'127.0.0.1',resolve);});
  return {server,destination:config.destination,close:async()=>{for(const r of active)r.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    requireThat(process.argv.length===4&&process.argv[2]==='serve');
    const running=await serveLocalTls(process.argv[3]);
    console.log(JSON.stringify({status:'LOCAL_TLS_LISTENING',destination:running.destination}));
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>running.close().then(()=>process.exit(0)));
  } catch {console.log('{"status":"LOCAL_TLS_REJECTED"}');process.exitCode=1;}
}
