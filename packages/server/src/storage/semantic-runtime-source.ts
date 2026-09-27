import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {parseSemanticJson, requireSemantic, SemanticCatalogError} from "../domains/harness-template/semantic-catalog-contract.js";

/** Strict, read-only view of existing Runtime-owned files. Unlike the legacy
 * hydration path this never supplies missing scope, status or approval defaults.
 * No credential store is accessible through this finite table.
 */
export class SemanticRuntimeSourceStore {
  private readonly root: string;
  constructor(dataRoot: string) {this.root = fs.realpathSync(dataRoot);}
  read(kind: "projects" | "goals" | "llm-profiles", id: string): unknown {
    requireSemantic(["projects", "goals", "llm-profiles"].includes(kind) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id), "INVALID");
    return this.readFile([kind], id + ".json");
  }
  readGovernedResource(scope: {tenantId: string; workspaceId: string}, kind: string, id: string, version?: string): unknown {
    requireSemantic(["PolicyPack", "ActionProviderDefinition", "EnvironmentBinding", "HumanAuthorityRole", "GovernancePack", "AgentRuntimeProfile"].includes(kind) &&
      [scope.tenantId, scope.workspaceId, id].every(value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) &&
      (version === undefined || /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)), "INVALID");
    // Exact finite paths only. Never enumerate, create scope directories or use
    // the generic resource reader's latest-version fallback when a pointer is absent.
    return this.readFile([version === undefined ? "governed-evolution-resources-active" : "governed-evolution-resources", scope.tenantId, scope.workspaceId],
      `${kind}--${id}${version === undefined ? "" : "--" + version}.json`);
  }
  readOutcomeEvidence(scope: {tenantId: string; workspaceId: string; projectId: string}, digest: string): {document: unknown; byteLength: number} {
    requireSemantic(Object.values(scope).every(value => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) && /^sha256:[a-f0-9]{64}$/.test(digest), "INVALID");
    return this.readFile(["semantic-outcome-evidence", scope.tenantId, scope.workspaceId, scope.projectId], digest.slice(7) + ".json", digest, 65536, true) as {document: unknown; byteLength: number};
  }
  readHarnessBinding(scope: {tenantId: string; workspaceId: string}, digest: string): unknown {
    requireSemantic([scope.tenantId, scope.workspaceId].every(value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) &&
      /^sha256:[a-f0-9]{64}$/.test(digest), "INVALID");
    return this.readFile(["harness-execution-bindings", scope.tenantId, scope.workspaceId], digest.slice(7) + ".json");
  }
  readProjectDefinition(scope: {tenantId: string; workspaceId: string}, id: string, version: string): unknown {
    requireSemantic([scope.tenantId, scope.workspaceId, id].every(value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) &&
      typeof version === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(version), "INVALID");
    return this.readFile(["evolution-project-definitions", scope.tenantId, scope.workspaceId], `${id}--${version}.json`);
  }
  private readFile(segments: string[], filename: string, expectedDigest?: string, maximumBytes = 1048576, includeBytes = false): unknown {
    const directories = [this.root, ...segments.map((_, index) => path.join(this.root, ...segments.slice(0, index + 1)))];
    const file = path.join(directories[directories.length - 1], filename);
    let fd: number | undefined;
    try {
      const parents = directories.map(directory => {
        const stat = fs.lstatSync(directory);
        requireSemantic(stat.isDirectory() && !stat.isSymbolicLink(), "PATH_DENIED");
        return stat;
      });
      fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      const before = fs.fstatSync(fd);
      requireSemantic(before.isFile() && before.nlink === 1, "PATH_DENIED");
      requireSemantic(before.size > 0 && before.size <= maximumBytes, "MATERIAL_LIMIT");
      const bytes = Buffer.alloc(before.size + 1), length = fs.readSync(fd, bytes, 0, bytes.length, 0), after = fs.fstatSync(fd);
      requireSemantic(length === before.size && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, "DRIFT");
      const current = fs.lstatSync(file);
      requireSemantic(current.isFile() && current.nlink === 1 && current.dev === before.dev && current.ino === before.ino &&
        current.size === before.size && current.mtimeMs === before.mtimeMs && current.ctimeMs === before.ctimeMs, "DRIFT");
      directories.forEach((directory, index) => {
        const finalDir = fs.lstatSync(directory), beforeDir = parents[index];
        requireSemantic(finalDir.isDirectory() && !finalDir.isSymbolicLink() && finalDir.dev === beforeDir.dev && finalDir.ino === beforeDir.ino, "DRIFT");
      });
      if (expectedDigest) requireSemantic(expectedDigest === `sha256:${createHash("sha256").update(bytes.subarray(0, length)).digest("hex")}`, "DIGEST_MISMATCH");
      const document = parseSemanticJson(bytes.subarray(0, length));
      return includeBytes ? {document, byteLength: length} : document;
    } catch (error) {
      if (error instanceof SemanticCatalogError) throw error;
      throw new SemanticCatalogError((error as NodeJS.ErrnoException).code === "ENOENT" ? "UNAVAILABLE" : "IO_OR_VALIDATION_FAILED");
    } finally {if (fd !== undefined) fs.closeSync(fd);}
  }
}
