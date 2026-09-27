import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {canonicalJson, digestObject, digestText} from "../../packages/server/dist/domains/harness-template/utils.js";
import {semanticContentPath} from "../../packages/server/dist/domains/harness-template/semantic-catalog-contract.js";
import {readVerifiedSemanticCatalog} from "../../packages/server/dist/domains/harness-template/semantic-catalog-consumer.js";

const signed = (value, field) => {const core = {...value}; delete core[field]; return {...core, [field]: digestObject(core)};};
export async function semanticConsumerFixture(t, suppliedData) {
  const data = suppliedData ? structuredClone(suppliedData) : JSON.parse(await fs.readFile(new URL("../fixtures/semantic-catalog-materials.json", import.meta.url), "utf8"));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "evopilot-composed-consumer-"));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const generation = data.generation, scope = generation.sets[0].scope;
  for (const item of generation.sets[0].refs.harnessAssets) item.entry.assetPath = `./assets/${item.entry.kind}-${item.entry.id}.yaml`;
  const registry = {schema: "evopilot-harness-registry/v2", catalogs: [{id: generation.catalogId, root: ".", enabled: true}]};
  const policy = {schema: "evopilot-harness-semantic-catalog-policy/v1", catalogs: [{id: generation.catalogId, permission: "GRANTED", trustContext: "test-only",
    rootBindingDigest: digestObject({id: generation.catalogId, root: "."}), scopes: [{scope, visibilities: ["PUBLIC", "DOMAIN", "PRIVATE"]}], grants: []}]};
  async function write(relative, document) {
    const file = path.join(root, relative); await fs.mkdir(path.dirname(file), {recursive: true}); await fs.writeFile(file, `${canonicalJson(document)}\n`);
  }
  async function publish() {
    Object.assign(generation, signed(generation, "generationDigest"));
    const receipt = signed({schema: "evopilot-harness-semantic-catalog-receipt/v1", catalogId: generation.catalogId,
      generationDigest: generation.generationDigest, expectedHead: null, action: "PUBLISH", requestDigest: digestText("source-test"),
      authorization: {decision: "AUTHORIZED", actor: "source-test", authorizationDigest: digestText("source-test-authority")}}, "receiptDigest");
    const pointer = signed({schema: "evopilot-harness-semantic-catalog-pointer/v1", catalogId: generation.catalogId,
      generationPath: semanticContentPath("generations", generation.generationDigest), generationDigest: generation.generationDigest,
      previousPointerDigest: null, receiptDigest: receipt.receiptDigest}, "pointerDigest");
    for (const [relative, document] of Object.entries(data.materials)) await write(relative, document);
    await write(pointer.generationPath, generation); await write(semanticContentPath("receipts", receipt.receiptDigest), receipt); await write("SEMANTIC-CATALOG.json", pointer);
    const refs = generation.sets[0].refs.harnessAssets;
    for (const item of refs) await write(item.entry.assetPath, data.materials[generation.entries.find(entry => entry.objectDigest === item.ref).path]);
    const index = signed({schema: "evopilot-harness-catalog/v3", catalogId: generation.catalogId, generatedBy: "source-synthetic-test",
      assetApiVersion: "harness.evopilot.io/v3", entryCount: refs.length, entries: refs.map(item => item.entry)}, "catalogDigest");
    const markdown = "# Synthetic only\n\n```yaml evopilot-harness-catalog-v3\n" + JSON.stringify(index, null, 2) + "\n```\n";
    await fs.writeFile(path.join(root, "CATALOG.md"), markdown); await write("catalog.lock.json", {...index, markdownDigest: digestText(markdown)});
    policy.catalogs[0].grants = generation.entries.filter(entry => entry.category === "ASSET" && !entry.parent).map(entry => ({...entry.publication,
      subjectDigest: entry.objectDigest, purpose: "ASSET_PUBLICATION", revoked: false, expiresAt: null}));
    policy.catalogs[0].grants.push({...receipt.authorization, subjectDigest: digestObject({catalogId: receipt.catalogId, generationDigest: receipt.generationDigest,
      expectedHead: receipt.expectedHead, action: receipt.action, requestDigest: receipt.requestDigest}), purpose: "CATALOG_PUBLICATION", revoked: false, expiresAt: null});
    await write("registry.yaml", registry); await write("policy.json", policy);
  }
  const currentSubject = () => ({scope, role: "viewer", active: true});
  const read = (overrides = {}) => readVerifiedSemanticCatalog({catalogId: generation.catalogId, registryConfigPath: path.join(root, "registry.yaml"),
    policyPath: path.join(root, "policy.json"), currentSubject, ...overrides});
  await publish(); return {root, generation, policy, registry, data, currentSubject, publish, read, write};
}
