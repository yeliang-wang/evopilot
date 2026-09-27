import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import type {GlobalGoal as GoalRecord} from "../model.js";
import {digestObject} from "../domains/harness-template/utils.js";

function conflict(code: string) {return Object.assign(new Error(code), {code, statusCode: 409});}

/** Single-record Goal/Target compare-and-swap; not a transaction with Lifecycle.
 * All Runtime Goal writers share this lock. A crash leaves the lock for explicit
 * reconciliation; never expire it or replay a possibly committed mutation.
 */
export class GoalRecordStore {
  constructor(private readonly directory: string) {}
  /** Inspection may read an uncertain record for reconciliation; continued
   * semantic execution must explicitly require that no writer claim remains. */
  assertSettled(id: string): void {
    const lock = this.file(id) + ".lock";
    try {fs.lstatSync(lock);}
    catch (error) {if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error;}
    throw conflict("GOAL_WRITE_RECONCILIATION_REQUIRED");
  }
  private file(id: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) throw new Error("GOAL_RECORD_ID_INVALID");
    const parent = fs.lstatSync(this.directory);
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error("GOAL_RECORD_PATH_DENIED");
    return path.join(this.directory, `${id}.json`);
  }
  read(id: string): GoalRecord | undefined {
    const file = this.file(id), parent = fs.lstatSync(this.directory); let fd: number;
    try {fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);}
    catch (error) {if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error;}
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size <= 0 || stat.size > 1024 * 1024) throw new Error("GOAL_RECORD_FILE_INVALID");
      const bytes = Buffer.alloc(stat.size + 1), count = fs.readSync(fd, bytes, 0, bytes.length, 0), after = fs.fstatSync(fd);
      const current = fs.lstatSync(file);
      const parentAfter = fs.lstatSync(this.directory);
      if (count !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs ||
        current.ino !== stat.ino || current.dev !== stat.dev || current.isSymbolicLink() || current.nlink !== 1 ||
        current.size !== stat.size || current.mtimeMs !== stat.mtimeMs || current.ctimeMs !== stat.ctimeMs ||
        parentAfter.isSymbolicLink() || parentAfter.ino !== parent.ino || parentAfter.dev !== parent.dev) throw new Error("GOAL_RECORD_DRIFT");
      const run = JSON.parse(bytes.subarray(0, count).toString("utf8"));
      if (!run || run.id !== id || run.schema !== "evopilot-global-goal/v1") throw new Error("GOAL_RECORD_FILE_INVALID");
      return run;
    } finally {fs.closeSync(fd);}
  }
  write(next: GoalRecord, previous?: GoalRecord): GoalRecord {
    if (next.schema !== "evopilot-global-goal/v1" || (previous && previous.id !== next.id)) throw new Error("GOAL_RECORD_FILE_INVALID");
    const file = this.file(next.id), lock = file + ".lock", temporary = file + `.pending-${randomUUID()}`;
    let lockFd: number;
    try {lockFd = fs.openSync(lock, "wx", 0o600);}
    catch (error) {if ((error as NodeJS.ErrnoException).code === "EEXIST") throw conflict("GOAL_WRITE_RECONCILIATION_REQUIRED"); throw error;}
    let temporaryFd: number | undefined, renamed = false, durable = false;
    try {
      fs.writeFileSync(lockFd, JSON.stringify({schema: "evopilot-goal-write-claim/v1", id: next.id,
        expectedDigest: previous ? digestObject(previous) : null, nextDigest: digestObject(next)})); fs.fsyncSync(lockFd);
      const current = this.read(next.id);
      if (digestObject(current ?? null) !== digestObject(previous ?? null)) throw conflict("GOAL_RECORD_REVISION_CONFLICT");
      const bytes = JSON.stringify(next, null, 2) + "\n";
      if (Buffer.byteLength(bytes) > 1024 * 1024) throw new Error("GOAL_RECORD_FILE_INVALID");
      temporaryFd = fs.openSync(temporary, "wx", 0o600); fs.writeFileSync(temporaryFd, bytes); fs.fsyncSync(temporaryFd);
      fs.closeSync(temporaryFd); temporaryFd = undefined;
      fs.renameSync(temporary, file);
      renamed = true;
      const parent = fs.openSync(this.directory, fs.constants.O_RDONLY);
      try {fs.fsyncSync(parent);} finally {fs.closeSync(parent);}
      durable = true;
      return structuredClone(next);
    } finally {
      if (temporaryFd !== undefined) fs.closeSync(temporaryFd);
      try {fs.unlinkSync(temporary);} catch (error) {if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;}
      fs.closeSync(lockFd);
      // A post-rename durability error is an ambiguous commit, not safe replay.
      if (!renamed || durable) fs.unlinkSync(lock);
    }
  }
}
