import assert from 'node:assert/strict';

// Malformed declaration requests use the public CLI's named stderr diagnostics.
// Retain only the allowlisted code, never a raw stack trace or arbitrary crash.
export function expertCliResult(exitCode,stdout,stderr) {
  assert.ok(Number.isInteger(exitCode)&&exitCode>=0&&exitCode<=255,'PROBE_TRANSPORT_FAILED');
  if(stdout.trim())return {exitCode,json:JSON.parse(stdout)};
  const allowed=new Set(['EVOLUTION_EXPERT_UNKNOWN_PACKAGED_HOST','EVOLUTION_EXPERT_INVALID_RUNTIME_VERSION']);
  const errors=stderr.split('\n').filter(line=>line.startsWith('Error: '));
  const code=errors.length===1?errors[0].match(/^Error: ([A-Z_]+)(?::.*)?$/)?.[1]:undefined;
  assert.ok(exitCode===1&&allowed.has(code),'PROBE_UNRECOGNIZED_EXPERT_FAILURE');
  return {exitCode,json:{schema:'evopilot-expert-cli-diagnostic-observation/v1',code}};
}
