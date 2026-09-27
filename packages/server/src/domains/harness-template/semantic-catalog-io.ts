import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { SemanticCatalogError, requireSemantic, type SemanticCatalogLimits } from "./semantic-catalog-contract.js";
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
export function createSemanticOperation(limits: SemanticCatalogLimits, signal?: AbortSignal) {
  const deadline = performance.now() + limits.readTimeoutMilliseconds;
  let cancelled = signal?.aborted === true;
  const onAbort = () => { cancelled = true; };
  signal?.addEventListener("abort", onAbort, { once: true });
  const check = () => {
    requireSemantic(!cancelled, "CANCELLED");
    requireSemantic(performance.now() < deadline, "TIMEOUT");
  };
  return {
    check,
    close: () => signal?.removeEventListener("abort", onAbort),
    async wait<T>(action: () => T | Promise<T>): Promise<T> {
      check();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let cancel: (() => void) | undefined;
      try {
        const stop = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new SemanticCatalogError("TIMEOUT")), Math.max(1, deadline - performance.now()));
          cancel = () => reject(new SemanticCatalogError("CANCELLED"));
          signal?.addEventListener("abort", cancel, { once: true });
        });
        // Only trusted read-only callbacks are raced. Filesystem operations remain
        // cooperative; this deadline does not promise OS-level I/O preemption.
        const result = await Promise.race([Promise.resolve().then(action), stop]);
        check(); return result;
      } finally {
        clearTimeout(timer);
        if (cancel) signal?.removeEventListener("abort", cancel);
      }
    }
  };
}

export type SemanticOperation = ReturnType<typeof createSemanticOperation>;
export async function openSemanticRoot(configuredRoot: string, operation: SemanticOperation) {
  // Canonicalize only the configured root. Subpaths may never be symlinks.
  const root = await fs.realpath(configuredRoot);
  const rootStat = await fs.stat(root);
  requireSemantic(rootStat.isDirectory(), "PATH_DENIED");
  operation.check();

  async function checkedPath(relative: string): Promise<string> {
    requireSemantic(/^(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+$/.test(relative) &&
      relative.split("/").every(part => part !== "." && part !== ".."), "PATH_DENIED");
    operation.check();
    const current = await fs.lstat(root);
    requireSemantic(current.isDirectory() && !current.isSymbolicLink() && current.dev === rootStat.dev &&
      current.ino === rootStat.ino && await fs.realpath(configuredRoot) === root, "DRIFT");
    let cursor = root;
    for (const part of relative.split("/").slice(0, -1)) {
      cursor = path.join(cursor, part);
      const stat = await fs.lstat(cursor);
      requireSemantic(stat.isDirectory() && !stat.isSymbolicLink(), "PATH_DENIED");
    }
    requireSemantic(await fs.realpath(cursor) === cursor, "PATH_DENIED");
    operation.check();
    return path.join(root, relative);
  }
  async function read(relative: string, maxBytes: number) {
    operation.check();
    const file = await checkedPath(relative);
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await handle.stat();
      requireSemantic(before.isFile() && before.nlink === 1, "PATH_DENIED");
      requireSemantic(before.size > 0 && before.size <= maxBytes, "FILE_LIMIT");
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        operation.check();
        const { bytesRead } = await handle.read(bytes, offset, Math.min(65536, bytes.length - offset), offset);
        requireSemantic(bytesRead > 0, "DRIFT"); offset += bytesRead;
      }
      const after = await handle.stat();
      requireSemantic(before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, "DRIFT");
      await checkedPath(relative);
      const named = await fs.lstat(file);
      requireSemantic(!named.isSymbolicLink() && named.isFile() && named.nlink === 1 && named.dev === after.dev &&
        named.ino === after.ino && named.size === after.size && named.mtimeMs === after.mtimeMs && named.ctimeMs === after.ctimeMs &&
        await fs.realpath(file) === file, "DRIFT");
      operation.check();
      return { bytes };
    } finally { await handle.close(); }
  }

  return { read };
}
export function redactSemanticError(error: unknown): SemanticCatalogError {
  if (error instanceof SemanticCatalogError) return error;
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return new SemanticCatalogError("UNAVAILABLE");
  if (["ELOOP", "ENOTDIR", "EACCES", "EPERM"].includes(code ?? "")) return new SemanticCatalogError("PATH_DENIED");
  return new SemanticCatalogError("IO_OR_VALIDATION_FAILED");
}
