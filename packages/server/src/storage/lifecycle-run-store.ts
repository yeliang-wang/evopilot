import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import type {LifecycleRun} from "../domains/lifecycle/types.js";
import {digestObject} from "../domains/harness-template/utils.js";

const reconciliationRequired = () => Object.assign(new Error("LIFECYCLE_WRITE_RECONCILIATION_REQUIRED"), {code: "LIFECYCLE_WRITE_RECONCILIATION_REQUIRED"});

/** Compare-and-swap for a single Lifecycle record, not a cross-Goal transaction.
 * All Lifecycle writers share this lock. A crash leaves the lock for explicit
 * reconciliation; never expire it or replay a possibly committed mutation.
 */
export class LifecycleRunStore {
  constructor(private readonly directory: string) {}
  assertSettled(id: string): void {
    const lock = this.file(id) + ".lock";
    try {fs.lstatSync(lock);}
    catch (error) {if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error;}
    throw reconciliationRequired();
  }
  private file(id: string) {
    if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error("LIFECYCLE_RUN_ID_INVALID");
    const parent = fs.lstatSync(this.directory);
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error("LIFECYCLE_RUN_PATH_DENIED");
    return path.join(this.directory, `${id}.json`);
  }
  read(id: string): LifecycleRun | undefined {
    const file = this.file(id); let fd: number;
    try {fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);}
    catch (error) {if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error;}
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size <= 0 || stat.size > 8 * 1024 * 1024) throw new Error("LIFECYCLE_RUN_FILE_INVALID");
      const bytes = Buffer.alloc(stat.size + 1), count = fs.readSync(fd, bytes, 0, bytes.length, 0), after = fs.fstatSync(fd);
      const current = fs.lstatSync(file);
      if (count !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs ||
        current.ino !== stat.ino || current.dev !== stat.dev || current.isSymbolicLink()) throw new Error("LIFECYCLE_RUN_DRIFT");
      const run = JSON.parse(bytes.subarray(0, count).toString("utf8"));
      if (!run || run.id !== id || run.schema !== "evopilot-lifecycle-run/v1alpha1") throw new Error("LIFECYCLE_RUN_FILE_INVALID");
      return run;
    } finally {fs.closeSync(fd);}
  }
  write(next: LifecycleRun, previous?: LifecycleRun): LifecycleRun {
    const file = this.file(next.id), lock = file + ".lock", temporary = file + `.pending-${randomUUID()}`;
    let lockFd: number;
    try {lockFd = fs.openSync(lock, "wx", 0o600);}
    catch (error) {if ((error as NodeJS.ErrnoException).code === "EEXIST") throw reconciliationRequired(); throw error;}
    let temporaryFd: number | undefined, renamed = false, durable = false;
    try {
      fs.writeFileSync(lockFd, JSON.stringify({schema: "evopilot-lifecycle-write-claim/v1", id: next.id,
        expectedDigest: previous ? digestObject(previous) : null, nextDigest: digestObject(next)})); fs.fsyncSync(lockFd);
      const current = this.read(next.id);
      if (digestObject(current ?? null) !== digestObject(previous ?? null)) throw new Error("LIFECYCLE_RUN_REVISION_CONFLICT");
      const bytes = JSON.stringify(next, null, 2) + "\n";
      if (Buffer.byteLength(bytes) > 8 * 1024 * 1024) throw new Error("LIFECYCLE_RUN_FILE_INVALID");
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
