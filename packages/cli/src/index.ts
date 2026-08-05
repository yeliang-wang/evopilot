#!/usr/bin/env node
import { runCli } from "./commands/runtime.js";

runCli(process.argv.slice(2)).then((code) => {
  exitAfterFlush(code);
}).catch((error) => {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  exitAfterFlush(1);
});

function exitAfterFlush(code: number): void {
  const streams = [process.stdout, process.stderr].filter((stream) => stream.writableLength > 0);
  if (streams.length === 0) {
    process.exit(code);
    return;
  }
  let pending = streams.length;
  for (const stream of streams) {
    stream.write("", () => {
      pending -= 1;
      if (pending === 0) process.exit(code);
    });
  }
}
