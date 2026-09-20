import { spawn } from 'node:child_process';
import { digest } from './contracts.mjs';

export function nativeCollector(executable) {
  return (context, signal) => new Promise((resolve, reject) => {
    if (signal.aborted) return resolve(null);
    const {username, timeoutMs, ...binding} = context;
    const child = spawn(executable, [], {env:{}, stdio:['ignore','ignore','ignore','pipe','pipe']});
    let size = 0, failed = false; const chunks = [];
    const abort = () => child.kill('SIGKILL');
    signal.addEventListener('abort', abort, {once:true});
    child.stdio[3].on('data', chunk => {
      size += chunk.length;
      if (size > 32768) { failed = true; chunk.fill(0); abort(); } else chunks.push(chunk);
    });
    child.stdio[3].on('error', () => { failed = true; abort(); });
    child.stdio[4].on('error', () => { failed = true; abort(); });
    child.on('error', () => { failed = true; });
    child.on('close', code => {
      signal.removeEventListener('abort', abort);
      const bytes = Buffer.concat(chunks);
      try {
        if (signal.aborted) resolve(null);
        else if (failed || code !== 0) reject(new Error('INPUT_FAILED'));
        else resolve(size === 0 ? null : JSON.parse(bytes.toString()));
      } catch { reject(new Error('INPUT_FAILED')); }
      finally { bytes.fill(0); for (const chunk of chunks) chunk.fill(0); }
    });
    child.stdio[4].end(JSON.stringify({...binding, username, timeoutMs, bindingDigest:digest(binding)}));
  });
}
