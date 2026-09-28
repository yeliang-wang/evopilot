// Private Host process entry. Not an Expert Core operation or an MCP credential tool.
import fs from 'node:fs';
import { readCredentialPipe } from './credential.mjs';
import { provision } from './controller.mjs';
import { verifyInventory } from './inventory.mjs';
import { nativeCollector } from './native.mjs';
import { privateTransport } from './transport.mjs';
import { ledger } from './ledger.mjs';
import { exactKeys, requireThat, digest } from './contracts.mjs';

const abort = new AbortController();
for (const event of ['SIGINT','SIGTERM','SIGHUP']) process.on(event, () => abort.abort());
// Parent supplies ONLY a bounded non-secret envelope through stdin. Raw input uses
// inherited private pipes exclusively between this process and its native child.
const chunks = []; let size = 0;
const watchdog = setTimeout(() => { process.stdout.write('{"status":"BINDING_REJECTED"}\n'); process.exit(1); }, 10000);
try {
  requireThat(process.argv.length === 5);
  // These non-secret pins belong in the reviewed, static Host launch definition,
  // not in tool arguments. A model cannot choose a new trust root or replay ledger.
  const [configPath, configDigest, componentDigest] = process.argv.slice(2);
  for await (const chunk of process.stdin) { size += chunk.length; requireThat(size <= 65536); chunks.push(chunk); }
  const request = JSON.parse(Buffer.concat(chunks));
  exactKeys(request, ['requestId','permission','deployment']);
  const stat = fs.lstatSync(configPath);
  requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0 && stat.size <= 16384);
  const config = JSON.parse(fs.readFileSync(configPath));
  requireThat(digest(config) === configDigest);
  const integrity = () => {
    requireThat(digest(JSON.parse(fs.readFileSync(configPath))) === configDigest);
    return verifyInventory(import.meta.dirname, componentDigest);
  };
  integrity();
  clearTimeout(watchdog);
  const result = await provision({...request, config, componentDigest}, {platform:`${process.platform}-${process.arch}`, integrity,
    ledger:ledger(config.ledgerPath), collect:nativeCollector(`${import.meta.dirname}/dist/darwin-arm64/secure-input`),
    transport:privateTransport(config), credential:signal=>readCredentialPipe(3,signal), signal:abort.signal});
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch { process.stdout.write('{"status":"BINDING_REJECTED"}\n'); process.exitCode = 1; }
finally { clearTimeout(watchdog); }
