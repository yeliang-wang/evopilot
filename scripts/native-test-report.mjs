import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Node's actual test event stream, not names discovered by scanning source text.
// A passing event is technical evidence; this reporter never grants acceptance.
export default async function* report(events) {
  for await (const event of events) {
    if (!['test:pass', 'test:fail', 'test:summary'].includes(event.type)) continue;
    const d = event.data, filename = d.file ? path.resolve(d.file) : null;
    const sourceSHA256 = filename && fs.existsSync(filename)
      ? createHash('sha256').update(fs.readFileSync(filename)).digest('hex') : null;
    yield JSON.stringify({ schema: 'evopilot-test-event/v1', type: event.type,
      name: d.name ?? null, file: filename ? path.relative(process.cwd(), filename) : null,
      sourceSHA256, line: d.line ?? null, column: d.column ?? null,
      skip: d.skip ?? false, todo: d.todo ?? false,
      durationMs: d.details?.duration_ms ?? d.duration_ms ?? null,
      counts: d.counts ?? null, success: d.success ?? null }) + '\n';
  }
}
