import {canonicalJson, digestObject, digestText, isRecord} from "./utils.js";
import {parseSemanticJson, requireSemantic, resolveSemanticLimits} from "./semantic-catalog-contract.js";
import {parseSemanticYaml} from "./semantic-catalog-configuration.js";
import {redactSemanticError, type SemanticOperation} from "./semantic-catalog-io.js";
import type {SemanticSnapshot} from "./semantic-catalog-reader.js";
import {validateSemanticDocument} from "./semantic-schema-validation.js";

type Doc = Record<string, unknown>;
const obj = (value: unknown): Doc => {requireSemantic(isRecord(value), "MATERIAL_INVALID"); return value;};
const same = (a: unknown, b: unknown) => requireSemantic(a !== undefined && b !== undefined && canonicalJson(a) === canonicalJson(b), "MATERIAL_INVALID");
const key = (entry: Doc) => `${entry.kind}:${entry.id}@${entry.version}`;
function assetPath(value: unknown) {
  requireSemantic(typeof value === "string", "PATH_DENIED");
  const relative = value.startsWith("./") ? value.slice(2) : value;
  requireSemantic(/^(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+$/.test(relative) && relative.split("/").every(part => part !== "." && part !== ".."), "PATH_DENIED");
  return relative;
}

/** Internal read-only membership check. files MUST be the already authorized
 * Catalog root capability from openSemanticRoot; operation MUST be the same
 * whole-snapshot deadline. Neither may come from request data. This function
 * does not establish permission, complete semantic eligibility or publication.
 */
export async function inspectSemanticLegacyMembership(input: {
  snapshot: SemanticSnapshot;
  files: {read(relative: string, maxBytes: number): Promise<{bytes: Buffer}>};
  operation: Pick<SemanticOperation, "check">;
}) {
  const {snapshot, files, operation} = input, limits = resolveSemanticLimits(snapshot.limits);
  try {
    operation.check();
    const lockedBytes = (await files.read("catalog.lock.json", limits.generationBytes)).bytes;
    const lock = obj(parseSemanticJson(lockedBytes));
    const markdownBytes = (await files.read("CATALOG.md", limits.generationBytes)).bytes;
    const markdown = new TextDecoder("utf-8", {fatal: true}).decode(markdownBytes);
    requireSemantic(digestText(markdown) === lock.markdownDigest, "DIGEST_MISMATCH");
    const blocks = [...markdown.matchAll(/```yaml\s+evopilot-harness-catalog-v3\r?\n([\s\S]*?)\r?\n```/g)];
    requireSemantic(blocks.length === 1, "INVALID");
    const {markdownDigest, ...lockedIndex} = lock;
    same(parseSemanticYaml(Buffer.from(blocks[0][1], "utf8")), lockedIndex);
    requireSemantic(lock.schema === "evopilot-harness-catalog/v3" && lock.assetApiVersion === "harness.evopilot.io/v3" &&
      lock.catalogId === snapshot.catalogId && Array.isArray(lock.entries), "UNSUPPORTED");
    requireSemantic(lock.entryCount === lock.entries.length && lock.entries.length <= limits.entries, "ENTRY_LIMIT");
    const {schema, catalogId, generatedBy, assetApiVersion, entryCount, entries} = lock;
    requireSemantic(lock.catalogDigest === digestObject({schema, catalogId, generatedBy, assetApiVersion, entryCount, entries}), "DIGEST_MISMATCH");
    const byKey = new Map<string, Doc>();
    for (const item of lock.entries) {
      const entry = obj(item), id = key(entry);
      requireSemantic(!byKey.has(id), "IDENTITY_CONFLICT"); byKey.set(id, entry);
    }
    const semanticEntries = new Map(snapshot.generation.entries.map(entry => [canonicalJson([entry.scope, entry.objectDigest]), entry]));
    const sets = snapshot.generation.sets; requireSemantic(Array.isArray(sets), "MATERIAL_MISSING");
    const assets: {entry: Doc; document: Doc; relative: string}[] = [];
    // Check every requested membership/path before opening any legacy asset.
    for (const set of sets) {
      requireSemantic(Array.isArray(set.refs.harnessAssets), "MATERIAL_MISSING");
      const identities = new Set<string>();
      for (const value of set.refs.harnessAssets) {
        const ref = obj(value), entry = obj(ref.entry), id = key(entry);
        requireSemantic(!identities.has(id), "IDENTITY_CONFLICT"); identities.add(id);
        same(byKey.get(id), entry); same(entry.lifecycle, "published");
        const semanticEntry = semanticEntries.get(canonicalJson([set.scope, ref.ref]));
        requireSemantic(semanticEntry && !semanticEntry.parent, "MATERIAL_MISSING");
        const document = obj(snapshot.materials.get(semanticEntry.path)), metadata = obj(document.metadata);
        validateSemanticDocument(document);
        same(document.apiVersion, "harness.evopilot.io/v3"); same(document.kind, entry.kind);
        same(metadata.id, entry.id); same(metadata.version, entry.version); same(metadata.lifecycle, "published");
        requireSemantic(entry.assetDigest === digestObject(document) && ref.ref === entry.assetDigest, "DIGEST_MISMATCH");
        assets.push({entry, document, relative: assetPath(entry.assetPath)});
      }
    }
    const checked = new Map<string, unknown>();
    // Account for both the already-read semantic material files and distinct v3
    // file reads; duplicate references to the same physical path are read once.
    let totalBytes = [...new Map(snapshot.generation.entries.map(entry => [entry.path, entry.bytes])).values()].reduce((sum, bytes) => sum + bytes, 0);
    requireSemantic(totalBytes <= limits.totalMaterialBytes, "TOTAL_MATERIAL_LIMIT");
    for (const {entry, document, relative} of assets) {
      operation.check();
      if (!checked.has(relative)) {
        requireSemantic(totalBytes < limits.totalMaterialBytes, "TOTAL_MATERIAL_LIMIT");
        const {bytes} = await files.read(relative, Math.min(limits.materialBytes, limits.totalMaterialBytes - totalBytes));
        totalBytes += bytes.length;
        checked.set(relative, parseSemanticYaml(bytes));
      }
      same(checked.get(relative), document);
      requireSemantic(digestObject(checked.get(relative)) === entry.assetDigest, "DIGEST_MISMATCH");
    }
    operation.check();
    const afterLock = (await files.read("catalog.lock.json", limits.generationBytes)).bytes;
    const afterMarkdown = (await files.read("CATALOG.md", limits.generationBytes)).bytes;
    requireSemantic(lockedBytes.equals(afterLock) && markdownBytes.equals(afterMarkdown), "DRIFT");
    operation.check();
    return Object.freeze({status: "LEGACY_MEMBERSHIP_INSPECTED" as const, eligibleForExecution: false as const,
      catalogDigest: lock.catalogDigest, markdownDigest, assetFiles: checked.size, totalMaterialBytes: totalBytes});
  } catch (error) {throw redactSemanticError(error);}
}
