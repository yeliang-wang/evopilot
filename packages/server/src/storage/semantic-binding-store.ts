import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {requireSemantic, parseSemanticJson} from "../domains/harness-template/semantic-catalog-contract.js";
import {digestObject, isRecord} from "../domains/harness-template/utils.js";

const maximumBytes = 262144;
type RecordKind = "reviews" | "projects" | "project-transition-reviews" | "project-transitions" | "execution-plans" | "execution-stage-plans" | "executions" | "dispatch-usage-anchors" | "dispatch-claims" | "dispatch-results" | "outcomes" | "outcome-reviews" | "outcome-decisions" | "collection-claims" | "collections";

/** Private Runtime records, not Catalog assets. A synced complete temporary
 * inode is linked into its immutable slot with no replacement. Concurrent
 * processes see a complete winner or an absent slot, never a partial JSON.
 * dataRoot is trusted server configuration; request identifiers are hashed.
 */
export class SemanticBindingStore {
  private readonly root: string;
  constructor(dataRoot: string) { this.root = path.join(path.resolve(dataRoot), "project-semantic-bindings"); }

  private directory(kind: RecordKind, create: boolean): string | undefined {
    for (const directory of [this.root, path.join(this.root, kind)]) {
      if (create) { try { fs.mkdirSync(directory, {mode: 0o700}); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; } }
      let stat: fs.Stats;
      try { stat = fs.lstatSync(directory); } catch (error) { if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
      requireSemantic(stat.isDirectory() && !stat.isSymbolicLink(), "PATH_DENIED");
    }
    return path.join(this.root, kind);
  }

  read(kind: RecordKind, key: unknown): unknown | undefined {
    const directory = this.directory(kind, false); if (!directory) return undefined;
    const file = path.join(directory, digestObject(key).slice(7) + ".json");
    let fd: number;
    try { fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    try {
      const stat = fs.fstatSync(fd);
      requireSemantic(stat.isFile() && stat.nlink === 1, "PATH_DENIED");
      requireSemantic(stat.size <= maximumBytes, "FILE_LIMIT");
      const bytes = Buffer.alloc(stat.size + 1), length = fs.readSync(fd, bytes, 0, bytes.length, 0);
      requireSemantic(length === stat.size, "DRIFT");
      const value = parseSemanticJson(bytes.subarray(0, length));
      requireSemantic(isRecord(value), "MATERIAL_INVALID");
      const {recordDigest, ...content} = value;
      requireSemantic(recordDigest === digestObject(content), "DIGEST_MISMATCH");
      requireSemantic(content.keyDigest === digestObject(key), "SCOPE_INVALID");
      return content.value;
    } finally { fs.closeSync(fd); }
  }

  put(kind: RecordKind, key: unknown, value: unknown): unknown {
    const existing = this.read(kind, key); if (existing !== undefined) return existing;
    const directory = this.directory(kind, true)!;
    const content = {keyDigest: digestObject(key), value};
    const bytes = JSON.stringify({...content, recordDigest: digestObject(content)}) + "\n";
    requireSemantic(Buffer.byteLength(bytes) <= maximumBytes, "FILE_LIMIT");
    const temporary = path.join(directory, `.pending-${randomUUID()}`);
    const target = path.join(directory, digestObject(key).slice(7) + ".json");
    const fd = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd);
      try { fs.linkSync(temporary, target); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      fs.unlinkSync(temporary);
      const parent = fs.openSync(directory, fs.constants.O_RDONLY);
      try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
    } finally {
      // A failed write cannot expose its temporary file as a valid record.
      try { fs.closeSync(fd); } catch { /* already closed */ }
      try { fs.unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    return this.read(kind, key);
  }
}
